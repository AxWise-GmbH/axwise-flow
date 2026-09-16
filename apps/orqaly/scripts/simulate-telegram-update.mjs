#!/usr/bin/env node
/**
 * simulate-telegram-update.mjs
 *
 * POST a fake Telegram update at your local API to exercise the bot pipeline
 * end-to-end (webhook-receiver → agent_jobs → communicator-process → bridge
 * → outbound sendMessage). No ngrok, no real Telegram — pure offline.
 *
 * Usage:
 *   node scripts/simulate-telegram-update.mjs                                   # default: "create a goal: local test, budget 5"
 *   node scripts/simulate-telegram-update.mjs --text "list my goals"
 *   node scripts/simulate-telegram-update.mjs --text "/help"
 *   node scripts/simulate-telegram-update.mjs --text "/start ABC123"            # also triggers link
 *   node scripts/simulate-telegram-update.mjs --from-id 12345 --chat-id 12345
 *   node scripts/simulate-telegram-update.mjs --callback "confirm:approve:UUID"
 *
 * Reads from .env.local:
 *   LOCAL_API_PORT             (default 3001)
 *   TELEGRAM_SHARED_SECRET_TOKEN
 *
 * Outbound sendMessage WILL hit the real Telegram API if you have a valid
 * TELEGRAM_SHARED_BOT_TOKEN — Telegram will deliver the reply to whatever
 * --chat-id you used. To test purely silently (no real Telegram traffic),
 * either set a fake bot token OR don't run this against a chat_id that
 * belongs to a real Telegram user.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Load .env.local (no dotenv dependency) ──────────────────────────────────
const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = resolve(HERE, '..', '.env.local');
try {
  const raw = readFileSync(ENV_PATH, 'utf8');
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (k && !(k in process.env)) process.env[k] = v;
  }
} catch (err) {
  console.warn(`[sim] could not read ${ENV_PATH}: ${err.message}`);
}

// ── Args ────────────────────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));
const PORT = process.env.LOCAL_API_PORT || '3001';
const URL = `http://localhost:${PORT}/api/communicator/webhook/telegram`;
const SECRET = process.env.TELEGRAM_SHARED_SECRET_TOKEN || '';

const text = args.text ?? 'create a goal: local sim test, budget 5';
const fromId = Number(args['from-id'] ?? 99999001);
const chatId = Number(args['chat-id'] ?? fromId);
const username = args.username ?? 'sim_user';
const firstName = args['first-name'] ?? 'Sim';
const callbackData = args.callback;

// ── Build the update payload ────────────────────────────────────────────────
const update = {
  update_id: Math.floor(Math.random() * 2 ** 31),
};

if (callbackData) {
  update.callback_query = {
    id: String(Math.floor(Math.random() * 1e12)),
    from: { id: fromId, is_bot: false, first_name: firstName, username },
    message: {
      message_id: Math.floor(Math.random() * 100000),
      chat: { id: chatId, type: 'private' },
      date: Math.floor(Date.now() / 1000),
      text: '(previous bot message)',
    },
    chat_instance: String(Math.floor(Math.random() * 1e18)),
    data: callbackData,
  };
} else {
  update.message = {
    message_id: Math.floor(Math.random() * 100000),
    from: { id: fromId, is_bot: false, first_name: firstName, username, language_code: 'en' },
    chat: { id: chatId, type: 'private', first_name: firstName, username },
    date: Math.floor(Date.now() / 1000),
    text,
  };
}

// ── POST ────────────────────────────────────────────────────────────────────
const headers = { 'Content-Type': 'application/json' };
if (SECRET) headers['X-Telegram-Bot-Api-Secret-Token'] = SECRET;

console.log(`[sim] POST ${URL}`);
console.log(`[sim] update_id=${update.update_id}  from=${fromId}  chat=${chatId}`);
console.log(`[sim] ${callbackData ? `callback=${callbackData}` : `text=${JSON.stringify(text)}`}`);
if (!SECRET) {
  console.log('[sim] WARNING: TELEGRAM_SHARED_SECRET_TOKEN not set — server may 401 (or skip the check for shared-bot paths).');
}

try {
  const res = await fetch(URL, { method: 'POST', headers, body: JSON.stringify(update) });
  const body = await res.text();
  console.log(`[sim] → HTTP ${res.status}`);
  console.log(`[sim] response: ${body}`);
  if (!res.ok) process.exit(1);

  if (!callbackData) {
    console.log('');
    console.log('[sim] ✓ Webhook accepted. The actual LLM call runs in the worker loop');
    console.log('[sim]   started by `npm run dev:local`. Watch its console for the');
    console.log('[sim]   "process-next" output and check agent_jobs in Supabase.');
  }
} catch (err) {
  console.error('[sim] POST failed:', err.message);
  console.error('[sim] Is `npm run dev:local` running?');
  process.exit(1);
}

// ── Tiny arg parser (no deps) ───────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next == null || next.startsWith('--')) { out[key] = true; }
    else { out[key] = next; i++; }
  }
  return out;
}
