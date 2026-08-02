/**
 * Pi Agent 配置路径管理
 *
 * 移植自 Proma 的 config-paths.ts，适配 Diting 的目录结构。
 * 配置根目录：~/.diting/pi-agent/
 */

import { app } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  cpSync,
  rmSync,
  readFileSync,
} from 'fs'

/** 配置目录名 */
const CONFIG_DIR_NAME = '.diting'
/** Pi Agent 子目录名 */
const PI_AGENT_DIR_NAME = 'pi-agent'

/** 获取配置根目录 ~/.diting/ */
export function getConfigDir(): string {
  const dir = join(homedir(), CONFIG_DIR_NAME)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** 获取 Pi Agent 配置目录 ~/.diting/pi-agent/ */
export function getPiAgentDir(): string {
  const dir = join(getConfigDir(), PI_AGENT_DIR_NAME)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** 获取默认 Skills 模板目录 ~/.diting/pi-agent/default-skills/ */
export function getDefaultSkillsDir(): string {
  const dir = join(getPiAgentDir(), 'default-skills')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** 获取 Agent 工作区目录 ~/.diting/pi-agent/workspaces/ */
export function getAgentWorkspacesDir(): string {
  const dir = join(getPiAgentDir(), 'workspaces')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/**
 * 获取指定工作区路径
 *
 * 关键设计：工作区目录以唯一 id 命名，而非 slug 或 name。
 * 这样用户修改项目名称时，目录路径不受影响。
 * 兼容旧数据：若 id 目录不存在但 slug 目录存在，回退到 slug。
 */
export function getAgentWorkspacePath(idOrSlug: string): string {
  const byId = join(getAgentWorkspacesDir(), idOrSlug)
  if (existsSync(byId)) return byId
  // 兼容旧版以 slug 命名的目录
  const bySlug = join(getAgentWorkspacesDir(), idOrSlug)
  return bySlug
}

/** 获取工作区 Skills 目录 */
export function getWorkspaceSkillsDir(idOrSlug: string): string {
  return join(getAgentWorkspacePath(idOrSlug), 'skills')
}

/** 获取工作区禁用 Skills 目录 */
export function getInactiveSkillsDir(idOrSlug: string): string {
  return join(getAgentWorkspacePath(idOrSlug), 'skills-inactive')
}

/** 获取工作区 MCP 配置文件路径 */
export function getWorkspaceMcpPath(idOrSlug: string): string {
  return join(getAgentWorkspacePath(idOrSlug), 'mcp.json')
}

/** 获取工作区 CLAUDE.md 路径 */
export function getWorkspaceClaudeMdPath(idOrSlug: string): string {
  return join(getAgentWorkspacePath(idOrSlug), 'CLAUDE.md')
}

/** 获取工作区项目文件目录 */
export function getProjectFilesPath(idOrSlug: string): string {
  return join(getAgentWorkspacePath(idOrSlug), 'workspace-files')
}

/** 获取 Agent 会话目录 */
export function getAgentSessionsDir(): string {
  const dir = join(getPiAgentDir(), 'sessions')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** 获取 SDK 配置目录 */
export function getSdkConfigDir(): string {
  const dir = join(getPiAgentDir(), 'sdk-config')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** 获取 Agent 会话索引文件 */
export function getAgentSessionsIndexPath(): string {
  return join(getPiAgentDir(), 'sessions.json')
}

/** 获取 Agent 工作区索引文件 */
export function getAgentWorkspacesIndexPath(): string {
  return join(getPiAgentDir(), 'workspaces.json')
}

// ===== Skills 版本管理 =====

/** 退役的内置 Skill slug 列表 */
export const RETIRED_DEFAULT_SKILL_SLUGS: readonly string[] = []

const RETIRED_DEFAULT_SKILL_SLUG_SET = new Set(RETIRED_DEFAULT_SKILL_SLUGS)

export function isRetiredDefaultSkill(slug: string): boolean {
  return RETIRED_DEFAULT_SKILL_SLUG_SET.has(slug)
}

/** 从 SKILL.md 的 YAML frontmatter 中解析 version 字段 */
export function parseSkillVersion(skillDir: string): string {
  const skillMdPath = join(skillDir, 'SKILL.md')
  if (!existsSync(skillMdPath)) return '0.0.0'

  try {
    let content = readFileSync(skillMdPath, 'utf-8')
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1)
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
    if (!fmMatch?.[1]) return '0.0.0'

    for (const line of fmMatch[1].split('\n')) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue
      const key = line.slice(0, colonIdx).trim()
      const value = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (key === 'version' && value) return value
    }
  } catch {
    // 解析失败视为最低版本
  }

  return '0.0.0'
}

/** 比较两个 semver 版本字符串 */
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** 判断 a 是否比 b 新 */
export function isNewerVersion(a: string, b: string): boolean {
  return compareSemver(a, b) > 0
}

/** 清理已退役的内置 Skill 缓存 */
export function removeRetiredDefaultSkills(dir = getDefaultSkillsDir()): void {
  for (const slug of RETIRED_DEFAULT_SKILL_SLUGS) {
    const target = join(dir, slug)
    if (!existsSync(target)) continue
    try {
      rmSync(target, { recursive: true, force: true })
      console.log(`[Pi Agent] 已清理退役 Skill: ${slug}`)
    } catch (err) {
      console.warn(`[Pi Agent] 清理退役 Skill 失败 (${slug}):`, err)
    }
  }
}

// ===== bundled 资源路径 =====

/** 获取打包进 App 的默认 Skills 目录 */
export function getBundledDefaultSkillsDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'default-skills')
  }
  // 开发模式：ee-core 将所有源码 bundle 到 public/electron/main.js，
  // 因此 __dirname 为 public/electron/，不能用相对源码路径。
  // 使用 app.getAppPath() 获取项目根目录再拼 electron/resources/default-skills
  const baseDir = app.getAppPath ? app.getAppPath() : process.cwd()
  return join(baseDir, 'electron', 'resources', 'default-skills')
}

/** 获取打包进 App 的内置 MCP 定义 JSON */
export function getBundledMcpJsonPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'builtin-mcp', 'default-mcp.json')
  }
  // 开发模式：同样从项目根目录定位
  const baseDir = app.getAppPath ? app.getAppPath() : process.cwd()
  return join(baseDir, 'electron', 'components', 'pi', 'builtin-mcp', 'default-mcp.json')
}
