/**
 * QA 问答记录持久化数据库
 *
 * 参考 ArgusRAG 的 QaRecordPersistenceService。
 * 存储 qa_records 表，保存每次问答的完整快照（问题、回答、引用、用量）。
 *
 * 表结构：
 *   qa_records
 *     id, folder_id, question, answer, answered,
 *     reason_code, reason_message, evidence_level, citation_count,
 *     prompt_tokens, completion_tokens, total_tokens, is_estimated,
 *     latency_ms, model_name, endpoint, success, error_message,
 *     citations_json, created_at
 */

import { BasedbService } from './basedb';
import { logger } from 'ee-core/log';
import type {
  AskQuestionResponse,
  Citation,
  EvidenceLevel,
  LlmUsageInfo,
} from '../../components/rag/types';

/** QA 记录保存参数 */
export interface SaveQaRecordParams {
  folderId: number;
  question: string;
  endpoint: string;
  modelName: string;
  response: AskQuestionResponse;
  evidenceLevel: EvidenceLevel;
  usage: LlmUsageInfo;
  citations: Citation[];
  success: boolean;
  errorMessage?: string | null;
}

/** QA 记录实体 */
export interface QaRecordEntity {
  id: number;
  folder_id: number;
  question: string;
  answer: string | null;
  answered: number;
  reason_code: string | null;
  reason_message: string | null;
  evidence_level: string | null;
  citation_count: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  is_estimated: number;
  latency_ms: number;
  model_name: string;
  endpoint: string;
  success: number;
  error_message: string | null;
  citations_json: string | null;
  created_at: string;
}

class QadbService extends BasedbService {
  private tableName = 'qa_records';

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
          folder_id INTEGER NOT NULL,
          question TEXT NOT NULL,
          answer TEXT,
          answered INTEGER NOT NULL DEFAULT 0,
          reason_code TEXT,
          reason_message TEXT,
          evidence_level TEXT,
          citation_count INTEGER NOT NULL DEFAULT 0,
          prompt_tokens INTEGER NOT NULL DEFAULT 0,
          completion_tokens INTEGER NOT NULL DEFAULT 0,
          total_tokens INTEGER NOT NULL DEFAULT 0,
          is_estimated INTEGER NOT NULL DEFAULT 0,
          latency_ms INTEGER NOT NULL DEFAULT 0,
          model_name TEXT NOT NULL,
          endpoint TEXT NOT NULL,
          success INTEGER NOT NULL DEFAULT 1,
          error_message TEXT,
          citations_json TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_qa_records_folder ON ${this.tableName} (folder_id);`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_qa_records_created ON ${this.tableName} (created_at);`);
      logger.info('[QadbService] 创建 qa_records 表');
    }
  }

  /**
   * 保存一条 QA 问答记录。
   * 持久化失败只记录日志并返回 null，避免影响用户已得到的问答结果。
   */
  saveCompleted(params: SaveQaRecordParams): number | null {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO ${this.tableName}
          (folder_id, question, answer, answered, reason_code, reason_message,
           evidence_level, citation_count, prompt_tokens, completion_tokens, total_tokens,
           is_estimated, latency_ms, model_name, endpoint, success, error_message, citations_json)
        VALUES
          (@folderId, @question, @answer, @answered, @reasonCode, @reasonMessage,
           @evidenceLevel, @citationCount, @promptTokens, @completionTokens, @totalTokens,
           @isEstimated, @latencyMs, @modelName, @endpoint, @success, @errorMessage, @citationsJson)
      `);
      const result = stmt.run({
        folderId: params.folderId,
        question: params.question,
        answer: params.response.answer ?? null,
        answered: params.response.answered ? 1 : 0,
        reasonCode: params.response.reasonCode ?? null,
        reasonMessage: params.response.reasonMessage ?? null,
        evidenceLevel: params.evidenceLevel,
        citationCount: params.citations.length,
        promptTokens: params.usage.promptTokens,
        completionTokens: params.usage.completionTokens,
        totalTokens: params.usage.totalTokens,
        isEstimated: params.usage.estimated ? 1 : 0,
        latencyMs: params.usage.latencyMs,
        modelName: params.modelName,
        endpoint: params.endpoint,
        success: params.success ? 1 : 0,
        errorMessage: params.errorMessage ?? null,
        citationsJson: JSON.stringify(params.citations),
      });
      return Number(result.lastInsertRowid);
    } catch (err) {
      logger.warn('[QadbService] QA 记录保存失败:', err);
      return null;
    }
  }

  /** 获取 QA 记录列表（分页） */
  getList(folderId: number | null, limit: number = 20, offset: number = 0): QaRecordEntity[] {
    if (folderId != null) {
      return this.db.prepare(
        `SELECT * FROM ${this.tableName} WHERE folder_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`
      ).all(folderId, limit, offset) as QaRecordEntity[];
    }
    return this.db.prepare(
      `SELECT * FROM ${this.tableName} ORDER BY id DESC LIMIT ? OFFSET ?`
    ).all(limit, offset) as QaRecordEntity[];
  }

  /** 根据 ID 获取 QA 记录 */
  getById(id: number): QaRecordEntity | null {
    return this.db.prepare(
      `SELECT * FROM ${this.tableName} WHERE id = ?`
    ).get(id) as QaRecordEntity | null;
  }

  /** 获取记录总数 */
  getCount(folderId: number | null = null): number {
    if (folderId != null) {
      const row = this.db.prepare(
        `SELECT COUNT(*) as cnt FROM ${this.tableName} WHERE folder_id = ?`
      ).get(folderId) as { cnt: number };
      return row?.cnt ?? 0;
    }
    const row = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM ${this.tableName}`
    ).get() as { cnt: number };
    return row?.cnt ?? 0;
  }

  /** 删除指定 ID 的 QA 记录 */
  deleteById(id: number): boolean {
    const result = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`).run(id);
    return result.changes > 0;
  }

  /** 清空指定文件夹的 QA 记录 */
  deleteByFolderId(folderId: number): number {
    const result = this.db.prepare(`DELETE FROM ${this.tableName} WHERE folder_id = ?`).run(folderId);
    return result.changes;
  }
}

export const qadbService = new QadbService();
