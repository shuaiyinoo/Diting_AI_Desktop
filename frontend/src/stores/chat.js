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

    // 获取或创建会话
    let sessionId = currentSessionId.value
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
    console.log('[ChatStore] SSE 请求体:', JSON.stringify(requestBody))

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => '请求失败')
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
          dispatchSseEvent(rawEvent, assistantMsg)
          separatorIndex = buffer.indexOf('\n\n')
        }
        if (onScroll) {
          requestAnimationFrame(() => onScroll())
        }
      }

      // 流结束
      assistantMsg.pending = false
    } catch (err) {
      if (err?.name === 'AbortError') {
        assistantMsg.pending = false
        // 用户主动取消，不显示错误
        if (!assistantMsg.content) {
          assistantMsg.content = '已停止生成'
        }
      } else {
        console.error('[ChatStore] sendMessage 异常:', err)
        assistantMsg.content = `发送失败: ${err?.message || String(err)}`
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
  function dispatchSseEvent(rawEvent, assistantMsg) {
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

    switch (eventName) {
      case 'start':
        break
      case 'token':
        try {
          const data = JSON.parse(rawData)
          if (data.delta) {
            assistantMsg.content += data.delta
          }
        } catch {
          assistantMsg.content += rawData
        }
        break
      case 'citations':
        // KB_SEARCH 模式：流开始前发送引用证据
        try {
          const data = JSON.parse(rawData)
          if (data.citations && Array.isArray(data.citations) && data.citations.length > 0) {
            assistantMsg.citations = data.citations
          }
        } catch {
          // 忽略解析失败
        }
        break
      case 'complete':
        try {
          const data = JSON.parse(rawData)
          if (data.reply && !assistantMsg.content) {
            assistantMsg.content = data.reply
          }
          // 解析引用证据（complete 事件也携带 citations）
          if (data.citations && Array.isArray(data.citations) && data.citations.length > 0) {
            assistantMsg.citations = data.citations
          }
        } catch {
          // 忽略解析失败
        }
        break
      case 'error':
        try {
          const data = JSON.parse(rawData)
          assistantMsg.content = `错误: ${data.error || rawData}`
        } catch {
          assistantMsg.content = `错误: ${rawData}`
        }
        break
      default:
        break
    }
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
