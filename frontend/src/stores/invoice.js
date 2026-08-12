/**
 * 票据识别模块状态管理（独立模块，不与其他模块混用）
 *
 * 职责：
 *   - 授权文件夹列表管理（添加/删除/选中）
 *   - 文件树加载与缓存（含 processed/archived 状态）
 *   - 实时文件变化监听（通过 IPC 接收后端推送）
 *   - 归档状态切换
 *   - OCR 处理进度监听
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'

export const useInvoiceStore = defineStore('invoice', () => {
  // ===== 授权文件夹列表 =====
  const folderList = ref([])
  const folderLoading = ref(false)
  const selectedFolderId = ref(null)

  // ===== 文件树 =====
  const fileTree = ref([])
  const fileLoading = ref(false)
  const folderPathDisplay = ref('')

  // ===== 当前选中的文件 =====
  const selectedFile = ref(null)

  // ===== OCR 处理状态 =====
  const ocrProcessing = ref(false)
  const ocrProgressInfo = ref(null) // { fileId, status, fileName, text?, error? }

  // ===== Getters =====
  const selectedFolder = computed(() =>
    folderList.value.find((f) => f.id === selectedFolderId.value),
  )

  /** 统计：已处理/未处理/已归档 */
  const stats = computed(() => {
    const files = fileTree.value.filter((f) => !f.isDir)
    return {
      total: files.length,
      processed: files.filter((f) => f.processed === 1).length,
      unprocessed: files.filter((f) => f.processed === 0).length,
      archived: files.filter((f) => f.archived === 1).length,
    }
  })

  // ===== Actions =====

  /** 加载授权文件夹列表 */
  async function loadFolderList() {
    folderLoading.value = true
    try {
      const data = await ipc.invoke(ipcApiRoute.invoice.getFolderList)
      folderList.value = data || []
      if (folderList.value.length > 0 && !selectedFolderId.value) {
        selectFolder(folderList.value[0].id)
      }
    } catch (err) {
      console.error('[invoice] 加载文件夹列表失败:', err)
    } finally {
      folderLoading.value = false
    }
  }

  /** 选中文件夹 */
  function selectFolder(folderId) {
    selectedFolderId.value = folderId
    selectedFile.value = null
  }

  /** 添加授权文件夹 */
  async function addFolder() {
    try {
      const result = await ipc.invoke(ipcApiRoute.invoice.addFolder)
      if (result.success) {
        folderList.value = result.folderList || []
        if (folderList.value.length > 0) {
          selectFolder(folderList.value[folderList.value.length - 1].id)
        }
      }
      return result
    } catch (err) {
      console.error('[invoice] 添加文件夹失败:', err)
      return null
    }
  }

  /** 删除授权文件夹 */
  async function deleteFolder(folderId) {
    try {
      const result = await ipc.invoke(ipcApiRoute.invoice.deleteFolder, { folderId })
      if (result.success) {
        folderList.value = result.folderList || []
        if (selectedFolderId.value === folderId) {
          if (folderList.value.length > 0) {
            selectFolder(folderList.value[0].id)
          } else {
            selectedFolderId.value = null
            fileTree.value = []
          }
        }
      }
      return result
    } catch (err) {
      console.error('[invoice] 删除文件夹失败:', err)
      return null
    }
  }

  /** 加载文件树 */
  async function loadFileTree() {
    if (!selectedFolderId.value) {
      fileTree.value = []
      folderPathDisplay.value = ''
      return
    }
    fileLoading.value = true
    try {
      const result = await ipc.invoke(ipcApiRoute.invoice.getFileTree, {
        folderId: selectedFolderId.value,
      })
      if (result.success) {
        fileTree.value = result.files || []
        folderPathDisplay.value = result.folderPath || ''
      } else {
        fileTree.value = []
        folderPathDisplay.value = result.folderPath || ''
      }
    } catch (err) {
      console.error('[invoice] 加载文件树失败:', err)
      fileTree.value = []
    } finally {
      fileLoading.value = false
    }
  }

  /** 设置选中文件 */
  function setSelectedFile(file) {
    selectedFile.value = file
  }

  /** 切换文件归档状态 */
  async function toggleArchived(fileId) {
    try {
      const result = await ipc.invoke(ipcApiRoute.invoice.toggleArchived, { fileId })
      if (result.success && result.file) {
        // 更新本地文件树中的记录
        const file = fileTree.value.find((f) => f.id === fileId)
        if (file) {
          file.archived = result.file.archived
        }
        // 更新选中文件
        if (selectedFile.value?.id === fileId) {
          selectedFile.value = { ...selectedFile.value, archived: result.file.archived }
        }
      }
      return result
    } catch (err) {
      console.error('[invoice] 切换归档状态失败:', err)
      return null
    }
  }

  /** 获取文件详情（图片 base64 + OCR 结果） */
  async function getFileDetail(fileId) {
    try {
      const result = await ipc.invoke(ipcApiRoute.invoice.getFileDetail, { fileId })
      return result
    } catch (err) {
      console.error('[invoice] 获取文件详情失败:', err)
      return { success: false }
    }
  }

  /** 重新识别：清除旧数据并重新 OCR */
  async function reRecognize(fileId) {
    try {
      const result = await ipc.invoke(ipcApiRoute.invoice.reRecognize, { fileId })
      return result
    } catch (err) {
      console.error('[invoice] 重新识别失败:', err)
      return { success: false, error: String(err) }
    }
  }

  /** AI 结构化提取 */
  async function extractInvoice(fileId) {
    try {
      const result = await ipc.invoke(ipcApiRoute.invoice.extractInvoice, { fileId })
      return result
    } catch (err) {
      console.error('[invoice] AI 提取失败:', err)
      return { success: false, error: String(err) }
    }
  }

  /** 注册文件变化监听 */
  function registerSyncCallback() {
    ipc.invoke(ipcApiRoute.invoice.registerSyncCallback).catch(() => {})
  }

  /** 监听文件变化事件 */
  function onSyncChange(callback) {
    const handler = (_event, result) => {
      const { folderId } = result
      callback(folderId)
    }
    ipc.on(ipcApiRoute.invoice.onSyncChange, handler)
    return () => {
      ipc.removeAllListeners(ipcApiRoute.invoice.onSyncChange)
    }
  }

  /** 监听 OCR 处理进度 */
  function onOcrProgress(callback) {
    const handler = (_event, info) => {
      ocrProcessing.value = info.status === 'processing'
      ocrProgressInfo.value = info
      // 当 OCR 完成或失败时，刷新文件树中对应文件的状态
      if (info.status === 'done' || info.status === 'failed') {
        const file = fileTree.value.find((f) => f.id === info.fileId)
        if (file) {
          file.processed = info.status === 'done' ? 1 : 0
        }
      }
      callback(info)
    }
    ipc.on(ipcApiRoute.invoice.onOcrProgress, handler)
    return () => {
      ipc.removeAllListeners(ipcApiRoute.invoice.onOcrProgress)
    }
  }

  return {
    // 状态
    folderList,
    folderLoading,
    selectedFolderId,
    fileTree,
    fileLoading,
    folderPathDisplay,
    selectedFile,
    ocrProcessing,
    ocrProgressInfo,
    // Getters
    selectedFolder,
    stats,
    // Actions
    loadFolderList,
    selectFolder,
    addFolder,
    deleteFolder,
    loadFileTree,
    setSelectedFile,
    toggleArchived,
    getFileDetail,
    reRecognize,
    extractInvoice,
    registerSyncCallback,
    onSyncChange,
    onOcrProgress,
  }
})
