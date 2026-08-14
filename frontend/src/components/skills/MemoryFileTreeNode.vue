<template>
  <div>
    <!-- 文件夹节点 -->
    <template v-if="node.type === 'directory'">
      <button
        class="flex items-center gap-1 py-1.5 pr-2 pl-0 border-none bg-transparent rounded cursor-pointer text-xs text-muted-foreground transition-all w-full text-left hover:bg-muted hover:text-foreground font-medium"
        :style="{ paddingLeft: depth * 12 + 10 + 'px' }"
        @click="toggleExpand"
      >
        <component :is="expanded ? ChevronDown : ChevronRight" class="size-2.5 w-3 flex-shrink-0 text-muted-foreground" />
        <Folder class="size-3.5 flex-shrink-0 text-amber-500" />
        <span class="flex-1 min-w-0 truncate">{{ node.name }}</span>
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
        class="flex items-center gap-1 py-1.5 pr-2 pl-0 border-none bg-transparent rounded cursor-pointer text-xs text-muted-foreground transition-all w-full text-left hover:bg-muted hover:text-foreground"
        :class="selectedPath === node.relativePath ? 'bg-accent text-primary font-medium' : ''"
        :style="{ paddingLeft: depth * 12 + 10 + 'px' }"
        @click="$emit('select', node.relativePath)"
      >
        <span class="w-3 flex-shrink-0"></span>
        <File class="size-3.5 flex-shrink-0 text-muted-foreground" />
        <span class="flex-1 min-w-0 truncate">{{ node.name }}</span>
        <span v-if="node.relativePath === 'MEMORY.md'" class="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary flex-shrink-0">索引</span>
      </button>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { File, Folder, ChevronDown, ChevronRight } from '@lucide/vue'

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
