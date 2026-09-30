import { createHash } from 'node:crypto';
import { z } from 'zod';

const GOOGLE_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_RESPONSE_BYTES = 15 * 1024 * 1024;
const MAX_DEADLINE_MS = 120_000;
const SUPPORTED_ASPECT_RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '9:16', '16:9', '21:9'];

export const DesktopImageInputSchema = z.object({
  prompt: z.string().trim().min(1).max(8_000),
  aspectRatio: z.enum(SUPPORTED_ASPECT_RATIOS).optional(),
}).strict();

export class DesktopImageError extends Error {
  constructor(code, status = 503) {
    super(code);
    this.name = 'DesktopImageError';
    this.code = code;
    this.status = status;
  }
}

async function abortable(operation, signal) {
  signal.throwIfAborted();
  let abort;
  const cancelled = new Promise((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
  });
  try { return await Promise.race([operation(), cancelled]); }
  finally { signal.removeEventListener('abort', abort); }
}

async function boundedJson(response, signal) {
  if (response.redirected || !response.headers.get('content-type')?.includes('application/json') || !response.body) {
    throw new DesktopImageError('IMAGE_PROVIDER_RESPONSE_INVALID', 502);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  const abort = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES)
        throw new DesktopImageError('IMAGE_PROVIDER_RESPONSE_TOO_LARGE', 502);
      chunks.push(Buffer.from(value));
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new DesktopImageError('IMAGE_PROVIDER_RESPONSE_INVALID', 502); }
}

function hasImageSignature(mime, bytes) {
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/webp') return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

export function createDesktopImageService({
  apiKey,
  fetchImpl = fetch,
  model = 'gemini-3.1-flash-image',
  deadlineMs = 60_000,
} = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/u.test(apiKey))
    throw new Error('DESKTOP_IMAGE_API_KEY_REQUIRED');
  if (typeof model !== 'string' || !/^gemini-[a-z0-9.-]+$/u.test(model))
    throw new Error('DESKTOP_IMAGE_MODEL_INVALID');
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > MAX_DEADLINE_MS)
    throw new Error('DESKTOP_IMAGE_DEADLINE_INVALID');

  return {
    async generate(auth, rawInput, { signal } = {}) {
      if (!auth?.userId) throw new DesktopImageError('UNAUTHENTICATED', 401);
      const input = DesktopImageInputSchema.parse(rawInput);
      const controller = new AbortController();
      let timedOut = false;
      const abort = () => controller.abort(signal?.reason);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, deadlineMs);

      try {
        controller.signal.throwIfAborted();
        const url = `${GOOGLE_API_URL}/${model}:generateContent?key=${apiKey}`;
        const body = {
          contents: [{ parts: [{ text: input.prompt }] }],
          generationConfig: {
            responseModalities: ['IMAGE'],
            imageConfig: {
              imageSize: '1K',
              ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
            },
          },
        };
        const response = await abortable(() => fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
          redirect: 'error',
        }), controller.signal);

        if (!response.ok) {
          await response.body?.cancel();
          throw new DesktopImageError('IMAGE_PROVIDER_UNAVAILABLE', response.status === 429 ? 429 : 502);
        }

        const data = await abortable(() => boundedJson(response, controller.signal), controller.signal);
        const candidate = (data?.candidates || [])[0];
        const parts = candidate?.content?.parts || [];
        const imagePart = parts.find((part) => part?.inlineData?.data);
        if (!imagePart) {
          throw new DesktopImageError('IMAGE_PROVIDER_RESPONSE_INVALID', 502);
        }

        const mimeType = imagePart.inlineData.mimeType || 'image/jpeg';
        const base64Data = imagePart.inlineData.data;
        const bytes = Buffer.from(base64Data, 'base64');
        if (!hasImageSignature(mimeType, bytes)) {
          throw new DesktopImageError('IMAGE_PROVIDER_SIGNATURE_MISMATCH', 502);
        }

        const sha256 = createHash('sha256').update(bytes).digest('hex');
        const alt = input.prompt.length > 500 ? `${input.prompt.slice(0, 497)}...` : input.prompt;
        const shortPrompt = input.prompt.length > 60 ? `${input.prompt.slice(0, 57)}...` : input.prompt;

        return {
          schemaVersion: 'axwise.presentation.generated-image.v1',
          kind: 'generated_image',
          mimeType,
          data: base64Data,
          sha256,
          alt,
          model: `models/${model}`,
          markdown: `![${shortPrompt}](generated)`,
        };
      } catch (error) {
        if (timedOut) throw new DesktopImageError('IMAGE_TIMEOUT', 504);
        if (signal?.aborted) throw signal.reason || new DOMException('Image generation cancelled', 'AbortError');
        if (error instanceof DesktopImageError || error?.name === 'ZodError') throw error;
        throw new DesktopImageError('IMAGE_PROVIDER_UNAVAILABLE', 502);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', abort);
        controller.abort();
      }
    },
  };
}
