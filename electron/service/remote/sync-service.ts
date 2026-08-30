/**
 * 数据同步服务（Electron 主进程）
 *
 * 职责：
 *   1. 订阅 Cloud 后端的 sync 请求 topic（/topic/sync/desktop/{userId}）
 *   2. 收到 Mobile 的 sync 请求后，调用本地 IPC 查询数据
 *   3. 将结果通过 /app/sync-result 回传给 Mobile
 *
 * 与 signaling-service 的关系：
 *   sync-service 复用 signaling-service 建立的 STOMP 连接，
 *   不单独建立连接 —— 一个 Desktop 只维护一条 /ws/desktop 连接。
 */

import { logger } from 'ee-core/log'
import { getAccessToken, getCloudBaseUrl } from '../cloud-api'
import { remoteSignaling } from './signaling-service'
import { deflateSync } from 'node:zlib'
import { assistantService } from '../../components/rag/assistant/assistantService'
import {
  listWorkspaces,
} from '../../components/pi/adapters/workspace-manager'
import {
  listSessions,
  getSessionMessages,
} from '../../components/pi/adapters/pi-agent-service'
import type { AgentSessionMeta } from '../../components/pi/types'
import type { WorkspaceMeta } from '../../components/pi/adapters/workspace-manager'

/* ══════════════════ 类型定义 ══════════════════ */

/** sync 请求消息（与后端 SyncMessage 对齐） */
interface SyncMessage {
  requestId: string
  action: string
  userId?: number
  sessionId?: string
}

/** sync 结果消息（与后端 SyncResultMessage 对齐）
 *
 * 当 compressed 为 true 时，data 字段为 Base64 编码的 zlib deflate 压缩数据；
 * Mobile 端收到后需先 Base64 解码再 inflate 解压，最后 JSON.parse。
 * 当 compressed 为 false 或缺省时，data 为普通 JSON 字符串（向后兼容）。
 */
interface SyncResultMessage {
  requestId: string
  action: string
  data: string
  compressed?: boolean
  error: string | null
}

/** Chat 会话列表项（Mobile 端需要的数据格式） */
interface ChatSessionItem {
  id: number
  title: string
  lastMessageAt: string | null
}

/** Agent 项目列表项（Mobile 端需要的数据格式） */
interface AgentWorkspaceItem {
  id: string
  name: string
  slug: string
}

/** Agent 会话列表项（Mobile 端需要的数据格式） */
interface AgentSessionItem {
  id: string
  title: string
  workspaceId: string
  updatedAt: number
}

/** Agent 完整同步数据 */
interface AgentSyncData {
  workspaces: AgentWorkspaceItem[]
  sessions: AgentSessionItem[]
}

/* ══════════════════ 服务实现 ══════════════════ */

class RemoteSyncService {
  /** 是否已订阅 sync topic */
  private subscribed = false

  /**
   * 在 STOMP 连接成功后调用，订阅 sync 请求 topic。
   * 复用 signaling-service 的 StompClient。
   */
  startSync(): void {
    if (this.subscribed) return
    if (!remoteSignaling.connected) {
      logger.warn('[sync] STOMP 未连接，无法订阅 sync topic')
      return
    }

    // 获取当前用户的 userId，用于拼 sync topic
    const userId = this.getCurrentUserId()
    if (!userId) {
      logger.warn('[sync] 无法获取当前用户 ID，跳过 sync 订阅')
      return
    }

    const topic = `/topic/sync/desktop/${userId}`
    remoteSignaling.subscribeToTopic(topic, (body: string) => {
      try {
        const msg = JSON.parse(body) as SyncMessage
        void this.handleSyncRequest(msg)
      } catch (err) {
        logger.error('[sync] 解析 sync 请求失败:', err)
      }
    })

    this.subscribed = true
    logger.info(`[sync] 已订阅 sync 请求 topic: ${topic}`)
  }

  /** 断开时重置状态（由 signaling-service 的 onStateChange 调用） */
  resetSubscribed(): void {
    this.subscribed = false
  }

  /* ══════════════════ 请求处理 ══════════════════ */

  private async handleSyncRequest(msg: SyncMessage): Promise<void> {
    logger.info(`[sync] 收到请求 requestId=${msg.requestId} action=${msg.action} sessionId=${msg.sessionId ?? '-'}`)

    const result: SyncResultMessage = {
      requestId: msg.requestId,
      action: msg.action,
      data: '',
      error: null,
    }

    try {
      let rawData: string
      switch (msg.action) {
        case 'syncChatSessions':
          rawData = JSON.stringify(this.getChatSessions())
          break
        case 'syncAgentData':
          rawData = JSON.stringify(this.getAgentData())
          break
        case 'syncChatMessages':
          rawData = JSON.stringify(this.getChatMessages(msg.sessionId))
          break
        case 'syncAgentMessages':
          rawData = JSON.stringify(this.getAgentMessages(msg.sessionId))
          break
        default:
          result.error = `未知的 sync action: ${msg.action}`
          logger.warn(`[sync] 未知 action: ${msg.action}`)
          this.sendResult(result)
          return
      }
      // 压缩数据：JSON → zlib deflate → Base64
      // 对消息历史（通常体积大）压缩比可达 70%~90%
      const compressed = this.compressData(rawData)
      result.data = compressed.data
      result.compressed = compressed.isCompressed
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err)
      logger.error('[sync] 处理请求异常:', err)
    }

