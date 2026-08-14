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
          <h2 class="mb-2 text-lg font-semibold text-foreground">开始一个新的对话</h2>
          <p class="m-0 text-sm text-muted-foreground">输入消息，开始与 AI 助手交流</p>
        </div>

        <!-- 消息列表 -->
        <template v-else>
          <div
            v-for="msg in messages"
            :key="msg.id"
            :id="'msg-' + msg.id"
            class="msg-fade-in mx-auto flex w-full max-w-[860px] flex-col gap-1.5 px-6 py-2.5"
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
              <div v-else class="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80 text-white shadow-[0_2px_8px_rgba(22,119,255,0.2)]">
                <svg class="size-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 3L4 7v5c0 5 3.5 9 8 10 4.5-1 8-5 8-10V7l-8-4z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <div class="flex flex-col gap-px" :class="msg.role === 'user' ? 'items-end' : 'items-start'">
                <span class="text-[13px] font-semibold leading-tight text-secondary-foreground">{{ msg.role === 'user' ? '我' : (selectedModel || 'AI') }}</span>
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
                  <span class="ml-1.5 text-[13px] text-secondary-foreground">正在思考...</span>
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

      <!-- ========== 底部输入区域（卡片式） ========== -->
      <div class="shrink-0 bg-card px-4 pb-4 pt-2">
        <div class="overflow-hidden rounded-[17px] border border-border bg-card transition-colors" :class="inputFocused ? 'border-primary shadow-[0_0_0_3px_rgba(22,119,255,0.08)]' : ''">
          <!-- 输入区 -->
          <textarea
            v-model="inputText"
            class="block w-full resize-none border-none bg-transparent px-4 pb-1 pt-3 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
            @keydown.enter.prevent="onEnterKey"
            @focus="inputFocused = true"
            @blur="inputFocused = false"
            rows="2"
          ></textarea>

          <!-- 底部工具栏 -->
          <div class="flex items-center justify-between gap-2 px-2.5 pb-2 pt-1.5">
            <!-- 左侧：模型选择 + 知识库文件夹选择 -->
            <div class="flex min-w-0 items-center gap-1.5">
              <Select
                v-model="selectedModel"
                :disabled="availableModels.length === 0"
              >
                <SelectTrigger class="min-w-[140px] max-w-[200px]">
                  <SelectValue :placeholder="availableModels.length === 0 ? '未启用模型' : '选择模型'" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="m in availableModels" :key="m.id" :value="m.id">{{ m.name }}</SelectItem>
                </SelectContent>
              </Select>
              <Select
                v-model="selectedFolderId"
              >
                <SelectTrigger class="min-w-[120px] max-w-[180px]">
                  <SelectValue placeholder="知识库（可选）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem :value="null">不使用知识库</SelectItem>
                  <SelectItem v-for="f in folderList" :key="f.id" :value="f.id">{{ f.path || f.name }}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- 右侧：发送/停止按钮 -->
            <div class="flex shrink-0 items-center gap-1.5">
              <button
                v-if="isStreaming"
                class="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-red-500 text-white transition-all hover:bg-red-600 hover:scale-105"
                @click="stopGeneration"
              >
                <svg class="size-3.5" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
              <button
                v-else
                class="flex size-[34px] shrink-0 items-center justify-center rounded-lg bg-primary text-white transition-all hover:bg-primary/90 hover:scale-105 disabled:cursor-not-allowed disabled:bg-border disabled:text-muted-foreground"
                :disabled="!inputText.trim()"
                @click="sendMessage"
              >
                <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
    <div v-if="userMessages.length > 0" class="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col items-end gap-1.5 px-1 py-2">
      <button
        v-for="(um, idx) in userMessages"
        :key="um.id"
        class="h-[3px] w-5 cursor-pointer rounded-sm border-none bg-border p-0 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:h-[5px] hover:w-7 hover:bg-primary hover:shadow-[0_0_8px_rgba(22,119,255,0.3)]"
        :class="railHoverIdx === idx ? 'h-[5px] w-7 bg-primary shadow-[0_0_8px_rgba(22,119,255,0.3)]' : ''"
        @mouseenter="railHoverIdx = idx"
        @mouseleave="railHoverIdx = -1"
        @click="jumpToMessage(um.id)"
      />
      <!-- 悬浮预览 -->
      <div
        v-if="railHoverIdx >= 0"
        class="pointer-events-none absolute right-full top-0 mr-2.5 w-[200px] max-w-[200px] break-words rounded-lg border border-border bg-card px-3 py-2 text-xs leading-relaxed text-foreground shadow-[0_4px_16px_rgba(0,0,0,0.1)]"
        :style="{ transform: `translateY(${railPreviewOffset}px)` }"
      >
        {{ userMessages[railHoverIdx].content }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

import { ref, computed, onMounted, nextTick, watch } from 'vue'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'
import { useWorkspaceStore } from '@/stores/workspace'
import { useChatStore } from '@/stores/chat'
import { useTabStore } from '@/stores/tab'
import { isDark } from '@/theme'
import MarkdownRender from 'markstream-vue'
import CitationRail from '@/components/CitationRail.vue'

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

/** 当前会话的 folderId：从 chat store 读写，实现会话级记忆 */
const selectedFolderId = computed({
  get() {
    const sid = currentSessionId.value
    if (!sid) return null
    return chatStore.getSessionFolderId(sid)
  },
  set(val) {
    chatStore.setSessionFolderId(val)
  },
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

/** 文件夹选项：显示文件夹名而非完整路径 */
const folderOptions = computed(() =>
  folderList.value.map((f) => ({
    value: f.id,
    label: f.path?.split('/').pop() || f.path || `文件夹 ${f.id}`,
  }))
)

/** 当前 toolMode：选了文件夹则为 KB_SEARCH，否则为 CHAT */
const currentToolMode = computed(() =>
  selectedFolderId.value ? 'KB_SEARCH' : 'CHAT'
)

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

/** 只筛选用户消息 */
const userMessages = computed(() =>
  messages.value.filter((m) => m.role === 'user')
)

/** 悬浮预览偏移量：跟随当前 bar 垂直位置 */
const railPreviewOffset = computed(() => {
  if (railHoverIdx.value < 0) return 0
  const spacing = 9
  const padding = 8
  return padding + railHoverIdx.value * spacing
})

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

// ========== 会话标题 ==========
const currentSessionTitle = computed(() => {
  if (currentSessionId.value) {
    const session = ws.chatSessions.find(s => s.id === currentSessionId.value)
    return session?.title || 'Chat'
  }
  return 'Chat'
})

// 监听会话切换：加载消息 + 设置滚动标记
watch(() => currentSessionId.value, async (sessionId) => {
  if (sessionId) {
    // 如果 store 中没有该会话的消息，则从后端加载
    if (!chatStore.messagesBySession[sessionId]) {
      await chatStore.loadMessages(sessionId)
    }
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
  if (currentSessionId.value) {
    // 如果 store 中没有该会话的消息，则从后端加载
    if (!chatStore.messagesBySession[currentSessionId.value]) {
      await chatStore.loadMessages(currentSessionId.value)
    }
    await scrollToBottom(true)
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
      availableModels.value = [{ id: m.model_name, name: m.name || m.model_name }]
      selectedModel.value = m.model_name
    }
  } catch (err) {
    console.error('[chat] 加载已启用模型失败:', err)
  }
}

/** Enter 发送 / Shift+Enter 换行 */
function onEnterKey(e) {
  if (e.shiftKey) {
    return
  }
  e.preventDefault()
  sendMessage()
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
    folderId: selectedFolderId.value || undefined,
    onScroll: () => scrollToBottom(),
  })
}

/** 停止生成 */
function stopGeneration() {
  chatStore.stopGeneration()
}

/**
 * 点击引用证据卡片，在 Tab 栏中打开文件查看器（全局只保留一个文件 Tab）。
 */
function onCitationClick(cite) {
  const fileId = cite.documentId ?? cite.fileItemId
  if (fileId === null || fileId === undefined) return
  tabStore.openFileTab({
    name: cite.fileName || '文件',
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
