import path from 'path';
import { BrowserWindow, BrowserWindowConstructorOptions, Notification, NotificationConstructorOptions, IpcMainEvent, Event, ipcMain } from 'electron';
import { getMainWindow } from 'ee-core/electron';
import { isDev, isProd, getBaseDir } from 'ee-core/ps';
import { getConfig } from 'ee-core/config';
import { isFileProtocol } from 'ee-core/utils';
import { logger } from 'ee-core/log';
import type { Config } from 'ee-core';

/**
 * Window
 * @class
 */
interface CreateWindowArgs {
  type: string;
  content: string;
  windowName: string;
  windowTitle: string;
  /** 窗口宽度，默认 980 */
  width?: number;
  /** 窗口高度，默认 650 */
  height?: number;
  /** 是否居中显示，默认 false */
  center?: boolean;
}

class WindowService {
  private myNotification: Notification | null;
  private windows: Record<string, BrowserWindow>;

  constructor() {
    this.myNotification = null;
    this.windows = {}
  }

  /**
   * 窗口初始化
   */
  init() {
    const mainWin = getMainWindow();
    mainWin.setMenuBarVisibility(false);

    // 注册窗口控制 IPC（Windows 平台自定义标题栏按钮）
    ipcMain.on('window-minimize', () => {
      const win = getMainWindow();
      if (win) win.minimize();
    });
    ipcMain.on('window-maximize', () => {
      const win = getMainWindow();
      if (!win) return;
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    });
    ipcMain.on('window-close', () => {
      const win = getMainWindow();
      if (win) win.close();
    });
  }

  /**
   * Create a new window
   */
  createWindow(args: CreateWindowArgs): number {
    const { type, content, windowName, windowTitle, width, height, center } = args;
    let contentUrl: string | null = null;
    if (type == 'html') {
      contentUrl = path.join('file://', getBaseDir(), content)
    } else if (type == 'web') {
      contentUrl = content;
    } else if (type == 'vue') {
      let addr = 'http://localhost:8080'
      if (isProd()) {
        const mainServer = getConfig().mainServer as Config['mainServer'] & { host?: string; port?: number };
        if (isFileProtocol(mainServer.protocol)) {
          addr = mainServer.protocol + path.join(getBaseDir(), mainServer.indexPath);
        } else {
          addr = mainServer.protocol + (mainServer.host ?? '') + (mainServer.port ? ':' + mainServer.port : '');
        }
      }

      contentUrl = addr + content;
    } else {
      // some
    }

    logger.info('[createWindow] url: ', contentUrl);
    const opt: BrowserWindowConstructorOptions = {
      title: windowTitle,
      width: width ?? 980, 
      height: height ?? 650,
      center: center ?? false,
      webPreferences: {
        contextIsolation: false,
        nodeIntegration: true,
      },
    }
    // 未指定居中时保持原有的左上角定位
    if (!center) {
      opt.x = 10;
      opt.y = 10;
    }
    const win = new BrowserWindow(opt);
    const winContentsId = win.webContents.id;
    if (contentUrl) {
      win.loadURL(contentUrl);
    }
    if (isDev()) {
      win.webContents.openDevTools();
    }

    // sub window 
    win.setMenuBarVisibility(false);

    this.windows[windowName] = win;

    return winContentsId;
  }
  
  /**
   * Get window contents id
   */
  getWCid(args: { windowName: string }): number | null {
    const { windowName } = args;
    let win: BrowserWindow | null;
    if (windowName == 'main') {
      win = getMainWindow();
      return win.webContents.id;
    } else {
      win = this.windows[windowName] ?? null;
      if (!win) return null;
      return win.webContents.id;
    }
  }

  /**
   * Realize communication between two windows through the transfer of the main process
   */
  communicate(args: { receiver: string; content: unknown }): void {
    const { receiver, content } = args;
    if (receiver == 'main') {
      const win = getMainWindow();
      win.webContents.send('controller/os/window2ToWindow1', content);
    } else if (receiver == 'window2') {
      const win = this.windows[receiver];
      win.webContents.send('controller/os/window1ToWindow2', content);
    }
  }  

  /**
   * createNotification
   */
  createNotification(options: NotificationConstructorOptions & { clickEvent?: boolean; closeEvent?: boolean }, event: IpcMainEvent): void {
    const channel = 'controller/os/sendNotification';
    this.myNotification = new Notification(options);

    if (options.clickEvent) {
      this.myNotification.on('click', (_e: Event) => {
        const data = {
          type: 'click',
          msg: '您点击了通知消息'
        }
        event.reply(`${channel}`, data)
      });
    }

    if (options.closeEvent) {
      this.myNotification.on('close', (_e: Event) => {
        const data = {
          type: 'close',
          msg: '您关闭了通知消息'
        }
        event.reply(`${channel}`, data)
      });
    }

    this.myNotification.show();
  }

}
export const windowService = new WindowService();  
