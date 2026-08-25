<template>
  <!-- 空状态 -->
  <div v-if="messages.length === 0 && !isStreaming" class="flex h-full flex-col items-center justify-center gap-2 text-center">
    <div class="mb-1 flex size-12 items-center justify-center rounded-2xl bg-primary/10">
      <Bot :size="28" class="text-primary opacity-60" />
    </div>
    <h2 class="text-base font-semibold text-foreground">Agent 工作区</h2>
    <p class="text-xs text-muted-foreground">读写文件 · 执行命令 · MCP 工具 · Skills</p>
  </div>

  <!-- 消息列表 -->
  <template v-else>
    <div
      v-for="msg in messages"
      :key="msg.id"
      :id="'msg-' + msg.id"
      class="flex gap-3 px-4 py-3"
      :class="msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'"
    >
      <!-- 头像 -->
        <div v-if="msg.role === 'user'" class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <!-- 用户头像 -->
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="size-4">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>
        <!-- AI 头像 -->
        <img v-else :src="modelLogo || LOGO_DEFAULT" :alt="modelName || 'Agent'" class="size-7 shrink-0 rounded-full object-cover" />

      <!-- 消息主体 -->
      <div class="flex min-w-0 flex-1 flex-col" :class="msg.role === 'user' ? 'items-end' : 'items-start'">
        <!-- 消息元信息 -->
        <div class="mb-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span class="font-medium">{{ msg.role === 'user' ? '我' : (modelName || 'Agent') }}</span>
          <span v-if="msg.time">{{ msg.time }}</span>
        </div>

        <!-- 消息内容 -->
        <div class="min-w-0 max-w-full" :class="msg.role === 'user' ? 'max-w-[85%]' : 'max-w-full w-full'">
          <!-- 用户消息 -->
          <template v-if="msg.role === 'user'">
            <div
              class="inline-block rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-[13px] leading-relaxed text-primary-foreground"
              v-html="renderMentionChips(msg.content)"
            />
          </template>

          <!-- 助手消息 -->
          <template v-else>
            <!-- 加载中（等待首个 token） -->
            <div v-if="msg.pending && !msg.content && (!msg.blocks || msg.blocks.length === 0)" class="flex items-center gap-1.5 py-2 text-muted-foreground">
              <span class="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" :style="{ animationDelay: '0ms' }" />
              <span class="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" :style="{ animationDelay: '150ms' }" />
              <span class="size-1.5 animate-bounce rounded-full bg-muted-foreground/60" :style="{ animationDelay: '300ms' }" />
              <span class="ml-1 text-xs">正在思考...</span>
            </div>

            <!-- 结构化块渲染 -->
            <template v-else>
              <!-- 执行过程折叠区 -->
              <ProcessBlockGroup
                v-if="msg.blocks && getProcessBlocks(msg.blocks).length > 0"
                :blocks="getProcessBlocks(msg.blocks)"
                :is-streaming="msg.pending"
              />

              <!-- 最终文本回答 -->
              <div v-if="msg.content" class="relative">
                <MarkdownRender
                  mode="chat"
                  :content="msg.content"
                  :final="!msg.pending"
                  :fade="false"
                  smooth-streaming="auto"
                  :render-code-blocks-as-pre="false"
                  :is-dark="isDark"
                  code-block-dark-theme="vitesse-dark"
                  code-block-light-theme="vitesse-light"
                  :themes="['vitesse-dark', 'vitesse-light']"
                  custom-id="chat"
                  :mermaid-props="{ isStrict: true, showCopyButton: true, showFullscreenButton: true, showZoomControls: true, enableMermaidInteractions: true, onRenderError: handleMermaidError }"
                />
                <span v-if="msg.pending" class="ml-0.5 inline-block size-[6px] translate-y-[2px] animate-pulse rounded-full bg-primary" />
              </div>

              <!-- 引用证据卡片 -->
              <CitationRail
                v-if="!msg.pending && msg.citations && msg.citations.length > 0"
                :citations="msg.citations"
                @citation-click="(cite) => $emit('citation-click', cite)"
              />

              <!-- 消息内联统计栏 -->
              <div
                v-if="messageStats[msg.id] && (msg.pending || messageStats[msg.id].elapsed > 0)"
                class="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground"
              >
                <span class="flex items-center gap-1">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  {{ Math.floor(messageStats[msg.id].elapsed / 60) }}:{{ String(messageStats[msg.id].elapsed % 60).padStart(2, '0') }}
                </span>
                <template v-if="messageStats[msg.id].inputTokens > 0 || messageStats[msg.id].outputTokens > 0">
                  <span class="text-muted-foreground/50">·</span>
                  <span><span class="text-muted-foreground/70">输入</span> {{ formatTokens(messageStats[msg.id].inputTokens) }}</span>
                  <span><span class="text-muted-foreground/70">输出</span> {{ formatTokens(messageStats[msg.id].outputTokens) }}</span>
                  <span v-if="messageStats[msg.id].cacheReadTokens > 0"><span class="text-muted-foreground/70">缓存读</span> {{ formatTokens(messageStats[msg.id].cacheReadTokens) }}</span>
                  <span v-if="messageStats[msg.id].cacheWriteTokens > 0"><span class="text-muted-foreground/70">缓存写</span> {{ formatTokens(messageStats[msg.id].cacheWriteTokens) }}</span>
                </template>
              </div>
            </template>
          </template>
        </div>
      </div>
    </div>
  </template>
