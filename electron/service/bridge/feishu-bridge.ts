/**
 * 飞书 Bridge 服务
 *
 * 通过 @larksuiteoapi/node-sdk 的 createLarkChannel 建立 WebSocket 长连接，
 * 接收飞书消息并路由到 Diting Agent，回复通过 Lark API 发送。
 *
 * 飞书体验最好：支持流式卡片、图片/文件下载、群聊 @Bot 检测。
 */

import { BrowserWindow } from 'electron'
import { logger } from 'ee-core/log'
import {
  getDecryptedBotAppSecret,
  getFeishuBotBindingsPath,
  type FeishuBotConfig,
} from './feishu-config'
import { BridgeCommandHandler, type BridgeAttachment } from './bridge-command-handler'
import { createJsonBridgeChatBindingStore, type BridgeChatBinding, type BridgeUpdateBindingInput } from './bridge-binding-store'
import {
  saveImageToSession,
  saveFileToSession,
} from './bridge-attachment-utils'
import { redactSensitiveLogText, redactSensitiveLogValue } from './bridge-config'

// ===== 状态类型 =====

export type FeishuBridgeStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface FeishuBotBridgeState {
  status: FeishuBridgeStatus
  botId: string
  botName: string
  connectedAt?: number
  errorMessage?: string
}

// ===== Lark SDK 类型（动态加载） =====

interface LarkChannel {
  connect(): Promise<void>
  disconnect(): void
  on(handlers: {
    message?: (msg: LarkNormalizedMessage) => void
    cardAction?: (msg: unknown) => void
  }): void
  rawClient: LarkClient
}

interface LarkClient {
  request<T>(options: {
    method: string
    url: string
    data?: unknown
    params?: Record<string, unknown>
  }): Promise<T>
  im?: {
    message?: {
      create(options: {
        params: { receive_id_type: string }
        data: {
          receive_id: string
          msg_type: string
          content: string
        }
      }): Promise<{ code: number; msg?: string; data?: { message_id?: string } }>
    }
    messageResource?: {
      get(options: {
        path: { message_id: string; file_key: string }
        params: { type: string }
      }): Promise<{ getReadableStream?: () => AsyncIterable<Buffer | Uint8Array> }>
    }
  }
}

interface LarkNormalizedMessage {
  messageType: string
  chatId: string
  chatType: 'p2p' | 'group'
  senderId: string
  senderName?: string
  content: string
  rawContentType: string
  resources: Array<{ type: string; fileKey: string; fileName?: string }>
  mentions: Array<{ key: string; openId?: string; name?: string; isBot?: boolean }>
  mentionAll: boolean
  mentionedBot: boolean
  messageId: string
  rootId?: string
  threadId?: string
  replyToMessageId?: string
  createTime: number
  raw?: Record<string, unknown>
}

// ===== Bridge 实现 =====

class FeishuBridge {
  private channel: LarkChannel | null = null
  private client: LarkClient | null = null
  private botOpenId: string | null = null
  private state: FeishuBotBridgeState

  /** 通用命令处理器 */
  private commandHandler: BridgeCommandHandler

  constructor(public botConfig: FeishuBotConfig) {
    this.state = {
      status: 'disconnected',
      botId: botConfig.id,
      botName: botConfig.name,
    }

    this.commandHandler = new BridgeCommandHandler({
      platformName: `飞书-${botConfig.name}`,
      adapter: {
        sendText: async (chatId: string, text: string) => {
          await this.sendText(chatId, text)
        },
        sendMarkdown: async (chatId: string, markdown: string) => {
          await this.sendMarkdown(chatId, markdown)
        },
      },
      getDefaultWorkspaceId: () => this.botConfig.defaultWorkspaceId,
      bindingStore: createJsonBridgeChatBindingStore(
        getFeishuBotBindingsPath(botConfig.id),
        `飞书-${botConfig.name}`,
      ),
      onWorkspaceSwitched: (workspaceId) => {
        // 更新配置中的默认工作区
        this.botConfig = { ...this.botConfig, defaultWorkspaceId: workspaceId }
      },
    })
  }

