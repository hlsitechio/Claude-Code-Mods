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
let _browser     = null;  // Puppeteer Browser
let _connectedAt = 0;
let _chromePath  = null;  // resolved path to chrome.exe / Chrome.app / chrome

function profileDir() {
  return path.join(app.getPath('userData'), 'chrome-profile');
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

// ── Launch / connect ───────────────────────────────────────────────────────
async function launch(opts = {}) {
  if (_browser && _browser.isConnected()) {
    return { ok: true, alreadyRunning: true, ...(await status()) };
  }
  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error(
      'Could not find Chrome on this system. Install Chrome from ' +
      'https://www.google.com/chrome or set the path manually via the ' +
      'CCM_CHROME_PATH env var.'
    );
  }

  const dir = profileDir();
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}

  const pup = _puppeteer();
  // Pipe transport beats port — only the parent process (us) can drive Chrome.
  // Headless: default false for interactive use; opts.headless = 'new' for backend tasks.
  _browser = await pup.launch({
    executablePath:    process.env.CCM_CHROME_PATH || chromePath,
    headless:          opts.headless === true ? 'new' : false,
    userDataDir:       dir,
    pipe:              true,  // ← stdio CDP, not localhost port
    defaultViewport:   null,  // use the actual window size
    ignoreDefaultArgs: ['--enable-automation'], // strip the "Chrome is being controlled" infobar
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-blink-features=AutomationControlled', // hide navigator.webdriver
      '--disable-features=Translate', // avoid the Google Translate side panel
      ...(opts.extraArgs || []),
    ],
  });

  _connectedAt = Date.now();

  // Crash recovery — when Chrome disconnects (user closes window, crash, etc),
  // clear our handle so the next call can re-launch cleanly.
  _browser.on('disconnected', () => {
    console.log('[chrome-controller] browser disconnected');
    _browser = null;
  });

  return { ok: true, ...(await status()) };
}

async function close() {
  if (!_browser) return { ok: true, alreadyClosed: true };
  try { await _browser.close(); } catch (_) {}
  _browser = null;
  return { ok: true };
}

async function status() {
  if (!_browser || !_browser.isConnected()) {
    return { running: false, chromePath: findChrome(), profileDir: profileDir() };
  }
  let version = null;
  try { version = await _browser.version(); } catch (_) {}
  const pages = await _browser.pages();
  return {
    running:      true,
    version,
    pid:          _browser.process()?.pid || null,
    profileDir:   profileDir(),
    chromePath:   _chromePath,
    connectedAt:  _connectedAt,
    pageCount:    pages.length,
    activePageId: (await _activePage())?.target()._targetId || null,
  };
}

async function _ensureBrowser() {
  if (!_browser || !_browser.isConnected()) {
    await launch();
  }
  return _browser;
}

// Most operations target the "active" page — what the user last opened or
// brought to the front. If there are no pages yet, we open about:blank.
async function _activePage() {
  const browser = await _ensureBrowser();
  const pages = await browser.pages();
  if (!pages.length) return browser.newPage();
  // Puppeteer doesn't expose "focused tab" cleanly; the last opened is the
  // best heuristic since Chrome adds new tabs at the end + brings them front.
  return pages[pages.length - 1];
}

async function _pageById(targetId) {
  const browser = await _ensureBrowser();
  const pages = await browser.pages();
  return pages.find(p => p.target()._targetId === targetId) || null;
}

// ── Target / tab operations ────────────────────────────────────────────────
async function targetList() {
  const browser = await _ensureBrowser();
  const pages   = await browser.pages();
  const out = [];
  for (const p of pages) {
    out.push({
      id:    p.target()._targetId,
      url:   p.url(),
      title: await p.title().catch(() => ''),
      type:  p.target().type(),
    });
  }
  return { tabs: out, count: out.length };
}

async function targetNewTab({ url } = {}) {
  const browser = await _ensureBrowser();
  const page = await browser.newPage();
  if (url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  return {
    ok:    true,
    id:    page.target()._targetId,
    url:   page.url(),
    title: await page.title().catch(() => ''),
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

module.exports = {
  // Lifecycle
  launch, close, status,
  findChrome, profileDir,

  // Target
  targetList, targetNewTab, targetCloseTab, targetActivateTab,

  // Page
  pageNavigate, pageReload, pageScreenshot, pagePdf, pageWaitForLoad,

  // Runtime
  runtimeEval,

  // DOM
  domQuery, domQueryAll, domGetText,

  // Input
  inputClick, inputType, inputKey, inputScroll,

  // Generic
  cdpRaw,
};
