<template>
  <div v-if="items.length > 0" class="mx-[20%]">
    <Transition name="tpc-mode" mode="out-in">
    <!-- ===== 缩小模式 ===== -->
    <button v-if="!expanded" key="collapsed" type="button" class="flex w-full items-center gap-2 rounded-[10px] border border-primary bg-card px-3.5 py-2 text-left transition-all hover:border-primary/70 hover:shadow-md" style="box-shadow: 0 2px 8px rgba(22, 119, 255, 0.1)" @click="expanded = true">
      <span class="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary" style="font-variant-numeric: tabular-nums">{{ completedCount }}/{{ totalCount }}</span>
      <span class="shrink-0 text-muted-foreground">·</span>
      <span class="flex min-w-0 flex-1 items-center gap-1.5">
        <svg v-if="currentTask?.status === 'in_progress'" class="size-3 shrink-0 text-primary animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <svg v-else-if="currentTask?.status === 'completed'" class="size-3 shrink-0 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <path d="M22 4L12 14.01l-3-3" />
        </svg>
        <span class="truncate text-[13px] text-foreground">{{ currentTaskText }}</span>
      </span>
      <svg class="size-3.5 shrink-0 text-muted-foreground transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>

    <!-- ===== 展开模式 ===== -->
    <div v-else key="expanded" class="flex max-h-[300px] flex-col overflow-hidden rounded-[10px] border border-primary bg-card shadow-md">
      <!-- 标题行 -->
      <div class="flex shrink-0 items-center justify-between border-b border-border/50 bg-primary/[0.08] px-3 py-2">
        <div class="flex items-center gap-1.5">
          <svg class="size-3.5 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <span class="text-[13px] font-semibold text-primary">任务进度</span>
          <span class="text-[11px] text-primary opacity-70" style="font-variant-numeric: tabular-nums">{{ completedCount }}/{{ totalCount }}</span>
        </div>
        <button type="button" class="flex size-[22px] items-center justify-center rounded-[5px] border-none bg-transparent text-muted-foreground transition-all hover:bg-accent hover:text-foreground" @click="expanded = false" title="缩小">
          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      <!-- 进度条 -->
      <div v-if="totalCount > 1" class="h-0.5 shrink-0 overflow-hidden bg-border/50">
        <div class="h-full bg-primary transition-all duration-400 ease-out" :style="{ width: percent + '%' }"></div>
      </div>

      <!-- 任务列表 -->
      <div class="flex-1 overflow-y-auto py-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-[2px] [&::-webkit-scrollbar-thumb]:bg-border">
        <div
          v-for="item in items"
          :key="item.id"
          class="flex items-center gap-2 px-3 py-1 text-[13px] transition-opacity"
          :class="{
            'opacity-45': item.status === 'completed',
            'opacity-35': item.status === 'cancelled',
            'bg-primary/[0.04]': item.status === 'in_progress',
          }"
        >
          <span class="flex size-3.5 shrink-0 items-center justify-center" :class="'text-' + statusColor(item.status)">
            <svg v-if="item.status === 'pending'" class="size-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
            </svg>
            <svg v-else-if="item.status === 'in_progress'" class="size-3.5 text-primary animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <svg v-else-if="item.status === 'completed'" class="size-3.5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <path d="M22 4L12 14.01l-3-3" />
            </svg>
            <svg v-else-if="item.status === 'blocked'" class="size-3.5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <svg v-else class="size-3.5 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </span>
          <span class="flex-1 min-w-0 truncate" :class="textClass(item)">
            {{ item.status === 'in_progress' && item.activeForm ? item.activeForm : item.subject }}
          </span>
        </div>
      </div>
    </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { aggregateTaskItems } from '@/utils/task-progress'

const props = defineProps({
  blocks: { type: Array, default: () => [] },
  isStreaming: { type: Boolean, default: false },
})

const expanded = ref(false)

// 自动展开：首次检测到任务块时展开
let wasEmpty = true
const items = computed(() => {
  const result = aggregateTaskItems(props.blocks, !props.isStreaming)
  if (result.length === 0) {
    wasEmpty = true
    expanded.value = false
  } else if (wasEmpty && result.length > 0) {
    expanded.value = true
    wasEmpty = false
  }
  return result
})

const totalCount = computed(() => items.value.length)
const completedCount = computed(() => items.value.filter((t) => t.status === 'completed').length)
const percent = computed(() => totalCount.value === 0 ? 0 : Math.round((completedCount.value / totalCount.value) * 100))

// 当前正在执行的任务（in_progress 优先，否则取最后一个未完成）
const currentTask = computed(() => {
  const inProgress = items.value.find((t) => t.status === 'in_progress')
  if (inProgress) return inProgress
  const pending = items.value.find((t) => t.status === 'pending')
  return pending ?? items.value[items.value.length - 1]
})

const currentTaskText = computed(() => {
  const t = currentTask.value
  if (!t) return ''
  return t.status === 'in_progress' && t.activeForm ? t.activeForm : t.subject
})

function statusColor(status) {
  const map = {
    pending: 'muted-foreground',
    in_progress: 'primary',
    completed: 'green-500',
    blocked: 'amber-500',
    cancelled: 'muted-foreground',
    error: 'red-500',
  }
  return map[status] || 'muted-foreground'
}

function textClass(item) {
  if (item.status === 'completed' || item.status === 'cancelled') return 'text-muted-foreground line-through'
  if (item.status === 'error') return 'text-red-500'
  if (item.status === 'in_progress') return 'text-foreground font-medium'
  return 'text-muted-foreground'
}
</script>

<style>
@keyframes tpc-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.tpc-mode-enter-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.tpc-mode-leave-active {
  transition: all 0.18s cubic-bezier(0.4, 0, 1, 1);
}
.tpc-mode-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
.tpc-mode-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>