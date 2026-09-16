// Read-only live evidence check; secrets and customer identity never printed.
// Requires the existing Cloud SQL proxy on 127.0.0.1:19471.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import pg from 'pg';
import { canonicalJsonSha256 } from '../../../services/agentic-tool-gateway/src/canonical.js';
import { gatewayAttestationHashPayload } from '../../../services/agentic-tool-gateway/src/signing.js';

const secret = (name) =>
  execFileSync(
    'gcloud',
    ['secrets', 'versions', 'access', '1', `--secret=${name}`, '--project=axwise-v2-preview-001'],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  ).trim();
let client;
let stage = 'input';
try {
  const runId = process.argv[2];
  const committedOnly = process.argv[3] === '--committed-only';
  assert.match(runId || '', /^[a-f0-9-]{36}$/);
  stage = 'admin_credentials';
  client = new pg.Client({
    host: '127.0.0.1',
    port: 19471,
    user: 'postgres',
    password: secret('orqaly-v2-preview-001-db-admin-password'),
    database: 'orqaly_v2_preview_001',
  });
  stage = 'database_connect';
  await client.connect();
  stage = 'read_evidence';
  await client.query('BEGIN READ ONLY');
  const actions = (
    await client.query(
      `SELECT * FROM orqaly.executable_actions
    WHERE workflow_run_id=$1 ORDER BY created_at,id`,
      [runId]
    )
  ).rows;
  const records = (
    await client.query('SELECT * FROM orqaly.agentic_operational_records WHERE run_id=$1', [runId])
  ).rows;
  const effects = (
    await client.query('SELECT * FROM orqaly.agentic_gateway_effects WHERE run_id=$1', [runId])
  ).rows;
  const action = actions.at(-1);
  stage = 'action_record_consistency';
  assert.equal(action?.status, committedOnly ? 'outcome_unknown' : 'succeeded');
  assert.equal(records.length, 1);
  assert.equal(effects.length, 1);
  const record = records[0],
    effect = effects[0];
  assert.equal(action.approval_decision, 'approve');
  assert.equal(action.id, record.action_id);
  assert.equal(action.id, effect.action_id);
  assert.equal(action.tenant_id, record.tenant_id);
  assert.equal(action.owner_user_id, record.owner_user_id);
  assert.equal(action.effect_id, record.effect_id);
  assert.equal(record.record_id, effect.operational_record_id);
  if (!committedOnly) {
    assert.equal(action.receipt_hash, effect.receipt_hash);
    assert.deepEqual(action.dispatch_receipt, effect.dispatch_receipt);
  }
  assert.equal(canonicalJsonSha256(action.canonical_input), record.canonical_input_hash);
  assert.equal(canonicalJsonSha256(action.approval_subject), action.approval_binding_hash);
  const attestation = effect.dispatch_receipt.gatewayEffectAttestation;
  stage = 'attestation_consistency';
  assert.equal(attestation.runId, runId);
  assert.equal(attestation.effectId, record.effect_id);
  assert.equal(attestation.canonicalInputHash, record.canonical_input_hash);
  assert.equal(
    attestation.externalReferences.find((item) => item.referenceType === 'operational_record_id')
      ?.referenceValue,
    record.record_id
  );
  assert.equal(
    canonicalJsonSha256(gatewayAttestationHashPayload(attestation)),
    attestation.receiptHash
  );
  stage = 'public_keys';
  const keys = JSON.parse(secret('orqaly-v2-preview-001-gateway-public-keys-json'));
  stage = 'signature_verification';
  const encodedKey = keys[attestation.signatureKeyId];
  assert.equal(typeof encodedKey, 'string');
  const publicKey = crypto.createPublicKey(
    encodedKey.includes('BEGIN PUBLIC KEY')
      ? encodedKey
      : Buffer.from(encodedKey, 'base64').toString('utf8')
  );
  assert.equal(publicKey.asymmetricKeyType, 'ed25519');
  assert.equal(
    crypto.verify(
      null,
      Buffer.from(attestation.receiptHash, 'hex'),
      publicKey,
      Buffer.from(attestation.signature, 'base64url')
    ),
    true
  );
  await client.query('COMMIT');
  console.log(
    JSON.stringify(
      {
        verified: true,
        verificationMode: committedOnly ? 'committed_receipt_only' : 'complete_product_result',
        runId,
        actionId: action.id,
        agentId: action.agent_id,
        agentName: action.agent_name,
        recordId: record.record_id,
        recordCount: records.length,
        effectCount: effects.length,
        receiptHash: attestation.receiptHash,
        signatureVerified: true,
        createdAt: record.created_at,
        resultReference: effect.dispatch_receipt.executorReference,
        attempts: actions.map((item) => ({
          id: item.id,
          status: item.status,
          errorCode: item.error_code,
        })),
      },
      null,
      2
    )
  );
} catch (error) {
  console.error(
    JSON.stringify({ verified: false, stage, code: error.code || 'verification_failed' })
  );
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
