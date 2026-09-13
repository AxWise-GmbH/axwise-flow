/**
 * Human-in-the-loop policy for goal approval gates.
 *
 * A goal is either 'checkpoints' (the default: both human gates wait for an
 * explicit user action) or 'unattended' (the pipeline approves its own gates on
 * the owner's behalf).
 *
 * Unattended does NOT skip a gate. The stage writes the awaiting_* status
 * durably first, then enqueues an ordinary approval job that re-enters the same
 * handler the UI would have hit. Every safety check the handler owns still runs
 * — the research-context gate, the execution-authorization manifest check, the
 * stale-snapshot guards — so a goal that genuinely cannot proceed still parks
 * and asks for a person. Unattended removes the routine wait, never a check.
 */

// A snapshot that keeps churning could in principle bounce between "pending"
// and "auto-approve" forever. The stages only enqueue from their entry branch,
// which already terminates, so this is a second, cheap backstop.
export const MAX_AUTO_APPROVALS = 3;

/** Gate kinds tracked independently. */
export const AUTO_APPROVAL_KINDS = ['context', 'execution'];

export function goalRunsUnattended(goal) {
  return goal?.hitl_mode === 'unattended';
}

export function autoApprovalCount(goal, kind) {
  const counts = goal?.data?.hitl_auto_approvals;
  const value = Number(counts?.[kind] ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function autoApprovalAllowed(goal, kind) {
  return goalRunsUnattended(goal) && autoApprovalCount(goal, kind) < MAX_AUTO_APPROVALS;
}

/**
 * Return the next `data` blob with this gate's auto-approval counter bumped.
 * Pure: never mutates the goal or its data.
 */
export function withAutoApprovalCount(goalData, kind) {
  const counts = goalData?.hitl_auto_approvals || {};
  const current = Number(counts[kind] ?? 0);
  return {
    ...(goalData || {}),
    hitl_auto_approvals: {
      ...counts,
      [kind]: (Number.isFinite(current) && current > 0 ? current : 0) + 1,
    },
  };
}

/** Marker stamped onto the enqueued job so goal_log shows the delegation. */
export function autoApprovalMarker(snapshotHash) {
  return { policy: 'hitl_unattended', snapshot_hash: snapshotHash || null };
}

export function normalizeGoalHitlMode(value) {
  return value === 'unattended' ? 'unattended' : 'checkpoints';
}
