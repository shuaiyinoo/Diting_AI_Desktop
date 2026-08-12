import { BasedbService } from './basedb';
import { logger } from 'ee-core/log';

/**
 * 票据识别数据库 service（独立模块）
 *
 * 表结构：
 *   - invoice_folder: 授权文件夹
 *   - invoice_file: 文件记录（含 processed / archived 字段）
 */
export interface InvoiceFolderRecord {
  id: number;
  path: string;
  folder_name: string;
  add_time: string;
}

export interface InvoiceFileRecord {
  id: number;
  folder_id: number;
  parent_id: number;
  name: string;
  type: string;
  size: number;
  mtime: string;
  relative_path: string;
  is_dir: number;
  /** 是否已 OCR 处理：0=未处理, 1=已处理 */
  processed: number;
  /** 是否归档：0=未归档, 1=已归档 */
  archived: number;
  /** OCR 识别结果文本 */
  ocr_text: string | null;
  /** OCR 完整结果 JSON（含位置框） */
  ocr_data: string | null;
  /** AI 结构化提取结果 JSON */
  ai_data: string | null;
  /** OCR 识别完成时间 */
  processed_at: string | null;
  /** 文件 SHA-256 哈希（用于判断文件是否变化） */
  file_hash: string | null;
}

class InvoicedbService extends BasedbService {
  private folderTableName = 'invoice_folder';
  private fileTableName = 'invoice_file';

  constructor() {
    super({ dbname: 'invoice-manager.db' });
  }

  async init(): Promise<void> {
    await this._init();

    const masterStmt = this.db.prepare('SELECT * FROM sqlite_master WHERE type=? AND name = ?');

    // 授权文件夹表
    if (!masterStmt.get('table', this.folderTableName)) {
      this.db.exec(`
        CREATE TABLE ${this.folderTableName}
        (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          path TEXT NOT NULL UNIQUE,
          folder_name TEXT,
          add_time TEXT
        );
      `);
    }

    // 文件记录表
    if (!masterStmt.get('table', this.fileTableName)) {
      this.db.exec(`
        CREATE TABLE ${this.fileTableName}
        (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          folder_id INTEGER NOT NULL,
          parent_id INTEGER DEFAULT 0,
          name TEXT NOT NULL,
          type TEXT,
          size INTEGER DEFAULT 0,
          mtime TEXT,
          relative_path TEXT,
          is_dir INTEGER DEFAULT 0,
          processed INTEGER DEFAULT 0,
          archived INTEGER DEFAULT 0,
          ocr_text TEXT,
          ocr_data TEXT,
          ai_data TEXT,
          processed_at TEXT,
          file_hash TEXT
        );
      `);
      this.db.exec(`CREATE INDEX idx_invoice_file_folder ON ${this.fileTableName} (folder_id);`);
      this.db.exec(`CREATE INDEX idx_invoice_file_parent ON ${this.fileTableName} (folder_id, parent_id);`);
      this.db.exec(`CREATE INDEX idx_invoice_file_processed ON ${this.fileTableName} (processed);`);
      this.db.exec(`CREATE INDEX idx_invoice_file_archived ON ${this.fileTableName} (archived);`);
    }

    // 表结构迁移
    this._migrateTable();
  }

  /** 迁移：补充缺失字段 */
  private _migrateTable(): void {
    const columns = this.db.prepare(`PRAGMA table_info(${this.fileTableName})`).all() as { name: string }[];
    const colNames = new Set(columns.map(c => c.name));

    if (!colNames.has('processed')) {
      this.db.exec(`ALTER TABLE ${this.fileTableName} ADD COLUMN processed INTEGER DEFAULT 0;`);
    }
    if (!colNames.has('archived')) {
      this.db.exec(`ALTER TABLE ${this.fileTableName} ADD COLUMN archived INTEGER DEFAULT 0;`);
    }
    if (!colNames.has('ocr_text')) {
      this.db.exec(`ALTER TABLE ${this.fileTableName} ADD COLUMN ocr_text TEXT;`);
    }
    if (!colNames.has('ocr_data')) {
      this.db.exec(`ALTER TABLE ${this.fileTableName} ADD COLUMN ocr_data TEXT;`);
    }
    if (!colNames.has('ai_data')) {
      this.db.exec(`ALTER TABLE ${this.fileTableName} ADD COLUMN ai_data TEXT;`);
    }
    if (!colNames.has('processed_at')) {
      this.db.exec(`ALTER TABLE ${this.fileTableName} ADD COLUMN processed_at TEXT;`);
    }
    if (!colNames.has('file_hash')) {
      this.db.exec(`ALTER TABLE ${this.fileTableName} ADD COLUMN file_hash TEXT;`);
    }
  }

