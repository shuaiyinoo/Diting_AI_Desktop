import { BasedbService } from './basedb';
import { logger } from 'ee-core/log';
import { encryptSecret } from '../bridge/bridge-config';

/**
 * 语音模型配置数据库 service
 *
 * 管理远程语音模型配置（同 LLM 模式）和本地 Whisper 模型选择状态。
 * 数据存储在 SQLite 数据库 file-manager.db 的 voice_model 表和 voice_config 表中。
 */

/** 远程语音模型提供商类型 */
export type VoiceProvider =
  | 'openai'      // OpenAI 兼容接口（Whisper API）
  | 'anthropic'   // Anthropic Claude
  | 'google'      // Google Gemini
  | 'volc'        // 火山引擎语音识别
  | 'custom';     // 自定义

/** 火山引擎语音识别 Resource ID 选项 */
export const VOLC_RESOURCE_IDS = [
  'volc.seedasr.sauc.duration',
  'volc.seedasr.sauc.concurrent',
  'volc.bigasr.sauc.duration',
  'volc.bigasr.sauc.concurrent',
] as const;

/** 火山引擎 Resource ID 默认值 */
export const VOLC_DEFAULT_RESOURCE_ID = 'volc.seedasr.sauc.duration';

/** 火山引擎语音识别 WebSocket 地址 */
export const VOLC_DEFAULT_BASE_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async';

/** 远程语音模型记录 */
export interface VoiceModelRecord {
  id: number;
  /** 模型别名 */
  name: string;
  /** 提供商类型 */
  provider: VoiceProvider;
  /** API 基础地址 */
  base_url: string;
  /** API 密钥 */
  api_key: string;
  /** 模型名称（如 whisper-1、gpt-4o-audio-preview） */
  model_name: string;
  /** 是否启用（1=启用，0=禁用；同一时间只能有一个启用） */
  enabled: number;
  /** 备注 */
  remark: string | null;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at: string;

  // ===== 火山引擎专属字段（provider='volc' 时使用） =====
  /** 火山引擎 API Key（X-Api-Key，safeStorage 加密后 base64） */
  volc_api_key: string | null;
  /** 火山引擎 Resource ID */
  volc_resource_id: string | null;
}

/** 创建/更新远程语音模型的参数 */
export interface UpsertVoiceModelParams {
  name: string;
  provider: VoiceProvider;
  base_url: string;
  api_key: string;
  model_name: string;
  remark?: string;
  // 火山引擎专属（provider='volc' 时必填）
  /** 火山引擎 API Key（明文，后端自动加密存储；空字符串表示不修改） */
  volc_api_key?: string;
  /** 火山引擎 Resource ID */
  volc_resource_id?: string;
}

/** 本地语音模型配置（键值对存储） */
export interface VoiceConfig {
  /** 已选择的本地模型名称（Whisper 用 filename，FunASR 用 modelId） */
  selected_model: string | null;
  /** 已选择的本地引擎类型（whisper / funasr） */
  selected_engine: string | null;
}

class VoicedbService extends BasedbService {
  private modelTable = 'voice_model';
  private configTable = 'voice_config';

  constructor() {
    super({ dbname: 'file-manager.db' });
  }

