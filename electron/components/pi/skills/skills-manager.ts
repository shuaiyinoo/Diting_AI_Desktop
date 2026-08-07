/**
 * Skills 管理器
 *
 * 移植自 Proma 的 config-paths.ts:seedDefaultSkills 和
 * agent-workspace-manager.ts:upgradeDefaultSkillsInWorkspaces。
 *
 * 职责：
 * - 应用启动时将 bundled Skills 同步到 ~/.diting/pi-agent/default-skills/
 * - 新建工作区时复制默认 Skills 到工作区 skills/ 目录
 * - 通过 semver 版本比较决定是否升级
 */

import {
  existsSync,
  readdirSync,
  cpSync,
  rmSync,
  readFileSync,
  mkdirSync,
  renameSync,
  statSync,
} from 'fs'
import { join, relative, extname } from 'path'
import { logger } from 'ee-core/log'
import {
  getDefaultSkillsDir,
  getBundledDefaultSkillsDir,
  getAgentWorkspacesDir,
  getAgentWorkspacesIndexPath,
  getWorkspaceSkillsDir,
  getInactiveSkillsDir,
  parseSkillVersion,
  compareSemver,
  removeRetiredDefaultSkills,
  isRetiredDefaultSkill,
} from '../config-paths'
import type { SkillMeta, SkillFileNode, SkillFileContent } from '../types'

/** Skill 文件复制过滤器：排除 .DS_Store 等无关文件 */
function defaultSkillCopyFilter(src: string): boolean {
  const basename = src.split(/[\\/]/).pop() ?? ''
  return !basename.startsWith('.DS_Store') && basename !== 'Thumbs.db'
}

/**
 * 从 app bundle 同步默认 Skills 到 ~/.diting/pi-agent/default-skills/
 *
 * - 缺失的 Skill：直接复制
 * - 已存在的 Skill：比较 SKILL.md 中的 version，bundled 更新时才覆盖
 */
export function seedDefaultSkills(): void {
  const bundledDir = getBundledDefaultSkillsDir()
  const userDir = getDefaultSkillsDir()

  // 清理已退役的内置 Skill
  removeRetiredDefaultSkills(userDir)

  if (!existsSync(bundledDir)) {
    logger.info('[Pi Agent Skills] 未找到内置 default-skills 目录，跳过')
    return
  }

  try {
    const entries = readdirSync(bundledDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const source = join(bundledDir, entry.name)
      const target = join(userDir, entry.name)

      try {
        if (!existsSync(target)) {
          cpSync(source, target, { recursive: true, filter: defaultSkillCopyFilter })
          logger.info(`[Pi Agent Skills] 已同步默认 Skill: ${entry.name}`)
          continue
        }

        const bundledVer = parseSkillVersion(source)
        const existingVer = parseSkillVersion(target)

        if (compareSemver(bundledVer, existingVer) > 0) {
          rmSync(target, { recursive: true, force: true })
          cpSync(source, target, { recursive: true, filter: defaultSkillCopyFilter })
          logger.info(
            `[Pi Agent Skills] 已升级默认 Skill: ${entry.name} (${existingVer} → ${bundledVer})`,
          )
        }
      } catch (err) {
        // 单 skill 失败不影响其他 skill 同步
        logger.warn(`[Pi Agent Skills] 同步默认 Skill 失败 (${entry.name})，跳过:`, err)
      }
    }
  } catch (err) {
    logger.warn('[Pi Agent Skills] 同步默认 Skills 失败:', err)
  }
}

/** Skill 文件复制过滤器（工作区级别） */
function skillCopyFilter(src: string): boolean {
  return defaultSkillCopyFilter(src)
}

/**
 * 升级所有工作区中版本过旧的默认 Skills
 *
 * 遍历 ~/.diting/pi-agent/workspaces/ 下所有工作区，
 * 对每个工作区检查 skills/ 和 skills-inactive/ 目录中的默认 Skill，
 * 如果 default-skills/ 中的版本更新则覆盖。
 */
