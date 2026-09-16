/**
 * Human-readable descriptions of gate and authorization *reason* codes.
 *
 * Companion to authorization-issues.js. That module explains why one task in
 * the manifest is unusable; this one explains why a whole approval stopped
 * counting - "plan_replaced_by_iteration", "execution_approval_stale" - which
 * is what the goal log records and what the thread was printing verbatim.
 *
 * A raw code in a conversation is a dead end: it names the machine's state and
 * leaves the reader with nothing to do. Every entry here therefore carries a
 * remedy, and where a control exists an `action` the UI can turn into a button.
 *
 * Pure: no imports, no I/O, safe on both sides of the module boundary.
 */

/**
 * What the user can do about it. The UI maps these onto its own controls; a
 * null action means the run recovers on its own and only needs explaining.
 */
export const INVALIDATION_ACTIONS = {
  REVIEW_PROPOSAL: 'review_proposal',
  CONFIRM_CONTEXT: 'confirm_context',
  REBUILD_TEAM: 'rebuild_team',
  CONNECT_TOOLS: 'connect_tools',
  RESUME: 'resume',
};

const REASONS = {
  plan_replaced_by_iteration: {
    headline: 'The plan changed, so the earlier approval no longer applies.',
    remedy: 'Review and approve the revised plan when it is ready.',
    action: INVALIDATION_ACTIONS.REVIEW_PROPOSAL,
    // The orchestrator re-runs team formation itself; nothing is stuck.
    transient: true,
  },
  proposal_changed_before_approval: {
    headline: 'The estimate changed while it was waiting for you.',
    remedy: 'Reopen the proposal to see the current cost before approving.',
    action: INVALIDATION_ACTIONS.REVIEW_PROPOSAL,
  },
  context_changed_before_approval: {
    headline: 'The brief changed while it was waiting for you.',
    remedy: 'Confirm the updated brief to carry on.',
    action: INVALIDATION_ACTIONS.CONFIRM_CONTEXT,
  },
  execution_approval_stale: {
    headline: 'The approved plan no longer matches the work about to run.',
    remedy: 'Reopen the proposal and approve the current plan.',
    action: INVALIDATION_ACTIONS.REVIEW_PROPOSAL,
  },
  context_approval_stale: {
    headline: 'The confirmed brief no longer matches this goal.',
    remedy: 'Confirm the brief again.',
    action: INVALIDATION_ACTIONS.CONFIRM_CONTEXT,
  },
  authorization_not_approved: {
    headline: 'Execution was never authorized for this plan.',
    remedy: 'Approve the plan to release the work.',
    action: INVALIDATION_ACTIONS.REVIEW_PROPOSAL,
  },
  authorization_manifest_invalid: {
    headline: 'The team and the plan do not line up, so nothing could be released.',
    remedy: 'Rebuild the team, or request changes so the plan uses roles you have.',
    action: INVALIDATION_ACTIONS.REBUILD_TEAM,
  },
  authorization_hash_mismatch: {
    headline: 'The plan was edited after it was approved.',
    remedy: 'Approve the current version to continue.',
    action: INVALIDATION_ACTIONS.REVIEW_PROPOSAL,
  },
  queued_job_hash_mismatch: {
    headline: 'This task was queued against an older version of the plan.',
    remedy: 'Approve the current plan; the task will be queued again.',
    action: INVALIDATION_ACTIONS.REVIEW_PROPOSAL,
  },
  task_overlay_hash_mismatch: {
    headline: 'This task changed after the plan was approved.',
    remedy: 'Approve the current plan to release it.',
    action: INVALIDATION_ACTIONS.REVIEW_PROPOSAL,
  },
  task_not_authorized: {
    headline: 'This task was not part of what you approved.',
    remedy: 'Approve the current plan so every task is covered.',
    action: INVALIDATION_ACTIONS.REVIEW_PROPOSAL,
  },
  task_research_contract_changed: {
    headline: 'The research this task relies on has changed since approval.',
    remedy: 'Confirm the customer context again.',
    action: INVALIDATION_ACTIONS.CONFIRM_CONTEXT,
  },
  approved_source_urls_changed: {
    headline: 'The approved sources are not the ones this run would use.',
    remedy: 'Confirm the sources again.',
    action: INVALIDATION_ACTIONS.CONFIRM_CONTEXT,
  },
  goal_not_active: {
    headline: 'The goal is not running, so no work can be released.',
    remedy: 'Resume the goal to continue.',
    action: INVALIDATION_ACTIONS.RESUME,
  },
  system_enrichment_not_approved: {
    headline: 'Background research has not been approved for this goal.',
    remedy: 'Confirm the brief to allow it, or leave it off.',
    action: INVALIDATION_ACTIONS.CONFIRM_CONTEXT,
  },
  system_enrichment_forbidden_by_no_tools_policy: {
    headline: 'This goal runs without tools, so background research stays off.',
    remedy: 'Nothing to do - the work continues without it.',
    action: null,
    transient: true,
  },
};

/** True when the code is one this module knows how to explain. */
export function isKnownInvalidationReason(code) {
  return Object.prototype.hasOwnProperty.call(REASONS, String(code || ''));
}

/**
 * One reason code as prose. Unknown codes are de-snaked rather than shown raw,
 * so a new server-side code degrades to readable English instead of leaking.
 */
export function describeInvalidationReason(code) {
  const key = String(code || '').trim();
  const known = REASONS[key];
  if (known) return { code: key, ...known, transient: Boolean(known.transient) };
  return {
    code: key,
    headline: key
      ? `${key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}.`
      : 'The approval no longer applies.',
    remedy: 'Reopen the proposal to see what changed.',
    action: INVALIDATION_ACTIONS.REVIEW_PROPOSAL,
    transient: false,
  };
}

/**
 * Deduped descriptions for a list of codes, plus the single action worth
 * offering. Ordering is the caller's: the first actionable reason wins, which
 * matches how the server pushes the most specific check first.
 */
export function describeInvalidationReasons(codes = []) {
  const items = [];
  const seen = new Set();
  for (const code of Array.isArray(codes) ? codes : []) {
    const key = String(code || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push(describeInvalidationReason(key));
  }
  return { items, action: items.find((item) => item.action)?.action || null };
}

/** One sentence for a log line or a notification. */
export function invalidationReasonSentence(codes = []) {
  const { items } = describeInvalidationReasons(codes);
  if (!items.length) return 'The approval no longer applies.';
  const [first] = items;
  const more = items.length > 1 ? ` And ${items.length - 1} more.` : '';
  return `${first.headline}${more} ${first.remedy}`;
}
