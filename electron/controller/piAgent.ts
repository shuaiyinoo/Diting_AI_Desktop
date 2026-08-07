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
  listSkillFiles,
  readSkillFile,
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
  attachDirectoryToWorkspace,
  detachDirectoryFromWorkspace,
} from '../components/pi/adapters/workspace-manager'
import {
  getAgentWorkspacePath,
  getWorkspaceClaudeMdPath,
  getProjectFilesPath,
  getWorkspaceMemorySummary,
  listWorkspaceAutoMemoryFiles,
  readWorkspaceClaudeMd,
  writeWorkspaceClaudeMd,
  readWorkspaceAutoMemoryFile,
  writeWorkspaceAutoMemoryFile,
  getWorkspaceAutoMemoryDir,
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
    action: 'list' | 'toggle' | 'delete' | 'read' | 'write' | 'defaultSlugs' | 'listFiles' | 'readFile'
    workspaceSlug?: string
    skillSlug?: string
    enabled?: boolean
    content?: string
    filePath?: string
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
        case 'listFiles': {
          if (!args.workspaceSlug || !args.skillSlug) {
            return { code: -1, message: '缺少必要参数' }
          }
          const tree = listSkillFiles(args.workspaceSlug, args.skillSlug)
          return { code: 0, data: tree }
        }
        case 'readFile': {
          if (!args.workspaceSlug || !args.skillSlug || !args.filePath) {
            return { code: -1, message: '缺少必要参数' }
          }
          const content = readSkillFile(args.workspaceSlug, args.skillSlug, args.filePath)
          return { code: 0, data: content }
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
   * 停止指定会话的所有协作子 Agent。
   */
  async stopAllDelegations(args: {
    sessionId: string
  }): Promise<{ code: number; message?: string }> {
    try {
      const { cleanupDelegations } = await import('../components/pi/adapters/agent-collaboration-service')
      cleanupDelegations(args.sessionId)
      return { code: 0, message: '已停止所有子 Agent' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[PiAgentController] stopAllDelegations 异常:', err)
      return { code: -1, message: msg }
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
          return { code: 0, data: { ...workspace, resolvedPath: workspace.projectPath || getProjectFilesPath(workspace.id) } }
        }
        case 'list': {
          const workspaces = listWorkspaces()
          // 附加解析后的项目路径（空白项目返回 workspace-files 托管路径）
          const withPath = workspaces.map((ws) => ({
            ...ws,
            resolvedPath: ws.projectPath || getProjectFilesPath(ws.id),
          }))
          return { code: 0, data: withPath }
        }
        case 'get': {
          if (!args.id) return { code: -1, message: '缺少 id' }
          const workspace = getWorkspace(args.id)
          if (!workspace) return { code: -1, message: '工作区不存在' }
          return { code: 0, data: { ...workspace, resolvedPath: workspace.projectPath || getProjectFilesPath(workspace.id) } }
        }
        case 'update': {
          if (!args.id) return { code: -1, message: '缺少 id' }
          const workspace = updateWorkspace(args.id, {
            name: args.name,
            description: args.description,
            projectPath: args.projectPath,
          })
          if (!workspace) return { code: -1, message: '工作区不存在' }
          return { code: 0, data: { ...workspace, resolvedPath: workspace.projectPath || getProjectFilesPath(workspace.id) } }
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
   * 记忆文件管理（摘要/列表/树/读取/写入）。
   * 管理工作区中的 CLAUDE.md、Auto Memory 等记忆文件。
   *
   * 安全设计：
   * - CLAUDE.md 和 auto memory 文件的读写都经过 config-paths 中的安全函数
   * - 路径遍历防护：禁止绝对路径和 `..` 相对路径
   * - symlink 逃逸防护：通过 realpathSync 校验
   * - 文件大小限制：10 MB
   * - 二进制文件检测
   */
  async memoryOperation(args: {
    action: 'summary' | 'list' | 'tree' | 'read' | 'write'
    workspaceSlug?: string
    filePath?: string
    content?: string
  }): Promise<{ code: number; message?: string; data?: unknown }> {
    try {
      const slug = args.workspaceSlug || 'default'

      switch (args.action) {
        // 获取记忆摘要：CLAUDE.md + Auto Memory 统计信息
        case 'summary': {
          const summary = getWorkspaceMemorySummary(slug)
          return { code: 0, data: summary }
        }

        // 列出所有记忆文件（扁平结构，兼容旧接口）
        case 'list': {
          const wsPath = getAgentWorkspacePath(slug)
          const files = this.scanMemoryFiles(wsPath, '')
          return { code: 0, data: { files, basePath: wsPath } }
        }

        // 列出 auto memory 文件树（树形结构，用于前端文件浏览器）
        case 'tree': {
          const files = listWorkspaceAutoMemoryFiles(slug)
          return { code: 0, data: files }
        }

        // 读取记忆文件
        case 'read': {
          if (!args.filePath) return { code: -1, message: '缺少 filePath' }

          // CLAUDE.md 走专用安全读取函数
          if (args.filePath === 'CLAUDE.md') {
            const file = readWorkspaceClaudeMd(slug)
            return { code: 0, data: file }
          }

          // auto memory 文件走安全读取函数（含路径遍历防护）
          const file = readWorkspaceAutoMemoryFile(slug, args.filePath)
          return { code: 0, data: file }
        }

        // 写入记忆文件
        case 'write': {
          if (!args.filePath || args.content === undefined) {
            return { code: -1, message: '缺少 filePath 或 content' }
          }

          // CLAUDE.md 走专用安全写入函数
          if (args.filePath === 'CLAUDE.md') {
            writeWorkspaceClaudeMd(slug, args.content)
            return { code: 0, message: '保存成功' }
          }

          // auto memory 文件走安全写入函数（含路径遍历防护 + 自动创建父目录）
          writeWorkspaceAutoMemoryFile(slug, args.filePath, args.content)
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
   * 文件面板管理（列文件/添加文件/读取文件）。
   *
   * - list：列出项目文件或会话文件
   * - add：弹窗选择文件并复制到项目文件目录
   * - read：读取文件内容（文本/二进制），用于文件查看器
   */
  async fileOperation(args: {
    action: 'list' | 'add' | 'read' | 'attachFolder' | 'detachFolder' | 'listAttachedDir' | 'listAllFiles'
    workspaceId?: string
    sessionId?: string
    mode?: 'project' | 'session'
    filePath?: string
    /** 附加文件夹路径（attachFolder 时前端传入）或附加目录绝对路径（detachFolder/listAttachedDir 时传入） */
    folderPath?: string
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
            // 返回项目文件 + 附加目录列表
            return { code: 0, data: { files, attachedDirs: workspace.attachedDirectories ?? [] } }
          } else {
            // 会话文件模式：列出会话工作目录下的文件
            if (!args.sessionId) return { code: -1, message: '缺少 sessionId' }
            const sessionDir = join(getAgentWorkspacePath(args.workspaceId || ''), args.sessionId)
            // 确保会话目录存在
            if (!existsSync(sessionDir)) {
              mkdirSync(sessionDir, { recursive: true })
            }
            const files = this.listFilesRecursive(sessionDir, '')
            return { code: 0, data: { files, attachedDirs: [], resolvedPath: sessionDir } }
          }
        }

        case 'add': {
          if (!args.workspaceId) return { code: -1, message: '缺少 workspaceId' }
          const workspace = getWorkspace(args.workspaceId)
          if (!workspace) return { code: -1, message: '工作区不存在' }

          // 会话模式需要 sessionId
          if (mode === 'session' && !args.sessionId) {
            return { code: -1, message: '缺少 sessionId' }
          }

          // 弹窗选择文件
          const filePaths = dialog.showOpenDialogSync({
            title: '选择要添加的文件',
            properties: ['openFile', 'multiSelections'],
          })

          if (!filePaths || !filePaths.length) {
            return { code: 0, message: '用户取消选择', data: { files: [], attachedDirs: workspace.attachedDirectories ?? [] } }
          }

          // 根据模式决定目标目录
          // 项目模式：复制到 workspace-files 目录
          // 会话模式：复制到会话工作目录
          const targetDir = mode === 'session'
            ? join(getAgentWorkspacePath(args.workspaceId), args.sessionId!)
            : getProjectFilesPath(workspace.id)
          if (!existsSync(targetDir)) {
            mkdirSync(targetDir, { recursive: true })
          }

          const addedFiles: string[] = []
          for (const srcPath of filePaths) {
            const fileName = basename(srcPath)
            const destPath = join(targetDir, fileName)
            copyFileSync(srcPath, destPath)
            addedFiles.push(fileName)
            logger.info(`[PiAgentController] 已添加文件(${mode}): ${fileName} → ${destPath}`)
          }

          // 返回更新后的文件列表
          const files = this.listFilesRecursive(targetDir, '')
          return { code: 0, data: { files, attachedDirs: workspace.attachedDirectories ?? [] }, message: `已添加 ${addedFiles.length} 个文件` }
        }

                case 'read': {
          // 读取文件内容：根据 mode 解析文件路径
          if (!args.filePath) return { code: -1, message: '缺少 filePath' }

          let baseDir: string
          if (args.folderPath) {
            // 附加目录文件：folderPath 为附加目录的绝对路径
            baseDir = args.folderPath
          } else if (mode === 'project') {
            if (!args.workspaceId) return { code: -1, message: '缺少 workspaceId' }
            const workspace = getWorkspace(args.workspaceId)
            if (!workspace) return { code: -1, message: '工作区不存在' }
            baseDir = workspace.isBlank
              ? getProjectFilesPath(workspace.id)
              : (workspace.projectPath || getProjectFilesPath(workspace.id))
          } else {
            if (!args.sessionId) return { code: -1, message: '缺少 sessionId' }
            baseDir = join(getAgentWorkspacePath(args.workspaceId || ''), args.sessionId)
          }

          const fullPath = join(baseDir, args.filePath)
          if (!existsSync(fullPath)) return { code: -1, message: '文件不存在' }

          const stat = statSync(fullPath)
          const ext = args.filePath.split('.').pop()?.toLowerCase() || ''

          // 二进制文件类型（图片/PDF/Office）：返回 base64 编码
          const binaryExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'pdf']
          if (binaryExts.includes(ext)) {
            const buffer = readFileSync(fullPath)
            const base64 = buffer.toString('base64')
            const mimeType = this.getMimeType(ext)
            logger.info(`[PiAgentController] 读取文件(二进制): ${args.filePath}, size=${buffer.length}`)
            return {
              code: 0,
              data: {
                name: basename(fullPath),
                path: args.filePath,
                size: stat.size,
                ext,
                isBinary: true,
                mimeType,
                base64,
              },
            }
          }

          // 文本文件：返回 UTF-8 字符串
          const content = readFileSync(fullPath, 'utf-8')
          logger.info(`[PiAgentController] 读取文件(文本): ${args.filePath}, size=${content.length}`)
          return {
            code: 0,
            data: {
              name: basename(fullPath),
              path: args.filePath,
              size: stat.size,
              ext,
              isBinary: false,
              content,
            },
          }
        }

        case 'attachFolder': {
          // 附加外部文件夹到工作区（仅添加引用，不复制文件）
          if (!args.workspaceId) return { code: -1, message: '缺少 workspaceId' }
          if (!args.folderPath) return { code: -1, message: '缺少 folderPath' }
          const ws = getWorkspace(args.workspaceId)
          if (!ws) return { code: -1, message: '工作区不存在' }

          const updated = attachDirectoryToWorkspace(args.workspaceId, args.folderPath)
          return { code: 0, data: updated, message: `已附加文件夹: ${args.folderPath}` }
        }

        case 'detachFolder': {
          // 移除附加文件夹引用（不删除实际文件夹）
          if (!args.workspaceId) return { code: -1, message: '缺少 workspaceId' }
          if (!args.folderPath) return { code: -1, message: '缺少 folderPath' }

          const updated = detachDirectoryFromWorkspace(args.workspaceId, args.folderPath)
          return { code: 0, data: updated, message: '已移除附加文件夹' }
        }

        case 'listAttachedDir': {
          // 列出附加文件夹的内容（仅当前层级，懒加载模式）
          if (!args.folderPath) return { code: -1, message: '缺少 folderPath' }
          if (!existsSync(args.folderPath)) return { code: 0, data: [] }

          const items = this.listDirFlat(args.folderPath, '')
          return { code: 0, data: items }
        }

        case 'listAllFiles': {
          // 递归列出目录下的所有文件（不限深度，用于 @ 引用文件选择）
          if (!args.folderPath) return { code: -1, message: '缺少 folderPath' }
          if (!existsSync(args.folderPath)) return { code: 0, data: [] }

          const items = this.listAllFilesRecursive(args.folderPath, '')
          return { code: 0, data: items }
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

  /** 根据扩展名获取 MIME 类型 */
  private getMimeType(ext: string): string {
    const map: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      ico: 'image/x-icon',
      bmp: 'image/bmp',
      pdf: 'application/pdf',
    }
    return map[ext] || 'application/octet-stream'
  }

  /** 递归列出目录下的所有文件（不限深度，用于 @ 引用） */
  private listAllFilesRecursive(basePath: string, relativeDir: string): Array<{
    name: string
    path: string
    isDir: boolean
    size: number
  }> {
    const result: Array<{ name: string; path: string; isDir: boolean; size: number }> = []
    const currentPath = join(basePath, relativeDir)

    if (!existsSync(currentPath)) return result

    const entries = readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (['node_modules', 'skills', 'skills-inactive', '__pycache__'].includes(entry.name)) continue

      const fullPath = join(currentPath, entry.name)
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
      const stat = statSync(fullPath)

      if (entry.isDirectory()) {
        result.push({ name: entry.name, path: relativePath, isDir: true, size: stat.size })
        result.push(...this.listAllFilesRecursive(basePath, relativePath))
      } else {
        result.push({ name: entry.name, path: relativePath, isDir: false, size: stat.size })
      }
    }

    return result
  }

  /** 列出目录当前层级的内容（不递归，用于懒加载展开） */
  private listDirFlat(basePath: string, relativeDir: string): Array<{
    name: string
    path: string
    isDir: boolean
    size: number
  }> {
    const result: Array<{ name: string; path: string; isDir: boolean; size: number }> = []
    const currentPath = join(basePath, relativeDir)

    if (!existsSync(currentPath)) return result

    const entries = readdirSync(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      // 跳过隐藏文件和常见无关目录
      if (entry.name.startsWith('.')) continue
      if (['node_modules', 'skills', 'skills-inactive', '__pycache__'].includes(entry.name)) continue

      const fullPath = join(currentPath, entry.name)
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
      const stat = statSync(fullPath)
      result.push({ name: entry.name, path: relativePath, isDir: entry.isDirectory(), size: stat.size })
    }

    return result
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

  /** 向 SSE 响应流写入事件（合并为单次 write 防止并发交叉写入） */
  private writeSseEvent(res: ServerResponse, event: string, data: unknown): void {
    if (res.writableEnded) return
    const payload = typeof data === 'string' ? data : JSON.stringify(data)
    // 关键：合并为单次 res.write 调用，防止并发事件交叉写入导致 SSE 帧错乱
    res.write(`event: ${event}\ndata: ${payload}\n\n`)
  }
}

export default PiAgentController
