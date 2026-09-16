/**
 * Agent long-term-memory activation flag (frontend mirror).
 *
 * Memory is active by default: an agent is connected to its accumulated
 * knowledge base unless explicitly deactivated. Deactivation sets
 * `metadata.long_term_memory_enabled = false`; an unset/undefined flag counts
 * as ON. Only a strict `false` turns it off.
 *
 * This mirrors lib/_shared/agent-memory.js — the frontend cannot import server
 * code (CLAUDE.md rule 3), so the two must be kept in sync.
 *
 * @param {object|null|undefined} metadata - agent.metadata
 * @returns {boolean}
 */
export const isAgentMemoryEnabled = (metadata) => metadata?.long_term_memory_enabled !== false;

/** Frontend mirror of lib/_shared/agent-memory.js#agentMemoryOwnerId. */
export function agentMemoryOwnerId(agent) {
  const rowId = String(agent?._supabase_id || agent?.id || '').trim();
  const metadataId = String(agent?.metadata?.agent_id || agent?.agent_id || '').trim();
  return metadataId.startsWith('predefined:') ? metadataId : rowId;
}
