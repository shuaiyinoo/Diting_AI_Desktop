/**
 * 定时任务（Automation）调度器
 *
 * 移植自 Proma 的 automation-scheduler.ts，适配 Diting 的 Pi Agent SDK。
 * 核心设计：
 * - 用「下次触发时间戳 + 短 tick 轮询」而非长 setInterval，避免系统休眠漂移
 * - 子会话归属按 sessionMode 决定（daily=同日复用 / reuse=始终复用）
 * - 强制 bypassPermissions，无人值守时不阻塞
 * - 来源/目标会话忙时跳过本轮
 * - 连续失败达上限自动暂停
 * - 启动时恢复：过期 nextRunAt 顺延，避免雪崩触发
 */

import { BrowserWindow, Notification } from 'electron'
import {
  AUTOMATION_MAX_CONSECUTIVE_FAILURES,
  AUTOMATION_DEFAULT_SESSION_MODE,
  AUTOMATION_IPC_CHANNELS,
  type Automation,
  type AutomationRun,
} from './types'
import {
  listAutomations,
  getAutomation,
  appendRun,
  updateAutomation,
  setNextRunAt,
  setLastSessionId,
  computeNextRunAt,
} from './automation-manager'
import { broadcastAutomationsChanged } from './planning-events'
// 注意：不使用顶层 import 以避免与 pi-agent-service 的循环依赖
// createSession / listSessions / sendAgentMessage 改为函数内 lazy require

const TICK_INTERVAL_MS = 30_000
const RUN_TIMEOUT_MS = 2 * 60 * 60 * 1000