</template>

<script setup>
import { computed } from 'vue'
import { Bot } from '@lucide/vue'
import { isDark } from '@/theme'
import MarkdownRender from 'markstream-vue'
import ProcessBlockGroup from '@/components/agent/ProcessBlockGroup.vue'
import CitationRail from '@/components/CitationRail.vue'
import { hasTaskBlocks } from '@/utils/task-progress'
import { getModelLogo, LOGO_DEFAULT } from '@/utils/model-logo'
import { inferProviderType } from '@/utils/provider-presets'

const props = defineProps({
  /** 消息列表 */
  messages: { type: Array, required: true },
  /** 是否正在流式输出 */
  isStreaming: { type: Boolean, default: false },
  /** 当前模型名称 */
  modelName: { type: String, default: '' },
  /** 消息统计 Map */
  messageStats: { type: Object, default: () => ({}) },
  /** 模型 logo URL */
  modelLogo: { type: String, default: '' },
})

defineEmits(['citation-click'])

/** 只筛选用户消息 */
const userMessages = computed(() =>
  props.messages.filter((m) => m.role === 'user')
)

/** 从 blocks 中筛选过程块 */
function getProcessBlocks(blocks) {
  if (!blocks || !Array.isArray(blocks)) return []
  return blocks.filter((b) =>
    b.type === 'thinking'
    || (b.type === 'tool_use' && b.name !== 'TaskCreate' && b.name !== 'TaskUpdate'),
  )
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

/** 格式化 Token 数量 */
function formatTokens(n) {
  if (!n || n <= 0) return '0'
  if (n < 1000) return String(n)
  if (n < 10000) return (n / 1000).toFixed(1) + 'k'
  return Math.round(n / 1000) + 'k'
}

/** HTML 转义 */
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escapeAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 将引用标记渲染为 chip 样式 HTML */
function renderMentionChips(text) {
  if (!text) return ''
  const re = /(@file:([^\s]+))|(\/skill:([^\s]+))|(#mcp:([^\s]+))|(&session:([^\s:]+)(?:::(.+))?)|(<!--DITING_SCHEDULED_RUN-->)/g
  let result = ''
  let lastIndex = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      result += escapeHtml(text.slice(lastIndex, m.index))
    }
    if (m[1]) {
      const path = m[2]
      const name = path.split('/').pop() || path
      result += `<span class="mention-chip" data-prefix="@" title="${escapeAttr(path)}">${escapeHtml(name)}</span>`
    } else if (m[3]) {
      result += `<span class="skill-mention-chip" data-prefix="/">${escapeHtml(m[4])}</span>`
    } else if (m[5]) {
      result += `<span class="mcp-mention-chip" data-prefix="#">${escapeHtml(m[6])}</span>`
    } else if (m[7]) {
      const title = m[9] ? decodeURIComponent(m[9]) : m[8]
      result += `<span class="session-mention-chip" data-prefix="&">${escapeHtml(title)}</span>`
    } else if (m[10]) {
      result += `<span class="scheduled-run-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>定时任务</span>`
    }
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) {
    result += escapeHtml(text.slice(lastIndex))
  }
  return result
}
</script>
