/**
 * 内置 MCP 能力目录
 *
 * 移植自 Proma 的 catalog.ts，提供可展示的元数据和可用性判断。
 */

import type { BuiltinMcpServerSummary } from '../types'
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
