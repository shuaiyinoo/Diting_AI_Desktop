<template>
  <div class="mx-auto flex h-full w-full max-w-[640px] flex-col">
    <!-- 顶部标题栏 -->
    <div class="mb-4 flex items-start justify-between px-1">
      <div class="flex-1">
        <h3 class="flex items-center gap-2 text-base font-semibold text-foreground">
          <Boxes class="size-5 text-primary" />
          {{ t('settings.tabs.modelVector') }}
        </h3>
        <p class="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {{ t('modelVector.subtitle') }}
        </p>
      </div>
    </div>

    <!-- ========== 本地向量模型区域 ========== -->
    <div class="rounded-lg border border-border bg-card p-3.5">
      <!-- 模型路径 -->
      <div class="mb-3 flex items-center justify-between">
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <FolderOpen class="size-3.5 shrink-0" />
          <span>{{ t('modelVector.modelPath') }}: ~/.diting/model/vector</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          class="h-7 gap-1 px-2 text-xs"
          @click="handleOpenModelDir"
        >
          <Folder class="size-3.5" />
          {{ t('modelVector.openFolder') }}
        </Button>
      </div>

      <!-- 加载模型列表中 -->
      <div v-if="localLoading" class="flex items-center justify-center py-8">
        <Spinner class="size-5 text-muted-foreground" />
        <span class="ml-2 text-sm text-muted-foreground">{{ t('modelVector.loadingModels') }}</span>
      </div>

      <div v-else>
        <!-- 下载源选择 -->
        <div class="mb-3 flex items-center justify-between">
          <span class="text-sm font-medium">{{ t('modelVector.downloadSource') }}</span>
          <div class="flex items-center rounded-lg border border-border bg-muted/30 p-1">
            <button
              class="rounded-md px-3.5 py-1 text-xs font-medium transition-colors"
              :class="downloadSource === 'auto' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              @click="downloadSource = 'auto'"
            >
              {{ t('modelVector.sourceAuto') }}
            </button>
            <button
              class="rounded-md px-3.5 py-1 text-xs font-medium transition-colors"
              :class="downloadSource === 'mirror' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              @click="downloadSource = 'mirror'"
            >
              {{ t('modelVector.sourceMirror') }}
            </button>
            <button
              class="rounded-md px-3.5 py-1 text-xs font-medium transition-colors"
              :class="downloadSource === 'official' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              @click="downloadSource = 'official'"
            >
              {{ t('modelVector.sourceOfficial') }}
            </button>
          </div>
        </div>

        <!-- 下载模型 -->
        <div class="mb-3">
          <label class="mb-1.5 block text-sm font-medium">{{ t('modelVector.downloadModel') }}</label>
          <!-- 下拉列表 + 下载按钮同一行 -->
          <div class="flex items-start gap-2">
            <Select v-model="downloadSelected" class="flex-1">
              <SelectTrigger class="w-full">
                <div v-if="downloadSelected" class="flex items-center gap-2">
                  <CheckCircle2 v-if="isModelDownloaded(downloadSelected)" class="size-3 text-green-500" />
                  <span>{{ getDownloadLabel(downloadSelected) }}</span>
                  <span class="text-xs text-muted-foreground">{{ getDownloadSize(downloadSelected) }}</span>
                </div>
                <span v-else class="text-muted-foreground">{{ t('modelVector.selectToDownload') }}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="model in allModels"
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
                {{ t('modelVector.cancelDownload') }}
              </Button>
              <!-- 未下载：下载按钮 -->
              <Button
                v-else-if="downloadSelected && !isModelDownloaded(downloadSelected)"
                size="sm"
                class="h-9 gap-1.5 px-3.5 text-[13px]"
                @click="handleDownload"
              >
                <Download class="size-4" />
                {{ t('modelVector.download') }}
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
              <span v-else-if="downloadProgress.done" class="text-green-500">{{ t('modelVector.downloaded') }}</span>
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
            {{ downloadSelected ? getDownloadDescription(downloadSelected) : t('modelVector.selectToDownload') }}
          </p>
        </div>

        <!-- ========== 模型市场（自定义模型下载） ========== -->
        <!-- 暂时隐藏模型市场，后续恢复时将 v-if 改为 true -->
        <div v-if="false" class="mb-3 rounded-lg border border-dashed border-border bg-muted/20 p-3">
          <div class="mb-2 flex items-center gap-1.5">
            <ShoppingBag class="size-4 text-primary" />
            <span class="text-sm font-medium">{{ t('modelVector.marketTitle') }}</span>
          </div>
          <!-- URL 输入 + 确认按钮 -->
          <div class="flex items-center gap-2">
            <input
              v-model="customModelUrl"
              type="text"
              :placeholder="t('modelVector.urlPlaceholder')"
              class="h-9 flex-1 rounded-md border border-border bg-background px-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-primary"
              @keyup.enter="handleDownloadCustom"
            />
            <!-- 确认下载按钮 -->
            <Button
              size="sm"
              class="h-9 shrink-0 gap-1.5 px-3.5 text-[13px]"
              :disabled="!customModelUrl.trim() || customDownloading"
              @click="handleDownloadCustom"
            >
              <Download v-if="!customDownloading" class="size-4" />
              <Spinner v-else class="size-4" />
              {{ t('modelVector.marketConfirm') }}
            </Button>
          </div>
          <!-- 下载提示 -->
          <div class="mt-2 space-y-0.5 text-xs text-muted-foreground">
            <p>{{ t('modelVector.marketHint') }}</p>
            <p class="pl-2">{{ t('modelVector.marketHintDomestic') }}</p>
            <p class="pl-2">{{ t('modelVector.marketHintInternational') }}</p>
          </div>
          <!-- 自定义模型下载进度 -->
          <div v-if="customDownloadProgress" class="mt-2">
            <div class="flex items-center justify-between text-xs text-muted-foreground">
              <span>{{ customDownloadProgress.filename || customDownloadProgress.modelId }}</span>
              <span v-if="customDownloadProgress.done && customDownloadProgress.error" class="text-destructive">{{ customDownloadProgress.error }}</span>
              <span v-else-if="customDownloadProgress.done" class="text-green-500">{{ t('modelVector.downloaded') }}</span>
              <span v-else>{{ customDownloadProgress.percent.toFixed(1) }}%</span>
            </div>
            <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                class="h-full rounded-full transition-all"
                :class="customDownloadProgress.done && customDownloadProgress.error ? 'bg-destructive' : customDownloadProgress.done ? 'bg-green-500' : 'bg-primary'"
                :style="{ width: `${customDownloadProgress.percent}%` }"
              />
            </div>
          </div>
        </div>

        <!-- 当前已选模型 -->
        <div class="border-t border-border pt-3">
          <label class="mb-1.5 block text-sm font-medium">{{ t('modelVector.selectModel') }}</label>
          <!-- 第一行：模型选择 -->
          <Select
            :model-value="selectedModel ?? undefined"
            @update:model-value="onSelectModelChange"
            class="w-full"
          >
            <SelectTrigger class="w-full">
              <div v-if="selectedModel" class="flex items-center gap-2">
                <span class="text-[10px] font-medium uppercase text-primary">VEC</span>
                <span>{{ getSelectLabel(selectedModel) }}</span>
                <span class="text-xs text-muted-foreground">{{ getSelectSize(selectedModel) }}</span>
              </div>
              <span v-else class="text-muted-foreground">{{ t('modelVector.noModelSelected') }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="model in downloadedModels"
                :key="model.def.id"
                :value="model.def.id"
              >
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-medium uppercase text-primary">VEC</span>
                  <span>{{ model.def.label }}</span>
                  <span class="text-xs text-muted-foreground">{{ model.def.sizeLabel }}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <!-- 第二行：维度选择 + 确认按钮 -->
          <div class="mt-2 flex items-center gap-2">
            <Select v-model="selectedDimensions" class="w-[80px] shrink-0">
              <SelectTrigger class="h-9">
                <span v-if="selectedDimensions" class="text-sm">{{ selectedDimensions }} {{ t('modelVector.dimensionsUnit') }}</span>
                <span v-else class="text-muted-foreground text-sm">{{ t('modelVector.dimensions') }}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="dim in dimensionOptions"
                  :key="dim"
                  :value="dim"
                >
                  <span class="text-sm">{{ dim }} {{ t('modelVector.dimensionsUnit') }}</span>
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              class="h-9 shrink-0 gap-1.5 px-3.5 text-[13px]"
              :disabled="!selectedModel || !selectedDimensions || selectingModel"
              @click="handleConfirmSelect"
            >
              <Spinner v-if="selectingModel" class="size-4" />
              <Check v-else class="size-4" />
              {{ selectingModel ? t('modelVector.verifying') : t('modelVector.confirmSelect') }}
            </Button>
          </div>
          <p class="mt-1 text-xs text-muted-foreground">{{ t('modelVector.selectModelHint') }}</p>
        </div>
      </div>
    </div>

    <!-- 删除确认弹窗 -->
    <AlertDialog v-model:open="deleteDialogOpen">
      <AlertDialogContent class="max-w-[400px]">
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t('modelVector.deleteConfirm') }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t('modelVector.deleteConfirmText', { name: deleteTarget }) }}
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

    <!-- 模型切换警告弹窗 -->
    <AlertDialog v-model:open="switchWarningOpen">
      <AlertDialogContent class="max-w-[460px]">
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t('modelVector.switchWarningTitle') }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t('modelVector.switchWarningText') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
          <AlertDialogAction @click="confirmSwitchModel">
            {{ t('modelVector.switchWarningConfirm') }}
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
  Boxes, CheckCircle2, Check, Download, FolderOpen, Folder, ShoppingBag, Trash2,
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

