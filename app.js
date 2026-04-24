// Pull the icons API from window — avoids name collisions with icons.js.
// `renderIcons` and `ICONS` are local aliases, re-read at runtime.
var renderIcons = window.renderIcons;
var ICONS = window.ICONS;

// ---------- i18n ----------
const I18N = {
  'en-US': {
    // Sidebar / shell
    search_sessions: 'Search sessions…',
    quick_actions: 'Quick actions',
    new_session: 'New session',
    routines: 'Routines',
    dispatch: 'Dispatch',
    customize: 'Customize',
    pinned: 'Pinned',
    projects: 'Projects',
    recent: 'Recent',
    tab_chat: 'Chat',
    tab_tasks: 'Tasks',
    tab_code: 'Code',
    collapse_sidebar: 'Collapse sidebar',
    expand_sidebar:   'Expand sidebar',
    // Chat empty state + composer
    empty_prompt: 'How can I help you today?',
    empty_hint: 'Type',
    empty_hint_suffix: 'for commands',
    composer_placeholder: 'Type / for commands',
    send: 'Send',
    // Settings tree sections
    session: 'Session',
    permissions: 'Permissions',
    model: 'Model',
    microphone: 'Microphone',
    insert: 'Insert',
    language: 'Language',
    // Permission modes
    perm_default:  'Prompt for every tool',
    perm_accept:   'Accept edits',
    perm_plan:     'Plan mode',
    perm_bypass:   'Skip permissions',
    perm_default_d:'Prompt for every action',
    perm_accept_d: 'Auto-accept file edits',
    perm_plan_d:   'Planning only — no edits',
    perm_bypass_d: 'Skip all prompts',
    // Session actions
    rename: 'Rename', duplicate: 'Duplicate', vscode: 'VS Code',
    archive: 'Archive', delete: 'Delete',
    pin: 'Pin', unpin: 'Unpin', mark_unread: 'Mark as unread', fork: 'Fork',
    // Attach / insert
    att_computer: 'From computer', att_files: 'Add files', att_image: 'Paste image',
    att_github: 'From GitHub', att_context: 'Add context', att_mcp: 'MCP tool',
    // Model effort
    eff_faible:'Low', eff_moyen:'Medium', eff_elevee:'High', eff_tres_eleve:'Very high', eff_max:'Max',
    // Mic
    mic_hold: 'Hold to record.',
    mic_default_device: 'Default',
    // User menu
    settings: 'Settings', get_help: 'Get help', view_plans: 'View all plans',
    get_apps: 'Get apps and extensions', gift_claude: 'Gift Claude', learn_more: 'Learn more', log_out: 'Log out',
    // Tokens
    context_window: 'Context window', plan_usage: 'Plan usage',
    limit_5h: '5-hour limit', weekly_all: 'Weekly · all models',
    weekly_design: 'Weekly · Claude Design', sonnet_only: 'Sonnet only',
    resets_in: 'Resets in',
    // Right panel
    rp_apercu: 'Preview', rp_diff: 'Diff', rp_terminal: 'Terminal',
    rp_fichiers: 'Files', rp_taches: 'Tasks', rp_plan: 'Plan',
    rp_shortcuts: 'Keyboard shortcuts',
    rp_mcp: 'MCP', rp_git: 'Git', rp_context: 'Context',
    rp_placeholder: 'placeholder content',
    // Appearance
    theme: 'Theme', font: 'Font',
    th_light: 'Light', th_dark: 'Dark', th_system: 'Match system',
    ft_anthropic: 'Anthropic Sans', ft_system: 'System',
    show_cmd_hint: 'Show "Type / for commands" hint',
  },
  'fr-FR': {
    search_sessions: 'Rechercher des sessions…',
    quick_actions: 'Actions rapides',
    new_session: 'Nouvelle session',
    routines: 'Routines',
    dispatch: 'Envoyer',
    customize: 'Personnaliser',
    pinned: 'Épinglé',
    projects: 'Projets',
    recent: 'Récent',
    tab_chat: 'Chat',
    tab_tasks: 'Tâches',
    tab_code: 'Code',
    collapse_sidebar: 'Réduire la barre latérale',
    expand_sidebar:   'Agrandir la barre latérale',
    empty_prompt: 'Comment puis-je vous aider aujourd\u2019hui ?',
    empty_hint: 'Tapez',
    empty_hint_suffix: 'pour les commandes',
    composer_placeholder: 'Tapez / pour les commandes',
    send: 'Envoyer',
    session: 'Session', permissions: 'Permissions', model: 'Modèle',
    microphone: 'Microphone', insert: 'Insérer', language: 'Langue',
    perm_default: 'Demander à chaque outil', perm_accept: 'Accepter les modifications',
    perm_plan: 'Mode plan', perm_bypass: 'Ignorer les permissions',
    perm_default_d: 'Confirmer chaque action', perm_accept_d: 'Acceptation automatique des modifications',
    perm_plan_d: 'Planification uniquement — aucune modification', perm_bypass_d: 'Ignorer toutes les invites',
    rename: 'Renommer', duplicate: 'Dupliquer', vscode: 'VS Code',
    archive: 'Archiver', delete: 'Supprimer',
    pin: 'Épingler', unpin: 'Désépingler', mark_unread: 'Marquer comme non lu', fork: 'Dupliquer la conversation',
    att_computer: 'Depuis l\u2019ordinateur', att_files: 'Ajouter des fichiers', att_image: 'Coller une image',
    att_github: 'Depuis GitHub', att_context: 'Ajouter du contexte', att_mcp: 'Outil MCP',
    eff_faible:'Faible', eff_moyen:'Moyen', eff_elevee:'Élevée', eff_tres_eleve:'Très élevé', eff_max:'Max',
    mic_hold: 'Maintenez pour enregistrer.',
    mic_default_device: 'Par défaut',
    settings: 'Paramètres', get_help: 'Obtenir de l\u2019aide', view_plans: 'Voir tous les forfaits',
    get_apps: 'Applis et extensions', gift_claude: 'Offrir Claude', learn_more: 'En savoir plus', log_out: 'Se déconnecter',
    context_window: 'Fenêtre de contexte', plan_usage: 'Utilisation du forfait',
    limit_5h: 'Limite de 5 heures', weekly_all: 'Hebdomadaire · tous les modèles',
    weekly_design: 'Hebdomadaire · Claude Design', sonnet_only: 'Sonnet seulement',
    resets_in: 'Réinitialise dans',
    rp_apercu: 'Aperçu', rp_diff: 'Diff', rp_terminal: 'Terminal',
    rp_fichiers: 'Fichiers', rp_taches: 'Tâches', rp_plan: 'Plan',
    rp_shortcuts: 'Raccourcis clavier',
    rp_mcp: 'MCP', rp_git: 'Git', rp_context: 'Contexte',
    rp_placeholder: 'contenu de démonstration',
    theme: 'Thème', font: 'Police',
    th_light: 'Clair', th_dark: 'Sombre', th_system: 'Système',
    ft_anthropic: 'Anthropic Sans', ft_system: 'Système',
    show_cmd_hint: 'Afficher l\u2019indication « Tapez / pour les commandes »',
  },
};
function t(key) {
  const dict = I18N[userState?.language] || I18N['en-US'];
  return dict[key] ?? I18N['en-US'][key] ?? key;
}

// Re-apply language to all static DOM (elements that aren't rebuilt by render()).
function applyLanguage() {
  // Header tabs
  const tabs = document.querySelectorAll('aside header .tab');
  if (tabs[0]) tabs[0].title = t('tab_chat');
  if (tabs[1]) tabs[1].title = t('tab_tasks');
  if (tabs[2]) { tabs[2].title = t('tab_code'); tabs[2].querySelector('span').textContent = t('tab_code'); }
  const toggle = document.getElementById('sidebar-toggle');
  if (toggle) toggle.title = document.getElementById('sidebar').classList.contains('is-collapsed') ? t('expand_sidebar') : t('collapse_sidebar');
  // Search placeholder
  const search = document.getElementById('search');
  if (search) search.placeholder = t('search_sessions');
  // Quick-actions label + items
  const navLabel = document.querySelector('#nav-group .nav-group__label');
  if (navLabel) navLabel.textContent = t('quick_actions');
  const navSpans = document.querySelectorAll('#nav-group .nav-group__inner .nav-item > span:first-of-type');
  if (navSpans[0]) navSpans[0].textContent = t('new_session');
  if (navSpans[1]) navSpans[1].textContent = t('routines');
  if (navSpans[2]) navSpans[2].textContent = t('dispatch');
  if (navSpans[3]) navSpans[3].textContent = t('customize');
  // Section toggle labels
  const pinnedBtn   = document.querySelector('[data-collapse="pinned"] .collapsible__toggle > span:not(.collapsible__chev):not(.count)');
  if (pinnedBtn) pinnedBtn.textContent = t('pinned');
  const projectsBtn = document.querySelector('[data-collapse="projects"] .collapsible__toggle > span:not(.collapsible__chev):not(.count)');
  if (projectsBtn) projectsBtn.textContent = t('projects');
  const recentBtn   = document.querySelector('[data-collapse="recent"] .collapsible__toggle > span:not(.collapsible__chev):not(.count)');
  if (recentBtn) recentBtn.textContent = t('recent');
  // Empty chat state — scope to the empty-state container, NOT the hero title
  const emptyTitle = document.querySelector('#chat-scroll .chat-empty .font-serif');
  if (emptyTitle) emptyTitle.textContent = t('empty_prompt');
  const emptyHint = document.querySelector('#chat-scroll .chat-empty .mt-2');
  if (emptyHint) emptyHint.innerHTML = `${t('empty_hint')} <span class="kbd">/</span> ${t('empty_hint_suffix')}`;
  // Composer placeholder
  const input = document.getElementById('composer-input');
  if (input) input.placeholder = t('composer_placeholder');
  // Right panel title (sync current)
  const rpTitle = document.getElementById('right-panel-title');
  if (rpTitle) rpTitle.textContent = t('rp_' + (currentRightPanel || 'apercu'));
}

// ---------- Session persistence layer ----------
// Sessions and their message histories are persisted to localStorage.
// Key "ccmod.sessions"  → array of session metadata (id, title, pinned, ts, projectId)
// Key "ccmod.msgs.<id>" → JSON array of {role,content} messages for that session
// Key "ccmod.state"     → {activeId, projects}

const PROJECT_COLORS = ['#c96442', '#d97757', '#6a86c3', '#7ab389', '#b48ead', '#c9a96e', '#5aa1a1'];

// System prompt injected on every new CLI session (first turn only).
// Prevents the CLI's default agent behaviour (filesystem exploration, tool use)
// and keeps it in direct chat mode — answering and generating code immediately.
const CHAT_SYSTEM_PROMPT = `You are Claude, a helpful AI assistant running inside a desktop chat application.

IMPORTANT RULES:
- You are in a CHAT interface, not a coding agent. There is no project, no filesystem, no codebase to explore.
- Respond directly and immediately. Never say "let me explore the project" or "let me check the current setup" — there is nothing to explore.
- When asked to generate code, produce complete, working code immediately in a single code block.
- When asked to create UI components, generate the full HTML/CSS/JSX code right away.
- Be conversational, concise, and helpful. Markdown is rendered — use it freely.
- Do NOT use bash commands or try to read/write files. Just respond.

PLAN PANEL — TodoWrite:
- This app has a Plan panel (right side) that displays a live task board fed by TodoWrite.
- When the user asks you to "create a plan", "put it in the plan panel", "show tasks", or anything similar → call TodoWrite IMMEDIATELY with the tasks. Never ask for clarification first.
- If the user references something from earlier in the conversation (e.g. "it", "the plan above", "that list") → use those items as your TodoWrite tasks. Re-read the conversation history and act.
- For any multi-step task (3+ steps), proactively call TodoWrite at the start, then update statuses as you complete each step.`;

const SESSION_KEY    = 'ccmod.sessions';
const STATE_META_KEY = 'ccmod.state';
const MAX_SESSIONS   = 60;

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function formatRelTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60_000)         return 'now';
  if (diff < 3_600_000)      return Math.floor(diff / 60_000) + 'm';
  if (diff < 86_400_000)     return Math.floor(diff / 3_600_000) + 'h';
  if (diff < 2 * 86_400_000) return 'Yesterday';
  return Math.floor(diff / 86_400_000) + 'd';
}

// Load or initialise persisted session list
function loadSessionList() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || []; }
  catch { return []; }
}
function saveSessionList(list) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(list.slice(0, MAX_SESSIONS))); }
  catch (e) { console.warn('[sessions] save failed', e); }
}

// Load/save per-session message history
function loadSessionMessages(id) {
  try { return JSON.parse(localStorage.getItem('ccmod.msgs.' + id)) || []; }
  catch { return []; }
}
function saveSessionMessages(id, msgs) {
  try { localStorage.setItem('ccmod.msgs.' + id, JSON.stringify(msgs)); }
  catch (e) { console.warn('[sessions] msgs save failed', e); }
}
function deleteSessionMessages(id) {
  try { localStorage.removeItem('ccmod.msgs.' + id); } catch {}
}

// Load or initialise the main app state (projects + activeId)
function loadStateMeta() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_META_KEY));
    if (saved) return saved;
  } catch {}
  return null;
}
function saveStateMeta() {
  try {
    localStorage.setItem(STATE_META_KEY, JSON.stringify({
      activeId:  state.activeId,
      projects:  state.projects.map(p => ({
        id: p.id, name: p.name, color: p.color, open: p.open,
        sessions: p.sessions.map(s => s.id),
      })),
    }));
  } catch (e) { console.warn('[state] save failed', e); }
}

// Build state from persisted data, falling back to defaults
(function initState() {
  const list    = loadSessionList();
  const meta    = loadStateMeta();

  // Build a map id → session for quick lookup
  const byId = Object.fromEntries(list.map(s => [s.id, s]));

  // Restore projects structure if we have saved meta
  let restoredProjects = null;
  if (meta?.projects?.length) {
    restoredProjects = meta.projects.map(p => ({
      id: p.id, name: p.name, color: p.color, open: p.open,
      sessions: (p.sessions || []).map(id => byId[id]).filter(Boolean),
    }));
  }

  // Restore pinned/recent from session list
  const pinnedSessions = list.filter(s => s.pinned);
  const recentSessions = list.filter(s => !s.pinned && !s.projectId)
                             .sort((a, b) => b.ts - a.ts)
                             .slice(0, 30);

  // If nothing saved yet, create a default first session
  if (!list.length) {
    const firstId = genId();
    const firstSession = { id: firstId, title: 'New session', ts: Date.now(), pinned: false };
    saveSessionList([firstSession]);
    window.__defaultState = {
      projects: [
        { id: 'p1', name: 'Claude Code Mod', color: '#c96442', open: true, sessions: [] },
        { id: 'p2', name: 'Crowbyte',         color: '#6a86c3', open: false, sessions: [] },
      ],
      pinned:   [],
      recent:   [firstSession],
      activeId: firstId,
    };
  } else {
    window.__defaultState = {
      projects: restoredProjects || [],
      pinned:   pinnedSessions,
      recent:   recentSessions,
      activeId: meta?.activeId || (recentSessions[0]?.id ?? pinnedSessions[0]?.id ?? list[0]?.id),
    };
  }
})();

const state = {
  projects: window.__defaultState.projects,
  pinned:   window.__defaultState.pinned,
  recent:   window.__defaultState.recent,
  activeId: window.__defaultState.activeId,
};
delete window.__defaultState;

// ── Session CRUD helpers ──────────────────────────────────────────────────────

function createNewSession({ projectId = null, title = 'New session' } = {}) {
  const id  = genId();
  const now = Date.now();
  const session = { id, title, ts: now, pinned: false, projectId };

  // Add to session list
  const list = loadSessionList();
  list.unshift(session);
  saveSessionList(list);
  saveSessionMessages(id, []);

  // Add to in-memory state
  if (projectId) {
    const proj = state.projects.find(p => p.id === projectId);
    if (proj) { proj.sessions.unshift(session); proj.open = true; }
  } else {
    state.recent.unshift(session);
  }

  return session;
}

function deleteSession(id) {
  deleteSessionMessages(id);
  const list = loadSessionList().filter(s => s.id !== id);
  saveSessionList(list);

  state.recent   = state.recent.filter(s => s.id !== id);
  state.pinned   = state.pinned.filter(s => s.id !== id);
  state.projects.forEach(p => { p.sessions = p.sessions.filter(s => s.id !== id); });

  if (state.activeId === id) {
    const next = state.recent[0] || state.pinned[0] || state.projects.flatMap(p => p.sessions)[0];
    if (next) {
      switchToSession(next.id);
    } else {
      const newS = createNewSession();
      switchToSession(newS.id);
    }
  } else {
    render(); // re-render sidebar to remove the row
  }
}

function updateSessionTitle(id, title) {
  const list = loadSessionList();
  const entry = list.find(s => s.id === id);
  if (entry) { entry.title = title; saveSessionList(list); }
  // Update in-memory
  const findInState = (arr) => arr.find(s => s.id === id);
  const s = findInState(state.recent) || findInState(state.pinned)
         || state.projects.flatMap(p => p.sessions).find(s => s.id === id);
  if (s) s.title = title;
}

function togglePinSession(id) {
  const list = loadSessionList();
  const entry = list.find(s => s.id === id);
  if (!entry) return;
  entry.pinned = !entry.pinned;
  saveSessionList(list);
  // Rebuild pinned/recent in memory
  state.pinned = list.filter(s => s.pinned && !s.projectId);
  state.recent = list.filter(s => !s.pinned && !s.projectId).sort((a,b) => b.ts - a.ts).slice(0, 30);
  render();
}

// (deleteSession above is the single authoritative implementation)

// ── Chat switching (the real work) ───────────────────────────────────────────

// Current in-memory messages (per-session). Exposed as window.__chatHistory
// so the initLiveChat IIFE can read/write it.
window.__chatHistory = loadSessionMessages(state.activeId);

function switchToSession(id, skipRender = false) {
  if (id === state.activeId) return;

  // Persist current session's messages before switching
  saveSessionMessages(state.activeId, window.__chatHistory || []);

  state.activeId = id;
  window.__chatHistory = loadSessionMessages(id);

  // Reset plan panel — each session has its own todo state
  window.__planTodos  = null;
  _planExpandedIdx    = -1;

  saveStateMeta();

  // Clear the chat view and repopulate
  _renderChatForSession(id);

  if (!skipRender) render();
}

function _renderChatForSession(id) {
  const conv   = document.querySelector('.chat-conversation');
  const scroll = document.getElementById('chat-scroll');
  if (!conv || !scroll) return;

  // Refresh aperçu panel if it's currently open (new session may have different code)
  if (document.body.classList.contains('right-panel-open') && currentRightPanel === 'apercu') {
    requestAnimationFrame(() => setRightPanelTab('apercu'));
  }

  const msgs = window.__chatHistory;
  const isEmpty = !msgs || msgs.length === 0;

  if (isEmpty) {
    // Show empty state
    const emptyHTML = scroll.querySelector('.chat-empty')?.outerHTML || '';
    conv.innerHTML = emptyHTML ? '' : '';
    // Re-inject empty state if it was removed
    if (!scroll.querySelector('.chat-empty')) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'chat-empty flex-1 flex flex-col items-center justify-center gap-3 select-none';
      emptyDiv.innerHTML = `
        <p class="font-serif text-[22px] text-ink-800">${document.querySelector('.chat-empty .font-serif')?.textContent || 'How can I help you today?'}</p>
        <p class="mt-2 text-ink-500 text-sm">${document.querySelector('.chat-empty .mt-2')?.innerHTML || 'Type <span class="kbd">/</span> for commands'}</p>
      `;
      scroll.insertBefore(emptyDiv, conv);
    }
    conv.innerHTML = '';
  } else {
    // Remove empty state
    scroll.querySelector('.chat-empty')?.remove();
    // Render all stored messages
    conv.innerHTML = '';
    const _md = window.mdToHtml || (s => `<pre>${escapeHTML(s)}</pre>`);
    msgs.forEach(m => {
      if (m.role === 'user') {
        const div = document.createElement('div');
        div.className = 'msg msg--user';
        div.innerHTML = `<div class="msg__body"><p>${escapeHTML(m.content)}</p></div>`;
        conv.appendChild(div);
      } else if (m.role === 'assistant') {
        const div = document.createElement('div');
        div.className = 'msg msg--assistant';
        div.innerHTML = `<div class="msg__avatar"></div><div class="msg__body">${_md(m.content)}</div>`;
        conv.appendChild(div);

        // Restore Plan panel from any ```plan block in this message
        const planTodos = typeof parsePlanBlock === 'function' ? parsePlanBlock(m.content) : null;
        if (planTodos?.length) {
          window.__planTodos = planTodos;
        }
      }
    });
    // Re-render icons for code blocks in restored messages
    requestAnimationFrame(() => {
      window.renderIcons?.();
      scroll.scrollTop = scroll.scrollHeight;
    });
  }
}

// ---------- Renderers ----------
const projectsEl = document.getElementById('projects-list');
const pinnedEl  = document.getElementById('pinned-list');
const recentEl  = document.getElementById('recent-list');
const pinnedCountEl = document.getElementById('pinned-count');
const recentCountEl = document.getElementById('recent-count');

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k === 'data') Object.entries(v).forEach(([dk, dv]) => n.dataset[dk] = dv);
    else n.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c == null) return;
    n.append(c.nodeType ? c : document.createTextNode(String(c)));
  });
  return n;
}

function iconSVG(name) {
  const icon = ICONS[name];
  if (!icon) return '';
  if (typeof icon === 'string') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="1em" height="1em" fill="currentColor">${icon}</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}" width="1em" height="1em" fill="${icon.color || 'currentColor'}"><path d="${icon.path}"/></svg>`;
}

function sessionRow(session, { showTime = true, accent = null } = {}) {
  const row = el('div', {
    class: 'session'
      + (session.id === state.activeId ? ' is-active' : '')
      + (session.processing ? ' is-processing' : ''),
    draggable: 'true',
    title: session.title,
    data: { sessionId: session.id, tooltip: session.title },
  });
  if (accent) row.style.setProperty('--accent', accent);
  row.innerHTML = `
    <span class="session__dot"></span>
    <span class="session__title">${escapeHTML(session.title)}</span>
    ${showTime ? `<span class="session__time">${escapeHTML(session.time || '')}</span>` : ''}
    <span class="session__actions">
      <button class="icon-btn icon-btn--sm" data-act="pin" title="Pin">${iconSVG('push-pin')}</button>
      <button class="icon-btn icon-btn--sm" data-act="more" title="More">${iconSVG('dots-three-vertical')}</button>
    </span>
  `;
  row.addEventListener('click', (e) => {
    if (e.target.closest('[data-act]')) return;
    if (row.querySelector('input.session__edit')) return;
    switchToSession(session.id);
    document.querySelectorAll('.session.is-active').forEach(el => el.classList.remove('is-active'));
    row.classList.add('is-active');
    document.querySelectorAll('.project.has-active').forEach(p => p.classList.remove('has-active'));
    row.closest('.project')?.classList.add('has-active');
    window.dispatchEvent(new CustomEvent('ccmod:render'));
  });
  row.addEventListener('dblclick', (e) => {
    if (e.target.closest('[data-act]')) return;
    e.preventDefault();
    startInlineRename(row, session);
  });
  row.addEventListener('contextmenu', (e) => showContextMenu(e, session));
  row.querySelector('[data-act="more"]').addEventListener('click', (e) => {
    e.stopPropagation();
    showContextMenu(e, session);
  });
  row.querySelector('[data-act="pin"]').addEventListener('click', (e) => {
    e.stopPropagation();
    togglePin(session.id);
  });
  // drag source
  row.addEventListener('dragstart', (e) => {
    row.classList.add('dragging');
    e.dataTransfer.setData('text/plain', session.id);
    e.dataTransfer.effectAllowed = 'move';
  });
  row.addEventListener('dragend', () => row.classList.remove('dragging'));
  return row;
}

function projectRow(project) {
  const head = el('div', { class: 'project__head', data: { tooltip: `${project.name} — ${project.sessions.length} conversation${project.sessions.length === 1 ? '' : 's'}` } });
  head.innerHTML = `
    <span class="project__chev">${iconSVG('caret-right')}</span>
    <button class="project__dot" data-role="color-swatch" title="${escapeHTML(project.name)} — ${project.sessions.length} conversation${project.sessions.length === 1 ? '' : 's'}" style="background:${project.color}"></button>
    <span class="project__name">${escapeHTML(project.name)}</span>
    <span class="project__count">${project.sessions.length}</span>
  `;
  const swatch = head.querySelector('[data-role="color-swatch"]');
  swatch.addEventListener('click', (e) => {
    e.stopPropagation();
    // In the collapsed icon-only sidebar the dot acts as a project picker, NOT a color picker.
    // Select the most recent session in this project so the chat jumps there.
    if (document.getElementById('sidebar').classList.contains('is-collapsed')) {
      const first = project.sessions[0];
      if (first) {
        state.activeId = first.id;
        document.querySelectorAll('.session.is-active').forEach(el => el.classList.remove('is-active'));
        document.querySelector(`.session[data-session-id="${first.id}"]`)?.classList.add('is-active');
        document.querySelectorAll('.project.has-active').forEach(p => p.classList.remove('has-active'));
        wrap.classList.add('has-active');
        window.dispatchEvent(new CustomEvent('ccmod:render'));
      }
      return;
    }
    showColorPicker(swatch, project);
  });
  const body = el('div', { class: 'project__body' });
  project.sessions.forEach(s => body.append(sessionRow(s, { showTime: false, accent: project.color })));
  const hasActive = project.sessions.some(s => s.id === state.activeId);
  const wrap = el('div', {
    class: 'project' + (project.open ? ' is-open' : '') + (hasActive ? ' has-active' : ''),
    data: { projectId: project.id },
  }, [head, body]);
  head.addEventListener('click', () => {
    project.open = !project.open;
    render();
  });
  head.addEventListener('contextmenu', (e) => showProjectMenu(e, project));

  // drop target: project
  wrap.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('text/plain')) return;
    e.preventDefault();
    wrap.classList.add('drag-over');
  });
  wrap.addEventListener('dragleave', (e) => {
    if (e.target === wrap || !wrap.contains(e.relatedTarget)) wrap.classList.remove('drag-over');
  });
  wrap.addEventListener('drop', (e) => {
    e.preventDefault();
    wrap.classList.remove('drag-over');
    const sessionId = e.dataTransfer.getData('text/plain');
    moveSessionToProject(sessionId, project.id);
  });
  return wrap;
}

function render() {
  // Pinned
  pinnedEl.innerHTML = '';
  state.pinned.forEach(s => pinnedEl.append(sessionRow(s, { showTime: true })));
  pinnedCountEl.textContent = state.pinned.length;

  // Projects
  projectsEl.innerHTML = '';
  state.projects.forEach(p => projectsEl.append(projectRow(p)));

  // Recent
  recentEl.innerHTML = '';
  state.recent.forEach(s => recentEl.append(sessionRow(s, { showTime: true })));
  recentCountEl.textContent = state.recent.length;

  renderIcons();
  installDropzones();
  applySearch();
  saveStateMeta();   // persist project open/close state + activeId
  window.dispatchEvent(new CustomEvent('ccmod:render'));
}

// ---------- Actions ----------
function findSession(id) {
  for (const p of state.projects) {
    const i = p.sessions.findIndex(s => s.id === id);
    if (i >= 0) return { list: p.sessions, index: i, source: p };
  }
  const pi = state.pinned.findIndex(s => s.id === id);
  if (pi >= 0) return { list: state.pinned, index: pi, source: 'pinned' };
  const ri = state.recent.findIndex(s => s.id === id);
  if (ri >= 0) return { list: state.recent, index: ri, source: 'recent' };
  return null;
}

function moveSessionToProject(sessionId, projectId) {
  const found = findSession(sessionId);
  if (!found) return;
  const target = state.projects.find(p => p.id === projectId);
  if (!target) return;
  if (found.list === target.sessions) return;
  const [session] = found.list.splice(found.index, 1);
  target.sessions.unshift(session);
  target.open = true;
  render();
}

function moveSessionToBucket(sessionId, bucket) {
  const found = findSession(sessionId);
  if (!found) return;
  const destList = bucket === 'pinned' ? state.pinned : state.recent;
  if (found.list === destList) return;
  const [session] = found.list.splice(found.index, 1);
  if (bucket === 'pinned') session.time = 'pinned';
  destList.unshift(session);
  render();
}

function togglePin(id) {
  togglePinSession(id);   // persist + rebuild state.pinned/recent
  const found = findSession(id);
  if (!found) return;
  if (found.source === 'pinned') {
    const [s] = state.pinned.splice(found.index, 1);
    s.time = 'now';
    state.recent.unshift(s);
  } else {
    const [s] = found.list.splice(found.index, 1);
    s.time = 'pinned';
    state.pinned.unshift(s);
  }
  render();
}

// deleteSession is defined once at the top of the session layer above.

function renameSession(id) {
  const row = document.querySelector(`.session[data-session-id="${id}"]`);
  const found = findSession(id);
  if (!found) return;
  if (row) startInlineRename(row, found.list[found.index]);
  else {
    const next = prompt('Rename session', found.list[found.index].title);
    if (next != null && next.trim()) {
      found.list[found.index].title = next.trim();
      updateSessionTitle(id, next.trim());
      render();
    }
  }
}

function startInlineRename(row, session) {
  const titleEl = row.querySelector('.session__title');
  if (!titleEl || row.querySelector('input.session__edit')) return;
  const current = session.title;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = current;
  input.className = 'session__edit';
  input.spellcheck = false;
  titleEl.replaceWith(input);
  input.focus();
  input.select();

  const commit = (save) => {
    if (!input.isConnected) return;
    const next = input.value.trim();
    if (save && next && next !== current) {
      session.title = next;
      updateSessionTitle(session.id, next);
    }
    render();
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(true); }
    else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
  });
  input.addEventListener('blur', () => commit(true));
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('dblclick', (e) => e.stopPropagation());
}

let _newProjectColor = '';
function createProject() { openNewProjectModal(); }

