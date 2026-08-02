<template>
  <div class="process-block-group">
    <!-- 折叠/展开按钮 -->
    <button
      type="button"
      class="process-block-group__toggle"
      @click="toggleExpand"
    >
      <!-- 折叠箭头 -->
      <svg
        class="process-block-group__chevron"
        :class="{ 'process-block-group__chevron--expanded': expanded }"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M9 18l6-6-6-6" />
      </svg>

      <!-- 摘要文字 -->
      <span class="process-block-group__summary">{{ summary }}</span>

      <!-- 倒计时 -->
      <span v-if="collapseCountdown !== null" class="process-block-group__countdown">
        （{{ collapseCountdown }}）
      </span>

      <!-- 工具图标 -->
      <span v-if="toolNames.length > 0" class="process-block-group__tools">
        <span
          v-for="name in visibleToolNames"
          :key="name"
          class="process-block-group__tool-icon"
          :title="name"
        >{{ getToolIconLabel(name) }}</span>
        <span v-if="hiddenToolCount > 0" class="process-block-group__tool-more">
          +{{ hiddenToolCount }}
        </span>
      </span>
    </button>

    <!-- 内容区（展开时显示） -->
    <div v-if="shouldRenderContent" class="process-block-group__content">
      <!-- 逐个渲染块 -->
      <div
        v-for="(block, i) in blocks"
        :key="i"
        class="process-block-group__item"
        :class="{ 'process-block-group__item--dimmed': isStreaming && !(isMessageTail && i === blocks.length - 1) }"
      >
        <!-- Thinking 块 -->
        <div v-if="block.type === 'thinking'" class="thinking-block">
          <div class="thinking-block__header">
            <svg class="thinking-block__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
              <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
            </svg>
            <span class="thinking-block__label">Thinking</span>
          </div>
          <div
            ref="thinkingContentRef"
            class="thinking-block__body"
            :class="{ 'thinking-block__body--collapsed': shouldCollapseThinking(block.thinking) && !thinkingExpanded[i] }"
          >
            <div class="thinking-block__text">{{ block.thinking }}</div>
          </div>
          <button
            v-if="shouldCollapseThinking(block.thinking)"
            type="button"
            class="thinking-block__toggle"
            @click="toggleThinking(i)"
          >
            <svg v-if="thinkingExpanded[i]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px">
              <path d="M18 15l-6-6-6 6" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px">
              <path d="M6 9l6 6 6-6" />
            </svg>
            <span>{{ thinkingExpanded[i] ? '收起' : '展开思考' }}</span>
          </button>
        </div>

        <!-- Tool Use 块 -->
        <div v-else-if="block.type === 'tool_use'" class="tool-use-block">
          <button
            type="button"
            class="tool-use-block__header"
            @click="toggleTool(i)"
          >
            <!-- 状态图标 -->
            <svg v-if="!block.done && isStreaming" class="tool-use-block__spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <svg v-else-if="block.isError" class="tool-use-block__error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>

            <!-- 工具图标 -->
            <span class="tool-use-block__icon">{{ getToolIconLabel(block.name) }}</span>

            <!-- 工具名/短语 -->
            <span class="tool-use-block__label">{{ getToolPhrase(block) }}</span>

            <!-- 展开箭头 -->
            <svg
              class="tool-use-block__chevron"
              :class="{ 'tool-use-block__chevron--expanded': toolExpanded[i] }"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>

          <!-- 工具结果（展开时） -->
          <div v-if="toolExpanded[i] && block.result != null" class="tool-use-block__result">
            <pre class="tool-use-block__result-text">{{ formatToolResult(block.result) }}</pre>
          </div>
        </div>
      </div>

      <!-- 底部收起按钮 -->
      <button
        type="button"
        class="process-block-group__collapse-btn"
        @click="expanded = false"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;transform:rotate(-90deg)">
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span>收起</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue'

const props = defineProps({
  /** 过程块数组（thinking + tool_use） */
  blocks: {
    type: Array,
    default: () => []
  },
  /** 是否正在流式输出 */
  isStreaming: {
    type: Boolean,
    default: false
  },
  /** 是否为消息末尾项 */
  isMessageTail: {
    type: Boolean,
    default: false
  },
})

// ===== 折叠/展开状态 =====
const expanded = ref(props.isStreaming)
const shouldRenderContent = ref(props.isStreaming)
const collapseCountdown = ref(null)
const userToggled = ref(false)
const wasStreaming = ref(props.isStreaming)
let autoCollapseTimer = null

