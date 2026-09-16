// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { transition } from './state-machine.js';
import { canonicalHash } from './canonical.js';
import {
  validateCapabilityResultForInput,
  resolveCapabilityGrounding,
} from './capability-result-validation.js';
import { createWorkerEngine } from '../../server/workflow-v2/worker-engine.js';
import {
  fixture,
  uid,
  userId,
  tenantId,
  issuedAt,
  clone,
} from '../../server/workflow-v2/capability-work-test-helpers.js';

async function pendingAnalysis() {
  const f = fixture();
  await f.ready();
  const source = await f.admit(),
    draft = f.analysisDraft(source),
    runId = f.snapshot().run.id;
  const { review } = await f.service.prepareOperation({ userId }, runId, draft);
  await f.service.confirmOperation({ userId }, runId, f.confirm(draft, review));
  return f;
}
const metrics = (changes = {}) => ({
  latencyMs: 1,
  provider: 'google',
  model: 'synthetic-fixture',
  modelCalls: 1,
  usageComplete: false,
  budgetScope: 'invocation',
  inputTokens: null,
  outputTokens: null,
  totalTokens: null,
  searchCalls: 0,
  estimatedCostMicros: null,
  ...changes,
});

describe('capability transitions retain owner authority and bounded receipts', () => {
  it('blocks legacy owner events in a capability profile and capability events in a legacy profile', async () => {
    const f = fixture();
    await f.start();
    const initial = clone(f.plans[0].event);
    const snapshot = clone(f.snapshot());
    delete snapshot.run.workProfile;
    expect(() => transition(snapshot, initial)).toThrow(/capability commands require/);
    const legacyEvent = { ...initial, type: 'RunRequested' };
    delete legacyEvent.ownerCommandHash;
    delete legacyEvent.workProfile;
    legacyEvent.stageIds = {
      ...legacyEvent.stageIds,
      research: uid(60),
      planning: uid(61),
      gate2: uid(62),
      evaluation: uid(63),
      synthesis: uid(64),
    };
    expect(() => transition(f.snapshot(), legacyEvent)).toThrow(/explicit owner commands/);
  });
  it('refuses capability inputs in a legacy snapshot even for lifecycle events', async () => {
    const f = await pendingAnalysis(),
      attempt = f.activeAttempt(),
      snapshot = clone(f.snapshot());
    delete snapshot.run.workProfile;
    expect(() =>
      transition(snapshot, {
        type: 'ActivityFailed',
        eventId: uid(700),
        tenantId,
        runId: snapshot.run.id,
        occurredAt: issuedAt,
        stageId: attempt.stageId,
        attemptId: attempt.id,
        leaseToken: attempt.leaseToken,
        retryable: false,
        errorClass: 'fixture',
      })
    ).toThrow(/legacy Goals cannot execute/);
  });
  it('rejects stale leases and injected successors on capability completion', async () => {
    const f = await pendingAnalysis(),
      attempt = f.activeAttempt(),
      result = f.analysisResult(attempt);
    const event = {
      type: 'ActivityCompleted',
      eventId: uid(701),
      tenantId,
      runId: f.snapshot().run.id,
      occurredAt: issuedAt,
      stageId: attempt.stageId,
      attemptId: attempt.id,
      leaseToken: attempt.leaseToken,
      result,
      nextAttempts: [],
    };
    expect(() => transition(f.snapshot(), { ...event, leaseToken: uid(702) })).toThrow(/stale/);
    const injected = {
      stageId: uid(710),
      attemptId: uid(711),
      operationId: uid(712),
      inputHash: attempt.inputHash,
      inputPayload: attempt.inputPayload,
    };
    expect(() => transition(f.snapshot(), { ...event, nextAttempts: [injected] })).toThrow(
      /cannot queue/
    );
    const plan = transition(f.snapshot(), event);
    expect(plan.createAttempts).toEqual([]);
    expect(plan.outbox).toEqual([]);
  });
  it('paid failure cannot automatically create another operation or copy consent', async () => {
    const f = await pendingAnalysis(),
      attempt = f.activeAttempt();
    const event = {
      type: 'ActivityFailed',
      eventId: uid(703),
      tenantId,
      runId: f.snapshot().run.id,
      occurredAt: issuedAt,
      stageId: attempt.stageId,
      attemptId: attempt.id,
      leaseToken: attempt.leaseToken,
      retryable: true,
      errorClass: 'fixture',
      nextAttempt: {
        attemptId: uid(704),
        operationId: uid(705),
        inputHash: attempt.inputHash,
        inputPayload: attempt.inputPayload,
      },
    };
    expect(() => transition(f.snapshot(), event)).toThrow(/fresh owner confirmation/);
    delete event.nextAttempt;
    event.retryable = false;
    const plan = transition(f.snapshot(), event);
    expect(plan.createAttempts).toEqual([]);
    expect(plan.runMutation.patch.status).toBe('failed');
  });
  it.each(['modelCalls', 'inputTokens', 'outputTokens'])(
    'rejects a completion receipt exceeding invocation %s',
    async (field) => {
      const f = await pendingAnalysis(),
        attempt = f.activeAttempt(),
        result = f.analysisResult(attempt);
      const limitField = {
        modelCalls: 'maxModelCalls',
        inputTokens: 'maxInputTokens',
        outputTokens: 'maxOutputTokens',
      }[field];
      result.metrics = metrics({ [field]: attempt.inputPayload.limits[limitField] + 1 });
      expect(() =>
        validateCapabilityResultForInput(attempt.inputPayload, result, {
          operationId: attempt.operationId,
        })
      ).toThrow();
    }
  );
  it('keeps unknown token receipts unknown and refuses a different output operation identity', async () => {
    const f = await pendingAnalysis(),
      attempt = f.activeAttempt(),
      result = f.analysisResult(attempt);
    result.metrics = metrics();
    expect(
      validateCapabilityResultForInput(attempt.inputPayload, result, {
        operationId: attempt.operationId,
      }).metrics.inputTokens
    ).toBeNull();
    expect(() =>
      validateCapabilityResultForInput(attempt.inputPayload, result, { operationId: uid(706) })
    ).toThrow();
  });
  it('rejects ambiguous source records instead of overwriting them', () => {
    const duplicate = { artifactId: uid(710) };
    expect(() =>
      resolveCapabilityGrounding({ selectedGrounding: [] }, [duplicate, duplicate])
    ).toThrow();
  });
  it.each([false, true])(
    'worker enabled=%s never automatically retries failed paid work',
    async (enabled) => {
      const f = await pendingAnalysis(),
        attempt = f.activeAttempt(),
        snapshot = f.snapshot();
      const claim = {
        tenantId,
        runId: snapshot.run.id,
        stageId: attempt.stageId,
        attemptId: attempt.id,
        operationId: attempt.operationId,
        inputHash: attempt.inputHash,
        leaseToken: attempt.leaseToken,
        outboxId: uid(720),
        commandType: 'dispatch_activity',
        deliveryCount: 1,
      };
      const executor = {
        execute: vi.fn(async () => ({
          kind: 'failed',
          retryable: true,
          errorClass: 'SYNTHETIC_FAILURE',
        })),
      };
      const repository = {
        ...f.repository,
        claimOutbox: vi.fn(async () => claim),
        loadWorkerSnapshot: vi.fn(async () => clone(f.snapshot())),
        loadActivityContext: vi.fn(async () => ({
          ownerUserId: userId,
          ownerOrganizationId: null,
          stageKind: 'execution',
          stageId: attempt.stageId,
          attemptId: attempt.id,
          operationId: attempt.operationId,
          inputHash: attempt.inputHash,
          inputPayload: attempt.inputPayload,
          artifacts: [],
        })),
      };
      const before = f.snapshot().attempts.length;
      const engine = createWorkerEngine({
        repository,
        activityExecutor: executor,
        workerId: 'synthetic-worker',
        deploymentId: 'synthetic',
        capabilityWorkEnabled: enabled,
        clock: () => new Date(issuedAt),
      });
      await engine.processOne();
      expect(executor.execute).toHaveBeenCalledTimes(enabled ? 1 : 0);
      expect(f.snapshot().run.status).toBe('failed');
      expect(f.snapshot().attempts).toHaveLength(before);
      expect(f.plans.at(-1).event.retryable).toBe(false);
      expect(f.plans.at(-1).event.nextAttempt).toBeUndefined();
      expect(canonicalHash(f.plans.at(-1).event)).toBe(f.plans.at(-1).eventHash);
    }
  );
});