  // ========== 文件夹操作 ==========

  /** 添加授权文件夹 */
  addFolder(folderPath: string): InvoiceFolderRecord {
    const folderName = folderPath.split(/[\\/]/).pop() || folderPath;
    const addTime = new Date().toISOString();

    const existing = this.db.prepare(`SELECT * FROM ${this.folderTableName} WHERE path = ?`).get(folderPath) as InvoiceFolderRecord | undefined;
    if (existing) {
      throw new Error('该文件夹已添加');
    }

    this.db.prepare(`INSERT INTO ${this.folderTableName} (path, folder_name, add_time) VALUES (?, ?, ?)`).run(folderPath, folderName, addTime);
    return this.db.prepare(`SELECT * FROM ${this.folderTableName} WHERE path = ?`).get(folderPath) as InvoiceFolderRecord;
  }

  /** 获取所有授权文件夹 */
  getFolderList(): InvoiceFolderRecord[] {
    return this.db.prepare(`SELECT * FROM ${this.folderTableName} ORDER BY id DESC`).all() as InvoiceFolderRecord[];
  }

  /** 删除授权文件夹及其文件记录 */
  deleteFolder(folderId: number): void {
    this.db.prepare(`DELETE FROM ${this.fileTableName} WHERE folder_id = ?`).run(folderId);
    this.db.prepare(`DELETE FROM ${this.folderTableName} WHERE id = ?`).run(folderId);
  }

  // ========== 文件操作 ==========

  /** 获取文件夹下所有文件记录 */
  getFilesByFolder(folderId: number): InvoiceFileRecord[] {
    return this.db.prepare(`SELECT * FROM ${this.fileTableName} WHERE folder_id = ? ORDER BY is_dir DESC, name ASC`).all(folderId) as InvoiceFileRecord[];
  }

  /** 根据 relative_path 查找文件 */
  getFileByPath(folderId: number, relativePath: string): InvoiceFileRecord | undefined {
    return this.db.prepare(`SELECT * FROM ${this.fileTableName} WHERE folder_id = ? AND relative_path = ?`).get(folderId, relativePath) as InvoiceFileRecord | undefined;
  }

  /** 插入或更新文件记录 */
  upsertFile(file: Omit<InvoiceFileRecord, 'id'>): void {
    const existing = this.getFileByPath(file.folder_id, file.relative_path);
    if (existing) {
      // 文件已存在：更新基本信息，保留 processed/archived/ocr_text 状态
      // 但如果 file_hash 变化，需要重置 processed 为 0
      const needReprocess = existing.file_hash !== file.file_hash && !file.is_dir;
      this.db.prepare(`
        UPDATE ${this.fileTableName}
        SET name = ?, type = ?, size = ?, mtime = ?, is_dir = ?, file_hash = ?,
            processed = CASE WHEN ? = 1 THEN 0 ELSE processed END
        WHERE id = ?
      `).run(file.name, file.type, file.size, file.mtime, file.is_dir, file.file_hash, needReprocess ? 1 : 0, existing.id);
    } else {
      this.db.prepare(`
        INSERT INTO ${this.fileTableName}
        (folder_id, parent_id, name, type, size, mtime, relative_path, is_dir, processed, archived, ocr_text, processed_at, file_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, NULL, ?)
      `).run(file.folder_id, file.parent_id, file.name, file.type, file.size, file.mtime, file.relative_path, file.is_dir, file.file_hash);
    }
  }

