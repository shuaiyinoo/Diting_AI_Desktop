/**
 * Bridge 通用配置管理
 *
 * 提供三个平台（飞书/微信/钉钉）共享的：
 * - 配置目录路径管理
 * - safeStorage 加密/解密工具
 * - 安全 JSON 读写
 */

import { safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { logger } from 'ee-core/log'

/** 配置根目录 ~/.diting/bridge/ */
export function getBridgeDir(): string {
  const dir = join(homedir(), '.diting', 'bridge')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** 配置文件路径 */
export function getFeishuConfigPath(): string {
  return join(getBridgeDir(), 'feishu.json')
}

export function getWeChatConfigPath(): string {
  return join(getBridgeDir(), 'wechat.json')
}

export function getDingTalkConfigPath(): string {
  return join(getBridgeDir(), 'dingtalk.json')
}

/** 绑定目录 */
export function getBridgeBindingsDir(): string {
  const dir = join(getBridgeDir(), 'bindings')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** 微信同步游标文件 */
export function getWeChatSyncPath(): string {
  return join(getBridgeDir(), 'wechat-sync.json')
}

// ===== 加密/解密 =====

/** 使用 safeStorage 加密字符串 */
export function encryptSecret(plainToken: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    logger.warn('[Bridge 配置] safeStorage 加密不可用，以明文存储')
    return plainToken
  }
  return safeStorage.encryptString(plainToken).toString('base64')
}

/** 使用 safeStorage 解密字符串 */
export function decryptSecret(encryptedToken: string): string {
  if (!encryptedToken) return ''
  if (!safeStorage.isEncryptionAvailable()) return encryptedToken
  try {
    return safeStorage.decryptString(Buffer.from(encryptedToken, 'base64'))
  } catch (error) {
    logger.error('[Bridge 配置] 解密失败:', error)
    throw new Error('解密密钥失败，可能需要在当前系统重新登录')
  }
}

// ===== 安全 JSON 读写 =====

/** 安全读取 JSON 文件 */
export function readJsonSafe<T>(filePath: string, defaultValue: T): T {
  if (!existsSync(filePath)) return defaultValue
  try {
    const raw = readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as T
  } catch (error) {
    logger.warn(`[Bridge 配置] 读取 JSON 失败 (${filePath}):`, error)
    return defaultValue
  }
}

/** 原子写入 JSON 文件 */
export function writeJsonAtomic(filePath: string, data: unknown): void {
  const content = JSON.stringify(data, null, 2)
  // 先写入 .tmp 文件再重命名，实现原子写入
  const tmpPath = filePath + '.tmp'
  writeFileSync(tmpPath, content, 'utf-8')
  // 在 Windows 上 rename 到已存在文件会失败，先删除再重命名
  if (existsSync(filePath)) {
    try {
      require('fs').unlinkSync(filePath)
    } catch {
      // 忽略
    }
  }
  require('fs').renameSync(tmpPath, filePath)
}

// ===== 日志脱敏 =====

/** 脱敏日志文本中的敏感信息 */
export function redactSensitiveLogText(text: string): string {
  if (!text) return text
  // 脱敏 bot_token / appSecret / clientSecret 等
  return text
    .replace(/bot_token[=:}\s]+"?[\w-]{10,}"?/gi, 'bot_token=***')
    .replace(/appSecret[=:}\s]+"?[\w-]{10,}"?/gi, 'appSecret=***')
    .replace(/clientSecret[=:}\s]+"?[\w-]{10,}"?/gi, 'clientSecret=***')
    .replace(/Bearer\s+[\w-]{10,}/gi, 'Bearer ***')
}

/** 脱敏日志中的对象值 */
export function redactSensitiveLogValue(value: unknown): string {
  if (value instanceof Error) {
    return redactSensitiveLogText(value.message)
  }
  try {
    const str = JSON.stringify(value)
    return redactSensitiveLogText(str)
  } catch {
    return String(value)
  }
}
