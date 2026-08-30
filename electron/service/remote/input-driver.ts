/**
 * 输入驱动抽象层
 *
 * 把「鼠标 / 键盘 / 滚轮」这类操作系统级输入模拟，封装成一组与底层实现无关的窄接口。
 * 当前底层用 node-enigo（Rust enigo 的 N-API 绑定，异步非阻塞、跨平台覆盖 X11/Wayland）。
 *
 * 为什么要有这一层：
 *   - 远程控制是核心功能，未来若想换 robotjs / nut.js / 自维护 Rust core，
 *     只需改这里的实现，坐标映射与指令分发逻辑完全不动。
 *   - 把「原生模块」收敛到单一文件，便于统一处理异常、加权限/可访问性检查。
 */

import { moveMouse, mouseButton, key, typeText } from 'node-enigo'

/** 鼠标按键名（与 node-enigo 的 button 枚举对齐） */
export type MouseButtonName = 'left' | 'right' | 'middle'

export interface InputDriver {
  /** 绝对移动到 OS 全局逻辑坐标 (x, y) */
  moveAbs(x: number, y: number): Promise<void>
  /** 按下鼠标键（按住，需配对 release） */
  press(button: MouseButtonName): Promise<void>
  /** 抬起鼠标键 */
  release(button: MouseButtonName): Promise<void>
  /** 滚轮滚动：lines > 0 向下、< 0 向上；hLines > 0 向右、< 0 向左（enigo 以 click 计次，无连续 delta） */
  wheel(lines: number, hLines?: number): Promise<void>
  /** 单键按下（按住，需配对 keyUp） */
  keyDown(key: string): Promise<void>
  /** 单键抬起 */
  keyUp(key: string): Promise<void>
  /** 直接输入整串文本 */
  typeText(text: string): Promise<void>
}

/** 把协议里的 MouseButton 数值（同 DOM MouseEvent.button）映射到驱动层按键名 */
export function toButtonName(b: number): MouseButtonName {
  switch (b) {
    case 1:
      return 'middle'
    case 2:
      return 'right'
    default:
      return 'left'
  }
}

export class EnigoInputDriver implements InputDriver {
  async moveAbs(x: number, y: number): Promise<void> {
    await moveMouse(Math.round(x), Math.round(y))
  }

  async press(button: MouseButtonName): Promise<void> {
    await mouseButton(button, 'press')
  }

  async release(button: MouseButtonName): Promise<void> {
    await mouseButton(button, 'release')
  }

  // 小数累加器：把高频小 delta 攒成整数「格」，避免每次 round 把小数吃掉导致滚动卡顿
  private wheelAccumY = 0
  private wheelAccumX = 0

  async wheel(lines: number, hLines = 0): Promise<void> {
    if (lines) {
      this.wheelAccumY += lines
      while (Math.abs(this.wheelAccumY) >= 1) {
        const down = this.wheelAccumY > 0
        await mouseButton(down ? 'scrollDown' : 'scrollUp', 'click')
        this.wheelAccumY -= down ? 1 : -1
      }
    }
    if (hLines) {
      this.wheelAccumX += hLines
      while (Math.abs(this.wheelAccumX) >= 1) {
        const right = this.wheelAccumX > 0
        await mouseButton(right ? 'scrollRight' : 'scrollLeft', 'click')
        this.wheelAccumX -= right ? 1 : -1
      }
    }
  }

  async keyDown(k: string): Promise<void> {
    await key(k, 'press')
  }

  async keyUp(k: string): Promise<void> {
    await key(k, 'release')
  }

  async typeText(text: string): Promise<void> {
    if (text) await typeText(text)
  }
}
