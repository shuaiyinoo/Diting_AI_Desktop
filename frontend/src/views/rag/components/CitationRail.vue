<template>
  <div v-if="citations && citations.length > 0" class="mt-3 px-3.5 py-3 bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-lg">
    <!-- 头部 -->
    <div class="flex items-center gap-2.5 mb-2.5">
      <span class="text-[10px] font-semibold tracking-[1.5px] uppercase text-purple-600 dark:text-purple-400">Evidence Chain</span>
      <span class="inline-flex items-center gap-1.5 text-[13px] text-foreground">
        <Link class="size-3.5 text-purple-600 dark:text-purple-400" />
        <strong class="font-semibold">引用证据</strong>
        <span class="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 bg-primary text-primary-foreground rounded-full text-[11px] font-semibold">{{ citations.length }}</span>
      </span>
    </div>

    <!-- 卡片滚动列表 -->
    <div class="flex gap-2.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:bg-primary/20 [&::-webkit-scrollbar-thumb]:rounded-sm">
      <button
        v-for="(cite, idx) in citations"
        :key="`${cite.fileItemId ?? 'x'}-${cite.chunkId ?? idx}`"
        type="button"
        :disabled="cite.fileItemId === null || cite.fileItemId === undefined"
        class="flex-shrink-0 w-[220px] flex flex-col gap-1.5 p-2.5 px-3 bg-card border border-border rounded-lg cursor-pointer transition-all text-left hover:not-disabled:border-primary hover:not-disabled:shadow-[0_2px_8px_hsl(var(--primary)/0.12)] hover:not-disabled:-translate-y-px disabled:cursor-default disabled:opacity-70"
        @click="$emit('citation-click', cite)"
      >
        <!-- 卡片头部 -->
        <div class="flex items-center gap-2">
          <span class="text-[11px] font-bold text-primary font-mono">{{ String(idx + 1).padStart(2, '0') }}</span>
          <span
            class="inline-flex items-center justify-center min-w-[32px] h-[18px] px-1.5 rounded text-[10px] font-bold tracking-wide"
            :class="iconClass(cite.fileName)"
          >{{ fileIcon(cite.fileName) }}</span>
          <span class="ml-auto text-[11px] text-muted-foreground font-medium">{{ formatScore(cite.score) }}</span>
        </div>

        <!-- 文件名 -->
        <h4 class="m-0 text-[13px] font-medium text-foreground truncate" :title="cite.fileName">
          {{ cite.fileName }}
        </h4>

        <!-- 摘录 -->
        <p v-if="cite.snippet" class="m-0 text-xs text-muted-foreground leading-relaxed line-clamp-2">{{ cite.snippet }}</p>
      </button>
    </div>
  </div>
</template>

<script setup>
import { Link } from '@lucide/vue';

defineProps({
  citations: {
    type: Array,
    default: () => [],
  },
});

defineEmits(['citation-click']);

function formatScore(score) {
  if (score == null) return '';
  return (score * 100).toFixed(1) + '%';
}

function fileIcon(fileName) {
  if (!fileName) return 'FILE';
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'PDF';
    case 'doc':
    case 'docx':
      return 'DOC';
    case 'txt':
      return 'TXT';
    case 'md':
      return 'MD';
    case 'xlsx':
    case 'xls':
      return 'XLS';
    case 'pptx':
    case 'ppt':
      return 'PPT';
    default:
      return 'FILE';
  }
}

/** 根据扩展名返回 Tailwind 类名 */
function iconClass(fileName) {
  if (!fileName) return 'bg-muted text-muted-foreground';
  const ext = fileName.split('.').pop()?.toLowerCase();
  const map = {
    pdf: 'bg-red-500/10 text-red-600 dark:text-red-400',
    doc: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    docx: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    txt: 'bg-green-500/10 text-green-600 dark:text-green-400',
    md: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  };
  return map[ext] || 'bg-muted text-muted-foreground';
}
</script>
