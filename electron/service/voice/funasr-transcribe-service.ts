/**
 * FunASR 实时流式语音转文字服务
 *
 * 基于 FunASR llama.cpp runtime（v0.1.9）预编译二进制，
 * 通过子进程调用对应模型的 CLI 工具处理 WAV 音频块。
 *
 * 与 Whisper 不同，FunASR 不做 LLM 校对，直接输出原始转写文本。
 *
 * 工作流程：
 *   1. startSession() — 根据模型类型选择对应二进制，初始化会话
 *   2. feedAudioData() — 持续接收前端发来的 16kHz PCM Float32 数据块
 *   3. 当缓冲达到固定阈值时触发一次转写
 *   4. 将 PCM 转 WAV → 写入临时文件 → spawn CLI（CLI 内置 --vad 自动分段）→ 读取 stdout
 *   5. stopSession() — 处理剩余缓冲 + 清理临时文件
 *
 * 二进制文件位置：
 *   - 开发环境：electron/resources/funasr-llamacpp/<platform>/
 *   - 生产环境：process.resourcesPath/funasr-llamacpp/<platform>/
 *
 * 预编译包来源：
 *   https://github.com/QwenAudio/Fun-ASR/releases/tag/runtime-llamacpp-v0.1.9
 *
 * 二进制选择规则：
 *   - sensevoice-*  → llama-funasr-sensevoice -m <model> -a <wav> --vad <vad>
 *   - paraformer-*  → llama-funasr-paraformer -m <model> -a <wav> --vad <vad>
 *   - fun-asr-nano-* → llama-funasr-cli --enc <encoder> -m <llm> -a <wav> --vad <vad>
 *
 * Nano 架构需要两个模型文件：encoder（funasr-encoder-*.gguf）+ LLM（qwen3-0.6b-*.gguf），
 * 通过 llama-funasr-cli 统一 CLI 调用，与 SenseVoice/Paraformer 的专用二进制不同。
 *
 * 转写策略：
 *   不在 JS 层做能量 VAD 切割和重叠区去重，完全依赖 CLI 内置的 fsmn-vad 分段能力。
 *   音频持续累积，达到 3 秒阈值后整块送入 CLI，由 CLI 的 --vad 参数自动分段转写。
 *
 * VAD 参数说明（硬编码在二进制中，CLI 不可调）：
 *   - max_end_silence: 动态调度，初始 1850ms，随累计说话时长递减（DEFAULT_SILENCE_SCHEDULE）
 *   - speech_noise_thres: 固定 0.5
 *   - sil_to_speech / speech_to_sil: 各 150ms（15 帧）
 *   - max_seg: 默认 60000ms，可通过 --vad-maxseg 覆盖
 */

import { execFile } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { app as electronApp } from 'electron';
import { logger } from 'ee-core/log';
import { getFunasrModelPaths } from './funasr-model-service';

// ===== 音频参数 =====

const SAMPLE_RATE = 16000;

// 缓冲策略参数：达到此阈值触发一次 CLI 转写
// 3 秒缓冲：在延迟和 CLI 调用开销之间取平衡
// FunASR CLI 的 --vad 内置 fsmn-vad 会自动对音频分段，无需 JS 层 VAD
// VAD 的 max_end_silence 和 speech_noise_thres 硬编码在二进制中，不可通过 CLI 参数调整：
//   - max_end_silence: 动态调度，初始 1850ms，随说话时长递减（详见 DEFAULT_SILENCE_SCHEDULE）
//   - speech_noise_thres: 固定 0.5
//   - sil_to_speech / speech_to_sil: 各 150ms（15 帧）
//   - max_seg: 默认 60000ms，可通过 --vad-maxseg 覆盖
const BUFFER_SECONDS = 3;                    // 目标块大小：3 秒
const TARGET_SAMPLES = SAMPLE_RATE * BUFFER_SECONDS;
const MIN_SAMPLES_TO_PROCESS = Math.floor(SAMPLE_RATE * 0.5); // 最少 0.5 秒才处理

// CLI 调用超时（缓冲缩短后单次处理更快，适当降低超时）
const CLI_TIMEOUT_MS = 20_000;               // 单次 CLI 调用超时

/** 推送给前端的 payload */
interface ResultPayload {
  /** 文本内容 */
  text: string;
  /** 类型：raw=中间结果, final=最终结果 */
  type: 'raw' | 'final';
}

