<template>
  <div v-if="items.length > 0" class="tpc" :class="{ 'tpc--expanded': expanded }">
    <Transition name="tpc-mode" mode="out-in">
    <!-- ===== 缩小模式 ===== -->
    <button v-if="!expanded" key="collapsed" type="button" class="tpc-collapsed" @click="expanded = true">
      <span class="tpc-collapsed__count">{{ completedCount }}/{{ totalCount }}</span>
      <span class="tpc-collapsed__divider">·</span>
      <span class="tpc-collapsed__current">
        <svg v-if="currentTask?.status === 'in_progress'" class="tpc-collapsed__spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <svg v-else-if="currentTask?.status === 'completed'" class="tpc-collapsed__done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <path d="M22 4L12 14.01l-3-3" />
        </svg>
        <span class="tpc-collapsed__text">{{ currentTaskText }}</span>
      </span>
      <svg class="tpc-collapsed__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>

    <!-- ===== 展开模式 ===== -->
    <div v-else key="expanded" class="tpc-expanded">
      <!-- 标题行 -->
      <div class="tpc-expanded__header">
        <div class="tpc-expanded__title-group">
          <svg class="tpc-expanded__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
          <span class="tpc-expanded__title">任务进度</span>
          <span class="tpc-expanded__count">{{ completedCount }}/{{ totalCount }}</span>
        </div>
        <button type="button" class="tpc-expanded__collapse" @click="expanded = false" title="缩小">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      <!-- 进度条 -->
      <div v-if="totalCount > 1" class="tpc-expanded__bar">
        <div class="tpc-expanded__bar-fill" :style="{ width: percent + '%' }"></div>
      </div>

      <!-- 任务列表 -->
      <div class="tpc-expanded__list">
        <div
          v-for="item in items"
          :key="item.id"
          class="tpc-expanded__item"
          :class="itemRowClass(item)"
        >
          <span class="tpc-expanded__status" :class="'tpc-expanded__status--' + item.status">
            <svg v-if="item.status === 'pending'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
            </svg>
            <svg v-else-if="item.status === 'in_progress'" class="tpc-expanded__spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <svg v-else-if="item.status === 'completed'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <path d="M22 4L12 14.01l-3-3" />
            </svg>
            <svg v-else-if="item.status === 'blocked'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </span>
          <span class="tpc-expanded__text" :class="textClass(item)">
            {{ item.status === 'in_progress' && item.activeForm ? item.activeForm : item.subject }}
          </span>
        </div>
      </div>
    </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { aggregateTaskItems } from '@/utils/task-progress'

const props = defineProps({
  blocks: { type: Array, default: () => [] },
  isStreaming: { type: Boolean, default: false },
})

const expanded = ref(false)

// 自动展开：首次检测到任务块时展开
let wasEmpty = true
const items = computed(() => {
  const result = aggregateTaskItems(props.blocks, !props.isStreaming)
  if (result.length === 0) {
    wasEmpty = true
    expanded.value = false
  } else if (wasEmpty && result.length > 0) {
    expanded.value = true
    wasEmpty = false
  }
  return result
})

const totalCount = computed(() => items.value.length)
const completedCount = computed(() => items.value.filter((t) => t.status === 'completed').length)
const percent = computed(() => totalCount.value === 0 ? 0 : Math.round((completedCount.value / totalCount.value) * 100))

// 当前正在执行的任务（in_progress 优先，否则取最后一个未完成）
const currentTask = computed(() => {
  const inProgress = items.value.find((t) => t.status === 'in_progress')
  if (inProgress) return inProgress
  const pending = items.value.find((t) => t.status === 'pending')
  return pending ?? items.value[items.value.length - 1]
})

const currentTaskText = computed(() => {
  const t = currentTask.value
  if (!t) return ''
  return t.status === 'in_progress' && t.activeForm ? t.activeForm : t.subject
})

function itemRowClass(item) {
  return {
    'tpc-expanded__item--completed': item.status === 'completed',
    'tpc-expanded__item--cancelled': item.status === 'cancelled',
    'tpc-expanded__item--current': item.status === 'in_progress',
  }
}

function textClass(item) {
  return {
    'tpc-expanded__text--done': item.status === 'completed' || item.status === 'cancelled',
    'tpc-expanded__text--error': item.status === 'error',
    'tpc-expanded__text--active': item.status === 'in_progress',
    'tpc-expanded__text--muted': !['completed', 'cancelled', 'error', 'in_progress'].includes(item.status),
  }
}
</script>

