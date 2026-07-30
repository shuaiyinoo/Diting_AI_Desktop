<template>
  <div class="file-preview-panel">
    <!-- 顶部工具栏 -->
    <div class="file-preview-panel__toolbar">
      <div class="file-preview-panel__title">
        <file-outlined class="file-preview-panel__icon" />
        <span class="file-preview-panel__name" :title="file ? file.name : ''">
          {{ file ? file.name : '文件预览' }}
        </span>
      </div>
      <!-- 右侧按钮组 -->
      <div class="file-preview-panel__actions">
        <!-- 编辑按钮：仅可编辑文件显示 -->
        <a-tooltip v-if="showEditButton" title="编辑">
          <button class="panel-toggle-btn" @click="$emit('edit')">
            <edit-outlined />
          </button>
        </a-tooltip>
        <!-- 折叠第四面板按钮 -->
        <a-tooltip :title="panel4Collapsed ? '展开信息面板' : '收起信息面板'">
          <button class="panel-toggle-btn" @click="$emit('toggle-panel4')">
            <component :is="panel4Collapsed ? 'MenuFoldOutlined' : 'MenuUnfoldOutlined'" />
          </button>
        </a-tooltip>
      </div>
    </div>

    <!-- 预览主体 -->
    <div class="file-preview-panel__body">
      <div v-if="!file" class="file-preview-panel__empty">
        <a-empty description="请从左侧选择文件" />
      </div>
      <FileViewer
        v-else
        :key="file.id"
        :file-item-id="file.id"
        :theme="isDark ? 'dark' : 'light'"
        :toolbar="false"
        @loaded="onLoaded"
        @error="onError"
      />
    </div>
  </div>
</template>

<script setup>
import FileViewer from '@/components/file/FileViewer.vue';
import { isDark } from '@/theme';

const props = defineProps({
  file: { type: Object, default: null },
  panel4Collapsed: { type: Boolean, default: false },
  showEditButton: { type: Boolean, default: false },
});

defineEmits(['toggle-panel4', 'edit']);

function onLoaded(info) {
  console.log('[FilePreviewPanel] 文件加载完成:', info);
}

function onError(err) {
  console.error('[FilePreviewPanel] 文件加载失败:', err);
}
</script>

<style lang="less" scoped>
.file-preview-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--bg-panel);
  border: none;
  border-radius: 0;
  overflow: hidden;

  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px 0 14px;
    height: 40px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-color);
    background-color: var(--bg-panel);
  }

  &__actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  &__title {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }

  &__icon {
    color: var(--accent);
    font-size: 14px;
    flex-shrink: 0;
  }

  &__name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--bg-panel);
  }

  &__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }
}

.panel-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 14px;

  &:hover {
    background-color: var(--bg-hover);
    color: var(--text-primary);
  }
}
</style>
