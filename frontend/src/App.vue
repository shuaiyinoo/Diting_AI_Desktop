<template>
  <a-config-provider :theme="themeConfig">
    <div class="app-shell">
      <!-- 左侧：原有全部应用（MainLayout: TopBar + middle + StatusBar） -->
      <router-view class="app-shell__main" />

      <!-- 右侧：内置浏览器面板（仅 panelOpen 时渲染，关闭后 0px 不可见） -->
      <template v-if="browserStore.panelOpen">
        <PanelDivider @resize="browserStore.onPanelResize" />
        <BrowserSidePanel class="app-shell__browser" :style="{ width: browserStore.panelWidth + 'px' }" />
      </template>
    </div>
  </a-config-provider>
</template>

<script setup>
import { onMounted } from 'vue';
import { themeConfig } from './theme';
import { useBrowserStore } from '@/stores/browser';
import PanelDivider from '@/components/layout/PanelDivider.vue';
import BrowserSidePanel from '@/components/browser/BrowserSidePanel.vue';

const browserStore = useBrowserStore();

onMounted(() => {
  const loadingElement = document.getElementById('loadingPage');
  if (loadingElement) {
    loadingElement.remove();
  }

  // 订阅主进程浏览器状态变更
  browserStore.subscribeStateChanges();
});
</script>

<style lang="less">
.app-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__browser {
    flex-shrink: 0;
    overflow: hidden;
  }
}
</style>
