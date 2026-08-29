/**
 * Embedding 提供者（基于 @kreuzberg/node）
 *
 * ★ 为什么用 @kreuzberg/node 而非 @huggingface/transformers：
 *   - @kreuzberg/node 是 Rust 实现，ONNX Runtime 通过 Rust ort crate 直接链接 C 库
 *   - 不经过 Node.js NAPI 层，在 Electron 主进程中不会崩溃
 *   - @huggingface/transformers 依赖 onnxruntime-node（NAPI 原生模块），
 *     在 Electron 主进程运行推理时会触发 SIGTRAP 崩溃
 *
 * ★ 模型选择：用户必须在设置中下载并选择模型
 *   - 无模型时不回退，直接抛出 NoVectorModelError 提示用户去设置下载
 *   - 用户可在设置页面「向量模型配置」中下载和选择模型
 *   - 选择的模型存储在 vector_config 表中
 *   - 模型缓存在 ~/.diting/model/vector/<modelId>/ 目录
 *
 * ★ 性能：
 *   - Rust 原生实现，推理速度比 JS/WASM 快
 *   - 异步 API（embed），不阻塞事件循环
 *   - 支持批量推理
 */

import { embed } from '@kreuzberg/node';
import fs from 'fs';
import type { EmbeddingProvider } from '../types';
import { logger } from 'ee-core/log';
import { vectordbService } from '../../../service/database/vectordb';
import { getModelDefAny, getModelLocalDir, downloadVectorModelFromMirror, downloadCustomVectorModelFromMirror } from '../../../service/vector/vector-model-service';

export interface QwenEmbedderConfig {
  concurrency?: number;
  cacheSize?: number;
}

/** 模型配置（从数据库读取） */
interface ResolvedModelConfig {
  /** @kreuzberg/node 的模型类型 */
  modelType: 'preset' | 'custom';
  /** 预设名或 HuggingFace 模型 ID */
  value: string;
  /** 向量维度 */
  dimensions: number;
  /** 模型缓存目录（如果有） */
  cacheDir?: string;
  /** 内部模型 ID（用于镜像兜底下载） */
  modelId: string;
}

/** 无可用模型时抛出的错误 */
export class NoVectorModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NoVectorModelError';
  }
}

export class QwenEmbedderProvider implements EmbeddingProvider {
  private _dimension: number = 0;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private dbInitialized = false;
  private resolvedConfig: ResolvedModelConfig | null = null;

  constructor(_config: QwenEmbedderConfig = {}) {
    // config 目前未使用，保留接口兼容
  }

  get dimension(): number {
    return this._dimension;
  }

  /**
   * 从数据库读取用户选择的模型配置
   *
   * 如果用户未选择或选择的模型未下载，抛出错误提示用户去设置中下载向量模型。
   */
  private async resolveModelConfig(): Promise<ResolvedModelConfig> {
    // 确保数据库已初始化
    if (!this.dbInitialized) {
      try {
        await vectordbService.init();
        this.dbInitialized = true;
      } catch (err) {
        logger.warn('[Embedding] 初始化 vectordb 失败:', err);
      }
    }

    // 读取用户选择
    let selectedModelId: string | null = null;
    try {
      const config = vectordbService.getConfig();
      selectedModelId = config.selected_model;
    } catch (err) {
      logger.warn('[Embedding] 读取向量模型配置失败:', err);
    }

    if (!selectedModelId) {
      throw new NoVectorModelError('未选择向量模型，请前往「设置 → 向量模型配置」下载并选择模型');
    }

    const def = getModelDefAny(selectedModelId);
    if (!def) {
      throw new NoVectorModelError(`向量模型 ${selectedModelId} 定义不存在，请前往「设置 → 向量模型配置」重新选择`);
    }

    // 获取模型的 cacheDir 路径
    // 预设和自定义模型都统一使用 HF Hub 缓存结构，让引擎自行下载
    // 镜像兜底逻辑在 ensureModel 中处理
    let cacheDir: string | null;
    if (def.modelType === 'custom') {
      // 自定义模型：返回 localDir 作为 cacheDir，引擎会在其下构建 HF Hub 缓存
      cacheDir = getModelLocalDir(selectedModelId);
    } else {
      // 预设模型：同上
      cacheDir = getModelLocalDir(selectedModelId);
    }
    // 确保目录存在
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    logger.info(`[Embedding] 使用用户选择的模型: ${def.label} (${def.dimensions} 维), cacheDir=${cacheDir}`);
    return {
      modelType: def.modelType,
      value: def.modelType === 'preset' ? (def.presetName ?? def.id) : def.hfModelId,
      dimensions: def.dimensions,
      cacheDir,
      modelId: selectedModelId,
    };
  }

  /** 首次预热超时时间（毫秒），超时后走镜像兜底 */
  private static readonly WARMUP_TIMEOUT_MS = 10_000;

