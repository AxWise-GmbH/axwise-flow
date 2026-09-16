/**
 * Graceful degradation wrapper. Every seam calls withAxwise(), never the raw
 * client, so an outage / timeout / disabled-flag never breaks the request.
 *
 * Posture:
 *   - 'closed' (agent.generate): if AxWise is ENABLED but errors, block the
 *     action (fail-closed). Disabled flag does NOT block - local validators run.
 *   - 'open'  (everything else): fall back to local heuristics (fail-open).
 *
 * degraded rule: the return value always carries a top-level `degraded` boolean.
 * When degraded === true, callers MUST ignore processedOutputs.security
 * .scopeDecision and apply their own local posture (authoritative authz stays in
 * Orqaly via JWT + RLS + tool-whitelist).
 *
 * disabled rule: `disabled === true` means AxWise was switched off (env flag or
 * the user's kill switch), NOT that it failed. It is degraded too - there is no
 * verdict to trust - but a fail-closed caller MUST NOT penalise the request for
 * it: off means the exact pre-integration local behavior, never forced approval.
 * Branch on `degraded && !disabled` to react to a genuine outage.
 */
import { evaluateConditions } from './client.js';
import { shouldEvaluate } from './pre-classifier.js';
import { isAxwiseEnabled } from './config.js';

function callFallback(fallbackFn) {
  return typeof fallbackFn === 'function' ? (fallbackFn() || {}) : {};
}

const EMPTY = { applicableConditions: [], processedOutputs: {} };

/**
 * @param {import('./types.js').EvaluationContext} context
 * @param {() => object} [fallbackFn] - local heuristic output shaped like a response fragment
 * @param {object} [options]
 * @param {'open'|'closed'} [options.posture='open']
 * @returns {Promise<object>} response-shaped object + `degraded` (+ `disabled`, `skipped`)
 */
export async function withAxwise(context, fallbackFn, options = {}) {
  const posture = options.posture || 'open';
  const point = context?.integrationPoint;

  // 1. Off → never call out; local heuristics own the decision (exact
  //    pre-integration behavior). Two independent off switches:
  //      - the global env flag (isAxwiseEnabled), and
  //      - the user's per-account kill switch (options.axwiseUserDisabled),
  //        resolved by withAxwiseTracked before we get here.
  if (!isAxwiseEnabled() || options.axwiseUserDisabled === true) {
    return {
      degraded: true,
      disabled: true,
      ...EMPTY,
      ...callFallback(fallbackFn),
      meta: { degraded: true, reason: 'disabled' },
    };
  }

  // 2. Token conservation → skip network, use local (not a degradation).
  if (!shouldEvaluate(context)) {
    return { degraded: false, skipped: true, ...EMPTY, ...callFallback(fallbackFn), meta: { degraded: false, skipped: true } };
  }

  // 3. Call AxWise.
  try {
    const result = await evaluateConditions(context, options);
    // Propagate AxWise's own internal degradation so callers still distrust
    // scopeDecision when the engine fell back internally.
    return { degraded: Boolean(result?.meta?.degraded), ...result };
  } catch (err) {
    const reason = String(err?.message || err);

    // Fail-closed: block the action when AxWise was expected to rule but could not.
    if (posture === 'closed' || point === 'agent.generate') {
      return {
        degraded: true,
        applicableConditions: [{ category: 'system_degradation', decision: 'blocked', reason }],
        processedOutputs: {
          security: {
            scopeDecision: 'denied',
            requiresApproval: true,
            blockReason: 'AxWise verification unavailable - request halted for safety.',
          },
        },
        meta: { degraded: true },
      };
    }

    // Fail-open: degrade to local heuristics.
    return {
      degraded: true,
      applicableConditions: [{ category: 'system_degradation', decision: 'fail_open_active', reason }],
      processedOutputs: {},
      ...callFallback(fallbackFn),
      meta: { degraded: true },
    };
  }
}