  /** 更新 Bot 配置 */
  updateConfig(botConfig: FeishuBotConfig): void {
    this.botConfig = botConfig
  }

  /** 获取状态 */
  getStatus(): FeishuBotBridgeState {
    return { ...this.state }
  }

  // ===== 绑定管理（供设置页调用） =====

  /** 列出所有绑定 */
  listBindings(): BridgeChatBinding[] {
    return this.commandHandler.listBindings()
  }

  /** 更新绑定的工作区/会话 */
  updateBinding(input: BridgeUpdateBindingInput): BridgeChatBinding | null {
    return this.commandHandler.updateBinding(input)
  }

  /** 移除绑定 */
  removeBinding(chatId: string): boolean {
    return this.commandHandler.removeBindingExternal(chatId)
  }

  // ===== 生命周期 =====

  async start(): Promise<void> {
    const { appId, appSecret } = this.botConfig
    if (!appId || !appSecret) {
      throw new Error('请先配置 App ID 和 App Secret')
    }

    this.updateStatus({ status: 'connecting' })

    try {
      const plainSecret = getDecryptedBotAppSecret(this.botConfig.id)
      const lark = await import('@larksuiteoapi/node-sdk')

      this.channel = (lark as unknown as { createLarkChannel: (opts: unknown) => LarkChannel }).createLarkChannel({
        appId,
        appSecret: plainSecret,
        domain: (lark as unknown as { Domain: { Feishu: unknown } }).Domain.Feishu,
        loggerLevel: 3, // warn
        policy: {
          dmMode: 'open',
          requireMention: false,
          respondToMentionAll: false,
        },
        safety: { chatQueue: { enabled: false } },
        includeRawEvent: true,
      })
      this.client = this.channel.rawClient

      // 获取 Bot open_id
      try {
        const botInfoResp = await this.client.request<{
          code?: number
          bot?: { open_id?: string; app_name?: string }
          data?: { bot?: { open_id?: string; app_name?: string } }
        }>({
          method: 'GET',
          url: 'https://open.feishu.cn/open-apis/bot/v3/info/',
        })
        this.botOpenId = botInfoResp?.bot?.open_id ?? botInfoResp?.data?.bot?.open_id ?? null
        if (this.botOpenId) {
          logger.info(`[飞书 Bridge/${this.botConfig.name}] Bot open_id: ${this.botOpenId}`)
        }
      } catch (error) {
        logger.warn(`[飞书 Bridge/${this.botConfig.name}] 获取 Bot info 失败:`, redactSensitiveLogValue(error))
      }

      // 注册消息接收
      this.channel.on({
        message: (msg: LarkNormalizedMessage) => {
          this.handleMessage(msg).catch((error) => {
            logger.error(`[飞书 Bridge/${this.botConfig.name}] 处理消息异常:`, redactSensitiveLogValue(error))
          })
        },
      })

      await this.channel.connect()

      this.updateStatus({ status: 'connected', connectedAt: Date.now() })
      logger.info(`[飞书 Bridge/${this.botConfig.name}] 已连接`)
    } catch (error) {
      const message = redactSensitiveLogText(error instanceof Error ? error.message : String(error))
      this.updateStatus({ status: 'error', errorMessage: message })
      logger.error(`[飞书 Bridge/${this.botConfig.name}] 启动失败:`, message)
      throw error
    }
  }

  stop(): void {
    if (this.channel) {
      try {
        this.channel.disconnect()
      } catch {
        // 忽略
      }
      this.channel = null
      this.client = null
    }
    this.updateStatus({ status: 'disconnected' })
    logger.info(`[飞书 Bridge/${this.botConfig.name}] 已停止`)
  }

  // ===== 消息处理 =====

