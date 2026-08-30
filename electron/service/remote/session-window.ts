/**
 * 远程会话隐藏窗口
 *
 * 为什么需要隐藏窗口：
 *   desktopCapturer 取流、RTCPeerConnection 编码都依赖 Chromium，只能在渲染进程完成。
 *   若直接在主窗口里做，用户一旦关闭/最小化主窗口，远程会话就会中断；
 *   用独立隐藏窗口承载，主窗口关了也能继续被控。
 *
 * 通信方式：主进程与隐藏窗口之间通过 IPC 转发信令。
 */

import { BrowserWindow, desktopCapturer, ipcMain, screen } from 'electron'
import path from 'path'
import { logger } from 'ee-core/log'
import { getBaseDir } from 'ee-core/ps'
import type { IceServerConfig, RemoteSignal } from './signaling-service'
import { executeCommand, enqueueMove, flushMove } from './command-executor'

/** 显示器拓扑，控制端据此做坐标映射（由主进程采集后下发隐藏窗口，供其回传坐标映射用） */
export interface DisplayInfo {
  id: number
  x: number
  y: number
  width: number
  height: number
  scaleFactor: number
  primary: boolean
}

/**
 * 采集显示器拓扑。
 * ⚠️ bounds 是逻辑像素，副屏位于主屏左侧时 x 为负 —— 控制端做坐标换算时必须加上 x，
 *    否则点击会偏移，这是远程控制最常见的 bug。
 */
export function collectDisplays(): DisplayInfo[] {
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    x: d.bounds.x,
    y: d.bounds.y,
    width: d.bounds.width,
    height: d.bounds.height,
    scaleFactor: d.scaleFactor,
    primary: d.id === screen.getPrimaryDisplay().id,
  }))
}

/** 主进程 → 隐藏窗口：转发收到的信令 */
const CH_SIGNAL_IN = 'remote:signal-in'
/** 隐藏窗口 → 主进程：待发送的信令 */
const CH_SIGNAL_OUT = 'remote:signal-out'
/** 主进程 → 隐藏窗口：开始 / 停止捕获 */
const CH_START = 'remote:start'
const CH_STOP = 'remote:stop'
/** 隐藏窗口 → 主进程：异常上报 */
const CH_ERROR = 'remote:error'
/** 隐藏窗口 → 主进程：控制指令（来自 DataChannel，待主进程执行） */
const CH_COMMAND = 'remote:command'
/** 隐藏窗口 → 主进程：当前被投放的显示器 id（切屏时回传，用于坐标映射） */
const CH_ACTIVE_DISPLAY = 'remote:active-display'
/** 渲染进程 → 主进程：请求屏幕源列表（invoke/handle 模型） */
const CH_GET_SOURCES = 'remote:get-sources'
/** 渲染进程 → 主进程：运行日志（渲染进程 console 不会进主进程日志文件） */
const CH_LOG = 'remote:log'

class RemoteSessionWindow {
  private win: BrowserWindow | null = null
  private handlersBound = false

  /** 显示器拓扑（主进程采集，供坐标映射） */
  private displays: DisplayInfo[] = []
  /** 当前被投放的显示器 id（隐藏窗口切屏时回传） */
  private activeDisplayId: number | null = null

  /**
   * 控制指令串行执行链。
   * ⚠️ 关键：一条「点击」= mm + md + mu 三条 DataChannel 消息，几乎同时到达。
   *    executeCommand 是 async（moveAbs 要 await 原生 FFI），若各自 fire-and-forget 并发执行，
   *    md/mu 会赶在 mm 的 moveAbs 把光标挪到位之前就按下/抬起 ——
   *    表现为「在手机上点 A，电脑却在旧位置点了一下」，即用户感知的『点击没反应』。
   *    用一条 promise 链把所有指令串起来，保证「移动完成 → 按下 → 抬起」严格有序。
   *    executeCommand 内部已吞掉异常（只记日志），所以链不会因单条失败而断。
   */
  private commandChain: Promise<void> = Promise.resolve()

  /** 收到待发送信令（转发给后端） */
  onSignalOut: ((msg: RemoteSignal) => void) | null = null
  /** 捕获异常 */
  onError: ((msg: string) => void) | null = null
  /** 控制指令（在主进程就地执行，这里仅做日志记录，便于观测） */
  onCommand: ((cmd: unknown) => void) | null = null

  /* ══════════════════ 窗口管理 ══════════════════ */

