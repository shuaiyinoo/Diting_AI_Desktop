/**
 * 远程控制指令执行器
 *
 * 职责：把控制端（Mobile）通过 DataChannel 发来的指令，翻译成对当前受控机的真实输入。
 *   - 鼠标移动：归一化坐标 (u,v) ∈ [0,1] → 当前激活屏的 OS 全局逻辑坐标
 *   - 鼠标按键 / 滚轮 / 键盘：转发给 InputDriver（底层 node-enigo）
 *
 * 坐标映射是远程控制最容易出错的环节：副屏位于主屏左侧时其 bounds.x 为负，
 * 必须加上该偏移，否则点击整体错位。这里统一用 DisplayInfo 的 x/y 兜底。
 *
 * 依赖 session-window 维护的显示器拓扑与「当前激活屏」——因为一次只投一块屏，
 * 控制端永远只操作被投放的那块，不存在同时跨多屏。
 */

import { logger } from 'ee-core/log'
import type { DisplayInfo } from './session-window'
import { EnigoInputDriver, toButtonName, type InputDriver } from './input-driver'

/** 底层驱动可替换（robotjs / nut.js 等），默认用 enigo */
let driver: InputDriver = new EnigoInputDriver()

/** 仅供测试替换底层驱动 */
export function setInputDriver(d: InputDriver): void {
  driver = d
}

/**
 * ── 鼠标移动合并（背压感知的消费者循环）──
 *
 * 设计权衡（两种极端都不是想要的）：
 *  - 旧方案 A：每条 mm 进串行链、逐条 `await` 原生 FFI → 队列越积越长，长拖动时光标越掉越远（"慢但能看到"）。
 *  - 旧方案 B：固定 16ms 定时器只刷最新 → 移动与到达速率解耦，但定时器与驱动 FFI 实际耗时无关，
 *    若 moveAbs 本身 > 16ms 仍会在驱动层叠队列，且移动只按固定节奏刷新。
 *  - 本方案：只保留【最新】目标，用一个常驻消费者循环「有目标就刷、刷完再看有无新目标」，
 *    与驱动 FFI 的真实耗时节点的背压绑定——光标永远朝最新位置走，最多 1 条在途 + 1 条缓冲，
 *    既不堆积、又实时跟手。按下/抬起前用 flushMove 等一次落位，保证点/拖不落在旧坐标。
 */
let moveTarget: { x: number; y: number } | null = null
let moveRunning = false
let moveResolvers: Array<() => void> = []

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n))
}

/** 把一次移动入队（只保留最新位置，不进串行链） */
export function enqueueMove(u: number, v: number, displays: DisplayInfo[], activeDisplayId: number | null): void {
  const disp = resolveActiveDisplay(displays, activeDisplayId)
  if (!disp) {
    logger.warn('[remote] 无显示器拓扑，丢弃鼠标移动')
    return
  }
  // 归一化坐标 → 全局逻辑坐标（加回副屏负偏移），只存最新
  moveTarget = {
    x: disp.x + clamp01(Number(u) || 0) * disp.width,
    y: disp.y + clamp01(Number(v) || 0) * disp.height,
  }
  if (!moveRunning) {
    moveRunning = true
    void pumpMove()
  }
}

/** 消费者循环：持续把光标刷到最新目标，直到没有新目标为止 */
async function pumpMove(): Promise<void> {
  while (true) {
    if (!moveTarget) {
      moveRunning = false
      return
    }
    const t = moveTarget
    moveTarget = null
    try {
      await driver.moveAbs(t.x, t.y)
    } catch (e) {
      logger.error('[remote] 移动执行失败:', e)
    }
    // 本次已落位，唤醒等待按下/抬起的 flushMove
    const waiters = moveResolvers
    moveResolvers = []
    for (const r of waiters) r()
  }
}

/** 在下发按下/抬起前，等光标至少落位一次（防点/拖落在旧坐标）。带超时兜底，绝不死锁串行链。 */
export async function flushMove(): Promise<void> {
  if (!moveRunning && !moveTarget) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 100)
    moveResolvers.push(() => {
      clearTimeout(timer)
      resolve()
    })
  })
}

