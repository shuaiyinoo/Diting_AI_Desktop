/**
 * 向量模型服务
 *
 * 负责本地向量嵌入模型的下载、管理和文件操作。
 * 模型来源：HuggingFace（Xenova 和 intfloat 系列 ONNX 嵌入模型）
 * 国内镜像：https://hf-mirror.com 对应路径
 * 模型存储路径：~/.diting/model/vector
 *
 * 下载方式：通过 @kreuzberg/node 的 embed 函数首次调用时自动下载，
 * 但在此服务中我们预下载模型文件到指定目录，以便用户管理和选择。
 *
 * 实际推理时通过 @kreuzberg/node 的 cacheDir 参数指向本目录。
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import https from 'https';
import { logger } from 'ee-core/log';

/** 向量模型预设定义 */
export interface VectorModelDef {
  /** 模型唯一标识 */
  id: string;
  /** 显示名称 */
  label: string;
  /** HuggingFace 模型 ID */
  hfModelId: string;
  /** 向量维度 */
  dimensions: number;
  /** 大小描述 */
  sizeLabel: string;
  /** 描述 */
  description: string;
  /** 模型类型：preset=kreuzberg 预设, custom=自定义 HuggingFace 模型 */
  modelType: 'preset' | 'custom';
  /** 推荐块大小 */
  chunkSize: number;
  /** @kreuzberg/node 中的预设名（仅 modelType=preset 时有效） */
  presetName?: string;
}

/** 下载进度回调 */
export interface VectorDownloadProgress {
  /** 模型 ID */
  modelId: string;
  /** 当前下载文件名 */
  filename: string;
  /** 已下载字节数 */
  downloaded: number;
  /** 总字节数 */
  total: number;
  /** 进度百分比（0-100） */
  percent: number;
  /** 下载速度（KB/s） */
  speed: number;
  /** 是否完成 */
  done: boolean;
  /** 错误信息 */
  error?: string;
}

/** 模型状态 */
export interface VectorModelStatus {
  /** 模型定义 */
  def: VectorModelDef;
  /** 是否已就绪（模型目录存在且非空） */
  ready: boolean;
  /** 实际占用空间（字节） */
  actualSize: number | null;
  /** 本地模型目录路径 */
  localDir: string;
}

// ===== 向量模型清单 =====

/**
 * 可用向量模型预设列表
 *
 * 前四个对应 @kreuzberg/node 的内置预设，通过 preset 模式加载。
 * 模型文件由 @kreuzberg/node 自动管理下载到 cacheDir。
 */
const VECTOR_MODELS: VectorModelDef[] = [
  {
    id: 'fast',
    label: 'all-MiniLM-L6-v2 (Fast)',
    hfModelId: 'Xenova/all-MiniLM-L6-v2',
    dimensions: 384,
    sizeLabel: '~80 MB',
    description: '快速嵌入模型（384 维，~22M 参数）。适合原型开发和资源受限环境。',
    modelType: 'preset',
    presetName: 'fast',
    chunkSize: 512,
  },
  {
    id: 'balanced',
    label: 'bge-base-en-v1.5 (Balanced)',
    hfModelId: 'Xenova/bge-base-en-v1.5',
    dimensions: 768,
    sizeLabel: '~400 MB',
    description: '质量与速度平衡（768 维，~109M 参数）。适合英文生产环境。',
    modelType: 'preset',
    presetName: 'balanced',
    chunkSize: 1024,
  },
  {
    id: 'quality',
    label: 'bge-large-en-v1.5 (Quality)',
    hfModelId: 'Xenova/bge-large-en-v1.5',
    dimensions: 1024,
    sizeLabel: '~1.2 GB',
    description: '最高质量（1024 维，~335M 参数）。适合复杂文档和高精度场景。',
    modelType: 'preset',
    presetName: 'quality',
    chunkSize: 2000,
  },
  // multilingual 模型暂时隐藏，后续需要多语言支持时恢复
  // {
  //   id: 'multilingual',
  //   label: 'multilingual-e5-base (多语言)',
  //   hfModelId: 'intfloat/multilingual-e5-base',
  //   dimensions: 768,
  //   sizeLabel: '~400 MB',
  //   description: '多语言支持（768 维，100+ 语言，含中文）。适合中文文档和混合语言内容。',
  //   modelType: 'preset',
  //   presetName: 'multilingual',
  //   chunkSize: 1024,
  // },
];

/** 进行中的下载任务 */
const activeDownloads = new Map<string, { abortController: AbortController }>();

/**
 * 获取模型存储目录路径
 */
export function getVectorModelDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.diting', 'model', 'vector');
}

/**
 * 获取单个模型的本地目录路径
 */
export function getModelLocalDir(modelId: string): string {
  return path.join(getVectorModelDir(), modelId);
}

/**
 * 确保模型存储目录存在
 */
export function ensureModelDir(): void {
  const dir = getVectorModelDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`[VectorModelService] 创建模型目录: ${dir}`);
  }
}

/**
 * 获取所有可用模型定义列表
 */
export function getAvailableModels(): VectorModelDef[] {
  return VECTOR_MODELS;
}

/**
 * 根据 ID 获取模型定义
 */
export function getModelDef(modelId: string): VectorModelDef | undefined {
  return VECTOR_MODELS.find((m) => m.id === modelId);
}

/**
 * 获取所有模型的状态（是否已下载等）
 *
 * 对于 preset 模式模型，检查 @kreuzberg/node 的缓存目录中是否存在模型文件。
 * 由于 @kreuzberg/node 将模型缓存在 cacheDir 下的按模型名组织子目录中，
 * 这里检查指定 cacheDir 下是否有文件。
 */
export function getModelStatuses(): VectorModelStatus[] {
  ensureModelDir();

  return VECTOR_MODELS.map((def) => {
    const localDir = getModelLocalDir(def.id);
    let actualSize = 0;
    let ready = false;

    try {
      if (fs.existsSync(localDir) && fs.statSync(localDir).isDirectory()) {
        // 递归统计目录下所有文件大小（包括子目录如 onnx/）
        actualSize = calculateDirSize(localDir);
        ready = actualSize > 0;
      }
    } catch {
      // 忽略
    }

    return {
      def,
      ready,
      actualSize: actualSize > 0 ? actualSize : null,
      localDir,
    };
  });
}

/**
 * 检查模型是否已就绪
 */
export function isModelReady(modelId: string): boolean {
  const statuses = getModelStatuses();
  const status = statuses.find((s) => s.def.id === modelId);
  return status?.ready ?? false;
}

/**
 * 获取已就绪模型的 cacheDir 路径（供 @kreuzberg/node 使用）
 *
 * 返回模型所在目录，作为 embed 函数的 cacheDir 参数。
 */
export function getModelCacheDir(modelId: string): string | null {
  const def = getModelDef(modelId);
  if (!def) return null;

  const localDir = getModelLocalDir(def.id);
  if (!fs.existsSync(localDir) || fs.readdirSync(localDir).length === 0) {
    return null;
  }

  return localDir;
}

/**
 * 下载单个文件（支持重定向）
 */
