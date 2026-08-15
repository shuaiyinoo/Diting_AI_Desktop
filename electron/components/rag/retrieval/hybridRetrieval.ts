/**
 * 混合检索服务（RRF 双路融合）
 *
 * 参考 ArgusRAG 的 HybridChunkRetrievalService，适配本地项目的资源结构：
 *   - 向量检索：zvec collection（通过 searchVectors）
 *   - 关键词检索：MiniSearch（通过 KeywordSearchService.search）
 *   - 融合算法：RRF（Reciprocal Rank Fusion，k=0）
 *   - 评分归一化：指数饱和函数 1 - e^(-x)，映射到 [0, 1)
 *
 * 支持双来源检索：
 *   - FILE 来源：文件模块向量化文档
 *   - INVOICE 来源：OCR 票据归档向量化文档
 * 两种来源的数据在同一个向量库和关键词索引中，检索时自动融合。
 *
 * 检索流程：
 *   1. 双通道检索（向量 + 关键词）
 *   2. RRF 融合排序
 *   3. 按 topK 截取
 *   4. 从 SQLite 拉取切片文本，组装证据文档
 *   5. 对 INVOICE 来源附加票据元数据（类型、发票号、日期、金额）
 *   6. 评估证据充分度等级
 */

import { logger } from 'ee-core/log';
import { ragService } from '../core/ragService';
import { searchVectors } from '../database/vector-store';
import { invoicedbService } from '../../../service/database/invoicedb';
import type {
  EvidenceDocument,
  EvidenceMetadata,
  RetrievalCandidate,
  RetrievalSource,
  RetrievedEvidenceBundle,
  DataSource,
} from '../types';
import { EvidenceLevel } from '../types';

// ═══════════════════════════════════════════
// 常量
// ═══════════════════════════════════════════

/** 每个检索通道返回的最大候选数 */
const CHANNEL_TOP_K = 50;
/**
 * RRF 融合算法的 k 参数。
 * k=0 使排名靠前的切片获得更大权重，配合归一化产出有意义的 0~1 评分。
 */
const RRF_K = 0;
/** 默认返回的检索结果数量 */
const DEFAULT_TOP_K = 5;

// ═══════════════════════════════════════════
// HybridRetrievalService
// ═══════════════════════════════════════════

class HybridRetrievalService {
  /**
   * 执行混合检索，返回包含证据文档和证据等级的完整检索结果。
   *
   * @param folderId 授权文件夹 ID，限定检索范围
   * @param question 用户问题
   * @param topK     返回的最大文档数（默认 5）
   */
  async retrieve(
    folderId: number,
    question: string,
    topK: number = DEFAULT_TOP_K
  ): Promise<RetrievedEvidenceBundle> {
    if (!folderId || folderId <= 0) {
      return emptyBundle();
    }
    return this.doRetrieve(question, topK, folderId);
  }

  /**
   * 全库混合检索（不限定 folderId），供 Agent RAG 模式使用。
   *
   * 当用户未指定知识库分组时，跨所有文件夹搜索，
   * 向量检索结果不做 folderId 过滤，关键词检索使用 searchAll。
   *
   * @param question 用户问题
   * @param topK     返回的最大文档数（默认 5）
   */
  async retrieveAll(
    question: string,
    topK: number = DEFAULT_TOP_K
  ): Promise<RetrievedEvidenceBundle> {
    return this.doRetrieve(question, topK, undefined);
  }

  /**
   * 按数据来源检索（仅检索指定 source 的切片）
   *
   * 用于 Chat 模式下「仅 OCR 归档」选项：
   *   source='INVOICE' 时仅检索 OCR 票据归档的切片，不检索文件模块的切片。
   *
   * @param question 用户问题
   * @param source   数据来源（FILE / INVOICE）
   * @param topK     返回的最大文档数（默认 5）
   */
  async retrieveBySource(
    question: string,
    source: DataSource,
    topK: number = DEFAULT_TOP_K
  ): Promise<RetrievedEvidenceBundle> {
    return this.doRetrieve(question, topK, undefined, source);
  }

