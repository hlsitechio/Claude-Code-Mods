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
  // Legacy (main chat — no requestId, uses 'claude:chunk' / 'claude:done')
  sendMessage: (messages, model, system, cliSessionId, permMode) =>
    ipcRenderer.invoke('claude:send', { messages, model, system, cliSessionId, permMode }),

  // Per-stream (split chats) — each call gets its own scoped IPC channels
  sendMessageFor: (messages, model, system, cliSessionId, permMode, requestId) =>
    ipcRenderer.invoke('claude:send', { messages, model, system, cliSessionId, permMode, requestId }),

  abort: (requestId) => ipcRenderer.invoke('claude:abort', requestId),

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

  // Scoped listeners for parallel streams
  onChunkFor: (requestId, cb) => {
    const ch = `claude:chunk:${requestId}`;
    const handler = (_, text) => cb(text);
    ipcRenderer.on(ch, handler);
    return () => ipcRenderer.removeListener(ch, handler);
  },

  onDoneFor: (requestId, cb) => {
    const ch = `claude:done:${requestId}`;
    const handler = (_, stats) => cb(stats);
    ipcRenderer.once(ch, handler);
    return () => ipcRenderer.removeListener(ch, handler);
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
    list:        ()              => ipcRenderer.invoke('kb:list'),
    read:        (id)            => ipcRenderer.invoke('kb:read', id),
    write:       (id, content)   => ipcRenderer.invoke('kb:write', { id, content }),
    createSkill: (name)          => ipcRenderer.invoke('kb:create-skill', { name }),
    deleteSkill: (id)            => ipcRenderer.invoke('kb:delete-skill', id),
  },

  // ── Agents persistence ────────────────────────────────────────────────────
  agents: {
    save:    (list) => ipcRenderer.invoke('agents:save', list),
    loadAll: ()     => ipcRenderer.invoke('agents:load-all'),
  },

  // ── Memory files ─────────────────────────────────────────────────────────
  memory: {
    list:    ()              => ipcRenderer.invoke('memory:list'),
    read:    (id)            => ipcRenderer.invoke('memory:read', id),
    write:   (id, content)   => ipcRenderer.invoke('memory:write', { id, content }),
    delete:  (id)            => ipcRenderer.invoke('memory:delete', id),
    loadAll: ()              => ipcRenderer.invoke('memory:load-all'),
  },

  // ── Session persistence (disk-backed) ────────────────────────────────────
  sessions: {
    loadMeta:   ()         => ipcRenderer.invoke('sessions:load-meta'),
    saveMeta:   (meta)     => ipcRenderer.invoke('sessions:save-meta', meta),
    loadMsgs:   (id)       => ipcRenderer.invoke('sessions:load-msgs', id),
    saveMsgs:   (id, msgs) => ipcRenderer.invoke('sessions:save-msgs', id, msgs),
    deleteMsgs: (id)       => ipcRenderer.invoke('sessions:delete-msgs', id),
  },

  // ── Embedded terminal ─────────────────────────────────────────────────────
  terminal: {
    create: (opts)          => ipcRenderer.invoke('terminal:create', opts || {}),
    input:  (termId, data)  => ipcRenderer.send('terminal:input', { termId, data }),
    close:  (termId)        => ipcRenderer.send('terminal:close', termId),
    onData: (termId, cb) => {
      const ch = `terminal:data:${termId}`;
      const handler = (_, text) => cb(text);
      ipcRenderer.on(ch, handler);
      return () => ipcRenderer.removeListener(ch, handler);
    },
    onExit: (termId, cb) => {
      const ch = `terminal:exit:${termId}`;
      const handler = (_, code) => cb(code);
      ipcRenderer.once(ch, handler);
      return () => ipcRenderer.removeListener(ch, handler);
    },
  },

  // ── Codeblock persistent library ─────────────────────────────────────────
  codeblocks: {
    save:    (name, html, lang, source)          => ipcRenderer.invoke('codeblock:save',    { name, html, lang, source }),
    load:    (id)                                => ipcRenderer.invoke('codeblock:load',    id),
    update:  (id, html, lang, source)            => ipcRenderer.invoke('codeblock:update',  { id, html, lang, source }),
    list:    ()                                  => ipcRenderer.invoke('codeblock:list'),
    saveSrc: (filename, lang, source)            => ipcRenderer.invoke('codeblock:saveSrc', { filename, lang, source }),
  },

  // ── Notes ─────────────────────────────────────────────────────────────────
  notes: {
    list:   ()                  => ipcRenderer.invoke('notes:list'),
    read:   (id)                => ipcRenderer.invoke('notes:read',   id),
    write:  (id, content)       => ipcRenderer.invoke('notes:write',  { id, content }),
    create: (title)             => ipcRenderer.invoke('notes:create', { title }),
    delete: (id)                => ipcRenderer.invoke('notes:delete', id),
  },

  // ── File-system explorer ──────────────────────────────────────────────────
  files: {
    root: ()                    => ipcRenderer.invoke('fs:root'),
    list: (dirPath)             => ipcRenderer.invoke('fs:list', dirPath),
    read: (filePath)            => ipcRenderer.invoke('fs:read', filePath),
    write: (filePath, content)  => ipcRenderer.invoke('fs:writeText', filePath, content),
    mkdir: (dirPath)            => ipcRenderer.invoke('fs:mkdir', dirPath),
    exists: (filePath)          => ipcRenderer.invoke('fs:exists', filePath),
    openInExplorer: (filePath)  => ipcRenderer.invoke('shell:open', filePath),
    onChanged: (cb) => {
      const handler = (_, dirPath) => cb(dirPath);
      ipcRenderer.on('fs:changed', handler);
      return () => ipcRenderer.removeListener('fs:changed', handler);
    },
  },
});
