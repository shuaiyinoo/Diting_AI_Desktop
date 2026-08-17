<template>
  <div class="flex flex-col gap-3">
    <!-- 加载中 -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <Spinner class="size-5 text-muted-foreground" />
      <span class="ml-2 text-sm text-muted-foreground">加载中…</span>
    </div>

    <template v-else>
      <!-- Bot 列表 -->
      <div
        v-for="bot in bots"
        :key="bot.id"
        class="rounded-lg border border-border bg-card p-3.5 shadow-sm"
      >
        <div class="mb-3 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="flex size-8 items-center justify-center rounded-lg bg-blue-500/10">
              <Bell class="size-4 text-blue-500" />
            </div>
            <div>
              <div class="text-sm font-semibold text-foreground">{{ bot.name }}</div>
              <div class="mt-0.5 flex items-center gap-1.5">
                <span
                  class="inline-flex h-1.5 w-1.5 rounded-full"
                  :class="getStatusColor(bot.id)"
                />
                <span class="text-[11px] text-muted-foreground">{{ getStatusText(bot.id) }}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              class="h-7 px-2 text-[11px]"
              :disabled="getStatus(bot.id)?.status === 'connecting'"
              @click="toggleBot(bot)"
            >
              {{ bot.enabled ? '停止' : '启动' }}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 px-2 text-[11px]"
              @click="editBot(bot)"
            >
              编辑
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
              @click="deleteBot(bot)"
            >
              删除
            </Button>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <div class="flex items-center gap-2 text-[11px]">
            <span class="w-20 shrink-0 text-muted-foreground">Client ID</span>
            <span class="font-mono text-foreground">{{ bot.clientId || '-' }}</span>
          </div>
          <div class="flex items-center gap-2 text-[11px]">
            <span class="w-20 shrink-0 text-muted-foreground">Client Secret</span>
            <span class="font-mono text-foreground">{{ bot.clientSecret ? '••••••' : '-' }}</span>
          </div>
        </div>
      </div>

      <!-- 添加按钮 -->
      <button
        class="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-3 text-xs text-muted-foreground transition-all hover:border-primary hover:text-primary"
        @click="showAddDialog = true"
      >
        <Plus class="size-4" />
        添加钉钉 Bot
      </button>

      <!-- 创建钉钉机器人引导 -->
      <div class="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div class="mb-3 flex items-center gap-1.5">
          <Info class="size-3.5 text-muted-foreground" />
          <span class="text-xs font-semibold text-foreground">创建钉钉机器人</span>
        </div>
        <p class="mb-3 text-[11px] text-muted-foreground">按以下步骤在钉钉开放平台创建企业内部应用</p>

        <div class="flex flex-col gap-4">
          <!-- 步骤 1 -->
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</span>
              <span class="text-xs font-medium text-foreground">创建企业内部应用</span>
            </div>
            <p class="pl-7 text-[11px] text-muted-foreground">
              前往
              <a href="#" class="inline-flex items-center gap-0.5 text-primary hover:underline" @click.prevent="openLink('https://open-dev.dingtalk.com')">
                钉钉开放平台
                <ExternalLink class="size-3 shrink-0" />
              </a>
              ，点击「创建应用」，选择「企业内部开发」，填写应用信息。
            </p>
          </div>

          <!-- 步骤 2 -->
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">2</span>
              <span class="text-xs font-medium text-foreground">获取凭证</span>
            </div>
            <p class="pl-7 text-[11px] text-muted-foreground">
              进入应用详情页，在「凭证与基础信息」中找到
              <span class="font-medium text-foreground">Client ID (AppKey)</span> 和
              <span class="font-medium text-foreground">Client Secret (AppSecret)</span>，
              复制到上方配置表单中。
            </p>
          </div>

          <!-- 步骤 3 -->
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">3</span>
              <span class="text-xs font-medium text-foreground">添加机器人能力并保存连接</span>
            </div>
            <p class="pl-7 text-[11px] text-muted-foreground">
              在「应用能力」中启用机器人功能。
              然后回到 Diting，<span class="font-medium text-foreground">先点击「保存配置」</span>，
              确认状态变为「已连接」后，再去钉钉后台配置事件订阅（选择 Stream 模式）。
            </p>
          </div>

          <!-- 步骤 4 -->
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">4</span>
              <span class="text-xs font-medium text-foreground">配置权限并发布</span>
            </div>
            <p class="pl-7 text-[11px] text-muted-foreground">
              在「权限管理」中申请所需权限（消息收发、群组管理等），
              然后发布应用版本，等待企业管理员审批通过。
            </p>
          </div>

          <!-- 重要提示 -->
          <div class="ml-7 rounded-lg bg-amber-500/10 p-2.5 text-[11px] text-amber-600 dark:text-amber-400">
            <span class="font-medium">重要：</span>配置事件订阅前，必须先在 Diting 中保存凭证并确认 Stream 连接成功，
            否则钉钉后台会提示「Stream 模式接入失败」。
          </div>
        </div>
      </div>

      <!-- 使用说明 -->
      <div class="rounded-lg border border-border bg-muted/30 p-3.5">
        <div class="mb-1.5 flex items-center gap-1.5">
          <Info class="size-3.5 text-muted-foreground" />
          <span class="text-xs font-semibold text-foreground">使用说明</span>
        </div>
        <p class="text-[11px] leading-relaxed text-muted-foreground">
          在钉钉开放平台创建企业内部应用后，将 Client ID 和 Client Secret 填入上方配置表单。
          需要启用"Stream 模式"接收消息，保存配置后自动建立 WebSocket 长连接。
          每个 Bot 可绑定不同的项目和模型，支持多 Bot 同时运行。
        </p>
      </div>

      <!-- 编辑/添加对话框 -->
      <Dialog v-model:open="showAddDialog">
        <DialogContent class="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{{ editingBot ? '编辑钉钉 Bot' : '添加钉钉 Bot' }}</DialogTitle>
            <DialogDescription>
              在钉钉开放平台创建企业内部应用后，将 Client ID 和 Client Secret 填入此处。
              需要启用"Stream 模式"接收消息。
            </DialogDescription>
          </DialogHeader>

          <div class="flex flex-col gap-3 py-2">
            <div class="flex flex-col gap-1">
              <Label class="text-xs">名称</Label>
              <Input v-model="form.name" placeholder="我的钉钉 Bot" class="h-8 text-xs" />
            </div>
            <div class="flex flex-col gap-1">
              <Label class="text-xs">Client ID</Label>
              <Input v-model="form.clientId" placeholder="dingxxxxxxxx" class="h-8 text-xs font-mono" />
            </div>
            <div class="flex flex-col gap-1">
              <Label class="text-xs">Client Secret{{ editingBot ? '（留空不修改）' : '' }}</Label>
              <Input v-model="form.clientSecret" type="password" placeholder="xxxxxxxxxxxxxxxx" class="h-8 text-xs font-mono" />
            </div>
            <div class="flex items-center gap-2">
              <Switch v-model:checked="form.enabled" />
              <Label class="text-xs">保存后自动连接</Label>
            </div>

            <!-- 测试连接 -->
            <div class="flex items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                class="h-7 text-[11px]"
                :disabled="testing || !form.clientId || !form.clientSecret"
                @click="testConnection"
              >
                {{ testing ? '测试中…' : '测试连接' }}
              </Button>
              <span v-if="testResult" class="text-[11px]" :class="testResult.success ? 'text-green-600' : 'text-destructive'">
                {{ testResult.message }}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" @click="showAddDialog = false">取消</Button>
            <Button size="sm" :disabled="saving" @click="saveBot">
              {{ saving ? '保存中…' : '保存' }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { toast } from 'vue-sonner'
import { Bell, Plus, Info, ExternalLink } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'

const loading = ref(true)
const bots = ref([])
const statuses = ref([])
const showAddDialog = ref(false)
const editingBot = ref(null)
const saving = ref(false)
const testing = ref(false)
const testResult = ref(null)
const togglingId = ref(null)

// ===== 工具函数 =====
function openLink(url) {
  if (window.electron?.shell?.openExternal) {
    window.electron.shell.openExternal(url)
  }
}

const form = ref({
  name: '',
  clientId: '',
  clientSecret: '',
  enabled: true,
})

// ===== 数据加载 =====
async function loadBots() {
  loading.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.bridge.dingtalkListBots)
    if (res.code === 0) {
      bots.value = res.data || []
    }
    await loadStatuses()
  } catch (err) {
    toast.error('加载钉钉 Bot 失败: ' + (err?.message || err))
  } finally {
    loading.value = false
  }
}

