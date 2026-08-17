/**
 * 运行时环境管理器
 *
 * 负责解析内嵌的 Python / Node.js / Git 可执行路径，并提供可用性检测。
 * - Node.js：复用 Electron 自身运行时（process.execPath + ELECTRON_RUN_AS_NODE=1）
 * - Python：通过 python-build-standalone 预置，打包在 extraResources/python-runtime/ 中
 * - Git：检测宿主机 Git 可执行文件路径（无内嵌版本，因 Git 依赖复杂）
 *
 * 优先使用内嵌运行时；若不可用则回退到宿主机环境。
 *
 * 关键：Electron 可执行文件默认以「应用模式」启动（会打开窗口），
 * 必须设置 ELECTRON_RUN_AS_NODE=1 才能以纯 Node.js 模式运行脚本。
 * 这是 VS Code、Cursor 等所有 Electron 应用的标准做法。
 * 该环境变量对普通 node 二进制文件无影响（仅被 Electron 入口检测），所以始终安全。
 */

import { app } from 'electron'
import { join } from 'path'
import { existsSync, chmodSync } from 'fs'
import { platform, arch } from 'os'
import { logger } from 'ee-core/log'
import { getRuntimeSettings } from './runtime-settings'

/** 平台标识 */
type Platform = 'darwin' | 'win32' | 'linux'

/** 获取当前平台 */
function currentPlatform(): Platform {
  return platform() as Platform
}

/** 获取当前架构（归一化） */
function currentArch(): string {
  const a = arch()
  // macOS arm64
  if (a === 'arm64') return 'arm64'
  // x64
  return 'x64'
}

/**
 * 获取内嵌 Python runtime 根目录
 *
 * 打包后：process.resourcesPath/python-runtime/
 * 开发模式：项目根/build/extraResources/python-runtime/
 */
export function getBundledPythonRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'python-runtime')
  }
  const baseDir = app.getAppPath ? app.getAppPath() : process.cwd()
  return join(baseDir, 'build', 'extraResources', 'python-runtime')
}

/**
 * 获取内嵌 Python 可执行文件路径
 *
 * macOS/Linux: <root>/bin/python3
 * Windows:     <root>/python.exe
 */
export function getBundledPythonPath(): string {
  const root = getBundledPythonRoot()
  if (currentPlatform() === 'win32') {
    return join(root, 'python.exe')
  }
  return join(root, 'bin', 'python3')
}

/**
 * 获取 Node.js 可执行文件路径
 *
 * 复用 Electron 自身运行时（process.execPath）。
 * 注意：必须配合 ELECTRON_RUN_AS_NODE=1 环境变量使用（见 buildNodeEnv()），
 * 否则会启动新的 Electron 窗口而非执行脚本。
 */
export function getBundledNodePath(): string {
  return process.execPath
}

/**
 * 获取内嵌 Python 的 site-packages 目录
 *
 * 预安装的第三方包存放在此目录。
 */
export function getBundledSitePackages(): string {
  return join(getBundledPythonRoot(), 'site-packages')
}

/** 检测内嵌 Python 是否可用 */
export function isBundledPythonAvailable(): boolean {
  return existsSync(getBundledPythonPath())
}

/** 检测 Node.js（Electron 自身）是否可用 —— 永远为 true */
export function isBundledNodeAvailable(): boolean {
  return existsSync(getBundledNodePath())
}

/**
 * 尝试在宿主机上查找 Python 可执行文件
 *
 * 回退路径：当内嵌 Python 不可用时使用。
 */
export function findHostPython(): string | null {
  const candidates =
    currentPlatform() === 'win32'
      ? ['python3.exe', 'python.exe', 'python3', 'python']
      : ['python3', 'python']

  // 简单依赖 PATH 查找
  const { execSync } = require('node:child_process') as { execSync: (cmd: string, opts?: { encoding?: string }) => string }
  for (const cmd of candidates) {
    try {
      const path = execSync(`which ${cmd} 2>/dev/null || where ${cmd} 2>nul`, {
        encoding: 'utf-8',
      }).trim().split('\n')[0]?.trim()
      if (path) return path
    } catch {
      // 继续尝试下一个
    }
  }
  return null
}

/**
 * 尝试在宿主机上查找 Node.js 可执行文件
 *
 * 回退路径：当内嵌 Node.js 不可用时使用（理论上不会发生，因为 Electron 自带 Node.js）。
 */
export function findHostNode(): string | null {
  const candidates = currentPlatform() === 'win32' ? ['node.exe', 'node'] : ['node']
  const { execSync } = require('node:child_process') as { execSync: (cmd: string, opts?: { encoding?: string }) => string }
  for (const cmd of candidates) {
    try {
      const path = execSync(`which ${cmd} 2>/dev/null || where ${cmd} 2>nul`, {
        encoding: 'utf-8',
      }).trim().split('\n')[0]?.trim()
      if (path) return path
    } catch {
      // 继续尝试
    }
  }
  return null
}

/**
 * 尝试在宿主机上查找 Git 可执行文件
 *
 * Git 没有内嵌版本（依赖复杂，不适合打包），始终从宿主机检测。
 * Windows 下额外检查常见安装路径（Program Files、AppData）。
 */
