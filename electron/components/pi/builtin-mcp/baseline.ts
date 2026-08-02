/**
 * 内置 MCP 基础定义加载层
 *
 * 移植自 Proma 的 baseline.ts，从 default-mcp.json 读取内置 MCP 定义。
 */

import type { BuiltinMcpCategory, McpToolSummary } from '../types'
import manifest from './default-mcp.json'

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
