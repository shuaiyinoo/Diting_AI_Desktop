/**
 * AI 供应商预设信息
 *
 * 内置主流 AI 供应商的类型、显示名称、默认 Base URL、协议类型和预设模型列表。
 * 移植自 Proma 的 ProviderType / PROVIDER_DEFAULT_URLS / PROVIDER_LABELS 体系，
 * 针对 Diting 的 RAG 语义模型场景做了精简（去掉 OAuth 订阅渠道等不适用类型）。
 *
 * 数据为纯前端常量，不持久化；用户在弹窗中选择供应商类型后自动填充 Base URL 和预设模型。
 */

/**
 * 供应商协议类型
 * - openai: OpenAI Chat Completions 兼容协议（/v1/chat/completions）
 * - anthropic: Anthropic Messages 协议（/v1/messages）
 * - google: Google Generative AI 协议
 */

/**
 * 支持的 AI 供应商类型
 *
 * 值与后端 LlmProvider 类型保持兼容（后端目前只区分 openai/anthropic/google/custom），
 * 前端在此基础上细化出各品牌子类型，提交时映射回后端支持的四种类型。
 */

/**
 * 各供应商的预设配置
 *
 * 按 label 拼音 / 英文字母排序。
 */
export const PROVIDER_PRESETS = [
  {
    type: 'anthropic',
    label: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com',
    protocol: 'anthropic',
    description: 'Claude 系列模型官方 API',
    models: [
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
      { id: 'claude-haiku-4-20250506', name: 'Claude Haiku 4' },
    ],
  },
  {
    type: 'anthropic-compatible',
    label: 'Anthropic 兼容格式',
    baseUrl: '',
    protocol: 'anthropic',
    description: '使用 Anthropic 协议的第三方端点',
    models: [],
  },
  {
    type: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    protocol: 'openai',
    description: 'DeepSeek 官方 API，OpenAI 兼容格式',
    models: [
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
      { id: 'deepseek-chat', name: 'DeepSeek Chat (V3)' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)' },
    ],
  },
  {
    type: 'doubao',
    label: '火山引擎豆包',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    protocol: 'openai',
    description: '字节跳动火山方舟平台',
    models: [
      { id: 'doubao-pro-32k', name: 'Doubao Pro 32k' },
      { id: 'doubao-pro-128k', name: 'Doubao Pro 128k' },
      { id: 'doubao-lite-32k', name: 'Doubao Lite 32k' },
    ],
  },
  {
    type: 'ernie',
    label: '百度文心一言',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    protocol: 'openai',
    description: '百度千帆平台，ERNIE 系列',
    models: [
      { id: 'ernie-4.0-turbo-8k', name: 'ERNIE 4.0 Turbo' },
      { id: 'ernie-3.5-8k', name: 'ERNIE 3.5' },
    ],
  },
  {
    type: 'google',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    protocol: 'google',
    description: 'Google AI Studio',
    models: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
      { id: 'gemini-2.5-pro-preview-05-06', name: 'Gemini 2.5 Pro' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
    ],
  },
  {
    type: 'grok',
    label: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1',
    protocol: 'openai',
    description: 'xAI 官方 API',
    models: [
      { id: 'grok-3', name: 'Grok 3' },
      { id: 'grok-3-mini', name: 'Grok 3 Mini' },
      { id: 'grok-2', name: 'Grok 2' },
    ],
  },
  {
    type: 'hunyuan',
    label: '腾讯混元',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    protocol: 'openai',
    description: '腾讯云混元大模型',
    models: [
      { id: 'hunyuan-pro', name: 'Hunyuan Pro' },
      { id: 'hunyuan-standard', name: 'Hunyuan Standard' },
      { id: 'hunyuan-lite', name: 'Hunyuan Lite' },
    ],
  },
  {
    type: 'kimi',
    label: 'Kimi (Moonshot)',
    baseUrl: 'https://api.moonshot.cn/v1',
    protocol: 'openai',
    description: '月之暗面 Kimi 官方 API',
    models: [
      { id: 'moonshot-v1-8k', name: 'Moonshot v1 8k' },
      { id: 'moonshot-v1-32k', name: 'Moonshot v1 32k' },
      { id: 'moonshot-v1-128k', name: 'Moonshot v1 128k' },
      { id: 'kimi-k2-0905-preview', name: 'Kimi K2' },
    ],
  },
  {
    type: 'minimax',
    label: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    protocol: 'openai',
    description: 'MiniMax 官方 API',
    models: [
      { id: 'MiniMax-Text-01', name: 'MiniMax Text 01' },
      { id: 'abab6.5s-chat', name: 'ABAB 6.5s Chat' },
    ],
  },
  {
    type: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    protocol: 'openai',
    description: 'OpenAI 官方 API',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
      { id: 'o1', name: 'o1' },
      { id: 'o3-mini', name: 'o3-mini' },
    ],
  },
  {
    type: 'openai-responses',
    label: 'OpenAI Responses 格式',
    baseUrl: 'https://api.openai.com/v1',
    protocol: 'openai',
    description: '使用 OpenAI Responses API 格式',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
    ],
  },
  {
    type: 'qwen',
    label: '通义千问 (阿里云)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    protocol: 'openai',
    description: '阿里云百炼平台，OpenAI 兼容格式',
    models: [
      { id: 'qwen-plus', name: 'Qwen Plus' },
      { id: 'qwen-turbo', name: 'Qwen Turbo' },
      { id: 'qwen-max', name: 'Qwen Max' },
      { id: 'qwen-long', name: 'Qwen Long' },
    ],
  },
  {
    type: 'siliconflow',
    label: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    protocol: 'openai',
    description: 'SiliconFlow 云平台，聚合多品牌模型',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3' },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1' },
      { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B' },
    ],
  },
  {
    type: 'sparkdesk',
    label: '讯飞星火',
    baseUrl: 'https://spark-api-open.xf-yun.com/v1',
    protocol: 'openai',
    description: '科大讯飞星火大模型',
    models: [
      { id: 'generalv3.5', name: 'Spark 3.5' },
      { id: 'generalv3', name: 'Spark 3.0' },
      { id: 'generalv2', name: 'Spark 2.0' },
    ],
  },
  {
    type: 'step',
    label: '阶跃星辰',
    baseUrl: 'https://api.stepfun.com/v1',
    protocol: 'openai',
    description: 'StepFun 官方 API',
    models: [
      { id: 'step-2-16k', name: 'Step 2 16k' },
      { id: 'step-1-8k', name: 'Step 1 8k' },
      { id: 'step-1v-8k', name: 'Step 1V 8k' },
    ],
  },
  {
    type: 'xiaomi',
    label: '小米 MiMo',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    protocol: 'openai',
    description: '小米 MiMo 官方 API',
    models: [
      { id: 'mimo-pro', name: 'MiMo Pro' },
      { id: 'mimo-7b', name: 'MiMo 7B' },
    ],
  },
  {
    type: 'yi',
    label: '零一万物',
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    protocol: 'openai',
    description: '零一万物 Yi 系列',
    models: [
      { id: 'yi-large', name: 'Yi Large' },
      { id: 'yi-medium', name: 'Yi Medium' },
      { id: 'yi-lightning', name: 'Yi Lightning' },
    ],
  },
  {
    type: 'zhipu',
    label: '智谱 AI (GLM)',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    protocol: 'openai',
    description: '智谱 AI 开放平台',
    models: [
      { id: 'glm-4-plus', name: 'GLM-4-Plus' },
      { id: 'glm-4', name: 'GLM-4' },
      { id: 'glm-4-flash', name: 'GLM-4-Flash' },
      { id: 'glm-4-air', name: 'GLM-4-Air' },
    ],
  },
  {
    type: 'mistral',
    label: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    protocol: 'openai',
    description: 'Mistral 官方 API',
    models: [
      { id: 'mistral-large-latest', name: 'Mistral Large' },
      { id: 'mistral-small-latest', name: 'Mistral Small' },
      { id: 'codestral-latest', name: 'Codestral' },
    ],
  },
  {
    type: 'llama',
    label: 'Meta Llama（Together AI）',
    baseUrl: 'https://api.together.xyz/v1',
    protocol: 'openai',
    description: '通过 Together AI 使用 Llama 系列',
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B' },
      { id: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo', name: 'Llama 3.1 405B' },
    ],
  },
  {
    type: 'cohere',
    label: 'Cohere',
    baseUrl: 'https://api.cohere.ai/v1',
    protocol: 'openai',
    description: 'Cohere Command 系列',
    models: [
      { id: 'command-r-plus', name: 'Command R+' },
      { id: 'command-r', name: 'Command R' },
    ],
  },
  {
    type: 'custom',
    label: '自定义 (OpenAI 兼容)',
    baseUrl: '',
    protocol: 'openai',
    description: '任意 OpenAI Chat Completions 兼容端点',
    models: [],
  },
]

