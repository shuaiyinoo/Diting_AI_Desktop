/**
 * 认证 Controller
 *
 * 暴露给前端的 IPC 认证接口。前端通过 ipc.invoke('controller/auth/<method>', args) 调用。
 * 所有后端 HTTP 请求由 Electron 主进程发起，前端不直接与后端接口通信。
 *
 * 方法清单：
 *   - login     : 邮箱+密码登录
 *   - register  : 邮箱+用户名+密码注册
 *   - logout    : 退出登录
 *   - getStatus : 获取登录状态与用户信息
 *
 * 登录成功后会自动建立远程控制信令连接（/ws/desktop），
 * 退出登录时断开 —— 远程控制依赖登录态，未登录时无法被控。
 */

import { logger } from 'ee-core/log'
import { remoteSignaling } from '../service/remote/signaling-service'
import {
  login as cloudLogin,
  register as cloudRegister,
  logout as cloudLogout,
  isLoggedIn,
  getCurrentUser,
} from '../service/cloud-api'

// ===== 返回类型 =====

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

// ===== 用户信息类型 =====

interface UserInfo {
  userId: number
  username: string
  nickname: string
  email: string
  teamId: number | null
}

interface AuthStatus {
  isLoggedIn: boolean
  user: UserInfo | null
}

class AuthController {
  /**
   * 邮箱+密码登录
   *
   * @param args { email: string, password: string }
   * @returns IpcResult<AuthStatus>
   */
  async login(args: { email: string; password: string }): Promise<IpcResult<AuthStatus>> {
    try {
      if (!args?.email || !args?.password) {
        return fail('邮箱和密码不能为空')
      }
      await cloudLogin({
        email: args.email,
        password: args.password,
      })

      // 登录成功后立即建立远程信令连接（失败不影响登录结果）
      try {
        remoteSignaling.connect()
      } catch (e) {
        logger.warn('[Auth] 远程信令连接失败:', e)
      }

      const user = getCurrentUser()
      return ok({
        isLoggedIn: true,
        user: user ? {
          userId: user.userId,
          username: user.username,
          nickname: user.nickname,
          email: user.email,
          teamId: user.teamId,
        } : null,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[Auth] 登录失败:', msg)
      return fail(msg)
    }
  }

  /**
   * 邮箱+用户名+密码注册
   *
   * @param args { username: string, email: string, password: string }
   * @returns IpcResult<{ success: boolean }>
   */
  async register(args: {
    username: string
    email: string
    password: string
  }): Promise<IpcResult<{ success: boolean }>> {
    try {
      if (!args?.username || !args?.email || !args?.password) {
        return fail('用户名、邮箱和密码不能为空')
      }
      await cloudRegister({
        username: args.username,
        email: args.email,
        password: args.password,
      })
      // 注册成功不自动登录，前端跳转到登录表单
      return ok({ success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[Auth] 注册失败:', msg)
      return fail(msg)
    }
  }

  /**
   * 退出登录
   */
  async logout(): Promise<IpcResult<{ success: boolean }>> {
    try {
      // 先断开远程信令（含释放会话码），再清理登录态
      try {
        remoteSignaling.disconnect()
      } catch (e) {
        logger.warn('[Auth] 断开远程信令失败:', e)
      }
      cloudLogout()
      return ok({ success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[Auth] 退出失败:', msg)
      return fail(msg)
    }
  }

  /**
   * 获取当前登录状态与用户信息
   */
  async getStatus(): Promise<IpcResult<AuthStatus>> {
    try {
      const loggedIn = isLoggedIn()
      const user = getCurrentUser()
      return ok({
        isLoggedIn: loggedIn,
        user: loggedIn && user ? {
          userId: user.userId,
          username: user.username,
          nickname: user.nickname,
          email: user.email,
          teamId: user.teamId,
        } : null,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[Auth] 获取状态失败:', msg)
      return fail(msg)
    }
  }
}

export default AuthController
