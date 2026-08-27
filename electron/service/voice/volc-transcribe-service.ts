/**
 * 火山引擎双向流式语音识别服务
 *
 * 基于火山引擎豆包语音 SAUC（Streaming AUC）双向流式 WebSocket 协议。
 * 文档：https://docs.volcengine.com/docs/6561/2630027
 *
 * 参考了 Proma (apps/electron/src/main/lib/doubao-asr-service.ts) 的实现。
 *
 * 工作流程：
 *   1. startSession() — 建立 WebSocket 连接，发送配置帧（含音频格式、语言等参数）
 *   2. feedAudioData() — 持续接收前端发来的 16kHz PCM Float32 数据，转为 16-bit PCM 二进制帧发送
 *   3. 服务端返回 JSON 识别结果，含中间结果（is_final=false）和最终结果（is_final=true）
 *   4. 中间结果作为「原始文本」(raw) 推送给前端（灰色显示）
 *   5. 最终结果作为「定稿」(corrected) 推送给前端（黑色显示）
 *   6. stopSession() — 发送结束帧，等待最终结果，关闭连接
 *
 * 与本地 Whisper 服务的接口完全对齐：
 *   - startSession / feedAudioData / stopSession / isSessionActive
 *   - onResult 回调格式：{ text: string, type: 'raw' | 'corrected' }
 */