async function loadStatuses() {
  try {
    const res = await ipc.invoke(ipcApiRoute.bridge.dingtalkGetStatuses)
    if (res.code === 0) {
      statuses.value = res.data || []
    }
  } catch {
    // 忽略
  }
}

function getStatus(botId) {
  return statuses.value.find((s) => s.botId === botId)
}

function getStatusText(botId) {
  const s = getStatus(botId)
  if (!s) return '未连接'
  const map = { disconnected: '未连接', connecting: '连接中…', connected: '已连接', error: '错误' }
  return map[s.status] || s.status
}

function getStatusColor(botId) {
  const s = getStatus(botId)
  if (!s) return 'bg-muted-foreground'
  const map = {
    disconnected: 'bg-muted-foreground',
    connecting: 'bg-yellow-500',
    connected: 'bg-green-500',
    error: 'bg-destructive',
  }
  return map[s.status] || 'bg-muted-foreground'
}

function isBotRunning(botId) {
  const s = getStatus(botId)
  return s && s.status !== 'disconnected'
}

// ===== Bot CRUD =====
function editBot(bot) {
  editingBot.value = bot
  form.value = {
    name: bot.name,
    clientId: bot.clientId,
    clientSecret: '',
    enabled: bot.enabled,
  }
  testResult.value = null
  showAddDialog.value = true
}

