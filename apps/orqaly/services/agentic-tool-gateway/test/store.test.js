import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '../src/canonical.js';
import { PostgresToolGatewayStore } from '../src/store.js';

const request = {
  organizationId: '10000000-0000-4000-8000-000000000001',
  workspaceId: 'workspace-preview',
  runId: '11111111-1111-4111-8111-111111111111',
  stepId: '22222222-2222-4222-8222-222222222222',
  effectId: '55555555-5555-4555-8555-555555555555',
  descriptor: { descriptorKey: 'operational_record_create_v1', contentHash: 'a'.repeat(64) },
  canonicalInput: { title: 'Create record', details: null },
  canonicalInputHash: 'b'.repeat(64),
  idempotencyScope: 'logical_effect',
  idempotencyKey: 'effect-key-1',
  gatewayGrant: { reference: 'grant/opaque-reference', scopeHash: 'c'.repeat(64) },
};
const receipt = { version: 'orqaly_dispatch_receipt_v1' };

function fakePool({
  grantState = 'redeemed',
  grantTenantId = request.organizationId,
  existing = null,
} = {}) {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql: String(sql), values });
      if (String(sql).includes('redeem_agentic_gateway_grant')) {
        return {
          rows: [
            {
              state: grantState,
              grant_id: '77777777-7777-4777-8777-777777777777',
              tenant_id: grantTenantId,
              owner_user_id: 'user_preview',
              action_id: '88888888-8888-4888-8888-888888888888',
            },
          ],
        };
      }
      if (String(sql).includes('FROM orqaly.agentic_gateway_effects'))
        return { rows: existing ? [existing] : [] };
      return { rows: [] };
    },
    release() {},
  };
  return { calls, connect: async () => client };
}

test('rejects a redeemed grant whose tenant does not match the transaction scope', async () => {
  const pool = fakePool({ grantTenantId: '90000000-0000-4000-8000-000000000009' });
  const store = new PostgresToolGatewayStore({ connectionString: 'ignored', pool });

  await assert.rejects(
    store.commitOperationalRecord({
      request,
      recordId: '66666666-6666-4666-8666-666666666666',
      dispatchReceipt: receipt,
      receiptHash: 'd'.repeat(64),
      createdAt: '2026-09-04T20:01:00.000Z',
    }),
    /gateway_grant_denied/
  );
  assert.equal(
    pool.calls.some((call) => call.sql.includes('FROM orqaly.agentic_gateway_effects')),
    false
  );
  assert.equal(pool.calls.at(-1).sql, 'ROLLBACK');
});

test('persists grant redemption, record and signed receipt in one transaction', async () => {
  const pool = fakePool();
  const store = new PostgresToolGatewayStore({ connectionString: 'ignored', pool });
  const result = await store.commitOperationalRecord({
    request,
    recordId: '66666666-6666-4666-8666-666666666666',
    dispatchReceipt: receipt,
    receiptHash: 'd'.repeat(64),
    createdAt: '2026-09-04T20:01:00.000Z',
  });

  assert.equal(result.state, 'created');
  assert.equal(pool.calls[0].sql, 'BEGIN');
  assert.equal(pool.calls[1].sql, "SELECT set_config('orqaly.tenant_id', $1, true)");
  assert.deepEqual(pool.calls[1].values, [request.organizationId]);
  assert.equal(pool.calls.at(-1).sql, 'COMMIT');
  const redeem = pool.calls.find((call) => call.sql.includes('redeem_agentic_gateway_grant'));
  assert.equal(redeem.values[0], sha256(request.gatewayGrant.reference));
  assert.equal(redeem.values[1], request.gatewayGrant.scopeHash);
  const effectLookup = pool.calls.find((call) =>
    call.sql.includes('FROM orqaly.agentic_gateway_effects')
  );
  // One parameter is used for a UUID tenant column and a text organization
  // column. PostgreSQL cannot compare text = uuid without an explicit cast.
  assert.match(effectLookup.sql, /tenant_id = \$1::uuid AND organization_id = \$1::text/);
  // Grant redemption already serializes this effect. Immutable effect rows
  // have no UPDATE privilege, which SELECT FOR UPDATE would require.
  assert.doesNotMatch(effectLookup.sql, /FOR UPDATE/);
  const effectInsert = pool.calls.find((call) =>
    call.sql.includes('INSERT INTO orqaly.agentic_gateway_effects')
  );
  assert.equal(effectInsert.values.length, 17);
  assert.equal(effectInsert.values[1], request.organizationId);
  assert.deepEqual(effectInsert.values[14], receipt);
  assert.equal(effectInsert.values[15], 'd'.repeat(64));
});

test('returns immutable stored receipt for the exact idempotent effect', async () => {
  const existing = {
    effect_id: request.effectId,
    tenant_id: request.organizationId,
    organization_id: request.organizationId,
    workspace_id: request.workspaceId,
    run_id: request.runId,
    step_id: request.stepId,
    descriptor_key: request.descriptor.descriptorKey,
    descriptor_hash: request.descriptor.contentHash,
    canonical_input_hash: request.canonicalInputHash,
    idempotency_scope: request.idempotencyScope,
    idempotency_key: request.idempotencyKey,
    operational_record_id: '66666666-6666-4666-8666-666666666666',
    dispatch_receipt: receipt,
    receipt_hash: 'd'.repeat(64),
    created_at: new Date('2026-09-04T20:01:00.000Z'),
  };
  const pool = fakePool({ grantState: 'replayed', existing });
  const store = new PostgresToolGatewayStore({ connectionString: 'ignored', pool });
  const result = await store.commitOperationalRecord({
    request,
    recordId: '99999999-9999-4999-8999-999999999999',
    dispatchReceipt: { changed: true },
    receiptHash: 'e'.repeat(64),
    createdAt: '2026-09-04T20:02:00.000Z',
  });

  assert.equal(result.state, 'replayed');
  assert.equal(result.recordId, existing.operational_record_id);
  assert.deepEqual(result.dispatchReceipt, receipt);
  assert.equal(
    pool.calls.some((call) => call.sql.includes('INSERT INTO')),
    false
  );
  assert.equal(pool.calls.at(-1).sql, 'COMMIT');
});
