<template>
  <div class="flex flex-col h-full w-full overflow-hidden bg-card">
    <!-- 顶部工具栏 -->
    <div class="flex items-center justify-between gap-3 px-5 h-11 flex-shrink-0 border-b border-border">
      <span class="text-sm font-semibold text-foreground truncate">{{ fileName }}</span>
      <div class="flex items-center gap-2 flex-shrink-0">
        <span v-if="fileSize" class="text-xs text-muted-foreground">{{ formatSize(fileSize) }}</span>
        <span v-if="fileExt" class="text-[11px] font-semibold text-primary bg-primary/8 px-2 py-0.5 rounded">{{ fileExt.toUpperCase() }}</span>
      </div>
    </div>

    <!-- fileItemId 模式：全功能查看器 -->
    <template v-if="fileItemId">
      <div class="flex-1 overflow-hidden min-h-0">
        <FullFileViewer :file-item-id="fileItemId" :theme="isDark ? 'dark' : 'light'" @loaded="onFullLoaded" @error="onFullError" />
      </div>
    </template>

    <!-- filePath 模式：内置轻量查看器 -->
    <template v-else>
      <!-- 加载中 -->
      <div v-if="loading" class="flex-1 flex flex-col items-center justify-center gap-4">
        <Spinner size="large" />
        <p class="text-sm text-muted-foreground m-0">{{ t('fileViewerTab.loading') }}</p>
      </div>

      <!-- 加载失败 -->
      <div v-else-if="error" class="flex-1 flex flex-col items-center justify-center gap-4">
        <FileWarning class="size-12 opacity-30" />
        <p class="text-sm text-muted-foreground m-0">{{ error }}</p>
      </div>

      <!-- 文件内容 -->
      <div v-else class="flex-1 overflow-auto min-h-0">
        <!-- 图片预览 -->
        <div v-if="fileType === 'image'" class="flex items-center justify-center p-6 h-full">
          <img :src="imageSrc" :alt="fileName" class="max-w-full max-h-full rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.12)] object-contain" />
        </div>

        <!-- PDF 预览 -->
        <div v-else-if="fileType === 'pdf'" class="h-full">
          <iframe :src="pdfSrc" :title="fileName" frameborder="0" class="w-full h-full border-none" />
        </div>

        <!-- SVG 预览 -->
        <div v-else-if="fileType === 'svg'" class="flex items-center justify-center p-6 h-full">
          <img :src="svgSrc" :alt="fileName" class="max-w-full max-h-full rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.12)] object-contain" />
        </div>

        <!-- Markdown 预览 -->
        <div v-else-if="fileType === 'markdown'" class="p-6 px-8 max-w-[860px] mx-auto text-sm leading-7 text-foreground">
          <MarkdownRender mode="chat" :content="textContent" :final="true" :fade="false" :render-code-blocks-as-pre="false" :is-dark="isDark" code-block-dark-theme="vitesse-dark" code-block-light-theme="vitesse-light" :themes="['vitesse-dark', 'vitesse-light']" />
        </div>

        <!-- 代码/文本 -->
        <div v-else class="h-full flex flex-col">
          <div class="px-5 py-2 text-xs text-muted-foreground bg-muted border-b border-border flex-shrink-0">
            {{ fileExt || 'txt' }} · {{ t('fileViewerTab.lines', { count: lineCount }) }}
          </div>
          <pre class="flex-1 overflow-auto m-0 p-4 px-5 font-mono text-[13px] leading-relaxed text-foreground bg-card"><code class="font-inherit">{{ textContent }}</code></pre>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { Spinner } from '@/components/ui/spinner'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

import { ref, computed, watch, onMounted } from 'vue'
import { FileWarning } from '@lucide/vue'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'
import MarkdownRender from 'markstream-vue'
import { isDark } from '@/theme'
import FullFileViewer from '@/components/file/FileViewer.vue'

const props = defineProps({
  filePath: { type: String, default: '' },
  workspaceId: { type: String, default: null },
  sessionId: { type: String, default: null },
  mode: { type: String, default: 'project' },
  attachedDirPath: { type: String, default: null },
  /** RAG 文件项 ID（优先于 filePath，使用全功能查看器） */
  fileItemId: { type: [Number, String], default: null },
})

const loading = ref(!props.fileItemId)
const error = ref('')
const textContent = ref('')
const imageSrc = ref('')
const svgSrc = ref('')
const pdfSrc = ref('')
const fileName = ref('')
const fileSize = ref(0)
const fileExt = ref('')

/** 文件类型分类 */
const fileType = computed(() => {
  const ext = fileExt.value
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp'].includes(ext)) return 'image'
  if (ext === 'svg') return 'svg'
  if (ext === 'pdf') return 'pdf'
  if (['md', 'markdown'].includes(ext)) return 'markdown'
  return 'text'
})

/** 行数统计 */
const lineCount = computed(() => {
  if (!textContent.value) return 0
  return textContent.value.split('\n').length
})

/** fileItemId 模式：全功能查看器加载完成回调 */
function onFullLoaded(info) {
  fileName.value = info?.name || ''
  fileSize.value = info?.size || 0
  if (info?.name) {
    fileExt.value = info.name.split('.').pop()?.toLowerCase() || ''
  }
}

/** fileItemId 模式：全功能查看器加载失败回调 */
function onFullError(errMsg) {
  error.value = errMsg || '加载文件失败'
}

/** 加载文件内容（filePath 模式） */
async function loadFile() {
  // fileItemId 模式不走此路径
  if (props.fileItemId) return

  loading.value = true
  error.value = ''
  textContent.value = ''
  imageSrc.value = ''
  svgSrc.value = ''
  pdfSrc.value = ''

  try {
    const res = await ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
      action: 'read',
      filePath: props.filePath,
      workspaceId: props.workspaceId,
      sessionId: props.sessionId,
      mode: props.mode,
      folderPath: props.attachedDirPath,
    })

    if (res.code !== 0 || !res.data) {
      error.value = res.message || '读取文件失败'
      return
    }

    const data = res.data
    fileName.value = data.name
    fileSize.value = data.size
    fileExt.value = data.ext

    if (data.isBinary) {
      // 二进制文件：base64 → data URL
      const dataUrl = `data:${data.mimeType};base64,${data.base64}`
      if (fileType.value === 'image') {
        imageSrc.value = dataUrl
      } else if (fileType.value === 'svg') {
        svgSrc.value = dataUrl
      } else if (fileType.value === 'pdf') {
        pdfSrc.value = dataUrl
      }
    } else {
      // 文本文件
      textContent.value = data.content || ''
    }
  } catch (err) {
    console.error('[FileViewer] 加载文件失败:', err)
    error.value = err?.message || '加载文件失败'
  } finally {
    loading.value = false
  }
}

/** 格式化文件大小 */
function formatSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// filePath 模式：文件路径变化时重新加载
watch(() => [props.filePath, props.workspaceId, props.sessionId, props.mode, props.attachedDirPath], () => {
  if (!props.fileItemId) {
    loadFile()
  }
})

onMounted(() => {
  if (!props.fileItemId) {
    loadFile()
  }
})
</script>
