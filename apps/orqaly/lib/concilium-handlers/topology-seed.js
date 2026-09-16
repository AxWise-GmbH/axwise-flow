/**
 * Consilium topology seed + layout (pure, no DB/React deps).
 *
 * Turns the org hierarchy (Organization -> Consilium -> Team -> Agent) into React
 * Flow nodes/edges and assigns a deterministic top-down tree layout, one tree per
 * organization laid out side by side. Used server-side to seed a user's diagram
 * (positions baked in). Kept dependency-free so it is trivially testable.
 */

// Layout constants (px).
export const NODE_W = 180;
export const NODE_H = 76;
export const H_GAP = 28;
export const V_GAP = 120;
export const TREE_GUTTER = 120;
const SLOT_W = NODE_W + H_GAP;

function capitalize(s) {
  const str = String(s || '');
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function edge(source, target) {
  return { id: `e-${source}__${target}`, source, target, type: 'smoothstep' };
}

/**
 * Build nodes + edges (without positions) from the assembled hierarchy data.
 *
 * @param {object} data
 * @param {Array}  data.orgs           organizations: { id, name, org_type, consilium_id, is_active }
 * @param {Array}  data.boards         concilium rows: { id, name, status, llms }
 * @param {object} data.orgTeamMap     { [orgId]: [teamId, ...] }
 * @param {Array}  data.teams          concilium_teams: { id, name, is_active }
 * @param {object} data.teamMembersMap { [teamId]: [memberId, ...] }
 * @param {Array}  data.members        concilium_members: { id, name, role, active, quarantined }
 * @returns {{ nodes: Array, edges: Array }}
 */
export function buildSeedGraph({
  orgs = [],
  boards = [],
  orgTeamMap = {},
  teams = [],
  teamMembersMap = {},
  members = [],
} = {}) {
  const nodes = [];
  const edges = [];
  const boardById = new Map(boards.map((b) => [String(b.id), b]));
  const teamById = new Map(teams.map((t) => [String(t.id), t]));
  const memberById = new Map(members.map((m) => [String(m.id), m]));

  for (const org of orgs) {
    if (!org || org.id == null) continue;
    const orgNodeId = `org-${org.id}`;
    const orgTeamIds = (orgTeamMap[org.id] || []).map(String);

    let orgAgentCount = 0;
    for (const tid of orgTeamIds) orgAgentCount += (teamMembersMap[tid] || []).length;

    nodes.push({
      id: orgNodeId,
      type: 'organization',
      data: {
        label: org.name || 'Organization',
        kind: 'organization',
        entityId: org.id,
        orgType: org.org_type || 'holding',
        subtitle: `${capitalize(org.org_type || 'org')} · ${plural(orgAgentCount, 'agent')}`,
        count: orgAgentCount,
        statusKey: org.is_active === false ? 'inactive' : 'active',
      },
    });

    // Consilium (the board this org reports to). Namespaced by org so a board
    // shared across orgs stays a distinct node -> each org is its own tree.
    const board = org.consilium_id ? boardById.get(String(org.consilium_id)) : null;
    let teamParentId = orgNodeId;
    if (board) {
      const consNodeId = `consilium-${org.id}-${board.id}`;
      const llmCount = Array.isArray(board.llms) ? board.llms.length : 0;
      nodes.push({
        id: consNodeId,
        type: 'consilium',
        data: {
          label: board.name || 'Consilium',
          kind: 'consilium',
          entityId: board.id,
          subtitle: `${capitalize(board.status || 'active')} · ${plural(llmCount, 'LLM')}`,
          count: orgTeamIds.length,
          statusKey: board.status || 'active',
        },
      });
      edges.push(edge(orgNodeId, consNodeId));
      teamParentId = consNodeId;
    }

    // Teams held by the org, then their members as agent leaves.
    for (const tid of orgTeamIds) {
      const team = teamById.get(tid);
      if (!team) continue;
      const teamNodeId = `team-${org.id}-${tid}`;
      const memberIds = (teamMembersMap[tid] || []).map(String);
      nodes.push({
        id: teamNodeId,
        type: 'team',
        data: {
          label: team.name || 'Team',
          kind: 'team',
          entityId: tid,
          subtitle: `Team · ${plural(memberIds.length, 'agent')}`,
          count: memberIds.length,
          statusKey: team.is_active === false ? 'inactive' : 'active',
        },
      });
      edges.push(edge(teamParentId, teamNodeId));

      for (const mid of memberIds) {
        const m = memberById.get(mid);
        if (!m) continue; // drop unresolved members so counts stay consistent
        const agentNodeId = `agent-${org.id}-${tid}-${mid}`;
        const statusKey = m.quarantined
          ? 'quarantined'
          : m.active === false
            ? 'inactive'
            : 'active';
        nodes.push({
          id: agentNodeId,
          type: 'agent',
          data: {
            label: m.name || capitalize(m.role || 'agent'),
            kind: 'agent',
            entityId: mid,
            conciliumId: m.concilium_id || null,
            role: m.role || 'agent',
            subtitle: capitalize(m.role || 'agent'),
            statusKey,
          },
        });
        edges.push(edge(teamNodeId, agentNodeId));
      }
    }
  }

  return { nodes, edges };
}

/**
 * Assign deterministic top-down tree positions, one tree per root, side by side.
 * Roots are nodes with no incoming edge. Returns new nodes with `position` set.
 *
 * @param {Array} nodes
 * @param {Array} edges
 * @returns {Array} nodes with { position: { x, y } }
 */
export function layoutForest(nodes = [], edges = []) {
  const children = new Map(); // id -> [childId] in edge order
  const hasParent = new Set();
  for (const e of edges) {
    if (!children.has(e.source)) children.set(e.source, []);
    children.get(e.source).push(e.target);
    hasParent.add(e.target);
  }

  const positions = {};
  let cursorX = 0;

  const roots = nodes.filter((n) => !hasParent.has(n.id));
  for (const root of roots) {
    let leaf = 0;
    const local = {};
    const seen = new Set();
    const assign = (id, depth) => {
      if (seen.has(id)) return local[id] ? local[id].x : 0; // cycle guard
      seen.add(id);
      const kids = children.get(id) || [];
      const y = depth * V_GAP;
      let x;
      if (kids.length === 0) {
        x = leaf * SLOT_W;
        leaf += 1;
      } else {
        const kidXs = kids.map((k) => assign(k, depth + 1));
        x = (kidXs[0] + kidXs[kidXs.length - 1]) / 2;
      }
      local[id] = { x, y };
      return x;
    };
    assign(root.id, 0);

    const xs = Object.values(local).map((p) => p.x);
    const minX = xs.length ? Math.min(...xs) : 0;
    const maxX = xs.length ? Math.max(...xs) : 0;
    for (const [id, p] of Object.entries(local)) {
      positions[id] = { x: p.x - minX + cursorX, y: p.y };
    }
    cursorX += maxX - minX + NODE_W + TREE_GUTTER;
  }

  return nodes.map((n) => ({ ...n, position: positions[n.id] || { x: 0, y: 0 } }));
}

/**
 * Convenience: build the seed graph and lay it out. Returns positioned nodes/edges.
 */
export function buildSeededTopology(data) {
  const { nodes, edges } = buildSeedGraph(data);
  return { nodes: layoutForest(nodes, edges), edges };
}
