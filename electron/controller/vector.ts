/**
 * 向量模型管理控制器
 *
 * 提供：
 *   1. 本地向量嵌入模型列表、下载、删除、选择
 *   2. 模型下载进度推送
 *
 * 前端通过 ipcApiRoute.vector.* 调用。
 */

import type { IpcMainInvokeEvent } from 'electron';
import { embed } from '@kreuzberg/node';
import { logger } from 'ee-core/log';
import { vectordbService } from '../service/database/vectordb';
import { ragService } from '../components/rag';
import {
  downloadVectorModel,
  cancelVectorDownload,
  deleteVectorModel,
  getVectorModelDir,
  getModelStatuses,
  getAllModelStatuses,
  getModelDefAny,
  deleteCustomVectorModel,
  parseHuggingFaceUrl,
  getCustomModelCacheDir,
  registerCustomModelForDownload,
  type VectorDownloadProgress,
  type VectorModelDef,
} from '../service/vector/vector-model-service';

// 下载进度推送通道
const DOWNLOAD_PROGRESS_CHANNEL = 'controller/vector/onDownloadProgress';

/** 本地模型操作参数 */
interface LocalModelArgs {
  action: 'list' | 'download' | 'cancelDownload' | 'delete' | 'select' | 'getSelected' | 'getDir' | 'downloadCustom' | 'resetVectorData';
  /** 模型 ID */
  filename?: string;
  useMirror?: boolean;
  /** 自定义模型 HuggingFace URL */
  url?: string;
  /** 自定义模型维度 */
  dimensions?: number;
}

/** 本地模型操作返回 */
interface LocalModelResult {
  action: string;
  code: number;
  message?: string;
  data?: unknown;
}

/** 下载进度统一格式（与 OCR/语音模型兼容） */
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

class VectorController {
  private initialized = false;

  /**
   * 初始化数据库
   */
  private async ensureDb(): Promise<void> {
    if (!this.initialized) {
      await vectordbService.init();
      this.initialized = true;
    }
  }