  /**
   * 调用 @kreuzberg/node 的 embed 函数，带超时控制
   *
   * @param texts  待嵌入文本
   * @param config 嵌入配置
   * @param timeoutMs 超时时间（毫秒）
   * @returns 嵌入结果，或在超时/网络错误时抛出
   */
  private async embedWithTimeout(
    texts: string[],
    config: Parameters<typeof embed>[1],
    timeoutMs: number,
  ): Promise<number[][]> {
    return new Promise<number[][]>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`模型预热超时（${timeoutMs}ms），可能无法连接 HuggingFace`));
      }, timeoutMs);

      embed(texts, config)
        .then(result => { clearTimeout(timer); resolve(result); })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  /**
   * 通过镜像从 HuggingFace 下载模型文件并构建 HF Hub 缓存
   *
   * 当直连 HuggingFace 超时或失败时，改用 hf-mirror.com 镜像下载文件，
   * 构建标准的 HF Hub 缓存目录结构，使引擎在重试时直接读取本地缓存。
   *
   * @param modelId 模型 ID
   */
  private async downloadViaMirror(modelId: string): Promise<void> {
    const def = getModelDefAny(modelId);
    if (!def) return;

    logger.info(`[Embedding] 直连 HuggingFace 失败，切换到 hf-mirror.com 镜像下载...`);

    if (def.modelType === 'preset') {
      await downloadVectorModelFromMirror(def.id);
    } else {
      await downloadCustomVectorModelFromMirror(def.id);
    }

    logger.info(`[Embedding] 镜像下载完成，重试模型预热...`);
  }

  /**
   * 判断错误是否为网络/下载相关
   */
  private isNetworkError(error: unknown): boolean {
    const msg = error instanceof Error ? error.message : String(error);
    return /timeout|超时|Connection refused|Connection reset|download|Failed to|network|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(msg);
  }

  /**
   * 初始化（首次调用时执行一次预热推理，确保模型加载完成）
   *
   * 策略：
   *   1. 先让 @kreuzberg/node 直连 HuggingFace 下载模型（10 秒超时）
   *   2. 如果超时或网络错误 → 从 hf-mirror.com 镜像手动下载 → 构建 HF Hub 缓存
   *   3. 重试 embed() → 引擎发现缓存已存在，直接使用本地文件
   */
  async ensureModel(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }
    this.initPromise = (async () => {
      try {
        // 解析用户配置（无模型时直接抛出 NoVectorModelError）
        this.resolvedConfig = await this.resolveModelConfig();
        this._dimension = this.resolvedConfig.dimensions;

        const embedConfig = {
          model: {
            modelType: this.resolvedConfig.modelType,
            value: this.resolvedConfig.value,
            ...(this.resolvedConfig.modelType === 'custom' ? { dimensions: this.resolvedConfig.dimensions } : {}),
          } as const,
          normalize: true,
          showDownloadProgress: false,
          ...(this.resolvedConfig.cacheDir ? { cacheDir: this.resolvedConfig.cacheDir } : {}),
        };

        logger.info(`[Embedding] 预热嵌入模型 (type=${this.resolvedConfig.modelType}, value=${this.resolvedConfig.value}, dims=${this._dimension}, cacheDir=${this.resolvedConfig.cacheDir ?? '(default)'})...`);

        // 第一次尝试：直连 HuggingFace，10 秒超时
        const t0 = Date.now();
        try {
          await this.embedWithTimeout(['warmup'], embedConfig, QwenEmbedderProvider.WARMUP_TIMEOUT_MS);
          const t1 = Date.now();
          logger.info(`[Embedding] 模型预热完成，耗时 ${t1 - t0}ms`);
          this.initialized = true;
          return;
        } catch (firstError) {
          // 如果不是网络/下载相关错误，直接抛出
          if (!this.isNetworkError(firstError)) {
            throw firstError;
          }
          logger.warn(`[Embedding] 首次预热失败（网络相关），准备走镜像兜底: ${firstError instanceof Error ? firstError.message : String(firstError)}`);
        }

        // 第二次尝试：从镜像下载模型文件 → 构建 HF Hub 缓存 → 重试
        await this.downloadViaMirror(this.resolvedConfig.modelId);
        // 镜像下载完成后，缓存已手动构建。设 HF_HUB_OFFLINE=1 让引擎跳过
        // HuggingFace 网络验证直接读取本地缓存。不恢复原值——因为我们的镜像
        // 缓存只包含 model_quantized.onnx，恢复在线模式后引擎会发现
        // model.onnx 不在缓存中而重新下载 415MB 的完整版本。
        process.env.HF_HUB_OFFLINE = '1';
        const t2 = Date.now();
        await this.embedWithTimeout(['warmup'], embedConfig, 60_000);
        const t3 = Date.now();
        logger.info(`[Embedding] 镜像兜底后预热完成，耗时 ${t3 - t2}ms`);
        this.initialized = true;
      } catch (error: any) {
        // 重置 initPromise 以便重试
        this.initPromise = null;
        // 如果是 NoVectorModelError，直接向上抛出，让调用方提示用户
        if (error instanceof NoVectorModelError) {
          throw error;
        }
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`嵌入模型初始化失败: ${msg}`);
      }
    })();
    await this.initPromise;
  }

  async embed(text: string): Promise<number[]> {
    await this.ensureModel();
    const results = await embed([text], {
      model: {
        modelType: this.resolvedConfig!.modelType,
        value: this.resolvedConfig!.value,
        ...(this.resolvedConfig!.modelType === 'custom' ? { dimensions: this.resolvedConfig!.dimensions } : {}),
      },
      normalize: true,
      ...(this.resolvedConfig!.cacheDir ? { cacheDir: this.resolvedConfig!.cacheDir } : {}),
    });
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    await this.ensureModel();
    return embed(texts, {
      model: {
        modelType: this.resolvedConfig!.modelType,
        value: this.resolvedConfig!.value,
        ...(this.resolvedConfig!.modelType === 'custom' ? { dimensions: this.resolvedConfig!.dimensions } : {}),
      },
      normalize: true,
      ...(this.resolvedConfig!.cacheDir ? { cacheDir: this.resolvedConfig!.cacheDir } : {}),
    });
  }
}
