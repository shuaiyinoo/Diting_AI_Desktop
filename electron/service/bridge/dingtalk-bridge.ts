/**
 * 钉钉 Bridge 服务
 *
 * 通过 dingtalk-stream-sdk-nodejs (DWClient) 建立 WebSocket 长连接，
 * 接收钉钉机器人消息并路由到 Diting Agent。
 *
 * 钉钉 Stream 模式无需公网回调地址，适合桌面应用。
 */

import { BrowserWindow } from 'electron'
import { logger } from 'ee-core/log'
import {
  getDecryptedDingTalkClientSecret,
  getDingTalkBotBindingsPath,
  type DingTalkBotConfig,
} from './dingtalk-config'
import { BridgeCommandHandler, type BridgeAttachment } from './bridge-command-handler'
import { createJsonBridgeChatBindingStore } from './bridge-binding-store'
import {
  saveImageToSession,
} from './bridge-attachment-utils'
import { redactSensitiveLogText, redactSensitiveLogValue } from './bridge-config'

// ===== 状态类型 =====

export type DingTalkBridgeStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface DingTalkBotBridgeState {
  status: DingTalkBridgeStatus
  botId: string
  botName: string
  connectedAt?: number
  errorMessage?: string
}

// ===== DingTalk Stream SDK 类型（基于 v2.0.4 的 DWClient） =====

/** SDK 下游消息（data 为 JSON 字符串，需要 parse） */
interface DWClientDownStream {
  specVersion: string
  type: string
  headers: {
    appId: string
    connectionId: string
    contentType: string
    messageId: string
    time: string
    topic: string
    eventType?: string
    eventBornTime?: string
    eventId?: string
    eventCorpId?: string
    eventUnifiedAppId?: string
  }
  data: string
}

/** 钉钉机器人消息内容（parse 后的 JSON 结构） */
interface DingTalkRobotMessage {
  contentType: string
  content: string
  conversationId?: string
  senderNick?: string
  senderStaffId?: string
  chatbotUserId?: string
  messageId?: string
  msgId?: string
  sessionWebhook?: string
  sessionWebhookExpiredTime?: number
  text?: { content?: string }
  richText?: Array<{ title?: string; text?: string }>
  image?: { downloadCode?: string }
}

/** DWClient 实例接口 */
interface DWClient {
  registerCallbackListener(eventId: string, callback: (msg: DWClientDownStream) => void): unknown
  connect(): Promise<void>
  disconnect(): void
}

/** SDK 模块导出 */
interface DingTalkStreamModule {
  DWClient: new (opts: {
    clientId: string
    clientSecret: string
    ua?: string
    keepAlive?: boolean
  }) => DWClient
  TOPIC_ROBOT: string
  TOPIC_CARD: string
}

/** 回调事件 ID（钉钉机器人消息接收的 topic） */
const ROBOT_MESSAGE_TOPIC = '/v1.0/im/bot/messages/get'

// ===== Bridge 实现 =====

class DingTalkBridge {
  private client: DWClient | null = null
  private state: DingTalkBotBridgeState
  private commandHandler: BridgeCommandHandler

  /** Session Webhook 缓存（用于回复消息） */
  private sessionWebhooks = new Map<string, { url: string; expiredAt: number }>()

  constructor(public botConfig: DingTalkBotConfig) {
    this.state = {
      status: 'disconnected',
      botId: botConfig.id,
      botName: botConfig.name,
    }

    this.commandHandler = new BridgeCommandHandler({
      platformName: `钉钉-${botConfig.name}`,
      adapter: {
        sendText: async (chatId: string, text: string, meta?: unknown) => {
          await this.sendText(chatId, text, meta as string | undefined)
        },
      },
      getDefaultWorkspaceId: () => this.botConfig.defaultWorkspaceId,
      bindingStore: createJsonBridgeChatBindingStore(
        getDingTalkBotBindingsPath(botConfig.id),
        `钉钉-${botConfig.name}`,
      ),
    })
  }

