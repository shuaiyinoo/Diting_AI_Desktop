<template>
  <div class="flex h-full w-full overflow-hidden bg-layout" ref="workspaceRef">
    <!-- ========== 第二部分：文件树区 ========== -->
    <div class="flex flex-col h-full overflow-hidden bg-panel" :style="{ width: panel2Width + 'px', flexShrink: 0 }">
      <!-- 顶部：文件夹名 + 操作 -->
      <div class="flex h-10 shrink-0 items-center gap-1.5 border-b border-border px-2">
        <Folder class="size-3.5 shrink-0 text-app-muted" />
        <!-- 协议缩写标签 -->
        <span
          v-if="ws.selectedFolder"
          class="flex h-[18px] w-[30px] shrink-0 items-center justify-center rounded-[4px] text-[9px] font-bold leading-none tracking-wide"
          :class="getProtocolBadgeClass(ws.selectedFolder.protocol || 'local')"
          :title="getProtocolLabel(ws.selectedFolder.protocol || 'local')"
        >
          {{ getProtocolBadge(ws.selectedFolder.protocol || 'local') }}
        </span>
        <span v-if="ws.selectedFolder" class="min-w-0 flex-1 truncate text-[13px] font-medium text-app-primary" :title="ws.selectedFolder.folder_name || ws.selectedFolder.path">
          {{ ws.selectedFolder.folder_name || ws.selectedFolder.path }}
        </span>
        <span v-else class="flex-1 text-[13px] font-normal text-app-muted">{{ t('fileModule.fileList') }}</span>
        <div class="ml-auto flex items-center gap-1">
          <!-- RAG 向量化状态标签 -->
          <Badge v-if="ragProcessing || ragQueueSize > 0" variant="secondary" class="inline-flex items-center gap-1 text-[11px]">
            <Loader2 v-if="ragProcessing" class="size-3.5 animate-spin" />
            {{ ragProcessing ? t('fileModule.ragProcessing', { count: ragQueueSize }) : t('fileModule.ragQueue', { count: ragQueueSize }) }}
          </Badge>
          <Tooltip side="bottom">
            <TooltipTrigger as-child>
              <button
                class="inline-flex size-7 items-center justify-center rounded-md text-app-secondary transition-colors hover:bg-hover hover:text-app-primary disabled:opacity-50"
                :disabled="treeLoading"
                @click="onRefreshTree"
              >
                <RefreshCw class="size-3.5" :class="{ 'animate-spin': treeLoading }" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{{ t('fileModule.refresh') }}</TooltipContent>
          </Tooltip>
          <!-- 新建文件 Popover（仅本地文件夹显示） -->
          <Popover v-if="isLocalFolder" v-model:open="createPopoverVisible">
            <PopoverTrigger as-child>
              <button
                class="inline-flex size-7 items-center justify-center rounded-md text-app-secondary transition-colors hover:bg-hover hover:text-app-primary"
                :title="t('fileModule.newFile')"
              >
                <Plus class="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" side="bottom" class="w-56 p-1">
              <div class="flex flex-col gap-0.5">
                <!-- 创建 Markdown 文件 -->
                <button
                  class="flex items-center gap-2 rounded px-2 py-1.5 text-[13px] text-app-primary transition-colors hover:bg-hover"
                  @click="onCreateMarkdownFile"
                >
                  <FileCode class="size-4 text-[#6c757d]" />
                  <span>{{ t('fileModule.createMarkdown') }}</span>
                </button>
                <!-- 分析链接 -->
                <button
                  class="flex items-center gap-2 rounded px-2 py-1.5 text-[13px] text-app-primary transition-colors hover:bg-hover"
                  @click="onOpenLinkDialog"
                >
                  <Link class="size-4 text-primary" />
                  <span>{{ t('fileModule.analyzeLink') }}</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <!-- 文件树 -->
      <div class="min-h-0 flex-1 overflow-y-auto py-1" v-loading="treeLoading">
        <!-- 空状态 -->
        <div v-if="!ws.selectedFolderId" class="flex min-h-[200px] items-center justify-center">
          <div class="flex flex-col items-center gap-2 text-app-muted">
            <FolderOpen class="size-10 opacity-40" />
            <span class="text-sm">{{ t('fileModule.selectFolderFirst') }}</span>
          </div>
        </div>
        <div v-else-if="!treeLoading && flatTree.length === 0" class="flex min-h-[200px] items-center justify-center">
          <div class="flex flex-col items-center gap-2 text-app-muted">
            <Inbox class="size-10 opacity-40" />
            <span class="text-sm">{{ t('fileModule.noFilesInFolder') }}</span>
          </div>
        </div>
        <!-- 树形列表 -->
        <div v-else>
          <div
            v-for="node in flatTree"
            :key="node.key"
            class="flex cursor-pointer items-start gap-1 py-1 pr-2 transition-colors"
            :class="node.isFile && ws.selectedFileId === node.id ? 'bg-accent/40' : 'hover:bg-accent/30'"
            :style="{ paddingLeft: 8 + node.depth * 16 + 'px' }"
            @click="onTreeNodeClick(node)"
          >
            <!-- 展开箭头 -->
            <component
              v-if="node.isDir"
              :is="node.expanded ? ChevronDown : ChevronRight"
              class="size-2.5 shrink-0 text-muted-foreground mt-[2px]"
            />
            <span v-else class="inline-block w-[10px] shrink-0" />

            <!-- 文件夹/文件图标 -->
            <component
              :is="node.isDir ? Folder : FileText"
              :size="14"
              class="shrink-0 mt-[1px]"
              :class="[
                node.isFile && !node.supported ? 'text-muted-foreground/40' :
                node.isFile && ws.selectedFileId === node.id ? 'text-primary' : 'text-muted-foreground'
              ]"
            />

            <!-- 右侧内容区：文件两行，文件夹单行 -->
            <div class="min-w-0 flex-1">
              <!-- 第一行：名称 + 状态标签 -->
              <div class="flex items-center gap-1">
                <span
                  class="min-w-0 flex-1 truncate text-[12px]"
                  :class="[
                    node.isFile && !node.supported ? 'text-muted-foreground/40' :
                    node.isFile && ws.selectedFileId === node.id ? 'text-primary font-medium' : 'text-foreground'
                  ]"
                >
                  {{ node.name }}
                </span>
                <!-- 文件状态标签：不支持的文件不显示 -->
                <span
                  v-if="node.isFile && node.supported && node.statusText"
                  class="shrink-0 rounded px-1 text-[9px] font-medium leading-tight"
                  :class="node.statusClass"
                >
                  {{ node.statusText }}
                </span>
              </div>
              <!-- 第二行：时间 + 大小（仅文件） -->
              <div
                v-if="node.isFile"
                class="mt-[1px] flex items-center gap-1.5 text-[10px] text-muted-foreground"
                :class="!node.supported ? 'opacity-40' : ''"
              >
                <span>{{ node.formattedTime }}</span>
                <span class="text-muted-foreground/40">·</span>
                <span>{{ node.formattedSize }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 分隔条 2 -->
    <PanelDivider @resize="onPanel2Resize" />

    <!-- ========== 第三部分：文件预览区 ========== -->
    <div class="flex flex-1 min-w-[200px] flex-col h-full overflow-hidden">
      <FilePreviewPanel
        :file="ws.selectedFile"
        :panel4-collapsed="panel4Collapsed"
        @toggle-panel4="togglePanel4"
      />
    </div>

    <!-- ========== 第四部分：文件属性 ========== -->
    <template v-if="!panel4Collapsed">
      <PanelDivider @resize="onPanel4Resize" />
      <div class="flex flex-col h-full overflow-hidden bg-panel min-w-[240px]" :style="{ width: panel4Width + 'px', flexShrink: 0 }">
        <FileInfoPanel :file="ws.selectedFile" :status-tag="selectedFileStatusTag" />
      </div>
    </template>

    <!-- 分析链接弹窗 -->
    <Dialog v-model:open="linkDialogVisible">
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t('fileModule.analyzeLinkTitle') }}</DialogTitle>
          <DialogDescription>{{ t('fileModule.analyzeLinkDesc') }}</DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-3 py-2">
          <Input
            v-model="linkUrl"
            :placeholder="t('fileModule.linkUrlPlaceholder')"
            class="text-sm"
            @keyup.enter="onAnalyzeLink"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" @click="linkDialogVisible = false">{{ t('fileModule.cancel') }}</Button>
          <Button :disabled="!linkUrl.trim() || analyzingLink" @click="onAnalyzeLink">
            <Loader2 v-if="analyzingLink" class="size-4 mr-1 animate-spin" />
            {{ t('fileModule.analyzeAndOrganize') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import {
  FileCode, FileText, FolderOpen, Inbox, Loader2, Plus, RefreshCw,
  ChevronDown, ChevronRight, Folder, Link,
} from '@lucide/vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/sonner'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAgentStore } from '@/stores/agent'
import FilePreviewPanel from '@/components/file/FilePreviewPanel.vue'
import FileInfoPanel from '@/components/file/FileInfoPanel.vue'
import PanelDivider from '@/components/layout/PanelDivider.vue'

const { t } = useI18n()
const toast = useToast()
const ws = useWorkspaceStore()
const agentStore = useAgentStore()
const { selectedFolderId: wsSelectedFolderId, selectedFolder: wsSelectedFolder, selectedFile: wsSelectedFile, selectedFileId: wsSelectedFileId } = storeToRefs(ws)

// ========== 本地文件夹判断 ==========
const isLocalFolder = computed(() => {
  if (!wsSelectedFolder.value) return false
  return (wsSelectedFolder.value.protocol || 'local') === 'local'
})

// ========== 面板宽度 & 折叠状态 ==========
const workspaceRef = ref(null)
const panel2Width = ref(300)
const panel4Width = ref(300)
const panel4Collapsed = ref(true)

function togglePanel4() {
  panel4Collapsed.value = !panel4Collapsed.value
}

function onPanel2Resize(delta) {
  panel2Width.value = Math.max(200, panel2Width.value + delta)
}

function onPanel4Resize(delta) {
  panel4Width.value = Math.min(400, Math.max(240, panel4Width.value - delta))
}

// ========== 文件树 ==========
const treeLoading = ref(false)
/** 展开的目录 Set（key = dirId） */
const expandedDirs = ref(new Set())
/** 目录下的文件缓存：dirId → FileItem[] */
const dirFileCache = reactive({})
/** 根节点目录树（来自 getSubFolders） */
const rootTree = ref([])

// ========== 新建文件 ==========
const createPopoverVisible = ref(false)
const creatingFile = ref(false)

// ========== 分析链接 ==========
const linkDialogVisible = ref(false)
const linkUrl = ref('')
const analyzingLink = ref(false)

const selectedFileStatusTag = computed(() => {
  if (!ws.selectedFile) return { color: 'default', text: '-' }
  return getStatusTag(ws.selectedFile.status, ws.selectedFile.name)
})

// 支持向量化的文件扩展名
const SUPPORTED_EXTENSIONS = [
  // Office Documents
  '.pdf', '.docx', '.docm', '.dotx', '.dotm', '.dot', '.odt',
  '.xlsx', '.xlsm', '.xlsb', '.xls', '.xla', '.xlam', '.xltm', '.xltx', '.xlt', '.ods',
  '.pptx', '.pptm', '.ppsx', '.potx', '.potm', '.pot', '.ppt',
  '.epub', '.fb2', '.dbf', '.hwp', '.hwpx',
  // Images (OCR)
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.svg',
  // Web & Data
  '.html', '.htm', '.xhtml', '.xml', '.json', '.yaml', '.yml', '.toml', '.csv', '.tsv',
  // Text & Markdown
  '.txt', '.md', '.markdown', '.djot', '.rst', '.org', '.rtf',
]
const IGNORE_FILENAMES = ['.ds_store', 'thumbs.db']

function isFileSupported(fileName) {
  const lower = fileName.toLowerCase()
  const baseName = lower.split('/').pop() || lower
  if (IGNORE_FILENAMES.includes(baseName)) return false
  const ext = '.' + (fileName.split('.').pop() || '').toLowerCase()
  return SUPPORTED_EXTENSIONS.includes(ext)
}

function getStatusTag(status, fileName) {
  if (!isFileSupported(fileName)) {
    return { color: 'default', text: t('fileModule.status.unsupported'), title: t('fileModule.status.unsupportedTitle') }
  }
  const map = {
    PENDING: { color: 'orange', text: t('fileModule.status.pending') },
    PROCESSING: { color: 'blue', text: t('fileModule.status.processing') },
    READY: { color: 'green', text: t('fileModule.status.ready') },
    FAILED: { color: 'red', text: t('fileModule.status.failed') },
  }
  return map[status] || { color: 'default', text: status || t('fileModule.status.unknown') }
}

function getStatusBadgeClass(status, fileName) {
  if (!isFileSupported(fileName)) {
    return 'bg-muted text-muted-foreground'
  }
  const map = {
    PENDING: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
    PROCESSING: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    READY: 'bg-green-500/15 text-green-600 dark:text-green-400',
    FAILED: 'bg-red-500/15 text-red-600 dark:text-red-400',
  }
  return map[status] || 'bg-muted text-muted-foreground'
}

async function generateUniqueFileName(baseName, ext) {
  let name = `${baseName}.${ext}`
  let counter = 1
  // 从所有缓存的文件中检查重名
  const existingNames = new Set()
  for (const files of Object.values(dirFileCache)) {
    for (const f of files) {
      existingNames.add(f.name)
    }
  }
  while (existingNames.has(name)) {
    name = `${baseName}${counter}.${ext}`
    counter++
  }
  return name
}

// ========== 扁平化树 ==========
/**
 * 将 rootTree（目录树）+ dirFileCache（目录下文件）展平为列表
 * 仿 AgentFilePanel 的 flattenTree 模式
 */
const flatTree = computed(() => {
  const result = []
  for (const rootNode of rootTree.value) {
    flattenNode(rootNode, 0, result)
  }
  return result
})

function flattenNode(node, depth, result) {
  result.push({
    key: `dir-${node.id}`,
    id: node.id,
    name: node.name,
    isDir: true,
    isFile: false,
    depth,
    expanded: expandedDirs.value.has(node.id),
    status: null,
  })

  if (expandedDirs.value.has(node.id)) {
    // 先显示子目录
    if (node.children) {
      for (const child of node.children) {
        flattenNode(child, depth + 1, result)
      }
    }
    // 再显示文件
    const files = dirFileCache[node.id] || []
    for (const file of files) {
      const supported = isFileSupported(file.name)
      const tag = supported ? getStatusTag(file.status, file.name) : null
      result.push({
        key: `file-${file.id}`,
        id: file.id,
        name: file.name,
        isDir: false,
        isFile: true,
        depth: depth + 1,
        expanded: false,
        status: file.status,
        supported,
        statusText: tag?.text || '',
        statusClass: tag ? getStatusBadgeClass(file.status, file.name) : '',
        size: file.size || 0,
        mtime: file.mtime || '',
        formattedSize: formatFileSize(file.size),
        formattedTime: formatDateTime(file.mtime),
      })
    }
  }
}

// ========== 树操作 ==========
function onTreeNodeClick(node) {
  if (node.isDir) {
    toggleDir(node.id)
  } else {
    onSelectFile(node)
  }
}

function toggleDir(dirId) {
  if (expandedDirs.value.has(dirId)) {
    expandedDirs.value.delete(dirId)
  } else {
    expandedDirs.value.add(dirId)
    // 懒加载：首次展开时加载该目录下的文件
    if (!dirFileCache[dirId]) {
      loadDirFiles(dirId)
    }
  }
  expandedDirs.value = new Set(expandedDirs.value)
}

async function loadDirFiles(dirId) {
  if (!wsSelectedFolder.value) return
  try {
    const data = await ipc.invoke(ipcApiRoute.file.getFiles, {
      folderId: wsSelectedFolder.value.id,
      itemId: dirId,
    })
    dirFileCache[dirId] = data || []
  } catch (err) {
    console.error('[file] 加载目录文件失败:', err)
    dirFileCache[dirId] = []
  }
}

function onSelectFile(node) {
  // 从 dirFileCache 中找到完整的 file 对象
  const files = dirFileCache[node.id] || []
  const file = files.find(f => f.id === node.id)
  if (file) {
    ws.selectFile(file)
  } else {
    // 如果缓存中没有，可能是从别处来的，构造一个最小对象
    ws.selectFile({ id: node.id, name: node.name, status: node.status })
  }
}

/** 刷新当前文件夹：远程文件夹重新从服务器获取最新结构，本地文件夹重新扫描 */
async function onRefreshTree() {
  if (!wsSelectedFolderId.value || !wsSelectedFolder.value) return

  const folder = wsSelectedFolder.value
  const isRemote = (folder.protocol || 'local') !== 'local'

  treeLoading.value = true
  try {
    // 调用后端重新扫描（远程会从服务器拉取最新文件结构）
    await ipc.invoke(ipcApiRoute.file.refreshFolder, { folderId: folder.id })
    // 清空缓存重新加载文件树
    for (const key of Object.keys(dirFileCache)) {
      delete dirFileCache[key]
    }
    expandedDirs.value = new Set()
    await loadTree(wsSelectedFolderId.value)
  } catch (err) {
    console.error('[file] 刷新文件夹失败:', err)
    toast.error(t('fileModule.refreshFailed'))
  } finally {
    treeLoading.value = false
  }
}

// ========== 监听文件夹切换 ==========
watch(wsSelectedFolderId, (folderId) => {
  // 清空状态
  for (const key of Object.keys(dirFileCache)) {
    delete dirFileCache[key]
  }
  expandedDirs.value = new Set()
  rootTree.value = []
  ws.selectFile(null)
  if (folderId) {
    loadTree(folderId)
  }
})

// ========== 页面初始化 ==========
onMounted(() => {
  if (ws.selectedFolderId) {
    loadTree(ws.selectedFolderId)
  }
  registerSyncChange()
  registerRagProgressListener()
  registerRemoteScanDone()
})

onUnmounted(() => {
  ipc.removeAllListeners(ipcApiRoute.file.onSyncChange)
  ipc.removeAllListeners(ipcApiRoute.file.onRagProgress)
  ipc.removeAllListeners(ipcApiRoute.file.onRemoteScanDone)
})

function registerSyncChange() {
  ipc.invoke(ipcApiRoute.file.registerSyncCallback).catch(() => {})
  ipc.on(ipcApiRoute.file.onSyncChange, (_event, result) => {
    const { folderId } = result
    if (ws.selectedFolderId === folderId) {
      // 刷新：清空缓存重新加载
      for (const key of Object.keys(dirFileCache)) {
        delete dirFileCache[key]
      }
      loadTree(folderId)
    }
  })
}

/** 监听远程扫描完成事件，自动刷新文件树 */
function registerRemoteScanDone() {
  ipc.on(ipcApiRoute.file.onRemoteScanDone, (_event, result) => {
    const { folderId, success } = result
    if (ws.selectedFolderId === folderId && success) {
      // 清空缓存重新加载
      for (const key of Object.keys(dirFileCache)) {
        delete dirFileCache[key]
      }
      expandedDirs.value = new Set()
      loadTree(folderId)
    }
  })
}

async function loadTree(folderId) {
  treeLoading.value = true
  try {
    const data = await ipc.invoke(ipcApiRoute.file.getSubFolders, { folderId })
    rootTree.value = data || []
    // 自动展开根节点
    if (rootTree.value.length > 0) {
      const rootNode = rootTree.value[0]
      expandedDirs.value.add(rootNode.id)
      // 懒加载根节点下的文件
      await loadDirFiles(rootNode.id)
      // 也加载根节点下子目录的文件（如果子目录已展开）
      expandedDirs.value = new Set(expandedDirs.value)
    }
  } catch (err) {
    console.error('[file] 加载文件夹树失败:', err)
    toast.error(t('fileModule.loadSubFolderFailed'))
  } finally {
    treeLoading.value = false
  }
}

function registerRagProgressListener() {
  ipc.on(ipcApiRoute.file.onRagProgress, (_event, data) => {
    const { type, queueSize, status } = data
    ragQueueSize.value = queueSize || 0
    ragProcessing.value = type !== 'idle'
    // RAG 状态变化时刷新当前展开目录的文件
    if (type === 'ingest' && (status === 'READY' || status === 'FAILED' || status === 'PROCESSING')) {
      refreshOpenDirs()
    } else if (type === 'delete' || type === 'idle') {
      refreshOpenDirs()
    }
  })
}

/** 刷新所有已展开目录的文件列表 */
async function refreshOpenDirs() {
  const dirIds = Object.keys(dirFileCache).map(Number)
  for (const dirId of dirIds) {
    await loadDirFiles(dirId)
  }
}

// ========== RAG 向量化 ==========
const ragQueueSize = ref(0)
const ragProcessing = ref(false)

// ========== 新建 Markdown 文件 ==========
async function onCreateMarkdownFile() {
  createPopoverVisible.value = false
  if (!ws.selectedFolder) {
    toast.warning(t('fileModule.selectFolder'))
    return
  }
  if (creatingFile.value) return
  creatingFile.value = true

  const baseName = t('fileModule.newDoc')
  const fileName = await generateUniqueFileName(baseName, 'md')

  // 找到根节点作为父目录
  let parentId = 0
  if (rootTree.value.length > 0) {
    parentId = rootTree.value[0].id
  }

  try {
    const result = await ipc.invoke(ipcApiRoute.file.createFile, {
      folderId: ws.selectedFolder.id,
      parentId,
      fileName,
    })
    if (result.success && result.fileItem) {
      toast.success(t('fileModule.created', { name: fileName }))
      // 刷新该目录的文件列表
      await loadDirFiles(parentId)
      // 选中并打开新创建的文件
      onSelectFile(result.fileItem)
    } else {
      toast.error(result.message || t('fileModule.createFailed'))
    }
  } catch (err) {
    console.error('[file] 创建文件失败:', err)
    toast.error(t('fileModule.createFailed'))
  } finally {
    creatingFile.value = false
  }
}

// ========== 分析链接 ==========
function onOpenLinkDialog() {
  createPopoverVisible.value = false
  linkUrl.value = ''
  linkDialogVisible.value = true
}

async function onAnalyzeLink() {
  const url = linkUrl.value.trim()
  if (!url || analyzingLink.value) return
  if (!ws.selectedFolder) {
    toast.warning(t('fileModule.selectFolder'))
    return
  }

  analyzingLink.value = true
  try {
    const folderPath = ws.selectedFolder.path

    // 查找或创建名为"链接整理"的项目
    if (ws.agentProjects.length === 0) {
      await ws.loadAgentProjects()
    }
    let project = ws.agentProjects.find((p) => p.name === '链接整理')
    if (!project) {
      // 创建项目
      const res = await ipc.invoke(ipcApiRoute.piAgent.workspaceOperation, {
        action: 'create',
        name: '链接整理',
      })
      if (res.code === 0 && res.data) {
        ws.agentProjects.unshift(res.data)
        project = res.data
      }
    }
    if (!project) {
      toast.error(t('fileModule.createProjectFailed'))
      return
    }
    ws.selectAgentProject(project.id)

    // 加载会话列表
    await agentStore.loadSessions()

    // 查找或创建名为“分析链接”的会话
    let session = agentStore.sessions.find((s) => {
      const wid = s.workspaceId || s.workspace_id || s.projectId || ''
      return String(wid) === String(project.id) && (s.title || '') === '分析链接'
    })
    if (!session) {
      const createRes = await ipc.invoke(ipcApiRoute.piAgent.sessionOperation, {
        action: 'create',
        title: '分析链接',
        workspaceId: project.id,
      })
      if (createRes.code === 0 && createRes.data) {
        agentStore.sessions.unshift(createRes.data)
        session = createRes.data
      }
    }
    if (!session) {
      toast.error(t('fileModule.createSessionFailed'))
      return
    }

    // 构造提示词
    const prompt = `请分析指定的链接 ${url} 并详细整理成 md 文档保存在 ${folderPath} 文件夹中`

    // 设置 pendingPrompt，在 AgentView onMounted 时自动发送
    agentStore.pendingPrompt = { sessionId: session.id, message: prompt }

    // 切换到 Agent 会话
    await agentStore.selectSession(session.id)
    ws.setActiveModule('agent')
    ws.setAppMode('agent')

    // 关闭弹窗
    linkDialogVisible.value = false
    toast.success(t('fileModule.analyzeLinkStarted'))
  } catch (err) {
    console.error('[file] 分析链接失败:', err)
    toast.error(t('fileModule.analyzeLinkFailed'))
  } finally {
    analyzingLink.value = false
  }
}

// ========== 协议标签辅助函数 ==========

/** 协议 → 缩写标签文本 */
function getProtocolBadge(protocol) {
  const map = {
    local: 'LOC',
    ftp: 'FTP',
    ftps: 'FTPS',
    sftp: 'SFTP',
    smb: 'SMB',
    webdav: 'DAV',
    s3: 'S3',
  }
  return map[protocol] || 'LOC'
}

/** 协议 → 完整标签（tooltip 用） */
function getProtocolLabel(protocol) {
  const map = {
    local: t('addFolder.protocols.local'),
    ftp: t('addFolder.protocols.ftp'),
    ftps: t('addFolder.protocols.ftps'),
    sftp: t('addFolder.protocols.sftp'),
    smb: t('addFolder.protocols.smb'),
    webdav: t('addFolder.protocols.webdav'),
    s3: t('addFolder.protocols.s3'),
  }
  return map[protocol] || t('addFolder.protocols.local')
}

/** 协议 → 标签样式类 */
function getProtocolBadgeClass(protocol) {
  const map = {
    local: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    ftp: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
    ftps: 'bg-teal-500/15 text-teal-600 dark:text-teal-400',
    sftp: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    smb: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    webdav: 'bg-pink-500/15 text-pink-600 dark:text-pink-400',
    s3: 'bg-green-500/15 text-green-600 dark:text-green-400',
  }
  return map[protocol] || map.local
}

// ========== 格式化工具 ==========
function formatDateTime(isoStr) {
  if (!isoStr) return '-'
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return isoStr
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let size = bytes
  let i = 0
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  // 小于 1KB 时显示整数，否则保留 1 位小数
  if (i === 0) return `${size} ${units[i]}`
  return `${size.toFixed(1)} ${units[i]}`
}
</script>
