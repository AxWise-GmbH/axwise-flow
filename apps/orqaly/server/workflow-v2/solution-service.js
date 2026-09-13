import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { canonicalJsonSha256 as canonicalHash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import {
  CreateSolutionSchema,
  SolutionDecisionSchema,
  SolutionInvocationSchema,
} from '../../shared/workflow-v2/solution-contracts.js';
import { compileSolutionWorkflow, expectedSolutionOutput } from './solution-compiler.js';
import {
  validateNativeWorkflowData,
  checkNativeWorkflowAcceptance,
} from './native-workflow-review.js';
import { normalizeNativeWorkflow } from './native-workflow-runtime-contract.js';
import {
  nativeBundleHash,
  nativeBundleMembers,
  nativeBundleConnectionRequirements,
  normalizeNativeBundle,
  materializeNativeBundle,
} from './native-workflow-bundle.js';
import { containsSolutionBuildSecret } from '../../shared/workflow-v2/solution-build-secrets.js';
import { loadRevisionNativeConnections } from './solution-revision-connection-store.js';

export class SolutionError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
const keySchema = z
  .string()
  .min(8)
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/);
const fail = (code, message, status) => {
  throw new SolutionError(code, message, status);
};
const row = (result) => result.rows[0];
// A cold runtime read can take 60s. Deployment may read inventory, an existing
// candidate and the published version; invocation adds a 45s webhook request.
// Do not offer reconciliation or label still-bounded work unknown prematurely.
export const DEPLOYMENT_STALE_MS = 240_000;
const INVOCATION_STALE_MS = 150_000;
const isNative = (value) => value.spec?.kind === 'n8n_workflow_v2';
const bundleHashFor = (value) => (isNative(value) ? nativeBundleHash(value) : null);
const connectionCount = (value) =>
  value.spec?.ownedDependencies?.length
    ? nativeBundleConnectionRequirements(value).length
    : value.spec?.connections?.length || 0;
const pinFields = (value) => ({
  dependencyId: value.dependencyId,
  workflowId: value.workflowId,
  versionId: value.versionId,
  workflowHash: value.workflowHash,
  specHash: value.specHash,
});
const pinIdentity = (values) =>
  canonicalHash(values.map(pinFields).sort((a, b) => a.dependencyId.localeCompare(b.dependencyId)));
function requireBundleApproval(value, authorization = {}) {
  const expected = bundleHashFor(value);
  if ((authorization.bundleHash || null) !== expected)
    fail(
      'SOLUTION_BUNDLE_CHANGED',
      'Review and approve this exact main and linked workflow bundle before continuing.'
    );
  return expected;
}
function testArtifactFor(solution, testId) {
  return solution.spec.ownedDependencies?.length
    ? normalizeNativeBundle({
        workflow: solution.workflow,
        spec: solution.spec,
        id: testId,
        controlledTest: true,
      })
    : {
        ...normalizeNativeWorkflow({
          workflow: solution.workflow,
          id: testId,
          controlledTest: true,
        }),
        spec: solution.spec,
      };
}
function deploymentBundleMatches(receipt, solution, pins = receipt?.dependencies) {
  const expected = bundleHashFor(solution);
  if (!expected) return !receipt?.bundleHash && !pins?.length;
  try {
    return (
      receipt?.bundleHash === expected &&
      materializeNativeBundle(solution, pins).workflowHash === receipt.materializedWorkflowHash
    );
  } catch {
    return false;
  }
}
export function nativeLifecycleReceiptMatches(receipt, solution, active) {
  if (
    !(
      receipt?.workflowHash === solution.workflow_hash &&
      receipt.active === active &&
      receipt.workflowId === solution.deployment?.workflowId &&
      receipt.versionId === solution.deployment?.versionId &&
      deploymentBundleMatches(receipt, solution)
    )
  )
    return false;
  if (!bundleHashFor(solution)) return true;
  return (
    deploymentBundleMatches(solution.deployment, solution) &&
    pinIdentity(receipt.dependencies) === pinIdentity(solution.deployment.dependencies) &&
    receipt.materializedWorkflowHash === solution.deployment.materializedWorkflowHash
  );
}

// Provider IDs and versions must resolve to the exact reviewed (or disposable
// normalized test) child. Only fixed metadata is persisted, never runData.
function ownedExecutionReceipts(result, artifact, mainExecutionId) {
  const expected = nativeBundleHash(artifact);
  if (!expected) return null;
  if (
    materializeNativeBundle(artifact, result.ownedDependencies).workflowHash !==
    result.materializedWorkflowHash
  )
    throw new Error('native_bundle_materialized_receipt_mismatch');
  const executionId = z.string().regex(/^[1-9][0-9]{0,30}$/);
  return result.ownedDependencies.map((entry) => {
    const status = z
      .enum(['succeeded', 'failed', 'outcome_unknown', 'not_triggered'])
      .parse(entry.status);
    if (status === 'not_triggered') {
      if (
        entry.executionId != null ||
        (entry.parentExecutionId != null && entry.parentExecutionId !== mainExecutionId)
      )
        throw new Error('native_error_handler_receipt_contradiction');
    } else {
      if (entry.executionId != null) executionId.parse(entry.executionId);
      if (['succeeded', 'failed'].includes(status)) {
        executionId.parse(entry.executionId);
        executionId.parse(mainExecutionId);
        if (entry.parentExecutionId !== mainExecutionId || entry.executionId === mainExecutionId)
          throw new Error('native_error_handler_parent_mismatch');
      } else if (entry.parentExecutionId != null && entry.parentExecutionId !== mainExecutionId)
        throw new Error('native_error_handler_parent_mismatch');
    }
    const delivery = entry.outboundDelivery;
    return {
      ...pinFields(entry),
      status,
      executionId: entry.executionId ?? null,
      parentExecutionId: entry.parentExecutionId ?? null,
      ...(delivery &&
      ['accepted', 'rejected'].includes(delivery.delivery) &&
      z.uuid().safeParse(delivery.connectionId).success &&
      typeof delivery.nodeId === 'string' &&
      /^[A-Za-z0-9_-]{1,120}$/.test(delivery.nodeId)
        ? {
            outboundDelivery: {
              delivery: delivery.delivery,
              connectionId: delivery.connectionId,
              nodeId: delivery.nodeId,
            },
          }
        : {}),
    };
  });
}

