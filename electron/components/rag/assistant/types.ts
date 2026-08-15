/**
 * Assistant 助手模块类型定义
 *
 * 参考 ArgusRAG 的 assistant 模块类型。
 * 助手是一个多轮对话 AI，支持两种模式：
 *   - CHAT：自由对话，使用记忆上下文
 *   - KB_SEARCH：知识库检索，在指定文件夹知识库内检索证据并生成带引用回答
 *
 * 记忆架构（三层）：
 *   - summary_text：长期摘要（按消息数/token 阈值触发）
 *   - session_memory：会话记忆（增量更新）
 *   - compact_summary：紧凑摘要（token 超阈值时压缩）
 */

import type { Citation, EvidenceLevel, LlmUsageInfo } from '../types';

/** 助手工具模式 */
export type AssistantToolMode = 'CHAT' | 'KB_SEARCH';

/**
 * 知识库检索范围
 * - NONE：不使用知识库（纯 CHAT 模式）
 * - ALL：全部知识库（跨所有文件夹 + OCR 归档）
 * - FOLDER：指定文件夹知识库
 * - INVOICE：仅 OCR 归档票据
 */
export type KbScope = 'NONE' | 'ALL' | 'FOLDER' | 'INVOICE';

/** 消息角色 */
export type AssistantMessageRole = 'USER' | 'ASSISTANT' | 'TOOL';

// ═══════════════════════════════════════════
// 消息 VO
// ═══════════════════════════════════════════

/** 消息视图对象（返回给前端） */
export interface AssistantMessageVO {
  messageId: number;
  sessionId: number;
  role: AssistantMessageRole;
  toolMode: AssistantToolMode | null;
  folderId: number | null;
  content: string;
  structuredPayload: string | null;
  citations?: Citation[];
  createdAt: string;
}

// ═══════════════════════════════════════════
// 会话 VO
// ═══════════════════════════════════════════

/** 会话列表项 */
export interface AssistantSessionListItemVO {
  sessionId: number;
  title: string;
  lastMessageAt: string | null;
}

/** 会话详情 */
export interface AssistantSessionDetailVO {
  sessionId: number;
  title: string;
  status: string;
  lastMessageAt: string | null;
  createdAt: string;
}

// ═══════════════════════════════════════════
// 对话上下文
// ═══════════════════════════════════════════

/** 对话上下文（含记忆层 + 最近消息） */
export interface AssistantConversationContext {
  /** 长期摘要文本 */
  summaryText: string | null;
  /** 紧凑摘要（短期记忆压缩结果） */
  compactSummary: string | null;
  /** 会话记忆文本 */
  sessionMemory: string | null;
  /** 最近 N 条消息（按时间升序） */
  recentMessages: AssistantMessageVO[];
}

/** 对话上下文 VO（返回给前端，用于恢复历史） */
export interface AssistantConversationContextVO {
  summaryText: string | null;
  recentMessages: AssistantMessageVO[];
}

// ═══════════════════════════════════════════
// 聊天请求 / 响应
// ═══════════════════════════════════════════

/** 聊天请求体 */
export interface AssistantChatRequest {
  sessionId: number;
  message: string;
  toolMode: AssistantToolMode;
  folderId?: number | null;
  /**
   * 知识库检索范围（KB_SEARCH 模式下生效）
   * - NONE：不检索（与 CHAT 模式等效）
   * - ALL：跨全部知识库检索（文件夹 + OCR 归档）
   * - FOLDER：仅检索 folderId 指定的文件夹
   * - INVOICE：仅检索 OCR 归档票据
   * 默认为 FOLDER（向后兼容）
   */
  kbScope?: KbScope | null;
}

/** Agent 执行结果 */
export interface AssistantAgentResult {
  reply: string;
  citations: Citation[];
  evidenceLevel: EvidenceLevel | null;
}

// ═══════════════════════════════════════════
// SSE 流式事件
// ═══════════════════════════════════════════

/** SSE 事件类型 */
export type AssistantStreamEventType = 'start' | 'token' | 'citations' | 'complete' | 'error';

/** SSE 流式事件 */
export interface AssistantChatStreamEvent {
  event: AssistantStreamEventType;
  sessionId: number;
  toolMode: AssistantToolMode;
  folderId: number | null;
  /** 增量文本（token 事件） */
  delta: string | null;
  /** 消息 ID（complete 事件） */
  messageId: number | null;
  /** 完整回复（complete 事件） */
  reply: string | null;
  /** 引用列表（citations / complete 事件） */
  citations: Citation[] | null;
  /** 证据等级（citations 事件） */
  evidenceLevel: EvidenceLevel | null;
  /** 用量信息（complete 事件） */
  usage: LlmUsageInfo | null;
  /** 错误信息（error 事件） */
  error: string | null;
}
