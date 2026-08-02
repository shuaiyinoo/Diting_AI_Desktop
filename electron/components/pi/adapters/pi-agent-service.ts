/**
 * Pi Agent 核心服务
 *
 * 移植自 Proma 的 PiAgentAdapter，适配 Diting 的 ee-core 架构。
 * 负责：Pi SDK 会话创建、提示词构建（Skills 注入）、事件流处理、消息持久化。
 */

import { logger } from 'ee-core/log'
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, unlinkSync } from 'fs'
import { join, basename, dirname } from 'path'
import { loadPiSdk, loadTypebox } from './pi-loader'
import type { AgentSessionEvent, AgentSessionEventListener, Skill, ToolDefinition, ResourceLoader } from './pi-loader'
import {
  getAgentSessionsDir,
  getAgentSessionsIndexPath,
  getWorkspaceSkillsDir,
  getWorkspaceClaudeMdPath,
  getSdkConfigDir,
  getDefaultSkillsDir,
} from '../config-paths'
import { buildPiMcpTools, disposePiMcpConnections } from './pi-mcp-tools'
import { getWorkspaceMcpConfig, getWorkspaceCwd } from './workspace-manager'
import type { WorkspaceMeta } from './workspace-manager'
import type { AgentChannel, AgentMessage, AgentSessionMeta } from '../types'
import { channelToPiProvider } from './pi-model-registry'
import { permissionService } from './agent-permission-service'
import type { PermissionRequest, AskUserRequest, CanUseToolOptions, PermissionResult } from './agent-permission-service'

/** Agent 发送输入 */
export interface AgentSendInput {
  sessionId: string
  message: string
  channelId?: string
  workspaceId?: string
  agentRuntime?: 'pi'
  permissionMode?: string
}

/** 权限响应输入（前端回传） */
export interface PermissionResponseInput {
  requestId: string
  behavior: 'allow' | 'deny'
  alwaysAllow?: boolean
}

/** AskUser 响应输入（前端回传） */
export interface AskUserResponseInput {
  requestId: string
  answers: Record<string, string>
}

/** Agent 事件流回调 */
export type AgentEventCallback = (event: string, data: unknown) => void

