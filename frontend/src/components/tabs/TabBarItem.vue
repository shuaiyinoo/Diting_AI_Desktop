<template>
  <div
    class="flex items-center gap-1.5 h-full px-2.5 pl-3 rounded-t-md cursor-pointer text-[13px] text-muted-foreground transition-colors duration-150 whitespace-nowrap flex-shrink-0 relative select-none [-webkit-app-region:no-drag] hover:bg-muted hover:text-foreground"
    :class="{
      'bg-card text-primary font-semibold': isActive,
      'px-3 min-w-[72px] justify-center': isScratch,
    }"
    @click="$emit('activate', tab.id)"
    @mousedown.middle.prevent="$emit('close', tab.id)"
  >
    <!-- 草稿 Tab：固定图标，无关闭按钮 -->
    <template v-if="isScratch">
      <Pencil class="size-3.5 text-muted-foreground" />
      <span class="overflow-hidden text-ellipsis max-w-[160px]">{{ t('tabContent.scratch') }}</span>
    </template>

    <!-- 会话 Tab -->
    <template v-else>
      <!-- 流式指示器（旋转圆点） -->
      <span v-if="isStreaming" class="size-1.5 rounded-full bg-primary flex-shrink-0 animate-tab-pulse" />

      <!-- 类型图标 -->
      <MessageSquare v-if="tab.type === 'chat'" class="size-3.5 flex-shrink-0 text-muted-foreground" :class="isActive ? 'text-primary' : ''" />
      <Bot v-else-if="tab.type === 'agent'" class="size-3.5 flex-shrink-0 text-muted-foreground" :class="isActive ? 'text-primary' : ''" />
      <File v-else-if="tab.type === 'file'" class="size-3.5 flex-shrink-0 text-muted-foreground" :class="isActive ? 'text-primary' : ''" />

      <!-- 标题 -->
      <span class="overflow-hidden text-ellipsis max-w-[160px] transition-colors duration-150" :title="tab.title" :class="isStreaming ? 'text-primary' : ''">{{ tab.title }}</span>

      <!-- 关闭按钮 -->
      <button
        class="flex items-center justify-center size-[18px] border-none rounded bg-transparent text-muted-foreground cursor-pointer flex-shrink-0 opacity-0 transition-all duration-150 text-[10px] hover:bg-muted hover:text-foreground"
        :class="isActive ? 'opacity-60' : ''"
        :class-group-hover="'group-hover:opacity-100'"
        :title="t('tabContent.closeTab')"
        @click.stop="$emit('close', tab.id)"
      >
        <X class="size-3" />
      </button>
    </template>

    <!-- 激活状态底部高亮线 -->
    <span v-if="isActive" class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-sm" />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Pencil, MessageSquare, Bot, File, X } from '@lucide/vue'

const { t } = useI18n()

const props = defineProps({
  tab: { type: Object, required: true },
  isActive: { type: Boolean, default: false },
  isStreaming: { type: Boolean, default: false },
})

defineEmits(['activate', 'close'])

const isScratch = computed(() => props.tab.type === 'scratch')
</script>

<style scoped>
@keyframes tab-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}
.animate-tab-pulse {
  animation: tab-pulse 1s ease-in-out infinite;
}
</style>
