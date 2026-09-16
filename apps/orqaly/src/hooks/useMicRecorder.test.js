import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMicRecorder } from './useMicRecorder';

// --- MediaRecorder + getUserMedia mocks ---------------------------------------

class MockMediaRecorder {
  constructor(stream, opts) {
    this.stream = stream;
    this.mimeType = opts?.mimeType || 'audio/webm';
    this.ondataavailable = null;
    this.onstop = null;
    this.state = 'inactive';
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    // Emit one chunk then fire onstop, like a real recorder.
    this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: this.mimeType }) });
    this.onstop?.();
  }
}
MockMediaRecorder.isTypeSupported = () => true;

function makeStream() {
  const track = { stop: vi.fn() };
  return { getTracks: () => [track], _track: track };
}

let currentStream;

beforeEach(() => {
  currentStream = makeStream();
  global.MediaRecorder = MockMediaRecorder;
  global.navigator.mediaDevices = {
    getUserMedia: vi.fn(() => Promise.resolve(currentStream)),
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useMicRecorder', () => {
  it('reports supported when MediaRecorder + getUserMedia exist', () => {
    const { result } = renderHook(() => useMicRecorder());
    expect(result.current.isSupported).toBe(true);
  });

  it('start() requests the mic and sets recording=true', async () => {
    const { result } = renderHook(() => useMicRecorder());
    await act(async () => {
      const ok = await result.current.start();
      expect(ok).toBe(true);
    });
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(result.current.recording).toBe(true);
  });

  it('stop() resolves a Blob and releases the mic tracks', async () => {
    const { result } = renderHook(() => useMicRecorder());
    await act(async () => {
      await result.current.start();
    });

    let blob;
    await act(async () => {
      blob = await result.current.stop();
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
    expect(result.current.recording).toBe(false);
    expect(currentStream._track.stop).toHaveBeenCalled();
  });

  it('surfaces a friendly error when permission is denied', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn(() =>
      Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
    );
    const { result } = renderHook(() => useMicRecorder());
    await act(async () => {
      const ok = await result.current.start();
      expect(ok).toBe(false);
    });
    expect(result.current.recording).toBe(false);
    expect(result.current.error).toMatch(/microphone permissions/i);
  });

  it('surfaces a no-device error', async () => {
    navigator.mediaDevices.getUserMedia = vi.fn(() =>
      Promise.reject(Object.assign(new Error('no device'), { name: 'NotFoundError' }))
    );
    const { result } = renderHook(() => useMicRecorder());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.error).toMatch(/no microphone found/i);
  });

  it('stop() without an active recording resolves null', async () => {
    const { result } = renderHook(() => useMicRecorder());
    let blob = 'sentinel';
    await act(async () => {
      blob = await result.current.stop();
    });
    expect(blob).toBeNull();
  });

  it('isSupported is false when MediaRecorder is absent', () => {
    delete global.MediaRecorder;
    const { result } = renderHook(() => useMicRecorder());
    expect(result.current.isSupported).toBe(false);
  });
});
