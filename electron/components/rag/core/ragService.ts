/**
 * RAG 摄取主服务（主进程直接执行模式）
 *
 * 核心设计：
 *   1. **主进程直接执行**：所有 RAG 逻辑在 Electron 主进程中执行。
 *      ★ @zvec/zvec 是原生 NAPI 模块，只能在主进程中加载使用。
 *      ★ 文档解析使用 @kreuzberg/node 的异步 API（extractFile），不会阻塞事件循环。
 *      ★ ONNX embedding 推理也是异步的，通过 setImmediate 让出事件循环。
 *   2. **队列串行处理**：主进程维护任务队列，逐个处理，确保一次只处理 1 个文件。
 *   3. **哈希变化检测**：文件 hash 未变化且已 READY → 跳过；hash 变化 → 先删旧数据再重做。
 *   4. **断点续传**：启动时将 PROCESSING 状态重置为 PENDING，自动入队待处理文件。
 *
 * 主进程职责：
 *   - 管理任务队列
 *   - 从 filedb 读取文件信息
 *   - 执行文档解析 → 清理 → 切片 → embedding → zvec 存储 → SQLite → MiniSearch
 *   - 更新 filedb 状态
 *   - 通知前端进度
 */

import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { getDataDir } from 'ee-core/ps';
import { logger } from 'ee-core/log';

import { filedbService } from '../../../service/database/filedb';
import { RagDatabase } from '../database/ragdb';
import { KeywordSearchService } from '../database/keyword-search';
import {
  initVectorStore,
  embedAndStore,
  deleteVectorsByFileItemId,
} from '../database/vector-store';
import { QwenEmbedderProvider } from '../embedding/embedding';
import { parseDocument, isSupportedFormat } from '../parser/parser';
import { cleanText } from '../processor/text-cleanup';
import { chunkText } from '../processor/chunker';
import { DEFAULT_CHUNKING_CONFIG } from '../types';

// ═══════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════

const EMBED_BATCH_SIZE = 9;

// ═══════════════════════════════════════════
// 队列任务类型
// ═══════════════════════════════════════════

type QueueTask =
  | { type: 'ingest'; fileItemId: number; folderId: number; folderPath: string }
  | { type: 'delete'; fileItemId: number };

/** 队列进度回调 */
type ProgressCallback = (info: {
  type: 'ingest' | 'delete' | 'skip' | 'idle';
  fileItemId: number;
  fileName?: string;
  queueSize: number;
  status: string;
}) => void;

// ═══════════════════════════════════════════
// RAG 服务单例
// ═══════════════════════════════════════════

class RagService {
  // ── 持久化资源（惰性初始化） ──
  private ragDb: RagDatabase | null = null;
  private collection: ReturnType<typeof initVectorStore> | null = null;
  private kwService: KeywordSearchService | null = null;
  private embedder: QwenEmbedderProvider | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  // ── 路径 ──
  private dbPath = '';
  private vectorStorePath = '';
  private keywordIndexPath = '';

  // ── 队列相关 ──
  private queue: QueueTask[] = [];
  private processing = false;
  private taskRunning = false;
  private progressCallback: ProgressCallback | null = null;

  // ── 统计缓存 ──
  private statsCache = { vectorizedFiles: 0, keywordDocs: 0 };

  // ═══════════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════════

  /**
   * 初始化 RAG 资源（惰性，首次有任务时初始化）
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    const dataDir = getDataDir();
    this.dbPath = path.join(dataDir, 'db', 'rag.db');
    this.vectorStorePath = path.join(dataDir, 'db', 'zvec_store');
    this.keywordIndexPath = path.join(dataDir, 'db', 'kw-index.json');

    logger.info(`[RagService] 初始化 RAG 资源, dataDir=${dataDir}`);

    // 确保 data/db 目录存在
    const dbDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dbDir)) {
      await fsp.mkdir(dbDir, { recursive: true });
    }

    this.ragDb = new RagDatabase(this.dbPath);
    this.embedder = new QwenEmbedderProvider();
    this.collection = initVectorStore(this.vectorStorePath, this.embedder.dimension);
    this.kwService = await KeywordSearchService.loadFromFileAsync(this.keywordIndexPath);

    this.initialized = true;
    logger.info('[RagService] RAG 资源初始化完成');
  }

  // ═══════════════════════════════════════════
  // 队列管理
  // ═══════════════════════════════════════════

  /**
   * 设置进度回调（用于通知前端队列处理进度）
   */
  setProgressCallback(cb: ProgressCallback): void {
    this.progressCallback = cb;
  }

