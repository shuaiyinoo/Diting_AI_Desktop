<template>
  <div class="h-full w-full overflow-hidden">
    <!-- Tab 模式：遍历所有 Tab，用 v-show 控制显示/隐藏，实现状态保持 -->
    <template v-if="tabStore.tabMode && tabStore.tabs.length > 0">
      <div
        v-for="tab in tabStore.tabs"
        :key="tab.id"
        v-show="tab.id === tabStore.activeTabId"
        class="h-full w-full"
      >
        <!-- 草稿 -->
        <ScratchPad v-if="tab.type === 'scratch'" />

        <!-- Chat 会话（固定 Tab ID，切换会话时复用组件实例，保持状态） -->
        <ChatView
          v-else-if="tab.type === 'chat'"
          :session-id="tab.sessionId"
        />

        <!-- Agent 会话（固定 Tab ID，切换会话时复用组件实例，保持状态） -->
        <AgentView
          v-else-if="tab.type === 'agent'"
          :session-id="tab.sessionId"
        />

        <!-- 文件查看器 -->
        <FileViewer
          v-else-if="tab.type === 'file'"
          :key="tab.id"
          :file-path="tab.filePath"
          :workspace-id="tab.workspaceId"
          :session-id="tab.fileSessionId"
          :mode="tab.mode"
          :attached-dir-path="tab.attachedDirPath"
          :file-item-id="tab.fileItemId"
        />

        <!-- 工具页面：文件管理（每个文件夹独立 Tab） -->
        <FileView
          v-else-if="tab.type === 'file-manager'"
          :folder-id="tab.folderId"
        />

        <!-- 工具页面：OCR 录入识读 -->
        <InvoiceView
          v-else-if="tab.type === 'ocr-recognize'"
        />

        <!-- 工具页面：OCR 归集查阅 -->
        <ArchiveView
          v-else-if="tab.type === 'ocr-archive'"
        />

        <!-- 工具页面：任务/日程/Todo -->
        <PlanningView
          v-else-if="tab.type === 'planning'"
        />

        <!-- 工具页面：Agent 技能 -->
        <SkillsView
          v-else-if="tab.type === 'skills'"
        />

        <!-- 工具页面：设置 -->
        <SettingView
          v-else-if="tab.type === 'setting'"
        />
      </div>
    </template>

    <!-- Tab 模式但无活跃标签：显示欢迎页 -->
    <div v-else-if="tabStore.tabMode && !tabStore.activeTab" class="flex items-center justify-center h-full w-full bg-card">
      <div class="flex flex-col items-center gap-3 p-12">
        <Bot class="size-14 text-primary opacity-50" />
        <h2 class="text-xl font-semibold text-foreground m-0">{{ t('tabContent.welcome') }}</h2>
        <p class="text-sm text-muted-foreground m-0">{{ t('tabContent.selectSession') }}</p>
      </div>
    </div>

    <!-- 路由模式：渲染工具页面 -->
    <router-view v-else />
  </div>
</template>

<script setup>
import { Bot } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { useTabStore } from '@/stores/tab'
import ScratchPad from './ScratchPad.vue'
import ChatView from '@/views/chat/Index.vue'
import AgentView from '@/views/agent/Index.vue'
import FileViewer from './FileViewer.vue'
import FileView from '@/views/file/Index.vue'
import InvoiceView from '@/views/invoice/Index.vue'
import ArchiveView from '@/views/invoice/Archive.vue'
import PlanningView from '@/views/planning/Index.vue'
import SkillsView from '@/views/skills/Index.vue'
import SettingView from '@/views/setting/Index.vue'

const { t } = useI18n()
const tabStore = useTabStore()
</script>
