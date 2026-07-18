/**
 * 结构感知文本切片器
 *
 * 源自 electron-rag/src/chunker.ts
 * 1. 按 Markdown 标题分割章节，跳过代码块内的 # 行
 * 2. 章节内按段落（连续空行）拆分
 * 3. 段落超限时按句子（中英文标点）拆分
 * 4. 仍超限时按字符数硬截断
 * 5. 贪心合并相邻片段到 targetTokens
 * 6. overlap：前一个 chunk 末尾向后回退 overlapTokens 个字符
 */

import type { ChunkingConfig, ChunkResult } from '../types';

const STRATEGY = 'structure-aware-token-budget-v1';
const BLANK_LINES = /\n\s*\n+/;
const HEADING = /^(#{1,6})\s+(.+)$/;
const CHARS_PER_TOKEN = 1;

interface Range { start: number; end: number; }
interface HeadingMatch { start: number; title: string; }
interface Fence { marker: string; length: number; }
interface Section { start: number; end: number; path: string; }
interface ChunkRange { start: number; end: number; path: string; sectionStart: number; }

export function chunkText(text: string, config: ChunkingConfig): ChunkResult[] {
  if (!text || text.trim().length === 0) return [];
  const targetTokens = Math.max(1, config.targetTokens);
  const maxTokens = Math.max(targetTokens, config.maxTokens);
  const sections = splitBySections(text);
  const ranges: ChunkRange[] = [];
  for (const section of sections) {
    const sectionRanges = splitSection(text, section, targetTokens, maxTokens);
    ranges.push(...sectionRanges);
  }
  return buildChunkResults(text, ranges, config.overlapTokens);
}

function splitBySections(text: string): Section[] {
  const headings = collectHeadings(text);
  if (headings.length === 0) {
    return [{ start: 0, end: text.length, path: '' }];
  }
  const sections: Section[] = [];
  if (headings[0].start > 0) {
    const range = trimRange(text, 0, headings[0].start);
    if (range) sections.push({ start: range.start, end: range.end, path: '' });
  }
  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const end = i + 1 < headings.length ? headings[i + 1].start : text.length;
    const range = trimRange(text, heading.start, end);
    if (range) sections.push({ start: range.start, end: range.end, path: heading.title });
  }
  return sections;
}

function collectHeadings(text: string): HeadingMatch[] {
  const headings: HeadingMatch[] = [];
  let fence: Fence | null = null;
  for (let start = 0; start < text.length; ) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    const line = text.substring(start, end);
    if (fence === null) {
      fence = openFence(line);
      if (fence === null) {
        const heading = parseHeading(line, start);
        if (heading) headings.push(heading);
      }
    } else if (isClosingFence(line, fence)) {
      fence = null;
    }
    start = end < text.length ? end + 1 : text.length;
  }
  return headings;
}

function parseHeading(line: string, start: number): HeadingMatch | null {
  const match = HEADING.exec(line);
  if (!match) return null;
  return { start, title: cleanHeading(match[2]) };
}

