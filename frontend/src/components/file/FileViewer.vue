<template>
  <div class="file-viewer-wrapper">
    <!-- 加载中 -->
    <div v-if="loading" class="file-viewer-wrapper__state">
      <a-spin size="large" tip="正在加载文件..." />
    </div>

    <!-- 加载失败 -->
    <div v-else-if="error" class="file-viewer-wrapper__state">
      <a-result status="error" :title="error">
        <template #extra>
          <a-button type="primary" @click="loadFile">重试</a-button>
        </template>
      </a-result>
    </div>

    <!-- 文件查看器 -->
    <div v-else-if="fileData" class="file-viewer-wrapper__viewer">
      <FileViewerFull
        :file="fileData"
        :name="fileName"
        :options="viewerOptions"
        @load-complete="onLoadComplete"
        @unload-complete="onUnloadComplete"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed, onMounted } from 'vue';
import { FileViewer } from '@file-viewer/vue3-full';
import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';

// 为 FileViewerFull 起一个更清晰的别名
const FileViewerFull = FileViewer;

const props = defineProps({
  /** 文件项 ID（通过 IPC 从主进程读取文件内容） */
  fileItemId: {
    type: [Number, String],
    default: null,
  },
  /** 主题：light / dark / system */
  theme: {
    type: String,
    default: 'light',
  },
  /** 是否显示工具栏 */
  toolbar: {
    type: Boolean,
    default: true,
  },
});

const emit = defineEmits(['loaded', 'error']);

// ========== 状态 ==========
const loading = ref(false);
const error = ref('');
const fileData = ref(null);
const fileName = ref('');

// ========== FileViewer 配置 ==========
const viewerOptions = computed(() => ({
  theme: props.theme,
  toolbar: props.toolbar,
  // 使用 shadow 隔离，避免宿主样式污染预览器
  styleIsolation: 'shadow',
}));

// ========== 加载文件 ==========
async function loadFile() {
  if (!props.fileItemId) {
    error.value = '缺少文件 ID';
    return;
  }

  loading.value = true;
  error.value = '';
  fileData.value = null;

  try {
    const result = await ipc.invoke(ipcApiRoute.file.getFileData, {
      fileItemId: Number(props.fileItemId),
    });

    if (!result || !result.success) {
      error.value = result?.message || '加载文件失败';
      emit('error', error.value);
      return;
    }

    // IPC 传输的 Buffer 在渲染进程中被序列化为 Uint8Array
    // 将其转为 ArrayBuffer 再包装成 File 对象
    const uint8 = result.buffer;
    const arrayBuffer = uint8 instanceof Uint8Array
      ? uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength)
      : new ArrayBuffer(0);

    fileName.value = result.name || '未命名文件';
    fileData.value = new File([arrayBuffer], fileName.value, {
      type: result.type || '',
    });

    emit('loaded', { name: fileName.value, size: result.size });
  } catch (err) {
    console.error('[FileViewer] 加载文件失败:', err);
    error.value = err?.message || '加载文件时发生异常';
    emit('error', error.value);
  } finally {
    loading.value = false;
  }
}

// ========== 事件回调 ==========
function onLoadComplete(context) {
  console.log('[FileViewer] 文件加载完成:', context?.filename);
}

function onUnloadComplete(context) {
  console.log('[FileViewer] 文件卸载完成:', context?.reason);
}

// ========== 监听 fileItemId 变化 ==========
watch(
  () => props.fileItemId,
  (newVal) => {
    if (newVal) {
      loadFile();
    }
  }
);

onMounted(() => {
  if (props.fileItemId) {
    loadFile();
  }
});
</script>

<style lang="less" scoped>
.file-viewer-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  background: var(--bg-panel, #f5f7fa);

  &__state {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
  }

  &__viewer {
    width: 100%;
    height: 100%;
  }
}
</style>
