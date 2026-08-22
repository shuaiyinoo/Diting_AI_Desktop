<template>
  <div class="flex flex-col h-full w-full bg-card overflow-hidden">
    <!-- 顶部：Tab 切换 + 新增按钮 -->
    <div class="flex shrink-0 items-center justify-between px-6 pt-3">
      <div class="flex gap-0.5 rounded-lg bg-muted p-0.5">
        <button
          v-for="item in tabs"
          :key="item.id"
          class="inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-all"
          :class="tab === item.id
            ? 'bg-primary font-semibold text-primary-foreground shadow-[0_1px_4px_rgba(22,119,255,0.25)] hover:bg-primary/90'
            : 'bg-transparent text-muted-foreground hover:bg-white/40 hover:text-foreground'"
          @click="tab = item.id"
        >
          <component :is="item.icon" class="size-4" />
          <span>{{ item.label }}</span>
        </button>
      </div>

      <div class="flex gap-2">
        <button
          v-if="tab === 'todos'"
          class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-primary text-primary-foreground font-medium text-[13px] shadow-[0_2px_6px_hsl(var(--primary)/0.25)] transition-all hover:bg-primary/80"
          @click="requestTodoCreate"
        >
          <Plus class="size-4" /> {{ t('planning.newTodo') }}
        </button>
        <button
          v-if="tab === 'calendar'"
          class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-primary text-primary-foreground font-medium text-[13px] shadow-[0_2px_6px_hsl(var(--primary)/0.25)] transition-all hover:bg-primary/80"
          @click="requestCalendarCreate"
        >
          <Plus class="size-4" /> {{ t('planning.newSchedule') }}
        </button>
        <button
          v-if="tab === 'automations' && automations.length > 0"
          class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-primary text-primary-foreground font-medium text-[13px] shadow-[0_2px_6px_hsl(var(--primary)/0.25)] transition-all hover:bg-primary/80"
          @click="createAutomation"
        >
          <Plus class="size-4" /> {{ t('planning.newAutomation') }}
        </button>
      </div>
    </div>

    <!-- 内容区 -->
    <main class="flex-1 min-h-0 px-6 pt-3 pb-4 flex box-border overflow-hidden" :class="tab === 'automations' ? 'overflow-y-auto' : ''">
      <TodoWorkspace v-if="tab === 'todos'" />
      <CalendarWorkspace v-else-if="tab === 'calendar'" />
      <AutomationsView v-else />
    </main>

    <!-- 新建 Todo 对话框 -->
    <Dialog v-model:open="createTodoOpen">
      <DialogContent class="max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{{ t('planning.addTodo') }}</DialogTitle>
        </DialogHeader>
        <form @submit.prevent="confirmCreateTodo" class="flex flex-col gap-3">
          <Textarea
            v-model="quickTitle"
            :placeholder="t('planning.todoPlaceholder')"
            :rows="2"
            @keydown.enter="onTodoEnterKey"
          />
          <div class="flex flex-wrap gap-2 items-center">
            <DateTimePicker
              :model-value="quickDueAtInput"
              @update:model-value="quickDueAtInput = $event"
              :placeholder="t('planning.plannedDate')"
              class="w-[200px]"
            />
            <Select v-model="quickPriority">
              <SelectTrigger class="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="high">{{ t('planning.priorityHigh') }}</SelectItem>
                <SelectItem value="medium">{{ t('planning.priorityMedium') }}</SelectItem>
                <SelectItem value="low">{{ t('planning.priorityLow') }}</SelectItem>
              </SelectContent>
            </Select>
            <Select v-model="quickGroupId">
              <SelectTrigger class="min-w-[140px] flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{{ t('planning.noGroup') }}</SelectItem>
                <SelectItem v-for="g in todoGroups" :key="g.id" :value="g.id">{{ g.name }}</SelectItem>
              </SelectContent>
            </Select>
            <button
              type="submit"
              class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-primary text-primary-foreground font-medium text-[13px] shadow-[0_2px_6px_hsl(var(--primary)/0.25)] transition-all hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
              :disabled="!quickTitle.trim() || isCreatingTodo"
            >
              {{ isCreatingTodo ? t('planning.adding') : t('planning.add') }}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { Plus, ListTodo, CalendarRange, Timer } from '@lucide/vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { usePlanningStore } from '@/stores/planning'
import { useWorkspaceStore } from '@/stores/workspace'
import TodoWorkspace from './components/TodoWorkspace.vue'
import CalendarWorkspace from './components/CalendarWorkspace.vue'
import AutomationsView from './components/AutomationsView.vue'
import dayjs from 'dayjs'

const { t } = useI18n()
const planning = usePlanningStore()
const ws = useWorkspaceStore()

const tabs = computed(() => [
  { id: 'todos', label: t('planning.tabTodo'), icon: ListTodo },
  { id: 'calendar', label: t('planning.tabCalendar'), icon: CalendarRange },
  { id: 'automations', label: t('planning.tabAutomation'), icon: Timer },
])

const tab = computed({
  get: () => planning.tab,
  set: (v) => { planning.tab = v },
})

const automations = computed(() => planning.automations)
const todoGroups = computed(() => planning.todoGroups)

// ===== 新建 Todo =====
const createTodoOpen = ref(false)
const quickTitle = ref('')
const quickPriority = ref('medium')
const quickGroupId = ref('__none__')
const quickDueAt = ref(null)
const isCreatingTodo = ref(false)

// 桥接 dayjs 对象和 DateTimePicker 的 YYYY-MM-DDTHH:mm 格式
const quickDueAtInput = computed({
  get: () => quickDueAt.value ? quickDueAt.value.format('YYYY-MM-DDTHH:mm') : '',
  set: (v) => { quickDueAt.value = v ? dayjs(v) : null },
})

const todoCreateRequest = computed(() => planning.todoCreateRequest)

watch(todoCreateRequest, (n, o) => {
  if (n !== o) openCreateTodoDialog()
})

function requestTodoCreate() {
  planning.todoCreateRequest++
}

function openCreateTodoDialog() {
  quickTitle.value = ''
  quickPriority.value = 'medium'
  quickGroupId.value = '__none__'
  quickDueAt.value = dayjs().endOf('day')
  createTodoOpen.value = true
}

function requestCalendarCreate() {
  planning.calendarCreateRequest++
}

async function confirmCreateTodo() {
  const title = quickTitle.value.trim()
  if (!title || isCreatingTodo.value) return
  isCreatingTodo.value = true
  try {
    const todo = await planning.createTodo({
      title,
      priority: quickPriority.value,
      groupId: quickGroupId.value === '__none__' ? undefined : quickGroupId.value,
      dueAt: quickDueAt.value ? quickDueAt.value.valueOf() : undefined,
    })
    createTodoOpen.value = false
    quickTitle.value = ''
  } catch {
    toast.error(t('planning.createTodoFailed'))
  } finally {
    isCreatingTodo.value = false
  }
}

function onTodoEnterKey(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    confirmCreateTodo()
  }
}

function createAutomation() {
  const draft = planning.createEmptyDraft()
  // 自动填充默认序号名
  let maxN = 0
  for (const a of automations.value) {
    const m = /^定时任务\s*(\d+)$/.exec(a.name.trim())
    if (m) maxN = Math.max(maxN, Number(m[1]))
  }
  draft.name = `${t('planning.defaultAutomationName')} ${maxN + 1}`
  planning.automationDraft = draft
  planning.automationFormOpen = true
}
</script>
