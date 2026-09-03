/**
 * Agent 权限 & AskUser 交互服务
 *
 * 核心职责：
 * - 实现 canUseTool 回调（供工具执行前权限检查）
 * - 管理 pending 权限请求（Promise + Map 异步等待模式）
 * - 维护会话级白名单（用户选择"总是允许"后自动放行）
 * - AskUserQuestion 工具调用的交互式问答管理
 *
 * 参考 Proma 的 agent-permission-service.ts 和 agent-ask-user-service.ts。
 */

import { randomUUID } from 'crypto'
import { logger } from 'ee-core/log'

// ========== 类型定义 ==========

/** 权限行为 */
export type PermissionBehavior = 'allow' | 'deny'

/** 权限结果（canUseTool 回调返回值） */
export type PermissionResult = {
  behavior: 'allow'
  updatedInput?: Record<string, unknown>
} | {
  behavior: 'deny'
  message: string
}

/** canUseTool 回调的 options 参数 */
export interface CanUseToolOptions {
  signal: AbortSignal
  toolUseID: string
  displayName?: string
  description?: string
}

/** 危险等级 */
export type DangerLevel = 'safe' | 'normal' | 'dangerous'

/** 权限请求（发送到前端） */
export interface PermissionRequest {
  requestId: string
  sessionId: string
  toolName: string
  toolInput: Record<string, unknown>
  description: string
  command?: string
  dangerLevel: DangerLevel
  allowAlways: boolean
}

/** AskUser 问题选项 */
export interface AskUserQuestionOption {
  label: string
  description?: string
}

/** AskUser 问题 */
export interface AskUserQuestion {
  question: string
  header?: string
  options: AskUserQuestionOption[]
  multiSelect?: boolean
  /** 是否允许用户自由输入文本（除选择外补充信息） */
  allowInput?: boolean
}

/** AskUser 请求（发送到前端） */
export interface AskUserRequest {
  requestId: string
  sessionId: string
  questions: AskUserQuestion[]
  toolInput: Record<string, unknown>
}

// ========== 内部数据结构 ==========

/** 待处理的权限请求 */
interface PendingPermission {
  resolve: (result: PermissionResult) => void
  request: PermissionRequest
}

/** 待处理的 AskUser 请求 */
interface PendingAskUser {
  resolve: (result: PermissionResult) => void
  request: AskUserRequest
}

/** 会话级白名单 */
interface SessionWhitelist {
  /** 总是允许的工具名（如 'write', 'edit'） */
  allowedTools: Set<string>
  /** 总是允许的 Bash 基础命令（如 'git status', 'ls'） */
  allowedBashCommands: Set<string>
}

// ========== 只读工具 & 危险命令判断 ==========

/** 只读工具集合（自动放行，无需询问用户） */
const READ_ONLY_TOOLS = new Set([
  'read', 'ls', 'grep', 'find', 'glob',
])

/** 危险 Bash 命令关键词 */
const DANGEROUS_COMMANDS = [
  'rm -rf', 'rm -r', 'rmdir',
  'sudo ', 'chmod 777',
  'kill -9', 'killall',
  'shutdown', 'reboot',
  'format ', 'fdisk',
  'dd if=', 'mkfs',
  '> /dev/sda', 'mv / ',
]

/** 检查 Bash 命令是否危险 */
function isDangerousCommand(command: string): boolean {
  const lower = command.toLowerCase()
  return DANGEROUS_COMMANDS.some((pattern) => lower.includes(pattern))
}

/** 检查 Bash 命令是否只读 */
function isReadOnlyBashCommand(command: string): boolean {
  const lower = command.trim().toLowerCase()
  // 只读命令前缀
  const readOnlyPrefixes = [
    'ls', 'cat', 'head', 'tail', 'grep', 'find', 'wc',
    'git status', 'git log', 'git diff', 'git show', 'git branch',
    'git remote', 'git config --get',
    'pwd', 'echo', 'which', 'whereis', 'file', 'stat',
    'node --version', 'npm --version', 'bun --version',
    'python --version', 'java --version',
  ]
  return readOnlyPrefixes.some((prefix) => lower.startsWith(prefix))
}

/** 判断工具是否只读（自动放行） */
function isReadOnlyTool(toolName: string, input: Record<string, unknown>): boolean {
  if (READ_ONLY_TOOLS.has(toolName)) return true
  if (toolName === 'bash' && typeof input.command === 'string') {
    return isReadOnlyBashCommand(input.command)
  }
  return false
}

/** 评估工具调用的危险等级 */
function assessDangerLevel(toolName: string, input: Record<string, unknown>): DangerLevel {
  if (READ_ONLY_TOOLS.has(toolName)) return 'safe'
  if (toolName === 'bash' && typeof input.command === 'string') {
    if (isDangerousCommand(input.command)) return 'dangerous'
    if (isReadOnlyBashCommand(input.command)) return 'safe'
    return 'normal'
  }
  if (toolName === 'write' || toolName === 'edit') return 'normal'
  return 'normal'
}

