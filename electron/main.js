'use strict';

const {
  app, BrowserWindow, Menu, Tray, shell,
  ipcMain, globalShortcut, Notification, nativeImage,
} = require('electron');
const path     = require('path');
const fs       = require('fs');
const { spawn } = require('child_process');

// Dev: not packaged AND not explicitly forced to production
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

// Lazy-load claude-service only after app is ready (app.getPath requires it)
let claudeService = null;
function getClaudeService() {
  if (!claudeService) claudeService = require('./claude-service');
  return claudeService;
}

// ── Window state persistence ─────────────────────────────────────────────────

const STATE_PATH = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch (e) {
    if (e.code !== 'ENOENT') console.warn('[window-state] reset:', e.message);
    return { width: 1360, height: 860, x: undefined, y: undefined, maximized: false };
  }
}
function saveWindowState(win) {
  try {
    const b   = win.getBounds();
    const state = { ...b, maximized: win.isMaximized() };
    fs.writeFileSync(STATE_PATH, JSON.stringify(state), 'utf8');
  } catch (e) { console.error('[window-state]', e.message); }
}

// ── Tray icon ────────────────────────────────────────────────────────────────

let tray = null;

function createTray(mainWin) {
  try {
    // Prefer tray-icon.ico (Windows native, no rasterisation needed),
    // then PNG, then a generated orange circle as last resort.
    const candidates = [
      path.join(__dirname, 'tray-icon.ico'),
      path.join(__dirname, 'tray-icon.png'),
    ];

    let img = null;
    for (const f of candidates) {
      if (fs.existsSync(f)) {
        const candidate = nativeImage.createFromPath(f);
        if (!candidate.isEmpty()) { img = candidate; break; }
      }
    }

    if (!img || img.isEmpty()) img = makeFallbackIcon();

    tray = new Tray(img);
    tray.setToolTip('Claude Code Mods');

    const menu = Menu.buildFromTemplate([
      { label: 'Show Claude Code', click: () => { mainWin.show(); mainWin.focus(); } },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.isQuiting = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu);
    tray.on('click',        () => { mainWin.isVisible() ? mainWin.hide() : mainWin.show(); });
    tray.on('double-click', () => { mainWin.show(); mainWin.focus(); });
  } catch (e) {
    console.error('[tray]', e.message);
  }
}

/** Last-resort: generated orange circle, no external files needed */
function makeFallbackIcon() {
  const zlib = require('zlib');
  const size = 32, [R, G, B] = [0xd9, 0x77, 0x57];
  const cx = size / 2, cy = size / 2, rad = size / 2 - 1;
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rb = y * (1 + size * 4); raw[rb] = 0;
    for (let x = 0; x < size; x++) {
      const off = rb + 1 + x * 4;
      const a = Math.round(Math.max(0, Math.min(1, rad - Math.hypot(x - cx + .5, y - cy + .5) + .5)) * 255);
      raw[off] = R; raw[off+1] = G; raw[off+2] = B; raw[off+3] = a;
    }
  }
  const crc32 = b => { let c=0xFFFFFFFF; for(const v of b){c^=v;for(let j=0;j<8;j++)c=(c>>>1)^(c&1?0xEDB88320:0);} return(c^0xFFFFFFFF)>>>0; };
  const chunk = (t,d) => { const l=Buffer.allocUnsafe(4);l.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t,'ascii'),d]);const c=Buffer.allocUnsafe(4);c.writeUInt32BE(crc32(td));return Buffer.concat([l,td,c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size,0); ihdr.writeUInt32BE(size,4); ihdr[8]=8; ihdr[9]=6;
  return nativeImage.createFromBuffer(Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
    chunk('IHDR',ihdr), chunk('IDAT',zlib.deflateSync(raw)), chunk('IEND',Buffer.alloc(0)),
  ]));
}

// ── About window ─────────────────────────────────────────────────────────────

let aboutWin = null;

