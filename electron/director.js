'use strict';

/**
 * director.js — Agent-team coordination protocol (Phase 24, prototype)
 * ────────────────────────────────────────────────────────────────────────
 * The "Director" coordinates a team of role-specialised Claude agents through
 * a shared task board (the kanban). This module is the PURE COORDINATION
 * LOGIC — no Electron, no I/O, fully deterministic — so it can be unit-tested
 * before being wired to the live kanban + real agent terminals.
 *
 * Design choices (locked with the user):
 *   - Coordination = KANBAN BUS: the Director writes role-tagged tasks; agents
 *     claim the ones for their role. This module models that board in memory;
 *     the live version persists each task to kanban.json (schema below).
 *   - Autonomy = DIRECTOR-GATED: an agent does ONE task, submits it for
 *     review, and waits. The Director approves before the agent's next task is
 *     released. No agent ever has more than one active task.
 *
 * Task lifecycle (status):
 *   todo ──assign──▶ doing ──submit──▶ review ──approve──▶ done
 *                      ▲                   │
 *                      └──────reject───────┘   (rework)
 *   A task is only ASSIGNABLE when every task in its `deps` is `done`.
 *   Cycles / unsatisfiable deps surface as `blocked`.
 *
 * Live wiring (the loop the user specified):
 *   Director → agent : PTY "prompt injection" (terminal:input) — sends the task
 *   agent → Director : the agent moves ITS OWN kanban task between columns; the
 *                      board change is the signal the Director reacts to.
 *
 * Kanban mapping (status ↔ column is now 1:1 — main.js adds a 'review' column):
 *   status 'todo'   → col 'todo'         (To do)
 *   status 'doing'  → col 'doing'        (In progress)
 *   status 'review' → col 'review'       (Needs review  → redirected to Director)
 *   status 'done'   → col 'done'         (Done / approved)
 *   assignee role   → task.assignee field (preserved) + '@<role>' tag (UI filter)
 *   deps            → task.deps field (preserved)     + 'dep:<id>' tags (UI)
 */

// ── The DevOps team (11 specialists + Director) ─────────────────────────────
// Each role maps to an existing CCM agent def / skill where one exists, plus
// the MCP server(s) that define its capability (researcher needs the browser
// for live web work; media needs the ideogram image MCP). The `mcp` list is
// consumed by the live "Spawn Team" step to grant each agent terminal its
// tools; the coordination logic here is role-count-agnostic.
const TEAM_DEVOPS = {
  name: 'DevOps Team',
  director: { role: 'director', name: 'Director', skills: ['orchestration'] },
  agents: [
    { role: 'researcher', name: 'Researcher',    skills: ['deep-research'],          mcp: ['ccm-browser'], color: '#9d8cf5' },
    { role: 'architect',  name: 'Architect',     skills: ['software-architecture'],                        color: '#c08cf5' },
    { role: 'backend',    name: 'Backend Dev',   skills: ['backend-dev-guidelines'],                       color: '#7ab389' },
    { role: 'frontend',   name: 'Frontend Dev',  skills: ['frontend-dev-guidelines'],                      color: '#61afef' },
    { role: 'data',       name: 'Data / DB',     skills: ['database'],                                     color: '#56b6c2' },
    { role: 'qa',         name: 'QA Engineer',   skills: ['testing-qa'],                                   color: '#e5c07b' },
    { role: 'security',   name: 'Security',      skills: ['security-audit'],                               color: '#e06c75' },
    { role: 'reviewer',   name: 'Code Reviewer', skills: ['code-review'],                                  color: '#7ab8f5' },
    { role: 'media',      name: 'Media Creator', skills: ['ai-studio-image'],        mcp: ['ideogram'],   color: '#f59ec0' },
    { role: 'devops',     name: 'DevOps / CI',   skills: ['cicd-automation'],                              color: '#d97757' },
    { role: 'docs',       name: 'Tech Writer',   skills: ['documentation'],                                color: '#a1a1aa' },
  ],
};

const STATUS = Object.freeze({
  TODO: 'todo', DOING: 'doing', REVIEW: 'review', DONE: 'done', BLOCKED: 'blocked',
});

