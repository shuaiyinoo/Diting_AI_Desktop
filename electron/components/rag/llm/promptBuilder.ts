/**
 * QA 提示词构建与回答解析
 *
 * 参考 ArgusRAG 的 prompts/qa/system.st、user.st、rag-context.st
 * 和 QaAnswerParser 的回退解析逻辑。
 *
 * System Prompt 要求大模型严格输出 JSON：
 *   { "answered": true, "answer": "...", "reasonCode": "...", "reasonMessage": "..." }
 */

import type {
  EvidenceDocument,
  KnowledgeAnswerOutput,
  RetrievedEvidenceBundle,
} from '../types';
import type { ChatMessage } from './llmClient';

/** 拒答原因编码：证据不足 */
export const INSUFFICIENT_EVIDENCE_CODE = 'INSUFFICIENT_EVIDENCE';
/** 拒答原因描述：证据不足 */
export const INSUFFICIENT_EVIDENCE_MESSAGE = '检索到的有效证据不足，暂不回答。';
/** 拒答原因编码：回答格式错误 */
export const ANSWER_FORMAT_ERROR_CODE = 'ANSWER_FORMAT_ERROR';
/** 拒答原因描述：回答格式错误 */
export const ANSWER_FORMAT_ERROR_MESSAGE = '模型返回格式错误，无法解析回答。';

/**
 * 构造 QA System Prompt。
 *
 * 要求大模型：
 *   1. 只能依据给定证据回答，不得补充外部知识或猜测
 *   2. 严格输出 JSON，不输出 Markdown 或额外说明
 *   3. 遵守证据等级约束
 */
export function buildSystemPrompt(): string {
  return [
    '你是群组知识问答助手，只能依据给定证据回答，不得补充外部知识或猜测。',
    '请严格输出 JSON，不要输出 Markdown 或任何额外说明。',
    '',
    'JSON 字段要求：',
    '{',
    '  "answered": true,',
    '  "answer": "回答正文",',
    '  "reasonCode": "拒答原因码",',
    '  "reasonMessage": "拒答原因说明"',
    '}',
    '',
    '规则：',
    '1. 能回答时 answered=true，answer 使用简体中文。',
    '2. 不能回答时 answered=false，answer 置空，并给出 reasonCode 和 reasonMessage。',
    '3. 不要输出 citationRefs 或其他未声明字段。',
    '4. 只能基于给定证据回答，不能补充证据中没有的信息。',
    '5. 如果用户提示中给出了 evidenceLevel 和回答策略，必须严格遵守该策略。',
    '6. 当证据有限或仅覆盖部分问题时，必须明确说明"依据有限"或"仅能回答证据覆盖部分"，不能伪装成确定结论。',
  ].join('\n');
}

/**
 * 构造流式 QA System Prompt（纯文本输出，不要求 JSON）。
 *
 * 流式场景下直接输出纯文本回答正文，由调用方在流结束后组装引用。
 */
export function buildStreamSystemPrompt(): string {
  return '你是群组知识问答助手，只能依据给定证据回答，不得补充外部知识或猜测。请直接输出纯文本回答正文，使用简体中文。不要输出 JSON、Markdown 等任何格式标记。';
}

/**
 * 构造 QA User Prompt，将问题、证据等级、证据指导和证据上下文填充到模板中。
 */
export function buildUserPrompt(question: string, bundle: RetrievedEvidenceBundle): string {
  const evidenceLevel = bundle.evidenceLevel;
  const evidenceGuidance = bundle.evidenceGuidance;
  const context = formatEvidenceContext(bundle.documents);

  return [
    '问题：',
    question,
    '',
    '证据等级：',
    evidenceLevel,
    '',
    '回答策略：',
    evidenceGuidance,
    '',
    '执行要求：',
    '1. 你只能依据已提供的检索证据回答，不能补充证据中没有的信息。',
    '2. 不允许臆测、不允许扩展常识、不允许把不确定内容说成确定结论。',
    `3. 你的输出必须满足当前证据等级约束：`,
    '   - NONE：必须拒答，不得给出事实性回答。',
    '   - WEAK：可以谨慎回答，但必须明确说明"依据有限"或"证据有限"，不能下确定结论。',
    '   - PARTIAL：只能回答证据明确支持的部分，未覆盖部分必须明确说明无法确认。',
    '   - SUFFICIENT：可以正常回答，但仍然不得超出证据范围。',
    '4. 如果问题包含多个子问题，只回答证据覆盖到的部分。',
    '5. 如果证据无法支持完整答案，优先保证准确，不要为了完整而编造。',
    '',
    '以下是可用证据。每条证据都有 evidenceId。',
    '你只能基于这些证据回答，不能超出证据范围进行臆测。',
    '',
    '---------------------',
    context,
    '---------------------',
  ].join('\n');
}

/**
 * 将证据文档列表格式化为上下文文本。
 *
 * 格式：
 *   [E1] 文件名：xxx
 *   <切片文本>
 *   [E2] 文件名：yyy
 *   <切片文本>
 */
export function formatEvidenceContext(documents: EvidenceDocument[]): string {
  if (!documents || documents.length === 0) return '(无证据)';
  return documents
    .map(doc => {
      const fileName = doc.metadata.fileName;
      const text = doc.text.replace(/^文件名：[^\n]*\n/, '');
      return `[${doc.evidenceId}] 文件名：${fileName}\n${text}`;
    })
    .join('\n\n');
}

/**
 * 解析大模型返回的 JSON 文本为结构化回答对象。
 *
 * 解析失败时返回 null（由调用方决定是否回退）。
 */
export function parseAnswer(rawAnswer: string): KnowledgeAnswerOutput | null {
  if (!rawAnswer) return null;
  const trimmed = rawAnswer.trim();
  try {
    const parsed = JSON.parse(trimmed) as Partial<KnowledgeAnswerOutput>;
    return {
      answered: !!parsed.answered,
      answer: typeof parsed.answer === 'string' ? parsed.answer : '',
      reasonCode: typeof parsed.reasonCode === 'string' ? parsed.reasonCode : null,
      reasonMessage: typeof parsed.reasonMessage === 'string' ? parsed.reasonMessage : null,
    };
  } catch {
    // 尝试从文本中提取 JSON 块（模型可能用 ```json 包裹）
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as Partial<KnowledgeAnswerOutput>;
        return {
          answered: !!parsed.answered,
          answer: typeof parsed.answer === 'string' ? parsed.answer : '',
          reasonCode: typeof parsed.reasonCode === 'string' ? parsed.reasonCode : null,
          reasonMessage: typeof parsed.reasonMessage === 'string' ? parsed.reasonMessage : null,
        };
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * 构造 QA 聊天消息列表（同步模式）。
 */
export function buildChatMessages(
  question: string,
  bundle: RetrievedEvidenceBundle
): ChatMessage[] {
  return [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildUserPrompt(question, bundle) },
  ];
}

/**
 * 构造 QA 流式聊天消息列表（流式模式，纯文本输出）。
 */
export function buildStreamChatMessages(
  question: string,
  bundle: RetrievedEvidenceBundle
): ChatMessage[] {
  return [
    { role: 'system', content: buildStreamSystemPrompt() },
    { role: 'user', content: buildUserPrompt(question, bundle) },
  ];
}
