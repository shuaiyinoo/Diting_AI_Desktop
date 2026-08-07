/**
 * Pi Agent 配置路径管理
 *
 * 移植自 Proma 的 config-paths.ts，适配 Diting 的目录结构。
 * 配置根目录：~/.diting/pi-agent/
 */

import { app } from 'electron'
import { join, resolve, relative, isAbsolute, dirname } from 'path'
import { homedir } from 'os'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  cpSync,
  rmSync,
  readFileSync,
  statSync,
  realpathSync,
  writeFileSync,
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

// ===== 记忆文件常量 =====

/** 工作区 CLAUDE.md 文件名 */
export const WORKSPACE_CLAUDE_MD = 'CLAUDE.md'
/** Auto Memory 目录相对路径 */
export const AUTO_MEMORY_DIR = '.claude/memory'
/** Auto Memory 索引文件名 */
export const AUTO_MEMORY_INDEX = 'MEMORY.md'
/** 单个记忆文件大小上限（10 MB） */
export const MEMORY_FILE_SIZE_LIMIT = 10 * 1024 * 1024
/** 文件树递归深度上限 */
export const MEMORY_TREE_MAX_DEPTH = 8

/** 获取工作区 CLAUDE.md 路径 */
export function getWorkspaceClaudeMdPath(idOrSlug: string): string {
  return join(getAgentWorkspacePath(idOrSlug), WORKSPACE_CLAUDE_MD)
}

/** 获取工作区 Auto Memory 目录路径（不存在则创建） */
export function getWorkspaceAutoMemoryDir(idOrSlug: string): string {
  const dir = join(getAgentWorkspacePath(idOrSlug), AUTO_MEMORY_DIR)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

/** 获取工作区 Auto Memory 索引文件路径 */
export function getWorkspaceAutoMemoryIndexPath(idOrSlug: string): string {
  return join(getWorkspaceAutoMemoryDir(idOrSlug), AUTO_MEMORY_INDEX)
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

// ===== 记忆文件安全管理 =====

/** 二进制文件扩展名集合 */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svg',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.gz', '.tar', '.7z', '.rar', '.bz2',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.mp3', '.mp4', '.avi', '.mov', '.mkv', '.flv', '.wav', '.flac',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
])

/** 判断文件是否可能是二进制文件 */
export function isLikelyBinaryFile(absPath: string, size: number): boolean {
  if (size === 0) return false
  const ext = absPath.slice(absPath.lastIndexOf('.')).toLowerCase()
  if (BINARY_EXTENSIONS.has(ext)) return true
  // 无扩展名或 .md/.txt 以外的文件，通过读取前几个字节检测 BOM 和控制字符
  if (ext === '.md' || ext === '.txt' || ext === '.json' || ext === '.yaml' || ext === '.yml') {
    return false
  }
  // 对于其他扩展名，读取前 512 字节检测是否含大量控制字符
  try {
    const fd = require('fs').openSync(absPath, 'r')
    const buf = Buffer.alloc(Math.min(512, size))
    require('fs').readSync(fd, buf, 0, buf.length, 0)
    require('fs').closeSync(fd)
    const textChars = buf.toString('utf-8').replace(/[^\x20-\x7E\t\n\r]/g, '').length
    return textChars / buf.length < 0.7
  } catch {
    return false
  }
}

/**
 * 安全解析 auto memory 文件路径，防止路径遍历和 symlink 逃逸
 *
 * 移植自 Proma 的 resolveAutoMemoryFilePath，确保所有记忆文件读写
 * 都限制在 auto memory 目录内。
 */
export function resolveAutoMemoryFilePath(memoryDir: string, relativePath: string): string {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new Error('相对路径不能为空')
  }
  if (isAbsolute(relativePath)) {
    throw new Error('禁止传入绝对路径')
  }

  // 归一化路径分隔符
  const normalized = relativePath.replace(/\\/g, '/')
  const resolved = resolve(memoryDir, normalized)
  const rel = relative(memoryDir, resolved)

  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error('非法路径：禁止访问 auto memory 目录外')
  }

  // 防御 symlink 逃逸：对真实存在的最近祖先做 realpath 校验
  const memoryRealDir = existsSync(memoryDir) ? realpathSync(memoryDir) : memoryDir
  let probe = resolved
  while (probe !== memoryDir && !existsSync(probe)) {
    const parent = dirname(probe)
    if (parent === probe) break
    probe = parent
  }
  if (existsSync(probe)) {
    const realProbe = realpathSync(probe)
    const realRel = relative(memoryRealDir, realProbe)
    if (realRel.startsWith('..') || isAbsolute(realRel)) {
      throw new Error('非法路径：禁止通过软链接访问 auto memory 目录外')
    }
  }

  return resolved
}

