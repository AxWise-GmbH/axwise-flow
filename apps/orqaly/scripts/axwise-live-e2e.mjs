#!/usr/bin/env node
/**
 * Fail-closed Orqaly -> live AxWise workflow proof.
 *
 * This runner deliberately keeps the Orqaly side local while calling the
 * configured AxWise API. It drives the same authenticated goal and worker HTTP
 * routes as the browser, pauses at both mandatory human gates, validates the
 * data shown to the reviewer, approves it, and writes a deliberately bounded,
 * redacted artifact.
 *
 * The local API must already be running with the same AXWISE_* and LLM env:
 *
 *   node scripts/axwise-live-e2e.mjs --seed
 *
 * Required environment:
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY
 *   AXWISE_API_URL / AXWISE_API_KEY / WORKER_SECRET
 *   ORQALY_E2E_EXPECTED_USER_ID=<AxWise-mapped user UUID> (authoritative mode)
 *   ORQALY_E2E_ORG_ID=<AxWise-mapped organization UUID> (authoritative mode)
 *
 * Optional environment:
 *   ORQALY_API_URL=http://127.0.0.1:3001
 *   ORQALY_E2E_EMAIL=axwise-e2e@local.test
 *   ORQALY_E2E_PASSWORD=<ephemeral local password>
 *   ORQALY_E2E_REQUIRE_AXWISE_APPLIED=true
 *
 * Safety properties:
 *   - refuses a non-loopback Orqaly API or Supabase database;
 *   - refuses a remote AxWise host other than api.axwise.de and requires an
 *     explicit flag for loopback AxWise comparisons;
 *   - validates the tenant mapping before creating a goal;
 *   - never approves a degraded/stale/out-of-scope recommendation;
 *   - never prints or stores credentials;
 *   - never stores raw user/org/agent/decision identifiers in the artifact.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, open } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { config as loadDotenv } from 'dotenv';
import { PREDEFINED_AGENTS } from '../src/config/predefinedAgents.js';
import { PREDEFINED_TOOLS } from '../src/config/predefinedTools.js';

loadDotenv({ path: ['.env.local', '.env'], quiet: true });

export const HARNESS_VERSION = 'orqaly-axwise-live-e2e-v1';
const FIXTURE_MARKER = 'axwise-live-e2e-v1';
const DEFAULT_API_URL = 'http://127.0.0.1:3001';
const DEFAULT_STAGE_TIMEOUT_MS = 12 * 60 * 1000;
const DEFAULT_WORKER_INTERVAL_MS = 1_500;
const AXWISE_HOST = 'api.axwise.de';
const TERMINAL_FAILURES = new Set(['failed', 'cancelled']);
const HUMAN_BLOCKERS = new Set([
  'awaiting_po_input',
  'awaiting_tools',
  'awaiting_approval',
  'needs_human',
  'paused',
]);
export const MAX_EXECUTION_REAPPROVALS = 2;
const SELECTED_AGENT_ROLES = [
  'Product Owner',
  'Product Manager',
  'Ecommerce Operations Manager',
  'Customer Experience Manager',
  'Supply Chain Manager',
  'Marketing Strategist',
  'Risk Manager',
];
const E2E_INTERNAL_TOOL_IDS = ['tool-doc-generator'];

export const WORKFLOWS = [
  {
    key: 'simple',
    mode: 'simple',
    poDepth: 'quick',
    title: 'Reduce incorrect-fitment returns for a German auto-parts store',
    description:
      'Reduce incorrect-fitment returns by 20% within eight weeks for German DIY car owners buying replacement parts online. Use the existing product-catalog fitment fields, return-reason codes, and support-ticket themes as declared evidence. Produce a prioritized operating playbook and measurement plan. Do not deploy software, buy anything, publish, or contact customers.',
    category: 'ecommerce_operations',
    priority: 'medium',
    complexity: 'simple',
    budget: 12,
  },
  {
    key: 'advanced',
    mode: 'advanced',
    poDepth: 'standard',
    title: 'Build a retention plan for a German animal-food subscription shop',
    description:
      'Create a 90-day retention operating plan for a German direct-to-consumer animal-food subscription shop. The affected customers are time-poor dog and cat owners who need reliable replenishment and clear dietary guidance; the business decision owner is the Head of Ecommerce. Use declared cohort retention, cancellation reasons, support themes, margin constraints, and delivery reliability as evidence. Define stakeholder outcomes, experiments, owners, safeguards, and weekly leading indicators. Deliver analysis and an execution-ready plan only; do not send messages, publish, purchase, or deploy.',
    category: 'ecommerce_strategy',
    priority: 'high',
    complexity: 'complex',
    budget: 20,
  },
];

export class HarnessError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'HarnessError';
    this.code = code;
  }
}

function invariant(condition, code, message) {
  if (!condition) throw new HarnessError(code, message);
}

function parseBoolean(value, fallback = false) {
  if (value == null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

function numericOption(value, fallback, minimum, maximum) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  invariant(
    Number.isFinite(number) && number >= minimum && number <= maximum,
    'invalid_option',
    `Expected a number between ${minimum} and ${maximum}`
  );
  return number;
}

function isLoopbackHostname(hostname) {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(String(hostname).toLowerCase());
}

export function validateTopology({ apiUrl, supabaseUrl, axwiseUrl, allowLoopbackAxwise = false }) {
  let api;
  let database;
  let axwise;
  try {
    api = new URL(apiUrl);
    database = new URL(supabaseUrl);
    axwise = new URL(axwiseUrl);
  } catch {
    throw new HarnessError('invalid_url', 'API, Supabase, and AxWise URLs must be absolute URLs');
  }
  invariant(
    isLoopbackHostname(api.hostname),
    'unsafe_orqaly_target',
    'The E2E harness only drives a loopback Orqaly API'
  );
  invariant(
    isLoopbackHostname(database.hostname),
    'unsafe_supabase_target',
    'The E2E harness only seeds and inspects a loopback Supabase database'
  );
  const isProductionAxwise = axwise.protocol === 'https:' && axwise.hostname === AXWISE_HOST;
  const isExplicitLocalAxwise =
    allowLoopbackAxwise === true &&
    axwise.protocol === 'http:' &&
    isLoopbackHostname(axwise.hostname);
  invariant(
    isProductionAxwise || isExplicitLocalAxwise,
    'unsafe_axwise_target',
    `The live E2E harness only accepts https://${AXWISE_HOST}, or explicit loopback AxWise for local-code comparisons`
  );
  invariant(
    /\/api\/orqaly-axwise\/v1\/?$/.test(axwise.pathname),
    'invalid_axwise_base',
    'AXWISE_API_URL must end with /api/orqaly-axwise/v1'
  );
  return {
    apiUrl: api.toString().replace(/\/$/, ''),
    supabaseUrl: database.toString().replace(/\/$/, ''),
    axwiseUrl: axwise.toString().replace(/\/$/, ''),
    axwiseTarget: isProductionAxwise ? AXWISE_HOST : 'loopback-local-current-worktree',
  };
}

function fingerprint(value, prefix = 'ref') {
  if (value == null || value === '') return null;
  const digest = createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
  return `${prefix}:${digest}`;
}

function compactProfile(value) {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item != null && item !== '')
      .slice(0, 20)
      .map(([key, item]) => [
        key,
        Array.isArray(item)
          ? item.slice(0, 12)
          : typeof item === 'object'
            ? Object.fromEntries(Object.entries(item).slice(0, 12))
            : String(item).slice(0, 1_500),
      ])
  );
}

function approvalSummary(approval, actorPrefix) {
  return {
    status: approval?.status || null,
    version: approval?.version || null,
    snapshot_ref: fingerprint(approval?.snapshot_hash, 'snapshot'),
    approved_by_ref: fingerprint(approval?.approved_by, actorPrefix),
    approved_at: approval?.approved_at || null,
    invalidation_reason: approval?.invalidation_reason || null,
  };
}

function personaSummary(goal) {
  const intelligence = goal?.data?.axwise_customer_intelligence || {};
  const resolution = intelligence.persona_resolution || {};
  const customer = resolution.customer_persona || {};
  const executor = resolution.ideal_agent_persona || {};
  const evidence = Array.isArray(customer.evidence) ? customer.evidence : [];
  return {
    intelligence_status: intelligence.status || null,
    degraded: intelligence.degraded === true,
    routing_mode: intelligence.routing_mode || null,
    context_decision_ref: fingerprint(intelligence.decision_id, 'decision'),
    source_type: resolution.source_type || null,
    selection_status: resolution.selection_status || null,
    customer: {
      name: customer.name || null,
      confidence: Number(customer.confidence || 0),
      profile: compactProfile(customer.profile),
      trust: customer.trust
        ? {
            status: customer.trust.status || null,
            verified: customer.trust.verified === true,
            evidence_count: Number(customer.trust.evidence_count || 0),
            verified_evidence_count: Number(customer.trust.verified_evidence_count || 0),
            source_type: customer.trust.source_type || null,
            limitations: (customer.trust.limitations || []).slice(0, 10),
          }
        : null,
      evidence: evidence.slice(0, 8).map((item) => ({
        source_ref: fingerprint(item.document_id || item.reference_id, 'evidence'),
        speaker: item.speaker ? String(item.speaker).slice(0, 120) : null,
        quote: item.quote ? String(item.quote).slice(0, 800) : null,
        verified: item.verified === true,
        start_char: Number.isFinite(Number(item.start_char)) ? Number(item.start_char) : null,
        end_char: Number.isFinite(Number(item.end_char)) ? Number(item.end_char) : null,
      })),
    },
    executor: {
      role: executor.role || null,
      communication_style: executor.communication_style || null,
      required_capabilities: (executor.required_capabilities || []).slice(0, 30),
      operating_principles: (executor.operating_principles || []).slice(0, 20),
      boundaries: (executor.boundaries || []).slice(0, 20),
    },
    recommended_agent_ref: fingerprint(resolution.recommended_agent?.agent_id, 'agent'),
    ranked_agents: (resolution.ranked_agents || []).slice(0, 20).map((item) => ({
      agent_ref: fingerprint(item.agent_id, 'agent'),
      agent_name: item.agent_name || item.name || null,
      score: Number(item.score || 0),
      rationale: item.rationale ? String(item.rationale).slice(0, 800) : null,
    })),
  };
}

export function assertContextGate({ goal, workflow, userId, orgId, orgAgentIds }) {
  invariant(
    goal?.status === 'awaiting_context_approval',
    'context_gate_missing',
    'Goal did not stop at context approval'
  );
  invariant(
    String(goal.user_id) === String(userId),
    'user_scope_mismatch',
    'Goal owner differs from authenticated test user'
  );
  invariant(
    String(goal.org_id) === String(orgId),
    'org_scope_mismatch',
    'Goal organization differs from the selected test organization'
  );
  invariant(
    goal.executor_type === 'organization',
    'executor_scope_mismatch',
    'Goal is not organization-scoped'
  );
  invariant(goal.mode === workflow.mode, 'mode_mismatch', `Expected ${workflow.mode} mode`);
  invariant(
    goal.po_depth === workflow.poDepth,
    'depth_mismatch',
    `Expected ${workflow.poDepth} PO depth`
  );

  const intelligence = goal.data?.axwise_customer_intelligence;
  const resolution = intelligence?.persona_resolution;
  invariant(
    intelligence?.status === 'completed',
    'axwise_context_incomplete',
    'AxWise customer intelligence is not completed'
  );
  invariant(
    intelligence?.degraded !== true,
    'axwise_context_degraded',
    'AxWise customer intelligence degraded to a local fallback'
  );
  invariant(
    Boolean(intelligence?.decision_id),
    'axwise_context_decision_missing',
    'AxWise context decision id is missing'
  );
  invariant(
    Boolean(resolution?.customer_persona?.name),
    'customer_persona_missing',
    'Customer or stakeholder persona name is missing'
  );
  invariant(
    Object.keys(resolution?.customer_persona?.profile || {}).length >= 2,
    'customer_persona_thin',
    'Customer persona profile is too thin for approval'
  );
  invariant(
    Boolean(resolution?.customer_persona?.trust?.status),
    'customer_trust_missing',
    'Customer persona trust status is missing'
  );
  const trust = resolution.customer_persona.trust;
  const evidence = resolution.customer_persona.evidence || [];
  if (trust.verified === true) {
    invariant(
      evidence.some(
        (item) =>
          item?.verified === true &&
          Boolean(String(item?.quote || '').trim()) &&
          Number.isFinite(Number(item?.start_char)) &&
          Number.isFinite(Number(item?.end_char)) &&
          Number(item.end_char) > Number(item.start_char)
      ),
      'verified_evidence_audit_missing',
      'Verified customer context has no quote with auditable character offsets'
    );
  } else {
    invariant(
      (trust.limitations || []).length > 0,
      'unverified_context_unlabelled',
      'Unverified customer context is missing explicit limitations'
    );
  }
  invariant(
    Boolean(resolution?.ideal_agent_persona?.role),
    'executor_persona_missing',
    'Ideal executor role is missing'
  );
  invariant(
    (resolution?.ideal_agent_persona?.required_capabilities || []).length > 0,
    'executor_capabilities_missing',
    'Ideal executor capabilities are missing'
  );
  invariant(
    Boolean(resolution?.ideal_agent_persona?.communication_style),
    'executor_communication_missing',
    'Ideal executor communication style is missing'
  );
  invariant(
    (resolution?.ideal_agent_persona?.operating_principles || []).length > 0,
    'executor_principles_missing',
    'Ideal executor operating principles are missing'
  );
  invariant(
    resolution?.requires_orqaly_authorization === true,
    'authorization_boundary_missing',
    'AxWise did not preserve the Orqaly authorization boundary'
  );

  const allowed = new Set((orgAgentIds || []).map(String));
  const recommended = resolution?.recommended_agent?.agent_id;
  if (recommended) {
    invariant(
      allowed.has(String(recommended)),
      'recommended_agent_out_of_scope',
      'AxWise recommended an agent outside the organization'
    );
  }
  for (const ranked of resolution?.ranked_agents || []) {
    invariant(
      allowed.has(String(ranked.agent_id)),
      'ranked_agent_out_of_scope',
      'AxWise ranked an agent outside the organization'
    );
  }
  const pending = goal.data?.goal_approvals?.context;
  invariant(
    pending?.status === 'pending' && Boolean(pending?.snapshot_hash),
    'context_snapshot_missing',
    'Context approval is not tied to a pending snapshot'
  );
  return true;
}

export function assertExecutionGate({
  goal,
  team,
  teamMemberIds,
  tasks,
  orgAgentIds,
  requireApplied = true,
}) {
  invariant(
    goal?.status === 'awaiting_approval',
    'execution_gate_missing',
    'Goal did not stop at final execution approval'
  );
  invariant(
    goal.data?.goal_approvals?.context?.status === 'approved',
    'context_not_approved',
    'Context approval is not approved'
  );
  invariant(
    goal.data?.goal_approvals?.execution?.status === 'pending',
    'execution_snapshot_missing',
    'Execution approval is not pending'
  );
  invariant(
    Boolean(goal.data?.goal_approvals?.execution?.snapshot_hash),
    'execution_snapshot_hash_missing',
    'Execution snapshot hash is missing'
  );
  invariant(
    Array.isArray(goal.plan?.phases) && goal.plan.phases.length > 0,
    'plan_missing',
    'Execution plan has no phases'
  );
  invariant(Boolean(goal.proposal), 'proposal_missing', 'Execution proposal is missing');
  invariant(Boolean(goal.agent_team_id), 'team_missing', 'Goal-scoped execution team is missing');
  invariant(
    String(team?.id) === String(goal.agent_team_id),
    'team_link_mismatch',
    'Goal team link does not resolve'
  );
  invariant(
    String(team?.goal_id) === String(goal.id),
    'team_goal_mismatch',
    'Execution team is not scoped to this goal'
  );
  invariant(team?.is_active === true, 'team_inactive', 'Execution team is not active');
  invariant((teamMemberIds || []).length > 0, 'team_empty', 'Execution team has no members');

  const allowed = new Set((orgAgentIds || []).map(String));
  for (const memberId of teamMemberIds || []) {
    invariant(
      allowed.has(String(memberId)),
      'team_member_out_of_scope',
      'Execution team contains an agent outside the organization'
    );
  }
  invariant((tasks || []).length > 0, 'tasks_missing', 'Team formation produced no tasks');
  const orchestration = goal.data?.axwise_orchestration;
  invariant(
    Boolean(orchestration?.decision_id),
    'axwise_assignment_missing',
    'AxWise final assignment decision is missing'
  );
  invariant(
    orchestration?.degraded !== true,
    'axwise_assignment_degraded',
    'AxWise final assignment degraded to local-only routing'
  );
  invariant(
    orchestration?.feasible === true,
    'axwise_assignment_infeasible',
    'AxWise did not return a feasible plan'
  );
  if (requireApplied) {
    invariant(
      orchestration?.applied === true,
      'axwise_assignment_not_applied',
      'AxWise ran in shadow mode or its recommendation was not authorized'
    );
  }
  for (const task of tasks || []) {
    invariant(
      String(task.goal_id || task.data?.goal_id) === String(goal.id),
      'task_goal_mismatch',
      'Task belongs to another goal'
    );
    invariant(
      allowed.has(String(task.agent_id)),
      'task_agent_out_of_scope',
      'Task is assigned outside the organization'
    );
    const context = task.data?.axwise_execution_context;
    invariant(
      Boolean(context?.customer_persona),
      'task_customer_context_missing',
      'Task is missing AxWise customer context'
    );
    invariant(
      Boolean(context?.execution_persona),
      'task_executor_context_missing',
      'Task is missing its goal execution persona'
    );
    invariant(
      String(context?.decision_id) === String(orchestration.decision_id),
      'task_decision_mismatch',
      'Task references a different AxWise decision'
    );
    invariant(
      context?.authorization_status === 'pending_execution_approval',
      'task_preapproval_state_invalid',
      'Pre-approval task context is not explicitly non-executable'
    );
    invariant(
      context?.authoritative === false && context?.executable === false,
      'task_executable_before_approval',
      'Task was marked executable before approval'
    );
  }
  return true;
}

/**
 * Re-planning may materially replace the proposal, team, task overlays, or
 * AxWise assignment after execution has already started. Treat that as a new
 * human boundary: validate the complete execution gate again and prove the
 * pending snapshot supersedes the snapshot the user previously approved.
 *
 * The returned checkpoint contains only pseudonymous snapshot references and
 * is safe to include in the bounded E2E artifact.
 */
