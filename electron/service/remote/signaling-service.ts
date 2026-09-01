/**
 * 远程控制信令服务（Electron 主进程）
 *
 * 职责：
 *   1. 与后端 /ws/desktop 建立 STOMP 连接（受控端身份）
 *   2. 申请 / 释放会话码（走 HTTP，复用 cloud-api 的鉴权）
 *   3. 收发 WebRTC 信令，并转交给隐藏窗口中的 PeerConnection
 *
 * ⚠️ 本服务只负责【信令】，不负责采集与编码 ——
 *    desktopCapturer / RTCPeerConnection 只能在渲染进程中工作，
 *    由 session-window.ts 管理的隐藏窗口承担。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir, hostname, platform } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { logger } from 'ee-core/log'
import { authedGet, authedPost, getAccessToken, getCloudBaseUrl, getCurrentUser } from '../cloud-api'
import { StompClient } from './stomp-client'
import { remoteSessionWindow } from './session-window'

// sync-service 与 signaling-service 存在循环引用（sync 依赖 signaling 的 STOMP 连接，
// signaling 需要在连接成功后触发 sync 订阅），用懒加载 require 打破循环。
// Node 的 require 缓存机制保证最终拿到的是同一个模块实例。
function getSyncService() {
  return require('./sync-service').remoteSyncService as {
    startSync(): void
    resetSubscribed(): void
  }
}

// stream-sync-service 同样复用 signaling 的 STOMP 连接，懒加载打破循环引用。
function getStreamSyncService() {
  return require('./stream-sync-service').streamSyncService as {
    start(): void
    resetSubscribed(): void
  }
}

/** 连接状态，前端据此渲染指示灯 */
export type RemoteConnState = 'disconnected' | 'connecting' | 'connected' | 'error'

/** 信令消息体（与后端 SignalMessage 对齐） */
export interface RemoteSignal {
  type: 'join' | 'offer' | 'answer' | 'candidate' | 'leave' | 'displays' | 'terminated'
  sessionCode?: string
  role?: string
  sdp?: unknown
  candidate?: unknown
  displays?: unknown
  restart?: boolean
  deviceId?: string
  reason?: string
}

/**
 * ICE 服务器配置
 *
 * 主进程的 TS 配置里 lib 不含 DOM，拿不到浏览器自带的 RTCIceServer 类型，
 * 这里自给自足地声明一份（字段与 WebRTC 规范一致）。
 */
export interface IceServerConfig {
  urls: string | string[]
  username?: string
  credential?: string
}

export interface StatusSnapshot {
  connState: RemoteConnState
  /** 当前会话码，未开启时为 null */
  sessionCode: string | null
  /** 控制端是否已接入 */
  peerJoined: boolean
  /** 最近一次错误描述 */
  lastError: string | null
  /** 服务端地址 */
  baseUrl: string
}

const APP_DEST = '/app/signal'
const topicOf = (code: string) => `/topic/session/desktop/${code}`

class RemoteSignalingService {
  private client: StompClient | null = null
  private connState: RemoteConnState = 'disconnected'
  private sessionCode: string | null = null
  private peerJoined = false
  private lastError: string | null = null
  /** 隐藏窗口捕获是否已拉起（避免重复 startCapture 导致 PeerConnection 重建） */
  private captureStarted = false

  /** 状态变化回调（推给前端） */
  onStatusChange: ((s: StatusSnapshot) => void) | null = null
  /** 收到信令回调（转交给隐藏窗口） */
  onSignal: ((msg: RemoteSignal) => void) | null = null

  /* ══════════════════ 连接 ══════════════════ */