function openNewProjectModal() {
  _newProjectColor = PROJECT_COLORS[state.projects.length % PROJECT_COLORS.length];
  const modal = document.getElementById('new-project-modal');
  if (!modal) return;
  document.getElementById('new-project-name').value = '';
  _renderNewProjectSwatches();
  modal.classList.remove('hidden');
  requestAnimationFrame(() => document.getElementById('new-project-name').focus());
}
function closeNewProjectModal() {
  document.getElementById('new-project-modal')?.classList.add('hidden');
}
function _renderNewProjectSwatches() {
  const grid = document.getElementById('np-swatches');
  if (!grid) return;
  grid.innerHTML = PROJECT_COLORS.map(c => `
    <button class="np-swatch${c === _newProjectColor ? ' is-selected' : ''}"
            data-color="${c}" style="--c:${c}" type="button" aria-label="${c}"></button>
  `).join('');
  grid.querySelectorAll('.np-swatch').forEach(b => {
    b.addEventListener('click', () => {
      _newProjectColor = b.dataset.color;
      grid.querySelectorAll('.np-swatch').forEach(s => s.classList.remove('is-selected'));
      b.classList.add('is-selected');
    });
  });
}
function confirmNewProject() {
  const input = document.getElementById('new-project-name');
  const name = input?.value.trim();
  if (!name) { input?.focus(); input?.classList.add('is-error'); setTimeout(() => input?.classList.remove('is-error'), 600); return; }
  state.projects.unshift({ id: 'p' + Math.random().toString(36).slice(2, 8), name, color: _newProjectColor, open: true, sessions: [] });
  render();
  closeNewProjectModal();
}

function renameProject(project) {
  const next = prompt('Rename project', project.name);
  if (next != null && next.trim()) {
    project.name = next.trim();
    render();
  }
}

function deleteProject(project) {
  if (!confirm(`Delete project "${project.name}"? Sessions move to Recent.`)) return;
  state.recent.unshift(...project.sessions);
  state.projects = state.projects.filter(p => p.id !== project.id);
  render();
}

// ---------- Drop zones (pinned / recent) ----------
function installDropzones() {
  document.querySelectorAll('.dropzone').forEach(zone => {
    if (zone.dataset.dropzoneBound === '1') return;    // idempotent: only wire once
    zone.dataset.dropzoneBound = '1';
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();                               // always accept the drop
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', (e) => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const sessionId = e.dataTransfer.getData('text/plain');
      if (sessionId) moveSessionToBucket(sessionId, zone.dataset.bucket);
    });
  });
}

// ---------- Context menus ----------
const ctx = document.getElementById('ctxmenu');

function showContextMenu(e, session) {
  e.preventDefault();
  const found = findSession(session.id);
  const isPinned = found?.source === 'pinned';
  ctx.innerHTML = `
    <button data-act="pin">${iconSVG('push-pin')}<span>${isPinned ? t('unpin') : t('pin')}</span></button>
    <button data-act="unread">${iconSVG('eye')}<span>${t('mark_unread')}</span></button>
    <button data-act="rename">${iconSVG('pencil-simple')}<span>${t('rename')}</span></button>
    <button data-act="fork">${iconSVG('folders')}<span>${t('fork')}</span></button>
    <hr/>
    <button data-act="archive">${iconSVG('folder-simple')}<span>${t('archive')}</span></button>
    <button class="danger" data-act="delete">${iconSVG('trash')}<span>${t('delete')}</span></button>
  `;
  positionCtx(e);
  ctx.onclick = (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'pin')     togglePin(session.id);
    if (act === 'unread')  console.log('[stub] mark unread:', session.id);
    if (act === 'rename')  renameSession(session.id);
    if (act === 'fork')    duplicateSession(session.id);
    if (act === 'archive') deleteSession(session.id);
    if (act === 'delete')  deleteSession(session.id);
    hideCtx();
  };
}

function showProjectMenu(e, project) {
  e.preventDefault();
  ctx.innerHTML = `
    <button data-act="rename">${iconSVG('pencil-simple')}<span>Rename project…</span></button>
    <button data-act="new-session">${iconSVG('plus')}<span>New session in project</span></button>
    <hr/>
    <button class="danger" data-act="delete">${iconSVG('trash')}<span>Delete project</span></button>
  `;
  positionCtx(e);
  ctx.onclick = (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    if (btn.dataset.act === 'rename') renameProject(project);
    if (btn.dataset.act === 'delete') deleteProject(project);
    if (btn.dataset.act === 'new-session') {
      const s = createNewSession({ projectId: project.id, title: 'New session' });
      switchToSession(s.id);
      render();
    }
    hideCtx();
  };
}

function positionCtx(e) {
  ctx.classList.remove('hidden');
  const { innerWidth: vw, innerHeight: vh } = window;
  ctx.style.left = Math.min(e.clientX, vw - 220) + 'px';
  ctx.style.top  = Math.min(e.clientY, vh - 300) + 'px';
}
function hideCtx() { ctx.classList.add('hidden'); }
document.addEventListener('click', (e) => { if (!ctx.contains(e.target)) hideCtx(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideCtx(); });

// ---------- Search ----------
const searchInput = document.getElementById('search');
searchInput.addEventListener('input', applySearch);

function applySearch() {
  const q = searchInput.value.trim().toLowerCase();
  document.querySelectorAll('.session').forEach(row => {
    const t = row.querySelector('.session__title')?.textContent.toLowerCase() || '';
    row.style.display = (!q || t.includes(q)) ? '' : 'none';
  });
  // Auto-expand projects that contain a match
  if (q) {
    state.projects.forEach(p => {
      const has = p.sessions.some(s => s.title.toLowerCase().includes(q));
      const node = projectsEl.querySelector(`[data-project-id="${p.id}"]`);
      if (node) node.classList.toggle('is-open', has);
    });
  }
}

// ---------- Wire ----------
document.getElementById('new-project').addEventListener('click', createProject);

// New-project modal wiring
document.getElementById('new-project-modal')?.addEventListener('click', e => {
  if (e.target.closest('[data-close]')) closeNewProjectModal();
});
document.getElementById('np-confirm')?.addEventListener('click', confirmNewProject);
document.getElementById('new-project-name')?.addEventListener('keydown', e => {
  if (e.key === 'Enter')  { e.preventDefault(); confirmNewProject(); }
  if (e.key === 'Escape') closeNewProjectModal();
});

// File-tree toggle (delegated, for renderFilesPanel nodes)
document.getElementById('right-panel-body')?.addEventListener('click', e => {
  // File-tree expand/collapse
  const toggle = e.target.closest('[data-ft-toggle]');
  if (toggle) {
    const id = toggle.dataset.ftToggle;
    document.querySelector(`.ft-node[data-ft-id="${id}"]`)?.classList.toggle('is-open');
    return;
  }
  // Aperçu toolbar — Reload
  if (e.target.closest('#apercu-reload')) {
    const iframe = document.getElementById('apercu-iframe');
    if (iframe) { const src = iframe.srcdoc; iframe.srcdoc = ''; requestAnimationFrame(() => { iframe.srcdoc = src; }); }
    return;
  }
  // Aperçu toolbar — Fullscreen modal
  if (e.target.closest('#apercu-fullscreen')) {
    const block = getLastRenderableCodeBlock();
    if (block) openCodePreview(block.lang, block.code);
    return;
  }
});

// Sidebar collapse toggle (icon-only mode)
const sidebarEl = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const SIDEBAR_COLLAPSED_KEY = 'ccmod.sidebarCollapsed';
function setSidebarCollapsed(collapsed) {
  sidebarEl.classList.toggle('is-collapsed', collapsed);
  if (collapsed) {
    sidebarEl.style.width = '';                   // CSS rule (56px) takes over
  } else {
    const w = parseInt(localStorage.getItem('ccmod.sidebarWidth'), 10);
    sidebarEl.style.width = (w >= 220 && w <= 520) ? (w + 'px') : '';
  }
  sidebarToggle.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  sidebarToggle.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
}
if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1') setSidebarCollapsed(true);
sidebarToggle.addEventListener('click', () => {
  setSidebarCollapsed(!sidebarEl.classList.contains('is-collapsed'));
});

// Sidebar resize (drag right edge). Hidden handle, reveals on hover.
const resizer = document.getElementById('sidebar-resizer');
const SIDEBAR_WIDTH_KEY = 'ccmod.sidebarWidth';
const SIDEBAR_MIN = 220;
const SIDEBAR_MAX = 520;
const savedWidth = parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY), 10);
if (savedWidth >= SIDEBAR_MIN && savedWidth <= SIDEBAR_MAX && !sidebarEl.classList.contains('is-collapsed')) {
  sidebarEl.style.width = savedWidth + 'px';
}

let dragState = null;
resizer.addEventListener('mousedown', (e) => {
  e.preventDefault();
  const rect = sidebarEl.getBoundingClientRect();
  dragState = { startX: e.clientX, startW: rect.width };
  sidebarEl.classList.add('is-resizing');
  resizer.classList.add('is-dragging');
  document.body.classList.add('is-resizing-sidebar');
});
document.addEventListener('mousemove', (e) => {
  if (!dragState) return;
  const delta = e.clientX - dragState.startX;
  const w = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, dragState.startW + delta));
  sidebarEl.style.width = w + 'px';
});
document.addEventListener('mouseup', () => {
  if (!dragState) return;
  dragState = null;
  sidebarEl.classList.remove('is-resizing');
  resizer.classList.remove('is-dragging');
  document.body.classList.remove('is-resizing-sidebar');
  const w = parseInt(sidebarEl.style.width, 10);
  if (w) localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w));
});

// ── New session button (top of sidebar quick-actions) ────────────────────────
document.querySelector('.nav-item--primary')?.addEventListener('click', () => {
  const s = createNewSession({ title: 'New session' });
  switchToSession(s.id);
  render();
  // Focus composer
  setTimeout(() => document.getElementById('composer-input')?.focus(), 80);
});

// Collapsible nav group (quick actions)
const navGroup = document.getElementById('nav-group');
const navToggle = document.getElementById('nav-toggle');
const NAV_COLLAPSED_KEY = 'ccmod.navCollapsed';
if (localStorage.getItem(NAV_COLLAPSED_KEY) === '1') {
  navGroup.classList.add('is-collapsed');
  navToggle.title = 'Show quick actions';
}
navToggle.addEventListener('click', () => {
  const collapsed = navGroup.classList.toggle('is-collapsed');
  navToggle.title = collapsed ? 'Show quick actions' : 'Hide quick actions';
  localStorage.setItem(NAV_COLLAPSED_KEY, collapsed ? '1' : '0');
});

// ---------- Profile modal (Profile / Avatar / Greeting tabs) ----------
const profileState = {
  name:        localStorage.getItem('ccmod.profile.name')        || 'Hubert Larose Surprenant',
  email:       'hlarosesurprenant@gmail.com',
  avatarColor: localStorage.getItem('ccmod.profile.avatarColor') || '#c96442',
  avatarImage: localStorage.getItem('ccmod.profile.avatarImage') || null,  // data: URL when user uploaded a photo
  greeting:    localStorage.getItem('ccmod.profile.greeting')    || 'How can I help you today?',
};
const AVATAR_PALETTE = [
  '#c96442', '#d97757', '#e6b84f', '#7ab389', '#5aa1a1',
  '#6a86c3', '#8a6cc3', '#b48ead', '#c9a96e', '#8a8a92',
  '#f87171', '#ef9a65', '#facc15', '#4ade80', '#22d3ee', '#a78bfa',
];
const profileModal = document.getElementById('profile-modal');
const profileBody  = document.getElementById('profile-body');
const profileTabs  = document.getElementById('profile-tabs');
let profileActiveTab = 'profile';
// Draft holds staged changes until "Save" — so Cancel reverts cleanly.
let profileDraft = null;

function openProfileModal(tab = 'profile') {
  profileDraft = { ...profileState };
  profileActiveTab = tab;
  profileModal.classList.remove('hidden');
  profileTabs.querySelectorAll('button').forEach(b => b.classList.toggle('is-active', b.dataset.tab === tab));
  renderProfileBody();
}
function closeProfileModal() {
  profileModal.classList.add('hidden');
  profileDraft = null;
}
function renderProfileBody() {
  const d = profileDraft;
  const initials = (d.name || '').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || 'HL';
  // Avatar preview element — click to upload a photo; hover shows upload overlay
  const avatarPreviewHTML = `
    <button class="avatar-preview avatar-preview--editable"
            id="pf-avatar-click"
            type="button"
            title="Click to upload an image"
            style="--preview-bg: ${d.avatarColor}${d.avatarImage ? `; background-image: url('${d.avatarImage}'); background-size: cover; background-position: center;` : ''}">
      ${d.avatarImage ? '' : escapeHTML(initials)}
      <span class="avatar-preview__overlay">${iconSVG('image')}</span>
    </button>
  `;
  const wireAvatarClick = () => {
    profileBody.querySelector('#pf-avatar-click')?.addEventListener('click', () => {
      // Use a transient file input so we always get a change event
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.addEventListener('change', e => {
        const f = e.target.files?.[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => { profileDraft.avatarImage = reader.result; renderProfileBody(); };
        reader.readAsDataURL(f);
      });
      inp.click();
    });
  };

  if (profileActiveTab === 'profile') {
    profileBody.innerHTML = `
      ${avatarPreviewHTML}
      <div class="field">
        <label class="field__label">Display name</label>
        <input id="pf-name" class="field__input" type="text" value="${escapeHTML(d.name)}" autocomplete="off" spellcheck="false" />
        <span class="field__help">Shown in the sidebar and in place of your real account name.</span>
      </div>
      <div class="field">
        <label class="field__label">Email (read-only)</label>
        <input class="field__input" type="text" value="${escapeHTML(d.email)}" disabled />
      </div>
    `;
    profileBody.querySelector('#pf-name').addEventListener('input', e => { profileDraft.name = e.target.value; });
    wireAvatarClick();
  } else if (profileActiveTab === 'avatar') {
    profileBody.innerHTML = `
      ${avatarPreviewHTML}
      <label class="field__label" style="display:block; margin-bottom:6px">Avatar color (used as fallback if no image)</label>
      <div class="avatar-grid" id="pf-avatar-grid">
        ${AVATAR_PALETTE.map(c => `
          <button class="avatar-swatch${c.toLowerCase() === d.avatarColor.toLowerCase() ? ' is-selected' : ''}"
                  data-color="${c}" style="background:${c}" aria-label="${c}"></button>
        `).join('')}
      </div>
      ${d.avatarImage ? `<button class="modal__btn" id="pf-avatar-remove" style="margin-top:14px">Remove uploaded image</button>` : ''}
    `;
    profileBody.querySelector('#pf-avatar-grid').addEventListener('click', e => {
      const btn = e.target.closest('.avatar-swatch');
      if (!btn) return;
      profileDraft.avatarColor = btn.dataset.color;
      renderProfileBody();
    });
    profileBody.querySelector('#pf-avatar-remove')?.addEventListener('click', () => {
      profileDraft.avatarImage = null; renderProfileBody();
    });
    wireAvatarClick();
  } else if (profileActiveTab === 'greeting') {
    profileBody.innerHTML = `
      <div class="field">
        <label class="field__label">Chat greeting</label>
        <input id="pf-greeting" class="field__input" type="text" value="${escapeHTML(d.greeting)}" autocomplete="off" />
        <span class="field__help">Shown as the big headline in the empty chat view.</span>
      </div>
      <div style="padding: 30px 0; text-align: center;">
        <div class="font-serif" id="pf-greeting-preview" style="font-size: 28px; color: #e7e7ea;">${escapeHTML(d.greeting)}</div>
      </div>
    `;
    profileBody.querySelector('#pf-greeting').addEventListener('input', e => {
      profileDraft.greeting = e.target.value;
      profileBody.querySelector('#pf-greeting-preview').textContent = e.target.value || ' ';
    });
  }
}
// Tab switching
profileTabs.addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  profileActiveTab = b.dataset.tab;
  profileTabs.querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b));
  renderProfileBody();
});
// Close + save
profileModal.addEventListener('click', e => {
  if (e.target.closest('[data-close]')) closeProfileModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !profileModal.classList.contains('hidden')) closeProfileModal(); });
document.getElementById('profile-save').addEventListener('click', () => {
  if (!profileDraft) return;
  Object.assign(profileState, profileDraft);
  localStorage.setItem('ccmod.profile.name',        profileState.name);
  localStorage.setItem('ccmod.profile.avatarColor', profileState.avatarColor);
  localStorage.setItem('ccmod.profile.greeting',    profileState.greeting);
  if (profileState.avatarImage) localStorage.setItem('ccmod.profile.avatarImage', profileState.avatarImage);
  else                          localStorage.removeItem('ccmod.profile.avatarImage');
  applyProfile();
  closeProfileModal();
});
function applyProfile() {
  const initials = (profileState.name || '').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || 'HL';
  const avatarEl = document.getElementById('account-avatar');
  const nameEl   = document.getElementById('account-name');
  if (avatarEl) {
    if (profileState.avatarImage) {
      avatarEl.textContent = '';
      // Order matters: set color first, THEN image (setting the shorthand would nuke everything)
      avatarEl.style.backgroundColor = 'transparent';
      avatarEl.style.backgroundImage = `url('${profileState.avatarImage}')`;
      avatarEl.style.backgroundSize = 'cover';
      avatarEl.style.backgroundPosition = 'center';
      avatarEl.style.backgroundRepeat = 'no-repeat';
      avatarEl.style.boxShadow = `0 0 0 1px rgba(217, 119, 87, 0.8)`;
    } else {
      avatarEl.textContent = initials;
      avatarEl.style.backgroundImage = 'none';
      avatarEl.style.backgroundColor = profileState.avatarColor;
      avatarEl.style.boxShadow = `0 0 0 1px ${profileState.avatarColor}`;
    }
  }
  if (nameEl) nameEl.textContent = profileState.name;
  // Scope to the empty-chat greeting, NOT the hero title (both use .font-serif)
  const greetingEl = document.querySelector('#chat-scroll .chat-empty .font-serif')
                  || document.querySelector('#chat-scroll .chat-conversation > *:first-child .font-serif');
  if (greetingEl) greetingEl.textContent = profileState.greeting;
}
applyProfile();

// ---------- Shortcuts button (footer): opens / toggles the right panel to shortcuts ----------
const shortcutsBtn = document.getElementById('shortcuts-btn');
shortcutsBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = document.body.classList.contains('right-panel-open');
  if (isOpen && currentRightPanel === 'shortcuts') {
    setRightPanelOpen(false);                      // toggle closed if already showing
  } else {
    setRightPanelOpen(true);
    setRightPanelTab('shortcuts');
  }
});

// ---------- Appearance menu (theme + font) ----------
const appearanceState = {
  theme: localStorage.getItem('ccmod.theme') || 'dark',
  font:  localStorage.getItem('ccmod.font')  || 'anthropic',
  themes: [
    { id: 'light',  labelKey: 'th_light'  },
    { id: 'dark',   labelKey: 'th_dark'   },
    { id: 'system', labelKey: 'th_system' },
  ],
  fonts: [
    { id: 'anthropic', labelKey: 'ft_anthropic' },
    { id: 'system',    labelKey: 'ft_system'    },
  ],
};
function applyAppearance() {
  // Theme — 'system' follows prefers-color-scheme; otherwise force light/dark.
  const effective = appearanceState.theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : appearanceState.theme;
  document.documentElement.dataset.theme = effective;
  // Font
  document.documentElement.dataset.font = appearanceState.font;
}
applyAppearance();

const appearanceBtn = document.getElementById('appearance-btn');
appearanceBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  showAppearanceMenu(appearanceBtn);
});
function showAppearanceMenu(anchor) {
  ctx.innerHTML = `
    <div class="ctx-section__head"><span>${t('theme')}</span></div>
    ${appearanceState.themes.map(x => `
      <button data-appearance="theme" data-value="${x.id}">
        <span>${escapeHTML(t(x.labelKey))}</span>
        ${x.id === appearanceState.theme ? iconSVG('check') : ''}
      </button>`).join('')}
    <hr/>
    <div class="ctx-section__head"><span>${t('font')}</span></div>
    ${appearanceState.fonts.map(x => `
      <button data-appearance="font" data-value="${x.id}">
        <span>${escapeHTML(t(x.labelKey))}</span>
        ${x.id === appearanceState.font ? iconSVG('check') : ''}
      </button>`).join('')}
  `;
  ctx.classList.remove('hidden');
  // Position above the footer button
  const r = anchor.getBoundingClientRect();
  const cRect = ctx.getBoundingClientRect();
  let left = Math.max(8, Math.min(r.left, window.innerWidth - cRect.width - 8));
  let top  = Math.max(8, r.top - cRect.height - 6);
  ctx.style.left = left + 'px';
  ctx.style.top  = top + 'px';
  ctx.onclick = (ev) => {
    const btn = ev.target.closest('button[data-appearance]');
    if (!btn) return;
    const key = btn.dataset.appearance;                // 'theme' or 'font'
    appearanceState[key] = btn.dataset.value;
    localStorage.setItem('ccmod.' + key, btn.dataset.value);
    applyAppearance();
    hideCtx();
  };
}

// ---------- User / account menu (gear icon in the sidebar footer) ----------
const userBtn = document.getElementById('user-menu-btn');
const userState = {
  email: 'hlarosesurprenant@gmail.com',
  language: 'en-US',
  languages: [
    { id: 'en-US', label: 'English (United States)' },
    { id: 'fr-FR', label: 'Français (France)' },
    { id: 'de-DE', label: 'Deutsch (Deutschland)' },
    { id: 'hi-IN', label: 'हिन्दी (भारत)' },
    { id: 'id-ID', label: 'Indonesia (Indonesia)' },
    { id: 'it-IT', label: 'Italiano (Italia)' },
    { id: 'ja-JP', label: '日本語 (日本)' },
    { id: 'ko-KR', label: '한국어 (대한민국)' },
    { id: 'pt-BR', label: 'Português (Brasil)' },
    { id: 'es-419',label: 'Español (Latinoamérica)' },
    { id: 'es-ES', label: 'Español (España)' },
  ],
};
const ctxSub = document.getElementById('ctxsub');
function hideSub() { ctxSub.classList.add('hidden'); ctxSub.innerHTML = ''; }
document.addEventListener('click', (e) => { if (!ctxSub.contains(e.target) && !ctx.contains(e.target)) hideSub(); });

userBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  showUserMenu(userBtn);
});

function showUserMenu(anchor) {
  // Build subscription badge for the header
  let subBadge = '';
  if (window.electronAPI?.isElectron) {
    try {
      // Sync read from the account-email element (already updated at startup)
      const emailEl = document.getElementById('account-email');
      if (emailEl) subBadge = `<div class="user-menu__tier">${escapeHTML(emailEl.textContent)}</div>`;
    } catch (e) { /* ignore */ }
  }
  ctx.innerHTML = `
    <div class="user-menu__email">${escapeHTML(userState.email)}</div>
    ${subBadge}
    <button data-user="settings">${iconSVG('gear-six')}<span>${t('settings')}</span><span class="ctx-shortcut">Ctrl +,</span></button>
    <button data-user="language" class="has-sub">${iconSVG('eye')}<span>${t('language')}</span><span class="sub-caret">${iconSVG('caret-right')}</span></button>
    <button data-user="help">${iconSVG('chat-circle')}<span>${t('get_help')}</span></button>
    <hr/>
    <button data-user="plans">${iconSVG('list-bullets')}<span>${t('view_plans')}</span></button>
    <button data-user="apps">${iconSVG('folders')}<span>${t('get_apps')}</span></button>
    <button data-user="gift">${iconSVG('push-pin')}<span>${t('gift_claude')}</span></button>
    <button data-user="learn" class="has-sub">${iconSVG('lightning')}<span>${t('learn_more')}</span><span class="sub-caret">${iconSVG('caret-right')}</span></button>
    <hr/>
    <button data-user="logout">${iconSVG('arrow-right')}<span>${t('log_out')}</span></button>
  `;
  ctx.classList.remove('hidden');
  // Position ABOVE the anchor (this menu anchors at the footer gear, opens upward)
  const r = anchor.getBoundingClientRect();
  const cRect = ctx.getBoundingClientRect();
  let left = r.left - 8;
  left = Math.max(8, Math.min(left, window.innerWidth - cRect.width - 8));
  const top = Math.max(8, r.top - cRect.height - 6);
  ctx.style.left = left + 'px';
  ctx.style.top  = top + 'px';

  // Hover submenu wiring
  ctx.querySelectorAll('.has-sub').forEach(item => {
    item.addEventListener('mouseenter', () => openUserSubmenu(item));
    item.addEventListener('click', (ev) => { ev.stopPropagation(); openUserSubmenu(item); });
  });
  ctx.querySelectorAll('button[data-user]:not(.has-sub)').forEach(item => {
    item.addEventListener('mouseenter', hideSub);
  });

  ctx.onclick = (ev) => {
    const btn = ev.target.closest('button[data-user]');
    if (!btn) return;
    if (btn.classList.contains('has-sub')) return;
    const act = btn.dataset.user;
    if (act === 'settings') { hideSub(); hideCtx(); openProfileModal('profile'); return; }
    if (act === 'logout' && window.electronAPI?.signOut) {
      hideSub(); hideCtx();
      window.electronAPI.signOut().then(() => {
        updateAccountBadge({ mode: 'none', valid: false });
        setTimeout(() => showAuthModal(), 300);
      });
      return;
    }
    console.log('[stub] user action:', act);
    hideSub();
    hideCtx();
  };
}

function openUserSubmenu(parentItem) {
  const kind = parentItem.dataset.user;
  if (kind === 'language') {
    ctxSub.innerHTML = userState.languages.map(l => `
      <button data-lang="${l.id}">
        <span>${escapeHTML(l.label)}</span>
        ${l.id === userState.language ? iconSVG('check') : ''}
      </button>`).join('');
  } else if (kind === 'learn') {
    ctxSub.innerHTML = `
      <button data-learn="docs">${iconSVG('eye')}<span>Documentation</span></button>
      <button data-learn="changelog">${iconSVG('list-bullets')}<span>Changelog</span></button>
      <button data-learn="shortcuts">${iconSVG('code')}<span>Keyboard shortcuts</span></button>
    `;
  } else return;
  // Position submenu to the RIGHT of the parent item
  ctxSub.classList.remove('hidden');
  const pr = parentItem.getBoundingClientRect();
  const sRect = ctxSub.getBoundingClientRect();
  let left = pr.right + 4;
  if (left + sRect.width > window.innerWidth - 8) left = pr.left - sRect.width - 4;   // flip to the left
  let top = pr.top - 4;
  if (top + sRect.height > window.innerHeight - 8) top = window.innerHeight - sRect.height - 8;
  ctxSub.style.left = left + 'px';
  ctxSub.style.top  = top + 'px';

  ctxSub.onclick = (ev) => {
    const lang = ev.target.closest('button[data-lang]');
    if (lang) { userState.language = lang.dataset.lang; applyLanguage(); render(); hideSub(); hideCtx(); return; }
    const learn = ev.target.closest('button[data-learn]');
    if (learn) { console.log('[stub] learn:', learn.dataset.learn); hideSub(); hideCtx(); return; }
  };
}

// ---------- Slash command menu (triggered by the "/" button in the composer) ----------
const SLASH_COMMANDS = [
  { cmd: '/clear',       desc: 'Clear conversation' },
  { cmd: '/compact',     desc: 'Summarise + truncate history' },
  { cmd: '/new',         desc: 'Start a new session' },
  { cmd: '/model',       desc: 'Switch model' },
  { cmd: '/permissions', desc: 'Change permission mode' },
  { cmd: '/cost',        desc: 'Show token usage' },
  { cmd: '/status',      desc: 'Show session status' },
  { cmd: '/init',        desc: 'Create a CLAUDE.md' },
  { cmd: '/doctor',      desc: 'Run diagnostic checks' },
  { cmd: '/memory',      desc: 'Manage project memory' },
  { cmd: '/mcp',         desc: 'Manage MCP servers' },
  { cmd: '/config',      desc: 'Edit settings.json' },
  { cmd: '/login',       desc: 'Authenticate' },
  { cmd: '/logout',      desc: 'Sign out' },
  { cmd: '/help',        desc: 'Show all commands' },
];
const slashBtn = document.getElementById('slash-btn');
slashBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  showSlashMenu(slashBtn);
});
function showSlashMenu(anchor) {
  ctx.innerHTML = `
    <div class="slash-menu">
      ${SLASH_COMMANDS.map(c => `
        <button data-slash="${escapeHTML(c.cmd)}" class="slash-row">
          <span class="slash-row__cmd">${escapeHTML(c.cmd)}</span>
          <span class="slash-row__desc">${escapeHTML(c.desc)}</span>
        </button>`).join('')}
    </div>
  `;
  ctx.classList.remove('hidden');
  const r = anchor.getBoundingClientRect();
  const cRect = ctx.getBoundingClientRect();
  let left = r.left;
  left = Math.max(8, Math.min(left, window.innerWidth - cRect.width - 8));
  let top = r.top - cRect.height - 8;
  if (top < 8) top = r.bottom + 8;
  ctx.style.left = left + 'px';
  ctx.style.top  = top + 'px';
  ctx.onclick = (ev) => {
    const btn = ev.target.closest('button[data-slash]');
    if (!btn) return;
    const input = document.getElementById('composer-input');
    if (input) {
      input.value = btn.dataset.slash + ' ';
      input.focus();
      input.dispatchEvent(new Event('input', { bubbles: true }));    // trigger autoGrow
    }
    hideCtx();
  };
}

// ---------- Hints visibility (the "Type / for commands" line under the greeting) ----------
const hintsState = { showCommandHint: localStorage.getItem('ccmod.hints.cmd') !== '0' };
function applyHintsVisibility() {
  const hintEl = document.querySelector('#chat-scroll .mt-2');
  if (hintEl) hintEl.style.display = hintsState.showCommandHint ? '' : 'none';
}
applyHintsVisibility();

// ---------- Composer: consolidated "Settings" tree ----------
const settingsBtn = document.getElementById('settings-btn');
const settingsOpen = new Set(['perm']);     // which tree nodes are expanded by default

settingsBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  showSettingsTree(settingsBtn);
});

