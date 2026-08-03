/**
 * 内置 MCP 开关设置
 *
 * 管理内置 MCP 的启用/禁用状态。
 * 使用 default-mcp.json 中的 defaultEnabled 字段作为默认值。
 * 用户切换后持久化到内存缓存（后续对接 SQLite）。
 */

import { logger } from 'ee-core/log'
import { getBuiltinMcpDefinitions } from './baseline'

/**
 * 默认关闭的内置 MCP ID 集合。
 * 从 default-mcp.json 的 defaultEnabled=false 的条目自动构建。
 */
const DEFAULT_DISABLED_IDS: Set<string> = new Set(
  getBuiltinMcpDefinitions()
    .filter((d) => d.defaultEnabled === false)
    .map((d) => d.id),
)

/** 运行时缓存（避免频繁读数据库） */
let disabledIdsCache: Set<string> | null = null
let enabledIdsCache: Set<string> | null = null

/** 从数据库加载设置（简化版：先用内存缓存，后续对接 SQLite） */
function loadFromStorage(): void {
  if (disabledIdsCache === null) {
    // TODO: 从 SQLite settings 表读取 builtinMcpDisabledIds
    disabledIdsCache = new Set<string>()
  }
  if (enabledIdsCache === null) {
    // TODO: 从 SQLite settings 表读取 builtinMcpEnabledIds
    enabledIdsCache = new Set<string>()
  }
}

/** 保存到数据库 */
function saveToStorage(): void {
  // TODO: 写入 SQLite settings 表
  // updateSetting('builtinMcpDisabledIds', Array.from(disabledIdsCache!).sort())
  // updateSetting('builtinMcpEnabledIds', Array.from(enabledIdsCache!).sort())
}

/** 判断某个内置 MCP 是否默认关闭 */
export function isBuiltinMcpDefaultDisabled(id: string): boolean {
  return DEFAULT_DISABLED_IDS.has(id)
}

/** 判断某个内置 MCP 是否被用户启用 */
export function isBuiltinMcpUserEnabled(id: string): boolean {
  loadFromStorage()

  if (DEFAULT_DISABLED_IDS.has(id)) {
    // 默认关闭的：需要用户显式启用
    return enabledIdsCache!.has(id)
  }

  // 默认开启的：未被用户手动关闭即为启用
  return !disabledIdsCache!.has(id)
}

/** 设置内置 MCP 开关 */
export function setBuiltinMcpUserEnabled(id: string, enabled: boolean): void {
  loadFromStorage()

  if (DEFAULT_DISABLED_IDS.has(id)) {
    if (enabled) {
      enabledIdsCache!.add(id)
    } else {
      enabledIdsCache!.delete(id)
    }
  } else {
    if (enabled) {
      disabledIdsCache!.delete(id)
    } else {
      disabledIdsCache!.add(id)
    }
  }

  saveToStorage()
  logger.info(`[Pi Agent MCP] 内置 MCP ${id} 已${enabled ? '启用' : '禁用'}`)
}
