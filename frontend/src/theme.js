import { ref, watch } from 'vue'

/**
 * 主题系统 — Diting AI Desktop
 *
 * 基于 shadcn-vue 的 CSS 变量体系，支持：
 * 1. 亮色/暗色/跟随系统 三种主题模式
 * 2. Base Color（基础色调）定制：neutral / gray / zinc / stone / slate
 * 3. Primary Color（主色）定制：blue / green / violet / rose / orange / red / cyan
 * 4. Radius（圆角）定制：none / small / default / large
 *
 * 所有定制参数通过 CSS 变量动态注入到 :root 和 .dark，
 * 与 tailwind.config.js 中的 hsl(var(--xxx)) 色彩映射配合工作。
 */

// ========== 主题模式 ==========
/** 当前是否暗色 */
const isDark = ref(false)
/** 主题模式：'light' | 'dark' | 'system' */
const themeMode = ref('light')
/** 系统暗色偏好 */
const systemDark = ref(
  window.matchMedia('(prefers-color-scheme: dark)').matches
)

// ========== 主题定制参数 ==========
/** 基础色调 */
const baseColor = ref('neutral')
/** 主色 */
const primaryColor = ref('blue')
/** 圆角大小 */
const radiusSize = ref('default')

// ========== 字体定制 ==========
/** 当前字体 */
const fontFamily = ref('system')

/**
 * 字体映射表
 * 参考 shadcn-vue/create 的字体选项，完整覆盖官网所有可选字体
 * 每个 key 对应一组 font-family CSS 栈
 */
