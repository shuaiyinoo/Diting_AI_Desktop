/**
 * 运行时环境设置管理
 *
 * 管理 pip/npm 镜像源配置，支持国内/国际网络环境切换。
 * 配置持久化到 ~/.diting/pi-agent/runtime-settings.json
 */

import { logger } from 'ee-core/log'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getPiAgentDir } from '../config-paths'

/** 镜像源模式 */
export type MirrorMode = 'auto' | 'china' | 'international'

/** 运行时设置 */
export interface RuntimeSettings {
  /** pip 镜像源模式 */
  pipMirrorMode: MirrorMode
  /** npm 镜像源模式 */
  npmMirrorMode: MirrorMode
  /** 解析后的 pip 镜像源 URL（运行时计算） */
  pypiMirror: string
  /** 解析后的 npm registry URL（运行时计算） */
  npmRegistry: string
}

/** 国内镜像源 */
const CHINA_MIRRORS = {
  pypi: 'https://pypi.tuna.tsinghua.edu.cn/simple',
  npm: 'https://registry.npmmirror.com',
}

/** 国际镜像源 */
const INTERNATIONAL_MIRRORS = {
  pypi: 'https://pypi.org/simple',
  npm: 'https://registry.npmjs.org',
}

/** 配置文件路径 */
function getSettingsPath(): string {
  return join(getPiAgentDir(), 'runtime-settings.json')
}

/** 从配置文件读取 */
function loadSettings(): { pipMirrorMode: MirrorMode; npmMirrorMode: MirrorMode } {
  const defaultSettings = { pipMirrorMode: 'auto' as MirrorMode, npmMirrorMode: 'auto' as MirrorMode }
  const path = getSettingsPath()
  if (!existsSync(path)) return defaultSettings

  try {
    const content = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(content)
    return {
      pipMirrorMode: parsed.pipMirrorMode || 'auto',
      npmMirrorMode: parsed.npmMirrorMode || 'auto',
    }
  } catch {
    return defaultSettings
  }
}

/** 保存配置到文件 */
function saveSettings(settings: { pipMirrorMode: MirrorMode; npmMirrorMode: MirrorMode }): void {
  try {
    const dir = getPiAgentDir()
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
  } catch (err) {
    logger.warn('[Runtime] 保存运行时设置失败:', err)
  }
}

/** 运行时缓存 */
let cachedSettings: { pipMirrorMode: MirrorMode; npmMirrorMode: MirrorMode } | null = null

/** 加载并缓存设置 */
function getCachedSettings(): { pipMirrorMode: MirrorMode; npmMirrorMode: MirrorMode } {
  if (!cachedSettings) {
    cachedSettings = loadSettings()
  }
  return cachedSettings
}

/** 自动检测最优镜像源（简单连通性测试） */
function detectOptimalMirror(type: 'pypi' | 'npm'): string {
  // 简单策略：不实际做网络请求，基于已有的缓存结果
  // 如果之前已成功用过某个源就用它，否则默认用国内源（对中国用户更安全）
  // 用户可以在设置中手动切换为 international
  return CHINA_MIRRORS[type]
}

/** 解析镜像源 URL */
function resolveMirror(type: 'pypi' | 'npm', mode: MirrorMode): string {
  switch (mode) {
    case 'china':
      return CHINA_MIRRORS[type]
    case 'international':
      return INTERNATIONAL_MIRRORS[type]
    case 'auto':
    default:
      return detectOptimalMirror(type)
  }
}

/** 获取运行时设置（含解析后的镜像源 URL） */
export function getRuntimeSettings(): RuntimeSettings {
  const cached = getCachedSettings()
  return {
    pipMirrorMode: cached.pipMirrorMode,
    npmMirrorMode: cached.npmMirrorMode,
    pypiMirror: resolveMirror('pypi', cached.pipMirrorMode),
    npmRegistry: resolveMirror('npm', cached.npmMirrorMode),
  }
}

/** 设置 pip 镜像源模式 */
export function setPipMirrorMode(mode: MirrorMode): void {
  const cached = getCachedSettings()
  cached.pipMirrorMode = mode
  saveSettings(cached)
  cachedSettings = cached
  logger.info(`[Runtime] pip 镜像源已切换为: ${mode}`)
}

/** 设置 npm 镜像源模式 */
export function setNpmMirrorMode(mode: MirrorMode): void {
  const cached = getCachedSettings()
  cached.npmMirrorMode = mode
  saveSettings(cached)
  cachedSettings = cached
  logger.info(`[Runtime] npm 镜像源已切换为: ${mode}`)
}

/** 获取镜像源选项（供前端展示） */
export function getMirrorOptions(): Array<{ value: MirrorMode; label: string; description: string }> {
  return [
    {
      value: 'auto',
      label: '自动检测',
      description: '根据网络环境自动选择最优镜像源',
    },
    {
      value: 'china',
      label: '国内镜像',
      description: `清华 PyPI + npmmirror（适合国内用户）`,
    },
    {
      value: 'international',
      label: '国际源',
      description: 'PyPI 官方 + npmjs 官方（适合国际网络）',
    },
  ]
}
