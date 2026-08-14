/**
 * Markdown 字号管理工具
 *
 * 三档字号偏好（小/中/大），通过 data 属性 + CSS 变量驱动 markstream-vue 渲染。
 * markstream-vue 使用 --ms-text-body 等 CSS 变量控制各元素字号，
 * 本模块在 <html> 上设置 data-md-font-size 属性，
 * globals.css 中的 CSS 规则根据该属性覆盖 markstream-vue 的字号变量。
 * 持久化到 localStorage。
 */

/** 字号档位选项 */
export const FONT_SIZE_OPTIONS = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' },
]

/** 默认字号档位 */
export const DEFAULT_FONT_SIZE = 'medium'

/** localStorage 存储键 */
const STORAGE_KEY = 'markdown-font-size'

/**
 * 将字号档位写入 DOM（data 属性）
 *
 * globals.css 中的 [data-md-font-size='...'] .markstream-vue 规则
 * 会覆盖 markstream-vue 默认的 --ms-text-body 等 CSS 变量
 */
export function applyMarkdownFontSize(size) {
  const validSize = FONT_SIZE_OPTIONS.some((o) => o.value === size) ? size : DEFAULT_FONT_SIZE
  document.documentElement.setAttribute('data-md-font-size', validSize)
}

/** 获取持久化的字号档位 */
export function getMarkdownFontSize() {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_FONT_SIZE
}

/** 更新字号档位并持久化 */
export function setMarkdownFontSize(size) {
  localStorage.setItem(STORAGE_KEY, size)
  applyMarkdownFontSize(size)
}

/** 初始化字号（从 localStorage 读取并应用到 DOM） */
export function initMarkdownFontSize() {
  const size = getMarkdownFontSize()
  applyMarkdownFontSize(size)
  return size
}
