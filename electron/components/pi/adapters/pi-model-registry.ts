/**
 * Pi 模型注册表
 *
 * 移植自 Proma 的 pi-model-registry.ts。
 * 将 Diting 的渠道配置注册为 Pi Runtime 的 provider。
 */

import { logger } from 'ee-core/log'
import type { AgentChannel } from '../types'

/** Pi 支持的 Provider 协议 */
export type PiProviderProtocol = 'openai' | 'anthropic' | 'google' | 'openai-responses'

/** Pi Provider 配置 */
export interface PiProviderConfig {
  name: string
  protocol: PiProviderProtocol
  baseURL: string
  apiKey: string
  model: string
  /** 鉴权头（覆盖默认 Authorization） */
  authHeader?: string
  /** 额外请求头 */
  headers?: Record<string, string>
  /** 上下文窗口大小 */
  contextWindow?: number
  /** 最大输出 token */
  maxOutputTokens?: number
}

/** Diting 渠道 provider → Pi 协议映射 */
const PROVIDER_PROTOCOL_MAP: Record<string, PiProviderProtocol> = {
  anthropic: 'anthropic',
  openai: 'openai',
  deepseek: 'anthropic',
  minimax: 'anthropic',
  google: 'google',
  zhipu: 'openai',
  doubao: 'openai',
  qwen: 'openai',
  custom: 'openai',
}

/** 默认 Base URL 映射 */
const DEFAULT_BASE_URL: Record<string, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
  minimax: 'https://api.minimax.chat/v1',
  google: 'https://generativelanguage.googleapis.com',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
}

/**
 * 将 Diting 渠道转换为 Pi Provider 配置
 */
export function channelToPiProvider(channel: AgentChannel): PiProviderConfig | null {
  if (!channel.apiKey && channel.provider !== 'custom') {
    logger.warn(`[Pi Model Registry] 渠道 ${channel.name} 缺少 API Key，跳过`)
    return null
  }

  const protocol = PROVIDER_PROTOCOL_MAP[channel.provider]
  if (!protocol) {
    logger.warn(`[Pi Model Registry] 不支持的 provider: ${channel.provider}`)
    return null
  }

  const baseURL = channel.baseUrl || DEFAULT_BASE_URL[channel.provider] || ''

  return {
    name: `diting-${channel.id}`,
    protocol,
    baseURL,
    apiKey: channel.apiKey || '',
    model: channel.modelId || '',
    ...(channel.provider === 'anthropic' && {
      headers: { 'anthropic-version': '2023-06-01' },
    }),
    ...(channel.provider === 'google' && {
      authHeader: 'x-goog-api-key',
    }),
  }
}

/**
 * 批量注册渠道为 Pi Provider
 */
export function channelsToPiProviders(channels: AgentChannel[]): PiProviderConfig[] {
  const providers: PiProviderConfig[] = []
  for (const channel of channels) {
    if (!channel.enabled) continue
    const config = channelToPiProvider(channel)
    if (config) providers.push(config)
  }
  return providers
}
