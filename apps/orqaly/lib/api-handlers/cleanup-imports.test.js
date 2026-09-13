import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(() => null),
}));

vi.mock('../security/upload-storage.js', () => ({
  deleteImportFile: vi.fn(),
}));

import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import handler from './cleanup-imports.js';

function response() {
  return {
    statusCode: 200,
    body: null,
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

describe('cleanup-imports service authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
    delete process.env.WORKER_SECRET;
    delete process.env.BACKUP_SECRET;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    delete process.env.WORKER_SECRET;
    delete process.env.BACKUP_SECRET;
  });

  it('does not trust a caller-provided x-vercel-cron header', async () => {
    const res = response();

    await handler({ method: 'GET', headers: { 'x-vercel-cron': '1' } }, res);

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(buildSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it('passes authentication with a configured cron bearer', async () => {
    process.env.CRON_SECRET = 'cron-test-secret';
    const res = response();

    await handler(
      {
        method: 'GET',
        headers: { authorization: 'Bearer cron-test-secret' },
      },
      res
    );

    expect(buildSupabaseAdminClient).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Admin client unavailable' });
  });
});
