import type { ServerResponse } from 'http'
import type { Context } from 'koa'
import { dialog } from 'electron'
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, copyFileSync } from 'fs'
import { join, basename } from 'path'
import { logger } from 'ee-core/log'
import { llmdbService } from '../service/database/llmdb'
import {
  seedDefaultSkills,
  upgradeDefaultSkillsInWorkspaces,
  getAllWorkspaceSkills,
  toggleWorkspaceSkill,
  deleteWorkspaceSkill,
  readWorkspaceSkillContent,
  writeWorkspaceSkillContent,
  getDefaultSkillSlugs,
} from '../components/pi/skills/skills-manager'
import { listBuiltinMcpServers } from '../components/pi/builtin-mcp/catalog'
import { setBuiltinMcpUserEnabled } from '../components/pi/builtin-mcp/settings'
import { getBuiltinTools } from '../components/pi/builtin-tools/catalog'
import {
  sendAgentMessage,
  abortSession,
  listSessions,
  createSession,
  updateSession,
  deleteSession,
  getSessionMessages,
  respondPermission,
  respondAskUser,
} from '../components/pi/adapters/pi-agent-service'
import {
  listWorkspaces,
  getWorkspace,
  getWorkspaceBySlug,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
} from '../components/pi/adapters/workspace-manager'
import {
  getAgentWorkspacePath,
  getWorkspaceClaudeMdPath,
  getProjectFilesPath,
} from '../components/pi/config-paths'
import type { AgentChannel } from '../components/pi/types'

/**
 * Pi Agent 控制器
 *
 * 提供 Agent 模式的 IPC 和 HTTP SSE 接口：
 *   - skillsOperation：Skills 管理（列表/切换/删除/读取/写入）
 *   - mcpOperation：内置 MCP 管理（列表/切换）
 *   - streamAgent：Agent 流式对话（SSE）
 *   - sessionOperation：Agent 会话管理
 *   - workspaceOperation：工作区管理
 */
