/**
 * Agent 权限管理服务
 *
 * 移植自 Proma 的 agent-permission-service.ts。
 * 管理工具权限检查和权限模式。
 */

import { logger } from 'ee-core/log'
import type { PromaPermissionMode } from '../types'

/** 权限规则 */
export interface PermissionRule {
  /** 工具名模式（支持前缀匹配） */
  toolPattern: string
  /** 是否允许 */
  allow: boolean
  /** 是否只读操作 */
  readOnly?: boolean
}

/** 默认权限规则 */
const DEFAULT_RULES: PermissionRule[] = [
  // 只读工具默认允许
  { toolPattern: 'Read', allow: true, readOnly: true },
  { toolPattern: 'Grep', allow: true, readOnly: true },
  { toolPattern: 'Glob', allow: true, readOnly: true },
  { toolPattern: 'LS', allow: true, readOnly: true },
  { toolPattern: 'mcp__web_search__', allow: true, readOnly: true },
  // 写操作工具默认需要确认
  { toolPattern: 'Write', allow: false },
  { toolPattern: 'Edit', allow: false },
  { toolPattern: 'Bash', allow: false },
  { toolPattern: 'NotebookEdit', allow: false },
]

/** 运行时权限缓存 */
const permissionCache = new Map<string, boolean>()

/**
 * 检查工具是否需要权限确认
 *
 * @param toolName 工具名
 * @param mode 权限模式
 * @returns true=需要确认, false=直接执行
 */
export function needsPermission(toolName: string, mode: PromaPermissionMode): boolean {
  // bypassPermissions 模式：所有工具都直接执行
  if (mode === 'bypassPermissions') return false

  // allow-all 模式：所有工具都直接执行
  if (mode === 'allow-all') return false

  // safe 模式：所有写操作都需要确认
  if (mode === 'safe') {
    const rule = DEFAULT_RULES.find((r) => toolName.startsWith(r.toolPattern))
    if (rule) return !rule.allow
    return true // 未知工具默认需要确认
  }

  // ask 模式：只读工具自动通过，写操作需要确认
  if (mode === 'ask') {
    const rule = DEFAULT_RULES.find((r) => toolName.startsWith(r.toolPattern))
    if (rule?.readOnly) return false
    if (rule?.allow) return false
    return true
  }

  return true
}

/**
 * 检查工具是否为只读操作
 */
export function isReadOnlyTool(toolName: string): boolean {
  const rule = DEFAULT_RULES.find((r) => toolName.startsWith(r.toolPattern))
  return rule?.readOnly ?? false
}

/**
 * 缓存用户对某工具的权限决策
 */
export function cachePermission(toolName: string, allow: boolean): void {
  permissionCache.set(toolName, allow)
  logger.info(`[Pi Agent Permission] 缓存权限决策: ${toolName} → ${allow ? '允许' : '拒绝'}`)
}

/**
 * 获取缓存的权限决策
 */
export function getCachedPermission(toolName: string): boolean | undefined {
  return permissionCache.get(toolName)
}

/**
 * 清除权限缓存
 */
export function clearPermissionCache(): void {
  permissionCache.clear()
  logger.info('[Pi Agent Permission] 已清除权限缓存')
}

/**
 * 权限模式说明
 */
export const PERMISSION_MODE_DESCRIPTIONS: Record<PromaPermissionMode, string> = {
  safe: '安全模式：所有工具调用都需要确认',
  ask: '询问模式：只读工具自动通过，写操作需确认',
  'allow-all': '允许所有：所有工具调用直接执行，无需确认',
  bypassPermissions: '绕过权限：等同于 allow-all（兼容 SDK 参数）',
}
