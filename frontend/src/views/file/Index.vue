<template>
  <div id="file-index" class="page-container">
    <a-row :gutter="16" class="file-row">
      <!-- 左侧 -->
      <a-col :span="7" class="file-left">
        <!-- 上半部分：授权文件夹列表 -->
        <div class="panel panel--top">
          <div class="panel__header">
            <span class="panel__title">授权文件夹</span>
            <a-button type="primary" size="small" :loading="addFolderLoading" @click="onAddFolder">
              <template #icon><plus-outlined /></template>
              添加
            </a-button>
          </div>
          <div class="panel__body">
            <a-list
              :data-source="folderList"
              :loading="folderLoading"
              class="folder-list"
            >
              <template #renderItem="{ item }">
                <a-list-item
                  class="folder-list__item"
                  :class="{ 'folder-list__item--active': selectedFolderId === item.id }"
                  @click="onSelectFolder(item)"
                >
                  <div class="folder-card">
                    <div class="folder-card__path">
                      <folder-outlined class="folder-card__icon" />
                      <span class="folder-card__path-text" :title="item.path">{{ item.path }}</span>
                    </div>
                    <div class="folder-card__meta">
                      <span class="folder-card__time">
                        <clock-circle-outlined />
                        {{ item.add_time }}
                      </span>
                      <a-tag
                        :color="item.sync_enabled ? 'green' : 'default'"
                        class="folder-card__sync-tag"
                      >
                        {{ item.sync_enabled ? '同步中' : '未同步' }}
                      </a-tag>
                    </div>
                  </div>
                </a-list-item>
              </template>
              <template #emptyText>
                <a-empty description="暂无文件夹，请点击添加" />
              </template>
            </a-list>
          </div>
        </div>

        <!-- 下半部分：子文件夹树形表格 -->
        <div class="panel panel--bottom">
          <div class="panel__header">
            <span class="panel__title">文件夹列表</span>
            <a-tooltip v-if="selectedFolder">
              <template #title>{{ selectedFolder.path }}</template>
              <span class="panel__subtitle">{{ selectedFolder.path }}</span>
            </a-tooltip>
          </div>
          <div class="panel__body">
            <div v-if="!selectedFolder" class="sub-folder-empty">
              <a-empty description="请先选择授权文件夹" />
            </div>
            <a-table
              v-else
              :columns="subFolderColumns"
              :data-source="subFolderTree"
              :loading="subFolderLoading"
              row-key="id"
              :defaultExpandAllRows="true"
              :customRow="subFolderCustomRow"
              :rowClassName="subFolderRowClass"
              size="small"
              :pagination="false"
              class="sub-folder-table"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'name'">
                  <folder-outlined class="sub-folder-icon" />
                  <span>{{ record.name }}</span>
                </template>
                <template v-else-if="column.dataIndex === 'size'">
                  {{ formatFileSize(record.size) }}
                </template>
              </template>
            </a-table>
          </div>
        </div>
      </a-col>

      <!-- 右侧：文件信息表格 -->
      <a-col :span="17" class="file-right">
        <div class="panel">
          <div class="panel__header">
            <span class="panel__title">文件详情</span>
            <a-space v-if="selectedSubFolder">
              <a-tooltip>
                <template #title>{{ selectedSubFolder.relative_path }}</template>
                <span class="panel__subtitle">{{ selectedSubFolder.name }}</span>
              </a-tooltip>
              <a-button size="small" @click="onRefreshFiles">
                <template #icon><reload-outlined /></template>
                刷新
              </a-button>
            </a-space>
          </div>
          <div class="panel__body">
            <div v-if="!selectedSubFolder" class="file-empty">
              <a-empty :description="fileEmptyText" />
            </div>
            <a-table
              v-else
              :columns="fileColumns"
              :data-source="fileList"
              :loading="fileLoading"
              :pagination="{ pageSize: 10, showSizeChanger: true }"
              row-key="name"
              size="middle"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'size'">
                  {{ formatFileSize(record.size) }}
                </template>
                <template v-else-if="column.dataIndex === 'type'">
                  <a-tag>{{ record.type }}</a-tag>
                </template>
                <template v-else-if="column.dataIndex === 'action'">
                  <a-space>
                    <a-button type="link" size="small" @click="onFileAction('view', record)">查看</a-button>
                    <a-button type="link" size="small" danger @click="onFileAction('delete', record)">删除</a-button>
                  </a-space>
                </template>
              </template>
            </a-table>
          </div>
        </div>
      </a-col>
    </a-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { message } from 'ant-design-vue';
