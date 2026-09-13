import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import {
  FAILURE_PROBE_COVERAGE,
  SolutionFailureProbeCommandSchema,
  SolutionFailureProbeKeySchema,
} from '../../shared/workflow-v2/solution-failure-probe-contracts.js';
import { createNativeFailureProbeArtifact } from './native-failure-probe.js';
import { nativeBundleHash, nativeBundleMembers, materializeNativeBundle } from './native-workflow-bundle.js';
import { SolutionError } from './solution-service.js';

const row = (result) => result.rows[0];
const fail = (code, message, status = 409) => {
  throw new SolutionError(code, message, status);
};
const SETTLE_MS = 180_000;

export function failureProbeReceiptMatches(result, value) {
  try {
    if (result?.kind !== FAILURE_PROBE_COVERAGE || result.coverage !== FAILURE_PROBE_COVERAGE || result.externalEffects !== false ||
        result.sourceVersion !== value.source_version || result.sourceWorkflowHash !== value.workflow_hash ||
        result.sourceBundleHash !== value.bundle_hash || result.dependencyId !== value.dependency_id ||
        !['succeeded','failed','outcome_unknown'].includes(result.status) || !['removed','pending'].includes(result.cleanup?.status)) return false;
    const artifact = createNativeFailureProbeArtifact({ ...value.source_snapshot,
      probeId: value.id, invocationId: value.id, allowExternalEffects: false });
    if (Object.entries(artifact.source).some(([key, expected]) => result[key] !== expected) ||
        result.testArtifactHash !== artifact.workflowHash || result.testBundleHash !== artifact.bundleHash) return false;
    const main = result.mainExecution;
    const executionId = (id) => typeof id === 'string' && /^[1-9][0-9]{0,30}$/.test(id);
    const providerId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
    if (!main || !['succeeded','failed','outcome_unknown'].includes(main.status) ||
        (main.executionId != null && !executionId(main.executionId)) ||
        (main.status !== 'outcome_unknown' && !executionId(main.executionId))) return false;
    const children = result.ownedDependencies;
    if (!Array.isArray(children) || children.length > 1) return false;
    if (children.length) {
      const child = children[0];
      const expected = nativeBundleMembers(artifact)[1];
      if (child.dependencyId !== expected.dependencyId || child.workflowHash !== hash(expected.workflow) || child.specHash !== hash(expected.spec) ||
          !providerId(child.workflowId) || !providerId(child.versionId) ||
          !['succeeded','failed','not_triggered','outcome_unknown'].includes(child.status) ||
          (child.executionId != null && !executionId(child.executionId)) ||
          (child.parentExecutionId != null && child.parentExecutionId !== main.executionId) ||
          (['succeeded','failed'].includes(child.status) && (!executionId(child.executionId) || !executionId(main.executionId) || child.parentExecutionId !== main.executionId || child.executionId === main.executionId)) ||
          (child.status === 'not_triggered' && (main.status !== 'succeeded' || child.executionId !== null)) ||
          result.materializedWorkflowHash !== materializeNativeBundle(artifact, children).workflowHash) return false;
    }
    if (result.status === 'succeeded')
      return main.status === 'failed' && children.length === 1 && children[0].status === 'succeeded' && result.cleanup.status === 'removed';
    if (result.status === 'failed')
      return result.cleanup.status === 'removed' && children.length === 1 &&
        ((main.status === 'failed' && children[0].status === 'failed') ||
          (main.status === 'succeeded' && children[0].status === 'not_triggered'));
    return true;
  } catch { return false; }
}

export function publicFailureProbe(value, now = Date.now()) {
  const stale = value.status === 'running' && now - new Date(value.created_at).getTime() > SETTLE_MS;
  return {
    id: value.id,
    revisionId: value.revision_id,
    sourceVersion: value.source_version,
    sourceRowVersion: value.source_row_version,
    workflowHash: value.workflow_hash,
    bundleHash: value.bundle_hash,
    dependencyId: value.dependency_id,
    coverage: FAILURE_PROBE_COVERAGE,
    status: stale ? 'outcome_unknown' : value.status,
    evidence: value.evidence,
    errorCode: stale ? 'FAILURE_PROBE_INTERRUPTED' : value.error_code,
    cleanupState: value.cleanup_state,
    canReconcile: (stale || value.status === 'outcome_unknown') && value.cleanup_state !== 'removed',
    createdAt: value.created_at,
    completedAt: value.completed_at,
  };
}

