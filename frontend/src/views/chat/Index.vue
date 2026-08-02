<template>
  <div class="chat-workspace">
    <div class="chat-panel">
      <!-- ========== 顶部工具栏 ========== -->
      <div class="chat-toolbar">
        <span class="chat-toolbar__title">{{ ws.currentChatSession?.title || 'Chat' }}</span>
      </div>

      <!-- ========== 消息列表区域 ========== -->
      <div class="chat-messages" ref="messagesRef">
        <!-- 空状态 -->
        <div v-if="messages.length === 0 && !isStreaming" class="chat-empty">
          <div class="chat-empty__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h2 class="chat-empty__title">开始一个新的对话</h2>
          <p class="chat-empty__desc">输入消息，开始与 AI 助手交流</p>
        </div>

        <!-- 消息列表 -->
        <template v-else>
          <div
            v-for="msg in messages"
            :key="msg.id"
            :id="'msg-' + msg.id"
            class="msg-item"
            :class="msg.role === 'user' ? 'msg-item--user' : 'msg-item--assistant'"
          >
            <!-- 消息头部 -->
            <div class="msg-item__header">
              <!-- 用户头像 -->
              <div v-if="msg.role === 'user'" class="msg-item__avatar msg-item__avatar--user">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <!-- AI 头像 -->
              <div v-else class="msg-item__avatar msg-item__avatar--ai">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 3L4 7v5c0 5 3.5 9 8 10 4.5-1 8-5 8-10V7l-8-4z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <div class="msg-item__meta">
                <span class="msg-item__name">{{ msg.role === 'user' ? '我' : (selectedModel || 'AI') }}</span>
                <span v-if="msg.time" class="msg-item__time">{{ msg.time }}</span>
              </div>
            </div>

            <!-- 消息内容 -->
            <div class="msg-item__content" :class="msg.role === 'user' ? 'msg-item__content--user' : 'msg-item__content--assistant'">
              <!-- 用户消息 -->
              <template v-if="msg.role === 'user'">
                <div class="msg-user-bubble">{{ msg.content }}</div>
              </template>

              <!-- 助手消息 -->
              <template v-else>
                <!-- 加载中（等待首个 token） -->
                <div v-if="msg.pending && !msg.content" class="msg-loading">
                  <span class="msg-loading__dot" />
                  <span class="msg-loading__dot" />
                  <span class="msg-loading__dot" />
                  <span class="msg-loading__text">正在思考...</span>
                </div>

                <!-- 流式/最终 Markdown 内容 -->
                <div v-else class="msg-markdown">
                  <MarkdownRender
                    mode="chat"
                    :content="msg.content"
                    :final="!msg.pending"
                    :fade="false"
                    smooth-streaming="auto"
                  />
                  <!-- 流式呼吸脉冲点 -->
                  <span v-if="msg.pending" class="msg-streaming-dot" />
                </div>
              </template>
            </div>
          </div>
        </template>
      </div>

      <!-- ========== 底部输入区域（卡片式） ========== -->
      <div class="chat-input-wrapper">
        <div class="chat-input-card" :class="{ 'chat-input-card--focused': inputFocused }">
          <!-- 输入区 -->
          <textarea
            v-model="inputText"
            class="chat-input-field"
            placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
            @keydown.enter.prevent="onEnterKey"
            @focus="inputFocused = true"
            @blur="inputFocused = false"
            rows="2"
          ></textarea>

          <!-- 底部工具栏 -->
          <div class="chat-input-toolbar">
            <!-- 左侧：模型选择 -->
            <div class="chat-input-toolbar__left">
              <a-select
                v-model:value="selectedModel"
                size="small"
                style="min-width: 160px; max-width: 240px"
                :placeholder="availableModels.length === 0 ? '未启用模型' : '选择模型'"
                :disabled="availableModels.length === 0"
                :bordered="false"
              >
                <a-select-option v-for="m in availableModels" :key="m.id" :value="m.id">{{ m.name }}</a-select-option>
              </a-select>
            </div>

            <!-- 右侧：发送/停止按钮 -->
            <div class="chat-input-toolbar__right">
              <button
                v-if="isStreaming"
                class="chat-stop-btn"
                @click="stopGeneration"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
              <button
                v-else
                class="chat-send-btn"
                :disabled="!inputText.trim()"
                @click="sendMessage"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
    <div v-if="userMessages.length > 0" class="msg-rail">
      <button
        v-for="(um, idx) in userMessages"
        :key="um.id"
        class="msg-rail__bar"
        :class="{ 'msg-rail__bar--hover': railHoverIdx === idx }"
        @mouseenter="railHoverIdx = idx"
        @mouseleave="railHoverIdx = -1"
        @click="jumpToMessage(um.id)"
      />
      <!-- 悬浮预览 -->
      <div
        v-if="railHoverIdx >= 0"
        class="msg-rail__preview"
        :style="{ '--rail-preview-offset': railPreviewOffset + 'px' }"
      >
        {{ userMessages[railHoverIdx].content }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { message } from 'ant-design-vue'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'
import { useWorkspaceStore } from '@/stores/workspace'
import MarkdownRender from 'markstream-vue'

const ws = useWorkspaceStore()

// ========== HTTP 服务器地址（动态加载，与 QA 模块一致） ==========
const httpServerUrl = ref('http://127.0.0.1:7071')

// ========== 模型选择 ==========
const selectedModel = ref(null)
const availableModels = ref([])

// ========== 会话消息 ==========
const messages = ref([])
const inputText = ref('')
const isStreaming = ref(false)
const messagesRef = ref(null)
const inputFocused = ref(false)

// ========== 浮动指示器：用户消息导航 ==========
const railHoverIdx = ref(-1)

/** 只筛选用户消息 */
const userMessages = computed(() =>
  messages.value.filter((m) => m.role === 'user')
)

/** 悬浮预览偏移量：跟随当前 bar 垂直位置 */
const railPreviewOffset = computed(() => {
  if (railHoverIdx.value < 0) return 0
  // 横线：高度 3px + gap 6px = 9px 间距，加 padding-top 8px
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

// AbortController 用于支持取消请求
let abortController = null

// 监听 MenuBar 中会话选中变化
watch(() => ws.currentChatSessionId, (sessionId) => {
  if (sessionId) {
    loadMessages(sessionId)
  } else {
    messages.value = []
  }
})

onMounted(async () => {
  await loadHttpServerUrl()
  await loadEnabledModel()
  if (ws.currentChatSessionId) {
    await loadMessages(ws.currentChatSessionId)
  }
})

onUnmounted(() => {
  // 组件卸载时取消进行中的请求
  if (abortController) {
    abortController.abort()
  }
})

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

async function loadMessages(sessionId) {
  messages.value = []
  try {
    const res = await ipc.invoke(ipcApiRoute.assistant.getConversationContext, {
      sessionId,
      recentLimit: 50,
    })
    if (res.code === 0 && res.data?.recentMessages) {
      messages.value = res.data.recentMessages.map((m) => ({
        id: m.messageId ?? m.id,
        role: String(m.role).toLowerCase(),
        content: m.content,
        pending: false,
        time: m.createdAt ? formatTime(new Date(m.createdAt)) : '',
      }))
    }
  } catch (err) {
    console.error('[chat] 加载对话上下文失败:', err)
  }
  await scrollToBottom()
}

/** Enter 发送 / Shift+Enter 换行 */
function onEnterKey(e) {
  if (e.shiftKey) {
    // Shift+Enter：插入换行，不阻止默认行为
    return
  }
  e.preventDefault()
  sendMessage()
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return

  // 获取或创建会话
  let sessionId = ws.currentChatSessionId
  if (!sessionId) {
    const session = await ws.createChatSession()
    sessionId = session?.id
    if (!sessionId) {
      console.error('[chat] 创建会话失败，sessionId 为空')
      return
    }
  }

  // 添加用户消息
  const now = new Date()
  messages.value.push({
    id: `msg-${Date.now()}`,
    role: 'user',
    content: text,
    time: formatTime(now),
  })
  inputText.value = ''
  isStreaming.value = true

  // 使用 reactive 包裹助手消息，确保流式更新触发视图重渲染
  const assistantMsg = reactive({
    id: `msg-${Date.now()}-ai`,
    role: 'assistant',
    content: '',
    pending: true,
    time: formatTime(now),
  })
  messages.value.push(assistantMsg)
  await scrollToBottom()

  // 通过 HTTP SSE 调用 streamChat
  const url = `${httpServerUrl.value}/${ipcApiRoute.assistant.streamChat}`
  abortController = new AbortController()

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message: text, toolMode: 'CHAT' }),
      signal: abortController.signal,
    })

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => '请求失败')
      throw new Error(errText || `HTTP ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      // SSE 事件以 \n\n 分隔
      let separatorIndex = buffer.indexOf('\n\n')
      while (separatorIndex >= 0) {
        const rawEvent = buffer.slice(0, separatorIndex)
        buffer = buffer.slice(separatorIndex + 2)
        dispatchSseEvent(rawEvent, assistantMsg)
        separatorIndex = buffer.indexOf('\n\n')
      }
      await scrollToBottom()
    }

    // 流结束
    assistantMsg.pending = false
  } catch (err) {
    if (err?.name === 'AbortError') {
      assistantMsg.pending = false
      // 用户主动取消，不显示错误
      if (!assistantMsg.content) {
        assistantMsg.content = '已停止生成'
      }
    } else {
      console.error('[chat] sendMessage 异常:', err)
      assistantMsg.content = `发送失败: ${err?.message || String(err)}`
      message.error('发送失败: ' + (err?.message || String(err)))
    }
  } finally {
    isStreaming.value = false
    abortController = null
  }

  await scrollToBottom()
}

/** 停止生成 */
function stopGeneration() {
  if (abortController) {
    abortController.abort()
  }
}

/**
 * 解析并分发单条 SSE 事件
 */
function dispatchSseEvent(rawEvent, assistantMsg) {
  const lines = rawEvent.split(/\r?\n/)
  let eventName = ''
  const dataLines = []

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    }
  }

  if (dataLines.length === 0) return
  const rawData = dataLines.join('\n')

  switch (eventName) {
    case 'start':
      break
    case 'token':
      try {
        const data = JSON.parse(rawData)
        if (data.delta) {
          assistantMsg.content += data.delta
        }
      } catch {
        assistantMsg.content += rawData
      }
      break
    case 'complete':
      try {
        const data = JSON.parse(rawData)
        if (data.reply && !assistantMsg.content) {
          assistantMsg.content = data.reply
        }
      } catch {
        // 忽略解析失败
      }
      break
    case 'error':
      try {
        const data = JSON.parse(rawData)
        assistantMsg.content = `错误: ${data.error || rawData}`
      } catch {
        assistantMsg.content = `错误: ${rawData}`
      }
      break
    default:
      break
  }
}

async function scrollToBottom() {
  await nextTick()
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

/** 格式化时间为 YYYY-MM-DD HH:mm:ss */
function formatTime(date) {
  const y = date.getFullYear()
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`
}
</script>

