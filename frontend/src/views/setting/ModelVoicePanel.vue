<template>
  <div class="mx-auto flex h-full w-full max-w-[640px] flex-col">
    <!-- 顶部标题栏 -->
    <div class="mb-4 flex items-start justify-between px-1">
      <div class="flex-1">
        <h3 class="flex items-center gap-2 text-base font-semibold text-foreground">
          <AudioLines class="size-5 text-primary" />
          {{ t('settings.tabs.modelVoice') }}
        </h3>
        <p class="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          {{ t('modelVoice.subtitle') }}
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" class="h-8 gap-1.5 px-3.5 text-[13px]" @click="handleAddCloud">
          <Cloud class="size-4" />
          {{ t('modelVoice.remote.addCloud') }}
        </Button>
        <Button size="sm" class="h-8 gap-1.5 px-3.5 text-[13px]" @click="handleAddRemote">
          <Plus class="size-4" />
          {{ t('modelVoice.remote.addOfficial') }}
        </Button>
      </div>
    </div>

    <!-- ========== 远程语音模型状态 ========== -->
    <div
      v-if="enabledRemoteModel"
      class="mb-4 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3"
    >
      <img
        :src="getModelLogo(enabledRemoteModel.model_name, inferProviderType(enabledRemoteModel.provider, enabledRemoteModel.base_url))"
        :alt="enabledRemoteModel.name"
        class="size-8 rounded-lg"
      />
      <div class="flex flex-1 items-center gap-2">
        <Badge variant="default" class="gap-1">
          <CheckCircle2 class="size-3" />
          {{ t('modelVoice.remote.currentEnabled') }}
        </Badge>
        <span class="text-sm font-semibold text-foreground">{{ enabledRemoteModel.name }}</span>
        <span class="text-xs text-muted-foreground">{{ enabledRemoteModel.model_name }}</span>
      </div>
    </div>
    <div
      v-else
      class="mb-4 flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900 dark:bg-yellow-950/50"
    >
      <div class="flex flex-1 items-center gap-2">
        <Badge variant="secondary" class="gap-1">
          <AlertCircle class="size-3" />
          {{ t('modelVoice.remote.notEnabled') }}
        </Badge>
        <span class="text-sm text-muted-foreground">{{ t('modelVoice.remote.notEnabledHint') }}</span>
      </div>
    </div>

    <!-- 远程模型加载中 -->
    <div v-if="remoteLoading" class="mb-4 flex items-center justify-center py-8">
      <Spinner class="size-5 text-muted-foreground" />
      <span class="ml-2 text-sm text-muted-foreground">{{ t('modelVoice.remote.loading') }}</span>
    </div>

    <!-- 远程模型卡片列表 -->
    <div v-else-if="remoteList.length > 0" class="mb-4 grid grid-cols-2 gap-3">
      <div
        v-for="record in remoteList"
        :key="record.id"
        class="group cursor-pointer rounded-lg border bg-card p-3.5 shadow-sm transition-all hover:shadow-md hover:border-primary/30"
        :class="record.enabled === 1 ? 'border-primary/40' : 'border-border'"
      >
        <div class="mb-2 flex items-start justify-between">
          <div class="flex items-center gap-2.5">
            <img
              :src="getModelLogo(record.model_name, inferProviderType(record.provider, record.base_url))"
              :alt="record.name"
              class="size-9 rounded-lg"
            />
            <div class="min-w-0">
              <div class="truncate text-sm font-semibold text-foreground">{{ record.name }}</div>
              <div class="truncate text-xs text-muted-foreground">{{ record.model_name }}</div>
            </div>
          </div>
          <Badge v-if="record.enabled === 1" variant="default" class="shrink-0 gap-1">
            <CheckCircle2 class="size-3" />
            {{ t('modelVoice.remote.enabled') }}
          </Badge>
          <Badge v-else variant="secondary" class="shrink-0">{{ t('modelVoice.remote.notEnabledBadge') }}</Badge>
        </div>
        <div class="mb-2.5 space-y-1">
          <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe class="size-3 shrink-0" />
            <span class="truncate" :title="record.base_url">{{ record.base_url || t('common.notSet') }}</span>
          </div>
        </div>
        <div class="flex items-center gap-1 border-t border-border pt-2.5" @click.stop>
          <Button
            v-if="record.enabled !== 1"
            variant="link"
            size="sm"
            class="h-7 px-2 text-xs"
            @click="handleEnableRemote(record)"
          >
            {{ t('modelVoice.remote.enable') }}
          </Button>
          <Button
            v-else
            variant="link"
            size="sm"
            class="h-7 px-2 text-xs"
            @click="handleDisableRemote(record)"
          >
            {{ t('modelVoice.remote.disable') }}
          </Button>
          <Button
            variant="link"
            size="sm"
            class="h-7 px-2 text-xs"
            @click="handleEditRemote(record)"
          >
            {{ t('common.edit') }}
          </Button>
          <Button
            variant="link"
            size="sm"
            class="h-7 px-2 text-xs text-destructive hover:text-destructive"
            @click="handleDeleteRemote(record)"
          >
            {{ t('common.delete') }}
          </Button>
        </div>
      </div>
    </div>

    <!-- 远程模型空状态 -->
    <div v-else class="mb-4 flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8">
      <Cloud class="mb-2 size-8 text-muted-foreground/40" />
      <p class="text-sm text-muted-foreground">{{ t('modelVoice.remote.empty') }}</p>
    </div>

    <!-- ========== 分隔线 ========== -->
    <div class="mb-4 border-t border-border" />

    <!-- ========== 本地 Whisper 模型区域 ========== -->
    <div class="mb-3 flex items-center justify-between">
      <div class="flex-1">
        <h4 class="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Cpu class="size-4 text-primary" />
          {{ t('modelVoice.local.title') }}
        </h4>
        <p class="mt-1 text-xs text-muted-foreground">{{ t('modelVoice.local.subtitle') }}</p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-muted-foreground">{{ t('modelVoice.local.modeLocal') }}</span>
        <Switch v-model="localModeEnabled" @update:model-value="handleLocalModeToggle" />
      </div>
    </div>

    <!-- 麦克风权限 -->
    <div class="mb-4 rounded-lg border border-border bg-card p-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <Mic v-if="micPermission?.status === 'granted'" class="size-3.5 text-green-500" />
          <MicOff v-else-if="micPermission?.status === 'denied'" class="size-3.5 text-destructive" />
          <Mic v-else-if="micPermission?.status === 'not-determined'" class="size-3.5 text-amber-500" />
          <Mic v-else class="size-3.5 text-muted-foreground" />
          <div class="min-w-0">
            <span class="text-xs font-medium text-foreground">{{ t('modelVoice.local.micPermission') }}</span>
            <span class="ml-1.5 text-xs text-muted-foreground">
              {{ micPermissionText }}
            </span>
          </div>
        </div>
        <Button
          v-if="micPermission?.status === 'not-determined' || micPermission?.status === 'denied'"
          variant="outline"
          size="sm"
          class="h-7 gap-1.5 px-3 text-xs"
          :disabled="micChecking"
          @click="handleRequestMicPermission"
        >
          <Loader2 v-if="micChecking" class="size-3.5 animate-spin" />
          {{ micPermission?.status === 'not-determined' ? t('modelVoice.local.requestPermission') : t('modelVoice.local.requestAgain') }}
        </Button>
      </div>
    </div>

    <!-- 本地模型内容 -->
    <div class="rounded-lg border border-border bg-card p-3.5">
      <!-- 模型路径 -->
      <div class="mb-3 flex items-center justify-between">
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <FolderOpen class="size-3.5 shrink-0" />
          <span>{{ t('modelVoice.local.modelPath') }}: ~/.diting/model/voice</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          class="h-7 gap-1 px-2 text-xs"
          @click="handleOpenModelDir"
        >
          <Folder class="size-3.5" />
          {{ t('modelVoice.local.openFolder') }}
        </Button>
      </div>

      <!-- 加载模型列表中 -->
      <div v-if="localLoading" class="flex items-center justify-center py-8">
        <Spinner class="size-5 text-muted-foreground" />
        <span class="ml-2 text-sm text-muted-foreground">{{ t('modelVoice.local.loadingModels') }}</span>
      </div>

      <div v-else>
        <!-- 下载源选择 -->
        <div class="mb-3 flex items-center justify-between">
          <span class="text-sm font-medium">{{ t('modelVoice.local.downloadSource') }}</span>
          <div class="flex items-center rounded-lg border border-border bg-muted/30 p-1">
            <button
              class="rounded-md px-3.5 py-1 text-xs font-medium transition-colors"
              :class="downloadSource === 'auto' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              @click="downloadSource = 'auto'"
            >
              {{ t('modelVoice.local.sourceAuto') }}
            </button>
            <button
              class="rounded-md px-3.5 py-1 text-xs font-medium transition-colors"
              :class="downloadSource === 'mirror' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              @click="downloadSource = 'mirror'"
            >
              {{ t('modelVoice.local.sourceMirror') }}
            </button>
            <button
              class="rounded-md px-3.5 py-1 text-xs font-medium transition-colors"
              :class="downloadSource === 'official' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
              @click="downloadSource = 'official'"
            >
              {{ t('modelVoice.local.sourceOfficial') }}
            </button>
          </div>
        </div>

        <!-- 下载模型 -->
        <div class="mb-3">
          <label class="mb-1.5 block text-sm font-medium">{{ t('modelVoice.local.downloadModel') }}</label>
          <!-- 下拉列表 + 下载按钮同一行 -->
          <div class="flex items-start gap-2">
            <Select v-model="downloadSelected" class="flex-1">
              <SelectTrigger class="w-full">
                <div v-if="downloadSelected" class="flex items-center gap-2">
                  <span>{{ getDownloadLabel(downloadSelected) }}</span>
                  <span class="text-xs text-muted-foreground">{{ getDownloadSize(downloadSelected) }}</span>
                </div>
                <span v-else class="text-muted-foreground">{{ t('modelVoice.local.selectToDownload') }}</span>
              </SelectTrigger>
              <SelectContent>
                <!-- FunASR 模型分组 -->
                <div v-if="funasrModels.length > 0" class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  FunASR
                </div>
                <SelectItem
                  v-for="model in funasrModels"
                  :key="model.id"
                  :value="model.id"
                >
                  <div class="flex items-center gap-2">
                    <CheckCircle2 v-if="model.ready" class="size-3 text-green-500" />
                    <span>{{ model.label }}</span>
                    <span class="text-xs text-muted-foreground">{{ model.sizeLabel }}</span>
                    <span class="rounded bg-purple-500/10 px-1 py-0.5 text-[10px] font-medium text-purple-600">
                      {{ model.langLabel }}
                    </span>
                  </div>
                </SelectItem>
                <!-- Whisper 模型分组 -->
                <div v-if="whisperModels.length > 0" class="mt-1 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Whisper
                </div>
                <SelectItem
                  v-for="model in whisperModels"
                  :key="model.id"
                  :value="model.id"
                >
                  <div class="flex items-center gap-2">
                    <CheckCircle2 v-if="model.ready" class="size-3 text-green-500" />
                    <span>{{ model.label }}</span>
                    <span class="text-xs text-muted-foreground">{{ model.sizeLabel }}</span>
                    <span
                      v-if="model.langLabel === '多语言'"
                      class="rounded bg-green-500/10 px-1 py-0.5 text-[10px] font-medium text-green-600"
                    >
                      {{ t('modelVoice.local.modelLang') }}
                    </span>
                    <span
                      v-else
                      class="rounded bg-blue-500/10 px-1 py-0.5 text-[10px] font-medium text-blue-600"
                    >
                      {{ t('modelVoice.local.modelLangEn') }}
                    </span>
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
                {{ t('modelVoice.local.cancelDownload') }}
              </Button>
              <!-- 未下载：下载按钮 -->
              <Button
                v-else-if="downloadSelected && !isModelDownloaded(downloadSelected)"
                size="sm"
                class="h-9 gap-1.5 px-3.5 text-[13px]"
                @click="handleDownload"
              >
                <Download class="size-4" />
                {{ t('modelVoice.local.download') }}
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
              <span>{{ downloadProgress.filename }}</span>
              <span v-if="downloadProgress.done && downloadProgress.error" class="text-destructive">{{ downloadProgress.error }}</span>
              <span v-else-if="downloadProgress.done" class="text-green-500">{{ t('modelVoice.local.downloaded') }}</span>
              <span v-else>{{ downloadProgress.percent.toFixed(1) }}% ({{ formatBytes(downloadProgress.downloaded) }} / {{ formatBytes(downloadProgress.total) }}) - {{ downloadProgress.speed.toFixed(0) }} KB/s</span>
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
            {{ downloadSelected ? getDownloadDescription(downloadSelected) : t('modelVoice.local.selectToDownload') }}
          </p>
        </div>

        <!-- 当前已选模型 -->
        <div class="border-t border-border pt-3">
          <label class="mb-1.5 block text-sm font-medium">{{ t('modelVoice.local.selectModel') }}</label>
          <Select :model-value="selectedModel ?? undefined" @update:model-value="handleSelectModel">
            <SelectTrigger class="w-full">
              <div v-if="selectedModel" class="flex items-center gap-2">
                <span>{{ getSelectLabel(selectedModel) }}</span>
                <span class="text-xs text-muted-foreground">{{ getSelectSize(selectedModel) }}</span>
                <span
                  v-if="getSelectLangLabel(selectedModel) === '仅英语'"
                  class="rounded bg-blue-500/10 px-1 py-0.5 text-[10px] font-medium text-blue-600"
                >
                  {{ t('modelVoice.local.modelLangEn') }}
                </span>
              </div>
              <span v-else class="text-muted-foreground">{{ t('modelVoice.local.noModelSelected') }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="model in downloadedModels"
                :key="model.id"
                :value="model.id"
              >
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-medium uppercase" :class="model.engine === 'whisper' ? 'text-blue-500' : 'text-purple-500'">
                    {{ model.engine === 'whisper' ? 'W' : 'F' }}
                  </span>
                  <span>{{ model.label }}</span>
                  <span class="text-xs text-muted-foreground">{{ model.sizeLabel }}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <p class="mt-1 text-xs text-muted-foreground">{{ t('modelVoice.local.selectModelHint') }}</p>
        </div>
      </div>
    </div>

    <!-- 删除确认弹窗 -->
    <AlertDialog v-model:open="deleteDialogOpen">
      <AlertDialogContent class="max-w-[400px]">
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t('modelVoice.remote.deleteConfirm') }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t('modelVoice.remote.deleteConfirmText', { name: deleteTarget }) }}
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

    <!-- 远程语音模型编辑弹窗 -->
    <VoiceRemoteEditDialog ref="voiceEditDialogRef" @saved="onRemoteSaved" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import {
  AudioLines, Cloud, Plus, CheckCircle2, AlertCircle, Globe, Loader2,
  Mic, MicOff, Cpu, Download, FolderOpen, Folder, Trash2,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Switch } from '@/components/ui/switch'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'
