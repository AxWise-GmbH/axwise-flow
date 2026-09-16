import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  admin: null,
  saveUserApiKey: vi.fn(),
  wakeAgentJobExact: vi.fn(),
}));

vi.mock('../../api/_lib/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), startTimer: () => vi.fn() }),
}));
vi.mock('../../api/_lib/auth.js', () => ({
  getBearerToken: vi.fn(() => 'token'),
  verifySupabaseToken: vi.fn(async () => ({ id: 'user-1' })),
}));
vi.mock('../../api/_lib/rate-limit.js', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
  getRateLimitIdentifier: vi.fn(() => 'id'),
  applyRateLimitHeaders: vi.fn(),
}));
vi.mock('../../api/_lib/cors.js', () => ({ cors: vi.fn() }));
vi.mock('../../api/_lib/errors.js', () => ({
  jsonError: vi.fn((res, code, message) => res.status(code).json({ error: message })),
  handleApiError: vi.fn((res, err) => res.status(500).json({ error: err.message })),
}));
vi.mock('./_shared/save-user-api-key.js', () => ({
  saveUserApiKey: mocks.saveUserApiKey,
}));
vi.mock('../security/persisted-credential-sanitizer.js', () => ({
  stripPersistedCredentials: (data) => data,
}));
vi.mock('../../api/_lib/supabase-server.js', () => ({
  buildSupabaseAdminClient: () => mocks.admin,
}));
vi.mock('../goal-handlers/_helpers.js', () => ({
  wakeAgentJobExact: mocks.wakeAgentJobExact,
}));

const { default: handler } = await import('./human-task-complete.js');
const { acceptedNativeGoalFixture } =
  await import('../_shared/native-goal-authority.test-fixture.js');
const { finalizeToolCredentialWrite, releaseToolCredentialWrite, reserveToolCredentialWrite } =
  await import('./_shared/tool-credential-write-reservation.js');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function contains(actual, expected) {
  if (expected === null || typeof expected !== 'object') return actual === expected;
  return Object.entries(expected).every(([key, value]) => contains(actual?.[key], value));
}

