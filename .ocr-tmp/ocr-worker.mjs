
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
    // 从环境变量读取模型路径
    let modelPaths = null;
    const envPaths = process.env.OCR_MODEL_PATHS;
    if (envPaths) {
      try { modelPaths = JSON.parse(envPaths); } catch {}
    }

    const options = {
      debugging: { debug: false, verbose: false },
    };

    if (modelPaths && modelPaths.detection && modelPaths.recognition && modelPaths.charactersDictionary) {
      options.model = modelPaths;
      process.stderr.write('[ocr-worker] 使用本地模型路径\n');
    } else {
      options.model = V6_MEDIUM_MODEL;
      process.stderr.write('[ocr-worker] 回退到库默认 V6_MEDIUM_MODEL\n');
    }

    ocrService = new PaddleOcrService(options);
    await ocrService.initialize();
    initialized = true;
    process.stderr.write('[ocr-worker] PaddleOCR 初始化成功\n');
  } catch (err) {
    process.stderr.write('[ocr-worker] PaddleOCR 初始化失败: ' + (err?.message || err) + '\n');
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
      process.stdout.write(JSON.stringify({ id, ...result }) + '\n');
    } else {
      process.stdout.write(JSON.stringify({ id, success: false, error: '未知类型: ' + type }) + '\n');
    }
  } catch (err) {
    process.stdout.write(JSON.stringify({ id, success: false, error: err?.message || String(err) }) + '\n');
  }
});

rl.on('close', () => process.exit(0));
process.stderr.write('[ocr-worker] 子进程已启动，等待指令\n');
