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
            :class="{ 'mb-item--active': ws.activeModule === 'invoice' }"
            @click="navigate('invoice')"
          >
            <FileSearchOutlined class="mb-item-icon" />
            <span class="mb-item-text">OCR识别</span>
          </div>
          <div
            class="mb-item"
            :class="{ 'mb-item--active': ws.activeModule === 'planning' }"
            @click="navigate('planning')"
          >
            <ScheduleOutlined class="mb-item-icon" />
            <span class="mb-item-text">任务/日程/Todo</span>
            <span class="mb-item-count" v-if="planningCount">{{ planningCount }}</span>
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

        <!-- ===== OCR（仅 OCR 识别模块激活时显示） ===== -->
        <div v-if="ws.activeModule === 'invoice'" class="mb-group">
          <div class="mb-group-header">
            <span class="mb-group-title">OCR</span>
          </div>
          <div class="mb-group-body">
            <div
              class="mb-item mb-item--sub"
              :class="{ 'mb-item--active': isOcrSubActive('recognize') }"
              @click="navigateOcrSub('recognize')"
            >
              <FileTextOutlined class="mb-item-icon" />
              <span class="mb-item-text">录入识读</span>
            </div>
            <div
              class="mb-item mb-item--sub"
              :class="{ 'mb-item--active': isOcrSubActive('archive') }"
              @click="navigateOcrSub('archive')"
            >
              <InboxOutlined class="mb-item-icon" />
              <span class="mb-item-text">归集查阅</span>
            </div>
          </div>
        </div>

        <!-- ===== 文件分组（仅文件模块激活时显示） ===== -->
        <div v-if="ws.activeModule === 'file'" class="mb-group mb-group--flex">
          <div class="mb-group-header">
            <span class="mb-group-title">文件</span>
            <span class="mb-group-meta">{{ ws.folderList.length }}</span>
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
              <span class="mb-item-count" v-if="folder.file_count != null">{{ folder.file_count }}</span>
              <button class="mb-delete-btn" @click.stop="onDeleteFolder(folder)">
                <DeleteOutlined />
              </button>
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
              <!-- 对话右侧删除按钮 -->
              <button class="mb-delete-btn" @click.stop="onDeleteChatSession(session)">
                <DeleteOutlined />
              </button>
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
                class="mb-item mb-item--project"
                :class="{ 'mb-item--expanded': expandedProjects.has(project.id) }"
                @click="toggleProjectExpand(project)"
              >
                <!-- 展开/收缩箭头图标 -->
                <component
                  :is="expandedProjects.has(project.id) ? 'DownOutlined' : 'RightOutlined'"
                  class="mb-item-icon mb-item-icon--toggle"
                />
                <!-- 双击编辑项目名称 -->
                <input
                  v-if="editingType === 'project' && editingId === project.id"
                  ref="editInputRef"
                  v-model="editingText"
                  class="mb-edit-input"
                  @click.stop
                  @keydown.enter="saveProjectName(project)"
                  @keydown.escape="cancelEdit"
                  @blur="saveProjectName(project)"
                />
                <span
                  v-else
                  class="mb-item-text"
                  @dblclick.stop="startEditProject(project)"
                >{{ project.name }}</span>
                <!-- 项目右侧：删除按钮 + 添加会话按钮 -->
                <button class="mb-delete-btn" @click.stop="onDeleteProject(project)">
                  <DeleteOutlined />
                </button>
                <button class="mb-add-btn" @click.stop="onCreateAgentSession(project)">
                  <PlusOutlined />
                </button>
              </div>
              <!-- 该项目下的会话列表（仅在展开时显示） -->
              <template v-if="expandedProjects.has(project.id)">
                <div
                  v-for="sess in getVisibleSessions(project.id)"
                  :key="sess.id"
                  class="mb-item mb-item--sub"
                  :class="{ 'mb-item--active': agent.currentSessionId === sess.id }"
                  @click="onSelectAgentSession(sess, project)"
                >
                  <MessageOutlined class="mb-item-icon" />
                  <!-- 双击编辑会话名称 -->
                  <input
                    v-if="editingType === 'session' && editingId === sess.id"
                    ref="editInputRef"
                    v-model="editingText"
                    class="mb-edit-input"
                    @click.stop
                    @keydown.enter="saveSessionName(sess)"
                    @keydown.escape="cancelEdit"
                    @blur="saveSessionName(sess)"
                  />
                  <span
                    v-else
                    class="mb-item-text"
                    @dblclick.stop="startEditSession(sess)"
                  >{{ sess.title || '未命名' }}</span>
                  <!-- 会话右侧删除按钮 -->
                  <button class="mb-delete-btn" @click.stop="onDeleteAgentSession(sess, project)">
                    <DeleteOutlined />
                  </button>
                </div>
                <div v-if="getProjectSessions(project.id).length === 0" class="mb-empty mb-empty--sub">暂无会话</div>
                <!-- 会话超过 3 个时显示「显示更多 / 收起」按钮 -->
                <div
                  v-if="getProjectSessions(project.id).length > 3"
                  class="mb-session-toggle"
                  @click.stop="toggleSessionListExpand(project.id)"
                >
                  {{ expandedSessionLists.has(project.id) ? '收起' : `显示更多 (${getProjectSessions(project.id).length - 3})` }}
                </div>
              </template>
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

      <!-- 模块图标（文件/OCR识别/任务日程/技能） -->
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
        :class="{ 'mb-icon-btn--active': ws.activeModule === 'invoice' }"
        @click="navigate('invoice')"
      >
        <FileSearchOutlined />
      </button>
      <button
        type="button"
        class="mb-icon-btn"
        :class="{ 'mb-icon-btn--active': ws.activeModule === 'planning' }"
        @click="navigate('planning')"
      >
        <ScheduleOutlined />
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
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { message, Modal } from 'ant-design-vue'
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
  DownOutlined,
  RightOutlined,
  DeleteOutlined,
  ScheduleOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  InboxOutlined,
} from '@ant-design/icons-vue'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAgentStore } from '@/stores/agent'
import { usePlanningStore } from '@/stores/planning'
import { useTabStore } from '@/stores/tab'

