<script setup>
import { PopoverRoot } from 'reka-ui'
const props = defineProps({})
const open = defineModel('open')
</script>
<template>
  <PopoverRoot v-model:open="open" v-bind="props"><slot /></PopoverRoot>
</template>
