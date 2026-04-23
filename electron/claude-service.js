'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { safeStorage, app }  = require('electron');
const path = require('path');
const fs   = require('fs');

const CONFIG_PATH = path.join(app.getPath('userData'), 'claude-desktop-config.json');

// ── Config persistence ──────────────────────────────────────────────────────

function readConfig() {
  try   { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return {}; }
}

function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

// ── API key (encrypted with OS keychain via safeStorage) ────────────────────

function getApiKey() {
  const cfg = readConfig();
  if (!cfg.encryptedKey) return null;
  try {
    const buf = Buffer.from(cfg.encryptedKey, 'base64');
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf);
    }
    // Fallback (no OS keychain): plain base64
    return buf.toString('utf8');
  } catch { return null; }
}

function setApiKey(key) {
  const cfg = readConfig();
  if (safeStorage.isEncryptionAvailable()) {
    cfg.encryptedKey = safeStorage.encryptString(key).toString('base64');
  } else {
    // No OS keychain — store as plain base64 (less secure, but still local-only)
    cfg.encryptedKey = Buffer.from(key, 'utf8').toString('base64');
  }
  writeConfig(cfg);
}

function hasApiKey() {
  return !!getApiKey();
}

function clearApiKey() {
  const cfg = readConfig();
  delete cfg.encryptedKey;
  writeConfig(cfg);
}

// ── Model ID normalization ──────────────────────────────────────────────────

const MODEL_MAP = {
  'claude-opus-4-5':          'claude-opus-4-5',
  'claude-opus-4':            'claude-opus-4-5',
  'claude-sonnet-4-5':        'claude-sonnet-4-5',
  'claude-sonnet-4':          'claude-sonnet-4-5',
  'claude-haiku-3-5':         'claude-haiku-3-5-20241022',
  'claude-haiku-3.5':         'claude-haiku-3-5-20241022',
  'claude-3-5-sonnet':        'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku':         'claude-3-5-haiku-20241022',
};

function resolveModel(id) {
  if (!id) return 'claude-opus-4-5';
  return MODEL_MAP[id] || id;
}

// ── Streaming chat ──────────────────────────────────────────────────────────

/**
 * Stream a message to Claude and forward chunks to the renderer via IPC.
 * @param {Electron.IpcMainInvokeEvent} event
 * @param {Array<{role:'user'|'assistant', content:string}>} messages
 * @param {string} modelId
 * @param {string|null} systemPrompt
 */
async function streamMessage(event, messages, modelId, systemPrompt) {
  const key = getApiKey();
  if (!key) {
    const err = new Error('NO_API_KEY');
    err.code  = 'NO_API_KEY';
    throw err;
  }

  const client = new Anthropic({ apiKey: key });

  const params = {
    model:      resolveModel(modelId),
    max_tokens: 8192,
    messages,
    stream:     true,
  };
  if (systemPrompt) params.system = systemPrompt;

  const stream = await client.messages.create(params);

  let fullText = '';
  let inputTokens  = 0;
  let outputTokens = 0;

  for await (const chunk of stream) {
    switch (chunk.type) {
      case 'content_block_delta':
        if (chunk.delta.type === 'text_delta') {
          fullText += chunk.delta.text;
          event.sender.send('claude:chunk', chunk.delta.text);
        }
        break;
      case 'message_start':
        inputTokens = chunk.message?.usage?.input_tokens ?? 0;
        break;
      case 'message_delta':
        outputTokens = chunk.usage?.output_tokens ?? 0;
        break;
    }
  }

  event.sender.send('claude:done', { inputTokens, outputTokens });
  return { text: fullText, inputTokens, outputTokens };
}

module.exports = { getApiKey, setApiKey, hasApiKey, clearApiKey, streamMessage };
