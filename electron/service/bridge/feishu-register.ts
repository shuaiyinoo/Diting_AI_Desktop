/**
 * 飞书扫码注册服务
 *
 * 利用 @larksuiteoapi/node-sdk 的 registerApp 方法实现扫码快速创建飞书 Bot。
 * 用户通过飞书 App 扫一扫，飞书后端自动创建一个 PersonalAgent 应用，
 * 扫码完成后自动返回 App ID / App Secret，无需手动复制。
 *
 * 流程：
 * 1. 前端调用 feishuRegisterApp → 启动注册流程
 * 2. SDK 生成二维码 URL → 通过 IPC 推送给前端展示
 * 3. 用户用飞书扫码 → SDK 轮询等待确认
 * 4. 注册成功 → 返回 App ID / App Secret 给前端
 * 5. 前端自动保存配置并启动 Bot
 */

import { BrowserWindow } from 'electron'
import { logger } from 'ee-core/log'

// ===== 类型定义 =====

/** 二维码信息（推送给前端展示） */
export interface FeishuRegisterQRCode {
  /** 扫码 URL */
  url: string
  /** PNG dataURL（主进程预生成，前端直接用 <img src> 渲染） */
  dataUrl: string
  /** 有效期秒数 */
  expireIn: number
}

/** 注册流程状态变化（推送给前端显示进度） */
export interface FeishuRegisterStatus {
  status: 'polling' | 'slow_down' | 'domain_switched'
  interval?: number
}

/** 注册最终结果 */
export interface FeishuRegisterResult {
  /** 创建出的飞书应用 App ID */
  appId: string
  /** 应用 App Secret（明文，仅一次性返回） */
  appSecret: string
  /** 租户品牌（feishu / lark） */
  tenantBrand?: 'feishu' | 'lark'
  /** 扫码用户的 open_id */
  operatorOpenId?: string
}

// ===== IPC 事件通道 =====

/** 二维码已生成事件 */
export const FEISHU_REGISTER_QRCODE_CHANNEL = 'controller/bridge/feishuRegisterQrcode'
/** 注册状态变化事件 */
export const FEISHU_REGISTER_STATUS_CHANNEL = 'controller/bridge/feishuRegisterStatus'

// ===== 注册管理器 =====

/** 当前进行中的注册流程的 AbortController（同一时间只允许一个） */
let activeRegisterAbort: AbortController | null = null

/**
 * 向所有窗口推送事件
 */
function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

/**
 * 启动飞书扫码注册流程
 *
 * 调用 @larksuiteoapi/node-sdk 的 registerApp 方法，
 * 在二维码就绪时通过 IPC 推送给前端，
 * 等待用户扫码确认后返回 App ID / Secret。
 *
 * 如果已有注册流程在进行中，会先中止旧的。
 */
export async function startFeishuRegisterApp(): Promise<FeishuRegisterResult> {
  // 同一时间只允许一个注册流程
  if (activeRegisterAbort) {
    activeRegisterAbort.abort()
  }

  const abort = new AbortController()
  activeRegisterAbort = abort

  try {
    // 动态加载飞书 SDK
    const lark = await import('@larksuiteoapi/node-sdk')
    // 动态加载 qrcode 库
    const QRCode = (await import('qrcode')).default

    logger.info('[飞书扫码注册] 启动注册流程')

    const result = await (lark as unknown as {
      registerApp: (opts: {
        source: string
        signal: AbortSignal
        onQRCodeReady: (info: { url: string; expireIn: number }) => void
        onStatusChange?: (info: { status: 'polling' | 'slow_down' | 'domain_switched'; interval?: number }) => void
      }) => Promise<{
        client_id: string
        client_secret: string
        user_info?: { open_id?: string; tenant_brand?: 'feishu' | 'lark' }
      }>
    }).registerApp({
      source: 'diting',
      signal: abort.signal,
      onQRCodeReady: async (info) => {
        try {
          // 将 URL 转为 dataURL，前端可直接用 <img src> 渲染
          const dataUrl = await QRCode.toDataURL(info.url, {
            width: 280,
            margin: 2,
            errorCorrectionLevel: 'M',
          })
          const payload: FeishuRegisterQRCode = {
            url: info.url,
            dataUrl,
            expireIn: info.expireIn,
          }
          broadcast(FEISHU_REGISTER_QRCODE_CHANNEL, payload)
        } catch (err) {
          logger.error('[飞书扫码注册] QRCode 生成失败:', err)
          // 兜底：仍把 url 发过去，前端可用浏览器打开
          const payload: FeishuRegisterQRCode = {
            url: info.url,
            dataUrl: '',
            expireIn: info.expireIn,
          }
          broadcast(FEISHU_REGISTER_QRCODE_CHANNEL, payload)
        }
      },
      onStatusChange: (info) => {
        const payload: FeishuRegisterStatus = {
          status: info.status,
          interval: info.interval,
        }
        broadcast(FEISHU_REGISTER_STATUS_CHANNEL, payload)
      },
    })

    logger.info('[飞书扫码注册] 注册成功, App ID:', result.client_id)

    return {
      appId: result.client_id,
      appSecret: result.client_secret,
      tenantBrand: result.user_info?.tenant_brand,
      operatorOpenId: result.user_info?.open_id,
    }
  } finally {
    if (activeRegisterAbort === abort) {
      activeRegisterAbort = null
    }
  }
}

/**
 * 取消正在进行的飞书扫码注册流程
 */
export function cancelFeishuRegisterApp(): void {
  if (activeRegisterAbort) {
    activeRegisterAbort.abort()
    activeRegisterAbort = null
    logger.info('[飞书扫码注册] 已取消注册流程')
  }
}
