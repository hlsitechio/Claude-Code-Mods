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
      if (name === 'browser_screenshot' && result?.base64) {
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
