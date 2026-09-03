<template>
  <div class="mx-auto max-w-[640px]">
    <h3 class="flex items-center gap-2 text-base font-semibold text-foreground">{{ t('general.title') }}</h3>

    <!-- ===== Diting Cloud 账户 ===== -->
    <div class="mt-4 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <!-- 分组标题 -->
      <div class="border-b border-border/50 bg-muted/30 px-4 py-2.5">
        <div class="text-[13px] font-semibold text-foreground">{{ t('general.cloud.title') }}</div>
        <div class="mt-0.5 text-[11px] text-muted-foreground">{{ t('general.cloud.subtitle') }}</div>
      </div>

      <!-- 已登录 -->
      <div v-if="isLoggedIn" class="flex items-center justify-between px-4 py-3.5">
        <div class="flex items-center gap-3">
          <div class="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User class="size-4.5" />
          </div>
          <div class="min-w-0">
            <div class="text-[13px] font-medium text-foreground">{{ userEmail }}</div>
            <div class="mt-0.5 text-[11px] text-muted-foreground">{{ t('general.cloud.loggedIn') }}</div>
          </div>
        </div>
        <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs" @click="onLogout">
          <LogOut class="size-3.5" />
          {{ t('general.cloud.logout') }}
        </Button>
      </div>

      <!-- ===== 远程控制（仅登录后可用）===== -->
      <div v-if="isLoggedIn" class="border-t border-border/50">
        <div class="border-b border-border/50 bg-muted/30 px-4 py-2.5">
          <div class="text-[13px] font-semibold text-foreground">{{ t('general.cloud.remote.title') }}</div>
          <div class="mt-0.5 text-[11px] text-muted-foreground">{{ t('general.cloud.remote.subtitle') }}</div>
        </div>

        <!-- 服务端连接状态 -->
        <div class="flex items-center justify-between px-4 py-3.5">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="size-2 shrink-0 rounded-full" :class="remote.stateColor" />
              <span class="text-[13px] font-medium text-foreground">{{ t('general.cloud.remote.serverConn') }}</span>
            </div>
            <div class="mt-0.5 truncate text-[11px] text-muted-foreground">
              {{ remote.connStateText }}<span v-if="remote.baseUrl"> · {{ remote.baseUrl }}</span>
            </div>
          </div>
          <Switch
            :model-value="remote.isConnected"
            :disabled="remote.loading"
            @update:model-value="onToggleRemote"
          />
        </div>

        <!-- 远程镜像开关 -->
        <div class="flex items-center justify-between border-t border-border/50 px-4 py-3.5">
          <div class="min-w-0">
            <div class="text-[13px] font-medium text-foreground">{{ t('general.cloud.remote.mirror') }}</div>
            <div class="mt-0.5 text-[11px] text-muted-foreground">
              {{ remote.peerJoined ? t('general.cloud.remote.mirrorPeerJoined') : t('general.cloud.remote.mirrorIdle') }}
            </div>
          </div>
          <Switch
            :model-value="remote.isMirroring"
            :disabled="!remote.isConnected || remote.loading"
            @update:model-value="onToggleMirroring"
          />
        </div>

        <!-- 会话码展示 -->
        <div v-if="remote.sessionCode" class="border-t border-border/50 px-4 py-5 text-center">
          <div class="text-[11px] text-muted-foreground">{{ t('general.cloud.remote.sessionCodeHint') }}</div>
          <div class="mt-2 select-all font-mono text-4xl font-semibold tracking-[0.3em] text-foreground">
            {{ remote.sessionCode }}
          </div>
          <Button variant="outline" size="sm" class="mt-3 h-8 gap-1.5 text-xs" @click="onCopyCode">
            <Copy class="size-3.5" />
            {{ t('general.cloud.remote.copy') }}
          </Button>
        </div>

        <!-- 错误提示 -->
        <div v-if="remote.lastError" class="border-t border-border/50 px-4 py-3">
          <div class="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <ShieldAlert class="mt-0.5 size-3.5 shrink-0 text-destructive" />
            <div class="min-w-0 flex-1">
              <p class="text-[11px] leading-relaxed text-destructive">{{ remote.lastError }}</p>
              <Button
                v-if="remote.lastError && (remote.lastError.includes('权限') || remote.lastError.toLowerCase().includes('permission'))"
                variant="link"
                size="sm"
                class="mt-1 h-auto p-0 text-[11px]"
                @click="remote.openPermissionSettings"
              >
                {{ t('general.cloud.remote.openPermSettings') }}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- 未登录 -->
      <div v-else class="px-4 py-4">
        <!-- 优势卡片两列网格 -->
        <div class="grid grid-cols-2 gap-2.5">
          <div
            v-for="feature in cloudFeatures"
            :key="feature.key"
            class="flex items-start gap-2.5 rounded-lg border border-border/50 bg-background/50 p-3"
          >
            <div class="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <component :is="feature.icon" class="size-3.5" />
            </div>
            <div class="min-w-0">
              <div class="text-[12px] font-medium text-foreground">{{ t('general.cloud.features.' + feature.key + '.title') }}</div>
              <div class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{{ t('general.cloud.features.' + feature.key + '.desc') }}</div>
            </div>
          </div>
        </div>

        <!-- 登录 / 注册按钮（无表单展开时显示） -->
        <div v-if="authMode === 'none'" class="mt-4 flex gap-2.5">
          <Button class="h-9 flex-1 gap-1.5 text-[13px]" @click="authMode = 'login'">
            <LogIn class="size-4" />
            {{ t('general.cloud.login') }}
          </Button>
          <Button variant="outline" class="h-9 flex-1 gap-1.5 text-[13px]" @click="authMode = 'register'">
            <UserPlus class="size-4" />
            {{ t('general.cloud.register') }}
          </Button>
        </div>

        <!-- 登录表单 -->
        <div v-if="authMode === 'login'" class="mt-4 space-y-3 rounded-lg border border-border bg-background/50 p-4">
          <div class="flex items-center gap-2">
            <LogIn class="size-4 text-primary" />
            <span class="text-[13px] font-semibold text-foreground">{{ t('general.cloud.auth.loginTitle') }}</span>
          </div>

          <div class="space-y-1.5">
            <Label class="text-[12px] font-medium">{{ t('general.cloud.auth.email') }}</Label>
            <Input
              v-model="loginForm.email"
              type="email"
              placeholder="you@example.com"
              :disabled="authLoading"
              @keyup.enter="handleLogin"
            />
          </div>

          <div class="space-y-1.5">
            <Label class="text-[12px] font-medium">{{ t('general.cloud.auth.password') }}</Label>
            <Input
              v-model="loginForm.password"
              type="password"
              placeholder="••••••••"
              :disabled="authLoading"
              @keyup.enter="handleLogin"
            />
          </div>

          <div class="flex items-start gap-2">
            <input
              v-model="loginAgreed"
              type="checkbox"
              class="mt-0.5 size-3.5 rounded border-input text-primary focus:ring-2 focus:ring-ring"
              :disabled="authLoading"
            />
            <span class="text-[11px] leading-relaxed text-muted-foreground">
              {{ t('general.cloud.auth.agreePrefix') }}
              <a href="https://ditingrag.com/cn/terms-of-service" target="_blank" class="text-primary hover:underline">{{ t('general.cloud.auth.terms') }}</a>
              {{ t('general.cloud.auth.and') }}
              <a href="https://ditingrag.com/cn/privacy-policy" target="_blank" class="text-primary hover:underline">{{ t('general.cloud.auth.privacy') }}</a>
            </span>
          </div>

          <div v-if="authError" class="rounded-md bg-destructive/10 px-3 py-2">
            <p class="text-[12px] text-destructive">{{ authError }}</p>
          </div>

          <div class="flex gap-2.5">
            <Button
              class="h-9 flex-1 gap-1.5 text-[13px]"
              :disabled="authLoading || !loginAgreed || !loginForm.email || !loginForm.password"
              @click="handleLogin"
            >
              <Spinner v-if="authLoading" size="sm" class="mr-1" />
              {{ authLoading ? t('general.cloud.auth.loginLoading') : t('general.cloud.auth.loginBtn') }}
            </Button>
            <Button variant="outline" class="h-9 text-[13px]" :disabled="authLoading" @click="resetAuth">
              {{ t('general.cloud.auth.cancel') }}
            </Button>
          </div>

          <p class="text-center text-[12px] text-muted-foreground">
            {{ t('general.cloud.auth.noAccount') }}
            <a class="cursor-pointer text-primary font-medium hover:underline" @click="switchToRegister">{{ t('general.cloud.auth.registerNow') }}</a>
          </p>
        </div>

        <!-- 注册表单 -->
        <div v-if="authMode === 'register'" class="mt-4 space-y-3 rounded-lg border border-border bg-background/50 p-4">
          <div class="flex items-center gap-2">
            <UserPlus class="size-4 text-primary" />
            <span class="text-[13px] font-semibold text-foreground">{{ t('general.cloud.auth.registerTitle') }}</span>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label class="text-[12px] font-medium">{{ t('general.cloud.auth.username') }}</Label>
              <Input
                v-model="registerForm.username"
                type="text"
                :placeholder="t('general.cloud.auth.usernamePlaceholder')"
                :disabled="authLoading"
              />
            </div>

            <div class="space-y-1.5">
              <Label class="text-[12px] font-medium">{{ t('general.cloud.auth.email') }}</Label>
              <Input
                v-model="registerForm.email"
                type="email"
                placeholder="you@example.com"
                :disabled="authLoading"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <Label class="text-[12px] font-medium">{{ t('general.cloud.auth.password') }}</Label>
              <Input
                v-model="registerForm.password"
                type="password"
                :placeholder="t('general.cloud.auth.passwordPlaceholder')"
                :disabled="authLoading"
              />
            </div>

            <div class="space-y-1.5">
              <Label class="text-[12px] font-medium">{{ t('general.cloud.auth.confirmPassword') }}</Label>
              <Input
                v-model="registerForm.confirmPassword"
                type="password"
                :placeholder="t('general.cloud.auth.confirmPasswordPlaceholder')"
                :disabled="authLoading"
                @keyup.enter="handleRegister"
              />
            </div>
          </div>

          <!-- 密码强度提示 -->
          <div v-if="registerForm.password" class="space-y-1">
            <div class="flex gap-1">
              <div v-for="i in 4" :key="i" class="h-1 flex-1 rounded-full transition-colors"
                :class="passwordStrength >= i ? strengthColor : 'bg-muted'"
              />
            </div>
            <p class="text-[11px] text-muted-foreground">{{ strengthLabel }}</p>
          </div>

          <div class="flex items-start gap-2">
            <input
              v-model="registerAgreed"
              type="checkbox"
              class="mt-0.5 size-3.5 rounded border-input text-primary focus:ring-2 focus:ring-ring"
              :disabled="authLoading"
            />
            <span class="text-[11px] leading-relaxed text-muted-foreground">
              {{ t('general.cloud.auth.agreePrefix') }}
              <a href="https://ditingrag.com/cn/terms-of-service" target="_blank" class="text-primary hover:underline">{{ t('general.cloud.auth.terms') }}</a>
              {{ t('general.cloud.auth.and') }}
              <a href="https://ditingrag.com/cn/privacy-policy" target="_blank" class="text-primary hover:underline">{{ t('general.cloud.auth.privacy') }}</a>
            </span>
          </div>

          <div v-if="authError" class="rounded-md bg-destructive/10 px-3 py-2">
            <p class="text-[12px] text-destructive">{{ authError }}</p>
          </div>

          <div class="flex gap-2.5">
            <Button
              class="h-9 flex-1 gap-1.5 text-[13px]"
              :disabled="authLoading || !registerAgreed || !registerForm.username || !registerForm.email || !registerForm.password || !registerForm.confirmPassword"
              @click="handleRegister"
            >
              <Spinner v-if="authLoading" size="sm" class="mr-1" />
              {{ authLoading ? t('general.cloud.auth.registerLoading') : t('general.cloud.auth.registerBtn') }}
            </Button>
            <Button variant="outline" class="h-9 text-[13px]" :disabled="authLoading" @click="resetAuth">
              {{ t('general.cloud.auth.cancel') }}
            </Button>
          </div>

          <p class="text-center text-[12px] text-muted-foreground">
            {{ t('general.cloud.auth.hasAccount') }}
            <a class="cursor-pointer text-primary font-medium hover:underline" @click="switchToLogin">{{ t('general.cloud.auth.backToLogin') }}</a>
          </p>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { User, LogOut, LogIn, UserPlus, Bot, AudioLines, ScanText, Boxes, Smartphone, MonitorPlay, RefreshCw, Copy, ShieldAlert } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'
