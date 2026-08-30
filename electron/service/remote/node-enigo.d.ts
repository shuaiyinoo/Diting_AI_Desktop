/**
 * node-enigo 的 TS 类型声明（官方未提供 .d.ts）
 *
 * 它是 Rust enigo 的 N-API 原生绑定，全部方法为异步（Promise-based，不阻塞主线程）。
 * 导出为 CommonJS（module.exports = nativeBinding），这里用 declare module 提供类型。
 */
declare module 'node-enigo' {
  /** 输入整串文本（在当前光标处），返回 Promise<string> */
  export function typeText(text: string): Promise<string>
  /** 移动鼠标；默认绝对坐标，isRelative=true 时相对当前位置移动 */
  export function moveMouse(x: number, y: number, isRelative?: boolean): Promise<string>
  /**
   * 鼠标按键动作。
   * button: 'left' | 'right' | 'middle' | 'scrollUp' | 'scrollDown' | 'scrollLeft' | 'scrollRight'
   * action: 'click' | 'press' | 'release'
   */
  export function mouseButton(button: string, action: string): Promise<string>
  /** 单键动作（keyName 见 README；action: 'click' | 'press' | 'release'） */
  export function key(keyName: string, action: string): Promise<string>
  /** 组合键（同时按下，自动处理修饰键） */
  export function keys(keyArray: string[]): Promise<string>
}
