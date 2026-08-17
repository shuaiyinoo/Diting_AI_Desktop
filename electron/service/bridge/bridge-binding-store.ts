/**
 * Bridge 聊天绑定持久化
 *
 * 管理 IM chatId ↔ Diting Agent sessionId 的映射关系。
 * 每个平台/Bot 独立一份绑定文件，重启后可恢复。
 */

import { readJsonSafe, writeJsonAtomic } from './bridge-config'
import { logger } from 'ee-core/log'

/** 聊天绑定 */
export interface BridgeChatBinding {
  /** IM 平台的 chat ID */
  chatId: string
  /** 所属 Bot ID（多 Bot 场景下区分来源） */
  botId?: string
  /** IM 用户 ID（飞书 open_id / 钉钉 userId / 微信 wxid） */
  userId?: string
  /** Diting Agent 会话 ID */
  sessionId: string
  /** 绑定的工作区 ID */
  workspaceId: string
  /** 渠道 ID（模型渠道） */
  channelId: string
  /** 模型 ID（可选，per-chat 切换） */
  modelId?: string
  /** 聊天类型（单聊或群聊） */
  chatType?: 'p2p' | 'group'
  /** 群名称（群聊时） */
  groupName?: string
  /** 绑定来源 */
  source?: 'feishu' | 'wechat' | 'dingtalk'
  /** 是否已归档 */
  archived?: boolean
  /** 归档时间 */
  archivedAt?: number
  /** 创建时间 */
  createdAt: number
  /** 最近一次收到该聊天消息的时间 */
  lastUsedAt?: number
}

/** 更新绑定请求（前端 → 主进程） */
export interface BridgeUpdateBindingInput {
  /** 目标 chat ID */
  chatId: string
  /** 新的工作区 ID（不传则不修改） */
  workspaceId?: string
  /** 新的会话 ID（不传则不修改） */
  sessionId?: string
  /** 是否归档该绑定（不传则不修改） */
  archived?: boolean
}

/** 绑定存储接口 */
export interface BridgeChatBindingStore {
  /** 加载所有绑定 */
  load(): BridgeChatBinding[]
  /** 保存所有绑定 */
  save(bindings: BridgeChatBinding[]): void
}

/** JSON 文件绑定存储 */
export class JsonBridgeChatBindingStore implements BridgeChatBindingStore {
  private readonly filePath: string
  private readonly label: string

  constructor(filePath: string, label: string) {
    this.filePath = filePath
    this.label = label
  }

  load(): BridgeChatBinding[] {
    const data = readJsonSafe<BridgeChatBinding[]>(this.filePath, [])
    logger.info(`[${this.label}] 加载了 ${data.length} 个聊天绑定`)
    return data
  }

  save(bindings: BridgeChatBinding[]): void {
    writeJsonAtomic(this.filePath, bindings)
  }
}

/** 创建 JSON 绑定存储 */
export function createJsonBridgeChatBindingStore(filePath: string, label: string): BridgeChatBindingStore {
  return new JsonBridgeChatBindingStore(filePath, label)
}

/** 过滤掉会话已不存在的绑定 */
export function filterExistingBridgeBindings(
  bindings: BridgeChatBinding[],
  sessionExists: (sessionId: string) => boolean,
): BridgeChatBinding[] {
  return bindings.filter((b) => sessionExists(b.sessionId))
}
