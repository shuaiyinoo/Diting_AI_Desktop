/**
 * 伪终端进程管理服务
 *
 * 基于 node-pty 创建跨平台伪终端进程，
 * 供 TerminalController 通过 IPC 与前端 xterm.js 双向通信。
 *
 * 数据流：
 *   前端 xterm.onData → IPC write → ptyProcess.write → shell
 *   shell → ptyProcess.onData → IPC event → 前端 xterm.write
 */
import * as os from 'os'
import * as path from 'path'
import { EventEmitter } from 'events'
import { logger } from 'ee-core/log'

// node-pty 的类型声明（该包自带 .d.ts）
type IPty = import('node-pty').IPty

/** 单个终端会话 */
interface TerminalSession {
  /** 终端唯一 ID（前端生成，用于 Tab 标识） */
  id: string
  /** node-pty 进程实例 */
  pty: IPty
  /** 工作目录 */
  cwd: string
  /** 是否已销毁 */
  destroyed: boolean
}

/** 创建终端参数 */
interface CreateTerminalOptions {
  /** 终端唯一 ID */
  terminalId: string
  /** 工作目录（默认用户主目录） */
  cwd?: string
  /** 初始列数 */
  cols?: number
  /** 初始行数 */
  rows?: number
}

/** 终端输出事件的数据结构 */
interface TerminalDataEvent {
  terminalId: string
  data: string
}

/** 终端退出事件的数据结构 */
interface TerminalExitEvent {
  terminalId: string
  exitCode: number
  signal?: number
}

/**
 * PtyService 管理所有终端会话的生命周期
 *
 * 通过 EventEmitter 向 Controller 推送 data / exit 事件，
 * Controller 再通过 ipcMain 转发给渲染进程。
 */
class PtyService extends EventEmitter {
  /** terminalId → TerminalSession */
  private sessions = new Map<string, TerminalSession>()

  constructor() {
    super()
  }

  /**
   * 获取系统默认 shell 及启动参数
   *
   * macOS/Linux：优先使用 $SHELL 环境变量，回退到 /bin/bash 或 /bin/sh
   *   以交互模式启动（-i），确保加载 .zshrc/.bashrc。
   * Windows：优先 PowerShell 7，回退 cmd.exe
   *
   * @returns [shellPath, args[]]
   */
  private getDefaultShell(): { shell: string; args: string[] } {
    if (process.platform === 'win32') {
      const ps = process.env.PROGRAMFILES
        ? path.join(process.env.PROGRAMFILES, 'PowerShell', '7', 'pwsh.exe')
        : ''
      const fs = require('fs')
      if (ps && fs.existsSync(ps)) {
        return { shell: ps, args: ['-NoLogo'] }
      }
      return { shell: process.env.COMSPEC || 'cmd.exe', args: [] }
    }
    const shell = process.env.SHELL || '/bin/bash'
    // 以交互模式启动，确保加载 .zshrc/.bashrc
    return { shell, args: ['-i'] }
  }

  /**
   * 构建 shell 初始化脚本，注入彩色提示符和别名
   *
   * 用户 .zshrc/.bashrc 中可能没有颜色配置，
   * 这里主动注入一段初始化脚本确保终端有彩色输出。
   * 脚本以单行方式静默执行，并在末尾清屏，用户不会看到初始化过程。
   */
  private getShellInitScript(): string {
    const shellPath = process.env.SHELL || ''
    const isZsh = shellPath.includes('zsh')
    const isBash = shellPath.includes('bash')

    if (isZsh) {
      // zsh: 所有命令用 ; 连接成一行，末尾 clear 清屏
      return [
        'autoload -U colors && colors;',
        'PROMPT=\'%F{green}%n@%m%f %F{blue}%~%f %# \';',
        'RPROMPT=\'%F{yellow}%T%f\';',
        'alias ls=\'ls -G\' && alias ll=\'ls -Glah\' && alias la=\'ls -Ga\';',
        'alias grep=\'grep --color=auto\' && alias diff=\'diff --color=auto\';',
        'export CLICOLOR=1 && export LSCOLORS=GxFxCxDxBxegedabagaced;',
        'clear\n',
      ].join('')
    }

    if (isBash) {
      // bash: 同样单行连接，末尾 clear
      return [
        'PS1=\'\\[\\033[01;32m\\]\\u@\\h\\[\\033[00m\\] \\[\\033[01;34m\\]\\w\\[\\033[00m\\] \\$ \';',
        'alias ls=\'ls --color=auto\' && alias ll=\'ls -lah --color=auto\' && alias la=\'ls -a --color=auto\';',
        'alias grep=\'grep --color=auto\' && alias diff=\'diff --color=auto\';',
        'export CLICOLOR=1 && export LSCOLORS=GxFxCxDxBxegedabagaced;',
        'clear\n',
      ].join('')
    }

    // 其他 shell（sh/fish 等）不注入
    return ''
  }

