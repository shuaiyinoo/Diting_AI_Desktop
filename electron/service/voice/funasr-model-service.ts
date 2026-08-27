/**
 * FunASR 模型服务
 *
 * 负责 FunASR GGUF 模型的定义、下载、管理和文件操作。
 * 模型来源：https://huggingface.co/FunAudioLLM/SenseVoice-Small-GGUF
 *           https://huggingface.co/FunAudioLLM/Paraformer-GGUF
 * 国内镜像：https://hf-mirror.com/...
 * 模型存储路径：~/.diting/model/voice（与 Whisper 共用目录）
 *
 * FunASR 的 GGUF 模型基于 llama.cpp 运行时，无需 Python 环境。
 * 需要同时下载主模型文件和 VAD 模型文件（fsmn-vad.gguf）。
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import https from 'https';
import { logger } from 'ee-core/log';

/** FunASR 模型定义 */
export interface FunasrModelDef {
  /** 模型唯一标识（如 sensevoice-small） */
  id: string;
  /** 主模型文件名（如 sensevoice-small-f16.gguf）
   *  对于 Nano 架构，此字段为 LLM 模型文件（如 qwen3-0.6b-q8_0.gguf） */
  modelFile: string;
  /** 编码器模型文件名（仅 Nano 架构需要，如 funasr-encoder-f16.gguf）
   *  SenseVoice / Paraformer 不需要此字段 */
  encoderFile?: string;
  /** VAD 模型文件名（如 fsmn-vad.gguf） */
  vadFile: string;
  /** 显示名称（如 SenseVoice Small） */
  label: string;
  /** 文件大小（字节，主模型 + 编码器 + VAD 合计） */
  sizeBytes: number;
  /** 大小描述（如 ~234 MB） */
  sizeLabel: string;
  /** 支持的语言列表 */
  languages: string[];
  /** 语言类型描述（如「中/粤/英/日/韩」） */
  langLabel: string;
  /** 模型说明 */
  description: string;
}

/** FunASR 模型状态 */
export interface FunasrModelStatus {
  /** 模型定义 */
  def: FunasrModelDef;
  /** 主模型（或 LLM 模型）是否已下载 */
  modelDownloaded: boolean;
  /** 编码器模型是否已下载（仅 Nano 架构） */
  encoderDownloaded: boolean;
  /** VAD 模型是否已下载 */
  vadDownloaded: boolean;
  /** 整体是否已就绪（所有必需文件都已下载） */
  ready: boolean;
  /** 主模型本地路径 */
  modelPath: string | null;
  /** 编码器本地路径（仅 Nano 架构） */
  encoderPath: string | null;
  /** VAD 模型本地路径 */
  vadPath: string | null;
  /** 主模型实际大小 */
  modelActualSize: number | null;
}

/**
 * FunASR 可用模型列表
 *
 * 每个模型仓库提供 3 种量化版本：
 *   - f16  : 半精度浮点（默认推荐，精度最高）
 *   - q8   : 8-bit 量化（体积更小，CPU 推理更快，精度损失极小）
 *   - full : 全精度（原始浮点，体积最大）
 *
 * 模型来源（HuggingFace / 镜像）：
 *   SenseVoice: FunAudioLLM/SenseVoiceSmall-GGUF
 *   Paraformer: FunAudioLLM/Paraformer-GGUF
 *   Fun-ASR-Nano:      FunAudioLLM/Fun-ASR-Nano-GGUF
 *   FSMN-VAD:           FunAudioLLM/fsmn-vad-GGUF
 *
 * VAD 模型只有单个文件，所有 FunASR 模型共用。
 *
 * Fun-ASR-Nano 基于 LLM 架构（SenseVoice 编码器 + Qwen3-0.6B LLM），
 * 需要额外下载 encoder 文件（funasr-encoder-*.gguf），
 * CLI 调用方式为 llama-funasr-cli --enc <encoder> -m <llm> -a <wav> --vad <vad>。
 * SenseVoice / Paraformer 只需单个模型文件，调用方式为 llama-funasr-<type> -m <model> -a <wav> --vad <vad>。
 */
