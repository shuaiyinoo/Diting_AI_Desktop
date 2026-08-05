<template>
  <div class="agent-workspace" ref="workspaceRef">
    <!-- ========== Chat 面板 ========== -->
    <div class="chat-panel">
      <!-- 顶部工具栏 -->
      <div class="chat-toolbar">
        <span class="chat-toolbar__title">{{ toolbarTitle }}</span>
        <div class="chat-toolbar__right">
          <span v-if="isStreaming" class="stream-status">
            <span class="stream-dot"></span>运行中
          </span>
          <a-tooltip :title="panel4Collapsed ? '展开文件面板' : '收起文件面板'">
            <button class="panel-toggle-btn" @click="togglePanel4">
              <component :is="panel4Collapsed ? 'MenuUnfoldOutlined' : 'MenuFoldOutlined'" />
            </button>
          </a-tooltip>
        </div>
      </div>

      <!-- 权限确认弹窗（从顶部弹出） -->
      <Transition name="permission-slide">
        <div v-if="permissionRequest" class="permission-popup" :class="`permission-popup--${permissionRequest.dangerLevel}`">
          <!-- 顶部标题区 -->
          <div class="permission-popup__header-section">
            <div class="permission-popup__header">
              <svg v-if="permissionRequest.dangerLevel === 'dangerous'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="permission-popup__icon">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M12 8v4" />
                <path d="M12 16h.01" />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="permission-popup__icon">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              <span class="permission-popup__title">{{ formatToolName(permissionRequest.toolName) }}</span>
              <span class="permission-popup__level" :class="`permission-popup__level--${permissionRequest.dangerLevel}`">
                {{ dangerLevelLabel(permissionRequest.dangerLevel) }}
              </span>
              <button class="permission-popup__close" @click="resolvePermission(false)" :disabled="permissionResponding">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <!-- 描述区 -->
          <div class="permission-popup__body">
            <div class="permission-popup__desc">{{ permissionRequest.description || '请求执行操作' }}</div>
          </div>

          <!-- 底部操作区 -->
          <div class="permission-popup__actions">
            <a-button size="small" @click="resolvePermission(false)" :disabled="permissionResponding">拒绝</a-button>
            <a-button v-if="permissionRequest.allowAlways" size="small" type="outline" @click="resolvePermission(true, true)" :disabled="permissionResponding">总是允许</a-button>
            <a-button size="small" type="primary" @click="resolvePermission(true)" :disabled="permissionResponding" :loading="permissionResponding">允许</a-button>
          </div>
        </div>
      </Transition>

      <!-- AskUser 问答横幅（从底部弹出） -->
      <Transition name="ask-user-slide">
        <div v-if="askUserRequest" class="ask-user-popup">
          <!-- 顶部蓝色标题区 -->
          <div class="ask-user-popup__question-section">
            <div class="ask-user-popup__question-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ask-user-popup__icon">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <path d="M12 17h.01" />
              </svg>
              <span class="ask-user-popup__title">Agent 需要你的回答</span>
              <button class="ask-user-popup__close" @click="dismissAskUser">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          <!-- 问答区：每个问题下方紧跟其选项 -->
          <div class="ask-user-popup__body">
            <div v-for="(q, qIdx) in askUserRequest.questions" :key="qIdx" class="ask-user-popup__qa-item">
              <div class="ask-user-popup__question-text">{{ q.question }}</div>
              <div class="ask-user-popup__options">
                <button
                  v-for="(opt, oIdx) in q.options"
                  :key="oIdx"
                  class="ask-user-popup-option"
                  :class="{ 'ask-user-popup-option--selected': isAskUserOptionSelected(qIdx, oIdx) }"
                  @click="toggleAskUserOption(qIdx, oIdx, q.multiSelect)"
                >
                  <span class="ask-user-popup-option__check">
                    <svg v-if="isAskUserOptionSelected(qIdx, oIdx)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <span class="ask-user-popup-option__content">
                    <span class="ask-user-popup-option__label">{{ opt.label }}</span>
                    <span v-if="opt.description" class="ask-user-popup-option__desc">{{ opt.description }}</span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          <!-- 底部操作区 -->
          <div class="ask-user-popup__actions">
            <a-button size="small" type="primary" @click="submitAskUser" :disabled="!hasAskUserAnswer" :loading="askUserResponding">提交回答</a-button>
          </div>
        </div>
      </Transition>

      <!-- ========== 消息列表区域 ========== -->
      <div class="chat-messages" ref="messagesRef" @scroll="onMessagesScroll">
        <!-- 空状态 -->
        <div v-if="messages.length === 0 && !isStreaming" class="chat-empty">
          <div class="chat-empty__icon">
            <RobotOutlined style="font-size: 28px; color: var(--accent); opacity: 0.6" />
          </div>
          <h2 class="chat-empty__title">Agent 工作区</h2>
          <p class="chat-empty__desc">读写文件 · 执行命令 · MCP 工具 · Skills</p>
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
                <span class="msg-item__name">{{ msg.role === 'user' ? '我' : (selectedModel || 'Agent') }}</span>
                <span v-if="msg.time" class="msg-item__time">{{ msg.time }}</span>
              </div>
            </div>

            <!-- 消息内容 -->
            <div class="msg-item__content" :class="msg.role === 'user' ? 'msg-item__content--user' : 'msg-item__content--assistant'">
              <!-- 用户消息 -->
              <template v-if="msg.role === 'user'">
                <div class="msg-user-bubble" v-html="renderMentionChips(msg.content)"></div>
              </template>

              <!-- 助手消息 -->
              <template v-else>
                <!-- 加载中（等待首个 token） -->
                <div v-if="msg.pending && !msg.content && (!msg.blocks || msg.blocks.length === 0)" class="msg-loading">
                  <span class="msg-loading__dot" />
                  <span class="msg-loading__dot" />
                  <span class="msg-loading__dot" />
                  <span class="msg-loading__text">正在思考...</span>
                </div>

                <!-- 结构化块渲染 -->
                <template v-else>
                  <!-- 执行过程折叠区（有 thinking 或 tool 块时显示） -->
                  <ProcessBlockGroup
                    v-if="msg.blocks && getProcessBlocks(msg.blocks).length > 0"
                    :blocks="getProcessBlocks(msg.blocks)"
                    :is-streaming="msg.pending"
                  />

                  <!-- 最终文本回答 -->
                  <div v-if="msg.content" class="msg-markdown">
                    <MarkdownRender
                      mode="chat"
                      :content="msg.content"
                      :final="!msg.pending"
                      :fade="false"
                      smooth-streaming="auto"
                    />
                    <span v-if="msg.pending" class="msg-streaming-dot" />
                  </div>

                  <!-- 消息内联统计栏 -->
                  <div v-if="messageStats[msg.id] && (msg.pending || messageStats[msg.id].elapsed > 0)" class="msg-stats">
                    <span class="msg-stats-item msg-stats-item--time">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="msg-stats-icon">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      {{ Math.floor(messageStats[msg.id].elapsed / 60) }}:{{ String(messageStats[msg.id].elapsed % 60).padStart(2, '0') }}
                    </span>
                    <template v-if="messageStats[msg.id].inputTokens > 0 || messageStats[msg.id].outputTokens > 0">
                      <span class="msg-stats-divider">·</span>
                      <span class="msg-stats-item"><span class="msg-stats-label">输入</span><span class="msg-stats-value">{{ formatTokens(messageStats[msg.id].inputTokens) }}</span></span>
                      <span class="msg-stats-item"><span class="msg-stats-label">输出</span><span class="msg-stats-value">{{ formatTokens(messageStats[msg.id].outputTokens) }}</span></span>
                      <span v-if="messageStats[msg.id].cacheReadTokens > 0" class="msg-stats-item"><span class="msg-stats-label">缓存读</span><span class="msg-stats-value">{{ formatTokens(messageStats[msg.id].cacheReadTokens) }}</span></span>
                      <span v-if="messageStats[msg.id].cacheWriteTokens > 0" class="msg-stats-item"><span class="msg-stats-label">缓存写</span><span class="msg-stats-value">{{ formatTokens(messageStats[msg.id].cacheWriteTokens) }}</span></span>
                    </template>
                  </div>
                </template>
              </template>
            </div>
          </div>
        </template>
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

      <!-- ========== 底部输入区域（卡片式） ========== -->
      <div class="chat-input-wrapper">
        <!-- 浮层容器：仅在流式时显示协作子 Agent + 任务进度 -->
        <Transition name="task-progress-slide">
          <div v-if="isStreaming && (delegations.length > 0 || (currentTaskBlocks.length > 0 && hasTaskBlocks(currentTaskBlocks)))" class="task-progress-floating">
            <DelegationCard
              v-if="delegations.length > 0"
              :delegations="delegations"
            />
            <TaskProgressCard
              v-if="currentTaskBlocks.length > 0 && hasTaskBlocks(currentTaskBlocks)"
              :blocks="currentTaskBlocks"
              :is-streaming="isStreaming"
            />
          </div>
        </Transition>

        <div class="chat-input-card" :class="{ 'chat-input-card--focused': inputFocused }">
          <!-- 输入区：TipTap 富文本编辑器，支持 @文件 /Skill #MCP &会话 引用 -->
          <RichTextInput
            v-model="inputText"
            :placeholder="inputPlaceholder"
            :disabled="false"
            :auto-focus-trigger="currentSessionId"
            :workspace-id="ws.currentAgentProject?.id"
            :workspace-slug="ws.currentAgentProject?.slug || 'default'"
            :session-id="currentSessionId"
            @submit="sendMessage"
            @focus="inputFocused = true"
            @blur="inputFocused = false"
          />

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

    <!-- ========== 文件面板 ========== -->
    <template v-if="!panel4Collapsed">
      <PanelDivider @resize="onPanel4Resize" />
      <div class="panel panel--files" :style="{ width: panel4Width + 'px', flexShrink: 0 }">
        <!-- 顶部：文件模式切换 + 操作按钮 -->
        <div class="file-panel-header">
          <div class="file-mode-switch">
            <button
              type="button"
              class="file-mode-btn"
              :class="{ 'file-mode-btn--active': filePanelMode === 'project' }"
              @click="switchFileMode('project')"
            >
              <FolderOutlined />
              <span>项目文件</span>
            </button>
            <button
              type="button"
              class="file-mode-btn"
              :class="{ 'file-mode-btn--active': filePanelMode === 'session' }"
              @click="switchFileMode('session')"
            >
              <FileOutlined />
              <span>会话文件</span>
            </button>
          </div>
          <div class="file-panel-actions">
            <a-tooltip title="添加文件">
              <button class="panel-toggle-btn" @click="addFileToProject">
                <PlusOutlined />
              </button>
            </a-tooltip>
            <a-tooltip title="刷新">
              <button class="panel-toggle-btn" @click="loadFileTree">
                <ReloadOutlined />
              </button>
            </a-tooltip>
          </div>
        </div>

        <!-- 文件列表 -->
        <div class="panel__body">
          <div v-if="fileTree.length === 0" class="files-empty">
            <FolderOutlined style="font-size: 32px" />
            <p>{{ filePanelMode === 'project' ? '暂无项目文件' : '暂无会话文件' }}</p>
            <p v-if="filePanelMode === 'project'" class="files-empty__hint">点击 + 添加文件</p>
          </div>
          <div v-else class="file-tree">
            <div
              v-for="node in flatFileTree"
              :key="node.path"
              class="file-tree__item"
              :class="{ 'file-tree__item--dir': node.isDir }"
              :style="{ paddingLeft: 8 + node.depth * 16 + 'px' }"
              @click="node.isDir ? toggleDir(node) : openFile(node)"
            >
              <component
                v-if="node.isDir"
                :is="node.expanded ? 'DownOutlined' : 'RightOutlined'"
                class="file-tree__arrow"
              />
              <span v-else class="file-tree__arrow-spacer" />
              <component :is="node.isDir ? 'FolderOutlined' : 'FileOutlined'" class="file-tree__icon" />
              <span class="file-tree__name">{{ node.name }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { message } from 'ant-design-vue'
import {
  RobotOutlined,
  FolderOutlined,
  FileOutlined,
  ReloadOutlined,
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  PlusOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons-vue'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAgentStore } from '@/stores/agent'
import MarkdownRender from 'markstream-vue'
import PanelDivider from '@/components/layout/PanelDivider.vue'
import ProcessBlockGroup from '@/components/agent/ProcessBlockGroup.vue'
import TaskProgressCard from '@/components/agent/TaskProgressCard.vue'
import DelegationCard from '@/components/agent/DelegationCard.vue'
import RichTextInput from '@/components/agent/RichTextInput.vue'
import { hasTaskBlocks } from '@/utils/task-progress'

const ws = useWorkspaceStore()
const agentStore = useAgentStore()

// ========== 顶部标题：项目名称 / 会话名称 ==========
const toolbarTitle = computed(() => {
  const projectName = ws.currentAgentProject?.name
  // 优先从 agent store 获取会话名称（MenuBar 修改后同步）
  const sessionId = currentSessionId.value || agentStore.currentSessionId
  const session = agentStore.sessions.find((s) => s.id === sessionId)
  const sessionName = session?.title || currentSession.value?.title
  if (projectName && sessionName) {
    return `${projectName} / ${sessionName}`
  }
  return sessionName || projectName || 'Agent'
})

// ========== HTTP 服务器地址（动态加载） ==========
const httpServerUrl = ref('http://127.0.0.1:7071')

// ========== 模型选择 ==========
const selectedModel = ref(null)
const availableModels = ref([])

// ========== 面板宽度 & 折叠 ==========
const workspaceRef = ref(null)
const panel4Width = ref(300)
const panel4Collapsed = ref(false)

function togglePanel4() {
  panel4Collapsed.value = !panel4Collapsed.value
}

function onPanel4Resize(delta) {
  panel4Width.value = Math.min(400, Math.max(240, panel4Width.value - delta))
}

// ========== 数据 ==========
// 流式状态（messages / isStreaming / currentSessionId）全部使用 agent store，
// 组件卸载不中断流式请求
const sessions = computed(() => agentStore.sessions)
const currentSessionId = computed(() => agentStore.currentSessionId)
const currentSession = computed(() => agentStore.currentSession)
const messages = computed(() => agentStore.messages)
const isStreaming = computed(() => agentStore.isStreaming)

// ========== 任务进度浮动卡片：从最新助手消息提取任务块 ==========
const currentTaskBlocks = computed(() => {
  // 优先取正在流式的助手消息
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const msg = messages.value[i]
    if (msg.role === 'assistant' && msg.pending) {
      return msg.blocks || []
    }
  }
  // 流式结束后仍保留最后一条含任务块的助手消息
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const msg = messages.value[i]
    if (msg.role === 'assistant' && msg.blocks && msg.blocks.length > 0) {
      return msg.blocks
    }
  }
  return []
})

