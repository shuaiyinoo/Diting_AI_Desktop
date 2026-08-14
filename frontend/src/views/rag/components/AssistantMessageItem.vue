<template>
  <div class="flex gap-3 py-4" :class="roleClass === 'user' ? 'flex-row-reverse' : ''">
    <!-- 头像 -->
    <div class="flex-shrink-0">
      <div
        class="flex items-center justify-center size-8 rounded-full"
        :style="{ background: msg.role === 'USER' ? 'hsl(var(--primary))' : 'hsl(142 71% 45%)' }"
      >
        <User v-if="msg.role === 'USER'" class="size-4 text-white" />
        <Bot v-else class="size-4 text-white" />
      </div>
    </div>

    <!-- 消息体 -->
    <div class="max-w-[78%] flex flex-col" :class="roleClass === 'user' ? 'items-end' : ''">
      <!-- 角色标签 -->
      <div class="inline-flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5" :class="roleClass === 'user' ? 'flex-row-reverse' : ''">
        {{ msg.role === 'USER' ? '我' : '助手' }}
        <span
          v-if="msg.role === 'ASSISTANT' && msg.toolMode"
          class="inline-flex items-center m-0 text-[11px] leading-4 px-1.5 rounded"
          :style="{ background: msg.toolMode === 'KB_SEARCH' ? 'rgba(114,46,209,0.1)' : 'rgba(22,119,255,0.1)', color: msg.toolMode === 'KB_SEARCH' ? '#722ed1' : 'hsl(var(--primary))' }"
        >
          {{ msg.toolMode === 'KB_SEARCH' ? '文档问答' : 'AI 文档' }}
        </span>
        <span
          v-if="msg.role === 'ASSISTANT' && msg.evidenceLevel"
          class="inline-flex items-center m-0 text-[11px] leading-4 px-1.5 rounded"
          :style="evidenceLevelStyle(msg.evidenceLevel)"
        >
          {{ evidenceLevelText(msg.evidenceLevel) }}
        </span>
      </div>

      <!-- 内容区 -->
      <div class="flex flex-col">
        <!-- 用户消息 -->
        <template v-if="msg.role === 'USER'">
          <div class="px-3.5 py-2.5 rounded-lg text-sm leading-7 break-words whitespace-pre-wrap bg-primary text-primary-foreground rounded-tr-sm">{{ msg.content }}</div>
        </template>

        <!-- 助手消息 -->
        <template v-else>
          <!-- 加载中 -->
          <div v-if="msg.pending && !msg.content" class="inline-flex items-center gap-2 px-3.5 py-2.5 bg-card border border-border rounded-lg rounded-tl-sm">
            <Loader2 class="size-4 animate-spin text-muted-foreground" />
            <span class="text-[13px] text-muted-foreground">{{ loadingText }}</span>
          </div>

          <!-- 错误提示 -->
          <div v-else-if="msg.error && !msg.content" class="inline-flex items-center gap-2 px-3.5 py-2.5 bg-destructive/6 border border-destructive/20 rounded-lg rounded-tl-sm text-[13px] text-destructive max-w-full">
            <AlertCircle class="size-4 text-red-500 flex-shrink-0" />
            <span>{{ msg.error }}</span>
          </div>

          <!-- 回答正文 -->
          <div v-if="msg.content">
            <MarkdownRender
              mode="chat"
              :content="msg.content"
              :final="!msg.pending"
              :fade="false"
              smooth-streaming="auto"
              :render-code-blocks-as-pre="false"
              :is-dark="isDark" code-block-dark-theme="vitesse-dark" code-block-light-theme="vitesse-light" :themes="['vitesse-dark', 'vitesse-light']"
            />
          </div>

          <!-- 引用来源 -->
          <CitationRail
            v-if="msg.citations && msg.citations.length > 0"
            :citations="msg.citations"
            @citation-click="(cite) => $emit('citation-click', cite)"
          />

          <!-- 用量信息 -->
          <div v-if="msg.usage && !msg.pending" class="flex flex-wrap gap-2 mt-1.5 text-[11px] text-muted-foreground/60">
            <span v-if="msg.usage.promptTokens">输入 {{ msg.usage.promptTokens }}</span>
            <span v-if="msg.usage.completionTokens">输出 {{ msg.usage.completionTokens }}</span>
            <span v-if="msg.usage.totalTokens">合计 {{ msg.usage.totalTokens }}</span>
            <span v-if="msg.usage.latencyMs">耗时 {{ (msg.usage.latencyMs / 1000).toFixed(1) }}s</span>
            <span v-if="msg.usage.estimated" class="text-amber-500">估算</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { User, Bot, Loader2, AlertCircle } from '@lucide/vue';
import MarkdownRender from 'markstream-vue';
import { isDark } from '@/theme';
import CitationRail from './CitationRail.vue';

const props = defineProps({
  msg: {
    type: Object,
    required: true,
  },
});

defineEmits(['citation-click']);

const roleClass = computed(() => (props.msg.role === 'USER' ? 'user' : 'assistant'));

const loadingText = computed(() => {
  if (props.msg.toolMode === 'KB_SEARCH') {
    return '正在检索证据并生成回答...';
  }
  return '正在思考并生成回答...';
});

function evidenceLevelStyle(level) {
  const styles = {
    SUFFICIENT: { background: 'rgba(82,196,26,0.1)', color: '#52c41a' },
    PARTIAL: { background: 'rgba(250,173,20,0.1)', color: '#fa8c16' },
    WEAK: { background: 'rgba(245,34,45,0.1)', color: '#f5222d' },
    NONE: { background: 'rgba(245,34,45,0.1)', color: '#f5222d' },
  };
  return styles[level] || { background: 'rgba(0,0,0,0.04)', color: '#8c8c8c' };
}

function evidenceLevelText(level) {
  switch (level) {
    case 'SUFFICIENT':
      return '证据充分';
    case 'PARTIAL':
      return '证据部分';
    case 'WEAK':
      return '证据较弱';
    case 'NONE':
      return '无证据';
    default:
      return level;
  }
}
</script>