const FUNASR_MODELS: FunasrModelDef[] = [
  // ===== SenseVoice Small (3 种量化) =====
  {
    id: 'sensevoice-small-f16',
    modelFile: 'sensevoice-small-f16.gguf',
    vadFile: 'fsmn-vad.gguf',
    label: 'SenseVoice Small (F16)',
    sizeBytes: 234_000_000,
    sizeLabel: '~223 MB',
    languages: ['zh', 'yue', 'en', 'ja', 'ko'],
    langLabel: '中/粤/英/日/韩',
    description: '半精度，五语种识别+情感检测，推荐首选',
  },
  {
    id: 'sensevoice-small-q8',
    modelFile: 'sensevoice-small-q8.gguf',
    vadFile: 'fsmn-vad.gguf',
    label: 'SenseVoice Small (Q8)',
    sizeBytes: 128_000_000,
    sizeLabel: '~122 MB',
    languages: ['zh', 'yue', 'en', 'ja', 'ko'],
    langLabel: '中/粤/英/日/韩',
    description: '8-bit 量化，体积更小CPU更快，精度损失极小',
  },
  {
    id: 'sensevoice-small-full',
    modelFile: 'sensevoice-small.gguf',
    vadFile: 'fsmn-vad.gguf',
    label: 'SenseVoice Small (Full)',
    sizeBytes: 470_000_000,
    sizeLabel: '~449 MB',
    languages: ['zh', 'yue', 'en', 'ja', 'ko'],
    langLabel: '中/粤/英/日/韩',
    description: '全精度浮点，精度最高体积最大',
  },
  // ===== Paraformer 中文 (3 种量化) =====
  {
    id: 'paraformer-f16',
    modelFile: 'paraformer-f16.gguf',
    vadFile: 'fsmn-vad.gguf',
    label: 'Paraformer 中文 (F16)',
    sizeBytes: 216_000_000,
    sizeLabel: '~206 MB',
    languages: ['zh'],
    langLabel: '中文+粤语',
    description: '半精度，中文最高精度，内置标点恢复和时间戳',
  },
  {
    id: 'paraformer-q8',
    modelFile: 'paraformer-q8.gguf',
    vadFile: 'fsmn-vad.gguf',
    label: 'Paraformer 中文 (Q8)',
    sizeBytes: 116_000_000,
    sizeLabel: '~111 MB',
    languages: ['zh'],
    langLabel: '中文+粤语',
    description: '8-bit 量化，体积更小CPU更快，精度损失极小',
  },
  {
    id: 'paraformer-full',
    modelFile: 'paraformer.gguf',
    vadFile: 'fsmn-vad.gguf',
    label: 'Paraformer 中文 (Full)',
    sizeBytes: 435_000_000,
    sizeLabel: '~415 MB',
    languages: ['zh'],
    langLabel: '中文+粤语',
    description: '全精度浮点，精度最高体积最大',
  },
  // ===== Fun-ASR-Nano 旗舰 (LLM 架构: encoder + Qwen3-0.6B) =====
  // Nano 需要两个模型文件：encoder（funasr-encoder-*.gguf）+ LLM（qwen3-0.6b-*.gguf）
  // CLI: llama-funasr-cli --enc <encoder> -m <llm> -a <wav> --vad <vad>
  {
    id: 'fun-asr-nano-f16',
    modelFile: 'qwen3-0.6b-q8_0.gguf',
    encoderFile: 'funasr-encoder-f16.gguf',
    vadFile: 'fsmn-vad.gguf',
    label: 'Fun-ASR-Nano (F16 Encoder + Q8 LLM)',
    sizeBytes: 1_278_000_000, // 469MB encoder + 805MB LLM + 4MB VAD
    sizeLabel: '~1.2 GB',
    languages: ['zh', 'en', 'ja', 'yue'],
    langLabel: '中/英/日/粤+方言',
    description: '旗舰LLM架构(SenseVoice编码器+Qwen3-0.6B)，F16编码器+Q8 LLM，上下文理解最强',
  },
  {
    id: 'fun-asr-nano-q4',
    modelFile: 'qwen3-0.6b-q4km.gguf',
    encoderFile: 'funasr-encoder-f16.gguf',
    vadFile: 'fsmn-vad.gguf',
    label: 'Fun-ASR-Nano (F16 Encoder + Q4 LLM)',
    sizeBytes: 957_000_000, // 469MB encoder + 484MB LLM + 4MB VAD
    sizeLabel: '~930 MB',
    languages: ['zh', 'en', 'ja', 'yue'],
    langLabel: '中/英/日/粤+方言',
    description: '旗舰LLM架构，F16编码器+Q4_K_M量化LLM，体积最小推理最快',
  },
];

