<template>
  <div class="message-list" ref="listRef">
    <!-- 空状态 -->
    <div v-if="messages.length === 0" class="message-list__empty">
      <div class="message-list__hero">
        <div class="message-list__hero-icon">
          <RobotOutlined />
        </div>
        <h2 class="message-list__hero-title">智能助手</h2>
        <p class="message-list__hero-desc">
          多轮对话智能助手，支持 AI 文档对话与知识库检索问答两种模式。
        </p>
        <div class="message-list__starters">
          <button
            v-for="prompt in starterPrompts"
            :key="prompt"
            type="button"
            class="message-list__starter"
            @click="$emit('starter-pick', prompt)"
          >
            {{ prompt }}
          </button>
        </div>
      </div>
    </div>

    <!-- 消息列表 -->
    <template v-else>
      <div
        v-for="msg in messages"
        :key="msg.id"
      >
        <AssistantMessageItem
          :msg="msg"
          @citation-click="(cite) => $emit('citation-click', cite)"
        />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue';
import { RobotOutlined } from '@ant-design/icons-vue';
import AssistantMessageItem from './AssistantMessageItem.vue';

const props = defineProps({
  messages: {
    type: Array,
    default: () => [],
  },
});

defineEmits(['starter-pick', 'citation-click']);

const listRef = ref(null);

const starterPrompts = [
  '帮我总结一下最近的对话内容',
  '你能否帮我梳理一下当前知识库的主要信息？',
  '基于知识库回答：核心流程是什么？',
];

watch(
  () => props.messages.map((m) => m.content).join(''),
  () => {
    scrollToBottom();
  }
);

function scrollToBottom() {
  nextTick(() => {
    const el = listRef.value;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  });
}

defineExpose({ scrollToBottom });
</script>

<style lang="less" scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
  scroll-behavior: smooth;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: #d9d9d9;
    border-radius: 3px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: #bfbfbf;
  }

  &__empty {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__hero {
    text-align: center;
    max-width: 480px;
  }

  &__hero-icon {
    font-size: 48px;
    color: #52c41a;
    margin-bottom: 16px;
  }

  &__hero-title {
    font-size: 24px;
    font-weight: 600;
    color: #262626;
    margin: 0 0 8px 0;
  }

  &__hero-desc {
    font-size: 14px;
    color: #8c8c8c;
    line-height: 1.6;
    margin: 0 0 24px 0;
  }

  &__starters {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
  }

  &__starter {
    width: 100%;
    max-width: 360px;
    padding: 10px 16px;
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 8px;
    font-size: 13px;
    color: #595959;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;

    &:hover {
      border-color: #1677ff;
      color: #1677ff;
      background: #f0f5ff;
    }
  }
}
</style>
