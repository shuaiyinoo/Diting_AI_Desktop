<template>
  <TooltipProvider :delay-duration="300">
    <div class="flex h-screen overflow-hidden">
      <!-- 左侧：原有全部应用（MainLayout: TopBar + middle + StatusBar） -->
      <router-view class="flex-1 min-w-0" />

      <!-- 右侧：内置浏览器面板（仅 panelOpen 时渲染，关闭后 0px 不可见） -->
      <template v-if="browserStore.panelOpen">
        <PanelDivider @resize="browserStore.onPanelResize" />
        <BrowserSidePanel class="flex-shrink-0 overflow-hidden" :style="{ width: browserStore.panelWidth + 'px' }" />
      </template>
    </div>

    <!-- Toast 通知（放在 overflow-hidden 容器外部，确保 fixed 定位不受裁剪） -->
    <Toaster />
  </TooltipProvider>
</template>

<script setup>
import { onMounted } from 'vue';
import { TooltipProvider } from 'reka-ui';
import { useBrowserStore } from '@/stores/browser';
import { Toaster } from '@/components/ui/sonner';
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
