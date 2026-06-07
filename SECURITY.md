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
- **No `allow-same-origin` on code-preview iframes**: JSX/HTML/React previews render in `srcdoc` sandboxes with `allow-scripts` ONLY. `allow-same-origin` on a srcdoc iframe makes it same-origin with the app → Claude-authored preview code could reach `window.parent.electronAPI` (fs/shell/terminal) = RCE. esm.sh module imports still work via wildcard CORS under the opaque origin. (External-URL preview iframes keep `allow-same-origin` — they carry the remote site's origin, not the app's.)
- **frameAttach is iframe-gated**: `chrome_frame_attach` refuses any target that isn't `type:'iframe'` with a browseable URL — blocks attaching a CDP session to the CCM app renderer and running JS there.
- **cdpRaw escalation guards**: `chrome_cdp_raw` routes `Page.navigate` URLs through the scheme allowlist and blocks `Target.attachToTarget`/`attachToBrowserTarget` (the escalation primitive).
- **No plaintext secret fallback**: GitHub PAT + Anthropic API key are stored ONLY via OS `safeStorage` (DPAPI/Keychain/libsecret). If secure storage is unavailable, CCM refuses to persist them rather than writing cleartext.
- **App-window navigation guard**: the privileged app window (which holds the `electronAPI` bridge) is pinned to its own origin via `will-navigate`/`will-redirect`; any attempt to navigate it elsewhere is blocked and http(s) links are handed to the real browser. Both app windows also run `sandbox: true`, and `webSecurity` is force-enabled in packaged builds (the `CCM_DEV_INSECURE` escape hatch is dev-only).
- **Renderer markdown is escaped-first**: the notes/preview markdown renderers HTML-escape input before applying transforms, so pasted/agent-written content can't inject markup (CSP already blocks script execution; this stops content spoofing + beacons too).

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
- `chrome_browser_set_download_behavior` lets the model set an arbitrary download directory (by design, for save-file workflows). Combined with the download tools it's a write-to-disk primitive — treat prompt-injected download requests with the same care as any other side-effectful tool call.
- The JSX preview pulls Babel (unpkg) + React/framer-motion (esm.sh) from public CDNs at preview time. These are unpinned beyond major version and have no SRI (esm.sh resolves dynamically, so static SRI isn't practical). A CDN compromise could affect preview rendering only — the preview is sandboxed (`allow-scripts`, no app access), so the blast radius is the iframe, not the app.
- **Git history was rewritten (2026 Phase 22)** to purge a previously-committed session note containing personal details and a `workspace-index.json` snapshot. `git filter-repo` scrubbed the PII strings from every blob and removed `workspace-index.json` from all history; `main` was force-pushed and all other branches were verified clean. Residual note: GitHub keeps unreachable commits accessible by their exact 40-char SHA until its internal GC runs — no branch references them, but if you need them gone immediately, ask GitHub Support to run gc on the repo. A pre-rewrite backup bundle is the recovery path if anything was lost.
