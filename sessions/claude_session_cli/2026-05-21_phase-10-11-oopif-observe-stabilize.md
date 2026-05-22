# Session: Phase 10/11/11.5 — OOPIFs, semantic observe, auto-stabilize
**Date:** 2026-05-21
**Branch:** main (4 commits ahead of origin)
**Outcome:** Three major ccm-browser MCP phases shipped in one session.

## TL;DR for the next-me

We built the foundation of an **AI-native browser driver** that obsoletes
Playwright for LLM-driven use cases. Three commits tonight:

| SHA | Phase | What |
|---|---|---|
| `6d029d3` | 10 | OOPIF cross-origin iframe access (6 tools) |
| `2356ab5` | 11 | Semantic observation + ref-based actions (5 tools) |
| `a368f05` | 11.5 | Auto-stabilize + bundled observe_delta |
| `dc8493a` | — | Opt-in stabilize for legacy actions (consistency) |

## The thesis

**Playwright is a test framework retrofitted for AI. We're building AI-native.**

Playwright assumes you know selectors in advance, want a throwaway browser,
and will sprinkle `waitForX` everywhere. LLM-driven reality is the opposite:
you discover the page each turn, you want the user's real Chrome (cookies,
logins, paired Google Messages), and flakiness from races is the #1
failure mode.

## What's new in the tool surface

### Phase 10 — Cross-origin iframe access
- `chrome_frame_list` — list iframe targets
- `chrome_frame_attach { targetId }` → `sessionId`
- `chrome_frame_detach { sessionId }`
- `chrome_frame_eval / _click / _type` — per-session input
- `chrome_cdp_raw` now honors `sessionId` (was a stub before)

Use for Stripe 3DS popups, reCAPTCHA, embedded Auth0, anything in a
cross-origin iframe.

### Phase 11 — Semantic observation
- `chrome_observe` — returns indented YAML-tree of visible interactive
  elements as `[ref] role "name" = "value" (state)`. Each tagged with
  `data-ccm-ref="N"` in the DOM.
- `chrome_observe_delta` — only appeared/disappeared/changed since last
  observe. 10× cheaper than re-observing.
- `chrome_click_ref / chrome_type_ref / chrome_focus_ref` — act by ref.
  Survives re-renders.

### Phase 11.5 — Auto-stabilize
- `chrome_stabilize` — wait for network idle (500ms) + DOM mutation idle
  (200ms) + readyState. Hooks fetch+XHR+MutationObserver inside the page.
- Ref-based actions auto-stabilize and **bundle observe_delta in the
  response**. One round-trip per intent.
- `chrome_page_navigate` auto-stabilizes by default.
- `chrome_input_click/_type/_key` gain optional `stabilize:true`.

## The new checkout pattern

```
chrome_observe                              → tree of the page
chrome_click_ref { ref: 18 }                → click + wait + delta in one call
chrome_type_ref  { ref: 42, text: "...", submit: true }
```

Three calls. Zero selectors. Zero screenshots. Zero waitFor*.

## What we tested it on (real)

First Benny order placed via Claude tonight:
- Rotisseries Au Coq Benny, $41.28 with Visa ****4824
- Google Messages web is paired in the CCM browser → can read OTPs
- 3DS challenge popup was the friction point — Phase 10 closes that gap

## Phase 12 (continued same day) — `chrome_step`

Shipped the intent resolver. New tool:

- `chrome_step { action, target, role?, value?, submit?, near?, observe?, stabilizeMs? }`
  - `action`: `click | type | focus | select`
  - Runs fresh `observe`, role-filters by action (`click` → button/link/etc, `type` → textbox/searchbox/spinbutton/combobox, `select` → combobox/listbox), fuzzy-scores `target` against accessible names (exact > startsWith > includes > token-overlap), `near` adds +15 to refs whose name contains the disambiguator string, disabled −50.
  - Refuses on ambiguous match (top two within 8 points) → returns `candidates[]` instead of acting.
  - Dispatches to existing `clickRef` / `typeRef` / `focusRef` so auto-stabilize + observe_delta come for free; `select` is implemented inline (matches `<option>` by value OR visible text, fires input+change).
  - One round-trip per intent — no observe-then-act-then-delta dance.

Files touched: `electron/chrome-controller.js` (+~125), `electron/browser-http-server.js` (+1 route), `bin/browser-mcp.mjs` (+schema +dispatch).

The thesis call: this is the "operator" surface. The LLM emits structured intent; the MCP owns resolution. No NL parsing on our side, no LLM call inside the MCP — clean separation.

## What's NOT done yet (next session pickup)

In rough priority order:

1. ~~**`chrome_step` (NL → action)**~~ — ✅ shipped as structured-intent resolver (see Phase 12 section above). Full NL pre-parsing stays LLM-side.
2. **Action recorder / replayer** — capture (observe, action) pairs into
   a script that can be replayed deterministically. Effectively the MCP
   writes its own Playwright tests, except we own the runtime.
3. **`chrome_intercept`** — declarative network mocks (`fulfill /api/foo
   with {json}`). Half-built in `chrome_fetch_*`, needs friendlier surface.
4. **Region-of-interest screenshots** — `chrome_screenshot { ref: 18 }`
   crops to one element. For the rare case where we DO need vision (captcha
   image, visual bug).
5. **Defuddle/Readability integration** — fast read-only content extraction
   for Q&A pages. The skill already exists in the repo.
6. **`chrome_console_subscribe`** + **network errors auto-bundled** in
   observe response — catch errors we don't have to ask for.

## Files touched

- `electron/chrome-controller.js` (+~500 lines)
- `electron/browser-http-server.js` (+~15 lines route dispatch)
- `bin/browser-mcp.mjs` (+~200 lines tool schemas + dispatch)

## Memory state

Persisted to `~/.claude/projects/G--claude-code-mod-full-install/memory/`:
- `user_profile.md` — Hubert, phone, email
- `user_delivery_address.md` — [redacted]
- `reference_google_messages_web.md` — paired, can read OTPs
- `feedback_ordering_flow.md` — 10% tip, online pay, skip extras
- `reference_favorite_food_sites.md` — Benny

## Bootstrap prompt for fresh chat

> We're continuing work on ccm-browser MCP. Read
> `sessions/claude_session_cli/2026-05-21_phase-10-11-oopif-observe-stabilize.md`
> for full context. We just shipped Phases 10/11/11.5. Next priority is
> [pick one from "What's NOT done yet"]. Tools available: `chrome_observe`,
> `chrome_click_ref`, `chrome_type_ref`, `chrome_frame_*`, `chrome_stabilize`,
> + 130+ legacy chrome_* tools. The thesis: kill Playwright for LLM-driven
> browser work.
