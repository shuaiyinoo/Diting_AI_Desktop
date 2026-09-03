<template>
  <div class="flex h-full w-full overflow-hidden bg-background" ref="workspaceRef">
    <!--
      三栏布局：左 | 中 | 右
      默认布局（panelSwapped=false）：Chat(flex-1) | 分隔条 | 编辑器(fixed) | 分隔条 | FilePanel(fixed)
      交换布局（panelSwapped=true） ：FilePanel(fixed) | 分隔条 | 编辑器(fixed) | 分隔条 | Chat(flex-1)
      每个固定宽度面板前面都有一个分隔条，分别调整各自的宽度
    -->

    <!-- ===== 默认布局：Chat 左 | 编辑器中 | FilePanel 右 ===== -->
    <template v-if="!ws.panelSwapped">
      <!-- Chat 面板（flex-1 自适应） -->
      <div class="relative flex min-w-0 flex-1 flex-col">
        <AgentChatToolbar
          :is-streaming="isStreaming"
          :code-editor-visible="ws.codeEditorVisible"
          :panel4-collapsed="panel4Collapsed"
          :toolbar-title="toolbarTitle"
          @toggle-code-editor="ws.toggleCodeEditor"
          @toggle-panel-swap="ws.togglePanelSwap"
          @toggle-panel4="togglePanel4"
        />
        <AgentPermissionPopup
          :request="permissionRequest"
          :responding="permissionResponding"
          @resolve="resolvePermission"
        />
        <AgentAskUserPopup
          :request="askUserRequest"
          :answers="askUserAnswers"
          :responding="askUserResponding"
          @toggle="toggleAskUserOption"
          @submit="submitAskUser"
          @dismiss="dismissAskUser"
        />
        <div class="min-h-0 flex-1 overflow-y-auto" ref="messagesRef" @scroll="onMessagesScroll">
          <AgentMessageList
            :messages="messages"
            :is-streaming="isStreaming"
            :model-name="selectedModel || 'Agent'"
            :model-logo="aiLogo"
            :message-stats="messageStats"
            @citation-click="onCitationClick"
          />
        </div>
        <AgentChatInput
          v-model="inputText"
          :is-streaming="isStreaming"
          :focused="inputFocused"
          :placeholder="inputPlaceholder"
          :session-id="currentSessionId"
          :workspace-id="ws.currentAgentProject?.id"
          :workspace-slug="ws.currentAgentProject?.slug || 'default'"
          :models="availableModels"
          v-model:selected-model="selectedModel"
          v-model:permission-mode="permissionMode"
          v-model:thinking-level="thinkingLevel"
          :delegations="delegations"
          :task-blocks="currentTaskBlocks"
          :confirm-mode="permissionMode === 'ask'"
          @submit="sendMessage"
          @stop="stopGeneration"
          @focus="inputFocused = true"
          @blur="inputFocused = false"
        />
        <!-- ========== 用户消息浮动指示器（固定在面板右侧，不随滚动） ========== -->
        <div
          v-if="userMessages.length > 0"
          class="pointer-events-none absolute right-3 top-1/2 z-10 -translate-y-1/2"
        >
          <div
            class="flex items-start gap-2 rounded-md border border-transparent px-2 py-2 transition-colors duration-200"
            :class="railHovering ? 'border-border bg-card shadow-[0_2px_12px_rgba(0,0,0,0.08)]' : ''"
          >
            <div class="flex flex-col gap-2">
              <div
                v-for="(um, idx) in userMessages"
                :key="um.id"
                class="flex h-5 items-center"
              >
                <div
                  class="w-[180px] shrink-0 truncate text-right text-xs leading-5 transition-colors duration-150"
                  :class="railHovering
                    ? (railHoverIdx === idx ? 'opacity-100 text-primary font-medium' : 'opacity-100 text-muted-foreground')
                    : 'opacity-0'"
                >
                  {{ um.content }}
                </div>
              </div>
            </div>

            <div class="flex flex-col gap-2">
              <div
                v-for="(um, idx) in userMessages"
                :key="um.id"
                class="flex h-5 w-7 shrink-0 items-center justify-end"
              >
                <div
                  class="rounded-full transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  :class="railHoverIdx === idx
                    ? 'w-7 h-[5px] bg-primary shadow-[0_0_8px_rgba(22,119,255,0.3)]'
                    : 'w-5 h-[3px] bg-border'"
                />
              </div>
            </div>
          </div>

          <div
            class="absolute top-0 cursor-pointer pointer-events-auto"
            :class="railHovering ? 'inset-0 z-10' : 'right-0 bottom-0 z-20'"
            :style="railHovering ? {} : { width: '28px' }"
            @mouseenter="railHovering = true"
            @mouseleave="railHovering = false; railHoverIdx = -1"
          >
            <div
              v-if="railHovering"
              class="absolute inset-0 flex flex-col gap-2 py-2 pointer-events-auto"
            >
              <div
                v-for="(um, idx) in userMessages"
                :key="um.id"
                class="flex h-5 items-center pr-2"
                @mouseenter="railHoverIdx = idx"
                @click.stop="jumpToMessage(um.id)"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 编辑器 + 分隔条（编辑器左侧分隔条调编辑器宽度） -->
      <template v-if="ws.codeEditorVisible">
        <PanelDivider @resize="onCodeEditorResize" />
        <div
          class="flex min-w-0 flex-col border-l border-border"
          :style="{ width: codeEditorWidth + 'px', flexShrink: 0 }"
        >
          <AgentCodeEditor
            :open-files="codeEditorFiles"
            :active-file-id="codeEditorActiveFileId"
            :terminal-panel-visible="ws.terminalPanelVisible"
            :terminal-cwd="terminalCwd"
            @activate-file="activateCodeFile"
            @close-file="closeCodeFile"
            @content-changed="onCodeContentChanged"
            @save-file="onSaveCodeFile"
            @close-all="closeAllCodeFilesAndHide"
            @open-file-by-path="onOpenFileByPath"
            @toggle-terminal="ws.toggleTerminalPanel"
          />
        </div>
      </template>

      <!-- FilePanel + 分隔条（FilePanel 左侧分隔条调 FilePanel 宽度） -->
      <template v-if="!panel4Collapsed">
        <PanelDivider @resize="onPanel4Resize" />
        <AgentFilePanel
          :width="panel4Width"
          :mode="filePanelMode"
          :file-tree="fileTree"
          :attached-dirs="attachedDirs"
          :expanded-attached-dirs="expandedAttachedDirs"
          :attached-dir-children="attachedDirChildren"
          :expanded-dirs="expandedDirs"
          :session-path="sessionPathDisplay"
          :project-path="projectPathDisplay"
          :active-file-id="codeEditorActiveFileId"
          :changed-file-tree="changedFileTree"
          :expanded-changed-dirs="expandedChangedDirs"
          :changed-count="changedFileCount"
          border-side="left"
          @switch-mode="switchFileMode"
          @add-file="onAddFile"
          @attach-folder="onAttachFolder"
          @detach-folder="onDetachFolder"
          @toggle-dir="toggleDir"
          @open-file="openFile"
          @toggle-attached-dir="toggleAttachedDir"
          @open-attached-file="openAttachedFile"
          @open-folder="openFolderHandler"
          @refresh-git-status="refreshGitStatus"
          @open-changed-file="openChangedFile"
          @toggle-changed-dir="toggleChangedDir"
        />
      </template>
    </template>

    <!-- ===== 交换布局：FilePanel 左 | 编辑器中 | Chat 右 ===== -->
    <template v-else>
      <!-- FilePanel + 分隔条（FilePanel 右侧分隔条调 FilePanel 宽度） -->
      <template v-if="!panel4Collapsed">
        <AgentFilePanel
          :width="panel4Width"
          :mode="filePanelMode"
          :file-tree="fileTree"
          :attached-dirs="attachedDirs"
          :expanded-attached-dirs="expandedAttachedDirs"
          :attached-dir-children="attachedDirChildren"
          :expanded-dirs="expandedDirs"
          :session-path="sessionPathDisplay"
          :project-path="projectPathDisplay"
          :active-file-id="codeEditorActiveFileId"
          :changed-file-tree="changedFileTree"
          :expanded-changed-dirs="expandedChangedDirs"
          :changed-count="changedFileCount"
          border-side="right"
          @switch-mode="switchFileMode"
          @add-file="onAddFile"
          @attach-folder="onAttachFolder"
          @detach-folder="onDetachFolder"
          @toggle-dir="toggleDir"
          @open-file="openFile"
          @toggle-attached-dir="toggleAttachedDir"
          @open-attached-file="openAttachedFile"
          @open-folder="openFolderHandler"
          @refresh-git-status="refreshGitStatus"
          @open-changed-file="openChangedFile"
          @toggle-changed-dir="toggleChangedDir"
        />
        <PanelDivider @resize="onPanel4Resize" />
      </template>

      <!-- 编辑器 + 分隔条（编辑器右侧分隔条调编辑器宽度） -->
      <template v-if="ws.codeEditorVisible">
        <div
          class="flex min-w-0 flex-col border-r border-border"
          :style="{ width: codeEditorWidth + 'px', flexShrink: 0 }"
        >
          <AgentCodeEditor
            :open-files="codeEditorFiles"
            :active-file-id="codeEditorActiveFileId"
            :terminal-panel-visible="ws.terminalPanelVisible"
            :terminal-cwd="terminalCwd"
            @activate-file="activateCodeFile"
            @close-file="closeCodeFile"
            @content-changed="onCodeContentChanged"
            @save-file="onSaveCodeFile"
            @close-all="closeAllCodeFilesAndHide"
            @open-file-by-path="onOpenFileByPath"
            @toggle-terminal="ws.toggleTerminalPanel"
          />
        </div>
        <PanelDivider @resize="onCodeEditorResize" />
      </template>

      <!-- Chat 面板（flex-1 自适应） -->
      <div class="relative flex min-w-0 flex-1 flex-col">
        <AgentChatToolbar
          :is-streaming="isStreaming"
          :code-editor-visible="ws.codeEditorVisible"
          :panel4-collapsed="panel4Collapsed"
          :toolbar-title="toolbarTitle"
          @toggle-code-editor="ws.toggleCodeEditor"
          @toggle-panel-swap="ws.togglePanelSwap"
          @toggle-panel4="togglePanel4"
        />
        <AgentPermissionPopup
          :request="permissionRequest"
          :responding="permissionResponding"
          @resolve="resolvePermission"
        />
        <AgentAskUserPopup
          :request="askUserRequest"
          :answers="askUserAnswers"
          :responding="askUserResponding"
          @toggle="toggleAskUserOption"
          @submit="submitAskUser"
          @dismiss="dismissAskUser"
        />
        <div class="min-h-0 flex-1 overflow-y-auto" ref="messagesRef" @scroll="onMessagesScroll">
          <AgentMessageList
            :messages="messages"
            :is-streaming="isStreaming"
            :model-name="selectedModel || 'Agent'"
            :model-logo="aiLogo"
            :message-stats="messageStats"
            @citation-click="onCitationClick"
          />
        </div>
        <AgentChatInput
          v-model="inputText"
          :is-streaming="isStreaming"
          :focused="inputFocused"
          :placeholder="inputPlaceholder"
          :session-id="currentSessionId"
          :workspace-id="ws.currentAgentProject?.id"
          :workspace-slug="ws.currentAgentProject?.slug || 'default'"
          :models="availableModels"
          v-model:selected-model="selectedModel"
          v-model:permission-mode="permissionMode"
          v-model:thinking-level="thinkingLevel"
          :delegations="delegations"
          :task-blocks="currentTaskBlocks"
          :confirm-mode="permissionMode === 'ask'"
          @submit="sendMessage"
          @stop="stopGeneration"
          @focus="inputFocused = true"
          @blur="inputFocused = false"
        />
        <!-- ========== 用户消息浮动指示器（固定在面板右侧，不随滚动） ========== -->
        <div
          v-if="userMessages.length > 0"
          class="pointer-events-none absolute right-3 top-1/2 z-10 -translate-y-1/2"
        >
          <div
            class="flex items-start gap-2 rounded-md border border-transparent px-2 py-2 transition-colors duration-200"
            :class="railHovering ? 'border-border bg-card shadow-[0_2px_12px_rgba(0,0,0,0.08)]' : ''"
          >
            <div class="flex flex-col gap-2">
              <div
                v-for="(um, idx) in userMessages"
                :key="um.id"
                class="flex h-5 items-center"
              >
                <div
                  class="w-[180px] shrink-0 truncate text-right text-xs leading-5 transition-colors duration-150"
                  :class="railHovering
                    ? (railHoverIdx === idx ? 'opacity-100 text-primary font-medium' : 'opacity-100 text-muted-foreground')
                    : 'opacity-0'"
                >
                  {{ um.content }}
                </div>
              </div>
            </div>

            <div class="flex flex-col gap-2">
              <div
                v-for="(um, idx) in userMessages"
                :key="um.id"
                class="flex h-5 w-7 shrink-0 items-center justify-end"
              >
                <div
                  class="rounded-full transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  :class="railHoverIdx === idx
                    ? 'w-7 h-[5px] bg-primary shadow-[0_0_8px_rgba(22,119,255,0.3)]'
                    : 'w-5 h-[3px] bg-border'"
                />
              </div>
            </div>
          </div>

          <div
            class="absolute top-0 cursor-pointer pointer-events-auto"
            :class="railHovering ? 'inset-0 z-10' : 'right-0 bottom-0 z-20'"
            :style="railHovering ? {} : { width: '28px' }"
            @mouseenter="railHovering = true"
            @mouseleave="railHovering = false; railHoverIdx = -1"
          >
            <div
              v-if="railHovering"
              class="absolute inset-0 flex flex-col gap-2 py-2 pointer-events-auto"
            >
              <div
                v-for="(um, idx) in userMessages"
                :key="um.id"
                class="flex h-5 items-center pr-2"
                @mouseenter="railHoverIdx = idx"
                @click.stop="jumpToMessage(um.id)"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAgentStore } from '@/stores/agent'
