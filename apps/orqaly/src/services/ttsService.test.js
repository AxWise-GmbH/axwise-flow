import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./voiceboxService', () => ({
  speak: vi.fn(() => Promise.resolve({ id: 'g1', status: 'generating' })),
  awaitSpeakDone: vi.fn(() => Promise.resolve('completed')),
  stop: vi.fn(() => Promise.resolve()),
}));

import { speak, stopSpeaking, isSpeaking } from './ttsService';
import { speak as vbSpeak, awaitSpeakDone as vbAwaitDone, stop as vbStop } from './voiceboxService';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock Audio
class MockAudio {
  constructor() {
    this.src = '';
    this.volume = 1;
    this.currentTime = 0;
    this.onplay = null;
    this.onended = null;
    this.onerror = null;
  }
  play() {
    this.onplay?.();
    return Promise.resolve();
  }
  pause() {}
}
global.Audio = MockAudio;

// Mock URL
global.URL.createObjectURL = vi.fn(() => 'blob:mock');
global.URL.revokeObjectURL = vi.fn();

// Mock speechSynthesis
const mockCancel = vi.fn();
const mockSpeak = vi.fn();
global.speechSynthesis = {
  cancel: mockCancel,
  speak: mockSpeak,
  getVoices: () => [],
};
global.SpeechSynthesisUtterance = class {
  constructor(text) {
    this.text = text;
    this.lang = 'en-US';
    this.rate = 1;
    this.pitch = 1;
    this.volume = 1;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
  }
};

describe('ttsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    stopSpeaking();
  });

  describe('speak() with browser provider', () => {
    it('calls speechSynthesis.speak', async () => {
      await speak({
        text: 'Hello',
        provider: 'browser',
        voiceSettings: { language: 'en-US', rate: 1, pitch: 1 },
      });
      expect(mockCancel).toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalled();
    });

    it('does nothing with empty text', async () => {
      await speak({ text: '', provider: 'browser' });
      expect(mockSpeak).not.toHaveBeenCalled();
    });
  });

  describe('speak() with elevenlabs provider', () => {
    it('fetches from TTS endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/mpeg' })),
      });

      await speak({
        text: 'Hello',
        provider: 'elevenlabs',
        voiceId: 'test-voice',
        token: 'jwt-token',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/app?path=tts',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer jwt-token',
          }),
        })
      );
    });

    it('falls back to browser TTS when fetch fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'fail' }),
      });

      const onStart = vi.fn();
      await speak({
        text: 'Hello',
        provider: 'elevenlabs',
        token: 'jwt',
        voiceSettings: { language: 'en-US', rate: 1, pitch: 1 },
        onStart,
      });

      // Browser fallback should have been triggered
      expect(mockSpeak).toHaveBeenCalled();
    });

    it('uses browser TTS when no token provided', async () => {
      await speak({
        text: 'Hello',
        provider: 'elevenlabs',
        token: null,
        voiceSettings: { language: 'en-US', rate: 1, pitch: 1 },
      });

      // No fetch call, falls to browser
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalled();
    });
  });

  describe('speak() with voicebox provider', () => {
    it('delegates to voiceboxService.speak and awaits completion', async () => {
      const onStart = vi.fn();
      const onEnd = vi.fn();
      await speak({
        text: 'Hello there',
        provider: 'voicebox',
        baseUrl: 'http://127.0.0.1:17493',
        profile: 'Morgan',
        clientId: 'orchestratori',
        onStart,
        onEnd,
      });

      expect(vbSpeak).toHaveBeenCalledWith(
        'Hello there',
        expect.objectContaining({ profile: 'Morgan' })
      );
      expect(vbAwaitDone).toHaveBeenCalled();
      expect(onStart).toHaveBeenCalled();
      expect(onEnd).toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled(); // didn't touch ElevenLabs
    });

    it('falls back to ElevenLabs when Voicebox throws and a token is present', async () => {
      vbSpeak.mockRejectedValueOnce(new Error('voicebox down'));
      mockFetch.mockResolvedValue({
        ok: true,
        blob: () => Promise.resolve(new Blob(['audio'], { type: 'audio/mpeg' })),
      });

      await speak({ text: 'Hello', provider: 'voicebox', token: 'jwt', voiceId: 'v1' });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/app?path=tts',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('falls back to the browser synthesiser when Voicebox throws and there is no token', async () => {
      vbSpeak.mockRejectedValueOnce(new Error('voicebox down'));
      await speak({
        text: 'Hello',
        provider: 'voicebox',
        voiceSettings: { language: 'en-US', rate: 1, pitch: 1 },
      });
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalled();
    });
  });

  describe('stopSpeaking()', () => {
    it('cancels Voicebox host playback', () => {
      stopSpeaking();
      expect(vbStop).toHaveBeenCalled();
    });

    it('cancels speechSynthesis', () => {
      stopSpeaking();
      expect(mockCancel).toHaveBeenCalled();
    });

    it('resets isSpeaking to false', () => {
      stopSpeaking();
      expect(isSpeaking()).toBe(false);
    });
  });
});
