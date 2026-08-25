import { BasedbService } from './basedb';
import { logger } from 'ee-core/log';
import type { ScanItem } from '../../components/file/FolderScanner';

/**
 * 文件管理数据库 service
 */
export interface AuthorizedFolder {
  id: number;
  path: string;
  folder_name: string;
  add_time: string;
  sync_enabled: number;
  /** 协议类型：local / ftp / ftps / sftp / smb / webdav / s3 */
  protocol: string;
  /** 协议连接配置（JSON 字符串，仅远程协议有值） */
  protocol_config: string | null;
  /** 文件夹别名（用户自定义名称，可选） */
  alias: string | null;
}

/** 文件状态：待处理/处理中/就绪/失败 */
export type FileStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

export interface FileItem {
  id: number;
  folder_id: number;
  parent_id: number;
  name: string;
  type: string;
  size: number;
  mtime: string;
  relative_path: string;
  is_dir: number;
  /** RAG 处理状态 */
  status: FileStatus;
  /** 失败原因（status=FAILED 时有值） */
  failure_reason: string | null;
  /** RAG 处理完成时间 */
  processed_at: string | null;
  /** 文件 SHA-256 哈希（用于秒传判断） */
  file_hash: string | null;
}

export interface FileItemTreeNode extends FileItem {
  fileCount: number;
  isRoot?: boolean; // 虚拟根节点标识
  fullPath?: string; // 完整路径（虚拟根节点用）
  children?: FileItemTreeNode[];
}

class FiledbService extends BasedbService {
  private folderTableName = 'authorized_folder';
  private itemTableName = 'file_item';