function toggleExpand() {
  userToggled.value = true
  collapseCountdown.value = null
  if (autoCollapseTimer) {
    clearTimeout(autoCollapseTimer)
    autoCollapseTimer = null
  }
  expanded.value = !expanded.value
}

// 流式结束后自动折叠
watch(() => props.isStreaming, (streaming) => {
  if (streaming) {
    collapseCountdown.value = null
    if (!wasStreaming.value) {
      userToggled.value = false
    }
    if (!userToggled.value) {
      expanded.value = true
    }
    wasStreaming.value = true
    return
  }

  const shouldAutoCollapse = wasStreaming.value && !userToggled.value
  wasStreaming.value = false

  if (!shouldAutoCollapse) {
    if (!userToggled.value) {
      expanded.value = false
    }
    return
  }

  // 3 秒倒计时后自动折叠
  let count = 3
  collapseCountdown.value = count
  const interval = setInterval(() => {
    count--
    if (count <= 0) {
      clearInterval(interval)
      collapseCountdown.value = null
      expanded.value = false
    } else {
      collapseCountdown.value = count
    }
  }, 1000)
  autoCollapseTimer = interval
})

// 控制 DOM 渲染（折叠后延迟卸载）
watch(expanded, (val) => {
  if (val) {
    shouldRenderContent.value = true
  } else {
    setTimeout(() => {
      shouldRenderContent.value = false
    }, 300)
  }
})

// ===== Thinking 块展开状态 =====
const thinkingExpanded = reactive({})

function shouldCollapseThinking(text) {
  if (!text) return false
  return text.split('\n').length > 4
}

function toggleThinking(index) {
  thinkingExpanded[index] = !thinkingExpanded[index]
}

// ===== Tool 块展开状态 =====
const toolExpanded = reactive({})

function toggleTool(index) {
  toolExpanded[index] = !toolExpanded[index]
}

// ===== 摘要构建 =====
const summary = computed(() => {
  let toolCount = 0
  let messageCount = 0
  for (const block of props.blocks) {
    if (block.type === 'tool_use') {
      toolCount++
    } else if (block.type === 'thinking') {
      messageCount++
    }
  }
  const parts = []
  if (toolCount > 0) parts.push(`${toolCount} 次工具调用`)
  if (messageCount > 0) parts.push(`${messageCount} 条消息`)
  return `执行过程：${parts.join('，') || '过程'}`
})

// ===== 工具名列表 =====
const MAX_TOOL_ICONS = 4

const toolNames = computed(() => {
  const names = []
  const seen = new Set()
  for (const block of props.blocks) {
    if (block.type !== 'tool_use') continue
    if (seen.has(block.name)) continue
    seen.add(block.name)
    names.push(block.name)
  }
  return names
})

const visibleToolNames = computed(() => toolNames.value.slice(0, MAX_TOOL_ICONS))
const hiddenToolCount = computed(() => Math.max(0, toolNames.value.length - visibleToolNames.value.length))

// ===== 工具图标标签（首字母） =====
function getToolIconLabel(toolName) {
  if (!toolName) return '?'
  // 常见工具名的简写
  const map = {
    'Read': 'R',
    'Write': 'W',
    'Edit': 'E',
    'Bash': '$',
    'Grep': 'G',
    'Glob': 'F',
    'LS': 'L',
    'MultiEdit': 'M',
    'WebSearch': 'S',
    'WebFetch': 'H',
    'TaskCreate': '✓',
    'TaskUpdate': '✓',
  }
  return map[toolName] || toolName[0].toUpperCase()
}