const inputText = ref('')
const messagesRef = ref(null)
const inputFocused = ref(false)
// 滚动追踪：用户是否处于消息列表底部
const isAtBottom = ref(true)
// 会话切换标记：切换后等待消息加载完成再滚动到底部
let pendingScrollToBottom = false

// 输入框占位文字
const inputPlaceholder = computed(() =>
  '输入指令... (@ 引用文件, / 调用 Skill, # 使用 MCP, & 引用会话, Enter 发送)'
)
const fileTree = ref([])
const filePanelMode = ref('project') // 'project' | 'session'
const fileLoading = ref(false)
const permissionRequest = ref(null)
const permissionResponding = ref(false)
const askUserRequest = ref(null)
const askUserResponding = ref(false)
const askUserAnswers = reactive(new Map()) // qIdx → Set<optionIdx>

// ========== 辅助函数 ==========

/**
 * 将用户消息中的引用标记（@file: /skill: #mcp: &session:）渲染为 chip 样式 HTML
 * 非 标记部分做 HTML 转义，防 XSS
 */
function renderMentionChips(text) {
  if (!text) return ''
  // 正则匹配四种引用标记 + 定时任务标记
  const re = /(@file:([^\s]+))|(\/skill:([^\s]+))|(#mcp:([^\s]+))|(&session:([^\s:]+)(?:::(.+))?)|(<!--DITING_SCHEDULED_RUN-->)/g
  let result = ''
  let lastIndex = 0
  let m
  while ((m = re.exec(text)) !== null) {
    // 转义前面的纯文本
    if (m.index > lastIndex) {
      result += escapeHtml(text.slice(lastIndex, m.index))
    }
    if (m[1]) {
      // @file:path → 取文件名作为 label
      const path = m[2]
      const name = path.split('/').pop() || path
      result += `<span class="mention-chip" data-prefix="@" title="${escapeAttr(path)}">${escapeHtml(name)}</span>`
    } else if (m[3]) {
      // /skill:slug
      result += `<span class="skill-mention-chip" data-prefix="/">${escapeHtml(m[4])}</span>`
    } else if (m[5]) {
      // #mcp:name
      result += `<span class="mcp-mention-chip" data-prefix="#">${escapeHtml(m[6])}</span>`
    } else if (m[7]) {
      // &session:id::title
      const title = m[9] ? decodeURIComponent(m[9]) : m[8]
      result += `<span class="session-mention-chip" data-prefix="&">${escapeHtml(title)}</span>`
    } else if (m[10]) {
      // <!--DITING_SCHEDULED_RUN--> → 定时任务标记
      result += `<span class="scheduled-run-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>定时任务</span>`
    }
    lastIndex = m.index + m[0].length
  }
  // 尾部纯文本
  if (lastIndex < text.length) {
    result += escapeHtml(text.slice(lastIndex))
  }
  return result
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escapeAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * 从 AgentMessage.content 中提取纯文本
 *
 * 后端持久化的 content 是 AgentMessageBlock[] 数组：
 *   [{ type: 'text', text: '...' }, { type: 'tool_use', ... }, ...]
 * 前端渲染只需要 text 块的文本内容，拼接为纯字符串。
 */
function extractTextFromContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block?.type === 'text' && block.text)
    .map((block) => block.text)
    .join('\n')
}

