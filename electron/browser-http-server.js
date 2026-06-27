'use strict';

/**
 * browser-http-server.js
 * ──────────────────────
 * A tiny HTTP server in the Electron main process that exposes the
 * `global.ccmBrowser` operator API to local child processes via JSON.
 *
 * The MCP bridge (bin/browser-mcp.mjs) is spawned by Claude Code CLI on
 * demand; it speaks the MCP JSON-RPC protocol over stdio to Claude and
 * forwards every browser_* tool call to THIS server via HTTP.
 *
 * Bind: 127.0.0.1 only — no remote access ever.
 * Auth: bearer token rotated on every Electron boot.
 * Port: 0 (random, free) — written to a known file so the child can find it.
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const crypto = require('crypto');

// Public so main.js can clean up on quit.
let _server = null;
let _endpointFile = null;
let _token = null;
let _port = null;

// We persist the {url, token, pid, slot} envelope here so spawned MCP children
// can read it deterministically. Lives in the user's Claude config dir — same
// place Claude Code looks for its own settings — so the child can locate it
// without knowing about our Electron userData path.
//
// Phase 10 — multi-slot:
//   slot 1 (default) → ccm-browser-endpoint.json   (backward compat)
//   slot N >= 2      → ccm-browser-endpoint-N.json
function endpointFilePath(slot = 1) {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const dir  = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  const fname = slot === 1
    ? 'ccm-browser-endpoint.json'
    : `ccm-browser-endpoint-${slot}.json`;
  return path.join(dir, fname);
}

function _sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Content-Length':              Buffer.byteLength(body),
    'X-Content-Type-Options':      'nosniff',
    // No CORS — only same-process child should hit us.
  });
  res.end(body);
}

function _readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', c => {
      total += c.length;
      // 5 MB hard cap so a runaway client can't OOM the main process
      if (total > 5 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Body too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

async function _handle(req, res) {
  // Hard guard: only 127.0.0.1 connections, only POST, only known routes.
  if (req.socket.remoteAddress !== '127.0.0.1' && req.socket.remoteAddress !== '::1' && req.socket.remoteAddress !== '::ffff:127.0.0.1') {
    return _sendJson(res, 403, { error: 'Forbidden' });
  }
  // DNS-rebinding defense: a malicious site could lure the user to attacker.com,
  // CNAME-flip the resolver to 127.0.0.1, and POST through the victim's browser.
  // The bearer token already defeats this (attacker has no token), but explicit
  // Host-header allowlisting closes the door even if the token ever leaks.
  const host = (req.headers.host || '').toLowerCase().split(':')[0];
  if (host && host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') {
    return _sendJson(res, 403, { error: 'Forbidden (bad host)' });
  }
  // Bearer token check — constant-time compare to defeat timing oracles.
  const auth = req.headers.authorization || '';
  const expected = 'Bearer ' + _token;
  if (
    auth.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
  ) {
    return _sendJson(res, 401, { error: 'Unauthorized' });
  }

  // Health probe — used by the MCP child to confirm the server is alive
  // before announcing tool availability to Claude.
  if (req.method === 'GET' && req.url === '/health') {
    return _sendJson(res, 200, { ok: true, version: 1, pid: process.pid });
  }

  // ── Extension companion endpoints ──────────────────────────────────────
  // The MV3 companion extension polls /ext/poll for jobs and POSTs back to
  // /ext/result. Same bearer auth as the rest.
  if (req.method === 'POST' && req.url === '/ext/poll') {
    const chrome = global.ccmChrome;
    if (!chrome) return _sendJson(res, 503, { error: 'ccmChrome unavailable' });
    const job = chrome.extPollNext();
    return _sendJson(res, 200, job || {});
  }
  if (req.method === 'POST' && req.url === '/ext/result') {
    let body;
    try { body = await _readBody(req); }
    catch (e) { return _sendJson(res, 400, { error: 'Bad JSON' }); }
    const chrome = global.ccmChrome;
    if (chrome) chrome.extReceiveResult(body || {});
    return _sendJson(res, 200, { ok: true });
  }

  if (req.method !== 'POST' || !req.url.startsWith('/op/')) {
    return _sendJson(res, 404, { error: 'Not found' });
  }

  const op = global.ccmBrowser;
  if (!op) return _sendJson(res, 503, { error: 'ccmBrowser unavailable' });

  let body;
  try { body = await _readBody(req); }
  catch (e) { return _sendJson(res, 400, { error: 'Bad JSON: ' + e.message }); }

  const cmd = req.url.slice(4); // strip "/op/"
  const t0 = Date.now();
  // Profile ops route through global.ccmBrowserProfile — same auth, same path.
  const profile = global.ccmBrowserProfile;
  // Chrome (real Chrome via CDP) ops route through global.ccmChrome.
  const chrome  = global.ccmChrome;
  // Phase 7 — closed-Chrome file/registry editors.
  const chromeFiles = global.ccmChromeFiles;
  // Phase 25b — Director + kanban app-control surface.
  const team = () => {
    if (!global.ccmTeam) throw new Error('Team control unavailable (app still starting?)');
    return global.ccmTeam;
  };
  // Phase 27 — cross-LLM media generation surface.
  const media = () => {
    if (!global.ccmMedia) throw new Error('Media generation unavailable (app still starting?)');
    return global.ccmMedia;
  };
  try {
    let result;
    switch (cmd) {
      // ── Browser ────────────────────────────────────────────
      case 'get-state':     result = op.getActiveTab() || { error: 'No browser tab is open' }; break;
      case 'navigate':      result = await op.navigate(body.url); break;
      case 'read-page':     result = await op.readPage({ maxChars: body.max_chars }); break;
      case 'get-elements':  result = await op.getElements({ limit: body.limit }); break;
      case 'click':         result = await op.click(body); break;
      case 'type':          result = await op.type(body); break;
      case 'screenshot':    result = await op.screenshot({ quality: body.quality }); break;
      case 'scroll':        result = await op.scroll(body); break;
      case 'nav':           result = await op.nav(body.action); break;

      // ── Profile · bookmarks ────────────────────────────────
      case 'profile-bookmark-list':   result = profile.listBookmarks(body); break;
      case 'profile-bookmark-add':    result = profile.addBookmark(body); break;
      case 'profile-bookmark-remove': result = profile.removeBookmark(body); break;
      case 'profile-bookmark-search': result = profile.searchBookmarks(body.query); break;

      // ── Profile · history ──────────────────────────────────
      case 'profile-history-recent':  result = profile.historyRecent(body.limit); break;
      case 'profile-history-search':  result = profile.searchHistory(body.query, body); break;
      case 'profile-history-clear':   result = profile.clearHistory(body); break;

      // ── Profile · notes (per-URL) ──────────────────────────
      case 'profile-note-get':        result = profile.getNote(body.url); break;
      case 'profile-note-set':        result = profile.setNote(body); break;
      case 'profile-note-search':     result = profile.searchNotes(body.query); break;

      // ── Profile · prefs ────────────────────────────────────
      case 'profile-pref-get':        result = profile.getPref(body.key); break;
      case 'profile-pref-set':        result = profile.setPref(body.key, body.value); break;
      case 'profile-pref-list':       result = profile.listPrefs(); break;

      // ── Profile · readlist ─────────────────────────────────
      case 'profile-readlist-add':    result = profile.readlistAdd(body); break;
      case 'profile-readlist-list':   result = profile.readlistList(body); break;
      case 'profile-readlist-done':   result = profile.readlistDone(body); break;

      // ── Profile · summary ──────────────────────────────────
      case 'profile-summary':         result = profile.summary(); break;

      // ─────────────────────────────────────────────────────────
      // CHROME (real Chrome via CDP)
      // ─────────────────────────────────────────────────────────
      // Lifecycle
      case 'chrome-launch':              result = await chrome.launch(body); break;
      case 'chrome-close':               result = await chrome.close(); break;
      case 'chrome-status':              result = await chrome.status(); break;

      // Target / tabs
      case 'chrome-target-list':         result = await chrome.targetList(); break;
      case 'chrome-target-new-tab':      result = await chrome.targetNewTab(body); break;
      case 'chrome-target-close-tab':    result = await chrome.targetCloseTab(body); break;
      case 'chrome-target-activate-tab': result = await chrome.targetActivateTab(body); break;

      // Page
      case 'chrome-page-navigate':       result = await chrome.pageNavigate(body); break;
      case 'chrome-page-reload':         result = await chrome.pageReload(body); break;
      case 'chrome-page-screenshot':     result = await chrome.pageScreenshot(body); break;
      case 'chrome-page-pdf':            result = await chrome.pagePdf(body); break;
      case 'chrome-page-wait-load':      result = await chrome.pageWaitForLoad(body); break;

      // Runtime
      case 'chrome-runtime-eval':        result = await chrome.runtimeEval(body); break;
      case 'chrome-runtime-run':         result = await chrome.runtimeRun(body); break;

      // DOM
      case 'chrome-dom-query':           result = await chrome.domQuery(body); break;
      case 'chrome-dom-query-all':       result = await chrome.domQueryAll(body); break;
      case 'chrome-dom-get-text':        result = await chrome.domGetText(body); break;
      case 'chrome-dom-click':           result = await chrome.domClick(body); break;

      // Phase 8 — CodeMirror primitives
      case 'chrome-cm-focus':            result = await chrome.cmFocus(); break;
      case 'chrome-cm-goto-line':        result = await chrome.cmGotoLine(body); break;
      case 'chrome-cm-replace-line':     result = await chrome.cmReplaceLine(body); break;

      // Phase 9 — multi-file batch, open-at-line, picker, save-survivor
      case 'chrome-cm-ensure-editor':    result = await chrome.cmEnsureEditor(); break;
      case 'chrome-cm-open-at-line':     result = await chrome.cmOpenAtLine(body); break;
      case 'chrome-cm-edit-atomic':      result = await chrome.cmEditAtomic(body); break;
      case 'chrome-picker-install':      result = await chrome.pickerInstall(); break;
      case 'chrome-picker-capture':      result = await chrome.pickerCapture(body); break;
      case 'chrome-picker-cancel':       result = await chrome.pickerCancel(); break;

      // Phase 15 — split-view state (which CDP target = left/right pane)
      case 'chrome-split-state':         result = await chrome.splitState(); break;

      // Phase 16 — Claude controls the split layout itself
      case 'chrome-split-enable':        result = await chrome.splitEnable(body); break;
      case 'chrome-split-disable':       result = await chrome.splitDisable(); break;
      case 'chrome-split-swap':          result = await chrome.splitSwap(); break;
      case 'chrome-split-set-ratio':     result = await chrome.splitSetRatio(body); break;

      // Input
      case 'chrome-input-click':         result = await chrome.inputClick(body); break;
      case 'chrome-input-type':          result = await chrome.inputType(body); break;
      case 'chrome-input-key':           result = await chrome.inputKey(body); break;
      case 'chrome-input-scroll':        result = await chrome.inputScroll(body); break;

      // Generic CDP escape hatch
      case 'chrome-cdp-raw':             result = await chrome.cdpRaw(body); break;

      // Phase 11 — semantic observation + ref-based actions.
      case 'chrome-observe':             result = await chrome.observe(body); break;
      case 'chrome-observe-delta':       result = await chrome.observeDelta(body); break;
      case 'chrome-click-ref':           result = await chrome.clickRef(body); break;
      case 'chrome-type-ref':            result = await chrome.typeRef(body); break;
      case 'chrome-focus-ref':           result = await chrome.focusRef(body); break;
      case 'chrome-stabilize':           result = await chrome.stabilize(body); break;
      case 'chrome-step':                result = await chrome.step(body); break;

      // Cross-origin frame (OOPIF) access — 3DS, reCAPTCHA, embedded auth.
      case 'chrome-frame-list':          result = await chrome.frameList(); break;
      case 'chrome-frame-attach':        result = await chrome.frameAttach(body); break;
      case 'chrome-frame-detach':        result = await chrome.frameDetach(body); break;
      case 'chrome-frame-eval':          result = await chrome.frameEval(body); break;
      case 'chrome-frame-click':         result = await chrome.frameClick(body); break;
      case 'chrome-frame-type':          result = await chrome.frameType(body); break;

      // ── Phase 2 · Network ────────────────────────────────────
      case 'chrome-net-cookies-get':       result = await chrome.networkGetCookies(body); break;
      case 'chrome-net-cookie-set':        result = await chrome.networkSetCookie(body); break;
      case 'chrome-net-cookies-delete':    result = await chrome.networkDeleteCookies(body); break;
      case 'chrome-net-cookies-clear-all': result = await chrome.networkClearAllCookies(); break;
      case 'chrome-net-extra-headers':     result = await chrome.networkSetExtraHeaders(body); break;
      case 'chrome-net-block-urls':        result = await chrome.networkSetBlockedURLs(body); break;
      case 'chrome-net-user-agent':        result = await chrome.networkSetUserAgent(body); break;

      // ── Phase 2 · Storage ────────────────────────────────────
      case 'chrome-storage-clear-origin':  result = await chrome.storageClearForOrigin(body); break;
      case 'chrome-storage-usage':         result = await chrome.storageGetUsage(body); break;
      case 'chrome-storage-cookies':       result = await chrome.storageGetCookies(body); break;
      case 'chrome-domstorage-get':        result = await chrome.domStorageGetItems(body); break;
      case 'chrome-domstorage-set':        result = await chrome.domStorageSetItem(body); break;
      case 'chrome-domstorage-remove':     result = await chrome.domStorageRemoveItem(body); break;
      case 'chrome-domstorage-clear':      result = await chrome.domStorageClear(body); break;
      case 'chrome-idb-list':              result = await chrome.indexedDbList(body); break;
      case 'chrome-idb-delete':            result = await chrome.indexedDbDelete(body); break;
      case 'chrome-cache-list':            result = await chrome.cacheList(body); break;
      case 'chrome-cache-delete':          result = await chrome.cacheDelete(body); break;

      // ── Phase 2 · Emulation ──────────────────────────────────
      case 'chrome-emulate-ua':            result = await chrome.emulateUserAgent(body); break;
      case 'chrome-emulate-geo':           result = await chrome.emulateGeolocation(body); break;
      case 'chrome-emulate-geo-clear':     result = await chrome.emulateClearGeolocation(); break;
      case 'chrome-emulate-timezone':      result = await chrome.emulateTimezone(body); break;
      case 'chrome-emulate-locale':        result = await chrome.emulateLocale(body); break;
      case 'chrome-emulate-device':        result = await chrome.emulateDevice(body); break;
      case 'chrome-emulate-device-clear':  result = await chrome.emulateClearDevice(); break;
      case 'chrome-emulate-color-scheme':  result = await chrome.emulateColorScheme(body); break;
      case 'chrome-emulate-network':       result = await chrome.emulateNetwork(body); break;
      case 'chrome-emulate-cpu':           result = await chrome.emulateCpuThrottle(body); break;
      case 'chrome-emulate-vision':        result = await chrome.emulateVisionDeficiency(body); break;

      // ── Phase 3 · Extensions / Autofill / WebAuthn ───────────
      case 'chrome-ext-load-unpacked':     result = await chrome.extensionsLoadUnpacked(body); break;
      case 'chrome-ext-uninstall':         result = await chrome.extensionsUninstall(body); break;
      case 'chrome-autofill-trigger':      result = await chrome.autofillTrigger(body); break;
      case 'chrome-autofill-set-addr':     result = await chrome.autofillSetAddresses(body); break;
      case 'chrome-webauthn-enable':       result = await chrome.webauthnEnable(); break;
      case 'chrome-webauthn-add':          result = await chrome.webauthnAddAuthenticator(body); break;
      case 'chrome-webauthn-remove':       result = await chrome.webauthnRemoveAuthenticator(body); break;
      case 'chrome-webauthn-creds':        result = await chrome.webauthnGetCredentials(body); break;
      case 'chrome-webauthn-clear-creds':  result = await chrome.webauthnClearCredentials(body); break;
      case 'chrome-webauthn-verify':       result = await chrome.webauthnSetUserVerified(body); break;

      // ── Phase 4 · Fetch / Console / A11y / CSS ───────────────
      case 'chrome-fetch-enable':          result = await chrome.fetchEnable(body); break;
      case 'chrome-fetch-disable':         result = await chrome.fetchDisable(); break;
      case 'chrome-fetch-pending':         result = await chrome.fetchListPending(); break;
      case 'chrome-fetch-continue':        result = await chrome.fetchContinue(body); break;
      case 'chrome-fetch-fail':            result = await chrome.fetchFail(body); break;
      case 'chrome-fetch-fulfill':         result = await chrome.fetchFulfill(body); break;
      case 'chrome-console-subscribe':     result = await chrome.consoleSubscribe(); break;
      case 'chrome-console-recent':        result = await chrome.consoleGetRecent(body); break;
      case 'chrome-a11y-enable':           result = await chrome.a11yEnable(); break;
      case 'chrome-a11y-tree':             result = await chrome.a11yGetFullTree(); break;
      case 'chrome-a11y-query':            result = await chrome.a11yQueryByRole(body); break;
      case 'chrome-css-computed':          result = await chrome.cssGetComputed(body); break;
      case 'chrome-css-matched':           result = await chrome.cssGetMatched(body); break;

      // ── Phase 5 · Perf / Security / SW / Browser ─────────────
      case 'chrome-perf-metrics':          result = await chrome.perfGetMetrics(); break;
      case 'chrome-perf-cpu-start':        result = await chrome.perfStartCpuProfile(); break;
      case 'chrome-perf-cpu-stop':         result = await chrome.perfStopCpuProfile(); break;
      case 'chrome-perf-trace-start':      result = await chrome.perfStartTrace(body); break;
      case 'chrome-perf-trace-stop':       result = await chrome.perfStopTrace(); break;
      case 'chrome-security-status':       result = await chrome.securityGetStatus(); break;
      case 'chrome-sw-enable':             result = await chrome.swEnable(); break;
      case 'chrome-sw-unregister':         result = await chrome.swUnregister(body); break;
      case 'chrome-sw-stop':               result = await chrome.swStop(body); break;
      case 'chrome-browser-grant-perms':   result = await chrome.browserGrantPermissions(body); break;
      case 'chrome-browser-reset-perms':   result = await chrome.browserResetPermissions(body); break;
      case 'chrome-browser-downloads':     result = await chrome.browserSetDownloadBehavior(body); break;

      // ── Convenience ──────────────────────────────────────────
      case 'chrome-open-internal':         result = await chrome.openInternalPage(body); break;

      // ── Phase 7 · Closed-Chrome file/registry editors ──
      case 'chrome-files-info':            result = await chromeFiles.profileInfo(); break;
      case 'chrome-flags-list':            result = await chromeFiles.flagsList(); break;
      case 'chrome-flags-set':             result = await chromeFiles.flagsSet(body); break;
      case 'chrome-prefs-get':             result = await chromeFiles.prefsGet(body); break;
      case 'chrome-prefs-set':             result = await chromeFiles.prefsSet(body); break;
      case 'chrome-prefs-list':            result = await chromeFiles.prefsListTopLevel(); break;
      case 'chrome-bookmarks-json-read':   result = await chromeFiles.bookmarksJsonRead(); break;
      case 'chrome-bookmarks-json-write':  result = await chromeFiles.bookmarksJsonWrite(body); break;
      case 'chrome-policy-list':           result = await chromeFiles.policyList(); break;
      case 'chrome-policy-set':            result = await chromeFiles.policySet(body); break;
      case 'chrome-policy-delete':         result = await chromeFiles.policyDelete(body); break;

      // ── Phase 6 · Extension API bridge (chrome.* APIs CDP can't reach)
      // Tab groups
      case 'chrome-ext-tabgroups-query':   result = await chrome.tabGroupsQuery(body); break;
      case 'chrome-ext-tabgroups-update':  result = await chrome.tabGroupsUpdate(body); break;
      case 'chrome-ext-tabs-group':        result = await chrome.tabsGroup(body); break;
      case 'chrome-ext-tabs-ungroup':      result = await chrome.tabsUngroup(body); break;
      // Sessions
      case 'chrome-ext-sessions-recent':   result = await chrome.sessionsRecent(body); break;
      case 'chrome-ext-sessions-restore':  result = await chrome.sessionsRestore(body); break;
      // Reading list
      case 'chrome-ext-readlist-query':    result = await chrome.readingListQuery(body); break;
      case 'chrome-ext-readlist-add':      result = await chrome.readingListAdd(body); break;
      case 'chrome-ext-readlist-remove':   result = await chrome.readingListRemove(body); break;
      // History (Chrome's own)
      case 'chrome-ext-history-search':    result = await chrome.chromeHistorySearch(body); break;
      case 'chrome-ext-history-del-url':   result = await chrome.chromeHistoryDeleteUrl(body); break;
      case 'chrome-ext-history-del-all':   result = await chrome.chromeHistoryDeleteAll(); break;
      // Bookmarks (Chrome's own)
      case 'chrome-ext-bookmarks-tree':    result = await chrome.chromeBookmarksTree(); break;
      case 'chrome-ext-bookmarks-search':  result = await chrome.chromeBookmarksSearch(body); break;
      case 'chrome-ext-bookmarks-create':  result = await chrome.chromeBookmarksCreate(body); break;
      case 'chrome-ext-bookmarks-remove':  result = await chrome.chromeBookmarksRemove(body); break;
      // Downloads
      case 'chrome-ext-downloads-search':  result = await chrome.downloadsSearch(body); break;
      case 'chrome-ext-downloads-start':   result = await chrome.downloadsDownload(body); break;
      case 'chrome-ext-downloads-cancel':  result = await chrome.downloadsCancel(body); break;
      case 'chrome-ext-downloads-open':    result = await chrome.downloadsOpen(body); break;
      // Management (other extensions)
      case 'chrome-ext-mgmt-list':         result = await chrome.managementGetAll(); break;
      case 'chrome-ext-mgmt-enable':       result = await chrome.managementSetEnabled(body); break;
      case 'chrome-ext-mgmt-uninstall':    result = await chrome.managementUninstall(body); break;
      // declarativeNetRequest
      case 'chrome-ext-dnr-update':        result = await chrome.dnrUpdateDynamic(body); break;
      case 'chrome-ext-dnr-list':          result = await chrome.dnrGetDynamic(); break;
      // Search
      case 'chrome-ext-search':            result = await chrome.searchQuery(body); break;
      // System
      case 'chrome-ext-system-cpu':        result = await chrome.systemCpu(); break;
      case 'chrome-ext-system-memory':     result = await chrome.systemMemory(); break;
      case 'chrome-ext-system-display':    result = await chrome.systemDisplay(); break;
      case 'chrome-ext-system-storage':    result = await chrome.systemStorage(); break;
      // Top sites
      case 'chrome-ext-top-sites':         result = await chrome.topSites(); break;
      // Notifications
      case 'chrome-ext-notify':            result = await chrome.notifyCreate(body); break;

      // ── Phase 25b · Director + kanban (app control, not browser) ───────────
      // Routed to global.ccmTeam so a Director-Claude can drive the team over
      // the same MCP it uses for the browser.
      case 'team-list':         result = team().teamList(); break;
      case 'team-spawn':        result = team().teamSpawn(); break;
      case 'kanban-read':       result = team().kanbanRead(); break;
      case 'kanban-add':        result = team().kanbanAdd(body); break;
      case 'kanban-update':     result = team().kanbanUpdate(body); break;
      case 'kanban-move':       result = team().kanbanMove(body); break;
      case 'kanban-delete':     result = team().kanbanDelete(body); break;
      case 'director-plan':     result = team().directorPlan(body); break;
      case 'director-status':   result = team().directorStatus(); break;
      case 'director-next':     result = team().directorNext(); break;
      case 'director-review':   result = team().directorReview(); break;
      case 'director-approve':  result = team().directorApprove(body); break;
      case 'director-reject':   result = team().directorReject(body); break;
      case 'agent-send':        result = team().agentSend(body); break;

      // ── Phase 27 · Media generation (Imagen / Veo / GPT) ───────────────────
      case 'imagen-generate':   result = await media().imagenGenerate(body); break;
      case 'veo-generate':      result = await media().veoGenerate(body); break;
      case 'veo-status':        result = await media().veoStatus(body); break;
      case 'gpt-ask':           result = await media().gptAsk(body); break;
      case 'media-status':      result = media().mediaStatus(); break;

      default:              return _sendJson(res, 404, { error: 'Unknown op: ' + cmd });
    }
    const ms = Date.now() - t0;
    // Tag slow operations so we know what to optimize next. 50ms threshold
    // catches anything beyond the noise floor of IPC + executeJavaScript.
    if (ms > 50) console.log(`[browser-http] ${cmd} ${ms}ms`);
    return _sendJson(res, 200, { ok: true, result });
  } catch (e) {
    const ms = Date.now() - t0;
    console.warn(`[browser-http] ${cmd} FAILED ${ms}ms — ${e.message}`);
    return _sendJson(res, 200, { ok: false, error: e.message });
  }
}

/**
 * Start the HTTP control server on a random localhost port and persist
 * its endpoint + auth token to disk so child processes can find it.
 * Idempotent — calling twice is a no-op.
 */
