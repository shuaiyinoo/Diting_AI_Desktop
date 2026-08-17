/**
 * 飞书 Bridge 管理器
 *
 * 管理多个飞书 Bot Bridge 实例的生命周期：
 * - 启动时自动连接 enabled 的 Bot
 * - CRUD: 添加/更新/删除 Bot 配置
 * - 状态聚合查询
 * - 工作区/会话变更联动
 */

import { logger } from 'ee-core/log'
import { FeishuBridge, type FeishuBotBridgeState } from './feishu-bridge'
import {
  getFeishuMultiBotConfig,
  saveFeishuBotConfig,
  removeFeishuBot,
  getFeishuBotById,
  getFeishuBotBindingsPath,
  type FeishuBotConfig,
  type FeishuBotConfigInput,
} from './feishu-config'
import {
  createJsonBridgeChatBindingStore,
  type BridgeChatBinding,
} from './bridge-binding-store'

// ===== 管理器实现 =====

class FeishuBridgeManager {
  /** Bot ID → Bridge 实例 */
  private bridges = new Map<string, FeishuBridge>()
  /** 已启动标志 */
  private started = false

  /** 应用启动时自动连接 */
  async autoStart(): Promise<void> {
    if (this.started) return
    this.started = true

    const config = getFeishuMultiBotConfig()
    for (const bot of config.bots) {
      if (!bot.enabled) continue
      try {
        await this.startBridge(bot.id)
      } catch (error) {
        logger.error(`[飞书 Bridge Manager] 自动启动 Bot "${bot.name}" 失败:`, error)
      }
    }
  }

  /** 启动指定 Bot 的 Bridge */
  async startBridge(botId: string): Promise<void> {
    const botConfig = getFeishuBotById(botId)
    if (!botConfig) throw new Error(`Bot ${botId} 不存在`)

    // 如果已存在，先停止
    const existing = this.bridges.get(botId)
    if (existing) {
      existing.stop()
      this.bridges.delete(botId)
    }

    const bridge = new FeishuBridge(botConfig)
    this.bridges.set(botId, bridge)
    await bridge.start()
  }

  /** 停止指定 Bot */
  stopBridge(botId: string): void {
    const bridge = this.bridges.get(botId)
    if (bridge) {
      bridge.stop()
      this.bridges.delete(botId)
    }
  }

  /** 停止所有 Bridge */
  stopAll(): void {
    for (const [id, bridge] of this.bridges) {
      bridge.stop()
      this.bridges.delete(id)
    }
    this.started = false
  }

  // ===== CRUD =====

  /** 保存 Bot 配置（新建或更新） */
  async saveBot(input: FeishuBotConfigInput): Promise<FeishuBotConfig> {
    const bot = saveFeishuBotConfig(input)

    // 如果 Bot 已启用，启动 Bridge（新建的 Bot 也会自动连接）
    if (bot.enabled) {
      const existing = this.bridges.get(bot.id)
      if (existing) {
        existing.updateConfig(bot)
      }
      await this.startBridge(bot.id)
    } else {
      // 如果禁用，停止 Bridge
      this.stopBridge(bot.id)
    }

    return bot
  }

  /** 删除 Bot */
  deleteBot(botId: string): boolean {
    this.stopBridge(botId)
    return removeFeishuBot(botId)
  }

  // ===== 状态查询 =====

  /** 获取所有 Bot 配置（脱敏） */
  listBots(): FeishuBotConfig[] {
    return getFeishuMultiBotConfig().bots
  }

  /** 获取所有 Bridge 状态 */
  getAllStatuses(): FeishuBotBridgeState[] {
    const config = getFeishuMultiBotConfig()
    return config.bots.map((bot) => {
      const bridge = this.bridges.get(bot.id)
      return bridge ? bridge.getStatus() : {
        status: 'disconnected' as const,
        botId: bot.id,
        botName: bot.name,
      }
    })
  }

  /** 获取单个 Bot 状态 */
  getStatus(botId: string): FeishuBotBridgeState | null {
    const bridge = this.bridges.get(botId)
    if (bridge) return bridge.getStatus()
    const bot = getFeishuBotById(botId)
    if (!bot) return null
    return { status: 'disconnected', botId, botName: bot.name }
  }

  /** 测试连接 */
  async testConnection(appId: string, appSecret: string): Promise<{ success: boolean; message: string }> {
    // 创建临时 Bridge 实例进行测试
    const tempBot: FeishuBotConfig = {
      id: 'temp',
      name: '测试',
      enabled: false,
      appId,
      appSecret,
    }
    const tempBridge = new FeishuBridge(tempBot)
    return tempBridge.testConnection(appId, appSecret)
  }

  // ===== 绑定聚合查询 =====

  /** 获取所有 Bot 的所有绑定（含已停止 Bot 的持久化绑定） */
  listAllBindings(): BridgeChatBinding[] {
    const all: BridgeChatBinding[] = []
    for (const bridge of this.bridges.values()) {
      all.push(...bridge.listBindings())
    }
    // 也加载未启动 Bot 的持久化绑定
    const config = getFeishuMultiBotConfig()
    const activeBotIds = new Set(this.bridges.keys())
    for (const bot of config.bots) {
      if (activeBotIds.has(bot.id)) continue
      // 未启动的 Bot，从持久化文件加载
      try {
        const store = createJsonBridgeChatBindingStore(
          getFeishuBotBindingsPath(bot.id),
          `飞书-${bot.name}`,
        )
        const bindings = store.load()
        all.push(...bindings)
      } catch {
        // 忽略读取失败
      }
    }
    return all
  }

  /** 通过 chatId 查找对应的 Bridge 实例 */
  findBridgeByChatId(chatId: string): FeishuBridge | null {
    for (const bridge of this.bridges.values()) {
      const bindings = bridge.listBindings()
      if (bindings.some((b) => b.chatId === chatId)) {
        return bridge
      }
    }
    return null
  }

  // ===== 联动 =====

  /** 工作区删除时清理绑定 */
  onWorkspaceDeleted(workspaceId: string, sessionIds: Iterable<string>): void {
    for (const bridge of this.bridges.values()) {
      // BridgeCommandHandler 内部会处理
    }
  }

  /** 会话删除时清理绑定 */
  onSessionDeleted(_sessionId: string): void {
    // 各 Bridge 的 commandHandler 在 loadPersistedBindings 时会过滤
  }
}

// 单例导出
export const feishuBridgeManager = new FeishuBridgeManager()
