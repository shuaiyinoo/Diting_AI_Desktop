<template>
  <div class="relative mx-auto flex h-full w-full max-w-[640px] flex-col">
    <!-- 顶部标题栏 -->
    <div class="mb-4 flex items-start justify-between px-1">
      <div class="flex-1">
        <h3 class="flex items-center gap-2 text-base font-semibold text-foreground">
          <Bot class="size-5 text-primary" />
          语义模型配置
        </h3>
        <p class="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          配置大语言模型（LLM）用于智能问答与语义检索。同一时间只能启用一个模型。
        </p>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" size="sm" class="h-8 gap-1.5 px-3.5 text-[13px]" @click="handleAddCloud">
          <Cloud class="size-4" />
          Diting Cloud 模型
          <span class="ml-1 rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">BETA</span>
        </Button>
        <Button size="sm" class="h-8 gap-1.5 px-3.5 text-[13px]" @click="handleAdd">
          <Plus class="size-4" />
          添加官方模型
        </Button>
      </div>
    </div>

    <!-- 当前启用模型状态 -->
    <div
      v-if="enabledModel"
      class="mb-4 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3"
    >
      <img :src="getModelLogo(enabledModel.model_name, inferProviderType(enabledModel.provider, enabledModel.base_url))" :alt="enabledModel.name" class="size-8 rounded-lg" />
      <div class="flex flex-1 items-center gap-2">
        <Badge variant="default" class="gap-1">
          <CheckCircle2 class="size-3" />
          当前启用
        </Badge>
        <span class="text-sm font-semibold text-foreground">{{ enabledModel.name }}</span>
        <span class="text-xs text-muted-foreground">{{ enabledModel.model_name }}</span>
      </div>
    </div>
    <div
      v-else
      class="mb-4 flex items-center gap-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900 dark:bg-yellow-950/50"
    >
      <div class="flex flex-1 items-center gap-2">
        <Badge variant="secondary" class="gap-1">
          <AlertCircle class="size-3" />
          未启用
        </Badge>
        <span class="text-sm text-muted-foreground">尚未启用任何模型，请添加并启用一个模型</span>
      </div>
    </div>

    <!-- 加载中 -->
    <div v-if="loading" class="flex items-center justify-center py-16">
      <Spinner class="size-5 text-muted-foreground" />
      <span class="ml-2 text-sm text-muted-foreground">加载中…</span>
    </div>

    <!-- 模型卡片列表 -->
    <div v-else-if="list.length > 0" class="grid grid-cols-2 gap-3">
      <div
        v-for="record in list"
        :key="record.id"
        class="group cursor-pointer rounded-lg border bg-card p-3.5 shadow-sm transition-all hover:shadow-md hover:border-primary/30"
        :class="record.enabled === 1 ? 'border-primary/40' : 'border-border'"
        @click="handleEdit(record)"
      >
        <!-- 卡片头部：Logo + 名称 + 状态 -->
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
            启用
          </Badge>
          <Badge v-else variant="secondary" class="shrink-0">未启用</Badge>
        </div>

        <!-- 卡片中部：供应商 + URL -->
        <div class="mb-2.5 space-y-1">
          <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe class="size-3 shrink-0" />
            <span class="truncate" :title="record.base_url">{{ record.base_url || '(未设置)' }}</span>
          </div>
          <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Key class="size-3 shrink-0" />
            <span class="font-mono">{{ maskKey(record.api_key) }}</span>
          </div>
        </div>

        <!-- 卡片底部：操作按钮（阻止冒泡） -->
        <div class="flex items-center gap-1 border-t border-border pt-2.5" @click.stop>
          <Button
            v-if="record.enabled !== 1"
            variant="link"
            size="sm"
            class="h-7 px-2 text-xs"
            @click="handleEnable(record)"
          >
            启用
          </Button>
          <Button
            v-else
            variant="link"
            size="sm"
            class="h-7 px-2 text-xs"
            @click="handleDisable(record)"
          >
            禁用
          </Button>
          <Button
            variant="link"
            size="sm"
            class="h-7 px-2 text-xs"
            :disabled="testingId === record.id"
            @click="handleTest(record)"
          >
            <Loader2 v-if="testingId === record.id" class="mr-1 size-3 animate-spin" />
            {{ testingId === record.id ? '测试中' : '测试' }}
          </Button>
          <Button
            variant="link"
            size="sm"
            class="h-7 px-2 text-xs text-destructive hover:text-destructive"
            @click="handleDelete(record)"
          >
            删除
          </Button>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else class="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
      <Bot class="mb-3 size-10 text-muted-foreground/50" />
      <p class="text-sm text-muted-foreground">还没有配置任何模型</p>
      <Button variant="outline" size="sm" class="mt-3" @click="handleAdd">
        <Plus class="mr-1 size-4" />
        添加第一个模型
      </Button>
    </div>

    <!-- 编辑/新增弹窗 -->
    <ModelEditDialog ref="editDialogRef" @saved="fetchModels" />

    <!-- 测试结果弹窗 -->
    <ModelTestDialog ref="testDialogRef" />

    <!-- 删除确认弹窗 -->
    <AlertDialog v-model:open="deleteDialogOpen">
      <AlertDialogContent class="max-w-[400px]">
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除</AlertDialogTitle>
          <AlertDialogDescription>
            确定删除模型「{{ deleteTarget?.name }}」吗？此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction class="bg-destructive text-destructive-foreground hover:bg-destructive/90" @click="confirmDelete">
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { Bot, Plus, CheckCircle2, AlertCircle, Globe, Key, Loader2, Cloud } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
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
import { inferProviderType } from '@/utils/provider-presets'
import { getModelLogo } from '@/utils/model-logo'
import ModelEditDialog from './ModelEditDialog.vue'
import ModelTestDialog from './ModelTestDialog.vue'