function openAboutWindow() {
  if (aboutWin) { aboutWin.focus(); return; }
  aboutWin = new BrowserWindow({
    width: 380, height: 280,
    resizable: false, minimizable: false, maximizable: false,
    title: 'About Claude Code',
    backgroundColor: '#0b0b0c',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  aboutWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body{font-family:system-ui;background:#0b0b0c;color:#e7e7ea;display:flex;flex-direction:column;
       align-items:center;justify-content:center;height:100vh;margin:0;gap:10px;text-align:center}
  h1{font-size:20px;margin:0}p{font-size:12px;color:#8a8a92;margin:2px 0}a{color:#6a86c3}
</style></head><body>
  <svg viewBox="0 0 24 24" fill="#d97757" width="48" height="48"><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"/></svg>
  <h1>Claude Code</h1>
  <p>Version ${app.getVersion()}</p>
  <p>Fan-made desktop UI redesign</p>
  <p style="margin-top:8px;color:#5a5a63">Not affiliated with Anthropic</p>
  <p><a href="https://anthropic.com">anthropic.com</a></p>
</body></html>`)}`);
  aboutWin.on('closed', () => { aboutWin = null; });
}

// ── Window ───────────────────────────────────────────────────────────────────

let mainWin = null;

function createWindow() {
  const state = loadWindowState();

  const win = new BrowserWindow({
    width:     state.width  || 1360,
    height:    state.height || 860,
    x:         state.x,
    y:         state.y,
    minWidth:  900,
    minHeight: 600,
    title: 'Claude Code Mods',
    backgroundColor: '#0b0b0c',
    show: false,
    frame: false,           // custom title bar
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      spellcheck:       false,
      webSecurity:      !isDev,
    },
    autoHideMenuBar: true,
  });

  mainWin = win;

  // ── Filesystem watcher — notifies renderer when files change under FS_ROOT ──
  let _fsWatcher = null;
  const _fsDebounce = new Map(); // dirPath → timeout id

  function startFsWatcher() {
    if (_fsWatcher) return;
    try {
      _fsWatcher = fs.watch(FS_ROOT, { recursive: true }, (eventType, filename) => {
        if (!filename) return;
        // Derive the directory that changed (parent of the changed entry)
        const fullPath   = path.join(FS_ROOT, filename);
        const changedDir = path.dirname(fullPath);
        // Debounce rapid bursts (e.g. file saves emit multiple events)
        clearTimeout(_fsDebounce.get(changedDir));
        _fsDebounce.set(changedDir, setTimeout(() => {
          _fsDebounce.delete(changedDir);
          if (!win.isDestroyed()) win.webContents.send('fs:changed', changedDir);
        }, 250));
      });
      _fsWatcher.on('error', e => console.error('[fs:watch]', e.message));
    } catch (e) {
      console.error('[fs:watch] could not start:', e.message);
    }
  }
  startFsWatcher();

  win.on('closed', () => {
    _fsWatcher?.close();
    _fsWatcher = null;
    // Drain any pending debounce timers so they don't fire on a destroyed window.
    for (const t of _fsDebounce.values()) clearTimeout(t);
    _fsDebounce.clear();
  });

  if (state.maximized) win.maximize();

  win.once('ready-to-show', () => win.show());

  // Forward maximize state to renderer for title bar button
  win.on('maximize',   () => win.webContents.send('window:maximized'));
  win.on('unmaximize', () => win.webContents.send('window:unmaximized'));

  // Persist window state on move/resize/close
  const onStateChange = () => saveWindowState(win);
  win.on('resize',    onStateChange);
  win.on('move',      onStateChange);
  win.on('close', (e) => {
    if (!app.isQuiting && tray) {
      // Minimize to tray instead of closing
      e.preventDefault();
      win.hide();
      return;
    }
    saveWindowState(win);
  });

  if (isDev) {
    // Scan ports 5182-5190 to find whichever port Vite chose
    const http = require('http');
    const findVitePort = (ports, cb) => {
      if (!ports.length) return cb(5182); // fallback
      const [p, ...rest] = ports;
      const req = http.get(`http://localhost:${p}/`, r => { r.resume(); cb(p); });
      req.on('error', () => findVitePort(rest, cb));
      req.setTimeout(300, () => { req.destroy(); findVitePort(rest, cb); });
    };
    findVitePort([5182, 5183, 5184, 5185, 5186, 5187, 5188, 5189, 5190], port => {
      win.loadURL(`http://localhost:${port}`);
    });
    // DevTools: open manually with Ctrl+Shift+I if needed
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Forward renderer console messages to terminal (errors & warnings visible in npm run output).
  // Suppress harmless DevTools Protocol noise (Autofill CDP commands unsupported in Electron).
  win.webContents.on('console-message', (eventOrLevel, maybeMsg, maybeLine, maybeSource) => {
    const isObj = typeof eventOrLevel === 'object' && eventOrLevel !== null;
    const msg    = isObj ? (eventOrLevel.message || '') : (typeof maybeMsg === 'string' ? maybeMsg : '');
    const level  = isObj ? (eventOrLevel.level  || 0)  : 0;  // 1=info,2=warn,3=error
    if (msg.includes('Autofill.enable') || msg.includes('Autofill.setAddresses')) return;
    if (level >= 2) {
      // Show warnings and errors in the Electron terminal so they're visible
      const prefix = level >= 3 ? '[RENDERER ERROR]' : '[RENDERER WARN]';
      console.log(prefix, msg.slice(0, 400));
    }
  });

  // F12 / Ctrl+Shift+I → open DevTools (always available in dev)
  win.webContents.on('before-input-event', (_, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      win.webContents.isDevToolsOpened()
        ? win.webContents.closeDevTools()
        : win.webContents.openDevTools({ mode: 'detach' });
    }
  });

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
  const win = createWindow();
  createTray(win);

  // Global shortcuts
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (win.isVisible()) { win.hide(); } else { win.show(); win.focus(); }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWin?.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { app.isQuiting = true; });

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// ── IPC: app info ────────────────────────────────────────────────────────────

ipcMain.handle('app:info', () => ({
  version:  app.getVersion(),
  platform: process.platform,
  electron: process.versions.electron,
  node:     process.versions.node,
}));

// ── IPC: window controls ─────────────────────────────────────────────────────

ipcMain.on('window:minimize',  () => mainWin?.minimize());
ipcMain.on('window:maximize',  () => mainWin?.isMaximized() ? mainWin.unmaximize() : mainWin?.maximize());
ipcMain.on('window:close',     () => { if (mainWin) { app.isQuiting = true; mainWin.close(); } });
ipcMain.on('window:hide',      () => mainWin?.hide());
ipcMain.handle('window:is-maximized', () => mainWin?.isMaximized() ?? false);

// Find-in-page
ipcMain.on('find:start',  (_, text)   => mainWin?.webContents.findInPage(text, { findNext: false }));
ipcMain.on('find:next',   (_, text)   => mainWin?.webContents.findInPage(text, { findNext: true,  forward: true  }));
ipcMain.on('find:prev',   (_, text)   => mainWin?.webContents.findInPage(text, { findNext: true,  forward: false }));
ipcMain.on('find:stop',   ()          => mainWin?.webContents.stopFindInPage('clearSelection'));

// About window
ipcMain.on('app:about', openAboutWindow);

// Desktop notifications. Coerce + cap renderer-supplied strings — the OS will
// happily render very long titles/bodies and they look like garbage in the
// system notification centre.
ipcMain.on('notify', (_, payload) => {
  if (!Notification.isSupported()) return;
  const t = typeof payload?.title === 'string' ? payload.title.slice(0, 120) : 'Claude Code';
  const b = typeof payload?.body === 'string' ? payload.body.slice(0, 500) : '';
  new Notification({ title: t || 'Claude Code', body: b, silent: false }).show();
});

// ── IPC: API key management ──────────────────────────────────────────────────

ipcMain.handle('claude:has-key', () => {
  const svc = getClaudeService();
  const status = svc.getAuthStatus();
  return status.valid;
});

ipcMain.handle('claude:set-key', (_, key) => {
  getClaudeService().setRawApiKey(key);
  return true;
});

ipcMain.handle('claude:clear-key', () => {
  getClaudeService().clearRawApiKey();
  return true;
});

// ── IPC: OAuth / auth ────────────────────────────────────────────────────────

ipcMain.handle('claude:get-auth-status', () => {
  return getClaudeService().getAuthStatus();
});

// Silently refresh expired token; returns updated status.
ipcMain.handle('claude:ensure-auth', async () => {
  const svc = getClaudeService();
  try { await svc.getCredential(); } catch (e) { /* ignore */ }
  return svc.getAuthStatus();
});

ipcMain.handle('claude:sign-in', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return getClaudeService().startOAuthSignIn(win);
});

