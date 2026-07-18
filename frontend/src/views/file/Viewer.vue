<template>
  <div id="file-viewer-page" class="file-viewer-page">
    <!-- 顶部信息栏 -->
    <div class="file-viewer-page__header">
      <div class="file-viewer-page__title">
        <file-outlined class="file-viewer-page__icon" />
        <span>{{ fileInfo.name || '文件查看' }}</span>
      </div>
      <div class="file-viewer-page__meta">
        <span v-if="fileInfo.size" class="file-viewer-page__meta-item">
          {{ formatSize(fileInfo.size) }}
        </span>
        <span v-if="fileInfo.type" class="file-viewer-page__meta-item">
          {{ fileInfo.type }}
        </span>
      </div>
    </div>

    <!-- 文件查看器主体 -->
    <div class="file-viewer-page__body">
      <FileViewer
        :file-item-id="fileItemId"
        @loaded="onFileLoaded"
        @error="onFileError"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import FileViewer from '@/components/file/FileViewer.vue';
import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';

const route = useRoute();

// 从路由查询参数获取 fileItemId
const fileItemId = computed(() => {
  const id = route.query.fileItemId;
  if (!id) return null;
  return Array.isArray(id) ? id[0] : id;
});

// 文件信息（用于顶部栏显示）
const fileInfo = ref({
  name: '',
  size: 0,
  type: '',
});

// 预加载文件信息（用于标题栏）
async function loadFileInfo() {
  if (!fileItemId.value) return;
  try {
    const result = await ipc.invoke(ipcApiRoute.file.getFileInfo, {
      fileItemId: Number(fileItemId.value),
    });
    if (result && result.success) {
      fileInfo.value = {
        name: result.name || '',
        size: result.size || 0,
        type: result.type || '',
      };
    }
  } catch (err) {
    console.error('[FileViewerPage] 获取文件信息失败:', err);
  }
}

// 格式化文件大小
function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function onFileLoaded(info) {
  fileInfo.value.name = info.name || fileInfo.value.name;
  fileInfo.value.size = info.size || fileInfo.value.size;
  console.log('[FileViewerPage] 文件加载完成:', info);
}

function onFileError(errMsg) {
  console.error('[FileViewerPage] 文件加载失败:', errMsg);
}

// 页面加载时获取文件信息
loadFileInfo();
</script>

<style lang="less" scoped>
.file-viewer-page {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;

  &__header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 20px;
    background: #fff;
    border-bottom: 1px solid #e8e8e8;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
    z-index: 10;
  }

  &__title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 500;
    color: #1f1f1f;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__icon {
    color: #1890ff;
    font-size: 16px;
  }

  &__meta {
    display: flex;
    align-items: center;
    gap: 16px;
    font-size: 12px;
    color: #999;
    flex-shrink: 0;
  }

  &__meta-item {
    white-space: nowrap;
  }

  &__body {
    flex: 1;
    overflow: hidden;
    position: relative;
  }
}
</style>
