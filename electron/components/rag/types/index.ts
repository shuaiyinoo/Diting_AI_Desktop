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

// ═══════════════════════════════════════════
// QA 模块类型定义
// ═══════════════════════════════════════════

/**
 * 检索证据充分度等级。
 * 用于评估混合检索返回的文档证据对回答用户问题的支撑程度。
 */
export enum EvidenceLevel {
  /** 无证据：检索未命中任何相关文档，系统应直接拒绝回答 */
  NONE = 'NONE',
  /** 弱证据：仅命中少量低相关性文档，回答时必须明确说明依据有限 */
  WEAK = 'WEAK',
  /** 部分证据：证据仅覆盖问题的部分方面，未覆盖部分需明确说明不足 */
  PARTIAL = 'PARTIAL',
  /** 充分证据：多通道检索结果互相佐证且评分较高，可正常回答 */
  SUFFICIENT = 'SUFFICIENT',
}

/** 检索来源标识 */
export type RetrievalSource = 'VECTOR' | 'KEYWORD' | 'BOTH';

/**
 * 混合检索候选项：代表一个切片在检索结果中的命中信息。
 */
export interface RetrievalCandidate {
  fileItemId: number;
  chunkId: number;
  chunkIndex: number;
  folderId: number;
  fileName: string;
  /** 向量检索评分（取多次命中的最大值） */
  vectorScore: number;
  /** 关键词检索评分（取多次命中的最大值） */
  keywordScore: number;
  /** RRF 融合评分（累加值） */
  rankingScore: number;
  /** 是否在向量检索中命中 */
  vectorMatched: boolean;
  /** 是否在关键词检索中命中 */
  keywordMatched: boolean;
}

/**
 * 检索证据文档：组装后的证据单元，包含文本和元数据。
 */
export interface EvidenceDocument {
  /** 证据编号，如 "E1" */
  evidenceId: string;
  /** 证据文本（含文件名前缀） */
  text: string;
  /** 元数据 */
  metadata: EvidenceMetadata;
}

/** 证据元数据 */
export interface EvidenceMetadata {
  evidenceId: string;
  fileItemId: number;
  folderId: number;
  chunkId: number;
  chunkIndex: number;
  fileName: string;
  /** 归一化后的相关性评分 [0, 1) */
  score: number;
  retrievalSource: RetrievalSource;
  coverageMode: string;
  vectorScore: number;
  keywordScore: number;
  hybridScore: number;
}

/**
 * 检索证据束：混合检索的完整结果。
 */
export interface RetrievedEvidenceBundle {
  documents: EvidenceDocument[];
  evidenceLevel: EvidenceLevel;
  /** 证据指导语，告知大模型当前证据状态下的回答策略 */
  evidenceGuidance: string;
}

/** LLM 用量信息 */
export interface LlmUsageInfo {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** 是否为估算值（流式场景下未返回 usage 时为 true） */
  estimated: boolean;
  /** 调用耗时（毫秒） */
  latencyMs: number;
}

/** 大模型结构化回答输出 */
export interface KnowledgeAnswerOutput {
  answered: boolean;
  answer: string;
  reasonCode: string | null;
  reasonMessage: string | null;
}

/** 引用来源 */
export interface Citation {
  fileItemId: number | null;
  chunkId: number | null;
  chunkIndex: number | null;
  fileName: string;
  score: number;
  snippet: string | null;
}

/** 问答响应 */
export interface AskQuestionResponse {
  answered: boolean;
  answer: string | null;
  reasonCode: string | null;
  reasonMessage: string | null;
  citations: Citation[];
  evidenceOverview: EvidenceOverview | null;
  /** 持久化后的 QA 记录 ID */
  recordId: number | null;
}

/** 证据覆盖概览 */
export interface EvidenceOverview {
  documentCount: number;
  evidenceCount: number;
  coverageMode: string;
  groups: DocumentEvidenceGroup[];
  warnings: string[];
}

/** 按文档聚合后的证据统计 */
export interface DocumentEvidenceGroup {
  fileItemId: number | null;
  fileName: string;
  evidenceCount: number;
  topScore: number;
  retrievalSources: string[];
  snippets: EvidenceSnippet[];
}

/** 单条证据切片摘要 */
export interface EvidenceSnippet {
  evidenceId: string | null;
  chunkId: number | null;
  chunkIndex: number | null;
  score: number;
  retrievalSource: string;
  snippet: string | null;
}

/** LLM 模块标识 */
export type LlmModule = 'QA' | 'ASSISTANT';

/** LLM 调用端点标识 */
export type LlmEndpoint =
  | 'qa/ask'
  | 'qa/stream-ask'
  | 'assistant/chat'
  | 'assistant/chat/stream';
