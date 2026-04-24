# Changelog

All notable changes to this project are documented here.

---

## [Unreleased]

### Added
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
