import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all dependencies
vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: (res, code, msg) => res.status(code).json({ error: msg }),
  handleApiError: (res, err) => res.status(500).json({ error: err.message }),
}));
vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), startTimer: () => (meta) => meta }),
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: vi.fn(),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
}));

const mockNavigate = vi.fn();
const mockFillAndSubmit = vi.fn();
vi.mock('../browser/browserless-client.js', () => ({
  navigate: (...args) => mockNavigate(...args),
  fillAndSubmit: (...args) => mockFillAndSubmit(...args),
}));

const mockDetectCaptcha = vi.fn().mockReturnValue({ type: null, siteKey: null });
const mockSolveRecaptcha = vi.fn();
const mockSolveHcaptcha = vi.fn();
vi.mock('../browser/captcha-solver.js', () => ({
  detectCaptcha: (...args) => mockDetectCaptcha(...args),
  solveRecaptcha: (...args) => mockSolveRecaptcha(...args),
  solveHcaptcha: (...args) => mockSolveHcaptcha(...args),
}));

const mockCreateEmail = vi.fn();
const mockCheckInbox = vi.fn();
const mockReadMessage = vi.fn();
vi.mock('../browser/temp-email.js', () => ({
  createEmail: (...args) => mockCreateEmail(...args),
  checkInbox: (...args) => mockCheckInbox(...args),
  readMessage: (...args) => mockReadMessage(...args),
  extractVerificationLink: vi.fn().mockReturnValue(null),
}));

const mockDetectsPhone = vi.fn().mockReturnValue(false);
const mockRentNumber = vi.fn();
const mockWaitForSms = vi.fn();
const mockReleaseNumber = vi.fn();
vi.mock('../browser/sms-verify-client.js', () => ({
  detectsPhoneVerification: (...a) => mockDetectsPhone(...a),
  rentNumber: (...a) => mockRentNumber(...a),
  waitForSms: (...a) => mockWaitForSms(...a),
  releaseNumber: (...a) => mockReleaseNumber(...a),
}));

vi.mock('../agent-handlers/llm-executor.js', () => ({
  executeLlm: vi.fn().mockResolvedValue({ content: '{"error":"no key"}' }),
  parseLlmJson: (txt) => {
    try {
      return JSON.parse(txt);
    } catch {
      return null;
    }
  },
}));

// browser-task now routes its LLM fallback through the tracked wrapper. Stub it
// with the same return shape as the bare executor so the LLM fallback still
// yields "no key" and no real usage recording runs against the mock admin.
vi.mock('../usage-handlers/tracked-llm.js', () => ({
  executeLlmTracked: vi.fn().mockResolvedValue({ content: '{"error":"no key"}' }),
}));

const {
  mockResolveToolCredential,
  mockSaveUserApiKey,
  mockTriggerProcessNext,
  mockLoadToolCredentialSnapshot,
  mockReserveToolCredentialWrite,
} = vi.hoisted(() => ({
  mockResolveToolCredential: vi.fn(),
  mockSaveUserApiKey: vi.fn(),
  mockTriggerProcessNext: vi.fn(),
  mockLoadToolCredentialSnapshot: vi.fn(),
  mockReserveToolCredentialWrite: vi.fn(),
}));
vi.mock('../agent-handlers/tool-credentials.js', () => ({
  resolveToolCredential: mockResolveToolCredential,
}));
vi.mock('../api-handlers/_shared/save-user-api-key.js', () => ({
  saveUserApiKey: mockSaveUserApiKey,
}));
vi.mock('../api-handlers/_shared/tool-credential-write-reservation.js', () => ({
  loadToolCredentialSnapshot: mockLoadToolCredentialSnapshot,
  reserveToolCredentialWrite: mockReserveToolCredentialWrite,
}));
vi.mock('../goal-handlers/_helpers.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    triggerProcessNext: (...args) => mockTriggerProcessNext(...args),
  };
});

import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { checkRateLimit } from '../../api/_lib/rate-limit.js';
import handler from './browser-task.js';

function mockReq(body = {}, headers = {}) {
  return {
    method: 'POST',
    body,
    headers: { authorization: 'Bearer test-secret', ...headers },
    query: {},
  };
}

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.body = data;
    return res;
  };
  res.end = () => res;
  return res;
}

function mockAdmin() {
  let currentTable = null;
  let lastUpdate = null;
  let currentUpdate = null;
  let currentSelect = null;
  let currentConditions = [];
  let currentContains = [];
  let maybeSingleInterceptor = null;
  const recorded = { inserts: {}, updates: {} };
  const browserTaskRuns = new Map();
  const chain = {};
  const syncQuery = (state) => {
    currentTable = state.table;
    currentUpdate = state.update;
    currentSelect = state.select;
    currentConditions = [...state.conditions];
    currentContains = [...state.contains];
  };
  const captureQuery = (state) => {
    state.update = currentUpdate;
    state.select = currentSelect;
    state.conditions = [...currentConditions];
    state.contains = [...currentContains];
  };
  const makeQuery = (table) => {
    const state = { table, update: null, select: null, conditions: [], contains: [] };
    const query = {};
    const normalizeTypedFixture = (response) => {
      const typedBrowserQuery = state.conditions.some(
        ([field, value]) => field === 'payload->>type' && value === 'browser-task'
      );
      if (
        typedBrowserQuery &&
        response?.data?.payload &&
        !Object.hasOwn(response.data.payload, 'type')
      ) {
        return {
          ...response,
          data: {
            ...response.data,
            payload: { type: 'browser-task', ...response.data.payload },
          },
        };
      }
      return response;
    };
    for (const method of [
      'select',
      'update',
      'insert',
      'eq',
      'gt',
      'in',
      'order',
      'limit',
      'contains',
      'single',
      'maybeSingle',
      'catch',
    ]) {
      query[method] = (...args) => {
        syncQuery(state);
        const result = chain[method](...args);
        captureQuery(state);
        if (['single', 'maybeSingle'].includes(method) && result?.then) {
          return result.then(normalizeTypedFixture);
        }
        return result === chain ? query : result;
      };
    }
    query.then = (onFulfilled, onRejected) => {
      syncQuery(state);
      return chain.then((result) => {
        captureQuery(state);
        return onFulfilled ? onFulfilled(result) : result;
      }, onRejected);
    };
    return query;
  };
  // Each Supabase `from()` call owns an independent builder in production.
  // Preserve that contract here so lease assertions cannot mutate a deferred
  // guarded write's table/filters while the write awaits its live-lease check.
  chain.from = vi.fn((table) => makeQuery(table));
  chain.select = vi.fn((columns) => {
    currentSelect = columns;
    return chain;
  });
  chain.update = vi.fn((payload) => {
    lastUpdate = payload;
    currentUpdate = payload;
    recorded.updates[currentTable] ||= [];
    recorded.updates[currentTable].push(payload);
    return chain;
  });
  chain.insert = vi.fn((payload) => {
    if (chain._insertErrors?.[currentTable]) {
      throw chain._insertErrors[currentTable];
    }
    recorded.inserts[currentTable] ||= [];
    recorded.inserts[currentTable].push(payload);
    if (currentTable === 'browser_task_runs' && payload?.id) {
      browserTaskRuns.set(payload.id, structuredClone(payload));
    }
    if (chain._insertAfterCommitErrors?.[currentTable]) {
      throw chain._insertAfterCommitErrors[currentTable];
    }
    return chain;
  });
  chain.eq = vi.fn((field, value) => {
    currentConditions.push([field, value]);
    return chain;
  });
  chain.gt = vi.fn((field, value) => {
    currentConditions.push([field, value, 'gt']);
    return chain;
  });
  chain.in = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.contains = vi.fn((field, value) => {
    currentContains.push([field, value]);
    return chain;
  });
  chain.single = vi.fn();
  chain.maybeSingle = vi.fn();
  chain.catch = vi.fn(() => chain);
  // Await-ing the chain yields an empty list by default (overridable per-test).
  chain.then = (onFulfilled) => Promise.resolve({ data: [], error: null }).then(onFulfilled);
  chain._recorded = recorded;
  chain._insertErrors = {};
  chain._insertAfterCommitErrors = {};
  chain._interceptMaybeSingle = (interceptor) => {
    maybeSingleInterceptor = interceptor;
  };
  // Default: successful job claim
  chain.single.mockImplementation(async () => {
    if (currentTable === 'browser_task_runs') {
      const inserted = recorded.inserts.browser_task_runs?.at(-1);
      return { data: inserted ? structuredClone(inserted) : null, error: null };
    }
    if (currentTable === 'tools') {
      return {
        data: {
          id: 'tool-github',
          name: 'GitHub',
          data: {},
          status: 'needs_setup',
          updated_at: '2026-08-22T12:00:00.000Z',
        },
        error: null,
      };
    }
    return {
      data: {
        id: 'job-1',
        user_id: 'user-1',
        payload: {
          type: 'browser-task',
          providerUrl: 'https://provider.com/signup',
          targetToolId: 'tool-github',
          _userId: 'user-1',
        },
        status: 'running',
        retry_count: 0,
        worker_scope: 'production',
        updated_at: '2026-08-22T12:00:00.000Z',
        ...structuredClone(lastUpdate || {}),
      },
      error: null,
    };
  });
  chain.maybeSingle.mockImplementation(async () => {
    const query = {
      table: currentTable,
      patch: currentUpdate,
      select: currentSelect,
      conditions: [...currentConditions],
      contains: [...currentContains],
    };
    if (maybeSingleInterceptor) {
      const intercepted = await maybeSingleInterceptor(query);
      if (intercepted !== undefined) return intercepted;
    }
    if (currentTable === 'browser_task_runs') {
      const id = currentConditions.find(([field]) => field === 'id')?.[1];
      const current = id
        ? browserTaskRuns.get(id) || null
        : [...browserTaskRuns.values()].find((candidate) =>
            currentConditions.every(([field, value]) => candidate[field] === value)
          ) || null;
      const matches =
        current &&
        currentConditions.every(([field, value]) => {
          if (field === 'updated_at') {
            return Date.parse(current[field]) === Date.parse(value);
          }
          return current[field] === value;
        });
      if (!matches) return { data: null, error: null };
      if (currentUpdate) {
        const updated = { ...current, ...structuredClone(currentUpdate) };
        browserTaskRuns.set(id, updated);
        return { data: structuredClone(updated), error: null };
      }
      return { data: structuredClone(current), error: null };
    }
    if (currentTable === 'agent_jobs' && !currentUpdate) {
      const id = currentConditions.find(([field]) => field === 'id')?.[1];
      const inserted = (recorded.inserts.agent_jobs || []).find((row) => row.id === id);
      if (inserted) return { data: structuredClone(inserted), error: null };
    }
    if (currentTable === 'agent_jobs') {
      const claim = (recorded.updates.agent_jobs || []).find(
        (candidate) => candidate.status === 'running' && candidate.lease_token
      );
      return {
        data: {
          id: 'job-1',
          user_id: 'user-1',
          payload: {
            providerUrl: 'https://provider.com/signup',
            targetToolId: 'tool-github',
            _userId: 'user-1',
          },
          status: 'running',
          retry_count: 0,
          worker_scope: 'production',
          updated_at: claim?.updated_at || '2026-08-22T12:00:00.000Z',
          error: null,
          ...(claim || {}),
          ...(currentUpdate || {}),
        },
        error: null,
      };
    }
    return {
      data: { id: 'job-1', updated_at: lastUpdate?.updated_at },
      error: null,
    };
  });
  chain._browserTaskRuns = browserTaskRuns;
  return chain;
}

function staleLeaseAdmin() {
  let row = {
    id: 'job-1',
    user_id: 'user-1',
    status: 'queued',
    retry_count: 1,
    worker_scope: 'production',
    updated_at: '2026-08-22T12:00:00.000Z',
    payload: { type: 'browser-task', _userId: 'user-1' },
  };
  let table = null;
  let patch = null;
  let conditions = [];
  let claimReturned = false;

  const chain = {
    from: vi.fn((nextTable) => {
      table = nextTable;
      patch = null;
      conditions = [];
      return chain;
    }),
    update: vi.fn((nextPatch) => {
      patch = nextPatch;
      return chain;
    }),
    eq: vi.fn((field, value) => {
      conditions.push([field, value]);
      return chain;
    }),
    gt: vi.fn(() => chain),
    select: vi.fn(() => chain),
    single: vi.fn(async () => {
      if (table !== 'agent_jobs' || claimReturned) return { data: null, error: null };
      const matches = conditions.every(([field, value]) =>
        field === 'payload->>type' ? row.payload?.type === value : row[field] === value
      );
      if (!matches) return { data: null, error: null };
      row = { ...row, ...patch };
      const claimed = { ...row, payload: { ...row.payload } };
      claimReturned = true;

      // Simulate the stale sweeper requeueing A and a retry worker claiming B
      // before invocation A attempts its terminal transition.
      row = {
        ...row,
        status: 'running',
        retry_count: 2,
        updated_at: '2026-08-22T12:01:00.000Z',
        lease_token: '00000000-0000-4000-8000-000000000002',
        heartbeat_at: '2026-08-22T12:01:00.000Z',
        lease_expires_at: '2026-08-22T12:02:15.000Z',
      };
      return { data: claimed, error: null };
    }),
    maybeSingle: vi.fn(async () => {
      if (table !== 'agent_jobs') return { data: null, error: null };
      const matches = conditions.every(([field, value]) =>
        field === 'payload->>type' ? row.payload?.type === value : row[field] === value
      );
      if (!matches) return { data: null, error: null };
      row = { ...row, ...patch };
      return { data: { id: row.id }, error: null };
    }),
  };
  chain._getRow = () => ({ ...row, payload: { ...row.payload } });
  return chain;
}

