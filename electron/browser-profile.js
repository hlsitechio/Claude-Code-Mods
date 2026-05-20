'use strict';

/**
 * browser-profile.js — Claude's persistent browser identity
 * ─────────────────────────────────────────────────────────
 * Bookmarks, history, per-URL notes, preferences, and reading list.
 * All exposed via `global.ccmBrowserProfile` to claude-service (Direct mode
 * tools) and via the HTTP control server (MCP bridge).
 *
 * Storage layout (all under %APPDATA%/claude-code-desktop/browser-profile/):
 *   bookmarks.json   — array of { id, url, title, folder, tags[], created }
 *   history.jsonl    — append-only NDJSON of { url, title, visited }
 *   notes.json       — object { [url]: { content, updated } }
 *   prefs.json       — flat key/value
 *   readlist.json    — array of { id, url, title, notes, added, done }
 *
 * Why JSON and not SQLite:
 *   • Zero native deps (works on every platform Electron ships)
 *   • Trivial to back up — copy the directory
 *   • Trivial for the user to inspect / edit by hand
 *   • Size is tiny (a few thousand bookmarks fit in <1MB)
 *   • History uses jsonl so appends are O(1) and rotation is easy
 *
 * The entire directory is outside the repo (OS userData) — never tracked.
 */

const fs   = require('fs');
const path = require('path');
const { app } = require('electron');

let PROFILE_DIR = null;
function profileDir() {
  if (PROFILE_DIR) return PROFILE_DIR;
  PROFILE_DIR = path.join(app.getPath('userData'), 'browser-profile');
  try { fs.mkdirSync(PROFILE_DIR, { recursive: true }); } catch (_) {}
  return PROFILE_DIR;
}

// ── Small helpers ───────────────────────────────────────────────────────────
function _readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn('[browser-profile] read failed:', file, e.message);
    return fallback;
  }
}
function _writeJson(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Atomic write — temp + rename so a crash doesn't corrupt the file
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  } catch (e) {
    console.error('[browser-profile] write failed:', file, e.message);
  }
}
function _id() {
  return 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}
function _now() { return Date.now(); }
function _normUrl(url) {
  // Trim hash + trailing slash so "https://x.com/", "https://x.com#a", etc all
  // map to the same canonical key for notes / bookmarks / history dedup.
  if (typeof url !== 'string') return '';
  try {
    const u = new URL(url);
    u.hash = '';
    let s = u.toString();
    if (s.endsWith('/') && u.pathname === '/') s = s.slice(0, -1);
    return s;
  } catch (_) { return url.trim(); }
}

// ── Bookmarks ───────────────────────────────────────────────────────────────
function bookmarksFile() { return path.join(profileDir(), 'bookmarks.json'); }
function readBookmarks() { return _readJson(bookmarksFile(), []); }
function writeBookmarks(arr) { _writeJson(bookmarksFile(), arr); }

function listBookmarks(opts = {}) {
  const arr = readBookmarks();
  if (opts.folder) return arr.filter(b => b.folder === opts.folder);
  return arr;
}
function addBookmark({ url, title, folder = null, tags = [] }) {
  if (!url) throw new Error('url required');
  const arr = readBookmarks();
  const norm = _normUrl(url);
  // Dedup — if already bookmarked, just update title/folder/tags
  const existing = arr.find(b => _normUrl(b.url) === norm);
  if (existing) {
    if (title) existing.title = title;
    if (folder !== null) existing.folder = folder;
    if (tags?.length) existing.tags = tags;
    existing.updated = _now();
    writeBookmarks(arr);
    return existing;
  }
  const bm = {
    id:      _id(),
    url,
    title:   title || url,
    folder,
    tags:    Array.isArray(tags) ? tags.slice(0, 10) : [],
    created: _now(),
  };
  arr.unshift(bm); // most recent first
  writeBookmarks(arr);
  return bm;
}
function removeBookmark({ url, id }) {
  const arr = readBookmarks();
  const before = arr.length;
  let filtered;
  if (id) {
    filtered = arr.filter(b => b.id !== id);
  } else if (url) {
    const norm = _normUrl(url);
    filtered = arr.filter(b => _normUrl(b.url) !== norm);
  } else {
    throw new Error('url or id required');
  }
  writeBookmarks(filtered);
  return { removed: before - filtered.length };
}
function searchBookmarks(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return readBookmarks();
  return readBookmarks().filter(b =>
    (b.title || '').toLowerCase().includes(q) ||
    (b.url   || '').toLowerCase().includes(q) ||
    (b.tags || []).some(t => t.toLowerCase().includes(q))
  );
}
function isBookmarked(url) {
  const norm = _normUrl(url);
  return readBookmarks().some(b => _normUrl(b.url) === norm);
}
function bookmarkFolders(limit = 8) {
  const seen = new Map();
  for (const b of readBookmarks()) {
    if (!b.folder) continue;
    seen.set(b.folder, (seen.get(b.folder) || 0) + 1);
  }
  return Array.from(seen.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([f]) => f);
}