import { inferProviderType } from '@/utils/provider-presets'
import { getModelLogo } from '@/utils/model-logo'
import VoiceRemoteEditDialog from './VoiceRemoteEditDialog.vue'

const { t } = useI18n()

// ========== 远程语音模型 ==========
const remoteLoading = ref(false)
const remoteList = ref([])
const enabledRemoteModel = computed(() => remoteList.value.find((m) => m.enabled === 1) || null)

// ========== 本地模型（Whisper + FunASR 统一） ==========
const localLoading = ref(false)
const allModels = ref([]) // UnifiedModelStatus[]
const selectedModel = ref(null)
const selectedEngine = ref('whisper')
const downloadSelected = ref(null)
const downloadProgress = ref(null)
const downloadStates = ref(new Map()) // id → { downloading, progress }
const localModeEnabled = ref(true) // 本地模式开关，默认打开，与远程模型互斥
/** 下载源：auto=自动判断, mirror=国内镜像, official=官方源 */
const downloadSource = ref('auto')

// ========== 计算属性：按引擎分组 ==========
const whisperModels = computed(() => allModels.value.filter((m) => m.engine === 'whisper'))
const funasrModels = computed(() => allModels.value.filter((m) => m.engine === 'funasr'))

// ========== 麦克风权限 ==========
const micPermission = ref(null)
const micChecking = ref(false)

