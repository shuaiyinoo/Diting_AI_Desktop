/**
 * Tab 状态管理 Store
 *
 * 支持多类型标签共存：
 * - 草稿（固定第一位，不可关闭）
 * - Chat / Agent 会话（各一个，同类型替换）
 * - 文件查看器（多个共存，每个文件一个独立 Tab）
 * - 工具页面（文件管理 / OCR录入 / OCR归集 / 任务日程 / 技能 / 设置，各一个）
 * 同类型标签替换，不同类型标签共存。
 */
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

const SCRATCH_PAD_ID = '__scratch-pad__'
const SCRATCH_PAD_TITLE = '草稿'

/** 文件查看器 Tab 的固定 ID（全局只保留一个，点击新文件时替换内容） */
const FILE_VIEWER_TAB_ID = '__file-viewer__'

/** Chat Tab 的固定 ID（全局只保留一个，切换会话时复用组件实例，保持状态） */
const CHAT_TAB_ID = '__chat-session__'

/** Agent Tab 的固定 ID（全局只保留一个，切换会话时复用组件实例，保持状态） */
const AGENT_TAB_ID = '__agent-session__'

/** 文件夹管理 Tab ID 前缀（每个文件夹一个独立 Tab） */
const FOLDER_TAB_ID_PREFIX = '__folder-manager__'

/** 工具 Tab 的固定 ID（每种工具页面全局只保留一个） */
const TOOL_TAB_IDS = {
  'file-manager': '__tool-file-manager__',
  'ocr-recognize': '__tool-ocr-recognize__',
  'ocr-archive': '__tool-ocr-archive__',
  'planning': '__tool-planning__',
  'skills': '__tool-skills__',
  'setting': '__tool-setting__',
}

/** 持久化存储 key */
const STORAGE_KEY = 'diting-tab-state'

