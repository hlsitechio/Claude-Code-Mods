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

// ---------- Mock data ----------
const PROJECT_COLORS = ['#c96442', '#d97757', '#6a86c3', '#7ab389', '#b48ead', '#c9a96e', '#5aa1a1'];

const state = {
  projects: [
    {
      id: 'p1', name: 'Claude Code Mod', color: '#c96442', open: true,
      sessions: [
        { id: 's1', title: 'Enhance app with Claude Code', time: '2m', active: true, processing: true },
        { id: 's2', title: 'Extract app.asar and map bundle', time: '1h' },
        { id: 's3', title: 'Sidebar redesign — first pass', time: '3h' },
      ],
    },
    {
      id: 'p2', name: 'Crowbyte', color: '#6a86c3', open: false,
      sessions: [
        { id: 's4', title: 'Build autonomous AI software updates', time: '2d' },
        { id: 's5', title: 'Implement new MCP package integration', time: '3d' },
        { id: 's6', title: 'Fix CLI square bracket formatting', time: '4d' },
      ],
    },
    {
      id: 'p3', name: 'Hermes Agents', color: '#7ab389', open: false,
      sessions: [
        { id: 's7', title: 'Hermes agent digest routine', time: '1d' },
        { id: 's8', title: 'Hermes security alerts routine', time: '5d' },
      ],
    },
    {
      id: 'p4', name: 'Research & Notes', color: '#b48ead', open: false, sessions: [],
    },
  ],
  pinned: [
    { id: 'sp1', title: 'Product strategy notes', time: 'pinned' },
  ],
  recent: [
    { id: 'sr1', title: 'Demonstrate app functionality', time: '12m' },
    { id: 'sr2', title: 'Add Git requirement for local sessions', time: '2h' },
    { id: 'sr3', title: 'Build pay-to-dispute resolution flow', time: 'Yesterday' },
    { id: 'sr4', title: 'Weekly review — April 21', time: '2d' },
    { id: 'sr5', title: 'Supabase RLS audit', time: '5d' },
  ],
  activeId: 's1',
};

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
    state.activeId = session.id;
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

function deleteSession(id) {
  const found = findSession(id);
  if (!found) return;
  found.list.splice(found.index, 1);
  render();
}

function renameSession(id) {
  const row = document.querySelector(`.session[data-session-id="${id}"]`);
  const found = findSession(id);
  if (!found) return;
  if (row) startInlineRename(row, found.list[found.index]);
  else {
    const next = prompt('Rename session', found.list[found.index].title);
    if (next != null && next.trim()) {
      found.list[found.index].title = next.trim();
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
      project.sessions.unshift({ id: 'n' + Math.random().toString(36).slice(2, 6), title: 'New session', time: 'now' });
      project.open = true;
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
  const toggle = e.target.closest('[data-ft-toggle]');
  if (!toggle) return;
  const id = toggle.dataset.ftToggle;
  document.querySelector(`.ft-node[data-ft-id="${id}"]`)?.classList.toggle('is-open');
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
  ctx.innerHTML = `
    <div class="user-menu__email">${escapeHTML(userState.email)}</div>
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
    overlay.innerHTML = `<iframe sandbox="allow-scripts" srcdoc="${buildPreviewSrcDoc(lang, code).replace(/"/g, '&quot;')}"></iframe>`;
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
  return base + `
      <h1>Preview not available for <code>${lang}</code></h1>
      <p>This preview currently renders <code>html</code>, <code>css</code>, and <code>javascript</code>.
      The raw code is shown below.</p>
      <pre class="demo">${code.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</pre>`;
}

