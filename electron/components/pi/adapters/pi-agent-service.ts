/**
 * Pi Agent 核心服务
 *
 * 移植自 Proma 的 PiAgentAdapter，适配 Diting 的 ee-core 架构。
 * 负责：Pi SDK 会话创建、提示词构建（Skills 注入）、事件流处理、消息持久化。
 */

import { logger } from 'ee-core/log'
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { loadPiSdk } from './pi-loader'
import type { AgentSession, AgentSessionEvent, AgentSessionEventListener, Skill, ToolDefinition } from './pi-loader'
import {
  getAgentSessionsDir,
  getAgentSessionsIndexPath,
  getWorkspaceSkillsDir,
  getWorkspaceClaudeMdPath,
} from '../config-paths'
import { buildPiMcpTools, disposePiMcpConnections } from './pi-mcp-tools'
import { getWorkspaceMcpConfig, getWorkspaceCwd } from './workspace-manager'
import type { WorkspaceMeta } from './workspace-manager'
import type { AgentChannel, AgentMessage, AgentSessionMeta } from '../types'

/** Agent 发送输入 */
export interface AgentSendInput {
  sessionId: string
  message: string
  channelId?: string
  workspaceId?: string
  agentRuntime?: 'pi'
  permissionMode?: string
}

/** Agent 事件流回调 */
export type AgentEventCallback = (event: string, data: unknown) => void

/** 活跃会话信息 */
interface ActiveSession {
  piSession: AgentSession
  abortController: AbortController
  workspace?: WorkspaceMeta
}

/** 活跃会话 Map */
const activeSessions = new Map<string, ActiveSession>()

// ========== 会话索引管理 ==========

function readSessionIndex(): AgentSessionMeta[] {
  const indexPath = getAgentSessionsIndexPath()
  if (!existsSync(indexPath)) return []
  try {
    return JSON.parse(readFileSync(indexPath, 'utf-8')) as AgentSessionMeta[]
  } catch { return [] }
}

function writeSessionIndex(sessions: AgentSessionMeta[]): void {
  writeFileSync(getAgentSessionsIndexPath(), JSON.stringify(sessions, null, 2), 'utf-8')
}

/** 列出所有会话 */
export function listSessions(): AgentSessionMeta[] {
  return readSessionIndex().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
}

/** 创建会话 */
export function createSession(input: { title?: string; channelId?: string; workspaceId?: string }): AgentSessionMeta {
  const sessions = readSessionIndex()
  const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const now = Date.now()

  const session: AgentSessionMeta = {
    id,
    title: input.title || `Agent 会话 ${sessions.length + 1}`,
    channelId: input.channelId || '',
    workspaceId: input.workspaceId || '',
    agentRuntime: 'pi',
    sdkSessionId: '',
    createdAt: now,
    updatedAt: now,
  }

  sessions.push(session)
  writeSessionIndex(sessions)

  // 创建会话消息文件
  const sessionsDir = getAgentSessionsDir()
  if (!existsSync(sessionsDir)) mkdirSync(sessionsDir, { recursive: true })
  const sessionFile = join(sessionsDir, `${id}.jsonl`)
  writeFileSync(sessionFile, '', 'utf-8')

  logger.info(`[Pi Agent] 已创建会话: ${id}`)
  return session
}

/** 更新会话 */
export function updateSession(id: string, input: Partial<AgentSessionMeta>): AgentSessionMeta | null {
  const sessions = readSessionIndex()
  const idx = sessions.findIndex((s) => s.id === id)
  if (idx === -1) return null
  sessions[idx] = { ...sessions[idx], ...input, updatedAt: Date.now() }
  writeSessionIndex(sessions)
  return sessions[idx]
}

