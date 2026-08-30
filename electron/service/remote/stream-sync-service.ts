/**
 * 流式同步服务（Electron 主进程）
 *
 * 职责：
 *   1. 订阅 /topic/stream/desktop/{userId}，接收 Mobile 的代发请求
 *   2. 提供 hook，让前端 SSE 在流式输出各阶段旁路推送状态/token/chunk 给 Mobile
 *   3. Mobile 发消息时，通过 IPC 通知前端执行 sendMessage
 *
 * 与 signaling-service 的关系：
 *   stream-sync-service 复用 signaling-service 建立的 STOMP 连接，
 *   不单独建立连接。
 *
 * 推送流程：
 *   前端 SSE 流 → IPC 调用本服务的 hook → /app/stream-sync → 服务端
 *   → 服务端检测 Mobile 在线 → /topic/stream/mobile/{userId} → Mobile
 *
 * 代发流程：
 *   Mobile → /app/stream-sync-request → 服务端 → /topic/stream/desktop/{userId}
 *   → 本服务收到 → IPC 通知前端 sendMessage → 前端走正常 SSE → hook 推送回 Mobile
 */

import { logger } from 'ee-core/log'
import { getMainWindow } from 'ee-core/electron'
import { remoteSignaling } from './signaling-service'

/* ══════════════════ 类型定义 ══════════════════ */

/** 流式同步消息类型 */
export type StreamSyncType =
  | 'session_status'
  | 'user_message'
  | 'stream_start'
  | 'stream_token'
  | 'stream_chunk'
  | 'stream_end'
  | 'stream_error'
  | 'session_list_changed'

/** 会话类型 */
export type SessionType = 'chat' | 'agent'

/** 流式同步消息（与服务端 StreamSyncMessage.java 对齐） */
export interface StreamSyncMessage {
  type: StreamSyncType
  sessionType: SessionType
  sessionId: string
  userId?: number
  timestamp: number
  payload: Record<string, unknown>
}

/** Mobile 代发请求（与服务端 StreamSyncRequest.java 对齐） */
export interface StreamSyncRequest {
  requestId: string
  sessionType: SessionType
  sessionId: string
  message: string
  toolMode?: string
  folderId?: number
  kbScope?: string
  model?: string
  workspaceSlug?: string
  permissionMode?: string
  thinkingLevel?: string
  userId?: number
}

/** 前端调用 onSendStarted 的参数 */
export interface SendStartedParams {
  sessionType: SessionType
  sessionId: string
  userMessage: string
  assistantMessageId: string | number
}

/** 前端调用 onToken 的参数 */
export interface TokenParams {
  sessionType: SessionType
  sessionId: string
  delta: string
  assistantMessageId: string | number
}

/** 前端调用 onSseEvent 的参数（Agent 模式所有 SSE 事件） */
export interface SseEventParams {
  sessionType: SessionType
  sessionId: string
  event: string
  eventData: unknown
  assistantMessageId: string | number
}

/** 前端调用 onStreamEnd 的参数 */
export interface StreamEndParams {
  sessionType: SessionType
  sessionId: string
  assistantMessageId: string | number
  finalContent?: string
}

/* ══════════════════ 服务实现 ══════════════════ */

class StreamSyncService {
  private subscribed = false

  /** Mobile 代发请求回调（IPC → 前端） */
  onMobileRequest: ((req: StreamSyncRequest) => void) | null = null

  /* ══════════════════ 订阅 ══════════════════ */

