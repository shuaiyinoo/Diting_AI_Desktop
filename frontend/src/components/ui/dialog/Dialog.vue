<script setup>
import { DialogRoot } from 'reka-ui'
const props = defineProps({})
const open = defineModel('open')
</script>
<template>
  <DialogRoot v-model:open="open" v-bind="props">
    <slot />
  </DialogRoot>
</template>
