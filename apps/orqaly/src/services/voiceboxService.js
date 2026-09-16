/**
 * Voicebox service - browser-direct client for a locally-running Voicebox
 * desktop app (https://voicebox.sh), exposing an unauthenticated REST API at
 * http://127.0.0.1:17493. Voicebox only listens on loopback, so these calls go
 * straight from the browser (the Vercel backend can't reach the user's machine).
 *
 * Speech-in  → POST /transcribe (Whisper; multipart, field name `file`)
 * Voice-out  → POST /speak      (async; the desktop app plays audio on the host
 *              speakers and returns a generation id we can watch / cancel)
 * Liveness   → GET  /health
 * Voices     → GET  /profiles
 *
 * CORS: Voicebox ships a strict allow-list (default origins are ports 5173 /
 * 17493 only). The user must launch it with VOICEBOX_CORS_ORIGINS including this
 * site's origin, otherwise every call fails the CORS preflight and surfaces as
 * an opaque `TypeError: Failed to fetch` - indistinguishable from "not running".
 * We treat any failure as "unavailable" and let callers fall back.
 *
 * The API shape here is verified against the Voicebox FastAPI source
 * (voicebox-main/backend), not the README (whose curl examples are partly wrong:
 * the transcribe field is `file` not `audio`, and the whisper model value is
 * `turbo` not `whisper-turbo`).
 */

export const DEFAULT_BASE_URL = 'http://127.0.0.1:17493';
export const DEFAULT_CLIENT_ID = 'orchestratori';
const DEFAULT_MODEL = 'turbo'; // base | small | medium | large | turbo
const AVAIL_TTL_MS = 10_000; // cache liveness probes briefly to avoid spamming
const SPEAK_WATCH_TIMEOUT_MS = 180_000; // safety cap so the indicator never hangs

/** Thrown when Voicebox accepts the audio but the Whisper model is still
 *  downloading (HTTP 202). Callers should ask the user to retry shortly. */
export class ModelDownloadingError extends Error {
  constructor(message = 'Voicebox is downloading its voice model. Try again in a moment.') {
    super(message);
    this.name = 'ModelDownloadingError';
  }
}

// In-flight /speak generation, so stop() can cancel host playback without the
// caller having to thread the id through.
let _active = null; // { id, baseUrl }

// baseUrl -> { ts, ok } liveness cache.
const _availCache = new Map();

function normBase(baseUrl) {
  return String(baseUrl || DEFAULT_BASE_URL)
    .trim()
    .replace(/\/+$/, '');
}