  /** 建立 WebSocket 连接；未登录时直接抛错 */
  connect(): void {
    const token = getAccessToken()
    if (!token) {
      throw new Error('未登录，无法连接远程服务')
    }
    if (this.client) {
      return
    }

    const baseUrl = getCloudBaseUrl()
    // http → ws，https → wss（^http 匹配后，https 末尾的 s 自然保留为 wss）
    // getCloudBaseUrl() 包含 /apic 前缀，WebSocket 端点同样挂在 servlet context-path 下，
    // 最终 URL 形如 wss://cloud.ditingrag.com/apic/ws/desktop
    const wsBase = baseUrl.replace(/^http/, 'ws')
    const url = `${wsBase}/ws/desktop`

    this.setConnState('connecting')
    logger.info('[remote] 连接信令服务:', url)

    this.client = new StompClient({
      url,
      // 令牌放 STOMP CONNECT 帧头部（服务端从 nativeHeader 读取）
      connectHeaders: { Authorization: `Bearer ${token}`, deviceId: getDeviceId() },
      // 客户端主动发心跳（10s 一次），让 Jetty 不判定连接空闲
      heartbeatOutgoing: 10_000,
      // 不要求服务端发心跳。Spring SimpleBroker 的服务端心跳在实际中
      // 常因 TaskScheduler 未正确初始化而发不出来，导致客户端误判超时重连。
      // 连接断开由 WebSocket close 事件 + 客户端发心跳时的 send 异常来检测。
      heartbeatIncoming: 0,
      reconnectDelay: 3_000,
    })

    this.client.onStateChange = (connected) => {
      if (connected) {
        this.setConnState('connected')
        // 订阅设备专属唤醒通道（无人值守）：任何时刻都订阅，
        // 即使尚未开镜像也能被控制端按 deviceId 定位并唤醒。
        this.subscribeDeviceWake()
        // 订阅 sync 请求 topic，处理 Mobile 发来的数据同步请求
        getSyncService().startSync()
        // 订阅 stream-sync 请求 topic，处理 Mobile 发来的代发消息请求
        getStreamSyncService().start()
        // 已开启镜像时，重连后自动回到房间
        if (this.sessionCode) {
          this.subscribeRoom(this.sessionCode)
          this.publish({ type: 'join', role: 'desktop', deviceId: getDeviceId() })
        }
      } else {
        this.setConnState('connecting')
        this.peerJoined = false
        // 重置 sync 订阅状态，重连后会重新订阅
        getSyncService().resetSubscribed()
        // 重置 stream-sync 订阅状态
        getStreamSyncService().resetSubscribed()
      }
      this.emitStatus()
    }

    this.client.connect()
  }

  disconnect(): void {
    if (this.sessionCode) {
      try {
        this.publish({ type: 'leave', sessionCode: this.sessionCode })
      } catch {
        /* 连接已断开时忽略 */
      }
    }
    this.client?.disconnect()
    this.client = null
    this.sessionCode = null
    this.peerJoined = false
    this.captureStarted = false
    this.setConnState('disconnected')
    this.emitStatus()
  }

  get connected(): boolean {
    return this.connState === 'connected'
  }

  /** 获取当前用户 ID（供 sync-service 使用） */
  getCurrentUserId(): number | null {
    const user = getCurrentUser()
    return user?.userId ?? null
  }

  /** 订阅任意 topic（供 sync-service 使用） */
  subscribeToTopic(topic: string, handler: (body: string) => void): void {
    this.client?.subscribe(topic, handler)
  }

  /** 发送消息到任意 /app 目的地（供 sync-service 使用） */
  publishToApp(destination: string, payload: unknown): void {
    if (!this.client || !this.connected) {
      logger.warn('[remote] 信令未连接，丢弃:', destination)
      return
    }
    this.client.send(destination, payload)
  }

  /* ══════════════════ 会话码 ══════════════════ */

  /**
   * 申请会话码并加入房间
   * @returns 6 位会话码
   */
  async startMirroring(): Promise<string> {
    if (!this.client || !this.connected) {
      throw new Error('信令服务未连接')
    }

    // 先向后端申请会话码（HTTP）
    const code = await authedPost<string>('/cloud/remote/session/code', {
      deviceId: getDeviceId(),
      deviceName: hostname(),
      platform: platformName(),
    })
    if (!code) {
      throw new Error('申请会话码失败：服务端未返回')
    }

    this.sessionCode = code
    this.subscribeRoom(code)
    // 加入房间；服务端会把 join 转发给控制端，由控制端发起连接
    this.publish({ type: 'join', role: 'desktop', deviceId: getDeviceId() })
    this.emitStatus()
    logger.info('[remote] 已开启远程镜像，会话码:', code)
    return code
  }

