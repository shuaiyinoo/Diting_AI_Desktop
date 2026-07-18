/**
 * MiniSearch 关键词全文检索服务
 *
 * 源自 electron-rag/src/keyword-search.ts
 * 替代 Elasticsearch，使用 MiniSearch（进程内全文引擎，BM25 评分）。
 * 自定义中英文混合分词器（中文单字+双字 bigram）。
 */

import MiniSearch from 'minisearch';
import type { Options as MiniSearchOptions } from 'minisearch';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readFile as readFileAsync, writeFile as writeFileAsync } from 'node:fs/promises';
import type { KeywordHit } from '../types';

const SCORE_REFERENCE = 100;

const MINISEARCH_OPTIONS: MiniSearchOptions = {
  idField: 'chunkId',
  fields: ['chunkText', 'fileName'],
  storeFields: ['fileItemId', 'chunkId', 'chunkIndex', 'folderId', 'fileName', 'chunkText', 'status'],
  tokenize: (text: string) => {
    const tokens: string[] = [];
    const segments = text.match(/[a-zA-Z]+|[\u4e00-\u9fff]+|[0-9]+/g) || [];
    for (const segment of segments) {
      if (/[a-zA-Z]+/.test(segment)) {
        tokens.push(segment.toLowerCase());
      } else if (/[\u4e00-\u9fff]+/.test(segment)) {
        for (let i = 0; i < segment.length; i++) {
          tokens.push(segment[i]);
          if (i + 1 < segment.length) {
            tokens.push(segment.substring(i, i + 2));
          }
        }
      } else {
        tokens.push(segment);
      }
    }
    return tokens;
  },
  searchOptions: {
    boost: { fileName: 2, chunkText: 1 },
    prefix: true,
    fuzzy: 0.2,
  },
};

export interface ChunkIndexItem {
  fileItemId: number;
  chunkId: number;
  chunkIndex: number;
  folderId: number;
  fileName: string;
  chunkText: string;
  status?: string;
}

export class KeywordSearchService {
  private miniSearch: MiniSearch<any>;

  constructor() {
    this.miniSearch = new MiniSearch(MINISEARCH_OPTIONS as any);
  }

  static loadFromFile(filePath: string): KeywordSearchService {
    const service = new KeywordSearchService();
    if (existsSync(filePath)) {
      const json = readFileSync(filePath, 'utf-8');
      service.miniSearch = MiniSearch.loadJSON(json, MINISEARCH_OPTIONS as any);
    }
    return service;
  }

  /**
   * 异步从文件加载 MiniSearch 索引（推荐使用，不会阻塞事件循环）
   */
  static async loadFromFileAsync(filePath: string): Promise<KeywordSearchService> {
    const service = new KeywordSearchService();
    if (existsSync(filePath)) {
      const json = await readFileAsync(filePath, 'utf-8');
      service.miniSearch = MiniSearch.loadJSON(json, MINISEARCH_OPTIONS as any);
    }
    return service;
  }

  saveToFile(filePath: string): void {
    writeFileSync(filePath, JSON.stringify(this.miniSearch), 'utf-8');
  }

  /**
   * 异步保存 MiniSearch 索引到文件（推荐使用，不会阻塞事件循环）
   */
  async saveToFileAsync(filePath: string): Promise<void> {
    await writeFileAsync(filePath, JSON.stringify(this.miniSearch), 'utf-8');
  }

  indexReadyChunks(_fileName: string, chunks: ChunkIndexItem[]): void {
    if (!chunks || chunks.length === 0) return;
    for (const chunk of chunks) {
      this.miniSearch.add({
        id: chunk.chunkId,
        fileItemId: chunk.fileItemId,
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        folderId: chunk.folderId,
        fileName: chunk.fileName,
        chunkText: chunk.chunkText,
        status: chunk.status ?? 'READY',
      });
    }
  }

  /**
   * 按一组 chunkId 批量删除 MiniSearch 中的切片索引
   *
   * @param chunkIds 要删除的切片 ID 列表
   */
  deleteDocumentChunks(chunkIds: number[]): void {
    if (!chunkIds || chunkIds.length === 0) return;
    for (const id of chunkIds) {
      try {
        this.miniSearch.discard(id);
      } catch {
        // ID 不存在时忽略
      }
    }
  }

  removeAll(): void {
    this.miniSearch.removeAll();
  }

  get documentCount(): number {
    return this.miniSearch.documentCount;
  }

  search(folderId: number, query: string, topK: number = 50): KeywordHit[] {
    if (folderId == null || folderId <= 0 || !query?.trim() || topK <= 0) return [];
    const results = this.miniSearch.search(query.trim(), {
      fields: ['chunkText', 'fileName'],
      boost: { fileName: 2, chunkText: 1 },
      prefix: true,
      fuzzy: 0.2,
      filter: (result) => {
        const stored = result as unknown as Record<string, unknown>;
        return stored.folderId === folderId && stored.status === 'READY';
      },
    }).slice(0, topK);
    return results.map((result) => {
      const r = result as unknown as Record<string, unknown>;
      return {
        fileItemId: (r.fileItemId as number) ?? 0,
        chunkId: (r.chunkId as number) ?? 0,
        chunkIndex: (r.chunkIndex as number) ?? 0,
        fileName: (r.fileName as string) ?? '',
        chunkText: (r.chunkText as string) ?? '',
        rawScore: result.score,
        normalizedScore: this.normalizeKeywordScore(result.score),
      };
    });
  }

  private normalizeKeywordScore(rawScore: number): number {
    if (rawScore <= 0) return 0;
    return Math.min(1, Math.log1p(rawScore) / Math.log1p(SCORE_REFERENCE));
  }
}
