import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { canonicalJsonSha256 } from '../../services/agentic-control-plane/src/domain/canonical.js';
import {
  CreateSolutionApplicationKeySchema,
  SOLUTION_APP_KEY_POLICY,
  SolutionApplicationIdempotencyKeySchema,
  SolutionApplicationInvocationSchema,
} from '../../shared/workflow-v2/solution-application-key-contracts.js';
import {
  publicInvocation,
  resolveEffectiveSolution,
  SolutionError,
  validateSolutionInvocationInput,
  assertNoUnresolvedNativeEffect,
} from './solution-service.js';

const fail = (code, message, status = 409, retryAfter) => {
  const error = new SolutionError(code, message, status);
  if (retryAfter) error.retryAfter = retryAfter;
  throw error;
};
const uuid = z.uuid();
const version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const first = (result) => result.rows[0];
const TOKEN =
  /^Bearer (orqaly_app_(preview|production)_v1\.([0-9a-f-]{36})\.([0-9a-f-]{36})\.([A-Za-z0-9_-]{43}))$/;
export const hashSolutionApplicationKey = (token) =>
  createHash('sha256').update('orqaly.solution-application-key.v1\0').update(token).digest('hex');

function safeReceipt(invocation) {
  const value = publicInvocation(invocation);
  delete value.input;
  delete value.actor;
  return value;
}

