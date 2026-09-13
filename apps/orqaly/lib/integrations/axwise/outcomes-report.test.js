import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./orchestration-client.js', () => ({
  submitOrchestrationOutcome: vi.fn(),
}));

import { submitOrchestrationOutcome } from './orchestration-client.js';
import { AXWISE_OUTCOME_PROOF_LIMITS, reportGoalOutcome } from './outcomes.js';

function fixture() {
  const goal = {
    id: 'goal-1',
    user_id: 'user-1',
    org_id: 'org-1',
    iteration: 0,
    status: 'completed',
    data: {
      axwise_orchestration: { decision_id: 'decision-1', applied: true },
      completed_at: '2026-08-03T10:05:00.000Z',
    },
    created_at: '2026-08-03T10:00:00.000Z',
    updated_at: '2026-08-03T10:05:00.000Z',
  };
  const tasks = [
    {
      id: 'task-1',
      status: 'done',
      agent_id: 'agent-1',
      created_at: '2026-08-03T10:01:00.000Z',
      updated_at: '2026-08-03T10:04:00.000Z',
      data: {
        goal_id: goal.id,
        axwise_execution_context: { decision_id: 'decision-1', step_id: 'node-1' },
        output: 'sensitive deliverable text must not enter the audit row',
      },
    },
  ];
  return { goal, tasks };
}

