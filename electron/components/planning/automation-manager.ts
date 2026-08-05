/**
 * 定时任务（Automation）管理器
 *
 * 移植自 Proma 的 automation-manager.ts，适配 Diting 架构。
 * 负责定时任务的 CRUD 与运行历史持久化。
 * 索引文件：~/.diting/automations.json
 */

import { randomUUID } from 'crypto'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import {
  AUTOMATION_MAX_HISTORY,
  AUTOMATION_DEFAULT_PERMISSION_MODE,
  type Automation,
  type AutomationRun,
  type CreateAutomationInput,
  type UpdateAutomationInput,
} from './types'

interface AutomationsIndex {
  version: number
  automations: Automation[]
}

const INDEX_VERSION = 2

function getAutomationsPath(): string {
  const dir = join(app.getPath('home'), '.diting')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'automations.json')
}

/** 原子写入 JSON 文件 */
function writeJsonFileAtomic(filePath: string, data: unknown): void {
  const tmpPath = `${filePath}.tmp`
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  // rename 是原子操作
  const { renameSync } = require('fs')
  renameSync(tmpPath, filePath)
}

/** 安全读取 JSON 文件 */
function readJsonFileSafe<T>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) return null
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as T
  } catch {
    return null
  }
}

let cachedIndex: AutomationsIndex | null = null

function readIndex(): AutomationsIndex {
  if (cachedIndex) return cachedIndex
  const data = readJsonFileSafe<AutomationsIndex>(getAutomationsPath())
  if (!data) {
    cachedIndex = { version: INDEX_VERSION, automations: [] }
    return cachedIndex
  }
  if (typeof data.version !== 'number') {
    cachedIndex = { version: INDEX_VERSION, automations: [] }
    return cachedIndex
  }
  if (!Array.isArray(data.automations)) {
    cachedIndex = { version: INDEX_VERSION, automations: [] }
    return cachedIndex
  }
  cachedIndex = data
  return cachedIndex
}

function writeIndex(index: AutomationsIndex): void {
  try {
    cachedIndex = index
    writeJsonFileAtomic(getAutomationsPath(), index)
  } catch (error) {
    cachedIndex = null
    throw new Error('写入定时任务索引失败')
  }
}

// ===== 调度计算 =====

export function computeNextRunAt(
  a: { scheduleType: Automation['scheduleType'] } & Partial<
    Pick<Automation, 'intervalMinutes' | 'timeOfDay' | 'dayOfWeek' | 'dayOfMonth' | 'scheduledAt'>
  >,
  from: number = Date.now(),
): number {
  const FALLBACK = 10 * 60_000

  let result: number

  if (a.scheduleType === 'once') {
    result = Number.isFinite(a.scheduledAt) && a.scheduledAt! > 0 ? a.scheduledAt! : from + FALLBACK
  } else if (a.scheduleType === 'interval') {
    const minutes = Number(a.intervalMinutes)
    if (!Number.isFinite(minutes) || minutes < 1) {
      result = from + FALLBACK
    } else {
      result = from + Math.max(1, minutes) * 60_000
    }
  } else {
    const timeOfDay = a.timeOfDay ?? '09:00'
    const parts = timeOfDay.split(':').map(Number)
    const hh = Number.isFinite(parts[0]) ? parts[0]! : 9
    const mm = Number.isFinite(parts[1]) ? parts[1]! : 0
    const next = new Date(from)
    next.setSeconds(0, 0)
    next.setHours(hh, mm, 0, 0)

    if (a.scheduleType === 'daily') {
      if (next.getTime() <= from) next.setDate(next.getDate() + 1)
      result = next.getTime()
    } else if (a.scheduleType === 'monthly') {
      const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
      const targetDom = Number.isFinite(a.dayOfMonth) && a.dayOfMonth! >= 1 && a.dayOfMonth! <= 31 ? a.dayOfMonth! : 1
      next.setDate(1)
      next.setDate(Math.min(targetDom, daysInMonth(next.getFullYear(), next.getMonth())))
      if (next.getTime() <= from) {
        next.setDate(1)
        next.setMonth(next.getMonth() + 1)
        next.setDate(Math.min(targetDom, daysInMonth(next.getFullYear(), next.getMonth())))
      }
      result = next.getTime()
    } else {
      // weekly
      const targetDow = Number.isFinite(a.dayOfWeek) ? a.dayOfWeek! : 1
      let dayDiff = (targetDow - next.getDay() + 7) % 7
      if (dayDiff === 0 && next.getTime() <= from) dayDiff = 7
      next.setDate(next.getDate() + dayDiff)
      result = next.getTime()
    }
  }

  if (!Number.isFinite(result) || result <= 0) return from + FALLBACK
  return result
}

