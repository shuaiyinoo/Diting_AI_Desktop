<template>
  <div class="flex h-full w-full overflow-hidden bg-layout" ref="workspaceRef">
    <!-- ========== 第二部分：文件列表区 ========== -->
    <div class="flex flex-col h-full overflow-hidden bg-panel" :style="{ width: panel2Width + 'px', flexShrink: 0 }">
      <div class="flex h-10 shrink-0 items-center gap-1.5 border-b border-border px-2">
        <span
          v-if="selectedSubFolder"
          class="max-w-[200px] truncate text-[13px] font-medium text-app-primary"
          :title="selectedSubFolder.relative_path"
        >
          {{ selectedSubFolder.name }}
        </span>
        <span v-else class="text-[13px] font-normal text-app-muted">{{ t('fileModule.fileList') }}</span>
        <div class="ml-auto flex items-center gap-1">
          <!-- RAG 向量化状态标签 -->
          <Badge v-if="ragProcessing || ragQueueSize > 0" variant="secondary" class="inline-flex items-center gap-1 text-[11px]">
            <Loader2 v-if="ragProcessing" class="size-3.5 animate-spin" />
            {{ ragProcessing ? t('fileModule.ragProcessing', { count: ragQueueSize }) : t('fileModule.ragQueue', { count: ragQueueSize }) }}
          </Badge>
          <Tooltip side="bottom">
            <TooltipTrigger as-child>
              <button
                class="inline-flex size-7 items-center justify-center rounded-md text-app-secondary transition-colors hover:bg-hover hover:text-app-primary"
                @click="onRefreshFiles"
              >
                <RefreshCw class="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{{ t('fileModule.refresh') }}</TooltipContent>
          </Tooltip>
          <!-- 新建文件 Popover -->
          <Popover v-model:open="createPopoverVisible">
            <PopoverTrigger as-child>
              <Tooltip side="bottom">
                <TooltipTrigger as-child>
                  <button
                    class="inline-flex size-7 items-center justify-center rounded-md text-app-secondary transition-colors hover:bg-hover hover:text-app-primary"
                  >
                    <Plus class="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{{ t('fileModule.newFile') }}</TooltipContent>
              </Tooltip>
            </PopoverTrigger>
            <PopoverContent align="end" side="bottom" class="w-36 p-1">
              <div class="flex flex-col gap-0.5">
                <button
                  class="flex items-center gap-2 rounded px-2 py-1.5 text-[13px] text-app-primary transition-colors hover:bg-hover"
                  @click="onCreateFile('docx')"
                >
                  <FileText class="size-4 text-[#2b579a]" />
                  <span>{{ t('fileModule.doc') }}</span>
                </button>
                <button
                  class="flex items-center gap-2 rounded px-2 py-1.5 text-[13px] text-app-primary transition-colors hover:bg-hover"
                  @click="onCreateFile('xlsx')"
                >
                  <Sheet class="size-4 text-[#217346]" />
                  <span>{{ t('fileModule.sheet') }}</span>
                </button>
                <button
                  class="flex items-center gap-2 rounded px-2 py-1.5 text-[13px] text-app-primary transition-colors hover:bg-hover"
                  @click="onCreateFile('md')"
                >
                  <FileCode class="size-4 text-[#6c757d]" />
                  <span>MD</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto px-1.5 py-1">
        <div v-if="!selectedSubFolder" class="flex min-h-[200px] items-center justify-center">
          <div class="flex flex-col items-center gap-2 text-app-muted">
            <FolderOpen class="size-10 opacity-40" />
            <span class="text-sm">{{ fileEmptyText }}</span>
          </div>
        </div>
        <div v-else class="flex flex-col gap-0.5" v-loading="fileLoading">
          <div
            v-for="file in fileList"
            :key="file.id"
            class="flex cursor-pointer rounded p-2 transition-colors hover:bg-hover"
            :class="{
              'bg-active border-l-2 border-accent-app pl-[7px]': ws.selectedFileId === file.id,
            }"
            @click="onSelectFile(file)"
          >
            <div class="min-w-0 flex-1">
              <div class="line-clamp-2 break-all text-[13px] font-medium leading-tight text-foreground" :title="file.name">
                {{ file.name }}
              </div>
              <div class="mt-1 truncate text-[11px] text-app-muted">
                {{ formatFileSize(file.size) }} · {{ formatDateTime(file.mtime) }}
              </div>
            </div>
          </div>
          <div v-if="!fileLoading && fileList.length === 0" class="flex min-h-[200px] items-center justify-center">
            <div class="flex flex-col items-center gap-2 text-app-muted">
              <Inbox class="size-10 opacity-40" />
              <span class="text-sm">{{ t('fileModule.noFilesInFolder') }}</span>
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { FileCode, FileText, FolderOpen, Inbox, Loader2, Plus, RefreshCw, Sheet } from '@lucide/vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/sonner'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'
import { useWorkspaceStore } from '@/stores/workspace'
import FilePreviewPanel from '@/components/file/FilePreviewPanel.vue'
import FileInfoPanel from '@/components/file/FileInfoPanel.vue'
import PanelDivider from '@/components/layout/PanelDivider.vue'

