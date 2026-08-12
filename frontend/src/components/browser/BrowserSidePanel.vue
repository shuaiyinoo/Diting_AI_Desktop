<!--
  BrowserSidePanel — 内置浏览器右侧面板

  职责：
  1. 顶部工具栏：地址栏 + 后退/前进/刷新 + 折叠/关闭
  2. 标签栏：浏览器标签列表 + 新建/关闭
  3. Agent 活动状态条：显示最新 Agent 浏览器操作摘要
  4. 网页渲染区：BrowserSlot（WebContentsView 原生占位）
  5. 底部操作账本：最近一条 Agent 操作记录
-->
<template>
  <div class="browser-side-panel">
    <!-- ========== 顶部工具栏 ========== -->
    <div class="bsp-toolbar">
      <GlobalOutlined class="bsp-toolbar__logo" />

      <a-tooltip title="后退">
        <button class="bsp-btn" :disabled="!browserState?.canGoBack" @click="browserStore.goBackDisplay()"><ArrowLeftOutlined /></button>
      </a-tooltip>
      <a-tooltip title="前进">
        <button class="bsp-btn" :disabled="!browserState?.canGoForward" @click="browserStore.goForwardDisplay()"><ArrowRightOutlined /></button>
      </a-tooltip>
      <a-tooltip title="刷新">
        <button class="bsp-btn" :disabled="!browserState" @click="browserStore.reloadDisplay()"><ReloadOutlined /></button>
      </a-tooltip>

      <form class="bsp-toolbar__url-form" @submit.prevent="onNavigate">
        <input
          v-model="urlInput"
          class="bsp-toolbar__url-input"
          placeholder="输入域名或 URL（默认 HTTPS）"
          :disabled="riskBlocked"
        />
        <a-spin v-if="browserState?.loading" size="small" class="bsp-toolbar__loading" />
      </form>

      <a-tooltip title="关闭浏览器">
        <button class="bsp-btn bsp-btn--close" @click="onClose">
          <CloseOutlined />
        </button>
      </a-tooltip>
    </div>

    <!-- ========== 标签栏 ========== -->
    <div class="bsp-tabs">
      <div
        v-for="tab in browserState?.tabs || []"
        :key="tab.tabId"
        class="bsp-tab"
        :class="{ 'bsp-tab--active': tab.tabId === browserState?.activeTabId }"
        @click="browserStore.selectTab(tab.tabId)"
      >
        <GlobalOutlined class="bsp-tab__icon" />
        <span class="bsp-tab__title">{{ tab.title || '新建标签页' }}</span>
        <span v-if="tab.openedByAgent" class="bsp-tab__agent-badge">Agent</span>
        <span class="bsp-tab__close" @click.stop="browserStore.closeTab(tab.tabId)"><CloseOutlined /></span>
      </div>
      <button class="bsp-tab__add" @click="browserStore.createDisplayTab()" title="新建标签">
        <PlusOutlined />
      </button>
    </div>

    <!-- ========== Agent 活动状态条 ========== -->
    <div v-if="browserStore.lastTrace" class="bsp-activity">
      <span class="bsp-activity__badge">Agent</span>
      <span class="bsp-activity__summary">{{ browserStore.lastTrace.summary }}</span>
    </div>

    <!-- ========== 网页渲染区 ========== -->
    <div class="bsp-content">
      <!-- 风险未确认时显示内联风险告知 -->
      <div v-if="riskAcknowledged === false" class="bsp-risk-notice">
        <div class="bsp-risk-notice__icon">
          <SafetyCertificateOutlined />
        </div>
        <h3 class="bsp-risk-notice__title">首次使用受管浏览器</h3>
        <div class="bsp-risk-notice__body">
          <p>Agent 可在浏览器中读取、搜索、点击和输入。</p>
          <p>小红书、X/Twitter、LinkedIn 等平台可能将这些行为识别为自动化活动。</p>
          <p>这可能导致：</p>
          <ul>
            <li>验证码或人机验证</li>
            <li>限流或功能限制</li>
            <li>账号风控，严重时可能造成账号处罚或封禁</li>
          </ul>
        </div>
        <div class="bsp-risk-notice__actions">
          <button class="bsp-risk-notice__btn bsp-risk-notice__btn--primary" @click="browserStore.acceptRisk()">
            我已知悉并承担风险
          </button>
          <button class="bsp-risk-notice__btn bsp-risk-notice__btn--cancel" @click="onClose">
            暂不使用
          </button>
        </div>
      </div>

      <!-- 风险已确认且有标签时渲染 BrowserSlot -->
      <BrowserSlot
        v-else-if="riskAcknowledged === true && browserState?.activeTabId"
        :session-id="browserStore.activeSessionId"
        :tab-id="browserState.activeTabId"
        class="bsp-slot"
      />

      <!-- 无浏览器状态时的占位 -->
      <div v-else class="bsp-placeholder">
        <GlobalOutlined style="font-size: 32px; opacity: 0.3" />
        <p>正在初始化浏览器...</p>
      </div>
    </div>

    <!-- ========== 底部操作账本 ========== -->
    <div v-if="browserStore.lastTrace" class="bsp-trace">
      <span class="bsp-trace__label">Agent 操作</span>
      <span class="bsp-trace__summary">{{ browserStore.lastTrace.summary }}</span>
    </div>
  </div>
</template>

<script setup>
/**
 * BrowserSidePanel 组件
 */
