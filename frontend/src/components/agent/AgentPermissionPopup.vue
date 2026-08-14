<template>
  <Transition name="permission-slide">
    <div
      v-if="request"
      class="absolute left-[20%] right-[20%] top-0 z-[100] flex max-h-[65vh] flex-col overflow-hidden rounded-b-2xl border-2 border-t-0 shadow-2xl"
      :class="popupClass"
    >
      <!-- 顶部标题区 -->
      <div class="px-5 pb-3.5 pt-4 text-white" :class="headerGradient">
        <div class="flex items-center gap-2">
          <!-- 图标 -->
          <svg
            v-if="request.dangerLevel === 'dangerous'"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            class="size-5 shrink-0"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
          <svg
            v-else
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            class="size-5 shrink-0"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <!-- 标题 -->
          <span class="flex-1 truncate text-sm font-semibold text-white">{{ formatToolName(request.toolName) }}</span>
          <!-- 危险等级标签 -->
          <span class="shrink-0 rounded-md bg-white/25 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide">
            {{ dangerLevelLabel(request.dangerLevel) }}
          </span>
          <!-- 关闭按钮 -->
          <button
            class="flex size-[26px] items-center justify-center rounded-md bg-white/20 text-white transition-all hover:bg-white/35"
            :disabled="responding"
            @click="$emit('resolve', false)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <!-- 描述区 -->
      <div class="flex-1 min-h-0 overflow-y-auto px-5 py-3.5">
        <pre class="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-foreground" style="font-family: var(--font-mono, 'SF Mono', Menlo, Monaco, monospace)">{{ request.description || '请求执行操作' }}</pre>
      </div>

      <!-- 底部操作区 -->
      <div class="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3.5">
        <Button size="small" :disabled="responding" @click="$emit('resolve', false)">拒绝</Button>
        <Button v-if="request.allowAlways" size="small" variant="outline" :disabled="responding" @click="$emit('resolve', true, true)">总是允许</Button>
        <Button size="small" :disabled="responding" :loading="responding" @click="$emit('resolve', true)">允许</Button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue'
import { Button } from '@/components/ui/button'

const props = defineProps({
  /** 权限请求对象 */
  request: { type: Object, default: null },
  /** 是否正在响应 */
  responding: { type: Boolean, default: false },
})

defineEmits(['resolve'])

/** 弹窗边框/阴影样式 */
const popupClass = computed(() => {
  switch (props.request?.dangerLevel) {
    case 'dangerous': return 'border-red-500'
    case 'safe': return 'border-green-500'
    default: return 'border-amber-400'
  }
})

/** 顶部渐变背景 */
const headerGradient = computed(() => {
  switch (props.request?.dangerLevel) {
    case 'dangerous': return 'bg-gradient-to-br from-red-500 to-red-400'
    case 'safe': return 'bg-gradient-to-br from-green-500 to-green-400'
    default: return 'bg-gradient-to-br from-amber-400 to-amber-300'
  }
})

/** 格式化工具显示名称 */
function formatToolName(toolName) {
  const parts = toolName.split('__')
  if (parts[0] === 'mcp' && parts.length >= 3) {
    return `${parts[1]} / ${parts.slice(2).join('__')}`
  }
  return toolName
}

/** 危险等级标签 */
function dangerLevelLabel(level) {
  switch (level) {
    case 'safe': return '安全'
    case 'dangerous': return '危险'
    default: return '需确认'
  }
}
</script>

<style scoped>
.permission-slide-enter-active { transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
.permission-slide-leave-active { transition: all 0.25s cubic-bezier(0.4, 0, 1, 1); }
.permission-slide-enter-from { opacity: 0; transform: translateY(-100%); }
.permission-slide-leave-to { opacity: 0; transform: translateY(-100%); }
</style>
