<template>
  <div
    class="menu-bar"
    :class="{ 'menu-bar--collapsed': ws.menuCollapsed }"
    :style="{ width: ws.menuCollapsed ? '56px' : ws.menuWidth + 'px' }"
  >
    <!-- ===================== 展开模式 ===================== -->
    <template v-if="!ws.menuCollapsed">
      <!-- 顶部：Chat/Agent 切换 + 折叠按钮 -->
      <div class="mb-top">
        <div class="mb-mode-switch">
          <button
            type="button"
            class="mb-mode-btn"
            :class="{ 'mb-mode-btn--active': ws.activeModule === 'chat' }"
            @click="navigate('chat')"
          >
            <MessageOutlined />
            <span>Chat</span>
          </button>
          <button
            type="button"
            class="mb-mode-btn"
            :class="{ 'mb-mode-btn--active': ws.activeModule === 'agent' }"
            @click="navigate('agent')"
          >
            <RobotOutlined />
            <span>Agent</span>
          </button>
        </div>
        <button type="button" class="mb-collapse-btn" @click="ws.toggleMenu">
          <MenuFoldOutlined />
        </button>
      </div>

      <!-- 导航区 -->
      <nav class="mb-nav">
        <!-- ===== 工具分组（始终显示） ===== -->
        <div class="mb-group">
          <div class="mb-group-header">
            <span class="mb-group-title">工具</span>
          </div>
          <div
            class="mb-item"
            :class="{ 'mb-item--active': ws.activeModule === 'file' }"
            @click="navigate('file')"
          >
            <FileFilled class="mb-item-icon" />
            <span class="mb-item-text">文件</span>
            <span class="mb-item-count">{{ ws.folderList.length }}</span>
          </div>
          <div
            class="mb-item"
            :class="{ 'mb-item--active': ws.activeModule === 'skills' }"
            @click="navigate('skills')"
          >
            <ThunderboltFilled class="mb-item-icon" />
            <span class="mb-item-text">Agent 技能</span>
            <span class="mb-item-count">{{ skillsCount }}</span>
          </div>
        </div>

        <!-- ===== 文件分组（仅文件模块激活时显示） ===== -->
        <div v-if="ws.activeModule === 'file'" class="mb-group mb-group--flex">
          <div class="mb-group-header">
            <span class="mb-group-title">文件</span>
            <span class="mb-group-meta">{{ totalFileCount }}</span>
            <button class="mb-add-btn" @click="onAddFolder">
              <PlusOutlined />
            </button>
          </div>
          <div class="mb-group-body">
            <a-spin v-if="ws.folderLoading" size="small" />
            <div
              v-for="folder in ws.folderList"
              :key="folder.id"
              class="mb-item"
              :class="{ 'mb-item--active': ws.selectedFolderId === folder.id }"
              @click="onSelectFolder(folder.id)"
            >
              <FolderOutlined class="mb-item-icon" />
              <span class="mb-item-text" :title="getFolderName(folder.path)">{{ getFolderName(folder.path) }}</span>
            </div>
            <div v-if="!ws.folderLoading && ws.folderList.length === 0" class="mb-empty">暂无文件夹</div>
          </div>
        </div>

        <!-- ===== 对话分组（仅 Chat 模块激活时显示） ===== -->
        <div v-if="ws.activeModule === 'chat'" class="mb-group mb-group--flex">
          <div class="mb-group-header">
            <span class="mb-group-title">对话</span>
            <button class="mb-add-btn" @click="onCreateChat">
              <PlusOutlined />
            </button>
          </div>
          <div class="mb-group-body">
            <a-spin v-if="ws.chatSessionLoading" size="small" />
            <div
              v-for="session in ws.chatSessions"
              :key="session.id"
              class="mb-item"
              :class="{ 'mb-item--active': ws.currentChatSessionId === session.id }"
              @click="onSelectChatSession(session.id)"
            >
              <MessageOutlined class="mb-item-icon" />
              <span class="mb-item-text">{{ session.title || '新会话' }}</span>
            </div>
            <div v-if="!ws.chatSessionLoading && ws.chatSessions.length === 0" class="mb-empty">暂无对话</div>
          </div>
        </div>

        <!-- ===== 项目分组（仅 Agent 模块激活时显示） ===== -->
        <div v-if="ws.activeModule === 'agent'" class="mb-group mb-group--flex">
          <div class="mb-group-header">
            <span class="mb-group-title">项目</span>
            <button class="mb-add-btn" @click="onCreateProject">
              <PlusOutlined />
            </button>
          </div>
          <div class="mb-group-body">
            <a-spin v-if="ws.agentProjectLoading" size="small" />
            <!-- 每个项目及其会话列表 -->
            <template v-for="project in ws.agentProjects" :key="project.id">
              <div
                class="mb-item"
                :class="{ 'mb-item--active': ws.currentAgentProjectId === project.id }"
                @click="onSelectProject(project)"
              >
                <ProjectOutlined class="mb-item-icon" />
                <span class="mb-item-text">{{ project.name }}</span>
                <!-- 项目右侧 + 按钮：为当前项目创建会话 -->
                <button class="mb-add-btn" @click.stop="onCreateAgentSession(project)">
                  <PlusOutlined />
                </button>
              </div>
              <!-- 该项目下的会话列表 -->
              <div
                v-for="sess in getProjectSessions(project.id)"
                :key="sess.id"
                class="mb-item mb-item--sub"
                :class="{ 'mb-item--active': agent.currentSessionId === sess.id }"
                @click="onSelectAgentSession(sess, project)"
              >
                <MessageOutlined class="mb-item-icon" />
                <span class="mb-item-text">{{ sess.title || '未命名' }}</span>
              </div>
            </template>
            <div v-if="!ws.agentProjectLoading && ws.agentProjects.length === 0" class="mb-empty">暂无项目</div>
          </div>
        </div>
      </nav>
    </template>

    <!-- ===================== 收起模式 ===================== -->
    <template v-else>
      <!-- 顶部：展开按钮 -->
      <button type="button" class="mb-collapse-btn mb-collapse-btn--top" @click="ws.toggleMenu">
        <MenuUnfoldOutlined />
      </button>

      <div class="mb-divider"></div>

      <!-- 模式图标（Chat/Agent） -->
      <button
        type="button"
        class="mb-icon-btn"
        :class="{ 'mb-icon-btn--active': ws.activeModule === 'chat' }"
        @click="navigate('chat')"
      >
        <MessageOutlined />
      </button>
      <button
        type="button"
        class="mb-icon-btn"
        :class="{ 'mb-icon-btn--active': ws.activeModule === 'agent' }"
        @click="navigate('agent')"
      >
        <RobotOutlined />
      </button>

      <div class="mb-divider"></div>

      <!-- 模块图标（文件/技能） -->
      <button
        type="button"
        class="mb-icon-btn"
        :class="{ 'mb-icon-btn--active': ws.activeModule === 'file' }"
        @click="navigate('file')"
      >
        <FileFilled />
      </button>
      <button
        type="button"
        class="mb-icon-btn"
        :class="{ 'mb-icon-btn--active': ws.activeModule === 'skills' }"
        @click="navigate('skills')"
      >
        <ThunderboltFilled />
      </button>

      <div class="mb-divider"></div>

      <!-- 最近列表（文字头像） -->
      <div class="mb-recent-list">
        <div
          v-for="item in recentItems"
          :key="item.id"
          class="mb-avatar-btn"
          :class="{ 'mb-avatar-btn--active': item.active }"
          @click="item.onClick"
        >
          {{ item.char }}
        </div>
      </div>

      <!-- 占位撑开 -->
      <div style="flex: 1"></div>
    </template>

    <!-- ===================== 底部：设置 ===================== -->
    <div class="mb-footer">
      <!-- 展开模式：带文字靠左 -->
      <div
        v-if="!ws.menuCollapsed"
        class="mb-item"
        :class="{ 'mb-item--active': ws.activeModule === 'setting' }"
        @click="navigate('setting')"
      >
        <SettingOutlined class="mb-item-icon" />
        <span class="mb-item-text">设置</span>
      </div>
      <!-- 收起模式：图标 -->
      <button
        v-else
        type="button"
        class="mb-icon-btn"
        :class="{ 'mb-icon-btn--active': ws.activeModule === 'setting' }"
        @click="navigate('setting')"
      >
        <SettingOutlined />
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { message } from 'ant-design-vue'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  FileFilled,
  ThunderboltFilled,
  MessageOutlined,
  RobotOutlined,
  SettingOutlined,
  PlusOutlined,
  FolderOutlined,
  ProjectOutlined,
} from '@ant-design/icons-vue'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAgentStore } from '@/stores/agent'

