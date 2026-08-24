<template>
  <div class="flex h-full w-full overflow-hidden bg-background" ref="workspaceRef">
    <!-- ========== Chat 面板 ========== -->
    <!-- 使用 CSS order 控制左右位置：默认 order-0（左），交换后 order-2（右） -->
    <div class="relative flex min-w-0 flex-1 flex-col" :class="ws.panelSwapped ? 'order-2' : 'order-0'">
      <!-- 顶部工具栏 -->
      <div class="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
        <span class="text-[13px] font-medium text-foreground">{{ toolbarTitle }}</span>
        <div class="flex items-center gap-2">
          <span v-if="isStreaming" class="flex items-center gap-1.5 text-xs text-primary">
            <span class="size-1.5 animate-pulse rounded-full bg-primary" />{{ t('agent.running') }}
          </span>
          <Tooltip :title="t('agent.swapPanels')">
            <button
              class="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              @click="ws.togglePanelSwap"
            >
              <ArrowLeftRight class="size-4" />
            </button>
          </Tooltip>
          <Tooltip :title="panel4Collapsed ? t('agent.expandFilePanel') : t('agent.collapseFilePanel')">
            <button
              class="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              @click="togglePanel4"
            >
              <PanelRightOpen v-if="panel4Collapsed" class="size-4" />
              <PanelRightClose v-else class="size-4" />
            </button>
          </Tooltip>
        </div>
      </div>

      <!-- 权限确认弹窗 -->
      <AgentPermissionPopup
        :request="permissionRequest"
        :responding="permissionResponding"
        @resolve="resolvePermission"
      />

      <!-- AskUser 问答弹窗 -->
      <AgentAskUserPopup
        :request="askUserRequest"
        :answers="askUserAnswers"
        :responding="askUserResponding"
        @toggle="toggleAskUserOption"
        @submit="submitAskUser"
        @dismiss="dismissAskUser"
      />

      <!-- 消息列表区域 -->
      <div class="relative min-h-0 flex-1 overflow-y-auto" ref="messagesRef" @scroll="onMessagesScroll">
        <AgentMessageList
          :messages="messages"
          :is-streaming="isStreaming"
          :model-name="selectedModel || 'Agent'"
          :model-logo="aiLogo"
          :message-stats="messageStats"
          :rail-hover-idx="railHoverIdx"
          @citation-click="onCitationClick"
          @rail-hover="railHoverIdx = $event"
          @jump="jumpToMessage"
        />
      </div>

      <!-- 底部输入区域 -->
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
    </div>

    <!-- ========== 文件面板 ========== -->
    <!-- 使用 CSS order 控制左右位置：默认 order-2（右），交换后 order-0（左） -->
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
        :border-side="ws.panelSwapped ? 'right' : 'left'"
        :class="ws.panelSwapped ? 'order-0' : 'order-2'"
        @switch-mode="switchFileMode"
        @add-file="onAddFile"
        @attach-folder="onAttachFolder"
        @detach-folder="onDetachFolder"
        @toggle-dir="toggleDir"
        @open-file="openFile"
        @toggle-attached-dir="toggleAttachedDir"
        @open-attached-file="openAttachedFile"
        @open-folder="openFolderHandler"
      />
      <PanelDivider class="order-1" @resize="onPanel4Resize" />
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { Tooltip } from '@/components/ui/tooltip'
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
import { PanelRightClose, PanelRightOpen, ArrowLeftRight } from '@lucide/vue'
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

function onPanel4Resize(delta) {
  // 交换布局时拖拽方向反转：向右拖增大文件面板宽度
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

async function toggleAttachedDir(fullDirPath) {
  if (expandedAttachedDirs.value.has(fullDirPath)) {
    expandedAttachedDirs.value.delete(fullDirPath)
    expandedAttachedDirs.value = new Set(expandedAttachedDirs.value)
  } else {
    expandedAttachedDirs.value.add(fullDirPath)
    expandedAttachedDirs.value = new Set(expandedAttachedDirs.value)
    if (!attachedDirChildren.value[fullDirPath]) {
      await loadAttachedDirContents(fullDirPath)
    }
  }
}

async function loadAttachedDirContents(fullDirPath) {
  try {
    const res = await ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
      action: 'listAttachedDir', folderPath: fullDirPath,
    })
    if (res.code === 0) {
      attachedDirChildren.value = { ...attachedDirChildren.value, [fullDirPath]: res.data || [] }
    }
  } catch (err) {
    console.error('[agent] 加载附加目录内容失败:', err)
    attachedDirChildren.value = { ...attachedDirChildren.value, [fullDirPath]: [] }
  }
}

function openFile(file) {
  tabStore.openFileTab({
    name: file.name, path: file.path,
    workspaceId: ws.currentAgentProject?.id,
    sessionId: currentSessionId.value, mode: filePanelMode.value,
  })
}

function openAttachedFile(dirPath, relativePath) {
  const fileName = relativePath.split('/').pop() || relativePath
  tabStore.openFileTab({
    name: fileName, path: relativePath,
    workspaceId: ws.currentAgentProject?.id,
    sessionId: currentSessionId.value, mode: 'project', attachedDirPath: dirPath,
  })
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
