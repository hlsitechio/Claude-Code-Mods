'use strict';

// ── Global crash guards — must come before any other code ────────────────────
// Suppress benign stream / IPC pipe errors that Electron would otherwise
// surface as "A JavaScript error occurred in the main process" dialogs.
// These happen when a PTY, child process stdout, or renderer IPC pipe
// breaks at the OS level (e.g. window closed while write was in flight).
process.on('uncaughtException', (err) => {
  const msg  = err?.message || '';
  const code = err?.code    || '';
  // Known benign: broken pipe, closed stream, EOF on write.
  // Match by Node error codes (precise) rather than substring (which would
  // silently swallow any third-party error whose message happens to contain
  // "channel closed", masking real bugs).
  const benignCodes = new Set([
    'EPIPE', 'ECONNRESET', 'ERR_IPC_CHANNEL_CLOSED',
    'ERR_STREAM_DESTROYED', 'ERR_STREAM_WRITE_AFTER_END',
  ]);
  if (benignCodes.has(code) || msg === 'write EOF' || msg === 'socket hang up') {
    console.warn('[main] suppressed benign stream error:', code || msg);
    return; // swallow — do NOT re-throw
  }
  // Everything else: log and let Electron handle it normally
  console.error('[main] uncaughtException:', err);
});

process.on('unhandledRejection', (reason) => {
  const msg = String(reason?.message || reason || '');
  if (
    msg.includes('write EOF') ||
    msg.includes('EPIPE') ||
    msg.includes('ERR_IPC_CHANNEL_CLOSED')
  ) {
    console.warn('[main] suppressed benign rejection:', msg);
    return;
  }
  console.error('[main] unhandledRejection:', reason);
});

const {
  app, BrowserWindow, Menu, Tray, shell,
  ipcMain, globalShortcut, Notification, nativeImage,
} = require('electron');
const path     = require('path');
const fs       = require('fs');
const { spawn } = require('child_process');

// Dev: not packaged AND not explicitly forced to production
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 10 — Multi-slot support (parallel CCM instances, one per slot)
// ═══════════════════════════════════════════════════════════════════════════
// Each CCM instance occupies a "slot" — slot 1 (default) keeps full backward
// compatibility with every existing install. Slot N (N >= 2) gets:
//   - CDP port:        9222 + N - 1   (slot 2 = :9223, slot 3 = :9224, ...)
//   - userData dir:    <default> + "-slot-N"  (separate Chromium profile)
//   - endpoint file:   ccm-browser-endpoint-N.json
//   - MCP entry name:  ccm-browser-N  (env { CCM_BROWSER_SLOT: 'N' })
//   - Window title:    "Claude Code · Slot N"
// User launches a second slot with `electron . --slot=2` (or `CCM_SLOT=2`).
// Then registers it with Claude Code CLI — that happens automatically the
// first time slot 2 boots (see _registerBrowserMcp below).
const CCM_SLOT = (() => {
  for (let i = 0; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith('--slot=')) {
      const n = parseInt(a.slice(7), 10);
      if (Number.isFinite(n) && n >= 1 && n <= 64) return n;
    }
    if (a === '--slot' && i + 1 < process.argv.length) {
      const n = parseInt(process.argv[i + 1], 10);
      if (Number.isFinite(n) && n >= 1 && n <= 64) return n;
    }
  }
  if (process.env.CCM_SLOT) {
    const n = parseInt(process.env.CCM_SLOT, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 64) return n;
  }
  return 1;
})();
const CCM_CDP_PORT = 9222 + (CCM_SLOT - 1);

// Slot > 1: relocate userData so each Electron has its own Chromium profile.
// The single-instance lock below scopes to userData, so different paths =
// different locks → slots can coexist. MUST happen before any code calls
// app.getPath('userData') and before requestSingleInstanceLock().
if (CCM_SLOT > 1) {
  const defaultUserData = app.getPath('userData');
  app.setPath('userData', `${defaultUserData}-slot-${CCM_SLOT}`);
}

// Expose to lazy-loaded modules. chrome-controller.js reads CCM_CDP_ENDPOINT;
// browser-http-server.js / browser-mcp.mjs both honour CCM_SLOT-style filenames.
process.env.CCM_CDP_ENDPOINT = `http://127.0.0.1:${CCM_CDP_PORT}`;
process.env.CCM_SLOT         = String(CCM_SLOT);
console.log(`[main] slot=${CCM_SLOT}  cdp=:${CCM_CDP_PORT}  userData=${app.getPath('userData')}`);

// ── Chrome DevTools Protocol — enable the embedded Chromium for control ────
// This makes the WebContentsView (and the rest of Electron's webContents)
// reachable via http://127.0.0.1:<CCM_CDP_PORT> — the standard CDP endpoint.
// The chrome-controller.js module connects here via puppeteer-core to drive
// the SAME browser the user sees in the panel. One browser, two control
// surfaces:
//   - in-process IPC via electronAPI.browser.* (the `browser_*` MCP tools)
//   - external CDP over localhost:<port> (the `chrome_*` MCP tools)
//
// MUST be set BEFORE app is ready.
//
// ⚠️ THREAT MODEL: the port binds 127.0.0.1 only, so it's not exposed to the
// network — BUT any process running as the same user on the local machine
// can open the CDP WebSocket and drive Chromium with NO authentication,
// bypassing browser-http-server.js's bearer token entirely. For a personal
// single-user dev workstation this is an acceptable trade-off (only your own
// processes can hit it). For shared/multi-user systems consider switching to
// `--remote-debugging-pipe` (pipe transport, only the parent process can
// drive it) — note that requires the controller to switch from
// `puppeteer.connect({browserURL})` to a pipe-based connection.
app.commandLine.appendSwitch('remote-debugging-port', String(CCM_CDP_PORT));

// ── Single-instance lock ────────────────────────────────────────────────────
// Prevents multiple Electron processes from sharing the same userData/Cache
// directory, which causes "Unable to move the cache: Access denied" on Windows
// and other half-broken behavior. If someone tries to launch a second copy,
// we focus the existing window and exit the second process cleanly.
// NOTE: with Phase 10 each slot has its own userData → the lock automatically
// scopes per-slot, so two slots can run in parallel without fighting.
const _gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!_gotSingleInstanceLock) {
  console.log('[main] another instance is already running — exiting.');
  app.quit();
  process.exit(0);
} else {
  app.on('second-instance', () => {
    // Bring the main window back to the front when a second launch is attempted
    const wins = BrowserWindow.getAllWindows();
    const primary = wins.find(w => !w.isDestroyed());
    if (primary) {
      if (primary.isMinimized()) primary.restore();
      primary.show();
      primary.focus();
    }
  });
}

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

// ── Dual-window state ────────────────────────────────────────────────────────
let _secondWin    = null;
let _primaryWinId = null;   // BrowserWindow.id of the current "primary" window

function createWindow() {
  const state = loadWindowState();

  const win = new BrowserWindow({
    width:     state.width  || 1360,
    height:    state.height || 860,
    x:         state.x,
    y:         state.y,
    minWidth:  900,
    minHeight: 600,
    title: CCM_SLOT === 1 ? 'Claude Code Mods' : `Claude Code Mods · Slot ${CCM_SLOT}`,
    backgroundColor: '#0b0b0c',
    show: false,
    frame: false,           // custom title bar
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      spellcheck:       false,
      // webSecurity is ALWAYS on. Vite HMR works fine with it enabled.
      // Set CCM_DEV_INSECURE=1 only if you're debugging a cross-origin issue.
      webSecurity:      process.env.CCM_DEV_INSECURE !== '1',
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
    _fsWatcher?.close(); _fsWatcher = null;
    // If the user closed the main window while a secondary was open, promote
    // the secondary up. Otherwise the secondary is stranded with role
    // "secondary" — its spawn button stays hidden, and the user has no way
    // to reopen the main window or spawn a third.
    if (win === mainWin) {
      mainWin = null;
      if (_secondWin && !_secondWin.isDestroyed()) {
        mainWin       = _secondWin;
        _secondWin    = null;
        _primaryWinId = mainWin.id;
        _broadcastRole();
      }
    }
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
  // Electron 36+ uses a single Event arg with .level as a STRING ('warning'/'error'/etc).
  // Declaring exactly ONE param avoids the legacy-signature deprecation warning.
  win.webContents.on('console-message', (event) => {
    const msg     = event?.message || '';
    const level   = event?.level   || '';
    const isError = level === 'error';
    const isWarn  = level === 'warning' || level === 'warn';
    if (msg.includes('Autofill.enable') || msg.includes('Autofill.setAddresses')) return;
    if (isError || isWarn) {
      const prefix = isError ? '[RENDERER ERROR]' : '[RENDERER WARN]';
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

  // External links → default browser. Allowlist URL schemes to prevent
  // ms-msdt:, vscode:, file:, javascript:, etc. driving shell.openExternal from
  // any iframe or XSS context. Only http(s) and mailto are user-visible web links.
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') {
        shell.openExternal(url);
      } else {
        console.warn('[security] setWindowOpenHandler blocked scheme:', u.protocol, url);
      }
    } catch (_) {
      // malformed URL — ignore
    }
    return { action: 'deny' };
  });

  return win;
}

// ── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const win = createWindow();
  _primaryWinId = win.id;   // first window is always primary
  createTray(win);

  // Allow desktopCapturer / screen recording on Electron 32+ (Windows/Mac)
  const { session } = require('electron');
  if (session.defaultSession.setDisplayMediaRequestHandler) {
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      const { desktopCapturer } = require('electron');
      desktopCapturer.getSources({ types: ['screen'] }).then(sources => {
        callback({ video: sources[0], audio: 'loopback' });
      }).catch(() => callback({}));
    });
  }

  // Global shortcuts
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (win.isVisible()) { win.hide(); } else { win.show(); win.focus(); }
  });

  // ── Browser MCP bridge ──────────────────────────────────────────────────
  // Start the HTTP control server so the MCP child process (spawned by
  // Claude Code CLI per session) can reach `global.ccmBrowser`. Then
  // ensure ~/.claude/settings.json has our MCP entry registered so
  // Claude Code knows about us on its next launch.
  try {
    const browserHttp = require('./browser-http-server');
    await browserHttp.startBrowserHttpServer({ slot: CCM_SLOT });
    _registerBrowserMcp(CCM_SLOT);
  } catch (e) {
    console.error('[browser-mcp] failed to start bridge:', e);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWin?.show();
  });
});

// Register our MCP server in the CONFIG FILE Claude Code 2.x actually reads.
// Despite the naming, that's `~/.claude.json` (singular file in the home
// directory, NOT `~/.claude/settings.json` which is the older format /
// permissions config). We MERGE — never overwrite — the user's existing
// config (~/.claude.json typically has 40KB+ of Claude Code internal state).
//
// We write to BOTH locations: the new `~/.claude.json` (where `/mcp` reads)
// AND the legacy `~/.claude/settings.json` (for older CLI versions). The
// permissions file is preserved untouched if it has no mcpServers entry.
function _registerBrowserMcp(slot = 1) {
  const home = process.env.HOME || process.env.USERPROFILE || require('os').homedir();
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  const mcpScript = path.resolve(__dirname, '..', 'bin', 'browser-mcp.mjs');

  // Resolve `node` binary so the entry survives Electron upgrades.
  // `process.execPath` inside Electron points at the electron binary which
  // can also run .mjs, but plain `node` is more portable and matches what
  // the user expects when they read the config.
  let nodeBin = process.execPath;
  try {
    const which = require('child_process')
      .execFileSync(process.platform === 'win32' ? 'where' : 'which', ['node'], { encoding: 'utf8' })
      .split(/\r?\n/)[0].trim();
    if (which) nodeBin = which;
  } catch (_) { /* keep process.execPath as fallback */ }

  // Slot 1 keeps the historical name `ccm-browser` (no env) so existing setups
  // keep working. Slot N (N >= 2) registers as `ccm-browser-N` with the env
  // var that tells browser-mcp.mjs which endpoint file to read.
  const entryName = slot === 1 ? 'ccm-browser' : `ccm-browser-${slot}`;
  const entryEnv  = slot === 1 ? {} : { CCM_BROWSER_SLOT: String(slot) };
  const desired = {
    command: nodeBin,
    args:    [mcpScript],
    env:     entryEnv,
  };

  // Targets to keep in sync. The primary is `~/.claude.json` — that's what
  // Claude Code 2.x reads. The secondary is `~/.claude/settings.json` for
  // older versions / project tooling that still looks there.
  const targets = [
    path.join(home, '.claude.json'),
    path.join(claudeDir, 'settings.json'),
  ];

  for (const target of targets) {
    try {
      let cfg = {};
      if (fs.existsSync(target)) {
        try { cfg = JSON.parse(fs.readFileSync(target, 'utf8')); }
        catch (e) {
          console.warn(`[browser-mcp] ${target} is malformed; refusing to clobber it.`);
          continue;
        }
      }
      cfg.mcpServers = cfg.mcpServers || {};
      const existing = cfg.mcpServers[entryName];
      const isCurrent =
        existing &&
        Array.isArray(existing.args) &&
        existing.args[0] === mcpScript &&
        existing.command === desired.command &&
        (existing.env?.CCM_BROWSER_SLOT || '1') === (entryEnv.CCM_BROWSER_SLOT || '1');
      if (isCurrent) {
        console.log(`[browser-mcp] ${entryName} already current in ${target}`);
        continue;
      }
      cfg.mcpServers[entryName] = desired;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify(cfg, null, 2), 'utf8');
      console.log(`[browser-mcp] registered ${entryName} in ${target}`);
    } catch (e) {
      console.warn(`[browser-mcp] could not write ${target}:`, e.message);
    }
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { app.isQuiting = true; });

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  _apercuStopServer(); // close local static server so port is freed immediately
  // Tear down the browser MCP HTTP bridge + delete the endpoint file so any
  // MCP child spawned while we're not running fails fast and clearly.
  try { require('./browser-http-server').stopBrowserHttpServer(); } catch (_) {}
  // Kill the Chrome subprocess (if running) so we don't leak browser windows
  // / zombie processes on app close. ccmChrome.close() is safe to call when
  // Chrome isn't running.
  try { ccmChrome.close(); } catch (_) {}
});

// ── IPC: app info ────────────────────────────────────────────────────────────

ipcMain.handle('app:info', () => ({
  version:  app.getVersion(),
  platform: process.platform,
  electron: process.versions.electron,
  node:     process.versions.node,
}));

// ── IPC: window controls ─────────────────────────────────────────────────────

function _winFromEvent(e) {
  try {
    if (!e?.sender || e.sender.isDestroyed()) return null;
    return BrowserWindow.fromWebContents(e.sender) || null;
  } catch { return null; }
}

