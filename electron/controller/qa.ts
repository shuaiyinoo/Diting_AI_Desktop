import type { ServerResponse } from 'http';
import type { Context } from 'koa';
import { logger } from 'ee-core/log';
import { qaService } from '../components/rag/qa/qaService';
import { assembleEvidenceOverview } from '../components/rag/qa/citationAssembler';
import { statisticsService } from '../components/rag/metrics/statisticsService';
import { qadbService } from '../service/database/qadb';
import type { StatsPeriod } from '../components/rag/metrics/statisticsService';

/**
 * QA 知识问答控制器
 *
 * 提供基于 RAG 的知识库问答 API：
 *   - ask：同步问答，返回完整回答 + 引用
 *   - streamAsk：流式问答，通过 HTTP SSE 逐 token 推送
 *   - 历史记录管理
 *   - LLM 用量统计
 *
 * 通信模式：
 *   - 同步方法通过 IPC invoke / HTTP POST 调用，返回 Promise
 *   - 流式方法通过 HTTP SSE（Server-Sent Events）推送事件
 *     事件类型：token / citations / evidence-overview / complete / error
 */

interface AskArgs {
  folderId: number;
  question: string;
}

interface QaRecordArgs {
  action: 'list' | 'get' | 'delete' | 'count' | 'deleteByFolder';
  folderId?: number;
  id?: number;
  limit?: number;
  offset?: number;
}

interface MetricsArgs {
  action: 'overview' | 'stats' | 'dailyTrend' | 'moduleDistribution' | 'folderStats';
  period?: StatsPeriod;
  folderId?: number;
  module?: string;
}

