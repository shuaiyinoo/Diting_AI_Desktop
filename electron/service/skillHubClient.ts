/**
 * skills.sh 公开 API 客户端
 *
 * 封装 skills.sh 的无需认证公开端点：
 *   - GET /api/search?q={query}&limit={n}  搜索 Skills
 *   - GET /api/download/{owner}/{repo}/{slug}  获取 Skill 完整文件列表
 *
 * 所有端点均无需认证，适配 Diting 的 Skills 架构。
 */

import { logger } from 'ee-core/log'

const BASE_URL = 'https://skills.sh'
const FETCH_TIMEOUT = 30000

/** skills.sh 搜索结果项 */
interface SkillsShSearchResult {
  id: string
  skillId: string
  name: string
  installs: number
  source: string
}

/** skills.sh 搜索响应 */
interface SkillsShSearchResponse {
  query: string
  searchType: string
  skills: SkillsShSearchResult[]
}

/** skills.sh 下载文件 */
interface SkillsShFile {
  path: string
  contents: string
}

/** skills.sh 下载响应 */
interface SkillsShDownloadResponse {
  files: SkillsShFile[] | null
  hash: string | null
}

/** 统一的 Skill 摘要信息 */
export interface SkillSummary {
  id: string
  name: string
  slug: string
  source: string
  installs: number
  repo_url: string
}

/** 统一的 Skill 详情信息 */
export interface SkillDetail {
  id: string
  name: string
  slug: string
  source: string
  installs: number
  files: SkillsShFile[]
  hash: string | null
  skill_md_raw: string | null
}

/**
 * 从 skills.sh id 中解析出 slug
 * id 格式："owner/repo/skill-slug" → slug = "skill-slug"
 */
function parseSlug(id: string): string {
  const parts = id.split('/')
  return parts[parts.length - 1] || id
}

/**
 * 从 source 中构建 repo_url
 * source 格式："owner/repo" → "https://github.com/owner/repo"
 */
function buildRepoUrl(source: string): string {
  return `https://github.com/${source}`
}

/**
 * 从 skills.sh 下载响应中提取 SKILL.md 内容
 */
function extractSkillMd(files: SkillsShFile[]): string | null {
  // 优先查找根目录的 SKILL.md
  const skillMd = files.find((f) => f.path === 'SKILL.md')
  if (skillMd) return skillMd.contents

  // 其次查找任意层级的 SKILL.md
  const anySkillMd = files.find((f) => f.path.endsWith('SKILL.md'))
  return anySkillMd?.contents ?? null
}

/**
 * 搜索 Skills
 */
export async function searchSkills(query: string, limit = 20): Promise<SkillSummary[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  const url = `${BASE_URL}/api/search?${params.toString()}`

  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) })
  if (!res.ok) {
    throw new Error(`搜索失败: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as SkillsShSearchResponse
  return (data.skills || []).map((s) => ({
    id: s.id,
    name: s.name,
    slug: parseSlug(s.id),
    source: s.source,
    installs: s.installs,
    repo_url: buildRepoUrl(s.source),
  }))
}

/**
 * 获取热门 Skills（通过通用关键词搜索）
 */
export async function getPopularSkills(limit = 100): Promise<SkillSummary[]> {
  // 用通用关键词 "skill" 搜索，结果按 installs 排序
  const results = await searchSkills('skill', limit)
  // 按 installs 降序排列
  return results.sort((a, b) => b.installs - a.installs)
}

/**
 * 获取 Skill 详情（含完整文件列表和 SKILL.md 内容）
 *
 * 调用 /api/download/{owner}/{repo}/{slug} 端点，
 * 返回所有文件的路径和内容。
 */
export async function getSkillDetail(skillId: string): Promise<SkillDetail> {
  // skillId 格式："owner/repo/slug"
  const parts = skillId.split('/')
  if (parts.length < 3) {
    throw new Error(`无效的 skill id: ${skillId}`)
  }

  const owner = parts[0]
  const repo = parts[1]
  const slug = parts.slice(2).join('/')

  const url = `${BASE_URL}/api/download/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(slug)}`

  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) })
  if (!res.ok) {
    throw new Error(`获取详情失败: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as SkillsShDownloadResponse
  const files = data.files || []
  const skillMdRaw = extractSkillMd(files)

  if (files.length === 0) {
    logger.warn(`[SkillsSh] 下载返回空文件列表: ${skillId}`)
  }

  return {
    id: skillId,
    name: slug,
    slug,
    source: `${owner}/${repo}`,
    installs: 0,
    files,
    hash: data.hash,
    skill_md_raw: skillMdRaw,
  }
}

