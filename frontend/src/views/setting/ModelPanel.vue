<template>
  <div class="mx-auto max-w-[640px]">
    <div class="mb-3 flex items-start justify-between">
      <div class="flex-1">
        <h3 class="flex items-center gap-2 text-base font-semibold text-foreground">
          <Bot class="size-5 text-primary" />
          语义模型配置
        </h3>
        <p class="mb-4 mt-1.5 text-xs leading-relaxed text-muted-foreground">配置大语言模型（LLM）用于智能问答与语义检索。同一时间只能启用一个模型。</p>
      </div>
      <Button @click="openAddModal">
        <Plus class="size-4" />
        添加模型
      </Button>
    </div>

    <!-- 当前启用模型状态 -->
    <div v-if="enabledModel" class="mb-3.5 flex items-center gap-2.5 rounded-lg border border-border bg-muted/50 p-2.5 shadow-sm">
      <Badge variant="default" class="gap-1">
        <CheckCircle2 class="size-3.5" />
        当前启用
      </Badge>
      <span class="text-sm font-semibold text-foreground">{{ enabledModel.name }}</span>
      <span class="text-[13px] text-muted-foreground">
        {{ providerLabel(enabledModel.provider) }} · {{ enabledModel.model_name }}
      </span>
    </div>
    <div v-else class="mb-3.5 flex items-center gap-2.5 rounded-lg border border-border bg-muted/50 p-2.5 shadow-sm">
      <Badge variant="secondary" class="gap-1">
        <AlertCircle class="size-3.5" />
        未启用
      </Badge>
      <span class="text-sm text-muted-foreground">尚未启用任何模型，请添加并启用一个模型</span>
    </div>

    <!-- 模型列表表格 -->
    <div class="overflow-hidden rounded-lg border border-border bg-card p-1 shadow-sm">
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
            <th class="px-3 py-2 text-left font-medium">API Key</th>
            <th class="px-3 py-2 text-left font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in list" :key="record.id" class="border-b hover:bg-muted/30">
            <td class="px-3 py-2">
              <Badge v-if="record.enabled === 1" variant="default" class="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">已启用</Badge>
              <Badge v-else variant="secondary">未启用</Badge>
            </td>
            <td class="px-3 py-2">{{ record.name }}</td>
            <td class="px-3 py-2">{{ providerLabel(record.provider) }}</td>
            <td class="px-3 py-2">{{ record.model_name }}</td>
            <td class="px-3 py-2 font-mono text-xs text-muted-foreground">{{ maskKey(record.api_key) }}</td>
            <td class="px-3 py-2">
              <div class="flex items-center gap-1">
                <Button v-if="record.enabled !== 1" variant="link" size="sm" @click="$emit('enable', record)">启用</Button>
                <Button v-else variant="link" size="sm" @click="$emit('disable', record)">禁用</Button>
                <Button variant="link" size="sm" :disabled="testingId === record.id" @click="$emit('test', record)">{{ testingId === record.id ? '测试中…' : '测试' }}</Button>
                <Button variant="link" size="sm" @click="openEditModal(record)">编辑</Button>
                <Button variant="link" size="sm" class="text-destructive" @click="$emit('delete', record)">删除</Button>
              </div>
            </td>
          </tr>
          <tr v-if="list.length === 0">
            <td colspan="6" class="py-8 text-center text-sm text-muted-foreground">暂无数据</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 模型添加/编辑弹窗 -->
    <Dialog v-model:open="modalVisible">
      <DialogContent class="max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{{ editingModel ? '编辑模型' : '添加模型' }}</DialogTitle>
        </DialogHeader>
        <div class="space-y-4 py-2">
          <div class="space-y-1.5">
            <label class="text-sm font-medium">模型别名 <span class="text-destructive">*</span></label>
            <Input v-model="formData.name" placeholder="如：我的GPT-4o、DeepSeek生产环境" />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium">接口提供商</label>
            <Select v-model="formData.provider">
              <SelectTrigger><SelectValue placeholder="选择提供商类型" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI 兼容（OpenAI / DeepSeek / Moonshot / Qwen 等）</SelectItem>
                <SelectItem value="anthropic">Anthropic Claude</SelectItem>
                <SelectItem value="google">Google Gemini</SelectItem>
                <SelectItem value="custom">自定义</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
          <div class="space-y-1.5">
            <label class="text-sm font-medium">API Key</label>
            <Input v-model="formData.api_key" type="password" placeholder="sk-..." autocomplete="new-password" />
          </div>
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
          <div class="space-y-1.5">
            <label class="text-sm font-medium">备注</label>
            <Textarea v-model="formData.remark" :rows="2" placeholder="可选，如：用于代码生成 / 用于文档总结" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="modalVisible = false">取消</Button>
          <Button :disabled="submitting" @click="handleSubmit">{{ submitting ? '提交中…' : '确定' }}</Button>
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
          <div v-if="testResult.success" class="mt-2 text-sm text-green-600">延迟：{{ testResult.latencyMs }}ms</div>
        </div>
        <DialogFooter>
          <Button @click="testResultVisible = false">关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { Bot, Plus, CheckCircle2, AlertCircle } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'