export function upgradeDefaultSkillsInWorkspaces(): void {
  const defaultDir = getDefaultSkillsDir()

  interface DefaultSkillInfo {
    version: string
    sourcePath: string
  }
  const defaultSkills = new Map<string, DefaultSkillInfo>()

  try {
    const entries = readdirSync(defaultDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory() || isRetiredDefaultSkill(entry.name)) continue
      const sourcePath = join(defaultDir, entry.name)
      defaultSkills.set(entry.name, {
        version: parseSkillVersion(sourcePath),
        sourcePath,
      })
    }
  } catch {
    return
  }

  const workspacesDir = getAgentWorkspacesDir()
  if (!existsSync(workspacesDir)) return

  try {
    const workspaceEntries = readdirSync(workspacesDir, { withFileTypes: true })
    for (const wsEntry of workspaceEntries) {
      if (!wsEntry.isDirectory()) continue
      const slug = wsEntry.name
      const activeDir = getWorkspaceSkillsDir(slug)
      const inactiveDir = getInactiveSkillsDir(slug)

      for (const [skillSlug, info] of defaultSkills) {
        const activePath = join(activeDir, skillSlug)
        const inactivePath = join(inactiveDir, skillSlug)

        if (existsSync(activePath)) {
          const currentVer = parseSkillVersion(activePath)
          if (compareSemver(info.version, currentVer) > 0) {
            try {
              rmSync(activePath, { recursive: true, force: true })
              cpSync(info.sourcePath, activePath, { recursive: true, filter: skillCopyFilter })
              logger.info(
                `[Pi Agent Skills] 已升级工作区 Skill: ${slug}/${skillSlug} (active, ${currentVer} → ${info.version})`,
              )
            } catch (err) {
              logger.warn(`[Pi Agent Skills] 升级 Skill 失败 (${slug}/${skillSlug})，跳过`, err)
            }
          }
          continue
        }

        if (existsSync(inactivePath)) {
          const currentVer = parseSkillVersion(inactivePath)
          if (compareSemver(info.version, currentVer) > 0) {
            try {
              rmSync(inactivePath, { recursive: true, force: true })
              cpSync(info.sourcePath, inactivePath, { recursive: true, filter: skillCopyFilter })
              logger.info(
                `[Pi Agent Skills] 已升级工作区 Skill: ${slug}/${skillSlug} (inactive, ${currentVer} → ${info.version})`,
              )
            } catch (err) {
              logger.warn(`[Pi Agent Skills] 升级 Skill 失败 (${slug}/${skillSlug})，跳过`, err)
            }
          }
          continue
        }

        // 目标不存在：注入新默认 Skill
        try {
          if (!existsSync(activeDir)) mkdirSync(activeDir, { recursive: true })
          cpSync(info.sourcePath, activePath, { recursive: true, filter: skillCopyFilter })
          logger.info(`[Pi Agent Skills] 已注入新默认 Skill: ${slug}/${skillSlug} → active`)
        } catch (err) {
          logger.warn(`[Pi Agent Skills] 注入默认 Skill 失败 (${slug}/${skillSlug}):`, err)
        }
      }
    }
  } catch (err) {
    logger.warn('[Pi Agent Skills] 升级工作区 Skills 失败:', err)
  }
}

// ===== Skill 扫描与管理 =====

/** 解析 SKILL.md 的 YAML frontmatter */
function parseSkillFrontmatter(content: string, slug: string, enabled: boolean): SkillMeta {
  const meta: SkillMeta = { slug, name: slug, enabled }

  // 移除 UTF-8 BOM
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1)

  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!fmMatch) return meta

  const yaml = fmMatch[1]
  if (!yaml) return meta

  const validKeys = new Set(['name', 'description', 'group', 'icon', 'version'])
  const entries: Record<string, string> = {}
  let currentKey = ''
  let isFolded = false

  for (const line of yaml.split('\n')) {
    const indented = /^\s/.test(line)

    if (!indented) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) {
        currentKey = ''
        continue
      }

      const key = line.slice(0, colonIdx).trim()
      const raw = line.slice(colonIdx + 1).trim()

      if (!validKeys.has(key)) {
        currentKey = ''
        isFolded = false
        continue
      }

      if (raw === '|' || raw === '>') {
        currentKey = key
        isFolded = raw === '>'
        entries[key] = ''
        continue
      }

      currentKey = key
      isFolded = false
      entries[key] = raw.replace(/^["']|["']$/g, '')
    } else if (currentKey) {
      const text = line.trim()
      if (!text) {
        if (entries[currentKey]) entries[currentKey] += '\n'
        continue
      }
      const sep = isFolded ? ' ' : '\n'
      entries[currentKey] = entries[currentKey] ? entries[currentKey] + sep + text : text
    }
  }

  if (entries.name) meta.name = entries.name.trim()
  if (entries.description) meta.description = entries.description.trim()
  if (entries.group) meta.group = entries.group.trim()
  if (entries.icon) meta.icon = entries.icon.trim()
  if (entries.version) meta.version = entries.version.trim()

  return meta
}

