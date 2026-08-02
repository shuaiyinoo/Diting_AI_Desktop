<template>
  <div class="file-workspace" ref="workspaceRef">
    <!-- ========== 第二部分：文件列表区 ========== -->
    <div class="panel panel--file-list" :style="{ width: panel2Width + 'px', flexShrink: 0 }">
      <div class="panel__toolbar">
        <span class="panel__path" v-if="selectedSubFolder" :title="selectedSubFolder.relative_path">
          {{ selectedSubFolder.name }}
        </span>
        <span class="panel__path panel__path--placeholder" v-else>文件列表</span>
        <div class="panel__toolbar-right">
          <a-tag v-if="ragProcessing || ragQueueSize > 0" color="processing" class="rag-queue-tag">
            <a-spin v-if="ragProcessing" size="small" style="margin-right: 4px" />
            {{ ragProcessing ? `向量化中... 剩余${ragQueueSize}` : `队列 ${ragQueueSize}` }}
          </a-tag>
          <a-tooltip title="刷新">
            <button class="panel-toggle-btn" @click="onRefreshFiles">
              <reload-outlined />
            </button>
          </a-tooltip>
          <!-- 新建文件 -->
          <a-popover trigger="click" placement="bottomRight" :open="createPopoverVisible" @open-change="createPopoverVisible = $event">
            <template #content>
              <div class="create-menu">
                <div class="create-menu__item" @click="onCreateFile('docx')">
                  <file-word-outlined class="create-menu__icon create-menu__icon--word" />
                  <span>文档</span>
                </div>
                <div class="create-menu__item" @click="onCreateFile('xlsx')">
                  <file-excel-outlined class="create-menu__icon create-menu__icon--excel" />
                  <span>表格</span>
                </div>
                <div class="create-menu__item" @click="onCreateFile('md')">
                  <file-text-outlined class="create-menu__icon create-menu__icon--md" />
                  <span>MD</span>
                </div>
              </div>
            </template>
            <a-tooltip title="新建文件">
              <button class="panel-toggle-btn">
                <plus-outlined />
              </button>
            </a-tooltip>
          </a-popover>
        </div>
      </div>

      <div class="panel__body">
        <div v-if="!selectedSubFolder" class="file-empty">
          <a-empty :description="fileEmptyText" />
        </div>
        <div v-else class="file-list" v-loading="fileLoading">
          <div
            v-for="file in fileList"
            :key="file.id"
            class="file-item"
            :class="{ 'file-item--active': ws.selectedFileId === file.id }"
            @click="onSelectFile(file)"
          >
            <div class="file-item__info">
              <div class="file-item__name" :title="file.name">{{ file.name }}</div>
              <div class="file-item__desc">{{ formatFileSize(file.size) }} · {{ formatDateTime(file.mtime) }}</div>
            </div>
          </div>
          <div v-if="!fileLoading && fileList.length === 0" class="file-empty">
            <a-empty description="该文件夹下暂无文件" />
          </div>
        </div>
      </div>
    </div>

    <!-- 分隔条 2 -->
    <PanelDivider @resize="onPanel2Resize" />

    <!-- ========== 第三部分：文件预览/编辑区 ========== -->
    <div class="panel panel--preview">
      <MdEditor
        v-if="editorMode && ws.selectedFile && isMdFile(ws.selectedFile.name)"
        :key="'md-editor-' + ws.selectedFile.id"
        :file-item-id="ws.selectedFile.id"
        :file-name="ws.selectedFile.name"
        :panel4-collapsed="panel4Collapsed"
        @toggle-panel4="togglePanel4"
      />
      <OnlyOfficeEditor
        v-else-if="editorMode && ws.selectedFile && isEditableFile(ws.selectedFile.name)"
        :key="'editor-' + ws.selectedFile.id"
        :file-item-id="ws.selectedFile.id"
        :file-name="ws.selectedFile.name"
        :panel4-collapsed="panel4Collapsed"
        mode="edit"
        @state-change="onEditorStateChange"
        @toggle-panel4="togglePanel4"
        @rename="onEditorRename"
      />
      <FilePreviewPanel
        v-else
        :file="ws.selectedFile"
        :panel4-collapsed="panel4Collapsed"
        :show-edit-button="ws.selectedFile && isEditableFile(ws.selectedFile.name)"
        @toggle-panel4="togglePanel4"
        @edit="enterEditMode"
      />
    </div>

    <!-- ========== 第四部分：文件属性 ========== -->
    <template v-if="!panel4Collapsed">
      <PanelDivider @resize="onPanel4Resize" />
      <div class="panel panel--info" :style="{ width: panel4Width + 'px', flexShrink: 0 }">
        <FileInfoPanel :file="ws.selectedFile" :status-tag="selectedFileStatusTag" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, shallowRef } from 'vue'
import { storeToRefs } from 'pinia'
import { message } from 'ant-design-vue'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'
import { useWorkspaceStore } from '@/stores/workspace'
import FilePreviewPanel from '@/components/file/FilePreviewPanel.vue'
import FileInfoPanel from '@/components/file/FileInfoPanel.vue'
import OnlyOfficeEditor from '@/components/file/OnlyOfficeEditor.vue'
import MdEditor from '@/components/file/MdEditor.vue'
import PanelDivider from '@/components/layout/PanelDivider.vue'

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
  if (!wsSelectedFolderId.value) return '请先选择授权文件夹'
  return '请从左侧选择一个文件夹'
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
    return { color: 'default', text: '不支持', title: '不支持的文件格式' }
  }
  const map = {
    PENDING: { color: 'orange', text: '待处理' },
    PROCESSING: { color: 'blue', text: '处理中' },
    READY: { color: 'green', text: '就绪' },
    FAILED: { color: 'red', text: '失败' },
  }
  return map[status] || { color: 'default', text: status || '未知' }
}