function showSettingsTree(anchor) {
  const currentPerm   = permState.modes.find(m => m.id === permState.current);
  const currentModel  = modelState.models.find(m => m.id === modelState.currentModel);
  const currentEffort = modelState.efforts.find(m => m.id === modelState.currentEffort);
  const currentDevice = micState.devices.find(d => d.id === micState.device);

  const node = (key, icon, title, preview, childrenHTML) => {
    const isOpen = settingsOpen.has(key);
    return `
      <div class="tree-node${isOpen ? ' is-open' : ''}" data-node="${key}">
        <button class="tree-node__head" data-toggle-node="${key}">
          <span class="tree-node__caret">${iconSVG('caret-right')}</span>
          ${iconSVG(icon)}
          <span class="tree-node__title">${escapeHTML(title)}</span>
          ${preview ? `<span class="tree-node__preview">${escapeHTML(preview)}</span>` : ''}
        </button>
        <div class="tree-node__body">${childrenHTML}</div>
      </div>`;
  };

  const sessionChildren = `
    <button class="tree-action" data-do="session-rename">${iconSVG('pencil-simple')}<span>${t('rename')}</span></button>
    <button class="tree-action" data-do="session-duplicate">${iconSVG('folders')}<span>${t('duplicate')}</span></button>
    <button class="tree-action" data-do="session-vscode">${iconSVG('vscode')}<span>${t('vscode')}</span></button>
    <button class="tree-action" data-do="session-archive">${iconSVG('folder-simple')}<span>${t('archive')}</span></button>
    <button class="tree-action danger" data-do="session-delete">${iconSVG('trash')}<span>${t('delete')}</span></button>`;

  const permChildren = permState.modes.map(m => `
    <button class="tree-action" data-do="perm-${m.id}">
      ${m.id === permState.current ? iconSVG('check') : '<span style="width:13px"></span>'}
      <div class="perm-row__texts">
        <span class="perm-row__label">${escapeHTML(tPermLabel(m))}</span>
        <span class="perm-row__desc">${escapeHTML(tPermDesc(m))}</span>
      </div>
    </button>`).join('');

  const modelChildren = `
    <div class="tree-subhead">${t('model') + 's'}</div>
    ${modelState.models.map(mo => `
      <button class="tree-action" data-do="model-${mo.id}">
        ${mo.id === modelState.currentModel ? iconSVG('check') : '<span style="width:13px"></span>'}
        <span>${escapeHTML(mo.label)}</span>
        <span class="ctx-shortcut">${mo.shortcut}</span>
      </button>`).join('')}
    <div class="tree-subhead">Effort</div>
    ${modelState.efforts.map(ef => `
      <button class="tree-action" data-do="effort-${ef.id}">
        ${ef.id === modelState.currentEffort ? iconSVG('check') : '<span style="width:13px"></span>'}
        <span>${escapeHTML(tEffort(ef))}</span>
      </button>`).join('')}`;

  const micChildren = `
    ${micState.devices.map(d => `
      <button class="tree-action mic-device" data-do="mic-${d.id}">
        <span class="mic-device__label">${escapeHTML(d.label)}</span>
        ${d.id === micState.device ? iconSVG('check') : '<span style="width:13px"></span>'}
      </button>`).join('')}
    <div class="toggle-row" data-toggle="hold">
      <span>${t('mic_hold')}</span>
      <span class="toggle${micState.holdToRecord ? ' is-on' : ''}" role="switch" aria-checked="${micState.holdToRecord}">
        <span class="toggle__knob"></span>
      </span>
    </div>`;

  const attachChildren = attachOptions.map(o => `
    <button class="tree-action" data-do="attach-${o.id}">
      ${iconSVG(o.icon)}<span>${escapeHTML(t(o.labelKey))}</span>
      ${o.shortcut ? `<span class="ctx-shortcut">${o.shortcut}</span>` : ''}
    </button>`).join('');

  const langChildren = userState.languages.map(l => `
    <button class="tree-action" data-do="lang-${l.id}">
      ${l.id === userState.language ? iconSVG('check') : '<span style="width:13px"></span>'}
      <span>${escapeHTML(l.label)}</span>
    </button>`).join('');
  const currentLang = userState.languages.find(l => l.id === userState.language);

  ctx.innerHTML = `
    <div class="settings-tree">
      ${node('session',   'folder-simple',       t('session'),     null,                                          sessionChildren)}
      ${node('perm',      'sliders-horizontal',  t('permissions'), currentPerm ? tPermLabel(currentPerm) : '',     permChildren)}
      ${node('model',     'lightning',           t('model'),       (currentModel?.label || '') + ' · ' + (currentEffort ? tEffort(currentEffort) : ''), modelChildren)}
      ${node('mic',       'microphone',          t('microphone'),  (currentDevice?.label || '').split(' - ')[0],   micChildren)}
      ${node('attach',    'plus',                t('insert'),      null,                                           attachChildren)}
      ${node('lang',      'eye',                 t('language'),    currentLang?.label || '',                       langChildren)}
      <button class="tree-action kb-open-btn" data-do="kb-open" style="margin:4px 0 0;width:100%;justify-content:flex-start;gap:8px;padding:8px 10px;border-radius:8px">
        ${iconSVG('list-checks')}
        <span style="flex:1;text-align:left;font-size:13px">Knowledge Base</span>
        <span style="font-size:11px;color:#5a5a63">CLAUDE.md · skills · memory</span>
      </button>
      <div class="tree-toggle-row" data-toggle="cmd-hint" title="${t('show_cmd_hint')}">
        ${iconSVG('eye')}
        <span class="tree-toggle-row__label">${t('show_cmd_hint')}</span>
        <span class="toggle${hintsState.showCommandHint ? ' is-on' : ''}" role="switch" aria-checked="${hintsState.showCommandHint}">
          <span class="toggle__knob"></span>
        </span>
      </div>
    </div>`;

  openAboveComposer();

  ctx.onclick = (ev) => {
    // Toggle node
    const tog = ev.target.closest('[data-toggle-node]');
    if (tog) {
      const key = tog.dataset.toggleNode;
      if (settingsOpen.has(key)) settingsOpen.delete(key); else settingsOpen.add(key);
      tog.parentElement.classList.toggle('is-open');
      // Keep the menu pinned above the composer after height change
      requestAnimationFrame(() => openAboveComposer());
      return;
    }
    // Toggle hold-to-record switch
    const togHold = ev.target.closest('[data-toggle="hold"]');
    if (togHold) {
      micState.holdToRecord = !micState.holdToRecord;
      const sw = togHold.querySelector('.toggle');
      sw.classList.toggle('is-on', micState.holdToRecord);
      sw.setAttribute('aria-checked', String(micState.holdToRecord));
      return;
    }
    // Toggle command-hint visibility
    const togHint = ev.target.closest('[data-toggle="cmd-hint"]');
    if (togHint) {
      hintsState.showCommandHint = !hintsState.showCommandHint;
      localStorage.setItem('ccmod.hints.cmd', hintsState.showCommandHint ? '1' : '0');
      applyHintsVisibility();
      const sw = togHint.querySelector('.toggle');
      sw.classList.toggle('is-on', hintsState.showCommandHint);
      sw.setAttribute('aria-checked', String(hintsState.showCommandHint));
      return;
    }
    // Run an action
    const act = ev.target.closest('[data-do]');
    if (!act) return;
    const [group, ...rest] = act.dataset.do.split('-');
    const id = rest.join('-');
    handleSettingsAction(group, id);
    hideCtx();
  };
}

function handleSettingsAction(group, id) {
  if (group === 'session') {
    const s = findSession(state.activeId);
    if (!s) return;
    const session = s.list[s.index];
    if (id === 'rename')    renameSession(session.id);
    if (id === 'duplicate') duplicateSession(session.id);
    if (id === 'archive')   deleteSession(session.id);
    if (id === 'delete')    deleteSession(session.id);
    if (id === 'vscode')    console.log('[stub] open in VS Code:', session.title);
  }
  if (group === 'perm') {
    permState.current = id;
    const mode = permState.modes.find(m => m.id === id);
    if (mode) document.getElementById('perm-label').textContent = mode.label;
  }
  if (group === 'model')  { modelState.currentModel  = id; syncModelChip(); }
  if (group === 'effort') { modelState.currentEffort = id; syncModelChip(); }
  if (group === 'mic')    { micState.device = id; }
  if (group === 'attach') {
    if (id === 'computer' || id === 'files') document.getElementById('file-picker')?.click();
    else console.log('[stub] attach:', id);
  }
  if (group === 'lang')   {
    userState.language = id;
    applyLanguage();
    render();                                               // rebuild sidebar strings pulled from mock data are english-agnostic, but sections header updates
  }
  if (group === 'kb' && id === 'open') {
    showKnowledgeBaseEditor();
  }
}

// ── Agents store (localStorage) — module-level so any code can call loadAgents() ──
const AGENTS_KEY = 'ccmod.agents';
function loadAgents() {
  try { return JSON.parse(localStorage.getItem(AGENTS_KEY) || '[]'); } catch { return []; }
}
function saveAgents(list) { localStorage.setItem(AGENTS_KEY, JSON.stringify(list)); }

// ── Console (full settings dashboard) ────────────────────────────────────────
function showConsole(initialPage = 'overview') {
  if (document.getElementById('console-overlay')) return;

  /* ── Nav items ────────────────────────────────────────────── */
  const NAV = [
    { id: 'overview',    icon: 'lightning',        label: 'Overview'      },
    { id: 'knowledge',   icon: 'list-checks',      label: 'Knowledge Base'},
    { id: 'agents',      icon: 'gear-six',         label: 'AI Agents'     },
    { id: 'models',      icon: 'circle-wavy-check',label: 'Models'        },
    { id: 'appearance',  icon: 'eye',              label: 'Appearance'    },
    { id: 'sessions',    icon: 'folders',          label: 'Sessions'      },
    { id: 'permissions', icon: 'sliders-horizontal',label: 'Permissions'  },
    { id: 'about',       icon: 'circle',           label: 'About'         },
  ];

  /* ── Shell ────────────────────────────────────────────────── */
  const overlay = document.createElement('div');
  overlay.id = 'console-overlay';
  overlay.className = 'console-overlay';
  overlay.innerHTML = `
    <div class="console-layout">
      <aside class="console-nav">
        <div class="console-nav__brand">
          <span class="console-nav__logo">${iconSVG('monitor')}</span>
          <span class="console-nav__name">Console</span>
        </div>
        <nav class="console-nav__links" id="console-nav">
          ${NAV.map(n => `
            <button class="console-nav__item${n.id === initialPage ? ' is-active' : ''}" data-page="${n.id}">
              ${iconSVG(n.icon)}
              <span>${n.label}</span>
            </button>`).join('')}
        </nav>
        <div class="console-nav__foot">
          <div class="console-nav__user">
            <span class="console-nav__avatar" id="cons-avatar">HL</span>
            <div class="console-nav__user-info">
              <span id="cons-name" style="font-size:12px;font-weight:600;color:#e7e7ea">User</span>
              <span id="cons-email" style="font-size:11px;color:#5a5a63">Not connected</span>
            </div>
          </div>
          <button class="console-nav__close" id="console-close" title="Close (Esc)">${iconSVG('x')}</button>
        </div>
      </aside>
      <main class="console-main" id="console-main"></main>
    </div>`;
  document.body.appendChild(overlay);
  if (window.renderIcons) window.renderIcons(overlay);

  // Populate user info
  const avatarEl = overlay.querySelector('#cons-avatar');
  const nameEl   = overlay.querySelector('#cons-name');
  const emailEl  = overlay.querySelector('#cons-email');
  const srcAvatar = document.getElementById('account-avatar');
  const srcName   = document.getElementById('account-name');
  const srcEmail  = document.getElementById('account-email');
  if (srcAvatar) avatarEl.textContent = srcAvatar.textContent;
  if (srcName)   nameEl.textContent   = srcName.textContent;
  if (srcEmail)  emailEl.textContent  = srcEmail.textContent;

  /* ── Page renderers ───────────────────────────────────────── */
  function pageOverview() {
    const sessions = loadSessionList?.() || [];
    const agents   = loadAgents?.() || [];
    const model    = modelState?.currentModel || 'claude-sonnet-4-6';
    const effort   = modelState?.currentEffort || 'normal';
    return `
      <div class="console-page">

        <!-- ── Hero card ───────────────────────────────────────── -->
        <div class="ov-hero">
          <!-- Glow orbs -->
          <div class="ov-hero__orb ov-hero__orb--1"></div>
          <div class="ov-hero__orb ov-hero__orb--2"></div>

          <div class="ov-hero__inner">
            <!-- Top badges row -->
            <div class="ov-hero__badges">
              <span class="ov-badge ov-badge--accent">
                <span class="ov-badge__dot"></span>Fan-made · v0.1 · Concept
              </span>
              <code class="ov-badge ov-badge--code">$ claude --dangerously-skip-permissions</code>
            </div>

            <!-- Logo + title -->
            <div class="ov-hero__title-row">
              <div class="ov-logo">
                <svg viewBox="0 0 24 24" fill="none" width="36" height="36">
                  <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#d97757"/>
                </svg>
              </div>
              <h1 class="ov-hero__h1">Claude Code <span class="ov-hero__accent">Mods</span></h1>
            </div>

            <!-- Tagline stats row -->
            <div class="ov-hero__tagline-row">
              <span class="ov-stat">${sessions.length} session${sessions.length !== 1 ? 's' : ''} built</span>
              <span class="ov-stat__sep">·</span>
              <span class="ov-stat">${agents.length} agent${agents.length !== 1 ? 's' : ''}</span>
              <span class="ov-stat__sep">·</span>
              <span class="ov-stat">Live Anthropic API</span>
            </div>

            <!-- Description -->
            <p class="ov-hero__desc">
              A community sketch exploring what the Claude Code desktop sidebar
              <em>could</em> feel like — tree-style projects, per-color accents, and a calmer settings surface.
            </p>

            <!-- Feature chips -->
            <div class="ov-chips">
              <span class="ov-chip ov-chip--orange">Projects &amp; sessions</span>
              <span class="ov-chip ov-chip--blue">Per-project color cascade</span>
              <span class="ov-chip ov-chip--green">Consolidated settings tree</span>
              <span class="ov-chip ov-chip--purple">Light + dark themes</span>
              <span class="ov-chip ov-chip--yellow">i18n (EN/FR)</span>
            </div>

            <!-- CTA row -->
            <div class="ov-hero__cta">
              <button class="ov-btn ov-btn--filled" data-quick="new-session">
                ${iconSVG('plus')}<span>New session</span>
              </button>
              <button class="ov-btn ov-btn--ghost" data-quick="open-kb">
                <span>Knowledge Base →</span>
              </button>
              <span class="ov-hero__hint">New session · ${escapeHTML(model.replace('claude-','').replace(/-\d+$/,''))}</span>
            </div>
          </div>
        </div>

        <!-- ── Stats cards ──────────────────────────────────────── -->
        <div class="console-cards" style="margin-top:20px">
          <div class="console-card">
            <div class="console-card__val">${sessions.length}</div>
            <div class="console-card__label">Sessions</div>
          </div>
          <div class="console-card">
            <div class="console-card__val">${agents.length}</div>
            <div class="console-card__label">Agents</div>
          </div>
          <div class="console-card">
            <div class="console-card__val" style="font-size:13px">${escapeHTML(model.replace('claude-',''))}</div>
            <div class="console-card__label">Active model</div>
          </div>
          <div class="console-card">
            <div class="console-card__val" style="color:#7ab389">●</div>
            <div class="console-card__label">CLI connected</div>
          </div>
        </div>

        <!-- ── Skills ───────────────────────────────────────────── -->
        <div class="console-section-title" style="margin-top:24px">CLAUDE.md skills active</div>
        <div class="console-skill-chips">
          <span class="console-chip">app-context.md</span>
          <span class="console-chip">jsx-code-blocks.md</span>
          <span class="console-chip">design-system.md</span>
          <span class="console-chip console-chip--dim">cwd → app root</span>
        </div>
      </div>`;
  }

  function pageKnowledge() {
    return `
      <div class="console-page console-page--kb">
        <div class="console-page__head" style="padding-bottom:0">
          <h1 class="console-page__title">Knowledge Base</h1>
          <p class="console-page__sub" style="margin-bottom:12px">
            Internal config editor — <strong>drafts stay in-app</strong>; publish to push to disk (what the CLI reads).
          </p>
        </div>

        <div class="console-kb-layout">
          <!-- File list sidebar -->
          <div class="console-kb-sidebar" id="cons-kb-list">
            <div class="cons-kb-sidebar-head">Files</div>
            <div style="padding:8px;color:#5a5a63;font-size:12px">Loading…</div>
          </div>

          <!-- Editor panel -->
          <div class="console-kb-editor">

            <!-- Top bar: path + view-mode + actions -->
            <div class="console-kb-editor__bar">
              <span class="console-kb-path" id="cons-kb-path" title="">Select a file</span>

              <!-- View-mode toggle -->
              <div class="kb-view-toggle" id="kb-view-toggle">
                <button class="kb-view-btn is-active" data-view="edit"  title="Edit">Edit</button>
                <button class="kb-view-btn"            data-view="split" title="Split">Split</button>
                <button class="kb-view-btn"            data-view="preview" title="Preview">Preview</button>
              </div>

              <!-- Save state badge + action buttons -->
              <div style="display:flex;align-items:center;gap:7px;flex-shrink:0">
                <span class="kb-state-badge kb-state-badge--clean" id="cons-kb-badge" style="display:none"></span>
                <button class="console-btn console-btn--sm" id="cons-kb-revert" disabled title="Discard unsaved edits and reload">Revert</button>
                <button class="console-btn console-btn--sm" id="cons-kb-draft"  disabled title="Save draft (in-app only, not written to disk — Ctrl+S)">Save draft</button>
                <button class="console-btn console-btn--sm console-btn--publish" id="cons-kb-publish" disabled title="Write to disk — CLI picks this up on next session">Publish →</button>
              </div>
            </div>

            <!-- Markdown toolbar -->
            <div class="kb-toolbar" id="kb-toolbar">
              <button class="kb-tb-btn" data-insert="# "     title="Heading 1">H1</button>
              <button class="kb-tb-btn" data-insert="## "    title="Heading 2">H2</button>
              <button class="kb-tb-btn" data-insert="### "   title="Heading 3">H3</button>
              <span class="kb-tb-sep"></span>
              <button class="kb-tb-btn" data-wrap="**"       title="Bold">B</button>
              <button class="kb-tb-btn" data-wrap="*"        title="Italic" style="font-style:italic">I</button>
              <button class="kb-tb-btn" data-wrap="BACKTICK"  title="Inline code" style="font-family:monospace">&#96;c&#96;</button>
              <span class="kb-tb-sep"></span>
              <button class="kb-tb-btn" data-insert="CODEBLOCK" title="Code block">&#96;&#96;&#96;</button>
              <button class="kb-tb-btn" data-insert="\n---\n" title="Divider">—</button>
              <button class="kb-tb-btn" data-insert="@skills/" title="Import skill">@</button>
            </div>

            <!-- Edit + Preview panes -->
            <div class="kb-panes" id="kb-panes" data-view="edit">
              <div class="kb-pane kb-pane--edit">
                <textarea class="console-kb-textarea" id="cons-kb-ta"
                  placeholder="Select a file from the left to start editing…"
                  spellcheck="false" autocorrect="off" autocapitalize="off"></textarea>
              </div>
              <div class="kb-pane kb-pane--preview" id="kb-preview">
                <div class="kb-preview-body" id="kb-preview-body">
                  <p style="color:#3b3b42;font-size:13px">Nothing to preview yet.</p>
                </div>
              </div>
            </div>

            <!-- Status bar -->
            <div class="console-kb-status" id="cons-kb-status"></div>
          </div>
        </div>
      </div>`;
  }

  function pageAgents() {
    const agents = loadAgents();
    const agentTypes = [
      { id: 'claude_code_mod', label: 'Claude Code Mods (this app)' },
      { id: 'claude_code',     label: 'claude_code' },
      { id: 'claude_desktop',  label: 'claude_desktop' },
      { id: 'api',             label: 'api' },
      { id: 'webhook',         label: 'webhook' },
    ];
    const agentModels = [
      { id: '',                          label: 'Default (from settings)' },
      { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6' },
      { id: 'claude-sonnet-4-5',         label: 'Claude Sonnet 4.5' },
      { id: 'claude-opus-4-5',           label: 'Claude Opus 4.5' },
      { id: 'claude-opus-4',             label: 'Claude Opus 4' },
      { id: 'claude-haiku-4-5',          label: 'Claude Haiku 4.5' },
      { id: 'claude-haiku-3-5',          label: 'Claude Haiku 3.5' },
      { id: 'claude-haiku-3-5-20241022', label: 'Claude Haiku 3.5 (10/2024)' },
    ];
    return `
      <div class="console-page">
        <div class="console-page__head">
          <h1 class="console-page__title">AI Agents</h1>
          <p class="console-page__sub">Agents are saved to <code>agents.json</code> and <code>skills/agents.md</code> — Claude picks them up as sub-agents. Invoke with <code>@agentname</code> or "use sub agent X".</p>
        </div>
        <div id="agents-list">
          ${agents.length === 0 ? `
            <div class="console-empty">
              ${iconSVG('gear-six')}
              <p>No agents configured yet.</p>
            </div>` :
          agents.map((a, i) => `
            <div class="agent-card" data-agent-idx="${i}">
              <div class="agent-card__head">
                <span class="agent-card__dot" style="background:${a.color||'#7ab389'}"></span>
                <strong class="agent-card__name">${escapeHTML(a.name)}</strong>
                <span class="agent-card__type">${escapeHTML(a.type)}</span>
                <div style="flex:1"></div>
                <button class="agent-card__edit" data-agent-edit="${i}">${iconSVG('pencil-simple')}</button>
                <button class="agent-card__del" data-agent-del="${i}">${iconSVG('trash')}</button>
              </div>
              <div class="agent-card__body">
                ${a.model    ? `<div class="agent-card__row"><span class="agent-card__key">Model</span><span class="agent-card__val">${escapeHTML(a.model)}</span></div>` : ''}
                ${a.system   ? `<div class="agent-card__row"><span class="agent-card__key">System</span><span class="agent-card__val" style="font-style:italic;opacity:.7">${escapeHTML(a.system.slice(0,80))}${a.system.length>80?'…':''}</span></div>` : ''}
                ${a.endpoint ? `<div class="agent-card__row"><span class="agent-card__key">Endpoint</span><span class="agent-card__val">${escapeHTML(a.endpoint)}</span></div>` : ''}
                ${a.notes    ? `<div class="agent-card__row"><span class="agent-card__key">Notes</span><span class="agent-card__val">${escapeHTML(a.notes)}</span></div>` : ''}
              </div>
            </div>`).join('')}
        </div>
        <button class="console-btn console-btn--primary" id="agent-add-btn" style="margin-top:20px">
          ${iconSVG('plus')}<span>Add agent</span>
        </button>

        <!-- Inline agent form (hidden) -->
        <div class="agent-form" id="agent-form" style="display:none">
          <div class="console-section-title" id="agent-form-title">New agent</div>
          <input type="hidden" id="af-idx" value="-1">
          <div class="agent-form__grid">

            <label class="agent-form__label">Name
              <input class="agent-form__input" id="af-name" placeholder="e.g. researcher">
            </label>
            <label class="agent-form__label">Type
              <select class="agent-form__input" id="af-type">
                ${agentTypes.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
              </select>
            </label>

            <label class="agent-form__label">Model
              <select class="agent-form__input" id="af-model">
                ${agentModels.map(m => `<option value="${m.id}">${m.label}</option>`).join('')}
              </select>
            </label>
            <label class="agent-form__label">Color
              <input class="agent-form__input agent-form__input--color" id="af-color" type="color" value="#7ab389">
            </label>

            <label class="agent-form__label af-external-field" id="af-endpoint-wrap">Endpoint / Gateway URL
              <input class="agent-form__input" id="af-endpoint" placeholder="https://...supabase.co/functions/v1/gateway">
            </label>
            <label class="agent-form__label af-external-field" id="af-apikey-wrap">API Key
              <input class="agent-form__input" id="af-apikey" type="password" placeholder="agk_...">
            </label>

            <label class="agent-form__label" style="grid-column:1/-1">System prompt
              <textarea class="agent-form__input agent-form__textarea" id="af-system"
                placeholder="You are a specialized research agent. Focus on accuracy and cite sources…"
                rows="3" spellcheck="true"></textarea>
            </label>
            <label class="agent-form__label" style="grid-column:1/-1">Notes
              <input class="agent-form__input" id="af-notes" placeholder="Optional description shown in card">
            </label>

          </div>
          <div style="display:flex;gap:8px;margin-top:14px;align-items:center">
            <button class="console-btn console-btn--primary" id="af-save">Save agent</button>
            <button class="console-btn" id="af-cancel">Cancel</button>
            <span class="af-save-status" id="af-save-status" style="font-size:11.5px;color:#7ab389;margin-left:8px;opacity:0;transition:opacity .4s"></span>
          </div>
        </div>
      </div>`;
  }

  function pageModels() {
    const models  = modelState?.models  || [];
    const efforts = modelState?.efforts || [];
    return `
      <div class="console-page">
        <div class="console-page__head">
          <h1 class="console-page__title">Models</h1>
          <p class="console-page__sub">Choose the model and effort level for your sessions.</p>
        </div>
        <div class="console-section-title">Model</div>
        <div class="console-radio-group" id="cons-model-group">
          ${models.map(m => `
            <button class="console-radio${m.id === modelState?.currentModel ? ' is-selected' : ''}" data-model-pick="${m.id}">
              <span class="console-radio__dot"></span>
              <div>
                <div class="console-radio__label">${escapeHTML(m.label)}</div>
                <div class="console-radio__hint">${m.shortcut || ''}</div>
              </div>
            </button>`).join('')}
        </div>
        <div class="console-section-title" style="margin-top:28px">Effort level</div>
        <div class="console-radio-group" id="cons-effort-group">
          ${efforts.map(ef => `
            <button class="console-radio${ef.id === modelState?.currentEffort ? ' is-selected' : ''}" data-effort-pick="${ef.id}">
              <span class="console-radio__dot"></span>
              <div>
                <div class="console-radio__label">${escapeHTML(ef.label || ef.id)}</div>
              </div>
            </button>`).join('')}
        </div>
      </div>`;
  }

  function pageAppearance() {
    const langs = userState?.languages || [];
    const curLang = userState?.language || 'en';
    const isDark  = document.documentElement.getAttribute('data-theme') !== 'light';
    return `
      <div class="console-page">
        <div class="console-page__head">
          <h1 class="console-page__title">Appearance</h1>
          <p class="console-page__sub">Theme, language, and display preferences.</p>
        </div>
        <div class="console-section-title">Theme</div>
        <div class="console-theme-row">
          <button class="console-theme-btn${isDark ? ' is-active' : ''}" data-theme-set="dark">
            <div class="console-theme-preview console-theme-preview--dark">
              <div class="ctp__bar"></div><div class="ctp__lines"><div></div><div></div></div>
            </div>
            <span>Dark</span>
          </button>
          <button class="console-theme-btn${!isDark ? ' is-active' : ''}" data-theme-set="light">
            <div class="console-theme-preview console-theme-preview--light">
              <div class="ctp__bar"></div><div class="ctp__lines"><div></div><div></div></div>
            </div>
            <span>Light</span>
          </button>
        </div>
        <div class="console-section-title" style="margin-top:28px">Language</div>
        <div class="console-radio-group">
          ${langs.map(l => `
            <button class="console-radio${l.id === curLang ? ' is-selected' : ''}" data-lang-pick="${l.id}">
              <span class="console-radio__dot"></span>
              <div class="console-radio__label">${escapeHTML(l.label)}</div>
            </button>`).join('')}
        </div>
        <div class="console-section-title" style="margin-top:28px">Display</div>
        <div class="console-toggle-row" id="cons-hint-toggle">
          <div>
            <div class="console-toggle-label">Show command hints</div>
            <div class="console-toggle-sub">Displays keyboard shortcut hints in the composer</div>
          </div>
          <span class="toggle${hintsState?.showCommandHint ? ' is-on' : ''}" role="switch" aria-checked="${hintsState?.showCommandHint}">
            <span class="toggle__knob"></span>
          </span>
        </div>
      </div>`;
  }

  function pageSessions() {
    const list = loadSessionList?.() || [];
    return `
      <div class="console-page">
        <div class="console-page__head">
          <h1 class="console-page__title">Sessions</h1>
          <p class="console-page__sub">${list.length} session${list.length !== 1 ? 's' : ''} stored locally.</p>
        </div>
        <div class="console-session-list">
          ${list.length === 0 ? '<div class="console-empty">' + iconSVG('folders') + '<p>No sessions yet.</p></div>' :
          list.map(s => `
            <div class="console-session-row">
              <div class="console-session-dot" style="background:${s.color||'#5a5a63'}"></div>
              <div class="console-session-info">
                <div class="console-session-title">${escapeHTML(s.title || 'Untitled')}</div>
                <div class="console-session-meta">${new Date(s.ts||0).toLocaleDateString()} · ${(s.cliSessionId ? 'CLI session active' : 'no CLI session')}</div>
              </div>
              <button class="console-btn console-btn--sm" data-sess-open="${s.id}">Open</button>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function pagePermissions() {
    const modes = permState?.modes || [];
    return `
      <div class="console-page">
        <div class="console-page__head">
          <h1 class="console-page__title">Permissions</h1>
          <p class="console-page__sub">Control what Claude can do during sessions.</p>
        </div>
        <div class="console-perm-list">
          ${modes.map(m => `
            <button class="console-perm-card${m.id === permState?.current ? ' is-active' : ''}" data-perm-pick="${m.id}">
              <div class="console-perm-card__head">
                ${m.id === permState?.current ? iconSVG('check-circle') : iconSVG('circle')}
                <span class="console-perm-card__name">${escapeHTML(m.label || m.id)}</span>
              </div>
              <p class="console-perm-card__desc">${escapeHTML(m.description || m.desc || '')}</p>
            </button>`).join('')}
        </div>
      </div>`;
  }

  function pageAbout() {
    return `
      <div class="console-page">
        <div class="console-page__head">
          <h1 class="console-page__title">About</h1>
        </div>
        <div class="console-about">
          <div class="console-about__logo">${iconSVG('claude-logo')}</div>
          <h2 class="console-about__app">Claude Code Mod</h2>
          <p class="console-about__tagline">Fan-made desktop UI · Electron 35 + Vite 5</p>
          <div class="console-about__grid">
            <div class="console-about__row"><span>Renderer</span><code>Electron 35 / Chromium</code></div>
            <div class="console-about__row"><span>Backend</span><code>claude CLI (stream-json)</code></div>
            <div class="console-about__row"><span>Skills</span><code>CLAUDE.md + skills/</code></div>
            <div class="console-about__row"><span>Shortcut</span><code>Ctrl + \`</code></div>
          </div>
          <p class="console-about__credit">Built with ♥ — not affiliated with Anthropic</p>
        </div>
      </div>`;
  }

  const PAGES = { overview: pageOverview, knowledge: pageKnowledge, agents: pageAgents,
    models: pageModels, appearance: pageAppearance, sessions: pageSessions,
    permissions: pagePermissions, about: pageAbout };

  /* ── Routing ──────────────────────────────────────────────── */
  let currentPage = initialPage;
  const mainEl = overlay.querySelector('#console-main');

  function navigate(pageId) {
    if (!PAGES[pageId]) return;
    currentPage = pageId;
    overlay.querySelectorAll('.console-nav__item').forEach(b =>
      b.classList.toggle('is-active', b.dataset.page === pageId));
    mainEl.innerHTML = PAGES[pageId]();
    if (window.renderIcons) window.renderIcons(mainEl);
    wirePageEvents(pageId);
  }

  function wirePageEvents(pageId) {
    /* Overview quick actions */
    mainEl.querySelectorAll('[data-quick]').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.dataset.quick;
        if (q === 'new-session')  { closeConsole(); document.querySelector('[data-do="new-session"]')?.click(); }
        if (q === 'open-kb')      navigate('knowledge');
        if (q === 'open-agents')  navigate('agents');
      });
    });

    /* Knowledge Base */
    if (pageId === 'knowledge') wireKBPage();

    /* Agents */
    if (pageId === 'agents') wireAgentsPage();

    /* Models */
    mainEl.querySelectorAll('[data-model-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        modelState.currentModel = btn.dataset.modelPick;
        if (typeof syncModelChip === 'function') syncModelChip();
        mainEl.querySelectorAll('[data-model-pick]').forEach(b =>
          b.classList.toggle('is-selected', b.dataset.modelPick === modelState.currentModel));
      });
    });
    mainEl.querySelectorAll('[data-effort-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        modelState.currentEffort = btn.dataset.effortPick;
        if (typeof syncModelChip === 'function') syncModelChip();
        mainEl.querySelectorAll('[data-effort-pick]').forEach(b =>
          b.classList.toggle('is-selected', b.dataset.effortPick === modelState.currentEffort));
      });
    });

    /* Appearance */
    mainEl.querySelectorAll('[data-theme-set]').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.themeSet;
        document.documentElement.setAttribute('data-theme', t);
        localStorage.setItem('ccmod.theme', t);
        mainEl.querySelectorAll('[data-theme-set]').forEach(b =>
          b.classList.toggle('is-active', b.dataset.themeSet === t));
      });
    });
    mainEl.querySelectorAll('[data-lang-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (userState) userState.language = btn.dataset.langPick;
        if (typeof applyLanguage === 'function') applyLanguage();
        mainEl.querySelectorAll('[data-lang-pick]').forEach(b =>
          b.classList.toggle('is-selected', b.dataset.langPick === (userState?.language)));
      });
    });
    const hintRow = mainEl.querySelector('#cons-hint-toggle');
    if (hintRow) {
      hintRow.addEventListener('click', () => {
        if (!hintsState) return;
        hintsState.showCommandHint = !hintsState.showCommandHint;
        localStorage.setItem('ccmod.hints.cmd', hintsState.showCommandHint ? '1' : '0');
        if (typeof applyHintsVisibility === 'function') applyHintsVisibility();
        const sw = hintRow.querySelector('.toggle');
        sw?.classList.toggle('is-on', hintsState.showCommandHint);
        sw?.setAttribute('aria-checked', String(hintsState.showCommandHint));
      });
    }

    /* Sessions */
    mainEl.querySelectorAll('[data-sess-open]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.sessOpen;
        closeConsole();
        if (typeof switchSession === 'function') switchSession(id);
      });
    });

    /* Permissions */
    mainEl.querySelectorAll('[data-perm-pick]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (permState) permState.current = btn.dataset.permPick;
        mainEl.querySelectorAll('[data-perm-pick]').forEach(b =>
          b.classList.toggle('is-active', b.dataset.permPick === permState?.current));
        const pl = document.getElementById('perm-label');
        if (pl) pl.textContent = permState?.modes?.find(m => m.id === permState.current)?.label || '';
      });
    });
  }

  /* ── Knowledge Base wiring ────────────────────────────────── */
  function wireKBPage() {
    const kb = window.electronAPI?.kb;

    // DOM refs
    const listEl     = mainEl.querySelector('#cons-kb-list');
    const ta         = mainEl.querySelector('#cons-kb-ta');
    const pathEl     = mainEl.querySelector('#cons-kb-path');
    const badge      = mainEl.querySelector('#cons-kb-badge');
    const revertBtn  = mainEl.querySelector('#cons-kb-revert');
    const draftBtn   = mainEl.querySelector('#cons-kb-draft');
    const publishBtn = mainEl.querySelector('#cons-kb-publish');
    const statEl     = mainEl.querySelector('#cons-kb-status');
    const panesEl    = mainEl.querySelector('#kb-panes');
    const previewEl  = mainEl.querySelector('#kb-preview-body');
    const toolbar    = mainEl.querySelector('#kb-toolbar');

    // Draft storage helpers
    const DRAFT_PREFIX = 'ccmod.kb.draft.';
    const getDraft  = id => localStorage.getItem(DRAFT_PREFIX + id);
    const setDraft  = (id, v) => localStorage.setItem(DRAFT_PREFIX + id, v);
    const clearDraft= id => localStorage.removeItem(DRAFT_PREFIX + id);

    // State
    let activeId    = null;   // currently open file id
    let diskContent = '';     // what's actually on disk (from last read/publish)
    let draftContent= null;   // saved draft (localStorage), null = no draft

    // ── Status bar ──────────────────────────────────────────
    function setStatus(msg, isErr = false) {
      statEl.textContent = msg;
      statEl.style.color = isErr ? '#c96442' : '#7ab389';
      if (msg) setTimeout(() => { if (statEl.textContent === msg) statEl.textContent = ''; }, 3500);
    }

    // ── Badge / button states ────────────────────────────────
    // States: 'clean' | 'draft' | 'modified'
    function updateState() {
      if (!activeId) return;
      const current = ta.value;
      const hasDraft   = getDraft(activeId) !== null;
      const isModified = current !== (draftContent ?? diskContent);
      const draftDiffsDisk = hasDraft && getDraft(activeId) !== diskContent;

      if (isModified) {
        setBadge('modified', '● unsaved');
      } else if (draftDiffsDisk) {
        setBadge('draft', '◆ draft — not published');
      } else {
        setBadge('clean', '✓ in sync with disk');
      }

      revertBtn.disabled  = !isModified;
      draftBtn.disabled   = !isModified;
      publishBtn.disabled = current === diskContent; // nothing new to publish
    }

    function setBadge(state, label) {
      badge.style.display = 'inline-flex';
      badge.textContent = label;
      badge.className = `kb-state-badge kb-state-badge--${state}`;
    }

    // ── Markdown preview ─────────────────────────────────────
    function renderPreview() {
      const md = window.mdToHtml ? window.mdToHtml(ta.value) : `<pre>${escapeHTML(ta.value)}</pre>`;
      previewEl.innerHTML = md;
      if (window.renderIcons) window.renderIcons(previewEl);
    }

    // ── Sidebar file list ────────────────────────────────────
    if (!kb) {
      listEl.innerHTML = '<div style="padding:12px;color:#c96442;font-size:12px">KB API unavailable (dev mode?)</div>';
      return;
    }

    kb.list().then(files => {
      // Render file list with draft indicator dots
      function renderList() {
        const inner = listEl.querySelector('.cons-kb-files') || (() => {
          const d = document.createElement('div'); d.className = 'cons-kb-files'; return listEl.appendChild(d);
        })();
        inner.innerHTML = files.map(f => {
          const hasDraft = getDraft(f.id) !== null;
          return `
            <button class="cons-kb-item${activeId === f.id ? ' is-active' : ''}" data-id="${f.id}">
              <span class="cons-kb-item__ico">${iconSVG(f.icon)}</span>
              <span class="cons-kb-item__label">${escapeHTML(f.label)}</span>
              ${hasDraft ? '<span class="cons-kb-dot" title="Has unsaved draft"></span>' : ''}
            </button>`;
        }).join('');
        if (window.renderIcons) window.renderIcons(inner);
      }
      renderList();

      // ── Load a file ──────────────────────────────────────
      async function loadFile(id) {
        if (activeId === id) return;
        // Warn if current file has unsaved in-memory edits
        if (activeId && ta.value !== (draftContent ?? diskContent)) {
          if (!confirm('You have unsaved edits. Switch anyway? (Your draft is already saved.)')) return;
        }

        activeId = id;
        ta.value = ''; ta.disabled = true;
        pathEl.textContent = 'Loading…';
        badge.style.display = 'none';
        [revertBtn, draftBtn, publishBtn].forEach(b => b.disabled = true);

        // Read from disk
        const res = await kb.read(id);
        if (!res.ok) { setStatus(res.error, true); ta.disabled = false; return; }

        diskContent  = res.content;
        draftContent = getDraft(id);       // null if no draft

        // Load draft if exists, otherwise disk content
        ta.value     = draftContent ?? diskContent;
        pathEl.textContent = res.path;
        ta.disabled  = false;

        renderList(); // refresh dots
        updateState();
        renderPreview();
        ta.focus();
      }

      // ── File list click ──────────────────────────────────
      listEl.addEventListener('click', e => {
        const b = e.target.closest('.cons-kb-item');
        if (b) loadFile(b.dataset.id);
      });

      // ── Textarea input ───────────────────────────────────
      ta.addEventListener('input', () => {
        updateState();
        // Update live preview if split/preview mode active
        const view = panesEl.dataset.view;
        if (view === 'split' || view === 'preview') renderPreview();
      });

      // ── Toolbar buttons ──────────────────────────────────
      const TOOLBAR_MAP = { BACKTICK: '\x60', CODEBLOCK: '\x60\x60\x60\n\n\x60\x60\x60' };
      toolbar.addEventListener('click', e => {
        const btn = e.target.closest('[data-insert],[data-wrap]');
        if (!btn || ta.disabled) return;
        const start = ta.selectionStart, end = ta.selectionEnd;
        const sel   = ta.value.slice(start, end);
        let insert;
        if (btn.dataset.wrap) {
          const w = TOOLBAR_MAP[btn.dataset.wrap] ?? btn.dataset.wrap;
          insert = sel ? w + sel + w : w + w;
          const offset = sel ? 0 : w.length;
          ta.focus();
          document.execCommand('insertText', false, insert);
          if (!sel) { ta.selectionStart = ta.selectionEnd = start + offset; }
        } else {
          insert = TOOLBAR_MAP[btn.dataset.insert] ?? btn.dataset.insert;
          const needsNewline = start > 0 && ta.value[start - 1] !== '\n';
          ta.focus();
          document.execCommand('insertText', false, (needsNewline ? '\n' : '') + insert);
        }
        updateState();
        const view = panesEl.dataset.view;
        if (view === 'split' || view === 'preview') renderPreview();
      });

      // ── View-mode toggle ─────────────────────────────────
      mainEl.querySelector('#kb-view-toggle').addEventListener('click', e => {
        const btn = e.target.closest('[data-view]');
        if (!btn) return;
        const v = btn.dataset.view;
        panesEl.dataset.view = v;
        mainEl.querySelectorAll('.kb-view-btn').forEach(b =>
          b.classList.toggle('is-active', b.dataset.view === v));
        if (v === 'split' || v === 'preview') renderPreview();
      });

      // ── Revert button ────────────────────────────────────
      revertBtn.addEventListener('click', () => {
        if (!activeId) return;
        ta.value = draftContent ?? diskContent;
        updateState();
        renderPreview();
        setStatus('Reverted to last draft/disk state');
      });

      // ── Save draft (Ctrl+S) ──────────────────────────────
      function saveDraft() {
        if (!activeId || ta.disabled) return;
        setDraft(activeId, ta.value);
        draftContent = ta.value;
        renderList(); // refresh dot
        updateState();
        setStatus('Draft saved (in-app only)');
      }
      draftBtn.addEventListener('click', saveDraft);
      ta.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveDraft(); }
      });

      // ── Publish to disk ──────────────────────────────────
      publishBtn.addEventListener('click', async () => {
        if (!activeId || ta.disabled) return;
        publishBtn.disabled = true;
        const res = await kb.write(activeId, ta.value);
        if (res.ok) {
          diskContent  = ta.value;
          draftContent = ta.value;
          setDraft(activeId, ta.value); // keep draft in sync
          renderList();
          updateState();
          setStatus('Published to disk ✓ — takes effect on next Claude session');
        } else {
          setStatus(res.error, true);
          publishBtn.disabled = false;
        }
      });

      // Auto-open first file
      if (files.length) loadFile(files[0].id);
    });
  }

  /* ── Agents wiring ────────────────────────────────────────── */
  function wireAgentsPage() {
    const form      = mainEl.querySelector('#agent-form');
    const addBtn    = mainEl.querySelector('#agent-add-btn');
    const listEl    = mainEl.querySelector('#agents-list');
    const formTitle = mainEl.querySelector('#agent-form-title');

    // Show/hide endpoint+apikey fields — not needed for built-in app type
    function syncExternalFields() {
      const type = mainEl.querySelector('#af-type')?.value;
      const isBuiltIn = type === 'claude_code_mod';
      mainEl.querySelectorAll('.af-external-field').forEach(el => {
        el.style.display = isBuiltIn ? 'none' : '';
      });
    }
    mainEl.querySelector('#af-type')?.addEventListener('change', syncExternalFields);

    function showForm(idx = -1) {
      const agents = loadAgents();
      const a = idx >= 0 ? agents[idx] : {};
      mainEl.querySelector('#af-idx').value      = idx;
      mainEl.querySelector('#af-name').value     = a.name     || '';
      mainEl.querySelector('#af-type').value     = a.type     || 'claude_code_mod';
      mainEl.querySelector('#af-endpoint').value = a.endpoint || '';
      mainEl.querySelector('#af-apikey').value   = a.apiKey   || '';
      mainEl.querySelector('#af-model').value    = a.model    || '';
      mainEl.querySelector('#af-color').value    = a.color    || '#7ab389';
      mainEl.querySelector('#af-system').value   = a.system   || '';
      mainEl.querySelector('#af-notes').value    = a.notes    || '';
      formTitle.textContent = idx >= 0 ? 'Edit agent' : 'New agent';
      form.style.display = 'block';
      syncExternalFields();
      mainEl.querySelector('#af-name').focus();
    }
    function hideForm() { form.style.display = 'none'; }

    addBtn.addEventListener('click', () => showForm(-1));
    mainEl.querySelector('#af-cancel').addEventListener('click', hideForm);
    mainEl.querySelector('#af-save').addEventListener('click', () => {
      try {
        const agents  = loadAgents();
        const idx     = parseInt(mainEl.querySelector('#af-idx').value);
        const agent   = {
          name:     mainEl.querySelector('#af-name').value.trim()     || 'Unnamed',
          type:     mainEl.querySelector('#af-type').value            || 'claude_code_mod',
          endpoint: mainEl.querySelector('#af-endpoint')?.value.trim() || '',
          apiKey:   mainEl.querySelector('#af-apikey')?.value.trim()   || '',
          model:    mainEl.querySelector('#af-model')?.value           || '',
          system:   mainEl.querySelector('#af-system')?.value.trim()   || '',
          color:    mainEl.querySelector('#af-color')?.value           || '#7ab389',
          notes:    mainEl.querySelector('#af-notes')?.value.trim()    || '',
        };
        if (idx >= 0) agents[idx] = agent; else agents.push(agent);

        // ① Save to localStorage immediately (always works, no async needed)
        saveAgents(agents);
        syncAgentPill?.();

        // ② Navigate back right away so user sees the updated list
        navigate('agents');

        // ③ Fire-and-forget disk save (doesn't block navigation)
        if (window.electronAPI?.agents?.save) {
          window.electronAPI.agents.save(agents)
            .then(res => { if (!res?.ok) console.warn('[agents] disk save failed:', res?.error); })
            .catch(e  => console.warn('[agents] disk save error:', e));
        }
      } catch (err) {
        console.error('[agents] save failed:', err);
        alert('Save failed: ' + err.message);
      }
    });

    listEl.addEventListener('click', e => {
      const editBtn = e.target.closest('[data-agent-edit]');
      const delBtn  = e.target.closest('[data-agent-del]');
      if (editBtn) showForm(parseInt(editBtn.dataset.agentEdit));
      if (delBtn) {
        const i = parseInt(delBtn.dataset.agentDel);
        const agents = loadAgents();
        agents.splice(i, 1);
        // If deleted agent was the active one, reset selection
        if (activeAgentIdx !== null && activeAgentIdx >= agents.length) {
          activeAgentIdx = null;
          localStorage.removeItem(ACTIVE_AGENT_KEY);
        }
        saveAgents(agents);
        syncAgentPill?.();
        navigate('agents');
      }
    });
  }

  /* ── Nav wiring ───────────────────────────────────────────── */
  overlay.querySelector('#console-nav').addEventListener('click', e => {
    const btn = e.target.closest('[data-page]');
    if (btn) navigate(btn.dataset.page);
  });

  /* ── Close ────────────────────────────────────────────────── */
  overlay.querySelector('#console-close').addEventListener('click', closeConsole);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeConsole(); });
  document.addEventListener('keydown', onConsoleKey);
  function onConsoleKey(e) { if (e.key === 'Escape') closeConsole(); }
  function closeConsole() {
    overlay.remove();
    document.removeEventListener('keydown', onConsoleKey);
  }

  navigate(initialPage);
}

