import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { canonicalJsonSha256 as canonicalHash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import { SolutionRevisionInvocationSchema } from '../../shared/workflow-v2/solution-contracts.js';
import { reviewSolutionWorkflow } from './solution-workflow-review.js';
import { reviewNativeWorkflow } from './native-workflow-review.js';
import { normalizeNativeWorkflow } from './native-workflow-runtime-contract.js';
import {
  nativeBundleHash,
  nativeBundleConnectionRequirements,
  normalizeNativeBundle,
} from './native-workflow-bundle.js';
import { containsSolutionBuildSecret } from '../../shared/workflow-v2/solution-build-secrets.js';
import { loadRevisionNativeConnections } from './solution-revision-connection-store.js';
import { createSolutionRevisionConnectionService } from './solution-revision-connection-service.js';
import {
  DEPLOYMENT_STALE_MS,
  SolutionError,
  publicInvocation,
  resolveEffectiveSolution,
  executeSolutionInvocation,
  validateSolutionInvocationInput,
  nativeSolutionTestPlan,
  hasNativeAcceptanceCoverage,
  nativeLifecycleReceiptMatches,
  assertNoUnresolvedNativeEffect,
} from './solution-service.js';

const versionSchema = z.number().int().nonnegative();
const workflowSchema = z
  .record(z.string(), z.unknown())
  .refine(
    (workflow) => Buffer.byteLength(JSON.stringify(workflow)) <= 256000,
    'Workflow must be at most 256 KB'
  );
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const keySchema = z
  .string()
  .min(8)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/);
const row = (result) => result.rows[0];
const native = (value) => (value.spec ?? value.base_spec)?.kind === 'n8n_workflow_v2';
const fail = (code, message, status = 409) => {
  throw new SolutionError(code, message, status);
};

export function revisionForkEligibility(value, invocations = []) {
  if (!['approved', 'ready', 'rejected', 'superseded'].includes(value.status))
    return {
      allowed: false,
      reason: 'Only a frozen, non-active candidate can be copied into a new draft.',
    };
  if (value.last_error?.includes('VERIFICATION'))
    return {
      allowed: false,
      reason: 'Verify the pending runtime change before fixing this candidate.',
    };
  if (
    invocations.some(
      (entry) =>
        entry.revision_id === value.id && ['running', 'outcome_unknown'].includes(entry.status)
    )
  )
    return {
      allowed: false,
      reason: 'Resolve this candidate’s running or uncertain test before creating another draft.',
    };
  return { allowed: true };
}

export function publicRevision(value) {
  let bundleHash = null;
  try {
    if (native(value))
      bundleHash = nativeBundleHash({
        workflow: value.workflow,
        spec: value.spec ?? value.base_spec,
      });
  } catch {
    /* Invalid drafts remain visible, never executable. */
  }
  return {
    id: value.id,
    solutionId: value.solution_id,
    version: value.version,
    baseRevisionId: value.base_revision_id,
    baseVersion: value.base_version,
    workflow: value.workflow,
    workflowHash: value.workflow_hash,
    ...(bundleHash ? { bundleHash } : {}),
    spec: value.spec,
    status:
      value.status === 'deploying' &&
      Date.now() - new Date(value.updated_at).getTime() > DEPLOYMENT_STALE_MS
        ? 'deployment_unknown'
        : value.status,
    rowVersion: value.row_version,
    review: value.review,
    environmentId: value.environment_id,
    approvedAt: value.approved_at,
    testedAt: value.tested_at,
    deployment: value.deployment,
    lastError: value.last_error,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
  };
}

// A new webhook address is reserved before editing so the approved bytes are
// exactly the bytes deployed. v1 remains reachable only through its old record.
export function rebaseWorkflowForDraft(workflow, revisionId) {
  z.uuid().parse(revisionId);
  const rebased = structuredClone(workflow);
  rebased.name = `Orqaly solution ${revisionId} v1`;
  for (const node of rebased.nodes) {
    if (node.type === 'n8n-nodes-base.webhook') {
      node.webhookId = revisionId;
      node.parameters.path = `solution-${revisionId}`;
    }
  }
  return rebased;
}

