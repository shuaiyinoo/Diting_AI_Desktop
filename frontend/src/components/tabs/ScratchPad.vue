<template>
  <div class="relative flex flex-col h-full w-full bg-card">
    <!-- 编辑区（顶部直接是工具栏 + 编辑器） -->
    <div class="flex-1 min-h-0 overflow-hidden">
      <MdTtEditor
        ref="editorRef"
        v-model="content"
        :editable="true"
        :placeholder="t('scratchPad.placeholder')"
        @change="onContentChange"
      />
    </div>

    <!-- 底部状态栏 -->
    <div class="flex items-center gap-2 h-7 flex-shrink-0 border-t border-border px-3">
      <!-- 左侧标签 -->
      <span class="text-[11px] text-muted-foreground">临时笔记 / Todo草稿 / 剪贴板暂存</span>

      <div class="flex-1" />

      <!-- 右侧保存状态 -->
      <Transition name="fade">
        <span v-if="saving" class="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Loader2 class="size-3 animate-spin" />
          <span>保存中…</span>
        </span>
        <span v-else class="text-[11px] text-muted-foreground">临时记录 · 自动保存</span>
      </Transition>
    </div>

    <!-- 语音输入按钮（固定底部中间） -->
    <VoiceInputButton @transcribed="handleVoiceTranscribed" />
  </div>
</template>

<script setup>
import { ref, nextTick, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { Loader2 } from '@lucide/vue'
import MdTtEditor from '@/components/common/MdTtEditor.vue'
import VoiceInputButton from '@/components/common/VoiceInputButton.vue'

const { t } = useI18n()

const STORAGE_KEY = 'diting-scratch-pad'

const content = ref(localStorage.getItem(STORAGE_KEY) || '')
const editorRef = ref(null)
const saving = ref(false)

/** 将语音转写的文字插入到光标位置，无光标时追加到末尾 */
function handleVoiceTranscribed(text) {
  // 优先尝试在编辑器光标处插入
  if (editorRef.value?.insertAtCursor?.(text)) {
    // 插入成功后等 content 同步，再立即保存
    nextTick(() => saveNow())
    return
  }
  // 无光标（编辑器未聚焦），追加到末尾
  const current = content.value || ''
  const separator = current && !current.endsWith('\n') ? '\n' : ''
  content.value = current + separator + text + '\n'
  saveNow()
}

let saveTimer = null
let savedContent = content.value

/** 立即保存到 localStorage，并显示保存动画 */
function saveNow() {
  if (content.value === savedContent) return
  saving.value = true
  localStorage.setItem(STORAGE_KEY, content.value)
  savedContent = content.value
  // 短暂延迟后隐藏动画
  setTimeout(() => {
    saving.value = false
  }, 400)
}

function onContentChange() {
  // 防抖保存：输入后 500ms 保存
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveNow()
    saveTimer = null
  }, 500)
}

// 组件卸载时立即同步保存
onBeforeUnmount(() => {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  // 同步保存，不显示动画
  if (content.value !== savedContent) {
    localStorage.setItem(STORAGE_KEY, content.value)
    savedContent = content.value
  }
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
