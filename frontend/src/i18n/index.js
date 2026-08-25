/**
 * i18n 配置入口
 *
 * 使用 vue-i18n 提供多语言支持。
 * 语言偏好持久化到 localStorage，默认中文。
 *
 * 使用方式：
 *   import i18n from '@/i18n'
 *   app.use(i18n)
 *
 * 在组件中使用：
 *   import { useI18n } from 'vue-i18n'
 *   const { t, locale } = useI18n()
 *   t('appearance.title')  // → "外观" / "Appearance"
 *
 * 切换语言：
 *   import { setLocale } from '@/i18n'
 *   setLocale('en-US')
 */

import { createI18n } from 'vue-i18n'
import zhCN from './zh-CN.js'

/** 支持的语言列表（用于下拉框渲染） */
export const LOCALES = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'en-US', label: 'English' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '한국어' },
  { value: 'fr-FR', label: 'Français' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'ru-RU', label: 'Русский' },
  { value: 'es-ES', label: 'Español' },
  { value: 'th-TH', label: 'ไทย' },
  { value: 'vi-VN', label: 'Tiếng Việt' },
  { value: 'tr-TR', label: 'Türkçe' },
  { value: 'pt-BR', label: 'Português' },
  { value: 'ar-SA', label: 'العربية' },
  { value: 'it-IT', label: 'Italiano' },
  { value: 'hi-IN', label: 'हिन्दी' },
]

/** 默认语言 */
export const DEFAULT_LOCALE = 'zh-CN'

/** localStorage 存储键 */
const STORAGE_KEY = 'app-locale'

/** 获取持久化的语言偏好，回退到默认 */
function getStoredLocale() {
  const stored = localStorage.getItem(STORAGE_KEY)
  // 验证存储的值是否在支持列表中
  if (stored && LOCALES.some((l) => l.value === stored)) {
    return stored
  }
  return DEFAULT_LOCALE
}

/** 当前语言 */
const initialLocale = getStoredLocale()

/**
 * 懒加载语言包映射表
 * 仅 zh-CN 和 en-US 在构建时打包（en-US 作为 fallback），
 * 其余语言在运行时按需加载，避免 Vite 构建时将 17 个语言文件
 * 全部加载到内存中导致 OOM。
 */
const lazyLocales = {
  'zh-TW': () => import('./zh-TW.js'),
  'en-US': () => import('./en-US.js'),
  'ja-JP': () => import('./ja-JP.js'),
  'ko-KR': () => import('./ko-KR.js'),
  'fr-FR': () => import('./fr-FR.js'),
  'de-DE': () => import('./de-DE.js'),
  'ru-RU': () => import('./ru-RU.js'),
  'es-ES': () => import('./es-ES.js'),
  'th-TH': () => import('./th-TH.js'),
  'vi-VN': () => import('./vi-VN.js'),
  'tr-TR': () => import('./tr-TR.js'),
  'pt-BR': () => import('./pt-BR.js'),
  'ar-SA': () => import('./ar-SA.js'),
  'it-IT': () => import('./it-IT.js'),
  'hi-IN': () => import('./hi-IN.js'),
}

const i18n = createI18n({
  legacy: false, // 使用 Composition API 模式
  locale: initialLocale,
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
  },
})

/**
 * 按需加载非中文语言包
 * 初始语言非 zh-CN 时异步加载对应语言包
 */
async function loadInitialLocale() {
  if (initialLocale !== 'zh-CN' && lazyLocales[initialLocale]) {
    const mod = await lazyLocales[initialLocale]()
    i18n.global.setLocaleMessage(initialLocale, mod.default)
  }
}
loadInitialLocale()

/** 已加载过的语言包缓存 */
const loadedLocales = new Set(['zh-CN'])

/**
 * 确保语言包已加载（懒加载）
 * @param {string} locale - 语言代码
 */
async function ensureLocaleLoaded(locale) {
  if (loadedLocales.has(locale)) return
  if (lazyLocales[locale]) {
    const mod = await lazyLocales[locale]()
    i18n.global.setLocaleMessage(locale, mod.default)
    loadedLocales.add(locale)
  }
}

/**
 * 切换语言并持久化
 * @param {string} locale - 语言代码，如 'zh-CN' / 'en-US'
 */
export async function setLocale(locale) {
  if (!LOCALES.some((l) => l.value === locale)) {
    console.warn(`[i18n] 不支持的语言: ${locale}`)
    return
  }
  // 懒加载目标语言包（zh-CN 已在构建时打包，无需加载）
  await ensureLocaleLoaded(locale)
  i18n.global.locale.value = locale
  localStorage.setItem(STORAGE_KEY, locale)
}

export default i18n
