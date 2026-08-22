<template>
  <div class="mx-auto max-w-[640px]">
    <h3 class="flex items-center gap-2 text-base font-semibold text-foreground">{{ t('tools.title') }}</h3>
    <p class="mb-4 mt-1.5 text-xs leading-relaxed text-muted-foreground">{{ t('tools.subtitle') }}</p>
    <div class="flex flex-col gap-2">
      <div v-for="tool in builtinTools" :key="tool.name" class="rounded-lg border border-border bg-card p-3 shadow-sm">
        <div class="mb-1 flex items-center justify-between gap-2">
          <span class="text-[13px] font-semibold text-foreground">{{ tool.label || tool.name }}</span>
          <div class="flex shrink-0 gap-1">
            <span class="rounded px-1.5 py-0.5 text-[10px]" :class="tool.source === 'sdk' ? 'bg-purple-500/10 text-purple-600' : 'bg-primary/10 text-primary'">
              {{ toolSourceLabels[tool.source] || tool.source }}
            </span>
            <span v-if="tool.readOnly" class="rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-600">{{ t('tools.readOnly') }}</span>
          </div>
        </div>
        <p class="mb-1.5 text-[11px] leading-relaxed text-muted-foreground">{{ tool.description || t('common.noDescription') }}</p>
        <div class="flex flex-wrap gap-1.5">
          <span class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{{ toolCategoryLabels[tool.category] || tool.category }}</span>
          <span class="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{{ tool.name }}</span>
        </div>
      </div>
      <div v-if="builtinTools.length === 0" class="py-8 text-center text-xs text-muted-foreground">{{ t('tools.empty') }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ipc } from '@/utils/ipcRenderer'

const { t } = useI18n()

const builtinTools = ref([])

const toolCategoryLabels = computed(() => ({
  file: t('tools.category.file'), system: t('tools.category.system'), search: t('tools.category.search'),
  interaction: t('tools.category.interaction'), task: t('tools.category.task'), runtime: t('tools.category.runtime'),
}))
const toolSourceLabels = computed(() => ({
  sdk: t('tools.source.sdk'), custom: t('tools.source.custom'),
}))

async function load() {
  try {
    const res = await ipc.invoke('controller/piAgent/toolsOperation', { action: 'list' })
    if (res.code === 0 && res.data) builtinTools.value = res.data
  } catch (err) {
    console.error('加载 Tools 失败:', err)
  }
}

onMounted(load)

defineExpose({ refresh: load })
</script>