ipcMain.handle('claude:sign-out', () => {
  getClaudeService().clearRawApiKey();
  try {
    const credPath = path.join(
      process.env.USERPROFILE || process.env.HOME || require('os').homedir(),
      '.claude', '.credentials.json'
    );
    if (fs.existsSync(credPath)) {
      const raw = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      delete raw.claudeAiOauth;
      fs.writeFileSync(credPath, JSON.stringify(raw, null, 2), 'utf8');
    }
  } catch (e) { console.error('[sign-out]', e.message); }
  return true;
});

// ── IPC: streaming chat ──────────────────────────────────────────────────────

ipcMain.handle('claude:send', async (event, { messages, model, system, cliSessionId, permMode, requestId }) => {
  return getClaudeService().streamMessage(event, messages, model, system, cliSessionId, permMode, requestId);
});

ipcMain.handle('claude:abort', (_, requestId) => {
  return getClaudeService().abortCurrentStream(requestId);
});

// ── IPC: knowledge-base file editor ──────────────────────────────────────────
// Whitelist of editable files. Paths are resolved at read/write time.
const APP_ROOT   = path.join(__dirname, '..');
const USER_HOME  = process.env.USERPROFILE || process.env.HOME || require('os').homedir();
const CLAUDE_DIR = path.join(USER_HOME, '.claude');

