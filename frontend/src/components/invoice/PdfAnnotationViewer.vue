<template>
  <div class="flex flex-col overflow-hidden bg-muted/30 h-full w-full">
    <!-- 工具栏 -->
    <div class="flex items-center px-3 py-1.5 bg-card border-b border-border flex-shrink-0">
      <span class="text-xs text-muted-foreground flex-1">
        {{ totalOcrBoxes }} 个识别区域
        <span v-if="totalPages > 1" class="ml-1">· {{ totalPages }} 页</span>
      </span>
      <div class="flex items-center gap-1">
        <button class="inline-flex size-7 items-center justify-center border-none rounded-md bg-transparent cursor-pointer text-sm text-muted-foreground transition-all hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed" @click="zoomOut" :disabled="zoom <= 0.5">－</button>
        <span class="text-xs min-w-[40px] text-center">{{ Math.round(zoom * 100) }}%</span>
        <button class="inline-flex size-7 items-center justify-center border-none rounded-md bg-transparent cursor-pointer text-sm text-muted-foreground transition-all hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed" @click="zoomIn" :disabled="zoom >= 3">＋</button>
        <button class="inline-flex size-7 items-center justify-center border-none rounded-md bg-transparent cursor-pointer text-sm text-muted-foreground transition-all hover:bg-muted" title="重置缩放" @click="resetZoom">⊙</button>
      </div>
    </div>

    <!-- PDF 渲染区域 -->
    <div class="flex-1 overflow-auto flex flex-col items-center gap-3 p-4 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-sm" ref="containerRef" @wheel="onWheel">
      <!-- 加载遮罩 -->
      <div v-if="loading" class="flex items-center justify-center h-[200px] text-muted-foreground">
        <Spinner tip="加载 PDF..." />
      </div>

      <!-- 错误提示 -->
      <div v-else-if="error" class="flex items-center justify-center h-[200px] text-muted-foreground">
        <p>{{ error }}</p>
      </div>

      <!-- 所有页面连续渲染 -->
      <template v-else>
        <div
          v-for="page in pages"
          :key="page.idx"
          class="relative inline-block transition-transform duration-150 flex-shrink-0"
          :style="{ transform: `scale(${zoom})`, transformOrigin: 'top center' }"
        >
          <canvas :ref="el => { if (el) pageCanvasEls[page.idx] = el }" class="block rounded shadow-[0_2px_12px_rgba(0,0,0,0.1)]"></canvas>
          <!-- OCR 标注叠加层 -->
          <div
            v-for="(box, bIdx) in getOcrBoxes(page.idx)"
            :key="bIdx"
            class="group/ocr absolute border border-primary/60 bg-primary/10 rounded-sm cursor-pointer transition-all hover:bg-primary/20 hover:shadow-[0_0_0_2px_hsl(var(--primary)/0.3)] hover:z-10"
            :style="getBoxStyle(box, page.idx)"
          >
            <span class="absolute -top-4 -left-px bg-primary text-primary-foreground text-[9px] px-1 py-0.5 rounded-t-sm whitespace-nowrap font-medium max-w-[200px] overflow-hidden text-ellipsis hidden group-hover/ocr:block">{{ box.text }}</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { Spinner } from '@/components/ui/spinner'

