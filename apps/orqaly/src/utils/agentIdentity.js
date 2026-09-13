/**
 * Resolve a goal's agent (a team roster member, a Work Log assignee, or a Report
 * agent) to a real human identity using the agent profiles. Falls back to the
 * member's own name/role when no profile matches, so it never hides data.
 *
 * Profiles come from agentProfileService.listProfiles() (DB) or
 * PREDEFINED_AGENT_PROFILES, with fields: agent_id, display_name, job_title,
 * role, agentName. Matching mirrors useMyAgents: id -> role/job_title -> name.
 */

const lc = (v) =>
  String(v || '')
    .trim()
    .toLowerCase();

/** Build lookup maps once for a set of profiles. */
export function buildProfileIndex(profiles = []) {
  const byId = new Map();
  const byRole = new Map();
  const byName = new Map();
  for (const p of profiles) {
    if (!p) continue;
    if (p.agent_id) byId.set(String(p.agent_id), p);
    if (p.job_title) byRole.set(lc(p.job_title), p);
    if (p.role) byRole.set(lc(p.role), p);
    if (p.agentName) byName.set(lc(p.agentName), p);
    if (p.display_name) byName.set(lc(p.display_name), p);
  }
  return { byId, byRole, byName };
}

/** Find the best-matching profile for a member object or a bare name string. */
function matchProfile(member, index) {
  if (!index) return null;
  const m = typeof member === 'string' ? { name: member } : member || {};
  const id = m.id || m.agent_id;
  if (id && index.byId.has(String(id))) return index.byId.get(String(id));
  for (const r of [m.role, m.category, m.metadata?.required_role]) {
    if (r && index.byRole.has(lc(r))) return index.byRole.get(lc(r));
  }
  if (m.name && index.byName.has(lc(m.name))) return index.byName.get(lc(m.name));
  // A bare role passed as the name (e.g. "Marketing Project Manager").
  if (m.name && index.byRole.has(lc(m.name))) return index.byRole.get(lc(m.name));
  return null;
}

/**
 * Resolve { name, position, profile }. `memberOrName` may be a roster member
 * object or a plain agent name string.
 */
export function resolveAgentIdentity(memberOrName, index) {
  const m = typeof memberOrName === 'string' ? { name: memberOrName } : memberOrName || {};
  const profile = matchProfile(m, index);
  const name = profile?.display_name || m.name || '';
  const position =
    profile?.job_title || m.role || m.category || m.metadata?.required_role || profile?.role || '';
  return { name, position, profile: profile || null };
}

/** Convenience: "Name (Position)", or just whichever exists. */
export function formatAgentIdentity(memberOrName, index) {
  const { name, position } = resolveAgentIdentity(memberOrName, index);
  if (name && position && lc(name) !== lc(position)) return `${name} (${position})`;
  return name || position || '';
}
