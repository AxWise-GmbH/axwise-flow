// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createSolutionScheduleService } from './solution-schedule-service.js';

const allowedId = 'orqaly-customer-webhook-preview-003';
const oldId = 'orqaly-customer-webhook-preview-002';
function fixture({ environmentId = oldId, environmentIds = [allowedId], enabled = true } = {}) {
  const scope = { tenantId: randomUUID(), userId: 'user_owner' };
  const solution = {
    id: randomUUID(),
    tenant_id: scope.tenantId,
    owner_user_id: scope.userId,
    environment_id: environmentId,
    status: 'active',
    deployment: { workflowId: 'owned' },
    workflow_hash: 'a'.repeat(64),
    last_error: null,
    spec: {
      kind: 'webhook_transform_v1',
      fields: [{ source: 'event', target: 'event', transform: 'copy' }],
    },
  };
  const schedule = {
    id: randomUUID(),
    solution_id: solution.id,
    owner_user_id: scope.userId,
    status: 'active',
    lease_token: randomUUID(),
    lease_expires_at: new Date(Date.now() + 60000).toISOString(),
    workflow_hash: solution.workflow_hash,
    revision_id: null,
    next_run_at: new Date().toISOString(),
    timing: { kind: 'interval', minutes: 60 },
    input: { event: 'ready' },
    row_version: 1,
  };
  const client = {
    query: vi.fn(async (sql, values) => {
      if (sql.includes('FROM orqaly.customer_solutions')) return { rows: [solution] };
      if (sql.startsWith('UPDATE orqaly.solution_schedules SET status=')) {
        schedule.status = values[3];
        schedule.last_error = values[4];
        return { rows: [schedule] };
      }
      if (sql.includes('FROM orqaly.solution_schedules')) {
        if (sql.includes('create_key=')) return { rows: [] };
        if (sql.includes('count(*)')) return { rows: [{ count: '0' }] };
        return { rows: [schedule] };
      }
      if (sql.includes('FROM orqaly.tenants')) return { rows: [{ status: 'active' }] };
      if (sql.startsWith('INSERT INTO orqaly.solution_invocations'))
        return { rows: [{ id: values[2], mode: 'production', input: values[7] }] };
      if (sql.startsWith('INSERT INTO orqaly.solution_schedules')) return { rows: [schedule] };
      return { rows: [] };
    }),
  };
  const repository = {
    resolveTenant: vi.fn(async () => scope.tenantId),
    solutionBuildTransaction: vi.fn(async (actual, callback) => {
      expect(actual).toEqual(scope);
      return callback(client);
    }),
    claimSolutionSchedule: vi.fn(async () => ({
      ...scope,
      solutionId: solution.id,
      scheduleId: schedule.id,
      leaseToken: schedule.lease_token,
    })),
  };
  const solutionService = {
    executeClaimedInvocation: vi.fn(async () => ({ invocation: { status: 'succeeded' } })),
  };
  const service = createSolutionScheduleService({
    repository,
    solutionService,
    enabled,
    environmentIds,
  });
  return {
    scope,
    solution,
    schedule,
    client,
    repository,
    solutionService,
    service,
    command: {
      label: 'Approved recurring event',
      workflowHash: solution.workflow_hash,
      input: { event: 'ready' },
      timing: { kind: 'interval', minutes: 60 },
    },
  };
}
describe('scheduled execution uses an explicit deployment runtime allowlist', () => {
  it('reports unsupported owned runtimes disabled and never advertises expanded IAM authority', async () => {
    const f = fixture();
    const result = await f.service.list({ userId: f.scope.userId }, f.solution.id);
    expect(result).toMatchObject({
      enabled: false,
      disabledReason: expect.stringContaining('isolated runtime'),
    });
    expect(result.schedules).toHaveLength(1);
    expect(
      f.client.query.mock.calls.some(([sql]) => /^(INSERT|UPDATE|ALTER|GRANT)/.test(sql))
    ).toBe(false);
  });
  it('offers only the explicitly enabled runtime and preserves direct local null default', async () => {
    for (const options of [{ environmentId: allowedId }, { environmentIds: null }]) {
      const f = fixture(options);
      expect(await f.service.list({ userId: f.scope.userId }, f.solution.id)).toMatchObject({
        enabled: true,
        disabledReason: null,
      });
    }
    const f = fixture({ environmentId: allowedId, enabled: false });
    expect(await f.service.list({ userId: f.scope.userId }, f.solution.id)).toMatchObject({
      enabled: false,
      disabledReason: expect.stringContaining('deployment'),
    });
  });
  it('rejects creation outside the allowlist before idempotent replay or any write', async () => {
    const f = fixture();
    await expect(
      f.service.create({ userId: f.scope.userId }, f.solution.id, f.command, 'schedule_request')
    ).rejects.toMatchObject({ code: 'SCHEDULE_ENVIRONMENT_UNAVAILABLE' });
    expect(f.client.query).toHaveBeenCalledTimes(1);
    expect(f.solutionService.executeClaimedInvocation).not.toHaveBeenCalled();
  });
  it.each([{ environmentId: oldId }, { environmentId: allowedId, environmentIds: [] }])(
    'stops an already-claimed schedule after its runtime is excluded without creating a tick or invoking ($environmentId)',
    async (options) => {
      const f = fixture(options);
      expect(await f.service.advanceOne()).toEqual({ processed: true, status: 'not_dispatched' });
      expect(f.schedule).toMatchObject({
        status: 'needs_attention',
        last_error: 'SCHEDULE_ENVIRONMENT_UNAVAILABLE',
      });
      expect(f.client.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
      expect(f.solutionService.executeClaimedInvocation).not.toHaveBeenCalled();
    }
  );
  it('allows the exact003 environment to dispatch through the existing claimed invocation path', async () => {
    const f = fixture({ environmentId: allowedId });
    expect(await f.service.advanceOne()).toMatchObject({ processed: true, status: 'succeeded' });
    expect(f.solutionService.executeClaimedInvocation).toHaveBeenCalledTimes(1);
    expect(
      f.solutionService.executeClaimedInvocation.mock.calls[0][1].solution.environment_id
    ).toBe(allowedId);
  });
  it('keeps user pause available even after the runtime is excluded', async () => {
    const f = fixture();
    expect(
      await f.service.pause({ userId: f.scope.userId }, f.solution.id, f.schedule.id)
    ).toMatchObject({ schedule: { status: 'paused' }, inFlightMayFinish: true });
    expect(f.solutionService.executeClaimedInvocation).not.toHaveBeenCalled();
  });
});
