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

  <!-- 用户消息浮动指示器 -->
  <div v-if="userMessages.length > 0" class="absolute right-2 top-1/2 z-10 -translate-y-1/2 flex flex-col items-end gap-[5px]">
    <button
      v-for="(um, idx) in userMessages"
      :key="um.id"
      class="block w-1 rounded-full transition-all"
      :class="railHoverIdx === idx ? 'h-[18px] bg-primary' : 'h-[14px] bg-muted-foreground/30 hover:bg-muted-foreground/50'"
      @mouseenter="$emit('rail-hover', idx)"
      @mouseleave="$emit('rail-hover', -1)"
      @click="$emit('jump', um.id)"
    />
    <!-- 悬浮预览 -->
    <div
      v-if="railHoverIdx >= 0"
      class="absolute right-3 max-w-[260px] rounded-lg border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-lg"
      :style="{ top: railPreviewOffset + 'px' }"
    >
      {{ userMessages[railHoverIdx].content }}
    </div>
  </div>
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
  /** 悬浮指示器当前索引 */
  railHoverIdx: { type: Number, default: -1 },
  /** 模型 logo URL */
  modelLogo: { type: String, default: '' },
})

defineEmits(['citation-click', 'rail-hover', 'jump'])

/** 只筛选用户消息 */
const userMessages = computed(() =>
  props.messages.filter((m) => m.role === 'user')
)

/** 悬浮预览偏移量 */
const railPreviewOffset = computed(() => {
  if (props.railHoverIdx < 0) return 0
  const spacing = 9
  const padding = 8
  return padding + props.railHoverIdx * spacing
})

/** 从 blocks 中筛选过程块 */
function getProcessBlocks(blocks) {
  if (!blocks || !Array.isArray(blocks)) return []
  return blocks.filter((b) =>
    b.type === 'thinking'
    || (b.type === 'tool_use' && b.name !== 'TaskCreate' && b.name !== 'TaskUpdate'),
  )
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
