/**
 * 钉钉配置管理
 *
 * 管理钉钉多 Bot 配置的持久化存储。
 * 数据持久化到 ~/.diting/bridge/dingtalk.json
 */

import { randomUUID } from 'crypto'
import {
  getDingTalkConfigPath,
  readJsonSafe,
  writeJsonAtomic,
  encryptSecret,
  decryptSecret,
  getBridgeBindingsDir,
} from './bridge-config'
import { join } from 'path'

// ===== 类型定义 =====

/** 单个钉钉 Bot 配置 */
export interface DingTalkBotConfig {
  id: string
  name: string
  enabled: boolean
  /** 钉钉应用 Client ID */
  clientId: string
  /** 钉钉应用 Client Secret（safeStorage 加密） */
  clientSecret: string
  /** 默认工作区 ID */
  defaultWorkspaceId?: string
  /** 默认渠道 ID */
  defaultChannelId?: string
  /** 默认模型 ID */
  defaultModelId?: string
}

/** 多 Bot 配置文件 */
export interface DingTalkMultiBotConfig {
  version: 1
  bots: DingTalkBotConfig[]
}

/** Bot 配置保存输入（明文 secret） */
export interface DingTalkBotConfigInput {
  id?: string
  name: string
  enabled: boolean
  clientId: string
  clientSecret: string  // 明文，空字符串表示不修改
  defaultWorkspaceId?: string
  defaultChannelId?: string
  defaultModelId?: string
}

// ===== 默认配置 =====

const DEFAULT_CONFIG: DingTalkMultiBotConfig = {
  version: 1,
  bots: [],
}

// ===== 配置 CRUD =====

/** 读取钉钉多 Bot 配置 */
export function getDingTalkMultiBotConfig(): DingTalkMultiBotConfig {
  return readJsonSafe<DingTalkMultiBotConfig>(getDingTalkConfigPath(), DEFAULT_CONFIG)
}

/** 读取单个 Bot 配置 */
export function getDingTalkBotById(botId: string): DingTalkBotConfig | undefined {
  return getDingTalkMultiBotConfig().bots.find((b) => b.id === botId)
}

/** 保存/更新 Bot 配置 */
export function saveDingTalkBotConfig(input: DingTalkBotConfigInput): DingTalkBotConfig {
  const config = getDingTalkMultiBotConfig()

  let bot: DingTalkBotConfig
  if (input.id) {
    const idx = config.bots.findIndex((b) => b.id === input.id)
    if (idx === -1) throw new Error(`Bot ${input.id} 不存在`)
    bot = config.bots[idx]!
    bot.name = input.name
    bot.enabled = input.enabled
    bot.clientId = input.clientId
    if (input.clientSecret) {
      bot.clientSecret = encryptSecret(input.clientSecret)
    }
    bot.defaultWorkspaceId = input.defaultWorkspaceId
    bot.defaultChannelId = input.defaultChannelId
    bot.defaultModelId = input.defaultModelId
  } else {
    bot = {
      id: randomUUID(),
      name: input.name,
      enabled: input.enabled,
      clientId: input.clientId,
      clientSecret: input.clientSecret ? encryptSecret(input.clientSecret) : '',
      defaultWorkspaceId: input.defaultWorkspaceId,
      defaultChannelId: input.defaultChannelId,
      defaultModelId: input.defaultModelId,
    }
    config.bots.push(bot)
  }

  writeJsonAtomic(getDingTalkConfigPath(), config)
  return bot
}

/** 删除 Bot */
export function removeDingTalkBot(botId: string): boolean {
  const config = getDingTalkMultiBotConfig()
  const idx = config.bots.findIndex((b) => b.id === botId)
  if (idx === -1) return false
  config.bots.splice(idx, 1)
  writeJsonAtomic(getDingTalkConfigPath(), config)
  return true
}

/** 解密获取 Client Secret */
export function getDecryptedDingTalkClientSecret(botId: string): string {
  const bot = getDingTalkBotById(botId)
  if (!bot) throw new Error(`Bot ${botId} 不存在`)
  return decryptSecret(bot.clientSecret)
}

/** 获取钉钉 Bot 绑定文件路径 */
export function getDingTalkBotBindingsPath(botId: string): string {
  return join(getBridgeBindingsDir(), `dingtalk-bindings-${botId}.json`)
}
