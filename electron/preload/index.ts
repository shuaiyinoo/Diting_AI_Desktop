/*************************************************
 ** preload为预加载模块，该文件将会在程序启动时加载 **
 *************************************************/

import { logger } from 'ee-core/log';
import { trayService } from '../service/os/tray';
import { securityService } from '../service/os/security';
import { autoUpdaterService } from '../service/os/auto_updater';
import { crossService } from '../service/cross';
import { sqlitedbService } from '../service/database/sqlitedb';
import { filedbService } from '../service/database/filedb';
import { windowService } from '../service/os/window';
import SyncService from '../components/file/SyncService';

export async function preload(): Promise<void> {
  // 示例功能模块，可选择性使用和修改
  logger.info('[preload] load 5');
  windowService.init();
  trayService.init();
  securityService.init();
  //autoUpdaterService.init();
  // init sqlite db (lazy loads better-sqlite3 on first use)
  await sqlitedbService.init();
  await filedbService.init();

  // 重新扫描所有授权文件夹，更新文件数据
  const folders = filedbService.getFolderList();
  if (folders.length > 0) {
    logger.info(`[preload] 重新扫描 ${folders.length} 个授权文件夹`);
    for (const folder of folders) {
      try {
        await filedbService.rescanFolder(folder.id);
      } catch (err) {
        logger.error(`[preload] 重新扫描失败 folderId=${folder.id}:`, err);
      }
    }
  }

  // 启动文件监听（实时同步）
  SyncService.startWatchAll();

  // go server
  //crossService.createGoServer();
}


