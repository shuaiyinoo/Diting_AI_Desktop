/**
 * 引用来源组装器
 *
 * 参考 ArgusRAG 的 CitationAssembler 和 EvidenceOverviewAssembler。
 * 将检索返回的证据文档列表转换为：
 *   - 去重后的引用列表（按文件名去重，保留首次命中）
 *   - 证据覆盖概览（按文档聚合，含检索来源和切片摘要）
 */

import type {
  Citation,
  DocumentEvidenceGroup,
  EvidenceDocument,
  EvidenceOverview,
  EvidenceSnippet,
} from '../types';

const SNIPPET_MAX_LENGTH = 180;
const DEFAULT_COVERAGE_MODE = 'RELEVANCE_ONLY';

/**
 * 将检索文档列表组装为去重后的引用来源列表。
 *
 * 按文件名去重，保留每个文件的第一次命中，保持插入顺序。
 */
export function assembleCitations(documents: EvidenceDocument[]): Citation[] {
  if (!documents || documents.length === 0) return [];
  const citationsByFileName = new Map<string, Citation>();
  for (const doc of documents) {
    const fileName = doc.metadata.fileName;
    if (!fileName) continue;
    if (citationsByFileName.has(fileName)) continue;
    citationsByFileName.set(fileName, {
      fileItemId: doc.metadata.fileItemId,
      chunkId: doc.metadata.chunkId,
      chunkIndex: doc.metadata.chunkIndex,
      fileName,
      score: doc.metadata.score,
      snippet: summarize(doc.text),
    });
  }
  return Array.from(citationsByFileName.values());
}

/**
 * 将检索证据组装成覆盖概览。
 * 供前端解释"本次回答实际看到了哪些内容"。
 */
export function assembleEvidenceOverview(documents: EvidenceDocument[]): EvidenceOverview | null {
  if (!documents || documents.length === 0) return null;

  const coverageMode = readCoverageMode(documents);
  const groups = new Map<string, GroupAccumulator>();
  for (const doc of documents) {
    const fileItemId = doc.metadata.fileItemId;
    const fileName = doc.metadata.fileName || '未知文档';
    const key = fileItemId != null ? `file:${fileItemId}` : `name:${fileName}`;
    const group = groups.get(key) ?? new GroupAccumulator(fileItemId, fileName);
    group.add(toSnippet(doc));
    groups.set(key, group);
  }

  const documentGroups = Array.from(groups.values()).map(g => g.toGroup());
  return {
    documentCount: documentGroups.length,
    evidenceCount: documents.length,
    coverageMode,
    groups: documentGroups,
    warnings: buildWarnings(coverageMode, documentGroups.length),
  };
}

// ═══════════════════════════════════════════
// 辅助
// ═══════════════════════════════════════════

function toSnippet(doc: EvidenceDocument): EvidenceSnippet {
  return {
    evidenceId: doc.metadata.evidenceId,
    chunkId: doc.metadata.chunkId,
    chunkIndex: doc.metadata.chunkIndex,
    score: doc.metadata.score,
    retrievalSource: doc.metadata.retrievalSource,
    snippet: summarize(doc.text),
  };
}

function readCoverageMode(documents: EvidenceDocument[]): string {
  for (const doc of documents) {
    if (doc.metadata.coverageMode) return doc.metadata.coverageMode;
  }
  return DEFAULT_COVERAGE_MODE;
}

function buildWarnings(coverageMode: string, documentCount: number): string[] {
  if (coverageMode === 'DOCUMENT_COVERAGE' && documentCount <= 1) {
    return ['当前问题启用了跨文档覆盖检索，但本次证据仅覆盖 1 个文档。'];
  }
  return [];
}

function summarize(text: string): string | null {
  if (!text) return null;
  const normalized = text
    .replace(/^文件名：[^\n]*\n/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= SNIPPET_MAX_LENGTH) return normalized;
  return normalized.substring(0, SNIPPET_MAX_LENGTH) + '...';
}

class GroupAccumulator {
  private readonly fileItemId: number | null;
  private readonly fileName: string;
  private readonly snippets: EvidenceSnippet[] = [];
  private readonly retrievalSources = new Set<string>();
  private topScore = 0;

  constructor(fileItemId: number | null, fileName: string) {
    this.fileItemId = fileItemId;
    this.fileName = fileName;
  }

  add(snippet: EvidenceSnippet): void {
    this.snippets.push(snippet);
    this.topScore = Math.max(this.topScore, snippet.score);
    this.retrievalSources.add(snippet.retrievalSource);
  }

  toGroup(): DocumentEvidenceGroup {
    return {
      fileItemId: this.fileItemId,
      fileName: this.fileName,
      evidenceCount: this.snippets.length,
      topScore: this.topScore,
      retrievalSources: Array.from(this.retrievalSources),
      snippets: this.snippets,
    };
  }
}
