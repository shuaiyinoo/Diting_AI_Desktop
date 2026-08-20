/**
 * 存储管理服务
 *
 * 提供磁盘用量统计和临时文件清理功能。
 * 移植自 Proma 的 storage-service.ts，适配 Diting 的目录结构。
 * 由设置面板「磁盘管理」Tab 和启动时自动清理逻辑调用。
 */

import { existsSync, statSync, unlinkSync } from 'node:fs'
import { promises as fsPromises } from 'node:fs'
import { join, basename, relative, isAbsolute } from 'node:path'
import { tmpdir } from 'node:os'
import { app } from 'electron'
import { logger } from 'ee-core/log'
import {
  getConfigDir,
  getPiAgentDir,
  getAgentSessionsDir,
  getSdkConfigDir,
  getAgentWorkspacesDir,
  getDefaultSkillsDir,
} from '../components/pi/config-paths'
import { getDataDir } from 'ee-core/ps'

// ─── 类型定义 ───

export type StorageCategoryKey =
  | 'pi-agent'
  | 'agent-sessions'
  | 'sdk-config'
  | 'workspaces'
  | 'default-skills'
  | 'databases'
  | 'logs'
  | 'temp-files'

export interface StorageCategory {
  label: string
  key: StorageCategoryKey
  bytes: number
  count: number
  /** 是否可安全清理 */
  cleanable: boolean
  /** 实际目录路径（用于打开目录） */
  path: string
  /** 展示用路径（如 ~/.diting/...） */
  displayPath: string
}

export interface StorageStats {
  categories: StorageCategory[]
  totalBytes: number
  calculatedAt: number
}

export interface CleanupResult {
  freedBytes: number
  deletedCount: number
  errors: string[]
}

// ─── 工具函数 ───

// 扫描时跳过的已知大型目录，防止超大工作区阻塞主进程事件循环
const SKIP_DIRS = new Set([
  'node_modules', '.next', '.nuxt', '.git', 'dist', 'build',
  '.cache', '__pycache__', '.venv', 'venv', '.tox', 'target', '.gradle',
  '.turbo', '.parcel-cache', '.svelte-kit', '.output',
])

// 单次扫描最大文件数上限，防止超大工作区导致无限递归
const MAX_FILE_SCAN = 100_000

function displayStoragePath(filePath: string): string {
  const configDir = getConfigDir()
  const rel = relative(configDir, filePath)
  if (!rel.startsWith('..') && !isAbsolute(rel)) {
    return `~/${basename(configDir)}/${rel.split(/[\\/]/).join('/')}`
  }
  return filePath
}

async function getDirSize(
  dirPath: string,
  options: { skipTopLevelDirs?: Set<string> } = {}
): Promise<{ bytes: number; count: number }> {
  let bytes = 0
  let count = 0
  if (!existsSync(dirPath)) return { bytes, count }

  const limit = { remaining: MAX_FILE_SCAN }

  async function walk(dir: string, depth: number): Promise<void> {
    try {
      const entries = await fsPromises.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (limit.remaining <= 0) return
        const fullPath = join(dir, entry.name)
        try {
          if (entry.isDirectory()) {
            if (depth === 0 && options.skipTopLevelDirs?.has(entry.name)) continue
            if (SKIP_DIRS.has(entry.name)) continue
            await walk(fullPath, depth + 1)
          } else if (entry.isFile()) {
            const stat = await fsPromises.stat(fullPath)
            bytes += stat.size
            count++
            limit.remaining--
          }
        } catch { /* skip inaccessible */ }
      }
    } catch { /* skip inaccessible dir */ }
  }

  await walk(dirPath, 0)
  return { bytes, count }
}

function safeUnlink(filePath: string): number {
  try {
    const size = statSync(filePath).size
    unlinkSync(filePath)
    return size
  } catch {
    return 0
  }
}

// ─── 统计 ───

async function calcPiAgentCategory(): Promise<StorageCategory> {
  const dir = getPiAgentDir()
  const { bytes, count } = await getDirSize(dir, { skipTopLevelDirs: new Set(['sessions', 'sdk-config', 'workspaces', 'default-skills']) })
  return {
    label: 'Pi Agent 配置',
    key: 'pi-agent',
    bytes, count,
    cleanable: false,
    path: dir,
    displayPath: displayStoragePath(dir),
  }
}

async function calcAgentSessionsCategory(): Promise<StorageCategory> {
  const dir = getAgentSessionsDir()
  const { bytes, count } = await getDirSize(dir)
  return {
    label: 'Agent 会话记录',
    key: 'agent-sessions',
    bytes, count,
    cleanable: false,
    path: dir,
    displayPath: displayStoragePath(dir),
  }
}

async function calcSdkConfigCategory(): Promise<StorageCategory> {
  const dir = getSdkConfigDir()
  const { bytes, count } = await getDirSize(dir)
  return {
    label: 'SDK 会话数据',
    key: 'sdk-config',
    bytes, count,
    cleanable: false,
    path: dir,
    displayPath: displayStoragePath(dir),
  }
}

async function calcWorkspacesCategory(): Promise<StorageCategory> {
  const dir = getAgentWorkspacesDir()
  const { bytes, count } = await getDirSize(dir)
  return {
    label: '项目与会话数据',
    key: 'workspaces',
    bytes, count,
    cleanable: false,
    path: dir,
    displayPath: displayStoragePath(dir),
  }
}

