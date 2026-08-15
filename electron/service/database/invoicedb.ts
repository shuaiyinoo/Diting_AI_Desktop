import { BasedbService } from './basedb';
import { logger } from 'ee-core/log';

/**
 * 票据识别数据库 service（独立模块）
 *
 * 表结构：
 *   - invoice_folder:  授权文件夹
 *   - invoice_file:    文件记录（含 processed / archived 字段）
 *   - invoice_record:  归档业务记录（从 AI 提取的结构化数据 + 归一化字段）
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

/** 归档业务记录实体（对应 invoice_record 表） */
export interface InvoiceRecordEntity {
  id: number;
  file_id: number;
  folder_id: number;
  /** 原始文件名 */
  file_name: string;
  /** 归档时的完整路径 */
  file_path: string | null;
  /** 文件 SHA-256 哈希 */
  file_hash: string | null;
  /** 票据类型编码（ReceiptTypes.type_code） */
  type_code: string | null;
  /** 票据类型显示名 */
  type_name: string | null;
  /** 大类编码 */
  category: string | null;
  /** 大类显示名 */
  category_display: string | null;
  /** 归一化：票据号码 */
  invoice_number: string | null;
  /** 归一化：票据代码 */
  invoice_code: string | null;
  /** 归一化：开票日期（YYYY-MM-DD） */
  issue_date: string | null;
  /** 归一化：总金额（数值） */
  amount_total: number | null;
  /** 归一化：税额（数值） */
  amount_tax: number | null;
  /** 归一化：付款方/购方/乘客姓名 */
  payer_name: string | null;
  /** 归一化：收款方/销方名称 */
  payee_name: string | null;
  /** 归一化：省份 */
  province: string | null;
  /** 归一化：城市 */
  city: string | null;
  /** OCR 全文 */
  ocr_text: string | null;
  /** AI 提取的完整 JSON */
  ai_data: string | null;
  /** AI 分类置信度 */
  ai_confidence: number | null;
  /** 是否需复核 */
  ai_needs_review: number;
  /** 归档时间 */
  archived_at: string | null;
  /** OCR 识别时间 */
  ocr_at: string | null;
  /** AI 提取时间 */
  ai_at: string | null;
  created_at: string;
  updated_at: string | null;
}

class InvoicedbService extends BasedbService {
  private folderTableName = 'invoice_folder';
  private fileTableName = 'invoice_file';
  private recordTableName = 'invoice_record';

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

    // 归档业务记录表
    if (!masterStmt.get('table', this.recordTableName)) {
      this.db.exec(`
        CREATE TABLE ${this.recordTableName}
        (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_id INTEGER NOT NULL,
          folder_id INTEGER NOT NULL,
          file_name TEXT NOT NULL,
          file_path TEXT,
          file_hash TEXT,
          type_code TEXT,
          type_name TEXT,
          category TEXT,
          category_display TEXT,
          invoice_number TEXT,
          invoice_code TEXT,
          issue_date TEXT,
          amount_total REAL,
          amount_tax REAL,
          payer_name TEXT,
          payee_name TEXT,
          province TEXT,
          city TEXT,
          ocr_text TEXT,
          ai_data TEXT,
          ai_confidence REAL,
          ai_needs_review INTEGER DEFAULT 0,
          archived_at TEXT,
          ocr_at TEXT,
          ai_at TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT
        );
      `);
      this.db.exec(`CREATE INDEX idx_invoice_record_file ON ${this.recordTableName} (file_id);`);
      this.db.exec(`CREATE INDEX idx_invoice_record_folder ON ${this.recordTableName} (folder_id);`);
      this.db.exec(`CREATE INDEX idx_invoice_record_type ON ${this.recordTableName} (type_code);`);
      this.db.exec(`CREATE INDEX idx_invoice_record_category ON ${this.recordTableName} (category);`);
      this.db.exec(`CREATE INDEX idx_invoice_record_date ON ${this.recordTableName} (issue_date);`);
      this.db.exec(`CREATE INDEX idx_invoice_record_amount ON ${this.recordTableName} (amount_total);`);
    }
    this._migrateRecordTable();
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

  // ========== 归档记录操作 ==========

  /** 根据 file_id 查找归档记录 */
  getRecordByFileId(fileId: number): InvoiceRecordEntity | undefined {
    return this.db.prepare(`SELECT * FROM ${this.recordTableName} WHERE file_id = ?`).get(fileId) as InvoiceRecordEntity | undefined;
  }

  /** 根据 ID 获取归档记录 */
  getRecordById(id: number): InvoiceRecordEntity | undefined {
    return this.db.prepare(`SELECT * FROM ${this.recordTableName} WHERE id = ?`).get(id) as InvoiceRecordEntity | undefined;
  }