<style lang="less" scoped>
// ===== 主容器 =====
.chat-workspace {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: var(--bg-layout);
  position: relative; // 供浮动指示器绝对定位
}

.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  background-color: var(--bg-panel);
}

// ===== 顶部工具栏 =====
.chat-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  height: 44px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color);

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

// ===== 消息列表 =====
.chat-messages {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 8px 0;

  // 自定义滚动条
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 3px;
    &:hover {
      background: var(--text-muted);
    }
  }
}

// ===== 空状态 =====
.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 300px;
  padding: 40px 20px;
  text-align: center;

  &__icon {
    width: 56px;
    height: 56px;
    border-radius: 16px;
    background: linear-gradient(135deg, rgba(22, 119, 255, 0.08), rgba(22, 119, 255, 0.04));
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;

    svg {
      width: 28px;
      height: 28px;
      color: var(--accent);
      opacity: 0.6;
    }
  }

  &__title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 8px 0;
  }

  &__desc {
    font-size: 14px;
    color: var(--text-muted);
    margin: 0;
  }
}

// ===== 消息项（全宽线程式，对齐 Proma 风格） =====
.msg-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 24px;
  max-width: 860px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;

  // 入场动画
  animation: msg-fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);

  &--user {
    align-items: stretch;
  }

  &--assistant {
    align-items: stretch;
  }
}