// ===== CRUD =====

function isAutomationRunnable(a: Pick<Automation, 'channelId' | 'workspaceId'>): boolean {
  return !!a.channelId && !!a.workspaceId
}

function normalizeMaxRuns(v: number | undefined): number | undefined {
  if (v === undefined) return undefined
  if (!Number.isFinite(v) || !Number.isInteger(v) || v < 1) return undefined
  return v
}

function applyMaxRunsUpdate(
  target: Pick<Automation, 'maxRuns' | 'runCount' | 'completedAt'>,
  nextMaxRuns: number | undefined,
): void {
  const normalized = normalizeMaxRuns(nextMaxRuns)
  if (normalized !== target.maxRuns) {
    target.runCount = 0
    target.completedAt = undefined
  }
  target.maxRuns = normalized
}

function shouldAutoComplete(a: Pick<Automation, 'scheduleType' | 'maxRuns' | 'runCount'>): boolean {
  const count = a.runCount ?? 0
  if (a.scheduleType === 'once') return count >= 1
  const max = normalizeMaxRuns(a.maxRuns)
  return max !== undefined && count >= max
}

export function listAutomations(): Automation[] {
  return readIndex().automations.sort((a, b) => a.createdAt - b.createdAt)
}

export function getAutomation(id: string): Automation | undefined {
  return readIndex().automations.find((a) => a.id === id)
}

export function createAutomation(input: CreateAutomationInput): Automation {
  const index = readIndex()
  const now = Date.now()
  const requestedActive = input.active ?? true
  const active = requestedActive && isAutomationRunnable(input)
  const automation: Automation = {
    id: randomUUID(),
    name: input.name,
    prompt: input.prompt,
    active,
    scheduleType: input.scheduleType,
    intervalMinutes: input.intervalMinutes,
    timeOfDay: input.timeOfDay,
    dayOfWeek: input.dayOfWeek,
    dayOfMonth: input.dayOfMonth,
    scheduledAt: input.scheduledAt,
    maxRuns: normalizeMaxRuns(input.maxRuns),
    channelId: input.channelId,
    modelId: input.modelId,
    workspaceId: input.workspaceId,
    permissionMode: input.permissionMode ?? AUTOMATION_DEFAULT_PERMISSION_MODE,
    sessionMode: input.sessionMode,
    sourceSessionId: input.sourceSessionId,
    createdAt: now,
    updatedAt: now,
    nextRunAt: computeNextRunAt(input, now),
    runCount: 0,
    runHistory: [],
  }
  index.automations.push(automation)
  writeIndex(index)
  console.log(`[定时任务] 已创建: ${automation.name} (${automation.id})`)
  return automation
}

