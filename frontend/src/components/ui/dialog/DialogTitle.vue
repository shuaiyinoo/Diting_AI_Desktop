<script setup>
import { DialogTitle } from 'reka-ui'
import { cn } from '@/lib/utils'
const props = defineProps({})
</script>
<template>
  <DialogTitle v-bind="props" :class="cn('text-lg font-semibold leading-none tracking-tight', props.class)">
    <slot />
  </DialogTitle>
</template>