import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';

// ========== 上半部分：授权文件夹列表 ==========
const folderList = ref([]);
const folderLoading = ref(false);
const selectedFolderId = ref(null);
const selectedFolder = ref(null);
const addFolderLoading = ref(false);

// ========== 下半部分：子文件夹树形表格 ==========
const subFolderTree = ref([]);
const subFolderLoading = ref(false);
const selectedSubFolder = ref(null);

const subFolderColumns = [
  { title: '文件夹名称', dataIndex: 'name', ellipsis: true },
  { title: '文件数', dataIndex: 'fileCount', width: 70, align: 'center' },
  { title: '大小', dataIndex: 'size', width: 90 },
];

// ========== 右侧：文件表格 ==========
const fileList = ref([]);
const fileLoading = ref(false);

const fileColumns = [
  { title: '文件名称', dataIndex: 'name', ellipsis: true },
  { title: '文件大小', dataIndex: 'size', width: 120 },
  { title: '文件类型', dataIndex: 'type', width: 100 },
  { title: '修改时间', dataIndex: 'mtime', width: 180 },
  { title: '操作', dataIndex: 'action', width: 160, fixed: 'right' },
];

const fileEmptyText = computed(() => {
  if (!selectedFolder.value) return '请从上方选择授权文件夹';
  return '请从左侧树形列表选择一个文件夹';
});

// ========== 页面初始化 ==========
onMounted(() => {
  loadFolderList();
  // 注册文件变化监听
  registerSyncChange();
});

onUnmounted(() => {
  // 移除文件变化监听
  ipc.removeAllListeners(ipcApiRoute.file.onSyncChange);
});

