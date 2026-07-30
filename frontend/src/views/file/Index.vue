<template>
  <div class="file-workspace" ref="workspaceRef">
    <!-- ========== Panel 1: 文件夹区 ========== -->
    <div
      class="panel panel--folder"
      :class="{ 'panel--collapsed': panel1Collapsed }"
      :style="{ width: panel1Collapsed ? '40px' : panel1Width + 'px', flexShrink: 0 }"
    >
      <template v-if="!panel1Collapsed">
        <!-- 授权文件夹 -->
        <div class="panel__section panel__section--flex">
          <div class="panel__header">
            <span class="panel__title">文件夹</span>
            <a-button type="primary" size="small" :loading="addFolderLoading" @click="onAddFolder">
              <template #icon><plus-outlined /></template>
            </a-button>
          </div>
          <div class="panel__body">
            <a-list :data-source="folderList" :loading="folderLoading" class="folder-list">
              <template #renderItem="{ item }">
                <a-list-item
                  class="folder-list__item"
                  :class="{ 'folder-list__item--active': selectedFolderId === item.id }"
                  @click="onSelectFolder(item)"
                >
                  <div class="folder-card">
                    <div class="folder-card__name">
                      <folder-outlined class="folder-card__icon" />
                      <span class="folder-card__name-text" :title="getFolderName(item.path)">{{ getFolderName(item.path) }}</span>
                    </div>
                  </div>
                </a-list-item>
              </template>
              <template #emptyText>
                <a-empty description="暂无文件夹" />
              </template>
            </a-list>
          </div>
        </div>
      </template>

      <!-- 折叠状态：顶部显示文件夹图标 -->
      <div v-else class="panel__collapsed-icon" @click="togglePanel1">
        <folder-outlined />
      </div>
    </div>

    <!-- 分隔条 1 -->
    <div v-if="!panel1Collapsed" class="divider" @mousedown="onDividerMouseDown($event, 1)">
      <div class="divider__line" />
    </div>

    <!-- ========== Panel 2: 文件列表区 ========== -->
    <div class="panel panel--file-list" :style="{ width: panel2Width + 'px', flexShrink: 0 }">
      <div class="panel__toolbar">
        <!-- 左侧：折叠 Panel1 按钮 -->
        <a-tooltip :title="panel1Collapsed ? '展开文件夹面板' : '收起文件夹面板'">
          <button class="panel-toggle-btn" @click="togglePanel1">
            <component :is="panel1Collapsed ? 'MenuUnfoldOutlined' : 'MenuFoldOutlined'" />
          </button>
        </a-tooltip>
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
                <div class="create-menu__item" @click="onCreateFile('pptx')">
                  <file-ppt-outlined class="create-menu__icon create-menu__icon--ppt" />
                  <span>演示文稿</span>
                </div>
                <div class="create-menu__item" @click="onCreateFile('pdf')">
                  <file-pdf-outlined class="create-menu__icon create-menu__icon--pdf" />
                  <span>PDF</span>
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
            :class="{ 'file-item--active': selectedFileId === file.id }"
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
    <div class="divider" @mousedown="onDividerMouseDown($event, 2)">
      <div class="divider__line" />
    </div>

    <!-- ========== Panel 3: 文件预览区 ========== -->
    <div class="panel panel--preview">
      <OnlyOfficeEditor
        v-if="editorMode && selectedFile && isEditableFile(selectedFile.name)"
        :key="'editor-' + selectedFile.id"
        :file-item-id="selectedFile.id"
        :file-name="selectedFile.name"
        :panel4-collapsed="panel4Collapsed"
        mode="edit"
        @state-change="onEditorStateChange"
        @toggle-panel4="togglePanel4"
        @rename="onEditorRename"
      />
      <FilePreviewPanel
        v-else
        :file="selectedFile"
        :panel4-collapsed="panel4Collapsed"
        :show-edit-button="selectedFile && isEditableFile(selectedFile.name)"
        @toggle-panel4="togglePanel4"
        @edit="enterEditMode"
      />
    </div>

    <!-- 分隔条 3 + Panel 4 -->
    <template v-if="!panel4Collapsed">
      <div class="divider" @mousedown="onDividerMouseDown($event, 3)">
        <div class="divider__line" />
      </div>
      <div class="panel panel--info" :style="{ width: panel4Width + 'px', flexShrink: 0 }">
        <FileInfoPanel :file="selectedFile" :status-tag="selectedFileStatusTag" />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch, shallowRef } from 'vue';
