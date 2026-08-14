<template>
  <div class="p-6 flex justify-center items-start">
    <Card :title="title" class="w-[480px]">
      <p class="text-muted-foreground m-0">该模块页面待开发。</p>
    </Card>
  </div>
</template>

<script setup>
import { Card } from '@/components/ui/card'

defineProps({
  title: {
    type: String,
    default: '页面'
  }
})
</script>
