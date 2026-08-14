<template>
  <div
    class="flex h-[25px] shrink-0 select-none items-center justify-between border-t border-border bg-sidebar px-2.5 text-xs text-muted-foreground transition-colors duration-250"
    style="-webkit-app-region: drag"
  >
    <!-- 左侧 -->
    <div class="flex items-center gap-1">
      <!-- 版本号 -->
      <Tooltip>
        <TooltipTrigger as-child>
          <span
            class="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
            style="-webkit-app-region: no-drag"
            @click="onCheckUpdate"
          >
            <RefreshCw class="size-3.5" />
            <span class="whitespace-nowrap leading-none">v{{ appVersion }}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">检查更新</TooltipContent>
      </Tooltip>

      <span class="mx-0.5 h-3 w-px shrink-0 bg-border" />

      <!-- 远程地址 -->
      <Tooltip>
        <TooltipTrigger as-child>
          <span
            class="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
            style="-webkit-app-region: no-drag"
            @click="onEditRemote"
          >
            <Cloud class="size-3.5" />
            <span class="whitespace-nowrap leading-none">{{ remoteAddress || '无远程' }}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          {{ remoteAddress ? remoteAddress : '添加远程地址' }}
        </TooltipContent>
      </Tooltip>
    </div>

    <!-- 右侧 -->
    <div class="flex items-center gap-1">
      <!-- 贡献 -->
      <Tooltip>
        <TooltipTrigger as-child>
          <span
            class="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
            style="-webkit-app-region: no-drag"
            @click="openExternal('https://github.com')"
          >
            <Star class="size-3.5" />
            <span class="whitespace-nowrap leading-none">贡献</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">GitHub</TooltipContent>
      </Tooltip>

      <span class="mx-0.5 h-3 w-px shrink-0 bg-border" />

      <!-- 文档 -->
      <Tooltip>
        <TooltipTrigger as-child>
          <span
            class="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
            style="-webkit-app-region: no-drag"
            @click="openExternal('https://github.com')"
          >
            <Book class="size-3.5" />
            <span class="whitespace-nowrap leading-none">文档</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">文档</TooltipContent>
      </Tooltip>

      <span class="mx-0.5 h-3 w-px shrink-0 bg-border" />

      <!-- 主题切换 -->
      <Tooltip>
        <TooltipTrigger as-child>
          <span
            class="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
            style="-webkit-app-region: no-drag"
            @click="toggleTheme"
          >
            <Moon v-if="!isDark" class="size-3.5" />
            <Sun v-else class="size-3.5" />
            <span class="whitespace-nowrap leading-none">{{ isDark ? '白天' : '黑夜' }}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          {{ isDark ? '切换到白天模式' : '切换到黑夜模式' }}
        </TooltipContent>
      </Tooltip>

      <span class="mx-0.5 h-3 w-px shrink-0 bg-border" />

      <!-- 内置浏览器 -->
      <Tooltip>
        <TooltipTrigger as-child>
          <span
            class="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
            :class="{ 'text-primary bg-accent': browserStore.panelOpen }"
            style="-webkit-app-region: no-drag"
            @click="toggleBrowser"
          >
            <Globe class="size-3.5" />
            <span class="whitespace-nowrap leading-none">浏览器</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          {{ browserStore.panelOpen ? '关闭内置浏览器' : '打开内置浏览器' }}
        </TooltipContent>
      </Tooltip>

      <span class="mx-0.5 h-3 w-px shrink-0 bg-border" />

      <!-- 设置 -->
      <Tooltip>
        <TooltipTrigger as-child>
          <span
            class="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
            style="-webkit-app-region: no-drag"
            @click="goSettings"
          >
            <Settings class="size-3.5" />
            <span class="whitespace-nowrap leading-none">设置</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">设置</TooltipContent>
      </Tooltip>
    </div>

    <!-- 远程地址编辑弹窗 -->
    <Dialog v-model:open="remoteModalVisible">
      <DialogContent class="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>配置远程地址</DialogTitle>
        </DialogHeader>
        <Input
          :model-value="remoteInput"
          @update:model-value="remoteInput = $event"
          placeholder="请输入远程服务地址，如 http://192.168.1.100:9527"
        />
        <DialogFooter>
          <Button variant="outline" @click="remoteModalVisible = false">取消</Button>
          <Button @click="onSaveRemote">保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { toast } from 'vue-sonner';
import {
  RefreshCw, Cloud, Star, Book, Moon, Sun, Globe, Settings,
} from '@lucide/vue';
import { isDark, toggleTheme } from '@/theme';
import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';
import { useTabStore } from '@/stores/tab';
import { useBrowserStore } from '@/stores/browser';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const router = useRouter();
const tabStore = useTabStore();
const browserStore = useBrowserStore();

const appVersion = ref('1.0.0');
const remoteAddress = ref('');
const remoteModalVisible = ref(false);
const remoteInput = ref('');

onMounted(() => {
  const saved = localStorage.getItem('remote-address');
  if (saved) {
    remoteAddress.value = saved;
  }
});

async function onCheckUpdate() {
  try {
    toast.loading('正在检查更新...');
    await ipc.invoke(ipcApiRoute.framework.checkForUpdater);
  } catch {
    toast.info('检查更新功能待接入');
  }
}

function onEditRemote() {
  remoteInput.value = remoteAddress.value;
  remoteModalVisible.value = true;
}

function onSaveRemote() {
  remoteAddress.value = remoteInput.value.trim();
  if (remoteAddress.value) {
    localStorage.setItem('remote-address', remoteAddress.value);
  } else {
    localStorage.removeItem('remote-address');
  }
  remoteModalVisible.value = false;
  toast.success('远程地址已保存');
}

function openExternal(url) {
  try {
    if (window.electron?.shell?.openExternal) {
      window.electron.shell.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  } catch {
    window.open(url, '_blank');
  }
}

function goSettings() {
  router.push('/setting');
}

function toggleBrowser() {
  const sessionId = tabStore.activeTab?.sessionId || null;
  browserStore.toggleBrowser(sessionId);
}
</script>
