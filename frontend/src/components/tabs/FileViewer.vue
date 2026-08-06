<template>
  <div class="file-viewer">
    <!-- 顶部工具栏 -->
    <div class="file-viewer__toolbar">
      <span class="file-viewer__title">{{ fileName }}</span>
      <div class="file-viewer__meta">
        <span v-if="fileSize" class="file-viewer__size">{{ formatSize(fileSize) }}</span>
        <span v-if="fileExt" class="file-viewer__ext">{{ fileExt.toUpperCase() }}</span>
      </div>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="file-viewer__loading">
      <a-spin size="large" />
      <p>正在加载文件...</p>
    </div>

    <!-- 加载失败 -->
    <div v-else-if="error" class="file-viewer__error">
      <FileExclamationOutlined style="font-size: 48px; opacity: 0.3" />
      <p>{{ error }}</p>
    </div>

    <!-- 文件内容 -->
    <div v-else class="file-viewer__body">
      <!-- 图片预览 -->
      <div v-if="fileType === 'image'" class="file-viewer__image">
        <img :src="imageSrc" :alt="fileName" />
      </div>

      <!-- PDF 预览 -->
      <div v-else-if="fileType === 'pdf'" class="file-viewer__pdf">
        <iframe :src="pdfSrc" :title="fileName" frameborder="0" />
      </div>

      <!-- SVG 预览 -->
      <div v-else-if="fileType === 'svg'" class="file-viewer__image">
        <img :src="svgSrc" :alt="fileName" />
      </div>

      <!-- Markdown 预览 -->
      <div v-else-if="fileType === 'markdown'" class="file-viewer__markdown">
        <MarkdownRender mode="chat" :content="textContent" :final="true" :fade="false" />
      </div>

      <!-- 代码/文本 -->
      <div v-else class="file-viewer__code">
        <div class="file-viewer__code-header">
          <span>{{ fileExt || 'txt' }} · {{ lineCount }} 行</span>
        </div>
        <pre><code>{{ textContent }}</code></pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { FileExclamationOutlined } from '@ant-design/icons-vue'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'
import MarkdownRender from 'markstream-vue'

const props = defineProps({
  filePath: { type: String, required: true },
  workspaceId: { type: String, default: null },
  sessionId: { type: String, default: null },
  mode: { type: String, default: 'project' },
  attachedDirPath: { type: String, default: null },
})

const loading = ref(true)
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

/** 加载文件内容 */
async function loadFile() {
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

// 文件路径变化时重新加载
watch(() => [props.filePath, props.workspaceId, props.sessionId, props.mode, props.attachedDirPath], () => {
  loadFile()
})

onMounted(() => {
  loadFile()
})
</script>

<style lang="less" scoped>
.file-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background: var(--bg-panel);

  // ===== 工具栏 =====
  &__toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 20px;
    height: 44px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-color);
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  &__size {
    font-size: 12px;
    color: var(--text-muted);
  }

  &__ext {
    font-size: 11px;
    font-weight: 600;
    color: var(--accent);
    background: rgba(22, 119, 255, 0.08);
    padding: 2px 8px;
    border-radius: 4px;
  }

  // ===== 加载/错误 =====
  &__loading,
  &__error {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;

    p {
      font-size: 14px;
      color: var(--text-muted);
      margin: 0;
    }
  }

  // ===== 文件内容区 =====
  &__body {
    flex: 1;
    overflow: auto;
    min-height: 0;
  }

  // ===== 图片 =====
  &__image {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    height: 100%;

    img {
      max-width: 100%;
      max-height: 100%;
      border-radius: 8px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
      object-fit: contain;
    }
  }

  // ===== PDF =====
  &__pdf {
    height: 100%;

    iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
  }

  // ===== Markdown =====
  &__markdown {
    padding: 24px 32px;
    max-width: 860px;
    margin: 0 auto;
    font-size: 14px;
    line-height: 1.7;
    color: var(--text-primary);
  }

  // ===== 代码/文本 =====
  &__code {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  &__code-header {
    padding: 8px 20px;
    font-size: 12px;
    color: var(--text-muted);
    background: var(--bg-sidebar);
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
  }

  pre {
    flex: 1;
    overflow: auto;
    margin: 0;
    padding: 16px 20px;
    font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-primary);
    background: var(--bg-panel);

    code {
      font-family: inherit;
    }
  }
}
</style>
