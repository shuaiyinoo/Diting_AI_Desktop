<template>
  <div v-if="delegations.length > 0" class="dc" :class="{ 'dc--expanded': expanded }">
    <Transition name="dc-mode" mode="out-in">
      <!-- ===== 缩小模式 ===== -->
      <button v-if="!expanded" key="collapsed" type="button" class="dc-collapsed" @click="expanded = true">
        <span class="dc-collapsed__count">{{ completedCount }}/{{ totalCount }}</span>
        <span class="dc-collapsed__divider">·</span>
        <span class="dc-collapsed__current">
          <svg v-if="runningCount > 0" class="dc-collapsed__spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          <svg v-else class="dc-collapsed__done" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <path d="M22 4L12 14.01l-3-3" />
          </svg>
          <span class="dc-collapsed__text">
            {{ runningCount > 0 ? `${runningCount} 个子 Agent 运行中` : '全部完成' }}
          </span>
        </span>
        <svg class="dc-collapsed__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 15l-6-6-6 6" />
        </svg>
      </button>

      <!-- ===== 展开模式 ===== -->
      <div v-else key="expanded" class="dc-expanded">
        <!-- 标题行 -->
        <div class="dc-expanded__header">
          <div class="dc-expanded__title-group">
            <svg class="dc-expanded__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m17.5-7.5l-4.24 4.24m-6.52 6.52L3.5 20.5m17-17l-4.24 4.24m-6.52 6.52L3.5 3.5" />
            </svg>
            <span class="dc-expanded__title">协作子 Agent</span>
            <span class="dc-expanded__count">{{ completedCount }}/{{ totalCount }}</span>
          </div>
          <button type="button" class="dc-expanded__collapse" @click="expanded = false" title="缩小">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>

        <!-- 进度条 -->
        <div v-if="totalCount > 1" class="dc-expanded__bar">
          <div class="dc-expanded__bar-fill" :style="{ width: percent + '%' }"></div>
        </div>

        <!-- 子 Agent 列表 -->
        <div class="dc-expanded__list">
          <div
            v-for="item in delegations"
            :key="item.delegationId"
            class="dc-expanded__item"
            :class="'dc-expanded__item--' + item.status"
          >
            <!-- 状态图标 -->
            <span class="dc-expanded__status" :class="'dc-expanded__status--' + item.status">
              <svg v-if="item.status === 'running'" class="dc-expanded__spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              <svg v-else-if="item.status === 'completed'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <path d="M22 4L12 14.01l-3-3" />
              </svg>
              <svg v-else-if="item.status === 'failed'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <svg v-else-if="item.status === 'cancelled'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="9" />
              </svg>
            </span>

            <!-- 内容 -->
            <div class="dc-expanded__content">
              <div class="dc-expanded__item-header">
                <span class="dc-expanded__item-title">{{ item.title }}</span>
                <span v-if="item.role && item.role !== 'custom'" class="dc-expanded__item-role">{{ roleLabels[item.role] || item.role }}</span>
              </div>
              <div v-if="item.status === 'completed' && item.resultSummary" class="dc-expanded__item-result">
                {{ item.resultSummary.length > 200 ? item.resultSummary.slice(0, 200) + '...' : item.resultSummary }}
              </div>
              <div v-else-if="item.status === 'failed' && item.error" class="dc-expanded__item-error">
                {{ item.error }}
              </div>
              <div v-else-if="item.status === 'running'" class="dc-expanded__item-running">
                处理中...
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  delegations: {
    type: Array,
    default: () => [],
  },
})

const expanded = ref(true)

const roleLabels = {
  explore: '探索',
  research: '调研',
  implement: '实现',
  review: '审查',
  custom: '自定义',
}

const totalCount = computed(() => props.delegations.length)
const completedCount = computed(() => props.delegations.filter((d) => d.status === 'completed' || d.status === 'failed' || d.status === 'cancelled').length)
const runningCount = computed(() => props.delegations.filter((d) => d.status === 'running').length)
const percent = computed(() => totalCount.value > 0 ? Math.round((completedCount.value / totalCount.value) * 100) : 0)
</script>

<style lang="less" scoped>
.dc {
  // 与 TaskProgressCard 保持一致：左右各留 20% 边距
  margin: 0 20% 6px;
  border-radius: 10px;
  overflow: visible;
  width: auto;
}