  /** 更新配置 */
  updateConfig(botConfig: DingTalkBotConfig): void {
    this.botConfig = botConfig
  }

  /** 获取状态 */
  getStatus(): DingTalkBotBridgeState {
    return { ...this.state }
  }

  // ===== 生命周期 =====

  async start(): Promise<void> {
    const { clientId, clientSecret } = this.botConfig
    if (!clientId || !clientSecret) {
      throw new Error('请先配置 Client ID 和 Client Secret')
    }

    this.updateStatus({ status: 'connecting' })

    try {
      const plainSecret = getDecryptedDingTalkClientSecret(this.botConfig.id)
      const streamModule = await import('dingtalk-stream-sdk-nodejs') as unknown as DingTalkStreamModule

      this.client = new streamModule.DWClient({
        clientId,
        clientSecret: plainSecret,
        ua: 'diting-desktop',
      })

      // 注册消息回调
      this.client.registerCallbackListener(
        ROBOT_MESSAGE_TOPIC,
        (msg: DWClientDownStream) => {
          this.handleMessage(msg).catch((error) => {
            logger.error(`[钉钉 Bridge/${this.botConfig.name}] 处理消息异常:`, redactSensitiveLogValue(error))
          })
        },
      )

      await this.client.connect()

      this.updateStatus({ status: 'connected', connectedAt: Date.now() })
      logger.info(`[钉钉 Bridge/${this.botConfig.name}] 已连接`)
    } catch (error) {
      const message = redactSensitiveLogText(error instanceof Error ? error.message : String(error))
      this.updateStatus({ status: 'error', errorMessage: message })
      logger.error(`[钉钉 Bridge/${this.botConfig.name}] 启动失败:`, message)
      throw error
    }
  }

  stop(): void {
    if (this.client) {
      try {
        this.client.disconnect()
      } catch {
        // 忽略
      }
      this.client = null
    }
    this.sessionWebhooks.clear()
    this.updateStatus({ status: 'disconnected' })
    logger.info(`[钉钉 Bridge/${this.botConfig.name}] 已停止`)
  }

  // ===== 消息处理 =====

  private async handleMessage(downStream: DWClientDownStream): Promise<void> {
    if (!downStream.data) return

    // SDK v2.0.4 的 data 是 JSON 字符串，需要 parse
    let data: DingTalkRobotMessage
    try {
      data = JSON.parse(downStream.data) as DingTalkRobotMessage
    } catch {
      logger.warn(`[钉钉 Bridge/${this.botConfig.name}] 消息 data 解析失败`)
      return
    }

    const chatId = data.conversationId || data.senderStaffId || ''
    if (!chatId) return

    // 解析消息内容
    let text = ''
    const attachments: BridgeAttachment[] = []

    switch (data.contentType) {
      case 'text': {
        // 文本消息
        try {
          const content = JSON.parse(data.content)
          text = content.text || content.content || data.text?.content || ''
        } catch {
          text = data.content || data.text?.content || ''
        }
        break
      }

      case 'richText': {
        // 富文本消息
        try {
          const rich = JSON.parse(data.content)
          if (Array.isArray(rich.richText)) {
            for (const node of rich.richText) {
              if (node.text) text += node.text
            }
          }
        } catch {
          // 忽略
        }
        break
      }

      case 'picture': {
        // 图片消息
        try {
          const content = JSON.parse(data.content)
          const downloadCode = content.downloadCode || data.image?.downloadCode
          if (downloadCode) {
            const imageBuf = await this.downloadImage(downloadCode)
            const binding = this.commandHandler.getBinding(chatId)
            if (binding && imageBuf) {
              const path = saveImageToSession(binding.workspaceId, binding.sessionId, imageBuf, 0)
              attachments.push({ absolutePath: path, label: '图片', kind: 'image' })
            }
          }
        } catch (error) {
          logger.warn(`[钉钉 Bridge] 图片下载失败:`, redactSensitiveLogValue(error))
        }
        break
      }

      default:
        // 其他类型暂不支持
        return
    }

    if (!text.trim() && attachments.length === 0) return

    // 缓存 session webhook 用于回复
    if (data.sessionWebhook && data.sessionWebhookExpiredTime) {
      this.sessionWebhooks.set(chatId, {
        url: data.sessionWebhook,
        expiredAt: data.sessionWebhookExpiredTime * 1000,
      })
    }

    logger.info(`[钉钉 Bridge/${this.botConfig.name}] 收到消息:`, redactSensitiveLogValue({
      chatId: chatId.slice(0, 12),
      text: text.length > 100 ? text.slice(0, 100) + '...' : text,
      sender: data.senderNick || '',
    }))

    // 路由到命令处理器
    await this.commandHandler.handleIncomingMessage(chatId, text, chatId, attachments)
  }

