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

      <!-- 第二~四部分：各模块视图 -->
      <div class="main-layout__content">
        <router-view />
      </div>
    </div>

    <!-- 底部：状态栏 -->
    <StatusBar />
  </div>
</template>

<script setup>
import StatusBar from '@/components/layout/StatusBar.vue'
import TopBar from '@/components/layout/TopBar.vue'
import MenuBar from '@/components/layout/MenuBar.vue'
import PanelDivider from '@/components/layout/PanelDivider.vue'
import { useWorkspaceStore } from '@/stores/workspace'

const ws = useWorkspaceStore()

/** 菜单栏拖拽调整宽度 */
function onMenuResize(delta) {
  ws.menuWidth = Math.min(300, Math.max(200, ws.menuWidth + delta))
}
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

  // ===== 内容区 =====
  &__content {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    display: flex;
  }
}
</style>
