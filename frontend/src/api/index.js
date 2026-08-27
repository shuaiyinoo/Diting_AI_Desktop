
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
    // 重新扫描单个文件夹（远程从服务器拉取最新结构）
    refreshFolder: 'controller/file/refreshFolder',
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
    // 远程扫描完成通知
    onRemoteScanDone: 'controller/file/onRemoteScanDone',
    // 文件查看
    getFileInfo: 'controller/file/getFileInfo',
    getFileData: 'controller/file/getFileData',
    // 新建文件
    createFile: 'controller/file/createFile',
    // 保存文件数据
    saveFileData: 'controller/file/saveFileData',
    // 重命名文件
    renameFile: 'controller/file/renameFile',
    // 添加网络协议文件夹（FTP/FTPS/SFTP/SMB/WebDAV/S3）
    addRemoteFolder: 'controller/file/addRemoteFolder',
    // 更新远程协议文件夹配置
    updateRemoteFolder: 'controller/file/updateRemoteFolder',
    // 测试远程连接
    testRemoteConnection: 'controller/file/testRemoteConnection',
    // 浏览远程目录（单层，用于路径选择器）
    browseRemotePath: 'controller/file/browseRemotePath',
  },

  // LLM 模型管理
  llm: {
    modelOperation: 'controller/llm/modelOperation',
  },

  // 语音模型管理
  voice: {
    // 远程语音模型操作（增删改查，同 LLM 模式）
    remoteOperation: 'controller/voice/remoteOperation',
    // 本地 Whisper 模型操作
    localOperation: 'controller/voice/localOperation',
    // 麦克风权限
    micPermission: 'controller/voice/micPermission',
    // 流式转写：启动会话（预加载模型）
    startSession: 'controller/voice/startSession',
    // 流式转写：实时音频数据通道（send）
    audioData: 'controller/voice/audio-data',
    // 流式转写：停止转写
    stopTranscription: 'controller/voice/stop-transcription',
    // 流式转写：转写结果推送通道（on）
    onTranscriptionResult: 'controller/voice/onTranscriptionResult',
    // 会话状态
    getSessionStatus: 'controller/voice/getSessionStatus',
    // 下载进度回调通道
    onDownloadProgress: 'controller/voice/onDownloadProgress',
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
  },

  // 任务/日程/定时任务（Planning + Automation）
  planning: {
    // Todo
    listTodos: 'controller/planning/listTodos',
    createTodo: 'controller/planning/createTodo',
    updateTodo: 'controller/planning/updateTodo',
    deleteTodo: 'controller/planning/deleteTodo',
    startTodoAgent: 'controller/planning/startTodoAgent',
    // 日程
    listCalendarEvents: 'controller/planning/listCalendarEvents',
    createCalendarEvent: 'controller/planning/createCalendarEvent',
    updateCalendarEvent: 'controller/planning/updateCalendarEvent',
    deleteCalendarEvent: 'controller/planning/deleteCalendarEvent',
    // 分组
    listGroups: 'controller/planning/listGroups',
    createGroup: 'controller/planning/createGroup',
    updateGroup: 'controller/planning/updateGroup',
    deleteGroup: 'controller/planning/deleteGroup',
    // 标签
    listTags: 'controller/planning/listTags',
    createTag: 'controller/planning/createTag',
    updateTag: 'controller/planning/updateTag',
    deleteTag: 'controller/planning/deleteTag',
    // 提醒
    listActiveReminders: 'controller/planning/listActiveReminders',
    acknowledgeReminder: 'controller/planning/acknowledgeReminder',
    snoozeReminder: 'controller/planning/snoozeReminder',
    // 定时任务
    listAutomations: 'controller/planning/listAutomations',
    createAutomation: 'controller/planning/createAutomation',
    updateAutomation: 'controller/planning/updateAutomation',
    deleteAutomation: 'controller/planning/deleteAutomation',
    toggleAutomation: 'controller/planning/toggleAutomation',
    runAutomationNow: 'controller/planning/runAutomationNow',
  },

  // 票据识别模块（独立模块，不与其他模块混用）
  invoice: {
    addFolder: 'controller/invoice/addFolder',
    getFolderList: 'controller/invoice/getFolderList',
    deleteFolder: 'controller/invoice/deleteFolder',
    getFileTree: 'controller/invoice/getFileTree',
    toggleArchived: 'controller/invoice/toggleArchived',
    getFileDetail: 'controller/invoice/getFileDetail',
    reRecognize: 'controller/invoice/reRecognize',
    extractInvoice: 'controller/invoice/extractInvoice',
    getReceiptTypes: 'controller/invoice/getReceiptTypes',
    getArchiveRecords: 'controller/invoice/getArchiveRecords',
    getArchiveStats: 'controller/invoice/getArchiveStats',
    registerSyncCallback: 'controller/invoice/registerSyncCallback',
    onSyncChange: 'controller/invoice/onSyncChange',
    onOcrProgress: 'controller/invoice/onOcrProgress',
  },

  // Pi Agent 模式
  piAgent: {
    // Skills 管理
    skillsOperation: 'controller/piAgent/skillsOperation',
    // 内置 MCP 管理
    mcpOperation: 'controller/piAgent/mcpOperation',
    // 初始化 Skills（应用启动时调用）
    initSkills: 'controller/piAgent/initSkills',
    // Agent 会话管理
    sessionOperation: 'controller/piAgent/sessionOperation',
    // Agent 流式对话（通过 HTTP SSE）
    streamAgent: 'controller/piAgent/streamAgent',
    // 工作区管理
    workspaceOperation: 'controller/piAgent/workspaceOperation',
    // 记忆文件管理（CLAUDE.md / Memory 等）
    memoryOperation: 'controller/piAgent/memoryOperation',
    // 响应权限请求（前端 HTTP POST）
    respondPermission: 'controller/piAgent/respondPermission',
// 响应 AskUser 请求（前端 HTTP POST）
respondAskUser: 'controller/piAgent/respondAskUser',
// 文件面板管理（列文件/添加文件）
fileOperation: 'controller/piAgent/fileOperation',
},

