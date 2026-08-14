<template>
  <div class="flex h-full flex-col overflow-hidden border-l border-border bg-background" :style="{ width: width + 'px', flexShrink: 0 }">
    <!-- 顶部：文件模式切换 -->
    <div class="flex h-10 shrink-0 items-center gap-1 border-b border-border px-2">
      <Button
        variant="ghost"
        size="sm"
        class="h-7 gap-1.5 rounded-md px-2.5 text-xs font-medium"
        :class="mode === 'session' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'"
        @click="$emit('switch-mode', 'session')"
      >
        <File :size="14" />
        <span>会话文件</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="h-7 gap-1.5 rounded-md px-2.5 text-xs font-medium"
        :class="mode === 'project' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'"
        @click="$emit('switch-mode', 'project')"
      >
        <Folder :size="14" />
        <span>项目文件</span>
      </Button>
    </div>

    <!-- 文件列表 -->
    <div class="min-h-0 flex-1 overflow-y-auto">
      <!-- 会话文件模式：路径显示 -->
      <div v-if="mode === 'session' && sessionPath" class="flex items-center gap-1.5 border-b border-border/50 px-2.5 py-1.5" :title="sessionPath">
        <Folder :size="13" class="shrink-0 text-muted-foreground" />
        <span class="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" :class="{ 'direction-rtl': sessionPathNeedsEllipsis }">{{ sessionPath }}</span>
        <Button variant="ghost" size="icon" class="size-4 shrink-0 text-muted-foreground hover:text-foreground" title="在系统文件管理器中打开" @click="$emit('open-folder', 'session')">
          <FolderOpen class="size-3.5" />
        </Button>
      </div>

      <!-- 项目文件模式：路径显示 -->
      <div v-if="mode === 'project' && projectPath" class="flex items-center gap-1.5 border-b border-border/50 px-2.5 py-1.5" :title="projectPath">
        <Folder :size="13" class="shrink-0 text-muted-foreground" />
        <span class="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" :class="{ 'direction-rtl': projectPathNeedsEllipsis }">{{ projectPath }}</span>
        <Button variant="ghost" size="icon" class="size-4 shrink-0 text-muted-foreground hover:text-foreground" title="在系统文件管理器中打开" @click="$emit('open-folder', 'project')">
          <FolderOpen class="size-3.5" />
        </Button>
      </div>

      <!-- 附加文件夹列表 -->
      <div v-if="mode === 'project' && attachedDirs.length > 0" class="py-0.5">
        <div v-for="dirPath in attachedDirs" :key="'attached-' + dirPath">
          <!-- 附加目录根行 -->
          <div
            class="flex cursor-pointer items-center gap-1 py-1 pr-2 transition-colors hover:bg-accent/30"
            :style="{ paddingLeft: '8px' }"
            @click="$emit('toggle-attached-dir', dirPath)"
          >
            <component :is="expandedAttachedDirs.has(dirPath) ? ChevronDown : ChevronRight" class="size-2.5 text-muted-foreground" />
            <Folder :size="14" class="shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1 truncate text-[12px] text-foreground" :title="dirPath">{{ getDirName(dirPath) }}</span>
            <Button variant="ghost" size="icon" class="size-4 shrink-0 text-muted-foreground hover:text-destructive" title="移除附加文件夹" @click.stop="$emit('detach-folder', dirPath)">
              <X class="size-3.5" />
            </Button>
          </div>
          <!-- 附加目录子项 -->
          <template v-if="expandedAttachedDirs.has(dirPath)">
            <div
              v-for="child in flattenAttachedDir(dirPath)"
              :key="child.path"
              class="flex cursor-pointer items-center gap-1 py-1 pr-2 transition-colors hover:bg-accent/30"
              :style="{ paddingLeft: 8 + child.depth * 16 + 'px' }"
              @click="child.isDir ? $emit('toggle-attached-dir', child.path) : $emit('open-attached-file', dirPath, child.relativePath)"
            >
              <component v-if="child.isDir" :is="child.expanded ? ChevronDown : ChevronRight" class="size-2.5 text-muted-foreground" />
              <span v-else class="inline-block w-[10px]" />
              <component :is="child.isDir ? Folder : FileText" :size="14" class="shrink-0 text-muted-foreground" />
              <span class="min-w-0 flex-1 truncate text-[12px] text-foreground">{{ child.name }}</span>
            </div>
          </template>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="flatFileTree.length === 0 && attachedDirs.length === 0" class="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <Folder :size="32" class="opacity-40" />
        <p class="text-xs">{{ mode === 'project' ? '暂无项目文件' : '暂无会话文件' }}</p>
      </div>

      <!-- 文件树 -->
      <div v-else class="py-0.5">
        <div
          v-for="node in flatFileTree"
          :key="node.path"
          class="flex cursor-pointer items-center gap-1 py-1 pr-2 transition-colors hover:bg-accent/30"
          :style="{ paddingLeft: 8 + node.depth * 16 + 'px' }"
          @click="node.isDir ? $emit('toggle-dir', node) : $emit('open-file', node)"
        >
          <component v-if="node.isDir" :is="node.expanded ? ChevronDown : ChevronRight" class="size-2.5 text-muted-foreground" />
          <span v-else class="inline-block w-[10px]" />
          <component :is="node.isDir ? Folder : FileText" :size="14" class="shrink-0 text-muted-foreground" />
          <span class="min-w-0 flex-1 truncate text-[12px] text-foreground">{{ node.name }}</span>
        </div>
      </div>
    </div>

    <!-- 底部操作区 -->
    <div class="flex shrink-0 items-center gap-1.5 border-t border-border p-2">
      <!-- 添加文件 -->
      <Button
        variant="outline"
        class="flex-1 gap-1.5 rounded-md border-dashed border-border py-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary"
        @click="$emit('add-file')"
      >
        <Paperclip class="size-3.5" />
        <span>{{ mode === 'session' ? '添加文件到会话' : '添加文件' }}</span>
      </Button>
      <!-- 附加文件夹（仅项目模式） -->
      <Button
        v-if="mode === 'project'"
        variant="outline"
        class="flex-1 gap-1.5 rounded-md border-dashed border-border py-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary"
        @click="$emit('attach-folder')"
      >
        <FolderPlus class="size-3.5" />
        <span>附加文件夹</span>
      </Button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Folder, File, ChevronDown, ChevronRight, FolderOpen, FileText, X, Paperclip, FolderPlus } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const props = defineProps({
  /** 面板宽度 */
  width: { type: Number, default: 300 },
  /** 面板模式 */
  mode: { type: String, default: 'session' },
  /** 文件树数据（扁平列表） */
  fileTree: { type: Array, default: () => [] },
  /** 附加目录列表 */
  attachedDirs: { type: Array, default: () => [] },
  /** 展开的附加目录 Set */
  expandedAttachedDirs: { type: Set, default: () => new Set() },
  /** 附加目录子项缓存 */
  attachedDirChildren: { type: Object, default: () => ({}) },
  /** 展开的目录 Set */
  expandedDirs: { type: Set, default: () => new Set() },
  /** 会话路径 */
  sessionPath: { type: String, default: '' },
  /** 项目路径 */
  projectPath: { type: String, default: '' },
})

