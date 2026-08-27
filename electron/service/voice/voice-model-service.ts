/**
 * 语音模型服务
 *
 * 负责本地 Whisper 模型的下载、管理和文件操作。
 * 模型来源：https://huggingface.co/ggerganov/whisper.cpp/tree/main
 * 国内镜像：https://hf-mirror.com/ggerganov/whisper.cpp/tree/main
 * 模型存储路径：~/.diting/model/voice
 *
 * 本文件同时导出统一的引擎类型定义（EngineType）和合并模型状态接口（UnifiedModelStatus），
 * 供控制器和前端区分 Whisper / FunASR 两种本地引擎。
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import https from 'https';
import { logger } from 'ee-core/log';

/** 模型语言类型 */
export type ModelLang = 'multilingual' | 'en';

/** 本地语音引擎类型 */
export type EngineType = 'whisper' | 'funasr';

/** Whisper 模型定义 */
export interface WhisperModelDef {
  /** 模型文件名（如 ggml-tiny.bin） */
  filename: string;
  /** 显示名称（如 Tiny） */
  label: string;
  /** 文件大小（字节） */
  sizeBytes: number;
  /** 语言类型 */
  lang: ModelLang;
  /** 大小描述（如 75 MB） */
  sizeLabel: string;
}

/** 下载进度回调 */
export interface DownloadProgress {
  /** 模型文件名 */
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
export interface ModelStatus {
  /** 模型定义 */
  def: WhisperModelDef;
  /** 是否已下载 */
  downloaded: boolean;
  /** 本地文件路径（如果已下载） */
  localPath: string | null;
  /** 文件大小（字节，实际文件大小） */
  actualSize: number | null;
}

/** 统一的模型状态（Whisper + FunASR 合并后返回给前端） */
export interface UnifiedModelStatus {
  /** 引擎类型 */
  engine: EngineType;
  /** 模型标识（Whisper 用 filename，FunASR 用 id） */
  id: string;
  /** 显示名称 */
  label: string;
  /** 大小描述 */
  sizeLabel: string;
  /** 语言描述 */
  langLabel: string;
  /** 是否已就绪 */
  ready: boolean;
  /** 引擎专属信息 */
  detail: ModelStatus | import('./funasr-model-service').FunasrModelStatus;
}

// Whisper.cpp 可用模型列表（来源：ggerganov/whisper.cpp）
const WHISPER_MODELS: WhisperModelDef[] = [
  { filename: 'ggml-tiny.bin', label: 'Tiny', sizeBytes: 77_700_000, lang: 'multilingual', sizeLabel: '~75 MB' },
  { filename: 'ggml-tiny.en.bin', label: 'Tiny (EN)', sizeBytes: 77_700_000, lang: 'en', sizeLabel: '~75 MB' },
  { filename: 'ggml-base.bin', label: 'Base', sizeBytes: 147_500_000, lang: 'multilingual', sizeLabel: '~142 MB' },
  { filename: 'ggml-base.en.bin', label: 'Base (EN)', sizeBytes: 147_500_000, lang: 'en', sizeLabel: '~142 MB' },
  { filename: 'ggml-small.bin', label: 'Small', sizeBytes: 484_000_000, lang: 'multilingual', sizeLabel: '~466 MB' },
  { filename: 'ggml-small.en.bin', label: 'Small (EN)', sizeBytes: 484_000_000, lang: 'en', sizeLabel: '~466 MB' },
  { filename: 'ggml-medium.bin', label: 'Medium', sizeBytes: 1_530_000_000, lang: 'multilingual', sizeLabel: '~1.5 GB' },
  { filename: 'ggml-medium.en.bin', label: 'Medium (EN)', sizeBytes: 1_530_000_000, lang: 'en', sizeLabel: '~1.5 GB' },
  { filename: 'ggml-large-v3-turbo.bin', label: 'Large v3 Turbo', sizeBytes: 1_620_000_000, lang: 'multilingual', sizeLabel: '~1.6 GB' },
  { filename: 'ggml-large-v3.bin', label: 'Large v3', sizeBytes: 3_100_000_000, lang: 'multilingual', sizeLabel: '~3.1 GB' },
  { filename: 'ggml-large-v2.bin', label: 'Large v2', sizeBytes: 3_100_000_000, lang: 'multilingual', sizeLabel: '~3.1 GB' },
  { filename: 'ggml-large-v1.bin', label: 'Large v1', sizeBytes: 3_000_000_000, lang: 'multilingual', sizeLabel: '~2.9 GB' },
];

/** 国外下载基础 URL */
const HF_BASE_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main';
/** 国内镜像下载基础 URL */
const HF_MIRROR_BASE_URL = 'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main';

/** 进行中的下载任务 */
const activeDownloads = new Map<string, { abortController: AbortController }>();

/**
 * 获取模型存储目录路径
 */
export function getVoiceModelDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.diting', 'model', 'voice');
}

