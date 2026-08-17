<template>
  <div class="flex flex-col gap-3">
    <!-- 加载中 -->
    <div v-if="loading" class="flex items-center justify-center py-8">
      <Spinner class="size-5 text-muted-foreground" />
      <span class="ml-2 text-sm text-muted-foreground">加载中…</span>
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
              <div class="text-sm font-semibold text-foreground">微信</div>
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
                停止
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-[11px]"
                @click="handleLogout"
              >
                <LogOut class="mr-1 size-3" />
                登出
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
                启动
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 px-2 text-[11px]"
                @click="handleLogout"
              >
                <LogOut class="mr-1 size-3" />
                登出
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
                扫码登录
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
          微信已连接，消息将自动接收。
        </div>
      </div>

      <!-- 二维码显示区域 -->
      <div v-if="showQRCode" class="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div class="mb-2 flex items-center gap-1.5">
          <QrCode class="size-3.5 text-muted-foreground" />
          <span class="text-xs font-semibold text-foreground">扫码登录</span>
        </div>
        <div class="flex flex-col items-center gap-2 py-4">
          <div class="rounded-xl border border-border bg-white p-3">
            <img :src="bridgeState.qrCodeData" alt="微信登录二维码" class="size-48" />
          </div>
          <p class="text-[11px] text-muted-foreground">
            <span v-if="bridgeState.status === 'scanned'" class="font-medium text-blue-500">
              已扫码，请在手机上确认登录
            </span>
            <span v-else>打开微信，扫描二维码登录</span>
          </p>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 text-[11px]"
            @click="handleLogin"
          >
            刷新二维码
          </Button>
        </div>
      </div>

      <!-- 使用说明 -->
      <div class="rounded-lg border border-border bg-muted/30 p-3.5">
        <div class="mb-1.5 flex items-center gap-1.5">
          <Info class="size-3.5 text-muted-foreground" />
          <span class="text-xs font-semibold text-foreground">使用说明</span>
        </div>
        <p class="text-[11px] leading-relaxed text-muted-foreground">
          点击「扫码登录」，使用微信扫描二维码即可连接。
          连接后，在微信中发送消息即可与 Diting Agent 交互。
          凭证会安全保存在本地，下次启动可直接连接。
        </p>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
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
    disconnected: '未连接',
    waiting_scan: '等待扫码...',
    scanned: '已扫码，确认中...',
    connecting: '连接中...',
    connected: '已连接',
    error: '连接错误',
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
    toast.error('加载微信配置失败: ' + (err?.message || err))
  } finally {
    loading.value = false
  }
}

// ===== 操作 =====
async function handleLogin() {
  try {
    const res = await ipc.invoke(ipcApiRoute.bridge.wechatStartLogin)
    if (res.code !== 0) {
      toast.error(res.message || '扫码登录失败')
    }
    // 状态会通过事件推送
  } catch (err) {
    toast.error('登录失败: ' + (err?.message || err))
  }
}

async function handleStart() {
  toggling.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.bridge.wechatStart)
    if (res.code !== 0) {
      toast.error(res.message || '启动失败')
      return
    }
    toast.success('微信 Bridge 已启动')
  } catch (err) {
    toast.error('启动失败: ' + (err?.message || err))
  } finally {
    toggling.value = false
  }
}

async function handleStop() {
  toggling.value = true
  try {
    await ipc.invoke(ipcApiRoute.bridge.wechatStop)
    toast.info('微信 Bridge 已停止')
  } catch (err) {
    toast.error('停止失败: ' + (err?.message || err))
  } finally {
    toggling.value = false
  }
}

async function handleLogout() {
  try {
    await ipc.invoke(ipcApiRoute.bridge.wechatLogout)
    hasCredentials.value = false
    toast.info('已退出微信登录')
  } catch (err) {
    toast.error('登出失败: ' + (err?.message || err))
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