export const useTabStore = defineStore('tab', () => {
  // ===== State =====

  /** 标签列表：始终为 [草稿, 当前会话] */
  const tabs = ref([])

  /** 当前激活标签 ID */
  const activeTabId = ref(null)

  /** 是否处于 Tab 模式（true=会话视图，false=路由视图） */
  const tabMode = ref(false)

  /** 标签 MRU（最近使用）顺序，用于 Ctrl+Tab */
  const tabMru = ref([])

  // ===== Getters =====

  /** 当前活跃标签对象 */
  const activeTab = computed(() =>
    tabs.value.find((t) => t.id === activeTabId.value) ?? null,
  )

  /** 当前活跃标签的 sessionId */
  const activeSessionId = computed(() => activeTab.value?.sessionId ?? null)

  // ===== Actions =====

  /** 创建草稿 Tab */
  function createScratchPadTab() {
    return {
      id: SCRATCH_PAD_ID,
      type: 'scratch',
      sessionId: SCRATCH_PAD_ID,
      title: SCRATCH_PAD_TITLE,
    }
  }

  /**
   * 生成文件 Tab 的显示标题
   * 格式：文件-文件夹名+协议标识（如 文件-文档 LOC）
   * @param {Object} file - 文件信息 { name, folderName, protocol }
   * @returns {string} Tab 标题
   */
  function makeFileTabTitle(file) {
    const parts = ['文件']
    if (file.folderName) {
      parts.push(file.folderName)
    }
    if (file.protocol) {
      const protocolMap = {
        local: 'LOC', ftp: 'FTP', ftps: 'FTPS', sftp: 'SFTP',
        smb: 'SMB', webdav: 'DAV', s3: 'S3',
      }
      parts.push(protocolMap[file.protocol] || file.protocol.toUpperCase())
    }
    // 如果没有文件夹信息，退回到文件名
    if (!file.folderName && !file.protocol && file.name) {
      return file.name
    }
    return parts.join(' ')
  }

  /**
   * 打开文件 Tab（全局共用一个，点击新文件时原位替换内容）
   * @param {Object} file - 文件信息 { name, path, workspaceId, sessionId, mode, fileItemId, folderName, protocol }
   */
  function openFileTab(file) {
    const newTab = {
      id: FILE_VIEWER_TAB_ID,
      type: 'file',
      sessionId: FILE_VIEWER_TAB_ID,
      title: file.name || makeFileTabTitle(file),
      filePath: file.path,
      workspaceId: file.workspaceId,
      fileSessionId: file.sessionId,
      mode: file.mode || 'project',
      attachedDirPath: file.attachedDirPath || null,
      fileItemId: file.fileItemId ?? null,
      folderName: file.folderName || null,
      protocol: file.protocol || null,
    }

    // 确保草稿始终在第一位
    const hasScratch = tabs.value.some((t) => t.id === SCRATCH_PAD_ID)
    if (!hasScratch) {
      tabs.value = [createScratchPadTab(), ...tabs.value]
    }

    // 在已有的 file 类型 Tab 位置原位替换，没有则追加到末尾
    const existingIdx = tabs.value.findIndex((t) => t.type === 'file')
    if (existingIdx !== -1) {
      tabs.value = tabs.value.map((t) => t.type === 'file' ? newTab : t)
    } else {
      tabs.value = [...tabs.value, newTab]
    }
    activeTabId.value = FILE_VIEWER_TAB_ID
    tabMode.value = true
  }

  /**
   * 策略：顶部保留 [草稿?, chat-tab?, agent-tab?]
   * - 打开 chat 标签时，替换已有的 chat 标签，保留 agent 标签
   * - 打开 agent 标签时，替换已有的 agent 标签，保留 chat 标签
   * - 如果同类型标签的 sessionId 相同，仅激活不替换
   * - 新标签在已有同类型标签的位置原位替换，保持顺序不变
   * - Tab ID 固定不变（如 __chat-session__），切换会话时 Vue 复用同一组件实例
   * @param {string} type - 'chat' | 'agent' | 'scratch'
   * @param {string} sessionId - 会话 ID
   * @param {string} title - 标签标题
   */
  function openSessionTab(type, sessionId, title) {
    if (type === 'scratch') {
      const scratchTab = tabs.value.find((t) => t.id === SCRATCH_PAD_ID) ?? createScratchPadTab()
      tabs.value = [scratchTab]
      activeTabId.value = SCRATCH_PAD_ID
      tabMode.value = true
      return
    }

    // 如果同类型标签已存在且 sessionId 相同，仅激活不替换
    const existingTab = tabs.value.find((t) => t.type === type)
    if (existingTab && existingTab.sessionId === sessionId) {
      activeTabId.value = existingTab.id
      tabMode.value = true
      tabMru.value = [sessionId, ...tabMru.value.filter((id) => id !== sessionId)].slice(0, 50)
      return
    }

    // 使用固定 ID，切换会话时 Vue 复用同一组件实例，保持状态
    const fixedId = type === 'chat' ? CHAT_TAB_ID : type === 'agent' ? AGENT_TAB_ID : sessionId
    const newTab = { id: fixedId, type, sessionId, title }

    // 确保草稿始终在第一位
    const hasScratch = tabs.value.some((t) => t.id === SCRATCH_PAD_ID)
    if (!hasScratch) {
      tabs.value = [createScratchPadTab(), ...tabs.value]
    }

    // 在已有同类型标签的位置原位替换，没有则追加到末尾
    const existingIdx = tabs.value.findIndex((t) => t.type === type)
    if (existingIdx !== -1) {
      tabs.value = tabs.value.map((t) => t.type === type ? newTab : t)
    } else {
      tabs.value = [...tabs.value, newTab]
    }
    activeTabId.value = fixedId
    tabMode.value = true

    // 更新 MRU
    tabMru.value = [sessionId, ...tabMru.value.filter((id) => id !== sessionId)].slice(0, 50)
  }

  /**
   * 关闭标签页（草稿不可关闭）
   * @param {string} tabId - 标签 ID
   */
  function closeTab(tabId) {
    if (tabId === SCRATCH_PAD_ID) return

    const idx = tabs.value.findIndex((t) => t.id === tabId)
    if (idx === -1) return

    const wasActive = activeTabId.value === tabId
    tabs.value = tabs.value.filter((t) => t.id !== tabId)

    if (wasActive) {
      // 切换到相邻标签（通常是草稿）
      if (tabs.value.length > 0) {
        const nextIdx = Math.min(idx, tabs.value.length - 1)
        activeTabId.value = tabs.value[nextIdx].id
      } else {
        activeTabId.value = null
      }
    }

    // 所有非草稿标签关闭后仅保留草稿
    const hasNonScratch = tabs.value.some((t) => t.type !== 'scratch')
    if (!hasNonScratch) {
      // 保留草稿 tab，不清空 tabs
      const scratchTab = tabs.value.find((t) => t.id === SCRATCH_PAD_ID)
      if (scratchTab) {
        tabs.value = [scratchTab]
        activeTabId.value = SCRATCH_PAD_ID
      } else {
        tabs.value = []
        activeTabId.value = null
      }
    }

    // 清理 MRU
    tabMru.value = tabMru.value.filter((id) => id !== tabId)
  }

  /**
   * 更新标签标题
   * @param {string} sessionId - 会话 ID
   * @param {string} title - 新标题
   */
  function updateTabTitle(sessionId, title) {
    tabs.value = tabs.value.map((t) =>
      t.sessionId === sessionId && t.type !== 'scratch' ? { ...t, title } : t,
    )
  }

  /**
   * 进入 Tab 模式（无特定会话时显示欢迎页）
   */
  function enterTabMode() {
    tabMode.value = true
    // 如果没有标签，创建草稿标签
    if (tabs.value.length === 0) {
      tabs.value = [createScratchPadTab()]
      activeTabId.value = SCRATCH_PAD_ID
    }
  }

  /**
   * 打开工具页面 Tab（每种工具全局只保留一个，替换内容）
   * @param {string} toolType - 工具类型 key（TOOL_TAB_IDS 的 key）
   * @param {string} title - 标签标题
   */
  function openToolTab(toolType, title) {
    const tabId = TOOL_TAB_IDS[toolType]
    if (!tabId) return

    const newTab = {
      id: tabId,
      type: toolType,
      sessionId: tabId,
      title,
    }

    // 确保草稿始终在第一位
    const hasScratch = tabs.value.some((t) => t.id === SCRATCH_PAD_ID)
    if (!hasScratch) {
      tabs.value = [createScratchPadTab(), ...tabs.value]
    }

    // 在已有同类型标签的位置原位替换，没有则追加到末尾
    const existingIdx = tabs.value.findIndex((t) => t.id === tabId)
    if (existingIdx !== -1) {
      tabs.value = tabs.value.map((t) => t.id === tabId ? newTab : t)
    } else {
      tabs.value = [...tabs.value, newTab]
    }
    activeTabId.value = tabId
    tabMode.value = true
  }

  /**
   * 打开文件夹管理 Tab（每个文件夹一个独立 Tab，可多个共存）
   * 同一文件夹的 Tab 只激活不新建
   * @param {Object} folder - 文件夹信息 { id, folderName, protocol }
   */
  function openFolderTab(folder) {
    const tabId = `${FOLDER_TAB_ID_PREFIX}__${folder.id}`

    // 如果同 ID 的文件夹 Tab 已存在，仅激活
    const existingTab = tabs.value.find((t) => t.id === tabId)
    if (existingTab) {
      activeTabId.value = tabId
      tabMode.value = true
      return
    }

    // 生成标题：文件夹名 + 协议标识
    const protocolMap = {
      local: 'LOC', ftp: 'FTP', ftps: 'FTPS', sftp: 'SFTP',
      smb: 'SMB', webdav: 'DAV', s3: 'S3',
    }
    const parts = []
    if (folder.folderName || folder.folder_name) {
      parts.push(folder.folderName || folder.folder_name)
    }
    if (folder.protocol) {
      parts.push(protocolMap[folder.protocol] || folder.protocol.toUpperCase())
    }
    const title = parts.length > 0 ? parts.join(' ') : '文件夹'

    const newTab = {
      id: tabId,
      type: 'file-manager',
      sessionId: tabId,
      title,
      folderId: folder.id,
      folderName: folder.folderName || folder.folder_name || null,
      protocol: folder.protocol || 'local',
    }

    // 确保草稿始终在第一位
    const hasScratch = tabs.value.some((t) => t.id === SCRATCH_PAD_ID)
    if (!hasScratch) {
      tabs.value = [createScratchPadTab(), ...tabs.value]
    }

    // 追加到末尾
    tabs.value = [...tabs.value, newTab]
    activeTabId.value = tabId
    tabMode.value = true
  }

  /**
   * 退出 Tab 模式（保留用于兼容，新架构下工具页面也走 Tab 模式）
   */
  function exitTabMode() {
    tabMode.value = false
  }

  /**
   * 激活指定标签
   * @param {string} tabId - 标签 ID
   */
  function activateTab(tabId) {
    activeTabId.value = tabId
    // 更新 MRU
    const tab = tabs.value.find((t) => t.id === tabId)
    if (tab && tab.type !== 'scratch') {
      tabMru.value = [tab.sessionId, ...tabMru.value.filter((id) => id !== tab.sessionId)].slice(0, 50)
    }
  }

  // ===== 持久化 =====

  /** 保存 Tab 状态到 localStorage */
  function persist() {
    try {
      const persistable = tabs.value.filter((t) => t.type !== 'scratch')
      const data = {
        tabs: persistable,
        activeTabId: activeTabId.value,
        tabMode: tabMode.value,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // 忽略存储失败
    }
  }

  /** 从 localStorage 恢复 Tab 状态 */
  function restoreFromStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved) {
        // 首次启动：默认进入 Tab 模式，显示草稿页
        enterTabMode()
        return
      }
      const data = JSON.parse(saved)
      if (data.tabMode && data.tabs && data.tabs.length > 0) {
        tabs.value = [
          createScratchPadTab(),
          ...data.tabs,
        ]
        // 恢复的 activeTabId 可能已失效，做安全检查
        activeTabId.value = tabs.value.some((t) => t.id === data.activeTabId)
          ? data.activeTabId
          : tabs.value[0].id
        tabMode.value = true
      } else {
        // 无可恢复的 Tab：默认进入 Tab 模式，显示草稿页
        enterTabMode()
      }
    } catch {
      // 恢复失败：默认进入 Tab 模式
      enterTabMode()
    }
  }

  // 监听状态变化自动持久化
  watch([tabs, activeTabId, tabMode], () => persist(), { deep: true })

  // 初始化时恢复
  restoreFromStorage()

  return {
    // State
    tabs,
    activeTabId,
    tabMode,
    tabMru,
    // Getters
    activeTab,
    activeSessionId,
    // Actions
    openSessionTab,
    openFileTab,
    openFolderTab,
    openToolTab,
    closeTab,
    updateTabTitle,
    enterTabMode,
    exitTabMode,
    activateTab,
  }
})