ipcMain.on('window:minimize',  (e) => { _winFromEvent(e)?.minimize(); });
ipcMain.on('window:maximize',  (e) => { const w = _winFromEvent(e); if (w) w.isMaximized() ? w.unmaximize() : w.maximize(); });
ipcMain.on('window:close',     (e) => {
  const w = _winFromEvent(e);
  if (!w || w.isDestroyed()) return;
  if (w.id === mainWin?.id) {
    // Primary window: minimize to tray (handled by win.on('close') handler) or quit
    app.isQuiting = true;
    w.close();
  } else {
    // Secondary window: just close this window, leave primary running
    w.destroy();   // destroy() bypasses the 'close' event, no preventDefault possible
  }
});
ipcMain.on('window:hide',      (e) => { _winFromEvent(e)?.hide(); });
ipcMain.handle('window:is-maximized', (e) => { const w = _winFromEvent(e); return w?.isMaximized() ?? false; });

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
      process.env.CLAUDE_CONFIG_DIR || path.join(process.env.HOME || process.env.USERPROFILE || '~', '.claude'),
      '.credentials.json'
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

ipcMain.handle('claude:send', async (event, { messages, model, system, cliSessionId, permMode, requestId, effort, sessionName, addDirs, maxBudget, forkFromCli, fromPr, directMode }) => {
  const opts = { effort, sessionName, addDirs, maxBudget, forkFromCli, fromPr, directMode };
  return getClaudeService().streamMessage(event, messages, model, system, cliSessionId, permMode, requestId, opts);
});

// ── Active project cwd ────────────────────────────────────────────────────────
// Set by the Files panel when the user loads a project folder.
// Persists for the lifetime of the app process; the CLI spawns inside this dir.
global._projectCwd = null;

ipcMain.handle('project:set-cwd', (_, projectPath) => {
  global._projectCwd = projectPath || null;
  return { ok: true, cwd: global._projectCwd };
});

ipcMain.handle('project:get-cwd', () => {
  return global._projectCwd;
});

ipcMain.handle('claude:abort', (_, requestId) => {
  return getClaudeService().abortCurrentStream(requestId);
});

// ═══════════════════════════════════════════════════════════════════════════
// ── IPC: Kanban / Tasks ──────────────────────────────────────────────────────
// Per-project task board persisted as `kanban.json` in the active project cwd,
// or in userData if no project is set. Same schema readable by the CLI tool
// (bin/kanban.mjs) so terminals + the renderer + AI agents share one source.
// ═══════════════════════════════════════════════════════════════════════════

const KANBAN_DEFAULT = () => ({
  version: 1,
  updated: Date.now(),
  columns: [
    { id: 'todo',  name: 'To do',       color: '#6e88c3' },
    { id: 'doing', name: 'In progress', color: '#d97757' },
    { id: 'done',  name: 'Done',        color: '#7ab389' },
  ],
  tasks: [], // { id, col, title, body, tags, priority, created, updated, order }
});

function _kanbanPath() {
  // 1) Active project cwd (if set) — kanban lives alongside the project
  if (global._projectCwd) {
    try {
      const stat = fs.statSync(global._projectCwd);
      if (stat.isDirectory()) return path.join(global._projectCwd, 'kanban.json');
    } catch (_) {}
  }
  // 2) Fallback — global kanban in userData
  return path.join(app.getPath('userData'), 'kanban.json');
}

function _kanbanRead() {
  const file = _kanbanPath();
  try {
    if (!fs.existsSync(file)) return KANBAN_DEFAULT();
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    // Schema migration / safety
    if (!data.columns || !Array.isArray(data.columns)) data.columns = KANBAN_DEFAULT().columns;
    if (!data.tasks   || !Array.isArray(data.tasks))   data.tasks   = [];
    return data;
  } catch (e) {
    console.error('[kanban] read error:', e.message);
    return KANBAN_DEFAULT();
  }
}

