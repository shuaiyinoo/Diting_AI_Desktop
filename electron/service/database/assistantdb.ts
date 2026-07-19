/**
 * Assistant 助手模块持久化数据库
 *
 * 参考 ArgusRAG 的 AssistantSessionMapper / AssistantMessageMapper / AssistantSessionContextMapper。
 * 存储三张表：
 *   assistant_session          — 会话表
 *   assistant_message          — 消息表（USER / ASSISTANT / TOOL）
 *   assistant_session_context  — 会话记忆上下文（summary / compact / session memory）
 *
 * 适配要点：
 *   - 桌面应用单用户，省略 user_id 字段
 *   - ArgusRAG 的 groupId 映射为本项目的 folderId（授权文件夹 ID）
 *   - 使用 better-sqlite3 同步事务保证一致性
 */

import { BasedbService } from './basedb';
import { logger } from 'ee-core/log';
import type { AssistantMessageRole, AssistantToolMode } from '../../components/rag/assistant/types';

// ═══════════════════════════════════════════
// 实体类型
// ═══════════════════════════════════════════

/** 会话状态 */
export type AssistantSessionStatus = 'ACTIVE' | 'ARCHIVED';

/** 会话实体（对应 assistant_session 表） */
export interface AssistantSessionEntity {
  id: number;
  title: string;
  status: string;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

/** 消息实体（对应 assistant_message 表） */
export interface AssistantMessageEntity {
  id: number;
  session_id: number;
  role: string; // AssistantMessageRole
  tool_mode: string; // AssistantToolMode
  folder_id: number | null;
  content: string;
  structured_payload: string | null;
  created_at: string;
}

/** 会话上下文实体（对应 assistant_session_context 表） */
export interface AssistantSessionContextEntity {
  session_id: number;
  summary_text: string | null;
  source_message_id: number | null;
  compact_summary: string | null;
  compact_summary_base_message_id: number | null;
  compact_summary_range_end_message_id: number | null;
  session_memory: string | null;
  session_memory_base_message_id: number | null;
  session_memory_range_end_message_id: number | null;
  context_version: number | null;
  updated_at: string | null;
}

// ═══════════════════════════════════════════
// DTO
// ═══════════════════════════════════════════

/** 消息创建参数 */
export interface AssistantMessageCreateDTO {
  sessionId: number;
  toolMode: AssistantToolMode;
  folderId: number | null;
  content: string;
  structuredPayload?: string | null;
}

// ═══════════════════════════════════════════
// AssistantdbService
// ═══════════════════════════════════════════

class AssistantdbService extends BasedbService {
  private sessionTable = 'assistant_session';
  private messageTable = 'assistant_message';
  private contextTable = 'assistant_session_context';

  constructor() {
    super({ dbname: 'file-manager.db' });
  }

  async init(): Promise<void> {
    await this._init();
    const masterStmt = this.db.prepare('SELECT * FROM sqlite_master WHERE type=? AND name = ?');

    // 会话表
    if (!masterStmt.get('table', this.sessionTable)) {
      this.db.exec(`
        CREATE TABLE ${this.sessionTable} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL DEFAULT '新会话',
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          last_message_at TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now'))
        );
      `);
      logger.info('[AssistantdbService] 创建 assistant_session 表');
    }

    // 消息表
    if (!masterStmt.get('table', this.messageTable)) {
      this.db.exec(`
        CREATE TABLE ${this.messageTable} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL,
          role TEXT NOT NULL,
          tool_mode TEXT NOT NULL,
          folder_id INTEGER,
          content TEXT NOT NULL,
          structured_payload TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (session_id) REFERENCES ${this.sessionTable}(id) ON DELETE CASCADE
        );
      `);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_assistant_msg_session ON ${this.messageTable} (session_id);`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_assistant_msg_created ON ${this.messageTable} (created_at);`);
      logger.info('[AssistantdbService] 创建 assistant_message 表');
    }

    // 会话上下文表（记忆）
    if (!masterStmt.get('table', this.contextTable)) {
      this.db.exec(`
        CREATE TABLE ${this.contextTable} (
          session_id INTEGER PRIMARY KEY,
          summary_text TEXT,
          source_message_id INTEGER,
          compact_summary TEXT,
          compact_summary_base_message_id INTEGER,
          compact_summary_range_end_message_id INTEGER,
          session_memory TEXT,
          session_memory_base_message_id INTEGER,
          session_memory_range_end_message_id INTEGER,
          context_version INTEGER DEFAULT 0,
          updated_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (session_id) REFERENCES ${this.sessionTable}(id) ON DELETE CASCADE
        );
      `);
      logger.info('[AssistantdbService] 创建 assistant_session_context 表');
    }
  }