export function updateAutomation(input: UpdateAutomationInput): Automation | undefined {
  const index = readIndex()
  const target = index.automations.find((a) => a.id === input.id)
  if (!target) return undefined
  const now = Date.now()
  if (input.name !== undefined) target.name = input.name
  if (input.prompt !== undefined) target.prompt = input.prompt
  if (input.channelId !== undefined) target.channelId = input.channelId
  if (input.modelId !== undefined) target.modelId = input.modelId
  if (input.workspaceId !== undefined) target.workspaceId = input.workspaceId || undefined
  if (input.permissionMode !== undefined) target.permissionMode = input.permissionMode
  if (input.sessionMode !== undefined) target.sessionMode = input.sessionMode
  if (input.maxRuns !== undefined) applyMaxRunsUpdate(target, input.maxRuns)

  const scheduleChanged =
    (input.scheduleType !== undefined && input.scheduleType !== target.scheduleType) ||
    (input.intervalMinutes !== undefined && input.intervalMinutes !== target.intervalMinutes) ||
    (input.timeOfDay !== undefined && input.timeOfDay !== target.timeOfDay) ||
    (input.dayOfWeek !== undefined && input.dayOfWeek !== target.dayOfWeek) ||
    (input.dayOfMonth !== undefined && input.dayOfMonth !== target.dayOfMonth) ||
    (input.scheduledAt !== undefined && input.scheduledAt !== target.scheduledAt)
  if (input.scheduleType !== undefined) target.scheduleType = input.scheduleType
  if (input.intervalMinutes !== undefined) target.intervalMinutes = input.intervalMinutes
  if (input.timeOfDay !== undefined) target.timeOfDay = input.timeOfDay
  if (input.dayOfWeek !== undefined) target.dayOfWeek = input.dayOfWeek
  if (input.dayOfMonth !== undefined) target.dayOfMonth = input.dayOfMonth
  if (input.scheduledAt !== undefined) target.scheduledAt = input.scheduledAt
  if (scheduleChanged) target.nextRunAt = computeNextRunAt(target, now)

  if (input.active !== undefined && input.active !== target.active) {
    if (input.active && !isAutomationRunnable(target)) {
      throw new Error('启用定时任务前必须配置模型与项目')
    }
    target.active = input.active
    if (input.active) {
      target.nextRunAt = computeNextRunAt(target, now)
      target.consecutiveFailures = 0
      target.runCount = 0
      target.completedAt = undefined
    }
  }
  if (target.active && !isAutomationRunnable(target)) target.active = false

  target.updatedAt = now
  writeIndex(index)
  return target
}

export function deleteAutomation(id: string): boolean {
  const index = readIndex()
  const before = index.automations.length
  index.automations = index.automations.filter((a) => a.id !== id)
  if (index.automations.length === before) return false
  writeIndex(index)
  console.log(`[定时任务] 已删除: ${id}`)
  return true
}

export function appendRun(id: string, run: AutomationRun): Automation | undefined {
  const index = readIndex()
  const target = index.automations.find((a) => a.id === id)
  if (!target) return undefined
  const now = Date.now()
  target.runHistory.unshift(run)
  if (target.runHistory.length > AUTOMATION_MAX_HISTORY) {
    target.runHistory = target.runHistory.slice(0, AUTOMATION_MAX_HISTORY)
  }
  if (run.status !== 'skipped') {
    target.lastRunAt = run.runAt
    target.runCount = (target.runCount ?? 0) + 1
    target.nextRunAt = computeNextRunAt(target, now)
  }
  if (run.status === 'error') {
    target.consecutiveFailures = (target.consecutiveFailures ?? 0) + 1
  } else {
    target.consecutiveFailures = 0
  }
  if (run.status !== 'skipped' && shouldAutoComplete(target)) {
    target.active = false
    target.completedAt = now
    console.log(`[定时任务] ${target.name} 已达成运行上限，自动完成停用`)
  }
  target.updatedAt = now
  writeIndex(index)
  return target
}

export function setNextRunAt(id: string, nextRunAt: number): void {
  const index = readIndex()
  const target = index.automations.find((a) => a.id === id)
  if (!target) return
  target.nextRunAt = nextRunAt
  writeIndex(index)
}

export function setLastSessionId(id: string, sessionId: string): void {
  const index = readIndex()
  const target = index.automations.find((a) => a.id === id)
  if (!target) return
  target.lastSessionId = sessionId
  writeIndex(index)
}
