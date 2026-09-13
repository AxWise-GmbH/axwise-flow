import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { canonicalJson, canonicalJsonSha256, sha256 } from '../src/canonical.js';
import { PostgresToolGatewayStore } from '../src/store.js';
import { insertExecutableActionWithClient } from '../../../server/workflow-v2/executable-action-repository.js';

const databaseUrl = process.env.TOOL_GATEWAY_TEST_DATABASE_URL;

async function seed(client, { expired = false } = {}) {
  const tenant = randomUUID(),
    run = randomUUID(),
    stage = randomUUID();
  const attempt = randomUUID(),
    operation = randomUUID(),
    plan = randomUUID();
  const id = randomUUID(),
    step = randomUUID(),
    effect = randomUUID(),
    grant = randomUUID();
  const owner = 'user_recoverytest';
  const inputHash = sha256('{}');
  const planContent = canonicalJson({
    contentType: 'application/json',
    payload: {},
    markdown: null,
  });
  await client.query('INSERT INTO orqaly.tenants(id,display_name) VALUES($1,$2)', [
    tenant,
    'Recovery test',
  ]);
  await client.query(
    `INSERT INTO orqaly.workflow_runs(
    tenant_id,id,owner_user_id,mode,status,contract_version,request_hash,request_payload
  ) VALUES($1,$2,$3,'simple','completed','orqaly.workflow.v2',$4,'{}')`,
    [tenant, run, owner, inputHash]
  );
  await client.query(
    `INSERT INTO orqaly.workflow_stages(tenant_id,run_id,id,stage_key,kind,status,ordinal)
    VALUES($1,$2,$3,'planning','planning','completed',0)`,
    [tenant, run, stage]
  );
  await client.query(
    `INSERT INTO orqaly.stage_attempts(tenant_id,run_id,stage_id,id,attempt_number,
    status,activity_type,operation_id,input_hash,input_payload,input_canonical)
    VALUES($1,$2,$3,$4,1,'succeeded','orqaly_plan',$5,$6,'{}','{}')`,
    [tenant, run, stage, attempt, operation, inputHash]
  );
  await client.query(
    `INSERT INTO orqaly.artifacts(tenant_id,run_id,stage_id,attempt_id,id,kind,
    content_type,content_hash,input_hash,source_operation_id,payload,canonical_content)
    VALUES($1,$2,$3,$4,$5,'plan','application/json',$6,$7,$8,'{}',$9)`,
    [tenant, run, stage, attempt, plan, sha256(planContent), inputHash, operation, planContent]
  );
  const canonicalInput = { title: 'Recovery integration record' };
  const action = {
    tenantId: tenant,
    id,
    runId: run,
    ownerUserId: owner,
    agentId: randomUUID(),
    agentName: 'Recovery Agent',
    operationKey: 'operational_record_create_v1',
    descriptor: {},
    executorBinding: {},
    personaVersion: {},
    planArtifactId: plan,
    planArtifactHash: sha256(planContent),
    taskInputHash: inputHash,
    canonicalInput,
    canonicalInputHash: canonicalJsonSha256(canonicalInput),
    proposalIdempotencyKey: `proposal:${id}`,
    proposalHash: inputHash,
    actionIntent: {},
    actionIntentHash: inputHash,
    approvalSubject: {},
    approvalBindingHash: inputHash,
    approvalExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    stepId: step,
    effectId: effect,
    targetReference: `record:${effect}`,
    createdAt: new Date().toISOString(),
  };
  await insertExecutableActionWithClient(client, action);
  await client.query(
    `UPDATE orqaly.executable_actions SET status='running', row_version=1,
    attempt_id=$2, started_at=clock_timestamp(), execution_deadline_at=clock_timestamp()+interval '90 seconds'
    WHERE id=$1`,
    [id, randomUUID()]
  );
  await client.query(
    `UPDATE orqaly.executable_actions SET status='outcome_unknown', row_version=2,
    terminal_at=clock_timestamp() WHERE id=$1`,
    [id]
  );
  const reference = `grant/${grant}`;
  await client.query(
    `INSERT INTO orqaly.agentic_gateway_grants(tenant_id,id,action_id,owner_user_id,
    reference_hash,scope_hash,organization_id,workspace_id,run_id,step_id,effect_id,issued_at,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,clock_timestamp()-interval '60 seconds',
      clock_timestamp()+($11::integer * interval '1 second'))`,
    [
      tenant,
      grant,
      id,
      owner,
      sha256(reference),
      inputHash,
      tenant,
      run,
      step,
      effect,
      expired ? -1 : 30,
    ]
  );
  return {
    action,
    grant,
    reference,
    scopeHash: inputHash,
    request: {
      organizationId: tenant,
      workspaceId: tenant,
      runId: run,
      stepId: step,
      effectId: effect,
      descriptor: { descriptorKey: 'operational_record_create_v1', contentHash: inputHash },
      canonicalInput,
      canonicalInputHash: canonicalJsonSha256(canonicalInput),
      idempotencyScope: 'logical_effect',
      idempotencyKey: `effect:${effect}`,
      gatewayGrant: { reference, scopeHash: inputHash },
    },
  };
}

