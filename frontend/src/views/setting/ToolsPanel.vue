<template>
  <div class="mx-auto max-w-[640px]">
    <h3 class="flex items-center gap-2 text-base font-semibold text-foreground">内置 Tools</h3>
    <p class="mb-4 mt-1.5 text-xs leading-relaxed text-muted-foreground">Agent 可直接调用的内置工具（非 MCP）。包括 SDK 自带的文件操作、命令执行工具，以及 Diting 自定义的运行时和任务管理工具。</p>
    <div class="flex flex-col gap-2">
      <div v-for="tool in builtinTools" :key="tool.name" class="rounded-lg border border-border bg-card p-3 shadow-sm">
        <div class="mb-1 flex items-center justify-between gap-2">
          <span class="text-[13px] font-semibold text-foreground">{{ tool.label || tool.name }}</span>
          <div class="flex shrink-0 gap-1">
            <span class="rounded px-1.5 py-0.5 text-[10px]" :class="tool.source === 'sdk' ? 'bg-purple-500/10 text-purple-600' : 'bg-primary/10 text-primary'">
              {{ toolSourceLabels[tool.source] || tool.source }}
            </span>
            <span v-if="tool.readOnly" class="rounded bg-green-500/10 px-1.5 py-0.5 text-[10px] text-green-600">只读</span>
          </div>
        </div>
        <p class="mb-1.5 text-[11px] leading-relaxed text-muted-foreground">{{ tool.description || '无描述' }}</p>
        <div class="flex flex-wrap gap-1.5">
          <span class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{{ toolCategoryLabels[tool.category] || tool.category }}</span>
          <span class="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{{ tool.name }}</span>
        </div>
      </div>
      <div v-if="builtinTools.length === 0" class="py-8 text-center text-xs text-muted-foreground">暂无 Tools 数据</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ipc } from '@/utils/ipcRenderer'

const builtinTools = ref([])

const toolCategoryLabels = {
  file: '文件操作', system: '系统命令', search: '搜索查找',
  interaction: '用户交互', task: '任务跟踪', runtime: '运行时',
}
const toolSourceLabels = { sdk: 'SDK 内置', custom: 'Diting 自定义' }

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
