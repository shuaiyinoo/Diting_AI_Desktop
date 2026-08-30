/**
 * 屏幕捕获权限检查
 *
 * 三端差异很大，这是桌面端最容易踩坑的地方：
 *   - macOS  : 需要「屏幕录制」系统权限，代码无法静默授予，只能引导用户去设置
 *   - Windows: 无特殊权限，但 UAC 安全桌面 / 锁屏时无法捕获
 *   - Linux  : X11 正常；Wayland 下 Electron 默认不启用 PipeWire，且会弹门户授权框
 */

import { systemPreferences, shell } from 'electron'
import { logger } from 'ee-core/log'

export interface PermissionResult {
  /** 是否可以开始捕获 */
  granted: boolean
  /** 平台：windows / macos / linux */
  platform: string
  /** 展示给用户的提示文案 */
  message: string
  /** 是否支持通过代码发起授权申请（macOS 为 false，只能引导） */
  canRequest: boolean
  /** 降级提示（如 Linux Wayland） */
  degraded?: string
}

/** 检查当前平台的屏幕捕获权限 */
export async function checkCapturePermission(): Promise<PermissionResult> {
  switch (process.platform) {
    case 'darwin':
      return checkMacOS()
    case 'win32':
      return checkWindows()
    default:
      return checkLinux()
  }
}

async function checkMacOS(): Promise<PermissionResult> {
  // 'granted' | 'denied' | 'not-determined' | 'unknown'
  const status = systemPreferences.getMediaAccessStatus('screen')

  if (status === 'granted') {
    return {
      granted: true,
      platform: 'macos',
      message: '屏幕录制权限已授予',
      canRequest: false,
    }
  }

  return {
    granted: false,
    platform: 'macos',
    message:
      status === 'denied'
        ? '屏幕录制权限已被拒绝，请在「系统设置 → 隐私与安全性 → 屏幕录制」中允许本应用'
        : '需要授予屏幕录制权限后才能开启远程镜像',
    canRequest: false,
  }
}

/** 打开 macOS 屏幕录制权限设置页 */
export async function openScreenPermissionSettings(): Promise<void> {
  if (process.platform !== 'darwin') return
  await shell.openExternal(
    'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  )
}

async function checkWindows(): Promise<PermissionResult> {
  // Windows 无系统级屏幕捕获权限开关
  // 注意：UAC 安全桌面、锁屏、休眠期间无法捕获，运行时会收到 DXGI_ERROR_DEVICE_REMOVED
  return {
    granted: true,
    platform: 'windows',
    message: 'Windows 无需额外授权',
    canRequest: false,
  }
}

async function checkLinux(): Promise<PermissionResult> {
  const sessionType = process.env.XDG_SESSION_TYPE ?? ''

  if (sessionType === 'wayland') {
    // Electron 默认不启用 PipeWire；且 Portal 每次捕获都会弹授权框，
    // 无人值守场景基本不可用，必须提示用户切换到 X11
    logger.warn('[remote] 检测到 Wayland 会话，屏幕捕获可能不可用')
    return {
      granted: false,
      platform: 'linux',
      message: '当前为 Wayland 会话，屏幕捕获不可用',
      canRequest: false,
      degraded: '请在登录界面选择「Ubuntu on Xorg」（X11 会话）后重试',
    }
  }

  return {
    granted: true,
    platform: 'linux',
    message: sessionType === 'x11' ? 'X11 会话，可以捕获' : '未识别的会话类型，将尝试捕获',
    canRequest: false,
  }
}
