import { verifySystemEnrichmentAuthorization } from '../execution-authorization.js';
import { enqueueGoalAction, loadGoal, logGoalEvent, updateGoalIfStatus } from '../_helpers.js';

const LEGACY_DEFERABLE_STATUSES = new Set([
  'planning',
  'forming_team',
  'provisioning_tools',
  'tools_ready',
  'estimating',
]);
const TERMINAL_OR_PAUSED_STATUSES = new Set([
  'cancelled',
  'completed',
  'failed',
  'failed_no_agents',
  'failed_missing_creds',
  'needs_human',
  'paused',
]);

/**
 * Fail closed when a post-approval enrichment was queued without the exact,
 * still-current gate-2 grant. The goal returns to approval instead of silently
 * making an external call or persistent write.
 */
export async function requireSystemEnrichmentAuthorization({
  admin,
  goal,
  enrichmentId,
  planningFallbackAction = null,
  req,
  log,
}) {
  const authorization = verifySystemEnrichmentAuthorization(goal, enrichmentId);
  if (authorization.ok) return authorization;

  // Deployment-safe handling for jobs queued by the old pre-approval stage
  // order: skip the enrichment and continue building the proposal. Gate 2 will
  // later enqueue the action again with a signed grant.
  if (
    !goal?.data?.goal_approvals?.execution &&
    planningFallbackAction &&
    LEGACY_DEFERABLE_STATUSES.has(goal?.status)
  ) {
    log?.info(req, `${enrichmentId}.deferred-until-approval`, { goalId: goal.id });
    await logGoalEvent(admin, goal.id, 'system_enrichment_deferred_until_approval', {
      enrichment_id: enrichmentId,
    });
    await enqueueGoalAction(admin, planningFallbackAction, goal.id);
    return { ...authorization, deferred: true };
  }

  log?.warn(req, `${enrichmentId}.authorization-required`, {
    goalId: goal.id,
    reasons: authorization.reasons,
  });
  if (TERMINAL_OR_PAUSED_STATUSES.has(goal?.status)) return authorization;
  const reserved = await updateGoalIfStatus(admin, goal.id, goal.status, {
    status: 'awaiting_approval',
  });
  if (!reserved) {
    return { ...authorization, reasons: [...authorization.reasons, 'goal_state_changed'] };
  }
  await logGoalEvent(admin, goal.id, 'system_enrichment_authorization_required', {
    enrichment_id: enrichmentId,
    reasons: authorization.reasons,
  });
  await enqueueGoalAction(admin, 'client-approval', goal.id);
  return authorization;
}

/** Reload and recheck immediately before a persistent write or next-stage enqueue. */
export async function recheckSystemEnrichmentAuthorization({
  admin,
  goalId,
  enrichmentId,
  req,
  log,
}) {
  let currentGoal;
  try {
    currentGoal = await loadGoal(admin, goalId);
  } catch (error) {
    log?.warn(req, `${enrichmentId}.authorization-recheck-failed`, {
      goalId,
      error: String(error.message || error).slice(0, 300),
    });
    return { ok: false, reasons: ['goal_authorization_state_unavailable'], goal: null };
  }
  const authorization = await requireSystemEnrichmentAuthorization({
    admin,
    goal: currentGoal,
    enrichmentId,
    req,
    log,
  });
  return { ...authorization, goal: currentGoal };
}

export async function enqueueAuthorizedSystemEnrichmentNext({
  admin,
  goalId,
  enrichmentId,
  action,
  extra = {},
  req,
  log,
}) {
  const authorization = await recheckSystemEnrichmentAuthorization({
    admin,
    goalId,
    enrichmentId,
    req,
    log,
  });
  if (authorization.ok) await enqueueGoalAction(admin, action, goalId, extra);
  return authorization;
}
