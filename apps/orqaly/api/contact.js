/**
 * Public contact form endpoint — no auth required.
 * Stub implementation: validates payload, rate-limits by IP, logs the message.
 * Future: forward to email (Resend/Mailgun) or a Supabase `contact_messages` table.
 */
import { jsonError, handleApiError } from './_lib/errors.js';
import { applySecurityHeaders } from './_lib/security-headers.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from './_lib/rate-limit.js';

const REASONS = new Set(['sales', 'support', 'press']);

function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  applySecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  const rl = checkRateLimit({ key: getRateLimitIdentifier(req, null), limit: 5, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Too many submissions — try again in a minute.');

  try {
    const body = await readBody(req);
    const name = String(body.name || '').trim().slice(0, 200);
    const email = String(body.email || '').trim().slice(0, 320);
    const reason = String(body.reason || '').trim();
    const message = String(body.message || '').trim().slice(0, 4000);

    if (!name || !email || !message) return jsonError(res, 400, 'Name, email and message are required.');
    if (!REASONS.has(reason)) return jsonError(res, 400, 'Unknown reason.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonError(res, 400, 'Invalid email.');

    // eslint-disable-next-line no-console
    console.info('[contact] new message', { reason, name, email });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return handleApiError(res, err, 'contact');
  }
}
