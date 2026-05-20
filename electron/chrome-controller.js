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
  runtimeEval,
  domQuery, domQueryAll, domGetText,
  inputClick, inputType, inputKey, inputScroll,
  cdpRaw,

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
};
