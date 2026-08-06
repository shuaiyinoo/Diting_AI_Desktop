<template>
  <div class="main-layout">
    <!-- 顶部：拖拽条 + 模式切换 -->
    <div class="main-layout__topbar">
      <TopBar />
    </div>

    <!-- 中间：菜单栏 + 分隔条 + 内容区 -->
    <div class="main-layout__middle">
      <!-- 第一部分：菜单栏 -->
      <MenuBar />

      <!-- 菜单栏拖拽分隔条（仅展开时显示） -->
      <PanelDivider
        v-if="!ws.menuCollapsed"
        @resize="onMenuResize"
      />

      <!-- 第二~四部分：Tab 栏 + 各模块视图 -->
      <div class="main-layout__content">
        <!-- Tab 栏（仅 Tab 模式时显示） -->
        <TabBar v-if="tabStore.tabMode" />

        <!-- 内容区：Tab 模式渲染会话视图，路由模式渲染工具页面 -->
        <div class="main-layout__body">
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

<style lang="less" scoped>
.main-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background-color: var(--bg-layout);

  // ===== 顶部拖拽条 =====
  &__topbar {
    height: 40px;
    flex-shrink: 0;
    -webkit-app-region: drag;
    background-color: var(--bg-panel);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    border-bottom: 1px solid var(--border-color);
  }

  // ===== 中间区域：菜单栏 + 内容 =====
  &__middle {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
  }

  // ===== 内容区（Tab 栏 + 视图） =====
  &__content {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  // ===== 视图主体 =====
  &__body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
}
</style>
