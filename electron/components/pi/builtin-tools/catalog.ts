/**
 * 内置 Tools 能力目录
 *
 * 提供可展示的元数据，从 default-tools.json 读取。
 * Tools 是 Agent 可直接调用的工具（非 MCP），分为 SDK 内置和自定义两类。
 */

import manifest from './default-tools.json'

/** 工具来源 */
export type ToolSource = 'sdk' | 'custom'

/** 工具分类 */
export type ToolCategory = 'file' | 'system' | 'search' | 'interaction' | 'task' | 'runtime'

/** 工具摘要 */
export interface ToolSummary {
  /** 工具名称（运行时名字） */
  name: string
  /** 展示标签 */
  label: string
  /** 描述 */
  description: string
  /** 分类 */
  category: ToolCategory
  /** 来源：SDK 内置 / 自定义 */
  source: ToolSource
  /** 是否只读（不修改文件系统） */
  readOnly: boolean
}

const TOOLS: ToolSummary[] = (manifest.tools as unknown as ToolSummary[]).map((t) => ({ ...t }))

const BY_NAME = new Map<string, ToolSummary>(TOOLS.map((t) => [t.name, t]))

/** 所有内置工具定义 */
export function getBuiltinTools(): ToolSummary[] {
  return TOOLS
}

/** 按名称取工具定义 */
export function getBuiltinToolByName(name: string): ToolSummary | undefined {
  return BY_NAME.get(name)
}

/** 分类标签映射 */
export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  file: '文件操作',
  system: '系统命令',
  search: '搜索查找',
  interaction: '用户交互',
  task: '任务跟踪',
  runtime: '运行时',
}

/** 来源标签映射 */
export const SOURCE_LABELS: Record<ToolSource, string> = {
  sdk: 'SDK 内置',
  custom: 'Diting 自定义',
}
