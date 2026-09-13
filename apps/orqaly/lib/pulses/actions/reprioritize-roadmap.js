/**
 * Executive pulse: re-rank the roadmap on the chain head goal based on
 * recent KPI signals. Minimal implementation — just records the action;
 * the real LLM-driven re-ranking is a Phase 6 polish.
 */
export async function handleReprioritizeRoadmap(admin, pulse, _ctx) {
  if (!pulse.goal_chain_root_id) return { status: 'skipped', reason: 'no chain root' };

  // Find the current head of the chain (latest goal in the chain).
  const { data: head } = await admin
    .from('goals')
    .select('id, title, data, status')
    .eq('loop_chain_root_id', pulse.goal_chain_root_id)
    .order('loop_depth', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!head) return { status: 'skipped', reason: 'chain head not found' };

  // Stamp a reprioritization event for now. A real implementation would
  // call an LLM with KPI signals + memory and rewrite head.data.project_overview.roadmap.
  await admin.from('goal_log').insert({
    goal_id: head.id,
    event_type: 'roadmap_reprioritized',
    details: { source: 'pulse', pulseId: pulse.id, at: new Date().toISOString() },
  });
  return { status: 'done', goalId: head.id };
}
