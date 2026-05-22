# CCM Browser MCP — Operator Playbook

Session date: 2026-05-20  
Project tested on: **Memorify** (Lovable.dev, project id `ee0c3af4-8db1-460d-afc6-d97e5b336805`)  
Local checkout: `G:\m3morify\m3morify\Memorify`

## TL;DR — what we proved today

We piloted the Lovable.dev web IDE end-to-end **without spending a single Lovable AI token**:

1. Logged in via Google OAuth (Chrome profile remembered the session)
2. Opened a project, used the sidebar **Search code** to locate strings
3. Edited code in CodeMirror 6 via real keystrokes
4. Clicked **Save** and verified the change committed
5. Built a React **element-to-source picker** in the live preview that walked the React fiber's `_debugSource` to return `file:line` for any clicked element
6. Did multi-file edits (`src/index.css` + `src/pages/Auth.tsx`) for a glassmorphic animated-gradient theme on the auth page

This is enough leverage to replace Lovable AI for surgical edits. The bottleneck was **typing speed in CodeMirror**, not the MCP.

---

## Tool surface

The MCP exposes ~154 tools. Categories I actually used:

| Category | Tools that mattered |
|---|---|
| Lifecycle | `chrome_launch`, `chrome_status`, `chrome_target_list`, `chrome_target_activate_tab`, `chrome_target_close_tab` |
| Navigation | `chrome_page_navigate` |
| DOM / JS | `chrome_runtime_eval`, `chrome_dom_query` |
| Input | `chrome_input_click`, `chrome_input_key`, `chrome_input_type` |
| Raw CDP | `chrome_cdp_raw` (huge — see Input.insertText below) |
| Visual | `browser_screenshot` (worked sometimes, errored often) |

The `browser_*` tools are an **Electron webContents shim**. They only work on tabs Electron owns. For tabs reached via CDP attach (the common case), use the `chrome_*` family. `browser_click`, `browser_screenshot`, `browser_get_state` all errored on attached tabs.

---

## Gotchas & hard-earned lessons

### 1. Two browser panels = the MCP picks ONE
CCM's dockview can host multiple `<webview>` Browser panels. The MCP attaches to one of them (CDP at `127.0.0.1:9222`) and **does not switch automatically when you click another panel**. Symptom: `chrome_runtime_eval` returns data from the wrong tab even after `chrome_target_activate_tab`.

**Fix:** navigate the attached tab to where you need to work, even if it means losing the visible split. The MCP follows the tab it's attached to.

### 2. `chrome_status` filters out the CCM app UI
The status page list excludes `localhost:5182/` (the CCM app itself) — but they show up in `chrome_target_list`. Don't be surprised by missing tabs.

### 3. OAuth callback tabs poison CDP
After a Google login, residual `oauth.lovable.app/callback?...` tabs hijack CDP's "active" pointer. Close them explicitly with `chrome_target_close_tab` before further work.

### 4. CodeMirror 6 ignores synthetic `KeyboardEvent`
`element.dispatchEvent(new KeyboardEvent(...))` from `chrome_runtime_eval` does **nothing** to CM6 because CM6 listens at the document level with its own input handling. You MUST use real CDP key events via `chrome_input_key`.

### 5. CodeMirror auto-pairs braces — `Input.insertText` bypasses it
Typing `{` via `chrome_input_type` triggers CM's auto-`}` insertion → text gets corrupted. **Use `chrome_cdp_raw` with method `Input.insertText`** for raw text insertion. It dumps text directly into the DOM input without firing the key-handler pipeline. This was the single biggest unlock today:

```json
{
  "method": "Input.insertText",
  "params": { "text": "\n@keyframes gradient-shift {\n  ...\n}\n" }
}
```

Multi-line content with `{` `}` survives intact.

### 6. `chrome_runtime_eval` is the workhorse — but mind focus
`document.activeElement` drifts. After clicking the Save button, focus moves to that button and subsequent `chrome_input_key` calls operate on it (not the editor). **Always re-click the editor and verify `document.activeElement?.className === 'cm-content'` before key sequences.**

