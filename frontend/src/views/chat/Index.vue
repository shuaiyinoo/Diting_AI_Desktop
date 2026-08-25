<template>
  <div class="relative flex h-full w-full overflow-hidden bg-layout">
    <div class="flex h-full w-full min-w-0 flex-col overflow-hidden bg-card">
      <!-- ========== 顶部工具栏 ========== -->
      <div class="flex h-11 shrink-0 items-center gap-1.5 border-b border-border px-4">
        <span class="truncate text-sm font-semibold text-foreground">{{ currentSessionTitle }}</span>
      </div>

      <!-- ========== 消息列表区域 ========== -->
      <div class="min-h-0 flex-1 overflow-y-auto py-2" ref="messagesRef" @scroll="onMessagesScroll">
        <!-- 空状态 -->
        <div v-if="messages.length === 0 && !isStreaming" class="flex min-h-[300px] flex-col items-center justify-center px-5 py-10 text-center">
          <div class="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/[0.08]">
            <svg class="size-7 text-primary opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h2 class="mb-2 text-lg font-semibold text-foreground">{{ t('chat.newConversation') }}</h2>
          <p class="m-0 text-sm text-muted-foreground">{{ t('chat.inputPlaceholder') }}</p>
        </div>

        <!-- 消息列表 -->
        <template v-else>
          <div
            v-for="msg in messages"
            :key="msg.id"
            :id="'msg-' + msg.id"
            class="msg-fade-in mx-auto flex w-full flex-col gap-1.5 px-6 py-2.5"
          >
            <!-- 消息头部 -->
            <div class="mb-0.5 flex items-center gap-2.5" :class="msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'">
              <!-- 用户头像 -->
              <div v-if="msg.role === 'user'" class="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-green-400 text-white shadow-[0_2px_8px_rgba(82,196,26,0.2)]">
                <svg class="size-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <!-- AI 头像 -->
              <img v-else :src="aiLogo" :alt="selectedModel || 'AI'" class="size-[30px] shrink-0 rounded-lg object-cover" />
              <div class="flex flex-col gap-px" :class="msg.role === 'user' ? 'items-end' : 'items-start'">
                <span class="text-[13px] font-semibold leading-tight text-secondary-foreground">{{ msg.role === 'user' ? t('chat.me') : (selectedModel || 'AI') }}</span>
                <span v-if="msg.time" class="text-[11px] leading-tight tabular-nums text-muted-foreground">{{ msg.time }}</span>
              </div>
            </div>

            <!-- 消息内容 -->
            <div class="flex min-w-0 max-w-full flex-col box-border" :class="msg.role === 'user' ? 'items-end pr-10' : 'w-full pl-10 overflow-x-hidden'">
              <!-- 用户消息 -->
              <template v-if="msg.role === 'user'">
                <div class="inline-block max-w-[85%] break-words whitespace-pre-wrap rounded-xl bg-foreground/5 px-3.5 py-2.5 text-sm leading-relaxed text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.06)]">{{ msg.content }}</div>
              </template>

              <!-- 助手消息 -->
              <template v-else>
                <!-- 加载中（等待首个 token） -->
                <div v-if="msg.pending && !msg.content" class="inline-flex items-center gap-1 rounded-full border border-border/50 bg-secondary px-3.5 py-2">
                  <span class="loading-dot inline-block size-1.5 rounded-full bg-primary" />
                  <span class="loading-dot inline-block size-1.5 rounded-full bg-primary" style="animation-delay: 0.15s" />
                  <span class="loading-dot inline-block size-1.5 rounded-full bg-primary" style="animation-delay: 0.3s" />
                  <span class="ml-1.5 text-[13px] text-secondary-foreground">{{ t('chat.thinking') }}</span>
                </div>

                <!-- 流式/最终 Markdown 内容 -->
                <div v-else class="block min-w-0 max-w-full break-words text-sm leading-relaxed text-foreground">
                  <MarkdownRender
                    mode="chat"
                    :content="msg.content"
                    :final="!msg.pending"
                    :fade="false"
                    smooth-streaming="auto"
                    :render-code-blocks-as-pre="false"
                    :is-dark="isDark" code-block-dark-theme="vitesse-dark" code-block-light-theme="vitesse-light" :themes="['vitesse-dark', 'vitesse-light']"
                    custom-id="chat"
                    :mermaid-props="{ isStrict: true, showCopyButton: true, showFullscreenButton: true, showZoomControls: true, enableMermaidInteractions: true, onRenderError: handleMermaidError }"
                  />
                  <!-- 流式呼吸脉冲点 -->
                  <span v-if="msg.pending" class="streaming-dot ml-1 inline-block size-[7px] rounded-full bg-primary align-text-bottom" />
                </div>

                <!-- 引用证据卡片（KB_SEARCH 模式，回答完成后展示） -->
                <CitationRail
                  v-if="!msg.pending && msg.citations && msg.citations.length > 0"
                  :citations="msg.citations"
                  @citation-click="onCitationClick"
                />
              </template>
            </div>
          </div>
        </template>
      </div>

      <!-- ========== 底部输入区域（卡片式，与 Agent 风格一致） ========== -->
      <div class="shrink-0 px-4 pb-3 pt-1">
        <div
          class="overflow-hidden border bg-card shadow-lg transition-all"
          :class="inputFocused ? 'border-primary/40 shadow-primary/5' : 'border-border'"
          :style="{ borderRadius: 'var(--radius)' }"
        >
          <!-- 输入区：复用 Agent 的 RichTextInput 组件，行为完全一致 -->
          <RichTextInput
            v-model="inputText"
            :placeholder="t('chat.inputPlaceholder')"
            :auto-focus-trigger="currentSessionId"
            :session-id="currentSessionId"
            @submit="sendMessage"
            @focus="inputFocused = true"
            @blur="inputFocused = false"
          />

          <!-- 底部工具栏 -->
          <div class="flex items-center justify-between gap-2 border-t border-border px-3 py-1.5">
            <!-- 左侧：知识库选择 -->
            <div class="flex min-w-0 items-center gap-2">
              <Select v-model="selectedKbOption">
                <SelectTrigger class="h-8 min-w-[120px] max-w-[180px]">
                  <SelectValue :placeholder="t('chat.kbPlaceholder')" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">{{ t('chat.kbNone') }}</SelectItem>
                  <SelectItem value="ALL">{{ t('chat.kbAll') }}</SelectItem>
                  <SelectLabel>{{ t('chat.kbFolders') }}</SelectLabel>
                  <SelectItem
                    v-for="f in folderList"
                    :key="f.id"
                    :value="`FOLDER:${f.id}`"
                  >{{ folderDisplayName(f) }}</SelectItem>
                  <SelectLabel>{{ t('chat.kbOcr') }}</SelectLabel>
                  <SelectItem value="INVOICE">{{ t('chat.kbInvoice') }}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- 右侧：模型选择 + 发送/停止按钮 -->
            <div class="flex shrink-0 items-center gap-2">
              <Select
                v-model="selectedModel"
                :disabled="availableModels.length === 0"
              >
                <SelectTrigger class="h-8 min-w-[140px] max-w-[200px]">
                  <div v-if="selectedModel" class="flex items-center gap-1.5">
                    <img :src="aiLogo" :alt="selectedModel" class="size-4 shrink-0 rounded" />
                    <span class="truncate">{{ availableModels.find(m => m.id === selectedModel)?.name || selectedModel }}</span>
                  </div>
                  <span v-else class="text-muted-foreground">{{ availableModels.length === 0 ? t('chat.noModel') : t('chat.selectModel') }}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="m in availableModels" :key="m.id" :value="m.id">
                    <div class="flex items-center gap-2">
                      <img :src="getModelLogo(m.model_name, inferProviderType(m.provider, m.base_url)) || LOGO_DEFAULT" :alt="m.name" class="size-4 shrink-0 rounded" />
                      <span>{{ m.name }}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>

              <!-- 停止按钮 -->
              <button
                v-if="isStreaming"
                class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-destructive text-destructive-foreground transition-all hover:bg-destructive/90"
                @click="stopGeneration"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" class="size-3.5">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>

              <!-- 发送按钮 -->
              <button
                v-else
                class="flex size-8 shrink-0 aspect-square items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-40"
                :disabled="!inputText.trim()"
                @click="sendMessage"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4">
                  <path d="M22 2L11 13" />
                  <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ========== 用户消息浮动指示器 ========== -->
    <!-- 外层 pointer-events-none：鼠标穿透到下层，不影响滚动等操作 -->
    <div
      v-if="userMessages.length > 0"
      class="absolute right-3 top-1/2 z-10 -translate-y-1/2 pointer-events-none"
    >
      <!-- 整体容器：尺寸固定不变，仅边框颜色切换 -->
      <div
        class="flex items-start gap-2 rounded-md border border-transparent px-2 py-2 transition-colors duration-200"
        :class="railHovering ? 'border-border bg-card shadow-[0_2px_12px_rgba(0,0,0,0.08)]' : ''"
      >
        <!-- 左侧：文字列（始终占位，hover 时可见） -->
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

        <!-- 右侧：bar 列 -->
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

      <!-- 触发层：绝对定位覆盖区域，pointer-events-auto 恢复鼠标事件 -->
      <!-- 未显示时：仅覆盖 bar 列（窄 28px），鼠标进入触发显示 -->
      <!-- 显示后：覆盖整个容器（宽），鼠标离开才隐藏 -->
      <div
        class="absolute top-0 cursor-pointer pointer-events-auto"
        :class="railHovering ? 'inset-0 z-10' : 'right-2 bottom-0 z-20'"
        :style="railHovering ? {} : { width: '28px' }"
        @mouseenter="railHovering = true"
        @mouseleave="railHovering = false; railHoverIdx = -1"
      >
        <!-- hover 索引更新层：覆盖整个容器宽度的每一行（文字+bar） -->
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

