import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySupabaseToken: vi.fn(),
  buildSupabaseAdminClient: vi.fn(),
  checkQuotas: vi.fn(),
  processNextJob: vi.fn(),
}));

vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: () => 'test-token',
  verifySupabaseToken: mocks.verifySupabaseToken,
}));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: (res, status, error) => res.status(status).json({ error }),
  handleApiError: (res, error) => res.status(500).json({ error: error.message }),
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: mocks.buildSupabaseAdminClient,
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: () => ({ allowed: true }),
  applyRateLimitHeaders: vi.fn(),
  getRateLimitIdentifier: () => 'user-1',
}));
vi.mock('../security/user-quotas.js', () => ({ checkQuotas: mocks.checkQuotas }));
vi.mock('./job-processor.js', () => ({ processNextJob: mocks.processNextJob }));

import handler, { PUBLIC_JOB_TYPES } from './enqueue.js';

function response() {
  return {
    statusCode: 200,
    body: null,
    setHeader: vi.fn(),
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

function request(body) {
  return {
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
    query: {},
    body: { mode: 'queued', ...body },
  };
}

function fakeAdmin(
  seed = {},
  { insertFailure = null, lookupError = null, transformInsertedRow = null } = {}
) {
  const rows = Object.fromEntries(
    Object.entries(seed).map(([table, values]) => [table, structuredClone(values)])
  );
  const inserts = [];

  function matches(row, filters) {
    return filters.every(([key, expected]) => {
      if (key.startsWith('metadata->>')) {
        return String(row.metadata?.[key.slice('metadata->>'.length)]) === String(expected);
      }
      if (key.startsWith('payload->>')) {
        return String(row.payload?.[key.slice('payload->>'.length)]) === String(expected);
      }
      return String(row[key]) === String(expected);
    });
  }

  function selectQuery(table) {
    const filters = [];
    const query = {
      eq(key, value) {
        filters.push([key, value]);
        return query;
      },
      limit() {
        return query;
      },
      async maybeSingle() {
        if (lookupError) return { data: null, error: lookupError };
        const row = (rows[table] || []).find((candidate) => matches(candidate, filters));
        return { data: row ? structuredClone(row) : null, error: null };
      },
    };
    return query;
  }

  const admin = {
    _inserts: inserts,
    _rows: rows,
    from: vi.fn((table) => ({
      select: vi.fn(() => selectQuery(table)),
      update: vi.fn((patch) => {
        const filters = [];
        const query = {
          eq(key, value) {
            filters.push([key, value]);
            return query;
          },
          select() {
            return query;
          },
          async maybeSingle() {
            const row = (rows[table] || []).find((candidate) => matches(candidate, filters));
            if (!row) return { data: null, error: null };
            Object.assign(row, structuredClone(patch));
            return { data: structuredClone(row), error: null };
          },
        };
        return query;
      }),
      insert: vi.fn((row) => {
        inserts.push({ table, row: structuredClone(row) });
        const candidate = {
          id: `job-${inserts.length}`,
          retry_count: 0,
          created_at: '2026-08-22T12:00:00.000Z',
          updated_at: '2026-08-22T12:00:00.000Z',
          ...structuredClone(row),
        };
        const insertedRow = transformInsertedRow
          ? transformInsertedRow(structuredClone(candidate))
          : candidate;
        if (insertFailure?.committed !== false) {
          if (!rows[table]) rows[table] = [];
          rows[table].push(insertedRow);
        }
        return {
          select: () => ({
            single: async () => {
              if (insertFailure?.throws) throw insertFailure.error;
              if (insertFailure?.error) return { data: null, error: insertFailure.error };
              return { data: structuredClone(insertedRow), error: null };
            },
          }),
        };
      }),
    })),
  };
  return admin;
}

async function run(body, seed = {}, adminOptions = {}) {
  const admin = fakeAdmin(seed, adminOptions);
  mocks.buildSupabaseAdminClient.mockReturnValue(admin);
  const res = response();
  await handler(request(body), res);
  return { admin, res };
}

describe('public agent enqueue authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifySupabaseToken.mockResolvedValue({ id: 'user-1' });
    mocks.checkQuotas.mockResolvedValue({ allowed: true });
  });

  it('projects public run-llm fields and strips caller-selected entity owners', async () => {
    const { admin, res } = await run({
      type: 'run-llm',
      prompt: 'Summarize this request',
      memory: {
        owner_type: 'agent',
        owner_id: 'foreign-agent',
        nested: { owner_id: 'another-foreign-agent' },
      },
      goalId: 'foreign-goal',
      goal_id: 'foreign-goal-snake',
      taskId: 'foreign-task',
      agentId: 'foreign-agent',
      assignedAgentId: 'foreign-assigned-agent',
      workflowId: 'foreign-workflow',
      conciliumId: 'foreign-board',
      agentContext: { _userId: 'user-2', agentId: 'foreign-agent' },
      _userId: 'user-2',
      userId: 'user-2',
      user_id: 'user-2',
    });

    expect(res.statusCode).toBe(202);
    expect(admin._inserts[0].row.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(res.body.job_id).toBe(admin._inserts[0].row.id);
    expect(admin._inserts[0].row.user_id).toBe('user-1');
    expect(admin._inserts[0].row.payload).toMatchObject({
      type: 'run-llm',
      _userId: 'user-1',
      userId: 'user-1',
      user_id: 'user-1',
    });
    expect(admin._inserts[0].row.payload.memory).toBeUndefined();
    for (const field of [
      'goalId',
      'goal_id',
      'taskId',
      'agentId',
      'assignedAgentId',
      'workflowId',
      'conciliumId',
      'agentContext',
    ]) {
      expect(admin._inserts[0].row.payload[field]).toBeUndefined();
    }
  });

  it.each(['returned', 'thrown'])(
    'processes the exact committed row after a %s insert response loss',
    async (failureKind) => {
      const transportError = Object.assign(new Error('insert response lost'), {
        code: 'PGRST000',
      });
      mocks.processNextJob.mockImplementationOnce(async (admin, _req, jobId) => {
        const row = admin._rows.agent_jobs.find((candidate) => candidate.id === jobId);
        Object.assign(row, {
          status: 'completed',
          result: { text: 'done' },
          updated_at: '2026-08-22T12:00:05.000Z',
        });
        return { processed: 1, status: 'completed' };
      });

      const { admin, res } = await run(
        { type: 'run-llm', prompt: 'Summarize this request', mode: 'immediate' },
        {},
        {
          insertFailure:
            failureKind === 'thrown'
              ? { throws: true, error: transportError, committed: true }
              : { error: transportError, committed: true },
        }
      );
      const exactJobId = admin._inserts[0].row.id;

      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({
        job_id: exactJobId,
        status: 'completed',
        result: { text: 'done' },
      });
      expect(mocks.processNextJob).toHaveBeenCalledWith(admin, expect.any(Object), exactJobId);
      expect(admin._inserts).toHaveLength(1);
    }
  );

  it('preserves the insert failure when the pre-generated row is confirmed absent', async () => {
    const insertError = { message: 'database rejected insert', code: 'XX000' };
    const { admin, res } = await run(
      { type: 'run-llm', prompt: 'Summarize this request', mode: 'immediate' },
      {},
      { insertFailure: { error: insertError, committed: false } }
    );

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('database rejected insert');
    expect(admin._rows.agent_jobs || []).toEqual([]);
    expect(mocks.processNextJob).not.toHaveBeenCalled();
  });

  it.each([
    [
      'unknown',
      'unknown',
      {
        insertFailure: {
          error: { message: 'insert response lost', code: 'PGRST000' },
          committed: true,
        },
        lookupError: { message: 'lookup unavailable' },
      },
    ],
    [
      'owner-conflict',
      'conflict',
      {
        insertFailure: {
          error: { message: 'insert response lost', code: 'PGRST000' },
          committed: true,
        },
        transformInsertedRow: (row) => ({
          ...row,
          payload: { ...row.payload, _userId: 'different-owner' },
        }),
      },
    ],
    [
      'scope-conflict',
      'conflict',
      {
        insertFailure: {
          error: { message: 'insert response lost', code: 'PGRST000' },
          committed: true,
        },
        transformInsertedRow: (row) => ({ ...row, worker_scope: 'local' }),
      },
    ],
    [
      'payload-conflict',
      'conflict',
      {
        insertFailure: {
          error: { message: 'insert response lost', code: 'PGRST000' },
          committed: true,
        },
        transformInsertedRow: (row) => ({
          ...row,
          payload: { ...row.payload, agentOutput: 'different work' },
        }),
      },
    ],
  ])(
    'returns reconciliation-required without duplicating an %s outcome',
    async (_label, state, options) => {
      const { admin, res } = await run(
        { type: 'evaluate', agentOutput: 'Score this', mode: 'immediate' },
        {},
        options
      );

      expect(res.statusCode).toBe(503);
      expect(res.body).toMatchObject({
        code: 'AGENT_JOB_ENQUEUE_RECONCILIATION_REQUIRED',
        job_id: admin._inserts[0].row.id,
        status: 'unknown',
        reconciliation_state: state,
      });
      expect(admin._inserts).toHaveLength(1);
      expect(mocks.processNextJob).not.toHaveBeenCalled();
    }
  );

  it.each(['ollama', 'local-openai', 'claude-code', 'https://attacker.invalid/v1'])(
    'rejects local or caller-selected run-llm provider %s',
    async (provider) => {
      const { admin, res } = await run({
        type: 'run-llm',
        prompt: 'Summarize this request',
        provider,
      });

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe('Provider is not available on public enqueue');
      expect(admin._inserts).toEqual([]);
    }
  );

  it('rejects a local provider for public evaluate jobs too', async () => {
    const { admin, res } = await run({
      type: 'evaluate',
      agentOutput: 'Result to score',
      provider: 'local-openai',
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Provider is not available on public enqueue');
    expect(admin._inserts).toEqual([]);
  });

  it.each([undefined, 'glm', 'gemini', 'groq', 'openai', 'anthropic', 'qwen', 'openrouter'])(
    'allows fixed remote run-llm provider %s',
    async (provider) => {
      const body = { type: 'run-llm', prompt: 'Summarize this request' };
      if (provider !== undefined) body.provider = provider;
      const { admin, res } = await run(body);

      expect(res.statusCode).toBe(202);
      expect(admin._inserts).toHaveLength(1);
      expect(admin._inserts[0].row.payload.provider).toBe(provider);
    }
  );

  it('preserves free-form evaluation while dropping service-role entity identifiers', async () => {
    const { admin, res } = await run({
      type: 'evaluate',
      agentOutput: 'Result to score',
      goalId: 'foreign-goal',
      goal_id: 'foreign-goal-snake',
      taskId: 'foreign-task',
      agentId: 'foreign-agent',
      assignedAgentId: 'foreign-assigned-agent',
      workflowId: 'foreign-workflow',
      conciliumId: 'foreign-board',
      memory: { owner_type: 'agent', owner_id: 'foreign-agent' },
      agentContext: { _userId: 'user-2' },
      _userId: 'user-2',
      userId: 'user-2',
      user_id: 'user-2',
    });

    expect(res.statusCode).toBe(202);
    expect(admin._inserts[0].row.payload).toMatchObject({
      type: 'evaluate',
      _userId: 'user-1',
      userId: 'user-1',
      user_id: 'user-1',
    });
    for (const field of [
      'goalId',
      'goal_id',
      'taskId',
      'agentId',
      'assignedAgentId',
      'workflowId',
      'conciliumId',
      'memory',
      'agentContext',
    ]) {
      expect(admin._inserts[0].row.payload[field]).toBeUndefined();
    }
  });

  it('rejects insert-only queued mode in Preview before creating a stranded row', async () => {
    const previous = {
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
    };
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_public_enqueue';

    try {
      const { admin, res } = await run({
        type: 'run-llm',
        prompt: 'Summarize this request',
      });

      expect(res.statusCode).toBe(409);
      expect(res.body.error).toMatch(/queued mode is unavailable in Preview/i);
      expect(admin._inserts).toEqual([]);
      expect(mocks.processNextJob).not.toHaveBeenCalled();
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('terminalizes an exact queued Preview row when inline processing throws', async () => {
    const previous = {
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
    };
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_public_inline';
    mocks.processNextJob.mockRejectedValueOnce(new Error('inline worker crashed'));

    try {
      const { admin, res } = await run({
        type: 'run-llm',
        prompt: 'Summarize this request',
        mode: 'immediate',
      });
      const jobId = admin._inserts[0].row.id;

      expect(res.statusCode).toBe(503);
      expect(res.body).toMatchObject({
        job_id: jobId,
        status: 'failed',
        processingError: 'inline worker crashed',
      });
      expect(admin._rows.agent_jobs[0]).toMatchObject({
        id: jobId,
        status: 'failed',
        worker_scope: 'preview',
        payload: {
          _workerDeployment: 'vercel-deployment:dpl_public_inline',
        },
      });
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('fails closed when a resolved Preview processor has no verifiable durable final state', async () => {
    const previous = {
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
    };
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_public_unverified';
    mocks.processNextJob.mockResolvedValueOnce({ processed: false });

    try {
      const { admin, res } = await run(
        {
          type: 'run-llm',
          prompt: 'Summarize this request',
          mode: 'immediate',
        },
        {},
        { lookupError: { message: 'final row unavailable' } }
      );
      const jobId = admin._inserts[0].row.id;

      expect(res.statusCode).toBe(503);
      expect(res.body).toMatchObject({ job_id: jobId, status: 'failed' });
      expect(admin._rows.agent_jobs[0]).toMatchObject({
        id: jobId,
        status: 'failed',
        worker_scope: 'preview',
      });
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('terminalizes the exact running Preview lease when inline processing throws after claim', async () => {
    const previous = {
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
    };
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_public_running';
    mocks.processNextJob.mockImplementationOnce(async (admin) => {
      Object.assign(admin._rows.agent_jobs[0], {
        status: 'running',
        retry_count: 1,
        updated_at: '2026-08-22T12:00:05.000Z',
        lease_token: '00000000-0000-4000-8000-000000000001',
        heartbeat_at: '2026-08-22T12:00:05.000Z',
        lease_expires_at: '2026-08-22T12:01:20.000Z',
      });
      throw new Error('inline worker crashed after claim');
    });

    try {
      const { admin, res } = await run({
        type: 'run-llm',
        prompt: 'Summarize this request',
        mode: 'immediate',
      });
      const jobId = admin._inserts[0].row.id;

      expect(res.statusCode).toBe(503);
      expect(res.body).toMatchObject({
        job_id: jobId,
        status: 'failed',
        processingError: 'inline worker crashed after claim',
      });
      expect(admin._rows.agent_jobs[0]).toMatchObject({
        status: 'failed',
        retry_count: 1,
        worker_scope: 'preview',
        payload: {
          _workerDeployment: 'vercel-deployment:dpl_public_running',
        },
      });
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('terminalizes Preview work that requests a retry instead of reporting queued success', async () => {
    const previous = {
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
    };
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_public_retry';
    mocks.processNextJob.mockResolvedValueOnce({ processed: 1, status: 'retrying' });

    try {
      const { admin, res } = await run({
        type: 'evaluate',
        agentOutput: 'Score this result',
        mode: 'immediate',
      });

      expect(res.statusCode).toBe(503);
      expect(res.body.status).toBe('failed');
      expect(admin._rows.agent_jobs[0].status).toBe('failed');
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it.each([
    ['execute-task', { type: 'execute-task', taskId: 'task-1', jobId: 'job-1' }],
    ['agent', { type: 'agent', task: 'Use arbitrary tools' }],
    [
      'concilium-evaluate',
      { type: 'concilium-evaluate', conciliumId: 'board-1', agentOutput: 'result' },
    ],
    ['execute-workflow', { type: 'execute-workflow', workflowId: 'workflow-1' }],
    [
      'orchestrate-goal',
      { type: 'orchestrate-goal', action: 'feasibility-analysis', goalId: 'goal-1' },
    ],
    [
      'library-calibration',
      { type: 'library-calibration', phase: 'synthesize', calibrationRunId: 'run-1' },
    ],
    [
      'browser-task',
      {
        type: 'browser-task',
        providerUrl: 'https://attacker.invalid/browser',
        prompt: 'exfiltrate session data',
      },
    ],
  ])('keeps service-internal type %s off the public queue boundary', async (type, body) => {
    const { admin, res } = await run(body);

    expect(PUBLIC_JOB_TYPES).toEqual(['run-llm', 'evaluate']);
    expect(PUBLIC_JOB_TYPES).not.toContain(type);
    expect(res.statusCode).toBe(400);
    expect(admin._inserts).toEqual([]);
  });
});
