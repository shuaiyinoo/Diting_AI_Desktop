<script setup lang="ts">
/**
 * WidgetNode — 自由 SVG 内联渲染组件
 *
 * 用于 markstream-vue 的 setCustomComponents 机制：
 * 当 LLM 输出 ```widget 代码块（内部为完整 <svg>…</svg>）时，
 * markstream-vue 会将代码块路由到本组件。
 *
 * 核心设计：
 * 1. CSS 变量映射层 — 在容器上定义语义化变量（--w-text-primary 等），
 *    亮/暗模式自动切换，LLM 产出的 SVG 引用这些变量即可主题跟随。
 * 2. DOMPurify 净化 — 保留 class 属性和内联 <style> 标签，
 *    禁止 <script>、事件处理器等危险内容。
 * 3. loading 延迟 — 仅在 fence 闭合（loading=false）后才渲染，避免流式半成品畸形。
 * 4. 顶部工具栏 — 图标+标题 | 预览/源码切换 | 展开/复制/下载PNG/缩放
 * 5. 固定高度 — 头部 40px + 内容区最高 450px，支持全屏展开
 * 6. 全屏模式 — 使用 Teleport 到 body，绕过 markstream-vue 的 transform 降级
 */

import { computed, ref, onMounted, onUnmounted, watch } from 'vue'
import DOMPurify from 'dompurify'

interface CodeBlockNodeData {
  type: 'code_block'
  language: string
  code: string
  raw: string
}

const props = defineProps<{
  node: CodeBlockNodeData
  loading?: boolean
  isDark?: boolean
}>()

// ========== 视图模式 ==========
type ViewMode = 'preview' | 'source'
const viewMode = ref<ViewMode>('preview')

// ========== 缩放 ==========
const zoomLevel = ref(1)

function zoomIn() {
  zoomLevel.value = Math.min(zoomLevel.value + 0.2, 3)
}

function zoomOut() {
  zoomLevel.value = Math.max(zoomLevel.value - 0.2, 0.4)
}

function zoomReset() {
  zoomLevel.value = 1
}

// ========== 全屏展开 ==========
const isExpanded = ref(false)

function toggleExpand() {
  isExpanded.value = !isExpanded.value
  if (isExpanded.value) {
    document.body.classList.add('widget-fullscreen-lock')
  } else {
    document.body.classList.remove('widget-fullscreen-lock')
  }
}

// ========== ESC 退出全屏 ==========
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isExpanded.value) {
    toggleExpand()
  }
}

onMounted(() => {
  document.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
  if (isExpanded.value) {
    document.body.classList.remove('widget-fullscreen-lock')
  }
})

// ========== SVG 净化 ==========
const safeSvg = computed(() => {
  if (props.loading) return ''
  const raw = props.node?.code || ''
  if (!raw.trim()) return ''
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    ADD_TAGS: ['style'],
    FORBID_TAGS: ['script'],
    FORBID_ATTR: ['onload', 'onclick', 'onerror', 'onmouseover', 'onmouseout', 'onmouseenter', 'onmouseleave', 'onfocus', 'onblur'],
    ALLOWED_ATTR: ['class', 'style', 'fill', 'stroke', 'stroke-width', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'viewBox', 'width', 'height', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'transform', 'marker-end', 'marker-start', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'role', 'xmlns', 'fill-opacity', 'stroke-opacity', 'refX', 'refY', 'markerWidth', 'markerHeight', 'orient', 'fill-rule', 'clip-path', 'clip-rule'],
  })
})

const hasSvg = computed(() => safeSvg.value.length > 0)
const fallbackRaw = computed(() => props.node?.raw || props.node?.code || '')

// ========== SVG 源码（格式化展示） ==========
const svgSource = computed(() => {
  const raw = props.node?.code || ''
  if (!raw.trim()) return ''
  return raw.trim()
})

// ========== 复制 ==========
const copied = ref(false)

async function copyContent() {
  const text = props.node?.code || ''
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // 降级：创建临时 textarea
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    try { document.execCommand('copy') } catch { /* 忽略 */ }
    document.body.removeChild(textarea)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}

