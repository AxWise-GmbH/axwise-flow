/**
 * Per-loop-chain spend telemetry.
 *
 * Backed by the `chain_spend_v` view (see migration 135). Goals not in a
 * loop chain still appear as a single-element chain rooted on themselves.
 *
 * Exposed via:
 *   GET /api/goals?op=chain-spend&id=<goalId>
 *   (and joined into goals list responses if needed later)
 */

/**
 * Look up the chain root for a goal, then read the rollup.
 * Verifies user_id ownership before returning anything.
 */
export async function getChainSpend(admin, userId, goalId) {
  // 1. Resolve the chain root from the goal itself (auth check inline).
  const { data: goal, error } = await admin
    .from('goals')
    .select('id, user_id, loop_chain_root_id, loop_depth, loop_enabled, loop_paused, continuation_goal_id, parent_goal_id')
    .eq('id', goalId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!goal) return null;

  const chainRootId = goal.loop_chain_root_id || goal.id;

  // 2. Read the rollup view.
  const { data: row } = await admin
    .from('chain_spend_v')
    .select('chain_root_id, spent_usd, goal_count, max_depth, has_active_loop, has_paused_link')
    .eq('chain_root_id', chainRootId)
    .maybeSingle();

  return {
    chain_root_id: chainRootId,
    spent_usd: Number(row?.spent_usd || 0),
    goal_count: Number(row?.goal_count || 1),
    max_depth: Number(row?.max_depth || 0),
    has_active_loop: !!row?.has_active_loop,
    has_paused_link: !!row?.has_paused_link,
    this_goal: {
      id: goal.id,
      loop_depth: goal.loop_depth || 0,
      loop_enabled: goal.loop_enabled === true,
      loop_paused: goal.loop_paused === true,
      continuation_goal_id: goal.continuation_goal_id || null,
      parent_goal_id: goal.parent_goal_id || null,
    },
  };
}

/**
 * Batch variant: given a list of goal rows (each with loop_chain_root_id),
 * return a map of chain_root_id → rollup. Used by the goals-list handler so
 * each card can show its chain spend without N+1 queries.
 */
export async function getChainSpendsForGoals(admin, goals) {
  const chainRoots = [
    ...new Set((goals || []).map((g) => g?.loop_chain_root_id || g?.id).filter(Boolean)),
  ];
  if (chainRoots.length === 0) return {};
  const { data: rows } = await admin
    .from('chain_spend_v')
    .select('chain_root_id, spent_usd, goal_count, max_depth, has_active_loop, has_paused_link')
    .in('chain_root_id', chainRoots);
  const map = {};
  for (const r of rows || []) {
    map[r.chain_root_id] = {
      spent_usd: Number(r.spent_usd || 0),
      goal_count: Number(r.goal_count || 1),
      max_depth: Number(r.max_depth || 0),
      has_active_loop: !!r.has_active_loop,
      has_paused_link: !!r.has_paused_link,
    };
  }
  return map;
}
