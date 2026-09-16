// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { nativeOutboundFixture } from '../../scripts/fixtures/native-outbound-workflow.mjs';
import { nativeOrderSpec, nativeOrderWorkflow } from './fixtures/native-order-routing.js';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import { createBoundedHttpPolicy } from './native-workflow-review.js';
import { nativeBundleHash } from './native-workflow-bundle.js';
import { createSolutionRevisionConnectionService } from './solution-revision-connection-service.js';
import { bindNativeConnections, describeNativeConnection } from './native-workflow-connections.js';
import { publicRevision } from './solution-revision-service.js';
import { SolutionError } from './solution-service.js';

const solutionId = '45b2f7cc-ee52-4979-92ae-48cbd021edb9';
const revisionId = 'c9b304dc-2b21-4964-9bbf-a7bb71feb7c9';
const tenantId = '9208d0ce-4028-4613-934a-a913af463b04';
const userId = 'user_setupowner';
const key = 'connection_request_001';
const secret = 'synthetic-credential-only';
const copy = (value) => structuredClone(value);
const deferred = () => {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};
function fixture() {
  const artifact = nativeOutboundFixture();
  const solution = {
    id: solutionId,
    tenant_id: tenantId,
    owner_user_id: userId,
    environment_id: 'owned-environment',
    nativeConnections: [],
    workflow: copy(artifact.workflow),
    spec: copy(artifact.spec),
    active_revision_id: null,
  };
  let revision = {
    id: revisionId,
    solution_id: solutionId,
    tenant_id: tenantId,
    owner_user_id: userId,
    version: 2,
    row_version: 0,
    status: 'draft',
    ...copy(artifact),
    base_workflow: copy(artifact.workflow),
    base_spec: copy(artifact.spec),
    workflow_hash: hash(artifact.workflow),
    review: null,
    tested_at: null,
    approved_at: null,
  };
  let records = [];
  let operations = [];
  let tenantStatus = 'active';
  let pendingInvocation = false;
  const query = vi.fn(async (sql, values) => {
    if (sql.startsWith('SELECT status FROM orqaly.tenants'))
      return { rows: [{ status: tenantStatus }] };
    if (sql.includes('SELECT * FROM orqaly.solution_revision_connections'))
      return { rows: copy(records) };
    if (sql.includes('SELECT id FROM orqaly.solution_invocations'))
      return { rows: pendingInvocation ? [{ id: 'unknown' }] : [] };
    if (sql.includes('INSERT INTO orqaly.solution_revision_connection_members'))
      return { rows: [] };
    if (sql.includes('INSERT INTO orqaly.solution_revision_connections')) {
      records.push({
        tenant_id: values[0],
        solution_id: values[1],
        revision_id: values[2],
        owner_user_id: values[3],
        id: values[4],
        member_id: values[5],
        requirement_id: values[6],
        member_requirement_id: values[7],
        environment_id: values[8],
        credential_type: values[9],
        scope: copy(values[10]),
        scope_hash: values[11],
        request_key: values[12],
        request_hash: values[13],
        status: 'creating',
        row_version: 0,
        provider_credential_id: null,
        updated_at: new Date().toISOString(),
      });
      return { rows: [] };
    }
    if (sql.includes('SELECT COALESCE(SUM(attempts)'))
      return {
        rows: [
          {
            attempts: operations
              .filter((item) => item.connection_id === values[4])
              .reduce((total, item) => total + item.attempts, 0),
          },
        ],
      };
    if (sql.includes('SELECT * FROM orqaly.solution_revision_connection_operations'))
      return { rows: copy(operations.filter((item) => item.request_key === values[4])) };
    if (sql.includes('INSERT INTO orqaly.solution_revision_connection_operations')) {
      operations.push({
        tenant_id: values[0],
        solution_id: values[1],
        revision_id: values[2],
        owner_user_id: values[3],
        connection_id: values[4],
        request_key: values[5],
        request_hash: values[6],
        status: 'pending',
        attempts: 1,
        updated_at: new Date().toISOString(),
      });
      return { rows: [] };
    }
    if (sql.includes('UPDATE orqaly.solution_revision_connection_operations')) {
      const operation = operations.find((item) => item.request_key === values[4]);
      operation.status = values[5] ?? 'pending';
      if (sql.includes('attempts=attempts+1')) operation.attempts++;
      operation.updated_at = new Date().toISOString();
      return { rows: [] };
    }
    if (sql.includes('UPDATE orqaly.solution_revision_connections')) {
      const record = records.find((entry) => entry.id === values[3]);
      if (sql.includes("AND status='creating'") && record.status !== 'creating')
        return { rows: [] };
      if (sql.includes("AND status='revoking'") && record.status !== 'revoking')
        return { rows: [] };
      record.status = values[4] ?? 'revoking';
      record.row_version++;
      record.updated_at = new Date().toISOString();
      if (sql.includes('provider_credential_id=$6')) record.provider_credential_id = values[5];
      if (sql.includes('revoked_at=CASE'))
        record.revoked_at = values[5] ? new Date().toISOString() : null;
      return { rows: [copy(record)] };
    }
    if (sql.includes('UPDATE orqaly.solution_revisions')) {
      if (records.some((entry) => ['creating', 'revoking'].includes(entry.status)))
        throw new Error('revision_connection_pending');
      Object.assign(revision, {
        workflow: copy(values[4]),
        workflow_hash: values[5],
        spec: copy(values[6]),
        status: 'draft',
        row_version: revision.row_version + 1,
        review: null,
        approved_at: null,
        approved_workflow_hash: null,
        tested_at: null,
        last_error: null,
      });
      return { rows: [copy(revision)] };
    }
    throw new Error(`Unexpected synthetic query: ${sql}`);
  });
  const runtime = {
    nativePolicy: vi.fn(() => createBoundedHttpPolicy({ imageDigest: `sha256:${'a'.repeat(64)}` })),
    createNativeCredential: vi.fn(async () => ({
      id: 'native-synthetic-selector',
      status: 'saved',
    })),
    reconcileNativeCredential: vi.fn(async (_scope, command) => ({
      status: 'removed',
      credentialId: command.credentialId,
    })),
  };
  const events = [];
  const service = createSolutionRevisionConnectionService({
    runtime,
    owner: async (auth) => {
      if (!auth.userId) throw new SolutionError('UNAUTHENTICATED', 'Sign in', 401);
      return { tenantId, userId: auth.userId };
    },
    tx: async (_scope, fn) => fn({ query }),
    findSolution: async (_client, scope, id) => {
      if (scope.userId !== userId || id !== solutionId)
        throw new SolutionError('SOLUTION_NOT_FOUND', 'Not found', 404);
      return copy(solution);
    },
    findRevision: async (_client, scope, id, selected) => {
      if (scope.userId !== userId || id !== solutionId || selected !== revisionId)
        throw new SolutionError('SOLUTION_REVISION_NOT_FOUND', 'Not found', 404);
      return copy(revision);
    },
    checkVersion: (value, expected, selectedHash) => {
      if (value.row_version !== expected || value.workflow_hash !== selectedHash)
        throw new SolutionError('SOLUTION_REVISION_CHANGED', 'Changed');
    },
    checkBundle: (value, selectedHash) => {
      if ((nativeBundleHash(value) || null) !== (selectedHash || null))
        throw new SolutionError('SOLUTION_REVISION_CHANGED', 'Changed bundle');
    },
    publicRevision,
    event: async (_client, _scope, _revision, _kind, details) => events.push(copy(details)),
  });
  const read = () => service.revisionSetup({ userId }, solutionId, revisionId);
  const command = async () => {
    const current = await read();
    return {
      expectedVersion: current.revision.rowVersion,
      workflowHash: current.revision.workflowHash,
      ...(current.revision.bundleHash ? { bundleHash: current.revision.bundleHash } : {}),
      requirementId: current.connectionRequirements[0].id,
      confirmedScopeHash: current.connectionRequirements[0].scopeHash,
      acknowledge: true,
      credentials: { name: 'X-Task-Key', value: secret },
    };
  };
  const create = (body, requestKey = key) =>
    service.createRevisionConnection({ userId }, solutionId, revisionId, body, requestKey);
  const revoke = async (requestKey = 'cleanup_request_001') => {
    const current = await read();
    const descriptor = current.connectionRequirements[0];
    return service.revokeRevisionConnection(
      { userId },
      solutionId,
      revisionId,
      {
        expectedVersion: current.revision.rowVersion,
        workflowHash: current.revision.workflowHash,
        ...(current.revision.bundleHash ? { bundleHash: current.revision.bundleHash } : {}),
        connectionId: descriptor.connectionId,
        confirmedScopeHash: descriptor.scopeHash,
        acknowledge: true,
      },
      requestKey
    );
  };
  return {
    service,
    runtime,
    query,
    solution,
    read,
    command,
    create,
    revoke,
    records: () => records,
    operations: () => operations,
    revision: () => revision,
    events,
    setTenant: (value) => {
      tenantStatus = value;
    },
    setPending: (value) => {
      pendingInvocation = value;
    },
    replaceRevision: (value) => {
      revision = value;
    },
  };
}