  // ═══════════════════════════════════════════
  // 会话 CRUD
  // ═══════════════════════════════════════════

  /** 创建新会话 */
  createSession(title: string = '新会话'): AssistantSessionEntity {
    const stmt = this.db.prepare(`
      INSERT INTO ${this.sessionTable} (title, status) VALUES (?, 'ACTIVE')
    `);
    const result = stmt.run(title);
    const id = Number(result.lastInsertRowid);
    return this.getSessionById(id)!;
  }

  /** 根据 ID 获取会话 */
  getSessionById(id: number): AssistantSessionEntity | null {
    return this.db.prepare(
      `SELECT * FROM ${this.sessionTable} WHERE id = ?`
    ).get(id) as AssistantSessionEntity | null;
  }

  /** 获取所有会话列表（按最后消息时间降序） */
  listSessions(): AssistantSessionEntity[] {
    return this.db.prepare(
      `SELECT * FROM ${this.sessionTable} ORDER BY
        CASE WHEN last_message_at IS NULL THEN 1 ELSE 0 END,
        last_message_at DESC,
        id DESC`
    ).all() as AssistantSessionEntity[];
  }

  /** 重命名会话 */
  updateTitle(id: number, title: string): boolean {
    const result = this.db.prepare(
      `UPDATE ${this.sessionTable} SET title = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(title, id);
    return result.changes > 0;
  }

  /** 更新会话最后消息时间 */
  updateLastMessageAt(id: number, time: string): boolean {
    const result = this.db.prepare(
      `UPDATE ${this.sessionTable} SET last_message_at = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(time, id);
    return result.changes > 0;
  }

  /** 删除会话（级联删除消息和上下文） */
  deleteSession(id: number): boolean {
    const tx = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM ${this.contextTable} WHERE session_id = ?`).run(id);
      this.db.prepare(`DELETE FROM ${this.messageTable} WHERE session_id = ?`).run(id);
      this.db.prepare(`DELETE FROM ${this.sessionTable} WHERE id = ?`).run(id);
    });
    tx();
    return true;
  }

  // ═══════════════════════════════════════════
  // 消息 CRUD
  // ═══════════════════════════════════════════

  /** 插入一条消息 */
  insertMessage(
    sessionId: number,
    role: AssistantMessageRole,
    toolMode: AssistantToolMode,
    folderId: number | null,
    content: string,
    structuredPayload: string | null,
    createdAt: string
  ): AssistantMessageEntity {
    const stmt = this.db.prepare(`
      INSERT INTO ${this.messageTable}
        (session_id, role, tool_mode, folder_id, content, structured_payload, created_at)
      VALUES
        (@sessionId, @role, @toolMode, @folderId, @content, @structuredPayload, @createdAt)
    `);
    const result = stmt.run({
      sessionId,
      role,
      toolMode,
      folderId,
      content,
      structuredPayload,
      createdAt,
    });
    const id = Number(result.lastInsertRowid);
    return this.getMessageById(id)!;
  }

  /** 根据 ID 获取消息 */
  getMessageById(id: number): AssistantMessageEntity | null {
    return this.db.prepare(
      `SELECT * FROM ${this.messageTable} WHERE id = ?`
    ).get(id) as AssistantMessageEntity | null;
  }

  /** 获取会话最近 N 条消息（按时间升序返回） */
  selectRecentBySessionId(sessionId: number, limit: number): AssistantMessageEntity[] {
    // 先取最近 limit 条（降序），再反转为升序
    const rows = this.db.prepare(
      `SELECT * FROM ${this.messageTable} WHERE session_id = ?
       ORDER BY id DESC LIMIT ?`
    ).all(sessionId, limit) as AssistantMessageEntity[];
    return rows.reverse();
  }

  /** 获取会话全部消息（按时间升序） */
  selectBySessionIdOrderByCreatedAt(sessionId: number): AssistantMessageEntity[] {
    return this.db.prepare(
      `SELECT * FROM ${this.messageTable} WHERE session_id = ? ORDER BY id ASC`
    ).all(sessionId) as AssistantMessageEntity[];
  }

  /** 统计会话消息总数 */
  countBySessionId(sessionId: number): number {
    const row = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM ${this.messageTable} WHERE session_id = ?`
    ).get(sessionId) as { cnt: number };
    return row?.cnt ?? 0;
  }

