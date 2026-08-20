/**
 * GitHub Release 服务
 *
 * 从 GitHub API 获取项目的发布日志（Release Notes）。
 * 参考 Proma 的 github-release-service 架构。
 */

import { logger } from 'ee-core/log';

/** GitHub Release 资源（简化版） */
export interface GitHubRelease {
  /** Release ID */
  id: number;
  /** 标签名（版本号） */
  tag_name: string;
  /** Release 名称 */
  name: string;
  /** 发布说明（Markdown 格式） */
  body: string;
  /** 是否为草稿 */
  draft: boolean;
  /** 是否为预发布版本 */
  prerelease: boolean;
  /** 创建时间 */
  created_at: string;
  /** 发布时间 */
  published_at: string;
  /** Release HTML URL */
  html_url: string;
}

/** GitHub Release 列表查询选项 */
export interface GitHubReleaseListOptions {
  /** 每页数量（默认 10） */
  perPage?: number;
  /** 页码（默认 1） */
  page?: number;
  /** 是否包含草稿和预发布版本（默认 false） */
  includePrerelease?: boolean;
}

/** GitHub API 基础 URL */
const GITHUB_API_BASE = 'https://api.github.com';

/** GitHub 仓库配置（从 electron-builder 配置读取） */
const GITHUB_REPO = {
  owner: 'shuaiyinoo',
  repo: 'Diting_AI_Desktop',
};

/** Release 缓存 */
interface ReleaseCache {
  data: GitHubRelease[];
  timestamp: number;
}

let releaseCache: ReleaseCache | null = null;

/** 单个 Release 缓存（按 tag） */
const tagCache = new Map<string, { data: GitHubRelease; timestamp: number }>();

/** 缓存有效期（30 分钟） */
const CACHE_TTL = 30 * 60 * 1000;

/** Rate limit 冷却标记 */
let rateLimitUntil = 0;

/**
 * 从 GitHub API 获取 releases
 */
async function fetchFromGitHub<T>(endpoint: string): Promise<T> {
  // Rate limit 冷却期内直接跳过
  if (Date.now() < rateLimitUntil) {
    throw new Error('GitHub API 请求过于频繁，请稍后再试');
  }

  const url = `${GITHUB_API_BASE}/repos/${GITHUB_REPO.owner}/${GITHUB_REPO.repo}${endpoint}`;

  logger.info(`[GitHub Release] 正在请求: ${url}`);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Diting-Desktop-App',
    },
  });

  if (response.status === 403 || response.status === 429) {
    // Rate limited — 冷却 15 分钟
    rateLimitUntil = Date.now() + 15 * 60 * 1000;
    throw new Error('GitHub API 请求过于频繁，请 15 分钟后重试');
  }

  if (!response.ok) {
    throw new Error(
      `GitHub API 请求失败 (${response.status})，请检查网络连接后重试`
    );
  }

  return response.json() as Promise<T>;
}

/**
 * 获取最新的 Release
 */
export async function getLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const release = await fetchFromGitHub<GitHubRelease>('/releases/latest');
    logger.info(`[GitHub Release] 获取最新 Release: ${release.tag_name}`);
    return release;
  } catch (error) {
    logger.error('[GitHub Release] 获取最新 Release 失败:', error);
    return null;
  }
}

/**
 * 获取 Release 列表
 */
export async function listReleases(
  options?: GitHubReleaseListOptions,
): Promise<GitHubRelease[]> {
  const perPage = options?.perPage ?? 10;
  const page = options?.page ?? 1;
  const includePrerelease = options?.includePrerelease ?? false;

  // 检查缓存
  const cacheKey = `list_${perPage}_${page}_${includePrerelease}`;
  if (releaseCache && Date.now() - releaseCache.timestamp < CACHE_TTL) {
    return releaseCache.data;
  }

  try {
    const params = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
    });

    const releases = await fetchFromGitHub<GitHubRelease[]>(
      `/releases?${params}`,
    );

    // 过滤草稿和预发布
    const filtered = includePrerelease
      ? releases.filter((r) => !r.draft)
      : releases.filter((r) => !r.draft && !r.prerelease);

    releaseCache = { data: filtered, timestamp: Date.now() };

    logger.info(`[GitHub Release] 获取 Release 列表: ${filtered.length} 条`);
    return filtered;
  } catch (error) {
    logger.error('[GitHub Release] 获取 Release 列表失败:', error);

    // 返回过期缓存
    if (releaseCache) {
      return releaseCache.data;
    }
    return [];
  }
}

/**
 * 根据标签名获取指定的 Release
 */
export async function getReleaseByTag(
  tag: string,
): Promise<GitHubRelease | null> {
  try {
    // 检查缓存
    const cached = tagCache.get(tag);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }

    const release = await fetchFromGitHub<GitHubRelease>(
      `/releases/tags/${tag}`,
    );

    logger.info(`[GitHub Release] 获取 Release: ${tag}`);

    tagCache.set(tag, { data: release, timestamp: Date.now() });
    return release;
  } catch (error) {
    logger.error(`[GitHub Release] 获取 Release ${tag} 失败:`, error);

    // 返回过期缓存
    const cached = tagCache.get(tag);
    if (cached) return cached.data;
    return null;
  }
}

/**
 * 清除缓存
 */
export function clearReleaseCache(): void {
  releaseCache = null;
  tagCache.clear();
  logger.info('[GitHub Release] 缓存已清除');
}
