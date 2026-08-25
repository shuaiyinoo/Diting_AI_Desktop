// electron/components/file/SyncService.ts
import chokidar from 'chokidar';
import { logger } from 'ee-core/log';
import { filedbService } from '../../service/database/filedb';
import type { AuthorizedFolder, FileItem } from '../../service/database/filedb';

/** 同步扫描结果 */
export interface SyncScanResult {
  folderId: number;
  added: FileItem[];
  deleted: FileItem[];
  changed: FileItem[];
  unchanged: FileItem[];
}

type ChangeCallback = (result: SyncScanResult) => void;

/** 轮询间隔（毫秒）：5 分钟 */
const POLL_INTERVAL = 5 * 60 * 1000;

/**
 * 文件同步监听服务
 * - 本地文件夹：使用 chokidar 实时监听
 * - 网络文件夹：使用定时轮询（chokidar 不支持远程协议）
 * - 文件变化时自动重新扫描并更新数据库（智能同步：保留 hash/status）
 * - 通过回调通知前端刷新 + 触发 RAG 队列任务
 */
class SyncService {
    private watchers: Map<number, ReturnType<typeof chokidar.watch>> = new Map();
    /** 轮询定时器：folderId → timer */
    private pollTimers: Map<number, NodeJS.Timeout> = new Map();
    private isWatching = false;
    private changeCallback: ChangeCallback | null = null;
    // 防抖：避免短时间内大量文件变更触发多次扫描
    private debounceTimers: Map<number, NodeJS.Timeout> = new Map();

    /**
     * 设置变化回调函数
     */
    setChangeCallback(callback: ChangeCallback): void {
        this.changeCallback = callback;
    }

    /**
     * 启动监听所有授权文件夹
     */
    startWatchAll(): void {
        if (this.isWatching) {
            logger.warn('[SyncService] 监听已启动，无需重复启动');
            return;
        }

        const folders = filedbService.getFolderList();
        for (const folder of folders) {
            this.watchFolder(folder);
        }
        this.isWatching = true;
        logger.info(`[SyncService] 已启动 ${folders.length} 个文件夹的监听`);
    }
    /**
     * 监听单个文件夹
     * 根据协议类型选择监听策略：
     *   - local：chokidar 实时监听
     *   - 远程协议：定时轮询
     */
    watchFolder(folder: AuthorizedFolder): void {
        // 如果已在监听，先停止
        this.unwatchFolder(folder.id);

        const protocol = folder.protocol || 'local';

        if (protocol === 'local') {
            this.watchLocalFolder(folder);
        } else {
            this.watchRemoteFolder(folder);
        }
    }

    /**
     * 监听本地文件夹（chokidar）
     */
    private watchLocalFolder(folder: AuthorizedFolder): void {
        logger.info(`[SyncService] 启动监听 (local): ${folder.path}`);

        const watcher = chokidar.watch(folder.path, {
            ignored: /(^|[\/\\])\./, // 忽略隐藏文件
            persistent: true,
            ignoreInitial: true,
            depth: 20, // 递归深度
        });

        const handleChange = () => this.onFolderChange(folder.id);

        watcher
            .on('add', handleChange)
            .on('change', handleChange)
            .on('unlink', handleChange)
            .on('addDir', handleChange)
            .on('unlinkDir', handleChange)
            .on('error', (error) => logger.error('[SyncService] 监听错误:', error));

        this.watchers.set(folder.id, watcher);
    }

    /**
     * 监听远程文件夹（定时轮询）
     */
    private watchRemoteFolder(folder: AuthorizedFolder): void {
        logger.info(`[SyncService] 启动轮询 (${folder.protocol}): ${folder.path}`);

        const timer = setInterval(() => {
            this.onFolderChange(folder.id).catch(err => {
                logger.error(`[SyncService] 轮询同步失败 folderId=${folder.id}:`, err);
            });
        }, POLL_INTERVAL);

        this.pollTimers.set(folder.id, timer);
    }

    /**
     * 停止监听单个文件夹
     */
    unwatchFolder(folderId: number): void {
        // 停止 chokidar
        const watcher = this.watchers.get(folderId);
        if (watcher) {
            watcher.close();
            this.watchers.delete(folderId);
            logger.info(`[SyncService] 停止监听 folderId=${folderId}`);
        }
        // 停止轮询
        const timer = this.pollTimers.get(folderId);
        if (timer) {
            clearInterval(timer);
            this.pollTimers.delete(folderId);
            logger.info(`[SyncService] 停止轮询 folderId=${folderId}`);
        }
        // 清除防抖定时器
        const debounceTimer = this.debounceTimers.get(folderId);
        if (debounceTimer) {
            clearTimeout(debounceTimer);
            this.debounceTimers.delete(folderId);
        }
    }
    /**
     * 文件变化处理（带防抖）
     * 使用智能同步扫描，保留未变化文件的 hash/status
     */
    private async onFolderChange(folderId: number): Promise<void> {
        // 清除之前的防抖定时器
        const existingTimer = this.debounceTimers.get(folderId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // 设置新的防抖定时器（500ms 后执行）
        const timer = setTimeout(async () => {
            this.debounceTimers.delete(folderId);
            logger.info(`[SyncService] 检测到变化，智能同步扫描 folderId=${folderId}`);

            try {
                // 智能同步扫描：保留 hash/status，检测删除和变化
                const result = await filedbService.syncScanFolder(folderId);
                logger.info(
                    `[SyncService] 同步结果 folderId=${folderId}: added=${result.added.length}, deleted=${result.deleted.length}, changed=${result.changed.length}, unchanged=${result.unchanged.length}`
                );
                // 通知回调（包含同步结果，用于触发 RAG 队列 + 前端刷新）
                if (this.changeCallback) {
                    this.changeCallback({ folderId, ...result });
                }
            } catch (err) {
                logger.error(`[SyncService] 同步扫描失败 folderId=${folderId}:`, err);
            }
        }, 500);

        this.debounceTimers.set(folderId, timer);
    }

    /**
     * 停止所有监听
     */
    stopAll(): void {
        for (const [folderId] of this.watchers) {
            this.unwatchFolder(folderId);
        }
        this.isWatching = false;
        logger.info('[SyncService] 已停止所有文件监听');
    }
}

// 导出单例
export default new SyncService();
