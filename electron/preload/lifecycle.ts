import { app as electronApp, screen, ipcMain, BrowserWindow } from 'electron';
import path from 'path';
import { logger } from 'ee-core/log';
import { getConfig } from 'ee-core/config';
import { getMainWindow } from 'ee-core/electron';
import { getBaseDir } from 'ee-core/ps';
import { initPiAgent } from '../components/pi';
import { browserController } from '../components/browser/browser-controller';
import { startScheduler as startAutomationScheduler } from '../components/planning/automation-scheduler';
import { startPlanningReminderScheduler } from '../components/planning/reminder-scheduler';
import { stopScheduler as stopAutomationScheduler } from '../components/planning/automation-scheduler';
import { stopPlanningReminderScheduler } from '../components/planning/reminder-scheduler';
import { feishuBridgeManager } from '../service/bridge/feishu-bridge-manager';
import { wechatBridge } from '../service/bridge/wechat-bridge';
import { dingtalkBridgeManager } from '../service/bridge/dingtalk-bridge-manager';
import { getWeChatConfig } from '../service/bridge/wechat-config';
import { getFeishuMultiBotConfig } from '../service/bridge/feishu-config';
import { getDingTalkMultiBotConfig } from '../service/bridge/dingtalk-config';
import { autoUpdaterService } from '../service/os/auto_updater';
import { updaterController } from '../controller/updater';
import { voiceController } from '../controller/voice';
import { cleanupUpdater } from '../service/os/auto_updater';
import { ocrWorkerManager } from '../components/rag/parser/ocr-worker-manager';

/**
 * 创建启动过场动画窗口
 *
 * 加载 public/html/splash.html，其中使用 diting_loading.mp4 作为背景视频。
 * 窗口无边框、不可调整大小、不在任务栏显示。
 */
