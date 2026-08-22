<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-[440px]">
      <DialogHeader>
        <DialogTitle>{{ t('model.test.title') }}</DialogTitle>
      </DialogHeader>
      <div v-if="result" class="py-4 text-center">
        <div class="mb-3 flex items-center justify-center gap-2 text-lg font-semibold"
          :class="result.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
          <CheckCircle2 v-if="result.success" class="size-5" />
          <AlertCircle v-else class="size-5" />
          {{ result.success ? t('model.test.success') : t('model.test.failed') }}
        </div>
        <p class="text-sm text-muted-foreground">{{ result.message }}</p>
        <div v-if="result.success" class="mt-2 text-sm text-green-600 dark:text-green-400">
          {{ getLatencyText(result.latencyMs) }}
        </div>
      </div>
      <DialogFooter>
        <Button @click="open = false">{{ t('model.test.close') }}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup>
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CheckCircle2, AlertCircle } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

const { t } = useI18n()

const open = ref(false)
const result = ref(null)

function show(testResult) {
  result.value = testResult
  open.value = true
}

function getLatencyText(latency) {
  return t('model.test.latency', { latency })
}

defineExpose({ show })
</script>
