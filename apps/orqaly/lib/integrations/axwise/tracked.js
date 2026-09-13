/**
 * withAxwise + usage/cost accounting. Records one llm_usage row per call
 * (source='axwise', operation=<integrationPoint>) so cognitive spend shows up
 * in the same ledger as LLM spend. Telemetry is best-effort and never blocks
 * or fails the request.
 */
import { buildSupabaseAdminClient } from '../../../api/_lib/supabase-server.js';
import { recordLlmUsage } from '../../goal-handlers/_helpers.js';
import { withAxwise } from './degrade.js';
import { isAxwiseUserDisabled } from './user-flag.js';

/** Truncate long strings so the inspector row never stores a huge blob. */
function truncate(s, n = 2000) {
  return typeof s === 'string' && s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Bound the request payload for storage: truncate big text, drop bulky fields. */
function boundRequest(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const p = { ...payload };
  if (typeof p.message === 'string') p.message = truncate(p.message);
  if (typeof p.draft_response === 'string') p.draft_response = truncate(p.draft_response);
  if (p.config && typeof p.config === 'object') {
    p.config = { ...p.config, system_prompt: truncate(p.config.system_prompt) };
  }
  if (Array.isArray(p.history)) {
    p.history_len = p.history.length;
    delete p.history;
  }
  delete p.toolCatalog; // large, not useful in the inspector
  return p;
}

/**
 * Resolve the database organization FK independently from the AxWise tenant.
 * Callers may use a user-id fallback for tenant.orgId because AxWise requires a
 * non-empty tenant, but that fallback is not a valid llm_usage.organization_id.
 * An explicit option (including null) therefore takes precedence.
 */
function resolveUsageOrganizationId(context, options) {
  if (Object.prototype.hasOwnProperty.call(options, 'organizationId')) {
    return options.organizationId || null;
  }
  return context?.tenant?.orgId || null;
}

/**
 * Derive how Orqaly applied the AxWise result, from the same inputs every caller
 * branches on (enforce mode + degraded/skipped + scopeDecision + fragment). Lets
 * the inspector show "where applied" without threading anything through callers.
 */
function deriveApplied({
  disabled,
  skipped,
  degraded,
  posture,
  scopeDecision,
  hasFragment,
  override,
}) {
  if (override) return override;
  if (disabled) return 'disabled';
  if (skipped) return 'skipped';
  if (process.env.AXWISE_ENFORCE !== 'authoritative') return 'shadow-logged';
  if (degraded) return posture === 'closed' ? 'fallback:forced-approval' : 'fallback:local';
  if (scopeDecision === 'denied') return 'blocked';
  return hasFragment ? 'fragment-merged' : 'applied-noop';
}

/**
 * Append a per-call inspector row (full request + response + applied outcome).
 * Best-effort and isolated: a failure here never affects the spend-ledger write
 * or the request. Correlated to llm_usage by trace_id.
 */
async function recordAxwiseCall(admin, context, result, options, flags) {
  try {
    const meta = result?.meta || {};
    const { degraded, skipped, cost, latency } = flags;
    const scopeDecision = result?.processedOutputs?.security?.scopeDecision ?? null;
    const payload = context?.payload || {};
    await admin.from('axwise_calls').insert({
      user_id: context?.tenant?.userId || options.userId || null,
      org_id: context?.tenant?.orgId || options.organizationId || null,
      trace_id: meta.traceId ?? null,
      request_id: context?.requestId ?? null,
      integration_point: context?.integrationPoint ?? null,
      destination_url: `${process.env.AXWISE_API_URL || ''}/conditions/evaluate`,
      model: meta.model ?? null,
      status: degraded ? 'error' : skipped ? 'skipped' : 'ok',
      applied_outcome: deriveApplied({
        disabled: false,
        skipped,
        degraded,
        posture: options.posture,
        scopeDecision,
        hasFragment: Boolean(result?.processedOutputs?.systemPromptFragment),
        override: options.applied,
      }),
      ax_decision: scopeDecision,
      local_decision: options.localDecision ?? null,
      degraded,
      skipped,
      duration_ms: latency,
      cost_usd: cost,
      // Skipped (smalltalk/billing) never reached AxWise: keep only the message so
      // the user sees why it was filtered, not the full context.
      request_payload: skipped ? { message: truncate(payload.message) } : boundRequest(payload),
      processed_outputs: skipped ? null : (result?.processedOutputs ?? null),
      applicable_conditions: skipped ? null : (result?.applicableConditions ?? null),
    });
  } catch {
    /* inspector log is best-effort */
  }
}

/**
 * @param {import('./types.js').EvaluationContext} context
 * @param {() => object} [fallbackFn]
 * @param {object} [options] - withAxwise options plus { admin, consiliumId, localDecision }
 * @returns {Promise<object>}
 */
export async function withAxwiseTracked(context, fallbackFn, options = {}) {
  // Per-account kill switch (resolved once here so no seam call site changes):
  // if the user turned AxWise off, mark it disabled so withAxwise short-circuits
  // to pure pre-integration behavior (no network call, no telemetry). Callers may
  // pass axwiseUserDisabled explicitly to skip the lookup (e.g. tests).
  if (options.axwiseUserDisabled === undefined) {
    const userId = options.userId || context?.tenant?.userId;
    options = {
      ...options,
      axwiseUserDisabled: await isAxwiseUserDisabled(options.admin, userId),
    };
  }
  const result = await withAxwise(context, fallbackFn, options);

  try {
    const meta = result?.meta || {};
    const cost = Number(meta.cost || 0);
    const latency = Number(meta.latencyMs || 0);
    const degraded = Boolean(result?.degraded);
    const skipped = Boolean(result?.skipped);
    const disabled = Boolean(result?.disabled);

    // Per-call inspector row (axwise_calls): capture every non-disabled call,
    // including SKIPPED (smalltalk) as a thin row so the monitor shows filtered
    // "other actions". disabled = feature off, no telemetry at all.
    if (!disabled) {
      const inspAdmin = options.admin || buildSupabaseAdminClient();
      if (inspAdmin)
        await recordAxwiseCall(inspAdmin, context, result, options, {
          degraded,
          skipped,
          cost,
          latency,
        });
    }

    // No SPEND-LEDGER row when OFF or SKIPPED - those are not real spend, and
    // recording them would spam the health view. Everything else - successful
    // evaluations AND genuine degradations (enabled but unreachable) - gets a row.
    if (skipped || disabled) return result;

    if (cost > 0 || latency > 0 || degraded) {
      const admin = options.admin || buildSupabaseAdminClient();
      if (admin) {
        // Persist the AxWise verdict alongside the caller's local verdict so the
        // analytics page can compute AxWise-vs-local divergence (impact). traceId
        // (previously dropped) is the correlation key back to the concilium/agent
        // axwise JSONB. All optional; null when unavailable.
        const metadataExtra = {
          ax_decision: result?.processedOutputs?.security?.scopeDecision ?? null,
          ax_conditions: Array.isArray(result?.applicableConditions)
            ? result.applicableConditions.map((c) => c?.category).filter(Boolean)
            : [],
          local_decision: options.localDecision ?? null,
          trace_id: meta.traceId ?? null,
          degraded,
        };
        await recordLlmUsage(admin, {
          userId: context?.tenant?.userId || options.userId || null,
          organizationId: resolveUsageOrganizationId(context, options),
          consiliumId: options.consiliumId || null,
          provider: 'axwise',
          model: meta.model || 'axwise',
          estimatedCostUsd: cost,
          durationMs: latency,
          source: 'axwise',
          operation: context?.integrationPoint || null,
          // 'degraded' isn't in the llm_usage.status CHECK (ok|error|timeout);
          // record genuine degradations as 'error' + an error_type so they are
          // always visible without depending on migration 179. metadata.degraded
          // carries the precise fact.
          status: degraded ? 'error' : 'ok',
          errorType: degraded ? 'axwise_degraded' : null,
          metadataExtra,
          updateGoalRollup: false,
          updateTask: false,
        });
      }
    }
  } catch {
    /* telemetry is best-effort */
  }

  return result;
}
