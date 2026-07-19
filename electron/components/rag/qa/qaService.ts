/**
 * QA 知识问答编排服务
 *
 * 参考 ArgusRAG 的 QaService + QaChatService。
 * 负责协调完整的 RAG 问答流程：
 *   1. 混合检索证据（向量 + 关键词 RRF 融合）
 *   2. 证据充分度评估
 *   3. 构造 Prompt（System + User）
 *   4. 调用大模型生成结构化回答
 *   5. 解析回答（JSON 结构化 → 原文回退）
 *   6. 组装引用来源
 *   7. 记录 LLM 用量（异步，不阻塞）
 *   8. 持久化 QA 记录
 *
 * 支持两种模式：
 *   - ask()：同步问答，返回完整回答
 *   - askStream()：流式问答，逐 token 回调
 */

import { logger } from 'ee-core/log';
import { hybridRetrievalService } from '../retrieval/hybridRetrieval';
import { llmdbService } from '../../../service/database/llmdb';
import { chat, chatStream } from '../llm/llmClient';
import type { ChatMessage } from '../llm/llmClient';
import {
  buildStreamChatMessages,
  buildChatMessages,
  parseAnswer,
  INSUFFICIENT_EVIDENCE_CODE,
  INSUFFICIENT_EVIDENCE_MESSAGE,
  ANSWER_FORMAT_ERROR_CODE,
  ANSWER_FORMAT_ERROR_MESSAGE,
} from '../llm/promptBuilder';
import { assembleCitations, assembleEvidenceOverview } from './citationAssembler';
import { recordUsage } from '../metrics/usageCollector';
import { qadbService } from '../../../service/database/qadb';
import type {
  AskQuestionResponse,
  Citation,
  EvidenceOverview,
  LlmUsageInfo,
  RetrievedEvidenceBundle,
} from '../types';
import { EvidenceLevel } from '../types';

/** 同步问答结果 */
export interface AskResult {
  response: AskQuestionResponse;
  usage: LlmUsageInfo;
  evidenceLevel: EvidenceLevel;
  citations: Citation[];
  documents: RetrievedEvidenceBundle['documents'];
}

/** 流式问答上下文 */
export interface StreamContext {
  /** 启动流式生成（调用后开始推送 token） */
  start: (callbacks: {
    onToken: (token: string) => void;
    onComplete: (fullAnswer: string, usage: LlmUsageInfo) => void;
    onError: (error: Error) => void;
  }) => Promise<void>;
  /** 检索到的证据文档（流开始前已就绪） */
  documents: RetrievedEvidenceBundle['documents'];
  evidenceLevel: EvidenceLevel;
  citations: Citation[];
}

const MODEL_NOT_CONFIGURED_MESSAGE = '未启用任何 LLM 模型，请先在设置中启用一个模型';

