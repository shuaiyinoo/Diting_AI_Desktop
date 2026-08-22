<template>
  <div class="flex flex-col gap-3">
    <!-- 加载中 -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <Spinner class="size-5 text-muted-foreground" />
      <span class="ml-2 text-sm text-muted-foreground">{{ t('bridge.dingtalk.loading') }}</span>
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
              {{ bot.enabled ? t('bridge.dingtalk.stop') : t('bridge.dingtalk.start') }}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 px-2 text-[11px]"
              @click="editBot(bot)"
            >
              {{ t('bridge.dingtalk.edit') }}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
              @click="deleteBot(bot)"
            >
              {{ t('bridge.dingtalk.delete') }}
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
        {{ t('bridge.dingtalk.addBot') }}
      </button>

      <!-- 创建钉钉机器人引导 -->
      <div class="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div class="mb-3 flex items-center gap-1.5">
          <Info class="size-3.5 text-muted-foreground" />
          <span class="text-xs font-semibold text-foreground">{{ t('bridge.dingtalk.guide.title') }}</span>
        </div>
        <p class="mb-3 text-[11px] text-muted-foreground">{{ t('bridge.dingtalk.guide.intro') }}</p>

        <div class="flex flex-col gap-4">
          <!-- 步骤 1 -->
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">1</span>
              <span class="text-xs font-medium text-foreground">{{ t('bridge.dingtalk.guide.step1') }}</span>
            </div>
            <p class="pl-7 text-[11px] text-muted-foreground">
              {{ t('bridge.dingtalk.guide.step1Desc') }}
            </p>
          </div>

          <!-- 步骤 2 -->
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">2</span>
              <span class="text-xs font-medium text-foreground">{{ t('bridge.dingtalk.guide.step2') }}</span>
            </div>
            <p class="pl-7 text-[11px] text-muted-foreground">
              {{ t('bridge.dingtalk.guide.step2Desc') }}
            </p>
          </div>

          <!-- 步骤 3 -->
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">3</span>
              <span class="text-xs font-medium text-foreground">{{ t('bridge.dingtalk.guide.step3') }}</span>
            </div>
            <p class="pl-7 text-[11px] text-muted-foreground">
              {{ t('bridge.dingtalk.guide.step3Desc') }}
            </p>
          </div>

          <!-- 步骤 4 -->
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
              <span class="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">4</span>
              <span class="text-xs font-medium text-foreground">{{ t('bridge.dingtalk.guide.step4') }}</span>
            </div>
            <p class="pl-7 text-[11px] text-muted-foreground">
              {{ t('bridge.dingtalk.guide.step4Desc') }}
            </p>
          </div>

          <!-- 重要提示 -->
          <div class="ml-7 rounded-lg bg-amber-500/10 p-2.5 text-[11px] text-amber-600 dark:text-amber-400">
            {{ t('bridge.dingtalk.guide.important') }}
          </div>
        </div>
      </div>

      <!-- 使用说明 -->
      <div class="rounded-lg border border-border bg-muted/30 p-3.5">
        <div class="mb-1.5 flex items-center gap-1.5">
          <Info class="size-3.5 text-muted-foreground" />
          <span class="text-xs font-semibold text-foreground">{{ t('bridge.dingtalk.helpTitle') }}</span>
        </div>
        <p class="text-[11px] leading-relaxed text-muted-foreground">
          {{ t('bridge.dingtalk.helpText') }}
        </p>
      </div>

      <!-- 编辑/添加对话框 -->
      <Dialog v-model:open="showAddDialog">
        <DialogContent class="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{{ editingBot ? t('bridge.dingtalk.edit.editTitle') : t('bridge.dingtalk.edit.addTitle') }}</DialogTitle>
            <DialogDescription>
              {{ t('bridge.dingtalk.edit.description') }}
            </DialogDescription>
          </DialogHeader>

          <div class="flex flex-col gap-3 py-2">
            <div class="flex flex-col gap-1">
              <Label class="text-xs">{{ t('bridge.dingtalk.edit.name') }}</Label>
              <Input v-model="form.name" :placeholder="t('bridge.dingtalk.edit.namePlaceholder')" class="h-8 text-xs" />
            </div>
            <div class="flex flex-col gap-1">
              <Label class="text-xs">Client ID</Label>
              <Input v-model="form.clientId" placeholder="dingxxxxxxxx" class="h-8 text-xs font-mono" />
            </div>
            <div class="flex flex-col gap-1">
              <Label class="text-xs">{{ t('bridge.dingtalk.edit.clientSecret') }}{{ editingBot ? t('bridge.dingtalk.edit.clientSecretHint') : '' }}</Label>
              <Input v-model="form.clientSecret" type="password" placeholder="xxxxxxxxxxxxxxxx" class="h-8 text-xs font-mono" />
            </div>
            <div class="flex items-center gap-2">
              <Switch v-model:checked="form.enabled" />
              <Label class="text-xs">{{ t('bridge.dingtalk.edit.autoConnect') }}</Label>
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
                {{ testing ? t('bridge.dingtalk.edit.testing') : t('bridge.dingtalk.edit.testConnection') }}
              </Button>
              <span v-if="testResult" class="text-[11px]" :class="testResult.success ? 'text-green-600' : 'text-destructive'">
                {{ testResult.message }}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" @click="showAddDialog = false">{{ t('bridge.dingtalk.edit.cancel') }}</Button>
            <Button size="sm" :disabled="saving" @click="saveBot">
              {{ saving ? t('bridge.dingtalk.edit.saving') : t('bridge.dingtalk.edit.save') }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
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
    toast.error(t('bridge.dingtalk.edit.loadFailed') + ': ' + (err?.message || err))
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
  if (!s) return t('bridge.dingtalk.status.disconnected')
  const map = {
    disconnected: t('bridge.dingtalk.status.disconnected'),
    connecting: t('bridge.dingtalk.status.connecting'),
    connected: t('bridge.dingtalk.status.connected'),
    error: t('bridge.dingtalk.status.error'),
  }
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
    toast.error(t('bridge.dingtalk.edit.inputName'))
    return
  }
  if (!form.value.clientId.trim()) {
    toast.error(t('bridge.dingtalk.edit.inputClientId'))
    return
  }
  if (!editingBot.value && !form.value.clientSecret.trim()) {
    toast.error(t('bridge.dingtalk.edit.inputClientSecret'))
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
      toast.success(editingBot.value ? t('bridge.dingtalk.edit.updated') : t('bridge.dingtalk.edit.added'))
      showAddDialog.value = false
      await loadBots()
    } else {
      toast.error(res.message || t('bridge.dingtalk.edit.saveFailed'))
    }
  } catch (err) {
    toast.error(t('bridge.dingtalk.edit.saveFailed') + ': ' + (err?.message || err))
  } finally {
    saving.value = false
  }
}

