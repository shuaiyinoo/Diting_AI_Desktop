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
 *   5. **多来源支持**：FILE 来源从文件解析向量化；INVOICE 来源从 OCR 归档文本向量化。
 *
 * 主进程职责：
 *   - 管理任务队列
 *   - 从 filedb 读取文件信息
 *   - 执行文档解析 → 清理 → 切片 → embedding → zvec 存储 → SQLite → MiniSearch
 *   - 对 OCR 归档记录：跳过解析，直接对 ocr_text 切片 → embedding → 存储
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
import type { DataSource } from '../types';

// ═══════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════

const EMBED_BATCH_SIZE = 9;

// ═══════════════════════════════════════════
// 队列任务类型
// ═══════════════════════════════════════════

type QueueTask =
  | { type: 'ingest'; fileItemId: number; folderId: number; folderPath: string }
  | { type: 'delete'; fileItemId: number }
  | { type: 'ingestInvoice'; recordId: number; ocrText: string; aiData: string; fileName: string; folderId: number }
  | { type: 'deleteInvoice'; recordId: number };

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

  // ── OCR 归档相关队列方法 ──

  /**
   * 将 OCR 归档记录入队（向量化）
   *
   * 归档成功后调用此方法，将 OCR 文本 + 结构化数据送入 RAG 管道。
   * 不需要解析文件，直接从纯文本切片。
   *
   * @param recordId   归档记录 ID（invoice_record.id）
   * @param ocrText    OCR 识别全文
   * @param aiData     AI 结构化提取结果 JSON 字符串
   * @param fileName   原始文件名（用于展示和关键词索引）
   * @param folderId   授权文件夹 ID
   */
  enqueueInvoiceIngest(
    recordId: number,
    ocrText: string,
    aiData: string,
    fileName: string,
    folderId: number
  ): void {
    const exists = this.queue.some(
      t => t.type === 'ingestInvoice' && t.recordId === recordId
    );
    if (exists) return;

    this.queue.push({ type: 'ingestInvoice', recordId, ocrText, aiData, fileName, folderId });
    logger.info(`[RagService] 入队 OCR 归档向量化任务 recordId=${recordId}, fileName=${fileName}, 队列长度=${this.queue.length}`);
    this.processQueue();
  }

  /**
   * 将 OCR 归档记录删除清理任务入队
   *
   * 取消归档时调用此方法，清理该归档记录的所有 RAG 数据。
   *
   * @param recordId  归档记录 ID（invoice_record.id）
   */
  enqueueInvoiceDelete(recordId: number): void {
    const exists = this.queue.some(
      t => t.type === 'deleteInvoice' && t.recordId === recordId
    );
    if (exists) return;

    // 从队列中移除同 recordId 的 ingestInvoice 任务（还没开始处理就删了）
    this.queue = this.queue.filter(
      t => !(t.type === 'ingestInvoice' && t.recordId === recordId)
    );

    this.queue.push({ type: 'deleteInvoice', recordId });
    logger.info(`[RagService] 入队 OCR 归档删除任务 recordId=${recordId}, 队列长度=${this.queue.length}`);
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
    const taskLabel = 'fileItemId' in task ? `fileItemId=${task.fileItemId}` : `recordId=${task.recordId}`;
    logger.info(`[RagService] 派发任务: ${task.type} ${taskLabel} (队列剩余 ${this.queue.length})`);

    try {
      if (task.type === 'ingest') {
        await this.executeIngest(task);
      } else if (task.type === 'delete') {
        await this.executeDelete(task);
      } else if (task.type === 'ingestInvoice') {
        await this.executeInvoiceIngest(task);
      } else if (task.type === 'deleteInvoice') {
        await this.executeInvoiceDelete(task);
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
  // 任务执行 — 文件模块
  // ═══════════════════════════════════════════

  /**
   * 执行向量化任务（文件模块）
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
      const source: DataSource = 'FILE';
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
        source,
      })), source);

      const savedChunks = this.ragDb!.getChunksByFileItemId(fileItemId, source);
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
        this.ragDb!,
        source
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
        source,
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
   * 执行删除清理任务（文件模块）
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
    const source: DataSource = 'FILE';
    const chunks = this.ragDb!.getChunksByFileItemId(fileItemId, source);
    const chunkIds = chunks.map((c: any) => c.id);
    if (chunks.length > 0) {
      deleteVectorsByFileItemId(this.collection!, fileItemId, chunks.length, source);
    }
    if (chunkIds.length > 0) {
      this.kwService!.deleteDocumentChunks(chunkIds);
    }
    this.ragDb!.deleteVectorStoreByFileItemId(fileItemId, source);
    this.ragDb!.deleteChunksByFileItemId(fileItemId, source);
    await this.kwService!.saveToFileAsync(this.keywordIndexPath);
  }

  // ═══════════════════════════════════════════
  // 任务执行 — OCR 票据归档模块
  // ═══════════════════════════════════════════

  /**
   * 执行 OCR 归档向量化任务
   *
   * 与文件模块的 executeIngest 不同：
   *   - 跳过文档解析步骤（OCR 文本已有）
   *   - 将 ocr_text + 结构化 AI 数据拼合为统一文本
   *   - 切片、embedding、存储流程完全复用
   *   - source='INVOICE'，sourceId=recordId
   */
  private async executeInvoiceIngest(task: QueueTask & { type: 'ingestInvoice' }): Promise<void> {
    const { recordId, ocrText, aiData, fileName, folderId } = task;
    const source: DataSource = 'INVOICE';

    logger.info(`[RagService] 开始处理 OCR 归档: ${fileName} (recordId=${recordId})`);

    if (!ocrText || ocrText.trim().length === 0) {
      logger.warn(`[RagService] OCR 文本为空，跳过: ${fileName} (recordId=${recordId})`);
      return;
    }

    // 先清理旧数据（重新归档场景）
    await this.cleanupInvoiceRagData(recordId);

    try {
      // 1. 拼合文本：OCR 全文 + 结构化数据摘要
      const fullText = this.buildInvoiceText(ocrText, aiData, fileName);
      logger.info(`[RagService] OCR 归档文本拼合完成: ${fileName}, 文本长度=${fullText.length}`);

      // 2. 文本清理
      const cleanedText = cleanText(fullText);
      logger.info(`[RagService] 文本清理完成: ${fileName}, 长度=${cleanedText.length}`);

      // 3. 切片
      const chunkResults = chunkText(cleanedText, DEFAULT_CHUNKING_CONFIG);
      logger.info(`[RagService] 切片完成: ${fileName}, 切片数=${chunkResults.length}`);

      if (chunkResults.length === 0) {
        logger.warn(`[RagService] 切片结果为空: ${fileName} (recordId=${recordId})`);
        return;
      }

      // 4. 写入切片到 SQLite
      logger.info(`[RagService] 写入切片到DB: ${fileName} (INVOICE)`);
      this.ragDb!.createChunks(chunkResults.map((chunk, index) => ({
        fileItemId: recordId,
        folderId,
        chunkIndex: index,
        chunkText: chunk.text,
        chunkSummary: chunk.text.substring(0, 100).trim(),
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
        metadataJson: JSON.stringify({
          fileName,
          source: 'INVOICE',
          recordId,
        }),
        source,
      })), source);

      const savedChunks = this.ragDb!.getChunksByFileItemId(recordId, source);
      logger.info(`[RagService] DB切片查询完成: ${fileName} (INVOICE), savedChunks=${savedChunks.length}`);

      // 5. 向量化 + zvec 存储 + SQLite vector_store
      logger.info(`[RagService] 开始向量化: ${fileName} (INVOICE)`);
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
        this.ragDb!,
        source
      );
      logger.info(`[RagService] 向量化完成: ${fileName} (INVOICE)`);

      // 6. MiniSearch 关键词索引
      logger.info(`[RagService] 开始关键词索引: ${fileName} (INVOICE), chunks=${savedChunks.length}`);
      this.kwService!.indexReadyChunks(fileName, savedChunks.map((c: any) => ({
        fileItemId: c.file_item_id,
        chunkId: c.id,
        chunkIndex: c.chunk_index,
        folderId: c.folder_id,
        fileName,
        chunkText: c.chunk_text,
        status: 'READY',
        source,
      })));
      await this.kwService!.saveToFileAsync(this.keywordIndexPath);
      logger.info(`[RagService] 关键词索引完成: ${fileName} (INVOICE)`);

      // 更新统计
      this.statsCache.vectorizedFiles = this.ragDb!.countVectorizedFiles();
      this.statsCache.keywordDocs = this.kwService!.documentCount;

      this.progressCallback?.({ type: 'ingest', fileItemId: recordId, fileName, queueSize: this.queue.length, status: 'READY' });
      logger.info(`[RagService] OCR 归档处理完成: ${fileName} (recordId=${recordId})`);

    } catch (error: any) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.error(`[RagService] OCR 归档处理失败: ${fileName} (recordId=${recordId}) - ${reason}`);
      this.progressCallback?.({ type: 'ingest', fileItemId: recordId, fileName, queueSize: this.queue.length, status: 'FAILED' });
    }
  }

  /**
   * 执行 OCR 归档删除清理任务
   */
  private async executeInvoiceDelete(task: QueueTask & { type: 'deleteInvoice' }): Promise<void> {
    await this.cleanupInvoiceRagData(task.recordId);
    this.progressCallback?.({ type: 'delete', fileItemId: task.recordId, queueSize: this.queue.length, status: 'DELETED' });
    logger.info(`[RagService] OCR 归档 RAG 数据已删除: (recordId=${task.recordId})`);
  }

  /**
   * 清理 OCR 归档记录的所有 RAG 数据（zvec + SQLite + MiniSearch）
   *
   * @param recordId  归档记录 ID（invoice_record.id）
   */
  private async cleanupInvoiceRagData(recordId: number): Promise<void> {
    const source: DataSource = 'INVOICE';
    const chunks = this.ragDb!.getChunksByFileItemId(recordId, source);
    const chunkIds = chunks.map((c: any) => c.id);
    if (chunks.length > 0) {
      deleteVectorsByFileItemId(this.collection!, recordId, chunks.length, source);
    }
    if (chunkIds.length > 0) {
      this.kwService!.deleteDocumentChunks(chunkIds);
    }
    this.ragDb!.deleteVectorStoreByFileItemId(recordId, source);
    this.ragDb!.deleteChunksByFileItemId(recordId, source);
    await this.kwService!.saveToFileAsync(this.keywordIndexPath);
  }

  /**
   * 拼合 OCR 文本和结构化数据为统一文本
   *
   * 将 OCR 全文和 AI 提取的结构化字段拼合为一段完整的文本，
   * 使向量化后检索时既能命中 OCR 原文，也能命中结构化字段。
   */
  private buildInvoiceText(ocrText: string, aiData: string, fileName: string): string {
    const parts: string[] = [`文件名：${fileName}`];

    // 添加结构化数据摘要（如果存在）
    if (aiData) {
      try {
        const ai = JSON.parse(aiData);
        const structuredLines: string[] = [];

        // 添加类型信息
        if (ai.type_name) {
          structuredLines.push(`票据类型：${ai.type_name}`);
        }
        if (ai.category_display) {
          structuredLines.push(`大类：${ai.category_display}`);
        }

        // 添加归一化字段
        const sd = ai.structured_data;
        if (sd) {
          const fieldLabels: Record<string, string> = {
            invoice_number: '票据号码',
            invoice_code: '票据代码',
            issue_date: '开票日期',
            amount_total: '总金额',
            amount_tax: '税额',
            payer_name: '购买方',
            payee_name: '销售方',
            province: '省份',
            city: '城市',
          };
          for (const [key, label] of Object.entries(fieldLabels)) {
            const value = sd[key];
            if (value !== null && value !== undefined && value !== '') {
              structuredLines.push(`${label}：${value}`);
            }
          }
        }

        if (structuredLines.length > 0) {
          parts.push(structuredLines.join('\n'));
        }
      } catch {
        // AI 数据解析失败，仅使用 OCR 文本
      }
    }

    // 添加 OCR 全文
    parts.push(ocrText);

    return parts.join('\n\n');
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
   * 删除 OCR 归档记录的所有 RAG 数据（对外公开，用于取消归档时同步清理）
   */
  async deleteInvoiceRagData(recordId: number): Promise<void> {
    this.enqueueInvoiceDelete(recordId);
  }

  /**
   * 确保资源初始化完成（对外公开，供 QA 检索等模块在调用前确保资源就绪）
   */
  async ensureReady(): Promise<void> {
    await this.initialize();
  }

  /**
   * 获取检索上下文资源（供 QA 模块的混合检索使用）
   *
   * 返回已初始化的 RAG 资源句柄：
   *   - ragDb：SQLite 切片数据库
   *   - collection：zvec 向量库
   *   - kwService：MiniSearch 关键词索引
   *   - embedder：嵌入模型提供者
   *
   * 调用此方法会自动触发惰性初始化（首次调用时加载模型、打开数据库等）。
   */
  async getRetrievalContext(): Promise<{
    ragDb: RagDatabase;
    collection: ReturnType<typeof initVectorStore>;
    kwService: KeywordSearchService;
    embedder: QwenEmbedderProvider;
  }> {
    await this.initialize();
    return {
      ragDb: this.ragDb!,
      collection: this.collection!,
      kwService: this.kwService!,
      embedder: this.embedder!,
    };
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