function downloadSingleFile(
  url: string,
  localPath: string,
  abortController: AbortController,
  onProgress?: (downloaded: number, total: number) => void,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const tempPath = `${localPath}.tmp`;

    // 确保目录存在
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 清理残留临时文件
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // 忽略
    }

    const fileStream = fs.createWriteStream(tempPath);
    let downloadedBytes = 0;
    let totalBytes = 0;

    const cleanup = () => {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {
        // 忽略
      }
      fileStream.destroy();
    };

    const makeRequest = (requestUrl: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        cleanup();
        reject(new Error('重定向次数过多'));
        return;
      }

      https.get(requestUrl, {
        headers: { 'User-Agent': 'Diting-AI-Desktop/1.0' },
      }, (response) => {
        // 处理重定向
        if ([301, 302, 307, 308].includes(response.statusCode ?? 0)) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            // 处理相对路径重定向（如 hf-mirror.com 返回 /api/resolve-cache/...）
            let finalUrl = redirectUrl;
            if (redirectUrl.startsWith('/')) {
              try {
                const parsed = new URL(requestUrl);
                finalUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
              } catch {
                // requestUrl 无效时保持原样
              }
            }
            logger.info(`[VectorModelService] 重定向到: ${finalUrl}`);
            response.resume();
            makeRequest(finalUrl, redirectCount + 1);
            return;
          }
        }

        if (response.statusCode !== 200) {
          cleanup();
          reject(new Error(`下载失败: HTTP ${response.statusCode}`));
          return;
        }

        totalBytes = parseInt(response.headers['content-length'] || '0', 10);

        response.on('data', (chunk: Buffer) => {
          if (abortController.signal.aborted) {
            response.destroy();
            cleanup();
            reject(new Error('下载已取消'));
            return;
          }
          downloadedBytes += chunk.length;
          onProgress?.(downloadedBytes, totalBytes);
        });

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close((err) => {
            if (err) {
              cleanup();
              reject(err);
              return;
            }
            fs.renameSync(tempPath, localPath);
            resolve(downloadedBytes);
          });
        });
      }).on('error', (err) => {
        cleanup();
        reject(err);
      });
    };

    // 监听 abort
    abortController.signal.addEventListener('abort', () => {
      cleanup();
      reject(new Error('下载已取消'));
    });

    makeRequest(url);
  });
}

/** HuggingFace Tree API 返回的文件项 */
interface HfTreeFile {
  type: 'file' | 'directory';
  path: string;
  oid?: string;
  size?: number;
  lfs?: {
    oid: string;
    size: number;
  };
}

/**
 * 获取 HuggingFace 模型的 commit hash 和文件列表
 *
 * 通过 /api/models/<model_id>/revision/main 获取 commit hash，
 * 通过 /api/models/<model_id>/tree/main 递归获取文件列表（含 LFS sha）。
 *
 * @param hfModelId  HuggingFace 模型 ID
 * @param useMirror  是否使用镜像
 * @returns commit hash 和文件列表
 */
async function fetchHfModelInfo(
  hfModelId: string,
  useMirror: boolean,
): Promise<{ commitHash: string; files: HfTreeFile[] }> {
  const baseUrl = useMirror ? 'https://hf-mirror.com' : 'https://huggingface.co';

  // 1. 获取 commit hash
  const revUrl = `${baseUrl}/api/models/${hfModelId}/revision/main`;
  const revData = await fetchJson(revUrl);
  const commitHash: string = revData.sha;
  if (!commitHash) {
    throw new Error('无法获取模型 commit hash');
  }

  // 2. 递归获取文件列表（含 LFS sha）
  const allFiles: HfTreeFile[] = [];

  const fetchTree = async (subdir: string): Promise<void> => {
    const treePath = subdir ? `${subdir}/` : '';
    const treeUrl = `${baseUrl}/api/models/${hfModelId}/tree/main/${treePath}`;
    const items = await fetchJson(treeUrl) as HfTreeFile[];

    for (const item of items) {
      if (item.type === 'file') {
        allFiles.push(item);
      } else if (item.type === 'directory') {
        await fetchTree(item.path);
      }
    }
  };

  await fetchTree('');

  return { commitHash, files: allFiles };
}

/**
 * 简单的 JSON HTTP GET 请求（支持重定向）
 */
