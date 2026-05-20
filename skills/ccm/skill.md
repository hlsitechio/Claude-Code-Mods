# CCM — Claude Code Mods · Agent Skill

> **Import this file to give any AI agent full operational knowledge of the Claude Code Mods (CCM) Electron desktop app.** It covers every command, panel, shortcut, API, and system the agent needs to drive or reason about the app.

---

## 1. What CCM Is

Claude Code Mods is a custom Electron + Vite shell that wraps the **Claude Code CLI** (`claude.cmd` / `claude`). It adds:
- A persistent chat UI with session management
- A dockview-based workspace with tool panels
- Dual-window / secondary-screen support
- Canvas artifact system (live JSX/HTML preview)
- Terminal panel (xterm.js + PTY)
- Git, MCP, GitHub, Files, Screenshots, Notes, Plan, Skills panels
- Split-chat: run multiple independent Claude agents side-by-side

**Tech stack:** Electron 30, Vite 5, dockview-core, xterm.js, Tailwind CSS  
**Entry point:** repo root (clone wherever you like — paths below are relative to it)  
**Key files:**
| File | Role |
|------|------|
| `app.js` | Main renderer — 9 500 lines, all UI logic |
| `workspace.js` | Dockview layout, terminals, canvas panels |
| `electron/main.js` | Main process, IPC handlers, dual-window |
| `electron/claude-service.js` | CLI + SDK streaming, model routing |
| `electron/preload.js` | `window.electronAPI` surface |
| `style.css` | All custom CSS |
| `index.html` | Shell HTML |

---

## 2. Slash Commands

Type `/` in the composer to trigger autocomplete.

| Command | Description |
|---------|-------------|
| `/clear` | Clear the current conversation |
| `/compact` | Truncate history — keeps last 8 messages |
| `/new` | Start a new session |
| `/pin` | Pin / unpin the active session |
| `/cost` | Show token usage and cost for this session |
| `/status` | Show session status (model, effort, context) |
| `/help` | List all slash commands |
| `/model` | Open model & effort switcher |
| `/permissions` | Cycle permission mode |
| `/config` | Open appearance settings |
| `/terminal` | Open a shell terminal panel |
| `/agents` | Open the AI agents panel |
| `/memory` | Open project memory manager |
| `/mcp` | Open MCP tools panel |
| `/init` | Create a `CLAUDE.md` in the project root |
| `/pr` | Load a GitHub PR as context (`--from-pr`) |
| `/doctor` | Run environment diagnostics |
| `/login` | Authenticate (OAuth or API key) |
| `/logout` | Sign out |

---

## 3. Keyboard Shortcuts

### General
| Shortcut | Action |
|----------|--------|
| `Ctrl /` | Keyboard shortcuts panel |
| `Ctrl ,` | Settings / profile |
| `Ctrl \`` | Developer console |
| `Ctrl F` | Find in page |
| `Ctrl 0` | Reset zoom to 100% |
| `Ctrl + Scroll` | Zoom in / out |

### Sidebar & Sessions
| Shortcut | Action |
|----------|--------|
| `Ctrl N` | New session |
| `Ctrl W` | Close active session |
| `Ctrl Tab` / `⇧ Ctrl ]` | Next session |
| `⇧ Ctrl Tab` / `⇧ Ctrl [` | Previous session |
| `Ctrl K` | Search sessions |
| `⇧ Ctrl N` | New project |
| `Ctrl B` | Collapse / expand sidebar |
| `Ctrl P` | Pin / unpin active session |

### Chat / Composer
| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `⇧ Enter` | New line in composer |
| `Esc` | Stop Claude's streaming response |
| `⇧ Ctrl U` | Attach file from computer |
| `⇧ Ctrl I` | Open model selector |
| `⇧ Ctrl E` | Open effort selector |
| `⇧ Tab` | Cycle permission mode |
| `@` | Insert context mention |
| `/` | Trigger slash command |

### Panels / Panes
| Shortcut | Action |
|----------|--------|
| `⇧ Ctrl P` | Toggle Preview (apercu) panel |
| `⇧ Ctrl D` | Toggle Diff panel |
| `⇧ Ctrl F` | Toggle Files panel |
| `⇧ Ctrl S` | Select element in Preview |

---

## 4. Tool Panels

All panels live in the **dockview workspace** (`#main-dock`). Each can be dragged, tabbed, split, or moved to the secondary window.