const { t } = useI18n()
const toast = useToast()
const ws = useWorkspaceStore()
// 使用 storeToRefs 确保 store 的 ref/computed 在 HMR 后仍保持响应式
const { selectedFolderId: wsSelectedFolderId, selectedFolder: wsSelectedFolder, selectedFile: wsSelectedFile, selectedFileId: wsSelectedFileId } = storeToRefs(ws)

// ========== 面板宽度 & 折叠状态 ==========
const workspaceRef = ref(null)
const panel2Width = ref(280)
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

// ========== 子文件夹树 ==========
const subFolderTree = ref([])
const subFolderLoading = ref(false)
const selectedSubFolder = ref(null)

// ========== 文件列表 ==========
const fileList = ref([])
const fileLoading = ref(false)

const selectedFileStatusTag = computed(() => {
  if (!ws.selectedFile) return { color: 'default', text: '-' }
  return getStatusTag(ws.selectedFile.status, ws.selectedFile.name)
})

const fileEmptyText = computed(() => {
  if (!wsSelectedFolderId.value) return t('fileModule.selectFolderFirst')
  return t('fileModule.selectSubFolder')
})

// 支持向量化的文件扩展名
const SUPPORTED_EXTENSIONS = [
  '.pdf','.docx','.docm','.dotx','.dotm','.dot','.odt','.xlsx','.xlsm','.xlsb','.xls','.xla',
  '.xlam','.xltm','.xltx','.xlt','.ods','.pptx','.pptm','.ppsx','.potx','.potm','.pot','.ppt',
  '.epub','.fb2','.dbf','.hwp','.hwpx','.png','.jpg','.jpeg','.gif','.webp','.bmp','.tiff','.tif',
  '.svg','.html','.htm','.xhtml','.xml','.json','.yaml','.yml','.toml','.csv','.tsv','.txt','.md',
  '.markdown','.djot','.rst','.org','.rtf','.eml','.msg','.zip','.tar','.tgz','.gz','.7z','.bib',
  '.biblatex','.ris','.nbib','.enw','.csl','.tex','.latex','.typst','.jats','.ipynb','.docbook',
  '.opml','.pod','.mdoc','.troff','.js','.jsx','.ts','.tsx','.mjs','.cjs','.py','.pyw','.go',
  '.java','.c','.h','.cpp','.hpp','.cc','.cxx','.rs','.rb','.php','.sh','.bash','.zsh','.sql',
  '.kt','.swift','.scala','.clj','.cljs','.ex','.exs','.lua','.r','.dart','.vue','.svelte',
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

// ========== RAG 向量化 ==========
const ragQueueSize = ref(0)
const ragProcessing = ref(false)

// ========== 新建文件 ==========
const createPopoverVisible = ref(false)
const creatingFile = ref(false)

const FILE_TYPE_LABELS = {
  docx: '文档',
  xlsx: '表格',
  pptx: '演示文稿',
  pdf: 'PDF',
  md: 'MD',
}

async function onCreateFile(ext) {
  createPopoverVisible.value = false
  if (!ws.selectedFolder || !selectedSubFolder.value) {
    toast.warning(t('fileModule.selectFolder'))
    return
  }
  if (creatingFile.value) return
  creatingFile.value = true

  const label = FILE_TYPE_LABELS[ext] || ext
  const baseName = t(ext === 'docx' ? 'fileModule.newDoc' : ext === 'xlsx' ? 'fileModule.newSheet' : 'fileModule.newDoc')
  const fileName = await generateUniqueFileName(baseName, ext)

  try {
    const result = await ipc.invoke(ipcApiRoute.file.createFile, {
      folderId: ws.selectedFolder.id,
      parentId: selectedSubFolder.value.id,
      fileName,
    })
    if (result.success && result.fileItem) {
      toast.success(t('fileModule.created', { name: fileName }))
      await loadFileList()
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

async function generateUniqueFileName(baseName, ext) {
  let name = `${baseName}.${ext}`
  let counter = 1
  const existingNames = new Set(fileList.value.map((f) => f.name))
  while (existingNames.has(name)) {
    name = `${baseName}${counter}.${ext}`
    counter++
  }
  return name
}

// 监听 MenuBar 中文件夹选中变化（使用 storeToRefs 的 ref 确保响应式）
watch(wsSelectedFolderId, (folderId, oldFolderId) => {
  console.log('[FileView] folderId changed:', folderId, 'old:', oldFolderId)
  if (folderId) {
    loadSubFolderTree(folderId)
  } else {
    subFolderTree.value = []
    selectedSubFolder.value = null
    fileList.value = []
  }
})

// ========== 页面初始化 ==========
onMounted(() => {
  // 如果 MenuBar 已加载了文件夹，直接加载子文件夹
  if (ws.selectedFolderId) {
    loadSubFolderTree(ws.selectedFolderId)
  }
  registerSyncChange()
  registerRagProgressListener()
})

onUnmounted(() => {
  ipc.removeAllListeners(ipcApiRoute.file.onSyncChange)
  ipc.removeAllListeners(ipcApiRoute.file.onRagProgress)
})

function registerSyncChange() {
  ipc.invoke(ipcApiRoute.file.registerSyncCallback).catch(() => {})
  ipc.on(ipcApiRoute.file.onSyncChange, (event, result) => {
    const { folderId } = result
    if (ws.selectedFolderId === folderId) {
      loadSubFolderTree(folderId)
    }
  })
}

async function loadSubFolderTree(folderId) {
  console.log('[FileView] loadSubFolderTree start, folderId:', folderId)
  subFolderLoading.value = true
  try {
    const data = await ipc.invoke(ipcApiRoute.file.getSubFolders, { folderId })
    subFolderTree.value = data || []
    console.log('[FileView] subFolderTree loaded:', subFolderTree.value.length, 'items')
    if (subFolderTree.value.length > 0) {
      // 文件夹切换后始终重新选择第一个子文件夹，强制刷新文件列表
      onSelectSubFolder(subFolderTree.value[0])
    } else {
      selectedSubFolder.value = null
      fileList.value = []
    }
  } catch (err) {
    console.error('[file] 加载子文件夹树失败:', err)
    toast.error(t('fileModule.loadSubFolderFailed'))
  } finally {
    subFolderLoading.value = false
  }
}

function onSelectSubFolder(record) {
  console.log('[FileView] onSelectSubFolder:', record?.name, 'id:', record?.id)
  selectedSubFolder.value = record
  fileList.value = []
  ws.selectFile(null)
  loadFileList()
}

async function loadFileList() {
  console.log('[FileView] loadFileList: folder =', wsSelectedFolder.value?.id, 'subFolder =', selectedSubFolder.value?.id)
  if (!wsSelectedFolder.value || !selectedSubFolder.value) {
    console.log('[FileView] loadFileList EARLY RETURN: folder or subFolder missing')
    return
  }
  fileLoading.value = true
  try {
    const data = await ipc.invoke(ipcApiRoute.file.getFiles, {
      folderId: wsSelectedFolder.value.id,
      itemId: selectedSubFolder.value.id,
    })
    fileList.value = (data || []).slice().sort((a, b) => b.id - a.id)
    console.log('[FileView] fileList loaded:', fileList.value.length, 'items')
    if (fileList.value.length > 0) {
      const current = fileList.value.find(f => f.id === wsSelectedFileId.value)
      if (!wsSelectedFileId.value || !current) {
        onSelectFile(fileList.value[0])
      } else {
        ws.selectFile(current)
      }
    }
  } catch (err) {
    console.error('[file] 加载文件列表失败:', err)
    toast.error(t('fileModule.loadFileListFailed'))
  } finally {
    fileLoading.value = false
  }
}

function onSelectFile(file) {
  ws.selectFile(file)
}

function onRefreshFiles() {
  loadFileList()
}

function registerRagProgressListener() {
  ipc.on(ipcApiRoute.file.onRagProgress, (_event, data) => {
    const { type, queueSize, status } = data
    ragQueueSize.value = queueSize || 0
    ragProcessing.value = type !== 'idle'
    if (type === 'ingest' && (status === 'READY' || status === 'FAILED' || status === 'PROCESSING')) {
      loadFileList()
    } else if (type === 'delete' || type === 'idle') {
      loadFileList()
    }
  })
}

// ========== 格式化工具 ==========
function formatDateTime(isoStr) {
  if (!isoStr) return '-'
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return isoStr
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '-'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let i = 0
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(1)} ${units[i]}`
}
</script>
