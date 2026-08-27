/**
 * AI 供应商 / 模型 Logo 解析工具
 *
 * 使用正则匹配模型 ID 来确定对应的 Logo。
 * Logo 通过静态 import 打包，确保 Vite 正确处理资源。
 *
 * 匹配规则（三层回退）：
 * 1. 模型 ID 正则匹配（最具体，如 gpt-4o → OpenAI logo）
 * 2. 供应商类型回退（如 deepseek → DeepSeek logo）
 * 3. Base URL 域名识别（仅用于泛化类型 custom/openai 兼容端点）
 * 4. 默认图标
 *
 * 移植自 Proma 的 model-logo.ts。
 */

// ===== 模型图标导入 =====

import DefaultLogo from '@/assets/models/default.png'

// Claude / Anthropic
import ClaudeLogo from '@/assets/models/claude.png'

// OpenAI / GPT 系列
import OpenAILogo from '@/assets/models/openai.png'
import GPT4Logo from '@/assets/models/gpt_4.png'
import GPT35Logo from '@/assets/models/gpt_3.5.png'
import GPTo1Logo from '@/assets/models/gpt_o1.png'
import GPTImageLogo from '@/assets/models/gpt_image_1.png'
import GPT5Logo from '@/assets/models/gpt-5.png'
import GPT5ChatLogo from '@/assets/models/gpt-5-chat.png'
import GPT5MiniLogo from '@/assets/models/gpt-5-mini.png'
import GPT5NanoLogo from '@/assets/models/gpt-5-nano.png'
import GPT5CodexLogo from '@/assets/models/gpt-5-codex.png'
import GPT51Logo from '@/assets/models/gpt-5.1.png'
import GPT51ChatLogo from '@/assets/models/gpt-5.1-chat.png'
import GPT51CodexLogo from '@/assets/models/gpt-5.1-codex.png'
import GPT51CodexMiniLogo from '@/assets/models/gpt-5.1-codex-mini.png'

// DeepSeek
import DeepSeekLogo from '@/assets/models/deepseek.png'

// Google / Gemini
import GeminiLogo from '@/assets/models/gemini.png'
import GemmaLogo from '@/assets/models/gemma.png'

// 自定义 Gemini 衍生模型
import DeepGeminiLogo from '@/assets/models/deepgemini.png'
import KimiGeminiLogo from '@/assets/models/kimigemini.png'
import QwenGeminiLogo from '@/assets/models/qwengemini.png'
import SeedGeminiLogo from '@/assets/models/seedgemini.png'

// Qwen / 通义
import QwenLogo from '@/assets/models/qwen.png'

// Grok / xAI
import GrokLogo from '@/assets/models/grok.png'

// Kimi / Moonshot
import KimiLogo from '@/assets/models/moonshot.png'

// Volcengine / 火山引擎
import VolcengineLogo from '@/assets/models/doubao.png'

// Zhipu / 智谱
import ZhipuLogo from '@/assets/models/zhipu.png'

// Meta / Llama
import LlamaLogo from '@/assets/models/llama.png'

// Mistral
import MistralLogo from '@/assets/models/mixtral.png'
import CodestralLogo from '@/assets/models/codestral.png'

// Yi / 零一万物
import YiLogo from '@/assets/models/yi.png'

// 百度文心 / ERNIE
import WenxinLogo from '@/assets/models/wenxin.png'

// 腾讯混元
import HunyuanLogo from '@/assets/models/hunyuan.png'

// 讯飞星火
import SparkDeskLogo from '@/assets/models/sparkdesk.png'

// Step / 阶跃星辰
import StepLogo from '@/assets/models/step.png'

// MiniMax
import MiniMaxLogo from '@/assets/models/minimax.png'

// Xiaomi / MiMo
import XiaomiLogo from '@/assets/models/xiaomi.png'

// Cohere
import CohereLogo from '@/assets/models/cohere.png'

// Embedding 通用
import EmbeddingLogo from '@/assets/models/embedding.png'

// Proma 自有
import PromaLogo from '@/assets/models/proma.png'

// ===== 模型 Logo 映射表 =====
//
// key 为正则表达式模式（忽略大小写匹配），
// value 为对应的 Logo 资源路径。
// 匹配顺序即为优先级，更具体的规则排前面。

