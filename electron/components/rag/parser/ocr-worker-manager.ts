/**
 * OCR 子进程管理器
 *
 * 通过 child_process.fork() 在独立子进程中运行 PaddleOCR，
 * 防止 ONNX Runtime 原生层崩溃（SIGTRAP / SIGSEGV）导致主进程退出。
 *
 * 设计要点：
 *   1. 单子进程串行处理：同一时间只处理一张图片，避免并发推理导致原生内存冲突
 *   2. 崩溃自动恢复：子进程异常退出时，返回错误给调用方，下次调用自动重启子进程
 *   3. JSON Line 协议：通过 stdin/stdout 传递 JSON 消息，简单可靠
 *   4. 超时保护：单张图片 OCR 超时后杀死子进程并返回错误
 *   5. 脚本动态写入：子进程脚本在运行时写入临时目录，避免打包路径问题
 */

import { fork, type ChildProcess } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { logger } from 'ee-core/log';

const OCR_TIMEOUT_MS = 120_000; // 单张图片 OCR 超时：2 分钟

/**
 * 子进程脚本内容（ESM 格式）
 *
 * 运行时写入临时文件，避免打包路径依赖。
 * 使用 ESM 格式以匹配 ppu-paddle-ocr 的模块类型。
 */
const WORKER_SCRIPT = `
import { PaddleOcrService, V6_MEDIUM_MODEL } from 'ppu-paddle-ocr';
import fs from 'node:fs';
import readline from 'node:readline';

let ocrService = null;
let initialized = false;
let initializing = false;

async function ensureInit() {
  if (initialized || initializing) return;
  initializing = true;
  try {
    ocrService = new PaddleOcrService({
      model: V6_MEDIUM_MODEL,
      debugging: { debug: false, verbose: false },
    });
    await ocrService.initialize();
    initialized = true;
    process.stderr.write('[ocr-worker] PaddleOCR 初始化成功\\n');
  } catch (err) {
    process.stderr.write('[ocr-worker] PaddleOCR 初始化失败: ' + (err?.message || err) + '\\n');
    ocrService = null;
  } finally {
    initializing = false;
  }
}

async function recognize(filePath) {
  await ensureInit();
  if (!initialized || !ocrService) {
    return { success: false, error: 'OCR 模型未初始化' };
  }
  const buf = fs.readFileSync(filePath);
  const imageBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const result = await ocrService.recognize(imageBuffer, { flatten: true });
  return {
    success: true,
    text: result.text || '',
    confidence: result.confidence || 0,
  };
}

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', async (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, type, filePath } = msg;
  try {
    if (type === 'recognize') {
      const result = await recognize(filePath);
      process.stdout.write(JSON.stringify({ id, ...result }) + '\\n');
    } else {
      process.stdout.write(JSON.stringify({ id, success: false, error: '未知类型: ' + type }) + '\\n');
    }
  } catch (err) {
    process.stdout.write(JSON.stringify({ id, success: false, error: err?.message || String(err) }) + '\\n');
  }
});

rl.on('close', () => process.exit(0));
process.stderr.write('[ocr-worker] 子进程已启动，等待指令\\n');
`;

class OcrWorkerManager {
  private worker: ChildProcess | null = null;
  private requestId = 0;
  private workerScriptPath: string | null = null;
  private pendingRequests = new Map<number, {
    resolve: (result: { success: boolean; text: string; error?: string }) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();

  /**
   * 获取子进程脚本路径（惰性写入临时文件）
   */
  private getScriptPath(): string {
    if (this.workerScriptPath) return this.workerScriptPath;

    const tmpDir = path.join(os.tmpdir(), 'diting-ocr');
    try { mkdirSync(tmpDir, { recursive: true }); } catch {}
    this.workerScriptPath = path.join(tmpDir, 'ocr-worker.mjs');
    writeFileSync(this.workerScriptPath, WORKER_SCRIPT, 'utf-8');
    logger.info(`[OcrWorkerManager] 子进程脚本路径: ${this.workerScriptPath}`);
    return this.workerScriptPath;
  }

  /**
   * 确保子进程已启动
   */
  private ensureWorker(): void {
    if (this.worker && !this.worker.killed) return;

    const scriptPath = this.getScriptPath();
    logger.info('[OcrWorkerManager] 启动 OCR 子进程...');

    this.worker = fork(scriptPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    // 监听 stdout（JSON Line 响应）
    let stdoutBuffer = '';
    this.worker.stdout?.on('data', (data: Buffer) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop() || ''; // 保留最后不完整的行
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          this.handleResponse(msg);
        } catch {
          // 忽略无法解析的行
        }
      }
    });

    // 监听 stderr（日志）
    this.worker.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (text) logger.info(`[OcrWorkerManager] worker: ${text}`);
    });

    // 监听子进程退出
    this.worker.on('exit', (code, signal) => {
      logger.warn(`[OcrWorkerManager] 子进程退出: code=${code}, signal=${signal}`);
      this.worker = null;
      // 拒绝所有待处理请求
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`OCR 子进程异常退出 (signal=${signal || code})`));
        this.pendingRequests.delete(id);
      }
    });

    // 监听子进程错误
    this.worker.on('error', (err) => {
      logger.error('[OcrWorkerManager] 子进程错误:', err.message);
      this.worker = null;
    });

    logger.info(`[OcrWorkerManager] OCR 子进程已启动 (PID=${this.worker.pid})`);
  }

  /**
   * 处理子进程响应
   */
  private handleResponse(msg: { id: number; success: boolean; text?: string; error?: string }): void {
    const pending = this.pendingRequests.get(msg.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pendingRequests.delete(msg.id);
    pending.resolve({
      success: msg.success,
      text: msg.text || '',
      error: msg.error,
    });
  }

  /**
   * 识别图片文件
   *
   * 通过子进程发送 OCR 请求，如果子进程崩溃则返回错误（不影响主进程）
   */
  async recognize(filePath: string): Promise<{ success: boolean; text: string; error?: string }> {
    return new Promise((resolve, reject) => {
      try {
        this.ensureWorker();
        if (!this.worker || !this.worker.stdin) {
          resolve({ success: false, text: '', error: 'OCR 子进程不可用' });
          return;
        }

        const id = ++this.requestId;
        const timer = setTimeout(() => {
          this.pendingRequests.delete(id);
          // 超时后杀死子进程（可能卡在原生推理中）
          this.killWorker();
          resolve({ success: false, text: '', error: `OCR 处理超时 (${OCR_TIMEOUT_MS / 1000}s)` });
        }, OCR_TIMEOUT_MS);

        this.pendingRequests.set(id, { resolve, reject, timer });

        const msg = JSON.stringify({ id, type: 'recognize', filePath }) + '\n';
        this.worker.stdin.write(msg);
      } catch (err) {
        resolve({
          success: false,
          text: '',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  /**
   * 杀死子进程（用于超时或异常恢复）
   */
  private killWorker(): void {
    if (this.worker) {
      try {
        this.worker.kill('SIGKILL');
      } catch {}
      this.worker = null;
    }
  }

  /**
   * 销毁子进程（程序退出时调用）
   */
  destroy(): void {
    if (this.worker) {
      try {
        this.worker.stdin?.end();
        this.worker.kill('SIGTERM');
      } catch {}
      this.worker = null;
    }
  }
}

// 单例导出
export const ocrWorkerManager = new OcrWorkerManager();
export default OcrWorkerManager;