const router = useRouter()
const route = useRoute()
const ws = useWorkspaceStore()
const agent = useAgentStore()
const planning = usePlanningStore()
const tabStore = useTabStore()

// 使用 storeToRefs 确保 store 的 ref 在 HMR 后仍然保持响应式
const { activeModule, selectedFolderId, selectedFile, selectedFileId } = storeToRefs(ws)

const addFolderLoading = ref(false)

// ===== 任务/日程 计数 =====
const planningCount = computed(() => planning.automations.length)

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
        ws.setActiveModule('agent')
      },
    }))
  }
  return []
})

// ===== 路由同步（Tab 模式下跳过，避免覆盖 Tab 设置的 activeModule） =====
watch(
  () => route.path,
  (path) => {
    if (tabStore.tabMode) return
    if (path.startsWith('/file')) ws.setActiveModule('file')
    else if (path.startsWith('/invoice')) ws.setActiveModule('invoice')
    else if (path.startsWith('/ocr/archive')) ws.setActiveModule('invoice')
    else if (path.startsWith('/planning')) ws.setActiveModule('planning')
    else if (path.startsWith('/skills')) ws.setActiveModule('skills')
    else if (path.startsWith('/chat')) ws.setActiveModule('chat')
    else if (path.startsWith('/agent')) ws.setActiveModule('agent')
    else if (path.startsWith('/setting')) ws.setActiveModule('setting')
  },
  { immediate: true },
)

/**
 * 导航函数
 * - 工具页面（file/invoice/planning/skills/setting）：退出 Tab 模式 + 路由跳转
 * - Chat/Agent：进入 Tab 模式，如果有当前会话则打开 Tab
 */
