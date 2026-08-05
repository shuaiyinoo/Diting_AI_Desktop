<template>
  <div class="todo-workspace">
    <!-- 左栏：导航 -->
    <aside class="todo-sidebar">
      <div class="todo-sidebar__label">Todo</div>
      <nav class="todo-sidebar__nav">
        <button
          v-for="item in navItems"
          :key="item.id"
          class="todo-nav-item"
          :class="{ 'todo-nav-item--active': view === item.id }"
          @click="setView(item.id)"
        >
          <component :is="item.icon" class="todo-nav-item__icon" />
          <span class="todo-nav-item__label">{{ item.label }}</span>
          <span v-if="item.count !== undefined" class="todo-nav-item__count">{{ item.count }}</span>
        </button>
      </nav>

      <div class="todo-sidebar__groups">
        <div class="todo-sidebar__groups-header">
          <span class="todo-sidebar__label">Todo 分组</span>
          <button class="todo-sidebar__manage" @click="groupManagerOpen = true">管理</button>
        </div>
        <div class="todo-sidebar__groups-list">
          <button
            v-for="g in todoGroups"
            :key="g.id"
            class="todo-nav-item"
            :class="{ 'todo-nav-item--active': view === `group:${g.id}` }"
            @click="setView(`group:${g.id}`)"
          >
            <span class="todo-group-dot" :style="{ background: g.color || 'currentColor' }"></span>
            <span class="todo-nav-item__label">{{ g.name }}</span>
            <span class="todo-nav-item__count">{{ getGroupCount(g.id) }}</span>
          </button>
        </div>
      </div>
    </aside>

    <!-- 中栏：列表 -->
    <div class="todo-list-area">
      <div class="todo-list-header">
        <h2>{{ viewTitle }}</h2>
        <span v-if="view !== 'completed'" class="todo-list-count">{{ visibleTodos.length }} 项</span>
      </div>
      <div class="todo-list-body">
        <div
          v-for="todo in visibleTodos"
          :key="todo.id"
          class="todo-item"
          :class="{ 'todo-item--selected': selectedId === todo.id, 'todo-item--done': todo.status === 'completed' }"
          @click="selectedId = todo.id"
        >
          <button
            class="todo-check"
            :class="{ 'todo-check--done': todo.status === 'completed' }"
            @click.stop="toggleTodo(todo)"
          >
            <CheckOutlined v-if="todo.status === 'completed'" />
          </button>
          <div class="todo-item__body">
            <span class="todo-item__title" :class="{ 'todo-item__title--done': todo.status === 'completed' }">{{ todo.title }}</span>
            <div class="todo-item__meta">
              <span v-if="todo.dueAt" class="todo-badge" :class="dueBadgeClass(todo)">{{ dueLabel(todo) }}</span>
              <span class="todo-badge" :class="priorityBadgeClass(todo.priority)">{{ priorityLabel(todo.priority) }}</span>
              <span v-if="todo.group" class="todo-badge">{{ todo.group.name }}</span>
              <span v-for="tag in todo.tags" :key="tag.id" class="todo-badge">#{{ tag.name }}</span>
              <span v-if="pendingReminders(todo)" class="todo-badge">提醒 {{ pendingReminders(todo) }}</span>
              <span v-if="todo.sessionLinks.length" class="todo-badge">会话 {{ todo.sessionLinks.length }}</span>
            </div>
          </div>
          <button class="todo-item__delete" @click.stop="pendingDelete = todo">
            <DeleteOutlined />
          </button>
        </div>
        <div v-if="!visibleTodos.length" class="todo-empty">
          这里还没有任务。点击右上角"新建 Todo"即可添加。
        </div>
      </div>
    </div>

    <!-- 右栏：详情 Inspector（浮动覆盖） -->
    <div v-if="selectedTodo" class="todo-inspector-overlay" @click="selectedId = null"></div>
    <aside v-if="selectedTodo" class="todo-inspector">
      <button class="todo-inspector__close" @click="selectedId = null">
        <CloseOutlined />
      </button>
      <!-- 固定头部：冲突提示 + 标题 -->
      <div class="todo-inspector__header">
        <div v-if="todoConflict" class="todo-conflict-banner">
          <span>此 Todo 已在其他窗口更新，请重新加载后再编辑。</span>
          <button class="todo-conflict-reload" @click="reloadTodoDetail">重新加载</button>
        </div>
        <textarea
          class="todo-inspector__title"
          v-model="detailTitle"
          :disabled="todoConflict"
          placeholder="任务标题"
          rows="2"
          @blur="saveTitle"
        ></textarea>
      </div>
      <!-- 可滚动中间内容 -->
      <div class="todo-inspector__body">
        <!-- 描述 -->
        <div class="todo-inspector__section">
          <label class="todo-inspector__label">描述</label>
          <textarea
            class="todo-inspector__notes"
            v-model="detailNotes"
            :disabled="todoConflict"
            placeholder="添加描述…"
            @blur="saveNotes"
          ></textarea>
        </div>
        <!-- 时间 -->
        <div class="todo-inspector__section">
          <h3 class="todo-inspector__section-title">时间</h3>
          <div class="todo-inspector__field">
            <label class="todo-inspector__field-label">计划完成时间</label>
            <a-date-picker
              v-model:value="detailDueAt"
              placeholder="选择时间"
              class="todo-inspector__date"
              @change="saveDueAt"
            />
          </div>
        </div>
        <!-- 组织 -->
        <div class="todo-inspector__section">
          <h3 class="todo-inspector__section-title">组织</h3>
          <div class="todo-inspector__field">
            <label class="todo-inspector__field-label">优先级</label>
            <a-select v-model:value="detailPriority" class="todo-inspector__select" @change="savePriority">
              <a-select-option value="high">高优先级</a-select-option>
              <a-select-option value="medium">中优先级</a-select-option>
              <a-select-option value="low">低优先级</a-select-option>
            </a-select>
          </div>
          <div class="todo-inspector__field">
            <label class="todo-inspector__field-label">Todo 分组</label>
            <a-select v-model:value="detailGroupId" class="todo-inspector__select" @change="saveGroup">
              <a-select-option value="__none__">不分组</a-select-option>
              <a-select-option v-for="g in todoGroups" :key="g.id" :value="g.id">{{ g.name }}</a-select-option>
            </a-select>
          </div>
          <div v-if="tags.length" class="todo-inspector__field">
            <label class="todo-inspector__field-label">标签</label>
            <div class="todo-tag-list">
              <button
                v-for="tag in tags"
                :key="tag.id"
                class="todo-tag"
                :class="{ 'todo-tag--active': selectedTodo.tags.some(t => t.id === tag.id) }"
                @click="toggleTag(tag)"
              >#{{ tag.name }}</button>
            </div>
          </div>
        </div>
        <!-- 项目与 Agent -->
        <div class="todo-inspector__section">
          <h3 class="todo-inspector__section-title">项目与 Agent</h3>
          <div class="todo-inspector__field">
            <label class="todo-inspector__field-label">执行项目</label>
            <a-select
              v-model:value="detailWorkspaceId"
              placeholder="选择项目"
              class="todo-inspector__select"
              @change="saveWorkspace"
            >
              <a-select-option v-for="p in ws.agentProjects" :key="p.id" :value="p.id">{{ p.name }}</a-select-option>
            </a-select>
          </div>
          <button
            class="planning-btn planning-btn--primary todo-inspector__run-agent"
            :disabled="!selectedTodo.workspaceId || startingAgent"
            @click="startAgent"
          >
            <RobotOutlined /> {{ startingAgent ? '启动中…' : '开始运行 Agent' }}
          </button>
          <div class="todo-inspector__field">
            <label class="todo-inspector__field-label">关联会话</label>
            <div v-if="validSessionLinks.length" class="todo-session-links">
              <div
                v-for="link in validSessionLinks"
                :key="link.sessionId"
                class="todo-session-link"
                @click="openSession(link.sessionId)"
              >
                <span class="todo-session-link__title">{{ getSessionTitle(link.sessionId) }}</span>
                <span class="todo-session-link__date">{{ formatDate(link.lastTouchedAt) }}</span>
              </div>
            </div>
            <span v-else class="todo-no-sessions">尚未由 Agent Session 操作</span>
          </div>
        </div>
      </div>
      <!-- 固定底部：操作按钮 -->
      <div class="todo-inspector__footer">
        <button class="planning-btn planning-btn--primary todo-inspector__complete-btn" @click="toggleTodo(selectedTodo)">
          <CheckOutlined />
          {{ selectedTodo.status === 'completed' ? '恢复任务' : '标记完成' }}
        </button>
        <button class="planning-btn todo-inspector__delete-btn" @click="pendingDelete = selectedTodo">
          <DeleteOutlined /> 删除
        </button>
      </div>
    </aside>

    <!-- 删除确认 -->
    <a-modal
      v-model:open="deleteModalOpen"
      title="确认删除 Todo"
      ok-text="删除"
      cancel-text="取消"
      ok-type="danger"
      @ok="confirmDelete"
    >
      <p>删除「{{ pendingDelete?.title }}」后无法恢复。</p>
    </a-modal>

    <!-- 分组管理 Modal -->
    <a-modal
      v-model:open="groupManagerOpen"
      title="Todo 分组管理"
      :footer="null"
      width="440px"
      class="group-manager-modal"
    >
      <!-- 新建分组 -->
      <div class="group-manager__create">
        <div v-if="creatingGroup" class="group-manager__create-row">
          <a-input
            ref="newGroupInputRef"
            v-model:value="newGroupName"
            placeholder="输入分组名称"
            size="small"
            class="group-manager__create-input"
            @keydown.enter="confirmCreateGroup"
            @keydown.escape="cancelCreateGroup"
          />
          <button class="group-manager__action-btn group-manager__action-btn--confirm" @click="confirmCreateGroup" :disabled="!newGroupName.trim() || savingGroupAction === 'create'" title="确认">
            <CheckOutlined />
          </button>
          <button class="group-manager__action-btn group-manager__action-btn--cancel" @click="cancelCreateGroup" title="取消">
            <CloseOutlined />
          </button>
        </div>
        <button v-else class="group-manager__add-btn" @click="startCreateGroup">
          <PlusOutlined /> 新建分组
        </button>
      </div>

      <!-- 分组列表 -->
      <div class="group-manager__list">
        <div v-if="!todoGroups.length" class="group-manager__empty">
          还没有分组，点击上方新建
        </div>
        <div
          v-for="g in todoGroups"
          :key="g.id"
          class="group-manager__item"
        >
          <!-- 重命名模式 -->
          <template v-if="renamingGroupId === g.id">
            <span class="todo-group-dot" :style="{ background: g.color || 'currentColor' }"></span>
            <a-input
              ref="renameInputRef"
              v-model:value="renameGroupName"
              size="small"
              class="group-manager__rename-input"
              @keydown.enter="confirmRenameGroup(g)"
              @keydown.escape="cancelRenameGroup"
            />
            <button class="group-manager__action-btn group-manager__action-btn--confirm" @click="confirmRenameGroup(g)" :disabled="!renameGroupName.trim() || savingGroupAction === 'rename'" title="确认">
              <CheckOutlined />
            </button>
            <button class="group-manager__action-btn group-manager__action-btn--cancel" @click="cancelRenameGroup" title="取消">
              <CloseOutlined />
            </button>
          </template>
          <!-- 正常显示模式 -->
          <template v-else>
            <span class="todo-group-dot" :style="{ background: g.color || 'currentColor' }"></span>
            <span class="group-manager__item-name">{{ g.name }}</span>
            <span class="group-manager__item-count">{{ getGroupCount(g.id) }}</span>
            <button class="group-manager__icon-btn" title="重命名" @click="startRenameGroup(g)">
              <EditOutlined />
            </button>
            <button class="group-manager__icon-btn group-manager__icon-btn--danger" title="删除" @click="requestDeleteGroup(g)">
              <DeleteOutlined />
            </button>
          </template>
        </div>
      </div>
    </a-modal>

    <!-- 分组删除确认 -->
    <a-modal
      v-model:open="deleteGroupModalOpen"
      title="确认删除分组"
      ok-text="删除"
      cancel-text="取消"
      ok-type="danger"
      :ok-button-props="{ loading: savingGroupAction === 'delete' }"
      @ok="confirmDeleteGroup"
    >
      <p v-if="pendingDeleteGroupCount > 0">
        删除「{{ pendingDeleteGroup?.name }}」后，其中 {{ pendingDeleteGroupCount }} 个 Todo 会变为未分组，内容不会删除。
      </p>
      <p v-else>删除「{{ pendingDeleteGroup?.name }}」后无法恢复。</p>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import {
  CheckOutlined, CloseOutlined, DeleteOutlined, RobotOutlined, EditOutlined, PlusOutlined,
  CalendarOutlined, ClockCircleOutlined, CheckCircleOutlined, UnorderedListOutlined,
} from '@ant-design/icons-vue'
import { usePlanningStore } from '@/stores/planning'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAgentStore } from '@/stores/agent'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'

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
    { id: 'all', label: '全部任务', icon: UnorderedListOutlined, count: openTodos.value.length },
    { id: 'today', label: '今天', icon: CalendarOutlined, count: openTodos.value.filter(t => t.dueAt && t.dueAt <= todayEnd).length },
    { id: 'upcoming', label: '未来 7 天', icon: ClockCircleOutlined, count: openTodos.value.filter(t => t.dueAt && t.dueAt > todayEnd && t.dueAt <= todayEnd + 7 * 86400000).length },
    { id: 'completed', label: '已完成', icon: CheckCircleOutlined, count: undefined },
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
      // 关闭详情面板并跳转到 Agent 页面
      selectedId.value = null
      await router.push('/agent')
      message.success('已启动 Agent')
    }
  } catch {
    message.error('启动 Agent 失败')
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
    message.error('删除 Todo 失败')
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
    message.error('创建分组失败：名称可能已存在')
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
    message.error('重命名分组失败：名称可能已存在')
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
    message.error('删除分组失败')
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
  if (todo.status === 'open' && todo.dueAt < Date.now()) return 'todo-badge--overdue'
  if (todo.dueAt <= endOfToday()) return 'todo-badge--today'
  return ''
}