// All Solution and Build reservation writers use this same owner-scoped lock.
// It protects the cross-table invariant which separate UNIQUE indexes cannot.
export async function lockSolutionEnvironmentReservations(client, scope) {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtextextended('orqaly.solution-environment:' || $1 || ':' || $2,0))`,
    [scope.tenantId, scope.userId]
  );
}

export function validateSolutionInvocationInput(
  solution,
  input,
  mode = 'production',
  authorization = {}
) {
  if (!isNative(solution)) return expectedSolutionOutput(solution.spec, input);
  requireBundleApproval(solution, authorization);
  const checked = validateNativeWorkflowData({ schema: solution.spec.inputSchema, value: input });
  if (!checked.valid || containsSolutionBuildSecret(input))
    fail(
      'SOLUTION_INPUT_INVALID',
      'Input does not match this Solution’s non-secret JSON contract.',
      400
    );
  if (
    mode === 'test' &&
    !solution.spec.acceptanceCases.some(
      (test) => canonicalHash(test.input) === canonicalHash(input)
    )
  )
    fail(
      'SOLUTION_TEST_CASE_REQUIRED',
      'Choose an agreed acceptance-case input before running a test.',
      400
    );
  if (
    mode === 'test' &&
    connectionCount(solution) &&
    (authorization.allowExternalEffects !== true ||
      authorization.workflowHash !== solution.workflow_hash)
  )
    fail(
      'SOLUTION_EFFECT_APPROVAL_REQUIRED',
      'Approve this exact workflow version before sending a real service test.',
      409
    );
  return null;
}

export function nativeEffectScopeHash(solution) {
  return canonicalHash({
    environmentId: solution.environment_id,
    ...(bundleHashFor(solution) ? { bundleHash: bundleHashFor(solution) } : {}),
    connections: (solution.nativeConnections ?? [])
      .map((connection) => ({
        id: connection.id,
        environmentId: connection.environment_id,
        type: connection.credential_type,
        providerId: connection.provider_credential_id,
        scope: connection.scope,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  });
}

export function nativeSolutionTestPlan(solution, authorization = {}) {
  const testId = randomUUID();
  const bundleHash = requireBundleApproval(solution, authorization);
  const artifact = testArtifactFor(solution, testId);
  return {
    testId,
    testArtifactHash: artifact.workflowHash,
    ...(bundleHash
      ? {
          bundleHash,
          testBundleHash: artifact.bundleHash,
          ...(solution.deployment?.dependencies
            ? { sourceOwnedDependencies: solution.deployment.dependencies.map(pinFields) }
            : {}),
        }
      : {}),
    ...(connectionCount(solution)
      ? {
          effectAuthorization: {
            allowExternalEffects: authorization.allowExternalEffects === true,
            workflowHash: authorization.workflowHash,
            ...(bundleHash ? { bundleHash } : {}),
            connectionScopeHash: nativeEffectScopeHash(solution),
          },
        }
      : {}),
  };
}

export async function assertNoUnresolvedNativeEffect(client, scope, solution) {
  if (!isNative(solution) || !connectionCount(solution)) return;
  const existing = row(
    await client.query(
      "SELECT id FROM orqaly.solution_invocations WHERE tenant_id=$1 AND solution_id=$2 AND status IN ('running','outcome_unknown') LIMIT 1",
      [scope.tenantId, solution.solution_id ?? solution.id]
    )
  );
  if (existing)
    fail(
      'SOLUTION_EFFECT_UNRESOLVED',
      'A previous service request is running or has an unknown result. Reconcile it before sending another request.'
    );
}

export async function hasNativeAcceptanceCoverage(client, scope, solution) {
  if (!isNative(solution)) return true;
  const results = await client.query(
    `SELECT input,output,evidence FROM orqaly.solution_invocations
      WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND workflow_hash=$4
        AND revision_id IS NOT DISTINCT FROM $5::uuid AND mode='test' AND status='succeeded'`,
    [
      scope.tenantId,
      scope.userId,
      solution.solution_id ?? solution.id,
      solution.workflow_hash,
      solution.revision_id ?? null,
    ]
  );
  const bundleHash = bundleHashFor(solution);
  const bundlePlanMatches = (evidence) => {
    if (!bundleHash) return !evidence?.bundleHash;
    try {
      const artifact = testArtifactFor(solution, evidence.testId);
      return (
        evidence.bundleHash === bundleHash &&
        evidence.testBundleHash === artifact.bundleHash &&
        evidence.testArtifactHash === artifact.workflowHash &&
        (!solution.deployment?.dependencies ||
          pinIdentity(evidence.sourceOwnedDependencies) ===
            pinIdentity(solution.deployment.dependencies)) &&
        materializeNativeBundle(artifact, evidence.ownedDependencies).workflowHash ===
          evidence.materializedWorkflowHash
      );
    } catch {
      return false;
    }
  };
  const consentMatches = (evidence) =>
    !connectionCount(solution) ||
    (evidence.effectAuthorization?.allowExternalEffects === true &&
      evidence.effectAuthorization.workflowHash === solution.workflow_hash &&
      (!bundleHash || evidence.effectAuthorization.bundleHash === bundleHash) &&
      evidence.effectAuthorization.connectionScopeHash === nativeEffectScopeHash(solution));
  const mainCoverage = solution.spec.acceptanceCases.every((test) =>
    results.rows.some(
      (receipt) =>
        receipt.evidence?.testArtifactHash &&
        bundlePlanMatches(receipt.evidence) &&
        consentMatches(receipt.evidence) &&
        (!solution.spec.connections.length ||
          receipt.evidence.outboundDelivery?.delivery === 'accepted') &&
        receipt.evidence?.cleanup?.status === 'removed' &&
        checkNativeWorkflowAcceptance({
          spec: solution.spec,
          input: receipt.input,
          output: receipt.output,
          caseId: test.id,
          responseStatus: receipt.evidence.responseStatus ?? 200,
        }).passed
    )
  );
  if (!mainCoverage || !bundleHash) return mainCoverage;
  // Normal main success does not trigger Error Trigger. Keep its assertion
  // coverage separate from a genuine failed-main -> child execution receipt.
  const handlers = await client.query(
    `SELECT input,output,evidence,execution_id,status FROM orqaly.solution_invocations
      WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND workflow_hash=$4
        AND revision_id IS NOT DISTINCT FROM $5::uuid AND mode='test' AND status='failed'`,
    [
      scope.tenantId,
      scope.userId,
      solution.solution_id ?? solution.id,
      solution.workflow_hash,
      solution.revision_id ?? null,
    ]
  );
  return nativeBundleMembers(solution)
    .filter((member) => member.dependencyId !== null)
    .every((member) =>
      handlers.rows.some((receipt) => {
        if (
          !bundlePlanMatches(receipt.evidence) ||
          !consentMatches(receipt.evidence) ||
          receipt.evidence?.cleanup?.status !== 'removed'
        )
          return false;
        try {
          const evidence = ownedExecutionReceipts(
            { ...receipt.evidence },
            testArtifactFor(solution, receipt.evidence.testId),
            receipt.execution_id
          );
          const child = evidence.find((entry) => entry.dependencyId === member.dependencyId);
          if (child?.status !== 'succeeded' || child.parentExecutionId !== receipt.execution_id)
            return false;
          if (!member.spec.connections.length) return true;
          return (
            child.outboundDelivery?.delivery === 'accepted' &&
            member.spec.connections.some(
              (requirement) =>
                requirement.nodeIds.includes(child.outboundDelivery.nodeId) &&
                (solution.nativeConnections ?? []).some(
                  (connection) =>
                    connection.id === child.outboundDelivery.connectionId &&
                    connection.requirement_id === `owned:${member.dependencyId}:${requirement.id}`
                )
            )
          );
        } catch {
          return false;
        }
      })
    );
}

export async function executeSolutionInvocation(runtime, scope, solution, invocation) {
  const native = isNative(solution);
  let result;
  try {
    const sourceBundleHash = bundleHashFor(solution);
    let artifact = null;
    let ownedDependencies = null;
    if (sourceBundleHash && invocation.evidence?.bundleHash !== sourceBundleHash)
      throw new Error('native_source_bundle_changed');
    if (native && invocation.mode === 'test') {
      const testId = invocation.evidence?.testId;
      if (!testId) throw new Error('native_test_plan_missing');
      artifact = testArtifactFor(solution, testId);
      if (artifact.workflowHash !== invocation.evidence.testArtifactHash)
        throw new Error('native_test_artifact_changed');
      if (
        sourceBundleHash &&
        (artifact.bundleHash !== invocation.evidence.testBundleHash ||
          (solution.deployment?.dependencies &&
            pinIdentity(invocation.evidence.sourceOwnedDependencies) !==
              pinIdentity(solution.deployment.dependencies)))
      )
        throw new Error('native_test_bundle_changed');
      if (
        connectionCount(solution) &&
        (invocation.evidence.effectAuthorization?.allowExternalEffects !== true ||
          invocation.evidence.effectAuthorization.workflowHash !== solution.workflow_hash ||
          (sourceBundleHash &&
            invocation.evidence.effectAuthorization.bundleHash !== sourceBundleHash) ||
          invocation.evidence.effectAuthorization.connectionScopeHash !==
            nativeEffectScopeHash(solution))
      )
        throw new Error('native_test_effect_authorization_changed');
      result = await runtime.testNative(scope, {
        environmentId: solution.environment_id,
        nativeConnections: solution.nativeConnections ?? [],
        workflow: artifact.workflow,
        spec: artifact.spec,
        ...(sourceBundleHash ? { bundleHash: artifact.bundleHash } : {}),
        testId,
        invocationId: invocation.id,
        input: invocation.input,
        allowExternalEffects:
          invocation.evidence.effectAuthorization?.allowExternalEffects === true,
      });
      if (result.testArtifactHash !== artifact.workflowHash)
        throw new Error('native_test_receipt_artifact_mismatch');
      if (sourceBundleHash && result.testBundleHash !== artifact.bundleHash)
        throw new Error('native_test_receipt_bundle_mismatch');
    } else result = await runtime.invoke(scope, solution, invocation);
    if (!native) {
      if (
        canonicalHash(result.output) !==
        canonicalHash(expectedSolutionOutput(solution.spec, invocation.input))
      )
        throw new Error('unexpected_transform_output');
      return {
        status: 'succeeded',
        output: result.output,
        executionId: result.executionId,
        errorCode: null,
        evidence: null,
      };
    }
    if (sourceBundleHash) {
      if (
        invocation.mode !== 'test' &&
        (!deploymentBundleMatches(result, solution, result.ownedDependencies) ||
          pinIdentity(result.ownedDependencies) !== pinIdentity(solution.deployment?.dependencies))
      )
        throw new Error('native_production_bundle_receipt_mismatch');
      ownedDependencies = ownedExecutionReceipts(result, artifact || solution, result.executionId);
      if (
        result.status === 'succeeded' &&
        ownedDependencies.some((child) => ['succeeded', 'failed'].includes(child.status))
      )
        throw new Error('native_error_handler_main_receipt_contradiction');
    }
    const safeOutput =
      result.output !== undefined &&
      !containsSolutionBuildSecret(result.output) &&
      Buffer.byteLength(JSON.stringify(result.output)) <= 64000;
    const evidence = {
      ...invocation.evidence,
      responseStatus: result.responseStatus ?? null,
      ...(sourceBundleHash
        ? {
            bundleHash: sourceBundleHash,
            ...(artifact ? { testBundleHash: artifact.bundleHash } : {}),
            materializedWorkflowHash: result.materializedWorkflowHash,
            ownedDependencies,
          }
        : {}),
      ...(result.outboundDelivery ? { outboundDelivery: result.outboundDelivery } : {}),
      ...(invocation.mode === 'test'
        ? {
            cleanup: { status: result.cleanup?.status === 'removed' ? 'removed' : 'pending' },
            testConfiguration: {
              controlledTest: true,
              saveDataErrorExecution: artifact.workflow.settings.saveDataErrorExecution,
              saveDataSuccessExecution: artifact.workflow.settings.saveDataSuccessExecution,
              ...(sourceBundleHash
                ? {
                    ownedDependencies: artifact.spec.ownedDependencies.map((dependency) => ({
                      dependencyId: dependency.id,
                      saveDataErrorExecution: dependency.workflow.settings.saveDataErrorExecution,
                      saveDataSuccessExecution:
                        dependency.workflow.settings.saveDataSuccessExecution,
                    })),
                  }
                : {}),
            },
          }
        : {}),
      diagnostics: (result.diagnostics ?? []).slice(0, 30).map((issue) => ({
        code: String(
          containsSolutionBuildSecret(issue.code ?? '')
            ? 'NATIVE_EXECUTION_CHECK'
            : (issue.code ?? 'NATIVE_EXECUTION_CHECK')
        )
          .replace(/[^A-Za-z0-9_.:-]/g, '_')
          .slice(0, 120),
        message: 'The native execution did not satisfy its verified completion contract.',
      })),
    };
    if (ownedDependencies?.some((child) => child.status === 'outcome_unknown'))
      return {
        status: 'outcome_unknown',
        output: null,
        executionId: result.executionId ?? null,
        errorCode: 'NATIVE_ERROR_HANDLER_UNCONFIRMED',
        evidence,
      };
    if (invocation.mode === 'test' && evidence.cleanup.status !== 'removed')
      return {
        status: result.status === 'outcome_unknown' ? 'outcome_unknown' : 'failed',
        output: safeOutput ? result.output : null,
        executionId: result.executionId ?? null,
        errorCode: 'NATIVE_TEST_CLEANUP_PENDING',
        evidence,
      };
    if (result.status === 'failed')
      return {
        status: 'failed',
        output: safeOutput ? result.output : null,
        executionId: result.executionId ?? null,
        errorCode: 'NATIVE_EXECUTION_FAILED',
        evidence,
      };
    if (result.status !== 'succeeded' || !result.executionId)
      return {
        status: 'outcome_unknown',
        output: null,
        executionId: null,
        errorCode: 'EXECUTION_OUTCOME_UNKNOWN',
        evidence,
      };
    const checked = safeOutput
      ? invocation.mode === 'test'
        ? checkNativeWorkflowAcceptance({
            spec: solution.spec,
            input: invocation.input,
            output: result.output,
            responseStatus: result.responseStatus ?? 200,
          })
        : validateNativeWorkflowData({ schema: solution.spec.outputSchema, value: result.output })
      : null;
    const passed = invocation.mode === 'test' ? checked?.passed === true : checked?.valid === true;
    return {
      status: passed ? 'succeeded' : 'failed',
      output: safeOutput ? result.output : null,
      executionId: result.executionId,
      errorCode: passed ? null : 'NATIVE_ACCEPTANCE_FAILED',
      evidence: { ...evidence, acceptance: checked },
    };
  } catch {
    return {
      status: 'outcome_unknown',
      output: null,
      executionId: null,
      errorCode: 'EXECUTION_OUTCOME_UNKNOWN',
      evidence: native ? (invocation.evidence ?? null) : null,
    };
  }
}

function publicSolution(value, runtime, suggestedEnvironmentId) {
  const environmentId = value.environment_id ?? suggestedEnvironmentId;
  return {
    id: value.id,
    agentId: value.agent_id,
    name: value.name,
    purpose: value.purpose,
    spec: value.spec,
    agent: value.agent_snapshot,
    workflow: value.workflow,
    workflowHash: value.workflow_hash,
    ...(bundleHashFor(value) ? { bundleHash: bundleHashFor(value) } : {}),
    version: value.version ?? 1,
    revisionId: value.revision_id ?? null,
    buildRequestId: value.build_request_id ?? null,
    rowVersion: value.row_version,
    status:
      value.status === 'deploying' &&
      Date.now() - new Date(value.updated_at).getTime() > DEPLOYMENT_STALE_MS
        ? 'deployment_unknown'
        : value.status,
    environment: environmentId ? runtime.describe(environmentId) : null,
    deployment: value.deployment,
    ...(isNative(value) ? { runtimeActive: value.status === 'active' && !value.last_error } : {}),
    approvedAt: value.approved_at,
    testedAt: value.tested_at,
    lastError: value.last_error,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    creationMethod: value.revision_id
      ? 'native_n8n_reviewed_revision'
      : value.build_request_id
        ? 'axwise_designed_native_reviewed'
        : 'validated_capability_compiler',
  };
}
export function publicInvocation(value) {
  return {
    id: value.id,
    mode: value.mode,
    input: value.input,
    output: value.output,
    status:
      value.status === 'running' &&
      Date.now() - new Date(value.created_at).getTime() > INVOCATION_STALE_MS
        ? 'outcome_unknown'
        : value.status,
    executionId: value.execution_id,
    actor: value.application_key_id
      ? {
          kind: 'application_key',
          id: value.application_key_id,
          label: value.application_key_label,
        }
      : z.uuid().safeParse(value.evidence?.scheduleId).success
        ? { kind: 'schedule', id: value.evidence.scheduleId, label: 'Scheduled run' }
        : { kind: 'user' },
    errorCode: value.error_code,
    ...(value.evidence
      ? { evidence: value.evidence, responseStatus: value.evidence.responseStatus ?? null }
      : {}),
    workflowHash: value.workflow_hash,
    revisionId: value.revision_id ?? null,
    createdAt: value.created_at,
    completedAt: value.completed_at,
  };
}

// Always resolve a release under the same tenant transaction as its parent.
// The original v1 bytes stay on customer_solutions and are never overwritten.
export async function resolveEffectiveSolution(client, value) {
  if (value.build_request_id && value.spec?.kind === 'n8n_workflow_v2') {
    value = {
      ...value,
      nativeConnections: (
        await client.query(
          "SELECT * FROM orqaly.solution_connections WHERE tenant_id=$1 AND owner_user_id=$2 AND build_request_id=$3 AND status IN ('saved','verified') ORDER BY id",
          [value.tenant_id, value.owner_user_id, value.build_request_id]
        )
      ).rows,
    };
  }
  if (!value.active_revision_id) return value;
  const revision = row(
    await client.query(
      `SELECT * FROM orqaly.solution_revisions
     WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4`,
      [value.tenant_id, value.owner_user_id, value.id, value.active_revision_id]
    )
  );
  if (!revision || revision.status !== 'active' || !revision.deployment)
    fail('SOLUTION_RELEASE_UNAVAILABLE', 'The active release could not be verified', 503);
  return {
    ...value,
    workflow: revision.workflow,
    workflow_hash: revision.workflow_hash,
    spec: revision.spec,
    deployment: revision.deployment,
    tested_at: revision.tested_at,
    approved_at: revision.approved_at,
    revision_id: revision.id,
    version: revision.version,
    nativeConnections:
      revision.spec?.kind === 'n8n_workflow_v2'
        ? await loadRevisionNativeConnections(client, value, revision)
        : [],
  };
}

export function createSolutionService({ repository, agentService, runtime }) {
  async function owner(auth) {
    if (!auth?.userId) fail('UNAUTHENTICATED', 'Sign in required', 401);
    const tenantId = await repository.resolveTenant({ userId: auth.userId });
    return { tenantId, userId: auth.userId };
  }
  const tx = (scope, fn) =>
    repository.solutionBuildTransaction
      ? repository.solutionBuildTransaction(scope, fn)
      : repository.solutionTransaction(scope.tenantId, fn);
  async function availableEnvironment(client, scope) {
    // A frontend asset source and a deployment slot are separate authorities.
    // Existing assignments remain immutable and cannot be offered to a new Solution.
    const candidates = runtime.environmentIds?.(scope);
    if (!candidates) return runtime.select(scope);
    if (!candidates.length) return null;
    const assigned = await client.query(
      `SELECT environment_id FROM orqaly.customer_solutions
       WHERE tenant_id=$1 AND owner_user_id=$2 AND environment_id=ANY($3::text[])
       UNION SELECT environment_id FROM orqaly.solution_build_requests
       WHERE tenant_id=$1 AND owner_user_id=$2 AND environment_id=ANY($3::text[])`,
      [scope.tenantId, scope.userId, candidates]
    );
    const occupied = new Set(assigned.rows.map((value) => value.environment_id));
    return candidates.find((id) => !occupied.has(id)) ?? null;
  }
  async function find(client, scope, id, lock = false) {
    const found = row(
      await client.query(
        `SELECT * FROM orqaly.customer_solutions
      WHERE tenant_id = $1 AND owner_user_id = $2 AND id = $3 ${lock ? 'FOR UPDATE' : ''}`,
        [scope.tenantId, scope.userId, z.uuid().parse(id)]
      )
    );
    if (!found) fail('SOLUTION_NOT_FOUND', 'Solution not found', 404);
    return resolveEffectiveSolution(client, found);
  }
  async function readFor(scope, id) {
    return tx(scope, async (client) => {
      const solution = await find(client, scope, id);
      const history = await client.query(
        `SELECT * FROM orqaly.solution_invocations
        WHERE tenant_id = $1 AND owner_user_id = $2 AND solution_id = $3
        ORDER BY created_at DESC, id DESC LIMIT 30`,
        [scope.tenantId, scope.userId, id]
      );
      return {
        solution: publicSolution(
          solution,
          runtime,
          solution.environment_id ?? (await availableEnvironment(client, scope))
        ),
        invocations: history.rows.map(publicInvocation),
      };
    });
  }
  const service = {
    async authoringEnvironment(auth) {
      const scope = await owner(auth);
      // Owner-scoped private frontend assets only. This does not reserve or
      // grant access to any upstream workflow, credential, or execution API.
      const id = runtime.select(scope);
      return id ? runtime.describe(id) : null;
    },
    async list(auth, agentId) {
      const scope = await owner(auth);
      if (agentId !== undefined) z.uuid().parse(agentId);
      const solutions = await tx(scope, async (client) => {
        const result = await client.query(
          `SELECT * FROM orqaly.customer_solutions
        WHERE tenant_id = $1 AND owner_user_id = $2 AND ($3::uuid IS NULL OR agent_id = $3)
        ORDER BY created_at DESC, id DESC LIMIT 50`,
          [scope.tenantId, scope.userId, agentId ?? null]
        );
        return Promise.all(
          result.rows.map(async (value) =>
            publicSolution(
              await resolveEffectiveSolution(client, value),
              runtime,
              value.environment_id ?? (await availableEnvironment(client, scope))
            )
          )
        );
      });
      return {
        solutions,
        environmentAvailable: runtime.available(scope),
        supportedKinds: ['webhook_transform_v1', 'n8n_workflow_v2'],
      };
    },
    async read(auth, id) {
      return readFor(await owner(auth), id);
    },
    async create(auth, body, key) {
      const command = CreateSolutionSchema.parse(body);
      keySchema.parse(key);
      const scope = await owner(auth);
      if (!agentService) fail('AGENTS_UNAVAILABLE', 'Agent service is not configured', 503);
      const response = await agentService.read(auth, command.agentId);
      const agent = response.body?.agent;
      if (!agent) fail('SOLUTION_AGENT_NOT_FOUND', 'Select an Agent in your workspace', 404);
      if (!['active', 'draft', 'proposed'].includes(agent.status ?? agent.state)) {
        fail('SOLUTION_AGENT_UNAVAILABLE', 'This Agent cannot accept new work');
      }
      const profile = agent.currentProfile ?? agent.profile ?? {};
      const snapshot = {
        id: command.agentId,
        name:
          profile.profile?.displayName ??
          profile.name ??
          agent.display_name ??
          agent.name ??
          'Agent',
        profileVersion: profile.versionNumber ?? profile.version ?? agent.profileVersion ?? 1,
      };
      const id = randomUUID();
      const { workflow, workflowHash } = compileSolutionWorkflow({ id, spec: command.spec });
      const created = await tx(scope, async (client) => {
        const result = await client.query(
          `INSERT INTO orqaly.customer_solutions
          (tenant_id,id,owner_user_id,agent_id,name,purpose,spec,agent_snapshot,workflow,workflow_hash,create_key,create_hash)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          ON CONFLICT (tenant_id,owner_user_id,create_key) DO NOTHING RETURNING *`,
          [
            scope.tenantId,
            id,
            scope.userId,
            command.agentId,
            command.name,
            command.purpose,
            command.spec,
            snapshot,
            workflow,
            workflowHash,
            key,
            canonicalHash(command),
          ]
        );
        const value =
          row(result) ??
          row(
            await client.query(
              `SELECT * FROM orqaly.customer_solutions
          WHERE tenant_id=$1 AND owner_user_id=$2 AND create_key=$3`,
              [scope.tenantId, scope.userId, key]
            )
          );
        if (value.create_hash !== canonicalHash(command))
          fail('IDEMPOTENCY_CONFLICT', 'This request key was already used for another solution');
        return value;
      });
      return readFor(scope, created.id);
    },
    async decide(auth, id, body, expectedVersion) {
      const scope = await owner(auth);
      const command = SolutionDecisionSchema.parse(body);
      const version = z.number().int().nonnegative().parse(expectedVersion);
      const claimed = await tx(scope, async (client) => {
        const value = await find(client, scope, id, true);
        if (value.workflow_hash !== command.workflowHash || value.row_version !== version) {
          fail('SOLUTION_CHANGED', 'The solution changed. Refresh and review it before approving.');
        }
        requireBundleApproval(value, command);
        if (command.action === 'deploy') {
          const stale =
            value.status === 'deploying' &&
            Date.now() - new Date(value.updated_at).getTime() > DEPLOYMENT_STALE_MS;
          if (!['draft', 'deployment_unknown'].includes(value.status) && !stale)
            fail('SOLUTION_STATE', 'Deployment is not available in this state');
          await lockSolutionEnvironmentReservations(client, scope);
          const environmentId = value.environment_id ?? (await availableEnvironment(client, scope));
          if (environmentId !== command.environmentId)
            fail(
              'SOLUTION_ENVIRONMENT_CHANGED',
              'The assigned environment changed. Refresh and review before approving.'
            );
          if (!environmentId)
            fail(
              'SOLUTION_ENVIRONMENT_REQUIRED',
              'No isolated environment is assigned to your workspace. An operator must provision one first.',
              503
            );
          try {
            const updated = row(
              await client.query(
                `UPDATE orqaly.customer_solutions
              SET status='deploying', environment_id=$4, approved_at=COALESCE(approved_at,clock_timestamp()),
                last_error=NULL,row_version=row_version+1,updated_at=clock_timestamp()
              WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3 RETURNING *`,
                [scope.tenantId, scope.userId, id, environmentId]
              )
            );
            return { ...value, ...updated, nativeConnections: value.nativeConnections };
          } catch (error) {
            if (error.code === '23505')
              fail(
                'SOLUTION_ENVIRONMENT_OCCUPIED',
                'The preview environment already belongs to another solution. Provision another environment to deploy this one.'
              );
            throw error;
          }
        }
        const activating = command.action === 'activate';
        const reconcilingPause =
          isNative(value) &&
          value.status === 'paused' &&
          (value.last_error === 'RUNTIME_PAUSE_REQUIRES_VERIFICATION' ||
            (value.last_error === 'PAUSE_PENDING_VERIFICATION' &&
              Date.now() - new Date(value.updated_at).getTime() > DEPLOYMENT_STALE_MS));
        if (
          activating &&
          (!['ready', 'paused'].includes(value.status) || !value.tested_at || !value.deployment)
        ) {
          fail('SOLUTION_TEST_REQUIRED', 'Deploy and pass a real workflow test before activation');
        }
        if (!activating && value.status !== 'active' && !reconcilingPause)
          fail('SOLUTION_STATE', 'Only an active solution can be paused');
        if (
          activating &&
          bundleHashFor(value) &&
          !(await hasNativeAcceptanceCoverage(client, scope, value))
        )
          fail(
            'SOLUTION_BUNDLE_TEST_REQUIRED',
            'Record main-case coverage and a verified error-handler execution for this exact bundle before activation.'
          );
        if (isNative(value)) {
          if (value.last_error?.includes('REVISION_ACTIVATION'))
            fail(
              'SOLUTION_REVISION_PENDING',
              'Complete or reconcile the pending revision activation first.'
            );
          if (typeof runtime[activating ? 'activate' : 'pause'] !== 'function')
            fail(
              'SOLUTION_RUNTIME_UNAVAILABLE',
              'Native lifecycle support is not configured.',
              503
            );
          if (
            value.last_error?.endsWith('_PENDING_VERIFICATION') &&
            Date.now() - new Date(value.updated_at).getTime() <= DEPLOYMENT_STALE_MS
          )
            fail('SOLUTION_LIFECYCLE_BUSY', 'The runtime change is still awaiting verification.');
          if (
            activating &&
            ['PAUSE_PENDING_VERIFICATION', 'RUNTIME_PAUSE_REQUIRES_VERIFICATION'].includes(
              value.last_error
            )
          )
            fail(
              'SOLUTION_PAUSE_UNVERIFIED',
              'Verify that the previous runtime pause completed before activation.'
            );
          const updated = row(
            await client.query(
              `UPDATE orqaly.customer_solutions SET status='paused',last_error=$4,row_version=row_version+1,
              updated_at=clock_timestamp() WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3 RETURNING *`,
              [
                scope.tenantId,
                scope.userId,
                id,
                activating ? 'ACTIVATION_PENDING_VERIFICATION' : 'PAUSE_PENDING_VERIFICATION',
              ]
            )
          );
          return {
            ...value,
            ...updated,
            workflow: value.workflow,
            workflow_hash: value.workflow_hash,
            spec: value.spec,
            revision_id: value.revision_id,
            deployment: value.deployment,
            runtimeAction: activating ? 'activate' : 'pause',
          };
        }
        await client.query(
          `UPDATE orqaly.customer_solutions SET status=$4,row_version=row_version+1,
          updated_at=clock_timestamp() WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3`,
          [scope.tenantId, scope.userId, id, activating ? 'active' : 'paused']
        );
        return null;
      });
      if (claimed) {
        if (claimed.runtimeAction) {
          let deployment;
          const action = claimed.runtimeAction;
          try {
            deployment = await runtime[action](scope, claimed);
            if (!nativeLifecycleReceiptMatches(deployment, claimed, action === 'activate'))
              throw new Error('native_lifecycle_not_verified');
          } catch {
            deployment = null;
          }
          await tx(scope, (client) =>
            client.query(
              `UPDATE orqaly.customer_solutions SET status=$4,last_error=$5,
              row_version=row_version+1,updated_at=clock_timestamp()
              WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3 AND row_version=$6`,
              [
                scope.tenantId,
                scope.userId,
                id,
                deployment && action === 'activate' ? 'active' : 'paused',
                deployment
                  ? null
                  : action === 'activate'
                    ? 'RUNTIME_ACTIVATION_REQUIRES_VERIFICATION'
                    : 'RUNTIME_PAUSE_REQUIRES_VERIFICATION',
                claimed.row_version,
              ]
            )
          );
          return readFor(scope, id);
        }
        let deployment;
        let errorCode = null;
        try {
          deployment = await runtime.deploy(scope, claimed);
          if (
            isNative(claimed) &&
            (deployment?.workflowHash !== claimed.workflow_hash ||
              deployment.active !== false ||
              !deploymentBundleMatches(deployment, claimed))
          )
            throw new Error('native_stage_not_verified');
        } catch {
          deployment = null;
          errorCode = 'DEPLOYMENT_REQUIRES_VERIFICATION';
        }
        await tx(scope, (client) =>
          client.query(
            `UPDATE orqaly.customer_solutions
          SET status=$4,deployment=$5,last_error=$6,row_version=row_version+1,updated_at=clock_timestamp()
          WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3 AND row_version=$7`,
            [
              scope.tenantId,
              scope.userId,
              id,
              errorCode ? 'deployment_unknown' : 'ready',
              deployment ?? null,
              errorCode,
              claimed.row_version,
            ]
          )
        );
      }
      return readFor(scope, id);
    },
    async invoke(auth, id, body, key) {
      const scope = await owner(auth);
      const command = SolutionInvocationSchema.parse(body);
      keySchema.parse(key);
      const claimed = await tx(scope, async (client) => {
        const value = await find(client, scope, id, true);
        if (
          command.allowExternalEffects &&
          (command.mode !== 'test' || !isNative(value) || !connectionCount(value))
        )
          fail(
            'SOLUTION_EFFECT_APPROVAL_INVALID',
            'Effect-test approval is only valid for a connected native workflow test.',
            400
          );
        if (command.workflowHash && command.workflowHash !== value.workflow_hash)
          fail(
            'SOLUTION_CHANGED',
            'The workflow version changed. Review it before sending this request.'
          );
        const bundleHash = requireBundleApproval(value, command);
        const requestHash = canonicalHash({ ...command, workflowHash: value.workflow_hash });
        const existing = row(
          await client.query(
            `SELECT * FROM orqaly.solution_invocations
          WHERE tenant_id=$1 AND solution_id=$2 AND idempotency_key=$3`,
            [scope.tenantId, id, key]
          )
        );
        if (existing) {
          if (existing.request_hash !== requestHash)
            fail('IDEMPOTENCY_CONFLICT', 'This request key was already used with different input');
          return { existing };
        }
        if (!value.deployment || !['ready', 'active', 'paused'].includes(value.status))
          fail('SOLUTION_NOT_DEPLOYED', 'Deploy the workflow before running it');
        if (command.mode === 'production' && value.status !== 'active')
          fail(
            'SOLUTION_NOT_ACTIVE',
            'Activate this solution before using its production endpoint'
          );
        if (isNative(value) && value.last_error?.includes('VERIFICATION'))
          fail(
            'SOLUTION_LIFECYCLE_UNVERIFIED',
            'Reconcile the pending runtime change before starting another invocation.'
          );
        try {
          validateSolutionInvocationInput(value, command.input, command.mode, command);
        } catch (error) {
          if (error instanceof SolutionError) throw error;
          fail('SOLUTION_INPUT_INVALID', error.message, 400);
        }
        await assertNoUnresolvedNativeEffect(client, scope, value);
        const invocationId = randomUUID();
        const evidence =
          isNative(value) && command.mode === 'test'
            ? nativeSolutionTestPlan(value, command)
            : bundleHash
              ? { bundleHash }
              : null;
        const invocation = row(
          await client.query(
            `INSERT INTO orqaly.solution_invocations
          (tenant_id,solution_id,id,owner_user_id,mode,idempotency_key,request_hash,workflow_hash,input,status,revision_id${evidence ? ',evidence' : ''})
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'running',$10${evidence ? ',$11' : ''}) RETURNING *`,
            [
              scope.tenantId,
              id,
              invocationId,
              scope.userId,
              command.mode,
              key,
              requestHash,
              value.workflow_hash,
              command.input,
              value.revision_id ?? null,
              ...(evidence ? [evidence] : []),
            ]
          )
        );
        return { solution: value, invocation };
      });
      if (claimed.existing)
        return { invocation: publicInvocation(claimed.existing), replayed: true };
      return service.executeClaimedInvocation(scope, claimed);
    },
    // Internal completion shared by Clerk commands and already authenticated,
    // durably claimed application-key calls. It is not exposed as an HTTP route.
    async executeClaimedInvocation(scope, claimed) {
      if (
        claimed.invocation.tenant_id !== scope.tenantId ||
        claimed.invocation.owner_user_id !== scope.userId ||
        claimed.solution.tenant_id !== scope.tenantId ||
        claimed.solution.owner_user_id !== scope.userId ||
        claimed.invocation.solution_id !== claimed.solution.id ||
        claimed.invocation.workflow_hash !== claimed.solution.workflow_hash ||
        claimed.invocation.status !== 'running'
      )
        fail('SOLUTION_INVOCATION_SCOPE', 'Invocation scope could not be verified.', 403);
      const id = claimed.solution.id;
      const command = SolutionInvocationSchema.parse({
        mode: claimed.invocation.mode,
        input: claimed.invocation.input,
      });
      const result = await executeSolutionInvocation(
        runtime,
        scope,
        claimed.solution,
        claimed.invocation
      );
      const errorCode = result.errorCode;
      const saved = await tx(scope, async (client) => {
        const value = row(
          await client.query(
            `UPDATE orqaly.solution_invocations
          SET status=$4,output=$5,execution_id=$6,error_code=$7,completed_at=clock_timestamp()${isNative(claimed.solution) ? ',evidence=$8' : ''}
          WHERE tenant_id=$1 AND solution_id=$2 AND id=$3 RETURNING *`,
            [
              scope.tenantId,
              id,
              claimed.invocation.id,
              result.status,
              result.output,
              result.executionId,
              errorCode,
              ...(isNative(claimed.solution) ? [result.evidence] : []),
            ]
          )
        );
        const passedTests =
          !errorCode &&
          command.mode === 'test' &&
          (await hasNativeAcceptanceCoverage(client, scope, claimed.solution));
        if (passedTests && claimed.solution.revision_id) {
          await client.query(
            `UPDATE orqaly.solution_revisions SET tested_at=clock_timestamp(),
             row_version=row_version+1,updated_at=clock_timestamp()
             WHERE tenant_id=$1 AND owner_user_id=$2 AND solution_id=$3 AND id=$4
               AND workflow_hash=$5 AND deployment=$6 AND status IN ('ready','active','superseded')`,
            [
              scope.tenantId,
              scope.userId,
              id,
              claimed.solution.revision_id,
              claimed.solution.workflow_hash,
              claimed.solution.deployment,
            ]
          );
        }
        if (passedTests)
          await client.query(
            `UPDATE orqaly.customer_solutions
          SET tested_at=clock_timestamp(),row_version=row_version+1,updated_at=clock_timestamp()
          WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3
            AND active_revision_id IS NOT DISTINCT FROM $4::uuid
            AND ($4::uuid IS NOT NULL OR (workflow_hash=$5 AND deployment=$6))`,
            [
              scope.tenantId,
              scope.userId,
              id,
              claimed.solution.revision_id ?? null,
              claimed.solution.workflow_hash,
              claimed.solution.deployment,
            ]
          );
        return value;
      });
      return { invocation: publicInvocation(saved), replayed: false };
    },
  };
  return service;
}