// ── Role system prompts (injected per agent terminal via --append-system-prompt) ──
// Kept single-line and free of shell-hostile chars ($ " ` \) so they survive
// being typed into PowerShell (Windows) or bash without quoting surprises.
const ROLE_SPECIALTY = {
  director:   'You are the DIRECTOR of a Claude agent team. Decompose the goal into role-tagged tasks with the director_plan tool, dispatch ready work with director_next, review submissions with director_review, and finalize each with director_approve or director_reject. You ALONE move tasks to Done. Coordinate and unblock the team; do not write product code yourself.',
  researcher: 'You are the RESEARCHER. Gather facts from the live web using the ccm browser tools (browser_navigate, browser_read_page, chrome_*). Summarize findings with concrete sources and links.',
  architect:  'You are the ARCHITECT. Turn requirements into a clear technical design: components, interfaces, data flow, and a file-level plan the developers can follow.',
  backend:    'You are the BACKEND developer. Implement server-side logic, APIs, and data access cleanly, with error handling and tests where it matters.',
  frontend:   'You are the FRONTEND developer. Build the UI and client logic with accessible, modern, responsive components.',
  data:       'You are the DATA engineer. Design schemas, migrations, and queries. Put data integrity and clear models first.',
  qa:         'You are the QA engineer. Write and run tests, hunt edge cases, and report defects with exact reproduction steps.',
  security:   'You are the SECURITY auditor. Review for vulnerabilities and unsafe patterns; propose concrete, minimal fixes.',
  reviewer:   'You are the CODE REVIEWER. Check correctness, readability, and maintainability; give specific line-level feedback.',
  media:      'You are the MEDIA creator. Generate images and brand assets with the ideogram tools to match the brief; iterate on prompt and style.',
  devops:     'You are the DEVOPS engineer. Handle builds, CI, packaging, and deployment configuration; keep the pipeline green.',
  docs:       'You are the TECH WRITER. Produce clear README, changelog, and usage docs that match what was actually built.',
};

// The shared kanban-bus + director-gated protocol every NON-director agent gets.
const TEAM_PROTOCOL =
  'You work as ONE agent on a Claude team coordinated by a Director through a shared task board. ' +
  'Act ONLY on board cards whose assignee is your role. For each of your tasks: first call the ccm MCP tool kanban_move to set its col to doing (In progress); ' +
  'do the work; then call kanban_move to set its col to review (Needs review) and STOP. ' +
  'Never set your own task to done — the Director reviews and finalizes. If blocked, leave it in doing and explain why. Keep edits scoped to the task.';

/** Full system prompt for a role: specialty + (for agents) the team protocol. */
function roleSystemPrompt(role) {
  const spec = ROLE_SPECIALTY[role] || ('You are the ' + role + '.');
  return role === 'director' ? spec : spec + ' ' + TEAM_PROTOCOL;
}

// "When to use" lines for the Claude Code CLI subagent `description` field
// (drives /agents Library + auto-delegation by the Task tool).
const ROLE_DESC = {
  director:   'Coordinate a multi-role build: decompose a goal into tasks, assign them to specialists, review and approve the work.',
  researcher: 'Gather current facts, competitive analysis, or documentation from the live web.',
  architect:  'Design system architecture, interfaces, and a file-level implementation plan.',
  backend:    'Implement server-side logic, APIs, services, and data access.',
  frontend:   'Build UI components and client-side logic.',
  data:       'Design database schemas, migrations, and queries.',
  qa:         'Write and run tests; find edge cases and defects.',
  security:   'Audit code for vulnerabilities and unsafe patterns.',
  reviewer:   'Review code for correctness, readability, and maintainability.',
  media:      'Generate images and brand assets (via the ideogram tools).',
  devops:     'Handle builds, CI, packaging, and deployment configuration.',
  docs:       'Write README, changelog, and usage documentation.',
};

/**
 * Claude Code CLI native subagent definitions (for `.claude/agents/<name>.md`).
 * Each: { name (lowercase-hyphen), description (when-to-use), body (system
 * prompt) }. Body is the specialty only — native subagents are orchestrated by
 * their parent via the Task tool, so they don't need the self-reporting kanban
 * protocol the standalone terminal agents carry.
 */
