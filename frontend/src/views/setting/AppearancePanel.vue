<template>
  <div class="mx-auto max-w-[640px]">
    <h3 class="flex items-center gap-2 text-base font-semibold text-foreground">外观</h3>
    <p class="mb-4 mt-1.5 text-xs leading-relaxed text-muted-foreground">自定义应用的视觉风格与 Markdown 渲染字号</p>

    <!-- 外观设置卡片 -->
    <div class="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <!-- 主题模式 -->
      <div class="flex items-center justify-between border-b border-border/50 px-4 py-3.5">
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-medium text-foreground">主题模式</div>
          <div class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">选择应用的配色方案，支持跟随系统</div>
        </div>
        <div class="inline-flex shrink-0 items-center rounded-lg bg-muted p-0.5">
          <button
            v-for="opt in themeOptions" :key="opt.value"
            class="inline-flex h-[26px] items-center justify-center rounded-md px-3.5 text-xs font-medium transition-all"
            :class="themeMode === opt.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="setThemeMode(opt.value)"
          >{{ opt.label }}</button>
        </div>
      </div>

      <!-- Markdown 字号 -->
      <div class="flex items-center justify-between border-b border-border/50 px-4 py-3.5">
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-medium text-foreground">Markdown 字号</div>
          <div class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">调整 AI 回复与 Markdown 内容的正文字号</div>
        </div>
        <div class="inline-flex shrink-0 items-center rounded-lg bg-muted p-0.5">
          <button
            v-for="opt in fontSizeOptions" :key="opt.value"
            class="inline-flex h-[26px] items-center justify-center rounded-md px-3.5 text-xs font-medium transition-all"
            :class="markdownFontSize === opt.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            @click="onFontSizeChange(opt.value)"
          >{{ opt.label }}</button>
        </div>
      </div>

      <!-- 主题样式定制 -->
      <div class="border-b border-border/50 bg-muted/30 px-4 py-2.5">
        <div class="text-[13px] font-semibold text-foreground">主题样式定制</div>
        <div class="mt-0.5 text-[11px] text-muted-foreground">参考 shadcn-vue 主题定制器，自定义基础色调、主色和圆角</div>
      </div>

      <!-- 基础色调 — 横向滚动卡片 -->
      <div class="border-b border-border/50 px-4 py-3.5">
        <div class="mb-2.5">
          <div class="text-[13px] font-medium text-foreground">基础色调</div>
          <div class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">控制背景、边框、文字的基础灰色调</div>
        </div>
        <div class="base-color-scroll -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1" style="scrollbar-width: thin;">
          <button
            v-for="opt in baseColorOptions" :key="opt.value"
            class="group relative flex shrink-0 flex-col overflow-hidden rounded-lg border-2 transition-all"
            :class="baseColor === opt.value
              ? 'border-primary ring-2 ring-primary/20'
              : 'border-border hover:border-muted-foreground'"
            :style="opt.cardStyle"
            :title="opt.label"
            @click="setBaseColor(opt.value)"
          >
            <!-- 卡片预览区：模拟该色调下的 UI 样式 -->
            <div class="flex flex-col gap-1.5 p-2.5" :style="opt.previewStyle">
              <!-- 模拟标题行 -->
              <div class="h-1.5 w-16 rounded-full" :style="opt.fgStyle" />
              <!-- 模拟正文行 -->
              <div class="h-1 w-20 rounded-full opacity-60" :style="opt.fgStyle" />
              <!-- 模拟按钮 -->
              <div class="mt-0.5 flex items-center gap-1">
                <div class="h-3 w-8 rounded" :style="opt.primaryBtnStyle" />
                <div class="h-3 w-6 rounded border" :style="opt.secondaryBtnStyle" />
              </div>
              <!-- 模拟输入框 -->
              <div class="mt-0.5 h-3 w-24 rounded border" :style="opt.inputStyle" />
            </div>
            <!-- 卡片名称 -->
            <div class="flex items-center justify-between px-2.5 py-1.5" :style="opt.labelBarStyle">
              <span class="text-[10px] font-medium leading-none" :style="opt.labelStyle">{{ opt.label }}</span>
              <Check v-if="baseColor === opt.value" class="size-3 shrink-0" :style="opt.checkStyle" />
            </div>
          </button>
        </div>
      </div>

      <!-- 背景纹样 — 横向滚动卡片 -->
      <div class="border-b border-border/50 px-4 py-3.5">
        <div class="mb-2.5">
          <div class="text-[13px] font-medium text-foreground">背景纹样</div>
          <div class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">中国传统纹样点缀，颜色随主题色调自动适配</div>
        </div>
        <div class="base-color-scroll -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1" style="scrollbar-width: thin;">
          <button
            v-for="opt in patternOptions" :key="opt.value"
            class="group relative flex min-w-[116px] shrink-0 flex-col overflow-hidden rounded-lg border-2 transition-all"
            :class="currentPattern === opt.value
              ? 'border-primary ring-2 ring-primary/20'
              : 'border-border hover:border-muted-foreground'"
            :style="opt.cardStyle"
            :title="opt.label"
            @click="onPatternChange(opt.value)"
          >
            <!-- 纹样预览区：高度减半，宽度与基础色调卡片一致 -->
            <div class="relative h-[34px] w-full overflow-hidden" :style="opt.previewStyle">
              <!-- 纹样 mask 层 -->
              <div
                v-if="opt.uri"
                class="absolute inset-0"
                :style="opt.previewMaskStyle"
              />
              <!-- 无纹样占位 -->
              <div
                v-else
                class="absolute inset-0 flex items-center justify-center"
              >
                <span class="text-[10px] text-muted-foreground/60">无</span>
              </div>
            </div>
            <!-- 卡片名称 -->
            <div class="flex items-center justify-between px-2.5 py-1.5" :style="opt.labelBarStyle">
              <span class="text-[10px] font-medium leading-none" :style="opt.labelStyle">{{ opt.label }}</span>
              <Check v-if="currentPattern === opt.value" class="size-3 shrink-0" :style="opt.checkStyle" />
            </div>
          </button>
        </div>
      </div>

      <!-- 主色 -->
      <div class="flex items-center justify-between border-b border-border/50 px-4 py-3.5">
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-medium text-foreground">主色</div>
          <div class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">控制按钮、链接、高亮等强调元素的颜色</div>
        </div>
        <div class="flex shrink-0 flex-wrap justify-end gap-1.5" style="max-width: 260px;">
          <button
            v-for="opt in primaryColorOptions" :key="opt.value"
            class="flex size-8 items-center justify-center rounded-full border-2 transition-all"
            :class="primaryColor === opt.value ? 'border-foreground ring-2 ring-primary/20' : 'border-border hover:border-muted-foreground'"
            :style="{ background: opt.swatch }"
            :title="opt.label"
            @click="setPrimaryColor(opt.value)"
          >
            <Check v-if="primaryColor === opt.value" class="size-3.5 text-white" />
          </button>
        </div>
      </div>

      <!-- 圆角 -->
      <div class="flex items-center justify-between px-4 py-3.5">
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-medium text-foreground">圆角</div>
          <div class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">控制卡片、按钮、输入框等组件的圆角大小</div>
        </div>
        <div class="inline-flex shrink-0 items-center rounded-lg bg-muted p-0.5">
          <button
            v-for="opt in radiusOptions" :key="opt.value"
            class="inline-flex h-[26px] items-center justify-center rounded-md px-3 text-xs font-medium transition-all"
            :class="radiusSize === opt.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
            :style="{ borderRadius: opt.preview }"
            @click="setRadiusSize(opt.value)"
          >{{ opt.label }}</button>
        </div>
      </div>

      <!-- 字体 -->
      <div class="flex items-center justify-between border-t border-border/50 px-4 py-3.5">
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-medium text-foreground">字体</div>
          <div class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">控制全局 UI 界面的字体族，需要联网加载 Google Fonts</div>
        </div>
        <select
          class="h-8 min-w-[140px] rounded-md border border-border bg-background px-3 text-xs text-foreground outline-none transition-colors hover:border-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
          :value="fontFamily"
          @change="onFontFamilyChange($event.target.value)"
        >
          <optgroup v-for="grp in fontFamilyGroups" :key="grp.group" :label="grp.group">
            <option v-for="opt in grp.options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </optgroup>
        </select>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Check } from '@lucide/vue'
