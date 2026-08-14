<script setup>
import { PopoverContent, PopoverPortal } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps({
  sideOffset: { type: Number, default: 4 },
  class: { type: String, default: null },
})
</script>

<template>
  <PopoverPortal>
    <PopoverContent
      v-bind="props"
      :class="cn(
        'z-[9999] w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        props.class
      )"
    >
      <slot />
    </PopoverContent>
  </PopoverPortal>
</template>
