/**
 * 内置 MCP 开关设置
 *
 * 管理内置 MCP 的启用/禁用状态。
 * 使用 default-mcp.json 中的 defaultEnabled 字段作为默认值。
 * 用户切换后持久化到 JSON 文件，重启后状态保持。
 */

import { logger } from 'ee-core/log'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
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

/** 设置文件路径 */
function getSettingsFilePath(): string {
  const dir = join(homedir(), '.diting', 'pi-agent')
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true })
    } catch {
      // 目录可能已被其他进程创建，忽略
    }
  }
  return join(dir, 'builtin-mcp-settings.json')
}

interface PersistedSettings {
  /** 用户手动禁用的 MCP ID（仅对 defaultEnabled=true 的有效） */
  disabledIds: string[]
  /** 用户手动启用的 MCP ID（仅对 defaultEnabled=false 的有效） */
  enabledIds: string[]
}

/** 运行时缓存 */
let disabledIdsCache: Set<string> | null = null
let enabledIdsCache: Set<string> | null = null

/** 从 JSON 文件加载设置 */
function loadFromStorage(): void {
  if (disabledIdsCache !== null && enabledIdsCache !== null) return

  try {
    const filePath = getSettingsFilePath()
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf-8')
      const parsed: PersistedSettings = JSON.parse(raw)
      disabledIdsCache = new Set(parsed.disabledIds || [])
      enabledIdsCache = new Set(parsed.enabledIds || [])
      logger.info(`[Pi Agent MCP] 已加载内置 MCP 设置: disabled=${parsed.disabledIds?.length || 0}, enabled=${parsed.enabledIds?.length || 0}`)
    } else {
      disabledIdsCache = new Set<string>()
      enabledIdsCache = new Set<string>()
    }
  } catch (err) {
    logger.warn('[Pi Agent MCP] 加载内置 MCP 设置失败，使用默认值:', err)
    disabledIdsCache = new Set<string>()
    enabledIdsCache = new Set<string>()
  }
}

/** 保存到 JSON 文件 */
function saveToStorage(): void {
  try {
    const filePath = getSettingsFilePath()
    const data: PersistedSettings = {
      disabledIds: Array.from(disabledIdsCache!).sort(),
      enabledIds: Array.from(enabledIdsCache!).sort(),
    }
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    logger.info('[Pi Agent MCP] 内置 MCP 设置已持久化')
  } catch (err) {
    logger.error('[Pi Agent MCP] 保存内置 MCP 设置失败:', err)
  }
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
