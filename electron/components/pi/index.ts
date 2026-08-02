/**
 * Pi Agent 初始化模块
 *
 * 应用启动时调用，负责：
 * - 同步默认 Skills 到用户目录
 * - 升级工作区 Skills
 */

import { logger } from 'ee-core/log'
import { seedDefaultSkills, upgradeDefaultSkillsInWorkspaces } from './skills/skills-manager'

/** 是否已初始化 */
let initialized = false

/**
 * 初始化 Pi Agent 环境
 *
 * 应在 app ready 后调用。
 */
export function initPiAgent(): void {
  if (initialized) {
    logger.info('[Pi Agent] 已初始化，跳过')
    return
  }

  try {
    logger.info('[Pi Agent] 开始初始化...')

    // 同步默认 Skills
    seedDefaultSkills()

    // 升级工作区 Skills
    upgradeDefaultSkillsInWorkspaces()

    initialized = true
    logger.info('[Pi Agent] 初始化完成')
  } catch (err) {
    logger.error('[Pi Agent] 初始化失败:', err)
  }
}