/** 记忆文件摘要信息 */
export interface MemoryFileSummary {
  exists: boolean
  path: string
  size: number
  updatedAt?: number
}

/** Auto Memory 目录摘要 */
export interface AutoMemorySummary {
  directory: string
  memoryMdExists: boolean
  fileCount: number
  totalSize: number
  updatedAt?: number
}

/** 工作区记忆摘要 */
export interface WorkspaceMemorySummary {
  claudeMd: MemoryFileSummary
  autoMemory: AutoMemorySummary
}

/** 获取单个文件的摘要信息 */
export function getFileSummary(absPath: string): MemoryFileSummary {
  if (!existsSync(absPath)) {
    return { exists: false, path: absPath, size: 0 }
  }
  const st = statSync(absPath)
  return {
    exists: st.isFile(),
    path: absPath,
    size: st.isFile() ? st.size : 0,
    updatedAt: st.mtimeMs,
  }
}

/** 递归统计 auto memory 目录的文件数量和总大小 */
export function collectAutoMemorySummary(memoryDir: string): AutoMemorySummary {
  let fileCount = 0
  let totalSize = 0
  let updatedAt: number | undefined

  const walk = (dir: string, depth: number): void => {
    if (depth > MEMORY_TREE_MAX_DEPTH) return
    let entries: import('fs').Dirent[]
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const absPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(absPath, depth + 1)
      } else if (entry.isFile()) {
        const st = statSync(absPath)
        if (isLikelyBinaryFile(absPath, st.size)) continue
        fileCount += 1
        totalSize += st.size
        updatedAt = updatedAt == null ? st.mtimeMs : Math.max(updatedAt, st.mtimeMs)
      }
    }
  }

  walk(memoryDir, 0)
  return {
    directory: memoryDir,
    memoryMdExists: existsSync(join(memoryDir, AUTO_MEMORY_INDEX)),
    fileCount,
    totalSize,
    updatedAt,
  }
}

/** 获取工作区记忆摘要 */
export function getWorkspaceMemorySummary(idOrSlug: string): WorkspaceMemorySummary {
  const memoryDir = join(getAgentWorkspacePath(idOrSlug), AUTO_MEMORY_DIR)
  return {
    claudeMd: getFileSummary(getWorkspaceClaudeMdPath(idOrSlug)),
    autoMemory: collectAutoMemorySummary(memoryDir),
  }
}

/** 记忆文件树节点 */
export interface MemoryFileNode {
  relativePath: string
  name: string
  type: 'file' | 'directory'
  size?: number
  isText?: boolean
  children?: MemoryFileNode[]
}

/** 构建 auto memory 目录的文件树 */
export function buildMemoryFileTree(rootDir: string, currentDir: string, depth: number): MemoryFileNode[] {
  if (depth > MEMORY_TREE_MAX_DEPTH) return []
  let entries: import('fs').Dirent[]
  try {
    entries = readdirSync(currentDir, { withFileTypes: true })
  } catch {
    return []
  }

  const nodes: MemoryFileNode[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const absPath = join(currentDir, entry.name)
    const rel = relative(rootDir, absPath).split(/[\\/]/).join('/')

    if (entry.isDirectory()) {
      nodes.push({
        relativePath: rel,
        name: entry.name,
        type: 'directory',
        children: buildMemoryFileTree(rootDir, absPath, depth + 1),
      })
    } else if (entry.isFile()) {
      let size = 0
      try {
        size = statSync(absPath).size
      } catch {
        // ignore
      }
      nodes.push({
        relativePath: rel,
        name: entry.name,
        type: 'file',
        size,
        isText: !isLikelyBinaryFile(absPath, size),
      })
    }
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    if (a.relativePath === AUTO_MEMORY_INDEX) return -1
    if (b.relativePath === AUTO_MEMORY_INDEX) return 1
    return a.name.localeCompare(b.name)
  })
  return nodes
}