| Panel ID | Label | What it does |
|----------|-------|--------------|
| `apercu` | Preview | Live HTML/JSX iframe with zoom (1280px virtual width, auto-fit height) |
| `diff` | Diff | Side-by-side file diff viewer |
| `terminal` | Terminal | Spawns xterm.js + PTY shell (separate `term-*` panel per instance) |
| `fichiers` | Files | File tree browser for the active project directory |
| `taches` | Tasks | Kanban-style task board |
| `plan` | Plan | Parses `[x]`/`[ ]`/`[~]` plan blocks from assistant messages |
| `notes` | Notes | Markdown notes stored on disk |
| `skills` | Skills | Browse/load CCM knowledge-base skill entries |
| `shortcuts` | Shortcuts | Keyboard shortcut reference |
| `mcp` | MCP | Manage Model Context Protocol servers |
| `git` | Git | Git status, log, diff, commit (polls every 5 s when active) |
| `github` | GitHub | PR/issue browser with OAuth |
| `screenshots` | Screenshots | Capture / manage screenshots (clipboard, region, fullscreen) |
| `context` | Context | Token usage ring and context window breakdown |

**Activate a panel programmatically:**
```js
window.Workspace.activatePanel('apercu'); // any panel ID
```

**Open a terminal:**
```js
window.Workspace.openTerminal(false);       // shell
window.Workspace.openTerminal(true);        // auto-launches `claude`
window.Workspace.openTerminal(true, { worktree: true }); // worktree session
```

---

## 5. Models & Effort

### Models (model chip, `⇧ Ctrl I`)
| ID | Label | Shortcut |
|----|-------|----------|
| `claude-sonnet-4-6` | Sonnet 4.6 | `1` |
| `claude-sonnet-4-5` | Sonnet 4.5 | `2` |
| `claude-opus-4-5` | Opus 4.5 | `3` |
| `claude-opus-4` | Opus 4 | `4` |
| `claude-haiku-3-5` | Haiku 3.5 | `5` |

### Effort levels (model chip, `⇧ Ctrl E`)
| ID | Label | CLI flag |
|----|-------|----------|
| `faible` | Low | `--effort low` |
| `moyen` | Medium | `--effort medium` |
| `elevee` | High | `--effort high` |
| `tres-eleve` | Very high | `--effort max` ← default |
| `max` | Max | `--effort max` |

### Modes (model chip → Mode section)
| Mode | Behaviour |
|------|-----------|
| **Claude Code (CLI)** | Default. Uses `claude.cmd` / `claude` CLI subprocess. Full tool access, sessions, `--resume`. |
| **Direct Claude API** | Bypasses CLI. Uses Anthropic SDK directly. Full conversation history, no tools. Effort/budget N/A. |

---

## 6. Permission Modes (`⇧ Tab` to cycle)

| ID | Label | CLI behaviour |
|----|-------|---------------|
| `default` | Default | Claude prompts before every tool call |
| `accept` | Accept edits | Auto-accepts file edits; prompts for others |
| `plan` | Plan | Planning only; no file writes |
| `bypass` | Skip permissions | `--dangerously-skip-permissions` — no prompts |

---

## 7. Session System

- Sessions stored in **localStorage** (metadata) + **disk** (messages JSON per ID)
- Each session: `{ id, title, projectId, cliSessionId, color, pinned, updatedAt }`
- `cliSessionId` — the CLI's internal session UUID, used with `--resume` for multi-turn
- Switching sessions → renders message history from `window.__chatHistory`
- Operations: create, rename, duplicate, archive, delete, pin/unpin

**Global state:**
```js
window.__chatHistory   // array of {role, content} for the active session
window.__planTodos     // parsed plan tasks [{text, state}] or null
window.__maxBudgetUsd  // cost cap in USD, or null
```

---

## 8. Workspace & Layout

Built on **dockview-core**. The entire workspace (`#main-dock`) is one dockview instance.

**Default layout:** Chat (left, flex) | Tool group (right, 440px) with all tool panels tabbed.

**Workspace management** (multiple named workspaces):
```js
window.Workspace.wsGetList()           // [{id, name, layout, updatedAt}]
window.Workspace.wsGetActiveId()       // string
window.Workspace.wsCreate('My WS')    // creates + switches
window.Workspace.wsSwitch(id)         // saves current, reloads
window.Workspace.wsRename(id, 'Name')
window.Workspace.wsDelete(id)         // can't delete last
window.Workspace.saveCurrentLayout()  // manual save
window.Workspace.resetLayout()        // wipe saved, reload default
```