function subagentDefs(team = TEAM_DEVOPS) {
  const out = [{ name: 'director', description: ROLE_DESC.director, body: ROLE_SPECIALTY.director }];
  for (const a of team.agents) {
    out.push({
      name: a.role,
      description: ROLE_DESC[a.role] || ('The ' + a.role + ' specialist.'),
      body: ROLE_SPECIALTY[a.role] || ('You are the ' + a.role + '.'),
    });
  }
  return out;
}

/**
 * Payload the main process ships to the renderer to spawn a team workspace.
 * The renderer can't require() this module, so everything it needs (names,
 * colours, MCP grants, and the assembled system prompts) is bundled here.
 */
function teamSpawnPayload(team = TEAM_DEVOPS) {
  return {
    team: team.name,
    director: {
      role: 'director',
      name: team.director.name,
      system: roleSystemPrompt('director'),
    },
    agents: team.agents.map(a => ({
      role:   a.role,
      name:   a.name,
      color:  a.color,
      mcp:    a.mcp || [],
      skills: a.skills || [],
      system: roleSystemPrompt(a.role),
    })),
  };
}

// Status values that map 1:1 to a kanban column (BLOCKED is internal-only).
const BOARD_STATUSES = ['todo', 'doing', 'review', 'done'];

// ── Kanban bridge (pure) ────────────────────────────────────────────────────
// Convert between the Director's task model and the shared kanban.json shape so
// the live board IS the bus. assignee/deps are preserved as first-class fields
// (the kanban sanitizer keeps them) AND mirrored as tags for the column-driven
// UI (@role for filtering, dep:<id> for visibility).
function toKanbanTask(t) {
  const tags = [];
  if (t.assignee) tags.push('@' + t.assignee);
  for (const d of (t.deps || [])) tags.push('dep:' + d);
  return {
    id:       t.id,
    col:      BOARD_STATUSES.includes(t.status) ? t.status : 'todo',
    title:    t.title || '',
    body:     t.body || '',
    tags,
    priority: ['low', 'med', 'high'].includes(t.priority) ? t.priority : 'med',
    assignee: t.assignee || '',
    deps:     Array.isArray(t.deps) ? t.deps.slice() : [],
  };
}

function fromKanbanTask(k) {
  const tags = Array.isArray(k.tags) ? k.tags : [];
  const assignee = k.assignee
    || (tags.find(x => typeof x === 'string' && x[0] === '@') || '').slice(1)
    || undefined;
  const deps = (Array.isArray(k.deps) && k.deps.length)
    ? k.deps.slice()
    : tags.filter(x => typeof x === 'string' && x.startsWith('dep:')).map(x => x.slice(4));
  return {
    id:       k.id,
    title:    k.title || '',
    body:     k.body || '',
    assignee,
    deps,
    priority: ['low', 'med', 'high'].includes(k.priority) ? k.priority : 'med',
    status:   BOARD_STATUSES.includes(k.col) ? k.col : 'todo',
  };
}

let _seq = 0;
function _id(now) { return 't' + (now || 0).toString(36) + '-' + (++_seq).toString(36); }

/**
 * Director — in-memory coordinator over a task list.
 *
 * @param {object} team  one of the TEAM_* defs (roles must cover task assignees)
 * @param {object} [opts]
 *   @param {boolean} [opts.gated=true]  director-gated (one task/agent, approve between)
 *   @param {number}  [opts.now=0]       injected clock (determinism; no Date.now here)
 */
class Director {
  constructor(team, opts = {}) {
    this.team = team;
    this.gated = opts.gated !== false;
    this.now = typeof opts.now === 'number' ? opts.now : 0;
    this.roles = new Set(team.agents.map(a => a.role));
    this.tasks = [];           // [{ id, title, body, assignee, deps, priority, status }]
    this.log = [];             // audit trail of director actions
  }

  _stamp(ev) { this.log.push({ t: this.now, ...ev }); }
  _byId(id) { return this.tasks.find(t => t.id === id) || null; }

