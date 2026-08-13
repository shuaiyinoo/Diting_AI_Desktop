/**
 * 票据/文档 AI 结构化提取服务（独立模块）
 *
 * 两步 AI 流程（已优化为低延迟）：
 *   1. 文档分类：将 OCR 文本发送给 LLM，识别文档的大类/小类
 *   2. 结构化提取：根据分类结果的 example_json 作为格式参考，
 *      让 LLM 按对应类型返回结构化 JSON 数据
 *
 * 性能优化策略：
 *   - 分类步骤：精简类型列表（不含 description）、不传 OCR boxes、
 *     截断 OCR 文本至 800 字符、temperature=0.1、maxTokens=256
 *   - 提取步骤：仅传 OCR 文本（不传位置框）、截断至 3000 字符、
 *     temperature=0.1、使用 response_format=json_object
 *   - 两步均使用 JSON 强制输出，减少模型生成非 JSON 文本的概率
 *
 * 复用 llmdb 中已配置的启用模型 + llmClient 的 chat() 接口。
 */
import { logger } from 'ee-core/log';
import { chat } from '../rag/llm/llmClient';
import type { ChatMessage } from '../rag/llm/llmClient';
import { llmdbService } from '../../service/database/llmdb';
import { RECEIPT_TYPES, findReceiptType, getCategories } from './ReceiptTypes';
import type { ReceiptType } from './ReceiptTypes';

/** AI 提取结果 */
export interface AiExtractionResult {
  success: boolean;
  data?: AiExtractedData;
  error?: string;
}

/** AI 提取后的完整数据（含分类信息 + 结构化数据） */
export interface AiExtractedData {
  /** 大类编码 */
  category: string;
  /** 大类显示名 */
  category_display: string;
  /** 小类编码 */
  type_code: string;
  /** 小类显示名 */
  type_name: string;
  /** 分类置信度（0-1） */
  classify_confidence: number;
  /** 结构化提取结果（根据类型不同的 JSON 格式） */
  structured_data: Record<string, any>;
  /** 整体置信度（0-1） */
  confidence: number;
  /** 是否需要人工复核 */
  needs_review: boolean;
}

/** 文档分类结果 */
interface ClassifyResult {
  category: string;
  category_display: string;
  type_code: string;
  type_name: string;
  confidence: number;
}

// ═════════════════════════════════════════════════════════════
// 性能优化常量
// ═════════════════════════════════════════════════════════════

/** 分类步骤截断 OCR 文本的最大字符数 */
const CLASSIFY_TEXT_MAX_CHARS = 800;
/** 提取步骤截断 OCR 文本的最大字符数 */
const EXTRACT_TEXT_MAX_CHARS = 3000;
/** 分类步骤超时（毫秒） */
const CLASSIFY_TIMEOUT_MS = 20_000;
/** 提取步骤超时（毫秒） */
const EXTRACT_TIMEOUT_MS = 45_000;
/** 结构化提取温度——低温保证确定性输出 */
const EXTRACT_TEMPERATURE = 0.1;
/** 分类步骤温度 */
const CLASSIFY_TEMPERATURE = 0.1;
/** 分类步骤最大输出 token 数 */
const CLASSIFY_MAX_TOKENS = 256;

// ═════════════════════════════════════════════════════════════
// Prompt 构建（惰性生成 + 缓存）
// ═════════════════════════════════════════════════════════════

/** 缓存分类 System Prompt，避免每次调用都重新构建 */
let _classifySystemPrompt: string | null = null;

/**
 * 文档分类 System Prompt（精简版）
 *
 * 优化点：
 *   - 仅列出 type_code + type_name（不含 description），减少 token 消耗
 *   - 按大类分组，结构清晰
 *   - 要求输出极简 JSON（5 个字段），maxTokens=256 即可
 */
function getClassifySystemPrompt(): string {
  if (_classifySystemPrompt) return _classifySystemPrompt;

  const typeList = getCategories().map((cat) => {
    const types = RECEIPT_TYPES.filter((t) => t.category === cat.category);
    const codes = types.map((t) => `${t.type_code}:${t.type_name}`).join(', ');
    return `${cat.category}(${cat.category_display}): ${codes}`;
  }).join('\n');

  _classifySystemPrompt = `你是文档分类专家。根据OCR文本判断文档类型，只输出JSON。
候选类型：
${typeList}
输出格式：{"category":"大类编码","category_display":"大类显示名","type_code":"小类编码","type_name":"小类显示名","confidence":0.0到1.0}`;

  return _classifySystemPrompt;
}

/**
 * 结构化提取 System Prompt 模板（精简版）
 *
 * 优化点：
 *   - 去掉冗余规则说明，保留核心约束
 *   - 直接内嵌 example_json，让模型照着填
 */
function buildExtractSystemPrompt(receiptType: ReceiptType): string {
  return `你是文档结构化提取专家。将OCR文本提取为JSON，只输出JSON，不要解释。
文档类型：${receiptType.category_display}/${receiptType.type_name}
字段缺失填null，不要编造。数组字段根据实际内容提取多条。
参考格式：
${receiptType.example_json}`;
}

