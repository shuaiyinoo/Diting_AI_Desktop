/**
 * 任务/日程/定时任务 类型定义
 *
 * 移植自 Proma 的 planning + automation 类型，适配 Diting 架构。
 * 只保留 Pi Agent SDK 相关部分，舍弃 Claude / 飞书通知 / 独立窗口等。
 */

// ===== Todo =====

export type TodoStatus = 'open' | 'completed'
export type TodoPriority = 'low' | 'medium' | 'high'
export type PlanningGroupScope = 'todo' | 'calendar'
export type PlanningReminderTargetType = 'todo' | 'calendar_event'
export type PlanningReminderStatus = 'pending' | 'acknowledged' | 'completed'
export type PlanningReminderOrigin = 'manual' | 'todo_due_at'

/** 跨窗口并发冲突错误标识 */
export const PLANNING_CONFLICT_ERROR = '日程已被其他窗口修改，请重新加载后再试'

/** planning:changed 资源级失效通知 */
export type PlanningChangeResource = 'todos' | 'calendar_events' | 'todo_groups' | 'calendar_groups' | 'tags' | 'reminders'

export interface PlanningChange {
  resources: PlanningChangeResource[]
}

export interface PlanningGroup {
  id: string
  scope: PlanningGroupScope
  name: string
  color?: string
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface PlanningTag {
  id: string
  name: string
  color?: string
  createdAt: number
  updatedAt: number
}

export interface TodoSessionLink {
  sessionId: string
  firstTouchedAt: number
  lastTouchedAt: number
}

export interface PlanningReminder {
  id: string
  targetType: PlanningReminderTargetType
  targetId: string
  triggerAt: number
  snoozedUntil?: number
  status: PlanningReminderStatus
  origin: PlanningReminderOrigin
  acknowledgedAt?: number
  lastNotifiedAt?: number
  createdAt: number
  updatedAt: number
}

export interface ActivePlanningReminder extends PlanningReminder {
  targetTitle: string
  group?: PlanningGroup
  tags: PlanningTag[]
}

export interface Todo {
  id: string
  title: string
  notes?: string
  status: TodoStatus
  priority: TodoPriority
  dueAt?: number
  groupId?: string
  group?: PlanningGroup
  tags: PlanningTag[]
  reminders: PlanningReminder[]
  sessionLinks: TodoSessionLink[]
  workspaceId?: string
  createdAt: number
  updatedAt: number
  completedAt?: number
}

export interface CalendarEvent {
  id: string
  title: string
  notes?: string
  startAt: number
  endAt?: number
  allDay: boolean
  groupId?: string
  group?: PlanningGroup
  tags: PlanningTag[]
  reminders: PlanningReminder[]
  workspaceId?: string
  todoId?: string
  createdAt: number
  updatedAt: number
}

// ===== Input/Query 类型 =====

export interface TodoListQuery {
  status?: TodoStatus
  dueBefore?: number
  limit?: number
}

export interface CalendarEventListQuery {
  from?: number
  to?: number
  limit?: number
}

export interface CreatePlanningReminderInput {
  triggerAt: number
}

export interface CreateTodoInput {
  title: string
  notes?: string
  priority?: TodoPriority
  dueAt?: number
  groupId?: string
  tagIds?: string[]
  reminders?: CreatePlanningReminderInput[]
  sessionId?: string
  workspaceId?: string
}

export interface UpdateTodoInput {
  id: string
  title?: string
  notes?: string
  priority?: TodoPriority
  dueAt?: number | null
  groupId?: string | null
  tagIds?: string[]
  workspaceId?: string | null
  expectedUpdatedAt?: number
  status?: TodoStatus
}

export interface CreateCalendarEventInput {
  title: string
  notes?: string
  startAt: number
  endAt?: number
  allDay?: boolean
  groupId?: string
  tagIds?: string[]
  reminders?: CreatePlanningReminderInput[]
  workspaceId?: string
  todoId?: string
}

export interface UpdateCalendarEventInput {
  id: string
  title?: string
  notes?: string
  startAt?: number
  endAt?: number | null
  allDay?: boolean
  groupId?: string | null
  tagIds?: string[]
  workspaceId?: string | null
  todoId?: string | null
  expectedUpdatedAt?: number
}

export interface CreatePlanningGroupInput {
  scope: PlanningGroupScope
  name: string
  color?: string
  sortOrder?: number
}

export interface UpdatePlanningGroupInput {
  id: string
  scope: PlanningGroupScope
  name?: string
  color?: string | null
  sortOrder?: number
}

export interface SnoozePlanningReminderInput {
  id: string
  minutes: number
}

/** Pi Agent 成功修改本地规划数据后，供对应 Agent 会话展示即时反馈 */
export interface PlanningAgentOperation {
  sessionId: string
  target: 'todo' | 'calendar_event'
  action: 'created' | 'updated' | 'deleted'
  title: string
}

export interface CreatePlanningTagInput {
  name: string
  color?: string
}

export interface UpdatePlanningTagInput {
  id: string
  name?: string
  color?: string | null
}

// ===== Automation（定时任务）=====

export interface AutomationRun {
  runAt: number
  sessionId: string
  status: 'success' | 'error' | 'skipped'
  durationMs?: number
  error?: string
  skipReason?: string
}

export type AutomationScheduleType = 'interval' | 'daily' | 'weekly' | 'monthly' | 'once'
export type AutomationPermissionMode = 'bypassPermissions'
export type AutomationSessionMode = 'daily' | 'reuse'

export const AUTOMATION_DEFAULT_PERMISSION_MODE: AutomationPermissionMode = 'bypassPermissions'
export const AUTOMATION_DEFAULT_SESSION_MODE: AutomationSessionMode = 'daily'
export const AUTOMATION_MAX_HISTORY = 20
export const AUTOMATION_MAX_CONSECUTIVE_FAILURES = 5

export interface Automation {
  id: string
  name: string
  prompt: string
  active: boolean
  scheduleType: AutomationScheduleType
  intervalMinutes: number
  timeOfDay?: string
  dayOfWeek?: number
  dayOfMonth?: number
  scheduledAt?: number
  maxRuns?: number
  channelId: string
  modelId?: string
  workspaceId?: string
  permissionMode?: AutomationPermissionMode
  sessionMode?: AutomationSessionMode
  sourceSessionId?: string
  createdAt: number
  updatedAt: number
  nextRunAt: number
  lastSessionId?: string
  lastRunAt?: number
  consecutiveFailures?: number
  runCount?: number
  completedAt?: number
  runHistory: AutomationRun[]
}

export interface CreateAutomationInput {
  name: string
  prompt: string
  scheduleType: AutomationScheduleType
  intervalMinutes: number
  timeOfDay?: string
  dayOfWeek?: number
  dayOfMonth?: number
  scheduledAt?: number
  maxRuns?: number
  channelId: string
  modelId?: string
  workspaceId?: string
  permissionMode?: AutomationPermissionMode
  sessionMode?: AutomationSessionMode
  sourceSessionId?: string
  active?: boolean
}

export interface UpdateAutomationInput {
  id: string
  name?: string
  prompt?: string
  scheduleType?: AutomationScheduleType
  intervalMinutes?: number
  timeOfDay?: string
  dayOfWeek?: number
  dayOfMonth?: number
  scheduledAt?: number
  maxRuns?: number
  channelId?: string
  modelId?: string
  workspaceId?: string
  permissionMode?: AutomationPermissionMode
  sessionMode?: AutomationSessionMode
  active?: boolean
}

// ===== IPC 通道常量 =====

export const PLANNING_IPC_CHANNELS = {
  LIST_TODOS: 'planning:list-todos',
  CREATE_TODO: 'planning:create-todo',
  START_TODO_AGENT: 'planning:start-todo-agent',
  UPDATE_TODO: 'planning:update-todo',
  DELETE_TODO: 'planning:delete-todo',
  LIST_CALENDAR_EVENTS: 'planning:list-calendar-events',
  CREATE_CALENDAR_EVENT: 'planning:create-calendar-event',
  UPDATE_CALENDAR_EVENT: 'planning:update-calendar-event',
  DELETE_CALENDAR_EVENT: 'planning:delete-calendar-event',
  LIST_GROUPS: 'planning:list-groups',
  CREATE_GROUP: 'planning:create-group',
  UPDATE_GROUP: 'planning:update-group',
  DELETE_GROUP: 'planning:delete-group',
  LIST_TAGS: 'planning:list-tags',
  LIST_ACTIVE_REMINDERS: 'planning:list-active-reminders',
  ACKNOWLEDGE_REMINDER: 'planning:acknowledge-reminder',
  SNOOZE_REMINDER: 'planning:snooze-reminder',
  REMINDER_DUE: 'planning:reminder-due',
  CHANGED: 'planning:changed',
  AGENT_OPERATION: 'planning:agent-operation',
} as const

export const AUTOMATION_IPC_CHANNELS = {
  LIST: 'automation:list',
  CREATE: 'automation:create',
  UPDATE: 'automation:update',
  DELETE: 'automation:delete',
  TOGGLE: 'automation:toggle',
  RUN_NOW: 'automation:run-now',
  CHANGED: 'automation:changed',
} as const