export function findHostGit(): string | null {
  const candidates = currentPlatform() === 'win32' ? ['git.exe', 'git'] : ['git']
  const { execSync } = require('node:child_process') as { execSync: (cmd: string, opts?: { encoding?: string }) => string }
  for (const cmd of candidates) {
    try {
      const path = execSync(`which ${cmd} 2>/dev/null || where ${cmd} 2>nul`, {
        encoding: 'utf-8',
      }).trim().split('\n')[0]?.trim()
      if (path) return path
    } catch {
      // 继续尝试
    }
  }

  // Windows 额外检查常见安装路径
  if (currentPlatform() === 'win32') {
    const { existsSync } = require('fs')
    const winCandidates = [
      'C:\\Program Files\\Git\\bin\\git.exe',
      'C:\\Program Files (x86)\\Git\\bin\\git.exe',
      'C:\\Program Files\\Git\\cmd\\git.exe',
    ]
    for (const p of winCandidates) {
      if (existsSync(p)) return p
    }
  }

  return null
}

/** 运行时解析结果 */
export interface RuntimeResolveResult {
  /** 实际使用的可执行路径 */
  path: string
  /** 来源：bundled（内嵌）| host（宿主机） */
  source: 'bundled' | 'host'
  /** 是否可用 */
  available: boolean
}

/**
 * 解析 Python 运行时
 *
 * 优先使用内嵌 Python；不可用时回退到宿主机。
 */
export function resolvePythonRuntime(): RuntimeResolveResult {
  const bundledPath = getBundledPythonPath()
  if (existsSync(bundledPath)) {
    // 确保 macOS/Linux 有可执行权限
    if (currentPlatform() !== 'win32') {
      try {
        chmodSync(bundledPath, 0o755)
      } catch {
        // 忽略权限修改失败
      }
    }
    return { path: bundledPath, source: 'bundled', available: true }
  }

  // 回退到宿主机
  const hostPath = findHostPython()
  if (hostPath) {
    logger.info(`[Runtime] 内嵌 Python 不可用，回退到宿主机: ${hostPath}`)
    return { path: hostPath, source: 'host', available: true }
  }

  logger.warn('[Runtime] Python 运行时不可用：内嵌缺失且宿主机未安装')
  return { path: '', source: 'host', available: false }
}

/**
 * 解析 Node.js 运行时
 *
 * Electron 自身即为 Node.js 运行时（配合 ELECTRON_RUN_AS_NODE=1），永远可用。
 * 回退到宿主机 node 时，ELECTRON_RUN_AS_NODE=1 对普通 node 无影响，仍然安全。
 */
export function resolveNodeRuntime(): RuntimeResolveResult {
  const nodePath = getBundledNodePath()
  if (existsSync(nodePath)) {
    return { path: nodePath, source: 'bundled', available: true }
  }

  // 极端情况：回退到宿主机
  const hostPath = findHostNode()
  if (hostPath) {
    logger.info(`[Runtime] Electron Node.js 不可用，回退到宿主机: ${hostPath}`)
    return { path: hostPath, source: 'host', available: true }
  }

  logger.warn('[Runtime] Node.js 运行时不可用')
  return { path: '', source: 'host', available: false }
}

/**
 * 解析 Git 运行时
 *
 * Git 没有内嵌版本（依赖复杂，不适合打包），始终从宿主机检测。
 * 如果宿主机未安装 Git，返回不可用。
 */
export function resolveGitRuntime(): RuntimeResolveResult {
  const gitPath = findHostGit()
  if (gitPath) {
    return { path: gitPath, source: 'host', available: true }
  }

  logger.warn('[Runtime] Git 不可用：宿主机未安装 Git')
  return { path: '', source: 'host', available: false }
}

/**
 * 构建 Python 子进程环境变量
 *
 * 注入 PYTHONPATH 让内嵌 Python 能找到预装包。
 */
export function buildPythonEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env as Record<string, string> }

  // 内嵌 Python 时注入 site-packages 路径
  if (isBundledPythonAvailable()) {
    const sitePackages = getBundledSitePackages()
    if (existsSync(sitePackages)) {
      const existing = env.PYTHONPATH || ''
      env.PYTHONPATH = existing
        ? `${sitePackages}:${existing}`
        : sitePackages
    }
  }

  // 镜像源设置
  const settings = getRuntimeSettings()
  if (settings.pypiMirror) {
    env.PIP_INDEX_URL = settings.pypiMirror
    env.PIP_TRUSTED_HOST = new URL(settings.pypiMirror).host
  }

  return env
}

/**
 * 构建 Node.js 子进程环境变量
 *
 * 关键：注入 ELECTRON_RUN_AS_NODE=1，让 Electron 可执行文件以纯 Node.js 模式运行，
 * 而非启动一个新的 Electron 窗口。
 * 该环境变量对普通 node 二进制文件无影响，所以无论内嵌还是宿主机都安全。
 * 同时注入 npm 镜像源设置。
 */
export function buildNodeEnv(): Record<string, string> {
  const env: Record<string, string> = { ...process.env as Record<string, string> }

  // 关键：让 Electron 以纯 Node.js 模式运行，不打开窗口
  env.ELECTRON_RUN_AS_NODE = '1'

  const settings = getRuntimeSettings()
  if (settings.npmRegistry) {
    env.npm_config_registry = settings.npmRegistry
  }

  return env
}

/**
 * 构建 Git 子进程环境变量
 *
 * 继承宿主机环境变量，Git 需要 PATH、HOME、SSH 等环境变量正常工作。
 */
export function buildGitEnv(): Record<string, string> {
  return { ...process.env as Record<string, string> }
}

/**
 * 获取运行时状态摘要（供前端展示和系统提示词使用）
 */
export function getRuntimeSummary(): {
  python: RuntimeResolveResult & { version?: string }
  node: RuntimeResolveResult & { version?: string }
  git: RuntimeResolveResult & { version?: string }
} {
  const python = resolvePythonRuntime()
  const node = resolveNodeRuntime()
  const git = resolveGitRuntime()

  return {
    python,
    node,
    git,
  }
}