import { useRemoteStore } from '@/stores/remote'

const { t } = useI18n()

// ===== 远程控制状态 =====
const remote = useRemoteStore()

// ===== Diting Cloud 账户状态 =====
const isLoggedIn = ref(false)
const userEmail = ref('')

// ===== 认证表单状态 =====
const authMode = ref('none') // 'none' | 'login' | 'register'
const authLoading = ref(false)
const authError = ref('')

// 登录表单
const loginForm = ref({ email: '', password: '' })
const loginAgreed = ref(false)

// 注册表单
const registerForm = ref({ username: '', email: '', password: '', confirmPassword: '' })
const registerAgreed = ref(false)

/**
 * 强密码验证：至少 8 位，必须包含大小写字母和数字
 * @param pwd 密码明文
 * @returns 错误信息，通过返回空字符串
 */
function validateStrongPassword(pwd) {
  if (pwd.length < 8) return t('general.cloud.auth.errPwdTooShort')
  if (!/[a-z]/.test(pwd)) return t('general.cloud.auth.errPwdNoLower')
  if (!/[A-Z]/.test(pwd)) return t('general.cloud.auth.errPwdNoUpper')
  if (!/\d/.test(pwd)) return t('general.cloud.auth.errPwdNoDigit')
  return ''
}

/** 密码强度等级 0-4 */
const passwordStrength = computed(() => {
  const pwd = registerForm.value.password
  if (!pwd) return 0
  let score = 0
  if (pwd.length >= 8) score++
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++
  if (/\d/.test(pwd)) score++
  if (/[^a-zA-Z0-9]/.test(pwd) || pwd.length >= 12) score++
  return score
})

