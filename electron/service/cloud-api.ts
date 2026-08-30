/**
 * Cloud 后端 API Service
 *
 * 封装与 Diting_AI_Cloud 后端的 HTTP 通信。
 * Token 使用 safeStorage 加密存储到 ~/.diting/cloud/auth.json
 * 所有请求由 Electron 主进程发起，前端不直接调用后端接口。
 */

import { safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { logger } from 'ee-core/log'
import { getConfig } from 'ee-core/config'

// ===== 配置目录 =====

/** 配置根目录 ~/.diting/cloud/ */
function getCloudDir(): string {
  const dir = join(homedir(), '.diting', 'cloud')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** 认证信息文件路径 */
function getAuthFilePath(): string {
  return join(getCloudDir(), 'auth.json')
}

// ===== 加密/解密 =====

function encryptSecret(plain: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    logger.warn('[CloudAPI] safeStorage 加密不可用，以明文存储')
    return plain
  }
  return safeStorage.encryptString(plain).toString('base64')
}

function decryptSecret(encrypted: string): string {
  if (!encrypted) return ''
  if (!safeStorage.isEncryptionAvailable()) return encrypted
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  } catch (err) {
    logger.error('[CloudAPI] 解密失败:', err)
    throw new Error('解密 Token 失败，可能需要重新登录')
  }
}

// ===== 认证状态持久化 =====

interface StoredAuth {
  /** 加密后的 access_token */
  encryptedToken: string
  /** 令牌过期时间戳（毫秒） */
  expireAt: number
  /** 用户 ID */
  userId: number
  /** 用户名 */
  username: string
  /** 昵称 */
  nickname: string
  /** 邮箱 */
  email: string
  /** 团队 ID */
  teamId: number | null
  /** 团队名称 */
  teamName: string | null
}

const DEFAULT_AUTH: StoredAuth | null = null

let cachedAuth: StoredAuth | null = null
let authLoaded = false

/** 从磁盘加载认证信息 */
function loadAuth(): StoredAuth | null {
  if (authLoaded) return cachedAuth
  authLoaded = true
  const filePath = getAuthFilePath()
  if (!existsSync(filePath)) return null
  try {
    const raw = readFileSync(filePath, 'utf-8')
    cachedAuth = JSON.parse(raw) as StoredAuth
    return cachedAuth
  } catch (err) {
    logger.warn('[CloudAPI] 读取认证文件失败:', err)
    return null
  }
}

/** 保存认证信息到磁盘 */
function saveAuth(auth: StoredAuth): void {
  cachedAuth = auth
  authLoaded = true
  const filePath = getAuthFilePath()
  const content = JSON.stringify(auth, null, 2)
  const tmpPath = filePath + '.tmp'
  const { writeFileSync, renameSync, unlinkSync } = require('fs')
  writeFileSync(tmpPath, content, 'utf-8')
  if (existsSync(filePath)) {
    try { unlinkSync(filePath) } catch { /* 忽略 */ }
  }
  renameSync(tmpPath, filePath)
}

/** 清除认证信息 */
function clearAuth(): void {
  cachedAuth = null
  authLoaded = true
  const filePath = getAuthFilePath()
  if (existsSync(filePath)) {
    try { require('fs').unlinkSync(filePath) } catch { /* 忽略 */ }
  }
}

// ===== Token 管理 =====

/** 获取当前有效的 Token（明文），过期或不存在则返回 null */
export function getAccessToken(): string | null {
  const auth = loadAuth()
  if (!auth) return null
  if (auth.expireAt > 0 && Date.now() > auth.expireAt) {
    logger.info('[CloudAPI] Token 已过期')
    return null
  }
  return decryptSecret(auth.encryptedToken)
}

/** 获取当前用户信息 */
export function getCurrentUser(): { userId: number; username: string; nickname: string; email: string; teamId: number | null } | null {
  const auth = loadAuth()
  if (!auth) return null
  return {
    userId: auth.userId,
    username: auth.username,
    nickname: auth.nickname,
    email: auth.email,
    teamId: auth.teamId,
  }
}

/** 检查是否已登录 */
export function isLoggedIn(): boolean {
  return getAccessToken() !== null
}

// ===== 后端地址配置 =====

/**
 * Cloud 后端地址（优先级：环境变量 > 配置文件 > 默认值）
 *
 * 导出以便 WebSocket 等服务复用同一套地址解析逻辑，
 * 避免出现「HTTP 走配置、WS 走硬编码」的地址不一致问题。
 */
