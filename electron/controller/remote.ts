/**
 * 远程控制 Controller
 *
 * 暴露给前端的 IPC 接口，前端通过 ipc.invoke('controller/remote/<method>') 调用。
 *
 * 方法清单：
 *   - getStatus                 获取连接状态与会话码
 *   - connect / disconnect      手动连接 / 断开信令服务
 *   - startMirroring            开启远程镜像（申请会话码 + 开始采集）
 *   - stopMirroring             关闭远程镜像
 *   - checkPermission           检查屏幕捕获权限
 *   - openPermissionSettings    打开系统权限设置页（macOS）
 */

import { logger } from 'ee-core/log'
import { getMainWindow } from 'ee-core/electron'
import { isLoggedIn } from '../service/cloud-api'
import { remoteSignaling, type StatusSnapshot, type RemoteSignal } from '../service/remote/signaling-service'
import { remoteSessionWindow } from '../service/remote/session-window'
import {
  checkCapturePermission,
  openScreenPermissionSettings,
  type PermissionResult,
} from '../service/remote/permission-service'

/** 状态推送通道（主进程 → 前端） */
const CH_STATUS = 'remote:status'

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

let wired = false

/**
 * 串接信令服务与隐藏窗口：
 *   后端信令 → 主进程 → 隐藏窗口（WebRTC）
 *   隐藏窗口 → 主进程 → 后端信令
 */
function wire(): void {
  if (wired) return
  wired = true

  remoteSignaling.onSignal = (msg: RemoteSignal) => {
    remoteSessionWindow.sendSignal(msg)
  }

  remoteSessionWindow.onSignalOut = (msg: RemoteSignal) => {
    remoteSignaling.publish(msg)
  }

  remoteSessionWindow.onError = (msg: string) => {
    remoteSignaling.setError(msg)
  }

  // 控制指令：已在 session-window 主进程就地执行（坐标映射 + enigo 模拟）。
  // 这里仅做观测日志，便于排查。
  remoteSessionWindow.onCommand = (cmd: unknown) => {
    logger.info('[remote] 收到控制指令:', JSON.stringify(cmd))
  }

  remoteSignaling.onStatusChange = (s: StatusSnapshot) => {
    pushStatus(s)
  }
}

/** 主动推送状态给前端 */
function pushStatus(s: StatusSnapshot): void {
  try {
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(CH_STATUS, s)
    }
  } catch (err) {
    logger.warn('[remote] 推送状态失败:', err)
  }
}

class RemoteController {
  /** 获取连接状态 */
  async getStatus(): Promise<IpcResult<StatusSnapshot>> {
    try {
      wire()
      return ok(remoteSignaling.getStatus())
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return fail(msg)
    }
  }

  /** 连接信令服务（需已登录） */
  async connect(): Promise<IpcResult<StatusSnapshot>> {
    try {
      wire()
      if (!isLoggedIn()) {
        return fail('请先登录后再开启远程控制')
      }
      remoteSignaling.connect()
      return ok(remoteSignaling.getStatus())
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[remote] 连接失败:', msg)
      return fail(msg)
    }
  }

  /** 断开信令服务 */
  async disconnect(): Promise<IpcResult<{ success: boolean }>> {
    try {
      await remoteSessionWindow.stopCapture()
      remoteSignaling.disconnect()
      return ok({ success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return fail(msg)
    }
  }

  /**
   * 开启远程镜像
   *
   * 流程：权限检查 → 申请会话码 → 启动隐藏窗口待命 → 返回 6 位码
   * 真正的屏幕采集延迟到控制端 join 时才开始，避免无谓占用资源。
   */
  async startMirroring(): Promise<IpcResult<{ sessionCode: string }>> {
    try {
      wire()
      if (!isLoggedIn()) {
        return fail('请先登录')
      }

      const perm = await checkCapturePermission()
      if (!perm.granted) {
        return fail(perm.degraded ? `${perm.message}。${perm.degraded}` : perm.message)
      }

      // 未连接时先连上
      if (!remoteSignaling.connected) {
        remoteSignaling.connect()
        // 等待连接建立，最多 5 秒
        const deadline = Date.now() + 5_000
        while (!remoteSignaling.connected && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 100))
        }
        if (!remoteSignaling.connected) {
          return fail('信令服务连接超时，请检查网络或后端地址')
        }
      }

      const code = await remoteSignaling.startMirroring()
      const iceServers = await remoteSignaling.fetchIceServers()
      await remoteSessionWindow.startCapture(undefined, iceServers)

      return ok({ sessionCode: code })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[remote] 开启镜像失败:', msg)
      return fail(msg)
    }
  }

  /** 关闭远程镜像 */
  async stopMirroring(): Promise<IpcResult<{ success: boolean }>> {
    try {
      await remoteSessionWindow.stopCapture()
      await remoteSignaling.stopMirroring()
      return ok({ success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return fail(msg)
    }
  }

  /** 检查屏幕捕获权限 */
  async checkPermission(): Promise<IpcResult<PermissionResult>> {
    try {
      const result = await checkCapturePermission()
      return ok(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return fail(msg)
    }
  }

  /** 打开系统权限设置（macOS 屏幕录制） */
  async openPermissionSettings(): Promise<IpcResult<{ success: boolean }>> {
    try {
      await openScreenPermissionSettings()
      return ok({ success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return fail(msg)
    }
  }
}

export default RemoteController
