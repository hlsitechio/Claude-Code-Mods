'use strict';

/**
 * cli-session-tracker.js — surface Claude Code CLI sessions in CCM's sidebar.
 *
 * Claude Code writes every session as a JSONL file at:
 *   ~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl
 *
 * `<encoded-cwd>` is the project's working dir with non-alphanum chars (path
 * separators, colons) replaced by `-`. The file UUID is the session id.
 *
 * On each scan we:
 *   1. List the encoded-cwd dir matching the project the user is in
 *   2. Read the first ~30 lines of each .jsonl to extract metadata:
 *        - sessionId (filename, sans .jsonl)
 *        - firstUserMessage (preview, ≤ 80 chars)
 *        - startedAt    (first event timestamp, ISO)
 *        - lastActivity (file mtime, ISO)
 *        - eventCount   (line count, capped)
 *   3. Sort by lastActivity desc, return last N
 *
 * Cheap (no full-file parse), no watcher dependency. Renderer calls
 * `cli-sessions:list` on init + an optional "refresh" button.
 */

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// Cap the per-file read at a few KB — first user message is almost always
// in the first 2-3 events. Avoids loading huge transcripts when we just want
// the preview.
const PREVIEW_READ_BYTES = 8 * 1024;

function _claudeProjectsDir() {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const dir  = process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude');
  return path.join(dir, 'projects');
}

// Claude Code encodes cwd by replacing EVERY non-alphanumeric character
// (path separators, drive colon, underscores!) with `-`. E.g.:
//   C:\Users\you            → C--Users-you
//   G:\claude_code_mod\full_install → G--claude-code-mod-full-install
// We mirror that exactly so renderer-side "show sessions for THIS project"
// resolves to the right directory.
function encodeCwd(cwd) {
  if (!cwd) return null;
  return String(cwd).replace(/[^A-Za-z0-9]/g, '-');
}

// Decode for display — lossy (a `-` could've been any of `:`, `\`, `/`, `_`),
// so we substitute `/` as a best-guess separator. Users mostly care about
// the tail (project folder name), which decodes legibly anyway.
function decodeCwd(encoded) {
  return encoded.replace(/^([A-Za-z])--/, '$1:\\').replace(/-/g, '/');
}

// SECURITY — validate any projectRoot received via IPC. An XSS in the main
// renderer could call cliSessions.link({projectRoot: '/etc'}) and the
// resulting fs.mkdirSync + fs.symlinkSync would happen with the user's
// privileges. We require: absolute path, exists, is a directory, under
// the user's home dir, no .. components after resolution.
function _assertSafeProjectRoot(p) {
  if (typeof p !== 'string' || !p) {
    throw new Error('projectRoot must be a non-empty string');
  }
  if (!path.isAbsolute(p)) {
    throw new Error('projectRoot must be absolute');
  }
  // Resolve to canonical form — collapses .. and normalises separators
  const resolved = path.resolve(p);
  if (resolved !== path.normalize(p)) {
    // Only fail if normalisation changed semantics (e.g. .. collapsing
    // changed which dir we're talking about). Some valid paths have
    // trailing separators that get cleaned up; those are fine.
    if (resolved.replace(/[\\/]+$/, '') !== p.replace(/[\\/]+$/, '')) {
      throw new Error(`projectRoot contains traversal: ${p}`);
    }
  }
  // Must exist + be a directory
  if (!fs.existsSync(resolved)) {
    throw new Error(`projectRoot does not exist: ${resolved}`);
  }
  if (!fs.statSync(resolved).isDirectory()) {
    throw new Error(`projectRoot is not a directory: ${resolved}`);
  }
  // Soft constraint: must be under the user's home OR an explicitly-
  // allowed dev drive (G:\, D:\ etc.). Refuse system locations on Windows.
  const lower = resolved.toLowerCase();
  const sysRoots = process.platform === 'win32'
    ? ['c:\\windows', 'c:\\program files', 'c:\\program files (x86)', 'c:\\programdata']
    : ['/etc', '/usr', '/bin', '/sbin', '/var', '/sys', '/proc', '/boot'];
  for (const s of sysRoots) {
    if (lower.startsWith(s)) {
      throw new Error(`Refusing system path as projectRoot: ${resolved}`);
    }
  }
  return resolved;
}

function _readFirstChunk(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const buf = Buffer.alloc(PREVIEW_READ_BYTES);
      const bytes = fs.readSync(fd, buf, 0, PREVIEW_READ_BYTES, 0);
      return buf.slice(0, bytes).toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch (_) { return ''; }
}

