/**
 * Agent 协作子会话服务
 *
 * 核心职责：
 * - 管理父会话→子会话的委派记录（delegation records）
 * - 创建、运行、等待、停止子 Agent 会话
 * - 子会话事件冒泡到父会话前端（通过 onEvent 转发）
 * - 幂等性缓存（Pi SDK 的 retry 流可能重放同一个 tool call）
 *
 * 设计参考 Proma 的 agent-collaboration-tools.ts，适配 Diting 的 Pi SDK 架构。
 * 子会话使用与父会话相同的 channel、model、workspace 和工具集，
 * 但有独立的 SessionManager 和事件流。
 */

import { randomUUID } from 'node:crypto'
import { logger } from 'ee-core/log'

// ========== 类型定义 ==========

/** 委派角色 */
export type DelegationRole = 'explore' | 'research' | 'implement' | 'review' | 'custom'

/** 委派状态 */
export type DelegationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/** 委派记录 */
export interface DelegationRecord {
  /** 委派 ID */
  delegationId: string
  /** 父会话 ID */
  parentSessionId: string
  /** 子会话 ID */
  childSessionId: string
  /** 子会话标题 */
  title: string
  /** 角色 */
  role: DelegationRole
  /** 任务描述 */
  task: string
  /** 期望输出格式 */
  expectedOutput?: string
  /** 状态 */
  status: DelegationStatus
  /** 开始时间 */
  startedAt: number
  /** 完成时间 */
  completedAt?: number
  /** 错误信息 */
  error?: string
  /** 结果摘要 */
  resultSummary?: string
  /** 完成 Promise（用于 wait_for_delegations） */
  completion: Promise<void>
  /** resolve 函数 */
  resolveCompletion: () => void
  /** 取消函数 */
  abortController?: AbortController
}

/** 委派摘要（返回给 Agent 和前端） */
export interface DelegationSummary {
  delegationId: string
  parentSessionId: string
  childSessionId: string
  title: string
  role: DelegationRole
  task: string
  expectedOutput?: string
  status: DelegationStatus
  startedAt: number
  completedAt?: number
  error?: string
  resultSummary?: string
}

/** 创建子会话的上下文 */
export interface DelegationContext {
  parentSessionId: string
  channelId: string
  modelId?: string
  workspaceSlug?: string
  /** 创建子会话的工厂函数 */
  createChildSession: (task: string, abortController: AbortController, onChildEvent: (event: string, data: unknown) => void) => Promise<string>
}

// ========== 常量 ==========

const MAX_RUNNING_DELEGATIONS = 50
const MAX_WAIT_SECONDS = 2 * 60 * 60  // 2 小时
const DEFAULT_WAIT_SECONDS = 30 * 60   // 30 分钟
const RESULT_CHAR_LIMIT = 50_000
const TASK_CHAR_LIMIT = 1_000

// ========== 内部状态 ==========

/** 所有委派记录（delegationId → record） */
const delegations = new Map<string, DelegationRecord>()

/** 按父会话索引（parentSessionId → delegationId[]） */
const parentDelegations = new Map<string, Set<string>>()

/** Pi retry 幂等缓存（toolCallId → result） */
const idempotencyCache = new Map<string, { delegationId: string; effectiveModelId?: string }>()

