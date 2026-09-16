/**
 * Goals handler — autonomous goal orchestration CRUD + lifecycle.
 *
 * Routes (via query param `op`):
 *   POST ?op=create     — Create goal, enqueue planning job
 *   POST ?op=prepare-physical-evidence-profile — Prepare a read-only, org-bound v2 profile
 *   POST ?op=create-smart-request-draft — Verify org/catalogue, create non-executing draft
 *   POST ?op=start-smart-request — Persist evidence and enqueue verified draft
 *   GET  ?op=list       — List user's goals
 *   GET  ?op=get&id=    — Get single goal with plan, jobs, log
 *   POST ?op=pause&id=  — Pause goal
 *   POST ?op=resume&id= — Resume goal
 *   POST ?op=retry-pickup&id= — Wake queued or recover stale-running Preview work exactly once
 *   POST ?op=cancel&id= — Cancel goal
 *   POST ?op=rerun-quality-review&id= — Re-run Osja for a completed goal
 *   POST ?op=review-context&id= — Confirm, revise, or request evidence for goal context
 *   POST ?op=accept-customer-scope — Accept the active AxWise clarification scope
 *   POST ?op=revise-customer-scope — Replace an exact AxWise scope/generation from feedback
 *   POST ?op=answer-po-questions — Submit the active Expert PO questions and resume PRD work
 *   POST ?op=approve&id= — Confirm the final execution proposal
 *   POST ?op=request-changes&id= — Return the proposal for revision
 *   POST ?op=update-budget&id=&budget= — Update budget
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  applyRateLimitHeaders,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { processNextJob } from '../agent-handlers/job-processor.js';
import { validateNativeAxwiseDecisionContracts } from '../agent-handlers/compact-agent-contracts.js';
import { clearJobLease, hasCompleteJobLease } from '../agent-handlers/job-lease-runtime.js';
import { RECONCILABLE_STATUSES } from '../agent-handlers/goal-reconciler.js';
import {
  bindJobPayloadToWorkerDeployment,
  resolveWorkerDeploymentIdentity,
  resolveWorkerScope,
  WORKER_DEPLOYMENT_PAYLOAD_KEY,
} from '../agent-handlers/worker-scope.js';
import { triggerProcessNext, updateGoalIfNativeScopeBinding } from '../goal-handlers/_helpers.js';
import {
  buildContextApprovalSnapshot,
  hashApprovalSnapshot,
  invalidatedApproval,
  validateResearchExecutionPreview,
} from '../goal-handlers/approval-audit.js';
import { normalizeGoalHitlMode } from '../goal-handlers/hitl-policy.js';
import { WORK_SHAPE_ROUTE_VERSION } from '../goal-handlers/work-shape-playbooks.js';
import {
  customerScopeHash,
  hasCompleteLegacyClarification,
  OWNER_SCOPE_CONFIRMATION_PROVENANCE,
} from '../goal-handlers/scope-confirmation.js';
import { resolveGoalOrgId } from '../_shared/default-organization.js';
import {
  MAX_ATTACHMENTS,
  normalizeGoalAttachments,
  normalizeKnowledgeBaseEvidence,
} from '../goal-handlers/goal-evidence.js';
import { listConfiguredToolIds } from '../security/tool-credential-status.js';
import { runBestEffortSupabaseQuery } from '../_shared/supabase-query.js';
import { normalizeGoalComplexity } from '../_shared/goal-complexity.js';
import {
  resolvePhaseMetricMeta,
  resolveAgentMetricMeta,
  isLikelyDurationAsTokens,
} from '../_shared/report-metric-meta.js';
import { currentGoalTaskAttempt } from '../goal-handlers/current-goal-task-attempt.js';
import { isCanonicalAxwiseScopeGoal } from '../_shared/scope-chat-intent.js';
import {
  pendingScopeRevisionToken,
  scopeRevisionContinuationPayload,
} from '../_shared/scope-revision-continuation.js';
import {
  hasNativeAxwiseScopeMarkers,
  nativeAxwiseScopeActionBinding,
  nativeAxwiseScopeActionBindingMatches,
  nativeAxwiseScopeApprovalBlock,
} from '../_shared/native-scope-approval.js';
import {
  acceptedNativePlanningActionBinding,
  initialNativeScopeAdmissionActionBinding,
  resolveAcceptedNativeGoalAuthority,
} from '../_shared/native-goal-authority.js';
import { invalidateNativeExecutionForCanonicalReplan } from '../goal-handlers/native-legacy-dispatch.js';
import { currentGoalDocuments } from '../_shared/goal-document-attempt.js';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  confirmMarketScope,
  marketScopeHashPayload,
  marketScopeReady,
  resolveMarketExpression,
} from '../_shared/market-scope.js';
import {
  COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES,
  COMMERCIAL_MARKET_LAUNCH_INTENT,
  commercialResearchPolicyContract,
  verifyGoalResearchContextGate,
} from '../integrations/axwise/research-contract.js';
import {
  businessEvidenceProfileHash,
  createBusinessEvidenceProfile,
  evidenceProfileV2AdmissionEnabledForOrg,
  evidenceProfileV2Enabled,
  evidenceProfileV2EnabledForModel,
  executionRolesForEvidenceProfile,
  validateBusinessEvidenceProfile,
} from '../integrations/axwise/evidence-contract-v2.js';

const log = createLogger('goals');

/**
 * Lifecycle state each targeted stage must observe when a human queues it.
 *
 * This is intentionally server-owned: callers choose only a stage, while the
 * API restores the matching lifecycle state. Several stages reject any other
 * state (PO analysis, PM planning, team formation, and execute phase), and the
 * remaining entries keep the goal/reconciler view aligned with the queued
 * work while it waits for a worker.
 */
export const RETRY_STAGE_GOAL_STATUS = Object.freeze({
  'scope-admission': 'analyzing',
  'feasibility-analysis': 'feasibility',
  'po-analysis': 'analyzing',
  'pm-planning': 'planning',
  'team-formation': 'forming_team',
  'tool-provisioning': 'provisioning_tools',
  'execute-phase': 'active',
  'evaluate-phase': 'active',
  iterate: 'active',
});

const PICKUP_RETRY_DELAY_MS = 90_000;
// Preview has no Vercel Cron consumer. Give the normal exact-job self-wake a
// short head start, then let an open goal surface issue one guarded fresh
// browser request before Vercel's recursive invocation lineage can strand it.
const PREVIEW_PICKUP_RETRY_DELAY_MS = 15_000;
const PICKUP_CAPABILITY_VERSION = 'v1';
const PICKUP_CAPABILITY_RE = /^v1\.[A-Za-z0-9_-]{43}$/;

function pickupCapabilityDigest(
  secret,
  { goalStatus, goalId, userId, deploymentIdentity, job, retryAvailableAt }
) {
  const signingSecret = String(secret || '').trim();
  const boundDeployment = String(deploymentIdentity || '').trim();
  const jobDeployment = String(job?.payload?.[WORKER_DEPLOYMENT_PAYLOAD_KEY] || '').trim();
  const jobGoalId = String(job?.payload?.goalId || '').trim();
  if (
    !signingSecret ||
    !boundDeployment ||
    jobDeployment !== boundDeployment ||
    !job?.id ||
    !goalId ||
    jobGoalId !== String(goalId) ||
    !userId ||
    !retryAvailableAt
  ) {
    return null;
  }

  const snapshot = JSON.stringify([
    PICKUP_CAPABILITY_VERSION,
    String(job.id),
    String(goalId),
    String(userId),
    boundDeployment,
    String(goalStatus || ''),
    String(job.status || ''),
    Number.isFinite(Number(job.retry_count)) ? Number(job.retry_count) : null,
    job.max_retries === null || job.max_retries === undefined
      ? null
      : Number.isFinite(Number(job.max_retries))
        ? Number(job.max_retries)
        : null,
    String(job.updated_at || job.created_at || ''),
    job.status === 'running' ? String(job.lease_token || '') : '',
    job.status === 'running' ? String(job.lease_expires_at || '') : '',
    String(retryAvailableAt),
  ]);
  return `${PICKUP_CAPABILITY_VERSION}.${createHmac('sha256', signingSecret)
    .update(snapshot)
    .digest('base64url')}`;
}

function pickupCapabilityMatches(provided, expected) {
  const supplied = String(provided || '').trim();
  const issued = String(expected || '').trim();
  if (!PICKUP_CAPABILITY_RE.test(supplied) || !PICKUP_CAPABILITY_RE.test(issued)) return false;
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(issued);
  return (
    suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes)
  );
}

function pickupHasRetryBudget(job) {
  const retryCount = Number(job?.retry_count);
  const configuredMaxRetries = Number(job?.max_retries);
  const normalizedRetryCount = Number.isFinite(retryCount) ? Math.max(0, retryCount) : 0;
  const maxRetries =
    job?.max_retries !== null &&
    job?.max_retries !== undefined &&
    Number.isFinite(configuredMaxRetries)
      ? Math.max(0, configuredMaxRetries)
      : 3;
  return normalizedRetryCount < maxRetries;
}

function pickupRetryAvailableAt(job) {
  if (job?.status !== 'queued' && job?.status !== 'running') return null;
  if (job.status === 'running') {
    return hasCompleteJobLease(job) ? job.lease_expires_at : null;
  }
  if (job.status === 'queued' && !pickupHasRetryBudget(job)) {
    // A stale-sweep bug in older deployments could leave retry_count ===
    // max_retries queued. Waking that row would run work after its retry budget
    // was exhausted, so fail closed even when the row is old enough to retry.
    return null;
  }
  const anchor = Date.parse(job?.updated_at || job?.created_at || '');
  if (!Number.isFinite(anchor)) return null;
  const retryDelayMs =
    job?.worker_scope === 'preview' ? PREVIEW_PICKUP_RETRY_DELAY_MS : PICKUP_RETRY_DELAY_MS;
  return new Date(anchor + retryDelayMs).toISOString();
}

/**
 * Return only the worker-lease metadata the browser needs to decide whether a
 * pickup/recovery is appropriate. The job id, payload, error, retry counters,
 * and service data remain server-only.
 */
export function summarizeGoalWorkerPickup(
  goalStatus,
  job,
  { goalId = null, userId = null, deploymentIdentity = null, capabilitySecret = null } = {}
) {
  if (!RECONCILABLE_STATUSES.includes(goalStatus) || !job) return null;
  const retryAvailableAt = pickupRetryAvailableAt(job);
  if (!retryAvailableAt) return null;
  const capability = pickupCapabilityDigest(capabilitySecret, {
    goalStatus,
    goalId,
    userId,
    deploymentIdentity,
    job,
    retryAvailableAt,
  });
  return {
    status: job.status,
    worker_scope: job.worker_scope,
    ...(job.status === 'queued' ? { queued_at: job.created_at || null } : {}),
    updated_at: job.updated_at || job.created_at || null,
    retry_available_at: retryAvailableAt,
    ...(capability ? { capability } : {}),
  };
}

async function findScopedGoalWorkerJob(admin, goalId, workerScope, deploymentIdentity = null) {
  let query = admin
    .from('agent_jobs')
    .select(
      'id, status, worker_scope, retry_count, max_retries, created_at, updated_at, payload, lease_token, heartbeat_at, lease_expires_at'
    )
    .eq('worker_scope', workerScope)
    .contains('payload', { goalId });
  if (workerScope === 'preview') {
    query = query
      .in('status', ['queued', 'running'])
      .eq(`payload->>${WORKER_DEPLOYMENT_PAYLOAD_KEY}`, deploymentIdentity);
  } else {
    query = query.eq('status', 'queued');
  }
  if (workerScope === 'preview') {
    // `queued` sorts before `running`; make that priority explicit in SQL so
    // any number of recent running rows cannot hide an older queued sibling.
    query = query.order('status', { ascending: true });
  }
  const result = await query.order('updated_at', { ascending: false }).limit(1);
  if (result.error || workerScope !== 'preview') return result;

  // Preserve the established queued pickup behavior when a short-lived
  // running/queued overlap exists. Once the queue is empty, expose the newest
  // running lease so an open Preview can recover it after the shared timeout.
  const rows = result.data || [];
  const selected = rows.find((job) => job.status === 'queued') || rows[0] || null;
  return { ...result, data: selected ? [selected] : [] };
}

/**
 * Insert one durable worker row while retaining its exact identity for the
 * immediate wake-up. Supabase generates UUIDs by default, but relying on that
 * default forced callers to wake the untargeted shared queue unless they added
 * a read-back query. Pre-generating the UUID keeps every insert + wake pair
 * exact without changing worker-scope triggers or existing error handling.
 */
export async function enqueueGoalWorkerJob(
  admin,
  row,
  { env = process.env, jobId = randomUUID() } = {}
) {
  const userId = typeof row?.user_id === 'string' ? row.user_id.trim() : '';
  if (!userId) {
    const authorityError = new Error(
      'Goal worker enqueue requires an explicit durable user_id authority'
    );
    authorityError.code = 'AGENT_JOB_OWNER_REQUIRED';
    return { jobId, error: authorityError };
  }
  const rawPayload =
    row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? row.payload
      : {};
  for (const alias of ['_userId', 'userId', 'user_id']) {
    if (
      Object.hasOwn(rawPayload, alias) &&
      rawPayload[alias] != null &&
      rawPayload[alias] !== userId
    ) {
      const authorityError = new Error(
        `Goal worker enqueue ${alias} does not match durable user_id authority`
      );
      authorityError.code = 'AGENT_JOB_OWNER_MISMATCH';
      return { jobId, error: authorityError };
    }
  }
  const canonicalPayload = {
    ...rawPayload,
    _userId: userId,
    userId,
    user_id: userId,
  };
  const inserted = {
    ...row,
    user_id: userId,
    id: jobId,
    worker_scope: resolveWorkerScope(env),
    payload: bindJobPayloadToWorkerDeployment(canonicalPayload, env),
  };
  let insertError = null;
  try {
    const result = await admin.from('agent_jobs').insert(inserted);
    insertError = result?.error || null;
  } catch (error) {
    insertError = error;
  }
  if (!insertError) return { jobId, error: null };

  // A failed HTTP response does not prove PostgreSQL rejected the write. The
  // pre-generated id is the reconciliation key: inspect that exact row before
  // a caller is allowed to treat the enqueue as absent and submit fresh work.
  const inspection = await inspectExactGoalWorkerJob(admin, inserted);
  if (inspection.state === 'present') return { jobId, error: null };
  if (inspection.state === 'absent') return { jobId, error: insertError };

  const reconciliationError = new Error(
    `Goal worker enqueue outcome could not be reconciled safely (${inspection.state}); refresh before retrying`
  );
  reconciliationError.code = 'AGENT_JOB_ENQUEUE_RECONCILIATION_REQUIRED';
  reconciliationError.jobId = jobId;
  reconciliationError.reconciliationState = inspection.state;
  reconciliationError.cause = insertError;
  return { jobId, error: reconciliationError };
}

function canonicalGoalWorkerPayload(value) {
  if (Array.isArray(value)) return value.map(canonicalGoalWorkerPayload);
  if (!value || typeof value !== 'object') return value;
  const ordered = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) ordered[key] = canonicalGoalWorkerPayload(value[key]);
  }
  return ordered;
}

function goalWorkerRowsMatch(actual, expected) {
  if (actual?.id !== expected.id) return false;
  if (
    JSON.stringify(canonicalGoalWorkerPayload(actual?.payload || {})) !==
    JSON.stringify(canonicalGoalWorkerPayload(expected.payload || {}))
  ) {
    return false;
  }
  if (expected.user_id !== undefined && actual?.user_id !== expected.user_id) return false;
  if (expected.worker_scope !== undefined && actual?.worker_scope !== expected.worker_scope) {
    return false;
  }
  return true;
}

