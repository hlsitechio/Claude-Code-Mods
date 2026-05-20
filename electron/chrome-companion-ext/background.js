'use strict';

/**
 * CCM Companion — Chrome extension background service worker
 * ──────────────────────────────────────────────────────────────
 * This is the gap-filler for Chrome APIs that CDP can NEVER reach:
 *   chrome.tabGroups, chrome.sessions, chrome.readingList,
 *   chrome.history, chrome.bookmarks, chrome.downloads,
 *   chrome.management, chrome.declarativeNetRequest,
 *   chrome.search, chrome.system.*, chrome.sidePanel
 *
 * Mechanism:
 *   1. CCM main process tells the extension where to find the CCM HTTP
 *      server (via the URL bar / clipboard / a known JS message) — for now
 *      we rely on the extension polling localhost for the endpoint.
 *   2. The extension polls the CCM HTTP server's /ext/poll endpoint for
 *      pending commands.
 *   3. Each command names a chrome.* API call to make; the extension makes
 *      the call and POSTs the result back to /ext/result.
 *
 * This is a simple long-poll pattern — no Native Messaging Host registration
 * needed (which would require modifying the user's registry). The auth
 * token is read from the same ccm-browser-endpoint.json file the MCP child
 * already uses.
 *
 * Loaded into Chrome via --load-extension=<this dir> on launch.
 */

// We can't directly access the filesystem from a service worker. The
// endpoint URL + token need to come from somewhere the extension CAN read.
// Strategy: CCM writes a config file inside a folder Chrome scans
// (`chrome.storage.local`-style) — OR we expose it via a `data:` URL the
// extension fetches once at install. For now we use a fixed convention:
// CCM launches Chrome with a custom URL hash that includes the endpoint
// info, and a content script picks it up.
//
// Simpler v1: extension reads endpoint via a chrome.storage.local entry
// that CCM sets right after loading the extension. We poll the storage on
// startup until it appears.
let _endpoint = null; // { url, token }
let _polling  = false;

async function _loadEndpoint() {
  const stored = await chrome.storage.local.get('ccmEndpoint');
  if (stored?.ccmEndpoint?.url && stored.ccmEndpoint?.token) {
    _endpoint = stored.ccmEndpoint;
    return true;
  }
  return false;
}

// Background poll for commands from CCM.
async function _poll() {
  if (_polling || !_endpoint) return;
  _polling = true;
  try {
    const r = await fetch(_endpoint.url + '/ext/poll', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + _endpoint.token,
      },
      body: JSON.stringify({ ts: Date.now() }),
    });
    if (!r.ok) return;
    const job = await r.json();
    if (!job || !job.id) return;

    // Execute the requested chrome.* API call
    const result = await _exec(job.method, job.params || {});

    // Send result back
    await fetch(_endpoint.url + '/ext/result', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + _endpoint.token,
      },
      body: JSON.stringify({ id: job.id, result }),
    });
  } catch (e) {
    // Endpoint may be down (CCM closed) — ignore quietly
  } finally {
    _polling = false;
  }
}

