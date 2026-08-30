/**
 * 认证状态管理
 *
 * 管理 Desktop 客户端的登录/注册/退出状态。
 * 所有请求通过 IPC 转发到 Electron 主进程，前端不直接调用后端接口。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'

export const useAuthStore = defineStore('auth', () => {
  // ===== 状态 =====
  const isLoggedIn = ref(false)
  const user = ref(null)
  const loading = ref(false)

  // ===== 计算属性 =====
  const username = computed(() => user.value?.username || '')
  const nickname = computed(() => user.value?.nickname || '')
  const email = computed(() => user.value?.email || '')

  // ===== Actions =====

  /** 从 Electron 主进程同步登录状态 */
  async function syncStatus() {
    try {
      const res = await ipc.invoke(ipcApiRoute.auth.getStatus)
      if (res.code === 0 && res.data) {
        isLoggedIn.value = res.data.isLoggedIn
        user.value = res.data.user || null
      }
    } catch (err) {
      console.error('[auth] 同步状态失败:', err)
    }
  }

  /**
   * 邮箱+密码登录
   * @param {{ email: string, password: string }} params
   */
  async function login(params) {
    loading.value = true
    try {
      const res = await ipc.invoke(ipcApiRoute.auth.login, params)
      if (res.code === 0 && res.data) {
        isLoggedIn.value = res.data.isLoggedIn
        user.value = res.data.user || null
        return { success: true }
      }
      return { success: false, message: res.message || '登录失败' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, message: msg }
    } finally {
      loading.value = false
    }
  }

  /**
   * 邮箱+用户名+密码注册
   * @param {{ username: string, email: string, password: string }} params
   */
  async function register(params) {
    loading.value = true
    try {
      const res = await ipc.invoke(ipcApiRoute.auth.register, params)
      if (res.code === 0 && res.data) {
        isLoggedIn.value = res.data.isLoggedIn
        user.value = res.data.user || null
        return { success: true }
      }
      return { success: false, message: res.message || '注册失败' }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, message: msg }
    } finally {
      loading.value = false
    }
  }

  /** 退出登录 */
  async function logout() {
    try {
      await ipc.invoke(ipcApiRoute.auth.logout)
    } catch (err) {
      console.error('[auth] 退出失败:', err)
    } finally {
      isLoggedIn.value = false
      user.value = null
    }
  }

  return {
    // 状态
    isLoggedIn,
    user,
    loading,
    // 计算属性
    username,
    nickname,
    email,
    // Actions
    syncStatus,
    login,
    register,
    logout,
  }
})
