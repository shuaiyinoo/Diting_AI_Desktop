/**
 * Chat 模式状态管理
 *
 * 与 agent.js 同构的多会话隔离架构：
 * - messagesBySession: 按 sessionId 索引的消息 Map
 * - streamingSessions: 正在流式的 sessionId 集合
 * - abortControllers: 按 sessionId 索引的 AbortController Map（非响应式）
 *
 * currentSessionId 从 tabStore 派生，切换 Tab 时自动切换到对应会话的数据。
 * 组件卸载不中断流式请求（SSE 在 store 中运行）。
 */

import { defineStore } from 'pinia'
import { ref, computed, reactive, watch } from 'vue'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'
import { useTabStore } from './tab'
import i18n from '@/i18n'

export const useChatStore = defineStore('chat', () => {
  // ===== State =====

  /** 多会话隔离：消息按 sessionId 分组存储 */
  const messagesBySession = ref({})

  /** 多会话隔离：每个会话最后选择的知识库 folderId */
  const folderIdBySession = ref({})

  /** 多会话隔离：每个会话最后选择的知识库范围 */
  const kbScopeBySession = ref({})

  /** 多会话隔离：流式状态按 sessionId 跟踪 */
  const streamingSessions = ref(new Set())

  /** 多会话隔离：AbortController 按 sessionId 索引（非响应式） */
  const abortControllers = new Map()

  // ===== Getters（从 tabStore 派生当前会话） =====

  /** 当前会话 ID：从 tabStore 的活跃标签派生 */
  const currentSessionId = computed(() => {
    const tabStore = useTabStore()
    const tab = tabStore.activeTab
    if (tab && tab.type === 'chat') return tab.sessionId
    return null
  })

  /**
   * 当前会话的消息列表
   * 使用 ref 而非 computed：computed 在数组 push 时返回相同引用，
   * Vue 会跳过下游更新，导致流式内容不实时显示。
   * ref 在 push 时会触发更新，确保流式内容实时渲染。
   */
  const messages = ref([])

  /**
   * 同步当前会话的消息到 messages ref
   * 当 currentSessionId 变化时触发，确保 messages ref 指向正确的会话消息数组
   */
  function syncMessages() {
    const sid = currentSessionId.value
    if (sid && messagesBySession.value[sid]) {
      messages.value = messagesBySession.value[sid]
    } else {
      messages.value = []
    }
  }

  // 监听 currentSessionId 变化，同步消息
  watch(currentSessionId, () => syncMessages(), { immediate: true })

  /** 当前会话是否正在流式输出 */
  const isStreaming = computed(() =>
    streamingSessions.value.has(currentSessionId.value),
  )

  // ===== Actions =====

  /**
   * 加载指定会话的消息（写入 messagesBySession Map）
   * @param {string} sessionId - 会话 ID
   */
  async function loadMessages(sessionId) {
    try {
      const res = await ipc.invoke(ipcApiRoute.assistant.getConversationContext, {
        sessionId,
        recentLimit: 50,
      })
      if (res.code === 0 && res.data?.recentMessages) {
        const loaded = res.data.recentMessages.map((m) => ({
          id: m.messageId ?? m.id,
          role: String(m.role).toLowerCase(),
          content: m.content,
          citations: m.citations || [],
          pending: false,
          time: m.createdAt ? formatTime(new Date(m.createdAt)) : '',
        }))
        messagesBySession.value[sessionId] = loaded
        // 同步到 messages ref
        if (sessionId === currentSessionId.value) {
          messages.value = loaded
        }
      }
    } catch (err) {
      console.error('[ChatStore] 加载会话消息失败:', err)
    }
  }

  /**
   * 发送消息（流式 SSE）
   * 支持多会话并行：每个会话有独立的消息列表和流式状态。
   * @param {Object} params - { text, sessionId, httpServerUrl, onScroll }
   */
  async function sendMessage(params) {
    const { text, httpServerUrl, onScroll, toolMode, folderId, kbScope } = params

    // ===== 流式同步 hook：通知 Mobile 开始发送 =====
    let sessionId = currentSessionId.value

    // 获取或创建会话
    if (!sessionId) {
      // 通过 workspace store 创建会话
      const { useWorkspaceStore } = await import('./workspace')
      const ws = useWorkspaceStore()
      const session = await ws.createChatSession()
      sessionId = session?.id
      if (!sessionId) {
        console.error('[ChatStore] 创建会话失败，sessionId 为空')
        return
      }
      // 通过 Tab 打开新创建的会话
      const tabStore = useTabStore()
      tabStore.openSessionTab('chat', sessionId, session?.title || 'Chat')
    }

    // 初始化该会话的消息数组（如果不存在）
    if (!messagesBySession.value[sessionId]) {
      messagesBySession.value[sessionId] = []
    }
    const sessionMessages = messagesBySession.value[sessionId]
    // 同步到 messages ref（确保当前会话的消息变更能触发组件渲染）
    if (sessionId === currentSessionId.value) {
      messages.value = sessionMessages
    }

    // 添加用户消息
    const now = new Date()
    sessionMessages.push({
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      time: formatTime(now),
    })

    // 标记该会话为流式中
    streamingSessions.value.add(sessionId)

    // 创建助手消息
    const assistantMsg = reactive({
      id: `msg-${Date.now()}-ai`,
      role: 'assistant',
      content: '',
      pending: true,
      time: formatTime(now),
      citations: [],
    })
    sessionMessages.push(assistantMsg)
    onScroll?.()

    // ===== 流式同步 hook：推送发送开始 =====
    ipc.invoke(ipcApiRoute.streamSync.onSendStarted, {
      sessionType: 'chat',
      sessionId: String(sessionId),
      userMessage: text,
      assistantMessageId: assistantMsg.id,
    }).catch(() => {})

    // SSE 请求
    const url = `${httpServerUrl}/${ipcApiRoute.assistant.streamChat}`
    const controller = new AbortController()
    abortControllers.set(sessionId, controller)

    // 构造请求体（KB_SEARCH 模式必须包含 folderId）
    const requestBody = {
      sessionId,
      message: text,
      toolMode: toolMode || 'CHAT',
    }
    if (folderId) {
      requestBody.folderId = folderId
    }
    if (kbScope) {
      requestBody.kbScope = kbScope
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => i18n.global.t('storeMsg.requestFailed'))
        throw new Error(errText || `HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        // SSE 事件以 \n\n 分隔
        let separatorIndex = buffer.indexOf('\n\n')
        while (separatorIndex >= 0) {
          const rawEvent = buffer.slice(0, separatorIndex)
          buffer = buffer.slice(separatorIndex + 2)
          dispatchSseEvent(rawEvent, assistantMsg, sessionId)
          separatorIndex = buffer.indexOf('\n\n')
        }
        if (onScroll) {
          requestAnimationFrame(() => onScroll())
        }
      }

      // 流结束
      assistantMsg.pending = false
      // ===== 流式同步 hook：推送流式结束 =====
      ipc.invoke(ipcApiRoute.streamSync.onStreamEnd, {
        sessionType: 'chat',
        sessionId: String(sessionId),
        assistantMessageId: assistantMsg.id,
        finalContent: assistantMsg.content,
      }).catch(() => {})
    } catch (err) {
      if (err?.name === 'AbortError') {
        assistantMsg.pending = false
        // 用户主动取消，不显示错误
        if (!assistantMsg.content) {
          assistantMsg.content = i18n.global.t('storeMsg.stopped')
        }
        // ===== 流式同步 hook：推送取消 =====
        ipc.invoke(ipcApiRoute.streamSync.onStreamEnd, {
          sessionType: 'chat',
          sessionId: String(sessionId),
          assistantMessageId: assistantMsg.id,
          finalContent: assistantMsg.content,
        }).catch(() => {})
      } else {
        console.error('[ChatStore] sendMessage 异常:', err)
        assistantMsg.content = i18n.global.t('storeMsg.sendFailed', { msg: err?.message || String(err) })
        // ===== 流式同步 hook：推送错误 =====
        ipc.invoke(ipcApiRoute.streamSync.onStreamError, {
          sessionType: 'chat',
          sessionId: String(sessionId),
          assistantMessageId: assistantMsg.id,
          error: err?.message || String(err),
        }).catch(() => {})
      }
    } finally {
      streamingSessions.value.delete(sessionId)
      abortControllers.delete(sessionId)
      onScroll?.()
    }
  }

  /** 停止当前会话的生成 */
  function stopGeneration() {
    const sid = currentSessionId.value
    if (sid && abortControllers.has(sid)) {
      abortControllers.get(sid).abort()
    }
  }

  /** 设置当前会话选择的知识库 folderId */
  function setSessionFolderId(folderId) {
    const sid = currentSessionId.value
    if (!sid) return
    if (folderId) {
      folderIdBySession.value[sid] = folderId
    } else {
      delete folderIdBySession.value[sid]
    }
  }

  /** 获取指定会话的记忆 folderId */
  function getSessionFolderId(sessionId) {
    return folderIdBySession.value[sessionId] ?? null
  }

  /** 设置当前会话选择的知识库范围 */
  function setSessionKbScope(scope) {
    const sid = currentSessionId.value
    if (!sid) return
    if (scope) {
      kbScopeBySession.value[sid] = scope
    } else {
      delete kbScopeBySession.value[sid]
    }
  }

  /** 获取指定会话的知识库范围 */
  function getSessionKbScope(sessionId) {
    return kbScopeBySession.value[sessionId] ?? null
  }

  /** 删除会话时清理状态 */
  function cleanupSession(sessionId) {
    // 清理消息
    delete messagesBySession.value[sessionId]
    // 清理知识库记忆
    delete folderIdBySession.value[sessionId]
    delete kbScopeBySession.value[sessionId]
    // 如果删除的是当前会话，清空 messages ref
    if (sessionId === currentSessionId.value) {
      messages.value = []
    }
    // 清理 AbortController
    if (abortControllers.has(sessionId)) {
      abortControllers.get(sessionId).abort()
      abortControllers.delete(sessionId)
    }
    // 清理流式状态
    streamingSessions.value.delete(sessionId)
  }

  /**
   * 解析并分发单条 SSE 事件
   * @param {string} rawEvent - 原始 SSE 事件字符串
   * @param {Object} assistantMsg - 助手消息对象（reactive）
   */
  function dispatchSseEvent(rawEvent, assistantMsg, sessionId) {
    const lines = rawEvent.split(/\r?\n/)
    let eventName = ''
    const dataLines = []

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim()
        continue
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim())
      }
    }

    if (dataLines.length === 0) return
    const rawData = dataLines.join('\n')

    // 解析 data，供流式同步使用
    let parsedData = null
    try {
      parsedData = JSON.parse(rawData)
    } catch {
      parsedData = rawData
    }

    switch (eventName) {
      case 'start':
        break
      case 'token':
        if (parsedData && parsedData.delta) {
          assistantMsg.content += parsedData.delta
          // ===== 流式同步 hook：推送 token =====
          ipc.invoke(ipcApiRoute.streamSync.onToken, {
            sessionType: 'chat',
            sessionId: String(sessionId),
            delta: parsedData.delta,
            assistantMessageId: assistantMsg.id,
          }).catch(() => {})
        } else {
          assistantMsg.content += rawData
        }
        break
      case 'citations':
        // KB_SEARCH 模式：流开始前发送引用证据
        if (parsedData && parsedData.citations && Array.isArray(parsedData.citations) && parsedData.citations.length > 0) {
          assistantMsg.citations = parsedData.citations
        }
        // ===== 流式同步 hook：推送 citations 事件 =====
        ipc.invoke(ipcApiRoute.streamSync.onSseEvent, {
          sessionType: 'chat',
          sessionId: String(sessionId),
          event: eventName,
          eventData: parsedData,
          assistantMessageId: assistantMsg.id,
        }).catch(() => {})
        break
      case 'complete':
        if (parsedData) {
          if (parsedData.reply && !assistantMsg.content) {
            assistantMsg.content = parsedData.reply
          }
          if (parsedData.citations && Array.isArray(parsedData.citations) && parsedData.citations.length > 0) {
            assistantMsg.citations = parsedData.citations
          }
        }
        // ===== 流式同步 hook：推送 complete 事件 =====
        ipc.invoke(ipcApiRoute.streamSync.onSseEvent, {
          sessionType: 'chat',
          sessionId: String(sessionId),
          event: eventName,
          eventData: parsedData,
          assistantMessageId: assistantMsg.id,
        }).catch(() => {})
        break
      case 'error':
        if (parsedData && parsedData.error) {
          assistantMsg.content = `错误: ${parsedData.error}`
        } else {
          assistantMsg.content = `错误: ${rawData}`
        }
        // ===== 流式同步 hook：推送 error 事件 =====
        ipc.invoke(ipcApiRoute.streamSync.onSseEvent, {
          sessionType: 'chat',
          sessionId: String(sessionId),
          event: eventName,
          eventData: parsedData,
          assistantMessageId: assistantMsg.id,
        }).catch(() => {})
        break
      default:
        // 其他未知事件也推送，接收端可选择处理或忽略
        ipc.invoke(ipcApiRoute.streamSync.onSseEvent, {
          sessionType: 'chat',
          sessionId: String(sessionId),
          event: eventName,
          eventData: parsedData,
          assistantMessageId: assistantMsg.id,
        }).catch(() => {})
        break
    }
  }

  // ===== Mobile 代发消息监听 =====
  // Mobile 通过 STOMP 请求 Desktop 代为发送消息，主进程通过 IPC 转发到前端
  if (ipc) {
    ipc.on('streamSync:mobileRequest', async (_event, req) => {
      if (!req || !req.message) return
      // 切换到对应会话（如果存在）然后发送
      const sid = Number(req.sessionId)
      if (!sid) return

      // 动态获取 HTTP 服务器地址（与 view 层 loadHttpServerUrl 逻辑一致）
      let httpServerUrl = 'http://127.0.0.1:7071'
      try {
        const data = await ipc.invoke(ipcApiRoute.framework.checkHttpServer)
        if (data && data.enable && data.server) {
          httpServerUrl = data.server
        }
      } catch {
        // 使用默认地址
      }

      // 切换到目标会话（通过 tabStore，currentSessionId 是 computed 不可直接赋值）
      const { useWorkspaceStore } = await import('./workspace')
      const ws = useWorkspaceStore()
      const session = ws.chatSessions.find((s) => s.id === sid)
      const tabStore = useTabStore()
      tabStore.openSessionTab('chat', sid, session?.title || 'Chat')

      // 确保 messagesBySession 存在
      if (!messagesBySession.value[sid]) {
        messagesBySession.value[sid] = []
      }
      // messages ref 由 watch(currentSessionId) 自动同步，无需手动赋值

      sendMessage({
        text: req.message,
        httpServerUrl,
        toolMode: req.toolMode || 'CHAT',
        folderId: req.folderId,
        kbScope: req.kbScope,
      })
    })
  }

    return {
      // State
      messagesBySession,
      folderIdBySession,
      kbScopeBySession,
      streamingSessions,
      // Getters
      currentSessionId,
      messages,
      isStreaming,
      // Actions
      loadMessages,
      sendMessage,
      stopGeneration,
      cleanupSession,
      setSessionFolderId,
      getSessionFolderId,
      setSessionKbScope,
      getSessionKbScope,
    }
})

// ===== 工具函数 =====

function formatTime(date) {
  const y = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`
}
