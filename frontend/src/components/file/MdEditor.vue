<template>
  <div class="md-editor-wrap">
    <!-- 顶部工具栏 -->
    <div class="md-editor-wrap__toolbar">
      <div class="md-editor-wrap__title">
        <edit-outlined class="md-editor-wrap__icon" />
        <span class="md-editor-wrap__name" :title="fileName">{{ fileName || '文件编辑' }}</span>
      </div>
      <!-- 右侧：折叠第四面板按钮 -->
      <a-tooltip :title="panel4Collapsed ? '展开信息面板' : '收起信息面板'">
        <button class="md-toggle-btn" @click="$emit('toggle-panel4')">
          <component :is="panel4Collapsed ? 'MenuFoldOutlined' : 'MenuUnfoldOutlined'" />
        </button>
      </a-tooltip>
    </div>

    <!-- 编辑器主体 -->
    <div class="md-editor-wrap__body">
      <div class="md-editor-loading" v-if="loading">
        <a-spin tip="正在加载文件..." />
      </div>
      <MdEditorV3
        v-else
        v-model="content"
        :theme="isDark ? 'dark' : 'light'"
        :preview-theme="isDark ? 'dark' : 'default'"
        :language="'zh-CN'"
        :toolbars-exclude="['github', 'save', 'pageFullscreen', 'fullscreen', 'htmlPreview', 'catalog', 'mermaid', 'formula']"
        :show-toc="false"
        :preview-only="false"
        :style="{ height: '100%' }"
        @on-change="onContentChange"
        @on-save="onManualSave"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { MdEditor } from 'md-editor-v3';
import 'md-editor-v3/lib/style.css';
import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';
import { isDark } from '@/theme';

// 重命名导入以避免命名冲突
const MdEditorV3 = MdEditor;

const props = defineProps({
  fileItemId: { type: [Number, String], default: null },
  fileName: { type: String, default: '' },
  panel4Collapsed: { type: Boolean, default: false },
});

const emit = defineEmits(['toggle-panel4', 'rename']);

const content = ref('');
const loading = ref(true);

// 防抖自动保存
let saveTimer = null;
let originalContent = '';

function isContentChanged() {
  return content.value !== originalContent;
}

// 加载文件内容
async function loadFile() {
  if (!props.fileItemId) return;
  loading.value = true;
  try {
    const result = await ipc.invoke(ipcApiRoute.file.getFileData, {
      fileItemId: Number(props.fileItemId),
    });
    if (result && result.success && result.buffer) {
      // 将 Uint8Array 转为字符串
      const uint8 = result.buffer instanceof Uint8Array
        ? result.buffer
        : new Uint8Array(result.buffer);
      content.value = new TextDecoder('utf-8').decode(uint8);
      originalContent = content.value;
    } else {
      content.value = '';
      originalContent = '';
      console.error('[MdEditor] 加载文件失败:', result?.message);
    }
  } catch (err) {
    console.error('[MdEditor] 加载文件异常:', err);
    content.value = '';
    originalContent = '';
  } finally {
    loading.value = false;
  }
}

// 防抖写入文件
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    doSave();
  }, 1000);
}

async function doSave() {
  if (!props.fileItemId) return;
  if (!isContentChanged()) return;

  try {
    // 将文本转为 Uint8Array
    const encoder = new TextEncoder();
    const uint8 = encoder.encode(content.value);

    const result = await ipc.invoke(ipcApiRoute.file.saveFileData, {
      fileItemId: Number(props.fileItemId),
      buffer: uint8,
    });
    if (result && result.success) {
      originalContent = content.value;
    } else {
      console.error('[MdEditor] 保存失败:', result?.message);
    }
  } catch (err) {
    console.error('[MdEditor] 保存异常:', err);
  }
}

function onContentChange() {
  scheduleSave();
}

function onManualSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  doSave();
}

// 公开 save 方法
async function save() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await doSave();
}

defineExpose({ save });

// 文件切换时重新加载
watch(
  () => props.fileItemId,
  () => {
    loadFile();
  }
);

onMounted(() => {
  loadFile();
});

onBeforeUnmount(() => {
  // 组件销毁前确保待保存的数据落盘
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
    doSave();
  }
});
</script>

<style lang="less" scoped>
.md-editor-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--bg-panel);
  overflow: hidden;

  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px 0 14px;
    height: 40px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-color);
    background-color: var(--bg-panel);
  }

  &__title {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }

  &__icon {
    color: var(--accent);
    font-size: 14px;
    flex-shrink: 0;
  }

  &__name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
}

.md-editor-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.md-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 14px;

  &:hover {
    background-color: var(--bg-hover);
    color: var(--text-primary);
  }
}
</style>