  /** 删除会话所有消息 */
  deleteMessagesBySessionId(sessionId: number): number {
    const result = this.db.prepare(
      `DELETE FROM ${this.messageTable} WHERE session_id = ?`
    ).run(sessionId);
    return result.changes;
  }

  // ═══════════════════════════════════════════
  // 会话上下文（记忆）CRUD
  // ═══════════════════════════════════════════

  /** 获取会话上下文 */
  selectContextBySessionId(sessionId: number): AssistantSessionContextEntity | null {
    return this.db.prepare(
      `SELECT * FROM ${this.contextTable} WHERE session_id = ?`
    ).get(sessionId) as AssistantSessionContextEntity | null;
  }

  /** 插入或更新上下文（upsert，用于 summary） */
  upsertContext(entity: AssistantSessionContextEntity): boolean {
    const result = this.db.prepare(`
      INSERT INTO ${this.contextTable}
        (session_id, summary_text, source_message_id, updated_at)
      VALUES
        (@sessionId, @summaryText, @sourceMessageId, datetime('now'))
      ON CONFLICT(session_id) DO UPDATE SET
        summary_text = excluded.summary_text,
        source_message_id = excluded.source_message_id,
        updated_at = datetime('now')
    `).run({
      sessionId: entity.session_id,
      summaryText: entity.summary_text,
      sourceMessageId: entity.source_message_id,
    });
    return result.changes > 0;
  }

  /** 更新短期记忆（带乐观锁） */
  updateShortTermMemoryWithVersion(
    entity: AssistantSessionContextEntity,
    expectedVersion: number
  ): boolean {
    const result = this.db.prepare(`
      UPDATE ${this.contextTable} SET
        session_memory = @sessionMemory,
        session_memory_base_message_id = @sessionMemoryBaseMessageId,
        session_memory_range_end_message_id = @sessionMemoryRangeEndMessageId,
        compact_summary = @compactSummary,
        compact_summary_base_message_id = @compactSummaryBaseMessageId,
        compact_summary_range_end_message_id = @compactSummaryRangeEndMessageId,
        context_version = @contextVersion,
        updated_at = datetime('now')
      WHERE session_id = @sessionId AND context_version = @expectedVersion
    `).run({
      sessionMemory: entity.session_memory,
      sessionMemoryBaseMessageId: entity.session_memory_base_message_id,
      sessionMemoryRangeEndMessageId: entity.session_memory_range_end_message_id,
      compactSummary: entity.compact_summary,
      compactSummaryBaseMessageId: entity.compact_summary_base_message_id,
      compactSummaryRangeEndMessageId: entity.compact_summary_range_end_message_id,
      contextVersion: entity.context_version,
      sessionId: entity.session_id,
      expectedVersion,
    });
    return result.changes > 0;
  }

  /** 新建上下文记录（首次写入短期记忆） */
  insertContext(entity: AssistantSessionContextEntity): boolean {
    const result = this.db.prepare(`
      INSERT INTO ${this.contextTable}
        (session_id, session_memory, session_memory_base_message_id,
         session_memory_range_end_message_id, compact_summary,
         compact_summary_base_message_id, compact_summary_range_end_message_id,
         context_version, updated_at)
      VALUES
        (@sessionId, @sessionMemory, @sessionMemoryBaseMessageId,
         @sessionMemoryRangeEndMessageId, @compactSummary,
         @compactSummaryBaseMessageId, @compactSummaryRangeEndMessageId,
         @contextVersion, datetime('now'))
    `).run({
      sessionId: entity.session_id,
      sessionMemory: entity.session_memory,
      sessionMemoryBaseMessageId: entity.session_memory_base_message_id,
      sessionMemoryRangeEndMessageId: entity.session_memory_range_end_message_id,
      compactSummary: entity.compact_summary,
      compactSummaryBaseMessageId: entity.compact_summary_base_message_id,
      compactSummaryRangeEndMessageId: entity.compact_summary_range_end_message_id,
      contextVersion: entity.context_version,
    });
    return result.changes > 0;
  }
}

const assistantdbService = new AssistantdbService();
export { assistantdbService };
