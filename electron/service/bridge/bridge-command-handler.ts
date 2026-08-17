/**
 * 通用 Bridge 命令处理器
 *
 * 为微信、钉钉等平台提供统一的斜杠命令和 Agent 消息路由。
 * 各平台通过 BridgePlatformAdapter 接入，只需实现发送文本的方法。
 *
 * 飞书 Bridge 使用独立的卡片消息格式，暂不接入此模块。
 *
 * 适配 Diting 的 Agent 架构：
 * - 调用 sendAgentMessage() 发送消息到 Pi Agent
 * - 通过 onEvent 回调接收 Agent 流式事件
 * - Agent 完成后累积回复文本发送回 IM
 */

import { BrowserWindow } from 'electron'
import { logger } from 'ee-core/log'
import {
  sendAgentMessage,
  createSession,
  listSessions,
  abortSession,
} from '../../components/pi/adapters/pi-agent-service'
import type { AgentEventCallback } from '../../components/pi/adapters/pi-agent-service'
import {
  listWorkspaces,
  getWorkspace,
  createWorkspace,
} from '../../components/pi/adapters/workspace-manager'
import type { WorkspaceMeta } from '../../components/pi/adapters/workspace-manager'
import type { AgentChannel } from '../../components/pi/types'
import { llmdbService } from '../database/llmdb'
import {
  buildAttachedFilesBlock,
} from './bridge-attachment-utils'
import type { BridgeChatBinding, BridgeChatBindingStore, BridgeUpdateBindingInput } from './bridge-binding-store'
import { filterExistingBridgeBindings } from './bridge-binding-store'
import { redactSensitiveLogText, redactSensitiveLogValue } from './bridge-config'

// ===== 接口定义 =====

/** 平台适配器 — 各 Bridge 只需实现此接口 */
export interface BridgePlatformAdapter {
  /** 发送纯文本回复。meta 是平台专属的上下文数据（如微信的 contextToken） */
  sendText(chatId: string, text: string, meta?: unknown): Promise<void>
  /** 发送 Markdown / 富文本回复（可选，平台不支持时回退到 sendText） */
  sendMarkdown?(chatId: string, markdown: string, meta?: unknown): Promise<void>
}

/** 已保存到磁盘的附件引用，由各 Bridge 预处理后传入 handler */
export interface BridgeAttachment {
  /** 附件绝对路径 */
  absolutePath: string
  /** 在 <attached_files> 中显示的标签 */
  label: string
  /** 附件类型 */
  kind: 'image' | 'file'
}

/** 命令处理器配置 */
export interface BridgeCommandHandlerConfig {
  /** 平台名称，用于日志（如 '微信', '钉钉'） */
  platformName: string
  /** 平台适配器 */
  adapter: BridgePlatformAdapter
  /** 获取默认工作区 ID */
  getDefaultWorkspaceId?: () => string | undefined
  /** 工作区切换后的回调 */
  onWorkspaceSwitched?: (workspaceId: string) => void | Promise<void>
  /** 可选持久化存储 */
  bindingStore?: BridgeChatBindingStore
}

/** Agent 回复缓冲 */
interface SessionBuffer {
  text: string
  chatId: string
  contextData: unknown
  startedAt: number
}

// ===== 命令处理器实现 =====

export class BridgeCommandHandler {
  private readonly config: BridgeCommandHandlerConfig

  /** chatId → 聊天绑定 */
  private chatBindings = new Map<string, BridgeChatBinding>()
  /** sessionId → chatId（反向索引） */
  private sessionToChat = new Map<string, string>()
  /** sessionId → 回复缓冲 */
  private sessionBuffers = new Map<string, SessionBuffer>()
  /** sessionId → 安全超时定时器（防止 Agent 异常不触发 complete/error 导致 buffer 泄漏） */
  private safetyTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /** 安全超时时长：5 分钟 */
  private static readonly SAFETY_TIMEOUT_MS = 5 * 60 * 1000

  constructor(config: BridgeCommandHandlerConfig) {
    this.config = config
    this.loadPersistedBindings()
  }

  // ===== 公开 API =====