// ========== 删除确认弹窗 ==========
const deleteDialogOpen = ref(false)
const deleteTarget = ref(null)
/** 删除目标类型：'remote' 远程模型 | 'local' 本地模型 */
const deleteTargetType = ref(null)
/** 删除远程模型时保存的 id */
const deleteRemoteId = ref(null)

// ========== 远程模型编辑弹窗 ==========
const voiceEditDialogRef = ref(null)

// ========== 计算属性 ==========
const downloadedModels = computed(() => allModels.value.filter((m) => m.ready))

const micPermissionText = computed(() => {
  const status = micPermission.value?.status
  if (status === 'granted') return t('modelVoice.local.micGranted')
  if (status === 'denied') return t('modelVoice.local.micDenied')
  if (status === 'not-determined') return t('modelVoice.local.notDetermined')
  return t('modelVoice.local.unsupported')
})

// ========== 生命周期 ==========
onMounted(async () => {
  await Promise.all([
    fetchRemoteModels(),
    fetchLocalModels(),
    fetchSelectedModel(),
    checkMicPermission(),
  ])
  // 初始化互斥状态：如果有已启用的远程模型，关闭本地模式
  if (enabledRemoteModel.value) {
    localModeEnabled.value = false
  }
  // 监听下载进度
  ipc.on(ipcApiRoute.voice.onDownloadProgress, handleDownloadProgressEvent)
})

