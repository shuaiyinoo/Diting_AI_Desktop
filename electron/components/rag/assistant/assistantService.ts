/**
 * Assistant 助手核心编排服务
 *
 * 参考 ArgusRAG 的 AssistantService + AssistantAgentFacade。
 * 编排聊天流程：消息验证 → 用户消息持久化 → 记忆维护 → 上下文组装 →
 *              （KB_SEARCH 模式：证据检索）→ LLM 流式生成 → 助手回复持久化 → 记忆维护。
 *
 * 双模式：
 *   - CHAT：纯对话，仅使用记忆上下文
 *   - KB_SEARCH：知识库检索，先检索证据再生成带引用回答
 *
 * 流式输出通过 HTTP SSE 推送，事件类型：start / token / citations / complete / error
 */

import { logger } from 'ee-core/log';
import type { ServerResponse } from 'http';
import type { Context } from 'koa';
import { assistantdbService } from '../../../service/database/assistantdb';
import type { AssistantMessageEntity } from '../../../service/database/assistantdb';
import { llmdbService } from '../../../service/database/llmdb';
import { chatStream } from '../llm/llmClient';
import type { ChatMessage } from '../llm/llmClient';
import { hybridRetrievalService } from '../retrieval/hybridRetrieval';
import { assembleCitations } from '../qa/citationAssembler';
import { formatEvidenceContext } from '../llm/promptBuilder';
import { recordUsage } from '../metrics/usageCollector';
import { promptContextBuilder } from './promptContextBuilder';
import { shortTermMemoryHook } from './memory/shortTermMemoryHook';
import { shortTermMemoryMaintenanceService } from './memory/shortTermMemoryMaintenanceService';
import type {
  AssistantChatRequest,
  AssistantChatStreamEvent,
  AssistantMessageVO,
  AssistantToolMode,
} from './types';
import { EvidenceLevel } from '../types';
import type { Citation, LlmUsageInfo, RetrievedEvidenceBundle } from '../types';

const MODEL_NOT_CONFIGURED_MESSAGE = '未启用任何 LLM 模型，请先在设置中启用一个模型';
const MAX_RECENT_MESSAGES = 50;
const DEFAULT_SESSION_TITLE = '新会话';
const TOKEN_ESTIMATE_DIVISOR = 4;

/** SSE 流式回调 */
export interface StreamCallbacks {
  onEvent: (event: AssistantChatStreamEvent) => void;
}

