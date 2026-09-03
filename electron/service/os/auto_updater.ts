/**
 * 自动更新核心模块
 *
 * 检测新版本 → 静默后台下载 → 用户选择立即或空闲时重启安装。
 * 自动更新仅在打包后的生产环境中启用。
 *
 * 参考 Proma 的 auto-updater 架构，适配 ee-core 框架。
 */

import { app as electronApp, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { ProgressInfo, UpdateInfo } from 'electron-updater';
import { logger } from 'ee-core/log';
import { getMainWindow, setCloseAndQuit } from 'ee-core/electron';

/** 更新状态类型 */
export type UpdateStatus =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; version: string; releaseNotes?: string }
  | { status: 'downloading'; version: string; progress: DownloadProgress }
  | { status: 'downloaded'; version: string }
  | { status: 'not-available' }
  | { status: 'error'; error: string };

/** 下载进度 */
export interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

/** 国内 GitHub 加速代理地址 */
const CN_PROXY_URL = 'https://v4.gh-proxy.org/';

/**
 * 判断当前是否为中国大陆时区（东八区 UTC+8）
 * 通过 getTimezoneOffset() 判断：东八区返回 -480（分钟）
 */
function isChinaMainland(): boolean {
  const offset = new Date().getTimezoneOffset();
  // getTimezoneOffset 返回的是 UTC 减去本地的分钟数
  // 东八区 (UTC+8) 返回 -480
  return offset === -480;
}

/**
 * 判断是否需要使用代理下载更新
 * 中国大陆时区使用 gh-proxy 加速 GitHub 下载
 */
function shouldUseProxy(): boolean {
  return isChinaMainland();
}
export const UPDATER_IPC_CHANNELS = {
  CHECK_FOR_UPDATES: 'updater:check',
  GET_STATUS: 'updater:get-status',
  ON_STATUS_CHANGED: 'updater:status-changed',
  INSTALL_WHEN_IDLE: 'updater:install-when-idle',
  CANCEL_IDLE_INSTALL: 'updater:cancel-idle-install',
  QUIT_AND_INSTALL: 'updater:quit-and-install',
} as const;

/** 旧版兼容通道（前端特殊通道） */
const LEGACY_CHANNEL = 'custom/app/updater';

/** 当前更新状态 */
let currentStatus: UpdateStatus = { status: 'idle' };

/** 主窗口引用 */
let win: BrowserWindow | null = null;

/** 定时检查定时器 */
let checkInterval: ReturnType<typeof setInterval> | null = null;

/** 空闲安装请求标志 */
let idleInstallRequested = false;

/** 空闲安装轮询定时器 */
let idleInstallTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 更新状态并推送给渲染进程。
 * 同时通过旧版通道推送兼容数据。
 */
function setStatus(status: UpdateStatus): void {
  currentStatus = status;

  // 非下载完成状态取消空闲安装
  if (status.status !== 'downloaded') {
    cancelIdleInstall();
  }

  // 新通道：推送完整状态对象
  if (win?.webContents) {
    win.webContents.send(UPDATER_IPC_CHANNELS.ON_STATUS_CHANGED, status);
  }

  // 旧版兼容通道（JSON 字符串，保持前端旧代码兼容）
  if (win?.webContents) {
    const legacyData: Record<string, unknown> = {};
    const legacyStatusMap: Record<string, number> = {
      idle: 0,
      checking: 0,
      available: 1,
      not_available: 2,
      notAvailable: 2,
      downloading: 3,
      downloaded: 4,
      error: -1,
    };
    legacyData.status = legacyStatusMap[status.status] ?? 0;

    switch (status.status) {
      case 'available':
        legacyData.desc = '有可用更新';
        break;
      case 'not-available':
        legacyData.desc = '没有可用更新';
        break;
      case 'downloading': {
        const percent = Math.floor(status.progress.percent);
        const total = bytesChange(status.progress.total);
        const transferred = bytesChange(status.progress.transferred);
        legacyData.desc = `已下载 ${percent}% (${transferred}/${total})`;
        legacyData.percentNumber = percent;
        legacyData.totalSize = total;
        legacyData.transferredSize = transferred;
        break;
      }
      case 'downloaded':
        legacyData.desc = '下载完成';
        break;
      case 'error':
        legacyData.desc = status.error;
        break;
      default:
        legacyData.desc = '';
    }

    win.webContents.send(LEGACY_CHANNEL, JSON.stringify(legacyData));
  }
}

/**
 * 字节单位转换
 */
