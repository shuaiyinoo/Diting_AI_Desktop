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
  getAgentWorkspacePath,
  getWorkspaceSkillsDir,
  getWorkspaceClaudeMdPath,
  getWorkspaceAutoMemoryDir,
  getWorkspaceAutoMemoryIndexPath,
  getSdkConfigDir,
  getDefaultSkillsDir,
  AUTO_MEMORY_INDEX,
} from '../config-paths'
import {
  createDitingAgentsFilesOverride,
} from './pi-resource-loader-overrides'
import { buildPiMcpTools, disposePiMcpConnections } from './pi-mcp-tools'
import { getWorkspaceMcpConfig, getWorkspaceCwd } from './workspace-manager'
import { mergeMcpConfigs } from '../builtin-mcp/registry'
import {
  createDelegation,
  createDelegations,
  waitForDelegations,
  listDelegations,
  getDelegationResult,
  stopDelegation,
  stopDelegations,
  getIdempotentResult,
  setIdempotentResult,
  cleanupDelegations,
  type DelegationRole,
} from './agent-collaboration-service'
import type { WorkspaceMeta } from './workspace-manager'
import type { AgentChannel, AgentMessage, AgentSessionMeta } from '../types'
import { channelToPiProvider } from './pi-model-registry'
import { permissionService } from './agent-permission-service'
import { hybridRetrievalService } from '../../rag/retrieval/hybridRetrieval'
import type { PermissionRequest, AskUserRequest, CanUseToolOptions, PermissionResult } from './agent-permission-service'
import {
  resolvePythonRuntime,
  resolveNodeRuntime,
  resolveGitRuntime,
  buildPythonEnv,
  buildNodeEnv,
  buildGitEnv,
  getRuntimeSummary,
} from '../runtime/runtime-manager'
import { getRuntimeSettings } from '../runtime/runtime-settings'
import {
  listAutomations,
  getAutomation,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  computeNextRunAt,
} from '../../planning/automation-manager'
import type { Automation } from '../../planning/types'
import {
  listTodos,
  getTodo,
  createTodo,
  updateTodo,
  deleteTodo,
  touchTodoSession,
  listCalendarEvents,
  getCalendarEvent,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listPlanningGroups,
  createPlanningGroup,
  updatePlanningGroup,
  deletePlanningGroup,
  listPlanningTags,
  createPlanningTag,
  updatePlanningTag,
  deletePlanningTag,
  listActivePlanningReminders,
  createPlanningReminder,
  updatePlanningReminder,
  deletePlanningReminder,
  acknowledgePlanningReminder,
  snoozePlanningReminder,
} from '../../planning/planning-manager'
import { broadcastPlanningChanged, broadcastPlanningAgentOperation, broadcastAutomationsChanged } from '../../planning/planning-events'
import { browserController } from '../../browser/browser-controller'
import { resolveBrowserProfileKey } from '../../browser/browser-profile-policy'

/** Agent 发送输入 */
export interface AgentSendInput {
sessionId: string
message: string
channelId?: string
workspaceId?: string
agentRuntime?: 'pi'
permissionMode?: string
/** 思考深度等级：off / low / medium / high / xhigh */
thinkingLevel?: string
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

