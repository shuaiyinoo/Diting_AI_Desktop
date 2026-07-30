<template>
  <div class="oo-editor-wrap">
    <!-- 顶部工具栏 -->
    <div class="oo-editor-wrap__toolbar">
      <div class="oo-editor-wrap__title">
        <edit-outlined class="oo-editor-wrap__icon" />
        <span class="oo-editor-wrap__name" :title="fileName">{{ fileName || '文件编辑' }}</span>
      </div>
      <!-- 右侧：折叠第四面板按钮 -->
      <a-tooltip :title="panel4Collapsed ? '展开信息面板' : '收起信息面板'">
        <button class="oo-toggle-btn" @click="$emit('toggle-panel4')">
          <component :is="panel4Collapsed ? 'MenuFoldOutlined' : 'MenuUnfoldOutlined'" />
        </button>
      </a-tooltip>
    </div>

    <!-- 编辑器主体 -->
    <div class="oo-editor-wrap__body" :style="{ height: 'calc(100% - 40px)' }">
      <div class="oo-editor" style="height: 100%">
        <iframe
          ref="frameRef"
          class="oo-editor__frame"
          :src="frameSrc"
          frameborder="0"
          allowfullscreen
          @load="onFrameLoad"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';
import { isDark } from '@/theme';

const props = defineProps({
  fileItemId: { type: [Number, String], default: null },
  fileName: { type: String, default: '' },
  mode: { type: String, default: 'edit' },
  height: { type: [String, Number], default: '100%' },
  panel4Collapsed: { type: Boolean, default: false },
});

const emit = defineEmits(['ready', 'document-ready', 'state-change', 'saved', 'toggle-panel4', 'rename']);

const frameRef = ref(null);
const frameReady = ref(false);
const documentReady = ref(false);
const saveSeq = ref(0);
const pendingSaves = ref({});
const isSaving = ref(false);
let blobUrl = '';

const wrapHeight = computed(() =>
  typeof props.height === 'number' ? `${props.height}px` : props.height
);

const frameSrc = computed(() => '/onlyoffice/onlyoffice.html');

// 推断文件类型
function inferFileType(name) {
  const ext = (name || '').split('.').pop()?.toLowerCase() || '';
  return ext;
}

function inferDocumentType(fileType) {
  const wordTypes = ['docx', 'odt', 'txt', 'rtf', 'doc'];
  const cellTypes = ['xlsx', 'ods', 'csv', 'xls'];
  const slideTypes = ['pptx', 'odp', 'ppt'];
  if (wordTypes.includes(fileType)) return 'word';
  if (cellTypes.includes(fileType)) return 'cell';
  if (slideTypes.includes(fileType)) return 'slide';
  if (fileType === 'pdf') return 'pdf';
  return 'word';
}

function buildConfig(blobUrl, fileName) {
  const fileType = inferFileType(fileName);
  const documentType = inferDocumentType(fileType);
  return {
    document: {
      url: blobUrl,
      title: fileName,
      fileType,
      key: 'file-' + props.fileItemId + '-' + Date.now(),
      permissions: {
        edit: props.mode !== 'view',
        download: true,
        print: true,
      },
    },
    documentType,
    editorConfig: {
      mode: props.mode === 'view' ? 'view' : 'edit',
      lang: 'zh-CN',
      customization: {
        uiTheme: isDark.value ? 'theme-dark' : 'theme-light',
        features: {
          documentDarkMode: isDark.value,
        },
      },
    },
    height: '100%',
    width: '100%',
  };
}

