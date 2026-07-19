<template>
  <div class="mode-switcher">
    <div class="mode-switcher__tabs">
      <button
        v-for="mode in modes"
        :key="mode.value"
        type="button"
        class="mode-switcher__tab"
        :class="{ 'mode-switcher__tab--active': modelValue === mode.value }"
        :disabled="disabled"
        @click="onSwitch(mode.value)"
      >
        <component :is="mode.icon" class="mode-switcher__icon" />
        <span>{{ mode.label }}</span>
      </button>
    </div>

    <!-- KB_SEARCH 模式：知识库文件夹选择 -->
    <div v-if="modelValue === 'KB_SEARCH'" class="mode-switcher__folder">
      <a-select
        :value="folderId"
        style="width: 100%"
        placeholder="选择知识库文件夹"
        :options="folderOptions"
        :disabled="disabled"
        size="small"
        @change="onFolderChange"
      />
    </div>

    <!-- 模式说明 -->
    <div class="mode-switcher__hint">
      <span v-if="modelValue === 'CHAT'">自由对话模式：基于对话记忆进行多轮交流，不检索知识库。</span>
      <span v-else-if="modelValue === 'KB_SEARCH' && folderId">
        知识库检索模式：在所选文件夹的知识库内检索证据并生成带引用的回答。
      </span>
      <span v-else-if="modelValue === 'KB_SEARCH' && !folderId" class="mode-switcher__warn">
        请选择一个知识库文件夹。
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { MessageOutlined, FileSearchOutlined } from '@ant-design/icons-vue';

const props = defineProps({
  modelValue: {
    type: String,
    default: 'CHAT',
    validator: (v) => v === 'CHAT' || v === 'KB_SEARCH',
  },
  folderId: {
    type: Number,
    default: null,
  },
  folderList: {
    type: Array,
    default: () => [],
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(['update:modelValue', 'update:folderId', 'switch']);

const modes = [
  { value: 'CHAT', label: 'AI 文档', icon: MessageOutlined },
  { value: 'KB_SEARCH', label: '文档问答', icon: FileSearchOutlined },
];

const folderOptions = computed(() => {
  return (props.folderList || []).map((f) => ({
    value: f.id,
    label: f.path,
  }));
});

function onSwitch(mode) {
  if (props.disabled || mode === props.modelValue) return;
  emit('update:modelValue', mode);
  emit('switch', mode);
}

function onFolderChange(value) {
  emit('update:folderId', value);
}
</script>

<style lang="less" scoped>
.mode-switcher {
  display: flex;
  flex-direction: column;
  gap: 8px;

  &__tabs {
    display: flex;
    gap: 6px;
    background: #f0f2f5;
    border-radius: 8px;
    padding: 3px;
  }

  &__tab {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 30px;
    padding: 0 10px;
    border: none;
    background: transparent;
    border-radius: 6px;
    font-size: 13px;
    color: #595959;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(:disabled) {
      color: #262626;
    }

    &--active {
      background: #fff;
      color: #1677ff;
      font-weight: 500;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &__icon {
    font-size: 14px;
  }

  &__folder {
    width: 100%;
  }

  &__hint {
    font-size: 12px;
    color: #8c8c8c;
    line-height: 1.5;
    min-height: 18px;
  }

  &__warn {
    color: #faad14;
  }
}
</style>
