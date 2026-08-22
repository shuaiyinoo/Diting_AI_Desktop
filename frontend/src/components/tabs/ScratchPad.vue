<template>
  <div class="flex flex-col h-full w-full bg-card">
    <!-- 顶部标题栏 -->
    <div class="flex items-center gap-2 px-4 h-11 flex-shrink-0 border-b border-border">
      <Pencil class="size-4 text-primary" />
      <span class="text-sm font-semibold text-foreground">{{ t('scratchPad.title') }}</span>
      <span class="text-[11px] text-muted-foreground ml-auto">{{ t('scratchPad.hint') }}</span>
    </div>

    <!-- 编辑区 -->
    <div class="flex-1 min-h-0 overflow-hidden px-4 py-3">
      <textarea
        v-model="content"
        class="w-full h-full border-none outline-none resize-none text-sm leading-7 font-inherit text-foreground bg-transparent placeholder:text-muted-foreground [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-sm"
        :placeholder="t('scratchPad.placeholder')"
        @input="onInput"
      ></textarea>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Pencil } from '@lucide/vue'

const { t } = useI18n()

const STORAGE_KEY = 'diting-scratch-pad'

const content = ref(localStorage.getItem(STORAGE_KEY) || '')

let saveTimer = null

function onInput() {
  // 防抖保存：输入后 500ms 保存
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, content.value)
    saveTimer = null
  }, 500)
}

// 组件卸载时立即保存
watch(content, () => {
  localStorage.setItem(STORAGE_KEY, content.value)
})
</script>
