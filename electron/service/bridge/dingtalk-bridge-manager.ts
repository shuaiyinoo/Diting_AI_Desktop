/**
 * 钉钉 Bridge 管理器
 *
 * 管理多个钉钉 Bot Bridge 实例的生命周期。
 */

import { logger } from 'ee-core/log'
import { DingTalkBridge, type DingTalkBotBridgeState } from './dingtalk-bridge'
import {
  getDingTalkMultiBotConfig,
  saveDingTalkBotConfig,
  removeDingTalkBot,
  getDingTalkBotById,
  type DingTalkBotConfig,
  type DingTalkBotConfigInput,
} from './dingtalk-config'

class DingTalkBridgeManager {
  private bridges = new Map<string, DingTalkBridge>()
  private started = false

  async autoStart(): Promise<void> {
    if (this.started) return
    this.started = true

    const config = getDingTalkMultiBotConfig()
    for (const bot of config.bots) {
      if (!bot.enabled) continue
      try {
        await this.startBridge(bot.id)
      } catch (error) {
        logger.error(`[钉钉 Bridge Manager] 自动启动 Bot "${bot.name}" 失败:`, error)
      }
    }
  }

  async startBridge(botId: string): Promise<void> {
    const botConfig = getDingTalkBotById(botId)
    if (!botConfig) throw new Error(`Bot ${botId} 不存在`)

    const existing = this.bridges.get(botId)
    if (existing) {
      existing.stop()
      this.bridges.delete(botId)
    }

    const bridge = new DingTalkBridge(botConfig)
    this.bridges.set(botId, bridge)
    await bridge.start()
  }

  stopBridge(botId: string): void {
    const bridge = this.bridges.get(botId)
    if (bridge) {
      bridge.stop()
      this.bridges.delete(botId)
    }
  }

  stopAll(): void {
    for (const [id, bridge] of this.bridges) {
      bridge.stop()
      this.bridges.delete(id)
    }
    this.started = false
  }

  async saveBot(input: DingTalkBotConfigInput): Promise<DingTalkBotConfig> {
    const bot = saveDingTalkBotConfig(input)

    if (bot.enabled) {
      // 无论是否已有 Bridge 实例，enabled 就启动（新建的 Bot 也会自动连接）
      const existing = this.bridges.get(bot.id)
      if (existing) {
        existing.updateConfig(bot)
      }
      await this.startBridge(bot.id)
    } else {
      this.stopBridge(bot.id)
    }

    return bot
  }

  deleteBot(botId: string): boolean {
    this.stopBridge(botId)
    return removeDingTalkBot(botId)
  }

  listBots(): DingTalkBotConfig[] {
    return getDingTalkMultiBotConfig().bots
  }

  getAllStatuses(): DingTalkBotBridgeState[] {
    const config = getDingTalkMultiBotConfig()
    return config.bots.map((bot) => {
      const bridge = this.bridges.get(bot.id)
      return bridge ? bridge.getStatus() : {
        status: 'disconnected' as const,
        botId: bot.id,
        botName: bot.name,
      }
    })
  }

  getStatus(botId: string): DingTalkBotBridgeState | null {
    const bridge = this.bridges.get(botId)
    if (bridge) return bridge.getStatus()
    const bot = getDingTalkBotById(botId)
    if (!bot) return null
    return { status: 'disconnected', botId, botName: bot.name }
  }

  async testConnection(clientId: string, clientSecret: string): Promise<{ success: boolean; message: string }> {
    const tempBot: DingTalkBotConfig = {
      id: 'temp',
      name: '测试',
      enabled: false,
      clientId,
      clientSecret,
    }
    const tempBridge = new DingTalkBridge(tempBot)
    return tempBridge.testConnection(clientId, clientSecret)
  }
}

export const dingtalkBridgeManager = new DingTalkBridgeManager()