// Wire credentials into the select('id, data') chain used by loadBrowserCredentials.
function setupCreds(admin, browserKey = 'bl-key', captchaKey = 'cap-key', smsKey = 'sms-key') {
  mockResolveToolCredential.mockImplementation(async ({ def }) => {
    const values = {
      'tool-browser': browserKey,
      'tool-captcha-solver': captchaKey,
      'tool-sms-verify': smsKey,
    };
    const apiKey = values[def.id] || null;
    return { source: apiKey ? 'user' : 'none', apiKey, ready: !!apiKey };
  });
  admin.select.mockImplementation(function (cols) {
    if (cols === 'id, data') {
      const credResult = {
        data: [
          { id: 'tool-browser', data: {} },
          { id: 'tool-captcha-solver', data: {} },
        ],
      };
      const inner = { eq: vi.fn().mockResolvedValue(credResult), in: vi.fn() };
      inner.in.mockReturnValue(inner);
      return inner;
    }
    return admin;
  });
}

// Drive the email-polling loop past its 3 × 5s waits.
async function advancePastEmailPoll() {
  await vi.advanceTimersByTimeAsync(5000);
  await vi.advanceTimersByTimeAsync(5000);
  await vi.advanceTimersByTimeAsync(5000);
}

// HTML fragment whose first dashboard hop yields an API key matching
// the sk-prefix pattern in extractApiKeyFromHtml.
const DASHBOARD_WITH_KEY = '<html><input value="sk-testkey1234567890abcdef"></html>';
const DASHBOARD_WITHOUT_KEY = '<html><body>No keys visible here.</body></html>';
const SIGNUP_FORM =
  '<form><input name="email"><input type="password"><button type="submit">Sign up</button></form>';

function setupSuccessfulCredentialRegistration(admin, blockedGoals = []) {
  setupCreds(admin);
  admin.then = (onFulfilled) =>
    Promise.resolve({ data: blockedGoals.map((goal) => structuredClone(goal)), error: null }).then(
      onFulfilled
    );
  mockCreateEmail.mockResolvedValueOnce({
    address: 'test@mail.tm',
    password: 'pass',
    token: 'jwt',
  });
  mockNavigate.mockImplementation(async (url) =>
    url.includes('signup')
      ? { html: SIGNUP_FORM, status: 200 }
      : { html: DASHBOARD_WITH_KEY, status: 200 }
  );
  mockFillAndSubmit.mockResolvedValueOnce({ html: '<html>Registered</html>', success: true });
  mockCheckInbox.mockResolvedValue([]);
}

function setupUnrecoverablePhoneTimeout(admin) {
  let credentialsLoaded = false;
  admin.select.mockImplementation(function (cols) {
    if (cols === 'id, data' && !credentialsLoaded) {
      credentialsLoaded = true;
      const credResult = {
        data: [
          { id: 'tool-browser', data: {} },
          { id: 'tool-sms-verify', data: { provider: '5sim' } },
        ],
      };
      const inner = { eq: vi.fn().mockResolvedValue(credResult), in: vi.fn() };
      inner.in.mockReturnValue(inner);
      return inner;
    }
    return admin;
  });
  mockResolveToolCredential.mockImplementation(async ({ def }) => ({
    source: 'user',
    apiKey: def.id === 'tool-browser' ? 'bl-key' : 'sms-key',
    ready: true,
  }));
  mockCreateEmail.mockResolvedValueOnce({
    address: 'test@mail.tm',
    password: 'pass',
    token: 'jwt',
  });
  mockDetectsPhone.mockReturnValue(true);
  mockRentNumber.mockResolvedValueOnce({ activation_id: 'act-1', phone_number: '+15551234567' });
  mockWaitForSms.mockRejectedValueOnce(new Error('SMS verification timeout'));
  mockReleaseNumber.mockResolvedValueOnce(undefined);
  mockNavigate.mockResolvedValueOnce({
    html: '<form><input name="email"><input type="password"><input type="tel" name="phone"><button type="submit">Sign up</button></form>',
    status: 200,
  });
  mockFillAndSubmit.mockResolvedValueOnce({
    html: '<html>Enter phone verification code</html>',
    success: true,
  });
}

async function runRegistrationRequest() {
  const res = mockRes();
  const promise = handler(mockReq({ jobId: 'job-1' }), res);
  await advancePastEmailPoll();
  await promise;
  return res;
}

function conditionValue(query, field) {
  return query.conditions.find(([column]) => column === field)?.[1];
}

function reclaimedBrowserJob(admin, { workerScope = 'production', preview = false } = {}) {
  const claim = admin._recorded.updates.agent_jobs.find(
    (patch) => patch.status === 'running' && patch.lease_token
  );
  return {
    id: 'job-1',
    user_id: 'user-1',
    payload: {
      type: 'browser-task',
      providerUrl: 'https://provider.com/signup',
      targetToolId: 'tool-github',
      _userId: 'user-1',
      ...(preview ? { _workerDeployment: 'vercel-deployment:dpl_preview_a' } : {}),
    },
    status: 'running',
    retry_count: 1,
    worker_scope: workerScope,
    updated_at: '2026-08-22T12:01:00.000Z',
    error: null,
    result: null,
    lease_token: '00000000-0000-4000-8000-000000000099',
    heartbeat_at: claim?.heartbeat_at || new Date().toISOString(),
    lease_expires_at: claim?.lease_expires_at || new Date(Date.now() + 75_000).toISOString(),
  };
}

