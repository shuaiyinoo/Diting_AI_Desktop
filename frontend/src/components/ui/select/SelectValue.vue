<script setup>
import { SelectValue } from 'reka-ui'
const props = defineProps({})
</script>
<template>
  <SelectValue v-bind="props">
    <slot />
  </SelectValue>
</template>