import { ref, reactive, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'

const props = defineProps({
  /** PDF URL（Blob URL 或 http URL） */
  src: { type: String, default: '' },
  ocrData: { type: Object, default: null },
})

const emit = defineEmits(['loaded', 'error'])

// 状态
const loading = ref(false)
const error = ref('')
const zoom = ref(1)
const totalPages = ref(0)
const containerRef = ref(null)

// 每页的渲染状态
const pages = ref([]) // [{ idx: 0 }, { idx: 1 }, ...]
const pageCanvasEls = reactive({}) // { 0: canvasEl, 1: canvasEl, ... }
const pageInfos = reactive({}) // { 0: { width, height }, ... } PDF 点数

let pdfDoc = null
let loadingTask = null
let pdfjsLib = null

// 总 OCR 标注数
const totalOcrBoxes = computed(() => {
  if (!props.ocrData?.pages) return 0
  return props.ocrData.pages.reduce((sum, p) => sum + (p?.boxes?.length || 0), 0)
})

// 获取指定页的 OCR 标注
function getOcrBoxes(pageIdx) {
  if (!props.ocrData?.pages) return []
  return props.ocrData.pages[pageIdx]?.boxes || []
}

// 懒加载 pdf.js（使用 legacy build，兼容当前 V8 版本）
async function ensurePdfjs() {
  if (pdfjsLib) return pdfjsLib
  // legacy build 自带 Map.getOrInsertComputed 等 Stage 3 提案的 polyfill
  pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // 配置 worker（同样使用 legacy build）
  const workerMod = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default
  return pdfjsLib
}

// 销毁当前 PDF 文档，释放资源
function destroyCurrentPdf() {
  if (loadingTask) {
    try {
      loadingTask.destroy()
    } catch (e) {
      console.warn('[PdfAnnotationViewer] destroy loadingTask 失败:', e)
    }
    loadingTask = null
  }
  pdfDoc = null
  // 清理页面状态
  pages.value = []
  Object.keys(pageCanvasEls).forEach(k => delete pageCanvasEls[k])
  Object.keys(pageInfos).forEach(k => delete pageInfos[k])
}

// 加载 PDF
async function loadPdf() {
  if (!props.src) return

  // 先销毁旧的 PDF 文档
  destroyCurrentPdf()

  loading.value = true
  error.value = ''

  try {
    const lib = await ensurePdfjs()

    // 直接用 URL 加载（Blob URL 或 http URL）
    loadingTask = lib.getDocument({ url: props.src })
    pdfDoc = await loadingTask.promise
    const num = pdfDoc.numPages
    totalPages.value = num

    // 初始化页面占位
    pages.value = Array.from({ length: num }, (_, i) => ({ idx: i }))

    // 关闭 loading，让 v-else 分支渲染出 canvas 元素到 DOM
    loading.value = false
    // 等待 DOM 将所有 canvas 创建出来
    await nextTick()

    // 逐页渲染
    for (let i = 0; i < num; i++) {
      await renderPage(i)
    }

    emit('loaded', { numPages: num })
  } catch (err) {
    console.error('[PdfAnnotationViewer] 加载 PDF 失败:', err)
    error.value = err?.message || '加载 PDF 失败'
    emit('error', error.value)
  } finally {
    loading.value = false
  }
}

// 渲染单页到对应 canvas
async function renderPage(pageIdx) {
  if (!pdfDoc) return

  try {
    const page = await pdfDoc.getPage(pageIdx + 1) // pdf.js 页码从 1 开始
    const viewport = page.getViewport({ scale: 1.5 })

    const canvasEl = pageCanvasEls[pageIdx]
    if (!canvasEl) {
      console.warn(`[PdfAnnotationViewer] canvas for page ${pageIdx} not found`)
      return
    }

    const ctx = canvasEl.getContext('2d')
    canvasEl.width = viewport.width
    canvasEl.height = viewport.height
    canvasEl.style.width = viewport.width + 'px'
    canvasEl.style.height = viewport.height + 'px'

    await page.render({ canvasContext: ctx, viewport }).promise

    // 记录页面尺寸（PDF 点数，scale=1）
    const baseViewport = page.getViewport({ scale: 1 })
    pageInfos[pageIdx] = {
      width: baseViewport.width,
      height: baseViewport.height,
    }

    page.cleanup()
  } catch (err) {
    console.error(`[PdfAnnotationViewer] 渲染第 ${pageIdx + 1} 页失败:`, err)
    error.value = `渲染第 ${pageIdx + 1} 页失败: ` + (err?.message || '')
  }
}

// OCR 标注样式计算
function getBoxStyle(box, pageIdx) {
  const info = pageInfos[pageIdx]
  if (!info) return {}

  const { width: pageW, height: pageH } = info

  // mupdf 的 toStructuredText().asJSON() 已将坐标从 PDF 坐标系（左下角原点，Y 向上）
  // 转换为屏幕坐标系（左上角原点，Y 向下），与 canvas/HTML 坐标系一致，无需 Y 翻转。
  // 扫描 PDF 的 OCR 坐标同样为左上角原点（PaddleOCR 输出），也不需要翻转。
  const x = box.box.x
  const y = box.box.y
  const w = box.box.width
  const h = box.box.height

  return {
    left: `${(x / pageW) * 100}%`,
    top: `${(y / pageH) * 100}%`,
    width: `${(w / pageW) * 100}%`,
    height: `${(h / pageH) * 100}%`,
  }
}

// 缩放控制
function zoomIn() { zoom.value = Math.min(3, zoom.value + 0.2) }
function zoomOut() { zoom.value = Math.max(0.5, zoom.value - 0.2) }
function resetZoom() { zoom.value = 1 }
function onWheel(e) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    if (e.deltaY < 0) zoomIn()
    else zoomOut()
  }
}

// 监听 src 变化
watch(() => props.src, (newVal) => {
  if (newVal) loadPdf()
})

onMounted(() => {
  if (props.src) loadPdf()
})

onUnmounted(() => {
  destroyCurrentPdf()
})
</script>
