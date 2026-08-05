/**
 * 本地任务/日程提醒调度器
 *
 * 移植自 Proma 的 planning-reminder-scheduler.ts。
 * 只在 Electron 主进程存活时运行。每条提醒在首次到期及每次推迟重新到期时各通知一次。
 */

import { BrowserWindow, Notification } from 'electron'
import { claimDuePlanningReminders } from './planning-manager'
import { broadcastPlanningChanged, broadcastPlanningRemindersDue } from './planning-events'

const POLL_INTERVAL_MS = 30_000
let timer: ReturnType<typeof setInterval> | null = null
let checking = false

function showPlanningSystemNotification(reminder: { targetType: string; targetTitle: string; id: string }): void {
  if (!Notification.isSupported()) return
  const notification = new Notification({
    title: reminder.targetType === 'todo' ? 'Todo 提醒' : '日程提醒',
    body: reminder.targetTitle,
    silent: true,
  })
  notification.on('click', () => {
    const window = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed())
    if (!window) return
    window.show()
    window.focus()
  })
  notification.show()
}

function checkDueReminders(): void {
  if (checking) return
  checking = true
  try {
    const reminders = claimDuePlanningReminders()
    if (reminders.length > 0) {
      for (const reminder of reminders) {
        showPlanningSystemNotification(reminder)
      }
      broadcastPlanningRemindersDue(reminders)
      broadcastPlanningChanged(['reminders'])
    }
  } catch (error) {
    console.error('[任务/日程] 检查提醒失败:', error)
  } finally {
    checking = false
  }
}

export function startPlanningReminderScheduler(): void {
  if (timer) return
  checkDueReminders()
  timer = setInterval(checkDueReminders, POLL_INTERVAL_MS)
  console.log(`[任务/日程] 提醒调度器已启动，轮询周期 ${POLL_INTERVAL_MS / 1000}s`)
}

export function stopPlanningReminderScheduler(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}