  private async handleMessage(msg: LarkNormalizedMessage): Promise<void> {
    // 调试日志
    logger.info(`[飞书 Bridge/${this.botConfig.name}] 收到消息: chatId=${msg.chatId?.slice(0, 12)}, chatType=${msg.chatType}, senderId=${msg.senderId?.slice(0, 12)}, content=${msg.content?.slice(0, 100)}`)

    const chatId = msg.chatId
    if (!chatId) {
      logger.warn(`[飞书 Bridge/${this.botConfig.name}] 消息缺少 chatId，跳过处理`)
      return
    }

    // SDK NormalizedMessage.content 是 JSON 字符串
    // 文本消息: {"text":"消息内容"}
    // 图片消息: {"image_key":"xxx"}
    // 文件消息: {"file_key":"xxx","file_name":"xxx"}
    let text = ''
    const imageKeys: string[] = []
    const fileKeys: Array<{ fileKey: string; fileName: string }> = []

    if (msg.content) {
      try {
        const content = JSON.parse(msg.content)
        if (content.text) text = content.text
        if (content.image_key) imageKeys.push(content.image_key)
        if (content.file_key && content.file_name) {
          fileKeys.push({ fileKey: content.file_key, fileName: content.file_name })
        }
        // 富文本消息
        if (content.content && Array.isArray(content.content)) {
          for (const node of content.content) {
            if (node.tag === 'text' && node.text) text += node.text
            if (node.tag === 'img' && node.image_key) imageKeys.push(node.image_key)
          }
        }
      } catch {
        // content 不是 JSON，直接当作纯文本
        text = msg.content
      }
    }

    // 也从 resources 中提取图片和文件（SDK 标准字段）
    if (msg.resources && Array.isArray(msg.resources)) {
      for (const res of msg.resources) {
        if (res.type === 'image' && res.fileKey) imageKeys.push(res.fileKey)
        if (res.type === 'file' && res.fileKey) {
          fileKeys.push({ fileKey: res.fileKey, fileName: res.fileName || 'file' })
        }
      }
    }

    if (!text.trim() && imageKeys.length === 0 && fileKeys.length === 0) {
      logger.warn(`[飞书 Bridge/${this.botConfig.name}] 消息内容为空，跳过。content=${msg.content}`)
      return
    }

    logger.info(`[飞书 Bridge/${this.botConfig.name}] 收到消息:`, redactSensitiveLogValue({
      chatId: chatId.slice(0, 12),
      text: text.length > 100 ? text.slice(0, 100) + '...' : text,
      imageCount: imageKeys.length,
      fileCount: fileKeys.length,
    }))

    // 下载图片和文件
    const attachments: BridgeAttachment[] = []
    const binding = this.commandHandler.getBinding(chatId)

    if (binding && this.botOpenId) {
      // 下载图片
      for (let i = 0; i < imageKeys.length; i++) {
        try {
          const buf = await this.downloadImage(msg.messageId!, imageKeys[i]!)
          if (binding.workspaceId) {
            const path = saveImageToSession(binding.workspaceId, binding.sessionId, buf, i)
            attachments.push({ absolutePath: path, label: `图片${i + 1}`, kind: 'image' })
          }
        } catch (error) {
          logger.warn(`[飞书 Bridge] 图片下载失败:`, redactSensitiveLogValue(error))
        }
      }

      // 下载文件
      for (const fileInfo of fileKeys) {
        try {
          const buf = await this.downloadFile(msg.messageId!, fileInfo.fileKey, fileInfo.fileName)
          if (binding.workspaceId) {
            const path = saveFileToSession(binding.workspaceId, binding.sessionId, buf, fileInfo.fileName)
            attachments.push({ absolutePath: path, label: fileInfo.fileName, kind: 'file' })
          }
        } catch (error) {
          logger.warn(`[飞书 Bridge] 文件下载失败:`, redactSensitiveLogValue(error))
        }
      }
    }

    // 路由到命令处理器
    // 飞书 chatType: "p2p" 表示单聊，"group" 表示群聊
    const chatType: 'p2p' | 'group' = msg.chatType === 'p2p' ? 'p2p' : 'group'
    const senderOpenId = msg.senderId
    // 确保绑定中包含飞书元数据（chatType/userId）
    this.commandHandler.ensureBinding(chatId, { chatType, userId: senderOpenId })
    await this.commandHandler.handleIncomingMessage(chatId, text, undefined, attachments)
  }

