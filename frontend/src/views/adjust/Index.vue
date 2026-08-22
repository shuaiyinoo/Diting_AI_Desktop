<template>
  <div class="llm-model-page space-y-4 p-4">
    <!-- 顶部说明 -->
    <Card class="p-4">
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <h2 class="mb-1.5 flex items-center gap-2 text-lg font-semibold">
            <Bot class="text-primary" />
            {{ t('adjustPage.pageTitle') }}
          </h2>
          <p class="m-0 text-sm text-muted-foreground">
            {{ t('adjustPage.pageDesc') }}
          </p>
        </div>
        <Button @click="openAddModal">
          <Plus class="mr-1 size-4" />
          {{ t('adjustPage.addModel') }}
        </Button>
      </div>

      <!-- 当前启用模型状态 -->
      <div v-if="enabledModel" class="mt-3.5 flex items-center gap-2.5 rounded-md border border-green-200 bg-green-50 px-3.5 py-2.5 dark:border-green-900 dark:bg-green-950">
        <Badge variant="success" class="gap-1">
          <CheckCircle2 class="size-3.5" />
          {{ t('adjustPage.currentEnabled') }}
        </Badge>
        <span class="text-sm font-semibold">{{ enabledModel.name }}</span>
        <span class="text-xs text-muted-foreground">
          {{ providerLabel(enabledModel.provider) }} · {{ enabledModel.model_name }}
        </span>
      </div>
      <div v-else class="mt-3.5 flex items-center gap-2.5 rounded-md border border-yellow-200 bg-yellow-50 px-3.5 py-2.5 dark:border-yellow-900 dark:bg-yellow-950">
        <Badge variant="secondary">
          <AlertCircle class="mr-1 size-3.5" />
          {{ t('adjustPage.disabled') }}
        </Badge>
        <span class="text-sm text-muted-foreground">{{ t('adjustPage.notEnabledHint') }}</span>
      </div>
    </Card>

    <!-- 模型列表表格 -->
    <Card class="p-0">
      <div v-if="loading" class="flex items-center justify-center py-12">
        <Spinner class="size-5 text-muted-foreground" />
        <span class="ml-2 text-sm text-muted-foreground">{{ t('adjustPage.loading') }}</span>
      </div>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="border-b bg-muted/50">
