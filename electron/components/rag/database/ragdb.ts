/**
 * RAG 数据库层
 *
 * 源自 electron-rag/src/database.ts，适配 electron-egg 文件管理模块。
 * 使用 file_item.id 作为文档标识（fileItemId），不再单独维护 documents 表。
 *
 * 两张表：
 *   document_chunks  — 切片表（fileItemId 关联 file_item）
 *   vector_store     — 向量元数据表
 */

import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { DocumentChunkRecord, VectorStoreRecord } from '../types';

const CREATE_CHUNKS_TABLE = `
CREATE TABLE IF NOT EXISTS document_chunks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  file_item_id    INTEGER NOT NULL,
  folder_id       INTEGER NOT NULL,
  chunk_index     INTEGER NOT NULL,
  chunk_text      TEXT NOT NULL,
  chunk_summary   TEXT,
  char_start      INTEGER NOT NULL,
  char_end        INTEGER NOT NULL,
  metadata_json   TEXT,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now'))
)`;

const CREATE_VECTOR_STORE_TABLE = `
CREATE TABLE IF NOT EXISTS vector_store (
  id            TEXT PRIMARY KEY,
  file_item_id  INTEGER NOT NULL,
  chunk_id      INTEGER NOT NULL,
  folder_id     INTEGER NOT NULL,
  chunk_index   INTEGER NOT NULL,
  file_name     TEXT NOT NULL,
  content       TEXT NOT NULL,
  metadata      TEXT DEFAULT '{}',
  dimension     INTEGER NOT NULL,
  status        TEXT DEFAULT 'VECTORIZED',
  created_at    TEXT DEFAULT (datetime('now'))
)`;

const INDEX_CHUNKS = `CREATE INDEX IF NOT EXISTS idx_chunks_file_item ON document_chunks(file_item_id)`;
const INDEX_VECTOR_FILE = `CREATE INDEX IF NOT EXISTS idx_vector_file_item ON vector_store(file_item_id)`;
const INDEX_VECTOR_FOLDER = `CREATE INDEX IF NOT EXISTS idx_vector_folder ON vector_store(folder_id)`;
const INDEX_VECTOR_CHUNK = `CREATE INDEX IF NOT EXISTS idx_vector_chunk ON vector_store(chunk_id)`;

export class RagDatabase {
  private db: DatabaseType;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(CREATE_CHUNKS_TABLE);
    this.db.exec(CREATE_VECTOR_STORE_TABLE);
    this.db.exec(INDEX_CHUNKS);
    this.db.exec(INDEX_VECTOR_FILE);
    this.db.exec(INDEX_VECTOR_FOLDER);
    this.db.exec(INDEX_VECTOR_CHUNK);
  }

  getDatabase(): DatabaseType {
    return this.db;
  }

  /** 批量插入切片 */
  createChunks(chunks: Omit<DocumentChunkRecord, 'id' | 'createdAt' | 'updatedAt'>[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO document_chunks
        (file_item_id, folder_id, chunk_index, chunk_text, chunk_summary, char_start, char_end, metadata_json)
      VALUES
        (@fileItemId, @folderId, @chunkIndex, @chunkText, @chunkSummary, @charStart, @charEnd, @metadataJson)
    `);
    const insertMany = this.db.transaction((items: typeof chunks) => {
      for (const chunk of items) {
        stmt.run({
          fileItemId: chunk.fileItemId,
          folderId: chunk.folderId,
          chunkIndex: chunk.chunkIndex,
          chunkText: chunk.chunkText,
          chunkSummary: chunk.chunkSummary,
          charStart: chunk.charStart,
          charEnd: chunk.charEnd,
          metadataJson: chunk.metadataJson,
        });
      }
    });
    insertMany(chunks);
  }

  /** 按 fileItemId 查询切片 */
  getChunksByFileItemId(fileItemId: number): DocumentChunkRecord[] {
    return this.db.prepare(
      `SELECT * FROM document_chunks WHERE file_item_id = ? ORDER BY chunk_index ASC`
    ).all(fileItemId) as DocumentChunkRecord[];
  }

  /** 删除指定 fileItemId 的所有切片 */
  deleteChunksByFileItemId(fileItemId: number): void {
    this.db.prepare(`DELETE FROM document_chunks WHERE file_item_id = ?`).run(fileItemId);
  }

  /** 批量写入向量记录 */
  createVectorStoreRecords(records: Array<{
    id: string; fileItemId: number; chunkId: number; folderId: number;
    chunkIndex: number; fileName: string; content: string;
    metadata: Record<string, unknown>; dimension: number;
  }>): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO vector_store
        (id, file_item_id, chunk_id, folder_id, chunk_index, file_name, content, metadata, dimension, status)
      VALUES
        (@id, @fileItemId, @chunkId, @folderId, @chunkIndex, @fileName, @content, @metadata, @dimension, 'VECTORIZED')
    `);
    const insertMany = this.db.transaction((items: typeof records) => {
      for (const r of items) {
        stmt.run({
          id: r.id, fileItemId: r.fileItemId, chunkId: r.chunkId, folderId: r.folderId,
          chunkIndex: r.chunkIndex, fileName: r.fileName, content: r.content,
          metadata: JSON.stringify(r.metadata), dimension: r.dimension,
        });
      }
    });
    insertMany(records);
  }

  /** 删除指定 fileItemId 的所有向量记录 */
  deleteVectorStoreByFileItemId(fileItemId: number): void {
    this.db.prepare(`DELETE FROM vector_store WHERE file_item_id = ?`).run(fileItemId);
  }

  /** 统计已向量化的文件数 */
  countVectorizedFiles(folderId?: number): number {
    if (folderId != null) {
      const row = this.db.prepare(
        `SELECT COUNT(DISTINCT file_item_id) as cnt FROM vector_store WHERE folder_id = ? AND status = 'VECTORIZED'`
      ).get(folderId) as { cnt: number };
      return row?.cnt ?? 0;
    }
    const row = this.db.prepare(
      `SELECT COUNT(DISTINCT file_item_id) as cnt FROM vector_store WHERE status = 'VECTORIZED'`
    ).get() as { cnt: number };
    return row?.cnt ?? 0;
  }

  close(): void {
    this.db.close();
  }
}