// ========== 协作子 Agent 状态（从 store 按会话过滤） ==========
const delegations = computed(() => {
  const sid = agentStore.currentSessionId
  return sid ? (agentStore.allDelegations[sid] || []) : []
})

// ========== Token / 时间统计（每条消息独立） ==========
const messageStats = computed(() => agentStore.messageStats)

/**
 * 从消息 blocks 中筛选“过程块”（thinking + tool_use）
 * 这些块会在 ProcessBlockGroup 折叠区中展示
 */
function getProcessBlocks(blocks) {
  if (!blocks || !Array.isArray(blocks)) return []
  // 排除 TaskCreate / TaskUpdate：这些工具调用由 TaskProgressCard 单独展示
  return blocks.filter((b) =>
    b.type === 'thinking'
    || (b.type === 'tool_use' && b.name !== 'TaskCreate' && b.name !== 'TaskUpdate'),
  )
}

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

// 流式逻辑已移至 agentStore，组件卸载不中断

onMounted(async () => {
  await loadHttpServerUrl()
  await loadEnabledModel()
  // 使用 store 统一加载会话
  await agentStore.loadSessions()

  // 检查是否有 Todo 启动 Agent 的待发送提示词
  const pending = agentStore.pendingPrompt
  if (pending && pending.sessionId) {
    // 选中 Todo 创建的会话
    await agentStore.selectSession(pending.sessionId)
    // 消费提示词
    const promptText = pending.message
    agentStore.pendingPrompt = null
    // 等待 UI 就绪后自动发送
    await nextTick()
    if (promptText && !isStreaming.value) {
      await agentStore.sendMessage({
        text: promptText,
        model: selectedModel.value,
        workspaceSlug: ws.currentAgentProject?.slug || undefined,
        workspaceId: pending.workspaceId || ws.currentAgentProject?.id,
        httpServerUrl: httpServerUrl.value,
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
  } else if (agentStore.sessions.length > 0 && !agentStore.currentSessionId) {
    // selectSession 会触发 currentSessionId watch → 设置 pendingScrollToBottom → messages 加载后滚动
    await agentStore.selectSession(agentStore.sessions[0].id)
  } else if (messages.value.length > 0) {
    // currentSessionId 已存在（如从其他页面切回），消息已加载，直接滚动
    isAtBottom.value = true
    await nextTick()
    scrollToBottom(true)
  }
})

// onUnmounted 不再 abort，流式请求在 store 中继续运行

// 监听 MenuBar 中项目选中变化
watch(() => ws.currentAgentProjectId, () => {
  loadFileTree()
})

// 监听会话变化时刷新会话文件
watch(() => currentSessionId.value, () => {
  if (filePanelMode.value === 'session') {
    loadFileTree()
  }
})

// 监听会话切换：设置滚动标记，等待消息加载完成后由 messages watch 执行滚动
watch(() => agentStore.currentSessionId, () => {
  pendingScrollToBottom = true
})

// 监听消息变化：会话切换后消息加载完成时，强制滚动到底部
watch(() => messages.value.length, async () => {
  if (pendingScrollToBottom && messages.value.length > 0) {
    pendingScrollToBottom = false
    isAtBottom.value = true
    await nextTick()
    scrollToBottom(true)
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
    console.warn('[agent] 获取 HTTP 服务器地址失败，使用默认地址:', err)
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
    console.error('[agent] 加载已启用模型失败:', err)
  }
}

async function loadSessions() {
  // 使用 agent store 统一加载
  await agentStore.loadSessions()
  if (agentStore.sessions.length > 0 && !agentStore.currentSessionId) {
    await agentStore.selectSession(agentStore.sessions[0].id)
  }
}

// selectSession 委托给 store（含消息加载）
async function selectSession(sessionId) {
  await agentStore.selectSession(sessionId)
  // 切换会话时强制滚动到底部：重置 isAtBottom，等待 DOM 更新后再滚动
  isAtBottom.value = true
  await nextTick()
  scrollToBottom(true)
}

/** 切换文件面板模式 */
function switchFileMode(mode) {
  if (filePanelMode.value === mode) return
  filePanelMode.value = mode
  loadFileTree()
}

/** 加载文件列表 */
async function loadFileTree() {
  fileTree.value = []
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
      fileTree.value = res.data || []
    }
  } catch (err) {
    console.error('[agent] 加载文件列表失败:', err)
  } finally {
    fileLoading.value = false
  }
}

/** 添加文件到项目文件目录 */
async function addFileToProject() {
  const workspaceId = ws.currentAgentProject?.id
  if (!workspaceId) {
    message.warning('请先选择一个 Agent 项目')
    return
  }
  try {
    const res = await ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
      action: 'add',
      workspaceId,
      mode: 'project',
    })
    if (res.code === 0) {
      fileTree.value = res.data || []
      if (res.message && res.message !== '用户取消选择') {
        message.success(res.message)
      }
    } else {
      message.error(res.message || '添加文件失败')
    }
  } catch (err) {
    console.error('[agent] 添加文件失败:', err)
    message.error('添加文件失败')
  }
}

