<template>
  <div class="flex flex-col gap-2">
    <!-- 模式切换 Tab -->
    <div class="flex gap-1.5 bg-muted rounded-lg p-0.5">
      <button
        v-for="mode in modes"
        :key="mode.value"
        type="button"
        class="flex-1 inline-flex items-center justify-center gap-1.5 h-7.5 px-2.5 border-none bg-transparent rounded-md text-[13px] text-muted-foreground cursor-pointer transition-all hover:not-disabled:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
        :class="modelValue === mode.value ? 'bg-card text-primary font-medium shadow-sm' : ''"
        :disabled="disabled"
        @click="onSwitch(mode.value)"
      >
        <component :is="mode.icon" class="size-3.5" />
        <span>{{ mode.label }}</span>
      </button>
    </div>

    <!-- KB_SEARCH 模式：知识库文件夹选择 -->
    <div v-if="modelValue === 'KB_SEARCH'" class="w-full">
      <Select
        :model-value="folderId"
        @update:model-value="onFolderChange"
        :disabled="disabled"
      >
        <SelectTrigger class="w-full h-8"><SelectValue :placeholder="t('modeSwitcher.selectFolder')" /></SelectTrigger>
        <SelectContent>
          <SelectItem v-for="f in folderList" :key="f.id" :value="f.id">{{ f.path }}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- 模式说明 -->
    <div class="text-xs text-muted-foreground leading-relaxed min-h-[18px]">
      <span v-if="modelValue === 'CHAT'">{{ t('modeSwitcher.chatDesc') }}</span>
      <span v-else-if="modelValue === 'KB_SEARCH' && folderId">
        {{ t('modeSwitcher.kbSearchDesc') }}
      </span>
      <span v-else-if="modelValue === 'KB_SEARCH' && !folderId" class="text-amber-500">
        {{ t('modeSwitcher.kbSearchWarn') }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MessageSquare, FileSearch } from '@lucide/vue';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

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

const { t } = useI18n();

const emit = defineEmits(['update:modelValue', 'update:folderId', 'switch']);

const modes = computed(() => [
  { value: 'CHAT', label: t('modeSwitcher.chat'), icon: MessageSquare },
  { value: 'KB_SEARCH', label: t('modeSwitcher.kbSearch'), icon: FileSearch },
]);

function onSwitch(mode) {
  if (props.disabled || mode === props.modelValue) return;
  emit('update:modelValue', mode);
  emit('switch', mode);
}

function onFolderChange(value) {
  emit('update:folderId', value);
}
</script>