class QaController {
  /**
   * 同步问答：在指定文件夹的知识库中检索并回答用户问题。
   *
   * 流程：混合检索 → 证据评估 → LLM 生成 → 解析回答 → 组装引用。
   */
  async ask(args: AskArgs): Promise<{
    code: number;
    message?: string;
    data?: Awaited<ReturnType<typeof qaService.ask>>;
  }> {
    const { folderId, question } = args;
    if (!folderId || folderId <= 0) {
      return { code: -1, message: 'folderId 不能为空' };
    }
    if (!question || !question.trim()) {
      return { code: -1, message: '问题不能为空' };
    }
    if (question.length > 2000) {
      return { code: -1, message: '问题长度不能超过 2000 个字符' };
    }

    try {
      const result = await qaService.ask(folderId, question.trim());
      return { code: 0, data: result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[QaController] ask 异常:', err);
      return { code: -1, message: msg };
    }
  }

  /**
   * 流式问答：通过 HTTP SSE（Server-Sent Events）逐 token 推送大模型回答。
   *
   * 参考 ArgusRAG 的 QaController.streamAsk（Spring SseEmitter）实现。
   *
   * SSE 事件类型：
   *   - token：大模型生成的文本片段
   *   - citations：引用来源列表（流结束后发送）
   *   - evidence-overview：证据覆盖概览（流开始前发送）
   *   - complete：流完成，包含 answer / usage / evidenceLevel
   *   - error：错误事件，包含 message 字段
   *
   * 前端通过 fetch + ReadableStream 消费 SSE 事件。
   *
   * @param args 问答参数（folderId + question）
   * @param ctx  Koa 上下文（HTTP 调用时传入）
   */
  async streamAsk(args: AskArgs, ctx: Context): Promise<{ code: number; message?: string }> {
    const { folderId, question } = args;
    if (!folderId || folderId <= 0) {
      return { code: -1, message: 'folderId 不能为空' };
    }
    if (!question || !question.trim()) {
      return { code: -1, message: '问题不能为空' };
    }
    if (question.length > 2000) {
      return { code: -1, message: '问题长度不能超过 2000 个字符' };
    }

    // 检测是否为 HTTP 调用（Koa ctx 有 res 对象）
    const res = (ctx as Context & { res?: ServerResponse }).res;
    if (!res || typeof res.write !== 'function') {
      // 非 HTTP 调用（如 IPC），不支持流式
      return { code: -1, message: 'streamAsk 仅支持 HTTP SSE 模式，请通过 HTTP 调用' };
    }

    // 设置 SSE 响应头
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    // 禁用 Koa 的内置响应处理，防止 _dispatch 中的 ctx.response.body = result 覆盖已写入的流
    (ctx as Context & { respond?: boolean }).respond = false;

    // 客户端断开连接标志
    let clientDisconnected = false;
    const onClose = () => {
      clientDisconnected = true;
      logger.info('[QaController] streamAsk 客户端断开连接');
    };
    res.on('close', onClose);

    try {
      const streamContext = await qaService.askStream(folderId, question.trim());

      // 提前发送证据概览（让前端展示"正在检索"）
      if (!clientDisconnected) {
        const evidenceOverview = streamContext.documents.length > 0
          ? assembleEvidenceOverview(streamContext.documents)
          : null;
        if (evidenceOverview) {
          writeSseEvent(res, 'evidence-overview', evidenceOverview);
        }
      }

      await streamContext.start({
        onToken: (token) => {
          if (!clientDisconnected && !res.writableEnded) {
            writeSseEvent(res, 'token', token);
          }
        },
        onComplete: (fullAnswer, usage) => {
          if (clientDisconnected || res.writableEnded) return;
          // 发送引用来源
          if (streamContext.citations.length > 0) {
            writeSseEvent(res, 'citations', streamContext.citations);
          }
          // 发送完成事件
          writeSseEvent(res, 'complete', {
            answer: fullAnswer,
            usage,
            evidenceLevel: streamContext.evidenceLevel,
          });
        },
        onError: (error) => {
          if (clientDisconnected || res.writableEnded) return;
          const message = error.message || '流式问答服务内部错误';
          writeSseEvent(res, 'error', { message });
        },
      });

      // 流结束，关闭响应
      if (!res.writableEnded) {
        res.end();
      }
      return { code: 0 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[QaController] streamAsk 异常:', err);
      // 发送错误事件
      if (!res.writableEnded) {
        if (!res.headersSent) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        }
        writeSseEvent(res, 'error', { message: msg });
        res.end();
      }
      return { code: -1, message: msg };
    } finally {
      res.removeListener('close', onClose);
    }
  }

  /**
   * 获取 QA 历史记录。
   */
  async recordOperation(args: QaRecordArgs): Promise<{ code: number; message?: string; data?: unknown }> {
    const { action } = args;
    try {
      switch (action) {
        case 'list': {
          const list = qadbService.getList(args.folderId ?? null, args.limit ?? 20, args.offset ?? 0);
          return { code: 0, data: list };
        }
        case 'get': {
          if (!args.id) return { code: -1, message: '缺少 id 参数' };
          const record = qadbService.getById(args.id);
          return { code: 0, data: record };
        }
        case 'count': {
          const count = qadbService.getCount(args.folderId ?? null);
          return { code: 0, data: { count } };
        }
        case 'delete': {
          if (!args.id) return { code: -1, message: '缺少 id 参数' };
          const ok = qadbService.deleteById(args.id);
          return { code: ok ? 0 : -1, message: ok ? '删除成功' : '删除失败' };
        }
        case 'deleteByFolder': {
          if (!args.folderId) return { code: -1, message: '缺少 folderId 参数' };
          const changes = qadbService.deleteByFolderId(args.folderId);
          return { code: 0, data: { deleted: changes } };
        }
        default:
          return { code: -1, message: `未知操作: ${action}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[QaController] recordOperation 异常:', err);
      return { code: -1, message: msg };
    }
  }

  /**
   * LLM 用量统计。
   */
  async metricsOperation(args: MetricsArgs): Promise<{ code: number; message?: string; data?: unknown }> {
    const { action, period = '30d', folderId, module } = args;
    try {
      switch (action) {
        case 'overview':
          return { code: 0, data: statisticsService.getOverview(folderId ?? null) };
        case 'stats':
          return { code: 0, data: statisticsService.getStats(period, folderId ?? null) };
        case 'dailyTrend':
          return { code: 0, data: statisticsService.getDailyTrend(period, module ?? null) };
        case 'moduleDistribution':
          return { code: 0, data: statisticsService.getModuleDistribution(period) };
        case 'folderStats':
          if (!folderId) return { code: -1, message: '缺少 folderId 参数' };
          return { code: 0, data: statisticsService.getFolderStats(folderId, period) };
        default:
          return { code: -1, message: `未知操作: ${action}` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[QaController] metricsOperation 异常:', err);
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
 *
 * @param res    Node.js ServerResponse
 * @param event  事件名称
 * @param data   事件数据（字符串直接写入，其他类型 JSON 序列化）
 */
function writeSseEvent(res: ServerResponse, event: string, data: unknown): void {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  res.write(`event: ${event}\n`);
  res.write(`data: ${payload}\n\n`);
}

export default QaController;
