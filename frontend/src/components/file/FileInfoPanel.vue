<template>
  <div class="flex flex-col h-full bg-card overflow-hidden">
    <!-- 头部 -->
    <div class="flex items-center px-3.5 h-10 flex-shrink-0 border-b border-border">
      <span class="text-[13px] font-semibold text-foreground">{{ t('fileModule.info.title') }}</span>
    </div>

    <!-- 内容区 -->
    <div class="flex-1 overflow-y-auto p-3 px-3.5">
      <div v-if="!file" class="py-8 text-center text-sm text-muted-foreground">{{ t('fileModule.info.noFile') }}</div>
      <div v-else class="flex flex-col gap-3.5">
        <div class="flex flex-col gap-1">
          <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{{ t('fileModule.info.fileName') }}</span>
          <span class="text-[13px] text-foreground break-all leading-relaxed" :title="file.name">{{ file.name }}</span>
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{{ t('fileModule.info.size') }}</span>
          <span class="text-[13px] text-foreground">{{ formatFileSize(file.size) }}</span>
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{{ t('fileModule.info.type') }}</span>
          <span class="text-[13px] text-foreground">
            <Badge v-if="file.type" variant="secondary">{{ file.type }}</Badge>
            <span v-else>-</span>
          </span>
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{{ t('fileModule.info.modified') }}</span>
          <span class="text-[13px] text-foreground">{{ formatDateTime(file.mtime) }}</span>
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{{ t('fileModule.info.status') }}</span>
          <span class="text-[13px] text-foreground">
            <Badge :variant="statusTag.color === 'green' ? 'default' : 'secondary'">{{ statusTag.text }}</Badge>
          </span>
        </div>
        <div v-if="file.path" class="flex flex-col gap-1">
          <span class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{{ t('fileModule.info.path') }}</span>
          <span class="text-xs font-mono text-muted-foreground break-all leading-relaxed" :title="file.path">{{ file.path }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Badge } from '@/components/ui/badge';

const { t } = useI18n();

const props = defineProps({
  file: { type: Object, default: null },
  statusTag: { type: Object, default: () => ({ color: 'default', text: '-' }) },
});

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

function formatDateTime(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
</script>