  /**
   * Load a decomposition (what the Director-Claude produces from a goal).
   * Each task: { title, body?, assignee, deps?:[id|index], priority? }
   * Returns { ok, errors } — validates roles + dep references + cycles.
   */
  loadPlan(plan) {
    const errors = [];
    if (!Array.isArray(plan) || !plan.length) return { ok: false, errors: ['plan must be a non-empty array'] };

    // First pass: materialise tasks with stable ids (deps may reference array
    // index OR a provided id; normalise to ids).
    const idAt = plan.map(p => (typeof p.id === 'string' ? p.id : _id(this.now)));
    this.tasks = plan.map((p, i) => {
      const deps = (p.deps || []).map(d =>
        typeof d === 'number' ? idAt[d] : d).filter(Boolean);
      return {
        id:       idAt[i],
        title:    String(p.title || 'Untitled').slice(0, 200),
        body:     String(p.body || '').slice(0, 4000),
        assignee: p.assignee,
        deps,
        priority: ['low', 'med', 'high'].includes(p.priority) ? p.priority : 'med',
        status:   STATUS.TODO,
      };
    });

    // Validate roles
    for (const t of this.tasks) {
      if (!this.roles.has(t.assignee)) errors.push(`task ${t.id}: unknown role '${t.assignee}'`);
      for (const d of t.deps) if (!this._byId(d)) errors.push(`task ${t.id}: dep '${d}' not found`);
    }
    // Validate acyclic
    const cyc = this._findCycle();
    if (cyc) errors.push(`dependency cycle: ${cyc.join(' → ')}`);

    if (errors.length) { this.tasks = []; return { ok: false, errors }; }
    this._stamp({ ev: 'plan-loaded', count: this.tasks.length });
    return { ok: true, errors: [], count: this.tasks.length };
  }

  _findCycle() {
    const WHITE = 0, GREY = 1, BLACK = 2;
    const color = new Map(this.tasks.map(t => [t.id, WHITE]));
    const stack = [];
    const dfs = (id) => {
      color.set(id, GREY); stack.push(id);
      for (const d of (this._byId(id)?.deps || [])) {
        if (color.get(d) === GREY) return stack.slice(stack.indexOf(d)).concat(d);
        if (color.get(d) === WHITE) { const c = dfs(d); if (c) return c; }
      }
      color.set(id, BLACK); stack.pop(); return null;
    };
    for (const t of this.tasks) if (color.get(t.id) === WHITE) { const c = dfs(t.id); if (c) return c; }
    return null;
  }

  _depsMet(task) { return task.deps.every(d => this._byId(d)?.status === STATUS.DONE); }

  /** Tasks that COULD start now (todo + deps satisfied), by role. */
  ready() {
    return this.tasks.filter(t => t.status === STATUS.TODO && this._depsMet(t));
  }

  /** The task an agent is currently busy with (doing OR awaiting review). */
  activeFor(role) {
    return this.tasks.find(t => t.assignee === role &&
      (t.status === STATUS.DOING || t.status === STATUS.REVIEW)) || null;
  }

  /**
   * Compute the next batch of assignments. Director-gated: only hand a task to
   * an agent that has NOTHING active (one-task-at-a-time). Highest priority
   * first, then declaration order. Returns the tasks moved to 'doing'.
   */
  assignNext() {
    const pri = { high: 0, med: 1, low: 2 };
    const moved = [];
    const ready = this.ready().sort((a, b) =>
      (pri[a.priority] - pri[b.priority]) ||
      (this.tasks.indexOf(a) - this.tasks.indexOf(b)));
    const busy = new Set(this.team.agents
      .filter(a => this.activeFor(a.role))
      .map(a => a.role));
    for (const t of ready) {
      if (this.gated && busy.has(t.assignee)) continue; // one active per agent
      t.status = STATUS.DOING; t.updated = this.now;
      busy.add(t.assignee);
      moved.push(t);
      this._stamp({ ev: 'assign', task: t.id, role: t.assignee });
    }
    return moved;
  }

  /** Agent finished its task → awaits the Director's review. */
  submit(taskId) {
    const t = this._byId(taskId);
    if (!t || t.status !== STATUS.DOING) return { ok: false, error: 'not in doing' };
    t.status = STATUS.REVIEW; t.updated = this.now;
    this._stamp({ ev: 'submit', task: t.id, role: t.assignee });
    return { ok: true };
  }

  /** Director approves → done. This is the gate that frees the agent + deps. */
  approve(taskId) {
    const t = this._byId(taskId);
    if (!t || t.status !== STATUS.REVIEW) return { ok: false, error: 'not in review' };
    t.status = STATUS.DONE; t.updated = this.now;
    this._stamp({ ev: 'approve', task: t.id, role: t.assignee });
    return { ok: true };
  }