function priorityLabel(p) {
  return p === 'high' ? '高优先级' : p === 'low' ? '低优先级' : '中优先级'
}

function priorityBadgeClass(p) {
  if (p === 'high') return 'todo-badge--high'
  if (p === 'low') return 'todo-badge--low'
  return 'todo-badge--medium'
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
    message.warning('会话不存在或已被删除')
    return
  }
  // 选中会话所属的项目
  const workspaceId = session.workspaceId || session.workspace_id || session.projectId
  if (workspaceId) {
    ws.selectAgentProject(workspaceId)
  }
  // 选中会话（加载消息）
  await agent.selectSession(sessionId)
  // 切换到 Agent 页面
  ws.setAppMode('agent')
  ws.setActiveModule('agent')
  selectedId.value = null
  await router.push('/agent')
}

// 确保加载 Agent 会话列表（用于过滤已删除的关联会话）
onMounted(() => {
  if (!agent.sessions.length) {
    agent.loadSessions()
  }
})
</script>

<style lang="less" scoped>
.todo-workspace {
  flex: 1;
  display: flex;
  min-height: 0;
  box-sizing: border-box;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  position: relative;
}

// ===== 左栏 =====
.todo-sidebar {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color-light);
  background: rgba(22, 119, 255, 0.02);
  padding: 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;

  &__label {
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    padding: 4px 8px 12px;
  }

  &__nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__groups {
    margin-top: 24px;
  }

  &__groups-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 8px 8px;
  }

  &__manage {
    border: none;
    background: transparent;
    font-size: 11px;
    color: var(--text-muted);
    cursor: pointer;
    &:hover { color: var(--accent); }
  }

  &__groups-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
}

