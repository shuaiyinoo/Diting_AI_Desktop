/**
 * 语音模型管理控制器
 *
 * 提供：
 *   1. 远程语音模型 CRUD（同 LLM 模式）
 *   2. 本地模型列表、下载、删除、选择（支持 Whisper 和 FunASR 两种引擎）
 *   3. 麦克风权限检查与请求
 *   4. 实时流式语音转写（startSession / feedAudioData / stopSession）
 *
 * 前端通过 ipcApiRoute.voice.* 调用。
 * 本地模型操作通过 engine 参数区分 Whisper 和 FunASR 引擎。
 */

import type { IpcMainInvokeEvent } from 'electron';
import { ipcMain } from 'electron';
import { logger } from 'ee-core/log';
import { voicedbService } from '../service/database/voicedb';
import type { VoiceProvider, VoiceModelRecord, UpsertVoiceModelParams } from '../service/database/voicedb';
import { VOLC_DEFAULT_BASE_URL } from '../service/database/voicedb';
import {
  downloadModel,
  cancelDownload,
  deleteModelFile,
  getVoiceModelDir,
  getUnifiedModelStatuses,
  type DownloadProgress,
  type EngineType,
} from '../service/voice/voice-model-service';
import {
  downloadFunasrModel,
  cancelFunasrDownload,
  deleteFunasrModel,
  deleteVadModelIfOrphan,
  type FunasrDownloadProgress,
} from '../service/voice/funasr-model-service';
import {
  checkMicrophonePermission,
  requestMicrophonePermission,
  type MicPermissionResult,
} from '../service/voice/mic-permission-service';
import {
  startSession as startWhisperSession,
  feedAudioData as feedWhisperAudioData,
  stopSession as stopWhisperSession,
  isWhisperAvailable,
  isSessionActive as isWhisperSessionActive,
} from '../service/voice/whisper-transcribe-service';
import {
  startVolcSession,
  feedVolcAudioData,
  stopVolcSession,
  isVolcSessionActive,
} from '../service/voice/volc-transcribe-service';
import {
  startSession as startFunasrSession,
  feedAudioData as feedFunasrAudioData,
  stopSession as stopFunasrSession,
  isFunasrAvailable,
  isSessionActive as isFunasrSessionActive,
} from '../service/voice/funasr-transcribe-service';

/** 当前活跃的转写模式 */
type TranscribeMode = 'whisper' | 'volc' | 'funasr';

/** 当前转写模式（由 startSession 时确定） */
let currentMode: TranscribeMode | null = null;

// 下载进度推送通道
const DOWNLOAD_PROGRESS_CHANNEL = 'controller/voice/onDownloadProgress';
// 实时转写结果推送通道
const TRANSCRIPTION_RESULT_CHANNEL = 'controller/voice/onTranscriptionResult';

/**
 * 对火山引擎 API Key 做掩码处理（不回传密文）
 * 前端只看到是否有值，不暴露加密内容
 */
function maskVolcSecrets(model: VoiceModelRecord): VoiceModelRecord {
  if (model.volc_api_key) {
    return { ...model, volc_api_key: '******' };
  }
  return model;
}

/** 远程语音模型操作参数 */
interface RemoteModelArgs {
  action: 'list' | 'get' | 'add' | 'update' | 'delete' | 'enable' | 'disable' | 'getEnabled';
  id?: number;
  params?: Partial<UpsertVoiceModelParams>;
}

/** 远程语音模型操作返回 */
interface RemoteModelResult {
  action: string;
  code: number;
  message?: string;
  data?: VoiceModelRecord | VoiceModelRecord[] | null;
}

/** 本地模型操作参数 */
interface LocalModelArgs {
  action: 'list' | 'download' | 'cancelDownload' | 'delete' | 'select' | 'getSelected' | 'getDir' | 'openDir' | 'getEngine' | 'selectEngine';
  /** Whisper 模型文件名或 FunASR 模型 ID */
  filename?: string;
  /** 引擎类型（whisper / funasr），不传默认 whisper */
  engine?: EngineType;
  useMirror?: boolean;
}

/** 本地模型操作返回 */
interface LocalModelResult {
  action: string;
  code: number;
  message?: string;
  data?: unknown;
}

/** FunASR 下载进度兼容 DownloadProgress 格式 */
interface DownloadProgressUnified {
  filename: string;
  downloaded: number;
  total: number;
  percent: number;
  speed: number;
  done: boolean;
  error?: string;
  engine?: EngineType;
  modelId?: string;
}