// Extract metadata from the first chunk of a session JSONL.
// Each line is a JSON object — we look for the first user message text.
function _parseMetadata(filePath, stat) {
  const sessionId = path.basename(filePath, '.jsonl');
  const chunk     = _readFirstChunk(filePath);
  // Drop the trailing line if it doesn't end with a newline AND the file is
  // larger than what we read — it's truncated mid-record and would fail to
  // parse, throwing away the chance to look at the next-most-recent event.
  // Common case: a session whose first user message is >8KB (e.g. a pasted
  // file dump) — without this guard we'd never extract a preview.
  const truncatedTail = chunk.length === PREVIEW_READ_BYTES
    && !chunk.endsWith('\n')
    && (stat?.size || 0) > PREVIEW_READ_BYTES;
  let lines = chunk.split('\n').filter(Boolean);
  if (truncatedTail && lines.length > 1) lines = lines.slice(0, -1);

  let firstUserMessage = null;
  let startedAt        = null;
  for (const line of lines) {
    let obj;
    try { obj = JSON.parse(line); } catch (_) { continue; }
    if (!startedAt && obj.timestamp) startedAt = obj.timestamp;
    // Claude Code session events vary in shape — look in a few places:
    //   {role:"user", content:"..."}
    //   {type:"user", message:{content:[{type:"text", text:"..."}]}}
    //   {content:"..."}
    if (!firstUserMessage) {
      if (obj.role === 'user' && typeof obj.content === 'string') {
        firstUserMessage = obj.content;
      } else if (obj.type === 'user' && obj.message?.content) {
        const c = obj.message.content;
        if (typeof c === 'string') firstUserMessage = c;
        else if (Array.isArray(c)) {
          const first = c.find(x => x?.type === 'text' && x?.text);
          if (first) firstUserMessage = first.text;
        }
      } else if (obj.message?.role === 'user' && typeof obj.message?.content === 'string') {
        firstUserMessage = obj.message.content;
      }
    }
    if (firstUserMessage && startedAt) break;
  }

  return {
    sessionId,
    filePath,
    firstUserMessage: firstUserMessage
      ? firstUserMessage.replace(/\s+/g, ' ').trim().slice(0, 120)
      : null,
    startedAt:    startedAt || (stat?.birthtime?.toISOString() ?? null),
    lastActivity: stat?.mtime?.toISOString() ?? null,
    sizeBytes:    stat?.size ?? 0,
  };
}

/**
 * List recent Claude CLI sessions.
 *
 * @param {object} opts
 * @param {string} [opts.cwd]   If set, scope to sessions for this project
 *                              (encoded). If absent, scans ALL projects.
 * @param {number} [opts.limit] Max sessions to return (default 25)
 * @returns {Array<{sessionId, project, firstUserMessage, startedAt, lastActivity}>}
 */
function listSessions({ cwd, limit = 25 } = {}) {
  const projectsRoot = _claudeProjectsDir();
  if (!fs.existsSync(projectsRoot)) return [];

  let projectDirs;
  if (cwd) {
    const encoded = encodeCwd(cwd);
    const target  = path.join(projectsRoot, encoded);
    projectDirs   = fs.existsSync(target) ? [encoded] : [];
  } else {
    try {
      projectDirs = fs.readdirSync(projectsRoot, { withFileTypes: true })
        .filter(e => e.isDirectory())
        .map(e => e.name);
    } catch (_) { projectDirs = []; }
  }

  const all = [];
  for (const projDir of projectDirs) {
    const dir = path.join(projectsRoot, projDir);
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => e.isFile() && e.name.endsWith('.jsonl'));
    } catch (_) { continue; }
    // First pass: stat all so we can sort by mtime and skip parsing the
    // ones we'll throw away anyway.
    const stats = [];
    for (const e of entries) {
      const fp = path.join(dir, e.name);
      try { stats.push({ fp, stat: fs.statSync(fp), proj: projDir }); }
      catch (_) {}
    }
    stats.sort((a, b) => (b.stat.mtimeMs || 0) - (a.stat.mtimeMs || 0));
    // Only parse the top K from each project (we'll re-trim globally below)
    for (const s of stats.slice(0, limit)) {
      const meta = _parseMetadata(s.fp, s.stat);
      meta.project        = s.proj;
      meta.projectDisplay = decodeCwd(s.proj);
      all.push(meta);
    }
  }

  // Global sort by lastActivity desc, then trim
  all.sort((a, b) => (new Date(b.lastActivity || 0)) - (new Date(a.lastActivity || 0)));
  return all.slice(0, limit);
}

/**
 * Read a session file as raw JSONL string (renderer can parse + render).
 * @param {object} opts
 * @param {string} opts.sessionId
 * @param {string} opts.project   The encoded-cwd dir name
 * @returns {string} the JSONL contents (capped at 1MB for safety)
 */