onUnmounted(() => {
  ipc.removeAllListeners(ipcApiRoute.voice.onDownloadProgress)
})

// ========== 远程模型方法 ==========
async function fetchRemoteModels() {
  remoteLoading.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.voice.remoteOperation, { action: 'list' })
    if (res.code === 0) remoteList.value = res.data || []
    else toast.error(res.message || t('modelVoice.remote.listFailed'))
  } catch (err) {
    toast.error('获取远程语音模型列表异常: ' + (err?.message || err))
  } finally {
    remoteLoading.value = false
  }
}

function handleAddCloud() {
  toast.info(t('modelVoice.cloudComingSoon'))
}

function handleAddRemote() {
  // 打开远程语音模型添加弹窗
  voiceEditDialogRef.value?.show(null)
}

function handleEditRemote(record) {
  voiceEditDialogRef.value?.show(record)
}

/**
 * 本地模式开关切换
 * 与远程语音模型互斥：打开本地模式时禁用远程模型，关闭时启用远程模型
 */
async function handleLocalModeToggle(enabled) {
  if (enabled) {
    // 打开本地模式 → 禁用远程语音模型
    if (enabledRemoteModel.value) {
      try {
        await ipc.invoke(ipcApiRoute.voice.remoteOperation, {
          action: 'disable',
          id: enabledRemoteModel.value.id,
        })
        fetchRemoteModels()
      } catch (err) {
        // 静默失败
      }
    }
  }
}

