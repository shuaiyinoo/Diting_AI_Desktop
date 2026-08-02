<template>
  <div class="top-bar" :class="{ 'top-bar--mac': isMac, 'top-bar--win': isWin }">
    <!-- 左侧：产品图标 + 模式切换 -->
    <div class="top-bar__left">
      <!-- 产品图标（使用项目实际图标） -->
      <div class="top-bar__logo">
        <img src="/favicon-32x32.png" alt="谛听AI" draggable="false" />
      </div>

      <!-- 模式切换 -->
      <div class="seg-group">
        <button
          class="seg-btn"
          :class="{ 'seg-btn--active-blue': mode === 'local' }"
          @click="setMode('local')"
        >
          本地
        </button>

        <button
          v-if="remoteAddress"
          class="seg-btn"
          :class="{ 'seg-btn--active-green': mode === 'remote' }"
          @click="setMode('remote')"
        >
          远程
        </button>

        <button class="seg-btn seg-btn--add" @click="onAddRemote" title="添加/修改远程地址">
          <plus-outlined />
        </button>
      </div>
    </div>

    <!-- 右侧：软件名称 + 副标题 -->
    <div class="top-bar__right">
      <div class="top-bar__title">谛听AI</div>
      <div class="top-bar__subtitle">为AI聆听真实</div>
    </div>

    <!-- Windows 窗口控制按钮 -->
    <div v-if="isWin" class="top-bar__win-controls">
      <button class="win-btn" title="最小化" @click="winMinimize">
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" stroke-width="1" /></svg>
      </button>
      <button class="win-btn" title="最大化" @click="winMaximize">
        <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1" /></svg>
      </button>
      <button class="win-btn win-btn--close" title="关闭" @click="winClose">
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" stroke-width="1" /></svg>
      </button>
    </div>

    <!-- 远程地址编辑弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :title="remoteAddress ? '修改远程地址' : '添加远程地址'"
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
import { ref, onMounted, computed } from 'vue';
import { message } from 'ant-design-vue';

// ===== 平台检测 =====
const platform = typeof process !== 'undefined' ? process.platform : ''
const isMac = computed(() => platform === 'darwin')
const isWin = computed(() => platform === 'win32')

// ===== 窗口控制（Windows） =====
function winMinimize() {
  const { ipcRenderer } = window.require('electron')
  ipcRenderer.send('window-minimize')
}

function winMaximize() {
  const { ipcRenderer } = window.require('electron')
  ipcRenderer.send('window-maximize')
}

function winClose() {
  const { ipcRenderer } = window.require('electron')
  ipcRenderer.send('window-close')
}

const mode = ref('local');
const remoteAddress = ref('');
const modalVisible = ref(false);
const remoteInput = ref('');

onMounted(() => {
  const saved = localStorage.getItem('remote-address');
  if (saved) {
    remoteAddress.value = saved;
  }
  const savedMode = localStorage.getItem('app-mode');
  if (savedMode === 'remote' && remoteAddress.value) {
    mode.value = 'remote';
  }
});

function setMode(newMode) {
  if (newMode === 'remote' && !remoteAddress.value) return;
  mode.value = newMode;
  localStorage.setItem('app-mode', newMode);
}

function onAddRemote() {
  remoteInput.value = remoteAddress.value;
  modalVisible.value = true;
}

function onSaveRemote() {
  remoteAddress.value = remoteInput.value.trim();
  if (remoteAddress.value) {
    localStorage.setItem('remote-address', remoteAddress.value);
  } else {
    localStorage.removeItem('remote-address');
    if (mode.value === 'remote') {
      mode.value = 'local';
      localStorage.setItem('app-mode', 'local');
    }
  }
  modalVisible.value = false;
  message.success(remoteAddress.value ? '远程地址已保存' : '远程地址已清除');
}
</script>

<style lang="less" scoped>
.top-bar {
  display: flex;
  align-items: center;
  height: 100%;
  width: 100%;
  padding: 0 12px;

  // macOS：左侧预留红绿灯空间
  &--mac {
    padding-left: 78px;
  }

  // Windows：右侧预留窗口控制按钮空间
  &--win {
    padding-right: 0;
  }

  &__left {
    display: flex;
    align-items: center;
    gap: 10px;
    -webkit-app-region: no-drag;
  }

  &__logo {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    img {
      width: 22px;
      height: 22px;
      border-radius: 4px;
      user-select: none;
      pointer-events: none;
    }
  }

  &__right {
    display: flex;
    align-items: center;
    gap: 8px;
    -webkit-app-region: drag;
    margin-left: auto;
    padding-left: 16px;
  }

  &__title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
    letter-spacing: 0.5px;
    white-space: nowrap;
  }

  &__subtitle {
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    letter-spacing: 0.3px;
  }
}

// ===== Windows 窗口控制按钮 =====
.top-bar__win-controls {
  display: flex;
  align-items: center;
  height: 100%;
  -webkit-app-region: no-drag;
  flex-shrink: 0;
}

.win-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.15s;

  &:hover {
    background-color: var(--bg-hover);
  }

  &--close:hover {
    background-color: #e81123;
    color: #fff;
  }
}

// ===== 模式切换组件 =====
.seg-group {
  display: inline-flex;
  align-items: center;
  height: 28px;
  background-color: var(--bg-hover);
  border-radius: 7px;
  padding: 2px;
  gap: 0;
}

.seg-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 24px;
  padding: 0 12px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.18s ease;
  white-space: nowrap;

  &:hover {
    color: var(--text-primary);
  }

  &--active-blue {
    background-color: #1677ff;
    color: #fff;
    box-shadow: 0 1px 4px rgba(22, 119, 255, 0.3);

    &:hover {
      color: #fff;
    }
  }

  &--active-green {
    background-color: #52c41a;
    color: #fff;
    box-shadow: 0 1px 4px rgba(82, 196, 26, 0.3);

    &:hover {
      color: #fff;
    }
  }

  &--add {
    width: 24px;
    padding: 0;
    font-size: 11px;
    margin-left: 2px;
  }
}
</style>