function fakeAdmin({ goal, tasks }, { auditError = null } = {}) {
  const state = {
    goal: structuredClone(goal),
    tasks: structuredClone(tasks),
    audits: [],
    filters: { tasks: [], goalRead: [], goalUpdate: [] },
  };

  function queryResult(data, filters) {
    const query = {
      eq(key, value) {
        filters.push([key, value]);
        return query;
      },
      then(resolve, reject) {
        return Promise.resolve({ data: structuredClone(data), error: null }).then(resolve, reject);
      },
      async single() {
        return { data: structuredClone(data), error: null };
      },
    };
    return query;
  }

  const admin = {
    _state: state,
    from: vi.fn((table) => {
      if (table === 'team_tasks') {
        return { select: () => queryResult(state.tasks, state.filters.tasks) };
      }
      if (table === 'axwise_calls') {
        return {
          async insert(row) {
            if (auditError) return { error: { message: auditError } };
            state.audits.push(structuredClone(row));
            return { error: null };
          },
        };
      }
      if (table === 'goals') {
        return {
          select: () => {
            const query = queryResult({ data: state.goal.data }, state.filters.goalRead);
            return query;
          },
          update: (patch) => {
            const query = queryResult(null, state.filters.goalUpdate);
            const originalThen = query.then;
            query.then = (resolve, reject) => {
              state.goal = { ...state.goal, ...structuredClone(patch) };
              return originalThen(resolve, reject);
            };
            return query;
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }),
  };
  return admin;
}

describe('AxWise outcome reporting audit', () => {
  beforeEach(() => {
    submitOrchestrationOutcome.mockReset();
    submitOrchestrationOutcome.mockResolvedValue({
      outcome: { outcome_id: 'remote-outcome-1' },
      scorer_version: 'scorer-v1',
      evaluation: {
        evaluation_version: 'outcome-evaluator-v1',
        normalized_success: 0.95,
        safety_flags: [],
        promotable_observation: true,
      },
      reused: false,
    });
  });

  it('persists a bounded successful call proof and scopes all reads and writes to the tenant user', async () => {
    const data = fixture();
    const admin = fakeAdmin(data);

    const result = await reportGoalOutcome(admin, data.goal);

    expect(result.status).toBe('reported');
    expect(admin._state.audits).toHaveLength(1);
    expect(admin._state.audits[0]).toMatchObject({
      user_id: 'user-1',
      org_id: 'org-1',
      integration_point: 'goal.outcome',
      status: 'ok',
      degraded: false,
      applied_outcome: 'outcome-reported',
      request_payload: {
        task_id: 'goal-1',
        decision_id: 'decision-1',
        node_receipt_count: 1,
        execution_status: 'completed',
      },
      processed_outputs: {
        decision_id: 'decision-1',
        outcome_id: 'remote-outcome-1',
        normalized_success: 0.95,
        safety_flags: [],
        promotable_observation: true,
        reused: false,
      },
    });
    expect(JSON.stringify(admin._state.audits[0])).not.toContain('sensitive deliverable');
    expect(admin._state.filters.tasks).toContainEqual(['user_id', 'user-1']);
    expect(admin._state.filters.goalRead).toContainEqual(['user_id', 'user-1']);
    expect(admin._state.filters.goalUpdate).toContainEqual(['user_id', 'user-1']);
    expect(admin._state.goal.data.axwise_outcome).toMatchObject({
      outcome_id: 'remote-outcome-1',
      decision_id: 'decision-1',
    });
  });

  it('fails delivery when the durable call proof cannot be persisted', async () => {
    const data = fixture();
    const admin = fakeAdmin(data, { auditError: 'audit unavailable' });

    await expect(reportGoalOutcome(admin, data.goal)).rejects.toThrow(
      'Unable to persist AxWise outcome audit: audit unavailable'
    );
    expect(submitOrchestrationOutcome).toHaveBeenCalledOnce();
    expect(admin._state.goal.data.axwise_outcome).toBeUndefined();
  });

  it('deterministically bounds every persisted remote proof field without changing delivery identity', async () => {
    const omittedMarker = 'DO_NOT_PERSIST_RAW_PROOF_SUFFIX';
    const longValue = (prefix, size = 700) => `${prefix}-${'x'.repeat(size)}-${omittedMarker}`;
    const data = fixture();
    data.goal.id = longValue('goal');
    data.goal.data.axwise_orchestration.decision_id = longValue('decision');
    data.tasks[0].data.goal_id = data.goal.id;
    const remoteOutcomeId = longValue('remote-outcome');
    const scorerVersion = longValue('scorer');
    const evaluationVersion = longValue('evaluation');
    const rawSafetyFlags = [
      { code: longValue('flag-code'), raw_payload: omittedMarker },
      ...Array.from({ length: 39 }, (_, index) => longValue(`flag-${index}`)),
    ];
    const remoteRecord = {
      outcome: { outcome_id: remoteOutcomeId },
      scorer_version: scorerVersion,
      evaluation: {
        evaluation_version: evaluationVersion,
        normalized_success: 95,
        safety_flags: rawSafetyFlags,
        promotable_observation: true,
        raw_payload: { secret: omittedMarker },
      },
      reused: true,
      raw_payload: { secret: omittedMarker },
    };
    submitOrchestrationOutcome.mockResolvedValueOnce(remoteRecord);
    const admin = fakeAdmin(data);

    await reportGoalOutcome(admin, data.goal);

    const [rawDecisionId, , rawOutcome, submitOptions] =
      submitOrchestrationOutcome.mock.calls.at(-1);
    expect(rawDecisionId).toBe(data.goal.data.axwise_orchestration.decision_id);
    expect(rawOutcome.decision_id).toBe(data.goal.data.axwise_orchestration.decision_id);
    expect(submitOptions.idempotencyKey).toContain(data.goal.id);
    expect(submitOptions.idempotencyKey).toContain(rawDecisionId);

    const audit = admin._state.audits[0];
    const persistedOutcome = admin._state.goal.data.axwise_outcome;
    const limits = AXWISE_OUTCOME_PROOF_LIMITS;
    for (const value of [
      audit.trace_id,
      audit.request_payload.task_id,
      audit.request_payload.decision_id,
      audit.processed_outputs.decision_id,
      audit.processed_outputs.outcome_id,
      persistedOutcome.decision_id,
      persistedOutcome.outcome_id,
    ]) {
      expect(value.length).toBeLessThanOrEqual(limits.id);
      expect(value).toMatch(/~sha256:[a-f0-9]{16}$/);
    }
    expect(audit.request_id).toBe(rawOutcome.outcome_id);
    expect(audit.request_payload.outcome_id).toBe(rawOutcome.outcome_id);
    expect(audit.request_id.length).toBeLessThanOrEqual(limits.id);
    expect(audit.destination_url.length).toBeLessThanOrEqual(limits.destinationUrl);
    expect(audit.model.length).toBe(limits.modelVersion);
    expect(audit.processed_outputs.evaluation_version.length).toBe(limits.modelVersion);
    expect(persistedOutcome.evaluation_version.length).toBe(limits.modelVersion);
    expect(audit.processed_outputs.normalized_success).toBe(0.95);
    expect(persistedOutcome.normalized_success).toBe(0.95);

    expect(audit.processed_outputs.safety_flags).toHaveLength(limits.safetyFlagItems);
    expect(persistedOutcome.safety_flags).toEqual(audit.processed_outputs.safety_flags);
    for (const flag of audit.processed_outputs.safety_flags) {
      expect(typeof flag).toBe('string');
      expect(flag.length).toBeLessThanOrEqual(limits.safetyFlagLength);
    }

    const persistedProof = JSON.stringify({ audit, persistedOutcome });
    expect(persistedProof).not.toContain(omittedMarker);
    expect(persistedProof).not.toContain('raw_payload');
    expect(persistedProof.length).toBeLessThan(15_000);

    submitOrchestrationOutcome.mockResolvedValueOnce(remoteRecord);
    const retryAdmin = fakeAdmin(data);
    await reportGoalOutcome(retryAdmin, data.goal);
    expect(retryAdmin._state.audits[0].request_payload).toEqual(audit.request_payload);
    expect(retryAdmin._state.audits[0].processed_outputs).toEqual(audit.processed_outputs);
    expect(retryAdmin._state.goal.data.axwise_outcome).toMatchObject({
      outcome_id: persistedOutcome.outcome_id,
      decision_id: persistedOutcome.decision_id,
      evaluation_version: persistedOutcome.evaluation_version,
      safety_flags: persistedOutcome.safety_flags,
    });
  });
});