  // ===== 发送消息 =====

  async sendText(chatId: string, text: string): Promise<void> {
    if (!this.client?.im?.message) return

    // 飞书单条消息有长度限制，超长分段
    const MAX_LEN = 4000
    const chunks = text.length <= MAX_LEN
      ? [text]
      : text.match(new RegExp(`.{1,${MAX_LEN}}`, 'gs')) ?? [text]

    for (const chunk of chunks) {
      try {
        const resp = await this.client.im.message.create({
          params: { receive_id_type: 'chat_id' },
          data: {
            receive_id: chatId,
            msg_type: 'text',
            content: JSON.stringify({ text: chunk }),
          },
        })
        if (resp.code !== 0) {
          logger.warn(`[飞书 Bridge/${this.botConfig.name}] 发送消息失败: ${resp.msg}`)
        }
      } catch (error) {
        logger.error(`[飞书 Bridge/${this.botConfig.name}] 发送消息异常:`, redactSensitiveLogValue(error))
      }
    }
  }

  /**
   * 发送 Markdown / 富文本消息
   *
   * 飞书支持 post 消息类型（富文本），可将 Markdown 中的代码块、加粗、链接等
   * 转换为飞书富文本节点，获得更好的阅读体验。
   * 对于无法转换的内容，回退为纯文本节点。
   */
  async sendMarkdown(chatId: string, markdown: string): Promise<void> {
    if (!this.client?.im?.message) return

    // 将 Markdown 转换为飞书 post 富文本结构
    const postContent = this.markdownToFeishuPost(markdown)

    // post 消息也有长度限制，如果转换后内容过大则回退到纯文本分段发送
    const jsonStr = JSON.stringify(postContent)
    if (jsonStr.length > 30000) {
      // 超长内容回退到纯文本
      await this.sendText(chatId, markdown)
      return
    }

    try {
      const resp = await this.client.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: chatId,
          msg_type: 'post',
          content: JSON.stringify(postContent),
        },
      })
      if (resp.code !== 0) {
        logger.warn(`[飞书 Bridge/${this.botConfig.name}] 发送富文本失败: ${resp.msg}，回退到纯文本`)
        // 回退到纯文本
        await this.sendText(chatId, markdown)
      }
    } catch (error) {
      logger.error(`[飞书 Bridge/${this.botConfig.name}] 发送富文本异常:`, redactSensitiveLogValue(error))
      // 回退到纯文本
      await this.sendText(chatId, markdown)
    }
  }

  /**
   * 将 Markdown 文本转换为飞书 post 富文本结构
   *
   * 飞书 post 格式：
   *   { "zh_cn": { "title": "", "content": [[{tag, ...}, ...], ...] } }
   *
   * 支持的节点类型：
   *   - text: 纯文本（可带 bold/italic/un_escape 等样式）
   *   - a: 链接
   *   - code_block: 代码块（飞书不支持行内 code_block，但支持多语言代码块）
   *
   * 解析策略：逐行处理，识别代码块（```）、标题（#）、列表（-/*）、
   * 加粗（**）、链接（[text](url)）等语法。
   */
  private markdownToFeishuPost(markdown: string): { zh_cn: { title: string; content: unknown[][] } } {
    const lines = markdown.split('\n')
    const content: unknown[][] = []
    let currentLine: unknown[] = []
    let inCodeBlock = false
    let codeLang = ''
    let codeLines: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!

      // 代码块开始/结束
      if (line.trimStart().startsWith('```')) {
        if (inCodeBlock) {
          // 代码块结束 — 输出代码块节点
          if (currentLine.length > 0) {
            content.push(currentLine)
            currentLine = []
          }
          content.push([{
            tag: 'code_block',
            language: codeLang || 'plain',
            text: codeLines.join('\n'),
          }])
          codeLines = []
          codeLang = ''
          inCodeBlock = false
        } else {
          // 代码块开始
          if (currentLine.length > 0) {
            content.push(currentLine)
            currentLine = []
          }
          inCodeBlock = true
          codeLang = line.trim().slice(3).trim()
        }
        continue
      }

      if (inCodeBlock) {
        codeLines.push(line)
        continue
      }

      // 空行 — 结束当前行
      if (line.trim() === '') {
        if (currentLine.length > 0) {
          content.push(currentLine)
          currentLine = []
        }
        continue
      }

      // 标题行（# ## ### 等）
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
      if (headingMatch) {
        if (currentLine.length > 0) {
          content.push(currentLine)
          currentLine = []
        }
        const headingText = headingMatch[2]!
        currentLine.push({ tag: 'text', text: headingText, style: ['bold'] })
        content.push(currentLine)
        currentLine = []
        continue
      }

      // 列表项（- * +）
      const listMatch = line.match(/^(\s*)([-*+])\s+(.+)$/)
      if (listMatch) {
        const indent = listMatch[1]!.length
        const itemText = listMatch[3]!
        const prefix = ' '.repeat(indent) + '• '
        // 将列表项的富文本节点添加到当前行
        currentLine.push({ tag: 'text', text: prefix })
        this.parseInlineMarkdown(itemText, currentLine)
        content.push(currentLine)
        currentLine = []
        continue
      }

      // 有序列表项（1. 2. 等）
      const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/)
      if (olMatch) {
        const indent = olMatch[1]!.length
        const num = olMatch[2]!
        const itemText = olMatch[3]!
        const prefix = ' '.repeat(indent) + num + '. '
        currentLine.push({ tag: 'text', text: prefix })
        this.parseInlineMarkdown(itemText, currentLine)
        content.push(currentLine)
        currentLine = []
        continue
      }

      // 引用块（> ）
      if (line.startsWith('>')) {
        const quoteText = line.slice(1).trim()
        if (currentLine.length > 0) {
          content.push(currentLine)
          currentLine = []
        }
        currentLine.push({ tag: 'text', text: '│ ' + quoteText, style: ['italic'] })
        content.push(currentLine)
        currentLine = []
        continue
      }

      // 分隔线
      if (/^(---|\*\*\*|___)$/.test(line.trim())) {
        if (currentLine.length > 0) {
          content.push(currentLine)
          currentLine = []
        }
        currentLine.push({ tag: 'text', text: '───────────' })
        content.push(currentLine)
        currentLine = []
        continue
      }

      // 普通行 — 解析行内 Markdown
      this.parseInlineMarkdown(line, currentLine)
      content.push(currentLine)
      currentLine = []
    }

    // 处理未结束的代码块
    if (inCodeBlock && codeLines.length > 0) {
      content.push([{
        tag: 'code_block',
        language: codeLang || 'plain',
        text: codeLines.join('\n'),
      }])
    }

    // 处理剩余的行内节点
    if (currentLine.length > 0) {
      content.push(currentLine)
    }

    return {
      zh_cn: {
        title: '',
        content,
      },
    }
  }

  /**
   * 解析行内 Markdown，将加粗、斜体、行内代码、链接等转换为飞书节点
   * 节点追加到 nodes 数组中。
   */
  private parseInlineMarkdown(text: string, nodes: unknown[]): void {
    // 使用正则逐一匹配行内元素
    // 顺序：行内代码 → 链接 → 加粗 → 斜体 → 普通文本
    const pattern = /(`[^`]+`|\[[^\]]+\]\([^\)]+\)|\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = pattern.exec(text)) !== null) {
      // 添加匹配前的普通文本
      if (match.index > lastIndex) {
        const plain = text.slice(lastIndex, match.index)
        if (plain) nodes.push({ tag: 'text', text: plain })
      }

      const token = match[0]!

      // 行内代码
      if (token.startsWith('`') && token.endsWith('`')) {
        const codeText = token.slice(1, -1)
        nodes.push({ tag: 'text', text: codeText, style: ['italic'] })
      }
      // 链接 [text](url)
      else if (token.startsWith('[')) {
        const linkMatch = token.match(/^\[([^\]]+)\]\(([^\)]+)\)$/)
        if (linkMatch) {
          nodes.push({ tag: 'a', text: linkMatch[1]!, href: linkMatch[2]! })
        } else {
          nodes.push({ tag: 'text', text: token })
        }
      }
      // 加粗 **text**
      else if (token.startsWith('**') && token.endsWith('**')) {
        nodes.push({ tag: 'text', text: token.slice(2, -2), style: ['bold'] })
      }
      // 斜体 *text* 或 _text_
      else if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
        nodes.push({ tag: 'text', text: token.slice(1, -1), style: ['italic'] })
      }
      else {
        nodes.push({ tag: 'text', text: token })
      }

      lastIndex = pattern.lastIndex
    }

    // 添加剩余的普通文本
    if (lastIndex < text.length) {
      const plain = text.slice(lastIndex)
      if (plain) nodes.push({ tag: 'text', text: plain })
    }
  }

  // ===== 媒体下载 =====

  private async downloadImage(messageId: string, imageKey: string): Promise<Buffer> {
    if (!this.client?.im?.messageResource) throw new Error('Lark Client 未初始化')

    const resp = await this.client.im.messageResource.get({
      path: { message_id: messageId, file_key: imageKey },
      params: { type: 'image' },
    })

    const stream = resp.getReadableStream?.()
    if (!stream) throw new Error('无法获取图片流')

    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  private async downloadFile(messageId: string, fileKey: string, _fileName: string): Promise<Buffer> {
    if (!this.client?.im?.messageResource) throw new Error('Lark Client 未初始化')

    const resp = await this.client.im.messageResource.get({
      path: { message_id: messageId, file_key: fileKey },
      params: { type: 'file' },
    })

    const stream = resp.getReadableStream?.()
    if (!stream) throw new Error('无法获取文件流')

    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    }
    return Buffer.concat(chunks)
  }

  // ===== 测试连接 =====

  async testConnection(appId: string, appSecret: string): Promise<{ success: boolean; message: string }> {
    try {
      const lark = await import('@larksuiteoapi/node-sdk')
      const client = new (lark as unknown as { Client: new (opts: unknown) => LarkClient }).Client({
        appId,
        appSecret,
        appType: (lark as unknown as { AppType: { SelfBuild: unknown } }).AppType.SelfBuild,
      })

      const resp = await client.request<{
        code: number
        msg?: string
        tenant_access_token?: string
      }>({
        method: 'POST',
        url: '/open-apis/auth/v3/tenant_access_token/internal',
        data: { app_id: appId, app_secret: appSecret },
      })

      if (resp.code === 0) {
        return { success: true, message: '连接成功' }
      }
      return { success: false, message: `飞书 API 错误: ${resp.msg ?? '未知'} (code: ${resp.code})` }
    } catch (error) {
      return {
        success: false,
        message: `连接失败: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  // ===== 状态推送 =====

  private updateStatus(partial: Partial<FeishuBotBridgeState>): void {
    this.state = { ...this.state, ...partial }
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('controller/bridge/feishuStatusChanged', this.state)
      }
    }
  }
}

export { FeishuBridge }
