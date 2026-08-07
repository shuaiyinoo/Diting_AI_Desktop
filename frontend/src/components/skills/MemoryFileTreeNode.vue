<template>
  <div class="mem-tree-node">
    <!-- 文件夹节点 -->
    <template v-if="node.type === 'directory'">
      <button
        class="mem-tree-node__dir"
        :style="{ paddingLeft: depth * 12 + 10 + 'px' }"
        @click="toggleExpand"
      >
        <component :is="expanded ? DownOutlined : RightOutlined" class="mem-tree-node__arrow" />
        <FolderOutlined class="mem-tree-node__icon mem-tree-node__icon--dir" />
        <span class="mem-tree-node__name">{{ node.name }}</span>
      </button>
      <!-- 子节点（递归） -->
      <template v-if="expanded && node.children">
        <MemoryFileTreeNode
          v-for="child in node.children"
          :key="child.relativePath"
          :node="child"
          :selected-path="selectedPath"
          :depth="depth + 1"
          @select="$emit('select', $event)"
        />
      </template>
    </template>

    <!-- 文件节点 -->
    <template v-else>
      <button
        class="mem-tree-node__file"
        :class="{ 'mem-tree-node__file--active': selectedPath === node.relativePath }"
        :style="{ paddingLeft: depth * 12 + 10 + 'px' }"
        @click="$emit('select', node.relativePath)"
      >
        <span class="mem-tree-node__indent"></span>
        <FileOutlined class="mem-tree-node__icon mem-tree-node__icon--file" />
        <span class="mem-tree-node__name">{{ node.name }}</span>
        <span v-if="node.relativePath === 'MEMORY.md'" class="mem-tree-node__badge">索引</span>
      </button>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import {
  FileOutlined,
  FolderOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons-vue'

const props = defineProps({
  node: { type: Object, required: true },
  selectedPath: { type: String, default: '' },
  depth: { type: Number, default: 0 },
})

defineEmits(['select'])

// 文件夹展开状态（默认展开第一层）
const expanded = ref(props.depth < 1)

function toggleExpand() {
  expanded.value = !expanded.value
}
</script>

<style lang="less" scoped>
.mem-tree-node {
  &__dir,
  &__file {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 5px 8px 5px 0;
    border: none;
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-secondary);
    transition: all 0.12s;
    width: 100%;
    text-align: left;

    &:hover {
      background: var(--bg-hover);
      color: var(--text-primary);
    }
  }

  &__dir {
    font-weight: 500;
  }

  &__file {
    &--active {
      background: var(--bg-active);
      color: var(--accent);
      font-weight: 500;
    }
  }

  &__arrow {
    font-size: 10px;
    width: 12px;
    flex-shrink: 0;
    color: var(--text-muted);
  }

  &__indent {
    width: 12px;
    flex-shrink: 0;
  }

  &__icon {
    font-size: 13px;
    flex-shrink: 0;

    &--dir {
      color: #e8a838;
    }

    &--file {
      color: var(--text-muted);
    }
  }

  &__name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__badge {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(22, 119, 255, 0.1);
    color: var(--accent);
    flex-shrink: 0;
  }
}
</style>
