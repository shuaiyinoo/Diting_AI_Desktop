<template>
  <div>
    <div
      class="flex items-center gap-1 py-0.5 pl-1.5 pr-2 rounded cursor-pointer text-xs text-foreground transition-colors select-none hover:bg-muted"
      :class="isSelected ? 'bg-primary/8 text-primary' : ''"
      :style="{ paddingLeft: `${depth * 14 + 6}px` }"
      @click="handleClick"
    >
      <!-- 展开/折叠箭头 -->
      <span class="w-3.5 flex-shrink-0 flex items-center justify-center text-muted-foreground">
        <ChevronDown v-if="node.type === 'directory' && isExpanded" class="size-2.5" />
        <ChevronRight v-else-if="node.type === 'directory'" class="size-2.5" />
      </span>
      <!-- 图标 -->
      <span class="w-3.5 flex-shrink-0 flex items-center justify-center text-muted-foreground">
        <FolderOpen v-if="node.type === 'directory' && isExpanded" class="size-3" />
        <Folder v-else-if="node.type === 'directory'" class="size-3" />
        <File v-else class="size-3" />
      </span>
      <!-- 名称 -->
      <span class="flex-1 min-w-0 truncate">{{ node.name }}</span>
      <!-- 文件大小 -->
      <span v-if="node.type === 'file' && node.size" class="flex-shrink-0 text-[10px] text-muted-foreground font-mono">{{ formatFileSize(node.size) }}</span>
    </div>
    <!-- 子节点 -->
    <div v-if="node.type === 'directory' && isExpanded">
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
import { ChevronDown, ChevronRight, Folder, FolderOpen, File } from '@lucide/vue'
import { computed } from 'vue'

const props = defineProps({
  node: { type: Object, required: true },
  selectedPath: { type: String, default: null },
  expandedSet: { type: Set, default: () => new Set() },
  depth: { type: Number, default: 0 },
})

const emit = defineEmits(['select', 'toggle'])

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