// SkillHub Skills 市场
skillHub: {
// 搜索 Skills
search: 'controller/skillHub/search',
// 获取热门 Top 100
getTop20: 'controller/skillHub/getTop20',
// 获取 Topic 分组列表
getTopics: 'controller/skillHub/getTopics',
// 获取 Skill 详情
getDetail: 'controller/skillHub/getDetail',
// 安装到指定工作区
install: 'controller/skillHub/install',
// 安装到所有工作区
installToAll: 'controller/skillHub/installToAll',
},

// 磁盘管理
storage: {
  getStats: 'controller/storage/getStats',
  cleanup: 'controller/storage/cleanup',
  cleanupTemp: 'controller/storage/cleanupTemp',
},

// 更新管理
updater: {
  // 检查更新
  checkForUpdater: 'controller/updater/checkForUpdater',
  // 下载更新（兼容旧接口）
  downloadApp: 'controller/updater/downloadApp',
},

// Bridge IM 渠道（飞书/微信/钉钉）
bridge: {
// 自动启动已启用的 Bridge
autoStart: 'controller/bridge/autoStart',
// 飞书
feishuListBots: 'controller/bridge/feishuListBots',
feishuSaveBot: 'controller/bridge/feishuSaveBot',
feishuDeleteBot: 'controller/bridge/feishuDeleteBot',
feishuStartBot: 'controller/bridge/feishuStartBot',
feishuStopBot: 'controller/bridge/feishuStopBot',
feishuGetStatuses: 'controller/bridge/feishuGetStatuses',
feishuTestConnection: 'controller/bridge/feishuTestConnection',
// 飞书扫码注册
feishuRegisterApp: 'controller/bridge/feishuRegisterApp',
feishuCancelRegister: 'controller/bridge/feishuCancelRegister',
feishuRegisterQrcodeEvent: 'controller/bridge/feishuRegisterQrcode',
feishuRegisterStatusEvent: 'controller/bridge/feishuRegisterStatus',
// 飞书绑定管理
feishuListBindings: 'controller/bridge/feishuListBindings',
feishuUpdateBinding: 'controller/bridge/feishuUpdateBinding',
feishuRemoveBinding: 'controller/bridge/feishuRemoveBinding',
// 微信（扫码登录模式，无需手动配置 Token）
wechatGetConfig: 'controller/bridge/wechatGetConfig',
wechatStartLogin: 'controller/bridge/wechatStartLogin',
wechatLogout: 'controller/bridge/wechatLogout',
wechatStart: 'controller/bridge/wechatStart',
wechatStop: 'controller/bridge/wechatStop',
wechatGetStatus: 'controller/bridge/wechatGetStatus',
// 钉钉
dingtalkListBots: 'controller/bridge/dingtalkListBots',
dingtalkSaveBot: 'controller/bridge/dingtalkSaveBot',
dingtalkDeleteBot: 'controller/bridge/dingtalkDeleteBot',
dingtalkStartBot: 'controller/bridge/dingtalkStartBot',
dingtalkStopBot: 'controller/bridge/dingtalkStopBot',
dingtalkGetStatuses: 'controller/bridge/dingtalkGetStatuses',
dingtalkTestConnection: 'controller/bridge/dingtalkTestConnection',
},
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