function openCodePreview(lang, code) {
  const modal = document.getElementById('code-preview-modal');
  const body  = document.getElementById('code-preview-body');
  document.getElementById('code-preview-lang').textContent = lang;
  const doc = buildPreviewSrcDoc(lang, code);
  body.innerHTML = `<iframe sandbox="allow-scripts" srcdoc="${doc.replace(/"/g, '&quot;')}"></iframe>`;
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
  currentModel: 'opus-4.7-1m',
  currentEffort: 'tres-eleve',
  models: [
    { id: 'opus-4.7',      label: 'Opus 4.7',      shortcut: '1' },
    { id: 'opus-4.7-1m',   label: 'Opus 4.7 1M',   shortcut: '2' },
    { id: 'sonnet-4.6',    label: 'Sonnet 4.6',    shortcut: '3' },
    { id: 'haiku-4.5',     label: 'Haiku 4.5',     shortcut: '4' },
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
// ---------- Aperçu (Preview) panel ----------
function renderApercuPanel() {
  const mockUrl = 'localhost:5182';
  return `
    <div class="preview-panel">
      <!-- Browser-style toolbar -->
      <div class="preview-toolbar">
        <div class="preview-toolbar__nav">
          <button class="icon-btn icon-btn--sm" title="Back" disabled style="opacity:.3"><i data-phosphor="arrow-left"></i></button>
          <button class="icon-btn icon-btn--sm" title="Forward" disabled style="opacity:.3"><i data-phosphor="arrow-right"></i></button>
          <button class="icon-btn icon-btn--sm" title="Reload"><i data-phosphor="arrow-clockwise"></i></button>
        </div>
        <div class="preview-addressbar">
          <i data-phosphor="lock-simple" class="preview-addressbar__lock"></i>
          <span class="preview-addressbar__url">${mockUrl}</span>
        </div>
        <div class="preview-toolbar__actions">
          <button class="icon-btn icon-btn--sm" title="Desktop view" class="is-active"><i data-phosphor="monitor"></i></button>
          <button class="icon-btn icon-btn--sm" title="Mobile view"><i data-phosphor="device-mobile"></i></button>
          <button class="icon-btn icon-btn--sm" title="Open in browser"><i data-phosphor="arrow-square-out"></i></button>
        </div>
      </div>
      <!-- Preview viewport -->
      <div class="preview-viewport">
        <div class="preview-frame">
          <!-- Mock rendered app content -->
          <div class="preview-mock">
            <div class="preview-mock__nav">
              <span class="preview-mock__logo">◆ MyApp</span>
              <span class="preview-mock__nav-links">
                <span>Dashboard</span><span>Reports</span><span>Settings</span>
              </span>
            </div>
            <div class="preview-mock__body">
              <div class="preview-mock__sidebar">
                <div class="preview-mock__menu-item is-active">Overview</div>
                <div class="preview-mock__menu-item">Analytics</div>
                <div class="preview-mock__menu-item">Users</div>
                <div class="preview-mock__menu-item">Exports</div>
              </div>
              <div class="preview-mock__main">
                <div class="preview-mock__card preview-mock__card--wide">
                  <div class="preview-mock__card-label">Total sessions</div>
                  <div class="preview-mock__card-val">1,284</div>
                  <div class="preview-mock__sparkline">
                    <svg viewBox="0 0 80 24" preserveAspectRatio="none" width="80" height="24">
                      <polyline points="0,20 12,16 24,18 36,10 48,13 60,6 72,4 80,2" fill="none" stroke="#7ab389" stroke-width="1.5"/>
                    </svg>
                  </div>
                </div>
                <div class="preview-mock__card">
                  <div class="preview-mock__card-label">Active users</div>
                  <div class="preview-mock__card-val">342</div>
                </div>
                <div class="preview-mock__card">
                  <div class="preview-mock__card-label">Errors</div>
                  <div class="preview-mock__card-val preview-mock__card-val--warn">7</div>
                </div>
                <div class="preview-mock__table-wrap">
                  <div class="preview-mock__table-head">Recent Activity</div>
                  ${[
                    ['index.html',   'Modified', '#7ab389'],
                    ['app.js',       'Modified', '#7ab389'],
                    ['style.css',    'Modified', '#7ab389'],
                    ['icons.js',     'Unchanged','#5a5a63'],
                  ].map(([f,s,c]) => `
                    <div class="preview-mock__table-row">
                      <span class="preview-mock__table-file">${f}</span>
                      <span class="preview-mock__table-status" style="color:${c}">${s}</span>
                    </div>`).join('')}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="preview-viewport__footer">
          <span class="preview-viewport__info"><i data-phosphor="circle-wavy-check" style="color:#7ab389"></i> Live · auto-refresh on save</span>
          <span class="preview-viewport__size">1280 × 720</span>
        </div>
      </div>
    </div>`;
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

let _planExpandedIdx = 2; // active task expanded by default

function renderPlanPanel() {
  const tasks = [
    { status: 'done',    title: 'Read existing sidebar styles',        note: 'Analysed 2 107 lines of CSS' },
    { status: 'done',    title: 'Map CSS custom-property cascade',     note: '--accent propagation confirmed' },
    { status: 'active',  title: 'Refactor SessionRow component',       note: 'Adding --accent-tint & --accent-border',
      subs: [
        { status: 'done',    title: 'Extract color tokens to vars',   color: PROJECT_COLORS[0] },
        { status: 'done',    title: 'Remove hardcoded hex values',    color: PROJECT_COLORS[2] },
        { status: 'active',  title: 'Refactor props interface',       color: PROJECT_COLORS[3] },
        { status: 'pending', title: 'Wire --accent-tint variable',    color: PROJECT_COLORS[4] },
        { status: 'pending', title: 'Update snapshot tests',          color: PROJECT_COLORS[5] },
      ]
    },
    { status: 'pending', title: 'Update ProjectRow color forwarding',  note: '',
      subs: [
        { status: 'pending', title: 'Audit ProjectRow CSS',           color: PROJECT_COLORS[1] },
        { status: 'pending', title: 'Forward --c via data-attr',      color: PROJECT_COLORS[6] },
      ]
    },
    { status: 'pending', title: 'Add transition animations',           note: '200ms ease on background & color' },
    { status: 'pending', title: 'Write tests for color-mix fallbacks', note: '' },
  ];

  const done = tasks.filter(t => t.status === 'done').length;
  const pct  = Math.round(done / tasks.length * 100);
  const statusIcon = { done: 'check-circle', active: 'circle-dashed', pending: 'circle' };
  const subStatusIcon = { done: 'check-circle', active: 'circle-dashed', pending: 'circle' };

  function renderSubtasks(subs) {
    if (!subs || !subs.length) return '';
    return `
      <div class="plan-subtasks-wrap">
        <div class="plan-subtasks-inner">
          <div class="plan-subtasks">
            ${subs.map(s => `
              <div class="plan-subtask plan-subtask--${s.status}">
                <span class="plan-subtask__dot" style="--c:${s.color}"></span>
                <span class="plan-subtask__icon"><i data-phosphor="${subStatusIcon[s.status]}"></i></span>
                <span class="plan-subtask__title">${escapeHTML(s.title)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>`;
  }

  const chevronSVG = `<svg width="8" height="8" viewBox="0 0 8 8" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 1.5L5.5 4L2.5 6.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  return `
    <div class="plan-view">
      <div class="plan-header">
        <span class="plan-header__title">Refactor color cascade</span>
        <span class="plan-header__meta">${done} / ${tasks.length}</span>
      </div>
      <div class="plan-progress">
        <div class="plan-progress__bar" style="width:${pct}%"></div>
      </div>
      <div class="plan-tasks">
        ${tasks.map((task, i) => {
          const hasSubs = task.subs && task.subs.length > 0;
          const isExpanded = hasSubs && _planExpandedIdx === i;
          const cls = [
            'plan-task',
            `plan-task--${task.status}`,
            hasSubs ? 'plan-task--has-subs' : '',
            isExpanded ? 'plan-task--expanded' : '',
          ].filter(Boolean).join(' ');
          return `
          <div class="${cls}" data-plan-idx="${i}">
            <span class="plan-task__num">${i + 1}</span>
            <span class="plan-task__icon"><i data-phosphor="${statusIcon[task.status]}"></i></span>
            <div class="plan-task__body">
              <div class="plan-task__title-row${hasSubs ? '' : ''}">
                ${hasSubs ? `<span class="plan-task__chevron">${chevronSVG}</span>` : ''}
                <span class="plan-task__title">${escapeHTML(task.title)}</span>
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
  } else {
    bodyEl.classList.remove('is-split');
    // Edge-to-edge modes
    bodyEl.classList.toggle('rp-body--terminal', id === 'terminal');
    bodyEl.classList.toggle('rp-body--apercu',   id === 'apercu');
    bodyEl.innerHTML = renderPanelContent(id);
    if (window.renderIcons) window.renderIcons(bodyEl);
    wirePlanTabEvents(id, bodyEl);
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
  const copy = { ...src, id: 'dup' + Math.random().toString(36).slice(2, 6), title: src.title + ' (copy)', time: 'now' };
  found.list.splice(found.index, 0, copy);
  state.activeId = copy.id;
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

// Cycle every 3 s — showcases all states in the prototype
setInterval(() => {
  _streamIdx = (_streamIdx + 1) % STREAM_STATES.length;
  applyStreamState(STREAM_STATES[_streamIdx]);
}, 3000);
