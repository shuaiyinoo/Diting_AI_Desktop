/**
 * Whisper 实时流式语音转文字服务（带 LLM 校对）
 *
 * 基于 @kutalia/whisper-node-addon，使用已下载的 ggml 模型文件。
 * 结合 LLM（复用 llmdb 已配置的启用模型）对 Whisper 输出做实时校对。
 *
 * 工作流程：
 *   1. startSession() — 预加载 Whisper 模型，初始化 LLM 校对状态
 *   2. feedAudioData() — 持续接收前端发来的 16kHz PCM Float32 数据块
 *   3. 当缓冲达到阈值或检测到语音停顿时自动触发一次转写
 *   4. Whisper 转写结果作为「原始文本」(raw) 推送给前端（灰色显示）
 *   5. 累积 >= 2 段原始文本后，防抖触发 LLM 校对，校对后文本作为「定稿」(corrected) 推送
 *   6. stopSession() — 处理剩余缓冲 + 强制 LLM 校对 + 清理
 *
 * 优化策略：
 *   - 1.5 秒重叠分块：保证句子边界处的上下文完整
 *   - initial_prompt：维护最近转写文本作为 prompt，提供上下文连贯性
 *   - 文本去重：对重叠区产生的重复文本进行简单后缀去重
 *   - JS 能量 VAD：检测语音停顿时提前触发转写，丢弃纯噪音段
 *   - LLM 校对：防抖触发 + 并发控制（同一时间只允许一个 LLM 请求在途）
 *   - 降级：LLM 未配置或调用失败时，直接将原始文本作为定稿
 */

import path from 'path';
import os from 'os';
import { logger } from 'ee-core/log';
import { getVoiceModelDir } from './voice-model-service';
import { chatStream } from '../../components/rag/llm/llmClient';
import type { ChatMessage, StreamCallbacks } from '../../components/rag/llm/llmClient';
import { llmdbService } from '../database/llmdb';
import type { LlmModelRecord } from '../database/llmdb';

// ===== 原生 addon 加载 =====

interface WhisperResult {
  transcription: string[][] | string[];
}

type TranscribeFn = (options: Record<string, unknown>) => Promise<WhisperResult>;

let whisperTranscribe: TranscribeFn | null = null;

const PLATFORM_DIR_MAP: Record<string, string> = {
  darwin: 'mac',
  win32: 'win32',
  linux: 'linux',
};

