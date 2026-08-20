/**
 * 更新 Controller
 *
 * 提供更新相关的 IPC 接口和 GitHub Release 查询接口。
 * 参考 Proma 的 updater-ipc 架构，适配 ee-core 的 Controller 模式。
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { logger } from 'ee-core/log';
import { autoUpdaterService } from '../service/os/auto_updater';
import {
  UPDATER_IPC_CHANNELS,
  checkForUpdates,
  getUpdateStatus,
  installWhenIdle,
  cancelIdleInstall,
  quitAndInstallNow,
  type UpdateStatus,
} from '../service/os/auto_updater';
import {
  getLatestRelease,
  listReleases,
  getReleaseByTag,
  type GitHubRelease,
  type GitHubReleaseListOptions,
} from '../service/os/github-release-service';

/**
 * 更新 Controller
 */
class UpdaterController {
  /** 是否已注册 IPC */
  private registered = false;

  /**
   * 注册更新相关 IPC 通道
   * ee-core Controller 方法由框架自动注册 invoke handler，
   * 但更新相关的实时推送和部分通道需要手动注册。
   */
  registerIpc(): void {
    if (this.registered) return;
    this.registered = true;

    logger.info('[更新 Controller] 正在注册更新 IPC 处理器...');

    // 检查更新
    ipcMain.handle(UPDATER_IPC_CHANNELS.CHECK_FOR_UPDATES, async () => {
      await checkForUpdates();
    });

    // 获取当前状态
    ipcMain.handle(UPDATER_IPC_CHANNELS.GET_STATUS, (): UpdateStatus => {
      return getUpdateStatus();
    });

    // 空闲时安装
    ipcMain.handle(
      UPDATER_IPC_CHANNELS.INSTALL_WHEN_IDLE,
      (): boolean => {
        return installWhenIdle();
      },
    );

    // 取消空闲安装
    ipcMain.handle(UPDATER_IPC_CHANNELS.CANCEL_IDLE_INSTALL, (): void => {
      cancelIdleInstall();
    });

    // 立即退出并安装
    ipcMain.handle(UPDATER_IPC_CHANNELS.QUIT_AND_INSTALL, (): void => {
      quitAndInstallNow();
    });

    // GitHub Release 相关
    ipcMain.handle(
      'github-release:get-latest',
      async (): Promise<GitHubRelease | null> => {
        return getLatestRelease();
      },
    );

    ipcMain.handle(
      'github-release:list',
      async (
        _event: IpcMainInvokeEvent,
        options?: GitHubReleaseListOptions,
      ): Promise<GitHubRelease[]> => {
        return listReleases(options);
      },
    );

    ipcMain.handle(
      'github-release:get-by-tag',
      async (
        _event: IpcMainInvokeEvent,
        tag: string,
      ): Promise<GitHubRelease | null> => {
        return getReleaseByTag(tag);
      },
    );

    logger.info('[更新 Controller] 更新 IPC 处理器注册完成');
  }

  /**
   * 检查更新（ee-core Controller 方法，前端可通过 ipcApiRoute 调用）
   */
  async checkForUpdater(): Promise<void> {
    await checkForUpdates();
  }

  /**
   * 下载更新（ee-core Controller 方法，兼容旧前端）
   */
  downloadApp(): void {
    autoUpdaterService.download();
  }
}

export default UpdaterController;
export const updaterController = new UpdaterController();