  /** 删除文件记录（文件已被删除时调用） */
  deleteFile(folderId: number, relativePath: string): void {
    this.db.prepare(`DELETE FROM ${this.fileTableName} WHERE folder_id = ? AND relative_path = ?`).run(folderId, relativePath);
  }

  /** 更新 OCR 处理结果 */
  updateOcrResult(fileId: number, ocrText: string, ocrData: string): void {
    this.db.prepare(`
      UPDATE ${this.fileTableName}
      SET processed = 1, ocr_text = ?, ocr_data = ?, processed_at = ?
      WHERE id = ?
    `).run(ocrText, ocrData, new Date().toISOString(), fileId);
  }

  /** 清除文件的 OCR 和 AI 结果（用于重新识别） */
  clearOcrResult(fileId: number): void {
    this.db.prepare(`
      UPDATE ${this.fileTableName}
      SET processed = 0, ocr_text = NULL, ocr_data = NULL, ai_data = NULL, processed_at = NULL
      WHERE id = ?
    `).run(fileId);
  }

  /**
   * 标记文件处理失败
   * processed 状态：0=未处理, 1=已处理, 2=处理失败
   * 使用 2 而非 0，避免失败文件被反复选中导致无限循环
   */
  markFileFailed(fileId: number): void {
    this.db.prepare(`
      UPDATE ${this.fileTableName}
      SET processed = 2, processed_at = ?
      WHERE id = ?
    `).run(new Date().toISOString(), fileId);
  }

  /** 切换归档状态 */
  toggleArchived(fileId: number): InvoiceFileRecord | undefined {
    this.db.prepare(`UPDATE ${this.fileTableName} SET archived = CASE WHEN archived = 1 THEN 0 ELSE 1 END WHERE id = ?`).run(fileId);
    return this.db.prepare(`SELECT * FROM ${this.fileTableName} WHERE id = ?`).get(fileId) as InvoiceFileRecord | undefined;
  }

  /** 获取未处理的图片文件 */
  getUnprocessedImageFiles(folderId: number): InvoiceFileRecord[] {
    return this.db.prepare(`
      SELECT * FROM ${this.fileTableName}
      WHERE folder_id = ? AND is_dir = 0 AND processed = 0
      AND (type = '.png' OR type = '.jpg' OR type = '.jpeg' OR type = '.bmp' OR type = '.webp' OR type = '.tiff' OR type = '.tif')
    `).all(folderId) as InvoiceFileRecord[];
  }

  /** 获取所有文件夹下未处理的文件（图片 + PDF） */
  getAllUnprocessedFiles(): InvoiceFileRecord[] {
    return this.db.prepare(`
      SELECT * FROM ${this.fileTableName}
      WHERE is_dir = 0 AND processed = 0
      AND (type = '.png' OR type = '.jpg' OR type = '.jpeg' OR type = '.bmp' OR type = '.webp' OR type = '.tiff' OR type = '.tif' OR type = '.pdf')
    `).all() as InvoiceFileRecord[];
  }

  /** 更新 AI 结构化提取结果 */
  updateAiResult(fileId: number, aiData: string): void {
    this.db.prepare(`
      UPDATE ${this.fileTableName}
      SET ai_data = ?
      WHERE id = ?
    `).run(aiData, fileId);
  }

  /** 根据 ID 获取文件记录 */
  getFileById(fileId: number): InvoiceFileRecord | undefined {
    return this.db.prepare(`SELECT * FROM ${this.fileTableName} WHERE id = ?`).get(fileId) as InvoiceFileRecord | undefined;
  }

  /** 根据 folder_id 获取文件夹路径 */
  getFolderById(folderId: number): InvoiceFolderRecord | undefined {
    return this.db.prepare(`SELECT * FROM ${this.folderTableName} WHERE id = ?`).get(folderId) as InvoiceFolderRecord | undefined;
  }
}

export const invoicedbService = new InvoicedbService();
