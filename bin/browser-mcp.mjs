#!/usr/bin/env node
/**
 * browser-mcp.mjs — MCP bridge for the CCM embedded browser
 * ──────────────────────────────────────────────────────────
 * Spawned by Claude Code CLI per session (registered in
 * ~/.claude/settings.json under `mcpServers.ccm-browser`).
 *
 * Speaks the MCP JSON-RPC 2.0 protocol on stdin/stdout to Claude, and
 * forwards each `tools/call` request to the CCM Electron app's HTTP
 * control server (which is implemented in electron/browser-http-server.js).
 *
 * The endpoint URL + bearer token are persisted by Electron on every boot
 * to `~/.claude/ccm-browser-endpoint.json` (mode 0600). If the file is
 * missing (CCM not running), every tool call returns a clear error so the
 * model knows to ask the user to launch the app.
 *
 * Tool schemas match the SDK-side tools in electron/claude-service.js so
 * Claude has IDENTICAL capabilities in both CLI mode (via this MCP server)
 * and Direct API mode (via the SDK).
 */

import fs   from 'node:fs';
import path from 'node:path';
import os   from 'node:os';
import http from 'node:http';
import { URL } from 'node:url';

// ── Endpoint discovery ──────────────────────────────────────────────────────
function endpointFilePath() {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const dir  = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  return path.join(dir, 'ccm-browser-endpoint.json');
}

// In-memory cache for the endpoint envelope. Read from disk ONCE at startup
// (or when the previous endpoint becomes unreachable) — eliminates the
// ~1-3ms file-read overhead from every single tool call. The endpoint file
// only changes between Electron launches, so a long-lived cache is safe.
let _endpointCache = null;
function readEndpoint(forceRefresh = false) {
  if (_endpointCache && !forceRefresh) return _endpointCache;
  try {
    const txt = fs.readFileSync(endpointFilePath(), 'utf8');
    const env = JSON.parse(txt);
    if (!env.url || !env.token) return null;
    _endpointCache = env;
    return env;
  } catch (_) {
    _endpointCache = null;
    return null;
  }
}

// ── HTTP client ─────────────────────────────────────────────────────────────
// Persistent keep-alive agent — reuses the TCP connection across every tool
// call in the session instead of paying TCP handshake cost (~3-5ms) every
// time. The Electron HTTP server already supports keep-alive by default.
const _httpAgent = new http.Agent({
  keepAlive:        true,
  keepAliveMsecs:   30_000,
  maxSockets:       4,       // a small pool is enough — calls are typically serial
  timeout:          60_000,
});

async function callOp(cmd, body = {}) {
  let env = readEndpoint();
  if (!env) {
    throw new Error(
      'Claude Code Mods is not running. Launch the CCM desktop app, ' +
      'open the Browser panel, then retry.'
    );
  }
  const u = new URL(env.url + '/op/' + cmd);
  const data = JSON.stringify(body || {});

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: u.hostname,
      port:     u.port,
      path:     u.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Authorization':  'Bearer ' + env.token,
        'Content-Length': Buffer.byteLength(data),
        'Connection':     'keep-alive',
      },
      agent:   _httpAgent, // reuse TCP connection
      timeout: 30_000,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try {
          const parsed = JSON.parse(text);
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(parsed.error || `HTTP ${res.statusCode}`));
            return;
          }
          if (parsed.ok === false) {
            reject(new Error(parsed.error || 'Unknown error'));
            return;
          }
          resolve(parsed.result);
        } catch (e) {
          reject(new Error('Bad JSON from CCM: ' + e.message));
        }
      });
    });
    req.on('error', err => {
      // Stale endpoint? Force-reread the file on the way out so the NEXT call
      // picks up a fresh port/token if Electron restarted between requests.
      if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.code === 'EPIPE') {
        _endpointCache = null;
        reject(new Error('Cannot reach Claude Code Mods (connection refused). Is the app running?'));
      } else {
        reject(err);
      }
    });
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out after 30s'));
    });
    req.write(data);
    req.end();
  });
}

