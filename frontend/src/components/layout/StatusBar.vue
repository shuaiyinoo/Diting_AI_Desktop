<template>
  <div
    class="pattern-surface flex h-[25px] shrink-0 select-none items-center justify-between border-t border-border bg-sidebar px-2.5 text-xs text-muted-foreground transition-colors duration-250"
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
            @click="goToAbout"
          >
            <RefreshCw v-if="updaterStore.hasUpdate" class="size-3.5 text-primary" />
            <span
              class="whitespace-nowrap leading-none"
              :class="updaterStore.hasUpdate ? 'text-primary font-medium' : ''"
            >v{{ appVersion }}</span>
            <span v-if="updaterStore.hasUpdate" class="size-1.5 rounded-full bg-primary" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          {{ updaterStore.hasUpdate ? t('statusBar.hasUpdate') : t('statusBar.about') }}
        </TooltipContent>
      </Tooltip>

      <span class="mx-0.5 h-3 w-px shrink-0 bg-border" />

      <!-- 登录状态 + WS 连接 -->
      <div v-if="!authStore.isLoggedIn" class="flex items-center gap-1 px-1.5 py-0.5">
        <span class="size-1.5 rounded-full bg-muted-foreground/40" />
        <span class="whitespace-nowrap leading-none text-muted-foreground">{{ t('statusBar.notLoggedIn') }}</span>
      </div>
      <div v-else class="flex items-center gap-1 px-1.5 py-0.5">
        <span class="size-1.5 rounded-full bg-green-500" />
        <span class="whitespace-nowrap leading-none">{{ t('statusBar.loggedIn') }}</span>
        <span class="mx-1 h-3 w-px shrink-0 bg-border" />
        <span
          class="size-1.5 rounded-full"
          :class="remoteStore.connState === 'connected' ? 'bg-green-500' : remoteStore.connState === 'connecting' ? 'bg-amber-500' : 'bg-muted-foreground/40'"
        />
        <span class="whitespace-nowrap leading-none text-muted-foreground">{{ t(remoteStore.connStateText) }}</span>
      </div>

      <!-- 远程操控状态（仅登录后显示） -->
      <template v-if="authStore.isLoggedIn">
        <span class="mx-0.5 h-3 w-px shrink-0 bg-border" />
        <div class="flex items-center gap-1 px-1.5 py-0.5">
          <span
            class="size-1.5 rounded-full"
            :class="remoteStore.peerJoined ? 'bg-green-500' : 'bg-muted-foreground/40'"
          />
          <span class="whitespace-nowrap leading-none text-muted-foreground">
            {{ remoteStore.peerJoined ? t('statusBar.remoteControlling') : t('statusBar.notControlled') }}
          </span>
        </div>
      </template>
    </div>

    <!-- 右侧 -->
    <div class="flex items-center gap-1">
      <!-- 贡献 -->
      <Tooltip>
        <TooltipTrigger as-child>
          <span
            class="inline-flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
            style="-webkit-app-region: no-drag"
            @click="openExternal('https://github.com/shuaiyinoo/Diting_AI_Desktop')"
          >
            <Star class="size-3.5" />
            <span class="whitespace-nowrap leading-none">{{ t('statusBar.contribute') }}</span>
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
            @click="openExternal('https://ditingrag.com/cn/guide/introduction')"
          >
            <Book class="size-3.5" />
            <span class="whitespace-nowrap leading-none">{{ t('statusBar.docs') }}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{{ t('statusBar.docs') }}</TooltipContent>
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
            <span class="whitespace-nowrap leading-none">{{ isDark ? t('statusBar.lightMode') : t('statusBar.darkMode') }}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          {{ isDark ? t('statusBar.switchToLight') : t('statusBar.switchToDark') }}
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
            <span class="whitespace-nowrap leading-none">{{ t('statusBar.browser') }}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          {{ browserStore.panelOpen ? t('statusBar.closeBrowser') : t('statusBar.openBrowser') }}
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
            <span class="whitespace-nowrap leading-none">{{ t('statusBar.settings') }}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{{ t('statusBar.settings') }}</TooltipContent>
      </Tooltip>
    </div>

    <!-- 远程地址编辑弹窗 -->
    <Dialog v-model:open="remoteModalVisible">
      <DialogContent class="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{{ t('statusBar.configRemote') }}</DialogTitle>
        </DialogHeader>
        <Input
          :model-value="remoteInput"
          @update:model-value="remoteInput = $event"
          :placeholder="t('statusBar.remotePlaceholder')"
        />
        <DialogFooter>
          <Button variant="outline" @click="remoteModalVisible = false">{{ t('common.cancel') }}</Button>
          <Button @click="onSaveRemote">{{ t('common.save') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import {
  RefreshCw, Cloud, Star, Book, Moon, Sun, Globe, Settings,
} from '@lucide/vue';
import { isDark, toggleTheme } from '@/theme';
import { ipcApiRoute, remoteStatusChannel } from '@/api';
import { ipc } from '@/utils/ipcRenderer';
import { useTabStore } from '@/stores/tab';
import { useBrowserStore } from '@/stores/browser';
import { useUpdaterStore } from '@/stores/updater';
import { useAuthStore } from '@/stores/auth';
import { useRemoteStore } from '@/stores/remote';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const router = useRouter();
const { t } = useI18n();
const tabStore = useTabStore();
const browserStore = useBrowserStore();
const updaterStore = useUpdaterStore();
const authStore = useAuthStore();
const remoteStore = useRemoteStore();

const appVersion = ref('1.0.0');
const remoteAddress = ref('');
const remoteModalVisible = ref(false);
const remoteInput = ref('');

onMounted(() => {
  const saved = localStorage.getItem('remote-address');
  if (saved) {
    remoteAddress.value = saved;
  }

  // 初始化更新状态订阅
  updaterStore.initialize();

  // 获取应用版本号
  updaterStore.getAppVersion().then((v) => {
    if (v) appVersion.value = v;
  });

  // 同步登录状态
  authStore.syncStatus();

  // 同步远程控制状态并监听主进程推送
  remoteStore.fetchStatus();
  remoteStore.bindStatusListener();
});

onUnmounted(() => {
  remoteStore.unbindStatusListener();
});

/**
* 跳转到设置-关于/更新页面
*/
function goToAbout() {
  tabStore.openToolTab('setting', t('statusBar.settings'));
  // 通过路由 query 参数传递子页签
  router.push({ path: '/setting', query: { tab: 'about' } });
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
  toast.success(t('statusBar.remoteSaved'));
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
  tabStore.openToolTab('setting', t('statusBar.settings'));
}

function toggleBrowser() {
  const sessionId = tabStore.activeTab?.sessionId || null;
  browserStore.toggleBrowser(sessionId);
}
</script>