async function recovery(
  client,
  fixture,
  tenant = fixture.action.tenantId,
  owner = fixture.action.ownerUserId
) {
  await client.query("SELECT set_config('orqaly.tenant_id',$1,false)", [fixture.action.tenantId]);
  await client.query('SET ROLE orqaly_api');
  try {
    return (
      await client.query('SELECT orqaly.executable_action_not_applied($1,$2,$3) AS result', [
        tenant,
        fixture.action.id,
        owner,
      ])
    ).rows[0].result;
  } finally {
    await client.query('RESET ROLE');
  }
}

test(
  'real PostgreSQL recovery, least-privilege commit and replay',
  { skip: !databaseUrl },
  async (t) => {
    const admin = new pg.Client({ connectionString: databaseUrl });
    await admin.connect();
    const gatewayPool = new pg.Pool({
      connectionString: databaseUrl,
      options: '-c role=orqaly_gateway',
    });
    const store = new PostgresToolGatewayStore({ pool: gatewayPool });
    try {
      await t.test(
        'expired unused grant is recoverable; active grant and wrong owner/tenant are denied',
        async () => {
          const expired = await seed(admin, { expired: true });
          assert.equal(await recovery(admin, expired), true);
          assert.equal(await recovery(admin, expired, randomUUID()), false);
          assert.equal(await recovery(admin, expired, undefined, 'user_other'), false);
          await admin.query('BEGIN');
          await admin.query('SET LOCAL ROLE orqaly_api');
          await admin.query("SELECT set_config('orqaly.tenant_id',$1,true)", [
            expired.action.tenantId,
          ]);
          const replacement = await insertExecutableActionWithClient(admin, {
            ...expired.action,
            id: randomUUID(),
            stepId: randomUUID(),
            effectId: randomUUID(),
            proposalIdempotencyKey: `replacement:${randomUUID()}`,
          });
          assert.equal(replacement.row.status, 'proposed');
          await admin.query('ROLLBACK');
          const active = await seed(admin);
          assert.equal(await recovery(admin, active), false);
        }
      );
      await t.test(
        'Gateway commits with SELECT+INSERT only; exact replay creates no second row',
        async () => {
          const fixture = await seed(admin);
          const args = {
            request: fixture.request,
            recordId: randomUUID(),
            dispatchReceipt: { status: 'succeeded', executorReference: `effect:${fixture.request.effectId}`,
              gatewayEffectAttestation: { receiptHash: sha256('receipt') } },
            receiptHash: sha256('receipt'),
            createdAt: new Date().toISOString(),
          };
          const first = await store.commitOperationalRecord(args);
          assert.equal(first.state, 'created');
          assert.equal(
            (await store.commitOperationalRecord({ ...args, recordId: randomUUID() })).state,
            'replayed'
          );
          assert.equal(await recovery(admin, fixture), false);
          const count = await admin.query(
            'SELECT count(*)::int AS count FROM orqaly.agentic_operational_records WHERE effect_id=$1',
            [fixture.request.effectId]
          );
          assert.equal(count.rows[0].count, 1);
          await admin.query("SELECT set_config('orqaly.tenant_id',$1,false)", [fixture.action.tenantId]);
          await admin.query('SET ROLE orqaly_api');
          try {
            const params = [fixture.action.tenantId, fixture.action.id, fixture.action.ownerUserId, args.receiptHash];
            assert.equal((await admin.query('SELECT * FROM orqaly.reconcile_committed_action_receipt($1,$2,$3,$4)',
              [params[0], params[1], 'user_other', params[3]])).rows.length, 0);
            assert.equal((await admin.query('SELECT * FROM orqaly.reconcile_committed_action_receipt($1,$2,$3,$4)',
              [params[0], params[1], params[2], sha256('wrong')])).rows.length, 0);
            const recovered = (await admin.query('SELECT * FROM orqaly.reconcile_committed_action_receipt($1,$2,$3,$4)', params)).rows[0];
            assert.equal(recovered.status, 'succeeded');
            assert.equal(recovered.row_version, '3');
            assert.equal((await admin.query('SELECT * FROM orqaly.reconcile_committed_action_receipt($1,$2,$3,$4)', params)).rows.length, 1);
            const audit = await admin.query('SELECT prior_status FROM orqaly.executable_action_reconciliations WHERE action_id=$1', [fixture.action.id]);
            assert.deepEqual(audit.rows, [{ prior_status: 'outcome_unknown' }]);
          } finally { await admin.query('RESET ROLE'); }
        }
      );
      await t.test(
        'redemption that waits for a lock rechecks expiry after acquiring it',
        async () => {
          const fixture = await seed(admin);
          await admin.query('BEGIN');
          await admin.query(
            `UPDATE orqaly.agentic_gateway_grants SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1`,
            [fixture.grant]
          );
          const pending = gatewayPool.query(
            `SELECT * FROM orqaly.redeem_agentic_gateway_grant($1,$2,$3,$3,$4,$5,$6,$7)`,
            [
              sha256(fixture.reference),
              fixture.scopeHash,
              fixture.action.tenantId,
              fixture.request.runId,
              fixture.request.stepId,
              fixture.request.effectId,
              new Date().toISOString(),
            ]
          );
          await admin.query('SELECT pg_sleep(1.1)');
          await admin.query('COMMIT');
          assert.equal((await pending).rows.length, 0);
          assert.equal(await recovery(admin, fixture), true);
        }
      );
    } finally {
      await gatewayPool.end();
      await admin.end();
    }
  }
);
