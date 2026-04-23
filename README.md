# Claude Code Mods

A fan-made UI redesign concept for the Claude Code desktop sidebar — built with vanilla JS + Vite, no framework.

> **This is a community prototype. Not affiliated with Anthropic.**

![Claude Code Mods](https://img.shields.io/badge/status-prototype-orange) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## Features

### Sidebar
- Tree-style project & session hierarchy with per-project color accents
- Drag-to-resize sidebar (persisted via `localStorage`)
- Live search / filter across all sessions
- New project modal with 7-color swatch picker
- Pin, fork, rename, delete sessions via context menu

### Chat
- User & assistant message bubbles with tool-use blocks
- **9 streaming state variants** — each with its own gradient shimmer + dot animation:
  `thinking` · `generating` · `coding` · `tools` · `searching` · `reading` · `running` · `applying` · `writing`
- Code blocks with syntax highlighting (12 token types), VS Code–style line numbers, inline preview, fullscreen modal, copy & download

### Context Strip
A slim status bar between the chat and composer showing live session state — click any chip to open the right panel on that tab:

| Chip | Panel content |
|------|--------------|
| **MCP** (hub icon) | Connected servers, tool lists, live status |
| **Git** (real Git logo) | Branch, modified files, recent commits |
| **Context** (gauge) | Arc gauge, token breakdown, cost estimate |
| **Plan** (tasks icon) | Task tree with sub-tasks |

### Right Panel (10 tabs)
Preview · Diff · Terminal · Files · Plan · MCP · Git · Context · Shortcuts · Tasks

- Drag-to-resize right panel (260–700 px, persisted)
- **Plan panel** — task tree with expandable sub-task trees, color-coded dots, CSS grid expand animation, shimmer on active task
- **MCP panel** — server cards with tool tag lists
- **Git panel** — branch, file diffs, commit history
- **Context panel** — SVG arc gauge, token breakdown bars, tools/cost summary

### Settings
Consolidated settings drawer: Session · Permissions · Model · Microphone · Insert · Language · Theme · Font

---

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server (http://localhost:5182)
npm run dev
```

---

## Stack

| | |
|---|---|
| **Runtime** | Vanilla JS (ES modules via Vite) |
| **Styles** | Plain CSS with custom properties + Tailwind utility classes |
| **Icons** | Phosphor Icons (classic script) |
| **Build** | Vite 5 |
| **i18n** | EN + FR built-in |

---

## Project Structure

```
full_install/
├── index.html     # Full app shell — sidebar, chat, modals, right panel
├── app.js         # All JS: state, render, event handlers (~2500 lines)
├── style.css      # All styles: layout, components, animations (~2500 lines)
├── icons.js       # Phosphor icon registry (window.ICONS / window.renderIcons)
└── vite.config.js # Dev server config (port 5182)
```

---

## License

MIT — do whatever you want with it. If you build something cool on top, a link back would be appreciated.