class AssistantService {
  /**
   * 流式聊天入口。
   *
   * 流程：
   *   1. 校验请求
   *   2. 保存用户消息（含自动重命名）
   *   3. 维护短期记忆（before）
   *   4. 发送 start 事件
   *   5. KB_SEARCH 模式：检索证据并发送 citations 事件
   *   6. 组装上下文消息
   *   7. 流式调用 LLM，逐 token 发送 token 事件
   *   8. 保存助手回复
   *   9. 维护短期记忆（after）
   *   10. 发送 complete 事件
   *   11. 记录 LLM 用量
   */
  async streamChat(
    request: AssistantChatRequest,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const startTime = Date.now();
    const safeRequest = this.requireChatRequest(request);
    const { sessionId, toolMode, folderId } = safeRequest;

    let reply = '';
    let success = false;
    let errorMessage: string | null = null;
    let model = llmdbService.getEnabledModel();

    try {
      // 1. 保存用户消息
      const now = new Date().toISOString();
      const userMessage = assistantdbService.insertMessage(
        sessionId,
        'USER',
        toolMode,
        folderId ?? null,
        safeRequest.message,
        null,
        now
      );
      assistantdbService.updateLastMessageAt(sessionId, now);

      // 首条消息自动重命名
      this.autoRenameSessionIfNeeded(sessionId, safeRequest.message);

      // 2. 维护短期记忆（before）
      await shortTermMemoryMaintenanceService.maintainBeforeResponse(
        sessionId,
        toolMode,
        folderId ?? null,
        userMessage.id
      );

      // 3. 发送 start 事件
      callbacks.onEvent(this.makeEvent('start', sessionId, toolMode, folderId ?? null));

      // 4. KB_SEARCH 模式：检索证据
      let citations: Citation[] = [];
      let evidenceLevel: EvidenceLevel | null = null;
      let evidenceBundle: RetrievedEvidenceBundle | null = null;

      if (toolMode === 'KB_SEARCH') {
        if (!folderId || folderId <= 0) {
          throw new Error('KB_SEARCH 模式必须提供 folderId');
        }
        evidenceBundle = await hybridRetrievalService.retrieve(folderId, safeRequest.message, 5);
        // 弱证据时不返回引用，避免误导用户
        citations = evidenceBundle.evidenceLevel === EvidenceLevel.WEAK
          ? []
          : assembleCitations(evidenceBundle.documents);
        evidenceLevel = evidenceBundle.evidenceLevel;

        // 发送引用事件（流开始前让前端展示证据）
        callbacks.onEvent({
          ...this.makeEvent('citations', sessionId, toolMode, folderId),
          citations,
          evidenceLevel,
        });

        // 无证据 → 直接结束
        if (evidenceBundle.documents.length === 0) {
          const usage: LlmUsageInfo = {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            estimated: false,
            latencyMs: Date.now() - startTime,
          };
          // 保存空的助手回复
          const assistantMsg = assistantdbService.insertMessage(
            sessionId,
            'ASSISTANT',
            toolMode,
            folderId,
            '未检索到相关证据，暂不回答。',
            JSON.stringify({ citations: [], evidenceLevel }),
            new Date().toISOString()
          );
          await shortTermMemoryMaintenanceService.maintainAfterResponse(
            sessionId,
            toolMode,
            folderId,
            assistantMsg.id
          );
          callbacks.onEvent({
            ...this.makeEvent('complete', sessionId, toolMode, folderId),
            messageId: assistantMsg.id,
            reply: '未检索到相关证据，暂不回答。',
            citations,
            evidenceLevel,
            usage,
          });
          success = true;
          return;
        }
      }

      // 5. 获取模型（延迟获取，确保最新）
      if (!model) {
        throw new Error(MODEL_NOT_CONFIGURED_MESSAGE);
      }

      // 6. 组装上下文消息
      const systemInstruction = promptContextBuilder.buildChatInstruction(
        sessionId,
        toolMode,
        folderId ?? null
      );
      const contextMessages = shortTermMemoryHook.assembleBeforeModelMessages(
        sessionId,
        toolMode,
        folderId ?? null,
        safeRequest.message
      );

      // 组装最终消息列表：system instruction + 记忆上下文 + 证据（KB_SEARCH）
      const messages: ChatMessage[] = [
        { role: 'system', content: systemInstruction },
        ...contextMessages,
      ];

      if (toolMode === 'KB_SEARCH' && evidenceBundle) {
        // 将证据注入最后一条 user 消息之前
        const evidenceContext = formatEvidenceContext(evidenceBundle.documents);
        const evidenceGuidance = evidenceBundle.evidenceGuidance;
        const evidenceUserContent = [
          '以下是检索到的证据，请基于这些证据回答用户的问题。',
          '',
          '证据等级：' + evidenceBundle.evidenceLevel,
          '回答策略：' + evidenceGuidance,
          '',
          '---------------------',
          evidenceContext,
          '---------------------',
        ].join('\n');
        messages.push({ role: 'user', content: evidenceUserContent });
      }

      // 7. 流式调用 LLM
      const result = await this.executeStreaming(
        model,
        messages,
        (delta) => {
          callbacks.onEvent({
            ...this.makeEvent('token', sessionId, toolMode, folderId ?? null),
            delta,
          });
        }
      );
      reply = result.reply;

      // 8. 保存助手回复
      const assistantNow = new Date().toISOString();
      const structuredPayload = JSON.stringify({
        citations,
        evidenceLevel,
        usage: result.usage,
      });
      const assistantMsg = assistantdbService.insertMessage(
        sessionId,
        'ASSISTANT',
        toolMode,
        folderId ?? null,
        reply,
        structuredPayload,
        assistantNow
      );
      assistantdbService.updateLastMessageAt(sessionId, assistantNow);

      // 9. 维护短期记忆（after）
      await shortTermMemoryMaintenanceService.maintainAfterResponse(
        sessionId,
        toolMode,
        folderId ?? null,
        assistantMsg.id
      );

      // 10. 发送 complete 事件
      callbacks.onEvent({
        ...this.makeEvent('complete', sessionId, toolMode, folderId ?? null),
        messageId: assistantMsg.id,
        reply,
        citations,
        evidenceLevel,
        usage: result.usage,
      });

      success = true;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[AssistantService] 流式聊天异常: sessionId=${sessionId}`, err);

      // 发送 error 事件
      callbacks.onEvent({
        ...this.makeEvent('error', sessionId, toolMode, folderId ?? null),
        error: errorMessage,
      });
      throw err;
    } finally {
      // 11. 记录 LLM 用量
      this.recordUsage(
        sessionId,
        folderId ?? null,
        'assistant/chat/stream',
        safeRequest.message,
        reply,
        model?.model_name ?? '(unknown)',
        startTime,
        success,
        errorMessage
      );
    }
  }

  /**
   * 执行流式 LLM 调用。
   */
  private async executeStreaming(
    model: NonNullable<ReturnType<typeof llmdbService.getEnabledModel>>,
    messages: ChatMessage[],
    onToken: (delta: string) => void
  ): Promise<{ reply: string; usage: LlmUsageInfo; citations: Citation[] }> {
    const replyBuilder: string[] = [];
    let usage: LlmUsageInfo = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimated: false,
      latencyMs: 0,
    };

    await chatStream(model, messages, {
      onToken: (token) => {
        replyBuilder.push(token);
        onToken(token);
      },
      onComplete: (u) => {
        usage = u;
      },
      onError: (err) => {
        throw err;
      },
    });

    const reply = replyBuilder.join('').trim();
    if (reply.length === 0) {
      throw new Error('助手返回内容为空');
    }

    return { reply, usage, citations: [] };
  }

  // ═══════════════════════════════════════════
  // 会话管理
  // ═══════════════════════════════════════════

  /** 创建新会话 */
  createSession(): { sessionId: number; title: string; lastMessageAt: string | null; createdAt: string } {
    const session = assistantdbService.createSession();
    return {
      sessionId: session.id,
      title: session.title,
      lastMessageAt: session.last_message_at,
      createdAt: session.created_at,
    };
  }

  /** 获取会话列表 */
  listSessions() {
    const sessions = assistantdbService.listSessions();
    return sessions.map((s) => ({
      sessionId: s.id,
      title: s.title,
      lastMessageAt: s.last_message_at,
    }));
  }

  /** 获取会话详情 */
  getSessionDetail(sessionId: number) {
    const session = assistantdbService.getSessionById(sessionId);
    if (!session) return null;
    return {
      sessionId: session.id,
      title: session.title,
      status: session.status,
      lastMessageAt: session.last_message_at,
      createdAt: session.created_at,
    };
  }

  /** 重命名会话 */
  renameSession(sessionId: number, title: string): boolean {
    const normalized = title.trim().replace(/\s+/g, ' ');
    if (normalized.length === 0) return false;
    if (normalized.length > 255) return false;
    return assistantdbService.updateTitle(sessionId, normalized);
  }

  /** 删除会话 */
  deleteSession(sessionId: number): boolean {
    return assistantdbService.deleteSession(sessionId);
  }

  /** 获取会话对话上下文（恢复历史） */
  getConversationContext(sessionId: number, recentLimit: number = MAX_RECENT_MESSAGES) {
    const safeLimit = Math.min(Math.max(1, recentLimit), MAX_RECENT_MESSAGES);
    const recentEntities = assistantdbService.selectRecentBySessionId(sessionId, safeLimit);
    const recentMessages = recentEntities.map((e) => this.toMessageVO(e));
    const context = assistantdbService.selectContextBySessionId(sessionId);
    return {
      summaryText: context?.summary_text ?? null,
      recentMessages,
    };
  }

  // ═══════════════════════════════════════════
  // 辅助
  // ═══════════════════════════════════════════

  private requireChatRequest(request: AssistantChatRequest): AssistantChatRequest {
    if (!request) throw new Error('聊天请求不能为空');
    if (!request.sessionId || request.sessionId <= 0) {
      throw new Error('sessionId 非法');
    }
    if (!request.message || request.message.trim().length === 0) {
      throw new Error('消息内容不能为空');
    }
    if (request.message.length > 8000) {
      throw new Error('消息长度不能超过 8000 个字符');
    }
    if (request.toolMode === 'CHAT' && request.folderId != null) {
      throw new Error('CHAT 模式不允许传 folderId');
    }
    if (request.toolMode === 'KB_SEARCH' && !request.folderId) {
      throw new Error('KB_SEARCH 模式必须传 folderId');
    }
    return request;
  }

  private autoRenameSessionIfNeeded(sessionId: number, firstUserMessage: string): void {
    const session = assistantdbService.getSessionById(sessionId);
    if (!session || session.title !== DEFAULT_SESSION_TITLE) return;

    const normalized = firstUserMessage
      .replace(/\s+/g, ' ')
      .replace(/\n/g, ' ')
      .trim();
    if (normalized.length === 0) return;

    const title = normalized.length <= 24 ? normalized : normalized.substring(0, 24).trim();
    if (title === DEFAULT_SESSION_TITLE) return;
    assistantdbService.updateTitle(sessionId, title);
  }

  private toMessageVO(entity: AssistantMessageEntity): AssistantMessageVO {
    let citations: Citation[] | undefined;
    let structuredPayload = entity.structured_payload;
    if (structuredPayload) {
      try {
        const parsed = JSON.parse(structuredPayload);
        if (parsed && Array.isArray(parsed.citations)) {
          citations = parsed.citations;
        }
      } catch {
        // 忽略解析失败
      }
    }
    return {
      messageId: entity.id,
      sessionId: entity.session_id,
      role: entity.role as AssistantMessageVO['role'],
      toolMode: entity.tool_mode as AssistantToolMode | null,
      folderId: entity.folder_id,
      content: entity.content,
      structuredPayload,
      citations,
      createdAt: entity.created_at,
    };
  }

  private makeEvent(
    event: AssistantChatStreamEvent['event'],
    sessionId: number,
    toolMode: AssistantToolMode,
    folderId: number | null
  ): AssistantChatStreamEvent {
    return {
      event,
      sessionId,
      toolMode,
      folderId,
      delta: null,
      messageId: null,
      reply: null,
      citations: null,
      evidenceLevel: null,
      usage: null,
      error: null,
    };
  }

  private recordUsage(
    sessionId: number,
    folderId: number | null,
    endpoint: string,
    userMessage: string,
    reply: string,
    modelName: string,
    startTime: number,
    success: boolean,
    errorMessage: string | null
  ): void {
    try {
      const latencyMs = Date.now() - startTime;
      const promptTokens = Math.max(1, Math.floor(userMessage.length / TOKEN_ESTIMATE_DIVISOR));
      const completionTokens = reply ? Math.max(1, Math.floor(reply.length / TOKEN_ESTIMATE_DIVISOR)) : 0;
      const totalTokens = promptTokens + completionTokens;

      recordUsage({
        module: 'ASSISTANT',
        endpoint: endpoint as 'assistant/chat/stream',
        sessionId: String(sessionId),
        folderId,
        modelName,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens,
          estimated: true,
          latencyMs,
        },
        success,
        errorMessage,
      });
    } catch (err) {
      logger.warn('[AssistantService] LLM 用量记录失败，不影响主流程:', err);
    }
  }
}

export const assistantService = new AssistantService();
