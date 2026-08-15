/**
 * zvec 向量存储封装 + SQLite vector_store 表同步
 *
 * 源自 electron-rag/src/vector-store.ts
 * 双层存储架构：
 *   zvec collection        → 向量存储与 ANN 检索
 *   SQLite vector_store 表 → 向量元数据追踪
 *
 * 支持双来源：
 *   FILE    → 文件模块（file_item.id）
 *   INVOICE → OCR 票据归档（invoice_record.id）
 */

import { ZVecCreateAndOpen, ZVecOpen, ZVecCollectionSchema, ZVecDataType } from '@zvec/zvec';
import { existsSync } from 'node:fs';
import type { RagDatabase } from './ragdb';
import type { EmbeddingProvider, VectorSearchResult, DataSource } from '../types';

const VECTOR_FIELD = 'embedding';
type ZVecCollection = ReturnType<typeof ZVecCreateAndOpen>;

/**
 * 让出事件循环，防止批量向量化时阻塞主进程
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * 初始化向量存储
 *
 * - 路径不存在时：使用 ZVecCreateAndOpen 创建新库
 * - 路径已存在时（程序重启）：使用 ZVecOpen 打开已有库
 *
 * Schema 包含：
 *   - 向量字段：embedding (VECTOR_FP32, 维度由 embeddingProvider 决定)
 *   - 标量字段：fileItemId, chunkId, chunkIndex, folderId, fileName, source, sourceId
 *     （用于过滤和元数据检索）
 *
 * 注意：不要预先用 mkdirSync 创建该目录，否则 ZVecCreateAndOpen 会报
 * "path validate failed: path[...] exists" 错误。
 */
export function initVectorStore(storePath: string, dimension: number): ZVecCollection {
  // 已有库 → 直接打开
  if (existsSync(storePath)) {
    return ZVecOpen(storePath) as ZVecCollection;
  }
  // 新库 → 创建并打开（带标量字段定义）
  const schema = new ZVecCollectionSchema({
    name: 'document_chunks',
    vectors: {
      name: VECTOR_FIELD,
      dataType: ZVecDataType.VECTOR_FP32,
      dimension,
    },
    fields: [
      { name: 'fileItemId', dataType: ZVecDataType.INT64 },
      { name: 'chunkId', dataType: ZVecDataType.INT64 },
      { name: 'chunkIndex', dataType: ZVecDataType.INT64 },
      { name: 'folderId', dataType: ZVecDataType.INT64 },
      { name: 'fileName', dataType: ZVecDataType.STRING },
      { name: 'source', dataType: ZVecDataType.STRING },
      { name: 'sourceId', dataType: ZVecDataType.INT64 },
    ],
  });
  return ZVecCreateAndOpen(storePath, schema);
}

/**
 * 将切片批量写入向量库（zvec）+ 同步记录到 SQLite vector_store 表
 *
 * 1. 先删除同来源 ID 已有向量（幂等）
 * 2. 分批 embedding
 * 3. 写入 zvec collection
 * 4. 同步写入 SQLite vector_store 表
 *
 * @param chunks  切片列表（每个切片包含来源信息）
 * @param source  数据来源：FILE 或 INVOICE
 */