function bytesChange(limit: number): string {
  let size = '';
  if (limit < 0.1 * 1024) {
    size = limit.toFixed(2) + 'B';
  } else if (limit < 0.1 * 1024 * 1024) {
    size = (limit / 1024).toFixed(2) + 'KB';
  } else if (limit < 0.1 * 1024 * 1024 * 1024) {
    size = (limit / (1024 * 1024)).toFixed(2) + 'MB';
  } else {
    size = (limit / (1024 * 1024 * 1024)).toFixed(2) + 'GB';
  }

  const sizeStr = size;
  const index = sizeStr.indexOf('.');
  if (index === -1) return sizeStr;
  const dou = sizeStr.substring(index + 1, index + 3);
  if (dou === '00') {
    return sizeStr.substring(0, index) + sizeStr.substring(index + 3);
  }
  return sizeStr;
}

/**
 * 退出并安装已下载的更新。
 *
 * 移除所有窗口 close 监听器，避免 preventDefault 阻止退出。
 */
function quitAndInstall(): void {
  if (!electronApp.isPackaged) {
    logger.warn('[更新] 开发环境不支持安装更新');
    return;
  }

  // 延迟调用确保 IPC 响应已发送回渲染进程
  setImmediate(() => {
    // 移除所有窗口的 close 监听器，避免 preventDefault 阻止退出
    for (const w of BrowserWindow.getAllWindows()) {
      w.removeAllListeners('close');
    }

    // 托盘插件里面设置了阻止窗口关闭，这里设置允许关闭窗口
    setCloseAndQuit(true);

    autoUpdater.quitAndInstall(true, true);
  });
}

/**
 * 尝试执行空闲安装。
 * 仅在已请求且状态为 downloaded 时执行。
 */
function attemptIdleInstall(): void {
  if (!idleInstallRequested) return;
  if (currentStatus.status !== 'downloaded') return;

  idleInstallRequested = false;
  if (idleInstallTimer) {
    clearInterval(idleInstallTimer);
    idleInstallTimer = null;
  }

  logger.info('[更新] 当前没有运行中的任务，开始安装已下载更新');
  quitAndInstall();
}