import { useTabStore } from '@/stores/tab'
import { useBrowserStore } from '@/stores/browser'
import PanelDivider from '@/components/layout/PanelDivider.vue'
import AgentPermissionPopup from '@/components/agent/AgentPermissionPopup.vue'
import AgentAskUserPopup from '@/components/agent/AgentAskUserPopup.vue'
import AgentMessageList from '@/components/agent/AgentMessageList.vue'
import AgentFilePanel from '@/components/agent/AgentFilePanel.vue'
import AgentChatInput from '@/components/agent/AgentChatInput.vue'
import AgentChatToolbar from '@/components/agent/AgentChatToolbar.vue'
import AgentCodeEditor from '@/components/agent/AgentCodeEditor.vue'
import { hasTaskBlocks } from '@/utils/task-progress'
import { getModelLogo, LOGO_DEFAULT } from '@/utils/model-logo'
import { inferProviderType } from '@/utils/provider-presets'

const { t } = useI18n()

const ws = useWorkspaceStore()
const browserStore = useBrowserStore()
const agentStore = useAgentStore()

const props = defineProps({
  sessionId: { type: String, default: null },
})

const tabStore = useTabStore()

watch(() => props.sessionId, (sid) => {
  if (sid && agentStore.currentSessionId !== sid) {
    tabStore.activateTab(sid)
  }
}, { immediate: false })