export function assertExecutionReapproval({
  previousApprovalHash,
  reapprovalNumber,
  maxReapprovals = MAX_EXECUTION_REAPPROVALS,
  ...executionGate
}) {
  invariant(
    Number.isInteger(reapprovalNumber) && reapprovalNumber > 0,
    'execution_reapproval_number_invalid',
    'Execution reapproval number must be a positive integer'
  );
  invariant(
    reapprovalNumber <= maxReapprovals,
    'execution_reapproval_limit_exceeded',
    `Execution requested more than ${maxReapprovals} human reapprovals`
  );
  assertExecutionGate(executionGate);

  const pending = executionGate.goal?.data?.goal_approvals?.execution;
  invariant(
    Boolean(previousApprovalHash),
    'prior_execution_approval_missing',
    'The harness has no prior approved execution snapshot to compare'
  );
  invariant(
    pending?.snapshot_hash !== previousApprovalHash,
    'execution_reapproval_snapshot_unchanged',
    'Execution returned to approval without a materially changed snapshot'
  );
  invariant(
    Boolean(pending?.invalidated_at),
    'execution_reapproval_stale_marker_missing',
    'The replacement proposal does not mark the prior execution approval stale'
  );

  return {
    checkpoint: 'execution_reapproval',
    sequence: reapprovalNumber,
    iteration: Number(executionGate.goal?.iteration || 0),
    previous_snapshot_ref: fingerprint(previousApprovalHash, 'snapshot'),
    pending_snapshot_ref: fingerprint(pending.snapshot_hash, 'snapshot'),
    team_ref: fingerprint(executionGate.team?.id, 'team'),
    task_count: (executionGate.tasks || []).length,
    verified_at: new Date().toISOString(),
  };
}

