import { describe, expect, it, vi } from 'vitest';
import {
  createSolutionApplicationKeyService,
  hashSolutionApplicationKey,
} from './solution-application-key-service.js';
import { compileSolutionWorkflow } from './solution-compiler.js';
import { publicInvocation } from './solution-service.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const solutionId = '22222222-2222-4222-8222-222222222222';
const otherId = '33333333-3333-4333-8333-333333333333';
const auth = { userId: 'user_appowner' };
const spec = {
  kind: 'webhook_transform_v1',
  fields: [{ source: 'name', target: 'name', transform: 'trim' }],
};
const compiled = compileSolutionWorkflow({ id: solutionId, spec });

function fixture() {
  let time = Date.parse('2026-09-05T12:00:00Z');
  let tenantStatus = 'active';
  const keys = [];
  const invocations = [];
  const usage = { count: 0, denied: false };
  const value = {
    tenant_id: tenantId,
    owner_user_id: auth.userId,
    id: solutionId,
    status: 'active',
    row_version: 7,
    workflow_hash: compiled.workflowHash,
    spec,
    workflow: compiled.workflow,
    deployment: { workflowId: 'native1', versionId: 'v1' },
    tested_at: new Date(time).toISOString(),
  };
  const query = vi.fn(async (sql, p) => {
    if (sql.startsWith('SELECT * FROM orqaly.customer_solutions'))
      return {
        rows: p[0] === tenantId && p[1] === auth.userId && p[2] === solutionId ? [value] : [],
      };
    if (sql.startsWith('SELECT status FROM orqaly.tenants'))
      return { rows: [{ status: tenantStatus }] };
    if (sql.startsWith('SELECT * FROM orqaly.solution_application_keys')) {
      if (sql.includes('id=$4'))
        return {
          rows: keys.filter(
            (k) =>
              k.tenant_id === p[0] &&
              k.owner_user_id === p[1] &&
              k.solution_id === p[2] &&
              k.id === p[3]
          ),
        };
      if (sql.includes('AND id=$2 AND solution_id=$3'))
        return {
          rows: keys.filter((k) => k.tenant_id === p[0] && k.id === p[1] && k.solution_id === p[2]),
        };
      return {
        rows: keys.filter(
          (k) => k.tenant_id === p[0] && k.owner_user_id === p[1] && k.solution_id === p[2]
        ),
      };
    }
    if (sql.startsWith('SELECT id FROM orqaly.solution_application_keys'))
      return {
        rows: keys.filter(
          (k) => k.tenant_id === p[0] && k.solution_id === p[1] && k.create_key === p[2]
        ),
      };
    if (sql.startsWith('SELECT count(*)'))
      return {
        rows: [
          {
            count: keys.filter((k) => !k.revoked_at && new Date(k.expires_at).valueOf() > time)
              .length,
          },
        ],
      };
    if (sql.startsWith('INSERT INTO orqaly.solution_application_keys')) {
      const key = {
        tenant_id: p[0],
        solution_id: p[1],
        id: p[2],
        owner_user_id: p[3],
        environment: p[4],
        label: p[5],
        token_hash: p[6],
        workflow_hash: p[7],
        create_key: p[8],
        created_at: p[9],
        expires_at: p[10],
        row_version: 1,
        revoked_at: null,
        last_used_at: null,
      };
      keys.push(key);
      return { rows: [key] };
    }
    if (sql.startsWith('UPDATE orqaly.solution_application_keys SET revoked_at')) {
      const key = keys.find((k) => k.id === p[2]);
      key.revoked_at = new Date(time).toISOString();
      key.row_version += 1;
      return { rows: [key] };
    }
    if (sql.startsWith('UPDATE orqaly.solution_application_keys SET last_used_at')) {
      keys.find((k) => k.id === p[1]).last_used_at = new Date(time).toISOString();
      return { rows: [] };
    }
    if (sql.startsWith('SELECT * FROM orqaly.solution_invocations')) {
      if (sql.includes('application_key_id=$3'))
        return {
          rows: invocations.filter(
            (i) =>
              i.tenant_id === p[0] &&
              i.solution_id === p[1] &&
              i.application_key_id === p[2] &&
              i.id === p[3]
          ),
        };
      return {
        rows: invocations.filter(
          (i) => i.tenant_id === p[0] && i.solution_id === p[1] && i.idempotency_key === p[2]
        ),
      };
    }
    if (sql.startsWith('SELECT id FROM orqaly.solution_invocations'))
      return { rows: invocations.filter((i) => i.status === 'running') };
    if (sql.startsWith('INSERT INTO orqaly.solution_application_usage')) {
      if (usage.denied) return { rows: [] };
      usage.count += 1;
      return { rows: [{ minute_count: usage.count, day_count: usage.count }] };
    }
    if (sql.startsWith('INSERT INTO orqaly.solution_invocations')) {
      const invocation = {
        tenant_id: p[0],
        solution_id: p[1],
        id: p[2],
        owner_user_id: p[3],
        mode: 'production',
        idempotency_key: p[4],
        request_hash: p[5],
        workflow_hash: p[6],
        input: p[7],
        status: 'running',
        revision_id: p[8],
        application_key_id: p[9],
        application_key_label: p[10],
        created_at: new Date(time).toISOString(),
        completed_at: null,
      };
      invocations.push(invocation);
      return { rows: [invocation] };
    }
    throw new Error(`Unexpected test query: ${sql.slice(0, 65)}`);
  });
  const repository = {
    resolveTenant: vi.fn(async () => tenantId),
    solutionTransaction: vi.fn(async (_tenant, callback) => callback({ query })),
  };
  const solutionService = {
    executeClaimedInvocation: vi.fn(async (_scope, claimed) => {
      Object.assign(claimed.invocation, {
        status: 'succeeded',
        output: { name: claimed.invocation.input.name.trim() },
        execution_id: '123',
        completed_at: new Date(time).toISOString(),
      });
      return { invocation: publicInvocation(claimed.invocation), replayed: false };
    }),
  };
  const service = createSolutionApplicationKeyService({
    repository,
    solutionService,
    environment: 'preview',
    now: () => time,
  });
  const create = (key = `create_key_${keys.length}`, overrides = {}) =>
    service.create(
      auth,
      solutionId,
      { label: 'My application', workflowHash: value.workflow_hash, ...overrides },
      value.row_version,
      key
    );
  return {
    service,
    create,
    query,
    repository,
    solutionService,
    keys,
    invocations,
    value,
    usage,
    advance: (ms) => {
      time += ms;
    },
    suspend: () => {
      tenantStatus = 'suspended';
    },
  };
}

