<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Clock, X } from '@lucide/vue'
import { cn } from '@/lib/utils'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  /** v-model 值：HH:mm 格式字符串，或空字符串 */
  modelValue: { type: String, default: '' },
  /** 是否禁用 */
  disabled: { type: Boolean, default: false },
  /** placeholder 文本 */
  placeholder: { type: String, default: '' },
  /** 传入 class */
  class: { type: String, default: null },
})

const emits = defineEmits(['update:modelValue', 'change'])

const open = ref(false)

// 小时列表 0-23
const hours = Array.from({ length: 24 }, (_, i) => i)
// 分钟列表 0-59（步进 1）
const minutes = Array.from({ length: 60 }, (_, i) => i)

// 内部状态
const selectedHour = ref(9)
const selectedMinute = ref(0)

// 从 modelValue 解析
watch(() => props.modelValue, (val) => {
  if (val) {
    const parts = val.split(':')
    if (parts.length === 2) {
      selectedHour.value = parseInt(parts[0], 10) || 0
      selectedMinute.value = parseInt(parts[1], 10) || 0
    }
  } else {
    selectedHour.value = 9
    selectedMinute.value = 0
  }
}, { immediate: true })

// 显示文本
const displayText = computed(() => {
  if (!props.modelValue) return ''
  return props.modelValue
})

// 小时列表 ref
const hourListRef = ref(null)
const minuteListRef = ref(null)

// 滚动到选中项
function scrollToSelected() {
  nextTick(() => {
    if (hourListRef.value) {
      const container = hourListRef.value
      const itemHeight = 32
      const scrollTop = selectedHour.value * itemHeight - container.clientHeight / 2 + itemHeight / 2
      container.scrollTop = Math.max(0, scrollTop)
    }
    if (minuteListRef.value) {
      const container = minuteListRef.value
      const itemHeight = 32
      const scrollTop = selectedMinute.value * itemHeight - container.clientHeight / 2 + itemHeight / 2
      container.scrollTop = Math.max(0, scrollTop)
    }
  })
}

// 打开时滚动到选中项
watch(open, (isOpen) => {
  if (isOpen) {
    scrollToSelected()
  }
})

// 选择小时
function selectHour(h) {
  selectedHour.value = h
  emitChange()
}

// 选择分钟
function selectMinute(m) {
  selectedMinute.value = m
  emitChange()
}

// 发出变更
function emitChange() {
  const val = `${String(selectedHour.value).padStart(2, '0')}:${String(selectedMinute.value).padStart(2, '0')}`
  emits('update:modelValue', val)
  emits('change', val)
}

// 清除
function clearValue() {
  selectedHour.value = 9
  selectedMinute.value = 0
  emits('update:modelValue', '')
}
</script>

<template>
  <div class="relative flex w-full items-center">
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button
          variant="outline"
          :disabled="disabled"
          class="w-full justify-start text-left font-normal"
          :class="cn(props.class, !props.modelValue ? 'text-muted-foreground' : '')"
        >
          <Clock class="size-4 shrink-0" />
          {{ displayText || placeholder }}
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-auto p-0" align="start">
        <div class="flex">
          <!-- 小时列表 -->
          <div class="flex flex-col">
            <div class="border-b border-border/50 px-3 py-1.5 text-center text-xs font-medium text-muted-foreground">{{ t('dateTimePicker.hour') }}</div>
            <div
              ref="hourListRef"
              class="h-[132px] overflow-y-auto py-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
            >
              <button
                v-for="h in hours"
                :key="h"
                class="flex h-8 w-20 items-center justify-center rounded-md text-sm transition-colors hover:bg-accent"
                :class="h === selectedHour ? 'bg-primary font-medium text-primary-foreground hover:bg-primary' : 'text-foreground'"
                @click="selectHour(h)"
              >
                {{ String(h).padStart(2, '0') }}
              </button>
            </div>
          </div>

          <!-- 分隔线 -->
          <div class="w-px bg-border/50" />

          <!-- 分钟列表 -->
          <div class="flex flex-col">
            <div class="border-b border-border/50 px-3 py-1.5 text-center text-xs font-medium text-muted-foreground">{{ t('dateTimePicker.minute') }}</div>
            <div
              ref="minuteListRef"
              class="h-[132px] overflow-y-auto py-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
            >
              <button
                v-for="m in minutes"
                :key="m"
                class="flex h-8 w-20 items-center justify-center rounded-md text-sm transition-colors hover:bg-accent"
                :class="m === selectedMinute ? 'bg-primary font-medium text-primary-foreground hover:bg-primary' : 'text-foreground'"
                @click="selectMinute(m)"
              >
                {{ String(m).padStart(2, '0') }}
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
    <Button
      v-if="props.modelValue && !disabled"
      variant="ghost"
      size="icon"
      class="absolute right-0.5 top-1/2 size-6 -translate-y-1/2 shrink-0 text-muted-foreground hover:text-foreground"
      tabindex="-1"
      @click.stop="clearValue"
    >
      <X class="size-3" />
    </Button>
  </div>
</template>
