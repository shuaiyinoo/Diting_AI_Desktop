<script setup>
import { DialogClose } from 'reka-ui'
const props = defineProps({})
</script>
<template>
  <DialogClose v-bind="props"><slot /></DialogClose>
</template>
