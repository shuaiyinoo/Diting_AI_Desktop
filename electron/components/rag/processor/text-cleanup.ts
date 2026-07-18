/**
 * 文本清理器
 *
 * 源自 electron-rag/src/text-cleanup.ts
 * 1. 清除控制字符（保留 \n \r \t）
 * 2. 压缩行内多余空白
 * 3. 压缩连续换行（3+ → 2）
 */

const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const INLINE_WHITESPACE = /[^\S\n\r]{2,}/g;
const EXCESSIVE_NEWLINES = /\n{3,}/g;

export function cleanText(text: string): string {
  if (!text) return '';
  let result = text.replace(CONTROL_CHARS, '');
  result = result.replace(INLINE_WHITESPACE, ' ');
  result = result.replace(EXCESSIVE_NEWLINES, '\n\n');
  return result;
}