/** 麦克风权限操作参数 */
interface MicPermissionArgs {
  action: 'check' | 'request';
}

/** 麦克风权限操作返回 */
interface MicPermissionResultPayload {
  action: string;
  code: number;
  data?: MicPermissionResult;
}

/** 流式转写启动参数 */
interface StartSessionArgs {
  /** 模型文件名（不传则用已选模型） */
  modelFilename?: string;
  /** 语言代码 */
  language?: string;
  /** 引擎类型：whisper | funasr（不传则根据已选模型自动判断） */
  engine?: EngineType;
}

/** 流式转写启动返回 */
interface StartSessionResult {
  code: number;
  message?: string;
  data?: { ok: boolean; message?: string; mode?: 'whisper' | 'volc' | 'funasr' };
}

class VoiceController {
  private initialized = false;
  private registered = false;

  /**
   * 初始化数据库
   */
  private async ensureDb(): Promise<void> {
    if (!this.initialized) {
      await voicedbService.init();
      this.initialized = true;
    }
  }

  /**
   * 注册流式转写的 IPC 通道（用 ipcMain.on 接收流式数据）
   */
  registerIpc(): void {
    if (this.registered) return;
    this.registered = true;
    logger.info('[VoiceController] 注册语音 IPC 通道');

    // 接收前端发来的实时 PCM 音频块
  // 根据当前模式分发到对应引擎
  ipcMain.on('controller/voice/audio-data', (_event, chunk: Buffer) => {
    try {
      switch (currentMode) {
        case 'volc':
          feedVolcAudioData(chunk);
          break;
        case 'funasr':
          feedFunasrAudioData(chunk);
          break;
        default:
          feedWhisperAudioData(chunk);
          break;
      }
    } catch (err) {
      logger.error('[VoiceController] audio-data 处理失败:', err);
    }
  });

  // 接收前端停止录音信号
  // 根据当前模式调用对应的 stop 方法
  ipcMain.handle('controller/voice/stop-transcription', async () => {
    try {
      switch (currentMode) {
        case 'volc':
          await stopVolcSession();
          break;
        case 'funasr':
          await stopFunasrSession();
          break;
        default:
          await stopWhisperSession();
          break;
      }
      currentMode = null;
        return { code: 0, message: '已停止' };
      } catch (err) {
        logger.error('[VoiceController] stop-transcription 失败:', err);
        currentMode = null;
        return { code: -1, message: String(err) };
      }
    });
  }