/** 扫描指定目录下的 Skills */
function scanSkillsInDir(dir: string, enabled: boolean): SkillMeta[] {
  const skills: SkillMeta[] = []

  try {
    const entries = readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const skillMdPath = join(dir, entry.name, 'SKILL.md')
      if (!existsSync(skillMdPath)) continue

      try {
        const content = readFileSync(skillMdPath, 'utf-8')
        const meta = parseSkillFrontmatter(content, entry.name, enabled)
        skills.push(meta)
      } catch {
        logger.warn(`[Pi Agent Skills] 解析 Skill 失败: ${entry.name}`)
      }
    }
  } catch {
    // 目录可能不存在
  }

  return skills
}

/** 获取工作区所有 Skills（含活跃和不活跃） */
export function getAllWorkspaceSkills(workspaceSlug: string): SkillMeta[] {
  const activeSkills = scanSkillsInDir(getWorkspaceSkillsDir(workspaceSlug), true)
  const inactiveSkills = scanSkillsInDir(getInactiveSkillsDir(workspaceSlug), false)

  // 工作区可能尚未同步 Skills（例如 initSkills 未执行或工作区刚创建），
  // fallback 到 default-skills 目录展示所有内置 Skills
  if (activeSkills.length === 0 && inactiveSkills.length === 0) {
    const defaultDir = getDefaultSkillsDir()
    if (existsSync(defaultDir)) {
      const defaultSkills = scanSkillsInDir(defaultDir, true)
      if (defaultSkills.length > 0) {
        logger.info(`[Pi Agent Skills] 工作区 ${workspaceSlug} 无 Skills，使用 default-skills 目录展示 (${defaultSkills.length} 个)`)
        return defaultSkills
      }
    }
  }

  return [...activeSkills, ...inactiveSkills]
}

/** 获取工作区活跃 Skills */
export function getWorkspaceSkills(workspaceSlug: string): SkillMeta[] {
  return scanSkillsInDir(getWorkspaceSkillsDir(workspaceSlug), true)
}

/** 获取默认 Skills 的 slug 列表 */
export function getDefaultSkillSlugs(): string[] {
  const dir = getDefaultSkillsDir()
  if (!existsSync(dir)) return []

  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch {
    return []
  }
}

/** 切换工作区 Skill 启用/禁用（在 skills/ 和 skills-inactive/ 之间移动） */
export function toggleWorkspaceSkill(workspaceSlug: string, skillSlug: string, enabled: boolean): void {
  const activeDir = getWorkspaceSkillsDir(workspaceSlug)
  const inactiveDir = getInactiveSkillsDir(workspaceSlug)

  const srcDir = enabled ? inactiveDir : activeDir
  const destDir = enabled ? activeDir : inactiveDir

  const srcPath = join(srcDir, skillSlug)
  const destPath = join(destDir, skillSlug)

  // 如果工作区中找不到 Skill，尝试从 default-skills 目录复制到活跃目录
  if (!existsSync(srcPath)) {
    const defaultSkillPath = join(getDefaultSkillsDir(), skillSlug)
    if (existsSync(defaultSkillPath)) {
      // 确保目标目录存在
      if (!existsSync(activeDir)) mkdirSync(activeDir, { recursive: true })
      if (!existsSync(inactiveDir)) mkdirSync(inactiveDir, { recursive: true })
      // 复制到活跃目录（默认启用）
      const targetDir = enabled ? activeDir : inactiveDir
      cpSync(defaultSkillPath, join(targetDir, skillSlug), { recursive: true, filter: skillCopyFilter })
      logger.info(`[Pi Agent Skills] 已从 default-skills 复制 Skill 到工作区: ${workspaceSlug}/${skillSlug}`)
      // 如果目标就是启用状态，则已完成；否则需要从活跃移到不活跃
      if (enabled) return
      // 此时 skill 在 activeDir 中，需要移到 inactiveDir
      const newSrcPath = join(activeDir, skillSlug)
      if (existsSync(destPath)) {
        throw new Error(`目标目录已存在同名 Skill: ${skillSlug}`)
      }
      renameSync(newSrcPath, destPath)
      return
    }
    throw new Error(`Skill 不存在: ${skillSlug}`)
  }

  if (existsSync(destPath)) {
    throw new Error(`目标目录已存在同名 Skill: ${skillSlug}`)
  }

  renameSync(srcPath, destPath)
  logger.info(`[Pi Agent Skills] Skill ${enabled ? '启用' : '禁用'}: ${workspaceSlug}/${skillSlug}`)
}

