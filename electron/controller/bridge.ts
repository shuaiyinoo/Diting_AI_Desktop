/**
 * Bridge 控制器
 *
 * 提供 IM 渠道（飞书/微信/钉钉）管理的 IPC 接口。
 * 前端通过 ipc.invoke('controller/bridge/<method>', args) 调用。
 *
 * 方法清单：
 *   飞书:
 *     - feishuListBots
 *     - feishuSaveBot
 *     - feishuDeleteBot
 *     - feishuStartBot
 *     - feishuStopBot
 *     - feishuGetStatuses
 *     - feishuTestConnection
 *     - feishuRegisterApp（扫码快速创建飞书 Bot）
 *     - feishuCancelRegister（取消扫码注册流程）
 *     - feishuListBindings（获取所有聊天绑定）
 *     - feishuUpdateBinding（更新绑定的工作区/会话）
 *     - feishuRemoveBinding（移除绑定）
 *   微信:
 *     - wechatGetConfig (获取配置，凭证已脱敏)
 *     - wechatStartLogin (扫码登录，自动获取凭证并连接)
 *     - wechatLogout (登出，清除凭证)
 *     - wechatStart (用已有凭证启动长轮询)
 *     - wechatStop (停止长轮询)
 *     - wechatGetStatus (获取 Bridge 状态)
 *   钉钉:
 *     - dingtalkListBots
 *     - dingtalkSaveBot
 *     - dingtalkDeleteBot
 *     - dingtalkStartBot
 *     - dingtalkStopBot
 *     - dingtalkGetStatuses
 *     - dingtalkTestConnection
 */

import { logger } from 'ee-core/log'
import { feishuBridgeManager } from '../service/bridge/feishu-bridge-manager'
import { wechatBridge } from '../service/bridge/wechat-bridge'
import { dingtalkBridgeManager } from '../service/bridge/dingtalk-bridge-manager'
import {
  getFeishuMultiBotConfig,
} from '../service/bridge/feishu-config'
import {
  getWeChatConfig,
} from '../service/bridge/wechat-config'
import {
  getDingTalkMultiBotConfig,
} from '../service/bridge/dingtalk-config'
import {
  startFeishuRegisterApp,
  cancelFeishuRegisterApp,
  type FeishuRegisterResult,
} from '../service/bridge/feishu-register'

// ===== 返回类型 =====

interface IpcResult<T = unknown> {
  code: number
  message?: string
  data?: T
}

function ok<T>(data: T): IpcResult<T> {
  return { code: 0, data }
}

function fail(message: string): IpcResult<never> {
  return { code: -1, message }
}

class BridgeController {
  // ===== 自动启动 =====

