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
            @activate-file="activateCodeFile"
            @close-file="closeCodeFile"
            @content-changed="onCodeContentChanged"
            @save-file="onSaveCodeFile"
            @close-all="closeAllCodeFilesAndHide"
            @open-file-by-path="onOpenFileByPath"
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
            @activate-file="activateCodeFile"
            @close-file="closeCodeFile"
            @content-changed="onCodeContentChanged"
            @save-file="onSaveCodeFile"
            @close-all="closeAllCodeFilesAndHide"
            @open-file-by-path="onOpenFileByPath"
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
const panel4Collapsed = ref(false)

function togglePanel4() {
  panel4Collapsed.value = !panel4Collapsed.value
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
  panel4Width.value = Math.min(400, Math.max(240, panel4Width.value + adjusted))
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

const projectPathDisplay = computed(() => {
  const project = ws.currentAgentProject
  if (!project) return ''
  return project.resolvedPath || project.projectPath || ''
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
})

// ========== Watchers ==========
watch(() => ws.currentAgentProjectId, () => loadFileTree())
watch(() => currentSessionId.value, () => loadFileTree())
watch(() => isStreaming.value, (streaming, wasStreaming) => {
  if (wasStreaming && !streaming) loadFileTree()
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
  loadFileTree()
}

async function loadFileTree() {
  fileTree.value = []
  attachedDirs.value = []
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
      attachedDirs.value = data.attachedDirs || []
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
 * 手动刷新所有附加文件夹的 git 状态缓存
 * 手动刷新走完整重新加载逻辑（能发现新增/删除文件）
 */
async function refreshGitStatus() {
  // 强制刷新后端缓存
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
  // 遍历所有附加文件夹，逐个强制刷新后端缓存
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
  // 强制刷新后端缓存
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
  codeEditorWidth.value = Math.max(200, Math.min(1200, codeEditorWidth.value + adjusted))
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

async function submitAskUser() {
  if (!askUserRequest.value || askUserResponding.value) return
  const hasAnswer = askUserRequest.value.questions.some((_, qIdx) =>
    (askUserAnswers.get(qIdx)?.size ?? 0) > 0,
  )
  if (!hasAnswer) return
  askUserResponding.value = true
  try {
    const answers = {}
    const questions = askUserRequest.value.questions
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      const selected = askUserAnswers.get(i)
      if (!selected || selected.size === 0) continue
      const selectedLabels = Array.from(selected).map((oIdx) => q.options[oIdx]?.label).filter(Boolean)
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
async function scrollToBottom(force = false) {
  if (!force && !isAtBottom.value) return
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
  isAtBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 30
}
</script>
