/**
 * 飞书配置管理
 *
 * 管理飞书多 Bot 配置的持久化存储。
 * App Secret 使用 Electron safeStorage 加密。
 * 数据持久化到 ~/.diting/bridge/feishu.json
 */

import { randomUUID } from 'crypto'
import {
  getFeishuConfigPath,
  readJsonSafe,
  writeJsonAtomic,
  encryptSecret,
  decryptSecret,
} from './bridge-config'
import { getBridgeBindingsDir } from './bridge-config'

// ===== 类型定义 =====

/** 单个飞书 Bot 配置 */
export interface FeishuBotConfig {
  id: string
  name: string
  enabled: boolean
  appId: string
  appSecret: string  // safeStorage 加密后的 base64
  defaultWorkspaceId?: string
  defaultChannelId?: string
  defaultModelId?: string
}

/** 多 Bot 配置文件 */
export interface FeishuMultiBotConfig {
  version: 2
  bots: FeishuBotConfig[]
}

/** Bot 配置保存输入（明文 secret） */
export interface FeishuBotConfigInput {
  id?: string
  name: string
  enabled: boolean
  appId: string
  appSecret: string  // 明文，空字符串表示不修改
  defaultWorkspaceId?: string
  defaultChannelId?: string
  defaultModelId?: string
}

// ===== 默认配置 =====

const DEFAULT_CONFIG: FeishuMultiBotConfig = {
  version: 2,
  bots: [],
}

// ===== 配置 CRUD =====

/** 读取飞书多 Bot 配置 */
export function getFeishuMultiBotConfig(): FeishuMultiBotConfig {
  return readJsonSafe<FeishuMultiBotConfig>(getFeishuConfigPath(), DEFAULT_CONFIG)
}

/** 读取单个 Bot 配置 */
export function getFeishuBotById(botId: string): FeishuBotConfig | undefined {
  return getFeishuMultiBotConfig().bots.find((b) => b.id === botId)
}

/** 保存/更新 Bot 配置（接收明文 appSecret，自动加密） */
export function saveFeishuBotConfig(input: FeishuBotConfigInput): FeishuBotConfig {
  const config = getFeishuMultiBotConfig()

  let bot: FeishuBotConfig
  if (input.id) {
    // 更新
    const idx = config.bots.findIndex((b) => b.id === input.id)
    if (idx === -1) throw new Error(`Bot ${input.id} 不存在`)
    bot = config.bots[idx]!
    bot.name = input.name
    bot.enabled = input.enabled
    bot.appId = input.appId
    if (input.appSecret) {
      bot.appSecret = encryptSecret(input.appSecret)
    }
    bot.defaultWorkspaceId = input.defaultWorkspaceId
    bot.defaultChannelId = input.defaultChannelId
    bot.defaultModelId = input.defaultModelId
  } else {
    // 新建
    bot = {
      id: randomUUID(),
      name: input.name,
      enabled: input.enabled,
      appId: input.appId,
      appSecret: input.appSecret ? encryptSecret(input.appSecret) : '',
      defaultWorkspaceId: input.defaultWorkspaceId,
      defaultChannelId: input.defaultChannelId,
      defaultModelId: input.defaultModelId,
    }
    config.bots.push(bot)
  }

  writeJsonAtomic(getFeishuConfigPath(), config)
  return bot
}

/** 删除 Bot */
export function removeFeishuBot(botId: string): boolean {
  const config = getFeishuMultiBotConfig()
  const idx = config.bots.findIndex((b) => b.id === botId)
  if (idx === -1) return false
  config.bots.splice(idx, 1)
  writeJsonAtomic(getFeishuConfigPath(), config)
  return true
}

/** 解密获取 App Secret */
export function getDecryptedBotAppSecret(botId: string): string {
  const bot = getFeishuBotById(botId)
  if (!bot) throw new Error(`Bot ${botId} 不存在`)
  return decryptSecret(bot.appSecret)
}

/** 获取飞书 Bot 绑定文件路径 */
export function getFeishuBotBindingsPath(botId: string): string {
  return `${getBridgeBindingsDir()}/feishu-bindings-${botId}.json`
}
