<template>
  <div class="flex-1 overflow-y-auto px-6 py-4 scroll-smooth [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-sm [&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/40" ref="listRef">
    <!-- 空状态 -->
    <div v-if="messages.length === 0" class="h-full flex items-center justify-center">
      <div class="text-center max-w-[480px]">
        <div class="text-5xl text-green-500 mb-4 flex justify-center">
          <Bot class="size-12" />
        </div>
        <h2 class="text-2xl font-semibold text-foreground m-0 mb-2">智能助手</h2>
        <p class="text-sm text-muted-foreground leading-6 m-0 mb-6">
          多轮对话智能助手，支持 AI 文档对话与知识库检索问答两种模式。
        </p>
        <div class="flex flex-col gap-2 items-center">
          <button
            v-for="prompt in starterPrompts"
            :key="prompt"
            type="button"
            class="w-full max-w-[360px] px-4 py-2.5 bg-card border border-border rounded-lg text-[13px] text-muted-foreground cursor-pointer transition-all text-left hover:border-primary hover:text-primary hover:bg-primary/5"
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
import { Bot } from '@lucide/vue';
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
