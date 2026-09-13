/**
 * Organizations handler — CRUD for organization structures.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  applyRateLimitHeaders,
} from '../../api/_lib/rate-limit.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

async function handleList(admin, user) {
  const { data, error } = await admin
    .from('organizations')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return { status: 200, data: data || [] };
}

async function handleGet(admin, user, query) {
  const { id } = query;
  if (!id) return { status: 400, error: 'id is required' };
  const { data, error } = await admin
    .from('organizations')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { status: 404, error: 'Organization not found' };
  return { status: 200, data };
}

async function handleCreate(admin, user, body) {
  const { name, description, industry, org_type, parent_id, website, consilium_id } = body;
  if (!name) return { status: 400, error: 'name is required' };

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const { data, error } = await admin
    .from('organizations')
    .insert({
      user_id: user.id,
      name,
      slug,
      description: description || '',
      industry: industry || null,
      org_type: org_type || 'holding',
      parent_id: parent_id || null,
      website: website || null,
      consilium_id: consilium_id || null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return { status: 201, data };
}

/**
 * Create a Smart Request workspace and its Agent Hub authorization boundary in
 * one database transaction. The RPC validates every explicitly selected agent
 * against the authenticated owner, or deliberately assigns all active owned
 * agents (and seeds a compact starter catalogue for a fresh account).
 */
export async function handleCreateForGoal(admin, user, body) {
  const name = String(body?.name || '').trim();
  if (!name) return { status: 400, error: 'name is required' };

  const orgType = String(body?.org_type || 'holding');
  if (!['holding', 'subsidiary', 'division', 'department'].includes(orgType)) {
    return { status: 400, error: 'Invalid organization type' };
  }
  const agentIds = body?.agent_ids;
  if (agentIds != null && (!Array.isArray(agentIds) || agentIds.length > 100)) {
    return { status: 400, error: 'agent_ids must be an array with at most 100 entries' };
  }

  const { data, error } = await admin.rpc('create_goal_organization', {
    p_user_id: user.id,
    p_name: name,
    p_description: String(body?.description || '').slice(0, 4000),
    p_industry: body?.industry ? String(body.industry).slice(0, 255) : null,
    p_org_type: orgType,
    p_parent_id: body?.parent_id || null,
    p_website: body?.website ? String(body.website).slice(0, 500) : null,
    p_consilium_id: body?.consilium_id || null,
    p_agent_ids: Array.isArray(agentIds) && agentIds.length > 0 ? [...new Set(agentIds)] : null,
  });

  if (error) {
    const message = String(error.message || 'Workspace catalogue creation failed');
    if (message.includes('agent_catalogue')) {
      return {
        status: 409,
        error: 'An authorized Agent Hub catalogue is required before a goal can start',
      };
    }
    if (message.includes('invalid_parent') || message.includes('unauthorized_agent')) {
      return { status: 403, error: 'The requested organization or agent catalogue is not owned' };
    }
    throw error;
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.organization?.id || Number(result?.agent_count || 0) < 1) {
    return {
      status: 409,
      error: 'The workspace was not created with an authorized Agent Hub catalogue',
    };
  }
  return { status: 201, data: result };
}

