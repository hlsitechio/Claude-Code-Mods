# Browser Operator (MCP)

CCM exposes its embedded Chromium browser as an **MCP server** so any
MCP-aware Claude (Claude Code CLI in particular) can drive it. Same tools
work in CLI mode as in Direct API mode.

## How it works

```
Claude Code CLI ──spawns per session──► bin/browser-mcp.mjs
                                                │
                                                │ HTTP localhost
                                                ▼
                              CCM Electron app — global.ccmBrowser
                                                │
                                                ▼
                                       WebContentsView (real Chrome tab)
```

The MCP server is auto-registered in `~/.claude/settings.json` on every
CCM launch under `mcpServers.ccm-browser`. The HTTP control server runs
on a random localhost port; endpoint URL + bearer token are written to
`~/.claude/ccm-browser-endpoint.json` (mode 0600).

If CCM isn't running, every tool call returns:

> Claude Code Mods is not running. Launch the CCM desktop app, open the
> Browser panel, then retry.

So Claude knows immediately to ask the user to launch the app.

## Tools

| Tool | What it does |
|------|--------------|
| `browser_get_state`    | Current URL / title / loading flag |
| `browser_navigate`     | Load URL, wait for `did-finish-load`, return final URL+title |
| `browser_read_page`    | Cleaned innerText of the body (scripts/styles stripped, truncated) |
| `browser_get_elements` | Visible clickable / fillable elements with index, selector, text, position |
| `browser_click`        | Click by index (from get_elements), CSS selector, or visible text |
| `browser_type`         | Set input value + dispatch input/change; optional form submit |
| `browser_screenshot`   | Capture page as JPEG, returned as MCP image (Claude SEES it) |
| `browser_scroll`       | Scroll up/down by amount |
| `browser_nav`          | back / forward / reload |

Schemas exactly mirror the Direct-mode SDK tools — same names, same arguments,
same behavior. Switching between CLI and Direct mode is transparent.

## Usage examples

```text
User: "What's on the page I have open?"
Claude (CLI, picks ccm-browser MCP automatically):
  → browser_get_state           { url: "...", title: "..." }
  → browser_read_page           { text: "..." }
  → "You have <title> open showing <summary>"

User: "Click the login button"
Claude:
  → browser_get_elements        { elements: [{i:0, text:"Login", ...}, ...] }
  → browser_click { index: 0 }
  → browser_get_state          { url: "...login.html" }
  → "Clicked Login. New URL is ..."

User: "Take a screenshot and tell me if the spacing looks right"
Claude:
  → browser_screenshot          (returned as MCP image — Claude sees pixels)
  → "Looking at the page, the spacing between the cards is..."
```

## When to use this vs WebFetch

| Need | Tool |
|------|------|
| Read static public web page | `WebFetch` (faster, no setup) |
| Read page the user is INTERACTING with (logged in, dynamic state) | `browser_read_page` |
| Visual layout / icon recognition / screenshot debugging | `browser_screenshot` |
| Click / fill / submit forms | `browser_click` / `browser_type` |
| Multi-step flows (search → click result → read) | The browser tools |

## Security

- HTTP server binds 127.0.0.1 only — no remote access ever.
- Auth: bearer token rotated on every CCM launch.
- Endpoint file is mode 0600 (owner-only read).
- All URLs go through `_safeBrowseUrl` — `javascript:` / `data:` / `file:`
  schemes are refused.
- Embedded sites have ZERO access to the app's IPC / Node / electronAPI.

## Troubleshooting

**MCP tools don't appear in `ToolSearch`**
- Restart Claude Code CLI — MCP registration is read at startup.
- Check `~/.claude/settings.json` contains `mcpServers.ccm-browser`.
- Verify `~/.claude/ccm-browser-endpoint.json` exists when CCM is running.

**`Cannot reach Claude Code Mods (connection refused)`**
- CCM Electron app isn't running. Launch it.

**`No browser tab is open`**
- Open the Browser panel in CCM (right-click dock → Add panel → Browser).
- The panel auto-opens a DuckDuckGo starter tab.