// 注册文件变化监听
function registerSyncChange() {
  // 先注册回调（主进程会通过此通道推送变化）
  ipc.invoke(ipcApiRoute.file.registerSyncCallback).catch(() => {});
  // 监听变化通知
  ipc.on(ipcApiRoute.file.onSyncChange, (event, result) => {
    const { folderId } = result;
    // 如果当前选中的就是变化的文件夹，刷新数据
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
    // 如果有数据，自动选中第一项
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

// ========== 交互函数 ==========

// 添加文件夹
async function onAddFolder() {
  addFolderLoading.value = true;
  try {
    const result = await ipc.invoke(ipcApiRoute.file.addFolder);
    if (result.success) {
      message.success('文件夹添加成功');
      folderList.value = result.folderList || [];
      // 自动选中新添加的文件夹
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

// 选中授权文件夹 → 加载子文件夹树
function onSelectFolder(item) {
  selectedFolderId.value = item.id;
  selectedFolder.value = item;
  selectedSubFolder.value = null;
  subFolderTree.value = [];
  fileList.value = [];
  loadSubFolderTree(item.id);
}

// 加载子文件夹树形数据
async function loadSubFolderTree(folderId) {
  subFolderLoading.value = true;
  try {
    const data = await ipc.invoke(ipcApiRoute.file.getSubFolders, { folderId });
    subFolderTree.value = data || [];
    // 默认选中第一个根文件夹
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

// 树形表格行点击 → 选中子文件夹
function subFolderCustomRow(record) {
  return {
    onClick: () => onSelectSubFolder(record),
    style: { cursor: 'pointer' },
  };
}

// 树形表格行样式
function subFolderRowClass(record) {
  return selectedSubFolder.value?.id === record.id ? 'sub-folder-row--active' : '';
}

// 选中子文件夹 → 加载右侧文件列表
function onSelectSubFolder(record) {
  selectedSubFolder.value = record;
  fileList.value = [];
  loadFileList();
}

// 加载文件列表
async function loadFileList() {
  if (!selectedFolder.value || !selectedSubFolder.value) return;
  fileLoading.value = true;
  try {
    const data = await ipc.invoke(ipcApiRoute.file.getFiles, {
      folderId: selectedFolder.value.id,
      itemId: selectedSubFolder.value.id,
    });
    fileList.value = data || [];
  } catch (err) {
    console.error('[file] 加载文件列表失败:', err);
    message.error('加载文件列表失败');
  } finally {
    fileLoading.value = false;
  }
}

// 刷新文件列表
function onRefreshFiles() {
  loadFileList();
}

// 文件操作
function onFileAction(action, record) {
  if (action === 'view') {
    message.info(`查看文件: ${record.name}`);
  } else if (action === 'delete') {
    message.info(`删除文件: ${record.name}`);
  }
}

// 格式化文件大小
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
#file-index {
  .file-row {
    height: 100%;
    margin: 0 !important;
  }

  .file-left,
  .file-right {
    height: 100%;
  }

  // 左侧垂直拆分
  .file-left {
    display: flex;
    flex-direction: column;
    gap: 12px;

    .panel--top {
      flex: 0 0 40%;
      min-height: 0;
    }

    .panel--bottom {
      flex: 1;
      min-height: 0;
    }
  }

  // 通用面板样式
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: #ffffff;
    border: 1px solid #e8e8e8;
    border-radius: 12px;
    overflow: hidden;

    &__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid #f0f0f0;
      flex-shrink: 0;
    }

    &__title {
      font-size: 14px;
      font-weight: 600;
      color: #2c3e50;
      flex-shrink: 0;
    }

    &__subtitle {
      font-size: 12px;
      color: #999999;
      max-width: 180px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__body {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
      min-height: 0;
    }
  }

  // 上半部分：授权文件夹列表
  .folder-list {
    :deep(.ant-list-item) {
      padding: 0 !important;
      margin-bottom: 8px;
      border-radius: 8px !important;
      border: 1px solid #f0f0f0 !important;
      cursor: pointer;
      transition: all 0.25s ease;

      &:hover {
        border-color: #1677ff !important;
        box-shadow: 0 2px 8px rgba(22, 119, 255, 0.1);
      }
    }

    .folder-list__item--active {
      :deep(&.ant-list-item) {
        border-color: #1677ff !important;
        background-color: rgba(22, 119, 255, 0.04);
        box-shadow: 0 2px 8px rgba(22, 119, 255, 0.12);
      }
    }
  }

  .folder-card {
    padding: 10px 12px;
    width: 100%;

    &__path {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }

    &__icon {
      color: #1677ff;
      font-size: 16px;
      flex-shrink: 0;
    }

    &__path-text {
      font-size: 13px;
      font-weight: 500;
      color: #2c3e50;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-left: 22px;
    }

    &__time {
      font-size: 12px;
      color: #999999;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    &__sync-tag {
      margin: 0;
      font-size: 12px;
    }
  }

  // 下半部分：子文件夹树形表格
  .sub-folder-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }

  .sub-folder-table {
    :deep(.ant-table) {
      font-size: 13px;
    }

    :deep(.ant-table-thead .ant-table-cell) {
      padding: 8px 8px !important;
      font-size: 12px;
    }

    :deep(.ant-table-tbody .ant-table-cell) {
      padding: 6px 8px !important;
    }

    // 选中行高亮
    :deep(.sub-folder-row--active > .ant-table-cell) {
      background-color: rgba(22, 119, 255, 0.06) !important;
    }

    :deep(.sub-folder-row--active:hover > .ant-table-cell) {
      background-color: rgba(22, 119, 255, 0.1) !important;
    }

    :deep(.ant-table-row) {
      cursor: pointer;
      transition: background-color 0.2s ease;

      &:hover > .ant-table-cell {
        background-color: rgba(22, 119, 255, 0.04) !important;
      }
    }
  }

  .sub-folder-icon {
    color: #1677ff;
    margin-right: 6px;
  }

  // 右侧空状态
  .file-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 300px;
  }
}
</style>
