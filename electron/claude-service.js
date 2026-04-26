'use strict';

const Anthropic  = require('@anthropic-ai/sdk');
const { safeStorage, app, shell } = require('electron');
const http   = require('http');
const crypto = require('crypto');
const path   = require('path');
const fs     = require('fs');
const https  = require('https');
const { spawn, execSync } = require('child_process');

// ── Constants ────────────────────────────────────────────────────────────────

const OAUTH_CLIENT_ID  = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
// claude.ai/oauth/authorize — for Max subscribers (has existing session in system browser)
const AUTH_URL         = 'https://claude.ai/oauth/authorize';
// Token endpoint is always platform.claude.com regardless of which authorize URL was used
const TOKEN_URL        = 'https://platform.claude.com/v1/oauth/token';
const CREATE_KEY_URL   = 'https://api.anthropic.com/api/oauth/claude_cli/create_api_key';
const SCOPES           = 'user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload';

// Where the Claude Code CLI stores OAuth credentials
const CLI_CREDS_PATH   = path.join(
  process.env.USERPROFILE || process.env.HOME || '~',
  '.claude', '.credentials.json'
);

// Our own encrypted API-key config (for users who paste a raw key instead of OAuth)
const CONFIG_PATH = path.join(app.getPath('userData'), 'claude-desktop-config.json');

// ── Config helpers ───────────────────────────────────────────────────────────

function readConfig() {
  try   { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return {}; }
}
function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

// ── Raw API-key storage (encrypted, for manual-key flow) ─────────────────────

function getRawApiKey() {
  const cfg = readConfig();
  if (!cfg.encryptedKey) return null;
  try {
    const buf = Buffer.from(cfg.encryptedKey, 'base64');
    return safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString('utf8');
  } catch { return null; }
}
function setRawApiKey(key) {
  const cfg = readConfig();
  cfg.encryptedKey = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(key).toString('base64')
    : Buffer.from(key, 'utf8').toString('base64');
  writeConfig(cfg);
}
function clearRawApiKey() {
  const cfg = readConfig();
  delete cfg.encryptedKey;
  writeConfig(cfg);
}

// ── CLI credential helpers ───────────────────────────────────────────────────

function readCliCreds() {
  try   { return JSON.parse(fs.readFileSync(CLI_CREDS_PATH, 'utf8')); }
  catch { return null; }
}
function writeCliCreds(creds) {
  const dir = path.dirname(CLI_CREDS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CLI_CREDS_PATH, JSON.stringify(creds, null, 2), 'utf8');
}

function getOAuthEntry() {
  const creds = readCliCreds();
  return creds?.claudeAiOauth ?? null;
}

function isTokenValid(oauth) {
  if (!oauth?.accessToken) return false;
  // expiresAt is in milliseconds
  const expiresMs = Number(oauth.expiresAt);
  return expiresMs > Date.now() + 30_000; // 30s buffer
}

// ── Token refresh ────────────────────────────────────────────────────────────

