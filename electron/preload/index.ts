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
import { llmdbService } from '../service/database/llmdb';
import { qadbService } from '../service/database/qadb';
import { assistantdbService } from '../service/database/assistantdb';
import { metricsDbService } from '../components/rag/metrics/metricsDb';
import { windowService } from '../service/os/window';
import SyncService from '../components/file/SyncService';
import { ragService } from '../components/rag';

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
  await llmdbService.init();
  // 初始化 QA 问答记录表和 LLM 用量统计表
  await qadbService.init();
  await metricsDbService.init();
  // 初始化 Assistant 助手会话/消息/记忆上下文表
  await assistantdbService.init();

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

  // ★ 延迟 10 秒后启动 RAG 向量化
  //   等待程序完全启动（窗口加载、前端初始化等）后再开始处理，
  //   避免向量化与启动过程竞争资源导致卡顿。
  //   1. 恢复上次未完成的任务（PROCESSING → PENDING）
  //   2. 自动入队所有 PENDING 和 FAILED 的支持文件
  //   3. 创建 Worker 线程在后台执行（不阻塞主进程）
  setTimeout(async () => {
    try {
      logger.info('[preload] 10 秒延迟已到，开始启动 RAG 向量化...');
      const result = await ragService.restoreAndAutoStart(
        folders.map(f => ({ id: f.id, path: f.path }))
      );
      logger.info(`[preload] RAG 自动启动: 恢复 ${result.restored} 个未完成任务, 入队 ${result.queued} 个待处理任务`);
    } catch (err) {
      logger.error('[preload] RAG 自动启动失败:', err);
    }
  }, 10000);

  // go server
  //crossService.createGoServer();
}