export function assertCompletedWorkflow({ goal, tasks, axwiseCalls, logs = [] }) {
  invariant(goal?.status === 'completed', 'goal_not_completed', 'Goal did not complete');
  invariant(
    goal.data?.goal_approvals?.context?.status === 'approved',
    'final_context_approval_missing',
    'Final context approval is missing'
  );
  invariant(
    goal.data?.goal_approvals?.execution?.status === 'approved',
    'final_execution_approval_missing',
    'Final execution approval is missing'
  );
  invariant((tasks || []).length > 0, 'final_tasks_missing', 'Completed goal has no tasks');
  invariant(
    (tasks || []).every((task) => task.status === 'done'),
    'task_execution_failed',
    'At least one task did not finish successfully'
  );
  invariant(
    Boolean(goal.data?.axwise_outcome?.outcome_id),
    'axwise_outcome_missing',
    'AxWise outcome receipt is missing'
  );
  invariant(
    goal.data?.axwise_outcome_delivery?.status === 'reported',
    'axwise_outcome_delivery_incomplete',
    'AxWise outcome delivery is not durably reported'
  );
  invariant(
    String(goal.data?.axwise_outcome?.decision_id) ===
      String(goal.data?.axwise_orchestration?.decision_id),
    'axwise_outcome_decision_mismatch',
    'Outcome references a different AxWise decision'
  );
  const relevantCalls = (axwiseCalls || []).filter((call) =>
    ['goal.orchestrate', 'goal.outcome'].includes(call.integration_point)
  );
  invariant(
    relevantCalls.some(
      (call) =>
        call.integration_point === 'goal.orchestrate' &&
        call.status === 'ok' &&
        call.degraded !== true
    ),
    'axwise_call_proof_missing',
    'No successful non-degraded AxWise orchestration call was recorded'
  );
  invariant(
    relevantCalls.some(
      (call) =>
        call.integration_point === 'goal.outcome' && call.status === 'ok' && call.degraded !== true
    ),
    'axwise_outcome_call_missing',
    'No successful non-degraded AxWise outcome call was recorded'
  );
  invariant(
    !(axwiseCalls || []).some((call) => call.status === 'error' || call.degraded === true),
    'axwise_call_degraded',
    'AxWise telemetry contains an error or degraded call'
  );
  const auditEvents = new Set((logs || []).map((entry) => entry.event_type));
  for (const requiredEvent of ['context_approved', 'goal_active', 'goal_completed']) {
    invariant(
      auditEvents.has(requiredEvent),
      'approval_audit_missing',
      `Goal audit trail is missing ${requiredEvent}`
    );
  }
  return true;
}

function executionSummary(goal, team, memberships, tasks, agentsById, axwiseCalls) {
  const orchestration = goal.data?.axwise_orchestration || {};
  return {
    assignment_decision_ref: fingerprint(orchestration.decision_id, 'decision'),
    enforcement: orchestration.enforcement || null,
    recommended: orchestration.status || null,
    feasible: orchestration.feasible === true,
    applied: orchestration.applied === true,
    confidence: Number(orchestration.confidence || 0),
    rejection_count: (orchestration.rejections || []).length,
    team: {
      team_ref: fingerprint(team?.id, 'team'),
      goal_ref: fingerprint(team?.goal_id, 'goal'),
      name: team?.name || null,
      active: team?.is_active === true,
      members: (memberships || []).map((membership) => ({
        agent_ref: fingerprint(membership.member_id, 'agent'),
        name: agentsById.get(String(membership.member_id))?.name || null,
        role: membership.role || null,
      })),
    },
    tasks: (tasks || []).map((task) => {
      const context = task.data?.axwise_execution_context || {};
      return {
        task_ref: fingerprint(task.id, 'task'),
        title: task.title,
        status: task.status,
        agent_ref: fingerprint(task.agent_id, 'agent'),
        assigned_to: task.assigned_to || null,
        step_id: context.step_id || null,
        decision_ref: fingerprint(context.decision_id, 'decision'),
        stored_authorization_status: context.authorization_status || null,
        effective_authorization_status:
          goal.data?.goal_approvals?.execution?.status === 'approved' ? 'approved' : 'pending',
        effective_authoritative: goal.data?.goal_approvals?.execution?.status === 'approved',
        customer_persona_name: context.customer_persona?.name || null,
        execution_persona_role: context.execution_persona?.role || null,
        assignment_applied: context.assignment?.applied === true,
        quality_score: task.data?.quality_score ?? null,
      };
    }),
    calls: (axwiseCalls || []).map((call) => ({
      integration_point: call.integration_point,
      status: call.status,
      degraded: call.degraded === true,
      applied_outcome: call.applied_outcome || null,
      duration_ms: Number(call.duration_ms || 0),
      decision_ref: fingerprint(call.processed_outputs?.decision_id, 'decision'),
    })),
    outcome: goal.data?.axwise_outcome
      ? {
          outcome_ref: fingerprint(goal.data.axwise_outcome.outcome_id, 'outcome'),
          decision_ref: fingerprint(goal.data.axwise_outcome.decision_id, 'decision'),
          evaluation_version: goal.data.axwise_outcome.evaluation_version || null,
          normalized_success: goal.data.axwise_outcome.normalized_success ?? null,
          safety_flags: goal.data.axwise_outcome.safety_flags || [],
          reported_at: goal.data.axwise_outcome.reported_at || null,
        }
      : null,
  };
}