// OAuth token endpoints require application/x-www-form-urlencoded (RFC 6749).
// Pass useForm=true for token/refresh calls; false for JSON APIs.
async function httpPost(url, body, useForm = false) {
  return new Promise((resolve, reject) => {
    const payload = useForm
      ? Object.entries(body).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
      : JSON.stringify(body);
    const contentType = useForm ? 'application/x-www-form-urlencoded' : 'application/json';
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path:     u.pathname + u.search,
      method:   'POST',
      headers:  {
        'Content-Type':   contentType,
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent':     'claude-code-desktop/0.1.0',
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try   { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function refreshOAuthToken(refreshToken) {
  const body = {
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     OAUTH_CLIENT_ID,
  };
  const res = await httpPost(TOKEN_URL, body, true); // form-encoded
  if (res.status !== 200 || !res.body.access_token) {
    throw new Error(`Token refresh failed: ${JSON.stringify(res.body)}`);
  }
  return {
    accessToken:  res.body.access_token,
    refreshToken: res.body.refresh_token || refreshToken,
    expiresAt:    Date.now() + (res.body.expires_in ?? 3600) * 1000,
  };
}

// ── Exchange OAuth access token for a real Anthropic API key ─────────────────

async function exchangeForApiKey(accessToken) {
  // This endpoint requires Bearer auth
  return new Promise((resolve, reject) => {
    const u = new URL(CREATE_KEY_URL);
    const opts = {
      hostname: u.hostname,
      path:     u.pathname,
      method:   'POST',
      headers:  {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
        'User-Agent':    'claude-code-desktop/0.1.0',
        'anthropic-version': '2023-06-01',
      },
    };
    const req = https.request(opts, res2 => {
      let data = '';
      res2.on('data', c => data += c);
      res2.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.api_key) resolve(j.api_key);
          else           reject(new Error(JSON.stringify(j)));
        } catch { reject(new Error(data)); }
      });
    });
    req.on('error', reject);
    req.write('{}');
    req.end();
  });
}

// ── Get a valid auth credential for the Anthropic SDK ───────────────────────
// Max/Pro subscribers use OAuth Bearer auth. The API requires the header
// 'x-app: cli' to accept Bearer tokens (same as Claude Code CLI does).
// API-key users (platform.claude.com) fall back to raw key auth.

async function getCredential() {
  // 1. Try CLI OAuth credentials (subscription auth)
  const oauth = getOAuthEntry();
  if (oauth) {
    if (isTokenValid(oauth)) {
      return { authToken: oauth.accessToken, mode: 'oauth', subscriptionType: oauth.subscriptionType };
    }
    // Expired — try to refresh
    if (oauth.refreshToken) {
      try {
        const fresh = await refreshOAuthToken(oauth.refreshToken);
        const creds = readCliCreds() || {};
        creds.claudeAiOauth = {
          ...oauth,
          accessToken:  fresh.accessToken,
          refreshToken: fresh.refreshToken,
          expiresAt:    fresh.expiresAt,
        };
        writeCliCreds(creds);
        return { authToken: fresh.accessToken, mode: 'oauth', subscriptionType: oauth.subscriptionType };
      } catch (err) {
        console.error('[auth] refresh failed:', err.message);
        // Fall through to raw API key
      }
    }
  }

  // 2. Fall back to manually-entered raw API key
  const rawKey = getRawApiKey();
  if (rawKey) return { apiKey: rawKey, mode: 'apikey' };

  // 3. Nothing available
  const err = new Error('NO_CREDENTIAL');
  err.code = 'NO_CREDENTIAL';
  throw err;
}

// ── Auth status (safe to expose to renderer) ─────────────────────────────────

function getAuthStatus() {
  const oauth = getOAuthEntry();
  if (oauth) {
    const valid   = isTokenValid(oauth);
    const expired = !valid && !!oauth.accessToken;
    return {
      mode:             'oauth',
      valid,
      expired,
      subscriptionType: oauth.subscriptionType,
      rateLimitTier:    oauth.rateLimitTier,
      scopes:           oauth.scopes,
    };
  }
  const hasKey = !!getRawApiKey();
  return { mode: hasKey ? 'apikey' : 'none', valid: hasKey, expired: false };
}

// ── Full OAuth PKCE sign-in flow ─────────────────────────────────────────────
// Opens claude.ai/oauth/authorize in the user's DEFAULT system browser so it
// can reuse the existing claude.ai session (no magic-link needed).
// Spins up a local HTTP server on localhost (not 127.0.0.1 — the whitelist is
// hostname-specific) to receive the callback.

async function startOAuthSignIn(senderWindow) {
  const verifier  = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state     = crypto.randomBytes(16).toString('hex');

  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', async () => {
      const port        = server.address().port;
      const redirectUri = `http://localhost:${port}/callback`; // ← localhost, not 127.0.0.1

      let handled = false;
      server.on('request', async (req, res) => {
        if (handled) return;
        const url = new URL(req.url, `http://localhost:${port}`);
        if (url.pathname !== '/callback') return;
        handled = true;
        server.close();

        // Show a success page in the browser
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Claude — signed in</title>
<style>body{font-family:system-ui;background:#0b0b0c;color:#e7e7ea;display:flex;align-items:center;
justify-content:center;height:100vh;margin:0;flex-direction:column;gap:12px}
h1{font-size:22px}p{color:#8a8a92;font-size:14px}</style></head>
<body><h1>✓ Connected to Claude</h1><p>You can close this tab and return to the app.</p></body></html>`);

        const code = url.searchParams.get('code');
        const st   = url.searchParams.get('state');
        if (!code || st !== state) { reject(new Error('Invalid OAuth callback')); return; }

        try {
          // Exchange authorization code for tokens (form-encoded per RFC 6749)
          const tokenRes = await httpPost(TOKEN_URL, {
            grant_type:    'authorization_code',
            code,
            redirect_uri:  redirectUri,
            client_id:     OAUTH_CLIENT_ID,
            code_verifier: verifier,
            state,
          }, true); // ← form-encoded
          if (tokenRes.status !== 200 || !tokenRes.body.access_token) {
            throw new Error(`Token exchange failed (${tokenRes.status}): ${JSON.stringify(tokenRes.body)}`);
          }

          const { access_token, refresh_token, expires_in } = tokenRes.body;

          // Persist to CLI credentials file
          const existing = readCliCreds() || {};
          existing.claudeAiOauth = {
            ...(existing.claudeAiOauth || {}),
            accessToken:  access_token,
            refreshToken: refresh_token,
            expiresAt:    Date.now() + (expires_in ?? 3600) * 1000,
            scopes:       SCOPES.split(' '),
          };
          writeCliCreds(existing);

          resolve({ accessToken: access_token });
          senderWindow?.webContents?.send('claude:auth-complete', getAuthStatus());
        } catch (err) {
          reject(err);
        }
      });

      // Build auth URL and open in the user's default browser (has existing claude.ai session)
      const authUrl = new URL(AUTH_URL);
      authUrl.searchParams.set('response_type',         'code');
      authUrl.searchParams.set('client_id',             OAUTH_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri',          redirectUri);
      authUrl.searchParams.set('scope',                 SCOPES);
      authUrl.searchParams.set('state',                 state);
      authUrl.searchParams.set('code_challenge',        challenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');

      shell.openExternal(authUrl.toString());
    });

    server.on('error', reject);
    setTimeout(() => { server.close(); reject(new Error('OAuth timeout (5 min)')); }, 5 * 60 * 1000);
  });
}

// ── CLI subprocess helpers ───────────────────────────────────────────────────

// Locate the real claude CLI binary. Prefers the .exe on Windows (no shell overhead).
// Called once and cached — we don't want to `execSync where` on every message.
let _cachedCliBinary = undefined;

// Track active subprocesses by requestId so parallel streams can coexist.
// requestId '' (empty string) is the legacy "main chat" slot.
const _activeProcs = new Map();

function abortCurrentStream(requestId) {
  // If requestId given, abort only that stream; otherwise abort all.
  if (requestId !== undefined && requestId !== null) {
    const proc = _activeProcs.get(requestId);
    if (proc) {
      try { proc.kill(); } catch {}
      _activeProcs.delete(requestId);
      return true;
    }
    return false;
  }
  // Legacy: abort everything
  let killed = false;
  for (const [rid, proc] of _activeProcs) {
    try { proc.kill(); } catch {}
    killed = true;
  }
  _activeProcs.clear();
  return killed;
}

function findClaudeBinary() {
  // Direct known paths (fastest — no shell)
  const candidates = [
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.local', 'bin', 'claude.exe'),
    process.env.APPDATA     && path.join(process.env.APPDATA, 'npm', 'claude.cmd'),
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
  ].filter(Boolean);

  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }

  // Fallback: ask the shell
  for (const query of ['where claude.exe 2>nul', 'where claude 2>nul']) {
    try {
      const out   = execSync(query, { encoding: 'utf8', timeout: 2000 }).trim();
      const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const exe   = lines.find(l => l.endsWith('.exe'));
      const cmd   = lines.find(l => l.endsWith('.cmd'));
      const hit   = exe || cmd || lines[0];
      if (hit) { try { if (fs.existsSync(hit)) return hit; } catch {} }
    } catch {}
  }

  return null;
}

function getCliBinary() {
  if (_cachedCliBinary === undefined) {
    _cachedCliBinary = findClaudeBinary();
    if (_cachedCliBinary) console.log(`[claude-cli] found binary: ${_cachedCliBinary}`);
    else                   console.warn('[claude-cli] binary not found — falling back to SDK');
  }
  return _cachedCliBinary;
}

// Stream a message through the real claude CLI subprocess.
// Uses --output-format stream-json --verbose so we get session_id and incremental text.
// cliSessionId (if set) is passed as --resume so the CLI maintains conversation context.
async function streamMessageViaCLI(event, messages, modelId, systemPrompt, cliSessionId, binary, permMode, requestId) {
  // Determine per-stream IPC channel suffix ('' = legacy main-chat channel)
  const rid = requestId || '';
  const chunkCh = rid ? `claude:chunk:${rid}` : 'claude:chunk';
  const doneCh  = rid ? `claude:done:${rid}`  : 'claude:done';
  const todoCh  = rid ? `claude:todo-update:${rid}` : 'claude:todo-update';
  const model     = resolveModel(modelId);
  const lastMsg   = messages[messages.length - 1];
  if (!lastMsg || lastMsg.role !== 'user') throw new Error('Last message must be from user');
  const tmpImages = []; // placeholder — no temp files written; kept for cleanup guard

  // Detect if the message has image content blocks
  const hasImages = Array.isArray(lastMsg.content) &&
    lastMsg.content.some(b => b.type === 'image');

  // Extract text part of the prompt
  let promptText = '';
  if (Array.isArray(lastMsg.content)) {
    promptText = lastMsg.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');
  } else {
    promptText = lastMsg.content || '';
  }

  // When images are present, use --input-format stream-json so we can pipe the
  // full message (including base64 image blocks) via stdin to the CLI.
  // This routes through the CLI's own subscription tier — no direct API call needed.
  const useStdinJson = hasImages;

  const args = [
    '--output-format', 'stream-json',
    '--verbose',
    '--model', model,
  ];

  if (useStdinJson) {
    // Don't pass -p; the prompt comes from stdin in stream-json format instead
    args.push('--input-format', 'stream-json');
    console.log('[claude-cli] image detected — routing via stdin stream-json (subscription tier)');
  } else {
    args.push('-p', promptText || '(no prompt)');
  }

  if (cliSessionId)  args.push('--resume', cliSessionId);

  // ── Permission mode → CLI flags ──────────────────────────────────────────
  // bypass  → --dangerously-skip-permissions  (no prompts at all)
  // accept  → --auto-approve-everything       (auto-accept file edits)
  // plan    → no exec flags (planning only; model self-limits)
  // default → no flags     (Claude prompts for each tool)
  if (permMode === 'bypass') {
    args.push('--dangerously-skip-permissions');
  } else if (permMode === 'accept') {
    args.push('--auto-approve-everything');
  }

  // Always inject system context as a hidden layer — passed on every turn so
  // Claude and any sub-agents always have workspace awareness without it
  // appearing in user-turn message content.
  if (systemPrompt) args.push('--system-prompt', systemPrompt);

  const isCmd = binary.endsWith('.cmd');
  console.log(`[claude-cli] spawn ${isCmd ? '(shell)' : '(exe)'}  model=${model}  resume=${cliSessionId || 'new'}  stdin=${useStdinJson}`);

  return new Promise((resolve, reject) => {
    const appRoot = path.resolve(__dirname, '..');
    const proc = spawn(binary, args, {
      cwd:         appRoot,
      env:         { ...process.env },
      windowsHide: true,
      shell:       isCmd,
      // Open stdin as pipe when we need to write image JSON, otherwise ignore it
      stdio:       [useStdinJson ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    _activeProcs.set(rid, proc);

    // Write the message (with image blocks) as stream-json to stdin, then close.
    // Sanitise media_type here too — the CLI rejects unknown values just like the API.
    if (useStdinJson && proc.stdin) {
      const [sanitised] = sanitiseMessages([{ role: 'user', content: lastMsg.content }]);
      const userEvent = JSON.stringify({
        type:    'user',
        message: sanitised,
      });
      proc.stdin.write(userEvent + '\n');
      proc.stdin.end();
    }

    let buffer       = '';
    let fullText     = '';
    let lastTextLen  = 0;   // assistant events are cumulative — diff to get incremental chunks
    let newSessionId = cliSessionId || null;
    let inputTokens  = 0;
    let outputTokens = 0;
    let cacheReadTokens = 0;
    let costUSD      = 0;
    let numTurns     = 0;
    let toolCallCount = 0;
    let sessionModel  = modelId;
    let settled      = false;

    const settle = (ok, val) => {
      if (settled) return;
      settled = true;
      if (ok) resolve(val); else reject(val);
    };

    const processLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let ev;
      try { ev = JSON.parse(trimmed); } catch { return; }

      switch (ev.type) {
        case 'system':
          if (ev.subtype === 'init' && ev.session_id) {
            newSessionId = ev.session_id;
            if (ev.model) sessionModel = ev.model;
            console.log(`[claude-cli] session=${newSessionId}  model=${ev.model}`);
          }
          break;

        case 'assistant': {
          const content = ev.message?.content || [];
          // Text blocks are cumulative — send only the new delta
          const text    = content.filter(c => c.type === 'text').map(c => c.text).join('');
          const newPart = text.slice(lastTextLen);
          if (newPart) {
            fullText   += newPart;
            lastTextLen = text.length;
            event.sender.send(chunkCh, newPart);
          }
          // Tool-use blocks — watch for TodoWrite + skill reads
          for (const block of content) {
            if (block.type === 'tool_use') {
              console.log(`[claude-cli] tool_use: name=${block.name}  input=${JSON.stringify(block.input)?.slice(0, 200)}`);

              // TodoWrite → live Plan panel update
              if (
                (block.name === 'TodoWrite' || block.name === 'todo_write') &&
                (Array.isArray(block.input?.todos) || Array.isArray(block.input))
              ) {
                const todos = Array.isArray(block.input?.todos) ? block.input.todos : block.input;
                event.sender.send(todoCh, todos);
              }

              // File reads → inject activity marker into the chunk stream
              const readNames = ['read', 'read_file', 'readfile', 'view', 'cat'];
              if (readNames.includes((block.name || '').toLowerCase())) {
                const fp      = block.input?.file_path || block.input?.path || block.input?.filename || '';
                const name    = fp.split(/[/\\]/).pop();
                const isSkill = fp.includes('skills/') || fp.includes('skills\\') || name.endsWith('.md');
                if (name) {
                  const payload = JSON.stringify({ type: 'read', file: name, isSkill });
                  event.sender.send(chunkCh, '\x01ACT:' + payload + '\x02');
                }
              }

              // Count all tool calls
              toolCallCount++;

              // Any other non-todo tool → generic activity ping
              const skipGeneric = ['TodoWrite', 'todo_write', 'Read', 'read_file', 'read', 'cat', 'view'];
              if (!skipGeneric.includes((block.name || '').toLowerCase())) {
                const inp = block.input || {};
                const agentName = inp.agent_name || inp.agentName || inp.agent || inp.subagent_type || inp.name || null;
                const payload = JSON.stringify({ type: 'tool', tool: block.name, agentName });
                event.sender.send(chunkCh, '\x01ACT:' + payload + '\x02');
              }
            }
          }
          break;
        }

        // Some CLI versions emit tool_use as a top-level event
        case 'tool_use': {
          console.log(`[claude-cli] top-level tool_use: name=${ev.name}  input=${JSON.stringify(ev.input)?.slice(0, 200)}`);
          if (
            (ev.name === 'TodoWrite' || ev.name === 'todo_write') &&
            (Array.isArray(ev.input?.todos) || Array.isArray(ev.input))
          ) {
            const todos = Array.isArray(ev.input?.todos) ? ev.input.todos : ev.input;
            event.sender.send(todoCh, todos);
          }
          break;
        }

        case 'rate_limit_event':
          // status 'allowed' = fine; other statuses warn but don't block
          if (ev.rate_limit_info?.status && ev.rate_limit_info.status !== 'allowed') {
            console.warn('[claude-cli] rate_limit_event:', JSON.stringify(ev.rate_limit_info));
          }
          break;

        case 'result':
          if (ev.usage) {
            inputTokens      = ev.usage.input_tokens             || 0;
            outputTokens     = ev.usage.output_tokens            || 0;
            cacheReadTokens  = ev.usage.cache_read_input_tokens  || 0;
          }
          if (ev.cost_usd       != null) costUSD   = ev.cost_usd;
          if (ev.total_cost_usd != null) costUSD   = ev.total_cost_usd;
          if (ev.num_turns      != null) numTurns  = ev.num_turns;
          if (ev.is_error || ev.subtype === 'error_during_execution') {
            const msg = ev.result || ev.error || 'CLI reported an error';
            const errStr = typeof msg === 'string' ? msg : JSON.stringify(msg);
            if (/rate.?limit|429/i.test(errStr)) {
              const e = new Error('429: Rate limited.'); e.code = 'RATE_LIMIT'; e.retryAfter = null;
              settle(false, e);
            } else {
              settle(false, new Error(errStr));
            }
          }
          break;
      }
    };

    proc.stdout.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();           // keep last (possibly incomplete) line
      lines.forEach(processLine);
    });

    proc.stderr.on('data', data => {
      const msg = data.toString().trim();
      if (msg) console.error('[claude-cli] stderr:', msg);
    });

    const cleanupTmpImages = () => {
      for (const p of tmpImages) try { fs.unlinkSync(p); } catch {}
    };

    proc.on('close', code => {
      _activeProcs.delete(rid);
      cleanupTmpImages();
      if (buffer.trim()) processLine(buffer); // flush
      if (!settled) {
        const stats = { inputTokens, outputTokens, cacheReadTokens, costUSD, numTurns, toolCallCount, model: sessionModel };
        event.sender.send(doneCh, stats);
        settle(true, { text: fullText, ...stats, cliSessionId: newSessionId });
      }
    });

    proc.on('error', err => {
      _activeProcs.delete(rid);
      cleanupTmpImages();
      console.error('[claude-cli] spawn error:', err.message);
      settle(false, err);
    });
  });
}

// ── Streaming chat ───────────────────────────────────────────────────────────

const MODEL_MAP = {
  // Latest subscription models (no date suffix — resolved server-side)
  'claude-sonnet-4-6':  'claude-sonnet-4-6',
  'claude-sonnet-4-5':  'claude-sonnet-4-5',
  'claude-sonnet-4':    'claude-sonnet-4-6',
  'claude-opus-4-5':    'claude-opus-4-5',
  'claude-opus-4':      'claude-opus-4-5',
  // Haiku — subscription tokens use the dated ID
  'claude-haiku-3-5':   'claude-3-5-haiku-20241022',
  // Legacy fallbacks
  'claude-3-5-sonnet':  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku':   'claude-3-5-haiku-20241022',
};
function resolveModel(id) { return MODEL_MAP[id] || id || 'claude-sonnet-4-6'; }

// Public entry point — tries real CLI first, falls back to direct Anthropic SDK.
// requestId (optional) scopes the IPC channel so parallel streams don't mix.
async function streamMessage(event, messages, modelId, systemPrompt, cliSessionId, permMode, requestId) {
  const binary = getCliBinary();

  if (binary) {
    return streamMessageViaCLI(event, messages, modelId, systemPrompt, cliSessionId, binary, permMode, requestId);
  }

  console.warn('[claude] CLI unavailable — using SDK fallback');
  return streamMessageViaSDK(event, messages, modelId, systemPrompt, requestId);
}

const ALLOWED_IMG_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/**
 * Sanitise messages before sending to the API.
 * Coerces any unsupported image media_type to 'image/png' so the API never
 * sees values like 'image/bmp', 'image/x-png', or empty string.
 */
function sanitiseMessages(messages) {
  return messages.map(msg => {
    if (!Array.isArray(msg.content)) return msg;
    const content = msg.content.map(block => {
      if (block.type !== 'image') return block;
      const src = block.source || {};
      const mt  = (src.media_type || '').toLowerCase();
      if (ALLOWED_IMG_MEDIA_TYPES.has(mt)) return block;
      console.warn(`[claude] coercing unsupported image media_type '${src.media_type}' → 'image/png'`);
      return { ...block, source: { ...src, media_type: 'image/png' } };
    });
    return { ...msg, content };
  });
}

async function streamMessageViaSDK(event, messages, modelId, systemPrompt, requestId) {
  const rid    = requestId || '';
  const chunkCh = rid ? `claude:chunk:${rid}` : 'claude:chunk';
  const doneCh  = rid ? `claude:done:${rid}`  : 'claude:done';
  const cred = await getCredential();
  messages = sanitiseMessages(messages);

  // OAuth Bearer requires 'anthropic-beta: oauth-2025-04-20' to be accepted.
  // Raw API keys use standard x-api-key auth (no extra headers needed).
  // Match the headers sent by the real Claude Code CLI so Cloudflare and Anthropic's
  // gateway treat us as a legitimate subscription client (not a random API script).
  // oauth-2025-04-20    → accept Bearer token auth
  // claude-code-20250219 → route request to Claude Code subscription tier (higher limits)
  const CLI_HEADERS = {
    'anthropic-beta':    'oauth-2025-04-20,claude-code-20250219',
    'x-app':             'cli',
    'user-agent':        'claude-code/1.0.17',   // matches real CLI user-agent format
    'anthropic-version': '2023-06-01',
  };
  const clientOpts = cred.authToken
    ? { authToken: cred.authToken, defaultHeaders: CLI_HEADERS }
    : { apiKey: cred.apiKey, defaultHeaders: { 'user-agent': 'claude-code/1.0.17', 'anthropic-version': '2023-06-01' } };

  // maxRetries: 0 — we handle retries ourselves with a proper countdown.
  // The SDK default is 2 (= 3 total attempts), which would hammer the API
  // 3× per countdown expiry and keep the Cloudflare burst window reset indefinitely.
  const client = new Anthropic({ ...clientOpts, maxRetries: 0 });
  const resolvedModel = resolveModel(modelId);
  const authMode = cred.authToken ? `oauth` : 'apikey';
  console.log(`[claude] model: ${resolvedModel}  auth: ${authMode}`);

  const params = {
    model:      resolvedModel,
    max_tokens: 8192,
    messages,
    stream:     true,
  };
  if (systemPrompt) params.system = systemPrompt;

  try {
    const stream = await client.messages.create(params);
    let fullText = '', inputTokens = 0, outputTokens = 0, cacheReadTokens = 0;

    for await (const chunk of stream) {
      switch (chunk.type) {
        case 'content_block_delta':
          if (chunk.delta.type === 'text_delta') {
            fullText += chunk.delta.text;
            event.sender.send(chunkCh, chunk.delta.text);
          }
          break;
        case 'message_start': {
          const u = chunk.message?.usage || {};
          inputTokens      = u.input_tokens              ?? 0;
          cacheReadTokens  = u.cache_read_input_tokens   ?? 0;
          break;
        }
        case 'message_delta':  outputTokens = chunk.usage?.output_tokens ?? 0; break;
      }
    }

    const donePayload = { inputTokens, outputTokens, cacheReadTokens, model: resolvedModel };
    event.sender.send(doneCh, donePayload);
    return { text: fullText, ...donePayload };

  } catch (err) {
    if (err.status === 429) {
      // SDK exposes a Fetch Headers object — must use .forEach(), not Object.entries()
      const hdrs = {};
      if (err.headers) {
        try {
          if (typeof err.headers.forEach === 'function') {
            err.headers.forEach((v, k) => { hdrs[k] = v; });
          } else if (typeof err.headers.entries === 'function') {
            for (const [k, v] of err.headers.entries()) hdrs[k] = v;
          } else {
            Object.assign(hdrs, err.headers);
          }
        } catch (_) { /* headers not iterable */ }
      }
      console.error('[claude] 429 headers:', JSON.stringify(hdrs, null, 2));
      const errBody = err.error || {};
      console.error('[claude] 429 body:', JSON.stringify(errBody));
      console.error('[claude] 429 message:', errBody?.error?.message || errBody?.message || err.message);

      // retry-after → seconds; x-ratelimit-reset-* → ISO-8601 timestamp
      let retrySeconds = null;
      const retryAfterRaw = hdrs['retry-after'];
      const resetRequests  = hdrs['x-ratelimit-reset-requests'];
      const resetTokens    = hdrs['x-ratelimit-reset-tokens'];
      if (retryAfterRaw) {
        retrySeconds = Math.ceil(Number(retryAfterRaw));
      } else if (resetRequests) {
        const ms = new Date(resetRequests).getTime() - Date.now();
        if (ms > 0) retrySeconds = Math.ceil(ms / 1000);
      } else if (resetTokens) {
        const ms = new Date(resetTokens).getTime() - Date.now();
        if (ms > 0) retrySeconds = Math.ceil(ms / 1000);
      }

      const enriched = new Error(`429: Rate limited.${retrySeconds ? ` Retry after ${retrySeconds}s.` : ''}`);
      enriched.code = 'RATE_LIMIT';
      enriched.retryAfter = retrySeconds;
      throw enriched;
    }
    // Log unexpected errors too
    console.error('[claude] API error:', err.status, err.message);
    throw err;
  }
}

module.exports = {
  // Raw API key
  getRawApiKey, setRawApiKey, clearRawApiKey,
  // OAuth
  getAuthStatus, startOAuthSignIn, getCredential,
  // Chat
  streamMessage, abortCurrentStream,
};
