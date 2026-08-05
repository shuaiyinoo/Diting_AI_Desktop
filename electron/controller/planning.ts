/**
 * 任务/日程/定时任务 控制器
 *
 * 提供 Planning + Automation 的 IPC 接口。
 * 通道格式：controller/planning/{method}
 */

import { BrowserWindow, ipcMain } from 'electron'
import { logger } from 'ee-core/log'
import {
  listTodos,
  getTodo,
  createTodo,
  updateTodo,
  deleteTodo,
  touchTodoSession,
  listCalendarEvents,
  getCalendarEvent,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listPlanningGroups,
  createPlanningGroup,
  updatePlanningGroup,
  deletePlanningGroup,
  listPlanningTags,
  createPlanningTag,
  updatePlanningTag,
  deletePlanningTag,
  listActivePlanningReminders,
  acknowledgePlanningReminder,
  snoozePlanningReminder,
  PLANNING_CONFLICT_ERROR,
} from '../components/planning/planning-manager'
import {
  listAutomations,
  getAutomation,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  computeNextRunAt,
} from '../components/planning/automation-manager'
import { runAutomationNow, triggerAutomationNow } from '../components/planning/automation-scheduler'
import { broadcastPlanningChanged, broadcastAutomationsChanged } from '../components/planning/planning-events'
import type {
  Todo,
  CalendarEvent,
  PlanningGroup,
  PlanningTag,
  ActivePlanningReminder,
  Automation,
  CreateTodoInput,
  UpdateTodoInput,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
  CreatePlanningGroupInput,
  UpdatePlanningGroupInput,
  CreateAutomationInput,
  UpdateAutomationInput,
  TodoListQuery,
  CalendarEventListQuery,
  PlanningGroupScope,
  CreatePlanningTagInput,
  UpdatePlanningTagInput,
} from '../components/planning/types'

// 延迟加载 createSession，避免循环依赖
let _createSession: any = null
function getCreateSession() {
  if (!_createSession) {
    const mod = require('../components/pi/adapters/pi-agent-service')
    _createSession = mod.createSession
  }
  return _createSession
}

class PlanningController {
  // ===== Todo =====

  async listTodos(args: { query?: TodoListQuery }): Promise<Todo[]> {
    return listTodos(args?.query)
  }

  async createTodo(args: CreateTodoInput): Promise<Todo> {
    if (!args?.title?.trim()) throw new Error('Todo 标题不能为空')
    const todo = createTodo(args)
    broadcastPlanningChanged(['todos', 'reminders'])
    return todo
  }

  async updateTodo(args: UpdateTodoInput): Promise<Todo | undefined> {
    const todo = updateTodo(args)
    if (todo) broadcastPlanningChanged(['todos', 'reminders'])
    return todo
  }

  async deleteTodo(args: { id: string }): Promise<boolean> {
    const ok = deleteTodo(args.id)
    if (ok) broadcastPlanningChanged(['todos', 'reminders'])
    return ok
  }

  async startTodoAgent(args: {
    todoId: string
    workspaceId: string
    expectedUpdatedAt: number
    channelId: string
    modelId?: string
  }): Promise<{ todo: Todo; session: any }> {
    const { todoId, workspaceId, expectedUpdatedAt, channelId, modelId } = args
    if (!todoId?.trim()) throw new Error('Todo id 必填')
    if (!workspaceId?.trim()) throw new Error('项目 id 必填')

    const existing = getTodo(todoId)
    if (!existing) throw new Error('Todo 不存在')
    if (existing.updatedAt !== expectedUpdatedAt) throw new Error(PLANNING_CONFLICT_ERROR)

    // 更新 Todo 项目归属
    const todo = updateTodo({ id: todoId, workspaceId, expectedUpdatedAt })
    if (!todo) throw new Error('Todo 更新失败')

    // 创建 Agent 会话，标题前缀「处理：」便于在会话列表中识别
    const session = getCreateSession()({ title: `处理：${todo.title}`, channelId, workspaceId })
    // 关联 Todo 与 Session
    touchTodoSession(todoId, session.id)

    broadcastPlanningChanged(['todos'])
    return { todo, session }
  }

  // ===== Calendar Event =====

  async listCalendarEvents(args: { query?: CalendarEventListQuery }): Promise<CalendarEvent[]> {
    return listCalendarEvents(args?.query)
  }

