import { createHash } from 'node:crypto';

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const SUPPORTED_MIME_TYPES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/m4a',
  'audio/mp4',
]);

export class DesktopTranscribeError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'DesktopTranscribeError';
    this.code = code;
    this.status = status;
  }
}

export function createDesktopTranscribeService({
  apiKey,
  model = 'models/gemini-3.8-flash',
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey))
    throw new Error('DESKTOP_TRANSCRIBE_API_KEY_REQUIRED');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

  return {
    async transcribe(authContext, input, { signal } = {}) {
      if (!authContext?.userId)
        throw new DesktopTranscribeError('UNAUTHENTICATED', 'Authentication required', 401);

      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new DesktopTranscribeError('INVALID_INPUT', 'Expected JSON body with audio data');

      const rawAudio = typeof input.audio === 'string' ? input.audio.trim() : '';
      if (!rawAudio)
        throw new DesktopTranscribeError('INVALID_INPUT', 'Missing audio payload');

      let mimeType = typeof input.mimeType === 'string' ? input.mimeType.trim().toLowerCase() : 'audio/wav';
      if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
        mimeType = 'audio/wav';
      }

      const cleanBase64 = rawAudio.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
      const byteLength = Buffer.byteLength(cleanBase64, 'base64');
      if (byteLength === 0 || byteLength > MAX_AUDIO_BYTES)
        throw new DesktopTranscribeError('INVALID_INPUT', 'Audio must be non-empty and under 15MB');

      const promptText = 'Transcribe the speech in this audio accurately. Output only the verbatim transcript text without formatting, timestamps, or commentary. If there is no speech, output nothing.';

      const body = {
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType,
                  data: cleanBase64,
                },
              },
              {
                text: promptText,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.0,
          maxOutputTokens: 2048,
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      };

      const requestSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs);

      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: requestSignal,
        });
      } catch (err) {
        if (requestSignal.aborted)
          throw new DesktopTranscribeError('TRANSCRIBE_TIMEOUT', 'Transcription request timed out', 504);
        throw new DesktopTranscribeError('TRANSCRIBE_FAILED', 'Could not reach speech service', 502);
      }

      if (!response.ok) {
        if (response.status === 429)
          throw new DesktopTranscribeError('RATE_LIMITED', 'Speech transcription is busy', 429);
        throw new DesktopTranscribeError('TRANSCRIBE_FAILED', `Speech service error ${response.status}`, 502);
      }

      let data;
      try {
        data = await response.json();
      } catch {
        throw new DesktopTranscribeError('TRANSCRIBE_INVALID', 'Invalid response from speech service', 502);
      }

      const candidate = data?.candidates?.[0];
      let text = (candidate?.content?.parts?.[0]?.text ?? '').trim();
      // Filter out hallucinated acoustic descriptions from Gemini (e.g. "0:00 - 0:05: Typing sounds and clicking on a keyboard", "[music playing]", "(applause)")
      if (/^\[[^\]]+\]$/.test(text) || /^\([^\)]+\)$/.test(text) || /^\d{1,2}:\d{2}.*(?:typing|sound|noise|music|clicking|keyboard|chime|silence)/i.test(text)) {
        text = '';
      }

      return {
        text,
        model,
      };
    },
  };
}
