<template>
  <div class="llm-model-page space-y-4 p-4">
    <!-- 顶部说明 -->
    <Card class="p-4">
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <h2 class="mb-1.5 flex items-center gap-2 text-lg font-semibold">
            <Bot class="text-primary" />
            语义模型配置
          </h2>
          <p class="m-0 text-sm text-muted-foreground">
            配置大语言模型（LLM）用于智能问答与语义检索。同一时间只能启用一个模型。
          </p>
        </div>
        <Button @click="openAddModal">
          <Plus class="mr-1 size-4" />
          添加模型
        </Button>
      </div>

      <!-- 当前启用模型状态 -->
      <div v-if="enabledModel" class="mt-3.5 flex items-center gap-2.5 rounded-md border border-green-200 bg-green-50 px-3.5 py-2.5 dark:border-green-900 dark:bg-green-950">
        <Badge variant="success" class="gap-1">
          <CheckCircle2 class="size-3.5" />
          当前启用
        </Badge>
        <span class="text-sm font-semibold">{{ enabledModel.name }}</span>
        <span class="text-xs text-muted-foreground">
          {{ providerLabel(enabledModel.provider) }} · {{ enabledModel.model_name }}
        </span>
      </div>
      <div v-else class="mt-3.5 flex items-center gap-2.5 rounded-md border border-yellow-200 bg-yellow-50 px-3.5 py-2.5 dark:border-yellow-900 dark:bg-yellow-950">
        <Badge variant="secondary">
          <AlertCircle class="mr-1 size-3.5" />
          未启用
        </Badge>
        <span class="text-sm text-muted-foreground">尚未启用任何模型，请添加并启用一个模型</span>
      </div>
    </Card>

    <!-- 模型列表表格 -->
    <Card class="p-0">
      <div v-if="loading" class="flex items-center justify-center py-12">
        <Spinner class="size-5 text-muted-foreground" />
        <span class="ml-2 text-sm text-muted-foreground">加载中…</span>
      </div>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="border-b bg-muted/50">
            <th class="px-3 py-2 text-left font-medium">状态</th>
            <th class="px-3 py-2 text-left font-medium">别名</th>
            <th class="px-3 py-2 text-left font-medium">提供商</th>
            <th class="px-3 py-2 text-left font-medium">模型名称</th>
            <th class="px-3 py-2 text-left font-medium">API 地址</th>
            <th class="px-3 py-2 text-left font-medium">API Key</th>
            <th class="px-3 py-2 text-left font-medium">温度</th>
            <th class="px-3 py-2 text-left font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in modelList" :key="record.id" class="border-b hover:bg-muted/30">
            <td class="px-3 py-2">
              <Badge v-if="record.enabled === 1" variant="success">已启用</Badge>
              <Badge v-else variant="secondary">未启用</Badge>
            </td>
            <td class="px-3 py-2">{{ record.name }}</td>
            <td class="px-3 py-2">{{ providerLabel(record.provider) }}</td>
            <td class="px-3 py-2">{{ record.model_name }}</td>
            <td class="max-w-[200px] truncate px-3 py-2 text-muted-foreground" :title="record.base_url">
              {{ record.base_url || '(未设置)' }}
            </td>
            <td class="px-3 py-2 font-mono text-xs text-muted-foreground">{{ maskKey(record.api_key) }}</td>
            <td class="px-3 py-2">{{ record.temperature }}</td>
            <td class="px-3 py-2">
              <div class="flex items-center gap-1">
                <Button v-if="record.enabled !== 1" variant="link" size="sm" @click="handleEnable(record)">启用</Button>
                <Button v-else variant="link" size="sm" @click="handleDisable(record)">禁用</Button>
                <Button variant="link" size="sm" :disabled="testingId === record.id" @click="handleTest(record)">
                  {{ testingId === record.id ? '测试中…' : '测试' }}
                </Button>
                <Button variant="link" size="sm" @click="openEditModal(record)">编辑</Button>
                <Button variant="link" size="sm" class="text-destructive" @click="handleDelete(record)">删除</Button>
              </div>
            </td>
          </tr>
          <tr v-if="modelList.length === 0">
            <td colspan="8" class="py-8 text-center text-sm text-muted-foreground">暂无数据</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <!-- 添加/编辑模型弹窗 -->
    <Dialog v-model:open="modalVisible">
      <DialogContent class="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{{ editingModel ? '编辑模型' : '添加模型' }}</DialogTitle>
        </DialogHeader>

        <div class="space-y-4 py-2">
          <!-- 模型别名 -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium">模型别名 <span class="text-destructive">*</span></label>
            <Input v-model="formData.name" placeholder="如：我的GPT-4o、DeepSeek生产环境" />
          </div>

          <!-- 接口提供商 -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium">接口提供商</label>
            <Select v-model="formData.provider">
              <SelectTrigger>
                <SelectValue placeholder="选择提供商类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI 兼容（OpenAI / DeepSeek / Moonshot / Qwen 等）</SelectItem>
                <SelectItem value="anthropic">Anthropic Claude</SelectItem>
                <SelectItem value="google">Google Gemini</SelectItem>
                <SelectItem value="custom">自定义</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- API 地址 -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium">API 地址 (Base URL)</label>
            <Input v-model="formData.base_url" placeholder="如：https://api.openai.com/v1" />
            <div class="flex flex-wrap gap-1">
              <Button variant="link" size="sm" @click="formData.base_url = 'https://api.openai.com/v1'">OpenAI</Button>
              <Button variant="link" size="sm" @click="formData.base_url = 'https://api.deepseek.com/v1'">DeepSeek</Button>
              <Button variant="link" size="sm" @click="formData.base_url = 'https://api.moonshot.cn/v1'">Moonshot</Button>
              <Button variant="link" size="sm" @click="formData.base_url = 'https://dashscope.aliyuncs.com/compatible-mode/v1'">通义千问</Button>
              <Button variant="link" size="sm" @click="formData.base_url = 'https://api.siliconflow.cn/v1'">硅基流动</Button>
            </div>
            <p class="text-xs text-muted-foreground">不含 /chat/completions 后缀</p>
          </div>

          <!-- API Key -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium">API Key</label>
            <Input v-model="formData.api_key" type="password" placeholder="sk-..." autocomplete="new-password" />
          </div>

          <!-- 模型名称 -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium">模型名称 <span class="text-destructive">*</span></label>
            <Input v-model="formData.model_name" placeholder="如：gpt-4o、deepseek-chat、claude-3-5-sonnet-20241022" />
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
              <label class="text-sm font-medium">温度 (Temperature)</label>
              <Input v-model="formData.temperature" type="number" :min="0" :max="2" :step="0.1" />
              <p class="text-xs text-muted-foreground">0=精确，2=创造性，默认 0.7</p>
            </div>
            <div class="flex-1 space-y-1.5">
              <label class="text-sm font-medium">最大输出 Token</label>
              <Input v-model="formData.max_tokens" type="number" :min="1" :max="128000" :step="256" />
              <p class="text-xs text-muted-foreground">默认 4096</p>
            </div>
          </div>

          <!-- 备注 -->
          <div class="space-y-1.5">
            <label class="text-sm font-medium">备注</label>
            <Textarea v-model="formData.remark" :rows="2" placeholder="可选，如：用于代码生成 / 用于文档总结" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="modalVisible = false">取消</Button>
          <Button :disabled="submitting" @click="handleSubmit">
            {{ submitting ? '提交中…' : '确定' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 测试结果弹窗 -->
    <Dialog v-model:open="testResultVisible">
      <DialogContent class="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>连通性测试结果</DialogTitle>
        </DialogHeader>
        <div v-if="testResult" class="py-4 text-center">
          <div class="mb-2 flex items-center justify-center gap-2 text-lg font-semibold" :class="testResult.success ? 'text-green-600' : 'text-red-600'">
            <CheckCircle2 v-if="testResult.success" class="size-5" />
            <AlertCircle v-else class="size-5" />
            {{ testResult.success ? '连接成功' : '连接失败' }}
          </div>
          <p class="text-sm text-muted-foreground">{{ testResult.message }}</p>
          <div v-if="testResult.success" class="mt-2 text-sm text-green-600">
            延迟：{{ testResult.latencyMs }}ms
          </div>
        </div>
        <DialogFooter>
          <Button @click="testResultVisible = false">关闭</Button>
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
      toast.error(res.message || '获取模型列表失败');
    }
  } catch (err) {
    toast.error('获取模型列表异常: ' + (err?.message || err));
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
  if (!formData.name.trim()) { toast.error('请输入模型别名'); return; }
  if (!formData.model_name.trim()) { toast.error('请输入模型名称'); return; }

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
      toast.success(res.message || (editingModel.value ? '更新成功' : '添加成功'));
      modalVisible.value = false;
      fetchModels();
    } else {
      toast.error(res.message || '操作失败');
    }
  } catch (err) {
    toast.error('操作异常: ' + (err?.message || err));
  } finally {
    submitting.value = false;
  }
}

