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

// CDP endpoint the embedded Chromium exposes (set by main.js's command-line
// switch). We connect here instead of launching a separate Chrome process —
// so the `chrome_*` tools drive the SAME WebContentsView the user sees.
const CDP_ENDPOINT = process.env.CCM_CDP_ENDPOINT || 'http://127.0.0.1:9222';

function profileDir() {
  return path.join(app.getPath('userData'), 'chrome-profile');
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
// browsing, then pick the last one (most recently opened/active).
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
  // Prefer the most recently opened — usually the active tab in the panel
  return browseable[browseable.length - 1];
}

async function _pageById(targetId) {
  const browser = await _ensureBrowser();
  const pages = await browser.pages();
  return pages.find(p => p.target()._targetId === targetId) || null;
}

// ── Target / tab operations ────────────────────────────────────────────────
// targetList returns ONLY browser-panel tabs, filtered to exclude the CCM
// app UI and other Electron internals.
async function targetList() {
  const browser = await _ensureBrowser();
  const pages   = await browser.pages();
  const out = [];
  for (const p of pages) {
    const url = p.url();
    if (!_isBrowserableUrl(url)) continue;
    out.push({
      id:    p.target()._targetId,
      url,
      title: await p.title().catch(() => ''),
      type:  p.target().type(),
    });
  }
  return { tabs: out, count: out.length };
}

async function targetNewTab({ url } = {}) {
  // When attached to Electron we can't "open a new tab" the way real Chrome
  // does — Electron's dockview owns tab lifecycle. Best we can do is
  // navigate the active panel to the given URL, OR ask the renderer (via a
  // future bridge) to create a new browser-panel tab. For now we navigate.
  if (!url) throw new Error('url required (cannot create new tabs from CDP in attached mode — open one in CCM\'s Browser panel first)');
  const page = await _activePage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  return {
    ok:    true,
    id:    page.target()._targetId,
    url:   page.url(),
    title: await page.title().catch(() => ''),
    note:  'Navigated active browser-panel tab. Use the CCM panel UI to open NEW tabs.',
  };
}

async function targetCloseTab({ id } = {}) {
  const page = id ? await _pageById(id) : await _activePage();
  if (!page) return { ok: false, error: 'Tab not found' };
  await page.close();
  return { ok: true };
}

async function targetActivateTab({ id } = {}) {
  const page = id ? await _pageById(id) : null;
  if (!page) return { ok: false, error: 'Tab not found' };
  await page.bringToFront();
  return { ok: true, id, url: page.url() };
}

// ── Page operations ────────────────────────────────────────────────────────
async function pageNavigate({ url, waitUntil = 'load', timeout = 30000 } = {}) {
  if (!url) throw new Error('url required');
  const page = await _activePage();
  const resp = await page.goto(url, { waitUntil, timeout });
  return {
    ok:     true,
    url:    page.url(),
    title:  await page.title().catch(() => ''),
    status: resp?.status() || null,
  };
}

async function pageReload({ waitUntil = 'load', timeout = 30000 } = {}) {
  const page = await _activePage();
  await page.reload({ waitUntil, timeout });
  return { ok: true, url: page.url() };
}

async function pageScreenshot({ fullPage = false, quality = 75 } = {}) {
  const page = await _activePage();
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

async function pagePdf({ landscape = false, printBackground = true } = {}) {
  const page = await _activePage();
  const buf = await page.pdf({ landscape, printBackground });
  return {
    base64:    buf.toString('base64'),
    mediaType: 'application/pdf',
    url:       page.url(),
  };
}

async function pageWaitForLoad({ timeout = 30000 } = {}) {
  const page = await _activePage();
  await page.waitForNavigation({ timeout, waitUntil: 'load' }).catch(() => {});
  return { ok: true, url: page.url() };
}

// ── Runtime — the swiss army knife ─────────────────────────────────────────
async function runtimeEval({ expression, awaitPromise = true } = {}) {
  if (!expression) throw new Error('expression required');
  const page = await _activePage();
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
async function runtimeRun({ code } = {}) {
  if (!code) throw new Error('code (statement block) required');
  const page = await _activePage();
  try {
    const result = await page.evaluate(`(async () => { ${code} })()`);
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── DOM ────────────────────────────────────────────────────────────────────
async function domQuery({ selector } = {}) {
  if (!selector) throw new Error('selector required');
  const page = await _activePage();
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

async function domQueryAll({ selector, limit = 50 } = {}) {
  if (!selector) throw new Error('selector required');
  const page = await _activePage();
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

async function domGetText({ selector } = {}) {
  if (!selector) throw new Error('selector required');
  const page = await _activePage();
  return page.evaluate(sel => {
    const el = document.querySelector(sel);
    return el ? (el.innerText || el.textContent || '') : null;
  }, selector);
}

// ── Input ──────────────────────────────────────────────────────────────────
async function inputClick({ selector, x, y } = {}) {
  const page = await _activePage();
  if (selector) {
    await page.click(selector);
    return { ok: true, clicked: 'selector', target: selector };
  }
  if (typeof x === 'number' && typeof y === 'number') {
    await page.mouse.click(x, y);
    return { ok: true, clicked: 'coords', x, y };
  }
  throw new Error('selector or {x,y} required');
}

async function inputType({ selector, text, delay = 20 } = {}) {
  if (typeof text !== 'string') throw new Error('text required');
  const page = await _activePage();
  if (selector) await page.focus(selector);
  await page.keyboard.type(text, { delay });
  return { ok: true, typed: text.length + ' chars' };
}

async function inputKey({ key, modifiers = [] } = {}) {
  if (!key) throw new Error('key required');
  const page = await _activePage();
  for (const m of modifiers) await page.keyboard.down(m);
  await page.keyboard.press(key);
  for (const m of modifiers.slice().reverse()) await page.keyboard.up(m);
  return { ok: true };
}

async function inputScroll({ amount = 600, direction = 'down' } = {}) {
  const page = await _activePage();
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
async function domClick({ selector } = {}) {
  if (!selector) throw new Error('selector required');
  const page = await _activePage();
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
async function cmGotoLine({ line } = {}) {
  if (typeof line !== 'number' || line < 1) throw new Error('line (positive integer) required');
  const focusResult = await cmFocus();
  if (!focusResult.ok) return focusResult;
  const page = await _activePage();
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
async function cmReplaceLine({ line, content, save = true } = {}) {
  if (typeof line !== 'number' || line < 1) throw new Error('line (positive integer) required');
  if (typeof content !== 'string') throw new Error('content (replacement string) required');
  const page = await _activePage();
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

// ── Generic CDP escape hatch ───────────────────────────────────────────────
// Lets Claude (or the user) call ANY CDP method without us having to wrap it.
// We don't allowlist methods — the caller has already authenticated to the
// HTTP server with the bearer token, so they can do anything the browser
// can do. Safety relies on the auth boundary, not method allowlisting.
async function cdpRaw({ method, params = {}, sessionId } = {}) {
  if (!method) throw new Error('method required (e.g. "Page.captureScreenshot")');
  const page = await _activePage();
  const session = sessionId
    ? await page.target().createCDPSession() // user wants a fresh session
    : await page.target().createCDPSession();
  try {
    const result = await session.send(method, params);
    return { ok: true, result };
  } finally {
    try { await session.detach(); } catch (_) {}
  }
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
async function consoleGetRecent({ limit = 100, clear = false } = {}) {
  const page = await _activePage();
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
  if (!_browser || !_browser.isConnected()) {
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

  // Phase 8 — CodeMirror primitives
  cmFocus, cmGotoLine, cmReplaceLine,

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
