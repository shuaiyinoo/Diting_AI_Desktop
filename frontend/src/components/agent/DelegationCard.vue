<template>
  <div v-if="delegations.length > 0" class="mx-[20%] mb-1.5 overflow-visible">
    <Transition name="dc-mode" mode="out-in">
      <!-- ===== 缩小模式 ===== -->
      <Button v-if="!expanded" key="collapsed" variant="outline" class="w-full gap-2 rounded-[10px] border-green-500 bg-card px-3.5 py-2 text-left text-xs text-muted-foreground hover:border-green-400 hover:shadow-md" style="box-shadow: 0 2px 8px rgba(82, 196, 26, 0.1)" @click="expanded = true">
        <span class="shrink-0 rounded-md bg-green-500/10 px-1.5 py-0.5 text-xs font-bold text-green-500" style="font-variant-numeric: tabular-nums">{{ completedCount }}/{{ totalCount }}</span>
        <span class="text-muted-foreground">·</span>
        <span class="flex min-w-0 flex-1 items-center gap-1 text-muted-foreground">
          <Loader2 v-if="runningCount > 0" class="size-3.5 shrink-0 animate-spin text-green-500" />
          <CheckCircle2 v-else class="size-3.5 shrink-0 text-green-500" />
          <span class="truncate">
            {{ runningCount > 0 ? `${runningCount} 个子 Agent 运行中` : '全部完成' }}
          </span>
        </span>
        <ChevronDown class="size-4 shrink-0 text-muted-foreground" />
      </Button>

      <!-- ===== 展开模式 ===== -->
      <div v-else key="expanded" class="flex max-h-[300px] flex-col overflow-hidden rounded-[10px] border border-green-500 bg-card shadow-md">
        <!-- 标题行 -->
        <div class="flex shrink-0 items-center justify-between border-b border-border/50 bg-green-500/[0.08] px-3 py-2">
          <div class="flex items-center gap-1.5">
            <Cpu class="size-4 text-green-500" />
            <span class="text-[13px] font-semibold text-green-500">协作子 Agent</span>
            <span class="rounded-lg bg-green-500/[0.08] px-1.5 text-[11px] font-semibold text-green-500">{{ completedCount }}/{{ totalCount }}</span>
          </div>
          <Button variant="ghost" size="icon" class="h-5 w-5 cursor-pointer text-muted-foreground hover:text-foreground" @click="expanded = false" title="缩小">
            <ChevronUp class="size-4" />
          </Button>
        </div>

        <!-- 进度条 -->
        <div v-if="totalCount > 1" class="h-[3px] overflow-hidden bg-border/50">
          <div class="h-full rounded-r-[2px] transition-all duration-300" :style="{ width: percent + '%', background: 'linear-gradient(90deg, #52c41a, #95de64)' }"></div>
        </div>

        <!-- 子 Agent 列表 -->
        <div class="flex max-h-[300px] flex-col gap-0.5 overflow-y-auto p-2">
          <div
            v-for="item in delegations"
            :key="item.delegationId"
            class="flex gap-2 rounded-md p-2 transition-colors hover:bg-accent"
            :class="{
              'bg-green-500/[0.03]': item.status === 'running',
              'bg-red-500/[0.04]': item.status === 'failed',
              'opacity-60': item.status === 'cancelled',
            }"
          >
            <!-- 状态图标 -->
            <span class="mt-px shrink-0" :class="{
              'text-green-500': item.status === 'running' || item.status === 'completed',
              'text-red-500': item.status === 'failed',
              'text-muted-foreground': item.status === 'cancelled' || item.status === 'pending',
            }">
              <Loader2 v-if="item.status === 'running'" class="size-3.5 animate-spin" />
              <CheckCircle2 v-else-if="item.status === 'completed'" class="size-3.5" />
              <XCircle v-else-if="item.status === 'failed'" class="size-3.5" />
              <Ban v-else-if="item.status === 'cancelled'" class="size-3.5" />
              <Circle v-else class="size-3.5" />
            </span>

            <!-- 内容 -->
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="truncate text-xs font-medium text-foreground">{{ item.title }}</span>
                <span v-if="item.role && item.role !== 'custom'" class="shrink-0 rounded bg-green-500/[0.06] px-1.5 text-[10px] text-green-500">{{ roleLabels[item.role] || item.role }}</span>
              </div>
              <div v-if="item.status === 'completed' && item.resultSummary" class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground break-all">
                {{ item.resultSummary.length > 200 ? item.resultSummary.slice(0, 200) + '...' : item.resultSummary }}
              </div>
              <div v-else-if="item.status === 'failed' && item.error" class="mt-0.5 text-[11px] text-red-500">
                {{ item.error }}
              </div>
              <div v-else-if="item.status === 'running'" class="mt-0.5 text-[11px] text-muted-foreground">
                处理中...
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle, Ban, Circle, Cpu } from '@lucide/vue'

const props = defineProps({
  delegations: {
    type: Array,
    default: () => [],
  },
})

const expanded = ref(true)

const roleLabels = {
  explore: '探索',
  research: '调研',
  implement: '实现',
  review: '审查',
  custom: '自定义',
}

const totalCount = computed(() => props.delegations.length)
const completedCount = computed(() => props.delegations.filter((d) => d.status === 'completed' || d.status === 'failed' || d.status === 'cancelled').length)
const runningCount = computed(() => props.delegations.filter((d) => d.status === 'running').length)
const percent = computed(() => totalCount.value > 0 ? Math.round((completedCount.value / totalCount.value) * 100) : 0)
</script>

<style>
@keyframes dc-spin {
  to {
    transform: rotate(360deg);
  }
}

.dc-mode-enter-active,
.dc-mode-leave-active {
  transition: all 0.2s ease;
}

.dc-mode-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}

.dc-mode-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>