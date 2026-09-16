/**
 * Usage directory handler (consolidated under api/ops).
 * GET /api/ops?path=usage-directory&entity=goal|agent|team|consilium|organization&from=&to=&limit=&search=&status=
 *
 * Lists every entity of a type the caller owns, each with its LLM usage rollup
 * (calls / input+output+total tokens / cost) plus metadata and child counts,
 * for the directory cards/tables view. Always scoped to the caller's user_id.
 *
 * Reuses aggregateUsage + resolveRange from usage-analytics.js. Usage rollups
 * reflect attributed activity: rows whose entity column is null are not counted,
 * so per-entity numbers grow as new attributed activity is logged. Entity
 * metadata and counts are live immediately.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError } from '../../api/_lib/errors.js';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  applyRateLimitHeaders,
} from '../../api/_lib/rate-limit.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { usageDirectoryQuerySchema } from '../../api/_lib/validate.js';
import { aggregateUsage, resolveRange, matchesUsageFilters } from './usage-analytics.js';

const MAX_ROWS = 50_000;

// llm_usage column each entity rolls up on.
const ENTITY_COLUMN = {
  goal: 'goal_id',
  organization: 'organization_id',
  team: 'team_id',
  consilium: 'consilium_id',
  agent: 'agent_id',
};

/** Group rows by a key column into a Map<keyValue, rows[]> (skips null keys). */
export function groupBy(rows, key) {
  const map = new Map();
  for (const r of rows) {
    const k = r[key];
    if (k == null || k === '') continue;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(r);
  }
  return map;
}

/** Shape aggregateUsage totals into the directory's usage object. */
export function toUsage(rows) {
  const t = aggregateUsage(rows || []).totals;
  return {
    calls: t.calls,
    inputTokens: t.promptTokens,
    outputTokens: t.completionTokens,
    totalTokens: t.tokens,
    cachedTokens: t.cachedTokens,
    cost: t.cost,
    errorCalls: t.errorCalls,
    errorRate: t.errorRate,
    avgDurationMs: t.avgDurationMs,
  };
}

/** Distinct non-null values of a field across rows. */
function distinct(rows, field) {
  const s = new Set();
  for (const r of rows) if (r[field] != null && r[field] !== '') s.add(r[field]);
  return s;
}

const byCostDesc = (a, b) => (b.usage?.cost || 0) - (a.usage?.cost || 0);

export function applySearch(items, search) {
  if (!search) return items;
  const q = search.toLowerCase();
  return items.filter((i) => `${i.name || ''} ${i.id || ''}`.toLowerCase().includes(q));
}

// ── Per-entity builders ──────────────────────────────────────────

async function buildGoals(admin, userId, usageRows, goals, { status }) {
  const usageByGoal = groupBy(usageRows, 'goal_id');

  // Resolve related names in bulk.
  const orgIds = [...new Set(goals.map((g) => g.org_id).filter(Boolean))];
  const conIds = [...new Set(goals.map((g) => g.concilium_id).filter(Boolean))];
  const teamIds = [...new Set(goals.flatMap((g) => [g.agent_team_id, g.team_id]).filter(Boolean))];
  const [orgNames, conNames, teamNames] = await Promise.all([
    nameMap(admin, 'organizations', orgIds, userId),
    nameMap(admin, 'concilium', conIds, userId),
    teamNameMap(admin, teamIds, userId),
  ]);

  let items = goals.map((g) => {
    const rows = usageByGoal.get(g.id) || [];
    const teamId = g.agent_team_id || g.team_id || null;
    const completed = g.status === 'completed' || g.status === 'failed' || g.status === 'cancelled';
    const endedAt = completed ? g.updated_at : null;
    const durationMs = endedAt ? Math.max(0, new Date(endedAt) - new Date(g.created_at)) : null;
    return {
      id: g.id,
      name: g.title || 'Untitled goal',
      status: g.status,
      createdAt: g.created_at,
      startedAt: g.created_at,
      endedAt,
      durationMs,
      organization: g.org_id ? { id: g.org_id, name: orgNames.get(g.org_id) || null } : null,
      consilium: g.concilium_id ? { id: g.concilium_id, name: conNames.get(g.concilium_id) || null } : null,
      team: teamId ? { id: teamId, name: teamNames.get(teamId) || null } : null,
      agentsUsed: distinct(rows, 'agent_id').size,
      budgetUsd: Number(g.budget_usd || 0),
      spentUsd: Number(g.spent_usd || 0),
      usage: toUsage(rows),
      link: `/goals/${g.id}`,
    };
  });
  if (status) items = items.filter((i) => i.status === status);
  return items;
}