// ========== 维度选项 ==========
const dimensionOptions = [256, 384, 512, 768, 1024, 1536, 2048]

// ========== 本地向量模型 ==========
const localLoading = ref(false)
const allModels = ref([]) // VectorModelStatus[]
const selectedModel = ref(null)
const selectedDimensions = ref(1024)
const downloadSelected = ref(null)
const downloadProgress = ref(null)
const downloadStates = ref(new Map()) // id → { downloading, progress }
/** 下载源：auto=自动判断, mirror=国内镜像, official=官方源 */
const downloadSource = ref('auto')

// ========== 模型市场（自定义模型） ==========
const customModelUrl = ref('')
const customDownloading = ref(false)
const customDownloadProgress = ref(null)

// ========== 删除确认弹窗 ==========
const deleteDialogOpen = ref(false)
const deleteTarget = ref(null)

// ========== 模型切换警告弹窗 ==========
const switchWarningOpen = ref(false)
/** 待确认切换的模型信息 */
const pendingSwitch = ref(null)
/** 模型验证中（选择模型时的预热推理） */
const selectingModel = ref(false)

// ========== 计算属性 ==========
const downloadedModels = computed(() => allModels.value.filter((m) => m.ready))

// ========== 生命周期 ==========
onMounted(async () => {
  await Promise.all([
    fetchLocalModels(),
    fetchSelectedModel(),
  ])
  // 监听下载进度
  ipc.on(ipcApiRoute.vector.onDownloadProgress, handleDownloadProgressEvent)
})

