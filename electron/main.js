'use strict';

const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');

// Dev: not packaged AND not explicitly forced to production
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

// Lazy-load claude-service only after app is ready (app.getPath requires it)
let claudeService = null;
function getClaudeService() {
  if (!claudeService) claudeService = require('./claude-service');
  return claudeService;
}

// ── Window ──────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width:     1360,
    height:    860,
    minWidth:  900,
    minHeight: 600,
    title: 'Claude Code',
    backgroundColor: '#0b0b0c',
    show: false,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      spellcheck:       false,
      webSecurity:      !isDev,
    },
    autoHideMenuBar: true,
  });

  win.once('ready-to-show', () => win.show());

  if (isDev) {
    win.loadURL('http://localhost:5182');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // External links → default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

// ── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC: app info ────────────────────────────────────────────────────────────

ipcMain.handle('app:info', () => ({
  version:  app.getVersion(),
  platform: process.platform,
  electron: process.versions.electron,
  node:     process.versions.node,
}));

// ── IPC: API key management ──────────────────────────────────────────────────

ipcMain.handle('claude:has-key', () => {
  return getClaudeService().hasApiKey();
});

ipcMain.handle('claude:set-key', (_, key) => {
  getClaudeService().setApiKey(key);
  return true;
});

ipcMain.handle('claude:clear-key', () => {
  getClaudeService().clearApiKey();
  return true;
});

// ── IPC: streaming chat ──────────────────────────────────────────────────────

ipcMain.handle('claude:send', async (event, { messages, model, system }) => {
  return getClaudeService().streamMessage(event, messages, model, system);
});