/**
 * 确保模型存储目录存在
 */
export function ensureModelDir(): void {
  const dir = getVoiceModelDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`[VoiceModelService] 创建模型目录: ${dir}`);
  }
}

/**
 * 获取所有可用模型定义列表
 */
export function getAvailableModels(): WhisperModelDef[] {
  return WHISPER_MODELS;
}

/**
 * 获取所有模型的状态（是否已下载等）
 */
export function getModelStatuses(): ModelStatus[] {
  ensureModelDir();
  const dir = getVoiceModelDir();

  return WHISPER_MODELS.map((def) => {
    const localPath = path.join(dir, def.filename);
    let downloaded = false;
    let actualSize: number | null = null;

    try {
      const stat = fs.statSync(localPath);
      if (stat.isFile()) {
        downloaded = true;
        actualSize = stat.size;
      }
    } catch {
      // 文件不存在
    }

    return {
      def,
      downloaded,
      localPath: downloaded ? localPath : null,
      actualSize,
    };
  });
}

/**
 * 检查模型是否已下载
 */
export function isModelDownloaded(filename: string): boolean {
  const dir = getVoiceModelDir();
  const localPath = path.join(dir, filename);
  try {
    const stat = fs.statSync(localPath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * 获取已选择模型的文件路径
 */
export function getSelectedModelPath(filename: string): string | null {
  const dir = getVoiceModelDir();
  const localPath = path.join(dir, filename);
  try {
    const stat = fs.statSync(localPath);
    if (stat.isFile()) {
      return localPath;
    }
  } catch {
    // 文件不存在
  }
  return null;
}

/**
 * 下载模型文件
 *
 * @param filename 模型文件名
 * @param useMirror 是否使用国内镜像
 * @param onProgress 进度回调
 * @returns 下载完成的本地文件路径
 */
export async function downloadModel(
  filename: string,
  useMirror: boolean,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<string> {
  // 如果已有相同模型的下载在进行中，先取消
  const existing = activeDownloads.get(filename);
  if (existing) {
    existing.abortController.abort();
    activeDownloads.delete(filename);
  }

  ensureModelDir();
  const dir = getVoiceModelDir();
  const localPath = path.join(dir, filename);
  const baseUrl = useMirror ? HF_MIRROR_BASE_URL : HF_BASE_URL;
  const downloadUrl = `${baseUrl}/${filename}`;

  // 如果文件已存在，直接返回
  if (fs.existsSync(localPath)) {
    const stat = fs.statSync(localPath);
    if (stat.isFile() && stat.size > 0) {
      logger.info(`[VoiceModelService] 模型已存在，跳过下载: ${filename}`);
      return localPath;
    }
  }

  const abortController = new AbortController();
  activeDownloads.set(filename, { abortController });

  logger.info(`[VoiceModelService] 开始下载模型: ${filename} from ${downloadUrl}`);

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
      activeDownloads.delete(filename);
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {
        // 忽略
      }
      fileStream.destroy();
    };

    const handleProgress = (done: boolean, error?: string) => {
      const now = Date.now();
      const elapsed = (now - lastReportTime) / 1000;
      const speed = elapsed > 0 ? (downloadedBytes - lastReportBytes) / 1024 / elapsed : 0;

      onProgress?.({
        filename,
        downloaded: downloadedBytes,
        total: totalBytes,
        percent: totalBytes > 0 ? (downloadedBytes / totalBytes) * 100 : 0,
        speed,
        done,
        error,
      });

      lastReportTime = now;
      lastReportBytes = downloadedBytes;
    };

    const request = https.get(downloadUrl, {
      headers: {
        'User-Agent': 'Diting-AI-Desktop/1.0',
      },
    }, (response) => {
      // 处理重定向
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          logger.info(`[VoiceModelService] 重定向到: ${redirectUrl}`);
          // 重新请求
          https.get(redirectUrl, {
            headers: { 'User-Agent': 'Diting-AI-Desktop/1.0' },
          }, (redirectResponse) => {
            handleRedirectResponse(redirectResponse);
          }).on('error', (err) => {
            cleanup();
            reject(err);
          });
          return;
        }
      }

      handleRedirectResponse(response);
    });

    function handleRedirectResponse(response: import('http').IncomingMessage) {
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
        handleProgress(false);
      });

      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close((err) => {
          if (err) {
            cleanup();
            reject(err);
            return;
          }
          // 重命名临时文件为最终文件
          fs.renameSync(tempPath, localPath);
          activeDownloads.delete(filename);
          handleProgress(true);
          logger.info(`[VoiceModelService] 模型下载完成: ${filename}, 大小: ${downloadedBytes} 字节`);
          resolve(localPath);
        });
      });
    }

    request.on('error', (err) => {
      cleanup();
      reject(err);
    });

    // 监听 abort
    abortController.signal.addEventListener('abort', () => {
      request.destroy();
      cleanup();
      reject(new Error('下载已取消'));
    });
  });
}

