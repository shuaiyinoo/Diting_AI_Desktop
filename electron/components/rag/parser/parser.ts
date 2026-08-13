/**
 * 文档解析器
 *
 * 混合解析策略：
 *   - PDF 和图片 → 使用 PaddleOCR（ppu-paddle-ocr + ppu-pdf），原生支持中文和扫描件
 *   - 其余格式 → 使用 @kreuzberg/node（Rust 高性能解析库），支持 Office/Web/文本/代码等
 *
 * @kreuzberg/node 支持：
 *   - Office 文档（DOCX, XLSX, PPTX, ODT 等）
 *   - Web & 数据（HTML, XML, JSON, CSV 等）
 *   - 文本 & Markdown
 *   - 邮件 & 压缩包
 *   - 学术论文（BibTeX, LaTeX, Typst 等）
 *   - 代码（tree-sitter）
 *
 * PaddleOCR 支持：
 *   - 数字 PDF：mupdf 直接提取文本+坐标（毫秒级）
 *   - 扫描 PDF：渲染为图片后 PaddleOCR 识别
 *   - 图片：PaddleOCR V6_MEDIUM 模型识别（原生中文）
 *
 * 所有解析 API 都是异步的，不会阻塞 Electron 主进程事件循环。
 */

import { extractFile } from '@kreuzberg/node';
import { invoiceOcrService } from '../../invoice/InvoiceOcrService';

export interface DocumentParser {
  readonly extensions: string[];
  parse(filePath: string): Promise<string>;
  supports(extension: string): boolean;
}

/**
 * 支持向量化的文件扩展名列表（基于 @kreuzberg/node 支持的格式）
 */
const SUPPORTED_EXTENSIONS = new Set([
  // Office Documents
  'pdf', 'docx', 'docm', 'dotx', 'dotm', 'dot', 'odt',
  'xlsx', 'xlsm', 'xlsb', 'xls', 'xla', 'xlam', 'xltm', 'xltx', 'xlt', 'ods',
  'pptx', 'pptm', 'ppsx', 'potx', 'potm', 'pot', 'ppt',
  'epub', 'fb2', 'dbf', 'hwp', 'hwpx',
  // Images (OCR)
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'svg',
  // Web & Data
  'html', 'htm', 'xhtml', 'xml', 'json', 'yaml', 'yml', 'toml', 'csv', 'tsv',
  // Text & Markdown
  'txt', 'md', 'markdown', 'djot', 'rst', 'org', 'rtf',
  // Email & Archives
  'eml', 'msg', 'zip', 'tar', 'tgz', 'gz', '7z',
  // Academic & Scientific
  'bib', 'biblatex', 'ris', 'nbib', 'enw', 'csl',
  'tex', 'latex', 'typst', 'jats', 'ipynb', 'docbook',
  // Documentation
  'opml', 'pod', 'mdoc', 'troff',
  // Common Code (tree-sitter)
  'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'py', 'pyw', 'go', 'java', 'c', 'h', 'cpp', 'hpp', 'cc', 'cxx',
  'rs', 'rb', 'php', 'sh', 'bash', 'zsh', 'sql',
  'kt', 'swift', 'scala', 'clj', 'cljs', 'ex', 'exs',
  'lua', 'r', 'dart', 'vue', 'svelte',
]);

/** 不需要向量化的系统/临时文件名 */
const IGNORE_FILENAMES = new Set(['.ds_store', 'thumbs.db']);

/**
 * 需要OCR才能提取文本的图片扩展名（SVG除外，它有可选文字）
 */
const IMAGE_OCR_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'tif',
]);

function getFileExtension(filePath: string): string {
  const lower = filePath.toLowerCase();
  const match = lower.match(/\.([^.]+)$/);
  return match ? match[1] : '';
}

/** 检查文件名是否支持解析（导出，供 ragService 使用） */
export function isSupportedFormat(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  const baseName = lower.split('/').pop() || lower;
  if (IGNORE_FILENAMES.has(baseName)) return false;
  const ext = lower.match(/\.([^.]+)$/)?.[1];
  if (!ext) return false;
  return SUPPORTED_EXTENSIONS.has(ext);
}

/**
 * 解析文档，提取纯文本内容
 *
 * 分流策略：
 *   1. PDF → 使用 PaddleOCR 管线（数字 PDF 直接提取，扫描 PDF 自动 OCR）
 *   2. 图片 → 使用 PaddleOCR V6_MEDIUM 模型识别
 *   3. 其余格式 → 使用 @kreuzberg/node 解析（禁用 OCR）
 */
export async function parseDocument(filePath: string): Promise<string> {
  const ext = getFileExtension(filePath);

  // ── 分流 1：PDF → PaddleOCR 管线 ──
  if (ext === 'pdf') {
    const result = await invoiceOcrService.recognizePdf(filePath);
    if (!result.success || !result.text) {
      throw new Error(`PDF OCR 识别失败: ${result.error || '内容为空'}`);
    }
    return result.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  }

  // ── 分流 2：图片 → PaddleOCR 识别 ──
  if (IMAGE_OCR_EXTENSIONS.has(ext)) {
    const result = await invoiceOcrService.recognize(filePath);
    if (!result.success || !result.text) {
      throw new Error(`图片 OCR 识别失败: ${result.error || '内容为空'}`);
    }
    return result.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  }

  // ── 分流 3：其余格式 → @kreuzberg/node（禁用 OCR） ──
  try {
    const config = { ocr: { enabled: false, backend: 'tesseract' as const } };
    const result = await extractFile(filePath, null, config);
    const content = (result?.content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!content) {
      throw new Error('解析结果内容为空');
    }
    return content;
  } catch (error: any) {
    const msg = error?.message || String(error);
    throw new Error(`文档解析失败: ${msg}`);
  }
}

// ═══════════════════════════════════════════
// 兼容性导出：保留旧的 DocumentParser 接口和 parserRegistry
// （部分外部代码可能引用 parserRegistry）
// ═══════════════════════════════════════════

class KreuzbergParser implements DocumentParser {
  readonly extensions = [...SUPPORTED_EXTENSIONS];

  supports(extension: string): boolean {
    return SUPPORTED_EXTENSIONS.has(extension.replace(/^\./, '').toLowerCase());
  }

  async parse(filePath: string): Promise<string> {
    return parseDocument(filePath);
  }
}

class ParserRegistry {
  private parser: DocumentParser = new KreuzbergParser();

  getParser(extension: string): DocumentParser {
    const normalized = extension.replace(/^\./, '').toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(normalized)) {
      throw new Error(`不支持的文档类型: .${normalized}`);
    }
    return this.parser;
  }

  isSupported(extension: string): boolean {
    return SUPPORTED_EXTENSIONS.has(extension.replace(/^\./, '').toLowerCase());
  }

  get supportedExtensions(): string[] {
    return [...SUPPORTED_EXTENSIONS];
  }

  register(_parser: DocumentParser): void {
    // @kreuzberg/node 已覆盖所有格式，注册自定义解析器不再需要
  }
}

export const parserRegistry = new ParserRegistry();