async function handleUpdate(admin, user, body) {
  const { id, ...updates } = body;
  if (!id) return { status: 400, error: 'id is required' };

  // Rebuild slug if name changed
  if (updates.name) {
    updates.slug = updates.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await admin
    .from('organizations')
    .update(updates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single();

  if (error) throw error;
  return { status: 200, data };
}

/* ── Org-level financial aggregation ─────────────────────────────────── */
async function handleFinances(admin, user, query) {
  const { org_id } = query;
  const orgIds = [];
  if (org_id) {
    orgIds.push(org_id);
  } else {
    const { data: orgs } = await admin.from('organizations').select('id').eq('user_id', user.id);
    for (const o of orgs || []) orgIds.push(o.id);
  }
  if (!orgIds.length) return { status: 200, data: {} };

  const [{ data: orgAgents }, { data: orgTeams }] = await Promise.all([
    admin.from('org_agents').select('org_id, agent_id').eq('user_id', user.id).in('org_id', orgIds),
    admin.from('org_teams').select('org_id, team_id').eq('user_id', user.id).in('org_id', orgIds),
  ]);

  const allTeamIds = [...new Set((orgTeams || []).map((t) => t.team_id))];

  const teamToOrg = {};
  for (const row of orgTeams || []) {
    if (!teamToOrg[row.team_id]) teamToOrg[row.team_id] = [];
    teamToOrg[row.team_id].push(row.org_id);
  }

  // Goals linked via team_id OR direct org_id
  const { data: allGoals } = await admin
    .from('goals')
    .select('id, team_id, org_id, budget_usd, spent_usd')
    .eq('user_id', user.id);

  const goalTeamMap = {};
  const goalIds = [];
  for (const g of allGoals || []) {
    const viaTeam = g.team_id && allTeamIds.includes(g.team_id);
    const viaOrg = g.org_id && orgIds.includes(g.org_id);
    if (viaTeam || viaOrg) {
      goalTeamMap[g.id] = g;
      goalIds.push(g.id);
    }
  }

  function orgsForGoal(goal) {
    const set = new Set();
    if (goal.org_id && orgIds.includes(goal.org_id)) set.add(goal.org_id);
    if (goal.team_id) {
      for (const oid of teamToOrg[goal.team_id] || []) set.add(oid);
    }
    return [...set];
  }

  let events = [];
  if (goalIds.length) {
    const { data } = await admin
      .from('financial_events')
      .select('goal_id, event_type, amount_usd, direction, created_at')
      .eq('user_id', user.id)
      .in('goal_id', goalIds);
    events = data || [];
  }
  const { data: userEvents } = await admin
    .from('financial_events')
    .select('goal_id, event_type, amount_usd, direction, created_at')
    .eq('user_id', user.id)
    .is('goal_id', null);
  events = events.concat(userEvents || []);

  const result = {};
  for (const id of orgIds) {
    result[id] = {
      invested: 0,
      returned: 0,
      expenses: 0,
      token_spend: 0,
      ad_spend: 0,
      service_cost: 0,
      infrastructure: 0,
      net_profit: 0,
      roi: 0,
      budget: 0,
      spent: 0,
    };
  }

  for (const g of Object.values(goalTeamMap)) {
    for (const oid of orgsForGoal(g)) {
      if (result[oid]) {
        result[oid].budget += Number(g.budget_usd || 0);
        result[oid].spent += Number(g.spent_usd || 0);
      }
    }
  }

  for (const e of events) {
    const amt = Number(e.amount_usd || 0);
    const goal = goalTeamMap[e.goal_id];
    let orgsForEvent = [];
    if (goal) {
      orgsForEvent = orgsForGoal(goal);
    } else if (orgIds.length === 1) {
      orgsForEvent = [orgIds[0]];
    }
    for (const oid of orgsForEvent) {
      if (!result[oid]) continue;
      if (e.direction === 'in') {
        result[oid].returned += amt;
      } else {
        result[oid].invested += amt;
        result[oid].expenses += amt;
        if (e.event_type === 'token_spend') result[oid].token_spend += amt;
        if (e.event_type === 'ad_spend') result[oid].ad_spend += amt;
        if (e.event_type === 'service_cost') result[oid].service_cost += amt;
        if (e.event_type === 'infrastructure') result[oid].infrastructure += amt;
      }
    }
  }

  for (const id of orgIds) {
    const r = result[id];
    r.net_profit = r.returned - r.invested;
    r.roi =
      r.invested > 0 ? Number((((r.returned - r.invested) / r.invested) * 100).toFixed(1)) : 0;
  }

  return { status: 200, data: result };
}

/* ── Org-level activity aggregation ─────────────────────────────────── */
async function handleActivity(admin, user, query) {
  const { org_id } = query;
  if (!org_id) return { status: 400, error: 'org_id is required' };
  const limit = Math.min(Number(query?.limit) || 30, 100);

  const [{ data: orgAgents }, { data: orgTeams }] = await Promise.all([
    admin.from('org_agents').select('agent_id').eq('user_id', user.id).eq('org_id', org_id),
    admin.from('org_teams').select('team_id').eq('user_id', user.id).eq('org_id', org_id),
  ]);
  const agentIds = (orgAgents || []).map((a) => a.agent_id);
  const teamIds = (orgTeams || []).map((t) => t.team_id);

  const { data: orgGoals } = await admin
    .from('goals')
    .select('id, status, org_id, team_id')
    .eq('user_id', user.id);

  const scopedGoals = (orgGoals || []).filter((g) => {
    if (g.org_id === org_id) return true;
    if (g.team_id && teamIds.includes(g.team_id)) return true;
    return false;
  });
  const goalIds = scopedGoals.map((g) => g.id);
  const completedGoals = scopedGoals.filter((g) => g.status === 'completed').length;
  const activeGoals = scopedGoals.filter(
    (g) => g.status !== 'completed' && g.status !== 'cancelled'
  ).length;

  const scopeIds = new Set([org_id, ...agentIds, ...teamIds, ...goalIds]);

  const { data: auditLogsRaw } = await admin
    .from('audit_log')
    .select('id, action, entity, entity_id, details, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit * 4);

  const auditLogs = (auditLogsRaw || [])
    .filter((log) => {
      if (log.entity_id && scopeIds.has(log.entity_id)) return true;
      if (log.entity === 'Organization' && log.entity_id === org_id) return true;
      if (agentIds.includes(log.entity_id)) return true;
      if (typeof log.details === 'string' && log.details.includes(org_id)) return true;
      return false;
    })
    .slice(0, limit * 2);

  let goalLogs = [];
  if (goalIds.length) {
    const { data } = await admin
      .from('goal_log')
      .select('id, goal_id, event_type, details, cost_usd, created_at')
      .in('goal_id', goalIds)
      .order('created_at', { ascending: false })
      .limit(limit);
    goalLogs = data || [];
  }

  const items = [];
  for (const log of auditLogs) {
    items.push({
      type: 'audit',
      id: log.id,
      action: log.action,
      entity: log.entity,
      entity_id: log.entity_id,
      details: log.details,
      created_at: log.created_at,
    });
  }
  for (const log of goalLogs) {
    items.push({
      type: 'goal',
      id: log.id,
      goal_id: log.goal_id,
      event_type: log.event_type,
      details: log.details,
      cost_usd: log.cost_usd,
      created_at: log.created_at,
    });
  }
  items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const { count: dashboardCount } = await admin
    .from('saved_dashboards')
    .select('id', { count: 'exact', head: true })
    .eq('owner_user_id', user.id)
    .eq('is_template', false);

  const { data: dashboardPreview } = await admin
    .from('saved_dashboards')
    .select('id, title, description')
    .eq('owner_user_id', user.id)
    .eq('is_template', false)
    .order('updated_at', { ascending: false })
    .limit(2);

  return {
    status: 200,
    data: {
      items: items.slice(0, limit),
      counts: {
        tasks: activeGoals,
        active_goals: activeGoals,
        completed_goals: completedGoals,
        workflows: 0,
        knowledge_base: 0,
        agents: agentIds.length,
        teams: teamIds.length,
        dashboards: dashboardCount || 0,
      },
      previews: {
        workflows: [],
        dashboards: dashboardPreview || [],
      },
      scope_ids: [...scopeIds],
    },
  };
}

async function handleDelete(admin, user, body) {
  const { id } = body;
  if (!id) return { status: 400, error: 'id is required' };

  const { error } = await admin.from('organizations').delete().eq('id', id).eq('user_id', user.id);

  if (error) throw error;
  return { status: 200, data: { deleted: true } };
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized');

  const rl = checkRateLimit({
    key: getRateLimitIdentifier(req, user),
    limit: 60,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Rate limit exceeded');

  const admin = buildSupabaseAdminClient();
  const op = req.query?.op;
  const body = req.body || {};

  try {
    let result;
    switch (op) {
      case 'list':
        result = await handleList(admin, user);
        break;
      case 'get':
        result = await handleGet(admin, user, req.query);
        break;
      case 'create':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleCreate(admin, user, body);
        break;
      case 'create-for-goal':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleCreateForGoal(admin, user, body);
        break;
      case 'update':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleUpdate(admin, user, body);
        break;
      case 'delete':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleDelete(admin, user, body);
        break;
      case 'finances':
        result = await handleFinances(admin, user, req.query);
        break;
      case 'activity':
        result = await handleActivity(admin, user, req.query);
        break;
      default:
        return jsonError(res, 400, 'Invalid op');
    }
    if (result.error) return jsonError(res, result.status, result.error);
    return res.status(result.status).json(result.data);
  } catch (err) {
    return handleApiError(res, err, 'organizations');
  }
}