import { FONT_SIZE_OPTIONS, getMarkdownFontSize, setMarkdownFontSize } from '@/utils/markdown-font-size'
import {
  themeMode, setThemeMode, baseColor, primaryColor, radiusSize,
  fontFamily, fontFamilyMap, setBaseColor, setPrimaryColor, setRadiusSize, setFontFamily,
  baseColorMap, primaryColorMap, systemDark,
  patternMap, setPattern,
} from '@/theme'

const markdownFontSize = ref('medium')

const themeOptions = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

// ========== 基础色调选项 — 从 baseColorMap 动态生成 ==========
// 基础色调的中文标签映射
const baseColorLabels = {
  neutral: 'Neutral',
  gray: 'Gray',
  zinc: 'Zinc',
  stone: 'Stone',
  slate: 'Slate',
  dailan: '黛蓝',
  zhusha: '朱砂',
  songhua: '松花',
  ouhe: '藕荷',
  zheshi: '赭石',
}

/**
 * 将 HSL 字符串（如 "0 0% 100%"）转换为 CSS hsl() 函数格式
 */
function hsl(hslStr) {
  return `hsl(${hslStr})`
}

/**
 * 为基础色调生成横向滚动卡片所需的全部预览样式
 * 每张卡片模拟该色调在当前亮/暗模式下的真实外观
 */