/** 密码强度条颜色 */
const strengthColor = computed(() => {
  const s = passwordStrength.value
  if (s <= 1) return 'bg-destructive'
  if (s === 2) return 'bg-yellow-500'
  if (s === 3) return 'bg-blue-500'
  return 'bg-green-500'
})

/** 密码强度文字 */
const strengthLabel = computed(() => {
  const s = passwordStrength.value
  if (s <= 1) return t('general.cloud.auth.strengthWeak')
  if (s === 2) return t('general.cloud.auth.strengthMedium')
  if (s === 3) return t('general.cloud.auth.strengthStrong')
  return t('general.cloud.auth.strengthVeryStrong')
})

const cloudFeatures = [
  { key: 'llm', icon: Bot },
  { key: 'voice', icon: AudioLines },
  { key: 'ocr', icon: ScanText },
  { key: 'vector', icon: Boxes },
  { key: 'mobile', icon: Smartphone },
  { key: 'sync', icon: User },
]

/** 加载 Diting Cloud 登录状态 */
async function loadCloudStatus() {
  try {
    const res = await ipc.invoke(ipcApiRoute.auth.getStatus)
    if (res && res.code === 0 && res.data) {
      isLoggedIn.value = !!res.data.isLoggedIn
      userEmail.value = res.data.user?.email || ''
    }
  } catch {
    // 静默忽略
  }
}

