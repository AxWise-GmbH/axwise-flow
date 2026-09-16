import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LifecycleError,
  computeTemporaryAgentExpiry,
  promoteAgent,
  transitionAgent,
  transitionRun,
  validateScheduleLifetime,
} from '../src/domain/lifecycle.js';

test('lifecycle tables accept only declared transitions', () => {
  assert.equal(transitionAgent('proposed', 'active'), 'active');
  assert.equal(transitionRun('planning', 'awaiting_plan_approval'), 'awaiting_plan_approval');
  assert.throws(
    () => transitionAgent('revoked', 'active'),
    (error) => error instanceof LifecycleError && error.code === 'agent_transition_invalid'
  );
});

test('only an active or paused temporary Agent can be promoted', () => {
  assert.deepEqual(promoteAgent({ kind: 'temporary', state: 'paused' }), {
    kind: 'persistent',
    state: 'paused',
    expiresAt: null,
  });
  assert.throws(() => promoteAgent({ kind: 'persistent', state: 'active' }));
});

test('temporary expiry is fixed from the originating terminal run', () => {
  assert.equal(
    computeTemporaryAgentExpiry('2026-09-04T10:00:00.000Z', 7).toISOString(),
    '2026-09-11T10:00:00.000Z'
  );
});

test('schedule claim must leave enough time before both completion bounds', () => {
  const result = validateScheduleLifetime({
    agentKind: 'temporary',
    agentExpiresAt: '2026-09-04T12:00:00.000Z',
    scheduleEndAt: '2026-09-04T12:00:00.000Z',
    scheduledFor: '2026-09-04T11:00:00.000Z',
    claimTime: '2026-09-04T11:30:00.000Z',
    maximumRunDurationSeconds: 1800,
  });
  assert.equal(result.runDeadline, '2026-09-04T12:00:00.000Z');
  assert.throws(
    () =>
      validateScheduleLifetime({
        agentKind: 'temporary',
        agentExpiresAt: '2026-09-04T12:00:00.000Z',
        scheduleEndAt: '2026-09-04T12:00:00.000Z',
        scheduledFor: '2026-09-04T11:00:00.000Z',
        claimTime: '2026-09-04T11:30:00.001Z',
        maximumRunDurationSeconds: 1800,
      }),
    (error) => error.code === 'schedule_run_cannot_finish_before_expiry'
  );
});