function navigate(key) {
  console.log('[MenuBar] navigate:', key)

  // 工具页面：退出 Tab 模式，走路由
  if (['file', 'invoice', 'planning', 'skills', 'setting'].includes(key)) {
    tabStore.exitTabMode()
    ws.setActiveModule(key)
    const map = { file: '/file', invoice: '/invoice', planning: '/planning', skills: '/skills', setting: '/setting' }
    if (map[key]) {
      router.push(map[key]).catch(err => console.error('[MenuBar] router.push 失败:', err))
    }
    return
  }

  // 点击 OCR 识别父菜单时，默认选中录入识读子菜单
  if (key === 'ocr') {
    tabStore.exitTabMode()
    ws.setActiveModule('invoice')
    router.push('/invoice').catch(err => console.error('[MenuBar] router.push 失败:', err))
    return
  }

  // Chat/Agent：进入 Tab 模式
  ws.setActiveModule(key)

  if (key === 'chat') {
    // 如果有当前会话，打开 Tab
    const sessionId = ws.currentChatSessionId
    if (sessionId) {
      const session = ws.chatSessions.find(s => s.id === sessionId)
      tabStore.openSessionTab('chat', sessionId, session?.title || 'Chat')
    } else {
      tabStore.enterTabMode()
    }
  } else if (key === 'agent') {
    // Agent 的 selectSession 会自动 openSessionTab
    const sessionId = agent.currentSessionId
    if (sessionId) {
      // Tab 已经存在或会被 selectSession 打开
      const session = agent.sessions.find(s => s.id === sessionId)
      if (session) {
        tabStore.openSessionTab('agent', sessionId, session.title || 'Agent 会话')
      }
    } else {
      tabStore.enterTabMode()
    }
  }
}

/** OCR 组子菜单导航 */
function navigateOcrSub(subKey) {
  tabStore.exitTabMode()
  ws.setActiveModule('invoice')
  if (subKey === 'recognize') {
    router.push('/invoice').catch(err => console.error('[MenuBar] router.push 失败:', err))
  } else if (subKey === 'archive') {
    router.push('/ocr/archive').catch(err => console.error('[MenuBar] router.push 失败:', err))
  }
}

/** 判断 OCR 组子菜单是否处于激活状态 */
function isOcrSubActive(subKey) {
  if (subKey === 'recognize') {
    return route.path.startsWith('/invoice')
  }
  if (subKey === 'archive') {
    return route.path.startsWith('/ocr/archive')
  }
  return false
}

// 展开模式下点击文件夹：通过 storeToRefs 的 ref 直接赋值，确保响应式触发
function onSelectFolder(folderId) {
  console.log('[MenuBar] onSelectFolder:', folderId, 'current:', selectedFolderId.value)
  selectedFolderId.value = folderId
  selectedFile.value = null
  selectedFileId.value = null
}