defineEmits(['enable', 'disable', 'test', 'delete'])

const loading = ref(false)
const submitting = ref(false)
const testingId = ref(null)
const modalVisible = ref(false)
const testResultVisible = ref(false)
const editingModel = ref(null)
const list = ref([])
const testResult = ref(null)

const enabledModel = computed(() => list.value.find((m) => m.enabled === 1) || null)

const formData = reactive({
  name: '', provider: 'openai', base_url: '', api_key: '',
  model_name: '', temperature: 0.7, max_tokens: 4096, remark: '',
})

onMounted(fetchModels)

async function fetchModels() {
  loading.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'list' })
    if (res.code === 0) list.value = res.data || []
    else toast.error(res.message || '获取模型列表失败')
  } catch (err) {
    toast.error('获取模型列表异常: ' + (err?.message || err))
  } finally {
    loading.value = false
  }
}

function providerLabel(provider) {
  const map = { openai: 'OpenAI 兼容', anthropic: 'Anthropic', google: 'Google', custom: '自定义' }
  return map[provider] || provider
}

function maskKey(key) {
  if (!key) return '(未设置)'
  if (key.length <= 8) return '****'
  return key.substring(0, 4) + '****' + key.substring(key.length - 4)
}

function openAddModal() {
  editingModel.value = null
  Object.assign(formData, {
    name: '', provider: 'openai', base_url: '', api_key: '',
    model_name: '', temperature: 0.7, max_tokens: 4096, remark: '',
  })
  modalVisible.value = true
}

function openEditModal(record) {
  editingModel.value = record
  Object.assign(formData, {
    name: record.name, provider: record.provider, base_url: record.base_url,
    api_key: record.api_key, model_name: record.model_name,
    temperature: record.temperature, max_tokens: record.max_tokens, remark: record.remark || '',
  })
  modalVisible.value = true
}

async function handleSubmit() {
  if (!formData.name.trim()) { toast.error('请输入模型别名'); return }
  if (!formData.model_name.trim()) { toast.error('请输入模型名称'); return }
  submitting.value = true
  try {
    const params = {
      name: formData.name, provider: formData.provider, base_url: formData.base_url,
      api_key: formData.api_key, model_name: formData.model_name,
      temperature: Number(formData.temperature), max_tokens: Number(formData.max_tokens),
      remark: formData.remark,
    }
    let res
    if (editingModel.value) {
      res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'update', id: editingModel.value.id, params })
    } else {
      res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'add', params })
    }
    if (res.code === 0) {
      toast.success(res.message || (editingModel.value ? '更新成功' : '添加成功'))
      modalVisible.value = false
      fetchModels()
    } else {
      toast.error(res.message || '操作失败')
    }
  } catch (err) {
    toast.error('操作异常: ' + (err?.message || err))
  } finally {
    submitting.value = false
  }
}

/** 暴露方法供父组件调用 */
defineExpose({
  refresh: fetchModels,
  showTestResult: (result) => {
    testResult.value = result
    testResultVisible.value = true
  },
  setTestingId: (id) => { testingId.value = id },
})
</script>