// ── Knowledge Base Editor ─────────────────────────────────────────────────────
async function showKnowledgeBaseEditor() {
  if (document.getElementById('kb-overlay')) return; // already open

  // Build overlay shell immediately; populate files after IPC responds
  const overlay = document.createElement('div');
  overlay.id = 'kb-overlay';
  overlay.className = 'kb-overlay';
  overlay.innerHTML = `
    <div class="kb-modal">
      <div class="kb-modal__sidebar">
        <div class="kb-modal__sidebar-head">
          <span class="kb-modal__sidebar-title">Knowledge Base</span>
          <button class="kb-modal__close" id="kb-close" title="Close">${iconSVG('x')}</button>
        </div>
        <div class="kb-modal__file-list" id="kb-file-list">
          <div style="padding:16px;color:#5a5a63;font-size:12px">Loading…</div>
        </div>
        <div class="kb-modal__sidebar-foot">
          <span style="font-size:11px;color:#5a5a63;line-height:1.4">
            Files read by the Claude CLI each session.<br>Edit to change Claude's behaviour.
          </span>
        </div>
      </div>
      <div class="kb-modal__editor">
        <div class="kb-modal__editor-head" id="kb-editor-head">
          <span class="kb-modal__file-path" id="kb-file-path">Select a file</span>
          <div class="kb-modal__editor-actions">
            <span class="kb-modal__dirty-badge" id="kb-dirty" style="display:none">unsaved</span>
            <button class="kb-modal__btn kb-modal__btn--save" id="kb-save" disabled>Save</button>
          </div>
        </div>
        <div class="kb-modal__editor-body">
          <textarea class="kb-modal__textarea" id="kb-textarea"
            placeholder="Select a file from the left panel…"
            spellcheck="false" autocorrect="off" autocapitalize="off"></textarea>
        </div>
        <div class="kb-modal__status" id="kb-status"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  if (window.renderIcons) window.renderIcons(overlay);

  let activeId   = null;
  let savedContent = '';

  const fileList  = overlay.querySelector('#kb-file-list');
  const textarea  = overlay.querySelector('#kb-textarea');
  const pathLabel = overlay.querySelector('#kb-file-path');
  const saveBtn   = overlay.querySelector('#kb-save');
  const dirtyBadge= overlay.querySelector('#kb-dirty');
  const statusEl  = overlay.querySelector('#kb-status');

  function setStatus(msg, isError = false) {
    statusEl.textContent = msg;
    statusEl.style.color = isError ? '#c96442' : '#7ab389';
    if (msg) setTimeout(() => { if (statusEl.textContent === msg) statusEl.textContent = ''; }, 3000);
  }

  function markDirty(dirty) {
    dirtyBadge.style.display = dirty ? 'inline-flex' : 'none';
    saveBtn.disabled = !dirty;
  }

  // Load file list
  const kb = window.electronAPI?.kb;
  if (!kb) {
    fileList.innerHTML = `<div style="padding:16px;color:#c96442;font-size:12px">KB API not available (dev mode?)</div>`;
  } else {
    const files = await kb.list();
    fileList.innerHTML = files.map(f => `
      <button class="kb-file-item" data-id="${f.id}">
        <span class="kb-file-item__icon">${iconSVG(f.icon)}</span>
        <span class="kb-file-item__label">${escapeHTML(f.label)}</span>
      </button>`).join('');
    if (window.renderIcons) window.renderIcons(fileList);

    async function loadFile(id) {
      if (activeId === id) return;
      // Warn on unsaved changes
      if (activeId && textarea.value !== savedContent) {
        if (!confirm('Discard unsaved changes?')) return;
      }
      activeId = id;
      fileList.querySelectorAll('.kb-file-item').forEach(b =>
        b.classList.toggle('is-active', b.dataset.id === id));
      textarea.value = ''; textarea.disabled = true;
      pathLabel.textContent = 'Loading…';
      markDirty(false);

      const res = await kb.read(id);
      if (!res.ok) {
        setStatus(res.error, true);
        return;
      }
      textarea.value   = res.content;
      savedContent     = res.content;
      pathLabel.textContent = res.path;
      textarea.disabled = false;
      markDirty(false);
      textarea.focus();
    }

    fileList.addEventListener('click', e => {
      const btn = e.target.closest('.kb-file-item');
      if (btn) loadFile(btn.dataset.id);
    });

    saveBtn.addEventListener('click', async () => {
      if (!activeId) return;
      saveBtn.disabled = true;
      const res = await kb.write(activeId, textarea.value);
      if (res.ok) {
        savedContent = textarea.value;
        markDirty(false);
        setStatus('Saved ✓');
      } else {
        setStatus(res.error, true);
        saveBtn.disabled = false;
      }
    });

    textarea.addEventListener('input', () => markDirty(textarea.value !== savedContent));
    // Ctrl+S / Cmd+S to save
    textarea.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!saveBtn.disabled) saveBtn.click();
      }
    });

    // Auto-open first file
    if (files.length) loadFile(files[0].id);
  }

  // Close handlers
  overlay.querySelector('#kb-close').addEventListener('click', closeKB);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeKB(); });
  document.addEventListener('keydown', onKBKey);

  function onKBKey(e) {
    if (e.key === 'Escape') closeKB();
  }
  function closeKB() {
    if (activeId && textarea.value !== savedContent) {
      if (!confirm('Close without saving?')) return;
    }
    overlay.remove();
    document.removeEventListener('keydown', onKBKey);
  }
}

// ---------- Code-block actions (copy / download / preview) ----------
const langToExt = { css: 'css', javascript: 'js', typescript: 'ts', html: 'html',
                    json: 'json', markdown: 'md', python: 'py', bash: 'sh', sh: 'sh' };
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.code-block__btn');
  if (!btn) return;
  const block = btn.closest('.code-block');
  if (!block) return;
  const body = block.querySelector('.code-block__body');
  const lang = block.querySelector('.code-block__lang')?.textContent.trim().toLowerCase() || 'txt';
  const code = body?.innerText || '';
  const action = btn.dataset.action;

  if (action === 'copy') {
    navigator.clipboard?.writeText(code);
    btn.classList.add('is-flashed');
    setTimeout(() => btn.classList.remove('is-flashed'), 900);
    return;
  }
  if (action === 'download') {
    const ext = langToExt[lang] || 'txt';
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `snippet.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    btn.classList.add('is-flashed');
    setTimeout(() => btn.classList.remove('is-flashed'), 900);
    return;
  }
  if (action === 'preview') {
    togglePreviewInline(block, lang, code);
    return;
  }
  if (action === 'fullscreen') {
    openCodePreview(lang, code);
    return;
  }
  if (action === 'open-in-panel') {
    // Push this specific block into the panel (bypasses RENDERABLE filter)
    window.__apercuOverride = { lang, code };
    setRightPanelOpen(true);
    setRightPanelTab('apercu');
    // Force refresh if already on apercu
    if (currentRightPanel === 'apercu') {
      const bodyEl = document.getElementById('right-panel-body');
      if (bodyEl) {
        bodyEl.innerHTML = renderApercuPanel();
        loadPhosphorIcons?.();
        requestAnimationFrame(() => initApercuScaling(bodyEl));
      }
    }
    return;
  }
});

// Inline preview: cross-fade the code body out and slide an iframe in.
// Eye button toggles it; second click flips back to code.
function togglePreviewInline(block, lang, code) {
  const eyeBtn = block.querySelector('[data-action="preview"]');

  if (block.classList.contains('is-previewing')) {
    block.classList.remove('is-previewing');
    if (eyeBtn) eyeBtn.classList.remove('is-active');
    return;
  }

  let overlay = block.querySelector('.code-block__preview');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'code-block__preview';
    const needsNetwork = ['jsx','tsx','react'].includes(lang);
    const sandboxAttr  = needsNetwork ? 'allow-scripts allow-same-origin' : 'allow-scripts';
    overlay.innerHTML = `<iframe sandbox="${sandboxAttr}" srcdoc="${buildPreviewSrcDoc(lang, code).replace(/"/g, '&quot;')}"></iframe>`;
    block.appendChild(overlay);
  }

  // Slot the overlay flush under the head.
  const head = block.querySelector('.code-block__head');
  if (head) overlay.style.top = head.offsetHeight + 'px';

  // Highlight the eye button while preview is open.
  if (eyeBtn) eyeBtn.classList.add('is-active');

  // Next frame so the CSS transition fires.
  requestAnimationFrame(() => block.classList.add('is-previewing'));
}