// 展开模式下点击 Chat 会话：进入 Tab 模式
function onSelectChatSession(sessionId) {
  console.log('[MenuBar] onSelectChatSession:', sessionId)
  ws.selectChatSession(sessionId)
  const session = ws.chatSessions.find(s => s.id === sessionId)
  tabStore.openSessionTab('chat', sessionId, session?.title || 'Chat')
  ws.setActiveModule('chat')
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

/** 删除授权文件夹（带确认弹窗，后端会同步删除 RAG 数据和取消监听） */
function onDeleteFolder(folder) {
  Modal.confirm({
    title: '删除文件夹',
    content: `确定要删除文件夹「${getFolderName(folder.path)}」吗？该文件夹下的所有文件和 RAG 向量数据将被一并删除。`,
    okText: '确认删除',
    cancelText: '取消',
    okType: 'danger',
    async onOk() {
      try {
        const result = await ws.deleteFolder(folder.id)
        if (result?.success) {
          message.success('文件夹已删除')
          await loadTotalFileCount()
        } else {
          message.error('删除文件夹失败')
        }
      } catch (err) {
        console.error('[MenuBar] 删除文件夹失败:', err)
        message.error('删除文件夹失败')
      }
    },
  })
}

async function onCreateChat() {
  await ws.createChatSession()
  // 创建后自动打开新会话的 Tab
  if (ws.currentChatSessionId) {
    const session = ws.chatSessions.find(s => s.id === ws.currentChatSessionId)
    tabStore.openSessionTab('chat', ws.currentChatSessionId, session?.title || '新会话')
  }
  ws.setActiveModule('chat')
}

/** 删除 Chat 会话（带确认弹窗） */
function onDeleteChatSession(session) {
  Modal.confirm({
    title: '删除对话',
    content: `确定要删除对话「${session.title || '新会话'}」吗？`,
    okText: '确认删除',
    cancelText: '取消',
    okType: 'danger',
    async onOk() {
      try {
        const res = await ipc.invoke('controller/assistant/sessionOperation', {
          action: 'delete',
          sessionId: session.id,
        })
        if (res.code === 0) {
          // 从列表中移除该会话
          ws.chatSessions = ws.chatSessions.filter((s) => s.id !== session.id)
          // 关闭对应的 Tab
          tabStore.closeTab(session.id)
          // 如果删除的是当前选中的会话，选中最新的会话
          if (ws.currentChatSessionId === session.id) {
            if (ws.chatSessions.length > 0) {
              ws.selectChatSession(ws.chatSessions[0].id)
              const newSession = ws.chatSessions[0]
              tabStore.openSessionTab('chat', newSession.id, newSession.title || 'Chat')
            } else {
              ws.currentChatSessionId = null
            }
          }
          message.success('对话已删除')
        } else {
          message.error(res?.message || '删除对话失败')
        }
      } catch (err) {
        console.error('[MenuBar] 删除对话失败:', err)
        message.error('删除对话失败')
      }
    },
  })
}

async function onCreateProject() {
  await ws.createAgentProject()
  ws.setActiveModule('agent')
}

// ===== 双击编辑名称 =====
const editingType = ref(null) // 'project' | 'session' | null
const editingId = ref(null)
const editingText = ref('')
const editInputRef = ref(null)

/** 双击项目名称进入编辑 */
function startEditProject(project) {
  editingType.value = 'project'
  editingId.value = project.id
  editingText.value = project.name
  nextTick(() => {
    editInputRef.value?.focus()
    editInputRef.value?.select()
  })
}

/** 双击会话名称进入编辑 */
function startEditSession(sess) {
  editingType.value = 'session'
  editingId.value = sess.id
  editingText.value = sess.title || ''
  nextTick(() => {
    editInputRef.value?.focus()
    editInputRef.value?.select()
  })
}

/** 取消编辑 */
function cancelEdit() {
  editingType.value = null
  editingId.value = null
  editingText.value = ''
}

/** 保存项目名称 */
async function saveProjectName(project) {
  const newName = editingText.value.trim()
  cancelEdit()
  if (!newName || newName === project.name) return
  try {
    const res = await ipc.invoke(ipcApiRoute.piAgent.workspaceOperation, {
      action: 'update',
      id: project.id,
      name: newName,
    })
    if (res.code === 0 && res.data) {
      // 更新本地列表中的项目名称
      const idx = ws.agentProjects.findIndex((p) => p.id === project.id)
      if (idx !== -1) {
        ws.agentProjects[idx] = { ...ws.agentProjects[idx], name: newName }
      }
      message.success('项目名称已更新')
    } else {
      message.error(res?.message || '更新项目名称失败')
    }
  } catch (err) {
    console.error('[MenuBar] 更新项目名称失败:', err)
    message.error('更新项目名称失败')
  }
}

/** 保存会话名称 */
async function saveSessionName(sess) {
  const newTitle = editingText.value.trim()
  cancelEdit()
  if (!newTitle || newTitle === sess.title) return
  try {
    const res = await ipc.invoke(ipcApiRoute.piAgent.sessionOperation, {
      action: 'update',
      sessionId: sess.id,
      title: newTitle,
      // 传递 workspaceId 和 channelId，防止后端更新时覆盖为 undefined 导致关联丢失
      workspaceId: sess.workspaceId || '',
      channelId: sess.channelId || '',
    })
    if (res.code === 0 && res.data) {
      // 更新 agent store 中的会话名称
      const idx = agent.sessions.findIndex((s) => s.id === sess.id)
      if (idx !== -1) {
        agent.sessions[idx] = { ...agent.sessions[idx], title: newTitle }
      }
      message.success('会话名称已更新')
    } else {
      message.error(res?.message || '更新会话名称失败')
    }
  } catch (err) {
    console.error('[MenuBar] 更新会话名称失败:', err)
    message.error('更新会话名称失败')
  }
}

// ===== 项目展开/收缩状态 =====
const expandedProjects = ref(new Set())

// ===== 会话列表「显示更多」状态（按 projectId 索引） =====
const expandedSessionLists = ref(new Set())

/** 单个项目最多默认显示的会话数 */
const SESSION_PREVIEW_LIMIT = 3

/** 监听项目列表变化，默认展开所有项目 */
watch(() => ws.agentProjects, (projects) => {
  if (projects && projects.length > 0) {
    const allIds = new Set(projects.map((p) => p.id))
    // 保留已有的展开状态，同时将新项目也默认展开
    const merged = new Set([...expandedProjects.value, ...allIds])
    expandedProjects.value = merged
  }
}, { immediate: true, deep: true })

/** 单击项目：展开/收缩会话列表，同时选中该项目 */
function toggleProjectExpand(project) {
  // 选中该项目
  ws.selectAgentProject(project.id)
  ws.setActiveModule('agent')
  // 切换展开状态
  if (expandedProjects.value.has(project.id)) {
    expandedProjects.value.delete(project.id)
  } else {
    expandedProjects.value.add(project.id)
  }
  // 触发响应式更新
  expandedProjects.value = new Set(expandedProjects.value)
}

/** 确保指定项目处于展开状态 */
function ensureProjectExpanded(projectId) {
  if (!expandedProjects.value.has(projectId)) {
    expandedProjects.value.add(projectId)
    expandedProjects.value = new Set(expandedProjects.value)
  }
}

/** 获取项目下可见的会话列表（收缩时只返回前 3 个） */
function getVisibleSessions(projectId) {
  const all = getProjectSessions(projectId)
  if (expandedSessionLists.value.has(projectId)) {
    return all
  }
  return all.slice(0, SESSION_PREVIEW_LIMIT)
}

/** 切换会话列表的「显示更多 / 收起」状态 */
function toggleSessionListExpand(projectId) {
  if (expandedSessionLists.value.has(projectId)) {
    expandedSessionLists.value.delete(projectId)
  } else {
    expandedSessionLists.value.add(projectId)
  }
  expandedSessionLists.value = new Set(expandedSessionLists.value)
}

/** 为指定项目创建 Agent 会话 */
async function onCreateAgentSession(project) {
  ws.selectAgentProject(project.id)
  // 确保项目展开，方便看到新建的会话
  ensureProjectExpanded(project.id)
  await agent.createSession(undefined, project.id)
  // createSession 内部会调用 selectSession，进而 openSessionTab
  ws.setActiveModule('agent')
}

/** 点击会话时：选中所属项目 + 选中会话 + 打开 Tab */
function onSelectAgentSession(sess, project) {
  // 选中会话所属的项目
  ws.selectAgentProject(project.id)
  // 确保项目展开
  ensureProjectExpanded(project.id)
  // selectSession 会打开 Tab 并懒加载消息
  agent.selectSession(sess.id)
  ws.setActiveModule('agent')
}

/** 删除项目（带确认弹窗） */
function onDeleteProject(project) {
  Modal.confirm({
    title: '删除项目',
    content: `确定要删除项目「${project.name}」吗？该项目下的所有会话将被一并删除。`,
    okText: '确认删除',
    cancelText: '取消',
    okType: 'danger',
    async onOk() {
      try {
        const res = await ws.deleteAgentProject(project.id)
        if (res && res.code === 0) {
          // 从 agent store 中移除该项目下的所有会话
          agent.sessions = agent.sessions.filter((s) => {
            const wid = s.workspaceId || s.workspace_id || s.projectId || ''
            return String(wid) !== String(project.id)
          })
          message.success('项目已删除')
          // 删除后选中最新的项目中的会话
          await selectNewestSession()
        } else {
          message.error(res?.message || '删除项目失败')
        }
      } catch (err) {
        console.error('[MenuBar] 删除项目失败:', err)
        message.error('删除项目失败')
      }
    },
  })
}

/** 删除会话（带确认弹窗） */
function onDeleteAgentSession(sess, project) {
  Modal.confirm({
    title: '删除会话',
    content: `确定要删除会话「${sess.title || '未命名'}」吗？`,
    okText: '确认删除',
    cancelText: '取消',
    okType: 'danger',
    async onOk() {
      try {
        const res = await ipc.invoke(ipcApiRoute.piAgent.sessionOperation, {
          action: 'delete',
          sessionId: sess.id,
        })
        if (res.code === 0) {
          // 从 agent store 中移除该会话
          agent.sessions = agent.sessions.filter((s) => s.id !== sess.id)
          // 清理该会话的消息和 Tab
          delete agent.messagesBySession[sess.id]
          tabStore.closeTab(sess.id)
          // 如果删除的是当前选中的会话，选中最新的会话
          if (agent.currentSessionId === sess.id) {
            await selectNewestSession()
          }
          message.success('会话已删除')
        } else {
          message.error(res?.message || '删除会话失败')
        }
      } catch (err) {
        console.error('[MenuBar] 删除会话失败:', err)
        message.error('删除会话失败')
      }
    },
  })
}

/** 删除后选中最新的项目中的会话 */
async function selectNewestSession() {
  // 确保项目列表是最新的
  if (ws.agentProjects.length === 0) return
  // 选中最新的项目（列表第一个，因为新创建的项目 unshift 到头部）
  const newestProject = ws.agentProjects[0]
  ws.selectAgentProject(newestProject.id)
  // 确保项目展开
  ensureProjectExpanded(newestProject.id)
  // 获取该项目下的会话列表
  const projectSessions = getProjectSessions(newestProject.id)
  if (projectSessions.length > 0) {
    // 选中最新的会话（列表第一个），selectSession 会自动 openSessionTab
    agent.selectSession(projectSessions[0].id)
  }
  ws.setActiveModule('agent')
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
  planning.loadAll().catch(() => { /* 规划数据加载失败不阻塞菜单 */ })
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

  // 项目名称项：不显示蓝色选中标识，使用展开/收缩图标代替
  &.mb-item--project {
    // 展开状态：加粗文字
    &.mb-item--expanded {
      color: var(--text-primary);
      font-weight: 600;
    }
  }

  // 展开/收缩箭头图标
  .mb-item-icon--toggle {
    font-size: 12px;
    transition: transform 0.2s ease;
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

  &--sub {
    padding: 6px 8px 6px 28px;
    text-align: left;
  }
}

// 会话「显示更多 / 收起」按钮
.mb-session-toggle {
  padding: 4px 8px 4px 28px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  transition: color 0.15s ease;
  user-select: none;

  &:hover {
    color: var(--accent);
  }
}

// 删除按钮（项目左侧 / 会话右侧）
.mb-delete-btn {
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
  font-size: 12px;
  flex-shrink: 0;
  transition: all 0.15s;
  -webkit-appearance: none;

  &:hover {
    background: rgba(255, 77, 79, 0.1);
    color: #ff4d4f;
  }
}

// 双击编辑名称输入框
.mb-edit-input {
  flex: 1;
  min-width: 0;
  height: 24px;
  border: 1px solid var(--accent);
  border-radius: 4px;
  padding: 0 6px;
  font-size: 13px;
  color: var(--text-primary);
  background: #fff;
  outline: none;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.15);
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
