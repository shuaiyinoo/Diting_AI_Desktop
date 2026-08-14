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

      <!-- 基础色调 -->
      <div class="flex items-center justify-between border-b border-border/50 px-4 py-3.5">
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-medium text-foreground">基础色调</div>
          <div class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">控制背景、边框、文字的基础灰色调</div>
        </div>
        <div class="flex shrink-0 gap-1.5">
          <button
            v-for="opt in baseColorOptions" :key="opt.value"
            class="flex size-8 items-center justify-center rounded-full border-2 transition-all"
            :class="baseColor === opt.value ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-muted-foreground'"
            :style="{ background: opt.swatch }"
            :title="opt.label"
            @click="setBaseColor(opt.value)"
          >
            <Check v-if="baseColor === opt.value" class="size-3.5 text-white" />
          </button>
        </div>
      </div>

      <!-- 主色 -->
      <div class="flex items-center justify-between border-b border-border/50 px-4 py-3.5">
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-medium text-foreground">主色</div>
          <div class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">控制按钮、链接、高亮等强调元素的颜色</div>
        </div>
        <div class="flex shrink-0 gap-1.5">
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

    <!-- 预览区域 -->
    <div class="mt-4 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div class="mb-3 text-[11px] font-medium text-muted-foreground">预览</div>
      <div class="flex flex-wrap items-center gap-3">
        <Button size="sm">主按钮</Button>
        <Button variant="secondary" size="sm">次要按钮</Button>
        <Button variant="outline" size="sm">轮廓按钮</Button>
        <Badge>Badge</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <div class="flex items-center gap-2 rounded-md border border-border px-3 py-1">
          <span class="text-xs text-muted-foreground">输入框</span>
        </div>
      </div>
      <p class="mt-3 text-sm text-foreground">The quick brown fox jumps over the lazy dog. — 字体预览 1234567890</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Check } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FONT_SIZE_OPTIONS, getMarkdownFontSize, setMarkdownFontSize } from '@/utils/markdown-font-size'
import {
  themeMode, setThemeMode, baseColor, primaryColor, radiusSize,
  fontFamily, fontFamilyMap, setBaseColor, setPrimaryColor, setRadiusSize, setFontFamily,
} from '@/theme'

const markdownFontSize = ref('medium')

const themeOptions = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

const baseColorOptions = [
  { value: 'neutral', label: 'Neutral',  swatch: 'linear-gradient(135deg, #ffffff 50%, #171717 50%)' },
  { value: 'gray',    label: 'Gray',     swatch: 'linear-gradient(135deg, #ffffff 50%, #08080a 50%)' },
  { value: 'zinc',    label: 'Zinc',     swatch: 'linear-gradient(135deg, #ffffff 50%, #09090b 50%)' },
  { value: 'stone',   label: 'Stone',    swatch: 'linear-gradient(135deg, #ffffff 50%, #0c0a09 50%)' },
  { value: 'slate',   label: 'Slate',   swatch: 'linear-gradient(135deg, #ffffff 50%, #0f172a 50%)' },
]

const primaryColorOptions = [
  { value: 'blue',    label: 'Blue',     swatch: 'hsl(221 83% 53%)'  },
  { value: 'green',   label: 'Green',    swatch: 'hsl(142 71% 45%)'  },
  { value: 'violet',  label: 'Violet',   swatch: 'hsl(262 83% 58%)'  },
  { value: 'rose',    label: 'Rose',     swatch: 'hsl(347 77% 50%)'  },
  { value: 'orange',  label: 'Orange',   swatch: 'hsl(24 95% 53%)'   },
  { value: 'red',     label: 'Red',      swatch: 'hsl(0 84% 60%)'    },
  { value: 'cyan',    label: 'Cyan',     swatch: 'hsl(189 94% 43%)'  },
]

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

onMounted(() => {
  markdownFontSize.value = getMarkdownFontSize()
})
</script>