export function buildWorkflowArtifact({
  workflow,
  goal,
  team,
  memberships,
  tasks,
  agents,
  axwiseCalls,
  logs,
  statusTimeline,
  durations,
  clarifications = [],
  humanCheckpoints = [],
}) {
  const agentsById = new Map((agents || []).map((agent) => [String(agent.id), agent]));
  const approvals = goal.data?.goal_approvals || {};
  return {
    workflow: workflow.key,
    requested_mode: workflow.mode,
    observed_mode: goal.mode,
    po_depth: goal.po_depth,
    goal_ref: fingerprint(goal.id, 'goal'),
    user_ref: fingerprint(goal.user_id, 'user'),
    org_ref: fingerprint(goal.org_id, 'org'),
    title: goal.title,
    final_status: goal.status,
    durations_ms: durations,
    status_timeline: statusTimeline,
    human_clarifications: clarifications,
    human_checkpoints: humanCheckpoints,
    persona: personaSummary(goal),
    approvals: {
      context: approvalSummary(approvals.context, 'user'),
      execution: approvalSummary(approvals.execution, 'user'),
    },
    execution: executionSummary(goal, team, memberships, tasks, agentsById, axwiseCalls),
    audit_events: (logs || []).map((entry) => ({
      event_type: entry.event_type,
      created_at: entry.created_at,
      decision_ref: fingerprint(
        entry.details?.decision_id || entry.details?.axwise_decision_id,
        'decision'
      ),
      snapshot_ref: fingerprint(entry.details?.snapshot_hash, 'snapshot'),
    })),
  };
}

function secretValues(env) {
  const explicit = [
    env.AXWISE_API_KEY,
    env.SUPABASE_SERVICE_ROLE_KEY,
    env.SUPABASE_ANON_KEY,
    env.VITE_SUPABASE_ANON_KEY,
    env.WORKER_SECRET,
    env.ORQALY_E2E_PASSWORD,
    env.GROQ_API_KEY,
    env.GEMINI_API_KEY,
    env.OPENAI_API_KEY,
    env.ANTHROPIC_API_KEY,
  ];
  return explicit.filter((value) => typeof value === 'string' && value.length >= 6);
}

function redactText(value, secrets = []) {
  let text = String(value || '');
  for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(
      /(api[_-]?key|password|secret|access[_-]?token|refresh[_-]?token)\s*[:=]\s*[^\s,}]+/gi,
      '$1=[REDACTED]'
    );
}

export function sanitizeArtifact(value, secrets = []) {
  if (Array.isArray(value)) return value.map((item) => sanitizeArtifact(item, secrets));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (/^(password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|cookie)$/i.test(key)) {
        out[key] = '[REDACTED]';
      } else {
        out[key] = sanitizeArtifact(item, secrets);
      }
    }
    return out;
  }
  return typeof value === 'string' ? redactText(value, secrets) : value;
}

export async function writeRedactedArtifact(path, artifact, secrets = []) {
  const safe = sanitizeArtifact(artifact, secrets);
  const json = `${JSON.stringify(safe, null, 2)}\n`;
  for (const secret of secrets) {
    invariant(
      !json.includes(secret),
      'artifact_secret_leak',
      'Artifact contained a configured secret'
    );
  }
  await mkdir(dirname(path), { recursive: true });
  const file = await open(path, 'wx', 0o600);
  try {
    await file.writeFile(json, 'utf8');
  } finally {
    await file.close();
  }
  return path;
}

function requiredEnv(env, key, fallbackKey = null) {
  const value = env[key] || (fallbackKey ? env[fallbackKey] : '');
  invariant(
    Boolean(String(value || '').trim()),
    'missing_environment',
    `Missing required environment variable ${key}${fallbackKey ? ` (or ${fallbackKey})` : ''}`
  );
  return String(value).trim();
}

