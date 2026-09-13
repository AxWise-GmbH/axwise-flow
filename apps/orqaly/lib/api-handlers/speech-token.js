/**
 * GET /api/speech-token
 * Returns a short-lived Azure Speech authorization token (valid ~10 min).
 * Keeps AZURE_SPEECH_KEY on the server — never exposed to the browser.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');

  try {
    const token = getBearerToken(req);
    const user = await verifySupabaseToken(token);
    if (!user) return jsonError(res, 401, 'Unauthorized. Sign in and retry.');

    const rlKey = `speech-token:${getRateLimitIdentifier(req)}`;
    const rl = checkRateLimit({ key: rlKey, limit: 10, windowMs: 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

    const speechKey = (process.env.AZURE_SPEECH_KEY || '').trim();
    const region = (process.env.AZURE_SPEECH_REGION || 'eastus').trim();
    if (!speechKey) {
      return jsonError(res, 503, 'Azure Speech not configured on server.');
    }

    // Exchange subscription key for a short-lived auth token
    const tokenRes = await fetch(
      `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      {
        method: 'POST',
        headers: { 'Ocp-Apim-Subscription-Key': speechKey, 'Content-Length': '0' },
      }
    );
    if (!tokenRes.ok) {
      return jsonError(res, 502, 'Failed to obtain speech token');
    }
    const authToken = await tokenRes.text();

    return res.status(200).json({ token: authToken, region });
  } catch (err) {
    return handleApiError(res, err, 'speech-token');
  }
}
