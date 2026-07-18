/**
 * RAG 类型定义
 *
 * 基于 electron-rag ARCHITECTURE.md 的设计，适配 electron-egg 文件管理模块。
 * 文件记录使用已有的 file_item 表（filedb.ts），RAG 模块只负责切片表和向量表。
 */

/** 切片配置 */
export interface ChunkingConfig {
  /** 目标 token 数（简化为字符数 1:1） */
  targetTokens: number;
  /** 最大 token 数 */
  maxTokens: number;
  /** 重叠 token 数 */
  overlapTokens: number;
}

/** 默认切片配置 */
export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  targetTokens: 500,
  maxTokens: 800,
  overlapTokens: 80,
};

/** 切片中间结果 */
export interface ChunkResult {
  text: string;
  charStart: number;
  charEnd: number;
  sectionPath: string;
  chunkStrategy: string;
}

/** 切片记录（对应 document_chunks 表） */
export interface DocumentChunkRecord {
  id?: number;
  fileItemId: number; // 关联 file_item.id
  folderId: number;
  chunkIndex: number;
  chunkText: string;
  chunkSummary: string | null;
  charStart: number;
  charEnd: number;
  metadataJson: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** 向量存储记录（对应 vector_store 表） */
export interface VectorStoreRecord {
  id: string;
  fileItemId: number;
  chunkId: number;
  folderId: number;
  chunkIndex: number;
  fileName: string;
  content: string;
  metadata: Record<string, unknown>;
  dimension: number;
  status: 'VECTORIZED' | 'PENDING' | 'FAILED';
  createdAt?: string;
}

/** Embedding 提供者接口 */
export interface EmbeddingProvider {
  readonly dimension: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

/** 向量检索结果 */
export interface VectorSearchResult {
  id: string;
  score: number;
  fileItemId: number;
  chunkId: number;
  chunkIndex: number;
  folderId: number;
  fileName: string;
}

/** 关键词检索命中 */
export interface KeywordHit {
  fileItemId: number;
  chunkId: number;
  chunkIndex: number;
  fileName: string;
  chunkText: string;
  rawScore: number;
  normalizedScore: number;
}

/**
 * 支持的文件扩展名（用于向量化解析）
 * 基于 @kreuzberg/node 支持的 91+ 文件格式
 */
export const SUPPORTED_VECTOR_EXTENSIONS = [
  // Office Documents
  '.pdf', '.docx', '.docm', '.dotx', '.dotm', '.dot', '.odt',
  '.xlsx', '.xlsm', '.xlsb', '.xls', '.xla', '.xlam', '.xltm', '.xltx', '.xlt', '.ods',
  '.pptx', '.pptm', '.ppsx', '.potx', '.potm', '.pot', '.ppt',
  '.epub', '.fb2', '.dbf', '.hwp', '.hwpx',
  // Images (OCR)
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.svg',
  // Web & Data
  '.html', '.htm', '.xhtml', '.xml', '.json', '.yaml', '.yml', '.toml', '.csv', '.tsv',
  // Text & Markdown
  '.txt', '.md', '.markdown', '.djot', '.rst', '.org', '.rtf',
  // Email & Archives
  '.eml', '.msg', '.zip', '.tar', '.tgz', '.gz', '.7z',
  // Academic & Scientific
  '.bib', '.biblatex', '.ris', '.nbib', '.enw', '.csl',
  '.tex', '.latex', '.typst', '.jats', '.ipynb', '.docbook',
  // Documentation
  '.opml', '.pod', '.mdoc', '.troff',
  // Common Code (tree-sitter)
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '.py', '.pyw', '.go', '.java', '.c', '.h', '.cpp', '.hpp', '.cc', '.cxx',
  '.rs', '.rb', '.php', '.sh', '.bash', '.zsh', '.sql',
  '.kt', '.swift', '.scala', '.clj', '.cljs', '.ex', '.exs',
  '.lua', '.r', '.dart', '.vue', '.svelte',
];

/** 不需要向量化的系统/临时文件名 */
const IGNORE_FILENAMES = ['.ds_store', 'thumbs.db'];

/**
 * 判断文件扩展名是否支持向量化
 */
export function isVectorSupported(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  const baseName = lower.split('/').pop() || lower;
  if (IGNORE_FILENAMES.includes(baseName)) return false;
  const ext = lower.match(/\.([^.]+)$/)?.[1];
  if (!ext) return false;
  return SUPPORTED_VECTOR_EXTENSIONS.includes(`.${ext}`);
}
