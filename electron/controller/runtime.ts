/**
 * Runtime 控制器
 *
 * 提供运行时环境的 API 接口：
 *   - getStatus：获取 Python/Node.js 运行时状态
 *   - setMirror：设置 pip/npm 镜像源模式
 *   - getMirrorOptions：获取可选镜像源列表
 *   - installPackages：通过 API 安装依赖包
 */

import { logger } from 'ee-core/log'
import {
  getRuntimeSummary,
} from '../components/pi/runtime/runtime-manager'
import {
  getRuntimeSettings,
  setPipMirrorMode,
  setNpmMirrorMode,
  getMirrorOptions,
  type MirrorMode,
} from '../components/pi/runtime/runtime-settings'

class RuntimeController {
  /**
   * 获取运行时环境状态
   */
  async getStatus(): Promise<{ code: number; data?: unknown; message?: string }> {
    try {
      const summary = getRuntimeSummary()
      const settings = getRuntimeSettings()
      return {
        code: 0,
        data: {
          python: {
            available: summary.python.available,
            source: summary.python.source,
            path: summary.python.path,
          },
          node: {
            available: summary.node.available,
            source: summary.node.source,
            path: summary.node.path,
          },
          git: {
            available: summary.git.available,
            source: summary.git.source,
            path: summary.git.path,
          },
          mirrors: {
            pipMirrorMode: settings.pipMirrorMode,
            npmMirrorMode: settings.npmMirrorMode,
            pypiMirror: settings.pypiMirror,
            npmRegistry: settings.npmRegistry,
          },
        },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[RuntimeController] getStatus 异常:', err)
      return { code: -1, message: msg }
    }
  }

  /**
   * 设置镜像源模式
   */
  async setMirror(args: {
    type: 'pip' | 'npm'
    mode: MirrorMode
  }): Promise<{ code: number; message?: string }> {
    try {
      if (args.type === 'pip') {
        setPipMirrorMode(args.mode)
      } else {
        setNpmMirrorMode(args.mode)
      }
      return { code: 0, message: `镜像源已切换为: ${args.mode}` }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[RuntimeController] setMirror 异常:', err)
      return { code: -1, message: msg }
    }
  }

  /**
   * 获取镜像源选项列表
   */
  async getMirrorOptions(): Promise<{ code: number; data?: unknown; message?: string }> {
    try {
      const options = getMirrorOptions()
      const settings = getRuntimeSettings()
      return {
        code: 0,
        data: {
          options,
          current: {
            pipMirrorMode: settings.pipMirrorMode,
            npmMirrorMode: settings.npmMirrorMode,
          },
        },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[RuntimeController] getMirrorOptions 异常:', err)
      return { code: -1, message: msg }
    }
  }
}

export default RuntimeController
