/**
 * RAG 模块统一导出入口
 *
 * 目录结构：
 *   core/        — 核心编排层（队列 + 摄取流程）
 *   database/    — 数据持久化层（SQLite + zvec + MiniSearch）
 *   parser/      — 文档解析层（PDF/DOCX）
 *   processor/   — 文本处理层（切片 + 清理）
 *   embedding/   — 向量嵌入层（Qwen ONNX）
 *   types/       — 共享类型定义
 *
 * 外部使用时只需从此入口导入：
 *   import { ragService, isVectorSupported } from '../components/rag';
 */

// ═══════════════════════════════════════════
// 核心服务
// ═══════════════════════════════════════════

export { ragService } from './core/ragService';

// ═══════════════════════════════════════════
// 类型与常量
// ═══════════════════════════════════════════

export {
  isVectorSupported,
  SUPPORTED_VECTOR_EXTENSIONS,
  DEFAULT_CHUNKING_CONFIG,
} from './types';

export type {
  ChunkingConfig,
  ChunkResult,
  DocumentChunkRecord,
  VectorStoreRecord,
  EmbeddingProvider,
  VectorSearchResult,
  KeywordHit,
} from './types';

// ═══════════════════════════════════════════
// 数据库层（按需导入）
// ═══════════════════════════════════════════

export { RagDatabase } from './database/ragdb';
export { KeywordSearchService } from './database/keyword-search';
export type { ChunkIndexItem } from './database/keyword-search';
export {
  initVectorStore,
  embedAndStore,
  searchVectors,
  deleteVectorsByFileItemId,
  buildStableId,
} from './database/vector-store';

// ═══════════════════════════════════════════
// 文档解析层（按需导入）
// ═══════════════════════════════════════════

export {
  parseDocument,
  isSupportedFormat,
  parserRegistry,
} from './parser/parser';
export type { DocumentParser } from './parser/parser';

// ═══════════════════════════════════════════
// 文本处理层（按需导入）
// ═══════════════════════════════════════════

export { chunkText } from './processor/chunker';
export { cleanText } from './processor/text-cleanup';

// ═══════════════════════════════════════════
// 嵌入层（按需导入）
// ═══════════════════════════════════════════

export { QwenEmbedderProvider } from './embedding/embedding';
export type { QwenEmbedderConfig } from './embedding/embedding';
