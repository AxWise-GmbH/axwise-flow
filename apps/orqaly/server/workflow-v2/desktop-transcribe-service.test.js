// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createDesktopTranscribeService, DesktopTranscribeError } from './desktop-transcribe-service.js';

const auth = { userId: 'user-speech' };
const sampleBase64Audio = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

describe('createDesktopTranscribeService', () => {
  it('transcribes audio and returns verbatim text', async () => {
    let capturedUrl, capturedBody;
    const fetchImpl = vi.fn(async (url, options) => {
      capturedUrl = url;
      capturedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ text: 'Hello from speech dictation' }],
            },
          },
        ],
      }), { headers: { 'content-type': 'application/json' } });
    });

    const service = createDesktopTranscribeService({
      apiKey: 'test-gemini-key',
      fetchImpl,
    });

    const result = await service.transcribe(auth, {
      audio: sampleBase64Audio,
      mimeType: 'audio/wav',
    });

    expect(result.text).toBe('Hello from speech dictation');
    expect(result.model).toBe('models/gemini-3.8-flash');
    expect(capturedUrl).toContain('models/gemini-3.8-flash:generateContent?key=test-gemini-key');
    expect(capturedBody.contents[0].parts[0].inlineData.mimeType).toBe('audio/wav');
    expect(capturedBody.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
  });

  it('rejects unauthenticated requests', async () => {
    const service = createDesktopTranscribeService({ apiKey: 'key' });
    await expect(service.transcribe(null, { audio: sampleBase64Audio })).rejects.toThrow(DesktopTranscribeError);
  });

  it('rejects empty audio payloads', async () => {
    const service = createDesktopTranscribeService({ apiKey: 'key' });
    await expect(service.transcribe(auth, { audio: '' })).rejects.toThrow(DesktopTranscribeError);
  });
});