import { logger } from 'ee-core/log';
import { decryptSecret } from '../bridge/bridge-config';
import { randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import type { VoiceModelRecord } from '../database/voicedb';
// 使用 ws 库而非 Node.js 原生 WebSocket
// ws 库明确支持自定义 HTTP headers，火山引擎 SAUC 协议要求通过 HTTP header 传递认证信息
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WS = require('ws');
import type { WebSocket as WebSocketType } from 'ws';

// ===== 协议常量 =====

/** 采样率 */
const SAMPLE_RATE = 16000;

/** 协议版本 */
const PROTOCOL_VERSION = 0b0001;
/** header 大小（以 4 字节为单位） */
const HEADER_SIZE = 0b0001;

/** 消息类型 */
const MESSAGE_TYPE_FULL_CLIENT_REQUEST = 0b0001;
const MESSAGE_TYPE_AUDIO_ONLY_REQUEST = 0b0010;
const MESSAGE_TYPE_FULL_SERVER_RESPONSE = 0b1001;
const MESSAGE_TYPE_SERVER_ERROR = 0b1111;

/** 标志位 */
const FLAG_NO_SEQUENCE = 0b0000;
const FLAG_LAST_NO_SEQUENCE = 0b0010;
const FLAG_SERVER_SEQUENCE = 0b0001;
const FLAG_SERVER_LAST_SEQUENCE = 0b0011;

/** 序列化方式 */
const SERIALIZATION_NONE = 0b0000;
const SERIALIZATION_JSON = 0b0001;

/** 压缩方式 */
const COMPRESSION_NONE = 0b0000;
const COMPRESSION_GZIP = 0b0001;

/** 火山引擎 WSS 端点 */
const ASYNC_ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async';
const DUPLEX_ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel';

/** 听写结束窗口大小（毫秒），允许用户自然停顿 */
const END_WINDOW_SIZE_MS = 5000;
/** 强制转语音时间（毫秒） */
const FORCE_TO_SPEECH_TIME_MS = 1000;

// ===== 类型定义 =====

/** 推送给前端的 payload 类型 */
interface ResultPayload {
  /** 文本内容 */
  text: string;
  /** 类型：replace=直接替换全部文本 */
  type: 'replace';
}

/** 火山引擎会话配置参数 */
export interface VolcSessionConfig {
  /** 火山引擎模型记录（含 api_key、resource_id） */
  model: VoiceModelRecord;
  /** 语言代码（zh / en / auto） */
  language: string;
  /** 结果回调 */
  onResult: (payload: ResultPayload) => void;
}

/** 服务端返回的单条 utterance */
interface ServerUtterance {
  text?: string;
  definite?: boolean;
}

/** 服务端返回的 result 对象 */
interface ServerResult {
  text?: string;
  confidence?: number;
  utterances?: ServerUtterance[];
}

/** 服务端返回的完整 payload */
interface ServerPayload {
  result?: ServerResult | ServerResult[];
  text?: string;
  message?: string;
  error?: string;
}

/** 解析后的服务端消息 */
interface ParsedServerMessage {
  text: string;
  isFinal: boolean;
}

/** 会话状态 */
interface SessionState {
  /** WebSocket 连接（ws 库实例） */
  ws: WebSocketType;
  /** 是否活跃 */
  isActive: boolean;
  /** 是否已发送结束帧 */
  isFinishing: boolean;
  /** 结果回调 */
  onResult: (payload: ResultPayload) => void;
  /** 是否已收到服务端最终响应 */
  receivedFinal: boolean;
}

let session: SessionState | null = null;

// ===== 协议帧构建 =====

/**
 * 构建 4 字节协议 header
 *
 * 字节布局：
 *   byte 0: [protocol_version(4bit)] [header_size(4bit)]
 *   byte 1: [message_type(4bit)] [flags(4bit)]
 *   byte 2: [serialization(4bit)] [compression(4bit)]
 *   byte 3: 0x00 (保留)
 */
function buildHeader(
  messageType: number,
  flags: number,
  serialization: number,
  compression: number,
): Buffer {
  return Buffer.from([
    (PROTOCOL_VERSION << 4) | HEADER_SIZE,
    (messageType << 4) | flags,
    (serialization << 4) | compression,
    0x00,
  ]);
}

/**
 * 构建完整帧：[4B header] [4B payload_size] [payload]
 */
function buildFrame(
  messageType: number,
  flags: number,
  serialization: number,
  compression: number,
  payload: Buffer,
): Buffer {
  const header = buildHeader(messageType, flags, serialization, compression);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(payload.length, 0);
  return Buffer.concat([header, size, payload]);
}

/**
 * 构建配置帧（JSON payload，gzip 压缩）
 *
 * 包含音频格式、语言、模型参数等。
 */
function buildClientRequest(language: string): Buffer {
  const audio: Record<string, unknown> = {
    format: 'pcm',
    codec: 'raw',
    rate: SAMPLE_RATE,
    bits: 16,
    channel: 1,
  };

  // 设置语言
  const langCode = mapLanguageCode(language);
  if (langCode) {
    audio.language = langCode;
  }

  const request = {
    user: {
      uid: 'diting-user',
    },
    audio,
    request: {
      model_name: 'bigmodel',
      enable_nonstream: true,
      show_utterances: true,
      result_type: 'full',
      enable_itn: true,
      enable_punc: true,
      enable_ddc: true,
      // 听写场景允许用户自然停顿，避免 800ms 静音就过早切句
      end_window_size: END_WINDOW_SIZE_MS,
      force_to_speech_time: FORCE_TO_SPEECH_TIME_MS,
    },
  };

  const payload = gzipSync(Buffer.from(JSON.stringify(request), 'utf-8'));
  return buildFrame(
    MESSAGE_TYPE_FULL_CLIENT_REQUEST,
    FLAG_NO_SEQUENCE,
    SERIALIZATION_JSON,
    COMPRESSION_GZIP,
    payload,
  );
}

/**
 * 构建音频数据帧（gzip 压缩）
 */
function buildAudioFrame(audio: Buffer, isLast: boolean): Buffer {
  const payload = gzipSync(audio);
  return buildFrame(
    MESSAGE_TYPE_AUDIO_ONLY_REQUEST,
    isLast ? FLAG_LAST_NO_SEQUENCE : FLAG_NO_SEQUENCE,
    SERIALIZATION_NONE,
    COMPRESSION_GZIP,
    payload,
  );
}

/**
 * 将应用内部语言代码映射为火山引擎语言代码
 */
function mapLanguageCode(lang: string): string {
  if (lang.startsWith('zh')) return 'zh-CN';
  if (lang.startsWith('en')) return 'en-US';
  return 'zh-CN';
}

// ===== 服务端响应解析 =====

/**
 * 从 ServerResult 中提取文本
 */
function getResultText(result: ServerResult): string {
  return result.text ?? result.utterances?.map((item) => item.text ?? '').join('') ?? '';
}

/**
 * 从多个候选 result 中选出置信度最高的
 */
function getAuthoritativeResult(results: ServerResult[]): ServerResult | null {
  const candidates = results
    .map((result) => ({ result, text: getResultText(result) }))
    .filter((item) => item.text.trim().length > 0);

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0]!.result;

  // result 数组表示识别候选，不是需要拼接的分句；拼接会制造重复文本
  return [...candidates]
    .sort((left, right) => (right.result.confidence ?? 0) - (left.result.confidence ?? 0))[0]!
    .result;
}

