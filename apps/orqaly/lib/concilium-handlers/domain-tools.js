/**
 * Domain tools handler: exposes platform features as callable tools for agents.
 *
 * POST /api/concilium?path=domain-tools
 * Body: { tool_id, params }
 * Auth: tracking_token (agent) OR JWT (user)
 *
 * Tools: partners:read, partners:write, finances:read, dashboard:read,
 *        campaigns:read, campaigns:write, injection:read, injection:write,
 *        reports:read, reports:submit
 *
 * Enforces: scope, rate limits, response size limits, audit logging, change log.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { checkRateLimit, applyRateLimitHeaders, getRateLimitIdentifier } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { enforceAgentToolScope, resolveAgentFromToken } from './agent-config-validator.js';
import { checkConciliumRateLimit } from './rate-limit-check.js';
import { recordUsage } from './cost-tracker.js';
import { fetchWithRetry } from '../../api/_lib/fetch.js';

const log = createLogger('domain-tools');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_RESPONSE_CHARS = 50000;

// ── Tool router ─────────────────────────────────────────────────

const TOOL_HANDLERS = {
  'partners:read': handlePartnersRead,
  'partners:write': handlePartnersWrite,
  'finances:read': handleFinancesRead,
  'dashboard:read': handleDashboardRead,
  'campaigns:read': handleCampaignsRead,
  'campaigns:write': handleCampaignsWrite,
  'injection:read': handleInjectionRead,
  'injection:write': handleInjectionWrite,
  'reports:read': handleReportsRead,
  'reports:submit': handleReportsSubmit,
};

export default async function handler(req, res) {
  const safeReq = req && typeof req === 'object' ? req : {};
  if (!safeReq.headers) safeReq.headers = {};
  cors(res, safeReq);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return jsonError(res, 405, 'POST only');

  try {
    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Database not configured');

    // Auth: try tracking_token first, then JWT
    let userId = null;
    let agentId = null;
    let agentContext = null;

    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    const { tool_id, params = {} } = body;

    if (!tool_id) return jsonError(res, 400, 'tool_id is required');

    const toolHandler = TOOL_HANDLERS[tool_id];
    if (!toolHandler) return jsonError(res, 400, `Unknown tool: ${tool_id}`);

    // Try tracking_token auth (agent calling)
    const trackingToken = safeReq.headers['x-tracking-token'] || params.tracking_token;
    if (trackingToken) {
      const { agent } = await resolveAgentFromToken(admin, trackingToken);
      if (!agent) return jsonError(res, 401, 'Invalid tracking token');
      userId = agent.user_id;
      agentId = agent.id;
      agentContext = agent;
    } else {
      // JWT auth (user calling)
      const token = getBearerToken(safeReq);
      const user = await verifySupabaseToken(token);
      if (!user) return jsonError(res, 401, 'Unauthorized');
      userId = user.id;
    }

    // Rate limit
    const rlKey = getRateLimitIdentifier(req, userId);
    const rl = checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

    // Agent scope enforcement
    if (agentId) {
      const scope = await enforceAgentToolScope(admin, agentId, tool_id);
      if (!scope.allowed) {
        log.warn(req, 'domain_tools.scope_denied', { agentId, tool_id, reason: scope.reason });
        return jsonError(res, 403, scope.reason);
      }

      // Per-agent concilium rate limit
      const agentRl = await checkConciliumRateLimit(admin, {
        entityType: 'agent', entityId: agentId, userId, req,
      });
      if (!agentRl.allowed) {
        return jsonError(res, 429, agentRl.reason);
      }
    }

    const endTimer = log.startTimer();

    // Execute tool
    const result = await toolHandler(admin, params, { userId, agentId, agentContext, req });
    endTimer(`domain-tools:${tool_id}`);

    // Record usage for agent
    if (agentId) {
      await recordUsage(admin, {
        entityType: 'agent', entityId: agentId, tokensUsed: 0, costUsd: 0, req,
      }).catch(() => {});
    }

    // Apply response size limits
    const response = truncateResponse(result, tool_id);

    return res.status(200).json({ tool_id, ...response });
  } catch (err) {
    return handleApiError(res, err, 'domain-tools');
  }
}

// ── Response truncation ─────────────────────────────────────────

function truncateResponse(result, toolId) {
  const json = JSON.stringify(result);
  if (json.length <= MAX_RESPONSE_CHARS) {
    return { ...result, truncated: false };
  }

  // Truncate arrays in result.data
  if (Array.isArray(result.data)) {
    const totalCount = result.data.length;
    let truncated = result.data;
    while (JSON.stringify(truncated).length > MAX_RESPONSE_CHARS && truncated.length > 1) {
      truncated = truncated.slice(0, Math.ceil(truncated.length / 2));
    }
    return { ...result, data: truncated, truncated: true, total_count: totalCount };
  }

  // Truncate string result
  return { data: json.slice(0, MAX_RESPONSE_CHARS), truncated: true };
}

// ── Change log helper ───────────────────────────────────────────

async function logChange(admin, { agentId, userId, toolId, entityType, entityId, previousState, newState }) {
  await admin.from('agent_change_log').insert({
    agent_id: agentId,
    user_id: userId,
    tool_id: toolId,
    entity_type: entityType,
    entity_id: String(entityId),
    previous_state: previousState,
    new_state: newState,
  }).then(null, () => {});
}

async function logAudit(admin, { agentId, agentName, userId, action, entity, entityId, details }) {
  await admin.from('audit_log').insert({
    action,
    entity,
    entity_id: String(entityId),
    user_id: userId,
    user_email: '',
    details: JSON.stringify({
      v: 2,
      summary: action,
      agent_id: agentId,
      agent_name: agentName,
      ...details,
    }),
    actor_type: agentId ? 'agent' : 'user',
    agent_id: agentId || null,
    agent_name: agentName || null,
  }).then(null, () => {});
}

// ── Partners ────────────────────────────────────────────────────

async function handlePartnersRead(admin, params, ctx) {
  const limit = Math.min(Number(params.limit) || DEFAULT_LIMIT, MAX_LIMIT);
  const offset = Number(params.offset) || 0;

  let query = admin.from('partners').select('*', { count: 'exact' }).eq('user_id', ctx.userId);

  if (params.id) query = query.eq('id', params.id);
  if (params.group) query = query.ilike('group', `%${params.group}%`);
  if (params.team) query = query.ilike('team', `%${params.team}%`);
  if (params.geo) query = query.or(`geos.cs.{${params.geo}},geo.ilike.%${params.geo}%`);
  if (params.status) query = query.eq('funnelStatus', params.status);
  if (params.search) query = query.ilike('name', `%${params.search}%`);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return { data: data || [], total_count: count || 0 };
}

async function handlePartnersWrite(admin, params, ctx) {
  const { id, updates } = params;
  if (!id) throw new Error('id is required');
  if (!updates || typeof updates !== 'object') throw new Error('updates object is required');

  // Allowed fields for agent writes
  const allowed = ['funnelStatus', 'notes', 'team', 'group', 'tags', 'status'];
  const safeUpdates = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) safeUpdates[key] = updates[key];
  }
  if (Object.keys(safeUpdates).length === 0) throw new Error('No valid fields to update');

  // Snapshot before change
  const { data: before } = await admin
    .from('partners')
    .select('*')
    .eq('id', id)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  if (!before) throw new Error('Partner not found');

  safeUpdates.updated_at = new Date().toISOString();
  const { data: after, error } = await admin
    .from('partners')
    .update(safeUpdates)
    .eq('id', id)
    .eq('user_id', ctx.userId)
    .select('*')
    .single();
  if (error) throw error;

  // Change log + audit
  if (ctx.agentId) {
    await logChange(admin, {
      agentId: ctx.agentId, userId: ctx.userId, toolId: 'partners:write',
      entityType: 'partner', entityId: id, previousState: before, newState: after,
    });
    await logAudit(admin, {
      agentId: ctx.agentId, agentName: ctx.agentContext?.name,
      userId: ctx.userId, action: 'Partner updated by agent',
      entity: 'Partner', entityId: id, details: { changes: safeUpdates },
    });
  }

  return { data: after };
}

// ── Finances ────────────────────────────────────────────────────

async function handleFinancesRead(admin, params, ctx) {
  // Aggregate financial data from partners
  let query = admin.from('partners').select('*').eq('user_id', ctx.userId);
  if (params.team) query = query.ilike('team', `%${params.team}%`);
  if (params.geo) query = query.or(`geos.cs.{${params.geo}},geo.ilike.%${params.geo}%`);

  const { data: partners, error } = await query;
  if (error) throw error;

  const ps = partners || [];
  let totalRevenue = 0, totalSpend = 0, totalFTD = 0;
  for (const p of ps) {
    totalRevenue += Number(p.revenue) || 0;
    totalSpend += Number(p.spend) || 0;
    totalFTD += Number(p.ftd) || 0;
  }

  const profit = totalRevenue - totalSpend;
  const roi = totalSpend > 0 ? ((profit / totalSpend) * 100).toFixed(1) : '0.0';

  return {
    data: {
      revenue: totalRevenue,
      spend: totalSpend,
      profit,
      roi: Number(roi),
      ftd: totalFTD,
      partners_count: ps.length,
      period: params.period || 'all_time',
    },
  };
}

// ── Dashboard ───────────────────────────────────────────────────

async function handleDashboardRead(admin, params, ctx) {
  // Load partners + projects for KPIs
  const [pRes, prRes] = await Promise.all([
    admin.from('partners').select('*').eq('user_id', ctx.userId),
    admin.from('projects').select('*').eq('user_id', ctx.userId),
  ]);

  const partners = pRes.data || [];
  const projects = prRes.data || [];

  let totalRevenue = 0, totalSpend = 0, totalFTD = 0;
  for (const p of partners) {
    totalRevenue += Number(p.revenue) || 0;
    totalSpend += Number(p.spend) || 0;
    totalFTD += Number(p.ftd) || 0;
  }

  const profit = totalRevenue - totalSpend;
  const roi = totalSpend > 0 ? ((profit / totalSpend) * 100).toFixed(1) : '0.0';
  const activePartners = partners.filter((p) => p.funnelStatus === 'active').length;

  // Alerts
  const alerts = [];
  if (Number(roi) < 0) alerts.push({ type: 'warning', message: 'Negative ROI detected' });
  if (activePartners === 0) alerts.push({ type: 'warning', message: 'No active partners' });

  return {
    data: {
      kpis: {
        revenue: totalRevenue,
        profit,
        roi: Number(roi),
        partners: partners.length,
        active_partners: activePartners,
        projects: projects.length,
        ftd: totalFTD,
      },
      alerts,
    },
  };
}

// ── Campaigns ───────────────────────────────────────────────────

async function handleCampaignsRead(admin, params, ctx) {
  const trackerUrl = process.env.KEITARO_TRACKER_URL;
  const apiKey = process.env.KEITARO_API_KEY;

  if (!trackerUrl || !apiKey) {
    return { data: [], error: 'Campaign tracker not configured' };
  }

  const resp = await fetchWithRetry(`${trackerUrl}/admin_api/v1/campaigns`, {
    headers: { 'Api-Key': apiKey, Accept: 'application/json' },
    timeout: 8000,
  });

  const payload = await resp.json();
  let items = Array.isArray(payload) ? payload : (payload?.items || payload?.data || []);

  // Apply filters
  if (params.status) {
    items = items.filter((c) => {
      const st = c.state || c.status;
      return String(st).toLowerCase() === String(params.status).toLowerCase();
    });
  }
  if (params.search) {
    const s = params.search.toLowerCase();
    items = items.filter((c) => (c.name || c.title || '').toLowerCase().includes(s));
  }

  const limit = Math.min(Number(params.limit) || DEFAULT_LIMIT, MAX_LIMIT);
  const total = items.length;
  items = items.slice(0, limit);

  // Normalize
  const data = items.map((c) => ({
    id: c.id || c.campaign_id,
    name: c.name || c.title || '',
    status: c.state || c.status || 'unknown',
    channel: c.traffic_source_name || c.source_name || '',
    clicks: Number(c.clicks || c.stats?.clicks) || 0,
    conversions: Number(c.conversions || c.stats?.conversions) || 0,
    spend: Number(c.cost || c.spend || c.stats?.cost) || 0,
  }));

  return { data, total_count: total };
}

async function handleCampaignsWrite(admin, params, ctx) {
  // Campaigns are external (Keitaro) — limited write support
  return { data: null, error: 'Campaign writes not yet supported (Keitaro is external)' };
}

// ── Injection ───────────────────────────────────────────────────

async function handleInjectionRead(admin, params, ctx) {
  const limit = Math.min(Number(params.limit) || DEFAULT_LIMIT, MAX_LIMIT);

  let query = admin.from('injection_materials').select('*', { count: 'exact' }).eq('user_id', ctx.userId);
  if (params.category) query = query.ilike('injection_config->>category', `%${params.category}%`);
  if (params.search) query = query.ilike('name', `%${params.search}%`);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return { data: data || [], total_count: count || 0 };
}

async function handleInjectionWrite(admin, params, ctx) {
  const { id, updates } = params;
  if (!id) throw new Error('id is required');
  if (!updates || typeof updates !== 'object') throw new Error('updates object is required');

  const allowed = ['name', 'injection_config'];
  const safeUpdates = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) safeUpdates[key] = updates[key];
  }
  if (Object.keys(safeUpdates).length === 0) throw new Error('No valid fields to update');

  // Snapshot
  const { data: before } = await admin
    .from('injection_materials')
    .select('*')
    .eq('id', id)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  if (!before) throw new Error('Material not found');

  const { data: after, error } = await admin
    .from('injection_materials')
    .update(safeUpdates)
    .eq('id', id)
    .eq('user_id', ctx.userId)
    .select('*')
    .single();
  if (error) throw error;

  if (ctx.agentId) {
    await logChange(admin, {
      agentId: ctx.agentId, userId: ctx.userId, toolId: 'injection:write',
      entityType: 'injection_material', entityId: id, previousState: before, newState: after,
    });
    await logAudit(admin, {
      agentId: ctx.agentId, agentName: ctx.agentContext?.name,
      userId: ctx.userId, action: 'Injection material updated by agent',
      entity: 'InjectionMaterial', entityId: id, details: { changes: safeUpdates },
    });
  }

  return { data: after };
}

// ── Reports ─────────────────────────────────────────────────────

async function handleReportsRead(admin, params, ctx) {
  const reportType = params.type || 'tpl-executive-summary';

  // Load partner data for aggregation
  let query = admin.from('partners').select('*').eq('user_id', ctx.userId);
  if (params.team) query = query.ilike('team', `%${params.team}%`);
  if (params.geo) query = query.or(`geos.cs.{${params.geo}},geo.ilike.%${params.geo}%`);

  const { data: partners } = await query;
  const ps = partners || [];

  let totalRevenue = 0, totalSpend = 0, totalFTD = 0, totalClicks = 0;
  for (const p of ps) {
    totalRevenue += Number(p.revenue) || 0;
    totalSpend += Number(p.spend) || 0;
    totalFTD += Number(p.ftd) || 0;
    totalClicks += Number(p.clicks) || 0;
  }

  const profit = totalRevenue - totalSpend;
  const roi = totalSpend > 0 ? ((profit / totalSpend) * 100) : 0;

  // Top partners by revenue
  const topPartners = [...ps]
    .sort((a, b) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0))
    .slice(0, 10)
    .map((p) => ({
      id: p.id, name: p.name, revenue: Number(p.revenue) || 0,
      spend: Number(p.spend) || 0, ftd: Number(p.ftd) || 0,
    }));

  return {
    data: {
      report_type: reportType,
      computed_at: new Date().toISOString(),
      kpis: {
        revenue: totalRevenue, spend: totalSpend, profit,
        roi: Math.round(roi * 10) / 10, ftd: totalFTD, clicks: totalClicks,
        partners_count: ps.length,
      },
      top_partners: topPartners,
    },
  };
}

async function handleReportsSubmit(admin, params, ctx) {
  const { report_type, summary, details } = params;
  if (!summary) throw new Error('summary is required');

  const row = {
    user_id: ctx.userId,
    agent_id: ctx.agentId || null,
    board_id: params.board_id || null,
    report_type: report_type || 'activity',
    summary,
    details: details || {},
    requests_made: params.requests_made || 0,
    tokens_used: params.tokens_used || 0,
    cost_usd: params.cost_usd || 0,
    verified: false,
  };

  const { data, error } = await admin
    .from('concilium_agent_reports')
    .insert(row)
    .select('*')
    .single();
  if (error) throw error;

  return { data };
}
