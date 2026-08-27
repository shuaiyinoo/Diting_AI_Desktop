<template>
  <!-- 遮罩层 -->
  <div v-if="open" class="fixed inset-0 z-30 bg-black/[0.02] cursor-pointer" @click="close" />
  <!-- 侧边面板 -->
  <aside
    v-if="open"
    class="fixed right-3 top-3 bottom-3 z-40 flex w-[calc(66.66%-24px)] min-w-[500px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
  >
    <!-- 固定头部 -->
    <div class="shrink-0 border-b border-border/50 px-5 pb-4 pt-5">
      <div class="flex items-center gap-3">
        <img
          :src="getProviderLogo(formData.provider)"
          :alt="formData.provider"
          class="size-9 rounded-lg"
        />
        <div class="min-w-0 flex-1">
          <div class="truncate text-[15px] font-semibold text-foreground">
            {{ editingModel ? t('modelVoice.remote.editTitle') : t('modelVoice.remote.addTitle') }}
          </div>
          <div class="mt-0.5 text-xs text-muted-foreground">
            {{ t('modelVoice.remote.volcSubtitle') }}
          </div>
        </div>
        <button
          class="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent"
          @click="close"
        >
          <X class="size-4" />
        </button>
      </div>
    </div>

    <!-- 可滚动内容区 -->
    <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <div class="space-y-4">
        <!-- 供应商选择 -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('modelVoice.remote.provider') }}</label>
          <Select v-model="formData.provider" @update:model-value="handleProviderChange">
            <SelectTrigger class="w-full">
              <div v-if="formData.provider" class="flex items-center gap-2">
                <span>{{ providerLabel(formData.provider) }}</span>
              </div>
              <span v-else class="text-muted-foreground">{{ t('modelVoice.remote.selectProvider') }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="p in PROVIDER_OPTIONS"
                :key="p.value"
                :value="p.value"
              >
                <span>{{ p.label }}</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- 模型别名 -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('modelVoice.remote.modelAlias') }} <span class="text-destructive">*</span></label>
          <Input v-model="formData.name" :placeholder="t('modelVoice.remote.modelAliasPlaceholder')" />
        </div>

        <!-- 模型名称 -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('modelVoice.remote.modelName') }} <span class="text-destructive">*</span></label>
          <Input v-model="formData.model_name" :placeholder="t('modelVoice.remote.modelNamePlaceholder')" />
          <p class="text-xs text-muted-foreground">{{ t('modelVoice.remote.modelNameHint') }}</p>
        </div>

        <!-- ===== 火山引擎专属配置 ===== -->
        <template v-if="formData.provider === 'volc'">
          <div class="rounded-lg border border-primary/20 bg-primary/5 p-3.5 space-y-4">
            <div class="flex items-center gap-2 text-sm font-medium text-foreground">
              <Flame class="size-4 text-primary" />
              {{ t('modelVoice.remote.volcConfigTitle') }}
            </div>

            <!-- 连接地址（只读） -->
            <div class="space-y-1.5">
              <label class="text-sm font-medium">{{ t('modelVoice.remote.volcBaseUrl') }}</label>
              <Input
                :model-value="VOLC_DEFAULT_BASE_URL"
                readonly
                class="font-mono text-xs"
              />
              <p class="text-xs text-muted-foreground">{{ t('modelVoice.remote.volcBaseUrlHint') }}</p>
            </div>

            <!-- X-Api-Key -->
            <div class="space-y-1.5">
              <label class="text-sm font-medium">X-Api-Key <span class="text-destructive">*</span></label>
              <div class="flex gap-2">
                <Input
                  v-model="formData.volc_api_key"
                  :type="showApiKey ? 'text' : 'password'"
                  :placeholder="isEditing && hasExistingApiKey ? '••••••••' : t('modelVoice.remote.volcApiKeyPlaceholder')"
                  autocomplete="new-password"
                  class="flex-1"
                />
                <Button variant="outline" size="icon" @click="showApiKey = !showApiKey">
                  <Eye v-if="!showApiKey" class="size-4" />
                  <EyeOff v-else class="size-4" />
                </Button>
              </div>
              <p class="text-xs text-muted-foreground">
                {{ isEditing && hasExistingApiKey ? t('modelVoice.remote.volcApiKeyEditHint') : t('modelVoice.remote.volcApiKeyHint') }}
              </p>
            </div>

            <!-- Resource ID -->
            <div class="space-y-1.5">
              <label class="text-sm font-medium">Resource ID <span class="text-destructive">*</span></label>
              <Select v-model="formData.volc_resource_id">
                <SelectTrigger class="w-full">
                  <div v-if="formData.volc_resource_id" class="flex items-center gap-2">
                    <span class="font-mono text-xs">{{ formData.volc_resource_id }}</span>
                  </div>
                  <span v-else class="text-muted-foreground">{{ t('modelVoice.remote.volcResourceIdPlaceholder') }}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="rid in VOLC_RESOURCE_IDS"
                    :key="rid"
                    :value="rid"
                  >
                    <div class="flex items-center gap-2">
                      <span class="font-mono text-xs">{{ rid }}</span>
                      <span v-if="rid === VOLC_DEFAULT_RESOURCE_ID" class="rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary">
                        {{ t('modelVoice.remote.default') }}
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p class="text-xs text-muted-foreground">{{ t('modelVoice.remote.volcResourceIdHint') }}</p>
            </div>
          </div>
        </template>

        <!-- ===== 非 volc 的通用配置 ===== -->
        <template v-if="formData.provider !== 'volc'">
          <!-- Base URL -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('modelVoice.remote.baseUrl') }}</label>
            <Input v-model="formData.base_url" placeholder="https://api.openai.com/v1" />
            <p class="text-xs text-muted-foreground">{{ t('modelVoice.remote.baseUrlHint') }}</p>
          </div>

          <!-- API Key -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('modelVoice.remote.apiKey') }}</label>
            <div class="flex gap-2">
              <Input
                v-model="formData.api_key"
                :type="showApiKey ? 'text' : 'password'"
                placeholder="sk-..."
                autocomplete="new-password"
                class="flex-1"
              />
              <Button variant="outline" size="icon" @click="showApiKey = !showApiKey">
                <Eye v-if="!showApiKey" class="size-4" />
                <EyeOff v-else class="size-4" />
              </Button>
            </div>
          </div>
        </template>

        <!-- 备注 -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('modelVoice.remote.remark') }}</label>
          <Input v-model="formData.remark" :placeholder="t('modelVoice.remote.remarkPlaceholder')" />
        </div>
      </div>
    </div>

    <!-- 固定底部操作栏 -->
    <div class="flex shrink-0 items-center gap-2.5 border-t border-border bg-card px-5 py-3.5">
      <Button variant="outline" @click="close">{{ t('common.cancel') }}</Button>
      <Button :disabled="submitting" class="ml-auto" @click="handleSubmit">
        <Loader2 v-if="submitting" class="mr-1.5 size-4 animate-spin" />
        {{ submitting ? t('modelVoice.remote.submitting') : (editingModel ? t('common.save') : t('modelVoice.remote.add')) }}
      </Button>
    </div>
  </aside>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { X, Eye, EyeOff, Loader2, Flame } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'
