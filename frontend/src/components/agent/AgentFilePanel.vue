<template>
  <div class="flex h-full flex-col overflow-hidden bg-background" :class="borderSideClass" :style="{ width: width + 'px', flexShrink: 0 }">
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
        <span>{{ t('agentFilePanel.sessionFiles') }}</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="h-7 gap-1.5 rounded-md px-2.5 text-xs font-medium"
        :class="mode === 'project' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50'"
        @click="$emit('switch-mode', 'project')"
      >
        <Folder :size="14" />
        <span>{{ t('agentFilePanel.projectFiles') }}</span>
      </Button>
    </div>

    <!-- 文件列表 -->
    <div class="min-h-0 flex-1 overflow-y-auto">
      <!-- 会话文件模式：路径显示 -->
      <div v-if="mode === 'session' && sessionPath" class="flex items-center gap-1.5 border-b border-border/50 px-2.5 py-1.5" :title="sessionPath">
        <Folder :size="13" class="shrink-0 text-muted-foreground" />
        <span class="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" :class="{ 'direction-rtl': sessionPathNeedsEllipsis }">{{ sessionPath }}</span>
        <Button variant="ghost" size="icon" class="size-4 shrink-0 text-muted-foreground hover:text-foreground" :title="t('agentFilePanel.openInExplorer')" @click="$emit('open-folder', 'session')">
          <FolderOpen class="size-3.5" />
        </Button>
      </div>

      <!-- 项目文件模式：路径显示 -->
      <div v-if="mode === 'project' && projectPath" class="flex items-center gap-1.5 border-b border-border/50 px-2.5 py-1.5" :title="projectPath">
        <Folder :size="13" class="shrink-0 text-muted-foreground" />
        <span class="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" :class="{ 'direction-rtl': projectPathNeedsEllipsis }">{{ projectPath }}</span>
        <Button variant="ghost" size="icon" class="size-4 shrink-0 text-muted-foreground hover:text-foreground" :title="t('agentFilePanel.openInExplorer')" @click="$emit('open-folder', 'project')">
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
            @click="$emit('toggle-attached-dir', dirPath, dirPath)"
          >
            <component :is="expandedAttachedDirs.has(dirPath) ? ChevronDown : ChevronRight" class="size-2.5 text-muted-foreground" />
            <Folder :size="14" class="shrink-0 text-muted-foreground" />
            <span class="min-w-0 flex-1 truncate text-[12px] text-foreground" :title="dirPath">{{ getDirName(dirPath) }}</span>
            <span class="shrink-0 rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary">{{ t('agentFilePanel.attached') }}</span>
            <Button variant="ghost" size="icon" class="size-4 shrink-0 text-muted-foreground hover:text-destructive" :title="t('agentFilePanel.removeFolder')" @click.stop="$emit('detach-folder', dirPath)">
              <X class="size-3.5" />
            </Button>
          </div>
          <!-- 附加目录子项 -->
          <template v-if="expandedAttachedDirs.has(dirPath)">
            <div
              v-for="child in flattenAttachedDir(dirPath)"
              :key="child.path"
              class="flex cursor-pointer items-center gap-1 py-1 pr-2 transition-colors"
              :class="child.path === activeFileId ? 'bg-accent/40 text-accent-foreground' : 'hover:bg-accent/30'"
              :style="{ paddingLeft: 8 + child.depth * 16 + 'px' }"
              @click="child.isDir ? $emit('toggle-attached-dir', child.path, child.attachedRoot) : $emit('open-attached-file', dirPath, child.relativePath)"
            >
              <component v-if="child.isDir" :is="child.expanded ? ChevronDown : ChevronRight" class="size-2.5 text-muted-foreground" />
              <span v-else class="inline-block w-[10px]" />
              <!-- 文件夹：Folder 图标 + 文件名 + 变更圆点（后置） -->
              <template v-if="child.isDir">
                <Folder :size="14" class="shrink-0 text-muted-foreground" />
                <span class="min-w-0 flex-1 truncate text-[12px]" :class="[
                  child.path === activeFileId ? 'text-accent-foreground font-medium' : '',
                  child.gitStatus === 'untracked' || child.gitStatus === 'added' ? 'text-red-500' : child.gitStatus === 'modified' ? 'text-green-500' : 'text-foreground'
               ]">{{ child.name }}</span>
                <span v-if="child.gitStatus === 'untracked' || child.gitStatus === 'added'" class="size-1.5 shrink-0 rounded-full bg-red-500" />
                <span v-else-if="child.gitStatus === 'modified'" class="size-1.5 shrink-0 rounded-full bg-green-500" />
              </template>
              <!-- 文件：FileText 图标 + 文件名 + A/M 标记（后置） -->
              <template v-else>
                <FileText :size="14" class="shrink-0" :class="child.path === activeFileId ? 'text-accent-foreground' : 'text-muted-foreground'" />
                <span class="min-w-0 flex-1 truncate text-[12px]" :class="[
                  child.path === activeFileId ? 'text-accent-foreground font-medium' : '',
                  child.gitStatus === 'untracked' || child.gitStatus === 'added' ? 'text-red-500' : child.gitStatus === 'modified' ? 'text-green-500' : 'text-foreground'
               ]">{{ child.name }}</span>
                <span v-if="child.gitStatus === 'untracked' || child.gitStatus === 'added'" class="shrink-0 text-[10px] font-bold text-red-500">A</span>
                <span v-else-if="child.gitStatus === 'modified'" class="shrink-0 text-[10px] font-bold text-green-500">M</span>
              </template>
            </div>
          </template>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="flatFileTree.length === 0 && attachedDirs.length === 0" class="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <Folder :size="32" class="opacity-40" />
        <p class="text-xs">{{ mode === 'project' ? t('agentFilePanel.noProjectFiles') : t('agentFilePanel.noSessionFiles') }}</p>
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
        <span>{{ mode === 'session' ? t('agentFilePanel.addFileToSession') : t('agentFilePanel.addFile') }}</span>
      </Button>
      <!-- 附加文件夹（仅项目模式） -->
      <Button
        v-if="mode === 'project'"
        variant="outline"
        class="flex-1 gap-1.5 rounded-md border-dashed border-border py-2 text-xs text-muted-foreground hover:border-primary/50 hover:text-primary"
        @click="$emit('attach-folder')"
      >
        <FolderPlus class="size-3.5" />
        <span>{{ t('agentFilePanel.attachFolder') }}</span>
      </Button>
      <!-- 刷新 Git 状态（仅项目模式且有附加文件夹时显示） -->
      <Button
        v-if="mode === 'project' && attachedDirs.length > 0"
        variant="ghost"
        size="icon"
        class="shrink-0 size-8 text-muted-foreground hover:text-primary"
        :title="t('agentFilePanel.refreshGitStatus')"
        @click="$emit('refresh-git-status')"
      >
        <RefreshCw class="size-3.5" />
      </Button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Folder, File, ChevronDown, ChevronRight, FolderOpen, FileText, X, Paperclip, FolderPlus, RefreshCw } from '@lucide/vue'
