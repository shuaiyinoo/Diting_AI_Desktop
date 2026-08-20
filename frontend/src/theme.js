import { ref, watch } from 'vue'

/**
 * 主题系统 — Diting AI Desktop
 *
 * 基于 shadcn-vue 的 CSS 变量体系，支持：
 * 1. 亮色/暗色/跟随系统 三种主题模式
 * 2. Base Color（基础色调）定制：neutral / gray / zinc / stone / slate / dailan / zhusha / songhua / ouhe / zheshi
 * 3. Primary Color（主色）定制：blue / green / violet / rose / orange / red / cyan / dailan / zhusha / songhua / ouhe / zheshi
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
      '--foreground': '0 0% 9%',
      '--card': '0 0% 100%',
      '--card-foreground': '0 0% 9%',
      '--popover': '0 0% 100%',
      '--popover-foreground': '0 0% 9%',
      '--secondary': '0 0% 96%',
      '--secondary-foreground': '0 0% 9%',
      '--muted': '0 0% 96%',
      '--muted-foreground': '0 0% 40%',
      '--accent': '0 0% 94%',
      '--accent-foreground': '0 0% 9%',
      '--border': '0 0% 90%',
      '--input': '0 0% 90%'
    },
    dark: {
      '--background': '0 0% 0%',
      '--foreground': '0 0% 98%',
      '--card': '0 0% 0%',
      '--card-foreground': '0 0% 98%',
      '--popover': '0 0% 0%',
      '--popover-foreground': '0 0% 98%',
      '--secondary': '0 0% 0%',
      '--secondary-foreground': '0 0% 98%',
      '--muted': '0 0% 0%',
      '--muted-foreground': '0 0% 58%',
      '--accent': '0 0% 0%',
      '--accent-foreground': '0 0% 98%',
      '--border': '0 0% 15%',
      '--input': '0 0% 15%'
    },
  },
  stone: {
    light: {
      '--background': '40 22% 99%',
      '--foreground': '32 18% 12%',
      '--card': '40 22% 99%',
      '--card-foreground': '32 18% 12%',
      '--popover': '40 22% 99%',
      '--popover-foreground': '32 18% 12%',
      '--secondary': '40 30% 94%',
      '--secondary-foreground': '32 18% 12%',
      '--muted': '40 30% 94%',
      '--muted-foreground': '35 16% 42%',
      '--accent': '38 36% 89%',
      '--accent-foreground': '32 18% 12%',
      '--border': '40 28% 86%',
      '--input': '40 28% 86%'
    },
    dark: {
      '--background': '30 24% 8%',
      '--foreground': '40 20% 95%',
      '--card': '32 20% 11%',
      '--card-foreground': '40 20% 95%',
      '--popover': '32 20% 11%',
      '--popover-foreground': '40 20% 95%',
      '--secondary': '32 28% 14%',
      '--secondary-foreground': '40 20% 95%',
      '--muted': '32 28% 14%',
      '--muted-foreground': '36 16% 64%',
      '--accent': '34 34% 19%',
      '--accent-foreground': '40 20% 95%',
      '--border': '32 22% 19%',
      '--input': '32 22% 19%'
    },
  },
  gray: {
    light: {
      '--background': '220 24% 99%',
      '--foreground': '222 47% 11%',
      '--card': '220 24% 99%',
      '--card-foreground': '222 47% 11%',
      '--popover': '220 24% 99%',
      '--popover-foreground': '222 47% 11%',
      '--secondary': '220 32% 94%',
      '--secondary-foreground': '222 47% 11%',
      '--muted': '220 32% 94%',
      '--muted-foreground': '220 16% 42%',
      '--accent': '220 38% 89%',
      '--accent-foreground': '222 47% 11%',
      '--border': '220 30% 86%',
      '--input': '220 30% 86%'
    },
    dark: {
      '--background': '220 24% 9%',
      '--foreground': '210 32% 96%',
      '--card': '220 22% 12%',
      '--card-foreground': '210 32% 96%',
      '--popover': '220 22% 12%',
      '--popover-foreground': '210 32% 96%',
      '--secondary': '220 30% 15%',
      '--secondary-foreground': '210 32% 96%',
      '--muted': '220 30% 15%',
      '--muted-foreground': '218 20% 64%',
      '--accent': '220 38% 19%',
      '--accent-foreground': '210 32% 96%',
      '--border': '220 26% 20%',
      '--input': '220 26% 20%'
    },
  },
  zinc: {
    light: {
      '--background': '270 14% 99%',
      '--foreground': '270 22% 11%',
      '--card': '270 14% 99%',
      '--card-foreground': '270 22% 11%',
      '--popover': '270 14% 99%',
      '--popover-foreground': '270 22% 11%',
      '--secondary': '270 22% 94%',
      '--secondary-foreground': '270 22% 11%',
      '--muted': '270 22% 94%',
      '--muted-foreground': '270 16% 42%',
      '--accent': '270 28% 89%',
      '--accent-foreground': '270 22% 11%',
      '--border': '270 20% 86%',
      '--input': '270 20% 86%'
    },
    dark: {
      '--background': '270 26% 8%',
      '--foreground': '270 20% 96%',
      '--card': '270 24% 11%',
      '--card-foreground': '270 20% 96%',
      '--popover': '270 24% 11%',
      '--popover-foreground': '270 20% 96%',
      '--secondary': '270 32% 15%',
      '--secondary-foreground': '270 20% 96%',
      '--muted': '270 32% 15%',
      '--muted-foreground': '270 16% 64%',
      '--accent': '270 38% 19%',
      '--accent-foreground': '270 20% 96%',
      '--border': '270 26% 20%',
      '--input': '270 26% 20%'
    },
  },
  slate: {
    light: {
      '--background': '205 28% 99%',
      '--foreground': '212 40% 12%',
      '--card': '205 28% 99%',
      '--card-foreground': '212 40% 12%',
      '--popover': '205 28% 99%',
      '--popover-foreground': '212 40% 12%',
      '--secondary': '205 42% 94%',
      '--secondary-foreground': '212 40% 12%',
      '--muted': '205 42% 94%',
      '--muted-foreground': '210 22% 42%',
      '--accent': '205 50% 88%',
      '--accent-foreground': '212 40% 12%',
      '--border': '205 40% 85%',
      '--input': '205 40% 85%'
    },
    dark: {
      '--background': '215 34% 9%',
      '--foreground': '210 38% 96%',
      '--card': '214 30% 12%',
      '--card-foreground': '210 38% 96%',
      '--popover': '214 30% 12%',
      '--popover-foreground': '210 38% 96%',
      '--secondary': '213 40% 16%',
      '--secondary-foreground': '210 38% 96%',
      '--muted': '213 40% 16%',
      '--muted-foreground': '212 26% 66%',
      '--accent': '210 48% 20%',
      '--accent-foreground': '210 38% 96%',
      '--border': '213 34% 21%',
      '--input': '213 34% 21%'
    },
  },
  dailan: {
    light: {
      '--background': '212 30% 99%',
      '--foreground': '212 45% 12%',
      '--card': '212 30% 99%',
      '--card-foreground': '212 45% 12%',
      '--popover': '212 30% 99%',
      '--popover-foreground': '212 45% 12%',
      '--secondary': '212 36% 94%',
      '--secondary-foreground': '212 45% 12%',
      '--muted': '212 36% 94%',
      '--muted-foreground': '212 22% 42%',
      '--accent': '212 44% 89%',
      '--accent-foreground': '212 45% 12%',
      '--border': '212 32% 86%',
      '--input': '212 32% 86%'
    },
    dark: {
      '--background': '212 38% 8%',
      '--foreground': '210 40% 96%',
      '--card': '212 32% 11%',
      '--card-foreground': '210 40% 96%',
      '--popover': '212 32% 11%',
      '--popover-foreground': '210 40% 96%',
      '--secondary': '212 42% 15%',
      '--secondary-foreground': '210 40% 96%',
      '--muted': '212 42% 15%',
      '--muted-foreground': '210 26% 64%',
      '--accent': '210 48% 19%',
      '--accent-foreground': '210 40% 96%',
      '--border': '212 34% 20%',
      '--input': '212 34% 20%'
    },
  },
  zhusha: {
    light: {
      '--background': '35 28% 99%',
      '--foreground': '24 30% 12%',
      '--card': '35 28% 99%',
      '--card-foreground': '24 30% 12%',
      '--popover': '35 28% 99%',
      '--popover-foreground': '24 30% 12%',
      '--secondary': '35 32% 94%',
      '--secondary-foreground': '24 30% 12%',
      '--muted': '35 32% 94%',
      '--muted-foreground': '24 18% 42%',
      '--accent': '30 38% 89%',
      '--accent-foreground': '24 30% 12%',
      '--border': '35 28% 86%',
      '--input': '35 28% 86%'
    },
    dark: {
      '--background': '18 22% 8%',
      '--foreground': '25 32% 95%',
      '--card': '18 20% 11%',
      '--card-foreground': '25 32% 95%',
      '--popover': '18 20% 11%',
      '--popover-foreground': '25 32% 95%',
      '--secondary': '18 26% 14%',
      '--secondary-foreground': '25 32% 95%',
      '--muted': '18 26% 14%',
      '--muted-foreground': '20 18% 64%',
      '--accent': '16 32% 18%',
      '--accent-foreground': '25 32% 95%',
      '--border': '18 22% 19%',
      '--input': '18 22% 19%'
    },
  },
  songhua: {
    light: {
      '--background': '150 24% 99%',
      '--foreground': '155 40% 12%',
      '--card': '150 24% 99%',
      '--card-foreground': '155 40% 12%',
      '--popover': '150 24% 99%',
      '--popover-foreground': '155 40% 12%',
      '--secondary': '150 30% 94%',
      '--secondary-foreground': '155 40% 12%',
      '--muted': '150 30% 94%',
      '--muted-foreground': '155 20% 40%',
      '--accent': '150 40% 89%',
      '--accent-foreground': '155 40% 12%',
      '--border': '150 28% 86%',
      '--input': '150 28% 86%'
    },
    dark: {
      '--background': '155 30% 8%',
      '--foreground': '150 32% 95%',
      '--card': '155 26% 11%',
      '--card-foreground': '150 32% 95%',
      '--popover': '155 26% 11%',
      '--popover-foreground': '150 32% 95%',
      '--secondary': '155 34% 15%',
      '--secondary-foreground': '150 32% 95%',
      '--muted': '155 34% 15%',
      '--muted-foreground': '150 22% 64%',
      '--accent': '152 42% 19%',
      '--accent-foreground': '150 32% 95%',
      '--border': '155 30% 20%',
      '--input': '155 30% 20%'
    },
  },
  ouhe: {
    light: {
      '--background': '290 18% 99%',
      '--foreground': '290 30% 12%',
      '--card': '290 18% 99%',
      '--card-foreground': '290 30% 12%',
      '--popover': '290 18% 99%',
      '--popover-foreground': '290 30% 12%',
      '--secondary': '290 24% 95%',
      '--secondary-foreground': '290 30% 12%',
      '--muted': '290 24% 95%',
      '--muted-foreground': '290 18% 44%',
      '--accent': '290 30% 90%',
      '--accent-foreground': '290 30% 12%',
      '--border': '290 22% 87%',
      '--input': '290 22% 87%'
    },
    dark: {
      '--background': '288 28% 8%',
      '--foreground': '290 30% 96%',
      '--card': '288 24% 11%',
      '--card-foreground': '290 30% 96%',
      '--popover': '288 24% 11%',
      '--popover-foreground': '290 30% 96%',
      '--secondary': '288 34% 15%',
      '--secondary-foreground': '290 30% 96%',
      '--muted': '288 34% 15%',
      '--muted-foreground': '290 22% 66%',
      '--accent': '285 42% 19%',
      '--accent-foreground': '290 30% 96%',
      '--border': '288 30% 20%',
      '--input': '288 30% 20%'
    },
  },
  zheshi: {
    light: {
      '--background': '36 26% 99%',
      '--foreground': '26 26% 12%',
      '--card': '36 26% 99%',
      '--card-foreground': '26 26% 12%',
      '--popover': '36 26% 99%',
      '--popover-foreground': '26 26% 12%',
      '--secondary': '36 30% 94%',
      '--secondary-foreground': '26 26% 12%',
      '--muted': '36 30% 94%',
      '--muted-foreground': '26 16% 42%',
      '--accent': '28 36% 89%',
      '--accent-foreground': '26 26% 12%',
      '--border': '33 26% 86%',
      '--input': '33 26% 86%'
    },
    dark: {
      '--background': '22 18% 8%',
      '--foreground': '30 26% 94%',
      '--card': '22 16% 11%',
      '--card-foreground': '30 26% 94%',
      '--popover': '22 16% 11%',
      '--popover-foreground': '30 26% 94%',
      '--secondary': '24 22% 14%',
      '--secondary-foreground': '30 26% 94%',
      '--muted': '24 22% 14%',
      '--muted-foreground': '26 16% 64%',
      '--accent': '20 30% 18%',
      '--accent-foreground': '30 26% 94%',
      '--border': '22 18% 19%',
      '--input': '22 18% 19%'
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
  dailan:    { light: '212 64% 48%',  dark: '210 72% 58%'  },  // 群青/靛蓝
  zhusha:    { light: '12 85% 52%',  dark: '12 88% 60%'  },  // 朱红/朱砂
  songhua:    { light: '150 58% 40%',  dark: '148 50% 48%'  },  // 松花绿/碧
  ouhe:    { light: '288 46% 50%',  dark: '288 48% 62%'  },  // 藕荷/青莲紫
  zheshi:    { light: '18 48% 40%',  dark: '18 46% 52%'  },  // 赭石/檀
}

// ========== Radius 映射表 ==========
var radiusMap = {
  none:    '0px',
  small:   '0.375rem',   // 6px
  default: '0.5rem',     // 8px
  large:   '0.75rem',    // 12px
}

// ========== 中国传统纹样映射表 ==========
// 矢量 SVG（无损、可平铺），仅描述「形状」；颜色由 CSS mask + 变量控制，
// 因此能同时适配 明/暗 两种模式，并跟随各套主题色调。
//
// 应用方式（推荐用 mask，可随明/暗与主题色调自动变化）：
//   .app-bg::before {
//     content: ""; position: absolute; inset: 0; pointer-events: none;
//     -webkit-mask-image: var(--pattern-mask); mask-image: var(--pattern-mask);
//     -webkit-mask-repeat: repeat; mask-repeat: repeat;
//     -webkit-mask-size: var(--pattern-size); mask-size: var(--pattern-size);
//     background-color: var(--pattern-ink);   /* 纹样颜色：明/暗自动反相 + 带主题色相 */
//   }
// 其中 --pattern-ink 建议设为：hsl(var(--foreground) / 0.05)
//   （foreground 已含主题色相且随明/暗翻转，纹样即天然"墨随纸变"并带色调）
//   若想让纹样更"主题化"，可改成：hsl(var(--primary) / 0.06)
//
// 也可直接用 background-image（固定色，不随明/暗反相）：
//   .app-bg { background-image: var(--pattern-mask); background-repeat: repeat; }
//   （此时 SVG 内形状需改为指定颜色，而非 black）
var patternMap = {
  none:    { uri: null, size: null },
  huiwen: {
    label: '回纹',
    uri: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2244%22%20height%3D%2244%22%20viewBox%3D%220%200%2044%2044%22%3E%3Crect%20x%3D%229%22%20y%3D%229%22%20width%3D%2226%22%20height%3D%2226%22%20rx%3D%222%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%223%22%2F%3E%3Crect%20x%3D%2217%22%20y%3D%2217%22%20width%3D%2210%22%20height%3D%2210%22%20rx%3D%221%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222%22%2F%3E%3C%2Fsvg%3E",
    size: "44px 44px"
  },
  yunwen: {
    label: '云纹',
    uri: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2264%22%20height%3D%2264%22%20viewBox%3D%220%200%2064%2064%22%3E%3Cpath%20d%3D%22M5%2044%20A11%2011%200%200%201%2027%2044%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222.5%22%2F%3E%3Cpath%20d%3D%22M21%2044%20A11%2011%200%200%201%2043%2044%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222.5%22%2F%3E%3Cpath%20d%3D%22M37%2044%20A11%2011%200%200%201%2059%2044%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222.5%22%2F%3E%3C%2Fsvg%3E",
    size: "64px 64px"
  },
  shuiwen: {
    label: '水纹',
    uri: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2260%22%20height%3D%2226%22%20viewBox%3D%220%200%2060%2026%22%3E%3Cpath%20d%3D%22M0%208%20q15%20-7%2030%200%20t30%200%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222%22%2F%3E%3Cpath%20d%3D%22M0%2018%20q15%207%2030%200%20t30%200%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222%22%2F%3E%3C%2Fsvg%3E",
    size: "60px 26px"
  },
  lianzhu: {
    label: '联珠纹',
    uri: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2240%22%20height%3D%2240%22%20viewBox%3D%220%200%2040%2040%22%3E%3Ccircle%20cx%3D%2220%22%20cy%3D%2220%22%20r%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222.5%22%2F%3E%3C%2Fsvg%3E",
    size: "40px 40px"
  },
  qianwen: {
    label: '钱纹',
    uri: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2256%22%20height%3D%2256%22%20viewBox%3D%220%200%2056%2056%22%3E%3Cpath%20fill-rule%3D%22evenodd%22%20fill%3D%22black%22%20d%3D%22M10%2028%20a18%2018%200%201%200%2036%200%20a18%2018%200%201%200%20-36%200%20Z%20M20%2020%20h16%20v16%20h-16%20Z%22%2F%3E%3C%2Fsvg%3E",
    size: "56px 56px"
  },
  fangsheng: {
    label: '方胜纹',
    uri: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2248%22%20height%3D%2248%22%20viewBox%3D%220%200%2048%2048%22%3E%3Cpath%20d%3D%22M24%204%20L44%2024%20L24%2044%20L4%2024%20Z%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222.5%22%2F%3E%3Cpath%20d%3D%22M24%2014%20L34%2024%20L24%2034%20L14%2024%20Z%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222%22%2F%3E%3C%2Fsvg%3E",
    size: "48px 48px"
  },
  suozi: {
    label: '锁子纹',
    uri: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2248%22%20height%3D%2248%22%20viewBox%3D%220%200%2048%2048%22%3E%3Ccircle%20cx%3D%2224%22%20cy%3D%2224%22%20r%3D%2216%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%223%22%2F%3E%3Ccircle%20cx%3D%220%22%20cy%3D%220%22%20r%3D%2216%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%223%22%2F%3E%3Ccircle%20cx%3D%2248%22%20cy%3D%220%22%20r%3D%2216%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%223%22%2F%3E%3Ccircle%20cx%3D%220%22%20cy%3D%2248%22%20r%3D%2216%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%223%22%2F%3E%3Ccircle%20cx%3D%2248%22%20cy%3D%2248%22%20r%3D%2216%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%223%22%2F%3E%3C%2Fsvg%3E",
    size: "48px 48px"
  },
  xiwen: {
    label: '席纹',
    uri: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2228%22%20height%3D%2228%22%20viewBox%3D%220%200%2028%2028%22%3E%3Cpath%20d%3D%22M0%200%20L28%2028%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%223%22%2F%3E%3Cpath%20d%3D%22M28%200%20L0%2028%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%223%22%2F%3E%3C%2Fsvg%3E",
    size: "28px 28px"
  },
  binglie: {
    label: '冰裂纹',
    uri: "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2260%22%20height%3D%2260%22%20viewBox%3D%220%200%2060%2060%22%3E%3Cpath%20d%3D%22M30%200%20L48%2012%20L60%2030%20L48%2048%20L30%2060%20L12%2048%20L0%2030%20L12%2012%20Z%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222%22%2F%3E%3Cpath%20d%3D%22M30%2030%20L30%200%20M30%2030%20L60%2030%20M30%2030%20L30%2060%20M30%2030%20L0%2030%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%222%22%2F%3E%3C%2Fsvg%3E",
    size: "60px 60px"
  },
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



// ========== 应用传统纹样到背景 ==========
// 纹样只描述形状，颜色由 CSS mask + --pattern-ink 控制，
// 因此明/暗自动反相、且跟随当前主题色调（--foreground 含色相）。
//
// 亮色模式：纹样墨色偏深（foreground 0.05），浅底深纹
// 暗色模式：纹样墨色偏浅（foreground 0.04），深底浅纹
// 两种模式均带主题色相（--foreground 由 baseColor 控制）
function applyPattern(name) {
  var root = document.documentElement
  var p = patternMap[name] || patternMap.none
  if (p && p.uri) {
    root.style.setProperty('--pattern-mask', 'url("' + p.uri + '")')
    // 缩小纹样到原始大小的 60%，使纹样更精细
    var scaledSize = p.size.replace(/(\d+)px/g, function (match, num) {
      return Math.round(parseInt(num) * 0.6) + 'px'
    })
    root.style.setProperty('--pattern-size', scaledSize)
    // 根据当前明/暗模式设置纹样墨色透明度
    var dark = isDark.value
    root.style.setProperty('--pattern-ink', 'hsl(var(--foreground) / ' + (dark ? '0.04' : '0.05') + ')')
    // 标记纹样已启用（供 CSS 选择器判断是否显示 ::before 伪元素）
    root.setAttribute('data-pattern', 'on')
  } else {
    root.style.setProperty('--pattern-mask', 'none')
    root.style.setProperty('--pattern-size', 'auto')
    root.style.setProperty('--pattern-ink', 'transparent')
    root.removeAttribute('data-pattern')
  }
}

/** 设置背景纹样 */
function setPattern(name) {
  localStorage.setItem('theme-pattern', name)
  applyPattern(name)
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

  // 先应用主题（设置 isDark），再应用纹样（依赖 isDark 设置墨色透明度）
  applyTheme()
  applyPattern(localStorage.getItem('theme-pattern') || 'none')
}

// 立即初始化
initTheme()

// 当 isDark 变化时，重新应用定制（确保变量同步）并更新纹样墨色
watch(isDark, function () {
  applyThemeCustomization()
  // 明暗切换时重新应用纹样，确保 --pattern-ink 透明度与当前模式匹配
  applyPattern(localStorage.getItem('theme-pattern') || 'none')
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
  setPattern,
  // 配置映射（供 UI 展示用）
  baseColorMap,
  primaryColorMap,
  patternMap,
  radiusMap,
  fontFamilyMap,
}
