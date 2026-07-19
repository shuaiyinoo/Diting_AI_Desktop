/**
 * Assistant 短期记忆维护服务
 *
 * 参考 ArgusRAG 的 AssistantShortTermMemoryMaintenanceService。
 * 负责在消息持久化后触发短期记忆的增量更新和维护。
 *
 * 核心逻辑：
 *   1. 判断是否需要更新会话记忆（基于增量消息数和 token 阈值）
 *   2. 调 LLM 生成会话记忆摘要并持久化
 *   3. 在需要时触发紧凑摘要的生成
 *   4. 使用乐观锁控制并发更新
 *
 * 触发时机：
 *   - saveUserMessage 后：maintainBeforeResponse
 *   - saveAssistantMessage 后：maintainAfterResponse
 */

import { logger } from 'ee-core/log';
import { assistantdbService } from '../../../../service/database/assistantdb';
import type { AssistantMessageEntity, AssistantSessionContextEntity } from '../../../../service/database/assistantdb';
import { memorySummarizer } from './memorySummarizer';
import type { AssistantToolMode } from '../types';

const TOKEN_ESTIMATE_DIVISOR = 4;

/** 触发会话压缩的总体 token 阈值 */
const SESSION_TOKEN_THRESHOLD = 6500;
/** 触发会话记忆更新的消息数阈值 */
const SESSION_MEMORY_MESSAGE_TRIGGER = 4;
/** 触发会话记忆更新的 token 数阈值 */
const SESSION_MEMORY_TOKEN_TRIGGER = 1200;
/** 触发紧凑摘要的消息数阈值 */
const COMPACT_MESSAGE_TRIGGER = 6;
/** 触发紧凑摘要的 token 数阈值 */
const COMPACT_TOKEN_TRIGGER = 1800;

class ShortTermMemoryMaintenanceService {
  /**
   * 在模型响应前执行短期记忆维护。
   */
  async maintainBeforeResponse(
    sessionId: number,
    toolMode: AssistantToolMode,
    folderId: number | null,
    currentMessageId: number
  ): Promise<void> {
    await this.maintain(sessionId, toolMode, folderId, currentMessageId);
  }

  /**
   * 在模型响应后执行短期记忆维护。
   */
  async maintainAfterResponse(
    sessionId: number,
    toolMode: AssistantToolMode,
    folderId: number | null,
    currentMessageId: number
  ): Promise<void> {
    await this.maintain(sessionId, toolMode, folderId, currentMessageId);
  }

  /**
   * 判断是否需要更新会话记忆。
   */
  shouldMaintainSessionMemory(
    newMessages: AssistantMessageEntity[],
    lastRangeEndMessageId: number
  ): boolean {
    if (!newMessages || newMessages.length === 0) return false;
    const estimatedTokens = this.estimateTokens(newMessages);
    return (
      newMessages.length >= SESSION_MEMORY_MESSAGE_TRIGGER ||
      estimatedTokens >= SESSION_MEMORY_TOKEN_TRIGGER
    );
  }

  /**
   * 判断是否需要触发紧凑摘要。
   */
  shouldCompactSession(
    estimatedTokens: number,
    newMessageCount: number,
    newTokenCount: number
  ): boolean {
    return (
      estimatedTokens > SESSION_TOKEN_THRESHOLD &&
      (newMessageCount >= COMPACT_MESSAGE_TRIGGER || newTokenCount >= COMPACT_TOKEN_TRIGGER)
    );
  }

