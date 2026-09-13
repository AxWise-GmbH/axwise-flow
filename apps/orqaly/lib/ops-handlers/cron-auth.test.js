import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(() => null),
}));

import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import scanLibraryEndpoints from './scan-library-endpoints.js';
import snapshotReportKpis from './snapshot-report-kpis.js';

function response() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
  };
}

describe.each([
  ['scan-library-endpoints', scanLibraryEndpoints],
  ['snapshot-report-kpis', snapshotReportKpis],
])('%s service authentication', (_name, handler) => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
    delete process.env.WORKER_SECRET;
    delete process.env.BACKUP_SECRET;
    delete process.env.VIRUSTOTAL_API_KEY;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.WORKER_SECRET;
    delete process.env.BACKUP_SECRET;
    delete process.env.VIRUSTOTAL_API_KEY;
  });

  it('fails closed when secrets are absent, even with a spoofed cron header', async () => {
    const res = response();

    await handler({ method: 'GET', headers: { 'x-vercel-cron': '1' } }, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(buildSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('accepts a configured cron bearer', async () => {
    process.env.CRON_SECRET = 'cron-test-secret';
    const res = response();

    await handler(
      {
        method: 'GET',
        headers: { authorization: 'Bearer cron-test-secret' },
      },
      res
    );

    expect(res.statusCode).not.toBe(401);
  });
});