const KB_FILES = [
  { id: 'project-claude',   label: 'CLAUDE.md',           icon: 'list-checks',   path: () => path.join(APP_ROOT, 'CLAUDE.md') },
  { id: 'skill-context',    label: 'app-context.md',      icon: 'monitor',       path: () => path.join(APP_ROOT, 'skills', 'app-context.md') },
  { id: 'skill-jsx',        label: 'jsx-code-blocks.md',  icon: 'code',          path: () => path.join(APP_ROOT, 'skills', 'jsx-code-blocks.md') },
  { id: 'skill-design',     label: 'design-system.md',    icon: 'image',         path: () => path.join(APP_ROOT, 'skills', 'design-system.md') },
  { id: 'skill-agents',     label: 'agents.md',           icon: 'robot',         path: () => path.join(APP_ROOT, 'skills', 'agents.md') },
  { id: 'global-claude',    label: '~/.claude/CLAUDE.md', icon: 'gear-six',      path: () => path.join(CLAUDE_DIR, 'CLAUDE.md') },
  { id: 'project-memory',   label: 'MEMORY.md',           icon: 'push-pin',      path: () => path.join(CLAUDE_DIR, 'projects', 'C--', 'memory', 'MEMORY.md') },
];

ipcMain.handle('kb:list', () => KB_FILES.map(f => ({ id: f.id, label: f.label, icon: f.icon })));

