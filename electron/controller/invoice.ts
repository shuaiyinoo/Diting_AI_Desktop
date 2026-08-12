/**
 * 票据识别模块控制器（独立模块，不与其他模块混用）
 *
 * 职责：
 *   - 授权文件夹管理（添加/列表/删除）→ 数据库存储
 *   - 文件扫描入库 + 树形结构读取
 *   - 实时文件追踪（chokidar 监听变化 → 重新扫描入库 → 通知前端）
 *   - 自动 OCR 识别（启动时 + 文件变化时，仅识别 png/jpeg 等图片）
 *   - 归档状态管理
 */
import { dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { IpcMainEvent } from 'electron';
import { logger } from 'ee-core/log';
import chokidar from 'chokidar';
import { invoicedbService } from '../service/database/invoicedb';
import type { InvoiceFileRecord, InvoiceFolderRecord } from '../service/database/invoicedb';
import { invoiceOcrService } from '../components/invoice/InvoiceOcrService';
import { invoiceAiService } from '../components/invoice/InvoiceAiService';
import { pdfToImageService } from '../components/invoice/PdfToImageService';

// 文件变化通知通道
const SYNC_CHANGE_CHANNEL = 'controller/invoice/onSyncChange';
// OCR 处理进度通知通道
const OCR_PROGRESS_CHANNEL = 'controller/invoice/onOcrProgress';

/** 前端返回的文件树节点 */
interface FileTreeNode {
  id: number;
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mtime: string;
  processed: number;
  archived: number;
}

class InvoiceController {
  /** 前端 IPC event 引用 */
  private ipcEvent: IpcMainEvent | null = null;
  /** 文件监听器 Map（folderId → chokidar.FSWatcher） */
  private watchers: Map<number, chokidar.FSWatcher> = new Map();
  /** 防抖通知定时器 */
  private debounceTimers: Map<number, NodeJS.Timeout> = new Map();
  /** OCR 队列正在处理中 */
  private ocrProcessing = false;
  /** 数据库是否已初始化 */
  private dbInitialized = false;

  /**
   * 确保数据库已初始化
   */
  private async ensureDb(): Promise<void> {
    if (!this.dbInitialized) {
      await invoicedbService.init();
      this.dbInitialized = true;
    }
  }

  /**
   * 计算文件哈希（SHA-256，用于判断文件是否变化）
   */
  private computeHash(filePath: string): string {
    try {
      const content = fs.readFileSync(filePath);
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch {
      return '';
    }
  }

  /**
   * 递归扫描文件夹并入库
   * 同步文件系统状态到数据库：新增/更新/删除
   */
  private async scanAndSyncToDb(folderId: number, folderPath: string): Promise<void> {
    await this.ensureDb();

    // 1. 扫描文件系统，构建当前文件集合
    const currentFiles = new Map<string, { name: string; relativePath: string; parentPath: string; isDir: boolean; size: number; mtime: string; type: string; hash: string }>();

    const scan = (currentPath: string, basePath: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(currentPath, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'thumbs.db') {
          continue;
        }

        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(basePath, fullPath);
        const parentPath = relativePath.includes('/') ? relativePath.slice(0, relativePath.lastIndexOf('/')) : '';

        if (entry.isDirectory()) {
          currentFiles.set(relativePath, {
            name: entry.name,
            relativePath,
            parentPath,
            isDir: true,
            size: 0,
            mtime: '',
            type: 'folder',
            hash: '',
          });
          scan(fullPath, basePath);
        } else {
          try {
            const stat = fs.statSync(fullPath);
            const ext = path.extname(entry.name).toLowerCase();
            currentFiles.set(relativePath, {
              name: entry.name,
              relativePath,
              parentPath,
              isDir: false,
              size: stat.size,
              mtime: stat.mtime.toISOString(),
              type: ext,
              hash: this.computeHash(fullPath),
            });
          } catch {
            // 文件可能已被删除
          }
        }
      }
    };

    scan(folderPath, folderPath);

    // 2. 获取数据库中已有记录
    const dbFiles = invoicedbService.getFilesByFolder(folderId);
    const dbFileMap = new Map<string, InvoiceFileRecord>();
    for (const f of dbFiles) {
      dbFileMap.set(f.relative_path, f);
    }

    // 3. 计算 parent_id 映射（需要先插入目录再插入文件）
    const pathToId = new Map<string, number>();
    // 先填充已有记录的 ID
    for (const [relPath, record] of dbFileMap) {
      pathToId.set(relPath, record.id);
    }

    // 4. 按路径深度排序（先处理父目录）
    const sortedPaths = Array.from(currentFiles.keys()).sort((a, b) => a.split('/').length - b.split('/').length);

    // 5. 新增/更新文件
    for (const relPath of sortedPaths) {
      const file = currentFiles.get(relPath)!;
      const parentId = file.parentPath ? (pathToId.get(file.parentPath) || 0) : 0;

      const existing = dbFileMap.get(relPath);
      if (existing) {
        // 更新：如果 hash 变化则重置 processed
        const needReprocess = !file.isDir && existing.file_hash !== file.hash;
        if (needReprocess || existing.size !== file.size || existing.mtime !== file.mtime) {
          invoicedbService.upsertFile({
            folder_id: folderId,
            parent_id: parentId,
            name: file.name,
            type: file.type,
            size: file.size,
            mtime: file.mtime,
            relative_path: file.relativePath,
            is_dir: file.isDir ? 1 : 0,
            processed: existing.processed,
            archived: existing.archived,
            ocr_text: existing.ocr_text,
            processed_at: existing.processed_at,
            file_hash: file.hash,
          });
        }
      } else {
        // 新增
        invoicedbService.upsertFile({
          folder_id: folderId,
          parent_id: parentId,
          name: file.name,
          type: file.type,
          size: file.size,
          mtime: file.mtime,
          relative_path: file.relativePath,
          is_dir: file.isDir ? 1 : 0,
          processed: 0,
          archived: 0,
          ocr_text: null,
          processed_at: null,
          file_hash: file.hash,
        });
        // 获取新插入的 ID
        const newRecord = invoicedbService.getFileByPath(folderId, file.relativePath);
        if (newRecord) {
          pathToId.set(relPath, newRecord.id);
        }
      }
    }

    // 6. 删除已不存在的文件记录
    for (const [relPath] of dbFileMap) {
      if (!currentFiles.has(relPath)) {
        invoicedbService.deleteFile(folderId, relPath);
      }
    }
  }

  /**
   * 将数据库记录转为前端文件树节点
   */
  private recordsToTreeNodes(records: InvoiceFileRecord[]): FileTreeNode[] {
    return records.map((r) => ({
      id: r.id,
      name: r.name,
      path: r.relative_path,
      isDir: r.is_dir === 1,
      size: r.size,
      mtime: r.mtime,
      processed: r.processed,
      archived: r.archived,
    }));
  }

  /**
   * 启动文件监听
   */
  private startWatching(folder: InvoiceFolderRecord): void {
    this.stopWatching(folder.id);

    try {
      const watcher = chokidar.watch(folder.path, {
        ignored: (testPath: string) => {
          const basename = path.basename(testPath);
          return basename.startsWith('.') || basename === 'node_modules' || basename === 'thumbs.db';
        },
        persistent: true,
        ignoreInitial: true,
        depth: 5,
      });

      watcher.on('all', () => {
        this.scheduleNotify(folder.id);
      });

      this.watchers.set(folder.id, watcher);
      logger.info(`[InvoiceController] 开始监听文件夹: ${folder.path}`);
    } catch (err) {
      logger.error(`[InvoiceController] 监听文件夹失败: ${folder.path}`, err);
    }
  }

  /**
   * 停止文件监听
   */
  private stopWatching(folderId: number): void {
    const watcher = this.watchers.get(folderId);
    if (watcher) {
      watcher.close().catch(() => {});
      this.watchers.delete(folderId);
    }
    const timer = this.debounceTimers.get(folderId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(folderId);
    }
  }

  /**
   * 防抖通知前端 + 重新扫描入库 + 触发 OCR
   */
  private scheduleNotify(folderId: number): void {
    const existing = this.debounceTimers.get(folderId);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(folderId);

      // 重新扫描入库
      const folder = invoicedbService.getFolderById(folderId);
      if (folder && fs.existsSync(folder.path)) {
        await this.scanAndSyncToDb(folderId, folder.path);
        // 触发 OCR 处理
        this.processOcrQueue().catch(err => {
          logger.error('[InvoiceController] OCR 处理异常:', err);
        });
      }

      // 通知前端刷新
      if (this.ipcEvent) {
        try {
          this.ipcEvent.sender.send(SYNC_CHANGE_CHANNEL, { folderId });
        } catch {
          // event 可能已断开
        }
      }
    }, 500);
    this.debounceTimers.set(folderId, timer);
  }

  /**
   * OCR 处理队列：串行处理所有未处理的图片文件
   */
  private async processOcrQueue(): Promise<void> {
    if (this.ocrProcessing) return;
    this.ocrProcessing = true;

    try {
      await this.ensureDb();

      let shouldStop = false;

      while (!shouldStop) {
        const pendingFiles = invoicedbService.getAllUnprocessedFiles();
        if (pendingFiles.length === 0) break;

        for (const file of pendingFiles) {
          const folder = invoicedbService.getFolderById(file.folder_id);
          if (!folder) {
            invoicedbService.markFileFailed(file.id);
            continue;
          }

          const fullPath = path.join(folder.path, file.relative_path);

          // 检查文件是否存在
          if (!fs.existsSync(fullPath)) {
            invoicedbService.deleteFile(file.folder_id, file.relative_path);
            continue;
          }

          // 通知前端：开始处理
          this.notifyOcrProgress({ fileId: file.id, status: 'processing', fileName: file.name });

          // 根据文件类型选择识别方式
          const isPdf = invoiceOcrService.isPdf(file.name);
          const result = isPdf
            ? await invoiceOcrService.recognizePdf(fullPath)
            : await invoiceOcrService.recognize(fullPath);

          if (result.success) {
            // 存储完整 OCR 结果（文本 + 位置框 JSON，PDF 含多页数据）
            const ocrData = JSON.stringify({
              confidence: result.confidence || 0,
              boxes: result.boxes || [],
              pages: result.pages || [],
              totalPages: result.totalPages || 1,
              isScanned: result.isScanned || false,
            });
            invoicedbService.updateOcrResult(file.id, result.text, ocrData);
            this.notifyOcrProgress({ fileId: file.id, status: 'done', fileName: file.name, text: result.text });
          } else {
            // 判断是否为初始化失败（非单文件识别失败）
            const isInitError = result.error && (result.error.includes('初始化') || result.error.includes('不再重试'));
            if (isInitError) {
              // 初始化失败：停止整个队列，避免无限循环
              logger.error('[InvoiceController] OCR 模型初始化失败，停止处理队列');
              this.notifyOcrProgress({ fileId: file.id, status: 'failed', fileName: file.name, error: result.error });
              shouldStop = true;
              break;
            }
            // 单文件识别失败：标记为失败（processed=2）并继续处理下一个
            invoicedbService.markFileFailed(file.id);
            this.notifyOcrProgress({ fileId: file.id, status: 'failed', fileName: file.name, error: result.error });
          }
        }
      }
    } catch (err) {
      logger.error('[InvoiceController] OCR 队列处理异常:', err);
    } finally {
      this.ocrProcessing = false;
    }
  }

  /**
   * 通知前端 OCR 处理进度
   */
  private notifyOcrProgress(info: { fileId: number; status: string; fileName: string; text?: string; error?: string }): void {
    if (!this.ipcEvent) return;
    try {
      this.ipcEvent.sender.send(OCR_PROGRESS_CHANNEL, {
        ...info,
        timestamp: Date.now(),
      });
    } catch {
      // event 可能已断开
    }
  }

  // ==================== IPC 方法 ====================

  /**
   * 添加授权文件夹
   */
  async addFolder(): Promise<{ success: boolean; folderList?: InvoiceFolderRecord[]; message?: string }> {
    await this.ensureDb();

    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: '用户取消选择' };
    }

    const folderPath = result.filePaths[0];

    try {
      invoicedbService.addFolder(folderPath);
    } catch (err) {
      return { success: false, message: (err as Error).message };
    }

    const folderList = invoicedbService.getFolderList();
    const newFolder = folderList.find((f) => f.path === folderPath)!;

    // 扫描入库
    await this.scanAndSyncToDb(newFolder.id, newFolder.path);

    // 启动文件监听
    this.startWatching(newFolder);

    // 触发 OCR 处理
    this.processOcrQueue().catch(err => {
      logger.error('[InvoiceController] OCR 处理异常:', err);
    });

    logger.info(`[InvoiceController] 添加授权文件夹: ${folderPath}`);
    return { success: true, folderList };
  }

  /**
   * 获取授权文件夹列表
   */
  async getFolderList(): Promise<InvoiceFolderRecord[]> {
    await this.ensureDb();
    return invoicedbService.getFolderList();
  }

  /**
   * 删除授权文件夹
   */
  async deleteFolder(args: { folderId: number }): Promise<{ success: boolean; folderList: InvoiceFolderRecord[] }> {
    await this.ensureDb();
    const { folderId } = args;

    this.stopWatching(folderId);
    invoicedbService.deleteFolder(folderId);

    const folderList = invoicedbService.getFolderList();
    logger.info(`[InvoiceController] 删除授权文件夹: ${folderId}`);
    return { success: true, folderList };
  }

  /**
   * 获取文件树（含 processed/archived 状态）
   */
  async getFileTree(args: { folderId: number }): Promise<{ success: boolean; files: FileTreeNode[]; folderPath?: string }> {
    await this.ensureDb();
    const { folderId } = args;
    const folder = invoicedbService.getFolderById(folderId);

    if (!folder) {
      return { success: false, files: [] };
    }

    if (!fs.existsSync(folder.path)) {
      return { success: false, files: [], folderPath: folder.path };
    }

    // 重新扫描入库，确保数据最新
    await this.scanAndSyncToDb(folderId, folder.path);

    const records = invoicedbService.getFilesByFolder(folderId);
    const files = this.recordsToTreeNodes(records);
    return { success: true, files, folderPath: folder.path };
  }

  /**
   * 切换文件归档状态
   */
  async toggleArchived(args: { fileId: number }): Promise<{ success: boolean; file?: InvoiceFileRecord }> {
    await this.ensureDb();
    const file = invoicedbService.toggleArchived(args.fileId);
    return { success: !!file, file };
  }

  /**
   * 重新识别：清除旧 OCR/AI 数据，重新执行 OCR 识别
   */
  async reRecognize(args: { fileId: number }): Promise<{ success: boolean; error?: string }> {
    await this.ensureDb();
    const file = invoicedbService.getFileById(args.fileId);
    if (!file) {
      return { success: false, error: '文件记录不存在' };
    }

    const folder = invoicedbService.getFolderById(file.folder_id);
    if (!folder) {
      return { success: false, error: '文件所在授权文件夹不存在' };
    }

    const fullPath = path.join(folder.path, file.relative_path);
    if (!fs.existsSync(fullPath)) {
      return { success: false, error: '文件在磁盘上不存在' };
    }

    // 1. 清除旧的 OCR 和 AI 结果
    invoicedbService.clearOcrResult(args.fileId);
    logger.info(`[InvoiceController] 已清除旧 OCR 数据，开始重新识别: ${fullPath}`);

    // 2. 通知前端：开始处理
    this.notifyOcrProgress({ fileId: file.id, status: 'processing', fileName: file.name });

    // 3. 重新执行 OCR 识别
    const isPdf = invoiceOcrService.isPdf(file.name);
    const result = isPdf
      ? await invoiceOcrService.recognizePdf(fullPath)
      : await invoiceOcrService.recognize(fullPath);

    if (result.success) {
      const ocrData = JSON.stringify({
        confidence: result.confidence || 0,
        boxes: result.boxes || [],
        pages: result.pages || [],
        totalPages: result.totalPages || 1,
        isScanned: result.isScanned || false,
      });
      invoicedbService.updateOcrResult(file.id, result.text, ocrData);
      this.notifyOcrProgress({ fileId: file.id, status: 'done', fileName: file.name, text: result.text });
      logger.info(`[InvoiceController] 重新识别完成: ${fullPath}`);
      return { success: true };
    } else {
      invoicedbService.markFileFailed(file.id);
      this.notifyOcrProgress({ fileId: file.id, status: 'failed', fileName: file.name, error: result.error });
      logger.error(`[InvoiceController] 重新识别失败: ${fullPath}`, result.error);
      return { success: false, error: result.error || '识别失败' };
    }
  }

  /**
   * 获取文件详情：图片 base64 + OCR 识别结果（含位置框）
   */
  async getFileDetail(args: { fileId: number }): Promise<{
    success: boolean;
    imageData?: string;
    pageImages?: string[];
    /** PDF 原始二进制数据（IPC 序列化为 Uint8Array，前端创建 Blob URL） */
    pdfBuffer?: Buffer;
    ocrText?: string;
    ocrData?: any;
    aiData?: any;
    processed?: number;
    archived?: number;
  }> {
    await this.ensureDb();
    const file = invoicedbService.getFileById(args.fileId);
    if (!file) {
      return { success: false };
    }

    const folder = invoicedbService.getFolderById(file.folder_id);
    if (!folder) {
      return { success: false };
    }

    const fullPath = path.join(folder.path, file.relative_path);

    // 读取图片/PDF
    let imageData = '';
    let pageImages: string[] | undefined;
    let pdfBuffer: Buffer | undefined;

    try {
      if (fs.existsSync(fullPath)) {
        if (invoiceOcrService.isPdf(file.name)) {
          // PDF：返回原始 Buffer，前端创建 Blob URL 供 pdf.js 加载
          pdfBuffer = fs.readFileSync(fullPath);
          logger.info(`[InvoiceController] PDF 文件已读取: ${fullPath}, size=${pdfBuffer.length}`);
        } else {
          // 单张图片
          const buf = fs.readFileSync(fullPath);
          const ext = path.extname(fullPath).toLowerCase().replace('.', '');
          imageData = `data:image/${ext};base64,${buf.toString('base64')}`;
        }
      }
    } catch (err) {
      logger.error(`[InvoiceController] 读取文件失败: ${fullPath}`, err?.message || err);
    }

    // 解析 OCR 结果
    let ocrData: any = null;
    try {
      if (file.ocr_data) {
        ocrData = JSON.parse(file.ocr_data);
      }
    } catch {
      // 解析失败
    }

    // 解析 AI 提取结果
    let aiData: any = null;
    try {
      if (file.ai_data) {
        aiData = JSON.parse(file.ai_data);
      }
    } catch {
      // 解析失败
    }

    return {
      success: true,
      imageData,
      pageImages,
      pdfBuffer,
      ocrText: file.ocr_text || '',
      ocrData,
      aiData,
      processed: file.processed,
      archived: file.archived,
    };
  }

  /**
   * AI 结构化提取：将 OCR 结果发送给 LLM，提取结构化 JSON
   */
  async extractInvoice(args: { fileId: number }): Promise<{ success: boolean; data?: any; error?: string }> {
    await this.ensureDb();
    const file = invoicedbService.getFileById(args.fileId);
    if (!file) {
      return { success: false, error: '文件不存在' };
    }

    if (!file.ocr_text) {
      return { success: false, error: '文件尚未完成 OCR 识别' };
    }

    // 解析 OCR 数据
    let ocrBoxes: any[] = [];
    try {
      if (file.ocr_data) {
        const parsed = JSON.parse(file.ocr_data);
        ocrBoxes = parsed.boxes || [];
      }
    } catch {
      // 解析失败
    }

    // 调用 AI 提取
    const result = await invoiceAiService.extract(file.ocr_text, ocrBoxes);

    if (result.success && result.data) {
      // 保存 AI 结果到数据库
      invoicedbService.updateAiResult(args.fileId, JSON.stringify(result.data));
      return { success: true, data: result.data };
    }

    return { success: false, error: result.error || 'AI 提取失败' };
  }

  /**
   * 注册文件变化监听回调
   */
  async registerSyncCallback(_args: unknown, event: IpcMainEvent): Promise<void> {
    await this.ensureDb();
    this.ipcEvent = event;

    // 为所有已存在的文件夹启动监听
    const list = invoicedbService.getFolderList();
    for (const folder of list) {
      if (fs.existsSync(folder.path)) {
        // 先扫描入库（同步文件系统状态）
        await this.scanAndSyncToDb(folder.id, folder.path);
        // 启动监听
        this.startWatching(folder);
      }
    }

    // 触发 OCR 处理（启动时自动识别未处理的图片）
    this.processOcrQueue().catch(err => {
      logger.error('[InvoiceController] 启动 OCR 处理异常:', err);
    });

    logger.info(`[InvoiceController] 注册文件变化回调，监听 ${list.length} 个文件夹`);
  }
}

export default InvoiceController;
