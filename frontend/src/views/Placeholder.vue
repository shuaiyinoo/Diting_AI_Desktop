<template>
  <div class="p-6 flex justify-center items-start">
    <Card :title="title || t('placeholder.page')" class="w-[480px]">
      <p class="text-muted-foreground m-0">{{ t('placeholder.pending') }}</p>
    </Card>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { Card } from '@/components/ui/card'

const { t } = useI18n()

defineProps({
  title: {
    type: String,
    default: ''
  }
})
</script>
