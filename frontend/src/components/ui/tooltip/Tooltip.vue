<script setup>
import { TooltipProvider, TooltipRoot } from 'reka-ui'

const props = defineProps({})
</script>

<template>
  <TooltipProvider :delay-duration="300">
    <TooltipRoot v-bind="props">
      <slot />
    </TooltipRoot>
  </TooltipProvider>
</template>