/** 打开文件（占位：后续可接入编辑器预览） */
function openFile(file) {
  console.log('[agent] 打开文件:', file)
}

// ========== 文件树形结构 ==========

/** 展开的目录集合 */
const expandedDirs = ref(new Set())

/** 将后端返回的扁平文件列表转换为树形结构 */
function buildFileTreeData(flatList) {
  const root = []
  const dirMap = new Map()

  for (const item of flatList) {
    const parts = item.path.split('/')
    const name = parts[parts.length - 1]
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''

    const node = {
      name,
      path: item.path,
      isDir: item.isDir,
      size: item.size || 0,
      depth: parts.length - 1,
      expanded: expandedDirs.value.has(item.path),
      children: [],
    }

    if (parentPath && dirMap.has(parentPath)) {
      dirMap.get(parentPath).children.push(node)
    } else {
      root.push(node)
    }

    if (item.isDir) {
      dirMap.set(item.path, node)
    }
  }

  return root
}

/** 递归展平树为列表（仅显示已展开目录的子项） */
function flattenTree(nodes, depth = 0, result = []) {
  for (const node of nodes) {
    // 更新 depth 和 expanded 状态
    node.depth = depth
    node.expanded = expandedDirs.value.has(node.path)
    result.push(node)
    if (node.isDir && node.expanded && node.children.length > 0) {
      flattenTree(node.children, depth + 1, result)
    }
  }
  return result
}

