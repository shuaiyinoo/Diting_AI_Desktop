/**
 * Skills 市场控制器
 *
 * 基于 skills.sh 公开 API 提供 Skills 市场的 IPC 接口：
 *   - search：搜索 Skills
 *   - getTop20：获取热门 Top 100 Skills
 *   - getTopics：获取 Topic 分组列表
 *   - getDetail：获取 Skill 详情（含 SKILL.md 原文和完整文件列表）
 *   - installToAll：下载并安装 Skill 到内置目录 + 所有工作区
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, dirname, isAbsolute, resolve, relative } from 'path'
import { logger } from 'ee-core/log'
import {
  searchSkills,
  getPopularSkills,
  getSkillDetail,
  downloadSkillFiles,
  getTopics,
  type SkillSummary,
  type SkillDetail,
} from '../service/skillHubClient'
import {
  getAgentWorkspacesDir,
  getWorkspaceSkillsDir,
  getDefaultSkillsDir,
} from '../components/pi/config-paths'
import { readdirSync, cpSync, rmSync } from 'fs'

/** 市场 Skill 精简信息 */
interface MarketSkillSummary {
  id: string
  name: string
  slug: string
  source: string
  installs: number
  repo_url: string
}

/** Skill 详情返回结构 */
interface MarketSkillDetail {
  id: string
  name: string
  slug: string
  source: string
  installs: number
  repo_url: string
  skill_md_raw: string | null
  fileCount: number
  files: Array<{ path: string; contents: string }>
}

/** 安装到本地结果 */
interface InstallLocalResult {
  slug: string
  name: string
  fileCount: number
  workspaceCount: number
}

/** 下载文件结构 */
interface DownloadFile {
  path: string
  contents: string
}