class InvoiceAiService {
  /**
   * 两步 AI 提取：分类 → 结构化提取
   */
  async extract(ocrText: string, ocrBoxes: any[]): Promise<AiExtractionResult> {
    try {
      // 获取当前启用的 LLM 模型
      const model = llmdbService.getEnabledModel();
      if (!model) {
        return { success: false, error: '未配置启用的 LLM 模型，请先在设置中配置模型' };
      }

      // ===== Step 1: 文档分类 =====
      logger.info('[InvoiceAiService] Step 1: 文档分类...');
      const classifyResult = await this.classifyDocument(model, ocrText);
      if (!classifyResult) {
        return { success: false, error: '文档分类失败：无法确定文档类型' };
      }
      logger.info(`[InvoiceAiService] 分类结果: ${classifyResult.category_display} / ${classifyResult.type_name} (置信度: ${classifyResult.confidence})`);

      // 查找类型定义，获取 example_json
      const receiptType = findReceiptType(classifyResult.type_code);
      if (!receiptType) {
        return { success: false, error: `未知的文档类型: ${classifyResult.type_code}` };
      }

      // ===== Step 2: 按类型结构化提取 =====
      logger.info(`[InvoiceAiService] Step 2: 按类型「${receiptType.type_name}」结构化提取...`);
      const structuredData = await this.extractByType(model, receiptType, ocrText);
      if (!structuredData) {
        return { success: false, error: '结构化提取失败：AI 返回内容无法解析为 JSON' };
      }

      // 计算整体置信度和是否需要复核
      const confidence = classifyResult.confidence;
      const needs_review = confidence < 0.7;

      const result: AiExtractedData = {
        category: classifyResult.category,
        category_display: classifyResult.category_display,
        type_code: classifyResult.type_code,
        type_name: classifyResult.type_name,
        classify_confidence: classifyResult.confidence,
        structured_data: structuredData,
        confidence,
        needs_review,
      };

      logger.info('[InvoiceAiService] AI 提取完成');
      return { success: true, data: result };
    } catch (err) {
      logger.error('[InvoiceAiService] AI 提取失败:', err?.message || err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  /**
   * Step 1: 文档分类
   *
   * 优化点：
   *   - 不传 OCR boxes，仅用截断后的 OCR 文本
   *   - temperature=0.1, maxTokens=256, timeout=20s
   *   - 使用 response_format=json_object 强制 JSON 输出
   */
  private async classifyDocument(
    model: any,
    ocrText: string,
  ): Promise<ClassifyResult | null> {
    const truncatedText = truncateText(ocrText, CLASSIFY_TEXT_MAX_CHARS);
    const userPrompt = `判断文档类型。\nOCR文本：\n${truncatedText || '(无文本)'}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: getClassifySystemPrompt() },
      { role: 'user', content: userPrompt },
    ];

    const result = await chat(model, messages, {
      timeoutMs: CLASSIFY_TIMEOUT_MS,
      temperature: CLASSIFY_TEMPERATURE,
      maxTokens: CLASSIFY_MAX_TOKENS,
      responseFormat: { type: 'json_object' },
    });
    const data = this.parseJsonResult(result.content);
    if (!data || !data.type_code) {
      return null;
    }

    // 验证 type_code 是否在已知类型中
    const receiptType = findReceiptType(data.type_code);
    if (!receiptType) {
      logger.warn(`[InvoiceAiService] LLM 返回未知 type_code: ${data.type_code}，尝试回退到 general_basic`);
      return {
        category: 'general',
        category_display: '通用识别',
        type_code: 'general_basic',
        type_name: '通用文字识别',
        confidence: 0.3,
      };
    }

    return {
      category: receiptType.category,
      category_display: receiptType.category_display,
      type_code: receiptType.type_code,
      type_name: receiptType.type_name,
      confidence: typeof data.confidence === 'number' ? data.confidence : 0.5,
    };
  }

  /**
   * Step 2: 按类型结构化提取
   *
   * 优化点：
   *   - 不传 OCR boxes（位置信息对提取无用），仅用截断后的 OCR 文本
   *   - temperature=0.1, timeout=45s
   *   - 使用 response_format=json_object 强制 JSON 输出
   */
  private async extractByType(
    model: any,
    receiptType: ReceiptType,
    ocrText: string,
  ): Promise<Record<string, any> | null> {
    const truncatedText = truncateText(ocrText, EXTRACT_TEXT_MAX_CHARS);
    const systemPrompt = buildExtractSystemPrompt(receiptType);
    const userPrompt = `提取结构化数据。\nOCR文本：\n${truncatedText || '(无文本)'}`;

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const result = await chat(model, messages, {
      timeoutMs: EXTRACT_TIMEOUT_MS,
      temperature: EXTRACT_TEMPERATURE,
      responseFormat: { type: 'json_object' },
    });
    return this.parseJsonResult(result.content);
  }

  /**
   * 解析 LLM 返回的 JSON 结果
   * 处理可能被 ```json 包裹的情况
   */
  private parseJsonResult(content: string): any | null {
    if (!content) return null;
    const trimmed = content.trim();

    // 直接解析
    try {
      return JSON.parse(trimmed);
    } catch {
      // 尝试提取 JSON 块
      const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }
}

// ═════════════════════════════════════════════════════════════
// 辅助函数
// ═════════════════════════════════════════════════════════════

/**
 * 截断文本到最大字符数，末尾添加省略标记
 */
function truncateText(text: string, maxChars: number): string {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + '\n...(已截断)';
}

export const invoiceAiService = new InvoiceAiService();
export default InvoiceAiService;