/** 展平后的文件树（用于渲染） */
const flatFileTree = computed(() => {
  const tree = buildFileTreeData(fileTree.value)
  return flattenTree(tree)
})

/** 展开/折叠目录 */
function toggleDir(node) {
  if (expandedDirs.value.has(node.path)) {
    expandedDirs.value.delete(node.path)
  } else {
    expandedDirs.value.add(node.path)
  }
  // 触发响应式更新
  expandedDirs.value = new Set(expandedDirs.value)
}

// ========== 权限横幅：SSE 事件处理 + HTTP 响应回传 ==========

/** 格式化工具显示名称 */
function formatToolName(toolName) {
  // MCP 工具名格式: mcp__server__tool → server / tool
  const parts = toolName.split('__')
  if (parts[0] === 'mcp' && parts.length >= 3) {
    return `${parts[1]} / ${parts.slice(2).join('__')}`
  }
  return toolName
}

/** 危险等级标签 */
function dangerLevelLabel(level) {
  switch (level) {
    case 'safe': return '安全'
    case 'dangerous': return '危险'
    default: return '需确认'
  }
}

/**
 * 响应权限请求：通过 HTTP POST 回传结果到后端
 *
 * 后端 permissionService 收到响应后 resolve Promise，
 * 工具继续执行（allow）或抛出错误（deny）。
 */
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
    message.error('响应权限请求失败: ' + (err?.message || String(err)))
  } finally {
    permissionRequest.value = null
    permissionResponding.value = false
  }
}