export function getCloudBaseUrl(): string {
  // 1. 环境变量最高优先级
  const envUrl = process.env.DITING_CLOUD_URL
  if (envUrl) return envUrl.replace(/\/+$/, '')
  // 2. 从 ee-core 配置文件读取（config.default.ts -> cloud.baseUrl）
  try {
    const config = getConfig() as Record<string, any>
    const configUrl = config?.cloud?.baseUrl
    if (configUrl) return configUrl.replace(/\/+$/, '')
  } catch {
    // 配置读取失败，回退默认值
  }
  // 3. 默认地址
  return 'http://127.0.0.1:9527'
}

// ===== HTTP 请求封装 =====

interface CloudResponse<T> {
  code: number
  msg: string
  data: T
}

/** 发起 fetch 请求 */
async function cloudFetch<T>(path: string, options: {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  withAuth?: boolean
} = {}): Promise<T> {
  const { method = 'GET', body, withAuth = false } = options
  const url = getCloudBaseUrl() + path

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (withAuth) {
    const token = getAccessToken()
    if (!token) {
      throw new Error('未登录或登录已过期')
    }
    headers['Authorization'] = `Bearer ${token}`
    // 必须携带 clientid header，与 Token 中的扩展信息一致
    // 否则 SecurityConfig 校验会抛 NPE
    headers['clientid'] = 'desktop'
  }

  const fetchOptions: RequestInit = { method, headers }
  if (body !== undefined) {
    fetchOptions.body = JSON.stringify(body)
  }

  let response: Response
  try {
    response = await fetch(url, fetchOptions)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`无法连接到服务器: ${msg}`)
  }

  if (!response.ok) {
    let errText: string
    try {
      errText = await response.text()
    } catch {
      errText = response.statusText
    }
    throw new Error(`HTTP ${response.status}: ${errText.substring(0, 500)}`)
  }

  const result = await response.json() as CloudResponse<T>
  if (result.code !== 200) {
    throw new Error(result.msg || `服务返回错误码: ${result.code}`)
  }

  return result.data
}

// ===== 认证 API =====

interface RegisterParams {
  username: string
  email: string
  password: string
}

interface LoginParams {
  email: string
  password: string
}

interface AuthResult {
  access_token: string
  expire_in: number
  user_id: number
  username: string
  nickname: string
  email: string
  team_id: number | null
  team_name: string | null
}

/** 注册（不自动登录，不保存 Token） */
export async function register(params: RegisterParams): Promise<AuthResult> {
  const data = await cloudFetch<AuthResult>('/cloud/desktop/auth/register', {
    method: 'POST',
    body: params,
  })
  // 注册成功不保存认证信息，由用户手动登录
  logger.info(`[CloudAPI] 注册成功: userId=${data.user_id}, username=${data.username}`)
  return data
}

/** 登录 */
export async function login(params: LoginParams): Promise<AuthResult> {
  const data = await cloudFetch<AuthResult>('/cloud/desktop/auth/login', {
    method: 'POST',
    body: params,
  })
  // 保存认证信息
  saveAuth({
    encryptedToken: encryptSecret(data.access_token),
    expireAt: data.expire_in > 0 ? Date.now() + data.expire_in * 1000 : 0,
    userId: data.user_id,
    username: data.username,
    nickname: data.nickname,
    email: data.email,
    teamId: data.team_id,
    teamName: data.team_name,
  })
  logger.info(`[CloudAPI] 登录成功: userId=${data.user_id}, username=${data.username}`)
  return data
}

/** 退出登录 */
export function logout(): void {
  clearAuth()
  logger.info('[CloudAPI] 已退出登录')
}

// ===== 通用鉴权请求 =====

/** 发起需要鉴权的 GET 请求 */
export async function authedGet<T>(path: string): Promise<T> {
  return cloudFetch<T>(path, { method: 'GET', withAuth: true })
}

/** 发起需要鉴权的 POST 请求 */
export async function authedPost<T>(path: string, body?: unknown): Promise<T> {
  return cloudFetch<T>(path, { method: 'POST', body, withAuth: true })
}

/** 发起需要鉴权的 PUT 请求 */
export async function authedPut<T>(path: string, body?: unknown): Promise<T> {
  return cloudFetch<T>(path, { method: 'PUT', body, withAuth: true })
}

/** 发起需要鉴权的 DELETE 请求 */
export async function authedDelete<T>(path: string): Promise<T> {
  return cloudFetch<T>(path, { method: 'DELETE', withAuth: true })
}
