/**
 * 麦克风权限服务
 *
 * 参考 Proma 的 microphone-permission-service 实现：
 * - macOS: 使用 systemPreferences API 检查和请求麦克风权限
 * - Windows/Linux: 不支持 systemPreferences 麦克风权限查询
 */

import { systemPreferences } from 'electron';

export interface MicPermissionResult {
  /** 权限状态：granted / denied / not-determined / unsupported */
  status: 'granted' | 'denied' | 'not-determined' | 'unsupported';
  /** 平台 */
  platform: NodeJS.Platform;
}

function getPlatform(): NodeJS.Platform {
  return process.platform;
}

/**
 * 检查麦克风权限状态
 */
export function checkMicrophonePermission(): MicPermissionResult {
  const platform = getPlatform();

  if (platform === 'darwin') {
    const raw = systemPreferences.getMediaAccessStatus('microphone');
    let status: MicPermissionResult['status'];
    if (raw === 'granted' || raw === 'denied' || raw === 'not-determined') {
      status = raw;
    } else {
      // 'restricted' → 视为 denied
      status = 'denied';
    }
    return { status, platform };
  }

  // Windows / Linux 不支持 systemPreferences 麦克风权限查询
  return { status: 'unsupported', platform };
}

/**
 * 请求麦克风权限
 */
export async function requestMicrophonePermission(): Promise<MicPermissionResult> {
  const platform = getPlatform();

  if (platform === 'darwin') {
    const granted = await systemPreferences.askForMediaAccess('microphone');
    return {
      status: granted ? 'granted' : 'denied',
      platform,
    };
  }

  // Windows / Linux 返回 unsupported，由渲染进程 getUserMedia 触发系统弹窗
  return { status: 'unsupported', platform };
}