// ── History ─────────────────────────────────────────────────────────────────
// Append-only NDJSON keeps writes O(1). Recent reads scan the tail.
// Rotation happens at 50k lines (~5MB) — old half goes to history-archive.jsonl.
function historyFile() { return path.join(profileDir(), 'history.jsonl'); }
function historyArchive() { return path.join(profileDir(), 'history-archive.jsonl'); }
const HISTORY_ROTATE_AT = 50_000;

function recordVisit({ url, title }) {
  if (!url) return;
  const entry = { url: _normUrl(url), title: title || '', visited: _now() };
  try {
    fs.mkdirSync(profileDir(), { recursive: true });
    fs.appendFileSync(historyFile(), JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    console.warn('[browser-profile] history append failed:', e.message);
  }
  _maybeRotateHistory();
}
function _readHistoryRaw(file) {
  try {
    if (!fs.existsSync(file)) return [];
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch (_) { return null; }
    }).filter(Boolean);
  } catch (_) { return []; }
}
function _maybeRotateHistory() {
  try {
    const stat = fs.statSync(historyFile());
    if (stat.size < HISTORY_ROTATE_AT * 200) return; // ~200B/line average
    const all = _readHistoryRaw(historyFile());
    if (all.length < HISTORY_ROTATE_AT) return;
    const half = Math.floor(all.length / 2);
    const old  = all.slice(0, half);
    const keep = all.slice(half);
    // Append old half to archive
    fs.appendFileSync(
      historyArchive(),
      old.map(e => JSON.stringify(e)).join('\n') + '\n',
      'utf8'
    );
    // Rewrite live file with just the recent half
    fs.writeFileSync(historyFile(), keep.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
    console.log('[browser-profile] history rotated:', old.length, 'archived');
  } catch (_) { /* ignore */ }
}
function historyRecent(limit = 30) {
  const all = _readHistoryRaw(historyFile());
  return all.slice(-Math.max(1, limit)).reverse(); // most-recent-first
}
function searchHistory(query, opts = {}) {
  const q = (query || '').trim().toLowerCase();
  const since = opts.since || 0;
  const all = _readHistoryRaw(historyFile()).reverse(); // newest first
  const matches = [];
  for (const e of all) {
    if (e.visited < since) continue;
    if (!q) { matches.push(e); }
    else if (
      (e.url   || '').toLowerCase().includes(q) ||
      (e.title || '').toLowerCase().includes(q)
    ) matches.push(e);
    if (matches.length >= (opts.limit || 50)) break;
  }
  return matches;
}
function clearHistory(opts = {}) {
  if (opts.all) {
    try { fs.unlinkSync(historyFile()); } catch (_) {}
    try { fs.unlinkSync(historyArchive()); } catch (_) {}
    return { cleared: 'all' };
  }
  if (opts.domain) {
    const all = _readHistoryRaw(historyFile());
    const kept = all.filter(e => {
      try { return new URL(e.url).hostname !== opts.domain; }
      catch (_) { return true; }
    });
    fs.writeFileSync(historyFile(), kept.map(e => JSON.stringify(e)).join('\n') + '\n', 'utf8');
    return { cleared: all.length - kept.length };
  }
  return { cleared: 0 };
}

// ── Per-URL notes (Claude's "memory" attached to pages) ────────────────────
function notesFile() { return path.join(profileDir(), 'notes.json'); }
function readNotes() { return _readJson(notesFile(), {}); }
function writeNotes(obj) { _writeJson(notesFile(), obj); }

function getNote(url) {
  if (!url) return null;
  const notes = readNotes();
  return notes[_normUrl(url)] || null;
}
function setNote({ url, content }) {
  if (!url) throw new Error('url required');
  const notes = readNotes();
  const key = _normUrl(url);
  if (!content || !content.trim()) {
    delete notes[key];
  } else {
    notes[key] = { content: content.slice(0, 8000), updated: _now() };
  }
  writeNotes(notes);
  return notes[key] || null;
}
function searchNotes(query) {
  const q = (query || '').trim().toLowerCase();
  const notes = readNotes();
  const out = [];
  for (const [url, n] of Object.entries(notes)) {
    if (!q || (n.content || '').toLowerCase().includes(q) || url.toLowerCase().includes(q)) {
      out.push({ url, ...n });
    }
  }
  return out.sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

// ── Preferences ─────────────────────────────────────────────────────────────
function prefsFile() { return path.join(profileDir(), 'prefs.json'); }
function readPrefs() { return _readJson(prefsFile(), {}); }
function writePrefs(obj) { _writeJson(prefsFile(), obj); }
function getPref(key) { return readPrefs()[key]; }
function setPref(key, value) {
  const prefs = readPrefs();
  if (value === undefined || value === null) delete prefs[key];
  else prefs[key] = value;
  writePrefs(prefs);
  return prefs[key];
}
function listPrefs() { return readPrefs(); }

// ── Reading list (Claude's "for later" queue) ───────────────────────────────
function readlistFile() { return path.join(profileDir(), 'readlist.json'); }
function readReadlist() { return _readJson(readlistFile(), []); }
function writeReadlist(arr) { _writeJson(readlistFile(), arr); }

function readlistAdd({ url, title, notes }) {
  if (!url) throw new Error('url required');
  const arr = readReadlist();
  // Dedup
  const norm = _normUrl(url);
  if (arr.some(r => _normUrl(r.url) === norm && !r.done)) {
    return { ok: true, alreadyExists: true };
  }
  const item = {
    id:    _id(),
    url,
    title: title || url,
    notes: notes || '',
    added: _now(),
    done:  false,
  };
  arr.unshift(item);
  writeReadlist(arr);
  return item;
}
function readlistList(opts = {}) {
  const arr = readReadlist();
  if (opts.includeDone) return arr;
  return arr.filter(r => !r.done);
}
function readlistDone({ id, url }) {
  const arr = readReadlist();
  const norm = url ? _normUrl(url) : null;
  let found = null;
  for (const r of arr) {
    if ((id && r.id === id) || (norm && _normUrl(r.url) === norm)) {
      r.done = true; r.completed = _now();
      found = r; break;
    }
  }
  writeReadlist(arr);
  return found || { error: 'Not found' };
}

// ── Aggregate summary — used in system prompt enrichment ────────────────────
function summary() {
  return {
    bookmarkCount: readBookmarks().length,
    folders:       bookmarkFolders(5),
    historyCount:  _readHistoryRaw(historyFile()).length,
    notesCount:    Object.keys(readNotes()).length,
    readlistOpen:  readReadlist().filter(r => !r.done).length,
  };
}

module.exports = {
  // Paths
  profileDir,

  // Bookmarks
  listBookmarks, addBookmark, removeBookmark, searchBookmarks,
  isBookmarked,  bookmarkFolders,

  // History
  recordVisit, historyRecent, searchHistory, clearHistory,

  // Notes
  getNote, setNote, searchNotes,

  // Prefs
  getPref, setPref, listPrefs,

  // Readlist
  readlistAdd, readlistList, readlistDone,

  // Aggregate
  summary,
};