function buildPreviewSrcDoc(lang, code) {
  const base = `
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      /* Scrollbar — match the app's dark sidebar style */
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #27272c; border-radius: 999px; }
      ::-webkit-scrollbar-thumb:hover { background: #2e2e34; }
      html { scrollbar-color: #27272c transparent; scrollbar-width: thin; }
      html, body { margin: 0; padding: 18px; background: #141416; color: #e7e7ea;
        font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.55;
        overflow-x: hidden; }
      .demo { padding: 16px; border-radius: 10px; background: #0b0b0c;
        box-shadow: inset 0 0 0 1px #27272c; }
      h1 { font-size: 17px; margin: 0 0 8px; color: #d97757; font-weight: 600; }
      p  { margin: 0 0 10px; font-size: 13px; color: #a1a1aa; }
      code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 12px;
        background: #202024; padding: 2px 5px; border-radius: 4px; color: #d97757; }
      pre { overflow-x: auto; margin: 0; }
    </style>`;

  if (lang === 'html') {
    return base + code;
  }
  if (lang === 'css') {
    return base + `<style>${code}</style>
      <h1>CSS preview</h1>
      <p>Your rules are applied below. Open DevTools to inspect:</p>
      <div class="demo">
        <p class="session"><span class="session__dot"></span><span class="session__title">Sample session</span></p>
        <p class="project__body"><span class="session is-active"><span class="session__dot"></span><span class="session__title">Active session</span></span></p>
      </div>`;
  }
  if (lang === 'javascript' || lang === 'js') {
    return base + `
      <h1>JS preview</h1>
      <p>Running in a sandboxed iframe. <code>console.log</code> output appears below.</p>
      <pre id="out" style="margin-top:12px;padding:12px;background:#0b0b0c;border-radius:8px;white-space:pre-wrap;color:#c4c4ca;min-height:60px;"></pre>
      <script>
        (function(){
          const out = document.getElementById('out');
          const log = (...a) => { out.textContent += a.map(x => typeof x==='string'?x:JSON.stringify(x,null,2)).join(' ') + '\\n'; };
          const console = { log, info: log, warn: log, error: log };
          try { ${'\n'}${code}${'\n'} } catch(e) { log('⚠️', e.message); }
        })();
      <` + `/script>`;
  }
  if (lang === 'jsx' || lang === 'tsx' || lang === 'react') {
    // Strip import/export statements — we inject the real modules ourselves.
    // We keep type-only imports for TS but strip value imports (react, framer-motion, etc.)
    const stripped = code
      .replace(/^import\s+type\s+.*?from\s+['"].*?['"];?\s*$/gm, '')   // remove TS type imports
      .replace(/^import\s+.*?from\s+['"].*?['"];?\s*$/gm, '')           // remove all other imports
      .replace(/^export\s+default\s+/, '')
      // Auto-fix: wrap unquoted CSS values that contain ${ } template expressions.
      // Pattern: `someStyleProp: radial-gradient(...${...}...)` → wrap in backticks.
      // Claude sometimes forgets to wrap dynamic CSS values in template literal strings.
      .replace(/(:\s*)((?:[a-z-]+\(|#|[0-9])[^,\n"'`]*\$\{[^}]+\}[^,\n"'`]*)/g,
               (_, colon, val) => `${colon}\`${val}\``)
      .trim();

    // Detect component name: `function Foo(`, `const Foo =`, `class Foo`
    const nameMatch = stripped.match(/(?:function|class)\s+([A-Z][A-Za-z0-9_]*)/) ||
                      stripped.match(/(?:const|let)\s+([A-Z][A-Za-z0-9_]*)\s*=/);
    const compName  = nameMatch ? nameMatch[1] : null;

    // Skip auto-mount if the code already calls createRoot / render / mountApp itself
    // to prevent React error #299 ("container already passed to createRoot")
    const hasManualMount = /createRoot\s*\(|ReactDOM\s*\.\s*render\s*\(|mountApp\s*\(/.test(stripped);
    const mountLine = (compName && !hasManualMount)
      ? `createRoot(document.getElementById('root')).render(React.createElement(${compName}));`
      : '';

    // Babel presets: add typescript for tsx
    const babelPresets = (lang === 'tsx')
      ? `['react', ['typescript', { allExtensions: true, isTSX: true }]]`
      : `['react']`;

    // Safely embed user code inside a <script> block in HTML.
    // JSON.stringify handles quote/newline escaping; replace </ to avoid
    // premature </script> tag termination in the HTML parser.
    const safeCode  = JSON.stringify(stripped).replace(/<\//g, '<\\/');
    const safeMount = JSON.stringify(mountLine).replace(/<\//g, '<\\/');

    // ESM CDN — esm.sh serves proper ES modules. All three share the *same*
    // React instance via the browser's module cache (identical URLs = same entry).
    // Framer Motion, GSAP, etc. all resolve correctly this way.
    // We expose every common hook/util so Claude-generated code just works
    // without needing import statements.
    const ESM_PREAMBLE = [
      // React — every hook available as a top-level binding
      "import React, { useState, useEffect, useRef, useCallback, useMemo,",
      "  useContext, createContext, useReducer, useLayoutEffect,",
      "  useImperativeHandle, forwardRef, Fragment, memo, lazy, Suspense",
      "} from 'https://esm.sh/react@18';",
      "import { createRoot } from 'https://esm.sh/react-dom@18/client';",
      // Framer Motion — all common exports
      "import {",
      "  motion, AnimatePresence, LayoutGroup, Reorder,",
      "  useAnimation, useMotionValue, useTransform, useSpring,",
      "  useScroll, useVelocity, useInView, useDragControls,",
      "  useMotionTemplate, useMotionValueEvent, LazyMotion, domAnimation,",
      "  animate, stagger, m",
      "} from 'https://esm.sh/framer-motion@11?deps=react@18,react-dom@18';",
      // ── Compat shims so Claude-generated code "just works" ──────────────
      // Guarded root — prevents React #299 "already passed to createRoot"
      "let __root; const __getRoot = (c) => { if (!__root) __root = createRoot(c); return __root; };",
      // React 17-style render() shim
      "const render = (element, container) => __getRoot(container).render(element);",
      "const ReactDOM = { render, createRoot: (c) => __getRoot(c), unmountComponentAtNode: () => {} };",
      // Convenient mount-to-root helper
      "const mountApp = (el) => __getRoot(document.getElementById('root')).render(el);",
      "",
    ].join('\n');

    return `<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
      <style>
        *, *::before, *::after { box-sizing: border-box; }
        /* Hide scrollbar — preview is a viewport, not a doc */
        ::-webkit-scrollbar { display: none; }
        html { scrollbar-width: none; }
        html, body { margin: 0; padding: 0; min-height: 100vh;
          font-family: ui-sans-serif, system-ui, sans-serif;
          background: #0b0b0c; color: #e7e7ea; overflow: hidden; }
        #preview-error {
          padding: 16px; color: #f87171; font-size: 12.5px;
          font-family: ui-monospace, monospace; white-space: pre-wrap;
          background: rgba(248,113,113,.07); border-radius: 8px; margin: 16px;
          display: none;
        }
      </style>
    </head><body>
      <div id="root"></div>
      <div id="preview-error"></div>
      <script>
      /* ── Compile + mount via ESM blob ─────────────────────────────────────────
         Strategy:
           1. Babel (UMD, already loaded) compiles the user's JSX → plain JS.
           2. We prepend ESM imports from esm.sh so React + Framer Motion are
              available without the user writing a single import statement.
           3. We create a Blob URL from the full module source and dynamically
              import() it — this is the only way to get real ES module semantics
              (importmaps, top-level await, etc.) in a sandboxed iframe.
         Why not <script type="text/babel">?
           Babel's text/babel runner evaluates code as a regular script, so you
           cannot use ESM-only libs (framer-motion, @motionone/motion …) which
           have no UMD builds. The blob approach gives full module support.
      ──────────────────────────────────────────────────────────────────────── */
      (async () => {
        const errEl = document.getElementById('preview-error');
        const show  = msg => { errEl.style.display = 'block'; errEl.textContent = msg; };
        try {
          const rawCode  = ${safeCode};
          const mountSrc = ${safeMount};
          const presets  = ${babelPresets};

          // Compile JSX → JS (synchronous, Babel is already loaded)
          const compiled = Babel.transform(rawCode, {
            presets,
            filename:        'app.jsx',
            retainLines:     true,
            sourceMaps:      false,
          }).code;

          // Build module source: preamble + compiled user code + mount call
          const ESM_PREAMBLE = ${JSON.stringify(ESM_PREAMBLE)};
          const fullModule   = ESM_PREAMBLE + compiled + '\\n' + mountSrc;

          // Inject as a real ES module via Blob URL
          const blob = new Blob([fullModule], { type: 'application/javascript' });
          const url  = URL.createObjectURL(blob);
          await import(url);
          URL.revokeObjectURL(url);

        } catch (e) {
          // Show the compile/runtime error in the preview pane
          const loc = e.loc ? \` (line \${e.loc.line})\` : '';
          show('⚠️ ' + (e.message || String(e)) + loc);
          console.error('[preview]', e);
        }
      })();
      <\/script>
    </body></html>`;
  }

  return base + `
      <h1>Preview not available for <code>${lang}</code></h1>
      <p>This preview currently renders <code>html</code>, <code>css</code>, <code>javascript</code>, and <code>jsx</code>.
      The raw code is shown below.</p>
      <pre class="demo">${code.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre>`;
}

function openCodePreview(lang, code) {
  const modal = document.getElementById('code-preview-modal');
  const body  = document.getElementById('code-preview-body');
  document.getElementById('code-preview-lang').textContent = lang;
  const doc = buildPreviewSrcDoc(lang, code);
  const needsNet = ['jsx','tsx','react'].includes(lang);
  const sb = needsNet ? 'allow-scripts allow-same-origin' : 'allow-scripts';
  body.innerHTML = `<iframe sandbox="${sb}" srcdoc="${doc.replace(/"/g, '&quot;')}"></iframe>`;
  modal.classList.remove('hidden');
}
// Close handlers (share with profile modal's Esc + backdrop)
document.getElementById('code-preview-modal')?.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) document.getElementById('code-preview-modal').classList.add('hidden');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.getElementById('code-preview-modal')?.classList.add('hidden');
});

// ---------- File picker handler (triggered by the "From computer" attach option) ----------
const filePicker = document.getElementById('file-picker');
filePicker?.addEventListener('change', (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  console.log('[attach] picked', files.length, 'file(s):', files.map(f => f.name).join(', '));
  // Stub: append file names to the composer input as a preview
  const input = document.getElementById('composer-input');
  if (input) input.value = (input.value ? input.value + '\n' : '') + files.map(f => `📎 ${f.name}`).join('\n');
  e.target.value = '';                                    // reset so re-picking same file still fires
});

// ---------- Composer: permission mode dropdown ----------
const permBtn = document.getElementById('perm-btn');
const permLabel = document.getElementById('perm-label');
const permState = {
  current: 'bypass',
  modes: [
    { id: 'default', labelKey: 'perm_default', descKey: 'perm_default_d' },
    { id: 'accept',  labelKey: 'perm_accept',  descKey: 'perm_accept_d'  },
    { id: 'plan',    labelKey: 'perm_plan',    descKey: 'perm_plan_d'    },
    { id: 'bypass',  labelKey: 'perm_bypass',  descKey: 'perm_bypass_d'  },
  ],
};
// Helpers to get translated labels from a perm mode entry
function tPermLabel(m) { return t(m.labelKey); }
function tPermDesc(m)  { return t(m.descKey);  }
permBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  showPermMenu(permBtn);
});
function showPermMenu(anchor) {
  ctx.innerHTML = `
    <div class="ctx-section__head"><span>${t('permissions')}</span><span class="ctx-kbd">⇧ Tab</span></div>
    ${permState.modes.map(m => `
      <button data-perm="${m.id}" class="perm-row">
        ${m.id === permState.current ? iconSVG('check') : '<span style="width:13px"></span>'}
        <div class="perm-row__texts">
          <span class="perm-row__label">${escapeHTML(tPermLabel(m))}</span>
          <span class="perm-row__desc">${escapeHTML(tPermDesc(m))}</span>
        </div>
      </button>
    `).join('')}
  `;
  openMenuAbove(anchor);
  ctx.onclick = (ev) => {
    const btn = ev.target.closest('button[data-perm]');
    if (!btn) return;
    permState.current = btn.dataset.perm;
    const mode = permState.modes.find(m => m.id === permState.current);
    const labelEl = document.getElementById('perm-label');
    if (labelEl) labelEl.textContent = tPermLabel(mode);
    const chipEl = document.getElementById('perm-btn');
    if (chipEl) {
      chipEl.classList.toggle('chip-btn--warn',  mode.id === 'bypass');
      chipEl.classList.toggle('chip-btn--good',  mode.id === 'default');
      chipEl.classList.toggle('chip-btn--plan',  mode.id === 'plan');
      chipEl.classList.toggle('chip-btn--accept',mode.id === 'accept');
    }
    hideCtx();
  };
}

// ---------- Composer: attach (+) dropdown ----------
const attachBtn = document.getElementById('attach-btn');
const attachOptions = [
  { id: 'computer', labelKey: 'att_computer',icon: 'monitor',       shortcut: '⇧ Ctrl U' },
  { id: 'files',    labelKey: 'att_files',   icon: 'folder-simple', shortcut: '⇧ Ctrl O' },
  { id: 'image',    labelKey: 'att_image',   icon: 'image',         shortcut: '⇧ Ctrl V' },
  { id: 'github',   labelKey: 'att_github',  icon: 'code',          shortcut: '' },
  { id: 'context',  labelKey: 'att_context', icon: 'plus',          shortcut: '@'  },
  { id: 'mcp',      labelKey: 'att_mcp',     icon: 'lightning',     shortcut: '/'  },
];
attachBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  ctx.innerHTML = attachOptions.map(o => `
    <button data-attach="${o.id}">
      ${iconSVG(o.icon)}
      <span>${escapeHTML(t(o.labelKey))}</span>
      ${o.shortcut ? `<span class="ctx-shortcut">${o.shortcut}</span>` : ''}
    </button>
  `).join('');
  openMenuAbove(attachBtn);
  ctx.onclick = (ev) => {
    const btn = ev.target.closest('button[data-attach]');
    if (!btn) return;
    console.log('[stub] attach:', btn.dataset.attach);
    hideCtx();
  };
});

// ---------- Composer: model dropdown ----------
const modelChipBtn = document.getElementById('model-chip');
const modelState = {
  currentModel: 'claude-sonnet-4-6',
  currentEffort: 'tres-eleve',
  models: [
    { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6',  shortcut: '1' },
    { id: 'claude-sonnet-4-5', label: 'Sonnet 4.5',  shortcut: '2' },
    { id: 'claude-opus-4-5',   label: 'Opus 4.5',    shortcut: '3' },
    { id: 'claude-opus-4',     label: 'Opus 4',      shortcut: '4' },
    { id: 'claude-haiku-3-5',  label: 'Haiku 3.5',   shortcut: '5' },
  ],
  efforts: [
    { id: 'faible',     labelKey: 'eff_faible'    },
    { id: 'moyen',      labelKey: 'eff_moyen'     },
    { id: 'elevee',     labelKey: 'eff_elevee'    },
    { id: 'tres-eleve', labelKey: 'eff_tres_eleve'},
    { id: 'max',        labelKey: 'eff_max'       },
  ],
};
function tEffort(e) { return t(e.labelKey); }
modelChipBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  showModelMenu(modelChipBtn);
});
function showModelMenu(anchor) {
  const m = modelState.models.map(mo => `
    <button data-section="model" data-id="${mo.id}">
      ${mo.id === modelState.currentModel ? iconSVG('check') : '<span style="width:13px"></span>'}
      <span>${escapeHTML(mo.label)}</span>
      <span class="ctx-shortcut">${mo.shortcut}</span>
    </button>`).join('');
  const e = modelState.efforts.map(ef => `
    <button data-section="effort" data-id="${ef.id}">
      ${ef.id === modelState.currentEffort ? iconSVG('check') : '<span style="width:13px"></span>'}
      <span>${escapeHTML(tEffort(ef))}</span>
    </button>`).join('');
  ctx.innerHTML = `
    <div class="ctx-section">
      <div class="ctx-section__head"><span>${t('model') + 's'}</span><span class="ctx-kbd">⇧ Ctrl I</span></div>
      ${m}
    </div>
    <hr/>
    <div class="ctx-section">
      <div class="ctx-section__head"><span>${t('eff_faible') === 'Low' ? 'Effort' : 'Effort'}</span><span class="ctx-kbd">⇧ Ctrl E</span></div>
      ${e}
    </div>
  `;
  openMenuAbove(anchor);
  ctx.onclick = (ev) => {
    const btn = ev.target.closest('button[data-section]');
    if (!btn) return;
    if (btn.dataset.section === 'model') modelState.currentModel = btn.dataset.id;
    else if (btn.dataset.section === 'effort') modelState.currentEffort = btn.dataset.id;
    syncModelChip();
    hideCtx();
  };
}
function syncModelChip() {
  const mo = modelState.models.find(m => m.id === modelState.currentModel);
  const ef = modelState.efforts.find(m => m.id === modelState.currentEffort);
  if (!mo || !ef || !modelChipBtn) return;
  const parts = mo.label.split(' ');
  const name = parts.slice(0, 2).join(' ');
  const tail = parts.slice(2).join(' ');
  modelChipBtn.querySelector('.model-chip__name').textContent = name;
  modelChipBtn.querySelector('.model-chip__meta').textContent = (tail ? tail + ' · ' : '') + tEffort(ef);
}

// ---------- Context strip: Agent chip ----------
const agentPillBtn  = document.getElementById('agent-pill');
const agentPillDot  = document.getElementById('agent-pill-dot');
const agentPillName = document.getElementById('agent-pill-name');
const ACTIVE_AGENT_KEY = 'ccmod.activeAgent'; // stores agent index or null
let activeAgentIdx = (() => {
  const v = localStorage.getItem(ACTIVE_AGENT_KEY);
  return v === null ? null : Number(v);
})();

function syncAgentPill() {
  const agents = loadAgents();
  const agent  = (activeAgentIdx !== null && agents[activeAgentIdx]) ? agents[activeAgentIdx] : null;
  if (agentPillDot)  agentPillDot.style.background  = agent ? (agent.color || '#7ab389') : '#3a3a44';
  if (agentPillName) agentPillName.textContent       = agent ? agent.name : 'Default';
  agentPillBtn?.classList.toggle('is-active', !!agent);
}
syncAgentPill();

// Agent dropdown uses its own element (independent of the shared ctx/ctxmenu)
let _agentDropEl = null;
function closeAgentDropdown() {
  if (_agentDropEl) { _agentDropEl.remove(); _agentDropEl = null; }
}

function showAgentDropdown(anchor) {
  closeAgentDropdown();
  hideCtx();
  const agents = loadAgents();
  const rect   = anchor.getBoundingClientRect();

  const checkSvg = `<svg class="agent-dropdown__check" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 8 7 12 13 4"/></svg>`;

  const itemHtml = (idx, agent) => `
    <div class="agent-dropdown__item${activeAgentIdx === idx ? ' is-selected' : ''}" data-agent-pick="${idx}">
      <span class="agent-dropdown__dot" style="background:${agent.color || '#7ab389'}"></span>
      <div class="agent-dropdown__info">
        <div class="agent-dropdown__name">${escapeHTML(agent.name)}</div>
        <div class="agent-dropdown__meta">${escapeHTML(agent.type || '')}${agent.model ? ' · ' + escapeHTML(agent.model) : ''}</div>
      </div>
      ${checkSvg}
    </div>`;

  const drop = document.createElement('div');
  drop.className = 'agent-dropdown';
  drop.innerHTML = `
    <div class="agent-dropdown__head">AI Agent</div>
    <div class="agent-dropdown__item${activeAgentIdx === null ? ' is-selected' : ''}" data-agent-pick="null">
      <span class="agent-dropdown__dot" style="background:#3a3a44"></span>
      <div class="agent-dropdown__info">
        <div class="agent-dropdown__name">Default</div>
        <div class="agent-dropdown__meta">No agent — chat directly with Claude</div>
      </div>
      ${checkSvg}
    </div>
    ${agents.length
      ? agents.map((a, i) => itemHtml(i, a)).join('')
      : `<div style="padding:8px 10px;font-size:12px;color:#5a5a63">No agents yet — <span style="color:#d97757;cursor:pointer" id="adrop-go-create">create one →</span></div>`}
    <div class="agent-dropdown__sep"></div>
    <div class="agent-dropdown__manage" id="adrop-manage">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/>
      </svg>
      Manage agents…
    </div>`;

  // Position above the pill
  drop.style.left   = rect.left + 'px';
  drop.style.bottom = (window.innerHeight - rect.top + 6) + 'px';
  drop.style.top    = 'auto';
  document.body.appendChild(drop);
  _agentDropEl = drop;

  drop.addEventListener('click', e => {
    const item = e.target.closest('[data-agent-pick]');
    if (item) {
      const pick = item.dataset.agentPick;
      activeAgentIdx = pick === 'null' ? null : Number(pick);
      if (activeAgentIdx === null) localStorage.removeItem(ACTIVE_AGENT_KEY);
      else localStorage.setItem(ACTIVE_AGENT_KEY, String(activeAgentIdx));
      syncAgentPill();
      closeAgentDropdown();
      return;
    }
    if (e.target.closest('#adrop-manage') || e.target.closest('#adrop-go-create')) {
      closeAgentDropdown();
      showConsole('agents');
    }
  });

  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function outside(e) {
      if (!drop.contains(e.target) && e.target !== agentPillBtn && !agentPillBtn?.contains(e.target)) {
        closeAgentDropdown();
        document.removeEventListener('click', outside);
      }
    });
  }, 0);
}

agentPillBtn?.addEventListener('click', e => {
  e.stopPropagation();
  if (_agentDropEl) { closeAgentDropdown(); return; }
  showAgentDropdown(agentPillBtn);
});

// Helper: get active agent object (or null)
function getActiveAgent() {
  if (activeAgentIdx === null) return null;
  const agents = loadAgents();
  return agents[activeAgentIdx] || null;
}

// ---------- Composer: tokens / usage dropdown (distinct from session kebab menu) ----------
const contextBtn = document.getElementById('context-btn');
contextBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  showTokensMenu(contextBtn);
});
function showTokensMenu(anchor) {
  const usage = [
    { label: t('context_window'),  value: '477.1k / 1.0M (48%)', pct: 48, main: true },
    { label: t('limit_5h'),        value: '12% · ' + t('resets_in') + ' 4h', pct: 12 },
    { label: t('weekly_all'),      value: '69% · ' + t('resets_in') + ' 1j', pct: 69 },
    { label: t('weekly_design'),   value: '0%',                              pct: 0 },
    { label: t('sonnet_only'),     value: '35% · ' + t('resets_in') + ' 1j', pct: 35 },
  ];
  const rowFor = (u) => `
    <button class="usage-row${u.main ? ' usage-row--main' : ''}">
      <div class="usage-row__top">
        <span class="usage-row__label">${escapeHTML(u.label)}</span>
        <span class="usage-row__value">${escapeHTML(u.value)}</span>
      </div>
      <div class="usage-row__bar"><div class="usage-row__bar-fill" style="width:${u.pct}%"></div></div>
    </button>`;
  ctx.innerHTML = `
    <div class="ctx-wide">
      ${rowFor(usage[0])}
      <hr/>
      <div class="ctx-section__head"><span>${t('plan_usage')}</span><span class="ctx-kbd" style="color:#5a5a63">→</span></div>
      ${usage.slice(1).map(rowFor).join('')}
    </div>
  `;
  openMenuAbove(anchor);
  ctx.onclick = (ev) => { if (ev.target.closest('.usage-row')) hideCtx(); };
}

// Open ctx centered above the composer (not anchored to a specific button).
// Used for the consolidated Settings menu — floats over the chat area
// instead of hugging the sidebar edge.
function openAboveComposer() {
  ctx.classList.remove('hidden');
  // Anchor to the LEFT edge of the MAIN chat area (past the sidebar),
  // not the centered composer — that was leaving a big empty gap.
  const mainEl = document.querySelector('main');
  const mainRect = mainEl.getBoundingClientRect();
  const compRect = document.querySelector('.composer').getBoundingClientRect();
  const cRect = ctx.getBoundingClientRect();
  let left = mainRect.left + 12;                                             // 12px in from main area's left edge
  left = Math.min(left, window.innerWidth - cRect.width - 8);
  let top = compRect.top - cRect.height - 10;
  if (top < 8) top = compRect.bottom + 10;
  ctx.style.left = Math.round(left) + 'px';
  ctx.style.top  = Math.round(top) + 'px';
}

// Shared helper: open ctx above anchor, aligned to its right edge
function openMenuAbove(anchor) {
  ctx.classList.remove('hidden');
  const r = anchor.getBoundingClientRect();
  const cRect = ctx.getBoundingClientRect();
  let left = r.right - cRect.width;
  left = Math.max(8, Math.min(left, window.innerWidth - cRect.width - 8));
  let top = r.top - cRect.height - 6;
  if (top < 8) top = r.bottom + 6;
  ctx.style.left = left + 'px';
  ctx.style.top = top + 'px';
}

// ---------- Right panel ----------
const rightPanelBtn      = document.getElementById('right-panel-btn');
const rightPanelMenuBtn  = document.getElementById('right-panel-menu-btn');
const rightPanelTitle    = document.getElementById('right-panel-title');
const RIGHT_PANEL_KEY = 'ccmod.rightPanel';
const rightPanelTabs = [
  { id: 'apercu',    labelKey: 'rp_apercu',    icon: 'eye',          shortcut: '⇧ Ctrl P' },
  { id: 'diff',      labelKey: 'rp_diff',      icon: 'git-diff',     shortcut: '⇧ Ctrl D' },
  { id: 'terminal',  labelKey: 'rp_terminal',  icon: 'terminal',     shortcut: 'Ctrl `'   },
  { id: 'fichiers',  labelKey: 'rp_fichiers',  icon: 'folder-simple',shortcut: '⇧ Ctrl F' },
  { id: 'taches',    labelKey: 'rp_taches',    icon: 'kanban',       shortcut: ''         },
  { id: 'plan',      labelKey: 'rp_plan',      icon: 'list-bullets', shortcut: ''         },
  { id: 'shortcuts', labelKey: 'rp_shortcuts', icon: 'keyboard',     shortcut: 'Ctrl /'   },
  { id: 'mcp',       labelKey: 'rp_mcp',       icon: 'plugs-connected', shortcut: ''      },
  { id: 'git',       labelKey: 'rp_git',       icon: 'git-branch',   shortcut: ''         },
  { id: 'context',   labelKey: 'rp_context',   icon: 'gauge',        shortcut: ''         },
];

