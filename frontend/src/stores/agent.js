/**
 * Agent 模式状态管理
 *
 * 流式状态保存在 store 中，组件卸载不中断。
 */

import { defineStore } from 'pinia'
import { ref, computed, reactive } from 'vue'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'

export const useAgentStore = defineStore('agent', () => {
  // ===== State =====
  const sessions = ref([])
  const currentSessionId = ref(null)
  const messages = ref([])
  const isStreaming = ref(false)
  const workspaceSlug = ref(null)
  const skills = ref([])
  const mcpServers = ref([])

  // 流式控制（非响应式，不触发渲染）
  let abortController = null

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
      // 只保存最近 20 条消息的 blocks，避免 localStorage 膨胀
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
  const messageStats = ref({})  // key: messageId → { startTime, elapsed, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }
  let statsTimer = null

  // ===== 待发送提示词（Todo 启动 Agent 时设置，AgentView 加载后消费） =====
  const pendingPrompt = ref(null) // { sessionId, message, workspaceId }

  // ===== Getters =====
  const currentSession = computed(() =>
    sessions.value.find((s) => s.id === currentSessionId.value),
  )

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

  /** 选择会话 */
  async function selectSession(sessionId) {
    currentSessionId.value = sessionId
    messages.value = []
    try {
      const res = await ipc.invoke('controller/piAgent/sessionOperation', {
        action: 'getMessages',
        sessionId,
      })
      if (res.code === 0 && res.data) {
        let assistantCount = 0
        messages.value = res.data.map((m) => {
          const role = String(m.role).toLowerCase()
          // 恢复持久化的 blocks（使用 sessionId + assistant 索引匹配）
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
        if (currentSessionId.value === sessionId) {
          currentSessionId.value = null
          messages.value = []
        }
      }
    } catch (err) {
      console.error('[AgentStore] 删除会话失败:', err)
    }
  }

  /**
   * 发送消息（流式 SSE）
   * 流式状态保存在 store 中，组件卸载不会中断。
   * @param {Object} params - { text, sessionId, model, workspaceSlug, httpServerUrl, onScroll, onEvent }
   */
  async function sendMessage(params) {
    const { text, model, workspaceSlug: wsSlug, httpServerUrl, onScroll, onEvent } = params

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
          currentSessionId.value = res.data.id
          sessionId = res.data.id
        }
      } catch (err) {
        console.error('[AgentStore] 创建 Agent 会话失败:', err)
        return
      }
    }

    // 添加用户消息
    messages.value.push({
      id: `msg-${Date.now()}`,
      role: 'user',
      content: text,
      blocks: [],
      time: formatTime(new Date()),
    })

    isStreaming.value = true

    // 创建助手消息
    const assistantMsg = reactive({
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      blocks: [],
      pending: true,
      time: formatTime(new Date()),
    })
    messages.value.push(assistantMsg)
    onScroll?.()

    // 为当前助手消息初始化统计（必须在 assistantMsg 定义之后）
    const statsKey = assistantMsg.id
    messageStats.value[statsKey] = {
      startTime: Date.now(),
      elapsed: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    }
    if (statsTimer) clearInterval(statsTimer)
    statsTimer = setInterval(() => {
      const s = messageStats.value[statsKey]
      if (s) {
        s.elapsed = Math.floor((Date.now() - s.startTime) / 1000)
      }
    }, 1000)

    // SSE 请求
    const url = `${httpServerUrl}/${ipcApiRoute.piAgent.streamAgent}`
    abortController = new AbortController()

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: text,
          model,
          workspaceSlug: wsSlug || undefined,
        }),
        signal: abortController.signal,
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
          dispatchSseEvent(rawEvent, assistantMsg, onEvent)
          separatorIndex = buffer.indexOf('\n\n')
        }
        // 用 requestAnimationFrame 节流滚动，避免阻塞页面
        if (onScroll) {
          requestAnimationFrame(() => onScroll())
        }
      }

      assistantMsg.pending = false
      // 持久化 blocks 到 savedBlocks（不丢失执行过程）
      // 使用 sessionId + 消息在数组中的位置作为 key，避免前后端 ID 不匹配
      const msgIndex = messages.value.filter((m) => m.role === 'assistant').length - 1
      const blockKey = `${sessionId}:assistant:${msgIndex}`
      if (assistantMsg.blocks.length > 0) {
        savedBlocks.value[blockKey] = JSON.parse(JSON.stringify(assistantMsg.blocks))
        persistSavedBlocks()
      }
      // 清理统计定时器
      if (statsTimer) { clearInterval(statsTimer); statsTimer = null }
      const s = messageStats.value[assistantMsg.id]
      if (s) s.elapsed = Math.floor((Date.now() - s.startTime) / 1000)
    } catch (err) {
      if (err?.name === 'AbortError') {
        assistantMsg.pending = false
        // 持久化 blocks 即使是中止的情况
        const msgIndex = messages.value.filter((m) => m.role === 'assistant').length - 1
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
      if (statsTimer) { clearInterval(statsTimer); statsTimer = null }
      const s = messageStats.value[assistantMsg.id]
      if (s) s.elapsed = Math.floor((Date.now() - s.startTime) / 1000)
    } finally {
      isStreaming.value = false
      abortController = null
      onScroll?.()
    }
  }

  /** 停止生成 */
  function stopGeneration() {
    if (abortController) {
      abortController.abort()
    }
    // 通知后端停止所有协作子 Agent
    const sid = currentSessionId.value
    if (sid) {
      ipc.invoke('controller/piAgent/stopAllDelegations', { sessionId: sid }).catch(() => {})
    }
  }

  /**
   * 解析并分发单条 SSE 事件
   */
  function dispatchSseEvent(rawEvent, assistantMsg, onEvent) {
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
        // 优先按 toolCallId 匹配（精确），fallback 到最后一个 running 块
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

      // ===== Token 使用统计（更新到当前消息） =====
      case 'usage': {
        // 找到当前正在流式的助手消息
        const curMsg = messages.value.find((m) => m.role === 'assistant' && m.pending)
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

      case 'error':
        assistantMsg.pending = false
        assistantMsg.content += `\n\n[错误] ${data.message || '未知错误'}`
        break

      // ===== 权限请求 / AskUser 请求 / 协作子 Agent 事件（交给组件处理） =====
      case 'permission_request':
      case 'ask_user':
        onEvent?.(eventName, data)
        break

      case 'delegation_update': {
        // 按父会话 ID 分组存储
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

  return {
    // State
    sessions,
    currentSessionId,
    messages,
    isStreaming,
    workspaceSlug,
    skills,
    mcpServers,
    savedBlocks,
    allDelegations,
    messageStats,
    pendingPrompt,
    // Getters
    currentSession,
    enabledSkills,
    enabledMcpServers,
    // Actions
    loadSessions,
    createSession,
    selectSession,
    deleteSession,
    sendMessage,
    stopGeneration,
    loadSkills,
    toggleSkill,
    loadMcpServers,
    toggleMcp,
    initSkills,
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