function pushConfig() {
  if (!frameReady.value || !props.fileItemId) return;
  const frame = frameRef.value;
  if (!frame?.contentWindow) return;

  // 先获取文件数据
  ipc.invoke(ipcApiRoute.file.getFileData, { fileItemId: Number(props.fileItemId) }).then((result) => {
    if (!result || !result.success) {
      console.error('[OnlyOfficeEditor] 获取文件数据失败:', result?.message);
      return;
    }

    // 清理旧的 blob URL
    if (blobUrl) URL.revokeObjectURL(blobUrl);

    const uint8 = result.buffer;
    const arrayBuffer =
      uint8 instanceof Uint8Array
        ? uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength)
        : new ArrayBuffer(0);

    const blob = new Blob([arrayBuffer]);
    blobUrl = URL.createObjectURL(blob);

    documentReady.value = false;
    frame.contentWindow.postMessage(
      { type: 'onlyoffice-config', docConfig: buildConfig(blobUrl, result.name || props.fileName) },
      '*'
    );
  }).catch((err) => {
    console.error('[OnlyOfficeEditor] 获取文件数据异常:', err);
  });
}

function onMessage(event) {
  const data = event.data;
  if (!data) return;

  if (data.type === 'onlyoffice-ready') {
    frameReady.value = true;
    pushConfig();
    emit('ready');
  } else if (data.type === 'onlyoffice-document-ready') {
    documentReady.value = true;
    emit('document-ready');
  } else if (data.type === 'onlyoffice-saved') {
    handleSaved(data);
  } else if (data.type === 'onlyoffice-state-change') {
    emit('state-change', !!data.modified);
    // 文档被修改后，自动触发保存（防抖），保存中不重复触发
    if (data.modified && !isSaving.value) {
      scheduleAutoSave();
    }
  } else if (data.type === 'onlyoffice-rename') {
    // 文件重命名回调
    if (data.title) {
      emit('rename', data.title);
    }
  }
}

function handleSaved(data) {
  // 将文件数据写入磁盘
  if (data.ok && data.buffer) {
    writeToFile(data.buffer, data.fileType);
  }

  const pending = data.requestId && pendingSaves.value[data.requestId];
  if (pending) {
    clearTimeout(pending.timer);
    delete pendingSaves.value[data.requestId];
    if (data.ok && data.buffer) {
      pending.resolve(new Blob([data.buffer]));
    } else {
      pending.reject(new Error(data.error || '保存失败'));
    }
    return;
  }
  // 自动保存
  if (data.ok && data.buffer) {
    emit('saved', new Blob([data.buffer]), data.fileType);
  }
}

// 防抖写入文件，避免频繁保存导致过多磁盘 IO
let saveTimer = null;
let pendingBuffer = null;
let pendingFileType = null;

function writeToFile(buffer, fileType) {
  if (!props.fileItemId) return;
  // 将 ArrayBuffer 转为 Uint8Array 以便 IPC 传输
  let uint8;
  if (buffer instanceof ArrayBuffer) {
    uint8 = new Uint8Array(buffer);
  } else if (buffer instanceof Uint8Array) {
    uint8 = buffer;
  } else if (buffer && buffer.buffer instanceof ArrayBuffer) {
    uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset || 0, buffer.byteLength);
  } else {
    console.error('[OnlyOfficeEditor] 不支持的 buffer 类型:', typeof buffer);
    return;
  }
  // 缓存最新的 buffer，延迟写入（防抖）
  pendingBuffer = uint8;
  pendingFileType = fileType;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    doWriteToFile();
  }, 800);
}

async function doWriteToFile() {
  if (!pendingBuffer || !props.fileItemId) return;
  const buf = pendingBuffer;
  pendingBuffer = null;
  pendingFileType = null;
  saveTimer = null;

  try {
    const result = await ipc.invoke(ipcApiRoute.file.saveFileData, {
      fileItemId: Number(props.fileItemId),
      buffer: buf,
    });
    if (result && result.success) {
      console.log('[OnlyOfficeEditor] 文件已保存到磁盘');
    } else {
      console.error('[OnlyOfficeEditor] 保存到磁盘失败:', result?.message);
    }
  } catch (err) {
    console.error('[OnlyOfficeEditor] 保存到磁盘异常:', err);
  }
}

function onFrameLoad() {
  if (frameReady.value) pushConfig();
}

