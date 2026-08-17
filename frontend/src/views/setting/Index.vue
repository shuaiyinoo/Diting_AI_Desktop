<template>
  <div class="flex h-full w-full overflow-hidden bg-background" ref="workspaceRef">
    <!-- ========== 设置菜单 ========== -->
    <div class="flex flex-col overflow-hidden bg-background" :style="{ width: panel2Width + 'px', flexShrink: 0 }">
      <div class="flex h-10 shrink-0 items-center gap-1.5 border-b border-border px-2">
        <span class="text-[13px] font-medium text-foreground">设置</span>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-1.5 py-1">
        <button
          v-for="item in settingTabs"
          :key="item.key"
          class="mb-0.5 flex w-full items-center gap-2 rounded-md border-none bg-transparent px-2.5 py-2 text-left text-xs transition-all hover:bg-accent hover:text-accent-foreground"
          :class="activeTab === item.key ? 'bg-accent font-medium text-accent-foreground' : 'text-muted-foreground'"
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
        <ModelPanel v-if="activeTab === 'model'" ref="modelRef" @enable="handleEnable" @disable="handleDisable" @test="handleTest" @delete="handleDelete" />
        <SkillsPanel v-else-if="activeTab === 'skills'" ref="skillsRef" />
        <McpPanel v-else-if="activeTab === 'mcp'" ref="mcpRef" />
        <ToolsPanel v-else-if="activeTab === 'tools'" ref="toolsRef" />
        <RuntimePanel v-else-if="activeTab === 'runtime'" ref="runtimeRef" />
        <GeneralPanel v-else-if="activeTab === 'general'" />
        <AppearancePanel v-else-if="activeTab === 'appearance'" />
        <BridgeSettings v-else-if="activeTab === 'bridge'" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { toast } from 'vue-sonner'
import {
  Settings, Zap, Plug, Palette, Bot, Monitor, Wrench, Radio,
} from '@lucide/vue'
import PanelDivider from '@/components/layout/PanelDivider.vue'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'
import ModelPanel from './ModelPanel.vue'
import SkillsPanel from './SkillsPanel.vue'
import McpPanel from './McpPanel.vue'
import ToolsPanel from './ToolsPanel.vue'
import RuntimePanel from './RuntimePanel.vue'
import GeneralPanel from './GeneralPanel.vue'
import AppearancePanel from './AppearancePanel.vue'
import BridgeSettings from './BridgeSettings.vue'

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

const settingTabs = [
  { key: 'model', label: '模型管理', icon: Bot },
  { key: 'skills', label: 'Skills', icon: Zap },
  { key: 'mcp', label: 'MCP 工具', icon: Plug },
  { key: 'tools', label: 'Tools', icon: Wrench },
  { key: 'runtime', label: '环境检测', icon: Monitor },
  { key: 'general', label: '常规', icon: Settings },
  { key: 'appearance', label: '外观', icon: Palette },
  { key: 'bridge', label: '远程连接', icon: Radio },
]

const currentTabLabel = computed(() => settingTabs.find((t) => t.key === activeTab.value)?.label || '')

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
}

// ========== 模型操作（委托给 ModelPanel 但某些操作需要父组件协调） ==========
async function handleEnable(record) {
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'enable', id: record.id })
    if (res.code === 0) {
      toast.success(`已启用: ${record.name}`)
      modelRef.value?.refresh()
    } else {
      toast.error(res.message || '启用失败')
    }
  } catch (err) {
    toast.error('启用异常: ' + (err?.message || err))
  }
}

async function handleDisable(record) {
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'disable', id: record.id })
    if (res.code === 0) {
      toast.success(`已禁用: ${record.name}`)
      modelRef.value?.refresh()
    } else {
      toast.error(res.message || '禁用失败')
    }
  } catch (err) {
    toast.error('禁用异常: ' + (err?.message || err))
  }
}

async function handleDelete(record) {
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'delete', id: record.id })
    if (res.code === 0) {
      toast.success('删除成功')
      modelRef.value?.refresh()
    } else {
      toast.error(res.message || '删除失败')
    }
  } catch (err) {
    toast.error('删除异常: ' + (err?.message || err))
  }
}

async function handleTest(record) {
  modelRef.value?.setTestingId(record.id)
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'test', id: record.id })
    if (res.code === 0 && res.testResult) {
      modelRef.value?.showTestResult(res.testResult)
    } else {
      toast.error(res.message || '测试失败')
    }
  } catch (err) {
    toast.error('测试异常: ' + (err?.message || err))
  } finally {
    modelRef.value?.setTestingId(null)
  }
}
</script>