  /**
   * 本地向量模型操作
   */
  async localOperation(args: LocalModelArgs, event?: IpcMainInvokeEvent): Promise<LocalModelResult> {
    await this.ensureDb();
    const { action, filename, useMirror } = args;
    logger.info(`[VectorController] localOperation: action=${action}, filename=${filename ?? '-'}`);

    try {
      switch (action) {
        case 'list': {
          // 返回预设 + 自定义模型的状态
          const statuses = getAllModelStatuses();
          return { action, code: 0, data: statuses };
        }

        case 'download': {
          if (!filename) return { action, code: -1, message: '缺少 filename 参数' };
          const modelId = filename;

          // 异步下载，通过 IPC 推送进度
          const sender = event?.sender;

          downloadVectorModel(
            modelId,
            useMirror ?? false,
            (progress: VectorDownloadProgress) => {
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
            logger.info(`[VectorController] 向量模型下载完成: ${modelId}`);
          }).catch((err) => {
            logger.error(`[VectorController] 向量模型下载失败: ${modelId}`, err);
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
          const ok = cancelVectorDownload(filename);
          return { action, code: ok ? 0 : -1, message: ok ? '已取消下载' : '没有进行中的下载' };
        }

        case 'delete': {
          if (!filename) return { action, code: -1, message: '缺少 filename 参数' };
          const isCustom = filename.startsWith('custom_');
          const ok = isCustom ? deleteCustomVectorModel(filename) : deleteVectorModel(filename);
          // 如果删除的是当前选择的模型，清除选择
          const config = vectordbService.getConfig();
          if (ok && config.selected_model === filename) {
            vectordbService.setSelectedModel(null, null);
          }
          return { action, code: ok ? 0 : -1, message: ok ? '删除成功' : '删除失败' };
        }

        case 'select': {
          if (!filename) return { action, code: -1, message: '缺少 filename 参数' };
          // 查找模型定义以获取维度
          const selDef = getModelDefAny(filename);
          if (!selDef) {
            return { action, code: -1, message: `模型 ${filename} 定义不存在` };
          }
          const dims = selDef.dimensions ?? null;

          // 先验证模型是否可用（预热推理）
          // 如果验证失败，不写入数据库，返回错误提示用户
          try {
            logger.info(`[VectorController] 验证模型 ${filename} 是否可用...`);
            await verifyModelUsable(filename, selDef);
            logger.info(`[VectorController] 模型 ${filename} 验证通过`);
          } catch (verifyErr) {
            const verifyMsg = verifyErr instanceof Error ? verifyErr.message : String(verifyErr);
            logger.error(`[VectorController] 模型 ${filename} 验证失败:`, verifyErr);
            return { action, code: -1, message: `模型验证失败: ${verifyMsg}` };
          }

          // 验证通过，写入数据库
          vectordbService.setSelectedModel(filename, dims);
          logger.info(`[VectorController] 选择模型: ${filename}, dims=${dims ?? '-'}`);
          // 选择新模型后，触发队列中待处理文件开始向量化
          ragService.requeueAndStart().catch(err => {
            logger.error('[VectorController] 重新启动向量化失败:', err);
          });
          return { action, code: 0, message: '选择成功' };
        }

        case 'getSelected': {
          const config = vectordbService.getConfig();
          return { action, code: 0, data: config.selected_model };
        }

        case 'getDir': {
          const dir = getVectorModelDir();
          return { action, code: 0, data: dir };
        }

        case 'downloadCustom': {
          // 自定义模型下载（模型市场）
          if (!args.url) return { action, code: -1, message: '缺少 url 参数' };
          if (!args.dimensions || args.dimensions <= 0) return { action, code: -1, message: '缺少或无效的 dimensions 参数' };

          // 解析 HuggingFace URL
          const hfModelId = parseHuggingFaceUrl(args.url);
          if (!hfModelId) {
            return { action, code: -1, message: '无法解析模型地址，请输入有效的 HuggingFace 模型 URL' };
          }

          const dimensions = args.dimensions;
          const sender = event?.sender;

          logger.info(`[VectorController] 下载自定义模型: ${hfModelId}, dims=${dimensions}`);

          // 注册模型并确保目录存在
          const modelId = registerCustomModelForDownload(hfModelId, dimensions);

          // 异步触发引擎下载（不阻塞响应）
          // 引擎会直连 HuggingFace 下载到 HF Hub 缓存目录，
          // 失败后由镜像兜底逻辑从 hf-mirror.com 下载
          triggerEngineDownload(modelId, hfModelId, dimensions, sender).then(() => {
            logger.info(`[VectorController] 自定义模型下载完成: ${modelId}`);
            if (sender && !sender.isDestroyed()) {
              sender.send(DOWNLOAD_PROGRESS_CHANNEL, {
                filename: hfModelId,
                downloaded: 0,
                total: 0,
                percent: 100,
                speed: 0,
                done: true,
                modelId,
              } satisfies DownloadProgressUnified);
            }
          }).catch((err) => {
            logger.error('[VectorController] 自定义模型下载失败:', err);
            if (sender && !sender.isDestroyed()) {
              sender.send(DOWNLOAD_PROGRESS_CHANNEL, {
                filename: hfModelId,
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

          return { action, code: 0, message: '下载已开始', data: modelId };
        }

        case 'resetVectorData': {
          // 重置所有向量数据（切换向量模型时调用）
          // 清空 zvec 向量库、SQLite document_chunks/vector_store 表、
          // MiniSearch 关键词索引，并重置所有 file_item 状态为 PENDING
          try {
            await ragService.resetAllVectorData();
            return { action, code: 0, message: '向量数据已重置，文件将在下次处理时使用新模型重新向量化' };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error('[VectorController] 重置向量数据失败:', err);
            return { action, code: -1, message: `重置向量数据失败: ${msg}` };
          }
        }

        default:
          return { action, code: -1, message: `未知操作: ${action}` };
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('[VectorController] localOperation 异常:', error);
      return { action, code: -1, message: `操作失败: ${errMsg}` };
    }
  }
}

export default VectorController;
export const vectorController = new VectorController();

/**
 * 触发引擎下载自定义模型（不依赖数据库 selectedModel）
 *
 * 直接使用 @kreuzberg/node 的 embed 做一次预热推理，
 * 引擎会自动从 HuggingFace 下载模型文件到 HF Hub 缓存目录。
 * 如果直连失败（10秒超时），走镜像兜底逻辑从 hf-mirror.com 下载。
 *
 * 下载完成后不做预热验证——验证在用户选择模型时（select action）进行。
 *
 * @param modelId    模型 ID
 * @param hfModelId  HuggingFace 模型 ID（如 onnx-community/Qwen3-Embedding-0.6B-ONNX）
 * @param dimensions  向量维度
 */
async function triggerEngineDownload(
  modelId: string,
  hfModelId: string,
  dimensions: number,
  sender?: IpcMainInvokeEvent['sender'],
): Promise<void> {
  const { getModelLocalDir, downloadCustomVectorModelFromMirror } = await import('../service/vector/vector-model-service');
  const cacheDir = getModelLocalDir(modelId);

  logger.info(`[VectorController] 引擎下载开始: ${hfModelId}, cacheDir=${cacheDir}`);

  // 进度推送辅助函数
  const sendProgress = (progress: Partial<DownloadProgressUnified>) => {
    if (sender && !sender.isDestroyed()) {
      sender.send(DOWNLOAD_PROGRESS_CHANNEL, {
        filename: hfModelId,
        downloaded: 0,
        total: 0,
        percent: 0,
        speed: 0,
        done: false,
        modelId,
        ...progress,
      } satisfies DownloadProgressUnified);
    }
  };

  const embedConfig = {
    model: {
      modelType: 'custom' as const,
      value: hfModelId,
      dimensions,
    },
    normalize: true,
    showDownloadProgress: false,
    cacheDir,
  };

  // 第一次尝试：直连 HuggingFace，10 秒超时
  // 如果引擎能直连下载成功，直接返回
  sendProgress({ percent: 0 });
  try {
    await embedWithTimeout(['warmup'], embedConfig, 10_000);
    logger.info(`[VectorController] 引擎直连下载完成: ${modelId}`);
    return;
  } catch (firstError) {
    const msg = firstError instanceof Error ? firstError.message : String(firstError);
    if (!/timeout|超时|Connection refused|Connection reset|download|Failed to|network|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(msg)) {
      throw firstError;
    }
    logger.warn(`[VectorController] 引擎直连失败，走镜像兜底: ${msg}`);
  }

  // 第二次尝试：从镜像下载 → 构建 HF Hub 缓存
  // 下载完成后直接返回，不做预热验证
  // 验证逻辑在用户选择模型时（select action）进行
  sendProgress({ percent: 5, downloaded: 0, total: 0 });
  await downloadCustomVectorModelFromMirror(modelId);
  logger.info(`[VectorController] 镜像下载完成: ${modelId}`);
}

/**
 * 带超时控制的 embed 调用
 */
function embedWithTimeout(texts: string[], config: Parameters<typeof embed>[1], timeoutMs: number): Promise<number[][]> {
  return new Promise<number[][]>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`模型预热超时（${timeoutMs}ms），可能无法连接 HuggingFace`));
    }, timeoutMs);
    embed(texts, config)
      .then(result => { clearTimeout(timer); resolve(result); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

/**
 * 验证模型是否可用（预热推理）
 *
 * 在用户选择模型时调用，先用 @kreuzberg/node 做一次预热推理，
 * 验证模型文件是否完整、能否正常加载。
 * 验证通过后才写入数据库，避免选择了不可用的模型导致后续向量化全部失败。
 *
 * @param modelId  模型 ID
 * @param def      模型定义
 */
async function verifyModelUsable(modelId: string, def: VectorModelDef): Promise<void> {
  const { getModelLocalDir } = await import('../service/vector/vector-model-service');
  const cacheDir = getModelLocalDir(modelId);

  const embedConfig = {
    model: {
      modelType: def.modelType as 'preset' | 'custom',
      value: def.modelType === 'preset' ? (def.presetName ?? def.id) : def.hfModelId,
      ...(def.modelType === 'custom' ? { dimensions: def.dimensions } : {}),
    } as const,
    normalize: true,
    showDownloadProgress: false,
    cacheDir,
  };

  logger.info(`[VectorController] 预热验证模型: ${modelId}, cacheDir=${cacheDir}`);

  // 设 HF_HUB_OFFLINE=1 强制使用本地缓存（模型已下载）
  const savedOffline = process.env.HF_HUB_OFFLINE;
  process.env.HF_HUB_OFFLINE = '1';
  try {
    await embedWithTimeout(['warmup'], embedConfig, 60_000);
  } finally {
    // 恢复原值
    if (savedOffline === undefined) {
      delete process.env.HF_HUB_OFFLINE;
    } else {
      process.env.HF_HUB_OFFLINE = savedOffline;
    }
  }
}
