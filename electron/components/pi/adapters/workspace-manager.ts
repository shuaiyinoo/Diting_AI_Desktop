/**
 * Agent 工作区管理器
 *
 * 移植自 Proma 的 agent-workspace-manager.ts。
 * 管理工作区的 CRUD、MCP 配置、Skills 同步。
 */

import { logger } from 'ee-core/log'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  readdirSync,
} from 'fs'
import { join } from 'path'
import {
  getAgentWorkspacesDir,
  getAgentWorkspacesIndexPath,
  getAgentWorkspacePath,
  getWorkspaceSkillsDir,
  getInactiveSkillsDir,
  getWorkspaceMcpPath,
  getWorkspaceClaudeMdPath,
  getProjectFilesPath,
} from '../config-paths'
import { copyDefaultSkillsToWorkspace } from '../skills/skills-manager'
import type { AgentSessionMeta } from '../types'

/** 工作区元数据 */
export interface WorkspaceMeta {
  id: string
  slug: string
  name: string
  description?: string
  /** 项目根目录路径（空白项目为空） */
  projectPath?: string
  /** 是否为空白项目（使用 Proma 托管项目根） */
  isBlank?: boolean
  createdAt: number
  updatedAt: number
}

/** 读取工作区索引 */
function readWorkspaceIndex(): WorkspaceMeta[] {
  const indexPath = getAgentWorkspacesIndexPath()
  if (!existsSync(indexPath)) return []
  try {
    const content = readFileSync(indexPath, 'utf-8')
    return JSON.parse(content) as WorkspaceMeta[]
  } catch (err) {
    logger.warn('[Pi Agent Workspace] 读取工作区索引失败:', err)
    return []
  }
}

/** 写入工作区索引 */
function writeWorkspaceIndex(workspaces: WorkspaceMeta[]): void {
  const indexPath = getAgentWorkspacesIndexPath()
  writeFileSync(indexPath, JSON.stringify(workspaces, null, 2), 'utf-8')
}

/** 生成 slug */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || `workspace-${Date.now()}`
}

/** 确保 slug 唯一 */
function uniqueSlug(name: string, existing: WorkspaceMeta[]): string {
  const base = generateSlug(name)
  let slug = base
  let counter = 1
  while (existing.some((ws) => ws.slug === slug)) {
    slug = `${base}-${counter}`
    counter++
  }
  return slug
}

/** 列出所有工作区 */
export function listWorkspaces(): WorkspaceMeta[] {
  return readWorkspaceIndex().sort((a, b) => b.updatedAt - a.updatedAt)
}

/** 获取单个工作区 */
export function getWorkspace(id: string): WorkspaceMeta | null {
  return readWorkspaceIndex().find((ws) => ws.id === id) ?? null
}

/** 按 slug 获取工作区 */
export function getWorkspaceBySlug(slug: string): WorkspaceMeta | null {
  return readWorkspaceIndex().find((ws) => ws.slug === slug) ?? null
}

/** 创建工作区 */
export function createWorkspace(input: {
  name: string
  description?: string
  projectPath?: string
  isBlank?: boolean
}): WorkspaceMeta {
  const workspaces = readWorkspaceIndex()
  const slug = uniqueSlug(input.name, workspaces)
  const id = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const now = Date.now()

  const workspace: WorkspaceMeta = {
    id,
    slug,
    name: input.name.trim(),
    description: input.description?.trim(),
    projectPath: input.projectPath?.trim() || undefined,
    isBlank: input.isBlank ?? !input.projectPath,
    createdAt: now,
    updatedAt: now,
  }

  // 创建工作区目录结构（以 id 命名，与 name/slug 解耦）
  const wsPath = getAgentWorkspacePath(id)
  mkdirSync(wsPath, { recursive: true })
  mkdirSync(getWorkspaceSkillsDir(id), { recursive: true })
  mkdirSync(getInactiveSkillsDir(id), { recursive: true })

  // 空白项目创建 workspace-files 目录
  if (workspace.isBlank) {
    mkdirSync(getProjectFilesPath(id), { recursive: true })
  }

  // 复制默认 Skills
  copyDefaultSkillsToWorkspace(id)

  // 创建空的 MCP 配置
  if (!existsSync(getWorkspaceMcpPath(id))) {
    writeFileSync(getWorkspaceMcpPath(id), '{}', 'utf-8')
  }

  // 创建 CLAUDE.md
  if (!existsSync(getWorkspaceClaudeMdPath(id))) {
    const claudeMd = `# ${workspace.name}\n\n这是 ${workspace.name} 工作区的项目说明文件。\nAgent 会自动读取此文件获取项目上下文。\n`
    writeFileSync(getWorkspaceClaudeMdPath(id), claudeMd, 'utf-8')
  }

  workspaces.push(workspace)
  writeWorkspaceIndex(workspaces)

  logger.info(`[Pi Agent Workspace] 已创建工作区: ${slug} (${id})`)
  return workspace
}

/** 更新工作区 */
export function updateWorkspace(id: string, input: Partial<Pick<WorkspaceMeta, 'name' | 'description' | 'projectPath'>>): WorkspaceMeta | null {
  const workspaces = readWorkspaceIndex()
  const idx = workspaces.findIndex((ws) => ws.id === id)
  if (idx === -1) return null

  const workspace = workspaces[idx]
  if (input.name !== undefined) workspace.name = input.name.trim()
  if (input.description !== undefined) workspace.description = input.description?.trim()
  if (input.projectPath !== undefined) workspace.projectPath = input.projectPath?.trim() || undefined
  workspace.updatedAt = Date.now()

  workspaces[idx] = workspace
  writeWorkspaceIndex(workspaces)

  logger.info(`[Pi Agent Workspace] 已更新工作区: ${workspace.slug}`)
  return workspace
}

/** 删除工作区 */
export function deleteWorkspace(id: string): boolean {
  const workspaces = readWorkspaceIndex()
  const workspace = workspaces.find((ws) => ws.id === id)
  if (!workspace) return false

  // 删除工作区目录（以 id 命名）
  const wsPath = getAgentWorkspacePath(workspace.id)
  if (existsSync(wsPath)) {
    rmSync(wsPath, { recursive: true, force: true })
  }

  // 从索引中移除
  const filtered = workspaces.filter((ws) => ws.id !== id)
  writeWorkspaceIndex(filtered)

  logger.info(`[Pi Agent Workspace] 已删除工作区: ${workspace.slug}`)
  return true
}

/** 获取工作区 MCP 配置 */
export function getWorkspaceMcpConfig(id: string): Record<string, Record<string, unknown>> {
  const mcpPath = getWorkspaceMcpPath(id)
  if (!existsSync(mcpPath)) return {}
  try {
    const content = readFileSync(mcpPath, 'utf-8')
    return JSON.parse(content) as Record<string, Record<string, unknown>>
  } catch {
    return {}
  }
}

/** 保存工作区 MCP 配置 */
export function saveWorkspaceMcpConfig(id: string, config: Record<string, Record<string, unknown>>): void {
  const mcpPath = getWorkspaceMcpPath(id)
  writeFileSync(mcpPath, JSON.stringify(config, null, 2), 'utf-8')
  logger.info(`[Pi Agent Workspace] 已保存 MCP 配置: ${id}`)
}

/** 获取工作区项目根目录 */
export function getWorkspaceCwd(workspace: WorkspaceMeta): string {
  if (workspace.isBlank) {
    return getProjectFilesPath(workspace.id)
  }
  return workspace.projectPath || getProjectFilesPath(workspace.id)
}