async function calcDefaultSkillsCategory(): Promise<StorageCategory> {
  const dir = getDefaultSkillsDir()
  const { bytes, count } = await getDirSize(dir)
  return {
    label: '默认 Skills',
    key: 'default-skills',
    bytes, count,
    cleanable: false,
    path: dir,
    displayPath: displayStoragePath(dir),
  }
}

async function calcDatabasesCategory(): Promise<StorageCategory> {
  const dir = join(getDataDir(), 'db')
  const { bytes, count } = await getDirSize(dir)
  return {
    label: '数据库文件',
    key: 'databases',
    bytes, count,
    cleanable: false,
    path: dir,
    displayPath: dir,
  }
}

async function calcLogsCategory(): Promise<StorageCategory> {
  const dir = join(getDataDir(), 'logs')
  const { bytes, count } = await getDirSize(dir)
  return {
    label: '日志文件',
    key: 'logs',
    bytes, count,
    cleanable: true,
    path: dir,
    displayPath: dir,
  }
}

async function calcTempFilesCategory(): Promise<StorageCategory> {
  const previewDir = join(tmpdir(), 'diting-preview')
  const installerDir = join(app.getPath('temp'), 'diting-installers')
  const [preview, installer] = await Promise.all([
    getDirSize(previewDir),
    getDirSize(installerDir),
  ])
  return {
    label: '临时预览/安装文件',
    key: 'temp-files',
    bytes: preview.bytes + installer.bytes,
    count: preview.count + installer.count,
    cleanable: true,
    path: previewDir,
    displayPath: previewDir,
  }
}

export async function calculateStorageStats(): Promise<StorageStats> {
  const categories = await Promise.all([
    calcPiAgentCategory(),
    calcAgentSessionsCategory(),
    calcSdkConfigCategory(),
    calcWorkspacesCategory(),
    calcDefaultSkillsCategory(),
    calcDatabasesCategory(),
    calcLogsCategory(),
    calcTempFilesCategory(),
  ])
  return {
    categories,
    totalBytes: categories.reduce((sum, c) => sum + c.bytes, 0),
    calculatedAt: Date.now(),
  }
}

// ─── 清理 ───

export async function cleanupTempFiles(): Promise<CleanupResult> {
  let freedBytes = 0, deletedCount = 0
  const errors: string[] = []

  const previewDir = join(tmpdir(), 'diting-preview')
  if (existsSync(previewDir)) {
    try {
      const files = await fsPromises.readdir(previewDir)
      for (const file of files) {
        const freed = safeUnlink(join(previewDir, file))
        if (freed > 0) { freedBytes += freed; deletedCount++ }
      }
    } catch (e) {
      errors.push(`清理预览文件失败: ${e}`)
    }
  }

  const installerDir = join(app.getPath('temp'), 'diting-installers')
  if (existsSync(installerDir)) {
    try {
      const files = await fsPromises.readdir(installerDir)
      for (const file of files) {
        const freed = safeUnlink(join(installerDir, file))
        if (freed > 0) { freedBytes += freed; deletedCount++ }
      }
    } catch (e) {
      errors.push(`清理安装文件失败: ${e}`)
    }
  }

  if (freedBytes > 0) {
    logger.info(`[存储清理] 临时文件: 释放 ${(freedBytes / 1024 / 1024).toFixed(1)} MB, 删除 ${deletedCount} 个文件`)
  }
  return { freedBytes, deletedCount, errors }
}

export async function cleanupLogs(): Promise<CleanupResult> {
  let freedBytes = 0, deletedCount = 0
  const errors: string[] = []

  const dir = join(getDataDir(), 'logs')
  if (!existsSync(dir)) return { freedBytes, deletedCount, errors }

  try {
    const files = await fsPromises.readdir(dir)
    for (const file of files) {
      // 保留当前日志文件（当天），仅清理历史日志
      const filePath = join(dir, file)
      try {
        const stat = await fsPromises.stat(filePath)
        if (stat.isFile()) {
          const freed = safeUnlink(filePath)
          if (freed > 0) { freedBytes += freed; deletedCount++ }
        }
      } catch { /* skip */ }
    }
  } catch (e) {
    errors.push(`清理日志文件失败: ${e}`)
  }

  if (freedBytes > 0) {
    logger.info(`[存储清理] 日志文件: 释放 ${(freedBytes / 1024 / 1024).toFixed(1)} MB, 删除 ${deletedCount} 个文件`)
  }
  return { freedBytes, deletedCount, errors }
}

export interface CleanupOptions {
  categories: StorageCategoryKey[]
}

export async function cleanupStorage(options: CleanupOptions): Promise<CleanupResult> {
  let totalFreed = 0, totalDeleted = 0
  const allErrors: string[] = []

  const merge = (r: CleanupResult) => {
    totalFreed += r.freedBytes
    totalDeleted += r.deletedCount
    allErrors.push(...r.errors)
  }

  for (const cat of options.categories) {
    switch (cat) {
      case 'temp-files':
        merge(await cleanupTempFiles())
        break
      case 'logs':
        merge(await cleanupLogs())
        break
      // 其他类别暂不支持清理
    }
  }

  if (totalFreed > 0) {
    logger.info(`[存储清理] 总计释放 ${(totalFreed / 1024 / 1024).toFixed(1)} MB, 删除 ${totalDeleted} 项`)
  }
  return { freedBytes: totalFreed, deletedCount: totalDeleted, errors: allErrors }
}