  // 创建会话工作目录（用于存放会话级文件）
  if (input.workspaceId) {
    const sessionDir = join(getAgentWorkspacePath(input.workspaceId), id)
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true })
      logger.info(`[Pi Agent] 已创建会话工作目录: ${sessionDir}`)
    }
  }

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
// 关闭受管浏览器
browserController.close(id).catch(() => {/* 忽略 */})

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

  // 回复风格约束
  parts.push(`
## 回复风格约束
- **不要使用 emoji 表情符号**：回复中不要包含任何 emoji（如 🚀、✅、❌、🎯 等），用纯文字表达。标题和列表项也不要带 emoji 前缀。
- 回复使用中文，代码和技术术语保留英文原文。
- 保持简洁直接，不要过度解释或重复。
- **缺少关键信息时先提问**：当用户请求涉及需要明确的关键参数（如城市、日期范围、文件路径、目标语言等）但未提供时，优先调用 AskUserQuestion 工具向用户提问，不要自行假设默认值。例如"帮我查天气"但未说城市时，先用 AskUserQuestion 让用户选择城市。`)

  // 工具使用指南（引导 Agent 自主使用任务跟踪工具）
  parts.push(`
## 工具使用指南
- **可见进度（积极使用）**：只要任务需要 2 次以上工具调用、涉及多个文件/阶段、或需要调研后实施，就在第一次实质操作前用 TaskCreate 创建 3–7 个任务；简单问答不创建。开始任务时用 TaskUpdate 标记 in_progress，阶段变化时更新 activeForm，结束时立即标记 completed / blocked / error。
  - **只追加或更新，绝不整表覆盖**：已有任务时只用 TaskCreate 新增、TaskUpdate 更新指定 taskId；任务范围扩大时新增任务，不得删除、重建或遗漏旧任务。
  - **术语不要混淆**：TaskCreate / TaskUpdate 是你的可见进度工具，用于向用户展示工作计划与完成情况。
- **大文件写入**：写入超过约 10,000 字时，主动拆分为多次写入——先 Write 首段，再用 Edit 追加后续段落，避免 token 截断。
- **回复中的代码块必须标语言**：在 Markdown 回复里写 fenced code block 时，开头围栏一定要紧跟语言标识（\`\`\`ts / \`\`\`python / \`\`\`json 等），纯文本用 \`\`\`text。
- **知识库检索（SearchKnowledgeBase）**：当用户提问涉及已上传到本地知识库的文档内容时，主动调用 SearchKnowledgeBase 检索相关片段作为回答依据。不传 folderId 时搜索全部知识库；如果用户指定了某个知识库分组，可传 folderId 限定范围。回答中引用检索到的内容时，在末尾标注对应的 evidenceId（如 [E1]、[E2]）。检索结果为空时如实告知，不要编造。`)

  // 工作区上下文 + 记忆系统路径注入
  if (workspace) {
    const workspaceRoot = getAgentWorkspacePath(workspace.id)
    const claudeMdPath = getWorkspaceClaudeMdPath(workspace.id)
    const autoMemoryDir = getWorkspaceAutoMemoryDir(workspace.id)
    const autoMemoryIndex = getWorkspaceAutoMemoryIndexPath(workspace.id)
    const skillsDir = getWorkspaceSkillsDir(workspace.id)
    const mcpConfigPath = join(workspaceRoot, 'mcp.json')

    parts.push(`\n## 项目
- 项目名称: ${workspace.name}
- Diting 工作区目录: ${workspaceRoot}（存放 MCP、Skills、CLAUDE.md 与 Memory 等配置）
- 项目根目录: ${workspace.projectPath || '(空白项目，使用 Diting 托管目录)'}
- Diting 工作区 CLAUDE.md: ${claudeMdPath}
- Diting 工作区 Auto Memory 目录: ${autoMemoryDir}
- Diting 工作区 Auto Memory 索引: ${autoMemoryIndex}
- Diting 工作区 Skills 目录: ${skillsDir}/
- Diting 工作区 MCP 配置: ${mcpConfigPath}（顶层 key 是 \`servers\`）`)

    if (workspace.description) parts.push(workspace.description)
    if (workspace.projectPath) parts.push(`项目根目录: ${workspace.projectPath}`)

    // 注入 CLAUDE.md 内容
    if (existsSync(claudeMdPath)) {
      const claudeMd = readFileSync(claudeMdPath, 'utf-8')
      parts.push(`\n## 项目说明（来自 CLAUDE.md）\n${claudeMd}`)
    }

    // 注入 Auto Memory 索引内容（如果存在）
    if (existsSync(autoMemoryIndex)) {
      const memoryIndex = readFileSync(autoMemoryIndex, 'utf-8')
      parts.push(`\n## 记忆索引（来自 MEMORY.md）\n${memoryIndex}`)
    }

    // 知识维护架构指导
    parts.push(`\n## Diting 知识维护架构

**核心原则：CLAUDE.md 约束行为，Memory 改善判断，Skills 固化流程，Context 承载当前任务。**

### CLAUDE.md — Diting 工作区项目指令（长期持久化）
维护 ${claudeMdPath}，记录未来任何 Agent 都应默认遵守的项目规则和入口：
- **适合写入**：项目硬约束、架构边界、常用命令、测试/发布流程、关键路径索引
- **不适合写入**：临时调试过程、一次性偏好、长篇调研正文、从代码中显而易见的内容
- **维护要求**：保持精炼（<200 行），发现已有内容不准确时小幅修订或标注过时

### Auto Memory — 自动记忆（用户可审计）
维护 ${autoMemoryDir} 中的 ${AUTO_MEMORY_INDEX} 和主题文件：
- **用途**：沉淀跨会话学习到的经验、用户偏好、误判纠正、问题状态变化和易错点
- **入口文件**：${autoMemoryIndex} 只放主题索引和路由；详细内容拆到同目录或子目录下的主题文件
- **路径边界**：不要在项目根目录或 cwd 下的 \`.claude/memory/\` 创建记忆文件，只使用上面给出的 Diting 工作区 Auto Memory 目录
- **使用要求**：不要把它当聊天流水账；只有明确重复出现、用户明确要求记住，或删掉后未来 Agent 明显会犯错的稳定经验才写入
- **会话内维护**：当用户确认问题已解决、否定先前判断、说明问题仍存在/加重，或明确表达长期偏好时，判断是否应更新 memory
- **弱信号处理**：一次性偏好、临时过程和证据不足的判断，不要直接写入 auto memory；可在最终回复中建议用户确认后再沉淀
- **user-profile.md**：持续迭代的用户画像，记录有充分证据的角色与技术背景、稳定协作偏好、反复出现的关注点；证据不足的信号标为“待确认”

### 分类与维护去向

| 场景 | 处理方式 |
|------|----------|
| 项目硬规则、架构边界、常用命令 | → 小幅更新 CLAUDE.md |
| 用户偏好、误判纠正、跨会话经验 | → 必要时小幅更新 MEMORY.md 或主题文件 |
| 重复流程、固定检查清单 | → 搜索/创建/更新 Skill |
| 当前任务的临时计划、进度 | → 写入会话级 Context |
| 简单问答、一次性修改 | → 直接回复，不写文件 |

维护长期文件前，先按需搜索当前会话、CLAUDE.md、auto memory 索引和 Skills 元数据；
涉及长期副作用时，优先提出简短维护建议，让用户知道会改哪里、为什么改。`)
  }

  // 运行时环境信息
  const runtimeSummary = getRuntimeSummary()
  const pythonInfo = runtimeSummary.python.available
    ? `${runtimeSummary.python.source === 'bundled' ? '内嵌' : '宿主机'} (${runtimeSummary.python.path})`
    : '不可用'
  const nodeInfo = runtimeSummary.node.available
    ? `${runtimeSummary.node.source === 'bundled' ? '内嵌' : '宿主机'} (${runtimeSummary.node.path})`
    : '不可用'
  const gitInfo = runtimeSummary.git.available
    ? `${runtimeSummary.git.source === 'bundled' ? '内嵌' : '宿主机'} (${runtimeSummary.git.path})`
    : '不可用'
  parts.push(`
## 运行时环境
Diting 已集成 Python、Node.js 和 Git 运行时，优先使用内嵌环境执行脚本，无需依赖宿主机安装。
- **Python**: ${pythonInfo}
- **Node.js**: ${nodeInfo}
- **Git**: ${gitInfo}

### 工具使用指南
- 执行 Python 代码或脚本：使用 **RunPythonScript** 工具（提供 code 或 scriptPath 参数）
- 执行 Node.js 代码或脚本：使用 **RunNodeScript** 工具（提供 code 或 scriptPath 参数）
- 执行 Git 命令：使用 **RunGitCommand** 工具（提供 command 和可选 args 参数）
- 安装额外依赖包：使用 **InstallPackage** 工具（指定 manager: pip/npm 和 packages 列表）
- 当内嵌运行时不可用时，上述工具会自动回退到宿主机环境
- 如果工具执行失败且提示运行时不可用，可提示用户在设置中检查运行时配置

### 优先级规则
1. 优先使用 RunPythonScript / RunNodeScript 工具（内嵌运行时）
2. Git 操作使用 RunGitCommand 工具，不要通过 Bash 调用 git 命令
3. 仅当需要执行非 Python/Node.js/Git 的系统命令时，才使用 Bash 工具
4. 安装新依赖时使用 InstallPackage 工具，不要直接调用 pip/npm 命令
`)

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
  // 关键：合并内置 MCP 配置（chrome-devtools、web-search 等）和工作区用户 MCP 配置
  let mcpTools: ToolDefinition[] = []
  if (workspace) {
    const userMcpConfig = getWorkspaceMcpConfig(workspace.slug)
    const mergedConfig = mergeMcpConfigs(userMcpConfig)
    if (Object.keys(mergedConfig).length > 0) {
      try {
        mcpTools = await buildPiMcpTools(mergedConfig)
        logger.info(`[Pi Agent] MCP 工具构建完成: ${mcpTools.length} 个 (用户 ${Object.keys(userMcpConfig).length} + 内置注入)`)
      } catch (err) {
        logger.warn('[Pi Agent] 构建 MCP 工具失败:', err)
      }
    } else {
      logger.info('[Pi Agent] 无 MCP 配置可用')
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
    // 关键设计：
    // - noSkills: true 禁用 SDK 默认目录的 Skill 发现（避免加载 ~/.pi/agent/skills 中的无关 Skill）
    // - additionalSkillPaths 指定 Diting 工作区 Skills 目录
    // - agentsFilesOverride 过滤掉本地项目中的 CLAUDE.md / AGENTS.md，防止与 Diting 注入的系统提示冲突
    // - systemPromptOverride 完全替换系统提示词（包含记忆路径和维护规则）
    // 注意：skillsOverride 因 SDK Skill 类型版本差异暂不使用，noSkills + additionalSkillPaths 已确保只加载工作区 Skills
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir: getSdkConfigDir(),
      noSkills: true,
      additionalSkillPaths,
      agentsFilesOverride: createDitingAgentsFilesOverride(),
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
    input.permissionMode,
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
        details: { taskId, subject },
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
        details: { task },
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

  // ========== 运行时脚本执行工具 ==========
  // RunPythonScript / RunNodeScript 优先使用 Diting 内嵌的运行时执行代码，
  // 如果内嵌不可用则回退到宿主机环境。
  // InstallPackage 用于安装额外 Python/npm 包，支持国内外镜像源切换。
  const runPythonScriptTool = sdkModule.defineTool({
    name: 'RunPythonScript',
    label: '执行 Python 脚本',
    description: '使用 Diting 内嵌的 Python 运行时执行 Python 代码或脚本文件。优先使用内嵌运行时，不可用时回退到宿主机 Python。',
    promptSnippet: '执行 Python 脚本并返回标准输出和错误输出。',
    parameters: Type.Object({
      code: Type.Optional(Type.String({ description: '要直接执行的 Python 代码字符串。与 scriptPath 二选一。' })),
      scriptPath: Type.Optional(Type.String({ description: '要执行的 .py 脚本文件路径。与 code 二选一。' })),
      args: Type.Optional(Type.Array(Type.String(), { description: '传递给脚本的命令行参数。' })),
      cwd: Type.Optional(Type.String({ description: '工作目录，默认为当前工作区根目录。' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const p = params as { code?: string; scriptPath?: string; args?: string[]; cwd?: string }
      if (!p.code && !p.scriptPath) {
        throw new Error('必须提供 code 或 scriptPath 参数')
      }

      const runtime = resolvePythonRuntime()
      if (!runtime.available) {
        throw new Error('Python 运行时不可用：内嵌缺失且宿主机未安装 Python')
      }

      const { execSync } = await import('node:child_process')
      const env = buildPythonEnv()
      const workDir = p.cwd || cwd

      try {
        let output: string
        if (p.code) {
          // 直接执行代码字符串
          const args = ['-c', p.code]
          if (p.args) args.push(...p.args)
          output = execSync(`"${runtime.path}" ${args.map(a => JSON.stringify(a)).join(' ')}`, {
            encoding: 'utf-8',
            cwd: workDir,
            env,
            timeout: 120_000,
            maxBuffer: 10 * 1024 * 1024,
          })
        } else {
          // 执行脚本文件
          const args = [p.scriptPath!]
          if (p.args) args.push(...p.args)
          output = execSync(`"${runtime.path}" ${args.map(a => JSON.stringify(a)).join(' ')}`, {
            encoding: 'utf-8',
            cwd: workDir,
            env,
            timeout: 120_000,
            maxBuffer: 10 * 1024 * 1024,
          })
        }
        return {
          content: [{ type: 'text' as const, text: output || '(无输出)' }],
          details: { source: runtime.source, runtime: runtime.path, error: false },
        }
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; message: string }
        const output = [error.stdout, error.stderr].filter(Boolean).join('\n') || error.message
        return {
          content: [{ type: 'text' as const, text: `执行失败 (${runtime.source}):
${output}` }],
          details: { source: runtime.source, runtime: runtime.path, error: true },
        }
      }
    },
  })

  const runNodeScriptTool = sdkModule.defineTool({
    name: 'RunNodeScript',
    label: '执行 Node.js 脚本',
    description: '使用 Diting 内嵌的 Node.js 运行时（Electron 自身）执行 JavaScript 代码或脚本文件。',
    promptSnippet: '执行 Node.js 脚本并返回标准输出和错误输出。',
    parameters: Type.Object({
      code: Type.Optional(Type.String({ description: '要直接执行的 JavaScript 代码字符串（通过 node -e）。与 scriptPath 二选一。' })),
      scriptPath: Type.Optional(Type.String({ description: '要执行的 .js/.mjs 脚本文件路径。与 code 二选一。' })),
      args: Type.Optional(Type.Array(Type.String(), { description: '传递给脚本的命令行参数。' })),
      cwd: Type.Optional(Type.String({ description: '工作目录，默认为当前工作区根目录。' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const p = params as { code?: string; scriptPath?: string; args?: string[]; cwd?: string }
      if (!p.code && !p.scriptPath) {
        throw new Error('必须提供 code 或 scriptPath 参数')
      }

      const runtime = resolveNodeRuntime()
      if (!runtime.available) {
        throw new Error('Node.js 运行时不可用')
      }

      const { execSync } = await import('node:child_process')
      const env = buildNodeEnv()
      const workDir = p.cwd || cwd

      try {
        let output: string
        if (p.code) {
          const args = ['-e', p.code]
          if (p.args) args.push(...p.args)
          output = execSync(`"${runtime.path}" ${args.map(a => JSON.stringify(a)).join(' ')}`, {
            encoding: 'utf-8',
            cwd: workDir,
            env,
            timeout: 120_000,
            maxBuffer: 10 * 1024 * 1024,
          })
        } else {
          const args = [p.scriptPath!]
          if (p.args) args.push(...p.args)
          output = execSync(`"${runtime.path}" ${args.map(a => JSON.stringify(a)).join(' ')}`, {
            encoding: 'utf-8',
            cwd: workDir,
            env,
            timeout: 120_000,
            maxBuffer: 10 * 1024 * 1024,
          })
        }
        return {
          content: [{ type: 'text' as const, text: output || '(无输出)' }],
          details: { source: runtime.source, runtime: runtime.path, error: false },
        }
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; message: string }
        const output = [error.stdout, error.stderr].filter(Boolean).join('\n') || error.message
        return {
          content: [{ type: 'text' as const, text: `执行失败 (${runtime.source}):
${output}` }],
          details: { source: runtime.source, runtime: runtime.path, error: true },
        }
      }
    },
  })

  const installPackageTool = sdkModule.defineTool({
    name: 'InstallPackage',
    label: '安装依赖包',
    description: '安装 Python（pip）或 Node.js（npm）第三方包，自动使用配置的镜像源。',
    promptSnippet: '安装额外依赖包到内嵌运行时环境。',
    parameters: Type.Object({
      manager: Type.Union([
        Type.Literal('pip'),
        Type.Literal('npm'),
      ], { description: '包管理器：pip（Python）或 npm（Node.js）。' }),
      packages: Type.Array(Type.String(), { description: '要安装的包名列表，可含版本号如 "pypdf>=4.0"。' }),
      global: Type.Optional(Type.Boolean({ description: '是否全局安装（npm -g / pip --user），默认 false。' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const p = params as { manager: 'pip' | 'npm'; packages: string[]; global?: boolean }
      if (!p.packages || p.packages.length === 0) {
        throw new Error('packages 不能为空')
      }

      const settings = getRuntimeSettings()
      const { execSync } = await import('node:child_process')

      try {
        let output: string

        if (p.manager === 'pip') {
          const runtime = resolvePythonRuntime()
          if (!runtime.available) {
            throw new Error('Python 运行时不可用')
          }
          const args = ['-m', 'pip', 'install', ...p.packages, '-i', settings.pypiMirror, '--trusted-host', new URL(settings.pypiMirror).host]
          if (p.global) args.push('--user')
          output = execSync(`"${runtime.path}" ${args.map(a => JSON.stringify(a)).join(' ')}`, {
            encoding: 'utf-8',
            env: buildPythonEnv(),
            timeout: 300_000,
            maxBuffer: 10 * 1024 * 1024,
          })
        } else {
          const runtime = resolveNodeRuntime()
          if (!runtime.available) {
            throw new Error('Node.js 运行时不可用')
          }
          const globalFlag = p.global ? ['-g'] : []
          const args = ['install', ...globalFlag, '--registry', settings.npmRegistry, ...p.packages]
          output = execSync(`npm ${args.map(a => JSON.stringify(a)).join(' ')}`, {
            encoding: 'utf-8',
            env: buildNodeEnv(),
            timeout: 300_000,
            maxBuffer: 10 * 1024 * 1024,
          })
        }

        const mirror = p.manager === 'pip' ? settings.pypiMirror : settings.npmRegistry
        return {
          content: [{ type: 'text' as const, text: output || '安装完成' }],
          details: { manager: p.manager, packages: p.packages, mirror, error: false },
        }
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; message: string }
        const output = [error.stdout, error.stderr].filter(Boolean).join('\n') || error.message
        const mirror = p.manager === 'pip' ? settings.pypiMirror : settings.npmRegistry
        return {
          content: [{ type: 'text' as const, text: `安装失败:
${output}` }],
          details: { manager: p.manager, packages: p.packages, mirror, error: true },
        }
      }
    },
  })

  // ========== Git 命令执行工具 ==========
  // RunGitCommand 使用检测到的 Git 可执行文件路径执行 Git 命令。
  // Git 没有内嵌版本，始终从宿主机检测。
  const runGitCommandTool = sdkModule.defineTool({
    name: 'RunGitCommand',
    label: '执行 Git 命令',
    description: '使用检测到的 Git 可执行文件执行 Git 命令（如 status、log、add、commit 等）。自动使用正确的工作目录。',
    promptSnippet: '执行 Git 命令并返回输出。',
    parameters: Type.Object({
      command: Type.String({ description: 'Git 子命令，如 status、log、diff、add、commit、push、pull 等。' }),
      args: Type.Optional(Type.Array(Type.String(), { description: '额外的命令行参数，如 ["--oneline", "-5"] 或 ["-m", "提交信息"]。' })),
      cwd: Type.Optional(Type.String({ description: '工作目录，默认为当前工作区根目录。' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const p = params as { command: string; args?: string[]; cwd?: string }
      if (!p.command) {
        throw new Error('必须提供 command 参数')
      }

      const runtime = resolveGitRuntime()
      if (!runtime.available) {
        throw new Error('Git 不可用：宿主机未安装 Git，请提示用户安装 Git')
      }

      const { execSync } = await import('node:child_process')
      const env = buildGitEnv()
      const workDir = p.cwd || cwd

      try {
        const args = [p.command]
        if (p.args) args.push(...p.args)
        const output = execSync(`"${runtime.path}" ${args.map(a => JSON.stringify(a)).join(' ')}`, {
          encoding: 'utf-8',
          cwd: workDir,
          env,
          timeout: 60_000,
          maxBuffer: 10 * 1024 * 1024,
        })
        return {
          content: [{ type: 'text' as const, text: output || '(无输出)' }],
          details: { source: runtime.source, runtime: runtime.path, error: false },
        }
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; message: string }
        const output = [error.stdout, error.stderr].filter(Boolean).join('\n') || error.message
        return {
          content: [{ type: 'text' as const, text: `执行失败 (${runtime.source}):
${output}` }],
          details: { source: runtime.source, runtime: runtime.path, error: true },
        }
      }
    },
  })

  // ========== RAG 知识库检索工具 ==========
  // SearchKnowledgeBase 让 Agent 自主检索本地知识库，
  // 支持「全库搜索」（不传 folderId）和「指定分组搜索」（传 folderId）两种模式。
  const searchKnowledgeBaseTool = sdkModule.defineTool({
    name: 'SearchKnowledgeBase',
    label: '搜索知识库',
    description: '从本地知识库中检索与用户问题相关的文档片段。不传 folderId 时搜索全部知识库，传 folderId 时仅搜索指定分组。当用户提问涉及已上传到知识库的文档内容时调用。',
    promptSnippet: '从知识库检索相关文档片段作为回答依据。',
    parameters: Type.Object({
      query: Type.String({ description: '检索关键词或问题，用自然语言描述要查找的内容。' }),
      folderId: Type.Optional(Type.Number({ description: '知识库分组 ID。不传则搜索全库。' })),
      topK: Type.Optional(Type.Number({ description: '返回结果数量，默认 5，最大 10。' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const p = params as { query: string; folderId?: number; topK?: number }
      const query = (p.query || '').trim()

      // 统一 details 形状，避免 union 类型推断冲突
      interface KbSearchDetails {
        error?: string
        ragResult?: {
          total: number
          evidenceLevel: string
          evidenceGuidance: string
          documents: Array<{
            evidenceId: string
            fileName: string
            fileItemId: number
            score: number
            text: string
          }>
        }
      }

      if (!query) {
        const details: KbSearchDetails = { error: 'query 不能为空' }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: details.error }) }],
          details,
        }
      }

      const topK = Math.min(Math.max(p.topK ?? 5, 1), 10)
      const folderId = p.folderId && p.folderId > 0 ? p.folderId : undefined

      try {
        const bundle = folderId
          ? await hybridRetrievalService.retrieve(folderId, query, topK)
          : await hybridRetrievalService.retrieveAll(query, topK)

        // 组装给 LLM 的检索摘要
        const snippets = bundle.documents.map(doc => ({
          evidenceId: doc.metadata.evidenceId,
          fileName: doc.metadata.fileName,
          fileItemId: doc.metadata.fileItemId,
          score: Number(doc.metadata.score.toFixed(4)),
          text: doc.text,
        }))

        const ragResult = {
          total: snippets.length,
          evidenceLevel: bundle.evidenceLevel,
          evidenceGuidance: bundle.evidenceGuidance,
          documents: snippets,
        }

        // 发送 rag_citations SSE 事件，前端据此渲染 CitationRail 证据卡片
        const citations = bundle.documents.map(doc => ({
          evidenceId: doc.metadata.evidenceId,
          fileName: doc.metadata.fileName,
          fileItemId: doc.metadata.fileItemId,
          chunkId: doc.metadata.chunkId,
          chunkIndex: doc.metadata.chunkIndex,
          score: doc.metadata.score,
          snippet: doc.text.replace(/^文件名：.+\n/, '').slice(0, 200),
        }))
        onEvent('rag_citations', { citations })

        const details: KbSearchDetails = { ragResult }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(ragResult, null, 2) }],
          details,
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        logger.error(`[SearchKnowledgeBase] 检索失败: ${errorMsg}`)
        const details: KbSearchDetails = { error: errorMsg }
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: '知识库检索失败', detail: errorMsg }) }],
          details,
        }
      }
    },
  })

  // ========== 协作子 Agent 工具 ==========
  // collaboration MCP 让 Agent 自主拆分任务、创建并行子会话。
  // 子会话使用与父会话相同的 channel、model、workspace 和工具集。
  const collaborationTools: ToolDefinition[] = []

  // 子会话创建工厂：复用父会话的 model、workspace 和工具集
  const createChildSession = async (task: string, abortController: AbortController, onChildEvent: (event: string, data: unknown) => void): Promise<string> => {
    // 子会话使用与父会话相同的基础设施，但独立的 SessionManager
    const { session: childSession } = await createAgentSession({
      cwd,
      model,
      modelRuntime,
      resourceLoader,
      noTools: 'builtin',
      customTools: allCustomTools.filter((t) => !t.name.startsWith('mcp__collaboration__')),
      sessionManager: SessionManager.inMemory(cwd),
      settingsManager: SettingsManager.inMemory({
        compaction: { enabled: false },
        retry: { enabled: true, maxRetries: 2 },
      }),
    })

    // 监听子会话事件并转发
    const childListener: AgentSessionEventListener = (childEv: AgentSessionEvent) => {
      const ev = childEv as any
      // 转发工具调用事件让前端可见
      if (ev.type === 'tool_execution_start') {
        onChildEvent('tool_start', { toolName: ev.toolName, args: ev.args })
      } else if (ev.type === 'tool_execution_end') {
        onChildEvent('tool_result', { toolName: ev.toolName, result: ev.result, isError: ev.isError })
      } else if (ev.type === 'message_update') {
        const ame = ev.assistantMessageEvent
        if (ame?.type === 'text_delta' && ame.delta) {
          onChildEvent('text', { delta: ame.delta })
        }
      }
    }
    childSession.subscribe(childListener)

    // 发送任务给子会话
    await childSession.prompt(task)

    // 提取结果文本
    const resultText = childSession.getLastAssistantText() || ''
    childSession.dispose?.()
    return resultText
  }

  const delegationContext = {
    parentSessionId: sessionId,
    channelId: channel.id,
    modelId: model,
    workspaceSlug: workspace?.slug,
    createChildSession,
  }

  // 1. list_available_agent_models
  collaborationTools.push(sdkModule.defineTool({
    name: 'mcp__collaboration__list_available_agent_models',
    label: '列出可用模型',
    description: '列出当前父会话渠道下可用于协作子 Agent 的模型。',
    promptSnippet: '查看可用于委派子 Agent 的模型。',
    parameters: Type.Object({}),
    async execute() {
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ models: [{ id: model, name: model }] }) }],
        details: { models: [{ id: model }] },
      }
    },
  }) as unknown as ToolDefinition)

  // 2. delegate_agent
  collaborationTools.push(sdkModule.defineTool({
    name: 'mcp__collaboration__delegate_agent',
    label: '委派子 Agent',
    description: '创建一个真实可见的 Diting 协作子 Agent 会话来并行处理独立子任务。只用于长耗时、可并行、需要追踪的任务；简单搜索由父会话直接使用普通工具完成。',
    promptSnippet: '创建一个协作子 Agent 会话处理独立子任务。',
    parameters: Type.Object({
      title: Type.Optional(Type.String({ description: '子会话标题' })),
      role: Type.Optional(Type.Union([
        Type.Literal('explore'),
        Type.Literal('research'),
        Type.Literal('implement'),
        Type.Literal('review'),
        Type.Literal('custom'),
      ], { description: '子任务角色' })),
      task: Type.String({ description: '发送给子 Agent 的完整任务说明，必须自包含必要上下文。' }),
      expectedOutput: Type.Optional(Type.String({ description: '希望子 Agent 最终返回的格式或要点。' })),
      modelId: Type.Optional(Type.String({ description: '可选目标模型 ID，不传则继承父会话模型。' })),
    }),
    async execute(toolCallId: string, params: Record<string, unknown>) {
      const p = params as { title?: string; role?: DelegationRole; task: string; expectedOutput?: string; modelId?: string }
      // 幂等性检查
      const cached = getIdempotentResult(toolCallId)
      if (cached) {
        const result = getDelegationResult(sessionId, cached.delegationId)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ delegation: result, note: '子会话已启动（幂等返回）。需要结果时调用 wait_for_delegations。' }) }],
          details: { delegation: result, idempotent: true } as Record<string, unknown>,
        }
      }
      const result = createDelegation(delegationContext, p, onEvent)
      setIdempotentResult(toolCallId, { delegationId: result.delegationId, effectiveModelId: p.modelId })
      const summary = getDelegationResult(sessionId, result.delegationId)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ delegation: summary, note: '子会话已启动。需要结果时调用 wait_for_delegations。' }) }],
        details: { delegation: summary } as Record<string, unknown>,
      }
    },
  }) as unknown as ToolDefinition)

  // 3. delegate_agents
  collaborationTools.push(sdkModule.defineTool({
    name: 'mcp__collaboration__delegate_agents',
    label: '批量委派子 Agent',
    description: '批量创建多个协作子 Agent 会话。适合把同一大任务拆成多片并行处理。',
    promptSnippet: '批量创建子 Agent 会话并行处理。',
    parameters: Type.Object({
      sharedContext: Type.Optional(Type.String({ description: '批量子任务共用背景。' })),
      items: Type.Array(Type.Object({
        title: Type.Optional(Type.String({ description: '子会话标题' })),
        role: Type.Optional(Type.Union([
          Type.Literal('explore'),
          Type.Literal('research'),
          Type.Literal('implement'),
          Type.Literal('review'),
          Type.Literal('custom'),
        ], { description: '子任务角色' })),
        task: Type.String({ description: '发送给子 Agent 的完整任务说明。' }),
        expectedOutput: Type.Optional(Type.String({ description: '希望子 Agent 最终返回的格式或要点。' })),
        modelId: Type.Optional(Type.String({ description: '可选目标模型 ID。' })),
      }), { description: '要创建的子会话列表，最多 50 个' }),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const p = params as { sharedContext?: string; items: Array<{ title?: string; role?: DelegationRole; task: string; expectedOutput?: string; modelId?: string }> }
      const taskPrefix = p.sharedContext ? `## 共用背景\n${p.sharedContext}\n\n## 子任务\n` : ''
      const enrichedItems = p.items.map((item) => ({
        ...item,
        task: taskPrefix + item.task,
      }))
      const result = createDelegations(delegationContext, enrichedItems, onEvent)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ created: result.created.length, failures: result.failures, note: '子会话已启动。需要结果时调用 wait_for_delegations。' }) }],
        details: result,
      }
    },
  }) as unknown as ToolDefinition)

  // 4. wait_for_delegations
  collaborationTools.push(sdkModule.defineTool({
    name: 'mcp__collaboration__wait_for_delegations',
    label: '等待子会话',
    description: '等待子会话完成。mode=all 等待全部完成，mode=any 等待部分完成即可返回。',
    promptSnippet: '等待协作子会话完成并收集结果。',
    parameters: Type.Object({
      delegationIds: Type.Optional(Type.Array(Type.String(), { description: '要等待的委派 ID 列表，不传则等待全部运行中的。' })),
      mode: Type.Optional(Type.Union([Type.Literal('all'), Type.Literal('any')], { description: 'all=等全部，any=等部分' })),
      minCompleted: Type.Optional(Type.Number({ description: 'mode=any 时至少等待几个完成' })),
      timeoutSec: Type.Optional(Type.Number({ description: '超时秒数，默认 1800' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const p = params as { delegationIds?: string[]; mode?: 'all' | 'any'; minCompleted?: number; timeoutSec?: number }
      const result = await waitForDelegations(sessionId, p)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        details: result,
      }
    },
  }) as unknown as ToolDefinition)

  // 5. list_delegations
  collaborationTools.push(sdkModule.defineTool({
    name: 'mcp__collaboration__list_delegations',
    label: '列出委派',
    description: '列出当前父会话创建的所有子会话及其状态。',
    promptSnippet: '查看当前委派的所有子会话状态。',
    parameters: Type.Object({}),
    async execute() {
      const list = listDelegations(sessionId)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ delegations: list }) }],
        details: { delegations: list },
      }
    },
  }) as unknown as ToolDefinition)

  // 6. get_delegation_results
  collaborationTools.push(sdkModule.defineTool({
    name: 'mcp__collaboration__get_delegation_results',
    label: '获取委派结果',
    description: '按委派 ID 读取一个或多个子会话的结果摘要。',
    promptSnippet: '读取子会话结果摘要。',
    parameters: Type.Object({
      delegationIds: Type.Array(Type.String(), { description: '要读取结果的委派 ID 列表。' }),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const p = params as { delegationIds: string[] }
      const results = p.delegationIds.map((id) => {
        try {
          return getDelegationResult(sessionId, id)
        } catch (err) {
          return { delegationId: id, error: err instanceof Error ? err.message : String(err) }
        }
      })
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ results }) }],
        details: { results },
      }
    },
  }) as unknown as ToolDefinition)

  // 7. stop_delegation
  collaborationTools.push(sdkModule.defineTool({
    name: 'mcp__collaboration__stop_delegation',
    label: '停止子会话',
    description: '停止单个协作子会话。',
    promptSnippet: '停止单个子会话。',
    parameters: Type.Object({
      delegationId: Type.String({ description: '要停止的委派 ID。' }),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const p = params as { delegationId: string }
      const stopped = stopDelegation(sessionId, p.delegationId)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ stopped, delegationId: p.delegationId }) }],
        details: { stopped, delegationId: p.delegationId },
      }
    },
  }) as unknown as ToolDefinition)

  // 8. stop_delegations
  collaborationTools.push(sdkModule.defineTool({
    name: 'mcp__collaboration__stop_delegations',
    label: '批量停止子会话',
    description: '批量停止协作子会话。不传 delegationIds 则停止全部运行中的。',
    promptSnippet: '批量停止子会话。',
    parameters: Type.Object({
      delegationIds: Type.Optional(Type.Array(Type.String(), { description: '要停止的委派 ID 列表，不传则停止全部运行中的。' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const p = params as { delegationIds?: string[] }
      const result = stopDelegations(sessionId, p.delegationIds)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        details: result,
      }
    },
  }) as unknown as ToolDefinition)

  // ========== Automation MCP 工具 ==========
  // 让 Agent 在对话中直接创建、查看、更新、删除和立即运行定时任务。
  const automationTools: ToolDefinition[] = []

  // 1. list_automations
  automationTools.push(sdkModule.defineTool({
    name: 'mcp__automation__list_automations',
    label: '列出定时任务',
    description: '列出所有定时任务（Automation）。返回每个任务的名称、调度类型、状态和运行记录摘要。',
    promptSnippet: '查看当前所有定时任务。',
    parameters: Type.Object({}),
    async execute() {
      const list = listAutomations().map((a: Automation) => ({
        id: a.id,
        name: a.name,
        prompt: a.prompt,
        scheduleType: a.scheduleType,
        intervalMinutes: a.intervalMinutes,
        timeOfDay: a.timeOfDay,
        active: a.active,
        runCount: a.runCount,
        lastRunAt: a.lastRunAt,
        nextRunAt: a.nextRunAt,
      }))
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ automations: list }) }],
        details: { automations: list },
      }
    },
  }) as unknown as ToolDefinition)

  // 2. get_automation
  automationTools.push(sdkModule.defineTool({
    name: 'mcp__automation__get_automation',
    label: '读取定时任务详情',
    description: '读取单个定时任务的完整配置和最近运行记录。',
    promptSnippet: '查看指定定时任务的详情和运行历史。',
    parameters: Type.Object({
      id: Type.String({ description: '定时任务 ID' }),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const { id } = params as { id: string }
      const a = getAutomation(id)
      if (!a) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `定时任务不存在: ${id}` }) }],
          details: { error: `定时任务不存在: ${id}` },
        }
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ automation: a }) }],
        details: { automation: a },
      }
    },
  }) as unknown as ToolDefinition)

  // 3. create_automation
  automationTools.push(sdkModule.defineTool({
    name: 'mcp__automation__create_automation',
    label: '创建定时任务',
    description: '创建一个持久化定时任务。调度器会按设定频率在后台自动新建子会话执行任务描述。需要指定模型（channelId）、项目（workspaceId）和自然语言任务描述。',
    promptSnippet: '创建一个定时任务来自动执行重复性工作。',
    parameters: Type.Object({
      name: Type.String({ description: '任务名称' }),
      prompt: Type.String({ description: '自然语言任务描述，Agent 每次触发时会执行此描述。' }),
      scheduleType: Type.Union([
        Type.Literal('interval'),
        Type.Literal('daily'),
        Type.Literal('weekly'),
        Type.Literal('monthly'),
        Type.Literal('once'),
      ], { description: '调度类型：interval=每N分钟、daily=每天定点、weekly=每周定点、monthly=每月定点、once=仅一次' }),
      intervalMinutes: Type.Optional(Type.Number({ description: 'scheduleType=interval 时的间隔分钟数' })),
      timeOfDay: Type.Optional(Type.String({ description: 'scheduleType=daily/weekly/monthly 时的触发时刻，格式 HH:mm' })),
      dayOfWeek: Type.Optional(Type.Number({ description: 'scheduleType=weekly 时的星期（0=周日,1=周一...6=周六）' })),
      dayOfMonth: Type.Optional(Type.Number({ description: 'scheduleType=monthly 时的日期（1-31）' })),
      scheduledAt: Type.Optional(Type.Number({ description: 'scheduleType=once 时的触发时间戳（毫秒）' })),
      maxRuns: Type.Optional(Type.Number({ description: '运行次数上限，达到后自动停用。0 或不传表示不限。' })),
      channelId: Type.String({ description: '渠道 ID（模型配置）' }),
      workspaceId: Type.String({ description: '工作区/项目 ID' }),
      sessionMode: Type.Optional(Type.Union([
        Type.Literal('daily'),
        Type.Literal('reuse'),
      ], { description: '会话模式：daily=每日新建子会话（默认），reuse=始终复用同一子会话' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const p = params as {
        name: string; prompt: string; scheduleType: string;
        intervalMinutes?: number; timeOfDay?: string; dayOfWeek?: number;
        dayOfMonth?: number; scheduledAt?: number; maxRuns?: number;
        channelId: string; workspaceId: string; sessionMode?: string;
      }
      const automation = createAutomation({
        name: p.name,
        prompt: p.prompt,
        scheduleType: p.scheduleType as any,
        intervalMinutes: p.intervalMinutes,
        timeOfDay: p.timeOfDay,
        dayOfWeek: p.dayOfWeek,
        dayOfMonth: p.dayOfMonth,
        scheduledAt: p.scheduledAt,
        maxRuns: p.maxRuns,
        channelId: p.channelId,
        workspaceId: p.workspaceId,
        sessionMode: p.sessionMode as any,
        permissionMode: 'bypassPermissions',
      })
      broadcastAutomationsChanged()
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ automation, message: '定时任务已创建，调度器将按计划自动执行。' }) }],
        details: { automation },
      }
    },
  }) as unknown as ToolDefinition)

  // 4. update_automation
  automationTools.push(sdkModule.defineTool({
    name: 'mcp__automation__update_automation',
    label: '更新定时任务',
    description: '更新定时任务的配置（名称、描述、调度、模型等）。',
    promptSnippet: '修改指定定时任务的配置。',
    parameters: Type.Object({
      id: Type.String({ description: '定时任务 ID' }),
      name: Type.Optional(Type.String({ description: '新名称' })),
      prompt: Type.Optional(Type.String({ description: '新任务描述' })),
      active: Type.Optional(Type.Boolean({ description: '启用/暂停' })),
      scheduleType: Type.Optional(Type.Union([
        Type.Literal('interval'),
        Type.Literal('daily'),
        Type.Literal('weekly'),
        Type.Literal('monthly'),
        Type.Literal('once'),
      ])),
      intervalMinutes: Type.Optional(Type.Number()),
      timeOfDay: Type.Optional(Type.String()),
      dayOfWeek: Type.Optional(Type.Number()),
      dayOfMonth: Type.Optional(Type.Number()),
      scheduledAt: Type.Optional(Type.Number()),
      maxRuns: Type.Optional(Type.Number()),
      channelId: Type.Optional(Type.String()),
      workspaceId: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const p = params as { id: string; [key: string]: unknown }
      const { id, ...updates } = p
      const automation = updateAutomation({ id, ...updates } as any)
      if (!automation) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ error: `定时任务不存在: ${id}` }) }],
          details: { error: `定时任务不存在: ${id}` },
        }
      }
      broadcastAutomationsChanged()
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ automation, message: '定时任务已更新。' }) }],
        details: { automation },
      }
    },
  }) as unknown as ToolDefinition)

  // 5. delete_automation
  automationTools.push(sdkModule.defineTool({
    name: 'mcp__automation__delete_automation',
    label: '删除定时任务',
    description: '删除指定定时任务。删除后无法恢复。',
    promptSnippet: '删除一个定时任务。',
    parameters: Type.Object({
      id: Type.String({ description: '定时任务 ID' }),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const { id } = params as { id: string }
      const ok = deleteAutomation(id)
      if (ok) broadcastAutomationsChanged()
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ success: ok, message: ok ? '定时任务已删除。' : '删除失败，任务可能不存在。' }) }],
        details: { success: ok },
      }
    },
  }) as unknown as ToolDefinition)

  // 6. run_automation_now
  automationTools.push(sdkModule.defineTool({
    name: 'mcp__automation__run_automation_now',
    label: '立即运行定时任务',
    description: '立即触发一次定时任务执行，不影响原有调度计划。',
    promptSnippet: '立即运行一个定时任务。',
    parameters: Type.Object({
      id: Type.String({ description: '定时任务 ID' }),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const { id } = params as { id: string }
      try {
        // 延迟导入避免循环依赖
        const { runAutomationNow } = require('../../planning/automation-scheduler')
        await runAutomationNow(id)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, message: '定时任务已触发执行。' }) }],
          details: { success: true },
        }
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: err instanceof Error ? err.message : '运行失败' }) }],
          details: { success: false, error: err instanceof Error ? err.message : '运行失败' },
        }
      }
    },
  }) as unknown as ToolDefinition)

  // ========== Planning MCP 工具 ==========
  // 让 Agent 在对话中直接读写本地 Todo、日程、分组、标签和提醒。
  // 移植自 Proma 的 pi-builtin-tools.ts buildPlanningTools()。
  const planningCtx = {
    sessionId,
    workspaceId: workspace?.id,
  }
  const planningTools: ToolDefinition[] = []

  // 辅助函数
  const jsonResult = (payload: unknown) => ({
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    details: payload,
  })
  const assertNonBlank = (value: string | undefined, field: string): string => {
    if (!value || value.trim().length === 0) throw new Error(`${field} 不能为空`)
    return value.trim()
  }
  const numOrUndef = (v: unknown): number | undefined =>
    typeof v === 'number' && Number.isFinite(v) ? v : undefined
  const defaultTodoDueAt = (): number => {
    const d = new Date()
    d.setHours(23, 59, 59, 999)
    return d.getTime()
  }
  const optionalPlanningFields = {
    notes: Type.Optional(Type.String({ description: '补充说明' })),
    workspaceId: Type.Optional(Type.String({ description: '所属工作区 ID；不传默认当前工作区' })),
    groupId: Type.Optional(Type.String({ description: '可选分组 ID' })),
    tagIds: Type.Optional(Type.Array(Type.String(), { description: '可选标签 ID 列表' })),
  }

  // 1. list_todos
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__list_todos', label: '列出 Todo',
    description: '列出本地 Todo。适合在安排工作、检查今天待办、维护任务状态前使用。',
    promptSnippet: '查看当前 Todo 列表。',
    parameters: Type.Object({
      status: Type.Optional(Type.Union([Type.Literal('open'), Type.Literal('completed')])),
      dueBefore: Type.Optional(Type.Number({ description: '仅返回此截止时间之前的 Todo，Unix 毫秒时间戳' })),
      limit: Type.Optional(Type.Number({ description: '最多返回数量，默认 50' })),
    }),
    async execute(_id: string, params: unknown) {
      const { status, dueBefore, limit } = params as { status?: 'open' | 'completed'; dueBefore?: number; limit?: number }
      return jsonResult({ todos: listTodos({ status, dueBefore, limit: limit ?? 50 }) })
    },
  }) as unknown as ToolDefinition)
  // 2. get_todo
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__get_todo', label: '读取 Todo',
    description: '按 ID 读取一个 Todo 的完整详情。',
    promptSnippet: '按 ID 读取 Todo 详情。',
    parameters: Type.Object({ id: Type.String({ description: 'Todo ID' }) }),
    async execute(_id: string, params: unknown) {
      const id = assertNonBlank((params as { id: string }).id, 'id')
      const todo = getTodo(id)
      if (!todo) throw new Error('Todo 不存在')
      return jsonResult({ todo })
    },
  }) as unknown as ToolDefinition)
  // 3. create_todo
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__create_todo', label: '创建 Todo',
    description: '创建本地 Todo。调用前必须先用 list_todos(status=open) 检查重复；用户明确提出待办，或可合理确定下一步时使用。未传 dueAt 时默认当天结束前。',
    promptSnippet: '创建新的 Todo。',
    parameters: Type.Object({ title: Type.String(), ...optionalPlanningFields, priority: Type.Optional(Type.Union([Type.Literal('low'), Type.Literal('medium'), Type.Literal('high')])), dueAt: Type.Optional(Type.Number({ description: '截止时间 Unix 毫秒时间戳' })) }),
    async execute(_id: string, params: unknown) {
      const args = params as Record<string, unknown>
      const title = assertNonBlank(args.title as string, 'title')
      const created = createTodo({ title, notes: args.notes as string | undefined, priority: args.priority as 'low' | 'medium' | 'high' | undefined, dueAt: numOrUndef(args.dueAt) ?? defaultTodoDueAt(), groupId: args.groupId as string | undefined, tagIds: args.tagIds as string[] | undefined, workspaceId: (args.workspaceId as string | undefined) ?? planningCtx.workspaceId })
      touchTodoSession(created.id, planningCtx.sessionId)
      const todo = getTodo(created.id)!
      broadcastPlanningChanged(['todos', 'reminders'])
      broadcastPlanningAgentOperation({ sessionId: planningCtx.sessionId, target: 'todo', action: 'created', title: todo.title })
      return jsonResult({ todo })
    },
  }) as unknown as ToolDefinition)
  // 4. update_todo
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__update_todo', label: '更新 Todo',
    description: '更新 Todo 的标题、说明、优先级或截止时间。',
    promptSnippet: '更新 Todo。',
    parameters: Type.Object({ id: Type.String(), title: Type.Optional(Type.String()), notes: Type.Optional(Type.String()), priority: Type.Optional(Type.Union([Type.Literal('low'), Type.Literal('medium'), Type.Literal('high')])), dueAt: Type.Optional(Type.Union([Type.Number(), Type.Null()])), groupId: Type.Optional(Type.Union([Type.String(), Type.Null()])), tagIds: Type.Optional(Type.Array(Type.String())), status: Type.Optional(Type.Union([Type.Literal('open'), Type.Literal('completed')])) }),
    async execute(_id: string, params: unknown) {
      const args = params as Record<string, unknown>
      const updated = updateTodo({ id: assertNonBlank(args.id as string, 'id'), title: args.title as string | undefined, notes: args.notes as string | undefined, priority: args.priority as 'low' | 'medium' | 'high' | undefined, dueAt: args.dueAt as number | null | undefined, groupId: args.groupId as string | null | undefined, tagIds: args.tagIds as string[] | undefined, status: args.status as 'open' | 'completed' | undefined })
      if (!updated) throw new Error('Todo 不存在')
      touchTodoSession(updated.id, planningCtx.sessionId)
      const todo = getTodo(updated.id)!
      broadcastPlanningChanged(['todos', 'reminders'])
      broadcastPlanningAgentOperation({ sessionId: planningCtx.sessionId, target: 'todo', action: 'updated', title: todo.title })
      return jsonResult({ todo })
    },
  }) as unknown as ToolDefinition)
  // 5. complete_todo
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__complete_todo', label: '完成 Todo',
    description: '将指定 Todo 标记为已完成。仅在任务确实完成或用户明确要求完成时使用。',
    promptSnippet: '完成 Todo。',
    parameters: Type.Object({ id: Type.String() }),
    async execute(_id: string, params: unknown) {
      const updated = updateTodo({ id: assertNonBlank((params as { id: string }).id, 'id'), status: 'completed' })
      if (!updated) throw new Error('Todo 不存在')
      touchTodoSession(updated.id, planningCtx.sessionId)
      const todo = getTodo(updated.id)!
      broadcastPlanningChanged(['todos', 'reminders'])
      broadcastPlanningAgentOperation({ sessionId: planningCtx.sessionId, target: 'todo', action: 'updated', title: todo.title })
      return jsonResult({ todo })
    },
  }) as unknown as ToolDefinition)
  // 6. delete_todo
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__delete_todo', label: '删除 Todo',
    description: '删除 Todo。只在用户明确要求删除时使用。',
    promptSnippet: '删除 Todo。',
    parameters: Type.Object({ id: Type.String() }),
    async execute(_id: string, params: unknown) {
      const id = assertNonBlank((params as { id: string }).id, 'id')
      const todo = getTodo(id)
      const deleted = deleteTodo(id)
      if (deleted) {
        broadcastPlanningChanged(['todos', 'calendar_events', 'reminders'])
        broadcastPlanningAgentOperation({ sessionId: planningCtx.sessionId, target: 'todo', action: 'deleted', title: todo?.title ?? 'Todo' })
      }
      return jsonResult({ deleted })
    },
  }) as unknown as ToolDefinition)
  // 7. list_calendar_events
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__list_calendar_events', label: '列出日程',
    description: '列出本地日程。用于查看指定时间范围的安排。',
    promptSnippet: '查看日程列表。',
    parameters: Type.Object({
      startAt: Type.Optional(Type.Number({ description: '查询范围起点，Unix 毫秒时间戳' })),
      endAt: Type.Optional(Type.Number({ description: '查询范围终点，Unix 毫秒时间戳' })),
      limit: Type.Optional(Type.Number({ description: '最多返回数量，默认 50' })),
    }),
    async execute(_id: string, params: unknown) {
      const { startAt, endAt, limit } = params as { startAt?: number; endAt?: number; limit?: number }
      return jsonResult({ events: listCalendarEvents({ from: startAt, to: endAt, limit: limit ?? 50 }) })
    },
  }) as unknown as ToolDefinition)
  // 8. get_calendar_event
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__get_calendar_event', label: '读取日程',
    description: '按 ID 读取一个日程的完整详情。',
    promptSnippet: '按 ID 读取日程详情。',
    parameters: Type.Object({ id: Type.String({ description: '日程 ID' }) }),
    async execute(_id: string, params: unknown) {
      const id = assertNonBlank((params as { id: string }).id, 'id')
      const event = getCalendarEvent(id)
      if (!event) throw new Error('日程不存在')
      return jsonResult({ event })
    },
  }) as unknown as ToolDefinition)
  // 9. create_calendar_event
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__create_calendar_event', label: '创建日程',
    description: '创建本地日程。用户明确提供时间安排时使用。',
    promptSnippet: '创建日程。',
    parameters: Type.Object({ title: Type.String(), startAt: Type.Number({ description: '开始时间 Unix 毫秒时间戳' }), endAt: Type.Optional(Type.Number()), allDay: Type.Optional(Type.Boolean()), ...optionalPlanningFields, todoId: Type.Optional(Type.String()) }),
    async execute(_id: string, params: unknown) {
      const args = params as Record<string, unknown>
      const event = createCalendarEvent({ title: assertNonBlank(args.title as string, 'title'), startAt: args.startAt as number, endAt: args.endAt as number | undefined, allDay: args.allDay as boolean | undefined, notes: args.notes as string | undefined, groupId: args.groupId as string | undefined, tagIds: args.tagIds as string[] | undefined, workspaceId: (args.workspaceId as string | undefined) ?? planningCtx.workspaceId, todoId: args.todoId as string | undefined })
      broadcastPlanningChanged(['calendar_events', 'reminders'])
      broadcastPlanningAgentOperation({ sessionId: planningCtx.sessionId, target: 'calendar_event', action: 'created', title: event.title })
      return jsonResult({ event })
    },
  }) as unknown as ToolDefinition)
  // 10. update_calendar_event
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__update_calendar_event', label: '更新日程',
    description: '更新日程时间或内容。',
    promptSnippet: '更新日程。',
    parameters: Type.Object({ id: Type.String(), title: Type.Optional(Type.String()), notes: Type.Optional(Type.String()), startAt: Type.Optional(Type.Number()), endAt: Type.Optional(Type.Union([Type.Number(), Type.Null()])), allDay: Type.Optional(Type.Boolean()), groupId: Type.Optional(Type.Union([Type.String(), Type.Null()])), tagIds: Type.Optional(Type.Array(Type.String())), todoId: Type.Optional(Type.Union([Type.String(), Type.Null()])) }),
    async execute(_id: string, params: unknown) {
      const args = params as Record<string, unknown>
      const event = updateCalendarEvent({ id: assertNonBlank(args.id as string, 'id'), title: args.title as string | undefined, notes: args.notes as string | undefined, startAt: args.startAt as number | undefined, endAt: args.endAt as number | null | undefined, allDay: args.allDay as boolean | undefined, groupId: args.groupId as string | null | undefined, tagIds: args.tagIds as string[] | undefined, todoId: args.todoId as string | null | undefined })
      if (!event) throw new Error('日程不存在')
      broadcastPlanningChanged(['calendar_events', 'reminders'])
      broadcastPlanningAgentOperation({ sessionId: planningCtx.sessionId, target: 'calendar_event', action: 'updated', title: event.title })
      return jsonResult({ event })
    },
  }) as unknown as ToolDefinition)
  // 11. delete_calendar_event
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__delete_calendar_event', label: '删除日程',
    description: '删除本地日程。只在用户明确要求删除时使用。',
    promptSnippet: '删除日程。',
    parameters: Type.Object({ id: Type.String() }),
    async execute(_id: string, params: unknown) {
      const id = assertNonBlank((params as { id: string }).id, 'id')
      const event = getCalendarEvent(id)
      const deleted = deleteCalendarEvent(id)
      if (deleted) {
        broadcastPlanningChanged(['calendar_events', 'reminders'])
        broadcastPlanningAgentOperation({ sessionId: planningCtx.sessionId, target: 'calendar_event', action: 'deleted', title: event?.title ?? '日程' })
      }
      return jsonResult({ deleted })
    },
  }) as unknown as ToolDefinition)
  // 12. list_groups
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__list_groups', label: '列出分组',
    description: '列出指定范围的 Todo 或日程分组。创建或归入分组前优先调用，以复用现有分组。',
    promptSnippet: '列出现有分组。',
    parameters: Type.Object({ scope: Type.Union([Type.Literal('todo'), Type.Literal('calendar')]) }),
    async execute(_id: string, params: unknown) {
      const scope = (params as { scope: 'todo' | 'calendar' }).scope
      return jsonResult({ groups: listPlanningGroups(scope) })
    },
  }) as unknown as ToolDefinition)
  // 13. create_group
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__create_group', label: '创建分组',
    description: '创建 Todo 或日程范围内的独立分组。只在用户明确提出新分组或现有分组不适用时使用。',
    promptSnippet: '创建分组。',
    parameters: Type.Object({ scope: Type.Union([Type.Literal('todo'), Type.Literal('calendar')]), name: Type.String(), color: Type.Optional(Type.String()), sortOrder: Type.Optional(Type.Number()) }),
    async execute(_id: string, params: unknown) {
      const args = params as { scope: 'todo' | 'calendar'; name: string; color?: string; sortOrder?: number }
      const group = createPlanningGroup({ scope: args.scope, name: assertNonBlank(args.name, 'name'), color: args.color, sortOrder: args.sortOrder })
      broadcastPlanningChanged(args.scope === 'todo' ? ['todo_groups', 'todos', 'reminders'] : ['calendar_groups', 'calendar_events', 'reminders'])
      return jsonResult({ group })
    },
  }) as unknown as ToolDefinition)
  // 14. update_group
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__update_group', label: '更新分组',
    description: '更新指定范围内的分组，不能借此移动分组范围。',
    promptSnippet: '更新分组。',
    parameters: Type.Object({ id: Type.String(), scope: Type.Union([Type.Literal('todo'), Type.Literal('calendar')]), name: Type.Optional(Type.String()), color: Type.Optional(Type.Union([Type.String(), Type.Null()])), sortOrder: Type.Optional(Type.Number()) }),
    async execute(_id: string, params: unknown) {
      const args = params as Record<string, unknown>
      const scope = args.scope as 'todo' | 'calendar'
      const group = updatePlanningGroup({ id: assertNonBlank(args.id as string, 'id'), scope, name: args.name as string | undefined, color: args.color as string | null | undefined, sortOrder: args.sortOrder as number | undefined })
      if (!group) throw new Error('分组不存在')
      broadcastPlanningChanged(scope === 'todo' ? ['todo_groups', 'todos', 'reminders'] : ['calendar_groups', 'calendar_events', 'reminders'])
      return jsonResult({ group })
    },
  }) as unknown as ToolDefinition)
  // 15. delete_group
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__delete_group', label: '删除分组',
    description: '删除指定范围内的分组，并仅清除该范围关联对象的分组字段。只在用户明确要求删除时使用。',
    promptSnippet: '删除分组。',
    parameters: Type.Object({ id: Type.String(), scope: Type.Union([Type.Literal('todo'), Type.Literal('calendar')]) }),
    async execute(_id: string, params: unknown) {
      const args = params as { id: string; scope: 'todo' | 'calendar' }
      const deleted = deletePlanningGroup(args.scope, assertNonBlank(args.id, 'id'))
      if (deleted) broadcastPlanningChanged(args.scope === 'todo' ? ['todo_groups', 'todos', 'reminders'] : ['calendar_groups', 'calendar_events', 'reminders'])
      return jsonResult({ deleted })
    },
  }) as unknown as ToolDefinition)
  // 16. list_tags
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__list_tags', label: '列出标签',
    description: '列出可用于 Todo 与日程的标签。创建或归类前优先调用，以复用已有标签。',
    promptSnippet: '列出现有标签。',
    parameters: Type.Object({}),
    async execute() { return jsonResult({ tags: listPlanningTags() }) },
  }) as unknown as ToolDefinition)
  // 17. create_tag
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__create_tag', label: '创建标签',
    description: '创建跨 Todo 和日程复用的标签。只在用户明确给出新标签或现有标签不适用时使用。',
    promptSnippet: '创建标签。',
    parameters: Type.Object({ name: Type.String(), color: Type.Optional(Type.String()) }),
    async execute(_id: string, params: unknown) {
      const args = params as { name: string; color?: string }
      const tag = createPlanningTag({ name: assertNonBlank(args.name, 'name'), color: args.color })
      broadcastPlanningChanged(['tags', 'todos', 'calendar_events', 'reminders'])
      return jsonResult({ tag })
    },
  }) as unknown as ToolDefinition)
  // 18. update_tag
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__update_tag', label: '更新标签',
    description: '更新标签名称或颜色。',
    promptSnippet: '更新标签。',
    parameters: Type.Object({ id: Type.String(), name: Type.Optional(Type.String()), color: Type.Optional(Type.Union([Type.String(), Type.Null()])) }),
    async execute(_id: string, params: unknown) {
      const args = params as Record<string, unknown>
      const tag = updatePlanningTag({ id: assertNonBlank(args.id as string, 'id'), name: args.name as string | undefined, color: args.color as string | null | undefined })
      if (!tag) throw new Error('标签不存在')
      broadcastPlanningChanged(['tags', 'todos', 'calendar_events', 'reminders'])
      return jsonResult({ tag })
    },
  }) as unknown as ToolDefinition)
  // 19. delete_tag
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__delete_tag', label: '删除标签',
    description: '删除标签并移除其关联。只在用户明确要求删除时使用。',
    promptSnippet: '删除标签。',
    parameters: Type.Object({ id: Type.String() }),
    async execute(_id: string, params: unknown) {
      const deleted = deletePlanningTag(assertNonBlank((params as { id: string }).id, 'id'))
      if (deleted) broadcastPlanningChanged(['tags', 'todos', 'calendar_events', 'reminders'])
      return jsonResult({ deleted })
    },
  }) as unknown as ToolDefinition)
  // 20. list_active_reminders
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__list_active_reminders', label: '列出到期提醒',
    description: '列出当前已到期且未确认的常驻提醒。用于帮助用户处理提醒。',
    promptSnippet: '列出到期提醒。',
    parameters: Type.Object({}),
    async execute() { return jsonResult({ reminders: listActivePlanningReminders() }) },
  }) as unknown as ToolDefinition)
  // 21. create_reminder
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__create_reminder', label: '创建提醒',
    description: '为 Todo 或日程创建指定时点的提醒。仅在用户要求提醒且时点明确时使用。',
    promptSnippet: '创建提醒。',
    parameters: Type.Object({ targetType: Type.Union([Type.Literal('todo'), Type.Literal('calendar_event')]), targetId: Type.String(), triggerAt: Type.Number({ description: '提醒触发 Unix 毫秒时间戳' }) }),
    async execute(_id: string, params: unknown) {
      const args = params as { targetType: 'todo' | 'calendar_event'; targetId: string; triggerAt: number }
      const reminder = createPlanningReminder({ targetType: args.targetType, targetId: assertNonBlank(args.targetId, 'targetId'), triggerAt: args.triggerAt })
      broadcastPlanningChanged(['todos', 'calendar_events', 'reminders'])
      return jsonResult({ reminder })
    },
  }) as unknown as ToolDefinition)
  // 22. update_reminder
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__update_reminder', label: '更新提醒时间',
    description: '修改未确认提醒的触发时间。',
    promptSnippet: '更新提醒时间。',
    parameters: Type.Object({ id: Type.String(), triggerAt: Type.Number({ description: '新的提醒触发 Unix 毫秒时间戳' }) }),
    async execute(_id: string, params: unknown) {
      const args = params as { id: string; triggerAt: number }
      const reminder = updatePlanningReminder(assertNonBlank(args.id, 'id'), args.triggerAt)
      if (!reminder) throw new Error('提醒不存在或已处理')
      broadcastPlanningChanged(['todos', 'calendar_events', 'reminders'])
      return jsonResult({ reminder })
    },
  }) as unknown as ToolDefinition)
  // 23. acknowledge_reminder
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__acknowledge_reminder', label: '确认提醒',
    description: '确认并关闭一个到期提醒，不会删除 Todo 或日程。仅在用户明确要求关闭提醒时使用。',
    promptSnippet: '确认提醒。',
    parameters: Type.Object({ id: Type.String() }),
    async execute(_id: string, params: unknown) {
      const reminder = acknowledgePlanningReminder(assertNonBlank((params as { id: string }).id, 'id'))
      if (!reminder) throw new Error('提醒不存在或已处理')
      broadcastPlanningChanged(['todos', 'calendar_events', 'reminders'])
      return jsonResult({ reminder })
    },
  }) as unknown as ToolDefinition)
  // 24. snooze_reminder
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__snooze_reminder', label: '推迟提醒',
    description: '将未确认提醒推迟指定分钟数。',
    promptSnippet: '推迟提醒。',
    parameters: Type.Object({ id: Type.String(), minutes: Type.Number({ description: '推迟分钟数，1 到 10080' }) }),
    async execute(_id: string, params: unknown) {
      const args = params as { id: string; minutes: number }
      const reminder = snoozePlanningReminder(assertNonBlank(args.id, 'id'), args.minutes)
      if (!reminder) throw new Error('提醒不存在或已处理')
      broadcastPlanningChanged(['todos', 'calendar_events', 'reminders'])
      return jsonResult({ reminder })
    },
  }) as unknown as ToolDefinition)
  // 25. delete_reminder
  planningTools.push(sdkModule.defineTool({
    name: 'mcp__planning__delete_reminder', label: '删除提醒',
    description: '删除提醒记录。只在用户明确要求彻底删除提醒时使用。',
    promptSnippet: '删除提醒。',
    parameters: Type.Object({ id: Type.String() }),
    async execute(_id: string, params: unknown) {
      const deleted = deletePlanningReminder(assertNonBlank((params as { id: string }).id, 'id'))
      if (deleted) broadcastPlanningChanged(['todos', 'calendar_events', 'reminders'])
      return jsonResult({ deleted })
    },
  }) as unknown as ToolDefinition)

  // 合并：内置工具（已包裹权限）+ AskUserQuestion + 运行时工具 + 协作工具 + Automation 工具 + Planning 工具 + MCP 工具
  // 关键：AskUserQuestion 必须经过 wrapToolWithPermission，
  // 这样 canUseTool 回调才能拦截它，发送 ask_user SSE 事件到前端，
  // 等待用户回答后注入 answers 字段到 updatedInput，再执行工具的 execute
  // ===== 内置浏览器工具 =====
  // 配置浏览器会话的 profile 和工作区隔离
  browserController.configureSession(sessionId, {
    profileKey: resolveBrowserProfileKey(workspace?.id, sessionId),
    allowedRoots: workspace ? [workspace.path || ''].filter(Boolean) : [],
    executionSource: 'user',
  })

  const browserTools: ToolDefinition[] = []

  // 1. BrowserNavigate
  browserTools.push(sdkModule.defineTool({
    name: 'BrowserNavigate',
    label: '导航到网址',
    description: '在受管浏览器中打开公共 HTTP/HTTPS 页面。',
    promptSnippet: '打开网页。',
    parameters: Type.Object({
      url: Type.String({ description: '要导航到的 URL 或域名。' }),
      tabId: Type.Optional(Type.String({ description: '指定标签 ID；不传则使用当前工作标签。' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>, signal?: AbortSignal) {
      const p = params as { url: string; tabId?: string }
      const state = await browserController.navigate(sessionId, p.url, p.tabId, signal)
      return { content: [{ type: 'text' as const, text: JSON.stringify({ url: state.url, title: state.title, tabId: state.activeTabId }) }], details: { url: state.url, title: state.title, tabId: state.activeTabId } }
    },
  }) as unknown as ToolDefinition)

  // 2. BrowserObserve
  browserTools.push(sdkModule.defineTool({
    name: 'BrowserObserve',
    label: '观察页面元素',
    description: '读取当前页面的可访问性结构与可交互元素 ref。',
    promptSnippet: '观察页面可交互元素。',
    parameters: Type.Object({
      maxElements: Type.Optional(Type.Number({ description: '最多返回的元素数量，默认 240，最大 400。' })),
      tabId: Type.Optional(Type.String({ description: '指定标签 ID。' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>, signal?: AbortSignal) {
      const p = params as { maxElements?: number; tabId?: string }
      const result = await browserController.observe(sessionId, p.tabId, p.maxElements, signal)
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], details: result }
    },
  }) as unknown as ToolDefinition)

  // 3. BrowserClick
  browserTools.push(sdkModule.defineTool({
    name: 'BrowserClick',
    label: '点击元素',
    description: '点击 BrowserObserve 返回的 ref 指向的元素。',
    promptSnippet: '点击页面元素。',
    parameters: Type.Object({
      ref: Type.String({ description: 'BrowserObserve 返回的元素 ref。' }),
      tabId: Type.Optional(Type.String({ description: '指定标签 ID。' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>, signal?: AbortSignal) {
      const p = params as { ref: string; tabId?: string }
      const state = await browserController.click(sessionId, p.ref, p.tabId, signal)
      return { content: [{ type: 'text' as const, text: JSON.stringify({ url: state.url, title: state.title, tabId: state.activeTabId }) }], details: { url: state.url, title: state.title } }
    },
  }) as unknown as ToolDefinition)

  // 4. BrowserFill
  browserTools.push(sdkModule.defineTool({
    name: 'BrowserFill',
    label: '填写输入框',
    description: '替换指定 ref 的 input、textarea 或 contenteditable 编辑器内容。',
    promptSnippet: '在输入框填写文本。',
    parameters: Type.Object({
      ref: Type.String({ description: 'BrowserObserve 返回的可编辑元素 ref。' }),
      text: Type.String({ description: '要输入的文本。' }),
      tabId: Type.Optional(Type.String({ description: '指定标签 ID。' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>, signal?: AbortSignal) {
      const p = params as { ref: string; text: string; tabId?: string }
      const state = await browserController.fill(sessionId, p.ref, p.text, p.tabId, signal)
      return { content: [{ type: 'text' as const, text: JSON.stringify({ url: state.url, title: state.title, tabId: state.activeTabId }) }], details: { url: state.url, title: state.title } }
    },
  }) as unknown as ToolDefinition)

  // 5. BrowserPress
  browserTools.push(sdkModule.defineTool({
    name: 'BrowserPress',
    label: '按键/输入',
    description: '按下导航键（Enter/Tab/方向键等），或向已聚焦的编辑器一次插入完整文本。',
    promptSnippet: '按键或输入文本。',
    parameters: Type.Object({
      key: Type.String({ description: '导航键名称或要输入的完整文本。' }),
      tabId: Type.Optional(Type.String({ description: '指定标签 ID。' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>, signal?: AbortSignal) {
      const p = params as { key: string; tabId?: string }
      const state = await browserController.press(sessionId, p.key, p.tabId, signal)
      return { content: [{ type: 'text' as const, text: JSON.stringify({ url: state.url, title: state.title, tabId: state.activeTabId }) }], details: { url: state.url, title: state.title } }
    },
  }) as unknown as ToolDefinition)

  // 6. BrowserWaitFor
  browserTools.push(sdkModule.defineTool({
    name: 'BrowserWaitFor',
    label: '等待条件',
    description: '等待 URL 片段、可见文本或 CSS selector 出现。',
    promptSnippet: '等待页面状态。',
    parameters: Type.Object({
      kind: Type.Union([Type.Literal('url'), Type.Literal('text'), Type.Literal('selector')], { description: '等待条件类型' }),
      value: Type.String({ description: 'URL 片段、文本或 CSS selector。' }),
      timeoutMs: Type.Optional(Type.Number({ description: '超时毫秒，默认 10000。' })),
      tabId: Type.Optional(Type.String({ description: '指定标签 ID。' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>, signal?: AbortSignal) {
      const p = params as { kind: 'url' | 'text' | 'selector'; value: string; timeoutMs?: number; tabId?: string }
      const result = await browserController.waitFor(sessionId, { kind: p.kind, value: p.value }, p.timeoutMs, p.tabId, signal)
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], details: result }
    },
  }) as unknown as ToolDefinition)

  // 7. BrowserDomAction
  browserTools.push(sdkModule.defineTool({
    name: 'BrowserDomAction',
    label: 'DOM 操作',
    description: '用 CSS selector 执行固定的 focus/fill/click/inspect 操作。',
    promptSnippet: '用 CSS selector 操作 DOM。',
    parameters: Type.Object({
      action: Type.Union([Type.Literal('focus'), Type.Literal('fill'), Type.Literal('click'), Type.Literal('inspect')], { description: 'DOM 操作类型' }),
      selector: Type.String({ description: 'CSS selector。' }),
      text: Type.Optional(Type.String({ description: 'fill 操作时的文本。' })),
      tabId: Type.Optional(Type.String({ description: '指定标签 ID。' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>, signal?: AbortSignal) {
      const p = params as { action: 'focus' | 'fill' | 'click' | 'inspect'; selector: string; text?: string; tabId?: string }
      const result = await browserController.domAction(sessionId, p, p.tabId, signal)
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], details: result }
    },
  }) as unknown as ToolDefinition)

  // 8. BrowserExecuteJavaScript
  browserTools.push(sdkModule.defineTool({
    name: 'BrowserExecuteJavaScript',
    label: '执行页面 JS',
    description: '在当前页面上下文执行 JavaScript。仅用于用户明确目标的最小操作。',
    promptSnippet: '在页面执行 JavaScript。',
    parameters: Type.Object({
      script: Type.String({ description: '要执行的 JavaScript 代码。' }),
      tabId: Type.Optional(Type.String({ description: '指定标签 ID。' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>, signal?: AbortSignal) {
      const p = params as { script: string; tabId?: string }
      const result = await browserController.evaluate(sessionId, p.script, p.tabId, signal)
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }], details: result }
    },
  }) as unknown as ToolDefinition)

  // 9. BrowserScreenshot
  browserTools.push(sdkModule.defineTool({
    name: 'BrowserScreenshot',
    label: '截取页面截图',
    description: '截取当前页面的截图。',
    promptSnippet: '截取页面截图。',
    parameters: Type.Object({
      tabId: Type.Optional(Type.String({ description: '指定标签 ID。' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>, signal?: AbortSignal) {
      const p = params as { tabId?: string }
      const result = await browserController.screenshot(sessionId, p.tabId, signal)
      return { content: [{ type: 'text' as const, text: JSON.stringify({ tabId: result.tabId, url: result.url, mimeType: result.mimeType, base64Length: result.base64.length }) }], details: result }
    },
  }) as unknown as ToolDefinition)

  // 10. BrowserListTabs
  browserTools.push(sdkModule.defineTool({
    name: 'BrowserListTabs',
    label: '列出标签',
    description: '列出当前会话的所有浏览器标签。',
    promptSnippet: '查看浏览器标签列表。',
    parameters: Type.Object({}),
    async execute() {
      const state = browserController.listTabs(sessionId)
      return { content: [{ type: 'text' as const, text: JSON.stringify({ tabs: state.tabs, activeTabId: state.activeTabId, agentTabId: state.agentTabId }) }], details: { tabs: state.tabs, activeTabId: state.activeTabId, agentTabId: state.agentTabId } }
    },
  }) as unknown as ToolDefinition)

  // 11. BrowserNewTab
  browserTools.push(sdkModule.defineTool({
    name: 'BrowserNewTab',
    label: '新建标签',
    description: '创建新的 Agent 工作标签并激活到用户可见面板。',
    promptSnippet: '新建浏览器标签。',
    parameters: Type.Object({
      url: Type.Optional(Type.String({ description: '新标签要打开的 URL。' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>, signal?: AbortSignal) {
      const p = params as { url?: string }
      const state = await browserController.createNewTab(sessionId, p.url, signal)
      return { content: [{ type: 'text' as const, text: JSON.stringify({ tabId: state.activeTabId, url: state.url, title: state.title }) }], details: { tabId: state.activeTabId, url: state.url, title: state.title } }
    },
  }) as unknown as ToolDefinition)

  // 12. BrowserSelectTab
  browserTools.push(sdkModule.defineTool({
    name: 'BrowserSelectTab',
    label: '选择标签',
    description: '选择已有标签作为 Agent 工作标签。',
    promptSnippet: '切换浏览器工作标签。',
    parameters: Type.Object({
      tabId: Type.String({ description: '要选择的标签 ID。' }),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const p = params as { tabId: string }
      const state = browserController.selectAgentTab(sessionId, p.tabId)
      return { content: [{ type: 'text' as const, text: JSON.stringify({ tabId: state.activeTabId, url: state.url, title: state.title }) }], details: { tabId: state.activeTabId, url: state.url, title: state.title } }
    },
  }) as unknown as ToolDefinition)

  // 13. BrowserCloseTab
  browserTools.push(sdkModule.defineTool({
    name: 'BrowserCloseTab',
    label: '关闭标签',
    description: '关闭指定标签。',
    promptSnippet: '关闭浏览器标签。',
    parameters: Type.Object({
      tabId: Type.String({ description: '要关闭的标签 ID。' }),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const p = params as { tabId: string }
      const state = await browserController.closeTab(sessionId, p.tabId)
      return { content: [{ type: 'text' as const, text: JSON.stringify({ closed: true, remainingTabs: state?.tabs?.length ?? 0 }) }], details: { closed: true, remainingTabs: state?.tabs?.length ?? 0 } }
    },
  }) as unknown as ToolDefinition)

  // 14. BrowserPreviewOpen
  browserTools.push(sdkModule.defineTool({
    name: 'BrowserPreviewOpen',
    label: '预览本地文件',
    description: '在受管浏览器中预览当前项目或已授权目录中的 HTML / index.html。',
    promptSnippet: '预览本地 HTML 文件。',
    parameters: Type.Object({
      path: Type.String({ description: '要预览的 HTML 文件路径或目录路径。' }),
      tabId: Type.Optional(Type.String({ description: '指定标签 ID。' })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>, signal?: AbortSignal) {
      const p = params as { path: string; tabId?: string }
      const allowedRoots = workspace ? [workspace.path || ''].filter(Boolean) : []
      const state = await browserController.previewOpen(sessionId, p.path, p.tabId, allowedRoots, cwd, signal)
      return { content: [{ type: 'text' as const, text: JSON.stringify({ tabId: state.activeTabId, url: state.url, title: state.title }) }], details: { tabId: state.activeTabId, url: state.url, title: state.title } }
    },
  }) as unknown as ToolDefinition)

  const allCustomTools: ToolDefinition[] = [
    ...wrappedTools,
    wrapToolWithPermission(askUserQuestionTool as unknown as ToolDefinition, canUseTool),
    taskCreateTool as unknown as ToolDefinition,
    taskUpdateTool as unknown as ToolDefinition,
    wrapToolWithPermission(runPythonScriptTool as unknown as ToolDefinition, canUseTool),
    wrapToolWithPermission(runNodeScriptTool as unknown as ToolDefinition, canUseTool),
    wrapToolWithPermission(installPackageTool as unknown as ToolDefinition, canUseTool),
    wrapToolWithPermission(runGitCommandTool as unknown as ToolDefinition, canUseTool),
    searchKnowledgeBaseTool as unknown as ToolDefinition,
    ...collaborationTools,
    ...automationTools,
    ...planningTools,
    ...browserTools,
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
    // 思考深度等级（off / low / medium / high / xhigh）
    ...(input.thinkingLevel && input.thinkingLevel !== 'off' && { thinkingLevel: input.thinkingLevel as any }),
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
    // 清理协作子会话记录
    cleanupDelegations(sessionId)
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
// 取消浏览器操作
browserController.cancelSession(sessionId)
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
