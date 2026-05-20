# Kanban / Task Board

Claude Code Mods ships a per-project task board. The same `kanban.json` is shared by **three surfaces**:

| Surface | How to access |
|---------|---------------|
| **UI panel** | Tasks panel in the dockview (left side default, or right-panel) |
| **Terminal** | `kanban` CLI tool (see below) — usable from any shell, including the embedded terminal |
| **AI chat** | "Inject into chat" button on the panel, or just read `kanban.json` directly |

---

## Storage

- File: `kanban.json` in the active project's root directory.
- Fallback: `<userData>/kanban.json` if no project is set.
- The CLI searches upward from `cwd` for an existing `kanban.json` (up to 6 levels).
- Schema is shared with the Electron app — both edit the same file.

### Schema

```json
{
  "version": 1,
  "updated": 1700000000,
  "columns": [
    { "id": "todo",  "name": "To do",       "color": "#6e88c3" },
    { "id": "doing", "name": "In progress", "color": "#d97757" },
    { "id": "done",  "name": "Done",        "color": "#7ab389" }
  ],
  "tasks": [
    {
      "id": "k-abc123",
      "col": "todo",
      "title": "Refactor app.js",
      "body": "Split into ES modules — see plan.",
      "tags": ["refactor"],
      "priority": "high",
      "created": 1700000000,
      "updated": 1700000000,
      "order": 0
    }
  ]
}
```

---

## CLI usage

Available as `<ccm-root>/bin/kanban` (Unix) or `<ccm-root>/bin/kanban.cmd` (Windows). The simplest way to invoke from any project terminal:

```bash
node /path/to/full_install/bin/kanban.mjs <command>

# Or add the bin directory to PATH:
export PATH="$PATH:/path/to/full_install/bin"
kanban list
```

### Commands

| Command | Description |
|---------|-------------|
| `kanban list` | Show the full board (also default if no args) |
| `kanban add "Title" [--col=todo] [--pri=high] [--body=...] [--tags=a,b]` | Add a new task |
| `kanban move <id> <col>` | Move a task to another column |
| `kanban done <id>` | Shorthand: move task to `done` |
| `kanban edit <id> [--title=...] [--body=...] [--pri=med] [--tags=a,b]` | Edit fields |
| `kanban rm <id>` | Delete a task |
| `kanban clear-done` | Remove every completed task |
| `kanban path` | Print the resolved `kanban.json` absolute path |
| `kanban summary` | Print a markdown summary (perfect for piping into chat) |
| `kanban json` | Dump raw JSON (for scripting) |
| `kanban help` | Show usage |

### Task IDs

You can pass either the full ID (`k-mfa3b2c1-7x9q`) or just the last 6 chars (`7x9q`). The CLI matches by `endsWith()`.

### Columns

Default columns: `todo`, `doing`, `done`. You can rename or recolor them by editing `kanban.json` directly — both the CLI and UI re-read it on every command.

### Priority

`high` / `med` / `low`. CLI shows them as colored dots, the UI shows them as colored badges. Default: `med`.

---

## Examples

```bash
# Start a new task
kanban add "Fix race in workspace.js loader" --pri=high --tags=bug,workspace

# See where you stand
kanban list

# Move forward
kanban move 7x9q doing

# Mark done
kanban done 7x9q

# Pipe a summary into Claude
kanban summary | pbcopy        # macOS
kanban summary | clip          # Windows
```

---

## AI agent instructions

If the user asks "what's on my kanban" or "add X to the kanban":

1. **Read state**: run `kanban list` or `kanban summary` in a shell, OR read `kanban.json` directly via the Read tool.
2. **Add a task**: run `kanban add "<title>" [--pri=high] [--tags=...]`. If you don't have shell access, you can edit `kanban.json` and append to `tasks`.
3. **Mark done**: run `kanban done <id-suffix>` once the work is verified complete.
4. **Multi-step refactors**: add one task per step before starting, set them to `doing` as you work, `done` when verified.

The schema is stable. If you write `kanban.json` directly, include all required fields (`id`, `col`, `title`, `created`, `updated`, `order`) — the UI re-sanitizes on next save.

If the user says "show me the kanban in chat", they want a markdown rendering. Use `kanban summary` output or generate a markdown table from the JSON.

---

## Renderer API

When running inside the Electron app (renderer), the kanban is also reachable via the preload bridge:

```js
window.electronAPI.kanban.read()                  // → full board
window.electronAPI.kanban.add({ title, col, ... }) // → { ok, task }
window.electronAPI.kanban.update(id, patch)
window.electronAPI.kanban.move(id, col, order)
window.electronAPI.kanban.delete(id)
window.electronAPI.kanban.summary()               // → markdown string
window.electronAPI.kanban.path()                  // → absolute file path
window.electronAPI.kanban.onChanged(cb)           // → broadcast when file changes
```

All renderer writes broadcast `kanban:changed` to every window, so split chats and secondary windows stay in sync.