/** 模型类型 */
type ModelType = 'sensevoice' | 'paraformer' | 'nano';

/** 会话状态 */
interface SessionState {
  /** 模型 ID */
  modelId: string;
  /** 模型类型 */
  modelType: ModelType;
  /** 主模型（或 LLM）文件路径 */
  modelPath: string;
  /** 编码器文件路径（仅 Nano 架构） */
  encoderPath?: string;
  /** VAD 模型文件路径 */
  vadPath: string;
  /** 语言代码 */
  language: string;
  /** 二进制路径 */
  binaryPath: string;
  /** 临时目录路径 */
  tmpDir: string;
  /** 音频缓冲（Buffer 数组，每个是 Float32 PCM） */
  audioChunks: Buffer[];
  /** 已缓冲的采样数 */
  bufferedSamples: number;
  /** 是否正在转写 */
  isProcessing: boolean;
  /** 是否正在运行 */
  isActive: boolean;
  /** 转写结果回调 */
  onResult: (payload: ResultPayload) => void;
}

let session: SessionState | null = null;

// ===== 二进制路径解析 =====

/**
 * 获取平台对应的二进制目录名
 */
function getPlatformDir(): string {
  const platform = os.platform();
  const arch = os.arch();

  switch (platform) {
    case 'darwin':
      return arch === 'arm64' ? 'macos-arm64' : 'macos-x64';
    case 'win32':
      return 'windows-x64';
    case 'linux':
      if (arch === 'arm64') return 'linux-arm64';
      return 'linux-x64';
    default:
      throw new Error(`不支持的平台: ${platform}-${arch}`);
  }
}

/**
 * 获取二进制可执行文件名（含扩展名）
 */
function getExecutableName(baseName: string): string {
  return os.platform() === 'win32' ? `${baseName}.exe` : baseName;
}

/**
 * 获取 FunASR 二进制目录
 *
 * 开发环境：ee-core 将源码 bundle 到 public/electron/main.js，
 *   __dirname 为 public/electron/，不能用相对源码路径。
 *   使用 app.getAppPath() 获取项目根目录再拼 electron/resources/funasr-llamacpp/<platform>/
 * 生产环境：process.resourcesPath/funasr-llamacpp/<platform>/
 */
function getBinaryDir(): string {
  const platformDir = getPlatformDir();

  // 判断是否在打包后的环境
  if (electronApp.isPackaged && process.resourcesPath) {
    return path.join(process.resourcesPath, 'funasr-llamacpp', platformDir);
  }

  // 开发环境：使用 app.getAppPath() 定位项目根目录
  const baseDir = electronApp.getAppPath ? electronApp.getAppPath() : process.cwd();
  return path.join(baseDir, 'electron', 'resources', 'funasr-llamacpp', platformDir);
}

/**
 * 获取指定二进制的完整路径
 */
function getBinaryPath(baseName: string): string {
  return path.join(getBinaryDir(), getExecutableName(baseName));
}

/**
 * 检查 FunASR 二进制是否存在
 *
 * 检查 SenseVoice/Paraformer 专用二进制和 Nano 通用 CLI 二进制
 */
export function isFunasrAvailable(): boolean {
  try {
    const sensevoicePath = getBinaryPath('llama-funasr-sensevoice');
    const paraformerPath = getBinaryPath('llama-funasr-paraformer');
    const cliPath = getBinaryPath('llama-funasr-cli');
    const svExists = fs.existsSync(sensevoicePath);
    const pfExists = fs.existsSync(paraformerPath);
    const cliExists = fs.existsSync(cliPath);
    logger.info(`[FunasrTranscribe] 二进制路径检查: sensevoice=${sensevoicePath} (${svExists}), paraformer=${paraformerPath} (${pfExists}), cli=${cliPath} (${cliExists})`);
    return svExists || pfExists || cliExists;
  } catch (err) {
    logger.error('[FunasrTranscribe] 检查二进制可用性失败:', err);
    return false;
  }
}

/**
 * 根据模型 ID 推断模型类型和对应的二进制名
 */
function resolveBinary(modelId: string): { binaryBaseName: string; modelType: ModelType } {
  if (modelId.startsWith('sensevoice')) {
    return { binaryBaseName: 'llama-funasr-sensevoice', modelType: 'sensevoice' };
  }
  if (modelId.startsWith('paraformer')) {
    return { binaryBaseName: 'llama-funasr-paraformer', modelType: 'paraformer' };
  }
  // Fun-ASR-Nano 使用 llama-funasr-cli（需要 --enc encoder + -m model）
  return { binaryBaseName: 'llama-funasr-cli', modelType: 'nano' };
}

