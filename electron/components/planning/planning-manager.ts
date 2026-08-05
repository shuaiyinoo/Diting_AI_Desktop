/**
 * 任务/日程 SQLite 数据层
 *
 * 移植自 Proma 的 planning-manager.ts，适配 Diting 的 better-sqlite3。
 * Todo 和日程是独立表；分组按 Todo / 日程隔离，标签与提醒在同一 planning.db 内。
 */

import { randomUUID } from 'crypto'
import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'
import { PLANNING_CONFLICT_ERROR } from './types'
import type {
  ActivePlanningReminder,
  CalendarEvent,
  CalendarEventListQuery,
  CreateCalendarEventInput,
  CreatePlanningGroupInput,
  CreatePlanningReminderInput,
  CreatePlanningTagInput,
  CreateTodoInput,
  PlanningGroup,
  PlanningGroupScope,
  PlanningReminder,
  PlanningReminderOrigin,
  PlanningReminderTargetType,
  PlanningTag,
  Todo,
  TodoListQuery,
  TodoSessionLink,
  UpdateCalendarEventInput,
  UpdatePlanningGroupInput,
  UpdatePlanningTagInput,
  UpdateTodoInput,
} from './types'

// ===== Database 初始化 =====

let database: Database.Database | null = null

function getDatabase(): Database.Database {
  if (database) return database
  const dir = join(app.getPath('home'), '.diting')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const dbPath = join(dir, 'planning.db')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS planning_groups (
      id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(name) BETWEEN 1 AND 100), color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS calendar_groups (
      id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(name) BETWEEN 1 AND 100), color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK(length(name) BETWEEN 1 AND 100), color TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 500), notes TEXT,
      status TEXT NOT NULL CHECK(status IN ('open', 'completed')), priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high')),
      due_at INTEGER, group_id TEXT REFERENCES planning_groups(id) ON DELETE SET NULL, workspace_id TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 500), notes TEXT, start_at INTEGER NOT NULL, end_at INTEGER,
      all_day INTEGER NOT NULL DEFAULT 0 CHECK(all_day IN (0, 1)), calendar_group_id TEXT REFERENCES calendar_groups(id) ON DELETE SET NULL,
      workspace_id TEXT, todo_id TEXT REFERENCES todos(id) ON DELETE SET NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      CHECK(end_at IS NULL OR end_at >= start_at)
    );
    CREATE TABLE IF NOT EXISTS todo_tags (
      todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY(todo_id, tag_id)
    );
    CREATE TABLE IF NOT EXISTS calendar_event_tags (
      calendar_event_id TEXT NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY(calendar_event_id, tag_id)
    );
    CREATE TABLE IF NOT EXISTS planning_reminders (
      id TEXT PRIMARY KEY, target_type TEXT NOT NULL CHECK(target_type IN ('todo', 'calendar_event')), target_id TEXT NOT NULL,
      trigger_at INTEGER NOT NULL, snoozed_until INTEGER, status TEXT NOT NULL CHECK(status IN ('pending', 'acknowledged', 'completed')),
      origin TEXT NOT NULL DEFAULT 'manual' CHECK(origin IN ('manual', 'todo_due_at')),
      acknowledged_at INTEGER, last_notified_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS todo_session_links (
      todo_id TEXT NOT NULL REFERENCES todos(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      first_touched_at INTEGER NOT NULL,
      last_touched_at INTEGER NOT NULL,
      PRIMARY KEY(todo_id, session_id)
    );
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS todos_status_due_at_idx ON todos(status, due_at);
    CREATE INDEX IF NOT EXISTS todos_group_id_idx ON todos(group_id);
    CREATE INDEX IF NOT EXISTS calendar_events_start_at_idx ON calendar_events(start_at);
    CREATE INDEX IF NOT EXISTS calendar_events_calendar_group_id_idx ON calendar_events(calendar_group_id);
    CREATE INDEX IF NOT EXISTS calendar_events_todo_id_idx ON calendar_events(todo_id);
    CREATE INDEX IF NOT EXISTS planning_reminders_due_idx ON planning_reminders(status, snoozed_until, trigger_at);
    CREATE INDEX IF NOT EXISTS planning_reminders_target_idx ON planning_reminders(target_type, target_id);
    CREATE INDEX IF NOT EXISTS todo_session_links_recent_idx ON todo_session_links(todo_id, last_touched_at DESC);
  `)
  database = db
  return db
}

// ===== Row 类型 =====

type TodoRow = {
  id: string; title: string; notes: string | null; status: 'open' | 'completed'; priority: 'low' | 'medium' | 'high'
  due_at: number | null; group_id: string | null; workspace_id: string | null
  created_at: number; updated_at: number; completed_at: number | null
}
type CalendarEventRow = {
  id: string; title: string; notes: string | null; start_at: number; end_at: number | null; all_day: number
  calendar_group_id: string | null; workspace_id: string | null; todo_id: string | null
  created_at: number; updated_at: number
}
type GroupRow = { id: string; name: string; color: string | null; sort_order: number; created_at: number; updated_at: number }
type TagRow = { id: string; name: string; color: string | null; created_at: number; updated_at: number }
type ReminderRow = {
  id: string; target_type: PlanningReminderTargetType; target_id: string; trigger_at: number; snoozed_until: number | null
  status: 'pending' | 'acknowledged' | 'completed'; origin: PlanningReminderOrigin; acknowledged_at: number | null; last_notified_at: number | null; created_at: number; updated_at: number
}
type TodoSessionLinkRow = { todo_id: string; session_id: string; first_touched_at: number; last_touched_at: number }

// ===== 工具函数 =====

function withPlanningTransaction<T>(work: () => T): T {
  const db = getDatabase()
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    try { db.exec('ROLLBACK') } catch { /* 事务已回滚 */ }
    throw error
  }
}

function assertText(value: string, field: string, max: number): string {
  const text = value.trim()
  if (!text || text.length > max) throw new Error(`${field}不能为空且不能超过 ${max} 字`)
  return text
}
function assertTitle(value: string, type: string): string { return assertText(value, `${type} 标题`, 500) }
function assertTimestamp(value: number | undefined, field: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new Error(`${field} 必须是有效时间戳`)
}
function normalizeLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) return undefined
  if (!Number.isInteger(limit) || limit < 1) throw new Error('limit 必须是正整数')
  return Math.min(limit, 500)
}
function groupTable(scope: PlanningGroupScope): 'planning_groups' | 'calendar_groups' {
  return scope === 'todo' ? 'planning_groups' : 'calendar_groups'
}
function groupFromRow(row: GroupRow, scope: PlanningGroupScope): PlanningGroup {
  return { id: row.id, scope, name: row.name, color: row.color ?? undefined, sortOrder: row.sort_order, createdAt: row.created_at, updatedAt: row.updated_at }
}
function tagFromRow(row: TagRow): PlanningTag {
  return { id: row.id, name: row.name, color: row.color ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at }
}
function reminderFromRow(row: ReminderRow): PlanningReminder {
  return { id: row.id, targetType: row.target_type, targetId: row.target_id, triggerAt: row.trigger_at, snoozedUntil: row.snoozed_until ?? undefined, status: row.status, origin: row.origin ?? 'manual', acknowledgedAt: row.acknowledged_at ?? undefined, lastNotifiedAt: row.last_notified_at ?? undefined, createdAt: row.created_at, updatedAt: row.updated_at }
}

// ===== 查询辅助 =====

function getPlanningGroup(id: string | null, scope: PlanningGroupScope): PlanningGroup | undefined {
  if (!id) return undefined
  const row = getDatabase().prepare(`SELECT * FROM ${groupTable(scope)} WHERE id = ?`).get(id) as GroupRow | undefined
  return row ? groupFromRow(row, scope) : undefined
}

function getTags(targetType: PlanningReminderTargetType, targetId: string): PlanningTag[] {
  const table = targetType === 'todo' ? 'todo_tags' : 'calendar_event_tags'
  const idColumn = targetType === 'todo' ? 'todo_id' : 'calendar_event_id'
  const rows = getDatabase().prepare(`SELECT tags.* FROM tags JOIN ${table} ON tags.id = ${table}.tag_id WHERE ${table}.${idColumn} = ? ORDER BY tags.name COLLATE NOCASE`).all(targetId) as TagRow[]
  return rows.map(tagFromRow)
}

function getReminders(targetType: PlanningReminderTargetType, targetId: string): PlanningReminder[] {
  const rows = getDatabase().prepare(`SELECT * FROM planning_reminders WHERE target_type = ? AND target_id = ? ORDER BY COALESCE(snoozed_until, trigger_at)`).all(targetType, targetId) as ReminderRow[]
  return rows.map(reminderFromRow)
}

function getTodoSessionLinks(todoId: string): TodoSessionLink[] {
  const rows = getDatabase().prepare('SELECT * FROM todo_session_links WHERE todo_id = ? ORDER BY last_touched_at DESC').all(todoId) as TodoSessionLinkRow[]
  return rows.map((row) => ({ sessionId: row.session_id, firstTouchedAt: row.first_touched_at, lastTouchedAt: row.last_touched_at }))
}

// ===== Todo CRUD =====

function todoFromRow(row: TodoRow): Todo {
  const group = getPlanningGroup(row.group_id, 'todo')
  const tags = getTags('todo', row.id)
  const reminders = getReminders('todo', row.id)
  const sessionLinks = getTodoSessionLinks(row.id)
  return {
    id: row.id, title: row.title, notes: row.notes ?? undefined,
    status: row.status, priority: row.priority, dueAt: row.due_at ?? undefined,
    groupId: row.group_id ?? undefined, group, tags, reminders, sessionLinks,
    workspaceId: row.workspace_id ?? undefined,
    createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at ?? undefined,
  }
}

export function listTodos(query?: TodoListQuery): Todo[] {
  const db = getDatabase()
  let sql = 'SELECT * FROM todos'
  const conditions: string[] = []
  const params: unknown[] = []
  if (query?.status) { conditions.push('status = ?'); params.push(query.status) }
  if (query?.dueBefore) { conditions.push('due_at <= ?'); params.push(query.dueBefore) }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')
  sql += ' ORDER BY created_at DESC'
  if (query?.limit) sql += ` LIMIT ${normalizeLimit(query.limit)}`
  const rows = db.prepare(sql).all(...params) as TodoRow[]
  return rows.map(todoFromRow)
}

export function getTodo(id: string): Todo | undefined {
  const row = getDatabase().prepare('SELECT * FROM todos WHERE id = ?').get(id) as TodoRow | undefined
  return row ? todoFromRow(row) : undefined
}

export function createTodo(input: CreateTodoInput): Todo {
  const now = Date.now()
  const id = randomUUID()
  return withPlanningTransaction(() => {
    const db = getDatabase()
    db.prepare(`INSERT INTO todos (id, title, notes, status, priority, due_at, group_id, workspace_id, created_at, updated_at)
      VALUES (@id, @title, @notes, @status, @priority, @due_at, @group_id, @workspace_id, @created_at, @updated_at)`).run({
      id,
      title: assertTitle(input.title, 'Todo'),
      notes: input.notes ?? null,
      status: 'open' as const,
      priority: input.priority ?? 'medium',
      due_at: input.dueAt ?? null,
      group_id: input.groupId ?? null,
      workspace_id: input.workspaceId ?? null,
      created_at: now,
      updated_at: now,
    })
    // 标签关联
    if (input.tagIds?.length) {
      const stmt = db.prepare('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)')
      for (const tagId of input.tagIds) stmt.run(id, tagId)
    }
    // 提醒
    if (input.reminders?.length) {
      const stmt = db.prepare(`INSERT INTO planning_reminders (id, target_type, target_id, trigger_at, status, origin, created_at, updated_at) VALUES (?, 'todo', ?, ?, 'pending', 'manual', ?, ?)`)
      for (const r of input.reminders) stmt.run(randomUUID(), id, r.triggerAt, now, now)
    }
    // 设置 dueAt 时自动创建提醒
    if (input.dueAt && !input.reminders?.length) {
      db.prepare(`INSERT INTO planning_reminders (id, target_type, target_id, trigger_at, status, origin, created_at, updated_at) VALUES (?, 'todo', ?, ?, 'pending', 'todo_due_at', ?, ?)`).run(randomUUID(), id, input.dueAt, now, now)
    }
    // 会话关联
    if (input.sessionId) {
      db.prepare('INSERT INTO todo_session_links (todo_id, session_id, first_touched_at, last_touched_at) VALUES (?, ?, ?, ?)').run(id, input.sessionId, now, now)
    }
    return getTodo(id)!
  })
}

export function updateTodo(input: UpdateTodoInput): Todo | undefined {
  return withPlanningTransaction(() => {
    const db = getDatabase()
    const existing = getTodo(input.id)
    if (!existing) return undefined
    if (input.expectedUpdatedAt !== undefined && existing.updatedAt !== input.expectedUpdatedAt) {
      throw new Error(PLANNING_CONFLICT_ERROR)
    }
    const now = Date.now()
    const updates: string[] = []
    const params: Record<string, unknown> = { id: input.id }
    if (input.title !== undefined) { updates.push('title = @title'); params.title = assertTitle(input.title, 'Todo') }
    if (input.notes !== undefined) { updates.push('notes = @notes'); params.notes = input.notes }
    if (input.priority !== undefined) { updates.push('priority = @priority'); params.priority = input.priority }
    if (input.dueAt !== undefined) { updates.push('due_at = @due_at'); params.due_at = input.dueAt }
    if (input.groupId !== undefined) { updates.push('group_id = @group_id'); params.group_id = input.groupId || null }
    if (input.workspaceId !== undefined) { updates.push('workspace_id = @workspace_id'); params.workspace_id = input.workspaceId || null }
    if (input.status !== undefined) {
      updates.push('status = @status'); params.status = input.status
      if (input.status === 'completed') {
        updates.push('completed_at = @completed_at'); params.completed_at = now
      } else {
        updates.push('completed_at = NULL')
      }
    }
    updates.push('updated_at = @updated_at'); params.updated_at = now
    if (updates.length > 1) {
      db.prepare(`UPDATE todos SET ${updates.join(', ')} WHERE id = @id`).run(params)
    }
    // 标签更新
    if (input.tagIds) {
      db.prepare('DELETE FROM todo_tags WHERE todo_id = ?').run(input.id)
      if (input.tagIds.length) {
        const stmt = db.prepare('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)')
        for (const tagId of input.tagIds) stmt.run(input.id, tagId)
      }
    }
    return getTodo(input.id)
  })
}

export function deleteTodo(id: string): boolean {
  const result = getDatabase().prepare('DELETE FROM todos WHERE id = ?').run(id)
  return result.changes > 0
}

/** 关联 Todo 与 Agent Session */
export function touchTodoSession(todoId: string, sessionId: string): void {
  const db = getDatabase()
  const now = Date.now()
  const existing = db.prepare('SELECT * FROM todo_session_links WHERE todo_id = ? AND session_id = ?').get(todoId, sessionId)
  if (existing) {
    db.prepare('UPDATE todo_session_links SET last_touched_at = ? WHERE todo_id = ? AND session_id = ?').run(now, todoId, sessionId)
  } else {
    db.prepare('INSERT INTO todo_session_links (todo_id, session_id, first_touched_at, last_touched_at) VALUES (?, ?, ?, ?)').run(todoId, sessionId, now, now)
  }
}

// ===== CalendarEvent CRUD =====

function calendarEventFromRow(row: CalendarEventRow): CalendarEvent {
  const group = getPlanningGroup(row.calendar_group_id, 'calendar')
  const tags = getTags('calendar_event', row.id)
  const reminders = getReminders('calendar_event', row.id)
  return {
    id: row.id, title: row.title, notes: row.notes ?? undefined,
    startAt: row.start_at, endAt: row.end_at ?? undefined, allDay: row.all_day === 1,
    groupId: row.calendar_group_id ?? undefined, group, tags, reminders,
    workspaceId: row.workspace_id ?? undefined, todoId: row.todo_id ?? undefined,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

export function listCalendarEvents(query?: CalendarEventListQuery): CalendarEvent[] {
  let sql = 'SELECT * FROM calendar_events'
  const conditions: string[] = []
  const params: unknown[] = []
  if (query?.from) { conditions.push('start_at >= ?'); params.push(query.from) }
  if (query?.to) { conditions.push('start_at <= ?'); params.push(query.to) }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ')
  sql += ' ORDER BY start_at ASC'
  if (query?.limit) sql += ` LIMIT ${normalizeLimit(query.limit)}`
  const rows = getDatabase().prepare(sql).all(...params) as CalendarEventRow[]
  return rows.map(calendarEventFromRow)
}

export function getCalendarEvent(id: string): CalendarEvent | undefined {
  const row = getDatabase().prepare('SELECT * FROM calendar_events WHERE id = ?').get(id) as CalendarEventRow | undefined
  return row ? calendarEventFromRow(row) : undefined
}

export function createCalendarEvent(input: CreateCalendarEventInput): CalendarEvent {
  const now = Date.now()
  const id = randomUUID()
  return withPlanningTransaction(() => {
    const db = getDatabase()
    db.prepare(`INSERT INTO calendar_events (id, title, notes, start_at, end_at, all_day, calendar_group_id, workspace_id, todo_id, created_at, updated_at)
      VALUES (@id, @title, @notes, @start_at, @end_at, @all_day, @calendar_group_id, @workspace_id, @todo_id, @created_at, @updated_at)`).run({
      id,
      title: assertTitle(input.title, '日程'),
      notes: input.notes ?? null,
      start_at: input.startAt,
      end_at: input.endAt ?? null,
      all_day: input.allDay ? 1 : 0,
      calendar_group_id: input.groupId ?? null,
      workspace_id: input.workspaceId ?? null,
      todo_id: input.todoId ?? null,
      created_at: now,
      updated_at: now,
    })
    if (input.tagIds?.length) {
      const stmt = db.prepare('INSERT INTO calendar_event_tags (calendar_event_id, tag_id) VALUES (?, ?)')
      for (const tagId of input.tagIds) stmt.run(id, tagId)
    }
    if (input.reminders?.length) {
      const stmt = db.prepare(`INSERT INTO planning_reminders (id, target_type, target_id, trigger_at, status, origin, created_at, updated_at) VALUES (?, 'calendar_event', ?, ?, 'pending', 'manual', ?, ?)`)
      for (const r of input.reminders) stmt.run(randomUUID(), id, r.triggerAt, now, now)
    }
    return getCalendarEvent(id)!
  })
}

export function updateCalendarEvent(input: UpdateCalendarEventInput): CalendarEvent | undefined {
  return withPlanningTransaction(() => {
    const db = getDatabase()
    const existing = getCalendarEvent(input.id)
    if (!existing) return undefined
    if (input.expectedUpdatedAt !== undefined && existing.updatedAt !== input.expectedUpdatedAt) {
      throw new Error(PLANNING_CONFLICT_ERROR)
    }
    const now = Date.now()
    const updates: string[] = []
    const params: Record<string, unknown> = { id: input.id }
    if (input.title !== undefined) { updates.push('title = @title'); params.title = assertTitle(input.title, '日程') }
    if (input.notes !== undefined) { updates.push('notes = @notes'); params.notes = input.notes }
    if (input.startAt !== undefined) { updates.push('start_at = @start_at'); params.start_at = input.startAt }
    if (input.endAt !== undefined) { updates.push('end_at = @end_at'); params.end_at = input.endAt }
    if (input.allDay !== undefined) { updates.push('all_day = @all_day'); params.all_day = input.allDay ? 1 : 0 }
    if (input.groupId !== undefined) { updates.push('calendar_group_id = @calendar_group_id'); params.calendar_group_id = input.groupId || null }
    if (input.workspaceId !== undefined) { updates.push('workspace_id = @workspace_id'); params.workspace_id = input.workspaceId || null }
    if (input.todoId !== undefined) { updates.push('todo_id = @todo_id'); params.todo_id = input.todoId || null }
    updates.push('updated_at = @updated_at'); params.updated_at = now
    if (updates.length > 1) {
      db.prepare(`UPDATE calendar_events SET ${updates.join(', ')} WHERE id = @id`).run(params)
    }
    if (input.tagIds) {
      db.prepare('DELETE FROM calendar_event_tags WHERE calendar_event_id = ?').run(input.id)
      if (input.tagIds.length) {
        const stmt = db.prepare('INSERT INTO calendar_event_tags (calendar_event_id, tag_id) VALUES (?, ?)')
        for (const tagId of input.tagIds) stmt.run(input.id, tagId)
      }
    }
    return getCalendarEvent(input.id)
  })
}

export function deleteCalendarEvent(id: string): boolean {
  const result = getDatabase().prepare('DELETE FROM calendar_events WHERE id = ?').run(id)
  return result.changes > 0
}

// ===== Group CRUD =====

export function listPlanningGroups(scope: PlanningGroupScope): PlanningGroup[] {
  const rows = getDatabase().prepare(`SELECT * FROM ${groupTable(scope)} ORDER BY sort_order ASC, name COLLATE NOCASE`).all() as GroupRow[]
  return rows.map((row) => groupFromRow(row, scope))
}

export function createPlanningGroup(input: CreatePlanningGroupInput): PlanningGroup {
  const now = Date.now()
  const id = randomUUID()
  const db = getDatabase()
  db.prepare(`INSERT INTO ${groupTable(input.scope)} (id, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    id, assertText(input.name, '分组名称', 100), input.color ?? null, input.sortOrder ?? 0, now, now,
  )
  return { id, scope: input.scope, name: input.name, color: input.color, sortOrder: input.sortOrder ?? 0, createdAt: now, updatedAt: now }
}

export function updatePlanningGroup(input: UpdatePlanningGroupInput): PlanningGroup | undefined {
  const db = getDatabase()
  const table = groupTable(input.scope)
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(input.id) as GroupRow | undefined
  if (!row) return undefined
  const now = Date.now()
  const updates: string[] = []
  const params: Record<string, unknown> = { id: input.id }
  if (input.name !== undefined) { updates.push('name = @name'); params.name = assertText(input.name, '分组名称', 100) }
  if (input.color !== undefined) { updates.push('color = @color'); params.color = input.color }
  if (input.sortOrder !== undefined) { updates.push('sort_order = @sort_order'); params.sort_order = input.sortOrder }
  updates.push('updated_at = @updated_at'); params.updated_at = now
  db.prepare(`UPDATE ${table} SET ${updates.join(', ')} WHERE id = @id`).run(params)
  const updated = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(input.id) as GroupRow
  return groupFromRow(updated, input.scope)
}

export function deletePlanningGroup(scope: PlanningGroupScope, id: string): boolean {
  const result = getDatabase().prepare(`DELETE FROM ${groupTable(scope)} WHERE id = ?`).run(id)
  return result.changes > 0
}

// ===== Tag CRUD =====

export function listPlanningTags(): PlanningTag[] {
  const rows = getDatabase().prepare('SELECT * FROM tags ORDER BY name COLLATE NOCASE').all() as TagRow[]
  return rows.map(tagFromRow)
}

// ===== Reminder =====

export function listActivePlanningReminders(): ActivePlanningReminder[] {
  const rows = getDatabase().prepare(`
    SELECT r.*, t.title AS target_title FROM planning_reminders r
    LEFT JOIN todos t ON r.target_type = 'todo' AND r.target_id = t.id
    LEFT JOIN calendar_events ce ON r.target_type = 'calendar_event' AND r.target_id = ce.id
    WHERE r.status = 'pending'
    ORDER BY COALESCE(r.snoozed_until, r.trigger_at) ASC
  `).all() as Array<ReminderRow & { target_title: string | null }>
  return rows.map((row) => {
    const reminder = reminderFromRow(row)
    const targetType = row.target_type
    const targetId = row.target_id
    const group = targetType === 'todo'
      ? getPlanningGroup((getDatabase().prepare('SELECT group_id FROM todos WHERE id = ?').get(targetId) as { group_id: string | null } | undefined)?.group_id, 'todo')
      : getPlanningGroup((getDatabase().prepare('SELECT calendar_group_id FROM calendar_events WHERE id = ?').get(targetId) as { calendar_group_id: string | null } | undefined)?.calendar_group_id, 'calendar')
    return {
      ...reminder,
      targetTitle: row.target_title ?? '已删除',
      group,
      tags: getTags(targetType, targetId),
    }
  })
}

/** 认领到期提醒（标记 lastNotifiedAt 并返回认领到的提醒） */
export function claimDuePlanningReminders(): ActivePlanningReminder[] {
  const now = Date.now()
  return withPlanningTransaction(() => {
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT r.*, t.title AS target_title FROM planning_reminders r
      LEFT JOIN todos t ON r.target_type = 'todo' AND r.target_id = t.id
      LEFT JOIN calendar_events ce ON r.target_type = 'calendar_event' AND r.target_id = ce.id
      WHERE r.status = 'pending' AND COALESCE(r.snoozed_until, r.trigger_at) <= ?
    `).all(now) as Array<ReminderRow & { target_title: string | null }>
    if (rows.length === 0) return []
    const update = db.prepare('UPDATE planning_reminders SET last_notified_at = ?, updated_at = ? WHERE id = ?')
    for (const row of rows) update.run(now, now, row.id)
    return rows.map((row) => {
      const reminder = reminderFromRow(row)
      const targetType = row.target_type
      const targetId = row.target_id
      return {
        ...reminder,
        targetTitle: row.target_title ?? '已删除',
        tags: getTags(targetType, targetId),
      }
    })
  })
}

export function acknowledgePlanningReminder(id: string): PlanningReminder | undefined {
  const now = Date.now()
  const db = getDatabase()
  db.prepare('UPDATE planning_reminders SET status = ?, acknowledged_at = ?, updated_at = ? WHERE id = ?').run('acknowledged', now, now, id)
  const row = db.prepare('SELECT * FROM planning_reminders WHERE id = ?').get(id) as ReminderRow | undefined
  return row ? reminderFromRow(row) : undefined
}

export function snoozePlanningReminder(id: string, minutes: number): PlanningReminder | undefined {
  const now = Date.now()
  const db = getDatabase()
  db.prepare('UPDATE planning_reminders SET snoozed_until = ?, updated_at = ? WHERE id = ?').run(now + minutes * 60_000, now, id)
  const row = db.prepare('SELECT * FROM planning_reminders WHERE id = ?').get(id) as ReminderRow | undefined
  return row ? reminderFromRow(row) : undefined
}

// ===== Tag CRUD（补齐 Agent 工具所需） =====

export function createPlanningTag(input: CreatePlanningTagInput): PlanningTag {
  const now = Date.now()
  const id = randomUUID()
  const db = getDatabase()
  db.prepare('INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    id, assertText(input.name, '标签名称', 100), input.color ?? null, now, now,
  )
  return { id, name: input.name, color: input.color, createdAt: now, updatedAt: now }
}

export function updatePlanningTag(input: UpdatePlanningTagInput): PlanningTag | undefined {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM tags WHERE id = ?').get(input.id) as TagRow | undefined
  if (!row) return undefined
  const now = Date.now()
  const updates: string[] = []
  const params: Record<string, unknown> = { id: input.id }
  if (input.name !== undefined) { updates.push('name = @name'); params.name = assertText(input.name, '标签名称', 100) }
  if (input.color !== undefined) { updates.push('color = @color'); params.color = input.color }
  updates.push('updated_at = @updated_at'); params.updated_at = now
  db.prepare(`UPDATE tags SET ${updates.join(', ')} WHERE id = @id`).run(params)
  const updated = db.prepare('SELECT * FROM tags WHERE id = ?').get(input.id) as TagRow
  return tagFromRow(updated)
}

export function deletePlanningTag(id: string): boolean {
  const result = getDatabase().prepare('DELETE FROM tags WHERE id = ?').run(id)
  return result.changes > 0
}

// ===== Reminder CRUD（补齐 Agent 工具所需） =====

export function createPlanningReminder(input: {
  targetType: PlanningReminderTargetType
  targetId: string
  triggerAt: number
}): PlanningReminder {
  const now = Date.now()
  const id = randomUUID()
  const db = getDatabase()
  db.prepare(`INSERT INTO planning_reminders (id, target_type, target_id, trigger_at, status, origin, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', 'manual', ?, ?)`).run(
    id, input.targetType, input.targetId, input.triggerAt, now, now,
  )
  return { id, targetType: input.targetType, targetId: input.targetId, triggerAt: input.triggerAt, status: 'pending', origin: 'manual', createdAt: now, updatedAt: now }
}

export function updatePlanningReminder(id: string, triggerAt: number): PlanningReminder | undefined {
  const now = Date.now()
  const db = getDatabase()
  db.prepare('UPDATE planning_reminders SET trigger_at = ?, updated_at = ? WHERE id = ? AND status = ?').run(triggerAt, now, id, 'pending')
  const row = db.prepare('SELECT * FROM planning_reminders WHERE id = ?').get(id) as ReminderRow | undefined
  return row ? reminderFromRow(row) : undefined
}

export function deletePlanningReminder(id: string): boolean {
  const result = getDatabase().prepare('DELETE FROM planning_reminders WHERE id = ?').run(id)
  return result.changes > 0
}

// ===== 规划数据导出（供 Agent 上下文注入） =====

export { PLANNING_CONFLICT_ERROR }
