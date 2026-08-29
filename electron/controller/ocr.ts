/**
 * OCR 模型管理控制器
 *
 * 提供：
 *   1. 本地 OCR 模型列表、下载、删除、选择
 *   2. 模型下载进度推送
 *
 * 前端通过 ipcApiRoute.ocr.* 调用。
 */

import type { IpcMainInvokeEvent } from 'electron';
import { logger } from 'ee-core/log';
import { ocrdbService } from '../service/database/ocrdb';
import {
  downloadOcrModel,
  cancelOcrDownload,
  deleteOcrModel,
  getOcrModelDir,
  getModelStatuses,
  type OcrDownloadProgress,
} from '../service/ocr/ocr-model-service';

// 下载进度推送通道
const DOWNLOAD_PROGRESS_CHANNEL = 'controller/ocr/onDownloadProgress';

/** 本地模型操作参数 */
interface LocalModelArgs {
  action: 'list' | 'download' | 'cancelDownload' | 'delete' | 'select' | 'getSelected' | 'getDir';
  /** 模型 ID */
  filename?: string;
  useMirror?: boolean;
}

/** 本地模型操作返回 */
interface LocalModelResult {
  action: string;
  code: number;
  message?: string;
  data?: unknown;
}

/** 下载进度统一格式（与语音模型兼容，方便前端复用） */
interface DownloadProgressUnified {
  filename: string;
  downloaded: number;
  total: number;
  percent: number;
  speed: number;
  done: boolean;
  error?: string;
  modelId?: string;
}

class OcrController {
  private initialized = false;

  /**
   * 初始化数据库
   */
  private async ensureDb(): Promise<void> {
    if (!this.initialized) {
      await ocrdbService.init();
      this.initialized = true;
    }
  }

  /**
   * 本地 OCR 模型操作
   */
  async localOperation(args: LocalModelArgs, event?: IpcMainInvokeEvent): Promise<LocalModelResult> {
    await this.ensureDb();
    const { action, filename, useMirror } = args;
    logger.info(`[OcrController] localOperation: action=${action}, filename=${filename ?? '-'}`);

    try {
      switch (action) {
        case 'list': {
          const statuses = getModelStatuses();
          return { action, code: 0, data: statuses };
        }

        case 'download': {
          if (!filename) return { action, code: -1, message: '缺少 filename 参数' };
          const modelId = filename;

          // 异步下载，通过 IPC 推送进度
          const sender = event?.sender;

          downloadOcrModel(
            modelId,
            useMirror ?? false,
            (progress: OcrDownloadProgress) => {
              if (sender && !sender.isDestroyed()) {
                sender.send(DOWNLOAD_PROGRESS_CHANNEL, {
                  filename: progress.filename,
                  downloaded: progress.downloaded,
                  total: progress.total,
                  percent: progress.percent,
                  speed: progress.speed,
                  done: progress.done,
                  error: progress.error,
                  modelId: progress.modelId,
                } satisfies DownloadProgressUnified);
              }
            },
          ).then(() => {
            logger.info(`[OcrController] OCR 模型下载完成: ${modelId}`);
          }).catch((err) => {
            logger.error(`[OcrController] OCR 模型下载失败: ${modelId}`, err);
            if (sender && !sender.isDestroyed()) {
              sender.send(DOWNLOAD_PROGRESS_CHANNEL, {
                filename: modelId,
                downloaded: 0,
                total: 0,
                percent: 0,
                speed: 0,
                done: true,
                error: err instanceof Error ? err.message : String(err),
                modelId,
              } satisfies DownloadProgressUnified);
            }
          });

          return { action, code: 0, message: '下载已开始' };
        }

        case 'cancelDownload': {
          if (!filename) return { action, code: -1, message: '缺少 filename 参数' };
          const ok = cancelOcrDownload(filename);
          return { action, code: ok ? 0 : -1, message: ok ? '已取消下载' : '没有进行中的下载' };
        }

        case 'delete': {
          if (!filename) return { action, code: -1, message: '缺少 filename 参数' };
          const ok = deleteOcrModel(filename);
          // 如果删除的是当前选择的模型，清除选择
          const config = ocrdbService.getConfig();
          if (ok && config.selected_model === filename) {
            ocrdbService.setSelectedModel(null);
          }
          return { action, code: ok ? 0 : -1, message: ok ? '删除成功' : '删除失败' };
        }

        case 'select': {
          if (!filename) return { action, code: -1, message: '缺少 filename 参数' };
          ocrdbService.setSelectedModel(filename);
          logger.info(`[OcrController] 选择模型: ${filename}`);
          return { action, code: 0, message: '选择成功' };
        }

        case 'getSelected': {
          const config = ocrdbService.getConfig();
          return { action, code: 0, data: config.selected_model };
        }

        case 'getDir': {
          const dir = getOcrModelDir();
          return { action, code: 0, data: dir };
        }

        default:
          return { action, code: -1, message: `未知操作: ${action}` };
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('[OcrController] localOperation 异常:', error);
      return { action, code: -1, message: `操作失败: ${errMsg}` };
    }
  }
}

export default OcrController;
export const ocrController = new OcrController();
