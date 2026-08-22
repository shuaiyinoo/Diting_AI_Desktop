<template>
  <div class="flex flex-col gap-3">
    <!-- 加载中 -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <Spinner class="size-5 text-muted-foreground" />
      <span class="ml-2 text-sm text-muted-foreground">{{ t('bridge.wechat.loading') }}</span>
    </div>

    <template v-else>
      <!-- 状态卡片 -->
      <div class="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <div class="flex size-8 items-center justify-center rounded-lg bg-green-500/10">
              <Bot class="size-4 text-green-500" />
            </div>
            <div>
              <div class="text-sm font-semibold text-foreground">{{ t('bridge.wechat.title') }}</div>
              <div class="mt-0.5 flex items-center gap-1.5">
                <span
                  class="inline-flex h-1.5 w-1.5 rounded-full"
                  :class="statusColor"
                  :style="isAnimating ? 'animation: pulse 1.5s ease-in-out infinite;' : ''"
                />
                <span class="text-[11px] text-muted-foreground">{{ statusText }}</span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-1.5">
            <!-- 已连接：停止 + 登出 -->
            <template v-if="isConnected">
              <Button
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-[11px]"
                :disabled="toggling"
                @click="handleStop"
              >
                <PowerOff class="mr-1 size-3" />
                {{ t('bridge.wechat.stop') }}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-[11px]"
                @click="handleLogout"
              >
                <LogOut class="mr-1 size-3" />
                {{ t('bridge.wechat.logout') }}
              </Button>
            </template>

            <!-- 有凭证但未连接：启动 + 登出 -->
            <template v-else-if="hasCredentials && !isLoggingIn">
              <Button
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-[11px]"
                :disabled="isConnecting || toggling"
                @click="handleStart"
              >
                <Power class="mr-1 size-3" />
                {{ t('bridge.wechat.start') }}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-[11px]"
                @click="handleLogout"
              >
                <LogOut class="mr-1 size-3" />
                {{ t('bridge.wechat.logout') }}
              </Button>
            </template>

            <!-- 无凭证且未在登录：扫码登录 -->
            <template v-else-if="!isLoggingIn">
              <Button
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-[11px]"
                @click="handleLogin"
              >
                <QrCode class="mr-1 size-3" />
                {{ t('bridge.wechat.scanLogin') }}
              </Button>
            </template>
          </div>
        </div>

        <!-- 错误信息 -->
        <div v-if="bridgeState.status === 'error' && bridgeState.errorMessage" class="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
          {{ bridgeState.errorMessage }}
        </div>

        <!-- 连接成功提示 -->
        <div v-if="isConnected" class="mt-3 rounded-md bg-green-500/10 px-3 py-2 text-[11px] text-green-600">
          {{ t('bridge.wechat.connected') }}
        </div>
      </div>

      <!-- 二维码显示区域 -->
      <div v-if="showQRCode" class="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div class="mb-2 flex items-center gap-1.5">
          <QrCode class="size-3.5 text-muted-foreground" />
          <span class="text-xs font-semibold text-foreground">{{ t('bridge.wechat.scanTitle') }}</span>
        </div>
        <div class="flex flex-col items-center gap-2 py-4">
          <div class="rounded-xl border border-border bg-white p-3">
            <img :src="bridgeState.qrCodeData" :alt="t('bridge.wechat.scanTitle')" class="size-48" />
          </div>
          <p class="text-[11px] text-muted-foreground">
            <span v-if="bridgeState.status === 'scanned'" class="font-medium text-blue-500">
              {{ t('bridge.wechat.scannedTip') }}
            </span>
            <span v-else>{{ t('bridge.wechat.scanTip') }}</span>
          </p>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 text-[11px]"
            @click="handleLogin"
          >
            {{ t('bridge.wechat.refreshQr') }}
          </Button>
        </div>
      </div>

      <!-- 使用说明 -->
      <div class="rounded-lg border border-border bg-muted/30 p-3.5">
        <div class="mb-1.5 flex items-center gap-1.5">
          <Info class="size-3.5 text-muted-foreground" />
          <span class="text-xs font-semibold text-foreground">{{ t('bridge.wechat.helpTitle') }}</span>
        </div>
        <p class="text-[11px] leading-relaxed text-muted-foreground">
          {{ t('bridge.wechat.helpText') }}
        </p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
import { toast } from 'vue-sonner'
import { Bot, Info, Power, PowerOff, LogOut, QrCode } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'