/** 删除工作区 Skill */
export function deleteWorkspaceSkill(workspaceSlug: string, skillSlug: string): void {
  const activePath = join(getWorkspaceSkillsDir(workspaceSlug), skillSlug)
  const inactivePath = join(getInactiveSkillsDir(workspaceSlug), skillSlug)

  const target = existsSync(activePath) ? activePath : existsSync(inactivePath) ? inactivePath : null
  if (!target) {
    throw new Error(`Skill 不存在: ${skillSlug}`)
  }

  rmSync(target, { recursive: true, force: true })
  logger.info(`[Pi Agent Skills] 已删除 Skill: ${workspaceSlug}/${skillSlug}`)
}

/** 读取工作区 Skill 内容 */
export function readWorkspaceSkillContent(workspaceSlug: string, skillSlug: string): string {
  const activePath = join(getWorkspaceSkillsDir(workspaceSlug), skillSlug, 'SKILL.md')
  const inactivePath = join(getInactiveSkillsDir(workspaceSlug), skillSlug, 'SKILL.md')

  const target = existsSync(activePath) ? activePath : existsSync(inactivePath) ? inactivePath : null
  if (!target) {
    throw new Error(`Skill 不存在: ${skillSlug}`)
  }

  return readFileSync(target, 'utf-8')
}

/** 写入工作区 Skill 内容 */
export function writeWorkspaceSkillContent(
  workspaceSlug: string,
  skillSlug: string,
  content: string,
): void {
  const activePath = join(getWorkspaceSkillsDir(workspaceSlug), skillSlug, 'SKILL.md')
  const inactivePath = join(getInactiveSkillsDir(workspaceSlug), skillSlug, 'SKILL.md')

  const dir = existsSync(activePath)
    ? getWorkspaceSkillsDir(workspaceSlug)
    : existsSync(inactivePath)
      ? getInactiveSkillsDir(workspaceSlug)
      : getWorkspaceSkillsDir(workspaceSlug) // 默认写入活跃目录

  const skillDir = join(dir, skillSlug)
  if (!existsSync(skillDir)) {
    mkdirSync(skillDir, { recursive: true })
  }

  const skillMdPath = join(skillDir, 'SKILL.md')
  const { writeFileSync } = require('fs')
  writeFileSync(skillMdPath, content, 'utf-8')
  logger.info(`[Pi Agent Skills] 已写入 Skill 内容: ${workspaceSlug}/${skillSlug}`)
}

/** 新建工作区时复制默认 Skills */
export function copyDefaultSkillsToWorkspace(workspaceSlug: string): void {
  const defaultDir = getDefaultSkillsDir()
  const targetDir = getWorkspaceSkillsDir(workspaceSlug)

  if (!existsSync(defaultDir)) return
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true })
  }

  try {
    const entries = readdirSync(defaultDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const source = join(defaultDir, entry.name)
      const target = join(targetDir, entry.name)
      if (!existsSync(target)) {
        cpSync(source, target, { recursive: true, filter: skillCopyFilter })
      }
    }
    logger.info(`[Pi Agent Skills] 已复制默认 Skills 到工作区: ${workspaceSlug}`)
  } catch (err) {
    logger.warn(`[Pi Agent Skills] 复制默认 Skills 到工作区失败 (${workspaceSlug}):`, err)
  }
}

/** 获取 Skill 目录的绝对路径（优先活跃目录，其次不活跃目录，最后 default-skills） */
function getSkillDir(workspaceSlug: string, skillSlug: string): string | null {
  const activePath = join(getWorkspaceSkillsDir(workspaceSlug), skillSlug)
  const inactivePath = join(getInactiveSkillsDir(workspaceSlug), skillSlug)
  const defaultPath = join(getDefaultSkillsDir(), skillSlug)

  if (existsSync(activePath)) return activePath
  if (existsSync(inactivePath)) return inactivePath
  if (existsSync(defaultPath)) return defaultPath
  return null
}