// ========== AI 头像 logo ==========
const aiLogo = computed(() => {
  const model = availableModels.value.find((m) => m.id === selectedModel.value)
  if (model) {
    return getModelLogo(model.model_name, inferProviderType(model.provider, model.base_url)) || LOGO_DEFAULT
  }
  return LOGO_DEFAULT
})

// ========== 顶部标题 ==========
const toolbarTitle = computed(() => {
  const projectName = ws.currentAgentProject?.name
  const sessionId = agentStore.currentSessionId
  const session = agentStore.sessions.find((s) => s.id === sessionId)
  const sessionName = session?.title || agentStore.currentSession?.title
  if (projectName && sessionName) return `${projectName} / ${sessionName}`
  return sessionName || projectName || 'Agent'
})

// ========== HTTP 服务器地址 ==========
const httpServerUrl = ref('http://127.0.0.1:7071')

// ========== 模型选择 ==========
const selectedModel = ref(null)
const availableModels = ref([])

// ========== 权限模式 & 思考深度 ==========
const permissionMode = computed({
  get: () => agentStore.permissionMode,
  set: (val) => { agentStore.permissionMode = val },
})
const thinkingLevel = ref('high')

// ========== 面板宽度 & 折叠 ==========
const workspaceRef = ref(null)
const panel4Width = ref(300)
const panel4Collapsed = ref(true)

/** Chat 面板最小宽度 */
const MIN_CHAT_WIDTH = 300
/** 编辑器最小宽度 */
const MIN_EDITOR_WIDTH = 200
/** 文件面板最小宽度 */
const MIN_PANEL4_WIDTH = 240

/**
 * 限制固定面板宽度，确保 Chat 面板有足够空间
 * 当三栏同时显示时，两个固定面板总宽度不超过容器宽度 - MIN_CHAT_WIDTH
 */
function clampPanelWidths() {
  if (!workspaceRef.value) return
  const containerWidth = workspaceRef.value.clientWidth
  if (containerWidth <= 0) return

  // 只有三栏同时显示时才需要约束
  const editorVisible = ws.codeEditorVisible
  const panel4Visible = !panel4Collapsed.value

  if (editorVisible && panel4Visible) {
    const maxFixed = containerWidth - MIN_CHAT_WIDTH
    let editorW = codeEditorWidth.value
    let panel4W = panel4Width.value
    const total = editorW + panel4W

    if (total > maxFixed) {
      // 按比例缩减两个面板
      const ratio = maxFixed / total
      editorW = Math.max(MIN_EDITOR_WIDTH, Math.floor(editorW * ratio))
      panel4W = Math.max(MIN_PANEL4_WIDTH, Math.floor(panel4W * ratio))
      // 如果缩减后仍然超限，优先保文件面板最小宽度
      if (editorW + panel4W > maxFixed) {
        panel4W = Math.max(MIN_PANEL4_WIDTH, maxFixed - editorW)
        if (editorW + panel4W > maxFixed) {
          editorW = Math.max(MIN_EDITOR_WIDTH, maxFixed - panel4W)
        }
      }
      codeEditorWidth.value = editorW
      panel4Width.value = panel4W
    }
  } else if (editorVisible && !panel4Visible) {
    // 编辑器 + Chat：编辑器不超过容器宽度 - MIN_CHAT_WIDTH
    const maxEditor = containerWidth - MIN_CHAT_WIDTH
    if (codeEditorWidth.value > maxEditor) {
      codeEditorWidth.value = Math.max(MIN_EDITOR_WIDTH, maxEditor)
    }
  } else if (!editorVisible && panel4Visible) {
    // 文件面板 + Chat：文件面板不超过容器宽度 - MIN_CHAT_WIDTH
    const maxPanel4 = containerWidth - MIN_CHAT_WIDTH
    if (panel4Width.value > maxPanel4) {
      panel4Width.value = Math.max(MIN_PANEL4_WIDTH, Math.min(400, maxPanel4))
    }
  }
}

function togglePanel4() {
  panel4Collapsed.value = !panel4Collapsed.value
  // 打开文件面板时检查宽度约束
  nextTick(() => clampPanelWidths())
}

watch(() => browserStore.forceFilePanelCollapsed, (forced) => {
  if (forced && !panel4Collapsed.value) {
    panel4Collapsed.value = true
  }
})

/**
 * FilePanel 面板拖拽 resize
 *
 * PanelDivider 的 delta 始终是：向右拖为正，向左拖为负
 *
 * 默认布局 DOM: [Chat] [Divider] [编辑器] [Divider→本函数] [FilePanel]
 *   分隔条在 FilePanel 左侧，向右拖缩小 FilePanel 宽度
 *   delta 为正 → width -= delta
 *
 * 交换布局 DOM: [FilePanel] [Divider→本函数] [编辑器] [Divider] [Chat]
 *   分隔条在 FilePanel 右侧，向右拖增大 FilePanel 宽度
 *   delta 为正 → width += delta
 */
function onPanel4Resize(delta) {
  const adjusted = ws.panelSwapped ? delta : -delta
  panel4Width.value = Math.min(400, Math.max(MIN_PANEL4_WIDTH, panel4Width.value + adjusted))
  // 拖拽时也约束总宽度
  clampPanelWidths()
}

// ========== 数据 ==========
const sessions = computed(() => agentStore.sessions)
const currentSessionId = computed(() => agentStore.currentSessionId)
const currentSession = computed(() => agentStore.currentSession)
const messages = computed(() => agentStore.messages)
const isStreaming = computed(() => agentStore.isStreaming)

// ========== 任务进度 ==========
const currentTaskBlocks = computed(() => {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const msg = messages.value[i]
    if (msg.role === 'assistant' && msg.pending) return msg.blocks || []
  }
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const msg = messages.value[i]
    if (msg.role === 'assistant' && msg.blocks && msg.blocks.length > 0) return msg.blocks
  }
  return []
})

const inputText = ref('')
const messagesRef = ref(null)
const inputFocused = ref(false)
const isAtBottom = ref(true)
let pendingScrollToBottom = false

const inputPlaceholder = computed(() =>
  t('agent.inputPlaceholder')
)

// ========== 文件面板 ==========
const fileTree = ref([])
const attachedDirs = ref([])
const filePanelMode = ref('session')
const fileLoading = ref(false)
const sessionPathDisplay = ref('')