### 7. `Ctrl+Backspace` only deletes to word boundary — and `-` is a word boundary
`glass-animated` → Ctrl+Backspace removes only `animated` (hyphen splits the word). Plan deletions in word-sized chunks or fall back to single-char Backspace.

### 8. Search-code input value mutation
You can't programmatically clear the search box with `inp.value = ''` — the React-controlled input needs the native setter:
```js
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
setter.call(inp, '');
inp.dispatchEvent(new Event('input', { bubbles: true }));
```
Sometimes still errors with `Illegal invocation` — just navigate the page to reload it.

### 9. Saving redirects away from `?view=codeEditor`
After clicking Save, Lovable sometimes drops the query param, losing the editor pane. Re-navigate to `?view=codeEditor` and wait ~3s before the search input reappears.

### 10. Browser screenshot tool is flaky
`browser_screenshot` errors with a Zod union schema error on attached tabs. `chrome_page_screenshot` has the same issue. Workaround: ask the user to drop a screenshot in their downloads folder and read it with the local `Read` tool.

### 11. iframe targets need separate attach
The Lovable preview iframe (`*.lovableproject.com`) is a distinct CDP target with its own `targetId`. `Target.attachToTarget` returns a `sessionId` but the MCP's `chrome_runtime_eval` doesn't expose a `sessionId` param — so you can't easily run code in the iframe context. **Workaround:** navigate the main tab directly to the lovableproject URL (same content, fully accessible).

---

## Working patterns (verified)

### Pattern A — find a string in code and open the file
```
1. chrome_input_type → search box
2. chrome_runtime_eval → enumerate result buttons with bounding rect
3. chrome_input_click x,y of the result
4. chrome_runtime_eval → grab .cm-line content to verify
```

### Pattern B — surgical edit (small N chars)
```
1. Click the visible portion of the target line
2. chrome_input_key End
3. chrome_input_key ArrowLeft × N to position cursor
4. chrome_input_key Backspace × K to delete
5. Type replacement OR Input.insertText (preferred for multiline / braces)
```

### Pattern C — append multi-line text (e.g. CSS class)
```
1. Click anywhere in editor
2. chrome_input_key End with modifiers=["Control"]  (Ctrl+End → jump to EOF)
3. chrome_cdp_raw Input.insertText { text: "\n...\n" }
4. Verify with chrome_runtime_eval reading last cm-line
5. Click Save button
```

### Pattern D — element-to-source picker (kills "Visual Edits")
Inject an overlay that listens for mousemove + click. On click, walk the React fiber chain via `__reactFiber$*` property; each fiber may have `_debugSource = { fileName, lineNumber, columnNumber }`. The closest ancestor with debugSource is the source. Optionally walk up to build a component chain. Vite dev mode adds these automatically via `@babel/plugin-transform-react-jsx-source`.

Key snippet:
```js
const findFiber = el => {
  const k = Object.keys(el).find(k => k.startsWith('__reactFiber$'));
  return k ? el[k] : null;
};
const findSource = fiber => {
  let f = fiber, d = 0;
  while (f && d < 30) {
    if (f._debugSource) {
      const t = typeof f.type === 'string' ? f.type : (f.type?.displayName || f.type?.name || '?');
      return { ...f._debugSource, componentType: t };
    }
    f = f.return; d++;
  }
  return null;
};
```

