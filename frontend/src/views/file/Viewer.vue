<template>
  <div id="file-viewer-page" class="w-screen h-screen flex flex-col overflow-hidden bg-card">
    <!-- 顶部信息栏 -->
    <div class="flex-shrink-0 flex items-center justify-between px-5 py-2.5 bg-card border-b border-border shadow-sm z-10">
      <div class="flex items-center gap-2 text-[15px] font-medium text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
        <FileText class="size-4 text-primary" />
        <span>{{ fileInfo.name || t('fileModule.viewer.title') }}</span>
      </div>
      <div class="flex items-center gap-4 text-xs text-muted-foreground flex-shrink-0">
        <span v-if="fileInfo.size" class="whitespace-nowrap">{{ formatSize(fileInfo.size) }}</span>
        <span v-if="fileInfo.type" class="whitespace-nowrap">{{ fileInfo.type }}</span>
      </div>
    </div>

    <!-- 文件查看器主体 -->
    <div class="flex-1 overflow-hidden relative">
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
import { useI18n } from 'vue-i18n';
import { FileText } from '@lucide/vue';
import FileViewer from '@/components/file/FileViewer.vue';
import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';

const { t } = useI18n();

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