.todo-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 8px;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-muted);
  transition: all 0.15s ease;
  width: 100%;
  text-align: left;

  &:hover {
    background: rgba(22, 119, 255, 0.05);
    color: var(--text-primary);
  }

  &--active {
    background: var(--bg-panel);
    color: var(--accent);
    font-weight: 600;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  }

  &__icon {
    font-size: 15px;
    flex-shrink: 0;
  }

  &__label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__count {
    font-size: 11px;
    color: var(--text-muted);
    flex-shrink: 0;
  }
}

.todo-group-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

// ===== 中栏 =====
.todo-list-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid var(--border-color-light);
}

.todo-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color-light);
  flex-shrink: 0;

  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .todo-list-count {
    font-size: 12px;
    color: var(--text-muted);
  }
}

.todo-list-body {
  flex: 1;
  overflow-y: auto;
}

.todo-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 20px;
  border-bottom: 1px solid var(--border-color-light);
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(22, 119, 255, 0.03);
  }

  &--selected {
    background: rgba(22, 119, 255, 0.06);
  }

  &--done {
    .todo-item__title {
      text-decoration: line-through;
      color: var(--text-muted);
    }
  }

  &__body {
    flex: 1;
    min-width: 0;
  }

  &__title {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
  }

  &__delete {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    opacity: 0;
    transition: all 0.15s ease;

    &:hover {
      background: rgba(255, 77, 79, 0.1);
      color: #ff4d4f;
    }
  }

  &:hover &__delete {
    opacity: 1;
  }
}