function makeAdmin({
  humanTask = {},
  tool = {},
  goal = null,
  rejectUpdate,
  jobInsertMode = 'success',
  goalTransitionMode = null,
  reservationModes = [],
  finalizationModes = [],
} = {}) {
  const state = {
    humanTask: {
      id: 'ht-2',
      type: 'provide_credential',
      status: 'pending',
      user_id: 'user-1',
      tool_id: 'tool-example',
      goal_id: null,
      claimed_at: null,
      escalated_at: null,
      escalation_allowed: false,
      escalate_after_seconds: null,
      partial_context: {},
      updated_at: '2026-08-22T10:00:00.000Z',
      ...humanTask,
    },
    tool: {
      id: 'tool-example',
      user_id: 'user-1',
      name: 'Example',
      status: 'draft',
      data: {},
      updated_at: '2026-08-22T09:30:00.000Z',
      ...tool,
    },
    goal: goal
      ? (() => {
          const teamAttempt = {
            version: 'orqaly_team_formation_attempt_v1',
            attempt_id: 'team-attempt-1',
            status: 'completed',
            completed_at: '2026-08-22T08:58:00.000Z',
          };
          return {
            id: 'goal-1',
            user_id: 'user-1',
            status: 'awaiting_tools',
            updated_at: '2026-08-22T09:00:00.000Z',
            ...goal,
            data: {
              blocked_by_human_task_id: 'ht-2',
              team_formation_attempt: teamAttempt,
              tool_provisioning_attempt: {
                version: 'orqaly_tool_provisioning_attempt_v1',
                attempt_id: 'tool-attempt-1',
                team_formation_attempt_id: teamAttempt.attempt_id,
                status: 'awaiting_user',
                completed_at: '2026-08-22T08:59:00.000Z',
              },
              ...(goal.data || {}),
            },
          };
        })()
      : null,
    jobs: [],
    operations: [],
    touch: 0,
    goalTransitionMode,
    goalInspectionError: false,
    taskInspectionError: false,
    reservationModes: [...reservationModes],
    finalizationModes: [...finalizationModes],
  };

  function rowsFor(table) {
    if (table === 'human_tasks') return [state.humanTask];
    if (table === 'tools') return [state.tool];
    if (table === 'goals') return state.goal ? [state.goal] : [];
    if (table === 'agent_jobs') return state.jobs;
    return [];
  }

  function makeQuery(table, operation = 'select', payload = null) {
    const filters = [];
    let returning = false;
    let evaluated = false;
    let result;

    function fieldValue(row, field) {
      if (field === 'data->>blocked_by_human_task_id') {
        return row?.data?.blocked_by_human_task_id;
      }
      if (field === 'data->credential_resume->>attempt_id') {
        return row?.data?.credential_resume?.attempt_id;
      }
      const nestedDataText = field.match(/^data->([^>]+)->>(.+)$/);
      if (nestedDataText) {
        const value = row?.data?.[nestedDataText[1]]?.[nestedDataText[2]];
        return value == null ? null : String(value);
      }
      if (field.startsWith('data->>')) {
        const value = row?.data?.[field.slice('data->>'.length)];
        return value == null ? null : String(value);
      }
      if (field.startsWith('data->')) {
        return row?.data?.[field.slice('data->'.length)] ?? null;
      }
      return row?.[field];
    }

    function matches(row) {
      return filters.every(({ kind, field, value }) => {
        const actual = fieldValue(row, field);
        if (kind === 'eq') return actual === value;
        if (kind === 'is') return actual === value;
        if (kind === 'in') return value.includes(actual);
        if (kind === 'contains') return contains(actual, value);
        return false;
      });
    }

    async function evaluate() {
      if (evaluated) return result;
      evaluated = true;
      const row = rowsFor(table).find(matches) || null;
      if (operation === 'select') {
        if (table === 'goals' && state.goalInspectionError) {
          result = { data: null, error: { message: 'goal inspection unavailable' } };
          return result;
        }
        if (table === 'human_tasks' && state.taskInspectionError) {
          result = { data: null, error: { message: 'task inspection unavailable' } };
          return result;
        }
        result = { data: row && matches(row) ? clone(row) : null, error: null };
        return result;
      }
      if (operation === 'update') {
        const matched = row && matches(row) && !rejectUpdate?.({ table, patch: payload, state });
        state.operations.push({ type: 'update', table, patch: clone(payload), matched });
        const isReservation =
          table === 'human_tasks' &&
          payload.partial_context?.credential_completion?.status === 'storing';
        const isFinalization =
          table === 'human_tasks' &&
          payload.status === 'completed' &&
          payload.submitted_value?.credential_stored === true;
        const responseModes = isReservation
          ? state.reservationModes
          : isFinalization
            ? state.finalizationModes
            : null;
        if (responseModes?.length) {
          const mode = responseModes.shift();
          if ((mode === 'error_committed' || mode === 'throw_committed') && matched) {
            Object.assign(row, clone(payload));
            state.touch += 1;
            row.updated_at = new Date(
              Date.parse('2026-08-22T10:00:00.000Z') + state.touch
            ).toISOString();
          }
          if (mode === 'error_conflict' && row) {
            Object.assign(row, {
              status: 'claimed',
              partial_context: {
                ...(row.partial_context || {}),
                credential_completion: {
                  attempt_id: 'competing-attempt',
                  status: 'storing',
                },
              },
              updated_at: '2026-08-22T10:04:00.000Z',
            });
          }
          if (mode === 'error_unknown') state.taskInspectionError = true;
          if (mode === 'throw_committed') throw new Error(`${table} ${mode}`);
          result = { data: null, error: { message: `${table} ${mode}` } };
          return result;
        }
        if (
          table === 'goals' &&
          payload.status === 'provisioning_tools' &&
          state.goalTransitionMode
        ) {
          const mode = state.goalTransitionMode;
          state.goalTransitionMode = null;
          if (mode === 'error_committed' && matched) {
            Object.assign(row, clone(payload), {
              updated_at: payload.updated_at.replace('Z', '+00:00'),
            });
          }
          if (mode === 'error_committed_then_edited' && matched) {
            Object.assign(row, clone(payload), {
              data: { ...clone(payload.data), concurrent_user_edit: true },
              updated_at: payload.updated_at.replace('Z', '+00:00'),
            });
          }
          if (mode === 'error_conflict' && row) {
            Object.assign(row, {
              status: 'cancelled',
              data: { ...(row.data || {}), cancelled_by: 'user-1' },
              updated_at: '2026-08-22T10:03:00.000Z',
            });
          }
          if (mode === 'error_unknown') state.goalInspectionError = true;
          result = { data: null, error: { message: `goal transition ${mode}` } };
          return result;
        }
        if (matched) {
          Object.assign(row, clone(payload));
          if (table === 'human_tasks') {
            state.touch += 1;
            row.updated_at = new Date(
              Date.parse('2026-08-22T10:00:00.000Z') + state.touch
            ).toISOString();
          }
        }
        result = { data: matched && returning ? clone(row) : null, error: null };
        return result;
      }
      state.operations.push({ type: 'insert', table, payload: clone(payload) });
      if (table === 'agent_jobs') {
        if (jobInsertMode === 'error_absent') {
          result = { data: null, error: { message: 'queue insert failed' } };
          return result;
        }
        const insertedJob = clone(payload);
        // Mirror migration 196's BEFORE INSERT trigger: goal-local work is
        // forced into the local queue without rewriting its payload.
        const targetGoalId = insertedJob.payload?.goalId || insertedJob.payload?.parentGoalId;
        if (targetGoalId === state.goal?.id && state.goal?.data?.local_only === true) {
          insertedJob.worker_scope = 'local';
        }
        state.jobs.push(insertedJob);
        if (jobInsertMode === 'throw_committed') {
          throw new Error('connection dropped after commit');
        }
      }
      result = { data: null, error: null };
      return result;
    }

    const query = {
      eq(field, value) {
        filters.push({ kind: 'eq', field, value });
        return query;
      },
      is(field, value) {
        filters.push({ kind: 'is', field, value });
        return query;
      },
      in(field, value) {
        filters.push({ kind: 'in', field, value });
        return query;
      },
      contains(field, value) {
        filters.push({ kind: 'contains', field, value });
        return query;
      },
      select() {
        returning = true;
        return query;
      },
      maybeSingle: evaluate,
      then(resolve, reject) {
        return evaluate().then(resolve, reject);
      },
    };
    return query;
  }

  const admin = {
    from: (table) => ({
      select: () => makeQuery(table),
      update: (patch) => makeQuery(table, 'update', patch),
      insert: (payload) => makeQuery(table, 'insert', payload),
    }),
  };
  return { admin, state };
}

