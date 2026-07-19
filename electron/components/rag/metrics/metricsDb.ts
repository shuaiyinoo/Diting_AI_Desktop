/**
 * LLM 用量记录数据库层
 *
 * 参考 ArgusRAG 的 LlmUsageRecordEntity / LlmUsageRecordMapper。
 * 存储 llm_usage_records 表，记录每次 LLM 调用的用量和成本。
 *
 * 表结构：
 *   llm_usage_records
 *     id, module, endpoint, session_id,
 *     prompt_tokens, completion_tokens, total_tokens, is_estimated,
 *     cost_amount, cost_currency, latency_ms,
 *     success, error_message, model_name, folder_id, created_at
 */

import { BasedbService } from '../../../service/database/basedb';
import { logger } from 'ee-core/log';
import type { LlmEndpoint, LlmModule } from '../types';

/** LLM 用量记录实体 */
export interface LlmUsageRecordEntity {
  id?: number;
  module: LlmModule;
  endpoint: LlmEndpoint;
  sessionId: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  isEstimated: number; // 0 | 1
  costAmount: number;
  costCurrency: string;
  latencyMs: number;
  success: number; // 0 | 1
  errorMessage: string | null;
  modelName: string;
  folderId: number | null;
  createdAt: string;
}

/** 用量记录写入参数 */
export interface RecordUsageParams {
  module: LlmModule;
  endpoint: LlmEndpoint;
  sessionId?: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  isEstimated: boolean;
  costAmount: number;
  latencyMs: number;
  success: boolean;
  errorMessage?: string | null;
  modelName: string;
  folderId?: number | null;
}

class MetricsDbService extends BasedbService {
  private tableName = 'llm_usage_records';

  constructor() {
    super({ dbname: 'file-manager.db' });
  }

  async init(): Promise<void> {
    await this._init();
    const masterStmt = this.db.prepare('SELECT * FROM sqlite_master WHERE type=? AND name = ?');
    if (!masterStmt.get('table', this.tableName)) {
      this.db.exec(`
        CREATE TABLE ${this.tableName} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          module TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          session_id TEXT,
          prompt_tokens INTEGER NOT NULL DEFAULT 0,
          completion_tokens INTEGER NOT NULL DEFAULT 0,
          total_tokens INTEGER NOT NULL DEFAULT 0,
          is_estimated INTEGER NOT NULL DEFAULT 0,
          cost_amount REAL NOT NULL DEFAULT 0,
          cost_currency TEXT NOT NULL DEFAULT 'CNY',
          latency_ms INTEGER NOT NULL DEFAULT 0,
          success INTEGER NOT NULL DEFAULT 1,
          error_message TEXT,
          model_name TEXT NOT NULL,
          folder_id INTEGER,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON ${this.tableName} (created_at);`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_llm_usage_module ON ${this.tableName} (module);`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_llm_usage_folder ON ${this.tableName} (folder_id);`);
      logger.info('[MetricsDbService] 创建 llm_usage_records 表');
    }
  }

  /** 插入一条用量记录 */
  insert(params: RecordUsageParams): number | null {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO ${this.tableName}
          (module, endpoint, session_id, prompt_tokens, completion_tokens, total_tokens,
           is_estimated, cost_amount, cost_currency, latency_ms, success, error_message,
           model_name, folder_id)
        VALUES
          (@module, @endpoint, @sessionId, @promptTokens, @completionTokens, @totalTokens,
           @isEstimated, @costAmount, 'CNY', @latencyMs, @success, @errorMessage,
           @modelName, @folderId)
      `);
      const result = stmt.run({
        module: params.module,
        endpoint: params.endpoint,
        sessionId: params.sessionId ?? null,
        promptTokens: params.promptTokens,
        completionTokens: params.completionTokens,
        totalTokens: params.totalTokens,
        isEstimated: params.isEstimated ? 1 : 0,
        costAmount: params.costAmount,
        latencyMs: params.latencyMs,
        success: params.success ? 1 : 0,
        errorMessage: params.errorMessage ?? null,
        modelName: params.modelName,
        folderId: params.folderId ?? null,
      });
      return Number(result.lastInsertRowid);
    } catch (err) {
      logger.error('[MetricsDbService] 插入用量记录失败:', err);
      return null;
    }
  }

  /**
   * 查询用量统计（聚合）。
   *
   * @param since ISO 时间字符串，仅统计此时间之后的记录（null 表示全部）
   * @param folderId 限定文件夹（null 表示不限定）
   */
  selectUsageStats(since: string | null, folderId: number | null): UsageStatsRow {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (since) {
      conditions.push('created_at >= @since');
      params.since = since;
    }
    if (folderId != null) {
      conditions.push('folder_id = @folderId');
      params.folderId = folderId;
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const row = this.db.prepare(`
      SELECT
        COUNT(*) as totalRequests,
        COALESCE(SUM(prompt_tokens), 0) as promptTokens,
        COALESCE(SUM(completion_tokens), 0) as completionTokens,
        COALESCE(SUM(total_tokens), 0) as totalTokens,
        COALESCE(SUM(cost_amount), 0) as totalCost,
        COALESCE(AVG(latency_ms), 0) as avgLatencyMs,
        ROUND(100.0 * SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) / MAX(COUNT(*), 1), 2) as successRate
      FROM ${this.tableName}
      ${whereClause}
    `).get(params) as UsageStatsRow;

    return row ?? {
      totalRequests: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      avgLatencyMs: 0,
      successRate: 0,
    };
  }

  /**
   * 查询每日趋势数据。
   *
   * @param since ISO 时间字符串
   * @param module 限定模块（null 表示全部）
   */
  selectDailyTrend(since: string | null, module: string | null): DailyStatsRow[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (since) {
      conditions.push('created_at >= @since');
      params.since = since;
    }
    if (module) {
      conditions.push('module = @module');
      params.module = module;
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return this.db.prepare(`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as requests,
        COALESCE(SUM(total_tokens), 0) as totalTokens,
        COALESCE(SUM(cost_amount), 0) as cost
      FROM ${this.tableName}
      ${whereClause}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `).all(params) as DailyStatsRow[];
  }

  /**
   * 查询模块用量分布。
   */
  selectModuleDistribution(since: string | null): ModuleDistRow[] {
    const whereClause = since ? `WHERE created_at >= @since` : '';
    const params = since ? { since } : {};
    return this.db.prepare(`
      SELECT
        module,
        COUNT(*) as requests,
        COALESCE(SUM(total_tokens), 0) as totalTokens,
        COALESCE(SUM(cost_amount), 0) as cost
      FROM ${this.tableName}
      ${whereClause}
      GROUP BY module
      ORDER BY requests DESC
    `).all(params) as ModuleDistRow[];
  }
}

export interface UsageStatsRow {
  totalRequests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalCost: number;
  avgLatencyMs: number;
  successRate: number;
}

export interface DailyStatsRow {
  date: string;
  requests: number;
  totalTokens: number;
  cost: number;
}

export interface ModuleDistRow {
  module: string;
  requests: number;
  totalTokens: number;
  cost: number;
}

export const metricsDbService = new MetricsDbService();