/** 活跃会话信息 */
interface ActiveSession {
  unsubscribe: (() => void) | null
  abortController: AbortController
  workspace?: WorkspaceMeta
  /** 发送 SSE 事件到前端的回调 */
  onEvent?: AgentEventCallback
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

/** 更新会话（仅覆盖显式传入的字段，忽略 undefined，防止丢失 workspaceId 等关联字段） */
export function updateSession(id: string, input: Partial<AgentSessionMeta>): AgentSessionMeta | null {
  const sessions = readSessionIndex()
  const idx = sessions.findIndex((s) => s.id === id)
  if (idx === -1) return null

  const session = sessions[idx]
  // 只更新显式提供的字段，避免 undefined 覆盖已有值（JSON.stringify 会丢弃 undefined 导致字段消失）
  if (input.title !== undefined) session.title = input.title
  if (input.channelId !== undefined) session.channelId = input.channelId
  if (input.workspaceId !== undefined) session.workspaceId = input.workspaceId
  if (input.sdkSessionId !== undefined) session.sdkSessionId = input.sdkSessionId
  session.updatedAt = Date.now()

  writeSessionIndex(sessions)
  return session
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
    if (active.unsubscribe) {
      active.unsubscribe()
    }
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

function buildSystemPrompt(workspace?: WorkspaceMeta): string {
  const parts: string[] = []

  // 基础身份
  parts.push('You are a helpful AI assistant integrated into Diting AI, a local-first desktop application.')
  parts.push('You can read and write files, execute commands, and use MCP tools.')

  // 工具使用指南（引导 Agent 自主使用任务跟踪工具）
  parts.push(`
## 工具使用指南
- **可见进度（积极使用）**：只要任务需要 2 次以上工具调用、涉及多个文件/阶段、或需要调研后实施，就在第一次实质操作前用 TaskCreate 创建 3–7 个任务；简单问答不创建。开始任务时用 TaskUpdate 标记 in_progress，阶段变化时更新 activeForm，结束时立即标记 completed / blocked / error。
  - **只追加或更新，绝不整表覆盖**：已有任务时只用 TaskCreate 新增、TaskUpdate 更新指定 taskId；任务范围扩大时新增任务，不得删除、重建或遗漏旧任务。
  - **术语不要混淆**：TaskCreate / TaskUpdate 是你的可见进度工具，用于向用户展示工作计划与完成情况。
- **大文件写入**：写入超过约 10,000 字时，主动拆分为多次写入——先 Write 首段，再用 Edit 追加后续段落，避免 token 截断。
- **回复中的代码块必须标语言**：在 Markdown 回复里写 fenced code block 时，开头围栏一定要紧跟语言标识（\`\`\`ts / \`\`\`python / \`\`\`json 等），纯文本用 \`\`\`text。`)

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

  // 注意：Skills 列表由 Pi SDK 通过 formatSkillsForPrompt() 自动注入系统提示词，
  // 不需要在此手动列出。SDK 会从 ResourceLoader.getSkills() 获取并通过 XML 格式注入。

  return parts.join('\n')
}

// ========== Skills 提示词扩展 ==========

/** /skill:name 命令匹配模式 */
const SKILL_COMMAND_PATTERN = /\/skill:([A-Za-z0-9][A-Za-z0-9._-]*)/g

/** 转义 XML 属性值 */
function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** 剥离 SKILL.md 的 YAML frontmatter，只保留正文内容 */
function stripSkillFrontmatter(content: string): string {
  const normalized = content.replace(/^\uFEFF/, '')
  const frontmatter = normalized.match(/^---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)\s*(?:\r?\n|$)/)
  return frontmatter ? normalized.slice(frontmatter[0].length) : content
}

/** 获取 Skill 的所有别名（name + 目录名） */
function skillCommandAliases(skill: Skill): string[] {
  const aliases = [skill.name, basename(skill.baseDir), basename(dirname(skill.filePath))]
  return aliases.filter((alias, index, arr) => Boolean(alias) && arr.indexOf(alias) === index)
}

/** 从用户输入中提取 /skill:name 命令 */
function extractSkillCommandNames(prompt: string): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const match of prompt.matchAll(SKILL_COMMAND_PATTERN)) {
    const name = match[1]?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    names.push(name)
  }
  return names
}

/** 构建 Skill 查找表（name → Skill） */
function buildSkillLookup(skills: Skill[]): Map<string, Skill> {
  const lookup = new Map<string, Skill>()
  for (const skill of skills) {
    for (const alias of skillCommandAliases(skill)) {
      if (!lookup.has(alias)) lookup.set(alias, skill)
    }
  }
  return lookup
}

/** 将 Skill 内容格式化为 XML 块，注入到用户提示词前 */
function formatSkillForPrompt(skill: Skill): string | undefined {
  try {
    const body = stripSkillFrontmatter(readFileSync(skill.filePath, 'utf-8')).trim()
    return `<skill name="${escapeXmlAttribute(skill.name)}" location="${escapeXmlAttribute(skill.filePath)}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`
  } catch (error) {
    logger.warn(`[Pi Agent] Skill 展开失败: ${skill.filePath}`, error)
    return undefined
  }
}

/**
 * 预处理用户提示词：检测 /skill:name 命令并注入完整 Skill 内容
 *
 * 移植自 Proma 的 preparePromptWithPromaSkills。
 * 当用户输入包含 /skill:name 时，读取对应 SKILL.md 的完整内容（去除 frontmatter），
 * 以 XML 块形式注入到用户消息前，让 LLM 获得该 Skill 的完整指令。
 */
