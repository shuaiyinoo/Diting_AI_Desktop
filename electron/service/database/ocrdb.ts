import { BasedbService } from './basedb';
import { logger } from 'ee-core/log';

/**
 * OCR 模型配置数据库 service
 *
 * 管理本地 OCR 模型选择状态。
 * 数据存储在 SQLite 数据库 file-manager.db 的 ocr_config 表中（键值对存储）。
 */

/** OCR 模型配置（键值对存储） */
export interface OcrConfig {
  /** 已选择的 OCR 模型 ID（如 v6-medium） */
  selected_model: string | null;
}

class OcrdbService extends BasedbService {
  private configTable = 'ocr_config';

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
      logger.info('[OcrdbService] 创建 ocr_config 表');
    }
  }

  /** 获取 OCR 模型配置 */
  getConfig(): OcrConfig {
    const row = this.db.prepare(
      `SELECT * FROM ${this.configTable} WHERE key = 'selected_model'`
    ).get() as { key: string; value: string | null } | undefined;

    return {
      selected_model: row?.value ?? null,
    };
  }

  /** 设置已选择的 OCR 模型 */
  setSelectedModel(modelId: string | null): void {
    const stmt = this.db.prepare(`
      INSERT INTO ${this.configTable} (key, value, updated_at)
      VALUES ('selected_model', ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);
    stmt.run(modelId);
    logger.info(`[OcrdbService] 设置 OCR 模型选择: ${modelId ?? '(无)'}`);
  }
}

const ocrdbService = new OcrdbService();
export { ocrdbService };