// ========== 工具函数 ==========

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}\n\n[内容过长，已截断 ${text.length - limit} 字符]`
}

function toSummary(record: DelegationRecord): DelegationSummary {
  return {
    delegationId: record.delegationId,
    parentSessionId: record.parentSessionId,
    childSessionId: record.childSessionId,
    title: record.title,
    role: record.role,
    task: record.task,
    expectedOutput: record.expectedOutput,
    status: record.status,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    error: record.error,
    resultSummary: record.resultSummary,
  }
}

function getRunningCount(parentSessionId: string): number {
  const ids = parentDelegations.get(parentSessionId)
  if (!ids) return 0
  let count = 0
  for (const id of ids) {
    const record = delegations.get(id)
    if (record && record.status === 'running') count++
  }
  return count
}

/** 通知前端委派状态变化 */
function notifyDelegationUpdate(
  parentSessionId: string,
  record: DelegationRecord,
  onEvent: (event: string, data: unknown) => void,
): void {
  logger.info(`[Collaboration] 发送 delegation_update: delegationId=${record.delegationId}, status=${record.status}, title=${record.title}`)
  onEvent('delegation_update', {
    sessionId: parentSessionId,
    delegation: toSummary(record),
  })
}

// ========== 核心 API ==========

/**
 * 创建单个子会话委派
 */
export function createDelegation(
  ctx: DelegationContext,
  args: {
    title?: string
    role?: DelegationRole
    task: string
    expectedOutput?: string
    modelId?: string
  },
  onEvent: (event: string, data: unknown) => void,
): { delegationId: string; childSessionId: string } {
  const task = args.task?.trim()
  if (!task) throw new Error('task 不能为空')
  if (task.length > TASK_CHAR_LIMIT) throw new Error(`task 过长（${task.length} 字符，上限 ${TASK_CHAR_LIMIT}）`)

  // 并发检查
  const running = getRunningCount(ctx.parentSessionId)
  if (running >= MAX_RUNNING_DELEGATIONS) {
    throw new Error(`当前父会话已有 ${running} 个运行中的协作子会话，最多允许 ${MAX_RUNNING_DELEGATIONS} 个`)
  }

  const delegationId = randomUUID()
  const childSessionId = `child-${delegationId.slice(0, 8)}`
  const abortController = new AbortController()

  // 创建 completion Promise
  let resolveCompletion: () => void = () => {}
  const completion = new Promise<void>((resolve) => {
    resolveCompletion = resolve
  })

  const record: DelegationRecord = {
    delegationId,
    parentSessionId: ctx.parentSessionId,
    childSessionId,
    title: args.title?.trim()?.slice(0, 80) || truncate(task, 80),
    role: args.role || 'custom',
    task: truncate(task, TASK_CHAR_LIMIT),
    expectedOutput: args.expectedOutput,
    status: 'running',
    startedAt: Date.now(),
    completion,
    resolveCompletion,
    abortController,
  }

  // 注册到索引
  delegations.set(delegationId, record)
  if (!parentDelegations.has(ctx.parentSessionId)) {
    parentDelegations.set(ctx.parentSessionId, new Set())
  }
  parentDelegations.get(ctx.parentSessionId)!.add(delegationId)

  // 通知前端
  notifyDelegationUpdate(ctx.parentSessionId, record, onEvent)

  // 异步启动子会话
  ctx.createChildSession(task, abortController, (childEvent, childData) => {
    // 子会话事件冒泡到父会话前端
    onEvent('delegation_event', {
      sessionId: ctx.parentSessionId,
      delegationId,
      childSessionId,
      childEvent,
      childData,
    })
  })
    .then((resultText) => {
      // 子会话正常完成
      record.status = 'completed'
      record.completedAt = Date.now()
      record.resultSummary = truncate(resultText || '(子会话未返回文本)', RESULT_CHAR_LIMIT)
      record.resolveCompletion()
      notifyDelegationUpdate(ctx.parentSessionId, record, onEvent)
      logger.info(`[Collaboration] 子会话完成: ${delegationId} (${record.title})`)
    })
    .catch((err) => {
      // 子会话失败
      const isAborted = abortController.signal.aborted
      record.status = isAborted ? 'cancelled' : 'failed'
      record.completedAt = Date.now()
      record.error = err instanceof Error ? err.message : String(err)
      record.resolveCompletion()
      notifyDelegationUpdate(ctx.parentSessionId, record, onEvent)
      logger.error(`[Collaboration] 子会话${isAborted ? '取消' : '失败'}: ${delegationId}`, err)
    })

  return { delegationId, childSessionId }
}

/**
 * 批量创建子会话委派
 */
export function createDelegations(
  ctx: DelegationContext,
  items: Array<{
    title?: string
    role?: DelegationRole
    task: string
    expectedOutput?: string
    modelId?: string
  }>,
  onEvent: (event: string, data: unknown) => void,
): { created: Array<{ delegationId: string; childSessionId: string }>; failures: Array<{ index: number; error: string }> } {
  if (!items || items.length === 0) throw new Error('items 不能为空')
  if (items.length > MAX_RUNNING_DELEGATIONS) throw new Error(`批量委派最多 ${MAX_RUNNING_DELEGATIONS} 个，当前 ${items.length} 个`)

  const created: Array<{ delegationId: string; childSessionId: string }> = []
  const failures: Array<{ index: number; error: string }> = []

  for (let i = 0; i < items.length; i++) {
    try {
      const result = createDelegation(ctx, items[i], onEvent)
      created.push(result)
    } catch (err) {
      failures.push({
        index: i,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { created, failures }
}

/**
 * 等待子会话完成
 */
export async function waitForDelegations(
  parentSessionId: string,
  args: {
    delegationIds?: string[]
    mode?: 'all' | 'any'
    minCompleted?: number
    timeoutSec?: number
  },
): Promise<{
  completed: DelegationSummary[]
  stillRunning: DelegationSummary[]
  timedOut: boolean
}> {
  const mode = args.mode || 'all'
  const timeoutSec = args.timeoutSec || DEFAULT_WAIT_SECONDS
  const minCompleted = args.minCompleted || (mode === 'any' ? 1 : 0)

  // 确定要等待的委派列表
  let targetIds: string[]
  if (args.delegationIds && args.delegationIds.length > 0) {
    targetIds = args.delegationIds
  } else {
    // 等待该父会话下所有运行中的委派
    const ids = parentDelegations.get(parentSessionId)
    targetIds = ids ? Array.from(ids) : []
  }

  if (targetIds.length === 0) {
    return { completed: [], stillRunning: [], timedOut: false }
  }

  const records = targetIds
    .map((id) => delegations.get(id))
    .filter((r): r is DelegationRecord => !!r)

  if (records.length === 0) {
    return { completed: [], stillRunning: [], timedOut: false }
  }

  // 已完成的直接返回
  const finished = records.filter((r) => r.status !== 'running')
  const running = records.filter((r) => r.status === 'running')

  if (mode === 'all' && running.length === 0) {
    return { completed: finished.map(toSummary), stillRunning: [], timedOut: false }
  }

  if (mode === 'any' && finished.length >= minCompleted) {
    return { completed: finished.map(toSummary), stillRunning: running.map(toSummary), timedOut: false }
  }

  // 等待运行中的委派完成
  const timeoutMs = Math.min(timeoutSec, MAX_WAIT_SECONDS) * 1000
  const deadline = Date.now() + timeoutMs

  return new Promise((resolve) => {
    const checkInterval = 500 // 500ms 检查一次
    const interval = setInterval(() => {
      const nowFinished = records.filter((r) => r.status !== 'running')
      const stillRunning = records.filter((r) => r.status === 'running')

      if (mode === 'all' && stillRunning.length === 0) {
        clearInterval(interval)
        resolve({ completed: nowFinished.map(toSummary), stillRunning: [], timedOut: false })
      } else if (mode === 'any' && nowFinished.length >= minCompleted) {
        clearInterval(interval)
        resolve({ completed: nowFinished.map(toSummary), stillRunning: stillRunning.map(toSummary), timedOut: false })
      } else if (Date.now() >= deadline) {
        clearInterval(interval)
        resolve({ completed: nowFinished.map(toSummary), stillRunning: stillRunning.map(toSummary), timedOut: true })
      }
    }, checkInterval)
  })
}

/**
 * 列出父会话的所有委派
 */
export function listDelegations(parentSessionId: string): DelegationSummary[] {
  const ids = parentDelegations.get(parentSessionId)
  if (!ids) return []
  const summaries: DelegationSummary[] = []
  for (const id of ids) {
    const record = delegations.get(id)
    if (record) summaries.push(toSummary(record))
  }
  // 按开始时间排序
  return summaries.sort((a, b) => a.startedAt - b.startedAt)
}

/**
 * 获取单个委派结果
 */
export function getDelegationResult(parentSessionId: string, delegationId: string): DelegationSummary {
  const record = delegations.get(delegationId)
  if (!record) throw new Error(`未找到委派: ${delegationId}`)
  if (record.parentSessionId !== parentSessionId) throw new Error(`委派不属于当前父会话: ${delegationId}`)
  return toSummary(record)
}

/**
 * 停止单个委派
 */
export function stopDelegation(parentSessionId: string, delegationId: string): boolean {
  const record = delegations.get(delegationId)
  if (!record || record.parentSessionId !== parentSessionId) return false
  if (record.status !== 'running') return false

  record.abortController?.abort()
  // abort 后由 createChildSession 的 catch 块处理状态更新
  return true
}

/**
 * 批量停止委派
 */
export function stopDelegations(
  parentSessionId: string,
  delegationIds?: string[],
): { stopped: string[]; notFound: string[] } {
  let targetIds: string[]
  if (delegationIds && delegationIds.length > 0) {
    targetIds = delegationIds
  } else {
    const ids = parentDelegations.get(parentSessionId)
    targetIds = ids ? Array.from(ids) : []
  }

  const stopped: string[] = []
  const notFound: string[] = []

  for (const id of targetIds) {
    if (stopDelegation(parentSessionId, id)) {
      stopped.push(id)
    } else {
      notFound.push(id)
    }
  }

  return { stopped, notFound }
}

/**
 * 获取幂等缓存（Pi retry 场景下防止重复创建子会话）
 */
export function getIdempotentResult(toolCallId: string): { delegationId: string; effectiveModelId?: string } | undefined {
  return idempotencyCache.get(toolCallId)
}

/**
 * 设置幂等缓存
 */
export function setIdempotentResult(toolCallId: string, result: { delegationId: string; effectiveModelId?: string }): void {
  idempotencyCache.set(toolCallId, result)
}

/**
 * 清理父会话的所有委派记录
 */
export function cleanupDelegations(parentSessionId: string): void {
  const ids = parentDelegations.get(parentSessionId)
  if (!ids) return
  for (const id of ids) {
    const record = delegations.get(id)
    if (record && record.status === 'running') {
      record.abortController?.abort()
    }
    delegations.delete(id)
  }
  parentDelegations.delete(parentSessionId)
  logger.info(`[Collaboration] 已清理父会话 ${parentSessionId} 的 ${ids.size} 个委派记录`)
}
