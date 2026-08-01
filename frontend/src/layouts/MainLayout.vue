<template>
  <div class="main-layout">
    <!-- 顶部拖拽条（为 macOS 交通灯留空间 + 居中显示模式切换） -->
    <div class="main-layout__dragbar">
      <TopBar />
    </div>
    <div class="main-layout__content">
      <router-view />
    </div>
    <StatusBar />
  </div>
</template>

<script setup>
import StatusBar from '@/components/layout/StatusBar.vue';
import TopBar from '@/components/layout/TopBar.vue';
</script>

<style lang="less" scoped>
.main-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background-color: var(--bg-layout);

  &__dragbar {
    height: 40px;
    flex-shrink: 0;
    -webkit-app-region: drag;
    background-color: var(--bg-panel);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  &__content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
}
</style>
