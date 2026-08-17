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
  logger.info('[preload] load 5');

  // 同步初始化（轻量，不阻塞）
  windowService.init();
  trayService.init();
  securityService.init();
  //autoUpdaterService.init();

  // ★ 优化：数据库初始化改为并行执行，不阻塞 loadServer() 加载前端页面
  //   原先 6 个 init() 串行 await，加上文件夹扫描，可能阻塞数秒导致空白窗口。
  //   现在改为 Promise.all 并行初始化，完成后再异步执行文件夹扫描和文件监听。
  //   前端页面可以在这期间开始加载和渲染。
  initDatabasesAndServices().catch((err) => {
    logger.error('[preload] 数据库初始化或后续服务启动失败:', err);
  });

  // go server
  //crossService.createGoServer();
}

/**
 * 并行初始化所有数据库，完成后再执行文件夹扫描、文件监听和 RAG 向量化。
 *
 * 所有操作均为异步、不阻塞 preload 返回，让 ee-core 尽快执行 loadServer()
 * 加载前端页面。
 */
async function initDatabasesAndServices(): Promise<void> {
  // 1. 并行初始化所有数据库
  await Promise.all([
    sqlitedbService.init(),
    filedbService.init(),
    llmdbService.init(),
    qadbService.init(),
    metricsDbService.init(),
    assistantdbService.init(),
  ]);
  logger.info('[preload] 所有数据库初始化完成');

  // 2. 数据库就绪后，重新扫描所有授权文件夹（异步，不阻塞）
  const folders = filedbService.getFolderList();
  if (folders.length > 0) {
    logger.info(`[preload] 重新扫描 ${folders.length} 个授权文件夹`);
    for (const folder of folders) {
      filedbService.rescanFolder(folder.id).catch((err) => {
        logger.error(`[preload] 重新扫描失败 folderId=${folder.id}:`, err);
      });
    }
  }

  // 3. 启动文件监听（实时同步）
  SyncService.startWatchAll();

  // 4. 延迟 10 秒后启动 RAG 向量化
  //    等待程序完全启动（窗口加载、前端初始化等）后再开始处理，
  //    避免向量化与启动过程竞争资源导致卡顿。
  //    1. 恢复上次未完成的任务（PROCESSING → PENDING）
  //    2. 自动入队所有 PENDING 和 FAILED 的支持文件
  //    3. 创建 Worker 线程在后台执行（不阻塞主进程）
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
}