describe('Solution application access authority', () => {
  it('accepts native nested data only against the exact stored schema before quota and dispatch', async () => {
    const f = fixture();
    f.value.spec = {
      kind: 'n8n_workflow_v2',
      inputSchema: {
        type: 'object',
        properties: { values: { type: 'array', items: { type: 'integer' } } },
        required: ['values'],
        additionalProperties: false,
      },
      acceptanceCases: [],
      connections: [],
    };
    f.solutionService.executeClaimedInvocation.mockImplementation(async (_scope, claimed) => ({
      invocation: publicInvocation(claimed.invocation),
      replayed: false,
    }));
    const created = await f.create();
    await f.service.invoke(
      `Bearer ${created.token}`,
      solutionId,
      { input: { values: [1, 2] } },
      'native_valid_input'
    );
    expect(f.invocations[0].input).toEqual({ values: [1, 2] });
    f.invocations[0].status = 'succeeded';
    await expect(
      f.service.invoke(
        `Bearer ${created.token}`,
        solutionId,
        { input: { values: ['not an integer'] } },
        'native_invalid_input'
      )
    ).rejects.toMatchObject({ code: 'SOLUTION_INPUT_INVALID' });
    expect(f.usage.count).toBe(1);
    expect(f.solutionService.executeClaimedInvocation).toHaveBeenCalledTimes(1);
  });

  it('does not widen V1 inputs or allow native pending lifecycle through application access', async () => {
    const f = fixture();
    const created = await f.create();
    await expect(
      f.service.invoke(
        `Bearer ${created.token}`,
        solutionId,
        { input: { name: { nested: true } } },
        'v1_nested_forbidden'
      )
    ).rejects.toThrow();
    expect(f.usage.count).toBe(0);
    f.value.spec = { kind: 'n8n_workflow_v2' };
    f.value.last_error = 'RUNTIME_ACTIVATION_REQUIRES_VERIFICATION';
    await expect(f.create('pending_native_key')).rejects.toMatchObject({
      code: 'SOLUTION_NOT_ACTIVE',
    });
    expect(f.solutionService.executeClaimedInvocation).not.toHaveBeenCalled();
  });

  it.each([
    'orqaly_app_preview_v1.pasted-credential',
    'sk_test_abcdefghijklmnopqrstuvwx',
    'api_key=abcdefghijklmnopqrstuvwx',
    'ghp_abcdefghijklmnopqrstuvwx',
  ])('rejects recognized pasted credentials in the descriptive label', async (label) => {
    const f = fixture();
    await expect(f.create('create_key', { label })).rejects.toThrow();
    expect(f.repository.resolveTenant).not.toHaveBeenCalled();
    expect(f.repository.solutionTransaction).not.toHaveBeenCalled();
  });
  it('returns a 256-bit token once, stores only its digest and omits credentials/selectors from metadata', async () => {
    const f = fixture();
    const created = await f.create();
    expect(created.token).toMatch(
      /^orqaly_app_preview_v1\.[a-f0-9-]{36}\.[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/
    );
    expect(f.keys[0].token_hash).toBe(hashSolutionApplicationKey(created.token));
    expect(Buffer.from(created.token.split('.').at(-1), 'base64url')).toHaveLength(32);
    const listed = await f.service.list(auth, solutionId);
    expect(listed.keys[0]).toMatchObject({
      label: 'My application',
      status: 'active',
      rowVersion: 1,
    });
    expect(JSON.stringify(listed)).not.toContain(created.token);
    expect(JSON.stringify(listed)).not.toContain(f.keys[0].token_hash);
    expect(JSON.stringify(listed)).not.toContain(tenantId);
    expect(JSON.stringify(f.query.mock.calls)).not.toContain(created.token);
    await expect(f.create('create_key_0')).rejects.toMatchObject({
      code: 'APP_KEY_ALREADY_CREATED',
    });
    expect(f.keys).toHaveLength(1);
  });
  it.each([
    {},
    { mode: 'test', input: {} },
    { input: {}, tenantId },
    { input: {}, workflowHash: 'a'.repeat(64) },
  ])('accepts only the production scalar-input contract: %j', async (body) => {
    const f = fixture();
    await expect(
      f.service.invoke('Bearer invalid', solutionId, body, 'request_key')
    ).rejects.toThrow();
    expect(f.repository.solutionTransaction).not.toHaveBeenCalled();
  });
  it.each(['Bearer invalid', 'Basic anything', '', undefined])(
    'denies malformed credentials without any database access',
    async (header) => {
      const f = fixture();
      await expect(
        f.service.invoke(header, solutionId, { input: { name: 'Alice' } }, 'request_key')
      ).rejects.toMatchObject({ code: 'APP_KEY_INVALID', status: 401 });
      expect(f.repository.resolveTenant).not.toHaveBeenCalled();
      expect(f.query).not.toHaveBeenCalled();
    }
  );
  it.each(['secret', 'tenant', 'solution', 'environment'])(
    'does not turn an untrusted %s selector into owner authority',
    async (changed) => {
      const f = fixture();
      const { token } = await f.create();
      f.query.mockClear();
      f.repository.resolveTenant.mockClear();
      const parts = token.split('.');
      if (changed === 'secret') parts[3] = 'A'.repeat(43);
      if (changed === 'tenant') parts[1] = otherId;
      if (changed === 'environment') parts[0] = 'orqaly_app_production_v1';
      await expect(
        f.service.invoke(
          `Bearer ${parts.join('.')}`,
          changed === 'solution' ? otherId : solutionId,
          { input: { name: 'Alice' } },
          'request_key'
        )
      ).rejects.toMatchObject({ code: 'APP_KEY_INVALID' });
      expect(
        f.query.mock.calls.every(([sql]) =>
          sql.startsWith('SELECT * FROM orqaly.solution_application_keys')
        )
      ).toBe(true);
      expect(f.repository.resolveTenant).not.toHaveBeenCalled();
      expect(f.solutionService.executeClaimedInvocation).not.toHaveBeenCalled();
    }
  );
  it('claims an app-scoped production invocation and replays it without another quota charge or execution', async () => {
    const f = fixture();
    const { token, key } = await f.create();
    f.repository.resolveTenant.mockClear();
    const result = await f.service.invoke(
      `Bearer ${token}`,
      solutionId,
      { input: { name: ' Alice ' } },
      'same_request'
    );
    expect(result).toMatchObject({
      invocation: { status: 'succeeded', output: { name: 'Alice' }, executionId: '123' },
      replayed: false,
    });
    expect(result.invocation).not.toHaveProperty('input');
    expect(f.invocations[0]).toMatchObject({
      application_key_id: key.id,
      application_key_label: 'My application',
      mode: 'production',
    });
    expect(f.invocations[0].idempotency_key).toMatch(new RegExp(`^app_${key.id}_`));
    expect(publicInvocation(f.invocations[0]).actor).toEqual({
      kind: 'application_key',
      id: key.id,
      label: 'My application',
    });
    expect(
      (
        await f.service.invoke(
          `Bearer ${token}`,
          solutionId,
          { input: { name: ' Alice ' } },
          'same_request'
        )
      ).replayed
    ).toBe(true);
    expect(f.usage.count).toBe(1);
    expect(f.solutionService.executeClaimedInvocation).toHaveBeenCalledTimes(1);
    expect(f.repository.resolveTenant).not.toHaveBeenCalled();
    await expect(
      f.service.invoke(`Bearer ${token}`, solutionId, { input: { name: ' Bob ' } }, 'same_request')
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    expect(f.solutionService.executeClaimedInvocation).toHaveBeenCalledTimes(1);
  });
  it.each(['expired', 'revoked', 'release', 'paused', 'suspended'])(
    'checks %s authority before new invocations and idempotent replay',
    async (state) => {
      const f = fixture();
      const { token, key } = await f.create();
      const result = await f.service.invoke(
        `Bearer ${token}`,
        solutionId,
        { input: { name: 'Alice' } },
        'request_key'
      );
      if (state === 'expired') f.advance(31 * 86_400_000);
      if (state === 'revoked') await f.service.revoke(auth, solutionId, key.id, key.rowVersion);
      if (state === 'release') f.value.workflow_hash = 'b'.repeat(64);
      if (state === 'paused') f.value.status = 'paused';
      if (state === 'suspended') f.suspend();
      await expect(
        f.service.invoke(`Bearer ${token}`, solutionId, { input: { name: 'Alice' } }, 'request_key')
      ).rejects.toThrow();
      if (state !== 'paused')
        await expect(
          f.service.readInvocation(`Bearer ${token}`, solutionId, result.invocation.id)
        ).rejects.toThrow();
      expect(f.solutionService.executeClaimedInvocation).toHaveBeenCalledTimes(1);
    }
  );
  it('revalidates key revocation under the claim lock after preliminary authentication', async () => {
    const f = fixture();
    const { token } = await f.create();
    const original = f.query.getMockImplementation();
    f.query.mockImplementation(async (sql, args) => {
      if (sql.startsWith('SELECT * FROM orqaly.customer_solutions'))
        f.keys[0].revoked_at = new Date().toISOString();
      return original(sql, args);
    });
    await expect(
      f.service.invoke(`Bearer ${token}`, solutionId, { input: { name: 'Alice' } }, 'request_key')
    ).rejects.toMatchObject({ code: 'APP_KEY_INVALID' });
    expect(f.invocations).toHaveLength(0);
    expect(f.usage.count).toBe(0);
  });
  it('restricts receipts to the exact key that admitted the invocation', async () => {
    const f = fixture();
    const first = await f.create();
    const second = await f.create();
    const result = await f.service.invoke(
      `Bearer ${first.token}`,
      solutionId,
      { input: { name: 'Alice' } },
      'request_key'
    );
    expect(
      (await f.service.readInvocation(`Bearer ${first.token}`, solutionId, result.invocation.id))
        .invocation.output
    ).toEqual({ name: 'Alice' });
    await expect(
      f.service.readInvocation(`Bearer ${second.token}`, solutionId, result.invocation.id)
    ).rejects.toMatchObject({ code: 'INVOCATION_NOT_FOUND' });
  });
  it('fails before dispatch on durable quota exhaustion or a still-running claim without aging it into a retry', async () => {
    const f = fixture();
    const { token } = await f.create();
    f.usage.denied = true;
    await expect(
      f.service.invoke(`Bearer ${token}`, solutionId, { input: { name: 'Alice' } }, 'quota_key')
    ).rejects.toMatchObject({ code: 'APP_KEY_RATE_LIMITED', status: 429 });
    f.usage.denied = false;
    f.invocations.push({ id: otherId, status: 'running', created_at: '2020-01-01T00:00:00Z' });
    await expect(
      f.service.invoke(`Bearer ${token}`, solutionId, { input: { name: 'Alice' } }, 'busy_key')
    ).rejects.toMatchObject({ code: 'SOLUTION_BUSY' });
    expect(f.solutionService.executeClaimedInvocation).not.toHaveBeenCalled();
    expect(f.usage.count).toBe(0);
  });
  it('limits active grants, validates release/row versions and supports exact revocation', async () => {
    const f = fixture();
    for (let i = 0; i < 5; i++) await f.create();
    await expect(f.create()).rejects.toMatchObject({ code: 'APP_KEY_LIMIT' });
    await expect(f.service.revoke(auth, solutionId, f.keys[0].id, 0)).rejects.toMatchObject({
      code: 'APP_KEY_VERSION_CONFLICT',
    });
    const revoked = await f.service.revoke(auth, solutionId, f.keys[0].id, 1);
    expect(revoked.key).toMatchObject({ status: 'revoked', rowVersion: 2 });
    await f.create();
    f.value.status = 'paused';
    await expect(f.create()).rejects.toMatchObject({ code: 'SOLUTION_NOT_ACTIVE' });
  });
});
