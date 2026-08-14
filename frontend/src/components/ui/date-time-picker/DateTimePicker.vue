<script setup>
import { ref, computed, watch } from 'vue'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarIcon, X } from '@lucide/vue'
import { CalendarDate } from '@internationalized/date'
import dayjs from 'dayjs'
import { cn } from '@/lib/utils'

const props = defineProps({
  /** v-model 值：YYYY-MM-DDTHH:mm 格式字符串，或空字符串 */
  modelValue: { type: String, default: '' },
  /** 是否禁用 */
  disabled: { type: Boolean, default: false },
  /** placeholder */
  placeholder: { type: String, default: '选择日期时间' },
  /** 传入 class */
  class: { type: String, default: null },
})

const emits = defineEmits(['update:modelValue', 'change'])

const open = ref(false)

// 从 modelValue 解析出 CalendarDate 和时间字符串
const selectedDate = ref(null)
const timeStr = ref('09:00')

// 将 YYYY-MM-DDTHH:mm 字符串同步到内部状态
watch(() => props.modelValue, (val) => {
  if (val) {
    const d = dayjs(val)
    if (d.isValid()) {
      // 转换为 @internationalized/date 的 CalendarDate
      selectedDate.value = new CalendarDate(d.year(), d.month() + 1, d.date())
      timeStr.value = d.format('HH:mm')
    }
  } else {
    selectedDate.value = null
    timeStr.value = '09:00'
  }
}, { immediate: true })

// 显示在触发按钮上的文本
const displayText = computed(() => {
  if (!props.modelValue) return ''
  const d = dayjs(props.modelValue)
  if (!d.isValid()) return ''
  return d.format('YYYY-MM-DD HH:mm')
})

// 当 Calendar 选择日期时更新
function onDateSelect(date) {
  if (!date) return
  // date 是 CalendarDate 对象
  // 构造新的 YYYY-MM-DDTHH:mm 字符串
  const newDateStr = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}T${timeStr.value}`
  emits('update:modelValue', newDateStr)
}

// 当时间输入变化时更新
function onTimeInput(e) {
  timeStr.value = e.target.value
  if (selectedDate.value) {
    const date = selectedDate.value
    const newDateStr = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}T${timeStr.value}`
    emits('update:modelValue', newDateStr)
  }
}

// 清除选择
function clearValue() {
  selectedDate.value = null
  timeStr.value = '09:00'
  emits('update:modelValue', '')
}
</script>

<template>
  <div :class="cn('relative flex', props.class)">
    <Popover v-model:open="open">
      <PopoverTrigger as-child>
        <Button
          variant="outline"
          :disabled="disabled"
          class="w-full justify-start text-left font-normal"
          :class="!modelValue ? 'text-muted-foreground' : ''"
        >
          <CalendarIcon class="size-4 shrink-0" />
          {{ displayText || placeholder }}
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-auto p-0" align="start">
        <Calendar
          :model-value="selectedDate"
          @update:model-value="onDateSelect"
        />
        <div class="flex items-center gap-2 border-t border-border/50 p-3">
          <span class="text-xs font-medium text-muted-foreground">时间</span>
          <Input
            type="time"
            :model-value="timeStr"
            @input="onTimeInput"
            class="h-8 w-32 text-sm"
          />
        </div>
      </PopoverContent>
    </Popover>
    <Button
      v-if="modelValue && !disabled"
      variant="ghost"
      size="icon"
      class="absolute right-0.5 top-1/2 size-7 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      @click="clearValue"
    >
      <X class="size-3.5" />
    </Button>
  </div>
</template>