  /** 停止镜像：释放会话码并离开房间 */
  async stopMirroring(): Promise<void> {
    const code = this.sessionCode
    if (!code) return

    try {
      this.publish({ type: 'leave', sessionCode: code })
      this.client?.unsubscribe(topicOf(code))
    } catch {
      /* 忽略 */
    }
    this.sessionCode = null
    this.peerJoined = false
    this.captureStarted = false

    // 停掉隐藏窗口的屏幕采集（PeerConnection 随之 teardown），释放采集资源，
    // 否则窗口会一直空推，且下次唤醒会复用已死的连接导致连不上。
    try {
      await remoteSessionWindow.stopCapture()
    } catch (err) {
      logger.warn('[remote] 停止采集失败:', err)
    }

    try {
      await authedPost<void>('/cloud/remote/session/revoke', { code })
    } catch (err) {
      logger.warn('[remote] 释放会话码失败:', err)
    }
    this.emitStatus()
    logger.info('[remote] 已关闭远程镜像')
  }

  /* ══════════════════ 信令 ══════════════════ */

  /** 发送信令（由隐藏窗口调用） */
  publish(msg: RemoteSignal): void {
    const code = msg.sessionCode ?? this.sessionCode
    if (!code) {
      logger.warn('[remote] 无会话码，丢弃信令:', msg.type)
      return
    }
    this.client?.send(APP_DEST, { ...msg, sessionCode: code, role: 'desktop' })
  }

  private subscribeRoom(code: string): void {
    this.client?.subscribe(topicOf(code), (body) => {
      try {
        const msg = JSON.parse(body) as RemoteSignal
        // 控制端加入 / 离开
        if (msg.type === 'join') {
          this.peerJoined = true
          this.emitStatus()
        } else if (msg.type === 'leave' || msg.type === 'terminated') {
          this.peerJoined = false
          this.emitStatus()
          // 控制端断开：释放远程镜像与通道，否则下次唤醒会复用已死连接 / 占用中的码，导致连不上。
          // 延后到下一 tick 执行，避免在当前信令回调里直接 unsubscribe 自身订阅。
          if (this.sessionCode) {
            setTimeout(() => { void this.stopMirroring().catch(() => {}) }, 0)
          }
        }
        this.onSignal?.(msg)
      } catch (err) {
        logger.error('[remote] 解析信令失败:', err)
      }
    })
  }

  /* ══════════════════ 无人值守唤醒 ══════════════════ */

  /**
   * 订阅本机专属唤醒通道 /topic/remote/device/{deviceId}。
   * 控制端点击设备列表时，后端会把唤醒指令转发到这里，
   * 桌面据此自动开镜像并把 6 位会话码回传给控制端，无需人工操作。
   */
  private subscribeDeviceWake(): void {
    const deviceId = getDeviceId()
    this.client?.subscribe(`/topic/remote/device/${deviceId}`, (body) => {
      try {
        const msg = JSON.parse(body) as { type?: string; requestId?: string; deviceId?: string }
        if (msg.type === 'wake' && msg.requestId) {
          void this.handleWake(msg.requestId, msg.deviceId ?? deviceId)
        }
      } catch (err) {
        logger.error('[remote] 解析唤醒消息失败:', err)
      }
    })
  }

  /** 处理唤醒：已开镜像则复用现有码，否则自动开镜像，最终把码回传给控制端 */
  private async handleWake(requestId: string, deviceId: string): Promise<void> {
    try {
      let code = this.sessionCode
      // 全新开镜像才需要拉起捕获；复用已有会话码时捕获通常已在跑
      const needStartCapture = !code
      if (needStartCapture) {
        // 自动开镜像：生成 6 位码 + 订阅房间 + 加入（与手动开镜像完全一致）
        code = await this.startMirroring()
      }
      // ⚠️ 关键：无人值守唤醒必须真正拉起隐藏窗口的捕获/推流，
      //    否则 PeerConnection 不会被创建、控制端 join 会被隐藏窗口直接丢弃，
      //    表现为「桌面出了码、手机也跳过去了，但没画面、也没有任何信令」。
      //    与手动开镜像（controller/remote.ts）完全一致地处理。
      if (needStartCapture || !this.captureStarted) {
        const iceServers = await this.fetchIceServers()
        await remoteSessionWindow.startCapture(undefined, iceServers)
        this.captureStarted = true
      }
      this.sendApp('/app/remote/wake-result', { requestId, deviceId, code })
      logger.info('[remote] 已响应唤醒，会话码:', code)
    } catch (err) {
      logger.error('[remote] 唤醒失败:', err)
      this.sendApp('/app/remote/wake-result', { requestId, deviceId, error: 'MIRROR_FAILED' })
    }
  }