.todo-check {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
  transition: all 0.15s ease;
  font-size: 10px;
  color: transparent;

  &:hover {
    border-color: var(--accent);
    background: var(--accent);
    color: #fff;
  }

  &--done {
    border-color: var(--accent);
    background: var(--accent);
    color: #fff;
  }
}

.todo-badge {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 4px;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-muted);

  &--overdue { background: rgba(245, 34, 45, 0.1); color: #f5222d; }
  &--today { background: rgba(250, 173, 20, 0.1); color: #fa8c16; }
  &--high { background: rgba(245, 34, 45, 0.08); color: #f5222d; }
  &--medium { background: rgba(250, 173, 20, 0.08); color: #fa8c16; }
  &--low { background: rgba(0, 0, 0, 0.04); color: var(--text-muted); }
}

.todo-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 0;
  padding: 24px;
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
}

// ===== 右栏 Inspector =====
.todo-inspector-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  background: rgba(0, 0, 0, 0.02);
  cursor: pointer;
}

.todo-inspector {
  position: absolute;
  top: 12px;
  right: 12px;
  bottom: 12px;
  width: min(420px, calc(100% - 24px));
  background: var(--bg-panel);
  border: 1px solid var(--border-color-light);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
  border-radius: 12px;
  z-index: 40;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  &__close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--text-muted);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;

    &:hover { background: var(--bg-hover); color: var(--text-primary); }
  }

  // 固定头部：冲突提示 + 标题
  &__header {
    flex-shrink: 0;
    padding: 20px 20px 12px;
    border-bottom: 1px solid var(--border-color-light);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  // 可滚动中间内容
  &__body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  &__title {
    border: none;
    background: transparent;
    font-size: 17px;
    font-weight: 600;
    color: var(--text-primary);
    outline: none;
    padding: 0;
    padding-right: 40px;
    width: 100%;
    box-sizing: border-box;
    resize: none;
    line-height: 1.4;
    word-wrap: break-word;
    overflow-wrap: break-word;

    &:focus {
      box-shadow: none;
    }
  }

  &__section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    margin: 0;
  }

  &__label {
    display: block;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
    margin-bottom: 6px;
  }

  &__field {
    display: flex;
    flex-direction: column;
  }

  &__field-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
    margin-bottom: 6px;
  }

  &__notes {
    border: 1px solid var(--border-color-light);
    border-radius: 8px;
    background: rgba(22, 119, 255, 0.03);
    padding: 8px 12px;
    font-size: 13px;
    min-height: 120px;
    resize: vertical;
    outline: none;
    color: var(--text-primary);

    &:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.1);
    }
  }

  &__select {
    width: 100%;
  }

  &__date {
    width: 100%;
  }

  &__run-agent {
    width: 100%;
    justify-content: center;
  }

  // 固定底部：操作按钮
  &__footer {
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    padding: 12px 20px;
    border-top: 1px solid var(--border-color-light);
    background: var(--bg-panel);
  }

  &__delete-btn {
    background: rgba(255, 77, 79, 0.1); color: #ff4d4f; border: 1px solid rgba(255, 77, 79, 0.3);
    &:hover { background: #ff4d4f; color: #fff; border-color: #ff4d4f; }
  }
}