  async init(): Promise<void> {
    await this._init();

    // 创建远程语音模型表
    const masterStmt = this.db.prepare('SELECT * FROM sqlite_master WHERE type=? AND name = ?');
    if (!masterStmt.get('table', this.modelTable)) {
      this.db.exec(`
        CREATE TABLE ${this.modelTable}
        (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          provider TEXT NOT NULL DEFAULT 'openai',
          base_url TEXT NOT NULL,
          api_key TEXT NOT NULL DEFAULT '',
          model_name TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 0,
          remark TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);
      logger.info('[VoicedbService] 创建 voice_model 表');
    }

    // 创建本地模型配置表（键值对存储）
    if (!masterStmt.get('table', this.configTable)) {
      this.db.exec(`
        CREATE TABLE ${this.configTable}
        (
          key TEXT PRIMARY KEY,
          value TEXT,
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);
      logger.info('[VoicedbService] 创建 voice_config 表');
    }

    // 确保启用唯一约束
    const enabledCount = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM ${this.modelTable} WHERE enabled = 1`
    ).get() as { cnt: number };
    if (enabledCount.cnt > 1) {
      this.db.exec(
        `UPDATE ${this.modelTable} SET enabled = 0 WHERE id NOT IN (
          SELECT id FROM ${this.modelTable} WHERE enabled = 1 ORDER BY updated_at DESC LIMIT 1
        )`
      );
      logger.warn(`[VoicedbService] 检测到 ${enabledCount.cnt} 个启用模型，已自动保留最新的一条`);
    }

    // ===== 迁移：新增火山引擎字段（如果不存在） =====
    const cols = this.db.prepare(`PRAGMA table_info(${this.modelTable})`).all() as { name: string }[];
    const colNames = cols.map((c) => c.name);

    // 新版：使用单个 volc_api_key 替代旧版的 volc_app_key + volc_access_key
    if (!colNames.includes('volc_api_key')) {
      this.db.exec(`ALTER TABLE ${this.modelTable} ADD COLUMN volc_api_key TEXT`);
      logger.info('[VoicedbService] 迁移: 新增 volc_api_key 列');
    }
    if (!colNames.includes('volc_resource_id')) {
      this.db.exec(`ALTER TABLE ${this.modelTable} ADD COLUMN volc_resource_id TEXT`);
      logger.info('[VoicedbService] 迁移: 新增 volc_resource_id 列');
    }

    // 旧版字段迁移：如果存在旧的 volc_app_key + volc_access_key，合并到 volc_api_key
    if (colNames.includes('volc_app_key') || colNames.includes('volc_access_key')) {
      const hasNewKey = colNames.includes('volc_api_key');
      if (hasNewKey) {
        // 将旧数据迁移到新字段（旧数据无法直接合并，只能清空让用户重新填写）
        const oldData = this.db.prepare(
          `SELECT id, volc_app_key, volc_access_key, volc_api_key FROM ${this.modelTable} WHERE provider = 'volc' AND (volc_app_key IS NOT NULL OR volc_access_key IS NOT NULL)`
        ).all() as { id: number; volc_app_key: string | null; volc_access_key: string | null; volc_api_key: string | null }[];
        if (oldData.length > 0) {
          logger.warn(`[VoicedbService] 检测到 ${oldData.length} 条旧版火山引擎配置（App Key + Access Key），请用户重新填写 API Key`);
        }
      }
    }
  }

  // ========== 远程语音模型 CRUD ==========

  /** 获取所有远程语音模型列表 */
  getAllModels(): VoiceModelRecord[] {
    return this.db.prepare(
      `SELECT * FROM ${this.modelTable} ORDER BY enabled DESC, updated_at DESC`
    ).all() as VoiceModelRecord[];
  }

  /** 获取当前启用的远程语音模型 */
  getEnabledModel(): VoiceModelRecord | null {
    return this.db.prepare(
      `SELECT * FROM ${this.modelTable} WHERE enabled = 1 LIMIT 1`
    ).get() as VoiceModelRecord | null;
  }

  /** 根据 ID 获取远程语音模型 */
  getModelById(id: number): VoiceModelRecord | null {
    return this.db.prepare(
      `SELECT * FROM ${this.modelTable} WHERE id = ?`
    ).get(id) as VoiceModelRecord | null;
  }

  /** 添加远程语音模型 */
  addModel(params: UpsertVoiceModelParams): number {
    const { name, provider, base_url, api_key, model_name, remark } = params;
    // 火山引擎专属字段处理
    const volcApiKeyEnc = provider === 'volc' && params.volc_api_key
      ? encryptSecret(params.volc_api_key) : '';
    const volcResourceId = provider === 'volc' ? (params.volc_resource_id ?? '') : '';
    // 火山引擎使用固定的 WSS 地址，不使用前端传入的 base_url
    const effectiveBaseUrl = provider === 'volc' ? VOLC_DEFAULT_BASE_URL : base_url;

    const stmt = this.db.prepare(`
      INSERT INTO ${this.modelTable}
        (name, provider, base_url, api_key, model_name, enabled, remark, volc_api_key, volc_resource_id)
      VALUES
        (@name, @provider, @base_url, @api_key, @model_name, 0, @remark, @volc_api_key, @volc_resource_id)
    `);
    const result = stmt.run({
      name,
      provider,
      base_url: effectiveBaseUrl,
      api_key,
      model_name,
      remark: remark ?? null,
      volc_api_key: volcApiKeyEnc || null,
      volc_resource_id: volcResourceId || null,
    });
    logger.info(`[VoicedbService] 添加远程语音模型: ${name} (id=${result.lastInsertRowid})`);
    return Number(result.lastInsertRowid);
  }

  /** 更新远程语音模型 */
  updateModel(id: number, params: Partial<UpsertVoiceModelParams>): boolean {
    const fields: string[] = [];
    const values: Record<string, unknown> = { id };

    const allowedFields: (keyof UpsertVoiceModelParams)[] = [
      'name', 'provider', 'base_url', 'api_key', 'model_name', 'remark'
    ];
    for (const field of allowedFields) {
      if (params[field] !== undefined) {
        fields.push(`${field} = @${field}`);
        values[field] = params[field];
      }
    }

    // 火山引擎专属字段
    // 如果 provider 变为 volc，强制覆盖 base_url 为固定 WSS 地址
    if (params.provider === 'volc') {
      fields.push('base_url = @base_url');
      values.base_url = VOLC_DEFAULT_BASE_URL;
    }
    // API Key: 空字符串表示不修改，非空则加密存储
    if (params.volc_api_key !== undefined && params.volc_api_key !== '') {
      fields.push('volc_api_key = @volc_api_key');
      values.volc_api_key = encryptSecret(params.volc_api_key);
    }
    if (params.volc_resource_id !== undefined) {
      fields.push('volc_resource_id = @volc_resource_id');
      values.volc_resource_id = params.volc_resource_id || null;
    }

    if (fields.length === 0) return false;

    fields.push(`updated_at = datetime('now')`);
    const stmt = this.db.prepare(
      `UPDATE ${this.modelTable} SET ${fields.join(', ')} WHERE id = @id`
    );
    const result = stmt.run(values);
    return result.changes > 0;
  }

  /** 删除远程语音模型 */
  deleteModel(id: number): boolean {
    const stmt = this.db.prepare(`DELETE FROM ${this.modelTable} WHERE id = ?`);
    const result = stmt.run(id);
    logger.info(`[VoicedbService] 删除远程语音模型 id=${id}, changes=${result.changes}`);
    return result.changes > 0;
  }

  /** 启用指定远程语音模型（同时禁用其他所有模型） */
  enableModel(id: number): boolean {
    const model = this.getModelById(id);
    if (!model) return false;

    const tx = this.db.transaction(() => {
      this.db.prepare(`UPDATE ${this.modelTable} SET enabled = 0`).run();
      this.db.prepare(
        `UPDATE ${this.modelTable} SET enabled = 1, updated_at = datetime('now') WHERE id = ?`
      ).run(id);
    });
    tx();
    logger.info(`[VoicedbService] 启用远程语音模型: ${model.name} (id=${id})`);
    return true;
  }

  /** 禁用指定远程语音模型 */
  disableModel(id: number): boolean {
    const result = this.db.prepare(
      `UPDATE ${this.modelTable} SET enabled = 0, updated_at = datetime('now') WHERE id = ?`
    ).run(id);
    return result.changes > 0;
  }

  // ========== 本地模型配置 ==========

  /** 获取本地模型配置 */
  getConfig(): VoiceConfig {
    const rows = this.db.prepare(
      `SELECT * FROM ${this.configTable} WHERE key IN ('selected_model', 'selected_engine')`
    ).all() as { key: string; value: string | null }[];

    const modelRow = rows.find((r) => r.key === 'selected_model');
    const engineRow = rows.find((r) => r.key === 'selected_engine');

    return {
      selected_model: modelRow?.value ?? null,
      selected_engine: engineRow?.value ?? null,
    };
  }

  /** 设置已选择的本地模型 */
  setSelectedModel(modelName: string | null): void {
    const stmt = this.db.prepare(`
      INSERT INTO ${this.configTable} (key, value, updated_at)
      VALUES ('selected_model', ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);
    stmt.run(modelName);
    logger.info(`[VoicedbService] 设置本地模型选择: ${modelName ?? '(无)'}`);
  }

  /** 设置本地引擎类型（whisper / funasr） */
  setSelectedEngine(engine: string | null): void {
    const stmt = this.db.prepare(`
      INSERT INTO ${this.configTable} (key, value, updated_at)
      VALUES ('selected_engine', ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `);
    stmt.run(engine);
    logger.info(`[VoicedbService] 设置本地引擎: ${engine ?? '(默认 whisper)'}`);
  }
}

const voicedbService = new VoicedbService();
export { voicedbService };
