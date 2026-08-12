import { app as electronApp, screen } from 'electron';
import { logger } from 'ee-core/log';
import { getConfig } from 'ee-core/config';
import { getMainWindow } from 'ee-core/electron';
import { initPiAgent } from '../components/pi';
import { browserController } from '../components/browser/browser-controller';
import { startScheduler as startAutomationScheduler } from '../components/planning/automation-scheduler';
import { startPlanningReminderScheduler } from '../components/planning/reminder-scheduler';
import { stopScheduler as stopAutomationScheduler } from '../components/planning/automation-scheduler';
import { stopPlanningReminderScheduler } from '../components/planning/reminder-scheduler';

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

    // When double clicking the icon, display the opened window
    electronApp.on('second-instance', () => {
      const win = getMainWindow();
      if (win.isMinimized()) {
        win.restore();
      }
      win.show();
      win.focus();
    });
  }

  /**
   * main window have been loaded
   */
  async windowReady(): Promise<void> {
    logger.info('[lifecycle] window-ready');

    const win = getMainWindow();

    // 绑定主窗口给内置浏览器控制器
    browserController.setOwnerWindow(win);

    // The window is centered and scaled proportionally
    // Obtain the size information of the main screen, calculate the width and height of the window as a percentage of the screen,
    // and calculate the coordinates of the upper left corner when the window is centered
    const mainScreen = screen.getPrimaryDisplay();
    const { width, height } = mainScreen.workAreaSize;
    const windowWidth = Math.floor(width * 0.8);
    const windowHeight = Math.floor(height * 0.7);
    const x = Math.floor((width - windowWidth) / 2);
    const y = Math.floor((height - windowHeight) / 2);
    win.setBounds({ x, y, width: windowWidth, height: windowHeight })

    // Delayed loading, no white screen
    const { windowsOption } = getConfig();
    if (windowsOption.show == false) {
      win.once('ready-to-show', () => {
        win.show();
        win.focus();
      })
    }
  }

  /**
   * before app close
   */  
  async beforeClose(): Promise<void> {
    logger.info('[lifecycle] before-close');
    stopAutomationScheduler();
    stopPlanningReminderScheduler();
  }
}
export {
  Lifecycle
};