async function handleEnable(record) {
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'enable', id: record.id });
    if (res.code === 0) { toast.success(`已启用: ${record.name}`); fetchModels(); }
    else { toast.error(res.message || '启用失败'); }
  } catch (err) { toast.error('启用异常: ' + (err?.message || err)); }
}

async function handleDisable(record) {
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'disable', id: record.id });
    if (res.code === 0) { toast.success(`已禁用: ${record.name}`); fetchModels(); }
    else { toast.error(res.message || '禁用失败'); }
  } catch (err) { toast.error('禁用异常: ' + (err?.message || err)); }
}

async function handleDelete(record) {
  if (!window.confirm(`确定删除模型「${record.name}」吗？`)) return;
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'delete', id: record.id });
    if (res.code === 0) { toast.success('删除成功'); fetchModels(); }
    else { toast.error(res.message || '删除失败'); }
  } catch (err) { toast.error('删除异常: ' + (err?.message || err)); }
}

async function handleTest(record) {
  testingId.value = record.id;
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'test', id: record.id });
    if (res.code === 0 && res.testResult) {
      testResult.value = res.testResult;
      testResultVisible.value = true;
    } else {
      toast.error(res.message || '测试失败');
    }
  } catch (err) {
    toast.error('测试异常: ' + (err?.message || err));
  } finally {
    testingId.value = null;
  }
}
</script>
