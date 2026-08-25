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
import { createAdapter, type ProtocolConfig } from '../components/file/adapter/AdapterFactory';

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
      const scanItems = await FolderScanner.scanWithFolders(folder);
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
   * 添加远程协议文件夹（FTP/FTPS/SFTP/SMB/WebDAV/S3）
   *
   * 流程：参数校验 → 入库 → 立即返回 → 后台异步扫描 → 入库 → 轮询监听 → 入队向量化
   *
   * 远程扫描可能耗时较长（网络延迟 + 递归遍历），采用异步模式：
   *   1. 立即入库并返回 success，前端关闭弹窗
   *   2. 后台执行扫描，通过 REMOTE_SCAN_DONE_CHANNEL 通知前端刷新
   */
  async addRemoteFolder(args: {
    protocol: string;
    alias?: string;
    // 通用
    host?: string;
    port?: number;
    remotePath?: string;
    username?: string;
    password?: string;
    // SFTP
    privateKeyPath?: string;
    // SMB
    share?: string;
    subPath?: string;
    domain?: string;
    // WebDAV
    url?: string;
    // S3
    endpoint?: string;
    region?: string;
    bucket?: string;
    prefix?: string;
    accessKey?: string;
    secretKey?: string;
    forcePathStyle?: boolean;
  }, event?: IpcMainEvent): Promise<{ success: boolean; folder?: AuthorizedFolder; folderList: AuthorizedFolder[]; message?: string }> {
    try {
      const protocol = args.protocol;

      // 1. 构建存储路径和配置
      let folderPath: string;
      const config: Record<string, unknown> = { protocol };

      if (protocol === 'local') {
        // 本地协议：path 即为本地路径
        folderPath = args.host || args.remotePath || '';
        config.host = folderPath;
      } else if (protocol === 'ftp' || protocol === 'ftps') {
        folderPath = args.remotePath || '/';
        config.host = args.host;
        config.port = args.port;
        config.username = args.username;
        config.password = args.password;
        config.remotePath = args.remotePath;
      } else if (protocol === 'sftp') {
        folderPath = args.remotePath || '/';
        config.host = args.host;
        config.port = args.port;
        config.username = args.username;
        config.password = args.password;
        config.remotePath = args.remotePath;
        config.privateKeyPath = args.privateKeyPath;
      } else if (protocol === 'smb') {
        folderPath = args.subPath || '\\';
        config.host = args.host;
        config.port = args.port;
        config.share = args.share;
        config.subPath = args.subPath;
        config.domain = args.domain;
        config.username = args.username;
        config.password = args.password;
      } else if (protocol === 'webdav') {
        folderPath = args.remotePath || '/';
        config.url = args.url;
        config.remotePath = args.remotePath;
        config.username = args.username;
        config.password = args.password;
      } else if (protocol === 's3') {
        folderPath = args.prefix || '';
        config.endpoint = args.endpoint;
        config.region = args.region;
        config.bucket = args.bucket;
        config.prefix = args.prefix;
        config.accessKey = args.accessKey;
        config.secretKey = args.secretKey;
        config.forcePathStyle = args.forcePathStyle;
      } else {
        return { success: false, folderList: filedbService.getFolderList(), message: `不支持的协议: ${protocol}` };
      }

      // 2. 存入数据库
      let folder: AuthorizedFolder;
      if (protocol === 'local') {
        folder = filedbService.addFolder(folderPath, args.alias);
      } else {
        folder = filedbService.addRemoteFolder({
          protocol,
          path: folderPath,
          alias: args.alias,
          config,
        });
      }
      logger.info(`[FileController] 添加文件夹 (${protocol}): ${folderPath}, id=${folder.id}`);

      // 3. 本地协议同步扫描（快），远程协议异步扫描（慢）
      if (protocol === 'local') {
        // 本地：同步扫描，速度快
        try {
          const scanItems = await FolderScanner.scanWithFolders(folder);
          logger.info(`[FileController] 本地扫描完成，共 ${scanItems.length} 项`);
          filedbService.batchAddFileItems(folder.id, scanItems);
          SyncService.watchFolder(folder);

          const pendingFiles = filedbService.getFilesByStatus(folder.id, 'PENDING');
          const ingestItems = pendingFiles
            .filter(f => isVectorSupported(f.name))
            .map(f => ({ fileItemId: f.id, folderId: f.folder_id, folderPath: folder.path }));
          ragService.enqueueIngestBatch(ingestItems);
        } catch (scanErr) {
          logger.error(`[FileController] 本地扫描失败 folderId=${folder.id}:`, scanErr);
        }
      } else {
        // 远程协议：异步扫描，避免 IPC 超时
        logger.info(`[FileController] 远程协议 ${protocol}，启动后台异步扫描 folderId=${folder.id}`);

        // 异步扫描，不阻塞 IPC 响应
        this._scanRemoteFolderAsync(folder, event).catch(err => {
          logger.error(`[FileController] 后台远程扫描异常 folderId=${folder.id}:`, err);
        });
      }

      return {
        success: true,
        folder,
        folderList: filedbService.getFolderList(),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[FileController] 添加远程文件夹失败:', msg);
      return {
        success: false,
        folderList: filedbService.getFolderList(),
        message: msg,
      };
    }
  }

  /**
   * 更新远程协议文件夹配置
   *
   * 修改连接参数后：
   *   1. 更新数据库记录
   *   2. 清空旧文件记录
   *   3. 后台重新扫描
   *   4. 通知前端刷新
   */
  async updateRemoteFolder(args: {
    folderId: number;
    protocol: string;
    alias?: string;
    host?: string;
    port?: number;
    remotePath?: string;
    username?: string;
    password?: string;
    privateKeyPath?: string;
    share?: string;
    subPath?: string;
    domain?: string;
    url?: string;
    endpoint?: string;
    region?: string;
    bucket?: string;
    prefix?: string;
    accessKey?: string;
    secretKey?: string;
    forcePathStyle?: boolean;
  }, event?: IpcMainEvent): Promise<{ success: boolean; folder?: AuthorizedFolder; folderList: AuthorizedFolder[]; message?: string }> {
    try {
      const { folderId, protocol, ...rest } = args;

      // 1. 构建存储路径和配置
      let folderPath: string;
      const config: Record<string, unknown> = { protocol };

      if (protocol === 'local') {
        folderPath = rest.host || rest.remotePath || '';
        config.host = folderPath;
      } else if (protocol === 'ftp' || protocol === 'ftps') {
        folderPath = rest.remotePath || '/';
        config.host = rest.host;
        config.port = rest.port;
        config.username = rest.username;
        config.password = rest.password;
        config.remotePath = rest.remotePath;
      } else if (protocol === 'sftp') {
        folderPath = rest.remotePath || '/';
        config.host = rest.host;
        config.port = rest.port;
        config.username = rest.username;
        config.password = rest.password;
        config.remotePath = rest.remotePath;
        config.privateKeyPath = rest.privateKeyPath;
      } else if (protocol === 'smb') {
        folderPath = rest.subPath || '\\';
        config.host = rest.host;
        config.port = rest.port;
        config.share = rest.share;
        config.subPath = rest.subPath;
        config.domain = rest.domain;
        config.username = rest.username;
        config.password = rest.password;
      } else if (protocol === 'webdav') {
        folderPath = rest.remotePath || '/';
        config.url = rest.url;
        config.remotePath = rest.remotePath;
        config.username = rest.username;
        config.password = rest.password;
      } else if (protocol === 's3') {
        folderPath = rest.prefix || '';
        config.endpoint = rest.endpoint;
        config.region = rest.region;
        config.bucket = rest.bucket;
        config.prefix = rest.prefix;
        config.accessKey = rest.accessKey;
        config.secretKey = rest.secretKey;
        config.forcePathStyle = rest.forcePathStyle;
      } else {
        return { success: false, folderList: filedbService.getFolderList(), message: `不支持的协议: ${protocol}` };
      }

      // 2. 更新数据库
      const folder = filedbService.updateRemoteFolder(folderId, {
        protocol,
        path: folderPath,
        alias: rest.alias,
        config,
      });

      if (!folder) {
        return { success: false, folderList: filedbService.getFolderList(), message: '文件夹不存在' };
      }

      logger.info(`[FileController] 更新文件夹配置 (${protocol}): ${folderPath}, id=${folderId}`);

      // 3. 清空旧文件记录 + 停止旧监听
      SyncService.unwatchFolder(folderId);
      filedbService.clearFileItems(folderId);

      // 4. 重新扫描（本地同步，远程异步）
      if (protocol === 'local') {
        try {
          const scanItems = await FolderScanner.scanWithFolders(folder);
          filedbService.batchAddFileItems(folder.id, scanItems);
          SyncService.watchFolder(folder);
          const pendingFiles = filedbService.getFilesByStatus(folder.id, 'PENDING');
          const ingestItems = pendingFiles
            .filter(f => isVectorSupported(f.name))
            .map(f => ({ fileItemId: f.id, folderId: f.folder_id, folderPath: folder.path }));
          ragService.enqueueIngestBatch(ingestItems);
        } catch (scanErr) {
          logger.error(`[FileController] 编辑后本地扫描失败 folderId=${folder.id}:`, scanErr);
        }
      } else {
        logger.info(`[FileController] 编辑后启动后台远程扫描 folderId=${folder.id}`);
        this._scanRemoteFolderAsync(folder, event).catch(err => {
          logger.error(`[FileController] 编辑后远程扫描异常 folderId=${folder.id}:`, err);
        });
      }

      return {
        success: true,
        folder,
        folderList: filedbService.getFolderList(),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[FileController] 更新远程文件夹失败:', msg);
      return {
        success: false,
        folderList: filedbService.getFolderList(),
        message: msg,
      };
    }
  }

  /** 远程扫描完成通知通道 */
  private static readonly REMOTE_SCAN_DONE_CHANNEL = 'controller/file/onRemoteScanDone';

  /**
   * 后台异步扫描远程文件夹
   *
   * 扫描完成后：
   *   1. 批量入库文件
   *   2. 启动轮询监听
   *   3. 入队向量化
   *   4. 通过 IPC 事件通知前端刷新
   */
  private async _scanRemoteFolderAsync(folder: AuthorizedFolder, event?: IpcMainEvent): Promise<void> {
    const startTime = Date.now();
    logger.info(`[FileController] 开始后台远程扫描 folderId=${folder.id} (${folder.protocol})`);

    try {
      // 1. 扫描远程目录
      const scanItems = await FolderScanner.scanWithFolders(folder);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.info(`[FileController] 远程扫描完成 folderId=${folder.id}，共 ${scanItems.length} 项，耗时 ${elapsed}s`);

      // 2. 批量入库
      filedbService.batchAddFileItems(folder.id, scanItems);

      // 3. 启动轮询监听
      SyncService.watchFolder(folder);

      // 4. 获取所有 PENDING 文件，入队向量化
      const pendingFiles = filedbService.getFilesByStatus(folder.id, 'PENDING');
      const ingestItems = pendingFiles
        .filter(f => isVectorSupported(f.name))
        .map(f => ({ fileItemId: f.id, folderId: f.folder_id, folderPath: folder.path }));
      ragService.enqueueIngestBatch(ingestItems);

      logger.info(`[FileController] 远程文件夹就绪 folderId=${folder.id}: ${scanItems.length} 项，入队 ${ingestItems.length} 个向量化`);

      // 5. 通知前端扫描完成
      if (event) {
        try {
          event.sender.send(FileController.REMOTE_SCAN_DONE_CHANNEL, {
            folderId: folder.id,
            success: true,
            itemCount: scanItems.length,
            queuedCount: ingestItems.length,
          });
        } catch {
          // event 可能已断开
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[FileController] 后台远程扫描失败 folderId=${folder.id}:`, msg);

      // 通知前端扫描失败
      if (event) {
        try {
          event.sender.send(FileController.REMOTE_SCAN_DONE_CHANNEL, {
            folderId: folder.id,
            success: false,
            message: msg,
          });
        } catch {
          // event 可能已断开
        }
      }
    }
  }

  /**
   * 测试远程协议连接
   *
   * 不入库，仅验证连接是否可用。
   */
  async testRemoteConnection(args: {
    protocol: string;
    host?: string;
    port?: number;
    remotePath?: string;
    username?: string;
    password?: string;
    privateKeyPath?: string;
    share?: string;
    subPath?: string;
    domain?: string;
    url?: string;
    endpoint?: string;
    region?: string;
    bucket?: string;
    prefix?: string;
    accessKey?: string;
    secretKey?: string;
    forcePathStyle?: boolean;
  }): Promise<{ success: boolean; message?: string }> {
    try {
      const { createAdapter } = await import('../components/file/adapter/AdapterFactory');
      const adapter = createAdapter(args as never);
      const result = await adapter.testConnection();
      await adapter.close?.();
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[FileController] 测试远程连接失败:', msg);
      return { success: false, message: msg };
    }
  }

  /**
   * 浏览远程目录（单层，非递归）
   *
   * 用于前端添加文件夹时的远程路径选择器：
   * 用户填入主机/端口/用户名/密码后，逐级浏览服务器目录树选择目标路径。
   *
   * @param args 连接参数（与 testRemoteConnection 相同）
   * @param args.dirPath 要列出的目录路径，空或 '/' 表示根目录
   * @returns 目录条目列表
   */
  async browseRemotePath(args: {
    protocol: string;
    dirPath?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    privateKeyPath?: string;
    share?: string;
    subPath?: string;
    domain?: string;
    url?: string;
    endpoint?: string;
    region?: string;
    bucket?: string;
    prefix?: string;
    accessKey?: string;
    secretKey?: string;
    forcePathStyle?: boolean;
  }): Promise<{ success: boolean; entries?: Array<{ name: string; isDir: boolean; size: number; mtime?: string }>; message?: string }> {
    try {
      const { createAdapter } = await import('../components/file/adapter/AdapterFactory');
      const adapter = createAdapter(args as never);
      const entries = await adapter.listDir(args.dirPath || '/');
      await adapter.close?.();
      return { success: true, entries };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[FileController] 浏览远程目录失败:', msg);
      return { success: false, message: msg };
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
   * 重新扫描单个文件夹
   *
   * 本地协议：智能同步扫描（保留 hash/status）
   * 远程协议：从服务器拉取最新文件结构，全量清空后重新入库
   */
  async refreshFolder(args: { folderId: number }): Promise<{ success: boolean; message?: string }> {
    const { folderId } = args;
    const folder = filedbService.getFolderById(folderId);
    if (!folder) {
      return { success: false, message: '文件夹不存在' };
    }

    const protocol = folder.protocol || 'local';
    logger.info(`[FileController] 手动刷新文件夹 folderId=${folderId} (${protocol})`);

    try {
      if (protocol === 'local') {
        // 本地：智能同步扫描
        const result = await filedbService.syncScanFolder(folderId);
        this.handleSyncResultForRag({ folderId, ...result });
        logger.info(`[FileController] 本地刷新完成 folderId=${folderId}: added=${result.added.length}, deleted=${result.deleted.length}, changed=${result.changed.length}`);
      } else {
        // 远程：清空旧记录后重新全量扫描
        SyncService.unwatchFolder(folderId);
        filedbService.clearFileItems(folderId);

        const scanItems = await FolderScanner.scanWithFolders(folder);
        filedbService.batchAddFileItems(folderId, scanItems);
        SyncService.watchFolder(folder);

        // 入队向量化
        const pendingFiles = filedbService.getFilesByStatus(folderId, 'PENDING');
        const ingestItems = pendingFiles
          .filter(f => isVectorSupported(f.name))
          .map(f => ({ fileItemId: f.id, folderId: f.folder_id, folderPath: folder.path }));
        ragService.enqueueIngestBatch(ingestItems);

        logger.info(`[FileController] 远程刷新完成 folderId=${folderId}: ${scanItems.length} 项，入队 ${ingestItems.length} 个向量化`);
      }

      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[FileController] 刷新文件夹失败 folderId=${folderId}:`, msg);
      return { success: false, message: msg };
    }
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
   *
   * 本地协议：检查磁盘文件是否存在
   * 远程协议：数据库记录即为服务端最新扫描结果，直接返回
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

    const folder = filedbService.getFolderById(fileItem.folder_id);
    if (!folder) {
      return { success: false, message: '文件所在授权文件夹不存在' };
    }

    const protocol = folder.protocol || 'local';

    if (protocol === 'local') {
      const filePath = this.resolveFilePath(fileItemId);
      if (!filePath) {
        return { success: false, message: '文件所在授权文件夹不存在' };
      }
      if (!fs.existsSync(filePath)) {
        return { success: false, message: '文件在磁盘上不存在，可能已被删除或移动' };
      }
    }

    // 远程协议：数据库记录即为服务端最新扫描结果，直接返回
    return {
      success: true,
      name: fileItem.name,
      size: fileItem.size,
      type: fileItem.type,
    };
  }

  /**
   * 读取文件内容并返回给前端
   * 前端将其包装为 File 对象传给 @file-viewer/vue3-full 组件
   *
   * 本地协议：直接读取磁盘文件
   * 远程协议：通过适配器从远程服务器下载文件内容
   *
   * @returns 包含文件二进制数据的对象，buffer 为 Node Buffer（IPC 序列化为 Uint8Array）
   */
  async getFileData(args: { fileItemId: number }): Promise<{
    success: boolean;
    buffer?: Buffer;
    name?: string;
    size?: number;
    type?: string;
    message?: string;
  }> {
    const { fileItemId } = args;
    const fileItem = filedbService.getFileItemById(fileItemId);
    if (!fileItem) {
      return { success: false, message: '文件记录不存在' };
    }

    const folder = filedbService.getFolderById(fileItem.folder_id);
    if (!folder) {
      return { success: false, message: '文件所在授权文件夹不存在' };
    }

    const protocol = folder.protocol || 'local';

    try {
      let buffer: Buffer;

      if (protocol === 'local') {
        // 本地文件：直接读取磁盘
        const filePath = this.resolveFilePath(fileItemId);
        if (!filePath) {
          return { success: false, message: '文件所在授权文件夹不存在' };
        }
        if (!fs.existsSync(filePath)) {
          return { success: false, message: '文件在磁盘上不存在，可能已被删除或移动' };
        }
        buffer = fs.readFileSync(filePath);
      } else {
        // 远程文件：通过适配器从服务器下载
        const config: ProtocolConfig = {
          protocol: protocol as ProtocolConfig['protocol'],
          ...(folder.protocol_config ? JSON.parse(folder.protocol_config) : {}),
        };
        const adapter = createAdapter(config);
        try {
          buffer = await adapter.readFile(fileItem.relative_path);
        } finally {
          await adapter.close?.();
        }
      }

      logger.info(`[FileController] 读取文件成功: ${fileItem.name}, size=${buffer.length}, protocol=${protocol}`);
      return {
        success: true,
        buffer,
        name: fileItem.name,
        size: buffer.length,
        type: fileItem.type,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[FileController] 读取文件失败: ${fileItem.name} (${protocol}):`, err);
      return { success: false, message: `读取文件失败: ${msg}` };
    }
  }

  /**
   * 保存文件内容到磁盘
   * 仅支持本地协议文件
   *
   * @param args.fileItemId 文件项 ID
   * @param args.buffer 文件内容（Uint8Array）
   * @returns 保存结果
   */
  async saveFileData(args: { fileItemId: number; buffer: Uint8Array }): Promise<{
    success: boolean;
    message?: string;
  }> {
    const { fileItemId, buffer } = args;
    const fileItem = filedbService.getFileItemById(fileItemId);
    if (!fileItem) {
      return { success: false, message: '文件记录不存在' };
    }

    const folder = filedbService.getFolderById(fileItem.folder_id);
    if (!folder) {
      return { success: false, message: '文件所在授权文件夹不存在' };
    }

    const protocol = folder.protocol || 'local';
    if (protocol !== 'local') {
      return { success: false, message: '仅支持本地文件保存' };
    }

    try {
      const filePath = this.resolveFilePath(fileItemId);
      if (!filePath) {
        return { success: false, message: '文件所在授权文件夹不存在' };
      }

      const data = Buffer.from(buffer);
      fs.writeFileSync(filePath, data);
      logger.info(`[FileController] 保存文件成功: ${fileItem.name}, size=${data.length}`);
      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[FileController] 保存文件失败: ${fileItem.name}:`, err);
      return { success: false, message: `保存文件失败: ${msg}` };
    }
  }

  /**
   * 创建新文件（仅本地协议）
   * 在指定文件夹的根目录下创建空文件，并入库
   *
   * @param args.folderId 授权文件夹 ID
   * @param args.parentId 父目录 ID（0 = 根目录）
   * @param args.fileName 文件名（含后缀）
   * @returns 创建结果 + 文件项
   */
  async createFile(args: {
    folderId: number;
    parentId: number;
    fileName: string;
  }): Promise<{ success: boolean; fileItem?: FileItem; message?: string }> {
    const { folderId, parentId, fileName } = args;

    const folder = filedbService.getFolderById(folderId);
    if (!folder) {
      return { success: false, message: '授权文件夹不存在' };
    }

    const protocol = folder.protocol || 'local';
    if (protocol !== 'local') {
      return { success: false, message: '仅支持本地文件夹创建文件' };
    }

    // 确定文件在磁盘上的完整路径
    const parentItem = parentId > 0 ? filedbService.getFileItemById(parentId) : null;
    const parentDir = parentItem ? path.join(folder.path, parentItem.relative_path) : folder.path;
    const filePath = path.join(parentDir, fileName);
    const relativePath = path.relative(folder.path, filePath);

    // 检查文件是否已存在
    if (fs.existsSync(filePath)) {
      return { success: false, message: '同名文件已存在' };
    }

    try {
      // 创建空文件（Markdown 文件以空内容创建）
      const ext = path.extname(fileName).toLowerCase();
      const initialContent = ext === '.md' ? `# ${path.basename(fileName, ext)}\n\n` : '';
      fs.writeFileSync(filePath, initialContent, 'utf-8');

      // 入库
      const stat = fs.statSync(filePath);
      const insertStmt = (filedbService as any).db.prepare(
        `INSERT INTO ${(filedbService as any).itemTableName} (folder_id, parent_id, name, type, size, mtime, relative_path, is_dir, status)
         VALUES (@folderId, @parentId, @name, @type, @size, @mtime, @relativePath, 0, 'PENDING')`
      );
      const info = insertStmt.run({
        folderId,
        parentId,
        name: fileName,
        type: ext.replace('.', '') || 'file',
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        relativePath,
      });

      const fileItem = filedbService.getFileItemById(Number(info.lastInsertRowid));
      logger.info(`[FileController] 创建文件成功: ${fileName}, id=${info.lastInsertRowid}`);

      return { success: true, fileItem: fileItem || undefined };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[FileController] 创建文件失败: ${fileName}:`, err);
      return { success: false, message: `创建文件失败: ${msg}` };
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
