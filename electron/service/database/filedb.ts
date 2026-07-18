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
}

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
          is_dir INTEGER DEFAULT 0
        );
      `);
      // 索引加速查询
      this.db.exec(`CREATE INDEX idx_file_item_folder ON ${this.itemTableName} (folder_id);`);
      this.db.exec(`CREATE INDEX idx_file_item_parent ON ${this.itemTableName} (folder_id, parent_id);`);
    }
  }

  /**
   * 添加授权文件夹
   */
  addFolder(folderPath: string): AuthorizedFolder {
    const folderName = folderPath.split(/[\\/]/).pop() || folderPath;
    const addTime = new Date().toISOString();

    // 检查是否已存在
    const existing = this.db.prepare(`SELECT * FROM ${this.folderTableName} WHERE path = ?`).get(folderPath);
    if (existing) {
      throw new Error('该文件夹已添加');
    }

    const stmt = this.db.prepare(
      `INSERT INTO ${this.folderTableName} (path, folder_name, add_time, sync_enabled) VALUES (?, ?, ?, 0)`
    );
    const info = stmt.run(folderPath, folderName, addTime);
    return this.db.prepare(`SELECT * FROM ${this.folderTableName} WHERE id = ?`).get(info.lastInsertRowid) as AuthorizedFolder;
  }

  /**
   * 获取所有授权文件夹
   */
  getFolderList(): AuthorizedFolder[] {
    return this.db.prepare(`SELECT * FROM ${this.folderTableName} ORDER BY id DESC`).all() as AuthorizedFolder[];
  }

  /**
   * 批量添加文件/文件夹记录（扫描结果入库）
   * 利用 relativePath 顺序保证父目录先于子项插入
   */
  batchAddFileItems(folderId: number, items: ScanItem[]): void {
    if (!items.length) return;

    const insertStmt = this.db.prepare(
      `INSERT INTO ${this.itemTableName} (folder_id, parent_id, name, type, size, mtime, relative_path, is_dir)
       VALUES (@folderId, @parentId, @name, @type, @size, @mtime, @relativePath, @isDir)`
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
   * 清空某授权文件夹的所有文件记录（用于重新扫描前清理）
   */
  clearFileItems(folderId: number): void {
    this.db.prepare(`DELETE FROM ${this.itemTableName} WHERE folder_id = ?`).run(folderId);
  }

  /**
   * 重新扫描并更新某授权文件夹的数据
   */
  async rescanFolder(folderId: number): Promise<void> {
    const folder = this.getFolderById(folderId);
    if (!folder) return;

    // 引入 FolderScanner（延迟导入避免循环依赖）
    const FolderScanner = (await import('../../components/file/FolderScanner')).default;
    const scanItems = await FolderScanner.scanWithFolders(folder.path);

    this.db.transaction(() => {
      this.clearFileItems(folderId);
      this.batchAddFileItems(folderId, scanItems);
    })();

    logger.info(`[FiledbService] 重新扫描完成 folderId=${folderId}, items=${scanItems.length}`);
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
   * 根据 file_item id 获取记录
   */
  getFileItemById(folderId: number, itemId: number): FileItem | null {
    return this.db.prepare(
      `SELECT * FROM ${this.itemTableName} WHERE folder_id = ? AND id = ?`
    ).get(folderId, itemId) as FileItem | null;
  }
}

export const filedbService = new FiledbService();
