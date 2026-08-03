/**
 * 内置 MCP 基础定义加载层
 *
 * 移植自 Proma 的 baseline.ts，从 default-mcp.json 读取内置 MCP 定义。
 * 支持外部进程型 MCP（chrome-devtools、web-search）的 stdio 运行时配置。
 */

import type { BuiltinMcpCategory, McpToolSummary } from '../types'
import manifest from './default-mcp.json'

/** MCP 运行时配置（stdio / http / sse） */
export interface BuiltinMcpRuntimeConfig {
  type: 'stdio' | 'http' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  envNotes?: string
}

/** 内置 MCP 实现状态 */
export type BuiltinMcpStatus = 'active' | 'pending'

export interface BuiltinMcpDefinition {
  id: string
  name: string
  displayName: string
  description: string
  category: BuiltinMcpCategory
  kind: 'internal'
  deletable: boolean
  defaultEnabled: boolean
  toggleable: boolean
  /** 实现状态：active=可用，pending=待实现 */
  status?: BuiltinMcpStatus
  /** 运行时启动配置（仅 status=active 的外部进程型 MCP 有） */
  runtime?: BuiltinMcpRuntimeConfig
  tools: McpToolSummary[]
}

const DEFINITIONS: BuiltinMcpDefinition[] = (manifest.servers as unknown as BuiltinMcpDefinition[]).map(
  (s) => ({ ...s }),
)

const BY_ID = new Map<string, BuiltinMcpDefinition>(DEFINITIONS.map((d) => [d.id, d]))

/** 所有内置 MCP 定义 */
export function getBuiltinMcpDefinitions(): BuiltinMcpDefinition[] {
  return DEFINITIONS
}

/** 按 id 取定义 */
export function getBuiltinMcpById(id: string): BuiltinMcpDefinition | undefined {
  return BY_ID.get(id)
}

/** 取运行时真实 server 名 */
export function getBuiltinMcpName(id: string): string {
  return BY_ID.get(id)?.name ?? id
}

/** 内置 MCP 保留名集合 */
export const RESERVED_BUILTIN_KEYS: ReadonlySet<string> = new Set(
  DEFINITIONS.flatMap((d) => [d.id, d.name]),
)
