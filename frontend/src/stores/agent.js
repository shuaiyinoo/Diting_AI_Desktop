/**
 * Agent 模式状态管理
 *
 * 改造为支持多会话并行的状态隔离：
 * - messagesBySession: 按 sessionId 索引的消息 Map
 * - streamingSessions: 正在流式的 sessionId 集合
 * - abortControllers: 按 sessionId 索引的 AbortController Map
 *
 * currentSessionId 从 tabStore.activeSessionId 派生，
 * 切换 Tab 时自动切换到对应会话的数据。
 */

import { defineStore } from 'pinia'
import { ref, computed, reactive, watch } from 'vue'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'
import { useTabStore } from './tab'

export const useAgentStore = defineStore('agent', () => {
  // ===== State =====
  const sessions = ref([])
  const workspaceSlug = ref(null)
  const skills = ref([])
  const mcpServers = ref([])

  // 多会话隔离：消息按 sessionId 分组存储
  const messagesBySession = ref({})

  // 多会话隔离：权限模式按 sessionId 存储
  const permissionModeBySession = ref({})

  // 多会话隔离：流式状态按 sessionId 跟踪
  const streamingSessions = ref(new Set())

  // 多会话隔离：AbortController 按 sessionId 索引（非响应式）
  const abortControllers = new Map()

  // 多会话隔离：统计定时器按 sessionId 索引（非响应式）
  const statsTimers = new Map()

  // 消息轮询定时器（定时任务后端 headless 发送消息时使用，非响应式）
  const pollingTimers = new Map()

  // ===== Blocks 持久化（按 sessionId 索引，使用 localStorage） =====
  const savedBlocks = ref({})

  /** 从 localStorage 加载 savedBlocks */
  function loadSavedBlocks() {
    try {
      const raw = localStorage.getItem('agent:savedBlocks')
      if (raw) savedBlocks.value = JSON.parse(raw)
    } catch { /* 忽略 */ }
  }

  /** 保存 savedBlocks 到 localStorage */
  function persistSavedBlocks() {
    try {
      const entries = Object.entries(savedBlocks.value)
      const recent = entries.slice(-20)
      localStorage.setItem('agent:savedBlocks', JSON.stringify(Object.fromEntries(recent)))
    } catch { /* 忽略 */ }
  }

  // 初始化时加载
  loadSavedBlocks()

  // ===== 协作子 Agent 状态（按 sessionId 分组） =====
  const allDelegations = ref({})

  // ===== Token / 时间统计（每条助手消息独立） =====
  const messageStats = ref({})

  // ===== 待发送提示词（Todo 启动 Agent 时设置，AgentView 加载后消费） =====
  const pendingPrompt = ref(null)

  // ===== Getters（从 tabStore 派生当前会话） =====

  /** 当前会话 ID：从 tabStore 的活跃标签派生 */
  const currentSessionId = computed(() => {
    const tabStore = useTabStore()
    const tab = tabStore.activeTab
    if (tab && tab.type === 'agent') return tab.sessionId
    return null
  })

  /** 当前会话对象 */
  const currentSession = computed(() =>
    sessions.value.find((s) => s.id === currentSessionId.value),
  )

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

/** 当前会话的权限模式 */
const permissionMode = computed({
get: () => permissionModeBySession.value[currentSessionId.value] || 'bypassPermissions',
set: (val) => {
  if (currentSessionId.value) {
    permissionModeBySession.value[currentSessionId.value] = val
  }
},
})

  const enabledSkills = computed(() =>
    skills.value.filter((s) => s.enabled),
  )

  const enabledMcpServers = computed(() =>
    mcpServers.value.filter((m) => m.enabled && m.available),
  )

  // ===== Actions =====

  /** 加载会话列表 */
  async function loadSessions() {
    try {
      const res = await ipc.invoke('controller/piAgent/sessionOperation', {
        action: 'list',
      })
      if (res.code === 0 && res.data) {
        sessions.value = res.data
      }
    } catch (err) {
      console.error('[AgentStore] 加载会话列表失败:', err)
    }
  }

  /** 创建会话 */
  async function createSession(title, workspaceId) {
    try {
      const res = await ipc.invoke('controller/piAgent/sessionOperation', {
        action: 'create',
        title: title || `Agent 会话 ${sessions.value.length + 1}`,
        workspaceId: workspaceId,
      })
      if (res.code === 0 && res.data) {
        sessions.value.unshift(res.data)
        await selectSession(res.data.id)
        return res.data
      }
    } catch (err) {
      console.error('[AgentStore] 创建会话失败:', err)
    }
    return null
  }

  /**
   * 选择会话：打开 Tab + 懒加载消息
   * 切换会话时不清空已有消息，而是从 Map 中取对应会话的数据
   */
  async function selectSession(sessionId) {
    const tabStore = useTabStore()
    const session = sessions.value.find((s) => s.id === sessionId)
    const title = session?.title || 'Agent 会话'
    tabStore.openSessionTab('agent', sessionId, title)

    // 懒加载：如果该会话消息未加载过，则从后端加载
    if (!messagesBySession.value[sessionId]) {
      await loadMessages(sessionId)
    }
  }

  /**
   * 加载指定会话的消息（写入 messagesBySession Map）
   * @param {string} sessionId - 会话 ID
   */
  async function loadMessages(sessionId) {
    try {
      const res = await ipc.invoke('controller/piAgent/sessionOperation', {
        action: 'getMessages',
        sessionId,
      })
      if (res.code === 0 && res.data) {
        let assistantCount = 0
        const loaded = res.data.map((m) => {
          const role = String(m.role).toLowerCase()
          let blocks = []
          if (role === 'assistant') {
            const blockKey = `${sessionId}:assistant:${assistantCount}`
            blocks = savedBlocks.value[blockKey] || []
            assistantCount++
          }
          return {
            id: m.id ?? m.messageId ?? `msg-${Date.now()}-${Math.random()}`,
            role,
            content: typeof m.content === 'string' ? m.content : extractTextFromContent(m.content),
            blocks,
            pending: false,
            time: m.timestamp ? formatTime(new Date(m.timestamp)) : (m.time || ''),
          }
        })
        messagesBySession.value[sessionId] = loaded
        // 同步到 messages ref
        if (sessionId === currentSessionId.value) {
          messages.value = loaded
        }
      }
    } catch (err) {
      console.error('[AgentStore] 加载会话消息失败:', err)
    }
  }

  /** 删除会话 */
  async function deleteSession(sessionId) {
    try {
      const res = await ipc.invoke('controller/piAgent/sessionOperation', {
        action: 'delete',
        sessionId,
      })
      if (res.code === 0) {
        sessions.value = sessions.value.filter((s) => s.id !== sessionId)
        // 清理该会的消息
        delete messagesBySession.value[sessionId]
        // 如果删除的是当前会话，清空 messages ref
        if (sessionId === currentSessionId.value) {
          messages.value = []
        }
        // 清理 AbortController
        if (abortControllers.has(sessionId)) {
          abortControllers.get(sessionId).abort()
          abortControllers.delete(sessionId)
        }
        // 清理统计定时器
        if (statsTimers.has(sessionId)) {
          clearInterval(statsTimers.get(sessionId))
          statsTimers.delete(sessionId)
        }
        // 清理消息轮询定时器
        stopMessagePolling(sessionId)
        // 清理流式状态
        streamingSessions.value.delete(sessionId)
        // 关闭对应的 Tab
        const tabStore = useTabStore()
        tabStore.closeTab(sessionId)
      }
    } catch (err) {
      console.error('[AgentStore] 删除会话失败:', err)
    }
  }

  /**
   * 发送消息（流式 SSE）
   * 支持多会话并行：每个会话有独立的消息列表和流式状态。
   * @param {Object} params - { text, sessionId, model, workspaceSlug, httpServerUrl, onScroll, onEvent }
   */
  async function sendMessage(params) {
    const { text, model, workspaceSlug: wsSlug, httpServerUrl, onScroll, onEvent, permissionMode, thinkingLevel } = params

    // 获取或创建会话
    let sessionId = currentSessionId.value
    if (!sessionId) {
      try {
        const res = await ipc.invoke(ipcApiRoute.piAgent.sessionOperation, {
          action: 'create',
          title: `Agent 会话 ${sessions.value.length + 1}`,
          workspaceId: params.workspaceId,
        })
        if (res.code === 0 && res.data) {
          sessions.value.unshift(res.data)
          sessionId = res.data.id
          // 通过 Tab 打开新创建的会话
          const tabStore = useTabStore()
          tabStore.openSessionTab('agent', sessionId, res.data.title || 'Agent 会话')
        }
      } catch (err) {
        console.error('[AgentStore] 创建 Agent 会话失败:', err)
        return
      }
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
    sessionMessages.push({
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      blocks: [],
      time: formatTime(new Date()),
    })

    // 标记该会话为流式中
    streamingSessions.value.add(sessionId)

    // 创建助手消息
    const assistantMsg = reactive({
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      blocks: [],
      pending: true,
      time: formatTime(new Date()),
    })
    sessionMessages.push(assistantMsg)
    onScroll?.()

    // 为当前助手消息初始化统计
    const statsKey = assistantMsg.id
    messageStats.value[statsKey] = {
      startTime: Date.now(),
      elapsed: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }
    // 按 sessionId 管理统计定时器
    if (statsTimers.has(sessionId)) {
      clearInterval(statsTimers.get(sessionId))
    }
    statsTimers.set(sessionId, setInterval(() => {
      const s = messageStats.value[statsKey]
      if (s) {
        s.elapsed = Math.floor((Date.now() - s.startTime) / 1000)
      }
    }, 1000))

    // SSE 请求
    const url = `${httpServerUrl}/${ipcApiRoute.piAgent.streamAgent}`
    const controller = new AbortController()
    abortControllers.set(sessionId, controller)

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: text,
          model,
          workspaceSlug: wsSlug || undefined,
          permissionMode: permissionMode || undefined,
          thinkingLevel: thinkingLevel || undefined,
        }),
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
        let separatorIndex = buffer.indexOf('\n\n')
        while (separatorIndex >= 0) {
          const rawEvent = buffer.slice(0, separatorIndex)
          buffer = buffer.slice(separatorIndex + 2)
          dispatchSseEvent(rawEvent, assistantMsg, sessionId, onEvent)
          separatorIndex = buffer.indexOf('\n\n')
        }
        if (onScroll) {
          requestAnimationFrame(() => onScroll())
        }
      }

      assistantMsg.pending = false
      // 持久化 blocks
      const msgIndex = sessionMessages.filter((m) => m.role === 'assistant').length - 1
      const blockKey = `${sessionId}:assistant:${msgIndex}`
      if (assistantMsg.blocks.length > 0) {
        savedBlocks.value[blockKey] = JSON.parse(JSON.stringify(assistantMsg.blocks))
        persistSavedBlocks()
      }
      // 清理统计定时器
      if (statsTimers.has(sessionId)) {
        clearInterval(statsTimers.get(sessionId))
        statsTimers.delete(sessionId)
      }
      const s = messageStats.value[assistantMsg.id]
      if (s) s.elapsed = Math.floor((Date.now() - s.startTime) / 1000)
    } catch (err) {
      if (err?.name === 'AbortError') {
        assistantMsg.pending = false
        const msgIndex = sessionMessages.filter((m) => m.role === 'assistant').length - 1
        const blockKey = `${sessionId}:assistant:${msgIndex}`
        if (assistantMsg.blocks.length > 0) {
          savedBlocks.value[blockKey] = JSON.parse(JSON.stringify(assistantMsg.blocks))
          persistSavedBlocks()
        }
        if (!assistantMsg.content && assistantMsg.blocks.length === 0) {
          assistantMsg.content = '已停止生成'
        }
      } else {
        console.error('[AgentStore] sendMessage 异常:', err)
        assistantMsg.content = `发送失败: ${err?.message || String(err)}`
      }
      // 清理统计定时器
      if (statsTimers.has(sessionId)) {
        clearInterval(statsTimers.get(sessionId))
        statsTimers.delete(sessionId)
      }
      const s = messageStats.value[assistantMsg.id]
      if (s) s.elapsed = Math.floor((Date.now() - s.startTime) / 1000)
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
    if (sid) {
      ipc.invoke('controller/piAgent/stopAllDelegations', { sessionId: sid }).catch(() => {})
    }
  }

  /**
   * 解析并分发单条 SSE 事件
   * @param {string} rawEvent - 原始 SSE 事件字符串
   * @param {Object} assistantMsg - 助手消息对象（reactive）
   * @param {string} sessionId - 当前会话 ID
   * @param {Function} onEvent - 事件回调
   */
  function dispatchSseEvent(rawEvent, assistantMsg, sessionId, onEvent) {
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

    let data
    try {
      data = JSON.parse(rawData)
    } catch {
      return
    }

    switch (eventName) {
      case 'text':
        if (data.delta) assistantMsg.content += data.delta
        break

      case 'thinking':
        if (data.delta) {
          const blocks = assistantMsg.blocks
          const last = blocks[blocks.length - 1]
          if (last?.type === 'thinking') {
            last.thinking += data.delta
          } else {
            blocks.push({ type: 'thinking', thinking: data.delta })
          }
        }
        break

      case 'thinking_start': {
        const blocks = assistantMsg.blocks
        const last = blocks[blocks.length - 1]
        if (!last || last.type !== 'thinking') {
          blocks.push({ type: 'thinking', thinking: '' })
        }
        break
      }

      case 'text_start': {
        const blocks = assistantMsg.blocks
        const last = blocks[blocks.length - 1]
        if (last?.type === 'text') {
          // 已有 text 块，不新建
        } else {
          blocks.push({ type: 'text', text: '' })
        }
        break
      }

      case 'tool_start':
        console.log('[Agent SSE] tool_start:', data.toolName, data)
        assistantMsg.blocks.push({
          type: 'tool_use',
          toolCallId: data.toolCallId || '',
          name: data.toolName || data.name || '',
          input: data.input || '',
          status: 'running',
          result: '',
        })
        break

      case 'tool_result': {
        const blocks = assistantMsg.blocks
        const targetId = data.toolCallId
        let foundIdx = -1
        if (targetId) {
          for (let i = blocks.length - 1; i >= 0; i--) {
            if (blocks[i].type === 'tool_use' && blocks[i].toolCallId === targetId) {
              foundIdx = i
              break
            }
          }
        }
        if (foundIdx === -1) {
          for (let i = blocks.length - 1; i >= 0; i--) {
            if (blocks[i].type === 'tool_use' && blocks[i].status === 'running') {
              foundIdx = i
              break
            }
          }
        }
        if (foundIdx >= 0) {
          blocks[foundIdx].status = 'done'
          blocks[foundIdx].result = data.result || ''
          blocks[foundIdx].isError = data.isError || false
        }
        break
      }

      case 'usage': {
        // 在当前会话的消息中查找正在流式的助手消息
        const sessionMessages = messagesBySession.value[sessionId] || []
        const curMsg = sessionMessages.find((m) => m.role === 'assistant' && m.pending)
        if (curMsg) {
          const s = messageStats.value[curMsg.id]
          if (s) {
            if (data.inputTokens) s.inputTokens += data.inputTokens
            if (data.outputTokens) s.outputTokens += data.outputTokens
            if (data.cacheReadTokens) s.cacheReadTokens += data.cacheReadTokens
            if (data.cacheWriteTokens) s.cacheWriteTokens += data.cacheWriteTokens
          }
        }
        break
      }

      case 'complete':
        assistantMsg.pending = false
        break

      case 'rag_citations': {
        // SearchKnowledgeBase 工具检索到证据后发送的结构化引用数据
        // 前端据此在助手消息底部渲染 CitationRail 证据卡片
        if (data.citations && Array.isArray(data.citations) && data.citations.length > 0) {
          // 累积合并多次检索的引用（Agent 可能多次调用 SearchKnowledgeBase）
          const existing = assistantMsg.citations || []
          assistantMsg.citations = [...existing, ...data.citations]
        }
        break
      }

      case 'error':
        assistantMsg.pending = false
        assistantMsg.content += `\n\n[错误] ${data.message || '未知错误'}`
        break

      case 'permission_request':
      case 'ask_user':
        onEvent?.(eventName, data)
        break

      case 'delegation_update': {
        const sid = data.sessionId
        if (!allDelegations.value[sid]) allDelegations.value[sid] = []
        const delegation = data.delegation
        if (delegation) {
          const arr = allDelegations.value[sid]
          const idx = arr.findIndex((d) => d.delegationId === delegation.delegationId)
          if (idx >= 0) {
            arr[idx] = delegation
          } else {
            arr.push(delegation)
          }
        }
        onEvent?.(eventName, data)
        break
      }

      case 'delegation_event':
        onEvent?.(eventName, data)
        break
    }
  }

  /** 加载 Skills */
  async function loadSkills() {
    if (!workspaceSlug.value) return
    try {
      const res = await ipc.invoke('controller/piAgent/skillsOperation', {
        action: 'list',
        workspaceSlug: workspaceSlug.value,
      })
      if (res.code === 0 && res.data) {
        skills.value = res.data
      }
    } catch (err) {
      console.error('[AgentStore] 加载 Skills 失败:', err)
    }
  }

  /** 切换 Skill */
  async function toggleSkill(slug, enabled) {
    if (!workspaceSlug.value) return
    try {
      const res = await ipc.invoke('controller/piAgent/skillsOperation', {
        action: 'toggle',
        skillSlug: slug,
        enabled,
        workspaceSlug: workspaceSlug.value,
      })
      if (res.code === 0 && res.data) {
        skills.value = res.data
      }
    } catch (err) {
      console.error('[AgentStore] 切换 Skill 失败:', err)
    }
  }

  /** 加载 MCP 服务器 */
  async function loadMcpServers() {
    try {
      const res = await ipc.invoke('controller/piAgent.mcpOperation', {
        action: 'list',
        workspaceSlug: workspaceSlug.value,
      })
      if (res.code === 0 && res.data) {
        mcpServers.value = res.data
      }
    } catch (err) {
      console.error('[AgentStore] 加载 MCP 服务器失败:', err)
    }
  }

  /** 切换 MCP 开关 */
  async function toggleMcp(id, enabled) {
    try {
      const res = await ipc.invoke('controller/piAgent.mcpOperation', {
        action: 'toggle',
        id,
        enabled,
        workspaceSlug: workspaceSlug.value,
      })
      if (res.code === 0 && res.data) {
        mcpServers.value = res.data
      }
    } catch (err) {
      console.error('[AgentStore] 切换 MCP 失败:', err)
    }
  }

  /** 初始化 Skills */
  async function initSkills() {
    try {
      await ipc.invoke('controller/piAgent.initSkills', {})
    } catch (err) {
      console.error('[AgentStore] 初始化 Skills 失败:', err)
    }
  }

  // ===== 消息轮询（定时任务后端 headless 发送消息时使用） =====

  /**
   * 启动消息轮询
   *
   * 定时任务后端以 headless 模式发送消息（onEvent 不转发到前端），
   * 前端无法订阅 SSE 流，只能通过定期 reload 持久化的消息来获取最新内容。
   *
   * 停止条件（满足任一）：
   * - 连续 3 次轮询消息数量无变化，且已有助手回复
   * - 超过最大持续时间（默认 5 分钟）
   *
   * @param {string} sessionId - 要轮询的会话 ID
   * @param {Object} [options] - 可选参数
   * @param {number} [options.interval=2000] - 轮询间隔（毫秒）
   * @param {number} [options.maxDuration=300000] - 最大持续时间（毫秒）
   */
  function startMessagePolling(sessionId, options = {}) {
    // 先停止已有的轮询
    stopMessagePolling(sessionId)

    const interval = options.interval ?? 2000
    const maxDuration = options.maxDuration ?? 300_000

    let stableCount = 0
    let lastCount = 0
    const startTime = Date.now()

    // 标记为流式中（让 UI 显示「运行中」状态）
    streamingSessions.value.add(sessionId)

    const timer = setInterval(async () => {
      // 超时检查
      if (Date.now() - startTime > maxDuration) {
        console.log(`[AgentStore] 轮询超时（${maxDuration / 1000}s），停止: ${sessionId}`)
        stopMessagePolling(sessionId)
        return
      }

      // 加载最新消息
      await loadMessages(sessionId)
      const currentMessages = messagesBySession.value[sessionId] || []
      const currentCount = currentMessages.length

      if (currentCount === lastCount) {
        stableCount++
        // 连续 3 次无新消息，且已有助手回复 → 认为已完成
        if (stableCount >= 3 && currentCount > 0) {
          const hasAssistantReply = currentMessages.some(
            (m) => m.role === 'assistant' && m.content,
          )
          if (hasAssistantReply) {
            console.log(`[AgentStore] 轮询检测到回复完成，停止: ${sessionId}`)
            stopMessagePolling(sessionId)
            return
          }
        }
      } else {
        // 有新消息，重置稳定计数
        stableCount = 0
        lastCount = currentCount
      }
    }, interval)

    pollingTimers.set(sessionId, timer)
    console.log(`[AgentStore] 启动消息轮询: ${sessionId}，间隔 ${interval}ms`)
  }

  /**
   * 停止消息轮询
   * @param {string} sessionId - 会话 ID
   */
  function stopMessagePolling(sessionId) {
    if (pollingTimers.has(sessionId)) {
      clearInterval(pollingTimers.get(sessionId))
      pollingTimers.delete(sessionId)
    }
    // 移除流式状态
    streamingSessions.value.delete(sessionId)
  }

  return {
    // State
    sessions,
    messagesBySession,
    streamingSessions,
    workspaceSlug,
    skills,
    mcpServers,
    savedBlocks,
    allDelegations,
    messageStats,
    pendingPrompt,
    // Getters
    currentSessionId,
    currentSession,
    messages,
    isStreaming,
    permissionMode,
    enabledSkills,
    enabledMcpServers,
    // Actions
    loadSessions,
    createSession,
    selectSession,
    loadMessages,
    deleteSession,
    sendMessage,
    stopGeneration,
    loadSkills,
    toggleSkill,
    loadMcpServers,
    toggleMcp,
    initSkills,
    startMessagePolling,
    stopMessagePolling,
  }
})

// ===== 工具函数 =====

function extractTextFromContent(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === 'text')
      .map((b) => b.text || '')
      .join('')
  }
  return ''
}

function formatTime(date) {
  const y = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`
}