function createSplashWindow(): BrowserWindow {
  // 使用 config.default.ts 中的宽高配置，保持与主窗口一致
  const { windowsOption } = getConfig();
  const splashWidth = windowsOption.width || 980;
  const splashHeight = windowsOption.height || 850;

  // 居中显示在屏幕上
  const mainScreen = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = mainScreen.workAreaSize;
  const x = Math.floor((screenWidth - splashWidth) / 2);
  const y = Math.floor((screenHeight - splashHeight) / 2);

  const splashWin = new BrowserWindow({
    width: splashWidth,
    height: splashHeight,
    x,
    y,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#000000',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const splashPath = path.join(getBaseDir(), 'public', 'html', 'splash.html');
  splashWin.loadFile(splashPath).catch((err) => {
    logger.error('[lifecycle] 过场动画页面加载失败:', err);
  });

  return splashWin;
}

/**
 * 安全关闭过场动画窗口
 */
function destroySplashWindow(splashWin: BrowserWindow | null): void {
  if (splashWin && !splashWin.isDestroyed()) {
    splashWin.destroy();
  }
}

class Lifecycle {
  /**
   * core app have been loaded
   */
  async ready(): Promise<void> {
    logger.info('[lifecycle] ready');
  }

  /**
   * electron app ready
   */
  async electronAppReady(): Promise<void> {
    logger.info('[lifecycle] electron-app-ready');

    // 注册更新相关 IPC 处理器
    try {
      updaterController.registerIpc();
    } catch (err) {
      logger.error('[lifecycle] 更新 IPC 注册失败:', err);
    }

    // 注册语音流式转写 IPC 处理器
    try {
      voiceController.registerIpc();
    } catch (err) {
      logger.error('[lifecycle] 语音 IPC 注册失败:', err);
    }

    // 注册获取应用版本号的 IPC
    ipcMain.handle('updater:get-app-version', (): string => {
      return electronApp.getVersion();
    });

    // 初始化 Pi Agent 环境（同步默认 Skills、升级工作区 Skills）
    try {
      initPiAgent();
    } catch (err) {
      logger.error('[lifecycle] Pi Agent 初始化失败:', err);
    }

    // 启动定时任务调度器
    try {
      startAutomationScheduler();
      startPlanningReminderScheduler();
    } catch (err) {
      logger.error('[lifecycle] 调度器启动失败:', err);
    }

    // 自动启动已启用的 IM Bridge（飞书/微信/钉钉）
    // 延迟 5 秒，等待窗口和数据库完全就绪
    setTimeout(async () => {
      try {
        // 飞书
        const feishuConfig = getFeishuMultiBotConfig();
        for (const bot of feishuConfig.bots) {
          if (bot.enabled) {
            try {
              await feishuBridgeManager.startBridge(bot.id);
              logger.info(`[lifecycle] 飞书 Bridge 已启动: ${bot.name}`);
            } catch (err) {
              logger.error(`[lifecycle] 飞书 Bridge 启动失败 (${bot.name}):`, err);
            }
          }
        }

        // 微信：用已有凭证自动启动长轮询
        const wechatConfig = getWeChatConfig();
        if (wechatConfig.enabled && wechatConfig.credentials) {
          try {
            await wechatBridge.start();
            logger.info('[lifecycle] 微信 Bridge 已启动');
          } catch (err) {
            logger.error('[lifecycle] 微信 Bridge 启动失败:', err);
          }
        }

        // 钉钉
        const dingtalkConfig = getDingTalkMultiBotConfig();
        for (const bot of dingtalkConfig.bots) {
          if (bot.enabled) {
            try {
              await dingtalkBridgeManager.startBridge(bot.id);
              logger.info(`[lifecycle] 钉钉 Bridge 已启动: ${bot.name}`);
            } catch (err) {
              logger.error(`[lifecycle] 钉钉 Bridge 启动失败 (${bot.name}):`, err);
            }
          }
        }
      } catch (err) {
        logger.error('[lifecycle] Bridge 自动启动失败:', err);
      }
    }, 5000);

    // When double clicking the icon, display the opened window
    electronApp.on('second-instance', () => {
      const win = getMainWindow();
      if (win.isMinimized()) {
        win.restore();
      }
      win.show();
      win.focus();
    });

    // 初始化自动更新（延迟 3 秒等待主窗口完全就绪）
    setTimeout(() => {
      try {
        autoUpdaterService.init();
      } catch (err) {
        logger.error('[lifecycle] 自动更新初始化失败:', err);
      }
    }, 3000);
  }

  /**
   * main window have been loaded
   */
  async windowReady(): Promise<void> {
    logger.info('[lifecycle] window-ready');

    const win = getMainWindow();

    // 绑定主窗口给内置浏览器控制器
    browserController.setOwnerWindow(win);

    // 主窗口尺寸由 config.default.ts 的 windowsOption.width/height 控制
    // Electron 默认会将窗口居中显示，无需手动计算

    // 启动过场动画窗口：config 中 show: false，主窗口不自动显示
    // windowReady() 在 loadServer() 之前执行，此时先显示过场动画窗口
    // 等主窗口页面首帧渲染完成（ready-to-show）后，关闭过场窗口并显示主窗口
    const { windowsOption } = getConfig();
    if (windowsOption.show === false) {
      // 创建并显示过场动画窗口（播放 diting_loading.mp4）
      const splashWin = createSplashWindow();
      splashWin.show();

      win.once('ready-to-show', () => {
        // 主窗口内容就绪，关闭过场窗口并显示主窗口
        destroySplashWindow(splashWin);
        win.show();
        win.focus();
        logger.info('[lifecycle] 主窗口已显示，过场动画窗口已关闭');
      });
    }
  }

  /**
   * before app close
   */  
  async beforeClose(): Promise<void> {
    logger.info('[lifecycle] before-close');
    stopAutomationScheduler();
    stopPlanningReminderScheduler();

    // 清理更新器资源
    try {
      cleanupUpdater();
    } catch (err) {
      logger.error('[lifecycle] 更新器清理失败:', err);
    }

    // 停止所有 IM Bridge
    try {
      feishuBridgeManager.stopAll();
      wechatBridge.stop();
      dingtalkBridgeManager.stopAll();
    } catch (err) {
      logger.error('[lifecycle] Bridge 停止失败:', err);
    }

    // 清理 OCR 子进程
    try {
      ocrWorkerManager.destroy();
    } catch (err) {
      logger.error('[lifecycle] OCR 子进程清理失败:', err);
    }
  }
}
export {
  Lifecycle
};
