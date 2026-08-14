<template>
  <div class="px-4 pb-3">
    <!-- 浮层：流式时的协作子 Agent + 任务进度 -->
    <Transition name="task-progress-slide">
      <div v-if="isStreaming && (delegations.length > 0 || hasTaskBlocksFlag)" class="mb-2 flex flex-col gap-2">
        <DelegationCard v-if="delegations.length > 0" :delegations="delegations" />
        <TaskProgressCard v-if="hasTaskBlocksFlag" :blocks="taskBlocks" :is-streaming="isStreaming" />
      </div>
    </Transition>

    <!-- 输入卡片 -->
    <div
      class="overflow-hidden rounded-2xl border bg-card shadow-lg transition-all"
      :class="[
        focused ? 'border-primary/40 shadow-primary/5' : 'border-border',
        confirmMode ? 'ring-2 ring-amber-400/30' : '',
      ]"
    >
      <!-- 富文本输入区 -->
      <RichTextInput
        v-model="modelValue"
        :placeholder="placeholder"
        :auto-focus-trigger="sessionId"
        :workspace-id="workspaceId"
        :workspace-slug="workspaceSlug"
        :session-id="sessionId"
        @submit="$emit('submit')"
        @focus="$emit('focus')"
        @blur="$emit('blur')"
      />

      <!-- 底部工具栏 -->
      <div class="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        <!-- 左侧 -->
        <div class="flex items-center gap-2">
          <PermissionModeSelector v-model="permissionMode" />
          <ThinkingDepthPopover v-model="thinkingLevel" />
        </div>

        <!-- 右侧 -->
        <div class="flex items-center gap-2">
          <Select v-model="selectedModel" :disabled="models.length === 0">
            <SelectTrigger class="min-w-[140px] max-w-[200px]">
              <SelectValue :placeholder="models.length === 0 ? '未启用模型' : '选择模型'" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="m in models" :key="m.id" :value="m.id">{{ m.name }}</SelectItem>
            </SelectContent>
          </Select>

          <!-- 停止按钮 -->
          <button
            v-if="isStreaming"
            class="flex size-8 items-center justify-center rounded-lg bg-destructive text-destructive-foreground transition-all hover:bg-destructive/90"
            @click="$emit('stop')"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" class="size-3.5">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>

          <!-- 发送按钮 -->
          <button
            v-else
            class="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-40"
            :disabled="!modelValue.trim()"
            @click="$emit('submit')"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4">
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import RichTextInput from '@/components/agent/RichTextInput.vue'
import PermissionModeSelector from '@/components/agent/PermissionModeSelector.vue'
import ThinkingDepthPopover from '@/components/agent/ThinkingDepthPopover.vue'
import DelegationCard from '@/components/agent/DelegationCard.vue'
import TaskProgressCard from '@/components/agent/TaskProgressCard.vue'
import { hasTaskBlocks } from '@/utils/task-progress'

const props = defineProps({
  /** v-model 绑定值 */
  modelValue: { type: String, default: '' },
  /** 是否正在流式 */
  isStreaming: { type: Boolean, default: false },
  /** 是否聚焦 */
  focused: { type: Boolean, default: false },
  /** 占位文字 */
  placeholder: { type: String, default: '' },
  /** 当前会话 ID */
  sessionId: { type: String, default: null },
  /** 工作区 ID */
  workspaceId: { type: String, default: null },
  /** 工作区 slug */
  workspaceSlug: { type: String, default: 'default' },
  /** 可用模型列表 */
  models: { type: Array, default: () => [] },
  /** 选中的模型 */
  selectedModel: { type: String, default: null },
  /** 权限模式 */
  permissionMode: { type: String, default: 'ask' },
  /** 思考深度 */
  thinkingLevel: { type: String, default: 'high' },
  /** 协作子 Agent 列表 */
  delegations: { type: Array, default: () => [] },
  /** 任务进度块 */
  taskBlocks: { type: Array, default: () => [] },
  /** 是否处于确认模式 */
  confirmMode: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:modelValue', 'update:selectedModel', 'update:permissionMode', 'update:thinkingLevel',
  'submit', 'stop', 'focus', 'blur',
])

// v-model 代理
const modelValue = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})
const selectedModel = computed({
  get: () => props.selectedModel,
  set: (v) => emit('update:selectedModel', v),
})
const permissionMode = computed({
  get: () => props.permissionMode,
  set: (v) => emit('update:permissionMode', v),
})
const thinkingLevel = computed({
  get: () => props.thinkingLevel,
  set: (v) => emit('update:thinkingLevel', v),
})

const hasTaskBlocksFlag = computed(() => hasTaskBlocks(props.taskBlocks))
</script>

<style scoped>
.task-progress-slide-enter-active { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.task-progress-slide-leave-active { transition: all 0.2s ease; }
.task-progress-slide-enter-from, .task-progress-slide-leave-to { opacity: 0; transform: translateY(8px); }
</style>