async function handleEnableRemote(record) {
  try {
    const res = await ipc.invoke(ipcApiRoute.voice.remoteOperation, { action: 'enable', id: record.id })
    if (res.code === 0) {
      toast.success(t('modelVoice.remote.enableSuccess', { name: record.name }))
      // 启用远程模型时，关闭本地模式开关（互斥）
      localModeEnabled.value = false
      fetchRemoteModels()
    } else {
      toast.error(res.message || t('modelVoice.remote.enableFailed'))
    }
  } catch (err) {
    toast.error('启用失败: ' + (err?.message || err))
  }
}

async function handleDisableRemote(record) {
  try {
    const res = await ipc.invoke(ipcApiRoute.voice.remoteOperation, { action: 'disable', id: record.id })
    if (res.code === 0) {
      toast.success(t('modelVoice.remote.disableSuccess', { name: record.name }))
      // 禁用远程模型后，自动打开本地模式
      localModeEnabled.value = true
      fetchRemoteModels()
    } else {
      toast.error(res.message || t('modelVoice.remote.disableFailed'))
    }
  } catch (err) {
    toast.error('禁用失败: ' + (err?.message || err))
  }
}

function handleDeleteRemote(record) {
  deleteTarget.value = record.name
  deleteRemoteId.value = record.id
  deleteTargetType.value = 'remote'
  deleteDialogOpen.value = true
}

/** 远程模型弹窗保存成功后刷新列表 */
async function onRemoteSaved() {
  await fetchRemoteModels()
  // 保存后同步互斥状态
  localModeEnabled.value = !enabledRemoteModel.value
}