// ===== 音频处理工具 =====

/**
 * 将 Buffer 数组合并为 Float32Array
 */
function chunksToFloat32(chunks: Buffer[]): Float32Array {
  const buf = Buffer.concat(chunks);
  const copy = new Float32Array(buf.length / 4);
  copy.set(new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4));
  return copy;
}

/**
 * 将 Float32 PCM 转换为 16kHz 16-bit 单声道 WAV 文件 Buffer
 */
function float32ToWav(pcm: Float32Array): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = SAMPLE_RATE * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = pcm.length * 2;
  const bufferSize = 44 + dataSize;

  const buffer = Buffer.alloc(bufferSize);

  // WAV 文件头
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(bufferSize - 8, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // 写入 16-bit PCM 数据
  let offset = 44;
  for (let i = 0; i < pcm.length; i++) {
    const clamped = Math.max(-1, Math.min(1, pcm[i]));
    const intSample = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
    buffer.writeInt16LE(intSample | 0, offset);
    offset += 2;
  }

  return buffer;
}

// ===== CLI 转写调用 =====

/**
 * 调用 FunASR CLI 转写 WAV 文件
 *
 * CLI 内置 --vad 参数会使用 fsmn-vad 自动对长音频进行分段，无需 JS 层切割。
 * 返回 stdout 输出的转写文本。
 */
function transcribeViaCli(
  binaryPath: string,
  modelPath: string,
  vadPath: string,
  wavPath: string,
  modelType: ModelType,
  encoderPath?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // 构建命令行参数
    const args: string[] = [];

    if (modelType === 'nano' && encoderPath) {
      // Fun-ASR-Nano: llama-funasr-cli --enc <encoder> -m <llm> -a <wav> --vad <vad>
      args.push('--enc', encoderPath, '-m', modelPath, '-a', wavPath, '--vad', vadPath);
    } else {
      // SenseVoice / Paraformer: llama-funasr-<type> -m <model> -a <wav> --vad <vad>
      args.push('-m', modelPath, '-a', wavPath, '--vad', vadPath);
    }

    logger.info(`[FunasrTranscribe] 调用 CLI: ${binaryPath} ${args.join(' ')}`);

    const child = execFile(binaryPath, args, {
      timeout: CLI_TIMEOUT_MS,
      maxBuffer: 1024 * 1024, // 1MB stdout 缓冲
      windowsHide: true,
    }, (err, stdout, stderr) => {
      if (err) {
        // 非零退出码但有 stdout 时仍尝试提取文本
        const text = stdout.trim();
        if (text) {
          resolve(text);
          return;
        }
        reject(new Error(`CLI 错误: ${err.message}${stderr ? `\nstderr: ${stderr}` : ''}`));
        return;
      }

      resolve(stdout.trim());
    });

    // 防止僵尸进程
    child.on('error', (err) => {
      reject(new Error(`CLI 启动失败: ${err.message}`));
    });
  });
}

// ===== 会话生命周期 =====

/**
 * 创建临时目录用于存放 WAV 文件
 */
function createTmpDir(): string {
  const tmpBase = path.join(os.tmpdir(), 'diting-funasr');
  if (!fs.existsSync(tmpBase)) {
    fs.mkdirSync(tmpBase, { recursive: true });
  }
  return tmpBase;
}

/**
 * 启动转写会话
 */
export async function startSession(
  modelId: string,
  language: string,
  onResult: (payload: ResultPayload) => void,
): Promise<{ ok: boolean; message?: string }> {
  if (session) {
    await stopSession();
  }

  // 获取模型路径
  const paths = getFunasrModelPaths(modelId);
  if (!paths) {
    return { ok: false, message: 'FunASR 模型未就绪，请先下载模型' };
  }

  // 检查二进制
  if (!isFunasrAvailable()) {
    return { ok: false, message: 'FunASR 二进制运行时不在此平台可用' };
  }

  // 解析模型类型和二进制
  const { binaryBaseName, modelType } = resolveBinary(modelId);

  const binaryPath = getBinaryPath(binaryBaseName);

  if (!fs.existsSync(binaryPath)) {
    return { ok: false, message: `二进制文件不存在: ${binaryBaseName}` };
  }

  logger.info(`[FunasrTranscribe] 启动会话: model=${modelId}, type=${modelType}, lang=${language}`);

  // 创建临时目录
  const tmpDir = createTmpDir();

  session = {
    modelId,
    modelType,
    modelPath: paths.modelPath,
    encoderPath: paths.encoderPath,
    vadPath: paths.vadPath,
    language,
    binaryPath,
    tmpDir,
    audioChunks: [],
    bufferedSamples: 0,
    isProcessing: false,
    isActive: true,
    onResult,
  };

  return { ok: true };
}

