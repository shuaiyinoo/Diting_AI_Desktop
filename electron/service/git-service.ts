/**
 * Git 服务（基于 simple-git）
 *
 * 统一封装 Git 状态查询能力，替代旧的手动 execSync + JSON 缓存方案。
 * - 实时调用，无缓存延迟
 * - 不在用户项目创建 .diting/git-status.json 副作用文件
 * - 结构化返回，无需手动解析 porcelain 格式
 */

import { simpleGit } from 'simple-git'
import type { StatusResult, FileStatusResult } from 'simple-git'
import { logger } from 'ee-core/log'

/**
 * 简化的文件状态码
 * - untracked: 未跟踪（新文件）
 * - added: 已暂存新增
 * - modified: 已修改
 * - deleted: 已删除
 * - staged: 已暂存（非新增的暂存修改）
 * - renamed: 已重命名
 * - copied: 已复制
 */
export type GitFileStatus = 'untracked' | 'added' | 'modified' | 'deleted' | 'staged' | 'renamed' | 'copied'

/** 返回给前端的文件 → 状态映射 */
export interface GitStatusMapResult {
  isGitRepo: boolean
  /** 路径 → 状态码（相对于仓库根目录） */
  statusMap: Record<string, GitFileStatus>
  /** 当前分支名 */
  currentBranch: string | null
  /** 跟踪的远程分支 */
  trackingBranch: string | null
  /** 领先远程的提交数 */
  ahead: number
  /** 落后远程的提交数 */
  behind: number
  /** 工作区是否干净 */
  isClean: boolean
}

/**
 * 检测目录是否是 Git 仓库
 */
export async function isGitRepo(dirPath: string): Promise<boolean> {
  try {
    const git = simpleGit(dirPath)
    return await git.checkIsRepo()
  } catch {
    return false
  }
}

/**
 * 获取目录的 Git 状态映射表（实时，无缓存）
 *
 * @param dirPath 仓库根目录的绝对路径
 * @returns 结构化状态结果，非 Git 仓库返回 isGitRepo=false
 */
export async function getGitStatus(dirPath: string): Promise<GitStatusMapResult> {
  try {
    const git = simpleGit(dirPath)
    const isRepo = await git.checkIsRepo()
    if (!isRepo) {
      return {
        isGitRepo: false,
        statusMap: {},
        currentBranch: null,
        trackingBranch: null,
        ahead: 0,
        behind: 0,
        isClean: true,
      }
    }

    const status: StatusResult = await git.status()

    const statusMap: Record<string, GitFileStatus> = {}

    // 遍历所有文件条目，将 XY 状态码映射为简化状态
    for (const file of status.files) {
      const status = parseFileStatus(file)
      if (status) {
        statusMap[file.path] = status
      }
    }

    return {
      isGitRepo: true,
      statusMap,
      currentBranch: status.current,
      trackingBranch: status.tracking,
      ahead: status.ahead,
      behind: status.behind,
      isClean: status.isClean(),
    }
  } catch (err) {
    logger.warn('[GitService] 获取 Git 状态失败:', err)
    return {
      isGitRepo: false,
      statusMap: {},
      currentBranch: null,
      trackingBranch: null,
      ahead: 0,
      behind: 0,
      isClean: true,
    }
  }
}

/**
 * 将 simple-git 的 FileStatusResult（index + working_dir）映射为简化状态码
 *
 * XY 状态码参考：https://git-scm.com/docs/git-status#_short_format
 */
function parseFileStatus(file: FileStatusResult): GitFileStatus | null {
  const x = file.index
  const y = file.working_dir

  // 未跟踪
  if (x === '?' && y === '?') {
    return 'untracked'
  }
  // 已暂存新增
  if (x === 'A' || y === 'A') {
    return 'added'
  }
  // 已删除
  if (x === 'D' || y === 'D') {
    return 'deleted'
  }
  // 已重命名
  if (x === 'R' || y === 'R') {
    return 'renamed'
  }
  // 已复制
  if (x === 'C' || y === 'C') {
    return 'copied'
  }
  // 已修改
  if (x === 'M' || y === 'M') {
    // 如果 index 是 M 且 working_dir 是空格/M，区分暂存和未暂存
    if (x === 'M' && (y === ' ' || y === 'M')) {
      return 'modified'
    }
    return 'modified'
  }
  // 已暂存（T = 类型变更等）
  if (x !== ' ' && x !== '?') {
    return 'staged'
  }

  return 'modified'
}

/**
 * 将 GitStatusMapResult 转换为前端文件面板需要的格式
 *
 * 返回一个路径 → 状态的 Record，保持与旧接口兼容
 */
export function gitStatusToRecord(result: GitStatusMapResult): Record<string, string> {
  if (!result.isGitRepo) return {}
  return result.statusMap
}

/**
 * 获取文件的 diff 输出
 *
 * @param dirPath 仓库根目录
 * @param filePath 文件相对路径（可选，不传则获取整个仓库 diff）
 */
export async function getFileDiff(dirPath: string, filePath?: string): Promise<string> {
  try {
    const git = simpleGit(dirPath)
    if (filePath) {
      return await git.diff(['--', filePath])
    }
    return await git.diff()
  } catch (err) {
    logger.warn('[GitService] 获取 diff 失败:', err)
    return ''
  }
}

/**
 * 获取提交历史
 *
 * @param dirPath 仓库根目录
 * @param maxCount 最大返回条数
 */
export async function getLog(dirPath: string, maxCount = 20): Promise<string> {
  try {
    const git = simpleGit(dirPath)
    const log = await git.log({ maxCount })
    return log.all
      .map((entry) => `${entry.hash.substring(0, 8)} ${entry.date} ${entry.message}`)
      .join('\n')
  } catch (err) {
    logger.warn('[GitService] 获取日志失败:', err)
    return ''
  }
}
