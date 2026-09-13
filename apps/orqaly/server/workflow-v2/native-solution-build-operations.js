import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { canonicalJsonSha256 as hash } from '../../services/agentic-control-plane/src/domain/canonical.js';
import {
  CreateSolutionBuildConnectionSchema,
  RepairSolutionBuildSchema,
  ReviewSolutionBuildSchema,
  RevokeSolutionBuildConnectionSchema,
  SolutionBuildKeySchema,
  TestSolutionBuildSchema,
} from '../../shared/workflow-v2/solution-build-contracts.js';
import { containsSolutionBuildSecret } from '../../shared/workflow-v2/solution-build-secrets.js';
import { isBoundedNativeJson } from '../../shared/workflow-v2/native-workflow-contracts.js';
import { reviewNativeWorkflow, checkNativeWorkflowAcceptance } from './native-workflow-review.js';
import {
  normalizeNativeWorkflow,
  nativeCandidateFingerprint,
} from './native-workflow-runtime-contract.js';
import {
  bindNativeConnections,
  describeNativeConnection,
  validateNativeCredentialInput,
} from './native-workflow-connections.js';
import { nativeBundleConnectionRequirements } from './native-workflow-bundle.js';
import { nativeBuildConnectionRecords } from './native-build-model-context.js';

