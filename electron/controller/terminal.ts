/**
 * 终端 IPC 控制器
 *
 * ee-core controller 模式，自动注册 controller/terminal/<method> 通道。
 * 前端通过 ipc.invoke('controller/terminal/<method>', args) 调用。
 *
 * 主动推送通道（主进程 → 渲染进程）：
 *   - controller/terminal/onData：终端输出数据
 *   - controller/terminal/onExit：终端进程退出
 *
 * 方法清单：
 *   - createTerminal：创建新的伪终端
 *   - write：向终端写入数据
 *   - resize：调整终端尺寸
 *   - destroyTerminal：销毁单个终端
 *   - destroyAll：销毁所有终端
 */
import type { IpcMainInvokeEvent } from 'electron'
import { ipcMain } from 'electron'
import { logger } from 'ee-core/log'
import { ptyService } from '../service/terminal/pty-service'

/** 统一返回类型 */
interface IpcResult<T = unknown> {
  code: number
  message?: string
  data?: T
}

function ok<T>(data: T): IpcResult<T> {
  return { code: 0, data }
}

function fail(message: string): IpcResult<never> {
  return { code: -1, message }
}

/** IPC 推送通道常量 */
const TERMINAL_DATA_CHANNEL = 'controller/terminal/onData'
const TERMINAL_EXIT_CHANNEL = 'controller/terminal/onExit'

class TerminalController {
  /** 是否已注册主动推送通道 */
  private pushRegistered = false

  /**
   * 注册主动推送通道
   *
   * 在应用启动时调用一次（由 lifecycle.electronAppReady 调用）。
   * 监听 ptyService 的 data / exit 事件，通过 ipcMain 推送给所有渲染进程。
   */
  registerPushChannels(): void {
    if (this.pushRegistered) return
    this.pushRegistered = true

    // 监听终端输出数据，推送给渲染进程
    ptyService.on('data', (event: { terminalId: string; data: string }) => {
      // 推送给所有打开的 BrowserWindow
      const windows = require('electron').BrowserWindow.getAllWindows()
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send(TERMINAL_DATA_CHANNEL, event)
        }
      }
    })

    // 监听终端退出，推送给渲染进程
    ptyService.on('exit', (event: { terminalId: string; exitCode: number; signal?: number }) => {
      const windows = require('electron').BrowserWindow.getAllWindows()
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send(TERMINAL_EXIT_CHANNEL, event)
        }
      }
    })

    logger.info('[TerminalController] 终端推送通道已注册')
  }

  /**
   * 创建新的伪终端
   */
  async createTerminal(args: {
    terminalId: string
    cwd?: string
    cols?: number
    rows?: number
  }): Promise<IpcResult<string>> {
    try {
      const terminalId = await ptyService.createTerminal({
        terminalId: args.terminalId,
        cwd: args.cwd,
        cols: args.cols,
        rows: args.rows,
      })
      return ok(terminalId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[TerminalController] 创建终端失败:', msg)
      return fail(msg)
    }
  }

  /**
   * 向终端写入数据
   */
  async write(args: {
    terminalId: string
    data: string
  }): Promise<IpcResult> {
    try {
      ptyService.write(args.terminalId, args.data)
      return ok({ success: true })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  /**
   * 调整终端尺寸
   */
  async resize(args: {
    terminalId: string
    cols: number
    rows: number
  }): Promise<IpcResult> {
    try {
      ptyService.resize(args.terminalId, args.cols, args.rows)
      return ok({ success: true })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  /**
   * 销毁单个终端
   */
  async destroyTerminal(args: {
    terminalId: string
  }): Promise<IpcResult> {
    try {
      ptyService.destroyTerminal(args.terminalId)
      return ok({ success: true })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  /**
   * 销毁所有终端（应用退出时调用）
   */
  async destroyAll(): Promise<IpcResult> {
    try {
      ptyService.destroyAll()
      return ok({ success: true })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }
}

export default TerminalController
export const terminalController = new TerminalController()