async function preparePromptWithSkills(
  resourceLoader: ResourceLoader,
  prompt: string,
): Promise<string> {
  await resourceLoader.reload()

  const requestedNames = extractSkillCommandNames(prompt)
  if (requestedNames.length === 0) return prompt

  const skillLookup = buildSkillLookup(resourceLoader.getSkills().skills)
  const blocks: string[] = []
  const injectedSkillNames = new Set<string>()

  for (const requestedName of requestedNames) {
    const skill = skillLookup.get(requestedName)
    if (!skill || injectedSkillNames.has(skill.name)) continue
    const block = formatSkillForPrompt(skill)
    if (!block) continue
    injectedSkillNames.add(skill.name)
    blocks.push(block)
  }

  if (blocks.length === 0) return prompt
  return `${blocks.join('\n\n')}\n\n${prompt}`
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
  const { createAgentSession, ModelRuntime, DefaultResourceLoader, SessionManager, SettingsManager } = await loadPiSdk()

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

  // 构建系统提示词（Skills 列表由 SDK 自动注入，不再手动列出）
  const systemPrompt = buildSystemPrompt(workspace)

  // 获取工作区 cwd
  const cwd = workspace ? getWorkspaceCwd(workspace) : process.cwd()

  // Skills 目录路径（传递给 SDK 的 ResourceLoader）
  // 始终包含公共 default-skills 目录，确保无工作区时也能使用公共 Skills
  const additionalSkillPaths: string[] = [getDefaultSkillsDir()]
  // 工作区有独立的 skills 目录时，额外加入（允许工作区级别覆盖或扩展）
  if (workspace) {
    additionalSkillPaths.push(getWorkspaceSkillsDir(workspace.slug))
  }

  // 创建 AbortController
  const abortController = new AbortController()

  // 将渠道转换为 Pi Provider 配置
  const piProvider = channelToPiProvider(channel)
  if (!piProvider) {
    throw new Error(`无法将渠道 ${channel.name} 转换为 Pi Provider`)
  }

  // API 协议映射：pi-model-registry 的 protocol → Pi SDK api 类型
  const apiMap: Record<string, string> = {
    openai: 'openai-completions',
    anthropic: 'anthropic-messages',
    google: 'google-generative-ai',
    'openai-responses': 'openai-responses',
  }

  try {
    // 创建 ModelRuntime 并注册自定义 Provider
    const modelRuntime = await ModelRuntime.create()
    const providerId = piProvider.name
    modelRuntime.registerProvider(providerId, {
      name: channel.name || providerId,
      baseUrl: piProvider.baseURL,
      apiKey: piProvider.apiKey,
      api: apiMap[piProvider.protocol] || 'openai-completions',
      models: [{
        id: piProvider.model,
        name: piProvider.model,
        reasoning: false,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      }],
    })
    await modelRuntime.setRuntimeApiKey(providerId, piProvider.apiKey)

    // 获取已注册的模型
    const model = modelRuntime.getModel(providerId, piProvider.model)
    if (!model) {
      throw new Error(`无法从 ModelRuntime 获取模型: ${providerId}/${piProvider.model}`)
    }

    // 构建 ResourceLoader
    // 关键：通过 additionalSkillPaths 让 SDK 发现工作区 Skills，
    // noSkills: true 禁用 SDK 默认目录的 Skill 发现（避免加载 ~/.pi/agent/skills 中的无关 Skill），
    // SDK 会自动调用 formatSkillsForPrompt() 将 Skills 列表注入系统提示词。
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir: getSdkConfigDir(),
      noSkills: true,
      additionalSkillPaths,
      systemPromptOverride: () => systemPrompt,
      appendSystemPromptOverride: () => [],
    })
    await resourceLoader.reload()

    // 记录 Skills 加载诊断
    const skillDiagnostics = resourceLoader.getSkills().diagnostics
    for (const diagnostic of skillDiagnostics) {
      const level = diagnostic.type === 'error' ? 'error' : 'warn'
      logger[level](`[Pi Agent] Skill 加载诊断: ${diagnostic.path ?? '(unknown)'} ${diagnostic.message}`)
    }
    const loadedSkills = resourceLoader.getSkills().skills
    logger.info(`[Pi Agent] 已通过 ResourceLoader 加载 ${loadedSkills.length} 个 Skills`)

    // 创建 canUseTool 回调
  // 权限请求通过 SSE 发送到前端，前端响应后回传结果
  const canUseTool = permissionService.createCanUseTool(
    sessionId,
    (request: PermissionRequest) => {
      // 发送权限请求 SSE 事件到前端
      onEvent('permission_request', request)
    },
    (request: AskUserRequest) => {
      // 发送 AskUser 请求 SSE 事件到前端
      onEvent('ask_user', request)
    },
  )

  // 创建 AskUserQuestion 自定义工具
  // LLM 可调用此工具向用户提出结构化问题，前端展示交互式问答横幅
  const sdkModule = await loadPiSdk()
  const { Type } = await loadTypebox()
  const askUserQuestionTool = sdkModule.defineTool({
    name: 'AskUserQuestion',
    label: '询问用户',
    description: '当需要用户选择、补充信息或确认偏好时调用，会展示可交互问答横幅。',
    promptSnippet: '向用户提出结构化问题并等待回答。',
    parameters: Type.Object({
      questions: Type.Array(Type.Object({
        question: Type.String({ description: '要询问用户的问题。' }),
        header: Type.Optional(Type.String({ description: '简短标题。' })),
        multiSelect: Type.Optional(Type.Boolean({ description: '是否允许多选。' })),
        options: Type.Optional(Type.Array(Type.Object({
          label: Type.String({ description: '选项标签。' }),
          description: Type.Optional(Type.String({ description: '选项说明。' })),
        }))),
      })),
      answers: Type.Optional(Type.Record(Type.String(), Type.String())),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      // canUseTool 回调已处理用户交互并注入 answers 到 params 中
      const answers = (params as Record<string, unknown>).answers ?? {}
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ answers }) }],
        details: { answers },
      }
    },
  })

  // ========== Agent 自主任务跟踪工具 ==========
  // TaskCreate / TaskUpdate 让 Agent 在执行过程中自主创建和更新任务进度，
  // 前端通过 TaskProgressCard 组件聚合展示任务列表和完成状态。
  const tasks = new Map<string, { id: string; subject: string; status: string; activeForm?: string }>()
  let nextTaskId = 1

  const taskCreateTool = sdkModule.defineTool({
    name: 'TaskCreate',
    label: '创建任务',
    description: '创建一个新的任务条目，用于跟踪工作进度。在开始多步骤工作时调用，为每个步骤创建任务。',
    promptSnippet: '创建一个新任务来跟踪工作进度。',
    parameters: Type.Object({
      subject: Type.String({ description: '任务的简短标题，不超过 80 字。' }),
      description: Type.Optional(Type.String({ description: '任务的详细描述。' })),
      activeForm: Type.Optional(Type.String({ description: '任务进行中展示的进行时短语，如"正在检查实现"。' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const p = params as { subject: string; activeForm?: string }
      const taskId = String(nextTaskId++)
      const subject = p.subject
      tasks.set(taskId, { id: taskId, subject, status: 'pending', activeForm: p.activeForm })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ task: { id: taskId, subject } }) }],
      }
    },
  })

  const taskUpdateTool = sdkModule.defineTool({
    name: 'TaskUpdate',
    label: '更新任务',
    description: '更新指定任务的状态、标题或进行时短语。开始执行任务时标记为 in_progress，完成后标记为 completed。',
    promptSnippet: '更新任务状态。',
    parameters: Type.Object({
      taskId: Type.String({ description: '要更新的任务 ID（由 TaskCreate 返回）。' }),
      status: Type.Optional(Type.Union([
        Type.Literal('pending'),
        Type.Literal('in_progress'),
        Type.Literal('completed'),
        Type.Literal('blocked'),
        Type.Literal('cancelled'),
      ])),
      subject: Type.Optional(Type.String({ description: '新的任务标题。' })),
      activeForm: Type.Optional(Type.String({ description: '新的进行时短语。' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const p = params as { taskId: string; status?: string; subject?: string; activeForm?: string }
      const task = tasks.get(p.taskId)
      if (!task) throw new Error(`任务 #${p.taskId} 不存在`)
      if (p.status) task.status = p.status
      if (p.subject) task.subject = p.subject
      if (p.activeForm) task.activeForm = p.activeForm
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ task }) }],
      }
    },
  })

  // 获取内置工具定义并包裹权限检查
  // SDK 主模块逐个导出 create*ToolDefinition 函数，无批量函数 createCodingToolDefinitions
  const builtinToolDefs: ToolDefinition[] = [
    sdkModule.createReadToolDefinition(cwd),
    sdkModule.createBashToolDefinition(cwd),
    sdkModule.createEditToolDefinition(cwd),
    sdkModule.createWriteToolDefinition(cwd),
    sdkModule.createGrepToolDefinition(cwd),
    sdkModule.createFindToolDefinition(cwd),
    sdkModule.createLsToolDefinition(cwd),
  ]
  const wrappedTools: ToolDefinition[] = builtinToolDefs.map((def) =>
    wrapToolWithPermission(def, canUseTool),
  )

  // 合并：内置工具（已包裹权限）+ AskUserQuestion（也需包裹权限，触发 ask_user 流程）+ MCP 工具
  // 关键：AskUserQuestion 必须经过 wrapToolWithPermission，
  // 这样 canUseTool 回调才能拦截它，发送 ask_user SSE 事件到前端，
  // 等待用户回答后注入 answers 字段到 updatedInput，再执行工具的 execute
  const allCustomTools: ToolDefinition[] = [
    ...wrappedTools,
    wrapToolWithPermission(askUserQuestionTool as unknown as ToolDefinition, canUseTool),
    taskCreateTool as unknown as ToolDefinition,
    taskUpdateTool as unknown as ToolDefinition,
    ...mcpTools,
  ]

  // 调试日志：确认工具已注册
  logger.info(`[Pi Agent] 已注册 ${allCustomTools.length} 个自定义工具: ${allCustomTools.map(t => t.name).join(', ')}`)

  // 创建 Pi Agent 会话
  const { session: piSession } = await createAgentSession({
    cwd,
    model,
    modelRuntime,
    resourceLoader,
    noTools: 'builtin',
    customTools: allCustomTools,
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: false },
      retry: { enabled: true, maxRetries: 2 },
    }),
  })

    // 监听事件：AgentSession 使用 subscribe() 而非 on()
    const eventListener: AgentSessionEventListener = (event: AgentSessionEvent) => {
      handlePiEvent(event, sessionId, onEvent)
    }
    const unsubscribe = piSession.subscribe(eventListener)

    activeSessions.set(sessionId, { unsubscribe, abortController, workspace, onEvent })

    // 发送消息
    onEvent('start', { sessionId })

    // 预处理用户提示词：检测 /skill:name 命令并注入完整 Skill 内容
    const enrichedPrompt = await preparePromptWithSkills(resourceLoader, message)

    await piSession.prompt(enrichedPrompt)

    // 获取 AI 回复文本
    const replyText = piSession.getLastAssistantText() || ''

    // 持久化 AI 消息
    const aiMessage: AgentMessage = {
      id: `msg-${Date.now()}-ai`,
      sessionId,
      role: 'assistant',
      content: [{ type: 'text', text: replyText }],
      timestamp: Date.now(),
    }
    appendMessage(sessionId, aiMessage)

    onEvent('complete', { sessionId, reply: replyText })

    // 清理会话
    piSession.dispose()
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
  if (active.unsubscribe) {
    active.unsubscribe()
  }
  // 清理该会话的所有待处理权限/AskUser 请求
  permissionService.clearSession(sessionId)
  activeSessions.delete(sessionId)
  logger.info(`[Pi Agent] 已中止会话: ${sessionId}`)
  return true
}