import { message } from 'ant-design-vue';
import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';
import FilePreviewPanel from '@/components/file/FilePreviewPanel.vue';
import FileInfoPanel from '@/components/file/FileInfoPanel.vue';
import OnlyOfficeEditor from '@/components/file/OnlyOfficeEditor.vue';

// ========== 面板宽度 & 折叠状态 ==========
const workspaceRef = ref(null);
const panel1Width = ref(160);
const panel2Width = ref(280);
const panel4Width = ref(300);
const panel1Collapsed = ref(true);
const panel4Collapsed = ref(true);

function togglePanel1() {
  panel1Collapsed.value = !panel1Collapsed.value;
}
function togglePanel4() {
  panel4Collapsed.value = !panel4Collapsed.value;
}

// ========== 拖拽分隔条 ==========
let draggingDivider = null;
let dragStartX = 0;
let dragStartWidth = 0;

function onDividerMouseDown(event, divider) {
  event.preventDefault();
  draggingDivider = divider;
  dragStartX = event.clientX;
  if (divider === 1) dragStartWidth = panel1Width.value;
  else if (divider === 2) dragStartWidth = panel2Width.value;
  else if (divider === 3) dragStartWidth = panel4Width.value;
  document.addEventListener('mousemove', onDividerMouseMove);
  document.addEventListener('mouseup', onDividerMouseUp);
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
}

function onDividerMouseMove(event) {
  if (!draggingDivider) return;
  const delta = event.clientX - dragStartX;
  if (draggingDivider === 1) {
    panel1Width.value = Math.min(200, Math.max(120, dragStartWidth + delta));
  } else if (draggingDivider === 2) {
    const containerWidth = workspaceRef.value?.clientWidth || 1200;
    const p1 = panel1Collapsed.value ? 40 : panel1Width.value;
    const p4 = panel4Collapsed.value ? 0 : panel4Width.value;
    const maxP2 = containerWidth - p1 - p4 - 250;
    panel2Width.value = Math.min(maxP2, Math.max(200, dragStartWidth + delta));
  } else if (draggingDivider === 3) {
    panel4Width.value = Math.min(400, Math.max(240, dragStartWidth - delta));
  }
}

function onDividerMouseUp() {
  draggingDivider = null;
  document.removeEventListener('mousemove', onDividerMouseMove);
  document.removeEventListener('mouseup', onDividerMouseUp);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onDividerMouseMove);
  document.removeEventListener('mouseup', onDividerMouseUp);
});

// ========== 授权文件夹列表 ==========
const folderList = ref([]);
const folderLoading = ref(false);
const selectedFolderId = ref(null);
const selectedFolder = ref(null);
const addFolderLoading = ref(false);

// ========== 子文件夹树 ==========
const subFolderTree = ref([]);
const subFolderLoading = ref(false);
const selectedSubFolder = ref(null);
const subFolderColumns = [
  { title: '文件夹名称', dataIndex: 'name', ellipsis: true },
  { title: '文件数', dataIndex: 'fileCount', width: 60, align: 'center' },
];

// ========== 文件列表 ==========
const fileList = ref([]);
const fileLoading = ref(false);
const selectedFileId = ref(null);
const selectedFile = ref(null);

const selectedFileStatusTag = computed(() => {
  if (!selectedFile.value) return { color: 'default', text: '-' };
  return getStatusTag(selectedFile.value.status, selectedFile.value.name);
});

const fileEmptyText = computed(() => {
  if (!selectedFolder.value) return '请先选择授权文件夹';
  return '请从左侧选择一个文件夹';
});

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
];
const IGNORE_FILENAMES = ['.ds_store', 'thumbs.db'];

