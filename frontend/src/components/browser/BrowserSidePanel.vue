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
  <div class="flex h-full w-full flex-col overflow-hidden border-l border-border bg-card">
    <!-- ========== 顶部工具栏 ========== -->
    <div class="flex h-[42px] shrink-0 items-center gap-1 border-b border-border bg-sidebar px-2">
      <Globe class="size-4 shrink-0 text-primary" />

      <Tooltip :title="t('browser.back')">
        <Button variant="ghost" size="icon" class="size-7 text-muted-foreground hover:text-primary disabled:opacity-35 disabled:cursor-not-allowed" :disabled="!browserState?.canGoBack" @click="browserStore.goBackDisplay()"><ArrowLeft class="size-3.5" /></Button>
      </Tooltip>
      <Tooltip :title="t('browser.forward')">
        <Button variant="ghost" size="icon" class="size-7 text-muted-foreground hover:text-primary disabled:opacity-35 disabled:cursor-not-allowed" :disabled="!browserState?.canGoForward" @click="browserStore.goForwardDisplay()"><ArrowRight class="size-3.5" /></Button>
      </Tooltip>
      <Tooltip :title="t('browser.refresh')">
        <Button variant="ghost" size="icon" class="size-7 text-muted-foreground hover:text-primary disabled:opacity-35 disabled:cursor-not-allowed" :disabled="!browserState" @click="browserStore.reloadDisplay()"><RefreshCw class="size-3.5" /></Button>
      </Tooltip>

      <form class="relative mx-1 flex flex-1 min-w-0 items-center" @submit.prevent="onNavigate">
        <Input
          v-model="urlInput"
          class="h-7 w-full rounded-md border-border bg-card pr-7 text-xs focus:border-primary focus:ring-primary/10 disabled:opacity-50 disabled:cursor-not-allowed"
          :placeholder="t('browser.urlPlaceholder')"
          :disabled="riskBlocked"
        />
        <Spinner v-if="browserState?.loading" size="small" class="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
      </form>

      <Tooltip :title="t('browser.closeBrowser')">
        <Button variant="ghost" size="icon" class="size-7 text-muted-foreground hover:bg-red-500/10 hover:text-red-500" @click="onClose">
          <X class="size-3.5" />
        </Button>
      </Tooltip>
    </div>

    <!-- ========== 标签栏 ========== -->
    <div class="flex h-8 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border/50 bg-card px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div
        v-for="tab in browserState?.tabs || []"
        :key="tab.tabId"
        class="flex h-6 min-w-[80px] max-w-[160px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[5px] px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        :class="tab.tabId === browserState?.activeTabId ? 'bg-accent font-medium text-primary' : ''"
        @click="browserStore.selectTab(tab.tabId)"
      >
        <Globe class="size-3 shrink-0" />
        <span class="flex-1 min-w-0 truncate">{{ tab.title || t('browser.newTab') }}</span>
        <span v-if="tab.openedByAgent" class="shrink-0 rounded bg-primary/10 px-1 text-[9px] text-primary">Agent</span>
        <span class="flex size-3.5 shrink-0 items-center justify-center rounded-[3px] text-[10px] opacity-40 transition-all hover:bg-red-500/10 hover:text-red-500 hover:opacity-100" @click.stop="browserStore.closeTab(tab.tabId)"><X /></span>
      </div>
      <Button variant="ghost" size="icon" class="size-6 shrink-0 rounded-[5px] text-muted-foreground hover:text-primary" @click="browserStore.createDisplayTab()" :title="t('browser.newTabBtn')">
        <Plus class="size-3" />
      </Button>
    </div>

    <!-- ========== Agent 活动状态条 ========== -->
    <div v-if="browserStore.lastTrace" class="flex h-7 shrink-0 items-center gap-1.5 border-b border-border/50 bg-primary/[0.04] px-2.5 text-[11px]">
      <span class="shrink-0 rounded bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">Agent</span>
      <span class="flex-1 min-w-0 truncate text-muted-foreground">{{ browserStore.lastTrace.summary }}</span>
    </div>

    <!-- ========== 网页渲染区 ========== -->
    <div class="relative flex min-h-0 flex-1 overflow-hidden">
      <!-- 风险未确认时显示内联风险告知 -->
      <div v-if="riskAcknowledged === false" class="flex h-full flex-col items-center overflow-y-auto bg-card p-8 text-center">
        <div class="mb-4 flex size-14 items-center justify-center rounded-full bg-amber-500/10">
          <BadgeCheck class="size-6 text-amber-500" />
        </div>
        <h3 class="mb-4 text-base font-semibold text-foreground">{{ t('browser.risk.title') }}</h3>
        <div class="mb-6 max-w-[320px] text-xs leading-relaxed text-muted-foreground">
          <p class="mb-2">{{ t('browser.risk.desc1') }}</p>
          <p class="mb-2">{{ t('browser.risk.desc2') }}</p>
          <p>{{ t('browser.risk.desc3') }}</p>
          <ul class="mt-1 list-disc space-y-1 pl-5 text-left">
            <li>{{ t('browser.risk.captcha') }}</li>
            <li>{{ t('browser.risk.rateLimit') }}</li>
            <li>{{ t('browser.risk.accountRisk') }}</li>
          </ul>
        </div>
        <div class="flex w-full max-w-[280px] flex-col gap-2">
          <Button class="h-9 rounded-md text-[13px] font-medium" @click="browserStore.acceptRisk()">
            {{ t('browser.risk.accept') }}
          </Button>
          <Button variant="outline" class="h-9 rounded-md text-[13px] text-muted-foreground hover:border-foreground hover:text-foreground" @click="onClose">
            {{ t('browser.risk.decline') }}
          </Button>
        </div>
      </div>

      <!-- 风险已确认且有标签时渲染 BrowserSlot -->
      <BrowserSlot
        v-else-if="riskAcknowledged === true && browserState?.activeTabId"
        :session-id="browserStore.activeSessionId"
        :tab-id="browserState.activeTabId"
        class="h-full w-full"
      />

      <!-- 无浏览器状态时的占位 -->
      <div v-else class="flex h-full flex-col items-center justify-center gap-2 bg-card text-xs text-muted-foreground">
        <Globe class="size-8 opacity-30" />
        <p>{{ t('browser.initializing') }}</p>
      </div>
    </div>

    <!-- ========== 底部操作账本 ========== -->
    <div v-if="browserStore.lastTrace" class="flex h-7 shrink-0 items-center gap-1.5 border-t border-border bg-sidebar px-2.5 text-[11px]">
      <span class="shrink-0 font-medium text-primary">{{ t('browser.agentOperation') }}</span>
      <span class="flex-1 min-w-0 truncate text-muted-foreground">{{ browserStore.lastTrace.summary }}</span>
    </div>
  </div>
</template>

<script setup>
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'

/**
 * BrowserSidePanel 组件
 */
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Globe, ArrowLeft, ArrowRight, RefreshCw, X, Plus, BadgeCheck } from '@lucide/vue'
import { useBrowserStore } from '@/stores/browser'
import BrowserSlot from './BrowserSlot.vue'

const { t } = useI18n()

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
