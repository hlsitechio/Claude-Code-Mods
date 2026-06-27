'use strict';

/**
 * media.js — cross-LLM media generation engine (Phase 27).
 * ────────────────────────────────────────────────────────────────────────
 * Lets Claude (in CCM) create media with OTHER models:
 *   - Imagen (image)  + Veo (video)  via Google's @google/genai SDK + a Gemini key
 *   - ChatGPT / custom GPTs (text + DALL·E) via the headless gpt_cli subprocess
 *
 * Pure-ish: no Electron deps. The caller (main.js) supplies the Gemini apiKey
 * (decrypted from gemini_desktop's safeStorage blob), the output dir, and a
 * monotonic stamp. Veo is split into start/poll/download because a generation
 * takes minutes — far longer than one MCP round-trip — so main.js keeps the
 * operation in a job registry and the model polls veo_status.
 */

const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// @google/genai is ESM-only; CCM main is CommonJS. Hide the import from any
// bundler so it resolves from node_modules at runtime (same trick gemini_desktop
// uses in apiKeyServer.ts).
const _importEsm = new Function('m', 'return import(m)');
let _genaiP;
function _loadGenAI() { _genaiP ??= _importEsm('@google/genai'); return _genaiP; }
async function _ai(apiKey) {
  const { GoogleGenAI } = await _loadGenAI();
  return new GoogleGenAI({ apiKey });
}

const DEFAULT_IMAGE_MODEL = 'imagen-4.0-generate-001';
const DEFAULT_VIDEO_MODEL = 'veo-3.0-fast-generate-preview';

// ── Imagen ──────────────────────────────────────────────────────────────────
async function generateImages({ apiKey, prompt, model, count, aspectRatio, outDir, stamp }) {
  if (!apiKey) return { ok: false, error: 'no Gemini API key available' };
  if (!prompt || typeof prompt !== 'string') return { ok: false, error: 'prompt required' };
  const ai = await _ai(apiKey);
  const usedModel = model || DEFAULT_IMAGE_MODEL;
  let res;
  try {
    res = await ai.models.generateImages({
      model: usedModel,
      prompt,
      config: {
        numberOfImages: Math.min(Math.max(parseInt(count, 10) || 1, 1), 4),
        aspectRatio: aspectRatio || '1:1',
      },
    });
  } catch (e) { return { ok: false, error: _genErr(e) }; }
  const imgs = res?.generatedImages || [];
  if (!imgs.length) return { ok: false, error: 'model returned no images (prompt may have been blocked by safety filters)' };
  fs.mkdirSync(outDir, { recursive: true });
  const images = [];
  for (let i = 0; i < imgs.length; i++) {
    const b64 = imgs[i]?.image?.imageBytes;
    if (!b64) continue;
    const file = path.join(outDir, `imagen_${stamp}_${i}.png`);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    images.push(file);
  }
  return { ok: true, model: usedModel, prompt, images };
}

// ── Veo (start → poll → download) ─────────────────────────────────────────────
async function startVideo({ apiKey, prompt, model, aspectRatio, negativePrompt }) {
  if (!apiKey) return { ok: false, error: 'no Gemini API key available' };
  if (!prompt || typeof prompt !== 'string') return { ok: false, error: 'prompt required' };
  const ai = await _ai(apiKey);
  const usedModel = model || DEFAULT_VIDEO_MODEL;
  try {
    const op = await ai.models.generateVideos({
      model: usedModel,
      prompt,
      config: {
        aspectRatio: aspectRatio || '16:9',
        numberOfVideos: 1,
        ...(negativePrompt ? { negativePrompt } : {}),
      },
    });
    return { ok: true, op, model: usedModel };
  } catch (e) { return { ok: false, error: _genErr(e) }; }
}

async function pollVideo({ apiKey, op }) {
  const ai = await _ai(apiKey);
  try {
    const fresh = await ai.operations.getVideosOperation({ operation: op });
    return { ok: true, op: fresh, done: !!fresh?.done };
  } catch (e) { return { ok: false, error: _genErr(e) }; }
}

