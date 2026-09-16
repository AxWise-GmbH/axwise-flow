import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scanUrl, verdictFromStats } from './virustotal.js';

describe('verdictFromStats', () => {
  it('returns clean when no findings', () => {
    expect(verdictFromStats({ harmless: 60, malicious: 0, suspicious: 0 })).toMatchObject({
      verdict: 'clean', harmless: 60, malicious: 0, suspicious: 0,
    });
  });

  it('returns warn when suspicious >= 2', () => {
    expect(verdictFromStats({ malicious: 0, suspicious: 2 }).verdict).toBe('warn');
    expect(verdictFromStats({ malicious: 0, suspicious: 5 }).verdict).toBe('warn');
  });

  it('returns clean when suspicious is 1 (below threshold)', () => {
    expect(verdictFromStats({ malicious: 0, suspicious: 1 }).verdict).toBe('clean');
  });

  it('returns block when any malicious finding', () => {
    expect(verdictFromStats({ malicious: 1, suspicious: 0 }).verdict).toBe('block');
    expect(verdictFromStats({ malicious: 5, suspicious: 10 }).verdict).toBe('block');
  });

  it('block beats warn', () => {
    expect(verdictFromStats({ malicious: 1, suspicious: 5 }).verdict).toBe('block');
  });

  it('includes url and ISO scanned_at', () => {
    const out = verdictFromStats({ url: 'https://api.github.com' });
    expect(out.url).toBe('https://api.github.com');
    expect(out.scanned_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('coerces missing stats to 0', () => {
    expect(verdictFromStats({})).toMatchObject({
      verdict: 'clean', harmless: 0, malicious: 0, suspicious: 0,
    });
  });
});

describe('scanUrl', () => {
  let originalFetch;
  let originalEnv;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalEnv = process.env.VIRUSTOTAL_API_KEY;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv === undefined) delete process.env.VIRUSTOTAL_API_KEY;
    else process.env.VIRUSTOTAL_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it('throws when no api key configured', async () => {
    delete process.env.VIRUSTOTAL_API_KEY;
    await expect(scanUrl('https://api.github.com')).rejects.toThrow(/VIRUSTOTAL_API_KEY/);
  });

  it('throws when url missing', async () => {
    process.env.VIRUSTOTAL_API_KEY = 'k';
    await expect(scanUrl('')).rejects.toThrow(/url is required/);
  });

  it('returns clean verdict for harmless target', async () => {
    process.env.VIRUSTOTAL_API_KEY = 'test-key';
    globalThis.fetch = vi.fn()
      // submit
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 'analysis-123' } }),
        text: async () => '',
      })
      // analysis poll
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: { attributes: { stats: { harmless: 78, malicious: 0, suspicious: 0 } } } }),
        text: async () => '',
      });

    const out = await scanUrl('https://api.github.com', { timeoutMs: 100 });
    expect(out.verdict).toBe('clean');
    expect(out.harmless).toBe(78);
    expect(out.url).toBe('https://api.github.com');
  });

  it('returns block verdict on malicious finding', async () => {
    process.env.VIRUSTOTAL_API_KEY = 'test-key';
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200, text: async () => '',
        json: async () => ({ data: { id: 'a-1' } }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200, text: async () => '',
        json: async () => ({ data: { attributes: { stats: { harmless: 50, malicious: 3, suspicious: 0 } } } }),
      });

    const out = await scanUrl('https://evil.example', { timeoutMs: 100 });
    expect(out.verdict).toBe('block');
    expect(out.malicious).toBe(3);
  });

  it('throws when submit returns non-ok', async () => {
    process.env.VIRUSTOTAL_API_KEY = 'test-key';
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: false, status: 429, text: async () => 'rate limited', json: async () => ({}),
    });
    await expect(scanUrl('https://api.github.com', { timeoutMs: 100 }))
      .rejects.toThrow(/VT submit failed.*429/);
  });

  it('throws when analysis poll returns non-ok', async () => {
    process.env.VIRUSTOTAL_API_KEY = 'test-key';
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200, text: async () => '',
        json: async () => ({ data: { id: 'a-1' } }),
      })
      .mockResolvedValueOnce({
        ok: false, status: 500, text: async () => 'oops', json: async () => ({}),
      });
    await expect(scanUrl('https://api.github.com', { timeoutMs: 100 }))
      .rejects.toThrow(/VT analysis failed.*500/);
  });
});