// Keyboard shortcuts reference — rendered inside the right panel when active.
const SHORTCUTS = [
  { group: 'General', items: [
    { label: 'Keyboard shortcuts',     keys: [['Ctrl', '/']] },
    { label: 'New session',            keys: [['Ctrl', 'N']] },
    { label: 'Close session',          keys: [['Ctrl', 'W']] },
    { label: 'Next session',           keys: [['⇧','Ctrl',']'], ['Ctrl','Tab']] },
    { label: 'Previous session',       keys: [['⇧','Ctrl','['], ['Ctrl','⇧','Tab']] },
    { label: "Stop Claude's response", keys: [['Esc']] },
  ]},
  { group: 'Sidebar', items: [
    { label: 'Search sessions',        keys: [['Ctrl', 'K']] },
    { label: 'New project',            keys: [['⇧','Ctrl','N']] },
    { label: 'Collapse sidebar',       keys: [['Ctrl', 'B']] },
    { label: 'Pin / unpin session',    keys: [['Ctrl', 'P']] },
  ]},
  { group: 'Panes', items: [
    { label: 'Toggle diff',            keys: [['⇧','Ctrl','D']] },
    { label: 'Toggle preview',         keys: [['⇧','Ctrl','P']] },
    { label: 'Select element in preview', keys: [['⇧','Ctrl','S']] },
    { label: 'Toggle file browser',    keys: [['⇧','Ctrl','F']] },
    { label: 'Toggle terminal',        keys: [['Ctrl','`']] },
    { label: 'Close pane',             keys: [['Ctrl','\\']] },
  ]},
  { group: 'Composer', items: [
    { label: 'Send message',           keys: [['Enter']] },
    { label: 'New line',               keys: [['⇧','Enter']] },
    { label: 'Slash commands',         keys: [['/']] },
    { label: 'Attach file',            keys: [['Ctrl','U']] },
    { label: 'Settings',               keys: [['Ctrl',',']] },
  ]},
];
function renderShortcutsPanel() {
  return `
    <div class="shortcuts">
      ${SHORTCUTS.map(sec => `
        <h3 class="shortcuts__group">${escapeHTML(sec.group)}</h3>
        <div class="shortcuts__rows">
          ${sec.items.map(it => `
            <div class="shortcuts__row">
              <span class="shortcuts__label">${escapeHTML(it.label)}</span>
              <span class="shortcuts__keys">
                ${it.keys.map((combo, i) => `
                  ${i > 0 ? '<span class="shortcuts__or">or</span>' : ''}
                  <span class="shortcuts__combo">
                    ${combo.map(k => `<kbd class="key">${escapeHTML(k)}</kbd>`).join('')}
                  </span>
                `).join('')}
              </span>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  `;
}
// ---------- Live preview helpers ----------

// Scan chat history (newest-first) for the last assistant message that contains
// an HTML / JSX / CSS / JS code block — returns { lang, code } or null.
function getLastRenderableCodeBlock() {
  if (!window.__chatHistory || !window.__chatHistory.length) return null;
  const RENDERABLE = ['html', 'jsx', 'tsx', 'react', 'css', 'javascript', 'js'];
  for (let i = window.__chatHistory.length - 1; i >= 0; i--) {
    const msg = window.__chatHistory[i];
    if (msg.role !== 'assistant') continue;
    const rx = /```([\w\-+#.]*)\n?([\s\S]*?)```/g;
    const matches = [...(msg.content || '').matchAll(rx)];
    // Walk matches newest-first within this message
    for (let j = matches.length - 1; j >= 0; j--) {
      const lang = (matches[j][1] || '').toLowerCase().trim();
      const code = (matches[j][2] || '').trimEnd();
      if (RENDERABLE.includes(lang)) return { lang, code };
    }
  }
  return null;
}

// ---------- Aperçu (Preview) panel ----------
const RENDERABLE_LANGS = ['html', 'css', 'javascript', 'js', 'jsx', 'tsx', 'react'];

function renderApercuPanel() {
  // Explicit override from "Open in panel" button takes priority
  const block = window.__apercuOverride || getLastRenderableCodeBlock() || getLastAnyCodeBlock();
  // Clear the override after consuming it
  if (window.__apercuOverride) window.__apercuOverride = null;

  if (!block) {
    return `
      <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px;text-align:center">
        <div style="opacity:.25">${iconSVG('eye')}</div>
        <p style="font-size:13px;color:#5a5a63;margin:0;line-height:1.5">
          Preview will appear here when Claude generates code.
        </p>
      </div>`;
  }

  const langLabel = (block.lang || 'code').toUpperCase();
  const canRender = RENDERABLE_LANGS.includes((block.lang || '').toLowerCase());

  // ── Live iframe preview (HTML/CSS/JS/React) ──────────────────────────────
  if (canRender) {
    const doc = buildPreviewSrcDoc(block.lang, block.code);
    const needsNet = ['jsx', 'tsx', 'react'].includes(block.lang);
    const sb = needsNet ? 'allow-scripts allow-same-origin' : 'allow-scripts';
    return `
      <div class="preview-panel preview-panel--live" style="display:flex;flex-direction:column;height:100%">
        <div class="preview-toolbar" style="display:flex;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid #1e1e24;flex-shrink:0">
          <span style="font-size:10.5px;font-weight:600;color:#5a5a63;text-transform:uppercase;letter-spacing:.06em;padding:0 4px">${escapeHTML(langLabel)}</span>
          <div class="preview-addressbar" style="flex:1;display:flex;align-items:center;gap:5px;background:#0e0e10;border:1px solid #1e1e24;border-radius:6px;padding:3px 9px">
            <i data-phosphor="circle-wavy-check" style="color:#7ab389;font-size:11px"></i>
            <span style="font-size:11.5px;color:#6a6a72">Claude · live preview</span>
          </div>
          <span id="apercu-zoom-label" style="font-size:10.5px;color:#5a5a63;min-width:28px;text-align:right"></span>
          <button class="icon-btn icon-btn--sm" id="apercu-reload"      title="Reload"><i data-phosphor="arrow-clockwise"></i></button>
          <button class="icon-btn icon-btn--sm" id="apercu-fullscreen"  title="Full-screen"><i data-phosphor="arrows-out"></i></button>
        </div>
        <div id="apercu-vp-wrap" style="flex:1;position:relative;overflow:hidden;min-height:0">
          <iframe id="apercu-iframe" sandbox="${sb}"
                  srcdoc="${doc.replace(/"/g, '&quot;')}"
                  style="position:absolute;top:0;left:0;width:1280px;height:900px;border:none;transform-origin:top left;background:#0b0b0c">
          </iframe>
        </div>
      </div>`;
  }

  // ── Code view (Python, Bash, SQL, etc.) ──────────────────────────────────
  const copyId = 'apercu-code-copy-' + Date.now();
  return `
    <div class="preview-panel preview-panel--code" style="display:flex;flex-direction:column;height:100%">
      <div class="preview-toolbar" style="display:flex;align-items:center;gap:6px;padding:5px 8px;border-bottom:1px solid #1e1e24;flex-shrink:0">
        <span style="font-size:10.5px;font-weight:600;color:#5a5a63;text-transform:uppercase;letter-spacing:.06em;padding:0 4px">${escapeHTML(langLabel)}</span>
        <div class="preview-addressbar" style="flex:1;display:flex;align-items:center;gap:5px;background:#0e0e10;border:1px solid #1e1e24;border-radius:6px;padding:3px 9px">
          <i data-phosphor="code" style="color:#6a6a72;font-size:11px"></i>
          <span style="font-size:11.5px;color:#6a6a72">Claude · code output</span>
        </div>
        <button class="icon-btn icon-btn--sm" id="${copyId}" title="Copy code"><i data-phosphor="copy"></i></button>
      </div>
      <div style="flex:1;overflow:auto;padding:16px">
        <pre style="margin:0;font-family:'JetBrains Mono',monospace;font-size:12.5px;line-height:1.6;color:#d4d4d8;white-space:pre-wrap;word-break:break-word">${escapeHTML(block.code)}</pre>
      </div>
    </div>`;
}

// Scale the apercu iframe to match the panel width (desktop viewport simulation).
// The iframe renders at 1280×900 virtual px; we scale it down to fit the wrapper.
// Called after any DOM insertion that contains the apercu panel.
function initApercuScaling(container) {
  const root  = container || document;
  const wrap  = root.getElementById?.('apercu-vp-wrap')  || root.querySelector?.('#apercu-vp-wrap');
  const frame = root.getElementById?.('apercu-iframe')   || root.querySelector?.('#apercu-iframe');
  const label = root.getElementById?.('apercu-zoom-label') || root.querySelector?.('#apercu-zoom-label');
  if (!wrap || !frame) return;

  const VIRTUAL_W = 1280;

  function applyScale() {
    const w = wrap.clientWidth;
    if (!w) return;
    const scale = w / VIRTUAL_W;
    frame.style.transform = `scale(${scale})`;
    if (label) label.textContent = Math.round(scale * 100) + '%';
  }

  applyScale();
  // Watch for panel resize (sidebar drag, window resize)
  const ro = new ResizeObserver(applyScale);
  ro.observe(wrap);
  // Stash so we can disconnect if panel is swapped out
  wrap._apercuRO = ro;
}

// Returns any code block (used for the panel code view)
function getLastAnyCodeBlock() {
  if (!window.__chatHistory?.length) return null;
  for (let i = window.__chatHistory.length - 1; i >= 0; i--) {
    const msg = window.__chatHistory[i];
    if (msg.role !== 'assistant') continue;
    const rx = /```([\w\-+#.]*)\n?([\s\S]*?)```/g;
    const matches = [...(msg.content || '').matchAll(rx)];
    for (let j = matches.length - 1; j >= 0; j--) {
      const code = (matches[j][2] || '').trimEnd();
      if (code) return { lang: (matches[j][1] || '').toLowerCase().trim() || 'code', code };
    }
  }
  return null;
}

// ---------- Tâches (Tasks) panel — Kanban board ----------
function renderTachesPanel() {
  const cols = [
    {
      id: 'backlog', label: 'Backlog', color: '#5a5a63',
      tasks: [
        { id: 'T-08', title: 'Add keyboard navigation to sidebar', tags: ['a11y'], pri: 'low' },
        { id: 'T-09', title: 'Dark/light theme auto-detection from OS', tags: ['ui'], pri: 'low' },
        { id: 'T-10', title: 'Persist open panels across sessions', tags: ['ux'], pri: 'med' },
        { id: 'T-11', title: 'Export conversation as Markdown', tags: ['export'], pri: 'low' },
      ],
    },
    {
      id: 'inprogress', label: 'In Progress', color: '#c9a96e',
      tasks: [
        { id: 'T-04', title: 'Split panel — vertical resize handle', tags: ['ui'], pri: 'high', who: 'Claude' },
        { id: 'T-05', title: 'Terminal panel edge-to-edge layout', tags: ['terminal'], pri: 'high', who: 'Claude' },
        { id: 'T-06', title: 'Context strip chip active-state sync', tags: ['ui'], pri: 'med', who: 'Claude' },
        { id: 'T-07', title: 'Electron desktop packaging', tags: ['build'], pri: 'high', who: 'Claude' },
      ],
    },
    {
      id: 'done', label: 'Done', color: '#7ab389',
      tasks: [
        { id: 'T-01', title: 'Sub-task tree with CSS grid expand', tags: ['ui'], pri: 'med' },
        { id: 'T-02', title: 'Streaming state shimmer animations (9 variants)', tags: ['anim'], pri: 'med' },
        { id: 'T-03', title: 'Context strip chips — MCP, Git, Context, Plan', tags: ['ui'], pri: 'high' },
      ],
    },
  ];

  const priBadge = p => {
    const map = { high: ['#c96442','H'], med: ['#c9a96e','M'], low: ['#5a5a63','L'] };
    const [col, lbl] = map[p] || map.low;
    return `<span class="task-card__pri" style="background:${col}22;color:${col}">${lbl}</span>`;
  };
  const tagBadge = t => `<span class="task-card__tag">${escapeHTML(t)}</span>`;

  return `
    <div class="kanban">
      <div class="kanban__header">
        <span class="kanban__title">Session tasks</span>
        <span class="kanban__meta">${cols.reduce((s,c) => s+c.tasks.length, 0)} total · ${cols.find(c=>c.id==='done').tasks.length} done</span>
      </div>
      <div class="kanban__board">
        ${cols.map(col => `
          <div class="kanban__col">
            <div class="kanban__col-head">
              <span class="kanban__col-dot" style="background:${col.color}"></span>
              <span class="kanban__col-label">${escapeHTML(col.label)}</span>
              <span class="kanban__col-count">${col.tasks.length}</span>
            </div>
            <div class="kanban__cards">
              ${col.tasks.map(t => `
                <div class="task-card${col.id === 'done' ? ' task-card--done' : ''}">
                  <div class="task-card__top">
                    <span class="task-card__id">${escapeHTML(t.id)}</span>
                    ${priBadge(t.pri)}
                    ${t.who ? `<span class="task-card__who">${escapeHTML(t.who)}</span>` : ''}
                  </div>
                  <div class="task-card__title">${escapeHTML(t.title)}</div>
                  <div class="task-card__tags">${t.tags.map(tagBadge).join('')}</div>
                </div>`).join('')}
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ---------- Diff panel ----------
function renderDiffPanel() {
  const file = (name, add, del, lines) => `
    <div class="diff-file">
      <div class="diff-file__head">
        <span class="diff-file__name">${escapeHTML(name)}</span>
        <span class="diff-stats">
          <span class="diff-stat diff-stat--add">+${add}</span>
          <span class="diff-stat diff-stat--del">-${del}</span>
        </span>
      </div>
      <div class="diff-lines">${lines}</div>
    </div>`;
  const ctx = (t) => `<div class="diff-line diff-line--ctx"><span class="diff-gutter"> </span><span class="diff-code">${escapeHTML(t)}</span></div>`;
  const add = (t) => `<div class="diff-line diff-line--add"><span class="diff-gutter">+</span><span class="diff-code">${escapeHTML(t)}</span></div>`;
  const del = (t) => `<div class="diff-line diff-line--del"><span class="diff-gutter">-</span><span class="diff-code">${escapeHTML(t)}</span></div>`;
  return `
    <div class="diff-view">
      <div class="diff-view__toolbar">
        <span class="diff-view__summary">2 files changed · <span class="diff-stat diff-stat--add">+24</span> <span class="diff-stat diff-stat--del">-8</span></span>
      </div>
      ${file('src/sidebar/SessionRow.tsx', 14, 4, `
        <div class="diff-hunk-head">@@ -38,7 +38,17 @@ function SessionRow({ session, accent })</div>
        ${ctx('  const isActive = session.id === activeId;')}
        ${ctx('  const isProcessing = session.processing;')}
        ${del("  const style = { '--accent': accent };")}
        ${add('  const style: React.CSSProperties = {')}
        ${add("    '--accent': accent ?? '#8a8a92',")}
        ${add("    '--accent-tint': colorMix(accent, 0.6),")}
        ${add("    '--accent-border': colorMix(accent, 0.45),")}
        ${add('  };')}
        ${ctx('  return (')}
        ${ctx('    <div className="session" style={style}>')}
        ${del('      <span className="session__dot" />')}
        ${add('      <span className="session__dot" aria-hidden />')}
        ${add('      <span className="session__title">{session.title}</span>')}
        ${add('      {isProcessing && <span className="session__spinner" />}')}
        ${ctx('    </div>')}
        ${ctx('  );')}`)}
      ${file('src/sidebar/style.css', 10, 4, `
        <div class="diff-hunk-head">@@ -12,8 +12,14 @@ .session {</div>
        ${ctx('  .session__dot {')}
        ${del('    background: var(--accent);')}
        ${add('    background: var(--accent, #8a8a92);')}
        ${add('    transition: background 200ms ease;')}
        ${ctx('  }')}
        ${ctx('  .session.is-active .session__title {')}
        ${del('    color: color-mix(in srgb, var(--accent) 60%, #c4c4ca);')}
        ${add('    color: var(--accent-tint, color-mix(in srgb, var(--accent) 60%, #c4c4ca));')}
        ${add('    font-weight: 500;')}
        ${add('    letter-spacing: -0.01em;')}
        ${ctx('  }')}`)}
    </div>`;
}

// ---------- Files panel ----------
function renderFilesPanel() {
  let ftId = 0;
  const dir = (name, children, open = false) => {
    const id = 'ft' + (++ftId);
    return `
      <div class="ft-node ft-node--dir${open ? ' is-open' : ''}" data-ft-id="${id}">
        <div class="ft-row" data-ft-toggle="${id}">
          <span class="ft-chev"><i data-phosphor="caret-right"></i></span>
          <i data-phosphor="folder-simple" class="ft-icon ft-icon--dir"></i>
          <span class="ft-name">${escapeHTML(name)}</span>
        </div>
        <div class="ft-children">${children}</div>
      </div>`;
  };
  const file = (name, badge = '') => `
    <div class="ft-node ft-node--file${badge ? ' ft-node--' + badge : ''}">
      <div class="ft-row">
        <span class="ft-chev"></span>
        <i data-phosphor="file" class="ft-icon"></i>
        <span class="ft-name">${escapeHTML(name)}</span>
        ${badge ? `<span class="ft-badge ft-badge--${badge}">${badge === 'modified' ? 'M' : badge === 'added' ? 'A' : '?'}</span>` : ''}
      </div>
    </div>`;
  return `
    <div class="file-tree">
      <div class="ft-search">
        <i data-phosphor="magnifying-glass" class="ft-search__icon"></i>
        <input type="text" placeholder="Filter files…" class="ft-search__input" />
      </div>
      ${dir('src', `
        ${dir('sidebar', `
          ${file('SessionRow.tsx', 'modified')}
          ${file('ProjectRow.tsx')}
          ${file('style.css', 'modified')}
          ${file('index.ts')}
        `, true)}
        ${dir('components', `
          ${file('Composer.tsx')}
          ${file('CodeBlock.tsx', 'modified')}
          ${file('Modal.tsx')}
          ${file('RightPanel.tsx', 'added')}
        `)}
        ${dir('hooks', `
          ${file('useAccent.ts', 'added')}
          ${file('useSession.ts')}
        `)}
        ${file('app.tsx')}
        ${file('icons.ts', 'added')}
        ${file('types.ts')}
      `, true)}
      ${dir('public', `${file('index.html')}`)}
      ${file('package.json')}
      ${file('vite.config.ts')}
      ${file('tailwind.config.ts')}
    </div>`;
}

// ---------- Terminal panel ----------
function renderTerminalPanel() {
  return `
    <div class="terminal-view">
      <div class="terminal-toolbar">
        <span class="terminal-toolbar__dots">
          <span class="t-dot t-dot--red"></span>
          <span class="t-dot t-dot--yellow"></span>
          <span class="t-dot t-dot--green"></span>
        </span>
        <span class="terminal-toolbar__title">bash — ~/claude-code-mods</span>
        <span class="terminal-toolbar__actions">
          <button class="icon-btn icon-btn--sm" title="New tab"><i data-phosphor="plus"></i></button>
          <button class="icon-btn icon-btn--sm" title="Clear"><i data-phosphor="trash"></i></button>
        </span>
      </div>
      <div class="terminal-body">
        <div class="t-line t-line--cmd">npm run dev</div>
        <div class="t-line t-line--blank"></div>
        <div class="t-line t-line--muted">&gt; claude-code-mods@0.1.0 dev</div>
        <div class="t-line t-line--muted">&gt; vite --port 5181 --open</div>
        <div class="t-line t-line--blank"></div>
        <div class="t-line"><span class="t-chip">VITE v5.4.21</span> ready in <span class="t-hi">312</span> ms</div>
        <div class="t-line t-line--blank"></div>
        <div class="t-line"><span class="t-arrow">➜</span>  Local:   <span class="t-link">http://localhost:5181/</span></div>
        <div class="t-line t-line--dim"><span class="t-arrow">➜</span>  Network: use <kbd class="t-key">--host</kbd> to expose</div>
        <div class="t-line t-line--blank"></div>
        <div class="t-line t-line--cmd">git diff --stat HEAD</div>
        <div class="t-line"> src/sidebar/SessionRow.tsx | <span class="t-add">++++++++</span><span class="t-del">----</span></div>
        <div class="t-line"> src/sidebar/style.css      | <span class="t-add">+++++</span><span class="t-del">--</span></div>
        <div class="t-line t-line--dim"> 2 files changed, 24 insertions(+), 8 deletions(-)</div>
        <div class="t-line t-line--blank"></div>
        <div class="t-prompt">
          <span class="t-prompt__cwd">~/claude-code-mods</span>
          <span class="t-prompt__sym"> $ </span>
          <span class="t-cursor"></span>
        </div>
      </div>
    </div>`;
}

// ---------- Plan panel ----------
// ---------- MCP panel ----------
function renderMcpPanel() {
  const servers = [
    { name: 'd3bugr',            tools: 12, status: 'connected', color: '#7ab389',
      toolList: ['subfinder','amass','httpx','nuclei','nmap','sqlmap','ffuf','gobuster','nikto','whatweb','wappalyzer','dirsearch'] },
    { name: 'supabase',          tools: 8,  status: 'connected', color: '#6a86c3',
      toolList: ['execute_sql','list_tables','apply_migration','create_branch','list_projects','get_project','deploy_edge_function','get_logs'] },
    { name: 'Desktop Commander', tools: 5,  status: 'connected', color: '#c9a96e',
      toolList: ['start_process','read_file','write_file','list_directory','kill_process'] },
    { name: 'filesystem',        tools: 4,  status: 'idle',      color: '#5a5a63',
      toolList: ['read_file','write_file','list_dir','search'] },
  ];
  const total = servers.reduce((s, x) => s + x.tools, 0);
  const statusDot = s => s === 'connected'
    ? `<span style="width:6px;height:6px;border-radius:50%;background:#7ab389;display:inline-block;flex-shrink:0"></span>`
    : `<span style="width:6px;height:6px;border-radius:50%;background:#3a3a44;display:inline-block;flex-shrink:0"></span>`;
  return `
    <div class="plan-view">
      <div class="plan-header">
        <span class="plan-header__title">MCP Servers</span>
        <span class="plan-header__meta">${total} tools · ${servers.filter(s=>s.status==='connected').length} active</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">
        ${servers.map(srv => `
          <div style="background:#1a1a1d;border:1px solid #27272c;border-radius:9px;padding:10px 12px;">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:${srv.status==='connected'?'8':'0'}px">
              ${statusDot(srv.status)}
              <span style="font-size:12.5px;font-weight:500;color:#d4d4da;flex:1">${escapeHTML(srv.name)}</span>
              <span style="font-size:10.5px;color:#5a5a63;background:#0e0e10;border:1px solid #27272c;padding:1px 7px;border-radius:5px">${srv.tools} tools</span>
            </div>
            ${srv.status==='connected' ? `
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${srv.toolList.map(tool => `
                <span style="font-size:10px;color:#6a6a72;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:4px;padding:1px 6px;font-family:monospace">${escapeHTML(tool)}</span>
              `).join('')}
            </div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>`;
}

// ---------- Git panel ----------
function renderGitPanel() {
  const branch = 'main';
  const commits = [
    { hash: 'a3f2c1',  msg: 'feat: sub-task tree for plan panel',        time: 'just now',  add: 87,  del: 3  },
    { hash: 'b7d9e4',  msg: 'feat: streaming shimmer on active task',     time: '2h ago',    add: 24,  del: 2  },
    { hash: 'c1a8f3',  msg: 'feat: right panel resize handle',            time: '3h ago',    add: 56,  del: 8  },
    { hash: 'e5b2a0',  msg: 'feat: plan panel with progress & states',    time: '5h ago',    add: 140, del: 0  },
    { hash: 'f9c3d7',  msg: 'fix: pre whitespace causing blank lines',    time: '6h ago',    add: 4,   del: 4  },
  ];
  const modified = [
    { file: 'app.js',       status: 'M', add: 87, del: 3 },
    { file: 'style.css',    status: 'M', add: 62, del: 1 },
    { file: 'index.html',   status: 'M', add: 45, del: 0 },
  ];
  const statusColor = { M: '#c9a96e', A: '#7ab389', D: '#c96442' };
  return `
    <div class="plan-view">
      <div class="plan-header" style="margin-bottom:2px">
        <span class="plan-header__title" style="display:flex;align-items:center;gap:7px">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#F05133"><path d="M23.546 10.93 13.067.452c-.604-.603-1.582-.603-2.188 0L8.708 2.627l2.76 2.76c.645-.215 1.379-.07 1.889.441.516.515.658 1.258.438 1.9l2.658 2.66c.645-.223 1.387-.078 1.9.435.721.72.721 1.884 0 2.604-.719.719-1.881.719-2.6 0-.539-.541-.674-1.337-.404-1.996L12.86 8.955v6.525c.176.086.342.203.488.348.713.721.713 1.883 0 2.6-.719.721-1.889.721-2.609 0-.719-.719-.719-1.879 0-2.598.182-.18.387-.316.605-.406V8.835c-.217-.091-.424-.222-.6-.401-.545-.545-.676-1.342-.396-2.009L7.636 3.7.45 10.881c-.6.605-.6 1.584 0 2.189l10.48 10.477c.604.604 1.582.604 2.186 0l10.43-10.43c.605-.603.605-1.582 0-2.187"/></svg>
          ${escapeHTML(branch)}
        </span>
        <span class="plan-header__meta">${modified.length} modified</span>
      </div>

      <div style="display:flex;flex-direction:column;gap:2px;margin-bottom:14px">
        ${modified.map(f => `
          <div style="display:flex;align-items:center;gap:8px;padding:5px 9px;background:#1a1a1d;border:1px solid #27272c;border-radius:7px">
            <span style="font-size:10.5px;font-weight:700;color:${statusColor[f.status]||'#8a8a92'};min-width:10px">${f.status}</span>
            <span style="font-size:11.5px;color:#b4b4bc;flex:1;font-family:monospace">${escapeHTML(f.file)}</span>
            <span style="font-size:10px;color:#7ab389">+${f.add}</span>
            <span style="font-size:10px;color:#c96442">-${f.del}</span>
          </div>
        `).join('')}
      </div>

      <div style="font-size:10.5px;font-weight:600;color:#4a4a55;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px">Recent commits</div>
      <div style="display:flex;flex-direction:column;gap:3px">
        ${commits.map((c, i) => `
          <div style="display:flex;align-items:flex-start;gap:8px;padding:6px 9px;background:${i===0?'rgba(201,100,66,0.05)':'#1a1a1d'};border:1px solid ${i===0?'rgba(201,100,66,0.2)':'#27272c'};border-radius:7px">
            <span style="font-size:10px;color:#3a3a44;font-family:monospace;padding-top:1px;flex-shrink:0">${c.hash}</span>
            <span style="font-size:11.5px;color:#9a9aa4;flex:1;line-height:1.35">${escapeHTML(c.msg)}</span>
            <span style="font-size:10px;color:#4a4a55;white-space:nowrap;padding-top:1px">${c.time}</span>
          </div>
        `).join('')}
      </div>
    </div>`;
}

// ---------- Context panel ----------
function renderContextPanel() {
  const used = 12450, total = 200000;
  const pct = (used / total * 100).toFixed(1);
  const breakdown = [
    { label: 'System prompt', tokens: 2100,  color: '#6a86c3' },
    { label: 'Conversation',  tokens: 8200,  color: '#c96442' },
    { label: 'Files & tools', tokens: 2150,  color: '#7ab389' },
  ];
  // Arc gauge — SVG circle trick, r=38, circumference≈238.76
  const r = 38, circ = 2 * Math.PI * r;
  const usedArc = circ * (pct / 100) * 0.75; // 75% of circle is used range
  const bgArc   = circ * 0.75;
  return `
    <div class="plan-view">
      <div class="plan-header">
        <span class="plan-header__title">Context Window</span>
        <span class="plan-header__meta">Claude Opus 4.7 · 1M</span>
      </div>

      <!-- Arc gauge -->
      <div style="display:flex;justify-content:center;padding:12px 0 8px">
        <div style="position:relative;width:100px;height:68px">
          <svg width="100" height="68" viewBox="0 0 100 68">
            <!-- bg arc -->
            <circle cx="50" cy="54" r="${r}" fill="none" stroke="#27272c" stroke-width="7"
              stroke-dasharray="${bgArc} ${circ}" stroke-dashoffset="${circ * 0.125}"
              stroke-linecap="round" transform="rotate(180 50 54)"/>
            <!-- used arc -->
            <circle cx="50" cy="54" r="${r}" fill="none"
              stroke="url(#ctxGrad)" stroke-width="7"
              stroke-dasharray="${usedArc.toFixed(1)} ${circ}" stroke-dashoffset="${circ * 0.125}"
              stroke-linecap="round" transform="rotate(180 50 54)"/>
            <defs>
              <linearGradient id="ctxGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%"   stop-color="#7ab389"/>
                <stop offset="100%" stop-color="#c96442"/>
              </linearGradient>
            </defs>
          </svg>
          <div style="position:absolute;bottom:6px;left:0;right:0;text-align:center">
            <div style="font-size:18px;font-weight:700;color:#e7e7ea;line-height:1">${pct}%</div>
            <div style="font-size:9.5px;color:#5a5a63;margin-top:1px">used</div>
          </div>
        </div>
      </div>

      <!-- Token counts -->
      <div style="display:flex;justify-content:center;gap:4px;margin-bottom:14px">
        <span style="font-size:19px;font-weight:700;color:#e7e7ea;font-variant-numeric:tabular-nums">${(used/1000).toFixed(1)}k</span>
        <span style="font-size:13px;color:#4a4a55;align-self:flex-end;padding-bottom:2px">/ ${(total/1000).toFixed(0)}k tokens</span>
      </div>

      <!-- Breakdown bars -->
      <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:14px">
        ${breakdown.map(b => {
          const bPct = (b.tokens / used * 100).toFixed(0);
          return `
          <div>
            <div style="display:flex;justify-content:space-between;margin-bottom:3px">
              <span style="font-size:11px;color:#7a7a88">${escapeHTML(b.label)}</span>
              <span style="font-size:11px;color:#5a5a63;font-variant-numeric:tabular-nums">${(b.tokens/1000).toFixed(1)}k</span>
            </div>
            <div style="height:3px;background:#1e1e24;border-radius:99px;overflow:hidden">
              <div style="height:100%;width:${bPct}%;background:${b.color};border-radius:99px"></div>
            </div>
          </div>`;
        }).join('')}
      </div>

      <!-- Meta row -->
      <div style="display:flex;gap:6px">
        <div style="flex:1;background:#1a1a1d;border:1px solid #27272c;border-radius:8px;padding:8px 10px;text-align:center">
          <div style="font-size:14px;font-weight:600;color:#e7e7ea">12</div>
          <div style="font-size:10px;color:#5a5a63;margin-top:1px">tools</div>
        </div>
        <div style="flex:1;background:#1a1a1d;border:1px solid #27272c;border-radius:8px;padding:8px 10px;text-align:center">
          <div style="font-size:14px;font-weight:600;color:#e7e7ea">$0.04</div>
          <div style="font-size:10px;color:#5a5a63;margin-top:1px">est. cost</div>
        </div>
        <div style="flex:1;background:#1a1a1d;border:1px solid #27272c;border-radius:8px;padding:8px 10px;text-align:center">
          <div style="font-size:14px;font-weight:600;color:#e7e7ea">0</div>
          <div style="font-size:10px;color:#5a5a63;margin-top:1px">files</div>
        </div>
      </div>
    </div>`;
}

let _planExpandedIdx = -1; // expanded task index (-1 = none forced)

// Live todos from Claude's TodoWrite tool calls — null means use placeholder
window.__planTodos = null;

function renderPlanPanel() {
  // ── Status map ───────────────────────────────────────────────────────────
  function mapStatus(s) {
    if (!s) return 'pending';
    s = s.toLowerCase().trim();
    if (s === 'completed' || s === 'done' || s === 'complete' || s === 'finished' || s === 'closed') return 'done';
    if (s === 'in_progress' || s === 'in-progress' || s === 'active' || s === 'wip' || s === 'doing') return 'active';
    if (s === 'cancelled' || s === 'canceled' || s === 'skipped') return 'cancelled';
    if (s === 'blocked'   || s === 'waiting' || s === 'on-hold') return 'blocked';
    if (s === 'review'    || s === 'in-review' || s === 'reviewing' || s === 'pr') return 'review';
    return 'pending';
  }

  const STATUS_ICON  = { done: 'check-circle', active: 'circle-dashed', pending: 'circle', cancelled: 'x-circle', blocked: 'warning', review: 'magnifying-glass' };
  const STATUS_LABEL = { done: 'Done', active: 'In Progress', pending: '', cancelled: 'Cancelled', blocked: 'Blocked', review: 'In Review' };
  const chevronSVG   = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M2.5 1.5L5.5 4L2.5 6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const liveTodos = window.__planTodos;

  if (!liveTodos || liveTodos.length === 0) {
    return `
      <div class="plan-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".3">
          <rect x="3" y="5" width="18" height="2" rx="1"/><rect x="3" y="11" width="14" height="2" rx="1"/>
          <rect x="3" y="17" width="10" height="2" rx="1"/>
        </svg>
        <p class="plan-empty__title">No plan yet</p>
        <p class="plan-empty__hint">Ask Claude to create a plan — it will output a <code>plan</code> block that auto-populates this panel.</p>
      </div>`;
  }

  const tasks = liveTodos.map(t => ({
    status:   mapStatus(t.status),
    title:    t.content || t.title || '(task)',
    priority: (t.priority || 'medium').toLowerCase(),
    time:     t.time || t.timeRange || null,
    note:     t.note || null,
    subs:     (t.subtasks || t.subs || []).map(s => ({
      status: mapStatus(typeof s === 'string' ? 'pending' : (s.status || 'pending')),
      title:  typeof s === 'string' ? s : (s.content || s.title || s),
    })),
    id: t.id,
  }));

  if (_planExpandedIdx === -1) {
    const firstActive = tasks.findIndex(t => t.status === 'active' && t.subs?.length);
    _planExpandedIdx = firstActive;
  }

  const done   = tasks.filter(t => t.status === 'done' || t.status === 'cancelled').length;
  const active = tasks.filter(t => t.status === 'active').length;
  const pct    = tasks.length ? Math.round(done / tasks.length * 100) : 0;

  function renderSubtasks(subs) {
    if (!subs?.length) return '';
    return `
      <div class="plan-subtasks-wrap">
        <div class="plan-subtasks-inner">
          <div class="plan-subtasks">
            ${subs.map(s => `
              <div class="plan-subtask plan-subtask--${s.status}">
                <span class="plan-subtask__dot"></span>
                <span class="plan-subtask__icon"><i data-phosphor="${STATUS_ICON[s.status] || 'circle'}"></i></span>
                <span class="plan-subtask__title">${escapeHTML(s.title)}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="plan-view plan-view--live">
      <div class="plan-header">
        <span class="plan-header__title">Current tasks <span style="font-weight:400;color:#5a5a6a">${active > 0 ? `· ${active} active` : ''}</span></span>
        <span class="plan-header__meta">${done} / ${tasks.length}</span>
      </div>
      <div class="plan-progress">
        <div class="plan-progress__bar" style="width:${pct}%"></div>
      </div>
      <div class="plan-tasks">
        ${tasks.map((task, i) => {
          const hasSubs    = task.subs?.length > 0;
          const isExpanded = hasSubs && _planExpandedIdx === i;
          const statusLabel = STATUS_LABEL[task.status] || '';
          const cls = [
            'plan-task', `plan-task--${task.status}`,
            hasSubs ? 'plan-task--has-subs' : '',
            isExpanded ? 'plan-task--expanded' : '',
          ].filter(Boolean).join(' ');
          return `
          <div class="${cls}" data-plan-idx="${i}" data-priority="${task.priority}">
            <span class="plan-task__num">${i + 1}</span>
            <span class="plan-task__icon" title="${task.status}"><i data-phosphor="${STATUS_ICON[task.status]}"></i></span>
            <div class="plan-task__body">
              <div class="plan-task__title-row">
                ${hasSubs ? `<span class="plan-task__chevron">${chevronSVG}</span>` : ''}
                <span class="plan-task__title">${escapeHTML(task.title)}</span>
                ${task.time ? `<span class="plan-task__time">${escapeHTML(task.time)}</span>` : ''}
                ${statusLabel ? `<span class="plan-task__status-pill">${statusLabel}</span>` : ''}
                <span class="plan-task__pri plan-task__pri--${task.priority}" title="${task.priority} priority"></span>
              </div>
              ${task.note ? `<div class="plan-task__note">${escapeHTML(task.note)}</div>` : ''}
              ${hasSubs ? renderSubtasks(task.subs) : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

let currentRightPanel = localStorage.getItem(RIGHT_PANEL_KEY + '.tab') || 'apercu';

// ---------- Split panel state ----------
let _splitMode     = false;
let _splitTopTab   = currentRightPanel;
let _splitBottomTab = 'terminal';
let _splitTopPx    = null;   // persisted height of top pane (px)

// Tabs available in the split mini-selectors
const SPLIT_TABS = [
  { id: 'apercu',   icon: 'eye',             label: 'Preview'  },
  { id: 'terminal', icon: 'terminal-window', label: 'Terminal' },
  { id: 'diff',     icon: 'git-diff',        label: 'Diff'     },
  { id: 'plan',     icon: 'list-checks',     label: 'Plan'     },
  { id: 'taches',   icon: 'kanban',          label: 'Tasks'    },
  { id: 'git',      icon: 'git-branch',      label: 'Git'      },
  { id: 'mcp',      icon: 'plug',            label: 'MCP'      },
  { id: 'context',  icon: 'chart-bar',       label: 'Context'  },
  { id: 'fichiers', icon: 'folder-open',     label: 'Files'    },
];

function renderPanelContent(id) {
  const tab = rightPanelTabs.find(x => x.id === id) || rightPanelTabs[0];
  const label = t(tab.labelKey);
  let body;
  if      (id === 'shortcuts') body = renderShortcutsPanel();
  else if (id === 'apercu')    body = renderApercuPanel();
  else if (id === 'taches')    body = renderTachesPanel();
  else if (id === 'diff')      body = renderDiffPanel();
  else if (id === 'fichiers')  body = renderFilesPanel();
  else if (id === 'terminal')  body = renderTerminalPanel();
  else if (id === 'plan')      body = renderPlanPanel();
  else if (id === 'mcp')       body = renderMcpPanel();
  else if (id === 'git')       body = renderGitPanel();
  else if (id === 'context')   body = renderContextPanel();
  else body = `
    <div class="right-panel__empty">
      <div class="right-panel__empty-icon">${iconSVG(tab.icon)}</div>
      <div class="right-panel__empty-text">${escapeHTML(label)}</div>
    </div>`;
  return body;
}

function splitPaneMiniHead(activeId, pane) {
  const activeTab = SPLIT_TABS.find(s => s.id === activeId);
  const labelText = pane === 'top' ? 'TOP' : 'BTM';
  return `<span class="split-pane__label">${labelText}</span>` +
    SPLIT_TABS.map(st => `
    <button class="split-tab${st.id === activeId ? ' is-active' : ''}"
            data-split-pane="${pane}" data-split-tab="${st.id}">
      ${st.label}
    </button>`).join('');
}

function renderSplitBody() {
  const topPx    = _splitTopPx || 260;
  return `
    <div class="split-pane" id="split-pane-top" style="height:${topPx}px;flex:none">
      <div class="split-pane__head" id="split-head-top">${splitPaneMiniHead(_splitTopTab, 'top')}</div>
      <div class="split-pane__content" id="split-content-top">${renderPanelContent(_splitTopTab)}</div>
    </div>
    <div class="split-divider" id="split-divider"></div>
    <div class="split-pane" id="split-pane-bottom">
      <div class="split-pane__head" id="split-head-bottom">${splitPaneMiniHead(_splitBottomTab, 'bottom')}</div>
      <div class="split-pane__content" id="split-content-bottom">${renderPanelContent(_splitBottomTab)}</div>
    </div>`;
}

function setSplitPaneContent(pane, tabId) {
  const isTop   = pane === 'top';
  const headId  = isTop ? 'split-head-top'    : 'split-head-bottom';
  const contId  = isTop ? 'split-content-top' : 'split-content-bottom';
  if (isTop) _splitTopTab = tabId; else _splitBottomTab = tabId;
  // Update active state on mini-tabs
  document.querySelectorAll(`#${headId} .split-tab`).forEach(b =>
    b.classList.toggle('is-active', b.dataset.splitTab === tabId));
  const content = document.getElementById(contId);
  if (!content) return;
  // Terminal is edge-to-edge inside split pane — handled by CSS :has() selector
  // but we still need to render into the content element
  content.innerHTML = renderPanelContent(tabId);
  if (window.renderIcons) window.renderIcons(content);
  wirePlanTabEvents(tabId, content);
}

function wireSplitPaneTabs(bodyEl) {
  bodyEl.querySelectorAll('.split-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      setSplitPaneContent(btn.dataset.splitPane, btn.dataset.splitTab);
    });
  });
}

function wirePlanTabEvents(tabId, bodyEl) {
  if (tabId === 'plan') {
    bodyEl.querySelectorAll('.plan-task--has-subs').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.planIdx, 10);
        _planExpandedIdx = (_planExpandedIdx === idx) ? -1 : idx;
        // Re-render in the same container
        const content = el.closest('.split-pane__content') || document.getElementById('right-panel-body');
        if (content) {
          content.innerHTML = renderPanelContent('plan');
          if (window.renderIcons) window.renderIcons(content);
          wirePlanTabEvents('plan', content);
        }
      });
    });
  }
}

