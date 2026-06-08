# Changelog

All notable changes to this project are documented here.

This file follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) (loosely) and [Semantic Versioning](https://semver.org).

---

## [Unreleased]

### Added

- **Workspace selector dropdown + team agents in Settings (Phase 26c)**
  - **"+" is now a workspace selector**: clicking it opens a dropdown listing **every saved workspace** (click to switch, the active one highlighted) with a **"＋ New workspace"** action at the bottom — instead of silently creating one. Newly created workspaces appear in the list. The per-tab right-click menu also gains **Open** (alongside Rename / Delete), and its outside-click close is now containment-checked (clicking inside the menu no longer dismisses it).
  - **Built-in team agents show in Settings → AI Agents** (after the agents sync on load), each tagged with a **"Built-in"** pill and grouped under type **"DevOps Team"**. Built-ins have no edit/delete (they're sourced from `director.js` and always available) — duplicate one to customise. They also appear in the chat agent dropdown (Phase 26b), so the 11 roles + Director are selectable everywhere agents are.

- **Team roles in the agents dropdown (Phase 26b)** — the 11 specialists + Director now appear in the AI-agents menu too, not only via `team_spawn`, so you can launch any single role on its own. They're injected into `agents:load-all` straight from `director.js` (single source — no duplicate JSON files to drift), grouped under type **"DevOps Team"**, and marked `builtin` so `agents:save` never snapshots them to disk (always fresh). A disk/user agent of the same name **wins** (your custom "Code Reviewer" isn't overwritten or duplicated). Every team agent carries the **`ccm-browser`** MCP (plus its specialty MCP, e.g. Media→`ideogram`) so it can call `kanban_move` / `director_*` even when launched solo. Verified with a 10-assertion merge test.

- **One-click team spawn — "a workspace ready to go" (Phase 26)** — stand up the whole agent team in one action: a Director terminal + one role-injected Claude terminal per agent (11) + the shared task board, all in the workspace. **+1 MCP tool → 196 total.**
  - **Role injection**: each agent terminal launches `claude --append-system-prompt "<role prompt>"` so it boots already knowing its job AND the kanban protocol (move my task to *In progress* → do it → move to *Needs review* and stop; never self-finalize). The Director boots knowing the `director_*` tools. Prompts are authored single-line and **hard-stripped of shell-hostile chars** (`" \` $ \` + newlines) in the renderer so the typed command can't break out of its quoted arg in PowerShell or bash.
  - **The loop closes over MCP**: agents report status with the same `kanban_move` tool; the Director coordinates with `director_*`. No terminal-scraping.
  - **Three ways to trigger**: the new **`team_spawn` MCP tool** (a Director-Claude can spawn its own team), the **tray menu → "Spawn Agent Team"**, and `window.Workspace.spawnTeam(payload)`.
  - **Stability**: spawns are **staggered** (~350 ms apart) so a dozen PTYs + `claude` launches don't hit in one tick; agents dock as tabs in one group (tear them out to taste); idle REPLs burn no tokens until the Director assigns work.
  - Wired across all layers: `director.js` (`roleSystemPrompt`/`teamSpawnPayload` — single source for the role prompts) → `global.ccmTeam.teamSpawn()` (ships the payload to the renderer over IPC) → `preload.team.onSpawn` → `workspace.js` `spawnTeam()` (lays out board + Director + agents). Verified with an 8-assertion payload test (11 agents + Director, every role prompted, agents carry the kanban protocol & the Director doesn't, all prompts shell-safe, researcher→browser, media→ideogram).

- **Director + Team MCP tools (Phase 25b)** — 12 new app-control tools in the ccm MCP (**183 → 195 tools**) so a Director-Claude can run the agent team over the *same* MCP it uses for the browser. These route through a new `global.ccmTeam` (the app-control counterpart to `global.ccmChrome`); all Director ops are **stateless over the board** (each call reads `kanban.json`, reconstructs the Director, acts, writes back — so it survives restarts and stays in sync with agents + the user dragging cards).
  - **Kanban bus**: `kanban_read`, `kanban_add`, `kanban_update`, `kanban_move`, `kanban_delete` — full CRUD with `assignee`/`deps` first-class.
  - **Director coordination**: `director_plan` (decompose → validate roles/deps/cycles → write to board), `director_status` (per-agent + counts), `director_next` (gated assign of ready tasks), `director_review` (the Needs-review queue), `director_approve`/`director_reject` (the gate — only the Director finalises).
  - **`team_list`** — the 11-role roster with each role's skills + MCP servers.
  - Wired end-to-end across all four layers (MCP schema+dispatch → HTTP route → `global.ccmTeam` → kanban/director). Verified with a 13-assertion flow test simulating the whole loop (plan → status → next → agent-moves-to-review → review → approve → completion). Spawn-team + layout tools come next (Phase 26 — they need new renderer plumbing).

- **Director ↔ live kanban bridge (Phase 25a)** — the wiring foundation for the agent team's live loop (Director drives agents via PTY prompt-injection; agents report back by moving their OWN kanban tasks). 
  - **"Needs review" lane**: the kanban gains a 4th column (`To do · In progress · Needs review · Done`) — the Director's sign-off queue. Auto-migrates existing boards (inserted before `Done`); the renderer is column-driven so it appears with no UI change.
  - **`assignee` + `deps` are now first-class task fields** — `_kanbanSanitizeTask` preserves them through every round-trip (previously stripped). `assignee` = agent role; `deps` = task ids that must reach `done` first.
  - **Pure bridge in `director.js`** (`toKanbanTask`/`fromKanbanTask`, `Director.toKanban()`/`syncFromKanban()`): maps the Director's task model ↔ kanban shape (status↔column 1:1; assignee/deps mirrored as `@role`/`dep:<id>` tags for the UI, recoverable from tags alone). `syncFromKanban()` folds live board edits back into the Director and returns the tasks that newly entered review.
  - **No agent self-approval**: a board move straight to `Done` by an agent is downgraded to `Needs review` — only the Director's `approve()` finalizes a task.
  - Verified with a 15-assertion bridge test (shape, tag mirroring, round-trip integrity, tag-only recovery, the agent→Director review hand-off, self-approve protection). Next: the PTY driver that injects each task prompt into its agent terminal + spawns the 11 role terminals.

- **Agent-team Director — coordination prototype (Phase 24)** — `electron/director.js`, the pure (no-Electron, deterministic) coordination logic for an agent team, validated before any live wiring. A "Director" decomposes a goal into role-tagged tasks and coordinates an **11-role team** (Researcher · Architect · Backend · Frontend · Data/DB · QA · Security · Reviewer · Media Creator · DevOps/CI · Docs) over the shared kanban as the bus. Two roles carry a defining MCP capability consumed by the live-spawn step: **Researcher → `ccm-browser`** (live web research), **Media Creator → `ideogram`** (image generation).
  - **Kanban-bus coordination**: tasks carry `assignee` (role) + `deps` (task ids); the board is the single source of truth (maps to kanban cols/tags for the live step).
  - **Director-gated autonomy**: each agent does ONE task → submits for review → the Director approves before the next is released. Hard invariant: no agent ever has more than one active task.
  - **Dependency engine**: a task is assignable only when all its deps are `done`; load-time validation rejects unknown roles, dangling deps, and dependency cycles (DFS); runtime `isStalled()` catches deadlocks.
  - **`status()`** snapshot (per-agent state + counts) for the future team panel.
  - Verified with a 16-assertion test driving a realistic feature build (design → parallel impl → test/audit/review → deploy) plus a research-led product flow (research → design → media + frontend → docs): dependency ordering, the gating invariant held every tick, parallel fan-out, review-gate semantics, completion, cycle + unknown-role rejection. Next phases wire it to live kanban + spawn the 11 role-injected Claude terminals in git worktrees.

### Fixed

- **Workspace persistence (Phase 23)** — workspaces weren't saving/restoring correctly. Two root causes:
  - **`_stripTerminalPanels` was a silent no-op.** It targeted `node.data.panels` / `node.children` — fields that don't exist in dockview's serialization. The real shape is `{ grid:{root}, panels:{id}, activeGroup }` where grid nodes are `{type:'leaf'|'branch', data}` (leaf `data.views[]`/`data.activeView`, branch `data[]`). So terminal panels were never stripped → they serialized → on restore they came back as blank fresh PTYs and Claude terminals re-ran `claude` on every launch, and the leftover sizing/refs could skew the restored layout. Rewrote to dockview's true shape: removes `term-*` from the top-level panels map, prunes them from every leaf's `views` (re-pointing `activeView` when it was on a removed terminal), drops emptied leaves/branches, and filters terminal-only floating/popout groups. Verified with a 10-assertion layout fixture.
  - **No flush-on-close.** The layout save is debounced 600 ms, so a change made within 600 ms of quitting was lost. Added `beforeunload` / `pagehide` / `visibilitychange→hidden` handlers that clear the timer and save synchronously — guarded by a new `_wsSwitching` flag so the reload triggered by switch/create/delete doesn't write the old layout into the newly-activated workspace.

### Security

- **Full code security review (Phase 22)** — four-agent audit across Electron/IPC, MCP/HTTP/CDP, renderer XSS, and secrets/repo. The repo had no live credentials; findings fixed:
  - **CRITICAL — JSX preview RCE.** Code-preview `srcdoc` iframes used `sandbox="allow-scripts allow-same-origin"`. On a srcdoc iframe `allow-same-origin` = same origin as the app, so Claude-authored preview code could call `window.parent.electronAPI.terminal.create()` → arbitrary shell exec — and one path auto-pinned a preview with no user click. Removed `allow-same-origin` from all 5 srcdoc preview sites (esm.sh imports still work via wildcard CORS under the opaque origin). External-URL preview iframes keep it (they carry the remote origin, not the app's).
  - **HIGH — `chrome_frame_attach` could attach to the app renderer.** It looked up targets with no browseable filter, so a prompt-injected targetId (the CCM UI) → `chrome_frame_eval` = JS in the privileged renderer. Now refuses anything that isn't `type:'iframe'` with a browseable URL.
  - **HIGH — `chrome_cdp_raw` escalation paths.** `Page.navigate{url}` bypassed the scheme allowlist; `Target.attachToTarget` could session-attach to any target. Now routes `Page.navigate` URLs through `_safeNavUrl` and blocks `Target.attachToTarget`/`attachToBrowserTarget`.
  - **MEDIUM — plaintext secret fallback.** GH PAT + Anthropic API key fell back to writing cleartext (base64) when OS `safeStorage` was unavailable. Now refuses to persist rather than storing plaintext; PAT written `0600`.
  - **MEDIUM — app-window navigation guard.** Added `will-navigate`/`will-redirect` guards pinning the privileged app window to its origin (blocks injection-driven navigation of the electronAPI-bearing frame; http(s) handed to the real browser). Both app windows now `sandbox: true`; `webSecurity` force-enabled when `app.isPackaged` (CCM_DEV_INSECURE is dev-only).
  - **MEDIUM — renderer markdown XSS (CSP-mitigated).** `renderNotesMd`/`renderMd` now escape-first, so pasted/agent-written note content can't inject markup.
  - **LOW — `_safeNavUrl`** extended with `blob:`/`filesystem:`/`intent:`/`ms-appx:`/`res:`; **memory:* IPC** ids validated against `^[\w.-]+\.md$`; **REG_BINARY** dropped from the `chrome_policy_set` schema (the editor never accepted it).
  - **PII + repo hygiene.** Scrubbed a personal address/phone/email from a tracked session note (HEAD). `.gitignore` now covers `data/` (the isolated browser profile — was one `git add .` from publishing cookies/sessions), `Chats/`, `projects/`, `knowledge/`, `mcp/`, `*.enc`, `ccm-browser-endpoint*.json`.
  - Confirmed solid (no change): bearer-token MCP auth (constant-time, 0600), `_pageById` browseable filter, `_safeNavUrl` whitespace-strip, `_assertSafePath` proto-pollution block, policy-name regex, companion-ext permissions diet, `git:action` flag denylist, `fs:*` realpath confinement, CSP, no `eval`/`webview`, no postMessage origin gaps, no secrets in tree or (current) build output, CI not fork-exploitable.

### Added

- **"Restart CCM" in the system-tray menu** — sits between "Show Claude Code" and "Quit". Packaged builds use a clean `app.relaunch()`; in dev (where Electron runs under `concurrently -k`, which kills the Vite server on Electron exit) it spawns a fresh `npm run electron:dev` in a new terminal window so Vite + Electron both come back, then quits the current instance. Uses `cmd /c start "" cmd /k` on Windows (so `npm` resolves via `npm.cmd`, unaffected by PowerShell execution policy).

- **One-line Windows installer (`setup.ps1`)** — `irm https://raw.githubusercontent.com/hlsitechio/Claude-Code-Mods/main/setup.ps1 | iex`. Scan-first, isolation-first:
  - BETA warning + GitHub-issues link shown up front and again at the end
  - Prerequisite check (Node 20+, git, Claude Code CLI — CLI is a soft warning)
  - **Read-only scan** for existing installs (official Claude Desktop at `%LOCALAPPDATA%\AnthropicClaude` / `%APPDATA%\Claude`, prior CCM data at `%APPDATA%\claude-code-desktop`, CLI config at `~/.claude`) — reports them and explicitly leaves them untouched (security + no data loss)
  - Asks **where** to install (refuses to clobber a non-empty non-CCM dir; updates in place if it's an existing clone)
  - Asks **consent** before creating the local data backend
  - Writes `Launch-CCM.cmd` that sets `CCM_USER_DATA_DIR=<install>\data` for **full isolation** — this install's sessions/cookies/profile never share or overwrite another install's data. Optional Desktop shortcut. No registry edits, no PATH changes.
- **`CCM_USER_DATA_DIR` env var** (`electron/main.js`) — relocates ALL of CCM's `userData` (browser profiles, cookies, window state) to a chosen directory before any `app.getPath('userData')` call. Composes with the slot system. The lever the installer uses for isolation; also handy for portable installs.
- **`npm run setup:win`** — runs the installer locally.

- **Phase 20 — OAuth + Cloudflare friendliness** — two embedded-browser pain points fixed.
  - **OAuth popups now open as real child windows.** Previous behavior denied every popup, which broke Google / Microsoft / GitHub / Apple / Auth0 / Okta sign-in flows that rely on `window.opener.postMessage(...)` firing back to the original page after sign-in. New `_isOAuthPopup()` detects provider patterns (major IdP hostnames + generic OAuth fingerprint: `client_id` + `redirect_uri` query params); `setWindowOpenHandler` returns `{action:'allow'}` with `overrideBrowserWindowOptions` using the parent's session so OAuth state cookies persist across the redirect chain. Non-OAuth popups still route through the existing new-tab handler.
  - **Stealth fingerprint via CDP `Page.addScriptToEvaluateOnNewDocument`.** Same technique as puppeteer-stealth. Installed via `webContents.debugger.attach('1.3')` on view creation, runs in main world BEFORE any page script on every navigation — including inline detection scripts. Spoofs: `navigator.webdriver` (undefined), `navigator.plugins` (5 fake PDF viewers, length matching real Chrome), `navigator.languages` (non-empty fallback), `window.chrome.runtime/csi/loadTimes` (present), `navigator.permissions.query` (mirrors `Notification.permission`), WebGL `UNMASKED_VENDOR_WEBGL` / `UNMASKED_RENDERER_WEBGL` (NVIDIA-on-Windows values), `window.outerHeight/outerWidth` (>= innerHeight/Width), `Function.prototype.toString` (returns "native code" for our patched WebGL getter). The old `did-finish-load` → `executeJavaScript` patch was deleted — it ran AFTER Cloudflare's inline detector and was useless.
  - Stealth is also applied to OAuth child windows via `did-create-window` so a Cloudflare-protected sign-in popup (rare but possible) still passes.

### Security

- **Privilege-escalation block in `chrome_*` MCP tools** — `_pageById` now filters through `_isBrowserableUrl`, refusing to address the CCM main renderer or any non-browseable Electron context. Prevents a prompt-injected MCP caller from chaining `chrome_cdp_raw{Target.getTargets}` → `chrome_runtime_eval{targetId:<CCM_UI>}` to execute privileged JS in the renderer with full `electronAPI` IPC access. `chrome_cdp_raw` also validates `params.targetId` through the same filter.
- **Personal info scrubbed from defaults** — name and email no longer hardcoded in `app.js` / `index.html` / `split-chat.js`. Defaults are `'You'` / `''`; profile loads from `localStorage`.

### Added

- **ccm-browser Phase 18b — Link CLI sessions to project folder** — one-click "Link to project" button in the sidebar's CLI section migrates `~/.claude/projects/<encoded-cwd>/*.jsonl` to `<project>/sessions/claude_session_cli/` and creates a junction (Windows) / dir symlink (Mac/Linux) so future sessions land in the project folder transparently. Claude Code keeps writing to its expected location; files end up where the user wants them. Idempotent, with `.before-link.bak` recovery hedge and an `unlink` op that restores the original storage.

- **ccm-browser Phase 18 — CLI session tracker in sidebar** — new "CLI" section between Recent and Bottom in the sidebar lists Claude Code CLI sessions for the current project. `electron/cli-session-tracker.js` scans `~/.claude/projects/<encoded-cwd>/*.jsonl`, parses metadata cheaply (only first 8KB per file to extract `firstUserMessage`), sorts by `lastActivity`. New IPC: `cli-sessions:list / read / reveal / storage-status / link / unlink`. Auto-refresh every 60s; manual ⟳ button. Click a row to reveal in OS file explorer.

- **ccm-browser Phase 17 — `targetId` parameter on every tool + PID enrichment** — 21 functions in `chrome-controller.js` (page/runtime/dom/input/cm/picker/console) now accept optional `targetId` to bind directly to a specific CDP target instead of using `_activePage()`. Eliminates the active-tab race condition between parallel sub-agents — two sub-agents calling `chrome_page_navigate({targetId:A, url:X})` and `chrome_page_navigate({targetId:B, url:Y})` concurrently now succeed without interference. 18 MCP schemas auto-updated. Backward-compatible: omitting `targetId` falls back to `_activePage()`. `chrome_target_list` now also includes `pid` (from `webContents.getOSProcessId()`) and `viewId` per tab for OS-level introspection.

- **ccm-browser Phase 16 — Claude-controlled split-view** — four new MCP tools let Claude orchestrate the embedded browser's split layout itself: `chrome_split_enable({leftUrl?, rightUrl?, ratio?})` turns split on (opens/navigates each pane), `chrome_split_disable`, `chrome_split_swap`, `chrome_split_set_ratio({ratio:0.15..0.85})`. Wire: MCP → HTTP → controller → `global.ccmBrowserSplit` → `webContents.send('browser:split-cmd', {cmd, args, reqId})` → renderer dispatches → replies via `ipcMain.once('browser:split-cmd-result:<reqId>')`. 5s timeout if the Browser panel isn't mounted.

- **ccm-browser Phase 15 — split-view state for parallel pane control** — `chrome_split_state` MCP tool returns `{active, ratio, left:{viewId,url,title,targetId}, right:{...}}` so Claude can drive BOTH panes in a single turn (research in left, notes in right). `chrome_target_list` annotates each tab with `pane: 'left'|'right'|null` + top-level `splitActive/splitLeftId/splitRightId`. `chrome_status` surfaces `splitView` inline. Renderer mirrors split state to main via `browser:set-split-state` IPC on every layout change; controller resolves view URLs to CDP targetIds via URL match.

- **ccm-browser Phase 14 — gap everything (audit hardening)** — fourteen security + correctness fixes from the four-agent code review:
  - `_safeNavUrl` URL-scheme allowlist applied to `pageNavigate / targetNewTab / cmOpenAtLine / cmEnsureEditor` — blocks `javascript:`, `data:`, `file:`, `vbscript:`, `ms-msdt:` from reaching `page.goto()` (prompt-injection RCE close)
  - `chrome_step` scoring fixed: filter floor raised from `>0` to `>=15`, viewport bonus dropped, ambiguity gap widened from 8 to 20 — eliminates the "swamped by visible-but-irrelevant candidates" failure mode
  - `chrome_step` `select` action now drives ARIA combobox/listbox (clicks matching `[role=option]`) AND uses the React-safe native-setter trick on `<select>`
  - `chrome_observe` ref stability — counter persists across observes via `window.__ccmObserve.nextRef`; surviving elements keep the same ref number so cached refs don't silently point at wrong elements after re-observe
  - `chrome_observe_delta` sweeps landmarks (h1/h2/form/nav/main/dialog) symmetric with `observe`
  - `clickRef/typeRef/focusRef` now throw "ref N no longer exists — call chrome_observe again" instead of returning silent no-ops on stale refs
  - Picker uses closure-scoped `ownNodes` Set instead of public `data-picker` attribute — pages can no longer DoS the picker by attribute-spamming
  - `_extCall` uses `_isBrowserAlive()` helper (Puppeteer v22+ dropped `isConnected()` for a `.connected` property — direct call would crash)
  - HTTP server Host-header allowlist (DNS-rebinding defense in depth)
  - `chrome-files.js` `_assertSafePath` blocks `__proto__/prototype/constructor` in prefs/preferences dotted-path setters (prototype-pollution close)
  - `_validatePolicyName` regex allowlist on `policySet/policyDelete`; `REG_EXPAND_SZ` explicitly blocked (env-var expansion persistence vector)
  - Companion MV3 extension permissions diet — dropped `<all_urls>`, `debugger`, `webRequest`, `cookies`, `scripting`, `tts`, `webNavigation`, `contextMenus`; `host_permissions` tightened to `http://127.0.0.1/*` + `http://localhost/*`
  - Split-screen drag handler + Alt+Click pinning + `.browser-split-divider` CSS + `.browser-tab__split-dot` R badge (the original split-screen UI was rendering but couldn't actually be dragged)
  - `is-focused` class on the pane the user last clicked into — URL bar + back/fwd/reload now act on the focused pane, not always the structurally-left one

- **UI polish — window-promotion + split-view ergonomics**
  - Closing the primary CCM window while a secondary is open now promotes the secondary to primary (previously stranded — its spawn button stayed hidden, no way back to dual-window mode)
  - Tab strip order matches pane order in split view — left tab in strip = left pane (was insertion-order which desynced after swap)
  - Swap button (⇄) appears in the tab strip when split is active — mirrors `chrome_split_swap` MCP tool
  - Pane-focus indicator: `is-focused` style on the tab the user last clicked, accent border + glow

### Changed

- **`package.json`** — version bumped from `0.2.0` to `0.5.0` to reflect Phase 12-18b scope. Added `engines: { node: '>=18' }`, stub `test` and `lint` scripts, `start` script aliasing `electron:dev`.

### Earlier work (Phases 1-13, already shipped to main)

- **ccm-browser Phase 12 — `chrome_step` intent resolver** — one-call high-level action: `{ action, target, role?, value?, near? }` runs a fresh `chrome_observe`, fuzzy-matches `target` against accessible names of role-appropriate elements, then dispatches to the matching ref-based action with auto-stabilize + bundled `observe_delta`. Ambiguous matches (top-two scores within 8) refuse and return top-5 candidates so the caller can disambiguate with `role` or `near`. The LLM does NL→structured intent; the MCP does resolution + execute + observe in a single round-trip.

- **Multi-slot CCM (Phase 10)** — run multiple CCM instances in parallel, each driving its own embedded browser at its own CDP port, so one machine can host N independent Claude Code sessions side-by-side
  - Slot picked at launch via `--slot=N` CLI arg or `CCM_SLOT=N` env (1-indexed, max 64). Slot 1 = default, fully backward-compatible.
  - Per-slot isolation: CDP port = `9221 + N`, userData dir = `<default>-slot-N`, MCP endpoint file = `ccm-browser-endpoint-N.json`, MCP entry name = `ccm-browser-N` with `env { CCM_BROWSER_SLOT: 'N' }`, window title = `Claude Code Mods · Slot N`
  - Single-instance lock per slot — different userData dirs lock independently, so slots coexist without fighting
  - Each Claude Code CLI session targets a specific slot via env: `claude mcp add --env CCM_BROWSER_SLOT=2 ...` (or use the auto-registered `ccm-browser-2` entry that slot 2 writes on first boot)
  - npm convenience scripts: `electron:slot2`, `electron:slot3`, `electron:slot4`
- **Phase 9 — playbook follow-ups for the Lovable.dev live-edit pipeline**
  - `chrome_cm_edit_atomic` — multi-file batch editor (per-file save batching + auto file-switch via cm_open_at_line)
  - `chrome_cm_open_at_line` — opens a file at line N via URL params (`?view=codeEditor&file=…&line=…`) with safety-net cm_goto_line
  - `chrome_cm_ensure_editor` — re-navigates with `?view=codeEditor` if the editor pane dropped after Save
  - `chrome_picker_install` / `chrome_picker_capture` / `chrome_picker_cancel` — element-to-source picker codified as MCP tools (React fiber `_debugSource` walker)
  - `chrome_target_list` enriched with `lastActivated` timestamps + `attached` marker on the tab the MCP is driving (disambiguates twin tabs)

- **Dockview workspace** — replaces the static right-panel tab system with a fully flexible dock layout powered by `dockview-core` v5.2.0
  - Panels can be dragged, reordered, split horizontally/vertically, and floated into independent windows
  - Custom dark theme (`.dockview-theme-ccmod`) matches the app's `#141416` / `#d97757` palette
  - Tab bar: accent bottom-strip on active tab, fade transition on inactive, per-tab close button
  - Sash (resize handles): invisible by default, accent-colored on hover
  - Floating panels: dark shadow, rounded corners, `#2e2e34` border
  - Drop overlay: warm amber highlight (#d97757) instead of generic blue
  - `workspace.js` bridge: zero app.js rendering code changes required — shared `#right-panel-body` element is moved into the active panel's DOM slot
  - Backward compatible: `setRightPanelTab()` / `setRightPanelOpen()` APIs unchanged
- **JSX live preview** — inline rendering of React components directly inside chat code blocks
  - Babel standalone compiles JSX synchronously in the iframe
  - `<script type="importmap">` resolves `react`, `react-dom/client`, `framer-motion` to esm.sh CDN
  - Module injected as `<script type="module">` — works in sandboxed `srcdoc` iframes (no blob URLs)
  - Auto-fixes common Claude output issues before compilation:
    - Malformed JSX comments `{/ text /}` → `{/* text */}`
    - Unquoted template literals in style objects: `left: ${p.x}%` → `` `${p.x}%` ``
    - Multi-template values: `${a}px ${b}px`
    - Multi-line destructured imports
    - Named re-exports, side-effect imports
- **Code block max-height + expand toggle** — blocks cap at 380px with scroll; "Show more / Show less" toggle appears only when content overflows
- **Clickable filesystem paths** — paths in code blocks that exist on disk render in blue and open Explorer on click (checked via `fs:exists` IPC)
- **Live context panel** — real token/cost data from CLI `result` events, not estimates
  - Input / output / cache read tokens accumulated across the session
  - Cost in USD, tool call count, turn count
  - Arc gauge + breakdown bars
- **Workspace awareness system**
  - `workspace-index.json` written to disk on every state mutation
  - Hidden system prompt injected on every CLI turn (including `--resume`) with full workspace context
  - `skills/app-context.md` auto-loaded by the CLI explaining how to read workspace state
- **Permission modes** wired end-to-end
  - `bypass` → `--dangerously-skip-permissions`
  - `accept` → `--auto-approve-everything`
  - `plan` and `default` modes supported
  - Mode visible in session header, color-coded
- **Filesystem IPC handlers** (`fs:exists`, `fs:writeText`, `shell:open`)
- **Skills system** — 4 skills ship out of the box: `app-context`, `design-system`, `jsx-code-blocks`, `agents`

### Changed
- System prompt now injected on `--resume` sessions too (previously skipped)
- `claude:done` event now carries full stats: `inputTokens`, `outputTokens`, `cacheReadTokens`, `costUSD`, `numTurns`, `toolCallCount`, `model`
- Overview page session count uses sum of all buckets (projects + recent + pinned) for accuracy
- JSX preview scrollbar: thin dark style, no longer `overflow: hidden` on body
- Inline preview expands to 520px min-height when active

---

## [0.1.0] — Initial release

### Added
- Full Electron desktop app wrapping the Claude Code CLI
- Sidebar: project + session tree, drag-to-resize, live search, context menu (pin / fork / rename / delete)
- Chat: 9 streaming state variants with gradient shimmer animations
- Code blocks: syntax highlighting (12 token types), VS Code–style line numbers, copy, download, inline preview, fullscreen modal
- Context strip: MCP · Git · Context · Plan chips, each opening a dedicated right panel tab
- Right panel: 10 tabs — Preview · Diff · Terminal · Files · Plan · MCP · Git · Context · Shortcuts · Tasks
- Settings drawer: Session · Permissions · Model · Microphone · Insert · Language · Theme · Font
- Custom frameless title bar with minimize / maximize / close
- Windows installer via electron-builder (NSIS + portable)
- OAuth / API key auth flow
- Session persistence via LevelDB (Claude Code's native storage)
- i18n: EN + FR