describe('browser-task handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    process.env.WORKER_SECRET = 'test-secret';
    mockDetectsPhone.mockReturnValue(false);
    mockResolveToolCredential.mockImplementation(async ({ def }) => {
      const apiKey =
        def.id === 'tool-browser' ? 'bl-key' : def.id === 'tool-captcha-solver' ? 'cap-key' : null;
      return { source: apiKey ? 'user' : 'none', apiKey, ready: !!apiKey };
    });
    mockSaveUserApiKey.mockResolvedValue({ success: true, row: { id: 'key-row' } });
    mockLoadToolCredentialSnapshot.mockResolvedValue({
      ok: true,
      snapshot: {
        id: 'tool-github',
        user_id: 'user-1',
        name: 'GitHub',
        data: {},
        status: 'needs_setup',
        connection_type: 'api',
        updated_at: '2026-08-22T12:00:00.000Z',
      },
    });
    mockReserveToolCredentialWrite.mockResolvedValue({
      ok: true,
      reservation: {
        attemptId: 'browser-attempt',
        toolId: 'tool-github',
        userId: 'user-1',
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('returns 401 for unauthorized requests', async () => {
    const req = mockReq({}, { authorization: 'Bearer wrong' });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when jobId is missing', async () => {
    const req = mockReq({});
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 503 when database is not configured', async () => {
    buildSupabaseAdminClient.mockReturnValue(null);
    const req = mockReq({ jobId: 'j1' });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(503);
  });

  it('leases a Production job only from the exact worker scope', async () => {
    const admin = mockAdmin();
    admin.single.mockResolvedValueOnce({ data: null, error: null });
    buildSupabaseAdminClient.mockReturnValue(admin);

    const res = mockRes();
    await handler(mockReq({ jobId: 'job-1' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.processed).toBe(0);
    expect(admin.eq).toHaveBeenCalledWith('worker_scope', 'production');
    expect(admin.eq).toHaveBeenCalledWith('payload->>type', 'browser-task');
    expect(admin.eq).not.toHaveBeenCalledWith('payload->>_workerDeployment', expect.anything());
  });

  it('fails closed when a typed claim unexpectedly returns a non-browser job', async () => {
    const admin = mockAdmin();
    admin.single.mockResolvedValueOnce({
      data: {
        id: 'job-1',
        user_id: 'user-1',
        payload: { type: 'agent-task', _userId: 'user-1' },
        status: 'running',
        retry_count: 0,
        worker_scope: 'production',
        updated_at: '2026-08-22T12:00:00.000Z',
      },
      error: null,
    });
    buildSupabaseAdminClient.mockReturnValue(admin);

    const res = mockRes();
    await handler(mockReq({ jobId: 'job-1' }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({
      code: 'BROWSER_JOB_CLAIM_RECONCILIATION_REQUIRED',
      job_id: 'job-1',
    });
    expect(admin.eq).toHaveBeenCalledWith('payload->>type', 'browser-task');
    expect(admin._recorded.inserts.browser_task_runs).toBeUndefined();
  });

  it('leases a Preview job only from the exact immutable deployment', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_preview_a');
    const admin = mockAdmin();
    admin.single.mockResolvedValueOnce({ data: null, error: null });
    buildSupabaseAdminClient.mockReturnValue(admin);

    const res = mockRes();
    await handler(mockReq({ jobId: 'job-1' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.processed).toBe(0);
    expect(admin.eq).toHaveBeenCalledWith('worker_scope', 'preview');
    expect(admin.eq).toHaveBeenCalledWith(
      'payload->>_workerDeployment',
      'vercel-deployment:dpl_preview_a'
    );
  });

  it('continues after an exact Preview browser claim commits but its response is lost', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_preview_a');
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupCreds(admin);
    admin.single.mockRejectedValueOnce(new Error('claim response lost'));
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table === 'agent_jobs' && !patch) {
        const claimPatch = admin._recorded.updates.agent_jobs[0];
        return {
          data: {
            id: 'job-1',
            user_id: 'user-1',
            payload: {
              providerUrl: 'https://provider.com/signup',
              targetToolId: 'tool-github',
              _userId: 'user-1',
              _workerDeployment: 'vercel-deployment:dpl_preview_a',
            },
            status: 'running',
            retry_count: 0,
            worker_scope: 'preview',
            ...structuredClone(claimPatch),
          },
          error: null,
        };
      }
      return undefined;
    });
    mockCreateEmail.mockResolvedValueOnce({
      address: 'test@mail.tm',
      password: 'pass',
      token: 'jwt',
    });
    mockNavigate.mockImplementation(async (url) =>
      url.includes('signup')
        ? { html: SIGNUP_FORM, status: 200 }
        : { html: DASHBOARD_WITH_KEY, status: 200 }
    );
    mockFillAndSubmit.mockResolvedValueOnce({ html: '<html>Registered</html>', success: true });
    mockCheckInbox.mockResolvedValue([]);

    const res = await runRegistrationRequest();

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ processed: 1, success: true, credentialStored: true });
    expect(mockSaveUserApiKey).toHaveBeenCalledTimes(1);
    expect(admin._recorded.updates.agent_jobs[0]).toMatchObject({
      status: 'running',
      error: null,
      lease_token: expect.any(String),
      heartbeat_at: expect.any(String),
      lease_expires_at: expect.any(String),
    });
  });

  it('retries the exact queued Preview browser claim after a proven pre-commit failure', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_preview_a');
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupSuccessfulCredentialRegistration(admin);
    admin.single
      .mockRejectedValueOnce(new Error('claim failed before commit'))
      .mockResolvedValueOnce({
        data: {
          id: 'job-1',
          user_id: 'user-1',
          payload: {
            providerUrl: 'https://provider.com/signup',
            targetToolId: 'tool-github',
            _userId: 'user-1',
            _workerDeployment: 'vercel-deployment:dpl_preview_a',
          },
          status: 'running',
          retry_count: 0,
          worker_scope: 'preview',
          updated_at: '2026-08-22T12:00:00.000Z',
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: 'job-1' }, error: null });
    let returnedQueuedSnapshot = false;
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table === 'agent_jobs' && !patch && !returnedQueuedSnapshot) {
        returnedQueuedSnapshot = true;
        return {
          data: {
            id: 'job-1',
            payload: {
              providerUrl: 'https://provider.com/signup',
              targetToolId: 'tool-github',
              _userId: 'user-1',
              _workerDeployment: 'vercel-deployment:dpl_preview_a',
            },
            status: 'queued',
            retry_count: 0,
            worker_scope: 'preview',
            updated_at: '2026-08-22T12:00:00.000Z',
            error: null,
          },
          error: null,
        };
      }
      return undefined;
    });

    const res = await runRegistrationRequest();

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ processed: 1, success: true, credentialStored: true });
    expect(mockSaveUserApiKey).toHaveBeenCalledTimes(1);
    const claimUpdates = (admin._recorded.updates.agent_jobs || []).filter(
      (patch) => patch.status === 'running'
    );
    expect(claimUpdates).toHaveLength(2);
    expect(claimUpdates[1].error).toBe(claimUpdates[0].error);
  });

  it('fails closed before leasing when Preview deployment identity is unavailable', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', '');
    vi.stubEnv('VERCEL_URL', '');
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);

    const res = mockRes();
    await handler(mockReq({ jobId: 'job-1' }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe('Preview deployment identity is unavailable');
    expect(admin.update).not.toHaveBeenCalled();
  });

  it('fails closed without marking a row failed when a thrown claim cannot be reconciled', async () => {
    const admin = mockAdmin();
    admin.single.mockRejectedValueOnce(new Error('lease failed'));
    admin._interceptMaybeSingle(({ table, patch }) =>
      table === 'agent_jobs' && !patch
        ? { data: null, error: new Error('claim inspection failed') }
        : undefined
    );
    buildSupabaseAdminClient.mockReturnValue(admin);

    const res = mockRes();
    await handler(mockReq({ jobId: 'job-1' }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({
      code: 'BROWSER_JOB_CLAIM_RECONCILIATION_REQUIRED',
      job_id: 'job-1',
    });
    expect(admin._recorded.updates.agent_jobs).toEqual([
      expect.objectContaining({ status: 'running' }),
    ]);
  });

  it('does not let stale invocation A overwrite newer retry lease B', async () => {
    const admin = staleLeaseAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);

    const res = mockRes();
    await handler(mockReq({ jobId: 'job-1' }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      processed: 0,
      job_id: 'job-1',
      reason: 'Job lease lost',
    });
    expect(admin._getRow()).toMatchObject({
      id: 'job-1',
      status: 'running',
      retry_count: 2,
      updated_at: '2026-08-22T12:01:00.000Z',
    });
    expect(admin.eq).toHaveBeenCalledWith('status', 'running');
    const assertedToken = admin.eq.mock.calls.find(([field]) => field === 'lease_token')?.[1];
    expect(assertedToken).toEqual(expect.any(String));
    expect(assertedToken).not.toBe(admin._getRow().lease_token);
    expect(admin.eq).toHaveBeenCalledWith('worker_scope', 'production');
  });

  it('treats a transition database error as a lost lease', async () => {
    const admin = mockAdmin();
    admin.single.mockResolvedValueOnce({
      data: {
        id: 'job-1',
        user_id: 'user-1',
        payload: { _userId: 'user-1' },
        status: 'running',
        retry_count: 3,
        worker_scope: 'production',
        updated_at: '2026-08-22T12:00:00.000Z',
      },
      error: null,
    });
    admin.maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'database unavailable' },
    });
    buildSupabaseAdminClient.mockReturnValue(admin);

    const res = mockRes();
    await handler(mockReq({ jobId: 'job-1' }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.reason).toBe('Job lease lost');
    expect(admin.eq).toHaveBeenCalledWith(
      'lease_token',
      admin._recorded.updates.agent_jobs[0].lease_token
    );
  });

  it('CAS-fails a rate-limited job using the exact lease snapshot', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    checkRateLimit.mockReturnValueOnce({ allowed: false });

    const res = mockRes();
    await handler(mockReq({ jobId: 'job-1' }), res);

    expect(res.statusCode).toBe(429);
    expect(res.body.error).toBe('Browser task rate limit: max 5 per hour');
    expect(admin.eq).toHaveBeenCalledWith('status', 'running');
    expect(admin.eq).toHaveBeenCalledWith('retry_count', 0);
    expect(admin.eq).toHaveBeenCalledWith(
      'updated_at',
      admin._recorded.updates.agent_jobs[0].updated_at
    );
  });

  it('keeps the exact Preview deployment filter on terminal transitions', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_preview_a');
    const admin = mockAdmin();
    admin.single.mockResolvedValueOnce({
      data: {
        id: 'job-1',
        user_id: 'user-1',
        payload: {
          _userId: 'user-1',
          _workerDeployment: 'vercel-deployment:dpl_preview_a',
        },
        status: 'running',
        retry_count: 0,
        worker_scope: 'preview',
        updated_at: '2026-08-22T12:00:00.000Z',
      },
      error: null,
    });
    buildSupabaseAdminClient.mockReturnValue(admin);

    const res = mockRes();
    await handler(mockReq({ jobId: 'job-1' }), res);

    expect(res.statusCode).toBe(400);
    expect(
      admin.eq.mock.calls.filter(
        ([field, value]) =>
          field === 'payload->>_workerDeployment' && value === 'vercel-deployment:dpl_preview_a'
      )
    ).toHaveLength(2);
  });

  it('terminalizes before external work when the durable browser audit row is absent', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    admin._insertErrors.browser_task_runs = new Error('audit insert rejected');
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table === 'browser_task_runs' && !patch) return { data: null, error: null };
      return undefined;
    });

    const res = await handler(mockReq({ jobId: 'job-1' }), mockRes());

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toBe('Browser task audit run could not be verified');
    expect(mockCreateEmail).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockRentNumber).not.toHaveBeenCalled();
    expect(mockSaveUserApiKey).not.toHaveBeenCalled();
    expect(admin._recorded.updates.agent_jobs).toContainEqual(
      expect.objectContaining({
        status: 'failed',
        error: 'Browser task audit run could not be verified',
      })
    );
  });

  it('surfaces deterministic job and audit ids when prior-run inspection is unknown', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table === 'browser_task_runs' && !patch) {
        return { data: null, error: new Error('audit lookup unavailable') };
      }
      return undefined;
    });

    const res = mockRes();
    await handler(mockReq({ jobId: 'job-1' }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      error: 'Browser task audit run could not be verified',
      code: 'BROWSER_AUDIT_RECONCILIATION_REQUIRED',
      job_id: 'job-1',
      job_state: 'failed',
      audit_run_id: 'job-1',
      audit_state: 'unknown',
    });
    expect(admin._recorded.inserts.browser_task_runs).toBeUndefined();
    expect(mockCreateEmail).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockSaveUserApiKey).not.toHaveBeenCalled();
  });

  it('continues when the exact browser audit insert commits before its response is lost', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupSuccessfulCredentialRegistration(admin);
    admin._insertAfterCommitErrors.browser_task_runs = new Error(
      'audit insert response lost after commit'
    );
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table === 'browser_task_runs' && !patch) {
        const inserted = admin._recorded.inserts.browser_task_runs?.at(-1);
        if (!inserted) return undefined;
        return {
          data: structuredClone(inserted),
          error: null,
        };
      }
      return undefined;
    });

    const res = await runRegistrationRequest();

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ processed: 1, success: true, credentialStored: true });
    expect(mockCreateEmail).toHaveBeenCalledTimes(1);
    expect(mockSaveUserApiKey).toHaveBeenCalledTimes(1);
    expect(admin._recorded.inserts.browser_task_runs[0]).toMatchObject({
      id: 'job-1',
      job_id: 'job-1',
      user_id: 'user-1',
      status: 'running',
    });
  });

  it.each(['running', 'success'])(
    'fails closed on a stale retry with a prior %s run and never repeats external work',
    async (priorStatus) => {
      const admin = mockAdmin();
      buildSupabaseAdminClient.mockReturnValue(admin);
      admin._browserTaskRuns.set('job-1', {
        id: 'job-1',
        job_id: 'job-1',
        user_id: 'user-1',
        target_tool_id: 'tool-github',
        provider_url: 'https://provider.com/signup',
        status: priorStatus,
        steps: [{ step: 'fill-submit', status: 'done' }],
        temp_email: 'prior@mail.tm',
        credential_saved: priorStatus === 'success',
        error: null,
        duration_ms: null,
        created_at: '2026-08-22T12:00:00.000Z',
        updated_at: '2026-08-22T12:00:01.000Z',
      });

      const res = mockRes();
      await handler(mockReq({ jobId: 'job-1' }), res);

      expect(res.statusCode).toBe(503);
      expect(res.body).toMatchObject({
        code: 'BROWSER_PRIOR_RUN_RECONCILIATION_REQUIRED',
        job_id: 'job-1',
        job_state: 'failed',
        audit_run_id: 'job-1',
        audit_state: priorStatus === 'running' ? 'prior-running-committed' : `prior-${priorStatus}`,
      });
      expect(mockCreateEmail).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(mockRentNumber).not.toHaveBeenCalled();
      expect(mockFillAndSubmit).not.toHaveBeenCalled();
      expect(mockSaveUserApiKey).not.toHaveBeenCalled();
      expect(admin._recorded.inserts.browser_task_runs).toBeUndefined();
      expect(admin._recorded.updates.agent_jobs).toContainEqual(
        expect.objectContaining({
          status: 'failed',
          result: expect.objectContaining({
            reconciliation_required: true,
            audit_run_id: 'job-1',
          }),
        })
      );
      if (priorStatus === 'running') {
        expect(admin._browserTaskRuns.get('job-1')).toMatchObject({
          status: 'failed',
          error: 'Prior browser attempt requires reconciliation',
        });
      }
    }
  );

  it('fails closed without mutating a conflicting tenant audit identity', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    const conflictingRun = {
      id: 'job-1',
      job_id: 'job-1',
      user_id: 'user-2',
      target_tool_id: 'tool-github',
      provider_url: 'https://provider.com/signup',
      status: 'running',
      steps: [],
      temp_email: null,
      credential_saved: false,
      error: null,
      duration_ms: null,
      created_at: '2026-08-22T12:00:00.000Z',
      updated_at: '2026-08-22T12:00:01.000Z',
    };
    admin._browserTaskRuns.set('job-1', structuredClone(conflictingRun));

    const res = mockRes();
    await handler(mockReq({ jobId: 'job-1' }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({
      code: 'BROWSER_AUDIT_RECONCILIATION_REQUIRED',
      job_id: 'job-1',
      audit_run_id: 'job-1',
      audit_state: 'conflict',
    });
    expect(admin._browserTaskRuns.get('job-1')).toEqual(conflictingRun);
    expect(admin._recorded.updates.browser_task_runs).toBeUndefined();
    expect(mockCreateEmail).not.toHaveBeenCalled();
    expect(mockSaveUserApiKey).not.toHaveBeenCalled();
  });

  it('terminalizes the mandatory audit before the job when external work throws', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupCreds(admin);
    mockCreateEmail.mockRejectedValueOnce(new Error('mail provider unavailable'));

    const res = mockRes();
    await handler(mockReq({ jobId: 'job-1' }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error).toBe('mail provider unavailable');
    expect(admin._browserTaskRuns.get('job-1')).toMatchObject({
      id: 'job-1',
      status: 'failed',
      error: 'Unexpected browser task failure: mail provider unavailable',
    });
    const auditUpdateCall = admin.update.mock.calls.findIndex(
      ([patch]) => patch.error === 'Unexpected browser task failure: mail provider unavailable'
    );
    const jobUpdateCall = admin.update.mock.calls.findIndex(
      ([patch]) => patch.status === 'failed' && patch.error === 'mail provider unavailable'
    );
    expect(auditUpdateCall).toBeGreaterThanOrEqual(0);
    expect(jobUpdateCall).toBeGreaterThan(auditUpdateCall);
    const jobFailure = admin._recorded.updates.agent_jobs.find(
      (patch) => patch.status === 'failed' && patch.error === 'mail provider unavailable'
    );
    expect(jobFailure).toMatchObject({
      result: {
        type: 'browser-task',
        reconciliation_required: false,
        audit_run_id: 'job-1',
        audit_run_state: 'committed',
      },
    });
  });

  it('surfaces durable ids when exception audit completion cannot be reconciled', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupCreds(admin);
    let auditFailureStarted = false;
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table === 'browser_task_runs' && patch?.status === 'failed') {
        auditFailureStarted = true;
        return { data: null, error: new Error('audit write unavailable') };
      }
      if (table === 'browser_task_runs' && !patch && auditFailureStarted) {
        return { data: null, error: new Error('audit read-back unavailable') };
      }
      return undefined;
    });
    mockCreateEmail.mockRejectedValueOnce(new Error('mail provider unavailable'));

    const res = mockRes();
    await handler(mockReq({ jobId: 'job-1' }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      error: 'Browser task exception needs reconciliation',
      code: 'BROWSER_EXCEPTION_RECONCILIATION_REQUIRED',
      job_id: 'job-1',
      job_state: 'failed',
      audit_run_id: 'job-1',
      audit_state: 'unknown',
    });
    expect(admin._recorded.updates.agent_jobs).toContainEqual(
      expect.objectContaining({
        status: 'failed',
        result: expect.objectContaining({
          reconciliation_required: true,
          audit_run_id: 'job-1',
          audit_run_state: 'unknown',
        }),
      })
    );
  });

  it('reconciles an exact terminal audit update whose response is lost', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupSuccessfulCredentialRegistration(admin);
    let lostTerminalResponse = false;
    admin._interceptMaybeSingle(({ table, patch, conditions }) => {
      if (table !== 'browser_task_runs') return undefined;
      const id = conditions.find(([field]) => field === 'id')?.[1];
      if (patch?.status && !lostTerminalResponse) {
        lostTerminalResponse = true;
        const current = admin._browserTaskRuns.get(id);
        admin._browserTaskRuns.set(id, {
          ...current,
          ...structuredClone(patch),
          updated_at: patch.updated_at.replace('Z', '+00:00'),
        });
        return { data: null, error: new Error('audit update response lost') };
      }
      if (!patch && lostTerminalResponse) {
        return { data: structuredClone(admin._browserTaskRuns.get(id)), error: null };
      }
      return undefined;
    });

    const res = await runRegistrationRequest();

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ processed: 1, success: true, credentialStored: true });
    expect(
      admin._recorded.updates.browser_task_runs.filter((patch) => patch.status === 'success')
    ).toHaveLength(1);
  });

  it('terminalizes the job and returns durable reconciliation ids when audit completion is unknown', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupSuccessfulCredentialRegistration(admin);
    let terminalAuditStarted = false;
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table !== 'browser_task_runs') return undefined;
      if (patch?.status) {
        terminalAuditStarted = true;
        return { data: null, error: new Error('audit update unavailable') };
      }
      if (!patch && terminalAuditStarted) {
        return { data: null, error: new Error('audit read-back unavailable') };
      }
      return undefined;
    });

    const res = await runRegistrationRequest();

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({
      code: 'BROWSER_AUDIT_RECONCILIATION_REQUIRED',
      job_id: 'job-1',
      audit_run_id: 'job-1',
      audit_state: 'unknown',
    });
    expect(mockSaveUserApiKey).toHaveBeenCalledTimes(1);
    expect(admin._recorded.updates.agent_jobs).toContainEqual(
      expect.objectContaining({
        status: 'failed',
        result: expect.objectContaining({
          reconciliation_required: true,
          audit_run_id: res.body.audit_run_id,
        }),
      })
    );
  });

  it('does not publish an audit or terminal job update after the token is revoked', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupCreds(admin);
    let reclaimed = false;
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table === 'agent_jobs' && patch?.heartbeat_at && !patch.status) {
        reclaimed = true;
        return { data: null, error: null };
      }
      if (table === 'agent_jobs' && !patch && reclaimed) {
        return { data: reclaimedBrowserJob(admin), error: null };
      }
      return undefined;
    });

    const res = mockRes();
    await handler(mockReq({ jobId: 'job-1' }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      processed: 0,
      job_id: 'job-1',
      reason: 'Job lease lost',
    });
    expect(mockCreateEmail).not.toHaveBeenCalled();
    expect(admin._browserTaskRuns.get('job-1')).toMatchObject({ status: 'running' });
    expect(admin._recorded.updates.browser_task_runs).toBeUndefined();
    expect(
      admin._recorded.updates.agent_jobs.filter(
        (patch) => patch.status && patch.status !== 'running'
      )
    ).toEqual([]);
  });

  it('returns 405 for non-POST methods', async () => {
    const req = { ...mockReq(), method: 'GET' };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });

  it('handles OPTIONS for CORS', async () => {
    const req = { ...mockReq(), method: 'OPTIONS' };
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
  });

  it('executes registration workflow on valid job', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);

    // Mock job claim → .single()
    admin.single.mockResolvedValueOnce({
      data: {
        id: 'job-1',
        user_id: 'user-1',
        payload: {
          providerUrl: 'https://provider.com/signup',
          targetToolId: 'tool-github',
          _userId: 'user-1',
        },
        status: 'running',
        retry_count: 0,
        worker_scope: 'production',
        updated_at: '2026-08-22T12:00:00.000Z',
      },
      error: null,
    });
    // browser_task_runs insert → .select('id').single()
    admin.single.mockResolvedValueOnce({ data: { id: 'job-1' } });

    // Make the IN query return tool data
    admin.select.mockImplementation(function (cols) {
      if (cols === 'id, data') {
        const credResult = { data: [{ id: 'tool-browser', data: { apiKey: 'bl-key' } }] };
        const inner = { eq: vi.fn().mockResolvedValue(credResult), in: vi.fn() };
        inner.in.mockReturnValue(inner); // .in() returns self so .eq() can chain
        return inner;
      }
      return this;
    });

    // Mock browser operations
    mockCreateEmail.mockResolvedValueOnce({
      address: 'test@mail.tm',
      password: 'pass',
      token: 'jwt',
    });
    mockNavigate.mockResolvedValue({
      html: '<form><input name="email"><input type="password"><button type="submit">Sign up</button></form>',
      status: 200,
    });
    mockFillAndSubmit.mockResolvedValueOnce({ html: '<html>Registered</html>', success: true });
    mockCheckInbox.mockResolvedValue([]);

    const req = mockReq({ jobId: 'job-1' });
    const res = mockRes();
    const promise = handler(req, res);
    // Advance past email polling delays (3 × 5000ms)
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    if (res.statusCode !== 200) console.log('BROWSER-TASK ERROR:', JSON.stringify(res.body));
    expect(res.statusCode).toBe(200);
    expect(res.body.processed).toBe(1);
    expect(mockCreateEmail).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalled();
  });

  it('does not report registration success after losing its terminal lease', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupCreds(admin);
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table === 'agent_jobs' && patch?.status === 'done') {
        return { data: null, error: null };
      }
      return undefined;
    });

    mockCreateEmail.mockResolvedValueOnce({
      address: 'test@mail.tm',
      password: 'pass',
      token: 'jwt',
    });
    mockNavigate.mockImplementation(async (url) =>
      url.includes('signup')
        ? { html: SIGNUP_FORM, status: 200 }
        : { html: DASHBOARD_WITH_KEY, status: 200 }
    );
    mockFillAndSubmit.mockResolvedValueOnce({ html: '<html>Registered</html>', success: true });
    mockCheckInbox.mockResolvedValue([]);

    const res = mockRes();
    const promise = handler(mockReq({ jobId: 'job-1' }), res);
    await advancePastEmailPoll();
    await promise;

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      error: 'Browser job completion needs reconciliation',
      code: 'BROWSER_JOB_TERMINAL_RECONCILIATION_REQUIRED',
      job_id: 'job-1',
      job_state: 'unknown',
      audit_run_id: 'job-1',
      audit_state: 'committed',
    });
    expect(res.body.success).toBeUndefined();
    const renewalUpdates = (admin._recorded.updates.agent_jobs || []).filter(
      (update) => update.heartbeat_at && !update.status
    );
    expect(renewalUpdates.length).toBeGreaterThan(1);
    expect(admin.eq).toHaveBeenCalledWith(
      'lease_token',
      admin._recorded.updates.agent_jobs[0].lease_token
    );
  });

  it('accepts an exact terminal transition that commits before its response is lost', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupSuccessfulCredentialRegistration(admin);
    let committedTerminal = null;
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table === 'agent_jobs' && patch?.status === 'done' && !committedTerminal) {
        committedTerminal = structuredClone(patch);
        return { data: null, error: new Error('terminal response lost after commit') };
      }
      if (table === 'agent_jobs' && !patch && committedTerminal) {
        const claim = admin._recorded.updates.agent_jobs[0];
        return {
          data: {
            id: 'job-1',
            user_id: 'user-1',
            payload: {
              providerUrl: 'https://provider.com/signup',
              targetToolId: 'tool-github',
              _userId: 'user-1',
            },
            status: committedTerminal.status,
            retry_count: 0,
            worker_scope: 'production',
            updated_at: committedTerminal.updated_at,
            error: committedTerminal.error,
            result: committedTerminal.result,
            lease_token: null,
            heartbeat_at: null,
            lease_expires_at: null,
            claim_error: claim.error,
          },
          error: null,
        };
      }
      return undefined;
    });

    const res = await runRegistrationRequest();

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ processed: 1, success: true, credentialStored: true });
    expect(committedTerminal).toMatchObject({ status: 'done', error: null });
  });

  it('accepts an exact lease renewal that commits before its response is lost', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupSuccessfulCredentialRegistration(admin);
    let committedRenewal = null;
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table === 'agent_jobs' && patch?.heartbeat_at && !patch.status && !committedRenewal) {
        committedRenewal = structuredClone(patch);
        return { data: null, error: new Error('renewal response lost after commit') };
      }
      if (table === 'agent_jobs' && !patch && committedRenewal) {
        const claim = admin._recorded.updates.agent_jobs[0];
        return {
          data: {
            id: 'job-1',
            user_id: 'user-1',
            payload: {
              providerUrl: 'https://provider.com/signup',
              targetToolId: 'tool-github',
              _userId: 'user-1',
            },
            status: 'running',
            retry_count: 0,
            worker_scope: 'production',
            updated_at: claim.updated_at,
            error: claim.error,
            result: null,
            lease_token: claim.lease_token,
            heartbeat_at: committedRenewal.heartbeat_at,
            lease_expires_at: committedRenewal.lease_expires_at,
          },
          error: null,
        };
      }
      return undefined;
    });

    const res = await runRegistrationRequest();

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ processed: 1, success: true, credentialStored: true });
    expect(committedRenewal).not.toBeNull();
  });

  it('does not persist a credential or resume goals after a retry reclaims the lease', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_preview_a');
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupCreds(admin);
    admin.single
      .mockResolvedValueOnce({
        data: {
          id: 'job-1',
          user_id: 'user-1',
          payload: {
            providerUrl: 'https://provider.com/signup',
            targetToolId: 'tool-github',
            _userId: 'user-1',
            _workerDeployment: 'vercel-deployment:dpl_preview_a',
          },
          status: 'running',
          retry_count: 0,
          worker_scope: 'preview',
          updated_at: '2026-08-22T12:00:00.000Z',
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: 'job-1' }, error: null });
    let persistedLease = {
      status: 'running',
      retry_count: 0,
      worker_scope: 'preview',
      updated_at: '2026-08-22T12:00:00.000Z',
    };
    let renewalCount = 0;
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table !== 'agent_jobs') return undefined;
      if (patch?.heartbeat_at && !patch.status) {
        renewalCount += 1;
        if (renewalCount !== 9) return undefined;
        persistedLease = {
          ...persistedLease,
          retry_count: 1,
          updated_at: '2026-08-22T12:01:00.000Z',
        };
        return { data: null, error: null };
      }
      if (!patch && renewalCount >= 9) {
        return {
          data: reclaimedBrowserJob(admin, { workerScope: 'preview', preview: true }),
          error: null,
        };
      }
      return undefined;
    });

    mockCreateEmail.mockResolvedValueOnce({
      address: 'test@mail.tm',
      password: 'pass',
      token: 'jwt',
    });
    mockNavigate.mockImplementation(async (url) =>
      url.includes('signup')
        ? { html: SIGNUP_FORM, status: 200 }
        : { html: DASHBOARD_WITH_KEY, status: 200 }
    );
    mockFillAndSubmit.mockResolvedValueOnce({ html: '<html>Registered</html>', success: true });
    mockCheckInbox.mockResolvedValue([]);

    const res = mockRes();
    const promise = handler(mockReq({ jobId: 'job-1' }), res);
    await advancePastEmailPoll();
    await promise;

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      processed: 0,
      job_id: 'job-1',
      reason: 'Job lease lost',
    });
    expect(persistedLease).toEqual({
      status: 'running',
      retry_count: 1,
      worker_scope: 'preview',
      updated_at: '2026-08-22T12:01:00.000Z',
    });
    expect(mockSaveUserApiKey).not.toHaveBeenCalled();
    expect(admin._recorded.updates.tools).toBeUndefined();
    expect(admin._recorded.updates.goals).toBeUndefined();
    expect(admin._recorded.inserts.goal_log).toBeUndefined();
    expect(admin._recorded.inserts.agent_jobs).toBeUndefined();
    expect(admin._recorded.inserts.notification_log).toBeUndefined();
    expect(renewalCount).toBe(9);
    expect(
      (admin._recorded.updates.agent_jobs || []).filter(
        (update) => update.status && update.status !== 'running'
      )
    ).toEqual([]);
    expect(admin.eq).toHaveBeenCalledWith('status', 'running');
    expect(admin.eq).toHaveBeenCalledWith(
      'lease_token',
      admin._recorded.updates.agent_jobs[0].lease_token
    );
    expect(admin.eq).toHaveBeenCalledWith('worker_scope', 'preview');
    expect(
      admin.eq.mock.calls.filter(
        ([field, value]) =>
          field === 'payload->>_workerDeployment' && value === 'vercel-deployment:dpl_preview_a'
      )
    ).toHaveLength(1);
  });

  it('records a stored credential but performs no workflow side effects after post-save lease loss', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_preview_a');
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupCreds(admin);
    admin.single
      .mockResolvedValueOnce({
        data: {
          id: 'job-1',
          user_id: 'user-1',
          payload: {
            providerUrl: 'https://provider.com/signup',
            targetToolId: 'tool-github',
            _userId: 'user-1',
            _workerDeployment: 'vercel-deployment:dpl_preview_a',
          },
          status: 'running',
          retry_count: 0,
          worker_scope: 'preview',
          updated_at: '2026-08-22T12:00:00.000Z',
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: 'job-1' }, error: null });
    let renewalCount = 0;
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table !== 'agent_jobs') return undefined;
      if (patch?.heartbeat_at && !patch.status) {
        renewalCount += 1;
        return renewalCount === 11 ? { data: null, error: null } : undefined;
      }
      if (!patch && renewalCount >= 11) {
        return {
          data: reclaimedBrowserJob(admin, { workerScope: 'preview', preview: true }),
          error: null,
        };
      }
      return undefined;
    });

    mockCreateEmail.mockResolvedValueOnce({
      address: 'test@mail.tm',
      password: 'pass',
      token: 'jwt',
    });
    mockNavigate.mockImplementation(async (url) =>
      url.includes('signup')
        ? { html: SIGNUP_FORM, status: 200 }
        : { html: DASHBOARD_WITH_KEY, status: 200 }
    );
    mockFillAndSubmit.mockResolvedValueOnce({ html: '<html>Registered</html>', success: true });
    mockCheckInbox.mockResolvedValue([]);

    const res = mockRes();
    const promise = handler(mockReq({ jobId: 'job-1' }), res);
    await advancePastEmailPoll();
    await promise;

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      processed: 0,
      job_id: 'job-1',
      reason: 'Job lease lost',
    });
    expect(renewalCount).toBe(11);
    expect(mockSaveUserApiKey).toHaveBeenCalledTimes(1);
    expect(admin._recorded.updates.browser_task_runs).toBeUndefined();
    expect(admin._recorded.updates.goals).toBeUndefined();
    expect(admin._recorded.inserts.goal_log).toBeUndefined();
    expect(admin._recorded.inserts.agent_jobs).toBeUndefined();
    expect(admin._recorded.inserts.notification_log).toBeUndefined();
    expect(
      (admin._recorded.updates.agent_jobs || []).filter(
        (update) => update.status && update.status !== 'running'
      )
    ).toEqual([]);
  });

  it.each([
    { boundary: 'temporary-account creation', failAtRenewal: 1, phoneForm: false },
    { boundary: 'phone rental', failAtRenewal: 3, phoneForm: true },
    { boundary: 'signup-form submission', failAtRenewal: 5, phoneForm: true },
  ])(
    'a reclaimed Preview lease prevents the next $boundary side effect',
    async ({ failAtRenewal, phoneForm }) => {
      vi.stubEnv('VERCEL', '1');
      vi.stubEnv('VERCEL_ENV', 'preview');
      vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_preview_a');
      const admin = mockAdmin();
      buildSupabaseAdminClient.mockReturnValue(admin);
      setupCreds(admin, 'bl-key', 'cap-key', 'sms-key');
      admin.single
        .mockResolvedValueOnce({
          data: {
            id: 'job-1',
            user_id: 'user-1',
            payload: {
              providerUrl: 'https://provider.com/signup',
              targetToolId: 'tool-github',
              _userId: 'user-1',
              _workerDeployment: 'vercel-deployment:dpl_preview_a',
            },
            status: 'running',
            retry_count: 0,
            worker_scope: 'preview',
            updated_at: '2026-08-22T12:00:00.000Z',
          },
          error: null,
        })
        .mockResolvedValueOnce({ data: { id: 'job-1' }, error: null });

      admin.select.mockImplementation(function (cols) {
        if (cols === 'id, data') {
          const rows = [
            { id: 'tool-browser', data: {} },
            { id: 'tool-captcha-solver', data: {} },
            { id: 'tool-sms-verify', data: { provider: '5sim' } },
          ];
          const inner = { eq: vi.fn().mockResolvedValue({ data: rows }), in: vi.fn() };
          inner.in.mockReturnValue(inner);
          return inner;
        }
        return admin;
      });

      let renewalCount = 0;
      admin._interceptMaybeSingle(({ table, patch }) => {
        if (table !== 'agent_jobs') return undefined;
        if (patch?.heartbeat_at && !patch.status) {
          renewalCount += 1;
          return renewalCount === failAtRenewal ? { data: null, error: null } : undefined;
        }
        if (!patch && renewalCount >= failAtRenewal) {
          return {
            data: reclaimedBrowserJob(admin, { workerScope: 'preview', preview: true }),
            error: null,
          };
        }
        return undefined;
      });

      mockCreateEmail.mockResolvedValue({
        address: 'test@mail.tm',
        password: 'pass',
        token: 'jwt',
      });
      mockDetectsPhone.mockReturnValue(phoneForm);
      mockRentNumber.mockResolvedValue({
        activation_id: 'act-1',
        phone_number: '+15551234567',
      });
      mockReleaseNumber.mockResolvedValue(undefined);
      mockNavigate.mockResolvedValue({
        html: phoneForm
          ? '<form><input name="email"><input type="password"><input type="tel" name="phone"><button type="submit">Sign up</button></form>'
          : SIGNUP_FORM,
        status: 200,
      });
      mockFillAndSubmit.mockResolvedValue({ html: '<html>Registered</html>', success: true });

      const res = mockRes();
      await handler(mockReq({ jobId: 'job-1' }), res);

      expect(res.statusCode).toBe(409);
      expect(res.body.reason).toBe('Job lease lost');
      expect(renewalCount).toBe(failAtRenewal);
      expect(mockCreateEmail).toHaveBeenCalledTimes(failAtRenewal === 1 ? 0 : 1);
      expect(mockNavigate).toHaveBeenCalledTimes(failAtRenewal === 1 ? 0 : 1);
      expect(mockRentNumber).toHaveBeenCalledTimes(failAtRenewal === 5 ? 1 : 0);
      expect(mockFillAndSubmit).not.toHaveBeenCalled();
      if (failAtRenewal !== 5) {
        expect(mockReleaseNumber).not.toHaveBeenCalled();
      }
      expect(mockSaveUserApiKey).not.toHaveBeenCalled();
      expect(
        admin.eq.mock.calls.filter(
          ([field, value]) =>
            field === 'payload->>_workerDeployment' && value === 'vercel-deployment:dpl_preview_a'
        )
      ).toHaveLength(1);
    }
  );

  it('aborts in-flight browser work and fences a late completion after token revocation', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupCreds(admin);
    let renewalCount = 0;
    let reclaimed = false;
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table !== 'agent_jobs') return undefined;
      if (patch?.heartbeat_at && !patch.status) {
        renewalCount += 1;
        if (renewalCount === 2) {
          reclaimed = true;
          return { data: null, error: null };
        }
      }
      if (!patch && reclaimed) {
        return { data: reclaimedBrowserJob(admin), error: null };
      }
      return undefined;
    });

    let resolveEmail;
    mockCreateEmail.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveEmail = resolve;
      })
    );

    const res = mockRes();
    const request = handler(mockReq({ jobId: 'job-1' }), res);
    await vi.waitFor(() => expect(mockCreateEmail).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(15_000);
    await request;

    expect(res.statusCode).toBe(409);
    resolveEmail({ address: 'late@mail.tm', password: 'pass', token: 'jwt' });
    await Promise.resolve();
    await Promise.resolve();

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockSaveUserApiKey).not.toHaveBeenCalled();
    expect(admin._browserTaskRuns.get('job-1')).toMatchObject({ status: 'running' });
    expect(admin._recorded.updates.browser_task_runs).toBeUndefined();
    expect(
      admin._recorded.updates.agent_jobs.filter(
        (patch) => patch.status && patch.status !== 'running'
      )
    ).toEqual([]);
  });

  it('does not let the catch path fail a newer lease', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupCreds(admin);
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table === 'agent_jobs' && patch?.status === 'failed') {
        return { data: null, error: null };
      }
      return undefined;
    });
    mockCreateEmail.mockRejectedValueOnce(new Error('mail provider unavailable'));

    const res = mockRes();
    await handler(mockReq({ jobId: 'job-1' }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({
      code: 'BROWSER_EXCEPTION_RECONCILIATION_REQUIRED',
      job_id: 'job-1',
      job_state: 'unknown',
      audit_run_id: 'job-1',
      audit_state: 'committed',
    });
    expect(admin.eq).toHaveBeenCalledWith('status', 'running');
    expect(admin.eq).toHaveBeenCalledWith('retry_count', 0);
    expect(admin.eq).toHaveBeenCalledWith(
      'updated_at',
      admin._recorded.updates.agent_jobs[0].updated_at
    );
  });

  // ── Phase 1: credential-ready notification ──────────────────────────

  it('Phase 1 A: happy path inserts credential_provisioned row into notification_log', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupCreds(admin);

    mockCreateEmail.mockResolvedValueOnce({
      address: 'test@mail.tm',
      password: 'pass',
      token: 'jwt',
    });
    mockNavigate.mockImplementation(async (url) =>
      url.includes('signup')
        ? { html: SIGNUP_FORM, status: 200 }
        : { html: DASHBOARD_WITH_KEY, status: 200 }
    );
    mockFillAndSubmit.mockResolvedValueOnce({ html: '<html>Registered</html>', success: true });
    mockCheckInbox.mockResolvedValue([]);

    const req = mockReq({ jobId: 'job-1' });
    const res = mockRes();
    const promise = handler(req, res);
    await advancePastEmailPoll();
    await promise;

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.credentialStored).toBe(true);
    expect(res.body.apiKey).toBeUndefined();
    expect(mockReserveToolCredentialWrite).toHaveBeenCalledWith({
      admin: expect.anything(),
      userId: 'user-1',
      toolSnapshot: expect.objectContaining({
        id: 'tool-github',
        updated_at: '2026-08-22T12:00:00.000Z',
      }),
      source: 'browser-task',
    });
    expect(mockSaveUserApiKey).toHaveBeenCalledWith(
      expect.objectContaining({
        adminClient: expect.anything(),
        toolCredentialReservation: expect.objectContaining({
          attemptId: 'browser-attempt',
        }),
      })
    );
    const guardedAdmin = mockReserveToolCredentialWrite.mock.calls[0][0].admin;
    expect(guardedAdmin).not.toBe(admin);
    expect(mockSaveUserApiKey.mock.calls[0][0].adminClient).toBe(guardedAdmin);

    const notifs = admin._recorded.inserts.notification_log;
    expect(notifs).toBeDefined();
    expect(notifs).toHaveLength(1);
    const n = notifs[0];
    expect(n.user_id).toBe('user-1');
    expect(n.channel).toBe('in_app');
    expect(n.event_type).toBe('credential_provisioned');
    expect(n.subject).toContain('provider.com');
    expect(n.body).not.toContain('cdef');
    expect(n.body).toContain('encrypted API credential');
    expect(n.status).toBe('sent');
    expect(n.sent_at).toEqual(expect.any(String));
    expect(n.metadata.priority).toBe('normal');
    expect(n.metadata.tool_id).toBe('tool-github');
    expect(n.metadata.agent_name).toBe('Sandris Kalns');
    expect(n.metadata.agent_role).toBe('Account Creation Specialist');
    expect(n.metadata.key_last4).toBeUndefined();
    expect(n.metadata.provider_url).toBe('https://provider.com/signup');
    expect(n.metadata.temp_email).toBe('test@mail.tm');
    expect(typeof n.metadata.signup_duration_ms).toBe('number');
    expect(n.metadata.job_id).toBe('job-1');
    expect(n.metadata.action).toEqual({
      type: 'view_tool',
      label: 'Open tool',
      target_url: '/agent-hub?tab=tools',
    });
  });

  it('Phase 1 B: CAPTCHA solver fails, no key extracted — no notification', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupCreds(admin);

    mockCreateEmail.mockResolvedValueOnce({
      address: 'test@mail.tm',
      password: 'pass',
      token: 'jwt',
    });
    mockDetectCaptcha.mockReturnValueOnce({ type: 'recaptcha', siteKey: 'site-key' });
    mockSolveRecaptcha.mockRejectedValueOnce(new Error('2Captcha timeout'));
    mockNavigate.mockImplementation(async (url) =>
      url.includes('signup')
        ? { html: SIGNUP_FORM, status: 200 }
        : { html: DASHBOARD_WITHOUT_KEY, status: 200 }
    );
    mockFillAndSubmit.mockResolvedValueOnce({ html: '<html>Registered</html>', success: true });
    mockCheckInbox.mockResolvedValue([]);

    const req = mockReq({ jobId: 'job-1' });
    const res = mockRes();
    const promise = handler(req, res);
    await advancePastEmailPoll();
    await promise;

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(false);
    expect(admin._recorded.inserts.notification_log).toBeUndefined();

    const captchaStep = res.body.steps.find((s) => s.step === 'solve-captcha');
    expect(captchaStep?.status).toBe('failed');
  });

  it('Phase 1 C: dashboard has no key, extract returns null — no notification', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupCreds(admin);

    mockCreateEmail.mockResolvedValueOnce({
      address: 'test@mail.tm',
      password: 'pass',
      token: 'jwt',
    });
    mockNavigate.mockImplementation(async (url) =>
      url.includes('signup')
        ? { html: SIGNUP_FORM, status: 200 }
        : { html: DASHBOARD_WITHOUT_KEY, status: 200 }
    );
    mockFillAndSubmit.mockResolvedValueOnce({ html: '<html>Registered</html>', success: true });
    mockCheckInbox.mockResolvedValue([]);

    const req = mockReq({ jobId: 'job-1' });
    const res = mockRes();
    const promise = handler(req, res);
    await advancePastEmailPoll();
    await promise;

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(false);
    expect(admin._recorded.inserts.notification_log).toBeUndefined();
  });

  it('does not overwrite a concurrently edited tool or resume its blocked goal', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupCreds(admin);

    let persistedTool = {
      id: 'tool-github',
      name: 'GitHub',
      data: { owner_note: 'original' },
      status: 'needs_setup',
      updated_at: '2026-08-22T12:00:00.000Z',
    };
    admin.single
      .mockResolvedValueOnce({
        data: {
          id: 'job-1',
          user_id: 'user-1',
          payload: {
            providerUrl: 'https://provider.com/signup',
            targetToolId: 'tool-github',
            _userId: 'user-1',
          },
          status: 'running',
          retry_count: 0,
          worker_scope: 'production',
          updated_at: '2026-08-22T12:00:00.000Z',
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: 'job-1' }, error: null });
    const initialSnapshot = { ...structuredClone(persistedTool), user_id: 'user-1' };
    mockLoadToolCredentialSnapshot.mockResolvedValueOnce({
      ok: true,
      snapshot: initialSnapshot,
    });
    mockReserveToolCredentialWrite.mockImplementationOnce(async ({ toolSnapshot }) => {
      expect(toolSnapshot).toEqual(initialSnapshot);
      persistedTool = {
        ...persistedTool,
        data: { owner_note: 'edited while browser was running' },
        status: 'disabled',
        updated_at: '2026-08-22T12:01:00.000Z',
      };
      return {
        ok: false,
        code: 'TOOL_SNAPSHOT_STALE',
        status: 409,
        message: 'Tool changed before credential storage',
      };
    });

    mockCreateEmail.mockResolvedValueOnce({
      address: 'test@mail.tm',
      password: 'pass',
      token: 'jwt',
    });
    mockNavigate.mockImplementation(async (url) =>
      url.includes('signup')
        ? { html: SIGNUP_FORM, status: 200 }
        : { html: DASHBOARD_WITH_KEY, status: 200 }
    );
    mockFillAndSubmit.mockResolvedValueOnce({ html: '<html>Registered</html>', success: true });
    mockCheckInbox.mockResolvedValue([]);

    const res = mockRes();
    const promise = handler(mockReq({ jobId: 'job-1' }), res);
    await advancePastEmailPoll();
    await promise;

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.credentialStored).toBe(false);
    expect(res.body.error).toBe('Tool changed before credential storage');
    expect(mockSaveUserApiKey).not.toHaveBeenCalled();
    expect(mockLoadToolCredentialSnapshot).toHaveBeenCalledWith({
      admin,
      userId: 'user-1',
      toolId: 'tool-github',
    });
    expect(mockLoadToolCredentialSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateEmail.mock.invocationCallOrder[0]
    );
    expect(persistedTool).toEqual({
      id: 'tool-github',
      name: 'GitHub',
      data: { owner_note: 'edited while browser was running' },
      status: 'disabled',
      updated_at: '2026-08-22T12:01:00.000Z',
    });
    expect(admin._recorded.updates.goals).toBeUndefined();
    expect(admin._recorded.inserts.goal_log).toBeUndefined();
    expect(admin._recorded.inserts.agent_jobs).toBeUndefined();
    expect(admin._recorded.inserts.notification_log).toBeUndefined();
    expect(mockTriggerProcessNext).not.toHaveBeenCalled();
  });

  it('Phase 3 E: a goal blocked on this job gets an exact tool-provisioning continuation', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_preview_a');
    mockTriggerProcessNext.mockResolvedValueOnce(true);
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupCreds(admin);
    admin.single
      .mockResolvedValueOnce({
        data: {
          id: 'job-1',
          user_id: 'user-1',
          payload: {
            providerUrl: 'https://provider.com/signup',
            targetToolId: 'tool-github',
            _userId: 'user-1',
            _workerDeployment: 'vercel-deployment:dpl_preview_a',
          },
          status: 'running',
          retry_count: 0,
          worker_scope: 'preview',
          updated_at: '2026-08-22T12:00:00.000Z',
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: 'job-1' }, error: null });

    // Make awaiting `admin` (for goals select().eq().eq().contains()) yield a blocked goal.
    admin.then = (onFulfilled) =>
      Promise.resolve({
        data: [
          {
            id: 'goal-blocked-1',
            user_id: 'user-1',
            data: { blocked_by_job_id: 'job-1', required_tool_id: 'tool-github' },
            status: 'awaiting_tools',
            updated_at: '2026-08-22T12:00:00.000Z',
          },
        ],
        error: null,
      }).then(onFulfilled);

    mockCreateEmail.mockResolvedValueOnce({
      address: 'test@mail.tm',
      password: 'pass',
      token: 'jwt',
    });
    mockNavigate.mockImplementation(async (url) =>
      url.includes('signup')
        ? { html: SIGNUP_FORM, status: 200 }
        : { html: DASHBOARD_WITH_KEY, status: 200 }
    );
    mockFillAndSubmit.mockResolvedValueOnce({ html: '<html>Registered</html>', success: true });
    mockCheckInbox.mockResolvedValue([]);

    const req = mockReq({ jobId: 'job-1' });
    const res = mockRes();
    const promise = handler(req, res);
    await advancePastEmailPoll();
    await promise;

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);

    // The goal is prepared for the exact tool-provisioning continuation with
    // the browser block cleared and a durable continuation marker embedded.
    const goalUpdates = admin._recorded.updates.goals || [];
    const resumeUpdate = goalUpdates.find((u) => u.status === 'provisioning_tools');
    expect(resumeUpdate).toBeDefined();
    expect(resumeUpdate.data.blocked_by_job_id).toBeUndefined();
    expect(resumeUpdate.data.credential_resume).toMatchObject({
      source: 'browser-task',
      browser_job_id: 'job-1',
      tool_id: 'tool-github',
      status: 'queued',
      goal_updated_at: '2026-08-22T12:00:00.000Z',
    });
    expect(resumeUpdate.data.healing_log).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'credential-arrived' })])
    );
    expect(admin.select).toHaveBeenCalledWith('id, user_id, data, status, updated_at');
    expect(admin.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(admin.eq).toHaveBeenCalledWith('status', 'awaiting_tools');
    expect(admin.eq).toHaveBeenCalledWith('updated_at', '2026-08-22T12:00:00.000Z');
    expect(admin.contains).toHaveBeenCalledWith('data', { blocked_by_job_id: 'job-1' });

    // A new orchestrate-goal job should be enqueued.
    const jobInserts = admin._recorded.inserts.agent_jobs || [];
    expect(
      jobInserts.find(
        (r) => r.payload?.type === 'orchestrate-goal' && r.payload?.goalId === 'goal-blocked-1'
      )
    ).toBeDefined();
    const chainedJob = jobInserts.find(
      (r) => r.payload?.type === 'orchestrate-goal' && r.payload?.goalId === 'goal-blocked-1'
    );
    expect(chainedJob).toMatchObject({
      user_id: 'user-1',
      status: 'queued',
      worker_scope: 'preview',
      payload: {
        action: 'tool-provisioning',
        _userId: 'user-1',
        userId: 'user-1',
        user_id: 'user-1',
        _credentialResumeBrowserJobId: 'job-1',
        _credentialResumeGoalUpdatedAt: '2026-08-22T12:00:00.000Z',
        _workerDeployment: 'vercel-deployment:dpl_preview_a',
      },
    });
    expect(resumeUpdate.data.credential_resume.job_id).toBe(chainedJob.id);
    expect(mockTriggerProcessNext).toHaveBeenCalledTimes(1);
    expect(mockTriggerProcessNext).toHaveBeenCalledWith({ jobId: chainedJob.id });
    expect(mockTriggerProcessNext).not.toHaveBeenCalledWith();

    // A goal_log entry for the credential arrival.
    const logInserts = admin._recorded.inserts.goal_log || [];
    expect(logInserts.find((r) => r.event_type === 'goal_credential_arrived')).toBeDefined();

    // The notification should list the resumed goal.
    const notifs = admin._recorded.inserts.notification_log || [];
    expect(notifs[0].metadata.resumed_goal_ids).toEqual(['goal-blocked-1']);
    expect(notifs[0].metadata.action.target_url).toBe('/goals?id=goal-blocked-1');
    expect(notifs[0].body).toContain('Resumed 1 blocked goal.');
  });

  it('does not resume or enqueue from a goal snapshot cancelled before the guarded update', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupCreds(admin);

    let persistedGoal = {
      id: 'goal-blocked-1',
      user_id: 'user-1',
      data: { blocked_by_job_id: 'job-1', required_tool_id: 'tool-github' },
      status: 'awaiting_tools',
      updated_at: '2026-08-22T12:00:00.000Z',
    };
    admin.then = (onFulfilled) =>
      Promise.resolve({ data: [structuredClone(persistedGoal)], error: null }).then(onFulfilled);
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table === 'goals' && patch?.status === 'provisioning_tools') {
        persistedGoal = {
          ...persistedGoal,
          data: { ...persistedGoal.data, cancelled_by: 'user-1' },
          status: 'cancelled',
          updated_at: '2026-08-22T12:01:00.000Z',
        };
        return { data: null, error: null };
      }
      return undefined;
    });

    mockCreateEmail.mockResolvedValueOnce({
      address: 'test@mail.tm',
      password: 'pass',
      token: 'jwt',
    });
    mockNavigate.mockImplementation(async (url) =>
      url.includes('signup')
        ? { html: SIGNUP_FORM, status: 200 }
        : { html: DASHBOARD_WITH_KEY, status: 200 }
    );
    mockFillAndSubmit.mockResolvedValueOnce({ html: '<html>Registered</html>', success: true });
    mockCheckInbox.mockResolvedValue([]);

    const res = mockRes();
    const promise = handler(mockReq({ jobId: 'job-1' }), res);
    await advancePastEmailPoll();
    await promise;

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(persistedGoal).toMatchObject({
      status: 'cancelled',
      updated_at: '2026-08-22T12:01:00.000Z',
      data: { blocked_by_job_id: 'job-1', cancelled_by: 'user-1' },
    });
    expect(persistedGoal.data.healing_log).toBeUndefined();
    expect(admin._recorded.inserts.goal_log).toBeUndefined();
    expect(admin._recorded.inserts.agent_jobs).toBeUndefined();
    const notifs = admin._recorded.inserts.notification_log || [];
    expect(notifs[0].metadata.resumed_goal_ids).toEqual([]);
    expect(notifs[0].metadata.action).toEqual({
      type: 'view_tool',
      label: 'Open tool',
      target_url: '/agent-hub?tab=tools',
    });
    expect(notifs[0].body).not.toContain('Resumed');
    expect(mockTriggerProcessNext).not.toHaveBeenCalled();
  });

  it.each(['throw', 'returned-error'])(
    'reconciles a committed blocked-goal transition after %s response loss',
    async (responseMode) => {
      const admin = mockAdmin();
      buildSupabaseAdminClient.mockReturnValue(admin);
      const originalGoal = {
        id: 'goal-blocked-1',
        user_id: 'user-1',
        data: { blocked_by_job_id: 'job-1', required_tool_id: 'tool-github' },
        status: 'awaiting_tools',
        updated_at: '2026-08-22T12:00:00.000Z',
      };
      let persistedGoal = structuredClone(originalGoal);
      admin._interceptMaybeSingle(({ table, patch }) => {
        if (table === 'goals' && patch?.status === 'provisioning_tools') {
          persistedGoal = {
            ...persistedGoal,
            ...structuredClone(patch),
          };
          if (responseMode === 'throw') throw new Error('goal response lost after commit');
          return { data: null, error: new Error('goal response lost after commit') };
        }
        if (table === 'goals' && !patch) {
          return { data: structuredClone(persistedGoal), error: null };
        }
        return undefined;
      });
      setupSuccessfulCredentialRegistration(admin, [originalGoal]);

      const res = await runRegistrationRequest();

      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({
        success: true,
        credentialStored: true,
        resumeSucceeded: true,
        resumedGoalIds: ['goal-blocked-1'],
      });
      expect(persistedGoal).toMatchObject({
        status: 'provisioning_tools',
        data: {
          credential_resume: {
            browser_job_id: 'job-1',
            status: 'queued',
          },
        },
      });
      expect(admin._recorded.inserts.agent_jobs).toHaveLength(1);
      expect(mockTriggerProcessNext).toHaveBeenCalledTimes(1);
    }
  );

  it('parks an ambiguously committed blocked-goal transition before finalizing the browser job', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    const originalGoal = {
      id: 'goal-blocked-1',
      user_id: 'user-1',
      data: { blocked_by_job_id: 'job-1', required_tool_id: 'tool-github' },
      status: 'awaiting_tools',
      updated_at: '2026-08-22T12:00:00.000Z',
    };
    let persistedGoal = structuredClone(originalGoal);
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table === 'goals' && patch?.status === 'provisioning_tools') {
        persistedGoal = { ...persistedGoal, ...structuredClone(patch) };
        return { data: null, error: new Error('goal transition response lost') };
      }
      if (table === 'goals' && !patch) {
        return { data: null, error: new Error('goal transition inspection unavailable') };
      }
      if (table === 'goals' && patch?.status === 'needs_human') {
        persistedGoal = { ...persistedGoal, ...structuredClone(patch) };
        return { data: { id: persistedGoal.id }, error: null };
      }
      return undefined;
    });
    setupSuccessfulCredentialRegistration(admin, [originalGoal]);

    const res = await runRegistrationRequest();

    expect(res.body).toMatchObject({
      success: false,
      credentialStored: true,
      resumeSucceeded: false,
      resumeReconciliationRequired: true,
      resumedGoalIds: [],
      resumeFailures: [
        {
          goalId: 'goal-blocked-1',
          state: 'parked',
          reason: 'goal transition response lost',
        },
      ],
    });
    expect(persistedGoal).toMatchObject({
      status: 'needs_human',
      data: {
        credential_resume: {
          browser_job_id: 'job-1',
          status: 'reconciliation_required',
        },
        failure_stage: 'credential-resume',
      },
    });
    expect(admin._recorded.inserts.agent_jobs).toBeUndefined();
    expect(mockTriggerProcessNext).not.toHaveBeenCalled();
  });

  it('surfaces a verified-original blocked-goal transition error without losing the credential', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    const originalGoal = {
      id: 'goal-blocked-1',
      user_id: 'user-1',
      data: { blocked_by_job_id: 'job-1', required_tool_id: 'tool-github' },
      status: 'awaiting_tools',
      updated_at: '2026-08-22T12:00:00.000Z',
    };
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table === 'goals' && patch?.status === 'provisioning_tools') {
        return { data: null, error: new Error('goal write unavailable') };
      }
      if (table === 'goals' && !patch) {
        return { data: structuredClone(originalGoal), error: null };
      }
      return undefined;
    });
    setupSuccessfulCredentialRegistration(admin, [originalGoal]);

    const res = await runRegistrationRequest();

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      success: false,
      credentialStored: true,
      resumeSucceeded: false,
      resumeReconciliationRequired: false,
      resumedGoalIds: [],
      resumeFailures: [
        {
          goalId: 'goal-blocked-1',
          state: 'transition-original',
          reason: 'goal write unavailable',
        },
      ],
    });
    expect(admin._recorded.inserts.agent_jobs).toBeUndefined();
    const notification = admin._recorded.inserts.notification_log[0];
    expect(notification.metadata.resumed_goal_ids).toEqual([]);
    expect(notification.metadata.goal_resume_succeeded).toBe(false);
    expect(notification.body).not.toContain('Resumed');
    expect(notification.body).toContain('needs attention');
  });

  it('verifies a deterministic continuation after its insert response is lost', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    const originalGoal = {
      id: 'goal-blocked-1',
      user_id: 'user-1',
      data: { blocked_by_job_id: 'job-1', required_tool_id: 'tool-github' },
      status: 'awaiting_tools',
      updated_at: '2026-08-22T12:00:00.000Z',
    };
    let persistedGoal = structuredClone(originalGoal);
    admin._insertAfterCommitErrors.agent_jobs = new Error('queue response lost after commit');
    admin._interceptMaybeSingle(({ table, patch, conditions }) => {
      if (table === 'goals' && patch?.status === 'provisioning_tools') {
        persistedGoal = { ...persistedGoal, ...structuredClone(patch) };
        return { data: structuredClone(persistedGoal), error: null };
      }
      if (table === 'agent_jobs' && !patch) {
        const jobId = conditions.find(([field]) => field === 'id')?.[1];
        if (jobId === 'job-1') return undefined;
        const job = (admin._recorded.inserts.agent_jobs || []).find((row) => row.id === jobId);
        return { data: job ? structuredClone(job) : null, error: null };
      }
      return undefined;
    });
    setupSuccessfulCredentialRegistration(admin, [originalGoal]);

    const res = await runRegistrationRequest();

    expect(res.body).toMatchObject({
      success: true,
      credentialStored: true,
      resumeSucceeded: true,
      resumedGoalIds: ['goal-blocked-1'],
    });
    const [continuation] = admin._recorded.inserts.agent_jobs;
    expect(continuation.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(persistedGoal.data.credential_resume.job_id).toBe(continuation.id);
    expect(mockTriggerProcessNext).toHaveBeenCalledWith({ jobId: continuation.id });
  });

  it('exactly rolls the goal back and reports partial success when enqueue is proven absent', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    const originalGoal = {
      id: 'goal-blocked-1',
      user_id: 'user-1',
      data: { blocked_by_job_id: 'job-1', required_tool_id: 'tool-github' },
      status: 'awaiting_tools',
      updated_at: '2026-08-22T12:00:00.000Z',
    };
    let persistedGoal = structuredClone(originalGoal);
    admin._insertErrors.agent_jobs = new Error('queue unavailable');
    admin._interceptMaybeSingle(({ table, patch, conditions }) => {
      if (table === 'goals' && patch?.status === 'provisioning_tools') {
        persistedGoal = { ...persistedGoal, ...structuredClone(patch) };
        return { data: structuredClone(persistedGoal), error: null };
      }
      if (
        table === 'agent_jobs' &&
        !patch &&
        conditions.find(([field]) => field === 'id')?.[1] !== 'job-1'
      ) {
        return { data: null, error: null };
      }
      if (table === 'goals' && patch?.status === 'awaiting_tools') {
        persistedGoal = { ...persistedGoal, ...structuredClone(patch) };
        return { data: { id: persistedGoal.id }, error: null };
      }
      return undefined;
    });
    setupSuccessfulCredentialRegistration(admin, [originalGoal]);

    const res = await runRegistrationRequest();

    expect(res.body).toMatchObject({
      success: false,
      credentialStored: true,
      resumeSucceeded: false,
      resumeReconciliationRequired: false,
      resumedGoalIds: [],
      resumeFailures: [
        {
          goalId: 'goal-blocked-1',
          state: 'enqueue-rolled-back',
          reason: 'queue unavailable',
        },
      ],
    });
    expect(persistedGoal).toMatchObject({
      status: 'awaiting_tools',
      data: originalGoal.data,
    });
    expect(admin._recorded.inserts.agent_jobs).toBeUndefined();
    expect(mockTriggerProcessNext).not.toHaveBeenCalled();
    expect(admin._recorded.updates.browser_task_runs).toContainEqual(
      expect.objectContaining({ status: 'failed', credential_saved: true })
    );
    expect(admin._recorded.updates.agent_jobs).toContainEqual(
      expect.objectContaining({
        status: 'failed',
        result: expect.objectContaining({ credentialStored: true, resumeSucceeded: false }),
      })
    );
  });

  it('reconciles rollback response loss and keeps goal timestamps monotonic', async () => {
    vi.setSystemTime(new Date('2026-08-22T11:00:00.000Z'));
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    const originalGoal = {
      id: 'goal-blocked-1',
      user_id: 'user-1',
      data: { blocked_by_job_id: 'job-1', required_tool_id: 'tool-github' },
      status: 'awaiting_tools',
      updated_at: '2026-08-22T12:00:00.000Z',
    };
    let persistedGoal = structuredClone(originalGoal);
    admin._insertErrors.agent_jobs = new Error('queue unavailable');
    admin._interceptMaybeSingle(({ table, patch, conditions }) => {
      if (table === 'goals' && patch?.status === 'provisioning_tools') {
        persistedGoal = { ...persistedGoal, ...structuredClone(patch) };
        return { data: structuredClone(persistedGoal), error: null };
      }
      if (
        table === 'agent_jobs' &&
        !patch &&
        conditions.find(([field]) => field === 'id')?.[1] !== 'job-1'
      ) {
        return { data: null, error: null };
      }
      if (table === 'goals' && patch?.status === 'awaiting_tools') {
        persistedGoal = { ...persistedGoal, ...structuredClone(patch) };
        return { data: null, error: new Error('rollback response lost after commit') };
      }
      if (table === 'goals' && !patch) {
        return { data: structuredClone(persistedGoal), error: null };
      }
      return undefined;
    });
    setupSuccessfulCredentialRegistration(admin, [originalGoal]);

    const res = await runRegistrationRequest();

    expect(res.body).toMatchObject({
      success: false,
      resumeSucceeded: false,
      resumeReconciliationRequired: false,
      resumeFailures: [
        {
          goalId: 'goal-blocked-1',
          state: 'enqueue-rolled-back',
          reason: 'queue unavailable',
        },
      ],
    });
    expect(persistedGoal).toMatchObject({
      status: 'awaiting_tools',
      data: originalGoal.data,
      updated_at: '2026-08-22T12:00:00.002Z',
    });
    const [transitionPatch, rollbackPatch] = admin._recorded.updates.goals;
    expect(transitionPatch.updated_at).toBe('2026-08-22T12:00:00.001Z');
    expect(rollbackPatch.updated_at).toBe('2026-08-22T12:00:00.002Z');
  });

  it('parks the exact transitioned goal when enqueue state cannot be reconciled', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    const originalGoal = {
      id: 'goal-blocked-1',
      user_id: 'user-1',
      data: { blocked_by_job_id: 'job-1', required_tool_id: 'tool-github' },
      status: 'awaiting_tools',
      updated_at: '2026-08-22T12:00:00.000Z',
    };
    let persistedGoal = structuredClone(originalGoal);
    admin._insertErrors.agent_jobs = new Error('queue response unavailable');
    admin._interceptMaybeSingle(({ table, patch, conditions }) => {
      if (table === 'goals' && patch?.status === 'provisioning_tools') {
        persistedGoal = { ...persistedGoal, ...structuredClone(patch) };
        return { data: structuredClone(persistedGoal), error: null };
      }
      if (table === 'agent_jobs' && !patch) {
        if (conditions.find(([field]) => field === 'id')?.[1] === 'job-1') return undefined;
        return { data: null, error: new Error('queue reread unavailable') };
      }
      if (table === 'goals' && patch?.status === 'needs_human') {
        persistedGoal = { ...persistedGoal, ...structuredClone(patch) };
        return { data: { id: persistedGoal.id }, error: null };
      }
      return undefined;
    });
    setupSuccessfulCredentialRegistration(admin, [originalGoal]);

    const res = await runRegistrationRequest();

    expect(res.body).toMatchObject({
      success: false,
      credentialStored: true,
      resumeSucceeded: false,
      resumeReconciliationRequired: true,
      resumedGoalIds: [],
      resumeFailures: [
        {
          goalId: 'goal-blocked-1',
          state: 'parked',
          reason: 'queue response unavailable',
        },
      ],
    });
    expect(persistedGoal).toMatchObject({
      status: 'needs_human',
      data: {
        credential_resume: {
          browser_job_id: 'job-1',
          status: 'reconciliation_required',
        },
        failure_stage: 'credential-resume',
      },
    });
  });

  it.each(['response-loss', 'proven-precommit'])(
    'reconciles a blocked-goal park after %s and keeps its timestamp monotonic',
    async (mode) => {
      vi.setSystemTime(new Date('2026-08-22T11:00:00.000Z'));
      const admin = mockAdmin();
      buildSupabaseAdminClient.mockReturnValue(admin);
      const originalGoal = {
        id: 'goal-blocked-1',
        user_id: 'user-1',
        data: { blocked_by_job_id: 'job-1', required_tool_id: 'tool-github' },
        status: 'awaiting_tools',
        updated_at: '2026-08-22T12:00:00.000Z',
      };
      let persistedGoal = structuredClone(originalGoal);
      let parkAttempts = 0;
      admin._insertErrors.agent_jobs = new Error('queue response unavailable');
      admin._interceptMaybeSingle(({ table, patch, conditions }) => {
        if (table === 'goals' && patch?.status === 'provisioning_tools') {
          persistedGoal = { ...persistedGoal, ...structuredClone(patch) };
          return { data: structuredClone(persistedGoal), error: null };
        }
        if (table === 'agent_jobs' && !patch) {
          if (conditions.find(([field]) => field === 'id')?.[1] === 'job-1') return undefined;
          return { data: null, error: new Error('queue reread unavailable') };
        }
        if (table === 'goals' && patch?.status === 'needs_human') {
          parkAttempts += 1;
          if (mode === 'response-loss') {
            persistedGoal = { ...persistedGoal, ...structuredClone(patch) };
            return { data: null, error: new Error('park response lost after commit') };
          }
          if (parkAttempts === 1) {
            return { data: null, error: new Error('park failed before commit') };
          }
          persistedGoal = { ...persistedGoal, ...structuredClone(patch) };
          return { data: structuredClone(persistedGoal), error: null };
        }
        if (table === 'goals' && !patch) {
          return { data: structuredClone(persistedGoal), error: null };
        }
        return undefined;
      });
      setupSuccessfulCredentialRegistration(admin, [originalGoal]);

      const res = await runRegistrationRequest();

      expect(res.body).toMatchObject({
        success: false,
        credentialStored: true,
        resumeSucceeded: false,
        resumeReconciliationRequired: true,
        resumeFailures: [{ goalId: 'goal-blocked-1', state: 'parked' }],
      });
      expect(parkAttempts).toBe(mode === 'response-loss' ? 1 : 2);
      expect(persistedGoal).toMatchObject({
        status: 'needs_human',
        updated_at: '2026-08-22T12:00:00.002Z',
        data: {
          credential_resume: {
            browser_job_id: 'job-1',
            status: 'reconciliation_required',
          },
        },
      });
      const transitionPatch = admin._recorded.updates.goals.find(
        (patch) => patch.status === 'provisioning_tools'
      );
      const parkPatches = admin._recorded.updates.goals.filter(
        (patch) => patch.status === 'needs_human'
      );
      expect(transitionPatch.updated_at).toBe('2026-08-22T12:00:00.001Z');
      expect(parkPatches.every((patch) => patch.updated_at === '2026-08-22T12:00:00.002Z')).toBe(
        true
      );
    }
  );

  it('rolls back after a confirmed Preview exact-wake failure and never reports resumed', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_DEPLOYMENT_ID', 'dpl_preview_a');
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    admin.single
      .mockResolvedValueOnce({
        data: {
          id: 'job-1',
          user_id: 'user-1',
          payload: {
            providerUrl: 'https://provider.com/signup',
            targetToolId: 'tool-github',
            _userId: 'user-1',
            _workerDeployment: 'vercel-deployment:dpl_preview_a',
          },
          status: 'running',
          retry_count: 0,
          worker_scope: 'preview',
          updated_at: '2026-08-22T12:00:00.000Z',
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: 'job-1' }, error: null });
    const originalGoal = {
      id: 'goal-blocked-1',
      user_id: 'user-1',
      data: { blocked_by_job_id: 'job-1', required_tool_id: 'tool-github' },
      status: 'awaiting_tools',
      updated_at: '2026-08-22T12:00:00.000Z',
    };
    let persistedGoal = structuredClone(originalGoal);
    let persistedContinuation = null;
    mockTriggerProcessNext.mockReturnValue(false);
    admin._interceptMaybeSingle((query) => {
      const { table, patch } = query;
      const exactJobId = conditionValue(query, 'id');
      if (table === 'goals' && patch?.status === 'provisioning_tools') {
        persistedGoal = { ...persistedGoal, ...structuredClone(patch) };
        return { data: structuredClone(persistedGoal), error: null };
      }
      if (table === 'agent_jobs' && patch?.status === 'failed' && exactJobId !== 'job-1') {
        const inserted = (admin._recorded.inserts.agent_jobs || []).find(
          (row) => row.id === exactJobId
        );
        persistedContinuation = {
          ...(persistedContinuation || inserted),
          ...structuredClone(patch),
        };
        return {
          data: { id: exactJobId, status: 'failed', updated_at: patch.updated_at },
          error: null,
        };
      }
      if (table === 'agent_jobs' && !patch && exactJobId !== 'job-1') {
        return { data: structuredClone(persistedContinuation), error: null };
      }
      if (table === 'goals' && patch?.status === 'awaiting_tools') {
        persistedGoal = { ...persistedGoal, ...structuredClone(patch) };
        return { data: { id: persistedGoal.id }, error: null };
      }
      return undefined;
    });
    setupSuccessfulCredentialRegistration(admin, [originalGoal]);

    const res = await runRegistrationRequest();

    expect(res.body).toMatchObject({
      success: false,
      credentialStored: true,
      resumeSucceeded: false,
      resumedGoalIds: [],
      resumeFailures: [expect.objectContaining({ state: 'enqueue-rolled-back' })],
    });
    expect(persistedContinuation).toMatchObject({ status: 'failed' });
    expect(persistedGoal).toMatchObject({ status: 'awaiting_tools', data: originalGoal.data });
    const notification = admin._recorded.inserts.notification_log[0];
    expect(notification.metadata.resumed_goal_ids).toEqual([]);
    expect(notification.body).not.toContain('Resumed');
  });

  it('treats resume audit failure as best effort after the continuation is durable', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    const originalGoal = {
      id: 'goal-blocked-1',
      user_id: 'user-1',
      data: { blocked_by_job_id: 'job-1' },
      status: 'awaiting_tools',
      updated_at: '2026-08-22T12:00:00.000Z',
    };
    admin._insertErrors.goal_log = new Error('audit unavailable');
    setupSuccessfulCredentialRegistration(admin, [originalGoal]);

    const res = await runRegistrationRequest();

    expect(res.body).toMatchObject({
      success: true,
      credentialStored: true,
      resumeSucceeded: true,
      resumedGoalIds: ['goal-blocked-1'],
    });
    expect(admin._recorded.inserts.agent_jobs).toHaveLength(1);
  });

  it('Phase 8d: phone verification happy path — rent, fill code, complete signup', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupCreds(admin, 'bl-key', 'cap-key');
    // Return SMS key from the same credentials-select chain by widening setupCreds:
    // easier path — stub the select override to include sms-verify too.
    admin.select.mockImplementation(function (cols) {
      if (cols === 'id, data') {
        const credResult = {
          data: [
            { id: 'tool-browser', data: { apiKey: 'bl-key' } },
            { id: 'tool-captcha-solver', data: { apiKey: 'cap-key' } },
            { id: 'tool-sms-verify', data: { apiKey: 'sms-key', provider: '5sim' } },
          ],
        };
        const inner = { eq: vi.fn().mockResolvedValue(credResult), in: vi.fn() };
        inner.in.mockReturnValue(inner);
        return inner;
      }
      return admin;
    });

    mockCreateEmail.mockResolvedValueOnce({
      address: 'test@mail.tm',
      password: 'pass',
      token: 'jwt',
    });
    // Signup form contains a tel input
    mockDetectsPhone.mockReturnValue(true);
    mockRentNumber.mockResolvedValueOnce({ activation_id: 'act-1', phone_number: '+15551234567' });
    mockWaitForSms.mockResolvedValueOnce({ code: '123456', full_sms: 'Your code is 123456' });
    mockReleaseNumber.mockResolvedValue(undefined);

    mockNavigate.mockImplementation(async (url) =>
      url.includes('signup')
        ? {
            html: '<form><input name="email"><input type="password"><input type="tel" name="phone"><button type="submit">Sign up</button></form>',
            status: 200,
          }
        : { html: DASHBOARD_WITH_KEY, status: 200 }
    );
    mockFillAndSubmit
      .mockResolvedValueOnce({
        html: '<html>We sent a code to your phone. Enter it here.</html>',
        success: true,
      }) // first submit returns code-entry UI
      .mockResolvedValueOnce({ html: '<html>Registered</html>', success: true }); // second submit with code succeeds
    mockCheckInbox.mockResolvedValue([]);

    const req = mockReq({ jobId: 'job-1' });
    const res = mockRes();
    const promise = handler(req, res);
    await advancePastEmailPoll();
    await promise;

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockRentNumber).toHaveBeenCalledTimes(1);
    expect(mockWaitForSms).toHaveBeenCalledTimes(1);
    expect(mockReleaseNumber).toHaveBeenCalledWith(
      'sms-key',
      'act-1',
      expect.objectContaining({ success: true })
    );
    const rentStep = res.body.steps.find((s) => s.step === 'rent-phone');
    expect(rentStep?.status).toBe('done');
    expect(rentStep?.phone).toBe('+15551234567');
    const verifyStep = res.body.steps.find((s) => s.step === 'verify-phone-code');
    expect(verifyStep?.status).toBe('done');
  });

  it('records an unrecoverable browser handoff as a failed job with trusted result proof', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    admin.single
      .mockResolvedValueOnce({
        data: {
          id: 'job-1',
          user_id: 'user-1',
          payload: {
            providerUrl: 'https://provider.com/signup',
            targetToolId: 'tool-github',
            blocking_goal_id: 'goal-blocked-1',
            _userId: 'user-1',
          },
          status: 'running',
          retry_count: 0,
          worker_scope: 'production',
          updated_at: '2026-08-22T12:00:00.000Z',
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: 'job-1' }, error: null });
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table === 'goals' && !patch) {
        return {
          data: {
            id: 'goal-blocked-1',
            data: { blocked_by_job_id: 'job-1', required_tool_id: 'tool-github' },
            status: 'awaiting_tools',
            updated_at: '2026-08-22T12:00:00.000Z',
          },
          error: null,
        };
      }
      if (table === 'goals' && patch?.data?.sandris_needs_human) {
        return { data: { id: 'goal-blocked-1' }, error: null };
      }
      return undefined;
    });
    let credentialsLoaded = false;
    admin.select.mockImplementation(function (cols) {
      if (cols === 'id, data' && !credentialsLoaded) {
        credentialsLoaded = true;
        const credResult = {
          data: [
            { id: 'tool-browser', data: {} },
            { id: 'tool-sms-verify', data: { provider: '5sim' } },
          ],
        };
        const inner = { eq: vi.fn().mockResolvedValue(credResult), in: vi.fn() };
        inner.in.mockReturnValue(inner);
        return inner;
      }
      return admin;
    });
    mockResolveToolCredential.mockImplementation(async ({ def }) => ({
      source: 'user',
      apiKey: def.id === 'tool-browser' ? 'bl-key' : 'sms-key',
      ready: true,
    }));
    mockCreateEmail.mockResolvedValueOnce({
      address: 'test@mail.tm',
      password: 'pass',
      token: 'jwt',
    });
    mockDetectsPhone.mockReturnValue(true);
    mockRentNumber.mockResolvedValueOnce({ activation_id: 'act-1', phone_number: '+15551234567' });
    mockWaitForSms.mockRejectedValueOnce(new Error('SMS verification timeout'));
    mockReleaseNumber.mockResolvedValueOnce(undefined);
    mockNavigate.mockResolvedValueOnce({
      html: '<form><input name="email"><input type="password"><input type="tel" name="phone"><button type="submit">Sign up</button></form>',
      status: 200,
    });
    mockFillAndSubmit.mockResolvedValueOnce({
      html: '<html>Enter phone verification code</html>',
      success: true,
    });

    const res = mockRes();
    await handler(mockReq({ jobId: 'job-1' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: false, needs_human: true });
    const terminalJobUpdate = (admin._recorded.updates.agent_jobs || []).find(
      (update) => update.result?.type === 'browser-task'
    );
    expect(terminalJobUpdate).toMatchObject({
      status: 'failed',
      error: 'phone verification failed: SMS verification timeout',
      result: {
        type: 'browser-task',
        needs_human: true,
        error: 'phone verification failed: SMS verification timeout',
      },
    });
    expect(terminalJobUpdate.status).not.toBe('needs_human');
    const goalMarkerUpdate = (admin._recorded.updates.goals || []).find(
      (update) => update.data?.sandris_needs_human
    );
    expect(goalMarkerUpdate.data.sandris_needs_human).toMatchObject({
      job_id: 'job-1',
      tool_id: 'tool-github',
      reason: 'phone verification failed: SMS verification timeout',
    });
    expect(admin.select).toHaveBeenCalledWith('id, user_id, data, status, updated_at');
    expect(admin.eq).toHaveBeenCalledWith('id', 'goal-blocked-1');
    expect(admin.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(admin.eq).toHaveBeenCalledWith('status', 'awaiting_tools');
    expect(admin.eq).toHaveBeenCalledWith('updated_at', '2026-08-22T12:00:00.000Z');
    expect(admin.contains).toHaveBeenCalledWith('data', { blocked_by_job_id: 'job-1' });
  });

  it('parks the exact blocking goal and returns reconciliation ids when its marker cannot commit', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    admin.single
      .mockResolvedValueOnce({
        data: {
          id: 'job-1',
          user_id: 'user-1',
          payload: {
            providerUrl: 'https://provider.com/signup',
            targetToolId: 'tool-github',
            blocking_goal_id: 'goal-blocked-1',
            _userId: 'user-1',
          },
          status: 'running',
          retry_count: 0,
          worker_scope: 'production',
          updated_at: '2026-08-22T12:00:00.000Z',
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: 'job-1' }, error: null });

    let persistedGoal = {
      id: 'goal-blocked-1',
      user_id: 'user-1',
      data: { blocked_by_job_id: 'job-1', required_tool_id: 'tool-github' },
      status: 'awaiting_tools',
      updated_at: '2026-08-22T12:00:00.000Z',
    };
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table !== 'goals') return undefined;
      if (!patch) return { data: structuredClone(persistedGoal), error: null };
      if (patch.data?.sandris_needs_human) {
        return { data: null, error: new Error('goal marker update unavailable') };
      }
      if (patch.status === 'needs_human' && patch.data?.browser_task_reconciliation) {
        persistedGoal = { ...persistedGoal, ...structuredClone(patch) };
        return { data: null, error: new Error('goal park response lost after commit') };
      }
      return undefined;
    });
    setupUnrecoverablePhoneTimeout(admin);

    const res = mockRes();
    await handler(mockReq({ jobId: 'job-1' }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({
      code: 'BROWSER_GOAL_HANDOFF_RECONCILIATION_REQUIRED',
      job_id: 'job-1',
      goal_id: 'goal-blocked-1',
      audit_run_id: 'job-1',
      goal_marker_state: 'needs-park',
      goal_park_state: 'parked',
    });
    expect(persistedGoal).toMatchObject({
      status: 'needs_human',
      data: {
        blocked_by_job_id: 'job-1',
        browser_task_reconciliation: {
          job_id: 'job-1',
          audit_run_id: res.body.audit_run_id,
        },
      },
    });
    expect(admin._recorded.updates.agent_jobs).toContainEqual(
      expect.objectContaining({
        status: 'failed',
        result: expect.objectContaining({
          reconciliation_required: true,
          blocking_goal_id: 'goal-blocked-1',
          goal_park_state: 'parked',
        }),
      })
    );
  });

  it('does not overwrite a blocking goal cancelled after the marker snapshot was read', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    admin.single
      .mockResolvedValueOnce({
        data: {
          id: 'job-1',
          user_id: 'user-1',
          payload: {
            providerUrl: 'https://provider.com/signup',
            targetToolId: 'tool-github',
            blocking_goal_id: 'goal-blocked-1',
            _userId: 'user-1',
          },
          status: 'running',
          retry_count: 0,
          worker_scope: 'production',
          updated_at: '2026-08-22T12:00:00.000Z',
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: 'job-1' }, error: null });

    let persistedGoal = {
      id: 'goal-blocked-1',
      user_id: 'user-1',
      data: { blocked_by_job_id: 'job-1', required_tool_id: 'tool-github' },
      status: 'awaiting_tools',
      updated_at: '2026-08-22T12:00:00.000Z',
    };
    admin._interceptMaybeSingle(({ table, patch }) => {
      if (table === 'goals' && !patch) {
        return { data: structuredClone(persistedGoal), error: null };
      }
      if (table === 'goals' && patch?.data?.sandris_needs_human) {
        // Simulate a user cancellation committed after the read but before the
        // conditional marker update reaches Postgres. The stale update must
        // match no row and therefore cannot restore the old goal snapshot.
        persistedGoal = {
          ...persistedGoal,
          data: { ...persistedGoal.data, cancelled_by: 'user-1' },
          status: 'cancelled',
          updated_at: '2026-08-22T12:01:00.000Z',
        };
        return { data: null, error: null };
      }
      return undefined;
    });

    let credentialsLoaded = false;
    admin.select.mockImplementation(function (cols) {
      if (cols === 'id, data' && !credentialsLoaded) {
        credentialsLoaded = true;
        const credResult = {
          data: [
            { id: 'tool-browser', data: {} },
            { id: 'tool-sms-verify', data: { provider: '5sim' } },
          ],
        };
        const inner = { eq: vi.fn().mockResolvedValue(credResult), in: vi.fn() };
        inner.in.mockReturnValue(inner);
        return inner;
      }
      return admin;
    });
    mockResolveToolCredential.mockImplementation(async ({ def }) => ({
      source: 'user',
      apiKey: def.id === 'tool-browser' ? 'bl-key' : 'sms-key',
      ready: true,
    }));
    mockCreateEmail.mockResolvedValueOnce({
      address: 'test@mail.tm',
      password: 'pass',
      token: 'jwt',
    });
    mockDetectsPhone.mockReturnValue(true);
    mockRentNumber.mockResolvedValueOnce({ activation_id: 'act-1', phone_number: '+15551234567' });
    mockWaitForSms.mockRejectedValueOnce(new Error('SMS verification timeout'));
    mockReleaseNumber.mockResolvedValueOnce(undefined);
    mockNavigate.mockResolvedValueOnce({
      html: '<form><input name="email"><input type="password"><input type="tel" name="phone"><button type="submit">Sign up</button></form>',
      status: 200,
    });
    mockFillAndSubmit.mockResolvedValueOnce({
      html: '<html>Enter phone verification code</html>',
      success: true,
    });

    const res = mockRes();
    await handler(mockReq({ jobId: 'job-1' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: false, needs_human: true });
    expect(persistedGoal).toMatchObject({
      status: 'cancelled',
      updated_at: '2026-08-22T12:01:00.000Z',
      data: {
        blocked_by_job_id: 'job-1',
        cancelled_by: 'user-1',
      },
    });
    expect(persistedGoal.data.sandris_needs_human).toBeUndefined();
    expect(admin.eq).toHaveBeenCalledWith('status', 'awaiting_tools');
    expect(admin.eq).toHaveBeenCalledWith('updated_at', '2026-08-22T12:00:00.000Z');
    expect(admin.contains).toHaveBeenCalledWith('data', { blocked_by_job_id: 'job-1' });
  });

  it('Phase 1 D: notifications insert throws — signup still reports success', async () => {
    const admin = mockAdmin();
    buildSupabaseAdminClient.mockReturnValue(admin);
    setupCreds(admin);
    admin._insertErrors.notification_log = new Error('notification_log table unreachable');

    mockCreateEmail.mockResolvedValueOnce({
      address: 'test@mail.tm',
      password: 'pass',
      token: 'jwt',
    });
    mockNavigate.mockImplementation(async (url) =>
      url.includes('signup')
        ? { html: SIGNUP_FORM, status: 200 }
        : { html: DASHBOARD_WITH_KEY, status: 200 }
    );
    mockFillAndSubmit.mockResolvedValueOnce({ html: '<html>Registered</html>', success: true });
    mockCheckInbox.mockResolvedValue([]);

    const req = mockReq({ jobId: 'job-1' });
    const res = mockRes();
    const promise = handler(req, res);
    await advancePastEmailPoll();
    await promise;

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.credentialStored).toBe(true);
    expect(res.body.apiKey).toBeUndefined();
    expect(admin._recorded.inserts.notification_log).toBeUndefined();

    const notifyStep = res.body.steps.find((s) => s.step === 'notify-ready');
    expect(notifyStep).toBeDefined();
    expect(notifyStep.status).toBe('failed');
    expect(notifyStep.error).toContain('notification_log table unreachable');
  });
});