<script setup>
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectLabel } from '@/components/ui/select'

import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'
import { useWorkspaceStore } from '@/stores/workspace'
import { useChatStore } from '@/stores/chat'
import { useTabStore } from '@/stores/tab'
import { isDark } from '@/theme'
import MarkdownRender from 'markstream-vue'
import CitationRail from '@/components/CitationRail.vue'
import RichTextInput from '@/components/agent/RichTextInput.vue'
import { getModelLogo, LOGO_DEFAULT } from '@/utils/model-logo'
import { inferProviderType } from '@/utils/provider-presets'

const { t } = useI18n()

const props = defineProps({
  /** 会话 ID，由 TabContent 传入 */
  sessionId: { type: String, default: null },
})

const ws = useWorkspaceStore()
const chatStore = useChatStore()
const tabStore = useTabStore()

// 当 prop.sessionId 存在时，确保 chat store 选中该会话
watch(() => props.sessionId, (sid) => {
  if (sid && chatStore.currentSessionId !== sid) {
    // 通过 Tab 激活该会话，触发 store 中 currentSessionId 计算属性更新
    tabStore.activateTab(sid)
  }
}, { immediate: false })

// 当前会话 ID：从 chat store 派生（store 又从 tabStore 派生）
const currentSessionId = computed(() => chatStore.currentSessionId || props.sessionId)