  /** 处理收到的消息（自动区分命令 vs 普通消息） */
  async handleIncomingMessage(
    chatId: string,
    text: string,
    contextData?: unknown,
    attachments?: BridgeAttachment[],
  ): Promise<void> {
    if (text.trimStart().startsWith('/')) {
      await this.handleCommand(chatId, text, contextData)
    } else {
      await this.handleUserMessage(chatId, text, contextData, attachments)
    }
  }

  /** 获取或自动创建 chatId 对应的 binding */
  ensureBinding(chatId: string, meta?: { chatType?: 'p2p' | 'group'; groupName?: string; userId?: string }): BridgeChatBinding | null {
    const existing = this.getValidBinding(chatId)
    if (existing) {
      // 更新 lastUsedAt 和可能缺失的元数据
      existing.lastUsedAt = Date.now()
      if (meta?.chatType && !existing.chatType) existing.chatType = meta.chatType
      if (meta?.groupName && !existing.groupName) existing.groupName = meta.groupName
      if (meta?.userId && !existing.userId) existing.userId = meta.userId
      return existing
    }

    // 获取当前启用的 LLM 模型作为渠道
    const model = llmdbService.getEnabledModel()
    if (!model) return null

    const workspaceId = this.resolveValidWorkspaceId()

    const session = createSession({
      title: `${this.config.platformName}会话`,
      channelId: String(model.id),
      workspaceId: workspaceId || undefined,
    })

    const binding: BridgeChatBinding = {
      chatId,
      sessionId: session.id,
      workspaceId,
      channelId: String(model.id),
      modelId: model.model_name,
      source: this.detectBindingSource(),
      chatType: meta?.chatType,
      groupName: meta?.groupName,
      userId: meta?.userId,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    }
    this.chatBindings.set(chatId, binding)
    this.sessionToChat.set(session.id, chatId)
    this.saveBindings()
    this.log(`为 ${chatId.slice(0, 8)}... 创建会话: ${session.id.slice(0, 8)}`)
    this.notifySessionCreated(session.id, session.title)
    return binding
  }

  /** 检查指定 chatId 的 session 是否正在运行 */
  isSessionActive(chatId: string): boolean {
    const binding = this.getValidBinding(chatId)
    if (!binding) return false
    // 检查活跃会话
    return this.sessionBuffers.has(binding.sessionId)
  }

  /** 获取聊天绑定 */
  getBinding(chatId: string): BridgeChatBinding | undefined {
    return this.getValidBinding(chatId)
  }

  /** 在删除工作区时清理绑定 */
  removeBindingsForDeletedWorkspace(workspaceId: string, affectedSessionIds: Iterable<string>): number {
    const sessionIds = new Set(affectedSessionIds)
    let removedCount = 0

    for (const [chatId, binding] of this.chatBindings) {
      if (binding.workspaceId !== workspaceId && !sessionIds.has(binding.sessionId)) continue
      this.removeBindingInternal(chatId, binding)
      removedCount += 1
    }

    if (removedCount > 0) this.saveBindings()
    return removedCount
  }

  /** 清理所有状态 */
  clear(): void {
    this.chatBindings.clear()
    this.sessionToChat.clear()
    this.sessionBuffers.clear()
    this.saveBindings()
  }

  // ===== 绑定管理（供设置页调用） =====

  /** 列出所有绑定 */
  listBindings(): BridgeChatBinding[] {
    return Array.from(this.chatBindings.values())
  }

  /** 更新绑定的工作区/会话/归档状态 */
  updateBinding(input: BridgeUpdateBindingInput): BridgeChatBinding | null {
    const binding = this.chatBindings.get(input.chatId)
    if (!binding) return null

    if (input.workspaceId !== undefined) {
      binding.workspaceId = input.workspaceId
    }
    if (input.sessionId !== undefined) {
      // 清理旧反向索引，建立新的
      this.sessionToChat.delete(binding.sessionId)
      binding.sessionId = input.sessionId
      if (!binding.archived) {
        this.sessionToChat.set(input.sessionId, input.chatId)
      }
    }
    if (input.archived !== undefined) {
      binding.archived = input.archived
      binding.archivedAt = input.archived ? Date.now() : undefined
      if (input.archived) {
        this.sessionToChat.delete(binding.sessionId)
      } else {
        this.sessionToChat.set(binding.sessionId, input.chatId)
        binding.lastUsedAt ??= Date.now()
      }
    }

    this.saveBindings()
    return { ...binding }
  }