class SkillHubController {
  /**
   * 搜索 Skills
   */
  async search(args: {
    query: string
    limit?: number
  }): Promise<{ code: number; message?: string; data?: MarketSkillSummary[] }> {
    try {
      const results = await searchSkills(args.query, args.limit ?? 20)

      const summaries: MarketSkillSummary[] = results.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        source: s.source,
        installs: s.installs,
        repo_url: s.repo_url,
      }))

      return { code: 0, data: summaries }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[SkillsMarket] 搜索失败:', err)
      return { code: -1, message: msg }
    }
  }

  /**
   * 获取热门 Top 100 Skills
   */
  async getTop20(): Promise<{ code: number; message?: string; data?: MarketSkillSummary[] }> {
    try {
      const skills = await getPopularSkills(100)

      const summaries: MarketSkillSummary[] = skills.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        source: s.source,
        installs: s.installs,
        repo_url: s.repo_url,
      }))

      return { code: 0, data: summaries }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[SkillsMarket] 获取Top100失败:', err)
      return { code: -1, message: msg }
    }
  }

  /**
   * 获取 Topic 分组列表
   *
   * skills.sh 没有 topic API，数据从官方页面提取。
   */
  async getTopics(): Promise<{ code: number; message?: string; data?: Array<{ slug: string; title: string; description: string; skillCount: number; skillIds: string[] }> }> {
    try {
      const topics = getTopics()
      return { code: 0, data: topics }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[SkillsMarket] 获取Topic列表失败:', err)
      return { code: -1, message: msg }
    }
  }

  /**
   * 获取 Skill 详情（含 SKILL.md 原文和完整文件列表）
   *
   * 调用 skills.sh /api/download 端点获取所有文件内容。
   */
  async getDetail(args: {
    skillId: string
  }): Promise<{ code: number; message?: string; data?: MarketSkillDetail }> {
    try {
      const detail = await getSkillDetail(args.skillId)

      const result: MarketSkillDetail = {
        id: detail.id,
        name: detail.slug,
        slug: detail.slug,
        source: detail.source,
        installs: detail.installs,
        repo_url: `https://github.com/${detail.source}`,
        skill_md_raw: detail.skill_md_raw,
        fileCount: detail.files.length,
        files: detail.files.map((f) => ({ path: f.path, contents: f.contents })),
      }

      return { code: 0, data: result }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[SkillsMarket] 获取详情失败:', err)
      return { code: -1, message: msg }
    }
  }

  /**
   * 安装到本地（内置 default-skills 目录 + 所有工作区）
   *
   * 1. 从 skills.sh 下载 skill 完整文件列表
   * 2. 写入到 ~/.diting/pi-agent/default-skills/<slug>/ 目录
   * 3. 复制到所有工作区的 skills/ 目录
   */
  async installToAll(args: {
    skillId: string
  }): Promise<{ code: number; message?: string; data?: InstallLocalResult }> {
    try {
      const { skillId } = args

      // 下载 skill 文件
      const { files, hash } = await downloadSkillFiles(skillId)

      if (files.length === 0) {
        return { code: -1, message: '下载的 Skill 不包含任何文件' }
      }

      // 从 skillId 中解析 slug（owner/repo/slug → slug）
      const slug = skillId.split('/').pop() || skillId

      logger.info(`[SkillsMarket] 下载完成: ${skillId} (${files.length} 个文件, hash=${hash?.slice(0, 12) ?? 'null'})`)

      // 写入到内置 default-skills 目录
      const defaultSkillsDir = getDefaultSkillsDir()
      const skillDir = join(defaultSkillsDir, slug)

      // 如果目标已存在，先删除再安装（覆盖更新）
      if (existsSync(skillDir)) {
        rmSync(skillDir, { recursive: true, force: true })
      }

      mkdirSync(skillDir, { recursive: true })

      let fileCount = 0
      for (const file of files) {
        this.writeInstallFile(skillDir, file)
        fileCount++
      }

      logger.info(`[SkillsMarket] 已安装到内置目录: ${slug} (${fileCount} 个文件)`)

      // 复制到所有工作区
      const workspaces = this.getAllWorkspaceSlugs()
      for (const wsSlug of workspaces) {
        try {
          const wsSkillsDir = getWorkspaceSkillsDir(wsSlug)
          const wsSkillDir = join(wsSkillsDir, slug)

          if (!existsSync(wsSkillsDir)) {
            mkdirSync(wsSkillsDir, { recursive: true })
          }

          if (existsSync(wsSkillDir)) {
            rmSync(wsSkillDir, { recursive: true, force: true })
          }

          cpSync(skillDir, wsSkillDir, { recursive: true })
          logger.info(`[SkillsMarket] 已复制到工作区: ${slug} → ${wsSlug}`)
        } catch (err) {
          logger.warn(`[SkillsMarket] 复制到工作区失败 (${wsSlug}):`, err)
        }
      }

      return {
        code: 0,
        data: {
          slug,
          name: slug,
          fileCount,
          workspaceCount: workspaces.length,
        },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error(`[SkillsMarket] 安装到本地失败 (${args.skillId}):`, err)
      return { code: -1, message: msg }
    }
  }

  // ===== 内部方法 =====

  /**
   * 获取所有工作区的 slug 列表
   */
  private getAllWorkspaceSlugs(): string[] {
    const workspacesDir = getAgentWorkspacesDir()
    if (!existsSync(workspacesDir)) return []

    try {
      return readdirSync(workspacesDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    } catch {
      return []
    }
  }

  /**
   * 安全写入安装文件到 Skill 目录
   *
   * 防护措施：
   * - 路径遍历防护：禁止绝对路径和 .. 相对路径
   * - 自动创建父目录
   */
  private writeInstallFile(skillDir: string, file: DownloadFile): void {
    // 安全检查：禁止绝对路径和路径遍历
    if (isAbsolute(file.path) || file.path.includes('..')) {
      throw new Error(`非法文件路径: ${file.path}`)
    }

    const targetPath = resolve(skillDir, file.path)
    const rel = relative(resolve(skillDir), targetPath)

    // 再次校验：确保文件在 skill 目录内
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`文件路径逃逸出 Skill 目录: ${file.path}`)
    }

    // 自动创建父目录
    const parentDir = dirname(targetPath)
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true })
    }

    // 写入文件
    writeFileSync(targetPath, file.contents, 'utf8')
  }
}

export default SkillHubController