@keyframes msg-fade-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

// ===== 消息头部 =====
.msg-item__header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 2px;

  // 用户消息头部右对齐
  .msg-item--user & {
    flex-direction: row-reverse;
  }
}

.msg-item__avatar {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  svg {
    width: 15px;
    height: 15px;
  }

  &--ai {
    background: linear-gradient(135deg, var(--accent), var(--accent-hover));
    color: white;
    box-shadow: 0 2px 8px rgba(22, 119, 255, 0.2);
  }

  &--user {
    background: linear-gradient(135deg, #52c41a, #73d13d);
    color: white;
    box-shadow: 0 2px 8px rgba(82, 196, 26, 0.2);
  }
}

.msg-item__meta {
  display: flex;
  flex-direction: column;
  gap: 1px;

  // 用户消息 meta 右对齐
  .msg-item--user & {
    align-items: flex-end;
  }

  .msg-item--assistant & {
    align-items: flex-start;
  }
}

.msg-item__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
  line-height: 1.2;
}

.msg-item__time {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

// ===== 消息内容 =====
.msg-item__content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;

  &--user {
    align-items: flex-end;
    padding-right: 40px; // 与头像对齐，保持左右对称
  }

  &--assistant {
    width: 100%;
    padding-left: 40px; // 与头像对齐
    overflow-x: hidden; // 防止 markdown 内部宽元素撑出滚动条
  }
}