export async function embedAndStore(
  collection: ZVecCollection,
  embeddingProvider: EmbeddingProvider,
  chunks: Array<{
    fileItemId: number;
    chunkId: number;
    chunkIndex: number;
    folderId: number;
    fileName: string;
    text: string;
  }>,
  batchSize: number,
  ragDb: RagDatabase,
  source: DataSource = 'FILE'
): Promise<void> {
  if (chunks.length === 0) return;

  // 1. 删除旧向量记录（SQLite vector_store）
  // 注：zvec 旧向量已由调用方（ragService.executeIngest）在清理步骤中处理
  const fileItemIds = [...new Set(chunks.map(c => c.fileItemId))];
  for (const fileItemId of fileItemIds) {
    ragDb.deleteVectorStoreByFileItemId(fileItemId, source);
  }

  // 2. 分批 embedding + 写入 zvec
  const allRecords: Array<{
    id: string; fileItemId: number; chunkId: number; folderId: number;
    chunkIndex: number; fileName: string; content: string;
    metadata: Record<string, unknown>; dimension: number;
  }> = [];

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));
    const texts = batch.map(c => c.text);
    const embeddings = await embeddingProvider.embedBatch(texts);

    // ★ 让出事件循环：每个 embedding 批次完成后让主进程处理其他事件
    await yieldToEventLoop();

    const zvecDocs = batch.map((chunk, index) => ({
      id: buildStableIdForSource(source, chunk.fileItemId, chunk.chunkIndex),
      vectors: { [VECTOR_FIELD]: embeddings[index] },
      fields: {
        fileItemId: chunk.fileItemId,
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        folderId: chunk.folderId,
        fileName: chunk.fileName,
        source,
        sourceId: chunk.fileItemId,
      },
    }));
    collection.insertSync(zvecDocs);

    // ★ 让出事件循环：zvec 同步写入后让主进程处理其他事件
    await yieldToEventLoop();

    // 收集 SQLite 记录
    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      allRecords.push({
        id: buildStableIdForSource(source, chunk.fileItemId, chunk.chunkIndex),
        fileItemId: chunk.fileItemId,
        chunkId: chunk.chunkId,
        folderId: chunk.folderId,
        chunkIndex: chunk.chunkIndex,
        fileName: chunk.fileName,
        content: chunk.text,
        metadata: {
          fileItemId: chunk.fileItemId,
          chunkId: chunk.chunkId,
          chunkIndex: chunk.chunkIndex,
          folderId: chunk.folderId,
          fileName: chunk.fileName,
          source,
          sourceId: chunk.fileItemId,
        },
        dimension: embeddingProvider.dimension,
      });
    }
  }

  // 3. 同步写入 SQLite vector_store 表
  ragDb.createVectorStoreRecords(allRecords, source);
}

/** 向量检索（zvec） */
export async function searchVectors(
  collection: ZVecCollection,
  embeddingProvider: EmbeddingProvider,
  queryText: string,
  topK: number = 5
): Promise<VectorSearchResult[]> {
  const queryVector = await embeddingProvider.embed(queryText);
  const results = collection.querySync({
    fieldName: VECTOR_FIELD,
    vector: queryVector,
    topk: topK,
  });
  return (results as Array<{ id: string; score: number; fields?: Record<string, unknown> }>).map(r => ({
    id: r.id,
    score: r.score,
    fileItemId: Number(r.fields?.fileItemId ?? 0),
    chunkId: Number(r.fields?.chunkId ?? 0),
    chunkIndex: Number(r.fields?.chunkIndex ?? 0),
    folderId: Number(r.fields?.folderId ?? 0),
    fileName: String(r.fields?.fileName ?? ''),
    source: (String(r.fields?.source ?? 'FILE')) as DataSource,
  }));
}

/**
 * 删除指定文件的所有向量（zvec）
 * zvec 的 deleteSync 接受 string 或 string[]，需要传入具体的文档 ID。
 *
 * @param collection  zvec collection
 * @param fileItemId  文件项 ID
 * @param chunkCount  切片数量
 * @param source      数据来源（默认 FILE）
 */
export function deleteVectorsByFileItemId(collection: ZVecCollection, fileItemId: number, chunkCount: number, source: DataSource = 'FILE'): void {
  if (chunkCount <= 0) return;
  const ids: string[] = [];
  for (let i = 0; i < chunkCount; i++) {
    ids.push(buildStableIdForSource(source, fileItemId, i));
  }
  try {
    collection.deleteSync(ids);
  } catch {
    // 个别 ID 不存在时忽略
  }
}

/**
 * 删除指定来源 ID 的所有向量（zvec）
 * 与 deleteVectorsByFileItemId 功能相同，语义更明确。
 */
export function deleteVectorsBySourceId(collection: ZVecCollection, sourceId: number, chunkCount: number, source: DataSource): void {
  return deleteVectorsByFileItemId(collection, sourceId, chunkCount, source);
}

/**
 * 生成稳定 ID（兼容旧版 FILE 来源）
 * @param fileItemId  文件项 ID
 * @param chunkIndex  切片索引
 */
export function buildStableId(fileItemId: number, chunkIndex: number): string {
  return `file_${fileItemId}_chunk_${chunkIndex}`;
}

/**
 * 生成稳定 ID（支持多来源）
 * @param source      数据来源
 * @param sourceId    来源 ID（FILE=file_item.id, INVOICE=invoice_record.id）
 * @param chunkIndex  切片索引
 */
export function buildStableIdForSource(source: DataSource, sourceId: number, chunkIndex: number): string {
  const prefix = source === 'INVOICE' ? 'inv' : 'file';
  return `${prefix}_${sourceId}_chunk_${chunkIndex}`;
}