/**
 * 判断 result 是否为最终结果
 */
function isResultFinal(result: ServerResult): boolean {
  return result.utterances?.some((item) => item.definite === true) ?? false;
}

/**
 * 解析服务端 payload JSON
 */
function parseServerPayload(value: unknown, fallbackFinal: boolean): ParsedServerMessage | null {
  if (typeof value !== 'object' || value === null) return null;
  const payload = value as ServerPayload;
  const results = Array.isArray(payload.result)
    ? payload.result
    : payload.result
      ? [payload.result]
      : [];

  if (results.length === 0) {
    const message = payload.text ?? payload.message ?? payload.error;
    return message ? { text: message, isFinal: fallbackFinal } : null;
  }

  if (payload.text) {
    return {
      text: payload.text,
      isFinal: fallbackFinal || results.some(isResultFinal),
    };
  }

  const authoritativeResult = getAuthoritativeResult(results);
  const text = authoritativeResult ? getResultText(authoritativeResult) : '';
  const utteranceFinal = authoritativeResult ? isResultFinal(authoritativeResult) : false;
  if (!text) return null;
  return {
    text,
    isFinal: fallbackFinal || utteranceFinal,
  };
}

/**
 * 解析服务端返回的二进制消息
 *
 * 响应帧格式：[4B header] [可选 4B sequence] [4B payload_size] [payload]
 *
 * header 字节布局：
 *   byte 0: [protocol_version(4bit)] [header_size(4bit)]
 *   byte 1: [message_type(4bit)] [flags(4bit)]
 *   byte 2: [serialization(4bit)] [compression(4bit)]
 *   byte 3: 0x00 (保留)
 */
function parseServerMessage(data: Buffer): ParsedServerMessage | null {
  if (data.length < 8) return null;

  const headerSize = (data[0]! & 0x0f) * 4;
  const messageType = data[1]! >> 4;
  const flags = data[1]! & 0x0f;
  const serialization = data[2]! >> 4;
  const compression = data[2]! & 0x0f;
  let offset = headerSize;

  // 如果有 sequence 字段，跳过 4 字节
  const hasSequence = flags === FLAG_SERVER_SEQUENCE || flags === FLAG_SERVER_LAST_SEQUENCE;
  if (hasSequence) {
    offset += 4;
  }

  // 错误消息
  if (messageType === MESSAGE_TYPE_SERVER_ERROR) {
    if (data.length < offset + 8) return null;
    const code = data.readUInt32BE(offset);
    offset += 4;
    const size = data.readUInt32BE(offset);
    offset += 4;
    const message = data.subarray(offset, offset + size).toString('utf-8');
    return { text: `火山引擎 ASR 错误 ${code}: ${message}`, isFinal: true };
  }

  // 正常响应
  if (messageType !== MESSAGE_TYPE_FULL_SERVER_RESPONSE || data.length < offset + 4) {
    return null;
  }

  const payloadSize = data.readUInt32BE(offset);
  offset += 4;
  const payload = data.subarray(offset, offset + payloadSize);
  const decoded = compression === COMPRESSION_GZIP ? gunzipSync(payload) : payload;

  if (serialization !== SERIALIZATION_JSON) return null;
  const parsed = JSON.parse(decoded.toString('utf-8')) as unknown;
  return parseServerPayload(parsed, flags === FLAG_SERVER_LAST_SEQUENCE);
}

// ===== 会话生命周期 =====

