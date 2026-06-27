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
// Phase 10 — multi-slot. Read CCM_BROWSER_SLOT from env (set by the MCP entry
// in ~/.claude.json) to pick which CCM instance we drive. Default = slot 1
// (existing behaviour, no env var needed).
const _slot = (() => {
  const env = process.env.CCM_BROWSER_SLOT;
  if (env) {
    const n = parseInt(env, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 64) return n;
  }
  return 1;
})();

function endpointFilePath() {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const dir  = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  const fname = _slot === 1
    ? 'ccm-browser-endpoint.json'
    : `ccm-browser-endpoint-${_slot}.json`;
  return path.join(dir, fname);
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
    const slotHint = _slot === 1
      ? 'Launch the CCM desktop app, open the Browser panel, then retry.'
      : `Launch CCM slot ${_slot} (e.g. \`electron . --slot=${_slot}\`), open the Browser panel, then retry.`;
    throw new Error('Claude Code Mods slot ' + _slot + ' is not running. ' + slotHint);
  }
  const u = new URL(env.url + '/op/' + cmd);
  const data = JSON.stringify(body || {});
  // Media generation can run well past the default 30s (Imagen ~15-30s, gpt_cli
  // up to 2min, Veo start a few s). Give those ops a longer client timeout.
  const LONG_OPS = new Set(['imagen-generate', 'veo-generate', 'veo-status', 'gpt-ask']);
  const opTimeout = LONG_OPS.has(cmd) ? 240_000 : 30_000;

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
      timeout: opTimeout,
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
      req.destroy(new Error('Request timed out after ' + Math.round(opTimeout / 1000) + 's'));
    });
    req.write(data);
    req.end();
  });
}

// ── Tool schemas (mirror electron/claude-service.js BROWSER_TOOLS) ─────────