/** 列出工作区 auto memory 文件树 */
export function listWorkspaceAutoMemoryFiles(idOrSlug: string): MemoryFileNode[] {
  const dir = getWorkspaceAutoMemoryDir(idOrSlug)
  return buildMemoryFileTree(dir, dir, 0)
}

/** 记忆文件内容 */
export interface MemoryFileContent {
  relativePath: string
  isText: boolean
  size: number
  content?: string
}

/** 读取工作区 CLAUDE.md */
export function readWorkspaceClaudeMd(idOrSlug: string): MemoryFileContent {
  const abs = getWorkspaceClaudeMdPath(idOrSlug)
  if (!existsSync(abs)) {
    return { relativePath: WORKSPACE_CLAUDE_MD, isText: true, size: 0, content: '' }
  }
  const st = statSync(abs)
  if (!st.isFile()) throw new Error(`${WORKSPACE_CLAUDE_MD} 不是文件`)
  if (st.size > MEMORY_FILE_SIZE_LIMIT) {
    throw new Error(`文件过大（${(st.size / 1024 / 1024).toFixed(2)} MB），超过 10 MB 限制`)
  }
  const binary = isLikelyBinaryFile(abs, st.size)
  return {
    relativePath: WORKSPACE_CLAUDE_MD,
    isText: !binary,
    size: st.size,
    content: binary ? undefined : readFileSync(abs, 'utf-8'),
  }
}

/** 写入工作区 CLAUDE.md */
export function writeWorkspaceClaudeMd(idOrSlug: string, content: string): void {
  const byteLen = Buffer.byteLength(content, 'utf-8')
  if (byteLen > MEMORY_FILE_SIZE_LIMIT) {
    throw new Error(`内容过大（${(byteLen / 1024 / 1024).toFixed(2)} MB），超过 10 MB 限制`)
  }
  writeFileSync(getWorkspaceClaudeMdPath(idOrSlug), content, 'utf-8')
  console.log(`[Pi Agent] 已更新工作区 CLAUDE.md: ${idOrSlug}`)
}

/** 读取工作区 auto memory 文件 */
export function readWorkspaceAutoMemoryFile(idOrSlug: string, relativePath: string): MemoryFileContent {
  const dir = getWorkspaceAutoMemoryDir(idOrSlug)
  const abs = resolveAutoMemoryFilePath(dir, relativePath)

  // MEMORY.md 不存在时返回空内容（虚拟索引文件）
  if (!existsSync(abs) && relativePath === AUTO_MEMORY_INDEX) {
    return { relativePath: AUTO_MEMORY_INDEX, isText: true, size: 0, content: '' }
  }
  if (!existsSync(abs)) throw new Error(`文件不存在: ${relativePath}`)

  const st = statSync(abs)
  if (!st.isFile()) throw new Error(`目标不是文件: ${relativePath}`)
  if (st.size > MEMORY_FILE_SIZE_LIMIT) {
    throw new Error(`文件过大（${(st.size / 1024 / 1024).toFixed(2)} MB），超过 10 MB 限制`)
  }

  const binary = isLikelyBinaryFile(abs, st.size)
  return {
    relativePath: relative(dir, abs).split(/[\\/]/).join('/'),
    isText: !binary,
    size: st.size,
    content: binary ? undefined : readFileSync(abs, 'utf-8'),
  }
}

/** 写入工作区 auto memory 文件 */
export function writeWorkspaceAutoMemoryFile(idOrSlug: string, relativePath: string, content: string): void {
  const dir = getWorkspaceAutoMemoryDir(idOrSlug)
  const abs = resolveAutoMemoryFilePath(dir, relativePath)
  const byteLen = Buffer.byteLength(content, 'utf-8')
  if (byteLen > MEMORY_FILE_SIZE_LIMIT) {
    throw new Error(`内容过大（${(byteLen / 1024 / 1024).toFixed(2)} MB），超过 10 MB 限制`)
  }
  const parent = dirname(abs)
  if (!existsSync(parent)) {
    mkdirSync(parent, { recursive: true })
  }
  writeFileSync(abs, content, 'utf-8')
  console.log(`[Pi Agent] 已更新 auto memory 文件: ${idOrSlug}/${relativePath}`)
}