// ========== 本地模型方法 ==========
async function fetchLocalModels() {
  localLoading.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.voice.localOperation, { action: 'list' })
    if (res.code === 0) {
      allModels.value = res.data || []
    } else {
      toast.error(res.message || t('modelVoice.local.loadModelsFailed'))
    }
  } catch (err) {
    toast.error(t('modelVoice.local.loadModelsFailed') + ': ' + (err?.message || err))
  } finally {
    localLoading.value = false
  }
}

async function fetchSelectedModel() {
  try {
    const [modelRes, engineRes] = await Promise.all([
      ipc.invoke(ipcApiRoute.voice.localOperation, { action: 'getSelected' }),
      ipc.invoke(ipcApiRoute.voice.localOperation, { action: 'getEngine' }),
    ])
    if (modelRes.code === 0) {
      selectedModel.value = modelRes.data || null
    }
    if (engineRes.code === 0) {
      selectedEngine.value = engineRes.data || 'whisper'
    }
  } catch (err) {
    // 静默失败
  }
}

async function handleSelectModel(modelId) {
  const model = allModels.value.find((m) => m.id === modelId)
  const engine = model?.engine || 'whisper'
  try {
    const res = await ipc.invoke(ipcApiRoute.voice.localOperation, { action: 'select', filename: modelId, engine })
    if (res.code === 0) {
      selectedModel.value = modelId
      selectedEngine.value = engine
      const label = model?.label || modelId
      toast.success(t('modelVoice.local.selectModelSuccess', { name: label }))
    } else {
      toast.error(res.message || t('modelVoice.local.selectModelFailed'))
    }
  } catch (err) {
    toast.error(t('modelVoice.local.selectModelFailed') + ': ' + (err?.message || err))
  }
}

async function handleDownload() {
  if (!downloadSelected.value) return
  const modelId = downloadSelected.value
  const model = allModels.value.find((m) => m.id === modelId)
  const engine = model?.engine || 'whisper'
  // 下载源选择：auto=按时区自动判断, mirror=强制镜像, official=强制官方
  const useMirror = downloadSource.value === 'mirror' ? true
    : downloadSource.value === 'official' ? false
    : isLikelyChina()

  try {
    const res = await ipc.invoke(ipcApiRoute.voice.localOperation, {
      action: 'download',
      filename: modelId,
      engine,
      useMirror,
    })
    if (res.code === 0) {
      downloadStates.value.set(modelId, { downloading: true, progress: 0 })
    } else {
      toast.error(res.message || t('modelVoice.local.downloadFailed', { msg: '' }))
    }
  } catch (err) {
    toast.error(t('modelVoice.local.downloadFailed', { msg: err?.message || String(err) }))
  }
}

