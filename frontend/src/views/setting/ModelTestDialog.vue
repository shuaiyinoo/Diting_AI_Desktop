<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-w-[440px]">
      <DialogHeader>
        <DialogTitle>连通性测试结果</DialogTitle>
      </DialogHeader>
      <div v-if="result" class="py-4 text-center">
        <div class="mb-3 flex items-center justify-center gap-2 text-lg font-semibold"
          :class="result.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
          <CheckCircle2 v-if="result.success" class="size-5" />
          <AlertCircle v-else class="size-5" />
          {{ result.success ? '连接成功' : '连接失败' }}
        </div>
        <p class="text-sm text-muted-foreground">{{ result.message }}</p>
        <div v-if="result.success" class="mt-2 text-sm text-green-600 dark:text-green-400">
          延迟：{{ result.latencyMs }}ms
        </div>
      </div>
      <DialogFooter>
        <Button @click="open = false">关闭</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup>
import { ref } from 'vue'
import { CheckCircle2, AlertCircle } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

const open = ref(false)
const result = ref(null)

function show(testResult) {
  result.value = testResult
  open.value = true
}

defineExpose({ show })
</script>
