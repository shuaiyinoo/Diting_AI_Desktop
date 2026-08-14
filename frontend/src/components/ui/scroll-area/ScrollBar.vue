<script setup>
import { ScrollBar } from 'reka-ui'
import { cn } from '@/lib/utils'
const props = defineProps({
  orientation: { type: String, default: 'vertical' },
  class: { type: String, default: null },
})
</script>
<template>
  <ScrollBar
    v-bind="props"
    :class="cn(
      'flex touch-none select-none transition-colors',
      props.orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-[1px]',
      props.orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-[1px]',
      props.class
    )"
  >
    <slot />
  </ScrollBar>
</template>
