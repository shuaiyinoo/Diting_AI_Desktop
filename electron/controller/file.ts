import { dialog } from 'electron';
import type { IpcMainEvent } from 'electron';
import { logger } from 'ee-core/log';
import { filedbService } from '../service/database/filedb';
import type { AuthorizedFolder, FileItemTreeNode, FileItem } from '../service/database/filedb';
import FolderScanner from '../components/file/FolderScanner';
import SyncService from '../components/file/SyncService';

// 文件变化通知通道
const SYNC_CHANGE_CHANNEL = 'controller/file/onSyncChange';

/**
 * 文件管理控制器
 * @class
 */
class FileController {
  /**
   * 注册文件变化监听（前端调用，建立 IPC 通道）
   */
  registerSyncCallback(_args: unknown, event: IpcMainEvent): void {
    SyncService.setChangeCallback((folderId: number) => {
      // 文件变化时，主动通知前端刷新
      event.sender.send(SYNC_CHANGE_CHANNEL, { folderId });
    });
    logger.info('[FileController] 注册文件变化回调');
  }

  /**
   * 添加授权文件夹：弹窗选择 → 入库 → 扫描 → 批量入库 → 启动监听
   */
  async addFolder(): Promise<{ success: boolean; folder?: AuthorizedFolder; folderList: AuthorizedFolder[]; message?: string }> {
    // 1. 弹窗选择文件夹
    const filePaths = dialog.showOpenDialogSync({
      properties: ['openDirectory', 'createDirectory'],
    });

    if (!filePaths || !filePaths.length) {
      return { success: false, folderList: filedbService.getFolderList(), message: '用户取消选择' };
    }

    const folderPath = filePaths[0];

    try {
      // 2. 存入授权文件夹表
      const folder = filedbService.addFolder(folderPath);
      logger.info(`[FileController] 添加授权文件夹: ${folderPath}, id=${folder.id}`);

      // 3. 递归扫描文件夹
      const scanItems = await FolderScanner.scanWithFolders(folderPath);
      logger.info(`[FileController] 扫描完成，共 ${scanItems.length} 项`);

      // 4. 批量入库
      filedbService.batchAddFileItems(folder.id, scanItems);

      // 5. 启动监听该文件夹
      SyncService.watchFolder(folder);

      // 6. 返回最新列表
      return {
        success: true,
        folder,
        folderList: filedbService.getFolderList(),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('[FileController] 添加文件夹失败:', msg);
      return {
        success: false,
        folderList: filedbService.getFolderList(),
        message: msg,
      };
    }
  }

  /**
   * 获取授权文件夹列表
   */
  getFolderList(): AuthorizedFolder[] {
    return filedbService.getFolderList();
  }

  /**
   * 获取子文件夹树形结构（左下树形表格）
   */
  getSubFolders(args: { folderId: number }): FileItemTreeNode[] {
    const { folderId } = args;
    return filedbService.getSubFolderTree(folderId);
  }

  /**
   * 获取某文件夹下的文件列表（右侧表格）
   * itemId=0 表示授权文件夹根目录
   */
  getFiles(args: { folderId: number; itemId: number }): FileItem[] {
    const { folderId, itemId } = args;
    return filedbService.getFiles(folderId, itemId);
  }

  /**
   * 重新扫描所有授权文件夹（程序启动时调用）
   */
  async rescanAll(): Promise<{ success: boolean }> {
    const folders = filedbService.getFolderList();
    for (const folder of folders) {
      try {
        await filedbService.rescanFolder(folder.id);
      } catch (err) {
        logger.error(`[FileController] 重新扫描失败 folderId=${folder.id}:`, err);
      }
    }
    return { success: true };
  }

  /**
   * 删除授权文件夹
   */
  deleteFolder(args: { folderId: number }): { success: boolean; folderList: AuthorizedFolder[] } {
    const { folderId } = args;
    // 停止监听该文件夹
    SyncService.unwatchFolder(folderId);
    filedbService.deleteFolder(folderId);
    return { success: true, folderList: filedbService.getFolderList() };
  }

  /**
   * 切换同步状态
   */
  toggleSync(args: { folderId: number }): AuthorizedFolder | null {
    const { folderId } = args;
    return filedbService.toggleSync(folderId);
  }
}

export default FileController;
