
/**
 * Definition of communication channel between main process and rendering process
 * separator: "/" | "." ; (Please check the config file properties: channelSeparator)
 * format：controller/filename/method | controller.filename.method
 * Definition of communication channels between main process and rendering process
 */
const ipcApiRoute = {
  example: {
    test: 'controller/example/test',
  },
  framework: {
    checkForUpdater: 'controller/framework/checkForUpdater',
    downloadApp: 'controller/framework/downloadApp',
    jsondbOperation: 'controller/framework/jsondbOperation',
    sqlitedbOperation: 'controller/framework/sqlitedbOperation',
    uploadFile: 'controller/framework/uploadFile',
    checkHttpServer: 'controller/framework/checkHttpServer',
    doHttpRequest: 'controller/framework/doHttpRequest',
    doSocketRequest: 'controller/framework/doSocketRequest',
    ipcInvokeMsg: 'controller/framework/ipcInvokeMsg',
    ipcSendSyncMsg: 'controller/framework/ipcSendSyncMsg',
    ipcSendMsg: 'controller/framework/ipcSendMsg',
    startJavaServer: 'controller/framework/startJavaServer',
    closeJavaServer: 'controller/framework/closeJavaServer',
    someJob: 'controller/framework/someJob',
    timerJobProgress: 'controller/framework/timerJobProgress',
    createPool: 'controller/framework/createPool',
    createPoolNotice: 'controller/framework/createPoolNotice',
    someJobByPool: 'controller/framework/someJobByPool',
    hello: 'controller/framework/hello',
    openSoftware: 'controller/framework/openSoftware', 
  },

  // os
  os: {
    messageShow: 'controller/os/messageShow',
    messageShowConfirm: 'controller/os/messageShowConfirm',
    selectFolder: 'controller/os/selectFolder',
    selectPic: 'controller/os/selectPic',
    openDirectory: 'controller/os/openDirectory',
    loadViewContent: 'controller/os/loadViewContent',
    removeViewContent: 'controller/os/removeViewContent',
    createWindow: 'controller/os/createWindow',
    getWCid: 'controller/os/getWCid',
    sendNotification: 'controller/os/sendNotification',
    initPowerMonitor: 'controller/os/initPowerMonitor',
    getScreen: 'controller/os/getScreen',
    autoLaunch: 'controller/os/autoLaunch',
    setTheme: 'controller/os/setTheme',
    getTheme: 'controller/os/getTheme',
    window1ToWindow2: 'controller/os/window1ToWindow2',
    window2ToWindow1: 'controller/os/window2ToWindow1',
  },

  // effect
  effect: {
    selectFile: 'controller/effect/selectFile',
    loginWindow: 'controller/effect/loginWindow',
    restoreWindow: 'controller/effect/restoreWindow',
  },

  // cross
  cross: {
    crossInfo: 'controller/cross/info',
    getCrossUrl: 'controller/cross/getUrl',
    killCrossServer: 'controller/cross/killServer',
    createCrossServer: 'controller/cross/createServer',
    requestApi: 'controller/cross/requestApi',
  },

  // 文件管理
  file: {
    addFolder: 'controller/file/addFolder',
    getFolderList: 'controller/file/getFolderList',
    getSubFolders: 'controller/file/getSubFolders',
    getFiles: 'controller/file/getFiles',
    deleteFolder: 'controller/file/deleteFolder',
    toggleSync: 'controller/file/toggleSync',
    registerSyncCallback: 'controller/file/registerSyncCallback',
    onSyncChange: 'controller/file/onSyncChange',
    // RAG 向量化
    startIngestion: 'controller/file/startIngestion',
    reingestFile: 'controller/file/reingestFile',
    getRagStats: 'controller/file/getRagStats',
    checkFileSupported: 'controller/file/checkFileSupported',
    onRagProgress: 'controller/file/onRagProgress',
    // 文件查看
    getFileInfo: 'controller/file/getFileInfo',
    getFileData: 'controller/file/getFileData',
    // 新建文件
    createFile: 'controller/file/createFile',
    // 保存文件数据
    saveFileData: 'controller/file/saveFileData',
    // 重命名文件
    renameFile: 'controller/file/renameFile',
  },

  // LLM 模型管理
  llm: {
    modelOperation: 'controller/llm/modelOperation',
  },

  // QA 知识问答
  qa: {
    // 同步问答（IPC）
    ask: 'controller/qa/ask',
    // 流式问答：通过 HTTP SSE 调用（不再使用 IPC）
    streamAsk: 'controller/qa/streamAsk',
    // 历史记录管理
    recordOperation: 'controller/qa/recordOperation',
    // LLM 用量统计
    metricsOperation: 'controller/qa/metricsOperation',
  },

  // Assistant 助手
  assistant: {
    // 会话管理（创建/列表/重命名/删除/详情）
    sessionOperation: 'controller/assistant/sessionOperation',
    // 获取会话对话上下文（恢复历史）
    getConversationContext: 'controller/assistant/getConversationContext',
    // 流式聊天：通过 HTTP SSE 调用（不再使用 IPC）
    streamChat: 'controller/assistant/streamChat',
  }
}

/**
 * Customize Channel
 * Format: Custom (recommended to add a prefix)
 */
const specialIpcRoute = {
  appUpdater: 'custom/app/updater', // updater channel
}

export {
  ipcApiRoute, 
  specialIpcRoute
}

