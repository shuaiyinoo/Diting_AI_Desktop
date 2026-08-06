<template>
  <div
    class="tab-item"
    :class="{
      'tab-item--active': isActive,
      'tab-item--scratch': isScratch,
      'tab-item--streaming': isStreaming,
    }"
    @click="$emit('activate', tab.id)"
    @mousedown.middle.prevent="$emit('close', tab.id)"
  >
    <!-- 草稿 Tab：固定图标，无关闭按钮 -->
    <template v-if="isScratch">
      <EditOutlined class="tab-item__icon" />
      <span class="tab-item__title">草稿</span>
    </template>

    <!-- 会话 Tab -->
    <template v-else>
      <!-- 流式指示器（旋转圆点） -->
      <span v-if="isStreaming" class="tab-item__spinner" />

      <!-- 类型图标 -->
      <MessageOutlined v-if="tab.type === 'chat'" class="tab-item__icon" />
      <RobotOutlined v-else-if="tab.type === 'agent'" class="tab-item__icon" />
      <FileOutlined v-else-if="tab.type === 'file'" class="tab-item__icon" />

      <!-- 标题 -->
      <span class="tab-item__title" :title="tab.title">{{ tab.title }}</span>

      <!-- 关闭按钮 -->
      <button
        class="tab-item__close"
        title="关闭"
        @click.stop="$emit('close', tab.id)"
      >
        <CloseOutlined />
      </button>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  EditOutlined,
  MessageOutlined,
  RobotOutlined,
  FileOutlined,
  CloseOutlined,
} from '@ant-design/icons-vue'

const props = defineProps({
  tab: { type: Object, required: true },
  isActive: { type: Boolean, default: false },
  isStreaming: { type: Boolean, default: false },
})

defineEmits(['activate', 'close'])

const isScratch = computed(() => props.tab.type === 'scratch')
</script>

<style lang="less" scoped>
.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  padding: 0 10px 0 12px;
  border-radius: 7px 7px 0 0;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  transition: background-color 0.15s ease, color 0.15s ease;
  white-space: nowrap;
  flex-shrink: 0;
  position: relative;
  user-select: none;
  -webkit-app-region: no-drag;

  &:hover {
    background-color: var(--bg-hover);
    color: var(--text-primary);
  }

  &--active {
    background-color: var(--bg-panel);
    color: var(--accent);
    font-weight: 600;

    // 底部高亮线
    &::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--accent);
      border-radius: 2px 2px 0 0;
    }

    &:hover {
      background-color: var(--bg-panel);
    }
  }

  // 草稿 Tab：更紧凑
  &--scratch {
    padding: 0 12px;
    min-width: 72px;
    justify-content: center;
  }

  // 流式状态：轻微高亮
  &--streaming {
    .tab-item__title {
      color: var(--accent);
    }
  }

  &__icon {
    font-size: 14px;
    flex-shrink: 0;
    color: var(--text-muted);

    .tab-item--active & {
      color: var(--accent);
    }
  }

  &__title {
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
    transition: color 0.15s ease;
  }

  &__close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s ease, background-color 0.15s ease;
    font-size: 10px;

    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-primary);
    }

    // 激活状态下始终显示关闭按钮
    .tab-item--active & {
      opacity: 0.6;
    }

    // hover Tab 时显示关闭按钮
    .tab-item:hover & {
      opacity: 1;
    }
  }

  // 流式旋转指示器
  &__spinner {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
    animation: tab-spinner-pulse 1s ease-in-out infinite;
  }
}

@keyframes tab-spinner-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}
</style>