/** 重置认证表单 */
function resetAuth() {
  authMode.value = 'none'
  authError.value = ''
  loginForm.value = { email: '', password: '' }
  loginAgreed.value = false
  registerForm.value = { username: '', email: '', password: '', confirmPassword: '' }
  registerAgreed.value = false
}

/** 切换到注册表单 */
function switchToRegister() {
  authError.value = ''
  authMode.value = 'register'
}

/** 切换到登录表单 */
function switchToLogin() {
  authError.value = ''
  authMode.value = 'login'
}

/** 处理登录 */
async function handleLogin() {
  if (!loginAgreed.value) {
    authError.value = t('general.cloud.auth.errAgree')
    return
  }
  if (!loginForm.value.email || !loginForm.value.password) {
    authError.value = t('general.cloud.auth.errEmailPwd')
    return
  }

  authError.value = ''
  authLoading.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.auth.login, {
      email: loginForm.value.email,
      password: loginForm.value.password,
    })
    if (res.code === 0 && res.data) {
      isLoggedIn.value = true
      userEmail.value = res.data.user?.email || loginForm.value.email
      resetAuth()
      // 登录成功后主进程会自动建立信令连接，这里拉一次状态以刷新指示灯
      remote.fetchStatus()
    } else {
      authError.value = res.message || t('general.cloud.auth.errLoginFailed')
    }
  } catch (err) {
    authError.value = err instanceof Error ? err.message : String(err)
  } finally {
    authLoading.value = false
  }
}