async function buildOrganizations(admin, userId, usageRows, allGoals) {
  const { data: orgs } = await admin
    .from('organizations')
    .select('id, name, is_active, org_type, parent_id, consilium_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  const list = orgs || [];
  const parentNames = new Map(list.map((o) => [o.id, o.name]));
  const usageByOrg = groupBy(usageRows, 'organization_id');
  const subOrgCount = new Map();
  for (const o of list) if (o.parent_id) subOrgCount.set(o.parent_id, (subOrgCount.get(o.parent_id) || 0) + 1);

  return list.map((o) => {
    const rows = usageByOrg.get(o.id) || [];
    const orgGoals = allGoals.filter((g) => g.org_id === o.id);
    return {
      id: o.id,
      name: o.name,
      status: o.is_active === false ? 'inactive' : 'active',
      orgType: o.org_type || null,
      createdAt: o.created_at,
      parentCompany: o.parent_id ? { id: o.parent_id, name: parentNames.get(o.parent_id) || null } : null,
      counts: {
        goals: orgGoals.length,
        goalsCompleted: orgGoals.filter((g) => g.status === 'completed').length,
        teams: distinct(orgGoals, 'agent_team_id').size + distinct(orgGoals, 'team_id').size,
        consiliums: distinct(orgGoals, 'concilium_id').size,
        agents: distinct(rows, 'agent_id').size,
        subOrgs: subOrgCount.get(o.id) || 0,
      },
      usage: toUsage(rows),
      link: null,
    };
  });
}

async function buildConsilium(admin, userId, usageRows, allGoals) {
  const { data: boards } = await admin
    .from('concilium')
    .select('id, name, status, started_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  const list = boards || [];
  const usageByCon = groupBy(usageRows, 'consilium_id');
  // agents per board (roster) - best effort, single query.
  const agentCount = await childCount(admin, 'concilium_agents', 'board_id', list.map((b) => b.id), userId);

  return list.map((b) => {
    const rows = usageByCon.get(b.id) || [];
    const conGoals = allGoals.filter((g) => g.concilium_id === b.id);
    return {
      id: b.id,
      name: b.name || 'Unnamed consilium',
      status: b.status || 'active',
      createdAt: b.created_at,
      startedAt: b.started_at || b.created_at,
      counts: {
        goals: conGoals.length,
        goalsCompleted: conGoals.filter((g) => g.status === 'completed').length,
        teams: distinct(conGoals, 'team_id').size + distinct(conGoals, 'agent_team_id').size,
        agents: agentCount.get(b.id) || distinct(rows, 'agent_id').size,
      },
      usage: toUsage(rows),
      link: null,
    };
  });
}

async function buildTeams(admin, userId, usageRows, allGoals) {
  // Teams live in two tables (agent workforce + concilium governance); merge both.
  const [agentTeams, conTeams] = await Promise.all([
    admin.from('agent_teams').select('id, name, is_active, created_at').eq('user_id', userId),
    admin.from('concilium_teams').select('id, name, created_at').eq('user_id', userId).then((r) => r, () => ({ data: [] })),
  ]);
  const list = [
    ...(agentTeams.data || []).map((t) => ({ ...t, kind: 'agent_team' })),
    ...((conTeams.data || []).map((t) => ({ ...t, is_active: true, kind: 'concilium_team' }))),
  ];
  const usageByTeam = groupBy(usageRows, 'team_id');
  const memberCount = await childCount(admin, 'agent_team_members', 'team_id', list.map((t) => t.id), userId);

  return list.map((t) => {
    const rows = usageByTeam.get(t.id) || [];
    const teamGoals = allGoals.filter((g) => g.agent_team_id === t.id || g.team_id === t.id);
    return {
      id: t.id,
      name: t.name || 'Unnamed team',
      status: t.is_active === false ? 'inactive' : 'active',
      createdAt: t.created_at,
      counts: {
        members: memberCount.get(t.id) || distinct(rows, 'agent_id').size,
        goals: teamGoals.length,
        goalsCompleted: teamGoals.filter((g) => g.status === 'completed').length,
        agents: distinct(rows, 'agent_id').size,
      },
      usage: toUsage(rows),
      link: null,
    };
  });
}

export function buildAgents(usageRows, allGoals) {
  // Agents are keyed on the attribution dimension (agent_id + agent_name).
  const goalStatus = new Map(allGoals.map((g) => [g.id, g.status]));
  const usageByAgent = groupBy(usageRows, 'agent_id');
  const items = [];
  for (const [agentId, rows] of usageByAgent.entries()) {
    const name = rows.find((r) => r.agent_name)?.agent_name || agentId;
    const goalIds = distinct(rows, 'goal_id');
    let goalsCompleted = 0;
    for (const gid of goalIds) if (goalStatus.get(gid) === 'completed') goalsCompleted += 1;
    items.push({
      id: agentId,
      name,
      status: null,
      createdAt: null,
      counts: { goalsUsedIn: goalIds.size, goalsCompleted },
      usage: toUsage(rows),
      link: null,
    });
  }
  return items;
}

// ── Small bulk helpers ───────────────────────────────────────────

/** id -> name map for a table, scoped to the user. Best-effort. */
async function nameMap(admin, table, ids, userId) {
  const map = new Map();
  if (!ids.length) return map;
  try {
    const { data } = await admin.from(table).select('id, name').in('id', ids).eq('user_id', userId);
    for (const row of data || []) map.set(row.id, row.name);
  } catch { /* optional */ }
  return map;
}

/** Team name map across agent_teams + concilium_teams. */
async function teamNameMap(admin, ids, userId) {
  const map = new Map();
  if (!ids.length) return map;
  const tables = ['agent_teams', 'concilium_teams'];
  await Promise.all(tables.map(async (t) => {
    try {
      const { data } = await admin.from(t).select('id, name').in('id', ids).eq('user_id', userId);
      for (const row of data || []) if (!map.has(row.id)) map.set(row.id, row.name);
    } catch { /* optional */ }
  }));
  return map;
}

/** parentId -> count of child rows, scoped to user. Best-effort single query. */
async function childCount(admin, table, parentCol, parentIds, userId) {
  const map = new Map();
  if (!parentIds.length) return map;
  try {
    const { data } = await admin.from(table).select(`id, ${parentCol}`).in(parentCol, parentIds).eq('user_id', userId);
    for (const row of data || []) {
      const p = row[parentCol];
      map.set(p, (map.get(p) || 0) + 1);
    }
  } catch { /* optional */ }
  return map;
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonError(res, 405, 'Method not allowed');

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized. Sign in and retry.');

  const rl = checkRateLimit({ key: getRateLimitIdentifier(req, user.id), limit: 20, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

  const parsed = usageDirectoryQuerySchema.safeParse(req.query || {});
  if (!parsed.success) {
    return jsonError(res, 400, parsed.error.issues?.[0]?.message || 'Invalid query');
  }
  const { entity, from, to, limit, search, status, provider, model, source } = parsed.data;
  const { start, end } = resolveRange(from, to);

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Database connection not configured');

  // ── llm_usage rows for this owner + range (grouped per entity below) ──
  const { data: usageRows, error: usageErr } = await admin
    .from('llm_usage')
    .select('goal_id, organization_id, team_id, consilium_id, agent_id, agent_name, provider, model, source, prompt_tokens, completion_tokens, total_tokens, cached_tokens, estimated_cost_usd, duration_ms, status, created_at')
    .eq('user_id', user.id)
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .limit(MAX_ROWS);
  if (usageErr) return jsonError(res, 500, usageErr.message);
  const rows = (usageRows || []).filter((r) => matchesUsageFilters(r, { provider, model, source }));

  // ── owner goals power most entity counts; fetch once ──
  const { data: goalRows } = await admin
    .from('goals')
    .select('id, title, status, org_id, concilium_id, agent_team_id, team_id, budget_usd, spent_usd, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);
  const allGoals = goalRows || [];

  let items = [];
  try {
    if (entity === 'goal') items = await buildGoals(admin, user.id, rows, allGoals, { status });
    else if (entity === 'organization') items = await buildOrganizations(admin, user.id, rows, allGoals);
    else if (entity === 'consilium') items = await buildConsilium(admin, user.id, rows, allGoals);
    else if (entity === 'team') items = await buildTeams(admin, user.id, rows, allGoals);
    else if (entity === 'agent') items = buildAgents(rows, allGoals);
  } catch (err) {
    return jsonError(res, 500, err.message);
  }

  items = applySearch(items, search).sort(byCostDesc).slice(0, limit);

  const totals = items.reduce(
    (acc, i) => {
      acc.calls += i.usage?.calls || 0;
      acc.totalTokens += i.usage?.totalTokens || 0;
      acc.cost += i.usage?.cost || 0;
      return acc;
    },
    { calls: 0, totalTokens: 0, cost: 0 },
  );
  totals.cost = Number(totals.cost.toFixed(6));

  return res.status(200).json({
    entity,
    range: { from: start.toISOString(), to: end.toISOString() },
    count: items.length,
    items,
    totals,
    meta: {
      source: 'llm_usage_directory',
      generatedAt: new Date().toISOString(),
      note: 'Usage reflects attributed activity; per-entity totals grow as new activity is logged. Metadata and counts are live.',
    },
  });
}
