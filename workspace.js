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

  /* ── Panel catalogue ─────────────────────────────────────────────── */
  const PANEL_TITLES = {
    chat:      'Chat',
    apercu:    'Preview',
    diff:      'Diff',
    terminal:  'Terminal',
    fichiers:  'Files',
    taches:    'Tasks',
    plan:      'Plan',
    shortcuts: 'Shortcuts',
    mcp:       'MCP',
    git:       'Git',
    context:   'Context',
  };

  // Ordered list of tool panels that appear in the right group
  const TOOL_IDS = [
    'apercu', 'diff', 'terminal', 'fichiers',
    'taches', 'plan', 'git', 'mcp', 'context', 'shortcuts',
  ];

  let dv           = null;
  let _artifactSeq = 0;

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
        const slot = document.getElementById('chat-slot');
        if (slot) {
          while (slot.firstChild) wrap.appendChild(slot.firstChild);
          slot.remove();
        }
        // The floating toggle buttons are gone in the new layout
        wrap.querySelector('.right-panel-toggle-wrap')?.remove();
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

  /* ── Init ────────────────────────────────────────────────────────── */
  function init() {
    const el = document.getElementById('main-dock');
    if (!el) return;

    el.classList.add('dockview-theme-ccmod');

    dv = DV.createDockview(el, {
      className: 'dockview-theme-ccmod',

      createComponent(options) {
        if (options.name === 'chat')        return makeChatComponent(options);
        if (options.name === 'artifact')    return makeArtifactComponent(options);
        if (options.name === 'split-chat')  return makeSplitChatComponent(options);

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
            if (pid) panelBodies[pid] = bodyDiv;
          },
        };
      },
    });

    /* ── Default layout ──────────────────────────────────────────── */

    // 1. Chat — fills all space (sidebar lives outside dockview as a plain <aside>)
    dv.addPanel({
      id:        'chat',
      component: 'chat',
      title:     'Chat',
      params:    { id: 'chat' },
    });

    // 2. First tool panel — splits right (440 px) from chat
    dv.addPanel({
      id:        TOOL_IDS[0],
      component: 'panel',
      title:     PANEL_TITLES[TOOL_IDS[0]],
      params:    { id: TOOL_IDS[0] },
      position:  { direction: 'right', referencePanel: 'chat' },
      size:      440,
    });

    // 3. Remaining tool panels — tab into the same right group
    for (const id of TOOL_IDS.slice(1)) {
      dv.addPanel({
        id,
        component: 'panel',
        title:     PANEL_TITLES[id],
        params:    { id },
        position:  { direction: 'within', referencePanel: TOOL_IDS[0] },
      });
    }

    // Start with Preview active
    try { dv.getPanel(TOOL_IDS[0])?.api.setActive(); } catch (_) {}

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
      if (!id.startsWith('canvas-') && id !== 'chat' && id !== 'sidebar') {
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
    // The most reliable reset is a full page reload.
    // - #chat-slot is recreated fresh so the chat component can re-adopt it.
    // - All dockview panels are re-initialized from scratch.
    // - Sessions are disk-backed so no conversation history is lost.
    // Clear persistent state first so the reload comes up in the default layout.
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

    // Right-click on main-dock (but not on sidebar)
    dockEl.addEventListener('contextmenu', e => {
      e.preventDefault();
      const vw = window.innerWidth, vh = window.innerHeight;
      const mw = 200, mh = 180;
      const x = Math.min(e.clientX, vw - mw - 8);
      const y = Math.min(e.clientY, vh - mh - 8);
      menu.style.left    = x + 'px';
      menu.style.top     = y + 'px';
      menu.style.display = 'block';

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
        if (id) activatePanel(id);
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
        // Position submenu: try right, flip left if off-screen
        const tr = subTrigger.getBoundingClientRect();
        const sw = subMenu.offsetWidth || 160;
        const flip = tr.right + sw > window.innerWidth - 8;
        subMenu.style.left = flip ? 'auto' : '100%';
        subMenu.style.right = flip ? '100%' : 'auto';
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

  /* ── Export ───────────────────────────────────────────────────────── */
  window.Workspace = { init, activatePanel, isVisible, pinArtifact, resetLayout, setViewLocked, toggleToolsHidden, openSplitChat };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