// ========== RAG 向量化 ==========
const ragQueueSize = ref(0)
const ragProcessing = ref(false)

// ========== 新建文件 ==========
const createPopoverVisible = ref(false)
const editorMode = ref(false)
const creatingFile = ref(false)
const editorRef = shallowRef(null)

const EDITABLE_EXTENSIONS = ['docx', 'xlsx', 'pptx', 'md']
const MD_EXTENSIONS = ['md', 'markdown']

function isEditableFile(fileName) {
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || ''
  return EDITABLE_EXTENSIONS.includes(ext)
}

function isMdFile(fileName) {
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || ''
  return MD_EXTENSIONS.includes(ext)
}

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
    message.warning('请先选择文件夹')
    return
  }
  if (creatingFile.value) return
  creatingFile.value = true

  const label = FILE_TYPE_LABELS[ext] || ext
  const baseName = `新建${label}`
  const fileName = await generateUniqueFileName(baseName, ext)

  try {
    const result = await ipc.invoke(ipcApiRoute.file.createFile, {
      folderId: ws.selectedFolder.id,
      parentId: selectedSubFolder.value.id,
      fileName,
    })
    if (result.success && result.fileItem) {
      message.success(`已创建: ${fileName}`)
      await loadFileList()
      onSelectFile(result.fileItem)
    } else {
      message.error(result.message || '创建文件失败')
    }
  } catch (err) {
    console.error('[file] 创建文件失败:', err)
    message.error('创建文件失败')
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

function onEditorStateChange(modified) {
  // 可以在这里处理未保存提示
}

async function onEditorRename(newName) {
  if (!ws.selectedFile || !newName) return
  const oldName = ws.selectedFile.name || ''
  const oldExt = oldName.includes('.') ? oldName.split('.').pop().toLowerCase() : ''
  const newNameExt = newName.includes('.') ? newName.split('.').pop().toLowerCase() : ''
  const finalName = (oldExt && newNameExt !== oldExt) ? `${newName}.${oldExt}` : newName
  try {
    const result = await ipc.invoke(ipcApiRoute.file.renameFile, {
      fileItemId: ws.selectedFile.id,
      newName: finalName,
    })
    if (result.success) {
      ws.selectFile(result.fileItem || { ...ws.selectedFile, name: finalName })
      loadFileList()
      message.success(`已重命名为: ${finalName}`)
    } else {
      message.error(result.message || '重命名失败')
    }
  } catch (err) {
    console.error('[file] 重命名失败:', err)
    message.error('重命名失败')
  }
}

function enterEditMode() {
  editorMode.value = true
}

// 切换文件时：可编辑文件直接用编辑器打开
watch(() => ws.selectedFile, (file, oldFile) => {
  if (file?.id !== oldFile?.id) {
    editorMode.value = isEditableFile(file?.name || '')
  }
})

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
    message.error('加载子文件夹树失败')
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
    message.error('加载文件列表失败')
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

<style lang="less" scoped>
.file-workspace {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: var(--bg-layout);
}

// ========== 通用面板样式 ==========
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  background-color: var(--bg-panel);

  &__toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    height: 40px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-color);
  }

  &__toolbar-right {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }

  &__path {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;

    &--placeholder {
      color: var(--text-muted);
      font-weight: 400;
    }
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    padding: 4px 6px;
    min-height: 0;
  }
}

// ========== 文件列表 ==========
.file-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
}

.file-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.file-item {
  display: flex;
  padding: 8px 10px;
  border-radius: 0;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;

  &:hover {
    background-color: var(--bg-hover);
  }

  &--active {
    background-color: var(--bg-active);
    border-left: 2px solid var(--accent);
    padding-left: 8px;
  }

  &__info {
    flex: 1;
    min-width: 0;
  }

  &__name {
    font-size: 13px;
    font-weight: 500;
    color: #000;
    line-height: 1.4;
    word-break: break-all;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;

    [data-theme='dark'] & {
      color: #e0e0e0;
    }
  }

  &__desc {
    font-size: 11px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-top: 4px;
  }
}

// ========== Panel 3 & 4 ==========
.panel--preview {
  flex: 1;
  min-width: 200px;
}

.panel--info {
  min-width: 240px;
}

.rag-queue-tag {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  margin: 0;
}

// ========== 面板切换按钮 ==========
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

// ========== 新建文件菜单 ==========
.create-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 120px;

  &__item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-primary);
    transition: background-color 0.15s ease;

    &:hover {
      background-color: var(--bg-hover);
    }
  }

  &__icon {
    font-size: 16px;

    &--word { color: #2b579a; }
    &--excel { color: #217346; }
    &--ppt { color: #d24726; }
    &--pdf { color: #bb0707; }
    &--md { color: #6c757d; }
  }
}

// ========== 响应式 ==========
@media (max-width: 900px) {
  .panel--file-list {
    display: none;
  }
}
</style>
