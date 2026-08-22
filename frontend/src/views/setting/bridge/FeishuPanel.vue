<template>
  <div class="flex flex-col gap-3">
    <!-- 加载中 -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <Spinner class="size-5 text-muted-foreground" />
      <span class="ml-2 text-sm text-muted-foreground">{{ t('bridge.feishu.loading') }}</span>
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
              <MessageCircle class="size-4 text-blue-500" />
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
              :disabled="getStatus(bot.id)?.status === 'connecting' || togglingId === bot.id"
              @click="toggleBot(bot)"
            >
              {{ isBotRunning(bot.id) ? t('bridge.feishu.stop') : t('bridge.feishu.start') }}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 px-2 text-[11px]"
              @click="editBot(bot)"
            >
              {{ t('bridge.feishu.edit') }}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 px-2 text-[11px] text-destructive hover:text-destructive"
              @click="deleteBot(bot)"
            >
              {{ t('bridge.feishu.delete') }}
            </Button>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <div class="flex items-center gap-2 text-[11px]">
            <span class="w-16 shrink-0 text-muted-foreground">App ID</span>
            <span class="font-mono text-foreground">{{ bot.appId || '-' }}</span>
          </div>
          <div class="flex items-center gap-2 text-[11px]">
            <span class="w-16 shrink-0 text-muted-foreground">App Secret</span>
            <span class="font-mono text-foreground">{{ bot.appSecret ? '••••••' : '-' }}</span>
          </div>
        </div>
      </div>

      <!-- 操作按钮区 -->
      <div class="flex items-center gap-2">
        <!-- 扫码创建按钮 -->
        <button
          class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 py-3 text-xs font-medium text-primary transition-all hover:bg-primary/10"
          @click="showRegisterDialog = true"
        >
          <QrCode class="size-4" />
          {{ t('bridge.feishu.scanCreate') }}
        </button>
        <!-- 手动添加按钮 -->
        <button
          class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-3 text-xs text-muted-foreground transition-all hover:border-primary hover:text-primary"
          @click="showAddDialog = true"
        >
          <Plus class="size-4" />
          {{ t('bridge.feishu.manualAdd') }}
        </button>
      </div>

      <!-- ===== 聊天绑定管理 ===== -->
      <div class="rounded-lg border border-border bg-card p-3.5 shadow-sm">
        <div class="mb-3 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Link class="size-4 text-muted-foreground" />
            <span class="text-sm font-semibold text-foreground">{{ t('bridge.feishu.binding.title') }}</span>
            <span class="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{{ bindings.length }}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 px-2 text-[11px]"
            @click="loadBindings"
          >
            <RefreshCw class="size-3 mr-1" />
            {{ t('bridge.feishu.binding.refresh') }}
          </Button>
        </div>

        <div v-if="bindingsLoading" class="flex items-center justify-center py-6">
          <Spinner class="size-4 text-muted-foreground" />
          <span class="ml-2 text-xs text-muted-foreground">{{ t('bridge.feishu.binding.loading') }}</span>
        </div>

        <div v-else-if="bindings.length === 0" class="py-6 text-center text-xs text-muted-foreground">
          {{ t('bridge.feishu.binding.empty') }}
        </div>

        <div v-else class="flex flex-col gap-2">
          <div
            v-for="binding in bindings"
            :key="binding.chatId"
            class="rounded-md border border-border/60 p-2.5"
            :class="binding.archived ? 'opacity-60' : ''"
          >
            <!-- 绑定头部 -->
            <div class="mb-2 flex items-center justify-between">
              <div class="flex items-center gap-1.5">
                <component :is="binding.chatType === 'group' ? Users : User" class="size-3.5 text-muted-foreground" />
                <span class="text-xs font-medium text-foreground">{{ binding.groupName || (binding.chatType === 'group' ? t('bridge.feishu.binding.group') : t('bridge.feishu.binding.single')) }}</span>
                <span class="font-mono text-[10px] text-muted-foreground">{{ binding.chatId.slice(0, 12) }}…</span>
              </div>
              <div class="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-6 px-1.5 text-[10px]"
                  @click="toggleArchive(binding)"
                >
                  {{ binding.archived ? t('bridge.feishu.binding.restore') : t('bridge.feishu.binding.archive') }}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  class="h-6 px-1.5 text-[10px] text-destructive hover:text-destructive"
                  @click="removeBinding(binding)"
                >
                  {{ t('bridge.feishu.binding.unbind') }}
                </Button>
              </div>
            </div>

            <!-- 项目/会话选择器 -->
            <div class="grid grid-cols-[60px_1fr] gap-1.5 items-center">
              <span class="text-[11px] text-muted-foreground">{{ t('bridge.feishu.binding.project') }}</span>
              <Select
                :model-value="binding.workspaceId"
                @update:model-value="(val) => updateBindingWorkspace(binding, val)"
              >
                <SelectTrigger class="h-7 text-[11px]">
                  <SelectValue :placeholder="t('bridge.feishu.binding.selectProject')">
                    {{ getWorkspaceName(binding.workspaceId) }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="ws in workspaces"
                    :key="ws.id"
                    :value="ws.id"
                  >
                    {{ ws.name }}
                  </SelectItem>
                </SelectContent>
              </Select>

              <span class="text-[11px] text-muted-foreground">{{ t('bridge.feishu.binding.session') }}</span>
              <Select
                :model-value="binding.sessionId"
                @update:model-value="(val) => updateBindingSession(binding, val)"
              >
                <SelectTrigger class="h-7 text-[11px]">
                  <SelectValue :placeholder="t('bridge.feishu.binding.selectSession')">
                    {{ getSessionTitle(binding.sessionId) }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="s in getSessionsByWorkspace(binding.workspaceId)"
                    :key="s.id"
                    :value="s.id"
                  >
                    {{ s.title || s.id.slice(0, 8) }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 扫码创建对话框 ===== -->
      <Dialog v-model:open="showRegisterDialog">
        <DialogContent class="max-w-[400px]">
          <DialogHeader>
            <DialogTitle class="flex items-center gap-2">
              <QrCode class="size-4 text-primary" />
              {{ t('bridge.feishu.register.title') }}
            </DialogTitle>
            <DialogDescription>
              {{ t('bridge.feishu.register.description') }}
            </DialogDescription>
          </DialogHeader>

          <div class="flex flex-col items-center gap-3 py-2">
            <!-- idle: 正在申请二维码 -->
            <div v-if="registerPhase === 'idle'" class="flex flex-col items-center gap-2 py-12">
              <Spinner class="size-6 text-muted-foreground" />
              <span class="text-sm text-muted-foreground">{{ t('bridge.feishu.register.requesting') }}</span>
            </div>

            <!-- qrcode: 显示二维码 -->
            <template v-if="registerPhase === 'qrcode' && registerQrcode">
              <div class="rounded-lg bg-white p-3 shadow-sm">
                <img
                  v-if="registerQrcode.dataUrl"
                  :src="registerQrcode.dataUrl"
                  :alt="t('bridge.feishu.register.title')"
                  class="block size-[240px]"
                />
                <div
                  v-else
                  class="flex size-[240px] items-center justify-center text-xs text-muted-foreground"
                >
                  {{ t('bridge.feishu.register.qrFailed') }}
                </div>
              </div>
              <div class="text-center text-sm text-foreground">
                {{ t('bridge.feishu.register.scanTip') }}
              </div>
              <div class="text-center text-[11px] text-muted-foreground">
                <span v-if="registerStatus?.status === 'polling'">{{ t('bridge.feishu.register.waitingScan') }}</span>
                <span v-else-if="registerStatus?.status === 'slow_down'">{{ t('bridge.feishu.register.slowDown') }}</span>
                <span v-else-if="registerStatus?.status === 'domain_switched'">{{ t('bridge.feishu.register.domainSwitched') }}</span>
                <span v-else>{{ t('bridge.feishu.register.qrReady') }}</span>
              </div>
              <button
                class="text-[11px] text-primary hover:underline"
                @click="openInBrowser"
              >
                {{ t('bridge.feishu.register.openInBrowser') }}
              </button>
            </template>

            <!-- success: 注册成功 -->
            <div v-if="registerPhase === 'success'" class="flex flex-col items-center gap-2 py-8">
              <div class="flex size-12 items-center justify-center rounded-full bg-green-500/10">
                <CheckCircle class="size-6 text-green-500" />
              </div>
              <span class="text-sm font-medium text-foreground">{{ t('bridge.feishu.register.success') }}</span>
              <span class="text-[11px] text-muted-foreground">{{ t('bridge.feishu.register.autoSaving') }}</span>
            </div>

            <!-- error: 注册失败 -->
            <div v-if="registerPhase === 'error'" class="flex flex-col items-center gap-2 py-8">
              <div class="flex size-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle class="size-6 text-destructive" />
              </div>
              <span class="text-sm font-medium text-foreground">{{ t('bridge.feishu.register.failed') }}</span>
              <span class="max-w-[300px] text-center text-[11px] text-muted-foreground">{{ registerErrorMsg }}</span>
              <Button variant="outline" size="sm" class="mt-2 h-7 text-[11px]" @click="retryRegister">
                {{ t('bridge.feishu.register.retry') }}
              </Button>
            </div>
          </div>

          <DialogFooter v-if="registerPhase !== 'success'">
            <Button
              variant="outline"
              size="sm"
              @click="closeRegisterDialog"
            >
              {{ registerPhase === 'qrcode' ? t('bridge.feishu.register.cancelScan') : t('bridge.feishu.register.close') }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- 编辑/添加对话框 -->
      <Dialog v-model:open="showAddDialog">
        <DialogContent class="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{{ editingBot ? t('bridge.feishu.edit.editTitle') : t('bridge.feishu.edit.addTitle') }}</DialogTitle>
            <DialogDescription>
              {{ t('bridge.feishu.edit.description') }}
            </DialogDescription>
          </DialogHeader>

          <div class="flex flex-col gap-3 py-2">
            <div class="flex flex-col gap-1">
              <Label class="text-xs">{{ t('bridge.feishu.edit.name') }}</Label>
              <Input v-model="form.name" :placeholder="t('bridge.feishu.edit.namePlaceholder')" class="h-8 text-xs" />
            </div>
            <div class="flex flex-col gap-1">
              <Label class="text-xs">App ID</Label>
              <Input v-model="form.appId" placeholder="cli_xxxxxxxx" class="h-8 text-xs font-mono" />
            </div>
            <div class="flex flex-col gap-1">
              <Label class="text-xs">{{ t('bridge.feishu.edit.appSecret') }}{{ editingBot ? t('bridge.feishu.edit.appSecretHint') : '' }}</Label>
              <Input v-model="form.appSecret" type="password" placeholder="xxxxxxxxxxxxxxxx" class="h-8 text-xs font-mono" />
            </div>
            <div class="flex items-center gap-2">
              <Switch v-model:checked="form.enabled" />
              <Label class="text-xs">{{ t('bridge.feishu.edit.autoConnect') }}</Label>
            </div>

            <!-- 测试连接 -->
            <div class="flex items-center gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                class="h-7 text-[11px]"
                :disabled="testing || !form.appId || !form.appSecret"
                @click="testConnection"
              >
                {{ testing ? t('bridge.feishu.edit.testing') : t('bridge.feishu.edit.testConnection') }}
              </Button>
              <span v-if="testResult" class="text-[11px]" :class="testResult.success ? 'text-green-600' : 'text-destructive'">
                {{ testResult.message }}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" @click="showAddDialog = false">{{ t('bridge.feishu.edit.cancel') }}</Button>
            <Button size="sm" :disabled="saving" @click="saveBot">
              {{ saving ? t('bridge.feishu.edit.saving') : t('bridge.feishu.edit.save') }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </template>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
import { toast } from 'vue-sonner'
import { MessageCircle, Plus, QrCode, CheckCircle, AlertCircle, Link, Users, User, RefreshCw } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
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
const togglingId = ref(null)  // 正在切换状态的 Bot ID

// ===== 扫码注册状态 =====
const showRegisterDialog = ref(false)
const registerPhase = ref('idle')  // 'idle' | 'qrcode' | 'success' | 'error'
const registerQrcode = ref(null)   // { url, dataUrl, expireIn }
const registerStatus = ref(null)   // { status, interval }
const registerErrorMsg = ref('')

const form = ref({
  name: '',
  appId: '',
  appSecret: '',
  enabled: true,
})

// ===== 绑定管理状态 =====
const bindings = ref([])
const bindingsLoading = ref(false)
const workspaces = ref([])
const sessions = ref([])

// ===== 数据加载 =====
async function loadBots() {
  loading.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.bridge.feishuListBots)
    if (res.code === 0) {
      bots.value = res.data || []
    }
    await loadStatuses()
  } catch (err) {
    toast.error(t('bridge.feishu.edit.loadFailed') + ': ' + (err?.message || err))
  } finally {
    loading.value = false
  }
}

async function loadStatuses() {
  try {
    const res = await ipc.invoke(ipcApiRoute.bridge.feishuGetStatuses)
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
  if (!s) return t('bridge.feishu.status.disconnected')
  const map = {
    disconnected: t('bridge.feishu.status.disconnected'),
    connecting: t('bridge.feishu.status.connecting'),
    connected: t('bridge.feishu.status.connected'),
    error: t('bridge.feishu.status.error'),
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

// 判断 Bot 是否正在运行（连接中或已连接都算运行中）
function isBotRunning(botId) {
  const s = getStatus(botId)
  return s?.status === 'connected' || s?.status === 'connecting'
}

// ===== Bot CRUD =====
function editBot(bot) {
  editingBot.value = bot
  form.value = {
    name: bot.name,
    appId: bot.appId,
    appSecret: '',  // 不回填密钥
    enabled: bot.enabled,
  }
  testResult.value = null
  showAddDialog.value = true
}

async function saveBot() {
  if (!form.value.name.trim()) {
    toast.error(t('bridge.feishu.edit.inputName'))
    return
  }
  if (!form.value.appId.trim()) {
    toast.error(t('bridge.feishu.edit.inputAppId'))
    return
  }
  if (!editingBot.value && !form.value.appSecret.trim()) {
    toast.error(t('bridge.feishu.edit.inputAppSecret'))
    return
  }

  saving.value = true
  try {
    const args = {
      id: editingBot.value?.id,
      name: form.value.name.trim(),
      enabled: form.value.enabled,
      appId: form.value.appId.trim(),
      appSecret: form.value.appSecret.trim(),
    }
    const res = await ipc.invoke(ipcApiRoute.bridge.feishuSaveBot, args)
    if (res.code === 0) {
      toast.success(editingBot.value ? t('bridge.feishu.edit.updated') : t('bridge.feishu.edit.added'))
      showAddDialog.value = false
      await loadBots()
    } else {
      toast.error(res.message || t('bridge.feishu.edit.saveFailed'))
    }
  } catch (err) {
    toast.error(t('bridge.feishu.edit.saveFailed') + ': ' + (err?.message || err))
  } finally {
    saving.value = false
  }
}

async function deleteBot(bot) {
  if (!confirm(t('bridge.feishu.edit.deleteConfirm', { name: bot.name }))) return
  try {
    const res = await ipc.invoke(ipcApiRoute.bridge.feishuDeleteBot, { botId: bot.id })
    if (res.code === 0) {
      toast.success(t('bridge.feishu.edit.deleted'))
      await loadBots()
    } else {
      toast.error(res.message || t('bridge.feishu.edit.deleteFailed'))
    }
  } catch (err) {
    toast.error(t('bridge.feishu.edit.deleteFailed') + ': ' + (err?.message || err))
  }
}

async function toggleBot(bot) {
  togglingId.value = bot.id
  try {
    if (isBotRunning(bot.id)) {
      // 停止
      await ipc.invoke(ipcApiRoute.bridge.feishuStopBot, { botId: bot.id })
      toast.success(t('bridge.feishu.edit.stopped', { name: bot.name }))
    } else {
      // 启动
      const res = await ipc.invoke(ipcApiRoute.bridge.feishuStartBot, { botId: bot.id })
      if (res.code === 0) {
        toast.success(t('bridge.feishu.edit.started', { name: bot.name }))
      } else {
        toast.error(res.message || t('bridge.feishu.edit.startFailed'))
      }
    }
    await loadBots()
  } catch (err) {
    toast.error(t('bridge.feishu.edit.operationFailed') + ': ' + (err?.message || err))
  } finally {
    togglingId.value = null
  }
}

async function testConnection() {
  testing.value = true
  testResult.value = null
  try {
    const res = await ipc.invoke(ipcApiRoute.bridge.feishuTestConnection, {
      appId: form.value.appId.trim(),
      appSecret: form.value.appSecret.trim(),
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

// ===== 绑定管理 =====

/** 加载绑定列表 */
async function loadBindings() {
  bindingsLoading.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.bridge.feishuListBindings)
    if (res.code === 0) {
      bindings.value = res.data || []
    }
  } catch (err) {
    toast.error(t('bridge.feishu.binding.updateFailed') + ': ' + (err?.message || err))
  } finally {
    bindingsLoading.value = false
  }
}

/** 加载工作区列表 */
async function loadWorkspaces() {
  try {
    const res = await ipc.invoke(ipcApiRoute.piAgent.workspaceOperation, { action: 'list' })
    if (res.code === 0) {
      workspaces.value = res.data || []
    }
  } catch {
    // 忽略
  }
}

/** 加载会话列表 */
async function loadSessions() {
  try {
    const res = await ipc.invoke(ipcApiRoute.piAgent.sessionOperation, { action: 'list' })
    if (res.code === 0) {
      sessions.value = res.data || []
    }
  } catch {
    // 忽略
  }
}

/** 获取工作区名称 */
function getWorkspaceName(workspaceId) {
  const ws = workspaces.value.find((w) => w.id === workspaceId)
  return ws?.name || t('bridge.feishu.binding.unknownProject')
}

/** 获取会话标题 */
function getSessionTitle(sessionId) {
  const s = sessions.value.find((item) => item.id === sessionId)
  return s?.title || (sessionId ? sessionId.slice(0, 8) : t('bridge.feishu.binding.noSession'))
}

/** 获取指定工作区下的会话列表 */
function getSessionsByWorkspace(workspaceId) {
  if (!workspaceId) return sessions.value
  return sessions.value.filter((s) => s.workspaceId === workspaceId)
}

/** 更新绑定的项目 */
async function updateBindingWorkspace(binding, workspaceId) {
  try {
    const res = await ipc.invoke(ipcApiRoute.bridge.feishuUpdateBinding, {
      chatId: binding.chatId,
      workspaceId,
    })
    if (res.code === 0) {
      toast.success(t('bridge.feishu.binding.projectUpdated'))
      await loadBindings()
    } else {
      toast.error(res.message || t('bridge.feishu.binding.updateFailed'))
    }
  } catch (err) {
    toast.error(t('bridge.feishu.binding.updateFailed') + ': ' + (err?.message || err))
  }
}

/** 更新绑定的会话 */
async function updateBindingSession(binding, sessionId) {
  try {
    const res = await ipc.invoke(ipcApiRoute.bridge.feishuUpdateBinding, {
      chatId: binding.chatId,
      sessionId,
    })
    if (res.code === 0) {
      toast.success(t('bridge.feishu.binding.sessionUpdated'))
      await loadBindings()
    } else {
      toast.error(res.message || t('bridge.feishu.binding.updateFailed'))
    }
  } catch (err) {
    toast.error('更新失败: ' + (err?.message || err))
  }
}

/** 归档/恢复绑定 */
async function toggleArchive(binding) {
  const archived = !binding.archived
  try {
    const res = await ipc.invoke(ipcApiRoute.bridge.feishuUpdateBinding, {
      chatId: binding.chatId,
      archived,
    })
    if (res.code === 0) {
      toast.success(archived ? t('bridge.feishu.binding.archived') : t('bridge.feishu.binding.restored'))
      await loadBindings()
    } else {
      toast.error(res.message || t('bridge.feishu.edit.operationFailed'))
    }
  } catch (err) {
    toast.error(t('bridge.feishu.edit.operationFailed') + ': ' + (err?.message || err))
  }
}

/** 移除绑定 */
async function removeBinding(binding) {
  if (!confirm(`${t('bridge.feishu.binding.unbindConfirm')}\n${binding.groupName || (binding.chatType === 'group' ? t('bridge.feishu.binding.group') : t('bridge.feishu.binding.single'))}`)) return
  try {
    const res = await ipc.invoke(ipcApiRoute.bridge.feishuRemoveBinding, {
      chatId: binding.chatId,
    })
    if (res.code === 0) {
      toast.success(t('bridge.feishu.binding.unbound'))
      await loadBindings()
    } else {
      toast.error(res.message || t('bridge.feishu.binding.unbindFailed'))
    }
  } catch (err) {
    toast.error(t('bridge.feishu.binding.unbindFailed') + ': ' + (err?.message || err))
  }
}

// ===== 扫码注册 =====

/** 监听二维码推送 */
function onRegisterQrcode(_, payload) {
  registerQrcode.value = payload
  registerPhase.value = 'qrcode'
}

/** 监听注册状态变化 */
function onRegisterStatus(_, payload) {
  registerStatus.value = payload
}

/** 启动扫码注册流程 */
async function startRegister() {
  registerPhase.value = 'idle'
  registerQrcode.value = null
  registerStatus.value = null
  registerErrorMsg.value = ''

  try {
    const res = await ipc.invoke(ipcApiRoute.bridge.feishuRegisterApp)
    if (res.code === 0) {
      registerPhase.value = 'success'
      // 自动保存并启动 Bot
      await handleRegisterSuccess(res.data)
    } else {
      // SDK abort 时不显示错误
      if (res.message !== t('bridge.feishu.register.cancelled')) {
        registerPhase.value = 'error'
        registerErrorMsg.value = res.message || t('bridge.feishu.register.failed')
      }
    }
  } catch (err) {
    const msg = String(err?.message || err)
    if (!msg.includes('aborted') && !msg.includes('Abort')) {
      registerPhase.value = 'error'
      registerErrorMsg.value = msg
    }
  }
}

/** 扫码成功后：保存配置 + 自动启动 Bot */
async function handleRegisterSuccess(result) {
  try {
    const botName = `${t('bridge.platforms.feishu')} Bot ${bots.value.length + 1}`
    const saveRes = await ipc.invoke(ipcApiRoute.bridge.feishuSaveBot, {
      name: botName,
      enabled: true,
      appId: result.appId,
      appSecret: result.appSecret,
    })
    if (saveRes.code === 0) {
      toast.success(t('bridge.feishu.register.botCreated', { name: botName }))
      // 自动启动 Bot（不阻塞 UI）
      try {
        await ipc.invoke(ipcApiRoute.bridge.feishuStartBot, { botId: saveRes.data.id })
      } catch (err) {
        toast.error(t('bridge.feishu.register.autoStartFailed') + ': ' + (err?.message || err))
      }
      await loadBots()
      // 延迟关闭对话框
      setTimeout(() => {
        showRegisterDialog.value = false
      }, 1500)
    } else {
      toast.error(saveRes.message || t('bridge.feishu.register.saveConfigFailed'))
      registerPhase.value = 'error'
      registerErrorMsg.value = saveRes.message || '保存配置失败'
    }
  } catch (err) {
    toast.error(t('bridge.feishu.register.saveConfigFailed') + ': ' + (err?.message || err))
    registerPhase.value = 'error'
    registerErrorMsg.value = String(err?.message || err)
  }
}

/** 关闭扫码对话框 */
function closeRegisterDialog() {
  // 如果正在扫码，取消注册
  if (registerPhase.value === 'qrcode' || registerPhase.value === 'idle') {
    ipc.invoke(ipcApiRoute.bridge.feishuCancelRegister).catch(() => {})
  }
  showRegisterDialog.value = false
}

/** 重试注册 */
function retryRegister() {
  startRegister()
}

/** 在浏览器中打开二维码链接 */
function openInBrowser() {
  if (registerQrcode.value?.url) {
    window.open(registerQrcode.value.url, '_blank')
  }
}

// ===== 事件监听 =====
function onStatusChanged() {
  loadStatuses()
}

// 监听扫码对话框开关，打开时自动启动注册流程
watch(showRegisterDialog, (val) => {
  if (val) {
    startRegister()
  }
})

onMounted(() => {
  loadBots()
  loadBindings()
  loadWorkspaces()
  loadSessions()
  ipc.on('controller/bridge/feishuStatusChanged', onStatusChanged)
  ipc.on(ipcApiRoute.bridge.feishuRegisterQrcodeEvent, onRegisterQrcode)
  ipc.on(ipcApiRoute.bridge.feishuRegisterStatusEvent, onRegisterStatus)
})

onUnmounted(() => {
  ipc.removeListener('controller/bridge/feishuStatusChanged', onStatusChanged)
  ipc.removeListener(ipcApiRoute.bridge.feishuRegisterQrcodeEvent, onRegisterQrcode)
  ipc.removeListener(ipcApiRoute.bridge.feishuRegisterStatusEvent, onRegisterStatus)
  // 取消可能进行中的注册
  ipc.invoke(ipcApiRoute.bridge.feishuCancelRegister).catch(() => {})
})
</script>
