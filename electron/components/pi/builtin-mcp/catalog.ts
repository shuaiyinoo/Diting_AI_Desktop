/**
 * 内置 MCP 能力目录
 *
 * 提供可展示的元数据和可用性判断。
 * 合并 baseline 定义（含 runtime 配置）和 settings 开关状态。
 */

import type { BuiltinMcpCategory, McpToolSummary } from '../types'
import { getBuiltinMcpDefinitions, type BuiltinMcpDefinition } from './baseline'
import { isBuiltinMcpDefaultDisabled, isBuiltinMcpUserEnabled } from './settings'

interface BuiltinMcpListContext {
  workspaceSlug?: string
}

function resolveAvailability(
  item: BuiltinMcpDefinition,
  _ctx: BuiltinMcpListContext,
): Pick<BuiltinMcpServerSummary, 'enabled' | 'available' | 'availabilityReason'> {
  if (item.toggleable === false) {
    return { enabled: true, available: true }
  }

  const userEnabled = isBuiltinMcpUserEnabled(item.id)
  if (!userEnabled) {
    return {
      enabled: false,
      available: false,
      availabilityReason: isBuiltinMcpDefaultDisabled(item.id)
        ? '默认关闭，可手动开启'
        : '已手动关闭',
    }
  }

  // 用户已启用，但实现状态为 pending 的（automation、collaboration）
  if (item.status === 'pending') {
    return {
      enabled: true,
      available: false,
      availabilityReason: '功能待实现，敬请期待',
    }
  }

  return { enabled: true, available: true }
}

export function listBuiltinMcpServers(ctx: BuiltinMcpListContext = {}): BuiltinMcpServerSummary[] {
  return getBuiltinMcpDefinitions().map((item) => ({
    id: item.id,
    name: item.name,
    displayName: item.displayName,
    description: item.description,
    category: item.category,
    tools: item.tools,
    toggleable: item.toggleable,
    ...resolveAvailability(item, ctx),
  }))
}

// 重新导出类型供外部使用
export type { BuiltinMcpCategory, McpToolSummary } from '../types'

/** 前端展示用的 MCP 服务器摘要 */
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