// Dispatch — map method name to actual chrome.* API call
async function _exec(method, params) {
  try {
    switch (method) {
      // ── Tab Groups ────────────────────────────────────────────
      case 'tabGroups.query':         return await chrome.tabGroups.query(params);
      case 'tabGroups.update':        return await chrome.tabGroups.update(params.groupId, params.updateProps);
      case 'tabGroups.move':          return await chrome.tabGroups.move(params.groupId, params.moveProps);
      case 'tabs.group':              return await chrome.tabs.group(params);
      case 'tabs.ungroup':            return await chrome.tabs.ungroup(params.tabIds);

      // ── Sessions ──────────────────────────────────────────────
      case 'sessions.getRecentlyClosed': return await chrome.sessions.getRecentlyClosed(params);
      case 'sessions.restore':           return await chrome.sessions.restore(params.sessionId);
      case 'sessions.getDevices':        return await chrome.sessions.getDevices(params);

      // ── Reading List ──────────────────────────────────────────
      case 'readingList.query':       return await chrome.readingList.query(params);
      case 'readingList.addEntry':    return await chrome.readingList.addEntry(params);
      case 'readingList.removeEntry': return await chrome.readingList.removeEntry(params);
      case 'readingList.updateEntry': return await chrome.readingList.updateEntry(params);

      // ── History ───────────────────────────────────────────────
      case 'history.search':          return await chrome.history.search(params);
      case 'history.getVisits':       return await chrome.history.getVisits(params);
      case 'history.deleteUrl':       return await chrome.history.deleteUrl(params);
      case 'history.deleteRange':     return await chrome.history.deleteRange(params);
      case 'history.deleteAll':       return await chrome.history.deleteAll();

      // ── Bookmarks ─────────────────────────────────────────────
      case 'bookmarks.getTree':       return await chrome.bookmarks.getTree();
      case 'bookmarks.search':        return await chrome.bookmarks.search(params);
      case 'bookmarks.create':        return await chrome.bookmarks.create(params);
      case 'bookmarks.update':        return await chrome.bookmarks.update(params.id, params.changes);
      case 'bookmarks.move':          return await chrome.bookmarks.move(params.id, params.destination);
      case 'bookmarks.remove':        return await chrome.bookmarks.remove(params.id);
      case 'bookmarks.removeTree':    return await chrome.bookmarks.removeTree(params.id);

      // ── Downloads ─────────────────────────────────────────────
      case 'downloads.search':        return await chrome.downloads.search(params);
      case 'downloads.download':      return await chrome.downloads.download(params);
      case 'downloads.cancel':        return await chrome.downloads.cancel(params.downloadId);
      case 'downloads.pause':         return await chrome.downloads.pause(params.downloadId);
      case 'downloads.resume':        return await chrome.downloads.resume(params.downloadId);
      case 'downloads.erase':         return await chrome.downloads.erase(params);
      case 'downloads.open':          return await chrome.downloads.open(params.downloadId);
      case 'downloads.show':          return chrome.downloads.show(params.downloadId);

      // ── Management (OTHER extensions — install/enable/disable/uninstall) ──
      case 'management.getAll':       return await chrome.management.getAll();
      case 'management.get':          return await chrome.management.get(params.id);
      case 'management.setEnabled':   return await chrome.management.setEnabled(params.id, params.enabled);
      case 'management.uninstall':    return await chrome.management.uninstall(params.id, params.options);

      // ── declarativeNetRequest (fast ad-block-grade request rules) ──
      case 'dnr.updateDynamic':       return await chrome.declarativeNetRequest.updateDynamicRules(params);
      case 'dnr.getDynamic':          return await chrome.declarativeNetRequest.getDynamicRules();
      case 'dnr.updateSession':       return await chrome.declarativeNetRequest.updateSessionRules(params);
      case 'dnr.getSession':          return await chrome.declarativeNetRequest.getSessionRules();
      case 'dnr.setEnabled':          return await chrome.declarativeNetRequest.updateEnabledRulesets(params);

      // ── Search ────────────────────────────────────────────────
      case 'search.query':            return await chrome.search.query(params);

      // ── System ────────────────────────────────────────────────
      case 'system.cpu.getInfo':      return await chrome.system.cpu.getInfo();
      case 'system.memory.getInfo':   return await chrome.system.memory.getInfo();
      case 'system.display.getInfo':  return await chrome.system.display.getInfo();
      case 'system.storage.getInfo':  return await chrome.system.storage.getInfo();

      // ── Top sites ─────────────────────────────────────────────
      case 'topSites.get':            return await chrome.topSites.get();

      // ── Side panel ────────────────────────────────────────────
      case 'sidePanel.setOptions':    return await chrome.sidePanel.setOptions(params);
      case 'sidePanel.open':          return await chrome.sidePanel.open(params);

      // ── Notifications ─────────────────────────────────────────
      case 'notifications.create':    return await chrome.notifications.create(params.notificationId, params.options);
      case 'notifications.clear':     return await chrome.notifications.clear(params.notificationId);
      case 'notifications.getAll':    return await chrome.notifications.getAll();

      default:
        return { error: 'Unknown method: ' + method };
    }
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
// Try loading the endpoint immediately. If it's not there yet, retry on alarm.
chrome.runtime.onStartup.addListener(_init);
chrome.runtime.onInstalled.addListener(_init);

async function _init() {
  await _loadEndpoint();
  chrome.alarms.create('ccm-poll', { periodInMinutes: 0.0167 }); // ~1 second
}
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== 'ccm-poll') return;
  if (!_endpoint) await _loadEndpoint();
  if (_endpoint) _poll();
});

// Also start polling right away once the SW boots
_init();

// Allow CCM to push the endpoint via `chrome.storage.local.set({ccmEndpoint: {...}})`
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.ccmEndpoint) return;
  _endpoint = changes.ccmEndpoint.newValue;
});