const MODEL_LOGO_MAP = [
  // === GPT 系列（具体型号优先） ===
  ['gpt-image', GPTImageLogo],
  ['gpt-3\\.5', GPT35Logo],
  ['gpt-4', GPT4Logo],
  ['o1', GPTo1Logo],
  ['o3', GPTo1Logo],
  ['o4', GPTo1Logo],
  ['gpt-5-mini', GPT5MiniLogo],
  ['gpt-5-nano', GPT5NanoLogo],
  ['gpt-5-chat', GPT5ChatLogo],
  ['gpt-5-codex', GPT5CodexLogo],
  ['gpt-5\\.1-codex-mini', GPT51CodexMiniLogo],
  ['gpt-5\\.1-codex', GPT51CodexLogo],
  ['gpt-5\\.1-chat', GPT51ChatLogo],
  ['gpt-5\\.1', GPT51Logo],
  ['gpt-5', GPT5Logo],
  ['gpt', OpenAILogo],

  // === Claude / Anthropic ===
  ['(claude|anthropic-)', ClaudeLogo],

  // === DeepSeek ===
  ['deepseek', DeepSeekLogo],

  // === 自定义 Gemini 衍生模型（必须在通用 gemini 规则之前） ===
  ['deepgemini', DeepGeminiLogo],
  ['kimigemini', KimiGeminiLogo],
  ['qwengemini', QwenGeminiLogo],
  ['seedgemini', SeedGeminiLogo],

  // === Google / Gemini ===
  ['veo', GeminiLogo],
  ['gemma', GemmaLogo],
  ['gemini', GeminiLogo],

  // === Qwen / 通义千问 ===
  ['(qwen|qwq|qvq|wan-)', QwenLogo],

  // === Grok / xAI ===
  ['grok', GrokLogo],

  // === Kimi / Moonshot ===
  ['(kimi|moonshot)', KimiLogo],

  // === Volcengine / 火山引擎 ===
  ['doubao', VolcengineLogo],
  ['ep-202', VolcengineLogo],
  ['seed', VolcengineLogo],

  // === Zhipu / 智谱 ===
  ['zhipu', ZhipuLogo],
  ['cogview', ZhipuLogo],
  ['(glm|chatglm)', ZhipuLogo],

  // === Meta / Llama ===
  ['llama', LlamaLogo],

  // === Mistral ===
  ['codestral', CodestralLogo],
  ['mixtral', MistralLogo],
  ['mistral', MistralLogo],
  ['ministral', MistralLogo],
  ['magistral', MistralLogo],

  // === Yi / 零一万物 ===
  ['yi-', YiLogo],
  ['yi$', YiLogo],

  // === 百度文心 / ERNIE ===
  ['ernie-', WenxinLogo],
  ['tao-', WenxinLogo],

  // === 腾讯混元 ===
  ['hunyuan', HunyuanLogo],

  // === 讯飞星火 ===
  ['sparkdesk', SparkDeskLogo],
  ['generalv', SparkDeskLogo],

  // === Step / 阶跃星辰 ===
  ['step', StepLogo],

  // === MiniMax ===
  ['minimax', MiniMaxLogo],
  ['abab', MiniMaxLogo],

  // === Xiaomi / MiMo ===
  ['mimo', XiaomiLogo],

  // === Cohere ===
  ['cohere', CohereLogo],
  ['command', CohereLogo],

  // === Embedding 通用 ===
  ['text-embedding', EmbeddingLogo],
  ['embedding', EmbeddingLogo],
]

// ===== 供应商类型 → Logo 映射 =====

const PROVIDER_LOGO_MAP = {
  openai: OpenAILogo,
  'openai-responses': OpenAILogo,
  deepseek: DeepSeekLogo,
  anthropic: ClaudeLogo,
  'anthropic-compatible': DefaultLogo,
  google: GeminiLogo,
  kimi: KimiLogo,
  zhipu: ZhipuLogo,
  doubao: VolcengineLogo,
  volc: VolcengineLogo,
  qwen: QwenLogo,
  minimax: MiniMaxLogo,
  xiaomi: XiaomiLogo,
  yi: YiLogo,
  step: StepLogo,
  hunyuan: HunyuanLogo,
  ernie: WenxinLogo,
  sparkdesk: SparkDeskLogo,
  grok: GrokLogo,
  mistral: MistralLogo,
  llama: LlamaLogo,
  cohere: CohereLogo,
  siliconflow: DefaultLogo,
  custom: DefaultLogo,
}