/** VAD 模型文件名（所有 FunASR 模型共用同一个 VAD） */
const VAD_FILE = 'fsmn-vad.gguf';

/** 国外下载基础 URL */
const HF_BASE_URL = 'https://huggingface.co/FunAudioLLM';
/** 国内镜像下载基础 URL */
const HF_MIRROR_BASE_URL = 'https://hf-mirror.com/FunAudioLLM';

/** 各模型文件对应的 HuggingFace 仓库子路径（注意大小写） */
const MODEL_REPO_MAP: Record<string, string> = {
  // SenseVoice
  'sensevoice-small-f16.gguf': 'SenseVoiceSmall-GGUF/resolve/main',
  'sensevoice-small-q8.gguf': 'SenseVoiceSmall-GGUF/resolve/main',
  'sensevoice-small.gguf': 'SenseVoiceSmall-GGUF/resolve/main',
  // Paraformer
  'paraformer-f16.gguf': 'Paraformer-GGUF/resolve/main',
  'paraformer-q8.gguf': 'Paraformer-GGUF/resolve/main',
  'paraformer.gguf': 'Paraformer-GGUF/resolve/main',
  // Fun-ASR-Nano (encoder + LLM 来自同一仓库)
  'funasr-encoder-f16.gguf': 'Fun-ASR-Nano-GGUF/resolve/main',
  'funasr-encoder.gguf': 'Fun-ASR-Nano-GGUF/resolve/main',
  'qwen3-0.6b-q8_0.gguf': 'Fun-ASR-Nano-GGUF/resolve/main',
  'qwen3-0.6b-q4km.gguf': 'Fun-ASR-Nano-GGUF/resolve/main',
  'qwen3-0.6b-f32.gguf': 'Fun-ASR-Nano-GGUF/resolve/main',
  // VAD
  'fsmn-vad.gguf': 'fsmn-vad-GGUF/resolve/main',
};

/** 进行中的下载任务 */
const activeDownloads = new Map<string, { abortController: AbortController }>();

/**
 * 获取模型存储目录路径（与 Whisper 共用）
 */
export function getFunasrModelDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.diting', 'model', 'voice');
}

/**
 * 确保模型存储目录存在
 */
export function ensureFunasrModelDir(): void {
  const dir = getFunasrModelDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`[FunasrModelService] 创建模型目录: ${dir}`);
  }
}

/**
 * 获取所有可用 FunASR 模型定义列表
 */
export function getFunasrAvailableModels(): FunasrModelDef[] {
  return FUNASR_MODELS;
}

/**
 * 获取所有 FunASR 模型的状态（是否已下载等）
 */
export function getFunasrModelStatuses(): FunasrModelStatus[] {
  ensureFunasrModelDir();
  const dir = getFunasrModelDir();

  return FUNASR_MODELS.map((def) => {
    const modelPath = path.join(dir, def.modelFile);
    const vadPath = path.join(dir, def.vadFile);
    const encoderPath = def.encoderFile ? path.join(dir, def.encoderFile) : null;

    let modelDownloaded = false;
    let encoderDownloaded = false;
    let vadDownloaded = false;
    let modelActualSize: number | null = null;

    try {
      const stat = fs.statSync(modelPath);
      if (stat.isFile()) {
        modelDownloaded = true;
        modelActualSize = stat.size;
      }
    } catch {
      // 文件不存在
    }

    // Nano 架构需要 encoder 文件
    if (encoderPath) {
      try {
        encoderDownloaded = fs.statSync(encoderPath).isFile();
      } catch {
        // 文件不存在
      }
    } else {
      // 非 Nano 架构不需要 encoder，视为已就绪
      encoderDownloaded = true;
    }

    try {
      const stat = fs.statSync(vadPath);
      if (stat.isFile()) {
        vadDownloaded = true;
      }
    } catch {
      // 文件不存在
    }

    return {
      def,
      modelDownloaded,
      encoderDownloaded,
      vadDownloaded,
      ready: modelDownloaded && encoderDownloaded && vadDownloaded,
      modelPath: modelDownloaded ? modelPath : null,
      encoderPath: encoderDownloaded && encoderPath ? encoderPath : null,
      vadPath: vadDownloaded ? vadPath : null,
      modelActualSize,
    };
  });
}