  /** 移除绑定（供设置页调用） */
  removeBindingExternal(chatId: string): boolean {
    const binding = this.chatBindings.get(chatId)
    if (!binding) return false
    this.removeBindingInternal(chatId, binding)
    this.saveBindings()
    return true
  }

  // ===== 绑定管理 =====

  private loadPersistedBindings(): void {
    const bindings = this.config.bindingStore?.load()
    if (!bindings || bindings.length === 0) return

    // 过滤掉会话已不存在的绑定
    const existing = filterExistingBridgeBindings(bindings, (sid) => {
      const sessions = listSessions()
      return sessions.some((s) => s.id === sid)
    }).filter((b) => this.isBindingValid(b))

    for (const binding of existing) {
      this.chatBindings.set(binding.chatId, binding)
      this.sessionToChat.set(binding.sessionId, binding.chatId)
    }

    if (existing.length !== bindings.length) {
      this.config.bindingStore?.save(existing)
    }
    if (existing.length > 0) {
      this.log(`已恢复 ${existing.length} 个聊天绑定`)
    }
  }

  private saveBindings(): void {
    this.config.bindingStore?.save(Array.from(this.chatBindings.values()))
  }

  private resolveValidWorkspaceId(): string {
    const requestedId = this.config.getDefaultWorkspaceId?.() ?? ''
    if (requestedId && getWorkspace(requestedId)) return requestedId
    const workspaces = listWorkspaces()
    if (workspaces.length > 0) return workspaces[0]!.id

    // 没有任何工作区时，自动创建一个默认工作区
    this.log('无可用工作区，自动创建默认工作区')
    const ws = createWorkspace({
      name: `${this.config.platformName} 项目`,
    })
    return ws.id
  }

  private isBindingValid(binding: BridgeChatBinding): boolean {
    const sessions = listSessions()
    const session = sessions.find((s) => s.id === binding.sessionId)
    if (!session) return false
    if (session.workspaceId && session.workspaceId !== binding.workspaceId) return false
    return !binding.workspaceId || Boolean(getWorkspace(binding.workspaceId))
  }

  private removeBindingInternal(chatId: string, binding: BridgeChatBinding): void {
    this.chatBindings.delete(chatId)
    if (this.sessionToChat.get(binding.sessionId) === chatId) {
      this.sessionToChat.delete(binding.sessionId)
    }
    this.sessionBuffers.delete(binding.sessionId)
  }

  private getValidBinding(chatId: string): BridgeChatBinding | undefined {
    const binding = this.chatBindings.get(chatId)
    if (!binding) return undefined
    if (this.isBindingValid(binding)) return binding
    this.removeBindingInternal(chatId, binding)
    this.saveBindings()
    this.log(`移除已失效绑定: ${chatId.slice(0, 8)}...`)
    return undefined
  }

  // ===== 命令路由 =====

  private async handleCommand(chatId: string, text: string, contextData?: unknown): Promise<void> {
    const [command, ...args] = text.split(/\s+/)
    const arg = args.join(' ').trim()

    switch (command?.toLowerCase()) {
      case '/help':
      case '/h':
        await this.sendHelp(chatId, contextData)
        break

      case '/new':
      case '/n':
        await this.createNewSession(chatId, arg || undefined, contextData)
        break

      case '/list':
      case '/ls':
        await this.handleListCommand(chatId, contextData)
        break

      case '/stop':
      case '/s':
        await this.handleStopCommand(chatId, contextData)
        break

      case '/switch':
      case '/sw':
        if (!arg) {
          await this.send(chatId, '用法: /switch <序号>（先用 /list 查看）', contextData)
          return
        }
        await this.handleSwitchCommand(chatId, arg, contextData)
        break

      case '/workspace':
      case '/ws':
        await this.handleWorkspaceCommand(chatId, arg || undefined, contextData)
        break

      case '/now':
        await this.handleNowCommand(chatId, contextData)
        break

      default:
        await this.send(chatId, `未知命令: ${command}。输入 /help 查看帮助。`, contextData)
    }
  }

  // ===== 命令实现 =====