/** 构建工具描述（显示给用户的摘要） */
function buildDescription(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'bash': {
      const cmd = input.command
      return typeof cmd === 'string' ? cmd : '执行命令'
    }
    case 'write': {
      const fp = input.filePath || input.path
      return typeof fp === 'string' ? `写入文件: ${fp}` : '写入文件'
    }
    case 'edit': {
      const fp = input.filePath || input.path
      return typeof fp === 'string' ? `编辑文件: ${fp}` : '编辑文件'
    }
    case 'read': {
      const fp = input.filePath || input.path
      return typeof fp === 'string' ? `读取文件: ${fp}` : '读取文件'
    }
    default:
      return `${toolName}`
  }
}

// ========== Agent 权限服务 ==========

/**
 * Agent 权限 & AskUser 服务
 *
 * 单例模式，管理所有会话的权限状态和 AskUser 请求。
 */
export class AgentPermissionService {
  /** 待处理的权限请求 Map（requestId → PendingPermission） */
  private pendingPermissions = new Map<string, PendingPermission>()

  /** 待处理的 AskUser 请求 Map（requestId → PendingAskUser） */
  private pendingAskUsers = new Map<string, PendingAskUser>()

  /** 会话级白名单 Map（sessionId → SessionWhitelist） */
  private sessionWhitelists = new Map<string, SessionWhitelist>()

  /**
   * 创建 canUseTool 回调
   *
   * 返回的函数在每次工具执行前被调用：
   * 1. 检查是否在白名单中 → 自动放行
   * 2. 检查是否为只读工具 → 自动放行
   * 3. 否则发送权限请求到前端，等待用户响应
   *
   * @param sessionId 会话 ID
   * @param sendToRenderer 发送权限请求到前端的回调
   * @param sendAskUserToRenderer 发送 AskUser 请求到前端的回调
   */
  createCanUseTool(
    sessionId: string,
    sendToRenderer: (request: PermissionRequest) => void,
    sendAskUserToRenderer: (request: AskUserRequest) => void,
    permissionMode?: string,
  ): (toolName: string, input: Record<string, unknown>, options: CanUseToolOptions) => Promise<PermissionResult> {
    return async (toolName, input, options) => {
      // AskUserQuestion 工具：委托给交互式问答流程
      if (toolName === 'AskUserQuestion') {
        return this.handleAskUserQuestion(sessionId, input, options.signal, sendAskUserToRenderer)
      }

      const allow = (): PermissionResult => ({ behavior: 'allow' as const, updatedInput: input })

      // bypassPermissions 模式：除 AskUserQuestion 外全部自动放行
      if (permissionMode === 'bypassPermissions') return allow()

      // 会话白名单检查（用户之前选择了"始终允许"）
      if (this.isWhitelisted(sessionId, toolName, input)) return allow()

      // 只读工具自动放行
      if (isReadOnlyTool(toolName, input)) return allow()

      // 需要询问用户：构建请求并发送到前端
      const request = this.buildPermissionRequest(sessionId, toolName, input, options)
      sendToRenderer(request)

      return new Promise<PermissionResult>((resolve) => {
        this.pendingPermissions.set(request.requestId, { resolve, request })

        // 如果 signal 被中止（如用户停止生成），自动拒绝
        options.signal.addEventListener('abort', () => {
          if (this.pendingPermissions.has(request.requestId)) {
            this.pendingPermissions.delete(request.requestId)
            resolve({ behavior: 'deny' as const, message: '操作已中止' })
          }
        }, { once: true })
      })
    }
  }

  /**
   * 响应权限请求（由前端 HTTP 端点调用）
   *
   * @returns 对应的 sessionId；未找到请求时返回 null
   */
  respondToPermission(requestId: string, behavior: PermissionBehavior, alwaysAllow: boolean): string | null {
    const pending = this.pendingPermissions.get(requestId)
    if (!pending) return null

    const sessionId = pending.request.sessionId

    // "总是允许"：加入会话白名单
    if (alwaysAllow && behavior === 'allow' && pending.request.allowAlways) {
      this.addToWhitelist(sessionId, pending.request.toolName, pending.request.toolInput)
    }

    pending.resolve(
      behavior === 'allow'
        ? { behavior: 'allow' as const, updatedInput: pending.request.toolInput }
        : { behavior: 'deny' as const, message: '用户拒绝了此操作' }
    )
    this.pendingPermissions.delete(requestId)
    logger.info(`[PermissionService] 权限请求 ${requestId} 已响应: ${behavior}`)
    return sessionId
  }

  /**
   * 响应 AskUser 请求（由前端 HTTP 端点调用）
   *
   * @returns 对应的 sessionId；未找到请求时返回 null
   */
  respondToAskUser(requestId: string, answers: Record<string, string>): string | null {
    const pending = this.pendingAskUsers.get(requestId)
    if (!pending) return null

    const sessionId = pending.request.sessionId

    // 通过 updatedInput 注入 answers 字段
    const updatedInput: Record<string, unknown> = {
      ...pending.request.toolInput,
      answers,
    }

    pending.resolve({
      behavior: 'allow' as const,
      updatedInput,
    })
    this.pendingAskUsers.delete(requestId)
    logger.info(`[PermissionService] AskUser 请求 ${requestId} 已响应`)
    return sessionId
  }