**Split chat (parallel agents):**
```js
window.Workspace.openSplitChat({ sessionId, sessionTitle });
// or drag a session row from sidebar onto #main-dock
```

Each split-chat panel is fully independent: own session, history, model, stream.

**View controls:**
```js
window.Workspace.toggleToolsHidden()  // hide / show all tool panels
window.Workspace.setViewLocked(true)  // hide × buttons on all tabs
```

**Context menu** (right-click on workspace):
- Reset layout
- Lock / unlock view
- Hide / show tool panels
- New split chat
- Add specific panel (submenu)

---

## 9. Canvas / Artifact System

Canvas panels render HTML/JSX/TSX in sandboxed iframes. Auto-saved to the codeblock library.

**Pin an artifact:**
```js
window.Workspace.pinArtifact(
  title,   // tab label
  html,    // full HTML or JSX (post-Babel)
  sandbox, // 'allow-scripts' | 'allow-scripts allow-forms ...'
  lang,    // 'html' | 'jsx' | 'tsx' | 'js' | ...
  source   // original source before Babel transform
);
```

**Codeblock library IDs:** `codeblock_000001`, `codeblock_000002`, …

**Canvas panel toolbar:** zoom-out · zoom% (click = reset) · zoom-in · edit · reload · popout

**Zoom:** `Ctrl + Scroll` on canvas. Range: 25%–300%, 10% steps. Auto-fit default (scales to panel width; height fills panel on any resolution including 2K).

**Events:**
```js
document.dispatchEvent(new CustomEvent('codeblock:created', { detail: { cbId, title, panelId } }));
document.dispatchEvent(new CustomEvent('codeblock:edit-request', { detail: { cbId, title } }));
```

---

## 10. Secondary Window / Dual-Screen

- Spawn: titlebar button `#tb-spawn-secondary` or `window.electronAPI.spawnSecondary()`
- Secondary window opens on the OTHER display, fills it completely
- Secondary window shows a left-edge **SECONDARY strip** (52px) instead of the sidebar
- Strip buttons: **Make Primary** (swap roles) | **Close**
- Titlebar on secondary: orange top border + screen chip shows "2"

**Panel drag between windows:**
- Drag any dockview tab past the window border → overlay appears on receiving window
- Click the overlay (or release mouse there) → panel transfers
- IPC: `panel:drag-start` → `panel:drag-accept` (from receiver) → `panel:receive`

**Role detection:**
```js
await window.electronAPI.getWindowRole() // 'primary' | 'secondary'
await window.electronAPI.hasSecondary()  // boolean
```

---

## 11. IPC / electronAPI Surface

All methods live on `window.electronAPI` (injected by `electron/preload.js`).

### Window
```js
electronAPI.minimize() / maximize() / closeWindow() / hideToTray()
electronAPI.isMaximized()            // → boolean
electronAPI.zoom.get() / zoom.set(n) // n: 0.5–2.5
```

### Auth
```js
electronAPI.getAuthStatus()   // → { authenticated, email, ... }
electronAPI.signIn()          // OAuth flow
electronAPI.signOut()
electronAPI.hasApiKey()       // legacy API key
electronAPI.setApiKey(key)
electronAPI.clearApiKey()
```

### Chat streaming
```js
// Main chat (no requestId)
electronAPI.sendMessage(messages, model, system, cliSessionId, permMode, opts)
// opts: { effort, sessionName, addDirs, maxBudget, directMode, forkFromCli, fromPr }

// Parallel stream (split chat)
electronAPI.sendMessageFor(messages, model, system, cliSessionId, permMode, requestId, opts)

// Cancel
electronAPI.abort(requestId)

// Listeners
electronAPI.onChunk(cb)             // main stream text chunks
electronAPI.onDone(cb)              // main stream done + stats
electronAPI.onChunkFor(reqId, cb)   // named stream chunks
electronAPI.onDoneFor(reqId, cb)    // named stream done
electronAPI.onTodoUpdate(cb)        // plan/task updates
electronAPI.onToolActivity(cb)      // tool call events
```

### Sessions
```js
electronAPI.sessions.loadMeta()
electronAPI.sessions.saveMeta(meta)
electronAPI.sessions.loadMsgs(sessionId)
electronAPI.sessions.saveMsgs(sessionId, messages)
electronAPI.sessions.deleteMsgs(sessionId)
```