export function loadConfiguration(values, env = process.env) {
  const supabaseUrl = requiredEnv(env, 'SUPABASE_URL', 'VITE_SUPABASE_URL');
  const serviceRoleKey = requiredEnv(env, 'SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = requiredEnv(env, 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY');
  const axwiseUrl = requiredEnv(env, 'AXWISE_API_URL');
  const axwiseKey = requiredEnv(env, 'AXWISE_API_KEY');
  const workerSecret = requiredEnv(env, 'WORKER_SECRET');
  const topology = validateTopology({
    apiUrl: values['api-url'] || env.ORQALY_API_URL || DEFAULT_API_URL,
    supabaseUrl,
    axwiseUrl,
    allowLoopbackAxwise: values['allow-loopback-axwise'] === true,
  });
  if (values.seed !== true) requiredEnv(env, 'ORQALY_E2E_PASSWORD');
  const requireApplied =
    values['allow-shadow'] === true
      ? false
      : parseBoolean(env.ORQALY_E2E_REQUIRE_AXWISE_APPLIED, true);
  const expectedUserId = requireApplied
    ? requiredEnv(env, 'ORQALY_E2E_EXPECTED_USER_ID')
    : String(env.ORQALY_E2E_EXPECTED_USER_ID || '').trim() || null;
  const requestedOrgId = requireApplied
    ? requiredEnv(env, 'ORQALY_E2E_ORG_ID')
    : String(env.ORQALY_E2E_ORG_ID || '').trim() || null;
  return {
    ...topology,
    serviceRoleKey,
    anonKey,
    axwiseKey,
    workerSecret,
    email: env.ORQALY_E2E_EMAIL || 'axwise-e2e@local.test',
    password: env.ORQALY_E2E_PASSWORD || randomBytes(24).toString('base64url'),
    expectedUserId,
    requestedOrgId,
    requireApplied,
    seed: values.seed === true,
    stageTimeoutMs: numericOption(
      values['stage-timeout-ms'] || env.ORQALY_E2E_STAGE_TIMEOUT_MS,
      DEFAULT_STAGE_TIMEOUT_MS,
      30_000,
      60 * 60 * 1000
    ),
    workerIntervalMs: numericOption(
      values['worker-interval-ms'] || env.ORQALY_E2E_WORKER_INTERVAL_MS,
      DEFAULT_WORKER_INTERVAL_MS,
      250,
      30_000
    ),
    artifactPath:
      values.artifact ||
      resolve(
        process.cwd(),
        'test-results',
        `axwise-live-e2e-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      ),
  };
}

async function findAuthUser(admin, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error)
      throw new HarnessError('auth_user_lookup_failed', 'Unable to inspect local test users');
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 100) break;
  }
  return null;
}

async function ensureTestUser(admin, auth, config) {
  // Prefer the exact browser-facing password flow. A normal validation run
  // should not require Supabase Admin Auth merely to rediscover a fixture that
  // already exists, and current local Supabase releases can rotate asymmetric
  // signing keys independently from legacy service-role JWTs.
  const existingLogin = await auth.auth.signInWithPassword({
    email: config.email,
    password: config.password,
  });
  if (!existingLogin.error && existingLogin.data?.session?.access_token) {
    const user = existingLogin.data.user;
    if (config.expectedUserId) {
      invariant(
        String(user.id) === String(config.expectedUserId),
        'axwise_user_mapping_mismatch',
        'Local E2E user id does not match ORQALY_E2E_EXPECTED_USER_ID'
      );
    }
    return { user, accessToken: existingLogin.data.session.access_token };
  }

  invariant(
    config.seed,
    'test_login_failed',
    'Unable to obtain a local Supabase session for the E2E user'
  );

  // Current Supabase CLI releases can accept the new sb_secret key for
  // PostgREST while rejecting Auth Admin calls locally. A brand-new local-only
  // fixture does not need admin privileges: exercise the same public signup
  // path as the application first, then use Auth Admin only to recover an
  // existing fixture whose password must be rotated.
  const signup = await auth.auth.signUp({
    email: config.email,
    password: config.password,
    options: {
      data: {
        display_name: 'AxWise E2E',
        admin_invite: true,
        e2e_harness: FIXTURE_MARKER,
      },
    },
  });
  if (!signup.error && signup.data?.user && signup.data?.session?.access_token) {
    if (config.expectedUserId) {
      invariant(
        String(signup.data.user.id) === String(config.expectedUserId),
        'axwise_user_mapping_mismatch',
        'Local E2E user id does not match ORQALY_E2E_EXPECTED_USER_ID'
      );
    }
    return {
      user: signup.data.user,
      accessToken: signup.data.session.access_token,
    };
  }

  let user = await findAuthUser(admin, config.email);
  if (!user) {
    invariant(config.seed, 'test_user_missing', 'Local E2E user does not exist; rerun with --seed');
    const { data, error } = await admin.auth.admin.createUser({
      email: config.email,
      password: config.password,
      email_confirm: true,
      user_metadata: {
        display_name: 'AxWise E2E',
        admin_invite: true,
        e2e_harness: FIXTURE_MARKER,
      },
    });
    if (error || !data.user)
      throw new HarnessError('test_user_create_failed', 'Unable to create the local E2E user');
    user = data.user;
  } else if (config.seed) {
    const { data, error } = await admin.auth.admin.updateUserById(user.id, {
      password: config.password,
      email_confirm: true,
      user_metadata: {
        ...(user.user_metadata || {}),
        display_name: user.user_metadata?.display_name || 'AxWise E2E',
        admin_invite: true,
        e2e_harness: FIXTURE_MARKER,
      },
    });
    if (error || !data.user)
      throw new HarnessError('test_user_update_failed', 'Unable to prepare the local E2E user');
    user = data.user;
  }
  if (config.expectedUserId) {
    invariant(
      String(user.id) === String(config.expectedUserId),
      'axwise_user_mapping_mismatch',
      'Local E2E user id does not match ORQALY_E2E_EXPECTED_USER_ID'
    );
  }
  const { data: session, error: loginError } = await auth.auth.signInWithPassword({
    email: config.email,
    password: config.password,
  });
  if (loginError || !session.session?.access_token) {
    throw new HarnessError(
      'test_login_failed',
      'Unable to obtain a local Supabase session for the E2E user'
    );
  }
  invariant(
    String(session.user.id) === String(user.id),
    'session_user_mismatch',
    'Authenticated session belongs to another user'
  );
  return { user, accessToken: session.session.access_token };
}

async function ensureOrganization(admin, userId, config) {
  let query = admin
    .from('organizations')
    .select('id, user_id, name, slug, is_active')
    .eq('user_id', userId);
  query = config.requestedOrgId
    ? query.eq('id', config.requestedOrgId)
    : query.eq('slug', 'axwise-live-e2e');
  const { data: existing, error: findError } = await query.maybeSingle();
  if (findError)
    throw new HarnessError(
      'organization_lookup_failed',
      'Unable to inspect the local E2E organization'
    );
  if (existing) {
    invariant(
      existing.is_active === true,
      'organization_inactive',
      'Local E2E organization is inactive'
    );
    return existing;
  }
  invariant(
    config.seed,
    'organization_missing',
    'Local E2E organization does not exist; rerun with --seed'
  );
  const row = {
    ...(config.requestedOrgId ? { id: config.requestedOrgId } : {}),
    user_id: userId,
    name: 'AxWise Live E2E Organization',
    description: 'Local-only fixture paired with an explicitly mapped AxWise tenant.',
    slug: 'axwise-live-e2e',
    industry: 'Multi-domain operations',
    org_type: 'holding',
    is_active: true,
  };
  const { data, error } = await admin
    .from('organizations')
    .insert(row)
    .select('id, user_id, name, slug, is_active')
    .single();
  if (error || !data)
    throw new HarnessError(
      'organization_create_failed',
      'Unable to create the local E2E organization'
    );
  return data;
}

async function ensureInternalTools(admin, userId, config) {
  const definitions = PREDEFINED_TOOLS.filter((tool) => E2E_INTERNAL_TOOL_IDS.includes(tool.id));
  invariant(
    definitions.length === E2E_INTERNAL_TOOL_IDS.length &&
      definitions.every((tool) => tool.connectionType === 'internal'),
    'tool_fixture_definition_missing',
    'A required local-only E2E tool is not defined as internal'
  );
  for (const definition of definitions) {
    const { data: current, error: findError } = await admin
      .from('tools')
      .select('id, user_id, name, status, connection_type, data')
      .eq('id', definition.id)
      .maybeSingle();
    if (findError) {
      throw new HarnessError('tool_fixture_lookup_failed', 'Unable to inspect local E2E tools');
    }
    if (current) {
      invariant(
        String(current.user_id) === String(userId),
        'tool_fixture_owner_conflict',
        `${definition.id} belongs to another local user; use an isolated local Supabase database`
      );
      invariant(
        current.connection_type === 'internal',
        'tool_fixture_not_internal',
        `${definition.id} is not an internal tool`
      );
      if (config.seed && current.status !== 'active') {
        const { error } = await admin
          .from('tools')
          .update({ status: 'active', updated_at: new Date().toISOString() })
          .eq('id', definition.id)
          .eq('user_id', userId);
        if (error) {
          throw new HarnessError(
            'tool_fixture_update_failed',
            `Unable to activate ${definition.id}`
          );
        }
      } else {
        invariant(
          current.status === 'active',
          'tool_fixture_inactive',
          `${definition.id} is inactive`
        );
      }
      continue;
    }
    invariant(
      config.seed,
      'tool_fixture_missing',
      `${definition.id} is missing; rerun with --seed`
    );
    const { error } = await admin.from('tools').insert({
      id: definition.id,
      user_id: userId,
      name: definition.name,
      description: definition.description || '',
      status: 'active',
      connection_type: 'internal',
      data: {
        e2e_harness: FIXTURE_MARKER,
        category: definition.category || 'platform',
        connectionType: 'internal',
        endpoints: definition.endpoints || [],
      },
    });
    if (error) {
      throw new HarnessError('tool_fixture_create_failed', `Unable to seed ${definition.id}`);
    }
  }
}

async function ensureAgents(admin, userId, orgId, config) {
  const { data: current, error: listError } = await admin
    .from('agents')
    .select(
      'id, user_id, name, description, category, capabilities, status, cost_per_task, metadata'
    )
    .eq('user_id', userId);
  if (listError)
    throw new HarnessError('agent_lookup_failed', 'Unable to inspect the local Agent Hub');
  const selected = PREDEFINED_AGENTS.filter((agent) => SELECTED_AGENT_ROLES.includes(agent.role));
  invariant(
    selected.length === SELECTED_AGENT_ROLES.length,
    'agent_fixture_definition_missing',
    'A required E2E Agent Hub persona is not defined'
  );
  const byRole = new Map((current || []).map((agent) => [agent.name, agent]));
  const agents = [];
  for (const definition of selected) {
    let agent = byRole.get(definition.role);
    if (!agent) {
      invariant(
        config.seed,
        'agent_fixture_missing',
        `Agent Hub is missing ${definition.role}; rerun with --seed`
      );
      const { data, error } = await admin
        .from('agents')
        .insert({
          user_id: userId,
          name: definition.role,
          description: definition.description,
          category: definition.category || 'Operations',
          status: 'active',
          pricing_model: 'per_task',
          cost_per_task: Number(definition.cost_per_task || 0),
          capabilities: definition.capabilities || [],
          metadata: {
            e2e_harness: FIXTURE_MARKER,
            friendly_name: definition.name,
            availability_status: 'available',
            system_prompt: definition.system_prompt,
            tools: E2E_INTERNAL_TOOL_IDS,
          },
        })
        .select(
          'id, user_id, name, description, category, capabilities, status, cost_per_task, metadata'
        )
        .single();
      if (error || !data)
        throw new HarnessError('agent_fixture_create_failed', `Unable to seed ${definition.role}`);
      agent = data;
    } else if (config.seed) {
      const { data, error } = await admin
        .from('agents')
        .update({
          description: definition.description,
          category: definition.category || agent.category,
          status: 'active',
          capabilities: definition.capabilities || [],
          metadata: {
            ...(agent.metadata || {}),
            e2e_harness: FIXTURE_MARKER,
            friendly_name: agent.metadata?.friendly_name || definition.name,
            availability_status: 'available',
            system_prompt: definition.system_prompt,
            tools: E2E_INTERNAL_TOOL_IDS,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', agent.id)
        .eq('user_id', userId)
        .select(
          'id, user_id, name, description, category, capabilities, status, cost_per_task, metadata'
        )
        .single();
      if (error || !data)
        throw new HarnessError(
          'agent_fixture_update_failed',
          `Unable to prepare ${definition.role}`
        );
      agent = data;
    }
    invariant(
      agent.status === 'active',
      'agent_fixture_inactive',
      `${definition.role} is inactive`
    );
    agents.push(agent);
  }

  const rows = agents.map((agent) => ({
    user_id: userId,
    org_id: orgId,
    agent_id: String(agent.id),
  }));
  if (config.seed) {
    const { error } = await admin
      .from('org_agents')
      .upsert(rows, { onConflict: 'org_id,agent_id' });
    if (error)
      throw new HarnessError(
        'org_agent_seed_failed',
        'Unable to assign E2E agents to the organization'
      );
  }
  const { data: memberships, error: membershipError } = await admin
    .from('org_agents')
    .select('agent_id, user_id, org_id')
    .eq('user_id', userId)
    .eq('org_id', orgId);
  if (membershipError)
    throw new HarnessError(
      'org_agent_lookup_failed',
      'Unable to verify Agent Hub organization scope'
    );
  const allowed = new Set((memberships || []).map((row) => String(row.agent_id)));
  for (const agent of agents) {
    invariant(
      allowed.has(String(agent.id)),
      'org_agent_membership_missing',
      `${agent.name} is not assigned to the test organization`
    );
  }
  return { agents, orgAgentIds: [...allowed] };
}

async function loadCurrentOrganizationAgentIds(admin, userId, orgId) {
  const { data, error } = await admin
    .from('org_agents')
    .select('agent_id')
    .eq('user_id', userId)
    .eq('org_id', orgId);
  if (error) {
    throw new HarnessError(
      'org_agent_lookup_failed',
      'Unable to refresh Agent Hub organization scope'
    );
  }
  return [...new Set((data || []).map((row) => String(row.agent_id)).filter(Boolean))];
}

async function preflightLocalApi(config) {
  let response;
  try {
    response = await fetch(`${config.apiUrl}/`, { signal: AbortSignal.timeout(5_000) });
  } catch {
    throw new HarnessError(
      'local_api_unreachable',
      'Local Orqaly API is not reachable; start scripts/local-api-server.js first'
    );
  }
  invariant(
    response.ok,
    'local_api_unhealthy',
    `Local Orqaly API returned HTTP ${response.status}`
  );
  const body = await response.json().catch(() => null);
  invariant(
    body?.ok === true,
    'local_api_invalid_health',
    'Local Orqaly API health response is invalid'
  );
}

async function preflightAxwise(config, userId, orgId) {
  const healthUrl = new URL('/health', config.axwiseUrl).toString();
  let healthResponse;
  try {
    healthResponse = await fetch(healthUrl, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new HarnessError('axwise_unreachable', 'Live AxWise health endpoint is not reachable');
  }
  invariant(
    healthResponse.ok,
    'axwise_unhealthy',
    `Live AxWise health returned HTTP ${healthResponse.status}`
  );
  const health = await healthResponse.json().catch(() => ({}));

  const missingDecisionId = randomUUID();
  const tenantResponse = await fetch(
    `${config.axwiseUrl}/orchestration/decisions/${missingDecisionId}`,
    {
      headers: {
        Accept: 'application/json',
        'x-axwise-key': config.axwiseKey,
        'X-Orqaly-Org-ID': String(orgId),
        'X-Orqaly-User-ID': String(userId),
      },
      signal: AbortSignal.timeout(15_000),
    }
  ).catch(() => null);
  invariant(
    Boolean(tenantResponse),
    'axwise_tenant_preflight_unreachable',
    'Unable to validate the AxWise tenant mapping'
  );
  invariant(
    tenantResponse.status === 404,
    'axwise_tenant_mapping_rejected',
    `AxWise tenant preflight returned HTTP ${tenantResponse.status}; expected a mapped tenant and a not-found decision`
  );
  return {
    service: health.service || null,
    version: health.version || null,
    revision: health.revision || null,
    status: health.status || 'healthy',
  };
}

async function localApiRequest(config, accessToken, pathname, options = {}) {
  const response = await fetch(`${config.apiUrl}${pathname}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${accessToken}`,
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(options.timeoutMs || 120_000),
  }).catch((error) => {
    throw new HarnessError(
      'local_api_request_failed',
      `Local Orqaly API request failed: ${error.name}`
    );
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = data?.error ? String(data.error).slice(0, 240) : `HTTP ${response.status}`;
    throw new HarnessError(
      'local_api_rejected',
      `Local Orqaly API rejected the request: ${reason}`
    );
  }
  return data;
}

export function clarificationContinuationPayload(goalId) {
  return {
    type: 'orchestrate-goal',
    action: 'po-analysis-continue',
    goalId,
    mode: 'queued',
  };
}

async function workerTick(config) {
  let response;
  try {
    response = await fetch(`${config.apiUrl}/api/agent?path=process-next`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.workerSecret}` },
      signal: AbortSignal.timeout(90_000),
    });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return { timedOut: true };
    throw new HarnessError(
      'worker_unreachable',
      `Local worker request failed: ${error?.name || 'network error'}`
    );
  }
  invariant(response.ok, 'worker_rejected', `Local worker returned HTTP ${response.status}`);
  return response.json().catch(() => ({}));
}

