<script setup>
import { cn } from '@/lib/utils'
const props = defineProps({})
</script>
<template>
  <thead :class="cn('[&_tr]:border-b', props.class)"><slot /></thead>
</template>
