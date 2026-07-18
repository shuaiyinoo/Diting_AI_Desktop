/**
 * Embedding 提供者（基于 @kreuzberg/node）
 *
 * ★ 为什么用 @kreuzberg/node 而非 @huggingface/transformers：
 *   - @kreuzberg/node 是 Rust 实现，ONNX Runtime 通过 Rust ort crate 直接链接 C 库
 *   - 不经过 Node.js NAPI 层，在 Electron 主进程中不会崩溃
 *   - @huggingface/transformers 依赖 onnxruntime-node（NAPI 原生模块），
 *     在 Electron 主进程运行推理时会触发 SIGTRAP 崩溃
 *
 * ★ 模型选择：multilingual 预设（768 维）
 *   - 模型：intfloat/multilingual-e5-base
 *   - 支持 100+ 语言（含中文），适合本项目中文文档场景
 *   - 与 balanced 预设同为 768 维，但支持中文
 *   - 模型缓存在 ~/.kreuzberg/models/，首次使用自动下载
 *
 * ★ 性能：
 *   - Rust 原生实现，推理速度比 JS/WASM 快
 *   - 异步 API（embed），不阻塞事件循环
 *   - 支持批量推理
 */

import { embed } from '@kreuzberg/node';
import type { EmbeddingProvider } from '../types';
import { logger } from 'ee-core/log';

export interface QwenEmbedderConfig {
  concurrency?: number;
  cacheSize?: number;
}

// 使用 multilingual 预设（768 维，支持中文）
const EMBEDDING_PRESET = 'multilingual';
const EMBEDDING_DIMENSION = 768;

export class QwenEmbedderProvider implements EmbeddingProvider {
  private readonly _dimension = EMBEDDING_DIMENSION;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(_config: QwenEmbedderConfig = {}) {
    // config 目前未使用，保留接口兼容
  }

  get dimension(): number {
    return this._dimension;
  }

  /**
   * 初始化（首次调用时执行一次预热推理，确保模型加载完成）
   * @kreuzberg/node 的 embed 函数会在首次调用时自动加载模型，后续调用复用缓存。
   */
  private async ensureModel(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) {
      await this.initPromise;
      return;
    }
    this.initPromise = (async () => {
      try {
        logger.info(`[Embedding] 预热嵌入模型 (preset=${EMBEDDING_PRESET}, dims=${EMBEDDING_DIMENSION})...`);
        // 执行一次小推理预热模型（首次会加载模型，后续调用很快）
        const t0 = Date.now();
        await embed(['warmup'], {
          model: { modelType: 'preset', value: EMBEDDING_PRESET },
          normalize: true,
          showDownloadProgress: true,
        });
        const t1 = Date.now();
        logger.info(`[Embedding] 模型预热完成，耗时 ${t1 - t0}ms`);
        this.initialized = true;
      } catch (error: any) {
        // 重置 initPromise 以便重试
        this.initPromise = null;
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`嵌入模型初始化失败: ${msg}`);
      }
    })();
    await this.initPromise;
  }

  async embed(text: string): Promise<number[]> {
    await this.ensureModel();
    const results = await embed([text], {
      model: { modelType: 'preset', value: EMBEDDING_PRESET },
      normalize: true,
    });
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    await this.ensureModel();
    return embed(texts, {
      model: { modelType: 'preset', value: EMBEDDING_PRESET },
      normalize: true,
    });
  }
}
