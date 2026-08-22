<template>
  <div class="flex h-full flex-col overflow-hidden bg-panel">
    <!-- 顶部工具栏 -->
    <div class="flex h-10 shrink-0 items-center justify-between border-b border-border px-2 pl-3.5">
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <Pencil class="size-3.5 shrink-0 text-accent-app" />
        <span class="truncate text-[13px] font-medium text-app-primary" :title="fileName">{{ fileName || t('mdEditor.fileEdit') }}</span>
      </div>
      <!-- 右侧：折叠第四面板按钮 -->
      <Tooltip side="bottom">
        <TooltipTrigger as-child>
          <button
            class="inline-flex size-7 items-center justify-center rounded-md text-app-secondary transition-colors hover:bg-hover hover:text-app-primary"
            @click="$emit('toggle-panel4')"
          >
            <PanelRightClose v-if="!panel4Collapsed" class="size-3.5" />
            <PanelRightOpen v-else class="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{{ panel4Collapsed ? t('mdEditor.expandPanel') : t('mdEditor.collapsePanel') }}</TooltipContent>
      </Tooltip>
    </div>

    <!-- 编辑器主体 -->
    <div class="flex-1 min-h-0 overflow-hidden">
      <div v-if="loading" class="flex h-full items-center justify-center">
        <div class="flex flex-col items-center gap-3 text-app-muted">
          <Loader2 class="size-6 animate-spin" />
          <span class="text-sm">{{ t('mdEditor.loading') }}</span>
        </div>
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
import { Loader2, PanelRightClose, PanelRightOpen, Pencil } from '@lucide/vue';
import { MdEditor } from 'md-editor-v3';
import 'md-editor-v3/lib/style.css';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';
import { isDark } from '@/theme';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

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
