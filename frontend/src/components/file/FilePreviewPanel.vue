<template>
  <div class="flex h-full flex-col overflow-hidden bg-panel">
    <!-- 顶部工具栏 -->
    <div class="flex h-10 shrink-0 items-center justify-between border-b border-border px-2 pl-3.5">
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <File class="size-3.5 shrink-0 text-accent-app" />
        <span class="truncate text-[13px] font-medium text-app-primary" :title="file ? file.name : ''">
          {{ file ? file.name : '文件预览' }}
        </span>
      </div>
      <!-- 右侧按钮组 -->
      <div class="flex shrink-0 items-center gap-0.5">
        <!-- 编辑按钮：仅可编辑文件显示 -->
        <Tooltip v-if="showEditButton" side="bottom">
          <TooltipTrigger as-child>
            <button
              class="inline-flex size-7 items-center justify-center rounded-md text-app-secondary transition-colors hover:bg-hover hover:text-app-primary"
              @click="$emit('edit')"
            >
              <Pencil class="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>编辑</TooltipContent>
        </Tooltip>
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
          <TooltipContent>{{ panel4Collapsed ? '展开信息面板' : '收起信息面板' }}</TooltipContent>
        </Tooltip>
      </div>
    </div>

    <!-- 预览主体 -->
    <div class="flex-1 min-h-0 overflow-hidden bg-panel">
      <div v-if="!file" class="flex h-full items-center justify-center">
        <div class="flex flex-col items-center gap-2 text-app-muted">
          <FileQuestion class="size-10 opacity-40" />
          <span class="text-sm">请从左侧选择文件</span>
        </div>
      </div>
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
import { File, FileQuestion, PanelRightClose, PanelRightOpen, Pencil } from '@lucide/vue';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import FileViewer from '@/components/file/FileViewer.vue';
import { isDark } from '@/theme';

const props = defineProps({
  file: { type: Object, default: null },
  panel4Collapsed: { type: Boolean, default: false },
  showEditButton: { type: Boolean, default: false },
});

defineEmits(['toggle-panel4', 'edit']);

function onLoaded(info) {
  console.log('[FilePreviewPanel] 文件加载完成:', info);
}

function onError(err) {
  console.error('[FilePreviewPanel] 文件加载失败:', err);
}
</script>