<th class="px-3 py-2 text-left font-medium">{{ t('adjustPage.colStatus') }}</th>
<th class="px-3 py-2 text-left font-medium">{{ t('adjustPage.colAlias') }}</th>
            <th class="px-3 py-2 text-left font-medium">{{ t('adjustPage.provider') }}</th>
            <th class="px-3 py-2 text-left font-medium">{{ t('adjustPage.modelName') }}</th>
            <th class="px-3 py-2 text-left font-medium">{{ t('adjustPage.apiUrl') }}</th>
            <th class="px-3 py-2 text-left font-medium">{{ t('adjustPage.apiKey') }}</th>
            <th class="px-3 py-2 text-left font-medium">{{ t('adjustPage.temperature') }}</th>
            <th class="px-3 py-2 text-left font-medium">{{ t('adjustPage.action') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in modelList" :key="record.id" class="border-b hover:bg-muted/30">
            <td class="px-3 py-2">
              <Badge v-if="record.enabled === 1" variant="success">{{ t('adjustPage.enabled') }}</Badge>
              <Badge v-else variant="secondary">{{ t('adjustPage.disabled') }}</Badge>
            </td>
            <td class="px-3 py-2">{{ record.name }}</td>
            <td class="px-3 py-2">{{ providerLabel(record.provider) }}</td>
            <td class="px-3 py-2">{{ record.model_name }}</td>
            <td class="max-w-[200px] truncate px-3 py-2 text-muted-foreground" :title="record.base_url">
              {{ record.base_url || t('adjustPage.notSet') }}
            </td>
            <td class="px-3 py-2 font-mono text-xs text-muted-foreground">{{ maskKey(record.api_key) }}</td>
            <td class="px-3 py-2">{{ record.temperature }}</td>
            <td class="px-3 py-2">
              <div class="flex items-center gap-1">
                <Button v-if="record.enabled !== 1" variant="link" size="sm" @click="handleEnable(record)">{{ t('adjustPage.enable') }}</Button>
                <Button v-else variant="link" size="sm" @click="handleDisable(record)">{{ t('adjustPage.disable') }}</Button>
                <Button variant="link" size="sm" :disabled="testingId === record.id" @click="handleTest(record)">
                  {{ testingId === record.id ? t('adjustPage.testing') : t('adjustPage.test') }}
                </Button>
                <Button variant="link" size="sm" @click="openEditModal(record)">{{ t('adjustPage.edit') }}</Button>
                <Button variant="link" size="sm" class="text-destructive" @click="handleDelete(record)">{{ t('adjustPage.delete') }}</Button>
              </div>
            </td>
          </tr>
          <tr v-if="modelList.length === 0">
            <td colspan="8" class="py-8 text-center text-sm text-muted-foreground">{{ t('adjustPage.noData') }}</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <!-- 添加/编辑模型弹窗 -->
    <Dialog v-model:open="modalVisible">
      <DialogContent class="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{{ editingModel ? t('adjustPage.edit') : t('adjustPage.addModel') }}</DialogTitle>
        </DialogHeader>

        <div class="space-y-4 py-2">
          <!-- 模型别名 -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('adjustPage.modelAlias') }} <span class="text-destructive">*</span></label>
            <Input v-model="formData.name" :placeholder="t('adjustPage.namePlaceholder')" />
          </div>

          <!-- 接口提供商 -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('adjustPage.provider') }}</label>
            <Select v-model="formData.provider">
              <SelectTrigger>
                <SelectValue :placeholder="t('adjustPage.selectProvider')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">{{ t('adjustPage.providerOpenai') }}</SelectItem>
                <SelectItem value="anthropic">{{ t('adjustPage.providerAnthropic') }}</SelectItem>
                <SelectItem value="google">{{ t('adjustPage.providerGoogle') }}</SelectItem>
                <SelectItem value="custom">{{ t('adjustPage.providerCustom') }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- API 地址 -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('adjustPage.baseUrlLabel') }}</label>
            <Input v-model="formData.base_url" :placeholder="t('adjustPage.baseUrlPlaceholder')" />
            <div class="flex flex-wrap gap-1">
              <Button variant="link" size="sm" @click="formData.base_url = 'https://api.openai.com/v1'">OpenAI</Button>
              <Button variant="link" size="sm" @click="formData.base_url = 'https://api.deepseek.com/v1'">DeepSeek</Button>
              <Button variant="link" size="sm" @click="formData.base_url = 'https://api.moonshot.cn/v1'">Moonshot</Button>
              <Button variant="link" size="sm" @click="formData.base_url = 'https://dashscope.aliyuncs.com/compatible-mode/v1'">{{ t('adjustPage.qwen') }}</Button>
              <Button variant="link" size="sm" @click="formData.base_url = 'https://api.siliconflow.cn/v1'">{{ t('adjustPage.siliconFlow') }}</Button>
            </div>
            <p class="text-xs text-muted-foreground">{{ t('adjustPage.baseUrlHint') }}</p>
          </div>

          <!-- API Key -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('adjustPage.apiKey') }}</label>
            <Input v-model="formData.api_key" type="password" :placeholder="t('adjustPage.apiKeyPlaceholder')" autocomplete="new-password" />
          </div>

          <!-- 模型名称 -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('adjustPage.modelName') }} <span class="text-destructive">*</span></label>
            <Input v-model="formData.model_name" :placeholder="t('adjustPage.modelNamePlaceholder')" />
            <div class="flex flex-wrap gap-1">
              <Button variant="link" size="sm" @click="formData.model_name = 'gpt-4o'">gpt-4o</Button>
              <Button variant="link" size="sm" @click="formData.model_name = 'gpt-4o-mini'">gpt-4o-mini</Button>
              <Button variant="link" size="sm" @click="formData.model_name = 'deepseek-chat'">deepseek-chat</Button>
              <Button variant="link" size="sm" @click="formData.model_name = 'deepseek-reasoner'">deepseek-reasoner</Button>
              <Button variant="link" size="sm" @click="formData.model_name = 'moonshot-v1-8k'">moonshot-v1-8k</Button>
              <Button variant="link" size="sm" @click="formData.model_name = 'qwen-plus'">qwen-plus</Button>
            </div>
          </div>

          <!-- 温度 + 最大 Token -->
          <div class="flex gap-4">
            <div class="flex-1 space-y-1.5">
              <label class="text-sm font-medium">{{ t('adjustPage.temperature') }}</label>
              <Input v-model="formData.temperature" type="number" :min="0" :max="2" :step="0.1" />
              <p class="text-xs text-muted-foreground">{{ t('adjustPage.temperatureHint') }}</p>
            </div>
            <div class="flex-1 space-y-1.5">
              <label class="text-sm font-medium">{{ t('adjustPage.maxTokens') }}</label>
              <Input v-model="formData.max_tokens" type="number" :min="1" :max="128000" :step="256" />
              <p class="text-xs text-muted-foreground">{{ t('adjustPage.defaultTokens') }}</p>
            </div>
          </div>

          <!-- 备注 -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('adjustPage.remark') }}</label>
            <Textarea v-model="formData.remark" :rows="2" :placeholder="t('adjustPage.remarkPlaceholder')" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="modalVisible = false">{{ t('adjustPage.cancel') }}</Button>
          <Button :disabled="submitting" @click="handleSubmit">
            {{ submitting ? t('adjustPage.submitting') : t('adjustPage.submit') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 测试结果弹窗 -->
    <Dialog v-model:open="testResultVisible">
      <DialogContent class="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{{ t('adjustPage.testResultTitle') }}</DialogTitle>
        </DialogHeader>
        <div v-if="testResult" class="py-4 text-center">
          <div class="mb-2 flex items-center justify-center gap-2 text-lg font-semibold" :class="testResult.success ? 'text-green-600' : 'text-red-600'">
            <CheckCircle2 v-if="testResult.success" class="size-5" />
            <AlertCircle v-else class="size-5" />
            {{ testResult.success ? t('adjustPage.connectSuccess') : t('adjustPage.connectFailed') }}
          </div>
          <p class="text-sm text-muted-foreground">{{ testResult.message }}</p>
          <div v-if="testResult.success" class="mt-2 text-sm text-green-600">
            {{ t('adjustPage.latency', { ms: testResult.latencyMs }) }}
          </div>
        </div>
        <DialogFooter>
          <Button @click="testResultVisible = false">{{ t('adjustPage.close') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup>
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'

import { ref, reactive, onMounted } from 'vue';
import { toast } from 'vue-sonner';
import { AlertCircle, Bot, CheckCircle2, Plus } from '@lucide/vue';
import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';
import { useI18n } from 'vue-i18n'


const { t } = useI18n()
const loading = ref(false);
const submitting = ref(false);
const testingId = ref(null);
const modalVisible = ref(false);
const testResultVisible = ref(false);
const editingModel = ref(null);
const modelList = ref([]);
const enabledModel = ref(null);
const testResult = ref(null);

const formData = reactive({
  name: '',
  provider: 'openai',
  base_url: '',
  api_key: '',
  model_name: '',
  temperature: 0.7,
  max_tokens: 4096,
  remark: '',
});

function providerLabel(provider) {
  const map = {
    openai: 'OpenAI 兼容',
    anthropic: 'Anthropic',
    google: 'Google',
    custom: '自定义',
  };
  return map[provider] || provider;
}

function maskKey(key) {
  if (!key) return '(未设置)';
  if (key.length <= 8) return '****';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}

onMounted(() => {
  fetchModels();
});

async function fetchModels() {
  loading.value = true;
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'list' });
    if (res.code === 0) {
      modelList.value = res.data || [];
      enabledModel.value = modelList.value.find(m => m.enabled === 1) || null;
    } else {
      toast.error(res.message || t('adjustPage.fetchFailed'));
    }
  } catch (err) {
    toast.error(t('adjustPage.fetchError', { msg: err?.message || err }));
  } finally {
    loading.value = false;
  }
}

function openAddModal() {
  editingModel.value = null;
  Object.assign(formData, {
    name: '', provider: 'openai', base_url: '', api_key: '',
    model_name: '', temperature: 0.7, max_tokens: 4096, remark: '',
  });
  modalVisible.value = true;
}

function openEditModal(record) {
  editingModel.value = record;
  Object.assign(formData, {
    name: record.name, provider: record.provider, base_url: record.base_url,
    api_key: record.api_key, model_name: record.model_name,
    temperature: record.temperature, max_tokens: record.max_tokens, remark: record.remark || '',
  });
  modalVisible.value = true;
}

async function handleSubmit() {
  if (!formData.name.trim()) { toast.error(t('adjustPage.nameRequired')); return; }
  if (!formData.model_name.trim()) { toast.error(t('adjustPage.modelNameRequired')); return; }

  submitting.value = true;
  try {
    const params = {
      name: formData.name, provider: formData.provider, base_url: formData.base_url,
      api_key: formData.api_key, model_name: formData.model_name,
      temperature: Number(formData.temperature), max_tokens: Number(formData.max_tokens),
      remark: formData.remark,
    };
    let res;
    if (editingModel.value) {
      res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'update', id: editingModel.value.id, params });
    } else {
      res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'add', params });
    }
    if (res.code === 0) {
      toast.success(res.message || (editingModel.value ? t('adjustPage.updateSuccess') : t('adjustPage.addSuccess')));
      modalVisible.value = false;
      fetchModels();
    } else {
      toast.error(res.message || t('adjustPage.operationFailed'));
    }
  } catch (err) {
    toast.error(t('adjustPage.operationError', { msg: err?.message || err }));
  } finally {
    submitting.value = false;
  }
}

