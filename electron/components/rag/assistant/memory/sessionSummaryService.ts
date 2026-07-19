/**
 * Assistant 会话长期摘要服务
 *
 * 参考 ArgusRAG 的 AssistantSessionSummaryService。
 * 管理会话摘要（summary_text）的生成、持久化和复用策略。
 *
 * 核心逻辑：
 *   - 优先复用已存在的非过期摘要
 *   - 根据消息数、token 估算值判断是否需要重新生成
 *   - 摘要文本保留最新消息并压缩较早的历史
 *
 * 注意：本服务为纯规则/文本拼接（不调 LLM），区别于 shortTermMemory 中的 LLM 摘要。
 */

import { logger } from 'ee-core/log';
import { assistantdbService } from '../../../../service/database/assistantdb';
import type { AssistantMessageEntity } from '../../../../service/database/assistantdb';

const SUMMARY_SOURCE_CHAR_LIMIT = 2000;
const TOKEN_ESTIMATE_DIVISOR = 4;

/** 默认阈值（可未来通过配置覆盖） */
const DEFAULT_MESSAGE_THRESHOLD = 20;
const DEFAULT_TOKEN_THRESHOLD = 8000;
const DEFAULT_STALE_DAYS = 7;

class SessionSummaryService {
  /**
   * 尝试加载可复用的会话摘要。
   * 仅在摘要存在、非空且未过期时返回。
   *
   * @param sessionId 会话 ID
   * @param sessionLastMessageAt 会话最后一条消息时间
   */
  loadReusableSummary(
    sessionId: number,
    sessionLastMessageAt: string | null
  ): string | null {
    const existing = assistantdbService.selectContextBySessionId(sessionId);
    if (!existing || !existing.summary_text || existing.summary_text.trim().length === 0) {
      return null;
    }
    if (this.isStale(existing.updated_at, sessionLastMessageAt)) {
      return null;
    }
    return existing.summary_text;
  }

  /**
   * 判断是否需要生成摘要。
   *
   * @param totalMessages 消息总数
   * @param estimatedTokens 估算 token 数
   * @param sessionLastMessageAt 最后消息时间
   */
  shouldSummarize(
    totalMessages: number,
    estimatedTokens: number,
    sessionLastMessageAt: string | null
  ): boolean {
    if (totalMessages > DEFAULT_MESSAGE_THRESHOLD || estimatedTokens > DEFAULT_TOKEN_THRESHOLD) {
      return true;
    }
    if (!sessionLastMessageAt) return false;
    const lastTime = new Date(sessionLastMessageAt).getTime();
    if (Number.isNaN(lastTime)) return false;
    const staleMs = DEFAULT_STALE_DAYS * 24 * 60 * 60 * 1000;
    return Date.now() - lastTime > staleMs;
  }

  /**
   * 生成会话摘要并持久化。
   * 从消息列表中分离出较早的消息用于生成摘要，保留最近 N 条不压缩。
   *
   * @param sessionId 会话 ID
   * @param messages 会话全部消息
   * @param recentMessageLimit 保留最近消息数量
   * @returns 生成的摘要文本，若无需摘要返回 null
   */
  summarizeAndPersist(
    sessionId: number,
    messages: AssistantMessageEntity[],
    recentMessageLimit: number
  ): string | null {
    if (!messages || messages.length === 0) return null;
    const keepRecentCount = Math.max(1, recentMessageLimit);
    const summaryMessageCount = Math.max(0, messages.length - keepRecentCount);
    if (summaryMessageCount === 0) return null;

    const messagesForSummary = messages.slice(0, summaryMessageCount);
    const summaryText = this.buildSummaryText(messagesForSummary);

    const lastMsg = messagesForSummary[messagesForSummary.length - 1];
    const sourceMessageId = lastMsg?.id ?? null;

    assistantdbService.upsertContext({
      session_id: sessionId,
      summary_text: summaryText,
      source_message_id: sourceMessageId,
      compact_summary: null,
      compact_summary_base_message_id: null,
      compact_summary_range_end_message_id: null,
      session_memory: null,
      session_memory_base_message_id: null,
      session_memory_range_end_message_id: null,
      context_version: null,
      updated_at: new Date().toISOString(),
    });

    logger.info(
      `[SessionSummary] 会话 ${sessionId} 生成摘要：压缩 ${summaryMessageCount} 条消息，保留 ${keepRecentCount} 条`
    );
    return summaryText;
  }

  /**
   * 估算消息列表的 token 数（字符数 / 4）。
   */
  estimateTokens(messages: AssistantMessageEntity[]): number {
    if (!messages || messages.length === 0) return 0;
    let totalChars = 0;
    for (const msg of messages) {
      if (msg.content && msg.content.trim().length > 0) {
        totalChars += msg.content.length;
      }
    }
    return Math.max(1, Math.floor(totalChars / TOKEN_ESTIMATE_DIVISOR));
  }

  // ═══════════════════════════════════════════
  // 辅助
  // ═══════════════════════════════════════════

  private isStale(
    summaryUpdatedAt: string | null,
    sessionLastMessageAt: string | null
  ): boolean {
    if (!summaryUpdatedAt) return true;

    const summaryTime = new Date(summaryUpdatedAt).getTime();
    if (Number.isNaN(summaryTime)) return true;

    // 若摘要更新时间早于会话最后消息时间，说明有新消息，摘要已过期
    if (sessionLastMessageAt) {
      const lastMsgTime = new Date(sessionLastMessageAt).getTime();
      if (!Number.isNaN(lastMsgTime) && summaryTime < lastMsgTime) {
        return true;
      }
    }

    // 超过 staleDays 也视为过期
    const staleMs = DEFAULT_STALE_DAYS * 24 * 60 * 60 * 1000;
    return Date.now() - summaryTime > staleMs;
  }

  private buildSummaryText(messages: AssistantMessageEntity[]): string {
    const lines: string[] = ['历史摘要:'];
    let currentChars = lines.join('\n').length;

    for (const msg of messages) {
      const role = msg.role === 'USER' ? '用户' : '助手';
      const content = this.normalizeContent(msg.content);
      const line = `- ${role}：${content}`;
      if (currentChars + line.length > SUMMARY_SOURCE_CHAR_LIMIT) {
        lines.push('- 其余历史消息已省略');
        break;
      }
      lines.push(line);
      currentChars = lines.join('\n').length;
    }
    return lines.join('\n').trim();
  }

  private normalizeContent(content: string | null): string {
    if (!content) return '';
    const normalized = content.replace(/\s+/g, ' ').trim();
    if (normalized.length <= 160) return normalized;
    return normalized.substring(0, 160) + '...';
  }
}

export const sessionSummaryService = new SessionSummaryService();