function isFileSupported(fileName) {
  const lower = fileName.toLowerCase();
  const baseName = lower.split('/').pop() || lower;
  if (IGNORE_FILENAMES.includes(baseName)) return false;
  const ext = '.' + (fileName.split('.').pop() || '').toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(ext);
}

function getStatusTag(status, fileName) {
  if (!isFileSupported(fileName)) {
    return { color: 'default', text: '不支持', title: '不支持的文件格式' };
  }
  const map = {
    PENDING: { color: 'orange', text: '待处理' },
    PROCESSING: { color: 'blue', text: '处理中' },
    READY: { color: 'green', text: '就绪' },
    FAILED: { color: 'red', text: '失败' },
  };
  return map[status] || { color: 'default', text: status || '未知' };
}

function getFileIcon(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (['png','jpg','jpeg','gif','webp','bmp','svg','tiff','tif'].includes(ext)) return 'FileImageOutlined';
  if (['pdf'].includes(ext)) return 'FilePdfOutlined';
  if (['doc','docx'].includes(ext)) return 'FileWordOutlined';
  if (['xls','xlsx','csv'].includes(ext)) return 'FileExcelOutlined';
  if (['ppt','pptx'].includes(ext)) return 'FilePptOutlined';
  if (['mp4','avi','mov','mkv'].includes(ext)) return 'VideoCameraOutlined';
  if (['mp3','wav','flac'].includes(ext)) return 'SoundOutlined';
  if (['zip','tar','gz','7z','rar'].includes(ext)) return 'FileZipOutlined';
  if (['js','ts','py','go','java','c','cpp','rs','vue','html','css'].includes(ext)) return 'CodeOutlined';
  if (['md','txt'].includes(ext)) return 'FileTextOutlined';
  return 'FileOutlined';
}

// ========== RAG 向量化 ==========
const reingestingId = ref(null);
const ragQueueSize = ref(0);
const ragProcessing = ref(false);

// ========== 新建文件 ==========
const createPopoverVisible = ref(false);
const editorMode = ref(false);
const creatingFile = ref(false);
const editorRef = shallowRef(null);

const EDITABLE_EXTENSIONS = ['docx', 'xlsx', 'pptx', 'pdf'];

function isEditableFile(fileName) {
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
  return EDITABLE_EXTENSIONS.includes(ext);
}

const FILE_TYPE_LABELS = {
  docx: '文档',
  xlsx: '表格',
  pptx: '演示文稿',
  pdf: 'PDF',
  md: 'MD',
};

async function onCreateFile(ext) {
  createPopoverVisible.value = false;
  if (!selectedFolder.value || !selectedSubFolder.value) {
    message.warning('请先选择文件夹');
    return;
  }
  if (creatingFile.value) return;
  creatingFile.value = true;

  const label = FILE_TYPE_LABELS[ext] || ext;
  const baseName = `新建${label}`;
  const fileName = await generateUniqueFileName(baseName, ext);

  try {
    const result = await ipc.invoke(ipcApiRoute.file.createFile, {
      folderId: selectedFolder.value.id,
      parentId: selectedSubFolder.value.id,
      fileName,
    });
    if (result.success && result.fileItem) {
      message.success(`已创建: ${fileName}`);
      // 刷新文件列表
      await loadFileList();
      // 选中新文件（默认预览模式）
      onSelectFile(result.fileItem);
    } else {
      message.error(result.message || '创建文件失败');
    }
  } catch (err) {
    console.error('[file] 创建文件失败:', err);
    message.error('创建文件失败');
  } finally {
    creatingFile.value = false;
  }
}

async function generateUniqueFileName(baseName, ext) {
  let name = `${baseName}.${ext}`;
  let counter = 1;
  const existingNames = new Set(fileList.value.map((f) => f.name));
  while (existingNames.has(name)) {
    name = `${baseName}${counter}.${ext}`;
    counter++;
  }
  return name;
}

function onEditorStateChange(modified) {
  // 可以在这里处理未保存提示
}