describe('revision-owned credential service (synthetic adapter)', () => {
  it('keeps child connection identity and hash separate from the unchanged main graph', async () => {
    const f = fixture();
    const child = nativeOutboundFixture();
    child.workflow.nodes = child.workflow.nodes.slice(0, 2);
    Object.assign(child.workflow.nodes[0], {
      type: 'n8n-nodes-base.errorTrigger',
      typeVersion: 1,
      parameters: {},
    });
    delete child.workflow.connections['Deliver event'];
    const workflow = nativeOrderWorkflow();
    const spec = nativeOrderSpec();
    workflow.settings = { ...workflow.settings, errorWorkflow: 'orqaly:error:alerts' };
    spec.ownedDependencies = [{ id: 'alerts', kind: 'error_handler', ...child }];
    f.replaceRevision({ ...f.revision(), workflow, workflow_hash: hash(workflow), spec });
    let described = await f.read();
    expect(described.connectionRequirements[0].canConnect).toBe(false);
    f.runtime.nativePolicy.mockImplementation(() => ({
      ...createBoundedHttpPolicy({ imageDigest: `sha256:${'a'.repeat(64)}` }),
      ownedErrorHandlers: true,
      backgroundExecution: 'instance_cpu_always',
    }));
    const command = await f.command();
    const mainHash = f.revision().workflow_hash;
    expect(command.requirementId).toBe('owned:alerts:receiver');
    described = await f.create(command);
    expect(described.revision.workflowHash).toBe(mainHash);
    expect(described.revision.bundleHash).not.toBe(command.bundleHash);
    expect(f.records()[0]).toMatchObject({
      member_id: 'alerts',
      requirement_id: 'owned:alerts:receiver',
      member_requirement_id: 'receiver',
    });
    expect(
      f.revision().spec.ownedDependencies[0].workflow.nodes[1].credentials.orqalyBoundedHttp.id
    ).toBe('native-synthetic-selector');
    expect(described.setup.ready).toBe(true);
  });
  it('shows and revokes the original saved destination after a draft changes, never the proposed replacement scope', async () => {
    const f = fixture();
    await f.create(await f.command());
    const originalScope = copy(f.records()[0].scope);
    const originalScopeHash = f.records()[0].scope_hash;
    f.revision().workflow.nodes[1].parameters.url = 'https://replacement.example.org/notify';
    f.revision().workflow_hash = hash(f.revision().workflow);
    f.revision().row_version++;
    const described = await f.read();
    expect(described.setup.ready).toBe(false);
    expect(described.connectionRequirements[0]).toMatchObject({
      status: 'stale',
      scope: originalScope,
      scopeHash: originalScopeHash,
      canConnect: false,
      canRevoke: true,
    });
    await f.revoke();
    expect(f.runtime.reconcileNativeCredential).toHaveBeenCalledTimes(1);
    const latest = await f.read();
    expect(latest.connectionRequirements[0].scope.targets[0].destination).toBe(
      'https://replacement.example.org/notify'
    );
    expect(latest.connectionRequirements[0].canConnect).toBe(true);
  });
  it('saves only the exact owner/draft/scope, binds an opaque selector, clears stale approval and never claims verified or delivered', async () => {
    const f = fixture();
    const original = hash(f.solution);
    const body = await f.command();
    Object.assign(f.revision(), {
      status: 'reviewed',
      review: { valid: true },
      tested_at: 'old-evidence',
    });
    const result = await f.create(body);
    expect(f.runtime.createNativeCredential).toHaveBeenCalledTimes(1);
    expect(result.setup.ready).toBe(true);
    expect(result.connectionRequirements[0].status).toBe('saved');
    expect(result.revision.status).toBe('draft');
    expect(result.revision.review).toBeNull();
    expect(result.revision.testedAt).toBeNull();
    expect(f.revision().workflow.nodes[1].credentials.orqalyBoundedHttp.id).toBe(
      'native-synthetic-selector'
    );
    expect(hash(f.solution)).toBe(original);
    expect(JSON.stringify([f.records(), f.operations(), f.events, result])).not.toContain(secret);
    expect(JSON.stringify(f.query.mock.calls)).not.toContain(secret);
    expect(f.runtime.reconcileNativeCredential).not.toHaveBeenCalled();
  });
  it('replays one creation key without another n8n POST even after the draft version changed', async () => {
    const f = fixture();
    const body = await f.command();
    await f.create(body);
    await f.create(body);
    expect(f.runtime.createNativeCredential).toHaveBeenCalledTimes(1);
    expect(f.records()).toHaveLength(1);
    await expect(
      f.create({ ...body, credentials: { name: 'X-Task-Key', value: 'different-synthetic-value' } })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('does not repeat a concurrent creating request and will not clean it while its bounded call is in flight', async () => {
    const f = fixture();
    const body = await f.command();
    const pending = deferred();
    f.runtime.createNativeCredential.mockReturnValue(pending.promise);
    const first = f.create(body);
    await vi.waitFor(() => expect(f.runtime.createNativeCredential).toHaveBeenCalledTimes(1));
    const duplicate = await f.create(body);
    expect(duplicate.connectionRequirements[0].status).toBe('creating');
    expect(duplicate.connectionRequirements[0].canRevoke).toBe(false);
    pending.resolve({ id: 'native-synthetic-selector', status: 'saved' });
    await first;
    expect(f.runtime.createNativeCredential).toHaveBeenCalledTimes(1);
  });
  it('records unknown creation without raw error details and cleans only its deterministic metadata identity', async () => {
    const f = fixture();
    const body = await f.command();
    f.runtime.createNativeCredential.mockRejectedValue(new Error(secret));
    const result = await f.create(body);
    expect(result.setup.ready).toBe(false);
    expect(result.connectionRequirements[0].status).toBe('create_unknown');
    await f.create(body);
    expect(f.runtime.createNativeCredential).toHaveBeenCalledTimes(1);
    expect(f.revision().workflow.nodes[1].credentials).toBeUndefined();
    const cleaned = await f.revoke();
    expect(f.runtime.reconcileNativeCredential).toHaveBeenCalledWith(
      { tenantId, userId },
      { environmentId: 'owned-environment', connectionId: f.records()[0].id, credentialId: null }
    );
    expect(f.records()[0].status).toBe('revoked');
    expect(cleaned.setup.ready).toBe(false);
  });
  it('requires exact absence evidence before marking cleanup revoked and bounds retries across request keys', async () => {
    const f = fixture();
    await f.create(await f.command());
    f.runtime.reconcileNativeCredential.mockResolvedValue({ status: 'unknown' });
    for (let index = 0; index < 5; index++) {
      const result = await f.revoke(`cleanup_request_${index}`);
      expect(result.connectionRequirements[0].status).toBe('revoke_unknown');
    }
    await expect(f.revoke('cleanup_request_extra')).rejects.toMatchObject({
      code: 'REVISION_CONNECTION_CLEANUP_LIMIT',
    });
    expect(f.runtime.reconcileNativeCredential).toHaveBeenCalledTimes(5);
    expect(f.records()[0].revoked_at).toBeNull();
  });
  it('revokes a saved exact credential, invalidates the draft and leaves the source release unchanged', async () => {
    const f = fixture();
    const source = hash(f.solution);
    await f.create(await f.command());
    const before = f.revision().workflow_hash;
    const result = await f.revoke();
    expect(f.runtime.reconcileNativeCredential).toHaveBeenCalledTimes(1);
    expect(f.records()[0].status).toBe('revoked');
    expect(f.revision().workflow_hash).not.toBe(before);
    expect(f.revision().workflow.nodes[1].credentials).toBeUndefined();
    expect(result.setup.ready).toBe(false);
    expect(hash(f.solution)).toBe(source);
  });
  it.each([
    'owner',
    'version',
    'hash',
    'scope',
    'acknowledge',
    'inactive',
    'pending',
    'immutable',
    'policy',
  ])('rejects %s before creating a credential', async (kind) => {
    const f = fixture();
    const body = await f.command();
    if (kind === 'version') body.expectedVersion++;
    if (kind === 'hash') body.workflowHash = 'f'.repeat(64);
    if (kind === 'scope') body.confirmedScopeHash = 'f'.repeat(64);
    if (kind === 'acknowledge') body.acknowledge = false;
    if (kind === 'inactive') f.setTenant('suspended');
    if (kind === 'pending') f.setPending(true);
    if (kind === 'immutable') f.revision().status = 'active';
    if (kind === 'policy') f.runtime.nativePolicy.mockReturnValue(null);
    const request =
      kind === 'owner'
        ? f.service.createRevisionConnection(
            { userId: 'user_foreign' },
            solutionId,
            revisionId,
            body,
            key
          )
        : f.create(body);
    await expect(request).rejects.toBeDefined();
    expect(f.runtime.createNativeCredential).not.toHaveBeenCalled();
    expect(f.records()).toHaveLength(0);
  });
  it('inherits only an already-bound source credential and never offers revocation from the new draft', async () => {
    const f = fixture();
    const value = f.revision();
    const descriptor = describeNativeConnection({
      requirement: value.spec.connections[0],
      workflow: value.workflow,
      environmentId: f.solution.environment_id,
    });
    const existing = {
      id: '64927f5f-823f-45f5-a4df-b1fa6f745251',
      requirement_id: value.spec.connections[0].id,
      credential_type: 'orqalyBoundedHttp',
      environment_id: f.solution.environment_id,
      provider_credential_id: 'source-selector',
      scope: descriptor.scope,
      status: 'saved',
    };
    f.solution.nativeConnections = [existing];
    value.workflow = bindNativeConnections(
      value.workflow,
      value.spec,
      [existing],
      f.solution.environment_id
    );
    value.workflow_hash = hash(value.workflow);
    const result = await f.read();
    expect(result.setup.ready).toBe(true);
    expect(result.connectionRequirements[0]).toMatchObject({
      inherited: true,
      canRevoke: false,
      canConnect: false,
    });
    await expect(f.revoke()).rejects.toMatchObject({ code: 'REVISION_CONNECTION_REVOKE_DENIED' });
    expect(f.runtime.reconcileNativeCredential).not.toHaveBeenCalled();
  });
});