import { ref, computed, watch } from 'vue'
import {
  GlobalOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ReloadOutlined,
  CloseOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons-vue'
import { useBrowserStore } from '@/stores/browser'
import BrowserSlot from './BrowserSlot.vue'

const browserStore = useBrowserStore()

/** 地址栏输入值 */
const urlInput = ref('')

/** 当前浏览器状态（来自 store） */
const browserState = computed(() => browserStore.browserState)

/**
 * 风险告知确认状态：null=未读取, true/false
 */
const riskAcknowledged = computed(() => browserStore.riskAcknowledged)

/** 风险未确认时阻止地址栏 */
const riskBlocked = computed(() => riskAcknowledged.value === false)

/** 当前 URL 同步到地址栏 */
watch(() => browserState.value?.url, (url) => {
  if (url && urlInput.value !== url) {
    urlInput.value = url
  }
}, { immediate: true })

/** 导航（地址栏提交） */
function onNavigate() {
  if (!urlInput.value.trim()) return
  browserStore.navigateDisplay(urlInput.value)
}

/** 关闭浏览器面板 */
function onClose() {
  browserStore.closePanel()
}
</script>

<style lang="less" scoped>
.browser-side-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: var(--bg-panel);
  border-left: 1px solid var(--border-color);
}

// ===== 顶部工具栏 =====
.bsp-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 42px;
  padding: 0 8px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--bg-sidebar);

  &__logo {
    font-size: 16px;
    color: var(--accent);
    margin-right: 4px;
    flex-shrink: 0;
  }

  &__url-form {
    flex: 1 1 0;
    min-width: 0;
    margin: 0 4px;
    position: relative;
    display: flex;
    align-items: center;
  }

  &__loading {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
  }

  &__url-input {
    flex: 1;
    min-width: 0;
    height: 28px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 0 28px 0 10px;
    font-size: 12px;
    color: var(--text-primary);
    background-color: var(--bg-panel);
    outline: none;
    transition: border-color 0.15s;

    &:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.12);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

// ===== 通用按钮 =====
.bsp-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;
  font-size: 13px;
  transition: all 0.15s;
  -webkit-appearance: none;

  &:hover:not(:disabled) {
    background-color: var(--bg-hover);
    color: var(--accent);
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  &--close:hover:not(:disabled) {
    background-color: rgba(255, 77, 79, 0.08);
    color: #ff4d4f;
  }
}

// ===== 标签栏 =====
.bsp-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 32px;
  padding: 0 6px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color-light);
  background-color: var(--bg-panel);
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.bsp-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  min-width: 80px;
  max-width: 160px;
  padding: 0 8px;
  border-radius: 5px;
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
  cursor: pointer;
  transition: background-color 0.15s;

  &:hover {
    background-color: var(--bg-hover);
    color: var(--text-primary);
  }

  &--active {
    background-color: var(--bg-active);
    color: var(--accent);
    font-weight: 500;
  }

  &__icon {
    font-size: 12px;
    flex-shrink: 0;
  }

  &__title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__agent-badge {
    flex-shrink: 0;
    font-size: 9px;
    color: var(--accent);
    background: rgba(22, 119, 255, 0.1);
    padding: 1px 4px;
    border-radius: 3px;
  }

  &__close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border-radius: 3px;
    font-size: 10px;
    opacity: 0.4;
    flex-shrink: 0;
    transition: all 0.15s;

    &:hover {
      opacity: 1;
      background-color: rgba(255, 77, 79, 0.1);
      color: #ff4d4f;
    }
  }

  &__add {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    flex-shrink: 0;
    font-size: 12px;
    transition: all 0.15s;
    -webkit-appearance: none;

    &:hover {
      background-color: var(--bg-hover);
      color: var(--accent);
    }
  }
}

// ===== Agent 活动状态条 =====
.bsp-activity {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color-light);
  background-color: rgba(22, 119, 255, 0.04);
  font-size: 11px;

  &__badge {
    flex-shrink: 0;
    font-weight: 600;
    color: var(--accent);
    font-size: 10px;
    background: rgba(22, 119, 255, 0.1);
    padding: 1px 6px;
    border-radius: 4px;
  }

  &__summary {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-secondary);
  }
}

// ===== 网页渲染区 =====
.bsp-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.bsp-slot {
  height: 100%;
  width: 100%;
}

// ===== 占位内容 =====
.bsp-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  background-color: var(--bg-panel);
  color: var(--text-muted);
  font-size: 12px;
}

// ===== 风险告知内联面板 =====
.bsp-risk-notice {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  padding: 32px 24px;
  overflow-y: auto;
  background-color: var(--bg-panel);
  text-align: center;

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: rgba(250, 173, 20, 0.1);
    margin-bottom: 16px;

    .anticon {
      font-size: 24px;
      color: #faad14;
    }
  }

  &__title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 16px;
  }

  &__body {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.7;
    max-width: 320px;
    margin-bottom: 24px;

    p {
      margin: 0 0 8px;
    }

    ul {
      margin: 4px 0 0;
      padding-left: 20px;
      text-align: left;

      li {
        margin-bottom: 4px;
      }
    }
  }

  &__actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    max-width: 280px;
  }

  &__btn {
    height: 36px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
    -webkit-appearance: none;

    &--primary {
      background: var(--accent);
      color: #fff;
      font-weight: 500;

      &:hover {
        background: var(--accent-hover);
      }
    }

    &--cancel {
      background: transparent;
      color: var(--text-muted);
      border: 1px solid var(--border-color);

      &:hover {
        color: var(--text-primary);
        border-color: var(--text-secondary);
      }
    }
  }
}

// ===== 底部操作账本 =====
.bsp-trace {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  flex-shrink: 0;
  border-top: 1px solid var(--border-color);
  background-color: var(--bg-sidebar);
  font-size: 11px;

  &__label {
    flex-shrink: 0;
    color: var(--accent);
    font-weight: 500;
  }

  &__summary {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-secondary);
  }
}
</style>