async function loadGoal(admin, goalId) {
  const { data, error } = await admin.from('goals').select('*').eq('id', goalId).single();
  if (error || !data) throw new HarnessError('goal_lookup_failed', 'Unable to load the E2E goal');
  return data;
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function waitForGoalStatus({
  admin,
  goalId,
  targets,
  config,
  timeline,
  stage,
  onHumanBlocker = null,
}) {
  const startedAt = Date.now();
  let lastStatus = null;
  while (Date.now() - startedAt < config.stageTimeoutMs) {
    const goal = await loadGoal(admin, goalId);
    if (goal.status !== lastStatus) {
      timeline.push({
        status: goal.status,
        observed_at: new Date().toISOString(),
        elapsed_ms: Date.now() - startedAt,
      });
      lastStatus = goal.status;
      console.log(`[testing] ${stage}: ${goal.status}`);
    }
    if (targets.has(goal.status)) return goal;
    if (TERMINAL_FAILURES.has(goal.status)) {
      throw new HarnessError(
        'goal_failed',
        `Goal entered ${goal.status} during ${stage}: ${String(goal.data?.failure_reason || 'no reason recorded').slice(0, 300)}`
      );
    }
    if (HUMAN_BLOCKERS.has(goal.status)) {
      if (onHumanBlocker) {
        await onHumanBlocker(goal);
        await wait(config.workerIntervalMs);
        continue;
      }
      throw new HarnessError(
        'unexpected_human_blocker',
        `Goal entered ${goal.status} during ${stage}; explicit input is required before the scripted proof can continue`
      );
    }
    await workerTick(config);
    await wait(config.workerIntervalMs);
  }
  throw new HarnessError(
    'stage_timeout',
    `${stage} did not reach ${[...targets].join(' or ')} within ${config.stageTimeoutMs}ms`
  );
}

export function buildClarificationAnswers(goal, workflow) {
  const questions = Array.isArray(goal?.data?.po_questions) ? goal.data.po_questions : [];
  invariant(
    questions.length > 0,
    'clarification_questions_missing',
    'The goal requested clarification without recording any questions'
  );
  const facts =
    workflow.key === 'advanced'
      ? [
          'Time-poor German dog and cat owners using the subscription service experience the problem. The Head of Ecommerce decides; customers, customer operations, and fulfillment teams benefit.',
          'Success means a measurable improvement in 90-day retention and fewer preventable cancellations, while preserving contribution margin and delivery reliability.',
          'Use the declared internal cohort-retention data, cancellation reasons, support themes, margin constraints, and delivery-reliability records. Treat them as declared until independently verified.',
        ]
      : [
          'German DIY car owners buying replacement parts online experience incorrect fitment. Ecommerce Operations decides; customers, support, catalog operations, and returns teams benefit.',
          'Success means reducing incorrect-fitment returns by 20% within eight weeks without worsening conversion, fulfillment speed, or customer support load.',
          'Use the declared catalog fitment fields, return-reason codes, and support-ticket themes. No raw records are attached or connected in this test: treat the sources as internal declarations, do not fabricate findings or claim to compute over them, and produce a methodology, playbook, and measurement framework only.',
        ];
  return questions.map((question, index) => ({
    question,
    answer: facts[Math.min(index, facts.length - 1)],
  }));
}

async function answerGoalClarification({ admin, config, accessToken, goal, workflow }) {
  const answers = buildClarificationAnswers(goal, workflow);
  const endpoint = new URL('/rest/v1/goals', config.supabaseUrl);
  endpoint.searchParams.set('id', `eq.${goal.id}`);
  endpoint.searchParams.set('user_id', `eq.${goal.user_id}`);
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      data: { ...(goal.data || {}), po_answers: answers },
      status: 'analyzing',
    }),
    signal: AbortSignal.timeout(30_000),
  });
  invariant(
    response.ok,
    'clarification_update_rejected',
    `Authenticated clarification update returned HTTP ${response.status}`
  );
  const refreshed = await loadGoal(admin, goal.id);
  invariant(
    Array.isArray(refreshed.data?.po_answers) &&
      refreshed.data.po_answers.length === answers.length,
    'clarification_update_missing',
    'Clarification answers were not persisted on the authenticated goal'
  );
  await localApiRequest(config, accessToken, '/api/agent?path=enqueue', {
    method: 'POST',
    body: clarificationContinuationPayload(goal.id),
  });
  return answers;
}