  /**
   * 远程语音模型操作
   */
  async remoteOperation(args: RemoteModelArgs): Promise<RemoteModelResult> {
    await this.ensureDb();
    const { action, id, params } = args;
    logger.info(`[VoiceController] remoteOperation: action=${action}, id=${id ?? '-'}`);

    try {
      switch (action) {
        case 'list': {
          const list = voicedbService.getAllModels();
          // 对 Access Key 做掩码处理，不回传密文
          const masked = list.map((m) => maskVolcSecrets(m));
          return { action, code: 0, data: masked };
        }

        case 'getEnabled': {
          const model = voicedbService.getEnabledModel();
          return { action, code: 0, data: model };
        }

        case 'get': {
          if (!id) return { action, code: -1, message: '缺少 id 参数' };
          const model = voicedbService.getModelById(id);
          return { action, code: 0, data: model ? maskVolcSecrets(model) : null };
        }

        case 'add': {
          if (!params || !params.name || !params.model_name) {
            return { action, code: -1, message: '缺少必要参数（name, model_name）' };
          }
          // 火山引擎使用固定 WSS 地址
          const providerVal = (params.provider as VoiceProvider) || 'openai';
          const effectiveBaseUrl = providerVal === 'volc'
            ? VOLC_DEFAULT_BASE_URL
            : (params.base_url || '');
          const newId = voicedbService.addModel({
            name: params.name,
            provider: providerVal,
            base_url: effectiveBaseUrl,
            api_key: params.api_key || '',
            model_name: params.model_name,
            remark: params.remark,
      // 火山引擎专属字段
      volc_api_key: params.volc_api_key,
      volc_resource_id: params.volc_resource_id,
    });
          const model = voicedbService.getModelById(newId);
          return { action, code: 0, data: model ?? undefined, message: '添加成功' };
        }

        case 'update': {
          if (!id) return { action, code: -1, message: '缺少 id 参数' };
          if (!params) return { action, code: -1, message: '缺少 params 参数' };
          const ok = voicedbService.updateModel(id, params);
          const model = voicedbService.getModelById(id);
          return { action, code: ok ? 0 : -1, data: model ?? undefined, message: ok ? '更新成功' : '更新失败' };
        }

        case 'delete': {
          if (!id) return { action, code: -1, message: '缺少 id 参数' };
          const ok = voicedbService.deleteModel(id);
          return { action, code: ok ? 0 : -1, message: ok ? '删除成功' : '删除失败' };
        }

        case 'enable': {
          if (!id) return { action, code: -1, message: '缺少 id 参数' };
          const ok = voicedbService.enableModel(id);
          const model = voicedbService.getModelById(id);
          return { action, code: ok ? 0 : -1, data: model ?? undefined, message: ok ? '启用成功' : '启用失败' };
        }

        case 'disable': {
          if (!id) return { action, code: -1, message: '缺少 id 参数' };
          const ok = voicedbService.disableModel(id);
          return { action, code: ok ? 0 : -1, message: ok ? '禁用成功' : '禁用失败' };
        }

        default:
          return { action, code: -1, message: `未知操作: ${action}` };
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('[VoiceController] remoteOperation 异常:', error);
      return { action, code: -1, message: `操作失败: ${errMsg}` };
    }
  }

  /**
   * 本地 Whisper 模型操作
   */
  async localOperation(args: LocalModelArgs, event?: IpcMainInvokeEvent): Promise<LocalModelResult> {
    await this.ensureDb();
    const { action, filename, engine, useMirror } = args;
    logger.info(`[VoiceController] localOperation: action=${action}, filename=${filename ?? '-'}`);

    try {
      switch (action) {
        case 'list': {
          // 返回统一模型列表（Whisper + FunASR）
          const statuses = getUnifiedModelStatuses();
          return { action, code: 0, data: statuses };
        }

        case 'download': {
          if (!filename) return { action, code: -1, message: '缺少 filename 参数' };
          const engineType: EngineType = engine ?? 'whisper';

          // 异步下载，通过 IPC 推送进度
          const sender = event?.sender;

          if (engineType === 'funasr') {
            // ===== FunASR 模型下载 =====
            downloadFunasrModel(
              filename, // 这里 filename 是 modelId
              useMirror ?? false,
              (progress: FunasrDownloadProgress) => {
                if (sender && !sender.isDestroyed()) {
                  sender.send(DOWNLOAD_PROGRESS_CHANNEL, {
                    filename: progress.filename,
                    downloaded: progress.downloaded,
                    total: progress.total,
                    percent: progress.percent,
                    speed: progress.speed,
                    done: progress.done,
                    error: progress.error,
                    engine: 'funasr',
                    modelId: progress.modelId,
                  } satisfies DownloadProgressUnified);
                }
              },
            ).then((result) => {
              logger.info(`[VoiceController] FunASR 模型下载完成: ${filename} -> ${result.modelPath}`);
            }).catch((err) => {
              logger.error(`[VoiceController] FunASR 模型下载失败: ${filename}`, err);
              if (sender && !sender.isDestroyed()) {
                sender.send(DOWNLOAD_PROGRESS_CHANNEL, {
                  filename,
                  downloaded: 0,
                  total: 0,
                  percent: 0,
                  speed: 0,
                  done: true,
                  error: err instanceof Error ? err.message : String(err),
                  engine: 'funasr',
                  modelId: filename,
                } satisfies DownloadProgressUnified);
              }
            });
          } else {
            // ===== Whisper 模型下载 =====
            downloadModel(
              filename,
              useMirror ?? false,
              (progress: DownloadProgress) => {
                if (sender && !sender.isDestroyed()) {
                  sender.send(DOWNLOAD_PROGRESS_CHANNEL, {
                    ...progress,
                    engine: 'whisper',
                  } satisfies DownloadProgressUnified);
                }
              },
            ).then((localPath) => {
              logger.info(`[VoiceController] Whisper 模型下载完成: ${filename} -> ${localPath}`);
            }).catch((err) => {
              logger.error(`[VoiceController] Whisper 模型下载失败: ${filename}`, err);
              if (sender && !sender.isDestroyed()) {
                sender.send(DOWNLOAD_PROGRESS_CHANNEL, {
                  filename,
                  downloaded: 0,
                  total: 0,
                  percent: 0,
                  speed: 0,
                  done: true,
                  error: err instanceof Error ? err.message : String(err),
                  engine: 'whisper',
                } satisfies DownloadProgressUnified);
              }
            });
          }

          return { action, code: 0, message: '下载已开始' };
        }

        case 'cancelDownload': {
          if (!filename) return { action, code: -1, message: '缺少 filename 参数' };
          const engineType: EngineType = engine ?? 'whisper';
          const ok = engineType === 'funasr'
            ? cancelFunasrDownload(filename)
            : cancelDownload(filename);
          return { action, code: ok ? 0 : -1, message: ok ? '已取消下载' : '没有进行中的下载' };
        }

        case 'delete': {
          if (!filename) return { action, code: -1, message: '缺少 filename 参数' };
          const engineType: EngineType = engine ?? 'whisper';
          let ok: boolean;

          if (engineType === 'funasr') {
            ok = deleteFunasrModel(filename);
            // 如果删除的是当前选择的模型，清除选择和引擎
            const config = voicedbService.getConfig();
            if (ok && config.selected_model === filename) {
              voicedbService.setSelectedModel(null);
              voicedbService.setSelectedEngine(null);
            }
            // 尝试清理孤儿 VAD 文件
            if (ok) {
              deleteVadModelIfOrphan();
            }
          } else {
            ok = deleteModelFile(filename);
            // 如果删除的是当前选择的模型，清除选择
            const config = voicedbService.getConfig();
            if (ok && config.selected_model === filename) {
              voicedbService.setSelectedModel(null);
              voicedbService.setSelectedEngine(null);
            }
          }
          return { action, code: ok ? 0 : -1, message: ok ? '删除成功' : '删除失败' };
        }

        case 'select': {
          if (!filename) return { action, code: -1, message: '缺少 filename 参数' };
          const engineType: EngineType = engine ?? 'whisper';
          voicedbService.setSelectedModel(filename);
          voicedbService.setSelectedEngine(engineType);
          logger.info(`[VoiceController] 选择模型: ${filename} (engine=${engineType})`);
          return { action, code: 0, message: '选择成功' };
        }

        case 'getSelected': {
          const config = voicedbService.getConfig();
          return { action, code: 0, data: config.selected_model };
        }

        case 'getEngine': {
          const config = voicedbService.getConfig();
          return { action, code: 0, data: config.selected_engine ?? 'whisper' };
        }

        case 'selectEngine': {
          const engineType: EngineType = engine ?? 'whisper';
          voicedbService.setSelectedEngine(engineType);
          return { action, code: 0, message: '引擎已切换' };
        }

        case 'getDir': {
          const dir = getVoiceModelDir();
          return { action, code: 0, data: dir };
        }

        default:
          return { action, code: -1, message: `未知操作: ${action}` };
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('[VoiceController] localOperation 异常:', error);
      return { action, code: -1, message: `操作失败: ${errMsg}` };
    }
  }

  /**
   * 启动流式转写会话
   *
   * 根据当前启用的远程语音模型类型或本地引擎自动选择转写后端：
   *   - 如果有启用的远程火山引擎模型 → 使用火山引擎双向流式 WebSocket
   *   - 否则根据 engine 参数或已选引擎分流：
   *     - funasr → 本地 FunASR（llama.cpp runtime + HTTP 服务）
   *     - whisper → 本地 Whisper（原生 addon + LLM 校对）
   *
   * 前端无需关心使用哪种后端，接口完全一致。
   */
  async startSession(args: StartSessionArgs, event?: IpcMainInvokeEvent): Promise<StartSessionResult> {
    logger.info('[VoiceController] startSession: 启动流式转写会话');

    try {
      await this.ensureDb();

      // 获取 sender 用于推送转写结果
      const sender = event?.sender;
      const language = args.language ?? 'auto';

      // 检查是否有启用的远程语音模型（火山引擎）
      const remoteModel = voicedbService.getEnabledModel();

      if (remoteModel && remoteModel.provider === 'volc') {
        // ===== 火山引擎模式 =====
        logger.info(`[VoiceController] 使用火山引擎转写: model=${remoteModel.name}`);
        currentMode = 'volc';

        const result = await startVolcSession({
          model: remoteModel,
          language,
          onResult: (payload: { text: string; type: 'replace' }) => {
            if (sender && !sender.isDestroyed()) {
              sender.send(TRANSCRIPTION_RESULT_CHANNEL, payload);
            }
          },
        });

        if (!result.ok) {
          currentMode = null;
          return { code: -1, message: result.message ?? '火山引擎连接失败' };
        }

        return { code: 0, data: { ...result, mode: 'volc' } };
      }

      // ===== 本地模型模式 =====
      // 获取已选本地模型配置
      const config = voicedbService.getConfig();
      // 优先使用参数指定的 engine，否则用已选引擎
      const engine: EngineType = args.engine ?? (config.selected_engine as EngineType) ?? 'whisper';

      if (engine === 'funasr') {
        // ===== FunASR 模式 =====
        logger.info('[VoiceController] 使用本地 FunASR 转写');
        currentMode = 'funasr';

        // 检查 FunASR 二进制
        if (!isFunasrAvailable()) {
          currentMode = null;
          return { code: -1, message: 'FunASR 运行时不在此平台可用，请确认二进制已打包或选择 Whisper 引擎' };
        }

        // 获取已选 FunASR 模型 ID
        const modelId = args.modelFilename ?? config.selected_model;
        if (!modelId) {
          currentMode = null;
          return { code: -1, message: '未选择 FunASR 模型，请先在设置中下载并选择模型' };
        }

        // 启动 FunASR 会话（启动 HTTP 服务子进程）
        // onResult 回调：text=转写文本，type=final（不做 LLM 校对）
        const result = await startFunasrSession(modelId, language, (payload: { text: string; type: 'raw' | 'final' }) => {
          if (sender && !sender.isDestroyed()) {
            sender.send(TRANSCRIPTION_RESULT_CHANNEL, payload);
          }
        });

        if (!result.ok) {
          currentMode = null;
          return { code: -1, message: result.message ?? 'FunASR 服务启动失败' };
        }

        return { code: 0, data: { ...result, mode: 'funasr' } };
      }

      // ===== Whisper 模式 =====
      logger.info('[VoiceController] 使用本地 Whisper 转写');
      currentMode = 'whisper';

      // 检查 whisper addon
      if (!isWhisperAvailable()) {
        currentMode = null;
        return { code: -1, message: 'Whisper 原生组件不可用，请确认依赖已正确安装或配置远程语音模型' };
      }

      // 获取已选本地模型
      const modelFilename = args.modelFilename ?? config.selected_model;

      if (!modelFilename) {
        currentMode = null;
        return { code: -1, message: '未选择本地 Whisper 模型，请先在设置中下载并选择模型' };
      }

      // 启动 Whisper 会话（预加载模型）
      // onResult 回调带类型：raw=Whisper 原始文本（灰色），corrected=LLM 校对后文本（黑色）
      const result = await startWhisperSession(modelFilename, language, (payload: { text: string; type: 'raw' | 'corrected' }) => {
        if (sender && !sender.isDestroyed()) {
          sender.send(TRANSCRIPTION_RESULT_CHANNEL, payload);
        }
      });

      if (!result.ok) {
        currentMode = null;
        return { code: -1, message: result.message ?? '模型加载失败' };
      }

      return { code: 0, data: { ...result, mode: 'whisper' } };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('[VoiceController] startSession 异常:', error);
      currentMode = null;
      return { code: -1, message: `启动失败: ${errMsg}` };
    }
  }

  /**
   * 检查会话状态
   */
  getSessionStatus(): { code: number; data: { active: boolean } } {
    let active = false;
    switch (currentMode) {
      case 'volc':
        active = isVolcSessionActive();
        break;
      case 'funasr':
        active = isFunasrSessionActive();
        break;
      default:
        active = isWhisperSessionActive();
        break;
    }
    return { code: 0, data: { active } };
  }

  /**
   * 麦克风权限操作
   */
  async micPermission(args: MicPermissionArgs): Promise<MicPermissionResultPayload> {
    const { action } = args;
    logger.info(`[VoiceController] micPermission: action=${action}`);

    try {
      switch (action) {
        case 'check': {
          const result = checkMicrophonePermission();
          return { action, code: 0, data: result };
        }

        case 'request': {
          const result = await requestMicrophonePermission();
          return { action, code: 0, data: result };
        }

        default:
          return { action, code: -1 };
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('[VoiceController] micPermission 异常:', error);
      return { action, code: -1, data: { status: 'unsupported', platform: process.platform, error: errMsg } as unknown as MicPermissionResult };
    }
  }
}

export default VoiceController;
export const voiceController = new VoiceController();