/**
 * 检查 FunASR 模型是否已就绪（主模型和 VAD 都已下载）
 */
export function isFunasrModelReady(modelId: string): boolean {
  const def = FUNASR_MODELS.find((m) => m.id === modelId);
  if (!def) return false;

  const dir = getFunasrModelDir();
  const modelPath = path.join(dir, def.modelFile);
  const vadPath = path.join(dir, def.vadFile);
  const encoderPath = def.encoderFile ? path.join(dir, def.encoderFile) : null;

  try {
    const modelOk = fs.statSync(modelPath).isFile();
    const vadOk = fs.statSync(vadPath).isFile();
    const encoderOk = !encoderPath || fs.statSync(encoderPath).isFile();
    return modelOk && vadOk && encoderOk;
  } catch {
    return false;
  }
}

/**
 * 获取 FunASR 模型定义
 */
export function getFunasrModelDef(modelId: string): FunasrModelDef | null {
  return FUNASR_MODELS.find((m) => m.id === modelId) ?? null;
}

/**
 * 获取已就绪的 FunASR 模型文件路径
 */
export function getFunasrModelPaths(modelId: string): { modelPath: string; encoderPath?: string; vadPath: string } | null {
  const def = getFunasrModelDef(modelId);
  if (!def) return null;

  const dir = getFunasrModelDir();
  const modelPath = path.join(dir, def.modelFile);
  const vadPath = path.join(dir, def.vadFile);
  const encoderPath = def.encoderFile ? path.join(dir, def.encoderFile) : null;

  try {
    const modelOk = fs.statSync(modelPath).isFile();
    const vadOk = fs.statSync(vadPath).isFile();
    const encoderOk = !encoderPath || fs.statSync(encoderPath).isFile();
    if (modelOk && vadOk && encoderOk) {
      return { modelPath, encoderPath: encoderPath ?? undefined, vadPath };
    }
  } catch {
    // 文件不存在
  }
  return null;
}

/**
 * 下载单个文件（支持重定向）
 *
 * 内部通用函数，供 downloadFunasrModel 和 downloadVadModel 调用。
 */
function downloadSingleFile(
  filename: string,
  repoPath: string,
  useMirror: boolean,
  abortController: AbortController,
  onProgress?: (downloaded: number, total: number, percent: number, speed: number) => void,
): Promise<string> {
  const dir = getFunasrModelDir();
  const localPath = path.join(dir, filename);
  const baseUrl = useMirror ? HF_MIRROR_BASE_URL : HF_BASE_URL;
  const downloadUrl = `${baseUrl}/${repoPath}/${filename}`;

  // 如果文件已存在，直接返回
  if (fs.existsSync(localPath)) {
    const stat = fs.statSync(localPath);
    if (stat.isFile() && stat.size > 0) {
      logger.info(`[FunasrModelService] 文件已存在，跳过下载: ${filename}`);
      return Promise.resolve(localPath);
    }
  }

  logger.info(`[FunasrModelService] 开始下载: ${filename} from ${downloadUrl}`);

  return new Promise<string>((resolve, reject) => {
    const tempPath = `${localPath}.tmp`;

    // 清理可能残留的临时文件
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
    let lastReportTime = Date.now();
    let lastReportBytes = 0;

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

    const reportProgress = () => {
      const now = Date.now();
      const elapsed = (now - lastReportTime) / 1000;
      const speed = elapsed > 0 ? (downloadedBytes - lastReportBytes) / 1024 / elapsed : 0;
      onProgress?.(
        downloadedBytes,
        totalBytes,
        totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0,
        speed,
      );
      lastReportTime = now;
      lastReportBytes = downloadedBytes;
    };

    const request = https.get(downloadUrl, {
      headers: { 'User-Agent': 'Diting-AI-Desktop/1.0' },
    }, (response) => {
      // 处理重定向
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          logger.info(`[FunasrModelService] 重定向到: ${redirectUrl}`);
          https.get(redirectUrl, {
            headers: { 'User-Agent': 'Diting-AI-Desktop/1.0' },
          }, (redirectResponse) => {
            handleResponse(redirectResponse);
          }).on('error', (err) => {
            cleanup();
            reject(err);
          });
          return;
        }
      }

      handleResponse(response);
    });

    function handleResponse(response: import('http').IncomingMessage) {
      if (response.statusCode !== 200) {
        cleanup();
        reject(new Error(`下载失败: HTTP ${response.statusCode}`));
        return;
      }

      totalBytes = parseInt(response.headers['content-length'] || '0', 10);

      response.on('data', (chunk: Buffer) => {
        if (abortController.signal.aborted) {
          request.destroy();
          cleanup();
          reject(new Error('下载已取消'));
          return;
        }
        downloadedBytes += chunk.length;
        reportProgress();
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
          logger.info(`[FunasrModelService] 下载完成: ${filename}, 大小: ${downloadedBytes} 字节`);
          resolve(localPath);
        });
      });
    }

    request.on('error', (err) => {
      cleanup();
      reject(err);
    });

    abortController.signal.addEventListener('abort', () => {
      request.destroy();
      cleanup();
      reject(new Error('下载已取消'));
    });
  });
}