### Pattern E — verify saved without screenshot
After clicking Save, check the button:
- Disappeared → saved (some apps remove it)
- Visible but `disabled=true` → saved (Lovable's pattern)
- Visible and `disabled=false` → click didn't land, retry

---

## What we built in Memorify today

### Edit 1 — `Auth.tsx:108`
Removed the trailing period from `"The memory layer for AI agents."` → `"The memory layer for AI agents"`. **Proof of concept that we control the editor.**

### Edit 2 — global theme color
Changed `src/index.css:17` `--primary: 174 85% 55%` (turquoise) → `222 70% 35%` (dark blue). **Demonstrated single-line replacement with End → Backspace×N → type.**

### Edit 3 — glassmorphic animated gradient
- `src/index.css` — appended `@keyframes gradient-shift` + `.glass-animated` class (radial gradient, 14s loop, 24px backdrop-blur, saturate(160%), inner border, shadow)
- `src/pages/Auth.tsx:124` — added `glass-animated` to the right-side `<section>`
- Also (initially) `Auth.tsx:125` — applied to the inner card; **user requested revert** so the card stays as the original solid panel and only the section background animates

Status at session pause: revert of line 125 in progress — got down to `"... space-y-6 \"` (one trailing space left to delete). Next step is to delete that space and confirm the file matches the local checkout exactly except for ` glass-animated` on line 124.

---

## Tool tips worth promoting

1. **Always prefer `chrome_cdp_raw + Input.insertText`** over `chrome_input_type` when inserting code containing `{`, `}`, `(`, `)`, `[`, `]`, `"`, `'` — anything an IDE auto-pairs.
2. **`Page.getFrameTree` + `Target.attachToTarget`** would let us drive the preview iframe directly, but the MCP needs a `sessionId` param on `chrome_runtime_eval` to fully exploit it. Worth a feature request.
3. **`chrome_runtime_eval` is async-wrapped** — you can `await fetch(...)`, `await new Promise(r=>setTimeout(r, n))` for waits.
4. **CodeMirror's view object is NOT on `cm-editor.cmView`** in Lovable's bundle. If you want direct `EditorView.dispatch` access, you'd need to find a Vite source map or hook React DevTools — not yet figured out.

---

## Skills to enhance next session

- A helper that does "find by string, position cursor at offset, replace N chars" as one atomic op — wrap the End/ArrowLeft/Backspace dance.
- An "open file at line N" primitive — search for a unique substring on that line, click result, verify cm-line matches.
- A wrapper that survives Save-induced URL changes (auto-renavigates to `?view=codeEditor`).
- A persistent picker that opens the captured file at the captured line in the editor tab automatically.
- A `multi_file_edit` primitive that takes `[{file, find, replace}]` and runs them sequentially.

Add these to the next iteration of the MCP and Lovable becomes a fully-piloted code editor with zero AI calls.

---

## Session 2 — 2026-05-20 (afternoon) — **CCM Browser MCP + Lovable MCP combo**

### What changed

The official **Lovable MCP** is now connected alongside CCM Browser MCP. We tested the combo on the same Memorify project to finish the Auth panel revert from Session 1.

### Result

**One edit, two MCPs, zero Lovable AI tokens, zero cm-line scraping for verification.**

`src/pages/Auth.tsx:125`
```diff
- <div className="w-full max-w-sm space-y-6 glass-animated rounded-2xl p-8">
+ <div className="w-full max-w-sm space-y-6 bg-background rounded-2xl p-8 border border-border">
```

Commit: `e580a36` → `4b83b18`. The `<section>` keeps its `glass-animated` gradient background; the inner panel is now solid black with a hairline border.

### The pipeline (this is the new canonical flow)

```
1. Lovable MCP  → get_project           (find current commit SHA)
2. Lovable MCP  → read_file             (pull ground-truth source — no scrolling, no scraping)
3. Browser MCP  → search-code → click   (open file in CM6 editor)
4. Browser MCP  → click cm-line + verify activeElement === 'cm-content'
5. Browser MCP  → Home → Shift+End      (select whole line content)
6. Browser MCP  → cdp_raw Input.insertText  (replace selection atomically)
7. Browser MCP  → click Save button
8. Lovable MCP  → get_project           (confirm new commit SHA)
9. Lovable MCP  → get_diff              (unified-diff receipt)
```

**Browser MCP = hands. Lovable MCP = eyes + receipt.** The browser MCP is no longer doing verification — that's a Lovable API call now, ground truth, no ambiguity.

### What was hard (real friction this session)

1. **Viewport coordinate trap.** `.cm-content` rect reported `width: 1150`, but `innerWidth` was only `1232` — the editor overflows past the visible viewport (horizontal split). Clicking the geometric center of the target line landed at `x=1294`, off-screen, dead click. Always clamp click coords to `min(rect.x + rect.width/2, innerWidth - margin)`.

2. **Focus drifts off the editor after every UI touch.** After clicking the search result button, `activeElement` was the button, not `.cm-content`. Same problem as the Save button bug from Session 1. Need a `cm_focus()` primitive that clicks and verifies in one shot.

3. **`chrome_runtime_eval` can't take statement blocks.** It wraps the expression in `(async () => (EXPR))()` — a single expression slot. Writing `await x; ({...})` errors with "Unexpected token ';'". Have to rewrite as IIFE every time. Either a `chrome_runtime_run` for statement blocks, or detect-and-wrap heuristic.

4. **Two identical tabs in `chrome_target_list`.** Both said `Memorify - Lovable` at the same URL. Activated one blindly — got lucky. Need `lastActivated` timestamps or an "is-attached-target" marker so we know which one the MCP is driving.

5. **No direct "open file at line N" primitive.** Had to search-code for a unique substring on line 125. Works, but search relies on substring uniqueness. Lovable's editor likely accepts `?file=…&line=…` query params — untested, worth probing.

### What worked beautifully

- **`Home → Shift+End → Input.insertText`** as the canonical one-line replacement pattern. ~10× faster than `End → ArrowLeft×N → Backspace×K` from Session 1. **Promote this to the default recipe.**
- **`read_file` + `get_diff` as verification.** Replaces all the cm-line scraping AND screenshot-the-preview proofs. Two API calls = ground truth + visual receipt.
- **No `send_message` calls.** Did not touch Lovable chat once. The MCP's read-only tools are enough to drive surgical edits.

### Enhancements to ship (prioritized)

| ✅ shipped (Phase 8) | `chrome_cm_replace_line(line, content, save)` — focus → goto → Home → Shift+End → Input.insertText → Ctrl+S in one call. |
| ✅ shipped (Phase 8) | `chrome_cm_focus()` — clicks `.cm-content` visible center, verifies `activeElement.closest('.cm-editor')`. |
| ✅ shipped (Phase 8) | `chrome_runtime_run({code})` — statement-block sibling of `chrome_runtime_eval` (wraps in `(async () => { CODE })()`). |
| ✅ shipped (Phase 8) | `chrome_dom_click(selector)` — auto-scrollIntoView + visible-rect-clamped click; fixes the "clicked dead air outside viewport" trap. |
| ✅ shipped (Phase 9) | `chrome_cm_edit_atomic({edits, save, ensureEditor})` — multi-file batch built on cm_replace_line. Each edit `{line, content, file?}`. File switching auto-saves the previous file + calls open_at_line. |
| ✅ shipped (Phase 9) | `chrome_cm_open_at_line({file, line})` — URL-param-based open (`?view=codeEditor&file=…&line=…`) + waitForSelector + safety-net cm_goto_line. |
| ✅ shipped (Phase 9) | `chrome_cm_ensure_editor()` — re-navigates with `?view=codeEditor` if .cm-content went missing after Save. Idempotent. |
| ✅ shipped (Phase 9) | `chrome_target_list` enriched with `lastActivated` ms timestamps + `attached: true` marker on the tab the MCP is currently driving. Sorted attached-first, then most-recent. |
| ✅ shipped (Phase 9) | `chrome_picker_install` / `chrome_picker_capture` / `chrome_picker_cancel` — codifies `element_to_source_picker.js` as MCP tools. Install → user clicks an element → capture returns `{tag, text, source: {fileName, lineNumber, componentType}, chain}`. |
| 🟨 still nice  | `lovable_diff_since(project, file, baseRef)` — narrow `get_diff` to a specific file, useful for surgical-edit leak detection. **(Belongs in the Lovable MCP itself — out of scope for CCM Browser MCP.)** |

### Phase 9 — the killer pipeline becomes literal

With Phase 9 the "Picker → read_file → propose edit → cm_replace_line → get_diff confirm" loop from Session 2 collapses to **3 MCP calls** for a single-file edit:

```
1. (Lovable MCP)  read_file               → ground-truth source
2. (Browser MCP)  chrome_cm_edit_atomic   → apply edits + auto-save
3. (Lovable MCP)  get_diff                → receipt
```

And for multi-file edits, still 3 calls — `cm_edit_atomic` handles file switching internally via `cm_open_at_line` and per-file Ctrl+S batching.

For the picker-driven flow (clicking an element in the preview to identify what to edit):

```
1. (Browser MCP)  chrome_picker_install      → arms the overlay
2. (Browser MCP)  chrome_picker_capture      → returns file:line of clicked element
3. (Lovable MCP)  read_file                  → ground-truth source
4. (Browser MCP)  chrome_cm_edit_atomic      → apply edits
5. (Lovable MCP)  get_diff                   → receipt
```

### The meta-insight

**Session 1**: CCM Browser MCP did 100% of the work (hands + eyes + verification). Slow, fragile, but proved feasibility.

**Session 2**: Browser MCP is now the *least* important tool in the loop — it only executes keystrokes. The picker (`_debugSource` fiber walk) gives `file:line`, Lovable MCP gives source + receipt, Browser MCP just types. If Lovable ever exposes a `write_file` tool, the browser MCP becomes optional for surgical edits entirely — only the fiber picker stays irreplaceable.

**The killer pipeline:** Picker → `read_file` → propose edit → `cm_replace_line` → `get_diff` confirm. Zero scrolling, zero guessing, zero AI tokens. This is the productizable workflow.

The rhythm that emerged — **ship → use → flag what hurts → enhance** — is the right one. Today's friction list IS tomorrow's roadmap.

---

## Phase 10 — Multi-slot CCM (2026-05-20, evening)

### The need

Single-user pain: one CCM = one embedded browser = one Claude Code session can drive it. If you want a second Claude session working on a different project (without context-switching), you need a second CCM.

### The design

One Electron process per **slot** (1-indexed, 1–64). Each slot is fully isolated:

| What | Slot 1 (default) | Slot N (N ≥ 2) |
|---|---|---|
| CDP port | `:9222` | `:(9221 + N)` |
| userData dir | `<default>` | `<default>-slot-N` |
| Endpoint file | `~/.claude/ccm-browser-endpoint.json` | `~/.claude/ccm-browser-endpoint-N.json` |
| MCP entry name | `ccm-browser` (no env) | `ccm-browser-N` (env `CCM_BROWSER_SLOT=N`) |
| Window title | `Claude Code Mods` | `Claude Code Mods · Slot N` |
| Single-instance lock | per-slot (scoped to userData) | per-slot (scoped to userData) |

### How to use

1. Launch slot 1 normally (it's the default — nothing changes from before).
2. Launch slot 2 from a separate shell:
   ```
   cd G:\claude_code_mod\full_install
   npm run electron:slot2
   ```
   (Or directly: `electron . --slot=2`. Or env: `CCM_SLOT=2 electron .`.)
3. Slot 2's first boot writes the MCP entry `ccm-browser-2` to `~/.claude.json` automatically. Open a new Claude Code CLI session and the `ccm-browser-2` tools are there.
4. In Claude Session A → `chrome_*` tools drive slot 1's embedded browser (`:9222`).
5. In Claude Session B → `chrome_*` tools driven by the `ccm-browser-2` MCP drive slot 2's embedded browser (`:9223`).

Both sessions can run any of the 165 Phase 1-9 tools against their own slot's browser without ever colliding.

### Edge cases handled

- **Port clash** — if slot N's port is already taken, the CDP server fails to bind and Puppeteer can't connect. Error message points at `--slot=N` + the port.
- **Profile pollution** — each slot's Chromium has fully separate cookies / local storage / extensions, because userData is per-slot.
- **MCP entry collisions** — slot 1 registers `ccm-browser`, slot 2 registers `ccm-browser-2`. They never overwrite each other; both keys coexist in `~/.claude.json`.
- **Endpoint file orphans** — on graceful quit each slot deletes its own `ccm-browser-endpoint-N.json`. On hard kill the stale file remains; the next slot-N boot overwrites it.

### What this unlocks

- Work on two Lovable projects in parallel — slot 1 on project A, slot 2 on project B.
- Pair-coding: slot 1 = "live driver" Claude session, slot 2 = "reviewer" Claude session with a separate browser snapshot.
- A/B test the same change in two browsers (different login states, different feature flags) by editing in slot 1, mirroring in slot 2.
- Isolate sensitive work — slot 2 with a clean profile, no extensions, separate cookie jar — without disturbing your main slot 1 setup.
