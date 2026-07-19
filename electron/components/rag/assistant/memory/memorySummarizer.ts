/**
 * Assistant 记忆摘要服务
 *
 * 参考 ArgusRAG 的 AssistantMemorySummarizer。
 * 调用 LLM 生成三种类型的摘要：
 *   - session memory：基于对话历史生成的长期记忆
 *   - compact summary：对会话的更精炼压缩
 *   - runtime context：结合紧凑摘要和当前问题的实时压缩
 *
 * 使用 llmdbService 获取已启用模型，通过 llmClient.chat() 同步调用。
 */

import { logger } from 'ee-core/log';
import { llmdbService } from '../../../../service/database/llmdb';
import { chat } from '../../llm/llmClient';
import type { ChatMessage } from '../../llm/llmClient';
import type { AssistantMessageEntity } from '../../../../service/database/assistantdb';
import {
  buildSessionMemoryPrompt,
  buildCompactSummaryPrompt,
  buildRuntimeCompactPrompt,
} from './promptTemplates';
import type { AssistantToolMode } from '../types';

const MODEL_NOT_CONFIGURED_MESSAGE = '未启用任何 LLM 模型，请先在设置中启用一个模型';

class MemorySummarizer {
  /**
   * 生成会话记忆摘要。
   *
   * @param existingSessionMemory 现有会话记忆，可能为 null
   * @param newMessages 新增消息列表
   * @param toolMode 当前工具模式
   * @param folderId 知识库文件夹 ID
   * @returns 更新后的会话记忆文本
   */
  async summarizeSessionMemory(
    existingSessionMemory: string | null,
    newMessages: AssistantMessageEntity[],
    toolMode: AssistantToolMode,
    folderId: number | null
  ): Promise<string> {
    const prompt = buildSessionMemoryPrompt(
      this.defaultText(existingSessionMemory),
      this.formatMessages(newMessages),
      toolMode,
      folderId == null ? 'NONE' : String(folderId)
    );
    return this.callForText(prompt, '生成 session memory 失败');
  }

  /**
   * 生成紧凑摘要。
   *
   * @param existingCompactSummary 现有紧凑摘要，可能为 null
   * @param sessionMemory 当前会话记忆
   * @param messagesToCompact 待压缩的消息列表
   * @returns 紧凑摘要文本
   */
  async summarizeCompactSummary(
    existingCompactSummary: string | null,
    sessionMemory: string | null,
    messagesToCompact: AssistantMessageEntity[]
  ): Promise<string> {
    const prompt = buildCompactSummaryPrompt(
      this.defaultText(existingCompactSummary),
      this.defaultText(sessionMemory),
      this.formatMessages(messagesToCompact)
    );
    return this.callForText(prompt, '生成 compact summary 失败');
  }

  /**
   * 生成运行时压缩上下文。
   *
   * @param compactSummary 紧凑摘要
   * @param sessionMemory 会话记忆
   * @param recentMessages 最近消息文本
   * @param currentQuestion 当前问题
   * @returns 运行时压缩后的上下文
   */
  async summarizeRuntimeContext(
    compactSummary: string | null,
    sessionMemory: string | null,
    recentMessages: string,
    currentQuestion: string
  ): Promise<string> {
    const prompt = buildRuntimeCompactPrompt(
      this.defaultText(compactSummary),
      this.defaultText(sessionMemory),
      this.defaultText(recentMessages),
      this.defaultText(currentQuestion)
    );
    return this.callForText(prompt, '生成运行时压缩上下文失败');
  }

  /**
   * 格式化消息列表为纯文本。
   * 格式：[角色] 内容
   */
  formatMessages(messages: AssistantMessageEntity[]): string {
    if (!messages || messages.length === 0) return 'NONE';
    const builder: string[] = [];
    for (const message of messages) {
      if (!message) continue;
      const content = this.normalize(message.content);
      if (content.length === 0) continue;
      builder.push(`[${message.role ?? 'UNKNOWN'}] ${content}`);
    }
    return builder.length === 0 ? 'NONE' : builder.join('\n');
  }

  /**
   * 调用 LLM 获取文本结果。
   * 失败时抛出业务异常。
   */
  private async callForText(prompt: string, errorMessage: string): Promise<string> {
    const model = llmdbService.getEnabledModel();
    if (!model) {
      throw new Error(MODEL_NOT_CONFIGURED_MESSAGE);
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: '你是一个专业的对话摘要助手，只输出摘要正文。' },
      { role: 'user', content: prompt },
    ];

    try {
      const result = await chat(model, messages);
      const normalized = this.normalize(result.content);
      if (normalized.length === 0) {
        throw new Error(`${errorMessage}，模型返回为空`);
      }
      logger.debug(`[MemorySummarizer] 摘要生成成功，长度=${normalized.length}`);
      return normalized;
    } catch (err) {
      if (err instanceof Error && err.message === MODEL_NOT_CONFIGURED_MESSAGE) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`${errorMessage}: ${msg}`);
    }
  }

  private normalize(content: string | null | undefined): string {
    if (!content) return '';
    return content.replace(/\r\n/g, '\n').trim();
  }

  private defaultText(value: string | null | undefined): string {
    const normalized = this.normalize(value);
    return normalized.length === 0 ? 'NONE' : normalized;
  }
}

export const memorySummarizer = new MemorySummarizer();