/**
 * 喂入音频数据
 *
 * 持续累积音频，达到固定阈值后整块送入 CLI 转写。
 * 不做 JS 层 VAD 切割，完全依赖 CLI 内置 --vad 分段。
 */
export function feedAudioData(chunk: Buffer): void {
  if (!session || !session.isActive) return;

  const chunkSamples = chunk.length / 4;

  // 直接累积所有音频数据（包括静音段，交给 CLI 的 --vad 处理）
  session.audioChunks.push(chunk);
  session.bufferedSamples += chunkSamples;

  // 达到固定阈值触发转写
  if (session.bufferedSamples >= TARGET_SAMPLES && !session.isProcessing) {
    logger.info(`[FunasrTranscribe] 达到固定阈值 ${TARGET_SAMPLES} samples (${BUFFER_SECONDS}s)，触发转写`);
    processBuffer();
  }
}

/**
 * 处理缓冲的音频数据
 *
 * 将 PCM 转 WAV → 写临时文件 → 调用 CLI（内置 --vad 分段）→ 读取 stdout → 推送给前端
 */
async function processBuffer(): Promise<void> {
  if (!session || session.isProcessing) return;

  session.isProcessing = true;

  // 取出当前缓冲的全部音频
  const allChunks = session.audioChunks;
  const pcmf32 = chunksToFloat32(allChunks);

  // 清空当前缓冲
  session.audioChunks = [];
  session.bufferedSamples = 0;

  // 写入临时 WAV 文件
  const wavBuffer = float32ToWav(pcmf32);
  const wavPath = path.join(session.tmpDir, `chunk-${Date.now()}.wav`);

  try {
    fs.writeFileSync(wavPath, wavBuffer);

    const startTime = Date.now();

    // 调用 CLI 转写（CLI 内置 --vad 自动分段）
    const text = await transcribeViaCli(
      session.binaryPath,
      session.modelPath,
      session.vadPath,
      wavPath,
      session.modelType,
      session.encoderPath,
    );

    const elapsed = Date.now() - startTime;

    if (text) {
      logger.info(`[FunasrTranscribe] 转写完成: ${elapsed}ms, 文本="${text.substring(0, 80)}..."`);
      // 直接作为最终文本推送（不做 LLM 校对，不做去重）
      session.onResult({ text, type: 'final' });
    } else {
      logger.warn(`[FunasrTranscribe] 转写完成: ${elapsed}ms, 无文本`);
    }
  } catch (err) {
    logger.error('[FunasrTranscribe] 转写失败:', err);
  } finally {
    // 清理临时文件
    try {
      if (fs.existsSync(wavPath)) {
        fs.unlinkSync(wavPath);
      }
    } catch {
      // 忽略清理失败
    }

    if (session) {
      session.isProcessing = false;
    }
  }
}

/**
 * 停止转写会话
 */
export async function stopSession(): Promise<void> {
  if (!session) return;

  session.isActive = false;

  // 处理剩余的音频数据
  const hasData = session.audioChunks.length > 0;
  if (hasData && !session.isProcessing) {
    await processBuffer();
  }

  // 等待正在进行的转写完成
  while (session?.isProcessing) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // 清理临时目录中的残留文件
  try {
    if (fs.existsSync(session.tmpDir)) {
      const files = fs.readdirSync(session.tmpDir);
      for (const f of files) {
        if (f.endsWith('.wav')) {
          fs.unlinkSync(path.join(session.tmpDir, f));
        }
      }
    }
  } catch {
    // 忽略清理失败
  }

  session = null;
  logger.info('[FunasrTranscribe] 会话已停止');
}

/**
 * 检查会话是否活跃
 */
export function isSessionActive(): boolean {
  return session?.isActive ?? false;
}
