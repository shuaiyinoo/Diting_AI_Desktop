import type { ServerResponse } from 'http';
import type { Context } from 'koa';
import { logger } from 'ee-core/log';
import { assistantService } from '../components/rag/assistant/assistantService';
import type { AssistantChatRequest, AssistantToolMode } from '../components/rag/assistant/types';

/**
 * Assistant 助手控制器
 *
 * 提供多轮对话助手 API：
 *   - sessionOperation：会话管理（创建/列表/重命名/删除/详情）
 *   - streamChat：流式聊天，通过 HTTP SSE 逐 token 推送
 *   - getConversationContext：获取会话历史上下文
 *
 * 通信模式：
 *   - 同步方法通过 IPC invoke / HTTP POST 调用，返回 Promise
 *   - 流式方法通过 HTTP SSE（Server-Sent Events）推送事件
 *     事件类型：start / token / citations / complete / error
 */

interface SessionOperationArgs {
  action: 'create' | 'list' | 'get' | 'rename' | 'delete';
  sessionId?: number;
  title?: string;
}

interface GetContextArgs {
  sessionId: number;
  recentLimit?: number;
}

class AssistantController {
  /**
   * 会话管理（创建/列表/重命名/删除/详情）。
   */
  async sessionOperation(
    args: SessionOperationArgs
  ): Promise<{ code: number; message?: string; data?: unknown }> {
    const { action } = args;
    try {
      switch (action) {
        case 'create': {
          const session = assistantService.createSession();
          return { code: 0, data: session };
        }
        case 'list': {
          const list = assistantService.listSessions();
          return { code: 0, data: list };
        }
        case 'get': {
          if (!args.sessionId) return { code: -1, message: '缺少 sessionId 参数' };
          const detail = assistantService.getSessionDetail(args.sessionId);
          if (!detail) return { code: -1, message: '会话不存在' };
          return { code: 0, data: detail };
        }
        case 'rename': {
          if (!args.sessionId) return { code: -1, message: '缺少 sessionId 参数' };
          if (!args.title) return { code: -1, message: '缺少 title 参数' };
          const ok = assistantService.renameSession(args.sessionId, args.title);
          return { code: ok ? 0 : -1, message: ok ? '重命名成功' : '重命名失败' };
        }
        case 'delete': {
          if (!args.sessionId) return { code: -1, message: '缺少 sessionId 参数' };
          const ok = assistantService.deleteSession(args.sessionId);
          return { code: ok ? 0 : -1, message: ok ? '删除成功' : '删除失败' };
        }
        default:
          return { code: -1, message: `未知操作: ${action}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[AssistantController] sessionOperation 异常:', err);
      return { code: -1, message: msg };
    }
  }

  /**
   * 流式聊天：通过 HTTP SSE（Server-Sent Events）逐 token 推送助手回答。
   *
   * 参考 ArgusRAG 的 AssistantChatController.streamChat（Spring SseEmitter）实现。
   *
   * SSE 事件类型：
   *   - start：流开始
   *   - token：大模型生成的文本片段
   *   - citations：引用来源列表（KB_SEARCH 模式，流开始前发送）
   *   - complete：流完成，包含 reply / citations / usage / evidenceLevel
   *   - error：错误事件，包含 error 字段
   *
   * 前端通过 fetch + ReadableStream 消费 SSE 事件。
   *
   * @param args  聊天参数（sessionId + message + toolMode + folderId）
   * @param ctx   Koa 上下文（HTTP 调用时传入）
   */
  async streamChat(
    args: AssistantChatRequest,
    ctx: Context
  ): Promise<{ code: number; message?: string }> {
    // 基础校验
    if (!args || !args.sessionId || args.sessionId <= 0) {
      return { code: -1, message: 'sessionId 非法' };
    }
    if (!args.message || !args.message.trim()) {
      return { code: -1, message: '消息内容不能为空' };
    }
    if (args.toolMode !== 'CHAT' && args.toolMode !== 'KB_SEARCH') {
      return { code: -1, message: 'toolMode 必须为 CHAT 或 KB_SEARCH' };
    }

    // 检测是否为 HTTP 调用（Koa ctx 有 res 对象）
    const res = (ctx as Context & { res?: ServerResponse }).res;
    if (!res || typeof res.write !== 'function') {
      return { code: -1, message: 'streamChat 仅支持 HTTP SSE 模式，请通过 HTTP 调用' };
    }

    // 设置 SSE 响应头
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    // 禁用 Koa 的内置响应处理
    (ctx as Context & { respond?: boolean }).respond = false;

    // 客户端断开连接标志
    let clientDisconnected = false;
    const onClose = () => {
      clientDisconnected = true;
      logger.info('[AssistantController] streamChat 客户端断开连接');
    };
    res.on('close', onClose);

    try {
      await assistantService.streamChat(args, {
        onEvent: (event) => {
          if (clientDisconnected || res.writableEnded) return;
          writeSseEvent(res, event.event, event);
        },
      });

      // 流结束，关闭响应
      if (!res.writableEnded) {
        res.end();
      }
      return { code: 0 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[AssistantController] streamChat 异常:', err);
      if (!res.writableEnded) {
        if (!res.headersSent) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        }
        writeSseEvent(res, 'error', {
          event: 'error',
          sessionId: args.sessionId,
          toolMode: args.toolMode as AssistantToolMode,
          folderId: args.folderId ?? null,
          delta: null,
          messageId: null,
          reply: null,
          citations: null,
          evidenceLevel: null,
          usage: null,
          error: msg,
        });
        res.end();
      }
      return { code: -1, message: msg };
    } finally {
      res.removeListener('close', onClose);
    }
  }

  /**
   * 获取会话对话上下文（用于恢复历史）。
   */
  async getConversationContext(
    args: GetContextArgs
  ): Promise<{ code: number; message?: string; data?: unknown }> {
    if (!args.sessionId || args.sessionId <= 0) {
      return { code: -1, message: 'sessionId 非法' };
    }
    try {
      const context = assistantService.getConversationContext(
        args.sessionId,
        args.recentLimit ?? 50
      );
      return { code: 0, data: context };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[AssistantController] getConversationContext 异常:', err);
      return { code: -1, message: msg };
    }
  }
}

/**
 * 向 SSE 响应流写入一个事件。
 *
 * SSE 格式：
 *   event: <事件名>\n
 *   data: <数据>\n\n
 */
function writeSseEvent(res: ServerResponse, event: string, data: unknown): void {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  res.write(`event: ${event}\n`);
  res.write(`data: ${payload}\n\n`);
}

export default AssistantController;
