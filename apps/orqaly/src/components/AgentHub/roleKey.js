/**
 * Client-side role identity key.
 *
 * Must stay byte-identical to roleIdentityKey() in
 * lib/goal-handlers/team-assigner.js. The Enhancement tab writes conditioning
 * to a scope named by this key, and execute-task.js reads it back using the
 * server function. If the two drift, the UI edits a scope execution never
 * loads and the conditioning silently does nothing.
 *
 * AgentEnhancementTab.test.jsx asserts the two agree across real agent names.
 */
export function roleKeyOf(agent) {
  return String(agent?.category || agent?.agent_type || agent?.name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