/** 删除会话 */
export function deleteSession(id: string): boolean {
  const sessions = readSessionIndex()
  const filtered = sessions.filter((s) => s.id !== id)
  if (filtered.length === sessions.length) return false
  writeSessionIndex(filtered)

  // 删除消息文件
  const sessionFile = join(getAgentSessionsDir(), `${id}.jsonl`)
  if (existsSync(sessionFile)) {
    try { unlinkSync(sessionFile) } catch { /* 忽略 */ }
  }

  // 终止活跃会话
  const active = activeSessions.get(id)
  if (active) {
    active.abortController.abort()
    activeSessions.delete(id)
  }

  logger.info(`[Pi Agent] 已删除会话: ${id}`)
  return true
}

// ========== 消息持久化 ==========

function appendMessage(sessionId: string, message: AgentMessage): void {
  const sessionFile = join(getAgentSessionsDir(), `${sessionId}.jsonl`)
  appendFileSync(sessionFile, JSON.stringify(message) + '\n', 'utf-8')
}

function readMessages(sessionId: string): AgentMessage[] {
  const sessionFile = join(getAgentSessionsDir(), `${sessionId}.jsonl`)
  if (!existsSync(sessionFile)) return []
  const lines = readFileSync(sessionFile, 'utf-8').split('\n').filter(Boolean)
  return lines.map((line) => {
    try { return JSON.parse(line) as AgentMessage } catch { return null }
  }).filter((msg): msg is AgentMessage => msg !== null)
}

// ========== 提示词构建 ==========

function buildSystemPrompt(workspace?: WorkspaceMeta, skills?: Skill[]): string {
  const parts: string[] = []

  // 基础身份
  parts.push('You are a helpful AI assistant integrated into Diting AI, a local-first desktop application.')
  parts.push('You can read and write files, execute commands, and use MCP tools.')

  // 工作区上下文
  if (workspace) {
    parts.push(`\n## 工作区: ${workspace.name}`)
    if (workspace.description) parts.push(workspace.description)
    if (workspace.projectPath) parts.push(`项目根目录: ${workspace.projectPath}`)

    // 注入 CLAUDE.md
    const claudeMdPath = getWorkspaceClaudeMdPath(workspace.slug)
    if (existsSync(claudeMdPath)) {
      const claudeMd = readFileSync(claudeMdPath, 'utf-8')
      parts.push(`\n## 项目说明\n${claudeMd}`)
    }
  }

  // Skills 注入
  if (skills && skills.length > 0) {
    parts.push('\n## 可用 Skills')
    for (const skill of skills) {
      const frontmatter = skill.frontmatter
      parts.push(`- **${frontmatter.name}** (v${frontmatter.version}): ${frontmatter.description || '无描述'}`)
    }
    parts.push('\n使用 `/skill <name>` 可以调用某个 Skill。')
  }

  return parts.join('\n')
}

// ========== 核心：发送 Agent 消息 ==========

/**
 * 发送 Agent 消息并流式返回事件
 */