onUnmounted(() => {
  ipc.removeAllListeners(ipcApiRoute.vector.onDownloadProgress)
})

// ========== 本地模型方法 ==========
async function fetchLocalModels() {
  localLoading.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.vector.localOperation, { action: 'list' })
    if (res.code === 0) {
      allModels.value = res.data || []
    } else {
      toast.error(res.message || t('modelVector.loadModelsFailed'))
    }
  } catch (err) {
    toast.error(t('modelVector.loadModelsFailed') + ': ' + (err?.message || err))
  } finally {
    localLoading.value = false
  }
}

async function fetchSelectedModel() {
  try {
    const res = await ipc.invoke(ipcApiRoute.vector.localOperation, { action: 'getSelected' })
    if (res.code === 0) {
      selectedModel.value = res.data || null
      // 从模型定义获取维度（如果有选中模型）
      if (res.data) {
        const model = allModels.value.find((m) => m.def.id === res.data)
        if (model?.def?.dimensions) {
          selectedDimensions.value = model.def.dimensions
        }
      }
    }
    // 二次查询：如果 list 先完成但 getSelected 未拿到维度
    if (selectedModel.value) {
      const model = allModels.value.find((m) => m.def.id === selectedModel.value)
      if (model?.def?.dimensions) {
        selectedDimensions.value = model.def.dimensions
      }
    }
  } catch (err) {
    // 静默失败
  }
}

