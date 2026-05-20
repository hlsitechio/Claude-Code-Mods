#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Kanban CLI — Claude Code Mods
 * ────────────────────────────
 * Reads/writes the same kanban.json that the CCM UI uses, so terminal users
 * (and Claude when run from PowerShell/bash inside the project) can list,
 * add, move, edit, and delete tasks without opening the desktop app.
 *
 *   kanban list                              show the full board
 *   kanban add "Title" [--col=todo] [--pri=high] [--body="..."] [--tags=a,b]
 *   kanban move <id> <col>                   move a task to another column
 *   kanban done <id>                         shorthand for: move <id> done
 *   kanban edit <id> --title="..." --body="..." --pri=med --tags=x,y
 *   kanban rm <id>                           delete a task
 *   kanban clear-done                        remove every task in Done
 *   kanban path                              print absolute path to kanban.json
 *   kanban summary                           print plain-text summary (for piping)
 *   kanban json                              print raw JSON (for scripting)
 *
 * Storage:
 *   - Looks for kanban.json in the current working directory first.
 *   - Walks parent dirs up to 6 levels looking for an existing kanban.json.
 *   - If none found, creates one in the current working directory.
 *
 * Schema matches electron/main.js — both ends share one source of truth.
 */

import fs   from 'node:fs';
import path from 'node:path';
import os   from 'node:os';

const ARGS = process.argv.slice(2);
const CMD  = (ARGS[0] || 'list').toLowerCase();

// ── Locate or create kanban.json ─────────────────────────────────────────────
function findKanbanFile() {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'kanban.json');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.join(process.cwd(), 'kanban.json');
}

const KANBAN_FILE = findKanbanFile();

const DEFAULT_BOARD = () => ({
  version: 1,
  updated: Date.now(),
  columns: [
    { id: 'todo',  name: 'To do',       color: '#6e88c3' },
    { id: 'doing', name: 'In progress', color: '#d97757' },
    { id: 'done',  name: 'Done',        color: '#7ab389' },
  ],
  tasks: [],
});

function readBoard() {
  try {
    if (!fs.existsSync(KANBAN_FILE)) return DEFAULT_BOARD();
    const data = JSON.parse(fs.readFileSync(KANBAN_FILE, 'utf8'));
    if (!data.columns?.length) data.columns = DEFAULT_BOARD().columns;
    if (!Array.isArray(data.tasks)) data.tasks = [];
    return data;
  } catch (e) {
    console.error('Error reading', KANBAN_FILE, e.message);
    return DEFAULT_BOARD();
  }
}