/** 响应权限请求（前端回传） */
export function respondPermission(input: PermissionResponseInput): string | null {
  return permissionService.respondToPermission(
    input.requestId,
    input.behavior,
    input.alwaysAllow ?? false,
  )
}

/** 响应 AskUser 请求（前端回传） */
export function respondAskUser(input: AskUserResponseInput): string | null {
  return permissionService.respondToAskUser(input.requestId, input.answers)
}

/**
 * 包裹工具定义：在 execute 前插入权限检查
 *
 * 移植自 Proma 的 wrapToolWithPermission。
 * 当 canUseTool 返回 deny 时抛出错误，阻止工具执行。
 */
function wrapToolWithPermission(
  definition: ToolDefinition,
  canUseTool: (toolName: string, input: Record<string, unknown>, options: CanUseToolOptions) => Promise<PermissionResult>,
): ToolDefinition {
  const originalExecute = definition.execute
  return {
    ...definition,
    executionMode: 'sequential' as const,
    async execute(toolCallId: string, params: Record<string, unknown>, signal: AbortSignal | undefined, onUpdate: unknown, ctx: unknown) {
      const rawInput = params as Record<string, unknown>
      const permission = await canUseTool(definition.name, rawInput, {
        signal: signal ?? new AbortController().signal,
        toolUseID: toolCallId,
        displayName: definition.label,
        description: definition.description,
      })
      if (permission.behavior === 'deny') {
        throw new Error(permission.message)
      }
      const updatedParams = permission.behavior === 'allow' && permission.updatedInput
        ? permission.updatedInput
        : rawInput
      return originalExecute.call(definition, toolCallId, updatedParams, signal, onUpdate, ctx)
    },
  }
}