/** 模型选择变化时，自动设置维度 */
function onSelectModelChange(modelId) {
  selectedModel.value = modelId
  const model = allModels.value.find((m) => m.def.id === modelId)
  if (model?.def?.dimensions) {
    selectedDimensions.value = model.def.dimensions
  }
}

/** 确认选择模型（带维度） */
async function handleConfirmSelect() {
  if (!selectedModel.value || !selectedDimensions.value) return

  // 检查是否与当前已选模型相同
  try {
    const res = await ipc.invoke(ipcApiRoute.vector.localOperation, { action: 'getSelected' })
    if (res.code === 0 && res.data === selectedModel.value) {
      // 相同模型，直接更新维度
      await doSelectModel(selectedModel.value, selectedDimensions.value)
      return
    }
  } catch {
    // 静默失败，继续弹窗流程
  }

  // 不同模型，弹出警告弹窗
  pendingSwitch.value = {
    modelId: selectedModel.value,
    dimensions: selectedDimensions.value,
  }
  switchWarningOpen.value = true
}

/** 执行模型选择（写入数据库，会先验证模型是否可用） */
async function doSelectModel(modelId, dims) {
  selectingModel.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.vector.localOperation, {
      action: 'select',
      filename: modelId,
      dimensions: dims,
    })
    if (res.code === 0) {
      const model = allModels.value.find((m) => m.def.id === modelId)
      const label = model?.def.label || modelId
      toast.success(t('modelVector.selectModelSuccess', { name: label }))
    } else {
      toast.error(res.message || t('modelVector.selectModelFailed'))
    }
  } catch (err) {
    toast.error(t('modelVector.selectModelFailed') + ': ' + (err?.message || err))
  } finally {
    selectingModel.value = false
  }
}

/** 确认切换模型：先重置向量数据，再选择新模型 */
async function confirmSwitchModel() {
  if (!pendingSwitch.value) return
  const { modelId, dimensions } = pendingSwitch.value
  switchWarningOpen.value = false

  try {
    // 1. 重置所有向量数据（删除旧的向量库、索引等）
    const resetRes = await ipc.invoke(ipcApiRoute.vector.localOperation, { action: 'resetVectorData' })
    if (resetRes.code !== 0) {
      toast.error(resetRes.message || t('modelVector.resetFailed'))
      return
    }

    // 2. 选择新模型
    await doSelectModel(modelId, dimensions)

    toast.success(t('modelVector.resetSuccess'))
  } catch (err) {
    toast.error(t('modelVector.resetFailed') + ': ' + (err?.message || err))
  } finally {
    pendingSwitch.value = null
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
    const res = await ipc.invoke(ipcApiRoute.vector.localOperation, {
      action: 'download',
      filename: modelId,
      useMirror,
    })
    if (res.code === 0) {
      downloadStates.value.set(modelId, { downloading: true, progress: 0 })
    } else {
      toast.error(res.message || t('modelVector.downloadFailed', { msg: '' }))
    }
  } catch (err) {
    toast.error(t('modelVector.downloadFailed', { msg: err?.message || String(err) }))
  }
}

