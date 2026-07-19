<template>
  <div class="assistant-sidebar">
    <div class="assistant-sidebar__header">
      <span class="assistant-sidebar__title">会话列表</span>
      <a-button type="primary" size="small" :disabled="disabled" @click="$emit('create')">
        <template #icon><PlusOutlined /></template>
        新会话
      </a-button>
    </div>

    <div class="assistant-sidebar__list">
      <a-spin :spinning="loading">
        <div v-if="sessions.length === 0" class="assistant-sidebar__empty">
          <a-empty description="暂无会话" :image="Empty.PRESENTED_IMAGE_SIMPLE" />
        </div>
        <div
          v-for="session in sessions"
          :key="session.sessionId"
          class="session-item"
          :class="{ 'session-item--active': activeSessionId === session.sessionId }"
          @click="$emit('select', session.sessionId)"
        >
          <div class="session-item__main">
            <div class="session-item__title" :title="session.title">
              {{ session.title || '新会话' }}
            </div>
            <div class="session-item__time">
              {{ formatDateTime(session.lastMessageAt) }}
            </div>
          </div>
          <div class="session-item__actions" @click.stop>
            <a-dropdown placement="bottomRight" :trigger="['click']">
              <button type="button" class="session-item__btn" @click.stop>
                <MoreOutlined />
              </button>
              <template #overlay>
                <a-menu @click="(e) => onMenuClick(e.key, session)">
                  <a-menu-item key="rename">
                    <EditOutlined />
                    <span>重命名</span>
                  </a-menu-item>
                  <a-menu-divider />
                  <a-menu-item key="delete" danger>
                    <DeleteOutlined />
                    <span>删除</span>
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </div>
        </div>
      </a-spin>
    </div>

    <!-- 重命名弹窗 -->
    <a-modal
      v-model:open="renameVisible"
      title="重命名会话"
      :confirm-loading="renameLoading"
      @ok="onRenameConfirm"
      @cancel="onRenameCancel"
    >
      <a-input
        v-model:value="renameText"
        placeholder="请输入会话名称"
        :maxlength="50"
        @pressEnter="onRenameConfirm"
      />
    </a-modal>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { Empty, message } from 'ant-design-vue';
import {
  PlusOutlined,
  MoreOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons-vue';

defineProps({
  sessions: {
    type: Array,
    default: () => [],
  },
  activeSessionId: {
    type: Number,
    default: null,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['create', 'select', 'rename', 'delete']);

// 重命名状态
const renameVisible = ref(false);
const renameText = ref('');
const renameLoading = ref(false);
const renameTarget = ref(null);

function onMenuClick(key, session) {
  if (key === 'rename') {
    renameTarget.value = session;
    renameText.value = session.title || '新会话';
    renameVisible.value = true;
  } else if (key === 'delete') {
    onDelete(session);
  }
}

function onRenameConfirm() {
  if (!renameTarget.value) return;
  const title = renameText.value.trim();
  if (!title) {
    message.warning('会话名称不能为空');
    return;
  }
  renameLoading.value = true;
  emit('rename', { sessionId: renameTarget.value.sessionId, title });
  renameLoading.value = false;
  renameVisible.value = false;
  renameTarget.value = null;
}

function onRenameCancel() {
  renameVisible.value = false;
  renameTarget.value = null;
  renameText.value = '';
}

function onDelete(session) {
  // 简单确认：使用 Modal.confirm
  // 注意：此处不直接弹窗，由父组件处理确认逻辑
  emit('delete', session.sessionId);
}

function formatDateTime(time) {
  if (!time) return '';
  const d = new Date(time);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const pad = (n) => String(n).padStart(2, '0');
  if (isToday) {
    return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
</script>

<style lang="less" scoped>
.assistant-sidebar {
  width: 260px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;
  height: 100%;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid #f0f0f0;
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: #2c3e50;
  }

  &__list {
    flex: 1;
    overflow-y: auto;
    padding: 6px;

    &::-webkit-scrollbar {
      width: 6px;
    }
    &::-webkit-scrollbar-thumb {
      background: #d9d9d9;
      border-radius: 3px;
    }
  }

  &__empty {
    padding: 40px 0;
    display: flex;
    justify-content: center;
  }
}

.session-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
  margin-bottom: 2px;

  &:hover {
    background: #f5f6f8;

    .session-item__actions {
      opacity: 1;
    }
  }

  &--active {
    background: #e6f4ff;

    .session-item__title {
      color: #1677ff;
      font-weight: 500;
    }
  }

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__title {
    font-size: 13px;
    color: #262626;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.4;
  }

  &__time {
    font-size: 11px;
    color: #bfbfbf;
    margin-top: 2px;
  }

  &__actions {
    opacity: 0;
    transition: opacity 0.2s;
    flex-shrink: 0;
  }

  &__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    border-radius: 4px;
    color: #8c8c8c;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: #e8e8e8;
      color: #595959;
    }
  }
}
</style>