async function deleteBot(bot) {
  if (!confirm(t('bridge.dingtalk.edit.deleteConfirm', { name: bot.name }))) return
  try {
    const res = await ipc.invoke(ipcApiRoute.bridge.dingtalkDeleteBot, { botId: bot.id })
    if (res.code === 0) {
      toast.success(t('bridge.dingtalk.edit.deleted'))
      await loadBots()
    } else {
      toast.error(res.message || t('bridge.dingtalk.edit.deleteFailed'))
    }
  } catch (err) {
    toast.error(t('bridge.dingtalk.edit.deleteFailed') + ': ' + (err?.message || err))
  }
}

async function toggleBot(bot) {
  togglingId.value = bot.id
  try {
    if (isBotRunning(bot.id)) {
      await ipc.invoke(ipcApiRoute.bridge.dingtalkStopBot, { botId: bot.id })
      toast.success(t('bridge.dingtalk.edit.stopped', { name: bot.name }))
    } else {
      const res = await ipc.invoke(ipcApiRoute.bridge.dingtalkStartBot, { botId: bot.id })
      if (res.code === 0) {
        toast.success(t('bridge.dingtalk.edit.started', { name: bot.name }))
      } else {
        toast.error(res.message || t('bridge.dingtalk.edit.startFailed'))
      }
    }
    await loadBots()
  } catch (err) {
    toast.error(t('bridge.dingtalk.edit.operationFailed') + ': ' + (err?.message || err))
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