/** 改动文件树：每个有 git 变更的附加文件夹一个节点，内含变更文件列表 */
const changedFileTree = ref([])
/** 改动文件 Tab 的展开状态 */
const expandedChangedDirs = ref(new Set())

/** 改动文件数量（徽标用） */
const changedFileCount = computed(() => {
  let count = 0
  for (const dir of changedFileTree.value) {
    count += dir.files.length
  }
  return count
})

const projectPathDisplay = computed(() => {
  const project = ws.currentAgentProject
  if (!project) return ''
  return project.resolvedPath || project.projectPath || ''
})

/** 终端默认工作目录：优先使用会话路径，其次项目路径 */
const terminalCwd = computed(() => {
  return sessionPathDisplay.value || projectPathDisplay.value || ''
})

const permissionRequest = ref(null)
const permissionResponding = ref(false)
const askUserRequest = ref(null)
const askUserResponding = ref(false)
const askUserAnswers = reactive(new Map())

// ========== 协作子 Agent ==========
const delegations = computed(() => {
  const sid = agentStore.currentSessionId
  return sid ? (agentStore.allDelegations[sid] || []) : []
})

// ========== Token 统计 ==========
const messageStats = computed(() => agentStore.messageStats)

// ========== 用户消息导航 ==========
const railHoverIdx = ref(-1)
const railHovering = ref(false)

const userMessages = computed(() =>
  messages.value.filter((m) => m.role === 'user')
)

function jumpToMessage(msgId) {
  const el = document.getElementById('msg-' + msgId)
  if (el && messagesRef.value) {
    messagesRef.value.scrollTo({
      top: el.offsetTop - messagesRef.value.offsetTop - 12,
      behavior: 'smooth',
    })
  }
}

// ========== 生命周期 ==========
onMounted(async () => {
  await loadHttpServerUrl()
  await loadEnabledModel()
  await agentStore.loadSessions()

  const pending = agentStore.pendingPrompt
  if (pending && pending.sessionId) {
    await agentStore.selectSession(pending.sessionId)
    const promptText = pending.message
    agentStore.pendingPrompt = null
    await nextTick()
    if (promptText && !isStreaming.value) {
      await sendMessageWithText(promptText)
    }
  } else if (agentStore.sessions.length > 0 && !agentStore.currentSessionId) {
    // 无活跃会话：选中第一个会话
    await agentStore.selectSession(agentStore.sessions[0].id)
  } else if (agentStore.currentSessionId) {
    // Tab 恢复了上次会话：检查会话是否仍存在
    const sessionExists = agentStore.sessions.some((s) => s.id === agentStore.currentSessionId)
    if (sessionExists) {
      // 确保消息已加载
      if (!agentStore.messagesBySession[agentStore.currentSessionId]) {
        await agentStore.loadMessages(agentStore.currentSessionId)
      }
      pendingScrollToBottom = true
      await nextTick()
      scrollToBottom(true)
    } else if (agentStore.sessions.length > 0) {
      // 上次会话已失效：选中第一个会话
      await agentStore.selectSession(agentStore.sessions[0].id)
    }
  } else if (messages.value.length > 0) {
    isAtBottom.value = true
    await nextTick()
    scrollToBottom(true)
  }
  loadFileTree()

  // 监听窗口大小变化，约束面板宽度
  windowResizeHandler = () => clampPanelWidths()
  window.addEventListener('resize', windowResizeHandler)
  // 初始检查一次
  nextTick(() => clampPanelWidths())
})

// ========== Watchers ==========
watch(() => ws.currentAgentProjectId, () => loadFileTree())
watch(() => currentSessionId.value, async () => {
  // 会话切换时需要刷新 attachedDirs（项目级数据），无论当前 filePanelMode 是什么
  // 因为 mode='changed' 时 loadFileTree 会走 session 分支，返回空 attachedDirs
  // 所以这里直接调用 ensureAttachedDirs 来获取正确的项目附加目录
  await ensureAttachedDirs()
  // 会话切换时刷新改动文件列表（此时 attachedDirs 已更新）
  await loadChangedFiles()
})
watch(() => isStreaming.value, async (streaming, wasStreaming) => {
  if (wasStreaming && !streaming) {
    // 先确保 attachedDirs 是最新的（不依赖 filePanelMode）
    await ensureAttachedDirs()
    // Agent 完成后刷新改动文件（此时 attachedDirs 已更新）
    await loadChangedFiles()
  }
})
watch(() => agentStore.currentSessionId, () => {
  pendingScrollToBottom = true
})
watch(() => messages.value.length, async () => {
  if (pendingScrollToBottom && messages.value.length > 0) {
    pendingScrollToBottom = false
    isAtBottom.value = true
    await nextTick()
    scrollToBottom(true)
  }
})

// ========== HTTP 服务器 ==========
async function loadHttpServerUrl() {
  try {
    const data = await ipc.invoke(ipcApiRoute.framework.checkHttpServer)
    if (data && data.enable && data.server) {
      httpServerUrl.value = data.server
    }
  } catch (err) {
    console.warn('[agent] 获取 HTTP 服务器地址失败:', err)
  }
}

// ========== 模型 ==========
async function loadEnabledModel() {
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'getEnabled' })
    if (res.code === 0 && res.data) {
      const m = res.data
      availableModels.value = [{ id: m.model_name, name: m.name || m.model_name, model_name: m.model_name, provider: m.provider, base_url: m.base_url }]
      selectedModel.value = m.model_name
    }
  } catch (err) {
    console.error('[agent] 加载已启用模型失败:', err)
  }
}

// ========== 文件面板 ==========
function switchFileMode(mode) {
  if (filePanelMode.value === mode) return
  filePanelMode.value = mode
  if (mode === 'changed') {
    loadChangedFiles()
  } else {
    loadFileTree()
  }
}

/**
 * 加载改动文件数据：遍历所有附加文件夹，获取有 git 变更的文件
 * 按附加文件夹分组，每个文件夹下显示有变更的文件列表
 */
async function loadChangedFiles() {
  changedFileTree.value = []

  // attachedDirs 应由调用前的 ensureAttachedDirs 保证已更新
  // 这里保留 fallback 作为安全保障
  let dirs = attachedDirs.value
  if (dirs.length === 0 && ws.currentAgentProject?.attachedDirectories) {
    dirs = ws.currentAgentProject.attachedDirectories
    attachedDirs.value = dirs
  }
  if (dirs.length === 0) return

  const result = []
  for (const dirPath of dirs) {
    try {
      const res = await ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
        action: 'refreshGitStatus',
        folderPath: dirPath,
      })
      if (res.code === 0 && res.data?.isGitRepo) {
        const statusMap = res.data.statusMap || {}
        const diffStat = res.data.diffStat || {}
        // 从 statusMap 中提取有变更的文件
        const files = []
        for (const [filePath, status] of Object.entries(statusMap)) {
          // 跳过 deleted 状态的文件（已删除不展示）
          if (status === 'deleted') continue
          const stat = diffStat[filePath] || { insertions: 0, deletions: 0 }
          const fileName = filePath.split('/').pop() || filePath
          files.push({
            path: filePath,
            name: fileName,
            gitStatus: status,
            insertions: stat.insertions || 0,
            deletions: stat.deletions || 0,
            dirPath,
          })
        }
        if (files.length > 0) {
          const dirName = dirPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || dirPath
          result.push({
            dirPath,
            dirName,
            files,
          })
          // 自动展开
          expandedChangedDirs.value.add(dirPath)
        }
      }
    } catch (err) {
      console.error('[agent] 加载改动文件失败:', err)
    }
  }
  expandedChangedDirs.value = new Set(expandedChangedDirs.value)
  changedFileTree.value = result
}