/** 处理注册 */
async function handleRegister() {
  if (!registerAgreed.value) {
    authError.value = t('general.cloud.auth.errAgree')
    return
  }
  if (!registerForm.value.username || !registerForm.value.email || !registerForm.value.password) {
    authError.value = t('general.cloud.auth.errFillAll')
    return
  }
  if (registerForm.value.password !== registerForm.value.confirmPassword) {
    authError.value = t('general.cloud.auth.errPwdMismatch')
    return
  }
  const pwdErr = validateStrongPassword(registerForm.value.password)
  if (pwdErr) {
    authError.value = pwdErr
    return
  }

  authError.value = ''
  authLoading.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.auth.register, {
      username: registerForm.value.username,
      email: registerForm.value.email,
      password: registerForm.value.password,
    })
    if (res.code === 0) {
      // 注册成功，跳到登录表单，预填邮箱
      authError.value = ''
      authMode.value = 'login'
      loginForm.value = { email: registerForm.value.email, password: '' }
      loginAgreed.value = false
      registerForm.value = { username: '', email: '', password: '', confirmPassword: '' }
      registerAgreed.value = false
    } else {
      authError.value = res.message || t('general.cloud.auth.errRegisterFailed')
    }
  } catch (err) {
    authError.value = err instanceof Error ? err.message : String(err)
  } finally {
    authLoading.value = false
  }
}

/** 退出登录 */
async function onLogout() {
  try {
    await ipc.invoke(ipcApiRoute.auth.logout)
  } catch {
    // 静默忽略
  }
  isLoggedIn.value = false
  userEmail.value = ''
}

// ===== 远程控制交互 =====

/** 远程连接开关：连接 / 断开信令服务 */
async function onToggleRemote(enabled) {
  if (enabled) {
    await remote.connect()
  } else {
    await remote.stopMirroring()
    await remote.disconnect()
  }
}

/** 远程镜像开关：开启后生成 6 位连接码 */
async function onToggleMirroring(enabled) {
  if (enabled) {
    // 开启前先确认权限，失败时 store 会记录错误并展示引导
    const perm = await remote.checkPermission()
    if (!perm.granted) {
      remote.lastError = perm.degraded ? `${perm.message}。${perm.degraded}` : perm.message
      return
    }
    await remote.startMirroring()
  } else {
    await remote.stopMirroring()
  }
}

/** 复制会话码到剪贴板 */
async function onCopyCode() {
  if (!remote.sessionCode) return
  try {
    await navigator.clipboard.writeText(remote.sessionCode)
  } catch (err) {
    console.error('[remote] 复制失败:', err)
  }
}

onMounted(() => {
  loadCloudStatus()
  // 监听主进程推送的远程状态变化，并拉一次当前状态
  remote.bindStatusListener()
  remote.fetchStatus()
})
</script>
