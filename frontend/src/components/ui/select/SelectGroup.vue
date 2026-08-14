<script setup>
import { SelectGroup } from 'reka-ui'
const props = defineProps({})
</script>
<template>
  <SelectGroup v-bind="props"><slot /></SelectGroup>
</template>
