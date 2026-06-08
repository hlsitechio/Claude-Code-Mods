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

  // ── Cross-window panel drag ───────────────────────────────────────────────
  panelDrag: {
    start:  (panelId) => ipcRenderer.invoke('panel:drag-start', panelId),
    end:    ()        => ipcRenderer.invoke('panel:drag-end'),
    accept: ()        => ipcRenderer.invoke('panel:drag-accept'),  // called from receiving window
    cancel: ()        => ipcRenderer.invoke('panel:drag-cancel'),
    onCursor: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on('panel:drag-cursor', handler);
      return () => ipcRenderer.removeListener('panel:drag-cursor', handler);
    },
    onReceive: (cb) => {
      const handler = (_, panelId) => cb(panelId);
      ipcRenderer.on('panel:receive', handler);
      return () => ipcRenderer.removeListener('panel:receive', handler);
    },
  },

  // ── Dual-window ──────────────────────────────────────────────────────────
  getWindowRole:     ()  => ipcRenderer.invoke('window:get-role'),
  spawnSecondary:    ()  => ipcRenderer.invoke('window:spawn-secondary'),
  makePrimary:       ()  => ipcRenderer.invoke('window:make-primary'),
  closeSecondary:    ()  => ipcRenderer.invoke('window:close-secondary'),
  hasSecondary:      ()  => ipcRenderer.invoke('window:has-secondary'),

  onRoleChanged: (cb) => {
    const handler = (_, role) => cb(role);
    ipcRenderer.on('window:role-changed', handler);
    return () => ipcRenderer.removeListener('window:role-changed', handler);
  },

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
  // opts: { effort, sessionName, addDirs, maxBudget }
  sendMessage: (messages, model, system, cliSessionId, permMode, opts) =>
    ipcRenderer.invoke('claude:send', { messages, model, system, cliSessionId, permMode, ...(opts || {}) }),

  // Per-stream (split chats) — each call gets its own scoped IPC channels
  sendMessageFor: (messages, model, system, cliSessionId, permMode, requestId, opts) =>
    ipcRenderer.invoke('claude:send', { messages, model, system, cliSessionId, permMode, requestId, ...(opts || {}) }),

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
    create: (opts)              => ipcRenderer.invoke('terminal:create', opts || {}),
    input:  (termId, data)      => ipcRenderer.send('terminal:input', { termId, data }),
    resize: (termId, cols, rows)=> ipcRenderer.send('terminal:resize', { termId, cols, rows }),
    close:  (termId)            => ipcRenderer.send('terminal:close', termId),
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

  // ── Active project (cwd passed to CLI) ───────────────────────────────────
  project: {
    setCwd: (projectPath) => ipcRenderer.invoke('project:set-cwd', projectPath),
    getCwd: ()            => ipcRenderer.invoke('project:get-cwd'),
  },

  // ── Embedded browser (WebContentsView-based Chromium tabs) ───────────────
  // Each tab is a real Chromium process pinned over a panel region.
  // The renderer owns the tab UI + URL bar + bounds; main process owns the
  // WebContentsView lifecycle and ferries page events back.
  browser: {
    create:    (opts)                         => ipcRenderer.invoke('browser:create', opts || {}),
    setBounds: (viewId, x, y, width, height, visible) =>
                                                 ipcRenderer.invoke('browser:set-bounds', { viewId, x, y, width, height, visible }),
    hideAll:   ()                             => ipcRenderer.invoke('browser:hide-all'),
    loadUrl:   (viewId, url)                  => ipcRenderer.invoke('browser:load-url', { viewId, url }),
    nav:       (viewId, action)               => ipcRenderer.invoke('browser:nav', { viewId, action }),
    devtools:  (viewId)                       => ipcRenderer.invoke('browser:devtools', { viewId }),
    openInSystem: (viewId)                    => ipcRenderer.invoke('browser:open-in-system', { viewId }),
    close:     (viewId)                       => ipcRenderer.invoke('browser:close', viewId),
    // Phase 20 diagnostic — runs in the embedded webContents to see whether
    // the stealth spoofs are actually applied. Call from devtools console:
    //   await window.electronAPI.browser.stealthCheck(<viewId>)
    // → { ok, raw: {webdriver, pluginsLength, chromeRuntime, ...},
    //     webdriverHidden, hasPlugins, chromeRuntimePresent, ... }
    stealthCheck: (viewId)                    => ipcRenderer.invoke('browser:stealth-check', viewId),
    // Split-view state sync — renderer pushes the current split layout to
    // main on every mutation so the chrome_split_state MCP tool can return
    // it. Lets Claude drive both panes (research in one, notes in the other)
    // from a single CLI turn via the `targetId` parameter on observe/step/etc.
    setSplitState: (state)                    => ipcRenderer.invoke('browser:set-split-state', state || {}),
    getSplitState: ()                         => ipcRenderer.invoke('browser:get-split-state'),
    // Phase 16 — MCP-driven split control. Main process sends `browser:split-cmd`
    // (with cmd, args, reqId); renderer dispatches and replies via the reqId.
    onSplitCmd: (cb) => {
      const h = (_, data) => cb(data);
      ipcRenderer.on('browser:split-cmd', h);
      return () => ipcRenderer.removeListener('browser:split-cmd', h);
    },
    replySplitCmd: (reqId, result) => ipcRenderer.send('browser:split-cmd-result', { reqId, result }),
    onLoading: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on('browser:loading', handler);
      return () => ipcRenderer.removeListener('browser:loading', handler);
    },
    onNav: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on('browser:nav', handler);
      return () => ipcRenderer.removeListener('browser:nav', handler);
    },
    onTitle: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on('browser:title', handler);
      return () => ipcRenderer.removeListener('browser:title', handler);
    },
    onFavicon: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on('browser:favicon', handler);
      return () => ipcRenderer.removeListener('browser:favicon', handler);
    },
    onFail: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on('browser:fail', handler);
      return () => ipcRenderer.removeListener('browser:fail', handler);
    },
    onPopup: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on('browser:popup', handler);
      return () => ipcRenderer.removeListener('browser:popup', handler);
    },
    onDestroyed: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on('browser:destroyed', handler);
      return () => ipcRenderer.removeListener('browser:destroyed', handler);
    },
    // Per-pane focus — fires when the user clicks INSIDE a WebContentsView.
    // The renderer uses this to follow focus with the URL bar + nav buttons.
    onFocus: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on('browser:focus', handler);
      return () => ipcRenderer.removeListener('browser:focus', handler);
    },
    // Operator API — same primitives Claude has via tools, exposed to the
    // renderer for slash-commands and manual scripting.
    op: {
      state:      ()           => ipcRenderer.invoke('browser:op-state'),
      readPage:   (opts)       => ipcRenderer.invoke('browser:op-read', opts || {}),
      elements:   (opts)       => ipcRenderer.invoke('browser:op-elements', opts || {}),
      screenshot: (opts)       => ipcRenderer.invoke('browser:op-screenshot', opts || {}),
      click:      (opts)       => ipcRenderer.invoke('browser:op-click', opts || {}),
      type:       (opts)       => ipcRenderer.invoke('browser:op-type', opts || {}),
      scroll:     (opts)       => ipcRenderer.invoke('browser:op-scroll', opts || {}),
      nav:        (action)     => ipcRenderer.invoke('browser:op-nav', { action }),
      navigate:   (url)        => ipcRenderer.invoke('browser:op-navigate', { url }),
    },
  },

  // ── Claude CLI sessions (Phase 18) ──────────────────────────────────────
  // Lists / reads the ~/.claude/projects/<cwd>/*.jsonl session files written
  // by Claude Code itself. Lets CCM's sidebar surface CLI sessions alongside
  // chat sessions for a unified session manager.
  cliSessions: {
    list:   (opts) => ipcRenderer.invoke('cli-sessions:list', opts || {}),
    read:   (opts) => ipcRenderer.invoke('cli-sessions:read', opts || {}),
    reveal: (opts) => ipcRenderer.invoke('cli-sessions:reveal', opts || {}),
    // Phase 18b — link CLI session storage to the project folder via junction
    status: (opts) => ipcRenderer.invoke('cli-sessions:storage-status', opts || {}),
    link:   (opts) => ipcRenderer.invoke('cli-sessions:link', opts || {}),
    unlink: (opts) => ipcRenderer.invoke('cli-sessions:unlink', opts || {}),
  },

  // ── Kanban / Tasks ───────────────────────────────────────────────────────
  // Per-project task board (kanban.json in the active project cwd).
  // Same file is used by the CLI tool (bin/kanban.mjs) so terminals + chat + UI stay in sync.
  kanban: {
    read:       ()              => ipcRenderer.invoke('kanban:read'),
    write:      (data)          => ipcRenderer.invoke('kanban:write', data),
    add:        (task)          => ipcRenderer.invoke('kanban:add', task),
    update:     (id, patch)     => ipcRenderer.invoke('kanban:update', { id, patch }),
    move:       (id, col, order)=> ipcRenderer.invoke('kanban:move', { id, col, order }),
    delete:     (id)            => ipcRenderer.invoke('kanban:delete', id),
    clearDone:  ()              => ipcRenderer.invoke('kanban:clear-done'),
    path:       ()              => ipcRenderer.invoke('kanban:path'),
    summary:    ()              => ipcRenderer.invoke('kanban:summary'),
    onChanged: (cb) => {
      const handler = (_, data) => cb(data);
      ipcRenderer.on('kanban:changed', handler);
      return () => ipcRenderer.removeListener('kanban:changed', handler);
    },
  },

  // ── Agent team (Phase 26) ───────────────────────────────────────────────────
  // Main sends `team:spawn` with the role payload; the renderer lays out the
  // Director + agent terminals.
  team: {
    onSpawn: (cb) => {
      const handler = (_, payload) => cb(payload);
      ipcRenderer.on('team:spawn', handler);
      return () => ipcRenderer.removeListener('team:spawn', handler);
    },
  },

  // ── Git integration ───────────────────────────────────────────────────────
  git: {
    status:   (cwd)                    => ipcRenderer.invoke('git:status',    cwd),
    log:      (opts)                   => ipcRenderer.invoke('git:log',       opts),
    diffStat: (opts)                   => ipcRenderer.invoke('git:diff-stat', opts),
    remote:   (cwd)                    => ipcRenderer.invoke('git:remote',    cwd),
    action:   (action, cwd, args)      => ipcRenderer.invoke('git:action',    { action, cwd, args }),
  },

  github: {
    auth:        (action)      => ipcRenderer.invoke('github:auth',        action),
    devicePoll:  (deviceCode)  => ipcRenderer.invoke('github:device-poll', { deviceCode }),
    openUrl:     (url)         => ipcRenderer.invoke('shell:open-url',     url),
    // PAT storage — token encrypted via safeStorage in main process
    token: {
      has:    () => ipcRenderer.invoke('github:token-has'),
      get:    () => ipcRenderer.invoke('github:token-get'),
      set:    (tok) => ipcRenderer.invoke('github:token-set', tok),
      clear:  () => ipcRenderer.invoke('github:token-clear'),
    },
  },

  screenshots: {
    list:              ()              => ipcRenderer.invoke('screenshots:list'),
    save:              (dataUrl, name) => ipcRenderer.invoke('screenshots:save',             { dataUrl, name }),
    delete:            (id)            => ipcRenderer.invoke('screenshots:delete',            id),
    deleteAll:         ()              => ipcRenderer.invoke('screenshots:delete-all'),
    capture:           ()              => ipcRenderer.invoke('screenshots:capture'),
    captureFullscreen: ()              => ipcRenderer.invoke('screenshots:capture-fullscreen'),
    captureRegion:     ()              => ipcRenderer.invoke('screenshots:capture-region'),
    fromClipboard:     ()              => ipcRenderer.invoke('screenshots:from-clipboard'),
    copyToClipboard:   (dataUrl)       => ipcRenderer.invoke('screenshots:copy-to-clipboard', { dataUrl }),
    openFile:          (id)            => ipcRenderer.invoke('screenshots:open-file',         id),
  },

  // ── MCP servers ───────────────────────────────────────────────────────────
  mcp: {
    list:   ()                          => ipcRenderer.invoke('mcp:list'),
    add:    (name, config, scope)       => ipcRenderer.invoke('mcp:add',    { name, config, scope }),
    remove: (name, scope)               => ipcRenderer.invoke('mcp:remove', { name, scope }),
    update: (name, config, scope)       => ipcRenderer.invoke('mcp:update', { name, config, scope }),
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
    pickFolder:     ()          => ipcRenderer.invoke('fs:pick-folder'),
    onChanged: (cb) => {
      const handler = (_, dirPath) => cb(dirPath);
      ipcRenderer.on('fs:changed', handler);
      return () => ipcRenderer.removeListener('fs:changed', handler);
    },
  },

  // ── Apercu local static server ─────────────────────────────────────────────
  // Serves a local folder on a random localhost port for the Preview iframe.
  // URL is broadcast to all windows via 'apercu:server-changed'.
  apercu: {
    serve:  (folderPath) => ipcRenderer.invoke('apercu:serve', folderPath || null),
    stop:   ()           => ipcRenderer.invoke('apercu:stop'),
    status: ()           => ipcRenderer.invoke('apercu:status'),
    onServerChanged: (cb) => {
      const handler = (_, data) => cb(data); // { url, dir } or { url: null, dir: null }
      ipcRenderer.on('apercu:server-changed', handler);
      return () => ipcRenderer.removeListener('apercu:server-changed', handler);
    },
  },
});
