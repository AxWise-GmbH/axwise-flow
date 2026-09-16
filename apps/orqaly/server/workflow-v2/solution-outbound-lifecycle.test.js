// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { nativeOutboundFixture } from '../../scripts/fixtures/native-outbound-workflow.mjs';
import { normalizeNativeWorkflow } from './native-workflow-runtime-contract.js';
import {
  validateSolutionInvocationInput,
  nativeSolutionTestPlan,
  nativeEffectScopeHash,
  executeSolutionInvocation,
  assertNoUnresolvedNativeEffect,
  hasNativeAcceptanceCoverage,
  publicInvocation,
} from './solution-service.js';
function fixture() {
  const f = nativeOutboundFixture();
  const artifact = normalizeNativeWorkflow({ workflow: f.workflow, id: randomUUID() });
  return {
    ...f,
    id: randomUUID(),
    workflow: artifact.workflow,
    workflow_hash: artifact.workflowHash,
    environment_id: 'owned-env',
    nativeConnections: [
      {
        id: randomUUID(),
        environment_id: 'owned-env',
        credential_type: 'orqalyBoundedHttp',
        provider_credential_id: 'owned-native-id',
        scope: { targets: ['fixed'] },
      },
    ],
  };
}
describe('release-level outbound test consent and immutable evidence', () => {
  it('requires exact version approval only for live tests, not ordinary production input validation', () => {
    const solution = fixture();
    expect(() =>
      validateSolutionInvocationInput(solution, { event: 'ready' }, 'production')
    ).not.toThrow();
    for (const command of [
      {},
      { allowExternalEffects: true, workflowHash: 'b'.repeat(64) },
      { allowExternalEffects: false, workflowHash: solution.workflow_hash },
    ])
      expect(() =>
        validateSolutionInvocationInput(solution, { event: 'ready' }, 'test', command)
      ).toThrow('Approve this exact');
    expect(() =>
      validateSolutionInvocationInput(solution, { event: 'ready' }, 'test', {
        allowExternalEffects: true,
        workflowHash: solution.workflow_hash,
      })
    ).not.toThrow();
    expect(() =>
      validateSolutionInvocationInput(solution, { event: 'different' }, 'test', {
        allowExternalEffects: true,
        workflowHash: solution.workflow_hash,
      })
    ).toThrow('agreed acceptance');
  });
  it('does not dispatch when a connection/version changed after approval', async () => {
    const solution = fixture();
    const evidence = nativeSolutionTestPlan(solution, {
      allowExternalEffects: true,
      workflowHash: solution.workflow_hash,
    });
    const invocation = { id: randomUUID(), mode: 'test', input: { event: 'ready' }, evidence };
    const runtime = { testNative: vi.fn() };
    solution.nativeConnections[0].scope = { targets: ['different'] };
    expect(await executeSolutionInvocation(runtime, {}, solution, invocation)).toMatchObject({
      status: 'outcome_unknown',
    });
    expect(runtime.testNative).not.toHaveBeenCalled();
  });
  it('keeps explicit consent and real receiver receipt in test evidence without raw execution retention', async () => {
    const solution = fixture();
    const evidence = nativeSolutionTestPlan(solution, {
      allowExternalEffects: true,
      workflowHash: solution.workflow_hash,
    });
    const output = {
      delivery: 'accepted',
      statusCode: 200,
      connectionId: solution.nativeConnections[0].id,
    };
    const runtime = {
      testNative: vi
        .fn()
        .mockResolvedValue({
          status: 'succeeded',
          testArtifactHash: evidence.testArtifactHash,
          executionId: '42',
          output,
          responseStatus: 200,
          cleanup: { status: 'removed' },
          outboundDelivery: {
            delivery: 'accepted',
            connectionId: output.connectionId,
            nodeId: 'deliver',
          },
        }),
    };
    const result = await executeSolutionInvocation(runtime, {}, solution, {
      id: randomUUID(),
      mode: 'test',
      input: { event: 'ready' },
      evidence,
    });
    expect(runtime.testNative.mock.calls[0][1]).toMatchObject({
      allowExternalEffects: true,
      nativeConnections: solution.nativeConnections,
    });
    expect(result).toMatchObject({
      status: 'succeeded',
      evidence: {
        effectAuthorization: {
          allowExternalEffects: true,
          connectionScopeHash: nativeEffectScopeHash(solution),
        },
        outboundDelivery: { delivery: 'accepted' },
        testConfiguration: { saveDataErrorExecution: 'none' },
      },
    });
  });
  it('does not count unapproved, rejected or stale-connection test evidence toward activation', async () => {
    const solution = fixture();
    const result = {
      input: { event: 'ready' },
      output: {
        delivery: 'accepted',
        statusCode: 200,
        connectionId: solution.nativeConnections[0].id,
      },
      evidence: {
        testArtifactHash: 'a'.repeat(64),
        cleanup: { status: 'removed' },
        responseStatus: 200,
      },
    };
    const client = { query: vi.fn().mockResolvedValue({ rows: [result] }) };
    expect(await hasNativeAcceptanceCoverage(client, {}, solution)).toBe(false);
    result.evidence.effectAuthorization = {
      allowExternalEffects: true,
      workflowHash: solution.workflow_hash,
      connectionScopeHash: nativeEffectScopeHash(solution),
    };
    result.evidence.outboundDelivery = { delivery: 'rejected' };
    expect(await hasNativeAcceptanceCoverage(client, {}, solution)).toBe(false);
    result.evidence.outboundDelivery.delivery = 'accepted';
    expect(await hasNativeAcceptanceCoverage(client, {}, solution)).toBe(true);
    solution.nativeConnections[0].provider_credential_id = 'rotated';
    expect(await hasNativeAcceptanceCoverage(client, {}, solution)).toBe(false);
  });
  it('blocks new effects on durable unknown/running records, not only request-time busy state', async () => {
    const client = { query: vi.fn().mockResolvedValue({ rows: [{ id: randomUUID() }] }) };
    await expect(
      assertNoUnresolvedNativeEffect(client, { tenantId: randomUUID() }, fixture())
    ).rejects.toMatchObject({ code: 'SOLUTION_EFFECT_UNRESOLVED' });
    expect(client.query.mock.calls[0][0]).toContain("status IN ('running','outcome_unknown')");
  });
  it('labels genuine scheduled receipts without claiming a signed-in user executed them', () => {
    const scheduleId = randomUUID();
    expect(publicInvocation({ evidence: { scheduleId } }).actor).toEqual({
      kind: 'schedule',
      id: scheduleId,
      label: 'Scheduled run',
    });
    expect(publicInvocation({ evidence: { scheduleId: 'untrusted' } }).actor).toEqual({
      kind: 'user',
    });
  });
});
