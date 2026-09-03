<template>
  <Transition name="ask-user-slide">
    <div
      v-if="request"
      class="absolute left-1/2 bottom-[88px] z-[100] flex max-w-[80%] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border-2 border-primary/30 bg-card shadow-2xl"
      :style="{ width: '60%' }"
    >
      <!-- 顶部标题区 -->
      <div class="flex items-center gap-2 bg-gradient-to-r from-primary/90 to-primary/70 px-4 py-3 text-white">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-4 shrink-0">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <path d="M12 17h.01" />
        </svg>
        <span class="flex-1 text-sm font-medium">{{ t('agentPopup.askUserTitle') }}</span>
        <button
          class="flex size-[22px] items-center justify-center rounded-md bg-white/20 text-white transition-all hover:bg-white/35"
          @click="$emit('dismiss')"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="size-3.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <!-- 问答区 -->
      <div class="flex-1 min-h-0 max-h-[40vh] overflow-y-auto px-4 py-3">
        <div v-for="(q, qIdx) in request.questions" :key="qIdx" class="mb-3 last:mb-0">
          <!-- 问题文本 -->
          <div class="mb-1.5 text-sm font-medium text-foreground">{{ q.question }}</div>

          <!-- 选项列表 -->
          <div v-if="q.options && q.options.length > 0" class="flex flex-col gap-1.5">
            <button
              v-for="(opt, oIdx) in q.options"
              :key="oIdx"
              class="flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-all"
              :class="isSelected(qIdx, oIdx)
                ? 'border-primary bg-primary/10'
                : 'border-border bg-background hover:border-muted-foreground/50 hover:bg-muted/30'"
              @click="$emit('toggle', qIdx, oIdx, q.multiSelect)"
            >
              <!-- 单选：圆点 radio 样式 -->
              <span
                v-if="!q.multiSelect"
                class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2 transition-all"
                :class="isSelected(qIdx, oIdx) ? 'border-primary bg-primary' : 'border-muted-foreground/40'"
              >
                <span v-if="isSelected(qIdx, oIdx)" class="size-1.5 rounded-full bg-primary-foreground" />
              </span>
              <!-- 多选：方框 checkbox 样式 -->
              <span
                v-else
                class="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[5px] border-2 transition-all"
                :class="isSelected(qIdx, oIdx) ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'"
              >
                <svg v-if="isSelected(qIdx, oIdx)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="size-3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <span class="flex-1 min-w-0">
                <span class="block text-[13px] font-medium text-foreground">{{ opt.label }}</span>
                <span v-if="opt.description" class="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{{ opt.description }}</span>
              </span>
            </button>
          </div>

          <!-- 自由输入框（当 allowInput 为 true 时显示） -->
          <div v-if="q.allowInput" class="mt-1.5">
            <Input
              v-model="textInputMap[qIdx]"
              :placeholder="t('agentPopup.inputPlaceholder')"
              class="h-9 text-[13px]"
              :disabled="responding"
            />
          </div>
        </div>
      </div>

      <!-- 底部操作区 -->
      <div class="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3">
        <Button
          variant="outline"
          size="sm"
          class="h-8"
          :disabled="responding"
          @click="$emit('dismiss')"
        >
          {{ t('agentPopup.cancel') }}
        </Button>
        <Button
          size="sm"
          class="h-8 gap-1.5"
          :disabled="!canSubmit || responding"
          @click="onSubmit"
        >
          <svg v-if="responding" class="size-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          {{ t('agentPopup.submitAnswer') }}
        </Button>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const { t } = useI18n()

const props = defineProps({
  /** AskUser 请求对象 */
  request: { type: Object, default: null },
  /** 选中状态 Map: qIdx → Set<optionIdx> */
  answers: { type: Map, required: true },
  /** 是否正在提交 */
  responding: { type: Boolean, default: false },
})

const emit = defineEmits(['toggle', 'submit', 'dismiss'])

/** 每个问题的自由输入文本：qIdx → string */
const textInputMap = reactive({})

// 请求变化时清空输入
watch(() => props.request, (val) => {
  if (val) {
    // 清空所有输入
    for (const key of Object.keys(textInputMap)) {
      delete textInputMap[key]
    }
  }
})

/** 检查选项是否被选中 */
function isSelected(qIdx, oIdx) {
  const selected = props.answers.get(qIdx)
  return selected?.has(oIdx) ?? false
}

/** 是否可以提交：至少有一个选择或输入 */
const canSubmit = computed(() => {
  if (!props.request) return false
  return props.request.questions.some((q, qIdx) => {
    // 有选项被选中
    const hasSelection = (props.answers.get(qIdx)?.size ?? 0) > 0
    // 有自由输入文本
    const hasText = q.allowInput && textInputMap[qIdx]?.trim()
    return hasSelection || hasText
  })
})

/** 提交时收集自由输入文本 */
function onSubmit() {
  // 将自由输入文本通过 emit 传递
  const textInputs = {}
  for (const key of Object.keys(textInputMap)) {
    const text = textInputMap[key]?.trim()
    if (text) {
      textInputs[key] = text
    }
  }
  emit('submit', textInputs)
}
</script>

<style scoped>
.ask-user-slide-enter-active { transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
.ask-user-slide-leave-active { transition: all 0.25s cubic-bezier(0.4, 0, 1, 1); }
.ask-user-slide-enter-from { opacity: 0; transform: translate(-50%, 100%); }
.ask-user-slide-leave-to { opacity: 0; transform: translate(-50%, 100%); }
</style>
