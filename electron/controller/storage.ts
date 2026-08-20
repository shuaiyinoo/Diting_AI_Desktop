/**
 * 存储管理控制器
 *
 * 提供磁盘用量统计和临时文件清理功能。
 *   - getStats：获取各数据类别的磁盘占用统计
 *   - cleanup：按指定类别清理存储
 *   - cleanupTemp：仅清理临时文件（快捷操作）
 */

import { logger } from 'ee-core/log'
import {
  calculateStorageStats,
  cleanupStorage,
  cleanupTempFiles,
  type CleanupOptions,
} from '../service/storage-service'

class StorageController {
  /**
   * 获取存储统计
   */
  async getStats(): Promise<{ code: number; data?: unknown; message?: string }> {
    try {
      const stats = await calculateStorageStats()
      return { code: 0, data: stats }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[StorageController] getStats 异常:', err)
      return { code: -1, message: msg }
    }
  }

  /**
   * 按类别清理存储
   */
  async cleanup(args: CleanupOptions): Promise<{ code: number; data?: unknown; message?: string }> {
    try {
      const result = await cleanupStorage(args)
      return { code: 0, data: result }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[StorageController] cleanup 异常:', err)
      return { code: -1, message: msg }
    }
  }

  /**
   * 仅清理临时文件
   */
  async cleanupTemp(): Promise<{ code: number; data?: unknown; message?: string }> {
    try {
      const result = await cleanupTempFiles()
      return { code: 0, data: result }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[StorageController] cleanupTemp 异常:', err)
      return { code: -1, message: msg }
    }
  }
}

export default StorageController
