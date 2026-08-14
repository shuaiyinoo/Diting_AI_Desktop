<script setup>
import { AlertDialogDescription } from 'reka-ui'
import { cn } from '@/lib/utils'
const props = defineProps({})
</script>
<template>
  <AlertDialogDescription v-bind="props" :class="cn('text-sm text-muted-foreground', props.class)">
    <slot />
  </AlertDialogDescription>
</template>