  /**
   * 在 STOMP 连接成功后调用，订阅 stream-sync 请求 topic。
   * 复用 signaling-service 的 StompClient。
   */
  start(): void {
    if (this.subscribed) return
    if (!remoteSignaling.connected) {
      logger.warn('[stream-sync] STOMP 未连接，无法订阅 stream topic')
      return
    }

    const userId = remoteSignaling.getCurrentUserId()
    if (!userId) {
      logger.warn('[stream-sync] 无法获取当前用户 ID，跳过订阅')
      return
    }

    // 注册 Mobile 代发请求回调：将请求通过 IPC 转发给前端
    this.onMobileRequest = (req) => {
      try {
        const win = getMainWindow()
        if (win && !win.isDestroyed()) {
          win.webContents.send('streamSync:mobileRequest', req)
        } else {
          logger.warn('[stream-sync] 主窗口未就绪，无法转发 Mobile 代发请求')
        }
      } catch (err) {
        logger.warn('[stream-sync] 推送 Mobile 代发请求失败:', err)
      }
    }

    const topic = `/topic/stream/desktop/${userId}`
    remoteSignaling.subscribeToTopic(topic, (body: string) => {
      try {
        const req = JSON.parse(body) as StreamSyncRequest
        this.handleMobileRequest(req)
      } catch (err) {
        logger.error('[stream-sync] 解析代发请求失败:', err)
      }
    })

    this.subscribed = true
    logger.info(`[stream-sync] 已订阅 stream 请求 topic: ${topic}`)
  }

  /** 断开时重置状态（由 signaling-service 的 onStateChange 调用） */
  resetSubscribed(): void {
    this.subscribed = false
    this.tokenBuffer.clear()
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }

  /* ══════════════════ 前端 Hook（IPC 调用） ══════════════════ */

  /**
   * 前端 sendMessage 开始时调用。
   * 推送 session_status（流式中）+ user_message + stream_start。
   */
  onSendStarted(params: SendStartedParams): void {
    const now = Date.now()
    const { sessionType, sessionId, userMessage, assistantMessageId } = params

    // 1. 推送会话状态：流式中、不可发送
    this.push({
      type: 'session_status',
      sessionType, sessionId, timestamp: now,
      payload: { isStreaming: true, canSend: false },
    })

    // 2. 推送用户消息
    this.push({
      type: 'user_message',
      sessionType, sessionId, timestamp: now,
      payload: {
        message: {
          id: `msg-${now}`,
          role: 'user',
          content: userMessage,
          time: new Date(now).toISOString(),
        },
      },
    })

    // 3. 推送流式开始
    this.push({
      type: 'stream_start',
      sessionType, sessionId, timestamp: now,
      payload: { assistantMessageId },
    })
  }

  /**
   * 前端 SSE onToken 时调用（Chat 和 Agent 的 text 事件）。
   * 节流：50ms 内的 token 攒一批再推，减少 STOMP 消息量。
   */
  private tokenBuffer = new Map<string, { deltas: string[]; assistantMessageId: string | number; sessionType: SessionType; sessionId: string }>()
  private flushTimer: NodeJS.Timeout | null = null

