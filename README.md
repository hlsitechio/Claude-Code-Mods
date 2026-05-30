# Claude Code Mods

> **The missing desktop layer for Claude Code CLI** — a native Electron workspace that makes every action Claude takes visible, organized, and one click away.

[![Status](https://img.shields.io/badge/status-active%20development-brightgreen)](https://github.com/hlsitechio/Claude-Code-Mods)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-42-47848F?logo=electron&logoColor=white)](https://electronjs.org)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-CLI%20wrapper-D97757?logo=anthropic&logoColor=white)](https://github.com/anthropics/claude-code)
[![Topics](https://img.shields.io/badge/topics-claude--code%20%7C%20mcp%20%7C%20skills%20%7C%20hooks-5a67d8)](https://github.com/hlsitechio/Claude-Code-Mods/topics)

> Built on top of [Claude Code](https://github.com/anthropics/claude-code) by Anthropic. Not affiliated — just a developer who uses it every day and wanted a proper workspace.

---

## Quick install — Windows (PowerShell)

```powershell
irm https://raw.githubusercontent.com/hlsitechio/Claude-Code-Mods/main/setup.ps1 | iex
```

Scans for existing Claude installs (read-only — **never touches them**), asks where to put an **isolated** copy, then installs with a one-click launcher. Requires **Node 20+**, **git**, and the **Claude Code CLI**. → [full install details](#windows-installer--details) · [manual / other platforms](#manual-install-all-platforms)

> ⚠️ **Beta** — expect rough edges. Bugs → [open an issue](https://github.com/hlsitechio/Claude-Code-Mods/issues) with repro steps.

---

![Claude Code Mods — multi-panel workspace](assets/preview.png)

---

## Why this exists

Claude Code CLI is exceptional. The terminal is not the right interface for everything it can do.

This project adds a native desktop shell around the CLI — fully respecting Anthropic's **Skills**, **Hooks**, and **MCP** extension points — so every session, every tool call, every context byte is visible in a real UI.

**Zero wrappers. Zero proxies. The official CLI runs underneath, unchanged.**

---

## Anthropic extension points — all three, fully wired

This project is built around the three official Claude Code extension mechanisms:

| Extension point | What it unlocks | How we surface it |
|----------------|-----------------|-------------------|
| **Skills** (`@skills/*.md`) | Inject domain knowledge into sessions | Skills panel — browse, activate/deactivate, edit inline |
| **Hooks** (`CLAUDE.md` lifecycle hooks) | Control behavior at every CLI lifecycle event | Console → Skills page, CLAUDE.md editor |
| **MCP servers** | Connect external tools to Claude | MCP panel — all servers + tool count at a glance |

---

## ccm-browser MCP — 183 tools driving the embedded browser

CCM ships its own MCP server (`bin/browser-mcp.mjs`) that exposes **183 tools** for AI-driven browser automation. It connects to the same Chromium that powers the Browser panel — your real cookies, your real extensions, your real login state — via the Chrome DevTools Protocol.

The headline primitive is `chrome_step({action, target, role?, value?, near?})` — give it a structured intent and a fuzzy accessible-name match, and it observes → resolves → executes → stabilizes in one round-trip. No selectors required.

**Highlights:**

| Category | Notable tools |
|---|---|
| **Semantic observation** | `chrome_observe`, `chrome_observe_delta` — ARIA-tree snapshot with stable refs that survive re-renders |
| **Intent resolver** | `chrome_step` — NL target → role-filtered fuzzy match → dispatched action |
| **Ref-based actions** | `chrome_click_ref`, `chrome_type_ref`, `chrome_focus_ref` — addressable element clicks with auto-stabilize + bundled `observe_delta` |
| **Parallel control** | Every tool accepts an optional `targetId` (Phase 17) so two sub-agents can drive two tabs concurrently without racing on a shared "active tab" |
| **Split-view orchestration** | `chrome_split_enable / disable / swap / set_ratio` — Claude sets up side-by-side panes itself (research left, notes right) |
| **CodeMirror primitives** | `chrome_cm_replace_line / edit_atomic / open_at_line` — surgical in-browser code editing for Lovable.dev / v0 / Bolt-style workflows |
| **Element picker** | `chrome_picker_install / capture` — React fiber `_debugSource` walker returns `file:line` for any clicked element in a dev-mode app |
| **Closed-Chrome editors** | `chrome_flags_set / prefs_set / policy_set / bookmarks_json_write` — modify the Chrome profile while the browser is closed |
| **Companion ext bridge** | 30+ `chrome_ext_*` tools for `chrome.tabGroups / sessions / readingList / history / bookmarks / downloads / dnr / system` (APIs CDP can't reach) |
| **Multi-slot** | Run N CCMs in parallel (slot 1 on CDP `:9222`, slot 2 on `:9223`, ...) for fully isolated parallel Claude sessions |

**Why this stack instead of Playwright-MCP / Stagehand / browser-use:** CCM drives the user's *real* browser with real cookies and real extensions. The MCP is the substrate; the desktop app is the workspace. See the [`sessions/claude_session_cli/ccm_browser_mcp_playbook.md`](sessions/claude_session_cli/ccm_browser_mcp_playbook.md) for the canonical Lovable-edit + research-and-notes workflows.

---

## Feature overview

### 🪟 Dockview workspace
A drag-and-drop panel canvas. Every tool in its own resizable, re-dockable panel. Right-click anywhere to add panels from the context menu.

| Panel | What it does |
|-------|-------------|
| **Chat** | Main conversation + 9 streaming state variants with gradient shimmer |
| **Browser** | Embedded Chromium (real cookies, real extensions, real logins) — tabs, split view, and the 183-tool ccm-browser MCP surface that lets Claude drive it. See the [section above](#ccm-browser-mcp--183-tools-driving-the-embedded-browser). |
| **Preview** | Live JSX/HTML/React iframe — Claude writes a component, click 👁 to render it |
| **Terminal** | Embedded shell (PowerShell / bash) |
| **Files** | Full project file tree |
| **Skills** | Browse, edit, activate/deactivate skill files with inline editor + active badges |
| **Notes** | Persistent markdown scratchpad with toolbar + live preview |
| **Plan** | Claude's task plan rendered as a kanban-style checklist |
| **Tasks** | Per-project kanban board (shared with the CLI via `kanban.json`) |
| **MCP** | All connected MCP servers and their tools at a glance |
| **Git** / **GitHub** | Branch / status / diff view + GitHub repo browsing |
| **Diff** | Side-by-side diff viewer for the active change set |
| **Context** | Live context window usage — real data from CLI `result` events, not estimates |
| **Shortcuts** | Keyboard shortcut reference |

### ✨ Skills manager
Skill files (`@skills/filename.md`) are injected into sessions on demand. The Skills panel shows every skill with an **active** badge for files currently imported in `CLAUDE.md` — one click to activate or deactivate, inline editor to modify.

The Console → Skills page adds full CRUD: create new skills, copy the `@import` line, toggle active state, delete.

### 🔐 Permission modes — visible, always one click away
Four modes mapped directly to CLI flags, color-coded in the status bar:

| Mode | CLI flag | When to use |
|------|----------|-------------|
| **Default** | *(none)* | Interactive — Claude asks before acting |
| **Plan** | `--plan` | Review the plan before any execution |
| **Accept** | `--auto-approve-everything` | Trusted scripted workflows |
| **Bypass** | `--dangerously-skip-permissions` | Fully autonomous runs |

### 🧠 Workspace awareness
A `workspace-index.json` is written to disk on every state change. Claude reads it via file tools so it always knows project names, session history, model, and permission mode. A hidden system prompt layer injects full context on every CLI turn.

### 📁 Project organizer
- Drag-to-reorder projects in the sidebar
- Per-project color accents that cascade through the UI
- Drag sessions between projects
- Fork, rename, pin, delete via context menu

### 🎨 Chat UI
- 9 streaming state variants: `thinking` · `generating` · `coding` · `tools` · `searching` · `reading` · `running` · `applying` · `writing`
- Code blocks: syntax highlighting, line numbers, copy, download, inline JSX preview, open in panel
- Scroll capped at 380px with Show more / Show less toggle

### 🖥️ JSX live preview
Claude writes a React component → click 👁 → it renders inline. No build step.
- Babel standalone compiles JSX synchronously
- `<script type="importmap">` resolves `react`, `react-dom/client`, `framer-motion` to esm.sh
- Preview panel with **zoom controls** (−/+/reset)

### 📊 Live context panel
Real data from the CLI `result` event — not estimates:
- Input / output / cache tokens, cost in USD, tool call count
- Arc gauge showing % of context window used

### 🌐 Embedded browser + split view
A full Chromium browser panel running on **your real session** — your cookies, your logins, your extensions (via CDP attach, not a sandboxed throwaway).
- Tabs, address bar, back/forward/reload, devtools
- **Split view** — two panes side-by-side, drag the divider to resize, swap with one click. Claude can drive both panes in a single turn (research left, take notes right) via the ccm-browser MCP
- OAuth-aware popup handling (Google / Microsoft / GitHub sign-in works) + fingerprint stealth so most Cloudflare challenges pass
- "Open in system browser" escape hatch for sites that refuse to embed

### 🗂️ CLI session tracker
The sidebar surfaces your **Claude Code CLI sessions** (from `~/.claude/projects/`) alongside CCM's own chat sessions — one place to see both. Click a session to reveal its transcript; optionally **link** session storage into your project folder (`<project>/sessions/claude_session_cli/`) via a junction so CLI transcripts live with the code.

### 🪟 Dual-window / multi-screen
Spawn a second CCM window on another display — each window is an independent dockview workspace. Close the primary and the secondary is promoted automatically (no stranded window).

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Electron renderer (app.js + style.css) │  ← All UI, state, rendering
│  workspace.js  (dockview panels)        │
│                                         │
│  Hidden system layer (every turn):      │
│    CHAT_SYSTEM_PROMPT                   │
│  + buildSessionContext()                │  ← Projects, sessions, model, mode
│  + workspace-index.json (on disk)       │
└─────────────┬───────────────────────────┘
              │ IPC (ipcRenderer.invoke)
┌─────────────▼───────────────────────────┐
│  Electron main (main.js)                │
│    fs / shell / kb / memory / agents    │
│    claude:send → streamMessage()        │
└─────────────┬───────────────────────────┘
              │ child_process.spawn
┌─────────────▼───────────────────────────┐
│  claude-service.js                      │
│    Spawns: claude --output-format stream│
│    Parses NDJSON events                 │
│    Emits: claude:chunk / claude:done    │
└─────────────┬───────────────────────────┘
              │ JSON stream
┌─────────────▼───────────────────────────┐
│  Claude Code CLI  (official, unmodified)│
│  github.com/anthropics/claude-code      │
└─────────────────────────────────────────┘
```

The CLI is never patched or intercepted — it runs as a child process with `--output-format stream-json`. All extension happens through the official surface: Skills injected via `CLAUDE.md`, Hooks declared in the same file, MCP servers registered normally.

---

## Getting started

### Prerequisites
- [Node.js](https://nodejs.org) 20+ (Vite 8 requires Node 20.19+/22.12+)
- [Claude Code CLI](https://github.com/anthropics/claude-code) installed and authenticated (`claude` in `PATH`)

### Windows installer — details

The [one-liner](#quick-install--windows-powershell) at the top scans for any existing Claude install (read-only — never touches them), asks where to put an **isolated** copy, gets your consent for the local data folder, then installs and drops a one-click launcher:

```powershell
irm https://raw.githubusercontent.com/hlsitechio/Claude-Code-Mods/main/setup.ps1 | iex
```

> ⚠️ **Beta.** Expect rough edges. Bugs → [open an issue](https://github.com/hlsitechio/Claude-Code-Mods/issues) with steps to reproduce.

**What the installer guarantees:**
- **Won't touch your existing setup** — it detects the official Claude Desktop, any prior CCM data, and your Claude Code CLI config, and leaves all of them alone.
- **Fully isolated** — all of this install's data lives under `<install>\data` (via `CCM_USER_DATA_DIR`), so nothing is shared or overwritten.
- **No system changes** — no registry edits, no PATH changes. Delete the install folder to remove it completely.

### Manual install (all platforms)

```bash
git clone https://github.com/hlsitechio/Claude-Code-Mods.git
cd Claude-Code-Mods
npm install

# Development (hot-reload)
npm run electron:dev

# Isolate this install's data anywhere you like (optional):
#   CCM_USER_DATA_DIR=/path/to/data npm run electron:dev

# Build for your platform
npm run dist:linux    # AppImage + .deb
npm run dist:win      # NSIS installer + portable
npm run dist          # Auto-detect platform
```

### Linux notes

Works on Ubuntu, Debian, Kali, Fedora, Arch — anywhere Electron 42 runs.

The app auto-discovers the `claude` binary by checking common paths (`~/.npm-global/bin/claude`, `~/.local/bin/claude`, `/usr/local/bin/claude`). If your binary is elsewhere, set the env var:

```bash
export CLAUDE_CLI_PATH=/path/to/your/claude
npm run electron:dev
```

Other optional env vars:
- `CLAUDE_CONFIG_DIR` — custom `.claude` config directory (default: `~/.claude`)
- `CCM_FS_ROOT` — override the file explorer root directory (default: app root)

---

## Where your data lives

CCM is **local-first** — everything it creates stays on your machine, in plain files you can read, back up, or delete. Nothing is sent to a CCM server (there isn't one). Here's exactly what gets written and where, so there are no surprises.

### 1. In the project folder (next to the app — version-controllable, mostly git-ignored)

| Path | What it holds |
|------|---------------|
| `sessions/*.json` | **Chat sessions** — every conversation's messages, one file per session |
| `sessions/claude_session_cli/` | **Linked CLI transcripts** — Claude Code CLI session `.jsonl` files, if you used the sidebar's "link to project" |
| `notes/*.md` | **Notes** panel — your persistent markdown scratchpad |
| `memory/*.md` | **Memory** — your profile, preferences, tech stack (injected into every session as context) |
| `agents/*.json` | **Agent** definitions — custom autonomous agents you've configured |
| `skills/*.md` | **Skills** — domain-knowledge files, loaded via `CLAUDE.md` |
| `knowledge/` | **Knowledge base** files surfaced in the KB editor |
| `codeblocks/<id>/` | **Saved code artifacts** — code blocks you exported, rendered HTML included |
| `screenshot/*.png` | **Images** — screenshots captured via the Screenshots panel |
| `kanban.json` | **Tasks** — the per-project kanban board (shared with the CLI) |
| `workspace-index.json` | **Workspace state** — projects/sessions/model/mode snapshot Claude reads for awareness |

> The `.gitignore` keeps the personal ones (`sessions/`, `memory/`, `notes/`, `codeblocks/`, `workspace-index.json`, etc.) out of commits — fork the repo and your conversations stay yours.

### 2. In the OS app-data folder (per-user, never in the repo)

The exact path is your platform's standard app-data dir:
- **Windows** — `%APPDATA%\claude-code-desktop\`
- **macOS** — `~/Library/Application Support/claude-code-desktop/`
- **Linux** — `~/.config/claude-code-desktop/`

| Path | What it holds |
|------|---------------|
| `Partitions/ccm-browser/` | **Embedded browser session** — cookies, cache, localStorage, logins for the Browser panel |
| `chrome-profile/` | Chrome profile for the CDP-driven browser |
| `browser-profile/` | Claude's own bookmarks / history / read-list for the browser |
| `claude-desktop-config.json` | API-key auth (if you use a raw key instead of OAuth) |
| `gh-pat.enc` | Encrypted GitHub personal access token (for the Git/GitHub panels) |
| `window-state.json` | Window position + size |

### 3. In `~/.claude/` (shared with the Claude Code CLI + the CCM↔MCP bridge)

| Path | What it holds |
|------|---------------|
| `projects/<cwd>/*.jsonl` | The CLI's own session transcripts — what the sidebar's **CLI tracker** reads |
| `ccm-browser-endpoint.json` | MCP endpoint URL + bearer token (mode `0600`) so the ccm-browser MCP can reach the running app. Per-slot variants: `ccm-browser-endpoint-2.json`, etc. |
| `.claude.json` / `settings.json` | Where CCM registers the `ccm-browser` MCP server |

**To wipe everything CCM stored:** delete the OS app-data folder (zone 2) + the project-folder data dirs (zone 1). The `~/.claude/` files (zone 3) belong to the Claude Code CLI — leave those unless you're also resetting the CLI.

---

## Stack

| Layer | Tech |
|-------|------|
| Desktop | Electron 42 |
| Panels | dockview-core |
| UI | Vanilla JS (ES modules) — no framework, no build pipeline for renderer |
| Styles | Plain CSS with custom properties |
| Icons | Phosphor Icons |
| Build | Vite 8 |
| Packaging | electron-builder (NSIS installer + portable) |
| JSX preview | Babel standalone + importmap + esm.sh |

---

## Roadmap

- [x] **ccm-browser MCP** — 183-tool embedded-browser automation surface
- [x] **Split-view** — Claude drives two browser panes in parallel
- [x] **Multi-slot** — N parallel CCM instances, isolated browsers
- [x] **CLI session tracker** — Claude Code CLI sessions in the sidebar
- [x] Linux builds (AppImage + .deb)
- [ ] Hooks editor — visual UI for every `CLAUDE.md` lifecycle hook
- [ ] Skills marketplace — browse and install community skill packs
- [ ] Session replay — step through a session's tool calls frame by frame
- [ ] In-app MCP server manager — install / configure MCP servers from the UI
- [ ] macOS builds
- [ ] In-app JSONL viewer for CLI session transcripts

---

## Contributing

PRs welcome — see **[CONTRIBUTING.md](CONTRIBUTING.md)** for dev setup, the three-layer IPC/MCP wiring rules, commit style, and the manual test plan.

The short version:
- Keep `app.js` and `style.css` as the single source of truth — no framework, no build pipeline for the renderer
- Any new IPC channel needs a handler in `main.js` **and** an entry in `preload.js`
- An ccm-browser MCP tool change touches three files: `electron/chrome-controller.js` (the function), `electron/browser-http-server.js` (the route), `bin/browser-mcp.mjs` (schema + dispatch)
- New skills go in `skills/` as plain markdown — loaded via `CLAUDE.md` automatically

## Security

Found a vulnerability? See **[SECURITY.md](SECURITY.md)** — report privately via GitHub security advisory, don't open a public issue. That file also documents the security boundaries CCM actively maintains (bearer-token MCP auth, URL-scheme allowlist, browseable-target filter, etc.).

---

## Acknowledgements

Built entirely on top of [Claude Code](https://github.com/anthropics/claude-code) by Anthropic. This project exists because the CLI is excellent — the goal is to make it accessible to more people, not to improve it.

The Skills / Hooks / MCP architecture is Anthropic's design. This project just gives it a window.

---

## License

MIT — use it, fork it, build on it.