async function handleCancelDownload() {
  if (!downloadSelected.value) return
  const modelId = downloadSelected.value
  try {
    await ipc.invoke(ipcApiRoute.vector.localOperation, {
      action: 'cancelDownload',
      filename: modelId,
    })
    downloadStates.value.delete(modelId)
    downloadProgress.value = null
  } catch (err) {
    toast.error('取消下载失败: ' + (err?.message || err))
  }
}

/** 模型市场：下载自定义模型 */
async function handleDownloadCustom() {
  const url = customModelUrl.value.trim()
  if (!url) return

  // 自定义模型默认 1024 维度
  const dims = 1024

  // 判断下载源
  const useMirror = downloadSource.value === 'mirror' ? true
    : downloadSource.value === 'official' ? false
    : isLikelyChina()

  customDownloading.value = true
  customDownloadProgress.value = null

  try {
    const res = await ipc.invoke(ipcApiRoute.vector.localOperation, {
      action: 'downloadCustom',
      url,
      dimensions: dims,
      useMirror,
    })
    if (res.code !== 0) {
      toast.error(res.message || t('modelVector.downloadFailed', { msg: '' }))
      customDownloading.value = false
    }
    // 下载进度通过 onDownloadProgress 事件回调
  } catch (err) {
    toast.error(t('modelVector.downloadFailed', { msg: err?.message || String(err) }))
    customDownloading.value = false
  }
}

function handleDownloadProgressEvent(_event, progress) {
  if (!progress) return

  // 判断是自定义模型还是预设模型
  const modelId = progress.modelId || ''
  const isCustom = modelId.startsWith('custom_')

  if (isCustom) {
    // 自定义模型进度
    customDownloadProgress.value = progress
    if (progress.done) {
      customDownloading.value = false
      if (progress.error) {
        toast.error(t('modelVector.downloadFailed', { msg: progress.error }))
      } else {
        toast.success(t('modelVector.downloadSuccess', { name: progress.filename || modelId }))
        fetchLocalModels()
      }
      customDownloadProgress.value = null
    }
  } else {
    // 预设模型进度
    downloadProgress.value = progress
    const key = progress.modelId || progress.filename
    downloadStates.value.set(key, {
      downloading: !progress.done,
      progress: progress.percent,
    })
    if (progress.done) {
      if (progress.error) {
        toast.error(t('modelVector.downloadFailed', { msg: progress.error }))
      } else {
        const model = allModels.value.find((m) => m.def.id === key || m.def.id === progress.modelId)
        const label = model?.def.label || progress.filename
        toast.success(t('modelVector.downloadSuccess', { name: label }))
        fetchLocalModels()
      }
      downloadStates.value.delete(key)
    }
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
    const res = await ipc.invoke(ipcApiRoute.vector.localOperation, {
      action: 'delete',
      filename: modelId,
    })
    if (res.code === 0) {
      toast.success(t('modelVector.deleteModelSuccess'))
// 如果删除的是当前选择的模型，清除选择
if (selectedModel.value === modelId) {
selectedModel.value = null
selectedDimensions.value = 1024
}
      fetchLocalModels()
    } else {
      toast.error(res.message || t('modelVector.deleteModelFailed'))
    }
  } catch (err) {
    toast.error(t('modelVector.deleteModelFailed') + ': ' + (err?.message || err))
  }
}

async function handleOpenModelDir() {
  try {
    const os = window.require('os')
    const path = window.require('path')
    const dir = path.join(os.homedir(), '.diting', 'model', 'vector')
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
