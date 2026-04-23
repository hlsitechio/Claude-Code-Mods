'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform:   process.platform,

  // App metadata
  getAppInfo: () => ipcRenderer.invoke('app:info'),

  // ── API key ───────────────────────────────────────────────────────────────
  hasApiKey:  ()    => ipcRenderer.invoke('claude:has-key'),
  setApiKey:  (key) => ipcRenderer.invoke('claude:set-key', key),
  clearApiKey:()    => ipcRenderer.invoke('claude:clear-key'),

  // ── Streaming chat ────────────────────────────────────────────────────────
  // Returns a Promise that resolves when the full response is complete.
  // Chunks are delivered via onChunk callbacks as they arrive.
  sendMessage: (messages, model, system) =>
    ipcRenderer.invoke('claude:send', { messages, model, system }),

  // Subscribe to streaming text chunks (call before sendMessage)
  onChunk: (cb) => {
    const handler = (_, text) => cb(text);
    ipcRenderer.on('claude:chunk', handler);
    // Return unsubscribe fn
    return () => ipcRenderer.removeListener('claude:chunk', handler);
  },

  // Subscribe to stream-complete event (auto-fires once per response)
  onDone: (cb) => {
    const handler = (_, stats) => cb(stats);
    ipcRenderer.once('claude:done', handler);
    return () => ipcRenderer.removeListener('claude:done', handler);
  },
});