  /** Director rejects → back to the agent for rework. */
  reject(taskId, reason) {
    const t = this._byId(taskId);
    if (!t || t.status !== STATUS.REVIEW) return { ok: false, error: 'not in review' };
    t.status = STATUS.DOING; t.updated = this.now;
    this._stamp({ ev: 'reject', task: t.id, role: t.assignee, reason });
    return { ok: true };
  }

  /** Per-agent + overall snapshot for the team status panel. */
  status() {
    const agents = this.team.agents.map(a => {
      const active = this.activeFor(a.role);
      const mine = this.tasks.filter(t => t.assignee === a.role);
      return {
        role: a.role, name: a.name,
        state: active ? active.status : (mine.some(t => t.status === STATUS.TODO) ? 'queued' : 'idle'),
        active: active ? { id: active.id, title: active.title } : null,
        done: mine.filter(t => t.status === STATUS.DONE).length,
        total: mine.length,
      };
    });
    const counts = Object.values(STATUS).reduce((acc, s) => {
      acc[s] = this.tasks.filter(t => t.status === s).length; return acc;
    }, {});
    return { agents, counts, complete: this.isComplete(), stalled: this.isStalled() };
  }

  isComplete() { return this.tasks.length > 0 && this.tasks.every(t => t.status === STATUS.DONE); }

  /**
   * Stalled = work remains but nothing can progress and nothing is in flight.
   * (Distinct from a load-time cycle: this catches a runtime deadlock, e.g. a
   * task whose dep can never complete because no agent owns that role.)
   */
  isStalled() {
    if (this.isComplete()) return false;
    const inFlight = this.tasks.some(t => t.status === STATUS.DOING || t.status === STATUS.REVIEW);
    if (inFlight) return false;
    return this.ready().length === 0; // unfinished tasks but none ready, none moving
  }

  // ── Live-board bridge ──────────────────────────────────────────────────────

  /**
   * Reconstruct the Director's model directly from a live kanban snapshot
   * (ids already exist — unlike loadPlan, which mints them). Use this in the
   * MCP control plane: the board is the source of truth, so each tool call
   * rebuilds the Director from disk, acts, and writes back. Only tasks that
   * carry an assignee are treated as team tasks; plain kanban cards are ignored.
   * Returns { ok, count }.
   */
  loadFromKanban(ktasks) {
    this.tasks = (ktasks || [])
      .filter(k => k && (k.assignee || (Array.isArray(k.tags) && k.tags.some(t => typeof t === 'string' && t[0] === '@'))))
      .map(fromKanbanTask)
      .filter(t => t.assignee);                 // drop anything still role-less
    return { ok: true, count: this.tasks.length };
  }

  /** Serialize the whole plan to kanban tasks (for persisting to kanban.json). */
  toKanban() { return this.tasks.map(toKanbanTask); }

  /**
   * Re-read task statuses from a live kanban snapshot. Agents move THEIR OWN
   * tasks (To do → In progress → Needs review) by editing the board; this folds
   * those moves back into the Director's model. Returns the tasks that NEWLY
   * entered 'review' — i.e. the ones now redirected to the Director for sign-off.
   * (The Director still owns review→done via approve(); an agent cannot self-
   * approve — a board move straight to 'done' is treated as 'review'.)
   */
  syncFromKanban(ktasks) {
    const newReview = [];
    for (const k of (ktasks || [])) {
      const t = this._byId(k.id);
      if (!t) continue;
      let st = BOARD_STATUSES.includes(k.col) ? k.col : t.status;
      // Agents may not self-approve: a jump to 'done' becomes 'review'.
      if (st === STATUS.DONE && t.status !== STATUS.REVIEW && t.status !== STATUS.DONE) st = STATUS.REVIEW;
      if (st !== t.status) {
        if (st === STATUS.REVIEW) newReview.push(t);
        t.status = st; t.updated = this.now;
        this._stamp({ ev: 'sync', task: t.id, status: st });
      }
    }
    return newReview;
  }
}

module.exports = {
  Director, TEAM_DEVOPS, STATUS, BOARD_STATUSES,
  toKanbanTask, fromKanbanTask,
  ROLE_SPECIALTY, ROLE_DESC, TEAM_PROTOCOL, roleSystemPrompt, teamSpawnPayload,
  subagentDefs,
};