const row = (result) => result.rows[0];
const native = (value) => value.preparation_version === 2;
const editable = new Set(['draft', 'reviewed', 'needs_input', 'failed']);
export const NATIVE_TEST_SUITE_BUDGET_MS = 10 * 60 * 1000;
export const NATIVE_TEST_QUEUE_EXPIRY_MS = 15 * 60 * 1000;
const pendingTestSchema = z
  .object({
    id: z.uuid(),
    kind: z.literal('user_request'),
    key: SolutionBuildKeySchema,
    command: TestSolutionBuildSchema,
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
    inputVersion: z.number().int().positive(),
    workflowHash: z.string().regex(/^[a-f0-9]{64}$/),
    candidateFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    queuedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();
const retestClaimSchema = z
  .object({
    tenantId: z.uuid(),
    userId: z.string().min(1).max(200),
    buildRequestId: z.uuid(),
    leaseToken: z.uuid(),
    rowVersion: z.number().int().min(0),
    workflowHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const safeDiagnostic = (raw) => {
  const issue = typeof raw === 'string' ? { message: raw } : (raw ?? {});
  return {
    code: String(issue.code || 'NATIVE_VALIDATION_FAILED')
      .replace(/[^A-Za-z0-9_.:-]/g, '_')
      .slice(0, 120),
    message: containsSolutionBuildSecret(issue.message ?? '')
      ? 'Sensitive runtime details were withheld.'
      : String(issue.message || 'The workflow did not pass its check.').slice(0, 2000),
    ...(issue.nodeId ? { nodeId: String(issue.nodeId).slice(0, 120) } : {}),
  };
};

// Treat runtime receipts as evidence, not a promise. Unknown cleanup means the
// disposable artifact may still be active; missing/mismatched proof cannot
// authorize handoff or an automatic repair/retest.
export function nativeTestCaseEvidence({ actual, item, spec }) {
  const receipt =
    isBoundedNativeJson(actual, { maxBytes: 100000 }) && actual && typeof actual === 'object'
      ? actual
      : {};
  const executionId =
    typeof receipt.executionId === 'string' && /^[1-9][0-9]{0,30}$/.test(receipt.executionId)
      ? receipt.executionId
      : null;
  const verified =
    ['succeeded', 'failed'].includes(receipt.status) &&
    !!executionId &&
    receipt.testArtifactHash === item.workflowHash &&
    receipt.cleanup?.status === 'removed' &&
    (receipt.status !== 'succeeded' ||
      (Number.isInteger(receipt.responseStatus) &&
        receipt.responseStatus >= 100 &&
        receipt.responseStatus <= 599));
  const status = verified ? receipt.status : 'outcome_unknown';
  const safeOutput =
    verified &&
    receipt.output !== undefined &&
    isBoundedNativeJson(receipt.output, { maxBytes: 20000 }) &&
    !containsSolutionBuildSecret(receipt.output);
  const acceptance =
    status === 'succeeded' && safeOutput
      ? checkNativeWorkflowAcceptance({
          spec,
          input: item.acceptance.input,
          output: receipt.output,
          caseId: item.id,
          responseStatus: receipt.responseStatus,
        })
      : null;
  const diagnostics = (Array.isArray(receipt.diagnostics) ? receipt.diagnostics : [])
    .slice(0, 20)
    .map(safeDiagnostic);
  if (!verified)
    diagnostics.push({
      code: 'NATIVE_TEST_PROOF_UNCONFIRMED',
      message:
        'The exact test artifact, execution result or temporary workflow cleanup was not verified. Reconcile this attempt before running again.',
    });
  if (status === 'succeeded' && !safeOutput)
    diagnostics.push({
      code: 'TEST_OUTPUT_WITHHELD',
      message:
        'The output was too large or contained sensitive material; it was not saved or sent to the model.',
    });
  if (acceptance && !acceptance.passed) {
    diagnostics.push(...(acceptance.issues ?? []).slice(0, 20).map(safeDiagnostic));
    const observed = JSON.stringify({
      caseId: item.id,
      responseStatus: receipt.responseStatus,
      actualOutput: receipt.output,
    });
    diagnostics.push({
      code: 'NATIVE_ACCEPTANCE_MISMATCH',
      message:
        observed.length <= 2000
          ? observed
          : JSON.stringify({
              caseId: item.id,
              responseStatus: receipt.responseStatus,
              actualOutput: 'Output omitted: exceeds bounded diagnostic length.',
            }),
    });
  }
  const nodeIds = new Set(item.workflow.nodes.map((node) => node.id));
  return {
    id: item.id,
    input: item.acceptance.input,
    passed: status === 'succeeded' && acceptance?.passed === true,
    status,
    executionId: verified ? executionId : null,
    executedNodeIds:
      verified && Array.isArray(receipt.executedNodeIds)
        ? [...new Set(receipt.executedNodeIds.filter((nodeId) => nodeIds.has(nodeId)))].slice(
            0,
            100
          )
        : [],
    responseStatus: verified ? (receipt.responseStatus ?? null) : null,
    ...(verified &&
    receipt.outboundDelivery &&
    ['accepted', 'rejected'].includes(receipt.outboundDelivery.delivery) &&
    z.uuid().safeParse(receipt.outboundDelivery.connectionId).success &&
    nodeIds.has(receipt.outboundDelivery.nodeId)
      ? {
          outboundDelivery: {
            delivery: receipt.outboundDelivery.delivery,
            connectionId: receipt.outboundDelivery.connectionId,
            nodeId: receipt.outboundDelivery.nodeId,
          },
        }
      : {}),
    workflowHash: item.workflowHash,
    cleanup: { status: receipt.cleanup?.status === 'removed' ? 'removed' : 'pending' },
    ...(safeOutput ? { output: receipt.output, outputHash: hash(receipt.output) } : {}),
    issues: diagnostics,
    assertions: acceptance?.caseResults ?? [],
    mockedNodes: [],
  };
}

export function boundNativeTestEvidence(evidence) {
  const bounded = structuredClone(evidence);
  let outputBytes = 0;
  let inputBytes = 0;
  for (const result of bounded.caseResults) {
    result.inputHash = hash(result.input);
    inputBytes += Buffer.byteLength(JSON.stringify(result.input));
    if (inputBytes > 32000) {
      delete result.input;
      result.inputOmitted = 'Available in the immutable test configuration.';
    }
    if (result.output !== undefined) {
      outputBytes += Buffer.byteLength(JSON.stringify(result.output));
      if (outputBytes > 64000) {
        delete result.output;
        result.outputOmitted =
          'The suite output-preview budget was reached; the exact output hash is retained.';
      }
    }
  }
  // Leave headroom for PostgreSQL jsonb text spacing and enclosing build/event
  // metadata. This compacts previews only, never status, proof, hashes or tests.
  if (Buffer.byteLength(JSON.stringify(bounded)) > 128000) {
    bounded.previewTruncated = true;
    const compact = (issues) =>
      issues.slice(0, 5).map((issue) => ({ ...issue, message: issue.message.slice(0, 500) }));
    bounded.diagnostics = compact(bounded.diagnostics);
    for (const result of bounded.caseResults) {
      delete result.input;
      result.inputOmitted = 'Available in the immutable test configuration.';
      if (result.output !== undefined) {
        delete result.output;
        result.outputOmitted =
          'Evidence-preview budget reached; the exact output hash is retained.';
      }
      result.issues = compact(result.issues);
      result.assertions = result.assertions.map((assertion) => ({
        ...assertion,
        issues: compact(assertion.issues ?? []),
      }));
    }
  }
  return bounded;
}

export function nativeBuildProjection(value) {
  const metadata = value.native_metadata ?? {};
  const unknown = metadata.testEvidence?.status === 'outcome_unknown';
  const running = metadata.testEvidence?.status === 'running' || !!metadata.pendingTest;
  return {
    preparationVersion: 2,
    progress: {
      stage:
        value.status === 'preparing'
          ? metadata.phase === 'repair'
            ? 'repairing'
            : 'designing'
          : value.status === 'needs_input'
            ? 'needs_input'
            : (metadata.stage ?? 'validating'),
      attempt: metadata.repairCount ?? 0,
      maxAttempts: 3,
    },
    knowledge: {
      version: metadata.knowledgeVersion,
      catalogHash: metadata.catalogHash,
      skills: metadata.skills ?? [],
    },
    semanticReview: metadata.semanticReview ?? null,
    testEvidence: metadata.testEvidence ?? null,
    dependencies: metadata.dependencies ?? [],
    repairEligibility: {
      allowed:
        !!value.workflow &&
        !!value.spec &&
        editable.has(value.status) &&
        !unknown &&
        !running &&
        (metadata.repairCount ?? 0) < 3,
      reason: unknown
        ? 'Reconcile the unknown execution outcome before repairing or retrying.'
        : running
          ? 'Wait for the current test to complete.'
          : (metadata.repairCount ?? 0) >= 3
            ? 'The three-repair limit has been reached. Inspect the last error or start a revised task.'
            : null,
    },
    testEligibility: {
      allowed: false,
      reason: 'Checking the isolated environment and current draft.',
    },
    connectionRequirements: [],
  };
}

export function createNativeBuildOperations({
  repository,
  runtime,
  axwiseClient,
  tx,
  owner,
  find,
  update,
  event,
  replay,
  readFor,
  version,
  enqueue,
  supersede,
  fail,
  enableTests = false,
}) {
  const requireNative = (value) => {
    if (!native(value))
      fail('BUILD_NATIVE_REQUIRED', 'This action is available for native V2 builds only.');
  };
  const requireEditable = (value, queuedId = null) => {
    requireNative(value);
    if (!editable.has(value.status))
      fail('BUILD_NOT_EDITABLE', 'Wait for the draft or open a new revision.');
    if (value.native_metadata?.testEvidence?.status === 'running')
      fail('BUILD_TEST_RUNNING', 'A test is already running.');
    if (value.native_metadata?.pendingTest && value.native_metadata.pendingTest.id !== queuedId)
      fail(
        'BUILD_TEST_QUEUED',
        'A test is queued. Wait for its result, or edit the draft to supersede this request.'
      );
  };
  async function connections(client, scope, id) {
    return (
      await client.query(
        `SELECT * FROM orqaly.solution_connections WHERE tenant_id=$1 AND owner_user_id=$2 AND build_request_id=$3 AND status<>'revoked' ORDER BY created_at,id`,
        [scope.tenantId, scope.userId, id]
      )
    ).rows;
  }
  async function testBarrier(client, scope, id) {
    // Each case has a bounded runtime. An API process crash cannot leave a
    // permanent running label, and an edit cannot erase an uncertain effect.
    await client.query(
      `UPDATE orqaly.solution_build_tests SET status='outcome_unknown',
      evidence=jsonb_build_object('status','outcome_unknown','diagnostics',jsonb_build_array(
        jsonb_build_object('code','TEST_WORKER_INTERRUPTED','message','The test stopped reporting. Its outcome must be reconciled before another execution.'))),
      completed_at=clock_timestamp() WHERE tenant_id=$1 AND owner_user_id=$2 AND build_request_id=$3
      AND status='running' AND created_at < clock_timestamp() - interval '30 minutes'`,
      [scope.tenantId, scope.userId, id]
    );
    return row(
      await client.query(
        `SELECT id,status,evidence FROM orqaly.solution_build_tests
      WHERE tenant_id=$1 AND owner_user_id=$2 AND build_request_id=$3 AND status IN ('running','outcome_unknown')
      ORDER BY created_at DESC LIMIT 1`,
        [scope.tenantId, scope.userId, id]
      )
    );
  }
  async function environment(client, scope, value, reserve = false) {
    if (!runtime) return null;
    if (value.environment_id) return value.environment_id;
    if (reserve)
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended('orqaly.solution-environment:' || $1 || ':' || $2,0))`,
        [scope.tenantId, scope.userId]
      );
    const ids = runtime.environmentIds?.(scope) ?? [];
    if (!ids.length) return null;
    const occupied = (
      await client.query(
        `SELECT environment_id FROM orqaly.customer_solutions WHERE tenant_id=$1 AND owner_user_id=$2 AND environment_id=ANY($3::text[])
       UNION SELECT environment_id FROM orqaly.solution_build_requests WHERE tenant_id=$1 AND owner_user_id=$2 AND id<>$4 AND environment_id=ANY($3::text[])`,
        [scope.tenantId, scope.userId, ids, value.id]
      )
    ).rows;
    const taken = new Set(occupied.map((item) => item.environment_id));
    const available = ids.find((id) => !taken.has(id) && runtime.nativePolicy?.(scope, id));
    if (!available) return null;
    if (reserve) {
      try {
        await update(client, scope, value.id, { environment_id: available });
      } catch (error) {
        if (error.code === '23505')
          fail(
            'BUILD_ENVIRONMENT_OCCUPIED',
            'Another build reserved this environment. Refresh to choose the next available environment.'
          );
        throw error;
      }
    }
    return available;
  }
  async function context(client, scope, value, queuedId = null) {
    const environmentId = await environment(client, scope, value);
    const rawOwned = await connections(client, scope, value.id);
    const entries = value.workflow && value.spec ? nativeBundleConnectionRequirements(value) : [];
    const owned = value.workflow && value.spec ? nativeBuildConnectionRecords(value, rawOwned) : [];
    const policy = environmentId ? runtime.nativePolicy?.(scope, environmentId) : null;
    const requirements = entries.map((entry) => {
      const described = describeNativeConnection({
        requirement: entry.requirement,
        workflow: entry.workflow,
        connection: rawOwned.find((connection) => connection.requirement_id === entry.id),
        environmentId,
      });
      Object.assign(described, { id: entry.id, dependencyId: entry.dependencyId });
      // This legacy Build table/form is not a revision-scoped child credential
      // grant. Do not route a child setup request through the main-node adapter.
      if (entry.dependencyId !== null && described.canConnect)
        return {
          ...described,
          canConnect: false,
          reason:
            'This linked workflow needs its separate scoped connection setup before it can be tested.',
        };
      if (!policy || policy.credentials !== 'bound')
        return {
          ...described,
          canConnect: false,
          reason:
            'This environment does not yet have the required reviewed service-connection capability.',
        };
      return described;
    });
    const checked =
      value.workflow && value.spec
        ? reviewNativeWorkflow({
            workflow: value.workflow,
            spec: value.spec,
            runtimePolicy: policy,
            connections: owned,
            environmentId,
          })
        : null;
    const fingerprint = checked
      ? nativeCandidateFingerprint({
          workflow: value.workflow,
          spec: value.spec,
          runtimePolicy: policy,
          connections: owned,
          dependencies: [],
        })
      : null;
    const missing = requirements.some(
      (requirement) => !['saved', 'verified'].includes(requirement.status)
    );
    const barrier = await testBarrier(client, scope, value.id);
    const running = barrier?.status === 'running';
    const unknown = barrier?.status === 'outcome_unknown';
    const queued =
      !!value.native_metadata?.pendingTest && value.native_metadata.pendingTest.id !== queuedId;
    const informationMissing = value.questions?.some(
      (question) => question.kind === 'information' || question.kind === 'setup'
    );
    const allowed =
      enableTests &&
      !!environmentId &&
      !!checked?.valid &&
      checked.execution?.allowed === true &&
      !missing &&
      !informationMissing &&
      !running &&
      !unknown &&
      !queued &&
      editable.has(value.status);
    const reason = !enableTests
      ? 'Native test dispatch is disabled. The saved draft remains available.'
      : !environmentId
        ? 'Provision an available isolated native-workflow environment to run this draft.'
        : informationMissing
          ? 'Complete the pending information or setup step first.'
          : missing
            ? 'Connect the required services before testing.'
            : queued
              ? 'The authorized test is queued for the worker. You can leave this page.'
              : running
                ? 'A real n8n test is already running.'
                : unknown
                  ? 'Reconcile the unknown outcome before running again.'
                  : !checked?.valid
                    ? 'Resolve the workflow validation issues first.'
                    : !checked.execution?.allowed
                      ? (checked.execution?.reasons ?? [])
                          .map((issue) => (typeof issue === 'string' ? issue : issue.message))
                          .filter(Boolean)
                          .join(' ') || 'This runtime capability is not enabled.'
                      : null;
    return {
      environmentId,
      policy,
      owned,
      requirements,
      checked,
      fingerprint,
      barrier,
      eligibility: { allowed, reason, requiresEffectApproval: requirements.length > 0 },
    };
  }
  async function describe(client, scope, value, publicValue) {
    const current = await context(client, scope, value);
    const latestTest = row(
      await client.query(
        `SELECT * FROM orqaly.solution_build_tests
      WHERE tenant_id=$1 AND owner_user_id=$2 AND build_request_id=$3
      ORDER BY created_at DESC,id DESC LIMIT 1`,
        [scope.tenantId, scope.userId, value.id]
      )
    );
    const sameTestDraft =
      latestTest?.workflow_hash === value.workflow_hash &&
      latestTest?.input_version === value.input_version;
    const visibleEvidence =
      !value.native_metadata?.pendingTest &&
      latestTest &&
      (sameTestDraft || value.status === 'cancelled')
        ? {
            ...(latestTest.evidence ?? {}),
            id: latestTest.id,
            status: latestTest.status,
            ...(value.status === 'cancelled' && !sameTestDraft ? { historical: true } : {}),
          }
        : null;
    return {
      ...publicValue,
      ...(!enableTests
        ? {
            repairEligibility: {
              allowed: false,
              reason: 'Native repair dispatch is disabled. The saved draft remains available.',
            },
          }
        : {}),
      environment: current.environmentId ? runtime.describe(current.environmentId) : null,
      ...(visibleEvidence
        ? { testEvidence: visibleEvidence }
        : value.status === 'cancelled'
          ? { testEvidence: null }
          : {}),
      ...(current.barrier
        ? {
            testEvidence:
              current.barrier.status === 'running'
                ? (publicValue.testEvidence ?? { id: current.barrier.id, status: 'running' })
                : {
                    ...(current.barrier.evidence ?? {}),
                    id: current.barrier.id,
                    status: 'outcome_unknown',
                  },
            repairEligibility: {
              allowed: false,
              reason:
                current.barrier.status === 'running'
                  ? 'Wait for the current test.'
                  : 'Reconcile the uncertain execution before repair or retry.',
            },
          }
        : {}),
      connectionRequirements: current.requirements,
      testEligibility: current.eligibility,
      dependencies: [...(publicValue.dependencies ?? []), ...(current.checked?.dependencies ?? [])],
      readiness: {
        structural: current.checked?.valid === true,
        executable: current.checked?.execution?.allowed === true,
        fingerprint: current.fingerprint,
      },
    };
  }
  async function assertHandoff(client, scope, value) {
    const current = await context(client, scope, value);
    const evidence = value.native_metadata?.testEvidence;
    if (
      current.barrier ||
      value.native_metadata?.pendingTest ||
      !current.checked?.valid ||
      !current.checked.execution?.allowed ||
      !evidence ||
      evidence.status !== 'succeeded' ||
      evidence.workflowHash !== value.workflow_hash ||
      evidence.candidateFingerprint !== current.fingerprint
    )
      fail(
        'BUILD_TEST_REQUIRED',
        'Pass a real n8n test of this exact draft, connections and runtime before creating the Solution.'
      );
    const recorded = row(
      await client.query(
        `SELECT * FROM orqaly.solution_build_tests
      WHERE tenant_id=$1 AND owner_user_id=$2 AND build_request_id=$3 AND id=$4`,
        [scope.tenantId, scope.userId, value.id, evidence.id]
      )
    );
    if (
      !recorded ||
      recorded.status !== 'succeeded' ||
      recorded.workflow_hash !== value.workflow_hash ||
      recorded.input_version !== value.input_version ||
      recorded.candidate_fingerprint !== current.fingerprint ||
      hash(recorded.evidence) !== hash(evidence) ||
      recorded.test_artifact_hash !== hash(recorded.configuration?.cases ?? [])
    )
      fail(
        'BUILD_TEST_REQUIRED',
        'The immutable test record does not verify this exact draft. Run its approved acceptance cases first.'
      );
    if (current.requirements.some((requirement) => requirement.status !== 'verified'))
      fail(
        'BUILD_CONNECTION_TEST_REQUIRED',
        'Verify the required service actions with an explicitly approved connection test.'
      );
  }
  async function testForScope(scope, id, body, key, automaticClaim, queuedRequest = null) {
    const command = TestSolutionBuildSchema.parse(body);
    if (!automaticClaim)
      fail('BUILD_WORKER_REQUIRED', 'Only the claimed worker can dispatch a test.');
    SolutionBuildKeySchema.parse(key);
    const originalHash = queuedRequest ? queuedRequest.requestHash : hash(command);
    const claimed = await tx(scope, async (client) => {
      const value = await find(client, scope, id, true);
      requireNative(value);
      if (automaticClaim) {
        const validClaim = retestClaimSchema.safeParse(automaticClaim);
        if (
          !validClaim.success ||
          automaticClaim.tenantId !== scope.tenantId ||
          automaticClaim.userId !== scope.userId ||
          automaticClaim.buildRequestId !== id ||
          automaticClaim.rowVersion !== value.row_version ||
          automaticClaim.workflowHash !== value.workflow_hash ||
          value.native_test_lease_token !== automaticClaim.leaseToken ||
          (queuedRequest
            ? !value.native_metadata?.pendingTest ||
              hash(value.native_metadata.pendingTest) !== hash(queuedRequest)
            : value.native_metadata?.autoRetest !== true || !!value.native_metadata?.pendingTest) ||
          (!queuedRequest && nativeBundleConnectionRequirements(value).length > 0) ||
          value.spec?.runtimeProfile !== 'request_automation'
        )
          fail('BUILD_RETEST_STALE', 'The automatic test authorization changed.');
        const lease = row(
          await client.query(
            `SELECT native_test_lease_expires_at>clock_timestamp() AS valid
            FROM orqaly.solution_build_requests WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3
            AND native_test_lease_token=$4 AND row_version=$5 AND workflow_hash=$6`,
            [
              scope.tenantId,
              scope.userId,
              id,
              automaticClaim.leaseToken,
              automaticClaim.rowVersion,
              automaticClaim.workflowHash,
            ]
          )
        );
        if (lease?.valid !== true) fail('BUILD_RETEST_STALE', 'The automatic test lease expired.');
      }
      if (queuedRequest) {
        pendingTestSchema.parse(queuedRequest);
        if (
          queuedRequest.key !== key ||
          queuedRequest.requestHash !== hash(queuedRequest.command) ||
          queuedRequest.inputVersion !== value.input_version ||
          queuedRequest.workflowHash !== value.workflow_hash ||
          Date.now() >= Date.parse(queuedRequest.expiresAt) ||
          hash({ ...queuedRequest.command, expectedVersion: command.expectedVersion }) !==
            hash(command)
        )
          fail(
            'BUILD_TEST_REQUEST_STALE',
            'The queued authorization expired or no longer matches this draft.'
          );
      }
      const existing = row(
        await client.query(
          `SELECT * FROM orqaly.solution_build_tests
          WHERE tenant_id=$1 AND owner_user_id=$2 AND build_request_id=$3 AND request_key=$4`,
          [scope.tenantId, scope.userId, id, key]
        )
      );
      if (existing) {
        if (existing.request_hash !== originalHash)
          fail('IDEMPOTENCY_CONFLICT', 'This test key was already used for different input.');
        return { existing };
      }
      version(value, command.expectedVersion);
      requireEditable(value, queuedRequest?.id);
      if (value.workflow_hash !== command.workflowHash)
        fail('BUILD_VERSION_CONFLICT', 'Refresh the exact draft before testing.');
      const current = await context(client, scope, value, queuedRequest?.id);
      if (queuedRequest && current.fingerprint !== queuedRequest.candidateFingerprint)
        fail(
          'BUILD_TEST_REQUEST_STALE',
          'The queued runtime or connection scope changed. Request a new test.'
        );
      if (!current.eligibility.allowed) fail('BUILD_TEST_UNAVAILABLE', current.eligibility.reason);
      if (command.allowExternalEffects && !current.eligibility.requiresEffectApproval)
        fail('BUILD_EFFECTS_DISABLED', 'This draft does not authorize a live service action.');
      if (current.eligibility.requiresEffectApproval && !command.allowExternalEffects)
        fail(
          'BUILD_EFFECT_APPROVAL_REQUIRED',
          'Review the destinations, sample data and possible costs before authorizing a live connection test.'
        );
      const reserved = await environment(client, scope, value, true);
      if (reserved !== current.environmentId)
        fail(
          'BUILD_ENVIRONMENT_CHANGED',
          'The isolated environment changed; refresh and review its configuration.'
        );
      const testId = queuedRequest?.id ?? randomUUID();
      const cases = value.spec.acceptanceCases.map((acceptance) => {
        const artifactId = randomUUID();
        const artifact = normalizeNativeWorkflow({
          workflow: value.workflow,
          id: artifactId,
          controlledTest: true,
        });
        return {
          id: acceptance.id,
          testId: artifactId,
          invocationId: randomUUID(),
          workflow: artifact.workflow,
          workflowHash: artifact.workflowHash,
          acceptance,
        };
      });
      const configuration = {
        kind: current.eligibility.requiresEffectApproval ? 'live_connection' : 'controlled_runtime',
        mocks: [],
        candidateFingerprint: current.fingerprint,
        runtimePolicy: current.policy,
        deadline: new Date(Date.now() + NATIVE_TEST_SUITE_BUDGET_MS).toISOString(),
        cases: cases.map(
          ({ id: caseId, testId: artifactId, invocationId, workflowHash, acceptance }) => ({
            id: caseId,
            testId: artifactId,
            invocationId,
            workflowHash,
            input: acceptance.input,
          })
        ),
        connectionVersions: current.owned.map((connection) => connection.id),
        transientErrorRetention: 'owned_disposable_test_only',
        repairOnFailure: command.repairOnFailure,
        authorization: queuedRequest
          ? {
              kind: 'user_request',
              key,
              command: queuedRequest.command,
              requestHash: originalHash,
              queuedAt: queuedRequest.queuedAt,
            }
          : { kind: 'automatic_repair' },
      };
      const evidence = {
        id: testId,
        status: 'running',
        kind: configuration.kind,
        candidateFingerprint: current.fingerprint,
        workflowHash: value.workflow_hash,
        createdAt: new Date().toISOString(),
        caseResults: [],
        diagnostics: [],
        mockedNodes: [],
      };
      await client.query(
        `INSERT INTO orqaly.solution_build_tests
          (tenant_id,build_request_id,id,owner_user_id,input_version,workflow_hash,candidate_fingerprint,
           test_artifact_hash,environment_id,request_key,request_hash,configuration,status)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'running')`,
        [
          scope.tenantId,
          id,
          testId,
          scope.userId,
          value.input_version,
          value.workflow_hash,
          current.fingerprint,
          hash(configuration.cases),
          current.environmentId,
          key,
          originalHash,
          JSON.stringify(configuration),
        ]
      );
      const updated = await update(client, scope, id, {
        review: null,
        status: 'draft',
        native_metadata: {
          ...value.native_metadata,
          autoRetest: false,
          pendingTest: null,
          stage: 'testing',
          testEvidence: evidence,
        },
      });
      if (automaticClaim)
        await client.query(
          `UPDATE orqaly.solution_build_requests
          SET native_test_lease_token=NULL,native_test_lease_expires_at=NULL,row_version=row_version+1,updated_at=clock_timestamp()
          WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3 AND native_test_lease_token=$4`,
          [scope.tenantId, scope.userId, id, automaticClaim.leaseToken]
        );
      await event(
        client,
        scope,
        updated,
        'test_started',
        {
          testId,
          workflowHash: value.workflow_hash,
          candidateFingerprint: current.fingerprint,
          kind: configuration.kind,
        },
        key,
        originalHash
      );
      return { value, current, testId, cases, configuration, evidence };
    });
    if (claimed.existing) return readFor(scope, id);
    const results = [];
    let unknown = false;
    let cancelled = false;
    let budgetExhausted = false;
    for (const item of claimed.cases) {
      if (Date.now() >= Date.parse(claimed.configuration.deadline)) {
        budgetExhausted = true;
        break;
      }
      // Cancellation, edits and connection revocation are checked immediately
      // before each new effect admission. Never hold a SQL transaction while
      // n8n runs. Already-dispatched effects still need reconciliation.
      const admitted = await tx(scope, async (client) => {
        const latest = await find(client, scope, id, true);
        if (Date.now() >= Date.parse(claimed.configuration.deadline)) {
          budgetExhausted = true;
          return false;
        }
        if (
          latest.status === 'cancelled' ||
          latest.input_version !== claimed.value.input_version ||
          latest.workflow_hash !== claimed.value.workflow_hash
        )
          return false;
        const current = await context(client, scope, latest);
        return (
          current.barrier?.id === claimed.testId &&
          current.barrier.status === 'running' &&
          current.checked?.valid &&
          current.checked.execution?.allowed &&
          current.fingerprint === claimed.current.fingerprint &&
          current.owned.every((connection) => ['saved', 'verified'].includes(connection.status))
        );
      });
      if (!admitted) {
        if (!budgetExhausted) cancelled = true;
        break;
      }
      let actual;
      try {
        actual = await runtime.testNative(scope, {
          environmentId: claimed.current.environmentId,
          nativeConnections: claimed.current.owned,
          allowExternalEffects:
            command.allowExternalEffects === true &&
            claimed.configuration.kind === 'live_connection',
          workflow: item.workflow,
          spec: claimed.value.spec,
          testId: item.testId,
          invocationId: item.invocationId,
          input: item.acceptance.input,
        });
      } catch {
        actual = {
          status: 'outcome_unknown',
          diagnostics: [
            {
              code: 'N8N_TEST_OUTCOME_UNKNOWN',
              message:
                'The runtime did not return verifiable completion evidence. Do not replay an external action.',
            },
          ],
        };
      }
      const result = nativeTestCaseEvidence({ actual, item, spec: claimed.value.spec });
      if (result.status === 'outcome_unknown') unknown = true;
      results.push(result);
      if (unknown || !results.at(-1).passed) break;
    }
    const status = unknown
      ? 'outcome_unknown'
      : cancelled
        ? 'cancelled'
        : results.length === claimed.cases.length && results.every((result) => result.passed)
          ? 'succeeded'
          : 'failed';
    const evidence = boundNativeTestEvidence({
      ...claimed.evidence,
      status,
      caseResults: results,
      diagnostics: [
        ...results.flatMap((result) => result.issues).slice(0, 39),
        ...(budgetExhausted
          ? [
              {
                code: 'NATIVE_TEST_BUDGET_EXHAUSTED',
                message:
                  'The ten-minute suite budget was reached. No further case was dispatched and automatic repair stopped.',
              },
            ]
          : []),
      ],
      completedAt: new Date().toISOString(),
    });
    await tx(scope, async (client) => {
      // Same build-before-test lock order as admission and stale recovery.
      const latest = await find(client, scope, id, true);
      const finished = await client.query(
        `UPDATE orqaly.solution_build_tests SET status=$4,evidence=$5,completed_at=clock_timestamp()
          WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3 AND status='running'`,
        [scope.tenantId, scope.userId, claimed.testId, status, JSON.stringify(evidence)]
      );
      if (finished.rowCount !== 1) return; // A recovered unknown cannot be overwritten by a late response.
      // Preserve the result on its immutable test record even if the customer
      // changed/cancelled the build; never attach stale success to a new draft.
      if (
        latest.status === 'cancelled' ||
        latest.input_version !== claimed.value.input_version ||
        latest.workflow_hash !== claimed.value.workflow_hash
      )
        return;
      const current = await context(client, scope, latest);
      if (current.fingerprint !== claimed.current.fingerprint) return;
      if (status === 'succeeded' && claimed.configuration.kind === 'live_connection') {
        // Proof is scoped to this tested workflow/connection fingerprint, not
        // a claim that the credential can perform arbitrary provider actions.
        for (const connection of current.owned)
          if (
            connection.status === 'saved' &&
            connection.scope.targets.every((target) =>
              results.some(
                (result) =>
                  result.outboundDelivery?.delivery === 'accepted' &&
                  result.outboundDelivery.connectionId === connection.id &&
                  result.outboundDelivery.nodeId === target.nodeId
              )
            )
          )
            await client.query(
              'SELECT orqaly.verify_native_outbound_connection($1::uuid,$2::uuid)',
              [claimed.testId, connection.id]
            );
      }
      const failureSignature =
        status === 'failed'
          ? hash(results.map(({ id: caseId, issues }) => ({ caseId, issues })))
          : null;
      const repeatedFailures = failureSignature
        ? latest.native_metadata?.lastFailureSignature === failureSignature
          ? (latest.native_metadata?.repeatedFailures ?? 1) + 1
          : 1
        : 0;
      const repair =
        status === 'failed' &&
        !budgetExhausted &&
        command.repairOnFailure &&
        repeatedFailures < 2 &&
        claimed.configuration.kind === 'controlled_runtime' &&
        (latest.native_metadata?.repairCount ?? 0) < 3;
      const updated = await update(client, scope, id, {
        review: null,
        status: repair ? 'preparing' : 'draft',
        ...(repair ? { input_version: latest.input_version + 1 } : {}),
        native_metadata: {
          ...latest.native_metadata,
          stage: repair ? 'repairing' : status === 'succeeded' ? 'ready' : 'validating',
          testEvidence: evidence,
          diagnostics: [
            ...evidence.diagnostics,
            ...(repeatedFailures >= 2
              ? [
                  {
                    code: 'REPEATED_TEST_FAILURE',
                    message:
                      'The same failure persisted after repair. Automatic retries stopped; inspect the observed result and revise the task.',
                  },
                ]
              : []),
          ],
          lastFailureSignature: failureSignature,
          repeatedFailures,
          ...(repair
            ? {
                phase: 'repair',
                autoRetest: true,
                repairCount: (latest.native_metadata?.repairCount ?? 0) + 1,
                frozenAcceptanceCases: latest.spec.acceptanceCases,
              }
            : {}),
        },
      });
      await event(client, scope, updated, 'test_completed', {
        testId: claimed.testId,
        status,
        candidateFingerprint: claimed.current.fingerprint,
        caseResults: evidence.caseResults,
      });
      if (repair) await enqueue(client, scope, updated);
    });
    return readFor(scope, id);
  }
  const methods = {
    async createConnection(auth, id, body, key) {
      const command = CreateSolutionBuildConnectionSchema.parse(body);
      SolutionBuildKeySchema.parse(key);
      const scope = await owner(auth);
      const claim = await tx(scope, async (client) => {
        const value = await find(client, scope, id, true);
        requireNative(value);
        const prior = row(
          await client.query(
            `SELECT * FROM orqaly.solution_connections
          WHERE tenant_id=$1 AND owner_user_id=$2 AND build_request_id=$3 AND request_key=$4`,
            [scope.tenantId, scope.userId, id, key]
          )
        );
        // A per-record random salt prevents ordinary request hashes from being
        // reusable fingerprints of credential material. The raw form is never persisted.
        if (prior) {
          if (prior.request_hash !== hash({ salt: prior.id, command }))
            fail('IDEMPOTENCY_CONFLICT', 'This connection request key was already used.');
          return { prior: true };
        }
        version(value, command.expectedVersion);
        requireEditable(value);
        if (await testBarrier(client, scope, id))
          fail('BUILD_TEST_UNRECONCILED', 'Reconcile the previous test first.');
        const current = await context(client, scope, value);
        const requirement = current.requirements.find((item) => item.id === command.requirementId);
        if (
          !requirement?.canConnect ||
          current.policy?.credentials !== 'bound' ||
          typeof runtime.createNativeCredential !== 'function'
        )
          fail(
            'BUILD_CONNECTION_UNAVAILABLE',
            requirement?.reason || 'This reviewed connection adapter is not installed.',
            409
          );
        try {
          validateNativeCredentialInput(requirement.credentialType, command.credentials);
        } catch {
          fail(
            'BUILD_CONNECTION_FIELDS_INVALID',
            'Check the required secure connection fields.',
            400
          );
        }
        const reserved = await environment(client, scope, value, true);
        if (reserved !== current.environmentId)
          fail('BUILD_ENVIRONMENT_CHANGED', 'Refresh the isolated environment before connecting.');
        const connectionId = randomUUID();
        await client.query(
          `INSERT INTO orqaly.solution_connections
          (tenant_id,build_request_id,id,owner_user_id,requirement_id,environment_id,credential_type,scope,request_key,request_hash,status)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'creating')`,
          [
            scope.tenantId,
            id,
            connectionId,
            scope.userId,
            requirement.id,
            reserved,
            requirement.credentialType,
            JSON.stringify(requirement.scope),
            key,
            hash({ salt: connectionId, command }),
          ]
        );
        await event(client, scope, value, 'connection_requested', {
          connectionId,
          requirementId: requirement.id,
          scope: requirement.scope,
        });
        return { value, requirement, connectionId, environmentId: reserved };
      });
      if (claim.prior) return readFor(scope, id);
      let providerId = null;
      try {
        const saved = await runtime.createNativeCredential(scope, {
          environmentId: claim.environmentId,
          connectionId: claim.connectionId,
          type: claim.requirement.credentialType,
          data: validateNativeCredentialInput(
            claim.requirement.credentialType,
            command.credentials
          ),
          scope: claim.requirement.scope,
        });
        providerId = z.string().min(1).max(200).parse(saved.id);
      } catch {
        /* No replay: the private provider may have saved it before disconnecting. */
      } finally {
        for (const field of Object.keys(command.credentials)) delete command.credentials[field];
      }
      await tx(scope, async (client) => {
        const latest = await find(client, scope, id, true);
        await client.query(
          `UPDATE orqaly.solution_connections SET status=$4,provider_credential_id=$5
          WHERE tenant_id=$1 AND owner_user_id=$2 AND id=$3 AND status='creating'`,
          [
            scope.tenantId,
            scope.userId,
            claim.connectionId,
            providerId ? 'saved' : 'outcome_unknown',
            providerId,
          ]
        );
        if (['completed', 'cancelled'].includes(latest.status)) return;
        const owned = await connections(client, scope, id);
        const workflow =
          latest.workflow && latest.spec
            ? bindNativeConnections(latest.workflow, latest.spec, owned, claim.environmentId)
            : latest.workflow;
        const stillBound = owned.some(
          (connection) =>
            connection.id === claim.connectionId &&
            describeNativeConnection({
              requirement: latest.spec?.connections?.find(
                (r) => r.id === command.requirementId
              ) ?? { ...claim.requirement, provider: claim.requirement.service },
              workflow: latest.workflow,
              connection,
              environmentId: claim.environmentId,
            }).status === 'saved'
        );
        const questions =
          providerId && stillBound
            ? latest.questions.filter(
                (question) =>
                  !(
                    question.kind === 'connection' &&
                    question.connectionId === command.requirementId
                  )
              )
            : latest.questions;
        const updated = await update(client, scope, id, {
          workflow,
          workflow_hash: workflow ? hash(workflow) : null,
          questions,
          status: questions.length ? 'needs_input' : workflow ? 'draft' : latest.status,
          input_version: latest.input_version + 1,
          review: null,
          native_metadata: {
            ...latest.native_metadata,
            autoRetest: false,
            pendingTest: null,
            testEvidence: null,
            stage: 'needs_input',
          },
        });
        await event(client, scope, updated, 'connection_saved', {
          connectionId: claim.connectionId,
          requirementId: command.requirementId,
          status: providerId ? 'saved' : 'outcome_unknown',
        });
      });
      return readFor(scope, id);
    },
    async revokeConnection(auth, id, body, key) {
      const command = RevokeSolutionBuildConnectionSchema.parse(body);
      SolutionBuildKeySchema.parse(key);
      const scope = await owner(auth);
      const revoked = await tx(scope, async (client) => {
        const value = await find(client, scope, id, true);
        requireNative(value);
        if (await replay(client, scope, id, 'connection_revoked', key, command)) return null;
        version(value, command.expectedVersion);
        if (['completed', 'cancelled'].includes(value.status))
          fail('BUILD_CONNECTION_FROZEN', 'Manage the deployed Solution connection separately.');
        const connection = row(
          await client.query(
            `UPDATE orqaly.solution_connections
          SET status='revoked',revoked_at=clock_timestamp() WHERE tenant_id=$1 AND owner_user_id=$2
          AND build_request_id=$3 AND id=$4 AND status<>'revoked' RETURNING *`,
            [scope.tenantId, scope.userId, id, command.connectionId]
          )
        );
        if (!connection) fail('BUILD_CONNECTION_NOT_FOUND', 'The connection was not found.', 404);
        const workflow = bindNativeConnections(
          value.workflow,
          value.spec,
          await connections(client, scope, id),
          value.environment_id
        );
        await supersede(client, scope, value);
        const updated = await update(client, scope, id, {
          workflow,
          workflow_hash: workflow ? hash(workflow) : null,
          input_version: value.input_version + 1,
          status: value.questions.length ? 'needs_input' : 'draft',
          review: null,
          native_metadata: {
            ...value.native_metadata,
            autoRetest: false,
            pendingTest: null,
            testEvidence: null,
            stage: 'needs_input',
          },
        });
        await event(
          client,
          scope,
          updated,
          'connection_revoked',
          {
            connectionId: connection.id,
            providerCleanup: 'pending',
            alreadyDispatchedEffects: 'not_undone',
          },
          key,
          hash(command)
        );
        return connection;
      });
      if (revoked?.provider_credential_id && runtime?.revokeNativeCredential) {
        try {
          await runtime.revokeNativeCredential(scope, {
            environmentId: revoked.environment_id,
            connectionId: revoked.id,
            credentialId: revoked.provider_credential_id,
          });
        } catch {
          /* Local authority is revoked; the provider cleanup is not claimed successful. */
        }
      }
      return readFor(scope, id);
    },
    async test(auth, id, body, key) {
      if (!enableTests)
        fail(
          'BUILD_TESTS_DISABLED',
          'Native test dispatch is not enabled. The saved draft remains available.',
          503
        );
      const command = TestSolutionBuildSchema.parse(body);
      SolutionBuildKeySchema.parse(key);
      const scope = await owner(auth);
      await tx(scope, async (client) => {
        const value = await find(client, scope, id, true);
        requireNative(value);
        if (await replay(client, scope, id, 'test_requested', key, command)) return;
        const prior = row(
          await client.query(
            `SELECT * FROM orqaly.solution_build_tests
          WHERE tenant_id=$1 AND owner_user_id=$2 AND build_request_id=$3 AND request_key=$4`,
            [scope.tenantId, scope.userId, id, key]
          )
        );
        if (prior) {
          if (prior.request_hash !== hash(command))
            fail('IDEMPOTENCY_CONFLICT', 'This test key was already used for different input.');
          return;
        }
        version(value, command.expectedVersion);
        requireEditable(value);
        if (value.workflow_hash !== command.workflowHash)
          fail('BUILD_VERSION_CONFLICT', 'Refresh the exact draft before testing.');
        const current = await context(client, scope, value);
        if (!current.eligibility.allowed)
          fail('BUILD_TEST_UNAVAILABLE', current.eligibility.reason);
        if (command.allowExternalEffects && !current.eligibility.requiresEffectApproval)
          fail('BUILD_EFFECTS_DISABLED', 'This draft does not authorize a live service action.');
        if (current.policy?.profile !== 'request_automation')
          fail(
            'BUILD_EFFECTS_DISABLED',
            'This runtime profile is not available for request tests.'
          );
        if (current.eligibility.requiresEffectApproval && !command.allowExternalEffects)
          fail(
            'BUILD_EFFECT_APPROVAL_REQUIRED',
            'Review the exact destinations and sample data, then explicitly authorize the real connection test.'
          );
        const reserved = await environment(client, scope, value, true);
        if (reserved !== current.environmentId)
          fail(
            'BUILD_ENVIRONMENT_CHANGED',
            'The isolated environment changed; refresh and request a new test.'
          );
        const pendingTest = pendingTestSchema.parse({
          id: randomUUID(),
          kind: 'user_request',
          key,
          command,
          requestHash: hash(command),
          inputVersion: value.input_version,
          workflowHash: value.workflow_hash,
          candidateFingerprint: current.fingerprint,
          queuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + NATIVE_TEST_QUEUE_EXPIRY_MS).toISOString(),
        });
        const updated = await update(client, scope, id, {
          status: 'draft',
          review: null,
          native_metadata: {
            ...value.native_metadata,
            autoRetest: false,
            pendingTest,
            stage: 'testing',
            testEvidence: {
              id: pendingTest.id,
              status: 'queued',
              workflowHash: value.workflow_hash,
              candidateFingerprint: current.fingerprint,
              queuedAt: pendingTest.queuedAt,
              expiresAt: pendingTest.expiresAt,
            },
          },
        });
        await event(
          client,
          scope,
          updated,
          'test_requested',
          {
            testId: pendingTest.id,
            workflowHash: value.workflow_hash,
            candidateFingerprint: current.fingerprint,
            expiresAt: pendingTest.expiresAt,
          },
          key,
          hash(command)
        );
      });
      return readFor(scope, id);
    },
    async repair(auth, id, body, key) {
      if (!enableTests)
        fail(
          'BUILD_TESTS_DISABLED',
          'Native repair dispatch is not enabled. The saved draft remains available.',
          503
        );
      const command = RepairSolutionBuildSchema.parse(body);
      SolutionBuildKeySchema.parse(key);
      const scope = await owner(auth);
      await tx(scope, async (client) => {
        const value = await find(client, scope, id, true);
        if (await replay(client, scope, id, 'repair_requested', key, command)) return;
        version(value, command.expectedVersion);
        requireEditable(value);
        if (await testBarrier(client, scope, id))
          fail(
            'BUILD_TEST_UNRECONCILED',
            'Complete or reconcile the previous test before requesting repair.'
          );
        const eligibility = nativeBuildProjection(value).repairEligibility;
        if (!eligibility.allowed || value.workflow_hash !== command.workflowHash)
          fail(
            'BUILD_REPAIR_UNAVAILABLE',
            eligibility.reason || 'Refresh the exact draft before requesting repair.'
          );
        const checked = reviewNativeWorkflow({ workflow: value.workflow, spec: value.spec });
        const diagnostics = value.native_metadata?.testEvidence?.diagnostics?.length
          ? value.native_metadata.testEvidence.diagnostics
          : (checked.issues ?? []);
        const updated = await update(client, scope, id, {
          status: 'preparing',
          input_version: value.input_version + 1,
          review: null,
          last_error: null,
          native_metadata: {
            ...value.native_metadata,
            autoRetest: false,
            pendingTest: null,
            phase: 'repair',
            stage: 'repairing',
            repairCount: (value.native_metadata?.repairCount ?? 0) + 1,
            repairInstruction:
              command.instruction ??
              'Repair the reported issues while preserving the approved task and acceptance cases.',
            frozenAcceptanceCases: value.spec.acceptanceCases,
            diagnostics: diagnostics.slice(0, 40).map(safeDiagnostic),
          },
        });
        await supersede(client, scope, value);
        await enqueue(client, scope, updated);
        await event(
          client,
          scope,
          updated,
          'repair_requested',
          {
            baseWorkflowHash: command.workflowHash,
            diagnostics: updated.native_metadata.diagnostics,
          },
          key,
          hash(command)
        );
      });
      return readFor(scope, id);
    },
    async cancel(auth, id, body, key) {
      const command = ReviewSolutionBuildSchema.parse(body);
      SolutionBuildKeySchema.parse(key);
      const scope = await owner(auth);
      const pending = await tx(scope, async (client) => {
        const value = await find(client, scope, id, true);
        requireNative(value);
        if (await replay(client, scope, id, 'cancelled', key, command)) return [];
        version(value, command.expectedVersion);
        if (['completed', 'cancelled'].includes(value.status))
          fail('BUILD_CANCEL_UNAVAILABLE', 'This build is already frozen.');
        const operations = (
          await client.query(
            `SELECT operation_id FROM orqaly.solution_build_attempts
          WHERE tenant_id=$1 AND owner_user_id=$2 AND build_request_id=$3 AND status IN ('pending','accepted')`,
            [scope.tenantId, scope.userId, id]
          )
        ).rows;
        await supersede(client, scope, value);
        const updated = await update(client, scope, id, {
          status: 'cancelled',
          input_version: value.input_version + 1,
          review: null,
          native_metadata: {
            ...value.native_metadata,
            autoRetest: false,
            pendingTest: null,
            stage: 'cancelled',
          },
        });
        await event(
          client,
          scope,
          updated,
          'cancelled',
          { inFlightTestId: value.native_metadata?.testEvidence?.id ?? null },
          key,
          hash(command)
        );
        return operations;
      });
      // Best-effort provider cancellation is not a promise to undo an effect.
      for (const operation of pending) {
        try {
          await axwiseClient?.cancel(operation.operation_id, scope.tenantId);
        } catch {
          /* durable supersession still blocks acceptance */
        }
      }
      return readFor(scope, id);
    },
  };
  async function advancePendingTest() {
    if (!enableTests || !runtime || !repository?.claimNativeWorkflowRetest)
      return { processed: false };
    const selected = await repository.claimNativeWorkflowRetest(randomUUID());
    if (!selected) return { processed: false };
    const claim = retestClaimSchema.parse(selected);
    const scope = { tenantId: claim.tenantId, userId: claim.userId };
    try {
      const queuedRequest = await tx(scope, async (client) => {
        const current = await find(client, scope, claim.buildRequestId);
        return current.native_metadata?.pendingTest ?? null;
      });
      await testForScope(
        scope,
        claim.buildRequestId,
        queuedRequest
          ? { ...pendingTestSchema.parse(queuedRequest).command, expectedVersion: claim.rowVersion }
          : {
              expectedVersion: claim.rowVersion,
              workflowHash: claim.workflowHash,
              allowExternalEffects: false,
              repairOnFailure: true,
            },
        queuedRequest?.key ?? `auto_retest_${claim.workflowHash}_${claim.rowVersion}`,
        claim,
        queuedRequest
      );
    } catch (error) {
      await tx(scope, async (client) => {
        const value = await find(client, scope, claim.buildRequestId, true);
        if (
          value.status === 'cancelled' ||
          value.native_test_lease_token !== claim.leaseToken ||
          value.row_version !== claim.rowVersion ||
          value.workflow_hash !== claim.workflowHash
        )
          return;
        await update(client, scope, value.id, {
          native_metadata: {
            ...value.native_metadata,
            autoRetest: false,
            pendingTest: null,
            testEvidence: value.native_metadata?.pendingTest
              ? {
                  id: value.native_metadata.pendingTest.id,
                  status: 'cancelled',
                  dispatched: false,
                  diagnostics: [
                    {
                      code: 'QUEUED_TEST_NOT_DISPATCHED',
                      message:
                        'The queued authorization expired or changed. No test was dispatched; review the current draft and request another test.',
                    },
                  ],
                }
              : (value.native_metadata?.testEvidence ?? null),
            stage: 'validating',
            diagnostics: [
              safeDiagnostic({
                code: error.code ?? 'AUTOMATIC_TEST_UNAVAILABLE',
                message:
                  'Automatic testing paused. Review the current draft and runtime, then explicitly start a test.',
              }),
            ],
          },
        });
      });
    }
    return { processed: true, buildRequestId: claim.buildRequestId, kind: 'native_retest' };
  }
  return {
    methods,
    describe,
    assertHandoff,
    context,
    connections,
    environment,
    advancePendingTest,
  };
}
