<template>
  <div class="flex flex-col h-full w-full bg-card overflow-hidden">
    <!-- 页头 -->
    <header class="flex justify-between items-center px-6 pt-5 pb-3 flex-shrink-0">
      <div>
        <h1 class="text-xl font-semibold m-0 text-foreground tracking-tight">任务/日程</h1>
        <p class="mt-1 m-0 text-[13px] text-muted-foreground">安排待办、日程与定时任务</p>
      </div>
      <div class="flex gap-2">
        <button
          v-if="tab === 'todos'"
          class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-primary text-primary-foreground font-medium text-[13px] shadow-[0_2px_6px_hsl(var(--primary)/0.25)] transition-all hover:bg-primary/80"
          @click="requestTodoCreate"
        >
          <Plus class="size-4" /> 新建 Todo
        </button>
        <button
          v-if="tab === 'calendar'"
          class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-primary text-primary-foreground font-medium text-[13px] shadow-[0_2px_6px_hsl(var(--primary)/0.25)] transition-all hover:bg-primary/80"
          @click="requestCalendarCreate"
        >
          <Plus class="size-4" /> 新建日程
        </button>
        <button
          v-if="tab === 'automations' && automations.length > 0"
          class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-primary text-primary-foreground font-medium text-[13px] shadow-[0_2px_6px_hsl(var(--primary)/0.25)] transition-all hover:bg-primary/80"
          @click="createAutomation"
        >
          <Plus class="size-4" /> 新建定时任务
        </button>
      </div>
    </header>

    <!-- Tab 切换 -->
    <div class="px-6 pb-3 flex-shrink-0">
      <button
        v-for="item in tabs"
        :key="item.id"
        class="inline-flex items-center px-4 h-8 border-none rounded-lg cursor-pointer text-[13px] text-muted-foreground transition-all hover:text-foreground"
        :class="tab === item.id ? 'bg-card text-primary font-semibold shadow-[0_1px_4px_hsl(0_0%_0%/0.06)]' : 'bg-transparent'"
        @click="tab = item.id"
      >{{ item.label }}</button>
    </div>

    <!-- 内容区 -->
    <main class="flex-1 min-h-0 px-6 pb-4 flex box-border overflow-hidden" :class="tab === 'automations' ? 'overflow-y-auto' : ''">
      <TodoWorkspace v-if="tab === 'todos'" />
      <CalendarWorkspace v-else-if="tab === 'calendar'" />
      <AutomationsView v-else />
    </main>

    <!-- 新建 Todo 对话框 -->
    <Dialog v-model:open="createTodoOpen">
      <DialogContent class="max-w-[600px]">
        <DialogHeader>
          <DialogTitle>添加 Todo</DialogTitle>
        </DialogHeader>
        <form @submit.prevent="confirmCreateTodo" class="flex flex-col gap-3">
          <Textarea
            v-model="quickTitle"
            placeholder="输入任务内容，Enter 创建"
            :rows="2"
            @keydown.enter="onTodoEnterKey"
          />
          <div class="flex flex-wrap gap-2 items-center">
            <Input
              v-model="quickDueAtInput"
              type="date"
              placeholder="计划完成时间"
              class="w-[200px]"
            />
            <Select v-model="quickPriority">
              <SelectTrigger class="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="high">高优先级</SelectItem>
                <SelectItem value="medium">中优先级</SelectItem>
                <SelectItem value="low">低优先级</SelectItem>
              </SelectContent>
            </Select>
            <Select v-model="quickGroupId">
              <SelectTrigger class="min-w-[140px] flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">不分组</SelectItem>
                <SelectItem v-for="g in todoGroups" :key="g.id" :value="g.id">{{ g.name }}</SelectItem>
              </SelectContent>
            </Select>
            <button
              type="submit"
              class="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-primary text-primary-foreground font-medium text-[13px] shadow-[0_2px_6px_hsl(var(--primary)/0.25)] transition-all hover:bg-primary/80 disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
              :disabled="!quickTitle.trim() || isCreatingTodo"
            >
              {{ isCreatingTodo ? '添加中…' : '添加' }}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { toast } from 'vue-sonner'
import { Plus } from '@lucide/vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { usePlanningStore } from '@/stores/planning'
import { useWorkspaceStore } from '@/stores/workspace'
import TodoWorkspace from './components/TodoWorkspace.vue'
import CalendarWorkspace from './components/CalendarWorkspace.vue'
import AutomationsView from './components/AutomationsView.vue'
import dayjs from 'dayjs'

const planning = usePlanningStore()
const ws = useWorkspaceStore()

const tabs = [
  { id: 'todos', label: 'Todo' },
  { id: 'calendar', label: '日程' },
  { id: 'automations', label: '定时任务' },
]

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

// 桥接 dayjs 对象和 HTML date input
const quickDueAtInput = computed({
  get: () => quickDueAt.value ? quickDueAt.value.format('YYYY-MM-DD') : '',
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
    toast.error('创建 Todo 失败')
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
  draft.name = `定时任务 ${maxN + 1}`
  planning.automationDraft = draft
  planning.automationFormOpen = true
}
</script>