function writeBoard(data) {
  data.updated = Date.now();
  fs.mkdirSync(path.dirname(KANBAN_FILE), { recursive: true });
  fs.writeFileSync(KANBAN_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function newId() {
  return 'k-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

function parseFlags(args) {
  // Splits positional args from --key=value / --key value pairs.
  // Returns { positional: [...], flags: { key: value, ... } }
  const positional = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        // Look ahead for value
        if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
          flags[key] = args[i + 1];
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}

// ── ANSI color helpers (TTY only) ────────────────────────────────────────────
const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => (s) => isTTY ? `\x1b[${code}m${s}\x1b[0m` : String(s);
const dim    = c('2');
const bold   = c('1');
const red    = c('31');
const green  = c('32');
const yellow = c('33');
const blue   = c('34');
const cyan   = c('36');
const gray   = c('90');

const PRI_COLOR = { high: red, med: yellow, low: green };
const PRI_GLYPH = { high: '●', med: '●', low: '●' };

// ── Commands ──────────────────────────────────────────────────────────────────
function cmdList() {
  const data = readBoard();
  const path_ = KANBAN_FILE;
  console.log(bold('Kanban') + dim('  ' + path_));
  console.log(dim('Updated ' + new Date(data.updated).toLocaleString()));
  console.log('');
  for (const col of data.columns) {
    const tasks = data.tasks
      .filter(t => t.col === col.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const head = `${bold(col.name)} ${dim('(' + tasks.length + ')')}`;
    console.log(head);
    console.log(dim('─'.repeat(Math.max(20, col.name.length + 8))));
    if (!tasks.length) {
      console.log(dim('  (empty)'));
    } else {
      for (const t of tasks) {
        const pri = (PRI_COLOR[t.priority] || gray)(PRI_GLYPH[t.priority] || '·');
        const id  = gray(t.id.slice(-6));
        const tags = t.tags?.length ? '  ' + dim('[' + t.tags.join(', ') + ']') : '';
        console.log(`  ${pri}  ${t.title}  ${id}${tags}`);
        if (t.body) {
          for (const ln of t.body.split('\n').slice(0, 4)) {
            if (ln.trim()) console.log(`        ${dim(ln)}`);
          }
        }
      }
    }
    console.log('');
  }
}

function cmdAdd() {
  const { positional, flags } = parseFlags(ARGS.slice(1));
  const title = positional.join(' ').trim();
  if (!title) {
    console.error(red('Error:') + ' missing title.   usage: kanban add "Title" [--col=todo] [--pri=high]');
    process.exit(1);
  }
  const data = readBoard();
  const col  = flags.col || flags.c || 'todo';
  if (!data.columns.find(x => x.id === col)) {
    console.error(red('Error:') + ' unknown column "' + col + '". valid: ' + data.columns.map(x => x.id).join(', '));
    process.exit(1);
  }
  const sameCol = data.tasks.filter(t => t.col === col);
  const task = {
    id:       newId(),
    col,
    title,
    body:     flags.body || '',
    tags:     (flags.tags || '').split(',').map(s => s.trim()).filter(Boolean),
    priority: ['high','med','low'].includes(flags.pri) ? flags.pri : 'med',
    created:  Date.now(),
    updated:  Date.now(),
    order:    sameCol.length ? Math.max(...sameCol.map(t => t.order || 0)) + 1 : 0,
  };
  data.tasks.push(task);
  writeBoard(data);
  console.log(green('+ Added') + ' ' + bold(title) + ' ' + dim('(' + task.id.slice(-6) + ' → ' + col + ')'));
}

function cmdMove() {
  const { positional } = parseFlags(ARGS.slice(1));
  const [idArg, colArg] = positional;
  if (!idArg || !colArg) {
    console.error(red('Error:') + ' usage: kanban move <id> <col>');
    process.exit(1);
  }
  const data = readBoard();
  const task = data.tasks.find(t => t.id === idArg || t.id.endsWith(idArg));
  if (!task) { console.error(red('Error:') + ' task not found: ' + idArg); process.exit(1); }
  if (!data.columns.find(x => x.id === colArg)) {
    console.error(red('Error:') + ' unknown column. valid: ' + data.columns.map(x => x.id).join(', '));
    process.exit(1);
  }
  task.col = colArg;
  task.updated = Date.now();
  writeBoard(data);
  console.log(cyan('→ Moved') + ' ' + bold(task.title) + ' ' + dim('to ' + colArg));
}

function cmdDone() {
  const id = ARGS[1];
  if (!id) { console.error(red('Error:') + ' usage: kanban done <id>'); process.exit(1); }
  const data = readBoard();
  const task = data.tasks.find(t => t.id === id || t.id.endsWith(id));
  if (!task) { console.error(red('Error:') + ' task not found: ' + id); process.exit(1); }
  task.col = 'done';
  task.updated = Date.now();
  writeBoard(data);
  console.log(green('✓ Done') + '  ' + bold(task.title));
}

function cmdEdit() {
  const { positional, flags } = parseFlags(ARGS.slice(1));
  const id = positional[0];
  if (!id) { console.error(red('Error:') + ' usage: kanban edit <id> [--title=...] [--body=...] [--pri=med] [--tags=a,b]'); process.exit(1); }
  const data = readBoard();
  const task = data.tasks.find(t => t.id === id || t.id.endsWith(id));
  if (!task) { console.error(red('Error:') + ' task not found: ' + id); process.exit(1); }
  if (flags.title) task.title = flags.title;
  if (flags.body  !== undefined) task.body = flags.body;
  if (flags.pri && ['high','med','low'].includes(flags.pri)) task.priority = flags.pri;
  if (flags.tags !== undefined) task.tags = flags.tags.split(',').map(s => s.trim()).filter(Boolean);
  task.updated = Date.now();
  writeBoard(data);
  console.log(blue('✎ Edited') + ' ' + bold(task.title));
}

function cmdRm() {
  const id = ARGS[1];
  if (!id) { console.error(red('Error:') + ' usage: kanban rm <id>'); process.exit(1); }
  const data = readBoard();
  const before = data.tasks.length;
  data.tasks = data.tasks.filter(t => !(t.id === id || t.id.endsWith(id)));
  if (data.tasks.length === before) { console.error(red('Error:') + ' task not found: ' + id); process.exit(1); }
  writeBoard(data);
  console.log(red('✗ Removed') + ' ' + dim(id));
}

function cmdClearDone() {
  const data = readBoard();
  const removed = data.tasks.filter(t => t.col === 'done').length;
  data.tasks = data.tasks.filter(t => t.col !== 'done');
  writeBoard(data);
  console.log(dim('Cleared ' + removed + ' completed task' + (removed === 1 ? '' : 's')));
}

function cmdSummary() {
  const data = readBoard();
  const lines = ['# Kanban', `*${path.basename(KANBAN_FILE)}* · updated ${new Date(data.updated).toLocaleString()}`, ''];
  for (const col of data.columns) {
    const tasks = data.tasks
      .filter(t => t.col === col.id)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    lines.push(`## ${col.name} (${tasks.length})`);
    if (!tasks.length) { lines.push('_— empty —_', ''); continue; }
    for (const t of tasks) {
      const pri = t.priority === 'high' ? ' 🔴' : t.priority === 'low' ? ' 🟢' : ' 🟡';
      const tags = t.tags?.length ? ` [${t.tags.join(', ')}]` : '';
      lines.push(`- **${t.title}**${pri}${tags}`);
      if (t.body) for (const bl of t.body.split('\n')) lines.push(`  > ${bl}`);
    }
    lines.push('');
  }
  console.log(lines.join('\n'));
}

function cmdHelp() {
  console.log(`${bold('kanban')} — Claude Code Mods task board CLI

${bold('Commands:')}
  ${green('list')}                                  show the full board (default)
  ${green('add')}    "Title" [--col=todo] [--pri=high] [--body=...] [--tags=a,b]
  ${green('move')}   <id> <col>                     move a task to another column
  ${green('done')}   <id>                           shorthand for: move <id> done
  ${green('edit')}   <id> [--title=...] [--body=...] [--pri=med] [--tags=...]
  ${green('rm')}     <id>                           delete a task
  ${green('clear-done')}                            remove every task in Done
  ${green('path')}                                  print absolute path to kanban.json
  ${green('summary')}                               print markdown summary
  ${green('json')}                                  print raw JSON
  ${green('help')}                                  show this help

${bold('Examples:')}
  ${dim('$ kanban add "Refactor module X" --pri=high --tags=refactor,debt')}
  ${dim('$ kanban move k-abc123 doing')}
  ${dim('$ kanban done k-abc123')}
  ${dim('$ kanban summary | pbcopy   # paste into chat')}

${bold('Storage:')}  ${dim(KANBAN_FILE)}`);
}

// ── Dispatch ─────────────────────────────────────────────────────────────────
try {
  switch (CMD) {
    case 'list': case 'ls': case '':       cmdList();      break;
    case 'add':                            cmdAdd();       break;
    case 'mv': case 'move':                cmdMove();      break;
    case 'done':                           cmdDone();      break;
    case 'edit': case 'update':            cmdEdit();      break;
    case 'rm': case 'delete': case 'del':  cmdRm();        break;
    case 'clear-done': case 'cleardone':   cmdClearDone(); break;
    case 'path':                           console.log(KANBAN_FILE); break;
    case 'summary':                        cmdSummary();   break;
    case 'json':                           console.log(JSON.stringify(readBoard(), null, 2)); break;
    case 'help': case '-h': case '--help': cmdHelp();      break;
    default:
      console.error(red('Unknown command: ') + CMD);
      console.error(dim('Run "kanban help" for usage.'));
      process.exit(1);
  }
} catch (e) {
  console.error(red('Error: ') + e.message);
  process.exit(1);
}
