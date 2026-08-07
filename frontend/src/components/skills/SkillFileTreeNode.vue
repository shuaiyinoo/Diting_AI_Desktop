<template>
  <div class="skill-ftn">
    <div
      class="skill-ftn__row"
      :class="{ 'skill-ftn__row--selected': isSelected }"
      :style="{ paddingLeft: `${depth * 14 + 6}px` }"
      @click="handleClick"
    >
      <!-- 展开/折叠箭头 -->
      <span class="skill-ftn__chev">
        <DownOutlined v-if="node.type === 'directory' && isExpanded" />
        <RightOutlined v-else-if="node.type === 'directory'" />
      </span>
      <!-- 图标 -->
      <span class="skill-ftn__icon">
        <FolderOpenOutlined v-if="node.type === 'directory' && isExpanded" />
        <FolderOutlined v-else-if="node.type === 'directory'" />
        <FileOutlined v-else />
      </span>
      <!-- 名称 -->
      <span class="skill-ftn__name">{{ node.name }}</span>
      <!-- 文件大小 -->
      <span v-if="node.type === 'file' && node.size" class="skill-ftn__size">{{ formatFileSize(node.size) }}</span>
    </div>
    <!-- 子节点 -->
    <div v-if="node.type === 'directory' && isExpanded" class="skill-ftn__children">
      <SkillFileTreeNode
        v-for="child in node.children"
        :key="child.relativePath"
        :node="child"
        :selected-path="selectedPath"
        :expanded-set="expandedSet"
        :depth="depth + 1"
        @select="$emit('select', $event)"
        @toggle="$emit('toggle', $event)"
      />
    </div>
  </div>
</template>

<script setup>
import {
  DownOutlined,
  RightOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  FileOutlined,
} from '@ant-design/icons-vue'

const props = defineProps({
  node: { type: Object, required: true },
  selectedPath: { type: String, default: null },
  expandedSet: { type: Set, default: () => new Set() },
  depth: { type: Number, default: 0 },
})

const emit = defineEmits(['select', 'toggle'])

import { computed } from 'vue'

const isSelected = computed(() => props.selectedPath === props.node.relativePath)
const isExpanded = computed(() => props.expandedSet.has(props.node.relativePath))

function handleClick() {
  if (props.node.type === 'directory') {
    emit('toggle', props.node.relativePath)
  } else {
    emit('select', props.node)
  }
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}
</script>

<style lang="less" scoped>
.skill-ftn {
  &__row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px 3px 6px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-primary);
    transition: background 100ms;
    user-select: none;

    &:hover {
      background: var(--bg-hover);
    }
  }

  &__row--selected {
    background: rgba(22, 119, 255, 0.08);
    color: var(--accent);
  }

  &__chev {
    width: 14px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 10px;
  }

  &__icon {
    width: 14px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    font-size: 12px;
  }

  &__name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__size {
    flex-shrink: 0;
    font-size: 10px;
    color: var(--text-muted);
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  }

  &__children {
    /* 子节点容器 */
  }
}
</style>
