/**
 * SMS verification client — Phase 7c
 *
 * Thin adapter over 5sim.net and sms-activate.org. The user selects which
 * provider in Tool Settings (tools.data.provider).
 *
 * API shapes based on public docs:
 *   5sim: https://docs.5sim.net/
 *   sms-activate: https://sms-activate.org/en/api2
 *
 * Contract is the same across both providers:
 *   rentNumber({ service, country }) → { activation_id, phone_number, valid_until }
 *   waitForSms(activation_id, { timeoutMs }) → { code, full_sms }
 *   releaseNumber(activation_id, { success })
 */
import { fetchWithRetry } from '../../api/_lib/fetch.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('sms-verify');
const DEFAULT_POLL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 180_000;   // 3 min
const HTTP_TIMEOUT_MS = 8_000;

// ── 5sim.net ─────────────────────────────────────────────────────────

const FIVESIM_BASE = 'https://5sim.net/v1';

async function fivesimRent({ apiKey, country = 'any', operator = 'any', service }) {
  const url = `${FIVESIM_BASE}/user/buy/activation/${country}/${operator}/${service}`;
  const res = await fetchWithRetry(
    url,
    { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } },
    { timeoutMs: HTTP_TIMEOUT_MS, retries: 0 },
  );
  const body = await res.json();
  if (!res.ok) throw new Error(`5sim rent failed: ${body?.message || res.status}`);
  return { activation_id: String(body.id), phone_number: body.phone, valid_until: body.expires };
}

async function fivesimCheck(apiKey, activationId) {
  const res = await fetchWithRetry(
    `${FIVESIM_BASE}/user/check/${activationId}`,
    { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } },
    { timeoutMs: HTTP_TIMEOUT_MS, retries: 0 },
  );
  const body = await res.json();
  const sms = (body?.sms || [])[0];
  if (!sms) return null;
  const code = (sms.code || '').trim();
  return { code, full_sms: sms.text || '' };
}

async function fivesimRelease(apiKey, activationId, success) {
  const path = success ? 'finish' : 'ban';
  try {
    await fetchWithRetry(
      `${FIVESIM_BASE}/user/${path}/${activationId}`,
      { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } },
      { timeoutMs: HTTP_TIMEOUT_MS, retries: 0 },
    );
  } catch { /* best effort */ }
}

// ── sms-activate.org ─────────────────────────────────────────────────

const SMSA_BASE = 'https://api.sms-activate.org/stubs/handler_api.php';

async function smsActivateRent({ apiKey, country = 0, service }) {
  const url = `${SMSA_BASE}?api_key=${apiKey}&action=getNumber&service=${service}&country=${country}`;
  const res = await fetchWithRetry(url, {}, { timeoutMs: HTTP_TIMEOUT_MS, retries: 0 });
  const txt = (await res.text()).trim();
  // Format: "ACCESS_NUMBER:<id>:<phone>" on success.
  if (!txt.startsWith('ACCESS_NUMBER')) throw new Error(`sms-activate rent failed: ${txt}`);
  const [, activationId, phone] = txt.split(':');
  return { activation_id: activationId, phone_number: phone, valid_until: null };
}

async function smsActivateCheck(apiKey, activationId) {
  const url = `${SMSA_BASE}?api_key=${apiKey}&action=getStatus&id=${activationId}`;
  const res = await fetchWithRetry(url, {}, { timeoutMs: HTTP_TIMEOUT_MS, retries: 0 });
  const txt = (await res.text()).trim();
  if (txt.startsWith('STATUS_OK')) {
    const code = txt.split(':')[1] || '';
    return { code, full_sms: code };
  }
  if (txt.startsWith('STATUS_WAIT')) return null;
  throw new Error(`sms-activate check failed: ${txt}`);
}

async function smsActivateRelease(apiKey, activationId, success) {
  // status codes: 6 = complete/success, 8 = cancel
  const status = success ? 6 : 8;
  try {
    await fetchWithRetry(
      `${SMSA_BASE}?api_key=${apiKey}&action=setStatus&status=${status}&id=${activationId}`,
      {},
      { timeoutMs: HTTP_TIMEOUT_MS, retries: 0 },
    );
  } catch { /* best effort */ }
}

// ── Unified surface ──────────────────────────────────────────────────

function pickAdapter(provider) {
  if (provider === 'sms-activate') return { rent: smsActivateRent, check: smsActivateCheck, release: smsActivateRelease };
  return { rent: fivesimRent, check: fivesimCheck, release: fivesimRelease };
}

export async function rentNumber({ apiKey, provider = '5sim', country, service = 'other' }) {
  const ad = pickAdapter(provider);
  return ad.rent({ apiKey, country, service });
}

export async function waitForSms(apiKey, activationId, { provider = '5sim', timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const ad = pickAdapter(provider);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await ad.check(apiKey, activationId).catch((err) => {
      log.warn(null, 'sms-verify.check-error', { error: err.message, activationId });
      return null;
    });
    if (result?.code) return result;
    await new Promise((r) => setTimeout(r, DEFAULT_POLL_MS));
  }
  throw new Error(`SMS timeout after ${Math.round(timeoutMs / 1000)}s`);
}

export async function releaseNumber(apiKey, activationId, { provider = '5sim', success = true } = {}) {
  const ad = pickAdapter(provider);
  return ad.release(apiKey, activationId, success);
}

export function detectsPhoneVerification(html) {
  if (!html) return false;
  if (/<input[^>]+(?:type=["']tel["']|name=["'][^"']*(?:phone|mobile|tel)[^"']*["'])/i.test(html)) return true;
  if (/enter.*(?:the\s+)?code|verify.*phone|sms.*sent|we.*sent.*code.*to/i.test(html)) return true;
  return false;
}
