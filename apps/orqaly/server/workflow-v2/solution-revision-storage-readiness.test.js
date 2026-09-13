// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { verifyFailureProbeReadiness, verifyRevisionConnectionsReadiness } from './solution-revision-storage-readiness.js';

const connections = { isolated: 3, owner_policies: 3, guards: 3, can_insert: true,
  can_update_status: true, broad_write: false, worker_write: false, guard_public_execute: false };
const probes = { isolated: true, api_access: true, status_update: true, owner_policy: true,
  broad_write: false, worker_access: false, guarded_insert_update: true, guard_public_execute: false };
const pool = (value) => ({ query: vi.fn(async (sql) => ({ rows: sql.includes('LIMIT 0') ? [] : [value] })) });

describe('revision setup and probe database readiness', () => {
  it('requires exact enabled before-row insert/update guards and no public execute', async () => {
    const db = pool(connections);
    await verifyRevisionConnectionsReadiness(db, { api: true });
    const sql = db.query.mock.calls.at(-1)[0];
    expect(sql).toContain("'revision_connection_binding_guard',23");
    expect(sql).toContain("'revision_connection_operation_guard',23");
    expect(sql).toContain("'revision_connection_pending_guard',19");
    expect(sql).toContain("g.tgenabled IN ('O','A')");
    expect(sql).toContain("a.grantee=0 AND a.privilege_type='EXECUTE'");
  });
  it('accepts read-only worker grants, not API mutation grants', async () => {
    await verifyRevisionConnectionsReadiness(pool({ ...connections, can_insert: false, can_update_status: false }), { api: false });
    await expect(verifyRevisionConnectionsReadiness(pool(connections), { api: false })).rejects.toThrow('revision_connection_isolation_invalid');
  });
  it.each([{ guards: 2 }, { guard_public_execute: true }, { guard_public_execute: undefined },
    { worker_write: true }, { broad_write: true }, { owner_policies: 2 }])('rejects unsafe connection storage metadata: %j', async (patch) => {
    await expect(verifyRevisionConnectionsReadiness(pool({ ...connections, ...patch }), { api: true })).rejects.toThrow('revision_connection_isolation_invalid');
  });
  it('accepts only the enabled probe insert and update guard', async () => {
    const db = pool(probes);
    await verifyFailureProbeReadiness(db);
    const sql = db.query.mock.calls.at(-1)[0];
    expect(sql).toContain("tgfoid='orqaly.guard_solution_failure_probe()'::regprocedure");
    expect(sql).toContain('tgtype=23');
  });
  it.each([{ guarded_insert_update: false }, { guarded_insert_update: undefined },
    { guard_public_execute: true }, { worker_access: true }, { broad_write: true }])('rejects unsafe probe storage metadata: %j', async (patch) => {
    await expect(verifyFailureProbeReadiness(pool({ ...probes, ...patch }))).rejects.toThrow('failure_probe_isolation_invalid');
  });
});
