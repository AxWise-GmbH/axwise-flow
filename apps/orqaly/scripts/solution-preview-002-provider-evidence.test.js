// Synthetic metadata tests the audit only; no cloud or n8n calls run here.
import { describe, expect, it } from 'vitest';
import { canonicalJsonSha256 as hash } from '../services/agentic-control-plane/src/domain/canonical.js';
import { compileSolutionWorkflow } from '../server/workflow-v2/solution-compiler.js';
import {
  parseProviderArguments,
  verifyOrqalyReceiptSelection,
  verifyProviderRecords,
} from './solution-preview-002-provider-evidence.mjs';

const buildId = '8b606adc-91ba-46e5-86da-ece609df9c7d';
const expected = {
  buildId,
  workflowId: 'Provider002Workflow',
  versionId: '55555555-5555-4555-8555-555555555555',
  executionIds: ['1', '2'],
};
function fixture() {
  const spec = {
    kind: 'webhook_transform_v1',
    fields: [
      { source: 'name', target: 'customer_name', transform: 'trim' },
      { source: 'email', target: 'email', transform: 'lowercase' },
    ],
  };
  const { workflow } = compileSolutionWorkflow({ id: buildId, spec });
  return {
    expected,
    desiredWorkflow: workflow,
    providerWorkflow: {
      ...structuredClone(workflow),
      id: expected.workflowId,
      versionId: expected.versionId,
      activeVersionId: expected.versionId,
      active: true,
      isArchived: false,
    },
    executions: [],
    dataAvailability: [],
    receipts: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        execution_id: '1',
        mode: 'test',
        status: 'succeeded',
        workflow_hash: hash(workflow),
        input: { name: ' Ada ', email: 'ADA@EXAMPLE.COM' },
        output: { customer_name: 'Ada', email: 'ada@example.com' },
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        execution_id: '2',
        mode: 'production',
        status: 'succeeded',
        workflow_hash: hash(workflow),
        input: { name: ' Grace ', email: 'GRACE@EXAMPLE.COM' },
        output: { customer_name: 'Grace', email: 'grace@example.com' },
      },
    ],
  };
}
const row = (id, patch = {}) => ({
  id,
  workflowId: expected.workflowId,
  workflowVersionId: expected.versionId,
  mode: 'webhook',
  status: 'running',
  finished: false,
  startedAt: '2026-09-05T17:00:00.000Z',
  stoppedAt: null,
  deletedAt: '2026-09-05T16:00:00.000Z',
  ...patch,
});

