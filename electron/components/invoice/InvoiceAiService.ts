/**
 * 票据 AI 结构化提取服务（独立模块）
 *
 * 将 OCR 识别结果发送给 LLM，提取为结构化 JSON 数据。
 * 复用 llmdb 中已配置的启用模型 + llmClient 的 chat() 接口。
 */
import { logger } from 'ee-core/log';
import { chat } from '../rag/llm/llmClient';
import type { ChatMessage } from '../rag/llm/llmClient';
import { llmdbService } from '../../service/database/llmdb';

/** AI 提取结果 */
export interface AiExtractionResult {
  success: boolean;
  data?: any;
  error?: string;
}

/** System Prompt：票据结构化提取专家 */
const SYSTEM_PROMPT = `你是一个票据结构化提取专家。你的任务是将 OCR 识别出的票据原始文本，提取为符合以下 JSON Schema 的结构化数据。

## 输出规则
1. 只输出 JSON，不要输出任何解释、markdown 标记或额外文字
2. 所有字段名使用英文 key，值使用中文
3. 金额字段统一为数字类型（去掉 ¥ 和逗号），保留两位小数
4. 日期统一为 YYYY-MM-DD 格式
5. 税率统一为小数格式（13% → 0.13）
6. 如果某个字段在票面上无法识别，填 null，不要编造
7. confidence 字段：对该字段识别可信度的自评（0-1），低于 0.7 的字段标记 needs_review: true

## 金额勾稽校验规则
- 价税合计 = 不含税金额 + 税额
- 每行明细：金额 = 数量 × 单价
- 如果勾稽不平，在 verification 字段中标记 mismatch 并说明差异

## 输出 JSON Schema
{
  "invoice_type": "string",
  "invoice_type_code": "string",
  "basic_info": {
    "invoice_code": "string|null",
    "invoice_number": "string|null",
    "issue_date": "string|null",
    "check_code": "string|null",
    "machine_number": "string|null"
  },
  "buyer": {
    "name": "string|null",
    "tax_id": "string|null",
    "address_phone": "string|null",
    "bank_account": "string|null"
  },
  "seller": {
    "name": "string|null",
    "tax_id": "string|null",
    "address_phone": "string|null",
    "bank_account": "string|null"
  },
  "amount": {
    "total_excluding_tax": "number|null",
    "total_tax": "number|null",
    "total_including_tax": "number|null",
    "total_in_words": "string|null"
  },
  "line_items": [
    {
      "name": "string",
      "specification": "string|null",
      "unit": "string|null",
      "quantity": "number|null",
      "unit_price": "number|null",
      "amount": "number|null",
      "tax_rate": "number|null",
      "tax_amount": "number|null"
    }
  ],
  "other": {
    "payee": "string|null",
    "reviewer": "string|null",
    "issuer": "string|null",
    "remark": "string|null",
    "has_seal": "boolean|null"
  },
  "verification": {
    "amount_check": "pass|fail",
    "line_items_check": "pass|fail",
    "mismatch_detail": "string|null"
  },
  "confidence": {
    "overall": "number",
    "low_confidence_fields": ["string"]
  },
  "needs_review": "boolean"
}`;

class InvoiceAiService {
  /**
   * 将 OCR 识别结果发送给 LLM，提取结构化 JSON
   */
  async extract(ocrText: string, ocrBoxes: any[]): Promise<AiExtractionResult> {
    try {
      // 获取当前启用的 LLM 模型
      const model = llmdbService.getEnabledModel();
      if (!model) {
        return { success: false, error: '未配置启用的 LLM 模型，请先在设置中配置模型' };
      }

      // 构建 User Prompt
      const userPrompt = this.buildUserPrompt(ocrText, ocrBoxes);

      // 调用 LLM
      const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ];

      logger.info('[InvoiceAiService] 开始 AI 结构化提取...');
      const result = await chat(model, messages, { timeoutMs: 60_000 });

      // 解析 JSON 结果
      const data = this.parseJsonResult(result.content);
      if (!data) {
        return { success: false, error: 'AI 返回内容无法解析为 JSON' };
      }

      logger.info('[InvoiceAiService] AI 结构化提取成功');
      return { success: true, data };

    } catch (err) {
      logger.error('[InvoiceAiService] AI 提取失败:', err?.message || err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  /**
   * 构建 User Prompt
   */
  private buildUserPrompt(ocrText: string, ocrBoxes: any[]): string {
    const lines: string[] = [
      '请提取以下票据的结构化信息。',
      '',
      '## 票据类型提示',
      '未知，请自动判断',
      '',
      '## OCR 原始文本',
      ocrText || '(无文本)',
      '',
      '## OCR 结构化数据',
    ];

    if (ocrBoxes && ocrBoxes.length > 0) {
      const boxesInfo = ocrBoxes.map((b, i) =>
        `  ${i + 1}. "${b.text}" (置信度: ${(b.confidence * 100).toFixed(0)}%, 位置: x=${b.box.x}, y=${b.box.y}, w=${b.box.width}, h=${b.box.height})`
      );
      lines.push(boxesInfo.join('\n'));
    } else {
      lines.push('(无结构化数据)');
    }

    return lines.join('\n');
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

export const invoiceAiService = new InvoiceAiService();
export default InvoiceAiService;
