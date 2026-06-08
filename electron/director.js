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
 * Kanban mapping (for the live wiring step — not used by this pure module):
 *   status 'todo'|'doing'         → kanban col 'todo'|'doing'
 *   status 'review'               → kanban col 'doing' + tag 'review'
 *   status 'done'                 → kanban col 'done'
 *   assignee role                 → kanban tag '@<role>'
 *   deps                          → tag 'dep:<id>' (or a preserved field)
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
}

module.exports = { Director, TEAM_DEVOPS, STATUS };