  onToken(params: TokenParams): void {
    const { sessionType, sessionId, delta, assistantMessageId } = params
    const key = `${sessionType}:${sessionId}`

    const existing = this.tokenBuffer.get(key)
    if (existing) {
      existing.deltas.push(delta)
    } else {
      this.tokenBuffer.set(key, {
        deltas: [delta],
        assistantMessageId,
        sessionType,
        sessionId,
      })
    }

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flushTokens(), 50)
    }
  }

  /** 节流定时器触发，批量推送 token */
  private flushTokens(): void {
    this.flushTimer = null
    const now = Date.now()

    for (const [key, entry] of this.tokenBuffer) {
      if (entry.deltas.length === 0) continue
      const delta = entry.deltas.join('')

      this.push({
        type: 'stream_token',
        sessionType: entry.sessionType,
        sessionId: entry.sessionId,
        timestamp: now,
        payload: { delta, assistantMessageId: entry.assistantMessageId },
      })

      entry.deltas.length = 0
    }
  }

  /**
   * 前端 SSE 事件回调（Agent 模式的 thinking / tool_start / tool_result 等全部事件）。
   * 将完整 SSE 事件原样推送，接收端可选择处理或忽略。
   *
   * 推送的事件包括但不限于：
   *   text / thinking / thinking_start / text_start / tool_start / tool_result
   *   rag_citations / usage / complete / error / permission_request / ask_user
   *   delegation_update / delegation_event
   *
   * 其中 text 事件通过 onToken 节流推送，这里不再重复推送 text 事件本身。
   * 其他事件（thinking / tool_start 等）直接即时推送。
   */
  onSseEvent(params: SseEventParams): void {
    // text 事件已由 onToken 处理，不重复推送
    if (params.event === 'text' || params.event === 'token') return

    this.push({
      type: 'stream_chunk',
      sessionType: params.sessionType,
      sessionId: params.sessionId,
      timestamp: Date.now(),
      payload: {
        event: params.event,
        eventData: params.eventData,
        assistantMessageId: params.assistantMessageId,
      },
    })
  }

  /**
   * 前端 SSE 结束时调用。
   * 先 flush 剩余 token，再推送 stream_end + session_status（可发送）。
   */
  onStreamEnd(params: StreamEndParams): void {
    // 先把积攒的 token 推完
    this.flushTokens()

    const now = Date.now()
    const { sessionType, sessionId, assistantMessageId, finalContent } = params

    this.push({
      type: 'stream_end',
      sessionType, sessionId, timestamp: now,
      payload: { assistantMessageId, finalContent },
    })

    this.push({
      type: 'session_status',
      sessionType, sessionId, timestamp: now,
      payload: { isStreaming: false, canSend: true },
    })
  }

  /**
   * 前端 SSE 出错时调用。
   */
  onStreamError(params: { sessionType: SessionType; sessionId: string; assistantMessageId: string | number; error: string }): void {
    // 先 flush 剩余 token
    this.flushTokens()

    const now = Date.now()
    this.push({
      type: 'stream_error',
      sessionType: params.sessionType,
      sessionId: params.sessionId,
      timestamp: now,
      payload: {
        assistantMessageId: params.assistantMessageId,
        error: params.error,
      },
    })

    this.push({
      type: 'session_status',
      sessionType: params.sessionType,
      sessionId: params.sessionId,
      timestamp: now,
      payload: { isStreaming: false, canSend: true },
    })
  }

  /**
   * 会话列表变更时调用（新建/删除/重命名）。
   * 通知 Mobile 刷新会话列表。
   */
  onSessionListChanged(params: {
    sessionType: SessionType
    sessionId: string
    change: 'created' | 'deleted' | 'renamed'
    session?: Record<string, unknown>
  }): void {
    this.push({
      type: 'session_list_changed',
      sessionType: params.sessionType,
      sessionId: params.sessionId,
      timestamp: Date.now(),
      payload: {
        change: params.change,
        session: params.session,
      },
    })
  }

  /* ══════════════════ Mobile 请求处理 ══════════════════ */

  /**
   * 收到 Mobile 的代发请求。
   * 通过回调通知前端执行 sendMessage，前端会正常走 SSE 流程，
   * 同时通过上面的 hook 把流式结果推送给 Mobile。
   */
  private handleMobileRequest(req: StreamSyncRequest): void {
    logger.info(`[stream-sync] 收到代发请求 requestId=${req.requestId} sessionType=${req.sessionType} sessionId=${req.sessionId}`)

    if (!this.onMobileRequest) {
      logger.warn('[stream-sync] 前端未注册 onMobileRequest 回调，无法处理代发请求')
      // 给 Mobile 回一个错误
      this.push({
        type: 'stream_error',
        sessionType: req.sessionType,
        sessionId: req.sessionId,
        timestamp: Date.now(),
        payload: { error: 'Desktop 前端未就绪' },
      })
      return
    }

    // 通知前端执行 sendMessage
    this.onMobileRequest(req)
  }

  /* ══════════════════ 推送 ══════════════════ */

  /** 通过 /app/stream-sync 将消息推送到服务端 */
  private push(msg: StreamSyncMessage): void {
    if (!remoteSignaling.connected) return
    remoteSignaling.publishToApp('/app/stream-sync', msg)
  }
}

export const streamSyncService = new StreamSyncService()