/** 展开/折叠改动文件中的文件夹 */
function toggleChangedDir(dirPath) {
  if (expandedChangedDirs.value.has(dirPath)) {
    expandedChangedDirs.value.delete(dirPath)
  } else {
    expandedChangedDirs.value.add(dirPath)
  }
  expandedChangedDirs.value = new Set(expandedChangedDirs.value)
}

/**
 * 点击改动文件：获取 git diff 并在代码查看器中打开前后对比
 */
async function openChangedFile(file) {
  // 构造文件 ID
  const fileId = `${file.dirPath}/${file.path}`
  // 如果文件已在编辑器中打开，直接激活
  const existing = codeEditorFiles.value.find((f) => f.id === fileId)
  if (existing) {
    codeEditorActiveFileId.value = fileId
    saveCodeEditorState()
    return
  }

  try {
    // 获取 git diff 内容
    const diffRes = await ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
      action: 'getDiff',
      folderPath: file.dirPath,
      filePath: file.path,
    })
    const diffContent = (diffRes.code === 0 && diffRes.data?.diff) ? diffRes.data.diff : ''
    // 后端返回 HEAD 版本的完整文件内容，用于 diffEditor 的 original side
    const originalContent = (diffRes.code === 0 && diffRes.data?.originalContent !== undefined) ? diffRes.data.originalContent : ''

    // 同时读取文件当前内容
    const readRes = await ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
      action: 'read',
      workspaceId: ws.currentAgentProject?.id,
      sessionId: currentSessionId.value,
      mode: 'project',
      filePath: file.path,
      folderPath: file.dirPath,
    })

    if (readRes.code === 0 && readRes.data && !readRes.data.isBinary) {
      const data = readRes.data
      codeEditorFiles.value.push({
        id: fileId,
        name: data.name || file.name,
        path: file.path,
        content: data.content || '',
        ext: data.ext || (file.name.split('.').pop() || ''),
        attachedDirPath: file.dirPath,
        mode: 'project',
        gitStatus: file.gitStatus,
        originalContent,
      })
      codeEditorActiveFileId.value = fileId
      if (!ws.codeEditorVisible) {
        ws.codeEditorVisible = true
        localStorage.setItem('agent:codeEditorVisible', 'true')
      }
      saveCodeEditorState()
    } else if (readRes.data?.isBinary) {
      toast.info(t('agentCodeEditor.binaryNotSupported'))
    }
  } catch (err) {
    console.error('[agent] 打开改动文件失败:', err)
    toast.error(t('agent.openChangedFileFailed'))
  }
}

/**
 * 确保 attachedDirs 是最新的（不受 filePanelMode 影响）
 * 专门用 mode='project' 获取项目附加目录列表
 * 用于会话切换/Agent完成时，在 loadChangedFiles 之前调用
 */
async function ensureAttachedDirs() {
  const workspaceId = ws.currentAgentProject?.id
  if (!workspaceId) {
    attachedDirs.value = []
    return
  }
  try {
    const res = await ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
      action: 'list',
      workspaceId,
      sessionId: currentSessionId.value,
      mode: 'project',
    })
    if (res.code === 0) {
      const data = res.data || {}
      attachedDirs.value = data.attachedDirs || []
    }
  } catch (err) {
    console.error('[agent] 获取附加目录失败:', err)
  }
}

async function loadFileTree() {
  fileTree.value = []
  // attachedDirs 是项目级数据，仅在 project 模式下更新
  // session 模式后端返回空 attachedDirs，不应覆盖已有的项目附加目录
  if (filePanelMode.value === 'project') {
    attachedDirs.value = []
  }
  fileLoading.value = true
  try {
    const workspaceId = ws.currentAgentProject?.id
    if (!workspaceId && filePanelMode.value === 'project') {
      fileLoading.value = false
      return
    }
    const res = await ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
      action: 'list',
      workspaceId,
      sessionId: currentSessionId.value,
      mode: filePanelMode.value,
    })
    if (res.code === 0) {
      const data = res.data || {}
      fileTree.value = data.files || []
      // 只在 project 模式下更新 attachedDirs
      if (filePanelMode.value === 'project') {
        attachedDirs.value = data.attachedDirs || []
      }
      sessionPathDisplay.value = data.resolvedPath || ''
    }
  } catch (err) {
    console.error('[agent] 加载文件列表失败:', err)
  } finally {
    fileLoading.value = false
  }
}

async function onAddFile() {
  const workspaceId = ws.currentAgentProject?.id
  if (!workspaceId) { toast.warning(t('agent.selectProject')); return }
  if (filePanelMode.value === 'session' && !currentSessionId.value) { toast.warning(t('agent.noActiveSession')); return }
  try {
    const res = await ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
      action: 'add', workspaceId, sessionId: currentSessionId.value, mode: filePanelMode.value,
    })
    if (res.code === 0) {
      const data = res.data || {}
      fileTree.value = data.files || []
      attachedDirs.value = data.attachedDirs || []
      if (res.message && res.message !== t('agent.userCancelled')) toast.success(res.message)
    } else {
      toast.error(res.message || t('agent.addFileFailed'))
    }
  } catch (err) {
    console.error('[agent] 添加文件失败:', err)
    toast.error(t('agent.addFileFailed'))
  }
}

async function onAttachFolder() {
  const workspaceId = ws.currentAgentProject?.id
  if (!workspaceId) { toast.warning(t('agent.selectProject')); return }
  try {
    const folderPath = await ipc.invoke(ipcApiRoute.os.selectFolder)
    if (!folderPath) return
    const res = await ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
      action: 'attachFolder', workspaceId, folderPath,
    })
    if (res.code === 0) {
      attachedDirs.value = res.data || []
      toast.success(t('agent.folderAttached', { name: folderPath.split('/').pop() }))
    } else {
      toast.error(res.message || t('agent.attachFolderFailed'))
    }
  } catch (err) {
    console.error('[agent] 附加文件夹失败:', err)
    toast.error(t('agent.attachFolderFailed'))
  }
}

async function onDetachFolder(dirPath) {
  const workspaceId = ws.currentAgentProject?.id
  if (!workspaceId) return
  try {
    const res = await ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
      action: 'detachFolder', workspaceId, folderPath: dirPath,
    })
    if (res.code === 0) {
      attachedDirs.value = res.data || []
      expandedAttachedDirs.value.delete(dirPath)
      expandedAttachedDirs.value = new Set(expandedAttachedDirs.value)
      toast.success(t('agent.folderDetached'))
    } else {
      toast.error(res.message || t('agent.detachFolderFailed'))
    }
  } catch (err) {
    console.error('[agent] 移除附加文件夹失败:', err)
    toast.error(t('agent.detachFolderFailed'))
  }
}

const expandedAttachedDirs = ref(new Set())
const attachedDirChildren = ref({})