const baseColorOptions = computed(() => {
  return Object.keys(baseColorMap).map((key) => {
    const colorSet = baseColorMap[key]
    const dark = themeMode.value === 'dark' || (themeMode.value === 'system' && systemDark.value)
    const colors = dark ? colorSet.dark : colorSet.light

    const bg = hsl(colors['--background'] || '0 0% 100%')
    const fg = hsl(colors['--foreground'] || '0 0% 9%')
    const border = hsl(colors['--border'] || '0 0% 90%')
    const muted = hsl(colors['--muted'] || '0 0% 96%')
    const card = hsl(colors['--card'] || bg)
    const secondary = hsl(colors['--secondary'] || muted)

    return {
      value: key,
      label: baseColorLabels[key] || key,
      // 整张卡片背景用该色调的 card 色
      cardStyle: { background: card },
      // 预览区使用该色调的真实变量
      previewStyle: { background: bg },
      // 标题行 — 用 foreground 色
      fgStyle: { background: fg },
      // 模拟主色按钮 — 用当前已选 primary 的色值
      primaryBtnStyle: {
        background: `hsl(${primaryColorMap[primaryColor.value] ? (dark ? primaryColorMap[primaryColor.value].dark : primaryColorMap[primaryColor.value].light) : '221 83% 53%'})`,
      },
      // 模拟次要按钮 — 用 secondary 色 + border
      secondaryBtnStyle: {
        background: secondary,
        borderColor: border,
      },
      // 模拟输入框 — 用 background + border
      inputStyle: {
        background: bg,
        borderColor: border,
      },
      // 底部标签栏 — 用 muted 色作为背景
      labelBarStyle: { background: muted },
      // 标签文字 — 用 foreground 色
      labelStyle: { color: fg },
      // 选中勾的色 — 用 primary
      checkStyle: {
        color: `hsl(${primaryColorMap[primaryColor.value] ? (dark ? primaryColorMap[primaryColor.value].dark : primaryColorMap[primaryColor.value].light) : '221 83% 53%'})`,
      },
    }
  })
})

// ========== 主色选项 — 从 primaryColorMap 动态生成 ==========
// 主色的中文标签映射
const primaryColorLabels = {
  blue: 'Blue',
  green: 'Green',
  violet: 'Violet',
  rose: 'Rose',
  orange: 'Orange',
  red: 'Red',
  cyan: 'Cyan',
  dailan: '黛蓝',
  zhusha: '朱砂',
  songhua: '松花',
  ouhe: '藕荷',
  zheshi: '赭石',
}