// Phase 17/19c — single source of truth for the targetId schema fragment.
// Was previously duplicated inline 21× across tool schemas (mechanical bloat
// from the Phase 17 auto-transform). Schemas reference this constant by name;
// the MCP host sees identical JSON either way.
const TARGET_ID_PROP = { type: 'string', description: 'CDP target id (from chrome_target_list or chrome_split_state). Omit to use the active tab. Pass to drive a specific pane in parallel — eliminates the active-tab race when sub-agents share the controller.' };

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

  // ── Lifecycle (attached mode — connects to CCM\'s embedded browser) ────
  {
    name: 'chrome_launch',
    description: 'Attach to CCM\'s embedded browser via CDP (http://127.0.0.1:9222). This is the SAME browser the user sees in the Browser panel — chrome_* tools and browser_* tools drive the same browser, two different control surfaces. Auto-attaches on first chrome_* call; this tool is for explicit reconnection.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_close',
    description: 'Detach the CDP connection. Does NOT close the embedded browser — the user\'s tabs stay open. Just releases our control session so the next call reconnects fresh.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'chrome_status',
    description: 'Get CDP attach state: connected flag, endpoint, version, list of browseable pages (filtered to exclude CCM app UI).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },

  // ── Target / tabs ──────────────────────────────────────────────────────
  {
    name: 'chrome_target_list',
    description: 'List all open browser-panel tabs. Returns { tabs: [{ id, url, title, type, lastActivated, attached, pane, pid, viewId }], count, attachedId, splitActive, splitLeftId, splitRightId }. `id` is the CDP targetId — pass it as `targetId:` to ANY tool to drive a specific tab in parallel (Phase 17 — eliminates active-tab races between sub-agents). `pid` is the OS process id of the renderer (each Chromium tab is its own process) for memory/CPU introspection. `viewId` is the Electron WebContentsView id. `attached: true` marks the tab the MCP is currently driving. `pane: "left"|"right"|null` marks which side of the split-view layout each tab occupies. Sorted attached-first, then most-recently-activated.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'chrome_target_new_tab',
    description: 'Navigate the active browser-panel tab to a URL. NOTE: In attached mode we navigate the CURRENT tab rather than creating a new one (Electron dockview owns tab lifecycle). To open a NEW tab, the user must click "+" in the CCM Browser panel.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'URL to load in the active browser-panel tab' } },
      required: ['url'],
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
    description: 'Navigate Chrome\'s active tab to a URL. Waits for the page to finish loading and (by default) for the page to fully settle — returns final URL, title, HTTP status, and `stabilized: { settled, waited }`.',
    inputSchema: {
      type: 'object',
      properties: {
        url:         { type: 'string' },
        waitUntil:   { type: 'string', enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'], description: 'Default "load"' },
        timeout:     { type: 'integer', description: 'Max ms for navigation (default 30000)' },
        stabilize:   { type: 'boolean', description: 'Auto-wait for network + DOM idle after load (default true)' },
        stabilizeMs: { type: 'number',  description: 'Stabilize timeout in ms (default 5000)' },
        targetId: TARGET_ID_PROP,
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
      properties: { waitUntil: { type: 'string' }, timeout: { type: 'integer' },
 targetId: TARGET_ID_PROP,
},
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
        targetId: TARGET_ID_PROP,
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
        targetId: TARGET_ID_PROP,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_page_wait_load',
    description: 'Wait for the next navigation to complete on Chrome\'s active tab. Useful when a click triggers a SPA route change you need to wait out.',
    inputSchema: {
      type: 'object',
      properties: { timeout: { type: 'integer', description: 'Max ms to wait (default 30000)' },
 targetId: TARGET_ID_PROP,
},
      additionalProperties: false,
    },
  },

  // ── Runtime — the swiss army knife ─────────────────────────────────────
  {
    name: 'chrome_runtime_eval',
    description: 'Evaluate a single JavaScript EXPRESSION in Chrome\'s active tab. The expression is wrapped in `(async () => (EXPR))()` so you can `await`. **For statement blocks** (vars, loops, multiple statements separated by `;`), use `chrome_runtime_run` instead — this one will fail with "Unexpected token \';\'" on top-level statements.',
    inputSchema: {
      type: 'object',
      properties: {
        expression:   { type: 'string', description: 'JS expression to evaluate' },
        awaitPromise: { type: 'boolean', description: 'Await the expression if it resolves to a promise (default true)' },
        targetId: TARGET_ID_PROP,
      },
      required: ['expression'],
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_runtime_run',
    description: 'Execute a STATEMENT BLOCK of JavaScript in Chrome\'s active tab (sibling of chrome_runtime_eval but for multi-statement code). Wraps in `(async () => { CODE })()` so you can declare variables, run for-loops, `await` multiple things, and `return` at the end. Use this when chrome_runtime_eval gives you "Unexpected token \';\'".',
    inputSchema: {
      type: 'object',
      properties: { code: { type: 'string', description: 'JS statement block (use `return X` at the end to get a value back)' },
 targetId: TARGET_ID_PROP,
},
      required: ['code'],
      additionalProperties: false,
    },
  },

  // ── DOM ─────────────────────────────────────────────────────────────────
  {
    name: 'chrome_dom_query',
    description: 'querySelector on Chrome\'s active page. Returns text, bounding rect, and visibility flag. Use this to FIND an element before clicking.',
    inputSchema: {
      type: 'object',
      properties: { selector: { type: 'string' },
 targetId: TARGET_ID_PROP,
},
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
        targetId: TARGET_ID_PROP,
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
      properties: { selector: { type: 'string' },
 targetId: TARGET_ID_PROP,
},
      required: ['selector'],
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_dom_click',
    description: 'Click a CSS selector with AUTO-SCROLL-INTO-VIEW + visible-rect clamping. Prefer this over chrome_input_click when the target may be outside the visible viewport (overflowed in a horizontal split, below the fold, etc) — fixes the "clicked dead air outside the window" silent failure from real-session feedback.',
    inputSchema: {
      type: 'object',
      properties: { selector: { type: 'string' },
 targetId: TARGET_ID_PROP,
},
      required: ['selector'],
      additionalProperties: false,
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  // CodeMirror 6 primitives (Lovable.dev, CodeSandbox, vscode-web — anywhere
  // CM6 is the editor). All four tools verify focus, use real keyboard events,
  // and bypass auto-pairing of brackets/quotes via Input.insertText.
  // ════════════════════════════════════════════════════════════════════════
  {
    name: 'chrome_cm_focus',
    description: 'Click the CodeMirror editor and VERIFY focus landed on .cm-content (not on a search-result button or toolbar). Solves "focus drifts on every UI interaction". Auto-scrolls the editor into view + clamps the click to the visible viewport for editors that extend past a split-pane.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'chrome_cm_goto_line',
    description: 'Jump the CodeMirror editor caret to a specific line via CM6\'s default Ctrl+G keymap. Focuses the editor first, then opens the goto-line dialog, types N, hits Enter.',
    inputSchema: {
      type: 'object',
      properties: { line: { type: 'integer', description: '1-indexed line number' },
 targetId: TARGET_ID_PROP,
},
      required: ['line'],
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_cm_replace_line',
    description: 'ATOMIC line replacement in CodeMirror — the killer combo. Pipeline: focus editor → goto line N → Home + Shift+End (select whole line) → Input.insertText (bypasses CM auto-pairing of brackets/quotes) → optionally Ctrl+S to save. Replaces 30+ keystrokes per surgical edit with one call. Verify via your Lovable MCP read_file afterward — ground truth, no UI scraping.',
    inputSchema: {
      type: 'object',
      properties: {
        line:    { type: 'integer', description: '1-indexed line to replace' },
        content: { type: 'string',  description: 'New full content for that line (no trailing newline)' },
        save:    { type: 'boolean', description: 'Send Ctrl+S after editing (default true)' },
        targetId: TARGET_ID_PROP,
      },
      required: ['line', 'content'],
      additionalProperties: false,
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  // Phase 9 — playbook follow-ups: multi-file batch, open-at-line, picker
  // ════════════════════════════════════════════════════════════════════════
  {
    name: 'chrome_cm_ensure_editor',
    description: 'Verify the CodeMirror editor (.cm-content) is mounted on the active page. If not, re-navigate the same URL with `?view=codeEditor` appended — fixes "Save sometimes drops the editor pane" on Lovable.dev. Idempotent: returns ok+alreadyMounted=true if no action needed.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'chrome_cm_open_at_line',
    description: 'Open a specific file at line N via URL params (`?view=codeEditor&file=<path>&line=<n>`) — the proven Lovable pattern. After navigation waits for .cm-content + calls goto-line for guaranteed cursor placement. Best-effort: if the host ignores file/line params, you\'ll get { ok:false, error } back and should fall back to search-code.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string',  description: 'Repo-relative file path (e.g. "src/pages/Auth.tsx")' },
        line: { type: 'integer', description: '1-indexed line to jump to (optional but recommended)' },
        targetId: TARGET_ID_PROP,
      },
      required: ['file'],
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_cm_edit_atomic',
    description: 'Multi-file batch CodeMirror edit. Each edit = { line, content, file? }. Same file = sequential replaceLine calls then one Ctrl+S. New file in `file` field = saves the previous file first, then opens the new one via cm_open_at_line. Returns { ok, edits: [{file,line,ok,error?}], savedFiles }. Use this instead of multiple chrome_cm_replace_line calls when you have a list of surgical edits to make — handles file switching + save batching for you.',
    inputSchema: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          description: 'Edits in order. Within one file, line order doesn\'t matter (replaceLine doesn\'t shift lines).',
          items: {
            type: 'object',
            properties: {
              line:    { type: 'integer', description: '1-indexed line to replace' },
              content: { type: 'string',  description: 'New content for that line' },
              file:    { type: 'string',  description: 'Optional — switch to this file before applying (caches between edits)' },
            },
            required: ['line', 'content'],
            additionalProperties: false,
          },
        },
        save:         { type: 'boolean', description: 'Send Ctrl+S per file boundary + at the end (default true)' },
        ensureEditor: { type: 'boolean', description: 'Call cm_ensure_editor before each file switch (default true)' },
        targetId: TARGET_ID_PROP,
      },
      required: ['edits'],
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_picker_install',
    description: 'Install the element-to-source picker overlay on the active page. Hover any element → cyan outline + tooltip showing <Component>  file.tsx:line. Click an element → captures source location to window.__pickerResult. Then call chrome_picker_capture to retrieve. Requires a Vite/CRA/Next dev build (reads React fiber `_debugSource`).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'chrome_picker_capture',
    description: 'Poll the active page until the user clicks an element with the picker active (or until timeout). Returns { ok, tag, text, classes, source: { fileName, lineNumber, componentType }, chain: [...] } where `chain` is the React component ancestry. Call chrome_picker_install first.',
    inputSchema: {
      type: 'object',
      properties: {
        timeoutMs: { type: 'integer', description: 'Max ms to wait for click (default 30000, max 300000)' },
        targetId: TARGET_ID_PROP,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_picker_cancel',
    description: 'Remove the picker overlay from the active page without capturing anything. Use when you want to abort an open picker session.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },

  // ════════════════════════════════════════════════════════════════════════
  // Phase 15 — Split-view state (drive BOTH panes in one turn)
  // ════════════════════════════════════════════════════════════════════════
  {
    name: 'chrome_split_state',
    description: 'Get the current split-view layout of the embedded browser. When the user has split the browser panel into two side-by-side tabs, this returns the CDP targetId of EACH pane so you can drive both in parallel within one turn — e.g. `chrome_observe { targetId: left.targetId }` to read a research page, then `chrome_step { targetId: right.targetId, action:"type", target:"note input", value:"..." }` to write notes in the other pane. Returns `{ active: false }` when no split is active. When active: `{ active: true, ratio, left: { viewId, url, title, targetId }, right: { viewId, url, title, targetId } }`. This is the canonical workflow for "research in one pane + notes in the other" — no active-tab flipping required.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'chrome_split_enable',
    description: 'Turn ON split-view in the CCM Browser panel — Claude drives the UI itself, no manual button-click required. Optional `leftUrl` / `rightUrl` navigate each pane to a specific URL; if omitted, reuses existing tabs (or opens about:blank). Returns the full chrome_split_state output with CDP targetIds so you can immediately observe/step both panes. Use this to bootstrap the canonical "research + notes" workflow: `chrome_split_enable({leftUrl:"https://duckduckgo.com/?q=foo", rightUrl:"https://notes.example.com"})` → grabs both targetIds → loop observe(left)+type(right).',
    inputSchema: {
      type: 'object',
      properties: {
        leftUrl:  { type: 'string', description: 'URL for the left pane (default: keep current active tab)' },
        rightUrl: { type: 'string', description: 'URL for the right pane (default: reuse another tab or open about:blank)' },
        ratio:    { type: 'number', description: 'Left-pane width fraction 0.15-0.85 (default 0.5)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_split_disable',
    description: 'Turn OFF split-view, collapsing back to a single visible tab (the current left pane stays active; the right-pane tab remains open but un-pinned). Returns { ok, active: false }.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'chrome_split_swap',
    description: 'Swap left and right panes in split-view. Useful when you want to act on the OTHER pane and your auto-stabilize / observe loop is keyed to "active = left". Returns the new chrome_split_state.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'chrome_split_set_ratio',
    description: 'Resize the split — `ratio` is the left-pane width fraction (0.15 to 0.85). Useful when one pane needs more room (e.g. wide research table on the left, narrow notes input on the right → ratio 0.7).',
    inputSchema: {
      type: 'object',
      properties: { ratio: { type: 'number', description: '0.15 to 0.85' } },
      required: ['ratio'],
      additionalProperties: false,
    },
  },

  // ── Input ───────────────────────────────────────────────────────────────
  // For DOM-driven flows, prefer the ref-based tools (chrome_observe →
  // chrome_click_ref / chrome_type_ref) — they auto-stabilize and return the
  // observe delta. These selector/coord tools remain for low-level cases.
  {
    name: 'chrome_input_click',
    description: 'Click an element OR a pixel coordinate. Prefer chrome_click_ref for DOM elements. Pass stabilize:true to auto-wait for the page to settle after click.',
    inputSchema: {
      type: 'object',
      properties: {
        selector:    { type: 'string' },
        x:           { type: 'number', description: 'X coord in CSS pixels (if no selector)' },
        y:           { type: 'number', description: 'Y coord in CSS pixels (if no selector)' },
        stabilize:   { type: 'boolean', description: 'Auto-wait for network + DOM idle after click (default false)' },
        stabilizeMs: { type: 'number' },
        targetId: TARGET_ID_PROP,
      },
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_input_type',
    description: 'Type text in Chrome via real keyboard events. Prefer chrome_type_ref for inputs. Pass stabilize:true to auto-wait after.',
    inputSchema: {
      type: 'object',
      properties: {
        selector:    { type: 'string', description: 'Element to focus before typing (optional)' },
        text:        { type: 'string' },
        delay:       { type: 'integer', description: 'Per-keystroke delay in ms (default 20)' },
        stabilize:   { type: 'boolean' },
        stabilizeMs: { type: 'number' },
        targetId: TARGET_ID_PROP,
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_input_key',
    description: 'Press a single key in Chrome with optional modifiers. Key names follow USB HID (e.g. "Enter", "Tab", "ArrowDown", "F5"). Pass stabilize:true to auto-wait after.',
    inputSchema: {
      type: 'object',
      properties: {
        key:         { type: 'string' },
        modifiers:   { type: 'array', items: { type: 'string', enum: ['Control', 'Shift', 'Alt', 'Meta'] } },
        stabilize:   { type: 'boolean' },
        stabilizeMs: { type: 'number' },
        targetId: TARGET_ID_PROP,
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
        targetId: TARGET_ID_PROP,
      },
      additionalProperties: false,
    },
  },

  // ── Generic CDP escape hatch ───────────────────────────────────────────
  {
    name: 'chrome_cdp_raw',
    description: 'Call ANY Chrome DevTools Protocol method directly. Reference: https://chromedevtools.github.io/devtools-protocol/. Use when no narrower chrome_* tool fits. Pass `sessionId` (from chrome_frame_attach) to route the call into a cross-origin iframe.',
    inputSchema: {
      type: 'object',
      properties: {
        method:    { type: 'string', description: 'CDP method like "Domain.action" (e.g. "Page.captureScreenshot")' },
        params:    { type: 'object',  description: 'Method parameters as specified in the CDP docs' },
        sessionId: { type: 'string',  description: 'Optional — attached frame session from chrome_frame_attach' },
      },
      required: ['method'],
      additionalProperties: false,
    },
  },

  // ── Semantic observation — Phase 11 ────────────────────────────────────
  // The fast eye: one tool that returns the page's MEANING (role + name +
  // value + state) instead of pixels. Each interactive node gets a stable
  // `data-ccm-ref="N"` attribute so subsequent clicks/types survive React
  // re-renders. Prefer this over screenshot+vision for any DOM-driven flow.
  {
    name: 'chrome_observe',
    description: 'Semantic snapshot of a page — visible interactive elements as a YAML-style tree of [ref] role "name" = "value" (state). Each element is tagged with data-ccm-ref="N" in the DOM. Defaults to the active tab; pass `targetId` (from chrome_target_list) to observe a SPECIFIC tab without activating it — enables driving multiple tabs in parallel within one turn.',
    inputSchema: {
      type: 'object',
      properties: {
        raw:      { type: 'boolean', description: 'Include the full nodes[] array (default false — tree only)' },
        targetId: { type: 'string',  description: 'Optional tab targetId (from chrome_target_list). Omit to use the active tab.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_observe_delta',
    description: 'Return only what CHANGED since the last chrome_observe on this tab. Each tab keeps its own observe cache, so pass the same `targetId` you observed with.',
    inputSchema: {
      type: 'object',
      properties: { targetId: { type: 'string', description: 'Optional tab targetId. Omit to use the active tab.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_click_ref',
    description: 'Click an element by its ref from chrome_observe. Auto-stabilizes after the click (waits for network + DOM to settle) and returns the observe_delta in the response — one round-trip per intent. Pass observe=false to skip the delta if you don\'t need it.',
    inputSchema: {
      type: 'object',
      properties: {
        ref:         { type: 'number' },
        observe:     { type: 'boolean', description: 'Include observe_delta in response (default true)' },
        stabilizeMs: { type: 'number',  description: 'Max ms to wait for page to settle (default 5000)' },
        targetId:    { type: 'string',  description: 'Optional tab targetId for parallel multi-tab control.' },
      },
      required: ['ref'],
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_type_ref',
    description: 'Type text into an input by ref (React-safe — sets value via native setter + fires input/change). submit=true to press Enter after. Auto-stabilizes + returns observe_delta. Pass `targetId` to type into a non-active tab.',
    inputSchema: {
      type: 'object',
      properties: {
        ref:         { type: 'number' },
        text:        { type: 'string' },
        submit:      { type: 'boolean' },
        observe:     { type: 'boolean', description: 'Include observe_delta in response (default true)' },
        stabilizeMs: { type: 'number' },
        targetId:    { type: 'string',  description: 'Optional tab targetId for parallel multi-tab control.' },
      },
      required: ['ref', 'text'],
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_focus_ref',
    description: 'Focus an element by ref (useful before chrome_input_key sequences).',
    inputSchema: {
      type: 'object',
      properties: {
        ref:          { type: 'number' },
        observe:      { type: 'boolean', description: 'Include observe_delta in response (default false for focus)' },
        stabilizeMs:  { type: 'number',  description: 'Max ms to wait for page to settle after action (default 1000)' },
        targetId:     { type: 'string',  description: 'Optional tab targetId.' },
      },
      required: ['ref'],
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_stabilize',
    description: 'Wait until the page has settled: no in-flight nav, network idle (default 500ms quiet), DOM mutation idle (default 200ms quiet). Bounded by `timeout` (default 5000ms). Returns { settled, waited }.',
    inputSchema: {
      type: 'object',
      properties: {
        timeout:        { type: 'number' },
        networkIdleMs:  { type: 'number' },
        mutationIdleMs: { type: 'number' },
        targetId:       { type: 'string', description: 'Optional tab targetId.' },
      },
      additionalProperties: false,
    },
  },

  {
    name: 'chrome_step',
    description: 'High-level intent resolver. Given { action, target } it runs a fresh observe, fuzzy-matches `target` against accessible names of role-appropriate elements, and executes — one round-trip per intent. Auto-stabilizes and bundles observe_delta. Use this INSTEAD OF chrome_observe + chrome_click_ref/type_ref when you already know the human-readable target name. Scoring: exact=100, startsWith=55, includes=40, token-overlap up to 30, disabled −50. Filter floor: candidates must score ≥15 to be considered. Returns { resolved, candidates, delta, stabilized }. On ambiguous match (top two scores within 20), refuses and returns top-5 candidates so the caller can disambiguate with `role` or `near`. `select` action handles BOTH native `<select>` (via React-safe value setter) AND ARIA listbox/combobox (clicks the matching `[role=option]`).',
    inputSchema: {
      type: 'object',
      properties: {
        action:      { type: 'string', enum: ['click','type','focus','select'], description: 'Verb to perform.' },
        target:      { type: 'string', description: 'Accessible name (or substring) of the element. Case-insensitive, token-overlap fallback.' },
        role:        { type: 'string', description: 'Optional ARIA role to constrain match (button, link, textbox, combobox, ...).' },
        value:       { type: 'string', description: 'Text to type (action=type) or option value/label to pick (action=select).' },
        submit:      { type: 'boolean', description: 'For action=type — press Enter after.' },
        near:        { type: 'string', description: 'Disambiguator: prefer matches near an element whose name contains this string.' },
        observe:     { type: 'boolean', description: 'Include observe_delta in response (default true).' },
        stabilizeMs: { type: 'number',  description: 'Max ms to wait for page to settle (default 5000).' },
        targetId:    { type: 'string',  description: 'Optional tab targetId for parallel multi-tab control.' },
      },
      required: ['action', 'target'],
      additionalProperties: false,
    },
  },

  // ── Cross-origin frame (OOPIF) access ──────────────────────────────────
  // Top-level page JS cannot reach a cross-origin iframe's DOM. These tools
  // open a separate CDP session bound to the iframe's process so you can
  // eval/click/type inside it — Stripe 3DS, reCAPTCHA, embedded auth, etc.
  {
    name: 'chrome_frame_list',
    description: 'List cross-origin iframe targets on the active page. Returns [{targetId, url, parentTargetId, attached}]. Find the one you want, then attach with chrome_frame_attach.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'chrome_frame_attach',
    description: 'Attach a CDPSession to an iframe target. Returns `sessionId` you pass to chrome_frame_eval/click/type or chrome_cdp_raw. Use chrome_frame_list to discover targetIds.',
    inputSchema: {
      type: 'object',
      properties: { targetId: { type: 'string', description: 'iframe targetId from chrome_frame_list' } },
      required: ['targetId'],
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_frame_detach',
    description: 'Detach an attached iframe session and free its CDPSession.',
    inputSchema: {
      type: 'object',
      properties: { sessionId: { type: 'string' } },
      required: ['sessionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_frame_eval',
    description: 'Evaluate a JS EXPRESSION inside an attached iframe (same wrapping as chrome_runtime_eval). Use this when the parent page can\'t reach the iframe due to same-origin policy.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId:    { type: 'string' },
        expression:   { type: 'string' },
        awaitPromise: { type: 'boolean', description: 'Await if expression resolves to a promise (default true)' },
      },
      required: ['sessionId', 'expression'],
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_frame_click',
    description: 'Click an element by CSS selector inside an attached iframe.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        selector:  { type: 'string' },
      },
      required: ['sessionId', 'selector'],
      additionalProperties: false,
    },
  },
  {
    name: 'chrome_frame_type',
    description: 'Type text into an input inside an attached iframe (sets value + fires input/change so React/Vue pick it up). Pass submit=true to also submit the enclosing form.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        selector:  { type: 'string', description: 'Optional — defaults to document.activeElement of the frame' },
        text:      { type: 'string' },
        submit:    { type: 'boolean' },
      },
      required: ['sessionId', 'text'],
      additionalProperties: false,
    },
  },

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 2 — Network · Storage · Emulation
  // ════════════════════════════════════════════════════════════════════════

  // ── Network ────────────────────────────────────────────────────────────
  { name: 'chrome_net_cookies_get', description: 'List cookies in Chrome. Optionally filter by urls.',
    inputSchema: { type: 'object', properties: { urls: { type: 'array', items: { type: 'string' } } }, additionalProperties: false } },
  { name: 'chrome_net_cookie_set', description: 'Set a cookie in Chrome (Network.setCookie). Either domain+path OR url is required.',
    inputSchema: { type: 'object', properties: {
      name: { type: 'string' }, value: { type: 'string' },
      domain: { type: 'string' }, path: { type: 'string' }, url: { type: 'string' },
      secure: { type: 'boolean' }, httpOnly: { type: 'boolean' },
      sameSite: { type: 'string', enum: ['Strict','Lax','None'] },
      expires: { type: 'number', description: 'Unix seconds' },
    }, required: ['name'], additionalProperties: false } },
  { name: 'chrome_net_cookies_delete', description: 'Delete cookies matching name + (domain|path|url).',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, domain: { type: 'string' }, path: { type: 'string' }, url: { type: 'string' } }, required: ['name'], additionalProperties: false } },
  { name: 'chrome_net_cookies_clear_all', description: 'Wipe ALL cookies in this Chrome profile. Big hammer — destroys all logins.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_net_extra_headers', description: 'Inject extra HTTP headers into every Chrome request (e.g. {"X-Debug":"1"}).',
    inputSchema: { type: 'object', properties: { headers: { type: 'object', additionalProperties: { type: 'string' } } }, required: ['headers'], additionalProperties: false } },
  { name: 'chrome_net_block_urls', description: 'Block requests matching any URL pattern (wildcards OK, e.g. "*.doubleclick.net/*"). Pass empty array to clear.',
    inputSchema: { type: 'object', properties: { urls: { type: 'array', items: { type: 'string' } } }, additionalProperties: false } },
  { name: 'chrome_net_user_agent', description: 'Override the User-Agent for ALL Chrome requests (deeper than Emulation — covers worker traffic too).',
    inputSchema: { type: 'object', properties: { userAgent: { type: 'string' }, acceptLanguage: { type: 'string' }, platform: { type: 'string' } }, required: ['userAgent'], additionalProperties: false } },

  // ── Storage ────────────────────────────────────────────────────────────
  { name: 'chrome_storage_clear_origin', description: 'Clear ALL storage for one origin (cookies/localStorage/IndexedDB/cache/SW). storageTypes is "all" or csv subset.',
    inputSchema: { type: 'object', properties: { origin: { type: 'string' }, storageTypes: { type: 'string' } }, required: ['origin'], additionalProperties: false } },
  { name: 'chrome_storage_usage', description: 'Get storage usage + quota breakdown for an origin (bytes per category).',
    inputSchema: { type: 'object', properties: { origin: { type: 'string' } }, required: ['origin'], additionalProperties: false } },
  { name: 'chrome_storage_cookies', description: 'List all cookies in the active browser context (alternative to chrome_net_cookies_get).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_domstorage_get', description: 'Read all localStorage (or sessionStorage) entries for one origin.',
    inputSchema: { type: 'object', properties: { origin: { type: 'string' }, isLocalStorage: { type: 'boolean', description: 'true = localStorage (default), false = sessionStorage' } }, required: ['origin'], additionalProperties: false } },
  { name: 'chrome_domstorage_set', description: 'Set one localStorage (or sessionStorage) key/value for an origin.',
    inputSchema: { type: 'object', properties: { origin: { type: 'string' }, key: { type: 'string' }, value: { type: 'string' }, isLocalStorage: { type: 'boolean' } }, required: ['origin', 'key'], additionalProperties: false } },
  { name: 'chrome_domstorage_remove', description: 'Remove one localStorage key for an origin.',
    inputSchema: { type: 'object', properties: { origin: { type: 'string' }, key: { type: 'string' }, isLocalStorage: { type: 'boolean' } }, required: ['origin', 'key'], additionalProperties: false } },
  { name: 'chrome_domstorage_clear', description: 'Clear all localStorage (or sessionStorage) for an origin.',
    inputSchema: { type: 'object', properties: { origin: { type: 'string' }, isLocalStorage: { type: 'boolean' } }, required: ['origin'], additionalProperties: false } },
  { name: 'chrome_idb_list', description: 'List IndexedDB database names for an origin.',
    inputSchema: { type: 'object', properties: { origin: { type: 'string' } }, required: ['origin'], additionalProperties: false } },
  { name: 'chrome_idb_delete', description: 'Delete one IndexedDB database for an origin.',
    inputSchema: { type: 'object', properties: { origin: { type: 'string' }, databaseName: { type: 'string' } }, required: ['origin', 'databaseName'], additionalProperties: false } },
  { name: 'chrome_cache_list', description: 'List Service Worker / Cache API cache names for an origin.',
    inputSchema: { type: 'object', properties: { origin: { type: 'string' } }, required: ['origin'], additionalProperties: false } },
  { name: 'chrome_cache_delete', description: 'Delete a cache by cacheId (from chrome_cache_list).',
    inputSchema: { type: 'object', properties: { cacheId: { type: 'string' } }, required: ['cacheId'], additionalProperties: false } },

  // ── Emulation ──────────────────────────────────────────────────────────
  { name: 'chrome_emulate_ua', description: 'Emulation-level UA override (per-tab; ephemeral). Use chrome_net_user_agent for a persistent network-level override.',
    inputSchema: { type: 'object', properties: { userAgent: { type: 'string' }, acceptLanguage: { type: 'string' }, platform: { type: 'string' } }, required: ['userAgent'], additionalProperties: false } },
  { name: 'chrome_emulate_geo', description: 'Fake the user\'s geolocation. Sites using navigator.geolocation will see these coordinates.',
    inputSchema: { type: 'object', properties: { latitude: { type: 'number' }, longitude: { type: 'number' }, accuracy: { type: 'number', description: 'meters (default 50)' } }, required: ['latitude', 'longitude'], additionalProperties: false } },
  { name: 'chrome_emulate_geo_clear', description: 'Clear the geolocation override.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_emulate_timezone', description: 'Override the page\'s timezone (e.g. "America/Tokyo", "Europe/Berlin").',
    inputSchema: { type: 'object', properties: { timezoneId: { type: 'string' } }, required: ['timezoneId'], additionalProperties: false } },
  { name: 'chrome_emulate_locale', description: 'Override the page\'s locale (e.g. "ja-JP", "fr-FR").',
    inputSchema: { type: 'object', properties: { locale: { type: 'string' } }, required: ['locale'], additionalProperties: false } },
  { name: 'chrome_emulate_device', description: 'Set device metrics (viewport, pixel ratio, mobile flag) — emulate phone/tablet.',
    inputSchema: { type: 'object', properties: { width: { type: 'integer' }, height: { type: 'integer' }, deviceScaleFactor: { type: 'number' }, mobile: { type: 'boolean' } }, required: ['width', 'height'], additionalProperties: false } },
  { name: 'chrome_emulate_device_clear', description: 'Clear device metrics override (return to real viewport).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_emulate_color_scheme', description: 'Force the page\'s color scheme to light/dark/no-preference (tests prefers-color-scheme).',
    inputSchema: { type: 'object', properties: { scheme: { type: 'string', enum: ['light', 'dark', 'no-preference'] } }, additionalProperties: false } },
  { name: 'chrome_emulate_network', description: 'Throttle network — offline, slow 3G, etc. latency in ms; throughput in bytes/sec (-1 = no limit).',
    inputSchema: { type: 'object', properties: { offline: { type: 'boolean' }, latency: { type: 'integer' }, downloadThroughput: { type: 'integer' }, uploadThroughput: { type: 'integer' } }, additionalProperties: false } },
  { name: 'chrome_emulate_cpu', description: 'CPU throttling. rate=1 normal, rate=4 = 4x slowdown.',
    inputSchema: { type: 'object', properties: { rate: { type: 'number' } }, additionalProperties: false } },
  { name: 'chrome_emulate_vision', description: 'Simulate vision deficiency — accessibility testing.',
    inputSchema: { type: 'object', properties: { type: { type: 'string', enum: ['none', 'achromatopsia', 'blurredVision', 'deuteranopia', 'protanopia', 'tritanopia'] } }, additionalProperties: false } },

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 3 — Extensions · Autofill · WebAuthn (the gems)
  // ════════════════════════════════════════════════════════════════════════

  { name: 'chrome_ext_load_unpacked', description: 'Load an unpacked Chrome extension from a folder. CDP method — works WITHOUT going through the Web Store. Returns the new extension id.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'Absolute path to extension folder (containing manifest.json)' } }, required: ['path'], additionalProperties: false } },
  { name: 'chrome_ext_uninstall', description: 'Uninstall a Chrome extension by id.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
  { name: 'chrome_autofill_trigger', description: 'Programmatically trigger autofill on a form field (by DOM nodeId).',
    inputSchema: { type: 'object', properties: { fieldId: { type: 'integer' }, frameId: { type: 'string' }, card: { type: 'object' } }, required: ['fieldId'], additionalProperties: false } },
  { name: 'chrome_autofill_set_addresses', description: 'Set autofill addresses (CDP Autofill.setAddresses).',
    inputSchema: { type: 'object', properties: { addresses: { type: 'array' } }, additionalProperties: false } },
  { name: 'chrome_webauthn_enable', description: 'Enable the WebAuthn virtual authenticator subsystem (required before chrome_webauthn_add).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_webauthn_add', description: 'Add a virtual passkey authenticator. Lets sites that use WebAuthn (passkey sign-in) work without hardware. Returns authenticatorId.',
    inputSchema: { type: 'object', properties: {
      protocol: { type: 'string', enum: ['u2f', 'ctap2'] },
      transport: { type: 'string', enum: ['usb', 'nfc', 'ble', 'internal', 'hybrid'] },
      hasResidentKey: { type: 'boolean' },
      hasUserVerification: { type: 'boolean' },
    }, additionalProperties: false } },
  { name: 'chrome_webauthn_remove', description: 'Remove a virtual authenticator.',
    inputSchema: { type: 'object', properties: { authenticatorId: { type: 'string' } }, required: ['authenticatorId'], additionalProperties: false } },
  { name: 'chrome_webauthn_creds', description: 'List credentials stored in a virtual authenticator.',
    inputSchema: { type: 'object', properties: { authenticatorId: { type: 'string' } }, required: ['authenticatorId'], additionalProperties: false } },
  { name: 'chrome_webauthn_clear_creds', description: 'Wipe all credentials from a virtual authenticator.',
    inputSchema: { type: 'object', properties: { authenticatorId: { type: 'string' } }, required: ['authenticatorId'], additionalProperties: false } },
  { name: 'chrome_webauthn_verify', description: 'Set the user-verified flag on a virtual authenticator (simulates a biometric prompt success).',
    inputSchema: { type: 'object', properties: { authenticatorId: { type: 'string' }, isUserVerified: { type: 'boolean' } }, required: ['authenticatorId'], additionalProperties: false } },

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 4 — Fetch interception · Console · Accessibility · CSS
  // ════════════════════════════════════════════════════════════════════════

  { name: 'chrome_fetch_enable', description: 'Enable request interception. Each matching request is PAUSED until you call chrome_fetch_continue / fail / fulfill. Auto-continue fires after 10s if you forget.',
    inputSchema: { type: 'object', properties: { patterns: { type: 'array', description: 'CDP Fetch.RequestPattern array; default = match all' } }, additionalProperties: false } },
  { name: 'chrome_fetch_disable', description: 'Disable request interception. Any paused requests are released.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_fetch_pending', description: 'List requests currently paused waiting for a continue/fail/fulfill decision.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_fetch_continue', description: 'Release a paused request. Optionally rewrite url/method/postData/headers before forwarding.',
    inputSchema: { type: 'object', properties: { requestId: { type: 'string' }, url: { type: 'string' }, method: { type: 'string' }, postData: { type: 'string' }, headers: { type: 'array' } }, required: ['requestId'], additionalProperties: false } },
  { name: 'chrome_fetch_fail', description: 'Fail a paused request with an error reason (BlockedByClient, Aborted, AccessDenied, etc).',
    inputSchema: { type: 'object', properties: { requestId: { type: 'string' }, errorReason: { type: 'string' } }, required: ['requestId'], additionalProperties: false } },
  { name: 'chrome_fetch_fulfill', description: 'Return a fake response for a paused request — mock APIs without touching the network.',
    inputSchema: { type: 'object', properties: { requestId: { type: 'string' }, responseCode: { type: 'integer' }, responseHeaders: { type: 'array' }, body: { type: 'string', description: 'Plain text or stringified JSON; we base64-encode for you' } }, required: ['requestId'], additionalProperties: false } },
  { name: 'chrome_console_subscribe', description: 'Start capturing console.log / pageerror messages on the active tab (circular buffer of 500). Auto-on after first chrome_console_recent call.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_console_recent', description: 'Get the most recent N console messages from the active tab. Set clear=true to flush after reading.',
    inputSchema: { type: 'object', properties: { limit: { type: 'integer', description: 'Default 100, max 500' }, clear: { type: 'boolean' },
 targetId: TARGET_ID_PROP,
}, additionalProperties: false } },
  { name: 'chrome_a11y_enable', description: 'Enable accessibility tree generation for the active tab.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_a11y_tree', description: 'Get the FULL accessibility tree — often a better page representation for LLMs than raw DOM (labeled, pruned to interactive content).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_a11y_query', description: 'Get accessibility nodes matching a role (e.g. "button", "link", "textbox", "heading").',
    inputSchema: { type: 'object', properties: { role: { type: 'string' } }, required: ['role'], additionalProperties: false } },
  { name: 'chrome_css_computed', description: 'Get the FULL computed CSS for an element. Returns flat name→value object.',
    inputSchema: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'], additionalProperties: false } },
  { name: 'chrome_css_matched', description: 'Get matched style rules + inheritance chain for an element — exactly what DevTools shows in the Styles panel.',
    inputSchema: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'], additionalProperties: false } },

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 5 — Performance · Security · ServiceWorker · Browser
  // ════════════════════════════════════════════════════════════════════════

  { name: 'chrome_perf_metrics', description: 'Snapshot of performance metrics — JS heap, layout/paint counts, frame stats, etc.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_perf_cpu_start', description: 'Start CPU profiling on the active tab.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_perf_cpu_stop', description: 'Stop CPU profiling and return the profile object.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_perf_trace_start', description: 'Start a full Chrome perf trace (chrome://tracing format). Pass categories like "*" or "blink.*,v8.*".',
    inputSchema: { type: 'object', properties: { categories: { type: 'string' } }, additionalProperties: false } },
  { name: 'chrome_perf_trace_stop', description: 'Stop the in-progress trace. (Full event collection requires chrome_cdp_raw on Tracing.dataCollected events.)',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_security_status', description: 'Get TLS/security isolation status for the active tab — cross-origin isolation, certificate state.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_sw_enable', description: 'Enable ServiceWorker domain so chrome_sw_* operations can target workers.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_sw_unregister', description: 'Unregister a service worker by scope URL.',
    inputSchema: { type: 'object', properties: { scopeURL: { type: 'string' } }, required: ['scopeURL'], additionalProperties: false } },
  { name: 'chrome_sw_stop', description: 'Stop a running service worker by version id (from CDP ServiceWorker events).',
    inputSchema: { type: 'object', properties: { versionId: { type: 'string' } }, required: ['versionId'], additionalProperties: false } },
  { name: 'chrome_browser_grant_perms', description: 'Grant permissions (geolocation, notifications, camera, etc.) to a specific origin without showing the prompt.',
    inputSchema: { type: 'object', properties: { origin: { type: 'string' }, permissions: { type: 'array', items: { type: 'string' }, description: 'e.g. ["geolocation","notifications","camera","microphone"]' } }, additionalProperties: false } },
  { name: 'chrome_browser_reset_perms', description: 'Reset all permission grants back to default (prompt).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_browser_downloads', description: 'Configure download behavior: allow + path, or deny.',
    inputSchema: { type: 'object', properties: { behavior: { type: 'string', enum: ['deny', 'allow', 'allowAndName', 'default'] }, downloadPath: { type: 'string' } }, additionalProperties: false } },

  // ── Convenience: open chrome:// internal pages ─────────────────────────
  { name: 'chrome_open_internal', description: 'Open a chrome:// internal page like "settings", "flags", "extensions", "history", "downloads". Allowlisted — crash/kill/hang pages are refused.',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Page name without prefix (e.g. "settings", "flags") or full chrome://name URL' } }, required: ['name'], additionalProperties: false } },

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 6 — Extension API bridge (chrome.* APIs CDP cannot reach)
  // Routed through the auto-loaded MV3 companion extension. Requires Chrome
  // to be running; the companion auto-loads on chrome_launch.
  // ════════════════════════════════════════════════════════════════════════

  // ── Tab Groups ─────────────────────────────────────────────────────────
  { name: 'chrome_ext_tabgroups_query', description: 'Query tab groups (visible Chrome groups, with id/title/color/collapsed state).',
    inputSchema: { type: 'object', properties: { collapsed: { type: 'boolean' }, color: { type: 'string' }, title: { type: 'string' }, windowId: { type: 'integer' } }, additionalProperties: false } },
  { name: 'chrome_ext_tabgroups_update', description: 'Update tab-group properties: title, color (grey/blue/red/yellow/green/pink/purple/cyan/orange), collapsed.',
    inputSchema: { type: 'object', properties: { groupId: { type: 'integer' }, updateProps: { type: 'object' } }, required: ['groupId', 'updateProps'], additionalProperties: false } },
  { name: 'chrome_ext_tabs_group', description: 'Group one or more tabs together. Pass tabIds (array of tab integers) + optional groupId (existing group) OR createProperties.',
    inputSchema: { type: 'object', properties: { tabIds: { type: 'array', items: { type: 'integer' } }, groupId: { type: 'integer' }, createProperties: { type: 'object' } }, additionalProperties: false } },
  { name: 'chrome_ext_tabs_ungroup', description: 'Remove tabs from their group(s).',
    inputSchema: { type: 'object', properties: { tabIds: { type: 'array', items: { type: 'integer' } } }, required: ['tabIds'], additionalProperties: false } },

  // ── Sessions (recently closed, restore) ───────────────────────────────
  { name: 'chrome_ext_sessions_recent', description: 'List recently closed tabs/windows (Chrome\'s own — separate from Claude profile history).',
    inputSchema: { type: 'object', properties: { maxResults: { type: 'integer' } }, additionalProperties: false } },
  { name: 'chrome_ext_sessions_restore', description: 'Restore a closed tab/window by sessionId (from chrome_ext_sessions_recent).',
    inputSchema: { type: 'object', properties: { sessionId: { type: 'string' } }, additionalProperties: false } },

  // ── Reading List (Chrome\'s built-in) ──────────────────────────────────
  { name: 'chrome_ext_readlist_query', description: 'Query Chrome\'s native Reading List (has-been-read flag, etc).',
    inputSchema: { type: 'object', properties: { hasBeenRead: { type: 'boolean' } }, additionalProperties: false } },
  { name: 'chrome_ext_readlist_add', description: 'Add to Chrome\'s native Reading List.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' }, title: { type: 'string' }, hasBeenRead: { type: 'boolean' } }, required: ['url'], additionalProperties: false } },
  { name: 'chrome_ext_readlist_remove', description: 'Remove a Reading List entry by URL.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'], additionalProperties: false } },

  // ── History (Chrome\'s own — different from Claude profile history) ────
  { name: 'chrome_ext_history_search', description: 'Search Chrome\'s native history (full DB, much larger than what Claude profile records).',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, startTime: { type: 'number' }, endTime: { type: 'number' }, maxResults: { type: 'integer' } }, required: ['text'], additionalProperties: false } },
  { name: 'chrome_ext_history_del_url', description: 'Delete one URL from Chrome\'s history.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'], additionalProperties: false } },
  { name: 'chrome_ext_history_del_all', description: 'Wipe ALL of Chrome\'s history. Destructive.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },

  // ── Bookmarks (Chrome\'s native bookmark tree) ─────────────────────────
  { name: 'chrome_ext_bookmarks_tree', description: 'Get Chrome\'s full bookmark tree.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_ext_bookmarks_search', description: 'Search Chrome\'s bookmarks by query string.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } },
  { name: 'chrome_ext_bookmarks_create', description: 'Create a bookmark or folder. parentId optional (defaults to bookmarks bar).',
    inputSchema: { type: 'object', properties: { parentId: { type: 'string' }, title: { type: 'string' }, url: { type: 'string', description: 'Omit to create a folder' } }, additionalProperties: false } },
  { name: 'chrome_ext_bookmarks_remove', description: 'Remove a bookmark by id (from tree/search).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },

  // ── Downloads ──────────────────────────────────────────────────────────
  { name: 'chrome_ext_downloads_search', description: 'Search Chrome\'s downloads (in-progress + completed).',
    inputSchema: { type: 'object', properties: { query: { type: 'array', items: { type: 'string' } }, state: { type: 'string', enum: ['in_progress','interrupted','complete'] }, limit: { type: 'integer' } }, additionalProperties: false } },
  { name: 'chrome_ext_downloads_start', description: 'Start a download from a URL (with optional filename / save-as prompt).',
    inputSchema: { type: 'object', properties: { url: { type: 'string' }, filename: { type: 'string' }, saveAs: { type: 'boolean' } }, required: ['url'], additionalProperties: false } },
  { name: 'chrome_ext_downloads_cancel', description: 'Cancel an in-progress download.',
    inputSchema: { type: 'object', properties: { downloadId: { type: 'integer' } }, required: ['downloadId'], additionalProperties: false } },
  { name: 'chrome_ext_downloads_open', description: 'Open a completed downloaded file.',
    inputSchema: { type: 'object', properties: { downloadId: { type: 'integer' } }, required: ['downloadId'], additionalProperties: false } },

  // ── Management (control OTHER Chrome extensions) ──────────────────────
  { name: 'chrome_ext_mgmt_list', description: 'List ALL installed extensions in Claude\'s Chrome (including this companion).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_ext_mgmt_enable', description: 'Enable or disable an extension by id.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, enabled: { type: 'boolean' } }, required: ['id', 'enabled'], additionalProperties: false } },
  { name: 'chrome_ext_mgmt_uninstall', description: 'Uninstall an extension by id.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, options: { type: 'object', properties: { showConfirmDialog: { type: 'boolean' } } } }, required: ['id'], additionalProperties: false } },

  // ── declarativeNetRequest (fast ad-block-grade rules) ─────────────────
  { name: 'chrome_ext_dnr_update', description: 'Add/remove dynamic declarativeNetRequest rules — faster than Fetch interception for "block X" / "redirect X to Y" patterns.',
    inputSchema: { type: 'object', properties: { addRules: { type: 'array' }, removeRuleIds: { type: 'array', items: { type: 'integer' } } }, additionalProperties: false } },
  { name: 'chrome_ext_dnr_list', description: 'List currently active dynamic DNR rules.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },

  // ── Search ─────────────────────────────────────────────────────────────
  { name: 'chrome_ext_search', description: 'Programmatic omnibox search — runs a query through the default search engine.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, disposition: { type: 'string', enum: ['CURRENT_TAB', 'NEW_TAB', 'NEW_WINDOW'] }, tabId: { type: 'integer' } }, required: ['text'], additionalProperties: false } },

  // ── System ─────────────────────────────────────────────────────────────
  { name: 'chrome_ext_system_cpu', description: 'Get CPU info — model, architecture, per-core usage.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_ext_system_memory', description: 'Get memory info — total / available physical RAM.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_ext_system_display', description: 'Get display info — all monitors, resolution, scale factor.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_ext_system_storage', description: 'Get storage device info — disks, capacity, type.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_ext_top_sites', description: 'Get the user\'s most-visited sites (Chrome\'s "Top Sites" list).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },

  // ── Notifications ──────────────────────────────────────────────────────
  { name: 'chrome_ext_notify', description: 'Show a native OS notification (via Chrome) — appears in system tray.',
    inputSchema: { type: 'object', properties: { notificationId: { type: 'string' }, options: { type: 'object', properties: { type: { type: 'string', enum: ['basic','image','list','progress'] }, iconUrl: { type: 'string' }, title: { type: 'string' }, message: { type: 'string' } }, required: ['type', 'iconUrl', 'title', 'message'] } }, required: ['options'], additionalProperties: false } },

  // ════════════════════════════════════════════════════════════════════════
  // PHASE 7 — Closed-Chrome file/registry editors
  // The ~5% of Chrome settings that have NO CDP and NO extension-API
  // surface. Requires Chrome to be CLOSED (auto-asserts; clean error if
  // it's running). Every write creates a sibling .bak.<timestamp>.
  // ════════════════════════════════════════════════════════════════════════

  { name: 'chrome_files_info', description: 'Get paths to Claude\'s Chrome profile files (Local State, Preferences, Bookmarks JSON) + running state. Use this to understand the layout before editing.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_flags_list', description: 'List the contents of browser.enabled_labs_experiments from Local State (each entry like "enable-quic@1"). This is the file-level chrome://flags state.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_flags_set', description: 'Overwrite the full list of enabled labs experiments (chrome://flags). Auto-backups Local State first. Chrome MUST be closed. Format: ["flag-name@1", "another-flag@2"].',
    inputSchema: { type: 'object', properties: { flags: { type: 'array', items: { type: 'string' } } }, required: ['flags'], additionalProperties: false } },
  { name: 'chrome_prefs_get', description: 'Read one preference value by dotted path (e.g. "browser.show_home_button", "homepage", "session.startup_urls"). Chrome can be running for reads.',
    inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'], additionalProperties: false } },
  { name: 'chrome_prefs_set', description: 'Set or delete one preference by dotted path. value=null deletes the key. Auto-backups Preferences first. Chrome MUST be closed.',
    inputSchema: { type: 'object', properties: { key: { type: 'string' }, value: {} }, required: ['key'], additionalProperties: false } },
  { name: 'chrome_prefs_list', description: 'List top-level Preferences keys (browser, profile, session, extensions, sync, ...) for orientation.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_bookmarks_json_read', description: 'Read Chrome\'s raw Bookmarks JSON (full bookmark tree). Read-safe while Chrome runs.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_bookmarks_json_write', description: 'Overwrite Chrome\'s Bookmarks JSON with a new tree. Auto-backups first. Chrome MUST be closed. Pass the full tree object as data.',
    inputSchema: { type: 'object', properties: { data: { type: 'object' } }, required: ['data'], additionalProperties: false } },
  { name: 'chrome_policy_list', description: 'Enumerate Chrome group policies set under HKCU\\Software\\Policies\\Google\\Chrome (Windows-only). Read-only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'chrome_policy_set', description: 'Set a Chrome group policy in HKCU (Windows-only). Examples: HomepageLocation, DefaultSearchProviderEnabled, RestoreOnStartup. Restart required.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, value: {}, type: { type: 'string', enum: ['REG_SZ', 'REG_DWORD', 'REG_MULTI_SZ'] } }, required: ['name', 'value'], additionalProperties: false } },
  { name: 'chrome_policy_delete', description: 'Delete a Chrome group policy from HKCU (Windows-only).',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false } },

  // ── Phase 25b · Director + Team (app control, not browser) ─────────────────
  // Let a Director-Claude run an agent team over the shared kanban: decompose a
  // goal into role-tagged tasks, watch the board, gate reviews. Coordination is
  // KANBAN-BUS + DIRECTOR-GATED (see electron/director.js). Roles: researcher,
  // architect, backend, frontend, data, qa, security, reviewer, media, devops, docs.
  { name: 'team_list', description: 'List the agent-team roster: the 11 specialist roles (researcher, architect, backend, frontend, data, qa, security, reviewer, media, devops, docs) + Director, with each role\'s skills, MCP servers, and colour. Call this first to learn the valid `assignee` values for director_plan.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'team_spawn', description: 'Spawn a ready-to-go team workspace in the CCM app: opens the shared task board plus a Director terminal and one role-injected Claude terminal per agent (each launched with its role system prompt). Use this to stand up the whole team in one call, then drive it with director_plan / director_next. Returns immediately while terminals spin up (staggered).',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'kanban_read', description: 'Read the shared task board (kanban) — columns (To do / In progress / Needs review / Done) and all tasks with id, col, title, body, tags, priority, assignee (agent role), deps (prerequisite task ids). This is the team\'s coordination bus.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'kanban_add', description: 'Add one task to the board. For team work set `assignee` (an agent role) and `deps` (ids of tasks that must reach Done first). Prefer director_plan to write a whole decomposition at once.',
    inputSchema: { type: 'object', properties: {
      title: { type: 'string' }, body: { type: 'string' },
      col: { type: 'string', enum: ['todo', 'doing', 'review', 'done'], description: 'Default todo' },
      assignee: { type: 'string', description: 'Agent role (see team_list)' },
      deps: { type: 'array', items: { type: 'string' }, description: 'Task ids that must be Done first' },
      priority: { type: 'string', enum: ['low', 'med', 'high'] },
      tags: { type: 'array', items: { type: 'string' } },
    }, required: ['title'], additionalProperties: false } },
  { name: 'kanban_update', description: 'Patch a task by id (title, body, priority, assignee, deps, tags, col).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, patch: { type: 'object' } }, required: ['id', 'patch'], additionalProperties: false } },
  { name: 'kanban_move', description: 'Move a task to a column (todo/doing/review/done) and/or reorder it. Agents use this to report progress: doing = In progress, review = Needs review (→ redirected to the Director). Agents cannot self-finalise — see director_approve.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, col: { type: 'string', enum: ['todo', 'doing', 'review', 'done'] }, order: { type: 'number' } }, required: ['id'], additionalProperties: false } },
  { name: 'kanban_delete', description: 'Delete a task by id.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
  { name: 'director_plan', description: 'Load a goal decomposition: an array of role-tagged tasks (each {title, body?, assignee, deps?:[index|id], priority?}). VALIDATES roles, dependency references, and rejects cycles before writing. deps may reference earlier tasks by array index. Writes the plan to the board as the team\'s work queue. Set replace:true to clear prior team tasks first.',
    inputSchema: { type: 'object', properties: {
      tasks: { type: 'array', items: { type: 'object', properties: {
        title: { type: 'string' }, body: { type: 'string' },
        assignee: { type: 'string' },
        deps: { type: 'array', items: { type: ['integer', 'string'] } },
        priority: { type: 'string', enum: ['low', 'med', 'high'] },
      }, required: ['title', 'assignee'] } },
      replace: { type: 'boolean' },
    }, required: ['tasks'], additionalProperties: false } },
  { name: 'director_status', description: 'Team snapshot: per-agent state (idle/queued/doing/review), each agent\'s active task, done/total counts, board counts, and whether the run is complete or stalled.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'director_next', description: 'Advance the board: assign the next ready task to each idle agent (director-gated — one active task per agent; a task is only ready when all its deps are Done). Moves those tasks To do → In progress and returns what was dispatched.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'director_review', description: 'The Needs-review queue: tasks an agent has finished and handed back to the Director for sign-off.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'director_approve', description: 'Approve a reviewed task → Done. This is the gate: only the Director finalises a task, which unblocks its dependents and frees the agent for its next task.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
  { name: 'director_reject', description: 'Reject a reviewed task → back to In progress for rework (optionally with a reason).',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, reason: { type: 'string' } }, required: ['id'], additionalProperties: false } },
  { name: 'agent_send', description: 'Inject a prompt directly into a spawned agent\'s terminal (the Director\'s drive channel — the input half of the loop). The text is typed into that role\'s claude CLI and submitted. Use to kick off, nudge, or follow up with a specific agent. Note: director_next already auto-kicks each agent it assigns, so use this for ad-hoc messages or to re-prod a stalled agent. role = one of the team roles; the agent must have a live terminal (team_spawn first).',
    inputSchema: { type: 'object', properties: { role: { type: 'string', description: 'Agent role (researcher, architect, backend, frontend, data, qa, security, reviewer, media, devops, docs, director)' }, text: { type: 'string', description: 'The message/prompt to type into that agent\'s terminal' } }, required: ['role', 'text'], additionalProperties: false } },

  // ── Phase 27 · Cross-LLM media generation ──────────────────────────────────
  // Let Claude create media with OTHER models: Imagen (image) + Veo (video) via
  // Google's @google/genai (Gemini key reused from gemini_desktop), and ChatGPT/
  // DALL·E via the headless gpt_cli. Outputs save to the project's generated-media/.
  { name: 'imagen_generate', description: 'Generate image(s) with Google Imagen. Saves PNG(s) to the project\'s generated-media/ folder and returns their absolute paths. Uses the Gemini key reused from gemini_desktop (billing required). Default model imagen-4.0-generate-001.',
    inputSchema: { type: 'object', properties: {
      prompt: { type: 'string', description: 'What to generate' },
      count: { type: 'integer', description: '1–4 images (default 1)' },
      aspectRatio: { type: 'string', enum: ['1:1', '3:4', '4:3', '9:16', '16:9'], description: 'default 1:1' },
      model: { type: 'string', description: 'override, e.g. imagen-3.0-generate-002, imagen-4.0-fast-generate-001' },
    }, required: ['prompt'], additionalProperties: false } },
  { name: 'veo_generate', description: 'Start a Google Veo VIDEO generation. Returns a jobId IMMEDIATELY — generation takes minutes — then poll veo_status with that jobId until status is "done" (which returns the saved .mp4 path). Default model veo-3.0-fast-generate-preview. Veo needs billing/allowlisting on the key.',
    inputSchema: { type: 'object', properties: {
      prompt: { type: 'string', description: 'What to generate' },
      aspectRatio: { type: 'string', enum: ['16:9', '9:16'], description: 'default 16:9' },
      negativePrompt: { type: 'string', description: 'what to avoid' },
      model: { type: 'string', description: 'override, e.g. veo-2.0-generate-001, veo-3.0-generate-preview' },
    }, required: ['prompt'], additionalProperties: false } },
  { name: 'veo_status', description: 'Check a Veo job started with veo_generate. Returns status processing|done|error (+ elapsedSec while processing); when done, returns the saved .mp4 path(s).',
    inputSchema: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'], additionalProperties: false } },
  { name: 'gpt_ask', description: 'Ask ChatGPT or a custom GPT via the headless gpt_cli (drives your logged-in ChatGPT over a private Chrome profile — NO API key needed). Returns the answer text and the paths of any DALL·E images it generated. Takes ~15s–2min. gptId targets a specific custom GPT; newConvo starts a fresh thread.',
    inputSchema: { type: 'object', properties: {
      prompt: { type: 'string', description: 'Message to send' },
      gptId: { type: 'string', description: 'custom GPT id, e.g. g-69aa38ff...' },
      newConvo: { type: 'boolean', description: 'start a new conversation thread' },
    }, required: ['prompt'], additionalProperties: false } },
  { name: 'media_status', description: 'Report media-generation readiness: whether a Gemini key is available (reused from gemini_desktop), the output directory, and active Veo job count.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
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
    case 'chrome_runtime_run':      return callOp('chrome-runtime-run', args);

    // ── Chrome · DOM ────────────────────────────────────────────
    case 'chrome_dom_query':        return callOp('chrome-dom-query', args);
    case 'chrome_dom_query_all':    return callOp('chrome-dom-query-all', args);
    case 'chrome_dom_get_text':     return callOp('chrome-dom-get-text', args);
    case 'chrome_dom_click':        return callOp('chrome-dom-click', args);

    // ── Phase 8 · CodeMirror primitives ─────────────────────────
    case 'chrome_cm_focus':         return callOp('chrome-cm-focus');
    case 'chrome_cm_goto_line':     return callOp('chrome-cm-goto-line', args);
    case 'chrome_cm_replace_line':  return callOp('chrome-cm-replace-line', args);

    // ── Phase 9 · multi-file batch, open-at-line, picker ────────
    case 'chrome_cm_ensure_editor': return callOp('chrome-cm-ensure-editor');
    case 'chrome_cm_open_at_line':  return callOp('chrome-cm-open-at-line', args);
    case 'chrome_cm_edit_atomic':   return callOp('chrome-cm-edit-atomic', args);
    case 'chrome_picker_install':   return callOp('chrome-picker-install');
    case 'chrome_picker_capture':   return callOp('chrome-picker-capture', args);
    case 'chrome_picker_cancel':    return callOp('chrome-picker-cancel');

    // ── Phase 15 · split-view state (parallel pane control) ─────
    case 'chrome_split_state':      return callOp('chrome-split-state');

    // ── Phase 16 · Claude-controllable split layout ─────────────
    case 'chrome_split_enable':     return callOp('chrome-split-enable', args);
    case 'chrome_split_disable':    return callOp('chrome-split-disable');
    case 'chrome_split_swap':       return callOp('chrome-split-swap');
    case 'chrome_split_set_ratio':  return callOp('chrome-split-set-ratio', args);

    // ── Chrome · input ──────────────────────────────────────────
    case 'chrome_input_click':      return callOp('chrome-input-click', args);
    case 'chrome_input_type':       return callOp('chrome-input-type', args);
    case 'chrome_input_key':        return callOp('chrome-input-key', args);
    case 'chrome_input_scroll':     return callOp('chrome-input-scroll', args);

    // ── Chrome · generic CDP escape hatch ───────────────────────
    case 'chrome_cdp_raw':          return callOp('chrome-cdp-raw', args);

    // ── Chrome · semantic observation (Phase 11) ────────────────
    case 'chrome_observe':          return callOp('chrome-observe', args);
    case 'chrome_observe_delta':    return callOp('chrome-observe-delta', args);
    case 'chrome_click_ref':        return callOp('chrome-click-ref', args);
    case 'chrome_type_ref':         return callOp('chrome-type-ref', args);
    case 'chrome_focus_ref':        return callOp('chrome-focus-ref', args);
    case 'chrome_stabilize':        return callOp('chrome-stabilize', args);
    case 'chrome_step':             return callOp('chrome-step', args);

    // ── Chrome · cross-origin frame access ──────────────────────
    case 'chrome_frame_list':       return callOp('chrome-frame-list');
    case 'chrome_frame_attach':     return callOp('chrome-frame-attach', args);
    case 'chrome_frame_detach':     return callOp('chrome-frame-detach', args);
    case 'chrome_frame_eval':       return callOp('chrome-frame-eval', args);
    case 'chrome_frame_click':      return callOp('chrome-frame-click', args);
    case 'chrome_frame_type':       return callOp('chrome-frame-type', args);

    // ── Phase 2 · Network ───────────────────────────────────────
    case 'chrome_net_cookies_get':       return callOp('chrome-net-cookies-get', args);
    case 'chrome_net_cookie_set':        return callOp('chrome-net-cookie-set', args);
    case 'chrome_net_cookies_delete':    return callOp('chrome-net-cookies-delete', args);
    case 'chrome_net_cookies_clear_all': return callOp('chrome-net-cookies-clear-all');
    case 'chrome_net_extra_headers':     return callOp('chrome-net-extra-headers', args);
    case 'chrome_net_block_urls':        return callOp('chrome-net-block-urls', args);
    case 'chrome_net_user_agent':        return callOp('chrome-net-user-agent', args);

    // ── Phase 2 · Storage ───────────────────────────────────────
    case 'chrome_storage_clear_origin':  return callOp('chrome-storage-clear-origin', args);
    case 'chrome_storage_usage':         return callOp('chrome-storage-usage', args);
    case 'chrome_storage_cookies':       return callOp('chrome-storage-cookies', args);
    case 'chrome_domstorage_get':        return callOp('chrome-domstorage-get', args);
    case 'chrome_domstorage_set':        return callOp('chrome-domstorage-set', args);
    case 'chrome_domstorage_remove':     return callOp('chrome-domstorage-remove', args);
    case 'chrome_domstorage_clear':      return callOp('chrome-domstorage-clear', args);
    case 'chrome_idb_list':              return callOp('chrome-idb-list', args);
    case 'chrome_idb_delete':            return callOp('chrome-idb-delete', args);
    case 'chrome_cache_list':            return callOp('chrome-cache-list', args);
    case 'chrome_cache_delete':          return callOp('chrome-cache-delete', args);

    // ── Phase 2 · Emulation ─────────────────────────────────────
    case 'chrome_emulate_ua':            return callOp('chrome-emulate-ua', args);
    case 'chrome_emulate_geo':           return callOp('chrome-emulate-geo', args);
    case 'chrome_emulate_geo_clear':     return callOp('chrome-emulate-geo-clear');
    case 'chrome_emulate_timezone':      return callOp('chrome-emulate-timezone', args);
    case 'chrome_emulate_locale':        return callOp('chrome-emulate-locale', args);
    case 'chrome_emulate_device':        return callOp('chrome-emulate-device', args);
    case 'chrome_emulate_device_clear':  return callOp('chrome-emulate-device-clear');
    case 'chrome_emulate_color_scheme':  return callOp('chrome-emulate-color-scheme', args);
    case 'chrome_emulate_network':       return callOp('chrome-emulate-network', args);
    case 'chrome_emulate_cpu':           return callOp('chrome-emulate-cpu', args);
    case 'chrome_emulate_vision':        return callOp('chrome-emulate-vision', args);

    // ── Phase 3 · Extensions / Autofill / WebAuthn ──────────────
    case 'chrome_ext_load_unpacked':     return callOp('chrome-ext-load-unpacked', args);
    case 'chrome_ext_uninstall':         return callOp('chrome-ext-uninstall', args);
    case 'chrome_autofill_trigger':      return callOp('chrome-autofill-trigger', args);
    case 'chrome_autofill_set_addresses':return callOp('chrome-autofill-set-addr', args);
    case 'chrome_webauthn_enable':       return callOp('chrome-webauthn-enable');
    case 'chrome_webauthn_add':          return callOp('chrome-webauthn-add', args);
    case 'chrome_webauthn_remove':       return callOp('chrome-webauthn-remove', args);
    case 'chrome_webauthn_creds':        return callOp('chrome-webauthn-creds', args);
    case 'chrome_webauthn_clear_creds':  return callOp('chrome-webauthn-clear-creds', args);
    case 'chrome_webauthn_verify':       return callOp('chrome-webauthn-verify', args);

    // ── Phase 4 · Fetch / Console / A11y / CSS ──────────────────
    case 'chrome_fetch_enable':          return callOp('chrome-fetch-enable', args);
    case 'chrome_fetch_disable':         return callOp('chrome-fetch-disable');
    case 'chrome_fetch_pending':         return callOp('chrome-fetch-pending');
    case 'chrome_fetch_continue':        return callOp('chrome-fetch-continue', args);
    case 'chrome_fetch_fail':            return callOp('chrome-fetch-fail', args);
    case 'chrome_fetch_fulfill':         return callOp('chrome-fetch-fulfill', args);
    case 'chrome_console_subscribe':     return callOp('chrome-console-subscribe');
    case 'chrome_console_recent':        return callOp('chrome-console-recent', args);
    case 'chrome_a11y_enable':           return callOp('chrome-a11y-enable');
    case 'chrome_a11y_tree':             return callOp('chrome-a11y-tree');
    case 'chrome_a11y_query':            return callOp('chrome-a11y-query', args);
    case 'chrome_css_computed':          return callOp('chrome-css-computed', args);
    case 'chrome_css_matched':           return callOp('chrome-css-matched', args);

    // ── Phase 5 · Perf / Security / SW / Browser ────────────────
    case 'chrome_perf_metrics':          return callOp('chrome-perf-metrics');
    case 'chrome_perf_cpu_start':        return callOp('chrome-perf-cpu-start');
    case 'chrome_perf_cpu_stop':         return callOp('chrome-perf-cpu-stop');
    case 'chrome_perf_trace_start':      return callOp('chrome-perf-trace-start', args);
    case 'chrome_perf_trace_stop':       return callOp('chrome-perf-trace-stop');
    case 'chrome_security_status':       return callOp('chrome-security-status');
    case 'chrome_sw_enable':              return callOp('chrome-sw-enable');
    case 'chrome_sw_unregister':         return callOp('chrome-sw-unregister', args);
    case 'chrome_sw_stop':               return callOp('chrome-sw-stop', args);
    case 'chrome_browser_grant_perms':   return callOp('chrome-browser-grant-perms', args);
    case 'chrome_browser_reset_perms':   return callOp('chrome-browser-reset-perms', args);
    case 'chrome_browser_downloads':     return callOp('chrome-browser-downloads', args);

    // ── Convenience ─────────────────────────────────────────────
    case 'chrome_open_internal':         return callOp('chrome-open-internal', args);

    // ── Phase 6 · Extension API bridge ──────────────────────────
    case 'chrome_ext_tabgroups_query':   return callOp('chrome-ext-tabgroups-query', args);
    case 'chrome_ext_tabgroups_update':  return callOp('chrome-ext-tabgroups-update', args);
    case 'chrome_ext_tabs_group':        return callOp('chrome-ext-tabs-group', args);
    case 'chrome_ext_tabs_ungroup':      return callOp('chrome-ext-tabs-ungroup', args);
    case 'chrome_ext_sessions_recent':   return callOp('chrome-ext-sessions-recent', args);
    case 'chrome_ext_sessions_restore':  return callOp('chrome-ext-sessions-restore', args);
    case 'chrome_ext_readlist_query':    return callOp('chrome-ext-readlist-query', args);
    case 'chrome_ext_readlist_add':      return callOp('chrome-ext-readlist-add', args);
    case 'chrome_ext_readlist_remove':   return callOp('chrome-ext-readlist-remove', args);
    case 'chrome_ext_history_search':    return callOp('chrome-ext-history-search', args);
    case 'chrome_ext_history_del_url':   return callOp('chrome-ext-history-del-url', args);
    case 'chrome_ext_history_del_all':   return callOp('chrome-ext-history-del-all');
    case 'chrome_ext_bookmarks_tree':    return callOp('chrome-ext-bookmarks-tree');
    case 'chrome_ext_bookmarks_search':  return callOp('chrome-ext-bookmarks-search', args);
    case 'chrome_ext_bookmarks_create':  return callOp('chrome-ext-bookmarks-create', args);
    case 'chrome_ext_bookmarks_remove':  return callOp('chrome-ext-bookmarks-remove', args);
    case 'chrome_ext_downloads_search':  return callOp('chrome-ext-downloads-search', args);
    case 'chrome_ext_downloads_start':   return callOp('chrome-ext-downloads-start', args);
    case 'chrome_ext_downloads_cancel':  return callOp('chrome-ext-downloads-cancel', args);
    case 'chrome_ext_downloads_open':    return callOp('chrome-ext-downloads-open', args);
    case 'chrome_ext_mgmt_list':         return callOp('chrome-ext-mgmt-list');
    case 'chrome_ext_mgmt_enable':       return callOp('chrome-ext-mgmt-enable', args);
    case 'chrome_ext_mgmt_uninstall':    return callOp('chrome-ext-mgmt-uninstall', args);
    case 'chrome_ext_dnr_update':        return callOp('chrome-ext-dnr-update', args);
    case 'chrome_ext_dnr_list':          return callOp('chrome-ext-dnr-list');
    case 'chrome_ext_search':            return callOp('chrome-ext-search', args);
    case 'chrome_ext_system_cpu':        return callOp('chrome-ext-system-cpu');
    case 'chrome_ext_system_memory':     return callOp('chrome-ext-system-memory');
    case 'chrome_ext_system_display':    return callOp('chrome-ext-system-display');
    case 'chrome_ext_system_storage':    return callOp('chrome-ext-system-storage');
    case 'chrome_ext_top_sites':         return callOp('chrome-ext-top-sites');
    case 'chrome_ext_notify':            return callOp('chrome-ext-notify', args);

    // ── Phase 7 · Closed-Chrome file/registry editors ───────────
    case 'chrome_files_info':            return callOp('chrome-files-info');
    case 'chrome_flags_list':            return callOp('chrome-flags-list');
    case 'chrome_flags_set':             return callOp('chrome-flags-set', args);
    case 'chrome_prefs_get':             return callOp('chrome-prefs-get', args);
    case 'chrome_prefs_set':             return callOp('chrome-prefs-set', args);
    case 'chrome_prefs_list':            return callOp('chrome-prefs-list');
    case 'chrome_bookmarks_json_read':   return callOp('chrome-bookmarks-json-read');
    case 'chrome_bookmarks_json_write':  return callOp('chrome-bookmarks-json-write', args);
    case 'chrome_policy_list':           return callOp('chrome-policy-list');
    case 'chrome_policy_set':            return callOp('chrome-policy-set', args);
    case 'chrome_policy_delete':         return callOp('chrome-policy-delete', args);

    // ── Phase 25b · Director + Team (app control) ──────────────────────────
    case 'team_list':        return callOp('team-list');
    case 'team_spawn':       return callOp('team-spawn');
    case 'kanban_read':      return callOp('kanban-read');
    case 'kanban_add':       return callOp('kanban-add',     args);
    case 'kanban_update':    return callOp('kanban-update',  args);
    case 'kanban_move':      return callOp('kanban-move',    args);
    case 'kanban_delete':    return callOp('kanban-delete',  args);
    case 'director_plan':    return callOp('director-plan',  args);
    case 'director_status':  return callOp('director-status');
    case 'director_next':    return callOp('director-next');
    case 'director_review':  return callOp('director-review');
    case 'director_approve': return callOp('director-approve', args);
    case 'director_reject':  return callOp('director-reject',  args);
    case 'agent_send':       return callOp('agent-send',       args);

    // ── Phase 27 · Media generation ────────────────────────────────────────
    case 'imagen_generate':  return callOp('imagen-generate',  args);
    case 'veo_generate':     return callOp('veo-generate',     args);
    case 'veo_status':       return callOp('veo-status',       args);
    case 'gpt_ask':          return callOp('gpt-ask',          args);
    case 'media_status':     return callOp('media-status');

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