  private async sendHelp(chatId: string, contextData?: unknown): Promise<void> {
    const lines = [
      '可用命令（斜杠后为简写）:',
      '',
      '/help (/h) — 显示此帮助',
      '/new (/n) [标题] — 创建新 Agent 会话',
      '/list (/ls) — 列出所有会话',
      '/switch (/sw) <序号> — 切换到指定会话',
      '/stop (/s) — 停止当前 Agent',
      '/workspace (/ws) [名称] — 查看或切换工作区',
      '/now — 查看当前状态',
    ]
    await this.send(chatId, lines.join('\n'), contextData)
  }

  private async createNewSession(chatId: string, title?: string, contextData?: unknown): Promise<void> {
    const model = llmdbService.getEnabledModel()
    if (!model) {
      await this.send(chatId, '请先在 Diting 设置中启用一个 LLM 模型。', contextData)
      return
    }

    const workspaceId = this.resolveValidWorkspaceId()
    const session = createSession({
      title: title || '新会话',
      channelId: String(model.id),
      workspaceId: workspaceId || undefined,
    })

    const oldBinding = this.chatBindings.get(chatId)
    if (oldBinding) {
      this.sessionToChat.delete(oldBinding.sessionId)
    }

    const binding: BridgeChatBinding = {
      chatId,
      sessionId: session.id,
      workspaceId,
      channelId: String(model.id),
      modelId: model.model_name,
      source: this.detectBindingSource(),
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    }
    this.chatBindings.set(chatId, binding)
    this.sessionToChat.set(session.id, chatId)
    this.saveBindings()

    this.notifySessionCreated(session.id, session.title)
    await this.send(chatId, `已创建 Agent 会话: ${session.title} (${session.id.slice(0, 8)})`, contextData)
  }

  private async handleListCommand(chatId: string, contextData?: unknown): Promise<void> {
    const sessions = listSessions()
    const workspaces = listWorkspaces()
    const binding = this.chatBindings.get(chatId)

    if (sessions.length === 0) {
      await this.send(chatId, '暂无会话。发送消息将自动创建，或使用 /new 创建。', contextData)
      return
    }

    const MAX_PER_WS = 5
    const lines: string[] = ['会话列表:']

    for (const ws of workspaces) {
      const wsSessions = sessions.filter((s) => s.workspaceId === ws.id).slice(0, MAX_PER_WS)
      if (wsSessions.length === 0) continue
      lines.push('')
      lines.push(`【${ws.name}】`)
      for (const s of wsSessions) {
        const globalIdx = sessions.indexOf(s) + 1
        const marker = binding?.sessionId === s.id ? ' ← 当前' : ''
        lines.push(`  ${globalIdx}. ${s.title} (${s.id.slice(0, 8)})${marker}`)
      }
    }

    const orphans = sessions
      .filter((s) => !s.workspaceId || !workspaces.some((w) => w.id === s.workspaceId))
      .slice(0, MAX_PER_WS)

    if (orphans.length > 0) {
      lines.push('')
      lines.push('【未分配项目】')
      for (const s of orphans) {
        const globalIdx = sessions.indexOf(s) + 1
        const marker = binding?.sessionId === s.id ? ' ← 当前' : ''
        lines.push(`  ${globalIdx}. ${s.title} (${s.id.slice(0, 8)})${marker}`)
      }
    }

    lines.push('')
    lines.push('使用 /switch <序号> 切换会话')
    await this.send(chatId, lines.join('\n'), contextData)
  }

  private async handleStopCommand(chatId: string, contextData?: unknown): Promise<void> {
    const binding = this.chatBindings.get(chatId)
    if (!binding) {
      await this.send(chatId, '当前没有绑定的会话。', contextData)
      return
    }
    abortSession(binding.sessionId)
    this.sessionBuffers.delete(binding.sessionId)
    await this.send(chatId, '已停止 Agent', contextData)
  }

