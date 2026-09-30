// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createDesktopImageService, DesktopImageError } from './desktop-image-service.js';

const auth = { userId: 'user-image' };
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

function validImageResponse(data = pngBase64, mimeType = 'image/png') {
  return new Response(JSON.stringify({
    candidates: [
      {
        content: {
          parts: [
            {
              inlineData: {
                mimeType,
                data,
              },
            },
          ],
        },
      },
    ],
  }), { headers: { 'content-type': 'application/json' } });
}

describe('createDesktopImageService', () => {
  it('generates an image and returns formatted presentation payload', async () => {
    let capturedUrl, capturedBody;
    const fetchImpl = vi.fn(async (url, options) => {
      capturedUrl = url;
      capturedBody = JSON.parse(options.body);
      return validImageResponse();
    });

    const service = createDesktopImageService({
      apiKey: 'test-gemini-key',
      fetchImpl,
    });

    const result = await service.generate(auth, {
      prompt: 'A cute mascot for Orqanix',
      aspectRatio: '16:9',
    });

    expect(result.kind).toBe('generated_image');
    expect(result.mimeType).toBe('image/png');
    expect(result.data).toBe(pngBase64);
    expect(result.model).toBe('models/gemini-3.1-flash-image');
    expect(result.sha256).toBe('6b7fa434f92a8b80aab02d9bf1a12e49ffcae424e4013a1c4f68b67e3d2bbcd0');
    expect(capturedUrl).toContain('models/gemini-3.1-flash-image:generateContent?key=test-gemini-key');
    expect(capturedBody.generationConfig.imageConfig.aspectRatio).toBe('16:9');
    expect(capturedBody.generationConfig.responseModalities).toEqual(['IMAGE']);
  });

  it('rejects unauthenticated requests', async () => {
    const service = createDesktopImageService({ apiKey: 'key' });
    await expect(service.generate(null, { prompt: 'Test' })).rejects.toThrow(DesktopImageError);
  });

  it('validates prompt and aspect ratio', async () => {
    const service = createDesktopImageService({ apiKey: 'key' });
    await expect(service.generate(auth, { prompt: '' })).rejects.toThrow();
    await expect(service.generate(auth, { prompt: 'test', aspectRatio: '99:1' })).rejects.toThrow();
  });

  it('handles provider error status codes gracefully', async () => {
    const fetchImpl = vi.fn(async () => new Response('Rate limited', { status: 429 }));
    const service = createDesktopImageService({ apiKey: 'key', fetchImpl });
    await expect(service.generate(auth, { prompt: 'Valid prompt' })).rejects.toThrow(DesktopImageError);
  });
});