function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const makeRequest = (requestUrl: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('重定向次数过多'));
        return;
      }

      https.get(requestUrl, {
        headers: { 'User-Agent': 'Diting-AI-Desktop/1.0' },
      }, (response) => {
        if ([301, 302, 307, 308].includes(response.statusCode ?? 0)) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            let finalUrl = redirectUrl;
            if (redirectUrl.startsWith('/')) {
              try {
                const parsed = new URL(requestUrl);
                finalUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
              } catch { /* 忽略 */ }
            }
            response.resume();
            makeRequest(finalUrl, redirectCount + 1);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode} (${requestUrl})`));
          return;
        }

        let data = '';
        response.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        response.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(new Error(`JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`));
          }
        });
      }).on('error', reject);
    };

    makeRequest(url);
  });
}

/**
 * 从文件列表中筛选推理所需的文件，并确定下载目标路径
 *
 * @kreuzberg/node 在 preset 模式下，引擎自己选择下载 `onnx/model_quantized.onnx`
 * （量化版本，体积小且无需外部数据文件）。我们手动构建 HF Hub 缓存时需要
 * 匹配引擎期望的文件名。
 *
 * 保留的文件：
 *   - config.json
 *   - tokenizer.json
 *   - tokenizer_config.json
 *   - special_tokens_map.json
 *   - vocab.txt（如果存在）
 *   - onnx/model_quantized.onnx（引擎默认下载的量化版本）
 *
 * @param files  完整文件列表
 * @returns 需要下载的文件列表（含 HF API 返回的 oid/lfs 信息）
 */
function selectPresetModelFiles(files: HfTreeFile[]): HfTreeFile[] {
  /** 引擎需要的文件路径 */
  const requiredPaths = new Set([
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'special_tokens_map.json',
    'vocab.txt',
    'onnx/model_quantized.onnx',
  ]);

  return files.filter(f => requiredPaths.has(f.path));
}

/**
 * 将 HuggingFace 仓库 ID 转换为 HF Hub 缓存目录名
 *
 * 例如 `Xenova/all-MiniLM-L6-v2` → `models--Xenova--all-MiniLM-L6-v2`
 */
function hfIdToCacheDir(hfModelId: string): string {
  return `models--${hfModelId.replace(/\//g, '--')}`;
}

/**
 * 获取文件在 HF Hub 缓存中的 blob 名称（sha256）
 *
 * LFS 文件使用 `lfs.oid`，普通文件使用 `oid`。
 */
function getBlobName(file: HfTreeFile): string {
  return file.lfs?.oid ?? file.oid ?? '';
}

/**
 * 下载向量模型（预设模型）
 *
 * 手动从 HuggingFace（或镜像）下载模型文件，构建标准的 HF Hub 缓存目录结构，
 * 然后运行时通过 `HF_HUB_OFFLINE=1` 让 @kreuzberg/node 直接读取本地缓存。
 *
 * HF Hub 缓存结构：
 * ```
 * cacheDir/models--<org>--<model>/
 *   refs/main              → commit hash 文本
 *   blobs/
 *     <sha256>             → 实际文件内容
 *     <sha256>.lock         → 空锁文件
 *   snapshots/<commit_hash>/
 *     config.json           → 符号链接 → ../../blobs/<sha>
 *     onnx/
 *       model_quantized.onnx → 符号链接 → ../../../blobs/<sha>
 *     tokenizer.json        → 符号链接 → ../../blobs/<sha>
 *     ...
 * ```
 *
 * @param modelId   模型 ID
 * @param useMirror 是否使用镜像
 * @param onProgress 进度回调
 */
export async function downloadVectorModel(
  modelId: string,
  useMirror: boolean,
  onProgress?: (progress: VectorDownloadProgress) => void,
): Promise<void> {
  const def = getModelDef(modelId);
  if (!def) {
    throw new Error(`未知模型 ID: ${modelId}`);
  }

  // 如果已有相同模型的下载在进行中，先取消
  const existing = activeDownloads.get(modelId);
  if (existing) {
    existing.abortController.abort();
    activeDownloads.delete(modelId);
  }

  ensureModelDir();
  const cacheDir = getModelLocalDir(modelId);
  const abortController = new AbortController();
  activeDownloads.set(modelId, { abortController });

  logger.info(`[VectorModelService] 开始下载预设向量模型: ${modelId} (镜像=${useMirror})`);

  try {
    // 1. 获取模型信息（commit hash + 文件列表）
    const { commitHash, files: allFiles } = await fetchHfModelInfo(def.hfModelId, useMirror);
    logger.info(`[VectorModelService] 模型 ${def.hfModelId} commit=${commitHash}, 共 ${allFiles.length} 个文件`);

    // 2. 筛选推理所需文件
    const requiredFiles = selectPresetModelFiles(allFiles);
    const fileListDesc = requiredFiles.map(f => f.path).join(', ');
    logger.info(`[VectorModelService] 需下载 ${requiredFiles.length} 个文件: ${fileListDesc}`);

    if (requiredFiles.length === 0) {
      throw new Error('模型仓库中未找到推理所需的文件');
    }

    // 3. 构建 HF Hub 缓存目录结构
    const hfCacheDir = path.join(cacheDir, hfIdToCacheDir(def.hfModelId));
    const blobsDir = path.join(hfCacheDir, 'blobs');
    const snapshotsDir = path.join(hfCacheDir, 'snapshots', commitHash);
    const refsDir = path.join(hfCacheDir, 'refs');

    // 创建目录
    fs.mkdirSync(blobsDir, { recursive: true });
    fs.mkdirSync(snapshotsDir, { recursive: true });
    fs.mkdirSync(refsDir, { recursive: true });

    // 写入 refs/main
    const refsMainPath = path.join(refsDir, 'main');
    fs.writeFileSync(refsMainPath, commitHash);

    // 4. 逐个下载文件到 blobs/ 目录，并创建符号链接
    let cumulativeDownloaded = 0;
    let cumulativeTotal = 0;

    // 先计算总大小用于进度
    for (const file of requiredFiles) {
      cumulativeTotal += file.size ?? file.lfs?.size ?? 0;
    }

    for (const file of requiredFiles) {
      const blobName = getBlobName(file);
      if (!blobName) {
        logger.warn(`[VectorModelService] 跳过无 oid 的文件: ${file.path}`);
        continue;
      }

      const blobPath = path.join(blobsDir, blobName);
      const lockPath = `${blobPath}.lock`;
      const baseUrl = useMirror ? 'https://hf-mirror.com' : 'https://huggingface.co';
      const downloadUrl = `${baseUrl}/${def.hfModelId}/resolve/main/${file.path}`;

      // 创建空锁文件
      if (!fs.existsSync(lockPath)) {
        fs.writeFileSync(lockPath, '');
      }

      // 如果 blob 已存在且大小匹配，跳过下载
      if (fs.existsSync(blobPath)) {
        const stat = fs.statSync(blobPath);
        const expectedSize = file.lfs?.size ?? file.size ?? 0;
        if (stat.isFile() && stat.size > 0 && (expectedSize === 0 || stat.size === expectedSize)) {
          logger.info(`[VectorModelService] Blob 已存在，跳过: ${blobName} (${file.path})`);
          cumulativeDownloaded += stat.size;
          // 仍需创建符号链接
          createSnapshotSymlink(snapshotsDir, blobsDir, file, blobName);
          continue;
        }
      }

      logger.info(`[VectorModelService] 下载: ${file.path} → blobs/${blobName}`);
      const downloaded = await downloadSingleFile(
        downloadUrl,
        blobPath,
        abortController,
        (fileDownloaded, fileTotal) => {
          const totalDownloaded = cumulativeDownloaded + fileDownloaded;
          const percent = cumulativeTotal > 0 ? (totalDownloaded / cumulativeTotal) * 100 : 0;

          onProgress?.({
            modelId,
            filename: file.path,
            downloaded: totalDownloaded,
            total: cumulativeTotal,
            percent,
            speed: 0,
            done: false,
          });
        },
      );

      cumulativeDownloaded += downloaded;

      // 创建符号链接
      createSnapshotSymlink(snapshotsDir, blobsDir, file, blobName);
    }

    // 下载完成
    activeDownloads.delete(modelId);
    onProgress?.({
      modelId,
      filename: '',
      downloaded: cumulativeDownloaded,
      total: cumulativeTotal,
      percent: 100,
      speed: 0,
      done: true,
    });

    logger.info(`[VectorModelService] 预设模型下载完成: ${modelId} (HF Hub 缓存已构建)`);
  } catch (err) {
    activeDownloads.delete(modelId);
    onProgress?.({
      modelId,
      filename: '',
      downloaded: 0,
      total: 0,
      percent: 0,
      speed: 0,
      done: true,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * 在 snapshots 目录中创建指向 blobs 的符号链接
 *
 * @param snapshotsDir  snapshots/<commit_hash>/ 目录
 * @param blobsDir      blobs/ 目录
 * @param file          文件信息
 * @param blobName      blob 文件名（sha256）
 */
function createSnapshotSymlink(
  snapshotsDir: string,
  blobsDir: string,
  file: HfTreeFile,
  blobName: string,
): void {
  const snapshotPath = path.join(snapshotsDir, file.path);
  const snapshotDir = path.dirname(snapshotPath);

  // 确保子目录存在（如 onnx/）
  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true });
  }

// 如果符号链接或文件已存在，先删除
// 注意：不能用 || 短路调用 lstatSync，否则文件不存在时会抛 ENOENT
let shouldDelete = false;
if (fs.existsSync(snapshotPath)) {
  shouldDelete = true;
} else {
  try {
    // 检查是否是断链的符号链接（existsSync 对断链返回 false）
    if (fs.lstatSync(snapshotPath).isSymbolicLink()) shouldDelete = true;
  } catch { /* 文件不存在，无需删除 */ }
}
if (shouldDelete) {
  try { fs.unlinkSync(snapshotPath); } catch { /* 忽略 */ }
}

  // 计算相对路径：从 snapshotPath 到 blobPath
  const relativePath = path.relative(snapshotDir, path.join(blobsDir, blobName));
  fs.symlinkSync(relativePath, snapshotPath);
}

/**
 * 取消模型下载
 */
export function cancelVectorDownload(modelId: string): boolean {
  const existing = activeDownloads.get(modelId);
  if (existing) {
    existing.abortController.abort();
    activeDownloads.delete(modelId);
    logger.info(`[VectorModelService] 取消下载: ${modelId}`);
    return true;
  }
  return false;
}

/**
 * 通过 hf-mirror.com 镜像下载预设模型（供 embedding.ts 镜像兜底调用）
 *
 * 当 @kreuzberg/node 直连 HuggingFace 超时或失败后，调用此函数
 * 从 hf-mirror.com 手动下载模型文件并构建 HF Hub 缓存结构，
 * 使引擎在重试时直接读取本地缓存。
 *
 * @param modelId 模型 ID
 */
export async function downloadVectorModelFromMirror(modelId: string): Promise<void> {
  await downloadVectorModel(modelId, true);
}

/**
 * 通过 hf-mirror.com 镜像下载自定义模型（供 embedding.ts 镜像兜底调用）
 *
 * 和预设模型一样，从 hf-mirror.com 下载文件并构建标准的 HF Hub 缓存结构
 * （models--<org>--<model>/blobs/refs/snapshots/），使引擎在离线模式下
 * 直接读取本地缓存。
 *
 * 如果模型已在 customModels Map 中注册（当前会话下载过），直接使用注册信息。
 * 否则从本地 HF Hub 缓存结构推断 hfModelId（应用重启后 Map 为空的场景）。
 *
 * @param modelId 自定义模型 ID
 */
export async function downloadCustomVectorModelFromMirror(modelId: string): Promise<void> {
  // 先从运行时注册表查找
  let def = customModels.get(modelId);

  // 如果注册表没有（应用重启后未重新下载），从 HF Hub 缓存结构推断 hfModelId
  if (!def) {
    const localDir = getModelLocalDir(modelId);
    if (fs.existsSync(localDir)) {
      // 缓存结构为 localDir/models--<org>--<model>/
      const entries = fs.readdirSync(localDir);
      for (const entry of entries) {
        if (entry.startsWith('models--')) {
          // 从目录名还原 hfModelId：models--<org>--<model> → <org>/<model>
          const parts = entry.replace('models--', '').split('--');
          if (parts.length >= 2) {
            const hfModelId = parts.join('/');
            // 从数据库获取维度
            let dimensions = 0;
            try {
              const { vectordbService } = await import('../database/vectordb');
              await vectordbService.init();
              const config = vectordbService.getConfig();
              dimensions = config.selected_dimensions ?? 0;
            } catch { /* 忽略 */ }

            if (dimensions > 0) {
              def = registerCustomModel(hfModelId, dimensions);
            }
          }
          break;
        }
      }
    }
  }

  if (!def) {
    throw new Error(`自定义模型 ${modelId} 不存在，无法走镜像兜底`);
  }

  // 和预设模型一样，构建 HF Hub 缓存结构
  const useMirror = true;
  const cacheDir = getModelLocalDir(modelId);
  const abortController = new AbortController();
  activeDownloads.set(modelId, { abortController });

  logger.info(`[VectorModelService] 开始下载自定义向量模型(镜像): ${def.hfModelId} (模型目录=${cacheDir})`);

  try {
    // 1. 获取模型信息（commit hash + 文件列表）
    const { commitHash, files: allFiles } = await fetchHfModelInfo(def.hfModelId, useMirror);
    logger.info(`[VectorModelService] 模型 ${def.hfModelId} commit=${commitHash}, 共 ${allFiles.length} 个文件`);

    // 2. 筛选推理所需文件（优先量化版本）
    const requiredFiles = selectCustomModelFiles(allFiles);
    const fileListDesc = requiredFiles.map(f => f.path).join(', ');
    logger.info(`[VectorModelService] 需下载 ${requiredFiles.length} 个文件: ${fileListDesc}`);

    if (requiredFiles.length === 0) {
      throw new Error('模型仓库中未找到推理所需的文件');
    }

    // 3. 构建 HF Hub 缓存目录结构
    const hfCacheDir = path.join(cacheDir, hfIdToCacheDir(def.hfModelId));
    const blobsDir = path.join(hfCacheDir, 'blobs');
    const snapshotsDir = path.join(hfCacheDir, 'snapshots', commitHash);
    const refsDir = path.join(hfCacheDir, 'refs');

    fs.mkdirSync(blobsDir, { recursive: true });
    fs.mkdirSync(snapshotsDir, { recursive: true });
    fs.mkdirSync(refsDir, { recursive: true });

    const refsMainPath = path.join(refsDir, 'main');
    fs.writeFileSync(refsMainPath, commitHash);

    // 4. 逐个下载文件到 blobs/ 目录，并创建符号链接
    let cumulativeDownloaded = 0;
    let cumulativeTotal = 0;
    for (const file of requiredFiles) {
      cumulativeTotal += file.size ?? file.lfs?.size ?? 0;
    }

    for (const file of requiredFiles) {
      const blobName = getBlobName(file);
      if (!blobName) {
        logger.warn(`[VectorModelService] 跳过无 oid 的文件: ${file.path}`);
        continue;
      }

      const blobPath = path.join(blobsDir, blobName);
      const lockPath = `${blobPath}.lock`;
      const baseUrl = useMirror ? 'https://hf-mirror.com' : 'https://huggingface.co';
      const downloadUrl = `${baseUrl}/${def.hfModelId}/resolve/main/${file.path}`;

      if (!fs.existsSync(lockPath)) {
        fs.writeFileSync(lockPath, '');
      }

      if (fs.existsSync(blobPath)) {
        const stat = fs.statSync(blobPath);
        const expectedSize = file.lfs?.size ?? file.size ?? 0;
        if (stat.isFile() && stat.size > 0 && (expectedSize === 0 || stat.size === expectedSize)) {
          logger.info(`[VectorModelService] Blob 已存在，跳过: ${blobName} (${file.path})`);
          cumulativeDownloaded += stat.size;
          createSnapshotSymlink(snapshotsDir, blobsDir, file, blobName);
          continue;
        }
      }

      logger.info(`[VectorModelService] 下载: ${file.path} → blobs/${blobName}`);
      const downloaded = await downloadSingleFile(
        downloadUrl,
        blobPath,
        abortController,
        (fileDownloaded, fileTotal) => {
          const totalDownloaded = cumulativeDownloaded + fileDownloaded;
          const percent = cumulativeTotal > 0 ? (totalDownloaded / cumulativeTotal) * 100 : 0;
        },
      );

      cumulativeDownloaded += downloaded;
      createSnapshotSymlink(snapshotsDir, blobsDir, file, blobName);
    }

    activeDownloads.delete(modelId);
    logger.info(`[VectorModelService] 自定义模型镜像下载完成: ${modelId} (HF Hub 缓存已构建)`);
  } catch (err) {
    activeDownloads.delete(modelId);
    throw err;
  }
}

/**
 * 从文件列表中筛选自定义模型推理所需的文件
 *
 * 自定义模型的文件结构不确定，因此：
 *   1. 保留所有 tokenizer/config 相关文件
 *   2. ONNX 模型文件优先选择量化版本（避免 model.onnx + model.onnx_data 的组合）
 *   3. 过滤不需要的文件（.gitattributes, README.md 等）
 *
 * @param files  完整文件列表
 * @returns 需要下载的文件列表
 */
function selectCustomModelFiles(files: HfTreeFile[]): HfTreeFile[] {
  /** 保留的配置/tokenizer 文件路径 */
  const configPaths = new Set([
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'special_tokens_map.json',
    'vocab.txt',
    'tokenizer.model',
    'added_tokens.json',
    'merges.txt',
  ]);

  /** 不需要的文件（按路径前缀或扩展名过滤） */
  const skipPrefixes = ['.gitattributes', 'README', 'LICENSE', 'CHANGELOG', '.md', '.txt'];
  const skipExts = ['.gitattributes', '.md', '.rst', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico'];

  const result: HfTreeFile[] = [];

  // 1. 收集配置文件
  for (const file of files) {
    if (configPaths.has(file.path)) {
      result.push(file);
    }
  }

  // 2. ONNX 模型文件：优先量化版本
  const onnxFiles = files.filter(f => f.path.startsWith('onnx/') && f.path.endsWith('.onnx'));

  // 检查是否有 model.onnx + model.onnx_data 组合
  const hasModelOnnx = onnxFiles.some(f => f.path === 'onnx/model.onnx');
  const hasModelOnnxData = files.some(f => f.path === 'onnx/model.onnx_data');

  if (hasModelOnnx && hasModelOnnxData) {
    // 有外部数据文件，改用量化版本
    const quantizedVariants = [
      'onnx/model_quantized.onnx',
      'onnx/model_int8.onnx',
      'onnx/model_uint8.onnx',
      'onnx/model_q8.onnx',
      'onnx/model_q4.onnx',
      'onnx/model_q4f16.onnx',
      'onnx/model_bnb4.onnx',
    ];
    let found = false;
    for (const variant of quantizedVariants) {
      const f = onnxFiles.find(f => f.path === variant);
      if (f) {
        // 下载量化版本，但保存为 model.onnx（引擎期望的文件名）
        result.push({ ...f, path: 'onnx/model.onnx' });
        found = true;
        logger.info(`[VectorModelService] 自定义模型：检测到 model.onnx + model.onnx_data，改用 ${variant} → onnx/model.onnx`);
        break;
      }
    }
    if (!found) {
      // 没有量化版本，只能下载原始组合
      result.push(onnxFiles.find(f => f.path === 'onnx/model.onnx')!);
      const dataFile = files.find(f => f.path === 'onnx/model.onnx_data');
      if (dataFile) result.push(dataFile);
      logger.warn('[VectorModelService] 自定义模型：有外部数据文件但无量化版本，可能无法加载');
    }
  } else if (hasModelOnnx) {
    // 只有 model.onnx，无外部数据文件，直接用
    result.push(onnxFiles.find(f => f.path === 'onnx/model.onnx')!);
  } else {
    // 没有 model.onnx，检查量化版本
    const quantizedVariants = [
      'onnx/model_quantized.onnx',
      'onnx/model_int8.onnx',
      'onnx/model_uint8.onnx',
      'onnx/model_q8.onnx',
      'onnx/model_q4.onnx',
      'onnx/model_q4f16.onnx',
      'onnx/model_bnb4.onnx',
    ];
    for (const variant of quantizedVariants) {
      const f = onnxFiles.find(f => f.path === variant);
      if (f) {
        result.push({ ...f, path: 'onnx/model.onnx' });
        logger.info(`[VectorModelService] 自定义模型：无 model.onnx，使用 ${variant} → onnx/model.onnx`);
        break;
      }
    }
  }

  return result;
}

/**
 * 删除已下载的模型文件
 */
/**
 * 递归统计目录下所有文件的总大小
 *
 * @param dir 目录路径
 * @returns 总字节数
 */
function calculateDirSize(dir: string): number {
  let totalSize = 0;
  if (!fs.existsSync(dir)) return totalSize;

  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const entryPath = path.join(dir, entry);
      try {
        const stat = fs.lstatSync(entryPath);
        if (stat.isSymbolicLink()) {
          // 符号链接：跟随获取目标信息
          try {
            const targetStat = fs.statSync(entryPath);
            if (targetStat.isFile()) {
              totalSize += targetStat.size;
            } else if (targetStat.isDirectory()) {
              // 符号链接指向目录，递归统计
              totalSize += calculateDirSize(entryPath);
            }
          } catch { /* 断链，忽略 */ }
        } else if (stat.isFile()) {
          totalSize += stat.size;
        } else if (stat.isDirectory()) {
          totalSize += calculateDirSize(entryPath);
        }
      } catch {
        // 忽略个别文件统计失败
      }
    }
  } catch {
    // 忽略目录读取失败
  }

  return totalSize;
}

/**
 * 递归删除目录及其所有内容
 *
 * @param dir 目录路径
 * @returns 是否有文件被删除
 */
function removeDirRecursive(dir: string): boolean {
let anyDeleted = false;
if (!fs.existsSync(dir)) return false;

try {
const entries = fs.readdirSync(dir);
for (const entry of entries) {
const entryPath = path.join(dir, entry);
try {
// 使用 lstatSync 而非 statSync：
// - statSync 会跟随符号链接，如果链接目标不存在则抛 ENOENT
// - lstatSync 检查链接本身，断链也能正常处理
const stat = fs.lstatSync(entryPath);
if (stat.isSymbolicLink()) {
// 符号链接直接 unlink，不跟随目标
fs.unlinkSync(entryPath);
anyDeleted = true;
} else if (stat.isDirectory()) {
if (removeDirRecursive(entryPath)) {
anyDeleted = true;
}
} else {
fs.unlinkSync(entryPath);
anyDeleted = true;
}
} catch (err) {
logger.error(`[VectorModelService] 删除失败: ${entry}`, err);
}
    }
    // 删除空目录
    try {
      fs.rmdirSync(dir);
    } catch {
      // 忽略目录删除失败
    }
  } catch (err) {
    logger.error(`[VectorModelService] 递归删除目录失败: ${dir}`, err);
  }

  return anyDeleted;
}

export function deleteVectorModel(modelId: string): boolean {
  const def = getModelDef(modelId);
  if (!def) return false;

  const localDir = getModelLocalDir(modelId);
  return removeDirRecursive(localDir);
}

// ===== 自定义模型（模型市场） =====

/** 自定义模型 ID 前缀 */
const CUSTOM_PREFIX = 'custom_';

/** 自定义模型注册表（运行时维护，不持久化） */
const customModels = new Map<string, VectorModelDef>();

/**
 * 解析 HuggingFace URL，提取模型路径
 *
 * 支持以下格式：
 *   - https://huggingface.co/Qwen/Qwen3-Embedding-0.6B
 *   - https://hf-mirror.com/Qwen/Qwen3-Embedding-0.6B
 *   - huggingface.co/Qwen/Qwen3-Embedding-0.6B
 *   - Qwen/Qwen3-Embedding-0.6B
 *
 * @returns 模型路径（如 "Qwen/Qwen3-Embedding-0.6B"）或 null
 */
export function parseHuggingFaceUrl(input: string): string | null {
  let trimmed = input.trim();

  // 去除 @ 前缀（用户可能输入 @https://...）
  if (trimmed.startsWith('@')) {
    trimmed = trimmed.slice(1);
  }

  // 去除协议
  trimmed = trimmed.replace(/^https?:\/\//, '');

  // 去除域名
  trimmed = trimmed.replace(/^(huggingface\.co|hf-mirror\.com)\//, '');

  // 去除尾部斜杠和 resolve/main 等路径
  trimmed = trimmed.replace(/\/+$/, '');
  trimmed = trimmed.replace(/\/resolve\/main.*$/, '');
  trimmed = trimmed.replace(/\/tree\/main.*$/, '');
  trimmed = trimmed.replace(/\/blob\/main.*$/, '');

  // 去除尾部 /onnx 等子路径
  trimmed = trimmed.replace(/\/onnx.*$/, '');

  // 验证：必须包含至少一个 /（org/model 格式）
  if (!trimmed.includes('/')) {
    return null;
  }

  // 验证：不能包含空格或特殊字符
  if (/[\s<>]/.test(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * 注册自定义模型并返回模型 ID
 */
function registerCustomModel(hfModelId: string, dimensions: number): VectorModelDef {
  // 生成稳定的模型 ID
  const slug = hfModelId
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  const modelId = `${CUSTOM_PREFIX}${slug}`;

  const def: VectorModelDef = {
    id: modelId,
    label: hfModelId,
    hfModelId,
    dimensions,
    sizeLabel: '自定义',
    description: `自定义模型: ${hfModelId} (${dimensions} 维)`,
    modelType: 'custom',
    chunkSize: 512,
  };

  customModels.set(modelId, def);
  return def;
}

/**
 * 自定义模型元数据文件名
 */
const CUSTOM_MODEL_META_FILE = 'model_meta.json';

/**
 * 注册自定义模型并返回模型 ID（供外部调用，如下载按钮）
 *
 * 只注册模型信息到运行时 Map，不下载文件。
 * 引擎在预热时会自行从 HuggingFace 下载到 HF Hub 缓存目录。
 * 同时持久化元数据到磁盘，以便应用重启后能恢复模型列表。
 */
export function registerCustomModelForDownload(hfModelId: string, dimensions: number): string {
  const def = registerCustomModel(hfModelId, dimensions);
  // 确保 cacheDir 目录存在
  const localDir = getModelLocalDir(def.id);
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  // 持久化元数据，以便重启后恢复
  const metaPath = path.join(localDir, CUSTOM_MODEL_META_FILE);
  try {
    fs.writeFileSync(metaPath, JSON.stringify({
      hfModelId: def.hfModelId,
      dimensions: def.dimensions,
    }, null, 2));
  } catch (err) {
    logger.warn(`[VectorModelService] 写入自定义模型元数据失败: ${metaPath}`, err);
  }
  return def.id;
}

/**
 * 从磁盘扫描并恢复自定义模型注册表
 *
 * 应用重启后 customModels Map 为空，需要扫描
 * ~/.diting/model/vector/custom_xxx/ 目录，
 * 读取 model_meta.json 恢复模型定义。
 */
function discoverCustomModelsFromDisk(): void {
  const baseDir = getVectorModelDir();
  if (!fs.existsSync(baseDir)) return;

  try {
    const entries = fs.readdirSync(baseDir);
    for (const entry of entries) {
      // 只处理 custom_ 前缀的目录
      if (!entry.startsWith(CUSTOM_PREFIX)) continue;

      const modelId = entry;
      // 如果运行时已注册，跳过
      if (customModels.has(modelId)) continue;

      const localDir = path.join(baseDir, entry);
      if (!fs.statSync(localDir).isDirectory()) continue;

      // 读取元数据文件
      const metaPath = path.join(localDir, CUSTOM_MODEL_META_FILE);
      if (!fs.existsSync(metaPath)) continue;

      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        if (meta.hfModelId && meta.dimensions && meta.dimensions > 0) {
          registerCustomModel(meta.hfModelId, meta.dimensions);
          logger.info(`[VectorModelService] 从磁盘恢复自定义模型: ${modelId} (${meta.hfModelId}, ${meta.dimensions}维)`);
        }
      } catch {
        // 元数据文件损坏，尝试从 HF Hub 缓存目录推断
        const cacheEntries = fs.readdirSync(localDir);
        for (const ce of cacheEntries) {
          if (ce.startsWith('models--')) {
            const parts = ce.replace('models--', '').split('--');
            if (parts.length >= 2) {
              const hfModelId = parts.join('/');
              // 无法获取维度，默认 1024
              registerCustomModel(hfModelId, 1024);
              logger.info(`[VectorModelService] 从磁盘缓存目录推断自定义模型: ${modelId} (${hfModelId}, 1024维)`);
            }
            break;
          }
        }
      }
    }
  } catch (err) {
    logger.warn('[VectorModelService] 扫描自定义模型目录失败:', err);
  }
}

/**
 * 获取所有已注册的自定义模型定义
 */
export function getCustomModels(): VectorModelDef[] {
  return Array.from(customModels.values());
}

/**
 * 获取所有模型（预设 + 自定义）的状态
 */
export function getAllModelStatuses(): VectorModelStatus[] {
  ensureModelDir();

  // 先从磁盘恢复自定义模型注册表（应用重启后 Map 为空）
  discoverCustomModelsFromDisk();

  // 预设模型
  const presetStatuses = getModelStatuses();

// 自定义模型
const customStatuses: VectorModelStatus[] = [];
for (const def of customModels.values()) {
const localDir = getModelLocalDir(def.id);
// 自定义模型和预设模型一样使用 HF Hub 缓存结构
const hfCacheDir = path.join(localDir, hfIdToCacheDir(def.hfModelId));
let actualSize = 0;
let ready = false;

try {
if (fs.existsSync(hfCacheDir) && fs.statSync(hfCacheDir).isDirectory()) {
actualSize = calculateDirSize(hfCacheDir);
ready = actualSize > 0;
} else {
logger.info(`[VectorModelService] 自定义模型 ${def.id} 缓存目录不存在: ${hfCacheDir}`);
}
} catch (err) {
logger.warn(`[VectorModelService] 自定义模型 ${def.id} 状态检查失败:`, err);
}

    customStatuses.push({
      def,
      ready,
      actualSize: actualSize > 0 ? actualSize : null,
      localDir,
    });
  }

  return [...presetStatuses, ...customStatuses];
}

/**
 * 根据 ID 获取模型定义（预设 + 自定义）
 */
export function getModelDefAny(modelId: string): VectorModelDef | undefined {
  // 先查预设
  const preset = getModelDef(modelId);
  if (preset) return preset;
  // 再查自定义，如果 Map 为空先从磁盘恢复
  if (!customModels.has(modelId) && modelId.startsWith(CUSTOM_PREFIX)) {
    discoverCustomModelsFromDisk();
  }
  return customModels.get(modelId);
}

/**
 * 获取已就绪自定义模型的 cacheDir 路径
 *
 * 自定义模型和预设模型一样使用 HF Hub 缓存结构，
 * 检查 localDir/models--<org>--<model>/snapshots/ 下是否有文件。
 */
export function getCustomModelCacheDir(modelId: string): string | null {
  let def = customModels.get(modelId);
  if (!def && modelId.startsWith(CUSTOM_PREFIX)) {
    discoverCustomModelsFromDisk();
    def = customModels.get(modelId);
  }
  if (!def) return null;

  const localDir = getModelLocalDir(modelId);
  const hfCacheDir = path.join(localDir, hfIdToCacheDir(def.hfModelId));
  const snapshotsDir = path.join(hfCacheDir, 'snapshots');
  if (!fs.existsSync(snapshotsDir)) return null;

  // 检查 snapshots 下是否有 commit 目录且非空
  try {
    const commits = fs.readdirSync(snapshotsDir);
    for (const commit of commits) {
      const commitDir = path.join(snapshotsDir, commit);
      if (fs.statSync(commitDir).isDirectory() && fs.readdirSync(commitDir).length > 0) {
        return localDir;
      }
    }
  } catch { /* 忽略 */ }

  return null;
}

/**
 * 通过 HuggingFace API 递归获取模型仓库的完整文件列表
 *
 * 递归遍历所有子目录（如 onnx/），返回仓库中全部文件的相对路径。
 * 文件过滤由调用方 {@link buildDownloadPlan} 处理。
 *
 * @param hfModelId  HuggingFace 模型 ID
 * @param useMirror  是否使用镜像
 * @returns 所有文件的相对路径列表（如 ["config.json", "onnx/model.onnx", "tokenizer.json"]）
 */
async function fetchModelFileList(hfModelId: string, useMirror: boolean): Promise<string[]> {
  const baseUrl = useMirror ? 'https://hf-mirror.com' : 'https://huggingface.co';

  /**
   * 递归获取目录树
   * @param subdir 子目录路径（空字符串表示根目录）
   * @returns 该目录及子目录下所有文件路径
   */
  const fetchTree = async (subdir: string): Promise<string[]> => {
    const treePath = subdir ? `${subdir}/` : '';
    const apiUrl = `${baseUrl}/api/models/${hfModelId}/tree/main/${treePath}`;

    return new Promise<string[]>((resolve, reject) => {
      const makeRequest = (requestUrl: string, redirectCount = 0) => {
        if (redirectCount > 5) {
          reject(new Error('重定向次数过多'));
          return;
        }

        https.get(requestUrl, {
          headers: { 'User-Agent': 'Diting-AI-Desktop/1.0' },
        }, (response) => {
          // 处理重定向
          if ([301, 302, 307, 308].includes(response.statusCode ?? 0)) {
            const redirectUrl = response.headers.location;
            if (redirectUrl) {
              let finalUrl = redirectUrl;
              if (redirectUrl.startsWith('/')) {
                try {
                  const parsed = new URL(requestUrl);
                  finalUrl = `${parsed.protocol}//${parsed.host}${redirectUrl}`;
                } catch {
                  // requestUrl 无效时保持原样
                }
              }
              response.resume();
              makeRequest(finalUrl, redirectCount + 1);
              return;
            }
          }

          if (response.statusCode !== 200) {
            reject(new Error(`获取文件列表失败: HTTP ${response.statusCode} (${requestUrl})`));
            return;
          }

          let data = '';
          response.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          response.on('end', () => {
            (async () => {
              try {
                const items = JSON.parse(data) as Array<{
                  type: string;
                  path: string;
                }>;

                const results: string[] = [];
                const subdirPromises: Promise<string[]>[] = [];

                for (const item of items) {
                  if (item.type === 'file') {
                    results.push(item.path);
                  } else if (item.type === 'directory') {
                    // 递归获取子目录
                    subdirPromises.push(fetchTree(item.path));
                  }
                }

                // 等待所有子目录递归完成
                const subdirResults = await Promise.all(subdirPromises);
                for (const subFiles of subdirResults) {
                  results.push(...subFiles);
                }

                resolve(results);
              } catch (err) {
                reject(new Error(`解析文件列表失败: ${err instanceof Error ? err.message : String(err)}`));
              }
            })().catch(reject);
          });
        }).on('error', reject);
      };

      makeRequest(apiUrl);
    });
  };

  return fetchTree('');
}

/** 下载文件计划项：源路径 → 本地保存路径 */
interface DownloadFilePlan {
  /** 在 HuggingFace 仓库中的路径（如 "onnx/model_quantized.onnx"） */
  sourcePath: string;
  /** 下载到本地的保存路径（如 "onnx/model.onnx"） */
  targetPath: string;
}

/**
 * 从完整文件列表中筛选并构建推理所需的文件下载计划
 *
 * @kreuzberg/node 在 custom 模式下，通过 cacheDir 指向模型目录后，
 * 会按照标准 HuggingFace 目录结构查找以下文件：
 *
 *   - onnx/model.onnx        ONNX 模型权重（核心，必须叫这个名字）
 *   - tokenizer.json         分词器
 *   - tokenizer_config.json  分词器配置
 *   - config.json            模型配置
 *   - special_tokens_map.json 特殊 token 映射
 *   - vocab.txt / vocab.json  词表文件（部分模型需要）
 *   - merges.txt             BPE 合并表（部分模型需要）
 *   - preprocessor_config.json 预处理配置（多模态模型）
 *
 * ★ 重要：当 onnx/model.onnx 有对应的 onnx/model.onnx_data 时，
 *   说明模型超过 2GB 使用了外部数据文件。ONNX Runtime 在
 *   @kreuzberg/node 的 Rust 原生层中加载时可能无法正确解析
 *   外部数据文件的相对路径，导致 "unknown exception in Initialize" 错误。
 *   此时改为下载量化版本（model_quantized.onnx 或 model_int8.onnx），
 *   保存为 onnx/model.onnx，避免外部数据文件依赖。
 *
 * @param allFiles 完整文件列表
 * @returns 下载计划列表
 */
function buildDownloadPlan(allFiles: string[]): DownloadFilePlan[] {
  const allFilesSet = new Set(allFiles);
  const plans: DownloadFilePlan[] = [];

  // ── 基础配置文件（直接下载，保持原路径） ──
  const baseFiles = [
    'config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'special_tokens_map.json',
    'vocab.txt',
    'vocab.json',
    'merges.txt',
    'preprocessor_config.json',
  ];

  for (const f of baseFiles) {
    if (allFilesSet.has(f)) {
      plans.push({ sourcePath: f, targetPath: f });
    }
  }

  // ── ONNX 模型文件 ──
  const hasModelOnnx = allFilesSet.has('onnx/model.onnx');
  const hasModelOnnxData = allFilesSet.has('onnx/model.onnx_data');

  if (hasModelOnnx && !hasModelOnnxData) {
    // 模型没有外部数据文件，直接下载 model.onnx
    plans.push({ sourcePath: 'onnx/model.onnx', targetPath: 'onnx/model.onnx' });
  } else if (hasModelOnnx && hasModelOnnxData) {
    // 模型有外部数据文件（>2GB），ONNX Runtime 可能无法在 @kreuzberg/node 中正确加载。
    // 改为下载量化版本，保存为 onnx/model.onnx
    const quantizedVariants = [
      'onnx/model_quantized.onnx',
      'onnx/model_int8.onnx',
      'onnx/model_uint8.onnx',
      'onnx/model_q8.onnx',
      'onnx/model_q4.onnx',
      'onnx/model_q4f16.onnx',
      'onnx/model_bnb4.onnx',
    ];

    let foundQuantized = false;
    for (const variant of quantizedVariants) {
      if (allFilesSet.has(variant)) {
        // 下载量化版本，但保存为 onnx/model.onnx
        plans.push({ sourcePath: variant, targetPath: 'onnx/model.onnx' });
        foundQuantized = true;
        logger.info(`[VectorModelService] 检测到 model.onnx 有外部数据文件，改用量化版本: ${variant} → onnx/model.onnx`);
        break;
      }
    }

    if (!foundQuantized) {
      // 没有量化版本可用，只能下载原始 model.onnx + model.onnx_data
      logger.warn('[VectorModelService] 模型有外部数据文件但无可用的量化版本，可能无法加载');
      plans.push({ sourcePath: 'onnx/model.onnx', targetPath: 'onnx/model.onnx' });
      plans.push({ sourcePath: 'onnx/model.onnx_data', targetPath: 'onnx/model.onnx_data' });
    }
  } else if (!hasModelOnnx) {
    // 没有 model.onnx，检查是否有量化版本可以作为主模型
    const fallbackVariants = [
      'onnx/model_quantized.onnx',
      'onnx/model_int8.onnx',
      'onnx/model_uint8.onnx',
    ];
    for (const variant of fallbackVariants) {
      if (allFilesSet.has(variant)) {
        plans.push({ sourcePath: variant, targetPath: 'onnx/model.onnx' });
        logger.info(`[VectorModelService] 无 model.onnx，使用 ${variant} 作为主模型 → onnx/model.onnx`);
        break;
      }
    }
  }

  return plans;
}

/**
 * 下载自定义向量模型
 *
 * 通过 HuggingFace API 获取模型仓库的文件列表，然后下载所有文件到本地目录。
 * 保持子目录结构（如 onnx/model.onnx → localDir/onnx/model.onnx）。
 *
 * 自动过滤不需要的文件（.gitattributes, README.md 等），
 * 保留模型推理所需的所有文件（onnx 模型文件、tokenizer 文件、config 等）。
 *
 * @param hfModelId  HuggingFace 模型 ID（如 "onnx-community/Qwen3-Embedding-0.6B-ONNX"）
 * @param dimensions 向量维度
 * @param useMirror  是否使用镜像
 * @param onProgress 进度回调
 * @returns 模型 ID
 */
export async function downloadCustomVectorModel(
  hfModelId: string,
  dimensions: number,
  useMirror: boolean,
  onProgress?: (progress: VectorDownloadProgress) => void,
): Promise<string> {
  // 注册自定义模型
  const def = registerCustomModel(hfModelId, dimensions);
  const modelId = def.id;

  // 如果已有相同模型的下载在进行中，先取消
  const existing = activeDownloads.get(modelId);
  if (existing) {
    existing.abortController.abort();
    activeDownloads.delete(modelId);
  }

  ensureModelDir();
  const localDir = getModelLocalDir(modelId);
  // ★ @kreuzberg/node 在 custom 模式下，以 cacheDir/<hfModelId>/ 为模型目录。
  // 因此文件需要下载到 localDir/<hfModelId>/ 子目录中，cacheDir 设为 localDir。
  const modelFilesDir = path.join(localDir, hfModelId);
  const abortController = new AbortController();
  activeDownloads.set(modelId, { abortController });

  const baseUrl = useMirror ? 'https://hf-mirror.com' : 'https://huggingface.co';

  logger.info(`[VectorModelService] 开始下载自定义向量模型: ${hfModelId} (维度=${dimensions}, 镜像=${useMirror}, 模型目录=${modelFilesDir})`);

  try {
    // 1. 通过 API 递归获取仓库完整文件列表
    let allFiles: string[];
    try {
      allFiles = await fetchModelFileList(hfModelId, useMirror);
      logger.info(`[VectorModelService] 仓库共 ${allFiles.length} 个文件: ${allFiles.join(', ')}`);
    } catch (err) {
      throw new Error(`获取模型文件列表失败: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (allFiles.length === 0) {
      throw new Error('模型仓库中没有可下载的文件');
    }

    // 2. 构建下载计划（处理量化版本重命名等逻辑）
    const downloadPlans = buildDownloadPlan(allFiles);
    const planDesc = downloadPlans.map(p => p.sourcePath === p.targetPath ? p.sourcePath : `${p.sourcePath} → ${p.targetPath}`).join(', ');
    logger.info(`[VectorModelService] 下载计划共 ${downloadPlans.length} 个文件: ${planDesc}`);

    if (downloadPlans.length === 0) {
      throw new Error('模型仓库中未找到推理所需的文件（缺少 onnx/model.onnx 或 tokenizer.json）');
    }

    // 校验必需的核心文件是否存在
    const hasOnnx = downloadPlans.some((p) => p.targetPath === 'onnx/model.onnx');
    const hasTokenizer = downloadPlans.some((p) => p.targetPath === 'tokenizer.json');
    if (!hasOnnx) {
      throw new Error('模型仓库中缺少 onnx/model.onnx，无法用于推理');
    }
    if (!hasTokenizer) {
      throw new Error('模型仓库中缺少 tokenizer.json，无法进行分词');
    }

    // 2.5 清理旧的外部数据文件
    // 如果下载计划使用量化版本替代 model.onnx（不再需要 model.onnx_data），
    // 删除已存在的旧 model.onnx 和 model.onnx_data，避免加载时冲突
    const usesQuantizedReplacement = downloadPlans.some(
      (p) => p.targetPath === 'onnx/model.onnx' && p.sourcePath !== 'onnx/model.onnx',
    );
    if (usesQuantizedReplacement) {
      const oldOnnxPath = path.join(modelFilesDir, 'onnx', 'model.onnx');
      const oldOnnxDataPath = path.join(modelFilesDir, 'onnx', 'model.onnx_data');
      for (const oldFile of [oldOnnxPath, oldOnnxDataPath]) {
        if (fs.existsSync(oldFile)) {
          fs.unlinkSync(oldFile);
          logger.info(`[VectorModelService] 清理旧文件: ${oldFile}`);
        }
      }
    }

    // 3. 逐个下载文件到 localDir/<hfModelId>/ 下（按 targetPath 保存）
    let cumulativeDownloaded = 0;

    for (const plan of downloadPlans) {
      const url = `${baseUrl}/${hfModelId}/resolve/main/${plan.sourcePath}`;
      const localPath = path.join(modelFilesDir, plan.targetPath);

      // 确保子目录存在
      const subDir = path.dirname(localPath);
      if (!fs.existsSync(subDir)) {
        fs.mkdirSync(subDir, { recursive: true });
      }

      // 如果文件已存在且非空，跳过
      if (fs.existsSync(localPath)) {
        const stat = fs.statSync(localPath);
        if (stat.isFile() && stat.size > 0) {
          logger.info(`[VectorModelService] 文件已存在，跳过: ${plan.targetPath}`);
          cumulativeDownloaded += stat.size;
          continue;
        }
      }

      const filename = plan.targetPath;

      try {
        logger.info(`[VectorModelService] 下载文件: ${plan.sourcePath} → ${plan.targetPath} from ${url}`);
        const downloaded = await downloadSingleFile(
          url,
          localPath,
          abortController,
          (fileDownloaded, fileTotal) => {
            const totalDownloaded = cumulativeDownloaded + fileDownloaded;
            const percent = fileTotal > 0 ? (totalDownloaded / (fileTotal * downloadPlans.length)) * 100 : 0;
            onProgress?.({
              modelId,
              filename,
              downloaded: totalDownloaded,
              total: fileTotal,
              percent,
              speed: 0,
              done: false,
            });
          },
        );
        cumulativeDownloaded += downloaded;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // onnx 模型文件和核心配置是必需的，其他文件失败可以跳过
        if (plan.targetPath.endsWith('.onnx') || plan.targetPath === 'config.json' || plan.targetPath === 'tokenizer.json') {
          throw new Error(`必需文件 ${filename} 下载失败: ${msg}`);
        }
        logger.warn(`[VectorModelService] 可选文件 ${filename} 下载失败，跳过: ${msg}`);
      }
    }

    activeDownloads.delete(modelId);
    onProgress?.({
      modelId,
      filename: '',
      downloaded: cumulativeDownloaded,
      total: cumulativeDownloaded,
      percent: 100,
      speed: 0,
      done: true,
    });

    logger.info(`[VectorModelService] 自定义模型下载完成: ${modelId}`);
    return modelId;
  } catch (err) {
    activeDownloads.delete(modelId);
    onProgress?.({
      modelId,
      filename: '',
      downloaded: 0,
      total: 0,
      percent: 0,
      speed: 0,
      done: true,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * 删除自定义模型
 *
 * 自定义模型的文件存储在 localDir/<hfModelId>/ 子目录下，
 * 需要递归删除整个 localDir。
 */
export function deleteCustomVectorModel(modelId: string): boolean {
  // 从注册表移除
  customModels.delete(modelId);
  // 直接递归删除模型目录（不依赖 deleteVectorModel，后者只查预设模型）
  const localDir = getModelLocalDir(modelId);
  return removeDirRecursive(localDir);
}