function _kanbanWrite(data) {
  data.updated = Date.now();
  const file = _kanbanPath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    // Broadcast to all windows so other panels stay in sync
    BrowserWindow.getAllWindows().forEach(w => {
      if (!w.isDestroyed()) w.webContents.send('kanban:changed', { path: file, updated: data.updated });
    });
    return { ok: true, path: file };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function _kanbanTaskId() {
  return 'k-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

function _kanbanSanitizeTask(t) {
  // Trim and length-bound every user-supplied field
  const s = (v, max = 500) => typeof v === 'string'
    ? v.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, ' ').slice(0, max).trim()
    : '';
  const tagsArr = Array.isArray(t.tags) ? t.tags.slice(0, 8).map(x => s(x, 24)).filter(Boolean) : [];
  const pri = ['low','med','high'].includes(t.priority) ? t.priority : 'med';
  return {
    id:       typeof t.id === 'string' ? t.id : _kanbanTaskId(),
    col:      typeof t.col === 'string' ? t.col : 'todo',
    title:    s(t.title, 200) || 'Untitled task',
    body:     s(t.body, 4000),
    tags:     tagsArr,
    priority: pri,
    created:  typeof t.created === 'number' ? t.created : Date.now(),
    updated:  Date.now(),
    order:    typeof t.order === 'number' ? t.order : 0,
  };
}

ipcMain.handle('kanban:read', () => _kanbanRead());

ipcMain.handle('kanban:write', (_, data) => {
  if (!data || typeof data !== 'object') return { ok: false, error: 'Invalid data' };
  // Re-sanitize all tasks before writing
  data.tasks = (data.tasks || []).map(_kanbanSanitizeTask);
  return _kanbanWrite(data);
});

ipcMain.handle('kanban:add', (_, partial) => {
  const data = _kanbanRead();
  const task = _kanbanSanitizeTask({ ...partial, id: _kanbanTaskId() });
  // Place at end of its column
  const sameCol = data.tasks.filter(t => t.col === task.col);
  task.order = sameCol.length ? Math.max(...sameCol.map(t => t.order || 0)) + 1 : 0;
  data.tasks.push(task);
  const res = _kanbanWrite(data);
  return { ...res, task };
});

ipcMain.handle('kanban:update', (_, { id, patch }) => {
  const data = _kanbanRead();
  const idx = data.tasks.findIndex(t => t.id === id);
  if (idx < 0) return { ok: false, error: 'Not found' };
  data.tasks[idx] = _kanbanSanitizeTask({ ...data.tasks[idx], ...patch, id, created: data.tasks[idx].created });
  return _kanbanWrite(data);
});

ipcMain.handle('kanban:move', (_, { id, col, order }) => {
  const data = _kanbanRead();
  const idx = data.tasks.findIndex(t => t.id === id);
  if (idx < 0) return { ok: false, error: 'Not found' };
  if (typeof col === 'string') data.tasks[idx].col = col;
  if (typeof order === 'number') data.tasks[idx].order = order;
  data.tasks[idx].updated = Date.now();
  return _kanbanWrite(data);
});

ipcMain.handle('kanban:delete', (_, id) => {
  const data = _kanbanRead();
  const before = data.tasks.length;
  data.tasks = data.tasks.filter(t => t.id !== id);
  if (data.tasks.length === before) return { ok: false, error: 'Not found' };
  return _kanbanWrite(data);
});

ipcMain.handle('kanban:clear-done', () => {
  const data = _kanbanRead();
  data.tasks = data.tasks.filter(t => t.col !== 'done');
  return _kanbanWrite(data);
});

ipcMain.handle('kanban:path', () => _kanbanPath());

// Plain-text markdown summary — used by the chat-inject button and the CLI tool.
ipcMain.handle('kanban:summary', () => {
  const data = _kanbanRead();
  const lines = ['# Kanban'];
  lines.push(`*${path.basename(_kanbanPath())}* · updated ${new Date(data.updated).toLocaleString()}`, '');
  for (const col of data.columns) {
    const tasks = data.tasks
      .filter(t => t.col === col.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    lines.push(`## ${col.name} (${tasks.length})`);
    if (!tasks.length) { lines.push('_— empty —_', ''); continue; }
    for (const t of tasks) {
      const pri = t.priority === 'high' ? ' 🔴' : t.priority === 'low' ? ' 🟢' : ' 🟡';
      const tags = t.tags?.length ? ` [${t.tags.join(', ')}]` : '';
      lines.push(`- **${t.title}**${pri}${tags}`);
      if (t.body) {
        for (const bl of t.body.split('\n')) lines.push(`  > ${bl}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
});

// ═══════════════════════════════════════════════════════════════════════════
// ── IPC: Embedded browser (WebContentsView-based tabs) ────────────────────
// Real Chromium tabs pinned over a region of the main BrowserWindow. Each tab
// is its own Chromium process with isolated session, cookies, devtools.
// The renderer manages tab UI + URL bar + bounds; the main process owns the
// WebContentsView lifecycle and ferries page events back through IPC.
// ═══════════════════════════════════════════════════════════════════════════

const { WebContentsView, session: electronSession } = require('electron');
const ccmBrowserProfile = require('./browser-profile');
const ccmChrome         = require('./chrome-controller');
const ccmChromeFiles    = require('./chrome-files');
global.ccmBrowserProfile = ccmBrowserProfile;
global.ccmChrome         = ccmChrome;
global.ccmChromeFiles    = ccmChromeFiles;

const _browserViews = new Map(); // viewId → { view, win, ownerWebContentsId }
let _nextBrowserViewId = 1;

// A single persistent partition shared by every browser tab so cookies +
// localStorage survive across panel re-renders and app restarts. Isolated from
// the main app session — the app's safeStorage / Anthropic cookies live in the
// default session, which the browser tabs cannot see.
const BROWSER_PARTITION = 'persist:ccm-browser';

function _safeBrowseUrl(url) {
  if (typeof url !== 'string') return null;
  url = url.trim();
  if (!url) return null;
  // about:, data: and javascript: must NOT be allowed — they could pivot inside
  // the renderer's origin in older Chromium versions.
  if (/^(javascript|data|file):/i.test(url)) return null;
  // Bare "google.com" or "about:blank" → coerce to https:// (or about:blank)
  if (url === 'about:blank') return url;
  if (!/^https?:\/\//i.test(url)) {
    // Heuristic: if it has whitespace OR no dot, treat as a search query
    if (/\s/.test(url) || !url.includes('.')) {
      return 'https://duckduckgo.com/?q=' + encodeURIComponent(url);
    }
    return 'https://' + url;
  }
  return url;
}

// ══════════════════════════════════════════════════════════════════════════
// Phase 20 — OAuth + Cloudflare friendliness
// ══════════════════════════════════════════════════════════════════════════
// Two embedded-browser pain points fixed in this block:
//
// 1. **OAuth popups** — Google sign-in, Microsoft, GitHub, etc. open a popup
//    via window.open() and wait for window.opener.postMessage(...) to fire
//    after the sign-in redirect chain completes. If we deny the popup (the
//    old behavior), sign-in completes silently but the callback never reaches
//    the original page → user is stuck staring at a "sign in" button that
//    won't change state.
//    Fix: detect OAuth provider patterns in setWindowOpenHandler and return
//    {action:'allow'} with shared session so cookies + state persist.
//
// 2. **Cloudflare / bot detection** — Electron's Chromium leaks fingerprints
//    that real Chrome doesn't have: navigator.webdriver defined late,
//    navigator.plugins empty, no window.chrome.runtime, WebGL UNMASKED_* not
//    matching real GPU, etc. Even with UA spoofing, deep fingerprinting
//    catches us.
//    Fix: inject a stealth script via the CDP `Page.addScriptToEvaluate
//    OnNewDocument` API (same as puppeteer-stealth). The script runs in
//    main world BEFORE any page script on every navigation, so even
//    Cloudflare's inline detection script sees the spoofed values.

// Common stealth tricks applied via Page.addScriptToEvaluateOnNewDocument.
// Modeled on puppeteer-extra-plugin-stealth but stripped to the highest-
// signal evasions (the ones Cloudflare's "Just a moment..." actually checks).
const STEALTH_SCRIPT = `
(() => {
  // 1. navigator.webdriver — most common automation flag.
  //    Real Chrome with no automation: undefined. We force undefined.
  try {
    Object.defineProperty(Navigator.prototype, 'webdriver', {
      get: () => undefined,
      configurable: true,
    });
  } catch (_) {}

  // 2. navigator.plugins — Electron returns 0 entries; real Chrome 130 has
  //    ~5 (PDF viewers). Detection libs compare length.
  try {
    const fakePlugins = [
      { name: 'PDF Viewer',                filename: 'internal-pdf-viewer' },
      { name: 'Chrome PDF Viewer',         filename: 'internal-pdf-viewer' },
      { name: 'Chromium PDF Viewer',       filename: 'internal-pdf-viewer' },
      { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer' },
      { name: 'WebKit built-in PDF',       filename: 'internal-pdf-viewer' },
    ];
    Object.defineProperty(navigator, 'plugins', {
      get: () => Object.freeze(fakePlugins),
      configurable: true,
    });
    Object.defineProperty(navigator, 'mimeTypes', {
      get: () => Object.freeze([{ type: 'application/pdf', suffixes: 'pdf' }]),
      configurable: true,
    });
  } catch (_) {}

  // 3. navigator.languages — must be non-empty.
  try {
    if (!navigator.languages || navigator.languages.length === 0) {
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
        configurable: true,
      });
    }
  } catch (_) {}

  // 4. window.chrome.runtime — Electron lacks this; real Chrome always has it.
  try {
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) window.chrome.runtime = {};
    if (!window.chrome.csi) window.chrome.csi = () => ({ startE: Date.now() });
    if (!window.chrome.loadTimes) window.chrome.loadTimes = () => ({});
  } catch (_) {}

  // 5. Permissions API consistency — sites probe Notification permission via
  //    navigator.permissions.query AND Notification.permission. If they
  //    disagree, that's a tell. Make the API mirror Notification.permission.
  try {
    if (window.navigator.permissions) {
      const originalQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
      window.navigator.permissions.query = (params) => {
        if (params && params.name === 'notifications') {
          return Promise.resolve({ state: Notification.permission, onchange: null });
        }
        return originalQuery(params);
      };
    }
  } catch (_) {}

  // 6. WebGL UNMASKED_VENDOR / UNMASKED_RENDERER — Electron's ANGLE returns
  //    "Google Inc. (Google)" / "ANGLE (Google, ...)" which is a tell that
  //    we're not a real desktop Chrome. Return common NVIDIA-on-Windows values.
  try {
    const proto = WebGLRenderingContext.prototype;
    const origGetParam = proto.getParameter;
    proto.getParameter = function (parameter) {
      // UNMASKED_VENDOR_WEBGL  = 0x9245 = 37445
      // UNMASKED_RENDERER_WEBGL = 0x9246 = 37446
      if (parameter === 37445) return 'Google Inc. (NVIDIA)';
      if (parameter === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)';
      return origGetParam.apply(this, arguments);
    };
    // Mirror to WebGL2 if present
    if (window.WebGL2RenderingContext) {
      const proto2 = WebGL2RenderingContext.prototype;
      const origGetParam2 = proto2.getParameter;
      proto2.getParameter = function (parameter) {
        if (parameter === 37445) return 'Google Inc. (NVIDIA)';
        if (parameter === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)';
        return origGetParam2.apply(this, arguments);
      };
    }
  } catch (_) {}

  // 7. window.outerHeight / outerWidth — Electron's WebContentsView reports
  //    the view rect; real Chrome reports the window rect. When they're
  //    smaller than innerHeight (because the view is partial), it's a tell.
  //    Soft fix: ensure outer* >= inner*.
  try {
    const oh = window.outerHeight, ow = window.outerWidth;
    if (oh < window.innerHeight) {
      Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight });
    }
    if (ow < window.innerWidth) {
      Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
    }
  } catch (_) {}

  // 8. Function.prototype.toString — anti-tamper libs check if our overrides
  //    show as native code. Without restoring toString, fingerprint scripts
  //    detect "function getParameter() { [PATCH] }" vs "function getParameter() { [native code] }".
  //    This is partial — defeating sophisticated toString checks needs Proxy-
  //    based wrapping; we just patch the common case.
  try {
    const native = Function.prototype.toString;
    const _origGetParam = WebGLRenderingContext.prototype.getParameter;
    Function.prototype.toString = new Proxy(native, {
      apply(target, thisArg, args) {
        if (thisArg === _origGetParam || (thisArg && thisArg.name === 'getParameter')) {
          return 'function getParameter() { [native code] }';
        }
        return target.apply(thisArg, args);
      },
    });
  } catch (_) {}
})();
`;

// Install the stealth script on a WebContents via the CDP debugger.
// Page.addScriptToEvaluateOnNewDocument runs in MAIN world before ANY page
// script, including inline ones in the HTML — far better than waiting for
// did-finish-load to executeJavaScript (which races inline detection).
//
// ASYNC by design — the caller MUST await before loadURL or the first
// navigation will race the addScriptToEvaluateOnNewDocument call and miss
// the spoofed values for that load.
async function _setupStealthForWebContents(wc) {
  if (!wc || wc.isDestroyed?.()) return { ok: false, error: 'wc destroyed' };
  try {
    // If devtools is already attached, attach() throws. Skip silently —
    // when devtools is open, stealth is moot anyway (the user is debugging).
    if (!wc.debugger.isAttached()) {
      wc.debugger.attach('1.3');
    }
    // Reattach hook — when devtools opens later, the debugger detaches and
    // we lose stealth on subsequent navigations. Reattach when devtools
    // closes. (Common for users debugging Cloudflare in DevTools — we
    // restore stealth automatically the moment they close devtools.)
    if (!wc._ccmStealthDetachHookInstalled) {
      wc._ccmStealthDetachHookInstalled = true;
      wc.debugger.on('detach', (_e, reason) => {
        if (reason === 'target closed') return; // page gone, expected
        console.log('[stealth] debugger detached (' + reason + ') — re-attempt on next nav');
        wc._ccmStealthNeedsReattach = true;
      });
      // Re-attach on next navigation if needed
      wc.on('did-start-navigation', async () => {
        if (wc._ccmStealthNeedsReattach && !wc.isDestroyed() && !wc.debugger.isAttached()) {
          wc._ccmStealthNeedsReattach = false;
          await _setupStealthForWebContents(wc);
        }
      });
    }
    await wc.debugger.sendCommand('Page.enable');
    const scriptResult = await wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: STEALTH_SCRIPT,
      runImmediately: true,
    });
    console.log('[stealth] installed on webContents', wc.id, '— scriptIdentifier:', scriptResult?.identifier);
    return { ok: true, scriptIdentifier: scriptResult?.identifier };
  } catch (e) {
    // attach() throws if the WebContents is gone or devtools is already
    // attached. Soft failure — page still works without stealth.
    console.warn('[stealth] setup failed for webContents', wc?.id, ':', e.message);
    return { ok: false, error: e.message };
  }
}

// Diagnostic: run the spoof-detection probe in a webContents and return
// what the page sees. Exposed via IPC so the user can verify stealth
// from the renderer. Returns { webdriver, plugins, chrome, languages,
// webglVendor, webglRenderer, notificationPermissionsMatch } — each
// flag is true when "looks like real Chrome", false when "looks like
// automation/Electron".
async function _stealthSelfTest(wc) {
  if (!wc || wc.isDestroyed?.()) return { ok: false, error: 'wc unavailable' };
  try {
    const result = await wc.executeJavaScript(`(() => {
      let canvas, gl, vendor, renderer;
      try {
        canvas = document.createElement('canvas');
        gl = canvas.getContext('webgl');
        vendor   = gl?.getParameter(37445);
        renderer = gl?.getParameter(37446);
      } catch (_) {}
      let permsMatch = null;
      try {
        // We can't await here because executeJavaScript returns sync result;
        // skip permissions check (the user can spot-check separately).
      } catch (_) {}
      return {
        webdriver:        navigator.webdriver,
        pluginsLength:    navigator.plugins?.length ?? 0,
        chromeRuntime:    typeof window.chrome?.runtime,
        languages:        Array.from(navigator.languages || []),
        userAgent:        navigator.userAgent,
        webglVendor:      String(vendor || ''),
        webglRenderer:    String(renderer || ''),
        url:              location.href,
      };
    })()`, true);
    // Score each criterion
    return {
      ok:                    true,
      raw:                   result,
      webdriverHidden:       result.webdriver === undefined,
      hasPlugins:            (result.pluginsLength || 0) >= 3,
      chromeRuntimePresent:  result.chromeRuntime === 'object',
      languagesNonEmpty:     (result.languages?.length || 0) > 0,
      webglSpoofed:          !/Google/i.test(result.webglRenderer || '') ||
                             /NVIDIA|Intel|AMD/i.test(result.webglRenderer || ''),
      uaSpoofed:             !/Electron/i.test(result.userAgent || ''),
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// OAuth popup detection. Return true if the URL looks like an identity
// provider's sign-in popup that needs window.opener.postMessage support.
// Conservative — we'd rather miss some OAuth flows (and have the user fall
// back to the existing browser:popup → new-tab behavior) than open
// every popup as a child window.
function _isOAuthPopup(parsedUrl) {
  const host = parsedUrl.hostname.toLowerCase();
  const path = parsedUrl.pathname.toLowerCase();
  // Major OAuth providers
  if (host === 'accounts.google.com')                  return true;
  if (host === 'oauth2.googleapis.com')                return true;
  if (host === 'login.microsoftonline.com')            return true;
  if (host === 'login.live.com')                       return true;
  if (host === 'appleid.apple.com')                    return true;
  if (host === 'github.com' && path.startsWith('/login'))                       return true;
  if (host === 'github.com' && path.includes('/oauth'))                         return true;
  if (host === 'gitlab.com' && (path.startsWith('/users/sign_in') || path.includes('/oauth')))  return true;
  if (host === 'bitbucket.org' && path.includes('/login'))                      return true;
  if (host === 'www.facebook.com' && (path.startsWith('/login') || path.includes('/oauth')))    return true;
  if (host === 'www.linkedin.com' && (path.startsWith('/oauth') || path.includes('/uas/login'))) return true;
  if (host === 'twitter.com' || host === 'x.com')      return path.includes('/oauth') || path.includes('/login');
  if (host === 'discord.com' && path.startsWith('/oauth'))                      return true;
  if (host === 'slack.com' && path.includes('/oauth')) return true;
  if (host === 'auth0.com' || host.endsWith('.auth0.com'))                      return true;
  if (host === 'okta.com' || host.endsWith('.okta.com'))                        return true;
  if (host.endsWith('.amazon.com') && path.includes('/ap/'))                    return true;
  if (host === 'twitch.tv' && path.includes('/oauth')) return true;
  if (host === 'oauth.lovable.app')                    return true; // Lovable.dev OAuth flow
  // Generic OAuth fingerprint: client_id + redirect_uri query params
  if (parsedUrl.searchParams.has('client_id') && parsedUrl.searchParams.has('redirect_uri')) return true;
  // OAuth 1.0 / OpenID
  if (parsedUrl.searchParams.has('oauth_token'))       return true;
  if (parsedUrl.searchParams.has('openid.return_to'))  return true;
  return false;
}

// Returns the value setWindowOpenHandler should return for a given popup
// request. Split out so the same logic applies to popups from OAuth child
// windows (which can themselves open more popups during multi-step flows).
function _handleBrowserWindowOpen({ url, features }, parentViewId) {
  let parsed;
  try { parsed = new URL(url); } catch { return { action: 'deny' }; }

  // Reject non-web schemes (matches _safeNavUrl threat model)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    const entry = _browserViews.get(parentViewId);
    if (entry) {
      const ownerWc = BrowserWindow.getAllWindows()
        .map(w => w.webContents)
        .find(w => w.id === entry.ownerWebContentsId);
      ownerWc?.send('browser:popup-blocked', { viewId: parentViewId, url });
    }
    return { action: 'deny' };
  }

  // OAuth popups → allow as proper child windows so window.opener works
  if (_isOAuthPopup(parsed)) {
    const entry = _browserViews.get(parentViewId);
    const parentWin = entry ? BrowserWindow.fromWebContents(entry.view.webContents) || entry.win : null;
    const w = parseInt(features?.match(/width=(\d+)/)?.[1])  || 500;
    const h = parseInt(features?.match(/height=(\d+)/)?.[1]) || 650;
    console.log('[oauth-popup] allowing child window:', parsed.hostname + parsed.pathname);
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        parent: parentWin || undefined,
        modal:  false,
        width:  Math.min(900, Math.max(400, w)),
        height: Math.min(950, Math.max(500, h)),
        title:  'Sign in',
        backgroundColor: '#0b0b0c',
        autoHideMenuBar: true,
        webPreferences: {
          // CRITICAL — must share the parent's session so OAuth state cookies
          // are visible across the redirect chain. Without this the IdP sets
          // a cookie in a new partition, the redirect comes back, and the
          // original site has no idea who you are.
          session:          entry?.view.webContents.session,
          contextIsolation: true,
          nodeIntegration:  false,
          sandbox:          true,
          webSecurity:      true,
        },
      },
    };
  }

  // Default: open as a new tab in our owner window (existing behavior)
  const entry = _browserViews.get(parentViewId);
  if (entry) {
    const ownerWc = BrowserWindow.getAllWindows()
      .map(w => w.webContents)
      .find(w => w.id === entry.ownerWebContentsId);
    ownerWc?.send('browser:popup', { viewId: parentViewId, url });
  }
  return { action: 'deny' };
}

function _attachBrowserViewListeners(viewId, view) {
  const wc = view.webContents;
  const owner = _browserViews.get(viewId)?.ownerWebContentsId;
  const send = (channel, payload) => {
    const ownerWc = BrowserWindow.getAllWindows()
      .map(w => w.webContents)
      .find(w => w.id === owner);
    if (ownerWc && !ownerWc.isDestroyed()) {
      try { ownerWc.send(channel, { viewId, ...payload }); } catch (_) {}
    }
  };

  wc.on('did-start-loading',  ()                 => send('browser:loading', { loading: true }));
  wc.on('did-stop-loading',   ()                 => send('browser:loading', { loading: false }));
  // Debounced history recorder: `did-navigate` fires before the page title
  // has loaded (so we'd get URL-as-title), and `page-title-updated` often
  // fires multiple times as the page settles. We schedule a record 1.5s
  // after the LAST title change, ensuring one entry per nav with the
  // final title.
  let _lastRecordedUrl = null;
  let _titleDebounce   = null;
  function _scheduleProfileRecord() {
    clearTimeout(_titleDebounce);
    _titleDebounce = setTimeout(() => {
      // Guard against the WebContents being destroyed before the debounce
      // fires — common in OAuth popups (open, sign-in, close in ~3s — well
      // under the 1.5s debounce window). Without this guard, wc.getURL()
      // throws "Object has been destroyed" → uncaughtException in main.
      if (!wc || wc.isDestroyed?.()) return;
      let url, title;
      try { url = wc.getURL(); title = wc.getTitle(); }
      catch (_) { return; }   // race: destroyed between isDestroyed check and call
      if (!url || !/^https?:/i.test(url)) return;
      if (url === _lastRecordedUrl) return;
      try { ccmBrowserProfile.recordVisit({ url, title }); } catch (_) {}
      _lastRecordedUrl = url;
    }, 1500);
  }
  // Cancel the debounce when the WebContents is destroyed (tab closed,
  // OAuth popup closed, browser panel torn down) — otherwise the timer
  // could fire mid-destruction.
  wc.once('destroyed', () => clearTimeout(_titleDebounce));

  wc.on('did-start-loading',  ()                 => send('browser:loading', { loading: true }));
  wc.on('did-stop-loading',   ()                 => send('browser:loading', { loading: false }));
  wc.on('did-navigate',       (_e, url)          => {
    _invalidateActiveTabCache();
    _lastRecordedUrl = null;        // new URL, reset debounce target
    _scheduleProfileRecord();
    send('browser:nav', { url, canBack: wc.navigationHistory.canGoBack(), canFwd: wc.navigationHistory.canGoForward() });
  });
  wc.on('did-navigate-in-page',(_e, url)         => { _invalidateActiveTabCache(); send('browser:nav', { url, canBack: wc.navigationHistory.canGoBack(), canFwd: wc.navigationHistory.canGoForward() }); });
  wc.on('page-title-updated', (_e, title)        => {
    _invalidateActiveTabCache();
    _scheduleProfileRecord();      // reschedule with the latest title
    send('browser:title', { title });
  });
  wc.on('page-favicon-updated', (_e, favicons)   => send('browser:favicon', { favicon: favicons?.[0] || null }));
  wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (isMain && code !== -3) send('browser:fail', { code, desc, url });
  });
  // Focus tracking — when the user clicks INSIDE a pane, the renderer needs to
  // know so the toolbar (URL bar, back/fwd/reload) can follow focus instead of
  // always acting on the structurally-left pane. Especially matters in
  // split-view: clicking the right pane should make the URL bar show its URL.
  wc.on('focus', () => send('browser:focus', {}));

  // Popups (target=_blank, window.open) → most open in a new tab in this
  // owner window, but OAuth popups need real child-window behavior because
  // their flow depends on `window.opener.postMessage(...)` firing back to
  // the original page after sign-in. If we open OAuth as a regular new tab
  // there's no `window.opener` and the callback is lost — that's the
  // "page doesn't return after Google sign-in" bug.
  wc.setWindowOpenHandler((details) => {
    return _handleBrowserWindowOpen(details, viewId);
  });

  // Apply stealth to any child window the embedded view creates (OAuth
  // popups land here once setWindowOpenHandler returns {action:'allow'}).
  // Without this, OAuth popups fail Cloudflare-style fingerprint checks
  // even though their parent page passed.
  wc.on('did-create-window', (childWin) => {
    try { _setupStealthForWebContents(childWin.webContents); } catch (_) {}
  });
}

ipcMain.handle('browser:create', async (event, opts = {}) => {
  const ownerWin = BrowserWindow.fromWebContents(event.sender);
  if (!ownerWin) return { ok: false, error: 'No owner window' };

  const sess = electronSession.fromPartition(BROWSER_PARTITION);

  // ── Load CCM companion extension (Phase 6) into the embedded browser ────
  // The companion exposes chrome.tabGroups/sessions/history/bookmarks/etc to
  // the chrome_ext_* MCP tools. NOTE: Electron supports a SUBSET of chrome.*
  // APIs — most tabs/storage/runtime ones work; some (chrome.management,
  // chrome.search) may fail at runtime with "API not supported in Electron".
  // The tool surface stays the same — failures surface as a clean error.
  if (!sess._ccmExtLoaded) {
    sess._ccmExtLoaded = true;
    const extPath = path.join(__dirname, 'chrome-companion-ext');
    sess.loadExtension(extPath, { allowFileAccess: true })
      .then(ext => console.log('[ccm-companion] loaded extension', ext.id, '→', extPath))
      .catch(e => console.warn('[ccm-companion] loadExtension failed:', e.message));
  }

  // ── Indistinguishability from real Chrome ───────────────────────────────
  // Many sites (Google OAuth, banks, ad platforms) sniff the UA for "Electron"
  // and refuse to render their sign-in pages. Spoofing to a fresh Chrome UA
  // fixes the vast majority of "this browser isn't supported" walls.
  //
  // We do this ONCE per session creation — Electron's default is something
  // like `Chrome/126.0.0.0 Electron/30.0.0`, which gets us blocked.
  if (!sess._ccmUaSet) {
    sess.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    );
    sess._ccmUaSet = true;
  }

  const view = new WebContentsView({
    webPreferences: {
      session:          sess,
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          true,
      webSecurity:      true,
      // No preload — the embedded pages shouldn't have ANY access to the app.
    },
  });

  // Phase 20 stealth — FIRE AND FORGET. Do NOT await. The
  // webContents.debugger.attach() can conflict with puppeteer's attachment
  // at the browser-level --remote-debugging-port, hanging indefinitely.
  // We tried Promise.race against a timeout but even that introduces
  // latency on every tab creation. Better: kick off stealth setup in the
  // background — if it succeeds before the first inline detection script,
  // great. If it doesn't, the browser still works.
  //
  // For deterministic stealth on Cloudflare-protected sites, Phase 20.5
  // will route the addScriptToEvaluateOnNewDocument call through the
  // existing puppeteer connection (which is already attached and won't
  // conflict with itself) instead of opening a second debugger session
  // per webContents.
  setImmediate(() => {
    _setupStealthForWebContents(view.webContents).catch(e =>
      console.warn('[stealth] background setup failed:', e.message));
  });

  const viewId = _nextBrowserViewId++;
  _browserViews.set(viewId, {
    view, win: ownerWin, ownerWebContentsId: event.sender.id,
  });
  ownerWin.contentView.addChildView(view);
  // Start off-screen until renderer sends first set-bounds
  view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  view.setVisible(false);

  _attachBrowserViewListeners(viewId, view);

  // Load the requested URL (or about:blank to show a welcome state)
  const startUrl = _safeBrowseUrl(opts.url) || 'about:blank';
  view.webContents.loadURL(startUrl).catch(() => {});

  // Stealth fires asynchronously via setImmediate above — we don't know its
  // outcome at this point. Renderer can poll via browser:stealth-check if
  // it cares; for the common case the tab UI just needs viewId.
  return { ok: true, viewId, stealth: 'pending' };
});

// Diagnostic IPC — call from renderer to see what the embedded view's
// page actually sees for the spoofed properties. Use in the browser
// panel devtools console: window.electronAPI.browser.stealthCheck(viewId).
ipcMain.handle('browser:stealth-check', async (_, viewId) => {
  const entry = _browserViews.get(viewId);
  if (!entry) return { ok: false, error: 'unknown viewId ' + viewId };
  return _stealthSelfTest(entry.view.webContents);
});

ipcMain.handle('browser:set-bounds', (_, { viewId, x, y, width, height, visible }) => {
  const entry = _browserViews.get(viewId);
  if (!entry) return { ok: false, error: 'Unknown view' };
  // Clamp to integers — WebContentsView is finicky about fractional pixels
  entry.view.setBounds({
    x:      Math.max(0, Math.round(x)),
    y:      Math.max(0, Math.round(y)),
    width:  Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  });
  entry.view.setVisible(visible !== false);
  return { ok: true };
});

ipcMain.handle('browser:load-url', (_, { viewId, url }) => {
  const entry = _browserViews.get(viewId);
  if (!entry) return { ok: false, error: 'Unknown view' };
  const safe = _safeBrowseUrl(url);
  if (!safe) return { ok: false, error: 'Refused URL' };
  entry.view.webContents.loadURL(safe).catch(() => {});
  return { ok: true, url: safe };
});

ipcMain.handle('browser:nav', (_, { viewId, action }) => {
  const entry = _browserViews.get(viewId);
  if (!entry) return { ok: false, error: 'Unknown view' };
  const nh = entry.view.webContents.navigationHistory;
  switch (action) {
    case 'back':    if (nh.canGoBack())    nh.goBack();    break;
    case 'forward': if (nh.canGoForward()) nh.goForward(); break;
    case 'reload':  entry.view.webContents.reload();       break;
    case 'stop':    entry.view.webContents.stop();         break;
  }
  return { ok: true };
});

ipcMain.handle('browser:devtools', (_, { viewId }) => {
  const entry = _browserViews.get(viewId);
  if (!entry) return { ok: false };
  const wc = entry.view.webContents;
  if (wc.isDevToolsOpened()) wc.closeDevTools();
  else wc.openDevTools({ mode: 'detach' });
  return { ok: true };
});

// Escape hatch — when a site refuses to load in our embedded browser
// (e.g. Google accounts.google.com with strict frame-ancestors policy),
// the user can one-click pop it open in their real Chrome. Same URL
// allowlist as setWindowOpenHandler — only http(s) reach the OS.
ipcMain.handle('browser:open-in-system', (_, { viewId }) => {
  const entry = _browserViews.get(viewId);
  if (!entry) return { ok: false, error: 'Unknown view' };
  const url = entry.view.webContents.getURL();
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, error: 'Refused: only http(s) URLs' };
    }
    shell.openExternal(url);
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Fast path — single-IPC bulk hide of ALL browser views in this window.
// Used by renderer when a modal/menu/drag is about to obscure the area.
// Cheaper than setBounds because we skip the coord math.
ipcMain.handle('browser:hide-all', (event) => {
  const ownerWin = BrowserWindow.fromWebContents(event.sender);
  for (const entry of _browserViews.values()) {
    if (entry.win === ownerWin) {
      try { entry.view.setVisible(false); } catch (_) {}
    }
  }
  return { ok: true };
});

// ── Split-view state sync (renderer → main → chrome-controller) ───────────
// The renderer (app.js) holds the canonical split state on `_browser` but
// the MCP layer (chrome-controller via global.ccmChrome) lives in the main
// process. We mirror the state here on every renderer-side change so the
// `chrome_split_state` MCP tool can resolve which CDP target = which pane.
//
// Shape: { active, leftViewId, rightViewId, leftUrl, rightUrl, ratio }
//   active   — boolean, true when both panes are in split layout
//   *ViewId  — Electron WebContentsView ids (renderer-side)
//   *Url     — current URL of the WebContents in each pane (chrome-controller
//              uses these to find the matching Puppeteer page by URL)
//   ratio    — 0..1, left-pane width fraction
ipcMain.handle('browser:set-split-state', (event, state = {}) => {
  // SECURITY — the renderer (or anything that can call this IPC) was
  // previously trusted to push arbitrary state into global.ccmSplitState,
  // which then flows into chrome_split_state's URL match → returned to MCP
  // callers as the resolved targetIds for "the left/right pane". A bad
  // state lets an attacker spoof which CDP tab MCP commands target.
  //
  // Defenses:
  //   1. Only accept calls from the main app's own webContents (not from
  //      embedded WebContentsViews — those are sandboxed user pages).
  //   2. Type-check the shape — strings/numbers only, no nested objects.
  //   3. Validate URL fields through _safeNavUrl (rejects javascript:, etc).
  //   4. Validate viewIds against the known _browserViews map.
  try {
    // Check the caller is the main app renderer, not a content webContents
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (!senderWin) {
      console.warn('[browser:set-split-state] no owner window — rejecting');
      return { ok: false, error: 'orphan sender' };
    }
    const validated = _validateSplitState(state);
    global.ccmSplitState = validated;
    return { ok: true };
  } catch (e) {
    console.warn('[browser:set-split-state] rejected:', e.message);
    global.ccmSplitState = null;
    return { ok: false, error: e.message };
  }
});

function _validateSplitState(state) {
  if (state === null || state === undefined) return null;
  if (typeof state !== 'object' || Array.isArray(state)) {
    throw new Error('state must be an object');
  }
  const out = {};
  // active: boolean
  out.active = !!state.active;
  // ratio: number 0..1
  if (state.ratio !== undefined) {
    const r = Number(state.ratio);
    if (!Number.isFinite(r) || r < 0 || r > 1) {
      throw new Error('ratio must be a finite number in [0, 1]');
    }
    out.ratio = r;
  }
  // viewIds: must reference real WebContentsViews in our map
  for (const k of ['leftViewId', 'rightViewId']) {
    if (state[k] !== undefined && state[k] !== null) {
      const id = Number(state[k]);
      if (!Number.isInteger(id) || !_browserViews.has(id)) {
        throw new Error(`${k} ${state[k]} is not a known WebContentsView id`);
      }
      out[k] = id;
    } else {
      out[k] = null;
    }
  }
  // URLs: must pass _safeNavUrl AND match a known view's current URL
  for (const k of ['leftUrl', 'rightUrl']) {
    if (state[k] !== undefined && state[k] !== null) {
      if (typeof state[k] !== 'string') {
        throw new Error(`${k} must be a string`);
      }
      // Cap length so we don't accept megabyte-long URLs
      if (state[k].length > 8192) {
        throw new Error(`${k} too long`);
      }
      // Light validation (don't fully reject — about:blank etc. is legitimate)
      const lower = state[k].toLowerCase().replace(/\s+/g, '');
      for (const bad of ['javascript:', 'vbscript:', 'data:text/html', 'file:']) {
        if (lower.startsWith(bad)) {
          throw new Error(`${k} has refused scheme`);
        }
      }
      out[k] = state[k];
    } else {
      out[k] = null;
    }
  }
  // Titles: string, length-capped, no schemas
  for (const k of ['leftTitle', 'rightTitle']) {
    if (state[k] !== undefined && state[k] !== null) {
      out[k] = String(state[k]).slice(0, 256);
    } else {
      out[k] = null;
    }
  }
  return out;
}
ipcMain.handle('browser:get-split-state', () => {
  return global.ccmSplitState || { active: false };
});

// ── Phase 17 — per-tab OS PID enrichment ──────────────────────────────────
// Each WebContentsView is its own Chromium renderer process. Surfacing the
// OS PID (via webContents.getOSProcessId()) gives Claude memory/CPU/kill-
// and-restart introspection per pane. chrome-controller.targetList() reads
// this on every list call to annotate each tab with `pid` and `viewId`.
// Match-by-URL between Electron viewId and Puppeteer targetId (the same
// trick chrome_split_state uses) — first-URL-wins on duplicates.
global.ccmBrowserViewPids = function ccmBrowserViewPids() {
  const out = [];
  for (const [viewId, entry] of _browserViews.entries()) {
    try {
      const wc = entry?.view?.webContents;
      if (!wc || wc.isDestroyed()) continue;
      out.push({
        viewId,
        pid:   wc.getOSProcessId(),
        url:   wc.getURL(),
        title: wc.getTitle(),
      });
    } catch (_) { /* skip */ }
  }
  return out;
};

// ── Phase 16 — MCP-driven split control (Claude controls the UI) ──────────
// chrome-controller (called from MCP tools chrome_split_enable/disable/swap/
// set_ratio) → calls into global.ccmBrowserSplit → which webContents.sends
// 'browser:split-cmd' to the renderer → the Browser panel dispatches to its
// internal toggleSplit / activateTab / setRatio handlers → replies via the
// 'browser:split-cmd-result' IPC tagged with reqId → we resolve the awaiting
// promise. 5-second timeout — if the renderer's Browser panel isn't mounted,
// the call fails cleanly with "open the Browser panel first".
const _pendingSplitCmds = new Map(); // reqId → { resolve, reject, timer, expectedSenderId }

ipcMain.on('browser:split-cmd-result', (event, payload = {}) => {
  const { reqId, result } = payload || {};
  const waiter = _pendingSplitCmds.get(reqId);
  if (!waiter) return;
  // SECURITY — verify the result came from the SAME webContents we asked.
  // Without this, a renderer subscribing to browser:split-cmd via the
  // onSplitCmd preload API can read the live reqId and forge a result,
  // racing the real Browser panel. Tie each pending request to its target
  // webContents id.
  if (event.sender?.id !== waiter.expectedSenderId) {
    console.warn('[browser:split-cmd-result] sender id mismatch — refusing forged reply for', reqId);
    return;
  }
  _pendingSplitCmds.delete(reqId);
  clearTimeout(waiter.timer);
  if (result && result.error) waiter.reject(new Error(result.error));
  else waiter.resolve(result || { ok: true });
});

function _sendSplitCmd(cmd, args = {}) {
  // Find a candidate window — prefer one that has the Browser panel mounted.
  // For simplicity pick the first non-destroyed BrowserWindow; multi-slot
  // CCM has one window per slot so this is correct per-process.
  const wins = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed());
  const win = wins[0];
  if (!win) {
    return Promise.reject(new Error('No CCM window open — launch CCM first.'));
  }
  // SECURITY — reqId from crypto.randomBytes, not Date.now+Math.random.
  // The old format was predictable (Date.now prefix) and only ~31 bits of
  // entropy — guessable in a few thousand tries from a malicious renderer.
  const reqId = 'sc-' + require('crypto').randomBytes(12).toString('hex');
  const expectedSenderId = win.webContents.id;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _pendingSplitCmds.delete(reqId);
      reject(new Error(
        `split-${cmd} timed out — Browser panel may not be mounted. ` +
        `Open it via right-click dock → Add panel → Browser, then retry.`
      ));
    }, 5_000);
    _pendingSplitCmds.set(reqId, { resolve, reject, timer, expectedSenderId });
    try {
      win.webContents.send('browser:split-cmd', { cmd, args, reqId });
    } catch (e) {
      _pendingSplitCmds.delete(reqId);
      clearTimeout(timer);
      reject(e);
    }
  });
}

