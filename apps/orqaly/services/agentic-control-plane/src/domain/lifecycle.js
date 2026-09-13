const AGENT_TRANSITIONS = {
  draft: new Set(['proposed', 'archived']),
  proposed: new Set(['active', 'archived']),
  active: new Set(['paused', 'revoked', 'expired']),
  paused: new Set(['active', 'revoked', 'expired']),
  revoked: new Set(['archived']),
  expired: new Set(['archived']),
  archived: new Set(),
};

const RUN_TRANSITIONS = {
  draft: new Set(['awaiting_scope_approval', 'planning', 'cancel_requested']),
  awaiting_scope_approval: new Set(['planning', 'draft', 'cancel_requested']),
  planning: new Set(['awaiting_plan_approval', 'queued', 'cancel_requested']),
  awaiting_plan_approval: new Set(['queued', 'planning', 'cancel_requested']),
  queued: new Set(['running', 'cancel_requested']),
  running: new Set([
    'waiting_for_customer',
    'waiting_for_approval',
    'pause_requested',
    'cancel_requested',
    'completed',
    'completed_with_gaps',
    'failed',
    'outcome_unknown',
  ]),
  waiting_for_customer: new Set(['queued', 'planning', 'cancel_requested']),
  waiting_for_approval: new Set(['queued', 'planning', 'cancel_requested']),
  pause_requested: new Set(['paused', 'outcome_unknown']),
  paused: new Set(['queued', 'cancel_requested']),
  cancel_requested: new Set(['cancelled', 'completed_with_gaps', 'outcome_unknown']),
  outcome_unknown: new Set(['queued', 'failed', 'waiting_for_customer']),
  cancelled: new Set(),
  completed: new Set(),
  completed_with_gaps: new Set(),
  failed: new Set(),
};

export class LifecycleError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'LifecycleError';
    this.code = code;
    this.details = details;
  }
}

function assertTransition(transitions, entity, from, to) {
  if (!transitions[from]?.has(to)) {
    throw new LifecycleError(`${entity}_transition_invalid`, { from, to });
  }
  return to;
}

export function transitionAgent(from, to) {
  return assertTransition(AGENT_TRANSITIONS, 'agent', from, to);
}

export function transitionRun(from, to) {
  return assertTransition(RUN_TRANSITIONS, 'run', from, to);
}

export function promoteAgent({ kind, state }) {
  if (kind !== 'temporary') {
    throw new LifecycleError('agent_already_persistent', { kind });
  }
  if (!['active', 'paused'].includes(state)) {
    throw new LifecycleError('agent_promotion_state_invalid', { state });
  }
  return { kind: 'persistent', state, expiresAt: null };
}

export function computeTemporaryAgentExpiry(originatingRunTerminalAt, ttlDays = 7) {
  const terminalAt = new Date(originatingRunTerminalAt);
  if (!Number.isFinite(terminalAt.getTime())) {
    throw new LifecycleError('originating_run_terminal_time_invalid');
  }
  if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > 90) {
    throw new LifecycleError('temporary_agent_ttl_invalid', { ttlDays });
  }
  return new Date(terminalAt.getTime() + ttlDays * 86_400_000);
}

export function validateScheduleLifetime({
  agentKind,
  agentExpiresAt,
  scheduleEndAt,
  scheduledFor,
  claimTime,
  maximumRunDurationSeconds,
}) {
  const endAt = new Date(scheduleEndAt);
  const occurrenceAt = new Date(scheduledFor);
  const claimedAt = new Date(claimTime);
  if (![endAt, occurrenceAt, claimedAt].every((value) => Number.isFinite(value.getTime()))) {
    throw new LifecycleError('schedule_time_invalid');
  }
  if (!Number.isInteger(maximumRunDurationSeconds) || maximumRunDurationSeconds < 1) {
    throw new LifecycleError('schedule_maximum_run_duration_invalid');
  }

  let bound = endAt;
  if (agentKind === 'temporary') {
    if (!agentExpiresAt) {
      throw new LifecycleError('temporary_agent_expiry_unknown');
    }
    const expiresAt = new Date(agentExpiresAt);
    if (!Number.isFinite(expiresAt.getTime())) {
      throw new LifecycleError('temporary_agent_expiry_invalid');
    }
    if (endAt.getTime() > expiresAt.getTime()) {
      throw new LifecycleError('schedule_outlives_temporary_agent');
    }
    bound = new Date(Math.min(endAt.getTime(), expiresAt.getTime()));
  }

  const earliestSafeStart = Math.max(occurrenceAt.getTime(), claimedAt.getTime());
  const deadline = new Date(earliestSafeStart + maximumRunDurationSeconds * 1000);
  if (deadline.getTime() > bound.getTime()) {
    throw new LifecycleError('schedule_run_cannot_finish_before_expiry', {
      deadline: deadline.toISOString(),
      bound: bound.toISOString(),
    });
  }

  return Object.freeze({
    runDeadline: deadline.toISOString(),
    grantExpiresAt: deadline.toISOString(),
    completionBound: bound.toISOString(),
  });
}
