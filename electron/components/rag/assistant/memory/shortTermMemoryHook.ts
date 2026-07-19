/**
 * Assistant 上下文组装器（短期记忆 Hook）
 *
 * 参考 ArgusRAG 的 AssistantShortTermMemoryHook。
 * 负责在每次模型调用前从数据库加载会话上下文（紧凑摘要、会话记忆、最近消息），
 * 构建发送给 LLM 的消息列表，实现短期记忆的自动注入。
 *
 * 组装顺序：
 *   1. 紧凑摘要（作为 system 消息）
 *   2. 会话记忆（作为 system 消息）
 *   3. 长期摘要（作为 system 消息）
 *   4. 最近对话历史（USER / ASSISTANT 交替）
 *   5. 当前用户问题
 */

import { logger } from 'ee-core/log';
import { assistantdbService } from '../../../../service/database/assistantdb';
import { sessionSummaryService } from './sessionSummaryService';
import type { AssistantMessageEntity } from '../../../../service/database/assistantdb';
import type { ChatMessage } from '../../llm/llmClient';
import type { AssistantToolMode, AssistantMessageRole } from '../types';

const RECENT_MESSAGE_LIMIT = 10;
const RUNTIME_TOKEN_THRESHOLD = 50000;

class ShortTermMemoryHook {
  /**
   * 组装模型调用前的消息列表。
   *
   * 按以下顺序构建发送给 LLM 的消息列表：
   *   紧凑摘要 → 会话记忆 → 长期摘要 → 最近历史 → 当前问题
   *
   * @param sessionId 会话 ID
   * @param toolMode 工具模式
   * @param folderId 知识库文件夹 ID
   * @param currentQuestion 当前用户问题
   */
  assembleBeforeModelMessages(
    sessionId: number,
    toolMode: AssistantToolMode,
    folderId: number | null,
    currentQuestion: string
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // 加载会话上下文
    const session = assistantdbService.getSessionById(sessionId);
    if (!session) {
      logger.warn(`[ShortTermMemoryHook] 会话 ${sessionId} 不存在，仅使用当前问题`);
      messages.push({ role: 'user', content: currentQuestion });
      return messages;
    }

    const context = assistantdbService.selectContextBySessionId(sessionId);
    const recentMessages = assistantdbService.selectRecentBySessionId(sessionId, RECENT_MESSAGE_LIMIT);

    // 注入记忆层（system 消息）
    this.addSystemMemory(messages, 'compact summary', context?.compact_summary ?? null);
    this.addSystemMemory(messages, 'session memory', context?.session_memory ?? null);

    // 注入长期摘要（优先复用已沉淀的）
    const summaryText = sessionSummaryService.loadReusableSummary(
      sessionId,
      session.last_message_at
    );
    if (summaryText) {
      this.addSystemMemory(messages, 'compact summary', summaryText);
    } else {
      // 尝试按需生成
      const allMessages = assistantdbService.selectBySessionIdOrderByCreatedAt(sessionId);
      const estimatedTokens = sessionSummaryService.estimateTokens(allMessages);
      if (
        sessionSummaryService.shouldSummarize(
          allMessages.length,
          estimatedTokens,
          session.last_message_at
        )
      ) {
        const generated = sessionSummaryService.summarizeAndPersist(
          sessionId,
          allMessages,
          RECENT_MESSAGE_LIMIT
        );
        if (generated) {
          this.addSystemMemory(messages, '历史摘要', generated);
        }
      }
    }

    // 注入最近对话历史
    this.appendRecentMessages(messages, recentMessages, currentQuestion);

    // 注入当前用户问题
    messages.push({ role: 'user', content: currentQuestion });

    logger.debug(
      `[ShortTermMemoryHook] 会话 ${sessionId} 上下文组装完成：${messages.length} 条消息` +
      `（compact=${context?.compact_summary ? 'Y' : 'N'}, memory=${context?.session_memory ? 'Y' : 'N'}）`
    );
    return messages;
  }

  /**
   * 判断运行时 token 是否超过阈值（用于触发运行时压缩）。
   */
  shouldRuntimeCompact(estimatedTokens: number): boolean {
    return estimatedTokens > RUNTIME_TOKEN_THRESHOLD;
  }

  /**
   * 运行时压缩：保留最后 3 条消息。
   */
  runtimeCompact(messages: ChatMessage[]): ChatMessage[] {
    if (!messages || messages.length === 0) return [];
    const keepCount = Math.min(3, messages.length);
    return messages.slice(messages.length - keepCount);
  }

  // ═══════════════════════════════════════════
  // 辅助
  // ═══════════════════════════════════════════

  private addSystemMemory(messages: ChatMessage[], label: string, content: string | null): void {
    if (!content || content.trim().length === 0) return;
    messages.push({
      role: 'system',
      content: `${label}\n${content}`.trim(),
    });
  }

  private appendRecentMessages(
    messages: ChatMessage[],
    recentMessages: AssistantMessageEntity[],
    currentQuestion: string
  ): void {
    if (!recentMessages || recentMessages.length === 0) return;

    const lastIndex = recentMessages.length - 1;
    for (let i = 0; i < recentMessages.length; i++) {
      const msg = recentMessages[i];
      if (!msg || !msg.content || msg.content.trim().length === 0) continue;

      // 跳过与当前问题重复的最后一条用户消息（避免重复）
      const isCurrentQuestionEcho =
        i === lastIndex &&
        msg.role === 'USER' &&
        currentQuestion.trim() === msg.content.trim();
      if (isCurrentQuestionEcho) continue;

      const role = this.toChatRole(msg.role);
      if (!role) continue;

      messages.push({
        role,
        content: this.formatRecentMessage(msg),
      });
    }
  }

  private toChatRole(role: string): 'user' | 'assistant' | null {
    switch (role as AssistantMessageRole) {
      case 'USER':
        return 'user';
      case 'ASSISTANT':
        return 'assistant';
      case 'TOOL':
        // TOOL 消息作为 assistant 消息注入（携带工具观察内容）
        return 'assistant';
      default:
        return null;
    }
  }

  private formatRecentMessage(msg: AssistantMessageEntity): string {
    const mode = msg.tool_mode || 'UNKNOWN';
    const prefix = `[历史消息 | 模式：${mode}]`;
    return `${prefix}\n${msg.content}`.trim();
  }
}

export const shortTermMemoryHook = new ShortTermMemoryHook();