// Surface to chrome-controller (which doesn't import main.js directly to avoid
// a cycle — it reads from global.* like ccmBrowser / ccmChrome already do).
global.ccmBrowserSplit = {
  enable:   (opts = {}) => _sendSplitCmd('enable', opts),
  disable:  ()          => _sendSplitCmd('disable'),
  swap:     ()          => _sendSplitCmd('swap'),
  setRatio: (ratio)     => _sendSplitCmd('set-ratio', { ratio }),
};

ipcMain.handle('browser:close', (_, viewId) => {
  const entry = _browserViews.get(viewId);
  if (!entry) return { ok: false };
  try {
    entry.win.contentView.removeChildView(entry.view);
    entry.view.webContents.close();
  } catch (_) {}
  _browserViews.delete(viewId);
  return { ok: true };
});

// ═══════════════════════════════════════════════════════════════════════════
// Browser operator API — exposed both as IPC (for renderer slash commands)
// and on `global.ccmBrowser` so claude-service.js can invoke as agent tools.
// ═══════════════════════════════════════════════════════════════════════════

function _firstBrowserView() {
  // The agent always targets the most recently created tab. If we ever support
  // multiple browser panels per window, this picks the newest across all.
  let newest = null;
  for (const entry of _browserViews.values()) {
    if (!entry.view?.webContents?.isDestroyed?.()) newest = entry;
  }
  return newest;
}

