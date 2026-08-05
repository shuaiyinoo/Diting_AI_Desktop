/**
 * Planning 事件广播
 *
 * 移植自 Proma 的 planning-events.ts。
 * 进程内订阅与 Renderer IPC 共用同一个失效出口。
 */

import { BrowserWindow } from 'electron'
import type { ActivePlanningReminder, PlanningAgentOperation, PlanningChange, PlanningChangeResource } from './types'
import { PLANNING_IPC_CHANNELS, AUTOMATION_IPC_CHANNELS } from './types'

const ALL_PLANNING_CHANGE_RESOURCES: PlanningChangeResource[] = [
  'todos', 'calendar_events', 'todo_groups', 'calendar_groups', 'tags', 'reminders',
]

const planningChangeListeners = new Set<(change: PlanningChange) => void>()

export function onPlanningChanged(listener: (change: PlanningChange) => void): () => void {
  planningChangeListeners.add(listener)
  return () => planningChangeListeners.delete(listener)
}

/** 广播资源级失效通知，使各窗口只刷新受影响的规划数据 */
export function broadcastPlanningChanged(
  resources: PlanningChangeResource[] = ALL_PLANNING_CHANGE_RESOURCES,
): void {
  const change: PlanningChange = { resources: [...new Set(resources)] }
  for (const listener of planningChangeListeners) listener(change)
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(PLANNING_IPC_CHANNELS.CHANGED, change)
    }
  }
}

/** 到期提醒独立事件 */
export function broadcastPlanningRemindersDue(reminders: ActivePlanningReminder[]): void {
  if (reminders.length === 0) return
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(PLANNING_IPC_CHANNELS.REMINDER_DUE, reminders)
    }
  }
}

/** 定时任务列表变更事件 */
export function broadcastAutomationsChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(AUTOMATION_IPC_CHANNELS.CHANGED)
    }
  }
}

/**
 * Pi Agent 成功创建、更新或删除 Todo/日程后，通知对应 Agent Session 显示确认 Toast。
 * 与通用 planning:changed 分离，避免用户手动修改日程时收到重复反馈。
 */
export function broadcastPlanningAgentOperation(operation: PlanningAgentOperation): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(PLANNING_IPC_CHANNELS.AGENT_OPERATION, operation)
    }
  }
}
