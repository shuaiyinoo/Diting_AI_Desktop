<template>
  <!-- 遮罩层 -->
  <div v-if="open" class="fixed inset-0 z-30 bg-black/[0.02] cursor-pointer" @click="close" />
  <!-- 侧边面板 -->
  <aside
    v-if="open"
    class="fixed right-3 top-3 bottom-3 z-40 flex w-[calc(66.66%-24px)] min-w-[500px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
  >
    <!-- 固定头部：图标 + 标题 + 关闭按钮 -->
    <div class="shrink-0 border-b border-border/50 px-5 pb-4 pt-5">
      <div class="flex items-center gap-3">
        <img :src="currentLogo" :alt="formData.provider" class="size-9 rounded-lg" />
        <div class="min-w-0 flex-1">
          <div class="truncate text-[15px] font-semibold text-foreground">
            {{ editingModel ? t('model.edit.editTitle') : t('model.edit.addTitle') }}
          </div>
          <div class="mt-0.5 text-xs text-muted-foreground">
            {{ formData.provider ? PROVIDER_LABELS[formData.provider] : t('model.edit.selectProvider') }}
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
        <!-- 供应商选择（下拉列表） -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('model.edit.provider') }}</label>
          <Select v-model="formData.provider" @update:model-value="handleProviderChange">
            <SelectTrigger class="w-full">
              <div v-if="formData.provider" class="flex items-center gap-2">
                <img :src="getProviderLogo(formData.provider)" :alt="PROVIDER_LABELS[formData.provider]" class="size-4 shrink-0 rounded" />
                <span>{{ PROVIDER_LABELS[formData.provider] }}</span>
              </div>
              <span v-else class="text-muted-foreground">{{ t('model.edit.selectProvider') }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="preset in PROVIDER_PRESETS"
                :key="preset.type"
                :value="preset.type"
              >
                <div class="flex items-center gap-2">
                  <img :src="getProviderLogo(preset.type)" :alt="preset.label" class="size-4 shrink-0 rounded" />
                  <span>{{ preset.label }}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- 模型别名 -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('model.edit.modelAlias') }} <span class="text-destructive">*</span></label>
          <Input v-model="formData.name" :placeholder="t('model.edit.modelAliasPlaceholder')" />
        </div>

        <!-- Base URL（只读，由供应商选择自动填充） -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('model.edit.baseUrl') }}</label>
          <Input :model-value="formData.base_url" readonly :placeholder="t('model.edit.baseUrlPlaceholder')" class="bg-muted/50 text-muted-foreground" />
          <p class="text-xs text-muted-foreground">{{ t('model.edit.baseUrlHint') }}</p>
        </div>

        <!-- API Key -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('model.edit.apiKey') }}</label>
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

        <!-- 模型名称（含预设快捷选择） -->
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('model.edit.modelName') }} <span class="text-destructive">*</span></label>
          <Input v-model="formData.model_name" :placeholder="t('model.edit.modelNamePlaceholder')" />
          <div v-if="presetModels.length > 0" class="flex flex-wrap gap-1.5">
            <button
              v-for="model in presetModels"
              :key="model.id"
              class="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-accent"
              :class="formData.model_name === model.id ? 'border-primary bg-primary/5 text-foreground' : 'text-muted-foreground'"
              @click="formData.model_name = model.id"
            >
              <img :src="getModelLogoById(model.id) || LOGO_DEFAULT" :alt="model.name" class="size-3.5 rounded-sm" />
              {{ model.name }}
            </button>
          </div>
        </div>

      </div>
    </div>

    <!-- 固定底部操作栏 -->
    <div class="flex shrink-0 items-center gap-2.5 border-t border-border bg-card px-5 py-3.5">
      <Button variant="outline" @click="close">{{ t('common.cancel') }}</Button>
      <Button :disabled="submitting" class="ml-auto" @click="handleSubmit">
        <Loader2 v-if="submitting" class="mr-1.5 size-4 animate-spin" />
        {{ submitting ? t('model.edit.submitting') : (editingModel ? t('model.edit.save') : t('model.edit.add')) }}
      </Button>
    </div>
  </aside>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { Eye, EyeOff, Loader2, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'
import {
  PROVIDER_PRESETS,
  PROVIDER_LABELS,
  PROVIDER_DEFAULT_URLS,
  PROVIDER_PRESET_MODELS,
  mapProviderToBackend,
  inferProviderType,
} from '@/utils/provider-presets'
import { getProviderLogo, getModelLogoById, LOGO_DEFAULT } from '@/utils/model-logo'

const { t } = useI18n()

defineProps({
  /** 编辑模式下传入已有记录，创建模式传 null */
  record: { type: Object, default: null },
})

const emit = defineEmits(['saved'])

const open = ref(false)
const submitting = ref(false)
const showApiKey = ref(false)
const editingModel = ref(null)

const formData = reactive({
  name: '',
  provider: 'openai',
  base_url: '',
  api_key: '',
  model_name: '',
  temperature: 0.7,
  max_tokens: 4096,
  remark: '',
})

/** 当前供应商 Logo */
const currentLogo = computed(() => getProviderLogo(formData.provider))

/** 当前供应商的预设模型列表 */
const presetModels = computed(() => PROVIDER_PRESET_MODELS[formData.provider] ?? [])

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
    // 编辑模式：从记录恢复，后端粗粒度类型 → 前端细粒度类型
    formData.name = record.name || ''
    formData.provider = inferProviderType(record.provider, record.base_url)
    formData.base_url = record.base_url || ''
    formData.api_key = record.api_key || ''
    formData.model_name = record.model_name || ''
    formData.temperature = record.temperature ?? 0.7
    formData.max_tokens = record.max_tokens ?? 4096
    formData.remark = record.remark || ''
  } else {
    // 新建模式：默认 OpenAI
    formData.name = ''
    formData.provider = 'openai'
    formData.base_url = PROVIDER_DEFAULT_URLS.openai
    formData.api_key = ''
    formData.model_name = ''
    formData.temperature = 0.7
    formData.max_tokens = 4096
    formData.remark = ''
  }
  open.value = true
}

