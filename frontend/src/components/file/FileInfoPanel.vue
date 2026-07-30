<template>
  <div class="file-info-panel">
    <div class="file-info-panel__header">
      <span class="file-info-panel__title">文件信息</span>
    </div>

    <div class="file-info-panel__body">
      <div v-if="!file" class="file-info-panel__empty">
        <a-empty description="未选择文件" />
      </div>
      <div v-else class="file-info-panel__content">
        <div class="info-row">
          <span class="info-row__label">文件名</span>
          <span class="info-row__value" :title="file.name">{{ file.name }}</span>
        </div>
        <div class="info-row">
          <span class="info-row__label">大小</span>
          <span class="info-row__value">{{ formatFileSize(file.size) }}</span>
        </div>
        <div class="info-row">
          <span class="info-row__label">类型</span>
          <span class="info-row__value">
            <a-tag v-if="file.type" :bordered="false">{{ file.type }}</a-tag>
            <span v-else>-</span>
          </span>
        </div>
        <div class="info-row">
          <span class="info-row__label">修改时间</span>
          <span class="info-row__value">{{ formatDateTime(file.mtime) }}</span>
        </div>
        <div class="info-row">
          <span class="info-row__label">状态</span>
          <span class="info-row__value">
            <a-tag :color="statusTag.color" :bordered="false">{{ statusTag.text }}</a-tag>
          </span>
        </div>
        <div class="info-row" v-if="file.path">
          <span class="info-row__label">路径</span>
          <span class="info-row__value info-row__value--path" :title="file.path">{{ file.path }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  file: { type: Object, default: null },
  statusTag: { type: Object, default: () => ({ color: 'default', text: '-' }) },
});

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

function formatDateTime(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
</script>

<style lang="less" scoped>
.file-info-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--bg-panel);
  border: none;
  border-radius: 0;
  overflow: hidden;

  &__header {
    display: flex;
    align-items: center;
    padding: 0 14px;
    height: 40px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-color);
  }

  &__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    padding: 12px 14px;
  }

  &__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }

  &__content {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
}

.info-row {
  display: flex;
  flex-direction: column;
  gap: 4px;

  &__label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  &__value {
    font-size: 13px;
    color: var(--text-primary);
    word-break: break-all;
    line-height: 1.5;

    &--path {
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 12px;
      color: var(--text-secondary);
    }
  }
}
</style>