function startBrowserHttpServer({ slot = 1 } = {}) {
  if (_server) return { port: _port, token: _token, slot };

  _token = crypto.randomBytes(24).toString('hex');
  _server = http.createServer((req, res) => {
    _handle(req, res).catch(err => {
      console.error('[browser-http] handler error:', err);
      try { _sendJson(res, 500, { error: 'Internal error' }); } catch (_) {}
    });
  });

  return new Promise((resolve) => {
    _server.listen(0, '127.0.0.1', () => {
      _port = _server.address().port;
      _endpointFile = endpointFilePath(slot);

      const envelope = {
        url:     `http://127.0.0.1:${_port}`,
        token:   _token,
        pid:     process.pid,
        slot,
        cdpPort: 9222 + (slot - 1),
        started: new Date().toISOString(),
      };
      try {
        fs.mkdirSync(path.dirname(_endpointFile), { recursive: true });
        // 0o600 — only the owner can read the token.
        fs.writeFileSync(_endpointFile, JSON.stringify(envelope, null, 2), { mode: 0o600 });
      } catch (e) {
        console.warn('[browser-http] could not write endpoint file:', e.message);
      }

      console.log(`[browser-http] listening on 127.0.0.1:${_port}  endpoint → ${_endpointFile}`);
      resolve({ port: _port, token: _token });
    });

    _server.on('error', (err) => {
      console.error('[browser-http] server error:', err);
    });
  });
}

function stopBrowserHttpServer() {
  if (_endpointFile) {
    try { fs.unlinkSync(_endpointFile); } catch (_) {}
    _endpointFile = null;
  }
  if (_server) {
    try { _server.close(); } catch (_) {}
    _server = null;
  }
  _token = null;
  _port = null;
}

module.exports = {
  startBrowserHttpServer,
  stopBrowserHttpServer,
  endpointFilePath,
};