/** 二进制文件扩展名集合（不需要在详情面板中展示文本内容） */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.tiff',
  '.pdf', '.zip', '.gz', '.tar', '.7z', '.rar',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.mp4', '.avi', '.mov', '.wav',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.db', '.sqlite', '.db-shm', '.db-wal',
])

/** 递归扫描 Skill 目录下的资源文件树（排除 SKILL.md 和 .DS_Store） */
function scanSkillFileTree(dir: string, basePath: string): SkillFileNode[] {
  const nodes: SkillFileNode[] = []

  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return nodes
  }

  // 排序：目录在前，然后按名称排序
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1
    if (!a.isDirectory() && b.isDirectory()) return 1
    return a.name.localeCompare(b.name)
  })

  for (const entry of entries) {
    // 跳过 SKILL.md 和系统文件
    if (entry.name === 'SKILL.md' || entry.name.startsWith('.DS_Store') || entry.name === 'Thumbs.db') continue

    const fullPath = join(dir, entry.name)
    const relPath = relative(basePath, fullPath).replace(/\\/g, '/')

    if (entry.isDirectory()) {
      const children = scanSkillFileTree(fullPath, basePath)
      nodes.push({
        name: entry.name,
        relativePath: relPath,
        type: 'directory',
        children,
      })
    } else {
      let size: number | undefined
      try {
        size = statSync(fullPath).size
      } catch {
        // 忽略 stat 失败
      }
      nodes.push({
        name: entry.name,
        relativePath: relPath,
        type: 'file',
        size,
      })
    }
  }

  return nodes
}

/** 列出 Skill 目录下的资源文件树（排除 SKILL.md） */
export function listSkillFiles(workspaceSlug: string, skillSlug: string): SkillFileNode[] {
  const skillDir = getSkillDir(workspaceSlug, skillSlug)
  if (!skillDir) {
    throw new Error(`Skill 不存在: ${skillSlug}`)
  }
  return scanSkillFileTree(skillDir, skillDir)
}

/** 读取 Skill 目录下的指定资源文件 */
export function readSkillFile(
  workspaceSlug: string,
  skillSlug: string,
  relativePath: string,
): SkillFileContent {
  const skillDir = getSkillDir(workspaceSlug, skillSlug)
  if (!skillDir) {
    throw new Error(`Skill 不存在: ${skillSlug}`)
  }

  const filePath = join(skillDir, relativePath)

  // 安全检查：确保文件在 skill 目录内
  const resolvedPath = require('path').resolve(filePath)
  const resolvedSkillDir = require('path').resolve(skillDir)
  if (!resolvedPath.startsWith(resolvedSkillDir + require('path').sep) && resolvedPath !== resolvedSkillDir) {
    throw new Error('路径越界')
  }

  if (!existsSync(filePath)) {
    throw new Error(`文件不存在: ${relativePath}`)
  }

  const stat = statSync(filePath)
  const ext = extname(filePath).toLowerCase()
  const isBinary = BINARY_EXTENSIONS.has(ext)

  // 二进制文件不返回内容
  if (isBinary) {
    return {
      relativePath,
      isText: false,
      size: stat.size,
    }
  }

  // 文本文件：限制读取大小（超过 1MB 截断）
  const MAX_TEXT_SIZE = 1024 * 1024
  let content: string | undefined
  try {
    if (stat.size <= MAX_TEXT_SIZE) {
      content = readFileSync(filePath, 'utf-8')
    } else {
      // 大文本文件只读取前 1MB
      const buf = Buffer.alloc(MAX_TEXT_SIZE)
      const fd = require('fs').openSync(filePath, 'r')
      require('fs').readSync(fd, buf, 0, MAX_TEXT_SIZE, 0)
      require('fs').closeSync(fd)
      content = buf.toString('utf-8') + '\n\n... (文件过大，仅显示前 1MB)'
    }
  } catch {
    // 读取失败返回空内容
  }

  return {
    relativePath,
    isText: true,
    size: stat.size,
    content,
  }
}