async function handleCancelDownload() {
  if (!downloadSelected.value) return
  const modelId = downloadSelected.value
  const model = allModels.value.find((m) => m.id === modelId)
  const engine = model?.engine || 'whisper'
  try {
    await ipc.invoke(ipcApiRoute.voice.localOperation, {
      action: 'cancelDownload',
      filename: modelId,
      engine,
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
  // 下载进度的 key 用 filename（Whisper 是模型文件名，FunASR 是当前下载的文件名或 modelId）
  const key = progress.modelId || progress.filename
  downloadStates.value.set(key, {
    downloading: !progress.done,
    progress: progress.percent,
  })
  if (progress.done) {
    if (progress.error) {
      toast.error(t('modelVoice.local.downloadFailed', { msg: progress.error }))
    } else {
      // 从 allModels 中查找匹配的模型名称
      const model = allModels.value.find((m) => m.id === key || m.id === progress.modelId)
      const label = model?.label || progress.filename
      toast.success(t('modelVoice.local.downloadSuccess', { name: label }))
      // 刷新模型列表
      fetchLocalModels()
    }
    downloadStates.value.delete(key)
  }
}

function handleDeleteModel() {
  if (!downloadSelected.value) return
  const model = allModels.value.find((m) => m.id === downloadSelected.value)
  deleteTarget.value = model?.label || downloadSelected.value
  deleteTargetType.value = 'local'
  deleteDialogOpen.value = true
}

async function confirmDeleteModel() {
  // 远程模型删除
  if (deleteTargetType.value === 'remote') {
    if (!deleteRemoteId.value) return
    try {
      const res = await ipc.invoke(ipcApiRoute.voice.remoteOperation, {
        action: 'delete',
        id: deleteRemoteId.value,
      })
      if (res.code === 0) {
        toast.success(t('modelVoice.remote.deleteSuccess', { name: deleteTarget.value }))
        fetchRemoteModels()
      } else {
        toast.error(res.message || t('modelVoice.remote.deleteFailed'))
      }
    } catch (err) {
      toast.error(t('modelVoice.remote.deleteFailed') + ': ' + (err?.message || err))
    } finally {
      deleteRemoteId.value = null
      deleteTargetType.value = null
    }
    return
  }

  // 本地模型删除
  if (!downloadSelected.value) return
  const modelId = downloadSelected.value
  const model = allModels.value.find((m) => m.id === modelId)
  const engine = model?.engine || 'whisper'
  try {
    const res = await ipc.invoke(ipcApiRoute.voice.localOperation, {
      action: 'delete',
      filename: modelId,
      engine,
    })
    if (res.code === 0) {
      toast.success(t('modelVoice.local.deleteModelSuccess'))
      // 如果删除的是当前选择的模型，清除选择
      if (selectedModel.value === modelId) {
        selectedModel.value = null
      }
      fetchLocalModels()
    } else {
      toast.error(res.message || t('modelVoice.local.deleteModelFailed'))
    }
  } catch (err) {
    toast.error(t('modelVoice.local.deleteModelFailed') + ': ' + (err?.message || err))
  } finally {
    deleteTargetType.value = null
  }
}

async function handleOpenModelDir() {
  try {
    const os = window.require('os')
    const path = window.require('path')
    const dir = path.join(os.homedir(), '.diting', 'model', 'voice')
    // 使用 IPC 调用 os/openDirectory
    await ipc.invoke(ipcApiRoute.os.openDirectory, { id: dir })
  } catch (err) {
    toast.error('打开目录失败: ' + (err?.message || err))
  }
}

// ========== 麦克风权限 ==========
async function checkMicPermission() {
  micChecking.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.voice.micPermission, { action: 'check' })
    if (res.code === 0) {
      micPermission.value = res.data
    }
  } catch (err) {
    // 静默失败
  } finally {
    micChecking.value = false
  }
}

async function handleRequestMicPermission() {
  micChecking.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.voice.micPermission, { action: 'request' })
    if (res.code === 0) {
      micPermission.value = res.data
      if (res.data?.status === 'granted') {
        toast.success(t('modelVoice.local.micGranted'))
      } else if (res.data?.status === 'denied') {
        toast.error(t('modelVoice.local.micDenied'))
      }
    }
  } catch (err) {
    toast.error('请求麦克风权限失败: ' + (err?.message || err))
  } finally {
    micChecking.value = false
  }
}

// ========== 辅助函数 ==========
function isDownloading(modelId) {
  return downloadStates.value.get(modelId)?.downloading ?? false
}

function isModelDownloaded(modelId) {
  const model = allModels.value.find((m) => m.id === modelId)
  return model?.ready ?? false
}

function getDownloadLabel(modelId) {
  const model = allModels.value.find((m) => m.id === modelId)
  return model?.label || modelId
}

function getDownloadSize(modelId) {
  const model = allModels.value.find((m) => m.id === modelId)
  return model?.sizeLabel || ''
}

function getDownloadDescription(modelId) {
  const model = allModels.value.find((m) => m.id === modelId)
  if (!model) return ''
  // FunASR 模型有自己的描述
  if (model.engine === 'funasr') {
    const detail = model.detail
    return detail?.def?.description || ''
  }
  // Whisper 模型按语言类型返回描述
  const langLabel = model.langLabel
  return langLabel === '多语言' ? t('modelVoice.local.modelLangDesc') : t('modelVoice.local.modelLangEnDesc')
}

function getSelectLabel(modelId) {
  const model = allModels.value.find((m) => m.id === modelId)
  return model?.label || modelId
}

function getSelectSize(modelId) {
  const model = allModels.value.find((m) => m.id === modelId)
  return model?.sizeLabel || ''
}

function getSelectLangLabel(modelId) {
  const model = allModels.value.find((m) => m.id === modelId)
  return model?.langLabel || '多语言'
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