.todo-conflict-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(250, 173, 20, 0.08);
  border: 1px solid rgba(250, 173, 20, 0.2);
  font-size: 12px;
  color: #ad6800;

  .todo-conflict-reload {
    border: none;
    background: transparent;
    color: var(--accent);
    cursor: pointer;
    font-size: 12px;
    flex-shrink: 0;
  }
}

.todo-tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.todo-tag {
  padding: 2px 8px;
  border-radius: 4px;
  border: none;
  font-size: 12px;
  cursor: pointer;
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-muted);
  transition: all 0.15s ease;

  &:hover {
    background: rgba(22, 119, 255, 0.1);
    color: var(--accent);
  }

  &--active {
    background: var(--accent);
    color: #fff;
  }
}

.todo-session-links {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.todo-session-link {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(22, 119, 255, 0.04);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(22, 119, 255, 0.1);
  }

  &__title {
    color: var(--text-primary);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  &__date {
    color: var(--text-muted);
    font-size: 11px;
    flex-shrink: 0;
    margin-left: 8px;
  }
}

.todo-no-sessions {
  font-size: 12px;
  color: var(--text-muted);
}

// ===== 规划按钮（公共样式） =====
.planning-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s ease;

  &--primary {
    background: var(--accent);
    color: #fff;
    font-weight: 500;
    box-shadow: 0 2px 6px rgba(22, 119, 255, 0.25);
    &:hover { background: var(--accent-hover); }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }

  &--ghost {
    background: var(--bg-panel);
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
    &:hover { color: var(--accent); border-color: var(--accent); }
  }
}

