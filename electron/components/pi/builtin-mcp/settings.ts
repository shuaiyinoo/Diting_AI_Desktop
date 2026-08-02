/**
 * 内置 MCP 开关设置
 *
 * 移植自 Proma 的 settings.ts。
 * 使用 Diting 的 SQLite settings 表替代 Proma 的 JSON 文件。
 */

import { logger } from 'ee-core/log'

/**
 * 默认关闭的内置 MCP ID。
 * 需要用户额外配置才有意义，默认不向 Agent 注入。
 */
const DEFAULT_DISABLED_IDS = new Set<string>([])

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
    return enabledIdsCache!.has(id)
  }

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