const fontFamilyMap = {
  // ── 系统默认 ──
  system: {
    label: 'System',
    group: '系统',
    value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },

  // ── 无衬线（Sans Serif）──
  geist: {
    label: 'Geist Sans',
    group: '无衬线',
    value: "'Geist Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  inter: {
    label: 'Inter',
    group: '无衬线',
    value: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  notoSans: {
    label: 'Noto Sans',
    group: '无衬线',
    value: "'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  nunitoSans: {
    label: 'Nunito Sans',
    group: '无衬线',
    value: "'Nunito Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  figtree: {
    label: 'Figtree',
    group: '无衬线',
    value: "'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  roboto: {
    label: 'Roboto',
    group: '无衬线',
    value: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  raleway: {
    label: 'Raleway',
    group: '无衬线',
    value: "'Raleway', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  dmSans: {
    label: 'DM Sans',
    group: '无衬线',
    value: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  publicSans: {
    label: 'Public Sans',
    group: '无衬线',
    value: "'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  outfit: {
    label: 'Outfit',
    group: '无衬线',
    value: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  oxanium: {
    label: 'Oxanium',
    group: '无衬线',
    value: "'Oxanium', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  manrope: {
    label: 'Manrope',
    group: '无衬线',
    value: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  spaceGrotesk: {
    label: 'Space Grotesk',
    group: '无衬线',
    value: "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  montserrat: {
    label: 'Montserrat',
    group: '无衬线',
    value: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  ibmPlexSans: {
    label: 'IBM Plex Sans',
    group: '无衬线',
    value: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  sourceSans3: {
    label: 'Source Sans 3',
    group: '无衬线',
    value: "'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  instrumentSans: {
    label: 'Instrument Sans',
    group: '无衬线',
    value: "'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },

  // ── 等宽（Monospace）──
  jetbrainsMono: {
    label: 'JetBrains Mono',
    group: '等宽',
    value: "'JetBrains Mono', 'SF Mono', Menlo, ui-monospace, monospace",
  },
  geistMono: {
    label: 'Geist Mono',
    group: '等宽',
    value: "'Geist Mono', 'SF Mono', Menlo, ui-monospace, monospace",
  },

  // ── 衬线（Serif）──
  notoSerif: {
    label: 'Noto Serif',
    group: '衬线',
    value: "'Noto Serif', Georgia, 'Times New Roman', serif",
  },
  robotoSlab: {
    label: 'Roboto Slab',
    group: '衬线',
    value: "'Roboto Slab', Georgia, 'Times New Roman', serif",
  },
  merriweather: {
    label: 'Merriweather',
    group: '衬线',
    value: "'Merriweather', Georgia, 'Times New Roman', serif",
  },
  lora: {
    label: 'Lora',
    group: '衬线',
    value: "'Lora', Georgia, 'Times New Roman', serif",
  },
  playfairDisplay: {
    label: 'Playfair Display',
    group: '衬线',
    value: "'Playfair Display', Georgia, 'Times New Roman', serif",
  },
}

// ========== Base Color HSL 映射表 ==========
// 参考 shadcn-vue/themes 的标准色值
var baseColorMap = {
  neutral: {
    light: {
      '--background': '0 0% 100%',
      '--foreground': '222 47% 11%',
      '--card': '0 0% 100%',
      '--card-foreground': '222 47% 11%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '222 47% 11%',
      '--secondary': '210 40% 96%',
      '--secondary-foreground': '222 47% 11%',
      '--muted': '210 40% 96%',
      '--muted-foreground': '215 16% 47%',
      '--accent': '210 40% 96%',
      '--accent-foreground': '222 47% 11%',
      '--border': '214 32% 91%',
      '--input': '214 32% 91%',
    },
    dark: {
      '--background': '222 47% 11%',
      '--foreground': '210 40% 98%',
      '--card': '222 47% 11%',
      '--card-foreground': '210 40% 98%',
      '--popover': '222 47% 11%',
      '--popover-foreground': '210 40% 98%',
      '--secondary': '217 33% 17%',
      '--secondary-foreground': '210 40% 98%',
      '--muted': '217 33% 17%',
      '--muted-foreground': '215 20% 65%',
      '--accent': '217 33% 17%',
      '--accent-foreground': '210 40% 98%',
      '--border': '217 33% 20%',
      '--input': '217 33% 20%',
    },
  },
  gray: {
    light: {
      '--background': '0 0% 100%',
      '--foreground': '224 71% 4%',
      '--card': '0 0% 100%',
      '--card-foreground': '224 71% 4%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '224 71% 4%',
      '--secondary': '220 14% 96%',
      '--secondary-foreground': '224 71% 4%',
      '--muted': '220 14% 96%',
      '--muted-foreground': '220 9% 46%',
      '--accent': '220 14% 96%',
      '--accent-foreground': '224 71% 4%',
      '--border': '220 13% 91%',
      '--input': '220 13% 91%',
    },
    dark: {
      '--background': '224 71% 4%',
      '--foreground': '210 20% 98%',
      '--card': '224 71% 4%',
      '--card-foreground': '210 20% 98%',
      '--popover': '224 71% 4%',
      '--popover-foreground': '210 20% 98%',
      '--secondary': '215 28% 17%',
      '--secondary-foreground': '210 20% 98%',
      '--muted': '215 28% 17%',
      '--muted-foreground': '217 11% 65%',
      '--accent': '215 28% 17%',
      '--accent-foreground': '210 20% 98%',
      '--border': '215 28% 17%',
      '--input': '215 28% 17%',
    },
  },
  zinc: {
    light: {
      '--background': '0 0% 100%',
      '--foreground': '240 10% 4%',
      '--card': '0 0% 100%',
      '--card-foreground': '240 10% 4%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '240 10% 4%',
      '--secondary': '240 5% 96%',
      '--secondary-foreground': '240 10% 4%',
      '--muted': '240 5% 96%',
      '--muted-foreground': '240 4% 46%',
      '--accent': '240 5% 96%',
      '--accent-foreground': '240 10% 4%',
      '--border': '240 6% 90%',
      '--input': '240 6% 90%',
    },
    dark: {
      '--background': '240 10% 4%',
      '--foreground': '0 0% 98%',
      '--card': '240 10% 4%',
      '--card-foreground': '0 0% 98%',
      '--popover': '240 10% 4%',
      '--popover-foreground': '0 0% 98%',
      '--secondary': '240 4% 16%',
      '--secondary-foreground': '0 0% 98%',
      '--muted': '240 4% 16%',
      '--muted-foreground': '240 5% 65%',
      '--accent': '240 4% 16%',
      '--accent-foreground': '0 0% 98%',
      '--border': '240 4% 16%',
      '--input': '240 4% 16%',
    },
  },
  stone: {
    light: {
      '--background': '0 0% 100%',
      '--foreground': '20 14% 4%',
      '--card': '0 0% 100%',
      '--card-foreground': '20 14% 4%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '20 14% 4%',
      '--secondary': '60 5% 96%',
      '--secondary-foreground': '20 14% 4%',
      '--muted': '60 5% 96%',
      '--muted-foreground': '25 5% 45%',
      '--accent': '60 5% 96%',
      '--accent-foreground': '20 14% 4%',
      '--border': '20 5% 90%',
      '--input': '20 5% 90%',
    },
    dark: {
      '--background': '20 14% 4%',
      '--foreground': '60 10% 98%',
      '--card': '20 14% 4%',
      '--card-foreground': '60 10% 98%',
      '--popover': '20 14% 4%',
      '--popover-foreground': '60 10% 98%',
      '--secondary': '20 6% 16%',
      '--secondary-foreground': '60 10% 98%',
      '--muted': '20 6% 16%',
      '--muted-foreground': '20 5% 65%',
      '--accent': '20 6% 16%',
      '--accent-foreground': '60 10% 98%',
      '--border': '20 6% 16%',
      '--input': '20 6% 16%',
    },
  },
  slate: {
    light: {
      '--background': '0 0% 100%',
      '--foreground': '222 47% 11%',
      '--card': '0 0% 100%',
      '--card-foreground': '222 47% 11%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '222 47% 11%',
      '--secondary': '215 20% 96%',
      '--secondary-foreground': '222 47% 11%',
      '--muted': '215 20% 96%',
      '--muted-foreground': '215 16% 47%',
      '--accent': '215 20% 96%',
      '--accent-foreground': '222 47% 11%',
      '--border': '215 28% 90%',
      '--input': '215 28% 90%',
    },
    dark: {
      '--background': '222 47% 11%',
      '--foreground': '210 40% 98%',
      '--card': '222 47% 11%',
      '--card-foreground': '210 40% 98%',
      '--popover': '222 47% 11%',
      '--popover-foreground': '210 40% 98%',
      '--secondary': '215 28% 17%',
      '--secondary-foreground': '210 40% 98%',
      '--muted': '215 28% 17%',
      '--muted-foreground': '215 20% 65%',
      '--accent': '215 28% 17%',
      '--accent-foreground': '210 40% 98%',
      '--border': '215 28% 17%',
      '--input': '215 28% 17%',
    },
  },
}

// ========== Primary Color HSL 映射表 ==========
var primaryColorMap = {
  blue:    { light: '221 83% 53%',  dark: '217 91% 60%'  },
  green:   { light: '142 71% 45%',  dark: '142 71% 45%'  },
  violet:  { light: '262 83% 58%',  dark: '263 70% 65%'  },
  rose:    { light: '347 77% 50%',  dark: '347 77% 60%'  },
  orange:  { light: '24 95% 53%',   dark: '24 95% 58%'   },
  red:     { light: '0 84% 60%',   dark: '0 72% 65%'     },
  cyan:    { light: '189 94% 43%', dark: '189 94% 50%'  },
}

// ========== Radius 映射表 ==========
var radiusMap = {
  none:    '0px',
  small:   '0.375rem',   // 6px
  default: '0.5rem',     // 8px
  large:   '0.75rem',    // 12px
}

// ========== 应用自定义变量映射 ==========
// 从 shadcn 标准变量（已由 baseColor 设置）派生应用自定义变量，
// 确保切换基础色调时全局 UI 颜色同步变化。
function applyAppCustomVariables(dark) {
  var root = document.documentElement

  // 读取当前 baseColor 对应的 HSL 值（applyThemeCustomization 已设置到 :root）
  var cs = getComputedStyle(root)
  function getVar(name) { return cs.getPropertyValue(name).trim() }
  // 构造 hsl(h s% l%) 字符串
  function h(c) { return 'hsl(' + c + ')' }
  // 构造带透明度的 hsl(h s% l% / alpha)
  function ha(c, a) { return 'hsl(' + c + ' / ' + a + ')' }

  if (dark) {
    root.style.setProperty('--bg-layout', ha(getVar('--background'), '0.7'))
    root.style.setProperty('--bg-panel', h(getVar('--background')))
    root.style.setProperty('--bg-sidebar', h(getVar('--muted')))
    root.style.setProperty('--bg-statusbar', h(getVar('--muted')))
    root.style.setProperty('--bg-hover', h(getVar('--accent')))
    root.style.setProperty('--bg-active', ha(getVar('--accent'), '0.8'))
    root.style.setProperty('--bg-divider', h(getVar('--border')))
    root.style.setProperty('--bg-divider-hover', 'hsl(var(--primary))')
    root.style.setProperty('--border-color', h(getVar('--border')))
    root.style.setProperty('--border-color-light', h(getVar('--border')))
    root.style.setProperty('--text-primary', h(getVar('--foreground')))
    root.style.setProperty('--text-secondary', h(getVar('--muted-foreground')))
    root.style.setProperty('--text-muted', ha(getVar('--muted-foreground'), '0.7'))
    root.style.setProperty('--accent-color', 'hsl(var(--primary))')
    root.style.setProperty('--accent-hover', 'hsl(var(--primary) / 0.8)')
    root.style.setProperty('--shadow-sm', '0 1px 4px hsl(0 0% 0% / 0.3)')
    root.style.setProperty('--scrollbar-thumb', ha(getVar('--muted-foreground'), '0.3'))
    root.style.setProperty('--scrollbar-track', 'transparent')
  } else {
    root.style.setProperty('--bg-layout', h(getVar('--secondary')))
    root.style.setProperty('--bg-panel', h(getVar('--background')))
    root.style.setProperty('--bg-sidebar', h(getVar('--secondary')))
    root.style.setProperty('--bg-statusbar', h(getVar('--secondary')))
    root.style.setProperty('--bg-hover', h(getVar('--accent')))
    root.style.setProperty('--bg-active', ha(getVar('--accent'), '0.6'))
    root.style.setProperty('--bg-divider', h(getVar('--border')))
    root.style.setProperty('--bg-divider-hover', 'hsl(var(--primary))')
    root.style.setProperty('--border-color', h(getVar('--border')))
    root.style.setProperty('--border-color-light', ha(getVar('--secondary'), '0.5'))
    root.style.setProperty('--text-primary', h(getVar('--foreground')))
    root.style.setProperty('--text-secondary', h(getVar('--muted-foreground')))
    root.style.setProperty('--text-muted', ha(getVar('--muted-foreground'), '0.7'))
    root.style.setProperty('--accent-color', 'hsl(var(--primary))')
    root.style.setProperty('--accent-hover', 'hsl(var(--primary) / 0.8)')
    root.style.setProperty('--shadow-sm', '0 1px 4px hsl(0 0% 0% / 0.06)')
    root.style.setProperty('--scrollbar-thumb', ha(getVar('--muted-foreground'), '0.4'))
    root.style.setProperty('--scrollbar-track', 'transparent')
  }
}

// ========== 应用主题到 DOM ==========
function applyTheme() {
  var dark = themeMode.value === 'dark' || (themeMode.value === 'system' && systemDark.value)
  isDark.value = dark

  var html = document.documentElement
  if (dark) {
    html.classList.add('dark')
    html.setAttribute('data-theme', 'dark')
  } else {
    html.classList.remove('dark')
    html.setAttribute('data-theme', 'light')
  }

  // applyThemeCustomization 会先设置 shadcn 变量，再调用 applyAppCustomVariables 派生
  applyThemeCustomization()
}

// ========== 应用主题定制参数 ==========
function applyThemeCustomization() {
  var root = document.documentElement
  var colors = baseColorMap[baseColor.value]
  var dark = isDark.value

  // 应用 Base Color — 覆盖 shadcn 标准变量
  var targetColors = dark ? colors.dark : colors.light
  Object.keys(targetColors).forEach(function (key) {
    root.style.setProperty(key, targetColors[key])
  })

  // 应用 Primary Color
  var primary = primaryColorMap[primaryColor.value]
  root.style.setProperty('--primary', dark ? primary.dark : primary.light)
  root.style.setProperty('--ring', dark ? primary.dark : primary.light)

  // 应用 Radius
  root.style.setProperty('--radius', radiusMap[radiusSize.value])

  // 应用 Font Family
  var fontInfo = fontFamilyMap[fontFamily.value] || fontFamilyMap.system
  root.style.setProperty('--font-family', fontInfo.value)

  // 应用 Font Mono：如果用户选择的字体是等宽类，则 --font-mono 也跟随用户选择；
  // 否则使用默认的系统等宽字体栈
  if (fontInfo.group === '等宽') {
    root.style.setProperty('--font-mono', fontInfo.value)
  } else {
    // 恢复默认等宽字体（用户从等宽切换回非等宽时需要重置）
    root.style.removeProperty('--font-mono')
  }

  // 同步应用自定义变量（从 shadcn 变量派生，因为 baseColor/primary 可能变了）
  applyAppCustomVariables(dark)
}

// ========== 主题切换函数 ==========

/** 在亮色/暗色之间切换 */
function toggleTheme() {
  var newMode = isDark.value ? 'light' : 'dark'
  setThemeMode(newMode)
}

/** 设置主题模式 */
function setThemeMode(mode) {
  themeMode.value = mode
  localStorage.setItem('app-theme-mode', mode)
  applyTheme()
}

/** 设置基础色调 */
function setBaseColor(color) {
  baseColor.value = color
  localStorage.setItem('theme-base-color', color)
  applyThemeCustomization()
}

/** 设置主色 */
function setPrimaryColor(color) {
  primaryColor.value = color
  localStorage.setItem('theme-primary', color)
  applyThemeCustomization()
}

/** 设置圆角大小 */
function setRadiusSize(size) {
  radiusSize.value = size
  localStorage.setItem('theme-radius', size)
  applyThemeCustomization()
}

/** 设置字体 */
function setFontFamily(font) {
  fontFamily.value = font
  localStorage.setItem('theme-font-family', font)
  applyThemeCustomization()
}

// ========== 初始化 ==========

// 监听系统主题变化
if (window.matchMedia) {
  var mql = window.matchMedia('(prefers-color-scheme: dark)')
  mql.addEventListener('change', function (e) {
    systemDark.value = e.matches
    if (themeMode.value === 'system') {
      applyTheme()
    }
  })
}

// 从 localStorage 恢复配置
function initTheme() {
  var savedMode = localStorage.getItem('app-theme-mode') || 'light'
  var savedBase = localStorage.getItem('theme-base-color') || 'neutral'
  var savedPrimary = localStorage.getItem('theme-primary') || 'blue'
  var savedRadius = localStorage.getItem('theme-radius') || 'default'
  var savedFont = localStorage.getItem('theme-font-family') || 'system'

  themeMode.value = savedMode
  baseColor.value = savedBase
  primaryColor.value = savedPrimary
  radiusSize.value = savedRadius
  // 如果保存的字体 key 已被移除（旧版迁移），回退到 system
  fontFamily.value = fontFamilyMap[savedFont] ? savedFont : 'system'

  applyTheme()
}

// 立即初始化
initTheme()

// 当 isDark 变化时，重新应用定制（确保变量同步）
watch(isDark, function () {
  applyThemeCustomization()
})

export {
  // 主题模式
  isDark,
  themeMode,
  systemDark,
  toggleTheme,
  setThemeMode,
  // 主题定制
  baseColor,
  primaryColor,
  radiusSize,
  fontFamily,
  setBaseColor,
  setPrimaryColor,
  setRadiusSize,
  setFontFamily,
  // 配置映射（供 UI 展示用）
  baseColorMap,
  primaryColorMap,
  radiusMap,
  fontFamilyMap,
}