// ========== AskUser 横幅：交互式问答 ==========

/** 检查选项是否被选中 */
function isAskUserOptionSelected(qIdx, oIdx) {
  const selected = askUserAnswers.get(qIdx)
  return selected?.has(oIdx) ?? false
}

/** 切换选项选中状态 */
function toggleAskUserOption(qIdx, oIdx, multiSelect) {
  if (!multiSelect) {
    // 单选：只选一个
    askUserAnswers.set(qIdx, new Set([oIdx]))
  } else {
    // 多选：切换选中状态
    const selected = askUserAnswers.get(qIdx) ?? new Set()
    if (selected.has(oIdx)) {
      selected.delete(oIdx)
    } else {
      selected.add(oIdx)
    }
    askUserAnswers.set(qIdx, selected)
  }
}

/** 是否有有效答案 */
const hasAskUserAnswer = computed(() => {
  if (!askUserRequest.value) return false
  return askUserRequest.value.questions.some((_, qIdx) =>
    (askUserAnswers.get(qIdx)?.size ?? 0) > 0,
  )
})

/** 提交 AskUser 回答 */
async function submitAskUser() {
  if (!askUserRequest.value || !hasAskUserAnswer.value || askUserResponding.value) return
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
      body: JSON.stringify({
        requestId: askUserRequest.value.requestId,
        answers,
      }),
    })
  } catch (err) {
    console.error('[agent] 提交 AskUser 回答失败:', err)
    message.error('提交回答失败: ' + (err?.message || String(err)))
  } finally {
    askUserRequest.value = null
    askUserAnswers.clear()
    askUserResponding.value = false
  }
}

