<template>
  <div class="px-4 py-3.5 bg-card border-t border-border">
    <!-- 输入框区域 -->
    <div class="flex items-end gap-2.5 px-3 py-2 pl-3.5 bg-muted border border-border rounded-xl transition-colors focus-within:border-primary focus-within:bg-card">
      <textarea
        v-model="text"
        class="flex-1 border-none bg-transparent resize-none text-sm leading-6 py-1 outline-none max-h-[180px] overflow-y-auto text-foreground"
        :placeholder="t('ragComposer.placeholder')"
        :disabled="disabled"
        rows="1"
        @keydown="onKeydown"
        @input="autoResize"
        ref="textareaRef"
      />
      <div class="flex-shrink-0 pb-0.5">
        <button
          class="inline-flex items-center justify-center size-8 border-none rounded-full bg-primary text-primary-foreground cursor-pointer transition-all hover:not-disabled:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!canSend || disabled"
          @click="onSend"
        >
          <Send v-if="!disabled" class="size-4" />
          <Loader2 v-else class="size-4 animate-spin" />
        </button>
      </div>
    </div>
    <!-- 底部提示 -->
    <div class="mt-1.5 text-center">
      <span class="text-[11px] text-muted-foreground/60">
        {{ disabled ? t('ragComposer.generating') : t('ragComposer.ready') }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { Send, Loader2 } from '@lucide/vue';

const { t } = useI18n();

const props = defineProps({
  disabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['send']);

const text = ref('');
const textareaRef = ref(null);

const canSend = computed(() => {
  return !props.disabled && text.value.trim().length > 0;
});

function autoResize() {
  const el = textareaRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}

function onKeydown(e) {
  // Enter 发送，Shift+Enter 换行
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    onSend();
  }
}

function onSend() {
  if (!canSend.value) return;
  const content = text.value.trim();
  text.value = '';
  nextTick(() => autoResize());
  emit('send', content);
}

defineExpose({
  clear() {
    text.value = '';
    nextTick(() => autoResize());
  },
});
</script>