/**
 * ProviderType → ProviderProtocol 映射
 */
const PROVIDER_PROTOCOL_MAP = Object.fromEntries(
  PROVIDER_PRESETS.map((p) => [p.type, p.protocol]),
)

/**
 * ProviderType → 显示名称映射
 */
export const PROVIDER_LABELS = Object.fromEntries(
  PROVIDER_PRESETS.map((p) => [p.type, p.label]),
)

/**
 * ProviderType → 默认 Base URL 映射
 */
export const PROVIDER_DEFAULT_URLS = Object.fromEntries(
  PROVIDER_PRESETS.map((p) => [p.type, p.baseUrl]),
)

/**
 * ProviderType → 预设模型列表映射
 */
export const PROVIDER_PRESET_MODELS = Object.fromEntries(
  PROVIDER_PRESETS.map((p) => [p.type, p.models]),
)

/**
 * 获取供应商预设配置
 */
export function getProviderPreset(type) {
  return PROVIDER_PRESETS.find((p) => p.type === type)
}

/**
 * 获取供应商的通信协议
 */
export function getProviderProtocol(type) {
  return PROVIDER_PROTOCOL_MAP[type] ?? 'openai'
}

/**
 * 前端 ProviderType → 后端 LlmProvider 映射
 *
 * 后端数据库只支持 openai / anthropic / google / custom 四种类型。
 * 前端的细粒度供应商类型提交时映射回这四种。
 */