async function toggleAttachedDir(fullDirPath, attachedRoot) {
  if (expandedAttachedDirs.value.has(fullDirPath)) {
    expandedAttachedDirs.value.delete(fullDirPath)
    expandedAttachedDirs.value = new Set(expandedAttachedDirs.value)
  } else {
    expandedAttachedDirs.value.add(fullDirPath)
    expandedAttachedDirs.value = new Set(expandedAttachedDirs.value)
    if (!attachedDirChildren.value[fullDirPath]) {
      await loadAttachedDirContents(fullDirPath, attachedRoot)
    }
  }
}

async function loadAttachedDirContents(fullDirPath, attachedRoot) {
  try {
    const params = {
      action: 'listAttachedDir', folderPath: fullDirPath,
    }
    // 如果有附加根目录参数，传递给后端（缓存只在根目录生成）
    if (attachedRoot) {
      params.attachedRoot = attachedRoot
    }
    const res = await ipc.invoke(ipcApiRoute.piAgent.fileOperation, params)
    if (res.code === 0) {
      attachedDirChildren.value = { ...attachedDirChildren.value, [fullDirPath]: res.data || [] }
    }
  } catch (err) {
    console.error('[agent] 加载附加目录内容失败:', err)
    attachedDirChildren.value = { ...attachedDirChildren.value, [fullDirPath]: [] }
  }
}

/**
 * 手动刷新所有附加文件夹的 git 状态
 * 手动刷新走完整重新加载逻辑（能发现新增/删除文件）
 */
async function refreshGitStatus() {
  // 获取实时 git 状态（基于 simple-git，无缓存）
  for (const dirPath of attachedDirs.value) {
    try {
      await ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
        action: 'refreshGitStatus',
        folderPath: dirPath,
      })
    } catch (err) {
      console.error('[agent] 刷新 git 状态失败:', err)
    }
  }
  // 重新加载已展开的附加目录内容（完整重新加载，能发现文件增删）
  const expandedPaths = Array.from(expandedAttachedDirs.value)
  attachedDirChildren.value = {}
  for (const dirPath of expandedPaths) {
    let root = attachedDirs.value.find((r) => dirPath === r || dirPath.startsWith(r + '/'))
    await loadAttachedDirContents(dirPath, root || dirPath)
  }
  toast.success(t('agent.gitStatusRefreshed'))
}

/**
 * 打开文件树中的文件（会话文件 / 项目文件）
 * 这些文件在全局 tabs 中打开，与之前的行为保持一致
 */
function openFile(file) {
  tabStore.openFileTab({
    name: file.name,
    path: file.path,
    workspaceId: ws.currentAgentProject?.id,
    sessionId: currentSessionId.value,
    mode: filePanelMode.value,
    folderName: ws.currentAgentProject?.name,
  })
}

/**
 * 打开附加文件夹中的文件
 * 附加文件夹的文件在中间代码编辑器中打开
 * 从 attachedDirChildren 中查找文件的 git 状态一并传递
 */
function openAttachedFile(dirPath, relativePath) {
  const fileName = relativePath.split('/').pop() || relativePath
  // 从已加载的附加目录子项中查找 git 状态
  let gitStatus = null
  const children = attachedDirChildren.value[dirPath] || []
  const found = children.find((c) => c.path === relativePath)
  if (found && found.gitStatus) {
    gitStatus = found.gitStatus
  }
  openInCodeEditor(fileName, relativePath, 'project', dirPath, gitStatus)
}

// ========== 代码编辑器状态 ==========
const codeEditorFiles = ref([])
const codeEditorActiveFileId = ref(null)
const codeEditorWidth = ref(500)

/**
 * 按会话持久化代码编辑器的打开文件列表和活跃文件 ID
 * 结构：Map<sessionId, { files: [], activeFileId: string|null }>
 */
const codeEditorStateBySession = new Map()

/** 保存当前会话的编辑器状态到缓存 */
function saveCodeEditorState() {
  const sid = currentSessionId.value
  if (!sid) return
  codeEditorStateBySession.set(sid, {
    files: codeEditorFiles.value.map((f) => ({ ...f })),
    activeFileId: codeEditorActiveFileId.value,
  })
}

/** 从缓存恢复指定会话的编辑器状态 */
function restoreCodeEditorState(sid) {
  const state = codeEditorStateBySession.get(sid)
  if (state) {
    codeEditorFiles.value = state.files.map((f) => ({ ...f }))
    codeEditorActiveFileId.value = state.activeFileId
  } else {
    codeEditorFiles.value = []
    codeEditorActiveFileId.value = null
  }
}

/** 监听会话切换：保存旧会话状态，恢复新会话状态 */
watch(() => agentStore.currentSessionId, (newSid, oldSid) => {
  // 保存旧会话
  if (oldSid) saveCodeEditorState()
  // 恢复新会话
  if (newSid) {
    restoreCodeEditorState(newSid)
  } else {
    codeEditorFiles.value = []
    codeEditorActiveFileId.value = null
  }
})

/** 监听文件列表为空时自动隐藏编辑器 */
watch(() => codeEditorFiles.value.length, (len) => {
  if (len === 0 && ws.codeEditorVisible) {
    ws.codeEditorVisible = false
    localStorage.setItem('agent:codeEditorVisible', 'false')
  }
})

/** 监听编辑器可见性变化：打开时约束宽度 */
watch(() => ws.codeEditorVisible, (visible) => {
  if (visible) {
    nextTick(() => clampPanelWidths())
  }
})

/** 窗口 resize 监听器 */
let windowResizeHandler = null

/** 关闭所有文件并隐藏编辑器 */
function closeAllCodeFilesAndHide() {
  codeEditorFiles.value = []
  codeEditorActiveFileId.value = null
  // 保存当前会话的空状态
  saveCodeEditorState()
  ws.codeEditorVisible = false
  localStorage.setItem('agent:codeEditorVisible', 'false')
}

/** 在代码编辑器中打开文件（或切换到已打开的文件） */
async function openInCodeEditor(name, filePath, mode, attachedDirPath, gitStatus = null) {
  // 确保编辑器面板可见
  if (!ws.codeEditorVisible) {
    ws.codeEditorVisible = true
    localStorage.setItem('agent:codeEditorVisible', 'true')
  }

  const fileId = attachedDirPath ? `${attachedDirPath}/${filePath}` : filePath
  // 如果文件已打开，切换到该文件
  const existing = codeEditorFiles.value.find((f) => f.id === fileId)
  if (existing) {
    codeEditorActiveFileId.value = fileId
    return
  }

  // 读取文件内容
  try {
    const res = await ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
      action: 'read',
      workspaceId: ws.currentAgentProject?.id,
      sessionId: currentSessionId.value,
      mode,
      filePath,
      folderPath: attachedDirPath || undefined,
    })
    if (res.code === 0 && res.data) {
      const data = res.data
      // 仅支持文本文件预览
      if (data.isBinary) {
        toast.info(t('agentCodeEditor.binaryNotSupported'))
        return
      }
      codeEditorFiles.value.push({
        id: fileId,
        name: data.name || name,
        path: filePath,
        content: data.content || '',
        ext: data.ext || (name.split('.').pop() || ''),
        attachedDirPath,
        mode,
        gitStatus,
      })
      codeEditorActiveFileId.value = fileId
    } else {
      toast.error(res.message || t('agentCodeEditor.openFailed'))
    }
  } catch (err) {
    console.error('[agent] 读取文件内容失败:', err)
    toast.error(t('agentCodeEditor.openFailed'))
  }
  // 同步保存到会话缓存
  saveCodeEditorState()
}

