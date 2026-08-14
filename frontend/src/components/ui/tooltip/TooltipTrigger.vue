<script setup>
import { TooltipTrigger } from 'reka-ui'
const props = defineProps({})
</script>
<template>
  <TooltipTrigger v-bind="props"><slot /></TooltipTrigger>
</template>
