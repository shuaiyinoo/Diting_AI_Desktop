import { BasedbService } from './basedb';
import { logger } from 'ee-core/log';

/**
 * LLM 语义模型配置数据库 service
 *
 * 管理用户配置的大语言模型（LLM）列表，支持：
 *   - 多模型配置（每个模型含 provider/baseUrl/apiKey/modelName）
 *   - 单一启用模型（同一时间只能启用一个模型）
 *   - 增删改查
 *
 * 数据存储在 SQLite 数据库 file-manager.db 的 llm_model 表中。
 */

/** 模型提供商类型 */
export type LlmProvider =
  | 'openai'      // OpenAI 兼容接口（含 Azure、deepseek、moonshot、qwen 等）
  | 'anthropic'   // Anthropic Claude
  | 'google'      // Google Gemini
  | 'custom';     // 自定义

/** LLM 模型记录 */
export interface LlmModelRecord {
  id: number;
  /** 模型别名（用户自定义名称，用于显示） */
  name: string;
  /** 提供商类型 */
  provider: LlmProvider;
  /** API 基础地址（如 https://api.openai.com/v1） */
  base_url: string;
  /** API 密钥 */
  api_key: string;
  /** 模型名称（如 gpt-4o、deepseek-chat、claude-3-5-sonnet-20241022） */
  model_name: string;
  /** 是否启用（1=启用，0=禁用；同一时间只能有一个启用） */
  enabled: number;
  /** 温度参数（0-2，默认 0.7） */
  temperature: number;
  /** 最大输出 token 数（默认 4096） */
  max_tokens: number;
  /** 备注 */
  remark: string | null;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at: string;
}

/** 创建/更新模型的参数 */
export interface UpsertLlmModelParams {
  name: string;
  provider: LlmProvider;
  base_url: string;
  api_key: string;
  model_name: string;
  temperature?: number;
  max_tokens?: number;
  remark?: string;
}

class LlmdbService extends BasedbService {
  private tableName = 'llm_model';

  constructor() {
    super({ dbname: 'file-manager.db' });
  }