  /**
   * 混合检索核心实现。
   *
   * @param question  用户问题
   * @param topK      返回的最大文档数
   * @param folderId  可选，限定检索范围；不传则全库搜索
   * @param sourceFilter 可选，按数据来源过滤（FILE / INVOICE）；不传则不过滤
   */
  private async doRetrieve(
    question: string,
    topK: number,
    folderId?: number,
    sourceFilter?: DataSource
  ): Promise<RetrievedEvidenceBundle> {
    const startNano = process.hrtime.bigint();
    const scopeLabel = folderId
      ? `folderId=${folderId}`
      : sourceFilter
        ? `source=${sourceFilter}`
        : 'ALL';
    const normalizedQuestion = (question || '').trim();
    if (!normalizedQuestion) {
      return emptyBundle();
    }
    const validTopK = topK > 0 ? topK : DEFAULT_TOP_K;

    logger.info(
      `[HybridRetrieval] 检索开始: ${scopeLabel}, topK=${validTopK}, questionLength=${normalizedQuestion.length}`
    );

    // 获取检索资源（确保初始化）
    const ctx = await ragService.getRetrievalContext();

    // ── 双通道检索 ──
    const candidates = new Map<number, RetrievalCandidate>();

    // 向量检索（zvec 不支持 folderId 过滤，取较多候选后按需过滤）
    const vectorHits = await searchVectors(
      ctx.collection,
      ctx.embedder,
      normalizedQuestion,
      CHANNEL_TOP_K
    );
    let filteredVectorHits = folderId
      ? vectorHits.filter(h => h.folderId === folderId)
      : vectorHits;
    // 按来源过滤（仅 OCR 或仅文件）
    if (sourceFilter) {
      filteredVectorHits = filteredVectorHits.filter(h => h.source === sourceFilter);
    }
    filteredVectorHits.forEach((hit, index) => {
      const candidate = candidates.get(hit.chunkId) ?? createCandidate(hit);
      candidate.vectorMatched = true;
      candidate.vectorScore = Math.max(candidate.vectorScore, hit.score);
      candidate.rankingScore += reciprocalRank(index + 1);
      candidates.set(hit.chunkId, candidate);
    });

    // 关键词检索（MiniSearch 支持 folderId 过滤）
    let keywordHits = folderId
      ? ctx.kwService.search(folderId, normalizedQuestion, CHANNEL_TOP_K)
      : ctx.kwService.searchAll(normalizedQuestion, CHANNEL_TOP_K);
    // 按来源过滤
    if (sourceFilter) {
      keywordHits = keywordHits.filter(h => h.source === sourceFilter);
    }
    keywordHits.forEach((hit, index) => {
      const candidate = candidates.get(hit.chunkId) ?? createCandidateFromKeyword(hit);
      candidate.keywordMatched = true;
      candidate.keywordScore = Math.max(candidate.keywordScore, hit.normalizedScore);
      candidate.rankingScore += reciprocalRank(index + 1);
      candidates.set(hit.chunkId, candidate);
    });

    const vectorHitCount = Array.from(candidates.values()).filter(c => c.vectorMatched).length;
    const keywordHitCount = Array.from(candidates.values()).filter(c => c.keywordMatched).length;
    logger.info(
      `[HybridRetrieval] 双路检索完成: ${scopeLabel}, candidates=${candidates.size}, vectorHits=${vectorHitCount}, keywordHits=${keywordHitCount}`
    );

    if (candidates.size === 0) {
      logElapsed(scopeLabel, startNano, 0, EvidenceLevel.NONE);
      return emptyBundle();
    }

    // ── RRF 融合排序 ──
    const sortedCandidates = Array.from(candidates.values())
      .sort((a, b) => {
        if (b.rankingScore !== a.rankingScore) {
          return b.rankingScore - a.rankingScore;
        }
        return a.chunkId - b.chunkId;
      })
      .slice(0, validTopK);

    // ── 组装证据文档 ──
    const documents: EvidenceDocument[] = [];
    let evidenceIndex = 1;
    for (const candidate of sortedCandidates) {
      // 从 SQLite 拉取切片文本
      const chunkRow = ctx.ragDb.getDatabase().prepare(
        `SELECT chunk_text, chunk_index FROM document_chunks WHERE id = ? LIMIT 1`
      ).get(candidate.chunkId) as { chunk_text: string; chunk_index: number } | undefined;

      if (!chunkRow || !chunkRow.chunk_text) {
        continue;
      }

      const evidenceId = `E${evidenceIndex}`;
      const normalizedScore = normalizeScore(candidate.rankingScore);
      const source = candidateSource(candidate);
      const metadata: EvidenceMetadata = {
        evidenceId,
        fileItemId: candidate.fileItemId,
        folderId: candidate.folderId,
        chunkId: candidate.chunkId,
        chunkIndex: candidate.chunkIndex,
        fileName: candidate.fileName,
        score: normalizedScore,
        retrievalSource: source,
        coverageMode: 'RELEVANCE_ONLY',
        vectorScore: candidate.vectorScore,
        keywordScore: candidate.keywordScore,
        hybridScore: candidate.rankingScore,
        source: candidate.source,
      };

      // 对 INVOICE 来源，附加票据归档特有元数据
      if (candidate.source === 'INVOICE') {
        const record = invoicedbService.getRecordById(candidate.fileItemId);
        if (record) {
          metadata.invoiceNumber = record.invoice_number;
          metadata.typeName = record.type_name;
          metadata.issueDate = record.issue_date;
          metadata.amountTotal = record.amount_total;
        }
      }

      const evidenceText = `文件名：${candidate.fileName}\n${chunkRow.chunk_text.trim()}`;
      documents.push({ evidenceId, text: evidenceText, metadata });
      evidenceIndex++;
    }

    if (documents.length === 0) {
      logElapsed(scopeLabel, startNano, 0, EvidenceLevel.NONE);
      return emptyBundle();
    }

    // ── 评估证据充分度 ──
    const evidenceLevel = evaluateEvidenceLevel(documents);
    const evidenceGuidance = buildEvidenceGuidance(evidenceLevel);

    logElapsed(scopeLabel, startNano, documents.length, evidenceLevel);
    return { documents, evidenceLevel, evidenceGuidance };
  }
}