class QaService {
  /**
   * 同步知识问答。
   *
   * 流程：检索证据 → 评估证据 → 构造 Prompt → 调用 LLM → 解析回答 → 组装引用 → 记录用量。
   */
  async ask(folderId: number, question: string): Promise<AskResult> {
    const startNano = process.hrtime.bigint();
    logger.info(`[QaService] 同步问答开始: folderId=${folderId}, questionLength=${question?.length ?? 0}`);

    // 1. 检索证据
    const evidenceBundle = await hybridRetrievalService.retrieve(folderId, question, 5);
    const documents = evidenceBundle.documents;
    logger.info(
      `[QaService] 证据检索完成: folderId=${folderId}, evidenceCount=${documents.length}, evidenceLevel=${evidenceBundle.evidenceLevel}`
    );

    // 2. 无证据 → 直接拒答
    if (documents.length === 0) {
      const elapsedMs = Number(process.hrtime.bigint() - startNano) / 1_000_000;
      const usage: LlmUsageInfo = { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimated: false, latencyMs: elapsedMs };
      const response: AskQuestionResponse = {
        answered: false,
        answer: null,
        reasonCode: INSUFFICIENT_EVIDENCE_CODE,
        reasonMessage: INSUFFICIENT_EVIDENCE_MESSAGE,
        citations: [],
        evidenceOverview: null,
        recordId: null,
      };
      // 持久化拒答记录
      const recordId = qadbService.saveCompleted({
        folderId, question, endpoint: 'qa/ask', modelName: '(none)',
        response, evidenceLevel: EvidenceLevel.NONE, usage,
        citations: [], success: true,
      });
      return { response: { ...response, recordId }, usage, evidenceLevel: EvidenceLevel.NONE, citations: [], documents };
    }

    // 3. 获取已启用的 LLM 模型
    const model = llmdbService.getEnabledModel();
    if (!model) {
      throw new Error(MODEL_NOT_CONFIGURED_MESSAGE);
    }

    // 4. 构造 Prompt 并调用 LLM
    const messages = buildChatMessages(question, evidenceBundle);
    let fullAnswer = '';
    let usage: LlmUsageInfo;
    let parseSuccess = false;
    let errorMessage: string | null = null;

    try {
      const result = await chat(model, messages);
      fullAnswer = result.content;
      usage = result.usage;

      // 5. 解析结构化回答
      const output = parseAnswer(result.content);
      if (output && output.answered) {
        parseSuccess = true;
        // 弱证据时不返回引用，避免误导用户
        const citations = evidenceBundle.evidenceLevel === EvidenceLevel.WEAK
          ? []
          : assembleCitations(documents);
        const evidenceOverview = assembleEvidenceOverview(documents);
        const response: AskQuestionResponse = {
          answered: true,
          answer: output.answer.trim(),
          reasonCode: null,
          reasonMessage: null,
          citations,
          evidenceOverview,
          recordId: null,
        };
        // 记录用量（异步）
        recordUsage({
          module: 'QA', endpoint: 'qa/ask', folderId, modelName: model.model_name,
          usage, success: true,
        });
        // 持久化 QA 记录
        const recordId = qadbService.saveCompleted({
          folderId, question, endpoint: 'qa/ask', modelName: model.model_name,
          response, evidenceLevel: evidenceBundle.evidenceLevel, usage,
          citations, success: true,
        });
        const elapsedMs = Number(process.hrtime.bigint() - startNano) / 1_000_000;
        logger.info(
          `[QaService] 同步问答完成: folderId=${folderId}, answerLength=${output.answer.length}, citationCount=${citations.length}, elapsedMs=${elapsedMs.toFixed(1)}`
        );
        return { response: { ...response, recordId }, usage, evidenceLevel: evidenceBundle.evidenceLevel, citations, documents };
      } else if (output && !output.answered) {
        // 模型主动拒答
        parseSuccess = true;
        const evidenceOverview = assembleEvidenceOverview(documents);
        const response: AskQuestionResponse = {
          answered: false,
          answer: null,
          reasonCode: output.reasonCode ?? INSUFFICIENT_EVIDENCE_CODE,
          reasonMessage: output.reasonMessage ?? INSUFFICIENT_EVIDENCE_MESSAGE,
          citations: [],
          evidenceOverview,
          recordId: null,
        };
        recordUsage({
          module: 'QA', endpoint: 'qa/ask', folderId, modelName: model.model_name,
          usage, success: true,
        });
        const recordId = qadbService.saveCompleted({
          folderId, question, endpoint: 'qa/ask', modelName: model.model_name,
          response, evidenceLevel: evidenceBundle.evidenceLevel, usage,
          citations: [], success: true,
        });
        return { response: { ...response, recordId }, usage, evidenceLevel: evidenceBundle.evidenceLevel, citations: [], documents };
      }
      // 解析失败 → 格式错误
      errorMessage = '解析模型返回的 JSON 失败';
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[QaService] 同步问答 LLM 调用失败: folderId=${folderId}`, err);
      usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimated: false, latencyMs: 0 };
    }

    // 6. 解析或调用失败 → 返回格式错误响应
    const evidenceOverview = assembleEvidenceOverview(documents);
    const response: AskQuestionResponse = {
      answered: false,
      answer: null,
      reasonCode: ANSWER_FORMAT_ERROR_CODE,
      reasonMessage: errorMessage ?? ANSWER_FORMAT_ERROR_MESSAGE,
      citations: [],
      evidenceOverview,
      recordId: null,
    };
    recordUsage({
      module: 'QA', endpoint: 'qa/ask', folderId, modelName: model.model_name,
      usage, success: false, errorMessage,
    });
    const recordId = qadbService.saveCompleted({
      folderId, question, endpoint: 'qa/ask', modelName: model.model_name,
      response, evidenceLevel: evidenceBundle.evidenceLevel, usage,
      citations: [], success: false, errorMessage,
    });
    return { response: { ...response, recordId }, usage, evidenceLevel: evidenceBundle.evidenceLevel, citations: [], documents };
  }

  /**
   * 流式知识问答。
   *
   * 流程：
   *   1. 先同步完成检索（获取证据文档和引用）
   *   2. 返回 StreamContext（含证据信息 + start 方法）
   *   3. 调用方调用 start() 后才开始流式生成 token
   *   4. 流完成后组装引用并记录用量
   */
  async askStream(folderId: number, question: string): Promise<StreamContext> {
    const startNano = process.hrtime.bigint();
    logger.info(`[QaService] 流式问答开始: folderId=${folderId}, questionLength=${question?.length ?? 0}`);

    // 1. 检索证据
    const evidenceBundle = await hybridRetrievalService.retrieve(folderId, question, 5);
    const documents = evidenceBundle.documents;
    logger.info(
      `[QaService] 流式证据检索完成: folderId=${folderId}, evidenceCount=${documents.length}, evidenceLevel=${evidenceBundle.evidenceLevel}`
    );

    // 2. 预组装引用（弱证据时不返回引用，避免误导用户）
    const citations = evidenceBundle.evidenceLevel === EvidenceLevel.WEAK
      ? []
      : assembleCitations(documents);

    // 3. 无证据 → 返回特殊 start（直接回调错误）
    if (documents.length === 0) {
      const elapsedMs = Number(process.hrtime.bigint() - startNano) / 1_000_000;
      const usage: LlmUsageInfo = { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimated: false, latencyMs: elapsedMs };
      const response: AskQuestionResponse = {
        answered: false,
        answer: null,
        reasonCode: INSUFFICIENT_EVIDENCE_CODE,
        reasonMessage: INSUFFICIENT_EVIDENCE_MESSAGE,
        citations: [],
        evidenceOverview: null,
        recordId: null,
      };
      const recordId = qadbService.saveCompleted({
        folderId, question, endpoint: 'qa/stream-ask', modelName: '(none)',
        response, evidenceLevel: EvidenceLevel.NONE, usage,
        citations: [], success: true,
      });
      return {
        documents,
        evidenceLevel: EvidenceLevel.NONE,
        citations: [],
        start: async (callbacks) => {
          callbacks.onComplete('', usage);
        },
      };
    }

    // 4. 获取已启用的 LLM 模型
    const model = llmdbService.getEnabledModel();
    if (!model) {
      throw new Error(MODEL_NOT_CONFIGURED_MESSAGE);
    }

    // 5. 构造流式 Prompt
    const messages: ChatMessage[] = buildStreamChatMessages(question, evidenceBundle);

    // 6. 返回 StreamContext
    return {
      documents,
      evidenceLevel: evidenceBundle.evidenceLevel,
      citations,
      start: async (callbacks) => {
        const answerBuilder: string[] = [];
        let usageRef: LlmUsageInfo = { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimated: false, latencyMs: 0 };

        await chatStream(model, messages, {
          onToken: (token) => {
            answerBuilder.push(token);
            callbacks.onToken(token);
          },
          onComplete: (usage) => {
            usageRef = usage;
            const fullAnswer = answerBuilder.join('');
            const elapsedMs = Number(process.hrtime.bigint() - startNano) / 1_000_000;
            logger.info(
              `[QaService] 流式问答完成: folderId=${folderId}, answerLength=${fullAnswer.length}, elapsedMs=${elapsedMs.toFixed(1)}`
            );

            // 记录用量（异步）
            recordUsage({
              module: 'QA', endpoint: 'qa/stream-ask', folderId, modelName: model.model_name,
              usage, success: true,
            });

            // 持久化 QA 记录
            const response: AskQuestionResponse = {
              answered: true,
              answer: fullAnswer,
              reasonCode: null,
              reasonMessage: null,
              citations,
              evidenceOverview: assembleEvidenceOverview(documents),
              recordId: null,
            };
            const recordId = qadbService.saveCompleted({
              folderId, question, endpoint: 'qa/stream-ask', modelName: model.model_name,
              response, evidenceLevel: evidenceBundle.evidenceLevel, usage,
              citations, success: true,
            });
            callbacks.onComplete(fullAnswer, { ...usage, latencyMs: elapsedMs });
          },
          onError: (error) => {
            const errorMessage = error.message || String(error);
            logger.error(`[QaService] 流式问答异常: folderId=${folderId}`, error);
            recordUsage({
              module: 'QA', endpoint: 'qa/stream-ask', folderId, modelName: model.model_name,
              usage: usageRef, success: false, errorMessage,
            });
            callbacks.onError(error);
          },
        });
      },
    };
  }
}

export const qaService = new QaService();
