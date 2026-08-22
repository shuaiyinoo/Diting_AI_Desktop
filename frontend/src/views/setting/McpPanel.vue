<template>
  <div class="mx-auto max-w-[640px]">
    <h3 class="flex items-center gap-2 text-base font-semibold text-foreground">{{ t('mcp.title') }}</h3>
    <p class="mb-4 mt-1.5 text-xs leading-relaxed text-muted-foreground">{{ t('mcp.subtitle') }}</p>
    <div class="flex flex-col gap-2">
      <div v-for="mcp in mcpServers" :key="mcp.id" class="rounded-lg border border-border bg-card p-3 shadow-sm">
        <div class="mb-1 flex items-center justify-between">
          <div>
            <span class="text-[13px] font-semibold text-foreground">{{ mcp.displayName }}</span>
            <span class="ml-1.5 text-[10px] text-muted-foreground">{{ mcp.id }}</span>
          </div>
          <Switch
            :model-value="mcp.enabled"
            :disabled="!mcp.toggleable"
            @update:model-value="(v) => toggleMcp(mcp.id, v)"
          />
        </div>
        <p class="mb-1.5 text-[11px] leading-relaxed text-muted-foreground">{{ mcp.description }}</p>
        <div class="flex flex-wrap gap-1">
          <span v-for="tool in mcp.tools" :key="tool.name" class="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{{ tool.name }}</span>
        </div>
        <div v-if="!mcp.available && mcp.availabilityReason" class="mt-1.5 text-[11px] text-yellow-500">
          {{ mcp.availabilityReason }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Switch } from '@/components/ui/switch'
import { ipc } from '@/utils/ipcRenderer'

const { t } = useI18n()

const mcpServers = ref([])

async function load() {
  try {
    const res = await ipc.invoke('controller/piAgent/mcpOperation', { action: 'list' })
    if (res.code === 0 && res.data) mcpServers.value = res.data
  } catch (err) {
    console.error('加载 MCP 失败:', err)
  }
}

async function toggleMcp(id, enabled) {
  try {
    const res = await ipc.invoke('controller/piAgent/mcpOperation', { action: 'toggle', id, enabled })
    if (res.code === 0 && res.data) mcpServers.value = res.data
  } catch (err) {
    console.error('切换 MCP 失败:', err)
  }
}

onMounted(load)

defineExpose({ refresh: load })
</script>
