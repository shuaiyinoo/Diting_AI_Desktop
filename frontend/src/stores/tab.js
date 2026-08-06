/**
 * Tab 状态管理 Store
 *
 * 支持 Chat + Agent 各一个标签共存：
 * 顶部保留 [草稿?, chat-tab?, agent-tab?]
 * 同类型标签替换，不同类型标签共存。
 */
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'

const SCRATCH_PAD_ID = '__scratch-pad__'
const SCRATCH_PAD_TITLE = '草稿'

/** 文件 Tab 的固定 ID（只保留一个文件 Tab） */
const FILE_TAB_ID = '__file-viewer__'

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
   * 打开文件 Tab（全局只保留一个，替换内容）
   * @param {Object} file - 文件信息 { name, path, workspaceId, sessionId, mode }
   */
  function openFileTab(file) {
    const newTab = {
      id: FILE_TAB_ID,
      type: 'file',
      sessionId: FILE_TAB_ID,
      title: file.name || file.path || '文件',
      filePath: file.path,
      workspaceId: file.workspaceId,
      fileSessionId: file.sessionId,
      mode: file.mode || 'project',
      attachedDirPath: file.attachedDirPath || null,
    }

    // 保留草稿 + 保留会话标签 + 替换已有的 file 标签
    const kept = tabs.value.filter((t) => {
      if (t.id === SCRATCH_PAD_ID) return true   // 保留草稿
      if (t.id === FILE_TAB_ID) return false       // 替换已有文件标签
      return true                                  // 保留会话标签
    })

    tabs.value = [...kept, newTab]
    activeTabId.value = FILE_TAB_ID
    tabMode.value = true
  }

  /**
   * 策略：顶部保留 [草稿?, chat-tab?, agent-tab?]
   * - 打开 chat 标签时，替换已有的 chat 标签，保留 agent 标签
   * - 打开 agent 标签时，替换已有的 agent 标签，保留 chat 标签
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

    const newTab = { id: sessionId, type, sessionId, title }

    // 保留草稿 + 保留不同类型的已有标签 + 替换同类型标签
    const kept = tabs.value.filter((t) => {
      if (t.id === SCRATCH_PAD_ID) return true  // 保留草稿
      if (t.type === type) return false           // 替换同类型
      return true                                  // 保留不同类型
    })

    tabs.value = [...kept, newTab]
    activeTabId.value = newTab.id
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

    // 所有会话标签关闭后退出 Tab 模式
    const hasSession = tabs.value.some((t) => t.type !== 'scratch')
    if (!hasSession) {
      tabMode.value = false
      tabs.value = []
      activeTabId.value = null
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
   * 退出 Tab 模式（点击工具入口时调用）
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
      if (!saved) return
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
      }
    } catch {
      // 忽略恢复失败
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
    closeTab,
    updateTabTitle,
    enterTabMode,
    exitTabMode,
    activateTab,
  }
})
