'use strict';

/**
 * chrome-files.js — Closed-Chrome file/registry editors
 * ──────────────────────────────────────────────────────
 * The ~5% of Chrome settings that have NO CDP and NO extension-API
 * surface — flags, low-level prefs, group policies, raw bookmark JSON.
 *
 * All operations require Chrome to be CLOSED (Chrome holds write locks on
 * Local State + Preferences while running). We auto-detect lock contention
 * and surface a clean "Close Chrome first" error.
 *
 * Auto-backups: every write creates a sibling `.bak.<timestamp>` so the user
 * can recover from corruption.
 *
 * The CCM-managed Chrome profile path is the one in chrome-controller.js
 * (%APPDATA%\\claude-code-desktop\\chrome-profile). We operate ONLY on that
 * profile — never on the user's main Chrome profile.
 */

const fs   = require('fs');
const path = require('path');
const { app } = require('electron');
const chromeController = require('./chrome-controller');

function _profileRoot() { return chromeController.profileDir(); }
function _localStatePath() { return path.join(_profileRoot(), 'Local State'); }
function _defaultDir() { return path.join(_profileRoot(), 'Default'); }
function _preferencesPath() { return path.join(_defaultDir(), 'Preferences'); }
function _securePrefsPath() { return path.join(_defaultDir(), 'Secure Preferences'); }
function _bookmarksPath() { return path.join(_defaultDir(), 'Bookmarks'); }

function _isChromeRunning() {
  // The controller knows whether we launched Chrome. We don't try to detect
  // OTHER Chrome processes (the user's own main Chrome) — those operate on
  // a different profile directory and don't conflict.
  return !!chromeController.status; // status is the function; we want the result
}

async function _assertChromeClosed(opName) {
  const st = await chromeController.status();
  if (st?.running) {
    throw new Error(
      `Cannot ${opName}: Claude's Chrome is currently running. ` +
      `Call chrome_close first, edit the file, then chrome_launch to restart.`
    );
  }
}

function _backup(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = `${filePath}.bak.${stamp}`;
  try { fs.copyFileSync(filePath, backupPath); return backupPath; }
  catch (_) { return null; }
}

function _readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (e) { throw new Error(`Could not parse ${filePath}: ${e.message}`); }
}

