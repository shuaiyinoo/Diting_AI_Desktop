<template>
  <div
    class="flex h-full w-full items-center px-3"
    :class="{ 'pl-[78px]': isMac, 'pr-0': isWin }"
  >
    <!-- 左侧：产品图标 + 模式切换 -->
    <div class="flex items-center gap-2.5" style="-webkit-app-region: no-drag">
      <!-- 产品图标 -->
      <div class="flex shrink-0 items-center justify-center">
        <img src="/favicon-32x32.png" alt="谛听AI" draggable="false" class="h-[22px] w-[22px] rounded" />
      </div>

      <!-- 模式切换（已隐藏）
      <div class="inline-flex h-7 items-center rounded-md bg-[var(--bg-hover)] p-0.5">
        <button
          class="inline-flex h-6 items-center justify-center rounded px-3 text-xs font-medium transition-all duration-150"
          :class="mode === 'local' ? 'bg-[#1677ff] text-white shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'"
          @click="setMode('local')"
        >
          本地
        </button>
        <button
          v-if="remoteAddress"
          class="inline-flex h-6 items-center justify-center rounded px-3 text-xs font-medium transition-all duration-150"
          :class="mode === 'remote' ? 'bg-[#52c41a] text-white shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'"
          @click="setMode('remote')"
        >
          远程
        </button>
        <button
          class="ml-0.5 inline-flex size-6 items-center justify-center rounded text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          title="添加/修改远程地址"
          @click="onAddRemote"
        >
          <Plus class="size-3.5" />
        </button>
      </div>
      -->
    </div>

    <!-- 右侧：软件名称 + 副标题 -->
    <div
      class="ml-auto flex items-center gap-2 pl-4"
      style="-webkit-app-region: drag"
    >
      <div class="text-sm font-bold tracking-wide text-[var(--text-primary)] whitespace-nowrap">谛听AI</div>
      <div class="text-[11px] tracking-wide text-[var(--text-muted)] whitespace-nowrap">为AI聆听真实</div>
    </div>

    <!-- Windows 窗口控制按钮 -->
    <div
      v-if="isWin"
      class="flex h-full shrink-0 items-center"
      style="-webkit-app-region: no-drag"
    >
      <button
        class="flex h-full w-[46px] items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
        title="最小化"
        @click="winMinimize"
      >
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" stroke-width="1" /></svg>
      </button>
      <button
        class="flex h-full w-[46px] items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
        title="最大化"
        @click="winMaximize"
      >
        <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1" /></svg>
      </button>
      <button
        class="flex h-full w-[46px] items-center justify-center text-[var(--text-secondary)] transition-colors hover:bg-[#e81123] hover:text-white"
        title="关闭"
        @click="winClose"
      >
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" stroke-width="1" /></svg>
      </button>
    </div>

    <!-- 远程地址编辑弹窗（已隐藏）
    <Dialog v-model:open="modalVisible">
      <DialogContent class="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{{ remoteAddress ? '修改远程地址' : '添加远程地址' }}</DialogTitle>
        </DialogHeader>
        <Input
          :model-value="remoteInput"
          @update:model-value="remoteInput = $event"
          placeholder="请输入远程服务地址，如 http://192.168.1.100:9527"
        />
        <DialogFooter>
          <Button variant="outline" @click="modalVisible = false">取消</Button>
          <Button @click="onSaveRemote">保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    -->
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { toast } from 'vue-sonner';
import { Plus } from '@lucide/vue';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
  toast.success(remoteAddress.value ? '远程地址已保存' : '远程地址已清除');
}
</script>