export async function sendAgentMessage(
  input: AgentSendInput,
  channel: AgentChannel,
  workspace: WorkspaceMeta | undefined,
  onEvent: AgentEventCallback,
): Promise<void> {
  const { sessionId, message } = input

  // 检查是否已有活跃会话
  if (activeSessions.has(sessionId)) {
    throw new Error('该会话正在处理中，请等待当前请求完成')
  }

  // 持久化用户消息
  const userMessage: AgentMessage = {
    id: `msg-${Date.now()}`,
    sessionId,
    role: 'user',
    content: [{ type: 'text', text: message }],
    timestamp: Date.now(),
  }
  appendMessage(sessionId, userMessage)

  // 懒加载 Pi SDK（ESM 包，需动态 import）
  const { createAgentSession, loadSkills } = await loadPiSdk()

  // 加载 Skills
  let skills: Skill[] = []
  if (workspace) {
    const skillsDir = getWorkspaceSkillsDir(workspace.slug)
    if (existsSync(skillsDir)) {
      try {
        const result = await loadSkills(skillsDir)
        skills = result.skills
        logger.info(`[Pi Agent] 已加载 ${skills.length} 个 Skills`)
      } catch (err) {
        logger.warn('[Pi Agent] 加载 Skills 失败:', err)
      }
    }
  }

  // 构建 MCP 工具
  let mcpTools: ToolDefinition[] = []
  if (workspace) {
    const mcpConfig = getWorkspaceMcpConfig(workspace.slug)
    if (Object.keys(mcpConfig).length > 0) {
      try {
        mcpTools = await buildPiMcpTools(mcpConfig)
      } catch (err) {
        logger.warn('[Pi Agent] 构建 MCP 工具失败:', err)
      }
    }
  }

  // 构建系统提示词
  const systemPrompt = buildSystemPrompt(workspace, skills)

  // 获取工作区 cwd
  const cwd = workspace ? getWorkspaceCwd(workspace) : process.cwd()

  // 创建 AbortController
  const abortController = new AbortController()

  try {
    // 创建 Pi Agent 会话
    const piSession = await createAgentSession({
      cwd,
      model: channel.modelId || 'gpt-4o',
      provider: {
        name: `diting-${channel.id}`,
        protocol: 'openai',
        baseURL: channel.baseUrl || 'https://api.openai.com/v1',
        apiKey: channel.apiKey || '',
        model: channel.modelId || 'gpt-4o',
      },
      systemPrompt,
      tools: mcpTools,
      abortSignal: abortController.signal,
    })

    activeSessions.set(sessionId, { piSession, abortController, workspace })

    // 监听事件
    const eventListener: AgentSessionEventListener = (event: AgentSessionEvent) => {
      handlePiEvent(event, sessionId, onEvent)
    }

    piSession.on('message', eventListener)
    piSession.on('tool_call', eventListener)
    piSession.on('tool_result', eventListener)
    piSession.on('error', eventListener)
    piSession.on('end', eventListener)

    // 发送消息
    onEvent('start', { sessionId })

    const response = await piSession.prompt(message, {
      abortSignal: abortController.signal,
    })

    // 持久化 AI 消息
    const aiMessage: AgentMessage = {
      id: `msg-${Date.now()}-ai`,
      sessionId,
      role: 'assistant',
      content: [{ type: 'text', text: response.text || '' }],
      timestamp: Date.now(),
    }
    appendMessage(sessionId, aiMessage)

    onEvent('complete', { sessionId, reply: response.text })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.error('[Pi Agent] 发送消息失败:', err)
    onEvent('error', { sessionId, error: errorMessage })
  } finally {
    activeSessions.delete(sessionId)
    // 清理 MCP 连接
    await disposePiMcpConnections().catch(() => {})
  }
}

/** 中止会话 */
export function abortSession(sessionId: string): boolean {
  const active = activeSessions.get(sessionId)
  if (!active) return false
  active.abortController.abort()
  activeSessions.delete(sessionId)
  logger.info(`[Pi Agent] 已中止会话: ${sessionId}`)
  return true
}

/** 处理 Pi SDK 事件并转发 */
function handlePiEvent(event: AgentSessionEvent, sessionId: string, onEvent: AgentEventCallback): void {
  const { type } = event

  switch (type) {
    case 'message_start':
      onEvent('text', { sessionId, delta: '' })
      break
    case 'message_update': {
      const text = (event as any).delta || (event as any).text || ''
      if (text) onEvent('text', { sessionId, delta: text })
      break
    }
    case 'tool_call_start': {
      const toolName = (event as any).toolName || (event as any).name || 'unknown'
      onEvent('tool_start', { sessionId, toolName, input: (event as any).input })
      break
    }
    case 'tool_call_end': {
      const toolName = (event as any).toolName || (event as any).name || 'unknown'
      onEvent('tool_result', { sessionId, toolName, result: (event as any).result, isError: (event as any).isError })
      break
    }
    case 'message_end':
      // 由 sendAgentMessage 处理 complete 事件
      break
    case 'error':
      onEvent('error', { sessionId, error: (event as any).error?.message || 'Unknown error' })
      break
    default:
      // 转发未处理的事件类型
      onEvent(type, { sessionId, ...(event as any) })
      break
  }
}

/** 获取会话消息列表 */
export function getSessionMessages(sessionId: string): AgentMessage[] {
  return readMessages(sessionId)
}