function isSameLocalDay(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

function formatScheduleLabel(a: Automation): string {
  if (a.scheduleType === 'once') {
    const when = a.scheduledAt ? new Date(a.scheduledAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '指定时间'
    return `仅运行一次（${when}）`
  }
  if (a.scheduleType === 'daily') return `每天 ${a.timeOfDay ?? '09:00'}`
  if (a.scheduleType === 'weekly') {
    const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return `每${names[a.dayOfWeek ?? 1]} ${a.timeOfDay ?? '09:00'}`
  }
  if (a.scheduleType === 'monthly') return `每月 ${a.dayOfMonth ?? 1} 号 ${a.timeOfDay ?? '09:00'}`
  const min = a.intervalMinutes
  if (min < 60) return `每 ${min} 分钟`
  if (min < 1440) return `每 ${min / 60} 小时`
  return `每 ${min / 1440} 天`
}

let tickTimer: NodeJS.Timeout | undefined
const runningAutomations = new Set<string>()

export async function runAutomation(automation: Automation, manual = false): Promise<void> {
  if (runningAutomations.has(automation.id)) {
    console.log(`[定时任务] ${automation.name} 上一轮尚未结束，跳过本轮`)
    appendRun(automation.id, { runAt: Date.now(), sessionId: '', status: 'skipped', skipReason: '上一轮尚未结束' })
    broadcastAutomationsChanged()
    return
  }
  runningAutomations.add(automation.id)
  const runAt = Date.now()

  try {
    const sessionMode = automation.sessionMode ?? AUTOMATION_DEFAULT_SESSION_MODE

    // 决定是否复用上次会话
    let reuseSessionId: string | undefined
    if (automation.lastSessionId) {
      const { listSessions } = require('../pi/adapters/pi-agent-service')
      const sessions = listSessions()
      const lastSession = sessions.find((s) => s.id === automation.lastSessionId)
      if (lastSession && !lastSession.automationGraduated) {
        if (sessionMode === 'reuse') {
          reuseSessionId = automation.lastSessionId
        } else if (sessionMode === 'daily' && automation.lastRunAt && isSameLocalDay(automation.lastRunAt, runAt)) {
          reuseSessionId = automation.lastSessionId
        }
      }
    }

    let targetSessionId: string
    if (reuseSessionId) {
      targetSessionId = reuseSessionId
    } else {
      const { createSession } = require('../pi/adapters/pi-agent-service')
      const created = createSession({ title: automation.name, channelId: automation.channelId, workspaceId: automation.workspaceId })
      targetSessionId = created.id
      setLastSessionId(automation.id, created.id)
    }

    await new Promise<void>((resolveRun) => {
      let settled = false
      const finish = (status: 'success' | 'error', error?: string): void => {
        if (settled) return
        settled = true
        if (timeoutTimer) clearTimeout(timeoutTimer)
        const run: AutomationRun = { runAt, sessionId: targetSessionId, status, durationMs: Date.now() - runAt, error }
        appendRun(automation.id, run)
        broadcastAutomationsChanged()
        // 失败退避
        const latest = getAutomation(automation.id)
        if (latest && latest.active && (latest.consecutiveFailures ?? 0) >= AUTOMATION_MAX_CONSECUTIVE_FAILURES) {
          updateAutomation({ id: automation.id, active: false })
          console.warn(`[定时任务] ${automation.name} 连续失败 ${latest.consecutiveFailures} 次，已自动暂停`)
          broadcastAutomationsChanged()
        }
        // 系统通知
        if (Notification.isSupported()) {
          const notif = new Notification({
            title: `定时任务: ${automation.name}`,
            body: status === 'success' ? '执行完成' : `执行失败: ${error ?? '未知错误'}`,
            silent: true,
          })
          notif.on('click', () => {
            const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
            if (win) { win.show(); win.focus() }
          })
          notif.show()
        }
        resolveRun()
      }

      const timeoutTimer = setTimeout(() => {
        finish('error', `执行超时（超过 ${RUN_TIMEOUT_MS / 3600_000} 小时）`)
      }, RUN_TIMEOUT_MS)

      // 调用 Pi Agent 发送消息（headless 模式）
      // 需要 4 个参数：input、channel、workspace、onEvent 回调
      const { sendAgentMessage } = require('../pi/adapters/pi-agent-service')
      const { getWorkspace } = require('../pi/adapters/workspace-manager')
      const { llmdbService } = require('../../service/database/llmdb')

      // 从数据库获取渠道配置
      const modelRecord = llmdbService.getModelById(Number(automation.channelId))
      if (!modelRecord) {
        throw new Error(`渠道不存在: ${automation.channelId}`)
      }
      const channel = {
        id: String(modelRecord.id),
        name: modelRecord.name,
        provider: modelRecord.provider,
        modelId: modelRecord.model_name,
        apiKey: modelRecord.api_key || '',
        baseUrl: modelRecord.base_url || '',
        enabled: true,
      }

      // 获取工作区
      const workspace = getWorkspace(automation.workspaceId)

      // headless 模式：onEvent 回调仅记录日志，不转发到前端
      const onEvent = (event: string, data: unknown) => {
        // 仅记录关键事件
        if (event === 'error' || event === 'done') {
          console.log(`[定时任务] ${automation.name} 事件: ${event}`, data)
        }
      }

      sendAgentMessage(
        {
          sessionId: targetSessionId,
          message: automation.prompt + '\n<!--DITING_SCHEDULED_RUN-->',
          channelId: channel.id,
          workspaceId: automation.workspaceId,
          permissionMode: 'bypassPermissions',
        },
        channel,
        workspace ?? undefined,
        onEvent,
      ).then(() => {
        finish('success')
      }).catch((err: unknown) => {
        finish('error', err instanceof Error ? err.message : '未知错误')
      })
    })
  } catch (err) {
    console.error(`[定时任务] ${automation.name} 执行异常:`, err)
    const run: AutomationRun = {
      runAt, sessionId: '', status: 'error',
      durationMs: Date.now() - runAt,
      error: err instanceof Error ? err.message : '未知错误',
    }
    appendRun(automation.id, run)
    broadcastAutomationsChanged()
  } finally {
    runningAutomations.delete(automation.id)
  }
}

export async function runAutomationNow(id: string): Promise<void> {
  const automation = getAutomation(id)
  if (!automation) throw new Error(`定时任务不存在: ${id}`)
  if (!automation.channelId || !automation.workspaceId) {
    throw new Error('请先为该任务配置模型与项目')
  }
  await runAutomation(automation, true)
}

/**
 * 触发定时任务执行，创建会话后立即返回 sessionId，不等待执行完成。
 * 执行在后台继续，前端可通过返回的 sessionId 跳转到对应会话。
 */
export async function triggerAutomationNow(id: string): Promise<string | undefined> {
  const automation = getAutomation(id)
  if (!automation) throw new Error(`定时任务不存在: ${id}`)
  if (!automation.channelId || !automation.workspaceId) {
    throw new Error('请先为该任务配置模型与项目')
  }
  if (runningAutomations.has(id)) {
    return automation.lastSessionId
  }

  // 后台异步执行，不等待完成
  // runAutomation 内部会创建会话并调用 setLastSessionId
  const runPromise = runAutomation(automation, true)

  // 等待会话被创建（轮询 automation 记录中的 lastSessionId）
  // 最多等待 5 秒
  const sessionId = await waitForSessionId(id, 5000)

  // 不等待执行完成
  void runPromise

  return sessionId ?? automation.lastSessionId
}

/** 轮询等待 automation 的 lastSessionId 被设置 */
async function waitForSessionId(id: string, timeoutMs: number): Promise<string | undefined> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const a = getAutomation(id)
    if (a?.lastSessionId) return a.lastSessionId
    await new Promise((r) => setTimeout(r, 50))
  }
  return undefined
}

function tick(): void {
  const now = Date.now()
  for (const automation of listAutomations()) {
    if (!automation.active) continue
    if (!automation.channelId || !automation.workspaceId) continue
    if (now < automation.nextRunAt) continue
    if (runningAutomations.has(automation.id)) continue
    void runAutomation(automation)
  }
}

export function startScheduler(): void {
  if (tickTimer) return
  const now = Date.now()
  for (const automation of listAutomations()) {
    if (automation.active && automation.nextRunAt <= now) {
      setNextRunAt(automation.id, computeNextRunAt(automation, now))
    }
  }
  tickTimer = setInterval(tick, TICK_INTERVAL_MS)
  console.log(`[定时任务] 调度器已启动，tick 周期 ${TICK_INTERVAL_MS / 1000}s`)
}

export function stopScheduler(): void {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = undefined
    console.log('[定时任务] 调度器已停止')
  }
}