  // ===== 发送消息 =====

  /** 通过 session webhook 发送文本 */
  async sendText(chatId: string, text: string, _contextToken?: string): Promise<void> {
    const webhook = this.sessionWebhooks.get(chatId)
    if (!webhook || Date.now() > webhook.expiredAt) {
      logger.warn(`[钉钉 Bridge/${this.botConfig.name}] session webhook 已过期或不存在`)
      return
    }

    // 钉钉单条消息有长度限制
    const MAX_LEN = 20000
    const chunks = text.length <= MAX_LEN
      ? [text]
      : text.match(new RegExp(`.{1,${MAX_LEN}}`, 'gs')) ?? [text]

    for (let i = 0; i < chunks.length; i++) {
      try {
        const resp = await fetch(webhook.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            msgtype: 'text',
            text: { content: chunks[i] },
          }),
        })

        if (!resp.ok) {
          logger.warn(`[钉钉 Bridge/${this.botConfig.name}] 发送消息失败: ${resp.status}`)
        }
      } catch (error) {
        logger.error(`[钉钉 Bridge/${this.botConfig.name}] 发送消息异常:`, redactSensitiveLogValue(error))
      }
    }
  }

  // ===== 媒体下载 =====

  private async downloadImage(downloadCode: string): Promise<Buffer | null> {
    // 钉钉图片下载需要 access_token
    try {
      const tokenResp = await fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appKey: this.botConfig.clientId,
          appSecret: getDecryptedDingTalkClientSecret(this.botConfig.id),
        }),
      })
      const tokenData = await tokenResp.json() as { accessToken?: string }
      const accessToken = tokenData.accessToken
      if (!accessToken) return null

      // 下载图片
      const downloadResp = await fetch(
        `https://api.dingtalk.com/v1.0/robot/messageFiles/download?downloadCode=${encodeURIComponent(downloadCode)}`,
        {
          method: 'GET',
          headers: { 'x-acs-dingtalk-access-token': accessToken },
        },
      )

      if (!downloadResp.ok) return null
      const buf = await downloadResp.arrayBuffer()
      return Buffer.from(buf)
    } catch (error) {
      logger.warn('[钉钉 Bridge] 下载图片失败:', redactSensitiveLogValue(error))
      return null
    }
  }

  // ===== 测试连接 =====

  async testConnection(clientId: string, clientSecret: string): Promise<{ success: boolean; message: string }> {
    try {
      const resp = await fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appKey: clientId, appSecret: clientSecret }),
      })

      if (resp.ok) {
        const data = await resp.json() as { accessToken?: string; expireIn?: number }
        if (data.accessToken) {
          return { success: true, message: '连接成功' }
        }
      }

      const errData = await resp.json().catch(() => null) as { message?: string } | null
      return { success: false, message: `钉钉 API 错误: ${errData?.message ?? resp.statusText}` }
    } catch (error) {
      return {
        success: false,
        message: `连接失败: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  // ===== 状态推送 =====

  private updateStatus(partial: Partial<DingTalkBotBridgeState>): void {
    this.state = { ...this.state, ...partial }
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('controller/bridge/dingtalkStatusChanged', this.state)
      }
    }
  }
}

export { DingTalkBridge }