// ===== Base URL 域名 → Logo 映射 =====
//
// 仅用于泛化类型（custom / anthropic-compatible / openai），
// 这些类型无法从类型本身判断真实品牌，需要按 Base URL 域名识别。

const URL_LOGO_MAP = [
  [/proma\.cool/i, PromaLogo],
  [/moonshot\.cn|kimi/i, KimiLogo],
  [/bigmodel\.cn|zhipuai/i, ZhipuLogo],
  [/minimax/i, MiniMaxLogo],
  [/xiaomimimo|mimo/i, XiaomiLogo],
  [/volces\.com|volcengine/i, VolcengineLogo],
  [/dashscope|aliyuncs/i, QwenLogo],
  [/deepseek/i, DeepSeekLogo],
  [/openai\.com/i, OpenAILogo],
  [/googleapis|generativelanguage/i, GeminiLogo],
  [/grok|x\.ai/i, GrokLogo],
  [/stepfun/i, StepLogo],
  [/cohere/i, CohereLogo],
  [/spark-api|xfyun/i, SparkDeskLogo],
  [/hunyuan/i, HunyuanLogo],
  [/ernie|baidu/i, WenxinLogo],
  [/yi\.com|lingyiwanwu/i, YiLogo],
  [/mistral/i, MistralLogo],
  [/together\.xyz/i, LlamaLogo],
  [/siliconflow/i, DefaultLogo],
]

/** provider 类型本身无法判断真实品牌、需按 URL 识别的「泛化」类型 */
const GENERIC_PROVIDERS = new Set([
  'custom',
  'anthropic-compatible',
  'openai',
])

// ===== 公共 API =====

/**
 * 根据模型 ID 获取对应的 Logo
 *
 * 使用正则匹配，按优先级顺序遍历 MODEL_LOGO_MAP。
 * 未匹配到返回 undefined。
 *
 * @param {string} modelId 模型 ID（如 "gpt-4o"、"deepseek-chat"）
 * @returns {string|undefined}
 */
export function getModelLogoById(modelId) {
  if (!modelId) return undefined

  for (const [key, logo] of MODEL_LOGO_MAP) {
    const regex = new RegExp(key, 'i')
    if (regex.test(modelId)) {
      return logo
    }
  }

  return undefined
}

/**
 * 根据模型 ID + 供应商获取 Logo（带回退）
 *
 * 优先使用模型 ID 正则匹配，未匹配到则回退到供应商 Logo，
 * 最终回退到默认图标。
 *
 * @param {string} modelId 模型 ID
 * @param {string} [provider] 供应商类型（可选）
 * @returns {string}
 */
export function getModelLogo(modelId, provider) {
  return getModelLogoById(modelId)
    ?? (provider ? PROVIDER_LOGO_MAP[provider] : undefined)
    ?? DefaultLogo
}

/**
 * 根据供应商类型获取 Logo
 *
 * @param {string} provider 供应商类型
 * @returns {string}
 */
export function getProviderLogo(provider) {
  return PROVIDER_LOGO_MAP[provider] ?? DefaultLogo
}

/**
 * 获取渠道的 Logo
 *
 * 识别策略：
 * 1. 明确品牌的 provider 类型 → 直接信任 provider Logo
 * 2. 泛化类型 → 先按 Base URL 域名识别真实品牌，识别不到再回退到默认
 *
 * @param {{ provider: string, baseUrl: string }} channel
 * @returns {string}
 */
export function getChannelLogo(channel) {
  if (GENERIC_PROVIDERS.has(channel.provider) && channel.baseUrl) {
    for (const [regex, logo] of URL_LOGO_MAP) {
      if (regex.test(channel.baseUrl)) {
        return logo
      }
    }
  }
  return getProviderLogo(channel.provider)
}

export { DefaultLogo as LOGO_DEFAULT }
