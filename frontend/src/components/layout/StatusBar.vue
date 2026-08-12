<template>
  <div class="status-bar">
    <!-- 左侧 -->
    <div class="status-bar__left">
      <!-- 版本号 -->
      <a-tooltip title="检查更新" placement="topLeft">
        <span class="status-bar__item" @click="onCheckUpdate">
          <sync-outlined class="status-bar__icon" />
          <span class="status-bar__text">v{{ appVersion }}</span>
        </span>
      </a-tooltip>

      <span class="status-bar__separator" />

      <!-- 远程地址 -->
      <a-tooltip :title="remoteAddress ? remoteAddress : '添加远程地址'" placement="topLeft">
        <span class="status-bar__item" @click="onEditRemote">
          <cloud-outlined class="status-bar__icon" />
          <span class="status-bar__text">{{ remoteAddress || '无远程' }}</span>
        </span>
      </a-tooltip>
    </div>

    <!-- 右侧 -->
    <div class="status-bar__right">
      <!-- 贡献 -->
      <a-tooltip title="GitHub">
        <span class="status-bar__item" @click="openExternal('https://github.com')">
          <github-outlined class="status-bar__icon" />
          <span class="status-bar__text">贡献</span>
        </span>
      </a-tooltip>

      <span class="status-bar__separator" />

      <!-- 文档 -->
      <a-tooltip title="文档">
        <span class="status-bar__item" @click="openExternal('https://github.com')">
          <book-outlined class="status-bar__icon" />
          <span class="status-bar__text">文档</span>
        </span>
      </a-tooltip>

      <span class="status-bar__separator" />

      <!-- 主题切换 -->
      <a-tooltip :title="isDark ? '切换到白天模式' : '切换到黑夜模式'">
        <span class="status-bar__item" @click="toggleTheme">
          <!-- 白天模式显示月亮（点击切换到黑夜），黑夜模式显示太阳（点击切换到白天） -->
          <svg v-if="!isDark" class="status-bar__icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"/>
          </svg>
          <svg v-else class="status-bar__icon" viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
            <circle cx="12" cy="12" r="4"/>
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
          </svg>
          <span class="status-bar__text">{{ isDark ? '白天' : '黑夜' }}</span>
        </span>
      </a-tooltip>

      <span class="status-bar__separator" />

      <!-- 内置浏览器 -->
      <a-tooltip :title="browserStore.panelOpen ? '关闭内置浏览器' : '打开内置浏览器'">
        <span
          class="status-bar__item"
          :class="{ 'status-bar__item--active': browserStore.panelOpen }"
          @click="toggleBrowser"
        >
          <global-outlined class="status-bar__icon" />
          <span class="status-bar__text">浏览器</span>
        </span>
      </a-tooltip>

      <span class="status-bar__separator" />

      <!-- 设置 -->
      <a-tooltip title="设置">
        <span class="status-bar__item" @click="goSettings">
          <setting-outlined class="status-bar__icon" />
          <span class="status-bar__text">设置</span>
        </span>
      </a-tooltip>
    </div>

    <!-- 远程地址编辑弹窗 -->
    <a-modal
      v-model:open="remoteModalVisible"
      title="配置远程地址"
      ok-text="保存"
      cancel-text="取消"
      @ok="onSaveRemote"
      width="420px"
    >
      <a-input
        v-model:value="remoteInput"
        placeholder="请输入远程服务地址，如 http://192.168.1.100:9527"
        allow-clear
      />
    </a-modal>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { isDark, toggleTheme } from '@/theme';
import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';
import { useTabStore } from '@/stores/tab';
import { useBrowserStore } from '@/stores/browser';

const router = useRouter();
const tabStore = useTabStore();
const browserStore = useBrowserStore();

const appVersion = ref('1.0.0');
const remoteAddress = ref('');
const remoteModalVisible = ref(false);
const remoteInput = ref('');

onMounted(() => {
  // 读取持久化的远程地址
  const saved = localStorage.getItem('remote-address');
  if (saved) {
    remoteAddress.value = saved;
  }
});

async function onCheckUpdate() {
  try {
    message.loading('正在检查更新...', 1.5);
    await ipc.invoke(ipcApiRoute.framework.checkForUpdater);
  } catch {
    message.info('检查更新功能待接入');
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
  message.success('远程地址已保存');
}

function openExternal(url) {
  // 尝试用 Electron shell 打开外部链接，降级用 window.open
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

/** 切换内置浏览器面板 */
function toggleBrowser() {
  const sessionId = tabStore.activeTab?.sessionId || null;
  browserStore.toggleBrowser(sessionId);
}
</script>

<style lang="less" scoped>
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 25px;
  padding: 0 10px;
  background-color: var(--bg-statusbar);
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
  user-select: none;
  font-size: 12px;
  color: var(--text-secondary);
  transition: background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease;
  -webkit-app-region: drag;

  &__left,
  &__right {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  &__item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.15s ease, color 0.15s ease;
    -webkit-app-region: no-drag;

    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }

    &--active {
      color: var(--accent);
      background-color: var(--bg-active);
    }
  }

  &__icon {
    font-size: 12px;
    line-height: 1;
  }

  &__text {
    line-height: 1;
    white-space: nowrap;
  }

  &__separator {
    width: 1px;
    height: 12px;
    background-color: var(--border-color);
    margin: 0 2px;
    flex-shrink: 0;
  }
}
</style>
