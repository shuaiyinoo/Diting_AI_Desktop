<template>
  <div class="mb-2">
    <!-- 折叠/展开按钮 -->
    <button
      type="button"
      class="flex cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-left transition-opacity hover:opacity-70"
      @click="toggleExpand"
    >
      <!-- 折叠箭头 -->
      <svg
        class="size-3 shrink-0 text-muted-foreground opacity-50 transition-transform"
        :class="{ 'rotate-90': expanded }"
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
      <span class="truncate text-sm text-muted-foreground">{{ summary }}</span>

      <!-- 倒计时 -->
      <span v-if="collapseCountdown !== null" class="shrink-0 text-xs text-muted-foreground opacity-50" style="font-variant-numeric: tabular-nums">
        （{{ collapseCountdown }}）
      </span>

      <!-- 工具图标 -->
      <span v-if="toolNames.length > 0" class="flex shrink-0 items-center gap-1 text-muted-foreground opacity-60">
        <span
          v-for="name in visibleToolNames"
          :key="name"
          class="text-[11px] font-semibold font-mono"
          :title="name"
        >{{ getToolIconLabel(name) }}</span>
        <span v-if="hiddenToolCount > 0" class="text-[11px]" style="font-variant-numeric: tabular-nums">
          +{{ hiddenToolCount }}
        </span>
      </span>
    </button>

    <!-- 内容区（展开时显示） -->
    <div v-if="shouldRenderContent" class="mt-1.5 flex flex-col gap-2" style="animation: process-fade-in 0.2s ease">
      <!-- 逐个渲染块 -->
      <div
        v-for="(block, i) in blocks"
        :key="i"
        :class="{ 'opacity-80': isStreaming && !(isMessageTail && i === blocks.length - 1) }"
      >
        <!-- Thinking 块 -->
        <div v-if="block.type === 'thinking'" class="mb-2">
          <div class="mb-1.5 flex items-center gap-1.5">
            <svg class="size-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z" />
              <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z" />
            </svg>
            <span class="text-sm font-medium uppercase tracking-wide text-muted-foreground">Thinking</span>
          </div>
          <div
            ref="thinkingContentRef"
            class="overflow-hidden rounded-lg border border-dashed border-border bg-sidebar p-2.5 px-3.5"
            :class="{ 'max-h-[5.6em]': shouldCollapseThinking(block.thinking) && !thinkingExpanded[i] }"
          >
            <div class="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground opacity-90">{{ block.thinking }}</div>
          </div>
          <button
            v-if="shouldCollapseThinking(block.thinking)"
            type="button"
            class="mt-2 flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-xs text-muted-foreground opacity-50 transition-opacity hover:opacity-80"
            @click="toggleThinking(i)"
          >
            <svg v-if="thinkingExpanded[i]" class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 15l-6-6-6 6" />
            </svg>
            <svg v-else class="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
            <span>{{ thinkingExpanded[i] ? t('processBlock.collapse') : t('processBlock.expandThinking') }}</span>
          </button>
        </div>

        <!-- Tool Use 块 -->
        <div v-else-if="block.type === 'tool_use'">
          <button
            type="button"
            class="inline-flex max-w-full cursor-pointer items-center gap-1.5 border-none bg-transparent p-0 text-left transition-opacity hover:opacity-70"
            @click="toggleTool(i)"
          >
            <!-- 状态图标 -->
            <svg v-if="!block.done && isStreaming" class="size-3.5 shrink-0 text-primary opacity-50 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <svg v-else-if="block.isError" class="size-3.5 shrink-0 text-red-500 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>

            <!-- 工具图标 -->
            <span class="text-sm font-semibold font-mono text-muted-foreground shrink-0">{{ getToolIconLabel(block.name) }}</span>

            <!-- 工具名/短语 -->
            <span class="truncate text-sm text-muted-foreground">{{ getToolPhrase(block) }}</span>

            <!-- 展开箭头 -->
            <svg
              class="size-3 shrink-0 text-muted-foreground opacity-40 transition-transform"
              :class="{ 'rotate-90': toolExpanded[i] }"
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
          <div v-if="toolExpanded[i] && block.result != null" class="ml-5 mt-1 mb-2 border-l-2 border-border pl-3" style="animation: process-fade-in 0.15s ease">
            <pre class="m-0 max-h-[400px] overflow-y-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground font-mono">{{ formatToolResult(block.result) }}</pre>
          </div>
        </div>
      </div>

      <!-- 底部收起按钮 -->
      <button
        type="button"
        class="flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-xs text-muted-foreground opacity-40 transition-opacity hover:opacity-70"
        @click="expanded = false"
      >
        <svg class="size-3 -rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span>{{ t('processBlock.collapse') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
  // 流式输出期间不折叠，避免高度跳变导致闪烁
  if (props.isStreaming) return false
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
  if (toolCount > 0) parts.push(t('processBlock.toolCalls', { count: toolCount }))
  if (messageCount > 0) parts.push(t('processBlock.messages', { count: messageCount }))
  return t('processBlock.summary', { parts: parts.join(', ') || t('processBlock.summaryFallback') })
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
      return fp ? `${t('processBlock.read')} ${shortenPath(fp)}` : t('processBlock.readFile')
    }
    case 'Write': {
      const fp = input.file_path || input.path || ''
      return fp ? `${t('processBlock.write')} ${shortenPath(fp)}` : t('processBlock.writeFile')
    }
    case 'Edit': {
      const fp = input.file_path || input.path || ''
      return fp ? `${t('processBlock.edit')} ${shortenPath(fp)}` : t('processBlock.editFile')
    }
    case 'MultiEdit': {
      const fp = input.file_path || input.path || ''
      return fp ? `${t('processBlock.multiEdit')} ${shortenPath(fp)}` : t('processBlock.multiEditShort')
    }
    case 'Bash': {
      const cmd = input.command || ''
      if (cmd) {
        const short = cmd.length > 50 ? cmd.slice(0, 50) + '…' : cmd
        return t('processBlock.execute', { cmd: short })
      }
      return t('processBlock.executeCommand')
    }
    case 'Grep': {
      const pattern = input.pattern || ''
      return pattern ? t('processBlock.search', { pattern }) : t('processBlock.searchShort')
    }
    case 'Glob': {
      const pattern = input.pattern || ''
      return pattern ? t('processBlock.find', { pattern }) : t('processBlock.findFile')
    }
    case 'LS': {
      const path = input.path || ''
      return path ? t('processBlock.list', { path: shortenPath(path) }) : t('processBlock.listDir')
    }
    case 'WebSearch': {
      const query = input.query || ''
      return query ? t('processBlock.webSearch', { query }) : t('processBlock.webSearchShort')
    }
    case 'WebFetch': {
      const url = input.url || ''
      return url ? t('processBlock.webFetch', { url }) : t('processBlock.webFetchShort')
    }
    case 'TaskCreate': {
      const subject = input.subject || ''
      return subject ? t('processBlock.createTask', { subject }) : t('processBlock.createTaskShort')
    }
    case 'TaskUpdate': {
      const statusMap = {
        pending: t('processBlock.statusPending'),
        in_progress: t('processBlock.statusInProgress'),
        completed: t('processBlock.statusCompleted'),
        blocked: t('processBlock.statusBlocked'),
        cancelled: t('processBlock.statusCancelled'),
      }
      const parts = []
      if (input.taskId) parts.push(`#${input.taskId}`)
      if (input.status && statusMap[input.status]) parts.push(statusMap[input.status])
      if (input.subject) parts.push(input.subject)
      return parts.length > 0 ? t('processBlock.updateTask', { parts: parts.join(' ') }) : t('processBlock.updateTaskShort')
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

<style>
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

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>