  /** 查询归档记录列表（支持搜索 + 分类过滤 + 分页） */
  queryRecords(options: {
    keyword?: string;
    category?: string;
    typeCode?: string;
    limit?: number;
    offset?: number;
  }): { total: number; records: InvoiceRecordEntity[] } {
    const conditions: string[] = [];
    const params: any[] = [];

    if (options.keyword) {
      conditions.push(`(file_name LIKE ? OR invoice_number LIKE ? OR invoice_code LIKE ? OR payer_name LIKE ? OR payee_name LIKE ? OR type_name LIKE ?)`);
      const kw = `%${options.keyword}%`;
      params.push(kw, kw, kw, kw, kw, kw);
    }
    if (options.category) {
      conditions.push(`category = ?`);
      params.push(options.category);
    }
    if (options.typeCode) {
      conditions.push(`type_code = ?`);
      params.push(options.typeCode);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const total = (this.db.prepare(`SELECT COUNT(*) as count FROM ${this.recordTableName} ${whereClause}`).get(...params) as { count: number }).count;
    const records = this.db.prepare(
      `SELECT * FROM ${this.recordTableName} ${whereClause} ORDER BY archived_at DESC LIMIT ? OFFSET ?`
    ).all(...params, limit, offset) as InvoiceRecordEntity[];

    return { total, records };
  }

  /** 获取归档统计 */
  getArchiveStats(): {
    total: number;
    needsReview: number;
    totalAmount: number;
    categoryCounts: { category: string; category_display: string; count: number }[];
  } {
    const total = (this.db.prepare(`SELECT COUNT(*) as count FROM ${this.recordTableName}`).get() as { count: number }).count;
    const needsReview = (this.db.prepare(`SELECT COUNT(*) as count FROM ${this.recordTableName} WHERE ai_needs_review = 1`).get() as { count: number }).count;
    const totalAmountRow = this.db.prepare(`SELECT COALESCE(SUM(amount_total), 0) as sum FROM ${this.recordTableName}`).get() as { sum: number };
    const categoryRows = this.db.prepare(`
      SELECT category, category_display, COUNT(*) as count
      FROM ${this.recordTableName}
      GROUP BY category, category_display
      ORDER BY count DESC
    `).all() as { category: string; category_display: string; count: number }[];

    return {
      total,
      needsReview,
      totalAmount: totalAmountRow.sum,
      categoryCounts: categoryRows,
    };
  }

  /** 插入归档记录 */
  insertRecord(record: Omit<InvoiceRecordEntity, 'id' | 'created_at' | 'updated_at'>): InvoiceRecordEntity | undefined {
    this.db.prepare(`
      INSERT INTO ${this.recordTableName}
      (file_id, folder_id, file_name, file_path, file_hash,
       type_code, type_name, category, category_display,
       invoice_number, invoice_code, issue_date, amount_total, amount_tax,
       payer_name, payee_name, province, city,
       ocr_text, ai_data, ai_confidence, ai_needs_review,
       archived_at, ocr_at, ai_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.file_id, record.folder_id, record.file_name, record.file_path, record.file_hash,
      record.type_code, record.type_name, record.category, record.category_display,
      record.invoice_number, record.invoice_code, record.issue_date, record.amount_total, record.amount_tax,
      record.payer_name, record.payee_name, record.province, record.city,
      record.ocr_text, record.ai_data, record.ai_confidence, record.ai_needs_review,
      record.archived_at, record.ocr_at, record.ai_at,
    );
    const id = this.db.prepare(`SELECT last_insert_rowid() as id`).get() as { id: number };
    return this.getRecordById(id.id);
  }

  /** 更新归档记录（重新归档时使用） */
  updateRecord(id: number, record: Partial<Omit<InvoiceRecordEntity, 'id' | 'created_at'>>): void {
    const fields: string[] = [];
    const values: any[] = [];
    const allowedFields = [
      'file_name', 'file_path', 'file_hash',
      'type_code', 'type_name', 'category', 'category_display',
      'invoice_number', 'invoice_code', 'issue_date', 'amount_total', 'amount_tax',
      'payer_name', 'payee_name', 'province', 'city',
      'ocr_text', 'ai_data', 'ai_confidence', 'ai_needs_review',
      'archived_at', 'ocr_at', 'ai_at',
    ];
    for (const [key, value] of Object.entries(record)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }
    if (fields.length === 0) return;
    fields.push(`updated_at = ?`);
    values.push(new Date().toISOString());
    values.push(id);
    this.db.prepare(`UPDATE ${this.recordTableName} SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  /** 删除归档记录（取消归档时使用） */
  deleteRecord(fileId: number): void {
    this.db.prepare(`DELETE FROM ${this.recordTableName} WHERE file_id = ?`).run(fileId);
  }

  /** 迁移：invoice_record 表补充缺失字段（幂等检测） */
  private _migrateRecordTable(): void {
    const columns = this.db.prepare(`PRAGMA table_info(${this.recordTableName})`).all() as { name: string }[];
    const colNames = new Set(columns.map(c => c.name));

    const migrations: Record<string, string> = {
      file_id: 'INTEGER NOT NULL',
      folder_id: 'INTEGER NOT NULL',
      file_name: 'TEXT NOT NULL',
      file_path: 'TEXT',
      file_hash: 'TEXT',
      type_code: 'TEXT',
      type_name: 'TEXT',
      category: 'TEXT',
      category_display: 'TEXT',
      invoice_number: 'TEXT',
      invoice_code: 'TEXT',
      issue_date: 'TEXT',
      amount_total: 'REAL',
      amount_tax: 'REAL',
      payer_name: 'TEXT',
      payee_name: 'TEXT',
      province: 'TEXT',
      city: 'TEXT',
      ocr_text: 'TEXT',
      ai_data: 'TEXT',
      ai_confidence: 'REAL',
      ai_needs_review: 'INTEGER DEFAULT 0',
      archived_at: 'TEXT',
      ocr_at: 'TEXT',
      ai_at: 'TEXT',
    };
    for (const [col, type] of Object.entries(migrations)) {
      if (!colNames.has(col)) {
        this.db.exec(`ALTER TABLE ${this.recordTableName} ADD COLUMN ${col} ${type};`);
      }
    }
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