  /**
   * 估算消息列表的 token 数。
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
  // 核心维护逻辑
  // ═══════════════════════════════════════════

  private async maintain(
    sessionId: number,
    toolMode: AssistantToolMode,
    folderId: number | null,
    currentMessageId: number
  ): Promise<void> {
    try {
      const allMessages = assistantdbService.selectBySessionIdOrderByCreatedAt(sessionId);
      const existingContext = assistantdbService.selectContextBySessionId(sessionId);

      const lastRangeEndMessageId =
        existingContext && existingContext.session_memory_range_end_message_id != null
          ? existingContext.session_memory_range_end_message_id
          : 0;

      // 计算新增消息（上次摘要覆盖范围之后的消息）
      const newMessages = allMessages.filter(
        (m) => m.id != null && m.id > lastRangeEndMessageId
      );

      if (!this.shouldMaintainSessionMemory(newMessages, lastRangeEndMessageId)) {
        return;
      }

      // 调 LLM 生成会话记忆
      const sessionMemory = await memorySummarizer.summarizeSessionMemory(
        existingContext?.session_memory ?? null,
        newMessages,
        toolMode,
        folderId
      );

      const firstNewMsg = newMessages[0];
      const lastNewMsg = newMessages[newMessages.length - 1];

      // 构建待写入的上下文实体
      const contextToWrite: AssistantSessionContextEntity = {
        session_id: sessionId,
        summary_text: existingContext?.summary_text ?? null,
        source_message_id: existingContext?.source_message_id ?? null,
        compact_summary: existingContext?.compact_summary ?? null,
        compact_summary_base_message_id: existingContext?.compact_summary_base_message_id ?? null,
        compact_summary_range_end_message_id: existingContext?.compact_summary_range_end_message_id ?? null,
        session_memory: sessionMemory,
        session_memory_base_message_id: firstNewMsg?.id ?? null,
        session_memory_range_end_message_id: lastNewMsg?.id ?? null,
        context_version: null,
        updated_at: new Date().toISOString(),
      };

      // 判断是否需要生成紧凑摘要
      const estimatedTokens = this.estimateTokens(allMessages);
      const newTokenCount = this.estimateTokens(newMessages);
      if (this.shouldCompactSession(estimatedTokens, newMessages.length, newTokenCount)) {
        const messagesToCompact = this.collectMessagesToCompact(allMessages, currentMessageId);
        if (messagesToCompact.length > 0) {
          const compactSummary = await memorySummarizer.summarizeCompactSummary(
            existingContext?.compact_summary ?? null,
            sessionMemory,
            messagesToCompact
          );
          contextToWrite.compact_summary = compactSummary;
          contextToWrite.compact_summary_base_message_id = allMessages[0]?.id ?? null;
          contextToWrite.compact_summary_range_end_message_id = lastNewMsg?.id ?? null;
        }
      }

      // 写入（带乐观锁）
      const expectedVersion =
        existingContext && existingContext.context_version != null
          ? existingContext.context_version
          : 0;
      contextToWrite.context_version = expectedVersion + 1;

      let success: boolean;
      if (existingContext) {
        success = assistantdbService.updateShortTermMemoryWithVersion(contextToWrite, expectedVersion);
      } else {
        success = assistantdbService.insertContext(contextToWrite);
      }

      if (!success) {
        logger.warn(
          `[ShortTermMemoryMaintenance] 会话 ${sessionId} 短期记忆写回失败（可能并发冲突）`
        );
      } else {
        logger.info(
          `[ShortTermMemoryMaintenance] 会话 ${sessionId} 短期记忆已更新（version=${expectedVersion + 1}）`
        );
      }
    } catch (err) {
      // 记忆维护失败不影响主流程
      logger.warn(`[ShortTermMemoryMaintenance] 会话 ${sessionId} 短期记忆维护失败:`, err);
    }
  }

  /**
   * 收集需要被紧凑摘要压缩的消息（排除当前消息及之后的消息）。
   */
  private collectMessagesToCompact(
    allMessages: AssistantMessageEntity[],
    currentMessageId: number
  ): AssistantMessageEntity[] {
    const result: AssistantMessageEntity[] = [];
    for (const msg of allMessages) {
      if (msg.id != null && currentMessageId != null && msg.id >= currentMessageId) {
        break;
      }
      result.push(msg);
    }
    return result;
  }
}

export const shortTermMemoryMaintenanceService = new ShortTermMemoryMaintenanceService();