const router = useRouter()
const route = useRoute()
const ws = useWorkspaceStore()
const agent = useAgentStore()

// 使用 storeToRefs 确保 store 的 ref 在 HMR 后仍然保持响应式
const { activeModule, selectedFolderId, selectedFile, selectedFileId } = storeToRefs(ws)

const addFolderLoading = ref(false)

// ===== Skills / MCP 计数 =====
const skillsCount = ref(0)

async function loadSkillsCount() {
  try {
    const [skillsRes, mcpRes] = await Promise.all([
      ipc.invoke(ipcApiRoute.piAgent.skillsOperation, { action: 'list', workspaceSlug: 'default' }),
      ipc.invoke(ipcApiRoute.piAgent.mcpOperation, { action: 'list' }),
    ])
    const sCount = (skillsRes?.data || []).length
    const mCount = (mcpRes?.data || []).length
    skillsCount.value = sCount + mCount
  } catch {
    skillsCount.value = 0
  }
}

// ===== 文件总数 =====
const totalFileCount = ref(0)

async function loadTotalFileCount() {
  try {
    const stats = await ipc.invoke(ipcApiRoute.file.getRagStats)
    if (stats) {
      totalFileCount.value = stats.vectorizedFiles || 0
    }
  } catch {
    totalFileCount.value = 0
  }
}

