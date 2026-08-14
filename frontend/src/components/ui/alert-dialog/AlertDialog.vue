<script setup>
import { AlertDialogRoot } from 'reka-ui'
const props = defineProps({})
const open = defineModel('open')
</script>
<template>
  <AlertDialogRoot v-model:open="open" v-bind="props"><slot /></AlertDialogRoot>
</template>