class PiAgentController {
  /**
   * Skills 管理（列表/切换/删除/读取内容/写入内容）。
   */
  async skillsOperation(args: {
    action: 'list' | 'toggle' | 'delete' | 'read' | 'write' | 'defaultSlugs'
    workspaceSlug?: string
    skillSlug?: string
    enabled?: boolean
    content?: string
  }): Promise<{ code: number; message?: string; data?: unknown }> {
    try {
      switch (args.action) {
        case 'list': {
          if (!args.workspaceSlug) return { code: -1, message: '缺少 workspaceSlug' }
          const skills = getAllWorkspaceSkills(args.workspaceSlug)
          return { code: 0, data: skills }
        }
        case 'toggle': {
          if (!args.workspaceSlug || !args.skillSlug || args.enabled === undefined) {
            return { code: -1, message: '缺少必要参数' }
          }
          toggleWorkspaceSkill(args.workspaceSlug, args.skillSlug, args.enabled)
          const skills = getAllWorkspaceSkills(args.workspaceSlug)
          return { code: 0, data: skills }
        }
        case 'delete': {
          if (!args.workspaceSlug || !args.skillSlug) {
            return { code: -1, message: '缺少必要参数' }
          }
          deleteWorkspaceSkill(args.workspaceSlug, args.skillSlug)
          return { code: 0, message: '删除成功' }
        }
        case 'read': {
          if (!args.workspaceSlug || !args.skillSlug) {
            return { code: -1, message: '缺少必要参数' }
          }
          const content = readWorkspaceSkillContent(args.workspaceSlug, args.skillSlug)
          return { code: 0, data: content }
        }
        case 'write': {
          if (!args.workspaceSlug || !args.skillSlug || args.content === undefined) {
            return { code: -1, message: '缺少必要参数' }
          }
          writeWorkspaceSkillContent(args.workspaceSlug, args.skillSlug, args.content)
          return { code: 0, message: '保存成功' }
        }
        case 'defaultSlugs': {
          return { code: 0, data: getDefaultSkillSlugs() }
        }
        default:
          return { code: -1, message: `未知操作: ${args.action}` }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[PiAgentController] skillsOperation 异常:', err)
      return { code: -1, message: msg }
    }
  }

  /**
   * 内置 MCP 管理（列表/切换）。
   */
  async mcpOperation(args: {
    action: 'list' | 'toggle'
    id?: string
    enabled?: boolean
    workspaceSlug?: string
  }): Promise<{ code: number; message?: string; data?: unknown }> {
    try {
      switch (args.action) {
        case 'list': {
          const servers = listBuiltinMcpServers({ workspaceSlug: args.workspaceSlug })
          return { code: 0, data: servers }
        }
        case 'toggle': {
          if (!args.id || args.enabled === undefined) {
            return { code: -1, message: '缺少 id 或 enabled' }
          }
          setBuiltinMcpUserEnabled(args.id, args.enabled)
          const servers = listBuiltinMcpServers({ workspaceSlug: args.workspaceSlug })
          return { code: 0, data: servers }
        }
        default:
          return { code: -1, message: `未知操作: ${args.action}` }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[PiAgentController] mcpOperation 异常:', err)
      return { code: -1, message: msg }
    }
  }

  /**
   * 初始化 Skills（应用启动时调用）。
   */
  async initSkills(): Promise<{ code: number; message?: string }> {
    try {
      seedDefaultSkills()
      upgradeDefaultSkillsInWorkspaces()
      return { code: 0, message: 'Skills 初始化完成' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[PiAgentController] initSkills 异常:', err)
      return { code: -1, message: msg }
    }
  }

  /**
   * 内置 Tools 管理（列表）。
   */
  async toolsOperation(args: {
    action: 'list'
  }): Promise<{ code: number; data?: unknown; message?: string }> {
    try {
      switch (args.action) {
        case 'list': {
          const tools = getBuiltinTools()
          return { code: 0, data: tools }
        }
        default:
          return { code: -1, message: `未知操作: ${args.action}` }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[PiAgentController] toolsOperation 异常:', err)
      return { code: -1, message: msg }
    }
  }

  /**
   * Agent 流式对话：通过 HTTP SSE 推送。
   *
   * SSE 事件类型：
   *   - start：流开始
   *   - text：文本片段
   *   - tool_start：工具调用开始
   *   - tool_result：工具调用结果
   *   - complete：流完成
   *   - error：错误
   */
  async streamAgent(
    args: {
      sessionId: string
      message: string
      channelId?: string
      modelId?: string
      workspaceSlug?: string
      permissionMode?: string
    },
    ctx: Context,
  ): Promise<{ code: number; message?: string }> {
    if (!args || !args.sessionId) {
      return { code: -1, message: 'sessionId 不能为空' }
    }
    if (!args.message || !args.message.trim()) {
      return { code: -1, message: '消息内容不能为空' }
    }

    const res = (ctx as Context & { res?: ServerResponse }).res
    if (!res || typeof res.write !== 'function') {
      return { code: -1, message: 'streamAgent 仅支持 HTTP SSE 模式' }
    }

    // 设置 SSE 响应头
    res.statusCode = 200
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    ;(ctx as Context & { respond?: boolean }).respond = false

    let clientDisconnected = false
    const onClose = () => {
      clientDisconnected = true
      abortSession(args.sessionId)
      logger.info('[PiAgentController] streamAgent 客户端断开连接')
    }
    res.on('close', onClose)

    // 从数据库加载已启用的 LLM 模型，构建渠道信息
    const enabledModel = llmdbService.getEnabledModel()
    if (!enabledModel) {
      if (!res.writableEnded) {
        this.writeSseEvent(res, 'error', {
          sessionId: args.sessionId,
          error: '未启用任何 LLM 模型，请先在设置中启用模型',
        })
        res.end()
      }
      return { code: -1, message: '未启用任何 LLM 模型' }
    }

    const channel: AgentChannel = {
      id: args.channelId || 'default',
      name: enabledModel.name || 'Agent Channel',
      provider: enabledModel.provider || 'openai',
      modelId: args.modelId || enabledModel.model_name,
      apiKey: enabledModel.api_key || '',
      baseUrl: enabledModel.base_url || '',
      enabled: true,
    }

    // 获取工作区（前端传递的是 slug）
    const workspace = args.workspaceSlug ? getWorkspaceBySlug(args.workspaceSlug) : undefined

    try {
      await sendAgentMessage(
        {
          sessionId: args.sessionId,
          message: args.message,
          channelId: args.channelId,
          workspaceId: workspace?.id,
          agentRuntime: 'pi',
          permissionMode: args.permissionMode || 'ask',
        },
        channel,
        workspace,
        (event, data) => {
          if (!clientDisconnected && !res.writableEnded) {
            this.writeSseEvent(res, event, data)
          }
        },
      )

      if (!res.writableEnded) {
        res.end()
      }
      return { code: 0 }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[PiAgentController] streamAgent 异常:', err)
      if (!res.writableEnded) {
        if (!res.headersSent) {
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
        }
        this.writeSseEvent(res, 'error', {
          sessionId: args.sessionId,
          error: msg,
        })
        res.end()
      }
      return { code: -1, message: msg }
    } finally {
      res.removeListener('close', onClose)
    }
  }

  /**
   * 响应权限请求（前端 HTTP POST 调用）。
   *
   * 用户在 PermissionBanner 中点击允许/拒绝后，前端通过 HTTP POST 调用此端点，
   * 后端将结果传递给 permissionService，resolve 对应的 Promise，工具继续执行。
   */
  async respondPermission(args: {
    requestId: string
    behavior: 'allow' | 'deny'
    alwaysAllow?: boolean
  }): Promise<{ code: number; message?: string }> {
    try {
      const sessionId = respondPermission({
        requestId: args.requestId,
        behavior: args.behavior,
        alwaysAllow: args.alwaysAllow ?? false,
      })
      if (!sessionId) {
        return { code: -1, message: '权限请求不存在或已过期' }
      }
      return { code: 0, message: '权限请求已响应' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[PiAgentController] respondPermission 异常:', err)
      return { code: -1, message: msg }
    }
  }

  /**
   * 响应 AskUser 请求（前端 HTTP POST 调用）。
   *
   * 用户在 AskUserBanner 中提交答案后，前端通过 HTTP POST 调用此端点，
   * 后端将答案传递给 permissionService，resolve 对应的 Promise，工具返回结果。
   */
  async respondAskUser(args: {
    requestId: string
    answers: Record<string, string>
  }): Promise<{ code: number; message?: string }> {
    try {
      const sessionId = respondAskUser({
        requestId: args.requestId,
        answers: args.answers,
      })
      if (!sessionId) {
        return { code: -1, message: 'AskUser 请求不存在或已过期' }
      }
      return { code: 0, message: 'AskUser 请求已响应' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[PiAgentController] respondAskUser 异常:', err)
      return { code: -1, message: msg }
    }
  }

  /**
   * Agent 会话管理（创建/列表/删除/更新）。
   */
  async sessionOperation(args: {
    action: 'create' | 'list' | 'delete' | 'update' | 'getMessages'
    sessionId?: string
    title?: string
    channelId?: string
    workspaceId?: string
  }): Promise<{ code: number; message?: string; data?: unknown }> {
    try {
      switch (args.action) {
        case 'create': {
          const session = createSession({
            title: args.title,
            channelId: args.channelId,
            workspaceId: args.workspaceId,
          })
          return { code: 0, data: session }
        }
        case 'list': {
          const sessions = listSessions()
          return { code: 0, data: sessions }
        }
        case 'update': {
          if (!args.sessionId) return { code: -1, message: '缺少 sessionId' }
          // 只传递显式提供的字段，避免 undefined 覆盖已有值
          const updateInput: Partial<{ title: string; channelId: string; workspaceId: string }> = {}
          if (args.title !== undefined) updateInput.title = args.title
          if (args.channelId !== undefined) updateInput.channelId = args.channelId
          if (args.workspaceId !== undefined) updateInput.workspaceId = args.workspaceId
          const session = updateSession(args.sessionId, updateInput)
          if (!session) return { code: -1, message: '会话不存在' }
          return { code: 0, data: session }
        }
        case 'delete': {
          if (!args.sessionId) return { code: -1, message: '缺少 sessionId' }
          const success = deleteSession(args.sessionId)
          return success ? { code: 0, message: '删除成功' } : { code: -1, message: '会话不存在' }
        }
        case 'getMessages': {
          if (!args.sessionId) return { code: -1, message: '缺少 sessionId' }
          const messages = getSessionMessages(args.sessionId)
          return { code: 0, data: messages }
        }
        default:
          return { code: -1, message: `未知操作: ${args.action}` }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[PiAgentController] sessionOperation 异常:', err)
      return { code: -1, message: msg }
    }
  }

  /**
   * 工作区管理（创建/列表/删除/更新/获取）。
   */
  async workspaceOperation(args: {
    action: 'create' | 'list' | 'delete' | 'update' | 'get'
    id?: string
    name?: string
    description?: string
    projectPath?: string
    isBlank?: boolean
  }): Promise<{ code: number; message?: string; data?: unknown }> {
    try {
      switch (args.action) {
        case 'create': {
          if (!args.name) return { code: -1, message: '缺少 name' }
          const workspace = createWorkspace({
            name: args.name,
            description: args.description,
            projectPath: args.projectPath,
            isBlank: args.isBlank,
          })
          return { code: 0, data: workspace }
        }
        case 'list': {
          const workspaces = listWorkspaces()
          return { code: 0, data: workspaces }
        }
        case 'get': {
          if (!args.id) return { code: -1, message: '缺少 id' }
          const workspace = getWorkspace(args.id)
          if (!workspace) return { code: -1, message: '工作区不存在' }
          return { code: 0, data: workspace }
        }
        case 'update': {
          if (!args.id) return { code: -1, message: '缺少 id' }
          const workspace = updateWorkspace(args.id, {
            name: args.name,
            description: args.description,
            projectPath: args.projectPath,
          })
          if (!workspace) return { code: -1, message: '工作区不存在' }
          return { code: 0, data: workspace }
        }
        case 'delete': {
          if (!args.id) return { code: -1, message: '缺少 id' }
          const success = deleteWorkspace(args.id)
          return success ? { code: 0, message: '删除成功' } : { code: -1, message: '工作区不存在' }
        }
        default:
          return { code: -1, message: `未知操作: ${args.action}` }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[PiAgentController] workspaceOperation 异常:', err)
      return { code: -1, message: msg }
    }
  }

  /**
   * 记忆文件管理（列表/读取/写入）。
   * 管理工作区中的 CLAUDE.md、Memory 等记忆文件。
   */
  async memoryOperation(args: {
    action: 'list' | 'read' | 'write'
    workspaceSlug?: string
    filePath?: string
    content?: string
  }): Promise<{ code: number; message?: string; data?: unknown }> {
    try {
      const slug = args.workspaceSlug || 'default'
      const wsPath = getAgentWorkspacePath(slug)

      switch (args.action) {
        case 'list': {
          const files = this.scanMemoryFiles(wsPath, '')
          return { code: 0, data: { files, basePath: wsPath } }
        }
        case 'read': {
          if (!args.filePath) return { code: -1, message: '缺少 filePath' }
          const fullPath = join(wsPath, args.filePath)
          if (!existsSync(fullPath)) return { code: -1, message: '文件不存在' }
          const content = readFileSync(fullPath, 'utf-8')
          return { code: 0, data: content }
        }
        case 'write': {
          if (!args.filePath || args.content === undefined) {
            return { code: -1, message: '缺少 filePath 或 content' }
          }
          const fullPath = join(wsPath, args.filePath)
          // 确保目录存在
          const dir = join(fullPath, '..')
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
          writeFileSync(fullPath, args.content, 'utf-8')
          return { code: 0, message: '保存成功' }
        }
        default:
          return { code: -1, message: `未知操作: ${args.action}` }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[PiAgentController] memoryOperation 异常:', err)
      return { code: -1, message: msg }
    }
  }

  /**
   * 文件面板管理（列文件/添加文件）。
   *
   * - list：列出项目文件或会话文件
   * - add：弹窗选择文件并复制到项目文件目录
   */
  async fileOperation(args: {
    action: 'list' | 'add'
    workspaceId?: string
    sessionId?: string
    mode?: 'project' | 'session'
  }): Promise<{ code: number; message?: string; data?: unknown }> {
    try {
      const mode = args.mode || 'project'

      switch (args.action) {
        case 'list': {
          if (mode === 'project') {
            if (!args.workspaceId) return { code: -1, message: '缺少 workspaceId' }
            const workspace = getWorkspace(args.workspaceId)
            if (!workspace) return { code: -1, message: '工作区不存在' }

            // 本地项目：列出 projectPath 下的文件
            // 空白项目：列出 workspace-files 目录下的文件
            const targetDir = workspace.isBlank
              ? getProjectFilesPath(workspace.id)
              : (workspace.projectPath || getProjectFilesPath(workspace.id))

            const files = this.listFilesRecursive(targetDir, '')
            return { code: 0, data: files }
          } else {
            // 会话文件模式：列出会话工作目录下的文件
            if (!args.sessionId) return { code: -1, message: '缺少 sessionId' }
            const sessionDir = join(getAgentWorkspacePath(args.workspaceId || ''), args.sessionId)
            if (!existsSync(sessionDir)) return { code: 0, data: [] }
            const files = this.listFilesRecursive(sessionDir, '')
            return { code: 0, data: files }
          }
        }

        case 'add': {
          if (!args.workspaceId) return { code: -1, message: '缺少 workspaceId' }
          const workspace = getWorkspace(args.workspaceId)
          if (!workspace) return { code: -1, message: '工作区不存在' }

          // 弹窗选择文件
          const filePaths = dialog.showOpenDialogSync({
            title: '选择要添加的文件',
            properties: ['openFile', 'multiSelections'],
          })

          if (!filePaths || !filePaths.length) {
            return { code: 0, message: '用户取消选择', data: [] }
          }

          // 复制到 workspace-files 目录
          const targetDir = getProjectFilesPath(workspace.id)
          if (!existsSync(targetDir)) {
            mkdirSync(targetDir, { recursive: true })
          }

          const addedFiles: string[] = []
          for (const srcPath of filePaths) {
            const fileName = basename(srcPath)
            const destPath = join(targetDir, fileName)
            copyFileSync(srcPath, destPath)
            addedFiles.push(fileName)
            logger.info(`[PiAgentController] 已添加文件: ${fileName} → ${destPath}`)
          }

          // 返回更新后的文件列表
          const files = this.listFilesRecursive(targetDir, '')
          return { code: 0, data: files, message: `已添加 ${addedFiles.length} 个文件` }
        }

        default:
          return { code: -1, message: `未知操作: ${args.action}` }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[PiAgentController] fileOperation 异常:', err)
      return { code: -1, message: msg }
    }
  }

  /** 递归列出目录下的文件（最多两层深度） */
  private listFilesRecursive(basePath: string, relativeDir: string, depth = 0): Array<{
    name: string
    path: string
    isDir: boolean
    size: number
  }> {
    const result: Array<{ name: string; path: string; isDir: boolean; size: number }> = []
    const currentPath = join(basePath, relativeDir)

    if (!existsSync(currentPath)) return result
    if (depth > 2) return result // 限制递归深度

    const entries = readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      // 跳过隐藏文件和常见无关目录
      if (entry.name.startsWith('.')) continue
      if (['node_modules', 'skills', 'skills-inactive', '__pycache__'].includes(entry.name)) continue

      const fullPath = join(currentPath, entry.name)
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        const stat = statSync(fullPath)
        result.push({ name: entry.name, path: relativePath, isDir: true, size: stat.size })
        result.push(...this.listFilesRecursive(basePath, relativePath, depth + 1))
      } else {
        const stat = statSync(fullPath)
        result.push({ name: entry.name, path: relativePath, isDir: false, size: stat.size })
      }
    }

    return result
  }

  /** 递归扫描工作区记忆文件 */
  private scanMemoryFiles(basePath: string, relativeDir: string): Array<{
    name: string
    path: string
    size: number
    mtime: string
  }> {
    const result: Array<{ name: string; path: string; size: number; mtime: string }> = []
    const currentPath = join(basePath, relativeDir)

    if (!existsSync(currentPath)) return result

    const entries = readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      // 跳过隐藏目录（除了 .claude）和 node_modules
      if (entry.name.startsWith('.') && entry.name !== '.claude') continue
      if (entry.name === 'node_modules' || entry.name === 'skills' || entry.name === 'skills-inactive') continue

      const fullPath = join(currentPath, entry.name)
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        result.push(...this.scanMemoryFiles(basePath, relativePath))
      } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.txt'))) {
        const stat = statSync(fullPath)
        result.push({
          name: entry.name,
          path: relativePath,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
        })
      }
    }

    return result
  }

  /** 向 SSE 响应流写入事件 */
  private writeSseEvent(res: ServerResponse, event: string, data: unknown): void {
    if (res.writableEnded) return
    const payload = typeof data === 'string' ? data : JSON.stringify(data)
    res.write(`event: ${event}\n`)
    res.write(`data: ${payload}\n\n`)
  }
}

export default PiAgentController