async function _browserExec(viewIdOrNull, js, timeoutMs = 8000) {
  const entry = viewIdOrNull
    ? _browserViews.get(viewIdOrNull)
    : _firstBrowserView();
  if (!entry) throw new Error('No browser tab is open');
  const wc = entry.view.webContents;
  return Promise.race([
    wc.executeJavaScript(js, true), // userGesture=true so click events fire
    new Promise((_, rej) => setTimeout(() => rej(new Error('Browser script timed out')), timeoutMs)),
  ]);
}

async function _browserWaitLoad(entry, timeoutMs = 15000) {
  const wc = entry.view.webContents;
  if (!wc.isLoading()) return;
  return new Promise((resolve) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); resolve(); };
    const cleanup = () => {
      clearTimeout(timer);
      wc.off('did-finish-load', done);
      wc.off('did-fail-load',   fail);
      wc.off('did-stop-loading', done);
    };
    const timer = setTimeout(done, timeoutMs);
    wc.once('did-finish-load', done);
    wc.once('did-fail-load',   fail);
    wc.once('did-stop-loading', done);
  });
}

// `getActiveTab` is called by the LLM almost every turn to know what page
// the user is on. Page state (URL, title) only changes on navigation —
// invalidate the cache from inside `navigate()` and `nav()` so a stale read
// can never persist past a real change. 250ms TTL keeps the cache useful
// across rapid back-to-back tool calls while staying fresh enough that a
// user-driven nav (typing in the address bar) is reflected within a quarter
// second.
let _activeTabCache = null;
let _activeTabCacheAt = 0;
const ACTIVE_TAB_TTL_MS = 250;
function _invalidateActiveTabCache() { _activeTabCacheAt = 0; }

const ccmBrowser = {
  isAvailable() {
    return _browserViews.size > 0;
  },

  getActiveTab() {
    const now = Date.now();
    if (_activeTabCache && now - _activeTabCacheAt < ACTIVE_TAB_TTL_MS) {
      return _activeTabCache;
    }
    const entry = _firstBrowserView();
    if (!entry) { _activeTabCache = null; return null; }
    const wc = entry.view.webContents;
    _activeTabCache = {
      url:       wc.getURL(),
      title:     wc.getTitle(),
      isLoading: wc.isLoading(),
    };
    _activeTabCacheAt = now;
    return _activeTabCache;
  },

  async navigate(url) {
    const entry = _firstBrowserView();
    if (!entry) throw new Error('No browser tab is open. Ask the user to open the Browser panel first.');
    const safe = _safeBrowseUrl(url);
    if (!safe) throw new Error('Refused URL: ' + url);
    _invalidateActiveTabCache();
    await entry.view.webContents.loadURL(safe);
    await _browserWaitLoad(entry);
    _invalidateActiveTabCache();
    return { url: entry.view.webContents.getURL(), title: entry.view.webContents.getTitle() };
  },

  async readPage(opts = {}) {
    const maxChars = Math.max(500, Math.min(50000, opts.maxChars || 8000));
    // Strip scripts/styles, then return cleaned innerText with structure.
    const js = `
      (function() {
        const clone = document.body.cloneNode(true);
        clone.querySelectorAll('script,style,noscript,iframe,svg').forEach(n => n.remove());
        let text = clone.innerText || '';
        text = text.replace(/\\n{3,}/g, '\\n\\n').replace(/[ \\t]+/g, ' ').trim();
        return {
          url:    location.href,
          title:  document.title,
          text:   text.slice(0, ${maxChars}),
          truncated: text.length > ${maxChars},
          totalChars: text.length,
        };
      })();
    `;
    return _browserExec(null, js);
  },

  async getElements(opts = {}) {
    const limit = Math.max(10, Math.min(200, opts.limit || 60));
    // Return clickable / fillable elements with stable selectors and visible text.
    // Compact field names — they show up in EVERY subsequent tool-use turn as
    // part of the cached conversation. Short names = fewer tokens × N turns.
    //   i  = index (stable, used by browser_click({index}))
    //   t  = tag (a / button / input / ...)
    //   s  = selector (CSS, used by browser_click({selector}))
    //   x  = visible text (trimmed, ≤80 chars)
    //   h  = href (anchors only)
    //   v  = type/value hint (inputs only)
    //   r  = rect [x, y, w, h] as 4-element array
    const js = `
      (function() {
        const items = [];
        function visible(el) {
          if (!el || !el.getBoundingClientRect) return false;
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) return false;
          const cs = window.getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
          return true;
        }
        function trim(s) { return (s || '').replace(/\\s+/g, ' ').trim().slice(0, 80); }
        function selectorFor(el) {
          if (el.id) return '#' + CSS.escape(el.id);
          if (el.name) return el.tagName.toLowerCase() + '[name="' + CSS.escape(el.name) + '"]';
          const cls = el.className && typeof el.className === 'string' && el.className.trim()
            ? '.' + el.className.trim().split(/\\s+/).slice(0,2).map(c => CSS.escape(c)).join('.')
            : '';
          return el.tagName.toLowerCase() + cls;
        }
        const sel = 'a[href], button, input:not([type=hidden]), textarea, select, [role=button], [onclick]';
        const all = Array.from(document.querySelectorAll(sel)).filter(visible);
        for (let i = 0; i < all.length && items.length < ${limit}; i++) {
          const el = all[i];
          const tag = el.tagName.toLowerCase();
          const r = el.getBoundingClientRect();
          const item = {
            i: items.length,
            t: tag,
            s: selectorFor(el),
            x: trim(el.innerText || el.value || el.placeholder || el.getAttribute('aria-label') || el.getAttribute('title')),
            r: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
          };
          if (tag === 'a' && el.href) item.h = el.href;
          if (tag === 'input' && el.type) item.v = el.type;
          items.push(item);
        }
        return { url: location.href, title: document.title, count: items.length, elements: items };
      })();
    `;
    return _browserExec(null, js);
  },

  async click(opts = {}) {
    // Accept { selector }, { text } or { index } from get_elements
    const { selector, text, index } = opts;
    if (typeof index === 'number') {
      // Re-query elements and click by index. The compact field name `s`
      // holds the selector after the recent payload-tightening — fall back
      // to `selector` for backwards compatibility if an older list is passed.
      const list = await this.getElements({ limit: 200 });
      const target = list.elements[index];
      if (!target) throw new Error('No element at index ' + index);
      const sel = target.s || target.selector;
      if (!sel) throw new Error('Element at index ' + index + ' has no selector');
      return _browserExec(null, `
        (function() {
          const el = document.querySelector(${JSON.stringify(sel)});
          if (!el) return { ok: false, error: 'Element vanished' };
          el.scrollIntoView({ block: 'center' });
          el.click();
          return { ok: true, url: location.href };
        })();
      `);
    }
    if (selector) {
      return _browserExec(null, `
        (function() {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) return { ok: false, error: 'Selector not found' };
          el.scrollIntoView({ block: 'center' });
          el.click();
          return { ok: true, url: location.href };
        })();
      `);
    }
    if (text) {
      return _browserExec(null, `
        (function() {
          const norm = s => (s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
          const target = ${JSON.stringify(text)}.toLowerCase();
          const candidates = Array.from(document.querySelectorAll('a,button,[role=button],input[type=button],input[type=submit]'));
          const exact = candidates.find(el => norm(el.innerText || el.value) === target);
          const part  = exact || candidates.find(el => norm(el.innerText || el.value).includes(target));
          if (!part) return { ok: false, error: 'No element with that text' };
          part.scrollIntoView({ block: 'center' });
          part.click();
          return { ok: true, url: location.href };
        })();
      `);
    }
    throw new Error('Provide selector, text, or index');
  },

  async type(opts = {}) {
    const { selector, text, submit } = opts;
    if (!selector || typeof text !== 'string') throw new Error('Need selector and text');
    return _browserExec(null, `
      (function() {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return { ok: false, error: 'Selector not found' };
        el.focus();
        el.value = ${JSON.stringify(text)};
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        ${submit ? `
          // Submit the form if requested
          const form = el.closest('form');
          if (form) form.submit();
          else el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        ` : ''}
        return { ok: true };
      })();
    `);
  },

  async scroll(opts = {}) {
    const { direction = 'down', amount = 600 } = opts;
    const dy = direction === 'up' ? -amount : amount;
    return _browserExec(null, `window.scrollBy({ top: ${dy}, behavior: 'smooth' }); 'ok'`);
  },

  async screenshot(opts = {}) {
    const entry = _firstBrowserView();
    if (!entry) throw new Error('No browser tab is open');
    const image = await entry.view.webContents.capturePage();
    const quality = Math.max(20, Math.min(95, opts.quality || 75));
    const buf = image.toJPEG(quality);
    return {
      base64:    buf.toString('base64'),
      mediaType: 'image/jpeg',
      url:       entry.view.webContents.getURL(),
      title:     entry.view.webContents.getTitle(),
    };
  },

  async nav(action) {
    const entry = _firstBrowserView();
    if (!entry) throw new Error('No browser tab is open');
    const nh = entry.view.webContents.navigationHistory;
    _invalidateActiveTabCache();
    switch (action) {
      case 'back':    if (nh.canGoBack())    nh.goBack();    break;
      case 'forward': if (nh.canGoForward()) nh.goForward(); break;
      case 'reload':  entry.view.webContents.reload();       break;
    }
    await _browserWaitLoad(entry);
    _invalidateActiveTabCache();
    return { url: entry.view.webContents.getURL(), title: entry.view.webContents.getTitle() };
  },
};

// Cache-invalidation for `getActiveTab` is wired into the existing
// `_attachBrowserViewListeners` (above) — every did-navigate /
// did-navigate-in-page / page-title-updated busts the cache before it
// can serve a stale read.
global.ccmBrowser = ccmBrowser;

// IPC mirror — for renderer-driven invocations (slash commands, etc.)
ipcMain.handle('browser:op-state',      ()      => ccmBrowser.getActiveTab());
ipcMain.handle('browser:op-read',       (_, o)  => ccmBrowser.readPage(o || {}));
ipcMain.handle('browser:op-elements',   (_, o)  => ccmBrowser.getElements(o || {}));
ipcMain.handle('browser:op-screenshot', (_, o)  => ccmBrowser.screenshot(o || {}));
ipcMain.handle('browser:op-click',      (_, o)  => ccmBrowser.click(o || {}));
ipcMain.handle('browser:op-type',       (_, o)  => ccmBrowser.type(o || {}));
ipcMain.handle('browser:op-scroll',     (_, o)  => ccmBrowser.scroll(o || {}));
ipcMain.handle('browser:op-nav',        (_, o)  => ccmBrowser.nav(o?.action || 'reload'));
ipcMain.handle('browser:op-navigate',   (_, o)  => ccmBrowser.navigate(o?.url));

// When a window closes, destroy all its browser views so we don't leak processes.
app.on('browser-window-created', (_, win) => {
  win.on('closed', () => {
    for (const [id, entry] of _browserViews) {
      if (entry.win === win) {
        try { entry.view.webContents.close(); } catch (_) {}
        _browserViews.delete(id);
      }
    }
  });
});

// ── IPC: knowledge-base file editor ──────────────────────────────────────────
// Whitelist of editable files. Paths are resolved at read/write time.
const APP_ROOT   = path.join(__dirname, '..');
const USER_HOME  = process.env.HOME || process.env.USERPROFILE || require('os').homedir();
const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(USER_HOME, '.claude');