async function loadExecutionEvidence(admin, goal) {
  const teamId = goal.agent_team_id;
  const [
    { data: team, error: teamError },
    { data: tasks, error: taskError },
    { data: calls, error: callError },
    { data: logs, error: logError },
  ] = await Promise.all([
    teamId
      ? admin
          .from('agent_teams')
          .select('id, user_id, goal_id, name, leader_id, is_active')
          .eq('id', teamId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin
      .from('team_tasks')
      .select(
        'id, user_id, goal_id, title, status, assigned_to, agent_id, data, created_at, updated_at'
      )
      .eq('goal_id', goal.id)
      .order('sequence_order', { ascending: true }),
    admin
      .from('axwise_calls')
      .select(
        'integration_point, status, degraded, applied_outcome, duration_ms, processed_outputs, created_at'
      )
      .eq('user_id', goal.user_id)
      .eq('org_id', goal.org_id)
      .eq('request_payload->>task_id', goal.id)
      .order('created_at', { ascending: true }),
    admin
      .from('goal_log')
      .select('event_type, details, created_at')
      .eq('goal_id', goal.id)
      .order('created_at', { ascending: true }),
  ]);
  if (teamError || taskError || callError || logError) {
    throw new HarnessError(
      'evidence_lookup_failed',
      'Unable to load team, task, AxWise call, or audit evidence'
    );
  }
  let memberships = [];
  if (teamId) {
    const { data, error } = await admin
      .from('agent_team_members')
      .select('team_id, member_id, role')
      .eq('team_id', teamId);
    if (error)
      throw new HarnessError(
        'team_membership_lookup_failed',
        'Unable to inspect execution team membership'
      );
    memberships = data || [];
  }
  return { team, memberships, tasks: tasks || [], axwiseCalls: calls || [], logs: logs || [] };
}

export function hasDurableOutcomeReceipt(goal, evidence) {
  const receipt = goal?.data?.axwise_outcome;
  const delivery = goal?.data?.axwise_outcome_delivery;
  const decisionId = goal?.data?.axwise_orchestration?.decision_id;
  const hasOutcomeCall = (evidence?.axwiseCalls || []).some(
    (call) =>
      call.integration_point === 'goal.outcome' && call.status === 'ok' && call.degraded !== true
  );
  return Boolean(
    goal?.status === 'completed' &&
    delivery?.status === 'reported' &&
    receipt?.outcome_id &&
    receipt?.reported_at &&
    decisionId &&
    String(receipt.decision_id) === String(decisionId) &&
    hasOutcomeCall
  );
}

async function waitForDurableOutcome({ admin, goalId, config }) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < config.stageTimeoutMs) {
    const goal = await loadGoal(admin, goalId);
    const evidence = await loadExecutionEvidence(admin, goal);
    if (hasDurableOutcomeReceipt(goal, evidence)) {
      return { goal, evidence, durationMs: Date.now() - startedAt };
    }
    if (goal.data?.axwise_outcome_delivery?.status === 'final_failure') {
      throw new HarnessError(
        'axwise_outcome_final_failure',
        'AxWise outcome delivery exhausted its durable retry budget'
      );
    }
    await workerTick(config);
    await wait(config.workerIntervalMs);
  }
  throw new HarnessError(
    'axwise_outcome_timeout',
    `AxWise outcome receipt was not durably reported within ${config.stageTimeoutMs}ms`
  );
}

async function createWorkflowGoal(config, accessToken, orgId, workflow, runId) {
  return localApiRequest(config, accessToken, '/api/app?path=goals&op=create', {
    method: 'POST',
    body: {
      title: workflow.title,
      description: workflow.description,
      budget_usd: workflow.budget,
      parsed_category: workflow.category,
      parsed_priority: workflow.priority,
      parsed_requirements:
        'Evidence-grounded written deliverables only. No external side effects or credentialed tools.',
      complexity: workflow.complexity,
      execution_mode: 'auto',
      source_request_id: `${HARNESS_VERSION}:${runId}:${workflow.key}`,
      mode: workflow.mode,
      po_depth: workflow.poDepth,
      executor_type: 'organization',
      org_id: orgId,
      loop_enabled: false,
      compare_models: [],
    },
  });
}

async function runWorkflow({
  admin,
  config,
  accessToken,
  userId,
  org,
  agents,
  orgAgentIds,
  workflow,
  runId,
}) {
  const timeline = [];
  const clarifications = [];
  const humanCheckpoints = [];
  const durations = {};
  const workflowStarted = Date.now();
  console.log(`[testing] ${workflow.key}: creating authenticated goal`);
  const created = await createWorkflowGoal(config, accessToken, org.id, workflow, runId);
  invariant(
    Boolean(created?.id),
    'goal_create_invalid',
    'Goal create response did not include an id'
  );
  invariant(
    String(created.org_id) === String(org.id),
    'goal_create_org_mismatch',
    'Created goal is not linked to the selected organization'
  );

  const contextStarted = Date.now();
  let clarificationCount = 0;
  let goal = await waitForGoalStatus({
    admin,
    goalId: created.id,
    targets: new Set(['awaiting_context_approval']),
    config,
    timeline,
    stage: `${workflow.key}/context`,
    onHumanBlocker: async (blockedGoal) => {
      invariant(
        workflow.rejectClarification !== true,
        'clarification_rejected_for_frozen_comparison',
        'The frozen comparison prompt must not be contaminated with workflow-specific clarification answers'
      );
      invariant(
        blockedGoal.status === 'awaiting_po_input' && clarificationCount === 0,
        'unexpected_human_blocker',
        `Goal entered ${blockedGoal.status} during ${workflow.key}/context after clarification was already handled`
      );
      clarificationCount += 1;
      console.log(
        `[testing] ${workflow.key}: answering AxWise clarification through the user boundary`
      );
      const answers = await answerGoalClarification({
        admin,
        config,
        accessToken,
        goal: blockedGoal,
        workflow,
      });
      clarifications.push({
        gate: 'customer_context',
        question_count: answers.length,
        answer_count: answers.length,
        submitted_by: 'authenticated_user',
      });
    },
  });
  durations.to_context_gate = Date.now() - contextStarted;
  const contextOrgAgentIds = await loadCurrentOrganizationAgentIds(admin, userId, org.id);
  assertContextGate({
    goal,
    workflow,
    userId,
    orgId: org.id,
    orgAgentIds: contextOrgAgentIds,
  });
  humanCheckpoints.push({
    checkpoint: 'context_approval',
    sequence: 1,
    snapshot_ref: fingerprint(goal.data?.goal_approvals?.context?.snapshot_hash, 'snapshot'),
    verified_at: new Date().toISOString(),
  });
  console.log(`[testing] ${workflow.key}: context proof passed; applying human confirmation one`);
  await localApiRequest(
    config,
    accessToken,
    `/api/app?path=goals&op=review-context&id=${encodeURIComponent(goal.id)}`,
    { method: 'POST', body: { action: 'approve' } }
  );

  const executionStarted = Date.now();
  goal = await waitForGoalStatus({
    admin,
    goalId: goal.id,
    targets: new Set(['awaiting_approval']),
    config,
    timeline,
    stage: `${workflow.key}/proposal`,
  });
  durations.context_to_execution_gate = Date.now() - executionStarted;
  let evidence = await loadExecutionEvidence(admin, goal);
  // Planning may safely materialize previously missing AxWise/PO specialists
  // and map them into the selected organization. Refresh the authorization
  // boundary before checking the resulting team; the context-time snapshot is
  // intentionally stale after that roster growth.
  let executionOrgAgentIds = await loadCurrentOrganizationAgentIds(admin, userId, org.id);
  assertExecutionGate({
    goal,
    team: evidence.team,
    teamMemberIds: evidence.memberships.map((item) => item.member_id),
    tasks: evidence.tasks,
    orgAgentIds: executionOrgAgentIds,
    requireApplied: config.requireApplied,
  });
  let approvedExecutionHash = goal.data?.goal_approvals?.execution?.snapshot_hash;
  humanCheckpoints.push({
    checkpoint: 'execution_approval',
    sequence: 1,
    snapshot_ref: fingerprint(approvedExecutionHash, 'snapshot'),
    verified_at: new Date().toISOString(),
  });
  console.log(`[testing] ${workflow.key}: execution proof passed; applying human confirmation two`);
  await localApiRequest(
    config,
    accessToken,
    `/api/app?path=goals&op=approve&id=${encodeURIComponent(goal.id)}`,
    { method: 'POST', body: {} }
  );

  const completionStarted = Date.now();
  let executionReapprovalCount = 0;
  goal = await waitForGoalStatus({
    admin,
    goalId: goal.id,
    targets: new Set(['completed']),
    config,
    timeline,
    stage: `${workflow.key}/execution`,
    onHumanBlocker: async (blockedGoal) => {
      invariant(
        blockedGoal.status === 'awaiting_approval',
        'unexpected_execution_human_blocker',
        `Goal entered ${blockedGoal.status} during execution; the harness only handles changed-proposal reapproval`
      );
      const pendingExecutionHash = blockedGoal.data?.goal_approvals?.execution?.snapshot_hash;
      if (pendingExecutionHash === approvedExecutionHash) {
        // The approval route queues its state transition. A fast local poll can
        // still observe the just-approved snapshot before client-approval has
        // consumed it; that is not a new human checkpoint. Drive the queued
        // transition once and keep waiting for execution to start.
        await workerTick(config);
        return;
      }
      const reapprovalNumber = executionReapprovalCount + 1;
      const refreshedEvidence = await loadExecutionEvidence(admin, blockedGoal);
      executionOrgAgentIds = await loadCurrentOrganizationAgentIds(admin, userId, org.id);
      const checkpoint = assertExecutionReapproval({
        goal: blockedGoal,
        team: refreshedEvidence.team,
        teamMemberIds: refreshedEvidence.memberships.map((item) => item.member_id),
        tasks: refreshedEvidence.tasks,
        orgAgentIds: executionOrgAgentIds,
        requireApplied: config.requireApplied,
        previousApprovalHash: approvedExecutionHash,
        reapprovalNumber,
      });
      humanCheckpoints.push(checkpoint);
      executionReapprovalCount = reapprovalNumber;
      approvedExecutionHash = blockedGoal.data.goal_approvals.execution.snapshot_hash;
      console.log(
        `[testing] ${workflow.key}: changed proposal passed execution proof; applying bounded human reapproval ${executionReapprovalCount}/${MAX_EXECUTION_REAPPROVALS}`
      );
      await localApiRequest(
        config,
        accessToken,
        `/api/app?path=goals&op=approve&id=${encodeURIComponent(blockedGoal.id)}`,
        { method: 'POST', body: {} }
      );
    },
  });
  durations.execution_gate_to_completion = Date.now() - completionStarted;
  const outcomeStarted = Date.now();
  const outcomeProof = await waitForDurableOutcome({
    admin,
    goalId: goal.id,
    config,
  });
  durations.outcome_delivery = outcomeProof.durationMs;
  durations.total = Date.now() - workflowStarted;
  goal = outcomeProof.goal;
  evidence = outcomeProof.evidence;
  console.log(
    `[testing] ${workflow.key}: AxWise outcome receipt durably reported in ${Date.now() - outcomeStarted}ms`
  );
  assertCompletedWorkflow({
    goal,
    tasks: evidence.tasks,
    axwiseCalls: evidence.axwiseCalls,
    logs: evidence.logs,
  });

  // Exercise the authenticated goal read route as the final browser-facing
  // boundary, without copying its potentially large raw output to the artifact.
  const readback = await localApiRequest(
    config,
    accessToken,
    `/api/app?path=goals&op=get&id=${encodeURIComponent(goal.id)}`
  );
  invariant(
    String(readback?.id) === String(goal.id),
    'goal_readback_mismatch',
    'Authenticated goal readback returned another goal'
  );
  invariant(
    readback?.status === 'completed',
    'goal_readback_incomplete',
    'Authenticated goal readback is not completed'
  );

  return {
    goal,
    teamId: goal.agent_team_id,
    rawIdentifiers: [
      goal.id,
      goal.agent_team_id,
      goal.data?.axwise_customer_intelligence?.decision_id,
      goal.data?.axwise_customer_intelligence?.job_id,
      goal.data?.axwise_orchestration?.decision_id,
      goal.data?.axwise_outcome?.outcome_id,
      ...evidence.memberships.map((membership) => membership.member_id),
      ...evidence.tasks.flatMap((task) => [task.id, task.agent_id]),
    ].filter(Boolean),
    artifact: buildWorkflowArtifact({
      workflow,
      goal,
      team: evidence.team,
      memberships: evidence.memberships,
      tasks: evidence.tasks,
      agents,
      axwiseCalls: evidence.axwiseCalls,
      logs: evidence.logs,
      statusTimeline: timeline,
      durations,
      clarifications,
      humanCheckpoints,
    }),
  };
}

