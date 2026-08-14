<script setup>
import { TabsList } from 'reka-ui'
import { cn } from '@/lib/utils'
const props = defineProps({})
</script>
<template>
  <TabsList v-bind="props" :class="cn(
    'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
    props.class
  )"><slot /></TabsList>
</template>
