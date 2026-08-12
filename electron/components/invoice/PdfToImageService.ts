/**
 * PDF 处理服务
 *
 * 使用 ppu-pdf 处理 PDF 文件：
 * - 数字 PDF：直接提取文本+坐标（毫秒级，无需 OCR）
 * - 扫描 PDF：渲染为图片后 OCR 识别
 * - 页面渲染：渲染为 PNG 用于前端显示
 */
import fs from 'fs';
import path from 'path';
import { logger } from 'ee-core/log';

/** PDF 页面图片 */
export interface PdfPageImage {
  pageNumber: number;
  buffer: Buffer;
  width: number;
  height: number;
}

/** PDF 文本提取结果（单页） */
export interface PdfTextPage {
  pageNumber: number;
  fullText: string;
  words: PdfTextWord[];
}

/** PDF 文本单词 */
export interface PdfTextWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  dimension: { width: number; height: number };
}

/** PDF 处理结果 */
export interface PdfProcessResult {
  /** 是否为扫描 PDF */
  isScanned: boolean;
  /** 每页文本结果 */
  pages: PdfTextPage[];
  /** 总页数 */
  totalPages: number;
}

/** 渲染 DPI（越高图片越清晰，72 为 PDF 原生点数） */
const RENDER_DPI = 150;
/** 坐标缩放因子：将 PDF 点数坐标（72 DPI）缩放到渲染 DPI */
const SCALE_FACTOR = RENDER_DPI / 72;

class PdfToImageService {
  private pdfReader: any = null;

  /**
   * 初始化 PdfReader（懒加载）
   *
   * 关键：必须在导入 ppu-pdf 之前预加载 mupdf 模块。
   *
   * 原因：ppu-pdf 内部的 mupdf-workaround.js 会在 process.argv[1] 不以 .ts/.js 结尾时
   * （如 electron-egg 开发模式以 `electron .` 启动，process.argv[1] = "."），
   * 无条件覆盖 $libmupdf_wasm_Module 为 locateFile(path){return"./"+path}，
   * 导致 mupdf 从 process.cwd() 查找 mupdf-wasm.wasm 而非 node_modules/mupdf/dist/。
   *
   * 解决：先设置正确的 WASM 路径并预加载 mupdf（利用 ESM 模块缓存机制），
   * 这样 ppu-pdf 内部的 import("mupdf") 会返回已缓存的模块，workaround 的覆盖不再生效。
   */
  private async getReader(): Promise<any> {
    if (!this.pdfReader) {
      // 1. 定位 mupdf WASM 文件目录
      const wasmDir = this.findMupdfWasmDir();
      if (wasmDir) {
        logger.info(`[PdfService] mupdf WASM 目录: ${wasmDir}`);
        (globalThis as any).$libmupdf_wasm_Module = {
          locateFile(p: string) { return path.join(wasmDir, p); }
        };
      } else {
        logger.warn('[PdfService] 未找到 mupdf WASM 文件，将使用默认查找路径');
      }

      // 2. 预加载 mupdf 模块（在 ppu-pdf 的 mupdf-workaround 覆盖之前）
      //    利用 ESM 模块缓存：后续 ppu-pdf 内部的 import("mupdf") 返回此缓存模块
      await import('mupdf');

      // 3. 导入 ppu-pdf（此时 mupdf 已缓存，workaround 覆盖 $libmupdf_wasm_Module 不影响已加载的模块）
      const { PdfReader } = await import('ppu-pdf');
      this.pdfReader = new PdfReader({ verbose: false });
    }
    return this.pdfReader;
  }

  /**
   * 查找 mupdf WASM 文件所在目录
   *
   * 使用多级回退策略确保在开发模式和打包后都能正确定位：
   * 1. require.resolve('mupdf') — 最可靠，利用 Node 模块解析算法
   * 2. process.cwd() — 开发模式后备
   * 3. __dirname — 基于 bundled 文件位置
   */
  private findMupdfWasmDir(): string | null {
    const WASM_FILENAME = 'mupdf-wasm.wasm';

    // 方案1：使用 require.resolve 定位 mupdf 模块路径（最可靠）
    try {
      // esbuild 打包为 CJS 格式，require 可用；packages:'external' 确保 mupdf 不被打包
      const mupdfPath = require.resolve('mupdf');
      const dir = path.dirname(mupdfPath);
      if (fs.existsSync(path.join(dir, WASM_FILENAME))) {
        return dir;
      }
    } catch (e) {
      // require 不可用或模块未找到，尝试下一个方案
    }

    // 方案2：从 process.cwd() 定位（开发模式后备）
    const cwdPath = path.join(process.cwd(), 'node_modules', 'mupdf', 'dist');
    if (fs.existsSync(path.join(cwdPath, WASM_FILENAME))) {
      return cwdPath;
    }

    // 方案3：从 __dirname 定位（打包后 main.js 所在目录的上溯）
    try {
      // 开发模式: public/electron/ → ../../node_modules/mupdf/dist
      const dirFromHere = path.join(__dirname, '..', '..', 'node_modules', 'mupdf', 'dist');
      if (fs.existsSync(path.join(dirFromHere, WASM_FILENAME))) {
        return dirFromHere;
      }
    } catch (e) {
      // __dirname 不可用（ESM 环境）
    }

    return null;
  }

