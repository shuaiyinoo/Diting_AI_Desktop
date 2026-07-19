/**
 * LLM 对话客户端（OpenAI 兼容 API）
 *
 * 为什么不使用 @kreuzberg/node 做对话：
 *   @kreuzberg/node 的 LLM 能力仅用于 VLM OCR 和文档结构化提取（与文档解析耦合），
 *   不提供通用 chat completion 接口。因此 LLM 对话调用采用 OpenAI 兼容 API，
 *   复用 llmdb 中已配置的模型（base_url / api_key / model_name）。
 *
 * 功能：
 *   - chat()：同步对话，返回完整文本 + usage
 *   - chatStream()：流式对话，逐 chunk 回调 + 最终 usage
 *   - 自动提取 prompt_tokens / completion_tokens / total_tokens
 *   - 流式场景下若 API 未返回 usage，按字符数估算（4 char ≈ 1 token）
 */

import type { LlmModelRecord } from '../../../service/database/llmdb';
import type { LlmUsageInfo } from '../types';

/** 聊天消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 同步对话结果 */
export interface ChatResult {
  /** 模型返回的完整文本 */
  content: string;
  /** 用量信息 */
  usage: LlmUsageInfo;
  /** 模型名称 */
  modelName: string;
}

/** 流式对话回调 */
export interface StreamCallbacks {
  /** 收到一个文本片段 */
  onToken: (token: string) => void;
  /** 流完成（含用量） */
  onComplete: (usage: LlmUsageInfo) => void;
  /** 流异常 */
  onError: (error: Error) => void;
}

/** 默认请求超时（毫秒） */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * 同步对话：调用 OpenAI 兼容的 /chat/completions 接口（stream=false）。
 */
export async function chat(
  model: LlmModelRecord,
  messages: ChatMessage[],
  options: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<ChatResult> {
  const startMs = Date.now();
  const url = buildChatUrl(model.base_url);
  const body = {
    model: model.model_name,
    messages,
    temperature: model.temperature ?? 0.7,
    max_tokens: model.max_tokens ?? 4096,
    stream: false,
  };

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: buildHeaders(model.api_key),
    body: JSON.stringify(body),
    signal: options.signal,
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  if (!response.ok) {
    const errText = await safeReadText(response);
    throw new Error(`LLM 请求失败 HTTP ${response.status}: ${errText.substring(0, 500)}`);
  }

  const data = await response.json() as any;
  const content = data?.choices?.[0]?.message?.content ?? '';
  const usage = extractUsage(data?.usage, false, Date.now() - startMs);

  return { content, usage, modelName: model.model_name };
}

/**
 * 流式对话：调用 OpenAI 兼容的 /chat/completions 接口（stream=true）。
 *
 * 通过 ReadableStream 逐 chunk 解析 SSE 数据行，推送 token。
 * 流结束后从最后一个 chunk 的 usage 或估算值回调 onComplete。
 */
export async function chatStream(
  model: LlmModelRecord,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  options: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<void> {
  const startMs = Date.now();
  const url = buildChatUrl(model.base_url);
  const body = {
    model: model.model_name,
    messages,
    temperature: model.temperature ?? 0.7,
    max_tokens: model.max_tokens ?? 4096,
    stream: true,
    // 部分 OpenAI 兼容服务支持 stream_options.include_usage
    stream_options: { include_usage: true },
  };

  let response: Response;
  try {
    response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: buildHeaders(model.api_key),
      body: JSON.stringify(body),
      signal: options.signal,
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  } catch (err) {
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  if (!response.ok) {
    const errText = await safeReadText(response);
    callbacks.onError(new Error(`LLM 流式请求失败 HTTP ${response.status}: ${errText.substring(0, 500)}`));
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    callbacks.onError(new Error('响应体不可读：response.body 为空'));
    return;
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let charCount = 0;
  let finalUsage: LlmUsageInfo | null = null;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // 按 SSE 规范分割：以 \n\n 分隔事件，每事件以 data: 开头
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') continue;

        try {
          const chunk = JSON.parse(dataStr) as any;
          // 提取 token
          const delta = chunk?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            charCount += delta.length;
            callbacks.onToken(delta);
          }
          // 提取 usage（部分服务在最后一个 chunk 返回）
          if (chunk?.usage) {
            finalUsage = extractUsage(chunk.usage, false, Date.now() - startMs);
          }
        } catch {
          // 单行解析失败不中断流
        }
      }
    }
  } catch (err) {
    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    return;
  }

  // 流结束：若未拿到 usage，按字符数估算
  if (finalUsage === null) {
    const estimatedCompletion = Math.max(1, Math.ceil(charCount / 4));
    finalUsage = {
      promptTokens: 0,
      completionTokens: estimatedCompletion,
      totalTokens: estimatedCompletion,
      estimated: true,
      latencyMs: Date.now() - startMs,
    };
  } else {
    finalUsage = { ...finalUsage, latencyMs: Date.now() - startMs };
  }

  callbacks.onComplete(finalUsage);
}

// ═══════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════

function buildChatUrl(baseUrl: string): string {
  const trimmed = (baseUrl || '').replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  return `${trimmed}/chat/completions`;
}

function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

function extractUsage(
  usage: any,
  estimated: boolean,
  latencyMs: number
): LlmUsageInfo {
  if (!usage) {
    return { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimated, latencyMs };
  }
  return {
    promptTokens: usage.prompt_tokens ?? usage.promptTokens ?? 0,
    completionTokens: usage.completion_tokens ?? usage.completionTokens ?? 0,
    totalTokens: usage.total_tokens ?? usage.totalTokens ?? 0,
    estimated,
    latencyMs,
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: init.signal ?? controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
