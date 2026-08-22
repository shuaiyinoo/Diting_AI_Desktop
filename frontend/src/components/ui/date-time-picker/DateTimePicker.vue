<script setup>
import { ref, computed, watch } from 'vue'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { TimePicker } from '@/components/ui/time-picker'
import { Button } from '@/components/ui/button'
import { Calendar as CalendarIcon, X } from '@lucide/vue'
import { CalendarDate } from '@internationalized/date'
import dayjs from 'dayjs'
import { cn } from '@/lib/utils'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps({
  /** v-model 值：YYYY-MM-DDTHH:mm 格式字符串，或空字符串 */
  modelValue: { type: String, default: '' },
  /** 是否禁用 */
  disabled: { type: Boolean, default: false },
  /** placeholder */
  placeholder: { type: String, default: '' },
  /** 传入 class */
  class: { type: String, default: null },
})

const emits = defineEmits(['update:modelValue', 'change'])

const open = ref(false)

// Calendar 重建 key，每次打开 Popover 时递增以强制重建 Calendar
// 这样 :default-value 和 :default-placeholder 能反映最新的 modelValue
const calendarKey = ref(0)

// 今天的 CalendarDate
const todayCalendarDate = (() => {
  const now = dayjs()
  return new CalendarDate(now.year(), now.month() + 1, now.date())
})()

// Calendar 的默认值和默认 placeholder
// 不传 modelValue，让 CalendarRoot 在 passive 模式下自管理状态
// 这样 CalendarRoot 内部的 modelValue ref 不会被外部响应式更新干扰
const calendarDefaultValue = ref(undefined)
const calendarDefaultPlaceholder = ref(todayCalendarDate)

// 时间字符串
const timeStr = ref('09:00')

// 将外部 modelValue 字符串同步到 Calendar 的 default-value 和 default-placeholder
// 注意：default-value 只在组件初始化时生效，后续通过 calendarKey 重建来刷新
watch(() => props.modelValue, (val) => {
  if (val) {
    const d = dayjs(val)
    if (d.isValid()) {
      const cd = new CalendarDate(d.year(), d.month() + 1, d.date())
      calendarDefaultValue.value = cd
      calendarDefaultPlaceholder.value = cd
      timeStr.value = d.format('HH:mm')
    }
  } else {
    calendarDefaultValue.value = undefined
    calendarDefaultPlaceholder.value = todayCalendarDate
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

// 构造日期时间字符串
function buildDateStr(date, time) {
  return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}T${time}`
}

// 缓存最近选中的日期，用于时间修改时构建字符串
const lastSelectedDate = ref(null)

// 当 Calendar 选择日期时更新
function onDateSelect(date) {
  if (!date) return
  const newDateStr = buildDateStr(date, timeStr.value)
  emits('update:modelValue', newDateStr)
  // 不自动关闭，让用户可以同时调整时间
}

// 当时间选择器变化时更新
function onTimeChange(time) {
  timeStr.value = time || '09:00'
  if (lastSelectedDate.value) {
    const newDateStr = buildDateStr(lastSelectedDate.value, timeStr.value)
    emits('update:modelValue', newDateStr)
  } else if (calendarDefaultValue.value) {
    const newDateStr = buildDateStr(calendarDefaultValue.value, timeStr.value)
    emits('update:modelValue', newDateStr)
  }
}

// 包装 onDateSelect，同时缓存日期
function handleDateSelect(date) {
  if (!date) return
  lastSelectedDate.value = date
  onDateSelect(date)
}

// 清除选择
function clearValue() {
  lastSelectedDate.value = null
  calendarDefaultValue.value = undefined
  calendarDefaultPlaceholder.value = todayCalendarDate
  timeStr.value = '09:00'
  emits('update:modelValue', '')
}

// 每次 Popover 打开时，递增 key 以重建 Calendar，反映当前 modelValue
watch(open, (isOpen) => {
  if (isOpen) {
    calendarKey.value++
    // 重新同步内部状态
    if (props.modelValue) {
      const d = dayjs(props.modelValue)
      if (d.isValid()) {
        const cd = new CalendarDate(d.year(), d.month() + 1, d.date())
        lastSelectedDate.value = cd
        timeStr.value = d.format('HH:mm')
      }
    } else {
      lastSelectedDate.value = null
      timeStr.value = '09:00'
    }
  }
})
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
          <CalendarIcon class="size-4 shrink-0" />
          {{ displayText || placeholder }}
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-auto p-0" align="start">
        <!--
          不传 :model-value（始终 undefined），让 CalendarRoot 在 passive 模式下自管理状态。
          通过 :default-value 初始化选中值，通过 :default-placeholder 初始化显示月份。
          这样 CalendarRoot 内部的 modelValue 是独立的 ref，不会因外部响应式更新导致
          watch(modelValue, ...) 回调中 isEqualDay(placeholder.value, ...) 报错。
        -->
        <Calendar
          :key="calendarKey"
          :default-value="calendarDefaultValue"
          :default-placeholder="calendarDefaultPlaceholder"
          :prevent-deselect="true"
          @update:model-value="handleDateSelect"
        />
        <div class="flex items-center gap-2 border-t border-border/50 p-3">
          <span class="text-xs font-medium text-muted-foreground shrink-0">{{ t('dateTimePicker.time') }}</span>
          <TimePicker
            :model-value="timeStr"
            @update:model-value="onTimeChange"
            class="flex-1"
          />
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
