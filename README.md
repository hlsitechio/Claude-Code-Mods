# Claude Code Desktop

> A fan-made Electron desktop UI for the [Claude Code CLI](https://github.com/anthropics/claude-code) — built to make agentic coding sessions more transparent, safer, and easier to manage.

**Not affiliated with Anthropic. Built by a developer who uses Claude Code every day.**

[![Status](https://img.shields.io/badge/status-active-brightgreen)](https://github.com/hlsitechio/Claude-Code-Mods)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Electron](https://img.shields.io/badge/electron-35-47848F?logo=electron)](https://electronjs.org)
[![Claude Code](https://img.shields.io/badge/claude--code-CLI-D97757)](https://github.com/anthropics/claude-code)

---

## What this is

The Claude Code CLI is powerful but terminal-only. This project wraps it in a native desktop UI focused on three things the CLI alone doesn't give you:

1. **Visibility** — see tokens, cost, tool calls, and context usage in real time as Claude works
2. **Safety** — permission modes (default / plan / accept / bypass) are front-and-center, not hidden flags
3. **Workspace memory** — Claude knows your project names, session history, and active context across every turn

Everything is built *on top of* the official CLI — no patched binaries, no private APIs. If the CLI ships a new flag, it works here.

---

## Key features

### 🧠 Workspace awareness
A `workspace-index.json` is written to disk on every state change — projects, sessions, titles, model, permission mode. Claude reads it via file tools, so it always knows "you have 3 projects, 10 sessions, the active one is X." A hidden system prompt layer injects the full workspace context on every CLI turn, including on `--resume` sessions.

### 🔐 Permission modes — visible by default
Four modes mapped directly to CLI flags:

| Mode | CLI flag | When to use |
|------|----------|-------------|
| **Default** | *(none)* | Interactive — Claude asks before acting |
| **Plan** | `--plan` | Review the plan before any execution |
| **Accept** | `--auto-approve-everything` | Trusted scripted workflows |
| **Bypass** | `--dangerously-skip-permissions` | Fully autonomous runs |

The active mode is always visible in the UI and changes the color of the session indicator.

### 📊 Live context panel
Real data from the CLI `result` event — not estimates:
- Input / output / cache tokens per turn, accumulated across the session
- Cost in USD
- Tool call count
- Arc gauge showing % of context window used
- Breakdown bars: system+cache vs conversation vs output

### 🖥️ JSX live preview — inline in chat
Claude writes a React component → click 👁 → it renders right inside the code block. No build step.

- Babel standalone compiles JSX synchronously
- `<script type="importmap">` resolves `react`, `react-dom/client`, `framer-motion` to esm.sh
- Compiled module injected as `<script type="module">` — works in sandboxed `srcdoc` iframes
- Auto-fixes common Claude output patterns: malformed JSX comments `{/ text /}` → `{/* text */}`, unquoted template literals in style objects `left: ${p.x}%` → `` left: `${p.x}%` ``

### 📁 Clickable filesystem paths
Paths in code blocks (e.g. `G:\project\src\app.js`) that exist on disk are rendered in blue and open Explorer on click. Checked via Electron IPC — no false positives.

### 💬 Session management
- Projects + Recent + Pinned session buckets
- Drag-to-resize sidebar
- Per-project color accents
- Fork, rename, pin, delete via context menu
- Session folders created on disk automatically

### 🎨 Chat UI
- 9 streaming state variants with gradient shimmer animations: `thinking` · `generating` · `coding` · `tools` · `searching` · `reading` · `running` · `applying` · `writing`
- Code blocks: syntax highlighting (12 token types), line numbers, copy, download, inline preview, open in panel
- **Code block scroll**: capped at 380px with `Show more / Show less` expand toggle — no more 200-line walls

### 🤖 Skills / persistent context
`CLAUDE.md` at the project root is auto-loaded by the CLI as a persistent skill layer. Four skills ship out of the box:

| Skill | Purpose |
|-------|---------|
| `app-context.md` | Workspace awareness — how to read `workspace-index.json`, session structure, UI quick reference |
| `design-system.md` | Color palette, spacing, motion defaults so Claude's generated components match the app |
| `jsx-code-blocks.md` | How the inline preview works, what globals are available, what patterns to avoid |
| `agents.md` | Available sub-agents and their capabilities |

---

## Architecture

```
┌─────────────────────────────────────────┐
│  Electron renderer (app.js + style.css) │  ← All UI, state, rendering
│                                         │
│  Hidden system layer (every turn):      │
│    CHAT_SYSTEM_PROMPT                   │
│  + buildSessionContext()                │  ← Project names, session titles,
│  + workspace-index.json (on disk)       │     model, mode, message count
└─────────────┬───────────────────────────┘
              │ IPC (ipcRenderer.invoke)
┌─────────────▼───────────────────────────┐
│  Electron main (main.js)                │
│    fs:read / fs:write / fs:list         │
│    fs:exists / shell:open               │
│    claude:send → streamMessage()        │
└─────────────┬───────────────────────────┘
              │ child_process.spawn
┌─────────────▼───────────────────────────┐
│  claude-service.js                      │
│    Spawns: claude --output-format stream│
│            --system-prompt "..."        │
│            [--resume sessionId]         │
│            [--dangerously-skip-...]     │
│            [--auto-approve-everything]  │
│                                         │
│  Parses NDJSON events:                  │
│    system   → captures model            │
│    assistant → counts tool_use blocks   │
│    result   → cost, tokens, num_turns   │
│                                         │
│  Emits: claude:chunk / claude:done      │
└─────────────┬───────────────────────────┘
              │ JSON stream
┌─────────────▼───────────────────────────┐
│  Claude Code CLI (official)             │
│  github.com/anthropics/claude-code      │
└─────────────────────────────────────────┘
```

---

## Getting started

### Prerequisites
- [Node.js](https://nodejs.org) 18+
- [Claude Code CLI](https://github.com/anthropics/claude-code) installed and authenticated (`claude` in PATH)

### Install & run

```bash
git clone https://github.com/hlsitechio/Claude-Code-Mods.git
cd Claude-Code-Mods
npm install

# Development (hot-reload)
npm run electron:dev

# Build Windows installer
npm run dist
```

The app talks to whichever `claude` binary is in your PATH — same auth, same subscription, same models.

---

## Stack

| Layer | Tech |
|-------|------|
| Desktop | Electron 35 |
| UI | Vanilla JS (ES modules), no framework |
| Styles | Plain CSS with custom properties |
| Icons | Phosphor Icons |
| Build | Vite 5 |
| Packaging | electron-builder (NSIS installer + portable) |
| JSX preview | Babel standalone + importmap + esm.sh |

---

## Design principles

These guide every decision in the codebase:

**Transparency over convenience** — every token spent, every tool call made, every permission granted is visible. The user should never be surprised by what Claude did.

**Extend, don't replace** — the CLI does the heavy lifting. The UI adds visibility and ergonomics without intercepting or modifying the agent's behavior.

**Safety as a first-class feature** — permission modes aren't buried in settings. They're in the session header, color-coded, one click to change.

**Context is infrastructure** — workspace-index.json, the system prompt layer, and the skills files aren't features. They're the foundation that makes every other feature reliable.

---

## Contributing

PRs welcome. A few guidelines:

- Keep `app.js` and `style.css` as the single source of truth — no framework, no build pipeline for the renderer
- Any new IPC channel needs a handler in `main.js` and an entry in `preload.js`
- New skills go in `skills/` as plain markdown — they're loaded by the CLI automatically via `CLAUDE.md`

---

## Acknowledgements

Built on top of [Claude Code](https://github.com/anthropics/claude-code) by Anthropic. This project exists because the CLI is excellent — the goal is to make it accessible to more people, not to improve it.

---

## License

MIT — use it, fork it, build on it.