async function onEditorRename(newName) {
  if (!selectedFile.value || !newName) return;
  try {
    const result = await ipc.invoke(ipcApiRoute.file.renameFile, {
      fileItemId: selectedFile.value.id,
      newName,
    });
    if (result.success) {
      // 更新选中的文件对象
      selectedFile.value = result.fileItem || { ...selectedFile.value, name: newName };
      // 刷新文件列表
      loadFileList();
      message.success(`已重命名为: ${newName}`);
    } else {
      message.error(result.message || '重命名失败');
    }
  } catch (err) {
    console.error('[file] 重命名失败:', err);
    message.error('重命名失败');
  }
}

function enterEditMode() {
  editorMode.value = true;
}

// 当切换文件时，默认回到预览模式
watch(selectedFile, (file) => {
  editorMode.value = false;
});

// ========== 页面初始化 ==========
onMounted(() => {
  loadFolderList();
  registerSyncChange();
  registerRagProgressListener();
});

onUnmounted(() => {
  ipc.removeAllListeners(ipcApiRoute.file.onSyncChange);
  ipc.removeAllListeners(ipcApiRoute.file.onRagProgress);
});

function registerSyncChange() {
  ipc.invoke(ipcApiRoute.file.registerSyncCallback).catch(() => {});
  ipc.on(ipcApiRoute.file.onSyncChange, (event, result) => {
    const { folderId } = result;
    if (selectedFolderId.value === folderId) {
      loadSubFolderTree(folderId);
    }
  });
}

async function loadFolderList() {
  folderLoading.value = true;
  try {
    const data = await ipc.invoke(ipcApiRoute.file.getFolderList);
    folderList.value = data || [];
    if (folderList.value.length > 0) {
      onSelectFolder(folderList.value[0]);
    }
  } catch (err) {
    console.error('[file] 加载文件夹列表失败:', err);
    message.error('加载文件夹列表失败');
  } finally {
    folderLoading.value = false;
  }
}

async function onAddFolder() {
  addFolderLoading.value = true;
  try {
    const result = await ipc.invoke(ipcApiRoute.file.addFolder);
    if (result.success) {
      message.success('文件夹添加成功');
      folderList.value = result.folderList || [];
      if (result.folder) {
        onSelectFolder(result.folder);
      } else if (folderList.value.length > 0) {
        onSelectFolder(folderList.value[0]);
      }
    } else if (result.message) {
      message.warning(result.message);
      folderList.value = result.folderList || [];
    }
  } catch (err) {
    console.error('[file] 添加文件夹失败:', err);
    message.error('添加文件夹失败');
  } finally {
    addFolderLoading.value = false;
  }
}

function onSelectFolder(item) {
  selectedFolderId.value = item.id;
  selectedFolder.value = item;
  selectedSubFolder.value = null;
  subFolderTree.value = [];
  fileList.value = [];
  selectedFile.value = null;
  selectedFileId.value = null;
  loadSubFolderTree(item.id);
}

async function loadSubFolderTree(folderId) {
  subFolderLoading.value = true;
  try {
    const data = await ipc.invoke(ipcApiRoute.file.getSubFolders, { folderId });
    subFolderTree.value = data || [];
    if (subFolderTree.value.length > 0) {
      onSelectSubFolder(subFolderTree.value[0]);
    }
  } catch (err) {
    console.error('[file] 加载子文件夹树失败:', err);
    message.error('加载子文件夹树失败');
  } finally {
    subFolderLoading.value = false;
  }
}

function subFolderCustomRow(record) {
  return {
    onClick: () => onSelectSubFolder(record),
    style: { cursor: 'pointer' },
  };
}

function subFolderRowClass(record) {
  return selectedSubFolder.value?.id === record.id ? 'sub-folder-row--active' : '';
}

function onSelectSubFolder(record) {
  selectedSubFolder.value = record;
  fileList.value = [];
  selectedFile.value = null;
  selectedFileId.value = null;
  loadFileList();
}

