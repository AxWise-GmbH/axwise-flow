// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createDesktopSpeechService, DesktopSpeechError } from './desktop-speech-service.js';

const auth = { userId: 'user-speech' };
const sampleBase64Audio = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

describe('createDesktopSpeechService', () => {
  it('synthesizes text and returns audio bytes with sha256', async () => {
    let capturedUrl, capturedBody;
    const fetchImpl = vi.fn(async (url, options) => {
      capturedUrl = url;
      capturedBody = JSON.parse(options.body);
      return new Response(JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{
                inlineData: {
                  mimeType: 'audio/wav',
                  data: sampleBase64Audio,
                },
              }],
            },
          },
        ],
      }), { headers: { 'content-type': 'application/json' } });
    });

    const service = createDesktopSpeechService({
      apiKey: 'test-gemini-key',
      fetchImpl,
    });

    const result = await service.synthesize(auth, {
      text: 'Good morning, how can I help you today?',
      voice: 'Puck',
    });

    expect(result.kind).toBe('synthesized_speech');
    expect(result.mimeType).toBe('audio/wav');
    expect(result.audio).toBe(sampleBase64Audio);
    expect(result.voice).toBe('Puck');
    expect(result.sha256).toBeDefined();
    expect(capturedUrl).toContain('models/gemini-3.8-flash-lite-tts:generateContent?key=test-gemini-key');
    expect(capturedBody.generationConfig.responseModalities).toEqual(['AUDIO']);
    expect(capturedBody.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Puck');
  });

  it('rejects unauthenticated requests', async () => {
    const service = createDesktopSpeechService({ apiKey: 'key' });
    await expect(service.synthesize(null, { text: 'Hello' })).rejects.toThrow(DesktopSpeechError);
  });

  it('rejects empty text payloads', async () => {
    const service = createDesktopSpeechService({ apiKey: 'key' });
    await expect(service.synthesize(auth, { text: '' })).rejects.toThrow(DesktopSpeechError);
  });
});
