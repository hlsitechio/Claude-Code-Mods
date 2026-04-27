# Claude Code Mods

> **The missing desktop layer for Claude Code CLI** — a native Electron workspace that makes every action Claude takes visible, organized, and one click away.

[![Status](https://img.shields.io/badge/status-active%20development-brightgreen)](https://github.com/hlsitechio/Claude-Code-Mods)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-35-47848F?logo=electron&logoColor=white)](https://electronjs.org)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-CLI%20wrapper-D97757?logo=anthropic&logoColor=white)](https://github.com/anthropics/claude-code)
[![Topics](https://img.shields.io/badge/topics-claude--code%20%7C%20mcp%20%7C%20skills%20%7C%20hooks-5a67d8)](https://github.com/hlsitechio/Claude-Code-Mods/topics)

> Built on top of [Claude Code](https://github.com/anthropics/claude-code) by Anthropic. Not affiliated — just a developer who uses it every day and wanted a proper workspace.

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

## Feature overview

### 🪟 Dockview workspace
A drag-and-drop panel canvas. Every tool in its own resizable, re-dockable panel. Right-click anywhere to add panels from the context menu.

| Panel | What it does |
|-------|-------------|
| **Chat** | Main conversation + 9 streaming state variants with gradient shimmer |
| **Preview** | Live JSX/HTML/React iframe — Claude writes a component, click 👁 to render it |
| **Terminal** | Embedded shell (PowerShell / bash) |
| **Files** | Full project file tree |
| **Skills** | Browse, edit, activate/deactivate skill files with inline editor + active badges |
| **Notes** | Persistent markdown scratchpad with toolbar + live preview |
| **Plan** | Claude's task plan rendered as a kanban-style checklist |
| **MCP** | All connected MCP servers and their tools at a glance |
| **Git** | Branch / status / diff view |
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
- [Node.js](https://nodejs.org) 18+
- [Claude Code CLI](https://github.com/anthropics/claude-code) installed and authenticated (`claude` in `PATH`)

### Install & run

```bash
git clone https://github.com/hlsitechio/Claude-Code-Mods.git
cd Claude-Code-Mods
npm install

# Development (hot-reload)
npm run electron:dev

# Build for your platform
npm run dist:linux    # AppImage + .deb
npm run dist:win      # NSIS installer + portable
npm run dist          # Auto-detect platform
```

### Linux notes

Works on Ubuntu, Debian, Kali, Fedora, Arch — anywhere Electron 35 runs.

The app auto-discovers the `claude` binary by checking common paths (`~/.npm-global/bin/claude`, `~/.local/bin/claude`, `/usr/local/bin/claude`). If your binary is elsewhere, set the env var:

```bash
export CLAUDE_CLI_PATH=/path/to/your/claude
npm run electron:dev
```

Other optional env vars:
- `CLAUDE_CONFIG_DIR` — custom `.claude` config directory (default: `~/.claude`)
- `CCM_FS_ROOT` — override the file explorer root directory (default: app root)

---

## Stack

| Layer | Tech |
|-------|------|
| Desktop | Electron 35 |
| Panels | dockview-core |
| UI | Vanilla JS (ES modules) — no framework, no build pipeline for renderer |
| Styles | Plain CSS with custom properties |
| Icons | Phosphor Icons |
| Build | Vite 5 |
| Packaging | electron-builder (NSIS installer + portable) |
| JSX preview | Babel standalone + importmap + esm.sh |

---

## Roadmap

- [ ] Hooks editor — visual UI for every `CLAUDE.md` lifecycle hook
- [ ] Skills marketplace — browse and install community skill packs
- [ ] Session replay — step through a session's tool calls frame by frame
- [ ] MCP server manager — install / configure MCP servers from the UI
- [x] Linux builds (AppImage + .deb)
- [ ] macOS builds

---

## Contributing

PRs welcome. A few guidelines:

- Keep `app.js` and `style.css` as the single source of truth — no framework, no build pipeline for the renderer
- Any new IPC channel needs a handler in `main.js` and an entry in `preload.js`
- New skills go in `skills/` as plain markdown — they're loaded via `CLAUDE.md` automatically

---

## Acknowledgements

Built entirely on top of [Claude Code](https://github.com/anthropics/claude-code) by Anthropic. This project exists because the CLI is excellent — the goal is to make it accessible to more people, not to improve it.

The Skills / Hooks / MCP architecture is Anthropic's design. This project just gives it a window.

---

## License

MIT — use it, fork it, build on it.