export function createSolutionApplicationKeyService({
  repository,
  solutionService,
  environment,
  now = Date.now,
}) {
  z.enum(['preview', 'production']).parse(environment);
  const tx = (scope, callback) =>
    scope.userId && repository.solutionBuildTransaction
      ? repository.solutionBuildTransaction(scope, callback)
      : repository.solutionTransaction(scope.tenantId, callback);
  async function owner(auth) {
    if (!auth?.userId) fail('UNAUTHENTICATED', 'Sign in required', 401);
    const tenantId = await repository.resolveTenant({ userId: auth.userId });
    if (!tenantId) fail('UNAUTHENTICATED', 'Sign in required', 401);
    return { tenantId, userId: auth.userId };
  }
  function metadata(key, workflowHash) {
    return {
      id: key.id,
      label: key.label,
      prefix: `orqaly_app_${key.id.slice(0, 8)}`,
      status: key.revoked_at
        ? 'revoked'
        : new Date(key.expires_at).valueOf() <= now()
          ? 'expired'
          : key.workflow_hash !== workflowHash
            ? 'release_changed'
            : 'active',
      workflowHash: key.workflow_hash,
      createdAt: key.created_at,
      expiresAt: key.expires_at,
      lastUsedAt: key.last_used_at ?? null,
      revokedAt: key.revoked_at ?? null,
      rowVersion: key.row_version,
    };
  }
  async function solution(client, scope, id, lock = false) {
    const value = first(
      await client.query(
        `SELECT * FROM orqaly.customer_solutions
       WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3 ${lock ? 'FOR UPDATE' : ''}`,
        [scope.tenantId, scope.userId, uuid.parse(id)]
      )
    );
    if (!value) fail('SOLUTION_NOT_FOUND', 'Solution not found', 404);
    return resolveEffectiveSolution(client, value);
  }
  function requireActive(value) {
    if (
      value.status !== 'active' ||
      !value.deployment ||
      !value.tested_at ||
      (value.spec?.kind === 'n8n_workflow_v2' && value.last_error?.includes('VERIFICATION'))
    )
      fail(
        'SOLUTION_NOT_ACTIVE',
        'Deploy, test and activate this Solution before using application access.'
      );
  }
  async function activeTenant(client, scope) {
    const tenant = first(
      await client.query('SELECT status FROM orqaly.tenants WHERE id=$1', [scope.tenantId])
    );
    if (tenant?.status !== 'active')
      fail('APP_KEY_INVALID', 'Application access key is invalid or unavailable.', 401);
  }
  function parsedAuthorization(authorization) {
    const match = typeof authorization === 'string' && TOKEN.exec(authorization);
    if (
      !match ||
      match[2] !== environment ||
      !uuid.safeParse(match[3]).success ||
      !uuid.safeParse(match[4]).success
    )
      fail('APP_KEY_INVALID', 'Application access key is invalid or unavailable.', 401);
    return { tenantId: match[3], keyId: match[4], tokenHash: hashSolutionApplicationKey(match[1]) };
  }
  async function verifiedKey(client, selectors, solutionId, lock = false) {
    const key = first(
      await client.query(
        `SELECT * FROM orqaly.solution_application_keys
       WHERE tenant_id=$1 AND id=$2 AND solution_id=$3 ${lock ? 'FOR UPDATE' : ''}`,
        [selectors.tenantId, selectors.keyId, solutionId]
      )
    );
    // Selectors are not authority. No owner, Solution or tenant metadata is
    // accepted until a fixed-length digest comparison succeeds.
    const digest = /^[a-f0-9]{64}$/.test(key?.token_hash ?? '') ? key.token_hash : '0'.repeat(64);
    const matches = timingSafeEqual(
      Buffer.from(selectors.tokenHash, 'hex'),
      Buffer.from(digest, 'hex')
    );
    if (
      !key ||
      !matches ||
      key.environment !== environment ||
      key.revoked_at ||
      new Date(key.expires_at).valueOf() <= now()
    )
      fail('APP_KEY_INVALID', 'Application access key is invalid or unavailable.', 401);
    return key;
  }
  async function authenticate(authorization, solutionId) {
    uuid.parse(solutionId);
    const selectors = parsedAuthorization(authorization);
    return tx(selectors, async (client) => {
      const key = await verifiedKey(client, selectors, solutionId);
      return { ...selectors, userId: key.owner_user_id };
    });
  }
  async function lockedAuthority(client, scope, id) {
    // Lock order is always Solution then key, including create/revoke. The
    // preliminary authentication reads only the key and holds no write lock.
    const value = await solution(client, scope, id, true);
    const key = await verifiedKey(client, scope, id, true);
    if (key.owner_user_id !== scope.userId)
      fail('APP_KEY_INVALID', 'Application access key is invalid or unavailable.', 401);
    await activeTenant(client, scope);
    if (key.workflow_hash !== value.workflow_hash)
      fail(
        'APP_KEY_RELEASE_CHANGED',
        'This key belongs to a previous release. Create a new key for the active release.'
      );
    return { value, key };
  }
  async function quota(client, scope, id) {
    const observed = now();
    const minute = new Date(Math.floor(observed / 60_000) * 60_000).toISOString();
    const day = new Date(Math.floor(observed / 86_400_000) * 86_400_000).toISOString();
    const usage = first(
      await client.query(
        `INSERT INTO orqaly.solution_application_usage
       (tenant_id,solution_id,minute_start,minute_count,day_start,day_count)
       VALUES ($1,$2,$3,1,$4,1)
       ON CONFLICT (tenant_id,solution_id) DO UPDATE SET
         minute_start=EXCLUDED.minute_start,
         minute_count=CASE WHEN solution_application_usage.minute_start=EXCLUDED.minute_start THEN solution_application_usage.minute_count+1 ELSE 1 END,
         day_start=EXCLUDED.day_start,
         day_count=CASE WHEN solution_application_usage.day_start=EXCLUDED.day_start THEN solution_application_usage.day_count+1 ELSE 1 END
       WHERE (solution_application_usage.minute_start<>EXCLUDED.minute_start OR solution_application_usage.minute_count<60)
         AND (solution_application_usage.day_start<>EXCLUDED.day_start OR solution_application_usage.day_count<1000)
       RETURNING minute_count,day_count`,
        [scope.tenantId, id, minute, day]
      )
    );
    if (!usage)
      fail(
        'APP_KEY_RATE_LIMITED',
        'This Solution has reached its application request allowance.',
        429,
        60
      );
  }
  return {
    async list(auth, id) {
      const scope = await owner(auth);
      return tx(scope, async (client) => {
        const value = await solution(client, scope, id);
        const keys = await client.query(
          `SELECT * FROM orqaly.solution_application_keys
           WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3
           ORDER BY (revoked_at IS NULL AND expires_at>$4) DESC,created_at DESC,id DESC LIMIT 100`,
          [scope.tenantId, scope.userId, id, new Date(now()).toISOString()]
        );
        return {
          keys: keys.rows.map((key) => metadata(key, value.workflow_hash)),
          policy: SOLUTION_APP_KEY_POLICY,
        };
      });
    },
    async create(auth, id, body, expectedVersion, idempotencyKey) {
      const command = CreateSolutionApplicationKeySchema.parse(body);
      version.parse(expectedVersion);
      SolutionApplicationIdempotencyKeySchema.parse(idempotencyKey);
      const scope = await owner(auth);
      return tx(scope, async (client) => {
        const value = await solution(client, scope, id, true);
        requireActive(value);
        const existing = first(
          await client.query(
            `SELECT id FROM orqaly.solution_application_keys WHERE tenant_id=$1 AND solution_id=$2 AND create_key=$3`,
            [scope.tenantId, id, idempotencyKey]
          )
        );
        if (existing)
          fail(
            'APP_KEY_ALREADY_CREATED',
            'This key was already created and cannot be shown again. Revoke it and create a new key.'
          );
        if (value.row_version !== expectedVersion)
          fail('SOLUTION_VERSION_CONFLICT', 'The Solution changed. Refresh before creating a key.');
        if (value.workflow_hash !== command.workflowHash)
          fail(
            'APP_KEY_RELEASE_CHANGED',
            'The active release changed. Refresh before creating a key.'
          );
        const count = first(
          await client.query(
            `SELECT count(*)::integer AS count FROM orqaly.solution_application_keys
           WHERE tenant_id=$1 AND solution_id=$2 AND revoked_at IS NULL AND expires_at>$3`,
            [scope.tenantId, id, new Date(now()).toISOString()]
          )
        );
        if (count.count >= SOLUTION_APP_KEY_POLICY.maxActiveKeys)
          fail('APP_KEY_LIMIT', 'Revoke an existing key before creating another.');
        const keyId = randomUUID();
        const token = `orqaly_app_${environment}_v1.${scope.tenantId}.${keyId}.${randomBytes(32).toString('base64url')}`;
        const createdAt = new Date(now()).toISOString();
        const expiresAt = new Date(
          new Date(createdAt).valueOf() + command.expiresInDays * 86_400_000
        ).toISOString();
        const key = first(
          await client.query(
            `INSERT INTO orqaly.solution_application_keys
           (tenant_id,solution_id,id,owner_user_id,environment,label,token_hash,workflow_hash,create_key,created_at,expires_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [
              scope.tenantId,
              id,
              keyId,
              scope.userId,
              environment,
              command.label,
              hashSolutionApplicationKey(token),
              value.workflow_hash,
              idempotencyKey,
              createdAt,
              expiresAt,
            ]
          )
        );
        return { key: metadata(key, value.workflow_hash), token };
      });
    },
    async revoke(auth, id, keyId, expectedVersion) {
      uuid.parse(keyId);
      version.parse(expectedVersion);
      const scope = await owner(auth);
      return tx(scope, async (client) => {
        const value = await solution(client, scope, id, true);
        const key = first(
          await client.query(
            `SELECT * FROM orqaly.solution_application_keys
           WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4 FOR UPDATE`,
            [scope.tenantId, scope.userId, id, keyId]
          )
        );
        if (!key) fail('APP_KEY_NOT_FOUND', 'Application key not found.', 404);
        if (key.row_version !== expectedVersion)
          fail('APP_KEY_VERSION_CONFLICT', 'This key changed. Refresh before revoking.');
        const revoked = key.revoked_at
          ? key
          : first(
              await client.query(
                `UPDATE orqaly.solution_application_keys SET revoked_at=clock_timestamp(),row_version=row_version+1
           WHERE tenant_id=$1 AND solution_id=$2 AND id=$3 RETURNING *`,
                [scope.tenantId, id, keyId]
              )
            );
        return { key: metadata(revoked, value.workflow_hash) };
      });
    },
    async invoke(authorization, id, body, idempotencyKey) {
      const command = SolutionApplicationInvocationSchema.parse(body);
      SolutionApplicationIdempotencyKeySchema.parse(idempotencyKey);
      const scope = await authenticate(authorization, id);
      const namespacedKey = `app_${scope.keyId}_${createHash('sha256').update(idempotencyKey).digest('hex')}`;
      const claimed = await tx(scope, async (client) => {
        const { value, key } = await lockedAuthority(client, scope, id);
        requireActive(value);
        const requestHash = canonicalJsonSha256({
          applicationKeyId: key.id,
          mode: 'production',
          input: command.input,
          workflowHash: value.workflow_hash,
        });
        const existing = first(
          await client.query(
            `SELECT * FROM orqaly.solution_invocations WHERE tenant_id=$1 AND solution_id=$2 AND idempotency_key=$3`,
            [scope.tenantId, id, namespacedKey]
          )
        );
        if (existing) {
          if (existing.application_key_id !== key.id || existing.request_hash !== requestHash)
            fail('IDEMPOTENCY_CONFLICT', 'This request key was already used with different input.');
          return { existing };
        }
        try {
          validateSolutionInvocationInput(value, command.input);
        } catch {
          fail('SOLUTION_INPUT_INVALID', 'Input does not match this Solution.', 400);
        }
        // Never age out a durable in-flight claim into permission for another
        // effect. Even abandoned/unknown dispatches need explicit reconciliation.
        const running = first(
          await client.query(
            `SELECT id FROM orqaly.solution_invocations WHERE tenant_id=$1 AND solution_id=$2 AND status='running' LIMIT 1`,
            [scope.tenantId, id]
          )
        );
        if (running)
          fail('SOLUTION_BUSY', 'A request is still running or awaiting reconciliation.', 409, 5);
        await assertNoUnresolvedNativeEffect(client, scope, value);
        await quota(client, scope, id);
        const invocation = first(
          await client.query(
            `INSERT INTO orqaly.solution_invocations
           (tenant_id,solution_id,id,owner_user_id,mode,idempotency_key,request_hash,workflow_hash,input,status,revision_id,application_key_id,application_key_label)
           VALUES ($1,$2,$3,$4,'production',$5,$6,$7,$8,'running',$9,$10,$11) RETURNING *`,
            [
              scope.tenantId,
              id,
              randomUUID(),
              scope.userId,
              namespacedKey,
              requestHash,
              value.workflow_hash,
              command.input,
              value.revision_id ?? null,
              key.id,
              key.label,
            ]
          )
        );
        await client.query(
          'UPDATE orqaly.solution_application_keys SET last_used_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2',
          [scope.tenantId, key.id]
        );
        return { solution: value, invocation };
      });
      if (claimed.existing) return { invocation: safeReceipt(claimed.existing), replayed: true };
      const result = await solutionService.executeClaimedInvocation(scope, claimed);
      const invocation = { ...result.invocation };
      delete invocation.input;
      delete invocation.actor;
      return { invocation, replayed: false };
    },
    async readInvocation(authorization, id, invocationId) {
      uuid.parse(invocationId);
      const scope = await authenticate(authorization, id);
      return tx(scope, async (client) => {
        const { key } = await lockedAuthority(client, scope, id);
        const invocation = first(
          await client.query(
            `SELECT * FROM orqaly.solution_invocations
           WHERE tenant_id=$1 AND solution_id=$2 AND application_key_id=$3 AND id=$4`,
            [scope.tenantId, id, key.id, invocationId]
          )
        );
        if (!invocation) fail('INVOCATION_NOT_FOUND', 'Invocation not found.', 404);
        return { invocation: safeReceipt(invocation) };
      });
    },
  };
}