defineEmits([
  'switch-mode', 'add-file', 'attach-folder', 'detach-folder',
  'toggle-dir', 'open-file', 'toggle-attached-dir', 'open-attached-file',
  'open-folder',
])

/** 路径层级 > 3 时使用左侧省略 */
const sessionPathNeedsEllipsis = computed(() => {
  if (!props.sessionPath) return false
  return props.sessionPath.replace(/\\/g, '/').split('/').filter(Boolean).length > 3
})
const projectPathNeedsEllipsis = computed(() => {
  if (!props.projectPath) return false
  return props.projectPath.replace(/\\/g, '/').split('/').filter(Boolean).length > 3
})

/** 将扁平文件列表转换为树并展平 */
const flatFileTree = computed(() => {
  const tree = buildFileTreeData(props.fileTree)
  return flattenTree(tree)
})

function buildFileTreeData(flatList) {
  const root = []
  const dirMap = new Map()
  for (const item of flatList) {
    const parts = item.path.split('/')
    const name = parts[parts.length - 1]
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
    const node = {
      name, path: item.path, isDir: item.isDir, size: item.size || 0,
      depth: parts.length - 1, expanded: props.expandedDirs.has(item.path), children: [],
    }
    if (parentPath && dirMap.has(parentPath)) {
      dirMap.get(parentPath).children.push(node)
    } else {
      root.push(node)
    }
    if (item.isDir) dirMap.set(item.path, node)
  }
  return root
}

function flattenTree(nodes, depth = 0, result = []) {
  for (const node of nodes) {
    node.depth = depth
    node.expanded = props.expandedDirs.has(node.path)
    result.push(node)
    if (node.isDir && node.expanded && node.children.length > 0) {
      flattenTree(node.children, depth + 1, result)
    }
  }
  return result
}

/** 递归展平附加目录树 */
function flattenAttachedDir(dirPath, depth = 1, attachedRoot = dirPath) {
  const children = props.attachedDirChildren[dirPath] || []
  const result = []
  for (const item of children) {
    const parts = item.path.split('/')
    const name = parts[parts.length - 1]
    const childFullPath = `${dirPath}/${item.path}`
    const rootRelativePath = childFullPath.substring(attachedRoot.length + 1)
    const isExpanded = props.expandedAttachedDirs.has(childFullPath)
    result.push({
      name, path: childFullPath, isDir: item.isDir, size: item.size || 0,
      depth, isAttached: true, attachedRoot,
      relativePath: rootRelativePath, expanded: isExpanded,
    })
    if (item.isDir && isExpanded) {
      result.push(...flattenAttachedDir(childFullPath, depth + 1, attachedRoot))
    }
  }
  return result
}

/** 从完整路径提取目录名 */
function getDirName(dirPath) {
  return dirPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || dirPath
}
</script>

<style scoped>
.direction-rtl {
  direction: rtl;
  text-align: left;
  unicode-bidi: embed;
}
</style>
