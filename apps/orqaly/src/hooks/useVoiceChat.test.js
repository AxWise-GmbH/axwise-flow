import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// --- hoisted mock handles (vi.mock factories are hoisted above imports) -------

const vb = vi.hoisted(() => ({
  isAvailable: vi.fn(),
  transcribe: vi.fn(),
  speak: vi.fn(),
  awaitSpeakDone: vi.fn(),
  stop: vi.fn(),
}));
const tts = vi.hoisted(() => ({ speak: vi.fn(), stopSpeaking: vi.fn() }));
const mic = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), clearError: vi.fn() }));
const vc = vi.hoisted(() => ({ startListening: vi.fn(), stopListening: vi.fn(), opts: null }));

vi.mock('../services/voiceboxService', () => ({
  isAvailable: vb.isAvailable,
  transcribe: vb.transcribe,
  speak: vb.speak,
  awaitSpeakDone: vb.awaitSpeakDone,
  stop: vb.stop,
  ModelDownloadingError: class ModelDownloadingError extends Error {},
  DEFAULT_BASE_URL: 'http://127.0.0.1:17493',
  DEFAULT_CLIENT_ID: 'orchestratori',
}));
vi.mock('../services/ttsService', () => ({ speak: tts.speak, stopSpeaking: tts.stopSpeaking }));
vi.mock('./useMicRecorder', () => ({
  useMicRecorder: () => ({
    recording: false,
    start: mic.start,
    stop: mic.stop,
    error: null,
    isSupported: true,
    clearError: mic.clearError,
  }),
}));
vi.mock('./useVoiceControl', () => ({
  useVoiceControl: (opts) => {
    vc.opts = opts;
    return {
      isSupported: true,
      startListening: vc.startListening,
      stopListening: vc.stopListening,
      state: 'idle',
      error: null,
    };
  },
}));

import { useVoiceChat } from './useVoiceChat';

describe('useVoiceChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vb.isAvailable.mockResolvedValue({ ok: true });
    vb.transcribe.mockResolvedValue('hello world');
    vb.speak.mockResolvedValue({ id: 'g1', status: 'generating' });
    vb.awaitSpeakDone.mockResolvedValue('completed');
    vb.stop.mockResolvedValue(undefined);
    mic.start.mockResolvedValue(true);
    mic.stop.mockResolvedValue({ size: 10, type: 'audio/webm' });
    tts.speak.mockResolvedValue(undefined);
  });

  it('speech-in: records via Voicebox and emits the transcript', async () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() =>
      useVoiceChat({ voiceConfig: { provider: 'voicebox' }, onTranscript })
    );

    await act(async () => {
      await result.current.startMic();
    });
    expect(mic.start).toHaveBeenCalled();
    expect(result.current.micState).toBe('recording');

    await act(async () => {
      await result.current.stopMic();
    });
    expect(vb.transcribe).toHaveBeenCalled();
    expect(onTranscript).toHaveBeenCalledWith('hello world');
    expect(result.current.micState).toBe('idle');
  });

  it('speech-in: falls back to Web-Speech when Voicebox is unreachable', async () => {
    vb.isAvailable.mockResolvedValue({ ok: false });
    const onTranscript = vi.fn();
    const { result } = renderHook(() =>
      useVoiceChat({ voiceConfig: { provider: 'voicebox' }, onTranscript })
    );

    await act(async () => {
      await result.current.startMic();
    });
    expect(vc.startListening).toHaveBeenCalled();
    expect(mic.start).not.toHaveBeenCalled();

    await act(async () => {
      vc.opts.onListeningEnd('typed by voice');
    });
    expect(onTranscript).toHaveBeenCalledWith('typed by voice');
  });

  it('voice-out: speaks via Voicebox when reachable', async () => {
    const { result } = renderHook(() =>
      useVoiceChat({ voiceConfig: { provider: 'voicebox', profileId: 'p1' } })
    );
    await act(async () => {
      await result.current.speakReply('Hi there');
    });

    expect(vb.speak).toHaveBeenCalledWith('Hi there', expect.objectContaining({ profile: 'p1' }));
    expect(vb.awaitSpeakDone).toHaveBeenCalled();
    expect(tts.speak).not.toHaveBeenCalled();
  });

  it('voice-out: falls back to ElevenLabs when Voicebox is unreachable', async () => {
    vb.isAvailable.mockResolvedValue({ ok: false });
    const { result } = renderHook(() =>
      useVoiceChat({ voiceConfig: { provider: 'voicebox' }, token: 'jwt' })
    );
    await act(async () => {
      await result.current.speakReply('Hi');
    });

    expect(vb.speak).not.toHaveBeenCalled();
    expect(tts.speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Hi', provider: 'elevenlabs' })
    );
  });

  it('voice-out: no-op when muted', async () => {
    const { result } = renderHook(() =>
      useVoiceChat({ voiceConfig: { provider: 'voicebox' }, voiceSettings: { muted: true } })
    );
    await act(async () => {
      await result.current.speakReply('Hi');
    });
    expect(vb.speak).not.toHaveBeenCalled();
    expect(tts.speak).not.toHaveBeenCalled();
  });

  it('never speaks while recording', async () => {
    const { result } = renderHook(() => useVoiceChat({ voiceConfig: { provider: 'voicebox' } }));
    await act(async () => {
      await result.current.startMic();
    }); // micState -> recording
    await act(async () => {
      await result.current.speakReply('Hi');
    });
    expect(vb.speak).not.toHaveBeenCalled();
  });
});
