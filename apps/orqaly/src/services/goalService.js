/**
 * Goal service — autonomous goal orchestration CRUD.
 */
import { supabase, hasSupabase } from '../lib/supabase';

let goalSourceRequestSequence = 0;

async function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

function getBase() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/**
 * Error returned by the goals API.
 *
 * Reconciliation failures deliberately include durable goal/job identities.
 * Keep the parsed response intact so callers can reconcile that exact work
 * after a response loss instead of treating every non-2xx as an opaque string.
 */
export class GoalServiceError extends Error {
  constructor(message, { status, response, raw, detail } = {}) {
    super(message);
    this.name = 'GoalServiceError';
    this.status = status ?? null;
    this.response = response ?? null;
    this.raw = raw || null;
    this.detail = detail ?? null;
    this.code = response?.code || null;

    const metadata = response?.data ?? null;
    const structuredMetadata =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
    this.data = metadata;
    this.metadata = metadata;
    this.goal_id = structuredMetadata.goal_id ?? response?.goal_id ?? null;
    this.job_id = structuredMetadata.job_id ?? response?.job_id ?? null;
    this.reconciliation_state =
      structuredMetadata.reconciliation_state ?? response?.reconciliation_state ?? null;
    this.retry_safe = structuredMetadata.retry_safe ?? response?.retry_safe ?? null;

    // Ergonomic aliases without discarding the wire-format fields above.
    this.goalId = this.goal_id;
    this.jobId = this.job_id;
    this.reconciliationState = this.reconciliation_state;
    this.retrySafe = this.retry_safe;
  }
}

/** Create a unique idempotency key for one logical goal-create intent. */
export function createGoalSourceRequestId() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  // randomUUID is available in current browsers, but retain a collision-safe
  // fallback for older embedded webviews and test environments.
  goalSourceRequestSequence += 1;
  const randomPart = Math.random().toString(36).slice(2);
  return `goal-${Date.now().toString(36)}-${goalSourceRequestSequence.toString(36)}-${randomPart}`;
}

