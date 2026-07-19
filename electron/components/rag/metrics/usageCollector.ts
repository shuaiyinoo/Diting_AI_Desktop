/**
 * LLM 用量异步采集器
 *
 * 参考 ArgusRAG 的 LlmUsageCollectorImpl。
 * 设计要点：
 *   - 异步记录，不阻塞调用方主流程
 *   - 记录失败只记日志，不影响业务
 *   - 通过 setImmediate 实现非阻塞（Node.js 单线程，避免微任务阻塞）
 */

import { logger } from 'ee-core/log';
import { metricsDbService } from './metricsDb';
import { calculateCost } from './costCalculator';
import type { LlmEndpoint, LlmModule, LlmUsageInfo } from '../types';

/** 用量记录参数 */
export interface UsageRecordParams {
  module: LlmModule;
  endpoint: LlmEndpoint;
  sessionId?: string | null;
  folderId?: number | null;
  modelName: string;
  usage: LlmUsageInfo;
  success: boolean;
  errorMessage?: string | null;
}

/**
 * 异步记录一次 LLM 调用的用量信息。
 *
 * 此方法立即返回，实际写入通过 setImmediate 异步执行，
 * 不会阻塞调用方的主流程。
 */
export function recordUsage(params: UsageRecordParams): void {
  setImmediate(() => {
    try {
      const cost = calculateCost(
        params.modelName,
        params.usage.promptTokens,
        params.usage.completionTokens
      );
      metricsDbService.insert({
        module: params.module,
        endpoint: params.endpoint,
        sessionId: params.sessionId ?? null,
        promptTokens: params.usage.promptTokens,
        completionTokens: params.usage.completionTokens,
        totalTokens: params.usage.totalTokens,
        isEstimated: params.usage.estimated,
        costAmount: cost,
        latencyMs: params.usage.latencyMs,
        success: params.success,
        errorMessage: params.errorMessage ?? null,
        modelName: params.modelName,
        folderId: params.folderId ?? null,
      });
    } catch (err) {
      logger.warn('[UsageCollector] 用量记录失败:', err);
    }
  });
}
