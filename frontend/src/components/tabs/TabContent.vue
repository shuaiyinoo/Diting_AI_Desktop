<template>
  <div class="h-full w-full overflow-hidden">
    <!-- Tab 模式：渲染会话视图 -->
    <template v-if="tabStore.tabMode && tabStore.activeTab">
      <!-- 草稿 -->
      <ScratchPad v-if="tabStore.activeTab.type === 'scratch'" />

      <!-- Chat 会话 -->
      <ChatView
        v-else-if="tabStore.activeTab.type === 'chat'"
        :key="'chat-' + tabStore.activeTab.sessionId"
        :session-id="tabStore.activeTab.sessionId"
      />

      <!-- Agent 会话 -->
      <AgentView
        v-else-if="tabStore.activeTab.type === 'agent'"
        :key="'agent-' + tabStore.activeTab.sessionId"
        :session-id="tabStore.activeTab.sessionId"
      />

      <!-- 文件查看器 -->
      <FileViewer
        v-else-if="tabStore.activeTab.type === 'file'"
        :key="'file-' + (tabStore.activeTab.fileItemId || tabStore.activeTab.filePath)"
        :file-path="tabStore.activeTab.filePath"
        :workspace-id="tabStore.activeTab.workspaceId"
        :session-id="tabStore.activeTab.fileSessionId"
        :mode="tabStore.activeTab.mode"
        :attached-dir-path="tabStore.activeTab.attachedDirPath"
        :file-item-id="tabStore.activeTab.fileItemId"
      />
    </template>

    <!-- Tab 模式但无活跃标签：显示欢迎页 -->
    <div v-else-if="tabStore.tabMode && !tabStore.activeTab" class="flex items-center justify-center h-full w-full bg-card">
      <div class="flex flex-col items-center gap-3 p-12">
        <Bot class="size-14 text-primary opacity-50" />
        <h2 class="text-xl font-semibold text-foreground m-0">欢迎使用 Diting</h2>
        <p class="text-sm text-muted-foreground m-0">从左侧选择一个会话开始对话</p>
      </div>
    </div>

    <!-- 路由模式：渲染工具页面 -->
    <router-view v-else />
  </div>
</template>

<script setup>
import { Bot } from '@lucide/vue'
import { useTabStore } from '@/stores/tab'
import ScratchPad from './ScratchPad.vue'
import ChatView from '@/views/chat/Index.vue'
import AgentView from '@/views/agent/Index.vue'
import FileViewer from './FileViewer.vue'

const tabStore = useTabStore()
</script>