  /** 发送任意 /app 目的地消息（唤醒回传等控制信令之外的用途） */
  private sendApp(destination: string, payload: unknown): void {
    if (!this.client || !this.connected) {
      logger.warn('[remote] 信令未连接，丢弃:', destination)
      return
    }
    this.client.send(destination, payload)
  }

  /* ══════════════════ ICE 服务器 ══════════════════ */

  /**
   * 向后端申请 STUN / TURN 配置。
   *
   * TURN 凭证短期有效（默认 600s），每次开镜像都要重新申请，不能缓存复用。
   *
   * 顺序有讲究：STUN 先、TURN 后。STUN 无需凭证，且是内网连通的关键 ——
   * 浏览器默认用 mDNS(xxx.local) 隐藏本机 IP，两端都只有 mDNS 候选时无法配对，
   * 有了 STUN 才能拿到真实 IP。
   */
  async fetchIceServers(): Promise<IceServerConfig[]> {
    const servers: IceServerConfig[] = []
    try {
      const cred = await authedGet<{
        username: string
        credential: string
        urls: string[]
        stunUrls: string[]
      }>('/cloud/remote/turn/credentials')

      if (cred?.stunUrls?.length) {
        servers.push({ urls: cred.stunUrls })
      }
      if (cred?.urls?.length) {
        servers.push({
          urls: cred.urls,
          username: cred.username,
          credential: cred.credential,
        })
      }
    } catch (err) {
      logger.warn('[remote] 获取 ICE 配置失败，将仅使用本机候选:', err)
    }
    logger.info(`[remote] ICE 服务器: ${servers.length} 组`)
    return servers
  }

  /* ══════════════════ 状态 ══════════════════ */

  getStatus(): StatusSnapshot {
    return {
      connState: this.connState,
      sessionCode: this.sessionCode,
      peerJoined: this.peerJoined,
      lastError: this.lastError,
      baseUrl: getCloudBaseUrl(),
    }
  }

  private setConnState(s: RemoteConnState): void {
    this.connState = s
  }

  setError(msg: string | null): void {
    this.lastError = msg
    this.emitStatus()
  }

  private emitStatus(): void {
    this.onStatusChange?.(this.getStatus())
  }
}

/* ══════════════════════════════════════════════════════════════
   设备标识
   ══════════════════════════════════════════════════════════════ */

let cachedDeviceId: string | null = null

function getDeviceDir(): string {
  const dir = join(homedir(), '.diting', 'cloud')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * 获取本机唯一设备标识。
 * 首次调用时生成并持久化到 ~/.diting/cloud/device.json，
 * 保证重启后不变 —— 后端据此区分同一账号下的多台设备。
 */
export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId

  const file = join(getDeviceDir(), 'device.json')
  try {
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as { deviceId?: string }
      if (parsed.deviceId) {
        cachedDeviceId = parsed.deviceId
        return cachedDeviceId
      }
    }
  } catch (err) {
    logger.warn('[remote] 读取设备标识失败，将重新生成:', err)
  }

  cachedDeviceId = randomUUID()
  try {
    writeFileSync(file, JSON.stringify({ deviceId: cachedDeviceId }, null, 2), 'utf8')
  } catch (err) {
    logger.warn('[remote] 持久化设备标识失败:', err)
  }
  return cachedDeviceId
}

/** Electron 平台名 → 后端约定值 */
export function platformName(): 'windows' | 'macos' | 'linux' {
  switch (platform()) {
    case 'darwin':
      return 'macos'
    case 'win32':
      return 'windows'
    default:
      return 'linux'
  }
}

export const remoteSignaling = new RemoteSignalingService()
