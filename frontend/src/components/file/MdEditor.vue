<template>
  <div class="flex h-full flex-col overflow-hidden bg-panel">
    <!-- 加载态 -->
    <div v-if="loading" class="flex h-full items-center justify-center">
      <div class="flex flex-col items-center gap-3 text-app-muted">
        <Loader2 class="size-6 animate-spin" />
        <span class="text-sm">{{ t('mdEditor.loading') }}</span>
      </div>
    </div>

    <!-- 编辑器主体 -->
    <MdTtEditor
      v-else
      v-model="content"
      :editable="true"
      @change="onContentChange"
      ref="editorRef"
    />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { Loader2 } from '@lucide/vue';
import MdTtEditor from '@/components/common/MdTtEditor.vue';
import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  fileItemId: { type: [Number, String], default: null },
});

const content = ref('');
const loading = ref(true);
const editorRef = ref(null);

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
    // 确保编辑器最新内容已同步到 content
    if (editorRef.value) {
      await editorRef.value.save();
    }

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
