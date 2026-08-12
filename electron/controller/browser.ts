/**
 * 内置浏览器 IPC 控制器
 *
 * ee-core controller 模式，自动注册 controller/browser/<method> 通道。
 * 前端通过 ipc.invoke('controller/browser/<method>', args) 调用。
 */
import { browserController } from '../components/browser/browser-controller'
import type { BrowserViewLayout, BrowserViewState } from '../components/browser/types'
import type { BrowserDomActionInput } from '../components/browser/browser-script-policy'

class BrowserController {
  /**
   * 用户打开浏览器面板
   */
  async open(args: { sessionId: string }): Promise<{ code: number; data?: BrowserViewState; message?: string }> {
    try {
      const data = browserController.open(args.sessionId)
      return { code: 0, data }
    } catch (err) {
      return { code: -1, message: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * 获取当前浏览器状态
   */
  async getState(args: { sessionId: string }): Promise<{ code: number; data?: BrowserViewState | null; message?: string }> {
    try {
      const data = browserController.getState(args.sessionId)
      return { code: 0, data }
    } catch (err) {
      return { code: -1, message: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * 设置 WebContentsView 布局（BrowserSlot 调用）
   */
  async setLayout(args: BrowserViewLayout): Promise<{ code: number; message?: string }> {
    browserController.setLayout(args)
    return { code: 0 }
  }

  /**
   * 地址栏导航（用户面板）
   */
  async navigateDisplay(args: { sessionId: string; url: string; tabId?: string }): Promise<{ code: number; data?: BrowserViewState; message?: string }> {
    try {
      const data = await browserController.navigateDisplay(args.sessionId, args.url, args.tabId)
      return { code: 0, data }
    } catch (err) {
      return { code: -1, message: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * 后退（用户面板）
   */
  async goBackDisplay(args: { sessionId: string }): Promise<{ code: number; data?: BrowserViewState; message?: string }> {
    try {
      const data = await browserController.goBackDisplay(args.sessionId)
      return { code: 0, data }
    } catch (err) {
      return { code: -1, message: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * 前进（用户面板）
   */
  async goForwardDisplay(args: { sessionId: string }): Promise<{ code: number; data?: BrowserViewState; message?: string }> {
    try {
      const data = await browserController.goForwardDisplay(args.sessionId)
      return { code: 0, data }
    } catch (err) {
      return { code: -1, message: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * 刷新（用户面板）
   */
  async reloadDisplay(args: { sessionId: string }): Promise<{ code: number; data?: BrowserViewState; message?: string }> {
    try {
      const data = await browserController.reloadDisplay(args.sessionId)
      return { code: 0, data }
    } catch (err) {
      return { code: -1, message: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * 列出标签
   */
  async listTabs(args: { sessionId: string }): Promise<{ code: number; data?: BrowserViewState; message?: string }> {
    try {
      const data = browserController.listTabs(args.sessionId)
      return { code: 0, data }
    } catch (err) {
      return { code: -1, message: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * 新建标签（用户面板）
   */
  async createDisplayTab(args: { sessionId: string; url?: string }): Promise<{ code: number; data?: BrowserViewState; message?: string }> {
    try {
      const data = await browserController.createDisplayTab(args.sessionId, args.url)
      return { code: 0, data }
    } catch (err) {
      return { code: -1, message: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * 选择标签（用户面板）
   */
  async selectTab(args: { sessionId: string; tabId: string }): Promise<{ code: number; data?: BrowserViewState; message?: string }> {
    try {
      const data = browserController.selectTab(args.sessionId, args.tabId)
      return { code: 0, data }
    } catch (err) {
      return { code: -1, message: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * 关闭标签
   */
  async closeTab(args: { sessionId: string; tabId: string }): Promise<{ code: number; data?: BrowserViewState | null; message?: string }> {
    try {
      const data = await browserController.closeTab(args.sessionId, args.tabId)
      return { code: 0, data }
    } catch (err) {
      return { code: -1, message: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * 关闭浏览器会话
   */
  async close(args: { sessionId: string }): Promise<{ code: number; message?: string }> {
    try {
      await browserController.close(args.sessionId)
      return { code: 0 }
    } catch (err) {
      return { code: -1, message: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * 确认风险告知
   */
  async acknowledgeRisk(): Promise<{ code: number; message?: string }> {
    try {
      const { acknowledgeBrowserRiskDisclaimer } = await import('../components/browser/browser-settings')
      acknowledgeBrowserRiskDisclaimer()
      return { code: 0 }
    } catch (err) {
      return { code: -1, message: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * 检查风险告知是否已确认
   */
  async hasAcknowledgedRisk(): Promise<{ code: number; data?: boolean }> {
    try {
      const { hasAcknowledgedBrowserRiskDisclaimer } = await import('../components/browser/browser-settings')
      return { code: 0, data: hasAcknowledgedBrowserRiskDisclaimer() }
    } catch {
      return { code: 0, data: false }
    }
  }
}

export default BrowserController