  /**
   * 获取当前队列长度
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * 队列是否正在处理
   */
  isProcessing(): boolean {
    return this.processing;
  }

  /**
   * 将文件入队（向量化）
   */
  enqueueIngest(fileItemId: number, folderId: number, folderPath: string): void {
    const exists = this.queue.some(
      t => t.type === 'ingest' && t.fileItemId === fileItemId
    );
    if (exists) return;

    this.queue.push({ type: 'ingest', fileItemId, folderId, folderPath });
    logger.info(`[RagService] 入队向量化任务 fileItemId=${fileItemId}, 队列长度=${this.queue.length}`);
    this.processQueue();
  }

  /**
   * 将文件删除清理任务入队
   */
  enqueueDelete(fileItemId: number): void {
    const exists = this.queue.some(
      t => t.type === 'delete' && t.fileItemId === fileItemId
    );
    if (exists) return;

    // 从队列中移除同 fileItemId 的 ingest 任务（还没开始处理就删了）
    this.queue = this.queue.filter(
      t => !(t.type === 'ingest' && t.fileItemId === fileItemId)
    );

    this.queue.push({ type: 'delete', fileItemId });
    logger.info(`[RagService] 入队删除任务 fileItemId=${fileItemId}, 队列长度=${this.queue.length}`);
    this.processQueue();
  }

  /**
   * 批量入队向量化任务
   */
  enqueueIngestBatch(items: Array<{ fileItemId: number; folderId: number; folderPath: string }>): void {
    for (const item of items) {
      const exists = this.queue.some(
        t => t.type === 'ingest' && t.fileItemId === item.fileItemId
      );
      if (!exists) {
        this.queue.push({ type: 'ingest', ...item });
      }
    }
    logger.info(`[RagService] 批量入队 ${items.length} 个任务，队列长度=${this.queue.length}`);
    this.processQueue();
  }

