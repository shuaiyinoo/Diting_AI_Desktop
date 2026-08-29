<template>
  <div class="flex h-full w-full overflow-hidden bg-background" ref="workspaceRef">
    <!-- ========== 设置菜单 ========== -->
    <div class="flex flex-col overflow-hidden bg-background" :style="{ width: panel2Width + 'px', flexShrink: 0 }">
      <div class="flex h-10 shrink-0 items-center gap-1.5 border-b border-border px-2">
        <span class="text-[13px] font-medium text-foreground">{{ t('settings.title') }}</span>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-1.5 py-1">
        <button
          v-for="item in settingTabs"
          :key="item.key"
          class="mb-1 flex w-full items-center gap-2.5 rounded-md border-none px-3 py-2.5 text-left text-sm transition-all hover:bg-accent hover:text-accent-foreground"
          :class="activeTab === item.key ? 'bg-muted font-medium text-primary' : 'bg-transparent text-muted-foreground'"
          @click="onTabChange(item.key)"
        >
          <component :is="item.icon" class="size-4 shrink-0" />
          <span>{{ item.label }}</span>
        </button>
      </div>
    </div>

    <!-- 分隔条 -->
    <PanelDivider @resize="onPanel2Resize" />

    <!-- ========== 设置内容区 ========== -->
    <div class="flex min-w-[300px] flex-1 flex-col overflow-hidden bg-background">
      <div class="flex h-10 shrink-0 items-center gap-1.5 border-b border-border px-2">
        <span class="text-[13px] font-medium text-foreground">{{ currentTabLabel }}</span>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <ModelPanel v-if="activeTab === 'model'" ref="modelRef" />
        <ModelVoicePanel v-else-if="activeTab === 'modelVoice'" />
        <ModelOcrPanel v-else-if="activeTab === 'modelOcr'" />
        <ModelVectorPanel v-else-if="activeTab === 'modelVector'" />
        <SkillsPanel v-else-if="activeTab === 'skills'" ref="skillsRef" />
        <McpPanel v-else-if="activeTab === 'mcp'" ref="mcpRef" />
        <ToolsPanel v-else-if="activeTab === 'tools'" ref="toolsRef" />
        <RuntimePanel v-else-if="activeTab === 'runtime'" ref="runtimeRef" />
        <GeneralPanel v-else-if="activeTab === 'general'" />
        <AppearancePanel v-else-if="activeTab === 'appearance'" />
        <AboutPanel v-else-if="activeTab === 'about'" />
        <BridgeSettings v-else-if="activeTab === 'bridge'" />
        <StoragePanel v-else-if="activeTab === 'storage'" ref="storageRef" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Settings, Zap, Plug, Palette, Bot, Monitor, Wrench, Radio, Info, HardDrive, AudioLines, ScanText, Boxes,
} from '@lucide/vue'
import PanelDivider from '@/components/layout/PanelDivider.vue'
import ModelPanel from './ModelPanel.vue'
import ModelVoicePanel from './ModelVoicePanel.vue'
import ModelOcrPanel from './ModelOcrPanel.vue'
import ModelVectorPanel from './ModelVectorPanel.vue'
import SkillsPanel from './SkillsPanel.vue'
import McpPanel from './McpPanel.vue'
import ToolsPanel from './ToolsPanel.vue'
import RuntimePanel from './RuntimePanel.vue'
import GeneralPanel from './GeneralPanel.vue'
import AppearancePanel from './AppearancePanel.vue'
import AboutPanel from './AboutPanel.vue'
import BridgeSettings from './BridgeSettings.vue'
import StoragePanel from './StoragePanel.vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const { t } = useI18n()

// ========== 面板布局 ==========
const workspaceRef = ref(null)
const panel2Width = ref(200)
const activeTab = ref('model')

// 子组件 ref
const modelRef = ref(null)
const skillsRef = ref(null)
const mcpRef = ref(null)
const toolsRef = ref(null)
const runtimeRef = ref(null)
const storageRef = ref(null)

// 从路由参数读取 tab（支持从 StatusBar 跳转）
onMounted(() => {
  if (route.query.tab) {
    activeTab.value = route.query.tab
  }
})

watch(() => route.query.tab, (newTab) => {
  if (newTab && newTab !== activeTab.value) {
    activeTab.value = newTab
  }
})

const settingTabs = computed(() => [
  { key: 'model', label: t('settings.tabs.model'), icon: Bot },
  { key: 'modelVoice', label: t('settings.tabs.modelVoice'), icon: AudioLines },
  { key: 'modelOcr', label: t('settings.tabs.modelOcr'), icon: ScanText },
  { key: 'modelVector', label: t('settings.tabs.modelVector'), icon: Boxes },
  { key: 'skills', label: t('settings.tabs.skills'), icon: Zap },
  { key: 'mcp', label: t('settings.tabs.mcp'), icon: Plug },
  { key: 'tools', label: t('settings.tabs.tools'), icon: Wrench },
  { key: 'runtime', label: t('settings.tabs.runtime'), icon: Monitor },
  { key: 'general', label: t('settings.tabs.general'), icon: Settings },
  { key: 'appearance', label: t('settings.tabs.appearance'), icon: Palette },
  { key: 'bridge', label: t('settings.tabs.bridge'), icon: Radio },
  { key: 'about', label: t('settings.tabs.about'), icon: Info },
  { key: 'storage', label: t('settings.tabs.storage'), icon: HardDrive },
])

const currentTabLabel = computed(() => settingTabs.value.find((tab) => tab.key === activeTab.value)?.label || '')

function onPanel2Resize(delta) {
  panel2Width.value = Math.min(280, Math.max(160, panel2Width.value + delta))
}

function onTabChange(key) {
  activeTab.value = key
  // 子组件在 onMounted 时自动加载数据
  // Skills / Tools / Runtime 在首次切换时加载
  if (key === 'skills' && skillsRef.value) skillsRef.value.refresh()
  if (key === 'tools' && toolsRef.value) toolsRef.value.refresh()
  if (key === 'runtime' && runtimeRef.value) runtimeRef.value.refresh()
  if (key === 'storage' && storageRef.value) storageRef.value.refresh()
}

</script>
