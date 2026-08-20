/**
 * 更新状态 Store (Pinia)
 *
 * 管理应用更新状态，订阅主进程推送的更新事件。
 * 参考 Proma 的 updater atom 架构，适配 Vue 3 + Pinia。
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { ipc } from '@/utils/ipcRenderer';

/** 下载进度 */
export const DownloadProgress = {
  percent: 0,
  transferred: 0,
  total: 0,
  bytesPerSecond: 0,
};

/**
 * 更新状态类型
 * @typedef {Object} UpdateStatus
 * @property {'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'} status
 * @property {string=} version
 * @property {string=} releaseNotes
 * @property {DownloadProgress=} progress
 * @property {string=} error
 */

/** IPC 通道常量（与主进程 auto_updater.ts 保持一致） */
const UPDATER_CHANNELS = {
  CHECK_FOR_UPDATES: 'updater:check',
  GET_STATUS: 'updater:get-status',
  ON_STATUS_CHANGED: 'updater:status-changed',
  INSTALL_WHEN_IDLE: 'updater:install-when-idle',
  CANCEL_IDLE_INSTALL: 'updater:cancel-idle-install',
  QUIT_AND_INSTALL: 'updater:quit-and-install',
};

/** GitHub Release 通道 */
const GITHUB_CHANNELS = {
  GET_LATEST: 'github-release:get-latest',
  LIST: 'github-release:list',
  GET_BY_TAG: 'github-release:get-by-tag',
};

/** 旧版兼容通道 */
const LEGACY_CHANNEL = 'custom/app/updater';

export const useUpdaterStore = defineStore('updater', () => {
  // ========== 状态 ==========
  /** 当前更新状态 */
  const status = ref('idle');
  /** 新版本号 */
  const version = ref('');
  /** 发布说明 */
  const releaseNotes = ref('');
  /** 下载进度 */
  const progress = ref({ percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 });
  /** 错误信息 */
  const error = ref('');
  /** 是否已初始化 */
  const initialized = ref(false);
  /** 是否已请求空闲安装 */
  const idleInstallScheduled = ref(false);

  // ========== 计算属性 ==========
  /** 是否有可用更新 */
  const hasUpdate = computed(() => {
    return ['available', 'downloading', 'downloaded'].includes(status.value);
  });

  /** 是否正在检查或下载 */
  const isChecking = computed(() => {
    return status.value === 'checking' || status.value === 'downloading';
  });

  // ========== 初始化 ==========
  /** 初始化更新状态订阅 */
  function initialize() {
    if (initialized.value) return;
    initialized.value = true;

    // 监听新通道：status-changed
    if (ipc) {
      ipc.on(UPDATER_CHANNELS.ON_STATUS_CHANGED, (_event, data) => {
        updateFromStatus(data);
      });

      // 旧版兼容通道
      ipc.on(LEGACY_CHANNEL, (_event, data) => {
        try {
          const parsed = typeof data === 'string' ? JSON.parse(data) : data;
          updateFromLegacyData(parsed);
        } catch (e) {
          // 忽略解析失败
        }
      });
    }

    // 获取初始状态
    ipc
      ?.invoke(UPDATER_CHANNELS.GET_STATUS)
      .then((data) => {
        updateFromStatus(data);
      })
      .catch(() => {
        // IPC 调用失败，保持 idle
      });
  }

  /** 从新通道状态对象更新 */
  function updateFromStatus(data) {
    if (!data || !data.status) return;
    status.value = data.status;
    version.value = data.version || '';
    releaseNotes.value = data.releaseNotes || '';
    error.value = data.error || '';
    if (data.progress) {
      progress.value = data.progress;
    }
    // 非 downloaded 状态重置空闲安装
    if (data.status !== 'downloaded') {
      idleInstallScheduled.value = false;
    }
  }

  /** 从旧版兼容数据更新 */
  function updateFromLegacyData(data) {
    if (!data) return;
    const statusMap = {
      '-1': 'error',
      '1': 'available',
      '2': 'not-available',
      '3': 'downloading',
      '4': 'downloaded',
    };
    const newStatus = statusMap[String(data.status)] || 'idle';
    status.value = newStatus;
    if (data.desc) {
      error.value = newStatus === 'error' ? String(data.desc) : '';
    }
    if (data.percentNumber !== undefined) {
      progress.value = {
        ...progress.value,
        percent: data.percentNumber,
      };
    }
  }

  // ========== 操作 ==========
  /** 手动检查更新 */
  async function checkForUpdates() {
    try {
      await ipc?.invoke(UPDATER_CHANNELS.CHECK_FOR_UPDATES);
    } catch (e) {
      console.error('[更新] 检查更新失败:', e);
    }
  }

  /** 请求空闲时安装 */
  async function installWhenIdle() {
    try {
      const result = await ipc?.invoke(UPDATER_CHANNELS.INSTALL_WHEN_IDLE);
      idleInstallScheduled.value = !!result;
      return result;
    } catch (e) {
      console.error('[更新] 请求空闲安装失败:', e);
      idleInstallScheduled.value = false;
      return false;
    }
  }

  /** 取消空闲安装 */
  async function cancelIdleInstall() {
    try {
      await ipc?.invoke(UPDATER_CHANNELS.CANCEL_IDLE_INSTALL);
      idleInstallScheduled.value = false;
    } catch (e) {
      console.error('[更新] 取消空闲安装失败:', e);
    }
  }

  /** 立即退出并安装 */
  async function quitAndInstall() {
    try {
      await ipc?.invoke(UPDATER_CHANNELS.QUIT_AND_INSTALL);
    } catch (e) {
      console.error('[更新] 安装失败:', e);
    }
  }

  // ========== 应用版本号 ==========
  /** 获取应用版本号 */
  async function getAppVersion() {
    try {
      const v = await ipc?.invoke('updater:get-app-version');
      return v || '';
    } catch (e) {
      console.error('[更新] 获取版本号失败:', e);
      return '';
    }
  }

  // ========== GitHub Release ==========
  /** 获取最新 Release */
  async function getLatestRelease() {
    try {
      return await ipc?.invoke(GITHUB_CHANNELS.GET_LATEST);
    } catch (e) {
      console.error('[更新] 获取最新 Release 失败:', e);
      return null;
    }
  }

  /** 获取 Release 列表 */
  async function listReleases(options) {
    try {
      return (await ipc?.invoke(GITHUB_CHANNELS.LIST, options)) || [];
    } catch (e) {
      console.error('[更新] 获取 Release 列表失败:', e);
      return [];
    }
  }

  /** 根据标签获取 Release */
  async function getReleaseByTag(tag) {
    try {
      return await ipc?.invoke(GITHUB_CHANNELS.GET_BY_TAG, tag);
    } catch (e) {
      console.error('[更新] 获取 Release 失败:', e);
      return null;
    }
  }

  return {
    // 状态
    status,
    version,
    releaseNotes,
    progress,
    error,
    initialized,
    idleInstallScheduled,
    // 计算属性
    hasUpdate,
    isChecking,
    // 初始化
    initialize,
    // 操作
    checkForUpdates,
    installWhenIdle,
    cancelIdleInstall,
    quitAndInstall,
    // GitHub Release
    getLatestRelease,
    listReleases,
    getReleaseByTag,
    // 应用版本号
    getAppVersion,
  };
});