// 自动保存：文档状态变化后延迟自动保存
let autoSaveTimer = null;
function scheduleAutoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    // 仅在文档就绪且非手动保存进行中时触发
    if (documentReady.value && frameReady.value) {
      triggerSilentSave();
    }
  }, 2000);
}

function triggerSilentSave() {
  const frame = frameRef.value;
  if (!frameReady.value || !frame?.contentWindow) return;
  if (isSaving.value) return;
  isSaving.value = true;
  const requestId = `autosave-${++saveSeq.value}`;
  // 自动保存不用 Promise 等待结果，只触发写入
  const timer = setTimeout(() => {
    delete pendingSaves.value[requestId];
    isSaving.value = false;
  }, 20000);
  pendingSaves.value[requestId] = {
    resolve: () => { isSaving.value = false; },
    reject: () => { isSaving.value = false; },
    timer,
  };
  const ft = inferFileType(props.fileName) || undefined;
  frame.contentWindow.postMessage({ type: 'onlyoffice-save', requestId, format: ft }, '*');
}

// 公开 save 方法
async function save(format) {
  const frame = frameRef.value;
  if (!frameReady.value || !frame?.contentWindow) {
    throw new Error('编辑器未就绪');
  }
  // 等待文档就绪
  if (!documentReady.value) {
    await new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (documentReady.value) resolve();
        else if (Date.now() - start > 20000) reject(new Error('编辑器加载超时'));
        else setTimeout(check, 120);
      };
      check();
    });
  }
  if (isSaving.value) return;
  isSaving.value = true;
  const requestId = `save-${++saveSeq.value}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      delete pendingSaves.value[requestId];
      isSaving.value = false;
      reject(new Error('保存超时'));
    }, 20000);
    pendingSaves.value[requestId] = {
      resolve: (blob) => { isSaving.value = false; resolve(blob); },
      reject: (err) => { isSaving.value = false; reject(err); },
      timer,
    };
    const ft = format || inferFileType(props.fileName) || undefined;
    frame.contentWindow.postMessage({ type: 'onlyoffice-save', requestId, format: ft }, '*');
  });
}

defineExpose({ save });

watch(
  () => props.fileItemId,
  () => {
    nextTick(() => pushConfig());
  }
);

// 主题切换时重新加载 iframe（OnlyOffice WASM 版销毁重建不可靠，必须整页刷新）
// 加时间戳使 URL 变化，浏览器才会真正重新加载
watch(isDark, () => {
  frameReady.value = false;
  documentReady.value = false;
  const frame = frameRef.value;
  if (frame) {
    frame.src = '/onlyoffice/onlyoffice.html?t=' + Date.now();
  }
  // iframe 重新加载后，init() 会 postMessage('onlyoffice-ready')，
  // onMessage 收到后设 frameReady=true 并调用 pushConfig()，
  // pushConfig 读取最新的 isDark.value 构建带新主题的配置
});

onMounted(() => {
  window.addEventListener('message', onMessage);
});

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage);
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  // 清理自动保存定时器
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  // 组件销毁前确保待写入的数据落盘
  if (saveTimer) {
    clearTimeout(saveTimer);
    doWriteToFile();
  }
  Object.keys(pendingSaves.value).forEach((id) => {
    const p = pendingSaves.value[id];
    if (p) {
      clearTimeout(p.timer);
      p.reject(new Error('编辑器已销毁'));
    }
  });
});
</script>

<style lang="less" scoped>
.oo-editor-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--bg-panel);
  overflow: hidden;

  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 8px 0 14px;
    height: 40px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-color);
    background-color: var(--bg-panel);
  }

  &__title {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }

  &__icon {
    color: var(--accent);
    font-size: 14px;
    flex-shrink: 0;
  }

  &__name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
}

.oo-editor {
  width: 100%;
  min-height: 400px;

  &__frame {
    width: 100%;
    height: 100%;
    display: block;
    border: none;
  }
}

.oo-toggle-btn {
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
</style>