// ── Tool schemas (mirror electron/claude-service.js BROWSER_TOOLS) ─────────
const TOOLS = [
  {
    name: 'browser_get_state',
    description: 'Get the current state of the embedded browser — URL, page title, and loading status. Use this to check what page the user is currently looking at.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'browser_navigate',
    description: 'Navigate the embedded browser to a URL. Waits for the page to finish loading and returns the final URL and title.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'URL to navigate to (https:// auto-added if missing)' } },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'browser_read_page',
    description: 'Read the visible text content of the current page. Returns cleaned innerText with the page title and URL.',
    inputSchema: {
      type: 'object',
      properties: { max_chars: { type: 'integer', description: 'Max characters to return (default 8000, max 50000)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'browser_get_elements',
    description: 'List interactable elements on the page (links, buttons, inputs, selects). Compact format: each item has i (stable index — pass to browser_click), t (tag), s (CSS selector), x (visible text, ≤80 chars), r ([x,y,w,h] in pixels), optionally h (href, anchors only) and v (type, inputs only). Use this BEFORE clicking when you do not know the exact selector.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', description: 'Max elements (default 60, max 200)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'browser_click',
    description: 'Click an element on the page. Provide ONE of: index (from browser_get_elements), selector (CSS), or text (substring match against link/button text).',
    inputSchema: {
      type: 'object',
      properties: {
        index:    { type: 'integer', description: 'Element index from browser_get_elements' },
        selector: { type: 'string',  description: 'CSS selector to click' },
        text:     { type: 'string',  description: 'Visible text of the link/button to click (case-insensitive substring)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'browser_type',
    description: 'Type text into an input field. Set submit=true to also submit the surrounding form (or press Enter on the input).',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string',  description: 'CSS selector of the input element' },
        text:     { type: 'string',  description: 'Text to type into the field' },
        submit:   { type: 'boolean', description: 'Submit the form after typing' },
      },
      required: ['selector', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'browser_screenshot',
    description: 'Capture the current page as a JPEG image. You will see the screenshot as a visual input. Use this when reading text is not enough (e.g. understanding layout, recognizing icons, debugging visual issues).',
    inputSchema: {
      type: 'object',
      properties: { quality: { type: 'integer', description: 'JPEG quality 20-95 (default 75)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'browser_scroll',
    description: 'Scroll the page. Useful when content is below the fold.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down'], description: 'Scroll direction (default down)' },
        amount:    { type: 'integer', description: 'Pixels to scroll (default 600)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'browser_nav',
    description: 'Browser history navigation: back, forward, or reload.',
    inputSchema: {
      type: 'object',
      properties: { action: { type: 'string', enum: ['back', 'forward', 'reload'] } },
      required: ['action'],
      additionalProperties: false,
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  // Claude's Browser Profile — persistent identity online
  // bookmarks, history, per-URL notes, preferences, reading list
  // All data lives in %APPDATA%\claude-code-desktop\browser-profile\
  // ════════════════════════════════════════════════════════════════════════

  // ── Bookmarks ──────────────────────────────────────────────────────────
  {
    name: 'profile_bookmark_list',
    description: 'List all bookmarks in Claude\'s profile. Optionally filter by folder.',
    inputSchema: {
      type: 'object',
      properties: { folder: { type: 'string', description: 'Filter to a specific folder' } },
      additionalProperties: false,
    },
  },
  {
    name: 'profile_bookmark_add',
    description: 'Bookmark a URL in Claude\'s profile. If the URL is already bookmarked, updates the title/folder/tags. Use this when the user says "save this", "bookmark that", or when you find a useful page worth remembering.',
    inputSchema: {
      type: 'object',
      properties: {
        url:    { type: 'string', description: 'Full URL to bookmark' },
        title:  { type: 'string', description: 'Page title (auto-filled from page if missing)' },
        folder: { type: 'string', description: 'Optional folder name (e.g. "Research", "Tools")' },
        tags:   { type: 'array', items: { type: 'string' }, description: 'Optional tags' },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'profile_bookmark_remove',
    description: 'Remove a bookmark from Claude\'s profile. Provide either url or id.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        id:  { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'profile_bookmark_search',
    description: 'Search bookmarks by title, URL, or tag (case-insensitive substring).',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },

  // ── History ─────────────────────────────────────────────────────────────
  {
    name: 'profile_history_recent',
    description: 'List the most recent pages Claude\'s profile has visited (newest first).',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', description: 'Max entries (default 30)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'profile_history_search',
    description: 'Search Claude\'s browsing history by URL or page title. Useful for "find that article we read about X".',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        since: { type: 'integer', description: 'Unix ms — only return visits after this time' },
        limit: { type: 'integer', description: 'Max results (default 50)' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'profile_history_clear',
    description: 'Clear browsing history. Pass {all: true} to wipe everything, or {domain: "..."} to clear a specific domain.',
    inputSchema: {
      type: 'object',
      properties: {
        all:    { type: 'boolean' },
        domain: { type: 'string' },
      },
      additionalProperties: false,
    },
  },

  // ── Per-URL Notes ───────────────────────────────────────────────────────
  {
    name: 'profile_note_get',
    description: 'Get Claude\'s saved note for a specific URL. Returns null if no note exists.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'profile_note_set',
    description: 'Save Claude\'s note for a specific URL — overwrites any existing note. Pass empty content to delete. Use this to remember context about a page (login flow, important section, where the action button is, etc).',
    inputSchema: {
      type: 'object',
      properties: {
        url:     { type: 'string' },
        content: { type: 'string', description: 'Note content (max 8000 chars, empty deletes)' },
      },
      required: ['url', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'profile_note_search',
    description: 'Search all per-URL notes by content or URL substring.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Empty query returns all notes' } },
      additionalProperties: false,
    },
  },

  // ── Preferences ─────────────────────────────────────────────────────────
  {
    name: 'profile_pref_get',
    description: 'Read a single preference value. Examples: "homepage", "search_engine", "theme".',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string' } },
      required: ['key'],
      additionalProperties: false,
    },
  },
  {
    name: 'profile_pref_set',
    description: 'Set or delete a preference. Pass value=null to delete the key.',
    inputSchema: {
      type: 'object',
      properties: {
        key:   { type: 'string' },
        value: { description: 'Any JSON value, or null to delete' },
      },
      required: ['key'],
      additionalProperties: false,
    },
  },

  // ── Reading list ────────────────────────────────────────────────────────
  {
    name: 'profile_readlist_add',
    description: 'Save a URL to the "for later" reading list. Use when the user says "read this later" or when you find something worth a follow-up.',
    inputSchema: {
      type: 'object',
      properties: {
        url:   { type: 'string' },
        title: { type: 'string' },
        notes: { type: 'string', description: 'Why this is worth reading' },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'profile_readlist_list',
    description: 'List items in the reading list. Pass {includeDone: true} to see completed items too.',
    inputSchema: {
      type: 'object',
      properties: { includeDone: { type: 'boolean' } },
      additionalProperties: false,
    },
  },
  {
    name: 'profile_readlist_done',
    description: 'Mark a reading-list item as completed. Provide either id or url.',
    inputSchema: {
      type: 'object',
      properties: {
        id:  { type: 'string' },
        url: { type: 'string' },
      },
      additionalProperties: false,
    },
  },

  // ── Aggregate summary ───────────────────────────────────────────────────
  {
    name: 'profile_summary',
    description: 'Quick overview of Claude\'s profile state: counts of bookmarks/history/notes, top folders, open reading-list items. Useful for orientation.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },

  // ════════════════════════════════════════════════════════════════════════
  // Chrome (REAL Chrome via Chrome DevTools Protocol)
  // ────────────────────────────────────────────────────────────────────────
  // The browser_* tools control the EMBEDDED browser (Electron WebContentsView).
  // The chrome_* tools control the user's REAL Chrome — for things WebContentsView
  // can't do: Google OAuth, DRM video, Chrome Web Store extensions, the actual
  // Chrome anti-bot fingerprint. Chrome runs in a dedicated CCM-managed profile
  // (separate from the user's main Chrome) and persists across sessions.
  // ════════════════════════════════════════════════════════════════════════

  // ── Lifecycle ──────────────────────────────────────────────────────────
  {
    name: 'chrome_launch',
    description: 'Start a real Chrome subprocess controlled by CCM. Uses a dedicated profile (NOT the user\'s main Chrome) so cookies/extensions/passwords accumulate in Claude\'s identity. Lazy — most chrome_* tools auto-launch if not running. Call this explicitly to set headless mode or extra flags.',
    inputSchema: {
      type: 'object',
      properties: {
        headless:  { type: 'boolean', description: 'Run without a window (for backend/scrape tasks)' },
        extraArgs: { type: 'array', items: { type: 'string' }, description: 'Extra Chrome command-line flags' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_close',
    description: 'Gracefully shut down Claude\'s Chrome subprocess. Profile data persists for next launch.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'chrome_status',
    description: 'Get state of Claude\'s Chrome: running flag, version, PID, profile path, tab count.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },

  // ── Target / tabs ──────────────────────────────────────────────────────
  {
    name: 'chrome_target_list',
    description: 'List all open tabs in Claude\'s Chrome — id, url, title, type for each.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'chrome_target_new_tab',
    description: 'Open a new Chrome tab. If url is provided, navigates to it before returning.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Optional URL to load' } },
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_target_close_tab',
    description: 'Close a Chrome tab by id (from chrome_target_list). Omit id to close the active tab.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_target_activate_tab',
    description: 'Bring a Chrome tab to the front. Requires id from chrome_target_list.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },

  // ── Page ────────────────────────────────────────────────────────────────
  {
    name: 'chrome_page_navigate',
    description: 'Navigate Chrome\'s active tab to a URL. Waits for the page to finish loading and returns final URL, title, HTTP status.',
    inputSchema: {
      type: 'object',
      properties: {
        url:       { type: 'string' },
        waitUntil: { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'], description: 'Default "load"' },
        timeout:   { type: 'integer', description: 'Max ms to wait (default 30000)' },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_page_reload',
    description: 'Reload Chrome\'s active tab.',
    inputSchema: {
      type: 'object',
      properties: { waitUntil: { type: 'string' }, timeout: { type: 'integer' } },
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_page_screenshot',
    description: 'Capture Chrome\'s active tab as a JPEG image — visible to Claude as a vision input. Use fullPage=true to capture the whole scrollable page.',
    inputSchema: {
      type: 'object',
      properties: {
        fullPage: { type: 'boolean', description: 'Capture entire scrollable page (default false)' },
        quality:  { type: 'integer', description: 'JPEG quality 1-100 (default 75)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_page_pdf',
    description: 'Generate a PDF of Chrome\'s active tab. Returns base64-encoded PDF.',
    inputSchema: {
      type: 'object',
      properties: {
        landscape:       { type: 'boolean' },
        printBackground: { type: 'boolean', description: 'Include background colors/images (default true)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_page_wait_load',
    description: 'Wait for the next navigation to complete on Chrome\'s active tab. Useful when a click triggers a SPA route change you need to wait out.',
    inputSchema: {
      type: 'object',
      properties: { timeout: { type: 'integer', description: 'Max ms to wait (default 30000)' } },
      additionalProperties: false,
    },
  },

  // ── Runtime — the swiss army knife ─────────────────────────────────────
  {
    name: 'chrome_runtime_eval',
    description: 'Evaluate arbitrary JavaScript in Chrome\'s active tab. The most flexible tool in the kit — anything you can do in DevTools console, you can do here. Use sparingly when narrower tools don\'t fit. The expression is wrapped in `(async () => (EXPR))()` so you can `await` directly.',
    inputSchema: {
      type: 'object',
      properties: {
        expression:   { type: 'string', description: 'JS expression to evaluate' },
        awaitPromise: { type: 'boolean', description: 'Await the expression if it resolves to a promise (default true)' },
      },
      required: ['expression'],
      additionalProperties: false,
    },
  },

  // ── DOM ─────────────────────────────────────────────────────────────────
  {
    name: 'chrome_dom_query',
    description: 'querySelector on Chrome\'s active page. Returns text, bounding rect, and visibility flag. Use this to FIND an element before clicking.',
    inputSchema: {
      type: 'object',
      properties: { selector: { type: 'string' } },
      required: ['selector'],
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_dom_query_all',
    description: 'querySelectorAll on Chrome\'s active page. Returns up to `limit` matching elements with i (index), tag, text, rect.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        limit:    { type: 'integer', description: 'Max matches to return (default 50)' },
      },
      required: ['selector'],
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_dom_get_text',
    description: 'Get the innerText of an element on Chrome\'s active page.',
    inputSchema: {
      type: 'object',
      properties: { selector: { type: 'string' } },
      required: ['selector'],
      additionalProperties: false,
    },
  },

  // ── Input ───────────────────────────────────────────────────────────────
  {
    name: 'chrome_input_click',
    description: 'Click an element OR a pixel coordinate in Chrome\'s active tab. Provide either selector OR {x, y}.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        x:        { type: 'number', description: 'X coord in CSS pixels (if no selector)' },
        y:        { type: 'number', description: 'Y coord in CSS pixels (if no selector)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_input_type',
    description: 'Type text in Chrome. If selector is provided, focuses that element first. Uses real keyboard events (defeats anti-automation that sniffs synthetic input).',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'Element to focus before typing (optional)' },
        text:     { type: 'string' },
        delay:    { type: 'integer', description: 'Per-keystroke delay in ms (default 20)' },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_input_key',
    description: 'Press a single key in Chrome with optional modifiers. Key names follow USB HID (e.g. "Enter", "Tab", "ArrowDown", "F5").',
    inputSchema: {
      type: 'object',
      properties: {
        key:       { type: 'string' },
        modifiers: { type: 'array', items: { type: 'string', enum: ['Control', 'Shift', 'Alt', 'Meta'] } },
      },
      required: ['key'],
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_input_scroll',
    description: 'Scroll Chrome\'s active page up or down by amount pixels.',
    inputSchema: {
      type: 'object',
      properties: {
        amount:    { type: 'integer', description: 'Pixels (default 600)' },
        direction: { type: 'string', enum: ['up', 'down'] },
      },
      additionalProperties: false,
    },
  },

  // ── Generic CDP escape hatch ───────────────────────────────────────────
  {
    name: 'chrome_cdp_raw',
    description: 'Call ANY Chrome DevTools Protocol method directly. Reference: https://chromedevtools.github.io/devtools-protocol/. Use when no narrower chrome_* tool fits. Examples: method="Network.getCookies" / "Page.printToPDF" / "Accessibility.getFullAXTree".',
    inputSchema: {
      type: 'object',
      properties: {
        method: { type: 'string', description: 'CDP method like "Domain.action" (e.g. "Page.captureScreenshot")' },
        params: { type: 'object',  description: 'Method parameters as specified in the CDP docs' },
      },
      required: ['method'],
      additionalProperties: false,
    },
  },
];

// Map MCP tool name → HTTP op + arg shape
async function execTool(name, args = {}) {
  switch (name) {
    // ── Browser ─────────────────────────────────────────────────
    case 'browser_get_state':    return callOp('get-state');
    case 'browser_navigate':     return callOp('navigate',    { url: args.url });
    case 'browser_read_page':    return callOp('read-page',   { max_chars: args.max_chars });
    case 'browser_get_elements': return callOp('get-elements',{ limit: args.limit });
    case 'browser_click':        return callOp('click',       args);
    case 'browser_type':         return callOp('type',        args);
    case 'browser_screenshot':   return callOp('screenshot',  { quality: args.quality });
    case 'browser_scroll':       return callOp('scroll',      args);
    case 'browser_nav':          return callOp('nav',         { action: args.action });

    // ── Profile · bookmarks ─────────────────────────────────────
    case 'profile_bookmark_list':   return callOp('profile-bookmark-list',   args);
    case 'profile_bookmark_add':    return callOp('profile-bookmark-add',    args);
    case 'profile_bookmark_remove': return callOp('profile-bookmark-remove', args);
    case 'profile_bookmark_search': return callOp('profile-bookmark-search', { query: args.query });

    // ── Profile · history ───────────────────────────────────────
    case 'profile_history_recent':  return callOp('profile-history-recent',  { limit: args.limit });
    case 'profile_history_search':  return callOp('profile-history-search',  args);
    case 'profile_history_clear':   return callOp('profile-history-clear',   args);

    // ── Profile · notes ─────────────────────────────────────────
    case 'profile_note_get':        return callOp('profile-note-get',        { url: args.url });
    case 'profile_note_set':        return callOp('profile-note-set',        args);
    case 'profile_note_search':     return callOp('profile-note-search',     { query: args.query });

    // ── Profile · prefs ─────────────────────────────────────────
    case 'profile_pref_get':        return callOp('profile-pref-get',        { key: args.key });
    case 'profile_pref_set':        return callOp('profile-pref-set',        args);
    case 'profile_pref_list':       return callOp('profile-pref-list');

    // ── Profile · readlist ──────────────────────────────────────
    case 'profile_readlist_add':    return callOp('profile-readlist-add',    args);
    case 'profile_readlist_list':   return callOp('profile-readlist-list',   args);
    case 'profile_readlist_done':   return callOp('profile-readlist-done',   args);

    // ── Profile · summary ───────────────────────────────────────
    case 'profile_summary':         return callOp('profile-summary');

    // ── Chrome · lifecycle ──────────────────────────────────────
    case 'chrome_launch':           return callOp('chrome-launch', args);
    case 'chrome_close':            return callOp('chrome-close');
    case 'chrome_status':           return callOp('chrome-status');

    // ── Chrome · target/tabs ────────────────────────────────────
    case 'chrome_target_list':         return callOp('chrome-target-list');
    case 'chrome_target_new_tab':      return callOp('chrome-target-new-tab', args);
    case 'chrome_target_close_tab':    return callOp('chrome-target-close-tab', args);
    case 'chrome_target_activate_tab': return callOp('chrome-target-activate-tab', args);

    // ── Chrome · page ───────────────────────────────────────────
    case 'chrome_page_navigate':    return callOp('chrome-page-navigate', args);
    case 'chrome_page_reload':      return callOp('chrome-page-reload', args);
    case 'chrome_page_screenshot':  return callOp('chrome-page-screenshot', args);
    case 'chrome_page_pdf':         return callOp('chrome-page-pdf', args);
    case 'chrome_page_wait_load':   return callOp('chrome-page-wait-load', args);

    // ── Chrome · runtime ────────────────────────────────────────
    case 'chrome_runtime_eval':     return callOp('chrome-runtime-eval', args);

    // ── Chrome · DOM ────────────────────────────────────────────
    case 'chrome_dom_query':        return callOp('chrome-dom-query', args);
    case 'chrome_dom_query_all':    return callOp('chrome-dom-query-all', args);
    case 'chrome_dom_get_text':     return callOp('chrome-dom-get-text', args);

    // ── Chrome · input ──────────────────────────────────────────
    case 'chrome_input_click':      return callOp('chrome-input-click', args);
    case 'chrome_input_type':       return callOp('chrome-input-type', args);
    case 'chrome_input_key':        return callOp('chrome-input-key', args);
    case 'chrome_input_scroll':     return callOp('chrome-input-scroll', args);

    // ── Chrome · generic CDP escape hatch ───────────────────────
    case 'chrome_cdp_raw':          return callOp('chrome-cdp-raw', args);

    default: throw new Error('Unknown tool: ' + name);
  }
}

// ── MCP JSON-RPC server over stdio ──────────────────────────────────────────
// Each line on stdin is one JSON-RPC message. We respond on stdout with one
// line per message. No batching, no notifications from server (yet).
const SERVER_INFO = {
  name:    'ccm-browser',
  version: '1.0.0',
};
const PROTOCOL_VERSION = '2024-11-05';

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
function respondError(id, code, message) {
  process.stdout.write(JSON.stringify({
    jsonrpc: '2.0', id,
    error: { code, message },
  }) + '\n');
}

async function handleRpc(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return respond(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities:    { tools: {} },
      serverInfo:      SERVER_INFO,
    });
  }
  if (method === 'initialized' || method === 'notifications/initialized') {
    return; // notification — no response
  }
  if (method === 'ping') {
    return respond(id, {});
  }
  if (method === 'tools/list') {
    return respond(id, { tools: TOOLS });
  }
  if (method === 'tools/call') {
    const { name, arguments: args } = params || {};
    try {
      const result = await execTool(name, args || {});
      // Screenshots → return as MCP image content (Claude SEES it).
      // Applies to both the embedded-browser screenshot and the real-Chrome one.
      if ((name === 'browser_screenshot' || name === 'chrome_page_screenshot') && result?.base64) {
        return respond(id, {
          content: [
            { type: 'image', data: result.base64, mimeType: result.mediaType || 'image/jpeg' },
            { type: 'text',  text: `Screenshot · ${result.url || ''} · ${result.title || ''}` },
          ],
        });
      }
      // Everything else → serialise as text. Compact JSON keeps Claude's
      // token count low while preserving the structured data.
      const text = typeof result === 'string'
        ? result
        : JSON.stringify(result, null, 2);
      return respond(id, { content: [{ type: 'text', text }] });
    } catch (e) {
      return respond(id, {
        content: [{ type: 'text', text: 'Tool error: ' + e.message }],
        isError: true,
      });
    }
  }
  // Unknown method → -32601 per JSON-RPC spec
  respondError(id, -32601, 'Method not found: ' + method);
}

// ── stdin line parser ───────────────────────────────────────────────────────
process.stdin.setEncoding('utf8');
let _buf = '';
process.stdin.on('data', chunk => {
  _buf += chunk;
  let i;
  while ((i = _buf.indexOf('\n')) !== -1) {
    const line = _buf.slice(0, i).trim();
    _buf = _buf.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); }
    catch (e) {
      respondError(null, -32700, 'Parse error: ' + e.message);
      continue;
    }
    handleRpc(msg).catch(err => {
      respondError(msg?.id ?? null, -32603, 'Internal error: ' + err.message);
    });
  }
});

process.stdin.on('end', () => process.exit(0));

// Fail loud on uncaught errors — they go to Claude Code's MCP log.
process.on('uncaughtException', err => {
  console.error('[browser-mcp] uncaughtException:', err);
});
process.on('unhandledRejection', err => {
  console.error('[browser-mcp] unhandledRejection:', err);
});