/**
 * 下载 Skill 的完整文件列表（用于安装）
 *
 * 返回 skills.sh /api/download 端点的原始文件数组。
 */
export async function downloadSkillFiles(skillId: string): Promise<{ files: SkillsShFile[]; hash: string | null }> {
  const detail = await getSkillDetail(skillId)
  return { files: detail.files, hash: detail.hash }
}

// ========== Topics ==========

/** Topic 信息 */
export interface TopicInfo {
  slug: string
  title: string
  description: string
  skillCount: number
  /** 该 topic 下的 skill ID 列表（格式: owner/repo/slug） */
  skillIds: string[]
}

/**
 * skills.sh 的 Topic 列表（从官方页面提取）
 *
 * skills.sh 没有公开的 topic API 端点，
 * 此数据从 https://skills.sh/topic 页面提取，定期同步。
 */
const TOPICS: TopicInfo[] = [
  {
    slug: 'react',
    title: 'Frontend & React',
    description: 'Performance rules, component patterns, and ecosystem knowledge for production-quality React.',
    skillCount: 6,
    skillIds: [
      'vercel-labs/agent-skills/vercel-react-best-practices',
      'vercel-labs/agent-skills/vercel-composition-patterns',
      'shadcn/ui/shadcn',
      'anthropics/skills/webapp-testing',
      'wshobson/agents/typescript-advanced-types',
      'wshobson/agents/tailwind-design-system',
    ],
  },
  {
    slug: 'nextjs',
    title: 'Next.js',
    description: 'App Router, server components, caching APIs, and Vercel deployment patterns kept current.',
    skillCount: 7,
    skillIds: [
      'vercel-labs/agent-skills/vercel-react-best-practices',
      'vercel-labs/agent-skills/vercel-composition-patterns',
      'vercel-labs/next-skills/next-best-practices',
      'vercel-labs/agent-skills/deploy-to-vercel',
      'vercel-labs/next-skills/next-cache-components',
      'vercel/turborepo/turborepo',
      'vercel/ai/ai-sdk',
    ],
  },
  {
    slug: 'design',
    title: 'Design & UI',
    description: 'Taste and frameworks for polished interfaces — from critique to design tokens.',
    skillCount: 16,
    skillIds: [
      'anthropics/skills/frontend-design',
      'vercel-labs/agent-skills/web-design-guidelines',
      'vercel-labs/agent-skills/vercel-composition-patterns',
      'nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max',
      'sleekdotdesign/agent-skills/sleek-design-mobile-apps',
      'anthropics/skills/canvas-design',
      'pbakaus/impeccable/polish',
      'pbakaus/impeccable/critique',
      'pbakaus/impeccable/bolder',
      'pbakaus/impeccable/delight',
      'pbakaus/impeccable/distill',
      'pbakaus/impeccable/quieter',
      'arvindrk/extract-design-system/extract-design-system',
      'leonxlnx/taste-skill/design-taste-frontend',
      'leonxlnx/taste-skill/high-end-visual-design',
      'emilkowalski/skill/emil-design-eng',
    ],
  },
  {
    slug: 'mobile',
    title: 'Mobile',
    description: 'Expo, React Native, and native platform conventions for real iOS and Android.',
    skillCount: 6,
    skillIds: [
      'expo/skills/react-native',
      'expo/skills/expo-router',
      'expo/skills/expo-design',
      'sleekdotdesign/agent-skills/sleek-design-mobile-apps',
      'anthropics/skills/webapp-testing',
      'vercel-labs/agent-skills/vercel-react-best-practices',
    ],
  },
  {
    slug: 'agent-workflows',
    title: 'Agent workflows',
    description: 'How agents should operate — plan, debug, dispatch subagents, and run autonomous loops.',
    skillCount: 20,
    skillIds: [
      'obra/superpowers/test-driven-development',
      'obra/superpowers/verification-before-completion',
      'obra/superpowers/brainstorming',
      'obra/superpowers/debugging',
      'obra/superpowers/refactoring',
      'obra/superpowers/code-review',
      'obra/superpowers/git-workflow',
      'obra/superpowers/documentation',
      'anthropics/skills/webapp-testing',
      'anthropics/skills/frontend-design',
      'anthropics/skills/canvas-design',
      'vercel-labs/agent-skills/vercel-react-best-practices',
      'vercel-labs/agent-skills/vercel-composition-patterns',
      'vercel-labs/agent-skills/deploy-to-vercel',
      'vercel-labs/agent-skills/web-design-guidelines',
      'wshobson/agents/typescript-advanced-types',
      'wshobson/agents/tailwind-design-system',
      'currents-dev/playwright-best-practices-skill/playwright-best-practices',
      'microsoft/playwright-cli/playwright-cli',
      'vercel/ai/ai-sdk',
    ],
  },
  {
    slug: 'databases',
    title: 'Databases',
    description: 'Postgres, Supabase, Firebase, Neon, and Convex — correct queries, schemas, and migrations.',
    skillCount: 13,
    skillIds: [
      'supabase/skills/supabase',
      'neondatabase/skills/neon',
      'firebase/skills/firebase',
      'convex-dev/skills/convex',
      'prisma/skills/prisma',
      'drizzle-team/skills/drizzle',
      'vercel/ai/ai-sdk',
      'vercel-labs/agent-skills/vercel-react-best-practices',
      'vercel-labs/agent-skills/deploy-to-vercel',
      'wshobson/agents/typescript-advanced-types',
      'anthropics/skills/webapp-testing',
      'obra/superpowers/test-driven-development',
      'obra/superpowers/debugging',
    ],
  },
  {
    slug: 'testing',
    title: 'Testing',
    description: 'TDD loops, Playwright automation, and verification passes — meaningful tests over coverage.',
    skillCount: 5,
    skillIds: [
      'obra/superpowers/test-driven-development',
      'anthropics/skills/webapp-testing',
      'obra/superpowers/verification-before-completion',
      'currents-dev/playwright-best-practices-skill/playwright-best-practices',
      'microsoft/playwright-cli/playwright-cli',
    ],
  },
  {
    slug: 'marketing',
    title: 'Marketing',
    description: 'SEO, copywriting, CRO, and growth — domain expertise carried into every session.',
    skillCount: 21,
    skillIds: [
      'vercel-labs/agent-skills/vercel-react-best-practices',
      'vercel-labs/agent-skills/web-design-guidelines',
      'vercel-labs/agent-skills/vercel-composition-patterns',
      'vercel-labs/agent-skills/deploy-to-vercel',
      'vercel/ai/ai-sdk',
      'anthropics/skills/frontend-design',
      'anthropics/skills/canvas-design',
      'wshobson/agents/tailwind-design-system',
      'wshobson/agents/typescript-advanced-types',
      'pbakaus/impeccable/polish',
      'pbakaus/impeccable/critique',
      'pbakaus/impeccable/bolder',
      'pbakaus/impeccable/delight',
      'pbakaus/impeccable/distill',
      'pbakaus/impeccable/quieter',
      'emilkowalski/skill/emil-design-eng',
      'leonxlnx/taste-skill/design-taste-frontend',
      'leonxlnx/taste-skill/high-end-visual-design',
      'arvindrk/extract-design-system/extract-design-system',
      'nextlevelbuilder/ui-ux-pro-max-skill/ui-ux-pro-max',
      'sleekdotdesign/agent-skills/sleek-design-mobile-apps',
    ],
  },
]

/**
 * 获取 Topic 列表
 *
 * skills.sh 没有 topic API 端点，数据从官方页面提取。
 */
export function getTopics(): TopicInfo[] {
  return TOPICS
}

/**
 * 获取指定 Topic 下的 skill ID 列表
 */
export function getTopicSkillIds(topicSlug: string): string[] {
  const topic = TOPICS.find((t) => t.slug === topicSlug)
  return topic?.skillIds ?? []
}
