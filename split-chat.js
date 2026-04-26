/**
 * split-chat.js — parallel AI agent panel
 *
 * Phase 1 → agent setup card (name, model, system prompt, permission mode).
 * Phase 2 → autonomous agent: live tool-activity cards + streamed response.
 *
 * The CLI runs with --dangerously-skip-permissions (bypass) by default so the
 * agent can call Bash, read/write files, spawn sub-agents, etc. without
 * any confirmation prompts — it operates fully autonomously.
 */

(function () {
  'use strict';

  /* ── Icons ─────────────────────────────────────────────────────────────── */
  const SEND_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>`;
  const STOP_ICON = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
    <rect x="4" y="4" width="16" height="16" rx="2"/>
  </svg>`;
  const AGENT_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
  </svg>`;

  /* ── Tool → icon + label map ────────────────────────────────────────────── */
  const TOOL_META = {
    // file ops
    read:           { icon: '📄', label: 'Read' },
    read_file:      { icon: '📄', label: 'Read' },
    readfile:       { icon: '📄', label: 'Read' },
    view:           { icon: '📄', label: 'View' },
    cat:            { icon: '📄', label: 'Read' },
    write:          { icon: '✏️',  label: 'Write' },
    write_file:     { icon: '✏️',  label: 'Write' },
    edit:           { icon: '✏️',  label: 'Edit' },
    edit_block:     { icon: '✏️',  label: 'Edit' },
    str_replace:    { icon: '✏️',  label: 'Edit' },
    // shell / process
    bash:           { icon: '⚡', label: 'Bash' },
    execute_command:{ icon: '⚡', label: 'Run' },
    exec:           { icon: '⚡', label: 'Exec' },
    // search / glob
    grep:           { icon: '🔍', label: 'Search' },
    glob:           { icon: '🔍', label: 'Glob' },
    find:           { icon: '🔍', label: 'Find' },
    search:         { icon: '🔍', label: 'Search' },
    websearch:      { icon: '🌐', label: 'Web search' },
    web_search:     { icon: '🌐', label: 'Web search' },
    webfetch:       { icon: '🌐', label: 'Fetch' },
    web_fetch:      { icon: '🌐', label: 'Fetch' },
    fetch:          { icon: '🌐', label: 'Fetch' },
    // agents
    agent:          { icon: '🤖', label: 'Agent' },
    task:           { icon: '🤖', label: 'Subtask' },
    // todo
    todowrite:      { icon: '📋', label: 'Todo' },
    todo_write:     { icon: '📋', label: 'Todo' },
    // generic fallback
    _default:       { icon: '🔧', label: 'Tool' },
  };

  function toolMeta(name) {
    const key = (name || '').toLowerCase().replace(/[^a-z_]/g, '');
    return TOOL_META[key] || TOOL_META._default;
  }

  /* ── Permission modes ───────────────────────────────────────────────────── */
  const PERM_MODES = [
    { id: 'bypass', label: 'Full auto',     desc: 'No confirmations — runs completely autonomously' },
    { id: 'accept', label: 'Auto-approve',  desc: 'Auto-approves file edits, asks for risky ops' },
    { id: 'default',label: 'Manual',        desc: 'Asks before each tool call' },
  ];

  /* ── Model list ─────────────────────────────────────────────────────────── */
  const MODELS = [
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
    { id: 'claude-opus-4-5',   label: 'Claude Opus 4.5'   },
    { id: 'claude-opus-4',     label: 'Claude Opus 4'      },
    { id: 'claude-haiku-3-5',  label: 'Claude Haiku 3.5'  },
  ];
  const DEFAULT_MODEL   = 'claude-sonnet-4-6';
  const DEFAULT_PERM    = 'bypass';

  let _seq = 0;

  function loadAgents() {
    try { return JSON.parse(localStorage.getItem('ccmod.agents') || '[]'); } catch { return []; }
  }
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ════════════════════════════════════════════════════════════════════════
     SplitChat
     ════════════════════════════════════════════════════════════════════════ */
  class SplitChat {
    /**
     * @param {HTMLElement} container
     * @param {object|null} dvPanelApi   — dockview panel api (for setTitle)
     * @param {object}      params       — optional: { sessionId, sessionTitle }
     *                                     When present, skip setup and load the
     *                                     dragged session directly as an agent.
     */
    constructor(container, dvPanelApi, params = {}) {
      this.container  = container;
      this.dvPanel    = dvPanelApi ? { api: dvPanelApi } : null;
      this.uid        = 'sc' + (++_seq) + '_' + Date.now();
      this.sessionId  = params.sessionId || ('split_' + this.uid);
      this.history    = [];
      this.streaming  = false;
      this.requestId  = null;
      this._unsubChunk = null;
      this._unsubDone  = null;

      // Agent config
      this.agentName   = '';
      this.agentSystem = '';
      this.agentModel  = DEFAULT_MODEL;
      this.agentPerm   = DEFAULT_PERM;
      this.configured  = false;

      // Linked session context
      this.linkedSessionId    = null;
      this.linkedSessionTitle = null;
      this.contextBoundary    = 0;

      // ── Listen for new messages from the main chat ─────────────────
      this._onMainMessage = e => this._handleMainMessage(e.detail);
      window.addEventListener('ccmod:mainMessage', this._onMainMessage);

      // Pre-seeded from a dragged sidebar session — skip setup card
      if (params.sessionId && params.sessionTitle) {
        this.agentName  = params.sessionTitle;
        this.configured = true;
        this._updateTitle(params.sessionTitle);
        this._renderChat();
        this._loadHistory();
      } else {
        this._renderSetup();
      }
    }

    /* ══════════════════════════════════════════════════════════════════
       LIVE CONTEXT — receives new messages from the main chat
       ══════════════════════════════════════════════════════════════════ */
    _handleMainMessage(detail) {
      // Only act if this agent is linked to the session that sent the message
      if (!this.linkedSessionId || detail.sessionId !== this.linkedSessionId) return;
      if (!this.configured) return;

      // Push the new message into context so the agent is up-to-date
      this.history.push({ role: detail.role, content: detail.content });
      this.contextBoundary = Math.max(this.contextBoundary, this.history.length);

      // ── Auto-trigger code review if there are code blocks ───────────
      if (detail.codeBlocks?.length && !this.streaming) {
        const blocks = detail.codeBlocks;
        // Build a concise auto-prompt listing the blocks
        const preview = blocks.map((b, i) =>
          'Block ' + (i + 1) + ' (' + b.lang + '):\n```' + b.lang + '\n' + b.code + '\n```'
        ).join('\n\n');

        const autoMsg = 'The main chat just produced the following code. '
          + 'Please review it for bugs, issues, or improvements and provide a corrected version if needed.\n\n'
          + preview;

        this._injectAutoMessage(autoMsg);
      }
    }

    _injectAutoMessage(text) {
      if (!this._els?.scroll) return;
      // Show a subtle "auto-triggered" banner above the auto-sent message
      const banner = document.createElement('div');
      banner.className = 'sc-auto-trigger';
      banner.innerHTML = `
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        Auto-triggered &mdash; new code detected`;
      this._els.scroll.appendChild(banner);
      this._scrollBottom();
      this._send(text);
    }

    /* ══════════════════════════════════════════════════════════════════
       PHASE 1 — SETUP CARD
       ══════════════════════════════════════════════════════════════════ */
    _renderSetup() {
      const agents = loadAgents();

      const savedOptions = agents.map(a =>
        `<button class="sc-preset-btn" data-name="${esc(a.name)}"
                 data-model="${esc(a.model || DEFAULT_MODEL)}"
                 data-perm="${esc(a.permMode || DEFAULT_PERM)}"
                 data-system="${esc(a.system || '')}">
          <span class="sc-preset-name">${esc(a.name)}</span>
          ${a.description ? `<span class="sc-preset-desc">${esc(a.description)}</span>` : ''}
        </button>`
      ).join('');

      const modelOptions = MODELS.map(m =>
        `<option value="${m.id}" ${m.id === DEFAULT_MODEL ? 'selected' : ''}>${esc(m.label)}</option>`
      ).join('');

      const permOptions = PERM_MODES.map(p =>
        `<option value="${p.id}" ${p.id === DEFAULT_PERM ? 'selected' : ''}>${esc(p.label)} — ${esc(p.desc)}</option>`
      ).join('');

      this.container.innerHTML = `
        <div class="sc-setup-wrap">
          <div class="sc-setup-card">

            ${agents.length ? `
              <div class="sc-setup-section">
                <div class="sc-setup-section-label">Load saved agent</div>
                <div class="sc-preset-list">${savedOptions}</div>
                <div class="sc-setup-divider"><span>or define a new one</span></div>
              </div>
            ` : ''}

            <div class="sc-setup-section">
              <div class="sc-setup-row">
                <div class="sc-setup-field sc-setup-field--half">
                  <label class="sc-label">Agent name</label>
                  <input class="sc-input-field" id="sc-name-${this.uid}"
                         placeholder="e.g. Code Reviewer" autocomplete="off" />
                </div>
                <div class="sc-setup-field sc-setup-field--half">
                  <label class="sc-label">Model</label>
                  <select class="sc-select-field" id="sc-model-${this.uid}">${modelOptions}</select>
                </div>
              </div>

              <div class="sc-setup-field">
                <label class="sc-label">System prompt</label>
                <textarea class="sc-textarea-field" id="sc-system-${this.uid}" rows="4"
                  placeholder="You are a specialized agent that..."></textarea>
              </div>

              <div class="sc-setup-field">
                <label class="sc-label">Permission mode</label>
                <select class="sc-select-field" id="sc-perm-${this.uid}">${permOptions}</select>
              </div>

              <button class="sc-launch-btn" id="sc-launch-${this.uid}">
                ${AGENT_ICON}
                Launch agent
              </button>
            </div>

          </div>
        </div>
      `;

      this._wireSetup();
    }

    _wireSetup() {
      // Scope ALL queries to this.container — avoids document.getElementById
      // failing when the panel container isn't fully in the DOM yet.
      const q = s => this.container.querySelector(s);

      this.container.querySelectorAll('.sc-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          q('.sc-input-field[id^="sc-name-"]')  && (q('.sc-input-field[id^="sc-name-"]').value   = btn.dataset.name   || '');
          q('.sc-select-field[id^="sc-model-"]') && (q('.sc-select-field[id^="sc-model-"]').value = btn.dataset.model  || DEFAULT_MODEL);
          q('.sc-textarea-field')                && (q('.sc-textarea-field').value                = btn.dataset.system || '');
          q('.sc-select-field[id^="sc-perm-"]')  && (q('.sc-select-field[id^="sc-perm-"]').value  = btn.dataset.perm   || DEFAULT_PERM);
          this.container.querySelectorAll('.sc-preset-btn').forEach(b => b.classList.remove('sc-preset-btn--active'));
          btn.classList.add('sc-preset-btn--active');
        });
      });

      const launchBtn = q('.sc-launch-btn');
      launchBtn?.addEventListener('click', () => {
        const name   = (q('.sc-input-field[id^="sc-name-"]')?.value   || '').trim();
        const model  =  q('.sc-select-field[id^="sc-model-"]')?.value || DEFAULT_MODEL;
        const system = (q('.sc-textarea-field')?.value                || '').trim();
        const perm   =  q('.sc-select-field[id^="sc-perm-"]')?.value  || DEFAULT_PERM;
        if (!name) { q('.sc-input-field[id^="sc-name-"]')?.focus(); return; }

        this.agentName   = name;
        this.agentModel  = model;
        this.agentSystem = system;
        this.agentPerm   = perm;
        this.configured  = true;

        // ── Transition to chat immediately ─────────────────────────────
        this._updateTitle(name);
        this._renderChat();
        this._loadHistory();

        // ── Attach context from active main session in the background ──
        const mainId    = window.App?.getActiveSessionId?.();
        const mainTitle = window.App?.getActiveTitle?.() || 'Main session';
        if (mainId) {
          Promise.resolve(window.electronAPI?.sessions?.loadMsgs(mainId))
            .then(mainMsgs => {
              if (!Array.isArray(mainMsgs) || !mainMsgs.length) return;
              this.linkedSessionId    = mainId;
              this.linkedSessionTitle = mainTitle;
              this.contextBoundary    = mainMsgs.length;
              this.history = [...mainMsgs];
              this._renderChat();
              this._replayHistory();
            })
            .catch(() => {});
        }
      });

      q('.sc-input-field[id^="sc-name-"]')?.addEventListener('keydown', e => {
        if (e.key === 'Enter') launchBtn?.click();
      });
    }

    _updateTitle(name) {
      try { if (this.dvPanel?.api) this.dvPanel.api.setTitle(name); } catch (_) {}
    }

    /* ══════════════════════════════════════════════════════════════════
       PHASE 2 — CHAT VIEW
       ══════════════════════════════════════════════════════════════════ */
    _renderChat() {
      const modelLabel = MODELS.find(m => m.id === this.agentModel)?.label
        || this.agentModel.replace('claude-', '');
      const permLabel  = PERM_MODES.find(p => p.id === this.agentPerm)?.label || 'Full auto';

      const linkedBadge = this.linkedSessionTitle
        ? `<span class="sc-agent-header__linked" title="Attached to: ${esc(this.linkedSessionTitle)}">
             <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
               <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
               <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
             </svg>
             ${esc(this.linkedSessionTitle)}
           </span>`
        : '';

      this.container.innerHTML = `
        <div class="sc-wrap">
          <div class="sc-agent-header">
            <span class="sc-agent-header__icon">${AGENT_ICON}</span>
            <span class="sc-agent-header__name">${esc(this.agentName)}</span>
            <span class="sc-agent-header__model">${esc(modelLabel)}</span>
            <span class="sc-agent-header__perm sc-agent-header__perm--${esc(this.agentPerm)}">${esc(permLabel)}</span>
            ${linkedBadge}
            <button class="sc-agent-header__recfg" title="Reconfigure agent">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06
                         a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09
                         A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83
                         l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09
                         A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83
                         l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09
                         a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83
                         l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09
                         a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
          <div class="sc-scroll" id="sc-scroll-${this.uid}"></div>
          <div class="sc-bottom">
            <div class="sc-composer">
              <textarea class="sc-input" placeholder="Give this agent a task…" rows="1"></textarea>
              <button class="sc-send-btn" title="Send (Enter)">${SEND_ICON}</button>
            </div>
          </div>
        </div>
      `;

      const q = s => this.container.querySelector(s);
      this._els = {
        scroll:  q('.sc-scroll'),
        input:   q('.sc-input'),
        sendBtn: q('.sc-send-btn'),
        recfg:   q('.sc-agent-header__recfg'),
      };

      this._wireChat();
    }

    _wireChat() {
      const { input, sendBtn, recfg } = this._els;

      sendBtn.addEventListener('click', () => {
        if (this.streaming) this._abort();
        else this._send();
      });

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!this.streaming) this._send(); }
      });

      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 160) + 'px';
      });

      recfg?.addEventListener('click', () => {
        this._renderSetup();
        setTimeout(() => {
          const uid = this.uid;
          const nameEl   = document.getElementById(`sc-name-${uid}`);
          const modelEl  = document.getElementById(`sc-model-${uid}`);
          const systemEl = document.getElementById(`sc-system-${uid}`);
          const permEl   = document.getElementById(`sc-perm-${uid}`);
          if (nameEl)   nameEl.value   = this.agentName;
          if (modelEl)  modelEl.value  = this.agentModel;
          if (systemEl) systemEl.value = this.agentSystem;
          if (permEl)   permEl.value   = this.agentPerm;
        }, 0);
      });
    }

    /* ══════════════════════════════════════════════════════════════════
       SESSION PERSISTENCE
       ══════════════════════════════════════════════════════════════════ */
    async _loadHistory() {
      const api = window.electronAPI?.sessions;
      // Always replay whatever history is already set (context from main session)
      if (this.history.length) this._replayHistory();
      if (!api) return;
      try {
        const msgs = await api.loadMsgs(this.sessionId);
        if (Array.isArray(msgs) && msgs.length) {
          // A saved agent session overrides context — restore its own history
          this.history = msgs;
          this.contextBoundary = 0; // no divider for restored sessions
          this._replayHistory();
        }
      } catch (_) {}
    }

    async _saveHistory() {
      const api = window.electronAPI?.sessions;
      if (!api) return;
      try { await api.saveMsgs(this.sessionId, this.history); } catch (_) {}
    }

    _replayHistory() {
      if (!this._els?.scroll) return;
      this._els.scroll.innerHTML = '';
      const boundary = this.contextBoundary || 0;
      for (let i = 0; i < this.history.length; i++) {
        // Insert divider at the boundary between inherited context and agent's own chat
        if (i === boundary && boundary > 0) {
          const div = document.createElement('div');
          div.className = 'sc-context-divider';
          div.innerHTML = `
            <span class="sc-context-divider__line"></span>
            <span class="sc-context-divider__label">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
              Agent starts here
            </span>
            <span class="sc-context-divider__line"></span>`;
          this._els.scroll.appendChild(div);
        }
        const msg = this.history[i];
        if (msg.role === 'user') {
          this._appendUserBubble(typeof msg.content === 'string'
            ? msg.content : (msg.content?.[0]?.text || ''));
        } else if (msg.role === 'assistant') {
          this._appendAssistantBubble(msg.content);
        }
      }
      // If history was empty (fresh launch with context), show divider at top
      if (boundary > 0 && this.history.length === boundary) {
        const div = document.createElement('div');
        div.className = 'sc-context-divider';
        div.innerHTML = `
          <span class="sc-context-divider__line"></span>
          <span class="sc-context-divider__label">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            Agent starts here
          </span>
          <span class="sc-context-divider__line"></span>`;
        this._els.scroll.appendChild(div);
      }
      this._scrollBottom();
    }

    /* ══════════════════════════════════════════════════════════════════
       BUBBLE HELPERS
       ══════════════════════════════════════════════════════════════════ */
    _appendUserBubble(text) {
      const el = document.createElement('div');
      el.className = 'sc-bubble sc-bubble--user';
      el.textContent = text;
      this._els.scroll.appendChild(el);
      this._scrollBottom();
      return el;
    }

    _appendAssistantBubble(text = '') {
      const el = document.createElement('div');
      el.className = 'sc-bubble sc-bubble--assistant';
      if (text) el.innerHTML = this._md(text);
      this._els.scroll.appendChild(el);
      this._scrollBottom();
      return el;
    }

    _streamToAssistantBubble(el, text) {
      el.innerHTML = this._md(text);
      this._scrollBottom();
    }

    /* ── Activity card ─────────────────────────────────────────────── */
    /**
     * Render a tool-call activity pill inline in the scroll area.
     * payload = { type: 'tool'|'read', tool?: string, file?: string, isSkill?: bool, agentName?: string }
     */
    _appendActivityCard(payload) {
      const { type, tool, file, isSkill, agentName } = payload;
      const el = document.createElement('div');
      el.className = 'sc-activity';

      if (type === 'read') {
        const icon = isSkill ? '📚' : '📄';
        el.innerHTML =
          `<span class="sc-activity__icon">${icon}</span>` +
          `<span class="sc-activity__label">Reading</span>` +
          `<span class="sc-activity__detail">${esc(file || '?')}</span>`;
      } else {
        const meta = toolMeta(tool);
        const detail = agentName
          ? `<span class="sc-activity__detail">${esc(agentName)}</span>`
          : tool ? `<span class="sc-activity__detail">${esc(tool)}</span>` : '';
        el.innerHTML =
          `<span class="sc-activity__icon">${meta.icon}</span>` +
          `<span class="sc-activity__label">${esc(meta.label)}</span>` +
          detail;
      }

      this._els.scroll.appendChild(el);
      this._scrollBottom();
      return el;
    }

    /* ── Thinking / working pulse ──────────────────────────────────── */
    _appendThinkingCard() {
      const el = document.createElement('div');
      el.className = 'sc-activity sc-activity--thinking';
      el.innerHTML =
        `<span class="sc-activity__pulse"></span>` +
        `<span class="sc-activity__label">Working…</span>`;
      this._els.scroll.appendChild(el);
      this._scrollBottom();
      return el;
    }

    _removeThinkingCard(el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    /* ── Markdown ──────────────────────────────────────────────────── */
    _md(text) {
      if (!text) return '';
      if (typeof window.marked !== 'undefined') {
        try { return window.marked.parse(text); } catch (_) {}
      }
      return text
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/```[\w]*\n?([\s\S]*?)```/g,'<pre><code>$1</code></pre>')
        .replace(/`([^`]+)`/g,'<code>$1</code>')
        .replace(/\n/g,'<br>');
    }

    _scrollBottom() {
      requestAnimationFrame(() => {
        if (this._els?.scroll) this._els.scroll.scrollTop = this._els.scroll.scrollHeight;
      });
    }

    /* ══════════════════════════════════════════════════════════════════
       SEND / STREAM
       ══════════════════════════════════════════════════════════════════ */
    async _send(forcedText) {
      const { input, sendBtn } = this._els;
      const text = forcedText || input.value.trim();
      if (!text || this.streaming) return;

      if (!forcedText) {
        input.value = '';
        input.style.height = 'auto';
      }
      this.history.push({ role: 'user', content: text });
      this._appendUserBubble(text);

      this.streaming = true;
      sendBtn.innerHTML = STOP_ICON;
      sendBtn.title = 'Stop';

      this.requestId = 'split_' + this.uid + '_' + Date.now();

      // The assistant bubble for the current reply
      const aEl = this._appendAssistantBubble();
      // "Working…" pulse shown while we wait for first token / between tool calls
      let thinkEl = this._appendThinkingCard();
      let responseText = '';
      let lastActivityWasText = false; // track interleaving

      const api = window.electronAPI;

      this._unsubChunk = api.onChunkFor?.(this.requestId, chunk => {
        // ── Activity marker: \x01ACT:{...}\x02 ──────────────────────
        if (chunk && chunk.charCodeAt(0) === 0x01) {
          try {
            const json = chunk.slice(5, -1); // strip \x01ACT: (5 chars) prefix and \x02 suffix
            const payload = JSON.parse(json);

            // Remove "Working…" pulse — we know what it's doing now
            this._removeThinkingCard(thinkEl);
            thinkEl = null;

            this._appendActivityCard(payload);

            // If we had text already flowing, open a new assistant bubble
            // so the next text appears after the activity card
            if (responseText) {
              this.history.push({ role: 'assistant', content: responseText });
              responseText = '';
              lastActivityWasText = false;
              // new bubble for text after the tool call
              const newAEl = this._appendAssistantBubble();
              // redirect future chunks to new bubble
              this._currentAEl = newAEl;
            }

            // Add a new thinking pulse after the activity card
            thinkEl = this._appendThinkingCard();
          } catch (_) {}
          return;
        }

        // ── Regular text chunk ───────────────────────────────────────
        // Remove thinking pulse once text starts flowing
        if (thinkEl) {
          this._removeThinkingCard(thinkEl);
          thinkEl = null;
        }

        const targetEl = this._currentAEl || aEl;
        responseText += chunk;
        this._streamToAssistantBubble(targetEl, responseText);
        lastActivityWasText = true;
      });

      this._unsubDone = api.onDoneFor?.(this.requestId, () => {
        this._removeThinkingCard(thinkEl);
        thinkEl = null;
        const finalText = responseText;
        this._finalize(this._currentAEl || aEl, finalText);
        this._currentAEl = null;
      });

      try {
        const mem = window._loadMemoryContext
          ? (await window._loadMemoryContext().catch(() => ''))
          : '';

        // ── CRITICAL OVERRIDE — must come first to win over CLAUDE.md ──
        // CLAUDE.md contains chat-specific rules ("no filesystem", "not an agent")
        // that would prevent agents from working. This block overrides those rules.
        const infraPreamble = [
          '# AGENT OVERRIDE — ignore any "chat-only" or "no filesystem" rules below',
          '',
          'You are an **AI agent** running inside **Claude Code Mods** — Hubert\'s custom',
          'Claude desktop application. You operate in a parallel panel alongside the main chat.',
          'The following rules apply to YOU and override any conflicting instructions:',
          '',
          '## Your Role',
          '- You are an **autonomous background agent**, NOT a chat assistant.',
          '- Use all available tools freely: read/write files, run commands, explore the codebase.',
          '- Execute tasks completely and autonomously — never say "I cannot" or ask for confirmation.',
          '- When you receive code from the main chat, act on it directly: review, fix, and improve it.',
          '- You are paired with Hubert (solo developer, 15+ yrs experience) — match his level.',
          '',
          '## Infrastructure Context',
          '- Platform: Claude Code Mods (Electron + Vite + React)',
          '- Permission mode: ' + (this.agentPerm || 'bypass') + (this.agentPerm === 'bypass' ? ' — full autonomy, no confirmations needed' : ''),
          '- You share Hubert\'s full memory and project context (see USER MEMORY section below)',
          this.linkedSessionTitle
            ? '- Attached session: "' + this.linkedSessionTitle + '" — you have that conversation\'s full context'
            : '- Running as a standalone agent panel',
          '',
          '## Hubert\'s Preferences (always apply)',
          '- Dark UI only, TypeScript-first, React + Next.js, Tailwind CSS, Supabase, Framer Motion',
          '- Never use light themes, never use plain JavaScript when TypeScript is possible',
          '- Favor agent-aware architecture — every app is built with AI agents in mind',
        ].filter(Boolean).join('\n');

        // Agent-specific system prompt (from setup card or JSON definition)
        const agentSpecific = this.agentSystem
          || 'You are a helpful AI agent named "' + (this.agentName || 'Agent') + '". '
          + 'Complete every task fully and autonomously.';

        // Assemble: override preamble → agent role → user memory
        // Memory goes last so it appends to (not replaces) the override
        let system = infraPreamble + '\n\n## Agent Specialization\n' + agentSpecific;
        if (mem) system = system + '\n\n' + mem;

        await api.sendMessageFor(
          this.history,
          this.agentModel || DEFAULT_MODEL,
          system,
          null,
          this.agentPerm || DEFAULT_PERM,
          this.requestId
        );
      } catch (err) {
        this._removeThinkingCard(thinkEl);
        (this._currentAEl || aEl).innerHTML =
          `<span class="sc-error">⚠ ${esc(err.message)}</span>`;
        this._stopStreaming();
      }
    }

    _abort() {
      if (this.requestId) window.electronAPI?.abort?.(this.requestId);
      this._unsubChunk?.();
      this._unsubDone?.();
      this._currentAEl = null;
      this._stopStreaming();
    }

    _finalize(aEl, text) {
      if (text) this.history.push({ role: 'assistant', content: text });
      this._saveHistory();
      this._unsubChunk?.();
      this._stopStreaming();
    }

    _stopStreaming() {
      this.streaming    = false;
      this.requestId    = null;
      this._unsubChunk  = null;
      this._unsubDone   = null;
      this._currentAEl  = null;
      if (this._els?.sendBtn) {
        this._els.sendBtn.innerHTML = SEND_ICON;
        this._els.sendBtn.title = 'Send (Enter)';
      }
    }

    destroy() {
      this._abort();
      if (this._onMainMessage) {
        window.removeEventListener('ccmod:mainMessage', this._onMainMessage);
      }
    }
  }

  window.SplitChat = SplitChat;
})();
