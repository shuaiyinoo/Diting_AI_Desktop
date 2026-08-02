/**
 * ESM 包懒加载器
 *
 * ee-bin 使用 esbuild 的 packages: 'external' + format: 'cjs'，
 * 静态 import 会被编译为 require()，而以下包为纯 ESM（exports 仅有 import 条件），
 * require() 会报 ERR_PACKAGE_PATH_NOT_EXPORTED。
 *
 * 通过动态 import() 在运行时以 ESM 方式加载，绕过 CJS 限制。
 */

import type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionEventListener,
  Skill,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent'
import type { AgentToolResult } from '@earendil-works/pi-agent-core'
import type { TSchema } from 'typebox'

// 重新导出类型，供其他模块引用
export type {
  AgentSession,
  AgentSessionEvent,
  AgentSessionEventListener,
  Skill,
  ToolDefinition,
}
export type { AgentToolResult, TSchema }

/** pi-coding-agent 模块类型 */
interface PiCodingAgentModule {
  createAgentSession: typeof import('@earendil-works/pi-coding-agent')['createAgentSession']
  loadSkills: typeof import('@earendil-works/pi-coding-agent')['loadSkills']
}

/** typebox 模块类型 */
interface TypeboxModule {
  Type: typeof import('typebox')['Type']
}

// 模块缓存
let _piSdk: PiCodingAgentModule | null = null
let _typebox: TypeboxModule | null = null

/**
 * 懒加载 pi-coding-agent（纯 ESM 包）
 */
export async function loadPiSdk(): Promise<PiCodingAgentModule> {
  if (!_piSdk) {
    _piSdk = await import('@earendil-works/pi-coding-agent')
  }
  return _piSdk
}

/**
 * 懒加载 typebox（纯 ESM 包）
 */
export async function loadTypebox(): Promise<TypeboxModule> {
  if (!_typebox) {
    _typebox = await import('typebox')
  }
  return _typebox
}
