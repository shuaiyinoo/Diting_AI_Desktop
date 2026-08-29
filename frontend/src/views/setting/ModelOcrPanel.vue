<template>
  <div class="mx-auto flex h-full w-full max-w-[640px] flex-col">
    <!-- 顶部标题栏 -->
    <div class="mb-4 flex items-start justify-between px-1">
      <div class="flex-1">
        <h3 class="flex items-center gap-2 text-base font-semibold text-foreground">
          <ScanText class="size-5 text-primary" />
          {{ t('settings.tabs.modelOcr') }}
        </h3>
        <p class="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {{ t('modelOcr.subtitle') }}
        </p>
      </div>
    </div>

    <!-- ========== 本地 OCR 模型区域 ========== -->
    <div class="rounded-lg border border-border bg-card p-3.5">
      <!-- 模型路径 -->
      <div class="mb-3 flex items-center justify-between">
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <FolderOpen class="size-3.5 shrink-0" />
          <span>{{ t('modelOcr.modelPath') }}: ~/.diting/model/ocr</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          class="h-7 gap-1 px-2 text-xs"
          @click="handleOpenModelDir"
        >
          <Folder class="size-3.5" />
          {{ t('modelOcr.openFolder') }}
        </Button>
      </div>

      <!-- 加载模型列表中 -->
      <div v-if="localLoading" class="flex items-center justify-center py-8">
        <Spinner class="size-5 text-muted-foreground" />
        <span class="ml-2 text-sm text-muted-foreground">{{ t('modelOcr.loadingModels') }}</span>
      </div>

      <div v-else>
        <!-- 下载源选择 -->
        <div class="mb-3 flex items-center justify-between">
          <span class="text-sm font-medium">{{ t('modelOcr.downloadSource') }}</span>
          <div class="flex items-center rounded-lg border border-border bg-muted/30 p-1">
            <button
              class="rounded-md px-3.5 py-1 text-xs font-medium transition-colors"
              :class="downloadSource === 'auto' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              @click="downloadSource = 'auto'"
            >
              {{ t('modelOcr.sourceAuto') }}
            </button>
            <button
              class="rounded-md px-3.5 py-1 text-xs font-medium transition-colors"
              :class="downloadSource === 'mirror' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              @click="downloadSource = 'mirror'"
            >
              {{ t('modelOcr.sourceMirror') }}
            </button>
            <button
              class="rounded-md px-3.5 py-1 text-xs font-medium transition-colors"
              :class="downloadSource === 'official' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              @click="downloadSource = 'official'"
            >
              {{ t('modelOcr.sourceOfficial') }}
            </button>
          </div>
        </div>

        <!-- 下载模型 -->
        <div class="mb-3">
          <label class="mb-1.5 block text-sm font-medium">{{ t('modelOcr.downloadModel') }}</label>
          <!-- 下拉列表 + 下载按钮同一行 -->
          <div class="flex items-start gap-2">
            <Select v-model="downloadSelected" class="flex-1">
              <SelectTrigger class="w-full">
                <div v-if="downloadSelected" class="flex items-center gap-2">
                  <CheckCircle2 v-if="isModelDownloaded(downloadSelected)" class="size-3 text-green-500" />
                  <span>{{ getDownloadLabel(downloadSelected) }}</span>
                  <span class="text-xs text-muted-foreground">{{ getDownloadSize(downloadSelected) }}</span>
                </div>
                <span v-else class="text-muted-foreground">{{ t('modelOcr.selectToDownload') }}</span>
              </SelectTrigger>
              <SelectContent>
                <!-- V6 系列 -->
                <div v-if="v6Models.length > 0" class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  PP-OCRv6
                </div>
                <SelectItem
                  v-for="model in v6Models"
                  :key="model.def.id"
                  :value="model.def.id"
                >
                  <div class="flex items-center gap-2">
                    <CheckCircle2 v-if="model.ready" class="size-3 text-green-500" />
                    <span>{{ model.def.label }}</span>
                    <span class="text-xs text-muted-foreground">{{ model.def.sizeLabel }}</span>
                  </div>
                </SelectItem>
                <!-- V5 系列 -->
                <div v-if="v5Models.length > 0" class="mt-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  PP-OCRv5
                </div>
                <SelectItem
                  v-for="model in v5Models"
                  :key="model.def.id"
                  :value="model.def.id"
                >
                  <div class="flex items-center gap-2">
                    <CheckCircle2 v-if="model.ready" class="size-3 text-green-500" />
                    <span>{{ model.def.label }}</span>
                    <span class="text-xs text-muted-foreground">{{ model.def.sizeLabel }}</span>
                  </div>
                </SelectItem>
                <!-- V4 系列 -->
                <div v-if="v4Models.length > 0" class="mt-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  PP-OCRv4
                </div>
                <SelectItem
                  v-for="model in v4Models"
                  :key="model.def.id"
                  :value="model.def.id"
                >
                  <div class="flex items-center gap-2">
                    <CheckCircle2 v-if="model.ready" class="size-3 text-green-500" />
                    <span>{{ model.def.label }}</span>
                    <span class="text-xs text-muted-foreground">{{ model.def.sizeLabel }}</span>
                  </div>
                </SelectItem>
                <!-- V3 系列 -->
                <div v-if="v3Models.length > 0" class="mt-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  PP-OCRv3
                </div>
                <SelectItem
                  v-for="model in v3Models"
                  :key="model.def.id"
                  :value="model.def.id"
                >
                  <div class="flex items-center gap-2">
                    <CheckCircle2 v-if="model.ready" class="size-3 text-green-500" />
                    <span>{{ model.def.label }}</span>
                    <span class="text-xs text-muted-foreground">{{ model.def.sizeLabel }}</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            <!-- 操作按钮 -->
            <div class="flex shrink-0 items-center gap-2">
              <!-- 下载中：取消按钮 -->
              <Button
                v-if="downloadSelected && isDownloading(downloadSelected)"
                variant="outline"
                size="sm"
                class="h-9 gap-1.5 px-3.5 text-[13px]"
                @click="handleCancelDownload"
              >
                {{ t('modelOcr.cancelDownload') }}
              </Button>
              <!-- 未下载：下载按钮 -->
              <Button
                v-else-if="downloadSelected && !isModelDownloaded(downloadSelected)"
                size="sm"
                class="h-9 gap-1.5 px-3.5 text-[13px]"
                @click="handleDownload"
              >
                <Download class="size-4" />
                {{ t('modelOcr.download') }}
              </Button>
              <!-- 已下载：删除按钮 -->
              <Button
                v-else-if="downloadSelected && isModelDownloaded(downloadSelected)"
                variant="ghost"
                size="sm"
                class="h-9 gap-1.5 px-3.5 text-[13px] text-destructive hover:text-destructive"
                @click="handleDeleteModel"
              >
                <Trash2 class="size-4" />
                {{ t('common.delete') }}
              </Button>
            </div>
          </div>

          <!-- 下载进度条 -->
          <div v-if="downloadProgress" class="mt-2">
            <div class="flex items-center justify-between text-xs text-muted-foreground">
              <span>{{ downloadProgress.filename || downloadProgress.modelId }}</span>
              <span v-if="downloadProgress.done && downloadProgress.error" class="text-destructive">{{ downloadProgress.error }}</span>
              <span v-else-if="downloadProgress.done" class="text-green-500">{{ t('modelOcr.downloaded') }}</span>
              <span v-else>{{ downloadProgress.percent.toFixed(1) }}% ({{ formatBytes(downloadProgress.downloaded) }} / {{ formatBytes(downloadProgress.total) }})</span>
            </div>
            <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                class="h-full rounded-full transition-all"
                :class="downloadProgress.done && downloadProgress.error ? 'bg-destructive' : downloadProgress.done ? 'bg-green-500' : 'bg-primary'"
                :style="{ width: `${downloadProgress.percent}%` }"
              />
            </div>
          </div>

          <!-- 模型说明 -->
          <p class="mt-2 text-xs text-muted-foreground">
            {{ downloadSelected ? getDownloadDescription(downloadSelected) : t('modelOcr.selectToDownload') }}
          </p>
        </div>

        <!-- 当前已选模型 -->
        <div class="border-t border-border pt-3">
          <label class="mb-1.5 block text-sm font-medium">{{ t('modelOcr.selectModel') }}</label>
          <Select :model-value="selectedModel ?? undefined" @update:model-value="handleSelectModel">
            <SelectTrigger class="w-full">
              <div v-if="selectedModel" class="flex items-center gap-2">
                <span>{{ getSelectLabel(selectedModel) }}</span>
                <span class="text-xs text-muted-foreground">{{ getSelectSize(selectedModel) }}</span>
              </div>
              <span v-else class="text-muted-foreground">{{ t('modelOcr.noModelSelected') }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="model in downloadedModels"
                :key="model.def.id"
                :value="model.def.id"
              >
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-medium uppercase text-primary">OCR</span>
                  <span>{{ model.def.label }}</span>
                  <span class="text-xs text-muted-foreground">{{ model.def.sizeLabel }}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <p class="mt-1 text-xs text-muted-foreground">{{ t('modelOcr.selectModelHint') }}</p>
        </div>
      </div>
    </div>

    <!-- 删除确认弹窗 -->
    <AlertDialog v-model:open="deleteDialogOpen">
      <AlertDialogContent class="max-w-[400px]">
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t('modelOcr.deleteConfirm') }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t('modelOcr.deleteConfirmText', { name: deleteTarget }) }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
          <AlertDialogAction class="bg-destructive text-destructive-foreground hover:bg-destructive/90" @click="confirmDeleteModel">
            {{ t('common.delete') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import {
  ScanText, CheckCircle2, Download, FolderOpen, Folder, Trash2,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'

const { t } = useI18n()

// ========== 本地 OCR 模型 ==========
const localLoading = ref(false)
const allModels = ref([]) // OcrModelStatus[]
const selectedModel = ref(null)
const downloadSelected = ref(null)
const downloadProgress = ref(null)
const downloadStates = ref(new Map()) // id → { downloading, progress }
/** 下载源：auto=自动判断, mirror=国内镜像, official=官方源 */
const downloadSource = ref('auto')

// ========== 计算属性：按系列分组 ==========
const v6Models = computed(() => allModels.value.filter((m) => m.def.series === 'ppocrv6'))
const v5Models = computed(() => allModels.value.filter((m) => m.def.series === 'ppocrv5'))
const v4Models = computed(() => allModels.value.filter((m) => m.def.series === 'ppocrv4'))
const v3Models = computed(() => allModels.value.filter((m) => m.def.series === 'ppocrv3'))

// ========== 删除确认弹窗 ==========
const deleteDialogOpen = ref(false)
const deleteTarget = ref(null)

// ========== 计算属性 ==========
const downloadedModels = computed(() => allModels.value.filter((m) => m.ready))

// ========== 生命周期 ==========
onMounted(async () => {
  await Promise.all([
    fetchLocalModels(),
    fetchSelectedModel(),
  ])
  // 监听下载进度
  ipc.on(ipcApiRoute.ocr.onDownloadProgress, handleDownloadProgressEvent)
})

onUnmounted(() => {
  ipc.removeAllListeners(ipcApiRoute.ocr.onDownloadProgress)
})

// ========== 本地模型方法 ==========
async function fetchLocalModels() {
  localLoading.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.ocr.localOperation, { action: 'list' })
    if (res.code === 0) {
      allModels.value = res.data || []
    } else {
      toast.error(res.message || t('modelOcr.loadModelsFailed'))
    }
  } catch (err) {
    toast.error(t('modelOcr.loadModelsFailed') + ': ' + (err?.message || err))
  } finally {
    localLoading.value = false
  }
}

async function fetchSelectedModel() {
  try {
    const res = await ipc.invoke(ipcApiRoute.ocr.localOperation, { action: 'getSelected' })
    if (res.code === 0) {
      selectedModel.value = res.data || null
    }
  } catch (err) {
    // 静默失败
  }
}

async function handleSelectModel(modelId) {
  try {
    const res = await ipc.invoke(ipcApiRoute.ocr.localOperation, { action: 'select', filename: modelId })
    if (res.code === 0) {
      selectedModel.value = modelId
      const model = allModels.value.find((m) => m.def.id === modelId)
      const label = model?.def.label || modelId
      toast.success(t('modelOcr.selectModelSuccess', { name: label }))
    } else {
      toast.error(res.message || t('modelOcr.selectModelFailed'))
    }
  } catch (err) {
    toast.error(t('modelOcr.selectModelFailed') + ': ' + (err?.message || err))
  }
}

async function handleDownload() {
  if (!downloadSelected.value) return
  const modelId = downloadSelected.value
  // 下载源选择：auto=按时区自动判断, mirror=强制镜像, official=强制官方
  const useMirror = downloadSource.value === 'mirror' ? true
    : downloadSource.value === 'official' ? false
    : isLikelyChina()

  try {
    const res = await ipc.invoke(ipcApiRoute.ocr.localOperation, {
      action: 'download',
      filename: modelId,
      useMirror,
    })
    if (res.code === 0) {
      downloadStates.value.set(modelId, { downloading: true, progress: 0 })
    } else {
      toast.error(res.message || t('modelOcr.downloadFailed', { msg: '' }))
    }
  } catch (err) {
    toast.error(t('modelOcr.downloadFailed', { msg: err?.message || String(err) }))
  }
}

async function handleCancelDownload() {
  if (!downloadSelected.value) return
  const modelId = downloadSelected.value
  try {
    await ipc.invoke(ipcApiRoute.ocr.localOperation, {
      action: 'cancelDownload',
      filename: modelId,
    })
    downloadStates.value.delete(modelId)
    downloadProgress.value = null
  } catch (err) {
    toast.error('取消下载失败: ' + (err?.message || err))
  }
}

function handleDownloadProgressEvent(_event, progress) {
  if (!progress) return
  downloadProgress.value = progress
  const key = progress.modelId || progress.filename
  downloadStates.value.set(key, {
    downloading: !progress.done,
    progress: progress.percent,
  })
  if (progress.done) {
    if (progress.error) {
      toast.error(t('modelOcr.downloadFailed', { msg: progress.error }))
    } else {
      const model = allModels.value.find((m) => m.def.id === key || m.def.id === progress.modelId)
      const label = model?.def.label || progress.filename
      toast.success(t('modelOcr.downloadSuccess', { name: label }))
      // 刷新模型列表
      fetchLocalModels()
    }
    downloadStates.value.delete(key)
  }
}

function handleDeleteModel() {
  if (!downloadSelected.value) return
  const model = allModels.value.find((m) => m.def.id === downloadSelected.value)
  deleteTarget.value = model?.def.label || downloadSelected.value
  deleteDialogOpen.value = true
}

async function confirmDeleteModel() {
  if (!downloadSelected.value) return
  const modelId = downloadSelected.value
  try {
    const res = await ipc.invoke(ipcApiRoute.ocr.localOperation, {
      action: 'delete',
      filename: modelId,
    })
    if (res.code === 0) {
      toast.success(t('modelOcr.deleteModelSuccess'))
      // 如果删除的是当前选择的模型，清除选择
      if (selectedModel.value === modelId) {
        selectedModel.value = null
      }
      fetchLocalModels()
    } else {
      toast.error(res.message || t('modelOcr.deleteModelFailed'))
    }
  } catch (err) {
    toast.error(t('modelOcr.deleteModelFailed') + ': ' + (err?.message || err))
  }
}

async function handleOpenModelDir() {
  try {
    const os = window.require('os')
    const path = window.require('path')
    const dir = path.join(os.homedir(), '.diting', 'model', 'ocr')
    await ipc.invoke(ipcApiRoute.os.openDirectory, { id: dir })
  } catch (err) {
    toast.error('打开目录失败: ' + (err?.message || err))
  }
}

// ========== 辅助函数 ==========
function isDownloading(modelId) {
  return downloadStates.value.get(modelId)?.downloading ?? false
}

function isModelDownloaded(modelId) {
  const model = allModels.value.find((m) => m.def.id === modelId)
  return model?.ready ?? false
}

function getDownloadLabel(modelId) {
  const model = allModels.value.find((m) => m.def.id === modelId)
  return model?.def.label || modelId
}

function getDownloadSize(modelId) {
  const model = allModels.value.find((m) => m.def.id === modelId)
  return model?.def.sizeLabel || ''
}

function getDownloadDescription(modelId) {
  const model = allModels.value.find((m) => m.def.id === modelId)
  return model?.def.description || ''
}

function getSelectLabel(modelId) {
  const model = allModels.value.find((m) => m.def.id === modelId)
  return model?.def.label || modelId
}

function getSelectSize(modelId) {
  const model = allModels.value.find((m) => m.def.id === modelId)
  return model?.def.sizeLabel || ''
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

/**
 * 判断是否为国内网络环境
 * 通过时区简单判断，后续可扩展
 */
function isLikelyChina() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    return tz === 'Asia/Shanghai' || tz === 'Asia/Urumqi' || tz === 'Asia/Chongqing'
  } catch {
    return false
  }
}
</script>
