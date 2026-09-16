import { Pool } from 'pg';
import { sha256 } from './canonical.js';

export class ToolGatewayStoreError extends Error {
  constructor(code, { cause } = {}) {
    super(code, { cause });
    this.name = 'ToolGatewayStoreError';
    this.code = code;
  }
}

function sameEffect(row, request) {
  return (
    row.effect_id === request.effectId &&
    row.tenant_id === request.organizationId &&
    row.organization_id === request.organizationId &&
    row.workspace_id === request.workspaceId &&
    row.run_id === request.runId &&
    row.step_id === request.stepId &&
    row.descriptor_key === request.descriptor.descriptorKey &&
    row.descriptor_hash === request.descriptor.contentHash &&
    row.canonical_input_hash === request.canonicalInputHash &&
    row.idempotency_scope === request.idempotencyScope &&
    row.idempotency_key === request.idempotencyKey
  );
}

export class PostgresToolGatewayStore {
  constructor({ connectionString, pool = null }) {
    this.pool =
      pool || new Pool({ connectionString, max: 4, application_name: 'orqaly-tool-gateway' });
    this.ownsPool = !pool;
  }

  async close() {
    if (this.ownsPool) await this.pool.end();
  }

  async commitOperationalRecord({ request, recordId, dispatchReceipt, receiptHash, createdAt }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('orqaly.tenant_id', $1, true)", [
        request.organizationId,
      ]);
      const grantResult = await client.query(
        `SELECT * FROM orqaly.redeem_agentic_gateway_grant(
          $1::text, $2::text, $3::text, $4::text, $5::uuid, $6::uuid,
          $7::uuid, $8::timestamptz
        )`,
        [
          sha256(request.gatewayGrant.reference),
          request.gatewayGrant.scopeHash,
          request.organizationId,
          request.workspaceId,
          request.runId,
          request.stepId,
          request.effectId,
          createdAt,
        ]
      );
      const grant = grantResult.rows[0];
      if (
        !grant ||
        !['redeemed', 'replayed'].includes(grant.state) ||
        grant.tenant_id !== request.organizationId
      ) {
        throw new ToolGatewayStoreError('gateway_grant_denied');
      }

      const existing = await client.query(
        `SELECT effect_id::text, tenant_id::text, organization_id, workspace_id, run_id::text,
                step_id::text, descriptor_key, descriptor_hash,
                canonical_input_hash, idempotency_scope, idempotency_key,
                operational_record_id::text, dispatch_receipt, receipt_hash,
                created_at
           FROM orqaly.agentic_gateway_effects
          WHERE tenant_id = $1::uuid AND organization_id = $1::text AND workspace_id = $2
            AND idempotency_scope = $3 AND idempotency_key = $4
          `,
        [
          request.organizationId,
          request.workspaceId,
          request.idempotencyScope,
          request.idempotencyKey,
        ]
      );
      if (existing.rows[0]) {
        if (!sameEffect(existing.rows[0], request)) {
          throw new ToolGatewayStoreError('idempotency_identity_conflict');
        }
        await client.query('COMMIT');
        return {
          state: 'replayed',
          recordId: existing.rows[0].operational_record_id,
          dispatchReceipt: existing.rows[0].dispatch_receipt,
          receiptHash: existing.rows[0].receipt_hash,
          createdAt: new Date(existing.rows[0].created_at).toISOString(),
        };
      }
      if (grant.state !== 'redeemed') {
        throw new ToolGatewayStoreError('replayed_grant_without_committed_effect');
      }

      await client.query(
        `INSERT INTO orqaly.agentic_operational_records (
          record_id, tenant_id, organization_id, workspace_id, owner_user_id, run_id,
          step_id, effect_id, action_id, title, details,
          canonical_input_hash, created_at
        ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6::uuid, $7::uuid, $8::uuid,
                  $9::uuid, $10, $11, $12, $13::timestamptz)`,
        [
          recordId,
          request.organizationId,
          request.organizationId,
          request.workspaceId,
          grant.owner_user_id,
          request.runId,
          request.stepId,
          request.effectId,
          grant.action_id,
          request.canonicalInput.title,
          request.canonicalInput.details ?? null,
          request.canonicalInputHash,
          createdAt,
        ]
      );
      await client.query(
        `INSERT INTO orqaly.agentic_gateway_effects (
          effect_id, tenant_id, organization_id, workspace_id, run_id, step_id,
          action_id, grant_id, descriptor_key, descriptor_hash,
          canonical_input_hash, idempotency_scope, idempotency_key,
          operational_record_id, dispatch_receipt, receipt_hash, created_at
        ) VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, $6::uuid, $7::uuid, $8::uuid,
                  $9, $10, $11, $12, $13, $14::uuid, $15::jsonb, $16, $17::timestamptz)`,
        [
          request.effectId,
          request.organizationId,
          request.organizationId,
          request.workspaceId,
          request.runId,
          request.stepId,
          grant.action_id,
          grant.grant_id,
          request.descriptor.descriptorKey,
          request.descriptor.contentHash,
          request.canonicalInputHash,
          request.idempotencyScope,
          request.idempotencyKey,
          recordId,
          dispatchReceipt,
          receiptHash,
          createdAt,
        ]
      );
      await client.query('COMMIT');
      return { state: 'created', recordId, dispatchReceipt, receiptHash, createdAt };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the primary fail-closed error.
      }
      if (error instanceof ToolGatewayStoreError) throw error;
      throw new ToolGatewayStoreError('gateway_store_failed', { cause: error });
    } finally {
      client.release();
    }
  }
}
