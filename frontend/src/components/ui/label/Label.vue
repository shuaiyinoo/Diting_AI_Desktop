<script setup>
import { Label } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps({})
</script>

<template>
  <Label
    v-bind="props"
    :class="cn(
      'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
      props.class
    )"
  >
    <slot />
  </Label>
</template>
