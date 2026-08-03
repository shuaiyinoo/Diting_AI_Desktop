/**
 * 内置 MCP 运行时配置注入器
 *
 * 核心职责：将内置 MCP 的 stdio 运行时配置合并到工作区的 mcpServers 字典中，
 * 供 buildPiMcpTools() 连接和桥接。
 *
 * 这是 builtin-mcp 元数据与 Pi SDK 之间的"运行时注入层"——
 * 之前 Diting 只移植了展示层（catalog.ts）和设置层（settings.ts），
 * 但缺少了将内置 MCP 配置注入到 Agent 会话的这一关键环节。
 */

import { logger } from 'ee-core/log'
import { getBuiltinMcpDefinitions, type BuiltinMcpDefinition } from './baseline'
import { isBuiltinMcpUserEnabled } from './settings'

/** Pi SDK 的 mcpServers 配置格式 */
type PiMcpServers = Record<string, Record<string, unknown>>

/**
 * 解析已启用的内置 MCP 运行时配置
 *
 * 遍历所有内置 MCP 定义，对于：
 * - status='active' 且有 runtime 配置的（chrome-devtools、web-search）：返回 stdio 启动配置
 * - status='pending' 的（automation、collaboration）：跳过，不注入
 * - 用户未启用的：跳过
 *
 * @returns 以 server name 为 key 的运行时配置字典，可直接合并到 mcpServers
 */
export function resolveBuiltinMcpConfigs(): PiMcpServers {
  const result: PiMcpServers = {}

  for (const def of getBuiltinMcpDefinitions()) {
    // 检查用户是否启用了此 MCP
    if (!isBuiltinMcpUserEnabled(def.id)) {
      continue
    }

    // 只注入有运行时配置的（外部进程型 MCP）
    if (!def.runtime) {
      // status='pending' 的内部 MCP（automation、collaboration）暂无实现
      if (def.status === 'pending') {
        logger.info(`[Pi Agent MCP] 内置 MCP ${def.id} 状态为 pending，跳过注入`)
      }
      continue
    }

    // 构建 Pi SDK 格式的 mcpServer 配置
    const config: Record<string, unknown> = {
      type: def.runtime.type,
    }

    if (def.runtime.command) config.command = def.runtime.command
    if (def.runtime.args) config.args = def.runtime.args
    if (def.runtime.env) config.env = def.runtime.env
    if (def.runtime.url) config.url = def.runtime.url
    if (def.runtime.headers) config.headers = def.runtime.headers

    result[def.name] = config
    logger.info(`[Pi Agent MCP] 已注入内置 MCP 运行时配置: ${def.name} (${def.id})`)
  }

  return result
}

/**
 * 将内置 MCP 配置合并到用户工作区配置中
 *
 * 用户工作区 mcp.json 中的配置优先（允许用户覆盖内置配置）。
 * 内置配置仅填充用户未定义的 server。
 *
 * @param userConfig 用户工作区的 mcpServers 配置
 * @returns 合并后的完整 mcpServers 配置
 */
export function mergeMcpConfigs(userConfig: PiMcpServers): PiMcpServers {
  const builtinConfig = resolveBuiltinMcpConfigs()

  // 用户配置优先：如果用户已定义了同名 server，不覆盖
  const merged: PiMcpServers = { ...builtinConfig }
  for (const [name, config] of Object.entries(userConfig)) {
    merged[name] = config
  }

  return merged
}