// ========== HTTP 服务器地址（动态加载） ==========
const httpServerUrl = ref('http://127.0.0.1:7071')

// ========== 模型选择 ==========
const selectedModel = ref(null)
const availableModels = ref([])

// ========== 知识库文件夹选择 ==========
const folderList = ref([])

/**
 * 知识库选择值：编码了范围和 folderId
 * - 'NONE'：不使用知识库
 * - 'ALL'：全部知识库
 * - 'INVOICE'：仅 OCR 归档票据
 * - 'FOLDER:{id}'：指定文件夹
 */
const selectedKbOption = ref('NONE')

/** 当前会话的 selectedKbOption：从 chat store 读写，实现会话级记忆 */
const kbOptionForSession = computed({
  get() {
    const sid = currentSessionId.value
    if (!sid) return 'NONE'
    const scope = chatStore.getSessionKbScope(sid)
    const folderId = chatStore.getSessionFolderId(sid)
    if (scope === 'ALL') return 'ALL'
    if (scope === 'INVOICE') return 'INVOICE'
    if (scope === 'FOLDER' && folderId) return `FOLDER:${folderId}`
    return 'NONE'
  },
  set(val) {
    if (val === 'NONE') {
      chatStore.setSessionKbScope('NONE')
      chatStore.setSessionFolderId(null)
    } else if (val === 'ALL') {
      chatStore.setSessionKbScope('ALL')
      chatStore.setSessionFolderId(null)
    } else if (val === 'INVOICE') {
      chatStore.setSessionKbScope('INVOICE')
      chatStore.setSessionFolderId(null)
    } else if (val.startsWith('FOLDER:')) {
      const fid = parseInt(val.split(':')[1], 10)
      chatStore.setSessionKbScope('FOLDER')
      chatStore.setSessionFolderId(fid)
    }
  },
})

