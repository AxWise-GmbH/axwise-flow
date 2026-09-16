/**
 * Tests for Supabase webhook handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    startTimer: vi.fn(() => vi.fn()),
  }),
}));

vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, code, msg) => res.status(code).json({ error: msg })),
  handleApiError: vi.fn((res, err) => res.status(500).json({ error: err.message })),
}));

vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(() => ({ from: vi.fn() })),
}));

vi.mock('./job-processor.js', () => ({
  processNextJob: vi.fn(async () => ({ processed: 1, job_id: 'j1', status: 'done' })),
}));

import handler from './webhook-process.js';
import { processNextJob } from './job-processor.js';

// ── Helpers ───────────────────────────────────────────────────────

const SECRET = 'test-webhook-secret-32chars-long!';

function makeReq({ method = 'POST', body = {}, token = SECRET, badToken = false } = {}) {
  return {
    method,
    headers: badToken ? { 'x-webhook-token': 'wrong-token' } : { 'x-webhook-token': token },
    body,
  };
}

function makeRes() {
  const res = {
    _status: null,
    _body: null,
    setHeader: vi.fn(),
    status(code) { res._status = code; return res; },
    json(data) { res._body = data; return res; },
    end() { return res; },
  };
  return res;
}

// ── Tests ─────────────────────────────────────────────────────────

describe('webhook-process handler', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_WEBHOOK_SECRET', SECRET);
    vi.clearAllMocks();
  });

  it('rejects non-POST requests', async () => {
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  it('rejects requests with invalid token', async () => {
    const req = makeReq({ badToken: true });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it('rejects requests when SUPABASE_WEBHOOK_SECRET is not set', async () => {
    vi.stubEnv('SUPABASE_WEBHOOK_SECRET', '');
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it('skips non-INSERT events', async () => {
    const body = { type: 'UPDATE', table: 'agent_jobs' };
    const req = makeReq({ body });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body.skipped).toBe(true);
    expect(processNextJob).not.toHaveBeenCalled();
  });

  it('skips events on other tables', async () => {
    const body = { type: 'INSERT', table: 'users' };
    const req = makeReq({ body });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._body.skipped).toBe(true);
  });

  it('processes INSERT on agent_jobs and passes job ID to processNextJob', async () => {
    const body = { type: 'INSERT', table: 'agent_jobs', record: { id: 'j1' } };
    const req = makeReq({ body });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(processNextJob).toHaveBeenCalledOnce();
    // Verify the specific job ID from the webhook payload is passed through
    expect(processNextJob).toHaveBeenCalledWith(expect.anything(), null, 'j1');
    expect(res._body.processed).toBe(1);
    expect(res._body.status).toBe('done');
  });

  it('falls back to null jobId when record is missing', async () => {
    const body = { type: 'INSERT', table: 'agent_jobs' };
    const req = makeReq({ body });
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(processNextJob).toHaveBeenCalledWith(expect.anything(), null, null);
  });
});