<style lang="less" scoped>
.tpc {
  // 两种模式宽度都与权限弹窗一致
  margin: 0 20%;
}

// 模式切换动画
.tpc-mode-enter-active {
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.tpc-mode-leave-active {
  transition: all 0.18s cubic-bezier(0.4, 0, 1, 1);
}
.tpc-mode-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}
.tpc-mode-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

// ===== 缩小模式 =====
.tpc-collapsed {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 14px;
  border: 1px solid #1677ff;
  border-radius: 10px;
  background: rgba(255, 255, 255);
  cursor: pointer;
  text-align: left;
  transition: box-shadow 0.15s, border-color 0.15s;
  box-shadow: 0 2px 8px rgba(22, 119, 255, 0.1);

  &:hover {
    border-color: #4096ff;
    box-shadow: 0 4px 12px rgba(22, 119, 255, 0.18);
  }

  &__count {
    font-size: 12px;
    font-weight: 700;
    color: #1677ff;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
    background: rgba(22, 119, 255, 0.08);
    padding: 2px 7px;
    border-radius: 6px;
  }

  &__divider {
    color: var(--text-muted, #bbb);
    flex-shrink: 0;
  }

  &__current {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    flex: 1;
  }

  &__spinner {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    color: #1677ff;
    animation: tpc-spin 1s linear infinite;
  }

  &__done {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    color: #52c41a;
  }

  &__text {
    font-size: 13px;
    color: var(--text-primary, #333);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  &__chevron {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--text-muted, #bbb);
    transition: transform 0.2s;
  }
}

// ===== 展开模式 =====
.tpc-expanded {
  border: 1px solid #1677ff;
  border-radius: 10px;
  background: var(--bg-panel, #fff);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 300px;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: rgba(22, 119, 255, 0.08);
    border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.06));
    flex-shrink: 0;
  }

  &__title-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__icon {
    width: 14px;
    height: 14px;
    color: #1677ff;
    flex-shrink: 0;
  }

  &__title {
    font-size: 13px;
    font-weight: 600;
    color: #1677ff;
  }

  &__count {
    font-size: 11px;
    color: #1677ff;
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
  }

  &__collapse {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: none;
    border-radius: 5px;
    background: transparent;
    cursor: pointer;
    color: var(--text-muted, #999);
    transition: background 0.15s, color 0.15s;

    &:hover {
      background: var(--bg-hover, rgba(0,0,0,0.06));
      color: var(--text-primary, #333);
    }

    svg {
      width: 14px;
      height: 14px;
    }
  }

  &__bar {
    height: 2px;
    background: var(--border-color, rgba(0,0,0,0.06));
    flex-shrink: 0;
    overflow: hidden;

    &-fill {
      height: 100%;
      background: #1677ff;
      transition: width 0.4s ease-out;
    }
  }

  &__list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;

    &::-webkit-scrollbar {
      width: 4px;
    }
    &::-webkit-scrollbar-thumb {
      background: var(--border-color, rgba(0,0,0,0.15));
      border-radius: 2px;
    }
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    font-size: 13px;
    transition: opacity 0.2s;

    &--completed { opacity: 0.45; }
    &--cancelled { opacity: 0.35; }
    &--current {
      background: rgba(22, 119, 255, 0.04);
    }
  }

  &__status {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    flex-shrink: 0;

    svg {
      width: 14px;
      height: 14px;
    }

    &--pending svg { color: var(--text-muted, #ccc); }
    &--in_progress svg { color: #1677ff; }
    &--in_progress .tpc-expanded__spinner { animation: tpc-spin 1s linear infinite; }
    &--completed svg { color: #52c41a; }
    &--blocked svg { color: #faad14; }
    &--cancelled svg { color: var(--text-muted, #999); }
    &--error svg { color: #ff4d4f; }
  }

  &__spinner {
    animation: tpc-spin 1s linear infinite;
  }

  &__text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    &--done {
      color: var(--text-muted, #999);
      text-decoration: line-through;
    }
    &--error { color: #ff4d4f; }
    &--active { color: var(--text-primary, #333); font-weight: 500; }
    &--muted { color: var(--text-muted, #999); }
  }
}

@keyframes tpc-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
