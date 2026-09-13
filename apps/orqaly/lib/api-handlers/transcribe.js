/**
 * Deprecated stub: transcribe moved to Supabase Edge Function (consolidated under api/app).
 */
import { cors } from '../../api/_lib/cors.js';
import { jsonError } from '../../api/_lib/errors.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';

export default function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 10 req/min per IP — public endpoint, no auth required
  const rl = checkRateLimit({
    key: `transcribe:${getRateLimitIdentifier(req, '')}`,
    limit: 10,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    console.warn('[rate-limit] transcribe blocked', {
      id: getRateLimitIdentifier(req, ''),
      limit: rl.limit,
      resetAt: new Date(rl.resetAt).toISOString(),
    });
    return jsonError(res, 429, 'Too many requests. Please retry in a minute.');
  }

  if (req.method === 'GET') {
    const groqKey = !!process.env.GROQ_API_KEY;
    const assemblyAiKey = !!process.env.ASSEMBLYAI_API_KEY;
    const configured = groqKey || assemblyAiKey;
    const provider = groqKey ? 'groq-whisper' : assemblyAiKey ? 'assemblyai' : 'none';
    return res.status(200).json({
      configured,
      provider,
      host: 'vercel-stub',
      hint: 'Transcription has moved to Supabase Edge Functions. The frontend calls the Edge Function directly.',
    });
  }
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(
    /\/$/,
    ''
  );
  const newUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/transcribe` : null;
  return res.status(301).json({
    message: 'POST /api/transcribe has moved to a Supabase Edge Function.',
    newUrl,
    hint: 'The frontend has been updated to call the Edge Function directly.',
  });
}
