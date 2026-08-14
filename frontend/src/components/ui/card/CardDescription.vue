<script setup>
import { cn } from '@/lib/utils'
const props = defineProps({})
</script>
<template>
  <p :class="cn('text-sm text-muted-foreground', props.class)"><slot /></p>
</template>
