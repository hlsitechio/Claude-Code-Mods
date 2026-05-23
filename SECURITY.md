# Security Policy

## Threat model

CCM is a **single-user desktop app**. It is not intended to be:

- Exposed to untrusted users on a shared machine
- Made network-reachable beyond `127.0.0.1`
- Used to drive sites where you wouldn't want an AI making decisions

The MCP control surface (HTTP server in `electron/browser-http-server.js`) binds **`127.0.0.1` only**, requires a bearer token written to a `mode 0600` file in `~/.claude/`, and Host-header-allowlists `localhost`/`127.0.0.1`. The Chrome DevTools Protocol port (`9221 + slot`) is also localhost-only by design — but note that **any process running as the same OS user can connect to it without auth**. If you share a machine, treat CCM as you would any local dev tool: don't leave it running unattended.

## Reporting a vulnerability

If you find a security issue:

1. **Do not open a public GitHub issue.**
2. Open a private security advisory via GitHub's "Security" tab → "Report a vulnerability", **or** email the address listed in the repo's `package.json` `author.email` field.
3. Include: affected file/line, reproduction steps, suggested fix (if you have one), and whether you'd like credit in the changelog.

I aim to respond within 7 days for any clear vulnerability. There is no bug bounty (this is a personal project), but I'm happy to credit reporters in the CHANGELOG.

## Security boundaries actively maintained

- **Bearer-token MCP auth**: `crypto.randomBytes(24)` per session, written `0600` to `~/.claude/ccm-browser-endpoint.json`.
- **URL-scheme allowlist** (`_safeNavUrl`): blocks `javascript:`, `data:`, `file:`, `vbscript:`, `ms-msdt:`, `mhtml:`, `view-source:` from any `chrome_*` navigation tool.
- **Browseable-target filter** (`_pageById` + `cdpRaw`): refuses to address CCM's own renderer process, devtools, or extensions via `targetId`. Blocks the privilege-escalation path where prompt-injected MCP results could chain `Target.getTargets` + `Runtime.evaluate` to execute privileged JS.
- **Prototype-pollution block**: `_assertSafePath` rejects `__proto__` / `prototype` / `constructor` in dotted path keys for prefs/bookmarks setters.
- **Policy-name regex allowlist**: `policySet`/`policyDelete` reject anything outside `^[A-Za-z][A-Za-z0-9_]{0,127}$`; `REG_EXPAND_SZ` (env-var expansion persistence vector) explicitly blocked.
- **Companion MV3 extension permissions diet**: no `<all_urls>`, no `debugger`, no `webRequest`/`cookies`/`scripting`; `host_permissions` tightened to localhost.
- **Picker DoS resistance**: overlay membership tracked via closure-scoped `Set`, not a public `data-*` attribute pages can spam.
- **Observe ref stability**: `data-ccm-ref="N"` survives re-renders; cached refs from a prior `chrome_observe` keep pointing to the same element across mutations (refuses to be silently corrupted).

## Sensitive data the user controls

- **Bearer tokens, OAuth state, API keys**: stored under `~/.claude/` (not in the repo)
- **Saved chat sessions**: `sessions/*.json` — gitignored
- **User memory**: `memory/*.md` — gitignored
- **Embedded browser cookies/sessions**: stored under `%APPDATA%\claude-code-desktop\` (out of repo)
- **Personal agent configs**: `agents/crowbyte-ops.json` and similar are gitignored by name

Anything in the patterns above is **never** committed by the build/dist pipeline.

## Known caveats

- The CDP port (`9221 + slot`) is **not authenticated**. Any process running as your OS user can drive Chromium directly. The bearer-auth HTTP server is the auth boundary for the MCP layer, not for CDP itself.
- The Phase 18b "link to project" feature uses Windows junctions (or POSIX symlinks). If a Claude CLI session is open during migration, the rename step fails — close active sessions first.
- The companion MV3 extension is loaded with `allowFileAccess: true`. It only fetches from `127.0.0.1` per its host_permissions, but if you modify the manifest you could broaden that.
