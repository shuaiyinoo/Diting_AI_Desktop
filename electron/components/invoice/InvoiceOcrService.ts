/**
 * 票据 OCR 识别服务（独立模块）
 *
 * 使用 ppu-paddle-ocr 本地模型识别图片中的文字。
 * 模型路径由 OCR 模型管理服务（ocr-model-service）提供，
 * 用户需先在设置中下载并选择 OCR 模型。
 */
import fs from 'fs';
import path from 'path';
import { logger } from 'ee-core/log';
import { pdfToImageService } from './PdfToImageService';
import { ocrdbService } from '../../service/database/ocrdb';
import { getSelectedModelPaths } from '../../service/ocr/ocr-model-service';

// 支持识别的图片扩展名
const SUPPORTED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.tiff', '.tif'];

/** OCR 单个识别区域 */
export interface OcrBox {
  text: string;
  confidence: number;
  /** 边界框坐标 */
  box: { x: number; y: number; width: number; height: number };
}

/** OCR 单页识别结果 */
export interface OcrPageResult {
  pageNumber: number;
  text: string;
  confidence: number;
  boxes: OcrBox[];
}

/** OCR 识别结果 */
export interface OcrResult {
  text: string;
  success: boolean;
  error?: string;
  /** 识别置信度 */
  confidence?: number;
  /** 所有识别区域（含位置信息） */
  boxes?: OcrBox[];
  /** 多页结果（PDF 识别时使用） */
  pages?: OcrPageResult[];
  /** 页数 */
  totalPages?: number;
  /** 是否为扫描 PDF（数字 PDF 坐标系原点在左下角，需翻转 Y） */
  isScanned?: boolean;
}

class InvoiceOcrService {
  /** PaddleOcr 服务实例 */
  private ocrService: any = null;
  /** 是否已初始化 */
  private initialized = false;
  /** 初始化中 */
  private initializing = false;
  /** 初始化失败次数（超过 3 次后不再重试，避免无限循环） */
  private initFailCount = 0;
  /** 最大初始化重试次数 */
  private readonly MAX_INIT_RETRIES = 3;

