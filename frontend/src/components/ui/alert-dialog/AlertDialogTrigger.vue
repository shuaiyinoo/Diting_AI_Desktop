<script setup>
import { AlertDialogTrigger } from 'reka-ui'
const props = defineProps({})
</script>
<template>
  <AlertDialogTrigger v-bind="props"><slot /></AlertDialogTrigger>
</template>
