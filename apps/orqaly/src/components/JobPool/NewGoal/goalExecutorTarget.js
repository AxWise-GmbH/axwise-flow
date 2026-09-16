/**
 * One place that turns a picked target into the executor fields a goal is
 * created with.
 *
 * The server accepts four executor types (organization | consilium | team |
 * agent) and validates them independently of each other, so a payload that sets
 * `executor_type: 'consilium'` without `concilium_id` silently becomes an
 * org-wide goal. Keeping the mapping here means the Communicator's org command
 * and the Simple goal composer cannot disagree about what "send this to the
 * marketing team" writes.
 *
 * A team lead is an agent, not a team: `executor_type: 'agent'` with the lead's
 * id forms a one-member team in team-formation, whereas 'team' would hand the
 * goal to the whole roster.
 */

/** No target picked — the whole workspace runs it. This is the existing default. */
export const DEFAULT_EXECUTOR_PAYLOAD = Object.freeze({
  executor_type: 'organization',
  executor_id: null,
  concilium_id: null,
});

/**
 * @param {{type: string, id: string}|null} target
 * @returns {{executor_type: string, executor_id: string|null, concilium_id: string|null}}
 */
export function executorPayloadForTarget(target) {
  if (!target?.type || !target?.id) return { ...DEFAULT_EXECUTOR_PAYLOAD };

  switch (target.type) {
    case 'team':
      return { executor_type: 'team', executor_id: target.id, concilium_id: null };
    case 'team_lead':
    case 'agent':
      return { executor_type: 'agent', executor_id: target.id, concilium_id: null };
    case 'consilium':
      return { executor_type: 'consilium', executor_id: null, concilium_id: target.id };
    default:
      return { ...DEFAULT_EXECUTOR_PAYLOAD };
  }
}

/** True when the goal is going somewhere narrower than the whole workspace. */
export function isScopedExecutorTarget(target) {
  return executorPayloadForTarget(target).executor_type !== 'organization';
}
