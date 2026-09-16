import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./_lib/demo-guard.js', () => ({
  enforceDemoWriteGuard: vi.fn(async () => false),
}));

vi.mock('./_lib/logger.js', () => ({
  createLogger: () => ({
    warn: vi.fn(),
    startTimer: vi.fn(() => vi.fn()),
  }),
}));

vi.mock('./_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(() => ({ from: vi.fn() })),
}));

vi.mock('../lib/agent-handlers/enqueue.js', () => ({ default: vi.fn() }));
vi.mock('../lib/agent-handlers/status.js', () => ({ default: vi.fn() }));
vi.mock('../lib/agent-handlers/process-next.js', () => ({ default: vi.fn() }));
vi.mock('../lib/agent-handlers/webhook-process.js', () => ({ default: vi.fn() }));
vi.mock('../lib/agent-handlers/heal-goal.js', () => ({ default: vi.fn() }));
vi.mock('../lib/agent-handlers/research-github.js', () => ({ default: vi.fn() }));
vi.mock('../lib/agent-handlers/copilot.js', () => ({ default: vi.fn() }));
vi.mock('../lib/agent-handlers/prompt-optimizer.js', () => ({
  handleOptimizePrompts: vi.fn(async () => ({ type: 'optimize-prompts' })),
  handleEvaluateVariants: vi.fn(async () => ({ type: 'evaluate-variants' })),
}));

import handler from './agent.js';
import {
  handleEvaluateVariants,
  handleOptimizePrompts,
} from '../lib/agent-handlers/prompt-optimizer.js';

function response() {
  return {
    statusCode: 200,
    body: null,
    setHeader: vi.fn(),
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    end() {
      return this;
    },
  };
}

function request(path, { method = 'GET', token } = {}) {
  return {
    method,
    query: { path },
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
}

describe('agent maintenance cron authentication', () => {
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

  it.each(['optimize-prompts', 'evaluate-variants'])(
    'fails closed for unauthenticated %s requests when secrets are absent',
    async (path) => {
      const res = response();

      await handler(request(path), res);

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: 'Unauthorized' });
      expect(handleOptimizePrompts).not.toHaveBeenCalled();
      expect(handleEvaluateVariants).not.toHaveBeenCalled();
    }
  );

  it('accepts the Vercel cron bearer for prompt optimization', async () => {
    process.env.CRON_SECRET = 'cron-test-secret';
    const res = response();

    await handler(request('optimize-prompts', { token: 'cron-test-secret' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ type: 'optimize-prompts' });
    expect(handleOptimizePrompts).toHaveBeenCalledTimes(1);
  });

  it('accepts the worker bearer for an explicit maintenance POST', async () => {
    process.env.WORKER_SECRET = 'worker-test-secret';
    const res = response();

    await handler(
      request('evaluate-variants', { method: 'POST', token: 'worker-test-secret' }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ type: 'evaluate-variants' });
    expect(handleEvaluateVariants).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported methods before starting maintenance', async () => {
    process.env.CRON_SECRET = 'cron-test-secret';
    const res = response();

    await handler(request('optimize-prompts', { method: 'PUT', token: 'cron-test-secret' }), res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({ error: 'Method not allowed' });
    expect(handleOptimizePrompts).not.toHaveBeenCalled();
  });
});