/**
 * DOM KeyboardEvent.key → node-enigo 键名 的归一化。
 * enigo 接受：小写字母、'space'/'return'/'shift'/'control'/'alt'/'meta'/'up'/'f1'… 等。
 */
const KEY_MAP: Record<string, string> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Escape: 'escape',
  Esc: 'escape',
  Enter: 'return',
  Return: 'return',
  Backspace: 'backspace',
  Delete: 'delete',
  Del: 'del',
  Tab: 'tab',
  Space: 'space',
  ' ': 'space',
  Spacebar: 'space',
  Home: 'home',
  End: 'end',
  PageUp: 'pageup',
  PageDown: 'pagedown',
  Shift: 'shift',
  Control: 'control',
  Ctrl: 'control',
  Alt: 'alt',
  Option: 'option',
  Meta: 'meta',
  OS: 'meta',
  Win: 'meta',
  Windows: 'meta',
  CapsLock: 'capslock',
  ContextMenu: 'contextmenu',
}

function normalizeKey(k: unknown): string {
  if (typeof k !== 'string' || !k) return ''
  const direct = KEY_MAP[k] ?? KEY_MAP[k.toLowerCase()]
  if (direct) return direct
  if (k.length === 1) return k.toLowerCase()
  const lower = k.toLowerCase()
  if (/^f([1-9]|1[0-2])$/.test(lower)) return lower // f1..f12
  return lower
}

/** 解析当前激活屏；未指定时退回主屏，再退回第一块 */
function resolveActiveDisplay(
  displays: DisplayInfo[],
  activeDisplayId: number | null,
): DisplayInfo | null {
  if (activeDisplayId != null) {
    const hit = displays.find((d) => d.id === activeDisplayId)
    if (hit) return hit
  }
  return displays.find((d) => d.primary) ?? displays[0] ?? null
}

interface RawCommand {
  t: string
  u?: number
  v?: number
  b?: number
  dy?: number
  dx?: number
  k?: string
  m?: string[]
  s?: string
}

/**
 * 执行一条控制指令。
 * @param cmd        控制端指令（已 JSON.parse）
 * @param displays   主进程采集到的显示器拓扑
 * @param activeDisplayId 当前被投放的显示器 id（来自隐藏窗口的回传）
 */
export async function executeCommand(
  cmd: RawCommand,
  displays: DisplayInfo[],
  activeDisplayId: number | null,
): Promise<void> {
  if (!cmd || typeof cmd.t !== 'string') return
  try {
    switch (cmd.t) {
      case 'mm': {
        const disp = resolveActiveDisplay(displays, activeDisplayId)
        if (!disp) {
          logger.warn('[remote] 无显示器拓扑，丢弃鼠标移动')
          return
        }
        // 归一化坐标 → 全局逻辑坐标（加回副屏负偏移）
        const gx = disp.x + (Number(cmd.u) || 0) * disp.width
        const gy = disp.y + (Number(cmd.v) || 0) * disp.height
        await driver.moveAbs(gx, gy)
        break
      }
      case 'md':
        await driver.press(toButtonName(Number(cmd.b)))
        break
      case 'mu':
        await driver.release(toButtonName(Number(cmd.b)))
        break
      case 'mw':
        // dy 纵向 / dx 横向，二者可含小数（受控端按比例累加滚动）
        await driver.wheel(Number(cmd.dy) || 0, Number(cmd.dx) || 0)
        break
      case 'kd': {
        const mods = Array.isArray(cmd.m) ? cmd.m.map(normalizeKey).filter(Boolean) : []
        for (const m of mods) await driver.keyDown(m)
        const k = normalizeKey(cmd.k)
        if (k) await driver.keyDown(k)
        break
      }
      case 'ku': {
        const mods = Array.isArray(cmd.m) ? cmd.m.map(normalizeKey).filter(Boolean) : []
        const k = normalizeKey(cmd.k)
        if (k) await driver.keyUp(k)
        for (const m of mods) await driver.keyUp(m)
        break
      }
      case 'ty':
        await driver.typeText(String(cmd.s || ''))
        break
      default:
        logger.warn('[remote] 未支持的控制指令: ' + cmd.t)
    }
  } catch (e) {
    logger.error('[remote] 执行控制指令失败:', e)
  }
}