  constructor() {
    super({ dbname: 'file-manager.db' });
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
          add_time TEXT,
          sync_enabled INTEGER DEFAULT 0
        );
      `);
    }

    // 文件/文件夹记录表
    if (!masterStmt.get('table', this.itemTableName)) {
      this.db.exec(`
        CREATE TABLE ${this.itemTableName}
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
          status TEXT DEFAULT 'PENDING',
          failure_reason TEXT,
          processed_at TEXT,
          file_hash TEXT
        );
      `);
      // 索引加速查询
      this.db.exec(`CREATE INDEX idx_file_item_folder ON ${this.itemTableName} (folder_id);`);
      this.db.exec(`CREATE INDEX idx_file_item_parent ON ${this.itemTableName} (folder_id, parent_id);`);
      this.db.exec(`CREATE INDEX idx_file_item_status ON ${this.itemTableName} (status);`);
    }

    // 表结构迁移：为旧表补充新字段（ALTER TABLE 幂等检测）
    this._migrateFileItemTable();
    this._migrateFolderTable();
  }

  /**
   * 迁移 file_item 表：补充 status / failure_reason / processed_at / file_hash 字段
   */
  private _migrateFileItemTable(): void {
    const columns = this.db.prepare(`PRAGMA table_info(${this.itemTableName})`).all() as { name: string }[];
    const colNames = new Set(columns.map(c => c.name));

    if (!colNames.has('status')) {
      this.db.exec(`ALTER TABLE ${this.itemTableName} ADD COLUMN status TEXT DEFAULT 'PENDING';`);
    }
    if (!colNames.has('failure_reason')) {
      this.db.exec(`ALTER TABLE ${this.itemTableName} ADD COLUMN failure_reason TEXT;`);
    }
    if (!colNames.has('processed_at')) {
      this.db.exec(`ALTER TABLE ${this.itemTableName} ADD COLUMN processed_at TEXT;`);
    }
    if (!colNames.has('file_hash')) {
      this.db.exec(`ALTER TABLE ${this.itemTableName} ADD COLUMN file_hash TEXT;`);
    }
  }

  /**
   * 添加授权文件夹（本地）
   */
  addFolder(folderPath: string, alias?: string): AuthorizedFolder {
    const folderName = alias || folderPath.split(/[\\/]/).pop() || folderPath;
    const addTime = new Date().toISOString();

    // 检查是否已存在
    const existing = this.db.prepare(`SELECT * FROM ${this.folderTableName} WHERE path = ?`).get(folderPath);
    if (existing) {
      throw new Error('该文件夹已添加');
    }

    const stmt = this.db.prepare(
      `INSERT INTO ${this.folderTableName} (path, folder_name, add_time, sync_enabled, protocol) VALUES (?, ?, ?, 0, 'local')`
    );
    const info = stmt.run(folderPath, folderName, addTime);
    return this.db.prepare(`SELECT * FROM ${this.folderTableName} WHERE id = ?`).get(info.lastInsertRowid) as AuthorizedFolder;
  }

  /**
   * 添加远程协议文件夹
   */
  addRemoteFolder(params: {
    protocol: string;
    path: string;
    alias?: string;
    config: Record<string, unknown>;
  }): AuthorizedFolder {
    const folderName = params.alias || params.path.split(/[\\/]/).pop() || params.path;
    const addTime = new Date().toISOString();
    const configJson = JSON.stringify(params.config);

    // 检查是否已存在（同协议 + 同路径）
    const existing = this.db.prepare(
      `SELECT * FROM ${this.folderTableName} WHERE protocol = ? AND path = ?`
    ).get(params.protocol, params.path);
    if (existing) {
      throw new Error('该文件夹已添加');
    }

    const stmt = this.db.prepare(
      `INSERT INTO ${this.folderTableName} (path, folder_name, add_time, sync_enabled, protocol, protocol_config, alias)
       VALUES (?, ?, ?, 0, ?, ?, ?)`
    );
    const info = stmt.run(params.path, folderName, addTime, params.protocol, configJson, params.alias || null);
    return this.db.prepare(`SELECT * FROM ${this.folderTableName} WHERE id = ?`).get(info.lastInsertRowid) as AuthorizedFolder;
  }

  /**
   * 更新远程协议文件夹配置
   *
   * 修改连接参数（host/port/username/password/remotePath 等），
   * 保留 id 和已扫描的文件记录。
   */
  updateRemoteFolder(id: number, params: {
    protocol: string;
    path: string;
    alias?: string;
    config: Record<string, unknown>;
  }): AuthorizedFolder | null {
    const folderName = params.alias || params.path.split(/[\\/]/).pop() || params.path;
    const configJson = JSON.stringify(params.config);

    this.db.prepare(
      `UPDATE ${this.folderTableName} SET path = ?, folder_name = ?, protocol = ?, protocol_config = ?, alias = ? WHERE id = ?`
    ).run(params.path, folderName, params.protocol, configJson, params.alias || null, id);

    return this.db.prepare(`SELECT * FROM ${this.folderTableName} WHERE id = ?`).get(id) as AuthorizedFolder | null;
  }

  /**
   * 获取所有授权文件夹（含每个文件夹下的文件数量）
   */
  getFolderList(): AuthorizedFolder[] {
    return this.db.prepare(
      `SELECT f.*, (SELECT COUNT(*) FROM ${this.itemTableName} WHERE folder_id = f.id AND is_dir = 0) AS file_count FROM ${this.folderTableName} f ORDER BY f.id DESC`
    ).all() as AuthorizedFolder[];
  }

  /**
   * 批量添加文件/文件夹记录（扫描结果入库）
   * 利用 relativePath 顺序保证父目录先于子项插入
   */
  batchAddFileItems(folderId: number, items: ScanItem[]): void {
    if (!items.length) return;

    const insertStmt = this.db.prepare(
      `INSERT INTO ${this.itemTableName} (folder_id, parent_id, name, type, size, mtime, relative_path, is_dir, status)
       VALUES (@folderId, @parentId, @name, @type, @size, @mtime, @relativePath, @isDir, 'PENDING')`
    );

    // relativePath -> dbId 映射
    const pathMap = new Map<string, number>();

    const insertAll = this.db.transaction(() => {
      for (const item of items) {
        const parentId = item.parentPath ? (pathMap.get(item.parentPath) || 0) : 0;
        const info = insertStmt.run({
          folderId,
          parentId,
          name: item.name,
          type: item.type,
          size: item.size,
          mtime: item.mtime,
          relativePath: item.relativePath,
          isDir: item.isDir ? 1 : 0,
        });
        pathMap.set(item.relativePath, Number(info.lastInsertRowid));
      }
    });

    insertAll();
    logger.info(`[FiledbService] 批量插入 ${items.length} 条记录，folderId=${folderId}`);
  }

  /**
   * 获取子文件夹树形结构（第一级为授权文件夹本身作为虚拟根节点）
   */
  getSubFolderTree(folderId: number): FileItemTreeNode[] {
    const folder = this.getFolderById(folderId);
    if (!folder) return [];

    const rows = this.db.prepare(
      `SELECT * FROM ${this.itemTableName} WHERE folder_id = ? AND is_dir = 1 ORDER BY name`
    ).all(folderId) as FileItem[];

    // 统计每个文件夹的文件数
    const countStmt = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM ${this.itemTableName} WHERE folder_id = ? AND parent_id = ? AND is_dir = 0`
    );

    // 构建 id -> node 映射
    const nodeMap = new Map<number, FileItemTreeNode>();

    for (const row of rows) {
      const fileCount = (countStmt.get(folderId, row.id) as { cnt: number }).cnt;
      nodeMap.set(row.id, { ...row, fileCount, children: [] });
    }

    // 构建子树
    const childNodes: FileItemTreeNode[] = [];
    for (const row of rows) {
      const node = nodeMap.get(row.id)!;
      if (row.parent_id === 0) {
        childNodes.push(node);
      } else {
        const parent = nodeMap.get(row.parent_id);
        if (parent) {
          parent.children!.push(node);
        } else {
          childNodes.push(node);
        }
      }
    }

    // 虚拟根节点：授权文件夹本身
    const rootFileCount = (countStmt.get(folderId, 0) as { cnt: number }).cnt;
    const rootNode: FileItemTreeNode = {
      id: 0,
      folder_id: folderId,
      parent_id: -1,
      name: folder.folder_name || folder.path,
      type: 'folder',
      size: 0,
      mtime: folder.add_time,
      relative_path: '',
      is_dir: 1,
      status: 'PENDING',
      failure_reason: null,
      processed_at: null,
      file_hash: null,
      fileCount: rootFileCount,
      isRoot: true,
      fullPath: folder.path,
      children: childNodes,
    };

    return [rootNode];
  }

  /**
   * 获取某文件夹下的文件列表（右侧表格）
   * parentId=0 表示授权文件夹根目录
   */
  getFiles(folderId: number, parentId: number): FileItem[] {
    return this.db.prepare(
      `SELECT * FROM ${this.itemTableName} WHERE folder_id = ? AND parent_id = ? AND is_dir = 0 ORDER BY name`
    ).all(folderId, parentId) as FileItem[];
  }

  /**
   * 根据 id 获取单个文件记录
   */
  getFileItemById(id: number): FileItem | null {
    return this.db.prepare(
      `SELECT * FROM ${this.itemTableName} WHERE id = ?`
    ).get(id) as FileItem | null;
  }

  /**
   * 更新文件状态
   */
  updateFileStatus(id: number, status: FileStatus, failureReason: string | null = null): void {
    this.db.prepare(
      `UPDATE ${this.itemTableName} SET status = ?, failure_reason = ?, processed_at = datetime('now') WHERE id = ?`
    ).run(status, failureReason, id);
  }

  /**
   * 更新文件哈希
   */
  updateFileHash(id: number, fileHash: string): void {
    this.db.prepare(
      `UPDATE ${this.itemTableName} SET file_hash = ? WHERE id = ?`
    ).run(fileHash, id);
  }

  /**
   * 查询同 folder 下指定状态的文件
   */
  getFilesByStatus(folderId: number, status: FileStatus): FileItem[] {
    return this.db.prepare(
      `SELECT * FROM ${this.itemTableName} WHERE folder_id = ? AND status = ? AND is_dir = 0 ORDER BY name`
    ).all(folderId, status) as FileItem[];
  }

  /**
   * 重置某授权文件夹下所有文件的状态为 PENDING（用于重新扫描后重新向量化）
   */
  resetFileStatusByFolder(folderId: number): void {
    this.db.prepare(
      `UPDATE ${this.itemTableName} SET status = 'PENDING', failure_reason = NULL, processed_at = NULL WHERE folder_id = ? AND is_dir = 0`
    ).run(folderId);
  }

  /**
   * 清空某授权文件夹的所有文件记录（用于重新扫描前清理）
   */
  clearFileItems(folderId: number): void {
    this.db.prepare(`DELETE FROM ${this.itemTableName} WHERE folder_id = ?`).run(folderId);
  }

  /**
   * 智能同步扫描：对比磁盘与数据库，保留未变化文件的 hash/status
   *
   * 与旧的 rescanFolder（全清全插）不同，此方法：
   *   - 保留未变化文件的 file_hash、status（避免重复向量化）
   *   - 检测被删除的文件（返回 deleted 列表，用于清理 RAG 数据）
   *   - 检测内容变化的文件（mtime/size 不同 → 重置为 PENDING，用于重新向量化）
   *
   * @returns 同步结果（added / deleted / changed / unchanged）
   */
  async syncScanFolder(folderId: number): Promise<{
    added: FileItem[];
    deleted: FileItem[];
    changed: FileItem[];
    unchanged: FileItem[];
  }> {
    const folder = this.getFolderById(folderId);
    if (!folder) return { added: [], deleted: [], changed: [], unchanged: [] };

    // 引入 FolderScanner（延迟导入避免循环依赖）
    const FolderScanner = (await import('../../components/file/FolderScanner')).default;
    const scanItems = await FolderScanner.scanWithFolders(folder);

    // 获取数据库中现有的所有文件/文件夹记录
    const existingItems = this.db.prepare(
      `SELECT * FROM ${this.itemTableName} WHERE folder_id = ?`
    ).all(folderId) as FileItem[];

    // 构建 relative_path -> existingItem 映射
    const existingMap = new Map<string, FileItem>();
    for (const item of existingItems) {
      existingMap.set(item.relative_path, item);
    }

    // 构建 scanItems 的 relative_path 集合
    const scanPathSet = new Set(scanItems.map(s => s.relativePath));

    const added: FileItem[] = [];
    const deleted: FileItem[] = [];
    const changed: FileItem[] = [];
    const unchanged: FileItem[] = [];

    // ── 检测删除和变化 ──
    const deleteStmt = this.db.prepare(`DELETE FROM ${this.itemTableName} WHERE id = ?`);
    const updateFileStmt = this.db.prepare(
      `UPDATE ${this.itemTableName} SET size = ?, mtime = ?, status = 'PENDING', failure_reason = NULL WHERE id = ?`
    );
    const updateDirStmt = this.db.prepare(
      `UPDATE ${this.itemTableName} SET size = ?, mtime = ? WHERE id = ?`
    );

    const syncTx = this.db.transaction(() => {
      for (const existing of existingItems) {
        if (!scanPathSet.has(existing.relative_path)) {
          // 文件/文件夹被删除
          deleted.push(existing);
          deleteStmt.run(existing.id);
        }
      }

      // ── 插入新增项 + 更新已有项 ──
      const pathMap = new Map<string, number>();
      // 先填充已有项的 relative_path -> id 映射
      for (const existing of existingItems) {
        if (scanPathSet.has(existing.relative_path)) {
          pathMap.set(existing.relative_path, existing.id);
        }
      }

      const insertStmt = this.db.prepare(
        `INSERT INTO ${this.itemTableName} (folder_id, parent_id, name, type, size, mtime, relative_path, is_dir, status)
         VALUES (@folderId, @parentId, @name, @type, @size, @mtime, @relativePath, @isDir, 'PENDING')`
      );

      for (const item of scanItems) {
        const parentId = item.parentPath ? (pathMap.get(item.parentPath) || 0) : 0;
        const existing = existingMap.get(item.relativePath);

        if (existing) {
          // 已有记录，检查是否变化
          if (existing.is_dir) {
            // 文件夹：更新 mtime
            updateDirStmt.run(item.size, item.mtime, existing.id);
            pathMap.set(item.relativePath, existing.id);
          } else {
            // 文件：对比 mtime 和 size
            if (existing.mtime !== item.mtime || existing.size !== item.size) {
              // 内容变化：重置状态为 PENDING，保留 file_hash（向量化时会重新计算并对比）
              updateFileStmt.run(item.size, item.mtime, existing.id);
              changed.push({ ...existing, size: item.size, mtime: item.mtime, status: 'PENDING' });
            } else {
              // 未变化：保留 hash 和 status
              unchanged.push(existing);
            }
            pathMap.set(item.relativePath, existing.id);
          }
        } else {
          // 新增项
          const info = insertStmt.run({
            folderId,
            parentId,
            name: item.name,
            type: item.type,
            size: item.size,
            mtime: item.mtime,
            relativePath: item.relativePath,
            isDir: item.isDir ? 1 : 0,
          });
          pathMap.set(item.relativePath, Number(info.lastInsertRowid));

          // 新增的文件加入 added 列表
          if (!item.isDir) {
            added.push({
              id: Number(info.lastInsertRowid),
              folder_id: folderId,
              parent_id: parentId,
              name: item.name,
              type: item.type,
              size: item.size,
              mtime: item.mtime,
              relative_path: item.relativePath,
              is_dir: 0,
              status: 'PENDING',
              failure_reason: null,
              processed_at: null,
              file_hash: null,
            });
          }
        }
      }
    });

    syncTx();

    logger.info(
      `[FiledbService] 同步扫描完成 folderId=${folderId}: added=${added.length}, deleted=${deleted.length}, changed=${changed.length}, unchanged=${unchanged.length}`
    );

    return { added, deleted, changed, unchanged };
  }

  /**
   * 重新扫描并更新某授权文件夹的数据（保留 hash/status 的智能同步）
   * @deprecated 请使用 syncScanFolder 获取详细同步结果
   */
  async rescanFolder(folderId: number): Promise<void> {
    await this.syncScanFolder(folderId);
  }

  /**
   * 删除授权文件夹及其所有关联记录
   */
  deleteFolder(folderId: number): void {
    this.db.transaction(() => {
      this.db.prepare(`DELETE FROM ${this.itemTableName} WHERE folder_id = ?`).run(folderId);
      this.db.prepare(`DELETE FROM ${this.folderTableName} WHERE id = ?`).run(folderId);
    })();
    logger.info(`[FiledbService] 删除授权文件夹 folderId=${folderId}`);
  }

  /**
   * 切换同步状态
   */
  toggleSync(folderId: number): AuthorizedFolder | null {
    this.db.prepare(
      `UPDATE ${this.folderTableName} SET sync_enabled = CASE WHEN sync_enabled = 1 THEN 0 ELSE 1 END WHERE id = ?`
    ).run(folderId);
    return this.db.prepare(`SELECT * FROM ${this.folderTableName} WHERE id = ?`).get(folderId) as AuthorizedFolder | null;
  }

  /**
   * 根据 id 获取单个文件夹
   */
  getFolderById(folderId: number): AuthorizedFolder | null {
    return this.db.prepare(`SELECT * FROM ${this.folderTableName} WHERE id = ?`).get(folderId) as AuthorizedFolder | null;
  }

  /**
   * 迁移 authorized_folder 表：补充 protocol / protocol_config / alias 字段
   */
  private _migrateFolderTable(): void {
    const columns = this.db.prepare(`PRAGMA table_info(${this.folderTableName})`).all() as { name: string }[];
    const colNames = new Set(columns.map(c => c.name));

    if (!colNames.has('protocol')) {
      this.db.exec(`ALTER TABLE ${this.folderTableName} ADD COLUMN protocol TEXT DEFAULT 'local';`);
    }
    if (!colNames.has('protocol_config')) {
      this.db.exec(`ALTER TABLE ${this.folderTableName} ADD COLUMN protocol_config TEXT;`);
    }
    if (!colNames.has('alias')) {
      this.db.exec(`ALTER TABLE ${this.folderTableName} ADD COLUMN alias TEXT;`);
    }
  }
}

export const filedbService = new FiledbService();