// ===== 状态 =====
const loading = ref(true)
const hasCredentials = ref(false)
const toggling = ref(false)
const bridgeState = ref({
  status: 'disconnected',
  connectedAt: undefined,
  errorMessage: undefined,
  qrCodeData: undefined,
})

// ===== 计算属性 =====
const isConnected = computed(() => bridgeState.value.status === 'connected')
const isLoggingIn = computed(() =>
  bridgeState.value.status === 'waiting_scan' || bridgeState.value.status === 'scanned',
)
const isConnecting = computed(() => bridgeState.value.status === 'connecting')
const showQRCode = computed(() => isLoggingIn.value && !!bridgeState.value.qrCodeData)

const statusColor = computed(() => {
  const map = {
    disconnected: 'bg-muted-foreground',
    waiting_scan: 'bg-yellow-500',
    scanned: 'bg-blue-500',
    connecting: 'bg-yellow-500',
    connected: 'bg-green-500',
    error: 'bg-red-500',
  }
  return map[bridgeState.value.status] || 'bg-muted-foreground'
})

const isAnimating = computed(() => {
  return ['waiting_scan', 'scanned', 'connecting'].includes(bridgeState.value.status)
})

const statusText = computed(() => {
  const map = {
    disconnected: t('bridge.wechat.status.disconnected'),
    waiting_scan: t('bridge.wechat.status.waitingScan'),
    scanned: t('bridge.wechat.status.scanned'),
    connecting: t('bridge.wechat.status.connecting'),
    connected: t('bridge.wechat.status.connected'),
    error: t('bridge.wechat.status.error'),
  }
  return map[bridgeState.value.status] || bridgeState.value.status
})

// ===== 数据加载 =====
async function loadConfig() {
  loading.value = true
  try {
    const [configRes, statusRes] = await Promise.all([
      ipc.invoke(ipcApiRoute.bridge.wechatGetConfig),
      ipc.invoke(ipcApiRoute.bridge.wechatGetStatus),
    ])
    if (configRes.code === 0) {
      hasCredentials.value = configRes.data.hasCredentials
    }
    if (statusRes.code === 0) {
      bridgeState.value = statusRes.data
    }
  } catch (err) {
    toast.error(t('bridge.wechat.messages.loadFailed') + ': ' + (err?.message || err))
  } finally {
    loading.value = false
  }
}

// ===== 操作 =====
async function handleLogin() {
  try {
    const res = await ipc.invoke(ipcApiRoute.bridge.wechatStartLogin)
    if (res.code !== 0) {
      toast.error(res.message || t('bridge.wechat.messages.scanFailed'))
    }
    // 状态会通过事件推送
  } catch (err) {
    toast.error(t('bridge.wechat.messages.loginFailed') + ': ' + (err?.message || err))
  }
}

async function handleStart() {
  toggling.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.bridge.wechatStart)
    if (res.code !== 0) {
      toast.error(res.message || t('bridge.wechat.messages.startFailed'))
      return
    }
    toast.success(t('bridge.wechat.messages.started'))
  } catch (err) {
    toast.error(t('bridge.wechat.messages.startFailed') + ': ' + (err?.message || err))
  } finally {
    toggling.value = false
  }
}

async function handleStop() {
  toggling.value = true
  try {
    await ipc.invoke(ipcApiRoute.bridge.wechatStop)
    toast.info(t('bridge.wechat.messages.stopped'))
  } catch (err) {
    toast.error(t('bridge.wechat.messages.stopFailed') + ': ' + (err?.message || err))
  } finally {
    toggling.value = false
  }
}

async function handleLogout() {
  try {
    await ipc.invoke(ipcApiRoute.bridge.wechatLogout)
    hasCredentials.value = false
    toast.info(t('bridge.wechat.messages.loggedOut'))
  } catch (err) {
    toast.error(t('bridge.wechat.messages.logoutFailed') + ': ' + (err?.message || err))
  }
}

// ===== 事件监听 =====
function onStatusChanged(_, state) {
  bridgeState.value = state
  // 登录成功后更新凭证状态
  if (state.status === 'connected') {
    hasCredentials.value = true
  } else if (state.status === 'disconnected') {
    // 可能是登出，重新检查
    ipc.invoke(ipcApiRoute.bridge.wechatGetConfig).then((res) => {
      if (res.code === 0) {
        hasCredentials.value = res.data.hasCredentials
      }
    })
  }
}

onMounted(() => {
  loadConfig()
  ipc.on('controller/bridge/wechatStatusChanged', onStatusChanged)
})

onUnmounted(() => {
  ipc.removeListener('controller/bridge/wechatStatusChanged', onStatusChanged)
})
</script>