// 同步 selectedKbOption 到 computed（用于 Select v-model）
watch(kbOptionForSession, (val) => {
  selectedKbOption.value = val
}, { immediate: true })

watch(selectedKbOption, (val) => {
  kbOptionForSession.value = val
})

/** 加载授权文件夹列表 */
async function loadFolderList() {
  try {
    const data = await ipc.invoke(ipcApiRoute.file.getFolderList)
    folderList.value = data || []
    // 校验当前会话记忆的 folderId 是否仍存在，不存在则清除
    const sid = currentSessionId.value
    if (sid) {
      const remembered = chatStore.getSessionFolderId(sid)
      if (remembered && !folderList.value.some((f) => f.id === remembered)) {
        chatStore.setSessionFolderId(null)
      }
    }
  } catch (err) {
    console.error('[chat] 加载文件夹列表失败:', err)
  }
}

/** 文件夹显示名称：只取路径最后一段 */
function folderDisplayName(f) {
  return f.path?.split('/').pop() || f.path || f.name || `${t('chat.fileFolder')} ${f.id}`
}

/** 当前 toolMode：选了知识库则为 KB_SEARCH，否则为 CHAT */
const currentToolMode = computed(() =>
  selectedKbOption.value !== 'NONE' ? 'KB_SEARCH' : 'CHAT'
)

/** 当前 kbScope */
const currentKbScope = computed(() => {
  const val = selectedKbOption.value
  if (val === 'NONE') return 'NONE'
  if (val === 'ALL') return 'ALL'
  if (val === 'INVOICE') return 'INVOICE'
  if (val.startsWith('FOLDER:')) return 'FOLDER'
  return 'NONE'
})

/** 当前 folderId（仅 FOLDER 模式有值） */
const currentFolderId = computed(() => {
  const val = selectedKbOption.value
  if (val.startsWith('FOLDER:')) {
    return parseInt(val.split(':')[1], 10)
  }
  return null
})

// ========== 会话消息（全部使用 chat store） ==========
const messages = computed(() => chatStore.messages)
const isStreaming = computed(() => chatStore.isStreaming)
const inputText = ref('')
const messagesRef = ref(null)
const inputFocused = ref(false)
// 滚动追踪：用户是否处于消息列表底部
const isAtBottom = ref(true)
// 会话切换标记：切换后等待消息加载完成再滚动到底部
let pendingScrollToBottom = false

// ========== 浮动指示器：用户消息导航 ==========
const railHoverIdx = ref(-1)
const railHovering = ref(false)

/** 只筛选用户消息 */
const userMessages = computed(() =>
  messages.value.filter((m) => m.role === 'user')
)

/** 跳转到指定消息 */
function jumpToMessage(msgId) {
  const el = document.getElementById('msg-' + msgId)
  if (el && messagesRef.value) {
    messagesRef.value.scrollTo({
      top: el.offsetTop - messagesRef.value.offsetTop - 12,
      behavior: 'smooth',
    })
  }
}

/** AI 头像 logo */
const aiLogo = computed(() => {
  const model = availableModels.value.find((m) => m.id === selectedModel.value)
  if (model) {
    return getModelLogo(model.model_name, inferProviderType(model.provider, model.base_url)) || LOGO_DEFAULT
  }
  return LOGO_DEFAULT
})

// ========== 会话标题 ==========
const currentSessionTitle = computed(() => {
  if (currentSessionId.value) {
    const session = ws.chatSessions.find(s => s.id === currentSessionId.value)
    return session?.title || 'Chat'
  }
  return 'Chat'
})