  private async handleSwitchCommand(chatId: string, arg: string, contextData?: unknown): Promise<void> {
    const sessions = listSessions()
    const model = llmdbService.getEnabledModel()

    const index = Number(arg)
    const match = Number.isInteger(index) && index >= 1 && index <= sessions.length
      ? sessions[index - 1]
      : sessions.find((s) => s.id.startsWith(arg))

    if (!match) {
      await this.send(chatId, `未找到会话。使用 /list 查看可用会话。`, contextData)
      return
    }

    const oldBinding = this.chatBindings.get(chatId)
    if (oldBinding) {
      this.sessionToChat.delete(oldBinding.sessionId)
    }

    const binding: BridgeChatBinding = {
      chatId,
      sessionId: match.id,
      workspaceId: match.workspaceId ?? this.resolveValidWorkspaceId(),
      channelId: match.channelId || (model ? String(model.id) : ''),
      modelId: model?.model_name,
      source: this.detectBindingSource(),
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    }
    this.chatBindings.set(chatId, binding)
    this.sessionToChat.set(match.id, chatId)
    this.saveBindings()

    await this.send(chatId, `已切换到会话: ${match.title} (${match.id.slice(0, 8)})`, contextData)
  }

  private async handleWorkspaceCommand(chatId: string, arg?: string, contextData?: unknown): Promise<void> {
    const workspaces = listWorkspaces()
    const binding = this.chatBindings.get(chatId)
    const currentWorkspaceId = binding?.workspaceId

    if (!arg) {
      if (workspaces.length === 0) {
        await this.send(chatId, '暂无项目。', contextData)
        return
      }
      const lines = ['项目列表:']
      workspaces.forEach((w, i) => {
        const marker = w.id === currentWorkspaceId ? ' ← 当前' : ''
        lines.push(`  ${i + 1}. ${w.name}${marker}`)
      })
      lines.push('')
      lines.push('使用 /workspace <序号或名称> 切换项目')
      await this.send(chatId, lines.join('\n'), contextData)
      return
    }

    const index = Number(arg)
    const match = Number.isInteger(index) && index >= 1 && index <= workspaces.length
      ? workspaces[index - 1]
      : workspaces.find((w) => w.name.toLowerCase() === arg.toLowerCase() || w.slug === arg.toLowerCase())

    if (!match) {
      const available = workspaces.map((w, i) => `${i + 1}. ${w.name}`).join(', ')
      await this.send(chatId, `未找到项目 "${arg}"。可用: ${available}`, contextData)
      return
    }

    if (binding) {
      this.sessionToChat.delete(binding.sessionId)
      this.chatBindings.delete(chatId)
      this.saveBindings()
    }

    await this.config.onWorkspaceSwitched?.(match.id)

    const sessions = listSessions()
    const recentSessions = sessions.filter((s) => s.workspaceId === match.id).slice(0, 5)

    const lines = [`已切换到项目: ${match.name}`]
    if (recentSessions.length > 0) {
      lines.push('')
      lines.push('最近会话:')
      recentSessions.forEach((s) => {
        const globalIdx = sessions.indexOf(s) + 1
        lines.push(`  ${globalIdx}. ${s.title} (${s.id.slice(0, 8)})`)
      })
      lines.push('')
      lines.push('使用 /switch <序号> 切换，或发送消息自动创建新会话')
    } else {
      lines.push('该项目暂无会话，发送消息将自动创建。')
    }

    await this.send(chatId, lines.join('\n'), contextData)
  }

  private async handleNowCommand(chatId: string, contextData?: unknown): Promise<void> {
    const binding = this.chatBindings.get(chatId)
    const lines: string[] = ['当前状态:']

    if (binding) {
      const sessions = listSessions()
      const session = sessions.find((s) => s.id === binding.sessionId)
      lines.push(`会话: ${session?.title ?? '未知'} (${binding.sessionId.slice(0, 8)})`)
      if (binding.modelId) {
        lines.push(`模型: ${binding.modelId}`)
      }
    } else {
      lines.push('会话: 未绑定（发送消息将自动创建）')
    }

    const workspaceId = binding?.workspaceId
    const workspace = workspaceId ? getWorkspace(workspaceId) : undefined
    if (workspace) {
      lines.push(`项目: ${workspace.name} (${workspace.slug})`)
    } else {
      lines.push('项目: 未设置')
    }

    await this.send(chatId, lines.join('\n'), contextData)
  }

  // ===== Agent 消息路由 =====