ipcMain.handle('kb:read', async (_, id) => {
  const entry = KB_FILES.find(f => f.id === id);
  if (!entry) return { ok: false, error: 'Unknown file id' };
  const filePath = entry.path();
  try {
    const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    return { ok: true, content, path: filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('kb:write', async (_, { id, content }) => {
  const entry = KB_FILES.find(f => f.id === id);
  if (!entry) return { ok: false, error: 'Unknown file id' };
  const filePath = entry.path();
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('kb:create-skill', async (_, { name }) => {
  // Sanitise: lowercase, replace spaces with dashes, strip non-alnum/-
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
  if (!slug) return { ok: false, error: 'Invalid skill name' };
  const filename = slug.endsWith('.md') ? slug : slug + '.md';
  const filePath = path.join(APP_ROOT, 'skills', filename);
  if (fs.existsSync(filePath)) return { ok: false, error: 'Skill already exists' };
  const template = `# ${name}\n\n<!-- Describe what this skill does -->\n\n## Instructions\n\n`;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, template, 'utf8');
    const id = 'skill-' + slug.replace('.md', '');
    KB_FILES.push({ id, label: filename, icon: 'sparkle', path: () => filePath });
    return { ok: true, id, label: filename, path: filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('kb:delete-skill', async (_, id) => {
  const idx = KB_FILES.findIndex(f => f.id === id);
  if (idx === -1) return { ok: false, error: 'Unknown file id' };
  const entry = KB_FILES[idx];
  // Only allow deleting skill-* entries (protect CLAUDE.md, MEMORY.md etc.)
  if (!entry.id.startsWith('skill-')) return { ok: false, error: 'Cannot delete system files' };
  const filePath = entry.path();
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    KB_FILES.splice(idx, 1);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: codeblock library ───────────────────────────────────────────────────
// Persistent artifact store: codeblocks/{name}/codeblock_XXXXXX.html
// Each block gets a globally unique 6-digit zero-padded ID.

const CB_ROOT        = path.join(__dirname, '..', 'codeblocks');
const CB_COUNTER_FILE = path.join(CB_ROOT, '.counter.json');

function cbEnsureRoot() {
  fs.mkdirSync(CB_ROOT, { recursive: true });
}

function cbNextId() {
  cbEnsureRoot();
  let counter = 0;
  try { counter = JSON.parse(fs.readFileSync(CB_COUNTER_FILE, 'utf8')).next || 0; } catch {}
  const id = counter + 1;
  fs.writeFileSync(CB_COUNTER_FILE, JSON.stringify({ next: id }), 'utf8');
  return String(id).padStart(6, '0');
}

function cbIdToPath(id) {
  // Scan all subdirs for a file matching codeblock_{id}.html
  cbEnsureRoot();
  for (const sub of fs.readdirSync(CB_ROOT, { withFileTypes: true })) {
    if (!sub.isDirectory()) continue;
    const candidate = path.join(CB_ROOT, sub.name, `codeblock_${id}.html`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

ipcMain.handle('codeblock:save', async (_, { name, html, lang, source }) => {
  cbEnsureRoot();
  const id      = cbNextId();
  const slug    = (name || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 32);
  const dir     = path.join(CB_ROOT, slug);
  fs.mkdirSync(dir, { recursive: true });
  const filename = `codeblock_${id}.html`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, html, 'utf8');
  // Sidecar — stores the original source code + language for edit context
  if (source && lang) {
    const metaPath = path.join(dir, `codeblock_${id}.meta.json`);
    fs.writeFileSync(metaPath, JSON.stringify({ lang, source }), 'utf8');
  }
  return { id, slug, filename, filePath };
});

ipcMain.handle('codeblock:load', async (_, id) => {
  const filePath = cbIdToPath(id);
  if (!filePath) return { ok: false, error: `codeblock_${id} not found` };
  try {
    const html = fs.readFileSync(filePath, 'utf8');
    // Load sidecar if it exists
    const metaPath = filePath.replace(/\.html$/, '.meta.json');
    let lang = 'html', source = null;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      lang   = meta.lang   || 'html';
      source = meta.source || null;
    } catch {}
    return { ok: true, html, lang, source, filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('codeblock:update', async (_, { id, html, lang, source }) => {
  const filePath = cbIdToPath(id);
  if (!filePath) return { ok: false, error: `codeblock_${id} not found` };
  try {
    fs.writeFileSync(filePath, html, 'utf8');
    if (source && lang) {
      const metaPath = filePath.replace(/\.html$/, '.meta.json');
      fs.writeFileSync(metaPath, JSON.stringify({ lang, source }), 'utf8');
    }
    return { ok: true, filePath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('codeblock:saveSrc', async (_, { filename, lang, source }) => {
  cbEnsureRoot();
  // Sanitise the filename the user typed (e.g. "MyWidget.tsx")
  const safeFile = (filename || `untitled.${lang || 'txt'}`)
    .replace(/[/\\:*?"<>|]+/g, '_')   // strip illegal chars
    .slice(0, 80);
  // Use the base name (without extension) as the folder slug
  const slug = safeFile.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_\-]+/g, '_') || 'untitled';
  const dir  = path.join(CB_ROOT, slug);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, safeFile);
  fs.writeFileSync(filePath, source || '', 'utf8');
  return { ok: true, filePath };
});

ipcMain.handle('codeblock:list', async () => {
  cbEnsureRoot();
  const results = [];
  for (const sub of fs.readdirSync(CB_ROOT, { withFileTypes: true })) {
    if (!sub.isDirectory() || sub.name.startsWith('.')) continue;
    const subDir = path.join(CB_ROOT, sub.name);
    for (const f of fs.readdirSync(subDir)) {
      const m = f.match(/^codeblock_(\d+)\.html$/);
      if (!m) continue;
      const stat = fs.statSync(path.join(subDir, f));
      results.push({ id: m[1], slug: sub.name, filename: f,
                     filePath: path.join(subDir, f), mtime: stat.mtimeMs });
    }
  }
  results.sort((a, b) => Number(a.id) - Number(b.id));
  return results;
});

// ── IPC: Notes ───────────────────────────────────────────────────────────────
const NOTES_ROOT = path.join(__dirname, '..', 'notes');
function notesEnsure() { fs.mkdirSync(NOTES_ROOT, { recursive: true }); }

function noteTitleFromContent(content) {
  const first = (content || '').split('\n')[0];
  return first.startsWith('# ') ? first.slice(2).trim() : null;
}

ipcMain.handle('notes:list', async () => {
  notesEnsure();
  const files = fs.readdirSync(NOTES_ROOT).filter(f => f.endsWith('.md') && !f.startsWith('.'));
  return files.map(f => {
    const filePath = path.join(NOTES_ROOT, f);
    const stat = fs.statSync(filePath);
    let title = f.replace(/\.md$/, '');
    let preview = '';
    try {
      const lines = fs.readFileSync(filePath, 'utf8').split('\n');
      if (lines[0].startsWith('# ')) { title = lines[0].slice(2).trim(); }
      preview = lines.filter(l => l.trim() && !l.startsWith('#')).slice(0, 2).join(' ').slice(0, 80);
    } catch {}
    return { id: f, title, preview, mtime: stat.mtimeMs };
  }).sort((a, b) => b.mtime - a.mtime);
});

function notesResolve(id) {
  if (typeof id !== 'string' || !id) return null;
  const filePath = path.resolve(path.join(NOTES_ROOT, path.basename(id)));
  const rel = path.relative(NOTES_ROOT, filePath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return filePath;
}

ipcMain.handle('notes:read', async (_, id) => {
  notesEnsure();
  const filePath = notesResolve(id);
  if (!filePath) return { ok: false, error: 'Invalid path' };
  try { return { ok: true, content: fs.readFileSync(filePath, 'utf8') }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('notes:write', async (_, { id, content }) => {
  notesEnsure();
  const filePath = notesResolve(id);
  if (!filePath) return { ok: false, error: 'Invalid path' };
  try { fs.writeFileSync(filePath, content, 'utf8'); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('notes:create', async (_, { title }) => {
  notesEnsure();
  const safe = (title || 'untitled').replace(/[/\\:*?"<>|]+/g, '-').slice(0, 60);
  let filename = safe + '.md';
  let n = 1;
  while (fs.existsSync(path.join(NOTES_ROOT, filename))) filename = `${safe}-${n++}.md`;
  const content = `# ${title || 'Untitled'}\n\n`;
  fs.writeFileSync(path.join(NOTES_ROOT, filename), content, 'utf8');
  return { ok: true, id: filename };
});

ipcMain.handle('notes:delete', async (_, id) => {
  const filePath = notesResolve(id);
  if (!filePath) return { ok: false, error: 'Invalid path' };
  try { fs.unlinkSync(filePath); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});

// ── IPC: file-system explorer ────────────────────────────────────────────────
const FS_ROOT   = path.resolve(path.join(__dirname, '../..')); // G:\claude_code_mod
const FS_IGNORE = new Set([
  'node_modules', '.git', 'dist', 'release', '.cache',
  'coverage', '__pycache__', '.pytest_cache', '.parcel-cache',
]);

// Reject any path that escapes FS_ROOT. Returns the resolved path on success,
// or null if the input would leave the sandbox. Uses path.relative so we can't
// be tricked by /fs-root-evil prefix matches.
function safeResolveUnder(root, input) {
  if (typeof input !== 'string' || !input) return null;
  const resolved = path.resolve(input);
  const rel = path.relative(root, resolved);
  if (rel === '') return resolved;
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return resolved;
}

ipcMain.handle('fs:root', () => FS_ROOT);

ipcMain.handle('fs:mkdir', async (_, dirPath) => {
  const resolved = safeResolveUnder(FS_ROOT, dirPath);
  if (!resolved) return { ok: false, error: 'Path outside workspace' };
  try {
    fs.mkdirSync(resolved, { recursive: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('fs:list', async (_, dirPath) => {
  const resolved = dirPath ? safeResolveUnder(FS_ROOT, dirPath) : FS_ROOT;
  if (!resolved) return { ok: false, error: 'Path outside workspace' };
  try {
    const raw = await fs.promises.readdir(resolved, { withFileTypes: true });
    const entries = raw
      .filter(e => !FS_IGNORE.has(e.name))
      .map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'dir' : 'file',
        path: path.join(resolved, e.name),
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
    return { ok: true, entries, dir: resolved };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('fs:read', async (_, filePath) => {
  const resolved = safeResolveUnder(FS_ROOT, filePath);
  if (!resolved) return { ok: false, error: 'Path outside workspace' };
  try {
    const stat = await fs.promises.stat(resolved);
    if (stat.size > 2 * 1024 * 1024) return { ok: false, error: 'File too large (>2 MB)' };
    const content = await fs.promises.readFile(resolved, 'utf8');
    return { ok: true, content, path: resolved };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('fs:writeText', async (_, filePath, content) => {
  const resolved = safeResolveUnder(FS_ROOT, filePath);
  if (!resolved) return { ok: false, error: 'Path outside workspace' };
  try {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    await fs.promises.writeFile(resolved, content, 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('fs:exists', async (_, filePath) => {
  const resolved = safeResolveUnder(FS_ROOT, filePath);
  if (!resolved) return { exists: false };
  try {
    const stat = await fs.promises.stat(resolved);
    return { exists: true, isDir: stat.isDirectory(), isFile: stat.isFile() };
  } catch {
    return { exists: false };
  }
});

ipcMain.handle('shell:open', async (_, filePath) => {
  const resolved = safeResolveUnder(FS_ROOT, filePath);
  if (!resolved) return { ok: false, error: 'Path outside workspace' };
  try {
    await shell.openPath(resolved);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: agents persistence ────────────────────────────────────────────────
const AGENTS_FILE = path.join(APP_ROOT, 'agents.json');
const AGENTS_DIR  = path.join(APP_ROOT, 'agents');

// Ensure agents/ directory exists
fs.mkdirSync(AGENTS_DIR, { recursive: true });

// Load all agents: agents/ directory (primary) + agents.json (fallback/legacy)
ipcMain.handle('agents:load-all', () => {
  const byName = new Map();

  // 1. Legacy combined file (lower priority — directory files win)
  try {
    const list = JSON.parse(fs.readFileSync(AGENTS_FILE, 'utf8'));
    if (Array.isArray(list)) list.forEach(a => { if (a.name) byName.set(a.name, a); });
  } catch (_) {}

  // 2. Per-agent .json files in agents/ directory (higher priority)
  try {
    for (const fname of fs.readdirSync(AGENTS_DIR)) {
      if (!fname.endsWith('.json')) continue;
      try {
        const a = JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, fname), 'utf8'));
        if (a && a.name) byName.set(a.name, a);
      } catch (_) {}
    }
  } catch (_) {}

  return [...byName.values()];
});

ipcMain.handle('agents:save', async (_, agents) => {
  try {
    // Write combined agents.json (backward compat for CLI)
    fs.writeFileSync(AGENTS_FILE, JSON.stringify(agents, null, 2), 'utf8');

    // Write one .json per agent into agents/ directory
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
    // Clean up old files first, then rewrite
    try {
      for (const f of fs.readdirSync(AGENTS_DIR)) {
        if (f.endsWith('.json')) fs.unlinkSync(path.join(AGENTS_DIR, f));
      }
    } catch (_) {}
    for (const a of agents) {
      const safe = (a.name || 'agent').replace(/[^a-zA-Z0-9_\-]/g, '_');
      fs.writeFileSync(path.join(AGENTS_DIR, safe + '.json'), JSON.stringify(a, null, 2), 'utf8');
    }


    // Also regenerate skills/agents.md so CLAUDE.md @import picks it up
    const lines = [
      '# Available Sub-Agents',
      '',
      'These agents are configured in Claude Code Mods. You can invoke them when the user asks.',
      'Invocation syntax the user may use: "@agentname do X" or "use sub agent <name> to do X".',
      '',
    ];
    for (const a of agents) {
      lines.push(`## ${a.name}`);
      lines.push(`- **Type**: ${a.type}`);
      if (a.model)    lines.push(`- **Model**: ${a.model}`);
      if (a.endpoint) lines.push(`- **Endpoint**: ${a.endpoint}`);
      if (a.system)   lines.push(`- **System prompt**: ${a.system}`);
      if (a.notes)    lines.push(`- **Notes**: ${a.notes}`);
      lines.push('');
    }
    const skillsDir  = path.join(APP_ROOT, 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(path.join(skillsDir, 'agents.md'), lines.join('\n'), 'utf8');

    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: session persistence (disk-backed, survives app reinstalls) ──────────
// Replaces localStorage for session list, message histories, and app state.
// Layout:
//   full_install/sessions/metadata.json  — session list + app state
//   full_install/sessions/{id}.json      — messages for each session

const SESSIONS_ROOT  = path.join(APP_ROOT, 'sessions');
const SESSIONS_META  = path.join(SESSIONS_ROOT, 'metadata.json');

function sessEnsureRoot() {
  fs.mkdirSync(SESSIONS_ROOT, { recursive: true });
}

ipcMain.handle('sessions:load-meta', () => {
  sessEnsureRoot();
  try { return JSON.parse(fs.readFileSync(SESSIONS_META, 'utf8')); }
  catch { return null; }
});

ipcMain.handle('sessions:save-meta', async (_, meta) => {
  sessEnsureRoot();
  try {
    fs.writeFileSync(SESSIONS_META, JSON.stringify(meta, null, 2), 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('sessions:load-msgs', (_, id) => {
  sessEnsureRoot();
  const filePath = path.join(SESSIONS_ROOT, `${id}.json`);
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return []; }
});

ipcMain.handle('sessions:save-msgs', async (_, id, msgs) => {
  sessEnsureRoot();
  const filePath = path.join(SESSIONS_ROOT, `${id}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(msgs), 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('sessions:delete-msgs', async (_, id) => {
  sessEnsureRoot();
  const filePath = path.join(SESSIONS_ROOT, `${id}.json`);
  try { fs.unlinkSync(filePath); } catch {}
  return { ok: true };
});

// ── IPC: memory files ──────────────────────────────────────────────────────
// Persistent user memory: full_install/memory/*.md
// All .md files are injected into the system prompt automatically on every send.

const MEMORY_ROOT = path.join(APP_ROOT, 'memory');

function memEnsureRoot() {
  fs.mkdirSync(MEMORY_ROOT, { recursive: true });
}

// Returns an array of { id, label } for all .md files in memory/
ipcMain.handle('memory:list', () => {
  memEnsureRoot();
  try {
    return fs.readdirSync(MEMORY_ROOT)
      .filter(f => f.endsWith('.md'))
      .sort()
      .map(f => ({ id: f, label: f }));
  } catch { return []; }
});

// Read a single memory file by filename (e.g. "user.md")
ipcMain.handle('memory:read', async (_, id) => {
  memEnsureRoot();
  const filePath = path.join(MEMORY_ROOT, path.basename(id));
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return { ok: true, content };
  } catch (e) { return { ok: false, error: e.message }; }
});

// Write / overwrite a memory file
ipcMain.handle('memory:write', async (_, { id, content }) => {
  memEnsureRoot();
  const filePath = path.join(MEMORY_ROOT, path.basename(id));
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

// Delete a memory file
ipcMain.handle('memory:delete', async (_, id) => {
  const filePath = path.join(MEMORY_ROOT, path.basename(id));
  try { fs.unlinkSync(filePath); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});

// Load ALL memory files concatenated — used for system-prompt injection
ipcMain.handle('memory:load-all', () => {
  memEnsureRoot();
  try {
    const files = fs.readdirSync(MEMORY_ROOT).filter(f => f.endsWith('.md')).sort();
    const parts = files.map(f => {
      try { return fs.readFileSync(path.join(MEMORY_ROOT, f), 'utf8').trim(); }
      catch { return null; }
    }).filter(Boolean);
    return parts.join('\n\n');
  } catch { return ''; }
});

// ── IPC: embedded terminal ─────────────────────────────────────────────────
// Spawns a real shell (PowerShell on Windows, bash/zsh on macOS/Linux) and
// wires its stdin/stdout/stderr to the renderer via IPC events.
// Multiple terminal instances are supported via a termId integer.

const terminals = new Map(); // termId → { proc, sender }
let _nextTermId  = 1;

function getShellConfig() {
  const platform = process.platform;
  if (platform === 'win32') {
    // Prefer PowerShell 7 (pwsh), fall back to Windows PowerShell
    return { cmd: 'pwsh.exe', args: ['-NoLogo'], fallback: 'powershell.exe' };
  }
  if (platform === 'darwin') {
    return { cmd: process.env.SHELL || '/bin/zsh', args: [] };
  }
  return { cmd: process.env.SHELL || '/bin/bash', args: [] };
}

ipcMain.handle('terminal:create', (event, { cwd } = {}) => {
  const termId  = _nextTermId++;
  // Confine the terminal's starting directory to the workspace. Anything
  // missing, malformed, or outside FS_ROOT falls back to APP_ROOT.
  let workDir = APP_ROOT;
  if (typeof cwd === 'string' && cwd) {
    const resolved = safeResolveUnder(FS_ROOT, cwd);
    if (resolved) workDir = resolved;
  }
  const { cmd, args, fallback } = getShellConfig();

  const spawnShell = (exe) => spawn(exe, args || [], {
    cwd:   workDir,
    env:   { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    windowsHide: true,
  });

  let proc;
  try {
    proc = spawnShell(cmd);
  } catch {
    if (fallback) {
      try { proc = spawnShell(fallback); }
      catch (e2) { return { ok: false, error: e2.message }; }
    } else {
      return { ok: false, error: `Could not spawn ${cmd}` };
    }
  }

  const sender = event.sender;
  terminals.set(termId, { proc, sender });

  const send = (channel, payload) => {
    if (!sender.isDestroyed()) sender.send(channel, payload);
  };

  proc.stdout.on('data', (d) => send(`terminal:data:${termId}`, d.toString('utf8')));
  proc.stderr.on('data', (d) => send(`terminal:data:${termId}`, d.toString('utf8')));
  proc.on('exit', (code) => {
    send(`terminal:exit:${termId}`, code ?? 0);
    terminals.delete(termId);
  });
  proc.on('error', (err) => {
    send(`terminal:data:${termId}`, `\r\n\x1b[31m[shell error: ${err.message}]\x1b[0m\r\n`);
  });

  return { ok: true, termId, cwd: workDir };
});

ipcMain.on('terminal:input', (_, { termId, data }) => {
  const t = terminals.get(termId);
  if (t && !t.proc.killed) {
    try { t.proc.stdin.write(data); } catch { /* stdin may be closed */ }
  }
});

ipcMain.on('terminal:close', (_, termId) => {
  const t = terminals.get(termId);
  if (t) {
    try { t.proc.kill(); } catch { /* already dead */ }
    terminals.delete(termId);
  }
});