### Files
```js
electronAPI.files.root()              // app root path
electronAPI.files.list(dirPath)       // directory listing
electronAPI.files.read(filePath)      // file content
electronAPI.files.write(filePath, content)
electronAPI.files.mkdir(dirPath)
electronAPI.files.exists(filePath)
electronAPI.files.openInExplorer(filePath)
electronAPI.files.pickFolder()        // system folder picker
electronAPI.files.onChanged(cb)       // watch for changes
```

### Git
```js
electronAPI.git.status(cwd)
electronAPI.git.log({ cwd, n })
electronAPI.git.diffStat({ cwd })
electronAPI.git.remote(cwd)
electronAPI.git.action(action, cwd, args) // 'commit' | 'checkout' | etc.
```

### Screenshots
```js
electronAPI.screenshots.list()
electronAPI.screenshots.save(dataUrl, name)
electronAPI.screenshots.delete(id) / deleteAll()
electronAPI.screenshots.capture()          // window
electronAPI.screenshots.captureFullscreen()
electronAPI.screenshots.captureRegion()    // overlay region picker
electronAPI.screenshots.fromClipboard()
electronAPI.screenshots.copyToClipboard(dataUrl)
electronAPI.screenshots.openFile(id)
```

### Terminal
```js
const { termId } = await electronAPI.terminal.create({})
electronAPI.terminal.input(termId, data)
electronAPI.terminal.resize(termId, cols, rows)
electronAPI.terminal.close(termId)
electronAPI.terminal.onData(termId, cb)   // PTY output
electronAPI.terminal.onExit(termId, cb)   // exit code
```

### Notes
```js
electronAPI.notes.list()
electronAPI.notes.read(id)
electronAPI.notes.write(id, content)
electronAPI.notes.create(title)
electronAPI.notes.delete(id)
```

### Codeblocks
```js
electronAPI.codeblocks.save(name, html, lang, source)  // → { id }
electronAPI.codeblocks.load(id)
electronAPI.codeblocks.update(id, html, lang, source)
electronAPI.codeblocks.list()
electronAPI.codeblocks.saveSrc(filename, lang, source)
```

### MCP
```js
electronAPI.mcp.list()
electronAPI.mcp.add(name, config, scope)    // scope: 'user' | 'project'
electronAPI.mcp.remove(name, scope)
electronAPI.mcp.update(name, config, scope)
```

### Memory & Knowledge Base
```js
electronAPI.memory.list() / read(id) / write(id, content) / delete(id) / loadAll()
electronAPI.kb.list() / read(id) / write(id, content) / createSkill(name) / deleteSkill(id)
```

### Agents
```js
electronAPI.agents.save(agentList)  // [{ name, description, color, model }]
electronAPI.agents.loadAll()        // → agentList
```

### Project
```js
electronAPI.project.setCwd(path)    // set active project directory
electronAPI.project.getCwd()        // → path string
```

### Notifications
```js
electronAPI.notify(title, body)     // native desktop notification
```

---

## 12. CLI Invocation Details

CCM drives `claude.cmd` / `claude` as a subprocess with:

```
claude --output-format stream-json --verbose --model <model> [--effort <level>]
       [--resume <cliSessionId>] [--system-prompt <sys>] [-p <prompt>]
       [--dangerously-skip-permissions] [--auto-approve-everything]
       [--from-pr <url>] [--add-dir <path>] [--max-budget <usd>]
```

**Stdin-JSON mode** (triggered when: images attached OR Windows + system prompt > 500 chars):
```
claude --input-format stream-json --output-format stream-json --verbose
       --model <model> [--effort <level>] [--resume <cliSessionId>]
```
Stdin receives: `{"type":"system","system":"..."}` then `{"type":"user","message":{...}}`

**Direct API mode** (`directMode: true`): skips CLI entirely, uses Anthropic SDK with full message history.

---

## 13. Localization

App supports 11 languages. Switch via `/config` → Language.

Supported: `en-US`, `fr-FR`, `de-DE`, `hi-IN`, `id-ID`, `it-IT`, `ja-JP`, `ko-KR`, `pt-BR`, `es-419`, `es-ES`

Translated strings use `t(key)` throughout. Panel labels, button text, and system prompts all adapt to selected language.

---

