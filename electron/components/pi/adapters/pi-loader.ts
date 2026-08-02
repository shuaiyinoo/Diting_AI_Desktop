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
  ResourceLoader,
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
  ResourceLoader,
}
export type { AgentToolResult, TSchema }

/** pi-coding-agent 模块类型 */
interface PiCodingAgentModule {
  createAgentSession: typeof import('@earendil-works/pi-coding-agent')['createAgentSession']
  loadSkills: typeof import('@earendil-works/pi-coding-agent')['loadSkills']
  ModelRuntime: typeof import('@earendil-works/pi-coding-agent')['ModelRuntime']
  DefaultResourceLoader: typeof import('@earendil-works/pi-coding-agent')['DefaultResourceLoader']
  SessionManager: typeof import('@earendil-works/pi-coding-agent')['SessionManager']
  SettingsManager: typeof import('@earendil-works/pi-coding-agent')['SettingsManager']
  getAgentDir: typeof import('@earendil-works/pi-coding-agent')['getAgentDir']
  defineTool: typeof import('@earendil-works/pi-coding-agent')['defineTool']
  // 内置工具定义创建函数（SDK 逐个导出，无批量函数）
  createBashToolDefinition: typeof import('@earendil-works/pi-coding-agent')['createBashToolDefinition']
  createEditToolDefinition: typeof import('@earendil-works/pi-coding-agent')['createEditToolDefinition']
  createWriteToolDefinition: typeof import('@earendil-works/pi-coding-agent')['createWriteToolDefinition']
  createReadToolDefinition: typeof import('@earendil-works/pi-coding-agent')['createReadToolDefinition']
  createGrepToolDefinition: typeof import('@earendil-works/pi-coding-agent')['createGrepToolDefinition']
  createFindToolDefinition: typeof import('@earendil-works/pi-coding-agent')['createFindToolDefinition']
  createLsToolDefinition: typeof import('@earendil-works/pi-coding-agent')['createLsToolDefinition']
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