import { Button } from '@/components/ui/button'

const { t } = useI18n()

const props = defineProps({
  /** 面板宽度 */
  width: { type: Number, default: 300 },
  /** 面板模式 */
  mode: { type: String, default: 'session' },
  /** 边框方向：'left'（文件面板在右侧，左边框）或 'right'（文件面板在左侧，右边框） */
  borderSide: { type: String, default: 'left' },
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
  /** 代码编辑器中当前活跃文件 ID（用于高亮联动） */
  activeFileId: { type: String, default: null },
})

defineEmits([
  'switch-mode', 'add-file', 'attach-folder', 'detach-folder',
  'toggle-dir', 'open-file', 'toggle-attached-dir', 'open-attached-file',
  'open-folder', 'refresh-git-status',
])

/** 根据面板位置计算边框 class */
const borderSideClass = computed(() =>
  props.borderSide === 'right' ? 'border-r border-border' : 'border-l border-border',
)

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
      gitStatus: item.gitStatus || null,
    })
    if (item.isDir && isExpanded) {
      result.push(...flattenAttachedDir(childFullPath, depth + 1, attachedRoot))
    }
  }
  return result
}

/**
 * 获取文件夹的 git 状态（通过递归检查子文件是否有变更）
 * 返回 'added'（新增/未跟踪）、'modified'（修改）、或 null（无变更）
 */
function getDirGitStatus(dirFullPath, attachedRoot) {
  // 检查该目录的直接子项中是否有 git 状态
  const children = props.attachedDirChildren[dirFullPath] || []
  let hasAdded = false
  let hasModified = false

  for (const child of children) {
    if (child.gitStatus === 'untracked' || child.gitStatus === 'added') {
      hasAdded = true
    } else if (child.gitStatus === 'modified') {
      hasModified = true
    }
  }

  // 如果直接子项有状态，优先返回
  if (hasAdded) return 'added'
  if (hasModified) return 'modified'

  // 如果直接子项无状态，递归检查子目录
  // 通过 expandedAttachedDirs 检查已展开的子目录
  for (const child of children) {
    if (child.isDir) {
      const subDirPath = `${dirFullPath}/${child.path}`
      // 递归检查子目录（如果已加载）
      const subChildren = props.attachedDirChildren[subDirPath]
      if (subChildren) {
        const subStatus = getDirGitStatus(subDirPath, attachedRoot)
        if (subStatus === 'added') return 'added'
        if (subStatus === 'modified') return 'modified'
      }
    }
  }

  return null
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
