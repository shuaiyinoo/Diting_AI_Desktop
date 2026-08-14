<script setup>
import { cn } from '@/lib/utils'
import { badgeVariants } from '.'

const props = defineProps({
  variant: { type: String, default: 'default' },
  class: { type: String, default: null },
})
</script>

<template>
  <span
    :class="cn(
      'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
      badgeVariants[props.variant],
      props.class
    )"
  >
    <slot />
  </span>
</template>