function usage() {
  return `[testing] Orqaly -> live AxWise E2E harness\n\nUsage:\n  node scripts/axwise-live-e2e.mjs --seed [--artifact=<path>]\n\nAuthoritative identity (required unless --allow-shadow):\n  ORQALY_E2E_EXPECTED_USER_ID=<AxWise-mapped user UUID>\n  ORQALY_E2E_ORG_ID=<AxWise-mapped organization UUID>\n\nOptions:\n  --seed                    Create/update local-only user, org, agents and mappings\n  --allow-shadow            Record shadow mode explicitly instead of requiring applied assignments\n  --allow-loopback-axwise  Permit HTTP loopback AxWise for a current-local-code comparison\n  --api-url=<url>           Loopback Orqaly API (default ${DEFAULT_API_URL})\n  --artifact=<path>         New JSON path; existing files are never overwritten\n  --workflow=<key>          Run only simple or advanced (default: both)\n  --stage-timeout-ms=<ms>   Timeout per gate/stage (default ${DEFAULT_STAGE_TIMEOUT_MS})\n  --worker-interval-ms=<ms> Delay between local worker ticks\n  --help                    Show this message\n`;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const { values } = parseArgs({
    args: argv,
    options: {
      seed: { type: 'boolean', default: false },
      'allow-shadow': { type: 'boolean', default: false },
      'allow-loopback-axwise': { type: 'boolean', default: false },
      'api-url': { type: 'string' },
      artifact: { type: 'string' },
      workflow: { type: 'string' },
      'stage-timeout-ms': { type: 'string' },
      'worker-interval-ms': { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  });
  if (values.help) {
    console.log(usage());
    return { ok: true, help: true };
  }

  const selectedWorkflows = values.workflow
    ? WORKFLOWS.filter((workflow) => workflow.key === values.workflow)
    : WORKFLOWS;
  invariant(selectedWorkflows.length > 0, 'invalid_option', 'Workflow must be simple or advanced');

  const config = loadConfiguration(values, env);
  const secrets = [
    ...secretValues(env),
    config.password,
    config.axwiseKey,
    config.serviceRoleKey,
    config.anonKey,
    config.workerSecret,
  ].filter((value) => typeof value === 'string' && value.length >= 6);
  const admin = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const auth = createClient(config.supabaseUrl, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  let partial = {
    harness_version: HARNESS_VERSION,
    run_ref: fingerprint(runId, 'run'),
    started_at: startedAt,
    topology: {
      orqaly: 'local',
      supabase: 'local',
      axwise: config.axwiseTarget,
      assignment_requirement: config.requireApplied ? 'authoritative_applied' : 'shadow_allowed',
    },
    status: 'running',
    workflows: [],
  };
  const rawIdentifiers = [];

  try {
    await preflightLocalApi(config);
    const { user, accessToken } = await ensureTestUser(admin, auth, config);
    const org = await ensureOrganization(admin, user.id, config);
    await ensureInternalTools(admin, user.id, config);
    const { agents, orgAgentIds } = await ensureAgents(admin, user.id, org.id, config);
    rawIdentifiers.push(user.id, org.id, ...agents.map((agent) => agent.id));
    const axwiseHealth = await preflightAxwise(config, user.id, org.id);
    partial.axwise = axwiseHealth;
    partial.user_ref = fingerprint(user.id, 'user');
    partial.org_ref = fingerprint(org.id, 'org');
    partial.agent_catalogue = agents.map((agent) => ({
      agent_ref: fingerprint(agent.id, 'agent'),
      name: agent.name,
      capabilities: (agent.capabilities || []).slice(0, 20),
      active: agent.status === 'active',
    }));
    console.log(`[testing] preflight: local Orqaly + local Supabase + live AxWise tenant accepted`);

    const results = [];
    for (const workflow of selectedWorkflows) {
      const result = await runWorkflow({
        admin,
        config,
        accessToken,
        userId: user.id,
        org,
        agents,
        orgAgentIds,
        workflow,
        runId,
      });
      results.push(result);
      rawIdentifiers.push(...result.rawIdentifiers);
      partial.workflows.push(result.artifact);
    }
    if (results.length > 1) {
      invariant(
        results[0].teamId &&
          results[1].teamId &&
          String(results[0].teamId) !== String(results[1].teamId),
        'team_reuse_detected',
        'Simple and Advanced goals reused the same execution team'
      );
    }
    partial.status = 'passed';
    partial.completed_at = new Date().toISOString();
    partial.cross_workflow = {
      distinct_goal_scoped_teams: results.length > 1 ? true : null,
      workflow_count: results.length,
    };
    await writeRedactedArtifact(config.artifactPath, partial, [
      ...secrets,
      ...rawIdentifiers.filter(Boolean),
    ]);
    console.log(`[testing] PASS: redacted proof written to ${config.artifactPath}`);
    return { ok: true, artifactPath: config.artifactPath, artifact: partial };
  } catch (error) {
    const redactions = [...secrets, ...rawIdentifiers.filter(Boolean)];
    partial.status = 'failed';
    partial.completed_at = new Date().toISOString();
    partial.failure = {
      code: error?.code || 'unexpected_error',
      message: redactText(error?.message || 'Unexpected E2E error', redactions),
    };
    try {
      await writeRedactedArtifact(config.artifactPath, partial, redactions);
      console.error(`[testing] FAIL (${partial.failure.code}): ${partial.failure.message}`);
      console.error(`[testing] partial redacted proof written to ${config.artifactPath}`);
    } catch (artifactError) {
      console.error(`[testing] FAIL (${partial.failure.code}): ${partial.failure.message}`);
      console.error(
        `[testing] artifact write also failed: ${redactText(artifactError.message, redactions)}`
      );
    }
    error.harnessReported = true;
    throw error;
  }
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) {
  main().catch((error) => {
    if (!error?.harnessReported) {
      console.error(
        `[testing] FAIL (${error?.code || 'unexpected_error'}): ${redactText(
          error?.message || 'Unexpected E2E error',
          secretValues(process.env)
        )}`
      );
    }
    process.exitCode = 1;
  });
}