describe('independent002 provider evidence boundaries', () => {
  it('verifies exact provider snapshot but never calls absent retained metadata successful', () => {
    const result = verifyProviderRecords(fixture());
    expect(result.providerWorkflowVerified).toBe(true);
    expect(result.retention).toEqual({
      saveDataSuccessExecution: 'none',
      saveDataErrorExecution: 'none',
      unchanged: true,
    });
    expect(result.providerFinalSuccessRecordsVerified).toBe(false);
    expect(result.providerExecutionIdsFound).toEqual([]);
    expect(
      result.executionMetadata.every((item) => item.retentionState === 'not_found_with_save_none')
    ).toBe(true);
    expect(result.canonicalOrqalyReceipts.map((item) => item.output.customer_name)).toEqual([
      'Ada',
      'Grace',
    ]);
    expect(result.canonicalOrqalyReceipts[0].payloadSource).toContain('not duplicated n8n payload');
  });

  it('reports soft-deleted running metadata without inventing a final status or payload', () => {
    const input = fixture();
    input.executions = [row('1'), row('2')];
    input.dataAvailability = [{ executionId: '1', payloadBytes: 1500 }];
    const result = verifyProviderRecords(input);
    expect(result.providerExecutionIdsFound).toEqual(['1', '2']);
    expect(result.providerFinalSuccessRecordsVerified).toBe(false);
    expect(result.executionMetadata[0]).toMatchObject({
      status: 'running',
      retentionState: 'soft_deleted_pending_prune',
      finished: false,
      providerPayloadRead: false,
      payloadRowPresent: true,
      payloadBytes: 1500,
    });
  });

  it('reports independently recorded successful metadata only when status/time/version prove it', () => {
    const input = fixture();
    input.executions = ['1', '2'].map((id) =>
      row(id, {
        status: 'success',
        finished: true,
        stoppedAt: '2026-09-05T17:00:01.000Z',
        deletedAt: null,
      })
    );
    expect(verifyProviderRecords(input).providerFinalSuccessRecordsVerified).toBe(true);
    input.executions[0].workflowVersionId = null;
    expect(verifyProviderRecords(input).providerFinalSuccessRecordsVerified).toBe(false);
  });

  it('accepts only the explicitly inert provider defaults', () => {
    const input = fixture();
    Object.assign(input.providerWorkflow.settings, {
      callerPolicy: 'workflowsFromSameOwner',
      availableInMCP: false,
    });
    expect(verifyProviderRecords(input).providerWorkflowVerified).toBe(true);
  });

  it.each([
    [
      'provider identity',
      (x) => {
        x.providerWorkflow.id = 'anotherWorkflow';
      },
    ],
    [
      'provider version',
      (x) => {
        x.providerWorkflow.versionId = 'anotherVersion';
      },
    ],
    [
      'unpublished snapshot',
      (x) => {
        x.providerWorkflow.activeVersionId = null;
      },
    ],
    [
      'inactive workflow',
      (x) => {
        x.providerWorkflow.active = false;
      },
    ],
    [
      'node drift',
      (x) => {
        x.providerWorkflow.nodes[0].position = [999, 999];
      },
    ],
    [
      'retention drift',
      (x) => {
        x.providerWorkflow.settings.saveDataSuccessExecution = 'all';
      },
    ],
    [
      'extra execution setting',
      (x) => {
        x.providerWorkflow.settings.errorWorkflow = 'otherWorkflow';
      },
    ],
    [
      'MCP exposure',
      (x) => {
        x.providerWorkflow.settings.availableInMCP = true;
      },
    ],
    [
      'unrequested execution',
      (x) => {
        x.executions = [row('3')];
      },
    ],
    [
      'wrong execution workflow',
      (x) => {
        x.executions = [row('1', { workflowId: 'other' })];
      },
    ],
    [
      'wrong execution version',
      (x) => {
        x.executions = [row('1', { workflowVersionId: 'other' })];
      },
    ],
    [
      'manual invocation',
      (x) => {
        x.executions = [row('1', { mode: 'manual' })];
      },
    ],
  ])('rejects %s rather than weakening the evidence', (_name, mutate) => {
    const input = fixture();
    mutate(input);
    expect(() => verifyProviderRecords(input)).toThrow();
  });

  it('redacts non-allowlisted values rather than printing arbitrary receipt payloads', () => {
    const input = fixture();
    input.receipts[0].input = { email: 'actual@customer-domain.com' };
    expect(verifyProviderRecords(input).canonicalOrqalyReceipts[0].input).toBeNull();
  });

  it('requires exact approved Build and bounded unique explicit receipt IDs before connecting', () => {
    expect(
      parseProviderArguments([buildId, expected.workflowId, expected.versionId, '1', '2'])
    ).toEqual(expected);
    for (const args of [
      [],
      ['other', expected.workflowId, expected.versionId, '1', '2'],
      [buildId, '../workflow', expected.versionId, '1', '2'],
      [buildId, expected.workflowId, expected.versionId, '1', '1'],
      [buildId, expected.workflowId, expected.versionId, '1', '0'],
      [buildId, expected.workflowId, expected.versionId, '1'],
    ]) {
      expect(() => parseProviderArguments(args)).toThrow();
    }
  });

  it('rejects a missing or foreign canonical Solution before opening the provider database', () => {
    expect(() =>
      verifyOrqalyReceiptSelection({ expected, solution: null, receipts: [] })
    ).toThrow();
    expect(() =>
      verifyOrqalyReceiptSelection({ expected, solution: { tenant_id: 'other' }, receipts: [] })
    ).toThrow();
  });
});
