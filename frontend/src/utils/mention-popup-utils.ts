/**
 * Mention Popup 工具函数
 *
 * 移植自 Proma，适配 Vue 3 响应式架构。
 * 提供弹窗定位、异步竞态守卫、Esc 抑制等公共逻辑。
 */

import type { Editor } from '@tiptap/vue-3'

const POPUP_GAP = 6
const VIEWPORT_PADDING = 8

/**
 * 校验 suggestion 触发符是否仍存在于编辑器当前文档的指定 range。
 *
 * 防御 TipTap suggestion 的异步竞态：插件 view.update 是 async，
 * handleStart 阶段会 await items()（IPC 拉取数据耗时）。
 * 若在 await 期间用户删除了触发符，suggestion 已触发 onExit 变为 inactive，
 * 但 await 返回后插件仍会用过期 props 调用 onStart，此时跳过建弹窗避免幽灵弹窗。
 */
export function isSuggestionTriggerPresent(
  editor: Editor,
  range: { from: number; to: number },
  char: string,
): boolean {
  const { from, to } = range
  const docSize = editor.state.doc.content.size
  if (from < 0 || to <= from || to > docSize) return false
  return editor.state.doc.textBetween(from, to, '', '').startsWith(char)
}

/**
 * Esc 抑制状态：记录被 Esc 关闭的触发片段的完整文本与触发符位置。
 */
export interface EscSuppressedTrigger {
  /** Esc 时触发符位置（range.from） */
  from: number
  /** Esc 时触发片段（触发符+query）的完整文本 */
  text: string
}

/**
 * onStart 时判断当前触发是否应被抑制（同一片段延续）。返回 true = 抑制，不弹窗。
 *
 * - 触发符位置后移 → 用户重新触发了 → 新触发；
 * - 位置相同或前移且文本延续 → 同一片片，继续抑制；
 * - 其余情况 → 新触发。
 */
export function shouldSuppressEscTrigger(
  suppressed: EscSuppressedTrigger | null,
  trigger: { from: number; text: string | null | undefined },
): boolean {
  if (!suppressed || !trigger.text) return false
  // 触发符位置后移 = 用户重新输入了触发符（新片段）→ 不抑制
  if (trigger.from > suppressed.from) return false
  // 文本延续 → 同一片段，抑制
  return trigger.text.length >= suppressed.text.length && trigger.text.startsWith(suppressed.text)
}

/**
 * onExit 时判断被抑制的触发符是否已从文档中消失。
 * 返回 true = 触发符已消失，应清除抑制。
 */
export function shouldClearEscSuppressionOnExit(
  suppressed: EscSuppressedTrigger | null,
  editor: Editor,
  range: { from: number; to: number },
  char: string,
): boolean {
  if (!suppressed) return false
  const { from, to } = range
  const docSize = editor.state.doc.content.size
  if (from < 0 || to <= from || to > docSize) return true
  return !editor.state.doc.textBetween(from, to, '', '').startsWith(char)
}

/**
 * TipTap 会并发等待每次 items() 的异步结果。
 * 请求编号在发起时递增，因此旧请求即使最后返回，也无法覆盖当前弹窗。
 */
export function createLatestSuggestionRequestGuard<T>() {
  let latestRequestId = 0
  const requestIds = new WeakMap<T[], number>()

  return {
    startRequest(): number {
      latestRequestId += 1
      return latestRequestId
    },
    attachResult(requestId: number, items: T[]): T[] {
      requestIds.set(items, requestId)
      return items
    },
    isLatest(items: T[]): boolean {
      return requestIds.get(items) === latestRequestId
    },
    isStale(items: T[]): boolean {
      const requestId = requestIds.get(items)
      return requestId !== undefined && requestId !== latestRequestId
    },
  }
}

/**
 * 计算弹窗的 fixed 定位样式。
 * 向上弹出时用 CSS bottom 锚定（底部紧贴光标上方，无间隔）；
 * 空间不足时向下弹出，用 top 紧贴光标下方。
 */
export function calculatePopupPosition(
  clientRect: DOMRect | null | undefined,
  popupWidth = 280,
): { left: string; top: string; bottom: string; width: string; zIndex: string } | null {
  if (!clientRect) return null

  const left = Math.max(
    VIEWPORT_PADDING,
    Math.min(clientRect.left, window.innerWidth - popupWidth - VIEWPORT_PADDING),
  )

  // 视口上方空间够放一个小弹窗就向上弹（用 bottom 锚定，底部紧贴光标）
  const spaceAbove = clientRect.top
  if (spaceAbove >= 60 + POPUP_GAP) {
    // 向上弹：bottom 锚定，弹窗底部 = 光标顶部 - gap
    return {
      left: `${left}px`,
      top: 'auto',
      bottom: `${window.innerHeight - clientRect.top + POPUP_GAP}px`,
      width: `${popupWidth}px`,
      zIndex: '9999',
    }
  }

  // 向下弹：top 紧贴光标底部
  return {
    left: `${left}px`,
    top: `${clientRect.bottom + POPUP_GAP}px`,
    bottom: 'auto',
    width: `${popupWidth}px`,
    zIndex: '9999',
  }
}
