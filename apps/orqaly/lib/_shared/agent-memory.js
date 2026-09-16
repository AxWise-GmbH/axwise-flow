/**
 * [module: shared]
 * Agent long-term-memory activation flag.
 *
 * Memory is active by default: agents are connected to their accumulated
 * knowledge base unless the owner has explicitly deactivated it. Deactivation
 * sets `metadata.long_term_memory_enabled = false`; an unset/undefined flag
 * (e.g. an agent that predates this feature or was never toggled) counts as ON.
 *
 * Only an explicit `false` severs the connection, so this is the single source
 * of truth for the default across backend injection points (agent chat, member
 * chat / run-llm jobs). The frontend mirrors the same rule inline (it cannot
 * import server code — CLAUDE.md rule 3).
 */
export const isAgentMemoryEnabled = (metadata) => metadata?.long_term_memory_enabled !== false;

/**
 * Stable knowledge owner key for a persisted agent.
 *
 * Catalogue agents intentionally keep their `predefined:<role>` identity so
 * reseeding preserves memory. Custom metadata is user-controlled and may
 * collide, so every custom agent is isolated by its immutable agents row UUID.
 */
export function agentMemoryOwnerId(agent) {
  const rowId = String(agent?.id || agent?._supabase_id || '').trim();
  const metadataId = String(agent?.metadata?.agent_id || agent?.agent_id || '').trim();
  return metadataId.startsWith('predefined:') ? metadataId : rowId;
}