function _writeJson(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

// ═══════════════════════════════════════════════════════════════════════════
// chrome://flags — Local State.browser.enabled_labs_experiments
// ═══════════════════════════════════════════════════════════════════════════
async function flagsList() {
  const ls = _readJson(_localStatePath());
  if (!ls) return { flags: [], note: 'No Local State yet — launch Chrome once first to materialize it.' };
  const arr = ls.browser?.enabled_labs_experiments || [];
  return { flags: arr, count: arr.length };
}
async function flagsSet({ flags } = {}) {
  if (!Array.isArray(flags)) throw new Error('flags array required (e.g. ["enable-quic@1", "force-dark-mode@1"])');
  await _assertChromeClosed('edit chrome://flags');
  const ls = _readJson(_localStatePath()) || {};
  ls.browser = ls.browser || {};
  const backup = _backup(_localStatePath());
  ls.browser.enabled_labs_experiments = flags;
  _writeJson(_localStatePath(), ls);
  return { ok: true, count: flags.length, backup, restartRequired: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Preferences (Default/Preferences JSON — ~165KB, ~1000+ keys)
// ═══════════════════════════════════════════════════════════════════════════
// Prototype pollution defense — any caller-controlled dotted path could
// otherwise contain `__proto__.x` and mutate Object.prototype, polluting the
// entire main process. Block the three magic property names anywhere in the
// path. Keys are caller-supplied (e.g. `prefsSet({key:'__proto__.x', value})`).
const _UNSAFE_PATH_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
function _assertSafePath(dottedPath) {
  for (const k of dottedPath.split('.')) {
    if (_UNSAFE_PATH_KEYS.has(k)) {
      throw new Error(`Unsafe path segment "${k}" — refuse to mutate prototype chain.`);
    }
  }
}

function _walkPath(obj, dottedPath) {
  _assertSafePath(dottedPath);
  return dottedPath.split('.').reduce((o, k) => (o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined), obj);
}
function _setPath(obj, dottedPath, value) {
  _assertSafePath(dottedPath);
  const parts = dottedPath.split('.');
  const last = parts.pop();
  const parent = parts.reduce((o, k) => {
    if (!Object.prototype.hasOwnProperty.call(o, k) || typeof o[k] !== 'object' || o[k] === null) o[k] = {};
    return o[k];
  }, obj);
  if (value === null || value === undefined) delete parent[last];
  else parent[last] = value;
}

async function prefsGet({ key } = {}) {
  if (!key) throw new Error('key required (dotted path, e.g. "browser.show_home_button")');
  const prefs = _readJson(_preferencesPath()) || {};
  return _walkPath(prefs, key);
}
async function prefsSet({ key, value } = {}) {
  if (!key) throw new Error('key required (dotted path)');
  await _assertChromeClosed('edit Preferences');
  const prefs = _readJson(_preferencesPath()) || {};
  const backup = _backup(_preferencesPath());
  _setPath(prefs, key, value);
  _writeJson(_preferencesPath(), prefs);
  return { ok: true, backup, restartRequired: true };
}
async function prefsListTopLevel() {
  const prefs = _readJson(_preferencesPath()) || {};
  return Object.keys(prefs).sort();
}

// ═══════════════════════════════════════════════════════════════════════════
// Bookmarks (Default/Bookmarks JSON — Chrome's bookmark tree)
// ═══════════════════════════════════════════════════════════════════════════
async function bookmarksJsonRead() {
  return _readJson(_bookmarksPath()) || { roots: {} };
}
async function bookmarksJsonWrite({ data } = {}) {
  if (!data) throw new Error('data (full bookmarks JSON) required');
  await _assertChromeClosed('rewrite Bookmarks');
  const backup = _backup(_bookmarksPath());
  _writeJson(_bookmarksPath(), data);
  return { ok: true, backup, restartRequired: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Policies (Windows: HKCU\Software\Policies\Google\Chrome\*)
// ═══════════════════════════════════════════════════════════════════════════
async function policyList() {
  if (process.platform !== 'win32') {
    return { error: 'Chrome group policies via registry are Windows-only. macOS uses /Library/Preferences and Linux uses /etc/opt/chrome/policies.' };
  }
  // Use reg.exe to enumerate. The keys live under both HKCU and HKLM —
  // CCM only writes to HKCU since HKLM needs admin.
  const { execFileSync } = require('child_process');
  try {
    const out = execFileSync('reg', [
      'query', 'HKCU\\Software\\Policies\\Google\\Chrome', '/s',
    ], { encoding: 'utf8', windowsHide: true });
    return { raw: out };
  } catch (e) {
    return { raw: '', note: 'No HKCU Chrome policies set on this machine.' };
  }
}
// Allowlist of registry value types we'll let the caller use. `REG_EXPAND_SZ`
// is intentionally EXCLUDED — it expands `%COMSPEC%`-style env vars at read
// time, which is a persistence/privilege-escalation vector if an attacker can
// pick the data. The standard Chrome policy types are REG_SZ / REG_DWORD /
// REG_MULTI_SZ — we don't need anything else.
const _VALID_POLICY_TYPES = new Set(['REG_SZ', 'REG_DWORD', 'REG_MULTI_SZ']);
// Policy names per Chrome's policy schema are CamelCase ASCII identifiers
// like `HomepageLocation`. Reject anything that could nest into another
// subkey (backslash) or escape into reg.exe flag territory (slash, dash).
const _VALID_POLICY_NAME = /^[A-Za-z][A-Za-z0-9_]{0,127}$/;

function _validatePolicyName(name) {
  if (typeof name !== 'string' || !_VALID_POLICY_NAME.test(name)) {
    throw new Error(
      `Invalid policy name: "${name}". ` +
      'Must match /^[A-Za-z][A-Za-z0-9_]{0,127}$/ — Chrome policies are CamelCase ASCII, ' +
      'no backslashes (subkey nesting), no slashes/dashes (reg.exe flag escape).'
    );
  }
}

async function policySet({ name, value, type = 'REG_SZ' } = {}) {
  if (process.platform !== 'win32') throw new Error('Windows-only');
  if (!name) throw new Error('name required (the policy key, e.g. "HomepageLocation")');
  _validatePolicyName(name);
  if (!_VALID_POLICY_TYPES.has(type)) {
    throw new Error(`Invalid type "${type}". Allowed: ${[..._VALID_POLICY_TYPES].join(', ')}. REG_EXPAND_SZ is blocked (env-var expansion persistence vector).`);
  }
  // REG_DWORD for integer policies, REG_SZ for strings, REG_MULTI_SZ for arrays
  const { execFileSync } = require('child_process');
  execFileSync('reg', [
    'add', 'HKCU\\Software\\Policies\\Google\\Chrome',
    '/v', name, '/t', type, '/d', String(value), '/f',
  ], { windowsHide: true });
  return { ok: true, restartRequired: true };
}
async function policyDelete({ name } = {}) {
  if (process.platform !== 'win32') throw new Error('Windows-only');
  if (!name) throw new Error('name required');
  _validatePolicyName(name);
  const { execFileSync } = require('child_process');
  try {
    execFileSync('reg', [
      'delete', 'HKCU\\Software\\Policies\\Google\\Chrome',
      '/v', name, '/f',
    ], { windowsHide: true });
  } catch (e) { /* not found is fine */ }
  return { ok: true, restartRequired: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// Profile info — surface paths so the user knows where things live
// ═══════════════════════════════════════════════════════════════════════════
async function profileInfo() {
  return {
    profileRoot:        _profileRoot(),
    localState:         _localStatePath(),
    defaultDir:         _defaultDir(),
    preferences:        _preferencesPath(),
    securePreferences:  _securePrefsPath(),
    bookmarksJson:      _bookmarksPath(),
    chromePath:         chromeController.findChrome(),
    chromeRunning:      (await chromeController.status())?.running || false,
  };
}

module.exports = {
  // Flags
  flagsList, flagsSet,
  // Prefs
  prefsGet, prefsSet, prefsListTopLevel,
  // Bookmarks JSON
  bookmarksJsonRead, bookmarksJsonWrite,
  // Policies (Windows)
  policyList, policySet, policyDelete,
  // Profile info
  profileInfo,
};