async function saveBot() {
  if (!form.value.name.trim()) {
    toast.error('请输入名称')
    return
  }
  if (!form.value.clientId.trim()) {
    toast.error('请输入 Client ID')
    return
  }
  if (!editingBot.value && !form.value.clientSecret.trim()) {
    toast.error('请输入 Client Secret')
    return
  }

  saving.value = true
  try {
    const args = {
      id: editingBot.value?.id,
      name: form.value.name.trim(),
      enabled: form.value.enabled,
      clientId: form.value.clientId.trim(),
      clientSecret: form.value.clientSecret.trim(),
    }
    const res = await ipc.invoke(ipcApiRoute.bridge.dingtalkSaveBot, args)
    if (res.code === 0) {
      toast.success(editingBot.value ? '已更新' : '已添加')
      showAddDialog.value = false
      await loadBots()
    } else {
      toast.error(res.message || '保存失败')
    }
  } catch (err) {
    toast.error('保存失败: ' + (err?.message || err))
  } finally {
    saving.value = false
  }
}

async function deleteBot(bot) {
  if (!confirm(`确定删除 "${bot.name}" 吗？`)) return
  try {
    const res = await ipc.invoke(ipcApiRoute.bridge.dingtalkDeleteBot, { botId: bot.id })
    if (res.code === 0) {
      toast.success('已删除')
      await loadBots()
    } else {
      toast.error(res.message || '删除失败')
    }
  } catch (err) {
    toast.error('删除失败: ' + (err?.message || err))
  }
}

async function toggleBot(bot) {
  togglingId.value = bot.id
  try {
    if (isBotRunning(bot.id)) {
      await ipc.invoke(ipcApiRoute.bridge.dingtalkStopBot, { botId: bot.id })
      toast.success(`已停止: ${bot.name}`)
    } else {
      const res = await ipc.invoke(ipcApiRoute.bridge.dingtalkStartBot, { botId: bot.id })
      if (res.code === 0) {
        toast.success(`已启动: ${bot.name}`)
      } else {
        toast.error(res.message || '启动失败')
      }
    }
    await loadBots()
  } catch (err) {
    toast.error('操作失败: ' + (err?.message || err))
  } finally {
    togglingId.value = null
  }
}

async function testConnection() {
  testing.value = true
  testResult.value = null
  try {
    const res = await ipc.invoke(ipcApiRoute.bridge.dingtalkTestConnection, {
      clientId: form.value.clientId.trim(),
      clientSecret: form.value.clientSecret.trim(),
    })
    if (res.code === 0) {
      testResult.value = res.data
    } else {
      testResult.value = { success: false, message: res.message }
    }
  } catch (err) {
    testResult.value = { success: false, message: String(err) }
  } finally {
    testing.value = false
  }
}

// ===== 事件监听 =====
function onStatusChanged() {
  loadStatuses()
}

onMounted(() => {
  loadBots()
  ipc.on('controller/bridge/dingtalkStatusChanged', onStatusChanged)
})

onUnmounted(() => {
  ipc.removeListener('controller/bridge/dingtalkStatusChanged', onStatusChanged)
})
</script>
