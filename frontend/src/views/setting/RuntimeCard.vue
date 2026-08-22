<template>
  <div class="rounded-lg border border-border bg-card p-3.5 shadow-sm">
    <div class="mb-2.5 flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <Code :size="20" :class="iconClass" />
        <div>
          <div class="text-sm font-semibold text-foreground">{{ label }}</div>
          <div class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{{ description }}</div>
        </div>
      </div>
      <Badge :variant="available ? 'default' : 'destructive'" class="gap-1">
        <CheckCircle2 v-if="available" class="size-3.5" />
        <AlertCircle v-else class="size-3.5" />
        {{ available ? t('runtime.available') : t('runtime.unavailable') }}
      </Badge>
    </div>
    <div class="flex flex-col gap-1.5">
      <div class="flex items-center gap-3 py-1">
        <span class="w-[72px] shrink-0 text-xs text-muted-foreground">{{ t('runtime.source') }}</span>
        <Badge variant="secondary" class="text-xs">{{ sourceLabel }}</Badge>
      </div>
      <div class="flex items-center gap-3 py-1">
        <span class="w-[72px] shrink-0 text-xs text-muted-foreground">{{ t('runtime.path') }}</span>
        <span class="min-w-0 break-all font-mono text-xs text-foreground">{{ path || t('runtime.unavailable') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Code, CheckCircle2, AlertCircle } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'

const { t } = useI18n()

const props = defineProps({
  label: { type: String, required: true },
  iconClass: { type: String, default: '' },
  available: { type: Boolean, default: false },
  source: { type: String, default: '' },
  path: { type: String, default: '' },
  description: { type: String, default: '' },
})

const sourceLabel = computed(() => props.source === 'bundled' ? t('runtime.sourceBundled') : t('runtime.sourceHost'))
</script>
