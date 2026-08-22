import path from 'path';
import { getBaseDir } from 'ee-core/ps';
import type { Config } from 'ee-core';

/**
 * 默认配置
 */
export default (): Partial<Config> => {
  return {
    openDevTools: false,
    singleLock: true,
    windowsOption: {
      title: 'Diting',
      width: 1000,
      height: 700,
      minWidth: 400,
      minHeight: 300,
      webPreferences: {
        //webSecurity: false,
        contextIsolation: false, // false -> 可在渲染进程中使用electron的api，true->需要bridge.js(contextBridge)
        nodeIntegration: true,
        //preload: path.join(getElectronDir(), 'preload', 'bridge.js'),
      },
      titleBarStyle: 'hidden',
      // 延迟显示窗口：由 lifecycle 创建过场动画窗口，主窗口 ready-to-show 后再切换
      show: false,
      // 设置背景色与前端 #loadingPage 一致，避免 ready-to-show 前的闪白
      backgroundColor: '#f0f2f5',
      icon: path.join(getBaseDir(), 'public', 'images', 'logo-32.png'),
    },
    logger: {
      level: 'info', // 'fatal', 'error', 'warn', 'info', 'debug', 'trace' or 'silent'
      rotator: 'daily', // daily, hourly
      dateFormat: 'yyyy-MM-dd',
      maxSize: '100m',
      redact: [],
      redactCensor: '[Redacted]',
      timestamp: true,
      depthLimit: 5,
      timezone: 'Asia/Shanghai',
      name: 'ee',
      appLogName: 'ee.log',
      coreLogName: 'ee-core.log',
      errorLogName: 'ee-error.log'
    },
    remote: {
      enable: false,
      url: 'http://electron-egg.kaka996.com/'
    },
    socketServer: {
      enable: true,
      port: 7070,
      path: "/socket.io/",
      connectTimeout: 45000,
      pingTimeout: 30000,
      pingInterval: 25000,
      maxHttpBufferSize: 1e8,
      transports: ["polling", "websocket"],
      cors: {
        origin: true,
      },
      channel: 'socket-channel'
    },
    httpServer: {
      enable: true,
      https: {
        enable: false,
        key: '/public/ssl/localhost+1.key',
        cert: '/public/ssl/localhost+1.pem'
      },
      protocol: 'http://',
      host: '127.0.0.1',
      port: 7071,
      cors: { origin: '*' },
      body: {
        multipart: false,
        formidable: { keepExtensions: false }
      },
      filterRequest: {
        uris: [],
        returnData: ''
      },
    },
    mainServer: {
      protocol: 'file://',
      indexPath: '/public/dist/index.html',
      channelSeparator: '/',
    }
  }
}