async function loadFileList() {
  if (!selectedFolder.value || !selectedSubFolder.value) return;
  fileLoading.value = true;
  try {
    const data = await ipc.invoke(ipcApiRoute.file.getFiles, {
      folderId: selectedFolder.value.id,
      itemId: selectedSubFolder.value.id,
    });
    fileList.value = (data || []).slice().sort((a, b) => b.id - a.id);
    // 默认选中第一个文件
    if (fileList.value.length > 0) {
      onSelectFile(fileList.value[0]);
    }
  } catch (err) {
    console.error('[file] 加载文件列表失败:', err);
    message.error('加载文件列表失败');
  } finally {
    fileLoading.value = false;
  }
}

function onSelectFile(file) {
  selectedFileId.value = file.id;
  selectedFile.value = file;
}

function onRefreshFiles() {
  loadFileList();
}

async function onReingestFile(record) {
  reingestingId.value = record.id;
  try {
    const result = await ipc.invoke(ipcApiRoute.file.reingestFile, { fileItemId: record.id });
    if (result.success) {
      message.success(`已加入向量化队列: ${record.name}`);
    } else {
      message.error(`入队失败: ${result.message || '未知错误'}`);
    }
    await loadFileList();
  } catch (err) {
    console.error('[file] 重新向量化失败:', err);
    message.error('重新向量化失败');
  } finally {
    reingestingId.value = null;
  }
}

function registerRagProgressListener() {
  ipc.on(ipcApiRoute.file.onRagProgress, (_event, data) => {
    const { type, fileItemId, fileName, queueSize, status } = data;
    ragQueueSize.value = queueSize || 0;
    ragProcessing.value = type !== 'idle';
    if (type === 'ingest' && (status === 'READY' || status === 'FAILED' || status === 'PROCESSING')) {
      loadFileList();
    } else if (type === 'delete') {
      loadFileList();
    } else if (type === 'idle') {
      loadFileList();
    }
  });
}

// ========== 格式化工具 ==========
function getFolderName(path) {
  if (!path) return '未命名';
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || path;
}

function formatDateTime(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}
</script>

<style lang="less" scoped>
.file-workspace {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: var(--bg-layout);
  padding: 0;
  gap: 0;
}

// ========== 通用面板样式 ==========
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  background-color: var(--bg-panel);
  border: none;
  border-radius: 0;
  transition: width 0.25s ease;

  &__section {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;

    &--flex {
      flex: 1;
      min-height: 0;
    }
  }

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    flex-shrink: 0;
  }

  &__title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    padding: 4px 6px;
    min-height: 0;
  }

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
}

// ========== Panel 1: 文件夹区 — 灰色背景 ==========
.panel--folder {
  background-color: var(--bg-sidebar);
  border-color: var(--border-color);
}

.panel--collapsed {
  .panel__collapsed-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 40px;
    cursor: pointer;
    color: var(--text-secondary);
    font-size: 16px;

    &:hover {
      color: var(--accent);
    }
  }
}

// ========== 分隔条 ==========
.divider {
  width: 5px;
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  z-index: 5;

  &__line {
    width: 1px;
    height: 100%;
    background-color: var(--border-color);
    transition: background-color 0.15s ease, width 0.15s ease;
  }

  &:hover .divider__line,
  &:active .divider__line {
    background-color: var(--bg-divider-hover);
    width: 2px;
  }
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

// ========== 文件夹列表 ==========
.folder-list {
  :deep(.ant-list-item) {
    padding: 0 !important;
    margin-bottom: 2px;
    border-radius: 0 !important;
    border: none !important;
    cursor: pointer;
    transition: background-color 0.15s ease;
    background-color: transparent !important;

    &:hover {
      background-color: var(--bg-hover) !important;
    }
  }

  .folder-list__item--active {
    :deep(&.ant-list-item) {
      background-color: var(--bg-active) !important;
    }
  }
}

.folder-card {
  padding: 6px 10px;
  width: 100%;

  &__name {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__icon {
    color: var(--accent);
    font-size: 14px;
    flex-shrink: 0;
  }

  &__name-text {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

// ========== 子文件夹表格（已移除，保留空占位） ==========

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
  .panel--folder {
    display: none;
  }
  .divider:first-child {
    display: none;
  }
}
</style>
