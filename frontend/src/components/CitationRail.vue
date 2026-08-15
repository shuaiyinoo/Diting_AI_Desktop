<template>
  <div class="mt-3.5 pt-3.5 pb-1 border-t border-dashed border-border">
    <!-- 头部 -->
    <div class="flex items-baseline gap-3 mb-2.5 pl-0.5">
      <span class="text-[11px] font-bold uppercase tracking-widest text-primary">Evidence Chain</span>
      <span class="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Link class="size-3.5 text-primary" />
        <strong class="font-semibold text-foreground">引用证据</strong>
        <span class="text-xs font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{{ citations.length }}</span>
      </span>
    </div>

    <!-- 引用卡片滚动列表 -->
    <div class="flex gap-2.5 overflow-x-auto py-1 px-0.5 pb-2 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-sm">
      <button
        v-for="(cite, idx) in citations"
        :key="`${cite.documentId ?? cite.fileItemId ?? 'x'}-${cite.chunkId ?? idx}`"
        type="button"
        :disabled="!canOpenFile(cite)"
        class="group relative flex-shrink-0 w-[260px] p-3 px-3.5 bg-card border border-border rounded-xl text-left font-inherit cursor-pointer transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden hover:not-disabled:-translate-y-0.5 hover:not-disabled:border-primary hover:not-disabled:shadow-[0_8px_20px_hsl(var(--primary)/0.12)] disabled:cursor-not-allowed disabled:opacity-65"
        @click="$emit('citation-click', cite)"
      >
        <!-- 左侧高亮条（hover 显示） -->
        <span class="absolute top-0 left-0 w-0.5 h-full bg-gradient-to-b from-primary to-primary/80 opacity-0 transition-opacity duration-200 group-hover:not-disabled:opacity-100" />

        <!-- 卡片头部 -->
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs font-bold text-muted-foreground tracking-wider">{{ String(idx + 1).padStart(2, '0') }}</span>
          <!-- 来源标签 -->
          <span
            v-if="isInvoice(cite)"
            class="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400"
          >票据</span>
          <span
            v-else
            class="text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded"
            :class="citationTypeClass(cite.fileName)"
          >{{ citationFileIcon(cite.fileName) }}</span>
          <span class="ml-auto text-xs font-semibold text-teal-600 dark:text-teal-400">{{ formatScore(cite.score) }}</span>
        </div>

        <!-- 标题区域：票据来源显示类型+发票号，文件来源显示文件名 -->
        <template v-if="isInvoice(cite)">
          <h4 class="m-0 mb-1.5 text-[13px] font-semibold text-foreground leading-tight line-clamp-2" :title="cite.typeName || cite.fileName">
            {{ cite.typeName || '未知票据类型' }}
          </h4>
          <!-- 票据关键信息 -->
          <div v-if="cite.invoiceNumber || cite.issueDate || cite.amountTotal != null" class="flex flex-wrap gap-x-3 gap-y-0.5 mb-2 text-[11px] text-muted-foreground">
            <span v-if="cite.invoiceNumber" class="inline-flex items-center gap-0.5">
              <span class="text-muted-foreground/60">号码</span>
              <span class="font-medium text-foreground/80">{{ cite.invoiceNumber }}</span>
            </span>
            <span v-if="cite.issueDate" class="inline-flex items-center gap-0.5">
              <span class="text-muted-foreground/60">日期</span>
              <span class="font-medium text-foreground/80">{{ cite.issueDate }}</span>
            </span>
            <span v-if="cite.amountTotal != null" class="inline-flex items-center gap-0.5">
              <span class="text-muted-foreground/60">金额</span>
              <span class="font-medium text-foreground/80">¥{{ Number(cite.amountTotal).toFixed(2) }}</span>
            </span>
          </div>
        </template>
        <template v-else>
          <h4 class="m-0 mb-1.5 text-[13px] font-semibold text-foreground leading-tight line-clamp-2" :title="cite.fileName">
            {{ cite.fileName || '未知文件' }}
          </h4>
        </template>

        <!-- 摘录片段 -->
        <p v-if="cite.snippet" class="m-0 mb-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">
          {{ cite.snippet }}
        </p>
        <p v-else class="m-0 mb-2 text-xs text-muted-foreground italic">
          （未提供摘录片段）
        </p>

        <!-- 卡片底部 -->
        <div class="flex items-center gap-2.5">
          <div class="flex-1 h-[3px] bg-muted rounded-sm overflow-hidden">
            <span
              class="block h-full bg-gradient-to-r from-primary to-primary/80 rounded-sm transition-all duration-400"
              :style="{ width: `${Math.min(100, (cite.score || 0) * 100)}%` }"
            />
          </div>
          <span v-if="cite.chunkIndex !== null && cite.chunkIndex !== undefined" class="text-[11px] text-muted-foreground">
            #chunk {{ cite.chunkIndex }}
          </span>
          <span v-if="canOpenFile(cite)" class="text-[11px] text-primary font-medium whitespace-nowrap">
            点击查看 →
          </span>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup>
import { Link } from '@lucide/vue'

defineProps({
  /** 引用证据列表 */
  citations: {
    type: Array,
    default: () => [],
  },
})

defineEmits(['citation-click'])

/** 判断引用是否来自 OCR 票据归档 */
function isInvoice(cite) {
  return cite.source === 'INVOICE'
}

/** 判断引用是否可以打开文件 */
function canOpenFile(cite) {
  const id = cite.documentId ?? cite.fileItemId
  return id !== null && id !== undefined
}

/** 格式化评分为百分比 */
function formatScore(score) {
  if (!Number.isFinite(score)) return '--'
  return (score * 100).toFixed(1) + '%'
}

/** 根据文件扩展名返回图标文字 */
function citationFileIcon(fileName) {
  const ext = (fileName || '').toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'PDF'
  if (ext === 'md') return 'MD'
  if (ext === 'docx' || ext === 'doc') return 'DOC'
  if (ext === 'xlsx' || ext === 'xls') return 'XLS'
  if (ext === 'pptx' || ext === 'ppt') return 'PPT'
  if (ext === 'txt') return 'TXT'
  if (ext === 'html' || ext === 'htm') return 'WEB'
  return '--'
}

/** 根据文件扩展名返回 Tailwind 类名 */
function citationTypeClass(fileName) {
  const ext = (fileName || '').toLowerCase().split('.').pop() ?? ''
  const map = {
    pdf: 'bg-red-500/10 text-red-600 dark:text-red-400',
    md: 'bg-primary/10 text-primary',
    doc: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    docx: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    xls: 'bg-green-500/10 text-green-600 dark:text-green-400',
    xlsx: 'bg-green-500/10 text-green-600 dark:text-green-400',
    ppt: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    pptx: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  }
  return map[ext] || 'bg-muted text-muted-foreground'
}
</script>