  /**
   * 创建新的伪终端进程
   *
   * @returns 创建成功返回 terminalId
   * @throws 如果 terminalId 已存在或 node-pty 初始化失败
   */
  async createTerminal(options: CreateTerminalOptions): Promise<string> {
    const { terminalId, cwd, cols, rows } = options

    // 检查 ID 是否已存在
    if (this.sessions.has(terminalId)) {
      throw new Error(`终端 ${terminalId} 已存在`)
    }

    // 动态引入 node-pty，避免在不支持的平台加载时报错影响启动
    const pty = await import('node-pty')

    const { shell, args } = this.getDefaultShell()
    const workDir = cwd || os.homedir()

    logger.info(`[PtyService] 创建终端: id=${terminalId}, shell=${shell}, args=${JSON.stringify(args)}, cwd=${workDir}, cols=${cols || 80}, rows=${rows || 24}`)

    const ptyProcess = pty.spawn(shell, args, {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: workDir,
      env: {
        ...process.env,
        // 确保终端有正确的 TERM 变量
        TERM: 'xterm-256color',
        // 启用真彩色支持，使 git/grep/ls 等工具输出 24 位颜色
        COLORTERM: 'truecolor',
        // 在 macOS 上确保使用 UTF-8
        LANG: process.env.LANG || 'en_US.UTF-8',
        // 提示工具（如 npm/yarn）输出彩色
        FORCE_COLOR: '1',
      },
      // Windows 下使用 conpty（Windows 10+ 支持）
      useConpty: process.platform === 'win32',
    })

    const session: TerminalSession = {
      id: terminalId,
      pty: ptyProcess,
      cwd: workDir,
      destroyed: false,
    }

    // 监听 pty 数据输出，转发给 EventEmitter
    ptyProcess.onData((data: string) => {
      if (session.destroyed) return
      const event: TerminalDataEvent = { terminalId, data }
      this.emit('data', event)
    })

    // 监听 pty 进程退出
    ptyProcess.onExit(({ exitCode, signal }) => {
      if (session.destroyed) return
      session.destroyed = true
      logger.info(`[PtyService] 终端退出: id=${terminalId}, exitCode=${exitCode}, signal=${signal}`)
      const event: TerminalExitEvent = { terminalId, exitCode, signal }
      this.emit('exit', event)
      // 从 sessions 中移除
      this.sessions.delete(terminalId)
    })

    this.sessions.set(terminalId, session)

    // 注入彩色提示符和别名初始化脚本
    const initScript = this.getShellInitScript()
    if (initScript) {
      ptyProcess.write(initScript)
    }

    return terminalId
  }

  /**
   * 向终端写入数据（模拟用户键入）
   */
  write(terminalId: string, data: string): void {
    const session = this.sessions.get(terminalId)
    if (!session || session.destroyed) {
      throw new Error(`终端 ${terminalId} 不存在或已销毁`)
    }
    session.pty.write(data)
  }

  /**
   * 调整终端尺寸
   *
   * 当前端容器 resize 时调用，同步给 pty 进程，
   * 使 shell 收到 SIGWINCH 信号并更新窗口大小。
   */
  resize(terminalId: string, cols: number, rows: number): void {
    const session = this.sessions.get(terminalId)
    if (!session || session.destroyed) {
      return
    }
    try {
      session.pty.resize(cols, rows)
    } catch (err) {
      // resize 失败不致命，仅记录
      logger.warn(`[PtyService] 调整终端尺寸失败: id=${terminalId},`, err)
    }
  }

  /**
   * 销毁单个终端
   *
   * 向 pty 进程发送 kill 信号并清理资源。
   */
  destroyTerminal(terminalId: string): void {
    const session = this.sessions.get(terminalId)
    if (!session || session.destroyed) {
      return
    }
    session.destroyed = true
    try {
      session.pty.kill()
    } catch (err) {
      logger.warn(`[PtyService] kill 终端失败: id=${terminalId},`, err)
    }
    this.sessions.delete(terminalId)
    logger.info(`[PtyService] 终端已销毁: id=${terminalId}`)
  }

  /**
   * 检查终端是否存活
   */
  isAlive(terminalId: string): boolean {
    const session = this.sessions.get(terminalId)
    return !!session && !session.destroyed
  }

  /**
   * 销毁所有终端（应用退出或会话切换时调用）
   */
  destroyAll(): void {
    for (const terminalId of this.sessions.keys()) {
      this.destroyTerminal(terminalId)
    }
    this.sessions.clear()
    logger.info('[PtyService] 所有终端已销毁')
  }
}

/** 单例 */
export const ptyService = new PtyService()