export function createSolutionRevisionService({
  repository,
  runtime,
  reviewWorkflow = reviewSolutionWorkflow,
}) {
  async function owner(auth) {
    if (!auth?.userId) fail('UNAUTHENTICATED', 'Sign in required', 401);
    return {
      tenantId: await repository.resolveTenant({ userId: auth.userId }),
      userId: auth.userId,
    };
  }
  const tx = (scope, fn) =>
    repository.solutionBuildTransaction
      ? repository.solutionBuildTransaction(scope, fn)
      : repository.solutionTransaction(scope.tenantId, fn);
  function reviewNative(value, scope, environmentId, nativeConnections = []) {
    return reviewNativeWorkflow({
      workflow: value.workflow,
      spec: value.spec ?? value.base_spec,
      baseWorkflow: value.base_workflow,
      runtimePolicy: runtime.nativePolicy?.(scope, environmentId),
      connections: nativeConnections,
      environmentId,
    });
  }
  async function findSolution(client, scope, id, lock = false) {
    const value = row(
      await client.query(
        `SELECT * FROM orqaly.customer_solutions
       WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3 ${lock ? 'FOR UPDATE' : ''}`,
        [scope.tenantId, scope.userId, z.uuid().parse(id)]
      )
    );
    if (!value) fail('SOLUTION_NOT_FOUND', 'Solution not found', 404);
    const enriched = await resolveEffectiveSolution(client, { ...value, active_revision_id: null });
    return { ...enriched, active_revision_id: value.active_revision_id };
  }
  async function findRevision(client, scope, id, revisionId, lock = false) {
    const value = row(
      await client.query(
        `SELECT * FROM orqaly.solution_revisions
       WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4 ${lock ? 'FOR UPDATE' : ''}`,
        [scope.tenantId, scope.userId, id, z.uuid().parse(revisionId)]
      )
    );
    if (!value) fail('SOLUTION_REVISION_NOT_FOUND', 'Revision not found', 404);
    return value;
  }
  function checkVersion(value, expectedVersion, workflowHash) {
    if (
      value.row_version !== versionSchema.parse(expectedVersion) ||
      (workflowHash !== undefined && value.workflow_hash !== hashSchema.parse(workflowHash))
    )
      fail(
        'SOLUTION_REVISION_CHANGED',
        'This revision changed. Refresh and review the latest changes.'
      );
  }
  function checkBundle(value, expectedHash, { reviewing = false } = {}) {
    let actual;
    try {
      actual = native(value)
        ? nativeBundleHash({ workflow: value.workflow, spec: value.spec ?? value.base_spec })
        : null;
    } catch {
      // Invalid editable graph state is still reviewable so its precise static
      // findings can be shown. It can never pass approval or execution CAS.
      if (reviewing && expectedHash === undefined) return null;
      fail(
        'SOLUTION_REVISION_CHANGED',
        'The owned dependency bundle could not be verified. Review the current draft.'
      );
    }
    if ((actual && expectedHash !== actual) || (!actual && expectedHash !== undefined))
      fail(
        'SOLUTION_REVISION_CHANGED',
        'The main workflow or an owned dependency changed. Review the complete current bundle.'
      );
    return actual;
  }
  async function event(client, scope, value, kind, details = {}) {
    await client.query(
      `INSERT INTO orqaly.solution_revision_events
       (tenant_id,solution_id,revision_id,id,owner_user_id,kind,workflow_hash,details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        scope.tenantId,
        value.solution_id,
        value.id,
        randomUUID(),
        scope.userId,
        kind,
        value.workflow_hash,
        details,
      ]
    );
  }
  async function readFor(scope, id, revisionId) {
    return tx(scope, async (client) => {
      const solution = await findSolution(client, scope, id);
      const rows = await client.query(
        `SELECT * FROM orqaly.solution_revisions
         WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 ORDER BY version DESC LIMIT 50`,
        [scope.tenantId, scope.userId, id]
      );
      const receipts = await client.query(
        `SELECT * FROM orqaly.solution_invocations
         WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND revision_id IS NOT NULL
         ORDER BY created_at DESC LIMIT 200`,
        [scope.tenantId, scope.userId, id]
      );
      // Unresolved receipts are checked independently of the bounded history so
      // an old, uncertain effect cannot disappear behind newer successful runs.
      const unresolved = await client.query(
        `SELECT revision_id,status FROM orqaly.solution_invocations
         WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3
           AND revision_id IS NOT NULL AND status IN ('running','outcome_unknown')`,
        [scope.tenantId, scope.userId, id]
      );
      const revisions = rows.rows.map((value) => ({
        ...publicRevision(value),
        forkEligibility: revisionForkEligibility(value, unresolved.rows),
      }));
      return {
        revisions,
        invocations: receipts.rows.map(publicInvocation),
        activeRevisionId: solution.active_revision_id,
        ...(revisionId ? { revision: revisions.find((value) => value.id === revisionId) } : {}),
      };
    });
  }
  return {
    ...createSolutionRevisionConnectionService({
      runtime,
      owner,
      tx,
      findSolution,
      findRevision,
      checkVersion,
      checkBundle,
      publicRevision,
      event,
    }),
    async read(auth, id) {
      return readFor(await owner(auth), id);
    },
    async readRevision(auth, id, revisionId) {
      const scope = await owner(auth);
      return tx(scope, async (client) => {
        await findSolution(client, scope, id);
        return { revision: publicRevision(await findRevision(client, scope, id, revisionId)) };
      });
    },
    async forkRevision(auth, id, sourceRevisionId, body, key) {
      const command = z
        .object({
          expectedVersion: versionSchema,
          workflowHash: hashSchema,
          bundleHash: hashSchema.optional(),
        })
        .strict()
        .parse(body);
      keySchema.parse(key);
      z.uuid().parse(sourceRevisionId);
      const scope = await owner(auth);
      const requestHash = canonicalHash({ sourceRevisionId, ...command });
      const revisionId = await tx(scope, async (client) => {
        const parent = await findSolution(client, scope, id, true);
        const previous = row(
          await client.query(
            `SELECT * FROM orqaly.solution_revision_forks
           WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND idempotency_key=$4`,
            [scope.tenantId, scope.userId, id, key]
          )
        );
        if (previous) {
          if (previous.request_hash !== requestHash)
            fail('IDEMPOTENCY_CONFLICT', 'This key was used for a different candidate.');
          return previous.target_revision_id;
        }
        const source = await findRevision(client, scope, id, sourceRevisionId, true);
        checkVersion(source, command.expectedVersion, command.workflowHash);
        checkBundle(source, command.bundleHash);
        const unresolved = await client.query(
          `SELECT revision_id,status FROM orqaly.solution_invocations
           WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND revision_id=$4
             AND status IN ('running','outcome_unknown')`,
          [scope.tenantId, scope.userId, id, sourceRevisionId]
        );
        const eligibility = revisionForkEligibility(source, unresolved.rows);
        if (!eligibility.allowed || parent.active_revision_id === sourceRevisionId)
          fail(
            'SOLUTION_REVISION_FORK_BLOCKED',
            eligibility.reason ?? 'The active release cannot be fixed as a failed candidate.'
          );
        const existing = row(
          await client.query(
            `SELECT id FROM orqaly.solution_revisions
           WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND status IN ('draft','reviewed')`,
            [scope.tenantId, scope.userId, id]
          )
        );
        if (existing)
          fail(
            'SOLUTION_EDITABLE_DRAFT_EXISTS',
            'Finish or reject the existing draft before fixing this candidate.'
          );
        const base = await resolveEffectiveSolution(client, parent);
        if (!base.deployment)
          fail(
            'SOLUTION_NOT_DEPLOYED',
            'The current release must remain deployed while a candidate is fixed.'
          );
        const next = row(
          await client.query(
            `SELECT COALESCE(MAX(version),1)+1 AS version FROM orqaly.solution_revisions
           WHERE tenant_id=$1 AND solution_id=$2`,
            [scope.tenantId, id]
          )
        ).version;
        const newId = randomUUID();
        const rebase = (value) =>
          native(source)
            ? normalizeNativeWorkflow({ workflow: rebaseWorkflowForDraft(value, newId), id: newId })
                .workflow
            : rebaseWorkflowForDraft(value, newId);
        const candidate = native(source)
          ? normalizeNativeBundle({
              workflow: rebase(source.workflow),
              spec: source.spec ?? source.base_spec,
              id: newId,
            })
          : { workflow: rebase(source.workflow), spec: source.spec ?? source.base_spec };
        const workflow = candidate.workflow;
        const value = row(
          await client.query(
            `INSERT INTO orqaly.solution_revisions
           (tenant_id,solution_id,id,owner_user_id,version,base_revision_id,base_version,
            base_workflow,base_spec,workflow,workflow_hash,spec)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
            [
              scope.tenantId,
              id,
              newId,
              scope.userId,
              next,
              parent.active_revision_id,
              base.version ?? 1,
              rebase(base.workflow),
              base.spec,
              workflow,
              canonicalHash(workflow),
              candidate.spec,
            ]
          )
        );
        await client.query(
          `INSERT INTO orqaly.solution_revision_forks
           (tenant_id,solution_id,owner_user_id,idempotency_key,request_hash,source_revision_id,
            source_row_version,source_workflow_hash,target_revision_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            scope.tenantId,
            id,
            scope.userId,
            key,
            requestHash,
            sourceRevisionId,
            source.row_version,
            source.workflow_hash,
            newId,
          ]
        );
        await event(client, scope, value, 'created', {
          baseVersion: base.version ?? 1,
          sourceRevisionId,
          sourceVersion: source.version,
          sourceWorkflowHash: source.workflow_hash,
          sourceRowVersion: source.row_version,
          ...(command.bundleHash ? { sourceBundleHash: command.bundleHash } : {}),
        });
        return newId;
      });
      return readFor(scope, id, revisionId);
    },
    async createDraft(auth, id, body) {
      const { expectedVersion } = z.object({ expectedVersion: versionSchema }).strict().parse(body);
      const scope = await owner(auth);
      const revisionId = await tx(scope, async (client) => {
        const solution = await findSolution(client, scope, id, true);
        const existing = row(
          await client.query(
            `SELECT * FROM orqaly.solution_revisions
           WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND status IN ('draft','reviewed')`,
            [scope.tenantId, scope.userId, id]
          )
        );
        // Retried opening of the editor resumes the same durable draft.
        if (existing) return existing.id;
        checkVersion(solution, expectedVersion);
        const base = await resolveEffectiveSolution(client, solution);
        if (!base.deployment)
          fail('SOLUTION_NOT_DEPLOYED', 'Deploy the first version before creating a revision.');
        const next = row(
          await client.query(
            `SELECT COALESCE(MAX(version),1)+1 AS version FROM orqaly.solution_revisions
           WHERE tenant_id=$1 AND solution_id=$2`,
            [scope.tenantId, id]
          )
        ).version;
        const newId = randomUUID();
        const rebased = rebaseWorkflowForDraft(base.workflow, newId);
        const candidate = native(base)
          ? normalizeNativeBundle({ workflow: rebased, spec: base.spec, id: newId })
          : { workflow: rebased, spec: base.spec };
        const workflow = candidate.workflow;
        const value = row(
          await client.query(
            `INSERT INTO orqaly.solution_revisions
           (tenant_id,solution_id,id,owner_user_id,version,base_revision_id,base_version,
            base_workflow,base_spec,workflow,workflow_hash,spec)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$8,$10,$9) RETURNING *`,
            [
              scope.tenantId,
              id,
              newId,
              scope.userId,
              next,
              solution.active_revision_id,
              base.version ?? 1,
              workflow,
              candidate.spec,
              canonicalHash(workflow),
            ]
          )
        );
        await event(client, scope, value, 'created', { baseVersion: base.version ?? 1 });
        return newId;
      });
      return readFor(scope, id, revisionId);
    },
    async saveDraft(auth, id, revisionId, body) {
      const command = z
        .object({ workflow: workflowSchema, expectedVersion: versionSchema })
        .strict()
        .parse(body);
      const scope = await owner(auth);
      await tx(scope, async (client) => {
        await findSolution(client, scope, id, true);
        const value = await findRevision(client, scope, id, revisionId, true);
        checkVersion(value, command.expectedVersion);
        if (!['draft', 'reviewed'].includes(value.status))
          fail(
            'SOLUTION_REVISION_IMMUTABLE',
            'This revision is frozen. Create a new draft to make changes.'
          );
        let workflow = command.workflow;
        if (native(value)) {
          if (containsSolutionBuildSecret(workflow))
            fail('SOLUTION_SECRET_REJECTED', 'Do not put secrets into a workflow draft.', 400);
          // Revision editing does not create new credential authority. Native
          // connection provisioning is a separate explicit setup operation.
          workflow = structuredClone(workflow);
          for (const node of workflow.nodes ?? []) {
            if (
              node.credentials &&
              canonicalHash(node.credentials) !==
                canonicalHash(
                  value.workflow.nodes.find((prior) => prior.id === node.id)?.credentials ?? {}
                )
            )
              fail(
                'SOLUTION_CREDENTIAL_BINDING_CHANGED',
                'Use the owned connection setup flow to change credential bindings.',
                400
              );
          }
          workflow = normalizeNativeWorkflow({ workflow, id: revisionId }).workflow;
        }
        const saved = row(
          await client.query(
            `UPDATE orqaly.solution_revisions SET workflow=$5,workflow_hash=$6,spec=${native(value) ? '$7' : 'NULL'},
           status='draft',review=NULL,row_version=row_version+1,updated_at=clock_timestamp()
           WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4 RETURNING *`,
            [
              scope.tenantId,
              scope.userId,
              id,
              revisionId,
              workflow,
              canonicalHash(workflow),
              ...(native(value) ? [value.spec ?? value.base_spec] : []),
            ]
          )
        );
        await event(client, scope, saved, 'saved', { workflow });
      });
      return readFor(scope, id, revisionId);
    },
    async review(auth, id, revisionId, body) {
      const { expectedVersion, bundleHash } = z
        .object({ expectedVersion: versionSchema, bundleHash: hashSchema.optional() })
        .strict()
        .parse(body);
      const scope = await owner(auth);
      await tx(scope, async (client) => {
        const solution = await findSolution(client, scope, id, true);
        const value = await findRevision(client, scope, id, revisionId, true);
        checkVersion(value, expectedVersion);
        const nativeConnections = native(value)
          ? await loadRevisionNativeConnections(client, solution, value)
          : [];
        checkBundle(value, bundleHash, { reviewing: true });
        if (!['draft', 'reviewed'].includes(value.status))
          fail('SOLUTION_REVISION_IMMUTABLE', 'Only an editable draft can be reviewed.');
        const report = native(value)
          ? reviewNative(value, scope, solution.environment_id, nativeConnections)
          : reviewWorkflow({
              solutionId: revisionId,
              baseWorkflow: value.base_workflow,
              baseSpec: value.base_spec,
              workflow: value.workflow,
            });
        const workflow = report.valid ? report.workflow : value.workflow;
        const workflowHash = canonicalHash(workflow);
        const review = {
          ...report,
          workflow: undefined,
          workflowHash,
          reviewedAt: new Date().toISOString(),
        };
        const reviewed = row(
          await client.query(
            `UPDATE orqaly.solution_revisions SET workflow=$5,workflow_hash=$6,spec=$7,
           status=$8,review=$9,row_version=row_version+1,updated_at=clock_timestamp()
           WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4 RETURNING *`,
            [
              scope.tenantId,
              scope.userId,
              id,
              revisionId,
              workflow,
              workflowHash,
              report.valid ? report.spec : native(value) ? (value.spec ?? value.base_spec) : null,
              report.valid ? 'reviewed' : 'draft',
              review,
            ]
          )
        );
        await event(client, scope, reviewed, 'reviewed', { review });
      });
      return readFor(scope, id, revisionId);
    },
    async decide(auth, id, revisionId, body) {
      const command = z
        .object({
          action: z.enum(['approve', 'reject', 'deploy', 'activate']),
          workflowHash: hashSchema,
          expectedVersion: versionSchema,
          bundleHash: hashSchema.optional(),
        })
        .strict()
        .parse(body);
      const scope = await owner(auth);
      const claimed = await tx(scope, async (client) => {
        const solution = await findSolution(client, scope, id, true);
        const value = await findRevision(client, scope, id, revisionId, true);
        checkVersion(value, command.expectedVersion, command.workflowHash);
        const nativeConnections = native(value)
          ? await loadRevisionNativeConnections(client, solution, value)
          : [];
        const candidateBundleHash = checkBundle(value, command.bundleHash);
        if (command.action === 'reject') {
          if (!['draft', 'reviewed'].includes(value.status))
            fail('SOLUTION_REVISION_STATE', 'Only a pending candidate can be rejected.');
          await client.query(
            `UPDATE orqaly.solution_revisions SET status='rejected',
            row_version=row_version+1,updated_at=clock_timestamp()
            WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4`,
            [scope.tenantId, scope.userId, id, revisionId]
          );
          await event(client, scope, value, 'rejected');
          return null;
        }
        if (command.action === 'approve') {
          if (
            value.status !== 'reviewed' ||
            value.review?.valid !== true ||
            value.review.workflowHash !== value.workflow_hash ||
            (candidateBundleHash && value.review.bundleHash !== candidateBundleHash) ||
            !value.spec
          )
            fail(
              'SOLUTION_REVIEW_REQUIRED',
              'Resolve the review findings before approving this exact revision.'
            );
          if (value.base_revision_id !== solution.active_revision_id)
            fail(
              'SOLUTION_BASE_CHANGED',
              'The live version changed. Create a draft from the current version.'
            );
          if (!solution.environment_id || !runtime.available(scope))
            fail('SOLUTION_ENVIRONMENT_REQUIRED', 'An isolated environment is required.', 503);
          if (
            native(value) &&
            !reviewNative(value, scope, solution.environment_id, nativeConnections).execution
              ?.allowed
          )
            fail(
              'SOLUTION_CAPABILITY_REQUIRED',
              'Resolve the native workflow runtime and connection prerequisites before approval.'
            );
          await client.query(
            `UPDATE orqaly.solution_revisions SET status='approved',environment_id=$5,
            approved_workflow_hash=workflow_hash,approved_at=clock_timestamp(),
            row_version=row_version+1,updated_at=clock_timestamp()
            WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4`,
            [scope.tenantId, scope.userId, id, revisionId, solution.environment_id]
          );
          await event(client, scope, value, 'approved', { environmentId: solution.environment_id });
          return null;
        }
        if (command.action === 'activate') {
          if (
            value.status !== 'ready' ||
            !value.tested_at ||
            !value.deployment ||
            value.deployment.workflowHash !== value.workflow_hash
          )
            fail(
              'SOLUTION_TEST_REQUIRED',
              'Deploy and pass a real test of this revision before activation.'
            );
          if (value.base_revision_id !== solution.active_revision_id)
            fail(
              'SOLUTION_BASE_CHANGED',
              'The live version changed. Review a new draft based on the current release.'
            );
          if (native(value)) {
            if (
              !(await hasNativeAcceptanceCoverage(client, scope, {
                ...value,
                nativeConnections,
                revision_id: revisionId,
              }))
            )
              fail(
                'SOLUTION_TEST_REQUIRED',
                'Pass every agreed acceptance case for this exact revision before activation.'
              );
            if (
              !reviewNative(value, scope, value.environment_id, nativeConnections).execution
                ?.allowed
            )
              fail(
                'SOLUTION_CAPABILITY_REQUIRED',
                'The exact runtime capability must still be authorized.'
              );
            if (
              solution.last_error?.includes('VERIFICATION') &&
              !(
                solution.last_error?.includes('REVISION_ACTIVATION') &&
                value.last_error?.includes('REVISION_ACTIVATION')
              )
            )
              fail(
                'SOLUTION_LIFECYCLE_BUSY',
                'Reconcile the pending runtime change before activating a revision.'
              );
            if (
              value.last_error === 'REVISION_ACTIVATION_PENDING_VERIFICATION' &&
              Date.now() - new Date(value.updated_at).getTime() <= DEPLOYMENT_STALE_MS
            )
              fail(
                'SOLUTION_LIFECYCLE_BUSY',
                'Revision activation is still awaiting runtime verification.'
              );
            const previous = await resolveEffectiveSolution(client, solution);
            const parent = row(
              await client.query(
                `UPDATE orqaly.customer_solutions SET status='paused',last_error='REVISION_ACTIVATION_PENDING_VERIFICATION',
                row_version=row_version+1,updated_at=clock_timestamp()
                WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3 RETURNING *`,
                [scope.tenantId, scope.userId, id]
              )
            );
            const candidate = row(
              await client.query(
                `UPDATE orqaly.solution_revisions SET last_error='REVISION_ACTIVATION_PENDING_VERIFICATION',
                row_version=row_version+1,updated_at=clock_timestamp()
                WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4 RETURNING *`,
                [scope.tenantId, scope.userId, id, revisionId]
              )
            );
            return {
              ...candidate,
              nativeConnections,
              revision_id: revisionId,
              runtimeAction: 'activate',
              previous,
              parentRowVersion: parent.row_version,
            };
          }
          if (solution.active_revision_id)
            await client.query(
              `UPDATE orqaly.solution_revisions SET status='superseded',row_version=row_version+1,
             updated_at=clock_timestamp() WHERE tenant_id=$1 AND solution_id=$2 AND id=$3`,
              [scope.tenantId, id, solution.active_revision_id]
            );
          await client.query(
            `UPDATE orqaly.solution_revisions SET status='active',row_version=row_version+1,
            updated_at=clock_timestamp() WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4`,
            [scope.tenantId, scope.userId, id, revisionId]
          );
          await client.query(
            `UPDATE orqaly.customer_solutions SET active_revision_id=$4,status='active',
            row_version=row_version+1,updated_at=clock_timestamp()
            WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3`,
            [scope.tenantId, scope.userId, id, revisionId]
          );
          await event(client, scope, value, 'activated', { version: value.version });
          return null;
        }
        const stale =
          value.status === 'deploying' &&
          Date.now() - new Date(value.updated_at).getTime() > DEPLOYMENT_STALE_MS;
        if (!['approved', 'deployment_unknown'].includes(value.status) && !stale)
          fail('SOLUTION_REVISION_STATE', 'Approve this revision before deploying it.');
        if (value.environment_id !== solution.environment_id)
          fail('SOLUTION_ENVIRONMENT_CHANGED', 'The approved environment changed.');
        if (
          value.approved_workflow_hash !== value.workflow_hash ||
          canonicalHash(value.workflow) !== value.workflow_hash ||
          value.review?.valid !== true ||
          (candidateBundleHash && value.review.bundleHash !== candidateBundleHash)
        )
          fail('SOLUTION_APPROVAL_MISMATCH', 'The approved snapshot could not be verified.');
        const known = await client.query(
          `SELECT deployment FROM orqaly.solution_revisions
          WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND deployment IS NOT NULL`,
          [scope.tenantId, scope.userId, id]
        );
        const deploying = row(
          await client.query(
            `UPDATE orqaly.solution_revisions SET status='deploying',
          last_error=NULL,row_version=row_version+1,updated_at=clock_timestamp()
          WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4 RETURNING *`,
            [scope.tenantId, scope.userId, id, revisionId]
          )
        );
        await event(client, scope, deploying, 'deploying');
        return {
          ...deploying,
          nativeConnections,
          revision_id: revisionId,
          known_workflow_ids: [
            solution.deployment?.workflowId,
            ...(solution.deployment?.dependencies ?? []).map((pin) => pin.workflowId),
            ...known.rows.map((item) => item.deployment.workflowId),
            ...known.rows.flatMap((item) =>
              (item.deployment.dependencies ?? []).map((pin) => pin.workflowId)
            ),
          ].filter(Boolean),
        };
      });
      if (claimed) {
        if (claimed.runtimeAction === 'activate') {
          let activation;
          try {
            const paused = await runtime.pause(scope, claimed.previous);
            if (!nativeLifecycleReceiptMatches(paused, claimed.previous, false))
              throw new Error('previous_runtime_pause_not_verified');
            activation = await runtime.activate(scope, claimed);
            if (!nativeLifecycleReceiptMatches(activation, claimed, true))
              throw new Error('candidate_activation_not_verified');
          } catch {
            activation = null;
          }
          await tx(scope, async (client) => {
            const parent = await findSolution(client, scope, id, true);
            const candidate = await findRevision(client, scope, id, revisionId, true);
            if (
              parent.row_version !== claimed.parentRowVersion ||
              candidate.row_version !== claimed.row_version ||
              parent.active_revision_id !== claimed.base_revision_id
            )
              return;
            if (activation && parent.active_revision_id)
              await client.query(
                `UPDATE orqaly.solution_revisions SET status='superseded',row_version=row_version+1,
                updated_at=clock_timestamp() WHERE tenant_id=$1 AND solution_id=$2 AND id=$3`,
                [scope.tenantId, id, parent.active_revision_id]
              );
            await client.query(
              `UPDATE orqaly.solution_revisions SET status=$5,last_error=$6,
                row_version=row_version+1,updated_at=clock_timestamp()
                WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4`,
              [
                scope.tenantId,
                scope.userId,
                id,
                revisionId,
                activation ? 'active' : 'ready',
                activation ? null : 'RUNTIME_REVISION_ACTIVATION_REQUIRES_VERIFICATION',
              ]
            );
            await client.query(
              `UPDATE orqaly.customer_solutions SET active_revision_id=$4,status=$5,last_error=$6,
                row_version=row_version+1,updated_at=clock_timestamp()
                WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3`,
              [
                scope.tenantId,
                scope.userId,
                id,
                activation ? revisionId : parent.active_revision_id,
                activation ? 'active' : 'paused',
                activation ? null : 'RUNTIME_REVISION_ACTIVATION_REQUIRES_VERIFICATION',
              ]
            );
            if (activation)
              await event(client, scope, candidate, 'activated', {
                version: candidate.version,
                runtimeReceipt: activation,
              });
          });
          return readFor(scope, id, revisionId);
        }
        let deployment;
        try {
          deployment = await runtime.deploy(scope, claimed);
          if (
            native(claimed) &&
            (deployment?.workflowHash !== claimed.workflow_hash ||
              deployment.active !== false ||
              (claimed.spec.ownedDependencies?.length &&
                deployment.bundleHash !== nativeBundleHash(claimed)))
          )
            throw new Error('native_revision_stage_unverified');
        } catch {
          deployment = null;
          /* uncertain provider writes require reconciliation */
        }
        await tx(scope, async (client) => {
          const saved = row(
            await client.query(
              `UPDATE orqaly.solution_revisions SET status=$5,deployment=$6,
            last_error=$7,row_version=row_version+1,updated_at=clock_timestamp()
            WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4
              AND row_version=$8 AND workflow_hash=$9 RETURNING *`,
              [
                scope.tenantId,
                scope.userId,
                id,
                revisionId,
                deployment ? 'ready' : 'deployment_unknown',
                deployment ?? null,
                deployment ? null : 'DEPLOYMENT_REQUIRES_VERIFICATION',
                claimed.row_version,
                claimed.workflow_hash,
              ]
            )
          );
          if (saved)
            await event(
              client,
              scope,
              saved,
              deployment ? 'deployed' : 'deployment_unknown',
              deployment ? { deployment } : {}
            );
        });
      }
      return readFor(scope, id, revisionId);
    },
    async invoke(auth, id, revisionId, body, key) {
      const command = SolutionRevisionInvocationSchema.parse(body);
      const { input } = command;
      keySchema.parse(key);
      const scope = await owner(auth);
      const claimed = await tx(scope, async (client) => {
        const parent = await findSolution(client, scope, id, true);
        const value = await findRevision(client, scope, id, revisionId, true);
        checkBundle(value, command.bundleHash);
        const selected = {
          ...value,
          nativeConnections: native(value)
            ? await loadRevisionNativeConnections(client, parent, value)
            : [],
          revision_id: revisionId,
        };
        if (command.workflowHash && command.workflowHash !== value.workflow_hash)
          fail(
            'SOLUTION_REVISION_CHANGED',
            'The revision changed. Review it before sending this service test.'
          );
        if (
          command.allowExternalEffects &&
          (!native(value) || !nativeBundleConnectionRequirements(value).length)
        )
          fail(
            'SOLUTION_EFFECT_APPROVAL_INVALID',
            'Effect approval is only valid for a connected native test.',
            400
          );
        if (
          native(value) &&
          (value.last_error?.includes('VERIFICATION') ||
            parent.last_error?.includes('VERIFICATION'))
        )
          fail(
            'SOLUTION_LIFECYCLE_UNVERIFIED',
            'Reconcile the pending runtime change before starting a test.'
          );
        const requestHash = canonicalHash({
          mode: 'test',
          ...command,
          workflowHash: value.workflow_hash,
          revisionId,
        });
        const existing = row(
          await client.query(
            `SELECT * FROM orqaly.solution_invocations
          WHERE tenant_id=$1 AND solution_id=$2 AND idempotency_key=$3`,
            [scope.tenantId, id, key]
          )
        );
        if (existing) {
          if (existing.request_hash !== requestHash)
            fail('IDEMPOTENCY_CONFLICT', 'This key was used for a different invocation.');
          return { existing };
        }
        if (!['ready', 'active', 'superseded'].includes(value.status) || !value.deployment)
          fail('SOLUTION_NOT_DEPLOYED', 'Deploy the approved revision before testing it.');
        try {
          validateSolutionInvocationInput(selected, input, 'test', command);
        } catch (error) {
          if (error instanceof SolutionError) throw error;
          fail('SOLUTION_INPUT_INVALID', error.message, 400);
        }
        await assertNoUnresolvedNativeEffect(client, scope, selected);
        const evidence = native(value) ? nativeSolutionTestPlan(selected, command) : null;
        const invocation = row(
          await client.query(
            `INSERT INTO orqaly.solution_invocations
          (tenant_id,solution_id,id,owner_user_id,mode,idempotency_key,request_hash,workflow_hash,input,status,revision_id${evidence ? ',evidence' : ''})
          VALUES ($1,$2,$3,$4,'test',$5,$6,$7,$8,'running',$9${evidence ? ',$10' : ''}) RETURNING *`,
            [
              scope.tenantId,
              id,
              randomUUID(),
              scope.userId,
              key,
              requestHash,
              value.workflow_hash,
              input,
              revisionId,
              ...(evidence ? [evidence] : []),
            ]
          )
        );
        return { solution: selected, invocation };
      });
      if (claimed.existing)
        return { invocation: publicInvocation(claimed.existing), replayed: true };
      const result = await executeSolutionInvocation(
        runtime,
        scope,
        claimed.solution,
        claimed.invocation
      );
      const errorCode = result.errorCode;
      const saved = await tx(scope, async (client) => {
        const invocation = row(
          await client.query(
            `UPDATE orqaly.solution_invocations SET status=$4,
          output=$5,execution_id=$6,error_code=$7,completed_at=clock_timestamp()${native(claimed.solution) ? ',evidence=$8' : ''}
          WHERE tenant_id=$1 AND solution_id=$2 AND id=$3 RETURNING *`,
            [
              scope.tenantId,
              id,
              claimed.invocation.id,
              result.status,
              result.output,
              result.executionId,
              errorCode,
              ...(native(claimed.solution) ? [result.evidence] : []),
            ]
          )
        );
        if (!errorCode && (await hasNativeAcceptanceCoverage(client, scope, claimed.solution))) {
          const tested = row(
            await client.query(
              `UPDATE orqaly.solution_revisions SET tested_at=clock_timestamp(),
            row_version=row_version+1,updated_at=clock_timestamp()
            WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4
              AND workflow_hash=$5 AND deployment=$6 AND status IN ('ready','active','superseded') RETURNING *`,
              [
                scope.tenantId,
                scope.userId,
                id,
                revisionId,
                claimed.solution.workflow_hash,
                claimed.solution.deployment,
              ]
            )
          );
          if (tested)
            await event(client, scope, tested, 'tested', {
              invocationId: invocation.id,
              executionId: result.executionId,
            });
        }
        return invocation;
      });
      return { invocation: publicInvocation(saved), replayed: false };
    },
  };
}
