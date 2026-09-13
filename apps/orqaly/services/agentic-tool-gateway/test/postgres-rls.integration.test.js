import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import pg from 'pg';

const { Client } = pg;
const databaseUrl = process.env.TOOL_GATEWAY_TEST_DATABASE_URL;

test(
  'real PostgreSQL hides and rejects cross-tenant Gateway effects',
  { skip: !databaseUrl },
  async () => {
    const tenantA = crypto.randomUUID();
    const tenantB = crypto.randomUUID();
    const recordA = crypto.randomUUID();
    const recordB = crypto.randomUUID();
    const effectA = crypto.randomUUID();
    const effectB = crypto.randomUUID();
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      await client.query('BEGIN');
      for (const [tenantId, recordId, effectId] of [
        [tenantA, recordA, effectA],
        [tenantB, recordB, effectB],
      ]) {
        await client.query(
          `INSERT INTO orqaly.agentic_operational_records (
             tenant_id, record_id, organization_id, workspace_id, owner_user_id,
             run_id, step_id, effect_id, action_id, title, canonical_input_hash
           ) VALUES (
             $1::uuid, $2::uuid, $1, $1, 'user_rlstest',
             $3::uuid, $4::uuid, $5::uuid, $6::uuid, 'RLS proof', $7
           )`,
          [
            tenantId,
            recordId,
            crypto.randomUUID(),
            crypto.randomUUID(),
            effectId,
            crypto.randomUUID(),
            'a'.repeat(64),
          ]
        );
        await client.query(
          `INSERT INTO orqaly.agentic_gateway_effects (
             tenant_id, effect_id, organization_id, workspace_id, run_id, step_id,
             action_id, grant_id, descriptor_key, descriptor_hash,
             canonical_input_hash, idempotency_scope, idempotency_key,
             operational_record_id, dispatch_receipt, receipt_hash
           ) VALUES (
             $1::uuid, $2::uuid, $1, $1, $3::uuid, $4::uuid,
             $5::uuid, $6::uuid, 'operational_record_create_v1', $7,
             $8, 'logical_effect', $9, $10::uuid, '{}'::jsonb, $11
           )`,
          [
            tenantId,
            effectId,
            crypto.randomUUID(),
            crypto.randomUUID(),
            crypto.randomUUID(),
            crypto.randomUUID(),
            'b'.repeat(64),
            'c'.repeat(64),
            `rls:${effectId}`,
            recordId,
            'd'.repeat(64),
          ]
        );
      }

      await client.query('SET LOCAL ROLE orqaly_gateway');
      await client.query("SELECT set_config('orqaly.tenant_id', $1, true)", [tenantA]);
      const visibleRecords = await client.query(
        'SELECT tenant_id::text FROM orqaly.agentic_operational_records ORDER BY tenant_id'
      );
      const visibleEffects = await client.query(
        'SELECT tenant_id::text FROM orqaly.agentic_gateway_effects ORDER BY tenant_id'
      );
      assert.deepEqual(visibleRecords.rows, [{ tenant_id: tenantA }]);
      assert.deepEqual(visibleEffects.rows, [{ tenant_id: tenantA }]);

      await client.query('SAVEPOINT cross_tenant_write');
      await assert.rejects(
        client.query(
          `INSERT INTO orqaly.agentic_operational_records (
             tenant_id, record_id, organization_id, workspace_id, owner_user_id,
             run_id, step_id, effect_id, action_id, title, canonical_input_hash
           ) VALUES (
             $1::uuid, $2::uuid, $1, $1, 'user_rlstest',
             $3::uuid, $4::uuid, $5::uuid, $6::uuid, 'Denied', $7
           )`,
          [
            tenantB,
            crypto.randomUUID(),
            crypto.randomUUID(),
            crypto.randomUUID(),
            crypto.randomUUID(),
            crypto.randomUUID(),
            'e'.repeat(64),
          ]
        ),
        (error) => error.code === '42501'
      );
      await client.query('ROLLBACK TO SAVEPOINT cross_tenant_write');
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      await client.end();
    }
  }
);