import { getProviderLogo } from '@/utils/model-logo'

const { t } = useI18n()

const emit = defineEmits(['saved'])

// 火山引擎 Resource ID 选项（与后端常量保持一致）
const VOLC_RESOURCE_IDS = [
  'volc.seedasr.sauc.duration',
  'volc.seedasr.sauc.concurrent',
  'volc.bigasr.sauc.duration',
  'volc.bigasr.sauc.concurrent',
]
const VOLC_DEFAULT_RESOURCE_ID = 'volc.seedasr.sauc.duration'

// 火山引擎固定 WSS 地址（与后端 VOLC_DEFAULT_BASE_URL 保持一致）
const VOLC_DEFAULT_BASE_URL = 'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async'

// 供应商选项
const PROVIDER_OPTIONS = [
  { value: 'volc', label: '火山引擎语音识别' },
  { value: 'openai', label: 'OpenAI 兼容（Whisper API）' },
  { value: 'custom', label: '自定义' },
]

function providerLabel(val) {
  const found = PROVIDER_OPTIONS.find((p) => p.value === val)
  return found ? found.label : val
}

const open = ref(false)
const submitting = ref(false)
const showApiKey = ref(false)
const editingModel = ref(null)

const formData = reactive({
  name: '',
  provider: 'volc',
  base_url: '',
  api_key: '',
  model_name: '',
  remark: '',
  // 火山引擎专属
  volc_api_key: '',
  volc_resource_id: VOLC_DEFAULT_RESOURCE_ID,
})