export const hybridRetrievalService = new HybridRetrievalService();

// ═══════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════

function createCandidate(hit: {
  fileItemId: number;
  chunkId: number;
  chunkIndex: number;
  folderId: number;
  fileName: string;
  score: number;
  source: DataSource;
}): RetrievalCandidate {
  return {
    fileItemId: hit.fileItemId,
    chunkId: hit.chunkId,
    chunkIndex: hit.chunkIndex,
    folderId: hit.folderId,
    fileName: hit.fileName,
    source: hit.source,
    vectorScore: 0,
    keywordScore: 0,
    rankingScore: 0,
    vectorMatched: false,
    keywordMatched: false,
  };
}

function createCandidateFromKeyword(hit: {
  fileItemId: number;
  chunkId: number;
  chunkIndex: number;
  fileName: string;
  normalizedScore: number;
  source: DataSource;
}): RetrievalCandidate {
  return {
    fileItemId: hit.fileItemId,
    chunkId: hit.chunkId,
    chunkIndex: hit.chunkIndex,
    folderId: 0,
    fileName: hit.fileName,
    source: hit.source,
    vectorScore: 0,
    keywordScore: 0,
    rankingScore: 0,
    vectorMatched: false,
    keywordMatched: false,
  };
}

/** 计算 RRF 倒数排名分数：1 / (k + rank) */
function reciprocalRank(rank: number): number {
  return 1 / (RRF_K + Math.max(rank, 1));
}

/**
 * 将原始 RRF 融合评分归一化到 [0, 1) 区间。
 * 使用指数饱和函数 1 - e^(-x)，边际递减、自动适配、渐进逼近 1。
 */
function normalizeScore(rawRrfScore: number): number {
  return 1.0 - Math.exp(-rawRrfScore);
}

/** 获取检索来源：BOTH（双通道）、VECTOR 或 KEYWORD */
function candidateSource(candidate: RetrievalCandidate): RetrievalSource {
  if (candidate.vectorMatched && candidate.keywordMatched) return 'BOTH';
  return candidate.vectorMatched ? 'VECTOR' : 'KEYWORD';
}

/** 评估检索结果的证据充分度等级 */
function evaluateEvidenceLevel(documents: EvidenceDocument[]): EvidenceLevel {
  if (documents.length === 0) return EvidenceLevel.NONE;

  const sources = documents.map(d => d.metadata.retrievalSource);
  const hasBothSource = sources.includes('BOTH');
  const hasVectorEvidence = sources.includes('VECTOR') || sources.includes('BOTH');
  const topScore = Math.max(...documents.map(d => d.metadata.score));

  // 归一化后 score ≥ 0.85 对应双通道 rank-1 或多次高排名命中
  if (documents.length >= 2 && (hasBothSource || (hasVectorEvidence && topScore >= 0.85))) {
    return EvidenceLevel.SUFFICIENT;
  }
  if (hasBothSource || documents.length >= 2) {
    return EvidenceLevel.PARTIAL;
  }
  return EvidenceLevel.WEAK;
}

/** 根据证据等级生成对应的回答指导语 */
function buildEvidenceGuidance(level: EvidenceLevel): string {
  switch (level) {
    case EvidenceLevel.NONE:
      return '当前没有可用证据，必须直接拒答。';
    case EvidenceLevel.WEAK:
      return '当前证据相关性有限，只能谨慎回答，必须明确说明依据有限，不能给出确定性结论。';
    case EvidenceLevel.PARTIAL:
      return '当前证据只覆盖部分问题，只能回答证据明确支持的部分，未覆盖部分必须明确说明不足。';
    case EvidenceLevel.SUFFICIENT:
      return '当前证据较充分，可以正常回答，但仍然不得超出证据进行臆测。';
  }
}

function emptyBundle(): RetrievedEvidenceBundle {
  return {
    documents: [],
    evidenceLevel: EvidenceLevel.NONE,
    evidenceGuidance: buildEvidenceGuidance(EvidenceLevel.NONE),
  };
}

function logElapsed(
  scopeLabel: string,
  startNano: bigint,
  evidenceCount: number,
  level: EvidenceLevel
): void {
  const elapsedMs = Number(process.hrtime.bigint() - startNano) / 1_000_000;
  logger.info(
    `[HybridRetrieval] 检索完成: ${scopeLabel}, evidenceCount=${evidenceCount}, evidenceLevel=${level}, elapsedMs=${elapsedMs.toFixed(1)}`
  );
}