// ===== 缩小模式 =====
.dc-collapsed {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 14px;
  border: 1px solid #52c41a;
  border-radius: 10px;
  background: rgba(255, 255, 255);
  cursor: pointer;
  text-align: left;
  font-size: 12px;
  color: var(--text-secondary);
  transition: box-shadow 0.15s, border-color 0.15s;
  box-shadow: 0 2px 8px rgba(82, 196, 26, 0.1);

  &:hover {
    border-color: #73d13d;
    box-shadow: 0 4px 12px rgba(82, 196, 26, 0.18);
  }

  &__count {
    font-weight: 700;
    color: #52c41a;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
    background: rgba(82, 196, 26, 0.08);
    padding: 2px 7px;
    border-radius: 6px;
  }

  &__divider {
    color: var(--text-muted);
  }

  &__current {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--text-secondary);
    flex: 1;
    min-width: 0;
  }

  &__text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__spinner {
    width: 14px;
    height: 14px;
    animation: dc-spin 1s linear infinite;
    color: #52c41a;
    flex-shrink: 0;
  }

  &__done {
    width: 14px;
    height: 14px;
    color: #52c41a;
    flex-shrink: 0;
  }

  &__chevron {
    width: 16px;
    height: 16px;
    color: var(--text-muted);
    flex-shrink: 0;
  }
}

// ===== 展开模式 =====
.dc-expanded {
  border: 1px solid #52c41a;
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
    background: rgba(82, 196, 26, 0.08);
    border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.06));
    flex-shrink: 0;
  }

  &__title-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__icon {
    width: 16px;
    height: 16px;
    color: #52c41a;
  }

  &__title {
    font-size: 13px;
    font-weight: 600;
    color: #52c41a;
  }

  &__count {
    font-size: 11px;
    color: #52c41a;
    background: rgba(82, 196, 26, 0.08);
    padding: 1px 6px;
    border-radius: 8px;
    font-weight: 600;
  }

  &__collapse {
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--text-muted);
    padding: 2px;
    display: flex;
    align-items: center;

    svg {
      width: 16px;
      height: 16px;
    }

    &:hover {
      color: var(--text-primary);
    }
  }

  &__bar {
    height: 3px;
    background: var(--border-color-light);
    overflow: hidden;

    &-fill {
      height: 100%;
      background: linear-gradient(90deg, #52c41a, #95de64);
      transition: width 0.3s ease;
      border-radius: 0 2px 2px 0;
    }
  }

  &__list {
    padding: 4px 8px 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-height: 300px;
    overflow-y: auto;
  }

  &__item {
    display: flex;
    gap: 8px;
    padding: 8px;
    border-radius: 6px;
    transition: background 0.15s;

    &:hover {
      background: var(--bg-hover);
    }

    &--running {
      background: rgba(82, 196, 26, 0.03);
    }

    &--completed {
      // 默认样式
    }

    &--failed {
      background: rgba(255, 77, 79, 0.04);
    }

    &--cancelled {
      opacity: 0.6;
    }
  }

  &__status {
    flex-shrink: 0;
    margin-top: 1px;

    svg {
      width: 14px;
      height: 14px;
    }

    &--running {
      color: #52c41a;
    }

    &--completed {
      color: #52c41a;
    }

    &--failed {
      color: #ff4d4f;
    }

    &--cancelled {
      color: var(--text-muted);
    }

    &--pending {
      color: var(--text-muted);
    }
  }

  &__spinner {
    animation: dc-spin 1s linear infinite;
  }

  &__content {
    flex: 1;
    min-width: 0;
  }

  &__item-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__item-title {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__item-role {
    font-size: 10px;
    color: #52c41a;
    background: rgba(82, 196, 26, 0.06);
    padding: 1px 5px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  &__item-result {
    font-size: 11px;
    color: var(--text-secondary);
    margin-top: 3px;
    line-height: 1.5;
    word-break: break-all;
    overflow-wrap: break-word;
  }

  &__item-error {
    font-size: 11px;
    color: #ff4d4f;
    margin-top: 3px;
  }

  &__item-running {
    font-size: 11px;
    color: var(--text-muted);
    margin-top: 3px;
  }
}

@keyframes dc-spin {
  to {
    transform: rotate(360deg);
  }
}

// ===== 过渡动画 =====
.dc-mode-enter-active,
.dc-mode-leave-active {
  transition: all 0.2s ease;
}

.dc-mode-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}

.dc-mode-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