// ========== 下载为 PNG ==========
async function downloadPng() {
  const svgText = props.node?.code || ''
  if (!svgText.trim()) return

  // 1. 将 SVG 字符串注入到一个临时容器，获取 SVG 元素
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:680px;background:white;'
  container.innerHTML = safeSvg.value
  document.body.appendChild(container)

  const svgEl = container.querySelector('svg')
  if (!svgEl) {
    document.body.removeChild(container)
    return
  }

  // 2. 获取 SVG 尺寸（优先用 viewBox，回退到 width/height 属性）
  const viewBox = svgEl.getAttribute('viewBox')
  let svgWidth = 680
  let svgHeight = 412
  if (viewBox) {
    const parts = viewBox.split(/\s+/)
    if (parts.length >= 4) {
      svgWidth = parseFloat(parts[2]) || 680
      svgHeight = parseFloat(parts[3]) || 412
    }
  }

  // 3. 序列化 SVG 为 data URL
  const svgData = new XMLSerializer().serializeToString(svgEl)
  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl = URL.createObjectURL(svgBlob)

  // 4. 用 Canvas 绘制并导出 PNG
  const scale = 2 // 2 倍像素密度，保证清晰
  const canvas = document.createElement('canvas')
  canvas.width = svgWidth * scale
  canvas.height = svgHeight * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    URL.revokeObjectURL(svgUrl)
    document.body.removeChild(container)
    return
  }
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(svgUrl)
    document.body.removeChild(container)

    canvas.toBlob((blob) => {
      if (!blob) return
      const pngUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = pngUrl
      a.download = `widget-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(pngUrl)
    }, 'image/png')
  }
  img.onerror = () => {
    URL.revokeObjectURL(svgUrl)
    document.body.removeChild(container)
  }
  img.src = svgUrl
}

// ========== 从 SVG <title> 提取标题 ==========
const widgetTitle = computed(() => {
  const raw = props.node?.code || ''
  const match = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match ? match[1].trim() : 'SVG 图表'
})
</script>

<template>
  <!-- 内联容器（非全屏模式） -->
  <div
    v-if="!isExpanded"
    class="diting-widget"
    :class="{ 'is-dark': isDark }"
  >
    <!-- ========== 顶部工具栏（高度 40px） ========== -->
    <div class="widget-header">
      <!-- 左侧：图标 + 标题 -->
      <div class="header-left">
        <svg class="widget-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M3 9h18" />
          <path d="M9 21V9" />
        </svg>
        <span class="widget-title" :title="widgetTitle">{{ widgetTitle }}</span>
      </div>

      <!-- 中间：预览 / 源码切换 -->
      <div v-if="!loading && hasSvg" class="header-center">
        <button
          class="tab-btn"
          :class="{ active: viewMode === 'preview' }"
          @click="viewMode = 'preview'"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="tab-icon">
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          预览
        </button>
        <button
          class="tab-btn"
          :class="{ active: viewMode === 'source' }"
          @click="viewMode = 'source'"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="tab-icon">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
          源码
        </button>
      </div>

      <!-- 右侧：操作按钮 -->
      <div v-if="!loading && hasSvg" class="header-right">
        <!-- 缩小 -->
        <button class="icon-btn" title="缩小" @click="zoomOut" :disabled="viewMode !== 'preview'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M8 11h6" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </button>
        <span class="zoom-label">{{ Math.round(zoomLevel * 100) }}%</span>
        <!-- 放大 -->
        <button class="icon-btn" title="放大" @click="zoomIn" :disabled="viewMode !== 'preview'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M11 8v6" />
            <path d="M8 11h6" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </button>
        <!-- 重置缩放 -->
        <button class="icon-btn" title="重置缩放" @click="zoomReset" :disabled="viewMode !== 'preview'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 2v6h6" />
            <path d="M21 12A9 9 0 0 0 6 5.3L3 8" />
            <path d="M21 22v-6h-6" />
            <path d="M3 12a9 9 0 0 0 15 6.7l3-2.7" />
          </svg>
        </button>
        <span class="divider" />
        <!-- 复制 -->
        <button class="icon-btn" :title="copied ? '已复制' : '复制 SVG 源码'" @click="copyContent">
          <svg v-if="!copied" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </button>
        <!-- 下载 PNG -->
        <button class="icon-btn" title="下载为 PNG" @click="downloadPng">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
        <!-- 全屏展开 -->
        <button class="icon-btn" title="全屏展开" @click="toggleExpand">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>
    </div>

    <!-- ========== 内容区域 ========== -->
    <!-- 加载态 -->
    <div v-if="loading" class="widget-content widget-loading">
      <span class="loading-dot" />
      <span class="loading-text">图表渲染中…</span>
    </div>

    <!-- 预览模式 -->
    <div v-else-if="hasSvg && viewMode === 'preview'" class="widget-content widget-preview">
      <div class="svg-wrapper" :style="{ transform: zoomLevel !== 1 ? `scale(${zoomLevel})` : 'none', transformOrigin: 'top center' }" v-html="safeSvg" />
    </div>

    <!-- 源码模式 -->
    <div v-else-if="hasSvg && viewMode === 'source'" class="widget-content widget-source">
      <pre class="source-code">{{ svgSource }}</pre>
    </div>

    <!-- 回退 -->
    <div v-else class="widget-content widget-fallback-wrap">
      <pre class="widget-fallback">{{ fallbackRaw }}</pre>
    </div>
  </div>

  <!-- 全屏模式：Teleport 到 body，绕过 markstream-vue 父容器的 transform 降级 -->
  <Teleport v-else to="body">
    <div class="diting-widget is-fullscreen" :class="{ 'is-dark': isDark }">
      <!-- 顶部工具栏 -->
      <div class="widget-header">
        <div class="header-left">
          <svg class="widget-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <path d="M3 9h18" />
            <path d="M9 21V9" />
          </svg>
          <span class="widget-title" :title="widgetTitle">{{ widgetTitle }}</span>
        </div>

        <div v-if="!loading && hasSvg" class="header-center">
          <button
            class="tab-btn"
            :class="{ active: viewMode === 'preview' }"
            @click="viewMode = 'preview'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="tab-icon">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            预览
          </button>
          <button
            class="tab-btn"
            :class="{ active: viewMode === 'source' }"
            @click="viewMode = 'source'"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="tab-icon">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            源码
          </button>
        </div>

        <div v-if="!loading && hasSvg" class="header-right">
          <button class="icon-btn" title="缩小" @click="zoomOut" :disabled="viewMode !== 'preview'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="M8 11h6" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
          <span class="zoom-label">{{ Math.round(zoomLevel * 100) }}%</span>
          <button class="icon-btn" title="放大" @click="zoomIn" :disabled="viewMode !== 'preview'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="M11 8v6" />
              <path d="M8 11h6" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </button>
          <button class="icon-btn" title="重置缩放" @click="zoomReset" :disabled="viewMode !== 'preview'">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 2v6h6" />
              <path d="M21 12A9 9 0 0 0 6 5.3L3 8" />
              <path d="M21 22v-6h-6" />
              <path d="M3 12a9 9 0 0 0 15 6.7l3-2.7" />
            </svg>
          </button>
          <span class="divider" />
          <button class="icon-btn" :title="copied ? '已复制' : '复制 SVG 源码'" @click="copyContent">
            <svg v-if="!copied" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </button>
          <button class="icon-btn" title="下载为 PNG" @click="downloadPng">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
          <!-- 收起全屏 -->
          <button class="icon-btn" title="收起全屏" @click="toggleExpand">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 14 10 14 10 20" />
              <polyline points="20 10 14 10 14 4" />
              <line x1="14" y1="10" x2="21" y2="3" />
              <line x1="3" y1="21" x2="10" y2="14" />
            </svg>
          </button>
        </div>
      </div>

      <!-- 全屏内容区域 -->
      <div v-if="loading" class="widget-content widget-loading">
        <span class="loading-dot" />
        <span class="loading-text">图表渲染中…</span>
      </div>
      <div v-else-if="hasSvg && viewMode === 'preview'" class="widget-content widget-preview is-fullscreen-content">
        <div class="svg-wrapper" :style="{ transform: zoomLevel !== 1 ? `scale(${zoomLevel})` : 'none', transformOrigin: 'top center' }" v-html="safeSvg" />
      </div>
      <div v-else-if="hasSvg && viewMode === 'source'" class="widget-content widget-source is-fullscreen-content">
        <pre class="source-code">{{ svgSource }}</pre>
      </div>
      <div v-else class="widget-content widget-fallback-wrap is-fullscreen-content">
        <pre class="widget-fallback">{{ fallbackRaw }}</pre>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ========== Widget 容器：CSS 变量映射层 ========== */
.diting-widget {
  width: 100%;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  margin: 8px 0;
  overflow: hidden;

  /* === 语义化变量 — 通过 shadcn HSL 变量自动跟随主题 === */
  --w-text-primary: hsl(var(--foreground));
  --w-text-secondary: hsl(var(--muted-foreground));
  --w-text-tertiary: hsl(var(--muted-foreground) / 0.7);
  --w-text-muted: hsl(var(--muted-foreground) / 0.5);
  --w-border-primary: hsl(var(--border));
  --w-border-secondary: hsl(var(--border) / 0.6);
  --w-border-tertiary: hsl(var(--border) / 0.3);
  --w-bg-primary: hsl(var(--card));
  --w-bg-secondary: hsl(var(--secondary));
  --w-bg-tertiary: hsl(var(--muted));
  --w-bg-hover: hsl(var(--accent));
  --w-accent: hsl(var(--primary));
  --w-accent-fg: hsl(var(--primary-foreground));
  --w-font-sans: var(--font-family);
  --w-font-mono: var(--font-mono);

  /* === WorkBuddy 兼容别名 === */
  --color-text-primary: var(--w-text-primary);
  --color-text-secondary: var(--w-text-secondary);
  --color-text-tertiary: var(--w-text-tertiary);
  --color-border-primary: var(--w-border-primary);
  --color-border-secondary: var(--w-border-secondary);
  --color-border-tertiary: var(--w-border-tertiary);
  --color-background-primary: var(--w-bg-primary);
  --color-background-secondary: var(--w-bg-secondary);
  --font-sans: var(--w-font-sans);
}

/*
 * 暗色模式：通过 :global(.dark) 选择器覆盖组件自身样式和 CSS 变量。
 * shadcn 的暗色变量定义在 .dark 下（globals.css），
 * theme.js 运行时在 html 上添加 .dark class。
 * 不依赖 isDark prop，确保暗色模式自动跟随。
 */
:global(.dark) .diting-widget {
  background: hsl(var(--card));
  border-color: hsl(var(--border));

  /* 暗色模式下的语义化变量 */
  --w-text-primary: hsl(var(--foreground));
  --w-text-secondary: hsl(var(--muted-foreground));
  --w-text-tertiary: hsl(var(--muted-foreground) / 0.7);
  --w-text-muted: hsl(var(--muted-foreground) / 0.5);
  --w-border-primary: hsl(var(--border));
  --w-border-secondary: hsl(var(--border) / 0.6);
  --w-border-tertiary: hsl(var(--border) / 0.3);
  --w-bg-primary: hsl(var(--card));
  --w-bg-secondary: hsl(var(--secondary));
  --w-bg-tertiary: hsl(var(--muted));
  --w-bg-hover: hsl(var(--accent));
  --w-accent: hsl(var(--primary));
  --w-accent-fg: hsl(var(--primary-foreground));
}

/* 暗色模式：顶部工具栏 */
:global(.dark) .widget-header {
  background: hsl(var(--secondary) / 0.3);
  border-bottom-color: hsl(var(--border));
}

/* 暗色模式：源码模式背景 */
:global(.dark) .widget-source {
  background: hsl(var(--muted) / 0.2);
}

/* 暗色模式：全屏容器投影更柔和 */
:global(.dark) .diting-widget.is-fullscreen {
  box-shadow: 0 25px 50px -12px hsl(0 0% 0% / 0.8);
}

/* ========== 全屏模式（Teleport 到 body） ========== */
/* 使用 width/height 替代 right/bottom，避免 width:100% 覆盖 right 的问题 */
.diting-widget.is-fullscreen {
  position: fixed;
  top: 40px;
  left: 40px;
  width: calc(100vw - 80px);
  height: calc(100vh - 80px);
  z-index: 99999;
  border-radius: 12px;
  border: 1px solid hsl(var(--border));
  margin: 0;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px hsl(0 0% 0% / 0.5);
}

/* ========== 顶部工具栏（固定 40px） ========== */
.widget-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  min-height: 40px;
  flex-shrink: 0;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid hsl(var(--border));
  background: hsl(var(--secondary) / 0.5);
  gap: 8px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.widget-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: hsl(var(--primary));
}

.widget-title {
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--foreground));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-center {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  background: hsl(var(--muted) / 0.5);
  border-radius: 6px;
  padding: 2px;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab-btn:hover {
  color: hsl(var(--foreground));
  background: hsl(var(--accent) / 0.1);
}

.tab-btn.active {
  color: hsl(var(--primary));
  background: hsl(var(--card));
  box-shadow: 0 1px 2px hsl(0 0% 0% / 0.08);
}

.tab-icon {
  width: 12px;
  height: 12px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  background: transparent;
  border-radius: 5px;
  cursor: pointer;
  color: hsl(var(--muted-foreground));
  transition: all 0.15s ease;
}

.icon-btn:hover:not(:disabled) {
  color: hsl(var(--foreground));
  background: hsl(var(--accent) / 0.1);
}

.icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.icon-btn svg {
  width: 14px;
  height: 14px;
}

.zoom-label {
  font-size: 10px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  min-width: 32px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.divider {
  width: 1px;
  height: 16px;
  background: hsl(var(--border));
  margin: 0 2px;
}

/* ========== 内容区域 ========== */
.widget-content {
  position: relative;
  max-height: 450px;
  overflow: auto;
  flex: 1;
}

/* 全屏内容区域：100vh - 上下 padding(40px*2) - 头部(40px) */
.is-fullscreen-content {
  max-height: none !important;
  height: calc(100vh - 120px);
}

/* ========== 加载态 ========== */
.widget-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 120px;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}

.loading-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: hsl(var(--primary));
  animation: widget-pulse 1s ease-in-out infinite;
}

@keyframes widget-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.1); }
}

/* ========== 预览模式 ========== */
.widget-preview {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 12px;
  /* 关键修复：让容器只占据 SVG 实际需要的高度，消除多余空白 */
  height: fit-content;
}

.svg-wrapper {
  display: flex;
  justify-content: center;
  width: 100%;
  transition: transform 0.2s ease;
  /* 关键修复：让 wrapper 紧贴 SVG 内容高度 */
  height: fit-content;
}

/* 内联 SVG 自适应 */
.svg-wrapper :deep(svg) {
  max-width: 100%;
  height: auto;
  display: block;
}

/* ========== 源码模式 ========== */
.widget-source {
  padding: 0;
  background: hsl(var(--muted) / 0.3);
  height: auto;
}

.source-code {
  margin: 0;
  padding: 12px;
  font-size: 11px;
  font-family: var(--font-mono);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  color: hsl(var(--foreground));
}

/* ========== 回退展示 ========== */
.widget-fallback-wrap {
  padding: 0;
  height: auto;
}

.widget-fallback {
  margin: 0;
  padding: 12px;
  font-size: 11px;
  font-family: var(--font-mono);
  white-space: pre-wrap;
  word-break: break-all;
  color: hsl(var(--muted-foreground));
  background: transparent;
}

/* ========== 全屏锁定 body 滚动 ========== */
:global(.widget-fullscreen-lock) {
  overflow: hidden !important;
}
</style>
