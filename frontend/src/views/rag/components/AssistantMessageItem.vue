<template>
  <div class="message" :class="`message--${roleClass}`">
    <div class="message__avatar">
      <a-avatar :style="{ background: msg.role === 'USER' ? '#1677ff' : '#52c41a' }">
        <template #icon>
          <UserOutlined v-if="msg.role === 'USER'" />
          <RobotOutlined v-else />
        </template>
      </a-avatar>
    </div>
    <div class="message__body">
      <div class="message__role">
        {{ msg.role === 'USER' ? '我' : '助手' }}
        <a-tag
          v-if="msg.role === 'ASSISTANT' && msg.toolMode"
          :color="msg.toolMode === 'KB_SEARCH' ? 'purple' : 'blue'"
          class="message__mode-tag"
        >
          {{ msg.toolMode === 'KB_SEARCH' ? '文档问答' : 'AI 文档' }}
        </a-tag>
        <a-tag
          v-if="msg.role === 'ASSISTANT' && msg.evidenceLevel"
          :color="evidenceLevelColor(msg.evidenceLevel)"
          class="message__evidence-tag"
        >
          {{ evidenceLevelText(msg.evidenceLevel) }}
        </a-tag>
      </div>

      <div class="message__content">
        <!-- 用户消息 -->
        <template v-if="msg.role === 'USER'">
          <div class="message__text">{{ msg.content }}</div>
        </template>

        <!-- 助手消息 -->
        <template v-else>
          <!-- 加载中 -->
          <div v-if="msg.pending && !msg.content" class="message__loading">
            <a-spin size="small" />
            <span class="message__loading-text">{{ loadingText }}</span>
          </div>

          <!-- 错误提示 -->
          <a-alert
            v-else-if="msg.error && !msg.content"
            :message="msg.error"
            type="error"
            show-icon
            class="message__alert"
          />

          <!-- 回答正文（markstream-vue 流式 Markdown 渲染） -->
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
          <div v-if="msg.usage && !msg.pending" class="message__usage">
            <span v-if="msg.usage.promptTokens">输入 {{ msg.usage.promptTokens }}</span>
            <span v-if="msg.usage.completionTokens">输出 {{ msg.usage.completionTokens }}</span>
            <span v-if="msg.usage.totalTokens">合计 {{ msg.usage.totalTokens }}</span>
            <span v-if="msg.usage.latencyMs">耗时 {{ (msg.usage.latencyMs / 1000).toFixed(1) }}s</span>
            <span v-if="msg.usage.estimated" class="message__estimated">估算</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { UserOutlined, RobotOutlined } from '@ant-design/icons-vue';
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

function evidenceLevelColor(level) {
  switch (level) {
    case 'SUFFICIENT':
      return 'green';
    case 'PARTIAL':
      return 'orange';
    case 'WEAK':
    case 'NONE':
      return 'red';
    default:
      return 'default';
  }
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

<style lang="less" scoped>
.message {
  display: flex;
  gap: 12px;
  padding: 16px 0;

  &--user {
    flex-direction: row-reverse;
  }

  &__avatar {
    flex-shrink: 0;
  }

  &__body {
    max-width: 78%;
    display: flex;
    flex-direction: column;

    .message--user & {
      align-items: flex-end;
    }
  }

  &__role {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #8c8c8c;
    margin-bottom: 6px;

    .message--user & {
      flex-direction: row-reverse;
    }
  }

  &__mode-tag,
  &__evidence-tag {
    margin: 0;
    font-size: 11px;
    line-height: 16px;
    padding: 0 6px;
  }

  &__content {
    display: flex;
    flex-direction: column;
  }

  &__text {
    padding: 10px 14px;
    border-radius: 10px;
    font-size: 14px;
    line-height: 1.7;
    word-break: break-word;
    white-space: pre-wrap;

    .message--user & {
      background: #1677ff;
      color: #fff;
      border-top-right-radius: 2px;
    }

    .message--assistant & {
      background: #fff;
      border: 1px solid #e8e8e8;
      border-top-left-radius: 2px;
    }
  }

  &__text--answer {
    max-width: 100%;
    // markstream-vue 渲染结构化 HTML，需要 normal 排版（覆盖父级 pre-wrap）
    white-space: normal;
    // 覆盖 #app 的 text-align: center，避免 Markdown 内容居中
    text-align: left;
  }

  &__loading {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 10px;
    border-top-left-radius: 2px;
  }

  &__loading-text {
    font-size: 13px;
    color: #8c8c8c;
  }

  &__alert {
    max-width: 100%;
    border-top-left-radius: 2px;
  }

  &__usage {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 6px;
    font-size: 11px;
    color: #bfbfbf;
  }

  &__estimated {
    color: #faad14;
  }
}

</style>
