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

export {
  EvidenceLevel,
} from './types';
export type {
  RetrievalSource,
  RetrievalCandidate,
  EvidenceDocument,
  EvidenceMetadata,
  RetrievedEvidenceBundle,
  LlmUsageInfo,
  KnowledgeAnswerOutput,
  Citation,
  AskQuestionResponse,
  EvidenceOverview,
  DocumentEvidenceGroup,
  EvidenceSnippet,
  LlmModule,
  LlmEndpoint,
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

// ═══════════════════════════════════════════
// 混合检索层（QA 用）
// ═══════════════════════════════════════════

export { hybridRetrievalService } from './retrieval/hybridRetrieval';

// ═══════════════════════════════════════════
// LLM 对话层
// ═══════════════════════════════════════════

export { chat, chatStream } from './llm/llmClient';
export type { ChatMessage, ChatResult, ChatOptions, StreamCallbacks } from './llm/llmClient';
export {
  buildSystemPrompt,
  buildStreamSystemPrompt,
  buildUserPrompt,
  buildChatMessages,
  buildStreamChatMessages,
  parseAnswer,
  formatEvidenceContext,
  INSUFFICIENT_EVIDENCE_CODE,
  INSUFFICIENT_EVIDENCE_MESSAGE,
  ANSWER_FORMAT_ERROR_CODE,
  ANSWER_FORMAT_ERROR_MESSAGE,
} from './llm/promptBuilder';

// ═══════════════════════════════════════════
// QA 编排层
// ═══════════════════════════════════════════

export { qaService } from './qa/qaService';
export type { AskResult, StreamContext } from './qa/qaService';
export { assembleCitations, assembleEvidenceOverview } from './qa/citationAssembler';

// ═══════════════════════════════════════════
// Metrics 统计层
// ═══════════════════════════════════════════

export { metricsDbService } from './metrics/metricsDb';
export type {
  LlmUsageRecordEntity,
  RecordUsageParams,
  UsageStatsRow,
  DailyStatsRow,
  ModuleDistRow,
} from './metrics/metricsDb';
export { calculateCost } from './metrics/costCalculator';
export { recordUsage } from './metrics/usageCollector';
export type { UsageRecordParams } from './metrics/usageCollector';

// ═══════════════════════════════════════════
// Assistant 助手层
// ═══════════════════════════════════════════

export { assistantService } from './assistant/assistantService';
export type { StreamCallbacks as AssistantStreamCallbacks } from './assistant/assistantService';
export {
  promptContextBuilder,
} from './assistant/promptContextBuilder';
export {
  shortTermMemoryHook,
} from './assistant/memory/shortTermMemoryHook';
export {
  shortTermMemoryMaintenanceService,
} from './assistant/memory/shortTermMemoryMaintenanceService';
export {
  sessionSummaryService,
} from './assistant/memory/sessionSummaryService';
export {
  memorySummarizer,
} from './assistant/memory/memorySummarizer';
export type {
  AssistantToolMode,
  AssistantMessageRole,
  AssistantMessageVO,
  AssistantSessionListItemVO,
  AssistantSessionDetailVO,
  AssistantConversationContext,
  AssistantConversationContextVO,
  AssistantChatRequest,
  AssistantAgentResult,
  AssistantChatStreamEvent,
  AssistantStreamEventType,
} from './assistant/types';
export { statisticsService } from './metrics/statisticsService';
export type { StatsPeriod, MetricsOverviewVO } from './metrics/statisticsService';
