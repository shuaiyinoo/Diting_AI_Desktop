/**
 * 工作区状态管理
 *
 * 作为 MenuBar（第一部分）与各模块视图之间的通信桥梁。
 * MenuBar 加载并展示模块专属列表（文件夹/会话/项目），
 * 选中后写入 store，各视图 watch store 变化来加载对应内容。
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'

export const useWorkspaceStore = defineStore('workspace', () => {
  // ===== 菜单栏状态 =====
  // 菜单默认展开
  const menuCollapsed = ref(false)
  const menuWidth = ref(240)

  // ===== 顶部模式：Chat / Agent =====
  const appMode = ref('chat')

  // ===== Agent 面板布局状态 =====
  // panelSwapped: false = 左聊天右文件（默认），true = 左文件右聊天
  const PANEL_SWAP_KEY = 'agent:panelSwapped'
  const panelSwapped = ref(localStorage.getItem(PANEL_SWAP_KEY) === 'true')

  /** 切换 Agent 聊天面板与文件面板的左右位置 */
  function togglePanelSwap() {
    panelSwapped.value = !panelSwapped.value
    localStorage.setItem(PANEL_SWAP_KEY, String(panelSwapped.value))
  }

  // ===== Agent 代码编辑器面板状态 =====
  // codeEditorVisible: 控制中间代码编辑器面板的显示/隐藏（默认隐藏，用户手动打开）
  const CODE_EDITOR_VISIBLE_KEY = 'agent:codeEditorVisible'
  const codeEditorVisible = ref(localStorage.getItem(CODE_EDITOR_VISIBLE_KEY) === 'true')

  /** 切换代码编辑器面板的显示/隐藏 */
  function toggleCodeEditor() {
    codeEditorVisible.value = !codeEditorVisible.value
    localStorage.setItem(CODE_EDITOR_VISIBLE_KEY, String(codeEditorVisible.value))
  }

  // ===== 当前活跃模块 =====
  const activeModule = ref('chat')

  // ===== 文件模块共享状态 =====
  const folderList = ref([])
  const folderLoading = ref(false)
  const selectedFolderId = ref(null)

  // 文件列表（第二部分）由 file 视图自行加载
  const selectedFile = ref(null)
  const selectedFileId = ref(null)

  // ===== Chat 模块共享状态 =====
  // 后端返回的会话对象使用 sessionId，前端统一映射为 id
  const chatSessions = ref([])
  const chatSessionLoading = ref(false)
  const currentChatSessionId = ref(null)

  /** 将后端会话对象（sessionId）标准化为前端格式（id） */
  function normalizeSession(raw) {
    if (!raw) return null
    // 已经有 id 的直接返回
    if (raw.id != null) return raw
    return { ...raw, id: raw.sessionId }
  }

  // ===== Agent 模块共享状态 =====
  const agentProjects = ref([])
  const agentProjectLoading = ref(false)
  const currentAgentProjectId = ref(null)

  // ===== Getters =====
  const selectedFolder = computed(() =>
    folderList.value.find((f) => f.id === selectedFolderId.value),
  )

  const currentChatSession = computed(() =>
    chatSessions.value.find((s) => s.id === currentChatSessionId.value),
  )

  const currentAgentProject = computed(() =>
    agentProjects.value.find((p) => p.id === currentAgentProjectId.value),
  )

  // ===== Actions =====

  /** 切换菜单栏折叠/展开 */
  function toggleMenu() {
    menuCollapsed.value = !menuCollapsed.value
  }

  /** 设置活跃模块 */
  function setActiveModule(module) {
    activeModule.value = module
  }

  /** 设置顶部模式（Chat / Agent） */
  function setAppMode(mode) {
    appMode.value = mode
  }

  // ===== 文件模块：文件夹列表 =====

  /** 加载授权文件夹列表 */
  async function loadFolderList() {
    folderLoading.value = true
    try {
      const data = await ipc.invoke(ipcApiRoute.file.getFolderList)
      folderList.value = data || []
      // 默认选中第一个
      if (folderList.value.length > 0 && !selectedFolderId.value) {
        selectFolder(folderList.value[0].id)
      }
    } catch (err) {
      console.error('[workspace] 加载文件夹列表失败:', err)
    } finally {
      folderLoading.value = false
    }
  }

  /** 选中文件夹 */
  function selectFolder(folderId) {
    selectedFolderId.value = folderId
    // 重置文件选中
    selectedFile.value = null
    selectedFileId.value = null
  }

  /** 添加文件夹 */
  async function addFolder() {
    try {
      const result = await ipc.invoke(ipcApiRoute.file.addFolder)
      if (result.success) {
        folderList.value = result.folderList || []
        if (result.folder) {
          selectFolder(result.folder.id)
        }
      }
      return result
    } catch (err) {
      console.error('[workspace] 添加文件夹失败:', err)
      return null
    }
  }

  /** 删除授权文件夹（后端会同步删除 RAG 数据和取消文件监听） */
  async function deleteFolder(folderId) {
    try {
      const result = await ipc.invoke(ipcApiRoute.file.deleteFolder, { folderId })
      if (result.success) {
        folderList.value = result.folderList || []
        // 如果删除的是当前选中的文件夹，选中最新的
        if (selectedFolderId.value === folderId) {
          if (folderList.value.length > 0) {
            selectFolder(folderList.value[0].id)
          } else {
            selectedFolderId.value = null
          }
        }
      }
      return result
    } catch (err) {
      console.error('[workspace] 删除文件夹失败:', err)
      return null
    }
  }

  /** 设置选中文件 */
  function selectFile(file) {
    selectedFile.value = file
    selectedFileId.value = file?.id || null
  }

  // ===== Chat 模块：会话列表 =====

  /** 加载 Chat 会话列表 */
  async function loadChatSessions() {
    chatSessionLoading.value = true
    try {
      const res = await ipc.invoke('controller/assistant/sessionOperation', {
        action: 'list',
      })
      if (res.code === 0 && res.data) {
        // 后端返回 sessionId，前端统一映射为 id
        chatSessions.value = res.data.map(normalizeSession)
        if (chatSessions.value.length > 0 && !currentChatSessionId.value) {
          selectChatSession(chatSessions.value[0].id)
        }
      }
    } catch (err) {
      console.error('[workspace] 加载 Chat 会话列表失败:', err)
    } finally {
      chatSessionLoading.value = false
    }
  }

  /** 选中 Chat 会话 */
  function selectChatSession(sessionId) {
    currentChatSessionId.value = sessionId
  }

  /** 创建 Chat 会话 */
  async function createChatSession() {
    try {
      const res = await ipc.invoke('controller/assistant/sessionOperation', {
        action: 'create',
      })
      if (res.code === 0 && res.data) {
        // 后端返回 sessionId，前端统一映射为 id
        const session = normalizeSession(res.data)
        chatSessions.value.unshift(session)
        selectChatSession(session.id)
        return session
      }
    } catch (err) {
      console.error('[workspace] 创建 Chat 会话失败:', err)
    }
    return null
  }

  // ===== Agent 模块：项目列表 =====

  /** 加载 Agent 项目列表 */
  async function loadAgentProjects() {
    agentProjectLoading.value = true
    try {
      const res = await ipc.invoke('controller/piAgent/workspaceOperation', {
        action: 'list',
      })
      if (res.code === 0 && res.data) {
        agentProjects.value = res.data
        if (agentProjects.value.length > 0 && !currentAgentProjectId.value) {
          selectAgentProject(agentProjects.value[0].id)
        }
      }
    } catch (err) {
      console.error('[workspace] 加载 Agent 项目列表失败:', err)
    } finally {
      agentProjectLoading.value = false
    }
  }

  /** 选中 Agent 项目 */
  function selectAgentProject(projectId) {
    currentAgentProjectId.value = projectId
  }

  /** 创建 Agent 项目 */
  async function createAgentProject() {
    try {
      const res = await ipc.invoke('controller/piAgent/workspaceOperation', {
        action: 'create',
        name: `项目 ${agentProjects.value.length + 1}`,
      })
      if (res.code === 0 && res.data) {
        agentProjects.value.unshift(res.data)
        selectAgentProject(res.data.id)
        return res.data
      }
    } catch (err) {
      console.error('[workspace] 创建 Agent 项目失败:', err)
    }
    return null
  }

  /** 删除 Agent 项目 */
  async function deleteAgentProject(projectId) {
    try {
      const res = await ipc.invoke(ipcApiRoute.piAgent.workspaceOperation, {
        action: 'delete',
        id: projectId,
      })
      if (res.code === 0) {
        // 从列表中移除该项目
        agentProjects.value = agentProjects.value.filter((p) => p.id !== projectId)
        // 如果删除的是当前选中的项目，选中最新的项目（列表第一个）
        if (currentAgentProjectId.value === projectId) {
          if (agentProjects.value.length > 0) {
            selectAgentProject(agentProjects.value[0].id)
          } else {
            currentAgentProjectId.value = null
          }
        }
      }
      return res
    } catch (err) {
      console.error('[workspace] 删除 Agent 项目失败:', err)
      return null
    }
  }

  return {
    // 菜单栏状态
    menuCollapsed,
    menuWidth,
    appMode,
    activeModule,
    // Agent 面板布局
    panelSwapped,
    togglePanelSwap,
    codeEditorVisible,
    toggleCodeEditor,
    // 文件模块
    folderList,
    folderLoading,
    selectedFolderId,
    selectedFolder,
    selectedFile,
    selectedFileId,
    // Chat 模块
    chatSessions,
    chatSessionLoading,
    currentChatSessionId,
    currentChatSession,
    // Agent 模块
    agentProjects,
    agentProjectLoading,
    currentAgentProjectId,
    currentAgentProject,
    // Actions
    toggleMenu,
    setActiveModule,
    setAppMode,
    loadFolderList,
    selectFolder,
    addFolder,
    deleteFolder,
    selectFile,
    loadChatSessions,
    selectChatSession,
    createChatSession,
    loadAgentProjects,
    selectAgentProject,
    createAgentProject,
    deleteAgentProject,
  }
})
