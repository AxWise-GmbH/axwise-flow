// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { nativeOutboundFixture } from '../../scripts/fixtures/native-outbound-workflow.mjs';
import { bindNativeConnections, describeNativeConnection } from './native-workflow-connections.js';
import { matchingRevisionConnections, revisionConnectionRecords, revisionConnectionScopeHash } from './solution-revision-connection-store.js';
import { CreateSolutionRevisionConnectionSchema, RevokeSolutionRevisionConnectionSchema } from '../../shared/workflow-v2/solution-revision-connection-contracts.js';

const environmentId = 'owned-environment';
function fixture() {
  const { workflow, spec } = nativeOutboundFixture();
  const descriptor = describeNativeConnection({ requirement: spec.connections[0], workflow, environmentId });
  const record = { id: '281758f6-454b-4675-9935-0061574cdf75', requirement_id: 'receiver',
    credential_type: 'orqalyBoundedHttp', environment_id: environmentId,
    provider_credential_id: 'opaque-test-selector', scope: descriptor.scope, status: 'saved' };
  const revision = { workflow: bindNativeConnections(workflow, spec, [record], environmentId), spec };
  const solution = { tenant_id: 'd5d7b50a-c689-4ad1-8df9-42541e74676d', owner_user_id: 'user_owner',
    id: '3fd58465-4f6a-49e9-b5bd-f35a61b33560', environment_id: environmentId, nativeConnections: [record] };
  return { solution, revision, record, descriptor };
}
describe('revision connection metadata and explicit scope contracts', () => {
  it('requires explicit acknowledgement plus scope, graph and version pins', () => {
    const f = fixture();
    const command = { expectedVersion: 0, workflowHash: 'a'.repeat(64), requirementId: 'receiver',
      confirmedScopeHash: revisionConnectionScopeHash(f.descriptor, environmentId), acknowledge: true,
      credentials: { name: 'X-Test-Key', value: 'synthetic-only-not-a-provider-key' } };
    expect(CreateSolutionRevisionConnectionSchema.parse(command).expectedVersion).toBe(0);
    for (const missing of ['expectedVersion', 'workflowHash', 'confirmedScopeHash', 'acknowledge']) {
      const changed = { ...command }; delete changed[missing];
      expect(CreateSolutionRevisionConnectionSchema.safeParse(changed).success).toBe(false);
    }
    expect(CreateSolutionRevisionConnectionSchema.safeParse({ ...command, acknowledge: false }).success).toBe(false);
    const { credentials: _credentials, requirementId: _requirement, ...target } = command;
    expect(RevokeSolutionRevisionConnectionSchema.safeParse({ ...target, connectionId: f.record.id }).success).toBe(true);
  });
  it('binds scope confirmations to environment, requirement and dependency identity', () => {
    const { descriptor } = fixture();
    const original = revisionConnectionScopeHash(descriptor, environmentId);
    expect(revisionConnectionScopeHash(descriptor, 'different-environment')).not.toBe(original);
    expect(revisionConnectionScopeHash({ ...descriptor, id: 'another-requirement' }, environmentId)).not.toBe(original);
    expect(revisionConnectionScopeHash({ ...descriptor, dependencyId: 'handler' }, environmentId)).not.toBe(original);
  });
  it('inherits only exact already-bound selectors, never a provider or requirement-name match', () => {
    const { solution, revision, record } = fixture();
    expect(matchingRevisionConnections(solution, revision, [])).toMatchObject([{ id: record.id, dependency_id: null }]);
    delete revision.workflow.nodes[1].credentials;
    expect(matchingRevisionConnections(solution, revision, [record])).toEqual([]);
  });
  it.each(['different-id', 'different-destination', 'revoked', 'different-environment'])('rejects %s authority', (mode) => {
    const { solution, revision, record } = fixture();
    if (mode === 'different-id') revision.workflow.nodes[1].credentials.orqalyBoundedHttp.id = 'another-selector';
    if (mode === 'different-destination') revision.workflow.nodes[1].parameters.url = 'https://different.example/path';
    if (mode === 'revoked') record.status = 'revoked';
    if (mode === 'different-environment') record.environment_id = 'different';
    expect(matchingRevisionConnections(solution, revision, [])).toEqual([]);
  });
  it('queries only exact tenant/user/Solution metadata and does not request credential data', async () => {
    const { solution } = fixture();
    const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    await revisionConnectionRecords(client, solution);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3'),
      [solution.tenant_id, solution.owner_user_id, solution.id]);
    expect(client.query).toHaveBeenCalledTimes(1);
  });
});
