'use strict';

const {
  app, BrowserWindow, Menu, Tray, shell,
  ipcMain, globalShortcut, Notification, nativeImage,
} = require('electron');
const path = require('path');
const fs   = require('fs');

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
  catch { return { width: 1360, height: 860, x: undefined, y: undefined, maximized: false }; }
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

function getTrayIconPath() {
  const base = app.isPackaged
    ? path.join(process.resourcesPath)
    : path.join(__dirname, '../release/win-unpacked/resources');
  // Dark tray icon for Windows
  const ico = path.join(base, 'Tray-Win32-Dark.ico');
  if (fs.existsSync(ico)) return ico;
  // Fallback: build-time resource next to main.js
  return path.join(__dirname, '../public/icon.png');
}

function createTray(mainWin) {
  try {
    const iconPath = getTrayIconPath();
    const img  = nativeImage.createFromPath(iconPath);
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
    tray.setToolTip('Claude Code');

    const menu = Menu.buildFromTemplate([
      { label: 'Show Claude Code', click: () => { mainWin.show(); mainWin.focus(); } },
      { type: 'separator' },
      { label: 'Quit',             click: () => { app.isQuiting = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu);

    tray.on('click',        () => { mainWin.isVisible() ? mainWin.hide() : mainWin.show(); });
    tray.on('double-click', () => { mainWin.show(); mainWin.focus(); });
  } catch (e) {
    console.error('[tray]', e.message);
  }
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

  win.on('closed', () => { _fsWatcher?.close(); _fsWatcher = null; });

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

  // Suppress harmless DevTools Protocol errors (Autofill CDP commands unsupported in Electron).
  // Electron 20+ passes a single event object; older builds pass (event, level, message, ...).
  win.webContents.on('console-message', (eventOrLevel, maybeMsg) => {
    const msg = typeof eventOrLevel === 'object' && eventOrLevel.message
      ? eventOrLevel.message
      : (typeof maybeMsg === 'string' ? maybeMsg : '');
    if (msg.includes('Autofill.enable') || msg.includes('Autofill.setAddresses')) return;
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

// Desktop notifications
ipcMain.on('notify', (_, { title, body }) => {
  if (!Notification.isSupported()) return;
  new Notification({ title: title || 'Claude Code', body, silent: false }).show();
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
      process.env.USERPROFILE || process.env.HOME || '~',
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

ipcMain.handle('claude:send', async (event, { messages, model, system, cliSessionId, permMode }) => {
  return getClaudeService().streamMessage(event, messages, model, system, cliSessionId, permMode);
});

ipcMain.handle('claude:abort', () => {
  return getClaudeService().abortCurrentStream();
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

// ── IPC: file-system explorer ────────────────────────────────────────────────
const FS_ROOT   = path.join(__dirname, '../..'); // G:\claude_code_mod
const FS_IGNORE = new Set([
  'node_modules', '.git', 'dist', 'release', '.cache',
  'coverage', '__pycache__', '.pytest_cache', '.parcel-cache',
]);

ipcMain.handle('fs:root', () => FS_ROOT);

ipcMain.handle('fs:mkdir', async (_, dirPath) => {
  try {
    fs.mkdirSync(path.resolve(dirPath), { recursive: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('fs:list', async (_, dirPath) => {
  const resolved = path.resolve(dirPath || FS_ROOT);
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
  const resolved = path.resolve(filePath);
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
  const resolved = path.resolve(filePath);
  try {
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    await fs.promises.writeFile(resolved, content, 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('fs:exists', async (_, filePath) => {
  try {
    const stat = await fs.promises.stat(path.resolve(filePath));
    return { exists: true, isDir: stat.isDirectory(), isFile: stat.isFile() };
  } catch {
    return { exists: false };
  }
});

ipcMain.handle('shell:open', async (_, filePath) => {
  try {
    const resolved = path.resolve(filePath);
    await shell.openPath(resolved);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── IPC: agents persistence ────────────────────────────────────────────────
const AGENTS_FILE = path.join(APP_ROOT, 'agents.json');

ipcMain.handle('agents:save', async (_, agents) => {
  try {
    // Write structured JSON for the CLI / sub-agent system
    fs.writeFileSync(AGENTS_FILE, JSON.stringify(agents, null, 2), 'utf8');

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
