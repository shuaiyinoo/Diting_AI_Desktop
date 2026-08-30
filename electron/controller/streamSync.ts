/**
 * 流式同步 Controller
 *
 * 暴露给前端的 IPC 接口，前端通过 ipc.invoke('controller/streamSync/<method>') 调用。
 *
 * 方法清单：
 *   - onSendStarted      前端 sendMessage 开始时调用，推送状态+用户消息+流式开始
 *   - onToken             前端 SSE onToken 时调用，推送流式 token（节流批量）
 *   - onSseEvent          前端 SSE 事件回调，推送 Agent 模式的 thinking/tool_start 等事件
 *   - onStreamEnd         前端 SSE 结束时调用，推送流式结束+状态恢复
 *   - onStreamError       前端 SSE 出错时调用，推送错误+状态恢复
 *   - onSessionListChanged 会话列表变更时调用，通知 Mobile 刷新
 *   - registerMobileRequestHandler 注册 Mobile 代发请求回调
 */

import { logger } from 'ee-core/log'
import { streamSyncService } from '../service/remote/stream-sync-service'
import type {
  SendStartedParams,
  TokenParams,
  SseEventParams,
  StreamEndParams,
} from '../service/remote/stream-sync-service'

interface IpcResult<T = unknown> {
  code: number
  message?: string
  data?: T
}

function ok<T>(data: T): IpcResult<T> {
  return { code: 0, data }
}

function fail(message: string): IpcResult<never> {
  return { code: -1, message }
}

/** Mobile 代发请求推送通道（主进程 → 前端） */
const CH_MOBILE_REQUEST = 'streamSync:mobileRequest'

// 注意：onMobileRequest 回调已在 stream-sync-service.ts 的 start() 中注册，
// 无需在此处重复 wire()。

class StreamSyncController {
  /**
   * 前端 sendMessage 开始时调用。
   * 推送 session_status（流式中）+ user_message + stream_start 给 Mobile。
   */
  async onSendStarted(params: SendStartedParams): Promise<IpcResult<{ success: boolean }>> {
    try {
      streamSyncService.onSendStarted(params)
      return ok({ success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[streamSync] onSendStarted 失败:', msg)
      return fail(msg)
    }
  }

  /**
   * 前端 SSE onToken 时调用。
   * 内部节流（50ms），攒一批再推送。
   */
  async onToken(params: TokenParams): Promise<IpcResult<{ success: boolean }>> {
    try {
      streamSyncService.onToken(params)
      return ok({ success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[streamSync] onToken 失败:', msg)
      return fail(msg)
    }
  }

  /**
   * 前端 SSE 事件回调（Agent 模式的 thinking / tool_start / tool_result 等全部事件）。
   * 将完整 SSE 事件原样推送，接收端可选择处理或忽略。
   */
  async onSseEvent(params: SseEventParams): Promise<IpcResult<{ success: boolean }>> {
    try {
      streamSyncService.onSseEvent(params)
      return ok({ success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[streamSync] onSseEvent 失败:', msg)
      return fail(msg)
    }
  }

  /**
   * 前端 SSE 结束时调用。
   * 推送 stream_end + session_status（可发送）。
   */
  async onStreamEnd(params: StreamEndParams): Promise<IpcResult<{ success: boolean }>> {
    try {
      streamSyncService.onStreamEnd(params)
      return ok({ success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[streamSync] onStreamEnd 失败:', msg)
      return fail(msg)
    }
  }

  /**
   * 前端 SSE 出错时调用。
   * 推送 stream_error + session_status（可发送）。
   */
  async onStreamError(params: {
    sessionType: 'chat' | 'agent'
    sessionId: string
    assistantMessageId: string | number
    error: string
  }): Promise<IpcResult<{ success: boolean }>> {
    try {
      streamSyncService.onStreamError(params)
      return ok({ success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[streamSync] onStreamError 失败:', msg)
      return fail(msg)
    }
  }

  /**
   * 会话列表变更时调用（新建/删除/重命名会话）。
   * 通知 Mobile 刷新会话列表。
   */
  async onSessionListChanged(params: {
    sessionType: 'chat' | 'agent'
    sessionId: string
    change: 'created' | 'deleted' | 'renamed'
    session?: Record<string, unknown>
  }): Promise<IpcResult<{ success: boolean }>> {
    try {
      streamSyncService.onSessionListChanged(params)
      return ok({ success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[streamSync] onSessionListChanged 失败:', msg)
      return fail(msg)
    }
  }
}

export default StreamSyncController
