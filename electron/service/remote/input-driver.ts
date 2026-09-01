/**
 * 输入驱动抽象层
 *
 * 把「鼠标 / 键盘 / 滚轮」这类操作系统级输入模拟，封装成一组与底层实现无关的窄接口。
 * 当前底层用 @touchifyapp/enigo（Rust enigo 的 N-API 绑定，跨平台覆盖 Windows/macOS/Linux）。
 *
 * 为什么要有这一层：
 *   - 远程控制是核心功能，未来若想换 robotjs / nut.js / 自维护 Rust core，
 *     只需改这里的实现，坐标映射与指令分发逻辑完全不动。
 *   - 把「原生模块」收敛到单一文件，便于统一处理异常、加权限/可访问性检查。
 *
 * API 差异说明（@touchifyapp/enigo vs 旧 node-enigo）：
 *   - 旧包是模块级异步函数（每次内部 new Enigo）；新包是类实例同步方法。
 *   - 新包的 mouseDown/mouseUp/keyDown/keyUp/typeText/mouseMove 均为同步调用，
 *     但系统级输入调用本身是微秒级的，不会阻塞事件循环。
 *   - InputDriver 接口仍返回 Promise<void>，用 async 包裹，上游调用方零改动。
 *   - 滚轮：旧包用 mouseButton('scrollDown','click') 逐格模拟；新包有原生 scrollVertical/scrollHorizontal。
 */

import { Enigo, Button, Direction } from '@touchifyapp/enigo'

/** 鼠标按键名（与 enigo 的 Button 枚举对齐） */
export type MouseButtonName = 'left' | 'right' | 'middle'

export interface InputDriver {
  /** 绝对移动到 OS 全局逻辑坐标 (x, y) */
  moveAbs(x: number, y: number): Promise<void>
  /** 按下鼠标键（按住，需配对 release） */
  press(button: MouseButtonName): Promise<void>
  /** 抬起鼠标键 */
  release(button: MouseButtonName): Promise<void>
  /** 滚轮滚动：lines > 0 向下、< 0 向上；hLines > 0 向右、< 0 向左 */
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

/** MouseButtonName → enigo Button 枚举 */
function toEnigoButton(b: MouseButtonName): Button {
  switch (b) {
    case 'middle':
      return Button.Middle
    case 'right':
      return Button.Right
    default:
      return Button.Left
  }
}

export class EnigoInputDriver implements InputDriver {
  private enigo: Enigo

  constructor() {
    this.enigo = Enigo.create()
  }

  async moveAbs(x: number, y: number): Promise<void> {
    this.enigo.mouseMove(Math.round(x), Math.round(y))
  }

  async press(button: MouseButtonName): Promise<void> {
    this.enigo.mouseButton(toEnigoButton(button), Direction.Press)
  }

  async release(button: MouseButtonName): Promise<void> {
    this.enigo.mouseButton(toEnigoButton(button), Direction.Release)
  }

  // 小数累加器：把高频小 delta 攒成整数「格」，避免每次 round 把小数吃掉导致滚动卡顿
  private wheelAccumY = 0
  private wheelAccumX = 0

  async wheel(lines: number, hLines = 0): Promise<void> {
    if (lines) {
      this.wheelAccumY += lines
      while (Math.abs(this.wheelAccumY) >= 1) {
        const down = this.wheelAccumY > 0
        // scrollVertical: 正数向下、负数向上，每次 1 格
        this.enigo.scrollVertical(down ? 1 : -1)
        this.wheelAccumY -= down ? 1 : -1
      }
    }
    if (hLines) {
      this.wheelAccumX += hLines
      while (Math.abs(this.wheelAccumX) >= 1) {
        const right = this.wheelAccumX > 0
        // scrollHorizontal: 正数向右、负数向左，每次 1 格
        this.enigo.scrollHorizontal(right ? 1 : -1)
        this.wheelAccumX -= right ? 1 : -1
      }
    }
  }

  async keyDown(k: string): Promise<void> {
    this.enigo.keyDown(k)
  }

  async keyUp(k: string): Promise<void> {
    this.enigo.keyUp(k)
  }

  async typeText(text: string): Promise<void> {
    if (text) this.enigo.typeText(text)
  }
}
