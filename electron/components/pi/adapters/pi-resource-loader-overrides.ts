/**
 * Pi SDK ResourceLoader 覆写器
 *
 * 移植自 Proma 的 pi-resource-loader-overrides.ts。
 *
 * 核心职责：
 * 1. agentsFilesOverride —— 过滤掉本地项目目录中的 CLAUDE.md / AGENTS.md 等指令文件，
 *    防止与 Diting 注入的系统提示词冲突。
 * 2. skillsOverride —— 只保留工作区 Skills 目录内的 Skill，过滤掉 SDK 默认目录中的无关 Skill。
 *
 * 这样 Diting 可以完全掌控 Agent 看到的指令和 Skills 来源，不受本地项目配置干扰。
 */

import type { Skill, ResourceDiagnostic } from '@earendil-works/pi-coding-agent'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
import { lstatSync, realpathSync } from 'fs'

/** 需要过滤的遗留 Agent 上下文文件名 */
const LEGACY_AGENT_CONTEXT_FILE_NAMES = new Set([
  'CLAUDE.md',
  'CLAUDE.MD',
  'AGENTS.md',
  'AGENTS.MD',
])

/** Pi SDK 的 agentsFiles 条目类型 */
interface AgentsFilesEntry {
  path: string
  content: string
}

/** Pi SDK 的 agentsFiles 结果类型 */
interface AgentsFilesResult {
  agentsFiles: AgentsFilesEntry[]
}

/** Pi SDK 的 Skill 加载结果类型 */
interface SkillLoadResult {
  skills: Skill[]
  diagnostics: ResourceDiagnostic[]
}

/**
 * 创建 agentsFiles 覆写器：过滤掉本地项目中的指令文件
 *
 * Diting 自己注入系统提示词，不继承用户选择的本地项目或其祖先目录中的 CLAUDE.md / AGENTS.md。
 */
export function createDitingAgentsFilesOverride(): (base: AgentsFilesResult) => AgentsFilesResult {
  return (base: AgentsFilesResult): AgentsFilesResult => ({
    ...base,
    agentsFiles: base.agentsFiles.filter(
      (file) => !LEGACY_AGENT_CONTEXT_FILE_NAMES.has(basename(file.path)),
    ),
  })
}

// ===== Skills 覆写器辅助函数 =====

/** 安全解析 realpath（不存在时返回 undefined） */
function realpathIfExists(path: string): string | undefined {
  try {
    return realpathSync.native(path)
  } catch {
    return undefined
  }
}

/** 查找最近的已存在祖先路径 */
function findNearestExistingPath(path: string): string | undefined {
  let current = path
  while (true) {
    try {
      lstatSync(current)
      return current
    } catch {
      const parent = dirname(current)
      if (parent === current) return undefined
      current = parent
    }
  }
}

/** 带防御的 realpath 解析（处理不存在路径） */
function resolveGuardedRealPath(path: string): string {
  const resolved = resolve(path)
  const exact = realpathIfExists(resolved)
  if (exact) return exact

  const nearestExisting = findNearestExistingPath(resolved)
  if (!nearestExisting) return resolved

  const nearestReal = realpathIfExists(nearestExisting)
  if (!nearestReal) return resolved

  const tail = relative(nearestExisting, resolved)
  return tail ? join(nearestReal, tail) : nearestReal
}

/** 检查路径是否在某个根目录内 */
function isPathWithinRoot(path: string, root: string): boolean {
  if (path === root) return true
  const rel = relative(root, path)
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel)
}

/** 构建允许的 Skill 根目录列表 */
function buildAllowedSkillRoots(additionalSkillPaths: string[] | undefined): string[] {
  return (additionalSkillPaths ?? [])
    .map((path) => resolveGuardedRealPath(path))
    .filter((path, index, arr) => arr.indexOf(path) === index)
}

/** 检查 Skill 路径是否在允许的根目录内 */
function isDitingSkillPath(
  path: string | undefined,
  allowedRoots: string[],
): boolean {
  if (!path || allowedRoots.length === 0) return false
  const guardedPath = resolveGuardedRealPath(path)
  return allowedRoots.some((root) => isPathWithinRoot(guardedPath, root))
}

/**
 * 创建 Skills 覆写器：只保留工作区 Skills 目录内的 Skill
 *
 * 过滤掉 Pi SDK 默认目录（如 ~/.pi/agent/skills）中的无关 Skill，
 * 确保 Agent 只使用 Diting 工作区管理的 Skills。
 */
export function createDitingSkillsOverride(
  additionalSkillPaths: string[] | undefined,
): (base: SkillLoadResult) => SkillLoadResult {
  const allowedRoots = buildAllowedSkillRoots(additionalSkillPaths)
  return (base: SkillLoadResult): SkillLoadResult => ({
    ...base,
    skills: base.skills.filter(
      (skill) =>
        isDitingSkillPath(skill.filePath, allowedRoots) ||
        isDitingSkillPath(skill.baseDir, allowedRoots),
    ),
    diagnostics: base.diagnostics.filter((diagnostic) =>
      isDitingSkillPath(diagnostic.path, allowedRoots),
    ),
  })
}
