/**
 * Knowledge-base scoping helpers.
 *
 * KB documents can be tagged with the organization + consilium they belong to
 * (knowledge_documents.organization_id / concilium_id — migration 167). When an
 * agent / team / consilium produces a document while working a goal, stamp it
 * with the goal's org + board so it surfaces under that organization in the
 * Knowledge Base. Mirrors how llm_usage rows are scoped in
 * lib/goal-handlers/_helpers.js (recordLlmUsage / recordStageLlmUsage).
 *
 * Both fields are nullable: a missing org/board simply leaves the document
 * unassigned (same as a user-created note), so callers can stamp unconditionally.
 */

const EMPTY = { organization_id: null, concilium_id: null };

/**
 * Scope from a goal object already in memory. The goal must have been selected
 * with org_id / concilium_id (goal-orchestrator stages load the full row).
 * @param {object|null} goal
 * @returns {{ organization_id: string|null, concilium_id: string|null }}
 */
export function orgScopeFromGoal(goal) {
  if (!goal) return { ...EMPTY };
  return {
    organization_id: goal.org_id || null,
    concilium_id: goal.concilium_id || null,
  };
}

/**
 * Scope from a goal id via a single best-effort lookup — for write sites that
 * only have the goal id in scope (agent job/task/pulse handlers). Never throws;
 * returns nulls if the goal cannot be read.
 * @param {object} admin - Supabase admin client
 * @param {string|null} goalId
 * @param {string|null} userId - durable owner of the goal
 * @returns {Promise<{ organization_id: string|null, concilium_id: string|null }>}
 */
export async function resolveGoalKbScope(admin, goalId, userId) {
  if (!admin || !goalId || !userId) return { ...EMPTY };
  try {
    const { data } = await admin
      .from('goals')
      .select('org_id, concilium_id')
      .eq('id', goalId)
      .eq('user_id', userId)
      .single();
    return {
      organization_id: data?.org_id || null,
      concilium_id: data?.concilium_id || null,
    };
  } catch {
    return { ...EMPTY };
  }
}

/**
 * Scope from an agent's static organization assignment (org_agents junction) —
 * for agent-scoped writes that happen outside a goal (e.g. chat memory). The
 * consilium is taken from the resolved organization (organizations.consilium_id).
 * When an agent belongs to several orgs the earliest assignment wins. Never throws.
 * @param {object} admin - Supabase admin client
 * @param {string|null} agentId
 * @param {string|null} userId
 * @returns {Promise<{ organization_id: string|null, concilium_id: string|null }>}
 */
export async function resolveAgentKbScope(admin, agentId, userId) {
  if (!admin || !agentId || !userId) return { ...EMPTY };
  try {
    const { data: link } = await admin
      .from('org_agents')
      .select('org_id')
      .eq('agent_id', agentId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const organizationId = link?.org_id || null;
    if (!organizationId) return { ...EMPTY };
    const { data: org } = await admin
      .from('organizations')
      .select('consilium_id')
      .eq('id', organizationId)
      .eq('user_id', userId)
      .maybeSingle();
    return { organization_id: organizationId, concilium_id: org?.consilium_id || null };
  } catch {
    return { ...EMPTY };
  }
}
