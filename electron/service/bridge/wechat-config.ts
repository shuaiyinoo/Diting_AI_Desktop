/**
 * 微信配置管理
 *
 * 基于 iLink 官方协议，扫码登录后自动获取凭证并加密保存。
 * 不再需要用户手动配置 Bot 服务地址和 Token。
 *
 * 数据持久化到 ~/.diting/bridge/wechat.json
 * 同步游标持久化到 ~/.diting/bridge/wechat-sync.json
 */

import {
  getWeChatConfigPath,
  getWeChatSyncPath,
  readJsonSafe,
  writeJsonAtomic,
  encryptSecret,
  decryptSecret,
} from './bridge-config'
import { logger } from 'ee-core/log'

// ===== 类型定义 =====

/** 微信 iLink 登录凭证（扫码登录后获得） */
export interface WeChatCredentials {
  /** Bot 认证令牌 */
  botToken: string
  /** Bot 的 iLink ID */
  ilinkBotId: string
  /** API 基础 URL（登录时返回，可能为空则用默认值） */
  baseUrl: string
  /** 用户的 iLink ID */
  ilinkUserId: string
}

/** 微信配置（持久化到 ~/.diting/bridge/wechat.json） */
export interface WeChatConfig {
  /** 是否启用微信集成 */
  enabled: boolean
  /** iLink 凭证（botToken 使用 safeStorage 加密） */
  credentials: WeChatCredentials | null
  /** 默认绑定的工作区 ID */
  defaultWorkspaceId?: string
}

/** 默认配置 */
const DEFAULT_CONFIG: WeChatConfig = {
  enabled: false,
  credentials: null,
}

// ===== 配置 CRUD =====

/** 读取微信配置 */
export function getWeChatConfig(): WeChatConfig {
  return readJsonSafe<WeChatConfig>(getWeChatConfigPath(), DEFAULT_CONFIG)
}

/** 保存微信凭证（接收明文 botToken，自动加密） */
export function saveWeChatCredentials(creds: WeChatCredentials, defaultWorkspaceId?: string): WeChatConfig {
  const config: WeChatConfig = {
    enabled: true,
    credentials: {
      botToken: encryptSecret(creds.botToken),
      ilinkBotId: creds.ilinkBotId,
      baseUrl: creds.baseUrl,
      ilinkUserId: creds.ilinkUserId,
    },
    defaultWorkspaceId,
  }
  writeJsonAtomic(getWeChatConfigPath(), config)
  logger.info('[微信配置] 凭证已保存')
  return config
}

/** 获取解密后的凭证 */
export function getDecryptedCredentials(): WeChatCredentials | null {
  const config = getWeChatConfig()
  if (!config.credentials) return null
  try {
    return {
      ...config.credentials,
      botToken: decryptSecret(config.credentials.botToken),
    }
  } catch (error) {
    logger.error('[微信配置] 解密 Bot Token 失败:', error)
    throw new Error('解密 Bot Token 失败，可能需要在当前系统重新登录')
  }
}

/** 仅更新默认工作区 ID（不修改凭证） */
export function updateWeChatDefaultWorkspace(workspaceId: string): void {
  const config = getWeChatConfig()
  writeJsonAtomic(getWeChatConfigPath(), { ...config, defaultWorkspaceId: workspaceId })
}

/** 清除微信凭证（登出） */
export function clearWeChatCredentials(): void {
  const config: WeChatConfig = { enabled: false, credentials: null }
  writeJsonAtomic(getWeChatConfigPath(), config)
  logger.info('[微信配置] 凭证已清除')
}

// ===== 同步游标 =====

/** 微信同步游标 */
export interface WeChatSyncState {
  /** iLink getUpdates 游标 */
  getUpdatesBuf: string
  /** 上次同步时间戳 */
  lastSyncAt: number | null
}

/** 读取同步游标 */
export function getWeChatSyncState(): WeChatSyncState {
  return readJsonSafe<WeChatSyncState>(getWeChatSyncPath(), {
    getUpdatesBuf: '',
    lastSyncAt: null,
  })
}

/** 保存同步游标 */
export function saveWeChatSyncState(state: WeChatSyncState): void {
  writeJsonAtomic(getWeChatSyncPath(), state)
}