  async init(): Promise<void> {
    await this._init();

    const masterStmt = this.db.prepare('SELECT * FROM sqlite_master WHERE type=? AND name = ?');
    if (!masterStmt.get('table', this.tableName)) {
      this.db.exec(`
        CREATE TABLE ${this.tableName}
        (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          provider TEXT NOT NULL DEFAULT 'openai',
          base_url TEXT NOT NULL,
          api_key TEXT NOT NULL DEFAULT '',
          model_name TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 0,
          temperature REAL NOT NULL DEFAULT 0.7,
          max_tokens INTEGER NOT NULL DEFAULT 4096,
          remark TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);
      logger.info('[LlmdbService] 创建 llm_model 表');
    }

    // 确保启用唯一约束：如果有多条 enabled=1，只保留最新的一条
    const enabledCount = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM ${this.tableName} WHERE enabled = 1`
    ).get() as { cnt: number };
    if (enabledCount.cnt > 1) {
      this.db.exec(
        `UPDATE ${this.tableName} SET enabled = 0 WHERE id NOT IN (
          SELECT id FROM ${this.tableName} WHERE enabled = 1 ORDER BY updated_at DESC LIMIT 1
        )`
      );
      logger.warn(`[LlmdbService] 检测到 ${enabledCount.cnt} 个启用模型，已自动保留最新的一条`);
    }
  }

  /** 获取所有模型列表 */
  getAllModels(): LlmModelRecord[] {
    return this.db.prepare(
      `SELECT * FROM ${this.tableName} ORDER BY enabled DESC, updated_at DESC`
    ).all() as LlmModelRecord[];
  }

  /** 获取当前启用的模型 */
  getEnabledModel(): LlmModelRecord | null {
    return this.db.prepare(
      `SELECT * FROM ${this.tableName} WHERE enabled = 1 LIMIT 1`
    ).get() as LlmModelRecord | null;
  }

  /** 根据 ID 获取模型 */
  getModelById(id: number): LlmModelRecord | null {
    return this.db.prepare(
      `SELECT * FROM ${this.tableName} WHERE id = ?`
    ).get(id) as LlmModelRecord | null;
  }

  /** 添加模型 */
  addModel(params: UpsertLlmModelParams): number {
    const { name, provider, base_url, api_key, model_name, temperature, max_tokens, remark } = params;
    const stmt = this.db.prepare(`
      INSERT INTO ${this.tableName}
        (name, provider, base_url, api_key, model_name, enabled, temperature, max_tokens, remark)
      VALUES
        (@name, @provider, @base_url, @api_key, @model_name, 0, @temperature, @max_tokens, @remark)
    `);
    const result = stmt.run({
      name,
      provider,
      base_url,
      api_key,
      model_name,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 4096,
      remark: remark ?? null,
    });
    logger.info(`[LlmdbService] 添加模型: ${name} (id=${result.lastInsertRowid})`);
    return Number(result.lastInsertRowid);
  }

  /** 更新模型 */
  updateModel(id: number, params: Partial<UpsertLlmModelParams>): boolean {
    const fields: string[] = [];
    const values: Record<string, unknown> = { id };

    const allowedFields: (keyof UpsertLlmModelParams)[] = [
      'name', 'provider', 'base_url', 'api_key', 'model_name', 'temperature', 'max_tokens', 'remark'
    ];
    for (const field of allowedFields) {
      if (params[field] !== undefined) {
        fields.push(`${field} = @${field}`);
        values[field] = params[field];
      }
    }

    if (fields.length === 0) return false;

    fields.push(`updated_at = datetime('now')`);
    const stmt = this.db.prepare(
      `UPDATE ${this.tableName} SET ${fields.join(', ')} WHERE id = @id`
    );
    const result = stmt.run(values);
    return result.changes > 0;
  }

  /** 删除模型 */
  deleteModel(id: number): boolean {
    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`);
    const result = stmt.run(id);
    logger.info(`[LlmdbService] 删除模型 id=${id}, changes=${result.changes}`);
    return result.changes > 0;
  }

  /**
   * 启用指定模型（同时禁用其他所有模型，确保唯一启用）
   */
  enableModel(id: number): boolean {
    const model = this.getModelById(id);
    if (!model) return false;

    const tx = this.db.transaction(() => {
      // 先禁用所有
      this.db.prepare(`UPDATE ${this.tableName} SET enabled = 0`).run();
      // 再启用指定的
      this.db.prepare(
        `UPDATE ${this.tableName} SET enabled = 1, updated_at = datetime('now') WHERE id = ?`
      ).run(id);
    });
    tx();
    logger.info(`[LlmdbService] 启用模型: ${model.name} (id=${id})`);
    return true;
  }

  /** 禁用指定模型 */
  disableModel(id: number): boolean {
    const result = this.db.prepare(
      `UPDATE ${this.tableName} SET enabled = 0, updated_at = datetime('now') WHERE id = ?`
    ).run(id);
    return result.changes > 0;
  }

  /**
   * 测试模型连通性（简单发一个 ping 请求）
   * 返回 { success, message, latencyMs }
   */
  async testModel(id: number): Promise<{ success: boolean; message: string; latencyMs: number }> {
    const model = this.getModelById(id);
    if (!model) {
      return { success: false, message: '模型不存在', latencyMs: 0 };
    }

    const t0 = Date.now();
    try {
      // 使用 fetch 发送一个简单的 chat completion 请求
      const url = model.base_url.replace(/\/$/, '') + '/chat/completions';
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${model.api_key}`,
        },
        body: JSON.stringify({
          model: model.model_name,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(15000),
      });

      const latencyMs = Date.now() - t0;

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        return {
          success: false,
          message: `HTTP ${response.status}: ${errText.substring(0, 200)}`,
          latencyMs,
        };
      }

      const data = await response.json() as any;
      if (data.choices && data.choices.length > 0) {
        return {
          success: true,
          message: `连接成功，模型回复: ${data.choices[0].message?.content?.substring(0, 50) || '(空)'}`,
          latencyMs,
        };
      }
      return {
        success: false,
        message: '响应格式异常：未返回 choices',
        latencyMs,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `连接失败: ${error?.message || String(error)}`,
        latencyMs: Date.now() - t0,
      };
    }
  }
}

const llmdbService = new LlmdbService();
export { llmdbService };
