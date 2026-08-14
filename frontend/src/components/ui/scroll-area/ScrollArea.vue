<script setup>
import { ScrollAreaRoot } from 'reka-ui'
import { cn } from '@/lib/utils'
import ScrollAreaViewport from './ScrollViewport.vue'
import ScrollBar from './ScrollBar.vue'

const props = defineProps({})
</script>

<template>
  <ScrollAreaRoot v-bind="props" :class="cn('relative overflow-hidden', props.class)">
    <ScrollAreaViewport class="h-full w-full rounded-[inherit]">
      <slot />
    </ScrollAreaViewport>
    <ScrollBar />
    <ScrollBar orientation="horizontal" />
  </ScrollAreaRoot>
</template>