  /**
   * 处理队列：确保初始化完成后逐个处理任务
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    if (this.queue.length === 0) return;

    this.processing = true;

    // 确保初始化完成
    try {
      await this.initialize();
    } catch (err) {
      logger.error('[RagService] 初始化失败:', err);
      this.processing = false;
      return;
    }

    // 开始逐个处理任务
    this.dispatchNext().catch((err) => {
      logger.error('[RagService] dispatchNext 异常:', err);
      this.processing = false;
      this.taskRunning = false;
    });
  }

  /**
   * 处理下一个任务（串行）
   */
  private async dispatchNext(): Promise<void> {
    // 队列空了 → 通知空闲
    if (this.queue.length === 0) {
      this.processing = false;
      this.taskRunning = false;
      this.progressCallback?.({ type: 'idle', fileItemId: 0, queueSize: 0, status: 'IDLE' });
      return;
    }

    // ★ 串行保护：上一个任务还在跑就等它完成后再派发
    if (this.taskRunning) return;
    this.taskRunning = true;

    const task = this.queue.shift()!;
    logger.info(`[RagService] 派发任务: ${task.type} fileItemId=${task.fileItemId} (队列剩余 ${this.queue.length})`);

    try {
      if (task.type === 'ingest') {
        await this.executeIngest(task);
      } else if (task.type === 'delete') {
        await this.executeDelete(task);
      }
    } catch (error: any) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[RagService] 任务执行异常: ${errMsg}`);
      // 出错时也要更新文件状态，否则会卡在 PROCESSING
      if (task.type === 'ingest') {
        try {
          filedbService.updateFileStatus(task.fileItemId, 'FAILED', errMsg);
        } catch {}
        this.progressCallback?.({
          type: 'ingest',
          fileItemId: task.fileItemId,
          queueSize: this.queue.length,
          status: 'FAILED',
        });
      }
    } finally {
      this.taskRunning = false;
    }

    // 处理队列中的下一个任务
    if (this.queue.length > 0) {
      // ★ 让出事件循环，避免连续处理卡住主进程
      setImmediate(() => {
        this.dispatchNext().catch((err) => {
          logger.error('[RagService] dispatchNext 异常 (next):', err);
        });
      });
    } else {
      this.processing = false;
      this.progressCallback?.({ type: 'idle', fileItemId: 0, queueSize: 0, status: 'IDLE' });
    }
  }

  // ═══════════════════════════════════════════
  // 任务执行
  // ═══════════════════════════════════════════

  /**
   * 执行向量化任务
   */
  private async executeIngest(task: QueueTask & { type: 'ingest' }): Promise<void> {
    const { fileItemId, folderId, folderPath } = task;

    // 从 filedb 读取文件信息
    const fileItem = filedbService.getFileItemById(fileItemId);
    if (!fileItem) {
      logger.warn(`[RagService] 文件记录不存在 fileItemId=${fileItemId}，跳过`);
      return;
    }

    const fileName = fileItem.name;
    const relativePath = fileItem.relative_path;
    const oldFileHash = fileItem.file_hash;
    const fileStatus = fileItem.status;

    logger.info(`[RagService] 开始处理: ${fileName} (id=${fileItemId})`);

    // 不支持的格式跳过
    if (!isSupportedFormat(fileName)) {
      logger.warn(`[RagService] 不支持的格式，跳过: ${fileName}`);
      this.progressCallback?.({ type: 'skip', fileItemId, fileName, queueSize: this.queue.length, status: 'SKIPPED' });
      return;
    }

    // 构建完整文件路径
    const fullPath = relativePath ? path.join(folderPath, relativePath) : folderPath;

    // 文件不存在 → 标记失败
    if (!fs.existsSync(fullPath)) {
      filedbService.updateFileStatus(fileItemId, 'FAILED', `文件不存在: ${fullPath}`);
      this.progressCallback?.({ type: 'skip', fileItemId, fileName, queueSize: this.queue.length, status: 'FAILED' });
      return;
    }

    // 读取文件并计算哈希
    const fileBuffer = await fsp.readFile(fullPath);
    const newFileHash = createHash('sha256').update(fileBuffer).digest('hex');

    // hash 未变化且已 READY → 跳过（秒传）
    if (oldFileHash && oldFileHash === newFileHash && fileStatus === 'READY') {
      this.progressCallback?.({ type: 'skip', fileItemId, fileName, queueSize: this.queue.length, status: 'READY' });
      return;
    }

    // hash 变化或未做过向量化 → 先删除旧 RAG 数据再重新做
    if (oldFileHash && oldFileHash !== newFileHash) {
      await this.cleanupFileRagData(fileItemId);
    }

    // 更新 hash 和状态
    filedbService.updateFileHash(fileItemId, newFileHash);
    filedbService.updateFileStatus(fileItemId, 'PROCESSING', null);

    this.progressCallback?.({ type: 'ingest', fileItemId, fileName, queueSize: this.queue.length, status: 'PROCESSING' });

    try {
      // 1. 解析文档（异步，不阻塞事件循环）
      logger.info(`[RagService] 开始解析文档: ${fileName}`);
      const rawText = await parseDocument(fullPath);
      logger.info(`[RagService] 解析完成: ${fileName}, 文本长度=${rawText.length}`);

      // 2. 文本清理
      logger.info(`[RagService] 开始文本清理: ${fileName}`);
      const cleanedText = cleanText(rawText);
      logger.info(`[RagService] 文本清理完成: ${fileName}, 长度=${cleanedText.length}`);

      // 3. 结构感知切片
      logger.info(`[RagService] 开始切片: ${fileName}`);
      const chunkResults = chunkText(cleanedText, DEFAULT_CHUNKING_CONFIG);
      logger.info(`[RagService] 切片完成: ${fileName}, 切片数=${chunkResults.length}`);

      if (chunkResults.length === 0) {
        filedbService.updateFileStatus(fileItemId, 'FAILED', '切片结果为空（文件内容为空或无法提取文本）');
        this.progressCallback?.({ type: 'ingest', fileItemId, fileName, queueSize: this.queue.length, status: 'FAILED' });
        return;
      }

      // 4. 写入切片到 SQLite
      logger.info(`[RagService] 写入切片到DB: ${fileName}`);
      this.ragDb!.createChunks(chunkResults.map((chunk, index) => ({
        fileItemId,
        folderId,
        chunkIndex: index,
        chunkText: chunk.text,
        chunkSummary: chunk.text.substring(0, 100).trim(),
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
        metadataJson: JSON.stringify({
          sectionPath: chunk.sectionPath,
          chunkStrategy: chunk.chunkStrategy,
          fileName,
          fileHash: newFileHash,
        }),
      })));

      const savedChunks = this.ragDb!.getChunksByFileItemId(fileItemId);
      logger.info(`[RagService] DB切片查询完成: ${fileName}, savedChunks=${savedChunks.length}`);

      // 5. 向量化 + zvec 存储 + SQLite vector_store（内部有 yieldToEventLoop）
      logger.info(`[RagService] 开始向量化: ${fileName}`);
      await embedAndStore(
        this.collection!,
        this.embedder!,
        savedChunks.map((c: any) => ({
          fileItemId: c.file_item_id,
          chunkId: c.id,
          chunkIndex: c.chunk_index,
          folderId: c.folder_id,
          fileName,
          text: c.chunk_text,
        })),
        EMBED_BATCH_SIZE,
        this.ragDb!
      );
      logger.info(`[RagService] 向量化完成: ${fileName}`);

      // 6. MiniSearch 关键词索引
      logger.info(`[RagService] 开始关键词索引: ${fileName}, chunks=${savedChunks.length}`);
      this.kwService!.indexReadyChunks(fileName, savedChunks.map((c: any) => ({
        fileItemId: c.file_item_id,
        chunkId: c.id,
        chunkIndex: c.chunk_index,
        folderId: c.folder_id,
        fileName,
        chunkText: c.chunk_text,
        status: 'READY',
      })));
      await this.kwService!.saveToFileAsync(this.keywordIndexPath);
      logger.info(`[RagService] 关键词索引完成: ${fileName}`);

      // 7. 更新状态为 READY
      filedbService.updateFileStatus(fileItemId, 'READY', null);

      // 更新统计
      this.statsCache.vectorizedFiles = this.ragDb!.countVectorizedFiles();
      this.statsCache.keywordDocs = this.kwService!.documentCount;

      this.progressCallback?.({ type: 'ingest', fileItemId, fileName, queueSize: this.queue.length, status: 'READY' });
      logger.info(`[RagService] 文件处理完成: ${fileName} (id=${fileItemId})`);

    } catch (error: any) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.error(`[RagService] 文件处理失败: ${fileName} (id=${fileItemId}) - ${reason}`);
      filedbService.updateFileStatus(fileItemId, 'FAILED', reason);
      this.progressCallback?.({ type: 'ingest', fileItemId, fileName, queueSize: this.queue.length, status: 'FAILED' });
    }
  }

  /**
   * 执行删除清理任务
   */
  private async executeDelete(task: QueueTask & { type: 'delete' }): Promise<void> {
    await this.cleanupFileRagData(task.fileItemId);
    this.progressCallback?.({ type: 'delete', fileItemId: task.fileItemId, queueSize: this.queue.length, status: 'DELETED' });
    logger.info(`[RagService] 文件 RAG 数据已删除: (id=${task.fileItemId})`);
  }

  /**
   * 清理文件的所有 RAG 数据（zvec + SQLite + MiniSearch）
   */
  private async cleanupFileRagData(fileItemId: number): Promise<void> {
    const chunks = this.ragDb!.getChunksByFileItemId(fileItemId);
    const chunkIds = chunks.map((c: any) => c.id);
    if (chunks.length > 0) {
      deleteVectorsByFileItemId(this.collection!, fileItemId, chunks.length);
    }
    if (chunkIds.length > 0) {
      this.kwService!.deleteDocumentChunks(chunkIds);
    }
    this.ragDb!.deleteVectorStoreByFileItemId(fileItemId);
    this.ragDb!.deleteChunksByFileItemId(fileItemId);
    await this.kwService!.saveToFileAsync(this.keywordIndexPath);
  }

  // ═══════════════════════════════════════════
  // 启动恢复 & 自动入队
  // ═══════════════════════════════════════════

  /**
   * 程序启动时调用：
   *   1. 将所有 PROCESSING 状态的文件重置为 PENDING（程序上次关闭时未完成）
   *   2. 将所有 PENDING 和 FAILED 状态的支持文件入队向量化
   *
   * @param folders 授权文件夹列表
   */
  async restoreAndAutoStart(
    folders: Array<{ id: number; path: string }>
  ): Promise<{ restored: number; queued: number }> {
    let restored = 0;
    let queued = 0;

    for (const folder of folders) {
      // 1. 恢复 PROCESSING → PENDING
      const processingFiles = filedbService.getFilesByStatus(folder.id, 'PROCESSING');
      for (const file of processingFiles) {
        filedbService.updateFileStatus(file.id, 'PENDING');
        restored++;
        logger.info(`[RagService] 恢复未完成任务: ${file.name} (PROCESSING → PENDING)`);
      }

      // 2. 入队 PENDING 文件
      const pendingFiles = filedbService.getFilesByStatus(folder.id, 'PENDING');
      const ingestItems = pendingFiles
        .filter(f => isSupportedFormat(f.name))
        .map(f => ({ fileItemId: f.id, folderId: f.folder_id, folderPath: folder.path }));
      if (ingestItems.length > 0) {
        this.enqueueIngestBatch(ingestItems);
        queued += ingestItems.length;
      }

      // 3. 入队 FAILED 文件（自动重试）
      const failedFiles = filedbService.getFilesByStatus(folder.id, 'FAILED');
      const retryItems = failedFiles
        .filter(f => isSupportedFormat(f.name))
        .map(f => ({ fileItemId: f.id, folderId: f.folder_id, folderPath: folder.path }));
      if (retryItems.length > 0) {
        for (const f of failedFiles) {
          if (isSupportedFormat(f.name)) {
            filedbService.updateFileStatus(f.id, 'PENDING');
          }
        }
        this.enqueueIngestBatch(retryItems);
        queued += retryItems.length;
      }
    }

    logger.info(`[RagService] 启动恢复完成: 恢复 ${restored} 个未完成任务, 入队 ${queued} 个待处理任务`);
    return { restored, queued };
  }

  // ═══════════════════════════════════════════
  // 对外公开 API
  // ═══════════════════════════════════════════

  /**
   * 删除文件的所有 RAG 数据（对外公开，用于删除文件夹时同步清理）
   */
  async deleteFileRagData(fileItemId: number): Promise<void> {
    this.enqueueDelete(fileItemId);
  }

  /**
   * 获取向量统计信息
   */
  getStats(): { vectorizedFiles: number; keywordDocs: number; queueSize: number; processing: boolean } {
    return {
      vectorizedFiles: this.statsCache.vectorizedFiles,
      keywordDocs: this.statsCache.keywordDocs,
      queueSize: this.queue.length,
      processing: this.processing,
    };
  }
}

export const ragService = new RagService();