/**
 * 取消模型下载
 */
export function cancelDownload(filename: string): boolean {
  const existing = activeDownloads.get(filename);
  if (existing) {
    existing.abortController.abort();
    activeDownloads.delete(filename);
    logger.info(`[VoiceModelService] 取消下载: ${filename}`);
    return true;
  }
  return false;
}

/**
 * 删除已下载的模型文件
 */
export function deleteModelFile(filename: string): boolean {
  const dir = getVoiceModelDir();
  const localPath = path.join(dir, filename);
  try {
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
      logger.info(`[VoiceModelService] 删除模型文件: ${filename}`);
      return true;
    }
    return false;
  } catch (err) {
    logger.error(`[VoiceModelService] 删除模型文件失败: ${filename}`, err);
    return false;
  }
}

// ===== 统一模型管理（Whisper + FunASR 合并） =====

/**
 * 获取所有本地模型的统一状态列表（Whisper + FunASR）
 *
 * 返回的列表中，每个模型都带有引擎类型标记（engine 字段），
 * 前端可根据 engine 字段区分展示和操作逻辑。
 */
export function getUnifiedModelStatuses(): UnifiedModelStatus[] {
  const whisperStatuses = getModelStatuses();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const funasrStatuses = require('./funasr-model-service').getFunasrModelStatuses() as import('./funasr-model-service').FunasrModelStatus[];

  const whisperUnified: UnifiedModelStatus[] = whisperStatuses.map((s) => ({
    engine: 'whisper' as const,
    id: s.def.filename,
    label: s.def.label,
    sizeLabel: s.def.sizeLabel,
    langLabel: s.def.lang === 'multilingual' ? '多语言' : '仅英语',
    ready: s.downloaded,
    detail: s,
  }));

  const funasrUnified: UnifiedModelStatus[] = funasrStatuses.map((s) => ({
    engine: 'funasr' as const,
    id: s.def.id,
    label: s.def.label,
    sizeLabel: s.def.sizeLabel,
    langLabel: s.def.langLabel,
    ready: s.ready,
    detail: s,
  }));

  return [...funasrUnified, ...whisperUnified];
}
