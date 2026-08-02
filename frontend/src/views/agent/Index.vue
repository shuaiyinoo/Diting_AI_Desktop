<template>
  <div class="agent-workspace" ref="workspaceRef">
    <!-- ========== 第三部分：Agent 工作区 ========== -->
    <div class="panel panel--chat">
      <div class="panel__toolbar">
        <span class="panel__path">{{ currentSession?.title || 'Agent' }}</span>
        <div class="panel__toolbar-right">
          <span v-if="isStreaming" class="stream-status"><span class="stream-dot"></span>运行中</span>
          <a-tooltip :title="panel4Collapsed ? '展开文件面板' : '收起文件面板'">
            <button class="panel-toggle-btn" @click="togglePanel4">
              <component :is="panel4Collapsed ? 'MenuUnfoldOutlined' : 'MenuFoldOutlined'" />
            </button>
          </a-tooltip>
        </div>
      </div>

      <!-- 权限横幅 -->
      <div v-if="permissionRequest" class="permission-banner">
        <div class="permission-banner__info">
          <span class="permission-banner__tool">{{ permissionRequest.toolName }}</span>
          <span class="permission-banner__desc">{{ permissionRequest.description || '请求执行操作' }}</span>
        </div>
        <div class="permission-banner__actions">
          <a-button size="small" @click="resolvePermission(false)">拒绝</a-button>
          <a-button size="small" type="primary" @click="resolvePermission(true)">允许</a-button>
        </div>
      </div>

      <!-- 消息列表 + 工具活动 -->
      <div class="panel__body panel__body--messages" ref="messagesRef">
        <div v-for="msg in messages" :key="msg.id" class="msg" :class="`msg--${msg.role}`">
          <div class="msg__role">{{ msg.role === 'user' ? '我' : 'Agent' }}</div>
          <div class="msg__content" v-html="renderMarkdown(msg.content)"></div>
        </div>
        <div v-if="messages.length === 0" class="panel__empty panel__empty--centered">
          <robot-outlined style="font-size: 40px; opacity: 0.2" />
          <p style="margin-top: 12px; color: var(--text-muted)">Agent 工作区</p>
          <p style="font-size: 11px; color: var(--text-muted)">读写文件 · 执行命令 · MCP 工具 · Skills</p>
        </div>
      </div>

      <!-- 输入框 -->
      <div class="agent-input-area">
        <textarea
          v-model="inputText"
          class="agent-input"
          placeholder="输入指令... (Enter 发送, / 引用 Skill)"
          @keydown.enter.prevent="sendMessage"
          rows="2"
        ></textarea>
        <button class="agent-send-btn" :disabled="!inputText.trim() || isStreaming" @click="sendMessage">
          <send-outlined />
        </button>
      </div>
    </div>

    <!-- ========== 第四部分：文件区 ========== -->
    <template v-if="!panel4Collapsed">
      <PanelDivider @resize="onPanel4Resize" />
      <div class="panel panel--files" :style="{ width: panel4Width + 'px', flexShrink: 0 }">
        <div class="panel__toolbar">
          <span class="panel__path">文件</span>
          <a-tooltip title="刷新">
            <button class="panel-toggle-btn" @click="loadFileTree">
              <reload-outlined />
            </button>
          </a-tooltip>
        </div>
        <div class="panel__body">
          <div v-if="fileTree.length === 0" class="files-empty">
            <folder-outlined style="font-size: 32px" />
            <p>会话文件 / 项目文件</p>
          </div>
          <div v-else class="file-tree">
            <div
              v-for="file in fileTree"
              :key="file.path"
              class="file-tree__item"
              @click="openFile(file)"
            >
              <file-outlined class="file-tree__icon" />
              <span class="file-tree__name">{{ file.name }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue'
import {
  SendOutlined,
  RobotOutlined,
  FolderOutlined,
  FileOutlined,
  ReloadOutlined,
} from '@ant-design/icons-vue'
import { ipc } from '@/utils/ipcRenderer'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAgentStore } from '@/stores/agent'
import PanelDivider from '@/components/layout/PanelDivider.vue'

const ws = useWorkspaceStore()
const agentStore = useAgentStore()

// ========== 面板宽度 & 折叠 ==========
const workspaceRef = ref(null)
const panel4Width = ref(300)
const panel4Collapsed = ref(true)

function togglePanel4() {
  panel4Collapsed.value = !panel4Collapsed.value
}

function onPanel4Resize(delta) {
  panel4Width.value = Math.min(400, Math.max(240, panel4Width.value - delta))
}

// ========== 数据 ==========
const sessions = ref([])
const currentSessionId = ref(null)
const currentSession = ref(null)
const messages = ref([])
const inputText = ref('')
const isStreaming = ref(false)
const messagesRef = ref(null)
const fileTree = ref([])
const permissionRequest = ref(null)

onMounted(async () => {
  await loadSessions()
})

// 监听 MenuBar 中项目选中变化
watch(() => ws.currentAgentProjectId, () => {
  loadFileTree()
})

