<template>
  <div class="top-bar">
    <!-- 居中的模式切换 -->
    <div class="top-bar__center">
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
import { ref, onMounted } from 'vue';
import { message } from 'ant-design-vue';

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
  justify-content: center;
  height: 100%;
  width: 100%;

  &__center {
    display: flex;
    align-items: center;
    -webkit-app-region: no-drag;
  }
}

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
