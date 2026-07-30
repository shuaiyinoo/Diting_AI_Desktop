import { dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import type { IpcMainEvent } from 'electron';
import { logger } from 'ee-core/log';
import { filedbService } from '../service/database/filedb';
import type { AuthorizedFolder, FileItemTreeNode, FileItem } from '../service/database/filedb';
import FolderScanner from '../components/file/FolderScanner';
import SyncService from '../components/file/SyncService';
import type { SyncScanResult } from '../components/file/SyncService';
import { ragService, isVectorSupported } from '../components/rag';

// 新建文件的空白模板（基于 OnlyofficePersonal/blank）
const BLANK_TEMPLATES: Record<string, string> = {
  docx: 'blank.docx',
  xlsx: 'blank.xlsx',
  pptx: 'blank.pptx',
};

// 文件变化通知通道
const SYNC_CHANGE_CHANNEL = 'controller/file/onSyncChange';
// RAG 向量化进度通知通道
const RAG_PROGRESS_CHANNEL = 'controller/file/onRagProgress';

/**
 * 文件管理控制器
 *
 * RAG 向量化策略：
 *   1. 队列串行处理：一次只处理 1 个文件，防止大量文件同时向量化导致卡死
 *   2. 哈希变化检测：文件 hash 未变化且已 READY → 跳过；hash 变化 → 先删旧数据再重做
 *   3. 文件删除清理：文件被删除时，清理对应的向量 + 关键字索引数据
 *
 * @class
 */
class FileController {
  /** 保存前端 IPC event 引用，用于推送进度 */
  private ipcEvent: IpcMainEvent | null = null;
  /** 标记启动同步是否已执行 */
  private startupSynced = false;

  constructor() {
    // 注册 RAG 队列进度回调
    ragService.setProgressCallback((info) => {
      this.onRagQueueProgress(info);
    });
  }

  /**
   * RAG 队列进度回调 → 推送到前端
   */
  private onRagQueueProgress(info: {
    type: 'ingest' | 'delete' | 'skip' | 'idle';
    fileItemId: number;
    fileName?: string;
    queueSize: number;
    status: string;
  }): void {
    if (!this.ipcEvent) return;
    try {
      this.ipcEvent.sender.send(RAG_PROGRESS_CHANNEL, {
        ...info,
        timestamp: Date.now(),
      });
    } catch {
      // event 可能已断开
    }
  }

  /**
   * 注册文件变化监听（前端调用，建立 IPC 通道）
   * 同时启动首次同步扫描 + 入队 RAG 任务
   */
  registerSyncCallback(_args: unknown, event: IpcMainEvent): void {
    this.ipcEvent = event;

    SyncService.setChangeCallback((result: SyncScanResult) => {
      // 1. 通知前端刷新
      event.sender.send(SYNC_CHANGE_CHANNEL, { folderId: result.folderId });

      // 2. 处理 RAG 队列任务
      this.handleSyncResultForRag(result);
    });

    logger.info('[FileController] 注册文件变化回调');

    // 首次注册时，启动同步扫描（如果尚未执行）
    if (!this.startupSynced) {
      this.startupSynced = true;
      this.startupSyncAndEnqueue().catch(err => {
        logger.error('[FileController] 启动同步异常:', err);
      });
    }
  }

  /**
   * 启动时的首次同步：
   *   1. 对所有授权文件夹执行智能同步扫描
   *   2. 启动文件监听
   *   3. 将新增/变化的文件入队向量化，删除的文件入队清理
   */
  private async startupSyncAndEnqueue(): Promise<void> {
    logger.info('[FileController] 启动同步扫描开始');

    const folders = filedbService.getFolderList();
    for (const folder of folders) {
      try {
        const result = await filedbService.syncScanFolder(folder.id);
        logger.info(
          `[FileController] 启动同步 folderId=${folder.id}: added=${result.added.length}, deleted=${result.deleted.length}, changed=${result.changed.length}, unchanged=${result.unchanged.length}`
        );
        this.handleSyncResultForRag({ folderId: folder.id, ...result });
      } catch (err) {
        logger.error(`[FileController] 启动同步失败 folderId=${folder.id}:`, err);
      }
    }

    // 启动文件监听
    SyncService.startWatchAll();

    logger.info('[FileController] 启动同步扫描完成');
  }

  /**
   * 根据同步扫描结果，将文件入队 RAG 处理
   *   - added: 入队向量化
   *   - changed: 入队向量化（hash 会重新计算，变化则重做）
   *   - deleted: 入队清理 RAG 数据
   *   - unchanged: 不处理（hash 和 status 已保留）
   */
  private handleSyncResultForRag(result: SyncScanResult): void {
    const folder = filedbService.getFolderById(result.folderId);
    if (!folder) return;
    const folderPath = folder.path;

    // 新增文件 → 入队向量化
    for (const file of result.added) {
      if (isVectorSupported(file.name)) {
        ragService.enqueueIngest(file.id, file.folder_id, folderPath);
      }
    }

    // 变化文件 → 入队向量化（hash 对比在队列中执行）
    for (const file of result.changed) {
      if (isVectorSupported(file.name)) {
        ragService.enqueueIngest(file.id, file.folder_id, folderPath);
      }
    }

    // 删除文件 → 入队清理 RAG 数据
    for (const file of result.deleted) {
      ragService.enqueueDelete(file.id);
    }
  }

  /**
   * 添加授权文件夹：弹窗选择 → 入库 → 扫描 → 批量入库 → 启动监听 → 入队向量化
   */
  async addFolder(): Promise<{ success: boolean; folder?: AuthorizedFolder; folderList: AuthorizedFolder[]; message?: string }> {
    // 1. 弹窗选择文件夹
    const filePaths = dialog.showOpenDialogSync({
      properties: ['openDirectory', 'createDirectory'],
    });

    if (!filePaths || !filePaths.length) {
      return { success: false, folderList: filedbService.getFolderList(), message: '用户取消选择' };
    }

    const folderPath = filePaths[0];

    try {
      // 2. 存入授权文件夹表
      const folder = filedbService.addFolder(folderPath);
      logger.info(`[FileController] 添加授权文件夹: ${folderPath}, id=${folder.id}`);

      // 3. 递归扫描文件夹
      const scanItems = await FolderScanner.scanWithFolders(folderPath);
      logger.info(`[FileController] 扫描完成，共 ${scanItems.length} 项`);

      // 4. 批量入库（文件状态默认为 PENDING）
      filedbService.batchAddFileItems(folder.id, scanItems);

      // 5. 启动监听该文件夹
      SyncService.watchFolder(folder);

      // 6. 获取所有 PENDING 文件，入队向量化（队列串行处理，防止卡死）
      const pendingFiles = filedbService.getFilesByStatus(folder.id, 'PENDING');
      const ingestItems = pendingFiles
        .filter(f => isVectorSupported(f.name))
        .map(f => ({ fileItemId: f.id, folderId: f.folder_id, folderPath: folder.path }));
      ragService.enqueueIngestBatch(ingestItems);

      logger.info(`[FileController] 已入队 ${ingestItems.length} 个文件进行向量化`);

      // 7. 返回最新列表
      return {
        success: true,
        folder,
        folderList: filedbService.getFolderList(),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[FileController] 添加文件夹失败:', msg);
      return {
        success: false,
        folderList: filedbService.getFolderList(),
        message: msg,
      };
    }
  }

  /**
   * 获取授权文件夹列表
   */
  getFolderList(): AuthorizedFolder[] {
    return filedbService.getFolderList();
  }

  /**
   * 获取子文件夹树形结构（左下树形表格）
   */
  getSubFolders(args: { folderId: number }): FileItemTreeNode[] {
    const { folderId } = args;
    return filedbService.getSubFolderTree(folderId);
  }

  /**
   * 获取某文件夹下的文件列表（右侧表格）
   * itemId=0 表示授权文件夹根目录
   * 返回的文件记录包含 status 字段
   */
  getFiles(args: { folderId: number; itemId: number }): FileItem[] {
    const { folderId, itemId } = args;
    return filedbService.getFiles(folderId, itemId);
  }

  /**
   * 重新扫描所有授权文件夹（程序启动时调用）
   * 使用智能同步：保留 hash/status，检测删除和变化
   */
  async rescanAll(): Promise<{ success: boolean }> {
    const folders = filedbService.getFolderList();
    for (const folder of folders) {
      try {
        const result = await filedbService.syncScanFolder(folder.id);
        this.handleSyncResultForRag({ folderId: folder.id, ...result });
      } catch (err) {
        logger.error(`[FileController] 重新扫描失败 folderId=${folder.id}:`, err);
      }
    }
    return { success: true };
  }

  /**
   * 删除授权文件夹
   * 清理该文件夹下所有文件的 RAG 数据（入队删除任务）
   */
  async deleteFolder(args: { folderId: number }): Promise<{ success: boolean; folderList: AuthorizedFolder[] }> {
    const { folderId } = args;
    // 停止监听该文件夹
    SyncService.unwatchFolder(folderId);

    // 获取该文件夹下所有已向量化的文件，入队删除 RAG 数据
    try {
      const readyFiles = filedbService.getFilesByStatus(folderId, 'READY');
      for (const file of readyFiles) {
        ragService.enqueueDelete(file.id);
      }
      // 也处理其他状态的文件
      const pendingFiles = filedbService.getFilesByStatus(folderId, 'PENDING');
      const failedFiles = filedbService.getFilesByStatus(folderId, 'FAILED');
      const processingFiles = filedbService.getFilesByStatus(folderId, 'PROCESSING');
      for (const file of [...pendingFiles, ...failedFiles, ...processingFiles]) {
        ragService.enqueueDelete(file.id);
      }
    } catch (err) {
      logger.error(`[FileController] 清理 RAG 数据失败 folderId=${folderId}:`, err);
    }

    filedbService.deleteFolder(folderId);
    return { success: true, folderList: filedbService.getFolderList() };
  }

  /**
   * 切换同步状态
   */
  toggleSync(args: { folderId: number }): AuthorizedFolder | null {
    const { folderId } = args;
    return filedbService.toggleSync(folderId);
  }

  // ═══════════════════════════════════════════
  // RAG 向量化相关
  // ═══════════════════════════════════════════

  /**
   * 手动触发某授权文件夹的向量化（前端按钮调用）
   * 将该文件夹下所有 PENDING/FAILED 的支持文件入队
   */
  async startIngestion(
    args: { folderId: number },
    _event?: IpcMainEvent
  ): Promise<{ success: boolean; message?: string; queued: number }> {
    const { folderId } = args;
    const folder = filedbService.getFolderById(folderId);
    if (!folder) {
      return { success: false, message: '授权文件夹不存在', queued: 0 };
    }

    try {
      // 获取所有 PENDING 和 FAILED 的文件，入队重试
      const pendingFiles = filedbService.getFilesByStatus(folderId, 'PENDING');
      const failedFiles = filedbService.getFilesByStatus(folderId, 'FAILED');

      // 将 FAILED 文件重置为 PENDING
      for (const file of failedFiles) {
        filedbService.updateFileStatus(file.id, 'PENDING');
      }

      const allFiles = [...pendingFiles, ...failedFiles];
      const ingestItems = allFiles
        .filter(f => isVectorSupported(f.name))
        .map(f => ({ fileItemId: f.id, folderId: f.folder_id, folderPath: folder.path }));

      ragService.enqueueIngestBatch(ingestItems);

      logger.info(`[FileController] 手动入队 ${ingestItems.length} 个文件进行向量化 folderId=${folderId}`);
      return { success: true, queued: ingestItems.length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[FileController] 手动向量化失败 folderId=${folderId}:`, err);
      return { success: false, message: msg, queued: 0 };
    }
  }

  /**
   * 重新向量化单个文件（入队）
   */
  async reingestFile(args: { fileItemId: number }): Promise<{ success: boolean; message?: string }> {
    const { fileItemId } = args;
    const fileItem = filedbService.getFileItemById(fileItemId);
    if (!fileItem) {
      return { success: false, message: '文件记录不存在' };
    }

    const folder = filedbService.getFolderById(fileItem.folder_id);
    if (!folder) {
      return { success: false, message: '授权文件夹不存在' };
    }

if (!isVectorSupported(fileItem.name)) {
return { success: false, message: `不支持的文件类型: ${fileItem.name}` };
}

    // 重置状态为 PENDING，然后入队
    filedbService.updateFileStatus(fileItemId, 'PENDING');
    ragService.enqueueIngest(fileItemId, fileItem.folder_id, folder.path);
    return { success: true, message: '已入队向量化' };
  }

  /**
   * 获取 RAG 统计信息（含队列状态）
   */
  getRagStats(): { vectorizedFiles: number; keywordDocs: number; queueSize: number; processing: boolean } {
    return ragService.getStats();
  }

  /**
   * 检查文件类型是否支持向量化
   */
  checkFileSupported(args: { fileName: string }): { supported: boolean } {
    return { supported: isVectorSupported(args.fileName) };
  }

  // ═══════════════════════════════════════════
  // 文件查看相关
  // ═══════════════════════════════════════════

  /**
   * 获取文件的完整本地路径
   * @param fileItemId 文件项 ID
   * @returns 完整路径或 null
   */
  private resolveFilePath(fileItemId: number): string | null {
    const fileItem = filedbService.getFileItemById(fileItemId);
    if (!fileItem) {
      return null;
    }

    const folder = filedbService.getFolderById(fileItem.folder_id);
    if (!folder) {
      return null;
    }

    return path.join(folder.path, fileItem.relative_path);
  }

  /**
   * 获取文件信息（不包含文件内容）
   * 用于前端预检查文件是否存在、是否可查看
   */
  getFileInfo(args: { fileItemId: number }): {
    success: boolean;
    name?: string;
    size?: number;
    type?: string;
    message?: string;
  } {
    const { fileItemId } = args;
    const fileItem = filedbService.getFileItemById(fileItemId);
    if (!fileItem) {
      return { success: false, message: '文件记录不存在' };
    }

    const filePath = this.resolveFilePath(fileItemId);
    if (!filePath) {
      return { success: false, message: '文件所在授权文件夹不存在' };
    }

    if (!fs.existsSync(filePath)) {
      return { success: false, message: '文件在磁盘上不存在，可能已被删除或移动' };
    }

    return {
      success: true,
      name: fileItem.name,
      size: fileItem.size,
      type: fileItem.type,
    };
  }

  /**
   * 读取本地文件内容并返回给前端
   * 前端将其包装为 File 对象传给 @file-viewer/vue3-full 组件
   *
   * @returns 包含文件二进制数据的对象，buffer 为 Node Buffer（IPC 序列化为 Uint8Array）
   */
  getFileData(args: { fileItemId: number }): {
    success: boolean;
    buffer?: Buffer;
    name?: string;
    size?: number;
    type?: string;
    message?: string;
  } {
    const { fileItemId } = args;
    const fileItem = filedbService.getFileItemById(fileItemId);
    if (!fileItem) {
      return { success: false, message: '文件记录不存在' };
    }

    const filePath = this.resolveFilePath(fileItemId);
    if (!filePath) {
      return { success: false, message: '文件所在授权文件夹不存在' };
    }

    if (!fs.existsSync(filePath)) {
      return { success: false, message: '文件在磁盘上不存在，可能已被删除或移动' };
    }

    try {
      const buffer = fs.readFileSync(filePath);
      logger.info(`[FileController] 读取文件成功: ${fileItem.name}, size=${buffer.length}`);
      return {
        success: true,
        buffer,
        name: fileItem.name,
        size: buffer.length,
        type: fileItem.type,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[FileController] 读取文件失败: ${filePath}:`, err);
      return { success: false, message: `读取文件失败: ${msg}` };
    }
  }

  // ═══════════════════════════════════════════
  // 新建文件
  // ═══════════════════════════════════════════

  /**
   * 新建空白文件
   * @param args.folderId 授权文件夹 ID
   * @param args.parentId 父目录 ID（0=根目录）
   * @param args.fileName 文件名（含后缀）
   * @returns 新建的文件项
   */
  async createFile(args: { folderId: number; parentId: number; fileName: string }): Promise<{
    success: boolean;
    fileItem?: FileItem;
    message?: string;
  }> {
    const { folderId, parentId, fileName } = args;

    const folder = filedbService.getFolderById(folderId);
    if (!folder) {
      return { success: false, message: '授权文件夹不存在' };
    }

    // 确定父目录路径
    let parentPath = folder.path;
    if (parentId > 0) {
      const parentItem = filedbService.getFileItemById(parentId);
      if (parentItem && parentItem.is_dir) {
        parentPath = path.join(folder.path, parentItem.relative_path);
      }
    }

    const filePath = path.join(parentPath, fileName);

    // 文件已存在
    if (fs.existsSync(filePath)) {
      return { success: false, message: '文件已存在' };
    }

    const ext = path.extname(fileName).toLowerCase().replace('.', '');

    try {
      // 确保目录存在
      fs.mkdirSync(parentPath, { recursive: true });

      if (BLANK_TEMPLATES[ext]) {
        // docx/xlsx/pptx: 使用空白模板
        const templatePath = path.join(process.cwd(), 'public', 'onlyoffice', 'blank', BLANK_TEMPLATES[ext]);
        if (fs.existsSync(templatePath)) {
          fs.copyFileSync(templatePath, filePath);
        } else {
          // 模板不存在则创建空文件
          fs.writeFileSync(filePath, Buffer.alloc(0));
          logger.warn(`[FileController] 空白模板不存在: ${templatePath}，创建空文件`);
        }
      } else if (ext === 'pdf') {
        // PDF: 使用空白 PDF 模板
        const templatePath = path.join(process.cwd(), 'public', 'onlyoffice', 'assets', 'empty.pdf');
        if (fs.existsSync(templatePath)) {
          fs.copyFileSync(templatePath, filePath);
        } else {
          // 最小 PDF
          fs.writeFileSync(filePath, Buffer.from('%PDF-1.4\n%%EOF'));
        }
      } else if (ext === 'md') {
        // Markdown: 创建空文本
        fs.writeFileSync(filePath, '', 'utf-8');
      } else {
        fs.writeFileSync(filePath, Buffer.alloc(0));
      }

      // 计算相对路径
      const relativePath = path.relative(folder.path, filePath);
      const stat = fs.statSync(filePath);

      // 插入数据库记录
      const db = (filedbService as any).db;
      const tableName = (filedbService as any).itemTableName;
      const insertStmt = db.prepare(
        `INSERT INTO ${tableName} (folder_id, parent_id, name, type, size, mtime, relative_path, is_dir, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'PENDING')`
      );
      const info = insertStmt.run(folderId, parentId, fileName, ext, stat.size, stat.mtime.toISOString(), relativePath);
      const fileItem = filedbService.getFileItemById(Number(info.lastInsertRowid));

      logger.info(`[FileController] 新建文件成功: ${fileName}, path=${filePath}`);

      return { success: true, fileItem: fileItem || undefined };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[FileController] 新建文件失败: ${fileName}:`, err);
      return { success: false, message: `新建文件失败: ${msg}` };
    }
  }

  /**
   * 保存文件数据到磁盘
   * OnlyOffice 编辑器自动保存或手动保存时调用
   * @param args.fileItemId 文件项 ID
   * @param args.buffer 文件二进制数据（IPC 传输为 Uint8Array）
   */
  saveFileData(args: { fileItemId: number; buffer: Uint8Array }): {
    success: boolean;
    message?: string;
  } {
    const { fileItemId, buffer } = args;
    const fileItem = filedbService.getFileItemById(fileItemId);
    if (!fileItem) {
      return { success: false, message: '文件记录不存在' };
    }

    const filePath = this.resolveFilePath(fileItemId);
    if (!filePath) {
      return { success: false, message: '文件所在授权文件夹不存在' };
    }

    try {
      const buf = Buffer.from(buffer);
      fs.writeFileSync(filePath, buf);

      // 更新数据库中的文件大小和修改时间
      const stat = fs.statSync(filePath);
      const db = (filedbService as any).db;
      const tableName = (filedbService as any).itemTableName;
      db.prepare(
        `UPDATE ${tableName} SET size = ?, mtime = ? WHERE id = ?`
      ).run(stat.size, stat.mtime.toISOString(), fileItemId);

      logger.info(`[FileController] 保存文件成功: ${fileItem.name}, size=${buf.length}`);
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[FileController] 保存文件失败: ${filePath}:`, err);
      return { success: false, message: `保存文件失败: ${msg}` };
    }
  }

  /**
   * 重命名文件
   * @param args.fileItemId 文件项 ID
   * @param args.newName 新文件名（含后缀）
   */
  renameFile(args: { fileItemId: number; newName: string }): {
    success: boolean;
    fileItem?: any;
    message?: string;
  } {
    const { fileItemId, newName } = args;
    const fileItem = filedbService.getFileItemById(fileItemId);
    if (!fileItem) {
      return { success: false, message: '文件记录不存在' };
    }

    const oldFilePath = this.resolveFilePath(fileItemId);
    if (!oldFilePath) {
      return { success: false, message: '文件所在授权文件夹不存在' };
    }

    const folder = filedbService.getFolderById(fileItem.folder_id);
    if (!folder) {
      return { success: false, message: '授权文件夹不存在' };
    }

    const dir = path.dirname(oldFilePath);
    const newFilePath = path.join(dir, newName);
    const newRelativePath = path.relative(folder.path, newFilePath);

    // 文件名相同，无需重命名
    if (oldFilePath === newFilePath) {
      return { success: true, fileItem };
    }

    try {
      if (fs.existsSync(newFilePath)) {
        return { success: false, message: '目标文件名已存在' };
      }
      fs.renameSync(oldFilePath, newFilePath);

      // 更新数据库
      const ext = path.extname(newName).toLowerCase().replace('.', '');
      const db = (filedbService as any).db;
      const tableName = (filedbService as any).itemTableName;
      db.prepare(
        `UPDATE ${tableName} SET name = ?, type = ?, relative_path = ? WHERE id = ?`
      ).run(newName, ext, newRelativePath, fileItemId);

      const updatedItem = filedbService.getFileItemById(fileItemId);
      logger.info(`[FileController] 重命名成功: ${fileItem.name} -> ${newName}`);
      return { success: true, fileItem: updatedItem };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[FileController] 重命名失败: ${oldFilePath} -> ${newFilePath}:`, err);
      return { success: false, message: `重命名失败: ${msg}` };
    }
  }
}

export default FileController;