  private async handleUserMessage(
    chatId: string,
    text: string,
    contextData?: unknown,
    attachments?: BridgeAttachment[],
  ): Promise<void> {
    const model = llmdbService.getEnabledModel()
    if (!model) {
      await this.send(chatId, '请先在 Diting 设置中启用一个 LLM 模型。', contextData)
      return
    }

    let binding = this.ensureBinding(chatId)
    if (!binding) {
      await this.send(chatId, '请先在 Diting 设置中启用一个 LLM 模型。', contextData)
      return
    }

    // 并发保护
    if (this.isSessionActive(chatId)) {
      await this.send(chatId, '上一条消息仍在处理中，请稍候再试', contextData)
      return
    }

    // 即时确认
    const workspace = binding.workspaceId ? getWorkspace(binding.workspaceId) : undefined
    const sessions = listSessions()
    const session = sessions.find((s) => s.id === binding!.sessionId)
    const wsName = workspace?.name ?? '默认'
    const chatName = session?.title ?? '新会话'
    await this.send(chatId, `${wsName} → ${chatName}: Agent 处理中...`, contextData)

    // 通知前端：Bridge 消息已进入 Agent 处理，启动消息轮询以实时刷新 UI
    this.notifyBridgeMessage(binding.sessionId, binding.workspaceId)

    // 再次确保
    binding = this.ensureBinding(chatId)
    if (!binding) {
      await this.send(chatId, '当前项目已不可用，请在 Diting 中重新选择项目后再试。', contextData)
      return
    }

    // 初始化回复缓冲
    this.sessionBuffers.set(binding.sessionId, {
      text: '',
      chatId,
      contextData,
      startedAt: Date.now(),
    })

    // 安全超时：5 分钟后如果 buffer 还在（Agent 未正常完成），强制清理
    this.startSafetyTimeout(binding.sessionId, chatId, contextData)

    // 构建 Agent 渠道
    const channel: AgentChannel = {
      id: String(model.id),
      name: model.name,
      provider: model.provider,
      apiKey: model.api_key,
      baseUrl: model.base_url,
      modelId: model.model_name,
      enabled: true,
    }

    // 构建 workspace
    const agentWorkspace: WorkspaceMeta | undefined = binding.workspaceId
      ? getWorkspace(binding.workspaceId) ?? undefined
      : undefined

    // 拼接附件
    const fileReferences = attachments?.length
      ? buildAttachedFilesBlock(attachments.map((a) => ({ label: a.label, path: a.absolutePath })))
      : ''
    const effectiveText = text.trim() || (attachments?.length ? '请查看上面附加的文件。' : '')
    const userMessage = fileReferences + effectiveText

    // 事件回调
    const onEvent: AgentEventCallback = (event: string, data: unknown) => {
      this.handleAgentEvent(binding!.sessionId, event, data, chatId, contextData)
    }

    // 调用 Agent
    try {
      await sendAgentMessage(
        {
          sessionId: binding.sessionId,
          message: userMessage,
          channelId: String(model.id),
          workspaceId: binding.workspaceId,
          permissionMode: 'bypassPermissions',
        },
        channel,
        agentWorkspace,
        onEvent,
      )
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error)
      this.log(`Agent 错误: ${errMsg}`)
      this.clearSafetyTimeout(binding.sessionId)
      await this.send(chatId, `Agent 错误: ${errMsg}`, contextData).catch(() => {})
      this.sessionBuffers.delete(binding.sessionId)
    }
  }

  // ===== Agent 事件处理 =====

  private handleAgentEvent(
    sessionId: string,
    event: string,
    data: unknown,
    chatId: string,
    contextData: unknown,
  ): void {
    const buffer = this.sessionBuffers.get(sessionId)
    if (!buffer) return

    switch (event) {
      case 'text': {
        const delta = (data as { delta?: string }).delta
        if (delta) buffer.text += delta
        break
      }

      case 'complete': {
        this.handleSessionComplete(sessionId)
        break
      }

      case 'error': {
        const error = (data as { error?: string }).error || '未知错误'
        this.log(`Agent 错误: ${error}`)
        this.send(chatId, `Agent 错误: ${error}`, contextData).catch(() => {})
        this.clearSafetyTimeout(sessionId)
        this.sessionBuffers.delete(sessionId)
        // 通知前端停止轮询
        this.notifyBridgeMessageDone(sessionId)
        break
      }
    }
  }

  private handleSessionComplete(sessionId: string): void {
    const buffer = this.sessionBuffers.get(sessionId)
    if (!buffer) return

    const duration = ((Date.now() - buffer.startedAt) / 1000).toFixed(1)
    const replyText = buffer.text.trim() || 'Agent 已完成（无文本输出）'

    this.log(`Agent 回复 (${duration}s): ${replyText.slice(0, 100)}${replyText.length > 100 ? '...' : ''}`)

    // 优先使用 Markdown 格式发送（飞书等支持富文本的平台），回退到纯文本
    // 确保 sessionBuffers 一定会被清理，即使发送失败
    const sendReply = async (): Promise<void> => {
      try {
        if (this.config.adapter.sendMarkdown) {
          await this.config.adapter.sendMarkdown(buffer.chatId, replyText, buffer.contextData)
        } else {
          await this.config.adapter.sendText(buffer.chatId, replyText, buffer.contextData)
        }
      } catch (err) {
        logger.error(`[${this.config.platformName} Bridge] 发送回复失败:`, redactSensitiveLogValue(err))
        // 回退到纯文本重试一次
        try {
          await this.config.adapter.sendText(buffer.chatId, replyText, buffer.contextData)
        } catch (retryErr) {
          logger.error(`[${this.config.platformName} Bridge] 回退发送也失败:`, redactSensitiveLogValue(retryErr))
        }
      }
    }

    // 不阻塞事件回调，异步发送回复
    sendReply().catch((err) => {
      logger.error(`[${this.config.platformName} Bridge] 发送回复异常:`, redactSensitiveLogValue(err))
    })

    // 立即清理 buffer，确保后续消息不会被并发保护拦截
    this.clearSafetyTimeout(sessionId)
    this.sessionBuffers.delete(sessionId)
    // 通知前端停止轮询
    this.notifyBridgeMessageDone(sessionId)
  }

  // ===== 安全超时管理 =====

  /** 启动安全超时定时器，防止 Agent 异常不触发 complete/error 导致 buffer 泄漏 */
  private startSafetyTimeout(sessionId: string, chatId: string, contextData: unknown): void {
    // 先清理已有的定时器
    this.clearSafetyTimeout(sessionId)

    const timer = setTimeout(() => {
      if (this.sessionBuffers.has(sessionId)) {
        this.log('Agent 超时（5 分钟未完成），自动清理会话缓冲')
        this.sessionBuffers.delete(sessionId)
        this.send(chatId, '⚠️ Agent 处理超时，请重新发送消息', contextData).catch(() => {})
        this.notifyBridgeMessageDone(sessionId)
      }
      this.safetyTimers.delete(sessionId)
    }, BridgeCommandHandler.SAFETY_TIMEOUT_MS)

    this.safetyTimers.set(sessionId, timer)
  }

  /** 清除安全超时定时器 */
  private clearSafetyTimeout(sessionId: string): void {
    const timer = this.safetyTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.safetyTimers.delete(sessionId)
    }
  }

  // ===== 工具方法 =====

  private async send(chatId: string, text: string, contextData?: unknown): Promise<void> {
    await this.config.adapter.sendText(chatId, text, contextData)
  }

  private log(msg: string): void {
    logger.info(`[${this.config.platformName} Bridge] ${redactSensitiveLogText(msg)}`)
  }

  /** 根据平台名称推断绑定来源 */
  private detectBindingSource(): 'feishu' | 'wechat' | 'dingtalk' {
    const name = this.config.platformName
    if (name.includes('飞书')) return 'feishu'
    if (name.includes('微信')) return 'wechat'
    if (name.includes('钉钉')) return 'dingtalk'
    return 'feishu'
  }

  private notifySessionCreated(sessionId: string, title: string): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('controller/bridge/sessionCreated', { sessionId, title })
      }
    }
  }

  /** 通知前端：Bridge 消息已进入 Agent 处理，前端应启动消息轮询 */
  private notifyBridgeMessage(sessionId: string, workspaceId?: string): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('controller/bridge/messageStart', { sessionId, workspaceId })
      }
    }
  }

  /** 通知前端：Bridge Agent 处理已完成，前端应停止消息轮询 */
  private notifyBridgeMessageDone(sessionId: string): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('controller/bridge/messageDone', { sessionId })
      }
    }
  }
}
