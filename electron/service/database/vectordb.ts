import { BasedbService } from './basedb';
import { logger } from 'ee-core/log';

/**
 * 向量模型配置数据库 service
 *
 * 管理本地向量嵌入模型的选择状态。
 * 数据存储在 SQLite 数据库 file-manager.db 的 vector_config 表中（键值对存储）。
 */

/** 向量模型配置（键值对存储） */
export interface VectorConfig {
  /** 已选择的向量模型 ID（如 multilingual 或 custom_xxx） */
  selected_model: string | null;
  /** 已选择模型的向量维度 */
  selected_dimensions: number | null;
}

class VectordbService extends BasedbService {
  private configTable = 'vector_config';

  constructor() {
    super({ dbname: 'file-manager.db' });
  }

  async init(): Promise<void> {
    await this._init();

    const masterStmt = this.db.prepare('SELECT * FROM sqlite_master WHERE type=? AND name = ?');
    if (!masterStmt.get('table', this.configTable)) {
      this.db.exec(`
        CREATE TABLE ${this.configTable}
        (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);
      logger.info('[VectordbService] 创建 vector_config 表');
    }
  }

  /** 获取向量模型配置 */
  getConfig(): VectorConfig {
    const rows = this.db.prepare(
      `SELECT * FROM ${this.configTable} WHERE key IN ('selected_model', 'selected_dimensions')`
    ).all() as Array<{ key: string; value: string | null }>;

    const map = new Map<string, string | null>();
    for (const row of rows) {
      map.set(row.key, row.value);
    }

    return {
      selected_model: map.get('selected_model') ?? null,
      selected_dimensions: map.get('selected_dimensions') ? parseInt(map.get('selected_dimensions')!, 10) : null,
    };
  }

  /** 设置已选择的向量模型（同时设置维度） */
  setSelectedModel(modelId: string | null, dimensions: number | null = null): void {
    const insertStmt = this.db.prepare(`
      INSERT INTO ${this.configTable} (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);

    const tx = this.db.transaction(() => {
      insertStmt.run('selected_model', modelId);
      insertStmt.run('selected_dimensions', dimensions !== null ? String(dimensions) : null);
    });
    tx();

    logger.info(`[VectordbService] 设置向量模型选择: ${modelId ?? '(无)'}, dimensions=${dimensions ?? '-'}`);
  }
}

const vectordbService = new VectordbService();
export { vectordbService };