// ===== Agent 会话列表 =====
const agentSessions = computed(() => agent.sessions || [])

/** 获取指定项目下的会话列表 */
function getProjectSessions(projectId) {
  const result = agentSessions.value.filter((s) => {
    const wid = s.workspaceId || s.workspace_id || s.projectId || ''
    return String(wid) === String(projectId)
  })
  return result
}

// ===== 最近列表（收起模式） =====
const recentItems = computed(() => {
  if (activeModule.value === 'file') {
    return ws.folderList.slice(0, 5).map((f) => ({
      id: f.id,
      char: getFolderName(f.path).charAt(0),
      active: selectedFolderId.value === f.id,
      onClick: () => {
        onSelectFolder(f.id)
      },
    }))
  }
  if (activeModule.value === 'chat') {
    return ws.chatSessions.slice(0, 5).map((s) => ({
      id: s.id,
      char: (s.title || '?').charAt(0),
      active: ws.currentChatSessionId === s.id,
      onClick: () => {
        onSelectChatSession(s.id)
      },
    }))
  }
  if (activeModule.value === 'agent') {
    return agentSessions.value.slice(0, 5).map((s) => ({
      id: s.id,
      char: (s.title || '?').charAt(0),
      active: agent.currentSessionId === s.id,
      onClick: () => {
        agent.selectSession(s.id)
        navigate('agent')
      },
    }))
  }
  return []
})

// ===== 路由同步 =====
watch(
  () => route.path,
  (path) => {
    if (path.startsWith('/file')) ws.setActiveModule('file')
    else if (path.startsWith('/skills')) ws.setActiveModule('skills')
    else if (path.startsWith('/chat')) ws.setActiveModule('chat')
    else if (path.startsWith('/agent')) ws.setActiveModule('agent')
    else if (path.startsWith('/setting')) ws.setActiveModule('setting')
  },
  { immediate: true },
)

function navigate(key) {
  console.log('[MenuBar] navigate:', key)
  ws.setActiveModule(key)
  const map = { file: '/file', skills: '/skills', chat: '/chat', agent: '/agent', setting: '/setting' }
  if (map[key]) {
    router.push(map[key]).catch(err => console.error('[MenuBar] router.push 失败:', err))
  }
}

// 展开模式下点击文件夹：通过 storeToRefs 的 ref 直接赋值，确保响应式触发
function onSelectFolder(folderId) {
  console.log('[MenuBar] onSelectFolder:', folderId, 'current:', selectedFolderId.value)
  selectedFolderId.value = folderId
  selectedFile.value = null
  selectedFileId.value = null
}

// 展开模式下点击 Chat 会话
function onSelectChatSession(sessionId) {
  console.log('[MenuBar] onSelectChatSession:', sessionId)
  ws.selectChatSession(sessionId)
  navigate('chat')
}

async function onAddFolder() {
  addFolderLoading.value = true
  try {
    const result = await ws.addFolder()
    if (result?.success) {
      message.success('文件夹添加成功')
      await loadTotalFileCount()
    } else if (result?.message) {
      message.warning(result.message)
    }
  } catch {
    message.error('添加文件夹失败')
  } finally {
    addFolderLoading.value = false
  }
}

async function onCreateChat() {
  await ws.createChatSession()
  navigate('chat')
}

async function onCreateProject() {
  await ws.createAgentProject()
  navigate('agent')
}

/** 选中 Agent 项目 */
function onSelectProject(project) {
  ws.selectAgentProject(project.id)
  navigate('agent')
}

/** 为指定项目创建 Agent 会话 */
async function onCreateAgentSession(project) {
  await agent.createSession(undefined, project.id)
  navigate('agent')
}