export function createSolutionFailureProbeService({ repository, runtime, enabled = false }) {
  async function owner(auth) {
    if (!auth?.userId) fail('UNAUTHENTICATED', 'Sign in required', 401);
    if (!enabled) fail('FAILURE_PROBE_UNAVAILABLE', 'Error-handler testing is not configured.', 503);
    return { userId: auth.userId, tenantId: await repository.resolveTenant({ userId: auth.userId }) };
  }
  const tx = (scope, fn) => repository.solutionBuildTransaction(scope, fn);
  async function active(client, scope) {
    if (row(await client.query('SELECT status FROM orqaly.tenants WHERE id=$1', [scope.tenantId]))?.status !== 'active')
      fail('TENANT_SUSPENDED', 'The workspace is not active.', 403);
  }
  async function storedProbe(client, scope, solutionId, revisionId, probeId) {
    const found = row(await client.query(
      `SELECT * FROM orqaly.solution_failure_probes WHERE tenant_id=$1 AND owner_user_id=$2
       AND solution_id=$3 AND revision_id=$4 AND id=$5`,
      [scope.tenantId, scope.userId, solutionId, revisionId, z.uuid().parse(probeId)]
    ));
    if (!found) fail('FAILURE_PROBE_NOT_FOUND', 'Test not found', 404);
    return found;
  }
  async function revision(client, scope, solutionId, revisionId, lock = false) {
    const value = row(await client.query(
      `SELECT r.*,s.environment_id AS assigned_environment_id
       FROM orqaly.solution_revisions r JOIN orqaly.customer_solutions s
         ON s.tenant_id=r.tenant_id AND s.id=r.solution_id AND s.owner_user_id=r.owner_user_id
       WHERE r.tenant_id=$1 AND r.owner_user_id=$2 AND r.solution_id=$3 AND r.id=$4
       ${lock ? 'FOR UPDATE OF r' : ''}`,
      [scope.tenantId, scope.userId, z.uuid().parse(solutionId), z.uuid().parse(revisionId)]
    ));
    if (!value) fail('SOLUTION_REVISION_NOT_FOUND', 'Revision not found', 404);
    return value;
  }
  function source(value) {
    return {
      environmentId: value.environment_id || value.assigned_environment_id,
      workflow: value.workflow,
      spec: value.spec ?? value.base_spec,
      sourceVersion: value.version,
      workflowHash: value.workflow_hash,
      bundleHash: nativeBundleHash({ workflow: value.workflow, spec: value.spec ?? value.base_spec }),
    };
  }
  function eligibility(value, scope) {
    try {
      if (['deploying','deployment_unknown'].includes(value.status))
        return { allowed: false, reason: 'Wait until the pending deployment is resolved.' };
      const input = source(value);
      const policy = runtime.nativePolicy?.(scope, input.environmentId);
      if (typeof runtime.probeNativeFailure !== 'function' ||
        policy?.ownedErrorHandlerProbe !== true || policy.backgroundExecution !== 'instance_cpu_always')
        return { allowed: false, reason: 'This environment is not configured for isolated error-handler tests.' };
      createNativeFailureProbeArtifact({ ...input, probeId: randomUUID(), invocationId: randomUUID(), allowExternalEffects: false });
      return { allowed: true, reason: null };
    } catch {
      return { allowed: false, reason: 'This test requires an owned error handler without outgoing service actions or credentials.' };
    }
  }
  const queryProbes = (client, scope, solutionId, revisionId) => client.query(
    `SELECT * FROM orqaly.solution_failure_probes
     WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND revision_id=$4
     ORDER BY created_at DESC LIMIT 50`,
    [scope.tenantId, scope.userId, solutionId, revisionId]
  );
  async function readFor(scope, solutionId, revisionId) {
    return tx(scope, async (client) => {
      await active(client, scope);
      const value = await revision(client, scope, solutionId, revisionId);
      return { ...eligibility(value, scope), probes: (await queryProbes(client, scope, solutionId, revisionId)).rows.map((item) => publicFailureProbe(item)) };
    });
  }
  function runtimeArgs(value) {
    return { ...value.source_snapshot, probeId: value.id, invocationId: value.id, allowExternalEffects: false };
  }
  return {
    async read(auth, solutionId, revisionId) {
      return readFor(await owner(auth), solutionId, revisionId);
    },
    async run(auth, solutionId, revisionId, command, key) {
      const scope = await owner(auth);
      const input = SolutionFailureProbeCommandSchema.parse(command);
      const requestKey = SolutionFailureProbeKeySchema.parse(key);
      const requestHash = hash({ solutionId, revisionId, ...input });
      const claimed = await tx(scope, async (client) => {
        await active(client, scope);
        // Serialize admissions per owner as well as per revision. This caps cost
        // and prevents a second probe while cleanup of the first is uncertain.
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
          [`failure-probe:${scope.tenantId}:${scope.userId}`]);
        const value = await revision(client, scope, solutionId, revisionId, true);
        const previous = row(await client.query(
          `SELECT * FROM orqaly.solution_failure_probes WHERE tenant_id=$1 AND owner_user_id=$2
           AND solution_id=$3 AND revision_id=$4 AND idempotency_key=$5`,
          [scope.tenantId, scope.userId, solutionId, revisionId, requestKey]
        ));
        if (previous) {
          if (previous.request_hash !== requestHash)
            fail('FAILURE_PROBE_KEY_REUSED', 'This request key belongs to a different test.');
          return { previous };
        }
        const snapshot = source(value);
        if (value.row_version !== input.expectedVersion || snapshot.workflowHash !== input.workflowHash || snapshot.bundleHash !== input.bundleHash)
          fail('SOLUTION_REVISION_CHANGED', 'This draft changed. Review the current version before testing.');
        const capability = eligibility(value, scope);
        if (!capability.allowed) fail('FAILURE_PROBE_UNAVAILABLE', capability.reason, 422);
        const pending = row(await client.query(
          `SELECT id FROM orqaly.solution_failure_probes WHERE tenant_id=$1 AND owner_user_id=$2
           AND status IN ('running','outcome_unknown') AND cleanup_state<>'removed' LIMIT 1`,
          [scope.tenantId, scope.userId]
        ));
        if (pending) fail('FAILURE_PROBE_UNRESOLVED', 'Resolve the earlier error-handler test before starting another.');
        const quota = row(await client.query(
          `SELECT count(*)::integer AS count FROM orqaly.solution_failure_probes
           WHERE tenant_id=$1 AND owner_user_id=$2 AND created_at>clock_timestamp()-interval '1 day'`,
          [scope.tenantId, scope.userId]
        ));
        if (quota.count >= 20) fail('FAILURE_PROBE_LIMIT', 'The daily isolated test limit has been reached.', 429);
        const id = randomUUID();
        const inserted = row(await client.query(
          `INSERT INTO orqaly.solution_failure_probes
           (tenant_id,solution_id,revision_id,owner_user_id,id,idempotency_key,request_hash,
            source_row_version,source_version,workflow_hash,bundle_hash,environment_id,dependency_id,source_snapshot)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
          [scope.tenantId,solutionId,revisionId,scope.userId,id,requestKey,requestHash,
            value.row_version,value.version,snapshot.workflowHash,snapshot.bundleHash,
            snapshot.environmentId,snapshot.spec.ownedDependencies[0].id,snapshot]
        ));
        return { inserted };
      });
      if (claimed.previous) return { replayed: true, probe: publicFailureProbe(claimed.previous) };
      const value = claimed.inserted;
      let evidence = null;
      let status = 'outcome_unknown';
      let cleanupState = 'unknown';
      try {
        const result = await runtime.probeNativeFailure(scope, runtimeArgs(value));
        // A runtime adapter cannot substitute a different source or generic
        // wiring test for the selected customer's actual handler.
        if (!failureProbeReceiptMatches(result, value) ||
          Buffer.byteLength(JSON.stringify(result)) > 60000)
          throw new Error('failure_probe_receipt_mismatch');
        evidence = result;
        cleanupState = result.cleanup?.status === 'removed' ? 'removed' : 'unknown';
        status = result.status === 'succeeded' && cleanupState === 'removed'
          ? 'succeeded' : result.status === 'failed' && cleanupState === 'removed' ? 'failed' : 'outcome_unknown';
      } catch { /* Never reflect source/runtime messages or retry an uncertain dispatch. */ }
      const finished = await tx(scope, async (client) => row(await client.query(
        `UPDATE orqaly.solution_failure_probes SET status=$5,evidence=$6,error_code=$7,
         completed_at=clock_timestamp(),cleanup_state=$8
         WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4 AND status='running' AND cleanup_state<>'removed'
         RETURNING *`,
        [scope.tenantId,scope.userId,solutionId,value.id,status,evidence,
          status === 'outcome_unknown' ? 'FAILURE_PROBE_OUTCOME_UNKNOWN' : null,cleanupState]
      )) ?? await storedProbe(client, scope, solutionId, revisionId, value.id));
      return { replayed: false, probe: publicFailureProbe(finished) };
    },
    async reconcile(auth, solutionId, revisionId, probeId) {
      const scope = await owner(auth);
      const value = await tx(scope, async (client) => {
        await revision(client, scope, solutionId, revisionId);
        // Cleanup reduces authority and must not dispatch anything. Do not add
        // the active-tenant execution gate here. The existing owner resolver
        // still applies; suspended identities without a resolvable scope need
        // the operator cleanup path rather than a new authentication bypass.
        return storedProbe(client, scope, solutionId, revisionId, probeId);
      });
      if (!publicFailureProbe(value).canReconcile) return { probe: publicFailureProbe(value) };
      if (typeof runtime.reconcileNativeFailureProbe !== 'function')
        fail('FAILURE_PROBE_RECONCILE_UNAVAILABLE', 'Test reconciliation is not configured.', 503);
      const result = await runtime.reconcileNativeFailureProbe(scope, runtimeArgs(value));
      // Cleanup does not turn missing execution evidence into a passed test.
      if (!failureProbeReceiptMatches(result, value) || result.cleanup?.status !== 'removed')
        return { probe: publicFailureProbe(value) };
      const updated = await tx(scope, async (client) => row(await client.query(
        `UPDATE orqaly.solution_failure_probes SET cleanup_state='removed',cleanup_evidence=$5
         WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4
         AND cleanup_state<>'removed' RETURNING *`,
        [scope.tenantId,scope.userId,solutionId,probeId,{ status:'removed', verifiedAt:new Date().toISOString() }]
      )) ?? await storedProbe(client, scope, solutionId, revisionId, probeId));
      return { probe: publicFailureProbe(updated) };
    },
  };
}
