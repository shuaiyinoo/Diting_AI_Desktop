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
import zhTW from './zh-TW.js'
import enUS from './en-US.js'
import jaJP from './ja-JP.js'
import koKR from './ko-KR.js'
import frFR from './fr-FR.js'
import deDE from './de-DE.js'
import ruRU from './ru-RU.js'
import esES from './es-ES.js'
import thTH from './th-TH.js'
import viVN from './vi-VN.js'
import trTR from './tr-TR.js'
import ptBR from './pt-BR.js'
import arSA from './ar-SA.js'
import itIT from './it-IT.js'
import hiIN from './hi-IN.js'

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

const i18n = createI18n({
  legacy: false, // 使用 Composition API 模式
  locale: initialLocale,
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    'en-US': enUS,
    'ja-JP': jaJP,
    'ko-KR': koKR,
    'fr-FR': frFR,
    'de-DE': deDE,
    'ru-RU': ruRU,
    'es-ES': esES,
    'th-TH': thTH,
    'vi-VN': viVN,
    'tr-TR': trTR,
    'pt-BR': ptBR,
    'ar-SA': arSA,
    'it-IT': itIT,
    'hi-IN': hiIN,
  },
})

/**
 * 切换语言并持久化
 * @param {string} locale - 语言代码，如 'zh-CN' / 'en-US'
 */
export function setLocale(locale) {
  if (!LOCALES.some((l) => l.value === locale)) {
    console.warn(`[i18n] 不支持的语言: ${locale}`)
    return
  }
  i18n.global.locale.value = locale
  localStorage.setItem(STORAGE_KEY, locale)
}

export default i18n
