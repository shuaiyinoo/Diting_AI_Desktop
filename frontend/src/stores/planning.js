/**
 * 任务/日程/定时任务 状态管理
 *
 * 移植自 Proma 的 planning-atoms + automation-atoms，适配 Diting 的 Pinia。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'

export const usePlanningStore = defineStore('planning', () => {
  // ===== 当前 Tab =====
  const tab = ref('todos') // 'todos' | 'calendar' | 'automations'

  // ===== Todo 状态 =====
  const todos = ref([])
  const todoGroups = ref([])
  const tags = ref([])
  const selectedTodoId = ref(null)
  const todoCreateRequest = ref(0)
  const todoConflict = ref(false)

  // ===== 日程状态 =====
  const calendarEvents = ref([])
  const calendarGroups = ref([])
  const calendarCreateRequest = ref(0)

  // ===== 提醒状态 =====
  const activeReminders = ref([])

  // ===== 定时任务状态 =====
  const automations = ref([])
  const automationFormOpen = ref(false)
  const automationDraft = ref(null)

  // ===== Getters =====
  const selectedTodo = computed(() => todos.value.find((t) => t.id === selectedTodoId.value))
  const openTodos = computed(() => todos.value.filter((t) => t.status === 'open'))

  // ===== Actions: Todo =====

  async function loadTodos() {
    try {
      const data = await ipc.invoke(ipcApiRoute.planning.listTodos, {})
      todos.value = data || []
    } catch (err) {
      console.error('[planning] 加载 Todo 失败:', err)
    }
  }

  async function createTodo(input) {
    try {
      const todo = await ipc.invoke(ipcApiRoute.planning.createTodo, input)
      todos.value = [todo, ...todos.value]
      return todo
    } catch (err) {
      console.error('[planning] 创建 Todo 失败:', err)
      throw err
    }
  }

  async function updateTodo(input) {
    try {
      const todo = await ipc.invoke(ipcApiRoute.planning.updateTodo, input)
      if (todo) {
        todos.value = todos.value.map((t) => (t.id === todo.id ? todo : t))
      }
      return todo
    } catch (err) {
      if (err?.message?.includes('日程已被其他窗口修改')) {
        todoConflict.value = true
      }
      console.error('[planning] 更新 Todo 失败:', err)
      throw err
    }
  }

  async function deleteTodo(id) {
    try {
      await ipc.invoke(ipcApiRoute.planning.deleteTodo, { id })
      todos.value = todos.value.filter((t) => t.id !== id)
      if (selectedTodoId.value === id) selectedTodoId.value = null
    } catch (err) {
      console.error('[planning] 删除 Todo 失败:', err)
      throw err
    }
  }

  async function startTodoAgent(input) {
    try {
      const result = await ipc.invoke(ipcApiRoute.planning.startTodoAgent, input)
      if (result?.todo) {
        todos.value = todos.value.map((t) => (t.id === result.todo.id ? result.todo : t))
      }
      return result
    } catch (err) {
      console.error('[planning] 启动 Todo Agent 失败:', err)
      throw err
    }
  }

  // ===== Actions: Calendar =====

  async function loadCalendarEvents(query) {
    try {
      const data = await ipc.invoke(ipcApiRoute.planning.listCalendarEvents, { query })
      calendarEvents.value = data || []
    } catch (err) {
      console.error('[planning] 加载日程失败:', err)
    }
  }

  async function createCalendarEvent(input) {
    try {
      const event = await ipc.invoke(ipcApiRoute.planning.createCalendarEvent, input)
      calendarEvents.value = [...calendarEvents.value, event]
      return event
    } catch (err) {
      console.error('[planning] 创建日程失败:', err)
      throw err
    }
  }

  async function updateCalendarEvent(input) {
    try {
      const event = await ipc.invoke(ipcApiRoute.planning.updateCalendarEvent, input)
      if (event) {
        calendarEvents.value = calendarEvents.value.map((e) => (e.id === event.id ? event : e))
      }
      return event
    } catch (err) {
      console.error('[planning] 更新日程失败:', err)
      throw err
    }
  }

  async function deleteCalendarEvent(id) {
    try {
      await ipc.invoke(ipcApiRoute.planning.deleteCalendarEvent, { id })
      calendarEvents.value = calendarEvents.value.filter((e) => e.id !== id)
    } catch (err) {
      console.error('[planning] 删除日程失败:', err)
      throw err
    }
  }

  // ===== Actions: Group =====

  async function loadGroups(scope) {
    try {
      const data = await ipc.invoke(ipcApiRoute.planning.listGroups, { scope })
      if (scope === 'todo') todoGroups.value = data || []
      else calendarGroups.value = data || []
      return data
    } catch (err) {
      console.error('[planning] 加载分组失败:', err)
    }
  }

  async function createGroup(input) {
    try {
      const group = await ipc.invoke(ipcApiRoute.planning.createGroup, input)
      if (input.scope === 'todo') {
        todoGroups.value = [...todoGroups.value, group].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-CN'))
      } else {
        calendarGroups.value = [...calendarGroups.value, group].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-CN'))
      }
      return group
    } catch (err) {
      console.error('[planning] 创建分组失败:', err)
      throw err
    }
  }

  async function updateGroup(input) {
    try {
      const group = await ipc.invoke(ipcApiRoute.planning.updateGroup, input)
      if (group) {
        if (input.scope === 'todo') {
          todoGroups.value = todoGroups.value.map((g) => (g.id === group.id ? group : g))
          // 同步更新关联 Todo 的 group 引用
          todos.value = todos.value.map((t) => (t.groupId === group.id ? { ...t, group } : t))
        } else {
          calendarGroups.value = calendarGroups.value.map((g) => (g.id === group.id ? group : g))
          calendarEvents.value = calendarEvents.value.map((e) => (e.groupId === group.id ? { ...e, group } : e))
        }
      }
      return group
    } catch (err) {
      console.error('[planning] 更新分组失败:', err)
      throw err
    }
  }

  async function deleteGroup(scope, id) {
    try {
      await ipc.invoke(ipcApiRoute.planning.deleteGroup, { scope, id })
      if (scope === 'todo') {
        todoGroups.value = todoGroups.value.filter((g) => g.id !== id)
        // 删除分组后，关联 Todo 变为未分组（数据库 ON DELETE SET NULL 已处理，前端同步状态）
        todos.value = todos.value.map((t) => (t.groupId === id ? { ...t, groupId: undefined, group: undefined } : t))
      } else {
        calendarGroups.value = calendarGroups.value.filter((g) => g.id !== id)
        calendarEvents.value = calendarEvents.value.map((e) => (e.groupId === id ? { ...e, groupId: undefined, group: undefined } : e))
      }
    } catch (err) {
      console.error('[planning] 删除分组失败:', err)
      throw err
    }
  }

  // ===== Actions: Tag =====

  async function loadTags() {
    try {
      const data = await ipc.invoke(ipcApiRoute.planning.listTags)
      tags.value = data || []
    } catch (err) {
      console.error('[planning] 加载标签失败:', err)
    }
  }

  async function createTag(input) {
    try {
      const tag = await ipc.invoke(ipcApiRoute.planning.createTag, input)
      tags.value = [...tags.value, tag].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
      return tag
    } catch (err) {
      console.error('[planning] 创建标签失败:', err)
      throw err
    }
  }

  async function deleteTag(id) {
    try {
      await ipc.invoke(ipcApiRoute.planning.deleteTag, { id })
      tags.value = tags.value.filter((t) => t.id !== id)
      // 同步移除 Todo / Calendar 上关联的标签引用
      todos.value = todos.value.map((t) => ({ ...t, tags: (t.tags || []).filter((tag) => tag.id !== id) }))
      calendarEvents.value = calendarEvents.value.map((e) => ({ ...e, tags: (e.tags || []).filter((tag) => tag.id !== id) }))
    } catch (err) {
      console.error('[planning] 删除标签失败:', err)
      throw err
    }
  }

  // ===== Actions: Reminder =====

  async function loadActiveReminders() {
    try {
      const data = await ipc.invoke(ipcApiRoute.planning.listActiveReminders)
      activeReminders.value = data || []
    } catch (err) {
      console.error('[planning] 加载提醒失败:', err)
    }
  }

  async function acknowledgeReminder(id) {
    try {
      await ipc.invoke(ipcApiRoute.planning.acknowledgeReminder, { id })
      activeReminders.value = activeReminders.value.filter((r) => r.id !== id)
    } catch (err) {
      console.error('[planning] 确认提醒失败:', err)
    }
  }

  async function snoozeReminder(id, minutes) {
    try {
      await ipc.invoke(ipcApiRoute.planning.snoozeReminder, { id, minutes })
      await loadActiveReminders()
    } catch (err) {
      console.error('[planning] 推迟提醒失败:', err)
    }
  }

  // ===== Actions: Automation =====

  async function loadAutomations() {
    try {
      const data = await ipc.invoke(ipcApiRoute.planning.listAutomations)
      automations.value = data || []
    } catch (err) {
      console.error('[planning] 加载定时任务失败:', err)
    }
  }

  async function createAutomation(input) {
    try {
      const automation = await ipc.invoke(ipcApiRoute.planning.createAutomation, input)
      automations.value = [...automations.value, automation]
      return automation
    } catch (err) {
      console.error('[planning] 创建定时任务失败:', err)
      throw err
    }
  }

  async function updateAutomation(input) {
    try {
      const automation = await ipc.invoke(ipcApiRoute.planning.updateAutomation, input)
      if (automation) {
        automations.value = automations.value.map((a) => (a.id === automation.id ? automation : a))
      }
      return automation
    } catch (err) {
      console.error('[planning] 更新定时任务失败:', err)
      throw err
    }
  }

  async function deleteAutomation(id) {
    try {
      await ipc.invoke(ipcApiRoute.planning.deleteAutomation, { id })
      automations.value = automations.value.filter((a) => a.id !== id)
    } catch (err) {
      console.error('[planning] 删除定时任务失败:', err)
      throw err
    }
  }

  async function toggleAutomation(id, active) {
    try {
      const automation = await ipc.invoke(ipcApiRoute.planning.toggleAutomation, { id, active })
      if (automation) {
        automations.value = automations.value.map((a) => (a.id === automation.id ? automation : a))
      }
      return automation
    } catch (err) {
      console.error('[planning] 切换定时任务失败:', err)
      throw err
    }
  }

  async function runAutomationNow(id) {
    try {
      const result = await ipc.invoke(ipcApiRoute.planning.runAutomationNow, { id })
      return result?.sessionId
    } catch (err) {
      console.error('[planning] 立即运行失败:', err)
      throw err
    }
  }

  // ===== 表单草稿 =====

  function createEmptyDraft() {
    return {
      name: '',
      prompt: '',
      scheduleType: 'interval',
      intervalMinutes: 10,
      timeOfDay: '09:00',
      dayOfWeek: 1,
      dayOfMonth: 1,
      scheduledAt: undefined,
      maxRuns: undefined,
      channelId: '',
      modelId: undefined,
      workspaceId: undefined,
      permissionMode: 'bypassPermissions',
      sessionMode: 'daily',
      sourceSessionId: undefined,
      active: true,
    }
  }

  function automationToDraft(a) {
    return {
      id: a.id,
      name: a.name,
      prompt: a.prompt,
      scheduleType: a.scheduleType,
      intervalMinutes: a.intervalMinutes,
      timeOfDay: a.timeOfDay,
      dayOfWeek: a.dayOfWeek,
      dayOfMonth: a.dayOfMonth,
      scheduledAt: a.scheduledAt,
      maxRuns: a.maxRuns,
      channelId: a.channelId,
      modelId: a.modelId,
      workspaceId: a.workspaceId,
      permissionMode: a.permissionMode ?? 'bypassPermissions',
      sessionMode: a.sessionMode ?? 'daily',
      sourceSessionId: a.sourceSessionId,
      active: a.active,
    }
  }

  // ===== IPC 事件监听（Agent 修改数据后自动刷新） =====

  let _ipcListenersRegistered = false
  function registerIpcListeners() {
    if (_ipcListenersRegistered) return
    _ipcListenersRegistered = true

    // 定时任务变更 → 重新加载列表
    if (ipc) {
      ipc.on('automation:changed', () => {
        loadAutomations()
      })
      // 规划数据变更（Todo/日程等）
      ipc.on('planning:changed', () => {
        loadTodos()
        loadCalendarEvents()
        loadGroups('todo')
        loadGroups('calendar')
        loadTags()
        loadActiveReminders()
      })
    }
  }

  // ===== 初始化 =====

  async function loadAll() {
    registerIpcListeners()
    await Promise.all([
      loadTodos(),
      loadCalendarEvents(),
      loadGroups('todo'),
      loadGroups('calendar'),
      loadTags(),
      loadActiveReminders(),
      loadAutomations(),
    ])
  }

  return {
    // 状态
    tab,
    todos,
    todoGroups,
    tags,
    selectedTodoId,
    todoConflict,
    calendarEvents,
    calendarGroups,
    activeReminders,
    automations,
    automationFormOpen,
    automationDraft,
    todoCreateRequest,
    calendarCreateRequest,
    // Getters
    selectedTodo,
    openTodos,
    // Actions
    loadAll,
    loadTodos,
    createTodo,
    updateTodo,
    deleteTodo,
    startTodoAgent,
    loadCalendarEvents,
    createCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    loadGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    loadTags,
    createTag,
    deleteTag,
    loadActiveReminders,
    acknowledgeReminder,
    snoozeReminder,
    loadAutomations,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    toggleAutomation,
    runAutomationNow,
    createEmptyDraft,
    automationToDraft,
  }
})
