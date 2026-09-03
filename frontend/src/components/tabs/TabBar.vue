<template>
  <div class="flex items-stretch h-9 flex-shrink-0 bg-muted border-b border-border [-webkit-app-region:no-drag]">
    <!-- Tab 列表（可横向滚动） -->
    <div class="flex items-stretch flex-1 min-w-0 overflow-x-auto px-1 gap-px [&::-webkit-scrollbar]:hidden" ref="scrollRef">
      <TabBarItem
        v-for="tab in tabStore.tabs"
        :key="tab.id"
        :tab="tab"
        :is-active="tab.id === tabStore.activeTabId"
        :is-streaming="isTabStreaming(tab)"
        @activate="onActivate"
        @close="onClose"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { useTabStore } from '@/stores/tab'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAgentStore } from '@/stores/agent'
import TabBarItem from './TabBarItem.vue'

const tabStore = useTabStore()
const ws = useWorkspaceStore()
const agent = useAgentStore()

const scrollRef = ref(null)

/** 工具 Tab type → activeModule 映射 */
const TOOL_TAB_MODULE_MAP = {
  'file-manager': 'file',
  'ocr-recognize': 'invoice',
  'ocr-archive': 'invoice',
  'planning': 'planning',
  'skills': 'skills',
  'setting': 'setting',
}

/** 判断标签是否处于流式状态 */
function isTabStreaming(tab) {
  if (tab.type === 'agent') {
    return agent.streamingSessions.has(tab.sessionId)
  }
  // Chat 的流式状态在组件内部，暂无法从外部检测
  return false
}

/** 激活标签：切换 activeTabId + 同步全局状态 */
function onActivate(tabId) {
  tabStore.activateTab(tabId)

  const tab = tabStore.tabs.find((t) => t.id === tabId)
  if (!tab) return

  if (tab.type === 'chat') {
    ws.setAppMode('chat')
    ws.currentChatSessionId = tab.sessionId
  } else if (tab.type === 'agent') {
    ws.setAppMode('agent')
    // 确保消息已加载
    if (!agent.messagesBySession[tab.sessionId]) {
      agent.loadMessages(tab.sessionId)
    }
  } else if (tab.type === 'file') {
    // 文件 Tab：保持当前 appMode 不变，仅激活 Tab
  } else if (tab.type === 'file-manager') {
    ws.setActiveModule('file')
    // 同步全局 selectedFolderId 以保持菜单高亮一致
    if (tab.folderId) {
      ws.selectFolder(tab.folderId)
    }
  } else if (tab.type === 'ocr-recognize') {
    ws.setActiveModule('invoice')
  } else if (tab.type === 'ocr-archive') {
    ws.setActiveModule('invoice')
  } else if (tab.type === 'planning') {
    ws.setActiveModule('planning')
  } else if (tab.type === 'skills') {
    ws.setActiveModule('skills')
  } else if (tab.type === 'setting') {
    ws.setActiveModule('setting')
  }
}

/** 关闭标签 */
function onClose(tabId) {
  tabStore.closeTab(tabId)

  // 如果关闭后还有标签，激活新的标签
  if (tabStore.tabMode && tabStore.activeTab) {
    const activeTab = tabStore.activeTab
    if (activeTab.type === 'chat') {
      ws.setAppMode('chat')
      ws.currentChatSessionId = activeTab.sessionId
    } else if (activeTab.type === 'agent') {
      ws.setAppMode('agent')
    } else if (TOOL_TAB_MODULE_MAP[activeTab.type]) {
      ws.setActiveModule(TOOL_TAB_MODULE_MAP[activeTab.type])
    }
  }
}

// 新增 Tab 时自动滚动到最右
watch(
  () => tabStore.tabs.length,
   (newLen, oldLen) => {
    if (newLen > oldLen) {
      nextTick(() => {
        scrollToTab(tabStore.activeTabId)
      })
    }
  },
)

// 激活 Tab 变化时自动滚动到可见区域
watch(
  () => tabStore.activeTabId,
  (tabId) => {
    if (tabId) {
      nextTick(() => {
        scrollToTab(tabId)
      })
    }
  },
)

/**
 * 将指定 Tab 滚动到可见区域
 * @param {string} tabId - 目标 Tab ID
 */
function scrollToTab(tabId) {
  if (!scrollRef.value) return
  const container = scrollRef.value
  const item = container.querySelector(`[data-tab-id="${tabId}"]`)
  if (!item) return

  const containerLeft = container.scrollLeft
  const containerRight = containerLeft + container.clientWidth
  const itemLeft = item.offsetLeft
  const itemRight = itemLeft + item.offsetWidth

  if (itemLeft < containerLeft) {
    // Tab 在左侧不可见区域，向左滚动
    container.scrollTo({ left: itemLeft - 8, behavior: 'smooth' })
  } else if (itemRight > containerRight) {
    // Tab 在右侧不可见区域，向右滚动
    container.scrollTo({ left: itemRight - container.clientWidth + 8, behavior: 'smooth' })
  }
}
</script>
