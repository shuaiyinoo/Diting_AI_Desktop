<script setup>
import { cn } from '@/lib/utils'

const props = defineProps({
  size: { type: String, default: 'default' },
  class: { type: String, default: null },
})

const sizeMap = {
  sm: 'size-4',
  default: 'size-6',
  lg: 'size-8',
}
</script>

<template>
  <div
    :class="cn(
      'inline-flex items-center justify-center',
      sizeMap[props.size],
      props.class
    )"
  >
    <svg class="animate-spin" viewBox="0 0 24 24" fill="none">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  </div>
</template>
