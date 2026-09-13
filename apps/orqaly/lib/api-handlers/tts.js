/**
 * POST /api/app?path=tts
 * ElevenLabs Text-to-Speech proxy — keeps API key server-side.
 *
 * Body: { text: string, voiceId?: string }
 * Response: audio/mpeg binary stream
 *
 * Falls back with 501 if ELEVENLABS_API_KEY is not configured,
 * letting the frontend gracefully degrade to browser TTS.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  applyRateLimitHeaders,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { recordLlmUsage } from '../goal-handlers/_helpers.js';

const log = createLogger('tts');

// ElevenLabs Turbo v2.5 is billed per character (~$0.50 / 1M chars on paid
// tiers, 1 char ≈ 1 credit). TTS has ~0 LLM tokens, so recordLlmUsage would
// skip the row unless we pass a positive estimatedCostUsd — compute it from
// the character count here.
const ELEVENLABS_USD_PER_CHAR = 0.5 / 1_000_000;

const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel — warm, natural
const MAX_TEXT_LENGTH = 2000;

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'POST only');

  const done = log.startTimer(req, 'request', { method: req.method });

  try {
    // Auth
    const token = getBearerToken(req);
    const user = await verifySupabaseToken(token);
    if (!user) {
      done({ status: 401 });
      return jsonError(res, 401, 'Unauthorized. Sign in and retry.');
    }

    // Rate limit: 20 req/min per user
    const rlKey = `tts:${getRateLimitIdentifier(req, user.id)}`;
    const rl = checkRateLimit({ key: rlKey, limit: 20, windowMs: 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) {
      done({ status: 429 });
      return jsonError(res, 429, 'Too many requests');
    }

    // Validate
    const { text, voiceId } = req.body || {};
    if (!text || typeof text !== 'string' || !text.trim()) {
      done({ status: 400 });
      return jsonError(res, 400, 'text is required');
    }
    if (text.length > MAX_TEXT_LENGTH) {
      done({ status: 400 });
      return jsonError(res, 400, `text exceeds ${MAX_TEXT_LENGTH} characters`);
    }

    // Check API key
    const apiKey = (process.env.ELEVENLABS_API_KEY || '').trim();
    if (!apiKey) {
      done({ status: 501 });
      return jsonError(res, 501, 'ElevenLabs not configured');
    }

    const voice = voiceId || DEFAULT_VOICE_ID;
    const cleanText = text.trim();
    const charCount = cleanText.length;

    // Best-effort usage recording. The TTS handler never created an admin
    // client before; build one lazily so a missing service-role key simply
    // disables recording instead of breaking the response.
    const admin = buildSupabaseAdminClient();
    const ttsStartedAt = Date.now();
    const ttsModel = 'eleven_turbo_v2_5';

    // Call ElevenLabs TTS streaming API
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: ttsModel,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!ttsRes.ok) {
      const errBody = await ttsRes.text().catch(() => '');
      log.error(req, 'elevenlabs.failed', { status: ttsRes.status, body: errBody });
      // Best-effort usage recording on failure — wrapped so it never breaks
      // the error response. Errors are recorded even with 0 tokens/cost.
      if (admin) {
        try {
          await recordLlmUsage(admin, {
            userId: user.id,
            source: 'tts',
            operation: 'text-to-speech',
            provider: 'elevenlabs',
            model: ttsModel,
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            estimatedCostUsd: 0,
            durationMs: Date.now() - ttsStartedAt,
            status: 'error',
            errorType: `elevenlabs_${ttsRes.status}`,
          });
        } catch (recErr) {
          log.error(req, 'tts.usage.record.failed', recErr);
        }
      }
      done({ status: 502 });
      return jsonError(res, 502, 'ElevenLabs TTS failed');
    }

    // Stream audio back to client
    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
    });

    const reader = ttsRes.body.getReader();
    let totalBytes = 0;
    while (true) {
      const { done: readerDone, value } = await reader.read();
      if (readerDone) break;
      res.write(value);
      totalBytes += value.length;
    }
    res.end();

    // Best-effort usage recording on success. TTS has ~0 LLM tokens, so we
    // must supply a positive estimatedCostUsd (from character count) or the
    // writer would skip the row. Wrapped in try/catch — never breaks response.
    if (admin) {
      try {
        await recordLlmUsage(admin, {
          userId: user.id,
          source: 'tts',
          operation: 'text-to-speech',
          provider: 'elevenlabs',
          model: ttsModel,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: charCount * ELEVENLABS_USD_PER_CHAR,
          durationMs: Date.now() - ttsStartedAt,
          status: 'ok',
        });
      } catch (recErr) {
        log.error(req, 'tts.usage.record.failed', recErr);
      }
    }

    done({ status: 200, bytes: totalBytes, voice });
  } catch (err) {
    log.error(req, 'tts.failed', err);
    done({ status: 500 });
    if (!res.headersSent) {
      return handleApiError(res, err, 'tts');
    }
    res.end();
  }
}