  private bindHandlers(): void {
    if (this.handlersBound) return
    this.handlersBound = true

    ipcMain.on(CH_SIGNAL_OUT, (_e, msg: RemoteSignal) => {
      this.onSignalOut?.(msg)
    })
    ipcMain.on(CH_ERROR, (_e, msg: string) => {
      logger.error('[remote-session]', msg)
      this.onError?.(msg)
    })
    ipcMain.on(CH_LOG, (_e, msg: string) => {
      logger.info('[remote-session]', msg)
    })
    ipcMain.on(CH_COMMAND, (_e, cmd: unknown) => {
      const c = cmd as { t?: string; u?: number; v?: number } | null
      if (c && c.t === 'mm') {
        // 高频移动：只保留最新位置、走独立定时器刷，不进串行链（避免堆积成卡顿）
        enqueueMove(c.u ?? 0, c.v ?? 0, this.displays, this.activeDisplayId)
      } else {
        // 按下/抬起/滚轮/键盘：先确保最后一次移动已落位，再严格有序执行，
        // 保证「移动完成 → 按下 → 抬起」不乱序。
        this.commandChain = this.commandChain
          .then(() => flushMove())
          .then(() => executeCommand(cmd as never, this.displays, this.activeDisplayId))
      }
      this.onCommand?.(cmd)
    })

    /** 隐藏窗口切屏后回传当前被投放的显示器 id，供坐标映射使用 */
    ipcMain.on(CH_ACTIVE_DISPLAY, (_e, displayId: number) => {
      this.activeDisplayId = displayId
      logger.info('[remote] 激活屏回传 → displayId=' + displayId)
    })

    /**
     * 提供屏幕源列表给隐藏窗口。
     *
     * ⚠️ Electron 39 起 desktopCapturer 只能在【主进程】使用
     *    （官方 API 文档标注 Process: Main），渲染进程里拿到的值是 undefined。
     *    因此这里在主进程取源，把 id 交给渲染进程，
     *    由渲染进程用 getUserMedia({ chromeMediaSourceId }) 完成取流。
     */
    ipcMain.handle(CH_GET_SOURCES, async () => {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        // 不需要缩略图，省去一次图像编码开销
        thumbnailSize: { width: 0, height: 0 },
      })
      return sources.map((s) => ({
        id: s.id,
        name: s.name,
        displayId: s.display_id,
      }))
    })
  }

  /** 确保隐藏窗口已就绪（懒创建） */
  async ensureWindow(): Promise<BrowserWindow> {
    this.bindHandlers()

    if (this.win && !this.win.isDestroyed()) {
      return this.win
    }

    const win = new BrowserWindow({
      show: false,
      // 不参与任务栏 / 不获取焦点，避免干扰用户
      skipTaskbar: true,
      focusable: false,
      width: 800,
      height: 600,
      webPreferences: {
        // 捕获页面需要调用 desktopCapturer 与 WebRTC，允许 node 集成以使用 ipcRenderer
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false,
      },
    })

    // 阻止用户或系统关闭该窗口导致会话中断
    win.on('close', (e) => {
      if (this.win === win) {
        e.preventDefault()
        win.hide()
      }
    })

    const htmlPath = path.join(getBaseDir(), 'public', 'html', 'remote-session.html')
    await win.loadFile(htmlPath)
    logger.info('[remote] 会话窗口已就绪')
    this.win = win
    return win
  }

  /** 关闭并销毁窗口（退出远程会话时调用） */
  destroy(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.removeAllListeners('close')
      this.win.destroy()
    }
    this.win = null
  }

  get isReady(): boolean {
    return !!this.win && !this.win.isDestroyed()
  }

  /* ══════════════════ 指令下发 ══════════════════ */

  /**
   * 开始捕获并等待连接
   * @param displayId 目标显示器，为空表示主屏
   * @param iceServers STUN/TURN 服务器列表（由主进程向后端申请后传入）
   */
  async startCapture(displayId?: number, iceServers: IceServerConfig[] = []): Promise<void> {
    const win = await this.ensureWindow()
    const displays = collectDisplays()
    this.displays = displays
    // 默认激活屏：显式指定 > 主屏 > 第一块（隐藏窗口会在 join/切屏时再回传覆盖）
    const primary = displays.find((d) => d.primary)
    this.activeDisplayId = displayId ?? primary?.id ?? displays[0]?.id ?? null
    win.webContents.send(CH_START, {
      displayId: displayId ?? null,
      displays,
      iceServers,
    })
  }

  /** 停止捕获并关闭 PeerConnection */
  async stopCapture(): Promise<void> {
    if (!this.isReady) return
    this.win!.webContents.send(CH_STOP)
  }

  /** 把来自控制端的信令转发给隐藏窗口 */
  sendSignal(msg: RemoteSignal): void {
    if (!this.isReady) {
      logger.warn('[remote] 会话窗口未就绪，丢弃信令:', msg.type)
      return
    }
    this.win!.webContents.send(CH_SIGNAL_IN, msg)
  }
}

export const remoteSessionWindow = new RemoteSessionWindow()