function loadAddon(): TranscribeFn | null {
  if (whisperTranscribe !== null) return whisperTranscribe;

  try {
    const platform = os.platform();
    const arch = os.arch();
    const dirName = PLATFORM_DIR_MAP[platform];
    if (!dirName) {
      throw new Error(`不支持的平台: ${platform}`);
    }

    const addonDir = path.join(__dirname, '..', '..', 'node_modules', '@kutalia', 'whisper-node-addon', 'dist');
    const platformDir = path.join(addonDir, `${dirName}-${arch}`);
    const addonPath = path.join(platformDir, 'whisper.node');
    logger.info(`[WhisperTranscribe] 尝试加载 addon: ${addonPath}`);

    if (platform === 'darwin') {
      process.env.DYLD_LIBRARY_PATH =
        platformDir + path.delimiter + (process.env.DYLD_LIBRARY_PATH ?? '');
      process.env.DYLD_FALLBACK_LIBRARY_PATH =
        platformDir + path.delimiter + (process.env.DYLD_FALLBACK_LIBRARY_PATH ?? '');
    }
    if (platform === 'linux') {
      process.env.LD_LIBRARY_PATH =
        platformDir + path.delimiter + (process.env.LD_LIBRARY_PATH ?? '');
    }
    if (platform === 'win32') {
      process.env.PATH =
        platformDir + path.delimiter + (process.env.PATH ?? '');
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nativeMod = require(addonPath);
    if (!nativeMod?.whisper || typeof nativeMod.whisper !== 'function') {
      throw new Error('addon 模块中没有找到 whisper 函数');
    }

    whisperTranscribe = (options: Record<string, unknown>): Promise<{ transcription: string[][] | string[] }> => {
      return new Promise((resolve, reject) => {
        nativeMod.whisper(options, (err: Error | null, result: { transcription: string[][] | string[] }) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
    };

    logger.info('[WhisperTranscribe] 原生 addon 加载成功');
  } catch (err) {
    logger.error('[WhisperTranscribe] 原生 addon 加载失败:', err);
    whisperTranscribe = null;
  }

  return whisperTranscribe;
}

// ===== 流式转写会话参数 =====

const SAMPLE_RATE = 16000;

// 缓冲策略参数
const BUFFER_SECONDS = 3;                    // 目标块大小：3 秒（降低延迟）
const TARGET_SAMPLES = SAMPLE_RATE * BUFFER_SECONDS;
const MIN_SAMPLES_TO_PROCESS = Math.floor(SAMPLE_RATE * 0.5); // 最少 0.5 秒才处理

// 重叠参数
const OVERLAP_SECONDS = 1.5;                 // 重叠区长度：1.5 秒
const OVERLAP_SAMPLES = SAMPLE_RATE * OVERLAP_SECONDS;

// JS 能量 VAD 参数
const VAD_ENERGY_THRESHOLD = 0.03;          // RMS 能量阈值，低于此值视为静音/噪音
const VAD_SILENCE_DURATION_MS = 600;         // 连续静音超过此时长视为句子停顿
const VAD_MIN_SPEECH_SAMPLES = Math.floor(SAMPLE_RATE * 0.5); // 至少 0.5 秒语音才触发

// LLM 校对参数
const LLM_DEBOUNCE_MS = 500;                 // 防抖延迟：最后一段 raw 文本到达后 500ms 触发
const LLM_MIN_CHUNKS = 1;                   // 至少累积 1 段 raw 就触发 LLM 校对
const LLM_CONTEXT_WORDS = 80;               // 提取前文上下文的字符数
const LLM_TIMEOUT_MS = 10_000;              // LLM 请求超时
const LLM_TEMPERATURE = 0.2;               // LLM 温度：偏保守，减少创造性改写
const LLM_MAX_TOKENS = 512;                // 校对场景输出短，限制 token 数

/** 推送给前端的文本类型 */
type ResultType = 'raw' | 'corrected';

/** 推送给前端的 payload */
interface ResultPayload {
  /** 文本内容 */
  text: string;
  /** 类型：raw=Whisper 原始文本（灰色），corrected=LLM 校对后文本（黑色） */
  type: ResultType;
}

/** 当前会话状态 */
interface SessionState {
  /** 模型路径 */
  modelPath: string;
  /** 语言代码 */
  language: string;
  /** 音频缓冲（Buffer 数组，每个是 Float32 PCM） */
  audioChunks: Buffer[];
  /** 已缓冲的采样数 */
  bufferedSamples: number;
  /** 上一块尾部的音频 Buffer（用于重叠） */
  overlapChunk: Buffer | null;
  /** 是否正在转写（Whisper） */
  isProcessing: boolean;
  /** 是否正在运行 */
  isActive: boolean;
  /** 转写结果回调（带类型） */
  onResult: (payload: ResultPayload) => void;
  /** 最近一次实际输出的文本（用于 initial_prompt） */
  recentText: string;
  /** VAD 状态 */
  isInSpeech: boolean;
  silenceSamples: number;
  hasEnoughSpeech: boolean;
  hasAnySpeechInBuffer: boolean;

  // ===== LLM 校对状态 =====
  /** 待校对的原始文本缓冲区 */
  pendingRaw: string;
  /** 累积的原始文本段数 */
  chunkCount: number;
  /** LLM 是否正在校对中（并发控制） */
  isLLMProcessing: boolean;
  /** LLM 校对完毕后是否需要再次触发（因为期间又来了新文本） */
  llmRetrigger: boolean;
  /** 防抖定时器 ID */
  llmDebounceTimer: ReturnType<typeof setTimeout> | null;
  /** 已校对定稿的文本（用于提取上下文） */
  finalText: string;
  /** 缓存的 LLM 模型记录（避免每次查数据库） */
  llmModel: LlmModelRecord | null;
}

let session: SessionState | null = null;

/**
 * 检查 whisper addon 是否可用
 */
export function isWhisperAvailable(): boolean {
  return loadAddon() !== null;
}

/**
 * 获取模型文件的完整路径
 */
function resolveModelPath(modelFilename: string): string {
  const dir = getVoiceModelDir();
  return path.join(dir, modelFilename);
}

/**
 * 构建完整的转写参数
 */
function buildWhisperOptions(
  modelPath: string,
  pcmf32: Float32Array,
  language: string,
  prompt?: string,
): Record<string, unknown> {
  const options: Record<string, unknown> = {
    model: modelPath,
    language,
    use_gpu: true,
    flash_attn: false,
    no_prints: true,
    comma_in_time: false,
    translate: false,
    no_timestamps: true,
    detect_language: false,
    audio_ctx: 0,
    max_len: 0,
    n_threads: 0,
    pcmf32,
    vad: false,
  };

  if (prompt && prompt.length > 0) {
    options.prompt = prompt;
  }

  return options;
}

/**
 * 清理转写文本中的时间戳和标记
 */
function cleanTranscriptionText(raw: string): string {
  let text = raw;
  text = text.replace(/\d{2}:-?\d{2}:-?\d{2}\.?-?\d{0,5}:\d{2}:\d{2}\.?\d{0,3}/g, '');
  text = text.replace(/\[[A-Z_]+\]/g, '');
  text = text.replace(/\([a-z]+\)/gi, '');
  text = text.replace(/^[,\s]+|[,\s]+$/g, '').trim();
  return text;
}

/**
 * 计算一段 PCM Float32 数据的 RMS 能量
 */
function computeRMS(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

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
 * 更新上下文文本（保留最近 1-2 句，截断到约 200 字符）
 */
function updateRecentText(current: string, newText: string): string {
  const combined = current + ' ' + newText;
  if (combined.length > 200) {
    return combined.substring(combined.length - 200);
  }
  return combined;
}

/**
 * 从原生 addon 返回的结果中提取文本
 */
function extractTextFromSegments(transcription: string[][] | string[]): string {
  if (!Array.isArray(transcription)) return '';

  const texts: string[] = [];

  for (const item of transcription) {
    if (Array.isArray(item) && item.length >= 3) {
      const text = cleanTranscriptionText(item[2]);
      if (text) texts.push(text);
    } else if (Array.isArray(item) && item.length >= 1) {
      const text = cleanTranscriptionText(item[item.length - 1]);
      if (text) texts.push(text);
    } else if (typeof item === 'string') {
      const text = cleanTranscriptionText(item);
      if (text) texts.push(text);
    }
  }

  return texts.join('').trim();
}

/**
 * 文本级去重：去除重叠区产生的重复文本
 */
function deduplicateText(currentText: string, previousText: string): string {
  if (!previousText || !currentText) return currentText;

  const promptPrefix = '以下是普通话的句子。';
  const prev = previousText.startsWith(promptPrefix)
    ? previousText.substring(promptPrefix.length).trim()
    : previousText;

  if (!prev) return currentText;

  const maxCheck = Math.min(prev.length, currentText.length, 100);

  for (let len = maxCheck; len >= 2; len--) {
    const tail = prev.substring(prev.length - len);
    if (currentText.startsWith(tail)) {
      const deduped = currentText.substring(tail.length).trim();
      if (deduped) {
        logger.info(`[WhisperTranscribe] 文本去重: 去掉重复前缀 "${tail.substring(0, 40)}" (len=${len})`);
      }
      return deduped;
    }
  }

  return currentText;
}

/**
 * 从 Float32Array 中提取尾部 N 个样本为新的 Buffer
 */
function extractTailBuffer(pcm: Float32Array, tailSamples: number): Buffer | null {
  if (pcm.length < tailSamples) return null;
  const tail = pcm.subarray(pcm.length - tailSamples);
  const buf = Buffer.allocUnsafe(tailSamples * 4);
  new Float32Array(buf.buffer, buf.byteOffset, tailSamples).set(tail);
  return buf;
}

// ===== LLM 校对逻辑 =====

/**
 * 构建 LLM 校对 prompt（精简版，降低 token 消耗加速响应）
 *
 * 使用 system + user 双消息结构，system 描述角色，user 传入上下文和待校对文本。
 * prompt 尽量简短，减少首 token 延迟。
 */
function buildCorrectionPrompt(context: string, rawText: string): ChatMessage[] {
  const system: ChatMessage = {
    role: 'system',
    content: '校对中文听写文本。修正同音字错别字，补标点，保持语义。仅输出校对后的文本，不加解释。',
  };
  const user: ChatMessage = {
    role: 'user',
    content: context ? `前文:${context}\n校对:${rawText}` : `校对:${rawText}`,
  };
  return [system, user];
}

/**
 * 触发 LLM 校对（带并发控制）
 *
 * 改用流式接口（chatStream）以加速首 token 响应，整体延迟更低。
 *
 * 并发控制策略：
 *   - isLLMProcessing = true 期间，新来的 raw 文本追加到 pendingRaw
 *   - LLM 完成后只要 pendingRaw 有内容就立即触发下一轮（不再要求段数）
 *   - force 模式下如果正在处理，标记 llmRetrigger，完成后会强制再触发
 *
 * 降级策略：
 *   - LLM 未配置（llmModel == null）→ 直接将 pendingRaw 作为 corrected 推送
 *   - LLM 调用失败 → 直接将 pendingRaw 作为 corrected 推送
 *
 * @param force 是否强制触发（忽略段数和防抖，用于 stopSession）
 */
async function triggerLLMCorrection(force = false): Promise<void> {
  if (!session) return;

  // 并发控制：如果 LLM 正在处理，标记 retrigger
  if (session.isLLMProcessing) {
    if (force) {
      session.llmRetrigger = true;
    }
    return;
  }

  // 检查是否有待校对内容
  if (!session.pendingRaw.trim()) return;

  // 非强制模式下检查段数
  if (!force && session.chunkCount < LLM_MIN_CHUNKS) return;

  // 清除防抖定时器（已决定触发）
  if (session.llmDebounceTimer) {
    clearTimeout(session.llmDebounceTimer);
    session.llmDebounceTimer = null;
  }

  session.isLLMProcessing = true;
  const rawToCorrect = session.pendingRaw;
  session.pendingRaw = '';
  session.chunkCount = 0;
  session.llmRetrigger = false;

  try {
    // 检查 LLM 模型是否可用
    if (!session.llmModel) {
      // 降级：直接用原始文本
      logger.info('[WhisperTranscribe] LLM 未配置，直接使用原始文本');
      session.finalText += rawToCorrect;
      session.onResult({ text: rawToCorrect, type: 'corrected' });
    } else {
      // 提取前文上下文
      const context = session.finalText.slice(-LLM_CONTEXT_WORDS);
      const messages = buildCorrectionPrompt(context, rawToCorrect);

      const startTime = Date.now();

      // 使用流式接口收集结果（比同步 chat 更快拿到首 token）
      let corrected = '';
      await new Promise<void>((resolve, reject) => {
        const callbacks: StreamCallbacks = {
          onToken: (token: string) => { corrected += token; },
          onComplete: () => resolve(),
          onError: (err: Error) => reject(err),
        };
        chatStream(
          session!.llmModel!,
          messages,
          callbacks,
          { timeoutMs: LLM_TIMEOUT_MS, temperature: LLM_TEMPERATURE, maxTokens: LLM_MAX_TOKENS },
        ).catch(reject);
      });

      const elapsed = Date.now() - startTime;
      corrected = corrected.trim();

      if (corrected) {
        logger.info(`[WhisperTranscribe] LLM 校对完成: ${elapsed}ms, 文本="${corrected.substring(0, 80)}..."`);
        session.finalText += corrected;
        session.onResult({ text: corrected, type: 'corrected' });
      } else {
        // LLM 返回空，降级
        logger.warn(`[WhisperTranscribe] LLM 返回空内容，降级使用原始文本`);
        session.finalText += rawToCorrect;
        session.onResult({ text: rawToCorrect, type: 'corrected' });
      }
    }
  } catch (err) {
    // 降级：直接用原始文本
    logger.error('[WhisperTranscribe] LLM 校对失败，降级使用原始文本:', err);
    session.finalText += rawToCorrect;
    session.onResult({ text: rawToCorrect, type: 'corrected' });
  } finally {
    if (!session) return;
    session.isLLMProcessing = false;

    // LLM 完成后只要 pendingRaw 有内容就立即触发下一轮
    // （修复：不再要求 chunkCount >= LLM_MIN_CHUNKS，因为 LLM 期间来的新文本可能只有 1 段）
    if (session.llmRetrigger || session.pendingRaw.trim()) {
      session.llmRetrigger = false;
      // 立即触发下一轮（force=true 确保不再检查段数）
      triggerLLMCorrection(true);
    }
  }
}

/**
 * 将一段 Whisper 转写文本推入 pendingRaw 并触发防抖
 *
 * 1. 推送 raw 给前端（灰色显示）
 * 2. 追加到 pendingRaw
 * 3. 累积段数 >= LLM_MIN_CHUNKS 后，启动防抖定时器
 */
function pushRawText(text: string): void {
  if (!session) return;

  // 推送 raw 给前端
  session.onResult({ text, type: 'raw' });

  // 追加到 pendingRaw
  session.pendingRaw = session.pendingRaw
    ? session.pendingRaw + text
    : text;
  session.chunkCount++;

  // 达到最小段数后启动防抖
  if (session.chunkCount >= LLM_MIN_CHUNKS) {
    // 清除之前的定时器，重新计时
    if (session.llmDebounceTimer) {
      clearTimeout(session.llmDebounceTimer);
    }
    session.llmDebounceTimer = setTimeout(() => {
      if (session) {
        session.llmDebounceTimer = null;
        triggerLLMCorrection();
      }
    }, LLM_DEBOUNCE_MS);
  }
}

// ===== 会话生命周期 =====

/**
 * 启动转写会话 — 预加载模型 + 初始化 LLM 校对状态
 */
export async function startSession(
  modelFilename: string,
  language: string,
  onResult: (payload: ResultPayload) => void,
): Promise<{ ok: boolean; message?: string }> {
  const transcribeFn = loadAddon();
  if (!transcribeFn) {
    return { ok: false, message: 'Whisper 原生组件不可用' };
  }

  if (session) {
    await stopSession();
  }

  const modelPath = resolveModelPath(modelFilename);
  logger.info(`[WhisperTranscribe] 启动会话: model=${modelFilename}, lang=${language}`);

  // 查询已启用的 LLM 模型（用于校对）
  let llmModel: LlmModelRecord | null = null;
  try {
    llmModel = llmdbService.getEnabledModel();
    if (llmModel) {
      logger.info(`[WhisperTranscribe] LLM 校对已启用: ${llmModel.name} (${llmModel.model_name})`);
    } else {
      logger.info('[WhisperTranscribe] 未配置 LLM 模型，校对功能将降级为直接输出原始文本');
    }
  } catch (err) {
    logger.warn('[WhisperTranscribe] 查询 LLM 模型失败，校对功能将降级:', err);
  }

  session = {
    modelPath,
    language,
    audioChunks: [],
    bufferedSamples: 0,
    overlapChunk: null,
    isProcessing: false,
    isActive: true,
    onResult,
    recentText: language === 'zh' ? '以下是普通话的句子。' : '',
    isInSpeech: false,
    silenceSamples: 0,
    hasEnoughSpeech: false,
    hasAnySpeechInBuffer: false,
    // LLM 校对状态
    pendingRaw: '',
    chunkCount: 0,
    isLLMProcessing: false,
    llmRetrigger: false,
    llmDebounceTimer: null,
    finalText: '',
    llmModel,
  };

  // 预加载 Whisper 模型
  try {
    const startTime = Date.now();
    logger.info('[WhisperTranscribe] 预加载模型中...');

    const silentPcm = new Float32Array(SAMPLE_RATE);
    const options = buildWhisperOptions(modelPath, silentPcm, language, session.recentText || undefined);
    await transcribeFn(options);

    const elapsed = Date.now() - startTime;
    logger.info(`[WhisperTranscribe] 模型预加载完成: ${elapsed}ms`);
    return { ok: true };
  } catch (err) {
    logger.info(`[WhisperTranscribe] 模型预加载（静音测试完成/跳过）: err=${err instanceof Error ? err.message : String(err)}`);
    return { ok: true };
  }
}

/**
 * 喂入音频数据（前端通过 IPC 传来）
 */
export function feedAudioData(chunk: Buffer): void {
  if (!session || !session.isActive) return;

  const chunkSamples = chunk.length / 4;
  const vadSamples = new Float32Array(chunk.buffer, chunk.byteOffset, chunkSamples);
  const rms = computeRMS(vadSamples);

  if (rms > VAD_ENERGY_THRESHOLD) {
    session.audioChunks.push(chunk);
    session.bufferedSamples += chunkSamples;
    session.isInSpeech = true;
    session.silenceSamples = 0;
    session.hasAnySpeechInBuffer = true;
    if (session.bufferedSamples >= VAD_MIN_SPEECH_SAMPLES) {
      session.hasEnoughSpeech = true;
    }
  } else {
    if (session.isInSpeech) {
      session.audioChunks.push(chunk);
      session.bufferedSamples += chunkSamples;
      session.silenceSamples += chunkSamples;
      const silenceMs = (session.silenceSamples / SAMPLE_RATE) * 1000;

      if (silenceMs >= VAD_SILENCE_DURATION_MS &&
          session.hasEnoughSpeech &&
          !session.isProcessing &&
          session.bufferedSamples >= MIN_SAMPLES_TO_PROCESS) {
        logger.info(`[WhisperTranscribe] VAD 检测到语音停顿 (静音 ${silenceMs.toFixed(0)}ms, 缓冲 ${session.bufferedSamples} samples)`);
        processBuffer();
      }
    }
  }

  if (session.bufferedSamples >= TARGET_SAMPLES && !session.isProcessing && session.hasAnySpeechInBuffer) {
    logger.info(`[WhisperTranscribe] 达到固定阈值 ${TARGET_SAMPLES} samples，触发转写`);
    processBuffer();
  }
}

/**
 * 处理缓冲的音频数据
 *
 * Whisper 转写 → 去重 → 推入 pendingRaw → 触发防抖 LLM 校对
 */
async function processBuffer(): Promise<void> {
  if (!session || session.isProcessing) return;

  session.isProcessing = true;
  const transcribeFn = loadAddon();
  if (!transcribeFn) {
    session.isProcessing = false;
    return;
  }

  // 拼接：[上一块尾部 overlap] + [当前缓冲]
  const allChunks: Buffer[] = [];
  if (session.overlapChunk) {
    allChunks.push(session.overlapChunk);
  }
  allChunks.push(...session.audioChunks);

  const pcmf32 = chunksToFloat32(allChunks);

  // 保存当前缓冲的尾部 1.5s 作为下一块的重叠区
  const currentBufFloat32 = chunksToFloat32(session.audioChunks);
  session.overlapChunk = extractTailBuffer(currentBufFloat32, OVERLAP_SAMPLES);

  // 清空当前缓冲
  session.audioChunks = [];
  session.bufferedSamples = 0;

  try {
    const startTime = Date.now();
    const options = buildWhisperOptions(
      session.modelPath,
      pcmf32,
      session.language,
      session.recentText || undefined,
    );
    const result = await transcribeFn(options);

    const elapsed = Date.now() - startTime;

    // 从 segment 列表中提取纯文本
    const rawText = extractTextFromSegments(result.transcription);

    // 文本级去重：去掉重叠区产生的重复前缀
    const text = deduplicateText(rawText, session.recentText);

    if (text) {
      logger.info(`[WhisperTranscribe] 转写完成: ${elapsed}ms, 文本="${text.substring(0, 80)}..."`);

      // 更新 Whisper 的上下文 prompt
      session.recentText = updateRecentText(session.recentText, text);

      // 推入 pendingRaw 并触发防抖 LLM 校对
      pushRawText(text);
    } else if (rawText) {
      logger.info(`[WhisperTranscribe] 转写完成: ${elapsed}ms, 去重后无新文本 (raw="${rawText.substring(0, 60)}...")`);
    } else {
      logger.warn(`[WhisperTranscribe] 转写完成: ${elapsed}ms, 无文本 (transcription=${JSON.stringify(result.transcription).substring(0, 100)})`);
    }
  } catch (err) {
    logger.error('[WhisperTranscribe] 转写失败:', err);
  } finally {
    session.hasEnoughSpeech = false;
    session.silenceSamples = 0;
    session.isInSpeech = false;
    session.hasAnySpeechInBuffer = false;

    session.isProcessing = false;
  }
}

/**
 * 停止转写会话 — 处理剩余缓冲 + 强制 LLM 校对 + 清理
 */
export async function stopSession(): Promise<void> {
  if (!session) return;

  session.isActive = false;

  // 清除防抖定时器
  if (session.llmDebounceTimer) {
    clearTimeout(session.llmDebounceTimer);
    session.llmDebounceTimer = null;
  }

  // 处理剩余的音频数据
  const hasData = session.audioChunks.length > 0;
  if (hasData && !session.isProcessing) {
    await processBuffer();
  }

  // 等待正在进行的 Whisper 转写完成
  while (session.isProcessing) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // 强制 LLM 校对剩余的 pendingRaw
  if (session.pendingRaw.trim()) {
    logger.info('[WhisperTranscribe] 停止会话，强制校对剩余文本');
    await triggerLLMCorrection(true);

    // 等待 LLM 完成
    while (session.isLLMProcessing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  session = null;
  logger.info('[WhisperTranscribe] 会话已停止');
}

/**
 * 检查会话是否活跃
 */
export function isSessionActive(): boolean {
  return session?.isActive ?? false;
}
