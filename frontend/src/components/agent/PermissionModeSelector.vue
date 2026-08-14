<template>
  <Tooltip placement="bottom">
    <template #title>
      <div>
        <div style="font-weight: 600">{{ config.label }}</div>
        <div style="font-size: 12px; opacity: 0.8">{{ config.description }}</div>
        <div style="font-size: 12px; opacity: 0.6; margin-top: 2px">点击切换模式</div>
      </div>
    </template>
    <button
      type="button"
      class="toolbar-icon-btn"
      :aria-label="config.label"
      @click="cycleMode"
    >
      <!-- 完全自动：闪电图标 -->
      <svg v-if="displayMode === 'bypassPermissions'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-6z" />
      </svg>
      <!-- 需确认：盾牌图标 -->
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    </button>
  </Tooltip>
</template>

<script setup>
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

import { computed } from 'vue'

// ===== 权限模式配置 =====
const PERMISSION_MODES = ['bypassPermissions', 'ask']

const PERMISSION_MODE_CONFIG = {
  bypassPermissions: {
    label: '完全自动',
    description: '所有工具调用自动允许',
  },
  ask: {
    label: '需确认',
    description: '工具调用需用户确认',
  },
}

// ===== Props / Emits =====
const props = defineProps({
  /** 当前权限模式 */
  modelValue: {
    type: String,
    default: 'bypassPermissions',
  },
})

const emit = defineEmits(['update:modelValue'])

// ===== 计算属性 =====
const displayMode = computed(() => {
  const mode = props.modelValue
  return PERMISSION_MODES.includes(mode) ? mode : 'bypassPermissions'
})

const config = computed(() => PERMISSION_MODE_CONFIG[displayMode.value])

// ===== 方法 =====
function cycleMode() {
  const currentIndex = PERMISSION_MODES.indexOf(displayMode.value)
  const nextIndex = (currentIndex + 1) % PERMISSION_MODES.length
  const nextMode = PERMISSION_MODES[nextIndex]
  emit('update:modelValue', nextMode)
}
</script>

<style scoped>
.toolbar-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
  padding: 0;

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
}
</style>
