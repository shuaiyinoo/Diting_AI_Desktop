/**
 * 内置浏览器状态管理
 *
 * 管理 BrowserSidePanel 的开关、宽度、折叠状态。
 * 通过 IPC 与主进程 browserController 通信，实时同步 BrowserViewState。
 */
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { ipc } from '@/utils/ipcRenderer'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAgentStore } from '@/stores/agent'

export const useBrowserStore = defineStore('browser', () => {
  // ===== State =====

  /** 浏览器面板是否打开 */
  const panelOpen = ref(false)

  /** 面板宽度（px） */
  const panelWidth = ref(480)

  /** 面板是否折叠（折叠时只显示窄条） */
  const panelCollapsed = ref(false)

  /** 后端返回的 BrowserViewState */
  const browserState = ref(null)

  /** 风险告知是否已确认：null=未读取, true/false */
  const riskAcknowledged = ref(null)

  /** 当前关联的会话 ID */
  const activeSessionId = ref(null)

  /** 是否由 Agent 触发打开（Agent 触发时会自动折叠左侧菜单和文件面板） */
  const agentTriggered = ref(false)

  /** Agent 触发时的会话 ID，该会话结束 streaming 后自动关闭浏览器 */
  const agentSessionId = ref(null)

  /** Agent 触发时是否要求折叠右侧文件面板（Agent 视图 watch 此值） */
  const forceFilePanelCollapsed = ref(false)

  // ===== 会话结束自动关闭浏览器（已屏蔽：Agent 处理完浏览器操作后保持面板打开） =====
  // watch(() => {
  //   try {
  //     const agent = useAgentStore()
  //     return agent.streamingSessions
  //   } catch { return null }
  // }, (streamingSet) => {
  //   if (!agentTriggered.value || !agentSessionId.value) return
  //   if (streamingSet && !streamingSet.has(agentSessionId.value)) {
  //     closePanel()
  //   }
  // }, { deep: true })

const panelVisible = computed(() => panelOpen.value && !panelCollapsed.value)

  /** 当前活跃标签 */
  const activeTab = computed(() => {
    const tabs = browserState.value?.tabs
    if (!Array.isArray(tabs)) return null
    const id = browserState.value?.activeTabId
    return tabs.find((t) => t.tabId === id) ?? null
  })

  /** 最新一条 Agent 操作账本 */
  const lastTrace = computed(() => {
    const trace = browserState.value?.trace
    if (!Array.isArray(trace) || trace.length === 0) return null
    return trace[trace.length - 1]
  })

  // ===== Actions =====

  /** 打开浏览器面板 */
  async function openPanel(sessionId) {
    activeSessionId.value = sessionId
    panelOpen.value = true
    panelCollapsed.value = false

    // 先检查风险告知状态（不依赖后续 IPC 是否成功）
    try {
      const riskRes = await ipc.invoke('controller/browser/hasAcknowledgedRisk')
      if (riskRes?.code === 0) {
        riskAcknowledged.value = riskRes.data
      } else {
        riskAcknowledged.value = false
      }
    } catch {
      // IPC 通道可能未就绪，默认未确认以显示弹窗
      riskAcknowledged.value = false
    }

    // 初始化浏览器会话（即使未确认风险也可创建，但操作会被后端拦截）
    if (sessionId) {
      try {
        const res = await ipc.invoke('controller/browser/open', { sessionId })
        if (res?.code === 0 && res.data) {
          browserState.value = res.data
        }
      } catch {
        // 浏览器会话创建失败不阻塞面板，用户仍可看到风险告知
      }
    }
  }

  /** 关闭浏览器面板 */
  function closePanel() {
    if (activeSessionId.value) {
      ipc.invoke('controller/browser/close', { sessionId: activeSessionId.value }).catch(() => {})
    }
    panelOpen.value = false
    panelCollapsed.value = false
    browserState.value = null
    activeSessionId.value = null

    // 如果是 Agent 触发的，清除标记
    if (agentTriggered.value) {
      agentTriggered.value = false
      agentSessionId.value = null
      forceFilePanelCollapsed.value = false
    }
  }

  /** 切换浏览器面板开关（从 StatusBar 按钮调用） */
  function toggleBrowser(sessionId) {
    if (panelOpen.value) {
      closePanel()
    } else {
      openPanel(sessionId)
    }
  }

  /** 切换折叠/展开 */
  function togglePanel() {
    if (!panelOpen.value) return
    panelCollapsed.value = !panelCollapsed.value
  }

  /** 拖拽调整面板宽度（向左拖=变宽，向右拖=变窄） */
  function onPanelResize(delta) {
    panelWidth.value = Math.min(900, Math.max(360, panelWidth.value - delta))
  }

  /** 订阅主进程浏览器状态变更 */
  function subscribeStateChanges() {
    ipc.on('browser:state-changed', (_event, state) => {
      // 收到状态变更说明 Agent 正在使用浏览器
      // 如果面板未打开，自动打开、折叠左侧菜单并检查风险告知
      if (state?.sessionId && !panelOpen.value) {
        activeSessionId.value = state.sessionId
        panelOpen.value = true
        panelCollapsed.value = false
        agentTriggered.value = true
        agentSessionId.value = state.sessionId

        // 折叠左侧菜单和右侧文件面板
        try {
          const ws = useWorkspaceStore()
          ws.menuCollapsed = true
        } catch { /* store 未就绪 */ }
        forceFilePanelCollapsed.value = true

        // 检查风险告知状态
        ipc.invoke('controller/browser/hasAcknowledgedRisk')
          .then((riskRes) => {
            if (riskRes?.code === 0) {
              riskAcknowledged.value = riskRes.data
            } else {
              riskAcknowledged.value = false
            }
          })
          .catch(() => {
            riskAcknowledged.value = false
          })
      }

      // 更新浏览器状态
      browserState.value = state
    })
  }

  /** 地址栏导航（用户面板） */
  async function navigateDisplay(url) {
    if (!activeSessionId.value) return
    const res = await ipc.invoke('controller/browser/navigateDisplay', {
      sessionId: activeSessionId.value,
      url,
    })
    if (res?.code === 0 && res.data) {
      browserState.value = res.data
    }
  }

  /** 后退（用户面板） */
  async function goBackDisplay() {
    if (!activeSessionId.value) return
    const res = await ipc.invoke('controller/browser/goBackDisplay', {
      sessionId: activeSessionId.value,
    })
    if (res?.code === 0 && res.data) {
      browserState.value = res.data
    }
  }

  /** 前进（用户面板） */
  async function goForwardDisplay() {
    if (!activeSessionId.value) return
    const res = await ipc.invoke('controller/browser/goForwardDisplay', {
      sessionId: activeSessionId.value,
    })
    if (res?.code === 0 && res.data) {
      browserState.value = res.data
    }
  }

  /** 刷新（用户面板） */
  async function reloadDisplay() {
    if (!activeSessionId.value) return
    const res = await ipc.invoke('controller/browser/reloadDisplay', {
      sessionId: activeSessionId.value,
    })
    if (res?.code === 0 && res.data) {
      browserState.value = res.data
    }
  }

  /** 选择标签 */
  async function selectTab(tabId) {
    if (!activeSessionId.value) return
    const res = await ipc.invoke('controller/browser/selectTab', {
      sessionId: activeSessionId.value,
      tabId,
    })
    if (res?.code === 0 && res.data) {
      browserState.value = res.data
    }
  }

  /** 新建标签（用户面板） */
  async function createDisplayTab(url) {
    if (!activeSessionId.value) return
    const res = await ipc.invoke('controller/browser/createDisplayTab', {
      sessionId: activeSessionId.value,
      url,
    })
    if (res?.code === 0 && res.data) {
      browserState.value = res.data
    }
  }

  /** 关闭标签 */
  async function closeTab(tabId) {
    if (!activeSessionId.value) return
    const res = await ipc.invoke('controller/browser/closeTab', {
      sessionId: activeSessionId.value,
      tabId,
    })
    if (res?.code === 0) {
      browserState.value = res.data
    }
  }

  /** 设置布局（BrowserSlot 调用） */
  async function setLayout(layout) {
    await ipc.invoke('controller/browser/setLayout', layout)
  }

  /** 确认风险告知 */
  async function acceptRisk() {
    const res = await ipc.invoke('controller/browser/acknowledgeRisk')
    if (res?.code === 0) {
      riskAcknowledged.value = true
    }
  }

  return {
    // State
    panelOpen,
    panelWidth,
    panelCollapsed,
    browserState,
    riskAcknowledged,
    activeSessionId,
    agentTriggered,
    agentSessionId,
    forceFilePanelCollapsed,
    // Getters
    panelVisible,
    activeTab,
    lastTrace,
    // Actions
    openPanel,
    closePanel,
    toggleBrowser,
    togglePanel,
    onPanelResize,
    subscribeStateChanges,
    navigateDisplay,
    goBackDisplay,
    goForwardDisplay,
    reloadDisplay,
    selectTab,
    createDisplayTab,
    closeTab,
    setLayout,
    acceptRisk,
  }
})