defineEmits(['enable', 'disable', 'test', 'delete'])

const loading = ref(false)
const testingId = ref(null)
const list = ref([])
const editDialogRef = ref(null)
const testDialogRef = ref(null)
const deleteDialogOpen = ref(false)
const deleteTarget = ref(null)

const enabledModel = computed(() => list.value.find((m) => m.enabled === 1) || null)

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

function maskKey(key) {
  if (!key) return '(未设置)'
  if (key.length <= 8) return '****'
  return key.substring(0, 4) + '****' + key.substring(key.length - 4)
}

function handleAdd() {
  editDialogRef.value?.show(null)
}

function handleAddCloud() {
  toast.info('Diting Cloud 模型功能即将上线，敬请期待')
}

function handleEdit(record) {
  editDialogRef.value?.show(record)
}

async function handleEnable(record) {
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'enable', id: record.id })
    if (res.code === 0) {
      toast.success(`已启用: ${record.name}`)
      fetchModels()
    } else {
      toast.error(res.message || '启用失败')
    }
  } catch (err) {
    toast.error('启用异常: ' + (err?.message || err))
  }
}

async function handleDisable(record) {
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'disable', id: record.id })
    if (res.code === 0) {
      toast.success(`已禁用: ${record.name}`)
      fetchModels()
    } else {
      toast.error(res.message || '禁用失败')
    }
  } catch (err) {
    toast.error('禁用异常: ' + (err?.message || err))
  }
}

function handleDelete(record) {
  deleteTarget.value = record
  deleteDialogOpen.value = true
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  const record = deleteTarget.value
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'delete', id: record.id })
    if (res.code === 0) {
      toast.success('删除成功')
      fetchModels()
    } else {
      toast.error(res.message || '删除失败')
    }
  } catch (err) {
    toast.error('删除异常: ' + (err?.message || err))
  } finally {
    deleteTarget.value = null
  }
}

async function handleTest(record) {
  testingId.value = record.id
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'test', id: record.id })
    if (res.code === 0 && res.testResult) {
      testDialogRef.value?.show(res.testResult)
    } else {
      toast.error(res.message || '测试失败')
    }
  } catch (err) {
    toast.error('测试异常: ' + (err?.message || err))
  } finally {
    testingId.value = null
  }
}

/** 暴露方法供父组件调用 */
defineExpose({
  refresh: fetchModels,
  showTestResult: (result) => {
    testDialogRef.value?.show(result)
  },
  setTestingId: (id) => { testingId.value = id },
})
</script>
