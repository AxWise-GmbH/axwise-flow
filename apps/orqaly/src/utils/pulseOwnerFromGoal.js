/**
 * [module: frontend]
 * Derive pulse owner (agent / team / organization) from a goal row.
 */
export function derivePulseOwnerFromGoal(goal) {
  if (!goal) return null;

  if (goal.agent_team_id) {
    return {
      ownerType: 'team',
      ownerId: String(goal.agent_team_id),
      ownerName: goal.agent_team_name || goal.team_name || 'Team',
    };
  }
  if (goal.executor_type === 'team' && goal.executor_id) {
    return {
      ownerType: 'team',
      ownerId: String(goal.executor_id),
      ownerName: goal.executor_name || goal.team_name || 'Team',
    };
  }
  if (goal.team_id) {
    return {
      ownerType: 'team',
      ownerId: String(goal.team_id),
      ownerName: goal.team_name || 'Team',
    };
  }
  if (goal.org_id) {
    return {
      ownerType: 'organization',
      ownerId: String(goal.org_id),
      ownerName: goal.org_name || goal.organization_name || 'Organization',
    };
  }

  const agentId =
    goal.executor_type === 'agent' && goal.executor_id
      ? goal.executor_id
      : goal.lead_agent_id || goal.agent_id || goal.data?.lead_agent_id || goal.id;
  return {
    ownerType: 'agent',
    ownerId: String(agentId),
    ownerName: goal.executor_name || goal.lead_agent_name || goal.title || 'Agent',
  };
}
