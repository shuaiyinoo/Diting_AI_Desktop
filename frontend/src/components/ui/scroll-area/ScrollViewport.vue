<script setup>
import { ScrollAreaViewport } from 'reka-ui'
import { cn } from '@/lib/utils'
const props = defineProps({})
</script>
<template>
  <ScrollAreaViewport v-bind="props" :class="cn('h-full w-full rounded-[inherit]', props.class)">
    <slot />
  </ScrollAreaViewport>
</template>
