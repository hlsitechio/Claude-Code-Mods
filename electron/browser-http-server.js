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

// We persist the {url, token, pid} envelope here so spawned MCP children can
// read it deterministically. Lives in the user's Claude config dir — same
// place Claude Code looks for its own settings — so the child can locate it
// without knowing about our Electron userData path.
function endpointFilePath() {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const dir  = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  return path.join(dir, 'ccm-browser-endpoint.json');
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

  if (req.method !== 'POST' || !req.url.startsWith('/op/')) {
    return _sendJson(res, 404, { error: 'Not found' });
  }

  const op = global.ccmBrowser;
  if (!op) return _sendJson(res, 503, { error: 'ccmBrowser unavailable' });

  let body;
  try { body = await _readBody(req); }
  catch (e) { return _sendJson(res, 400, { error: 'Bad JSON: ' + e.message }); }

  const cmd = req.url.slice(4); // strip "/op/"
  try {
    let result;
    switch (cmd) {
      case 'get-state':     result = op.getActiveTab() || { error: 'No browser tab is open' }; break;
      case 'navigate':      result = await op.navigate(body.url); break;
      case 'read-page':     result = await op.readPage({ maxChars: body.max_chars }); break;
      case 'get-elements':  result = await op.getElements({ limit: body.limit }); break;
      case 'click':         result = await op.click(body); break;
      case 'type':          result = await op.type(body); break;
      case 'screenshot':    result = await op.screenshot({ quality: body.quality }); break;
      case 'scroll':        result = await op.scroll(body); break;
      case 'nav':           result = await op.nav(body.action); break;
      default:              return _sendJson(res, 404, { error: 'Unknown op: ' + cmd });
    }
    return _sendJson(res, 200, { ok: true, result });
  } catch (e) {
    return _sendJson(res, 200, { ok: false, error: e.message });
  }
}

/**
 * Start the HTTP control server on a random localhost port and persist
 * its endpoint + auth token to disk so child processes can find it.
 * Idempotent — calling twice is a no-op.
 */
function startBrowserHttpServer() {
  if (_server) return { port: _port, token: _token };

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
      _endpointFile = endpointFilePath();

      const envelope = {
        url:     `http://127.0.0.1:${_port}`,
        token:   _token,
        pid:     process.pid,
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