export function mapProviderToBackend(type) {
  const protocol = getProviderProtocol(type)
  switch (protocol) {
    case 'openai':
      return 'openai'
    case 'anthropic':
      return 'anthropic'
    case 'google':
      return 'google'
    default:
      return 'custom'
  }
}

/**
 * 后端 LlmProvider → 前端 ProviderType 回退映射
 *
 * 从数据库读取的记录只有四种粗粒度类型，尝试按 base_url 识别细粒度品牌。
 */
export function inferProviderType(backendProvider, baseUrl) {
  // 先检查是否已经是细粒度类型
  if (PROVIDER_PRESETS.some((p) => p.type === backendProvider)) {
    return backendProvider
  }

  // 火山引擎语音识别（provider='volc'，非 LLM 的 doubao 类型）
  if (backendProvider === 'volc') {
    return 'volc'
  }

  // 按 base_url 域名识别
  const url = (baseUrl || '').toLowerCase()
  if (url.includes('deepseek')) return 'deepseek'
  if (url.includes('moonshot') || url.includes('kimi')) return 'kimi'
  if (url.includes('bigmodel') || url.includes('zhipuai')) return 'zhipu'
  if (url.includes('volces') || url.includes('volcengine')) return 'doubao'
  if (url.includes('dashscope') || url.includes('aliyuncs')) return 'qwen'
  if (url.includes('minimax')) return 'minimax'
  if (url.includes('xiaomimimo') || url.includes('mimo')) return 'xiaomi'
  if (url.includes('openai.com')) return 'openai'
  if (url.includes('anthropic.com')) return 'anthropic'
  if (url.includes('googleapis') || url.includes('generativelanguage')) return 'google'
  if (url.includes('x.ai') || url.includes('grok')) return 'grok'
  if (url.includes('siliconflow')) return 'siliconflow'
  if (url.includes('lingyiwanwu') || url.includes('yi.com')) return 'yi'
  if (url.includes('stepfun')) return 'step'
  if (url.includes('hunyuan')) return 'hunyuan'
  if (url.includes('ernie') || url.includes('baidu')) return 'ernie'
  if (url.includes('spark-api') || url.includes('xfyun')) return 'sparkdesk'
  if (url.includes('mistral')) return 'mistral'
  if (url.includes('together.xyz')) return 'llama'
  if (url.includes('cohere')) return 'cohere'

  // 回退到后端原始类型
  return backendProvider || 'openai'
}
