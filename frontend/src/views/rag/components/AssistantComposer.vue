<template>
  <div class="composer">
    <div class="composer__inner">
      <a-textarea
        v-model:value="text"
        class="composer__textarea"
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        :auto-size="{ minRows: 1, maxRows: 6 }"
        :disabled="disabled"
        @keydown="onKeydown"
      />
      <div class="composer__actions">
        <a-button
          type="primary"
          shape="circle"
          :disabled="!canSend"
          :loading="disabled"
          @click="onSend"
        >
          <template #icon><SendOutlined /></template>
        </a-button>
      </div>
    </div>
    <div class="composer__footer">
      <span class="composer__hint">
        {{ disabled ? '正在生成回答...' : '就绪' }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { SendOutlined } from '@ant-design/icons-vue';

const props = defineProps({
  disabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['send']);

const text = ref('');

const canSend = computed(() => {
  return !props.disabled && text.value.trim().length > 0;
});

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
  emit('send', content);
}

defineExpose({
  clear() {
    text.value = '';
  },
});
</script>

<style lang="less" scoped>
.composer {
  padding: 12px 16px 14px;
  background: #fff;
  border-top: 1px solid #e8e8e8;

  &__inner {
    display: flex;
    align-items: flex-end;
    gap: 10px;
    padding: 8px 12px 8px 14px;
    background: #f5f6f8;
    border: 1px solid #e8e8e8;
    border-radius: 12px;
    transition: border-color 0.2s;

    &:focus-within {
      border-color: #1677ff;
      background: #fff;
    }
  }

  &__textarea {
    flex: 1;
    border: none !important;
    background: transparent !important;
    box-shadow: none !important;
    resize: none;
    font-size: 14px;
    line-height: 1.6;
    padding: 4px 0;

    :deep(textarea) {
      border: none !important;
      background: transparent !important;
      box-shadow: none !important;
    }
  }

  &__actions {
    flex-shrink: 0;
    padding-bottom: 2px;
  }

  &__footer {
    margin-top: 6px;
    text-align: center;
  }

  &__hint {
    font-size: 11px;
    color: #bfbfbf;
  }
}
</style>