// Split divider drag
let _splitDrag = null;
document.addEventListener('mousedown', (e) => {
  if (!e.target.closest('#split-divider')) return;
  e.preventDefault();
  const topPane = document.getElementById('split-pane-top');
  _splitDrag = { startY: e.clientY, startH: topPane ? topPane.getBoundingClientRect().height : 260 };
  document.getElementById('split-divider')?.classList.add('is-dragging');
});
document.addEventListener('mousemove', (e) => {
  if (!_splitDrag) return;
  const delta = e.clientY - _splitDrag.startY;
  const bodyEl = document.getElementById('right-panel-body');
  const maxH   = bodyEl ? bodyEl.getBoundingClientRect().height - 120 : 9999;
  const newH   = Math.max(80, Math.min(maxH, _splitDrag.startH + delta));
  const topPane = document.getElementById('split-pane-top');
  if (topPane) { topPane.style.height = newH + 'px'; _splitTopPx = newH; }
});
document.addEventListener('mouseup', () => {
  if (!_splitDrag) return;
  _splitDrag = null;
  document.getElementById('split-divider')?.classList.remove('is-dragging');
});

function applyToggleSplitMode() {
  const splitBtn = document.getElementById('right-panel-split-btn');
  const bodyEl   = document.getElementById('right-panel-body');

  if (_splitMode) {
    // Auto-open the panel if it's closed
    if (!document.body.classList.contains('right-panel-open')) {
      setRightPanelOpen(true);
    }
    // Sync top tab to current main tab
    _splitTopTab = currentRightPanel;
    // Remove any terminal-specific body class
    bodyEl.classList.remove('rp-body--terminal');
    bodyEl.classList.add('is-split');
    bodyEl.innerHTML = renderSplitBody();
    if (window.renderIcons) window.renderIcons(bodyEl);
    wireSplitPaneTabs(bodyEl);
    wirePlanTabEvents(_splitTopTab, document.getElementById('split-content-top'));
    wirePlanTabEvents(_splitBottomTab, document.getElementById('split-content-bottom'));
    splitBtn?.classList.add('is-active');
    splitBtn?.setAttribute('aria-pressed', 'true');
  } else {
    bodyEl.classList.remove('is-split');
    splitBtn?.classList.remove('is-active');
    splitBtn?.setAttribute('aria-pressed', 'false');
    // Re-render the main tab normally (will re-add terminal class if needed)
    bodyEl.innerHTML = renderPanelContent(currentRightPanel);
    bodyEl.classList.toggle('rp-body--terminal', currentRightPanel === 'terminal');
    if (window.renderIcons) window.renderIcons(bodyEl);
    wirePlanTabEvents(currentRightPanel, bodyEl);
  }
}

// Wire split toggle button — runs after this script evaluates (DOM is ready at that point)
function wireSplitBtn() {
  const btn = document.getElementById('right-panel-split-btn');
  if (!btn || btn._splitWired) return;
  btn._splitWired = true;
  btn.addEventListener('click', () => {
    _splitMode = !_splitMode;
    applyToggleSplitMode();
  });
}
// Defer to next microtask so all DOM elements are guaranteed available
queueMicrotask(wireSplitBtn);

function setRightPanelOpen(open) {
  document.body.classList.toggle('right-panel-open', open);
  if (open) {
    // Restore persisted width (overrides the CSS 360px default)
    const saved = parseInt(localStorage.getItem(RP_WIDTH_KEY), 10);
    if (saved >= RP_MIN && saved <= RP_MAX) {
      rightPanelEl.style.width = saved + 'px';
    }
  } else {
    // Clear inline width so CSS 'width: 0' takes effect
    rightPanelEl.style.width = '';
  }
  localStorage.setItem(RIGHT_PANEL_KEY + '.open', open ? '1' : '0');
}
function setRightPanelTab(id) {
  currentRightPanel = id;
  const tab   = rightPanelTabs.find(x => x.id === id) || rightPanelTabs[0];
  const label = t(tab.labelKey);
  if (rightPanelTitle) rightPanelTitle.textContent = label;
  localStorage.setItem(RIGHT_PANEL_KEY + '.tab', id);

  const bodyEl = document.getElementById('right-panel-body');

  if (_splitMode) {
    // In split mode — update the top pane and refresh the whole split layout
    _splitTopTab = id;
    bodyEl.classList.add('is-split');
    bodyEl.innerHTML = renderSplitBody();
    if (window.renderIcons) window.renderIcons(bodyEl);
    wireSplitPaneTabs(bodyEl);
    wirePlanTabEvents(_splitTopTab, document.getElementById('split-content-top'));
    wirePlanTabEvents(_splitBottomTab, document.getElementById('split-content-bottom'));
    if (_splitTopTab === 'apercu' || _splitBottomTab === 'apercu') {
      requestAnimationFrame(() => initApercuScaling(bodyEl));
    }
  } else {
    bodyEl.classList.remove('is-split');
    // Edge-to-edge modes
    bodyEl.classList.toggle('rp-body--terminal', id === 'terminal');
    bodyEl.classList.toggle('rp-body--apercu',   id === 'apercu');
    bodyEl.innerHTML = renderPanelContent(id);
    if (window.renderIcons) window.renderIcons(bodyEl);
    wirePlanTabEvents(id, bodyEl);
    if (id === 'apercu') requestAnimationFrame(() => initApercuScaling(bodyEl));
  }

  // Sync context-strip chips
  syncCtxChips();
}

// ---------- Context strip chip sync ----------
function syncCtxChips() {
  const isOpen = document.body.classList.contains('right-panel-open');
  document.querySelectorAll('.ctx-chip[data-ctx-tab]').forEach(chip => {
    chip.classList.toggle('is-active', isOpen && chip.dataset.ctxTab === currentRightPanel);
  });
}

// Context strip click wiring
document.querySelectorAll('.ctx-chip[data-ctx-tab]').forEach(chip => {
  chip.addEventListener('click', () => {
    const tabId = chip.dataset.ctxTab;
    const isAlreadyActive = document.body.classList.contains('right-panel-open')
      && currentRightPanel === tabId;
    if (isAlreadyActive) {
      // Toggle off — close the panel
      setRightPanelOpen(false);
      syncCtxChips();
    } else {
      setRightPanelOpen(true);
      setRightPanelTab(tabId);
    }
  });
});

// ---------- Right-panel resize ----------
const rightPanelEl      = document.getElementById('right-panel');
const rightPanelResizer = document.getElementById('right-panel-resizer');
const RP_WIDTH_KEY = 'ccmod.rightPanelWidth';
const RP_MIN = 260;
const RP_MAX = 700;

// Restore persisted width on page load if panel is already open
(function applyRPWidth() {
  const saved = parseInt(localStorage.getItem(RP_WIDTH_KEY), 10);
  if (saved >= RP_MIN && saved <= RP_MAX && document.body.classList.contains('right-panel-open')) {
    rightPanelEl.style.width = saved + 'px';
  }
})();

let rpDrag = null;
rightPanelResizer?.addEventListener('mousedown', (e) => {
  e.preventDefault();
  rpDrag = { startX: e.clientX, startW: rightPanelEl.getBoundingClientRect().width };
  rightPanelResizer.classList.add('is-dragging');
  document.body.classList.add('is-resizing-rp');
});
document.addEventListener('mousemove', (e) => {
  if (!rpDrag) return;
  // Moving left (negative delta) widens the panel
  const delta = e.clientX - rpDrag.startX;
  const w = Math.max(RP_MIN, Math.min(RP_MAX, rpDrag.startW - delta));
  rightPanelEl.style.width = w + 'px';
});
document.addEventListener('mouseup', () => {
  if (!rpDrag) return;
  rpDrag = null;
  rightPanelResizer?.classList.remove('is-dragging');
  document.body.classList.remove('is-resizing-rp');
  const w = parseInt(rightPanelEl.style.width, 10);
  if (w >= RP_MIN) localStorage.setItem(RP_WIDTH_KEY, String(w));
});

// Sidebar-right icon: pure toggle (open ↔ closed)
rightPanelBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = document.body.classList.contains('right-panel-open');
  if (isOpen) {
    setRightPanelOpen(false);
    syncCtxChips();
  } else {
    setRightPanelOpen(true);
    setRightPanelTab(currentRightPanel);
  }
});
// Caret: opens the tab-selector menu (auto-opens the panel if closed)
rightPanelMenuBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!document.body.classList.contains('right-panel-open')) {
    setRightPanelOpen(true);
    setRightPanelTab(currentRightPanel);
  }
  showRightPanelMenu(rightPanelMenuBtn);
});

function showRightPanelMenu(anchor) {
  ctx.innerHTML = rightPanelTabs.map(tab => `
    <button data-tab="${tab.id}">
      ${iconSVG(tab.icon)}
      <span>${escapeHTML(t(tab.labelKey))}</span>
      ${currentRightPanel === tab.id ? iconSVG('check') : (tab.shortcut ? `<span class="ctx-kbd">${tab.shortcut}</span>` : '')}
    </button>
  `).join('');
  ctx.classList.remove('hidden');
  const r = anchor.getBoundingClientRect();
  const cRect = ctx.getBoundingClientRect();
  let left = r.right - cRect.width;
  left = Math.max(8, Math.min(left, window.innerWidth - cRect.width - 8));
  ctx.style.left = left + 'px';
  ctx.style.top = (r.bottom + 6) + 'px';
  ctx.onclick = (ev) => {
    const btn = ev.target.closest('button[data-tab]');
    if (!btn) return;
    setRightPanelTab(btn.dataset.tab);
    hideCtx();
  };
}

// Restore panel state on load
if (localStorage.getItem(RIGHT_PANEL_KEY + '.open') === '1') {
  setRightPanelOpen(true);
  setRightPanelTab(currentRightPanel);
}
// Ensure split btn is wired (called after all DOM-querying code above)
wireSplitBtn();

// ---------- Mic (stub — blinking when "recording") ----------
const micBtn = document.getElementById('mic-btn');
let micOn = false;
micBtn?.addEventListener('click', () => {
  micOn = !micOn;
  micBtn.classList.toggle('is-recording', micOn);
});

// ---------- Mic: device-selection dropdown (the caret next to the mic) ----------
const micSelectBtn = document.getElementById('mic-select-btn');
const micState = {
  device: 'default',
  holdToRecord: true,
  devices: [
    { id: 'default',   label: 'Default - Microphone (ROG Theta Ultimate 7.1)' },
    { id: 'comms',     label: 'Communications - Microphone (ROG Theta Ultimate 7.1)' },
    { id: 'rog',       label: 'Microphone (ROG Theta Ultimate 7.1 gaming headset)' },
  ],
};
micSelectBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  showMicMenu(micSelectBtn);
});
function showMicMenu(anchor) {
  const devices = micState.devices.map(d => `
    <button class="mic-device" data-device="${d.id}">
      <span class="mic-device__label">${escapeHTML(d.label)}</span>
      ${d.id === micState.device ? iconSVG('check') : '<span style="width:13px"></span>'}
    </button>`).join('');
  ctx.innerHTML = `
    <div class="ctx-section__head"><span>Microphone</span></div>
    ${devices}
    <hr/>
    <div class="toggle-row" data-toggle="hold">
      <span>Maintenez pour enregistrer.</span>
      <span class="toggle${micState.holdToRecord ? ' is-on' : ''}" role="switch" aria-checked="${micState.holdToRecord}">
        <span class="toggle__knob"></span>
      </span>
    </div>
  `;
  openMenuAbove(anchor);
  ctx.onclick = (ev) => {
    const dev = ev.target.closest('button[data-device]');
    if (dev) { micState.device = dev.dataset.device; hideCtx(); return; }
    const tog = ev.target.closest('[data-toggle="hold"]');
    if (tog) {
      micState.holdToRecord = !micState.holdToRecord;
      const sw = tog.querySelector('.toggle');
      sw.classList.toggle('is-on', micState.holdToRecord);
      sw.setAttribute('aria-checked', String(micState.holdToRecord));
    }
  };
}

// Session menu (folder icon on composer bar)
const sessionMenuBtn = document.getElementById('session-menu-btn');
sessionMenuBtn?.addEventListener('click', (e) => {
  e.stopPropagation();
  showSessionMenu(sessionMenuBtn);
});

function showSessionMenu(anchorBtn) {
  const found = findSession(state.activeId);
  if (!found) return;
  const session = found.list[found.index];
  ctx.innerHTML = `
    <button data-act="rename">${iconSVG('pencil-simple')}<span>Renommer</span></button>
    <button data-act="duplicate">${iconSVG('folders')}<span>Dupliquer</span></button>
    <hr/>
    <button data-act="vscode">${iconSVG('vscode')}<span>VS Code</span></button>
    <hr/>
    <button data-act="archive">${iconSVG('folder-simple')}<span>Archiver</span></button>
    <button class="danger" data-act="delete">${iconSVG('trash')}<span>Supprimer</span></button>
  `;
  ctx.classList.remove('hidden');
  // Position above the button (drop-up)
  const r = anchorBtn.getBoundingClientRect();
  const ctxRect = ctx.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left, window.innerWidth - ctxRect.width - 8));
  const top = Math.max(8, r.top - ctxRect.height - 6);
  ctx.style.left = left + 'px';
  ctx.style.top = top + 'px';
  ctx.onclick = (ev) => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'rename') renameSession(session.id);
    else if (act === 'duplicate') duplicateSession(session.id);
    else if (act === 'vscode') console.log('[stub] open in VS Code:', session.title);
    else if (act === 'archive') deleteSession(session.id);
    else if (act === 'delete') deleteSession(session.id);
    hideCtx();
  };
}

function showColorPicker(anchorEl, project) {
  const palette = [
    '#c96442', '#d97757', '#e6b84f', '#7ab389', '#5aa1a1',
    '#6a86c3', '#8a6cc3', '#b48ead', '#c9a96e', '#8a8a92',
  ];
  const swatches = palette.map(c => `
    <button class="swatch${c.toLowerCase() === project.color.toLowerCase() ? ' is-selected' : ''}"
            data-color="${c}" style="background:${c}" aria-label="${c}"></button>
  `).join('');
  ctx.innerHTML = `
    <div class="color-picker">
      <div class="color-picker__grid">${swatches}</div>
      <label class="color-picker__custom">
        <span class="swatch swatch--custom" style="background:${project.color}"></span>
        <span class="color-picker__label">Custom…</span>
        <input type="color" value="${project.color}" aria-label="Custom color" />
      </label>
    </div>
  `;
  ctx.classList.remove('hidden');
  const r = anchorEl.getBoundingClientRect();
  // show above if near the bottom, else below
  ctx.style.left = Math.max(8, Math.min(r.left - 6, window.innerWidth - 220)) + 'px';
  const belowTop = r.bottom + 6;
  const aboveTop = r.top - ctx.getBoundingClientRect().height - 6;
  ctx.style.top = (belowTop + 220 > window.innerHeight ? aboveTop : belowTop) + 'px';

  const apply = (color) => {
    project.color = color;
    render();
    hideCtx();
  };
  ctx.querySelectorAll('.swatch[data-color]').forEach(b => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      apply(b.dataset.color);
    });
  });
  const customInput = ctx.querySelector('input[type="color"]');
  customInput.addEventListener('input', (e) => {
    // Live-preview: update without closing
    project.color = e.target.value;
    anchorEl.style.background = e.target.value;
    ctx.querySelector('.swatch--custom').style.background = e.target.value;
  });
  customInput.addEventListener('change', () => { render(); hideCtx(); });
  customInput.addEventListener('click', (e) => e.stopPropagation());
}

function duplicateSession(id) {
  const found = findSession(id);
  if (!found) return;
  const src = found.list[found.index];
  const newS = createNewSession({ projectId: src.projectId, title: src.title + ' (copy)' });
  // Copy messages too
  const msgs = loadSessionMessages(id);
  saveSessionMessages(newS.id, [...msgs]);
  window.__chatHistory = loadSessionMessages(newS.id);
  switchToSession(newS.id);
  render();
}

// Composer: send / stop toggle — click the Claude logo to submit, click again to stop.
const composerSend = document.getElementById('composer-send');
// Ensure we start in the idle state (no pulse, arrow icon visible)
composerSend?.classList.remove('is-thinking');
composerSend?.addEventListener('click', () => {
  const wasThinking = composerSend.classList.toggle('is-thinking');
  composerSend.title = wasThinking ? 'Stop' : 'Send';
  // Reflect the same "processing" state on the active session in the sidebar
  const found = findSession(state.activeId);
  if (found) {
    found.list[found.index].processing = wasThinking;
    render();
  }
});

// Composer auto-grow — grows from natural 1-row height up to 180px.
const composerInput = document.getElementById('composer-input');
const autoGrow = () => {
  composerInput.style.height = 'auto';                       // reset to natural rows=1 height
  const needed = composerInput.scrollHeight;
  // Only expand if the content actually overflows a single row
  if (needed > composerInput.clientHeight) {
    composerInput.style.height = Math.min(needed, 180) + 'px';
  }
};
composerInput.addEventListener('input', autoGrow);
// Intentionally no initial call — let the textarea render at its natural rows=1 size.

// Active session title → chat breadcrumb
const chatTitle = document.getElementById('chat-title');
function syncChatTitle() {
  const found = findSession(state.activeId);
  if (!found || !chatTitle) return;
  chatTitle.textContent = found.list[found.index].title;
}
window.addEventListener('ccmod:render', syncChatTitle);
syncChatTitle();

// Generic collapsible sections (Pinned / Projects / Recent)
document.querySelectorAll('.collapsible').forEach(section => {
  const key = 'ccmod.collapsible.' + section.dataset.collapse;
  const toggle = section.querySelector('.collapsible__toggle');
  if (!toggle) return;
  if (localStorage.getItem(key) === '1') section.classList.add('is-collapsed');
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const collapsed = section.classList.toggle('is-collapsed');
    localStorage.setItem(key, collapsed ? '1' : '0');
  });
});

// ---------- Utils ----------
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

render();
applyLanguage();
syncModelChip();

// ---------- Streaming state cycle (demo) ----------
// All states: CSS modifier class + dot modifier + label text
const STREAM_STATES = [
  { meta: 'streaming', dot: 'thinking', label: 'generating a response' },
  { meta: 'thinking',  dot: 'thinking', label: 'thinking'              },
  { meta: 'coding',    dot: 'coding',   label: 'generating code'       },
  { meta: 'tools',     dot: 'tools',    label: 'using tools'           },
  { meta: 'searching', dot: 'searching',label: 'searching codebase'    },
  { meta: 'reading',   dot: 'reading',  label: 'reading files'         },
  { meta: 'running',   dot: 'running',  label: 'running command'       },
  { meta: 'applying',  dot: 'applying', label: 'applying changes'      },
  { meta: 'writing',   dot: 'writing',  label: 'writing tests'         },
];

let _streamIdx = 0;

function applyStreamState(state) {
  document.querySelectorAll('.msg__meta[class*="msg__meta--"]').forEach(el => {
    // Strip all state classes
    el.className = el.className.replace(/msg__meta--\S+/g, '').trim();
    el.classList.add('msg__meta--' + state.meta);
    el.textContent = state.label;
  });
  document.querySelectorAll('.msg__dot[class*="msg__dot--"]').forEach(el => {
    el.className = el.className.replace(/msg__dot--\S+/g, '').trim();
    el.classList.add('msg__dot--' + state.dot);
  });
}

// Cycle every 3 s — showcases all states in the MOCK messages only
let _streamInterval = setInterval(() => {
  _streamIdx = (_streamIdx + 1) % STREAM_STATES.length;
  applyStreamState(STREAM_STATES[_streamIdx]);
}, 3000);

// ─────────────────────────────────────────────────────────────────────────────
// LIVE CHAT ENGINE — connects to Claude API via Electron IPC
// ─────────────────────────────────────────────────────────────────────────────