/** 是否处于编辑模式且已有加密的 API Key */
const isEditing = computed(() => !!editingModel.value)
const hasExistingApiKey = computed(() => editingModel.value?.volc_api_key === '******')

/** 关闭面板 */
function close() {
  open.value = false
}

/**
 * 打开面板
 * @param record 编辑模式下传入已有记录；null 为新建
 */
function show(record = null) {
  editingModel.value = record
  showApiKey.value = false
  if (record) {
    // 编辑模式
    formData.name = record.name || ''
    formData.provider = record.provider || 'volc'
    formData.base_url = record.provider === 'volc' ? VOLC_DEFAULT_BASE_URL : (record.base_url || '')
    formData.api_key = record.api_key || ''
    formData.model_name = record.model_name || ''
    formData.remark = record.remark || ''
    // API Key 不回显明文，编辑时留空表示不修改
    formData.volc_api_key = ''
    formData.volc_resource_id = record.volc_resource_id || VOLC_DEFAULT_RESOURCE_ID
  } else {
    // 新建模式：默认火山引擎
    formData.name = ''
    formData.provider = 'volc'
    formData.base_url = VOLC_DEFAULT_BASE_URL
    formData.api_key = ''
    formData.model_name = ''
    formData.remark = ''
    formData.volc_api_key = ''
    formData.volc_resource_id = VOLC_DEFAULT_RESOURCE_ID
  }
  open.value = true
}

/** 切换供应商 */
function handleProviderChange(val) {
  formData.provider = val
  // 火山引擎自动填充固定 WSS 地址
  if (val === 'volc') {
    formData.base_url = VOLC_DEFAULT_BASE_URL
  }
  // 自动填充默认名称（仅新建模式）
  if (!editingModel.value) {
    const trimmedName = formData.name.trim()
    const prevLabel = providerLabel(formData.provider)
    if (!trimmedName || PROVIDER_OPTIONS.some((p) => p.label === trimmedName)) {
      formData.name = providerLabel(val)
    }
    // volc 默认模型名
    if (val === 'volc' && !formData.model_name) {
      formData.model_name = 'volc-asr'
    }
  }
}

/** 提交表单 */
async function handleSubmit() {
  // 基础验证
  if (!formData.name.trim()) {
    toast.error(t('modelVoice.remote.inputAlias'))
    return
  }
  if (!formData.model_name.trim()) {
    toast.error(t('modelVoice.remote.inputModelName'))
    return
  }

  // 火山引擎专属验证
  if (formData.provider === 'volc') {
    // 确保 base_url 为固定 WSS 地址
    formData.base_url = VOLC_DEFAULT_BASE_URL
    // 新建时必须填 API Key，编辑时可以不填（表示不修改）
    if (!editingModel.value && !formData.volc_api_key.trim()) {
      toast.error(t('modelVoice.remote.volcApiKeyRequired'))
      return
    }
    if (!formData.volc_resource_id) {
      toast.error(t('modelVoice.remote.volcResourceIdRequired'))
      return
    }
  }

  submitting.value = true
  try {
    const params = {
      name: formData.name.trim(),
      provider: formData.provider,
      base_url: formData.base_url,
      api_key: formData.api_key,
      model_name: formData.model_name.trim(),
      remark: formData.remark,
      // 火山引擎专属
      volc_api_key: formData.provider === 'volc' ? formData.volc_api_key : undefined,
      volc_resource_id: formData.provider === 'volc' ? formData.volc_resource_id : undefined,
    }

    let res
    if (editingModel.value) {
      res = await ipc.invoke(ipcApiRoute.voice.remoteOperation, {
        action: 'update',
        id: editingModel.value.id,
        params,
      })
    } else {
      res = await ipc.invoke(ipcApiRoute.voice.remoteOperation, { action: 'add', params })
    }

    if (res.code === 0) {
      toast.success(res.message || (editingModel.value ? t('common.saveSuccess') : t('modelVoice.remote.addSuccess')))
      open.value = false
      emit('saved')
    } else {
      toast.error(res.message || t('modelVoice.remote.operationFailed'))
    }
  } catch (err) {
    toast.error(t('modelVoice.remote.operationFailed') + ': ' + (err?.message || err))
  } finally {
    submitting.value = false
  }
}

defineExpose({ show })
</script>
