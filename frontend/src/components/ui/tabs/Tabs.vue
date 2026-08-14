<script setup>
import { TabsRoot } from 'reka-ui'
const props = defineProps({})
const modelValue = defineModel()
</script>
<template>
  <TabsRoot v-model="modelValue" v-bind="props"><slot /></TabsRoot>
</template>
