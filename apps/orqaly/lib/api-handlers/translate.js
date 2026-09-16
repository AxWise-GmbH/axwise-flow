/**
 * POST /api/translate
 * Proxies translation requests to LibreTranslate, keeping the API key server-side.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'Method not allowed');

  try {
    const token = getBearerToken(req);
    const user = await verifySupabaseToken(token);
    if (!user) return jsonError(res, 401, 'Unauthorized. Sign in and retry.');

    const rlKey = `translate:${getRateLimitIdentifier(req)}`;
    const rl = checkRateLimit({ key: rlKey, limit: 30, windowMs: 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

    const libreUrl = (process.env.LIBRE_TRANSLATE_URL || 'https://libretranslate.com').replace(/\/$/, '');
    const apiKey = (process.env.LIBRE_TRANSLATE_API_KEY || '').trim();

    const { q, source, target, format } = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (!q || !target) return jsonError(res, 400, 'Missing q or target');

    const body = { q, source: source || 'auto', target, format: format || 'text' };
    if (apiKey) body.api_key = apiKey;

    const upstream = await fetch(`${libreUrl}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return jsonError(res, upstream.status || 502, data.error || 'Translation failed');
    }

    return res.status(200).json(data);
  } catch (err) {
    return handleApiError(res, err, 'translate');
  }
}