function cleanHeading(title: string): string {
  return title.replace(/\s+#*$/, '').trim();
}

function openFence(line: string): Fence | null {
  const indent = leadingSpaces(line);
  if (indent > 3 || indent === line.length) return null;
  const marker = line[indent];
  const length = fenceLength(line, indent, marker);
  if ((marker === '`' || marker === '~') && length >= 3) return { marker, length };
  return null;
}

function isClosingFence(line: string, fence: Fence): boolean {
  const indent = leadingSpaces(line);
  if (indent > 3 || indent === line.length || line[indent] !== fence.marker) return false;
  const length = fenceLength(line, indent, fence.marker);
  return length >= fence.length && line.substring(indent + length).trim().length === 0;
}

function leadingSpaces(line: string): number {
  let i = 0;
  while (i < line.length && line[i] === ' ') i++;
  return i;
}

function fenceLength(line: string, start: number, marker: string): number {
  let i = start;
  while (i < line.length && line[i] === marker) i++;
  return i - start;
}

function splitSection(text: string, section: Section, targetTokens: number, maxTokens: number): ChunkRange[] {
  const sectionText = text.substring(section.start, section.end);
  if (estimateTokens(sectionText) <= maxTokens) {
    return [{ start: section.start, end: section.end, path: section.path, sectionStart: section.start }];
  }
  const pieces = splitOversizedPieces(text, section, targetTokens, maxTokens);
  return mergePieces(text, pieces, targetTokens, maxTokens);
}

function splitOversizedPieces(text: string, section: Section, targetTokens: number, maxTokens: number): ChunkRange[] {
  const pieces: ChunkRange[] = [];
  for (const paragraph of splitByParagraphs(text, section)) {
    const paragraphText = text.substring(paragraph.start, paragraph.end);
    if (estimateTokens(paragraphText) <= maxTokens) {
      pieces.push(paragraph);
    } else {
      pieces.push(...splitBySentences(text, paragraph));
    }
  }
  return splitRemainingOversized(text, pieces, maxTokens);
}

function splitByParagraphs(text: string, section: Section): ChunkRange[] {
  const sectionText = text.substring(section.start, section.end);
  const paragraphs: ChunkRange[] = [];
  // ★ 必须使用 g (global) flag，否则 exec() 会一直返回第一个匹配，导致无限循环
  const regex = /\n\s*\n+/g;
  let cursor = section.start;
  let match: RegExpExecArray | null;
  let lastMatchIndex = -1;
  while ((match = regex.exec(sectionText)) !== null) {
    // 防止零长度匹配导致死循环
    if (match.index === lastMatchIndex) {
      regex.lastIndex++;
      continue;
    }
    lastMatchIndex = match.index;
    appendRange(text, cursor, section.start + match.index, section.path, section.start, paragraphs);
    cursor = section.start + match.index + match[0].length;
  }
  appendRange(text, cursor, section.end, section.path, section.start, paragraphs);
  return paragraphs;
}

function splitBySentences(text: string, range: ChunkRange): ChunkRange[] {
  const sentences: ChunkRange[] = [];
  let cursor = range.start;
  for (let i = range.start; i < range.end; i++) {
    if (isSentenceBoundary(text[i])) {
      appendRange(text, cursor, i + 1, range.path, range.sectionStart, sentences);
      cursor = i + 1;
    }
  }
  appendRange(text, cursor, range.end, range.path, range.sectionStart, sentences);
  return sentences;
}

function splitRemainingOversized(text: string, pieces: ChunkRange[], maxTokens: number): ChunkRange[] {
  const ranges: ChunkRange[] = [];
  for (const piece of pieces) {
    const pieceText = text.substring(piece.start, piece.end);
    if (estimateTokens(pieceText) <= maxTokens) {
      ranges.push(piece);
    } else {
      ranges.push(...splitByTokenBudget(text, piece, maxTokens));
    }
  }
  return ranges;
}

function splitByTokenBudget(text: string, range: ChunkRange, maxTokens: number): ChunkRange[] {
  const chunks: ChunkRange[] = [];
  const maxChars = Math.max(CHARS_PER_TOKEN, maxTokens * CHARS_PER_TOKEN);
  for (let cursor = range.start; cursor < range.end; cursor += maxChars) {
    appendRange(text, cursor, Math.min(range.end, cursor + maxChars), range.path, range.sectionStart, chunks);
  }
  return chunks;
}

function mergePieces(text: string, pieces: ChunkRange[], targetTokens: number, maxTokens: number): ChunkRange[] {
  const chunks: ChunkRange[] = [];
  let current: ChunkRange | null = null;
  for (const piece of pieces) {
    if (current === null) {
      current = piece;
    } else if (canMerge(text, current, piece, targetTokens, maxTokens)) {
      current = { start: current.start, end: piece.end, path: current.path, sectionStart: current.sectionStart };
    } else {
      chunks.push(current);
      current = piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function canMerge(text: string, current: ChunkRange, next: ChunkRange, targetTokens: number, maxTokens: number): boolean {
  const candidate = text.substring(current.start, next.end);
  const currentTokens = estimateTokens(text.substring(current.start, current.end));
  return estimateTokens(candidate) <= targetTokens ||
    (currentTokens < targetTokens && estimateTokens(candidate) <= maxTokens);
}

function buildChunkResults(text: string, ranges: ChunkRange[], overlapTokens: number): ChunkResult[] {
  const chunks: ChunkResult[] = [];
  for (const range of ranges) {
    const start = chunks.length === 0 ? range.start : overlapStart(range.start, range.sectionStart, overlapTokens);
    const trimmed = trimRange(text, start, range.end);
    if (trimmed) {
      chunks.push({
        text: text.substring(trimmed.start, trimmed.end),
        charStart: trimmed.start,
        charEnd: trimmed.end,
        sectionPath: range.path,
        chunkStrategy: STRATEGY,
      });
    }
  }
  return chunks;
}

function overlapStart(start: number, sectionStart: number, overlapTokens: number): number {
  if (overlapTokens <= 0) return start;
  return Math.max(sectionStart, start - overlapTokens * CHARS_PER_TOKEN);
}

function trimRange(text: string, start: number, end: number): Range | null {
  let s = Math.max(0, start);
  let e = Math.min(text.length, end);
  while (s < e && /\s/.test(text[s])) s++;
  while (e > s && /\s/.test(text[e - 1])) e--;
  return s < e ? { start: s, end: e } : null;
}

function appendRange(text: string, start: number, end: number, path: string, sectionStart: number, ranges: ChunkRange[]): void {
  const range = trimRange(text, start, end);
  if (range) ranges.push({ start: range.start, end: range.end, path, sectionStart });
}

function isSentenceBoundary(char: string): boolean {
  return '。！？；!?;'.includes(char);
}

function estimateTokens(text: string): number {
  return Math.max(1, text.length);
}