/**
 * 启动火山引擎流式语音识别会话
 *
 * 1. 解密 API Key
 * 2. 建立 WebSocket 连接（含 X-Api-Key / X-Api-Resource-Id / X-Api-Connect-Id headers）
 * 3. 连接成功后发送 JSON 配置帧（gzip 压缩）
 * 4. 返回成功后前端可以开始录音
 */
export async function startVolcSession(config: VolcSessionConfig): Promise<{ ok: boolean; message?: string }> {
  if (session) {
    await stopVolcSession();
  }

  const { model, language, onResult } = config;

  // 验证必要参数
  if (!model.volc_api_key) {
    return { ok: false, message: '缺少火山引擎 API Key' };
  }
  if (!model.volc_resource_id) {
    return { ok: false, message: '缺少火山引擎 Resource ID' };
  }

  // 解密 API Key
  let apiKey: string;
  try {
    apiKey = decryptSecret(model.volc_api_key);
  } catch (err) {
    logger.error('[VolcTranscribe] API Key 解密失败:', err);
    return { ok: false, message: 'API Key 解密失败，请重新配置' };
  }

  // 根据 resource_id 判断使用 async 还是 duplex 端点
  // duration 模型用 async 端点，concurrent 模型用 duplex 端点
  const wsUrl = model.volc_resource_id.includes('concurrent')
    ? DUPLEX_ENDPOINT
    : ASYNC_ENDPOINT;

  logger.info(`[VolcTranscribe] 启动会话: resource_id=${model.volc_resource_id}, lang=${language}, endpoint=${wsUrl}`);

  return new Promise((resolve) => {
    let resolved = false;

    // 使用 ws 库创建 WebSocket 连接
    // 火山引擎 SAUC v3 协议（新版）通过 HTTP header 传递认证信息：
    //   X-Api-Key:        API Key（替代旧版 X-Api-App-Key + X-Api-Access-Key）
    //   X-Api-Resource-Id: 资源 ID（如 volc.seedasr.sauc.duration）
    //   X-Api-Connect-Id: 连接 ID（UUID，用于链路追踪）
    const ws = new WS(wsUrl, {
      headers: {
        'X-Api-Key': apiKey,
        'X-Api-Resource-Id': model.volc_resource_id,
        'X-Api-Connect-Id': randomUUID(),
      },
    });

    const state: SessionState = {
      ws,
      isActive: false,
      isFinishing: false,
      onResult,
      receivedFinal: false,
    };

    // 赋值到模块级 session 变量
    session = state;

    // 连接超时定时器
    const connectTimer = setTimeout(() => {
      if (!resolved) {
        ws.terminate();
        resolved = true;
        resolve({ ok: false, message: '连接火山引擎超时，请检查网络' });
      }
    }, 10000);

    ws.on('open', () => {
      clearTimeout(connectTimer);
      logger.info('[VolcTranscribe] WebSocket 连接已建立');

      // 发送 JSON 配置帧（gzip 压缩）
      const frame = buildClientRequest(language);

      try {
        ws.send(frame);
        logger.info('[VolcTranscribe] 配置帧已发送');
      } catch (err) {
        logger.error('[VolcTranscribe] 发送配置帧失败:', err);
        if (!resolved) {
          resolved = true;
          resolve({ ok: false, message: '发送配置帧失败' });
        }
        return;
      }

      state.isActive = true;
      if (!resolved) {
        resolved = true;
        resolve({ ok: true });
      }
    });

    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
      // ws 库消息可能是 Buffer、ArrayBuffer 或 Buffer[]
      const buffer = Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.isBuffer(data)
          ? data
          : Buffer.from(data);

      try {
        const parsed = parseServerMessage(buffer);
        if (!parsed) return;

        const { text, isFinal } = parsed;
        if (!text) return;

        // 火山引擎返回的文本是全量叠加的（每次包含之前所有内容）
        // 直接用全量文本替换前端显示的内容
        state.onResult({ text, type: 'replace' });

        if (isFinal) {
          state.receivedFinal = true;
          logger.info(`[VolcTranscribe] 最终结果: "${text.substring(0, 80)}..."`);
        }
      } catch (err) {
        logger.error('[VolcTranscribe] 解析服务端消息失败:', err);
      }
    });

    // ws 库的 unexpected-response 事件：服务端返回非 101 状态码
    ws.on('unexpected-response', (req: unknown, res: { statusCode?: number; statusMessage?: string }) => {
      clearTimeout(connectTimer);
      const statusCode = res?.statusCode ?? 'unknown';
      const statusMessage = res?.statusMessage ?? '';
      logger.error(`[VolcTranscribe] 服务端拒绝连接: HTTP ${statusCode} ${statusMessage}`);
      const hint = statusCode === 401
        ? '认证失败，请检查 API Key'
        : statusCode === 400
        ? '请求参数错误，请检查 Resource ID'
        : `连接被拒绝: ${statusCode}`;
      if (!resolved) {
        resolved = true;
        resolve({ ok: false, message: hint });
      }
    });

    ws.on('error', (err: Error) => {
      clearTimeout(connectTimer);
      logger.error('[VolcTranscribe] WebSocket 错误:', err.message);
      if (!resolved) {
        resolved = true;
        resolve({ ok: false, message: 'WebSocket 连接失败，请检查网络和配置' });
      }
    });

    ws.on('close', (code: number, reason: Buffer) => {
      clearTimeout(connectTimer);
      const reasonStr = reason.toString();
      logger.info(`[VolcTranscribe] WebSocket 连接关闭: code=${code}, reason=${reasonStr}`);
      state.isActive = false;
      if (!resolved) {
        resolved = true;
        resolve({ ok: false, message: `连接关闭: ${reasonStr || code}` });
      }
    });
  });
}