/** 点击会话时：选中所属项目 + 选中会话 + 跳转 */
function onSelectAgentSession(sess, project) {
  // 选中会话所属的项目
  ws.selectAgentProject(project.id)
  // 选中会话（更新 agent store，Agent 视图会 watch 到）
  agent.selectSession(sess.id)
  navigate('agent')
}

function getFolderName(path) {
  if (!path) return '未命名'
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || path
}

onMounted(() => {
  ws.loadFolderList()
  ws.loadChatSessions()
  ws.loadAgentProjects()
  agent.loadSessions()
  loadSkillsCount()
  loadTotalFileCount()
})
</script>

<style lang="less" scoped>
.menu-bar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border-color);
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  user-select: none;
  height: 100%;
  // Electron 隐藏标题栏后，需显式声明 no-drag 否则点击事件可能被拖拽区域拦截
  -webkit-app-region: no-drag;
}

// ===================== 展开模式：顶部 =====================
.mb-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 8px 10px;
  flex-shrink: 0;
}

.mb-mode-switch {
  display: flex;
  background: var(--bg-active);
  border-radius: 8px;
  padding: 2px;
  gap: 2px;
  flex: 1;
  margin-right: 6px;
}

.mb-mode-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  -webkit-appearance: none;

  &.mb-mode-btn--active {
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    box-shadow: 0 1px 4px rgba(22, 119, 255, 0.25);
  }

  &:not(.mb-mode-btn--active):hover {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.4);
  }
}

.mb-collapse-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 15px;
  flex-shrink: 0;
  transition: all 0.15s;
  -webkit-appearance: none;

  &:hover {
    background: var(--bg-hover);
    color: var(--accent);
  }

  &--top {
    margin: 8px auto;
  }
}

// ===================== 导航区 =====================
.mb-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0 6px;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;

  &::-webkit-scrollbar {
    width: 0;
    display: none;
  }
}

// ===================== 分组 =====================
.mb-group {
  margin-bottom: 4px;

  &--flex {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
}

.mb-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 8px 4px;
  flex-shrink: 0;
}

.mb-group-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  flex: 1;
}

.mb-group-meta {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-active);
  padding: 0 6px;
  border-radius: 8px;
  height: 16px;
  line-height: 16px;
}

.mb-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s;
  -webkit-appearance: none;

  &:hover {
    background: var(--bg-hover);
    color: var(--accent);
  }
}

.mb-group-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 2px 4px;
  min-height: 0;

  &::-webkit-scrollbar {
    width: 0;
    display: none;
  }
}

.mb-subheader {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  padding: 8px 8px 2px;
}

// ===================== 列表项（展开模式） =====================
.mb-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  height: 34px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary);
  transition: background-color 0.15s ease, color 0.15s ease;
  position: relative;
  margin-bottom: 1px;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.mb-item--active {
    background: var(--bg-active);
    color: var(--accent);
    font-weight: 600;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 18px;
      border-radius: 0 2px 2px 0;
      background: var(--accent);
    }

    &:hover {
      background: var(--bg-active);
      color: var(--accent);
    }
  }

  &.mb-item--sub {
    padding-left: 28px;
    font-size: 13px;
    height: 30px;
  }
}

.mb-item-icon {
  font-size: 15px;
  flex-shrink: 0;
  color: var(--text-muted);

  .mb-item--active & {
    color: var(--accent);
  }
}

.mb-item-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mb-item-count {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-active);
  padding: 0 6px;
  border-radius: 8px;
  height: 16px;
  line-height: 16px;
  flex-shrink: 0;
}

.mb-empty {
  padding: 12px 8px;
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}

// ===================== 收起模式 =====================
.mb-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 8px;
  flex-shrink: 0;
}

.mb-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  margin: 2px auto;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--bg-active);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 18px;
  flex-shrink: 0;
  transition: all 0.15s ease;
  -webkit-appearance: none;

  &:hover {
    color: var(--accent);
    border-color: var(--border-color);
  }

  &.mb-icon-btn--active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
    box-shadow: 0 1px 4px rgba(22, 119, 255, 0.3);

    &:hover {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }
  }
}

.mb-recent-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 4px 0;
}

.mb-avatar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin: 2px auto;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--bg-active);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
  transition: all 0.15s ease;
  user-select: none;

  &:hover {
    color: var(--accent);
    border-color: var(--border-color);
  }

  &.mb-avatar-btn--active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);

    &:hover {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }
  }
}

// ===================== 底部 =====================
.mb-footer {
  padding: 4px 6px 8px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}
</style>
