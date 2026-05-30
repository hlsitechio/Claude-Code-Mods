# Contributing

PRs welcome. This is a fast-moving personal project, so a few ground rules keep things sane.

## Before you start

- Open an issue first for anything bigger than a small fix or polish. I'd rather sketch the architecture with you up front than ask you to redo something at PR time.
- For security issues, see [SECURITY.md](SECURITY.md) — please don't open public issues for them.

## Development setup

```bash
git clone https://github.com/hlsitechio/Claude-Code-Mods.git
cd Claude-Code-Mods
npm install
npm run electron:dev
```

Requirements:
- Node.js 20+ (Vite 8 requires Node 20.19+/22.12+)
- A working Claude Code CLI in your `PATH` (`claude --version` should respond)

## Code style — what to keep in mind

- **`app.js` + `style.css` are the renderer.** Vanilla JS, no framework, no build step for the renderer. Don't introduce React/Vue/Svelte to a single panel.
- **Every IPC channel needs three files updated together**: handler in `electron/main.js`, surface in `electron/preload.js`, call site in `app.js`. Drift between these is the #1 source of "nothing happens when I click."
- **MCP tool changes touch three files**: function in `electron/chrome-controller.js`, HTTP route in `electron/browser-http-server.js`, schema + dispatch in `bin/browser-mcp.mjs`. Same drift risk.
- **Skills are markdown.** New skills go in `skills/` and are loaded via `CLAUDE.md` — keep them under ~5KB each.
- **No `console.log` in shipped code.** Use the existing `[ccm-*]` prefixed loggers or remove before commit.

## Commit style

Loosely conventional:

```
feat(ccm-browser): chrome_split_swap MCP tool
fix(security): _pageById filters non-browseable targets
refactor(controller): extract _resolvePanesByUrl helper
docs(README): add Phase 18 sidebar tracker section
```

Phase numbers (`Phase 17 — targetId everywhere`) are great in commit bodies but optional in titles. Verbose commit bodies welcome — explain *why*, not what (the diff already shows what).

## Testing

There's no automated test suite right now. Manual smoke test before PR:

```bash
npm run lint      # syntax-checks every JS/MJS file
npm run electron:dev
```

Once the app boots:
- Open the Browser panel
- Try the split-toggle + the swap button
- Open a terminal and run `claude` — verify the CLI session shows up in the sidebar's "CLI" section
- If your change touched MCP tools, restart CCM and run `/mcp` from a Claude CLI session to confirm tool count and that new tools register

## Areas that need help

- macOS builds (currently Windows + Linux only)
- Automated test harness — even smoke tests for the IPC layer would be valuable
- More skills (`skills/*.md`)
- More MCP tools wrapping `chrome.*` extension APIs that CDP can't reach

## What I'll probably push back on

- Adding a framework to the renderer
- Adding a "marketplace" or "auto-installer" that touches the user's system without explicit consent
- Anything that broadens the MCP HTTP server's attack surface beyond `127.0.0.1` + bearer-auth

## License

By contributing, you agree your contributions are licensed under the project's [MIT License](LICENSE).