  /** 应用启动时自动连接已启用的 Bridge */
  async autoStart(): Promise<IpcResult<{ feishu: number; wechat: boolean; dingtalk: number }>> {
    try {
      // 飞书
      let feishuCount = 0
      const feishuConfig = getFeishuMultiBotConfig()
      for (const bot of feishuConfig.bots) {
        if (bot.enabled) {
          try {
            await feishuBridgeManager.startBridge(bot.id)
            feishuCount++
          } catch (err) {
            logger.error(`[Bridge] 自动启动飞书 Bot "${bot.name}" 失败:`, err)
          }
        }
      }

      // 微信：用已有凭证自动启动长轮询
      let wechatStarted = false
      const wechatConfig = getWeChatConfig()
      if (wechatConfig.enabled && wechatConfig.credentials) {
        try {
          await wechatBridge.start()
          wechatStarted = true
        } catch (err) {
          logger.error('[Bridge] 自动启动微信失败:', err)
        }
      }

      // 钉钉
      let dingtalkCount = 0
      const dingtalkConfig = getDingTalkMultiBotConfig()
      for (const bot of dingtalkConfig.bots) {
        if (bot.enabled) {
          try {
            await dingtalkBridgeManager.startBridge(bot.id)
            dingtalkCount++
          } catch (err) {
            logger.error(`[Bridge] 自动启动钉钉 Bot "${bot.name}" 失败:`, err)
          }
        }
      }

      return ok({ feishu: feishuCount, wechat: wechatStarted, dingtalk: dingtalkCount })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  // ===== 飞书 =====

  async feishuListBots(): Promise<IpcResult> {
    try {
      const bots = feishuBridgeManager.listBots()
      // 脱敏 appSecret
      const safe = bots.map((b) => ({ ...b, appSecret: b.appSecret ? '***' : '' }))
      return ok(safe)
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  async feishuSaveBot(args: {
    id?: string
    name: string
    enabled: boolean
    appId: string
    appSecret: string
    defaultWorkspaceId?: string
    defaultChannelId?: string
    defaultModelId?: string
  }): Promise<IpcResult> {
    try {
      const bot = await feishuBridgeManager.saveBot(args)
      return ok({ ...bot, appSecret: '***' })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  async feishuDeleteBot(args: { botId: string }): Promise<IpcResult> {
    try {
      const success = feishuBridgeManager.deleteBot(args.botId)
      return ok({ success })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  async feishuStartBot(args: { botId: string }): Promise<IpcResult> {
    try {
      await feishuBridgeManager.startBridge(args.botId)
      return ok({ success: true })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  async feishuStopBot(args: { botId: string }): Promise<IpcResult> {
    try {
      feishuBridgeManager.stopBridge(args.botId)
      return ok({ success: true })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  async feishuGetStatuses(): Promise<IpcResult> {
    try {
      return ok(feishuBridgeManager.getAllStatuses())
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  async feishuTestConnection(args: {
    appId: string
    appSecret: string
  }): Promise<IpcResult> {
    try {
      const result = await feishuBridgeManager.testConnection(args.appId, args.appSecret)
      return ok(result)
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  // ===== 飞书扫码注册 =====

  /**
   * 启动飞书扫码注册流程
   *
   * 调用后飞书 SDK 会生成二维码 URL，通过 IPC 事件
   * 'controller/bridge/feishuRegisterQrcode' 推送给前端。
   * 用户扫码确认后，返回 App ID / App Secret。
   */
  async feishuRegisterApp(): Promise<IpcResult<FeishuRegisterResult>> {
    try {
      const result = await startFeishuRegisterApp()
      return ok(result)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // SDK 在 abort 时抛出的错误，不作为错误展示
      if (msg.includes('aborted') || msg.includes('Abort')) {
        return fail('已取消')
      }
      return fail(msg)
    }
  }

  /** 取消正在进行的飞书扫码注册流程 */
  async feishuCancelRegister(): Promise<IpcResult> {
    try {
      cancelFeishuRegisterApp()
      return ok({ success: true })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  // ===== 飞书绑定管理 =====

  /** 获取所有飞书聊天绑定（含已停止 Bot 的持久化绑定） */
  async feishuListBindings(): Promise<IpcResult> {
    try {
      const bindings = feishuBridgeManager.listAllBindings()
      return ok(bindings)
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  /** 更新飞书绑定的工作区/会话/归档状态 */
  async feishuUpdateBinding(args: {
    chatId: string
    workspaceId?: string
    sessionId?: string
    archived?: boolean
  }): Promise<IpcResult> {
    try {
      const bridge = feishuBridgeManager.findBridgeByChatId(args.chatId)
      if (!bridge) {
        return fail('未找到该聊天的绑定（Bot 可能未启动）')
      }
      const result = bridge.updateBinding(args)
      if (!result) {
        return fail('绑定不存在')
      }
      return ok(result)
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  /** 移除飞书绑定 */
  async feishuRemoveBinding(args: { chatId: string }): Promise<IpcResult> {
    try {
      const bridge = feishuBridgeManager.findBridgeByChatId(args.chatId)
      if (!bridge) {
        return fail('未找到该聊天的绑定（Bot 可能未启动）')
      }
      const success = bridge.removeBinding(args.chatId)
      return ok({ success })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  // ===== 微信 =====

  /** 获取微信配置（凭证已脱敏，只返回是否有凭证） */
  async wechatGetConfig(): Promise<IpcResult> {
    try {
      const config = getWeChatConfig()
      return ok({
        enabled: config.enabled,
        hasCredentials: !!config.credentials,
        defaultWorkspaceId: config.defaultWorkspaceId,
      })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  /** 开始扫码登录（自动获取凭证 + 启动长轮询） */
  async wechatStartLogin(): Promise<IpcResult> {
    try {
      await wechatBridge.startLogin()
      return ok({ success: true })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  /** 登出（停止连接 + 清除凭证） */
  async wechatLogout(): Promise<IpcResult> {
    try {
      wechatBridge.logout()
      return ok({ success: true })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  /** 用已有凭证启动长轮询 */
  async wechatStart(): Promise<IpcResult> {
    try {
      await wechatBridge.start()
      return ok({ success: true })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  /** 停止长轮询 */
  async wechatStop(): Promise<IpcResult> {
    try {
      wechatBridge.stop()
      return ok({ success: true })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  /** 获取 Bridge 状态 */
  async wechatGetStatus(): Promise<IpcResult> {
    try {
      return ok(wechatBridge.getStatus())
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  // ===== 钉钉 =====

  async dingtalkListBots(): Promise<IpcResult> {
    try {
      const bots = dingtalkBridgeManager.listBots()
      const safe = bots.map((b) => ({ ...b, clientSecret: b.clientSecret ? '***' : '' }))
      return ok(safe)
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  async dingtalkSaveBot(args: {
    id?: string
    name: string
    enabled: boolean
    clientId: string
    clientSecret: string
    defaultWorkspaceId?: string
    defaultChannelId?: string
    defaultModelId?: string
  }): Promise<IpcResult> {
    try {
      const bot = await dingtalkBridgeManager.saveBot(args)
      return ok({ ...bot, clientSecret: '***' })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  async dingtalkDeleteBot(args: { botId: string }): Promise<IpcResult> {
    try {
      const success = dingtalkBridgeManager.deleteBot(args.botId)
      return ok({ success })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  async dingtalkStartBot(args: { botId: string }): Promise<IpcResult> {
    try {
      await dingtalkBridgeManager.startBridge(args.botId)
      return ok({ success: true })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  async dingtalkStopBot(args: { botId: string }): Promise<IpcResult> {
    try {
      dingtalkBridgeManager.stopBridge(args.botId)
      return ok({ success: true })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  async dingtalkGetStatuses(): Promise<IpcResult> {
    try {
      return ok(dingtalkBridgeManager.getAllStatuses())
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }

  async dingtalkTestConnection(args: {
    clientId: string
    clientSecret: string
  }): Promise<IpcResult> {
    try {
      const result = await dingtalkBridgeManager.testConnection(args.clientId, args.clientSecret)
      return ok(result)
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
  }
}

export default BridgeController
