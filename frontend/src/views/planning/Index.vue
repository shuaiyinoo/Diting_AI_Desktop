<template>
  <div class="planning-view">
    <!-- 页头 -->
    <header class="planning-header">
      <div class="planning-header__title">
        <h1>任务/日程</h1>
        <p>安排待办、日程与定时任务</p>
      </div>
      <div class="planning-header__actions">
        <button
          v-if="tab === 'todos'"
          class="planning-btn planning-btn--primary"
          @click="requestTodoCreate"
        >
          <PlusOutlined /> 新建 Todo
        </button>
        <button
          v-if="tab === 'calendar'"
          class="planning-btn planning-btn--primary"
          @click="requestCalendarCreate"
        >
          <PlusOutlined /> 新建日程
        </button>
        <button
          v-if="tab === 'automations' && automations.length > 0"
          class="planning-btn planning-btn--primary"
          @click="createAutomation"
        >
          <PlusOutlined /> 新建定时任务
        </button>
      </div>
    </header>

    <!-- Tab 切换 -->
    <div class="planning-tabs">
      <button
        v-for="item in tabs"
        :key="item.id"
        class="planning-tab"
        :class="{ 'planning-tab--active': tab === item.id }"
        @click="tab = item.id"
      >{{ item.label }}</button>
    </div>

    <!-- 内容区 -->
    <main class="planning-main" :class="{ 'planning-main--scroll': tab === 'automations' }">
      <TodoWorkspace v-if="tab === 'todos'" />
      <CalendarWorkspace v-else-if="tab === 'calendar'" />
      <AutomationsView v-else />
    </main>

    <!-- 新建 Todo 对话框 -->
    <a-modal
      v-model:open="createTodoOpen"
      title="添加 Todo"
      :footer="null"
      width="600px"
      class="todo-create-modal"
    >
      <form @submit.prevent="confirmCreateTodo" class="todo-create-form">
        <a-textarea
          v-model:value="quickTitle"
          placeholder="输入任务内容，Enter 创建"
          :auto-size="{ minRows: 2 }"
          @keydown.enter="onTodoEnterKey"
        />
        <div class="todo-create-options">
          <a-date-picker
            v-model:value="quickDueAt"
            placeholder="计划完成时间"
            class="todo-create-date"
          />
          <a-select v-model:value="quickPriority" class="todo-create-priority">
            <a-select-option value="high">高优先级</a-select-option>
            <a-select-option value="medium">中优先级</a-select-option>
            <a-select-option value="low">低优先级</a-select-option>
          </a-select>
          <a-select v-model:value="quickGroupId" class="todo-create-group">
            <a-select-option value="__none__">不分组</a-select-option>
            <a-select-option v-for="g in todoGroups" :key="g.id" :value="g.id">{{ g.name }}</a-select-option>
          </a-select>
          <button type="submit" class="planning-btn planning-btn--primary" :disabled="!quickTitle.trim() || isCreatingTodo">
            {{ isCreatingTodo ? '添加中…' : '添加' }}
          </button>
        </div>
      </form>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
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
    message.error('创建 Todo 失败')
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

<style lang="less" scoped>
.planning-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  background: var(--bg-panel);
  overflow: hidden;
}

.planning-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px 12px;
  flex-shrink: 0;

  &__title {
    h1 {
      font-size: 20px;
      font-weight: 600;
      margin: 0;
      color: var(--text-primary);
      letter-spacing: -0.3px;
    }
    p {
      margin: 4px 0 0;
      font-size: 13px;
      color: var(--text-muted);
    }
  }

  &__actions {
    display: flex;
    gap: 8px;
  }
}

.planning-tabs {
  padding: 0 24px 12px;
  flex-shrink: 0;

  .planning-tab {
    display: inline-flex;
    align-items: center;
    padding: 6px 16px;
    height: 32px;
    border: none;
    background: transparent;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-muted);
    transition: all 0.2s ease;

    &:hover {
      color: var(--text-primary);
    }

    &--active {
      background: var(--bg-panel);
      color: var(--accent);
      font-weight: 600;
      box-shadow: var(--shadow-sm);
    }
  }
}

.planning-main {
  flex: 1;
  min-height: 0;
  padding: 0 24px 16px;
  display: flex;
  box-sizing: border-box;
  overflow: hidden;

  &--scroll {
    overflow-y: auto;
  }
}

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

    &:hover {
      background: var(--accent-hover);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &--ghost {
    background: var(--bg-panel);
    color: var(--text-secondary);
    border: 1px solid var(--border-color);

    &:hover {
      color: var(--accent);
      border-color: var(--accent);
    }
  }
}

.todo-create-form {
  display: flex;
  flex-direction: column;
  gap: 12px;

  .todo-create-options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;

    .todo-create-date { width: 200px; }
    .todo-create-priority { width: 120px; }
    .todo-create-group { min-width: 140px; flex: 1; }
    .planning-btn { margin-left: auto; }
  }
}
</style>
