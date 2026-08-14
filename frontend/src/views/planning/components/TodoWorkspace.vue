<template>
  <div class="relative flex min-h-0 flex-1 flex-row overflow-hidden rounded-[10px] border border-border bg-card">
    <!-- 左栏：导航 -->
    <aside class="flex w-[200px] shrink-0 flex-col overflow-y-auto border-r border-border/50 bg-primary/[0.02] p-3">
      <div class="px-2 pb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Todo</div>
      <nav class="flex flex-col gap-0.5">
        <button
          v-for="item in navItems"
          :key="item.id"
          class="flex h-[34px] w-full items-center gap-2 rounded-md border-none px-2 text-left text-[13px] text-muted-foreground transition-all hover:bg-primary/5 hover:text-foreground"
          :class="view === item.id ? 'bg-card font-semibold text-primary shadow-sm' : 'bg-transparent'"
          @click="setView(item.id)"
        >
          <component :is="item.icon" class="size-[15px] shrink-0" />
          <span class="flex-1 truncate">{{ item.label }}</span>
          <span v-if="item.count !== undefined" class="shrink-0 text-[11px] text-muted-foreground">{{ item.count }}</span>
        </button>
      </nav>

      <div class="mt-6">
        <div class="flex items-center justify-between px-2 pb-2">
          <span class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Todo 分组</span>
          <Button variant="ghost" size="sm" class="h-auto px-2 py-0.5 text-[11px] text-muted-foreground hover:text-primary" @click="groupManagerOpen = true">管理</Button>
        </div>
        <div class="flex flex-col gap-0.5">
          <button
            v-for="g in todoGroups"
            :key="g.id"
            class="flex h-[34px] w-full items-center gap-2 rounded-md border-none px-2 text-left text-[13px] text-muted-foreground transition-all hover:bg-primary/5 hover:text-foreground"
            :class="view === `group:${g.id}` ? 'bg-card font-semibold text-primary shadow-sm' : 'bg-transparent'"
            @click="setView(`group:${g.id}`)"
          >
            <span class="size-2 shrink-0 rounded-full" :style="{ background: g.color || 'currentColor' }"></span>
            <span class="flex-1 truncate">{{ g.name }}</span>
            <span class="shrink-0 text-[11px] text-muted-foreground">{{ getGroupCount(g.id) }}</span>
          </button>
        </div>
      </div>
    </aside>

    <!-- 中栏：列表 -->
    <div class="flex min-w-0 flex-1 flex-col border-r border-border/50">
      <div class="flex shrink-0 items-center justify-between border-b border-border/50 px-5 py-4">
        <h2 class="m-0 text-[15px] font-semibold text-foreground">{{ viewTitle }}</h2>
        <span v-if="view !== 'completed'" class="text-xs text-muted-foreground">{{ visibleTodos.length }} 项</span>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <div
          v-for="todo in visibleTodos"
          :key="todo.id"
          class="flex cursor-pointer items-start gap-3 border-b border-border/50 px-5 py-2.5 transition-colors hover:bg-primary/[0.03]"
          :class="selectedId === todo.id ? 'bg-primary/[0.06]' : ''"
          @click="selectedId = todo.id"
        >
          <button
            class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border-2 text-[10px] transition-all"
            :class="todo.status === 'completed' ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-transparent text-transparent hover:border-primary hover:bg-primary hover:text-primary-foreground'"
            @click.stop="toggleTodo(todo)"
          >
            <Check v-if="todo.status === 'completed'" class="size-2.5" />
          </button>
          <div class="min-w-0 flex-1">
            <span class="block truncate text-[13px] font-medium" :class="todo.status === 'completed' ? 'text-muted-foreground line-through' : 'text-foreground'">{{ todo.title }}</span>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              <span v-if="todo.dueAt" class="inline-flex h-[18px] items-center rounded px-1.5 text-[11px]" :class="dueBadgeClass(todo)">{{ dueLabel(todo) }}</span>
              <span class="inline-flex h-[18px] items-center rounded px-1.5 text-[11px]" :class="priorityBadgeClass(todo.priority)">{{ priorityLabel(todo.priority) }}</span>
              <span v-if="todo.group" class="inline-flex h-[18px] items-center rounded bg-foreground/5 px-1.5 text-[11px] text-muted-foreground">{{ todo.group.name }}</span>
              <span v-for="tag in todo.tags" :key="tag.id" class="inline-flex h-[18px] items-center rounded bg-foreground/5 px-1.5 text-[11px] text-muted-foreground">#{{ tag.name }}</span>
              <span v-if="pendingReminders(todo)" class="inline-flex h-[18px] items-center rounded bg-foreground/5 px-1.5 text-[11px] text-muted-foreground">提醒 {{ pendingReminders(todo) }}</span>
              <span v-if="todo.sessionLinks.length" class="inline-flex h-[18px] items-center rounded bg-foreground/5 px-1.5 text-[11px] text-muted-foreground">会话 {{ todo.sessionLinks.length }}</span>
            </div>
          </div>
          <Button variant="ghost" size="icon" class="size-8 opacity-0 hover:opacity-100 hover:bg-destructive/10 hover:text-destructive" @click.stop="pendingDelete = todo">
            <Trash2 class="size-3.5" />
          </Button>
        </div>
        <div v-if="!visibleTodos.length" class="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-[13px] text-muted-foreground">
          这里还没有任务。点击右上角"新建 Todo"即可添加。
        </div>
      </div>
    </div>

    <!-- 右栏：详情 Inspector（浮动覆盖） -->
    <div v-if="selectedTodo" class="absolute inset-0 z-30 cursor-pointer bg-black/[0.02]" @click="selectedId = null"></div>
    <aside v-if="selectedTodo" class="absolute right-3 top-3 bottom-3 z-40 flex w-[min(420px,calc(100%-24px))] flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-[0_12px_32px_rgba(0,0,0,0.12)]">
      <Button variant="ghost" size="icon" class="absolute right-3 top-3 z-10 size-7" @click="selectedId = null">
        <X class="size-4" />
      </Button>
      <!-- 固定头部：冲突提示 + 标题 -->
      <div class="flex shrink-0 flex-col gap-2 border-b border-border/50 px-5 pb-3 pt-5">
        <div v-if="todoConflict" class="flex items-center justify-between gap-3 rounded-md border border-amber-400/20 bg-amber-500/[0.08] px-3 py-2 text-xs text-amber-700 dark:text-amber-500">
          <span>此 Todo 已在其他窗口更新，请重新加载后再编辑。</span>
          <Button variant="link" class="h-auto p-0 text-xs text-primary" @click="reloadTodoDetail">重新加载</Button>
        </div>
        <Textarea
          class="w-full resize-none border-none bg-transparent pr-10 text-[17px] font-semibold leading-relaxed"
          v-model="detailTitle"
          :disabled="todoConflict"
          placeholder="任务标题"
          rows="2"
          @blur="saveTitle"
        />
      </div>
      <!-- 可滚动中间内容 -->
      <div class="flex flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden px-5 py-4">
        <!-- 描述 -->
        <div class="flex flex-col gap-3">
          <Label class="mb-1.5 block text-[11px] font-medium text-muted-foreground">描述</Label>
          <Textarea
            class="min-h-[120px] resize-y bg-primary/[0.03]"
            v-model="detailNotes"
            :disabled="todoConflict"
            placeholder="添加描述…"
            @blur="saveNotes"
          />
        </div>
        <!-- 时间 -->
        <div class="flex flex-col gap-3">
          <h3 class="m-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">时间</h3>
          <div class="flex flex-col">
            <Label class="mb-1.5 text-[11px] font-medium text-muted-foreground">计划完成时间</Label>
            <DateTimePicker
              :model-value="detailDueAtInput"
              @update:model-value="detailDueAtInput = $event"
              placeholder="选择时间"
              class="w-full"
              @change="saveDueAt"
            />
          </div>
        </div>
        <!-- 组织 -->
        <div class="flex flex-col gap-3">
          <h3 class="m-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">组织</h3>
          <div class="flex flex-col">
            <Label class="mb-1.5 text-[11px] font-medium text-muted-foreground">优先级</Label>
            <Select v-model="detailPriority" class="w-full" @update:model-value="savePriority">
              <SelectTrigger class="w-full"><SelectValue placeholder="选择优先级" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="high">高优先级</SelectItem>
                <SelectItem value="medium">中优先级</SelectItem>
                <SelectItem value="low">低优先级</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="flex flex-col">
            <Label class="mb-1.5 text-[11px] font-medium text-muted-foreground">Todo 分组</Label>
            <Select v-model="detailGroupId" class="w-full" @update:model-value="saveGroup">
              <SelectTrigger class="w-full"><SelectValue placeholder="选择分组" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">不分组</SelectItem>
                <SelectItem v-for="g in todoGroups" :key="g.id" :value="g.id">{{ g.name }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div v-if="tags.length" class="flex flex-col">
            <Label class="mb-1.5 text-[11px] font-medium text-muted-foreground">标签</Label>
            <div class="flex flex-wrap gap-1">
              <Button
                v-for="tag in tags"
                :key="tag.id"
                variant="ghost"
                size="sm"
                class="cursor-pointer rounded border-none px-2 py-0.5 text-xs"
                :class="selectedTodo.tags.some(t => t.id === tag.id) ? 'bg-primary text-primary-foreground hover:bg-primary' : 'bg-foreground/5 text-muted-foreground hover:bg-primary/10 hover:text-primary'"
                @click="toggleTag(tag)"
              >#{{ tag.name }}</Button>
            </div>
          </div>
        </div>
        <!-- 项目与 Agent -->
        <div class="flex flex-col gap-3">
          <h3 class="m-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">项目与 Agent</h3>
          <div class="flex flex-col">
            <Label class="mb-1.5 text-[11px] font-medium text-muted-foreground">执行项目</Label>
            <Select v-model="detailWorkspaceId" class="w-full" @update:model-value="saveWorkspace">
              <SelectTrigger class="w-full"><SelectValue placeholder="选择项目" /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="p in ws.agentProjects" :key="p.id" :value="p.id">{{ p.name }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            class="h-8 w-full gap-1.5"
            :disabled="!selectedTodo.workspaceId || startingAgent"
            @click="startAgent"
          >
            <Bot class="size-4" /> {{ startingAgent ? '启动中…' : '开始运行 Agent' }}
          </Button>
          <div class="flex flex-col">
            <Label class="mb-1.5 text-[11px] font-medium text-muted-foreground">关联会话</Label>
            <div v-if="validSessionLinks.length" class="flex flex-col gap-1">
              <div
                v-for="link in validSessionLinks"
                :key="link.sessionId"
                class="flex cursor-pointer items-center justify-between rounded-md bg-primary/[0.04] px-2.5 py-2 text-xs transition-colors hover:bg-primary/10"
                @click="openSession(link.sessionId)"
              >
                <span class="min-w-0 flex-1 truncate font-medium text-foreground">{{ getSessionTitle(link.sessionId) }}</span>
                <span class="ml-2 shrink-0 text-[11px] text-muted-foreground">{{ formatDate(link.lastTouchedAt) }}</span>
              </div>
            </div>
            <span v-else class="text-xs text-muted-foreground">尚未由 Agent Session 操作</span>
          </div>
        </div>
      </div>
      <!-- 固定底部：操作按钮 -->
      <div class="flex shrink-0 justify-between gap-3 border-t border-border/50 bg-card px-5 py-3">
        <Button @click="toggleTodo(selectedTodo)">
          <Check class="size-4" />
          {{ selectedTodo.status === 'completed' ? '恢复任务' : '标记完成' }}
        </Button>
        <Button variant="destructive" class="gap-1.5" @click="pendingDelete = selectedTodo">
          <Trash2 class="size-4" /> 删除
        </Button>
      </div>
    </aside>

    <!-- 删除确认 -->
    <Dialog v-model:open="deleteModalOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认删除 Todo</DialogTitle>
        </DialogHeader>
        <p>删除「{{ pendingDelete?.title }}」后无法恢复。</p>
        <DialogFooter>
          <Button variant="outline" @click="deleteModalOpen = false">取消</Button>
          <Button variant="destructive" @click="confirmDelete">删除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 分组管理 Modal -->
    <Dialog v-model:open="groupManagerOpen">
      <DialogContent class="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Todo 分组管理</DialogTitle>
        </DialogHeader>
        <!-- 新建分组 -->
        <div class="mb-3 border-b border-border/50 pb-3">
          <div v-if="creatingGroup" class="flex items-center gap-1.5">
            <Input
              ref="newGroupInputRef"
              :model-value="newGroupName"
              @update:model-value="newGroupName = $event"
              placeholder="输入分组名称"
              class="h-8 flex-1 text-[13px]"
              @keydown.enter="confirmCreateGroup"
              @keydown.escape="cancelCreateGroup"
            />
            <Button variant="ghost" size="icon" class="size-8 text-green-500 hover:bg-green-500 hover:text-white" @click="confirmCreateGroup" :disabled="!newGroupName.trim() || savingGroupAction === 'create'" title="确认">
              <Check class="size-4" />
            </Button>
            <Button variant="ghost" size="icon" class="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" @click="cancelCreateGroup" title="取消">
              <X class="size-4" />
            </Button>
          </div>
          <Button v-else variant="outline" class="h-[34px] w-full gap-1.5 border-dashed" @click="startCreateGroup">
            <Plus class="size-4" /> 新建分组
          </Button>
        </div>

        <!-- 分组列表 -->
        <div class="flex max-h-[320px] flex-col gap-0.5 overflow-y-auto">
          <div v-if="!todoGroups.length" class="py-8 text-center text-[13px] text-muted-foreground">
            还没有分组，点击上方新建
          </div>
          <div
            v-for="g in todoGroups"
            :key="g.id"
            class="group flex h-[38px] items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-primary/[0.04]"
          >
            <!-- 重命名模式 -->
            <template v-if="renamingGroupId === g.id">
              <span class="size-2 shrink-0 rounded-full" :style="{ background: g.color || 'currentColor' }"></span>
              <Input
                ref="renameInputRef"
                :model-value="renameGroupName"
                @update:model-value="renameGroupName = $event"
                class="h-8 flex-1 text-[13px]"
                @keydown.enter="confirmRenameGroup(g)"
                @keydown.escape="cancelRenameGroup"
              />
              <Button variant="ghost" size="icon" class="size-8 text-green-500 hover:bg-green-500 hover:text-white" @click="confirmRenameGroup(g)" :disabled="!renameGroupName.trim() || savingGroupAction === 'rename'" title="确认">
                <Check class="size-4" />
              </Button>
              <Button variant="ghost" size="icon" class="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" @click="cancelRenameGroup" title="取消">
                <X class="size-4" />
              </Button>
            </template>
            <!-- 正常显示模式 -->
            <template v-else>
              <span class="size-2 shrink-0 rounded-full" :style="{ background: g.color || 'currentColor' }"></span>
              <span class="min-w-0 flex-1 truncate text-[13px] text-foreground">{{ g.name }}</span>
              <span class="min-w-[20px] shrink-0 text-right text-[11px] text-muted-foreground">{{ getGroupCount(g.id) }}</span>
              <Button variant="ghost" size="icon" class="size-[26px] text-muted-foreground opacity-0 hover:bg-primary/10 hover:text-primary group-hover:opacity-100" title="重命名" @click="startRenameGroup(g)">
                <Pencil class="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" class="size-[26px] text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100" title="删除" @click="requestDeleteGroup(g)">
                <Trash2 class="size-3.5" />
              </Button>
            </template>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- 分组删除确认 -->
    <Dialog v-model:open="deleteGroupModalOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认删除分组</DialogTitle>
        </DialogHeader>
        <p v-if="pendingDeleteGroupCount > 0">
          删除「{{ pendingDeleteGroup?.name }}」后，其中 {{ pendingDeleteGroupCount }} 个 Todo 会变为未分组，内容不会删除。
        </p>
        <p v-else>删除「{{ pendingDeleteGroup?.name }}」后无法恢复。</p>
        <DialogFooter>
          <Button variant="outline" @click="deleteGroupModalOpen = false">取消</Button>
          <Button variant="destructive" :disabled="savingGroupAction === 'delete'" @click="confirmDeleteGroup">删除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useToast } from '@/components/ui/sonner'
import {
  Check, X, Trash2, Bot, Pencil, Plus,
  Calendar, Clock, CheckCircle, ListOrdered,
} from '@lucide/vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { usePlanningStore } from '@/stores/planning'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAgentStore } from '@/stores/agent'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'

const toast = useToast()
const planning = usePlanningStore()
const ws = useWorkspaceStore()
const agent = useAgentStore()
const router = useRouter()

const todoGroups = computed(() => planning.todoGroups)
const tags = computed(() => planning.tags)
const todos = computed(() => planning.todos)
const todoConflict = computed(() => planning.todoConflict)

const selectedId = computed({
  get: () => planning.selectedTodoId,
  set: (v) => { planning.selectedTodoId = v },
})
const selectedTodo = computed(() => planning.selectedTodo)

const view = ref('all')
const detailTitle = ref('')
const detailNotes = ref('')
const detailDueAt = ref(null)

// 原生 datetime-local input 桥接
const detailDueAtInput = computed({
  get: () => detailDueAt.value ? detailDueAt.value.format('YYYY-MM-DDTHH:mm') : '',
  set: (v) => { detailDueAt.value = v ? dayjs(v) : null },
})
const detailPriority = ref('medium')
const detailGroupId = ref('__none__')
const detailWorkspaceId = ref(null)
const startingAgent = ref(false)
const pendingDelete = ref(null)

// ===== 分组管理 =====
const groupManagerOpen = ref(false)
const creatingGroup = ref(false)
const newGroupName = ref('')
const newGroupInputRef = ref(null)
const renamingGroupId = ref(null)
const renameGroupName = ref('')
const renameInputRef = ref(null)
const savingGroupAction = ref(null) // 'create' | 'rename' | 'delete' | null
const pendingDeleteGroup = ref(null)
const deleteGroupModalOpen = computed({
  get: () => !!pendingDeleteGroup.value,
  set: (v) => { if (!v) pendingDeleteGroup.value = null },
})
const pendingDeleteGroupCount = computed(() => {
  if (!pendingDeleteGroup.value) return 0
  return getGroupCount(pendingDeleteGroup.value.id)
})

const deleteModalOpen = computed({
  get: () => !!pendingDelete.value,
  set: (v) => { if (!v) pendingDelete.value = null },
})

// ===== 视图过滤 =====
const openTodos = computed(() => todos.value.filter(t => t.status === 'open'))

function endOfToday() {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

const visibleTodos = computed(() => {
  const todayEnd = endOfToday()
  const opens = openTodos.value
  if (view.value === 'all') return opens
  if (view.value === 'today') return opens.filter(t => t.dueAt && t.dueAt <= todayEnd)
  if (view.value === 'upcoming') return opens.filter(t => t.dueAt && t.dueAt > todayEnd && t.dueAt <= todayEnd + 7 * 86400000)
  if (view.value === 'completed') return todos.value.filter(t => t.status === 'completed')
  if (view.value.startsWith('group:')) {
    const gid = view.value.slice(6)
    return opens.filter(t => t.groupId === gid)
  }
  return opens
})

const viewTitle = computed(() => {
  if (view.value === 'all') return '全部任务'
  if (view.value === 'today') return '今天'
  if (view.value === 'upcoming') return '未来 7 天'
  if (view.value === 'completed') return '已完成'
  const g = todoGroups.value.find(g => `group:${g.id}` === view.value)
  return g?.name ?? '分组'
})

function setView(v) {
  view.value = v
  selectedId.value = null
}

const navItems = computed(() => {
  const todayEnd = endOfToday()
  return [
    { id: 'all', label: '全部任务', icon: ListOrdered, count: openTodos.value.length },
    { id: 'today', label: '今天', icon: Calendar, count: openTodos.value.filter(t => t.dueAt && t.dueAt <= todayEnd).length },
    { id: 'upcoming', label: '未来 7 天', icon: Clock, count: openTodos.value.filter(t => t.dueAt && t.dueAt > todayEnd && t.dueAt <= todayEnd + 7 * 86400000).length },
    { id: 'completed', label: '已完成', icon: CheckCircle, count: undefined },
  ]
})

// ===== 详情同步 =====
watch(selectedTodo, (todo) => {
  if (!todo) return
  detailTitle.value = todo.title
  detailNotes.value = todo.notes ?? ''
  detailDueAt.value = todo.dueAt ? dayjs(todo.dueAt) : null
  detailPriority.value = todo.priority
  detailGroupId.value = todo.groupId ?? '__none__'
  detailWorkspaceId.value = todo.workspaceId ?? null
  planning.todoConflict = false
}, { immediate: true })

function reloadTodoDetail() {
  if (selectedTodo.value) {
    const todo = selectedTodo.value
    detailTitle.value = todo.title
    detailNotes.value = todo.notes ?? ''
    planning.todoConflict = false
  }
}

// ===== Todo 操作 =====
async function toggleTodo(todo) {
  try {
    await planning.updateTodo({
      id: todo.id,
      status: todo.status === 'completed' ? 'open' : 'completed',
      expectedUpdatedAt: todo.updatedAt,
    })
  } catch { /* error handled in store */ }
}

async function saveTitle() {
  if (!selectedTodo.value || todoConflict.value) return
  const title = detailTitle.value.trim()
  if (!title || title === selectedTodo.value.title) return
  try {
    await planning.updateTodo({ id: selectedTodo.value.id, title, expectedUpdatedAt: selectedTodo.value.updatedAt })
  } catch { /* */ }
}

async function saveNotes() {
  if (!selectedTodo.value || todoConflict.value) return
  const notes = detailNotes.value
  if (notes === (selectedTodo.value.notes ?? '')) return
  try {
    await planning.updateTodo({ id: selectedTodo.value.id, notes, expectedUpdatedAt: selectedTodo.value.updatedAt })
  } catch { /* */ }
}

async function saveDueAt() {
  if (!selectedTodo.value) return
  const dueAt = detailDueAt.value ? detailDueAt.value.valueOf() : null
  try {
    await planning.updateTodo({ id: selectedTodo.value.id, dueAt, expectedUpdatedAt: selectedTodo.value.updatedAt })
  } catch { /* */ }
}

async function savePriority() {
  if (!selectedTodo.value) return
  try {
    await planning.updateTodo({ id: selectedTodo.value.id, priority: detailPriority.value, expectedUpdatedAt: selectedTodo.value.updatedAt })
  } catch { /* */ }
}

async function saveGroup() {
  if (!selectedTodo.value) return
  const groupId = detailGroupId.value === '__none__' ? null : detailGroupId.value
  try {
    await planning.updateTodo({ id: selectedTodo.value.id, groupId, expectedUpdatedAt: selectedTodo.value.updatedAt })
  } catch { /* */ }
}

async function saveWorkspace() {
  if (!selectedTodo.value) return
  try {
    await planning.updateTodo({ id: selectedTodo.value.id, workspaceId: detailWorkspaceId.value, expectedUpdatedAt: selectedTodo.value.updatedAt })
  } catch { /* */ }
}

async function toggleTag(tag) {
  if (!selectedTodo.value) return
  const current = selectedTodo.value.tags.map(t => t.id)
  const newIds = current.includes(tag.id) ? current.filter(id => id !== tag.id) : [...current, tag.id]
  try {
    await planning.updateTodo({ id: selectedTodo.value.id, tagIds: newIds, expectedUpdatedAt: selectedTodo.value.updatedAt })
  } catch { /* */ }
}

/**
 * 构建 Todo Agent 提示词
 * Pi Agent 必须通过 Planning MCP 读取数据层中的原始最新记录。
 */
function buildTodoAgentPrompt(todoId) {
  return [
    `请处理关联的 Todo（ID: ${todoId}）。`,
    '',
    `开始前必须调用 \`mcp__planning__get_todo({ id: "${todoId}" })\`，读取此 Todo 的原始最新信息（标题、说明、优先级、计划完成时间及关联上下文）。`,
    '随后检查当前项目状态，并根据任务目标推进工作；需要澄清或遇到高风险操作时先询问用户。不要把 Todo 标记为完成，除非工作确实完成或用户明确要求。',
  ].join('\n')
}

async function startAgent() {
  if (!selectedTodo.value?.workspaceId || startingAgent.value) return
  startingAgent.value = true
  try {
    const result = await planning.startTodoAgent({
      todoId: selectedTodo.value.id,
      workspaceId: selectedTodo.value.workspaceId,
      expectedUpdatedAt: selectedTodo.value.updatedAt,
      channelId: agent.currentSession?.channelId || ws.agentChannelId || '',
    })
    if (result?.session) {
      // 将新会话加入 agent store
      agent.sessions.unshift(result.session)
      // 切换到 Agent 项目
      ws.selectAgentProject(selectedTodo.value.workspaceId)
      ws.setAppMode('agent')
      ws.setActiveModule('agent')
      // 设置待发送提示词，Agent 页面加载后自动消费
      agent.pendingPrompt = {
        sessionId: result.session.id,
        message: buildTodoAgentPrompt(selectedTodo.value.id),
        workspaceId: selectedTodo.value.workspaceId,
      }
      // 关闭详情面板并通过 Tab 系统打开 Agent 会话
      selectedId.value = null
      // 直接通过 selectSession 打开 Tab（避免 router.push 导致的竞态条件）
      agent.selectSession(result.session.id)
      toast.success('已启动 Agent')
    }
  } catch {
    toast.error('启动 Agent 失败')
  } finally {
    startingAgent.value = false
  }
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  try {
    await planning.deleteTodo(pendingDelete.value.id)
    pendingDelete.value = null
  } catch {
    toast.error('删除 Todo 失败')
  }
}

// ===== 分组管理操作 =====
function startCreateGroup() {
  creatingGroup.value = true
  newGroupName.value = ''
  nextTick(() => newGroupInputRef.value?.focus())
}

function cancelCreateGroup() {
  creatingGroup.value = false
  newGroupName.value = ''
}

async function confirmCreateGroup() {
  const name = newGroupName.value.trim()
  if (!name || savingGroupAction.value) return
  savingGroupAction.value = 'create'
  try {
    const group = await planning.createGroup({ scope: 'todo', name })
    if (group) {
      creatingGroup.value = false
      newGroupName.value = ''
      // 新建后自动切换到该分组视图
      setView(`group:${group.id}`)
    }
  } catch {
    toast.error('创建分组失败：名称可能已存在')
  } finally {
    savingGroupAction.value = null
  }
}

function startRenameGroup(group) {
  renamingGroupId.value = group.id
  renameGroupName.value = group.name
  nextTick(() => {
    const el = renameInputRef.value
    if (el && el.focus) el.focus()
    else if (el && el.input) el.input.focus()
  })
}

function cancelRenameGroup() {
  renamingGroupId.value = null
  renameGroupName.value = ''
}

async function confirmRenameGroup(group) {
  const name = renameGroupName.value.trim()
  if (!name || savingGroupAction.value) return
  if (name === group.name) {
    cancelRenameGroup()
    return
  }
  savingGroupAction.value = 'rename'
  try {
    await planning.updateGroup({ id: group.id, scope: 'todo', name })
    renamingGroupId.value = null
    renameGroupName.value = ''
  } catch {
    toast.error('重命名分组失败：名称可能已存在')
  } finally {
    savingGroupAction.value = null
  }
}

function requestDeleteGroup(group) {
  pendingDeleteGroup.value = group
}

async function confirmDeleteGroup() {
  if (!pendingDeleteGroup.value || savingGroupAction.value) return
  const group = pendingDeleteGroup.value
  savingGroupAction.value = 'delete'
  try {
    await planning.deleteGroup('todo', group.id)
    // 如果当前视图是被删除的分组，重置为全部任务
    if (view.value === `group:${group.id}`) {
      setView('all')
    }
    pendingDeleteGroup.value = null
  } catch {
    toast.error('删除分组失败')
  } finally {
    savingGroupAction.value = null
  }
}

// ===== 辅助 =====
function getGroupCount(gid) {
  return openTodos.value.filter(t => t.groupId === gid).length
}

function pendingReminders(todo) {
  return todo.reminders?.filter(r => r.status === 'pending').length || 0
}

function dueLabel(todo) {
  if (!todo.dueAt) return ''
  return dayjs(todo.dueAt).format('MM-DD HH:mm')
}

function dueBadgeClass(todo) {
  if (todo.status === 'open' && todo.dueAt < Date.now()) return 'bg-red-500/10 text-red-500'
  if (todo.dueAt <= endOfToday()) return 'bg-amber-500/10 text-amber-600'
  return 'bg-foreground/5 text-muted-foreground'
}

function priorityLabel(p) {
  return p === 'high' ? '高优先级' : p === 'low' ? '低优先级' : '中优先级'
}

function priorityBadgeClass(p) {
  if (p === 'high') return 'bg-red-500/[0.08] text-red-500'
  if (p === 'low') return 'bg-foreground/[0.04] text-muted-foreground'
  return 'bg-amber-500/[0.08] text-amber-600'
}

function formatDate(ts) {
  return dayjs(ts).format('MM-DD')
}

// ===== 关联会话 =====
// 仅显示仍然存在于 agent.sessions 中的会话（已删除的会话不显示）
const validSessionLinks = computed(() => {
  if (!selectedTodo.value?.sessionLinks) return []
  return selectedTodo.value.sessionLinks.filter(link =>
    agent.sessions.some(s => s.id === link.sessionId),
  )
})

// 获取会话标题
function getSessionTitle(sessionId) {
  const session = agent.sessions.find(s => s.id === sessionId)
  return session?.title || '未命名会话'
}

// 点击关联会话：跳转到 Agent 会话页面
async function openSession(sessionId) {
  const session = agent.sessions.find(s => s.id === sessionId)
  if (!session) {
    toast.warning('会话不存在或已被删除')
    return
  }
  // 选中会话所属的项目
  const workspaceId = session.workspaceId || session.workspace_id || session.projectId
  if (workspaceId) {
    ws.selectAgentProject(workspaceId)
  }
  // 选中会话（加载消息，selectSession 会自动打开 Tab）
  await agent.selectSession(sessionId)
  // 切换到 Agent 模式
  ws.setAppMode('agent')
  ws.setActiveModule('agent')
  selectedId.value = null
}

// 确保加载 Agent 会话列表（用于过滤已删除的关联会话）
onMounted(() => {
  if (!agent.sessions.length) {
    agent.loadSessions()
  }
})
</script>
