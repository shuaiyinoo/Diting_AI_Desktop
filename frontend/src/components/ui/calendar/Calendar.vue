<script setup>
import { CalendarRoot, CalendarCell, CalendarCellTrigger, CalendarGrid, CalendarGridBody, CalendarGridHead, CalendarGridRow, CalendarHeadCell, CalendarHeader, CalendarHeading, CalendarNext, CalendarPrev } from 'reka-ui'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from '@lucide/vue'

const props = defineProps({
  modelValue: { type: null, default: undefined },
  multiple: { type: Boolean, default: false },
  defaultValue: { type: null, default: undefined },
  defaultPlaceholder: { type: null, default: undefined },
  placeholder: { type: null, default: undefined },
  pagedNavigation: { type: Boolean, default: false },
  preventDeselect: { type: Boolean, default: false },
  min: { type: null, default: undefined },
  max: { type: null, default: undefined },
  disabled: { type: Boolean, default: false },
  weekdayFormat: { type: String, default: 'narrow' },
  weekStartsOn: { type: Number, default: 0 },
  fixedWeeks: { type: Boolean, default: false },
  numberOfMonths: { type: Number, default: 1 },
  locale: { type: String, default: 'zh-CN' },
  isDateDisabled: { type: Function, default: undefined },
  isDateUnavailable: { type: Function, default: undefined },
  as: { type: null, default: 'div' },
  asChild: { type: Boolean, default: false },
  class: { type: String, default: null },
})

const emits = defineEmits(['update:modelValue', 'update:placeholder'])
</script>

<template>
  <CalendarRoot
    :model-value="props.modelValue"
    :multiple="props.multiple"
    :default-value="props.defaultValue"
    :default-placeholder="props.defaultPlaceholder"
    :placeholder="props.placeholder"
    :paged-navigation="props.pagedNavigation"
    :prevent-deselect="props.preventDeselect"
    :min="props.min"
    :max="props.max"
    :disabled="props.disabled"
    :weekday-format="props.weekdayFormat"
    :week-starts-on="props.weekStartsOn"
    :fixed-weeks="props.fixedWeeks"
    :number-of-months="props.numberOfMonths"
    :locale="props.locale"
    :is-date-disabled="props.isDateDisabled"
    :is-date-unavailable="props.isDateUnavailable"
    :as="props.as"
    :as-child="props.asChild"
    :class="cn('p-3', props.class)"
    @update:model-value="(v) => emits('update:modelValue', v)"
    @update:placeholder="(v) => emits('update:placeholder', v)"
  >
    <template #default="{ grid, weekDays }">
      <CalendarHeader class="relative flex w-full items-center justify-center pt-1">
        <CalendarPrev
          class="absolute left-1 inline-flex size-7 items-center justify-center rounded-md border border-transparent bg-transparent opacity-70 ring-offset-background transition-opacity hover:bg-accent hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          <ChevronLeft class="size-4" />
        </CalendarPrev>
        <CalendarHeading class="text-sm font-medium" />
        <CalendarNext
          class="absolute right-1 inline-flex size-7 items-center justify-center rounded-md border border-transparent bg-transparent opacity-70 ring-offset-background transition-opacity hover:bg-accent hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          <ChevronRight class="size-4" />
        </CalendarNext>
      </CalendarHeader>

      <div class="flex flex-col gap-y-4 sm:flex-row sm:gap-x-4 sm:gap-y-0">
        <CalendarGrid v-for="month in grid" :key="month.value.toString()" class="w-full border-collapse space-y-4">
          <CalendarGridHead>
            <CalendarGridRow class="flex">
              <CalendarHeadCell
                v-for="day in weekDays" :key="day.long"
                class="w-8 rounded-md text-[0.8rem] font-normal text-muted-foreground"
              >
                {{ day.short }}
              </CalendarHeadCell>
            </CalendarGridRow>
          </CalendarGridHead>
          <CalendarGridBody>
            <CalendarGridRow
              v-for="(weekDates, index) in month"
              :key="`weekDate-${index}`"
              class="mt-2 flex w-full"
            >
              <CalendarCell
                v-for="date in weekDates"
                :key="date.toString()"
                :date="date"
                class="relative p-0 text-center text-sm focus-within:relative focus-within:z-20 [&:has([data-selected])]:bg-accent first:[&:has([data-selected])]:rounded-l-md last:[&:has([data-selected])]:rounded-r-md"
              >
                <CalendarCellTrigger
                  :day="date"
                  :month="month.value"
                  class="inline-flex size-8 items-center justify-center rounded-md border border-transparent p-0 text-sm ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[disabled]:text-muted-foreground data-[disabled]:opacity-50 data-[outside-view]:text-muted-foreground data-[outside-view]:opacity-50 data-[today]:bg-accent data-[today]:text-accent-foreground data-[unavailable]:line-through data-[unavailable]:opacity-50"
                />
              </CalendarCell>
            </CalendarGridRow>
          </CalendarGridBody>
        </CalendarGrid>
      </div>
    </template>
  </CalendarRoot>
</template>
