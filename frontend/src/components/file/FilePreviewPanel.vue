<template>
  <div class="flex h-full flex-col overflow-hidden bg-panel">
    <!-- 顶部工具栏 -->
    <div class="flex h-10 shrink-0 items-center justify-between border-b border-border px-2 pl-3.5">
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <File class="size-3.5 shrink-0 text-accent-app" />
        <span class="truncate text-[13px] font-medium text-app-primary" :title="file ? file.name : ''">
          {{ file ? file.name : t('fileModule.preview.title') }}
        </span>
      </div>
      <!-- 右侧按钮组 -->
      <div class="flex shrink-0 items-center gap-0.5">
        <!-- 折叠第四面板按钮 -->
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
          <TooltipContent>{{ panel4Collapsed ? t('fileModule.preview.expandPanel') : t('fileModule.preview.collapsePanel') }}</TooltipContent>
        </Tooltip>
      </div>
    </div>

    <!-- 预览主体 -->
    <div class="flex-1 min-h-0 overflow-hidden bg-panel">
      <!-- 无文件 -->
      <div v-if="!file" class="flex h-full items-center justify-center">
        <div class="flex flex-col items-center gap-2 text-app-muted">
          <FileQuestion class="size-10 opacity-40" />
          <span class="text-sm">{{ t('fileModule.preview.noFile') }}</span>
        </div>
      </div>

      <!-- 本地 md 文件：使用 MdEditor 编辑 -->
      <MdEditor
        v-else-if="isLocalMarkdown"
        :key="`md-${file.id}`"
        :file-item-id="file.id"
      />

      <!-- 其他文件（远程 md、Office、图片等）：使用 FileViewer 预览 -->
      <FileViewer
        v-else
        :key="file.id"
        :file-item-id="file.id"
        :theme="isDark ? 'dark' : 'light'"
        :toolbar="false"
        @loaded="onLoaded"
        @error="onError"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { File, FileQuestion, PanelRightClose, PanelRightOpen } from '@lucide/vue';
import { useI18n } from 'vue-i18n';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import FileViewer from '@/components/file/FileViewer.vue';
import MdEditor from '@/components/file/MdEditor.vue';
import { isDark } from '@/theme';
import { useWorkspaceStore } from '@/stores/workspace';

const { t } = useI18n();
const ws = useWorkspaceStore();

const props = defineProps({
  file: { type: Object, default: null },
  panel4Collapsed: { type: Boolean, default: false },
});

defineEmits(['toggle-panel4']);

/** 判断当前文件是否为本地文件夹中的 md 文件 */
const isLocalMarkdown = computed(() => {
  if (!props.file || !props.file.name) return false
  // 判断所属文件夹是否为本地协议
  const folder = ws.selectedFolder
  const isLocal = !folder || (folder.protocol || 'local') === 'local'
  if (!isLocal) return false
  // 判断文件扩展名是否为 md / markdown
  const ext = props.file.name.split('.').pop()?.toLowerCase() || ''
  return ext === 'md' || ext === 'markdown'
});

function onLoaded(info) {
  console.log('[FilePreviewPanel] 文件加载完成:', info);
}

function onError(err) {
  console.error('[FilePreviewPanel] 文件加载失败:', err);
}
</script>