const primaryColorOptions = computed(() => {
  const dark = themeMode.value === 'dark' || (themeMode.value === 'system' && systemDark.value)
  return Object.keys(primaryColorMap).map((key) => {
    const colorInfo = primaryColorMap[key]
    const hslVal = dark ? colorInfo.dark : colorInfo.light
    return {
      value: key,
      label: primaryColorLabels[key] || key,
      swatch: `hsl(${hslVal})`,
    }
  })
})

const radiusOptions = [
  { value: 'none',    label: '无',   preview: '0px'       },
  { value: 'small',   label: '小',   preview: '6px'       },
  { value: 'default',  label: '中',   preview: '8px'       },
  { value: 'large',    label: '大',   preview: '12px'      },
]

const fontGroupOrder = ['系统', '无衬线', '等宽', '衬线']
const fontFamilyGroups = fontGroupOrder
  .map((group) => ({
    group,
    options: Object.entries(fontFamilyMap)
      .filter(([, info]) => info.group === group)
      .map(([value, info]) => ({ value, label: info.label })),
  }))
  .filter((g) => g.options.length > 0)

const fontSizeOptions = FONT_SIZE_OPTIONS

function onFontSizeChange(size) {
  markdownFontSize.value = size
  setMarkdownFontSize(size)
}

function onFontFamilyChange(font) {
  setFontFamily(font)
}

// ========== 背景纹样 ==========
/** 当前选中的纹样（从 localStorage 恢复） */
const currentPattern = ref(localStorage.getItem('theme-pattern') || 'none')

/** 纹样选项 — 从 patternMap 动态生成，预览模拟当前亮/暗模式效果 */
const patternOptions = computed(() => {
  const dark = themeMode.value === 'dark' || (themeMode.value === 'system' && systemDark.value)
  const colors = baseColorMap[baseColor.value]
  const targetColors = dark ? colors.dark : colors.light

  const bg = `hsl(${targetColors['--background'] || '0 0% 100%'})`
  const fg = `hsl(${targetColors['--foreground'] || '0 0% 9%'})`
  const muted = `hsl(${targetColors['--muted'] || '0 0% 96%'})`
  const cardBg = `hsl(${targetColors['--card'] || targetColors['--background'] || '0 0% 100%'})`
  const border = `hsl(${targetColors['--border'] || '0 0% 90%'})`
  const secondary = `hsl(${targetColors['--secondary'] || targetColors['--muted'] || '0 0% 96%'})`
  const accent = `hsl(${targetColors['--accent'] || targetColors['--secondary'] || '0 0% 94%'})`
  const mutedFg = `hsl(${targetColors['--muted-foreground'] || '0 0% 40%'})`
  const primaryHsl = primaryColorMap[primaryColor.value]
    ? (dark ? primaryColorMap[primaryColor.value].dark : primaryColorMap[primaryColor.value].light)
    : '221 83% 53%'
  const primarySwatch = `hsl(${primaryHsl})`

  // 纹样墨色透明度：亮色偏深、暗色偏浅
  const inkAlpha = dark ? '0.06' : '0.07'

  return Object.keys(patternMap).map((key) => {
    const p = patternMap[key]
    return {
      value: key,
      label: p.label || '无',
      uri: p.uri,
      // 整张卡片背景用当前色调的 card 色（与基础色调卡片一致）
      cardStyle: { background: cardBg },
      // 预览区背景：模拟当前主题的 background 色
      previewStyle: { background: bg },
      // 纹样 mask 层：用 CSS mask 显示纹样形状，墨色跟随 foreground
      previewMaskStyle: p.uri ? {
        '-webkit-mask-image': `url("${p.uri}")`,
        'mask-image': `url("${p.uri}")`,
        '-webkit-mask-repeat': 'repeat',
        'mask-repeat': 'repeat',
        '-webkit-mask-size': p.size,
        'mask-size': p.size,
        'background-color': `hsl(${targetColors['--foreground'] || '0 0% 9%'} / ${inkAlpha})`,
      } : null,
      // 底部标签栏
      labelBarStyle: { background: muted },
      labelStyle: { color: fg },
      checkStyle: { color: primarySwatch },
    }
  })
})