async function request(op, method = 'GET', params = {}, body = null) {
  const qs = new URLSearchParams({ op, ...params });
  for (const [k, v] of qs.entries()) {
    if (!v) qs.delete(k);
  }
  const opts = { method, headers: await getHeaders() };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${getBase()}/api/app?path=goals&${qs}`, opts);
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    /* non-JSON (proxy/HTML error page) */
  }
  if (!res.ok) {
    const base = data.error || `HTTP ${res.status}`;
    const detail = data.detail || (!data.error && raw ? raw.slice(0, 200) : null);
    throw new GoalServiceError(detail ? `${base} - ${detail}` : base, {
      status: res.status,
      response: data,
      raw,
      detail,
    });
  }
  return data;
}

export function createGoal(data) {
  return request('create', 'POST', {}, data);
}

/**
 * Prepare the server-authoritative physical-product evidence profile for the
 * selected organization and grounded research market. This does not create or
 * mutate a goal; createSmartRequestDraft revalidates the returned contract.
 */
export function preparePhysicalEvidenceProfile(data) {
  return request('prepare-physical-evidence-profile', 'POST', {}, data);
}

/** Create a verified, non-executing Smart Request draft. */
export function createSmartRequestDraft(data) {
  return request('create-smart-request-draft', 'POST', {}, data);
}

/**
 * Start a draft goal only after its attachment metadata has been validated and
 * persisted server-side. This is intentionally separate from createGoal so a
 * failed upload can never race the worker or AxWise customer intelligence.
 *
 * `kbDocumentIds` are Knowledge Base picks. Only the ids travel: the server
 * resolves ownership, organization scope and content, so document text never
 * makes a round trip through the browser.
 */
export function startGoal(id, attachments = [], kbDocumentIds = []) {
  return request(
    'start-smart-request',
    'POST',
    {},
    {
      id,
      attachments,
      kb_document_ids: kbDocumentIds,
    }
  );
}

/** Accept the active, hash-bound AxWise working scope and resume routing. */
export function acceptGoalCustomerScope(data) {
  return request('accept-customer-scope', 'POST', {}, data);
}

/** Replace the active, hash-bound AxWise working scope from an owner correction. */
export function reviseGoalCustomerScope(data) {
  return request('revise-customer-scope', 'POST', {}, data);
}

/** Submit the exact active Expert PO question snapshot and resume PRD generation. */
export function submitGoalPoAnswers(id, answers) {
  return request('answer-po-questions', 'POST', {}, { id, answers });
}

/**
 * Drop the goal's team and re-form it. For a goal blocked by a structurally
 * invalid authorization manifest: the team, not the plan, is wrong.
 */
export function rebuildGoalTeam(id) {
  return request('resolve', 'POST', {}, { goalId: id, resolution: { type: 'rebuild_team' } });
}

export function listGoals(status = null) {
  return request('list', 'GET', status ? { status } : {});
}

/**
 * Looped goals (iteration > 0 or loop_enabled) with their looping agent (team
 * lead) resolved. Powers the Home "Loops from Agents" table and the Requests
 * page Loops tab. Returns an array of rows
 * `{ loop_id, goal_id, goal_title, agent_id, agent_name, agent_role, loops,
 *    max_loops, status, loop_enabled, loop_paused, started_at }`.
 */
export function getLoops() {
  return request('loops', 'GET', {});
}

export function getGoal(id) {
  return request('get', 'GET', { id });
}

export function getGoalResearchBundle(id) {
  return request('research-bundle', 'GET', { id });
}

export function getGoalResearchArtifact(id, artifactId) {
  return request('research-artifact', 'GET', { id, artifact_id: artifactId });
}

export function pauseGoal(id) {
  return request('pause', 'POST', { id });
}

export function resumeGoal(id) {
  return request('resume', 'POST', { id });
}

/** Wake the exact stale Preview queue snapshot authorized by the server. */
export function retryGoalPickup(id, pickupCapability) {
  return request('retry-pickup', 'POST', { id }, { pickup_capability: pickupCapability });
}

export function cancelGoal(id) {
  return request('cancel', 'POST', { id });
}

export function deleteGoal(id) {
  return request('delete', 'POST', { id });
}

export function retryGoal(id) {
  return request('retry', 'POST', { id });
}

/** Queue a new full Osja quality review without re-running the goal itself. */
export function rerunGoalQualityReview(id) {
  return request('rerun-quality-review', 'POST', { id });
}

export function toggleAutopilot(id, enabled) {
  return request('toggle-autopilot', 'POST', { id }, { id, enabled });
}

/** Flip a goal's loop_enabled flag. Drives autonomous continuation chains. */
export function toggleLoop(id, enabled) {
  return request('toggle-loop', 'POST', { id }, { id, enabled });
}

/**
 * Persist a loop's advanced controls. Pass `{ loop_advanced }` to flip the
 * per-loop Advanced flag, and/or `{ loop_settings: {...} }` to patch any of
 * { convergence_min_gain, chain_budget_cap_usd, hitl_every, refine_max_versions }.
 */
export function updateLoopSettings(id, patch) {
  return request('update-loop-settings', 'POST', { id }, { id, ...patch });
}

/** Per-loop-chain spend rollup for a single goal (handles chain root lookup). */
export function getChainSpend(id) {
  return request('chain-spend', 'GET', { id });
}

/**
 * Targeted resolution for goals stuck in needs_human / failed / paused.
 * See handleResolve in lib/api-handlers/goals.js for supported types.
 *
 * @param {string} goalId
 * @param {{ type: string, data: object }} resolution
 */
export function resolveGoal(goalId, resolution) {
  return request('resolve', 'POST', {}, { goalId, resolution });
}

export function updateGoalBudget(id, budget) {
  return request('update-budget', 'POST', { id, budget: String(budget) });
}

export function provideTools(id, { skip = false } = {}) {
  // Send the choice in the JSON body as well as the idempotent route params.
  // Some serverless adapters normalize POST query values differently; the
  // body is the authoritative signal for an explicit no-tools continuation.
  return request('provide-tools', 'POST', { id }, { id, skip });
}

export function getPhaseOutputs(goalId, phaseIndex) {
  return request('phase-outputs', 'GET', { goalId, phaseIndex: String(phaseIndex) });
}

export function approveGoal(id) {
  return request('approve', 'POST', { id });
}

export function approveGoalContext(id, nativeScopeBinding = null) {
  return request(
    'review-context',
    'POST',
    { id },
    {
      action: 'approve',
      ...(nativeScopeBinding ? { native_scope_binding: nativeScopeBinding } : {}),
    }
  );
}

export function reviseGoalContext(id, feedback, nativeScopeBinding = null) {
  return request(
    'review-context',
    'POST',
    { id },
    {
      action: 'revise',
      feedback,
      ...(nativeScopeBinding ? { native_scope_binding: nativeScopeBinding } : {}),
    }
  );
}

export function requestGoalContextEvidence(id, feedback, nativeScopeBinding = null) {
  return request(
    'review-context',
    'POST',
    { id },
    {
      action: 'request-evidence',
      feedback,
      ...(nativeScopeBinding ? { native_scope_binding: nativeScopeBinding } : {}),
    }
  );
}

export function requestGoalChanges(id, feedback) {
  return request('request-changes', 'POST', { id }, { feedback });
}

export function getGoalMessages(id, channel = null) {
  return request('messages', 'GET', { id, ...(channel ? { channel } : {}) });
}

// ── Theory Mode projections ──────────────────────────────────────

/** Get all projections for a goal */
export function getGoalProjections(goalId) {
  return request('projections', 'GET', { id: goalId });
}

/** Re-generate projections for a goal */
export function regenerateProjection(goalId) {
  return request('regenerate-projection', 'POST', { id: goalId });
}

/** Generate projection for a custom date range */
export function customProjection(goalId, startDate, endDate) {
  return request(
    'custom-projection',
    'POST',
    {},
    { id: goalId, start_date: startDate, end_date: endDate }
  );
}

/**
 * Manually trigger the self-healer on a single goal.
 * Useful for recovering failed/needs_human/awaiting_* goals without
 * waiting for the next cron tick.
 */
export async function healGoal(id) {
  const headers = await getHeaders();
  const res = await fetch(`${getBase()}/api/agent?path=heal-goal&id=${encodeURIComponent(id)}`, {
    method: 'GET',
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Heal failed');
  return data;
}