    this.sendResult(result)
  }

  /* ══════════════════ 数据查询 ══════════════════ */

  /** 查询 Chat 会话列表 */
  private getChatSessions(): ChatSessionItem[] {
    const sessions = assistantService.listSessions()
    return sessions.map((s) => ({
      id: s.sessionId,
      title: s.title,
      lastMessageAt: s.lastMessageAt,
    }))
  }

  /** 查询 Agent 项目 + 会话列表 */
  private getAgentData(): AgentSyncData {
    const workspaces: WorkspaceMeta[] = listWorkspaces()
    const allSessions: AgentSessionMeta[] = listSessions()

    const workspaceItems: AgentWorkspaceItem[] = workspaces.map((ws) => ({
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
    }))

    const sessionItems: AgentSessionItem[] = allSessions.map((s) => ({
      id: s.id,
      title: s.title,
      workspaceId: s.workspaceId || '',
      updatedAt: s.updatedAt,
    }))

    return {
      workspaces: workspaceItems,
      sessions: sessionItems,
    }
  }

  /* ══════════════════ 消息历史查询 ══════════════════ */

  /** 查询 Chat 会话消息历史 */
  private getChatMessages(sessionId?: string): unknown {
    if (!sessionId) {
      throw new Error('缺少 sessionId 参数')
    }
    const sid = parseInt(sessionId, 10)
    if (isNaN(sid) || sid <= 0) {
      throw new Error('sessionId 非法')
    }
    const context = assistantService.getConversationContext(sid, 50)
    const messages = (context.recentMessages || []).map((m) => ({
      id: m.messageId ?? m.id,
      role: String(m.role).toLowerCase(),
      content: m.content,
      citations: m.citations || [],
      pending: false,
      time: m.createdAt ?? '',
    }))
    return { sessionId: sid, messages }
  }

  /** 查询 Agent 会话消息历史 */
  private getAgentMessages(sessionId?: string): unknown {
    if (!sessionId) {
      throw new Error('缺少 sessionId 参数')
    }
    const messages = getSessionMessages(sessionId)
    return messages.map((m: Record<string, unknown>) => {
      const role = String(m.role).toLowerCase()
      let content = m.content
      if (typeof content !== 'string') {
        // 兼容 content 为数组的情况（提取 text 块）
        if (Array.isArray(content)) {
          content = (content as Array<{ type: string; text?: string }>)
            .filter((b) => b.type === 'text')
            .map((b) => b.text || '')
            .join('')
        } else {
          content = ''
        }
      }
      return {
        id: m.id ?? m.messageId ?? `msg-${Date.now()}-${Math.random()}`,
        role,
        content,
        blocks: [],
        pending: false,
        time: m.timestamp ? new Date(m.timestamp as string | number).toISOString() : (m.time || ''),
      }
    })
  }

  /* ══════════════════ 压缩 ══════════════════ */

  /** 压缩阈值（1KB 以下的数据不压缩，避免增加编码开销） */
  private static readonly COMPRESS_THRESHOLD = 1024

  /**
   * 将 JSON 字符串压缩为 Base64 编码的 zlib deflate 数据。
   *
   * 压缩流程：
   *   1. UTF-8 编码 JSON 字符串 → Buffer
   *   2. zlib.deflateSync 压缩
   *   3. Base64 编码（STOMP body 只能传字符串）
   *
   * 解压端（Mobile）对应流程：
   *   1. Base64 解码 → Uint8Array
   *   2. pako.inflate 解压
   *   3. TextDecoder UTF-8 解码 → JSON.parse
   */
  private compressData(jsonStr: string): { data: string; isCompressed: boolean } {
    // 小数据不压缩，直接返回明文（向后兼容）
    if (jsonStr.length < RemoteSyncService.COMPRESS_THRESHOLD) {
      return { data: jsonStr, isCompressed: false }
    }

    try {
      const buf = Buffer.from(jsonStr, 'utf-8')
      const compressed = deflateSync(buf, { level: 9 })
      const b64 = compressed.toString('base64')
      const ratio = ((1 - b64.length / jsonStr.length) * 100).toFixed(1)
      logger.info(`[sync] 压缩: ${jsonStr.length} → ${b64.length} 字节 (${ratio}%)`)
      return { data: b64, isCompressed: true }
    } catch (err) {
      logger.warn('[sync] 压缩失败，降级为明文:', err)
      return { data: jsonStr, isCompressed: false }
    }
  }

  /* ══════════════════ 结果回传 ══════════════════ */

  /** 通过 /app/sync-result 将结果回传给后端，由后端转发给 Mobile */
  private sendResult(result: SyncResultMessage): void {
    if (!remoteSignaling.connected) {
      logger.warn('[sync] STOMP 未连接，无法回传结果')
      return
    }

    remoteSignaling.publishToApp('/app/sync-result', result)
    logger.info(`[sync] 已回传结果 requestId=${result.requestId} action=${result.action}`)
  }

  /* ══════════════════ 辅助 ══════════════════ */

  /** 从 cloud-api 获取当前用户 ID */
  private getCurrentUserId(): number | null {
    // remoteSignaling 已经有获取 userId 的方式
    // 这里直接从 cloud-api 的存储中读取
    const user = remoteSignaling.getCurrentUserId()
    return user
  }
}

export const remoteSyncService = new RemoteSyncService()