// ===== 工具短语 =====
function getToolPhrase(block) {
  const name = block.name || 'unknown'
  const input = block.input || {}

  // 根据工具类型生成语义短语
  switch (name) {
    case 'Read': {
      const fp = input.file_path || input.path || ''
      return fp ? `读取 ${shortenPath(fp)}` : '读取文件'
    }
    case 'Write': {
      const fp = input.file_path || input.path || ''
      return fp ? `写入 ${shortenPath(fp)}` : '写入文件'
    }
    case 'Edit': {
      const fp = input.file_path || input.path || ''
      return fp ? `编辑 ${shortenPath(fp)}` : '编辑文件'
    }
    case 'MultiEdit': {
      const fp = input.file_path || input.path || ''
      return fp ? `批量编辑 ${shortenPath(fp)}` : '批量编辑'
    }
    case 'Bash': {
      const cmd = input.command || ''
      if (cmd) {
        const short = cmd.length > 50 ? cmd.slice(0, 50) + '…' : cmd
        return `执行: ${short}`
      }
      return '执行命令'
    }
    case 'Grep': {
      const pattern = input.pattern || ''
      return pattern ? `搜索 "${pattern}"` : '搜索'
    }
    case 'Glob': {
      const pattern = input.pattern || ''
      return pattern ? `查找 ${pattern}` : '查找文件'
    }
    case 'LS': {
      const path = input.path || ''
      return path ? `列出 ${shortenPath(path)}` : '列出目录'
    }
    case 'WebSearch': {
      const query = input.query || ''
      return query ? `搜索: ${query}` : '网络搜索'
    }
    case 'WebFetch': {
      const url = input.url || ''
      return url ? `获取 ${url}` : '获取网页'
    }
    case 'TaskCreate': {
      const subject = input.subject || ''
      return subject ? `创建任务: ${subject}` : '创建任务'
    }
    case 'TaskUpdate': {
      const statusMap = {
        pending: '待处理',
        in_progress: '进行中',
        completed: '已完成',
        blocked: '已阻塞',
        cancelled: '已取消',
      }
      const parts = []
      if (input.taskId) parts.push(`#${input.taskId}`)
      if (input.status && statusMap[input.status]) parts.push(statusMap[input.status])
      if (input.subject) parts.push(input.subject)
      return parts.length > 0 ? `更新任务 ${parts.join(' ')}` : '更新任务'
    }
    default:
      return name
  }
}

/** 缩短文件路径，只保留最后两级 */
function shortenPath(fp) {
  if (!fp) return ''
  const parts = fp.split('/')
  if (parts.length <= 2) return fp
  return '.../' + parts.slice(-2).join('/')
}

/** 格式化工具结果为可读文本 */
function formatToolResult(result) {
  if (result == null) return ''
  if (typeof result === 'string') return result
  try {
    return JSON.stringify(result, null, 2)
  } catch {
    return String(result)
  }
}
</script>

<style lang="less" scoped>
.process-block-group {
  margin-bottom: 8px;

  &__toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: opacity 0.15s;

    &:hover {
      opacity: 0.7;
    }
  }

  &__chevron {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    color: var(--text-muted);
    opacity: 0.5;
    transition: transform 0.15s;

    &--expanded {
      transform: rotate(90deg);
    }
  }

  &__summary {
    font-size: 14px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__countdown {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--text-muted);
    opacity: 0.5;
    font-variant-numeric: tabular-nums;
  }

  &__tools {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    color: var(--text-muted);
    opacity: 0.6;
  }

  &__tool-icon {
    font-size: 11px;
    font-weight: 600;
    font-family: monospace;
  }

  &__tool-more {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  &__content {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    animation: process-fade-in 0.2s ease;
  }

  &__item {
    &--dimmed {
      opacity: 0.8;
    }
  }

  &__collapse-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 0;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-muted);
    opacity: 0.4;
    transition: opacity 0.15s;

    &:hover {
      opacity: 0.7;
    }
  }
}

@keyframes process-fade-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

// ===== Thinking 块 =====
.thinking-block {
  margin-bottom: 8px;

  &__header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }

  &__icon {
    width: 14px;
    height: 14px;
    color: var(--text-muted);
  }

  &__label {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  &__body {
    border-radius: 8px;
    padding: 10px 14px;
    background: var(--bg-sidebar);
    border: 1px dashed var(--border-color);
    overflow: hidden;

    &--collapsed {
      max-height: 5.6em;
    }
  }

  &__text {
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-primary);
    opacity: 0.9;
    white-space: pre-wrap;
    word-break: break-word;
  }

  &__toggle {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 8px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-muted);
    opacity: 0.5;
    transition: opacity 0.15s;

    &:hover {
      opacity: 0.8;
    }
  }
}

// ===== Tool Use 块 =====
.tool-use-block {
  &__header {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 0;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    max-width: 100%;
    transition: opacity 0.15s;

    &:hover {
      opacity: 0.7;
    }
  }

  &__spinner {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--accent);
    opacity: 0.5;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  &__error {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: #ef4444;
    opacity: 0.7;
  }

  &__icon {
    font-size: 14px;
    font-weight: 600;
    font-family: monospace;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  &__label {
    font-size: 14px;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__chevron {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    color: var(--text-muted);
    opacity: 0.4;
    transition: transform 0.15s;

    &--expanded {
      transform: rotate(90deg);
    }
  }

  &__result {
    margin-left: 20px;
    margin-top: 4px;
    margin-bottom: 8px;
    padding-left: 12px;
    border-left: 2px solid var(--border-color);
    animation: process-fade-in 0.15s ease;
  }

  &__result-text {
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-secondary);
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    max-height: 400px;
    overflow-y: auto;
  }
}
</style>