/** 切换代码编辑器中活跃的文件 */
function activateCodeFile(fileId) {
  codeEditorActiveFileId.value = fileId
  // 同步保存到会话缓存
  saveCodeEditorState()
}

/** 关闭代码编辑器中的文件 */
function closeCodeFile(fileId) {
  const idx = codeEditorFiles.value.findIndex((f) => f.id === fileId)
  if (idx === -1) return
  codeEditorFiles.value.splice(idx, 1)
  if (codeEditorActiveFileId.value === fileId) {
    // 切换到相邻文件
    if (codeEditorFiles.value.length > 0) {
      const nextIdx = Math.min(idx, codeEditorFiles.value.length - 1)
      codeEditorActiveFileId.value = codeEditorFiles.value[nextIdx].id
    } else {
      codeEditorActiveFileId.value = null
    }
  }
  // 同步保存到会话缓存
  saveCodeEditorState()
}

/**
 * 跨文件跳转：AgentCodeEditor 的 DefinitionProvider 检测到目标文件未打开时触发
 * 读取目标文件内容，在编辑器中打开，然后跳转到指定位置
 */
async function onOpenFileByPath({ dirPath, relativePath, offset }) {
  const fileName = relativePath.split('/').pop() || relativePath
  await openInCodeEditor(fileName, relativePath, 'project', dirPath)

  // 文件打开后，延迟跳转到目标位置
  // 等待 Monaco model 创建完成后再设置光标位置
  setTimeout(() => {
    const fileId = `${dirPath}/${relativePath}`
    // 通过全局事件通知 AgentCodeEditor 跳转
    // AgentCodeEditor 监听 jump-to-offset 事件
    window.dispatchEvent(new CustomEvent('agent-code-editor:jump', {
      detail: { fileId, offset }
    }))
  }, 200)
}

/** 编辑器内容变化时，将文件 gitStatus 更新为 'edited'（橙色 M） */
function onCodeContentChanged(fileId) {
  const file = codeEditorFiles.value.find((f) => f.id === fileId)
  if (file && file.gitStatus !== 'edited') {
    file.gitStatus = 'edited'
  }
}

/** 自动保存文件到磁盘（防抖触发），保存后刷新 git 状态 */
let gitRefreshTimer = null
const GIT_REFRESH_DEBOUNCE_MS = 1500

async function onSaveCodeFile(fileId) {
  const file = codeEditorFiles.value.find((f) => f.id === fileId)
  if (!file) return
  try {
    await ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
      action: 'write',
      filePath: file.path,
      folderPath: file.attachedDirPath || undefined,
      mode: file.mode,
      content: file.content || '',
      workspaceId: ws.currentAgentProject?.id,
      sessionId: currentSessionId.value,
    })
    // 保存成功后，防抖刷新 git 状态
    scheduleGitStatusRefresh()
  } catch (err) {
    console.error('[agent] 自动保存文件失败:', err)
  }
}

/**
 * 防抖刷新 git 状态：
 * - mode='soft'（默认）：原地更新 git 状态，不闪烁（用于用户编辑保存后）
 * - mode='full'：完整重新加载目录内容，能发现新增/删除文件（用于 Agent 完成后）
 */
function scheduleGitStatusRefresh(mode = 'soft') {
  if (gitRefreshTimer) clearTimeout(gitRefreshTimer)
  gitRefreshTimer = setTimeout(async () => {
    if (mode === 'full') {
      await doGitStatusFullRefresh()
    } else {
      await doGitStatusRefresh()
    }
  }, GIT_REFRESH_DEBOUNCE_MS)
}

async function doGitStatusRefresh() {
  // 遍历所有附加文件夹，逐个获取实时 git 状态（基于 simple-git，无缓存）
  // 收集每个附加根目录的 statusMap
  const statusMaps = {}
  for (const dirPath of attachedDirs.value) {
    try {
      const res = await ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
        action: 'refreshGitStatus',
        folderPath: dirPath,
      })
      if (res.code === 0 && res.data?.statusMap) {
        statusMaps[dirPath] = res.data.statusMap
        // 用刷新后的 statusMap 更新代码编辑器中已打开文件的 tab 标记
        const statusMap = res.data.statusMap
        for (const file of codeEditorFiles.value) {
          if (file.attachedDirPath === dirPath) {
            const gitStatus = statusMap[file.path]
            if (gitStatus) {
              file.gitStatus = gitStatus
            } else if (file.gitStatus === 'edited') {
              file.gitStatus = 'modified'
            }
          }
        }
      }
    } catch (err) {
      console.error('[agent] 刷新 git 状态失败:', err)
    }
  }

  // 原地更新已展开目录的 git 状态，不替换数组引用，避免列表闪烁
  // 遍历 attachedDirChildren 中的每个目录，用新的 statusMap 更新文件的 gitStatus
  for (const [dirPath, children] of Object.entries(attachedDirChildren.value)) {
    // 找到该目录对应的附加根目录
    let root = attachedDirs.value.find((r) => dirPath === r || dirPath.startsWith(r + '/'))
    if (!root || !statusMaps[root]) continue

    const statusMap = statusMaps[root]
    // 计算当前目录相对于附加根目录的路径前缀
    const relativeDir = dirPath === root
      ? ''
      : dirPath.substring(root.length + 1).replace(/\\/g, '/')

    for (const item of children) {
      const fullPath = relativeDir ? `${relativeDir}/${item.path}` : item.path

      if (item.isDir) {
        // 对子目录：检查是否有子路径的变化
        const prefix = fullPath + '/'
        let dirHasAdded = false
        let dirHasModified = false
        for (const [path, status] of Object.entries(statusMap)) {
          if (path.startsWith(prefix)) {
            if (status === 'untracked' || status === 'added') {
              dirHasAdded = true
            } else if (status === 'modified') {
              dirHasModified = true
            }
          }
        }
        const newDirStatus = dirHasAdded ? 'added' : dirHasModified ? 'modified' : (statusMap[fullPath] || null)
        if (item.gitStatus !== newDirStatus) {
          item.gitStatus = newDirStatus
        }
      } else {
        // 对文件：直接匹配
        const newStatus = statusMap[fullPath] || null
        if (item.gitStatus !== newStatus) {
          item.gitStatus = newStatus
        }
      }
    }
  }
}

/**
 * 完整刷新：重新加载目录内容（能发现新增/删除文件）
 * 用于 Agent 完成后，因为 Agent 可能创建或删除文件
 */
async function doGitStatusFullRefresh() {
  // 获取实时 git 状态（基于 simple-git，无缓存）
  for (const dirPath of attachedDirs.value) {
    try {
      const res = await ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
        action: 'refreshGitStatus',
        folderPath: dirPath,
      })
      // 用刷新后的 statusMap 更新代码编辑器中已打开文件的 tab 标记
      if (res.code === 0 && res.data?.statusMap) {
        const statusMap = res.data.statusMap
        for (const file of codeEditorFiles.value) {
          if (file.attachedDirPath === dirPath) {
            const gitStatus = statusMap[file.path]
            if (gitStatus) {
              file.gitStatus = gitStatus
            } else if (file.gitStatus === 'edited') {
              file.gitStatus = 'modified'
            }
          }
        }
      }
    } catch (err) {
      console.error('[agent] 刷新 git 状态失败:', err)
    }
  }
  // 完整重新加载已展开的附加目录内容
  const expandedPaths = Array.from(expandedAttachedDirs.value)
  attachedDirChildren.value = {}
  for (const dirPath of expandedPaths) {
    let root = attachedDirs.value.find((r) => dirPath === r || dirPath.startsWith(r + '/'))
    await loadAttachedDirContents(dirPath, root || dirPath)
  }
}

