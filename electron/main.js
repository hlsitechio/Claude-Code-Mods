'use strict';

const { app, BrowserWindow, Menu, shell, ipcMain, nativeTheme } = require('electron');
const path = require('path');

// Dev: not packaged AND not explicitly forced to production
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

// ----- Window creation -----
function createWindow() {
  const win = new BrowserWindow({
    width:    1360,
    height:   860,
    minWidth: 900,
    minHeight: 600,
    title: 'Claude Code',
    backgroundColor: '#0b0b0c',
    show: false,          // wait for ready-to-show before revealing
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      // Allow loading from file:// in production
      webSecurity: !isDev,
    },
    // Clean look — hide default menu bar
    autoHideMenuBar: true,
  });

  // Show once content is ready to avoid white flash
  win.once('ready-to-show', () => win.show());

  if (isDev) {
    // Dev: load from Vite dev server
    win.loadURL('http://localhost:5182');
    // Open DevTools automatically in dev
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Production: load the built index.html
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Open any target="_blank" links in the user's default browser, not in Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

// ----- App lifecycle -----
app.whenReady().then(() => {
  // Remove the default application menu (File / Edit / View / …)
  Menu.setApplicationMenu(null);

  createWindow();

  // macOS: re-create window when dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // On macOS apps stay in the dock until the user explicitly quits
  if (process.platform !== 'darwin') app.quit();
});

// ----- IPC: expose safe read-only info to the renderer -----
ipcMain.handle('app:info', () => ({
  version:  app.getVersion(),
  platform: process.platform,
  electron: process.versions.electron,
  node:     process.versions.node,
}));
