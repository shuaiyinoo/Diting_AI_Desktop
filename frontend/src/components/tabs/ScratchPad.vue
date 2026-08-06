<template>
  <div class="scratch-pad">
    <!-- 顶部标题栏 -->
    <div class="scratch-pad__header">
      <EditOutlined class="scratch-pad__icon" />
      <span class="scratch-pad__title">草稿</span>
      <span class="scratch-pad__hint">临时记录 · 自动保存</span>
    </div>

    <!-- 编辑区 -->
    <div class="scratch-pad__body">
      <textarea
        v-model="content"
        class="scratch-pad__textarea"
        placeholder="临时记录、想法、备忘..."
        @input="onInput"
      ></textarea>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { EditOutlined } from '@ant-design/icons-vue'

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

<style lang="less" scoped>
.scratch-pad {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background-color: var(--bg-panel);

  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
    height: 44px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-color);
  }

  &__icon {
    font-size: 16px;
    color: var(--accent);
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__hint {
    font-size: 11px;
    color: var(--text-muted);
    margin-left: auto;
  }

  &__body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    padding: 12px 16px;
  }

  &__textarea {
    width: 100%;
    height: 100%;
    border: none;
    outline: none;
    resize: none;
    font-size: 14px;
    line-height: 1.7;
    font-family: inherit;
    color: var(--text-primary);
    background: transparent;

    &::placeholder {
      color: var(--text-muted);
    }

    &::-webkit-scrollbar {
      width: 6px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
    &::-webkit-scrollbar-thumb {
      background: var(--border-color);
      border-radius: 3px;
      &:hover {
        background: var(--text-muted);
      }
    }
  }
}
</style>