/**
 * 喂入音频数据
 *
 * 接收前端传来的 Float32 PCM 数据块，转为 16-bit PCM 二进制帧后发送到火山引擎。
 */
export function feedVolcAudioData(chunk: Buffer): void {
  if (!session || !session.isActive) return;
  if (session.ws.readyState !== session.ws.OPEN) return;

  // 前端传来的是 Float32Array 的 Buffer，转为 16-bit PCM
  const float32 = new Float32Array(chunk.buffer, chunk.byteOffset, chunk.length / 4);
  const pcm16 = new Int16Array(float32.length);

  for (let i = 0; i < float32.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  // 转为 Buffer，构建 gzip 压缩的音频帧
  const audioBuffer = Buffer.from(pcm16.buffer);
  const frame = buildAudioFrame(audioBuffer, false);

  try {
    session.ws.send(frame);
  } catch (err) {
    logger.error('[VolcTranscribe] 发送音频帧失败:', err);
  }
}

/**
 * 停止火山引擎语音识别会话
 *
 * 1. 发送结束帧（空音频 + last 标记，gzip 压缩）
 * 2. 等待服务端返回最终结果（最多 5 秒）
 * 3. 关闭 WebSocket 连接
 */
export async function stopVolcSession(): Promise<void> {
  if (!session) return;

  session.isActive = false;
  session.isFinishing = true;

  // 发送结束帧：空音频 + last 标记
  if (session.ws.readyState === session.ws.OPEN) {
    try {
      const finishFrame = buildAudioFrame(Buffer.alloc(0), true);
      session.ws.send(finishFrame);
      logger.info('[VolcTranscribe] 已发送结束帧');
    } catch (err) {
      logger.error('[VolcTranscribe] 发送结束帧失败:', err);
    }
  }

  // 等待最终结果（最多 5 秒）
  const waitStart = Date.now();
  while (!session.receivedFinal && Date.now() - waitStart < 5000) {
    if (session.ws.readyState !== session.ws.OPEN) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // 关闭连接
  if (session.ws.readyState === session.ws.OPEN || session.ws.readyState === session.ws.CONNECTING) {
    try {
      session.ws.close(1000, 'session ended');
    } catch {
      // 忽略关闭错误
    }
  }

  // 等待连接完全关闭（最多 3 秒）
  const closeStart = Date.now();
  while (session.ws.readyState !== session.ws.CLOSED && Date.now() - closeStart < 3000) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  session = null;
  logger.info('[VolcTranscribe] 会话已停止');
}

/**
 * 检查火山引擎会话是否活跃
 */
export function isVolcSessionActive(): boolean {
  return session?.isActive ?? false;
}