/** 处理 Pi SDK 事件并转发 */
function handlePiEvent(event: AgentSessionEvent, sessionId: string, onEvent: AgentEventCallback): void {
  const { type } = event

  switch (type) {
    // 助手消息流式更新（包含 text 和 thinking 两种 delta）
    case 'message_update': {
      const ame = (event as any).assistantMessageEvent
      if (!ame) break

      // 文本增量
      if (ame.type === 'text_delta' && ame.delta) {
        onEvent('text', { sessionId, delta: ame.delta })
      }
      // 思考增量
      if (ame.type === 'thinking_delta' && ame.delta) {
        onEvent('thinking', { sessionId, delta: ame.delta })
      }
      // thinking_start：通知前端开始一个新的 thinking 块
      if (ame.type === 'thinking_start') {
        onEvent('thinking_start', { sessionId })
      }
      // text_start：通知前端开始一个新的 text 块（工具调用后的最终回答）
      if (ame.type === 'text_start') {
        onEvent('text_start', { sessionId })
      }
      break
    }
    // 工具调用开始
    case 'tool_execution_start': {
      const ev = event as any
      logger.info(`[Pi Agent] 工具调用开始: ${ev.toolName}, args=${JSON.stringify(ev.args)?.slice(0, 200)}`)
      onEvent('tool_start', {
        sessionId,
        toolCallId: ev.toolCallId,
        toolName: ev.toolName || 'unknown',
        input: ev.args,
      })
      break
    }
    // 工具调用结束
    case 'tool_execution_end': {
      const ev = event as any
      onEvent('tool_result', {
        sessionId,
        toolCallId: ev.toolCallId,
        toolName: ev.toolName || 'unknown',
        result: ev.result,
        isError: ev.isError,
      })
      break
    }
    // 消息结束
    case 'message_end':
      // 由 sendAgentMessage 处理 complete 事件
      break
    // Agent 结束
    case 'agent_end':
      // 由 sendAgentMessage 处理 complete 事件
      break
    // 错误（AgentSession 特有事件中没有 error 类型，但保留兜底）
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