  async createCalendarEvent(args: CreateCalendarEventInput): Promise<CalendarEvent> {
    if (!args?.title?.trim()) throw new Error('日程标题不能为空')
    const event = createCalendarEvent(args)
    broadcastPlanningChanged(['calendar_events', 'reminders'])
    return event
  }

  async updateCalendarEvent(args: UpdateCalendarEventInput): Promise<CalendarEvent | undefined> {
    const event = updateCalendarEvent(args)
    if (event) broadcastPlanningChanged(['calendar_events', 'reminders'])
    return event
  }

  async deleteCalendarEvent(args: { id: string }): Promise<boolean> {
    const ok = deleteCalendarEvent(args.id)
    if (ok) broadcastPlanningChanged(['calendar_events', 'reminders'])
    return ok
  }

  // ===== Group =====

  async listGroups(args: { scope: PlanningGroupScope }): Promise<PlanningGroup[]> {
    return listPlanningGroups(args.scope)
  }

  async createGroup(args: CreatePlanningGroupInput): Promise<PlanningGroup> {
    const group = createPlanningGroup(args)
    broadcastPlanningChanged(args.scope === 'todo' ? ['todo_groups'] : ['calendar_groups'])
    return group
  }

  async updateGroup(args: UpdatePlanningGroupInput): Promise<PlanningGroup | undefined> {
    const group = updatePlanningGroup(args)
    if (group) broadcastPlanningChanged(args.scope === 'todo' ? ['todo_groups'] : ['calendar_groups'])
    return group
  }

  async deleteGroup(args: { scope: PlanningGroupScope; id: string }): Promise<boolean> {
    const ok = deletePlanningGroup(args.scope, args.id)
    if (ok) broadcastPlanningChanged(args.scope === 'todo' ? ['todo_groups'] : ['calendar_groups'])
    return ok
  }

  // ===== Tag =====

  async listTags(): Promise<PlanningTag[]> {
    return listPlanningTags()
  }

  async createTag(args: CreatePlanningTagInput): Promise<PlanningTag> {
    const tag = createPlanningTag(args)
    broadcastPlanningChanged(['tags'])
    return tag
  }

  async updateTag(args: UpdatePlanningTagInput): Promise<PlanningTag | undefined> {
    const tag = updatePlanningTag(args)
    broadcastPlanningChanged(['tags'])
    return tag
  }

  async deleteTag(args: { id: string }): Promise<boolean> {
    const ok = deletePlanningTag(args.id)
    if (ok) broadcastPlanningChanged(['tags'])
    return ok
  }

  // ===== Reminder =====

  async listActiveReminders(): Promise<ActivePlanningReminder[]> {
    return listActivePlanningReminders()
  }

  async acknowledgeReminder(args: { id: string }): Promise<any> {
    const reminder = acknowledgePlanningReminder(args.id)
    broadcastPlanningChanged(['reminders'])
    return reminder
  }

  async snoozeReminder(args: { id: string; minutes: number }): Promise<any> {
    const reminder = snoozePlanningReminder(args.id, args.minutes)
    broadcastPlanningChanged(['reminders'])
    return reminder
  }

  // ===== Automation =====

  async listAutomations(): Promise<Automation[]> {
    return listAutomations()
  }

  async createAutomation(args: CreateAutomationInput): Promise<Automation> {
    const automation = createAutomation(args)
    broadcastAutomationsChanged()
    return automation
  }

  async updateAutomation(args: UpdateAutomationInput): Promise<Automation | undefined> {
    const automation = updateAutomation(args)
    if (automation) broadcastAutomationsChanged()
    return automation
  }

  async deleteAutomation(args: { id: string }): Promise<boolean> {
    const ok = deleteAutomation(args.id)
    if (ok) broadcastAutomationsChanged()
    return ok
  }

  async toggleAutomation(args: { id: string; active: boolean }): Promise<Automation | undefined> {
    const automation = updateAutomation({ id: args.id, active: args.active })
    if (automation) broadcastAutomationsChanged()
    return automation
  }

  async runAutomationNow(args: { id: string }): Promise<{ sessionId?: string }> {
    // 异步触发，不等待执行完成，立即返回 sessionId
    const sessionId = await triggerAutomationNow(args.id)
    return { sessionId }
  }
}

export default PlanningController
