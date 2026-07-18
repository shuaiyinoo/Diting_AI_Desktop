/**
 * 文档解析器（基于 @kreuzberg/node，支持 91+ 文件格式）
 *
 * @kreuzberg/node 是 Rust 实现的高性能文档解析库，支持：
 *   - Office 文档（PDF, DOCX, XLSX, PPTX, ODT 等）
 *   - 图片（OCR，需 Tesseract）
 *   - Web & 数据（HTML, XML, JSON, CSV 等）
 *   - 文本 & Markdown
 *   - 邮件 & 压缩包
 *   - 学术论文（BibTeX, LaTeX, Typst 等）
 *   - 代码（tree-sitter）
 *
 * 所有解析 API 都是异步的（extractFile），不会阻塞 Electron 主进程事件循环。
 */

import { extractFile } from '@kreuzberg/node';

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

/**
 * OCR (Tesseract) 可用性缓存：
 *   - true:  已验证可用
 *   - false: 已验证不可用（tessdata 缺失）
 *   - null:  未检测
 * 避免每个图片文件都重复触发 Tesseract 初始化失败的 stderr 噪音。
 */
let ocrAvailable: boolean | null = null;

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
 * 使用 @kreuzberg/node 解析文档
 *
 * 对图片文件需要 OCR 支持（Tesseract）；如果 OCR 不可用会直接抛错。
 * 对非图片文件，禁用 OCR 以避免 PDF/Office 中嵌入图片时触发 Tesseract 报错。
 */
export async function parseDocument(filePath: string): Promise<string> {
  const ext = getFileExtension(filePath);
  const isImage = IMAGE_OCR_EXTENSIONS.has(ext);

  // ★ 图片文件需要 OCR；预先检测 Tesseract 是否可用，避免触发 stderr 噪音
  if (isImage) {
    if (ocrAvailable === false) {
      throw new Error('图片解析需要 OCR 支持（Tesseract），但当前环境未配置 tessdata，已跳过');
    }
    if (ocrAvailable === null) {
      // 首次遇到图片文件，尝试解析来检测 OCR 是否可用
      try {
        const probeResult = await extractFile(filePath, null, {
          ocr: { enabled: true, backend: 'tesseract', language: 'eng' },
        });
        const probeContent = (probeResult?.content || '').trim();
        if (probeContent) {
          ocrAvailable = true;
          return probeContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
        }
        // 内容为空也可能是 OCR 失败
        throw new Error('OCR 返回空内容');
      } catch (error: any) {
        ocrAvailable = false;
        const msg = error?.message || String(error);
        throw new Error(`图片解析需要 OCR 支持（Tesseract），但当前环境未配置 tessdata: ${msg}`);
      }
    }
  }

  try {
    // ★ 对非图片文件，禁用 OCR 以避免 PDF/Office 中嵌入图片时触发 Tesseract（tessdata 缺失会报错）
    const config = isImage
      ? { ocr: { enabled: true, backend: 'tesseract', language: 'eng' } }
      : { ocr: { enabled: false, backend: 'tesseract' } };

    // extractFile 会自动根据文件扩展名/内容检测 MIME 类型并选择解析器
    const result = await extractFile(filePath, null, config);
    const content = (result?.content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    if (!content) {
      throw new Error('解析结果内容为空');
    }
    // 如果是图片文件且成功提取了内容，标记 OCR 可用
    if (isImage) {
      ocrAvailable = true;
    }
    return content;
  } catch (error: any) {
    const msg = error?.message || String(error);
    // OCR 相关错误（tessdata 缺失）给出更友好的提示，并缓存不可用状态
    if (msg.includes('tesseract') || msg.includes('tessdata') || msg.includes('OCR') || msg.includes('Ocr')) {
      ocrAvailable = false;
      throw new Error(`图片解析需要 OCR 支持（Tesseract），但环境未配置 tessdata: ${msg}`);
    }
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
