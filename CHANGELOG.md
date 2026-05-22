# Changelog

All notable changes to this project are documented here.

---

## [Unreleased]

### Added

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
