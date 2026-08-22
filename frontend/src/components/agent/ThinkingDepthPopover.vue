<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="toolbar-icon-btn"
        :class="{ 'toolbar-icon-btn--active': currentLevel !== 'off' }"
        @click="handleButtonClick"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
          <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
          <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
          <path d="M17 5.5a3 3 0 0 1-2 3" />
          <path d="M7 5.5a3 3 0 0 0 2 3" />
        </svg>
      </button>
    </PopoverTrigger>
    <PopoverContent class="w-[220px] p-3" side="top">
      <div class="thinking-popover-content">
        <div class="thinking-popover-header">
          <span class="thinking-popover-label">{{ t('thinkingDepth.label') }}</span>
          <span class="thinking-popover-value">{{ THINKING_LABELS[currentLevel] }}</span>
        </div>
        <div class="thinking-popover-slider">
          <div
            v-for="(level, idx) in thinkingLevels"
            :key="level"
            class="thinking-slider-point"
            :class="{
              'thinking-slider-point--active': idx <= currentIndex,
              'thinking-slider-point--current': idx === currentIndex,
            }"
            @click="selectLevel(level)"
          >
            <div class="thinking-slider-dot" />
            <div class="thinking-slider-label">{{ THINKING_LABELS[level] }}</div>
          </div>
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'

const { t } = useI18n()

const THINKING_LEVELS = ['off', 'low', 'medium', 'high', 'xhigh']

const THINKING_LABELS = computed(() => ({
  off: t('thinkingDepth.off'),
  low: t('thinkingDepth.low'),
  medium: t('thinkingDepth.medium'),
  high: t('thinkingDepth.high'),
  xhigh: t('thinkingDepth.xhigh'),
  max: t('thinkingDepth.max'),
}))

const props = defineProps({
  modelValue: {
    type: String,
    default: 'high',
  },
})

const emit = defineEmits(['update:modelValue'])

const open = ref(false)

const thinkingLevels = computed(() => THINKING_LEVELS)

const currentLevel = computed(() => {
  const level = props.modelValue
  return THINKING_LEVELS.includes(level) ? level : 'high'
})

const currentIndex = computed(() => THINKING_LEVELS.indexOf(currentLevel.value))

function selectLevel(level) {
  emit('update:modelValue', level)
  open.value = false
}

function handleButtonClick() {
  const next = currentLevel.value === 'off' ? 'high' : 'off'
  emit('update:modelValue', next)
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
}
.toolbar-icon-btn svg {
  width: 18px;
  height: 18px;
}
.toolbar-icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.toolbar-icon-btn--active {
  color: var(--accent);
}
</style>

<style>
.thinking-popover-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.thinking-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.thinking-popover-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
}

.thinking-popover-value {
  font-size: 12px;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.thinking-popover-slider {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2px;
  padding: 4px 0;
}

.thinking-slider-point {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  flex: 1;
  transition: all 0.15s ease;
}

.thinking-slider-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--border-color);
  background: transparent;
  transition: all 0.15s ease;
}

.thinking-slider-label {
  font-size: 10px;
  color: var(--text-muted);
  transition: color 0.15s ease;
}

.thinking-slider-point--active .thinking-slider-dot {
  border-color: var(--accent);
  background: var(--accent);
}

.thinking-slider-point--active .thinking-slider-label {
  color: var(--text-secondary);
}

.thinking-slider-point--current .thinking-slider-dot {
  transform: scale(1.3);
  box-shadow: 0 0 0 3px rgba(22, 119, 255, 0.15);
}

.thinking-slider-point--current .thinking-slider-label {
  color: var(--accent);
  font-weight: 600;
}

.thinking-slider-point:hover .thinking-slider-dot {
  border-color: var(--accent);
  transform: scale(1.2);
}
</style>