// SECURITY — sessionId must match the strict UUID v4-ish shape Claude Code
// uses (8-4-4-4-12 hex). The looser `^[a-f0-9-]{36}$` allowed "all dashes"
// and other shapes that could combine with a planted file to read content
// the user didn't intend.
const _STRICT_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
// SECURITY — project (the encoded-cwd dir name) must match the encodeCwd
// output shape: alphanumerics + hyphens only. Old regex `/[\\/]/` blocked
// slashes but missed `..` which enables one-level traversal.
const _SAFE_PROJECT = /^[A-Za-z0-9-]+$/;

function readSession({ sessionId, project } = {}) {
  if (!sessionId || !_STRICT_UUID.test(sessionId)) throw new Error('invalid sessionId');
  if (!project   || !_SAFE_PROJECT.test(project))  throw new Error('invalid project');
  const filePath = path.join(_claudeProjectsDir(), project, sessionId + '.jsonl');
  if (!fs.existsSync(filePath)) throw new Error('session file not found');
  const stat = fs.statSync(filePath);
  if (stat.size > 1024 * 1024) {
    // Tail the last 1MB rather than refuse — long sessions still openable
    const fd  = fs.openSync(filePath, 'r');
    try {
      const buf = Buffer.alloc(1024 * 1024);
      fs.readSync(fd, buf, 0, buf.length, stat.size - buf.length);
      return '... (truncated to last 1MB) ...\n' + buf.toString('utf8');
    } finally { fs.closeSync(fd); }
  }
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Resolve the on-disk path of a session — useful for "Open file location"
 * actions in the renderer.
 */
function sessionPath({ sessionId, project } = {}) {
  if (!sessionId || !_STRICT_UUID.test(sessionId)) throw new Error('invalid sessionId');
  if (!project   || !_SAFE_PROJECT.test(project))  throw new Error('invalid project');
  return path.join(_claudeProjectsDir(), project, sessionId + '.jsonl');
}

// ── Storage location management (Phase 18b) ──────────────────────────────
// Claude Code always writes sessions to ~/.claude/projects/<encoded>/<uuid>.jsonl.
// We can't change that without breaking Claude's config + hooks/plugins
// resolution. BUT we CAN replace the destination directory with a
// junction (Windows) / symlink (Mac/Linux) pointing at the project — so
// Claude keeps writing where it expects, but the files transparently land
// in `<project>/sessions/claude_session_cli/`. The user gets project-local
// session storage; Claude doesn't know the difference.

const SESSIONS_SUBDIR = path.join('sessions', 'claude_session_cli');

/**
 * Inspect the storage state for a project.
 * @param {object} opts
 * @param {string} opts.projectRoot   Absolute path to the project root
 * @returns {{ linked, claudeDir, projectDir, projectDirExists, fileCount, linkTarget }}
 */
function getStorageStatus({ projectRoot } = {}) {
  projectRoot = _assertSafeProjectRoot(projectRoot);
  const encoded    = encodeCwd(projectRoot);
  const claudeDir  = path.join(_claudeProjectsDir(), encoded);
  const projectDir = path.join(projectRoot, SESSIONS_SUBDIR);

  let linked     = false;
  let linkTarget = null;
  if (fs.existsSync(claudeDir)) {
    try {
      const stat = fs.lstatSync(claudeDir);
      if (stat.isSymbolicLink()) {
        linkTarget = fs.readlinkSync(claudeDir);
        linked = path.resolve(linkTarget) === path.resolve(projectDir);
      }
    } catch (_) { /* fall through */ }
  }

  let fileCount = 0;
  try {
    const dir = linked ? projectDir : claudeDir;
    if (fs.existsSync(dir)) {
      fileCount = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl')).length;
    }
  } catch (_) {}

  return {
    linked,
    claudeDir,
    projectDir,
    projectDirExists: fs.existsSync(projectDir),
    fileCount,
    linkTarget,
  };
}

/**
 * Link Claude's session directory for this project to the project folder.
 * Idempotent — if already linked correctly, returns ok with alreadyLinked.
 *
 *   1. mkdir -p  <project>/sessions/claude_session_cli/
 *   2. Copy each existing ~/.claude/projects/<encoded>/<file> → projectDir
 *   3. Rename ~/.claude/projects/<encoded> → ~/.claude/projects/<encoded>.before-link.bak
 *      (kept as a recovery hedge in case something goes wrong)
 *   4. fs.symlinkSync(projectDir, ~/.claude/projects/<encoded>, 'junction')
 *
 * SAFETY: the user must close any open Claude CLI sessions first — Windows
 * locks open files, the rename in step 3 would fail. We don't try to detect
 * this; the OS error surfaces back to the renderer cleanly.
 *
 * Refuses to operate if `claudeDir` exists and is not a regular directory
 * (e.g. someone already linked it elsewhere). Refuses if `projectDir`
 * already exists with conflicting content unless `force` is passed.
 *
 * @param {object} opts
 * @param {string}  opts.projectRoot
 * @param {boolean} [opts.force=false]  Overwrite collisions in projectDir
 */
function linkSessionsToProject({ projectRoot, force = false } = {}) {
  projectRoot = _assertSafeProjectRoot(projectRoot);
  const status = getStorageStatus({ projectRoot });
  if (status.linked) {
    return { ok: true, alreadyLinked: true, ...status };
  }
  // If claudeDir exists as a symlink to a DIFFERENT path, refuse — don't
  // silently re-point someone else's setup.
  if (status.linkTarget && !status.linked) {
    throw new Error(
      `Already linked to a different path: ${status.linkTarget}. ` +
      `Delete that link manually first if you want to re-link here.`
    );
  }

  // 1. mkdir -p the project dir
  fs.mkdirSync(status.projectDir, { recursive: true });

  // 2. Copy existing files (skip ones already present unless force)
  const copied = [];
  const skipped = [];
  if (fs.existsSync(status.claudeDir)) {
    for (const fname of fs.readdirSync(status.claudeDir)) {
      const src = path.join(status.claudeDir, fname);
      const dst = path.join(status.projectDir, fname);
      try {
        const srcStat = fs.statSync(src);
        if (!srcStat.isFile()) continue;
        if (fs.existsSync(dst) && !force) {
          // Skip if dst is identical size (already there); otherwise warn
          const dstStat = fs.statSync(dst);
          if (dstStat.size === srcStat.size) { skipped.push({ fname, reason: 'identical' }); continue; }
          skipped.push({ fname, reason: 'collision' });
          continue;
        }
        fs.copyFileSync(src, dst);
        copied.push(fname);
      } catch (e) {
        skipped.push({ fname, reason: e.code || e.message });
      }
    }
  }

  // 3. Move original aside (recoverable backup)
  let backupPath = null;
  if (fs.existsSync(status.claudeDir)) {
    backupPath = status.claudeDir + '.before-link.bak';
    // If a prior backup exists, append a random suffix. Date.now() (ms) can
    // collide on rapid back-to-back link/unlink/link calls; crypto random
    // gives 32 bits of suffix entropy.
    if (fs.existsSync(backupPath)) {
      const suffix = require('crypto').randomBytes(4).toString('hex');
      backupPath = backupPath + '.' + suffix;
    }
    try {
      fs.renameSync(status.claudeDir, backupPath);
    } catch (e) {
      // Common failure: a file in claudeDir is currently open (live session).
      // Roll back the partial work by removing newly-copied files? Tricky.
      // Cleanest: surface a clear error, no rollback. The copy step is
      // additive only, so the worst case is "files exist in both places".
      throw new Error(
        `Could not rename ${status.claudeDir} (likely a Claude CLI session is open). ` +
        `Close all Claude CLI terminals and retry. (${e.code || e.message})`
      );
    }
  }

  // 4. Create the junction (Windows) / dir symlink (Mac/Linux)
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  try {
    fs.symlinkSync(status.projectDir, status.claudeDir, linkType);
  } catch (e) {
    // Rollback: rename backup back
    if (backupPath && fs.existsSync(backupPath) && !fs.existsSync(status.claudeDir)) {
      try { fs.renameSync(backupPath, status.claudeDir); } catch (_) {}
    }
    throw new Error(`Could not create ${linkType} link: ${e.code || e.message}`);
  }

  return {
    ok: true,
    linked: true,
    claudeDir:  status.claudeDir,
    projectDir: status.projectDir,
    copied,
    skipped,
    backup: backupPath,
    linkType,
  };
}

/**
 * Reverse of linkSessionsToProject: removes the junction, optionally restores
 * the backup. Files remain in projectDir either way — the user can decide
 * whether to keep them there or delete.
 */
function unlinkSessionsFromProject({ projectRoot, restoreBackup = false } = {}) {
  projectRoot = _assertSafeProjectRoot(projectRoot);
  const encoded   = encodeCwd(projectRoot);
  const claudeDir = path.join(_claudeProjectsDir(), encoded);
  const backupDir = claudeDir + '.before-link.bak';

  if (fs.existsSync(claudeDir)) {
    const stat = fs.lstatSync(claudeDir);
    if (!stat.isSymbolicLink()) {
      throw new Error('claudeDir is not a symlink — nothing to unlink');
    }
    // Remove the link itself, not its target
    fs.unlinkSync(claudeDir);
  }

  if (restoreBackup && fs.existsSync(backupDir)) {
    fs.renameSync(backupDir, claudeDir);
  }
  return { ok: true, restored: restoreBackup };
}

module.exports = {
  listSessions,
  readSession,
  sessionPath,
  encodeCwd,
  decodeCwd,
  getStorageStatus,
  linkSessionsToProject,
  unlinkSessionsFromProject,
};
