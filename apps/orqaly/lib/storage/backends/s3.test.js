import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../api/_lib/logger.js', () => ({
  createLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }),
}));

const { probeUserConnection } = await import('./s3.js');

const CRED = JSON.stringify({
  region: 'us-east-1', bucket: 'b', accessKeyId: 'AKIA', secretAccessKey: 'secretsecretsecret',
});

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '' });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('s3 probeUserConnection (SigV4)', () => {
  it('signs a PUT then DELETE and returns ok', async () => {
    const r = await probeUserConnection({ credential: CRED, metadata: {} });
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, putOpts] = fetchMock.mock.calls[0];
    expect(putOpts.method).toBe('PUT');
    expect(putOpts.headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIA\//);
  });

  it('surfaces the S3 error code when the PUT is rejected', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, text: async () => '<Error><Code>AccessDenied</Code></Error>' });
    const r = await probeUserConnection({ credential: CRED, metadata: {} });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/AccessDenied/);
  });

  it('rejects an invalid credential JSON without calling fetch', async () => {
    const r = await probeUserConnection({ credential: 'not-json', metadata: {} });
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires bucket + access keys', async () => {
    const r = await probeUserConnection({ credential: JSON.stringify({ region: 'us-east-1' }), metadata: {} });
    expect(r.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the bucket from metadata', async () => {
    const cred = JSON.stringify({ region: 'us-east-1', accessKeyId: 'AKIA', secretAccessKey: 'secretsecretsecret' });
    const r = await probeUserConnection({ credential: cred, metadata: { bucket: 'meta-bucket' } });
    expect(r.ok).toBe(true);
  });

  it('uses path-style addressing for a custom endpoint (R2/MinIO)', async () => {
    const cred = JSON.stringify({ region: 'auto', bucket: 'b', accessKeyId: 'AKIA', secretAccessKey: 'secretsecretsecret', endpoint: 'https://acct.r2.cloudflarestorage.com' });
    await probeUserConnection({ credential: cred, metadata: {} });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://acct.r2.cloudflarestorage.com/b/_tmp/probe-' + url.split('_tmp/probe-')[1]);
    expect(url).toContain('/b/_tmp/probe-'); // path-style: bucket in the path
  });
});