  /**
   * 初始化 OCR 模型（懒加载，首次调用时执行）
   *
   * 从 ocrdb 读取用户选择的模型 ID，然后从本地路径加载模型文件。
   * 如果用户未选择模型或模型文件不存在，回退到库默认模型（V6_MEDIUM_MODEL）。
   */
  async initialize(): Promise<void> {
    if (this.initialized || this.initializing) return;
    // 超过最大重试次数后不再尝试初始化，避免无限循环
    if (this.initFailCount >= this.MAX_INIT_RETRIES) {
      logger.warn(`[InvoiceOcrService] 初始化已失败 ${this.initFailCount} 次，不再重试。请检查模型文件后重启应用。`);
      return;
    }
    this.initializing = true;

    try {
      // 动态导入，避免打包时将 onnxruntime-node 打入前端
      const { PaddleOcrService, V6_MEDIUM_MODEL } = await import('ppu-paddle-ocr');

      // 从 ocrdb 读取用户选择的模型
      await ocrdbService.init();
      const config = ocrdbService.getConfig();
      const selectedModelId = config.selected_model;

      // 尝试获取本地模型路径
      let modelPaths: { detection: string; recognition: string; charactersDictionary: string } | null = null;
      if (selectedModelId) {
        modelPaths = await getSelectedModelPaths(selectedModelId);
      }

      // 构造 PaddleOcrService 选项
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const options: any = {
        debugging: {
          debug: false,
          verbose: true,
        },
      };

      if (modelPaths) {
        // 使用本地下载的模型文件路径
        options.model = modelPaths;
        logger.info(`[InvoiceOcrService] 使用本地模型: ${selectedModelId}`);
      } else {
        // 回退：使用库默认模型（会自动从 GitHub 下载到 ~/.cache/ppu-paddle-ocr/）
        options.model = V6_MEDIUM_MODEL;
        logger.warn('[InvoiceOcrService] 未找到本地 OCR 模型，回退到库默认 V6_MEDIUM_MODEL（将自动下载到 ~/.cache/ppu-paddle-ocr/）');
      }

      this.ocrService = new PaddleOcrService(options);

      logger.info('[InvoiceOcrService] 开始初始化 OCR 模型...');
      await this.ocrService.initialize();
      this.initialized = true;
      logger.info('[InvoiceOcrService] OCR 模型初始化成功');
    } catch (err) {
      this.initFailCount++;
      logger.error(`[InvoiceOcrService] OCR 模型初始化失败 (第 ${this.initFailCount} 次):`, err?.message || err);
      logger.error('[InvoiceOcrService] 错误详情:', err?.stack || String(err));
      this.ocrService = null;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * 识别图片文件中的文字
   * @param filePath - 图片文件的绝对路径
   * @returns OCR 识别结果
   */
  async recognize(filePath: string): Promise<OcrResult> {
    if (!this.initialized) {
      await this.initialize();
      if (!this.initialized) {
        const reason = this.initFailCount >= this.MAX_INIT_RETRIES
          ? `OCR 模型初始化已失败 ${this.initFailCount} 次，不再重试`
          : 'OCR 模型初始化失败';
        return { text: '', success: false, error: reason };
      }
    }

    try {
      const buf = fs.readFileSync(filePath);
      const { text, confidence, boxes } = await this.recognizeImageBuffer(buf);

      return {
        text,
        success: true,
        confidence,
        boxes,
      };
    } catch (err) {
      logger.error(`[InvoiceOcrService] 识别失败: ${filePath}`, err?.message || err);
      return {
        text: '',
        success: false,
        error: err?.message || String(err),
      };
    }
  }

  /**
   * 识别图片 Buffer 中的文字（内部方法）
   */
  private async recognizeImageBuffer(buf: Buffer): Promise<{ text: string; confidence: number; boxes: OcrBox[] }> {
    const imageBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const result = await this.ocrService.recognize(imageBuffer, { flatten: true });

    // 提取识别区域
    const boxes: OcrBox[] = [];
    const rawResults = result.results || [];
    for (const item of rawResults) {
      if (item && item.text) {
        const box = item.box || {};
        boxes.push({
          text: item.text,
          confidence: item.confidence || 0,
          box: {
            x: box.x || 0,
            y: box.y || 0,
            width: box.width || 0,
            height: box.height || 0,
          },
        });
      }
    }

    return {
      text: result.text || '',
      confidence: result.confidence || 0,
      boxes,
    };
  }

  /**
   * 识别 PDF 文件（多页）
   * 数字 PDF 直接提取文本，扫描 PDF 通过 OCR 识别
   */
  async recognizePdf(filePath: string): Promise<OcrResult> {
    if (!this.initialized) {
      await this.initialize();
      if (!this.initialized) {
        return { text: '', success: false, error: 'OCR 模型初始化失败' };
      }
    }

    try {
      // 使用 ppu-pdf 提取文本（数字 PDF 直接提取，扫描 PDF 自动 OCR）
      const result = await pdfToImageService.extractText(filePath, this.ocrService);

      if (!result.pages || result.pages.length === 0) {
        return { text: '', success: false, error: 'PDF 内容为空' };
      }

      // 将 ppu-pdf 的 bbox {x0, y0, x1, y1} 转为 OcrBox {x, y, width, height}
      const pageResults: OcrPageResult[] = result.pages.map(page => {
        const boxes: OcrBox[] = (page.words || []).map(w => ({
          text: w.text,
          // 数字 PDF 置信度 1.0（直接提取），扫描 PDF 由 OCR 决定
          confidence: result.isScanned ? 0.9 : 1.0,
          box: {
            x: w.bbox.x0,
            y: w.bbox.y0,
            width: w.bbox.x1 - w.bbox.x0,
            height: w.bbox.y1 - w.bbox.y0,
          },
        }));

        return {
          pageNumber: page.pageNumber,
          text: page.fullText,
          confidence: result.isScanned ? 0.9 : 1.0,
          boxes,
        };
      });

      const allText = pageResults.map(p => p.text).join('\n\n---\n\n\n');

      logger.info(`[InvoiceOcrService] PDF 处理完成: ${pageResults.length} 页，类型: ${result.isScanned ? '扫描' : '数字'}`);

      return {
        text: allText,
        success: true,
        confidence: result.isScanned ? 0.9 : 1.0,
        boxes: pageResults.flatMap(p => p.boxes),
        pages: pageResults,
        totalPages: pageResults.length,
        isScanned: result.isScanned,
      };
    } catch (err) {
      logger.error(`[InvoiceOcrService] PDF 识别失败: ${filePath}`, err?.message || err);
      return { text: '', success: false, error: err?.message || String(err) };
    }
  }

  /**
   * 判断文件是否为 PDF
   */
  isPdf(fileName: string): boolean {
    const ext = '.' + (fileName.split('.').pop() || '').toLowerCase();
    return ext === '.pdf';
  }

  /**
   * 判断文件是否为支持的图片类型
   */
  isSupportedImage(fileName: string): boolean {
    const ext = '.' + (fileName.split('.').pop() || '').toLowerCase();
    return SUPPORTED_IMAGE_EXTENSIONS.includes(ext);
  }

  /**
   * 重置初始化失败计数（修复模型文件后可调用以允许重试）
   */
  resetInitFailure(): void {
    this.initFailCount = 0;
    this.initialized = false;
    this.ocrService = null;
    logger.info('[InvoiceOcrService] 已重置初始化失败计数');
  }

  /**
   * 销毁 OCR 服务，释放资源
   */
  async destroy(): Promise<void> {
    if (this.ocrService) {
      try {
        await this.ocrService.destroy();
      } catch {
        // 忽略销毁错误
      }
      this.ocrService = null;
      this.initialized = false;
      logger.info('[InvoiceOcrService] OCR 服务已销毁');
    }
  }
}

export const invoiceOcrService = new InvoiceOcrService();
export default InvoiceOcrService;
