<script setup>
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
const props = defineProps({})
</script>
<template>
  <Separator :class="cn('-mx-1 my-1', props.class)" />
</template>
