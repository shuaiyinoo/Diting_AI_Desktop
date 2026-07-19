/**
 * LLM 调用费用计算器
 *
 * 参考 ArgusRAG 的 LlmCostCalculatorImpl。
 * 根据模型名称和 token 数量计算费用（人民币）。
 *
 * 费率配置：每千 token 的费用（元）
 *   key: modelName, value: [inputPricePerKToken, outputPricePerKToken]
 */

// 每千 token 默认费率
const DEFAULT_INPUT_PRICE = 0.0008;
const DEFAULT_OUTPUT_PRICE = 0.002;

/** 模型费率表：[输入每千token单价, 输出每千token单价]（元） */
const MODEL_PRICING: Record<string, [number, number]> = {
  // 通义千问
  'qwen-plus': [0.0008, 0.002],
  'qwen-turbo': [0.0003, 0.0006],
  'qwen-max': [0.002, 0.006],
  // DeepSeek
  'deepseek-chat': [0.001, 0.002],
  'deepseek-reasoner': [0.004, 0.016],
  // OpenAI
  'gpt-4o': [0.0175, 0.07],
  'gpt-4o-mini': [0.0011, 0.0042],
  'gpt-3.5-turbo': [0.0015, 0.002],
  // Claude
  'claude-3-5-sonnet-20241022': [0.021, 0.105],
  'claude-3-5-haiku-20241022': [0.0008, 0.004],
};

/**
 * 计算一次 LLM 调用的费用（元）。
 *
 * @param modelName        模型名称
 * @param promptTokens     输入 token 数
 * @param completionTokens 输出 token 数
 * @returns 费用金额（元），保留 6 位小数
 */
export function calculateCost(
  modelName: string,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = MODEL_PRICING[modelName] ?? [DEFAULT_INPUT_PRICE, DEFAULT_OUTPUT_PRICE];
  const inputCost = (pricing[0] * promptTokens) / 1000;
  const outputCost = (pricing[1] * completionTokens) / 1000;
  return Math.round((inputCost + outputCost) * 1e6) / 1e6;
}