function onPatternChange(name) {
  currentPattern.value = name
  setPattern(name)
}

// ========== 底部预览区域 — 参考 theme_preview.html 单卡片布局 ==========
const previewStyles = computed(() => {
  const dark = themeMode.value === 'dark' || (themeMode.value === 'system' && systemDark.value)
  const colors = baseColorMap[baseColor.value]
  const targetColors = dark ? colors.dark : colors.light

  const bg = `hsl(${targetColors['--background'] || '0 0% 100%'})`
  const fg = `hsl(${targetColors['--foreground'] || '0 0% 9%'})`
  const card = `hsl(${targetColors['--card'] || targetColors['--background'] || '0 0% 100%'})`
  const muted = `hsl(${targetColors['--muted'] || '0 0% 96%'})`
  const border = `hsl(${targetColors['--border'] || '0 0% 90%'})`
  const secondary = `hsl(${targetColors['--secondary'] || targetColors['--muted'] || '0 0% 96%'})`
  const accent = `hsl(${targetColors['--accent'] || targetColors['--secondary'] || '0 0% 94%'})`
  const mutedFg = `hsl(${targetColors['--muted-foreground'] || '0 0% 40%'})`
  const primaryHsl = primaryColorMap[primaryColor.value]
    ? (dark ? primaryColorMap[primaryColor.value].dark : primaryColorMap[primaryColor.value].light)
    : '221 83% 53%'
  const primary = `hsl(${primaryHsl})`

  return {
    root: { background: card, padding: '16px' },
    mock: { borderColor: border },
    sidebar: { background: secondary, borderRight: `1px solid ${border}` },
    logo: { background: primary },
    navActive: { background: accent, color: fg, fontWeight: '600' },
    nav: { color: mutedFg },
    content: { background: bg },
    bar: { background: secondary, borderBottom: `1px solid ${border}` },
    text: { color: fg },
    pill: { background: primary },
    cardEl: { background: card, borderColor: border },
    subtext: { color: mutedFg },
    primaryBtn: { background: primary },
    secondaryBtn: { borderColor: border, color: fg },
    hover: { background: accent, borderColor: border, color: fg },
    divider: { background: border },
    mutedText: { color: mutedFg, opacity: '0.7' },
  }
})

// 解构为扁平的 computed 供模板使用
const previewRootStyle = computed(() => previewStyles.value.root)
const previewMockStyle = computed(() => previewStyles.value.mock)
const previewSidebarStyle = computed(() => previewStyles.value.sidebar)
const previewLogoStyle = computed(() => previewStyles.value.logo)
const previewNavActiveStyle = computed(() => previewStyles.value.navActive)
const previewNavStyle = computed(() => previewStyles.value.nav)
const previewContentStyle = computed(() => previewStyles.value.content)
const previewBarStyle = computed(() => previewStyles.value.bar)
const previewTextStyle = computed(() => ({ color: previewStyles.value.text.color }))
const previewPillStyle = computed(() => previewStyles.value.pill)
const previewCardStyle = computed(() => previewStyles.value.cardEl)
const previewSubtextStyle = computed(() => previewStyles.value.subtext)
const previewPrimaryBtnStyle = computed(() => previewStyles.value.primaryBtn)
const previewSecondaryBtnStyle = computed(() => previewStyles.value.secondaryBtn)
const previewHoverStyle = computed(() => previewStyles.value.hover)
const previewDividerStyle = computed(() => previewStyles.value.divider)
const previewMutedTextStyle = computed(() => previewStyles.value.mutedText)

onMounted(() => {
  markdownFontSize.value = getMarkdownFontSize()
})
</script>

<style scoped>
/* 基础色调横向滚动区域 — 细滚动条 */
.base-color-scroll {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--border)) transparent;
}
.base-color-scroll::-webkit-scrollbar {
  height: 4px;
}
.base-color-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.base-color-scroll::-webkit-scrollbar-thumb {
  background-color: hsl(var(--border));
  border-radius: 2px;
}
.base-color-scroll::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--muted-foreground) / 0.5);
}
</style>
