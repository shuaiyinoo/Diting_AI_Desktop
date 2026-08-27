<script setup>
import { computed } from 'vue'
import { SelectItem, SelectItemIndicator, SelectItemText } from 'reka-ui'
import { Check } from '@lucide/vue'
import { cn } from '@/lib/utils'

const props = defineProps({
  value: { type: [String, Number, Boolean], required: true },
  disabled: { type: Boolean, default: false },
  class: { type: String, default: null },
})

// 只把 reka-ui SelectItem 需要的 props 透传过去，避免默认空字符串 value 覆盖实际值
const rekaProps = computed(() => ({
  value: props.value,
  disabled: props.disabled,
}))
</script>

<template>
  <SelectItem
    v-bind="rekaProps"
    :class="cn(
      'relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      props.class
    )"
  >
    <span class="absolute left-2 flex size-3.5 items-center justify-center">
      <SelectItemIndicator>
        <Check class="size-3.5" />
      </SelectItemIndicator>
    </span>
    <SelectItemText>
      <slot />
    </SelectItemText>
  </SelectItem>
</template>
