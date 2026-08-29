<template>
  <div class="flex h-screen flex-col overflow-hidden bg-background">
    <!-- 顶部：拖拽条 + 模式切换 -->
    <div
      class="pattern-surface flex h-10 shrink-0 items-center justify-center border-b border-border bg-background"
      style="-webkit-app-region: drag"
    >
      <TopBar />
    </div>

    <!-- 中间：菜单栏 + 分隔条 + 内容区 -->
    <div class="flex min-h-0 flex-1 overflow-hidden bg-background" :class="uiStyle === 'modern' && !ws.menuCollapsed ? 'pt-2 pb-2 pl-2' : ''">
      <!-- 第一部分：菜单栏（现代风格下自带浮层卡片效果） -->
      <MenuBar />

      <!-- 菜单栏拖拽分隔条（仅展开且经典风格时显示） -->
      <PanelDivider
        v-if="!ws.menuCollapsed && uiStyle !== 'modern'"
        @resize="onMenuResize"
      />

      <!-- 第二~四部分：Tab 栏 + 各模块视图 -->
      <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
        <!-- Tab 栏（仅 Tab 模式时显示） -->
        <TabBar v-if="tabStore.tabMode" />

        <!-- 内容区：Tab 模式渲染会话视图，路由模式渲染工具页面 -->
        <div class="min-h-0 flex-1 overflow-hidden">
          <TabContent />
        </div>
      </div>
    </div>

    <!-- 底部：状态栏 -->
    <StatusBar />
  </div>
</template>

<script setup>
import { watch } from 'vue'
import StatusBar from '@/components/layout/StatusBar.vue'
import TopBar from '@/components/layout/TopBar.vue'
import MenuBar from '@/components/layout/MenuBar.vue'
import PanelDivider from '@/components/layout/PanelDivider.vue'
import TabBar from '@/components/tabs/TabBar.vue'
import TabContent from '@/components/tabs/TabContent.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import { useTabStore } from '@/stores/tab'
import { uiStyle } from '@/theme'

const ws = useWorkspaceStore()
const tabStore = useTabStore()

/** 菜单栏拖拽调整宽度 */
function onMenuResize(delta) {
  ws.menuWidth = Math.min(300, Math.max(200, ws.menuWidth + delta))
}

/**
 * Tab 模式下同步 activeModule：
 * 当活跃标签变化时，自动切换 MenuBar 的高亮模块
 * （路由模式由 MenuBar 的 route.path watch 处理）
 */
watch(
  () => tabStore.activeTab,
  (tab) => {
    if (!tabStore.tabMode || !tab) return
    if (tab.type === 'chat') {
      ws.setActiveModule('chat')
      ws.setAppMode('chat')
    } else if (tab.type === 'agent') {
      ws.setActiveModule('agent')
      ws.setAppMode('agent')
    }
  },
  { immediate: true },
)
</script>