/** 切换供应商时自动填充 Base URL 和名称 */
function handleProviderChange(type) {
  const prevLabel = editingModel.value ? null : PROVIDER_LABELS[formData.provider]
  formData.provider = type
  // 自动填充默认 Base URL（包含 custom 空值的情况）
  formData.base_url = PROVIDER_DEFAULT_URLS[type] || ''
  // 自动填充名称（仅新建模式且名称为空或为上一个供应商默认名时）
  if (!editingModel.value) {
    const trimmedName = formData.name.trim()
    if (!trimmedName || trimmedName === prevLabel) {
      formData.name = PROVIDER_LABELS[type]
    }
    // 自动选择第一个预设模型
    const models = PROVIDER_PRESET_MODELS[type]
    if (models.length > 0) {
      formData.model_name = models[0].id
    } else {
      formData.model_name = ''
    }
  }
}

async function handleSubmit() {
  if (!formData.name.trim()) { toast.error(t('model.edit.inputAlias')); return }
  if (!formData.model_name.trim()) { toast.error(t('model.edit.inputModelName')); return }

  submitting.value = true
  try {
    // 前端 ProviderType → 后端 LlmProvider 映射
    const backendProvider = mapProviderToBackend(formData.provider)
    const params = {
      name: formData.name,
      provider: backendProvider,
      base_url: formData.base_url,
      api_key: formData.api_key,
      model_name: formData.model_name,
      temperature: Number(formData.temperature),
      max_tokens: Number(formData.max_tokens),
      remark: formData.remark,
    }
    let res
    if (editingModel.value) {
      res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'update', id: editingModel.value.id, params })
    } else {
      res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'add', params })
    }
    if (res.code === 0) {
      toast.success(res.message || (editingModel.value ? t('model.edit.saveSuccess') : t('model.edit.addSuccess')))
      open.value = false
      emit('saved')
    } else {
      toast.error(res.message || t('model.edit.operationFailed'))
    }
  } catch (err) {
    toast.error('操作异常: ' + (err?.message || err))
  } finally {
    submitting.value = false
  }
}

defineExpose({ show })
</script>