/** 关闭 AskUser 横幅（终止会话） */
function dismissAskUser() {
  askUserRequest.value = null
  askUserAnswers.clear()
  // 停止生成（委托给 store）
  agentStore.stopGeneration()
}

/**
 * 发送消息：委托给 agentStore.sendMessage
 * 流式状态保存在 store 中，组件卸载不中断
 */
async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || isStreaming.value) return
  inputText.value = ''
  await agentStore.sendMessage({
    text,
    model: selectedModel.value,
    workspaceSlug: ws.currentAgentProject?.slug || undefined,
    workspaceId: ws.currentAgentProject?.id,
    httpServerUrl: httpServerUrl.value,
    onScroll: () => scrollToBottom(),
    onEvent: (eventName, data) => {
      if (eventName === 'permission_request') {
        permissionRequest.value = data
      } else if (eventName === 'ask_user') {
        askUserRequest.value = data
        askUserAnswers.clear()
      }
      // delegation_update 已在 store 中处理，无需在此重复
    },
  })
}

/** 停止生成 */
function stopGeneration() {
  agentStore.stopGeneration()
}

/**
 * 智能滚动：仅在用户已处于底部时自动滚动
 * 用 requestAnimationFrame 节流，避免频繁 DOM 操作阻塞页面
 * @param force - 强制滚动到底部（切换会话时使用）
 */
let scrollRafId = null
async function scrollToBottom(force = false) {
  if (!force && !isAtBottom.value) return
  if (scrollRafId) return  // 已有待执行的 rAF，跳过
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
  // 允许 30px 容差判断是否在底部
  isAtBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 30
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

/** 格式化 Token 数量（1k+ 用 k 显示） */
function formatTokens(n) {
  if (!n || n <= 0) return '0'
  if (n < 1000) return String(n)
  if (n < 10000) return (n / 1000).toFixed(1) + 'k'
  return Math.round(n / 1000) + 'k'
}
</script>

<style lang="less" scoped>
@import './agent-styles.less';
</style>