  /**
   * 提取 PDF 文本内容
   * 数字 PDF 直接提取，扫描 PDF 需传入 OCR 服务
   */
  async extractText(
    filePath: string,
    ocrService?: any
  ): Promise<PdfProcessResult> {
    const reader = await this.getReader();
    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    // 打开 PDF
    const pdf = await reader.open(arrayBuffer);
    logger.info(`[PdfService] PDF 已打开，共 ${pdf.countPages()} 页`);

    // 提取文本
    const texts = await reader.getTexts(pdf);

    // 判断是否为扫描 PDF
    const isScanned = reader.isScanned(texts);
    logger.info(`[PdfService] PDF 类型: ${isScanned ? '扫描' : '数字'}`);

    let pages: PdfTextPage[] = [];

    if (!isScanned) {
      // 数字 PDF：直接使用提取的文本
      // mupdf 的 toStructuredText().asJSON() 已将坐标转换为左上角原点（Y 向下），
      // 与 canvas/HTML 坐标系一致，前端无需 Y 翻转
      for (const [pageNum, pageData] of texts) {
        pages.push({
          pageNumber: pageNum,
          fullText: pageData.fullText || '',
          words: (pageData.words || []).map((w: any) => ({
            text: w.text || '',
            bbox: w.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 },
            dimension: w.dimension || { width: 0, height: 0 },
          })),
        });
      }
      reader.destroy(pdf);
    } else {
      // 扫描 PDF：渲染为图片后 OCR
      if (!ocrService) {
        logger.warn('[PdfService] 扫描 PDF 需要 OCR 服务，但未提供');
        reader.destroy(pdf);
        return { isScanned: true, pages: [], totalPages: 0 };
      }

      const canvasMap = await reader.renderAll(pdf);
      reader.destroy(pdf); // 已拿到 canvas，可提前销毁

      const scannedTexts = await reader.getTextsScanned(ocrService, canvasMap);
      // 扫描 PDF 的 OCR 坐标已是图片坐标系（左上角原点，Y 向下），与 canvas 一致
      for (const [pageNum, pageData] of scannedTexts) {
        pages.push({
          pageNumber: pageNum,
          fullText: pageData.fullText || '',
          words: (pageData.words || []).map((w: any) => ({
            text: w.text || '',
            bbox: w.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 },
            dimension: w.dimension || { width: 0, height: 0 },
          })),
        });
      }
    }

    logger.info(`[PdfService] 文本提取完成，${pages.length} 页，类型: ${isScanned ? '扫描' : '数字'}`);
    return { isScanned, pages, totalPages: pages.length };
  }

  /**
   * 渲染 PDF 页面为 PNG 图片（用于前端显示）
   */
  async renderToImages(filePath: string, maxPages = 20): Promise<PdfPageImage[]> {
    const reader = await this.getReader();
    const buffer = fs.readFileSync(filePath);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    const pdf = await reader.open(arrayBuffer);
    const totalPages = Math.min(pdf.countPages() || 0, maxPages);

    logger.info(`[PdfService] 渲染 PDF: ${totalPages} 页`);

    // 使用 renderAll 获取所有页面的 canvas（高 DPI 渲染，提升清晰度）
    const canvasMap = await reader.renderAll(pdf, RENDER_DPI);
    reader.destroy(pdf);

    const pages: PdfPageImage[] = [];
    for (const [pageNum, canvas] of canvasMap) {
      if (pageNum >= totalPages) break;
      const pngBuffer = canvas.toBuffer('image/png');
      pages.push({
        pageNumber: pageNum,
        buffer: pngBuffer,
        width: canvas.width,
        height: canvas.height,
      });
    }

    logger.info(`[PdfService] 渲染完成，${pages.length} 页`);
    return pages;
  }
}

export const pdfToImageService = new PdfToImageService();
export default PdfToImageService;
