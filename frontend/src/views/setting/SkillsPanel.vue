<template>
  <div class="mx-auto max-w-[640px]">
    <h3 class="flex items-center gap-2 text-base font-semibold text-foreground">Skills 管理</h3>
    <p class="mb-4 mt-1.5 text-xs leading-relaxed text-muted-foreground">管理 Agent 工作区的 Skills。Skills 是可复用的流程模板。</p>
    <div class="flex flex-col gap-2">
      <div v-for="skill in skills" :key="skill.slug" class="rounded-lg border border-border bg-card p-3 shadow-sm">
        <div class="mb-1 flex items-center justify-between">
          <span class="text-[13px] font-semibold text-foreground">{{ skill.name }}</span>
          <Switch :checked="skill.enabled" @update:checked="(v) => handleToggle(skill.slug, v)" />
        </div>
        <p class="mb-1.5 text-[11px] leading-relaxed text-muted-foreground">{{ skill.description || '无描述' }}</p>
        <div class="flex gap-1.5">
          <span v-if="skill.version" class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">v{{ skill.version }}</span>
          <span v-if="skill.group" class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{{ skill.group }}</span>
        </div>
      </div>
      <div v-if="skills.length === 0" class="py-8 text-center text-xs text-muted-foreground">暂无 Skills，请先创建工作区</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Switch } from '@/components/ui/switch'
import { ipc } from '@/utils/ipcRenderer'

const emit = defineEmits(['toggle'])

const skills = ref([])

async function load() {
  try {
    const res = await ipc.invoke('controller/piAgent/skillsOperation', {
      action: 'list', workspaceSlug: 'default',
    })
    if (res.code === 0 && res.data) skills.value = res.data
  } catch (err) {
    console.error('加载 Skills 失败:', err)
  }
}

async function toggleSkill(slug, enabled) {
  try {
    const res = await ipc.invoke('controller/piAgent/skillsOperation', {
      action: 'toggle', skillSlug: slug, enabled, workspaceSlug: 'default',
    })
    if (res.code === 0 && res.data) skills.value = res.data
  } catch (err) {
    console.error('切换 Skill 失败:', err)
  }
}

// 包装 emit
const handleToggle = (slug, enabled) => {
  toggleSkill(slug, enabled)
  emit('toggle', slug, enabled)
}

onMounted(load)

defineExpose({ refresh: load })
</script>