(function initLiveChat() {
  const chatConv      = document.querySelector('.chat-conversation');
  const chatScroll    = document.getElementById('chat-scroll');
  const composerInput = document.getElementById('composer-input');
  const sendBtn       = document.getElementById('composer-send');

  if (!chatConv || !composerInput || !sendBtn) return;

  // ── State ─────────────────────────────────────────────────────────────────
  // history is a live reference to window.__chatHistory (per-session, persisted)
  // We read it fresh each send() so session switches are reflected automatically.
  let isStreaming   = false;
  let mockCleared   = false;
  let _retryTimer   = null;   // active countdown timer (null when idle)

  // Expose mdToHtml globally so _renderChatForSession can use it before the IIFE finishes
  // (hoisted via function declaration below — but for safety we also assign at the start)

  // ── Helpers ───────────────────────────────────────────────────────────────

  function scrollBottom() {
    requestAnimationFrame(() => { chatScroll.scrollTop = chatScroll.scrollHeight; });
  }

  function clearMock() {
    if (mockCleared) return;
    clearInterval(_streamInterval); // stop mock state cycling
    // Only wipe the conv element if it still has mock/demo content
    // (real messages are rendered by _renderChatForSession at startup)
    if (!window.__chatHistory || window.__chatHistory.length === 0) {
      chatConv.innerHTML = '';
    }
    mockCleared = true;
  }

  // Very simple Markdown → HTML renderer (handles the most common Claude output patterns)
  function mdToHtml(raw) {
    // 1. Fenced code blocks  ```lang\ncode\n```
    const RENDERABLE_LANGS = ['html', 'css', 'javascript', 'js', 'jsx', 'tsx', 'react'];
    let out = raw.replace(/```([\w\-+#.]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      const l    = escapeHTML(lang.trim() || 'code');
      const lRaw = lang.trim().toLowerCase();
      const c    = escapeHTML(code.trimEnd());
      const canPreview = RENDERABLE_LANGS.includes(lRaw);
      // Preview inline only makes sense for renderable types
      const previewBtn = canPreview
        ? `<button class="code-block__btn" data-action="preview" title="Preview inline"><i data-phosphor="eye"></i></button>`
        : '';
      return `<div class="code-block"><div class="code-block__head">`
           + `<span class="code-block__lang">${l}</span>`
           + `<span class="code-block__actions">`
           + `<button class="code-block__btn" data-action="copy"          title="Copy"><i data-phosphor="copy"></i></button>`
           + `<button class="code-block__btn" data-action="download"      title="Download"><i data-phosphor="download-simple"></i></button>`
           + previewBtn
           + `<button class="code-block__btn" data-action="open-in-panel" title="Open in panel"><i data-phosphor="browsers"></i></button>`
           + `</span></div><pre class="code-block__body">${c}</pre></div>`;
    });

    // 2. Process the remaining text line-by-line
    const lines = out.split('\n');
    const blocks = [];
    let para = [];

    const flushPara = () => {
      if (para.length) { blocks.push(`<p>${para.join('<br>')}</p>`); para = []; }
    };

    for (const raw of lines) {
      // Already a code-block HTML chunk — pass through
      if (raw.startsWith('<div class="code-block"')) { flushPara(); blocks.push(raw); continue; }

      let line = raw;
      // Inline code  `...`
      line = line.replace(/`([^`]+)`/g, (_, c) => `<code>${escapeHTML(c)}</code>`);
      // Already-escaped HTML from code-block pass-through is safe here
      // Bold **text**
      line = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      // Italic *text*  (not inside **)
      line = line.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
      // Headings # ## ###
      const hm = line.match(/^(#{1,3})\s+(.*)/);
      if (hm) { flushPara(); blocks.push(`<h${hm[1].length} class="md-h">${hm[2]}</h${hm[1].length}>`); continue; }
      // Bullet  - or *
      const bm = line.match(/^[-*]\s+(.*)/);
      if (bm) { flushPara(); blocks.push(`<li>${bm[1]}</li>`); continue; }
      // Numbered list  1. ...
      const nm = line.match(/^\d+\.\s+(.*)/);
      if (nm) { flushPara(); blocks.push(`<li>${nm[1]}</li>`); continue; }
      // Horizontal rule ---
      if (/^-{3,}$/.test(line.trim())) { flushPara(); blocks.push('<hr>'); continue; }
      // Blank line → paragraph break
      if (!line.trim()) { flushPara(); continue; }

      para.push(line);
    }
    flushPara();

    // Wrap consecutive <li> in <ul>
    return blocks.join('\n')
      .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => `<ul>${m}</ul>`);
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────

  function addUserBubble(text) {
    const div = document.createElement('div');
    div.className = 'msg msg--user';
    div.innerHTML = `<div class="msg__body"><p>${escapeHTML(text).replace(/\n/g,'<br>')}</p></div>`;
    chatConv.appendChild(div);
    scrollBottom();
  }

  function addAssistantBubble(agent = null) {
    const div = document.createElement('div');
    div.className = 'msg msg--assistant msg--streaming';

    // Agent chip — shown when a sub-agent is handling this turn
    const agentChip = agent ? `
      <div class="msg__agent-chip" style="--agent-color:${agent.color || '#7ab389'}">
        <span class="msg__agent-chip__pulse"></span>
        <span class="msg__agent-chip__label">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" style="opacity:.7"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>
          Using agent: <strong>${escapeHTML(agent.name)}</strong>${agent.model ? ` <span style="opacity:.55">· ${escapeHTML(agent.model)}</span>` : ''}
        </span>
      </div>` : '';

    div.innerHTML = `
      ${agentChip}
      <div class="msg__head">
        <div class="msg__dot msg__dot--thinking"></div>
        <span>Claude</span>
        <span class="msg__meta msg__meta--streaming">generating a response</span>
      </div>
      <div class="msg__activity"></div>
      <div class="msg__body"></div>`;
    chatConv.appendChild(div);
    if (window.renderIcons) window.renderIcons(div);
    scrollBottom();
    return div;
  }

  // ── Tool activity chips ─────────────────────────────────────────────────
  // Chips are injected via \x01ACT:{json}\x02 markers piggybacked on claude:chunk.
  // addActivityChip() is the single injection point; the onChunk handler calls it.
  const _activitySeen = new Set(); // dedupe across the whole streaming turn
  let   _activityDiv  = null;      // the bubble div for the current turn

  function addActivityChip(targetDiv, { type, file, tool, isSkill }) {
    const activity = targetDiv?.querySelector('.msg__activity');
    if (!activity) return;

    let key, html;

    if (type === 'read' && file) {
      key = 'read:' + file;
      if (_activitySeen.has(key)) return;
      _activitySeen.add(key);
      const icon  = isSkill ? 'book-open' : 'file-text';
      const label = isSkill ? `Reading skill <strong>${escapeHTML(file)}</strong>`
                            : `Reading <strong>${escapeHTML(file)}</strong>`;
      html = `
        <div class="msg__activity-chip msg__activity-chip--read">
          <span class="msg__activity-chip__shimmer"></span>
          <i data-phosphor="${icon}" class="msg__activity-chip__icon"></i>
          <span class="msg__activity-chip__label">${label}</span>
        </div>`;
    } else if (type === 'tool' && tool) {
      key = 'tool:' + tool;
      if (_activitySeen.has(key)) return;
      _activitySeen.add(key);
      html = `
        <div class="msg__activity-chip msg__activity-chip--tool">
          <span class="msg__activity-chip__shimmer"></span>
          <i data-phosphor="wrench" class="msg__activity-chip__icon"></i>
          <span class="msg__activity-chip__label">Using <strong>${escapeHTML(tool)}</strong></span>
        </div>`;
    }

    if (html) {
      activity.insertAdjacentHTML('beforeend', html);
      window.renderIcons?.(activity);
      scrollBottom();
    }
  }

  function startActivityListener(targetDiv) {
    // Reset dedup set + store target for the chunk handler
    _activitySeen.clear();
    _activityDiv = targetDiv;
    // Legacy onToolActivity path (only works if preload was reloaded):
    const api = window.electronAPI;
    if (api?.onToolActivity) {
      api.onToolActivity(data => addActivityChip(targetDiv, data));
    }
  }
  function stopActivityListener() {
    _activityDiv = null;
  }

  function streamToAssistantBubble(div, text) {
    div.querySelector('.msg__body').innerHTML = mdToHtml(text);
    if (window.renderIcons) window.renderIcons(div.querySelector('.msg__body'));
    scrollBottom();
  }

  function finalizeAssistantBubble(div, stats) {
    div.classList.remove('msg--streaming');
    const dot  = div.querySelector('.msg__dot');
    const meta = div.querySelector('.msg__meta');
    if (dot)  { dot.className  = 'msg__dot msg__dot--done'; }
    if (meta) {
      meta.className = 'msg__meta';
      meta.textContent = stats?.outputTokens ? `${stats.outputTokens.toLocaleString()} tokens` : 'Done';
    }
    // Wire copy buttons inside code blocks
    div.querySelectorAll('[data-action="copy"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pre = btn.closest('.code-block')?.querySelector('pre');
        if (pre) navigator.clipboard.writeText(pre.textContent).catch(() => {});
      });
    });
  }

  function showErrorBubble(div, message) {
    div.classList.remove('msg--streaming');
    const dot  = div.querySelector('.msg__dot');
    const meta = div.querySelector('.msg__meta');
    const body = div.querySelector('.msg__body');
    if (dot)  dot.className = 'msg__dot';
    if (meta) { meta.className = 'msg__meta'; meta.textContent = 'Error'; }
    if (body) body.innerHTML = `<p style="color:#c96442">${escapeHTML(message)}</p>`;
  }

  // ── Auth modal (OAuth sign-in + optional API key fallback) ──────────────────

  function showAuthModal(onConnected) {
    const overlay = document.createElement('div');
    overlay.className = 'apikey-overlay';
    overlay.innerHTML = `
      <div class="apikey-card">
        <div class="apikey-card__ico">
          <svg viewBox="0 0 24 24" fill="#d97757" width="32" height="32"><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"/></svg>
        </div>
        <h2 class="apikey-card__title">Connect to Claude</h2>
        <p class="apikey-card__desc">Sign in with your Claude account to use your subscription, or paste an API key.</p>

        <button class="modal__btn modal__btn--primary modal__btn--full" id="auth-oauth-btn">
          Sign in with Claude account →
        </button>
        <p id="auth-waiting" style="display:none;color:#8a8a92;font-size:12px;margin:8px 0 0;text-align:center">
          Waiting for browser sign-in…
        </p>

        <details class="apikey-details" style="margin-top:16px">
          <summary style="cursor:pointer;font-size:12px;color:#8a8a92;user-select:none">Use API key instead</summary>
          <div style="margin-top:10px">
            <div class="apikey-card__field">
              <input id="apikey-input" type="password" placeholder="sk-ant-api03-…" autocomplete="off" spellcheck="false"/>
            </div>
            <p class="apikey-card__hint">Get a key at <span style="color:#6a86c3">console.anthropic.com</span></p>
            <div class="apikey-card__actions" style="margin-top:8px">
              <button class="modal__btn modal__btn--primary" id="apikey-save">Save key →</button>
            </div>
          </div>
        </details>

        <div class="apikey-card__actions" style="margin-top:12px;justify-content:center">
          <button class="modal__btn" id="auth-cancel">Later</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const oauthBtn  = overlay.querySelector('#auth-oauth-btn');
    const waiting   = overlay.querySelector('#auth-waiting');
    const apikeyInp = overlay.querySelector('#apikey-input');
    const saveBtn   = overlay.querySelector('#apikey-save');
    const cancelBtn = overlay.querySelector('#auth-cancel');

    // Listen for auth-complete push from main process
    let unsubAuth = null;
    if (window.electronAPI?.onAuthComplete) {
      unsubAuth = window.electronAPI.onAuthComplete((status) => {
        if (status?.valid) {
          overlay.remove();
          updateAccountBadge(status);
          onConnected?.();
        }
      });
    }

    oauthBtn.addEventListener('click', async () => {
      oauthBtn.disabled = true;
      oauthBtn.textContent = 'Opening browser…';
      waiting.style.display = 'block';
      try {
        await window.electronAPI.signIn();
        // The onAuthComplete handler will close the modal on success
        // If signIn() rejects, we show an error
      } catch (err) {
        console.error('[auth] sign-in failed:', err);
        oauthBtn.disabled = false;
        oauthBtn.textContent = 'Sign in with Claude account →';
        waiting.style.display = 'none';
        waiting.textContent = 'Sign-in failed. Try again or use an API key.';
        waiting.style.color = '#c96442';
        waiting.style.display = 'block';
      }
    });

    const doSaveKey = async () => {
      const key = apikeyInp.value.trim();
      if (!key) { apikeyInp.classList.add('is-error'); return; }
      apikeyInp.classList.remove('is-error');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      await window.electronAPI.setApiKey(key);
      unsubAuth?.();
      overlay.remove();
      updateAccountBadge({ mode: 'apikey', valid: true });
      onConnected?.();
    };

    saveBtn?.addEventListener('click', doSaveKey);
    apikeyInp?.addEventListener('keydown', e => { if (e.key === 'Enter') doSaveKey(); });
    cancelBtn.addEventListener('click', () => { unsubAuth?.(); overlay.remove(); });
  }

  // ── Update sidebar account badge after auth ───────────────────────────────

  function updateAccountBadge(status) {
    const emailEl = document.getElementById('account-email');
    if (!emailEl) return;
    if (status?.mode === 'oauth' && status.valid) {
      const tier = status.subscriptionType || status.rateLimitTier || 'Max';
      const tierLabel = tier === 'claude_max_20x' ? 'Max · 20×'
                      : tier === 'claude_max_5x'  ? 'Max · 5×'
                      : tier === 'max'            ? 'Max'
                      : tier === 'pro'            ? 'Pro'
                      : tier;
      emailEl.textContent = `${tierLabel} · hlaro…@gmail.com`;
    } else if (status?.mode === 'apikey' && status.valid) {
      emailEl.textContent = 'API Key · hlaro…@gmail.com';
    } else {
      emailEl.textContent = 'Not connected · hlaro…@gmail.com';
    }
  }

  // Alias for legacy call-sites that still reference showApiKeyModal
  function showApiKeyModal(onSaved) { showAuthModal(onSaved); }

  // ── Core send ─────────────────────────────────────────────────────────────

  // opts.skipUI = true → don't re-add user bubble or push to history (used by rate-limit retry)
  // opts.existingBubble → reuse an already-created assistant bubble
  async function send(text, opts = {}) {
    text = text.trim();
    if (!text || isStreaming) return;

    // Electron check — real API requires desktop app
    if (!window.electronAPI?.isElectron) {
      clearMock();
      addUserBubble(text);
      composerInput.value = '';
      const aDiv = addAssistantBubble();
      setTimeout(() => {
        streamToAssistantBubble(aDiv, '**Desktop app required.**\n\nReal Claude chat works in the Electron desktop app.\n\nRun `npm run electron:dev` to start it.');
        finalizeAssistantBubble(aDiv, null);
      }, 400);
      return;
    }

    // Check for valid auth — ensureAuth() will silently refresh if expired
    const ensureFn = window.electronAPI.ensureAuth || window.electronAPI.getAuthStatus;
    const authStatus = await ensureFn();
    if (!authStatus?.valid) {
      showAuthModal(() => send(text));
      return;
    }

    // ----- Send -----
    clearMock();
    isStreaming = true;
    sendBtn.disabled = false;   // stays enabled — click during streaming = abort
    sendBtn.classList.add('is-streaming');

    // Use the per-session history (window.__chatHistory)
    const sessionId  = state.activeId;
    const history    = window.__chatHistory;
    const isFirstMsg = history.length === 0 && !opts.skipUI;

    if (!opts.skipUI) {
      // Remove empty-state placeholder the moment the user sends
      document.getElementById('chat-scroll')?.querySelector('.chat-empty')?.remove();
      history.push({ role: 'user', content: text });
      addUserBubble(text);
      composerInput.value = '';
      composerInput.style.height = '';

      // Auto-name the session from the first message (truncated to 50 chars)
      if (isFirstMsg) {
        const autoTitle = text.trim().slice(0, 50) + (text.length > 50 ? '…' : '');
        updateSessionTitle(sessionId, autoTitle);
        const activeRow = document.querySelector(`.session[data-session-id="${sessionId}"] .session__title`);
        if (activeRow) activeRow.textContent = autoTitle;
      }
    }

    // ── Agent resolution (must happen BEFORE bubble is created) ─────────────
    // Priority: @agentname prefix in message > pill selection > default
    let resolvedAgent = getActiveAgent?.() || null;
    {
      const messageText = history[history.length - 1]?.content || text || '';
      const atMatch = messageText.match(/^@([\w\- ]+?)[\s,:]/i) ||
                      messageText.match(/^@([\w\-]+)$/i) ||
                      messageText.match(/use sub[\s-]?agent\s+([\w\- ]+?)(?:\s+to|\s*$)/i);
      if (atMatch) {
        const requestedName = atMatch[1].trim().toLowerCase();
        const allAgents = loadAgents();
        const found = allAgents.find(a => a.name.toLowerCase() === requestedName);
        if (found) resolvedAgent = found;
      }
    }

    // Reuse existing bubble (retry path) or create a fresh one
    const aDiv = opts.existingBubble || addAssistantBubble(resolvedAgent);
    let responseText = '';

    // Subscribe to chunks before invoking (avoid race condition)
    const unsubChunk = window.electronAPI.onChunk(chunk => {
      // Activity markers piggybacked on the chunk channel: \x01ACT:{json}\x02
      if (chunk.charCodeAt(0) === 1 && chunk.charCodeAt(chunk.length - 1) === 2) {
        try {
          const data = JSON.parse(chunk.slice(5, -1)); // strip \x01ACT: (5 chars) and \x02 (1 char)
          addActivityChip(aDiv, data);
        } catch (_) {}
        return; // don't append to responseText
      }
      responseText += chunk;
      streamToAssistantBubble(aDiv, responseText);
    });

    // Start listening for tool activity (skill reads, tool calls)
    startActivityListener(aDiv);

    // Subscribe to live todo updates from Claude's TodoWrite tool calls
    const unsubTodo = window.electronAPI.onTodoUpdate?.(todos => {
      window.__planTodos = todos;
      // Reset expanded-task tracking so we re-auto-expand the active task
      _planExpandedIdx = -1;
      // If the Plan panel is currently visible, refresh it in place
      if (currentRightPanel === 'plan') {
        const body = document.querySelector('.right-panel__body');
        if (body) {
          body.innerHTML = renderPlanPanel();
          renderIcons = window.renderIcons;
          renderIcons?.();
        }
      }
    });

    try {
      // Read the full session entry from localStorage (findSession returns {list,index,source},
      // NOT the session object itself — so we must use loadSessionList directly).
      const sessionList  = loadSessionList();
      const sessionEntry = sessionList.find(s => s.id === sessionId);
      const cliSessionId = sessionEntry?.cliSessionId || null;

      const agentModel     = resolvedAgent?.model?.trim() || null;
      const effectiveModel = agentModel || modelState?.currentModel || 'claude-sonnet-4-6';
      let effectiveSystem  = cliSessionId ? null : CHAT_SYSTEM_PROMPT;
      if (resolvedAgent) {
        const agentContext = [
          resolvedAgent.system ? resolvedAgent.system : `You are an AI agent named "${resolvedAgent.name}".`,
          resolvedAgent.notes  ? resolvedAgent.notes : null,
        ].filter(Boolean).join('\n\n');
        effectiveSystem = (effectiveSystem ? effectiveSystem + '\n\n' : '') + agentContext;
      }

      const result = await window.electronAPI.sendMessage(
        history,
        effectiveModel,
        effectiveSystem,
        cliSessionId
      );
      history.push({ role: 'assistant', content: responseText || result?.text || '' });
      // Persist messages after successful exchange
      saveSessionMessages(sessionId, history);
      // Update session timestamp + store returned CLI session ID for next turn
      // Re-read the list (could have changed) and update entry
      const list  = loadSessionList();
      const entry = list.find(s => s.id === sessionId);
      if (entry) {
        entry.ts = Date.now();
        // Save the CLI session ID so future turns can --resume the same CLI session.
        // Allow updating cliSessionId in case the CLI assigned a new one (resumed → new).
        if (result?.cliSessionId) {
          entry.cliSessionId = result.cliSessionId;
        }
        saveSessionList(list);
      }
      stopActivityListener();
      finalizeAssistantBubble(aDiv, result);

      // ── Plan block detection (raw markdown, reliable) ─────────────────────
      // Check AFTER finalize so the bubble is done, but on the raw responseText
      // (not the rendered DOM — backticks are gone after mdToHtml).
      const planTodos = parsePlanBlock(responseText);
      if (planTodos?.length) {
        window.__planTodos = planTodos;
        _planExpandedIdx = -1;
        const planBody = document.querySelector('.right-panel__body');
        if (planBody && currentRightPanel === 'plan') {
          planBody.innerHTML = renderPlanPanel();
          window.renderIcons?.();
        }
        // Auto-open Plan panel
        setRightPanelOpen(true);
        setRightPanelTab('plan');
      }

      // Auto-open the Preview panel if the response contains renderable code
      // (only if we didn't just open the Plan panel)
      if (!planTodos?.length) {
        const liveBlock = getLastRenderableCodeBlock();
        if (liveBlock) {
          setRightPanelOpen(true);
          setRightPanelTab('apercu');
        }
      }
    } catch (err) {
      stopActivityListener();
      if (err.message === 'NO_CREDENTIAL' || err.message?.includes('NO_CREDENTIAL') ||
          err.message === 'NO_API_KEY'    || err.message?.includes('NO_API_KEY')) {
        showErrorBubble(aDiv, 'Not connected. Sign in via the account menu.');
        setTimeout(() => showAuthModal(() => send(text)), 300);
      } else if (err.code === 'RATE_LIMIT' || err.message?.includes('429') || err.message?.includes('rate_limit')) {
        const rawSec = err.retryAfter
          || (() => { const m = err.message?.match(/Retry after (\d+)s/i); return m ? Number(m[1]) : null; })();

        // If retryAfter is null (no header — CF burst block), use 120s.
        // Retrying sooner just resets the burst window and keeps us blocked forever.
        const waitSec = rawSec ? Math.max(rawSec, 10) : 120;
        const isRetry = opts.skipUI; // true = this is already a retry attempt

        history.pop(); // remove user msg from history

        if (_retryTimer) { clearInterval(_retryTimer); _retryTimer = null; }

        const bodyEl = aDiv.querySelector('.msg__body');
        const metaEl = aDiv.querySelector('.msg__meta');
        const dotEl  = aDiv.querySelector('.msg__dot');
        aDiv.classList.remove('msg--streaming');
        if (dotEl)  dotEl.className = 'msg__dot';
        if (metaEl) { metaEl.className = 'msg__meta'; metaEl.textContent = 'Rate limited'; }

        if (isRetry) {
          // Already retried once and still 429 — stop looping, show manual button
          if (bodyEl) bodyEl.innerHTML = `
            <p style="color:#c96442;font-size:13px;margin:0 0 8px">
              Still rate limited. Wait a few minutes before trying again.
            </p>
            <button id="rl-retry-btn" style="font-size:12px;padding:4px 12px;background:#1e1e24;
              border:1px solid #c96442;color:#c96442;border-radius:6px;cursor:pointer">
              Try again manually
            </button>`;
          bodyEl?.querySelector('#rl-retry-btn')?.addEventListener('click', () => {
            aDiv.remove();
            send(text);
          });
        } else {
          // First 429 — countdown then one auto-retry
          let sec = waitSec;
          const updateWait = () => {
            if (bodyEl) bodyEl.innerHTML =
              `<p style="color:#c96442;font-size:13px">Rate limited — retrying in <strong>${sec}s</strong>…<br>
              <span style="color:#5a5a63;font-size:11px">(waiting longer avoids resetting the rate-limit window)</span></p>`;
          };
          updateWait();

          _retryTimer = setInterval(() => {
            sec--;
            if (sec <= 0) {
              clearInterval(_retryTimer); _retryTimer = null;
              aDiv.classList.add('msg--streaming');
              if (dotEl)  dotEl.className = 'msg__dot msg__dot--thinking';
              if (metaEl) { metaEl.className = 'msg__meta msg__meta--streaming'; metaEl.textContent = 'generating a response'; }
              if (bodyEl) bodyEl.innerHTML = '';
              send(text, { skipUI: true, existingBubble: aDiv }); // one retry
            } else {
              updateWait();
            }
          }, 1000);
        }
        // Skip the history.pop() below (already done above)
        return;
      } else if (err.message?.includes('401') || err.message?.includes('authentication')) {
        showErrorBubble(aDiv, 'Authentication error. Try signing out and back in.');
      } else if (err.message?.includes('529') || err.message?.includes('overloaded')) {
        showErrorBubble(aDiv, 'Claude is overloaded right now — please try again in a moment.');
      } else {
        showErrorBubble(aDiv, err.message || 'Unknown error');
      }
      // Remove last user message from history on error
      history.pop();
    } finally {
      unsubChunk?.();
      unsubTodo?.();
      isStreaming = false;
      sendBtn.classList.remove('is-streaming');
    }
  }

  // ── Composer wiring ───────────────────────────────────────────────────────

  sendBtn.addEventListener('click', () => {
    if (isStreaming) {
      window.electronAPI?.abort?.();   // kill subprocess — close fires, partial text kept
    } else {
      send(composerInput.value);
    }
  });

  composerInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(composerInput.value);
    }
  });

  // Auto-resize textarea as user types
  composerInput.addEventListener('input', () => {
    composerInput.style.height = '';
    composerInput.style.height = Math.min(composerInput.scrollHeight, 200) + 'px';
  });

  // ── Startup: silently refresh if expired, then check, prompt if needed ───────

  if (window.electronAPI?.isElectron) {
    // ensureAuth() calls getCredential() which auto-refreshes expired tokens,
    // then returns the updated status — no sign-in modal for normal expiry.
    const ensureFn = window.electronAPI.ensureAuth || window.electronAPI.getAuthStatus;
    ensureFn().then(status => {
      updateAccountBadge(status);
      if (!status?.valid) {
        setTimeout(() => showAuthModal(), 800);
      }
    });

    // Listen for auth-complete pushes at the top level too (after sign-in)
    window.electronAPI.onAuthComplete?.(status => {
      updateAccountBadge(status);
    });
  }

  // ── Desktop notification when response finishes while window is in bg ────────

  // ── Plan-block parser ─────────────────────────────────────────────────────
  // Detects ```plan ... ``` blocks in the response and populates the Plan panel.
  // This is a reliable fallback when TodoWrite IPC isn't available.
  function parsePlanBlock(responseText) {
    const rx = /```(?:plan|tasks|todo(?:list)?)\r?\n([\s\S]*?)```/gi;
    let match;
    let todos = null;

    while ((match = rx.exec(responseText)) !== null) {
      const raw = match[1].trim();

      // ── JSON array ──────────────────────────────────────────────────────
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          todos = parsed.map((t, i) => ({
            id:       String(t.id ?? i + 1),
            content:  t.content || t.task || t.title || String(t),
            status:   t.status   || 'pending',
            priority: t.priority || 'medium',
            time:     t.time     || t.timeRange || null,
            note:     t.note     || null,
            subtasks: (t.subtasks || t.subs || []),
          }));
          break;
        }
      } catch { /* not JSON */ }

      // ── Markdown task list with optional subtasks (indented lines) ──────
      // Status map: [ ] pending  [~] in_progress  [x]/[X] done
      //             [-] cancelled  [!] blocked  [/] review
      const STATUS_MAP = {
        ' ': 'pending', '': 'pending',
        '~': 'in_progress', 'x': 'completed', 'X': 'completed',
        '-': 'cancelled', '!': 'blocked', '/': 'review',
      };

      const rawLines = raw.split(/\r?\n/);
      const result   = [];
      let   current  = null;

      for (const rawLine of rawLines) {
        if (!rawLine.trim()) continue;

        // Detect indentation level (2+ spaces or a tab = subtask)
        const isSubtask = /^(?:  +|\t)/.test(rawLine);
        const line      = rawLine.trim();

        // Parse checkbox: - [x] or [x] or * [x]
        const cbMatch = line.match(/^(?:[-*]\s*)?\[([^\]]*)\]\s*(.*)/);
        const bullet  = !cbMatch && /^[-*]\s+/.test(line);

        let status   = 'pending';
        let content  = line;

        if (cbMatch) {
          const marker = cbMatch[1].trim();
          status  = STATUS_MAP[marker] ?? 'pending';
          content = cbMatch[2].trim();
        } else if (bullet) {
          content = line.replace(/^[-*]\s+/, '').trim();
        } else {
          // Numbered list: "1. ..." or plain text
          content = line.replace(/^\d+[.)]\s*/, '').trim();
        }

        // Strip **bold** and *italic* markdown
        content = content.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1').trim();

        // Extract time range from content: "8:00-9:00 | Task title | priority"
        // or "08:00 – 10:00 Task title"
        let time     = null;
        let priority = 'medium';

        const pipeMatch = content.match(/^([\d:]+\s*[-–]\s*[\d:]+)\s*[|:]\s*(.*?)(?:\s*[|:]\s*(high|medium|low))?$/i);
        if (pipeMatch) {
          time     = pipeMatch[1].trim();
          content  = pipeMatch[2].trim();
          priority = (pipeMatch[3] || 'medium').toLowerCase();
        } else {
          // Try "8:00-9:00 Task" format (time at start without pipe)
          const timePrefix = content.match(/^([\d:]+\s*[-–]\s*[\d:]+)\s+(.*)/);
          if (timePrefix) {
            time    = timePrefix[1].trim();
            content = timePrefix[2].trim();
          }
          // Try inline priority suffix: "Task title | high"
          const priMatch = content.match(/^(.*)\s*[|:]\s*(high|medium|low)$/i);
          if (priMatch) {
            content  = priMatch[1].trim();
            priority = priMatch[2].toLowerCase();
          }
        }

        if (!content) continue;

        if (isSubtask && current) {
          current.subtasks.push({ content, status });
        } else {
          current = { id: String(result.length + 1), content, status, priority, time, note: null, subtasks: [] };
          result.push(current);
        }
      }

      if (result.length) { todos = result; break; }
    }

    return todos?.length ? todos : null;
  }

  const origFinalize = finalizeAssistantBubble;
  function finalizeAssistantBubbleWrapped(div, stats) {
    origFinalize(div, stats);
    if (window.electronAPI?.notify && document.hidden) {
      window.electronAPI.notify('Claude Code', 'Response ready');
    }
  }

  // ── Expose mdToHtml globally so _renderChatForSession can use it ─────────────
  // (_renderChatForSession is called from outside this IIFE on session switches)
  window.mdToHtml = mdToHtml;

  // ── Startup render: show saved messages (removes the empty-state placeholder) ─
  // Without this, the "How can I help you today?" persists even if the session
  // has prior messages — because _renderChatForSession is only called on switches.
  clearInterval(_streamInterval); // stop the demo state cycle immediately
  mockCleared = true;
  _renderChatForSession(state.activeId);

})(); // end initLiveChat

// ── Global keyboard shortcuts (renderer-side) ─────────────────────────────────

(function initGlobalKeys() {
  if (!window.electronAPI?.isElectron) return;

  // Find-in-page bar
  let findBar = null;
  function showFindBar() {
    if (findBar) { findBar.querySelector('input')?.focus(); return; }
    findBar = document.createElement('div');
    findBar.className = 'find-bar';
    findBar.innerHTML = `
      <input id="find-input" type="text" placeholder="Find in page…" autocomplete="off" spellcheck="false"/>
      <button id="find-prev" title="Previous (Shift+Enter)">▲</button>
      <button id="find-next" title="Next (Enter)">▼</button>
      <button id="find-close" title="Close (Esc)">✕</button>
    `;
    document.body.appendChild(findBar);
    const inp = findBar.querySelector('#find-input');
    const closeFn = () => {
      window.electronAPI.findStop();
      findBar.remove();
      findBar = null;
    };
    inp.addEventListener('input', () => window.electronAPI.findStart(inp.value));
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.shiftKey)  window.electronAPI.findPrev(inp.value);
      else if (e.key === 'Enter')            window.electronAPI.findNext(inp.value);
      else if (e.key === 'Escape')           closeFn();
    });
    findBar.querySelector('#find-next').addEventListener('click', () => window.electronAPI.findNext(inp.value));
    findBar.querySelector('#find-prev').addEventListener('click', () => window.electronAPI.findPrev(inp.value));
    findBar.querySelector('#find-close').addEventListener('click', closeFn);
    setTimeout(() => inp.focus(), 30);
  }

  document.addEventListener('keydown', e => {
    // Ctrl+F → Find
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      showFindBar();
    }
    // Ctrl+, → Settings/Profile
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      if (typeof openProfileModal === 'function') openProfileModal('profile');
    }
    // Ctrl+` → Console
    if ((e.ctrlKey || e.metaKey) && e.key === '`') {
      e.preventDefault();
      showConsole();
    }
  });

  document.getElementById('console-btn')?.addEventListener('click', () => showConsole());
})();

// ── Ctrl + Scroll zoom ───────────────────────────────────────────────────────

(function initZoom() {
  const api    = window.electronAPI;
  if (!api?.zoom) return;

  const ZOOM_KEY  = 'ccmod.zoom';
  const ZOOM_MIN  = 0.5;
  const ZOOM_MAX  = 2.5;
  const ZOOM_STEP = 0.08;

  // Restore persisted zoom
  const saved = parseFloat(localStorage.getItem(ZOOM_KEY));
  if (!isNaN(saved)) api.zoom.set(saved);

  // HUD overlay
  let _hudTimer = null;
  const hud = document.createElement('div');
  hud.id = 'zoom-hud';
  hud.style.cssText = [
    'position:fixed', 'bottom:48px', 'left:50%', 'transform:translateX(-50%)',
    'background:rgba(20,20,22,0.88)', 'border:1px solid #27272c',
    'color:#e7e7ea', 'font-size:13px', 'font-weight:500',
    'padding:5px 14px', 'border-radius:20px', 'pointer-events:none',
    'opacity:0', 'transition:opacity 0.15s', 'z-index:99999',
    'backdrop-filter:blur(6px)', '-webkit-backdrop-filter:blur(6px)',
  ].join(';');
  document.body.appendChild(hud);

  function showHud(factor) {
    hud.textContent = `${Math.round(factor * 100)}%`;
    hud.style.opacity = '1';
    clearTimeout(_hudTimer);
    _hudTimer = setTimeout(() => { hud.style.opacity = '0'; }, 1200);
  }

  // Ctrl + Wheel
  window.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();

    const current = api.zoom.get();
    const delta   = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    const next    = Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, current + delta)) * 100) / 100;

    api.zoom.set(next);
    localStorage.setItem(ZOOM_KEY, next);
    showHud(next);
  }, { passive: false });

  // Ctrl+0 → reset to 100 %
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === '0') {
      e.preventDefault();
      api.zoom.set(1);
      localStorage.setItem(ZOOM_KEY, 1);
      showHud(1);
    }
  });
})();

// ── Custom title bar ──────────────────────────────────────────────────────────

(function initTitleBar() {
  const api = window.electronAPI;

  // Mark body so CSS can show/hide the bar
  if (api?.isElectron) document.body.classList.add('is-electron');

  const tbClose    = document.getElementById('tb-close');
  const tbMinimize = document.getElementById('tb-minimize');
  const tbMaximize = document.getElementById('tb-maximize');

  if (!tbClose) return; // bar not present (non-Electron or old HTML)

  tbClose   ?.addEventListener('click', () => api?.closeWindow?.());
  tbMinimize?.addEventListener('click', () => api?.minimize?.());
  tbMaximize?.addEventListener('click', () => api?.maximize?.());

  // Sync the restore icon on the maximize button
  function setMaxState(isMax) {
    tbMaximize?.classList.toggle('is-maximized', isMax);
    tbMaximize?.setAttribute('title', isMax ? 'Restore' : 'Maximize');
  }

  // Query initial state
  api?.isMaximized?.().then?.(setMaxState);

  // Listen for subsequent changes
  api?.onMaximizeChange?.(setMaxState);
})();
