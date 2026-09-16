import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isAvailable,
  clearAvailabilityCache,
  listProfiles,
  transcribe,
  speak,
  awaitSpeakDone,
  cancel,
  ModelDownloadingError,
  DEFAULT_BASE_URL,
} from './voiceboxService';

const mockFetch = vi.fn();
global.fetch = mockFetch;

/** Build a fake Response with an SSE body that yields the given `data:` frames. */
function sseResponse(snapshots) {
  const encoder = new TextEncoder();
  const frames = snapshots.map((s) => encoder.encode(`data: ${JSON.stringify(s)}\n\n`));
  let i = 0;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: () =>
          i < frames.length
            ? Promise.resolve({ done: false, value: frames[i++] })
            : Promise.resolve({ done: true, value: undefined }),
      }),
    },
  };
}

describe('voiceboxService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAvailabilityCache();
  });

  describe('isAvailable', () => {
    it('returns ok:true when /health responds 200', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      const res = await isAvailable({ baseUrl: DEFAULT_BASE_URL });
      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:17493/health',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('returns ok:false when the request rejects (CORS / not running)', async () => {
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'));
      const res = await isAvailable({});
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('unreachable');
    });

    it('returns ok:false on a non-OK status', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 503 });
      const res = await isAvailable({});
      expect(res.ok).toBe(false);
    });

    it('caches the result within the TTL (one fetch for two calls)', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      await isAvailable({});
      await isAvailable({});
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('listProfiles', () => {
    it('returns the profile array', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: 'a', name: 'Morgan' }]),
      });
      const profiles = await listProfiles({});
      expect(profiles).toEqual([{ id: 'a', name: 'Morgan' }]);
    });

    it('throws on a non-OK response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });
      await expect(listProfiles({})).rejects.toThrow(/profiles/i);
    });
  });

  describe('transcribe', () => {
    it('POSTs multipart with field `file` + model and returns the text', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ text: ' hello world ', duration: 1 }),
      });
      const blob = new Blob(['x'], { type: 'audio/webm' });
      const text = await transcribe(blob, { model: 'turbo' });

      expect(text).toBe('hello world');
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://127.0.0.1:17493/transcribe');
      expect(opts.method).toBe('POST');
      expect(opts.body).toBeInstanceOf(FormData);
      expect(opts.body.get('model')).toBe('turbo');
      expect(opts.body.get('file')).toBeTruthy();
    });

    it('throws ModelDownloadingError on HTTP 202', async () => {
      mockFetch.mockResolvedValue({ status: 202, ok: false });
      const blob = new Blob(['x'], { type: 'audio/webm' });
      await expect(transcribe(blob, {})).rejects.toBeInstanceOf(ModelDownloadingError);
    });

    it('throws on other non-OK statuses', async () => {
      mockFetch.mockResolvedValue({ status: 500, ok: false, text: () => Promise.resolve('boom') });
      const blob = new Blob(['x'], { type: 'audio/webm' });
      await expect(transcribe(blob, {})).rejects.toThrow(/500/);
    });
  });

  describe('speak', () => {
    it('POSTs JSON with the client-id header and returns id+status', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'g1', status: 'generating' }),
      });
      const out = await speak('Deploy complete.', { profile: 'Morgan', clientId: 'orchestratori' });

      expect(out).toEqual({ id: 'g1', status: 'generating' });
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://127.0.0.1:17493/speak');
      expect(opts.headers['X-Voicebox-Client-Id']).toBe('orchestratori');
      expect(JSON.parse(opts.body)).toMatchObject({ text: 'Deploy complete.', profile: 'Morgan' });
    });

    it('retries once without the profile on a 404', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 404, text: () => Promise.resolve('not found') })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: 'g2', status: 'generating' }),
        });

      const out = await speak('hi', { profile: 'Ghost' });
      expect(out.id).toBe('g2');
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(JSON.parse(mockFetch.mock.calls[1][1].body).profile).toBeUndefined();
    });

    it('throws when /speak fails with no profile to drop', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('err') });
      await expect(speak('hi', {})).rejects.toThrow(/500/);
    });
  });

  describe('awaitSpeakDone', () => {
    it('resolves with the terminal status from the SSE stream', async () => {
      mockFetch.mockResolvedValue(sseResponse([{ status: 'generating' }, { status: 'completed' }]));
      const status = await awaitSpeakDone('g1', {});
      expect(status).toBe('completed');
    });

    it('resolves (does not reject) when the stream errors', async () => {
      mockFetch.mockRejectedValue(new Error('stream broke'));
      const status = await awaitSpeakDone('g1', {});
      expect(status).toBe('error');
    });

    it('returns completed immediately when given no id', async () => {
      const status = await awaitSpeakDone(null, {});
      expect(status).toBe('completed');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('cancel', () => {
    it('POSTs to the cancel endpoint and swallows errors', async () => {
      mockFetch.mockResolvedValue({ ok: true });
      await cancel('g1', {});
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:17493/generate/g1/cancel',
        expect.objectContaining({ method: 'POST' })
      );
      mockFetch.mockRejectedValue(new Error('x'));
      await expect(cancel('g2', {})).resolves.toBeUndefined();
    });
  });
});