/**
 * PanelDivider 的 delta 始终是：向右拖为正，向左拖为负
 *
 * 默认布局 DOM: [Chat] [Divider→本函数] [编辑器] [Divider] [FilePanel]
 *   分隔条在编辑器左侧，向右拖缩小编辑器宽度
 *   delta 为正 → width -= delta
 *
 * 交换布局 DOM: [FilePanel] [Divider] [编辑器] [Divider→本函数] [Chat]
 *   分隔条在编辑器右侧，向右拖增大编辑器宽度
 *   delta 为正 → width += delta
 */
function onCodeEditorResize(delta) {
  const adjusted = ws.panelSwapped ? delta : -delta
  codeEditorWidth.value = Math.max(MIN_EDITOR_WIDTH, Math.min(1200, codeEditorWidth.value + adjusted))
  // 拖拽时也约束总宽度
  clampPanelWidths()
}

// 文件树展开状态
const expandedDirs = ref(new Set())

function toggleDir(node) {
  if (expandedDirs.value.has(node.path)) {
    expandedDirs.value.delete(node.path)
  } else {
    expandedDirs.value.add(node.path)
  }
  expandedDirs.value = new Set(expandedDirs.value)
}

/** 打开文件夹处理器 */
function openFolderHandler(which) {
  const dir = which === 'session' ? sessionPathDisplay.value : projectPathDisplay.value
  if (dir) ipc.invoke(ipcApiRoute.os.openDirectory, { id: dir })
}

// ========== 权限处理 ==========
async function resolvePermission(allow, alwaysAllow = false) {
  if (!permissionRequest.value || permissionResponding.value) return
  permissionResponding.value = true
  try {
    const url = `${httpServerUrl.value}/${ipcApiRoute.piAgent.respondPermission}`
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId: permissionRequest.value.requestId,
        behavior: allow ? 'allow' : 'deny',
        alwaysAllow,
      }),
    })
  } catch (err) {
    console.error('[agent] 响应权限请求失败:', err)
    toast.error(t('agent.respondPermissionFailed') + ': ' + (err?.message || String(err)))
  } finally {
    permissionRequest.value = null
    permissionResponding.value = false
  }
}

// ========== AskUser 处理 ==========
function toggleAskUserOption(qIdx, oIdx, multiSelect) {
  if (!multiSelect) {
    askUserAnswers.set(qIdx, new Set([oIdx]))
  } else {
    const selected = askUserAnswers.get(qIdx) ?? new Set()
    if (selected.has(oIdx)) selected.delete(oIdx)
    else selected.add(oIdx)
    askUserAnswers.set(qIdx, selected)
  }
}

async function submitAskUser(textInputs = {}) {
  if (!askUserRequest.value || askUserResponding.value) return
  const hasAnswer = askUserRequest.value.questions.some((q, qIdx) => {
    const hasSelection = (askUserAnswers.get(qIdx)?.size ?? 0) > 0
    const hasText = q.allowInput && textInputs[qIdx]?.trim()
    return hasSelection || hasText
  })
  if (!hasAnswer) return
  askUserResponding.value = true
  try {
    const answers = {}
    const questions = askUserRequest.value.questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      const selected = askUserAnswers.get(i)
      const selectedLabels = selected && selected.size > 0
        ? Array.from(selected).map((oIdx) => q.options[oIdx]?.label).filter(Boolean)
        : []
      // 合并自由输入文本
      const freeText = textInputs[i]?.trim()
      if (freeText) {
        selectedLabels.push(freeText)
      }
      if (selectedLabels.length === 0) continue
      const key = q.question || String(i)
      answers[key] = selectedLabels.join(', ')
    }
    const url = `${httpServerUrl.value}/${ipcApiRoute.piAgent.respondAskUser}`
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: askUserRequest.value.requestId, answers }),
    })
  } catch (err) {
    console.error('[agent] 提交 AskUser 回答失败:', err)
    toast.error(t('agent.submitAnswerFailed') + ': ' + (err?.message || String(err)))
  } finally {
    askUserRequest.value = null
    askUserAnswers.clear()
    askUserResponding.value = false
  }
}

function dismissAskUser() {
  askUserRequest.value = null
  askUserAnswers.clear()
  agentStore.stopGeneration()
}

// ========== 引用证据 ==========
function onCitationClick(cite) {
  const fileId = cite.documentId ?? cite.fileItemId
  if (fileId === null || fileId === undefined) return
  tabStore.openFileTab({ name: cite.fileName || t('agent.file'), fileItemId: fileId })
}

// ========== 发送消息 ==========
async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return
  inputText.value = ''
  await sendMessageWithText(text)
}

async function sendMessageWithText(text) {
  if (!text || isStreaming.value) return
  await agentStore.sendMessage({
    text,
    model: selectedModel.value,
    workspaceSlug: ws.currentAgentProject?.slug || undefined,
    workspaceId: ws.currentAgentProject?.id,
    httpServerUrl: httpServerUrl.value,
    permissionMode: permissionMode.value,
    thinkingLevel: thinkingLevel.value,
    onScroll: () => scrollToBottom(),
    onEvent: (eventName, data) => {
      if (eventName === 'permission_request') {
        permissionRequest.value = data
      } else if (eventName === 'ask_user') {
        askUserRequest.value = data
        askUserAnswers.clear()
      } else if (eventName === 'tool_result') {
        // Agent 工具执行完毕后，如果是文件修改类工具，防抖刷新 git 状态
        const fileTools = ['write', 'edit', 'Write', 'Edit', 'bash', 'Bash']
        if (data.toolName && fileTools.includes(data.toolName)) {
          scheduleGitStatusRefresh()
        }
      } else if (eventName === 'complete') {
        // Agent 完成后，完整刷新（能发现新增/删除文件）
        scheduleGitStatusRefresh('full')
      }
    },
  })
}

function stopGeneration() {
  agentStore.stopGeneration()
}

// ========== 滚动 ==========
let scrollRafId = null
/** 用户手动滚动的时间戳，防止流式输出时强制拉回底部 */
let userScrollTime = 0

async function scrollToBottom(force = false) {
  if (!force && !isAtBottom.value) return
  // 用户手动滚动后 3 秒内不强制拉回底部
  if (!force && userScrollTime && Date.now() - userScrollTime < 3000) return
  if (scrollRafId) return
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = null
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

function onMessagesScroll() {
  if (!messagesRef.value) return
  const el = messagesRef.value
  // 增大阈值到 80px：流式输出时内容高度会增长，需要更大余量
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  if (!atBottom) {
    // 用户手动向上滚动：记录时间戳
    userScrollTime = Date.now()
  }
  isAtBottom.value = atBottom
}

onUnmounted(() => {
  // 移除窗口 resize 监听
  if (windowResizeHandler) {
    window.removeEventListener('resize', windowResizeHandler)
    windowResizeHandler = null
  }
})
</script>