/** 手动触发检查更新 */
export async function checkForUpdates(): Promise<void> {
  // 已在下载中或已下载完成，不重复检查
  if (
    currentStatus.status === 'downloading' ||
    currentStatus.status === 'downloaded'
  ) {
    logger.info('[更新] 跳过检查：已在下载中或已下载完成');
    return;
  }

  try {
    setStatus({ status: 'checking' });
    await autoUpdater.checkForUpdates();
  } catch (err) {
    logger.error('[更新] 检查更新失败:', err);
    setStatus({
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** 获取当前更新状态 */
export function getUpdateStatus(): UpdateStatus {
  return currentStatus;
}

/**
 * 请求在空闲时安装已下载的更新。
 *
 * @returns 是否已接受请求；仅 downloaded 状态可排队。
 */
export function installWhenIdle(): boolean {
  if (currentStatus.status !== 'downloaded') {
    logger.warn('[更新] 跳过空闲安装：当前没有已下载的更新');
    return false;
  }

  logger.info('[更新] 已请求空闲安装');
  idleInstallRequested = true;

  // 立即尝试一次
  attemptIdleInstall();

  // 如果没有立即执行，启动轮询定时器
  if (idleInstallRequested && !idleInstallTimer) {
    idleInstallTimer = setInterval(attemptIdleInstall, 1000);
  }

  return true;
}

/** 取消尚未执行的空闲安装请求 */
export function cancelIdleInstall(): void {
  if (idleInstallRequested) {
    idleInstallRequested = false;
    logger.info('[更新] 已取消空闲安装请求');
  }
  if (idleInstallTimer) {
    clearInterval(idleInstallTimer);
    idleInstallTimer = null;
  }
}

/** 直接退出并安装 */
export function quitAndInstallNow(): void {
  if (currentStatus.status !== 'downloaded') {
    logger.warn('[更新] 当前没有已下载的更新');
    return;
  }
  quitAndInstall();
}

/**
 * 绑定主窗口
 */
export function configureUpdater(mainWindow: BrowserWindow): void {
  win = mainWindow;
}

/** 清理更新器资源（定时器等） */
export function cleanupUpdater(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  cancelIdleInstall();
}

/**
 * 初始化自动更新
 *
 * 仅在打包环境中启用。启动后延迟 10 秒首次检查，每 4 小时定时检查。
 * 自动下载新版本，但不自动安装，由用户选择立即或空闲时安装。
 *
 * @param mainWindow - 主窗口实例，用于推送更新状态
 */
export function initAutoUpdater(mainWindow: BrowserWindow): void {
  configureUpdater(mainWindow);

  // 开发环境不启用
  if (!electronApp.isPackaged) {
    logger.info('[更新] 开发环境，自动更新不启用');
    return;
  }

  autoUpdater.logger = {
    info: (...args: unknown[]) => logger.info('[更新-updater]', ...args),
    warn: (...args: unknown[]) => logger.warn('[更新-updater]', ...args),
    error: (...args: unknown[]) => logger.error('[更新-updater]', ...args),
    debug: (...args: unknown[]) => logger.info('[更新-updater:debug]', ...args),
  };

  // 自动下载，但不在用户正常退出时自动安装
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  // 国内大陆时区：使用 gh-proxy 代理加速下载
  const useProxy = shouldUseProxy();
  if (useProxy) {
    logger.info('[更新] 检测到中国大陆时区，下载将使用代理加速');
  }

  // 监听更新事件
  autoUpdater.on('checking-for-update', () => {
    logger.info('[更新] 正在检查更新...');
    setStatus({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    logger.info('[更新] 发现新版本:', info.version);
    setStatus({
      status: 'available',
      version: info.version,
      releaseNotes:
        typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
    });

    // 国内代理：覆盖 provider 的 resolveFiles 方法，在最终下载 URL 前拼接代理地址
    // doDownloadUpdate 会重新调用 provider.resolveFiles(info) 来获取文件 URL，
    // 因此必须在 provider 层面修改，而不是修改 updateInfoAndProvider.info.files
    if (useProxy && autoUpdater.updateInfoAndProvider) {
      const provider = autoUpdater.updateInfoAndProvider.provider;
      const originalResolveFiles = provider.resolveFiles.bind(provider);
      provider.resolveFiles = (updateInfo: unknown) => {
        const files = originalResolveFiles(updateInfo);
        for (const file of files) {
          const originalUrl = (file as { url: URL | string }).url;
          const urlStr = originalUrl.toString();
          if (urlStr.startsWith('https://github.com/')) {
            const proxiedUrl = `${CN_PROXY_URL}${urlStr}`;
            (file as { url: URL }).url = new URL(proxiedUrl);
            logger.info(`[更新] 代理下载 URL: ${proxiedUrl}`);
          }
        }
        return files;
      };
    }
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    setStatus({
      status: 'downloading',
      version: (currentStatus as { version?: string }).version || '',
      progress: {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      },
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    logger.info('[更新] 下载完成:', info.version);
    setStatus({
      status: 'downloaded',
      version: info.version,
    });
  });

  autoUpdater.on('update-not-available', () => {
    logger.info('[更新] 已是最新版本');
    setStatus({ status: 'not-available' });
  });

  autoUpdater.on('error', (err: Error) => {
    logger.error('[更新] 更新出错:', err);
    setStatus({
      status: 'error',
      error: err.message,
    });
  });

  // 启动后延迟 10 秒首次检查
  setTimeout(() => {
    logger.info('[更新] 首次自动检查更新');
    checkForUpdates();
  }, 10_000);

  // 每 4 小时自动检查一次
  checkInterval = setInterval(() => {
    logger.info('[更新] 定时自动检查更新');
    checkForUpdates();
  }, 4 * 60 * 60 * 1000);

  // 窗口关闭时清理定时器
  mainWindow.on('closed', () => {
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
    cancelIdleInstall();
    win = null;
  });

  logger.info('[更新] 自动更新模块已初始化（静默下载，支持空闲时安装）');
}

/**
 * 兼容旧代码的 service 类
 */
class AutoUpdaterService {
  /**
   * 初始化（由 lifecycle 调用）
   */
  init(): void {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      initAutoUpdater(mainWindow);
    } else {
      logger.warn('[更新] 主窗口未就绪，延迟初始化');
      setTimeout(() => {
        const win = getMainWindow();
        if (win) {
          initAutoUpdater(win);
        }
      }, 5000);
    }
  }

  /** 检查更新 */
  checkUpdate(): void {
    checkForUpdates();
  }

  /** 下载更新（electron-updater 默认 autoDownload=true，此方法保留兼容） */
  download(): void {
    autoUpdater.downloadUpdate();
  }

  /** 向前端发消息（旧版兼容） */
  sendStatusToWindow(content: Record<string, unknown> = {}): void {
    if (win?.webContents) {
      win.webContents.send(LEGACY_CHANNEL, JSON.stringify(content));
    }
  }

  /** 单位转换（旧版兼容） */
  bytesChange(limit: number): string {
    return bytesChange(limit);
  }
}

export const autoUpdaterService = new AutoUpdaterService();