/**
 * 下载 FunASR 模型
 *
 * 下载顺序：
 *   - Nano 架构：encoder → LLM → VAD（三阶段）
 *   - SenseVoice/Paraformer：主模型 → VAD（两阶段）
 *
 * 对于同一个 modelId，如果 VAD 文件已经存在（其他模型已下载过），则跳过 VAD。
 * 如果 Nano 的 encoder 已存在（另一个 Nano 量化版本已下载过），也跳过。
 *
 * @param modelId 模型 ID（如 sensevoice-small-f16）
 * @param useMirror 是否使用国内镜像
 * @param onProgress 进度回调
 * @returns 下载完成后的模型路径
 */
export async function downloadFunasrModel(
  modelId: string,
  useMirror: boolean,
  onProgress?: (progress: FunasrDownloadProgress) => void,
): Promise<{ modelPath: string; encoderPath?: string; vadPath: string }> {
  const def = getFunasrModelDef(modelId);
  if (!def) {
    throw new Error(`未知的 FunASR 模型 ID: ${modelId}`);
  }

  // 如果已有相同模型的下载在进行中，先取消
  const existing = activeDownloads.get(modelId);
  if (existing) {
    existing.abortController.abort();
    activeDownloads.delete(modelId);
  }

  ensureFunasrModelDir();
  const abortController = new AbortController();
  activeDownloads.set(modelId, { abortController });

  const dir = getFunasrModelDir();
  const modelLocalPath = path.join(dir, def.modelFile);
  const vadLocalPath = path.join(dir, def.vadFile);
  const encoderLocalPath = def.encoderFile ? path.join(dir, def.encoderFile) : null;

  const totalEstimated = def.sizeBytes;
  // 累计已下载字节和各文件总大小
  let encoderDownloadedBytes = 0;
  let encoderTotalBytes = 0;
  let modelDownloadedBytes = 0;
  let modelTotalBytes = 0;
  // 全部需下载文件的总大小（用于进度计算）
  let cumulativeDownloaded = 0;
  let cumulativeTotal = 0;

  try {
    // ===== 第一阶段：下载 encoder（仅 Nano 架构）=====
    if (def.encoderFile && encoderLocalPath) {
      const encoderRepoPath = MODEL_REPO_MAP[def.encoderFile];
      if (!encoderRepoPath) {
        throw new Error(`未找到编码器 ${def.encoderFile} 的仓库路径映射`);
      }

      // 检查 encoder 是否已存在
      let encoderExists = false;
      try {
        encoderExists = fs.statSync(encoderLocalPath).isFile();
      } catch {
        // 不存在
      }

      if (!encoderExists) {
        logger.info(`[FunasrModelService] 开始下载编码器: ${def.encoderFile}`);
        await downloadSingleFile(
          def.encoderFile,
          encoderRepoPath,
          useMirror,
          abortController,
          (downloaded, total, percent, speed) => {
            encoderDownloadedBytes = downloaded;
            encoderTotalBytes = total;
            cumulativeTotal = total;
            onProgress?.({
              modelId,
              filename: def.encoderFile!,
              phase: 'encoder',
              downloaded,
              total,
              percent: total > 0 ? (downloaded / total) * 100 : 0,
              speed,
              done: false,
            });
          },
        );
        cumulativeDownloaded += encoderDownloadedBytes;
      } else {
        logger.info(`[FunasrModelService] 编码器已存在，跳过下载: ${def.encoderFile}`);
      }
    }

    // ===== 第二阶段：下载主模型（或 LLM 模型）=====
    const modelRepoPath = MODEL_REPO_MAP[def.modelFile];
    if (!modelRepoPath) {
      throw new Error(`未找到模型 ${def.modelFile} 的仓库路径映射`);
    }

    await downloadSingleFile(
      def.modelFile,
      modelRepoPath,
      useMirror,
      abortController,
      (downloaded, total, percent, speed) => {
        modelDownloadedBytes = downloaded;
        modelTotalBytes = total;
        // 累计进度 = encoder 已完成 + LLM 当前进度
        const combinedDownloaded = cumulativeDownloaded + downloaded;
        const combinedTotal = cumulativeTotal + total;
        onProgress?.({
          modelId,
          filename: def.modelFile,
          phase: 'model',
          downloaded: combinedDownloaded,
          total: combinedTotal > 0 ? combinedTotal : totalEstimated,
          percent: combinedTotal > 0
            ? (combinedDownloaded / combinedTotal) * 100
            : (downloaded / total) * 100,
          speed,
          done: false,
        });
      },
    );
    cumulativeDownloaded += modelDownloadedBytes;
    cumulativeTotal += modelTotalBytes;

    // ===== 第三阶段：下载 VAD 模型（如果不存在）=====
    const vadRepoPath = MODEL_REPO_MAP[def.vadFile];
    if (!vadRepoPath) {
      throw new Error(`未找到 VAD 模型 ${def.vadFile} 的仓库路径映射`);
    }

    let vadExists = false;
    try {
      vadExists = fs.statSync(vadLocalPath).isFile();
    } catch {
      // 不存在
    }

    if (!vadExists) {
      logger.info(`[FunasrModelService] 开始下载 VAD 模型: ${def.vadFile}`);
      await downloadSingleFile(
        def.vadFile,
        vadRepoPath,
        useMirror,
        abortController,
        (downloaded, total, percent, speed) => {
          const combinedDownloaded = cumulativeDownloaded + downloaded;
          const combinedTotal = cumulativeTotal + total;
          onProgress?.({
            modelId,
            filename: def.vadFile,
            phase: 'vad',
            downloaded: combinedDownloaded,
            total: combinedTotal > 0 ? combinedTotal : totalEstimated,
            percent: combinedTotal > 0
              ? (combinedDownloaded / combinedTotal) * 100
              : (downloaded / total) * 100,
            speed,
            done: false,
          });
        },
      );
    } else {
      logger.info(`[FunasrModelService] VAD 模型已存在，跳过下载: ${def.vadFile}`);
    }

    // 下载完成
    activeDownloads.delete(modelId);
    onProgress?.({
      modelId,
      filename: def.modelFile,
      phase: 'done',
      downloaded: totalEstimated,
      total: totalEstimated,
      percent: 100,
      speed: 0,
      done: true,
    });

    logger.info(`[FunasrModelService] 模型下载完成: ${modelId}`);
    return {
      modelPath: modelLocalPath,
      encoderPath: encoderLocalPath ?? undefined,
      vadPath: vadLocalPath,
    };
  } catch (err) {
    activeDownloads.delete(modelId);
    onProgress?.({
      modelId,
      filename: def.modelFile,
      phase: 'error',
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

/** FunASR 下载进度 */
export interface FunasrDownloadProgress {
  /** 模型 ID */
  modelId: string;
  /** 当前下载的文件名 */
  filename: string;
  /** 下载阶段：encoder=编码器(Nano), model=主模型/LLM, vad=VAD模型, done=全部完成, error=出错 */
  phase: 'encoder' | 'model' | 'vad' | 'done' | 'error';
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

/**
 * 取消 FunASR 模型下载
 */
export function cancelFunasrDownload(modelId: string): boolean {
  const existing = activeDownloads.get(modelId);
  if (existing) {
    existing.abortController.abort();
    activeDownloads.delete(modelId);
    logger.info(`[FunasrModelService] 取消下载: ${modelId}`);
    return true;
  }
  return false;
}

/**
 * 删除 FunASR 模型文件
 *
 * 删除主模型（或 LLM）文件。VAD 和 encoder 文件是共用的，通过孤儿检查决定是否删除。
 */
export function deleteFunasrModel(modelId: string): boolean {
  const def = getFunasrModelDef(modelId);
  if (!def) {
    logger.error(`[FunasrModelService] 删除失败：未知的模型 ID: ${modelId}`);
    return false;
  }

  const dir = getFunasrModelDir();
  const modelPath = path.join(dir, def.modelFile);

  try {
    let deleted = false;
    if (fs.existsSync(modelPath)) {
      fs.unlinkSync(modelPath);
      logger.info(`[FunasrModelService] 删除模型文件: ${def.modelFile}`);
      deleted = true;
    }

    // 尝试清理孤立的 encoder 文件
    if (def.encoderFile) {
      deleteEncoderIfOrphan();
    }

    return deleted;
  } catch (err) {
    logger.error(`[FunasrModelService] 删除模型文件失败: ${def.modelFile}`, err);
    return false;
  }
}

/**
 * 删除孤立的 encoder 文件（仅在没有任何 Nano 模型使用时才删除）
 */
function deleteEncoderIfOrphan(): boolean {
  const dir = getFunasrModelDir();

  // 收集所有 Nano 模型使用的 encoder 文件名
  const nanoEncoderFiles = new Set<string>();
  for (const def of FUNASR_MODELS) {
    if (def.encoderFile) {
      nanoEncoderFiles.add(def.encoderFile);
    }
  }

  for (const encoderFile of nanoEncoderFiles) {
    const encoderPath = path.join(dir, encoderFile);

    // 检查是否有任何 Nano 模型仍在使用此 encoder
    const hasNanoModel = FUNASR_MODELS.some((def) => {
      if (def.encoderFile !== encoderFile) return false;
      const modelPath = path.join(dir, def.modelFile);
      try {
        return fs.statSync(modelPath).isFile();
      } catch {
        return false;
      }
    });

    if (!hasNanoModel) {
      try {
        if (fs.existsSync(encoderPath)) {
          fs.unlinkSync(encoderPath);
          logger.info(`[FunasrModelService] 删除孤立 encoder 文件: ${encoderFile}`);
        }
      } catch (err) {
        logger.error(`[FunasrModelService] 删除 encoder 文件失败: ${encoderFile}`, err);
      }
    } else {
      logger.info(`[FunasrModelService] encoder ${encoderFile} 仍被其他 Nano 模型使用，跳过删除`);
    }
  }
  return true;
}

/**
 * 删除 VAD 模型文件（仅在没有任何 FunASR 主模型时才删除）
 */
export function deleteVadModelIfOrphan(): boolean {
  const dir = getFunasrModelDir();
  const vadPath = path.join(dir, VAD_FILE);

  // 检查是否有任何 FunASR 主模型存在
  const hasMainModel = FUNASR_MODELS.some((def) => {
    const modelPath = path.join(dir, def.modelFile);
    try {
      return fs.statSync(modelPath).isFile();
    } catch {
      return false;
    }
  });

  if (hasMainModel) {
    logger.info('[FunasrModelService] VAD 模型仍被其他模型使用，跳过删除');
    return false;
  }

  try {
    if (fs.existsSync(vadPath)) {
      fs.unlinkSync(vadPath);
      logger.info(`[FunasrModelService] 删除孤儿 VAD 模型文件: ${VAD_FILE}`);
      return true;
    }
    return false;
  } catch (err) {
    logger.error(`[FunasrModelService] 删除 VAD 模型文件失败: ${VAD_FILE}`, err);
    return false;
  }
}
