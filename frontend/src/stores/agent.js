/**
 * Agent 模式状态管理
 *
 * 移植自 Proma 的 Jotai atoms，适配 Diting 的 Pinia 架构。
 * 管理 Agent 会话列表、当前会话、流式状态等。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ipc } from '@/utils/ipcRenderer'

export const useAgentStore = defineStore('agent', () => {
  // ===== State =====
  const sessions = ref([])
  const currentSessionId = ref(null)
  const messages = ref([])
  const isStreaming = ref(false)
  const workspaceSlug = ref(null)
  const skills = ref([])
  const mcpServers = ref([])

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
    // TODO: 加载会话历史消息
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
      const res = await ipc.invoke('controller/piAgent/mcpOperation', {
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
      const res = await ipc.invoke('controller/piAgent/mcpOperation', {
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
      await ipc.invoke('controller/piAgent/initSkills', {})
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
    // Getters
    currentSession,
    enabledSkills,
    enabledMcpServers,
    // Actions
    loadSessions,
    createSession,
    selectSession,
    deleteSession,
    loadSkills,
    toggleSkill,
    loadMcpServers,
    toggleMcp,
    initSkills,
  }
})
