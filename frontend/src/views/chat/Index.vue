<template>
  <div class="chat-workspace">
    <!-- ========== 第三部分：Chat 聊天界面 ========== -->
    <div class="panel panel--chat">
      <!-- 工具栏 -->
      <div class="panel__toolbar">
        <span class="panel__path">{{ ws.currentChatSession?.title || 'Chat' }}</span>
        <div class="panel__toolbar-right">
          <a-select
            v-model:value="selectedModel"
            size="small"
            style="width: 200px"
            :placeholder="availableModels.length === 0 ? '未启用模型' : '选择模型'"
            :disabled="availableModels.length === 0"
          >
            <a-select-option v-for="m in availableModels" :key="m.id" :value="m.id">{{ m.name }}</a-select-option>
          </a-select>
        </div>
      </div>

      <!-- 消息列表 -->
      <div class="panel__body panel__body--messages" ref="messagesRef">
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="msg"
          :class="`msg--${msg.role}`"
        >
          <div class="msg__content" v-html="renderMarkdown(msg.content)"></div>
        </div>
        <div v-if="messages.length === 0" class="panel__empty panel__empty--centered">
          <message-outlined style="font-size: 40px; opacity: 0.2" />
          <p style="margin-top: 12px; color: var(--text-muted)">开始一个新的对话</p>
        </div>
      </div>

      <!-- 输入框 -->
      <div class="chat-input-area">
        <textarea
          v-model="inputText"
          class="chat-input"
          placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
          @keydown.enter.prevent="sendMessage"
          rows="2"
        ></textarea>
        <button
          class="chat-send-btn"
          :disabled="!inputText.trim() || isStreaming"
          @click="sendMessage"
        >
          <send-outlined />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, nextTick, watch } from 'vue'
import { message } from 'ant-design-vue'
import { SendOutlined, MessageOutlined } from '@ant-design/icons-vue'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'
import { useWorkspaceStore } from '@/stores/workspace'

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

// 监听 MenuBar 中会话选中变化
watch(() => ws.currentChatSessionId, (sessionId) => {
  if (sessionId) {
    loadMessages(sessionId)
  } else {
    messages.value = []
  }
})

onMounted(async () => {
  // 动态加载 HTTP 服务器地址
  await loadHttpServerUrl()
  // 加载已启用的 LLM 模型
  await loadEnabledModel()
  // 如果 MenuBar 已加载了会话，直接加载消息
  if (ws.currentChatSessionId) {
    await loadMessages(ws.currentChatSessionId)
  }
})

/** 动态获取 HTTP 服务器地址（参考 QA 模块） */
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
      availableModels.value = [{ id: m.model_name, name: `${m.name} (${m.model_name})` }]
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
        role: m.role,
        content: m.content,
      }))
    }
  } catch (err) {
    console.error('[chat] 加载对话上下文失败:', err)
  }
  await scrollToBottom()
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

  console.log('[chat] sendMessage 开始, sessionId:', sessionId, 'text:', text)

  // 添加用户消息
  messages.value.push({ id: `msg-${Date.now()}`, role: 'user', content: text })
  inputText.value = ''
  isStreaming.value = true

  // 使用 reactive 包裹助手消息，确保流式更新触发视图重渲染
  const assistantMsg = reactive({ id: `msg-${Date.now()}-ai`, role: 'assistant', content: '' })
  messages.value.push(assistantMsg)
  await scrollToBottom()

  // 通过 HTTP SSE 调用 streamChat
  const url = `${httpServerUrl.value}/${ipcApiRoute.assistant.streamChat}`
  console.log('[chat] fetch URL:', url)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message: text, toolMode: 'CHAT' }),
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
    console.error('[chat] sendMessage 异常:', err)
    assistantMsg.content = `发送失败: ${err?.message || String(err)}`
    message.error('发送失败: ' + (err?.message || String(err)))
  } finally {
    isStreaming.value = false
  }

  await scrollToBottom()
}

/**
 * 解析并分发单条 SSE 事件（参考 QA 模块的 dispatchSseEvent）
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
      // 流开始，无需处理
      break
    case 'token':
      try {
        const data = JSON.parse(rawData)
        if (data.delta) {
          assistantMsg.content += data.delta
        }
      } catch {
        // token 数据可能不是 JSON（纯文本），直接拼接
        assistantMsg.content += rawData
      }
      break
    case 'complete':
      try {
        const data = JSON.parse(rawData)
        // 如果 token 事件没有收到内容，使用 complete 的 reply 作为完整回答
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
  if (messagesRef.value) messagesRef.value.scrollTop = messagesRef.value.scrollHeight
}

function renderMarkdown(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
}
</script>

<style lang="less" scoped>
.chat-workspace {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: var(--bg-layout);
}

.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  background-color: var(--bg-panel);

  &__toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    height: 40px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-color);
  }

  &__toolbar-right {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }

  &__path {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    min-height: 0;

    &--messages {
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
  }

  &__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 200px;
    font-size: 12px;
    color: var(--text-muted);

    &--centered {
      flex-direction: column;
    }
  }
}

.panel--chat {
  flex: 1;
  min-width: 300px;
}

// 消息样式
.msg {
  max-width: 80%;

  &--user {
    align-self: flex-end;

    .msg__content {
      background: #1677ff;
      color: white;
      border-radius: 12px 12px 4px 12px;
    }
  }

  &--assistant {
    align-self: flex-start;

    .msg__content {
      background: var(--bg-sidebar);
      color: var(--text-primary);
      border-radius: 12px 12px 12px 4px;
    }
  }
}

.msg__content {
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.6;

  :deep(pre) {
    background: rgba(0, 0, 0, 0.06);
    padding: 8px 12px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 6px 0;
  }

  :deep(code) {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 12px;
  }
}

// 输入区
.chat-input-area {
  padding: 8px 12px 12px;
  display: flex;
  gap: 8px;
  align-items: flex-end;
  border-top: 1px solid var(--border-color);
  background: var(--bg-panel);
}

.chat-input {
  flex: 1;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  resize: none;
  outline: none;
  font-family: inherit;
  line-height: 1.5;
  transition: border-color 0.2s;

  &:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.1);
  }
}

.chat-send-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: #1677ff;
  color: white;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    background: #4096ff;
  }

  &:disabled {
    background: var(--border-color);
    cursor: not-allowed;
  }
}
</style>