// ===== 分组管理 Modal =====
.group-manager-modal {
  .ant-modal-body {
    padding: 16px 20px 20px;
  }
}

.group-manager {
  &__create {
    margin-bottom: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border-color-light);
  }

  &__create-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__create-input {
    flex: 1;
  }

  &__add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    height: 34px;
    border: 1px dashed var(--border-color);
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-muted);
    transition: all 0.15s ease;

    &:hover {
      border-color: var(--accent);
      color: var(--accent);
      background: rgba(22, 119, 255, 0.03);
    }
  }

  &__list {
    max-height: 320px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__empty {
    padding: 32px 0;
    text-align: center;
    font-size: 13px;
    color: var(--text-muted);
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 38px;
    padding: 0 6px;
    border-radius: 6px;
    transition: background 0.15s ease;

    &:hover {
      background: rgba(22, 119, 255, 0.04);

      .group-manager__icon-btn {
        opacity: 1;
      }
    }
  }

  &__item-name {
    flex: 1;
    font-size: 13px;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__item-count {
    font-size: 11px;
    color: var(--text-muted);
    flex-shrink: 0;
    min-width: 20px;
    text-align: right;
  }

  &__rename-input {
    flex: 1;
  }

  // 确认/取消按钮（新建 & 重命名模式，始终可见）
  &__action-btn {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 14px;
    transition: all 0.15s ease;

    &--confirm {
      background: rgba(82, 196, 26, 0.12);
      color: #52c41a;

      &:hover:not(:disabled) {
        background: #52c41a;
        color: #fff;
      }

      &:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
    }

    &--cancel {
      background: rgba(0, 0, 0, 0.06);
      color: var(--text-muted);

      &:hover {
        background: rgba(255, 77, 79, 0.1);
        color: #ff4d4f;
      }
    }
  }

  // 列表行内的编辑/删除按钮（hover 时才显示）
  &__icon-btn {
    width: 26px;
    height: 26px;
    border: none;
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    flex-shrink: 0;
    opacity: 0;
    transition: all 0.15s ease;
    font-size: 13px;

    &:hover {
      background: rgba(22, 119, 255, 0.1);
      color: var(--accent);
    }

    &:disabled {
      opacity: 0.3;
      cursor: not-allowed;
    }

    &--danger:hover {
      background: rgba(255, 77, 79, 0.1);
      color: #ff4d4f;
    }
  }
}
</style>