function mockRes() {
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
  return { method: 'POST', headers: {}, body: { human_task_id: 'ht-2', ...body } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.wakeAgentJobExact.mockResolvedValue({ triggered: true });
  mocks.saveUserApiKey.mockImplementation(async ({ adminClient, toolCredentialReservation }) => {
    const finalized = await finalizeToolCredentialWrite({
      admin: adminClient,
      reservation: toolCredentialReservation,
    });
    return finalized.ok
      ? { success: true, row: { id: 'stored-key' } }
      : { success: false, ...finalized };
  });
});

describe('human-task-complete CAS mutations', () => {
  it('completes an integration brief with an owner/status-scoped update', async () => {
    const { admin, state } = makeAdmin({ humanTask: { type: 'integration_brief' } });
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ mark_done: true }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.marked_done).toBe(true);
    expect(state.humanTask).toMatchObject({ status: 'completed', completed_by: 'user' });
  });

  it('refuses mark_done on a credential task', async () => {
    const { admin, state } = makeAdmin();
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ mark_done: true }), res);

    expect(res.statusCode).toBe(400);
    expect(state.operations).toHaveLength(0);
  });

  it('refuses API-key submission on an integration brief', async () => {
    const { admin, state } = makeAdmin({ humanTask: { type: 'integration_brief' } });
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ api_key: 'not-for-this-task' }), res);

    expect(res.statusCode).toBe(400);
    expect(mocks.saveUserApiKey).not.toHaveBeenCalled();
    expect(state.operations).toHaveLength(0);
  });

  it('still demands a key when neither claim_only nor mark_done is set', async () => {
    const { admin } = makeAdmin();
    mocks.admin = admin;
    const res = mockRes();
    await handler(request({}), res);
    expect(res.statusCode).toBe(400);
  });

  it('claims only a pending, unreserved owner task', async () => {
    const { admin, state } = makeAdmin();
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ claim_only: true }), res);

    expect(res.statusCode).toBe(200);
    expect(state.humanTask.status).toBe('claimed');
    expect(state.humanTask.claimed_at).toBeTruthy();
  });

  it('returns 409 when another writer wins the claim CAS', async () => {
    const { admin, state } = makeAdmin({
      rejectUpdate: ({ table, patch }) =>
        table === 'human_tasks' && patch.status === 'claimed' && !patch.partial_context,
    });
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ claim_only: true }), res);

    expect(res.statusCode).toBe(409);
    expect(state.humanTask.status).toBe('pending');
  });

  it('rejects claim and completion while paid-human dispatch is reserved', async () => {
    const { admin } = makeAdmin({
      humanTask: {
        escalated_at: '2026-08-22T10:01:00.000Z',
        escalation_result: { status: 'dispatching' },
      },
    });
    mocks.admin = admin;

    const claimRes = mockRes();
    await handler(request({ claim_only: true }), claimRes);
    const submitRes = mockRes();
    await handler(request({ api_key: 'different-secret-key' }), submitRes);

    expect(claimRes.statusCode).toBe(409);
    expect(submitRes.statusCode).toBe(409);
    expect(mocks.saveUserApiKey).not.toHaveBeenCalled();
  });

  it('owns an exclusive task reservation before storing a key', async () => {
    let finishStorage;
    mocks.saveUserApiKey.mockImplementationOnce(
      ({ adminClient, toolCredentialReservation }) =>
        new Promise((resolve) => {
          finishStorage = async () => {
            const finalized = await finalizeToolCredentialWrite({
              admin: adminClient,
              reservation: toolCredentialReservation,
            });
            resolve(
              finalized.ok
                ? { success: true, row: { id: 'stored-key' } }
                : { success: false, ...finalized }
            );
          };
        })
    );
    const { admin, state } = makeAdmin();
    mocks.admin = admin;

    const firstRes = mockRes();
    const first = handler(request({ api_key: 'first-secret-key' }), firstRes);
    await vi.waitFor(() => expect(mocks.saveUserApiKey).toHaveBeenCalledTimes(1));

    expect(state.humanTask.partial_context.credential_completion).toMatchObject({
      status: 'storing',
      attempt_id: expect.any(String),
    });

    const secondRes = mockRes();
    await handler(request({ api_key: 'second-secret-key' }), secondRes);
    expect(secondRes.statusCode).toBe(409);
    expect(mocks.saveUserApiKey).toHaveBeenCalledTimes(1);

    await finishStorage();
    await first;
    expect(firstRes.statusCode).toBe(200);
    expect(state.humanTask.status).toBe('completed');
    expect(state.humanTask.partial_context.credential_completion).toBeUndefined();
  });

  it.each(['error_committed', 'throw_committed'])(
    'rereads a committed completion reservation after %s response loss',
    async (mode) => {
      const { admin, state } = makeAdmin({ reservationModes: [mode] });
      mocks.admin = admin;

      const res = mockRes();
      await handler(request({ api_key: 'reservation-response-loss-key' }), res);

      expect(res.statusCode).toBe(200);
      expect(mocks.saveUserApiKey).toHaveBeenCalledTimes(1);
      expect(state.humanTask.status).toBe('completed');
      expect(state.humanTask.partial_context.credential_completion).toBeUndefined();
    }
  );

  it('retries a reservation only after proving the original task snapshot', async () => {
    const { admin, state } = makeAdmin({ reservationModes: ['error_original'] });
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ api_key: 'reservation-safe-retry-key' }), res);

    expect(res.statusCode).toBe(200);
    expect(mocks.saveUserApiKey).toHaveBeenCalledTimes(1);
    const reservationUpdates = state.operations.filter(
      (operation) =>
        operation.type === 'update' &&
        operation.patch.partial_context?.credential_completion?.status === 'storing'
    );
    expect(reservationUpdates).toHaveLength(2);
  });

  it('does not touch Vault when two failed reservation writes are proven absent', async () => {
    const { admin, state } = makeAdmin({
      reservationModes: ['error_original', 'error_original'],
    });
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ api_key: 'reservation-proven-absent-key' }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/retry safely/i);
    expect(mocks.saveUserApiKey).not.toHaveBeenCalled();
    expect(state.humanTask).toMatchObject({ status: 'pending', partial_context: {} });
  });

  it.each(['error_conflict', 'error_unknown'])(
    'fails closed before Vault when reservation inspection is %s',
    async (mode) => {
      const { admin, state } = makeAdmin({ reservationModes: [mode] });
      mocks.admin = admin;

      const res = mockRes();
      await handler(request({ api_key: 'reservation-conflict-key' }), res);

      expect(res.statusCode).toBe(503);
      expect(res.body.error).toMatch(/needs reconciliation/i);
      expect(mocks.saveUserApiKey).not.toHaveBeenCalled();
      if (mode === 'error_conflict') {
        expect(state.humanTask.partial_context.credential_completion).toMatchObject({
          attempt_id: 'competing-attempt',
        });
      }
    }
  );

  it('never stores a key when another submit wins the reservation CAS', async () => {
    const { admin, state } = makeAdmin({
      rejectUpdate: ({ table, patch }) =>
        table === 'human_tasks' &&
        patch.partial_context?.credential_completion?.status === 'storing',
    });
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ api_key: 'losing-secret-key' }), res);

    expect(res.statusCode).toBe(409);
    expect(mocks.saveUserApiKey).not.toHaveBeenCalled();
    expect(state.tool.status).toBe('draft');
  });

  it('does not reach Vault when another manual writer owns the tool reservation', async () => {
    const { admin, state } = makeAdmin();
    mocks.admin = admin;
    const manual = await reserveToolCredentialWrite({
      admin,
      userId: 'user-1',
      toolSnapshot: clone(state.tool),
      source: 'tool-setup',
      attemptId: 'manual-writer',
    });
    expect(manual.ok).toBe(true);

    const res = mockRes();
    await handler(request({ api_key: 'human-conflict-secret' }), res);

    expect(res.statusCode).toBe(409);
    expect(mocks.saveUserApiKey).not.toHaveBeenCalled();
    expect(state.humanTask.status).toBe('claimed');
    expect(state.humanTask.partial_context.credential_completion).toBeUndefined();
    expect(state.tool.data.credential_write_reservation).toMatchObject({
      attempt_id: 'manual-writer',
      status: 'storing',
    });
  });

  it('releases a failed Vault attempt into a retry-safe owner state', async () => {
    mocks.saveUserApiKey.mockImplementationOnce(
      async ({ adminClient, toolCredentialReservation }) => {
        const released = await releaseToolCredentialWrite({
          admin: adminClient,
          reservation: toolCredentialReservation,
        });
        return released.ok
          ? { success: false, code: 'VAULT_PUT_FAILED' }
          : { success: false, ...released };
      }
    );
    const { admin, state } = makeAdmin();
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ api_key: 'retryable-secret-key' }), res);

    expect(res.statusCode).toBe(503);
    expect(state.humanTask).toMatchObject({
      status: 'claimed',
      escalation_allowed: false,
      escalate_after_seconds: null,
    });
    expect(state.humanTask.partial_context.credential_completion).toBeUndefined();
  });

  it('does not time-take-over an old completion reservation', async () => {
    const { admin, state } = makeAdmin({
      humanTask: {
        status: 'claimed',
        claimed_at: '2026-08-22T09:00:00.000Z',
        partial_context: {
          preserved: 'context',
          credential_completion: {
            attempt_id: 'stale-attempt',
            status: 'storing',
            started_at: '2020-01-01T00:00:00.000Z',
          },
        },
      },
    });
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ api_key: 'replacement-secret-key' }), res);

    expect(res.statusCode).toBe(409);
    expect(mocks.saveUserApiKey).not.toHaveBeenCalled();
    expect(state.humanTask.partial_context.credential_completion).toMatchObject({
      attempt_id: 'stale-attempt',
      status: 'storing',
    });
  });

  it('durably queues an exact goal continuation before finalizing and waking', async () => {
    const { admin, state } = makeAdmin({
      humanTask: { goal_id: 'goal-1' },
      goal: {},
    });
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ api_key: 'continuation-secret-key' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.resumed_goal_id).toBe('goal-1');
    expect(state.goal).toMatchObject({ status: 'provisioning_tools' });
    expect(state.jobs).toHaveLength(1);
    expect(state.jobs[0]).toMatchObject({
      id: expect.any(String),
      status: 'queued',
      worker_scope: 'production',
      payload: {
        type: 'orchestrate-goal',
        action: 'tool-provisioning',
        goalId: 'goal-1',
        _userId: 'user-1',
      },
    });
    expect(state.goal.data.credential_resume.job_id).toBe(state.jobs[0].id);
    expect(state.goal.data.credential_resume).toMatchObject({
      next_action: 'tool-provisioning',
      source_team_formation_attempt_id: 'team-attempt-1',
      source_tool_provisioning_attempt_id: 'tool-attempt-1',
    });
    const queueIndex = state.operations.findIndex(
      (operation) => operation.type === 'insert' && operation.table === 'agent_jobs'
    );
    const completeIndex = state.operations.findIndex(
      (operation) =>
        operation.type === 'update' &&
        operation.table === 'human_tasks' &&
        operation.patch.status === 'completed'
    );
    expect(queueIndex).toBeGreaterThan(-1);
    expect(completeIndex).toBeGreaterThan(queueIndex);
    expect(mocks.wakeAgentJobExact).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ id: state.jobs[0].id })
    );
  });

  it('completes credential storage without reviving an unowned legacy tool checkpoint', async () => {
    const { admin, state } = makeAdmin({
      humanTask: { goal_id: 'goal-1' },
      goal: {
        data: {
          blocked_by_human_task_id: 'ht-2',
          tool_provisioning_attempt: {
            version: 'orqaly_tool_provisioning_attempt_v1',
            attempt_id: 'tool-attempt-1',
            team_formation_attempt_id: 'team-attempt-1',
            status: 'completed',
            completed_at: '2026-08-22T08:59:00.000Z',
          },
        },
      },
    });
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ api_key: 'stale-checkpoint-secret-key' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.resumed_goal_id).toBeNull();
    expect(state.humanTask.status).toBe('completed');
    expect(state.goal.status).toBe('awaiting_tools');
    expect(state.jobs).toEqual([]);
    expect(mocks.wakeAgentJobExact).not.toHaveBeenCalled();
  });

  it('resumes an accepted native checkpoint only through its exact mirrored attempts', async () => {
    const nativeGoal = acceptedNativeGoalFixture({
      id: 'goal-1',
      user_id: 'user-1',
      status: 'awaiting_tools',
    });
    const scopeHash = nativeGoal.data.axwise_customer_intelligence.scope_packet.scope_hash;
    const teamAttempt = {
      version: 'orqaly_team_formation_attempt_v1',
      attempt_id: 'native-team-attempt-1',
      scope_hash: scopeHash,
      status: 'completed',
      completed_at: '2026-08-22T08:58:00.000Z',
    };
    const toolAttempt = {
      version: 'orqaly_tool_provisioning_attempt_v1',
      attempt_id: 'native-tool-attempt-1',
      scope_hash: scopeHash,
      team_formation_attempt_id: teamAttempt.attempt_id,
      status: 'awaiting_user',
      completed_at: '2026-08-22T08:59:00.000Z',
    };
    nativeGoal.data = {
      ...nativeGoal.data,
      blocked_by_human_task_id: 'ht-2',
      team_formation_attempt: teamAttempt,
      native_team_formation_attempt: teamAttempt,
      tool_provisioning_attempt: toolAttempt,
      native_tool_provisioning_attempt: toolAttempt,
    };
    const { admin, state } = makeAdmin({
      humanTask: { goal_id: 'goal-1' },
      goal: nativeGoal,
    });
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ api_key: 'native-checkpoint-secret-key' }), res);

    expect(res.statusCode).toBe(200);
    expect(state.goal.status).toBe('provisioning_tools');
    expect(state.jobs).toHaveLength(1);
    expect(state.jobs[0].payload).toMatchObject({
      action: 'tool-provisioning',
      _teamFormationAttemptId: teamAttempt.attempt_id,
      _toolProvisioningAttemptId: toolAttempt.attempt_id,
    });
  });

  it.each(['error_committed', 'throw_committed'])(
    'rereads a committed final completion after %s response loss and still wakes',
    async (mode) => {
      const { admin, state } = makeAdmin({
        humanTask: { goal_id: 'goal-1' },
        goal: {},
        finalizationModes: [mode],
      });
      mocks.admin = admin;

      const res = mockRes();
      await handler(request({ api_key: 'completion-response-loss-key' }), res);

      expect(res.statusCode).toBe(200);
      expect(state.humanTask.status).toBe('completed');
      expect(state.jobs).toHaveLength(1);
      expect(mocks.wakeAgentJobExact).toHaveBeenCalledWith(
        admin,
        expect.objectContaining({ id: state.jobs[0].id })
      );
    }
  );

  it('retries final completion only after proving the reservation snapshot', async () => {
    const { admin, state } = makeAdmin({ finalizationModes: ['error_original'] });
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ api_key: 'completion-safe-retry-key' }), res);

    expect(res.statusCode).toBe(200);
    const completionUpdates = state.operations.filter(
      (operation) =>
        operation.type === 'update' &&
        operation.patch.status === 'completed' &&
        operation.patch.submitted_value?.credential_stored === true
    );
    expect(completionUpdates).toHaveLength(2);
  });

  it('retains the completion marker when two final writes are proven absent', async () => {
    const { admin, state } = makeAdmin({
      finalizationModes: ['error_original', 'error_original'],
    });
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ api_key: 'completion-proven-absent-key' }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body).toMatchObject({
      code: 'CREDENTIAL_COMPLETION_RECONCILIATION_REQUIRED',
      error: expect.stringMatching(/operator reconciliation/i),
    });
    expect(state.humanTask).toMatchObject({ status: 'claimed' });
    expect(state.humanTask.partial_context.credential_completion).toMatchObject({
      status: 'storing',
    });
    expect(mocks.wakeAgentJobExact).not.toHaveBeenCalled();
  });

  it.each(['error_conflict', 'error_unknown'])(
    'retains fail-closed completion state when finalization inspection is %s',
    async (mode) => {
      const { admin, state } = makeAdmin({ finalizationModes: [mode] });
      mocks.admin = admin;

      const res = mockRes();
      await handler(request({ api_key: 'completion-conflict-key' }), res);

      expect(res.statusCode).toBe(503);
      expect(res.body.error).toMatch(/needs reconciliation/i);
      expect(state.humanTask.status).toBe('claimed');
      expect(mocks.wakeAgentJobExact).not.toHaveBeenCalled();
    }
  );

  it('does not return success when the exact Preview wake rejects', async () => {
    mocks.wakeAgentJobExact.mockRejectedValueOnce(
      Object.assign(new Error('Preview exact worker wake was unavailable'), {
        code: 'PREVIEW_EXACT_WAKE_UNAVAILABLE',
      })
    );
    const { admin, state } = makeAdmin({
      humanTask: { goal_id: 'goal-1' },
      goal: {},
    });
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ api_key: 'preview-wake-failure-key' }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/could not be awakened/i);
    expect(res.body).toMatchObject({
      code: 'CREDENTIAL_CONTINUATION_PARKED',
      credential_stored: true,
      task_completed: true,
      goal_parked: true,
      reconciliation_state: 'committed',
    });
    expect(state.humanTask.status).toBe('completed');
    expect(state.goal).toMatchObject({
      status: 'needs_human',
      data: {
        credential_resume: {
          status: 'wake_failed',
          reconciliation_required: true,
        },
      },
    });
    expect(state.jobs).toHaveLength(1);
    expect(mocks.wakeAgentJobExact).toHaveBeenCalledTimes(1);
  });

  it('completes the credential without reviving a goal when the goal CAS loses', async () => {
    const { admin, state } = makeAdmin({
      humanTask: { goal_id: 'goal-1' },
      goal: {},
      rejectUpdate: ({ table, patch }) =>
        table === 'goals' && patch.status === 'provisioning_tools',
    });
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ api_key: 'cancel-race-secret-key' }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.resumed_goal_id).toBeNull();
    expect(state.humanTask.status).toBe('completed');
    expect(state.goal.status).toBe('awaiting_tools');
    expect(state.jobs).toHaveLength(0);
    expect(mocks.wakeAgentJobExact).not.toHaveBeenCalled();
  });

  it('verifies an ambiguously committed exact continuation before finalizing', async () => {
    const { admin, state } = makeAdmin({
      humanTask: { goal_id: 'goal-1' },
      goal: {},
      jobInsertMode: 'throw_committed',
    });
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ api_key: 'ambiguous-secret-key' }), res);

    expect(res.statusCode).toBe(200);
    expect(state.humanTask.status).toBe('completed');
    expect(state.jobs).toHaveLength(1);
    expect(mocks.wakeAgentJobExact).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ id: state.jobs[0].id })
    );
  });

  it('rereads a committed goal transition after response loss and queues the exact continuation', async () => {
    const { admin, state } = makeAdmin({
      humanTask: { goal_id: 'goal-1' },
      goal: {},
      goalTransitionMode: 'error_committed',
    });
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ api_key: 'goal-response-loss-key' }), res);

    expect(res.statusCode).toBe(200);
    expect(state.goal.status).toBe('provisioning_tools');
    expect(state.goal.data.credential_resume).toMatchObject({
      attempt_id: expect.any(String),
      job_id: expect.any(String),
      human_task_id: 'ht-2',
      status: 'queued',
    });
    expect(state.jobs).toHaveLength(1);
    expect(state.humanTask.status).toBe('completed');
  });

  it('releases the completion reservation when a failed goal transition is proven absent', async () => {
    const { admin, state } = makeAdmin({
      humanTask: { goal_id: 'goal-1' },
      goal: {},
      goalTransitionMode: 'error_original',
    });
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ api_key: 'goal-proven-absent-key' }), res);

    expect(res.statusCode).toBe(503);
    expect(state.goal).toMatchObject({
      status: 'awaiting_tools',
      data: { blocked_by_human_task_id: 'ht-2' },
    });
    expect(state.jobs).toHaveLength(0);
    expect(state.humanTask.status).toBe('claimed');
    expect(state.humanTask.partial_context.credential_completion).toBeUndefined();
  });

  it.each(['error_conflict', 'error_unknown', 'error_committed_then_edited'])(
    'retains the completion reservation when the goal transition is %s',
    async (goalTransitionMode) => {
      const { admin, state } = makeAdmin({
        humanTask: { goal_id: 'goal-1' },
        goal: {},
        goalTransitionMode,
      });
      mocks.admin = admin;

      const res = mockRes();
      await handler(request({ api_key: 'goal-reconciliation-key' }), res);

      expect(res.statusCode).toBe(503);
      expect(res.body.error).toMatch(/needs reconciliation/i);
      expect(state.jobs).toHaveLength(0);
      expect(state.humanTask.status).toBe('claimed');
      expect(state.humanTask.partial_context.credential_completion).toMatchObject({
        status: 'storing',
        attempt_id: expect.any(String),
      });
    }
  );

  it('accepts migration-forced local scope and leaves its durable row to the local poller', async () => {
    const localGoalId = '11111111-1111-4111-8111-111111111111';
    const previous = {
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID,
    };
    process.env.VERCEL = '1';
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_DEPLOYMENT_ID = 'dpl_local_credential';

    try {
      const { admin, state } = makeAdmin({
        humanTask: { goal_id: localGoalId },
        goal: {
          id: localGoalId,
          data: {
            blocked_by_human_task_id: 'ht-2',
            local_only: true,
          },
        },
        jobInsertMode: 'throw_committed',
      });
      mocks.admin = admin;
      mocks.wakeAgentJobExact.mockRejectedValueOnce(
        new Error('Preview exact wake must not target a local row')
      );

      const res = mockRes();
      await handler(request({ api_key: 'preview-local-secret-key' }), res);

      expect(res.statusCode).toBe(200);
      expect(state.humanTask.status).toBe('completed');
      expect(state.jobs).toHaveLength(1);
      expect(state.jobs[0]).toMatchObject({
        worker_scope: 'local',
        payload: {
          goalId: localGoalId,
          _workerDeployment: 'vercel-deployment:dpl_local_credential',
        },
      });
      expect(mocks.wakeAgentJobExact).not.toHaveBeenCalled();
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('rolls back the exact goal and releases the task when enqueue is proven absent', async () => {
    const { admin, state } = makeAdmin({
      humanTask: { goal_id: 'goal-1' },
      goal: {},
      jobInsertMode: 'error_absent',
    });
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ api_key: 'retry-resume-secret-key' }), res);

    expect(res.statusCode).toBe(503);
    expect(state.goal).toMatchObject({
      status: 'awaiting_tools',
      data: { blocked_by_human_task_id: 'ht-2' },
    });
    expect(state.humanTask.status).toBe('claimed');
    expect(state.humanTask.partial_context.credential_completion).toBeUndefined();
    expect(mocks.wakeAgentJobExact).not.toHaveBeenCalled();
  });

  it('retains the task reservation when an absent enqueue cannot be rolled back', async () => {
    const { admin, state } = makeAdmin({
      humanTask: { goal_id: 'goal-1' },
      goal: {},
      jobInsertMode: 'error_absent',
      rejectUpdate: ({ table, patch }) => table === 'goals' && patch.status === 'awaiting_tools',
    });
    mocks.admin = admin;

    const res = mockRes();
    await handler(request({ api_key: 'reconcile-secret-key' }), res);

    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/needs reconciliation/i);
    expect(state.goal.status).toBe('provisioning_tools');
    expect(state.humanTask.status).toBe('claimed');
    expect(state.humanTask.partial_context.credential_completion).toMatchObject({
      status: 'storing',
    });
    expect(mocks.wakeAgentJobExact).not.toHaveBeenCalled();
  });
});
