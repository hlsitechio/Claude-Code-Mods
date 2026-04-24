'use strict';

const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform:   process.platform,

  // ── Zoom (webFrame — renderer-side, no IPC needed) ───────────────────────
  zoom: {
    get: ()       => webFrame.getZoomFactor(),
    set: (factor) => webFrame.setZoomFactor(Math.max(0.5, Math.min(2.5, factor))),
  },

  // App metadata & about
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  showAbout:  () => ipcRenderer.send('app:about'),

  // ── Window controls ───────────────────────────────────────────────────────
  minimize:     () => ipcRenderer.send('window:minimize'),
  maximize:     () => ipcRenderer.send('window:maximize'),
  closeWindow:  () => ipcRenderer.send('window:close'),
  hideToTray:   () => ipcRenderer.send('window:hide'),
  isMaximized:  () => ipcRenderer.invoke('window:is-maximized'),

  onMaximizeChange: (cb) => {
    const mHandler = () => cb(true);
    const uHandler = () => cb(false);
    ipcRenderer.on('window:maximized',   mHandler);
    ipcRenderer.on('window:unmaximized', uHandler);
    return () => {
      ipcRenderer.removeListener('window:maximized',   mHandler);
      ipcRenderer.removeListener('window:unmaximized', uHandler);
    };
  },

  // ── Find in page ──────────────────────────────────────────────────────────
  findStart:  (text) => ipcRenderer.send('find:start', text),
  findNext:   (text) => ipcRenderer.send('find:next',  text),
  findPrev:   (text) => ipcRenderer.send('find:prev',  text),
  findStop:   ()     => ipcRenderer.send('find:stop'),

  // ── Desktop notifications ─────────────────────────────────────────────────
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),

  // ── Legacy raw API-key (still supported as fallback) ─────────────────────
  hasApiKey:  ()    => ipcRenderer.invoke('claude:has-key'),
  setApiKey:  (key) => ipcRenderer.invoke('claude:set-key', key),
  clearApiKey:()    => ipcRenderer.invoke('claude:clear-key'),

  // ── OAuth / subscription auth ─────────────────────────────────────────────
  getAuthStatus:  ()  => ipcRenderer.invoke('claude:get-auth-status'),
  ensureAuth:     ()  => ipcRenderer.invoke('claude:ensure-auth'),
  signIn:         ()  => ipcRenderer.invoke('claude:sign-in'),
  signOut:        ()  => ipcRenderer.invoke('claude:sign-out'),

  onAuthComplete: (cb) => {
    const handler = (_, status) => cb(status);
    ipcRenderer.on('claude:auth-complete', handler);
    return () => ipcRenderer.removeListener('claude:auth-complete', handler);
  },

  // ── Streaming chat ────────────────────────────────────────────────────────
  sendMessage: (messages, model, system, cliSessionId) =>
    ipcRenderer.invoke('claude:send', { messages, model, system, cliSessionId }),

  abort: () => ipcRenderer.invoke('claude:abort'),

  onChunk: (cb) => {
    const handler = (_, text) => cb(text);
    ipcRenderer.on('claude:chunk', handler);
    return () => ipcRenderer.removeListener('claude:chunk', handler);
  },

  onDone: (cb) => {
    const handler = (_, stats) => cb(stats);
    ipcRenderer.once('claude:done', handler);
    return () => ipcRenderer.removeListener('claude:done', handler);
  },

  onTodoUpdate: (cb) => {
    const handler = (_, todos) => cb(todos);
    ipcRenderer.on('claude:todo-update', handler);
    return () => ipcRenderer.removeListener('claude:todo-update', handler);
  },

  onToolActivity: (cb) => {
    const handler = (_, data) => cb(data);
    ipcRenderer.on('claude:tool-activity', handler);
    return () => ipcRenderer.removeListener('claude:tool-activity', handler);
  },

  // ── Knowledge-base file editor ────────────────────────────────────────────
  kb: {
    list:  ()           => ipcRenderer.invoke('kb:list'),
    read:  (id)         => ipcRenderer.invoke('kb:read', id),
    write: (id, content)=> ipcRenderer.invoke('kb:write', { id, content }),
  },

  // ── Agents persistence ────────────────────────────────────────────────────
  agents: {
    save: (list) => ipcRenderer.invoke('agents:save', list),
  },
});
