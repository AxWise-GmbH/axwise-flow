import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { scanFileBuffer, sha256Hex } from './virustotal.js';

const SAVED = {};
beforeAll(() => {
  SAVED.VT_API_KEY = process.env.VT_API_KEY;
  process.env.VT_API_KEY = 'test-key';
});
afterAll(() => {
  if (SAVED.VT_API_KEY === undefined) delete process.env.VT_API_KEY;
  else process.env.VT_API_KEY = SAVED.VT_API_KEY;
});

function mockFetch(responses) {
  let i = 0;
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, opts });
    const r = responses[i++] || responses[responses.length - 1];
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body,
    };
  };
  fn.calls = calls;
  return fn;
}

describe('virustotal', () => {
  const buf = Buffer.from('OPENAI_API_KEY=sk-test\n', 'utf8');
  const expectedHash = sha256Hex(buf);

  it('returns clean when hash is known and malicious=0', async () => {
    const _fetch = mockFetch([
      { status: 200, body: { data: { attributes: { last_analysis_stats: { malicious: 0, suspicious: 0, harmless: 30, undetected: 40 } } } } },
    ]);
    const res = await scanFileBuffer(buf, 'env', { _fetch });
    expect(res.status).toBe('clean');
    expect(res.sha256).toBe(expectedHash);
    expect(res.stats.harmless).toBe(30);
  });

  it('returns malicious when any engine flags it', async () => {
    const _fetch = mockFetch([
      { status: 200, body: { data: { attributes: { last_analysis_stats: { malicious: 2, harmless: 20 } } } } },
    ]);
    const res = await scanFileBuffer(buf, 'env', { _fetch });
    expect(res.status).toBe('malicious');
  });

  it('returns malicious when suspicious>=3 (conservative)', async () => {
    const _fetch = mockFetch([
      { status: 200, body: { data: { attributes: { last_analysis_stats: { malicious: 0, suspicious: 4, harmless: 20 } } } } },
    ]);
    const res = await scanFileBuffer(buf, 'env', { _fetch });
    expect(res.status).toBe('malicious');
  });

  it('uploads and polls when hash is unknown, returns clean on completion', async () => {
    const _fetch = mockFetch([
      { status: 404, body: {} },
      { status: 200, body: { data: { id: 'analysis-123' } } },
      { status: 200, body: { data: { attributes: { status: 'queued' } } } },
      { status: 200, body: { data: { attributes: { status: 'completed', stats: { malicious: 0, harmless: 10 } } } } },
    ]);
    const res = await scanFileBuffer(buf, 'env', { _fetch, deadlineMs: 2_000, pollIntervalMs: 10 });
    expect(res.status).toBe('clean');
    expect(res.scanId).toBe('analysis-123');
  });

  it('returns malicious when upload analysis flags it', async () => {
    const _fetch = mockFetch([
      { status: 404, body: {} },
      { status: 200, body: { data: { id: 'analysis-456' } } },
      { status: 200, body: { data: { attributes: { status: 'completed', stats: { malicious: 5 } } } } },
    ]);
    const res = await scanFileBuffer(buf, 'env', { _fetch, deadlineMs: 2_000, pollIntervalMs: 10 });
    expect(res.status).toBe('malicious');
    expect(res.scanId).toBe('analysis-456');
  });

  it('returns unknown on deadline timeout', async () => {
    const _fetch = mockFetch([
      { status: 404, body: {} },
      { status: 200, body: { data: { id: 'analysis-timeout' } } },
      { status: 200, body: { data: { attributes: { status: 'queued' } } } },
    ]);
    const res = await scanFileBuffer(buf, 'env', { _fetch, deadlineMs: 150, pollIntervalMs: 10 });
    expect(res.status).toBe('unknown');
    expect(res.reason).toBe('timeout');
  });

  it('returns unknown when upload fails', async () => {
    const _fetch = mockFetch([
      { status: 404, body: {} },
      { status: 503, body: {} },
    ]);
    const res = await scanFileBuffer(buf, 'env', { _fetch });
    expect(res.status).toBe('unknown');
    expect(res.reason).toBe('upload_503');
  });

  it('returns unknown/disabled when VT_API_KEY is missing', async () => {
    const saved = process.env.VT_API_KEY;
    delete process.env.VT_API_KEY;
    try {
      const res = await scanFileBuffer(buf, 'env');
      expect(res.status).toBe('unknown');
      expect(res.reason).toBe('disabled');
    } finally {
      process.env.VT_API_KEY = saved;
    }
  });
});
