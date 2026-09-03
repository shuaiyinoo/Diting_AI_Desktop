/**
 * 远程控制状态管理（受控端）
 *
 * 所有操作通过 IPC 转发到 Electron 主进程，前端不直接连接后端。
 * 主进程会在状态变化时主动推送 'remote:status'，这里监听并同步。
 */

import { defineStore } from 'pinia'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ipcApiRoute, remoteStatusChannel } from '@/api'
import { ipc } from '@/utils/ipcRenderer'

/** 连接状态 i18n key 映射 */
const CONN_STATE_KEY = {
  disconnected: 'statusBar.connDisconnected',
  connecting: 'statusBar.connConnecting',
  connected: 'statusBar.connConnected',
  error: 'statusBar.connError',
}

export const useRemoteStore = defineStore('remote', () => {
  // ===== 状态 =====
  /** disconnected | connecting | connected | error */
  const connState = ref('disconnected')
  /** 6 位会话码，未开启时为 null */
  const sessionCode = ref(null)
  /** 控制端是否已接入 */
  const peerJoined = ref(false)
  /** 最近一次错误 */
  const lastError = ref(null)
  /** 后端地址 */
  const baseUrl = ref('')
  /** 操作进行中（防重复点击） */
  const loading = ref(false)

  // ===== 计算属性 =====
  const isConnected = computed(() => connState.value === 'connected')
  const isMirroring = computed(() => !!sessionCode.value)
  /** 返回连接状态的 i18n key，组件用 t() 翻译 */
  const connStateText = computed(() => CONN_STATE_KEY[connState.value] || 'statusBar.connUnknown')

  /** 状态指示灯颜色 */
  const stateColor = computed(() => {
    switch (connState.value) {
      case 'connected':
        return 'bg-green-500'
      case 'connecting':
        return 'bg-amber-500'
      case 'error':
        return 'bg-red-500'
      default:
        return 'bg-muted-foreground/40'
    }
  })

  // ===== Actions =====

  /** 拉取一次状态 */
  async function fetchStatus() {
    try {
      const res = await ipc.invoke(ipcApiRoute.remote.getStatus)
      if (res.code === 0 && res.data) {
        applyStatus(res.data)
      }
    } catch (err) {
      console.error('[remote] 获取状态失败:', err)
    }
  }

  /** 主动连接信令服务 */
  async function connect() {
    loading.value = true
    try {
      const res = await ipc.invoke(ipcApiRoute.remote.connect)
      if (res.code !== 0) {
        lastError.value = res.message || '连接失败'
        return { success: false, message: res.message }
      }
      if (res.data) applyStatus(res.data)
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      lastError.value = msg
      return { success: false, message: msg }
    } finally {
      loading.value = false
    }
  }

  /** 断开信令服务 */
  async function disconnect() {
    loading.value = true
    try {
      await ipc.invoke(ipcApiRoute.remote.disconnect)
      sessionCode.value = null
      peerJoined.value = false
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, message: msg }
    } finally {
      loading.value = false
    }
  }

  /** 开启远程镜像，返回会话码 */
  async function startMirroring() {
    loading.value = true
    lastError.value = null
    try {
      const res = await ipc.invoke(ipcApiRoute.remote.startMirroring)
      if (res.code !== 0 || !res.data?.sessionCode) {
        lastError.value = res.message || '开启失败'
        return { success: false, message: res.message }
      }
      sessionCode.value = res.data.sessionCode
      return { success: true, sessionCode: res.data.sessionCode }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      lastError.value = msg
      return { success: false, message: msg }
    } finally {
      loading.value = false
    }
  }

  /** 关闭远程镜像 */
  async function stopMirroring() {
    loading.value = true
    try {
      await ipc.invoke(ipcApiRoute.remote.stopMirroring)
      sessionCode.value = null
      peerJoined.value = false
      return { success: true }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, message: msg }
    } finally {
      loading.value = false
    }
  }

  /** 检查屏幕捕获权限 */
  async function checkPermission() {
    try {
      const res = await ipc.invoke(ipcApiRoute.remote.checkPermission)
      if (res.code === 0 && res.data) {
        return res.data
      }
      return { granted: false, message: res.message || '权限检查失败' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { granted: false, message: msg }
    }
  }

  /** 打开系统权限设置页（macOS） */
  async function openPermissionSettings() {
    try {
      await ipc.invoke(ipcApiRoute.remote.openPermissionSettings)
    } catch (err) {
      console.error('[remote] 打开权限设置失败:', err)
    }
  }

  // ===== 内部工具 =====

  function applyStatus(data) {
    if (data.connState) connState.value = data.connState
    sessionCode.value = data.sessionCode ?? null
    peerJoined.value = !!data.peerJoined
    lastError.value = data.lastError ?? null
    if (data.baseUrl) baseUrl.value = data.baseUrl
  }

  /** 监听主进程推送的状态变化 */
  let statusListener = null

  function bindStatusListener() {
    if (!ipc || statusListener) return
    statusListener = (_event, data) => {
      if (data) applyStatus(data)
    }
    ipc.on(remoteStatusChannel, statusListener)
  }

  function unbindStatusListener() {
    if (ipc && statusListener) {
      ipc.removeListener(remoteStatusChannel, statusListener)
      statusListener = null
    }
  }

  onMounted(() => {
    bindStatusListener()
  })

  onUnmounted(() => {
    unbindStatusListener()
  })

  return {
    // 状态
    connState,
    sessionCode,
    peerJoined,
    lastError,
    baseUrl,
    loading,
    // 计算属性
    isConnected,
    isMirroring,
    connStateText,
    stateColor,
    // Actions
    fetchStatus,
    connect,
    disconnect,
    startMirroring,
    stopMirroring,
    checkPermission,
    openPermissionSettings,
    // 监听器（供组件在 setup 中手动绑定）
    bindStatusListener,
    unbindStatusListener,
  }
})
