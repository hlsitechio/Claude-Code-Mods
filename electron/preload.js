'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal, safe API surface to the renderer.
// Never expose full ipcRenderer — only explicit, named wrappers.
contextBridge.exposeInMainWorld('electronAPI', {
  // Let the UI know it's running inside Electron
  isElectron: true,
  platform: process.platform,

  // Fetch app/build metadata from the main process
  getAppInfo: () => ipcRenderer.invoke('app:info'),
});
