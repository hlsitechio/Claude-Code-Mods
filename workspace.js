/**
 * workspace.js — full dockview workspace
 *
 * Phase 2: the entire main area (chat + tools + canvas) lives inside ONE
 * dockview instance mounted on #main-dock.  The sidebar stays outside.
 *
 * Default layout
 * ──────────────
 *   [ chat (left, flex-1) ]  |  [ tool group (right, 440px) ]
 *                                    Preview · Diff · Terminal
 *                                    Files · Tasks · Plan
 *                                    Git · MCP · Context · Shortcuts
 *
 * Canvas panels split below the tool group on first pin, then tab in.
 *
 * Bridge API (window.Workspace)
 * ─────────────────────────────
 *   .activatePanel(id)                 — open / focus a tool panel
 *   .isVisible()                       — always true in new layout
 *   .pinArtifact(title, html, sandbox) — pin a Canvas iframe panel
 */

(function () {
  'use strict';

  const DV = window['dockview-core'];
  if (!DV) {
    console.warn('[workspace] dockview-core not loaded — workspace disabled');
    window.Workspace = { activatePanel() {}, isVisible() { return true; }, pinArtifact() {} };
    return;
  }

  /* ── Workspace persistence ───────────────────────────────────────── */
  const WS_STORE_KEY  = 'ccmod.workspaces';
  const WS_ACTIVE_KEY = 'ccmod.activeWorkspace';
  let _wsList      = [];
  let _wsActiveId  = null;
  let _wsSaveTimer = null;
  // True between a switch/create/delete and the reload it triggers. The
  // beforeunload flush checks this so it doesn't save the CURRENT (old) dv
  // layout into the NEW active workspace after the active id was already
  // re-pointed. Those paths call saveCurrentLayout() explicitly first.
  let _wsSwitching = false;

  function _wsLoadStore() {
    try { _wsList = JSON.parse(localStorage.getItem(WS_STORE_KEY) || '[]'); } catch { _wsList = []; }
    _wsActiveId = localStorage.getItem(WS_ACTIVE_KEY) || null;
    // Bootstrap: ensure at least one workspace exists
    if (!_wsList.length) {
      const id = 'ws-' + Date.now();
      _wsList = [{ id, name: 'Workspace 1', layout: null, updatedAt: null }];
      _wsActiveId = id;
      _wsWriteStore();
    }
    if (!_wsActiveId || !_wsList.find(w => w.id === _wsActiveId)) {
      _wsActiveId = _wsList[0].id;
      localStorage.setItem(WS_ACTIVE_KEY, _wsActiveId);
    }
  }

  function _wsWriteStore() {
    localStorage.setItem(WS_STORE_KEY, JSON.stringify(_wsList));
    localStorage.setItem(WS_ACTIVE_KEY, _wsActiveId);
  }

  function _wsGetActive() {
    return _wsList.find(w => w.id === _wsActiveId) || null;
  }

  // ── Strip non-restorable panels before saving (Phase 23 rewrite) ─────────
  // PTYs can't survive a reload, so terminal panels must be removed from the
  // serialized layout — otherwise they restore as blank fresh terminals (and
  // Claude terminals re-launch `claude` on every start).
  //
  // The OLD version targeted node.data.panels / node.children — fields that
  // DON'T EXIST in dockview's serialization, so it was a silent no-op for
  // years. dockview's real shape (dockview-core SerializedDockview):
  //   layout = { grid: { root, width, height, orientation }, panels: {id:{}}, activeGroup, floatingGroups?, popoutGroups? }
  //   grid node = { type:'leaf'|'branch', data, size?, visible? }
  //     leaf:   data = { views: string[], activeView?, id }
  //     branch: data = node[]   (child nodes)
  function _isEphemeralPanelId(id) {
    // Terminals only. Artifacts persist via artifactHtml; tool panels rebuild
    // from their id; split-chat is left alone (separate concern).
    return typeof id === 'string' && id.startsWith('term-');
  }

  // Recursively prune ephemeral panels from a grid node.
  // Returns the cleaned node, or null if it became empty (caller drops it).
  function _pruneGridNode(node) {
    if (!node || typeof node !== 'object') return node;
    if (node.type === 'leaf') {
      const d = node.data || {};
      const views = Array.isArray(d.views) ? d.views.filter(v => !_isEphemeralPanelId(v)) : [];
      if (!views.length) return null;                          // empty group → drop
      const activeView = views.includes(d.activeView) ? d.activeView : views[views.length - 1];
      return { ...node, data: { ...d, views, activeView } };
    }
    if (node.type === 'branch') {
      const kids = (Array.isArray(node.data) ? node.data : []).map(_pruneGridNode).filter(Boolean);
      if (!kids.length) return null;                           // empty branch → drop
      return { ...node, data: kids };                          // single-child branch is valid in dockview
    }
    return node;
  }

  // Strip ephemeral panels from a full serialized layout (operates on the
  // toJSON() copy, which is fresh — no risk of mutating live dockview state).
  function _stripEphemeralPanels(layout) {
    if (!layout || typeof layout !== 'object') return layout;
    // 1. top-level panel definitions map
    if (layout.panels && typeof layout.panels === 'object') {
      for (const id of Object.keys(layout.panels)) {
        if (_isEphemeralPanelId(id)) delete layout.panels[id];
      }
    }
    // 2. grid tree — dockview REQUIRES the root to be a BRANCH. If pruning
    //    removed everything (all-ephemeral) or reduced the root to a bare leaf,
    //    null the grid so saveCurrentLayout persists no layout and restore
    //    cleanly builds the default — instead of dockview throwing
    //    "root must be of type branch" on fromJSON and losing the layout.
    if (layout.grid && layout.grid.root) {
      const root = _pruneGridNode(layout.grid.root);
      if (root && root.type === 'branch') layout.grid.root = root;
      else layout.grid = null;
    }
    // 3. floating / popout groups that hold ONLY terminals
    for (const k of ['floatingGroups', 'popoutGroups']) {
      if (Array.isArray(layout[k])) {
        layout[k] = layout[k].filter(g => {
          const views = g?.data?.views || g?.views;
          if (!Array.isArray(views)) return true;
          return views.some(v => !_isEphemeralPanelId(v));
        });
      }
    }
    return layout;
  }

  function saveCurrentLayout() {
    if (!dv) return;
    try {
      const layout = dv.toJSON();   // fresh serialized copy — safe to mutate
      _stripEphemeralPanels(layout);
      const ws = _wsGetActive();
      // grid===null means nothing restorable survived the strip — persist null
      // so restore builds the default cleanly (no invalid-layout throw).
      if (ws) { ws.layout = layout.grid ? layout : null; ws.updatedAt = Date.now(); _wsWriteStore(); }
    } catch (e) { console.warn('[workspace] saveCurrentLayout failed:', e); }
  }

  function _wsScheduleSave() {
    if (_wsSaveTimer) clearTimeout(_wsSaveTimer);
    _wsSaveTimer = setTimeout(saveCurrentLayout, 600);
  }

  function wsCreate(name) {
    saveCurrentLayout();
    const id = 'ws-' + Date.now();
    _wsList.push({ id, name, layout: null, updatedAt: null });
    _wsActiveId = id;
    _wsWriteStore();
    _wsSwitching = true;
    window.location.reload();
  }

  function wsSwitch(id) {
    if (id === _wsActiveId) return;
    saveCurrentLayout();
    _wsActiveId = id;
    _wsWriteStore();
    _wsSwitching = true;
    window.location.reload();
  }

  function wsRename(id, name) {
    const ws = _wsList.find(w => w.id === id);
    if (ws) { ws.name = name.trim() || ws.name; _wsWriteStore(); }
  }

  function wsDelete(id) {
    if (_wsList.length <= 1) return; // can't delete last
    const wasActive = id === _wsActiveId;
    _wsList = _wsList.filter(w => w.id !== id);
    if (wasActive) {
      _wsActiveId = _wsList[0].id;
      _wsWriteStore();
      _wsSwitching = true;
      window.location.reload();
    } else {
      _wsWriteStore();
    }
  }

  function wsGetList()     { return _wsList.slice(); }
  function wsGetActiveId() { return _wsActiveId; }

  /* ── Panel catalogue ─────────────────────────────────────────────── */
  const PANEL_TITLES = {
    chat:      'Chat',
    apercu:    'Preview',
    diff:      'Diff',
    terminal:  'Terminal',
    fichiers:  'Files',
    taches:    'Tasks',
    plan:      'Plan',
    notes:     'Notes',
    skills:    'Skills',
    shortcuts: 'Shortcuts',
    mcp:       'MCP',
    git:       'Git',
    github:      'GitHub',
    screenshots: 'Screenshots',
    context:     'Context',
  };

  // Ordered list of tool panels that appear in the right group
  const TOOL_IDS = [
    'apercu', 'diff', 'terminal', 'fichiers',
    'taches', 'plan', 'notes', 'skills', 'git', 'github',
    'screenshots', 'browser', 'mcp', 'context', 'shortcuts',
  ];

  let dv           = null;
  let _artifactSeq = 0;
  let _chatReadding = false;   // re-entrancy guard for the chat-never-lost re-add

  // ── Bug C fix: queue openTerminal calls that arrive before dv is ready ───
  const _pendingTerminals = [];

  // id → panel's own .right-panel__body div  (for app.js compatibility)
  const panelBodies = {};

  // Suppress re-entrant _dvTabChange while workspace is activating a panel
  let _suppressTabChange = false;

  /* ── Helpers ─────────────────────────────────────────────────────── */

  function assignBodyId(id) {
    const target = panelBodies[id];
    if (!target) return;
    const prev = document.getElementById('right-panel-body');
    if (prev && prev !== target) prev.removeAttribute('id');
    target.id = 'right-panel-body';
  }

  // Return the id of the first canvas-* panel that exists, or null
  function firstCanvasId() {
    if (!dv) return null;
    for (const p of dv.panels) {
      if (p.id.startsWith('canvas-')) return p.id;
    }
    return null;
  }

  /* ── Chat component ──────────────────────────────────────────────── */
  // Adopts the hidden #chat-slot content (chat-scroll + composer + ctx-strip)
  // so all existing IDs that app.js relies on remain reachable.
  function makeChatComponent() {
    const wrap = document.createElement('div');
    wrap.className = 'dv-chat-wrap';

    return {
      element: wrap,
      init() {
        // Adopt the live chat DOM (chat-scroll + composer + ctx-strip) into this
        // panel. It lives in a hidden #chat-slot holder between mounts — moving
        // (never destroying) the nodes keeps every app.js reference + listener +
        // scroll/history state intact across close/reopen.
        const slot = document.getElementById('chat-slot');
        if (slot) {
          while (slot.firstChild) wrap.appendChild(slot.firstChild);
          // Keep the holder hidden but PRESENT (was previously .remove()'d, which
          // made a reopened chat blank — there was nothing left to re-adopt).
          slot.style.display = 'none';
        }
        // The floating toggle buttons are gone in the new layout
        wrap.querySelector('.right-panel-toggle-wrap')?.remove();
      },
      // Closing the Chat tab must NOT destroy the chat DOM — stash it back into
      // the hidden #chat-slot holder so activatePanel('chat') can re-adopt it.
      dispose() {
        let slot = document.getElementById('chat-slot');
        if (!slot) {
          slot = document.createElement('div');
          slot.id = 'chat-slot';
          slot.style.display = 'none';
          document.body.appendChild(slot);
        }
        while (wrap.firstChild) slot.appendChild(wrap.firstChild);
      },
    };
  }

  /* ── Split-chat component ────────────────────────────────────────── */
  // Each instance is an independent SplitChat — its own session, messages, stream.
  let _splitSeq = 0;

  function makeSplitChatComponent(options) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%;height:100%;overflow:hidden;';
    const params = options?.params || {};
    let _sc = null;
    return {
      element: wrap,
      init(panelApi) {
        if (window.SplitChat) {
          _sc = new window.SplitChat(wrap, panelApi, params);
        } else {
          wrap.textContent = 'SplitChat not loaded';
        }
      },
      // Called by dockview when panel is closed
      dispose() { _sc?.destroy(); },
    };
  }

  function openSplitChat(params) {
    if (!dv) return;
    _splitSeq++;
    const id = 'split-chat-' + _splitSeq;
    const ref = dv.activePanel?.id || 'chat';
    const title = params?.sessionTitle || ('Agent ' + _splitSeq);
    dv.addPanel({
      id,
      component: 'split-chat',
      title,
      position:  { direction: 'right', referencePanel: ref },
      size:      480,
      params:    params || {},
    });
    try { dv.getPanel(id)?.api.setActive(); } catch (_) {}
  }

  /* ── Session drag-drop onto dockview ─────────────────────────────── */
  function _initDockDrop() {
    const dockEl = document.getElementById('main-dock');
    if (!dockEl) return;

    // Overlay lives inside #main-dock so inset:0 fills it exactly
    const overlay = document.createElement('div');
    overlay.id = 'dock-drop-overlay';
    overlay.innerHTML = `
      <div class="ddo-inner">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="8 17 12 21 16 17"></polyline>
          <line x1="12" y1="3" x2="12" y2="21"></line>
        </svg>
        <span>Drop to open as agent panel</span>
      </div>`;
    dockEl.appendChild(overlay);

    let _dragSession = null;

    // ── KEY FIX: show overlay IMMEDIATELY on dragstart so it sits on top
    //    of dockview inner panels which would otherwise swallow drag events.
    document.addEventListener('dragstart', e => {
      const row = e.target.closest('[data-session-id]');
      if (!row) { _dragSession = null; return; }
      _dragSession = {
        id:    row.dataset.sessionId,
        title: (row.querySelector('.session__title')?.textContent || row.dataset.sessionId).trim(),
      };
      // Show overlay immediately — pointer-events:auto means all subsequent
      // dragover/drop events hit the overlay, not dockview panels underneath.
      overlay.classList.add('is-active');
    });

    document.addEventListener('dragend', () => {
      _dragSession = null;
      overlay.classList.remove('is-active', 'is-over');
    });

    // The overlay is on top, so it receives all drag events directly
    overlay.addEventListener('dragover', e => {
      if (!_dragSession) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      overlay.classList.add('is-over');
    });

    overlay.addEventListener('dragleave', e => {
      if (!overlay.contains(e.relatedTarget)) {
        overlay.classList.remove('is-over');
      }
    });

    overlay.addEventListener('drop', e => {
      e.preventDefault();
      overlay.classList.remove('is-active', 'is-over');
      if (!_dragSession) return;
      openSplitChat({
        sessionId:    _dragSession.id,
        sessionTitle: _dragSession.title,
      });
      _dragSession = null;
    });
  }

  /* ── Artifact (Canvas) component ─────────────────────────────────── */
  function makeArtifactComponent(options) {
    const wrap = document.createElement('div');
    wrap.className = 'dv-artifact-wrap';

    // toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'artifact-toolbar';
    toolbar.innerHTML = `
      <span class="artifact-toolbar__badge">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
        </svg>
        <span class="artifact-toolbar__name">Canvas</span>
      </span>
      <span class="artifact-toolbar__id" style="display:none"></span>
      <span class="artifact-toolbar__spacer"></span>
      <div class="artifact-zoom">
        <button class="artifact-toolbar__btn artifact-zoom__btn" data-art="zoom-out" title="Zoom out (−)">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button class="artifact-zoom__label" data-art="zoom-reset" title="Reset zoom to 100%">100%</button>
        <button class="artifact-toolbar__btn artifact-zoom__btn" data-art="zoom-in" title="Zoom in (+)">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
      <button class="artifact-toolbar__btn artifact-toolbar__btn--edit" data-art="edit" title="Edit this codeblock" style="display:none">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
      <button class="artifact-toolbar__btn" data-art="reload" title="Reload">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
      </button>
      <button class="artifact-toolbar__btn" data-art="popout" title="Open in browser">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </button>
    `;

    // iframe
    const frameWrap = document.createElement('div');
    frameWrap.className = 'artifact-frame-wrap';
    const frame = document.createElement('iframe');
    frame.className  = 'artifact-frame';
    frame.title      = 'Canvas artifact';
    frameWrap.appendChild(frame);
    wrap.appendChild(toolbar);
    wrap.appendChild(frameWrap);

    let _cbId = null;

    return {
      element: wrap,
      init(params) {
        const p = params.params || {};
        frame.setAttribute('sandbox', p.sandbox || 'allow-scripts');
        if (p.artifactHtml) frame.srcdoc = p.artifactHtml;

        const nameEl    = toolbar.querySelector('.artifact-toolbar__name');
        const idBadge   = toolbar.querySelector('.artifact-toolbar__id');
        const editBtn   = toolbar.querySelector('[data-art="edit"]');
        const zoomLabel = toolbar.querySelector('[data-art="zoom-reset"]');

        // ── Zoom state ───────────────────────────────────────────────
        let _zoom = 100; // percent
        const ZOOM_STEP = 10;
        const ZOOM_MIN  = 25;
        const ZOOM_MAX  = 300;

        function applyZoom(pct) {
          _zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, pct));
          const scale = _zoom / 100;
          // CSS transform doesn't affect layout, so the parent won't scroll
          // unless we add margins equal to the visual overflow.
          // extra = how much larger the visual size is vs the layout box (in %)
          const extra = Math.max(0, scale - 1) * 100;
          frame.style.transformOrigin = 'top left';
          frame.style.transform       = scale === 1 ? '' : `scale(${scale})`;
          frame.style.width           = '100%';
          frame.style.height          = '100%';
          frame.style.marginRight     = extra > 0 ? `${extra}%`  : '';
          frame.style.marginBottom    = extra > 0 ? `${extra}%`  : '';
          if (zoomLabel) zoomLabel.textContent = `${_zoom}%`;
        }

        if (nameEl && p.artifactTitle) nameEl.textContent = p.artifactTitle;

        if (p.cbId) {
          _cbId = p.cbId;
          if (idBadge) { idBadge.textContent = `codeblock_${_cbId}`; idBadge.style.display = ''; }
          if (editBtn)  editBtn.style.display = '';
        }

        // Listen for async cbId assigned after save completes
        const onCreated = (e) => {
          if (e.detail?.panelId === p.id || (!_cbId && e.detail?.cbId)) {
            _cbId = e.detail.cbId;
            if (idBadge) { idBadge.textContent = `codeblock_${_cbId}`; idBadge.style.display = ''; }
            if (editBtn)  editBtn.style.display = '';
          }
        };
        document.addEventListener('codeblock:created', onCreated, { once: true });

        toolbar.addEventListener('click', e => {
          const btn = e.target.closest('[data-art]');
          if (!btn) return;
          if (btn.dataset.art === 'zoom-in')    { applyZoom(_zoom + ZOOM_STEP); return; }
          if (btn.dataset.art === 'zoom-out')   { applyZoom(_zoom - ZOOM_STEP); return; }
          if (btn.dataset.art === 'zoom-reset') { applyZoom(100);               return; }
          if (btn.dataset.art === 'reload') {
            const src = frame.srcdoc;
            frame.srcdoc = '';
            requestAnimationFrame(() => { frame.srcdoc = src; });
            btn.classList.add('is-spinning');
            setTimeout(() => btn.classList.remove('is-spinning'), 600);
          }
          if (btn.dataset.art === 'popout') {
            const blob = new Blob([frame.srcdoc || ''], { type: 'text/html' });
            const url  = URL.createObjectURL(blob);
            window.open(url, '_blank', 'noopener');
            setTimeout(() => URL.revokeObjectURL(url), 5000);
          }
          if (btn.dataset.art === 'edit' && _cbId) {
            document.dispatchEvent(new CustomEvent('codeblock:edit-request', {
              detail: { cbId: _cbId, title: p.artifactTitle || nameEl?.textContent },
            }));
          }
        });

        // Mouse-wheel zoom on the frame (Ctrl + scroll)
        wrap.addEventListener('wheel', e => {
          if (!e.ctrlKey) return;
          e.preventDefault();
          applyZoom(_zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
        }, { passive: false });
      },
    };
  }

  /* ── Default layout builder ──────────────────────────────────────── */
  function _buildDefaultLayout() {
    dv.addPanel({
      id:        'chat',
      component: 'chat',
      title:     'Chat',
      params:    { id: 'chat' },
    });
    dv.addPanel({
      id:        TOOL_IDS[0],
      component: 'panel',
      title:     PANEL_TITLES[TOOL_IDS[0]],
      params:    { id: TOOL_IDS[0] },
      position:  { direction: 'right', referencePanel: 'chat' },
      size:      440,
    });
    for (const id of TOOL_IDS.slice(1)) {
      dv.addPanel({
        id,
        component: 'panel',
        title:     PANEL_TITLES[id],
        params:    { id },
        position:  { direction: 'within', referencePanel: TOOL_IDS[0] },
      });
    }
    try { dv.getPanel(TOOL_IDS[0])?.api.setActive(); } catch (_) {}
  }

  /* ── Terminal instance component ────────────────────────────────── */
  // Each call to openTerminal() creates one of these as its own dockview panel.
  let _termShellSeq  = 0;
  let _termClaudeSeq = 0;

  const _XTERM_THEME = {
    background:'#0e0e10', foreground:'#d4d4da', cursor:'#d97757', cursorAccent:'#0e0e10',
    // Windows Terminal / PowerShell-style blue selection highlight.
    // selectionBackground is opaque blue; selectionForeground keeps text readable.
    selectionBackground:'#264f78', selectionForeground:'#ffffff',
    selectionInactiveBackground:'#1f3a55',
    black:'#141416', red:'#e06c75', green:'#7ab389', yellow:'#c9a96e',
    blue:'#6a86c3', magenta:'#c678dd', cyan:'#56b6c2', white:'#abb2bf',
    brightBlack:'#5a5a63', brightRed:'#e06c75', brightGreen:'#98c379',
    brightYellow:'#e5c07b', brightBlue:'#61afef', brightMagenta:'#c678dd',
    brightCyan:'#56b6c2', brightWhite:'#ffffff',
  };

  function makeTerminalInstanceComponent(options) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'width:100%;height:100%;background:#0e0e10;overflow:hidden;';
    let _inst = null;

    return {
      element: wrap,
      async init(panelApi) {
        const p = panelApi.params || {};
        const isClaude = !!p.isClaude;
        const isWorktree = !!p.isWorktree;
        const api = window.electronAPI;
        if (!api?.terminal) { wrap.textContent = 'No terminal API'; return; }
        const Terminal = window.Terminal;
        const FitAddon = window.FitAddon?.FitAddon;
        if (!Terminal || !FitAddon) { wrap.textContent = 'xterm.js not loaded'; return; }

        const term = new Terminal({
          theme: _XTERM_THEME,
          fontFamily: '"Cascadia Code","Fira Code","JetBrains Mono",Consolas,monospace',
          fontSize: 13, lineHeight: 1.4, cursorBlink: true,
          cursorInactiveStyle: 'block',
          scrollback: 5000, allowProposedApi: true,
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(wrap);

        const result = await api.terminal.create({});
        if (!result.ok) {
          term.write(`\x1b[31mFailed: ${result.error}\x1b[0m\r\n`);
          return;
        }
        const { termId } = result;

        // Drive channel (Phase 26f): if this is an agent terminal, tell main
        // which termId backs this role so the Director can inject prompts into it.
        if (p.agentRole) {
          try { window.electronAPI?.team?.registerAgent?.(p.agentRole, termId); } catch (_) {}
        }

        // For Claude sessions: detect when the shell prompt first appears, then
        // send `claude\r`. This is more reliable than a fixed timeout because
        // PowerShell 7 can take 0.5–2s to fully initialize.
        let _claudeLaunched = false;
        // Build the claude launch command. Agent terminals inject a role system
        // prompt via --append-system-prompt. We HARD-STRIP shell-hostile chars
        // (" ` $ \ and newlines) so the single typed command can't break out of
        // the double-quoted arg, whatever shell the PTY runs (PowerShell/bash).
        const agentSystem = typeof p.agentSystem === 'string'
          ? p.agentSystem.replace(/["`$\\\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1600)
          : '';
        const _wtFlag = isWorktree ? ' --worktree' : '';
        const claudeCmd = agentSystem
          ? `claude${_wtFlag} --append-system-prompt "${agentSystem}"\r\n`
          : (isWorktree ? 'claude --worktree\r\n' : 'claude\r\n');
        function _maybeAutoLaunch(chunk) {
          if (!isClaude || _claudeLaunched) return;
          // Shell prompt patterns: ends with "> " or "$ " (PowerShell / bash)
          // Strip ANSI codes before checking
          const plain = chunk.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
          if (/[>$]\s*$/.test(plain)) {
            _claudeLaunched = true;
            // Small extra delay so the prompt line is fully rendered
            setTimeout(() => api.terminal.input(termId, claudeCmd), 120);
          }
        }

        const offData  = api.terminal.onData(termId, t => { term.write(t); _maybeAutoLaunch(t); });
        const offExit  = api.terminal.onExit(termId, code =>
          term.write(`\r\n\x1b[2m[process exited ${code}]\x1b[0m\r\n`));
        const offInput = term.onData(d => api.terminal.input(termId, d));

        // ── Windows Terminal-style keyboard shortcuts ───────────────────────
        // Ctrl+Shift+C → copy selection (doesn't conflict with SIGINT)
        // Ctrl+Shift+V → paste from clipboard
        // Ctrl+Insert  → copy selection (alternate)
        // Shift+Insert → paste (alternate)
        // Bare Ctrl+C also copies WHEN there's a selection (Windows convention) —
        // if no selection, Ctrl+C falls through to xterm/PTY and sends SIGINT.
        term.attachCustomKeyEventHandler((e) => {
          if (e.type !== 'keydown') return true;
          const ctrl  = e.ctrlKey || e.metaKey;
          const shift = e.shiftKey;
          const k     = e.key;
          // Copy
          if (
            (ctrl && shift && (k === 'C' || k === 'c')) ||
            (ctrl && k === 'Insert') ||
            (ctrl && !shift && (k === 'C' || k === 'c') && term.hasSelection())
          ) {
            const text = term.getSelection();
            if (text) {
              navigator.clipboard.writeText(text).catch(() => {});
              term.clearSelection();
              window.showToast?.('Copied · ' + text.length + ' chars', 'success', 1200);
            }
            return false; // swallow the chord — don't send to PTY
          }
          // Paste
          if (
            (ctrl && shift && (k === 'V' || k === 'v')) ||
            (shift && k === 'Insert')
          ) {
            navigator.clipboard.readText().then(text => {
              if (text) api.terminal.input(termId, text);
            }).catch(() => {});
            return false;
          }
          // Select all — Ctrl+Shift+A is the standard terminal binding
          if (ctrl && shift && (k === 'A' || k === 'a')) {
            term.selectAll();
            return false;
          }
          return true;
        });

        // ── Right-click behavior (Windows Terminal / PowerShell style) ──────
        // - Selection present → copy + clear + toast (no menu)
        // - No selection      → paste from clipboard at cursor
        wrap.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (term.hasSelection()) {
            const text = term.getSelection();
            navigator.clipboard.writeText(text).catch(() => {});
            term.clearSelection();
            window.showToast?.('Copied · ' + text.length + ' chars', 'success', 1200);
          } else {
            navigator.clipboard.readText().then(text => {
              if (text) api.terminal.input(termId, text);
            }).catch(() => {});
          }
        });

        // Wire resize: when xterm reflows, tell the PTY so line-wrapping matches
        const ro = new ResizeObserver(() => {
          try {
            fitAddon.fit();
            if (term.cols && term.rows) {
              api.terminal.resize?.(termId, term.cols, term.rows);
            }
          } catch { /**/ }
        });
        ro.observe(wrap);
        fitAddon.fit();
        if (term.cols && term.rows) api.terminal.resize?.(termId, term.cols, term.rows);

        // Refit when this panel becomes active (tab switch, resize, etc.)
        try {
          panelApi.onDidActiveChange?.(ev => {
            if (ev.isActive) setTimeout(() => { try { fitAddon.fit(); } catch { /**/ } }, 40);
          });
        } catch { /**/ }

        // Fallback: if no prompt detected within 3s, send claude anyway
        if (isClaude) setTimeout(() => {
          if (!_claudeLaunched) { _claudeLaunched = true; api.terminal.input(termId, claudeCmd); }
        }, 3000);

        _inst = {
          termId, term, fitAddon,
          cleanup() {
            offData(); offExit(); offInput.dispose(); ro.disconnect();
            if (p.agentRole) { try { window.electronAPI?.team?.unregisterAgent?.(p.agentRole, termId); } catch { /**/ } }
            try { api.terminal.close(termId); } catch { /**/ }
            try { term.dispose(); } catch { /**/ }
          },
        };
      },
      dispose() { _inst?.cleanup(); },
    };
  }

  function openTerminal(isClaude = false, opts = {}) {
    if (!dv) { _pendingTerminals.push({ isClaude, opts }); return; }
    const agent = opts.agent || null;
    if (agent) isClaude = true;                 // agents are always Claude sessions
    if (isClaude) _termClaudeSeq++; else _termShellSeq++;
    const isWorktree = isClaude && !!opts.worktree;
    const label = agent
      ? (agent.name || agent.role || `Agent ${_termClaudeSeq}`)
      : isWorktree ? `Worktree ${_termClaudeSeq}`
      : isClaude   ? `Claude ${_termClaudeSeq}` : `Shell ${_termShellSeq}`;
    const id    = `term-${Date.now()}-${_termClaudeSeq + _termShellSeq}`;

    // Find a reference panel to dock beside (prefer existing terminal panels)
    let refId = null;
    for (const p of dv.panels) {
      if (p.id.startsWith('term-') || p.id === 'terminal') { refId = p.id; break; }
    }
    if (!refId) {
      // Fall back to right-side tool group (use first TOOL_ID panel that exists)
      for (const tid of TOOL_IDS) {
        if (dv.getPanel(tid)) { refId = tid; break; }
      }
    }

    dv.addPanel({
      id,
      component: 'terminal-instance',
      title: label,
      params: { isClaude, label, isWorktree,
                agentSystem: agent?.system, agentRole: agent?.role, agentColor: agent?.color },
      position: refId
        ? { direction: 'within', referencePanel: refId }
        : { direction: 'right',  referencePanel: 'chat' },
    });
    // During a staggered team spawn we don't steal focus on every agent.
    if (opts.activate !== false) { try { dv.getPanel(id)?.api.setActive(); } catch { /**/ } }
  }

  /* ── Spawn a ready-to-go team workspace (Phase 26) ───────────────────────── */
  // Lays out the shared task board + a Director terminal + one role-injected
  // Claude terminal per agent. Terminals dock as tabs in one group (auto-ref);
  // the user can tear roles out side-by-side. Spawns are STAGGERED so we don't
  // spin up a dozen PTYs + `claude` launches in the same tick.
  let _pendingTeam = null;
  function spawnTeam(payload) {
    if (!dv) { _pendingTeam = payload; return; }
    const team   = payload || {};
    const agents = Array.isArray(team.agents) ? team.agents : [];
    try { window.showToast?.(`Spawning ${team.team || 'team'} — ${agents.length} agents…`, 'info', 3500); } catch (_) {}

    // 1) Surface the task board (the coordination bus the Director writes to).
    try { activatePanel('taches'); } catch (_) {}

    // 2) Director terminal first.
    if (team.director) {
      openTerminal(true, { agent: {
        role:   'director',
        name:   team.director.name || 'Director',
        system: team.director.system,
        color:  team.director.color || '#d97757',
      } });
    }

    // 3) Agents, staggered ~350ms apart; don't steal focus from the Director.
    agents.forEach((a, i) => {
      setTimeout(() => { try { openTerminal(true, { agent: a, activate: false }); } catch (_) {} }, 350 * (i + 1));
    });
    return { ok: true, agents: agents.length };
  }

  /* ── Pre-render all panels after layout restore ─────────────────── */
  // Called once after dv.fromJSON() so every visible panel has content,
  // not just the globally-active one. Skips panels already rendered.
  // ── Render + init a single panel's body ──────────────────────────────
  // Used by:
  //   • _renderAllPanelBodies (post layout-restore — for every panel)
  //   • The "+ Add panel" context menu (when right-panel sidebar isn't open
  //     so _dvTabChange would bail). Without this call, dynamically-added
  //     panels would show their skeleton ("Loading servers…") forever.
  //
  // No-op when:
  //   • bodyDiv is missing (panel wasn't found in panelBodies)
  //   • bodyDiv already has content AND force=false (don't blow away state)
  function _renderAndInitPanel(pid, { force = false } = {}) {
    if (typeof window.renderPanelContent !== 'function') return;
    const bodyDiv = panelBodies[pid];
    if (!bodyDiv) return;
    if (!force && bodyDiv.children.length > 0) return;
    try {
      bodyDiv.innerHTML = window.renderPanelContent(pid);
      window.renderIcons?.(bodyDiv);
      window.wirePlanTabEvents?.(pid, bodyDiv);
      requestAnimationFrame(() => {
        try {
          switch (pid) {
            case 'fichiers':    window.initFilesPanel?.();                    break;
            case 'notes':       window.initNotesPanel?.();                     break;
            case 'skills':      window.initSkillsDockPanel?.();                break;
            case 'taches':      window.initTachesPanel?.();                    break;
            case 'mcp':         window.initMcpPanel?.(bodyDiv);                break;
            case 'git':         window.initGitPanel?.(bodyDiv);                break;
            case 'github':      window.initGithubPanel?.(bodyDiv);             break;
            case 'screenshots': window.initScreenshotsPanel?.(bodyDiv);        break;
            case 'browser':     window.initBrowserPanel?.(bodyDiv);            break;
            case 'apercu':
              window.initApercuScaling?.(bodyDiv);
              window.initApercuServer?.(bodyDiv);
              break;
            // diff, plan, context, shortcuts, terminal — no init needed
            //   (terminal: per-instance from openTerminal())
          }
        } catch (e) { console.warn('[workspace] panel init error', pid, e); }
      });
    } catch (e) { console.warn('[workspace] renderPanelContent error', pid, e); }
  }

  function _renderAllPanelBodies() {
    for (const pid of TOOL_IDS) {
      _renderAndInitPanel(pid);
    }
  }

  /* ── Init ────────────────────────────────────────────────────────── */
  function init() {
    _wsLoadStore(); // bootstrap workspace state before anything else

    const el = document.getElementById('main-dock');
    if (!el) return;

    el.classList.add('dockview-theme-ccmod');

    dv = DV.createDockview(el, {
      className: 'dockview-theme-ccmod',
      // (dv assigned above — _pendingTerminals drained after layout restore below)

      createComponent(options) {
        if (options.name === 'chat')               return makeChatComponent(options);
        if (options.name === 'artifact')           return makeArtifactComponent(options);
        if (options.name === 'split-chat')         return makeSplitChatComponent(options);
        if (options.name === 'terminal-instance')  return makeTerminalInstanceComponent(options);

        // Standard tool panel — owns its own .right-panel__body
        const panelEl = document.createElement('div');
        panelEl.className = 'dv-panel-body';
        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'right-panel__body';
        panelEl.appendChild(bodyDiv);
        return {
          element: panelEl,
          init(params) {
            const pid = params.params?.id;
            if (pid) {
              panelBodies[pid] = bodyDiv;
              panelEl.dataset.panelId = pid;
            }
          },
          dispose() {
            // When user clicks the tab X, dockview calls this. We need to run
            // panel-specific teardown — without this, native overlays (the
            // browser's WebContentsView) get orphaned after the HTML panel
            // disappears.
            const pid = panelEl.dataset.panelId;
            try {
              if (pid === 'browser' && typeof window._browserPanelCleanup === 'function') {
                window._browserPanelCleanup();
              }
            } catch (_) { /* swallow — dispose must not throw */ }
            if (pid) delete panelBodies[pid];
          },
        };
      },
    });

    /* ── Layout — restore saved or build default ─────────────────── */

    const _savedLayout = _wsGetActive()?.layout;
    if (_savedLayout) {
      try {
        dv.fromJSON(_savedLayout);
        // After layout restore, non-active panels have empty bodies — pre-render them
        // so every panel shows content immediately, not just the globally active one.
        setTimeout(_renderAllPanelBodies, 0);
      } catch (e) {
        console.warn('[workspace] fromJSON failed, falling back to default layout:', e);
        _buildDefaultLayout();
      }
    } else {
      _buildDefaultLayout();
    }

    // Auto-save layout on any panel or size change (debounced 600 ms)
    dv.onDidLayoutChange(() => _wsScheduleSave());
    dv.onDidAddPanel(()    => _wsScheduleSave());
    dv.onDidRemovePanel((e) => {
      _wsScheduleSave();
      // The Chat is the primary panel — never let it be lost. If its X is
      // clicked, re-add it (re-adopting the chat DOM that makeChatComponent's
      // dispose stashed into #chat-slot). NOTE: dragging the tab to rearrange
      // fires a MOVE, not a remove — so this never interferes with placing
      // chat-left / browser-right.
      if (e?.panel?.id === 'chat' && !_chatReadding) {
        _chatReadding = true;
        setTimeout(() => {
          try { activatePanel('chat'); } catch (_) {}
          _chatReadding = false;
          try { window.showToast?.('Chat is your main panel — drag its tab to rearrange instead of closing', 'info', 3000); } catch (_) {}
        }, 0);
      }
    });

    // ── Flush-on-close (Phase 23) ───────────────────────────────────────────
    // The 600ms debounce means a layout change made just before quitting was
    // lost — the timer never fired. Flush synchronously on unload / when the
    // window is hidden, so the last arrangement always persists. Skip when a
    // switch/create/delete is mid-reload (those already saved to the correct
    // workspace; saving here would write the old layout into the new ws).
    const _flushSave = () => {
      if (_wsSwitching) return;
      if (_wsSaveTimer) { clearTimeout(_wsSaveTimer); _wsSaveTimer = null; }
      saveCurrentLayout();
    };
    window.addEventListener('beforeunload', _flushSave);
    window.addEventListener('pagehide', _flushSave);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') _flushSave();
    });

    // ── Bug C fix: drain any openTerminal calls queued before dv was ready ──
    if (_pendingTerminals.length) {
      setTimeout(() => {
        _pendingTerminals.splice(0).forEach(item => {
          // item may be a plain bool (legacy) or { isClaude, opts }
          if (typeof item === 'boolean') openTerminal(item);
          else openTerminal(item.isClaude, item.opts || {});
        });
      }, 100);
    }

    // ── Team spawn (Phase 26): main sends team:spawn with the role payload ──
    try {
      window.electronAPI?.team?.onSpawn?.(payload => spawnTeam(payload));
    } catch (_) {}
    if (_pendingTeam) { const t = _pendingTeam; _pendingTeam = null; setTimeout(() => spawnTeam(t), 150); }

    // One-shot: the "DevOps Team" dropdown item set this flag, then created/
    // switched the workspace (which reloaded). Now that dv is ready, ask main to
    // spawn the team (→ team:spawn → onSpawn above → spawnTeam with the payload).
    try {
      if (localStorage.getItem('ccmod.spawnTeamOnLoad') === '1') {
        localStorage.removeItem('ccmod.spawnTeamOnLoad');
        setTimeout(() => {
          const r = window.electronAPI?.team?.spawn?.();
          if (r && r.catch) r.catch(() => { try { window.showToast?.('Restart CCM to finish loading the agent team — the main process is running an older build.', 'error', 6000); } catch (_) {} });
        }, 700);
      }
    } catch (_) {}

    /* ── Drag — suppress browser "Move" badge ────────────────────── */
    el.addEventListener('dragstart', e => {
      const tabEl = e.target?.closest?.('.dv-tab');
      if (!tabEl || !e.dataTransfer) return;
      const title = tabEl.querySelector('.dv-default-tab-content')?.textContent || '';
      const ghost = document.createElement('div');
      ghost.style.cssText = [
        'position:fixed', 'top:-9999px', 'left:-9999px',
        'background:#1a1a1d', 'color:#e7e7ea',
        'border:1px solid #2e2e34', 'padding:3px 10px',
        'border-radius:20px', 'font-size:11px',
        'font-family:system-ui,sans-serif',
        'white-space:nowrap', 'pointer-events:none', 'z-index:-1',
      ].join(';');
      ghost.textContent = title || 'Panel';
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, (ghost.getBoundingClientRect().width || 40) / 2, -8);
      setTimeout(() => ghost.remove(), 0);
    }, false);

    /* ── Tab activation — sync app.js panel state ────────────────── */
    dv.onDidActivePanelChange(e => {
      if (!e || _suppressTabChange) return;
      const { id } = e;
      const isWorkspaceOnly = id.startsWith('canvas-') || id.startsWith('term-')
                           || id.startsWith('split-chat') || id === 'chat' || id === 'sidebar';
      if (!isWorkspaceOnly) {
        assignBodyId(id);
        if (typeof window._dvTabChange === 'function') window._dvTabChange(id);
      }
    });

    // Mark the workspace as always-visible (replaces right-panel-open toggle)
    document.body.classList.add('right-panel-open');

    /* ── Dock context menu ───────────────────────────────────────── */
    _initContextMenu(el);

    /* ── Session drag-drop ───────────────────────────────────────── */
    _initDockDrop();
  }

  /* ── Reset layout ────────────────────────────────────────────────── */
  function resetLayout() {
    // Wipe the active workspace's saved layout so the reload uses the default.
    const ws = _wsGetActive();
    if (ws) { ws.layout = null; _wsWriteStore(); }
    _toolsHidden = false;
    _hiddenPanelIds = [];
    localStorage.setItem('ccmod.toolsHidden', '0');
    localStorage.removeItem('ccmod.viewLocked');
    window.location.reload();
  }

  /* ── Lock / unlock view (hide all tab × buttons) ─────────────────── */
  let _viewLocked = false;
  function setViewLocked(locked) {
    _viewLocked = locked;
    document.getElementById('main-dock')
      ?.classList.toggle('view-locked', locked);
    localStorage.setItem('ccmod.viewLocked', locked ? '1' : '0');
  }

  // ── Hide / show all tool panels (right group + canvas panels) ───────
  let _toolsHidden   = localStorage.getItem('ccmod.toolsHidden') === '1';
  let _hiddenPanelIds = []; // ids of panels closed when hiding

  function _applyToolsHidden() {
    if (!dv) return;
    const dock = document.getElementById('main-dock');

    if (_toolsHidden) {
      // ── HIDE: close every non-chat panel, dockview gives chat 100% ──
      _hiddenPanelIds = [];
      for (const p of [...dv.panels]) {
        if (p.id === 'chat') continue;
        _hiddenPanelIds.push(p.id);
        try { p.api.close(); } catch (_) {}
      }
      // Let dockview recalculate (chat fills full dock naturally)
      setTimeout(() => {
        try { dv.layout(dock?.offsetWidth || 800, dock?.offsetHeight || 600); } catch (_) {}
      }, 30);

    } else {
      // ── SHOW: re-add the tool panels that were closed ──────────────
      const toAdd = _hiddenPanelIds.length ? _hiddenPanelIds : [...TOOL_IDS];
      _hiddenPanelIds = [];

      let firstId = null;
      for (const id of toAdd) {
        if (dv.getPanel(id)) continue; // already open (shouldn't happen but guard)
        if (!firstId) {
          // First panel gets its own column to the right of chat
          dv.addPanel({
            id,
            component: id.startsWith('canvas-') ? 'artifact' : 'panel',
            title:     PANEL_TITLES[id] || id,
            params:    { id },
            position:  { direction: 'right', referencePanel: 'chat' },
            size:      440,
          });
          firstId = id;
        } else {
          // Remaining panels tab into the same right group
          dv.addPanel({
            id,
            component: id.startsWith('canvas-') ? 'artifact' : 'panel',
            title:     PANEL_TITLES[id] || id,
            params:    { id },
            position:  { direction: 'within', referencePanel: firstId },
          });
        }
      }
      try { dv.getPanel(TOOL_IDS[0])?.api.setActive(); } catch (_) {}
    }

    const label = document.getElementById('hide-tools-label');
    if (label) label.textContent = _toolsHidden ? 'Show tool panels' : 'Hide tool panels';
    localStorage.setItem('ccmod.toolsHidden', _toolsHidden ? '1' : '0');
  }

  function toggleToolsHidden() {
    _toolsHidden = !_toolsHidden;
    _applyToolsHidden();
  }

  /* ── Context menu ────────────────────────────────────────────────── */
  function _initContextMenu(dockEl) {
    const menu = document.getElementById('dock-ctx-menu');
    if (!menu) return;

    // Restore lock state
    if (localStorage.getItem('ccmod.viewLocked') === '1') setViewLocked(true);

    // Restore hidden-tools state (defer so panels exist in DOM)
    if (_toolsHidden) setTimeout(_applyToolsHidden, 100);
    // Update label on open
    const menuLbl = document.getElementById('hide-tools-label');
    if (menuLbl) menuLbl.textContent = _toolsHidden ? 'Show tool panels' : 'Hide tool panels';

    let _openSub = null;

    function hideMenu() {
      menu.style.display = 'none';
      if (_openSub) { _openSub.classList.remove('is-open'); _openSub = null; }
    }

    // Right-click on main-dock (but not on sidebar).
    // Skip when the click is inside the chat conversation, composer, or any
    // panel that has its own contextmenu (terminal, kanban modal, etc.) — those
    // surfaces handle their own copy/paste/menu UX.
    dockEl.addEventListener('contextmenu', e => {
      if (e.target.closest(
        '.msg, #composer-input, .chat-conversation, ' +
        '.xterm, .xterm-helpers, .xterm-screen, ' +
        '.kanban-modal, .kanban__cards, .task-card, ' +
        '.browser-panel, [data-browser-root]'
      )) {
        // Let the surface-specific handler take it; bail without showing the dock menu.
        return;
      }
      e.preventDefault();
      const vw = window.innerWidth, vh = window.innerHeight;

      // Show off-screen first so we can measure actual dimensions
      menu.style.left    = '-9999px';
      menu.style.top     = '-9999px';
      menu.style.display = 'block';
      const mw = menu.offsetWidth  || 200;
      const mh = menu.offsetHeight || 200;

      // Horizontal: clamp so menu doesn't go off right edge
      const x = Math.min(e.clientX, vw - mw - 8);
      // Vertical: flip upward if near bottom
      const fitsBelow = e.clientY + mh + 8 <= vh;
      const y = fitsBelow
        ? e.clientY
        : Math.max(8, e.clientY - mh);
      menu.style.left = x + 'px';
      menu.style.top  = y + 'px';

      // Sync lock checkbox
      menu.querySelector('[data-action="lock"] .ctx-check')
        ?.classList.toggle('is-checked', _viewLocked);

      // Sync hide-tools label
      const lbl = menu.querySelector('#hide-tools-label');
      if (lbl) lbl.textContent = _toolsHidden ? 'Show tool panels' : 'Hide tool panels';
    });

    document.addEventListener('mousedown', e => {
      if (!menu.contains(e.target)) hideMenu();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') hideMenu();
    });

    // Action buttons
    menu.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;

      if (action === 'reset') {
        resetLayout();
        hideMenu();
      }

      if (action === 'lock') {
        setViewLocked(!_viewLocked);
        btn.querySelector('.ctx-check')?.classList.toggle('is-checked', _viewLocked);
        // Don't close — let user see the state change
      }

      if (action === 'hide-tools') {
        toggleToolsHidden();
        hideMenu();
      }

      if (action === 'new-split-chat') {
        openSplitChat();
        hideMenu();
      }
    });

    // Add-panel submenu
    menu.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id = btn.dataset.add;
        if (id) {
          activatePanel(id);
          // activatePanel sets _suppressTabChange=true so the dockview event
          // is swallowed and panel content never gets injected. Force it here.
          if (id !== 'chat' && typeof window._dvTabChange === 'function') {
            window._dvTabChange(id);
          }
          // Belt-and-suspenders: `_dvTabChange` bails when the right-panel
          // sidebar isn't open, but the panel still needs its body rendered
          // + init function run. Calling _renderAndInitPanel directly handles
          // the case where the user adds a panel without the sidebar open
          // (which is how the MCP panel was stuck on "Loading servers…").
          if (id !== 'chat') {
            requestAnimationFrame(() => _renderAndInitPanel(id));
          }
        }
        hideMenu();
      });
    });

    // Submenu hover open/close
    const subTrigger = menu.querySelector('.ctx-has-sub');
    const subMenu    = menu.querySelector('.ctx-submenu');
    if (subTrigger && subMenu) {
      subTrigger.addEventListener('mouseenter', () => {
        subMenu.classList.add('is-open');
        _openSub = subMenu;
        // Horizontal: try right, flip left if off-screen
        const tr  = subTrigger.getBoundingClientRect();
        const sw  = subMenu.offsetWidth  || 160;
        const sh  = subMenu.offsetHeight || 120;
        const flipH = tr.right + sw > window.innerWidth - 8;
        subMenu.style.left  = flipH ? 'auto' : '100%';
        subMenu.style.right = flipH ? '100%' : 'auto';
        // Vertical: flip upward if submenu would overflow the bottom
        const flipV = tr.top + sh > window.innerHeight - 8;
        subMenu.style.top    = flipV ? 'auto' : '0';
        subMenu.style.bottom = flipV ? '0'    : 'auto';
      });
      menu.querySelector('.ctx-menu-body')?.addEventListener('mouseleave', e => {
        if (!subMenu.contains(e.relatedTarget)) {
          subMenu.classList.remove('is-open');
          _openSub = null;
        }
      });
    }
  }

  /* ── Public API ───────────────────────────────────────────────────── */

  function activatePanel(id) {
    if (!dv) return;
    _suppressTabChange = true;

    if (!dv.getPanel(id)) {
      if (id === 'chat') {
        // Re-add chat panel — content (chat-slot) was already adopted on first
        // load; subsequent re-adds get a fresh dv-chat-wrap that app.js already
        // populated, so the existing DOM tree re-attaches correctly.
        dv.addPanel({
          id:        'chat',
          component: 'chat',
          title:     'Chat',
          params:    { id: 'chat' },
        });
      } else {
        const refId = TOOL_IDS.includes(id) ? (dv.getPanel(TOOL_IDS[0]) ? TOOL_IDS[0] : null) : null;
        dv.addPanel({
          id,
          component: 'panel',
          title:     PANEL_TITLES[id] || id,
          params:    { id },
          ...(refId ? { position: { direction: 'within', referencePanel: refId } } : {}),
        });
      }
    } else {
      try { dv.getPanel(id).api.setActive(); } catch (_) {}
    }

    if (id !== 'chat') assignBodyId(id);
    _suppressTabChange = false;
  }

  // lang: 'html' | 'jsx' | 'tsx' | 'js' etc.
  // source: original source code (before Babel wrapping) — stored in .meta.json sidecar
  async function pinArtifact(title, html, sandbox, lang, source) {
    if (!dv) { console.warn('[workspace] dockview not ready'); return; }

    _artifactSeq++;
    const id       = `canvas-${_artifactSeq}`;
    const tabTitle = title   || `Canvas ${_artifactSeq}`;
    const sbVal    = sandbox || 'allow-scripts';
    const cbLang   = lang   || 'html';
    const cbSource = source || null;

    // Auto-save (or update) codeblock library
    let cbId = null;
    const pendingEditId = window.__cbEditingId || null;   // set by app.js when user references a CB
    if (window.electronAPI?.codeblocks) {
      try {
        if (pendingEditId) {
          await window.electronAPI.codeblocks.update(pendingEditId, html, cbLang, cbSource);
          cbId = pendingEditId;
          window.__cbEditingId = null;
        } else {
          const result = await window.electronAPI.codeblocks.save(tabTitle, html, cbLang, cbSource);
          cbId = result?.id || null;
        }
      } catch (e) {
        console.warn('[workspace] codeblock save/update failed:', e);
      }
    }

    // First canvas → split below tool group; subsequent → tab in
    const existing = firstCanvasId();
    dv.addPanel({
      id,
      component: 'artifact',
      title:     tabTitle,
      params:    { id, artifactTitle: tabTitle, artifactHtml: html, sandbox: sbVal, cbId },
      ...(existing
        ? { position: { direction: 'within', referencePanel: existing } }
        : { position: { direction: 'below',  referencePanel: TOOL_IDS[0] }, size: 300 }),
    });

    try { dv.getPanel(id)?.api.setActive(); } catch (_) {}

    // Track as the active canvas for follow-up messages
    if (cbId) {
      window.__lastPinnedCbId   = cbId;
      window.__lastPinnedCbLang = cbLang;
      window.__lastPinnedCbName = tabTitle;
    }

    // Announce in chat
    if (cbId) {
      document.dispatchEvent(new CustomEvent('codeblock:created', {
        detail: { cbId, title: tabTitle, panelId: id },
      }));
    }
  }

  // Always visible in the new layout — no separate toggle needed
  function isVisible() { return true; }

  /* ── Cross-window panel drag ─────────────────────────────────────── */
  (function initCrossWindowDrag() {
    const api = window.electronAPI?.panelDrag;
    if (!api) return;

    // Panels that can be moved between windows (stateless tool panels only)
    const MOVABLE = new Set(TOOL_IDS);

    let _dragging    = null;   // { panelId }
    let _dragActive  = false;
    let _startX      = 0;
    let _startY      = 0;

    // ── Drop-zone overlay (shown on this window when cursor enters from other) ──
    const _overlay = document.createElement('div');
    _overlay.id = 'xwin-drop-overlay';
    _overlay.innerHTML = `
      <div class="xwin-drop-inner">
        <svg width="36" height="36" viewBox="0 0 256 256" fill="currentColor">
          <path d="M240,72H208V56a16,16,0,0,0-16-16H32A16,16,0,0,0,16,56V168a16,16,0,0,0,16,16H80v16a16,16,0,0,0,16,16H240a16,16,0,0,0,16-16V88A16,16,0,0,0,240,72ZM32,168V56H192v16H96A16,16,0,0,0,80,88v80Zm208,16H96V88H240V184Z"/>
        </svg>
        <span class="xwin-drop-label">Drop to move here</span>
        <span class="xwin-drop-panel"></span>
      </div>`;
    document.body.appendChild(_overlay);

    function _showOverlay(panelId) {
      _overlay.querySelector('.xwin-drop-panel').textContent = PANEL_TITLES[panelId] || panelId;
      _overlay.classList.add('xwin-drop--active');
    }
    function _hideOverlay() {
      _overlay.classList.remove('xwin-drop--active');
    }

    // ── Detect dockview tab drag ──────────────────────────────────────
    document.addEventListener('mousedown', e => {
      const tab = e.target.closest('.dv-tab');
      if (!tab) return;

      // Get the panel ID for this tab — dockview sets the active panel on mousedown
      _startX = e.clientX;
      _startY = e.clientY;
      _dragging = null;
      _dragActive = false;

      // Resolve panel ID: try tab's data attrs, then use active panel after tick
      const resolve = () => {
        // The active panel should have just changed to match the clicked tab
        const panel = dv?.activePanel;
        if (!panel || !MOVABLE.has(panel.id)) return;
        _dragging = { panelId: panel.id };
      };
      // Try immediately, then after dockview processes the click
      resolve();
      setTimeout(resolve, 16);
    }, { passive: true });

    document.addEventListener('mousemove', e => {
      if (!_dragging) return;
      const dx = Math.abs(e.clientX - _startX);
      const dy = Math.abs(e.clientY - _startY);
      if (!_dragActive && (dx > 8 || dy > 8)) {
        _dragActive = true;
        api.start(_dragging.panelId).catch(() => {});
        console.log('[xwin-drag] drag started:', _dragging.panelId);
      }
    }, { passive: true });

    document.addEventListener('mouseup', async e => {
      if (!_dragging || !_dragActive) {
        _dragging = null; _dragActive = false;
        return;
      }
      const { panelId } = _dragging;
      _dragging = null; _dragActive = false;

      const result = await api.end().catch(() => null);
      _hideOverlay();

      if (result?.transferred && result.panelId === panelId) {
        // Remove the panel from THIS window — it will open in the other
        console.log('[xwin-drag] transfer confirmed, closing local panel:', panelId);
        const panel = dv?.getPanel(panelId);
        if (panel) {
          try { panel.api.close(); } catch (_) {}
        }
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && _dragActive) {
        _dragActive = false; _dragging = null;
        api.cancel().catch(() => {});
        _hideOverlay();
      }
    });

    // ── Clicking / releasing on the overlay in the receiving window ─────────
    // When the user drags from another window and releases the mouse here,
    // the source window may not see the mouseup (mouse left it). Handle both
    // click and mouseup on the overlay so the transfer always completes.
    let _overlayDropBusy = false;
    async function _doOverlayDrop() {
      if (_overlayDropBusy || !_overlay.classList.contains('xwin-drop--active')) return;
      _overlayDropBusy = true;
      try {
        // Use 'accept' — tells main process THIS window is the target,
        // no cursor-position check (avoids DPI/bounds mismatch on Windows).
        const result = await api.accept().catch(() => null);
        _hideOverlay();
        // onReceive fires on this window via main.js → no extra work needed
        console.log('[xwin-drag] overlay accept result:', result);
      } finally {
        _overlayDropBusy = false;
      }
    }
    _overlay.addEventListener('mouseup', _doOverlayDrop);
    _overlay.addEventListener('click',   _doOverlayDrop);

    // ── Listen for cursor entering THIS window during another window's drag ──
    api.onCursor(data => {
      if (!data) { _hideOverlay(); return; }
      const { cursorInThisWindow, panelId } = data;
      if (cursorInThisWindow) {
        _showOverlay(panelId);
      } else {
        _hideOverlay();
      }
    });

    // ── Receive a panel from another window ───────────────────────────
    api.onReceive(panelId => {
      console.log('[xwin-drag] receiving panel:', panelId);
      _hideOverlay();
      // Small delay so the source window's close animation finishes
      setTimeout(() => {
        activatePanel(panelId);
        // Trigger panel content init
        if (typeof window._dvTabChange === 'function') {
          window._dvTabChange(panelId);
        }
      }, 120);
    });
  })();

  /* ── Export ───────────────────────────────────────────────────────── */
  window.Workspace = {
    init, activatePanel, isVisible, pinArtifact, resetLayout, setViewLocked, toggleToolsHidden, openSplitChat,
    openTerminal, spawnTeam,
    // Workspace management
    saveCurrentLayout,
    wsGetList, wsGetActiveId, wsCreate, wsSwitch, wsRename, wsDelete,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
