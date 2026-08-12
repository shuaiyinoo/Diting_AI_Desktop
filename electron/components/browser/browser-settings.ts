/**
 * 受管浏览器设置（风险告知持久化）
 *
 * 参考 Diting 的 builtin-mcp/settings.ts 模式，
 * 使用 ~/.diting/pi-agent/browser-settings.json 持久化。
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { logger } from 'ee-core/log'

/** 风险告知版本；内容变更时递增以使旧确认失效。 */
const BROWSER_RISK_DISCLAIMER_VERSION = 1

/** 设置文件路径 */
function getSettingsFilePath(): string {
  const dir = join(homedir(), '.diting', 'pi-agent')
  if (!existsSync(dir)) {
    try {
      mkdirSync(dir, { recursive: true })
    } catch {
      // 目录可能已被其他进程创建，忽略
    }
  }
  return join(dir, 'browser-settings.json')
}

interface BrowserSettings {
  browserRiskDisclaimerVersion?: number
}

/** 判断用户是否已确认风险告知 */
export function hasAcknowledgedBrowserRiskDisclaimer(): boolean {
  try {
    const filePath = getSettingsFilePath()
    if (!existsSync(filePath)) return false
    const settings: BrowserSettings = JSON.parse(readFileSync(filePath, 'utf-8'))
    return (settings.browserRiskDisclaimerVersion ?? 0) >= BROWSER_RISK_DISCLAIMER_VERSION
  } catch {
    return false
  }
}

/** 持久化风险告知确认 */
export function acknowledgeBrowserRiskDisclaimer(): void {
  try {
    const filePath = getSettingsFilePath()
    const settings: BrowserSettings = {
      browserRiskDisclaimerVersion: BROWSER_RISK_DISCLAIMER_VERSION,
    }
    writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8')
    logger.info('[受管浏览器] 风险告知已确认并持久化')
  } catch (err) {
    logger.error('[受管浏览器] 保存风险告知确认失败:', err)
  }
}