  /**
   * 清除指定会话的所有待处理请求
   */
  clearSession(sessionId: string): void {
    // 清除权限请求
    for (const [requestId, pending] of this.pendingPermissions) {
      if (pending.request.sessionId === sessionId) {
        pending.resolve({ behavior: 'deny' as const, message: '会话已结束' })
        this.pendingPermissions.delete(requestId)
      }
    }
    // 清除 AskUser 请求
    for (const [requestId, pending] of this.pendingAskUsers) {
      if (pending.request.sessionId === sessionId) {
        pending.resolve({ behavior: 'deny' as const, message: '会话已结束' })
        this.pendingAskUsers.delete(requestId)
      }
    }
    // 清除白名单
    this.sessionWhitelists.delete(sessionId)
  }

  // ========== 内部方法 ==========

  /** 处理 AskUserQuestion 工具调用 */
  private handleAskUserQuestion(
    sessionId: string,
    input: Record<string, unknown>,
    signal: AbortSignal,
    sendToRenderer: (request: AskUserRequest) => void,
  ): Promise<PermissionResult> {
    const questions = this.parseQuestions(input)

    const request: AskUserRequest = {
      requestId: randomUUID(),
      sessionId,
      questions,
      toolInput: input,
    }

    sendToRenderer(request)

    return new Promise<PermissionResult>((resolve) => {
      this.pendingAskUsers.set(request.requestId, { resolve, request })

      signal.addEventListener('abort', () => {
        if (this.pendingAskUsers.has(request.requestId)) {
          this.pendingAskUsers.delete(request.requestId)
          resolve({ behavior: 'deny' as const, message: '操作已中止' })
        }
      }, { once: true })
    })
  }

  /** 从工具输入中解析问题列表 */
  private parseQuestions(input: Record<string, unknown>): AskUserQuestion[] {
    const rawQuestions = input.questions
    if (!Array.isArray(rawQuestions)) return []

    return rawQuestions.map((q: unknown): AskUserQuestion => {
      const raw = q as Record<string, unknown>
      const options = Array.isArray(raw.options)
        ? (raw.options as Array<Record<string, unknown>>).map((o): AskUserQuestionOption => ({
            label: typeof o.label === 'string' ? o.label : '',
            description: typeof o.description === 'string' ? o.description : undefined,
          }))
        : []

      return {
        question: typeof raw.question === 'string' ? raw.question : '',
        header: typeof raw.header === 'string' ? raw.header : undefined,
        options,
        multiSelect: raw.multiSelect === true,
        allowInput: raw.allowInput === true,
      }
    })
  }

  /** 构建权限请求对象 */
  private buildPermissionRequest(
    sessionId: string,
    toolName: string,
    input: Record<string, unknown>,
    options: CanUseToolOptions,
  ): PermissionRequest {
    const command = toolName === 'bash' && typeof input.command === 'string'
      ? input.command
      : undefined

    const dangerLevel = assessDangerLevel(toolName, input)

    return {
      requestId: randomUUID(),
      sessionId,
      toolName,
      toolInput: input,
      description: buildDescription(toolName, input),
      command,
      dangerLevel,
      allowAlways: dangerLevel !== 'dangerous',
    }
  }

  /** 检查是否在会话白名单中 */
  private isWhitelisted(sessionId: string, toolName: string, input: Record<string, unknown>): boolean {
    const whitelist = this.sessionWhitelists.get(sessionId)
    if (!whitelist) return false

    if (whitelist.allowedTools.has(toolName)) return true

    if (toolName === 'bash' && typeof input.command === 'string') {
      const baseCmd = input.command.trim().split(/\s+/).slice(0, 2).join(' ')
      return whitelist.allowedBashCommands.has(baseCmd)
    }

    return false
  }

  /** 添加到会话白名单 */
  private addToWhitelist(sessionId: string, toolName: string, input: Record<string, unknown>): void {
    let whitelist = this.sessionWhitelists.get(sessionId)
    if (!whitelist) {
      whitelist = { allowedTools: new Set(), allowedBashCommands: new Set() }
      this.sessionWhitelists.set(sessionId, whitelist)
    }

    whitelist.allowedTools.add(toolName)

    if (toolName === 'bash' && typeof input.command === 'string') {
      const baseCmd = input.command.trim().split(/\s+/).slice(0, 2).join(' ')
      whitelist.allowedBashCommands.add(baseCmd)
    }

    logger.info(`[PermissionService] 已添加白名单: session=${sessionId}, tool=${toolName}`)
  }
}

/** 全局权限服务实例 */
export const permissionService = new AgentPermissionService()
