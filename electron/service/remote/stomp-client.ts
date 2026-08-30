/**
 * 精简 STOMP over WebSocket 客户端（主进程用）
 *
 * 为什么不用 @stomp/stompjs：
 *   该库面向浏览器，在 Electron 主进程（Node 侧）需要额外适配 WebSocket 实现，
 *   而这里只需要 CONNECT / SUBSCRIBE / SEND / MESSAGE / 心跳 五种能力，
 *   手写约 200 行即可覆盖，完全没有外部依赖，行为更可控。
 *
 * STOMP 帧结构：
 *   COMMAND\n
 *   header-key:header-value\n
 *   \n
 *   body^@
 */

import WebSocket from 'ws'
import { logger } from 'ee-core/log'

const NULL_BYTE = '\u0000'

export interface StompFrame {
  command: string
  headers: Record<string, string>
  body: string
}

export interface StompClientOptions {
  /** ws:// 或 wss:// 地址 */
  url: string
  /**
   * STOMP CONNECT 帧的头部。
   * ⚠️ 鉴权令牌必须放这里 —— Spring 的 StompHeaderAccessor.getFirstNativeHeader()
   * 读的是 STOMP 帧自身的头部，不是 WebSocket 握手的 HTTP 头。
   */
  connectHeaders?: Record<string, string>
  /** WebSocket 握手阶段的 HTTP 头（一般无需设置） */
  handshakeHeaders?: Record<string, string>
  /** 客户端发送心跳间隔（毫秒），0 表示不发送 */
  heartbeatOutgoing?: number
  /** 期望服务端心跳间隔（毫秒），0 表示不要求 */
  heartbeatIncoming?: number
  /** 自动重连间隔（毫秒），0 表示不重连 */
  reconnectDelay?: number
}

type MessageHandler = (body: string, frame: StompFrame) => void
type StateHandler = (connected: boolean) => void

export class StompClient {
  private ws: WebSocket | null = null
  private options: Required<StompClientOptions>

  private heartbeatTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private incomingTimer: NodeJS.Timeout | null = null

  private buffer = ''
  private subscriptions = new Map<string, MessageHandler>()
  private pendingSubscription: { destination: string; handler: MessageHandler } | null = null

  private _connected = false
  /** 主动关闭标志：为 true 时不再自动重连 */
  private disposed = false

  /** 协商后的客户端心跳发送间隔（毫秒），0 表示不发送 */
  private negotiatedOutgoing = 0
  /** 协商后的服务端心跳发送间隔（毫秒），0 表示服务端不发心跳 */
  private negotiatedIncoming = 0

  onStateChange: StateHandler | null = null

  constructor(options: StompClientOptions) {
    this.options = {
      connectHeaders: {},
      handshakeHeaders: {},
      heartbeatOutgoing: 10_000,
      heartbeatIncoming: 10_000,
      reconnectDelay: 3_000,
      ...options,
    }
  }

  get connected(): boolean {
    return this._connected
  }

  /* ══════════════════ 连接 ══════════════════ */

  connect(): void {
    this.disposed = false
    this.doConnect()
  }