// 监听会话切换：加载消息 + 设置滚动标记 + 恢复知识库选择
watch(() => currentSessionId.value, async (sessionId) => {
  if (sessionId) {
    // 如果 store 中没有该会话的消息，则从后端加载
    if (!chatStore.messagesBySession[sessionId]) {
      await chatStore.loadMessages(sessionId)
    }
    // 恢复该会话的知识库选择
    selectedKbOption.value = kbOptionForSession.value
    pendingScrollToBottom = true
    await nextTick()
    scrollToBottom(true)
  }
}, { immediate: false })

// 监听消息变化：会话切换后消息加载完成时，强制滚动到底部
watch(() => messages.value.length, async () => {
  if (pendingScrollToBottom && messages.value.length > 0) {
    pendingScrollToBottom = false
    isAtBottom.value = true
    await nextTick()
    scrollToBottom(true)
  }
})

onMounted(async () => {
  await loadHttpServerUrl()
  await loadEnabledModel()
  await loadFolderList()
  // 恢复会话级知识库选择
  selectedKbOption.value = kbOptionForSession.value
  if (currentSessionId.value) {
    // 如果 store 中没有该会话的消息，则从后端加载
    if (!chatStore.messagesBySession[currentSessionId.value]) {
      await chatStore.loadMessages(currentSessionId.value)
    }
    // 等待 DOM 更新后滚动到底部
    pendingScrollToBottom = true
    await nextTick()
    scrollToBottom(true)
  }
})

// onUnmounted 不再 abort，流式请求在 store 中继续运行

/** 动态获取 HTTP 服务器地址 */
async function loadHttpServerUrl() {
  try {
    const data = await ipc.invoke(ipcApiRoute.framework.checkHttpServer)
    if (data && data.enable && data.server) {
      httpServerUrl.value = data.server
    }
  } catch (err) {
    console.warn('[chat] 获取 HTTP 服务器地址失败，使用默认地址:', err)
  }
}

/** 加载已启用的 LLM 模型 */
async function loadEnabledModel() {
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'getEnabled' })
    if (res.code === 0 && res.data) {
      const m = res.data
      availableModels.value = [{ id: m.model_name, name: m.name || m.model_name, model_name: m.model_name, provider: m.provider, base_url: m.base_url }]
      selectedModel.value = m.model_name
    }
  } catch (err) {
    console.error('[chat] 加载已启用模型失败:', err)
  }
}

/** 发送消息：委托给 chatStore.sendMessage */
async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return
  inputText.value = ''
  await chatStore.sendMessage({
    text,
    httpServerUrl: httpServerUrl.value,
    toolMode: currentToolMode.value,
    folderId: currentFolderId.value || undefined,
    kbScope: currentKbScope.value,
    onScroll: () => scrollToBottom(),
  })
}

/** 停止生成 */
function stopGeneration() {
  chatStore.stopGeneration()
}

/**
 * Mermaid 渲染错误兜底
 * 当 Mermaid 代码块语法错误无法渲染时，以 <pre> 展示原始代码，不抛默认报错
 */
function handleMermaidError(_err, code, container) {
  const pre = document.createElement('pre')
  pre.className = 'text-xs font-mono whitespace-pre-wrap p-3 rounded-lg border border-border bg-secondary/50 text-muted-foreground overflow-x-auto'
  pre.textContent = code
  container.replaceChildren(pre)
  return true // 阻止默认错误展示
}

/**
 * 点击引用证据卡片，在 Tab 栏中打开文件查看器（全局只保留一个文件 Tab）。
 */
function onCitationClick(cite) {
  const fileId = cite.documentId ?? cite.fileItemId
  if (fileId === null || fileId === undefined) return
  tabStore.openFileTab({
    name: cite.fileName || t('chat.fileFolder'),
    fileItemId: fileId,
  })
}

/** 智能滚动：仅在用户已处于底部时自动滚动 */
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

/** 监听消息列表滚动，更新 isAtBottom */
function onMessagesScroll() {
  if (!messagesRef.value) return
  const el = messagesRef.value
  isAtBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 30
}
</script>

<style>
@keyframes msg-fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
.msg-fade-in {
  animation: msg-fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes loading-bounce {
  0%, 80%, 100% { transform: scale(0.5); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}
.loading-dot {
  animation: loading-bounce 1.3s ease-in-out infinite;
}

@keyframes streaming-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.1); }
}
.streaming-dot {
  animation: streaming-pulse 1s ease-in-out infinite;
}
</style>
