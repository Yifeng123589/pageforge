// PageForge 桌面版主进程（Electron）
const { app, BrowserWindow } = require('electron');
const path = require('path');

// 单实例锁：防止开多个窗口
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    const win = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 960,
      minHeight: 640,
      autoHideMenuBar: true,
      backgroundColor: '#0d0d0f', // 匹配页面背景，避免白闪
      title: 'PageForge · 可视化网页设计器',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    // 加载单文件版（所有资源内联，file:// 下完美运行）
    win.loadFile(path.join(__dirname, 'dist-single', 'index.html'));
    // 页面标题同步到窗口标题
    win.webContents.on('page-title-updated', (_e, title) => {
      if (title && title !== 'PageForge · 可视化网页设计器') win.setTitle(`PageForge · ${title}`);
    });
  });

  app.on('window-all-closed', () => app.quit());
}