async function handleEnable(record) {
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'enable', id: record.id });
    if (res.code === 0) { toast.success(t('adjustPage.enabledToast', { name: record.name })); fetchModels(); }
    else { toast.error(res.message || t('adjustPage.enableFailed')); }
  } catch (err) { toast.error(t('adjustPage.enableError', { msg: err?.message || err })); }
}

async function handleDisable(record) {
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'disable', id: record.id });
    if (res.code === 0) { toast.success(t('adjustPage.disabledToast', { name: record.name })); fetchModels(); }
    else { toast.error(res.message || t('adjustPage.disableFailed')); }
  } catch (err) { toast.error(t('adjustPage.disableError', { msg: err?.message || err })); }
}

async function handleDelete(record) {
  if (!window.confirm(`确定删除模型「${record.name}」吗？`)) return;
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'delete', id: record.id });
    if (res.code === 0) { toast.success(t('adjustPage.deleteSuccess')); fetchModels(); }
    else { toast.error(res.message || t('adjustPage.deleteFailed')); }
  } catch (err) { toast.error(t('adjustPage.deleteError', { msg: err?.message || err })); }
}

async function handleTest(record) {
  testingId.value = record.id;
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'test', id: record.id });
    if (res.code === 0 && res.testResult) {
      testResult.value = res.testResult;
      testResultVisible.value = true;
    } else {
      toast.error(res.message || t('adjustPage.testFailed'));
    }
  } catch (err) {
    toast.error(t('adjustPage.testError', { msg: err?.message || err }));
  } finally {
    testingId.value = null;
  }
}
</script>