// 监听 agent store 的会话选中变化（MenuBar 点击会话时触发）
watch(() => agentStore.currentSessionId, (sessionId) => {
  if (sessionId && sessionId !== currentSessionId.value) {
    selectSession(sessionId)
  }
})

async function loadSessions() {
  try {
    const res = await ipc.invoke('controller/piAgent/sessionOperation', { action: 'list' })
    if (res.code === 0 && res.data) {
      sessions.value = res.data
      if (sessions.value.length > 0 && !currentSessionId.value) {
        await selectSession(sessions.value[0].id)
      }
    }
  } catch (err) {
    console.error('加载 Agent 会话列表失败:', err)
  }
}

async function selectSession(sessionId) {
  currentSessionId.value = sessionId
  currentSession.value = sessions.value.find((s) => s.id === sessionId)
  messages.value = []
  try {
    const res = await ipc.invoke('controller/piAgent/sessionOperation', { action: 'getMessages', sessionId })
    if (res.code === 0 && res.data) {
      messages.value = res.data
    }
  } catch (err) {
    console.error('加载会话消息失败:', err)
  }
  await scrollToBottom()
}

async function loadFileTree() {
  // 后续接入文件浏览 IPC
  fileTree.value = []
}

function openFile(file) {
  // 后续接入文件预览
  console.log('打开文件:', file)
}

function resolvePermission(allow) {
  permissionRequest.value = null
  // 后续接入权限 IPC
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return
  if (!currentSessionId.value) {
    try {
      const res = await ipc.invoke('controller/piAgent/sessionOperation', {
        action: 'create',
        title: `Agent 会话 ${sessions.value.length + 1}`,
      })
      if (res.code === 0 && res.data) {
        sessions.value.unshift(res.data)
        currentSessionId.value = res.data.id
        currentSession.value = res.data
      }
    } catch (err) {
      console.error('创建 Agent 会话失败:', err)
      return
    }
  }

  messages.value.push({ id: `msg-${Date.now()}`, role: 'user', content: text })
  inputText.value = ''
  isStreaming.value = true
  const assistantMsg = { id: `msg-${Date.now()}-ai`, role: 'assistant', content: '' }
  messages.value.push(assistantMsg)
  await scrollToBottom()

  try {
    const response = await fetch('http://127.0.0.1:7071/controller/piAgent/streamAgent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: currentSessionId.value, message: text }),
    })
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      let eventType = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) eventType = line.slice(7).trim()
        else if (line.startsWith('data: ') && eventType) {
          try {
            const data = JSON.parse(line.slice(6))
            if (eventType === 'text' && data.delta) {
              assistantMsg.content += data.delta
              await scrollToBottom()
            } else if (eventType === 'tool_start') {
              messages.value.push({
                id: `tool-${Date.now()}`,
                role: 'assistant',
                content: `🔧 **${data.toolName}**`,
              })
            } else if (eventType === 'complete' && data.reply && !assistantMsg.content) {
              assistantMsg.content = data.reply
            }
          } catch {
            /* 忽略 */
          }
          eventType = ''
        }
      }
    }
  } catch (err) {
    assistantMsg.content = `Agent 调用失败: ${err.message}`
  } finally {
    isStreaming.value = false
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
.agent-workspace {
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

.panel--files {
  min-width: 240px;
}

// 面板切换按钮
.panel-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 14px;

  &:hover {
    background-color: var(--bg-hover);
    color: var(--text-primary);
  }
}

// 消息样式
.msg {
  max-width: 85%;

  &--user {
    align-self: flex-end;
  }

  &--assistant {
    align-self: flex-start;
  }
}

.msg__role {
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: 4px;
  padding: 0 4px;
}

.msg__content {
  padding: 10px 14px;
  font-size: 13px;
  line-height: 1.6;
  border-radius: 10px;

  .msg--user & {
    background: #1677ff;
    color: white;
  }

  .msg--assistant & {
    background: var(--bg-sidebar);
    color: var(--text-primary);
  }

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
.agent-input-area {
  padding: 8px 12px 12px;
  display: flex;
  gap: 8px;
  align-items: flex-end;
  border-top: 1px solid var(--border-color);
  background: var(--bg-panel);
}

.agent-input {
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

.agent-send-btn {
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

// 流式状态
.stream-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #52c41a;
}

.stream-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #52c41a;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

// 权限横幅
.permission-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #fffbe6;
  border-bottom: 1px solid #ffe58f;

  &__info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__tool {
    font-size: 12px;
    font-weight: 600;
    color: #d48806;
  }

  &__desc {
    font-size: 11px;
    color: var(--text-muted);
  }

  &__actions {
    display: flex;
    gap: 6px;
  }
}

// 文件区
.files-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 8px;
  color: var(--text-muted);
  font-size: 12px;
}

.file-tree {
  &__item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;

    &:hover {
      background-color: var(--bg-hover);
    }
  }

  &__icon {
    font-size: 14px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  &__name {
    font-size: 12px;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
