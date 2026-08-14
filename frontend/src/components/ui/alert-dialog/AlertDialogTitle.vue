<script setup>
import { AlertDialogTitle } from 'reka-ui'
import { cn } from '@/lib/utils'
const props = defineProps({})
</script>
<template>
  <AlertDialogTitle v-bind="props" :class="cn('text-lg font-semibold', props.class)">
    <slot />
  </AlertDialogTitle>
</template>
