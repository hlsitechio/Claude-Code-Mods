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
  process.env.CLAUDE_CONFIG_DIR || path.join(process.env.HOME || process.env.USERPROFILE || '~', '.claude'),
  '.credentials.json'
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
  const isWin = process.platform === 'win32';
  const home  = process.env.HOME || process.env.USERPROFILE || '~';

  // CLAUDE_CLI_PATH env var overrides everything (custom installs)
  if (process.env.CLAUDE_CLI_PATH && fs.existsSync(process.env.CLAUDE_CLI_PATH)) {
    return process.env.CLAUDE_CLI_PATH;
  }

  const candidates = isWin ? [
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.local', 'bin', 'claude.exe'),
    process.env.APPDATA     && path.join(process.env.APPDATA, 'npm', 'claude.cmd'),
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
  ] : [
    path.join(home, '.npm-global', 'bin', 'claude'),
    path.join(home, '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/usr/bin/claude',
  ];

  for (const p of candidates.filter(Boolean)) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }

  // Fallback: which/where
  try {
    const cmd = isWin ? 'where claude.exe' : 'which claude';
    const out = execSync(cmd, { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const hit = out.split(/\r?\n/)[0]?.trim();
    if (hit && fs.existsSync(hit)) return hit;
  } catch {}

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

// Map app effort IDs (French internal names) → Claude CLI --effort values
const EFFORT_MAP = {
  'faible':     'low',
  'moyen':      'medium',
  'elevee':     'high',
  'tres-eleve': 'max',   // "très élevé" → max effort (enables extended thinking on Claude 4)
  'max':        'max',
};

// Stream a message through the real claude CLI subprocess.
// Uses --output-format stream-json --verbose so we get session_id and incremental text.
// cliSessionId (if set) is passed as --resume so the CLI maintains conversation context.
// opts: { effort, sessionName, addDirs, maxBudget }
// ── Browser context for the system prompt ──────────────────────────────────
// Generates a small markdown block that tells Claude about the embedded
// browser, the current page, and how the user can switch to Direct mode for
// full control. Returns '' if no browser is open.
function buildBrowserContext() {
  const op = global.ccmBrowser;
  if (!op?.isAvailable()) return '';
  const tab = op.getActiveTab();
  const pageLine = tab?.url && tab.url !== 'about:blank'
    ? `Current page: **${tab.title || '(untitled)'}** — ${tab.url}`
    : 'No page is loaded yet (about:blank).';
  // ASSERTIVE instructions — Claude Code CLI will otherwise spend 5-10 tool
  // searches looking for browser_* tools that aren't registered in CLI mode.
  // Be blunt: tools don't exist here, do NOT search, just tell the user.
  return `\n\n# IMPORTANT — Embedded browser (CLI mode, READ THIS FIRST)

The user has an embedded Chromium browser panel open in this app.
${pageLine}

**You do NOT have browser_navigate / browser_click / browser_screenshot tools in this session.** They are renderer-side tools that only get injected when the user is in **Direct API mode** (not CLI mode). Do NOT call ToolSearch looking for them — they will not be found.

If the user asks you to navigate, click, screenshot, or otherwise CONTROL the browser, respond in ONE sentence: *"Browser control needs Direct API mode — click the model chip at the bottom right of the composer and switch to 'Direct Claude API', then ask again."*  Do not search for tools. Do not waste tokens exploring the codebase. Just tell them.

If the user only asks ABOUT the page (read content, summarize), you may use WebFetch on the URL above — it's public web content.`;
}

async function streamMessageViaCLI(event, messages, modelId, systemPrompt, cliSessionId, binary, permMode, requestId, opts = {}) {
  // Determine per-stream IPC channel suffix ('' = legacy main-chat channel)
  const rid = requestId || '';
  const chunkCh = rid ? `claude:chunk:${rid}` : 'claude:chunk';
  const doneCh  = rid ? `claude:done:${rid}`  : 'claude:done';
  const todoCh  = rid ? `claude:todo-update:${rid}` : 'claude:todo-update';

  // Augment system prompt with browser context — Claude needs to know that
  // an embedded browser is open even when not in Direct mode.
  const browserCtx = buildBrowserContext();
  if (browserCtx) {
    systemPrompt = (systemPrompt || '') + browserCtx;
  }
  // Guard: the renderer window may be destroyed by the time async callbacks fire
  const safeSend = (ch, payload) => {
    try {
      if (event?.sender && !event.sender.isDestroyed()) event.sender.send(ch, payload);
    } catch { /* window closed during streaming — ignore */ }
  };
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

  // Detect Windows .cmd binary early — needed to decide stdin-json routing
  const isCmd = binary.endsWith('.cmd');

  // Use stdin JSON mode when:
  //  a) Message has images — CLI can't accept base64 blocks via -p
  //  b) Running on Windows (.cmd) with a long system prompt — cmd.exe has an
  //     8191-char command-line limit; large system prompts blow past it.
  //     Routing via stdin bypasses the OS shell entirely.
  const useStdinJson = hasImages ||
    (isCmd && systemPrompt && systemPrompt.length > 500);

  const args = [
    '--output-format', 'stream-json',
    '--verbose',
    '--model', model,
  ];

  if (useStdinJson) {
    // Prompt + system prompt come via stdin — don't put them on the command line.
    // This avoids Windows cmd.exe's 8191-char limit and handles image content blocks.
    // The system prompt is written as a {"type":"system"} event; the last user message
    // follows. Only the LAST user message is written (not full history) because the
    // CLI only accepts {"type":"user"} events in stdin — assistant turns crash it.
    // Multi-turn context is preserved via --resume (which is safe to combine with
    // --input-format stream-json as long as we don't also send assistant events).
    args.push('--input-format', 'stream-json');
    if (cliSessionId) args.push('--resume', cliSessionId);
    console.log(`[claude-cli] stdin-json mode (images=${hasImages} longSysPrompt=${!hasImages})`);
  } else {
    args.push('-p', promptText || '(no prompt)');
    if (cliSessionId) args.push('--resume', cliSessionId);
    if (systemPrompt) args.push('--system-prompt', systemPrompt);
  }

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

  // ── New CLI 2.1.81 flags ────────────────────────────────────────────────
  // --effort: cognitive effort level (low / medium / high / max)
  if (opts.effort) {
    const cliEffort = EFFORT_MAP[opts.effort] || opts.effort;
    args.push('--effort', cliEffort);
  }

  // --name: session label — only on first message so it doesn't overwrite on resume
  if (opts.sessionName && !cliSessionId) {
    args.push('--name', opts.sessionName);
  }

  // --add-dir: additional directories Claude Code has access to
  if (Array.isArray(opts.addDirs)) {
    for (const dir of opts.addDirs) {
      if (dir) args.push('--add-dir', dir);
    }
  }

  // --max-budget-usd: hard spending cap for agentic runs
  if (opts.maxBudget != null && opts.maxBudget > 0) {
    args.push('--max-budget-usd', String(opts.maxBudget));
  }

  // --fork-session: branch from an existing session
  if (opts.forkFromCli && !cliSessionId) {
    args.push('--fork-session', opts.forkFromCli);
  }

  // --from-pr: load PR diff + context from GitHub
  if (opts.fromPr) {
    args.push('--from-pr', opts.fromPr);
  }

  const { effort, sessionName, addDirs, maxBudget, forkFromCli, fromPr } = opts;
  console.log(`[claude-cli] spawn ${isCmd ? '(shell)' : '(exe)'}  model=${model}  resume=${useStdinJson ? 'n/a(stdin)' : (cliSessionId || 'new')}  effort=${effort || '—'}  name=${sessionName || '—'}  addDirs=${addDirs?.length || 0}  budget=${maxBudget || '—'}  fork=${forkFromCli || '—'}  pr=${fromPr || '—'}  stdin=${useStdinJson}`);

  return new Promise((resolve, reject) => {
    const appRoot    = path.resolve(__dirname, '..');
    // Use the user-selected project folder if set; fall back to app root.
    const projectCwd = global._projectCwd || appRoot;
    const proc = spawn(binary, args, {
      cwd:         projectCwd,
      env:         { ...process.env },
      windowsHide: true,
      shell:       isCmd,
      // Open stdin as pipe when we need to write image JSON, otherwise ignore it
      stdio:       [useStdinJson ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    _activeProcs.set(rid, proc);

    // Write system prompt + last user message to stdin, then close.
    // IMPORTANT: only {"type":"user"} events are valid in stdin stream-json.
    // Sending assistant turns causes the CLI to crash ("L is not an Object").
    // Multi-turn context is handled by --resume (added above when cliSessionId set).
    if (useStdinJson && proc.stdin) {
      // 1. System prompt
      if (systemPrompt) {
        proc.stdin.write(JSON.stringify({ type: 'system', system: systemPrompt }) + '\n');
      }
      // 2. Last user message only (sanitised for media_type)
      const [sanitisedMsg] = sanitiseMessages([lastMsg]);
      proc.stdin.write(JSON.stringify({ type: 'user', message: sanitisedMsg }) + '\n');
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
            safeSend(chunkCh, newPart);
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
                safeSend(todoCh, todos);
              }

              // File reads → inject activity marker into the chunk stream
              const readNames = ['read', 'read_file', 'readfile', 'view', 'cat'];
              if (readNames.includes((block.name || '').toLowerCase())) {
                const fp      = block.input?.file_path || block.input?.path || block.input?.filename || '';
                const name    = fp.split(/[/\\]/).pop();
                const isSkill = fp.includes('skills/') || fp.includes('skills\\') || name.endsWith('.md');
                if (name) {
                  const payload = JSON.stringify({ type: 'read', file: name, isSkill });
                  safeSend(chunkCh, '\x01ACT:' + payload + '\x02');
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
                safeSend(chunkCh, '\x01ACT:' + payload + '\x02');
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
            safeSend(todoCh, todos);
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
        // If the process exited with non-zero code and produced no text, treat as error
        if (code !== 0 && !fullText) {
          console.error(`[claude-cli] process exited with code ${code} and no output`);
          settle(false, new Error(`Claude CLI exited with code ${code}. Check that your session is valid and try again.`));
          return;
        }
        const stats = { inputTokens, outputTokens, cacheReadTokens, costUSD, numTurns, toolCallCount, model: sessionModel };
        safeSend(doneCh, stats);
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
// opts: { effort, sessionName, addDirs, maxBudget, directMode }
async function streamMessage(event, messages, modelId, systemPrompt, cliSessionId, permMode, requestId, opts = {}) {
  // Direct API mode: bypass the CLI entirely and talk to Anthropic SDK directly.
  // Benefits: no tool noise, pure conversation, works without claude CLI installed.
  if (opts.directMode) {
    console.log('[claude] directMode — bypassing CLI, using SDK directly');
    return streamMessageViaSDK(event, messages, modelId, systemPrompt, requestId);
  }

  const binary = getCliBinary();

  if (binary) {
    return streamMessageViaCLI(event, messages, modelId, systemPrompt, cliSessionId, binary, permMode, requestId, opts);
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

// ── Browser operator tools — exposed to Claude in Direct API mode whenever ─
// the embedded browser panel has at least one tab open. The matching handlers
// live on `global.ccmBrowser` (defined in main.js).
const BROWSER_TOOLS = [
  {
    name: 'browser_get_state',
    description: 'Get the current state of the embedded browser — URL, page title, and loading status. Use this to check what page the user is currently looking at.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'browser_navigate',
    description: 'Navigate the embedded browser to a URL. Waits for the page to finish loading and returns the final URL and title.',
    input_schema: {
      type: 'object',
      properties: { url: { type: 'string', description: 'URL to navigate to (https:// is auto-added if missing)' } },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'browser_read_page',
    description: 'Read the visible text content of the current page. Returns cleaned innerText with the page title and URL. Use for understanding what is on the page.',
    input_schema: {
      type: 'object',
      properties: { max_chars: { type: 'integer', description: 'Max characters to return (default 8000, max 50000)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'browser_get_elements',
    description: 'List interactable elements on the page (links, buttons, inputs, selects). Each element gets an integer "i" you can pass back to browser_click. Use this BEFORE clicking when you do not know the exact selector.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'integer', description: 'Max elements (default 60, max 200)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'browser_click',
    description: 'Click an element on the page. Provide ONE of: index (from browser_get_elements), selector (CSS), or text (substring match against link/button text).',
    input_schema: {
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
    input_schema: {
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
    input_schema: {
      type: 'object',
      properties: { quality: { type: 'integer', description: 'JPEG quality 20-95 (default 75)' } },
      additionalProperties: false,
    },
  },
  {
    name: 'browser_scroll',
    description: 'Scroll the page. Useful when content is below the fold.',
    input_schema: {
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
    input_schema: {
      type: 'object',
      properties: { action: { type: 'string', enum: ['back', 'forward', 'reload'] } },
      required: ['action'],
      additionalProperties: false,
    },
  },
];

async function _executeBrowserTool(name, input) {
  const op = global.ccmBrowser;
  if (!op) throw new Error('Browser API not available');
  switch (name) {
    case 'browser_get_state':   return op.getActiveTab() || { error: 'No browser tab is open' };
    case 'browser_navigate':    return op.navigate(input.url);
    case 'browser_read_page':   return op.readPage({ maxChars: input.max_chars });
    case 'browser_get_elements':return op.getElements({ limit: input.limit });
    case 'browser_click':       return op.click(input);
    case 'browser_type':        return op.type(input);
    case 'browser_screenshot':  return op.screenshot({ quality: input.quality });
    case 'browser_scroll':      return op.scroll(input);
    case 'browser_nav':         return op.nav(input.action);
    default:                    throw new Error('Unknown tool: ' + name);
  }
}

async function streamMessageViaSDK(event, messages, modelId, systemPrompt, requestId) {
  const rid    = requestId || '';
  const chunkCh = rid ? `claude:chunk:${rid}` : 'claude:chunk';
  const doneCh  = rid ? `claude:done:${rid}`  : 'claude:done';
  const safeSend = (ch, payload) => {
    try {
      if (event?.sender && !event.sender.isDestroyed()) event.sender.send(ch, payload);
    } catch { /* window closed during streaming */ }
  };
  const sendActivity = (data) => safeSend(chunkCh, `\x01ACT:${JSON.stringify(data)}\x02`);
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

  // Augment the system prompt with browser context AND the toolkit explainer.
  // The CLI path uses buildBrowserContext() for awareness only; here we add
  // the "you have these tools — use them eagerly" instruction since the tools
  // are actually wired into this request.
  let effectiveSystem = systemPrompt || '';
  const hasBrowser = !!(global.ccmBrowser?.isAvailable());
  if (hasBrowser) {
    const tab = global.ccmBrowser.getActiveTab();
    if (tab?.url && tab.url !== 'about:blank') {
      effectiveSystem += (effectiveSystem ? '\n\n' : '')
        + `# Browser operator (active)\n`
        + `The user has an embedded Chromium browser open. Current page:\n`
        + `- **URL:**   ${tab.url}\n`
        + `- **Title:** ${tab.title || '(untitled)'}\n\n`
        + `You have a full toolkit wired in: \`browser_get_state\`, \`browser_navigate\`, \`browser_read_page\`, \`browser_get_elements\`, \`browser_click\`, \`browser_type\`, \`browser_screenshot\`, \`browser_scroll\`, \`browser_nav\`. Use them eagerly — you don't need to ask permission to read or screenshot the current page. When the user asks about a website, navigate there and read it. When they ask about layout, screenshot it.`;
    } else {
      effectiveSystem += (effectiveSystem ? '\n\n' : '')
        + `# Browser operator (idle)\nThe user has an embedded browser panel open but no page is loaded yet. Call \`browser_navigate({url: "..."})\` to open something.`;
    }
  }

  // ── Prompt-cache scaffolding ───────────────────────────────────────────
  // Anthropic supports up to 4 ephemeral cache breakpoints. We use them on:
  //   1. system prompt  (~2KB of browser context + standing instructions)
  //   2. tools array    (~3KB of JSON-schema tool definitions)
  //   3. message history (everything before the new user turn — grows each
  //      tool-use turn — so subsequent turns hit the cache for the entire
  //      prior conversation)
  //
  // Cache hits cost 10% of normal input tokens; writes cost 25% more on the
  // first turn that establishes them. For multi-turn tool flows this is a
  // dramatic speedup AND price reduction — typically 3–5× faster.
  function asSystemBlock(text) {
    // Anthropic accepts `system` as a string OR an array of content blocks.
    // The array form is required to attach cache_control.
    return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
  }
  function tagToolsCacheable(tools) {
    if (!tools?.length) return tools;
    // Mark the LAST tool — cache_control covers everything before it inclusive.
    return [
      ...tools.slice(0, -1),
      { ...tools[tools.length - 1], cache_control: { type: 'ephemeral' } },
    ];
  }
  function tagLastMessageCacheable(messages) {
    // Mutate the LAST content block of the LAST message to be a cache breakpoint.
    // This extends the cache prefix through that message inclusive — used at
    // the start of every loop iteration past turn 1 to maximize cache hits.
    if (!messages?.length) return messages;
    const out = [...messages];
    const last = out[out.length - 1];
    if (typeof last.content === 'string') {
      out[out.length - 1] = {
        ...last,
        content: [{ type: 'text', text: last.content, cache_control: { type: 'ephemeral' } }],
      };
    } else if (Array.isArray(last.content) && last.content.length) {
      const blocks = [...last.content];
      const lastBlock = blocks[blocks.length - 1];
      // Don't double-mark — only set if absent
      if (!lastBlock.cache_control) {
        blocks[blocks.length - 1] = { ...lastBlock, cache_control: { type: 'ephemeral' } };
      }
      out[out.length - 1] = { ...last, content: blocks };
    }
    return out;
  }

  const baseParams = {
    model:      resolvedModel,
    max_tokens: 8192,
    stream:     true,
  };
  if (effectiveSystem) baseParams.system = asSystemBlock(effectiveSystem);
  if (hasBrowser)      baseParams.tools  = tagToolsCacheable(BROWSER_TOOLS);

  let inputTokens = 0, outputTokens = 0, cacheReadTokens = 0, cacheWriteTokens = 0;
  let fullText = '';
  let currentMessages = messages;

  try {
    // ── Tool-use loop ──
    // The SDK streams blocks of either text or tool_use. When the model
    // requests tools (stop_reason === 'tool_use') we execute them locally,
    // append a `user` turn with the tool_result blocks, then call again.
    // Bounded to 15 turns so a runaway agent can't burn the user's quota.
    const MAX_TURNS = 15;
    let turn = 0;
    while (turn++ < MAX_TURNS) {
      // Past turn 1, mark the previous turn's last message as cacheable so
      // EVERYTHING through that message is served from cache on the next call.
      const messagesForThisTurn = turn === 1
        ? currentMessages
        : tagLastMessageCacheable(currentMessages);
      const stream = await client.messages.create({ ...baseParams, messages: messagesForThisTurn });

      const turnContent = []; // accumulated blocks for THIS assistant turn
      let cur = null;          // currently-streaming block
      let stopReason = null;

      for await (const chunk of stream) {
        switch (chunk.type) {
          case 'message_start': {
            const u = chunk.message?.usage || {};
            inputTokens      += u.input_tokens                   ?? 0;
            cacheReadTokens  += u.cache_read_input_tokens        ?? 0;
            cacheWriteTokens += u.cache_creation_input_tokens    ?? 0;
            break;
          }
          case 'content_block_start': {
            const block = chunk.content_block;
            if (block.type === 'text') {
              cur = { type: 'text', text: '' };
            } else if (block.type === 'tool_use') {
              cur = { type: 'tool_use', id: block.id, name: block.name, _input: '' };
              // Surface in the chat as a "Using browser_navigate" chip
              sendActivity({ type: 'tool', tool: block.name });
            }
            break;
          }
          case 'content_block_delta': {
            const d = chunk.delta;
            if (d.type === 'text_delta' && cur?.type === 'text') {
              cur.text += d.text;
              fullText += d.text;
              safeSend(chunkCh, d.text);
            } else if (d.type === 'input_json_delta' && cur?.type === 'tool_use') {
              cur._input += d.partial_json;
            }
            break;
          }
          case 'content_block_stop': {
            if (cur?.type === 'tool_use') {
              try { cur.input = JSON.parse(cur._input || '{}'); }
              catch { cur.input = {}; }
              delete cur._input;
            }
            if (cur) turnContent.push(cur);
            cur = null;
            break;
          }
          case 'message_delta': {
            outputTokens += chunk.usage?.output_tokens ?? 0;
            if (chunk.delta?.stop_reason) stopReason = chunk.delta.stop_reason;
            break;
          }
        }
      }

      // If the model finished naturally, we're done.
      if (stopReason !== 'tool_use') break;

      // Execute every tool_use block in this turn IN PARALLEL.
      // Most browser tools can safely run concurrently — they target different
      // DOM elements or do read-only inspection. Side-effecting tools (click,
      // type, navigate) generally aren't requested in the same turn anyway.
      // For tools that DO conflict, the underlying executeJavaScript still
      // serializes on the renderer side. Net win: 2–3× speedup when the
      // model batches reads (e.g. get_state + read_page in one turn).
      const toolBlocks = turnContent.filter(b => b.type === 'tool_use');
      const settled = await Promise.all(toolBlocks.map(async (block) => {
        try {
          const result = await _executeBrowserTool(block.name, block.input || {});
          return { ok: true, block, result };
        } catch (e) {
          console.warn('[browser-tool] error:', block.name, e.message);
          return { ok: false, block, error: e.message };
        }
      }));
      const toolResults = settled.map(({ ok, block, result, error }) => {
        if (!ok) {
          return {
            type:        'tool_result',
            tool_use_id: block.id,
            content:     'Tool error: ' + error,
            is_error:    true,
          };
        }
        // Special-case screenshots: send the image AS the tool_result content
        // so the model can SEE the page, not just read about it.
        if (block.name === 'browser_screenshot' && result?.base64) {
          return {
            type:        'tool_result',
            tool_use_id: block.id,
            content: [
              { type: 'image',
                source: { type: 'base64', media_type: result.mediaType || 'image/jpeg', data: result.base64 } },
              { type: 'text', text: `Screenshot · ${result.url || ''} · ${result.title || ''}` },
            ],
          };
        }
        return {
          type:        'tool_result',
          tool_use_id: block.id,
          content:     typeof result === 'string' ? result : JSON.stringify(result),
        };
      });

      // Build messages for the next turn — preserve the assistant's full turn
      // (text + tool_use blocks) and append the user's tool_result turn.
      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: turnContent },
        { role: 'user',      content: toolResults },
      ];
      // Loop will run again with the augmented conversation.
    }

    const donePayload = {
      inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens,
      model: resolvedModel,
    };
    // Telemetry — cache effectiveness as a percentage of input tokens we got
    // for free. >50% on multi-turn flows is excellent; <10% suggests something
    // is busting the cache (system prompt mutation, message order changes, ...)
    const totalInput = inputTokens + cacheReadTokens;
    if (totalInput > 0) {
      const hitRate = Math.round((cacheReadTokens / totalInput) * 100);
      console.log(`[claude] cache  read=${cacheReadTokens}  write=${cacheWriteTokens}  hitRate=${hitRate}%  ${turn} turn(s)`);
    }
    safeSend(doneCh, donePayload);
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