## 14. Attachment Options (Composer)

| Option | Trigger | What it inserts |
|--------|---------|----------------|
| From computer | `⇧ Ctrl U` | Images as base64 vision content |
| Add files | `⇧ Ctrl O` | File content as markdown code blocks |
| Paste image | `⇧ Ctrl V` | Clipboard image |
| From GitHub | — | PR / issue / file content |
| Add context | `@` | Context mention |
| MCP tool | `/` | MCP tool invocation |

---

## 15. Agents System

Custom agent personas attached to sessions:
- Each agent: `{ name, description, color, model }`
- Active agent shown in context strip pill (`#agent-pill`)
- Agents auto-inject their description as system context
- Managed in the `/agents` panel or sidebar agent dropdown

---

## 16. Plan Panel

Parses plan blocks from assistant messages. Syntax:

```
[x] Completed task
[~] In-progress task
[ ] Pending task
```

- Auto-populated at stream end via `parsePlanBlock()`
- Also rescans `window.__chatHistory` when tab is opened if `window.__planTodos` is null
- Tasks show with checkboxes; state tracked in `window.__planTodos`

---

## 17. Key DOM IDs (for direct manipulation)

| ID | Element |
|----|---------|
| `#main-dock` | Dockview workspace container |
| `#sidebar` | Left sidebar |
| `#secondary-sidebar-strip` | Secondary window left strip |
| `#titlebar` | Custom title bar |
| `#screen-number-chip` | "1" / "2" screen indicator |
| `#tb-spawn-secondary` | Spawn secondary window button |
| `#btn-make-primary` | Make this window primary |
| `#btn-close-secondary` | Close secondary window |
| `#chat-scroll` | Chat messages scroll container |
| `#composer-input` | Main message input textarea |
| `#model-chip` | Model + effort chip button |
| `#apercu-iframe` | Preview panel iframe |
| `#apercu-vp-wrap` | Preview panel wrapper (ResizeObserver target) |
| `#apercu-reload` | Reload preview button |
| `#apercu-fullscreen` | Open preview in modal button |
| `#right-panel-body` | Active tool panel body |
| `#dock-ctx-menu` | Workspace right-click context menu |
| `#xwin-drop-overlay` | Cross-window panel drag overlay |
| `#dock-drop-overlay` | Session drag-to-panel overlay |

---

## 18. Quick-Reference: Common Agent Tasks

**Send a chat message programmatically:**
```js
// Not directly callable from renderer — use the composer or IPC from main process
await window.electronAPI.sendMessage(messages, 'claude-sonnet-4-6', systemPrompt, sessionId, 'bypass', { effort: 'tres-eleve' });
```

**Open a specific panel:**
```js
window.Workspace.activatePanel('git');       // git panel
window.Workspace.activatePanel('fichiers');  // files panel
window.Workspace.activatePanel('apercu');    // preview panel
```

**Create a canvas artifact:**
```js
window.Workspace.pinArtifact('My App', htmlString, 'allow-scripts', 'html', sourceCode);
```

**Open terminal with Claude:**
```js
window.Workspace.openTerminal(true); // launches `claude` in terminal automatically
```

**Get session history:**
```js
const history = window.__chatHistory; // [{role: 'user'|'assistant', content: string}]
```

**Check plan state:**
```js
const todos = window.__planTodos; // [{text, state: 'done'|'in-progress'|'pending'}] or null
```

**Spawn secondary window:**
```js
await window.electronAPI.spawnSecondary();
```

**Save a note:**
```js
const { id } = await window.electronAPI.notes.create('My Note');
await window.electronAPI.notes.write(id, '# Content here');
```

**Capture screenshot:**
```js
const result = await window.electronAPI.screenshots.captureRegion();
// result: { ok, dataUrl }
```

---

## 19. File Locations (Windows)

| Path | Contents |
|------|----------|
| `./` | App root |
| `./electron/` | Main process, preload, service |
| `./skills/` | KB skill files |
| `./screenshot/` | Captured screenshots |
| `./codeblocks/` | Canvas artifact HTML files |
| `%APPDATA%\claude-code-mods\` | Electron userData (sessions, notes, agents) |
| `%APPDATA%\npm\claude.cmd` | Claude Code CLI binary (Windows) |
| `~/.claude/` | Claude CLI config, projects, memory |

---

*Generated 2026-05-19 · CCM v0.2.0 · Skill version 1.0*
