<template>
  <div class="tab-content">
    <!-- Tab 模式：渲染会话视图 -->
    <template v-if="tabStore.tabMode && tabStore.activeTab">
      <!-- 草稿 -->
      <ScratchPad v-if="tabStore.activeTab.type === 'scratch'" />

      <!-- Chat 会话：使用 :key 强制切换时重新挂载，实现状态隔离 -->
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
    <div v-else-if="tabStore.tabMode && !tabStore.activeTab" class="tab-content__welcome">
      <div class="welcome-card">
        <RobotOutlined class="welcome-card__icon" />
        <h2 class="welcome-card__title">欢迎使用 Diting AI</h2>
        <p class="welcome-card__hint">从左侧选择一个会话开始对话</p>
      </div>
    </div>

    <!-- 路由模式：渲染工具页面 -->
    <router-view v-else />
  </div>
</template>

<script setup>
import { RobotOutlined } from '@ant-design/icons-vue'
import { useTabStore } from '@/stores/tab'
import ScratchPad from './ScratchPad.vue'
import ChatView from '@/views/chat/Index.vue'
import AgentView from '@/views/agent/Index.vue'
import FileViewer from './FileViewer.vue'

const tabStore = useTabStore()
</script>

<style lang="less" scoped>
.tab-content {
  height: 100%;
  width: 100%;
  overflow: hidden;

  &__welcome {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    width: 100%;
    background-color: var(--bg-panel);
  }
}

.welcome-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 48px;

  &__icon {
    font-size: 56px;
    color: var(--accent);
    opacity: 0.5;
  }

  &__title {
    font-size: 20px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  &__hint {
    font-size: 14px;
    color: var(--text-muted);
    margin: 0;
  }
}
</style>
