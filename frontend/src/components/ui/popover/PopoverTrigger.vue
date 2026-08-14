<script setup>
import { PopoverTrigger } from 'reka-ui'
const props = defineProps({})
</script>
<template>
  <PopoverTrigger v-bind="props"><slot /></PopoverTrigger>
</template>