async function downloadVideos({ apiKey, op, outDir, stamp }) {
  const ai = await _ai(apiKey);
  const vids = op?.response?.generatedVideos || [];
  if (!vids.length) return { ok: false, error: 'operation done but produced no video (often a safety block)' };
  fs.mkdirSync(outDir, { recursive: true });
  const videos = [];
  for (let i = 0; i < vids.length; i++) {
    const v = vids[i]?.video;
    if (!v) continue;
    const file = path.join(outDir, `veo_${stamp}_${i}.mp4`);
    try {
      await ai.files.download({ file: v, downloadPath: file });
      videos.push(file);
    } catch (e) { return { ok: false, error: 'download failed: ' + _genErr(e) }; }
  }
  return { ok: true, videos };
}

// ── ChatGPT / custom GPT via the headless gpt_cli subprocess ─────────────────
function askGpt({ prompt, gptId, newConvo, cliPath, timeoutMs }) {
  return new Promise((resolve) => {
    if (!prompt || typeof prompt !== 'string') return resolve({ ok: false, error: 'prompt required' });
    const script = cliPath || process.env.CCM_GPT_CLI || 'G:\\gpt_cli\\gpt-node.mjs';
    if (!fs.existsSync(script)) return resolve({ ok: false, error: `gpt_cli not found at ${script} (set CCM_GPT_CLI)` });
    const args = [script];
    if (newConvo) args.push('--new');
    if (gptId) args.push('--gpt', String(gptId));
    args.push(prompt);

    let out = '', err = '', done = false;
    const child = spawn('node', args, { cwd: path.dirname(script), windowsHide: true });
    const timer = setTimeout(() => {
      if (!done) { done = true; try { child.kill(); } catch (_) {} resolve({ ok: false, error: 'gpt_cli timed out' }); }
    }, timeoutMs || 180000);
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });
    child.on('error', e => { if (!done) { done = true; clearTimeout(timer); resolve({ ok: false, error: 'spawn failed: ' + e.message }); } });
    child.on('close', code => {
      if (done) return;
      done = true; clearTimeout(timer);
      if (code !== 0 && !out) return resolve({ ok: false, error: (err || 'gpt_cli exited ' + code).slice(0, 800) });
      const parsed = _parseGptOut(out);
      resolve({ ok: true, ...parsed });
    });
  });
}

// Parse gpt_cli one-shot stdout: strip ANSI, pull the answer (after "gpt ›",
// before the stats "──" block) and any "image saved › <path>" lines.
function _parseGptOut(raw) {
  const clean = String(raw).replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  const images = [];
  const imgRe = /image saved\s*[›>]\s*(.+\.(?:png|jpg|jpeg|webp))\s*$/gim;
  let m; while ((m = imgRe.exec(clean))) images.push(m[1].trim());
  let text = clean;
  const gi = clean.indexOf('gpt ›');
  if (gi >= 0) text = clean.slice(gi + 'gpt ›'.length);
  text = text.replace(/\n\s*──[\s\S]*$/, '');                       // drop the stats block
  text = text.split('\n')
    .filter(l => !/^\s*(downloading image|image saved)\b/i.test(l)) // drop image-noise lines
    .join('\n')
    .trim();
  return { text, images };
}

function _genErr(e) {
  const msg = String(e?.message || e || 'unknown error');
  // Surface the common, actionable cases plainly.
  if (/API key not valid|API_KEY_INVALID|invalid.*key/i.test(msg)) return 'Gemini API key invalid or disabled.';
  if (/permission|PERMISSION_DENIED|not.*allowlist|access/i.test(msg)) return 'Key lacks access to this model (Veo/Imagen often need billing or allowlisting): ' + msg.slice(0, 240);
  if (/quota|RESOURCE_EXHAUSTED|429/i.test(msg)) return 'Quota/rate limit hit: ' + msg.slice(0, 240);
  if (/billing/i.test(msg)) return 'Billing not enabled on the Gemini key (required for Imagen/Veo): ' + msg.slice(0, 240);
  return msg.slice(0, 400);
}

module.exports = {
  generateImages, startVideo, pollVideo, downloadVideos, askGpt,
  _parseGptOut, DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL,
};