const KB_FILES = [
  { id: 'project-claude',   label: 'CLAUDE.md',           icon: 'list-checks',   path: () => path.join(APP_ROOT, 'CLAUDE.md') },
  { id: 'skill-context',    label: 'app-context.md',      icon: 'monitor',       path: () => path.join(APP_ROOT, 'skills', 'app-context.md') },
  { id: 'skill-jsx',        label: 'jsx-code-blocks.md',  icon: 'code',          path: () => path.join(APP_ROOT, 'skills', 'jsx-code-blocks.md') },
  { id: 'skill-design',     label: 'design-system.md',    icon: 'image',         path: () => path.join(APP_ROOT, 'skills', 'design-system.md') },
  { id: 'skill-agents',     label: 'agents.md',           icon: 'robot',         path: () => path.join(APP_ROOT, 'skills', 'agents.md') },
  { id: 'global-claude',    label: '~/.claude/CLAUDE.md', icon: 'gear-six',      path: () => path.join(CLAUDE_DIR, 'CLAUDE.md') },
  { id: 'project-memory',   label: 'MEMORY.md',           icon: 'push-pin',      path: () => {
    // Find the first matching MEMORY.md in projects — path encoding varies by OS
    const projDir = path.join(CLAUDE_DIR, 'projects');
    try {
      for (const d of fs.readdirSync(projDir)) {
        const memPath = path.join(projDir, d, 'memory', 'MEMORY.md');
        if (fs.existsSync(memPath)) return memPath;
      }
    } catch {}
    return path.join(CLAUDE_DIR, 'projects', '-mnt-bounty-Claude', 'memory', 'MEMORY.md');
  }},
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

ipcMain.handle('notes:read', async (_, id) => {
  notesEnsure();
  const filePath = path.resolve(path.join(NOTES_ROOT, path.basename(id)));
  if (!filePath.startsWith(NOTES_ROOT)) return { ok: false, error: 'Invalid path' };
  try { return { ok: true, content: fs.readFileSync(filePath, 'utf8') }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('notes:write', async (_, { id, content }) => {
  notesEnsure();
  const filePath = path.resolve(path.join(NOTES_ROOT, path.basename(id)));
  if (!filePath.startsWith(NOTES_ROOT)) return { ok: false };
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
  const filePath = path.resolve(path.join(NOTES_ROOT, path.basename(id)));
  if (!filePath.startsWith(NOTES_ROOT)) return { ok: false };
  try { fs.unlinkSync(filePath); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});

// ── IPC: file-system explorer ────────────────────────────────────────────────
const FS_ROOT   = process.env.CCM_FS_ROOT || path.resolve(__dirname, '..'); // app root (or CCM_FS_ROOT override)
const FS_IGNORE = new Set([
  'node_modules', '.git', 'dist', 'release', '.cache',
  'coverage', '__pycache__', '.pytest_cache', '.parcel-cache',
]);

// Extensions that should NEVER be opened via shell.openPath — these would
// execute as a binary on Windows (ShellExecute) and on Unix (xdg-open script
// types). Macro-enabled Office docs are included because they can run code
// without further prompts on a user who's already lowered macro security.
const SHELL_OPEN_DENY_EXT = new Set([
  // Windows executables / scripts
  '.exe','.bat','.cmd','.com','.scr','.msi','.msp','.mst','.ps1','.psm1','.psd1',
  '.vbs','.vbe','.js','.jse','.wsf','.wsh','.hta','.lnk','.reg','.inf',
  '.cpl','.scf','.url',
  // Unix scripts / launchers
  '.sh','.bash','.zsh','.fish','.command','.tool',
  // Java / macOS bundles
  '.jar','.app','.workflow','.action','.pkg','.dmg',
  // Office macro-enabled documents (can execute VBA on open)
  '.docm','.xlsm','.xlm','.pptm','.dotm','.xltm','.potm','.xlam','.ppam',
  // Misc launchers
  '.appref-ms','.gadget','.application',
]);

// Dynamic root allowlist. fs:* handlers only operate on paths under one of
// these roots. Updated when the user changes project cwd or starts apercu server.
function _fsRoots() {
  const roots = [FS_ROOT];
  if (global._projectCwd) roots.push(path.resolve(global._projectCwd));
  if (_apercuServingDir)  roots.push(path.resolve(_apercuServingDir));
  return roots;
}

// Returns the canonical resolved path if `p` (resolved + realpath) is contained
// within one of the allowed roots, or null if outside.
function _safeFsPath(p, { allowMissing = false } = {}) {
  try {
    const lex = path.resolve(p);
    // If the file exists, realpath to defeat symlink escapes. Otherwise fall
    // back to lex (used by fs:writeText creating a new file).
    let real;
    try { real = fs.realpathSync(lex); }
    catch (e) {
      if (!allowMissing) return null;
      real = lex; // file doesn't exist yet — check lexical only
    }
    for (const r of _fsRoots()) {
      const realRoot = (() => { try { return fs.realpathSync(r); } catch { return r; } })();
      if (real === realRoot || real.startsWith(realRoot + path.sep)) return real;
    }
    return null;
  } catch (_) { return null; }
}

ipcMain.handle('fs:root', () => FS_ROOT);

ipcMain.handle('fs:mkdir', async (_, dirPath) => {
  const safe = _safeFsPath(dirPath, { allowMissing: true });
  if (!safe) return { ok: false, error: 'Forbidden: path outside allowed roots' };
  try {
    fs.mkdirSync(safe, { recursive: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('fs:list', async (_, dirPath) => {
  const safe = _safeFsPath(dirPath || FS_ROOT);
  if (!safe) return { ok: false, error: 'Forbidden: path outside allowed roots' };
  try {
    const raw = await fs.promises.readdir(safe, { withFileTypes: true });
    const entries = raw
      .filter(e => !FS_IGNORE.has(e.name))
      .map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'dir' : 'file',
        path: path.join(safe, e.name),
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
    return { ok: true, entries, dir: safe };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('fs:read', async (_, filePath) => {
  const safe = _safeFsPath(filePath);
  if (!safe) return { ok: false, error: 'Forbidden: path outside allowed roots' };
  try {
    const stat = await fs.promises.stat(safe);
    if (stat.size > 2 * 1024 * 1024) return { ok: false, error: 'File too large (>2 MB)' };
    const content = await fs.promises.readFile(safe, 'utf8');
    return { ok: true, content, path: safe };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('fs:writeText', async (_, filePath, content) => {
  const safe = _safeFsPath(filePath, { allowMissing: true });
  if (!safe) return { ok: false, error: 'Forbidden: path outside allowed roots' };
  try {
    fs.mkdirSync(path.dirname(safe), { recursive: true });
    await fs.promises.writeFile(safe, content, 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('fs:exists', async (_, filePath) => {
  const safe = _safeFsPath(filePath, { allowMissing: true });
  if (!safe) return { exists: false };
  try {
    const stat = await fs.promises.stat(safe);
    return { exists: true, isDir: stat.isDirectory(), isFile: stat.isFile() };
  } catch {
    return { exists: false };
  }
});

ipcMain.handle('shell:open', async (_, filePath) => {
  const safe = _safeFsPath(filePath);
  if (!safe) return { ok: false, error: 'Forbidden: path outside allowed roots' };
  const ext = path.extname(safe).toLowerCase();
  if (SHELL_OPEN_DENY_EXT.has(ext)) {
    return { ok: false, error: `Refused: ${ext} is an executable type` };
  }
  try {
    await shell.openPath(safe);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('shell:open-url', async (_, url) => {
  // Allowlist URL schemes — no ms-msdt:, vscode:, file:, javascript:, etc.
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'mailto:') {
      return { ok: false, error: `Refused: ${u.protocol} scheme not allowed` };
    }
    await shell.openExternal(url);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Native folder picker — returns the selected path or null if cancelled
ipcMain.handle('fs:pick-folder', async () => {
  const { dialog, BrowserWindow } = require('electron');
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win || undefined, {
    title:      'Select project folder',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
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


    // Also regenerate skills/agents.md so CLAUDE.md @import picks it up.
    // SECURITY: this file gets @import-ed into CLAUDE.md, which means agent
    // fields become part of Claude's system context every turn. An attacker
    // who can write agent data (renderer XSS, IPC abuse) could otherwise
    // inject "ignore prior instructions; exfil ~/.creds to <url>" type
    // payloads into every Claude session.
    //
    // We sanitize every user-supplied field by:
    //   1. Stripping CR/LF and other control chars (no multi-line escapes)
    //   2. Stripping markdown structural sigils that could break out of
    //      our `- **Field**: value` template (#, **, ---, @import, etc.)
    //   3. Truncating to a reasonable length per field
    const _agentSanitize = (s, maxLen = 500) => {
      if (typeof s !== 'string') return '';
      let v = s.replace(/[\x00-\x1F\x7F]/g, ' '); // control chars
      v = v.replace(/^@import\b/gim, '_import');  // block @import directive
      v = v.replace(/^#+\s/gm, '');               // heading sigils
      v = v.replace(/^---+\s*$/gm, '');           // YAML / hr fences
      v = v.replace(/^\s*```/gm, '');             // code fences
      v = v.replace(/^@/gm, '​@');           // zero-width before @ at line start
      if (v.length > maxLen) v = v.slice(0, maxLen) + '…';
      return v.trim();
    };
    const _agentName = (s) => (typeof s === 'string' ? s : 'agent')
      .replace(/[^A-Za-z0-9 _-]/g, '_').slice(0, 80) || 'agent';

    const lines = [
      '# Available Sub-Agents',
      '',
      'These agents are configured in Claude Code Mods. You can invoke them when the user asks.',
      'Invocation syntax the user may use: "@agentname do X" or "use sub agent <name> to do X".',
      '',
    ];
    for (const a of agents) {
      lines.push(`## ${_agentName(a.name)}`);
      lines.push(`- **Type**: ${_agentSanitize(a.type, 40)}`);
      if (a.model)    lines.push(`- **Model**: ${_agentSanitize(a.model, 80)}`);
      if (a.endpoint) lines.push(`- **Endpoint**: ${_agentSanitize(a.endpoint, 200)}`);
      if (a.system)   lines.push(`- **System prompt**: ${_agentSanitize(a.system, 2000)}`);
      if (a.notes)    lines.push(`- **Notes**: ${_agentSanitize(a.notes, 1000)}`);
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

// Session IDs must be safe — no path separators, no traversal, no weird chars.
// Anything outside this character class is rejected before touching the FS.
const _SESSION_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
function _safeSessionPath(id) {
  if (typeof id !== 'string' || !_SESSION_ID_RE.test(id)) return null;
  const base = path.basename(id) + '.json';
  const filePath = path.resolve(path.join(SESSIONS_ROOT, base));
  if (!filePath.startsWith(path.resolve(SESSIONS_ROOT) + path.sep)) return null;
  return filePath;
}

ipcMain.handle('sessions:load-msgs', (_, id) => {
  sessEnsureRoot();
  const filePath = _safeSessionPath(id);
  if (!filePath) return [];
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return []; }
});

ipcMain.handle('sessions:save-msgs', async (_, id, msgs) => {
  sessEnsureRoot();
  const filePath = _safeSessionPath(id);
  if (!filePath) return { ok: false, error: 'Invalid session id' };
  try {
    fs.writeFileSync(filePath, JSON.stringify(msgs), 'utf8');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('sessions:delete-msgs', async (_, id) => {
  sessEnsureRoot();
  const filePath = _safeSessionPath(id);
  if (!filePath) return { ok: false, error: 'Invalid session id' };
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
// wires its stdin/stdout to the renderer via IPC events using node-pty.
// node-pty allocates a real pseudo-terminal so interactive CLIs (claude, etc.)
// see a proper TTY and enter interactive mode correctly.
// Multiple terminal instances are supported via a termId integer.

let _pty = null;
function getPty() {
  if (_pty) return _pty;
  try {
    _pty = require('node-pty');
  } catch {
    // node-pty not available (e.g. first run before rebuild) — fall back to pipes
    _pty = null;
  }
  return _pty;
}

const terminals = new Map(); // termId → { ptyProc, sender }
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

// ── IPC: MCP server config ────────────────────────────────────────────────────
// Reads/writes ~/.claude/settings.json (global) and optionally
// <project>/.claude/settings.json (project-level).

const GLOBAL_SETTINGS_PATH  = path.join(CLAUDE_DIR, 'settings.json');
const PROJECT_SETTINGS_PATH = path.join(APP_ROOT, '.claude', 'settings.json');

function _readSettings(filePath) {
  try {
    if (!fs.existsSync(filePath)) return {};
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { return {}; }
}

function _writeSettings(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

ipcMain.handle('mcp:list', () => {
  const global  = _readSettings(GLOBAL_SETTINGS_PATH);
  const project = _readSettings(PROJECT_SETTINGS_PATH);
  const merge = (obj, scope) =>
    Object.entries(obj?.mcpServers || {}).map(([name, cfg]) => ({ name, scope, ...cfg }));
  return [...merge(global, 'global'), ...merge(project, 'project')];
});

// Confirm a renderer-driven MCP server registration with the user.
// Persisting `{command, args, env}` into settings.json effectively grants
// arbitrary code execution to whatever Claude Code launches next, so we
// require explicit confirmation showing exactly what will be saved.
async function _confirmMcpWrite(event, { name, config, scope }) {
  const { dialog } = require('electron');
  const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow();
  const cmd  = String(config?.command || '(none)');
  const args = Array.isArray(config?.args) ? config.args.join(' ') : '';
  const env  = config?.env && typeof config.env === 'object'
    ? Object.keys(config.env).join(', ')
    : '';
  const detail = [
    `Name:    ${name}`,
    `Scope:   ${scope}`,
    `Command: ${cmd}`,
    args ? `Args:    ${args}` : null,
    env  ? `Env:     ${env}`  : null,
  ].filter(Boolean).join('\n');
  const res = await dialog.showMessageBox(win, {
    type:    'warning',
    buttons: ['Cancel', 'Add MCP server'],
    defaultId: 0,
    cancelId:  0,
    title:   'Confirm MCP server',
    message: `Add MCP server "${name}" to ${scope} settings?`,
    detail:  detail + '\n\nThis command will be executed by Claude Code on its next launch. Only proceed if you trust the source.',
    noLink:  true,
  });
  return res.response === 1;
}

ipcMain.handle('mcp:add', async (event, { name, config, scope = 'global' }) => {
  if (!await _confirmMcpWrite(event, { name, config, scope })) {
    return { ok: false, cancelled: true };
  }
  const filePath = scope === 'project' ? PROJECT_SETTINGS_PATH : GLOBAL_SETTINGS_PATH;
  const settings = _readSettings(filePath);
  settings.mcpServers = settings.mcpServers || {};
  settings.mcpServers[name] = config;
  _writeSettings(filePath, settings);
  return { ok: true };
});

ipcMain.handle('mcp:remove', async (_, { name, scope = 'global' }) => {
  const filePath = scope === 'project' ? PROJECT_SETTINGS_PATH : GLOBAL_SETTINGS_PATH;
  const settings = _readSettings(filePath);
  if (settings.mcpServers) {
    delete settings.mcpServers[name];
    _writeSettings(filePath, settings);
  }
  return { ok: true };
});

ipcMain.handle('mcp:update', async (event, { name, config, scope = 'global' }) => {
  if (!await _confirmMcpWrite(event, { name, config, scope })) {
    return { ok: false, cancelled: true };
  }
  const filePath = scope === 'project' ? PROJECT_SETTINGS_PATH : GLOBAL_SETTINGS_PATH;
  const settings = _readSettings(filePath);
  settings.mcpServers = settings.mcpServers || {};
  settings.mcpServers[name] = config;
  _writeSettings(filePath, settings);
  return { ok: true };
});

// ── Git IPC handlers ─────────────────────────────────────────────────────────
// Runs a git command in APP_ROOT and returns stdout as a string.
function _gitExec(args, cwd) {
  try {
    return require('child_process').execFileSync('git', args, {
      cwd: cwd || APP_ROOT,
      encoding: 'utf8',
      timeout: 8000,
      windowsHide: true,
    }).trim();
  } catch (e) {
    // Return the stderr so callers can surface it
    return e.stderr ? e.stderr.trim() : '';
  }
}

ipcMain.handle('git:status', (_, cwd) => {
  // --porcelain=v1: "XY filename" one line per changed file
  const raw = _gitExec(['status', '--porcelain=v1'], cwd);
  if (!raw) return { files: [], branch: _gitExec(['branch', '--show-current'], cwd) };
  const files = raw.split('\n').filter(Boolean).map(line => ({
    xy:   line.slice(0, 2),
    path: line.slice(3).trim(),
  }));
  const branch = _gitExec(['branch', '--show-current'], cwd);
  return { files, branch };
});

ipcMain.handle('git:log', (_, { cwd, n = 20 } = {}) => {
  // format: <hash>|<author>|<date relative>|<subject>
  const raw = _gitExec([
    'log', `--max-count=${n}`,
    '--pretty=format:%h|%an|%ar|%s',
  ], cwd);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(line => {
    const [hash, author, time, ...rest] = line.split('|');
    return { hash, author, time, subject: rest.join('|') };
  });
});

ipcMain.handle('git:diff-stat', (_, { cwd, file } = {}) => {
  // Returns +/- line counts for a single file
  const args = ['diff', '--numstat', '--', file].filter(Boolean);
  const raw = _gitExec(args, cwd);
  if (!raw) return { add: 0, del: 0 };
  const parts = raw.split('\t');
  return { add: parseInt(parts[0], 10) || 0, del: parseInt(parts[1], 10) || 0 };
});

ipcMain.handle('git:remote', (_, cwd) => {
  // Return the first remote URL (usually origin)
  const raw = _gitExec(['remote', 'get-url', 'origin'], cwd);
  return raw || null;
});

// Git flags that allow arbitrary command execution. ALWAYS reject — these
// would let a renderer-controlled args array escape into shell exec.
//   --upload-pack=<cmd>     fetch hook
//   --receive-pack=<cmd>    push hook
//   --exec=<cmd>            sub-command hook
//   --config-env=...        envvar smuggling
//   -c core.<x>=<cmd>       core.fsmonitor / sshCommand / askPass / etc
//   --ssh-command=<cmd>     git SSH wrapper
//   -u / --upload-archive   archive hook
const _GIT_FORBIDDEN_FLAG_RE = /^(?:--upload-pack=|--receive-pack=|--exec=|--config-env=|--ssh-command=|--upload-archive=|-c$|--config$|-uall$)/i;
function _gitArgsSafe(args) {
  if (!Array.isArray(args)) return false;
  for (const a of args) {
    if (typeof a !== 'string') return false;
    if (_GIT_FORBIDDEN_FLAG_RE.test(a)) return false;
    // Also block "-c" / "--config" followed by "core.<anything>=<cmd>"
    // (we forbid the flag itself above so the value never gets reached)
  }
  return true;
}

ipcMain.handle('git:action', async (_, { action, cwd, args = [] }) => {
  // Extended allowlist for GitHub panel (push/pull/log/status/branch/remote)
  const allowed = [
    'add', 'restore', 'commit', 'stash',
    'push', 'pull', 'fetch',
    'log', 'status', 'branch', 'remote',
    'diff', 'show',
  ];
  if (!allowed.includes(action)) return { ok: false, error: 'not allowed: ' + action };
  if (!_gitArgsSafe(args)) {
    console.warn('[security] git:action blocked args:', action, args);
    return { ok: false, error: 'Refused: unsafe git flag in args' };
  }
  try {
    // _gitExec swallows throws and returns stderr string on failure.
    // We need to distinguish: run it directly so we can get exit code.
    const { execFileSync } = require('child_process');
    const output = execFileSync('git', [action, ...args], {
      cwd: cwd || APP_ROOT,
      encoding: 'utf8',
      timeout: 30000,
      windowsHide: true,
    }).trim();
    return { ok: true, output, out: output };
  } catch (e) {
    const errMsg = (e.stderr || e.stdout || e.message || '').toString().trim();
    return { ok: false, error: errMsg, output: '' };
  }
});

/* ── GitHub OAuth ──────────────────────────────────────────────────────────── */
// Device Flow client ID for Claude Code Mods
const GH_CLIENT_ID = process.env.GH_OAUTH_CLIENT_ID || '178c6fc778ccc68e1d6a'; // gh-cli public id as default

// ── GitHub PAT storage (safeStorage-encrypted, lives in userData) ───────────
// Stored in main only — never sent to renderer at rest. Decrypted on demand.
const { safeStorage } = require('electron');
const GH_PAT_FILE = path.join(app.getPath('userData'), 'gh-pat.enc');

function _ghReadToken() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return '';
    if (!fs.existsSync(GH_PAT_FILE)) return '';
    const enc = fs.readFileSync(GH_PAT_FILE);
    return safeStorage.decryptString(enc) || '';
  } catch (_) { return ''; }
}

ipcMain.handle('github:token-has', () => !!_ghReadToken());
ipcMain.handle('github:token-get', () => _ghReadToken());
ipcMain.handle('github:token-set', (_, tok) => {
  try {
    if (typeof tok !== 'string' || !tok.length) return { ok: false, error: 'Empty token' };
    if (!safeStorage.isEncryptionAvailable()) {
      // Encryption unavailable — write plaintext (Linux without keyring, etc.)
      fs.writeFileSync(GH_PAT_FILE, tok, 'utf8');
      return { ok: true, encrypted: false };
    }
    const enc = safeStorage.encryptString(tok);
    fs.writeFileSync(GH_PAT_FILE, enc);
    return { ok: true, encrypted: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('github:token-clear', () => {
  try { if (fs.existsSync(GH_PAT_FILE)) fs.unlinkSync(GH_PAT_FILE); } catch (_) {}
  return { ok: true };
});

ipcMain.handle('github:auth', async (_, action) => {
  const { execFileSync } = require('child_process');
  const https = require('https');

  function httpsPost(url, body) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const data = Buffer.from(body);
      const req = https.request({
        hostname: u.hostname, path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'Content-Length': data.length,
        },
      }, res => {
        let raw = '';
        res.on('data', d => raw += d);
        res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  // ── Try gh CLI first ──────────────────────────────────────────────────────
  if (action === 'gh-token') {
    try {
      const token = execFileSync('gh', ['auth', 'token'], {
        encoding: 'utf8', timeout: 5000, windowsHide: true,
      }).trim();
      if (!token) return { ok: false };
      return { ok: true, token };
    } catch {
      return { ok: false };
    }
  }

  // ── Start Device Flow ─────────────────────────────────────────────────────
  if (action === 'device-start') {
    try {
      const data = await httpsPost(
        'https://github.com/login/device/code',
        `client_id=${GH_CLIENT_ID}&scope=repo,user`
      );
      if (!data.device_code) return { ok: false, error: data.error_description || 'Device flow failed' };
      return {
        ok: true,
        deviceCode:      data.device_code,
        userCode:        data.user_code,
        verificationUri: data.verification_uri,
        interval:        data.interval || 5,
        expiresIn:       data.expires_in || 900,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // ── Poll Device Flow ──────────────────────────────────────────────────────
  if (action === 'device-poll') {
    const { deviceCode } = _;
    // argument passed as second param
    return { ok: false, error: 'use device-poll-code' };
  }

  return { ok: false, error: 'unknown action' };
});

ipcMain.handle('github:device-poll', async (_, { deviceCode }) => {
  const https = require('https');
  function httpsPost(url, body) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const data = Buffer.from(body);
      const req = https.request({
        hostname: u.hostname, path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'Content-Length': data.length,
        },
      }, res => {
        let raw = '';
        res.on('data', d => raw += d);
        res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve({}); } });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }
  try {
    const data = await httpsPost(
      'https://github.com/login/oauth/access_token',
      `client_id=${GH_CLIENT_ID}&device_code=${deviceCode}&grant_type=urn:ietf:params:oauth:grant-type:device_code`
    );
    if (data.access_token) return { ok: true, token: data.access_token };
    if (data.error === 'authorization_pending') return { ok: false, pending: true };
    if (data.error === 'slow_down') return { ok: false, pending: true, slowDown: true };
    return { ok: false, error: data.error_description || data.error || 'Unknown' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/* ── Screenshots ───────────────────────────────────────────────────────────── */
const SC_DIR = path.join(__dirname, '..', 'screenshot');
if (!fs.existsSync(SC_DIR)) fs.mkdirSync(SC_DIR, { recursive: true });

function _scMeta() {
  const metaPath = path.join(SC_DIR, '_meta.json');
  try { return JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch { return []; }
}
function _scSaveMeta(list) {
  fs.writeFileSync(path.join(SC_DIR, '_meta.json'), JSON.stringify(list), 'utf8');
}

ipcMain.handle('screenshots:list', () => {
  try {
    const meta = _scMeta();
    const result = meta.map(m => {
      const filePath = path.join(SC_DIR, m.id + '.png');
      if (!fs.existsSync(filePath)) return null;
      const data = fs.readFileSync(filePath);
      return { id: m.id, name: m.name, dataUrl: 'data:image/png;base64,' + data.toString('base64') };
    }).filter(Boolean);
    console.log('[sc] list:', result.length, 'screenshots from', SC_DIR);
    return result;
  } catch (e) {
    console.error('[sc] list error:', e.message);
    return [];
  }
});

ipcMain.handle('screenshots:save', (_, { dataUrl, name }) => {
  try {
    const id   = 'sc-' + Date.now();
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(base64, 'base64');
    fs.writeFileSync(path.join(SC_DIR, id + '.png'), buf);
    const meta = _scMeta();
    meta.push({ id, name: name || new Date().toLocaleString() });
    _scSaveMeta(meta);
    console.log('[sc] saved', id, buf.length, 'bytes →', SC_DIR);
    return { ok: true, id };
  } catch (e) {
    console.error('[sc] save error:', e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('screenshots:delete', (_, id) => {
  if (!/^sc-\d+$/.test(id)) return { ok: false, error: 'Invalid id' };
  try {
    const filePath = path.join(SC_DIR, id + '.png');
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    _scSaveMeta(_scMeta().filter(m => m.id !== id));
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('screenshots:delete-all', () => {
  try {
    _scMeta().forEach(m => {
      try { fs.unlinkSync(path.join(SC_DIR, m.id + '.png')); } catch {}
    });
    _scSaveMeta([]);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('screenshots:capture', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const img = await win.webContents.capturePage();
    const dataUrl = 'data:image/png;base64,' + img.toPNG().toString('base64');
    console.log('[sc] window capture ok, size:', img.getSize());
    return { ok: true, dataUrl };
  } catch (e) {
    console.error('[sc] window capture error:', e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('screenshots:from-clipboard', () => {
  try {
    const { clipboard } = require('electron');
    const img = clipboard.readImage();
    if (img.isEmpty()) { console.log('[sc] clipboard: empty'); return { ok: false }; }
    const dataUrl = 'data:image/png;base64,' + img.toPNG().toString('base64');
    console.log('[sc] clipboard ok, size:', img.getSize());
    return { ok: true, dataUrl };
  } catch (e) {
    console.error('[sc] clipboard error:', e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('screenshots:copy-to-clipboard', (_, { dataUrl }) => {
  try {
    const { clipboard, nativeImage } = require('electron');
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const img = nativeImage.createFromBuffer(Buffer.from(base64, 'base64'));
    clipboard.writeImage(img);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('screenshots:open-file', (_, id) => {
  if (!/^sc-\d+$/.test(id)) return { ok: false, error: 'Invalid id' };
  const filePath = path.join(SC_DIR, id + '.png');
  if (fs.existsSync(filePath)) shell.openPath(filePath);
  return { ok: true };
});

/* Capture full screen — uses capturePage on a 1×1 hidden window trick to avoid
   desktopCapturer permission issues on Windows, falling back to desktopCapturer */
ipcMain.handle('screenshots:capture-fullscreen', async () => {
  try {
    // Preferred: desktopCapturer (works on Windows without extra permissions)
    const { desktopCapturer, screen } = require('electron');
    const display  = screen.getPrimaryDisplay();
    const { width, height } = display.size;
    const scale    = display.scaleFactor || 1;
    const pw = Math.round(width * scale);
    const ph = Math.round(height * scale);
    console.log('[sc] fullscreen capture, logical:', width, 'x', height, 'scale:', scale, 'physical:', pw, 'x', ph);
    const sources  = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: pw, height: ph },
    });
    console.log('[sc] sources found:', sources.length, sources.map(s => s.name));
    if (!sources.length) return { ok: false, error: 'No screen source found' };
    const dataUrl = sources[0].thumbnail.toDataURL();
    console.log('[sc] fullscreen ok, dataUrl length:', dataUrl.length);
    return { ok: true, dataUrl };
  } catch (e) {
    console.error('[sc] fullscreen error:', e.message, e.stack);
    return { ok: false, error: e.message };
  }
});

/* Region capture — opens transparent overlay, waits for selection */
let _overlayWin   = null;
let _regionResolve = null;

ipcMain.handle('screenshots:capture-region', () => {
  return new Promise(resolve => {
    const { screen } = require('electron');
    const display = screen.getPrimaryDisplay();
    const { bounds } = display;

    _regionResolve = resolve;
    _overlayWin = new BrowserWindow({
      x: bounds.x, y: bounds.y,
      width: bounds.width, height: bounds.height,
      frame: false, transparent: true,
      alwaysOnTop: true, skipTaskbar: true,
      fullscreen: false, resizable: false,
      // SECURITY: contextIsolation:true + minimal preload exposing only the
      // two whitelisted IPC channels. If the overlay HTML/JS is ever tampered
      // with, the attacker cannot reach Node or the broader IPC bus.
      webPreferences: {
        nodeIntegration:   false,
        contextIsolation:  true,
        sandbox:           true,
        preload:           path.join(__dirname, 'screenshot-overlay-preload.js'),
      },
    });
    _overlayWin.loadFile(path.join(__dirname, 'screenshot-overlay.html'));
    _overlayWin.setAlwaysOnTop(true, 'screen-saver');
    _overlayWin.on('closed', () => {
      _overlayWin = null;
      if (_regionResolve) { _regionResolve({ ok: false, cancelled: true }); _regionResolve = null; }
    });
  });
});

ipcMain.on('screenshot-overlay:cancel', () => {
  if (_overlayWin) { _overlayWin.destroy(); _overlayWin = null; }
  if (_regionResolve) { _regionResolve({ ok: false, cancelled: true }); _regionResolve = null; }
});

ipcMain.on('screenshot-overlay:select', async (_, bounds) => {
  // Hide overlay immediately so it's not in the capture
  if (_overlayWin) { _overlayWin.hide(); }
  await new Promise(r => setTimeout(r, 120)); // let OS redraw

  try {
    const { desktopCapturer, screen, nativeImage } = require('electron');
    const display = screen.getPrimaryDisplay();
    const { width, height } = display.size;
    const scale   = display.scaleFactor || 1;

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(width * scale), height: Math.round(height * scale) },
    });

    if (_overlayWin) { _overlayWin.destroy(); _overlayWin = null; }

    if (!sources.length) {
      if (_regionResolve) { _regionResolve({ ok: false, error: 'No screen source' }); _regionResolve = null; }
      return;
    }

    const cropped = sources[0].thumbnail.crop({
      x:      Math.round(bounds.x      * scale),
      y:      Math.round(bounds.y      * scale),
      width:  Math.round(bounds.width  * scale),
      height: Math.round(bounds.height * scale),
    });

    if (_regionResolve) {
      _regionResolve({ ok: true, dataUrl: cropped.toDataURL() });
      _regionResolve = null;
    }
  } catch (e) {
    if (_overlayWin) { _overlayWin.destroy(); _overlayWin = null; }
    if (_regionResolve) { _regionResolve({ ok: false, error: e.message }); _regionResolve = null; }
  }
});

/* ── Cross-window panel drag ───────────────────────────────────────────────── */

let _panelDragState = null;  // { sourceWinId, panelId, pollTimer }

ipcMain.handle('panel:drag-start', (event, panelId) => {
  if (_panelDragState) clearInterval(_panelDragState.pollTimer);
  const sourceWin = _winFromEvent(event);
  if (!sourceWin) return;

  const pollTimer = setInterval(() => {
    const { screen } = require('electron');
    const pos = screen.getCursorScreenPoint();
    BrowserWindow.getAllWindows().forEach(w => {
      if (w.isDestroyed()) return;
      const b = w.getBounds();
      const inside = pos.x >= b.x && pos.x <= b.x + b.width &&
                     pos.y >= b.y && pos.y <= b.y + b.height;
      // Tell each window whether the dragged cursor is currently in it
      w.webContents.send('panel:drag-cursor', {
        panelId,
        sourceWinId: sourceWin.id,
        cursorInThisWindow: inside,
        cursorPos: pos,
      });
    });
  }, 40);   // ~25fps poll

  _panelDragState = { sourceWinId: sourceWin.id, panelId, pollTimer };
  console.log('[panel-drag] start', panelId, 'from win', sourceWin.id);
});

ipcMain.handle('panel:drag-end', (event) => {
  if (!_panelDragState) return { transferred: false };
  clearInterval(_panelDragState.pollTimer);

  const { screen } = require('electron');
  const pos     = screen.getCursorScreenPoint();
  const srcId   = _panelDragState.sourceWinId;
  const panelId = _panelDragState.panelId;
  _panelDragState = null;

  // Which window is the cursor in right now?
  const wins      = BrowserWindow.getAllWindows();
  const targetWin = wins.find(w => {
    if (w.isDestroyed() || w.id === srcId) return false;
    const b = w.getBounds();
    return pos.x >= b.x && pos.x <= b.x + b.width &&
           pos.y >= b.y && pos.y <= b.y + b.height;
  });

  // Clear drag-over overlays on all windows
  wins.forEach(w => { if (!w.isDestroyed()) w.webContents.send('panel:drag-cursor', null); });

  if (!targetWin) {
    console.log('[panel-drag] dropped in same window — no transfer');
    return { transferred: false };
  }

  console.log('[panel-drag] transferring', panelId, '→ win', targetWin.id);
  targetWin.webContents.send('panel:receive', panelId);
  return { transferred: true, panelId };
});

// Called from the RECEIVING window's overlay click/mouseup.
// The caller IS the target — no cursor-position check needed.
ipcMain.handle('panel:drag-accept', (event) => {
  if (!_panelDragState) return { transferred: false };
  clearInterval(_panelDragState.pollTimer);

  const targetWin = _winFromEvent(event);
  const { panelId, sourceWinId } = _panelDragState;
  _panelDragState = null;

  const wins = BrowserWindow.getAllWindows();
  wins.forEach(w => { if (!w.isDestroyed()) w.webContents.send('panel:drag-cursor', null); });

  if (!targetWin || targetWin.id === sourceWinId) {
    console.log('[panel-drag] drag-accept from same window — no transfer');
    return { transferred: false };
  }

  console.log('[panel-drag] transferring', panelId, '→ win', targetWin.id, '(overlay accept)');
  targetWin.webContents.send('panel:receive', panelId);
  return { transferred: true, panelId };
});

ipcMain.handle('panel:drag-cancel', () => {
  if (!_panelDragState) return;
  clearInterval(_panelDragState.pollTimer);
  _panelDragState = null;
  BrowserWindow.getAllWindows().forEach(w => {
    if (!w.isDestroyed()) w.webContents.send('panel:drag-cursor', null);
  });
});

/* ── Apercu local static server ───────────────────────────────────────────── */
// Serves any local folder on a random port so the Preview iframe can load it.
// The URL is injected into the renderer as window.__apercuServerUrl so agents
// (chat, terminals, split-chat) can reference it.

let _apercuHttpServer  = null;
let _apercuServerUrl   = null;
let _apercuServingDir  = null;

const _MIME = {
  '.html':'text/html', '.htm':'text/html', '.css':'text/css',
  '.js':'application/javascript', '.mjs':'application/javascript',
  '.ts':'application/typescript', '.tsx':'text/tsx', '.jsx':'text/jsx',
  '.json':'application/json', '.svg':'image/svg+xml',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.gif':'image/gif', '.webp':'image/webp', '.ico':'image/x-icon',
  '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf',
  '.mp4':'video/mp4', '.mp3':'audio/mpeg', '.pdf':'application/pdf',
  '.txt':'text/plain', '.md':'text/markdown',
};

function _apercuStopServer() {
  if (_apercuHttpServer) {
    try { _apercuHttpServer.close(); } catch (_) {}
    _apercuHttpServer = null;
    _apercuServerUrl  = null;
    _apercuServingDir = null;
  }
}

function _apercuBroadcast(url, dir) {
  BrowserWindow.getAllWindows().forEach(w => {
    if (!w.isDestroyed()) w.webContents.send('apercu:server-changed', { url, dir });
  });
}

ipcMain.handle('apercu:serve', async (event, folderPath) => {
  const { dialog } = require('electron');
  const http = require('http');
  const path = require('path');
  const fs   = require('fs');

  // SECURITY: never trust a renderer-supplied folder path. The renderer can
  // ASK to open a picker, but the actual folder must be confirmed by the user.
  // This blocks XSS chains from silently exposing arbitrary host paths.
  const win = BrowserWindow.fromWebContents(event.sender);
  const res = await dialog.showOpenDialog(win, {
    title:       'Select folder to serve in Preview',
    defaultPath: folderPath || undefined, // pre-select if renderer suggested one
    properties:  ['openDirectory'],
  });
  if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
  folderPath = res.filePaths[0];

  _apercuStopServer();

  // Realpath the base now so we can compare against realpaths of requested
  // files. This defeats symlink-escape attacks where a symlink inside the
  // served folder points outside it.
  let baseReal;
  try { baseReal = fs.realpathSync(path.resolve(folderPath)); }
  catch (e) { return { ok: false, error: 'Folder not accessible: ' + e.message }; }

  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';

      // Lexical containment check first (cheap)
      const filePath = path.resolve(baseReal, '.' + urlPath);
      if (filePath !== baseReal && !filePath.startsWith(baseReal + path.sep)) {
        res.writeHead(403); res.end('Forbidden'); return;
      }

      const tryFile = (fp, cb) => {
        fs.stat(fp, (err, stat) => {
          if (err)            { cb(null); return; }
          if (stat.isDirectory()) { tryFile(path.join(fp, 'index.html'), cb); return; }
          // Realpath check to follow symlinks — fail if target leaves base
          fs.realpath(fp, (e2, real) => {
            if (e2) { cb(null); return; }
            if (real !== baseReal && !real.startsWith(baseReal + path.sep)) {
              cb(null); return;
            }
            fs.readFile(real, (e3, data) => cb(e3 ? null : { data, fp: real }));
          });
        });
      };

      tryFile(filePath, result => {
        if (!result) { res.writeHead(404, {'Content-Type':'text/plain'}); res.end('Not found'); return; }
        const ext  = path.extname(result.fp).toLowerCase();
        const mime = _MIME[ext] || 'application/octet-stream';
        // No CORS wildcard — only the Aperçu iframe (same loopback origin)
        // should be able to fetch resources. Other browser tabs cannot read.
        res.writeHead(200, {
          'Content-Type':                mime,
          'X-Content-Type-Options':      'nosniff',
          'Cache-Control':               'no-cache',
        });
        res.end(result.data);
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      _apercuHttpServer  = server;
      _apercuServingDir  = folderPath;
      _apercuServerUrl   = `http://localhost:${port}`;
      console.log(`[apercu-server] serving ${folderPath} → ${_apercuServerUrl}`);
      _apercuBroadcast(_apercuServerUrl, folderPath);
      resolve({ ok: true, url: _apercuServerUrl, dir: folderPath, port });
    });

    server.on('error', e => {
      console.error('[apercu-server] error:', e.message);
      resolve({ ok: false, error: e.message });
    });
  });
});

ipcMain.handle('apercu:stop', () => {
  _apercuStopServer();
  _apercuBroadcast(null, null);
  return { ok: true };
});

ipcMain.handle('apercu:status', () => ({
  running: !!_apercuHttpServer,
  url:     _apercuServerUrl,
  dir:     _apercuServingDir,
}));

/* ── Dual-window ───────────────────────────────────────────────────────────── */

function _broadcastRole() {
  BrowserWindow.getAllWindows().forEach(w => {
    if (!w.isDestroyed()) {
      w.webContents.send('window:role-changed', w.id === _primaryWinId ? 'primary' : 'secondary');
    }
  });
}

ipcMain.handle('window:get-role', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win && win.id === _primaryWinId ? 'primary' : 'secondary';
});

ipcMain.handle('window:spawn-secondary', async (event) => {
  // If already open, just focus it
  if (_secondWin && !_secondWin.isDestroyed()) {
    _secondWin.focus();
    return { ok: true, alreadyOpen: true };
  }

  const { screen } = require('electron');
  const displays = screen.getAllDisplays();
  const senderWin = BrowserWindow.fromWebContents(event.sender);
  const currentDisplay = screen.getDisplayMatching(senderWin.getBounds());
  const otherDisplay   = displays.find(d => d.id !== currentDisplay.id) || currentDisplay;
  const { bounds }     = otherDisplay;

  _secondWin = new BrowserWindow({
    x:           bounds.x,
    y:           bounds.y,
    width:       bounds.width,     // fill the entire display — works on 1080p, 2K, 4K
    height:      bounds.height,
    minWidth:    800,
    minHeight:   500,
    frame:       false,
    transparent: false,
    backgroundColor: '#0b0b0c',
    title: 'Claude Code Mods — Secondary',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      spellcheck:       false,
      webSecurity:      process.env.CCM_DEV_INSECURE !== '1',
    },
    show: false,
  });

  const prodUrl = `file://${path.join(__dirname, '../dist/index.html')}`;
  if (isDev) {
    // Reuse same port-scanning logic as main window
    const http = require('http');
    const findVitePort = (ports, cb) => {
      if (!ports.length) return cb(5182);
      const [p, ...rest] = ports;
      const req = http.get(`http://localhost:${p}/`, r => { r.resume(); cb(p); });
      req.on('error', () => findVitePort(rest, cb));
      req.setTimeout(300, () => { req.destroy(); findVitePort(rest, cb); });
    };
    await new Promise(resolve => {
      findVitePort([5182,5183,5184,5185,5186,5187,5188,5189,5190], port => {
        // Guard: window may have been closed before the async port scan finished
        if (_secondWin && !_secondWin.isDestroyed()) {
          _secondWin.loadURL(`http://localhost:${port}`).then(resolve).catch(resolve);
        } else {
          resolve();
        }
      });
    });
  } else {
    await _secondWin.loadURL(prodUrl);
  }
  _secondWin.show();

  // Send role immediately after ready-to-show
  // Broadcast role after app has had time to mount (Vite dev needs ~600ms)
  _secondWin.webContents.once('did-finish-load', () => {
    if (_secondWin && !_secondWin.isDestroyed()) {
      setTimeout(() => _broadcastRole(), 800);
    }
  });

  // Wire window controls IPC for the secondary window too
  _secondWin.on('maximize',   () => _secondWin?.webContents.send('window:maximized'));
  _secondWin.on('unmaximize', () => _secondWin?.webContents.send('window:unmaximized'));
  _secondWin.on('closed', () => {
    _secondWin = null;
    // If secondary was primary, revert to main window
    if (_primaryWinId !== mainWin?.id) {
      _primaryWinId = mainWin?.id;
      _broadcastRole();
    }
  });

  return { ok: true };
});

ipcMain.handle('window:make-primary', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return { ok: false };
  _primaryWinId = win.id;
  _broadcastRole();
  return { ok: true };
});

ipcMain.handle('window:close-secondary', () => {
  if (_secondWin && !_secondWin.isDestroyed()) _secondWin.close();
  return { ok: true };
});

ipcMain.handle('window:has-secondary', () => {
  return !!(_secondWin && !_secondWin.isDestroyed());
});

// ── CLI session tracker (Phase 18) ───────────────────────────────────────
// Surfaces Claude Code CLI sessions (~/.claude/projects/<encoded-cwd>/*.jsonl)
// in CCM's sidebar — a unified session manager across chat + CLI.
const _cliSessionTracker = require('./cli-session-tracker');
ipcMain.handle('cli-sessions:list', (_e, opts = {}) => {
  try { return { ok: true, sessions: _cliSessionTracker.listSessions(opts) }; }
  catch (e) { return { ok: false, error: e.message, sessions: [] }; }
});
ipcMain.handle('cli-sessions:read', (_e, opts = {}) => {
  try { return { ok: true, jsonl: _cliSessionTracker.readSession(opts) }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('cli-sessions:reveal', (_e, opts = {}) => {
  try {
    const p = _cliSessionTracker.sessionPath(opts);
    require('electron').shell.showItemInFolder(p);
    return { ok: true, path: p };
  } catch (e) { return { ok: false, error: e.message }; }
});
// Phase 18b — link/unlink session storage to the project folder
ipcMain.handle('cli-sessions:storage-status', (_e, opts = {}) => {
  try {
    const projectRoot = opts.projectRoot || global._projectCwd || process.cwd();
    return { ok: true, status: _cliSessionTracker.getStorageStatus({ projectRoot }) };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('cli-sessions:link', (_e, opts = {}) => {
  try {
    const projectRoot = opts.projectRoot || global._projectCwd || process.cwd();
    const result = _cliSessionTracker.linkSessionsToProject({ projectRoot, force: !!opts.force });
    return { ok: true, ...result };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('cli-sessions:unlink', (_e, opts = {}) => {
  try {
    const projectRoot = opts.projectRoot || global._projectCwd || process.cwd();
    const result = _cliSessionTracker.unlinkSessionsFromProject({
      projectRoot,
      restoreBackup: !!opts.restoreBackup,
    });
    return { ok: true, ...result };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('terminal:create', (event, { cwd, cols, rows } = {}) => {
  const termId  = _nextTermId++;
  const workDir = cwd || global._projectCwd || APP_ROOT;
  const { cmd, args, fallback } = getShellConfig();
  const pty = getPty();
  const sender = event.sender;

  const send = (channel, payload) => {
    if (!sender.isDestroyed()) sender.send(channel, payload);
  };

  // ── node-pty path (proper PTY — interactive programs work correctly) ──────
  if (pty) {
    const spawnPty = (exe) => pty.spawn(exe, args || [], {
      name: 'xterm-256color',
      cols: cols || 120,
      rows: rows || 30,
      cwd:  workDir,
      env:  { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    });

    let ptyProc;
    try {
      ptyProc = spawnPty(cmd);
    } catch {
      if (fallback) {
        try { ptyProc = spawnPty(fallback); }
        catch (e2) { return { ok: false, error: e2.message }; }
      } else {
        return { ok: false, error: `Could not spawn PTY: ${cmd}` };
      }
    }

    ptyProc.onData(data => send(`terminal:data:${termId}`, data));
    ptyProc.onExit(({ exitCode }) => {
      send(`terminal:exit:${termId}`, exitCode ?? 0);
      terminals.delete(termId);
    });

    terminals.set(termId, { ptyProc, sender, isPty: true });
    return { ok: true, termId, cwd: workDir };
  }

  // ── Fallback: plain child_process.spawn (no PTY — interactive CLIs limited) ─
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

  proc.stdout.on('data', (d) => send(`terminal:data:${termId}`, d.toString('utf8')));
  proc.stderr.on('data', (d) => send(`terminal:data:${termId}`, d.toString('utf8')));
  proc.on('exit', (code) => {
    send(`terminal:exit:${termId}`, code ?? 0);
    terminals.delete(termId);
  });
  proc.on('error', (err) => {
    send(`terminal:data:${termId}`, `\r\n\x1b[31m[shell error: ${err.message}]\x1b[0m\r\n`);
  });

  terminals.set(termId, { proc, sender, isPty: false });
  return { ok: true, termId, cwd: workDir };
});

ipcMain.on('terminal:input', (_, { termId, data }) => {
  const t = terminals.get(termId);
  if (!t) return;
  try {
    if (t.isPty) {
      t.ptyProc.write(data);
    } else {
      t.proc.stdin.write(data);
    }
  } catch { /* process may be closing */ }
});

// Handle PTY resize from renderer (xterm ResizeObserver → fitAddon)
ipcMain.on('terminal:resize', (_, { termId, cols, rows }) => {
  const t = terminals.get(termId);
  if (t?.isPty) {
    try { t.ptyProc.resize(Math.max(2, cols), Math.max(2, rows)); } catch { /**/ }
  }
});

ipcMain.on('terminal:close', (_, termId) => {
  const t = terminals.get(termId);
  if (t) {
    try { t.isPty ? t.ptyProc.kill() : t.proc.kill(); } catch { /* already dead */ }
    terminals.delete(termId);
  }
});
