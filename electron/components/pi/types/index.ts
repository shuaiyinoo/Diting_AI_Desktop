/**
 * Pi Agent 核心类型定义
 *
 * 移植自 Proma 的 @proma/shared 类型，适配 Diting 的 ee-core 架构。
 * 只保留 Pi Agent SDK 相关类型，舍弃 Claude Agent SDK 部分。
 */

/** Agent 运行时类型（仅 Pi） */
export type AgentRuntime = 'pi'

/** 权限模式 */
export type PromaPermissionMode = 'safe' | 'ask' | 'allow-all' | 'bypassPermissions'

/** Agent 事件类型 */
export type AgentEventType =
  | 'text'           // 文本流式输出
  | 'tool_start'     // 工具调用开始
  | 'tool_result'    // 工具调用结果
  | 'thinking'       // 思考过程
  | 'done'           // 完成
  | 'error'          // 错误
  | 'title'          // 标题更新

/** Agent 流式事件 */
export interface AgentStreamEvent {
  event: AgentEventType
  sessionId: string
  delta?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: unknown
  title?: string
  error?: string
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
}

/** Agent 会话元数据 */
export interface AgentSessionMeta {
  id: string
  title: string
  channelId?: string
  workspaceId?: string
  agentRuntime: AgentRuntime
  sdkSessionId?: string
  createdAt: number
  updatedAt: number
  /** 委派深度：0=用户主会话 */
  delegationDepth?: number
}

/** Agent 消息（持久化） */
export interface AgentMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: AgentMessageBlock[]
  timestamp: number
}

/** Agent 消息内容块 */
export interface AgentMessageBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking'
  text?: string
  toolName?: string
  toolInput?: Record<string, unknown>
  toolResult?: unknown
  thinking?: string
}

/** 发送 Agent 消息的输入 */
export interface AgentSendInput {
  sessionId: string
  message: string
  channelId?: string
  modelId?: string
  workspaceId?: string
  workspaceSlug?: string
  permissionMode?: PromaPermissionMode
  /** 用户在输入框 / 引用的 Skill name */
  skillMentions?: string[]
  /** 附加目录 */
  additionalDirectories?: string[]
}

/** Skill 元数据 */
export interface SkillMeta {
  slug: string
  name: string
  description?: string
  group?: string
  icon?: string
  version?: string
  enabled: boolean
  /** 导入来源 */
  importSource?: {
    sourceWorkspaceSlug: string
    sourceVersion: string
  }
  /** 是否有更新 */
  hasUpdate?: boolean
}

/** Skill 资源文件树节点 */
export interface SkillFileNode {
  name: string
  relativePath: string
  type: 'file' | 'directory'
  size?: number
  children?: SkillFileNode[]
}

/** Skill 资源文件内容 */
export interface SkillFileContent {
  relativePath: string
  isText: boolean
  size: number
  content?: string
}

/** 工作区能力 */
export interface WorkspaceCapabilities {
  mcpServers: BuiltinMcpServerSummary[]
  skills: SkillMeta[]
}

/** 内置 MCP 服务器摘要 */
export interface BuiltinMcpServerSummary {
  id: string
  name: string
  displayName: string
  description: string
  category: BuiltinMcpCategory
  tools: McpToolSummary[]
  toggleable: boolean
  enabled: boolean
  available: boolean
  availabilityReason?: string
}

/** 内置 MCP 分类 */
export type BuiltinMcpCategory = 'automation' | 'collaboration' | 'media' | 'browser'

/** MCP 工具摘要 */
export interface McpToolSummary {
  name: string
  description: string
  readOnly?: boolean
}

/** Agent 渠道（Provider）配置 */
export interface AgentChannel {
  id: string
  name: string
  provider: string
  apiKey?: string
  baseUrl?: string
  modelId?: string
  enabled: boolean
}

/** Pi Agent 查询选项 */
export interface PiAgentQueryOptions {
  apiKey: string
  baseUrl?: string
  provider: string
  channelName?: string
  maxTurns?: number
  permissionMode: PromaPermissionMode
  systemPrompt: string
  resumeSessionId?: string
  piAgentDir: string
  piSessionDir: string
  additionalSkillPaths?: string[]
  skillMentions?: string[]
  additionalDirectories?: string[]
  thinkingLevel?: 'off' | 'low' | 'medium' | 'high'
  onSessionId?: (sdkSessionId: string, sessionFile?: string) => void
  onModelResolved?: (model: string) => void
  onContextWindow?: (contextWindow: number) => void
}