  private doConnect(): void {
    if (this.disposed) return

    let ws: WebSocket
    try {
      ws = new WebSocket(this.options.url, {
        headers: this.options.handshakeHeaders,
      })
    } catch (err) {
      this.scheduleReconnect()
      return
    }
    this.ws = ws

    ws.on('open', () => {
      // WebSocket 建连后立刻发 STOMP CONNECT 帧；
      // 令牌在此帧的头部中携带（服务端从 nativeHeader 读取）
      const headers: Record<string, string> = {
        'accept-version': '1.2',
        'heart-beat': `${this.options.heartbeatOutgoing},${this.options.heartbeatIncoming}`,
        ...this.options.connectHeaders,
      }
      this.sendFrame('CONNECT', headers, '')
    })

    ws.on('message', (data: WebSocket.RawData) => {
      this.buffer += data.toString('utf8')
      this.parseBuffer()
    })

    ws.on('close', () => {
      this.setConnected(false)
      this.stopHeartbeat()
      this.scheduleReconnect()
    })

    ws.on('error', () => {
      // 错误交给 close 统一处理，避免重复触发重连
    })
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer) return
    if (this.options.reconnectDelay <= 0) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.doConnect()
    }, this.options.reconnectDelay)
  }

  /** 断开并释放资源；调用后不再自动重连 */
  disconnect(): void {
    this.disposed = true
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.incomingTimer) {
      clearTimeout(this.incomingTimer)
      this.incomingTimer = null
    }
    if (this.ws) {
      // 先移除监听，避免 close 回调再次触发重连
      this.ws.removeAllListeners()
      try {
        this.ws.close()
      } catch {
        /* 忽略已关闭的连接 */
      }
      this.ws = null
    }
    this.setConnected(false)
  }

  /* ══════════════════ 帧收发 ══════════════════ */

  private sendFrame(command: string, headers: Record<string, string>, body: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return

    let frame = command + '\n'
    for (const [k, v] of Object.entries(headers)) {
      frame += `${this.escapeHeader(k)}:${this.escapeHeader(String(v))}\n`
    }
    frame += '\n' + body + NULL_BYTE

    try {
      this.ws.send(frame)
    } catch {
      /* 发送失败由 close 事件兜底 */
    }
  }

  /**
   * STOMP 1.2 要求对头中的 \r \n \ 和 : 做转义
   */
  private escapeHeader(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n')
      .replace(/:/g, '\\c')
  }

  private parseBuffer(): void {
    // 帧以 NULL 结尾，可能一次收到多个帧
    let idx: number
    while ((idx = this.buffer.indexOf(NULL_BYTE)) !== -1) {
      const raw = this.buffer.slice(0, idx)
      this.buffer = this.buffer.slice(idx + 1)

      // 心跳：服务端可能只发一个换行
      if (raw === '\n' || raw === '') {
        this.markIncoming()
        continue
      }

      this.handleFrame(this.parseFrame(raw))
    }
  }

  private parseFrame(raw: string): StompFrame {
    const lines = raw.split('\n')
    const command = lines.shift() ?? ''
    const headers: Record<string, string> = {}
    let i = 0

    // 头部直到遇到空行
    while (i < lines.length && lines[i] !== '') {
      const line = lines[i] ?? ''
      const sep = line.indexOf(':')
      if (sep > 0) {
        headers[this.unescapeHeader(line.slice(0, sep))] = this.unescapeHeader(line.slice(sep + 1))
      }
      i++
    }
    // 跳过分隔空行，剩余为 body
    const body = lines.slice(i + 1).join('\n')
    return { command, headers, body }
  }

  private unescapeHeader(value: string): string {
    return value
      .replace(/\\c/g, ':')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\\\/g, '\\')
  }

  private handleFrame(frame: StompFrame): void {
    this.markIncoming()

    switch (frame.command) {
      case 'CONNECTED':
        this._connected = true
        // 必须先按 STOMP 规范协商心跳，再启动心跳定时器
        this.negotiateHeartbeat(frame.headers['heart-beat'])
        this.startHeartbeat()
        this.onStateChange?.(true)
        // 重连后需要重新订阅
        for (const [destination, handler] of this.subscriptions) {
          this.sendSubscribe(destination, handler)
        }
        break

      case 'MESSAGE': {
        const dest = frame.headers['destination'] ?? ''
        const handler = this.subscriptions.get(dest)
        handler?.(frame.body, frame)
        break
      }

      case 'ERROR':
        // 服务端拒绝（如令牌失效）时断开，避免无效重连刷屏
        this.stopHeartbeat()
        this.setConnected(false)
        break

      case 'RECEIPT':
      default:
        break
    }
  }

  /**
   * STOMP 心跳协商（RFC 规范）
   *
   * 客户端在 CONNECT 帧声明 `heart-beat: cx,cy`
   *   cx = 客户端能保证的最小发送间隔（0 = 不发）
   *   cy = 客户端期望收到的间隔（0 = 不期望）
   * 服务端在 CONNECTED 帧回应 `heart-beat: sx,sy`
   *   sx = 服务端能保证的发送间隔（0 = 不发）
   *   sy = 服务端期望客户端发送的间隔（0 = 不要求）
   *
   * 协商结果取双方较大值；任一方向有 0 则该方向禁用：
   *   客户端发送间隔 = max(cx, sy)
   *   服务端发送间隔 = max(cy, sx)
   *
   * ⚠️ 若不协商就启用「收不到心跳则断开」的检测，
   *    遇到服务端声明不发心跳（sx=0）时会把健康连接误杀 —— 表现为每隔固定时间断线重连。
   */
  private negotiateHeartbeat(header: string | undefined): void {
    const parts = (header ?? '0,0').split(',')
    const sx = Number.parseInt(parts[0]?.trim() ?? '0', 10) || 0
    const sy = Number.parseInt(parts[1]?.trim() ?? '0', 10) || 0

    const cx = this.options.heartbeatOutgoing
    const cy = this.options.heartbeatIncoming

    this.negotiatedOutgoing = cx === 0 || sy === 0 ? 0 : Math.max(cx, sy)
    this.negotiatedIncoming = cy === 0 || sx === 0 ? 0 : Math.max(cy, sx)

    logger.info(
      `[stomp] 心跳协商 请求=${cx},${cy} 服务端响应=${sx},${sy} → 本端发送=${this.negotiatedOutgoing}ms, 期望接收=${this.negotiatedIncoming}ms`,
    )
  }

  /* ══════════════════ 订阅 / 发送 ══════════════════ */

  subscribe(destination: string, handler: MessageHandler): void {
    this.subscriptions.set(destination, handler)
    if (this._connected) {
      this.sendSubscribe(destination, handler)
    }
  }

  unsubscribe(destination: string): void {
    const id = this.subscriptionId(destination)
    this.subscriptions.delete(destination)
    if (this._connected && this.ws) {
      this.sendFrame('UNSUBSCRIBE', { id }, '')
    }
  }

  private subscriptionId(destination: string): string {
    return `sub-${destination}`
  }

  private sendSubscribe(destination: string, _handler: MessageHandler): void {
    this.sendFrame('SUBSCRIBE', {
      id: this.subscriptionId(destination),
      destination,
      ack: 'auto',
    }, '')
  }

  /** 发送 JSON 消息到指定 destination */
  send(destination: string, payload: unknown): void {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload)
    this.sendFrame('SEND', {
      destination,
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body, 'utf8')),
    }, body)
  }

  /* ══════════════════ 心跳 ══════════════════ */

  private startHeartbeat(): void {
    this.stopHeartbeat()
    // 使用协商结果，而不是本地配置的期望值
    if (this.negotiatedOutgoing > 0) {
      // STOMP 心跳就是往 socket 写一个换行
      this.heartbeatTimer = setInterval(() => {
        if (!this.ws) return
        if (this.ws.readyState !== WebSocket.OPEN) return
        try {
          this.ws.send('\n')
        } catch {
          // send 失败说明连接已断（TCP 半开），主动 terminate 触发 close → 重连
          try {
            this.ws.terminate()
          } catch {
            /* 忽略 */
          }
        }
      }, this.negotiatedOutgoing)
    }
    this.markIncoming()
  }

  /**
   * 收到任意帧或心跳时刷新「服务端存活」计时器。
   *
   * ⚠️ 只有协商结果为「服务端会发心跳」时才启用 ——
   *    否则服务端本就不会发，超时检测会误杀健康连接。
   */
  private markIncoming(): void {
    if (this.negotiatedIncoming <= 0) return
    if (this.incomingTimer) clearTimeout(this.incomingTimer)
    // 容忍 2.5 倍间隔的静默（网络抖动时留足余量），超时则主动重连
    this.incomingTimer = setTimeout(() => {
      if (!this._connected) return
      logger.warn(`[stomp] ${this.negotiatedIncoming * 2.5}ms 未收到服务端心跳，主动重连`)
      try {
        this.ws?.terminate()
      } catch {
        /* 忽略 */
      }
    }, this.negotiatedIncoming * 2.5)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private setConnected(v: boolean): void {
    if (this._connected === v) return
    this._connected = v
    this.onStateChange?.(v)
    if (!v) {
      // 断开时清空缓冲，防止脏帧污染下次连接
      this.buffer = ''
    }
  }
}