// ===== 用户消息气泡（灰色） =====
.msg-user-bubble {
  display: inline-block;
  max-width: 85%;
  padding: 10px 14px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
  background: var(--bg-hover, #f0f0f0);
  border-radius: 12px;
  word-break: break-word;
  white-space: pre-wrap;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

// ===== 助手 Markdown 内容 =====
.msg-markdown {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
  word-break: break-word;
  display: inline;
  max-width: 100%;
  overflow-wrap: break-word;
}

// ===== 加载动画（等待首个 token） =====
.msg-loading {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 14px;
  background: var(--bg-sidebar);
  border: 1px solid var(--border-color-light);
  border-radius: 100px;

  &__dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    animation: loading-bounce 1.3s ease-in-out infinite;

    &:nth-child(2) { animation-delay: 0.15s; }
    &:nth-child(3) { animation-delay: 0.3s; }
  }

  &__text {
    margin-left: 6px;
    font-size: 13px;
    color: var(--text-secondary);
  }
}

@keyframes loading-bounce {
  0%, 80%, 100% { transform: scale(0.5); opacity: 0.4; }
  40% { transform: scale(1); opacity: 1; }
}

// ===== 流式呼吸脉冲点 =====
.msg-streaming-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent);
  margin-left: 3px;
  vertical-align: text-bottom;
  animation: streaming-pulse 1s ease-in-out infinite;
}

@keyframes streaming-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.1); }
}

// ===== 底部输入区域（卡片式，对齐 Proma 风格） =====
.chat-input-wrapper {
  flex-shrink: 0;
  padding: 8px 16px 16px;
  background: var(--bg-panel);
}

.chat-input-card {
  border-radius: 17px;
  border: 0.5px solid var(--border-color);
  background: var(--bg-panel);
  transition: border-color 0.2s ease;
  overflow: hidden;

  &--focused {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(22, 119, 255, 0.08);
  }
}

// ===== 输入框 =====
.chat-input-field {
  display: block;
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  padding: 12px 16px 4px;
  font-size: 14px;
  line-height: 1.5;
  font-family: inherit;
  color: var(--text-primary);
  background: transparent;
  box-sizing: border-box;

  &::placeholder {
    color: var(--text-muted);
  }
}

// ===== 输入区底部工具栏 =====
.chat-input-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px 8px;
  gap: 8px;

  &__left {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  &__right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
}

// ===== 模型选择器（嵌入输入卡片底部） =====
.chat-input-toolbar__left {
  :deep(.ant-select) {
    font-size: 12px;

    .ant-select-selector {
      padding: 0 8px !important;
      background: var(--bg-sidebar) !important;
      border-radius: 6px !important;
    }

    .ant-select-selection-item {
      color: var(--text-secondary) !important;
    }
  }
}

// ===== 发送按钮 =====
.chat-send-btn {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover:not(:disabled) {
    background: var(--accent-hover);
    transform: scale(1.05);
  }

  &:disabled {
    background: var(--border-color);
    color: var(--text-muted);
    cursor: not-allowed;
  }
}

// ===== 停止按钮 =====
.chat-stop-btn {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 8px;
  background: #ef4444;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;

  svg {
    width: 14px;
    height: 14px;
  }

  &:hover {
    background: #dc2626;
    transform: scale(1.05);
  }
}

// ===== 用户消息浮动指示器 =====
.msg-rail {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  z-index: 10;
  padding: 8px 4px;

  &__bar {
    width: 20px;
    height: 3px;
    border: none;
    border-radius: 2px;
    background: var(--border-color);
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    padding: 0;

    &:hover {
      width: 28px;
      height: 5px;
      background: var(--accent);
      border-radius: 3px;
      box-shadow: 0 0 8px rgba(22, 119, 255, 0.3);
    }

    &--hover {
      width: 28px;
      height: 5px;
      background: var(--accent);
      border-radius: 3px;
      box-shadow: 0 0 8px rgba(22, 119, 255, 0.3);
    }
  }

  &__preview {
    position: absolute;
    right: 100%;
    top: 0;
    margin-right: 10px;
    width: 200px;
    max-width: 200px;
    padding: 8px 12px;
    background: var(--bg-panel);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-primary);
    white-space: pre-wrap;
    word-break: break-all;
    overflow-wrap: break-word;
    pointer-events: none;
    // 跟随当前悬停的 bar 垂直定位
    transform: translateY(var(--rail-preview-offset, 0px));
  }
}
</style>