function joinUrl(baseUrl, path) {
  return `${normBase(baseUrl)}${path}`;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: options.signal || controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Probe whether Voicebox is reachable at baseUrl. Never throws - any network /
 * CORS / timeout failure resolves to `{ ok: false }`. Cached ~10s per baseUrl.
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function isAvailable({ baseUrl = DEFAULT_BASE_URL, timeoutMs = 1500 } = {}) {
  const key = normBase(baseUrl);
  const cached = _availCache.get(key);
  if (cached && Date.now() - cached.ts < AVAIL_TTL_MS) {
    return { ok: cached.ok, reason: cached.reason };
  }
  let result;
  try {
    const res = await fetchWithTimeout(joinUrl(baseUrl, '/health'), { method: 'GET' }, timeoutMs);
    result = res.ok ? { ok: true } : { ok: false, reason: `http_${res.status}` };
  } catch {
    // CORS / mixed-content / connection refused / timeout all land here.
    result = { ok: false, reason: 'unreachable' };
  }
  _availCache.set(key, { ts: Date.now(), ...result });
  return result;
}

/** Clear the liveness cache (e.g. after the user edits the base URL). */
export function clearAvailabilityCache() {
  _availCache.clear();
}

/**
 * List the user's Voicebox voice profiles (for the picker). Throws on failure.
 * @returns {Promise<Array<{ id: string, name: string, language?: string }>>}
 */
export async function listProfiles({ baseUrl = DEFAULT_BASE_URL } = {}) {
  const res = await fetchWithTimeout(joinUrl(baseUrl, '/profiles'), { method: 'GET' }, 4000);
  if (!res.ok) throw new Error(`Voicebox /profiles failed (HTTP ${res.status})`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Transcribe an audio blob via Voicebox Whisper. Multipart field is `file`.
 * @param {Blob} blob recorded audio
 * @returns {Promise<string>} the transcript text
 * @throws {ModelDownloadingError} on HTTP 202 (model still downloading)
 */
export async function transcribe(
  blob,
  { baseUrl = DEFAULT_BASE_URL, model = DEFAULT_MODEL, language } = {}
) {
  const form = new FormData();
  form.append('file', blob, 'recording.webm');
  if (model) form.append('model', model);
  if (language) form.append('language', language);

  const res = await fetchWithTimeout(
    joinUrl(baseUrl, '/transcribe'),
    { method: 'POST', body: form },
    60_000
  );
  if (res.status === 202) throw new ModelDownloadingError();
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `Voicebox transcription failed (HTTP ${res.status})${detail ? `: ${detail}` : ''}`
    );
  }
  const data = await res.json();
  return String(data?.text || '').trim();
}

/**
 * Speak text through a cloned/preset voice. Asynchronous: Voicebox plays the
 * audio on the host's speakers and returns a generation id. If a named profile
 * is rejected (400/404) we retry once without it (default profile).
 * @returns {Promise<{ id: string, status: string }>}
 */
export async function speak(
  text,
  {
    baseUrl = DEFAULT_BASE_URL,
    profile,
    clientId = DEFAULT_CLIENT_ID,
    personality,
    engine,
    language,
  } = {}
) {
  const body = { text: String(text || '').slice(0, 10_000) };
  if (profile) body.profile = profile;
  if (personality != null) body.personality = personality;
  if (engine) body.engine = engine;
  if (language) body.language = language;

  const post = (payload) =>
    fetchWithTimeout(
      joinUrl(baseUrl, '/speak'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Voicebox-Client-Id': clientId },
        body: JSON.stringify(payload),
      },
      30_000
    );

  let res = await post(body);
  if (!res.ok && profile && (res.status === 404 || res.status === 400)) {
    const { profile: _omit, ...withoutProfile } = body;
    res = await post(withoutProfile);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Voicebox /speak failed (HTTP ${res.status})${detail ? `: ${detail}` : ''}`);
  }
  const data = await res.json();
  const out = { id: data?.id, status: data?.status || 'generating' };
  if (out.id) _active = { id: out.id, baseUrl: normBase(baseUrl) };
  return out;
}

/**
 * Watch a /speak generation to completion by consuming its SSE status stream
 * (`GET /generate/{id}/status` streams `data: {json}` events and closes on a
 * terminal status). Resolves with the final status; never rejects - on any
 * error it resolves so the "speaking" indicator always clears.
 * @returns {Promise<string>} terminal status (completed | failed | not_found | error)
 */
export async function awaitSpeakDone(id, { baseUrl = DEFAULT_BASE_URL, signal } = {}) {
  if (!id) return 'completed';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SPEAK_WATCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener('abort', onAbort);

  let status = 'completed';
  try {
    const res = await fetch(joinUrl(baseUrl, `/generate/${id}/status`), {
      signal: controller.signal,
    });
    const reader = res.body?.getReader?.();
    if (reader) {
      const decoder = new TextDecoder();
      let buffer = '';
      // Read SSE frames; each `data:` line carries a JSON status snapshot.
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith('data:')) continue;
          try {
            const snap = JSON.parse(line.slice(5).trim());
            if (snap?.status) status = snap.status;
            if (status === 'completed' || status === 'failed' || status === 'not_found') {
              return status;
            }
          } catch {
            // ignore malformed frame
          }
        }
      }
    }
  } catch {
    status = 'error';
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
    if (_active && _active.id === id) _active = null;
  }
  return status;
}

/** Cancel an in-flight generation (best-effort; ignores errors). */
export async function cancel(id, { baseUrl = DEFAULT_BASE_URL } = {}) {
  if (!id) return;
  try {
    await fetchWithTimeout(joinUrl(baseUrl, `/generate/${id}/cancel`), { method: 'POST' }, 4000);
  } catch {
    // best-effort
  }
}

/** Stop whatever Voicebox is currently speaking (cancels host playback). */
export async function stop() {
  const active = _active;
  _active = null;
  if (active?.id) await cancel(active.id, { baseUrl: active.baseUrl });
}

/** True when a Voicebox generation is currently in flight. */
export function hasActiveSpeech() {
  return _active != null;
}
