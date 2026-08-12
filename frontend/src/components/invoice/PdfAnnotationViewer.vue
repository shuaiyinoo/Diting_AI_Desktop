<template>
  <div class="pdf-viewer">
    <!-- 工具栏 -->
    <div class="pdf-viewer__toolbar">
      <span class="pdf-viewer__info">
        {{ totalOcrBoxes }} 个识别区域
        <span v-if="totalPages > 1" class="pdf-viewer__pages">· {{ totalPages }} 页</span>
      </span>
      <div class="pdf-viewer__zoom">
        <button class="zoom-btn" @click="zoomOut" :disabled="zoom <= 0.5">－</button>
        <span class="zoom-level">{{ Math.round(zoom * 100) }}%</span>
        <button class="zoom-btn" @click="zoomIn" :disabled="zoom >= 3">＋</button>
        <button class="zoom-btn" @click="resetZoom" title="重置缩放">⊙</button>
      </div>
    </div>

    <!-- PDF 渲染区域：所有页面连续垂直排列 -->
    <div class="pdf-viewer__container" ref="containerRef" @wheel="onWheel">
      <!-- 加载遮罩 -->
      <div v-if="loading" class="pdf-loading">
        <a-spin tip="加载 PDF..." />
      </div>

      <!-- 错误提示 -->
      <div v-else-if="error" class="pdf-error">
        <p>{{ error }}</p>
      </div>

      <!-- 所有页面连续渲染（v-show 保证 canvas 始终在 DOM 中） -->
      <template v-else>
        <div
          v-for="page in pages"
          :key="page.idx"
          class="pdf-page-wrapper"
          :style="{ transform: `scale(${zoom})`, transformOrigin: 'top center' }"
        >
          <canvas :ref="el => { if (el) pageCanvasEls[page.idx] = el }" class="pdf-canvas"></canvas>
          <!-- OCR 标注叠加层 -->
          <div
            v-for="(box, bIdx) in getOcrBoxes(page.idx)"
            :key="bIdx"
            class="ocr-box"
            :style="getBoxStyle(box, page.idx)"
          >
            <span class="ocr-box__label">{{ box.text }}</span>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
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

<style lang="less" scoped>
.pdf-viewer {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fafaf8;
  height: 100%;
  width: 100%;

  &__toolbar {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    background: var(--bg-panel, #fff);
    border-bottom: 1px solid var(--border-color, #e8e8e8);
    flex-shrink: 0;
  }

  &__info {
    font-size: 12px;
    color: var(--text-muted, #999);
    flex: 1;
  }

  &__pages {
    margin-left: 4px;
  }

  &__zoom {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  &__container {
    flex: 1;
    overflow: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 16px;

    &::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    &::-webkit-scrollbar-thumb {
      background: var(--border-color, #ccc);
      border-radius: 3px;
    }
  }
}

.zoom-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-secondary, #666);
  transition: all 0.15s ease;

  &:hover {
    background: var(--bg-hover, #f5f5f5);
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

.zoom-level {
  font-size: 12px;
  min-width: 40px;
  text-align: center;
}

.pdf-loading,
.pdf-error {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--text-muted, #999);
}

.pdf-page-wrapper {
  position: relative;
  display: inline-block;
  transition: transform 0.15s ease;
  flex-shrink: 0;
}

.pdf-canvas {
  display: block;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.ocr-box {
  position: absolute;
  border: 1.5px solid #1890ff;
  background: rgba(24, 144, 255, 0.08);
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(24, 144, 255, 0.2);
    box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.3);
    z-index: 10;
  }

  &__label {
    position: absolute;
    top: -16px;
    left: -1px;
    background: #1890ff;
    color: #fff;
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 2px 2px 0 0;
    white-space: nowrap;
    font-weight: 500;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    display: none;
  }

  &:hover &__label {
    display: block;
  }
}
</style>