async function inspectExactGoalWorkerJob(admin, expected) {
  try {
    const query = admin.from('agent_jobs');
    if (typeof query?.select !== 'function') return { state: 'unknown' };
    const { data: existing, error } = await query
      .select('id, user_id, worker_scope, payload')
      .eq('id', expected.id)
      .maybeSingle();
    if (error) return { state: 'unknown', error };
    if (!existing) return { state: 'absent' };
    return goalWorkerRowsMatch(existing, expected)
      ? { state: 'present', row: existing }
      : { state: 'conflict', row: existing };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

function goalWorkerEnqueueNeedsReconciliation(error) {
  return error?.code === 'AGENT_JOB_ENQUEUE_RECONCILIATION_REQUIRED';
}

function goalWorkerEnqueueReconciliationFailure(error) {
  return {
    status: 503,
    error:
      `Goal worker enqueue outcome is unknown for job ${error?.jobId || 'unknown'}. ` +
      'Refresh the goal before taking another action.',
  };
}

async function inspectPreviewPickupTransition(
  admin,
  {
    jobId,
    goalId,
    deploymentIdentity,
    retryCount,
    originalUpdatedAt,
    originalLeaseToken,
    originalLeaseExpiresAt,
    transitionedAt,
  }
) {
  try {
    const { data: job, error } = await admin
      .from('agent_jobs')
      .select(
        'id, status, worker_scope, retry_count, error, updated_at, payload, lease_token, heartbeat_at, lease_expires_at'
      )
      .eq('id', jobId)
      .maybeSingle();
    if (error) return { state: 'unknown', error };
    if (!job) return { state: 'absent' };
    const exactPartition =
      job.id === jobId &&
      job.worker_scope === 'preview' &&
      job.payload?.goalId === goalId &&
      job.payload?.[WORKER_DEPLOYMENT_PAYLOAD_KEY] === deploymentIdentity;
    if (!exactPartition) return { state: 'conflict', job };
    if (
      job.status === 'failed' &&
      Number(job.retry_count) === Number(retryCount) &&
      job.error === 'Job timed out (stale — exceeded max retries)' &&
      job.updated_at === transitionedAt
    ) {
      return { state: 'terminalized', job };
    }
    if (
      job.status === 'running' &&
      Number(job.retry_count) === Number(retryCount) &&
      job.updated_at === originalUpdatedAt &&
      job.lease_token === originalLeaseToken &&
      job.lease_expires_at === originalLeaseExpiresAt
    ) {
      return { state: 'original', job };
    }
    if (job.status === 'queued' || job.status === 'running') {
      return { state: 'recoverable', job };
    }
    return { state: 'conflict', job };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

/**
 * Prove that the organization has at least one active, user-owned Agent Hub
 * member. The service-role client bypasses RLS, so both owner filters are
 * mandatory and an empty/stale mapping must fail closed.
 */
export async function validateOrganizationAgentCatalogue(admin, userId, orgId) {
  const { data: mappings, error: mappingError } = await admin
    .from('org_agents')
    .select('agent_id')
    .eq('org_id', orgId)
    .eq('user_id', userId);
  if (mappingError) {
    return {
      ok: false,
      status: 503,
      error: `Unable to verify the organization Agent Hub catalogue: ${mappingError.message}`,
    };
  }

  const mappedIds = [...new Set((mappings || []).map((row) => String(row.agent_id)))];
  if (mappedIds.length === 0) {
    return {
      ok: false,
      status: 409,
      error:
        'Assign at least one active Agent Hub agent to this organization before starting a goal',
    };
  }

  const { data: agents, error: agentError } = await admin
    .from('agents')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .in('id', mappedIds);
  if (agentError) {
    return {
      ok: false,
      status: 503,
      error: `Unable to verify active Agent Hub agents: ${agentError.message}`,
    };
  }

  const activeAgentIds = (agents || []).map((agent) => String(agent.id));
  if (activeAgentIds.length === 0) {
    return {
      ok: false,
      status: 409,
      error: 'The organization Agent Hub catalogue contains no active owned agents',
    };
  }
  return { ok: true, status: 200, agentIds: activeAgentIds };
}

function deterministicGoalCreateId(userId, sourceRequestId, testModel = null) {
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        'goal-create-v1',
        String(userId),
        String(sourceRequestId),
        testModel?.provider || null,
        testModel?.model || null,
      ])
    )
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function reconciledDuplicateGoalCreate(existing) {
  const reconciliation = existing?.data?.goal_handoff_reconciliation;
  if (reconciliation?.status === 'required' && reconciliation?.job_id) {
    return goalProcessingHandoffFailure({
      goalId: existing.id,
      jobId: reconciliation.job_id,
      reconciliationState: 'duplicate-create:parked',
      retrySafe: false,
    });
  }
  return {
    status: 200,
    data: { ...existing, idempotent: true },
  };
}

export async function handleCreate(
  admin,
  user,
  body,
  { kickProcessing = kickGoalProcessing } = {}
) {
  const {
    title,
    description,
    target_value,
    target_unit,
    budget_usd,
    parsed_category,
    parsed_priority,
    parsed_requirements,
    complexity,
    execution_mode,
    tool_mode,
    source_request_id,
    mode,
    po_depth,
    workflow_id,
    executor_type,
    org_id,
    executor_id,
    concilium_id,
    theory_mode,
    loop_enabled,
    compare_models,
    pm_strategy,
  } = body;
  if (!title) return { status: 400, error: 'title is required' };

  // Multi-model compare mode (dev/testing): create N identical goals, each
  // pinned to a different LLM via goal.data.test_model. Overridden in
  // execute-task.js selectModel() so every agent in that goal's pipeline
  // uses the same model — true apples-to-apples comparison. Dev UI only
  // exposes this on localhost; prod POSTs never include compare_models.
  //
  // local_only: true tells job-processor.claimNextJob to skip these jobs
  // when running on Vercel. Otherwise prod's cron would claim the first
  // feasibility-analysis job before localhost can, and for claude-code
  // goals it would then throw "localhost-only" (the provider guard). Even
  // for GLM/Qwen compare goals we want them to run locally so the user's
  // test environment (latency, tools) is consistent across all 3.
  if (Array.isArray(compare_models) && compare_models.length > 0) {
    const created = [];
    for (const spec of compare_models) {
      if (!spec?.provider || !spec?.model) continue;
      const suffix = spec.suffix || spec.model;
      const singleResult = await handleCreate(
        admin,
        user,
        {
          ...body,
          title: `${title} — (${suffix})`,
          compare_models: undefined,
          _test_model: { provider: spec.provider, model: spec.model },
          _local_only: true,
          // pm_strategy carries through from the spread so all N fan-out
          // goals use the same PM strategy (user picks one per submit).
        },
        { kickProcessing }
      );
      if (singleResult?.error) return singleResult;
      if (singleResult?.data) created.push(singleResult.data);
    }
    return { status: 201, data: { goals: created } };
  }

  const validExecutorTypes = ['organization', 'consilium', 'team', 'agent'];
  const safeExecutorType = validExecutorTypes.includes(executor_type)
    ? executor_type
    : 'organization';
  const safeToolMode = normalizeGoalToolMode(tool_mode);

  const budget = Number(budget_usd || 10);
  if (budget <= 0 || budget > 1000)
    return { status: 400, error: 'budget_usd must be between 0.01 and 1000' };

  const resolvedOrgId = await resolveGoalOrgId(admin, user.id, {
    orgId: org_id,
    parentGoalId: body.parent_goal_id,
  });

  // An explicitly selected organization is an authorization boundary. Never
  // degrade an invalid, inactive, or foreign organization to an unscoped goal.
  if (org_id !== undefined && org_id !== null && org_id !== '' && !resolvedOrgId) {
    return {
      status: 403,
      error: 'The selected organization is unavailable or does not belong to this account',
    };
  }
  const researchPolicy = normalizeGoalResearchPolicy(body);
  const researchPolicyError = validateGoalResearchPolicy(researchPolicy, body);
  if (researchPolicyError) return researchPolicyError;
  const evidenceAdmissionError = validateEvidenceProfileAdmissionCohort(
    researchPolicy,
    body,
    resolvedOrgId
  );
  if (evidenceAdmissionError) return evidenceAdmissionError;

  // Create goal
  const deterministicCreateId = source_request_id
    ? deterministicGoalCreateId(user.id, source_request_id, body._test_model)
    : null;
  const { data: insertedGoal, error: insertErr } = await admin
    .from('goals')
    .insert({
      ...(deterministicCreateId ? { id: deterministicCreateId } : {}),
      user_id: user.id,
      title,
      description: description || '',
      target_value: target_value || null,
      target_unit: target_unit || 'usd',
      budget_usd: budget,
      status: 'feasibility',
      // Iterate checks `goal.iteration >= goal.max_iterations` to stop
      // infinite replans. DB has a default but legacy rows have been seen
      // with null, which makes `n >= null` evaluate to false forever →
      // no stop. Guarantee a concrete ceiling on every new goal.
      //
      // Lowered from 5 → 3: in practice goals succeed in 1-2 iterations or
      // need human input. Iterations 4-5 almost never differ from 3 — the
      // same wall keeps getting hit. The Resolve & Resume UI exposes "More
      // iterations" so users can bump it when a goal legitimately needs more.
      max_iterations: 3,
      parsed_category: parsed_category || null,
      parsed_priority: parsed_priority || 'medium',
      parsed_requirements: parsed_requirements || '',
      complexity: normalizeGoalComplexity(complexity),
      execution_mode: execution_mode || 'auto',
      hitl_mode: normalizeGoalHitlMode(body.hitl_mode),
      source_request_id: source_request_id || null,
      mode: mode === 'advanced' ? 'advanced' : 'simple',
      po_depth: ['quick', 'standard', 'expert'].includes(po_depth) ? po_depth : 'standard',
      executor_type: safeExecutorType,
      org_id: resolvedOrgId,
      executor_id: executor_id || null,
      concilium_id: concilium_id || null,
      workflow_id: workflow_id || null,
      theory_mode: theory_mode === true,
      loop_enabled: loop_enabled === true,
      // test_model pins every agent call to one LLM (used by compare_models
      // to run 3 goals in parallel with different providers).
      // local_only tells job-processor.claimNextJob on Vercel to skip this
      // goal's jobs so the localhost worker claims them. Both set via
      // internal _prefixed args from the fan-out branch above; never
      // accepted from external API callers directly.
      data: {
        tool_mode: safeToolMode,
        research_policy: researchPolicy,
        ...(body._test_model ? { test_model: body._test_model } : {}),
        ...(body._local_only ? { local_only: true } : {}),
        ...(pm_strategy === 'ralph' ? { pm_strategy: 'ralph' } : {}),
      },
    })
    .select(
      'id, title, status, budget_usd, complexity, execution_mode, hitl_mode, executor_type, org_id, executor_id, concilium_id, source_request_id, created_at, data, loop_enabled, loop_chain_root_id'
    )
    .single();

  let goal = insertedGoal;
  if (insertErr && deterministicCreateId && insertErr.code === '23505') {
    const { data: existing, error: inspectError } = await admin
      .from('goals')
      .select(
        'id, title, status, budget_usd, complexity, execution_mode, hitl_mode, executor_type, org_id, executor_id, concilium_id, source_request_id, created_at, data, loop_enabled, loop_chain_root_id'
      )
      .eq('id', deterministicCreateId)
      .eq('user_id', user.id)
      .eq('source_request_id', source_request_id)
      .maybeSingle();
    if (inspectError) throw inspectError;
    if (existing) return reconciledDuplicateGoalCreate(existing);
  }
  if (insertErr) throw insertErr;

  // Self-root the loop chain on the very first goal of any new chain.
  // Continuation goals get loop_chain_root_id pre-filled by the spawn
  // helper, but a hand-created goal with loop_enabled = true has no root
  // yet — set it to itself so chain_spend_v rolls up correctly from
  // day one.
  if (!goal.loop_chain_root_id) {
    await admin.from('goals').update({ loop_chain_root_id: goal.id }).eq('id', goal.id);
    goal.loop_chain_root_id = goal.id;
  }

  // Enqueue first pipeline action based on mode
  // New pipeline: feasibility-analysis → po-analysis → pm-planning → ...
  // Legacy: plan (monolithic, for backward compat — will be removed)
  const useNewPipeline = true; // Feature flag: set to false to revert to legacy
  const firstAction = useNewPipeline ? 'feasibility-analysis' : 'plan';

  const { jobId, error: enqueueErr } = await enqueueGoalWorkerJob(admin, {
    user_id: user.id,
    status: 'queued',
    payload: {
      type: 'orchestrate-goal',
      action: firstAction,
      goalId: goal.id,
      _userId: user.id,
      context: {
        parsed_category: parsed_category || null,
        parsed_priority: parsed_priority || 'medium',
        parsed_requirements: parsed_requirements || '',
        tool_mode: safeToolMode,
        executor_type: safeExecutorType,
        org_id: resolvedOrgId,
        executor_id: executor_id || null,
        concilium_id: concilium_id || null,
      },
    },
  });

  if (enqueueErr) {
    if (goalWorkerEnqueueNeedsReconciliation(enqueueErr)) {
      return goalWorkerEnqueueReconciliationFailure(enqueueErr);
    }
    log.error(null, 'goal.enqueue.failed', { goalId: goal.id, error: enqueueErr.message });
    // Mark goal as failed so user sees it, not stuck in planning forever
    await admin.from('goals').update({ status: 'failed' }).eq('id', goal.id);
    throw new Error(`Failed to enqueue planning: ${enqueueErr.message}`);
  }

  // Log creation
  await admin
    .from('goal_log')
    .insert({
      goal_id: goal.id,
      event_type: 'goal_created',
      details: { title, budget_usd: budget },
    })
    .then(({ error }) => {
      if (error) log.warn(null, 'goal.log.failed', { goalId: goal.id, error: error.message });
    });

  const handoff = await requestGoalProcessingHandoff(admin, goal.id, {
    jobId,
    userId: user.id,
    kickProcessing,
    operation: 'create',
  });
  if (!handoff.ok) return goalProcessingHandoffFailure(handoff);

  return { status: 201, data: goal };
}

export function normalizeGoalToolMode(value) {
  return ['with_tools', 'no_tools', 'existing_only'].includes(value) ? value : 'with_tools';
}

const RESEARCH_MODES = new Set(['instant', 'grounded_fast', 'grounded_deep', 'auto']);

export function normalizeGoalResearchPolicy(body = {}) {
  const suppliedMode = String(body.research_mode || '').trim();
  const location = String(body.research_location || '')
    .trim()
    .slice(0, 500);
  // The current Smart Request UI always sends an explicit research contract.
  // Keep older API/mobile clients backward compatible: mode="advanced" alone
  // must not silently opt them into a location-required external workflow.
  const explicitResearchContract = [
    body.research_mode,
    body.research_required,
    body.grounding_required,
    body.research_fail_closed,
    body.research_location,
    body.research_market_scope,
    body.research_intent,
    body.requested_execution_roles,
    body.business_evidence_profile,
    body.business_evidence_profile_hash,
  ].some((value) => value !== undefined);
  const defaultMode =
    explicitResearchContract && body.mode === 'advanced' ? 'grounded_deep' : 'instant';
  let marketScope = location ? resolveMarketExpression(location) : null;
  if (marketScope && body.research_market_scope?.confirmation?.confirmed === true) {
    marketScope = confirmMarketScope(marketScope);
  }
  const hashPayload = marketScopeHashPayload(marketScope);
  const marketScopeHash = hashPayload
    ? createHash('sha256').update(JSON.stringify(hashPayload)).digest('hex')
    : null;
  if (marketScope && marketScopeHash) marketScope.resolution_hash = marketScopeHash;
  let evidenceProfile = null;
  if (
    body.mode === 'advanced' &&
    body.business_evidence_profile &&
    typeof body.business_evidence_profile === 'object' &&
    !Array.isArray(body.business_evidence_profile)
  ) {
    try {
      const candidateProfile = createBusinessEvidenceProfile(body.business_evidence_profile, {
        marketScopeHash,
      });
      if (evidenceProfileV2EnabledForModel(candidateProfile.economic_model)) {
        evidenceProfile = candidateProfile;
      }
    } catch {
      // Validation below returns a stable 400 response. Do not persist a
      // partially-normalized profile when its contract is malformed.
      evidenceProfile = null;
    }
  }
  const evidenceContract = evidenceProfile
    ? {
        evidence_contract_version: 2,
        intent: evidenceProfile.intent,
        business_evidence_profile: evidenceProfile,
        business_evidence_profile_hash: businessEvidenceProfileHash(evidenceProfile),
        required_role_slots: [...evidenceProfile.required_role_slots],
        requested_execution_roles: executionRolesForEvidenceProfile(evidenceProfile),
      }
    : null;
  // Commercial authority requirements and the typed business-evidence
  // profile are independent, additive contracts. Keep the buyer/critical
  // claim policy for v2 while letting the later evidence contract own the
  // dynamic role slots and requested executor roles.
  // A v2 profile is itself an authoritative declaration of intent. The UI is
  // allowed to omit the redundant top-level research_intent, so derive the
  // additive commercial policy from the canonical profile when it exists.
  // validateGoalResearchPolicy rejects callers that supply contradictory
  // top-level and profile intents before anything is persisted.
  const commercialContract =
    body.mode === 'advanced'
      ? commercialResearchPolicyContract(
          evidenceProfile ? { research_intent: evidenceProfile.intent } : body
        )
      : null;
  const researchMode = RESEARCH_MODES.has(suppliedMode) ? suppliedMode : defaultMode;
  const groundingRequired =
    typeof body.grounding_required === 'boolean'
      ? body.grounding_required
      : explicitResearchContract && defaultMode !== 'instant';
  const researchRequired =
    body.research_required === true ||
    groundingRequired ||
    ['grounded_fast', 'grounded_deep'].includes(researchMode);
  return {
    version: marketScope ? 2 : 1,
    research_mode: researchMode,
    required: researchRequired,
    grounding_required: groundingRequired,
    research_fail_closed:
      typeof body.research_fail_closed === 'boolean'
        ? body.research_fail_closed
        : explicitResearchContract && body.mode === 'advanced',
    location: location || null,
    ...(commercialContract || {}),
    ...(evidenceContract || {}),
    ...(body.requested_execution_roles !== undefined && !evidenceContract
      ? {
          requested_execution_roles: [...new Set(body.requested_execution_roles.map(String))],
          requested_execution_roles_source: 'owner_request',
        }
      : {}),
    ...(marketScope ? { market_scope: marketScope, market_scope_hash: marketScopeHash } : {}),
  };
}

function validateLiveEvidenceProfileAdmission(profile, policy) {
  // `none` is a deliberately empty v2 envelope and needs no acquisition adapter.
  if (profile.economic_model === 'none') return null;

  // Keep this admission boundary aligned with the adapters AxWise can execute
  // today. The broad profile schema stays model-agnostic for future adapters.
  if (profile.economic_model !== 'physical_product') {
    return {
      status: 400,
      error: `business_evidence_profile economic_model ${profile.economic_model} does not have a live AxWise projection adapter`,
    };
  }

  const [offerRequirement] = profile.fact_requirements;
  if (
    profile.fact_requirements.length !== 1 ||
    offerRequirement?.kind !== 'physical_product_offer' ||
    offerRequirement?.applicability !== 'required' ||
    !Number.isInteger(offerRequirement?.minimum_verified) ||
    offerRequirement.minimum_verified < 1
  ) {
    return {
      status: 400,
      error:
        'The live physical_product adapter requires one required physical_product_offer requirement with minimum_verified >= 1',
    };
  }

  if (profile.calculation_requirements.length > 1) {
    return {
      status: 400,
      error: 'The live physical_product adapter supports at most one price-difference calculation',
    };
  }
  const [calculationRequirement] = profile.calculation_requirements;
  if (
    calculationRequirement &&
    (calculationRequirement.kind !== 'physical_offer_price_difference' ||
      calculationRequirement.applicability !== 'required' ||
      calculationRequirement.minimum_verified !== 1)
  ) {
    return {
      status: 400,
      error:
        'The live physical_product adapter requires physical_offer_price_difference to be required with minimum_verified 1',
    };
  }
  if (calculationRequirement && offerRequirement.minimum_verified < 2) {
    return {
      status: 400,
      error: 'Physical offer price differences require at least two verified offers',
    };
  }
  if (!['grounded_fast', 'grounded_deep'].includes(policy.research_mode)) {
    return {
      status: 400,
      error: 'The live physical_product adapter requires grounded_fast or grounded_deep research',
    };
  }
  if (policy.grounding_required !== true || policy.research_fail_closed !== true) {
    return {
      status: 400,
      error:
        'The live physical_product adapter requires grounding_required and fail-closed research',
    };
  }
  return null;
}

function validateGoalResearchPolicy(policy, body = {}) {
  const suppliedMode = String(body.research_mode || '').trim();
  if (suppliedMode && !RESEARCH_MODES.has(suppliedMode)) {
    return {
      status: 400,
      error: `research_mode must be one of ${[...RESEARCH_MODES].join(', ')}`,
    };
  }
  for (const field of ['research_required', 'grounding_required', 'research_fail_closed']) {
    if (body[field] !== undefined && typeof body[field] !== 'boolean') {
      return { status: 400, error: `${field} must be a boolean` };
    }
  }
  if (body.research_location !== undefined && typeof body.research_location !== 'string') {
    return { status: 400, error: 'research_location must be a string' };
  }
  if (
    body.research_market_scope !== undefined &&
    (!body.research_market_scope ||
      typeof body.research_market_scope !== 'object' ||
      Array.isArray(body.research_market_scope))
  ) {
    return { status: 400, error: 'research_market_scope must be an object' };
  }
  const suppliedEvidenceProfile = body.business_evidence_profile;
  if (suppliedEvidenceProfile !== undefined) {
    if (!evidenceProfileV2Enabled()) {
      return {
        status: 400,
        error:
          'business_evidence_profile requires AXWISE_EVIDENCE_PROFILE_V2_ENABLED; the v2 contract is disabled',
      };
    }
    if (body.mode !== 'advanced') {
      return { status: 400, error: 'business_evidence_profile requires advanced mode' };
    }
    const profileValidation = validateBusinessEvidenceProfile(suppliedEvidenceProfile, {
      expectedMarketScopeHash: policy.market_scope_hash || null,
    });
    if (!profileValidation.ok) {
      return {
        status: 400,
        error: `Invalid business_evidence_profile: ${profileValidation.issues
          .map((item) => item.message)
          .join('; ')}`,
      };
    }
    const canonicalProfile = createBusinessEvidenceProfile(suppliedEvidenceProfile, {
      marketScopeHash: policy.market_scope_hash || null,
    });
    if (!evidenceProfileV2EnabledForModel(canonicalProfile.economic_model)) {
      return {
        status: 400,
        error:
          `business_evidence_profile economic_model ${canonicalProfile.economic_model} is not enabled by ` +
          'AXWISE_EVIDENCE_PROFILE_V2_ENABLED_MODELS',
      };
    }
    const liveCapabilityError = validateLiveEvidenceProfileAdmission(canonicalProfile, policy);
    if (liveCapabilityError) return liveCapabilityError;
    if (body.research_intent !== undefined && body.research_intent !== canonicalProfile.intent) {
      return { status: 400, error: 'research_intent must match business_evidence_profile.intent' };
    }
    if (
      body.business_evidence_profile_hash !== undefined &&
      body.business_evidence_profile_hash !== businessEvidenceProfileHash(canonicalProfile)
    ) {
      return { status: 400, error: 'business_evidence_profile_hash does not match the profile' };
    }
    if (body.requested_execution_roles !== undefined) {
      if (!Array.isArray(body.requested_execution_roles)) {
        return { status: 400, error: 'requested_execution_roles must be an array' };
      }
      const expectedRoles = [...executionRolesForEvidenceProfile(canonicalProfile)].sort();
      const suppliedRoles = [...new Set(body.requested_execution_roles.map(String))].sort();
      if (
        expectedRoles.length !== suppliedRoles.length ||
        expectedRoles.some((role, index) => role !== suppliedRoles[index])
      ) {
        return {
          status: 400,
          error: 'requested_execution_roles must match business_evidence_profile role slots',
        };
      }
    }
  } else {
    if (
      body.research_intent !== undefined &&
      body.research_intent !== COMMERCIAL_MARKET_LAUNCH_INTENT
    ) {
      return {
        status: 400,
        error: `research_intent must be ${COMMERCIAL_MARKET_LAUNCH_INTENT}`,
      };
    }
    if (body.requested_execution_roles !== undefined) {
      if (!Array.isArray(body.requested_execution_roles)) {
        return { status: 400, error: 'requested_execution_roles must be an array' };
      }
      const normalized = [...new Set(body.requested_execution_roles.map((role) => String(role)))];
      if (
        normalized.length !== COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES.length ||
        COMMERCIAL_MARKET_LAUNCH_EXECUTION_ROLES.some((role) => !normalized.includes(role))
      ) {
        return {
          status: 400,
          error: 'Commercial market launch research requires the canonical five executor roles',
        };
      }
    }
  }
  const grounded =
    policy.grounding_required || ['grounded_fast', 'grounded_deep'].includes(policy.research_mode);
  if (policy.research_mode === 'instant' && policy.grounding_required) {
    return { status: 400, error: 'instant research cannot require grounding' };
  }
  if (policy.research_mode.startsWith('grounded_') && !policy.grounding_required) {
    return { status: 400, error: 'grounded research modes require grounding_required' };
  }
  if (grounded && !policy.research_fail_closed) {
    return { status: 400, error: 'grounded research must fail closed' };
  }
  if (policy.required && !policy.research_fail_closed) {
    return { status: 400, error: 'required research must fail closed' };
  }
  if (!policy.location && grounded) {
    return {
      status: 400,
      error: 'research_location is required for grounded research',
    };
  }
  if (grounded && !marketScopeReady(policy.market_scope)) {
    const ambiguity = policy.market_scope?.ambiguities?.[0];
    return {
      status: 400,
      error: ambiguity
        ? `Research market needs confirmation: ${ambiguity.raw_expression}`
        : 'Research market must resolve to at least one confirmed country',
    };
  }
  return null;
}

function validateEvidenceProfileAdmissionCohort(policy, body, resolvedOrgId) {
  if (body?.business_evidence_profile === undefined) return null;
  if (
    !policy?.business_evidence_profile ||
    !evidenceProfileV2AdmissionEnabledForOrg(resolvedOrgId)
  ) {
    return {
      status: 403,
      error: 'business_evidence_profile is not enabled for the resolved organization',
    };
  }
  return null;
}

const PHYSICAL_PRODUCT_EVIDENCE_PROFILE_INPUT = Object.freeze({
  intent: COMMERCIAL_MARKET_LAUNCH_INTENT,
  economic_model: 'physical_product',
  fact_requirements: Object.freeze([
    Object.freeze({
      kind: 'physical_product_offer',
      minimum_verified: 2,
      applicability: 'required',
    }),
  ]),
  calculation_requirements: Object.freeze([
    Object.freeze({
      kind: 'physical_offer_price_difference',
      minimum_verified: 1,
      applicability: 'required',
    }),
  ]),
  required_role_slots: Object.freeze([
    'customer_market',
    'pricing_finance',
    'legal_compliance',
    'sales_distribution',
    'risk_operations',
  ]),
});

/**
 * Prepare the one physical-product evidence profile that the production UI can
 * currently opt into. This operation is intentionally read-only: it proves the
 * authenticated user owns the selected organization, checks the live rollout
 * cohort and flags, resolves a grounded market, and returns canonical hashes.
 * Goal creation repeats every check; this response is not an authorization
 * token and cannot bypass the create boundary.
 */
export async function handlePreparePhysicalEvidenceProfile(admin, user, body = {}) {
  if (body.mode !== 'advanced') {
    return { status: 400, error: 'Physical evidence profiles require advanced mode' };
  }
  const requestedOrgId = String(body.org_id || '').trim();
  if (!requestedOrgId) return { status: 400, error: 'org_id is required' };

  const resolvedOrgId = await resolveGoalOrgId(admin, user.id, { orgId: requestedOrgId });
  if (!resolvedOrgId) {
    return {
      status: 403,
      error: 'The selected organization is inactive or is not owned by the authenticated user',
    };
  }
  if (!evidenceProfileV2EnabledForModel('physical_product')) {
    return {
      status: 409,
      error: 'Physical-product evidence profile admission is not enabled',
    };
  }
  if (!evidenceProfileV2AdmissionEnabledForOrg(resolvedOrgId)) {
    return {
      status: 403,
      error: 'Physical-product evidence profiles are not enabled for this organization',
    };
  }

  const policy = normalizeGoalResearchPolicy(body);
  const policyError = validateGoalResearchPolicy(policy, body);
  if (policyError) return policyError;
  if (!policy.market_scope_hash || !marketScopeReady(policy.market_scope)) {
    return {
      status: 400,
      error: 'A confirmed grounded research market is required for physical evidence',
    };
  }

  const profile = createBusinessEvidenceProfile(PHYSICAL_PRODUCT_EVIDENCE_PROFILE_INPUT, {
    marketScopeHash: policy.market_scope_hash,
  });
  const liveCapabilityError = validateLiveEvidenceProfileAdmission(profile, policy);
  if (liveCapabilityError) return liveCapabilityError;

  const profileHash = businessEvidenceProfileHash(profile);
  const requestedExecutionRoles = executionRolesForEvidenceProfile(profile);
  return {
    status: 200,
    data: {
      research_intent: profile.intent,
      business_evidence_profile: profile,
      business_evidence_profile_hash: profileHash,
      requested_execution_roles: requestedExecutionRoles,
      market_scope_hash: policy.market_scope_hash,
      binding: {
        org_id: resolvedOrgId,
        research_mode: policy.research_mode,
        market_scope_hash: policy.market_scope_hash,
      },
    },
  };
}

/**
 * Hand a newly queued goal to the worker without making the create request
 * wait for an LLM stage.
 *
 * Production has a durable Vercel Cron consumer, so it retains the short
 * inline head start used by the existing flow. Preview deployments do not run
 * Vercel Cron. They must wake their own authenticated process-next endpoint
 * immediately; otherwise the serverless request freezes after the response
 * and the isolated Preview queue never advances.
 */
export async function kickGoalProcessing(
  admin,
  goalId,
  {
    env = process.env,
    processNext = processNextJob,
    trigger = triggerProcessNext,
    setTimeoutImpl = setTimeout,
    jobId = null,
  } = {}
) {
  const wakeWorker = () => (jobId ? trigger({ jobId }) : trigger());
  if (env.VERCEL_ENV === 'preview') {
    // Preview has no Cron safety net. Route exact producer handoffs through
    // the shared acknowledged wake boundary so an undispatchable row is
    // terminalized before the producer is allowed to compensate its goal.
    // Untargeted calls are retained only for the legacy diagnostic helper;
    // every lifecycle producer below supplies a durable job id.
    let triggered;
    if (jobId) {
      const { wakeAgentJobExact } = await import('../goal-handlers/_helpers.js');
      const wake = await wakeAgentJobExact(
        admin,
        { id: jobId },
        {
          triggerProcessNextImpl: trigger,
          env,
        }
      );
      triggered = wake?.triggered === true;
    } else {
      triggered = await wakeWorker();
    }
    if (!triggered) {
      log.warn(null, 'goal.preview-worker.trigger-skipped', { goalId });
    }
    return { mode: 'preview-worker', triggered };
  }

  // Kick off processing. The previous design `await`-ed this fully, which made
  // POST /goals block until feasibility-analysis (an LLM call) completed —
  // 30-60s per goal, 3× in compare-mode fan-out, so the dialog timed out at
  // 60s even though the goal was created in the first second.
  const processingPromise = (
    jobId ? processNext(admin, null, jobId) : processNext(admin, null)
  ).catch((error) => {
    log.warn(null, 'goal.inline-processing.failed', { goalId, error: error.message });
  });
  if (env.VERCEL) {
    await Promise.race([
      processingPromise,
      new Promise((resolve) => setTimeoutImpl(resolve, 8000)),
    ]);
  }
  // Local development has its own polling worker. Production gets a delayed
  // optimization in addition to its durable Cron consumer.
  setTimeoutImpl(wakeWorker, 2000);
  return { mode: env.VERCEL ? 'production-inline' : 'local-inline', triggered: true };
}

function goalProcessingHandoffFailure(handoff) {
  const retrySafe = handoff?.retrySafe === true;
  return {
    status: 503,
    error: retrySafe
      ? 'Goal processing could not be handed to the Preview worker. The exact goal state was restored; refresh and retry.'
      : 'Goal processing could not be handed to the Preview worker. Reconciliation is required; refresh and do not create replacement work.',
    data: {
      goal_id: handoff?.goalId || null,
      job_id: handoff?.jobId || null,
      reconciliation_state: handoff?.reconciliationState || 'unknown',
      retry_safe: retrySafe,
    },
  };
}

export function sendGoalHandlerResult(res, result) {
  if (!result.error) return res.status(result.status).json(result.data);
  // Reconciliation failures intentionally carry durable identities. Do not
  // collapse them through jsonError: the browser must refresh the exact
  // goal/job instead of blindly creating replacement work after a 503.
  if (result.data !== undefined) {
    return res.status(result.status).json({
      error: result.error,
      data: result.data,
      ...(result.data?.goal_id ? { goal_id: result.data.goal_id } : {}),
      ...(result.data?.job_id ? { job_id: result.data.job_id } : {}),
    });
  }
  return jsonError(res, result.status, result.error);
}

const PREVIEW_HANDOFF_FAILURE = 'Preview exact goal handoff was unavailable';
const SHARED_PREVIEW_WAKE_FAILURE = 'Preview exact worker wake was unavailable';
const TERMINAL_GOAL_STATUSES = new Set([
  'completed',
  'completed_with_warnings',
  'failed',
  'cancelled',
]);

function previewHandoffJobMatches(job, { goalId, jobId, deploymentIdentity }) {
  if (job?.id !== jobId || job?.worker_scope !== 'preview') return false;
  if (String(job?.payload?.goalId || '') !== String(goalId)) return false;
  return (
    !deploymentIdentity || job?.payload?.[WORKER_DEPLOYMENT_PAYLOAD_KEY] === deploymentIdentity
  );
}

function safelyTerminalizedPreviewHandoff(job) {
  return (
    job?.status === 'failed' &&
    (job?.error === SHARED_PREVIEW_WAKE_FAILURE ||
      String(job?.error || '').startsWith(`${PREVIEW_HANDOFF_FAILURE}:`))
  );
}

async function inspectPreviewGoalHandoffJob(admin, { goalId, jobId, deploymentIdentity }) {
  try {
    const { data: job, error } = await admin
      .from('agent_jobs')
      .select('id, status, worker_scope, error, updated_at, payload')
      .eq('id', jobId)
      .maybeSingle();
    if (error) return { state: 'unknown', error };
    if (!job) return { state: 'absent' };
    if (!previewHandoffJobMatches(job, { goalId, jobId, deploymentIdentity })) {
      return { state: 'conflict', job };
    }
    if (safelyTerminalizedPreviewHandoff(job)) return { state: 'terminalized-safe', job };
    if (job.status === 'queued') return { state: 'queued', job };
    if (job.status === 'running') return { state: 'leased', job };
    return { state: 'terminalized-unsafe', job };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function terminalizeRejectedPreviewGoalHandoff(
  admin,
  { goalId, jobId, operation, deploymentIdentity }
) {
  const terminalizedAt = new Date().toISOString();
  const failure = `${PREVIEW_HANDOFF_FAILURE}: ${operation}`;
  try {
    let transition = admin
      .from('agent_jobs')
      .update({ status: 'failed', error: failure, updated_at: terminalizedAt })
      .eq('id', jobId)
      .eq('status', 'queued')
      .eq('worker_scope', 'preview')
      .eq('payload->>goalId', String(goalId));
    if (deploymentIdentity) {
      transition = transition.eq(`payload->>${WORKER_DEPLOYMENT_PAYLOAD_KEY}`, deploymentIdentity);
    }
    const { data: terminalized, error } = await transition
      .select('id, status, error')
      .maybeSingle();
    if (
      !error &&
      terminalized?.id === jobId &&
      terminalized?.status === 'failed' &&
      terminalized?.error === failure
    ) {
      return { state: 'terminalized-safe', job: terminalized };
    }
  } catch (error) {
    log.warn(null, 'goal.processing-handoff.terminalize-failed', {
      goalId,
      jobId,
      operation,
      error: error?.message || String(error),
    });
  }
  return inspectPreviewGoalHandoffJob(admin, { goalId, jobId, deploymentIdentity });
}

async function parkGoalForHandoffReconciliation(
  admin,
  { goalId, jobId, userId, operation, jobState }
) {
  try {
    let load = admin.from('goals').select('id, user_id, status, data, updated_at').eq('id', goalId);
    if (userId) load = load.eq('user_id', userId);
    const { data: current, error: loadError } = await load.maybeSingle();
    if (loadError || !current) {
      return { state: 'goal-reconciliation-unverified', error: loadError || null };
    }
    if (TERMINAL_GOAL_STATUSES.has(current.status) || current.status === 'needs_human') {
      return { state: current.status === 'needs_human' ? 'parked' : 'goal-terminal' };
    }

    const parkedAt = new Date().toISOString();
    const parkedData = {
      ...(current.data || {}),
      failure_code: 'preview_goal_handoff_reconciliation_required',
      failure_reason:
        'Preview worker handoff could not be verified. Review this goal before retrying.',
      failure_at: parkedAt,
      goal_handoff_reconciliation: {
        version: 1,
        status: 'required',
        operation,
        job_id: jobId,
        job_state: jobState,
        parked_at: parkedAt,
      },
    };
    let park = admin
      .from('goals')
      .update({ status: 'needs_human', data: parkedData, updated_at: parkedAt })
      .eq('id', goalId)
      .eq('status', current.status);
    if (userId) park = park.eq('user_id', userId);
    if (current.updated_at) park = park.eq('updated_at', current.updated_at);
    const { data: parked, error: parkError } = await park.select('id, status').maybeSingle();
    if (!parkError && parked?.id === goalId && parked?.status === 'needs_human') {
      return { state: 'parked' };
    }
    return { state: 'goal-reconciliation-unverified', error: parkError || null };
  } catch (error) {
    return { state: 'goal-reconciliation-unverified', error };
  }
}

function goalSnapshotValueMatches(actual, expected) {
  if (expected === undefined) return true;
  if (typeof expected === 'object' && expected !== null) {
    return isDeepStrictEqual(actual ?? null, expected);
  }
  return actual === expected || String(actual) === String(expected);
}

async function inspectRestoredGoalHandoffSnapshot(admin, { goalId, userId, restore }) {
  try {
    let query = admin.from('goals').select('*').eq('id', goalId);
    if (userId) query = query.eq('user_id', userId);
    const { data: current, error } = await query.maybeSingle();
    if (error || !current) return false;
    return Object.entries(restore).every(([field, expected]) =>
      goalSnapshotValueMatches(current[field], expected)
    );
  } catch {
    return false;
  }
}

async function rollbackExactGoalHandoff(
  admin,
  { goalId, userId, expectedStatus, expectedUpdatedAt = null, expectedFilters = [], restore }
) {
  const restoredAt = new Date().toISOString();
  try {
    let rollback = admin
      .from('goals')
      .update({ ...restore, updated_at: restoredAt })
      .eq('id', goalId)
      .eq('status', expectedStatus);
    if (userId) rollback = rollback.eq('user_id', userId);
    if (expectedUpdatedAt) rollback = rollback.eq('updated_at', expectedUpdatedAt);
    for (const [method, field, value] of expectedFilters) {
      if (method === 'is') rollback = rollback.is(field, value);
      else rollback = rollback.eq(field, value);
    }
    const { data: rolledBack, error } = await rollback.select('id, status').maybeSingle();
    if (!error && rolledBack?.id === goalId && rolledBack?.status === restore.status) return true;
  } catch {
    // Verify below: a transport failure can hide a committed exact rollback.
  }
  return inspectRestoredGoalHandoffSnapshot(admin, { goalId, userId, restore });
}

async function verifyUnchangedGoalHandoff(
  admin,
  { goalId, userId, status, updatedAt = null, data = undefined }
) {
  try {
    let query = admin
      .from('goals')
      .select('id, user_id, status, data, updated_at')
      .eq('id', goalId);
    if (userId) query = query.eq('user_id', userId);
    const { data: current, error } = await query.maybeSingle();
    if (error || !current || current.status !== status) return false;
    if (updatedAt && Date.parse(current.updated_at) !== Date.parse(updatedAt)) return false;
    return data === undefined || isDeepStrictEqual(current.data || {}, data || {});
  } catch {
    return false;
  }
}

/**
 * Convert the exact Preview wake into an acknowledged producer boundary.
 * Production/local have a durable consumer and `kickGoalProcessing` reports
 * them as accepted. Preview has no Cron fallback, so an explicit rejected or
 * terminalized handoff, or a thrown exact-wake error, must never be presented
 * to the browser as a successful lifecycle mutation.
 */
async function requestGoalProcessingHandoff(
  admin,
  goalId,
  {
    jobId,
    userId = null,
    env = process.env,
    kickProcessing = kickGoalProcessing,
    operation = 'goal-processing',
    rollbackGoalOnSafeFailure = null,
  }
) {
  let handoff = null;
  let handoffError = null;
  try {
    handoff = await kickProcessing(admin, goalId, { jobId });
  } catch (error) {
    handoffError = error;
  }

  if (!handoffError && handoff?.triggered === true && handoff?.terminalized !== true) {
    return { ok: true, handoff };
  }

  log.warn(
    null,
    handoffError ? 'goal.processing-handoff.failed' : 'goal.processing-handoff.rejected',
    {
      goalId,
      jobId,
      operation,
      triggered: handoff?.triggered,
      terminalized: handoff?.terminalized === true,
      ...(handoffError ? { error: handoffError?.message || String(handoffError) } : {}),
    }
  );

  const previewFailure =
    resolveWorkerScope(env) === 'preview' || handoff?.mode === 'preview-worker';
  const deploymentIdentity = resolveWorkerDeploymentIdentity(env);
  let jobRecovery = previewFailure
    ? await inspectPreviewGoalHandoffJob(admin, { goalId, jobId, deploymentIdentity })
    : { state: 'unknown' };
  if (previewFailure && jobRecovery.state === 'queued') {
    jobRecovery = await terminalizeRejectedPreviewGoalHandoff(admin, {
      goalId,
      jobId,
      operation,
      deploymentIdentity,
    });
  }

  let goalRecovery = null;
  if (jobRecovery.state === 'terminalized-safe' && rollbackGoalOnSafeFailure) {
    log.warn(null, 'goal.processing-handoff.failed', {
      goalId,
      jobId,
      operation,
      error: handoffError?.message || 'exact Preview wake rejected',
    });
    try {
      const rollback = await rollbackGoalOnSafeFailure();
      if (rollback === true || rollback?.ok === true) {
        goalRecovery = { state: 'rolled-back' };
      }
    } catch (rollbackError) {
      log.error(null, 'goal.processing-handoff.rollback-failed', {
        goalId,
        jobId,
        operation,
        error: rollbackError?.message || String(rollbackError),
      });
    }
  }
  if (!goalRecovery) {
    goalRecovery = await parkGoalForHandoffReconciliation(admin, {
      goalId,
      jobId,
      userId,
      operation,
      jobState: jobRecovery.state,
    });
  }

  const reconciliationState = `${jobRecovery.state}:${goalRecovery.state}`;
  return {
    ok: false,
    handoff,
    error: handoffError,
    goalId,
    jobId,
    reconciliationState,
    retrySafe: jobRecovery.state === 'terminalized-safe' && goalRecovery.state === 'rolled-back',
  };
}

/**
 * Re-wake the worker for a job that already exists in the current Preview
 * partition. Queued rows are woken without mutation. A running row is eligible
 * only after the shared stale-lease window and is transitioned with an exact
 * lease-snapshot CAS before its row can be woken. This is intentionally not a
 * generic retry: it never creates a goal/job and refuses human gates, terminal
 * states, fresh work, foreign goals, and work owned by another deployment.
 */
export async function handleRetryPickup(
  admin,
  user,
  request,
  {
    workerScope = resolveWorkerScope(),
    deploymentIdentity = resolveWorkerDeploymentIdentity(),
    capabilitySecret = process.env.WORKER_SECRET,
    kickProcessing = kickGoalProcessing,
    now = () => Date.now(),
  } = {}
) {
  const id = request?.id;
  const providedCapability = String(request?.pickup_capability || '').trim();
  if (!id) return { status: 400, error: 'id is required' };

  // Ownership is established before the service-role client inspects the
  // cross-user queue. A foreign id is indistinguishable from a missing goal.
  const { data: goal, error: goalError } = await admin
    .from('goals')
    .select('id, status, data, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (goalError) {
    return { status: 503, error: 'Unable to verify this goal before retrying pickup' };
  }
  if (!goal) return { status: 404, error: 'Goal not found' };

  if (workerScope !== 'preview') {
    return {
      status: 409,
      error: 'Manual worker pickup is only available for Preview deployments',
    };
  }
  if (!RECONCILABLE_STATUSES.includes(goal.status)) {
    return {
      status: 409,
      error: `Goal status ${goal.status} cannot be picked up automatically`,
    };
  }
  if (!deploymentIdentity) {
    return { status: 503, error: 'Preview deployment identity is unavailable' };
  }
  if (!String(capabilitySecret || '').trim()) {
    return { status: 503, error: 'Preview pickup signing is unavailable' };
  }
  if (!providedCapability) {
    return { status: 409, error: 'A current Preview pickup capability is required' };
  }

  const { data: pickupJobs, error: pickupError } = await findScopedGoalWorkerJob(
    admin,
    id,
    workerScope,
    deploymentIdentity
  );
  if (pickupError) {
    return { status: 503, error: 'Unable to inspect the Preview worker queue' };
  }
  const pickup = summarizeGoalWorkerPickup(goal.status, pickupJobs?.[0], {
    goalId: id,
    userId: user.id,
    deploymentIdentity,
    capabilitySecret,
  });
  if (!pickup) {
    return {
      status: 409,
      error: 'This goal has no recoverable job in the current Preview deployment',
    };
  }
  if (!pickupCapabilityMatches(providedCapability, pickup.capability)) {
    return { status: 409, error: 'This Preview pickup snapshot is no longer current' };
  }

  const availableAt = Date.parse(pickup.retry_available_at);
  const nowMs = Number(now());
  const leaseIsStillFresh = nowMs < availableAt;
  if (!Number.isFinite(availableAt) || !Number.isFinite(nowMs) || leaseIsStillFresh) {
    return {
      status: 409,
      error:
        pickup.status === 'running'
          ? 'This running worker lease is not stale yet'
          : 'This worker job is still within its normal pickup window',
    };
  }

  const pickupJob = pickupJobs[0];
  if (pickup.status === 'running') {
    const retryCount = Number.isFinite(Number(pickupJob.retry_count))
      ? Math.max(0, Number(pickupJob.retry_count))
      : 0;
    const configuredMaxRetries = Number(pickupJob.max_retries);
    const maxRetries =
      pickupJob.max_retries !== null &&
      pickupJob.max_retries !== undefined &&
      Number.isFinite(configuredMaxRetries)
        ? Math.max(0, configuredMaxRetries)
        : 3;
    // retry_count describes the lease that is currently running. Match the
    // durable sweep: a next count that reaches the ceiling is terminal.
    const exhausted = retryCount + 1 >= maxRetries;
    const transitionedAt = new Date(nowMs).toISOString();
    const failureReason =
      'Preview worker stopped after exhausting its retry budget. Retry this goal from the current Preview deployment.';
    const parkedData = exhausted
      ? {
          ...(goal.data || {}),
          failure_code: 'preview_worker_retry_exhausted',
          failure_reason: failureReason,
          failure_stage: pickupJob.payload?.action || pickupJob.payload?.type || null,
          failure_at: transitionedAt,
        }
      : null;

    // Park the owner-visible goal before terminalizing its last recoverable
    // lease. If this CAS loses or errors, the running job remains untouched and
    // can still be recovered from a fresh snapshot. The reverse order can leave
    // a reconciliable goal with no runnable row when the second write fails.
    let goalParked = false;
    if (exhausted) {
      if (!goal.updated_at) {
        return {
          status: 409,
          error: 'The goal snapshot changed before its exhausted Preview lease was recovered',
        };
      }
      try {
        let goalFailureQuery = admin
          .from('goals')
          .update({ status: 'needs_human', data: parkedData, updated_at: transitionedAt })
          .eq('id', id)
          .eq('user_id', user.id)
          .eq('status', goal.status)
          .eq('updated_at', goal.updated_at);
        // Exact JSON equality is the legacy-writer marker: even a concurrent
        // same-status edit that forgot to rotate updated_at cannot be replaced
        // by the stale snapshot loaded above.
        goalFailureQuery =
          goal.data === null || goal.data === undefined
            ? goalFailureQuery.is('data', null)
            : goalFailureQuery.eq('data', JSON.stringify(goal.data));
        const { data: parkedGoal, error: goalFailureError } = await goalFailureQuery
          .select('id, status')
          .maybeSingle();
        if (goalFailureError) {
          log.warn(null, 'goal.worker-pickup.goal-failure-transition-failed', {
            goalId: id,
            error: goalFailureError.message,
          });
          return { status: 503, error: 'The exhausted Preview goal could not be parked safely' };
        }
        goalParked = parkedGoal?.id === id && parkedGoal?.status === 'needs_human';
        if (!goalParked) {
          return {
            status: 409,
            error: 'The goal changed while its exhausted Preview lease was being recovered',
          };
        }
      } catch (goalFailureError) {
        log.warn(null, 'goal.worker-pickup.goal-failure-transition-failed', {
          goalId: id,
          error: goalFailureError.message,
        });
        return { status: 503, error: 'The exhausted Preview goal could not be parked safely' };
      }
    }

    const update = exhausted
      ? {
          status: 'failed',
          error: 'Job timed out (stale — exceeded max retries)',
          updated_at: transitionedAt,
          ...clearJobLease(),
        }
      : {
          status: 'queued',
          retry_count: retryCount + 1,
          error: 'Re-queued after stale timeout',
          updated_at: transitionedAt,
          ...clearJobLease(),
        };

    const transitionQuery = admin
      .from('agent_jobs')
      .update(update)
      .eq('id', pickupJob.id)
      .eq('status', 'running')
      .eq('worker_scope', workerScope)
      .eq(`payload->>${WORKER_DEPLOYMENT_PAYLOAD_KEY}`, deploymentIdentity)
      .eq('retry_count', retryCount)
      .eq('lease_token', pickupJob.lease_token)
      .eq('lease_expires_at', pickupJob.lease_expires_at)
      .eq('updated_at', pickupJob.updated_at);
    let transitioned = null;
    let transitionError = null;
    try {
      const transitionResult = await transitionQuery.select('id, status').maybeSingle();
      transitioned = transitionResult.data || null;
      transitionError = transitionResult.error || null;
    } catch (error) {
      transitionError = error;
    }

    // A transport error or a zero-row CAS after UPDATE only proves that this
    // request did not observe the transition. Another actor may already have
    // completed, failed, deleted, or recovered the row. Keep the goal parked
    // until an exact read proves our terminalization committed or that the
    // same job is still runnable; only the latter can safely restore the goal.
    if (
      exhausted &&
      (transitionError ||
        transitioned?.id !== pickupJob.id ||
        transitioned?.status !== update.status)
    ) {
      const inspection = await inspectPreviewPickupTransition(admin, {
        jobId: pickupJob.id,
        goalId: id,
        deploymentIdentity,
        retryCount,
        originalUpdatedAt: pickupJob.updated_at,
        originalLeaseToken: pickupJob.lease_token,
        originalLeaseExpiresAt: pickupJob.lease_expires_at,
        transitionedAt,
      });
      if (inspection.state === 'terminalized') {
        transitioned = { id: pickupJob.id, status: 'failed' };
        transitionError = null;
      } else if (!['original', 'recoverable'].includes(inspection.state)) {
        log.error(null, 'goal.worker-pickup.stale-transition-outcome-unknown', {
          goalId: id,
          jobId: pickupJob.id,
          inspectionState: inspection.state,
          error: transitionError?.message || null,
          inspectionError: inspection.error?.message || null,
        });
        return {
          status: 503,
          error:
            'The exhausted Preview goal was parked, but its worker state could not be reconciled. Refresh before retrying.',
        };
      }
    }
    if (
      transitionError ||
      transitioned?.id !== pickupJob.id ||
      transitioned?.status !== update.status
    ) {
      // The goal was already parked on the exhausted path. Restore its exact
      // previous snapshot when the job CAS did not commit, so the two rows do
      // not advertise contradictory terminal state. If rollback loses, retain
      // needs_human and report an explicit reconciliation failure.
      let goalRollbackSucceeded = !goalParked;
      if (goalParked) {
        try {
          const rollback = admin
            .from('goals')
            .update({ status: goal.status, data: goal.data, updated_at: goal.updated_at })
            .eq('id', id)
            .eq('user_id', user.id)
            .eq('status', 'needs_human')
            .eq('updated_at', transitionedAt)
            .eq('data->>failure_code', 'preview_worker_retry_exhausted')
            .eq('data->>failure_at', transitionedAt);
          const { data: restoredGoal, error: rollbackError } = await rollback
            .select('id, status')
            .maybeSingle();
          goalRollbackSucceeded =
            !rollbackError && restoredGoal?.id === id && restoredGoal?.status === goal.status;
          if (!goalRollbackSucceeded) {
            log.error(null, 'goal.worker-pickup.goal-failure-rollback-failed', {
              goalId: id,
              jobId: pickupJob.id,
              error: rollbackError?.message || 'goal snapshot changed before rollback',
            });
          }
        } catch (rollbackError) {
          goalRollbackSucceeded = false;
          log.error(null, 'goal.worker-pickup.goal-failure-rollback-failed', {
            goalId: id,
            jobId: pickupJob.id,
            error: rollbackError.message,
          });
        }
      }
      if (transitionError) {
        log.warn(null, 'goal.worker-pickup.stale-transition-failed', {
          goalId: id,
          error: transitionError.message,
        });
      }
      if (!goalRollbackSucceeded) {
        return {
          status: 503,
          error:
            'The exhausted Preview goal was parked, but its worker state could not be reconciled. Refresh before retrying.',
        };
      }
      return transitionError
        ? { status: 503, error: 'The stale Preview worker lease could not be recovered' }
        : { status: 409, error: 'This Preview pickup snapshot is no longer current' };
    }

    if (exhausted) {
      try {
        const { error: logError } = await admin.from('goal_log').insert({
          goal_id: id,
          event_type: 'goal_needs_human',
          details: {
            reason: failureReason,
            source: 'preview_stale_worker_recovery',
            job_type: pickupJob.payload?.type || null,
            action: pickupJob.payload?.action || null,
            retry_count: retryCount,
            max_retries: maxRetries,
          },
        });
        if (logError) {
          log.warn(null, 'goal.worker-pickup.goal-failure-log-failed', {
            goalId: id,
            error: logError.message,
          });
        }
      } catch (logError) {
        log.warn(null, 'goal.worker-pickup.goal-failure-log-failed', {
          goalId: id,
          error: logError.message,
        });
      }
      return {
        status: 200,
        data: {
          id,
          status: goalParked ? 'needs_human' : goal.status,
          worker_scope: workerScope,
          job_status: 'failed',
          pickup_requested: false,
          retry_exhausted: true,
          goal_terminal: goalParked,
        },
      };
    }
  }

  let handoff;
  try {
    handoff = await kickProcessing(admin, id, { jobId: pickupJob.id });
  } catch (error) {
    log.warn(null, 'goal.worker-pickup.retry-failed', { goalId: id, error: error.message });
    return { status: 503, error: 'The Preview worker could not be woken' };
  }
  if (handoff?.triggered !== true || handoff?.terminalized === true) {
    return { status: 503, error: 'The Preview worker could not be woken' };
  }

  return {
    status: 202,
    data: {
      id,
      status: goal.status,
      worker_scope: workerScope,
      job_status: pickup.status === 'running' ? 'queued' : pickup.status,
      pickup_requested: true,
    },
  };
}

/**
 * Smart Request admission is deliberately two-phase:
 *   1. create a non-executing draft after org/catalogue verification;
 *   2. persist and validate evidence, then move the draft to AxWise's
 *      domain-neutral scope admission before enqueueing the first worker job.
 *
 * This keeps the legacy create endpoint compatible while making the product's
 * Simple/Advanced workflow fail closed.
 */
export async function handleCreateSmartRequestDraft(admin, user, body) {
  const title = String(body?.title || '').trim();
  if (!title) return { status: 400, error: 'title is required' };
  if (!body?.org_id) {
    return { status: 400, error: 'org_id is required for a Smart Request goal' };
  }

  const budget = Number(body.budget_usd || 10);
  if (!Number.isFinite(budget) || budget <= 0 || budget > 1000) {
    return { status: 400, error: 'budget_usd must be between 0.01 and 1000' };
  }

  const resolvedOrgId = await resolveGoalOrgId(admin, user.id, { orgId: body.org_id });
  if (!resolvedOrgId) {
    return {
      status: 403,
      error: 'The selected organization is inactive or is not owned by the authenticated user',
    };
  }
  const catalogue = await validateOrganizationAgentCatalogue(admin, user.id, resolvedOrgId);
  if (!catalogue.ok) return catalogue;

  const validExecutorTypes = ['organization', 'consilium', 'team', 'agent'];
  const safeExecutorType = validExecutorTypes.includes(body.executor_type)
    ? body.executor_type
    : 'organization';
  // AxWise is the canonical scope-admission provider for every Smart Request.
  // Research depth may remain instant/auto, but admission itself must never
  // degrade into an Orqaly-authored scope when AxWise is unavailable. Enforce
  // this server-side so older or crafted clients cannot opt out with false.
  const researchPolicy = {
    ...normalizeGoalResearchPolicy(body),
    research_fail_closed: true,
  };
  const researchPolicyError = validateGoalResearchPolicy(researchPolicy, body);
  if (researchPolicyError) return researchPolicyError;
  const evidenceAdmissionError = validateEvidenceProfileAdmissionCohort(
    researchPolicy,
    body,
    resolvedOrgId
  );
  if (evidenceAdmissionError) return evidenceAdmissionError;
  const initialData = {
    tool_mode: normalizeGoalToolMode(body.tool_mode),
    research_policy: researchPolicy,
    ...(body.pm_strategy === 'ralph' ? { pm_strategy: 'ralph' } : {}),
    evidence: { status: 'awaiting_persistence', attachment_count: 0 },
    smart_request_admission: {
      version: 1,
      status: 'draft',
      authorized_agent_ids: catalogue.agentIds,
      checked_at: new Date().toISOString(),
    },
  };

  const { data: goal, error: insertError } = await admin
    .from('goals')
    .insert({
      user_id: user.id,
      title,
      description: String(body.description || ''),
      target_value: body.target_value || null,
      target_unit: body.target_unit || 'usd',
      budget_usd: budget,
      status: 'draft',
      max_iterations: 3,
      parsed_category: body.parsed_category || null,
      parsed_priority: body.parsed_priority || 'medium',
      parsed_requirements: body.parsed_requirements || '',
      complexity: normalizeGoalComplexity(body.complexity),
      execution_mode: body.execution_mode || 'auto',
      hitl_mode: normalizeGoalHitlMode(body.hitl_mode),
      source_request_id: body.source_request_id || null,
      mode: body.mode === 'advanced' ? 'advanced' : 'simple',
      po_depth: ['quick', 'standard', 'expert'].includes(body.po_depth)
        ? body.po_depth
        : 'standard',
      executor_type: safeExecutorType,
      org_id: resolvedOrgId,
      executor_id: body.executor_id || null,
      concilium_id: body.concilium_id || null,
      workflow_id: body.workflow_id || null,
      theory_mode: body.theory_mode === true,
      loop_enabled: body.loop_enabled === true,
      data: initialData,
    })
    .select(
      'id, title, status, budget_usd, complexity, execution_mode, hitl_mode, executor_type, org_id, executor_id, concilium_id, created_at, data, loop_enabled, loop_chain_root_id'
    )
    .single();
  if (insertError) throw insertError;

  if (!goal.loop_chain_root_id) {
    await admin.from('goals').update({ loop_chain_root_id: goal.id }).eq('id', goal.id);
    goal.loop_chain_root_id = goal.id;
  }
  await admin.from('goal_log').insert({
    goal_id: goal.id,
    event_type: 'smart_request_draft_created',
    details: {
      title,
      budget_usd: budget,
      org_id: resolvedOrgId,
      authorized_agent_count: catalogue.agentIds.length,
    },
  });
  return { status: 201, data: goal };
}

export async function handleStartSmartRequest(
  admin,
  user,
  body,
  { kickProcessing = kickGoalProcessing } = {}
) {
  const goalId = String(body?.id || '').trim();
  if (!goalId) return { status: 400, error: 'id is required' };

  const { data: goal, error: loadError } = await admin
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (loadError) throw loadError;
  if (!goal) return { status: 404, error: 'Goal draft not found' };
  if (goal.status !== 'draft' || goal.data?.smart_request_admission?.status !== 'draft') {
    return { status: 409, error: 'Goal is not an unstarted Smart Request draft' };
  }

  const resolvedOrgId = await resolveGoalOrgId(admin, user.id, { orgId: goal.org_id });
  if (!resolvedOrgId) {
    return { status: 403, error: 'The goal organization is no longer active or owned' };
  }
  const catalogue = await validateOrganizationAgentCatalogue(admin, user.id, resolvedOrgId);
  if (!catalogue.ok) return catalogue;

  let evidence;
  try {
    const attachments = await normalizeGoalAttachments(admin, {
      goalId: goal.id,
      userId: user.id,
      attachments: body.attachments || [],
    });
    // Knowledge Base picks share the attachment budget with uploads and
    // prior-goal references rather than getting an allowance of their own.
    // Resolved before the compare-and-swap below: nothing that can throw may
    // run after it, or a started goal would be left with no queued job.
    const knowledgeEvidence = await normalizeKnowledgeBaseEvidence(admin, {
      userId: user.id,
      orgId: resolvedOrgId,
      documentIds: body.kb_document_ids || [],
      remainingSlots: MAX_ATTACHMENTS - attachments.length,
    });
    evidence = [...attachments, ...knowledgeEvidence];
  } catch (error) {
    return { status: 400, error: error.message };
  }
  const knowledgeDocumentCount = evidence.filter(
    (item) => item.source_type === 'knowledge_base_document'
  ).length;

  const startedAt = new Date().toISOString();
  const startedData = {
    ...(goal.data || {}),
    attachments: evidence,
    evidence: {
      status: 'persisted',
      attachment_count: evidence.length,
      knowledge_document_count: knowledgeDocumentCount,
      persisted_at: startedAt,
    },
    smart_request_admission: {
      ...(goal.data?.smart_request_admission || {}),
      status: 'started',
      authorized_agent_ids: catalogue.agentIds,
      checked_at: startedAt,
      started_at: startedAt,
    },
    // AxWise scope admission is the domain-neutral first stage for Smart
    // Requests. The legacy axwise_customer_intelligence state remains the
    // persisted compatibility record until its migrations and UI consumers
    // can be renamed independently.
    scope_admission: {
      version: 1,
      native_scope: true,
      status: 'queued',
      state_key: 'axwise_customer_intelligence',
      queued_at: startedAt,
    },
  };
  // Compare-and-swap prevents two browser retries from enqueueing the same
  // draft twice.
  const { data: started, error: updateError } = await admin
    .from('goals')
    .update({ status: 'analyzing', data: startedData, updated_at: startedAt })
    .eq('id', goal.id)
    .eq('user_id', user.id)
    .eq('status', 'draft')
    .select(
      'id, title, status, budget_usd, complexity, execution_mode, hitl_mode, executor_type, org_id, executor_id, concilium_id, created_at, data, loop_enabled, loop_chain_root_id'
    )
    .maybeSingle();
  if (updateError) throw updateError;
  if (!started) return { status: 409, error: 'Goal draft was already started' };

  const { jobId, error: enqueueError } = await enqueueGoalWorkerJob(admin, {
    user_id: user.id,
    status: 'queued',
    payload: {
      type: 'orchestrate-goal',
      action: 'scope-admission',
      goalId: goal.id,
      _userId: user.id,
      context: {
        parsed_category: goal.parsed_category || null,
        parsed_priority: goal.parsed_priority || 'medium',
        parsed_requirements: goal.parsed_requirements || '',
        executor_type: goal.executor_type || 'organization',
        org_id: resolvedOrgId,
        executor_id: goal.executor_id || null,
        concilium_id: goal.concilium_id || null,
        evidence_attachment_ids: evidence.map((item) => item.id),
      },
    },
  });
  if (enqueueError) {
    if (goalWorkerEnqueueNeedsReconciliation(enqueueError)) {
      return goalWorkerEnqueueReconciliationFailure(enqueueError);
    }
    const failedAt = new Date().toISOString();
    const { data: terminalized, error: terminalizeError } = await admin
      .from('goals')
      .update({
        status: 'failed',
        data: {
          ...startedData,
          smart_request_admission: {
            ...startedData.smart_request_admission,
            status: 'enqueue_failed',
          },
        },
        updated_at: failedAt,
      })
      .eq('id', goal.id)
      .eq('user_id', user.id)
      .eq('status', 'analyzing')
      .eq('updated_at', startedAt)
      .eq('data->smart_request_admission->>started_at', startedAt)
      .select('id')
      .maybeSingle();
    if (terminalizeError) {
      return { status: 503, error: 'Goal start failed and its state could not be reconciled' };
    }
    if (!terminalized) {
      return {
        status: 409,
        error: 'Goal state changed after its start attempt. Refresh before retrying.',
        data: { code: 'state_changed' },
      };
    }
    return { status: 503, error: `Failed to enqueue goal: ${enqueueError.message}` };
  }

  await admin.from('goal_log').insert({
    goal_id: goal.id,
    event_type: 'smart_request_started',
    details: {
      org_id: resolvedOrgId,
      evidence_attachment_count: evidence.length,
      evidence_knowledge_document_count: knowledgeDocumentCount,
      authorized_agent_count: catalogue.agentIds.length,
    },
  });

  const handoff = await requestGoalProcessingHandoff(admin, goal.id, {
    jobId,
    userId: user.id,
    kickProcessing,
    operation: 'start-smart-request',
    rollbackGoalOnSafeFailure: () =>
      rollbackExactGoalHandoff(admin, {
        goalId: goal.id,
        userId: user.id,
        expectedStatus: 'analyzing',
        expectedUpdatedAt: startedAt,
        expectedFilters: [['eq', 'data->smart_request_admission->>started_at', startedAt]],
        restore: { status: 'draft', data: goal.data },
      }),
  });
  if (!handoff.ok) return goalProcessingHandoffFailure(handoff);
  return { status: 202, data: started };
}

export async function handleList(admin, user, query) {
  const status = query?.status || null;

  let q = admin
    .from('goals')
    .select(
      'id, title, description, status, budget_usd, spent_usd, current_value, target_value, target_unit, iteration, max_iterations, team_id, plan, data, parsed_category, parsed_priority, complexity, execution_mode, mode, feasibility_report, tech_doc, proposal, retrospective, project_id, workflow_id, confidence_score, created_at, updated_at'
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  if (status) q = q.eq('status', status);

  const { data, error } = await q;
  if (error) throw error;
  return { status: 200, data: data || [] };
}

/**
 * List the user's looped goals (iteration > 0 or loop_enabled) and resolve the
 * looping agent — the goal's team lead (`agent_teams.leader_id` → `agents`).
 * Each row is shaped for the Home "Loops from Agents" table and the Requests
 * page Loops tab. Goals with no recorded team lead fall back to "Unassigned"
 * (agent_id null), so the UI stays safe. Resolves leads in two batched queries
 * rather than one per goal.
 */
export async function handleLoops(admin, user) {
  const { data: goals, error } = await admin
    .from('goals')
    .select(
      'id, title, status, iteration, max_iterations, loop_enabled, loop_paused, loop_paused_reason, loop_advanced, loop_settings, loop_depth, loop_chain_root_id, budget_usd, created_at'
    )
    .eq('user_id', user.id)
    .or('iteration.gt.0,loop_enabled.eq.true')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  const list = goals || [];
  if (!list.length) return { status: 200, data: [] };

  // Chain spend rollup per chain root (single batched query, no N+1).
  const { getChainSpendsForGoals } = await import('../cost/chain.js');
  const chainSpendByRoot = await getChainSpendsForGoals(admin, list);

  // goal → team lead (first recorded leader per goal)
  const goalIds = list.map((g) => g.id);
  const { data: teams } = await admin
    .from('agent_teams')
    .select('goal_id, leader_id')
    .in('goal_id', goalIds);
  const leaderByGoal = {};
  const leaderIds = new Set();
  for (const t of teams || []) {
    if (t.goal_id && t.leader_id && !leaderByGoal[t.goal_id]) {
      leaderByGoal[t.goal_id] = t.leader_id;
      leaderIds.add(t.leader_id);
    }
  }

  // leader → agent name/role
  const agentById = {};
  if (leaderIds.size) {
    const { data: agents } = await admin
      .from('agents')
      .select('id, name, category')
      .in('id', [...leaderIds]);
    for (const a of agents || []) agentById[a.id] = a;
  }

  const rows = list.map((g) => {
    const agent = agentById[leaderByGoal[g.id]] || null;
    const chain = chainSpendByRoot[g.loop_chain_root_id || g.id] || null;
    return {
      loop_id: g.id,
      goal_id: g.id,
      goal_title: g.title || 'Untitled goal',
      agent_id: agent ? agent.id : null,
      agent_name: agent ? agent.name : 'Unassigned',
      agent_role: agent ? agent.category || '' : '',
      loops: Number(g.iteration) || 0,
      max_loops: Number(g.max_iterations) || 0,
      status: g.status,
      loop_enabled: !!g.loop_enabled,
      loop_paused: !!g.loop_paused,
      loop_paused_reason: g.loop_paused_reason || null,
      loop_advanced: !!g.loop_advanced,
      loop_settings: g.loop_settings || null,
      loop_depth: Number(g.loop_depth) || 0,
      budget_usd: Number(g.budget_usd) || 0,
      chain_spend_usd: chain ? Number(chain.spent_usd) || 0 : 0,
      started_at: g.created_at,
    };
  });
  return { status: 200, data: rows };
}

export async function handleGet(admin, user, query) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };

  const { data: goal, error } = await admin
    .from('goals')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error) throw error;
  if (!goal) return { status: 404, error: 'Goal not found' };

  // The normal `jobs` collection below is product work, not the internal
  // worker queue. Expose a deliberately small pickup projection so Preview can
  // distinguish "still working" from "never claimed" without leaking the
  // queued payload or granting direct table access in the browser.
  let workerPickup = null;
  if (RECONCILABLE_STATUSES.includes(goal.status)) {
    const workerScope = resolveWorkerScope();
    const deploymentIdentity = resolveWorkerDeploymentIdentity();
    if (workerScope !== 'preview' || deploymentIdentity) {
      const { data: pickupJobs, error: pickupError } = await findScopedGoalWorkerJob(
        admin,
        id,
        workerScope,
        deploymentIdentity
      );
      if (pickupError) {
        log.warn(null, 'goal.worker-pickup.read-failed', {
          goalId: id,
          workerScope,
          error: pickupError.message,
        });
      } else {
        workerPickup = summarizeGoalWorkerPickup(goal.status, pickupJobs?.[0], {
          goalId: id,
          userId: user.id,
          deploymentIdentity,
          capabilitySecret: process.env.WORKER_SECRET,
        });
      }
    } else {
      log.warn(null, 'goal.worker-pickup.binding-unavailable', { goalId: id, workerScope });
    }
  }

  // Load jobs for this goal
  const { data: jobs } = await admin
    .from('jobs')
    .select(
      'id, description, status, category, cost_usd, approval_status, assigned_agent_name, created_at'
    )
    .eq('goal_id', id)
    .order('created_at', { ascending: true });

  // Load activity log
  const { data: logs } = await admin
    .from('goal_log')
    .select('id, event_type, details, cost_usd, created_at')
    .eq('goal_id', id)
    .order('created_at', { ascending: false })
    .limit(50);

  // Load tasks with agent cost data for budget tab
  const jobIds = (jobs || []).map((j) => j.id);
  let goalTasks = [];
  if (jobIds.length) {
    const { data: tasks } = await admin
      .from('team_tasks')
      .select('id, title, status, assigned_to, agent_id, materialization_attempt, data, updated_at')
      .in('job_pool_id', jobIds);
    goalTasks = tasks || [];
  }
  if (!goalTasks.length) {
    const { data: byGoalCol } = await admin
      .from('team_tasks')
      .select('id, title, status, assigned_to, agent_id, materialization_attempt, data, updated_at')
      .eq('goal_id', id);
    goalTasks = byGoalCol || [];
  }
  if (!goalTasks.length) {
    const { data: byMeta } = await admin
      .from('team_tasks')
      .select('id, title, status, assigned_to, agent_id, materialization_attempt, data, updated_at')
      .contains('data', { goal_id: id });
    goalTasks = byMeta || [];
  }

  // Task rows from prior Request Changes attempts remain available for audit,
  // but the live goal response and its derived execution metrics are bound to
  // the current signed manifest/AxWise decision only.
  const currentTasks = currentGoalTaskAttempt(goal, goalTasks);

  // Build per-agent budget summary (from tasks)
  const agentBudget = {};
  for (const task of currentTasks) {
    const agentName = task.assigned_to || 'Unassigned';
    const agentId = task.agent_id || null;
    if (!agentBudget[agentName]) {
      agentBudget[agentName] = {
        agentId,
        name: agentName,
        tasks: 0,
        completed: 0,
        failed: 0,
        spent: 0,
        tokens: 0,
        tokenCostUsd: 0,
        quality: [],
      };
    }
    agentBudget[agentName].tasks++;
    if (task.status === 'done') agentBudget[agentName].completed++;
    if (task.status === 'failed') agentBudget[agentName].failed++;
    agentBudget[agentName].spent += Number(task.data?.llmCost || 0);
    agentBudget[agentName].tokens += Number(task.data?.llmTotalTokens || 0);
    agentBudget[agentName].tokenCostUsd += Number(
      task.data?.llmEstimatedCostUsd || task.data?.llmCost || 0
    );
    if (task.data?.quality_score) agentBudget[agentName].quality.push(task.data.quality_score);
  }

  // Unified financial summary from financial_events (single source of truth)
  const { getGoalFinancialSummary, getGoalTokenSummary } =
    await import('../goal-handlers/_helpers.js');
  const financialSummary = await getGoalFinancialSummary(admin, id);
  const tokenSummary = await getGoalTokenSummary(admin, id, {
    goalData: goal.data,
    jobIds,
    goalTasks: currentTasks,
  });

  const goalHasOrphanTokens = currentTasks.some(
    (t) =>
      Number(t.data?.llmTotalTokens || 0) > 0 &&
      (t.data?.phase_index == null || Number(t.data?.phase_index) < 0)
  );

  const agentBudgetSummary = Object.values(agentBudget).map((a) => {
    const agentTasks = currentTasks.filter(
      (t) => (t.assigned_to || t.data?.assigned_to) === a.name
    );
    const durationMislabeled = isLikelyDurationAsTokens(agentTasks);
    const tokens = durationMislabeled ? 0 : a.tokens;
    const tokenCostUsd = durationMislabeled ? 0 : a.tokenCostUsd;
    const metricMeta = resolveAgentMetricMeta({
      agentTasks,
      tokens,
      cost: a.spent,
      isLegacyGoal: !tokenSummary?.hasTokenData,
    });
    return {
      ...a,
      avgQuality: a.quality.length
        ? Math.round(a.quality.reduce((s, v) => s + v, 0) / a.quality.length)
        : null,
      quality: undefined,
      tokens,
      tokenCostUsd,
      metricMeta,
    };
  });

  const resolvePhaseCost = (phaseIndex) => {
    const currentPhaseTasks =
      phaseIndex === -1
        ? currentTasks.filter(
            (task) => task.data?.phase_index == null || task.data?.phase_index === -1
          )
        : currentTasks.filter((task) => Number(task.data?.phase_index) === phaseIndex);
    if (currentPhaseTasks.length > 0) {
      return currentPhaseTasks.reduce((sum, task) => sum + Number(task.data?.llmCost || 0), 0);
    }

    // An explicit attempt with no materialized rows is a real empty live
    // state. Do not fill it with costs retained from a superseded attempt.
    const hasExplicitAttempt = Boolean(
      goal.data?.axwise_orchestration?.decision_id ||
      goal.data?.execution_authorization?.manifest?.tasks
    );
    if (phaseIndex >= 0 && hasExplicitAttempt) return 0;

    const fromFinancial =
      phaseIndex === -1
        ? financialSummary.byPhase.planning || 0
        : financialSummary.byPhase[phaseIndex] || 0;
    if (fromFinancial > 0) return fromFinancial;
    if (phaseIndex >= 0 && goal.data?.phase_costs?.[phaseIndex]?.total) {
      return Number(goal.data.phase_costs[phaseIndex].total);
    }
    if (phaseIndex === -1) {
      const taskCost = currentTasks.reduce((s, t) => s + Number(t.data?.llmCost || 0), 0);
      const spent = Number(goal.spent_usd || 0);
      if (spent > taskCost) return spent - taskCost;
    }
    return 0;
  };

  const phaseTokenLookup = (phaseIndex) => {
    const key = phaseIndex === -1 ? 'planning' : String(phaseIndex);
    const bucket = tokenSummary.byPhase[key];
    const phaseTasks =
      phaseIndex === -1
        ? currentTasks.filter((t) => t.data?.phase_index == null || t.data?.phase_index === -1)
        : currentTasks.filter((t) => Number(t.data?.phase_index) === phaseIndex);
    const taskTokens = phaseTasks.reduce((s, t) => s + Number(t.data?.llmTotalTokens || 0), 0);
    const taskTokenCostUsd = phaseTasks.reduce(
      (s, t) => s + Number(t.data?.llmEstimatedCostUsd || t.data?.llmCost || 0),
      0
    );
    const hasCurrentTaskUsage = phaseTasks.some(
      (task) =>
        Number(task.data?.llmTotalTokens || 0) > 0 ||
        Number(task.data?.llmEstimatedCostUsd || task.data?.llmCost || 0) > 0
    );
    const tokens = hasCurrentTaskUsage ? taskTokens : bucket?.tokens || 0;
    const tokenCostUsd = hasCurrentTaskUsage ? taskTokenCostUsd : bucket?.costUsd || 0;
    const cost = resolvePhaseCost(phaseIndex);
    const metricMeta = resolvePhaseMetricMeta({
      phaseIndex,
      cost,
      tokens,
      phaseTasks,
      goalHasOrphanTokens,
      isLegacyGoal: !tokenSummary?.hasTokenData,
    });
    return {
      tokens,
      tokenCostUsd,
      tokenBreakdown:
        !hasCurrentTaskUsage && bucket?.tokenBreakdown?.length ? bucket.tokenBreakdown : null,
      metricMeta,
    };
  };

  // Build per-phase budget from financial summary + plan phases
  const phases = goal.plan?.phases || [];
  const phaseBudget = phases.map((phase, i) => ({
    phaseIndex: i,
    phaseName: phase.name || `Phase ${i + 1}`,
    status: phase.status,
    qualityScore: phase.quality_score || null,
    cost: resolvePhaseCost(i),
    ...phaseTokenLookup(i),
  }));
  phaseBudget.unshift({
    phaseIndex: -1,
    phaseName: 'Planning (Feasibility + PO + PM)',
    status: 'completed',
    qualityScore: null,
    cost: resolvePhaseCost(-1),
    ...phaseTokenLookup(-1),
  });

  return {
    status: 200,
    data: {
      ...goal,
      worker_pickup: workerPickup,
      jobs: jobs || [],
      logs: logs || [],
      tasks: currentTasks,
      agentBudget: agentBudgetSummary,
      phaseBudget,
      tokenSummary,
      financialSummary: {
        totalSpent: financialSummary.totalSpent,
        bySource: financialSummary.bySource,
      },
    },
  };
}

async function updateGoalIfPendingNativeRevision(
  admin,
  goal,
  userId,
  expectedStatus,
  revisionToken,
  updates
) {
  if (!revisionToken || !goal?.updated_at) return false;
  const { data, error } = await admin
    .from('goals')
    .update({
      ...updates,
      updated_at: updates?.updated_at || new Date().toISOString(),
    })
    .eq('id', goal.id)
    .eq('user_id', userId)
    .eq('status', expectedStatus)
    .eq('updated_at', goal.updated_at)
    .eq('data->scope_revision->>status', 'pending_rebuild')
    .eq('data->scope_revision->>revision_token', revisionToken)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function updateGoalIfInitialNativeScopeAdmission(
  admin,
  goal,
  userId,
  expectedStatus,
  binding,
  updates
) {
  if (
    !binding?.goal_updated_at ||
    !binding.smart_admission_status ||
    !binding.smart_admission_started_at ||
    binding.scope_admission_status !== 'queued'
  ) {
    return false;
  }

  let transition = admin
    .from('goals')
    .update({
      ...updates,
      updated_at: updates?.updated_at || new Date().toISOString(),
    })
    .eq('id', goal.id)
    .eq('user_id', userId)
    .eq('status', expectedStatus)
    .eq('updated_at', binding.goal_updated_at)
    .eq('data->smart_request_admission->>status', binding.smart_admission_status)
    .eq('data->smart_request_admission->>started_at', binding.smart_admission_started_at)
    .eq('data->scope_admission->>status', binding.scope_admission_status)
    .eq('data->scope_admission->>state_key', 'axwise_customer_intelligence');
  transition = binding.scope_admission_native
    ? transition.eq('data->scope_admission->>native_scope', 'true')
    : transition.is('data->scope_admission->>native_scope', null);
  if (binding.scope_admission_queued_at) {
    transition = transition.eq(
      'data->scope_admission->>queued_at',
      binding.scope_admission_queued_at
    );
  }
  const { data, error } = await transition.select('id').maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

function nativeReentryState(goal) {
  const authority = resolveAcceptedNativeGoalAuthority(goal);
  if (!authority.native) return { native: false, authority };
  const revisionToken = pendingScopeRevisionToken(goal);
  if (revisionToken === null) {
    return {
      native: true,
      ready: false,
      authority,
      error: 'The pending AxWise scope rebuild token is missing',
    };
  }
  if (revisionToken) {
    return { native: true, ready: true, kind: 'scope_rebuild', authority, revisionToken };
  }
  const initialBinding = initialNativeScopeAdmissionActionBinding(goal, authority);
  if (initialBinding) {
    return {
      native: true,
      ready: true,
      kind: 'initial_scope_admission',
      authority,
      binding: initialBinding,
    };
  }
  const binding = acceptedNativePlanningActionBinding(goal, authority);
  if (!authority.ready || !binding) {
    return {
      native: true,
      ready: false,
      authority,
      error: 'The accepted native AxWise scope is incomplete or stale. Refresh its scope review.',
    };
  }
  return { native: true, ready: true, kind: 'planning', authority, binding };
}

export async function handleLifecycle(
  admin,
  user,
  query,
  newStatus,
  { kickProcessing = kickGoalProcessing } = {}
) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };

  const { data: goal } = await admin
    .from('goals')
    .select('id, status, loop_enabled, loop_paused, plan, feasibility_report, data, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!goal) return { status: 404, error: 'Goal not found' };

  // Resuming a completed loop goal that paused at an advanced checkpoint is an
  // approval to continue the chain — not a status change. Clear the pause and
  // spawn the continuation instead of flipping the goal back to active.
  if (
    newStatus === 'active' &&
    goal.status === 'completed' &&
    goal.loop_paused &&
    goal.loop_enabled
  ) {
    await admin
      .from('goals')
      .update({
        loop_paused: false,
        loop_paused_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    await admin.from('goal_log').insert({
      goal_id: id,
      event_type: 'loop_resumed',
      details: { actor: user.id, source: 'checkpoint_approval' },
    });
    await maybeRespawnAfterApproval(admin, id, null);
    return { status: 200, data: { id, status: 'completed', loop_resumed: true } };
  }

  if (newStatus === 'paused' && goal.status !== 'active') {
    return {
      status: 409,
      error: 'Only an active goal can be paused. Refresh the goal and try again.',
    };
  }
  if (newStatus === 'active' && goal.status !== 'paused') {
    return {
      status: 409,
      error: 'Only a paused goal can be resumed. Refresh the goal and try again.',
    };
  }

  const phases = goal.plan?.phases || [];
  const zeroPlanResume = newStatus === 'active' && goal.status === 'paused' && phases.length === 0;
  const admissionStatus = goal.data?.smart_request_admission?.status;
  const hasStartedAdmission = admissionStatus === undefined || admissionStatus === 'started';
  const nativeZeroPlanReentry = zeroPlanResume
    ? nativeReentryState(goal)
    : { native: false, ready: false };
  const prePlanResume =
    zeroPlanResume &&
    !nativeZeroPlanReentry.native &&
    goal.feasibility_report?.recommendation === 'adjust' &&
    hasStartedAdmission;
  if (zeroPlanResume && nativeZeroPlanReentry.native && !nativeZeroPlanReentry.ready) {
    return {
      status: 409,
      error: nativeZeroPlanReentry.error,
      data: { reasons: nativeZeroPlanReentry.authority?.reasons || [] },
    };
  }
  if (zeroPlanResume && !nativeZeroPlanReentry.native && !prePlanResume) {
    return {
      status: 409,
      error:
        'This zero-plan goal was not paused by an admitted feasibility adjustment. Retry from its originating gate instead of resuming execution.',
    };
  }
  // PO analysis owns the feasibility -> analyzing transition and rejects an
  // already-active goal. A paused pre-plan goal therefore resumes at the last
  // completed gate, not at the execution status used for planned phases.
  const persistedStatus =
    nativeZeroPlanReentry.kind === 'scope_rebuild' ||
    nativeZeroPlanReentry.kind === 'initial_scope_admission'
      ? 'analyzing'
      : nativeZeroPlanReentry.kind === 'planning'
        ? 'planning'
        : prePlanResume
          ? 'feasibility'
          : newStatus;
  const lifecycleTransitionAt = new Date().toISOString();
  const lifecycleUpdates = {
    status: persistedStatus,
    updated_at: lifecycleTransitionAt,
    ...(nativeZeroPlanReentry.kind === 'planning'
      ? {
          data: invalidateNativeExecutionForCanonicalReplan(
            goal.data || {},
            'zero_plan_resume_replanning'
          ),
        }
      : {}),
  };
  let transitioned = null;
  if (nativeZeroPlanReentry.kind === 'planning') {
    transitioned = (await updateGoalIfNativeScopeBinding(
      admin,
      id,
      goal.status,
      nativeZeroPlanReentry.binding,
      lifecycleUpdates
    ))
      ? { id, status: persistedStatus }
      : null;
  } else if (nativeZeroPlanReentry.kind === 'scope_rebuild') {
    transitioned = (await updateGoalIfPendingNativeRevision(
      admin,
      goal,
      user.id,
      goal.status,
      nativeZeroPlanReentry.revisionToken,
      lifecycleUpdates
    ))
      ? { id, status: persistedStatus }
      : null;
  } else if (nativeZeroPlanReentry.kind === 'initial_scope_admission') {
    transitioned = (await updateGoalIfInitialNativeScopeAdmission(
      admin,
      goal,
      user.id,
      goal.status,
      nativeZeroPlanReentry.binding,
      lifecycleUpdates
    ))
      ? { id, status: persistedStatus }
      : null;
  } else {
    const transition = await admin
      .from('goals')
      .update(lifecycleUpdates)
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', goal.status)
      .select('id, status')
      .maybeSingle();
    if (transition.error) throw transition.error;
    transitioned = transition.data;
  }
  if (!transitioned) {
    return {
      status: 409,
      error: 'Goal status changed while it was being resumed. Refresh and try again.',
    };
  }

  // If resuming, re-enqueue the pipeline at the correct stage based on
  // how far the goal got before it was paused.
  //
  // Previously: always looked for a `pending` phase and enqueued execute-phase.
  // When a goal was paused pre-planning (e.g. feasibility said "adjust"),
  // plan.phases is null → findIndex returned -1 → nothing was enqueued →
  // goal sat zombie `active`. Then execute-phase.js:22 with phaseIndex=0 on
  // an empty-phase plan would trigger `complete` → goal stamped done with
  // no work. This routes to the correct stage instead.
  let resumeAction = null;
  let resumeJobId = null;
  if (newStatus === 'active') {
    let resumePayload = { type: 'orchestrate-goal', goalId: id };

    if (
      nativeZeroPlanReentry.kind === 'scope_rebuild' ||
      nativeZeroPlanReentry.kind === 'initial_scope_admission'
    ) {
      resumeAction = 'scope-admission';
      resumePayload.action = resumeAction;
      if (nativeZeroPlanReentry.kind === 'scope_rebuild') {
        Object.assign(resumePayload, scopeRevisionContinuationPayload(goal));
      }
    } else if (nativeZeroPlanReentry.kind === 'planning') {
      resumeAction = 'pm-planning';
      resumePayload.action = resumeAction;
    } else if (phases.length === 0) {
      // No plan yet — pipeline was paused pre-planning. Restart at po-analysis
      // which will re-run pm-planning, team-formation, etc.
      resumeAction = 'po-analysis';
      resumePayload.action = 'po-analysis';
    } else {
      const runningIdx = phases.findIndex(
        (p) => p.status === 'running' || p.status === 'executing'
      );
      const pendingIdx = phases.findIndex((p) => p.status === 'pending');
      if (runningIdx >= 0) {
        // A phase was mid-run — re-evaluate it
        resumeAction = 'evaluate-phase';
        resumePayload.action = 'evaluate-phase';
        resumePayload.phaseIndex = runningIdx;
      } else if (pendingIdx >= 0) {
        // Start next pending phase
        resumeAction = 'execute-phase';
        resumePayload.action = 'execute-phase';
        resumePayload.phaseIndex = pendingIdx;
      }
    }

    if (resumeAction) {
      const { jobId, error: enqueueError } = await enqueueGoalWorkerJob(admin, {
        user_id: user.id,
        status: 'queued',
        payload: resumePayload,
      });
      resumeJobId = jobId;
      if (enqueueError) {
        if (goalWorkerEnqueueNeedsReconciliation(enqueueError)) {
          return goalWorkerEnqueueReconciliationFailure(enqueueError);
        }
        const rollbackAt = new Date().toISOString();
        const { data: rolledBack, error: rollbackError } = await admin
          .from('goals')
          .update({
            status: goal.status,
            ...(Object.prototype.hasOwnProperty.call(lifecycleUpdates, 'data')
              ? { data: goal.data }
              : {}),
            updated_at: rollbackAt,
          })
          .eq('id', id)
          .eq('user_id', user.id)
          .eq('status', persistedStatus)
          .eq('updated_at', lifecycleTransitionAt)
          .select('id, status')
          .maybeSingle();
        const rollbackSucceeded = !rollbackError && Boolean(rolledBack);
        if (!rollbackSucceeded) {
          log.error(null, 'goal.resume.enqueue-rollback.failed', {
            goalId: id,
            error: rollbackError?.message || 'goal status changed before rollback',
          });
        }
        return {
          status: 503,
          error: rollbackSucceeded
            ? 'Goal processing could not be queued. The goal remains paused; retry resume.'
            : 'Goal processing could not be queued and its status changed during recovery. Refresh before retrying.',
        };
      }
    }
  }

  await admin.from('goal_log').insert({
    goal_id: id,
    event_type: `goal_${newStatus}`,
    details: {
      previousStatus: goal.status,
      persistedStatus,
      ...(resumeAction ? { resumeAction } : {}),
    },
  });

  if (resumeAction) {
    const handoff = await requestGoalProcessingHandoff(admin, id, {
      jobId: resumeJobId,
      userId: user.id,
      kickProcessing,
      operation: 'resume',
      rollbackGoalOnSafeFailure: () =>
        rollbackExactGoalHandoff(admin, {
          goalId: id,
          userId: user.id,
          expectedStatus: persistedStatus,
          expectedUpdatedAt: lifecycleTransitionAt,
          restore: {
            status: goal.status,
            ...(Object.prototype.hasOwnProperty.call(lifecycleUpdates, 'data')
              ? { data: goal.data }
              : {}),
          },
        }),
    });
    if (!handoff.ok) return goalProcessingHandoffFailure(handoff);
  }

  return {
    status: 200,
    data: {
      id,
      status: persistedStatus,
      ...(resumeAction ? { resume_action: resumeAction } : {}),
    },
  };
}

/**
 * Reset a failed goal and restart its pipeline from feasibility analysis.
 * Preserves the goal id, title, description, budget, and team — only resets
 * runtime state (status, iteration, phases, deliverables, failure_reason).
 */
async function handleRetry(admin, user, query) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };

  const { data: goal } = await admin
    .from('goals')
    .select('id, status, iteration, data, plan, agent_team_id, team_id, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!goal) return { status: 404, error: 'Goal not found' };
  if (goal.status !== 'failed' && goal.status !== 'cancelled') {
    return { status: 400, error: `Goal is ${goal.status}, not failed or cancelled — cannot retry` };
  }
  const nativeReentry = nativeReentryState(goal);
  if (nativeReentry.native && !nativeReentry.ready) {
    return {
      status: 409,
      error: nativeReentry.error,
      data: { reasons: nativeReentry.authority?.reasons || [] },
    };
  }

  // Reset phase statuses to pending so the pipeline can re-execute them
  const resetPhases = (goal.plan?.phases || []).map((p) => ({
    ...p,
    status: 'pending',
    started_at: null,
    completed_at: null,
    duration_ms: null,
    quality_score: null,
  }));

  const retriedAt = new Date().toISOString();
  const retryCount = Number(goal.data?.retry_count || 0) + 1;
  const retryBaseData = {
    ...(goal.data || {}),
    failure_reason: null,
    failed_at: null,
    deployment_url: null,
    deliverables: [],
    phase_costs: {},
    completed_at: null,
    retried_at: retriedAt,
    retry_count: retryCount,
    // A full retry begins a new Orqaly-owned task attempt before AxWise (if
    // enabled) creates its immutable decision. Clearing the current pointer
    // prevents the old decision from hiding new local/no-AxWise task rows.
    axwise_orchestration: {
      decision_id: null,
      status: 'retry_pending',
      reason: 'goal_retried',
      iteration: 0,
      retry_count: retryCount,
      applied: false,
      created_at: retriedAt,
    },
    goal_task_attempt: {
      version: 1,
      retry_count: retryCount,
      started_at: retriedAt,
    },
    // Tool setup may still degrade on retry, but both human confirmations
    // are invalidated and can never be bypassed by this compatibility flag.
  };
  const resetData = nativeReentry.native
    ? nativeReentry.kind === 'planning'
      ? invalidateNativeExecutionForCanonicalReplan(
          {
            ...retryBaseData,
            retry_skip_gates: false,
          },
          'goal_retried'
        )
      : nativeReentry.kind === 'initial_scope_admission'
        ? {
            ...retryBaseData,
            retry_skip_gates: false,
            smart_request_admission: {
              ...(retryBaseData.smart_request_admission || {}),
              status: 'started',
            },
            scope_admission: {
              ...(retryBaseData.scope_admission || {}),
              status: 'queued',
              queued_at: retriedAt,
            },
          }
        : {
            ...retryBaseData,
            retry_skip_gates: false,
          }
    : {
        ...retryBaseData,
        retry_skip_gates: true,
        goal_approvals: {
          ...(goal.data?.goal_approvals || {}),
          context: invalidatedApproval(goal.data?.goal_approvals?.context, 'goal_retried'),
          execution: invalidatedApproval(goal.data?.goal_approvals?.execution, 'goal_retried'),
        },
      };
  const retryStatus =
    nativeReentry.kind === 'scope_rebuild' || nativeReentry.kind === 'initial_scope_admission'
      ? 'analyzing'
      : 'planning';
  const retryUpdates = {
    status: retryStatus,
    iteration: 0,
    ...(!nativeReentry.native ? { plan: { ...(goal.plan || {}), phases: resetPhases } } : {}),
    ...(nativeReentry.kind === 'planning' ? { agent_team_id: null, team_id: null } : {}),
    data: resetData,
    updated_at: retriedAt,
  };
  let retried = false;
  if (nativeReentry.kind === 'planning') {
    retried = await updateGoalIfNativeScopeBinding(
      admin,
      id,
      goal.status,
      nativeReentry.binding,
      retryUpdates
    );
  } else if (nativeReentry.kind === 'scope_rebuild') {
    retried = await updateGoalIfPendingNativeRevision(
      admin,
      goal,
      user.id,
      goal.status,
      nativeReentry.revisionToken,
      retryUpdates
    );
  } else if (nativeReentry.kind === 'initial_scope_admission') {
    retried = await updateGoalIfInitialNativeScopeAdmission(
      admin,
      goal,
      user.id,
      goal.status,
      nativeReentry.binding,
      retryUpdates
    );
  } else {
    const { data: transitioned, error: transitionError } = await admin
      .from('goals')
      .update(retryUpdates)
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', goal.status)
      .eq('updated_at', goal.updated_at)
      .select('id')
      .maybeSingle();
    if (transitionError) throw transitionError;
    retried = Boolean(transitioned);
  }
  if (!retried) {
    return { status: 409, error: 'Goal state changed while retrying. Refresh and try again.' };
  }

  const retryAction =
    nativeReentry.kind === 'scope_rebuild' || nativeReentry.kind === 'initial_scope_admission'
      ? 'scope-admission'
      : nativeReentry.kind === 'planning'
        ? 'pm-planning'
        : 'feasibility-analysis';
  const { jobId, error: enqueueError } = await enqueueGoalWorkerJob(admin, {
    user_id: user.id,
    status: 'queued',
    payload: {
      type: 'orchestrate-goal',
      action: retryAction,
      goalId: id,
      ...(nativeReentry.kind === 'scope_rebuild' ? scopeRevisionContinuationPayload(goal) : {}),
    },
  });
  if (enqueueError) {
    if (goalWorkerEnqueueNeedsReconciliation(enqueueError)) {
      return goalWorkerEnqueueReconciliationFailure(enqueueError);
    }
    const rollbackAt = new Date().toISOString();
    const { data: rolledBack, error: rollbackError } = await admin
      .from('goals')
      .update({
        status: goal.status,
        iteration: goal.iteration,
        plan: goal.plan,
        agent_team_id: goal.agent_team_id,
        team_id: goal.team_id,
        data: goal.data,
        updated_at: rollbackAt,
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', retryStatus)
      .eq('updated_at', retriedAt)
      .eq('data->>retry_count', String(retryCount))
      .select('id')
      .maybeSingle();
    const rollbackSucceeded = !rollbackError && Boolean(rolledBack);
    log.error(null, 'goal.retry.enqueue-failed', {
      goalId: id,
      error: enqueueError.message,
      rollbackSucceeded,
      ...(rollbackError ? { rollbackError: rollbackError.message } : {}),
    });
    return {
      status: 503,
      error: rollbackSucceeded
        ? 'Goal retry could not be queued. The previous goal state was restored; retry again.'
        : 'Goal retry could not be queued and recovery could not be verified. Refresh before retrying.',
    };
  }
  const handoff = await requestGoalProcessingHandoff(admin, id, {
    jobId,
    userId: user.id,
    operation: 'retry',
    rollbackGoalOnSafeFailure: () =>
      rollbackExactGoalHandoff(admin, {
        goalId: id,
        userId: user.id,
        expectedStatus: retryStatus,
        expectedUpdatedAt: retriedAt,
        expectedFilters: [['eq', 'data->>retry_count', String(retryCount)]],
        restore: {
          status: goal.status,
          iteration: goal.iteration,
          plan: goal.plan,
          agent_team_id: goal.agent_team_id,
          team_id: goal.team_id,
          data: goal.data,
        },
      }),
  });
  if (!handoff.ok) return goalProcessingHandoffFailure(handoff);

  await admin.from('goal_log').insert({
    goal_id: id,
    event_type: 'goal_retried',
    details: { previousStatus: goal.status, retry_count: resetData.retry_count },
  });

  return {
    status: 200,
    data: {
      id,
      status: retryStatus,
      ...(nativeReentry.native ? { retry_action: retryAction } : {}),
      retry_count: resetData.retry_count,
    },
  };
}

const ACTIVE_OSJA_REVIEW_JOB_STATUSES = ['queued', 'running'];
const EXPLICIT_RETRYABLE_QUALITY_REVIEW_STATUSES = new Set(['review_incomplete', 'review_failed']);

function isQualityReviewRetryEligible(goal) {
  const qualityReview = goal?.data?.quality_review;
  if (!qualityReview || typeof qualityReview !== 'object') return false;

  const status = String(qualityReview.status || '')
    .trim()
    .toLowerCase();
  if (EXPLICIT_RETRYABLE_QUALITY_REVIEW_STATUSES.has(status)) return true;

  // Before validated/invalid accounting was introduced, schema-v2 reports
  // could be stamped needs_revision even when their model verdicts had failed
  // validation. This is the bounded compatibility path for those reports. An
  // accepted report is never retryable, and a fully accounted needs_revision
  // report represents genuine upgrade feedback rather than a failed review.
  if (status !== 'needs_revision' || Number(qualityReview.schema_version) !== 2) return false;

  // Fail closed for partially populated or malformed accounting. The known
  // legacy defect predates both fields entirely; any newer row carrying
  // either field must be repaired by the normal review pipeline, not retried
  // through this compatibility exception.
  return qualityReview.validated_review_count == null && qualityReview.invalid_review_count == null;
}

async function findActiveFullOsjaReviewJob(admin, goalId, workerScope, deploymentIdentity = null) {
  let query = admin
    .from('agent_jobs')
    .select('id, status, payload, worker_scope, created_at')
    .eq('worker_scope', workerScope)
    .eq('payload->>type', 'orchestrate-goal')
    .eq('payload->>action', 'osja-review')
    .eq('payload->>goalId', String(goalId))
    .in('status', ACTIVE_OSJA_REVIEW_JOB_STATUSES);
  if (workerScope === 'preview') {
    query = query.eq(`payload->>${WORKER_DEPLOYMENT_PAYLOAD_KEY}`, deploymentIdentity);
  }
  const { data, error } = await query.order('created_at', { ascending: false }).limit(25);

  if (error) {
    throw new Error(`Unable to inspect active Osja review jobs: ${error.message}`);
  }

  return (
    (data || []).find(
      (job) => !Object.prototype.hasOwnProperty.call(job?.payload || {}, 'singleDeliverableId')
    ) || null
  );
}

/**
 * Manually re-run the full post-completion Osja review.
 *
 * This route is deliberately separate from the broad goal retry operation:
 * it never changes goal/task state and only queues the same full review stage
 * used by normal completion. Ownership is checked before the service-role
 * client is allowed to inspect or mutate the queue.
 */
export async function handleRerunQualityReview(
  admin,
  user,
  query,
  {
    env = process.env,
    workerScope = resolveWorkerScope(env),
    deploymentIdentity = resolveWorkerDeploymentIdentity(env),
    kick = kickGoalProcessing,
  } = {}
) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };

  const { data: goal, error: goalError } = await admin
    .from('goals')
    .select('id, status, data, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (goalError) throw goalError;
  if (!goal) return { status: 404, error: 'Goal not found' };
  if (goal.status !== 'completed') {
    return {
      status: 409,
      error: `Quality review can only be re-run for completed goals (current status: ${goal.status})`,
    };
  }

  const deliverables = Array.isArray(goal.data?.deliverables) ? goal.data.deliverables : [];
  if (deliverables.length === 0) {
    return { status: 409, error: 'This completed goal has no deliverables to review' };
  }
  if (!isQualityReviewRetryEligible(goal)) {
    return {
      status: 409,
      error:
        'Quality review retry is only available when the latest review is incomplete or failed',
    };
  }

  const nativeAuthority = resolveAcceptedNativeGoalAuthority(goal);
  if (nativeAuthority.native && !nativeAuthority.ready) {
    return {
      status: 409,
      error: `Quality review is blocked because native scope authority is stale: ${nativeAuthority.reasons.join(', ')}`,
    };
  }
  const nativeScopeHash = nativeAuthority.native ? nativeAuthority.packet.scope_hash : null;

  // Preview queues are shared across deployments. Without an immutable
  // deployment identity, inserting here would create a deliberately unclaimable
  // row, so fail before inspecting or mutating the queue.
  if (workerScope === 'preview' && !deploymentIdentity) {
    return { status: 503, error: 'Preview deployment identity is unavailable' };
  }

  const acknowledgeExisting = async (existingJob) => {
    if (
      nativeScopeHash &&
      String(existingJob?.payload?.scopeHash || '') !== String(nativeScopeHash)
    ) {
      return {
        status: 409,
        error:
          'An active quality-review job belongs to an older native scope. Let it settle before retrying the current scope.',
      };
    }
    if (workerScope === 'preview') {
      if (existingJob.status !== 'queued') {
        return {
          status: 503,
          error:
            'The existing Preview quality-review worker lease needs reconciliation. Refresh before retrying.',
        };
      }
      const handoff = await requestGoalProcessingHandoff(admin, id, {
        jobId: existingJob.id,
        userId: user.id,
        env,
        kickProcessing: kick,
        operation: 'rerun-quality-review-existing',
        rollbackGoalOnSafeFailure: () =>
          verifyUnchangedGoalHandoff(admin, {
            goalId: id,
            userId: user.id,
            status: goal.status,
            updatedAt: goal.updated_at,
            data: goal.data,
          }),
      });
      if (!handoff.ok) return goalProcessingHandoffFailure(handoff);
    }
    return {
      status: 202,
      data: {
        id,
        job_id: existingJob.id,
        status: existingJob.status,
        worker_scope: existingJob.worker_scope || workerScope,
        already_queued: true,
      },
    };
  };

  const existing = await findActiveFullOsjaReviewJob(admin, id, workerScope, deploymentIdentity);
  if (existing) {
    return acknowledgeExisting(existing);
  }

  const payload = bindJobPayloadToWorkerDeployment(
    {
      type: 'orchestrate-goal',
      action: 'osja-review',
      goalId: id,
      _userId: user.id,
      userId: user.id,
      user_id: user.id,
      manualRetry: true,
      ...(nativeScopeHash ? { scopeHash: nativeScopeHash } : {}),
    },
    env
  );
  const { data: job, error: insertError } = await admin
    .from('agent_jobs')
    .insert({
      status: 'queued',
      user_id: user.id,
      worker_scope: workerScope,
      payload,
    })
    .select('id, status, worker_scope')
    .single();

  if (insertError) {
    // Migration 201 closes the concurrent manual read-before-insert race. If
    // another request won, return its active job as the idempotent result.
    if (insertError.code === '23505') {
      const racedJob = await findActiveFullOsjaReviewJob(
        admin,
        id,
        workerScope,
        deploymentIdentity
      );
      if (racedJob) {
        return acknowledgeExisting(racedJob);
      }
    }
    throw new Error(`Unable to enqueue Osja quality review: ${insertError.message}`);
  }

  const { error: logError } = await admin.from('goal_log').insert({
    goal_id: id,
    event_type: 'osja_review_retry_requested',
    details: {
      actor: user.id,
      job_id: job.id,
      worker_scope: job.worker_scope || workerScope,
      deliverable_count: deliverables.length,
    },
  });
  if (logError) {
    log.warn(null, 'goal.osja-review.retry-log-failed', {
      goalId: id,
      jobId: job.id,
      error: logError.message,
    });
  }

  const handoff = await requestGoalProcessingHandoff(admin, id, {
    jobId: job.id,
    userId: user.id,
    env,
    kickProcessing: kick,
    operation: 'rerun-quality-review',
    rollbackGoalOnSafeFailure: () =>
      verifyUnchangedGoalHandoff(admin, {
        goalId: id,
        userId: user.id,
        status: goal.status,
        updatedAt: goal.updated_at,
        data: goal.data,
      }),
  });
  if (!handoff.ok) return goalProcessingHandoffFailure(handoff);

  log.info(null, 'goal.osja-review.retry-requested', {
    goalId: id,
    jobId: job.id,
    workerScope: job.worker_scope || workerScope,
  });

  return {
    status: 202,
    data: {
      id,
      job_id: job.id,
      status: job.status || 'queued',
      worker_scope: job.worker_scope || workerScope,
      already_queued: false,
    },
  };
}

/**
 * Resolve a goal stuck in needs_human / failed / paused status with a
 * targeted fix + resume, instead of the full-reset handleRetry flow.
 *
 * Body: { goalId, resolution: { type, data } }
 * Resolution types (see plan: composed-mixing-floyd.md):
 *   increase_budget, increase_iterations, switch_model, patch_plan,
 *   skip_stuck_phase, retry_from_stage, retry_customer_research, custom_instruction
 *
 * Each resolution: validates ownership, applies the patch, clears
 * failure_reason, sets status='active', enqueues the appropriate next
 * stage, logs a 'goal_resolved_by_human' event with the resolution.
 */
function nativeExecutionPlanRevisionFeedback(type, data = {}) {
  if (type === 'custom_instruction')
    return String(data.note || '')
      .trim()
      .slice(0, 4000);
  if (type === 'patch_plan') {
    const supplied = JSON.stringify(data.phases || []);
    return `Regenerate the execution plan using this owner-requested phase structure as advisory input: ${supplied}`.slice(
      0,
      4000
    );
  }
  if (type === 'skip_stuck_phase') {
    return `Regenerate the execution plan without the blocked phase at index ${Number(data.phaseIndex)}.`;
  }
  if (type === 'increase_budget') {
    return `Regenerate the execution plan within the updated approved budget of $${Number(data.new_budget_usd)}.`;
  }
  if (type === 'increase_iterations') {
    return `Regenerate the execution plan after the owner increased the iteration allowance to ${Number(data.new_max)}.`;
  }
  if (type === 'switch_model') {
    return `Regenerate the execution plan using ${String(data.provider)}/${String(data.model)} while preserving the accepted scope.`;
  }
  if (type === 'disable_tools') {
    return 'Regenerate the execution plan without external tools for the requested retry.';
  }
  if (type === 'retry_from_stage') {
    return `Regenerate the execution plan from the canonical PM boundary instead of retrying legacy stage ${String(data.stage || '')}.`;
  }
  return 'Regenerate the execution plan from the accepted native AxWise scope.';
}

async function handleResolve(admin, user, body) {
  const goalId = body?.goalId;
  const resolution = body?.resolution;
  if (!goalId) return { status: 400, error: 'goalId is required' };
  if (!resolution?.type) return { status: 400, error: 'resolution.type is required' };

  const { data: goal } = await admin
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .single();
  if (!goal) return { status: 404, error: 'Goal not found' };

  const resolvable = ['needs_human', 'failed', 'paused', 'awaiting_approval', 'awaiting_tools'];
  if (!resolvable.includes(goal.status)) {
    return {
      status: 400,
      error: `Goal status "${goal.status}" is not resolvable (must be one of: ${resolvable.join(', ')})`,
    };
  }

  const resolutionHistory = Array.isArray(goal.data?.resolution_history)
    ? goal.data.resolution_history
    : [];
  const resolutionAt = new Date().toISOString();
  const historyEntry = {
    at: resolutionAt,
    type: resolution.type,
    data: resolution.data || {},
    from_status: goal.status,
  };

  // Base update: clear the failure, back to active, append history.
  const baseData = {
    ...(goal.data || {}),
    failure_code: null,
    failure_reason: null,
    failure_stage: null,
    failure_phase_index: null,
    recovery_action: null,
    failure_at: null,
    failure_stack: null,
    failed_at: null,
    resolution_history: [...resolutionHistory, historyEntry],
  };

  let updates = { status: 'active', data: baseData, updated_at: resolutionAt };
  let nextAction = 'iterate';
  let nextPayload = { goalId };
  let researchRetryContext = null;
  let nativeAcceptedResearchRetry = false;
  let nativeEvidenceRefreshResearchRetry = false;

  const t = resolution.type;
  const d = resolution.data || {};
  const nativeReentry = nativeReentryState(goal);

  if (t === 'increase_budget') {
    const n = Number(d.new_budget_usd || 0);
    if (!(n > 0 && n <= 10000))
      return { status: 400, error: 'new_budget_usd must be a positive number ≤ 10000' };
    updates.budget_usd = n;
    nextAction = 'iterate';
  } else if (t === 'increase_iterations') {
    const n = Number(d.new_max || 0);
    if (!(n >= 1 && n <= 50)) return { status: 400, error: 'new_max must be 1-50' };
    updates.max_iterations = n;
    updates.iteration = 0;
    nextAction = 'iterate';
  } else if (t === 'switch_model') {
    if (!d.provider || !d.model)
      return { status: 400, error: 'switch_model requires provider + model' };
    updates.data = { ...baseData, test_model: { provider: d.provider, model: d.model } };
    // If we haven't finished planning yet, re-do pm-planning with the new
    // model. Otherwise keep the plan + re-enqueue iterate to retry execution.
    const hasPlan = Array.isArray(goal.plan?.phases) && goal.plan.phases.length > 0;
    nextAction = hasPlan ? 'iterate' : 'pm-planning';
  } else if (t === 'patch_plan') {
    if (!Array.isArray(d.phases)) return { status: 400, error: 'patch_plan requires phases array' };
    updates.plan = { ...(goal.plan || {}), phases: d.phases };
    nextAction = 'team-formation';
  } else if (t === 'rebuild_team') {
    // For a goal blocked by a structurally invalid authorization manifest: the
    // team, not the plan, is wrong. Drop the team and re-form it so an agent
    // exists for every role the plan actually demands.
    updates.status = 'forming_team';
    updates.agent_team_id = null;
    updates.team_id = null;
    updates.data = {
      ...baseData,
      goal_approvals: {
        ...(goal.data?.goal_approvals || {}),
        execution: invalidatedApproval(
          goal.data?.goal_approvals?.execution,
          'team_rebuild_requested'
        ),
      },
      execution_authorization: null,
      team_coverage: null,
      // Let an unattended goal approve the rebuilt manifest, and stop the
      // healer re-escalating a goal a person just repaired.
      hitl_auto_approvals: { ...(goal.data?.hitl_auto_approvals || {}), execution: 0 },
      heal_attempts: 0,
      last_heal_strategy: null,
    };
    nextAction = 'team-formation';
  } else if (t === 'skip_stuck_phase') {
    const idx = Number(d.phaseIndex);
    const phases = Array.isArray(goal.plan?.phases) ? [...goal.plan.phases] : [];
    if (!(idx >= 0 && idx < phases.length))
      return { status: 400, error: `phaseIndex out of range (0..${phases.length - 1})` };
    phases[idx] = { ...phases[idx], status: 'completed', skipped_by_human: true };
    updates.plan = { ...(goal.plan || {}), phases };
    const nextIdx = phases.findIndex((p, i) => i > idx && p.status !== 'completed');
    nextAction = nextIdx >= 0 ? 'execute-phase' : 'complete';
    if (nextIdx >= 0) nextPayload.phaseIndex = nextIdx;
  } else if (t === 'retry_from_stage') {
    const validStages = Object.keys(RETRY_STAGE_GOAL_STATUS);
    if (!Object.prototype.hasOwnProperty.call(RETRY_STAGE_GOAL_STATUS, d.stage)) {
      return { status: 400, error: `stage must be one of: ${validStages.join(', ')}` };
    }
    updates.status = RETRY_STAGE_GOAL_STATUS[d.stage];
    nextAction = d.stage;
    if (d.stage === 'execute-phase' && Number.isInteger(d.phaseIndex) && d.phaseIndex >= 0) {
      nextPayload.phaseIndex = d.phaseIndex;
    }
  } else if (t === 'retry_customer_research') {
    const intelligence = goal.data?.axwise_customer_intelligence || {};
    if (goal.status !== 'needs_human' || intelligence.status !== 'required_research_blocked') {
      return {
        status: 400,
        error: 'Customer research can only be retried after a required research run is blocked',
      };
    }
    if (intelligence.research_failure?.retryable === false) {
      return { status: 409, error: 'This research failure is not retryable' };
    }
    const retryCount = Number(intelligence.retry_count || 0);
    if (!Number.isInteger(retryCount) || retryCount < 0 || retryCount >= 3) {
      return {
        status: 409,
        error:
          'Customer research retry limit reached; review the research service before continuing',
      };
    }

    const retriedAt = new Date().toISOString();
    const researchPolicy = goal.data?.research_policy || intelligence.research_policy || null;
    nativeAcceptedResearchRetry = nativeReentry.kind === 'planning';
    nativeEvidenceRefreshResearchRetry = Boolean(
      nativeReentry.kind === 'scope_rebuild' &&
      goal.data?.scope_revision?.kind === 'evidence_refresh' &&
      nativeReentry.authority?.packet &&
      intelligence.scope_packet
    );
    if (
      nativeReentry.native &&
      !nativeAcceptedResearchRetry &&
      nativeReentry.kind !== 'scope_rebuild' &&
      (goal.data?.scope_admission?.status === 'accepted' ||
        goal.data?.work_shape_route?.authoritative_scope === true)
    ) {
      return {
        status: 409,
        error: nativeReentry.error,
        data: { reasons: nativeReentry.authority?.reasons || [] },
      };
    }
    const evidenceRevisionToken = nativeAcceptedResearchRetry
      ? randomUUID()
      : nativeEvidenceRefreshResearchRetry
        ? nativeReentry.revisionToken
        : null;
    const retryFeedback = String(
      intelligence.research_failure?.message ||
        intelligence.reason ||
        'Retry the required evidence run for the accepted scope.'
    )
      .trim()
      .slice(0, 4000);
    const retryBasePacket = nativeReentry.authority?.packet || intelligence.scope_packet || null;
    const previousNativeScope = retryBasePacket
      ? {
          version: 'orqaly_previous_native_scope_contract_v1',
          packet_version: retryBasePacket.version || null,
          scope_ref: retryBasePacket.scope_ref || null,
          scope_hash: retryBasePacket.scope_hash,
          confirmation_scope_hash:
            intelligence.axwise_scope_confirmation?.scope_hash ||
            nativeReentry.authority?.confirmation?.scope_hash ||
            null,
          generation: intelligence.generation ?? null,
          scope_updated_at: intelligence.updated_at || null,
          context_snapshot_hash: goal.data?.goal_approvals?.context?.snapshot_hash || null,
          scope_packet: retryBasePacket,
          scope_validation:
            intelligence.scope_validation || nativeReentry.authority?.validation || null,
          scope_confirmation:
            intelligence.axwise_scope_confirmation || nativeReentry.authority?.confirmation || null,
          scope_contract_binding:
            intelligence.scope_contract_binding || nativeReentry.authority?.binding || null,
          revised_at: retriedAt,
        }
      : intelligence.previous_scope_contract || null;
    const retryIntelligence =
      nativeAcceptedResearchRetry || nativeEvidenceRefreshResearchRetry
        ? {
            ...intelligence,
            status: 'evidence_requested',
            degraded: false,
            decision_id: null,
            parent_decision_id: null,
            job_id: null,
            generation: null,
            request_id: null,
            request_hash: null,
            requested_at: null,
            routing_mode: null,
            persona_resolution: null,
            working_hypothesis: null,
            research_bundle: null,
            research_bundle_summary: null,
            research_bundle_full: null,
            current_stage: null,
            progress_percentage: 0,
            elapsed_ms: 0,
            stage_trace: [],
            stage_durations_ms: {},
            last_poll_error: null,
            reason: null,
            research_failure: null,
            research_policy: researchPolicy,
            retry_count: retryCount + 1,
            retry_of_decision_id: intelligence.decision_id || null,
            retry_of_job_id: intelligence.job_id || null,
            retried_at: retriedAt,
            user_research_request: {
              feedback: retryFeedback,
              requested_by: user.id,
              requested_at: retriedAt,
            },
            updated_at: retriedAt,
          }
        : {
            version: 'orqaly_customer_intelligence_v2',
            status: 'retry_queued',
            degraded: false,
            decision_id: null,
            job_id: null,
            request_id: null,
            request_hash: null,
            routing_mode: null,
            persona_resolution: null,
            working_hypothesis: null,
            research_bundle: null,
            research_bundle_summary: null,
            research_bundle_full: null,
            current_stage: null,
            progress_percentage: 0,
            elapsed_ms: 0,
            stage_trace: [],
            stage_durations_ms: {},
            last_poll_error: null,
            reason: null,
            research_failure: null,
            research_policy: researchPolicy,
            retry_count: retryCount + 1,
            retry_of_decision_id: intelligence.decision_id || null,
            retry_of_job_id: intelligence.job_id || null,
            retried_at: retriedAt,
            updated_at: retriedAt,
          };
    if (nativeAcceptedResearchRetry || nativeEvidenceRefreshResearchRetry) {
      // One owner acceptance authorizes exactly one immutable paid dispatch.
      // A retry is a new evidence-policy proposal, not a replay of the failed
      // provider job, so remove every old typed/acceptance identity before the
      // admission-only AxWise call.
      for (const key of [
        'scope_packet',
        'scope_validation',
        'quality_contract',
        'axwise_scope_confirmation',
        'scope_contract_binding',
        'research_execution_inputs_hash',
        'proposal_decision_id',
        'scope_research_acceptance',
        'axwise_scope_handoff',
      ]) {
        delete retryIntelligence[key];
      }
      retryIntelligence.previous_scope_contract = previousNativeScope;
    }
    updates = {
      status: 'researching_customer',
      updated_at: retriedAt,
      data: {
        ...baseData,
        ...(researchPolicy ? { research_policy: researchPolicy } : {}),
        axwise_customer_intelligence: retryIntelligence,
        ...(nativeAcceptedResearchRetry || nativeEvidenceRefreshResearchRetry
          ? {
              work_shape_route: null,
              scope_admission: {
                version: 1,
                native_scope: true,
                status: 'evidence_requested',
                state_key: 'axwise_customer_intelligence',
                scope_hash: null,
                playbook_id: null,
                route_version: WORK_SHAPE_ROUTE_VERSION,
                accepted_at: null,
                requires_authorization: false,
                maximum_side_effect: 'none',
                grants_authorization: false,
                updated_at: retriedAt,
              },
              context_revision_feedback: retryFeedback,
              scope_revision: nativeEvidenceRefreshResearchRetry
                ? {
                    ...(goal.data?.scope_revision || {}),
                    version: 'orqaly_scope_revision_v1',
                    status: 'pending_rebuild',
                    revision_token: evidenceRevisionToken,
                    kind: 'evidence_refresh',
                    desired_outcome: retryFeedback,
                    requested_by: user.id,
                    requested_at: retriedAt,
                  }
                : {
                    version: 'orqaly_scope_revision_v1',
                    status: 'pending_rebuild',
                    base_kind: 'accepted_native_scope',
                    revision_token: evidenceRevisionToken,
                    kind: 'evidence_refresh',
                    desired_outcome: retryFeedback,
                    source_decision_id: intelligence.decision_id || null,
                    source_scope_hash: nativeReentry.authority.packet.scope_hash,
                    source_generation: intelligence.generation ?? null,
                    source_job_id: intelligence.job_id || null,
                    requested_by: user.id,
                    requested_at: retriedAt,
                  },
            }
          : {}),
        goal_approvals: {
          ...(goal.data?.goal_approvals || {}),
          context: invalidatedApproval(
            goal.data?.goal_approvals?.context,
            'customer_research_retried'
          ),
          execution: invalidatedApproval(
            goal.data?.goal_approvals?.execution,
            'customer_research_retried'
          ),
        },
      },
    };
    nextAction = 'customer-intelligence';
    if (evidenceRevisionToken) {
      nextPayload.scope_revision_token = evidenceRevisionToken;
    }
    researchRetryContext = {
      previous: intelligence,
      retryCount,
      nextRetryCount: retryCount + 1,
      nativeAccepted: nativeAcceptedResearchRetry,
      nativeEvidenceRefresh: nativeEvidenceRefreshResearchRetry,
      revisionToken: evidenceRevisionToken,
    };
  } else if (t === 'custom_instruction') {
    if (!d.note) return { status: 400, error: 'custom_instruction requires note' };
    const existingNotes = goal.data?.human_notes || '';
    updates.data = {
      ...baseData,
      human_notes: existingNotes
        ? `${existingNotes}\n\n[${new Date().toISOString()}]\n${d.note}`
        : `[${new Date().toISOString()}]\n${d.note}`,
    };
    const validStages = [
      'scope-admission',
      'feasibility-analysis',
      'po-analysis',
      'pm-planning',
      'team-formation',
      'execute-phase',
      'iterate',
    ];
    nextAction = validStages.includes(d.retry_stage) ? d.retry_stage : 'iterate';
  } else if (t === 'disable_tools') {
    // Retry a phase with MCP tools hard-disabled for this run. The flag is
    // one-shot: execute-phase reads goal.data.skip_tools, runs the agent with an
    // empty toolkit, then clears it so normal tool use resumes afterwards.
    updates.data = {
      ...baseData,
      skip_tools: true,
      skip_tools_reason: d.reason || 'Human requested retry without external tools',
    };
    nextAction = 'execute-phase';
    if (Number.isInteger(d.phaseIndex)) nextPayload.phaseIndex = d.phaseIndex;
  } else {
    return { status: 400, error: `Unknown resolution type: ${t}` };
  }

  let nativeUpdateKind = null;
  if (nativeReentry.native && t !== 'retry_customer_research') {
    if (!nativeReentry.ready) {
      return {
        status: 409,
        error: nativeReentry.error,
        data: { reasons: nativeReentry.authority?.reasons || [] },
      };
    }

    delete updates.plan;
    if (nativeReentry.kind === 'scope_rebuild') {
      // A durable pending revision is the only proof that the owner actually
      // changed scope. Resume that exact generation; all other human fixes are
      // execution-plan work and cannot manufacture a new scope transition.
      updates.status = 'analyzing';
      nextAction = 'scope-admission';
      nextPayload = {
        goalId,
        ...scopeRevisionContinuationPayload(goal),
      };
      nativeUpdateKind = 'scope_rebuild';
    } else if (nativeReentry.kind === 'initial_scope_admission') {
      // This is not a scope correction: it is the exact initial Smart Request
      // admission generation, which has not produced any AxWise packet yet.
      // Retrying it at PM/PO/iterate would create authority out of raw prose.
      updates.status = 'analyzing';
      nextAction = 'scope-admission';
      nextPayload = { goalId };
      nativeUpdateKind = 'initial_scope_admission';
    } else {
      const canonicalPlanningActions = new Set([
        'scope-admission',
        'feasibility-analysis',
        'po-analysis',
        'pm-planning',
        'iterate',
        'complete',
      ]);
      const changesExecutionPlan =
        canonicalPlanningActions.has(nextAction) ||
        [
          'increase_budget',
          'increase_iterations',
          'switch_model',
          'patch_plan',
          'skip_stuck_phase',
          'custom_instruction',
          'disable_tools',
        ].includes(t);
      if (changesExecutionPlan) {
        const feedback = nativeExecutionPlanRevisionFeedback(t, d);
        updates.status = 'planning';
        updates.agent_team_id = null;
        updates.team_id = null;
        updates.data = invalidateNativeExecutionForCanonicalReplan(
          {
            ...(updates.data || baseData),
            native_execution_plan_revision: {
              version: 'orqaly_native_execution_plan_revision_v1',
              status: 'requested',
              scope_hash: nativeReentry.authority.packet.scope_hash,
              feedback,
              requested_by: user.id,
              requested_at: resolutionAt,
              resolution_type: t,
            },
            team_reformation_required: true,
          },
          'human_resolution_replanning'
        );
        nextAction = 'pm-planning';
        nextPayload = { goalId };
      }
      nativeUpdateKind = 'accepted_scope';
    }
  }

  if (nextAction === 'scope-admission' || nextAction === 'customer-intelligence') {
    const revisionToken = pendingScopeRevisionToken(goal);
    if (revisionToken === null) {
      return { status: 409, error: 'The pending AxWise scope rebuild token is missing' };
    }
    Object.assign(nextPayload, scopeRevisionContinuationPayload(goal));
  }

  if (t === 'retry_customer_research') {
    let updated = null;
    if (nativeAcceptedResearchRetry) {
      updated = (await updateGoalIfNativeScopeBinding(
        admin,
        goalId,
        'needs_human',
        nativeReentry.binding,
        updates
      ))
        ? { id: goalId }
        : null;
    } else if (nativeReentry.kind === 'scope_rebuild') {
      updated = (await updateGoalIfPendingNativeRevision(
        admin,
        goal,
        user.id,
        'needs_human',
        nativeReentry.revisionToken,
        updates
      ))
        ? { id: goalId }
        : null;
    } else {
      const result = await admin
        .from('goals')
        .update(updates)
        .eq('id', goalId)
        .eq('user_id', user.id)
        .eq('status', 'needs_human')
        .eq('data->axwise_customer_intelligence->>status', 'required_research_blocked')
        .select('id')
        .maybeSingle();
      if (result.error) {
        return { status: 500, error: `Goal update failed: ${result.error.message}` };
      }
      updated = result.data;
    }
    if (!updated) {
      return {
        status: 409,
        error: 'Customer research was already retried or the goal state changed',
      };
    }
  } else if (nativeUpdateKind === 'scope_rebuild') {
    const updated = await updateGoalIfPendingNativeRevision(
      admin,
      goal,
      user.id,
      goal.status,
      nativeReentry.revisionToken,
      updates
    );
    if (!updated) {
      return {
        status: 409,
        error: 'The pending AxWise scope revision changed. Refresh and retry.',
      };
    }
  } else if (nativeUpdateKind === 'initial_scope_admission') {
    const updated = await updateGoalIfInitialNativeScopeAdmission(
      admin,
      goal,
      user.id,
      goal.status,
      nativeReentry.binding,
      updates
    );
    if (!updated) {
      return { status: 409, error: 'The initial AxWise admission changed. Refresh and retry.' };
    }
  } else if (nativeUpdateKind === 'accepted_scope') {
    const updated = await updateGoalIfNativeScopeBinding(
      admin,
      goalId,
      goal.status,
      nativeReentry.binding,
      updates
    );
    if (!updated) {
      return { status: 409, error: 'The accepted AxWise scope changed. Refresh and retry.' };
    }
  } else {
    const { error: updateErr } = await admin.from('goals').update(updates).eq('id', goalId);
    if (updateErr) return { status: 500, error: `Goal update failed: ${updateErr.message}` };
  }

  const { jobId, error: enqueueErr } = await enqueueGoalWorkerJob(admin, {
    user_id: user.id,
    status: 'queued',
    worker_scope: resolveWorkerScope(),
    payload: { type: 'orchestrate-goal', action: nextAction, ...nextPayload },
  });
  if (enqueueErr) {
    if (goalWorkerEnqueueNeedsReconciliation(enqueueErr)) {
      return goalWorkerEnqueueReconciliationFailure(enqueueErr);
    }
    if (t === 'retry_customer_research' && researchRetryContext) {
      if (researchRetryContext.nativeAccepted || researchRetryContext.nativeEvidenceRefresh) {
        const rolledBack = await rollbackExactGoalHandoff(admin, {
          goalId,
          userId: user.id,
          expectedStatus: 'researching_customer',
          expectedUpdatedAt: updates.updated_at,
          expectedFilters: [
            ['eq', 'data->scope_revision->>revision_token', researchRetryContext.revisionToken],
            ['eq', 'data->axwise_customer_intelligence->>status', 'evidence_requested'],
          ],
          restore: { status: goal.status, data: goal.data },
        });
        if (!rolledBack) {
          log.error(null, 'goal.resolve.research-retry.rollback-failed', {
            goalId,
            error: 'native evidence-refresh generation changed before rollback',
          });
        }
      } else {
        const rollbackAt = new Date().toISOString();
        const enqueueFailure = {
          code: 'research_enqueue_failed',
          message: 'Customer research could not be queued. It is safe to retry.',
          stage: researchRetryContext.previous.research_failure?.stage || null,
          retryable: true,
        };
        const rollbackData = {
          ...(goal.data || {}),
          failure_reason: enqueueFailure.message,
          axwise_customer_intelligence: {
            ...researchRetryContext.previous,
            status: 'required_research_blocked',
            reason: enqueueFailure.message,
            research_failure: enqueueFailure,
            retry_count: researchRetryContext.retryCount,
            updated_at: rollbackAt,
          },
        };
        const { data: rolledBack, error: rollbackErr } = await admin
          .from('goals')
          .update({ status: 'needs_human', data: rollbackData, updated_at: rollbackAt })
          .eq('id', goalId)
          .eq('user_id', user.id)
          .eq('status', 'researching_customer')
          .eq('data->axwise_customer_intelligence->>status', 'retry_queued')
          .eq(
            'data->axwise_customer_intelligence->>retry_count',
            String(researchRetryContext.nextRetryCount)
          )
          .select('id')
          .maybeSingle();
        if (rollbackErr || !rolledBack) {
          log.error(null, 'goal.resolve.research-retry.rollback-failed', {
            goalId,
            error: rollbackErr?.message || 'retry generation changed before rollback',
          });
        }
      }
    }
    return { status: 500, error: 'Customer research could not be queued. Refresh and try again.' };
  }
  const handoff = await requestGoalProcessingHandoff(admin, goalId, {
    jobId,
    userId: user.id,
    operation: 'resolve',
    rollbackGoalOnSafeFailure: () => {
      const restore = { status: goal.status, data: goal.data };
      for (const field of [
        'budget_usd',
        'max_iterations',
        'iteration',
        'plan',
        'agent_team_id',
        'team_id',
      ]) {
        if (Object.prototype.hasOwnProperty.call(updates, field)) {
          restore[field] = goal[field] ?? null;
        }
      }
      return rollbackExactGoalHandoff(admin, {
        goalId,
        userId: user.id,
        expectedStatus: updates.status,
        expectedUpdatedAt: updates.updated_at,
        restore,
      });
    },
  });
  if (!handoff.ok) return goalProcessingHandoffFailure(handoff);

  await admin.from('goal_log').insert({
    goal_id: goalId,
    event_type: 'goal_resolved_by_human',
    details: { resolution_type: t, next_stage: nextAction, from_status: goal.status },
  });

  return {
    status: 200,
    data: { id: goalId, status: updates.status, next_stage: nextAction, resolution_type: t },
  };
}

async function handleUpdateBudget(admin, user, query) {
  const id = query?.id;
  const newBudget = Number(query?.budget || 0);
  if (!id) return { status: 400, error: 'id is required' };
  if (newBudget <= 0) return { status: 400, error: 'budget must be positive' };

  const { data: goal } = await admin
    .from('goals')
    .select('id, budget_usd, status, data')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!goal) return { status: 404, error: 'Goal not found' };

  await admin
    .from('goals')
    .update({
      budget_usd: newBudget,
      data: {
        ...(goal.data || {}),
        goal_approvals: {
          ...(goal.data?.goal_approvals || {}),
          execution: invalidatedApproval(goal.data?.goal_approvals?.execution, 'budget_changed'),
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  await admin.from('goal_log').insert({
    goal_id: id,
    event_type: 'budget_updated',
    details: { old: goal.budget_usd, new: newBudget },
  });

  return { status: 200, data: { id, budget_usd: newBudget } };
}

export async function handleProvideTools(admin, user, query) {
  const id = query?.id;
  const skipTools = ['1', 'true'].includes(String(query?.skip || '').toLowerCase());
  if (!id) return { status: 400, error: 'id is required' };

  const { data: goal } = await admin
    .from('goals')
    .select('id, user_id, status, plan, data, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!goal) return { status: 404, error: 'Goal not found' };
  if (goal.status !== 'awaiting_tools') {
    return { status: 400, error: `Goal is not awaiting tools (status: ${goal.status})` };
  }

  const nativeAuthority = resolveAcceptedNativeGoalAuthority(goal);
  const teamAttempt = goal.data?.team_formation_attempt;
  const toolAttempt = goal.data?.tool_provisioning_attempt;
  const commonChainReady = Boolean(
    goal.updated_at &&
    teamAttempt?.version === 'orqaly_team_formation_attempt_v1' &&
    teamAttempt.status === 'completed' &&
    String(teamAttempt.attempt_id || '').trim() &&
    toolAttempt?.version === 'orqaly_tool_provisioning_attempt_v1' &&
    toolAttempt.status === 'awaiting_user' &&
    String(toolAttempt.attempt_id || '').trim() &&
    toolAttempt.team_formation_attempt_id === teamAttempt.attempt_id
  );
  if (!commonChainReady) {
    return {
      status: 409,
      error: 'The team/tool provisioning checkpoint changed. Refresh before continuing.',
    };
  }

  if (nativeAuthority.native) {
    const nativeTeamAttempt = goal.data?.native_team_formation_attempt;
    const nativeAttempt = goal.data?.native_tool_provisioning_attempt;
    const nativeChainReady = Boolean(
      nativeAuthority.ready &&
      nativeTeamAttempt &&
      nativeAttempt &&
      isDeepStrictEqual(nativeTeamAttempt, teamAttempt) &&
      isDeepStrictEqual(nativeAttempt, toolAttempt) &&
      teamAttempt.scope_hash === nativeAuthority.packet.scope_hash &&
      toolAttempt.scope_hash === nativeAuthority.packet.scope_hash
    );
    if (!nativeChainReady) {
      return {
        status: 409,
        error:
          'The accepted AxWise scope or native tool checkpoint changed. Refresh before continuing.',
        data: { reasons: nativeAuthority.reasons || [] },
      };
    }
  }

  // Re-check which tools are now configured
  const requiredToolIds = goal.data?.required_tools || [];
  let stillUnconfigured = [];
  if (requiredToolIds.length > 0) {
    if (skipTools) {
      stillUnconfigured = [...requiredToolIds];
    } else {
      const configuredIds = await listConfiguredToolIds(admin, user.id, requiredToolIds);
      stillUnconfigured = requiredToolIds.filter((tid) => !configuredIds.has(tid));
    }
  }

  // Tool state is part of the execution approval snapshot. Continue to the
  // estimate/proposal gate instead of activating execution directly.
  const completedAt = new Date().toISOString();
  const completedToolAttempt = {
    ...toolAttempt,
    status: 'completed',
    completed_at: completedAt,
  };
  const updatedData = {
    ...goal.data,
    required_tools: skipTools ? [] : requiredToolIds,
    unconfigured_tools: skipTools ? [] : stillUnconfigured,
    tool_provisioning_attempt: completedToolAttempt,
    ...(nativeAuthority.native
      ? { native_tool_provisioning_attempt: { ...completedToolAttempt } }
      : {}),
    ...(skipTools
      ? {
          skip_tools: true,
          skip_tools_reason: 'User chose to continue without external tools',
          // The UI choice applies to the whole goal, not just the next worker
          // invocation. Keep a durable policy marker as well as the legacy
          // one-shot flag so delayed/replayed jobs cannot reopen the tool gate.
          tool_mode: 'no_tools',
          waived_tools: requiredToolIds,
        }
      : {}),
    goal_approvals: {
      ...(goal.data?.goal_approvals || {}),
      execution: invalidatedApproval(goal.data?.goal_approvals?.execution, 'tools_changed'),
    },
  };
  if (!skipTools) {
    delete updatedData.skip_tools;
    delete updatedData.skip_tools_reason;
  }
  let transition = admin
    .from('goals')
    .update({
      status: 'estimating',
      data: updatedData,
      updated_at: completedAt,
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'awaiting_tools')
    .eq('updated_at', goal.updated_at)
    .eq('data->team_formation_attempt->>version', 'orqaly_team_formation_attempt_v1')
    .eq('data->team_formation_attempt->>attempt_id', teamAttempt.attempt_id)
    .eq('data->team_formation_attempt->>status', 'completed')
    .eq('data->tool_provisioning_attempt->>version', 'orqaly_tool_provisioning_attempt_v1')
    .eq('data->tool_provisioning_attempt->>attempt_id', toolAttempt.attempt_id)
    .eq('data->tool_provisioning_attempt->>status', 'awaiting_user')
    .eq('data->tool_provisioning_attempt->>team_formation_attempt_id', teamAttempt.attempt_id);
  if (nativeAuthority.native) {
    transition = transition
      .eq('data->team_formation_attempt->>scope_hash', nativeAuthority.packet.scope_hash)
      .eq('data->native_team_formation_attempt->>version', 'orqaly_team_formation_attempt_v1')
      .eq('data->native_team_formation_attempt->>attempt_id', teamAttempt.attempt_id)
      .eq('data->native_team_formation_attempt->>status', 'completed')
      .eq('data->native_team_formation_attempt->>scope_hash', nativeAuthority.packet.scope_hash)
      .eq('data->tool_provisioning_attempt->>scope_hash', nativeAuthority.packet.scope_hash)
      .eq('data->native_tool_provisioning_attempt->>version', 'orqaly_tool_provisioning_attempt_v1')
      .eq('data->native_tool_provisioning_attempt->>attempt_id', toolAttempt.attempt_id)
      .eq('data->native_tool_provisioning_attempt->>status', 'awaiting_user')
      .eq(
        'data->native_tool_provisioning_attempt->>team_formation_attempt_id',
        teamAttempt.attempt_id
      )
      .eq('data->native_tool_provisioning_attempt->>scope_hash', nativeAuthority.packet.scope_hash);
  }
  const { data: transitioned, error: transitionError } = await transition
    .select('id')
    .maybeSingle();
  if (transitionError) {
    return {
      status: 500,
      error: `Unable to continue from the tool gate: ${transitionError.message}`,
    };
  }
  if (!transitioned) {
    return {
      status: 409,
      error: 'The tool-provisioning checkpoint changed. Refresh before continuing.',
    };
  }

  const rollbackFilters = [
    ['eq', 'data->team_formation_attempt->>version', 'orqaly_team_formation_attempt_v1'],
    ['eq', 'data->team_formation_attempt->>attempt_id', teamAttempt.attempt_id],
    ['eq', 'data->team_formation_attempt->>status', 'completed'],
    ['eq', 'data->tool_provisioning_attempt->>version', 'orqaly_tool_provisioning_attempt_v1'],
    ['eq', 'data->tool_provisioning_attempt->>attempt_id', toolAttempt.attempt_id],
    ['eq', 'data->tool_provisioning_attempt->>status', 'completed'],
    ['eq', 'data->tool_provisioning_attempt->>team_formation_attempt_id', teamAttempt.attempt_id],
  ];
  if (nativeAuthority.native) {
    rollbackFilters.push(
      ['eq', 'data->team_formation_attempt->>scope_hash', nativeAuthority.packet.scope_hash],
      ['eq', 'data->native_team_formation_attempt->>version', 'orqaly_team_formation_attempt_v1'],
      ['eq', 'data->native_team_formation_attempt->>attempt_id', teamAttempt.attempt_id],
      ['eq', 'data->native_team_formation_attempt->>status', 'completed'],
      ['eq', 'data->native_team_formation_attempt->>scope_hash', nativeAuthority.packet.scope_hash],
      ['eq', 'data->tool_provisioning_attempt->>scope_hash', nativeAuthority.packet.scope_hash],
      [
        'eq',
        'data->native_tool_provisioning_attempt->>version',
        'orqaly_tool_provisioning_attempt_v1',
      ],
      ['eq', 'data->native_tool_provisioning_attempt->>attempt_id', toolAttempt.attempt_id],
      ['eq', 'data->native_tool_provisioning_attempt->>status', 'completed'],
      [
        'eq',
        'data->native_tool_provisioning_attempt->>team_formation_attempt_id',
        teamAttempt.attempt_id,
      ],
      [
        'eq',
        'data->native_tool_provisioning_attempt->>scope_hash',
        nativeAuthority.packet.scope_hash,
      ]
    );
  }
  const rollbackToolGate = () =>
    rollbackExactGoalHandoff(admin, {
      goalId: id,
      userId: user.id,
      expectedStatus: 'estimating',
      expectedUpdatedAt: completedAt,
      expectedFilters: rollbackFilters,
      restore: { status: goal.status, data: goal.data },
    });

  const { jobId, error: enqueueError } = await enqueueGoalWorkerJob(admin, {
    user_id: user.id,
    status: 'queued',
    payload: { type: 'orchestrate-goal', action: 'discovery-estimation', goalId: id },
  });
  if (enqueueError) {
    const rolledBack = await rollbackToolGate();
    log.error(null, 'goal.provide-tools.enqueue-failed', {
      goalId: id,
      error: enqueueError.message,
      rollbackVerified: rolledBack,
    });
    return {
      status: 503,
      error: rolledBack
        ? 'Goal processing could not be queued. The exact tool gate was restored; retry again.'
        : 'Goal processing could not be queued and exact recovery could not be verified. Refresh before retrying.',
      data: {
        goal_id: id,
        job_id: jobId,
        retry_safe: rolledBack,
        reconciliation_state: goalWorkerEnqueueNeedsReconciliation(enqueueError)
          ? 'enqueue-unknown:goal-rollback'
          : 'enqueue-absent:goal-rollback',
      },
    };
  }

  const handoff = await requestGoalProcessingHandoff(admin, id, {
    jobId,
    userId: user.id,
    operation: 'provide-tools',
    rollbackGoalOnSafeFailure: rollbackToolGate,
  });
  if (!handoff.ok) return goalProcessingHandoffFailure(handoff);

  await admin.from('goal_log').insert({
    goal_id: id,
    event_type: 'tools_provided',
    details: {
      required: skipTools ? [] : requiredToolIds,
      waived: skipTools ? requiredToolIds : [],
      stillUnconfigured: skipTools ? [] : stillUnconfigured,
      skip_tools: skipTools,
    },
  });

  return {
    status: 200,
    data: {
      id,
      status: 'estimating',
      stillUnconfigured: skipTools ? [] : stillUnconfigured,
      skip_tools: skipTools,
    },
  };
}

async function handlePhaseOutputs(admin, user, query) {
  const goalId = query?.goalId || query?.id;
  const phaseIndex = query?.phaseIndex;
  if (!goalId) return { status: 400, error: 'goalId is required' };

  // Verify user owns the goal
  const { data: goal } = await admin
    .from('goals')
    .select('id, status, data')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .single();
  if (!goal) return { status: 404, error: 'Goal not found' };

  let q = admin
    .from('knowledge_documents')
    .select('id, title, content, category, created_at, metadata')
    .eq('user_id', user.id)
    .in('category', ['goal-output', 'goal-plan', 'goal-report'])
    .order('created_at', { ascending: true })
    .limit(200);

  // Filter by goal_id in metadata
  q = q.contains('metadata', { goal_id: goalId });
  if (phaseIndex != null && phaseIndex !== '') {
    q = q.contains('metadata', { phase_index: Number(phaseIndex) });
  }

  const { data, error } = await q;
  if (error) throw error;
  return {
    status: 200,
    data: currentGoalDocuments(goal, data || [])
      .slice(0, 20)
      .map(({ metadata: _metadata, ...document }) => document),
  };
}

async function handleMessages(admin, user, query) {
  const goalId = query?.id;
  if (!goalId) return { status: 400, error: 'id is required' };

  const { data: goal } = await admin
    .from('goals')
    .select('id')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .single();
  if (!goal) return { status: 404, error: 'Goal not found' };

  const channel = query?.channel || null;
  let q = admin
    .from('goal_messages')
    .select(
      'id, sender_name, sender_agent_id, channel, message, message_type, metadata, created_at'
    )
    .eq('goal_id', goalId)
    .eq('is_archived', false)
    .order('created_at', { ascending: true })
    .limit(100);
  if (channel) q = q.eq('channel', channel);

  const { data, error } = await q;
  if (error) throw error;
  return { status: 200, data: data || [] };
}

export async function handleResearchBundle(admin, user, query) {
  const id = String(query?.id || '').trim();
  if (!id) return { status: 400, error: 'id is required' };

  const { data: goal, error: goalError } = await admin
    .from('goals')
    .select('id, user_id, org_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (goalError) throw goalError;
  if (!goal) return { status: 404, error: 'Goal not found' };

  const { loadGoalResearchBundle } = await import('../integrations/axwise/research-bundle.js');
  const research = await loadGoalResearchBundle(admin, goal);
  return { status: 200, data: research };
}

export async function handleResearchArtifact(admin, user, query) {
  const goalId = String(query?.id || '').trim();
  const artifactId = String(query?.artifact_id || '').trim();
  if (!goalId) return { status: 400, error: 'id is required' };
  if (!artifactId) return { status: 400, error: 'artifact_id is required' };

  const { data: artifact, error } = await admin
    .from('goal_research_artifacts')
    .select(
      'id, research_run_id, goal_id, external_artifact_id, artifact_type, title, mime_type, content_hash, content_text, payload, created_at'
    )
    .eq('id', artifactId)
    .eq('goal_id', goalId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!artifact) return { status: 404, error: 'Research artifact not found' };

  return {
    status: 200,
    data: {
      ...artifact,
      content: artifact.content_text,
      data: artifact.payload,
      hash: artifact.content_hash,
    },
  };
}

async function handleApproval(admin, user, query, action, body = {}) {
  const goalId = query?.id;
  if (!goalId) return { status: 400, error: 'id is required' };

  const { data: goal, error: getErr } = await admin
    .from('goals')
    .select('id, status, user_id, data, updated_at')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .single();
  if (getErr || !goal) return { status: 404, error: 'Goal not found' };
  if (goal.status !== 'awaiting_approval')
    return { status: 400, error: `Goal status is ${goal.status}, not awaiting_approval` };

  const approvalAction =
    action === 'request-changes' ? 'request-changes' : action === 'approve' ? 'approve' : 'cancel';
  const feedback = body?.feedback || '';

  // Enqueue client-approval handler with the approval action
  const { jobId, error: enqueueError } = await enqueueGoalWorkerJob(admin, {
    user_id: user.id,
    status: 'queued',
    payload: {
      type: 'orchestrate-goal',
      action: 'client-approval',
      goalId: goal.id,
      approval_action: approvalAction,
      feedback,
      approved_by: user.id,
    },
  });
  if (enqueueError) {
    if (goalWorkerEnqueueNeedsReconciliation(enqueueError)) {
      return goalWorkerEnqueueReconciliationFailure(enqueueError);
    }
    log.error(null, 'goal.approval.enqueue-failed', {
      goalId: goal.id,
      error: enqueueError.message,
    });
    return { status: 503, error: 'Approval processing could not be queued. Retry again.' };
  }

  const handoff = await requestGoalProcessingHandoff(admin, goal.id, {
    jobId,
    userId: user.id,
    operation: `approval:${approvalAction}`,
    rollbackGoalOnSafeFailure: () =>
      verifyUnchangedGoalHandoff(admin, {
        goalId: goal.id,
        userId: user.id,
        status: goal.status,
        updatedAt: goal.updated_at,
        data: goal.data,
      }),
  });
  if (!handoff.ok) return goalProcessingHandoffFailure(handoff);

  return { status: 200, data: { goalId: goal.id, action: approvalAction } };
}

async function handleContextReview(admin, user, query, body = {}) {
  const goalId = query?.id;
  if (!goalId) return { status: 400, error: 'id is required' };
  const action = body?.action;
  if (!['approve', 'revise', 'request-evidence'].includes(action)) {
    return { status: 400, error: 'action must be approve, revise, or request-evidence' };
  }
  const feedback = String(body?.feedback || '').trim();
  if (action !== 'approve' && !feedback) {
    return { status: 400, error: 'feedback is required when requesting a revision or evidence' };
  }

  const { data: goal, error } = await admin
    .from('goals')
    .select('id, status, user_id, org_id, title, description, parsed_category, data, updated_at')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .single();
  if (error || !goal) return { status: 404, error: 'Goal not found' };
  if (goal.status !== 'awaiting_context_approval') {
    return {
      status: 400,
      error: `Goal status is ${goal.status}, not awaiting_context_approval`,
    };
  }
  const nativeScopeBinding = nativeAxwiseScopeActionBinding(goal);
  const nativeScopeProposal = Boolean(
    nativeScopeBinding && goal.data?.scope_admission?.status !== 'accepted'
  );
  if (action === 'approve') {
    if (nativeScopeBinding) {
      try {
        const intelligence = goal.data?.axwise_customer_intelligence || {};
        const handoff = validateNativeAxwiseDecisionContracts({
          scope_packet: intelligence.scope_packet,
          scope_validation: intelligence.scope_validation,
          scope_confirmation: intelligence.axwise_scope_confirmation,
          scope_contract_binding: intelligence.scope_contract_binding,
        });
        if (handoff.scope_packet.research_contract.evidence.mode === 'existing') {
          throw new Error('reserved evidence mode existing is unsupported in contract v1');
        }
        if (
          nativeScopeProposal &&
          handoff.scope_packet.research_contract.evidence.mode !== 'none'
        ) {
          validateResearchExecutionPreview(goal, handoff.scope_packet);
        }
      } catch (validationError) {
        if (validationError?.code === 'ORQALY_RESEARCH_EXECUTION_PREVIEW_INVALID') {
          return {
            status: 409,
            error:
              'The proposal-bound research disclosure changed or is incomplete. Refresh and review the current scope.',
            data: { code: 'native_scope_execution_preview_invalid' },
          };
        }
        return {
          status: 409,
          error: 'The native AxWise scope contract is invalid. Refresh or rebuild the scope.',
          data: { code: 'native_scope_not_ready' },
        };
      }
    }
    const nativeScopeBlock = nativeAxwiseScopeApprovalBlock(goal);
    if (nativeScopeBlock) {
      return {
        status: 409,
        error: nativeScopeBlock.materialQuestion || nativeScopeBlock.message,
        data: { native_scope_gate: nativeScopeBlock },
      };
    }
  }
  if (nativeScopeBinding) {
    const currentContext = goal.data?.goal_approvals?.context;
    const canonicalContextHash = hashApprovalSnapshot(
      'context',
      buildContextApprovalSnapshot(goal)
    );
    const bindingCurrent = nativeAxwiseScopeActionBindingMatches(goal, body.native_scope_binding);
    if (
      currentContext?.status !== 'pending' ||
      currentContext.snapshot_hash !== canonicalContextHash ||
      !bindingCurrent
    ) {
      return {
        status: 409,
        error: 'The AxWise scope changed. Refresh and review the current scope.',
        data: { code: 'stale_native_scope' },
      };
    }
  }
  if (action === 'approve' && !nativeScopeProposal) {
    const researchGate = await verifyGoalResearchContextGate(admin, goal);
    if (researchGate.status !== 'ready') {
      return {
        status: 409,
        error:
          researchGate.issues?.[0]?.message ||
          'The required AxWise research quality contract has not passed Gate 1',
        data: { context_gate: researchGate },
      };
    }
  }

  const { jobId, error: enqueueError } = await enqueueGoalWorkerJob(admin, {
    user_id: user.id,
    status: 'queued',
    payload: {
      type: 'orchestrate-goal',
      action: 'context-approval',
      goalId,
      context_action: action,
      feedback: feedback.slice(0, 4000),
      approved_by: user.id,
      ...(nativeScopeBinding ? { native_scope_binding: nativeScopeBinding } : {}),
    },
  });
  if (enqueueError) {
    if (goalWorkerEnqueueNeedsReconciliation(enqueueError)) {
      return goalWorkerEnqueueReconciliationFailure(enqueueError);
    }
    log.error(null, 'goal.context-review.enqueue-failed', {
      goalId,
      error: enqueueError.message,
    });
    return { status: 503, error: 'Context review could not be queued. Retry again.' };
  }
  const handoff = await requestGoalProcessingHandoff(admin, goalId, {
    jobId,
    userId: user.id,
    operation: `context-review:${action}`,
    rollbackGoalOnSafeFailure: () =>
      verifyUnchangedGoalHandoff(admin, {
        goalId,
        userId: user.id,
        status: goal.status,
        updatedAt: goal.updated_at,
        data: goal.data,
      }),
  });
  if (!handoff.ok) return goalProcessingHandoffFailure(handoff);
  return { status: 200, data: { goalId, action } };
}

function scopeField(value, maximum = 4000) {
  return String(value || '')
    .trim()
    .slice(0, maximum);
}

const MAX_EXPERT_PO_QUESTIONS = 50;
const MAX_EXPERT_PO_ANSWER_LENGTH = 4000;

function expertPoQuestionHash(questions) {
  return createHash('sha256').update(JSON.stringify(questions)).digest('hex');
}

function expertPoTimestampMatches(left, right) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime === rightTime;
}

function validateExpertPoAnswers(submittedAnswers, activeQuestions) {
  if (!Array.isArray(submittedAnswers) || submittedAnswers.length === 0) {
    return { status: 400, error: 'Answers are required' };
  }
  if (
    !Array.isArray(activeQuestions) ||
    activeQuestions.length === 0 ||
    activeQuestions.length > MAX_EXPERT_PO_QUESTIONS ||
    activeQuestions.some((question) => typeof question !== 'string' || !question.trim())
  ) {
    return { status: 409, error: 'This goal has no valid Expert PO questions to answer' };
  }
  if (submittedAnswers.length !== activeQuestions.length) {
    return { status: 409, error: 'The PO questions changed. Refresh before submitting answers.' };
  }

  const answers = [];
  for (let index = 0; index < activeQuestions.length; index++) {
    const entry = submittedAnswers[index];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { status: 400, error: `Answer ${index + 1} is invalid` };
    }
    // Question text is an optimistic-concurrency token, not display-only data.
    // Matching it byte-for-byte prevents an old browser from attaching answers
    // to a newly generated question set that happens to have the same length.
    if (entry.question !== activeQuestions[index]) {
      return { status: 409, error: 'The PO questions changed. Refresh before submitting answers.' };
    }
    if (typeof entry.answer !== 'string') {
      return { status: 400, error: `Answer ${index + 1} is invalid` };
    }
    const answer = entry.answer.trim();
    if (!answer) return { status: 400, error: `Answer ${index + 1} is required` };
    if (answer.length > MAX_EXPERT_PO_ANSWER_LENGTH) {
      return {
        status: 400,
        error: `Answer ${index + 1} must be ${MAX_EXPERT_PO_ANSWER_LENGTH} characters or fewer`,
      };
    }
    answers.push({ question: activeQuestions[index], answer });
  }
  return { answers };
}

async function inspectExpertPoContinuationJob(
  admin,
  { jobId, goalId, userId, workerScope, deploymentIdentity }
) {
  try {
    const { data: job, error } = await admin
      .from('agent_jobs')
      .select('id, worker_scope, payload')
      .eq('id', jobId)
      .maybeSingle();
    if (error) return { state: 'unknown', error };
    if (!job) return { state: 'absent' };

    const payload = job.payload || {};
    const exactMatch =
      job.id === jobId &&
      job.worker_scope === workerScope &&
      payload.type === 'orchestrate-goal' &&
      payload.action === 'po-analysis-continue' &&
      payload.goalId === goalId &&
      payload._userId === userId &&
      (workerScope !== 'preview' || payload[WORKER_DEPLOYMENT_PAYLOAD_KEY] === deploymentIdentity);
    return exactMatch ? { state: 'present' } : { state: 'conflict' };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function inspectExpertPoSubmissionTransition(
  admin,
  { goal, userId, submissionId, questionHash, submittedAt, expectedData }
) {
  try {
    const { data: current, error } = await admin
      .from('goals')
      .select('id, user_id, status, po_depth, data, updated_at')
      .eq('id', goal.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !current) return { state: 'unknown', error: error || null };

    if (
      current.status === 'analyzing' &&
      current.po_depth === 'expert' &&
      expertPoTimestampMatches(current.updated_at, submittedAt) &&
      current.data?.po_answer_submission?.id === submissionId &&
      current.data?.po_answer_submission?.question_hash === questionHash &&
      isDeepStrictEqual(current.data || {}, expectedData || {})
    ) {
      return { state: 'committed', goal: current };
    }
    if (
      current.status === goal.status &&
      current.po_depth === goal.po_depth &&
      expertPoTimestampMatches(current.updated_at, goal.updated_at) &&
      isDeepStrictEqual(current.data || {}, goal.data || {})
    ) {
      return { state: 'original', goal: current };
    }
    return { state: 'conflict', goal: current };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

/**
 * Persist genuine Expert PO answers and resume only the exact goal/question
 * snapshot the owner viewed. AxWise scope clarification has a separate,
 * decision/hash-bound operation and must never pass through this legacy gate.
 */
export async function handleAnswerPoQuestions(
  admin,
  user,
  body = {},
  { env = process.env, kickProcessing = kickGoalProcessing, now = () => Date.now() } = {}
) {
  const goalId = scopeField(body.id, 255);
  if (!goalId) return { status: 400, error: 'id is required' };
  if (!Array.isArray(body.answers)) return { status: 400, error: 'answers must be an array' };

  const workerScope = resolveWorkerScope(env);
  const deploymentIdentity = resolveWorkerDeploymentIdentity(env);
  if (workerScope === 'preview' && !deploymentIdentity) {
    return { status: 503, error: 'Preview deployment identity is unavailable' };
  }

  const { data: goal, error: goalError } = await admin
    .from('goals')
    .select('id, user_id, status, po_depth, data, updated_at')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (goalError) {
    log.warn(null, 'goal.po-answers.load-failed', { goalId, error: goalError.message });
    return { status: 503, error: 'The PO questions could not be verified' };
  }
  if (!goal) return { status: 404, error: 'Goal not found' };
  if (goal.status !== 'awaiting_po_input') {
    return { status: 409, error: 'Goal is not awaiting Expert PO answers' };
  }
  if (goal.data?.axwise_customer_intelligence?.status === 'human_clarification') {
    return {
      status: 409,
      error: 'This goal is awaiting AxWise scope confirmation, not Expert PO answers',
    };
  }
  if (goal.po_depth !== 'expert') {
    return { status: 409, error: 'Goal is not at an Expert PO question gate' };
  }

  const activeQuestions = goal.data?.po_questions;
  const validation = validateExpertPoAnswers(body.answers, activeQuestions);
  if (!validation.answers) return validation;

  const submittedAt = new Date(Number(now())).toISOString();
  const submissionId = randomUUID();
  const questionHash = expertPoQuestionHash(activeQuestions);
  const updatedData = {
    ...(goal.data || {}),
    po_answers: validation.answers,
    po_answer_submission: {
      id: submissionId,
      question_hash: questionHash,
      question_count: activeQuestions.length,
      submitted_at: submittedAt,
      submitted_by: user.id,
    },
  };

  // Status, owner, timestamp, and exact JSON question array together form the
  // CAS. The timestamp covers any well-behaved concurrent goal update, while
  // the JSON equality closes the stale-question race even for a legacy writer
  // that forgot to rotate updated_at.
  let transition = admin
    .from('goals')
    .update({ status: 'analyzing', data: updatedData, updated_at: submittedAt })
    .eq('id', goalId)
    .eq('user_id', user.id)
    .eq('status', 'awaiting_po_input')
    .eq('po_depth', 'expert')
    .eq('data->po_questions', JSON.stringify(activeQuestions));
  if (goal.updated_at) transition = transition.eq('updated_at', goal.updated_at);
  let transitioned = null;
  let transitionError = null;
  try {
    const transitionResult = await transition.select('id, status').maybeSingle();
    transitioned = transitionResult.data || null;
    transitionError = transitionResult.error || null;
  } catch (error) {
    transitionError = error;
  }
  if (transitionError) {
    const inspection = await inspectExpertPoSubmissionTransition(admin, {
      goal,
      userId: user.id,
      submissionId,
      questionHash,
      submittedAt,
      expectedData: updatedData,
    });
    if (inspection.state === 'committed') {
      transitioned = { id: goalId, status: 'analyzing' };
      transitionError = null;
    } else {
      log.warn(null, 'goal.po-answers.transition-failed', {
        goalId,
        inspection_state: inspection.state,
        error: transitionError.message,
        inspection_error: inspection.error?.message || null,
      });
      return {
        status: 503,
        error:
          inspection.state === 'original'
            ? 'The PO answers could not be saved. Retry from the current question gate.'
            : 'The PO answer submission needs reconciliation. Refresh before retrying.',
      };
    }
  }
  if (!transitioned) {
    return { status: 409, error: 'The PO questions changed. Refresh before submitting answers.' };
  }

  const requestedJobId = randomUUID();
  let jobId = requestedJobId;
  let enqueueError = null;
  try {
    const enqueueResult = await enqueueGoalWorkerJob(
      admin,
      {
        user_id: user.id,
        status: 'queued',
        payload: {
          type: 'orchestrate-goal',
          action: 'po-analysis-continue',
          goalId,
          _userId: user.id,
        },
      },
      { env, jobId: requestedJobId }
    );
    jobId = enqueueResult.jobId;
    enqueueError = enqueueResult.error;
  } catch (error) {
    // A transport rejection is ambiguous: PostgreSQL may have committed the
    // exact pre-generated id even though the response never reached us. Verify
    // that id before deciding whether rolling the goal back is safe.
    const inspection = await inspectExpertPoContinuationJob(admin, {
      jobId: requestedJobId,
      goalId,
      userId: user.id,
      workerScope,
      deploymentIdentity,
    });
    if (inspection.state === 'present') {
      enqueueError = null;
    } else if (inspection.state === 'absent') {
      enqueueError = error;
    } else {
      log.error(null, 'goal.po-answers.enqueue-outcome-unknown', {
        goalId,
        jobId: requestedJobId,
        inspection_state: inspection.state,
        error: error?.message || String(error),
        inspection_error: inspection.error?.message || null,
      });
      return {
        status: 503,
        error:
          'PRD continuation enqueue outcome could not be verified. Refresh this goal before taking another action.',
      };
    }
  }
  if (enqueueError) {
    if (goalWorkerEnqueueNeedsReconciliation(enqueueError)) {
      return goalWorkerEnqueueReconciliationFailure(enqueueError);
    }
    const rollbackAt = new Date(Number(now())).toISOString();
    const { data: rolledBack, error: rollbackError } = await admin
      .from('goals')
      .update({ status: 'awaiting_po_input', data: goal.data, updated_at: rollbackAt })
      .eq('id', goalId)
      .eq('user_id', user.id)
      .eq('status', 'analyzing')
      .eq('updated_at', submittedAt)
      .eq('data->po_answer_submission->>id', submissionId)
      .select('id')
      .maybeSingle();
    const rollbackSucceeded = !rollbackError && Boolean(rolledBack);
    log.error(null, 'goal.po-answers.enqueue-failed', {
      goalId,
      error: enqueueError.message,
      rollback_succeeded: rollbackSucceeded,
      rollback_error: rollbackError?.message || null,
    });
    return {
      status: 503,
      error: rollbackSucceeded
        ? 'PRD continuation could not be queued. Your goal remains at the PO question gate.'
        : 'PRD continuation could not be queued and the PO question gate could not be restored. Refresh before retrying.',
    };
  }

  try {
    const { error: logError } = await admin.from('goal_log').insert({
      goal_id: goalId,
      event_type: 'po_answers_submitted',
      details: {
        question_count: activeQuestions.length,
        question_hash: questionHash,
        submission_id: submissionId,
        job_id: jobId,
      },
    });
    if (logError) {
      log.warn(null, 'goal.po-answers.log-failed', { goalId, error: logError.message });
    }
  } catch (logError) {
    log.warn(null, 'goal.po-answers.log-failed', { goalId, error: logError.message });
  }

  const handoff = await requestGoalProcessingHandoff(admin, goalId, {
    jobId,
    userId: user.id,
    env,
    kickProcessing,
    operation: 'answer-po-questions',
    rollbackGoalOnSafeFailure: async () => {
      const rollbackAt = new Date(Number(now())).toISOString();
      let rolledBack = null;
      let rollbackError = null;
      try {
        const rollbackResult = await admin
          .from('goals')
          .update({ status: 'awaiting_po_input', data: goal.data, updated_at: rollbackAt })
          .eq('id', goalId)
          .eq('user_id', user.id)
          .eq('status', 'analyzing')
          .eq('updated_at', submittedAt)
          .eq('data->po_answer_submission->>id', submissionId)
          .select('id, status')
          .maybeSingle();
        rolledBack = rollbackResult.data || null;
        rollbackError = rollbackResult.error || null;
      } catch (error) {
        rollbackError = error;
      }
      if (!rollbackError && rolledBack?.status === 'awaiting_po_input') return true;

      // A lost PostgREST response may hide a committed rollback. Read the
      // exact owner row before parking it so a safely restored question gate
      // remains immediately retryable instead of being downgraded to an
      // operator-only reconciliation state.
      try {
        const { data: current, error: inspectError } = await admin
          .from('goals')
          .select('id, user_id, status, po_depth, data')
          .eq('id', goalId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (
          !inspectError &&
          current?.status === 'awaiting_po_input' &&
          current?.po_depth === goal.po_depth &&
          isDeepStrictEqual(current?.data || {}, goal.data || {})
        ) {
          return true;
        }
      } catch (inspectError) {
        rollbackError ||= inspectError;
      }

      {
        log.error(null, 'goal.po-answers.handoff-rollback-failed', {
          goalId,
          jobId,
          error: rollbackError?.message || 'PO submission snapshot changed before rollback',
        });
        return false;
      }
    },
  });
  if (!handoff.ok) return goalProcessingHandoffFailure(handoff);
  return {
    status: 202,
    data: {
      goalId,
      status: 'analyzing',
      job_id: jobId,
      question_hash: questionHash,
      pickup_requested: handoff.handoff?.triggered === true,
    },
  };
}

function legacyClarificationScope(goal) {
  const answers = Array.isArray(goal?.data?.po_answers) ? goal.data.po_answers : [];
  const answer = (index) =>
    scopeField(
      answers[index] && typeof answers[index] === 'object' ? answers[index].answer : answers[index],
      4000
    );
  const targetCustomer =
    answer(0) ||
    scopeField(goal.tech_doc?.target_audience, 2000) ||
    `Affected customer or stakeholder for ${scopeField(goal.title, 1000)}`;
  const desiredOutcome =
    answer(1) ||
    scopeField(goal.tech_doc?.success_tiers?.target, 4000) ||
    scopeField(goal.tech_doc?.success_criteria, 4000) ||
    scopeField(goal.description, 4000) ||
    targetCustomer;
  const optionalDetails = answers
    .slice(2)
    .map((item) => scopeField(typeof item === 'object' ? item.answer : item, 2000))
    .filter(Boolean)
    .join('\n')
    .slice(0, 4000);
  return {
    version: 'orqaly_axwise_scope_confirmation_v1',
    source: 'legacy_po_clarification_answers',
    business_idea: scopeField(goal.title, 4000),
    target_customer: targetCustomer,
    problem:
      scopeField(goal.tech_doc?.problem_statement, 4000) ||
      scopeField(goal.description, 4000) ||
      scopeField(goal.title, 4000),
    desired_outcome: desiredOutcome,
    constraints: [],
    evidence: [],
    routing_reasons: [],
    summary: `So you want to ${scopeField(goal.title, 4000)} for ${targetCustomer}. The intended outcome is ${desiredOutcome}.`,
    optional_details: optionalDetails || null,
    trust: { status: 'declared_inferred_unverified', verified: false },
  };
}

function normalizedAcceptedScope(submitted = {}, proposedScope = {}) {
  return {
    targetCustomer:
      scopeField(submitted.target_customer, 2000) ||
      scopeField(proposedScope.target_customer, 2000),
    problem: scopeField(submitted.problem, 4000) || scopeField(proposedScope.problem, 4000),
    desiredOutcome:
      scopeField(submitted.desired_outcome, 4000) ||
      scopeField(proposedScope.desired_outcome, 4000),
    optionalDetails: scopeField(submitted.optional_details || proposedScope.optional_details, 4000),
  };
}

function acceptedScopeMatches(confirmation, normalized) {
  return (
    scopeField(confirmation.target_customer, 2000) === normalized.targetCustomer &&
    scopeField(confirmation.problem, 4000) === normalized.problem &&
    scopeField(confirmation.desired_outcome, 4000) === normalized.desiredOutcome &&
    scopeField(confirmation.optional_details, 4000) === normalized.optionalDetails
  );
}

function clarificationSourceResearchRun(intelligence = {}) {
  if (!intelligence.job_id) return intelligence.clarification_source_research_run || null;
  return {
    decision_id: intelligence.decision_id || null,
    job_id: intelligence.job_id,
    request_id: intelligence.request_id || null,
    request_hash: intelligence.request_hash || null,
    routing_mode: intelligence.routing_mode || null,
    status: intelligence.status || null,
    requested_at: intelligence.requested_at || null,
    generation: intelligence.generation ?? null,
    last_known_status: intelligence.status || null,
  };
}

function nullableScopeToken(value, maximum = 255) {
  if (value === null || value === undefined || value === '') return null;
  return scopeField(value, maximum) || null;
}

function sameNullableScopeToken(left, right) {
  return nullableScopeToken(left) === nullableScopeToken(right);
}

function activeScopeRevisionBinding(goal) {
  const intelligence = goal?.data?.axwise_customer_intelligence || {};
  const revision = goal?.data?.scope_revision || {};
  const revisionPending = revision.status === 'pending_rebuild';
  const confirmation = intelligence.scope_confirmation || {};
  const candidates = revisionPending
    ? [
        ['data->scope_revision->>replacement_scope_hash', revision.replacement_scope_hash],
        ['data->scope_revision->>source_scope_hash', revision.source_scope_hash],
      ]
    : [
        [
          'data->axwise_customer_intelligence->scope_confirmation->>source_scope_hash',
          confirmation.source_scope_hash,
        ],
        [
          'data->axwise_customer_intelligence->scope_packet->>scope_hash',
          intelligence.scope_packet?.scope_hash,
        ],
        [
          'data->axwise_customer_intelligence->clarification_scope->>scope_hash',
          intelligence.clarification_scope?.scope_hash,
        ],
        ['data->scope_revision->>replacement_scope_hash', revision.replacement_scope_hash],
        ['data->scope_revision->>source_scope_hash', revision.source_scope_hash],
      ];
  const [scopeHashPath, scopeHashValue] = candidates.find(([, value]) =>
    nullableScopeToken(value, 128)
  ) || [null, null];
  return {
    decisionId: nullableScopeToken(intelligence.decision_id || revision.source_decision_id, 255),
    currentDecisionId: nullableScopeToken(intelligence.decision_id, 255),
    scopeHash: nullableScopeToken(scopeHashValue, 128),
    scopeHashPath,
    generation: nullableScopeToken(intelligence.generation, 255),
    jobId: nullableScopeToken(intelligence.job_id, 255),
    revisionToken: nullableScopeToken(revision.revision_token, 255),
  };
}

async function inspectScopeRevisionTransition(
  admin,
  { goal, userId, revisedAt, revisionToken, expectedData }
) {
  try {
    const { data: current, error } = await admin
      .from('goals')
      .select('id, user_id, status, data, updated_at')
      .eq('id', goal.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !current) return { state: 'unknown', error: error || null };
    if (
      current.status === 'analyzing' &&
      current.data?.scope_revision?.revision_token === revisionToken &&
      Date.parse(current.updated_at) === Date.parse(revisedAt) &&
      isDeepStrictEqual(current.data || {}, expectedData || {})
    ) {
      return { state: 'committed' };
    }
    if (
      current.status === goal.status &&
      (!goal.updated_at || Date.parse(current.updated_at) === Date.parse(goal.updated_at)) &&
      isDeepStrictEqual(current.data || {}, goal.data || {})
    ) {
      return { state: 'original' };
    }
    return { state: 'conflict' };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

/**
 * Replace a proposed or in-flight AxWise scope from one exact owner correction.
 * The decision/hash/generation/revision tuple is a compare-and-set boundary.
 * Rotating revision_token also prevents an older queued or already-running
 * scope-admission job from landing state for the superseded scope.
 */
export async function handleReviseCustomerScope(
  admin,
  user,
  body = {},
  { kickProcessing = kickGoalProcessing } = {}
) {
  const goalId = scopeField(body.id, 255);
  const feedback = scopeField(body.feedback, 4000);
  if (!goalId || !feedback) return { status: 400, error: 'id and feedback are required' };

  const { data: goal, error: loadError } = await admin
    .from('goals')
    .select('id, user_id, status, title, description, tech_doc, data, updated_at')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .single();
  if (loadError || !goal) return { status: 404, error: 'Goal not found' };

  const intelligence = goal.data?.axwise_customer_intelligence || {};
  const preliminaryReview =
    goal.status === 'awaiting_po_input' && intelligence.status === 'human_clarification';
  const activeRebuild =
    (goal.status === 'analyzing' || goal.status === 'researching_customer') &&
    isCanonicalAxwiseScopeGoal(goal);
  if (!preliminaryReview && !activeRebuild) {
    return { status: 409, error: 'Goal is not accepting an AxWise scope correction' };
  }

  let binding;
  if (preliminaryReview) {
    const proposedScope = intelligence.clarification_scope;
    const activeDecisionId = scopeField(intelligence.decision_id, 255);
    if (!proposedScope || !activeDecisionId) {
      return { status: 409, error: 'The active AxWise proposal cannot be revised' };
    }
    const expectedScopeHash = customerScopeHash(activeDecisionId, proposedScope);
    const storedScopeHash = scopeField(proposedScope.scope_hash, 128);
    binding = {
      decisionId: activeDecisionId,
      currentDecisionId: activeDecisionId,
      scopeHash: expectedScopeHash,
      scopeHashPath: 'data->axwise_customer_intelligence->clarification_scope->>scope_hash',
      generation: nullableScopeToken(intelligence.generation),
      jobId: nullableScopeToken(intelligence.job_id),
      revisionToken: nullableScopeToken(goal.data?.scope_revision?.revision_token),
    };
    if (storedScopeHash !== expectedScopeHash) {
      return { status: 409, error: 'The customer scope changed. Refresh and review it again.' };
    }
  } else {
    binding = activeScopeRevisionBinding(goal);
    if (
      !Object.prototype.hasOwnProperty.call(body, 'generation') ||
      !Object.prototype.hasOwnProperty.call(body, 'job_id') ||
      !Object.prototype.hasOwnProperty.call(body, 'revision_token')
    ) {
      return { status: 400, error: 'The active AxWise generation binding is required' };
    }
  }

  const submittedDecisionId = nullableScopeToken(body.decision_id, 255);
  const submittedScopeHash = nullableScopeToken(body.scope_hash, 128);
  const submittedGeneration = nullableScopeToken(body.generation, 255);
  const submittedJobId = nullableScopeToken(body.job_id, 255);
  const submittedRevisionToken = nullableScopeToken(body.revision_token, 255);
  if (
    !sameNullableScopeToken(submittedDecisionId, binding.decisionId) ||
    !sameNullableScopeToken(submittedScopeHash, binding.scopeHash) ||
    !sameNullableScopeToken(submittedGeneration, binding.generation) ||
    !sameNullableScopeToken(submittedJobId, binding.jobId) ||
    !sameNullableScopeToken(submittedRevisionToken, binding.revisionToken)
  ) {
    return { status: 409, error: 'The AxWise scope or generation changed. Refresh and retry.' };
  }

  const revisedAt = new Date().toISOString();
  const revisionToken = randomUUID();
  const acceptedAuthority = intelligence.scope_packet
    ? resolveAcceptedNativeGoalAuthority(goal)
    : null;
  if (acceptedAuthority?.native && !acceptedAuthority.ready) {
    return {
      status: 409,
      error: `The accepted AxWise scope cannot be revised safely: ${acceptedAuthority.reasons.join(', ')}`,
    };
  }
  const previousNativeScope = intelligence.scope_packet?.scope_hash
    ? {
        version: 'orqaly_previous_native_scope_contract_v1',
        packet_version: intelligence.scope_packet.version || null,
        scope_ref: intelligence.scope_packet.scope_ref || null,
        scope_hash: intelligence.scope_packet.scope_hash,
        generation: nullableScopeToken(intelligence.generation),
        scope_updated_at: nullableScopeToken(intelligence.updated_at),
        context_snapshot_hash: nullableScopeToken(
          goal.data?.goal_approvals?.context?.snapshot_hash,
          128
        ),
        scope_packet: intelligence.scope_packet,
        scope_validation: intelligence.scope_validation || null,
        scope_confirmation: intelligence.axwise_scope_confirmation || null,
        scope_contract_binding: intelligence.scope_contract_binding || null,
        revised_at: revisedAt,
      }
    : intelligence.previous_scope_contract || null;
  const revision = {
    version: 'orqaly_scope_revision_v1',
    status: 'pending_rebuild',
    base_kind: previousNativeScope ? 'accepted_native_scope' : 'preliminary_scope_proposal',
    revision_token: revisionToken,
    desired_outcome: feedback,
    source_decision_id: binding.decisionId,
    source_scope_hash: binding.scopeHash,
    source_generation: previousNativeScope?.generation ?? binding.generation,
    source_job_id: binding.jobId,
    requested_by: user.id,
    requested_at: revisedAt,
  };
  const nextIntelligence = {
    ...intelligence,
    status: 'revision_requested',
    previous_scope_contract: previousNativeScope,
    decision_id: null,
    parent_decision_id: null,
    job_id: null,
    generation: null,
    request_id: null,
    request_hash: null,
    requested_at: null,
    current_stage: null,
    progress_percentage: 0,
    elapsed_ms: 0,
    stage_durations_ms: {},
    stage_trace: [],
    last_poll_error: null,
    persona_resolution: null,
    working_hypothesis: null,
    clarification_scope: null,
    clarification_questions: [],
    scope_confirmation: null,
    owner_clarification: null,
    owner_scope_source_decision_id: null,
    owner_scope_source_scope_hash: null,
    scope_packet: null,
    scope_validation: null,
    quality_contract: null,
    axwise_scope_confirmation: null,
    scope_contract_binding: null,
    research_execution_inputs_hash: null,
    proposal_decision_id: null,
    axwise_scope_handoff: null,
    updated_at: revisedAt,
  };
  const updatedData = {
    ...(goal.data || {}),
    context_revision_feedback: feedback,
    scope_revision: revision,
    axwise_customer_intelligence: nextIntelligence,
    work_shape_route: null,
    goal_approvals: {
      ...(goal.data?.goal_approvals || {}),
      context: invalidatedApproval(goal.data?.goal_approvals?.context, 'scope_revised'),
      execution: invalidatedApproval(goal.data?.goal_approvals?.execution, 'scope_revised'),
    },
    scope_admission: {
      version: 1,
      native_scope: true,
      status: 'revision_requested',
      state_key: 'axwise_customer_intelligence',
      scope_hash: null,
      playbook_id: null,
      route_version: goal.data?.scope_admission?.route_version || null,
      accepted_at: null,
      requires_authorization: false,
      maximum_side_effect: 'none',
      grants_authorization: false,
      updated_at: revisedAt,
    },
  };

  let transition = admin
    .from('goals')
    .update({ status: 'analyzing', data: updatedData, updated_at: revisedAt })
    .eq('id', goalId)
    .eq('user_id', user.id)
    .eq('status', goal.status);
  const bindTransition = (path, value) => {
    transition = value == null ? transition.is(path, null) : transition.eq(path, value);
  };
  bindTransition('data->axwise_customer_intelligence->>decision_id', binding.currentDecisionId);
  bindTransition('data->axwise_customer_intelligence->>job_id', binding.jobId);
  bindTransition('data->axwise_customer_intelligence->>generation', binding.generation);
  bindTransition('data->scope_revision->>revision_token', binding.revisionToken);
  if (binding.scopeHashPath && binding.scopeHash) {
    bindTransition(binding.scopeHashPath, binding.scopeHash);
  }
  if (goal.updated_at) transition = transition.eq('updated_at', goal.updated_at);
  const { data: transitioned, error: transitionError } = await transition
    .select('id')
    .maybeSingle();
  if (transitionError) {
    const inspection = await inspectScopeRevisionTransition(admin, {
      goal,
      userId: user.id,
      revisedAt,
      revisionToken,
      expectedData: updatedData,
    });
    if (inspection.state !== 'committed') {
      return inspection.state === 'conflict'
        ? { status: 409, error: 'The AxWise scope or generation changed. Refresh and retry.' }
        : { status: 503, error: 'The scope correction could not be saved' };
    }
  }
  if (!transitioned && !transitionError) {
    return { status: 409, error: 'The AxWise scope or generation changed. Refresh and retry.' };
  }

  const { jobId, error: enqueueError } = await enqueueGoalWorkerJob(admin, {
    user_id: user.id,
    status: 'queued',
    payload: {
      type: 'orchestrate-goal',
      action: 'scope-admission',
      goalId,
      scope_revision_token: revisionToken,
    },
  });
  if (enqueueError) {
    if (goalWorkerEnqueueNeedsReconciliation(enqueueError)) {
      return goalWorkerEnqueueReconciliationFailure(enqueueError);
    }
    const rollbackSucceeded = await rollbackExactGoalHandoff(admin, {
      goalId,
      userId: user.id,
      expectedStatus: 'analyzing',
      expectedUpdatedAt: revisedAt,
      expectedFilters: [
        ['eq', 'data->scope_revision->>revision_token', revisionToken],
        ['eq', 'data->axwise_customer_intelligence->>status', 'revision_requested'],
      ],
      restore: { status: goal.status, data: goal.data },
    });
    return {
      status: 503,
      error: rollbackSucceeded
        ? 'Scope rebuilding could not be queued. The previous scope state was restored; retry again.'
        : 'Scope rebuilding could not be queued and recovery could not be verified. Refresh before retrying.',
    };
  }

  const handoff = await requestGoalProcessingHandoff(admin, goalId, {
    jobId,
    userId: user.id,
    kickProcessing,
    operation: 'revise-customer-scope',
    rollbackGoalOnSafeFailure: () =>
      rollbackExactGoalHandoff(admin, {
        goalId,
        userId: user.id,
        expectedStatus: 'analyzing',
        expectedUpdatedAt: revisedAt,
        expectedFilters: [
          ['eq', 'data->scope_revision->>revision_token', revisionToken],
          ['eq', 'data->axwise_customer_intelligence->>status', 'revision_requested'],
        ],
        restore: { status: goal.status, data: goal.data },
      }),
  });
  if (!handoff.ok) return goalProcessingHandoffFailure(handoff);

  await admin.from('goal_log').insert({
    goal_id: goalId,
    event_type: 'axwise_customer_scope_revision_requested',
    details: {
      actor: user.id,
      revision_token: revisionToken,
      source_decision_id: binding.decisionId,
      source_scope_hash: binding.scopeHash,
      source_generation: binding.generation,
    },
  });
  return {
    status: 202,
    data: {
      goalId,
      status: 'analyzing',
      revision_token: revisionToken,
      source_scope_hash: binding.scopeHash,
    },
  };
}

/**
 * Accept one AxWise working scope and resume customer intelligence. The status,
 * active decision id and deterministic scope hash form a compare-and-set
 * boundary so an old browser cannot approve a newer clarification decision.
 */
export async function handleAcceptCustomerScope(
  admin,
  user,
  body = {},
  { kickProcessing = kickGoalProcessing } = {}
) {
  const goalId = scopeField(body.id, 255);
  const submittedDecisionId = scopeField(body.decision_id, 255);
  const submittedScopeHash = scopeField(body.scope_hash, 128);
  if (!goalId || !submittedDecisionId) {
    return { status: 400, error: 'id and decision_id are required' };
  }

  const { data: goal, error: loadError } = await admin
    .from('goals')
    .select('id, user_id, status, title, description, tech_doc, data')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .single();
  if (loadError || !goal) return { status: 404, error: 'Goal not found' };

  const intelligence = goal.data?.axwise_customer_intelligence || {};
  const activeDecisionId = scopeField(intelligence.decision_id, 255);
  const existingConfirmation = intelligence.scope_confirmation || {};
  if (existingConfirmation.status === 'accepted') {
    // requestClarification clears stale confirmations, but retain this guard
    // for rows written by an older deployment: an accepted older decision
    // cannot bypass a newer active human gate.
    if (goal.status === 'awaiting_po_input' && intelligence.status === 'human_clarification') {
      return {
        status: 409,
        error: 'A newer customer scope needs review. Refresh before retrying.',
      };
    }
    const sourceScopeHash = scopeField(existingConfirmation.source_scope_hash, 128);
    const acceptedProposal = intelligence.clarification_scope || existingConfirmation.scope || {};
    const legacyHashMayBeOmitted =
      acceptedProposal.source === 'legacy_po_clarification_answers' ||
      existingConfirmation.scope?.source === 'legacy_po_clarification_answers';
    const submittedScope = body.scope && typeof body.scope === 'object' ? body.scope : {};
    const normalized = normalizedAcceptedScope(submittedScope, acceptedProposal);
    const sameDecision =
      scopeField(existingConfirmation.source_decision_id, 255) === submittedDecisionId;
    const sameHash = submittedScopeHash
      ? submittedScopeHash === sourceScopeHash
      : legacyHashMayBeOmitted;
    if (sameDecision && sameHash && acceptedScopeMatches(existingConfirmation, normalized)) {
      return {
        status: 202,
        data: {
          goalId,
          status: goal.status,
          decision_id: submittedDecisionId,
          scope_hash: sourceScopeHash,
          idempotent: true,
        },
      };
    }
    return {
      status: 409,
      error:
        'This scope confirmation does not match the accepted request. Refresh before retrying.',
    };
  }
  if (goal.status !== 'awaiting_po_input' || intelligence.status !== 'human_clarification') {
    return { status: 409, error: 'Goal is not awaiting an AxWise scope confirmation' };
  }
  if (!activeDecisionId || activeDecisionId !== submittedDecisionId) {
    return {
      status: 409,
      error: 'The customer scope decision changed. Refresh and review it again.',
    };
  }

  const legacy = !intelligence.clarification_scope;
  const legacyAnswers = Array.isArray(goal.data?.po_answers) ? goal.data.po_answers : [];
  const hasSubstantiveLegacyAnswers = legacyAnswers.some((item) =>
    scopeField(typeof item === 'object' ? item.answer : item, 4000)
  );
  if (legacy && hasSubstantiveLegacyAnswers && !hasCompleteLegacyClarification(goal)) {
    return {
      status: 409,
      error: 'Saved clarification answers no longer match the active questions',
    };
  }
  const proposedScope = intelligence.clarification_scope || legacyClarificationScope(goal);
  if (!proposedScope) {
    return { status: 409, error: 'The active AxWise decision has no confirmable working scope' };
  }
  const storedScopeHash = scopeField(proposedScope.scope_hash, 128);
  const expectedScopeHash = customerScopeHash(activeDecisionId, proposedScope);
  if (
    (storedScopeHash && storedScopeHash !== expectedScopeHash) ||
    (!submittedScopeHash && !legacy) ||
    (submittedScopeHash && submittedScopeHash !== expectedScopeHash)
  ) {
    return { status: 409, error: 'The customer scope changed. Refresh and review it again.' };
  }

  const submitted = body.scope && typeof body.scope === 'object' ? body.scope : {};
  const { targetCustomer, problem, desiredOutcome, optionalDetails } = normalizedAcceptedScope(
    submitted,
    proposedScope
  );
  if (!targetCustomer || !desiredOutcome) {
    return { status: 400, error: 'The confirmed scope needs a customer and intended outcome' };
  }
  const acceptedAt = new Date().toISOString();
  const summary = `So you want to ${scopeField(
    proposedScope.business_idea || goal.title,
    4000
  )} for ${targetCustomer}, who face ${problem}. The intended outcome is ${desiredOutcome}.`;
  const scopeConfirmation = {
    version: 'orqaly_axwise_scope_confirmation_v1',
    status: 'accepted',
    source_decision_id: activeDecisionId,
    source_scope_hash: expectedScopeHash,
    accepted_at: acceptedAt,
    accepted_by: user.id,
    provenance: OWNER_SCOPE_CONFIRMATION_PROVENANCE,
    summary,
    target_customer: targetCustomer,
    problem,
    desired_outcome: desiredOutcome,
    optional_details: optionalDetails || null,
    trust: {
      status: 'declared_inferred_unverified',
      verified: false,
      underlying_facts_verified: false,
    },
    scope: {
      ...proposedScope,
      scope_hash: expectedScopeHash,
      summary,
      target_customer: targetCustomer,
      problem,
      desired_outcome: desiredOutcome,
      trust: {
        ...(proposedScope.trust || {}),
        status: 'declared_inferred_unverified',
        verified: false,
      },
    },
  };
  const updatedData = {
    ...(goal.data || {}),
    axwise_customer_intelligence: {
      ...intelligence,
      status: 'scope_confirmed',
      clarification_source_research_run: clarificationSourceResearchRun(intelligence),
      // Keep decision_id + clarification_scope active for confirmation
      // validation, but rotate every provider job/request lifecycle field so
      // the resumed worker must obtain a fresh AxWise routing decision.
      job_id: null,
      generation: null,
      request_id: null,
      request_hash: null,
      requested_at: null,
      current_stage: null,
      progress_percentage: 0,
      elapsed_ms: 0,
      stage_durations_ms: {},
      stage_trace: [],
      last_poll_error: null,
      clarification_scope: { ...proposedScope, scope_hash: expectedScopeHash },
      scope_confirmation: scopeConfirmation,
    },
  };

  let transition = admin
    .from('goals')
    .update({ status: 'researching_customer', data: updatedData, updated_at: acceptedAt })
    .eq('id', goalId)
    .eq('user_id', user.id)
    .eq('status', 'awaiting_po_input')
    .eq('data->axwise_customer_intelligence->>decision_id', activeDecisionId);
  if (!legacy) {
    transition = transition.eq(
      'data->axwise_customer_intelligence->clarification_scope->>scope_hash',
      expectedScopeHash
    );
  }
  // Legacy rows predate clarification_scope/scope_hash. Their first accept is
  // still CAS-bound to owner + awaiting status + active decision above; if two
  // different submissions race, exactly one status transition wins and the
  // loser cannot overwrite its accepted content.
  const { data: transitioned, error: transitionError } = await transition
    .select('id')
    .maybeSingle();
  if (transitionError) {
    return { status: 503, error: 'The customer scope confirmation could not be saved' };
  }
  if (!transitioned) {
    return { status: 409, error: 'The customer scope changed. Refresh and review it again.' };
  }

  const { jobId, error: enqueueError } = await enqueueGoalWorkerJob(admin, {
    user_id: user.id,
    status: 'queued',
    payload: { type: 'orchestrate-goal', action: 'customer-intelligence', goalId },
  });
  if (enqueueError) {
    if (goalWorkerEnqueueNeedsReconciliation(enqueueError)) {
      return goalWorkerEnqueueReconciliationFailure(enqueueError);
    }
    const { data: rolledBack, error: rollbackError } = await admin
      .from('goals')
      .update({
        status: 'awaiting_po_input',
        data: goal.data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', goalId)
      .eq('user_id', user.id)
      .eq('status', 'researching_customer')
      .eq('data->axwise_customer_intelligence->>status', 'scope_confirmed')
      .eq('data->axwise_customer_intelligence->>decision_id', activeDecisionId)
      .eq(
        'data->axwise_customer_intelligence->scope_confirmation->>source_decision_id',
        activeDecisionId
      )
      .eq('data->axwise_customer_intelligence->scope_confirmation->>accepted_at', acceptedAt)
      .is('data->axwise_customer_intelligence->>generation', null)
      .is('data->axwise_customer_intelligence->>job_id', null)
      .is('data->axwise_customer_intelligence->>request_id', null)
      .is('data->axwise_customer_intelligence->>request_hash', null)
      .select('id')
      .maybeSingle();
    const rollbackSucceeded = !rollbackError && Boolean(rolledBack);
    log.error(null, 'goal.customer-scope.enqueue-failed', {
      goalId,
      error: enqueueError.message,
      rollback_succeeded: rollbackSucceeded,
      rollback_error: rollbackError?.message || null,
    });
    return {
      status: 503,
      error: rollbackSucceeded
        ? 'Customer intelligence could not be queued. Your goal remains at the confirmation gate.'
        : 'Customer intelligence could not be queued and the confirmation gate could not be restored. Refresh before retrying.',
    };
  }

  await admin.from('goal_log').insert({
    goal_id: goalId,
    event_type: 'axwise_customer_scope_accepted',
    details: {
      actor: user.id,
      decision_id: activeDecisionId,
      scope_hash: expectedScopeHash,
      provenance: OWNER_SCOPE_CONFIRMATION_PROVENANCE,
      legacy_scope_upgraded: legacy,
      underlying_facts_verified: false,
    },
  });
  const handoff = await requestGoalProcessingHandoff(admin, goalId, {
    jobId,
    userId: user.id,
    kickProcessing,
    operation: 'accept-customer-scope',
    rollbackGoalOnSafeFailure: () =>
      rollbackExactGoalHandoff(admin, {
        goalId,
        userId: user.id,
        expectedStatus: 'researching_customer',
        expectedUpdatedAt: acceptedAt,
        expectedFilters: [
          [
            'eq',
            'data->axwise_customer_intelligence->scope_confirmation->>source_decision_id',
            activeDecisionId,
          ],
          [
            'eq',
            'data->axwise_customer_intelligence->scope_confirmation->>accepted_at',
            acceptedAt,
          ],
          ['is', 'data->axwise_customer_intelligence->>job_id', null],
        ],
        restore: { status: 'awaiting_po_input', data: goal.data },
      }),
  });
  if (!handoff.ok) return goalProcessingHandoffFailure(handoff);
  return {
    status: 202,
    data: {
      goalId,
      status: 'researching_customer',
      decision_id: activeDecisionId,
      scope_hash: expectedScopeHash,
    },
  };
}

// ── Adopt for New Business ────────────────────────────────────────────────
async function handleAdoptBusiness(admin, user, body) {
  const { goalId, orgName, orgType, industry, description } = body;
  if (!goalId || !orgName) return { status: 400, error: 'goalId and orgName are required' };

  // Verify goal belongs to user
  const { data: goal } = await admin
    .from('goals')
    .select('id, title')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .single();
  if (!goal) return { status: 404, error: 'Goal not found' };

  // Create organization
  const slug =
    orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'org';
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({
      user_id: user.id,
      name: orgName,
      description: description || `Business created from goal: ${goal.title}`,
      slug: `${slug}-${Date.now().toString(36)}`,
      industry: industry || null,
      org_type: orgType || 'holding',
      is_active: true,
    })
    .select('id, name')
    .single();
  if (orgErr) throw orgErr;

  // Create unit (department) for this org
  const { data: unit, error: unitErr } = await admin
    .from('goal_units')
    .insert({
      user_id: user.id,
      name: `${orgName} — Main`,
      description: `Primary department for ${orgName}`,
      unit_type: 'bundle',
      org_id: org.id,
      status: 'active',
    })
    .select('id, name')
    .single();
  if (unitErr) throw unitErr;

  // Link goal to org + unit
  await admin.from('goals').update({ org_id: org.id, unit_id: unit.id }).eq('id', goalId);

  // Add goal as unit member
  await admin
    .from('goal_unit_members')
    .insert({ unit_id: unit.id, goal_id: goalId, sequence_order: 0 });

  return { status: 201, data: { org, unit, goalId } };
}

// ── Implement in Existing ─────────────────────────────────────────────────
async function handleImplementExisting(admin, user, body) {
  const { goalId, orgId, unitId, unitName, orgName, orgType, industry, description, context } =
    body;
  if (!goalId) return { status: 400, error: 'goalId is required' };

  const { data: goal } = await admin
    .from('goals')
    .select('id, title, description')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .single();
  if (!goal) return { status: 404, error: 'Goal not found' };

  // New path: link to existing organization (+ optional unit)
  if (orgId) {
    const { data: org } = await admin
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .eq('user_id', user.id)
      .single();
    if (!org) return { status: 404, error: 'Organization not found' };

    let unit;
    if (unitId) {
      const { data: existingUnit } = await admin
        .from('goal_units')
        .select('id, name, org_id')
        .eq('id', unitId)
        .eq('user_id', user.id)
        .single();
      if (!existingUnit) return { status: 404, error: 'Unit not found' };
      if (existingUnit.org_id && existingUnit.org_id !== org.id) {
        return { status: 400, error: 'Unit does not belong to the selected organization' };
      }
      unit = existingUnit;
      if (!existingUnit.org_id) {
        await admin.from('goal_units').update({ org_id: org.id }).eq('id', unit.id);
      }
    } else {
      const name = (unitName || `${org.name} — Operations`).trim();
      const { data: newUnit, error: unitErr } = await admin
        .from('goal_units')
        .insert({
          user_id: user.id,
          name,
          description: '',
          unit_type: 'initiative',
          org_id: org.id,
          status: 'active',
        })
        .select('id, name')
        .single();
      if (unitErr) throw unitErr;
      unit = newUnit;
    }

    await admin
      .from('goals')
      .update({
        org_id: org.id,
        unit_id: unit.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', goalId);

    const { data: existingMember } = await admin
      .from('goal_unit_members')
      .select('goal_id')
      .eq('unit_id', unit.id)
      .eq('goal_id', goalId)
      .maybeSingle();
    if (!existingMember) {
      const { data: members } = await admin
        .from('goal_unit_members')
        .select('sequence_order')
        .eq('unit_id', unit.id)
        .order('sequence_order', { ascending: false })
        .limit(1);
      const nextOrder = members?.length ? (members[0].sequence_order || 0) + 1 : 0;
      await admin
        .from('goal_unit_members')
        .insert({ unit_id: unit.id, goal_id: goalId, sequence_order: nextOrder });
    }

    return { status: 201, data: { org, unit, goalId } };
  }

  // Legacy path: create org from interview data
  if (!orgName) return { status: 400, error: 'goalId and orgId (or orgName) are required' };

  const slug =
    orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) || 'org';
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({
      user_id: user.id,
      name: orgName,
      description: description || '',
      slug: `${slug}-${Date.now().toString(36)}`,
      industry: industry || null,
      org_type: orgType || 'subsidiary',
      is_active: true,
    })
    .select('id, name')
    .single();
  if (orgErr) throw orgErr;

  const { data: unit, error: unitErr } = await admin
    .from('goal_units')
    .insert({
      user_id: user.id,
      name: `${orgName} — Operations`,
      description: description || '',
      unit_type: 'initiative',
      org_id: org.id,
      status: 'active',
      metadata: { interview_context: context || {} },
    })
    .select('id, name')
    .single();
  if (unitErr) throw unitErr;

  const enrichedDesc = [
    goal.description,
    context
      ? `\n\n--- Business Context ---\n${typeof context === 'string' ? context : JSON.stringify(context, null, 2)}`
      : '',
  ]
    .filter(Boolean)
    .join('');

  await admin
    .from('goals')
    .update({
      org_id: org.id,
      unit_id: unit.id,
      description: enrichedDesc,
    })
    .eq('id', goalId);

  await admin
    .from('goal_unit_members')
    .insert({ unit_id: unit.id, goal_id: goalId, sequence_order: 0 });

  return { status: 201, data: { org, unit, goalId } };
}

// ── Replace Unit ──────────────────────────────────────────────────────────
async function handleReplaceUnit(admin, user, body) {
  const { goalId, unitId, mode, replaceGoalId } = body;
  if (!goalId || !unitId) return { status: 400, error: 'goalId and unitId are required' };

  const { data: unit } = await admin
    .from('goal_units')
    .select('id, name')
    .eq('id', unitId)
    .eq('user_id', user.id)
    .single();
  if (!unit) return { status: 404, error: 'Unit not found' };

  const { data: goal } = await admin
    .from('goals')
    .select('id')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .single();
  if (!goal) return { status: 404, error: 'Goal not found' };

  if (mode === 'replace_all') {
    // Cancel all existing goals in unit
    const { data: members } = await admin
      .from('goal_unit_members')
      .select('goal_id')
      .eq('unit_id', unitId);
    for (const m of members || []) {
      await admin
        .from('goals')
        .update({ status: 'cancelled' })
        .eq('id', m.goal_id)
        .in('status', [
          'planning',
          'active',
          'paused',
          'feasibility',
          'analyzing',
          'researching_customer',
          'forming_team',
        ]);
    }
    // Remove old members
    await admin.from('goal_unit_members').delete().eq('unit_id', unitId);
  } else if (mode === 'replace_goal' && replaceGoalId) {
    // Cancel specific goal and remove from unit
    await admin
      .from('goals')
      .update({ status: 'cancelled', unit_id: null })
      .eq('id', replaceGoalId)
      .eq('user_id', user.id);
    await admin
      .from('goal_unit_members')
      .delete()
      .eq('unit_id', unitId)
      .eq('goal_id', replaceGoalId);
  }

  // Add new goal to unit
  await admin.from('goals').update({ unit_id: unitId }).eq('id', goalId);
  const maxOrder = await admin
    .from('goal_unit_members')
    .select('sequence_order')
    .eq('unit_id', unitId)
    .order('sequence_order', { ascending: false })
    .limit(1);
  const nextOrder = (maxOrder.data?.[0]?.sequence_order || 0) + 1;
  await admin
    .from('goal_unit_members')
    .insert({ unit_id: unitId, goal_id: goalId, sequence_order: nextOrder });

  return { status: 200, data: { unitId, goalId, mode } };
}

// ── Create Unit ───────────────────────────────────────────────────────────
async function handleCreateUnit(admin, user, body) {
  const { name, unitType, orgId, goalIds } = body;
  if (!name) return { status: 400, error: 'name is required' };

  const { data: unit, error } = await admin
    .from('goal_units')
    .insert({
      user_id: user.id,
      name,
      unit_type: unitType || 'bundle',
      org_id: orgId || null,
      status: 'active',
    })
    .select('*')
    .single();
  if (error) throw error;

  // Add goals as members
  if (goalIds?.length > 0) {
    const members = goalIds.map((gid, i) => ({
      unit_id: unit.id,
      goal_id: gid,
      sequence_order: i,
    }));
    await admin.from('goal_unit_members').insert(members);
    await admin.from('goals').update({ unit_id: unit.id }).in('id', goalIds).eq('user_id', user.id);
  }

  return { status: 201, data: unit };
}

// ── List Units ────────────────────────────────────────────────────────────
async function handleListUnits(admin, user, query = {}) {
  let q = admin
    .from('goal_units')
    .select('*, goal_unit_members(goal_id), organizations(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (query?.org_id) {
    q = q.eq('org_id', query.org_id);
  }

  const { data: units } = await q;

  const enriched = (units || []).map((u) => ({
    ...u,
    goalCount: u.goal_unit_members?.length || 0,
    orgName: u.organizations?.name || null,
    goal_unit_members: undefined,
    organizations: undefined,
  }));

  return { status: 200, data: enriched };
}

// ── Update Unit ───────────────────────────────────────────────────────────
async function handleUpdateUnit(admin, user, body) {
  const { unitId, name, status, goalIds, metadata } = body;
  if (!unitId) return { status: 400, error: 'unitId is required' };

  const updates = {};
  if (name) updates.name = name;
  if (status) updates.status = status;
  if (metadata) updates.metadata = metadata;
  updates.updated_at = new Date().toISOString();

  const { error } = await admin
    .from('goal_units')
    .update(updates)
    .eq('id', unitId)
    .eq('user_id', user.id);
  if (error) throw error;

  // Update membership if goalIds provided
  if (goalIds) {
    await admin.from('goal_unit_members').delete().eq('unit_id', unitId);
    if (goalIds.length > 0) {
      const members = goalIds.map((gid, i) => ({
        unit_id: unitId,
        goal_id: gid,
        sequence_order: i,
      }));
      await admin.from('goal_unit_members').insert(members);
    }
  }

  return { status: 200, data: { unitId, updated: true } };
}

// ── Update Workflow on Goal ───────────────────────────────────────────────
async function handleUpdateWorkflow(admin, user, body) {
  const { goalId, workflowId } = body;
  if (!goalId) return { status: 400, error: 'goalId is required' };
  const { data: goal } = await admin
    .from('goals')
    .select('id')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .single();
  if (!goal) return { status: 404, error: 'Goal not found' };
  const { error } = await admin
    .from('goals')
    .update({ workflow_id: workflowId || null })
    .eq('id', goalId);
  if (error) throw error;
  return { status: 200, data: { goalId, workflowId: workflowId || null } };
}

// ── Duplicate Goal ────────────────────────────────────────────────────────
async function handleDuplicate(admin, user, body) {
  const { goalId } = body;
  if (!goalId) return { status: 400, error: 'goalId is required' };

  const { data: src } = await admin
    .from('goals')
    .select('*')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .single();
  if (!src) return { status: 404, error: 'Goal not found' };
  if (hasNativeAxwiseScopeMarkers(src)) {
    return {
      status: 409,
      error:
        'This native AxWise goal cannot be copied into the legacy pipeline. Start a new Smart Request so the copied work receives its own confirmed scope.',
    };
  }

  const { data: dup, error } = await admin
    .from('goals')
    .insert({
      user_id: user.id,
      title: `${src.title} (copy)`,
      description: src.description,
      budget_usd: src.budget_usd,
      status: 'feasibility',
      parsed_category: src.parsed_category,
      parsed_priority: src.parsed_priority,
      parsed_requirements: src.parsed_requirements,
      complexity: src.complexity,
      execution_mode: src.execution_mode,
      mode: src.mode,
      executor_type: src.executor_type,
      org_id: src.org_id,
      unit_id: src.unit_id,
    })
    .select('id, title, status')
    .single();
  if (error) throw error;

  // If source was in a unit, add the copy too
  if (src.unit_id) {
    await runBestEffortSupabaseQuery(
      admin
        .from('goal_unit_members')
        .insert({ unit_id: src.unit_id, goal_id: dup.id, sequence_order: 99 }),
      {
        onError: (membershipError) =>
          log.warn(null, 'goal.duplicate.unit-membership-failed', {
            sourceGoalId: goalId,
            duplicateGoalId: dup.id,
            error: membershipError?.message || String(membershipError),
          }),
      }
    );
  }

  return { status: 201, data: dup };
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized');

  const rlKey = `goals:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 30, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database not configured');

  const op = (req.query?.op || '').trim();
  const body = req.body || {};

  try {
    let result;
    switch (op) {
      case 'create':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleCreate(admin, user, req.body || {});
        break;
      case 'prepare-physical-evidence-profile':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handlePreparePhysicalEvidenceProfile(admin, user, body);
        break;
      case 'create-smart-request-draft':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleCreateSmartRequestDraft(admin, user, body);
        break;
      case 'start-smart-request':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleStartSmartRequest(admin, user, body);
        break;
      case 'list':
        result = await handleList(admin, user, req.query);
        break;
      case 'loops':
        result = await handleLoops(admin, user);
        break;
      case 'get':
        result = await handleGet(admin, user, req.query);
        break;
      case 'pause':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleLifecycle(admin, user, req.query, 'paused');
        break;
      case 'resume':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleLifecycle(admin, user, req.query, 'active');
        break;
      case 'retry-pickup':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleRetryPickup(admin, user, {
          ...req.query,
          pickup_capability: body.pickup_capability,
        });
        break;
      case 'cancel':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleLifecycle(admin, user, req.query, 'cancelled');
        break;
      case 'delete':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleDelete(admin, user, req.query);
        break;
      case 'retry':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleRetry(admin, user, req.query);
        break;
      case 'rerun-quality-review':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleRerunQualityReview(admin, user, req.query);
        break;
      case 'review-context':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleContextReview(admin, user, req.query, body);
        break;
      case 'accept-customer-scope':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleAcceptCustomerScope(admin, user, body);
        break;
      case 'revise-customer-scope':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleReviseCustomerScope(admin, user, body);
        break;
      case 'answer-po-questions':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleAnswerPoQuestions(admin, user, body);
        break;
      case 'resolve':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleResolve(admin, user, body);
        break;
      case 'update-budget':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleUpdateBudget(admin, user, req.query);
        break;
      case 'toggle-autopilot':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleToggleAutopilot(admin, user, req.query, body);
        break;
      case 'toggle-loop':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleToggleLoop(admin, user, req.query, req.body || {});
        break;
      case 'update-loop-settings':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleUpdateLoopSettings(admin, user, req.query, req.body || {});
        break;
      case 'chain-spend': {
        const goalId = req.query?.id;
        if (!goalId) return jsonError(res, 400, 'id is required');
        const { getChainSpend } = await import('../cost/chain.js');
        const spend = await getChainSpend(admin, user.id, goalId);
        result = { status: 200, data: spend };
        break;
      }
      case 'provide-tools':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleProvideTools(admin, user, { ...(req.query || {}), ...body });
        break;
      case 'phase-outputs':
        result = await handlePhaseOutputs(admin, user, req.query);
        break;
      case 'messages':
        result = await handleMessages(admin, user, req.query);
        break;
      case 'research-bundle':
        result = await handleResearchBundle(admin, user, req.query);
        break;
      case 'research-artifact':
        result = await handleResearchArtifact(admin, user, req.query);
        break;
      case 'approve':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleApproval(admin, user, req.query, 'approve');
        break;
      case 'request-changes':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleApproval(admin, user, req.query, 'request-changes', body);
        break;
      // ── Unit / Business operations ──
      case 'adopt-business':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleAdoptBusiness(admin, user, req.body || {});
        break;
      case 'implement-existing':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleImplementExisting(admin, user, req.body || {});
        break;
      case 'replace-unit':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleReplaceUnit(admin, user, req.body || {});
        break;
      case 'create-unit':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleCreateUnit(admin, user, req.body || {});
        break;
      case 'list-units':
        result = await handleListUnits(admin, user, req.query);
        break;
      case 'update-unit':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleUpdateUnit(admin, user, req.body || {});
        break;
      case 'duplicate':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleDuplicate(admin, user, req.body || {});
        break;
      case 'update-workflow':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleUpdateWorkflow(admin, user, req.body || {});
        break;
      // ── Theory Mode projections ──
      case 'projections': {
        const goalId = req.query?.id;
        if (!goalId) return jsonError(res, 400, 'id is required');
        const { data: projData, error: projErr } = await admin
          .from('goal_projections')
          .select('*')
          .eq('goal_id', goalId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (projErr) throw projErr;
        result = { status: 200, data: projData || [] };
        break;
      }
      case 'regenerate-projection': {
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        const goalId = req.query?.id || body?.id;
        if (!goalId) return jsonError(res, 400, 'id is required');
        const { data: goal, error: gErr } = await admin
          .from('goals')
          .select('*')
          .eq('id', goalId)
          .eq('user_id', user.id)
          .single();
        if (gErr || !goal) return jsonError(res, 404, 'Goal not found');
        const { generateQuickPreview } =
          await import('../goal-handlers/stages/theory-projection.js');
        const projResult = await generateQuickPreview(admin, goal, req);
        result = { status: 200, data: projResult };
        break;
      }
      case 'custom-projection': {
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        const goalId = req.query?.id || body?.id;
        if (!goalId) return jsonError(res, 400, 'id is required');
        const { data: goal, error: gErr } = await admin
          .from('goals')
          .select('*')
          .eq('id', goalId)
          .eq('user_id', user.id)
          .single();
        if (gErr || !goal) return jsonError(res, 404, 'Goal not found');
        const { generateQuickPreview } =
          await import('../goal-handlers/stages/theory-projection.js');
        const projResult = await generateQuickPreview(
          admin,
          { ...goal, _customRange: { start_date: body?.start_date, end_date: body?.end_date } },
          req
        );
        result = { status: 200, data: projResult };
        break;
      }
      default:
        return jsonError(res, 400, `Invalid op: ${op}`);
    }

    return sendGoalHandlerResult(res, result);
  } catch (err) {
    return handleApiError(res, err, 'goals');
  }
}

// ── Loop switch toggle ────────────────────────────────────────────────────
/**
 * Flip a goal's loop_enabled flag. When true, complete.js auto-spawns a
 * continuation goal seeded with the parent's strategic outputs. Toggling
 * off on the latest goal in the chain stops the chain (mid-chain goals
 * have already spawned their children so toggling them off has no effect
 * on existing descendants — only on whether THEY spawn another).
 */
async function handleToggleLoop(admin, user, query, body) {
  const id = query?.id || body?.id;
  if (!id) return { status: 400, error: 'id required' };

  const { data: goal } = await admin
    .from('goals')
    .select('id, loop_enabled, loop_chain_root_id, loop_paused')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!goal) return { status: 404, error: 'Goal not found' };

  const nextEnabled = typeof body?.enabled === 'boolean' ? body.enabled : !goal.loop_enabled;
  const updates = { loop_enabled: nextEnabled, updated_at: new Date().toISOString() };
  // Turning loop back on after a pause: clear the pause so the next
  // completion (or the next manual heal) can spawn again.
  if (nextEnabled && goal.loop_paused) {
    updates.loop_paused = false;
    updates.loop_paused_reason = null;
  }
  // Self-root the chain if this is a hand-created standalone goal that
  // never had a root. (Continuation goals already have one.)
  if (nextEnabled && !goal.loop_chain_root_id) {
    updates.loop_chain_root_id = id;
  }

  const { error } = await admin.from('goals').update(updates).eq('id', id);
  if (error) return { status: 500, error: error.message };

  await admin.from('goal_log').insert({
    goal_id: id,
    event_type: nextEnabled ? 'loop_enabled' : 'loop_disabled',
    details: { actor: user.id, was_paused: goal.loop_paused === true },
  });

  // Re-enabling a loop that paused at an advanced checkpoint (converged /
  // chain_budget_cap / hitl_checkpoint) is the approval to continue: the
  // parent goal is already completed, so spawn its continuation now. Idempotent
  // via continuation_goal_id, and the advanced guards re-run inside.
  if (nextEnabled && goal.loop_paused) {
    await maybeRespawnAfterApproval(admin, id, null);
  }

  return { status: 200, data: { id, loop_enabled: nextEnabled } };
}

/**
 * Reload a completed loop goal and re-invoke the continuation spawner. Used as
 * the "approve & continue" path when a chain paused at an advanced checkpoint.
 * No-op for goals that are not completed or already spawned a continuation.
 */
async function maybeRespawnAfterApproval(admin, goalId, req) {
  const { data: fresh } = await admin.from('goals').select('*').eq('id', goalId).maybeSingle();
  if (!fresh) return;
  if (fresh.status !== 'completed' || fresh.continuation_goal_id) return;
  try {
    const { maybeSpawnContinuation } = await import('../goal-handlers/loop-continuation.js');
    await maybeSpawnContinuation(admin, fresh, fresh.data?.project_overview || null, { req });
  } catch (err) {
    log.warn(req, 'loop.respawn.failed', { goalId, error: err.message });
  }
}

// ── Advanced loop settings ────────────────────────────────────────────────
/**
 * Persist a goal's loop_advanced flag and/or its loop_settings blob. Toggling
 * loop_advanced on activates the cost/quality-aware stops + human checkpoint in
 * maybeSpawnContinuation; toggling off reverts to default loop behavior. Only
 * the provided keys are changed; loop_settings is shallow-merged.
 */
export async function handleUpdateLoopSettings(admin, user, query, body) {
  const id = query?.id || body?.id;
  if (!id) return { status: 400, error: 'id required' };

  const { updateLoopSettingsBodySchema } = await import('../../api/_lib/validate.js');
  const parsed = updateLoopSettingsBodySchema.safeParse(body || {});
  if (!parsed.success) {
    return { status: 400, error: parsed.error.issues?.[0]?.message || 'Invalid loop settings' };
  }

  const { data: goal } = await admin
    .from('goals')
    .select('id, loop_advanced, loop_settings')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!goal) return { status: 404, error: 'Goal not found' };

  const updates = { updated_at: new Date().toISOString() };
  if (typeof parsed.data.loop_advanced === 'boolean') {
    updates.loop_advanced = parsed.data.loop_advanced;
  }
  if (parsed.data.loop_settings) {
    updates.loop_settings = { ...(goal.loop_settings || {}), ...parsed.data.loop_settings };
  }

  const { error } = await admin.from('goals').update(updates).eq('id', id);
  if (error) return { status: 500, error: error.message };

  return {
    status: 200,
    data: {
      id,
      loop_advanced: updates.loop_advanced ?? goal.loop_advanced ?? false,
      loop_settings: updates.loop_settings ?? goal.loop_settings ?? null,
    },
  };
}

// ── M4: Autopilot toggle ──────────────────────────────────────────────────
/**
 * Flip a goal's autopilot_enabled flag. When false, process-next will stop
 * advancing the goal (self-healer stays on so error recovery keeps working).
 * Body accepts { enabled: boolean } — absent means toggle.
 */
async function handleToggleAutopilot(admin, user, query, body) {
  const id = query?.id || body?.id;
  if (!id) return { status: 400, error: 'id required' };

  const { data: goal } = await admin
    .from('goals')
    .select('id, autopilot_enabled')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!goal) return { status: 404, error: 'Goal not found' };

  const nextEnabled = typeof body?.enabled === 'boolean' ? body.enabled : !goal.autopilot_enabled;

  const { error } = await admin
    .from('goals')
    .update({ autopilot_enabled: nextEnabled, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { status: 500, error: error.message };

  await admin.from('goal_log').insert({
    goal_id: id,
    event_type: nextEnabled ? 'autopilot_enabled' : 'autopilot_disabled',
    details: { actor: user.id },
  });

  return { status: 200, data: { id, autopilot_enabled: nextEnabled } };
}

// ── Delete Goal (permanent) ───────────────────────────────────────────────
async function handleDelete(admin, user, query) {
  const id = query?.id;
  if (!id) return { status: 400, error: 'id is required' };

  const { data: goal } = await admin
    .from('goals')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();
  if (!goal) return { status: 404, error: 'Goal not found' };

  // Remove related data in order (foreign-key safe)
  await admin.from('goal_log').delete().eq('goal_id', id);
  await admin.from('goal_messages').delete().eq('goal_id', id);
  await admin.from('goal_unit_members').delete().eq('goal_id', id);
  await admin.from('goal_projections').delete().eq('goal_id', id);
  try {
    await admin.from('team_tasks').delete().eq('data->>goal_id', id);
  } catch (err) {
    // Ignore team_tasks delete failures
  }

  // Delete the goal itself
  const { error } = await admin.from('goals').delete().eq('id', id).eq('user_id', user.id);
  if (error) return { status: 500, error: `Delete failed: ${error.message}` };

  return { status: 200, data: { id, deleted: true } };
}

export {
  handleApproval,
  handleContextReview,
  handleDuplicate,
  handleImplementExisting,
  handleListUnits,
  handleResolve,
  handleRetry,
};
