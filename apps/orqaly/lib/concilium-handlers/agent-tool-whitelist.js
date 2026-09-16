/**
 * Agent Tool Whitelist CRUD handler.
 * GET (list), POST (add tool), PUT (update), DELETE (remove).
 * POST ?action=seed — pre-populate with default domain + MCP tools.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError, handleApiError } from '../../api/_lib/errors.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { checkRateLimit, applyRateLimitHeaders, getRateLimitIdentifier } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('agent-tool-whitelist');

// Default tools to seed for new users
const DEFAULT_TOOLS = [
  // Domain tools
  { tool_id: 'partners:read', tool_name: 'Read Partners', description: 'List/filter/get partner data', risk_level: 'low', category: 'domain', endpoint_path: '/api/concilium?path=domain-tools', allowed_operations: ['read'] },
  { tool_id: 'partners:write', tool_name: 'Write Partners', description: 'Update partner fields', risk_level: 'medium', requires_approval: true, category: 'domain', endpoint_path: '/api/concilium?path=domain-tools', allowed_operations: ['write'] },
  { tool_id: 'finances:read', tool_name: 'Read Finances', description: 'Financial summaries, revenue, ROI', risk_level: 'low', category: 'domain', endpoint_path: '/api/concilium?path=domain-tools', allowed_operations: ['read'] },
  { tool_id: 'dashboard:read', tool_name: 'Read Dashboard', description: 'Executive summary, KPIs, trends', risk_level: 'low', category: 'domain', endpoint_path: '/api/concilium?path=domain-tools', allowed_operations: ['read'] },
  { tool_id: 'campaigns:read', tool_name: 'Read Campaigns', description: 'List campaigns, filter by status', risk_level: 'low', category: 'domain', endpoint_path: '/api/concilium?path=domain-tools', allowed_operations: ['read'] },
  { tool_id: 'campaigns:write', tool_name: 'Write Campaigns', description: 'Update campaign config', risk_level: 'medium', requires_approval: true, category: 'domain', endpoint_path: '/api/concilium?path=domain-tools', allowed_operations: ['write'] },
  { tool_id: 'injection:read', tool_name: 'Read Injection', description: 'List materials and categories', risk_level: 'low', category: 'domain', endpoint_path: '/api/concilium?path=domain-tools', allowed_operations: ['read'] },
  { tool_id: 'injection:write', tool_name: 'Write Injection', description: 'Create/update material metadata', risk_level: 'medium', requires_approval: true, category: 'domain', endpoint_path: '/api/concilium?path=domain-tools', allowed_operations: ['write'] },
  { tool_id: 'reports:read', tool_name: 'Read Reports', description: 'Fetch any report type', risk_level: 'low', category: 'domain', endpoint_path: '/api/concilium?path=domain-tools', allowed_operations: ['read'] },
  { tool_id: 'reports:submit', tool_name: 'Submit Report', description: 'Submit agent report to Consilium', risk_level: 'low', category: 'domain', endpoint_path: '/api/concilium?path=domain-tools', allowed_operations: ['write'] },

  // MCP tools
  { tool_id: 'mcp:agent_check_in', tool_name: 'Agent Check-In', description: 'Heartbeat check-in', risk_level: 'low', category: 'mcp', allowed_operations: ['write'] },
  { tool_id: 'mcp:submit_report', tool_name: 'MCP Submit Report', description: 'Submit report via MCP', risk_level: 'low', category: 'mcp', allowed_operations: ['write'] },
  { tool_id: 'mcp:list_boards', tool_name: 'MCP List Boards', description: 'List Consilium boards', risk_level: 'low', category: 'mcp', allowed_operations: ['read'] },
  { tool_id: 'mcp:manage_task', tool_name: 'MCP Manage Tasks', description: 'Create/update tasks', risk_level: 'medium', category: 'mcp', allowed_operations: ['read', 'write'] },
  { tool_id: 'mcp:manage_workflow', tool_name: 'MCP Manage Workflows', description: 'Create/update workflows', risk_level: 'medium', category: 'mcp', allowed_operations: ['read', 'write'] },
  { tool_id: 'mcp:manage_project', tool_name: 'MCP Manage Projects', description: 'Create/update projects', risk_level: 'medium', category: 'mcp', allowed_operations: ['read', 'write'] },
  { tool_id: 'mcp:execute_tool', tool_name: 'MCP Execute Tool', description: 'Execute a registered tool', risk_level: 'high', requires_approval: true, category: 'mcp', allowed_operations: ['read', 'write'] },
  { tool_id: 'mcp:list_tools', tool_name: 'MCP List Tools', description: 'List registered tools', risk_level: 'low', category: 'mcp', allowed_operations: ['read'] },
  { tool_id: 'mcp:enqueue_job', tool_name: 'MCP Enqueue Job', description: 'Add job to queue', risk_level: 'medium', category: 'mcp', allowed_operations: ['write'] },
  { tool_id: 'mcp:get_job_status', tool_name: 'MCP Job Status', description: 'Check job status', risk_level: 'low', category: 'mcp', allowed_operations: ['read'] },
];

export default async function handler(req, res) {
  const safeReq = req && typeof req === 'object' ? req : {};
  if (!safeReq.headers) safeReq.headers = {};
  cors(res, safeReq);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const token = getBearerToken(safeReq);
    const user = await verifySupabaseToken(token);
    if (!user) return jsonError(res, 401, 'Unauthorized');

    const rlKey = getRateLimitIdentifier(req, user.id);
    const rl = checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
    applyRateLimitHeaders(res, rl);
    if (!rl.allowed) return jsonError(res, 429, 'Too many requests');

    const admin = buildSupabaseAdminClient();
    if (!admin) return jsonError(res, 503, 'Database not configured');

    const endTimer = log.startTimer();
    const action = req.query?.action;

    // ── Seed default tools ──────────────────────────────────────────
    if (action === 'seed' && req.method === 'POST') {
      const rows = DEFAULT_TOOLS.map((t) => ({ ...t, user_id: user.id }));
      const { data, error } = await admin
        .from('agent_tool_whitelist')
        .upsert(rows, { onConflict: 'user_id,tool_id', ignoreDuplicates: true })
        .select('*');
      endTimer('whitelist:seed');
      if (error) return handleApiError(res, error, 'whitelist:seed');
      log.info('Tool whitelist seeded', { userId: user.id, count: (data || []).length });
      return res.status(200).json({ tools: data || [], seeded: true });
    }

    // ── GET ─────────────────────────────────────────────────────────
    if (req.method === 'GET') {
      let query = admin.from('agent_tool_whitelist').select('*').eq('user_id', user.id);
      const category = req.query?.category;
      if (category) query = query.eq('category', category);
      if (req.query?.active === 'true') query = query.eq('is_active', true);

      const { data, error } = await query.order('category').order('tool_id');
      endTimer('whitelist:list');
      if (error) return handleApiError(res, error, 'whitelist:list');
      return res.status(200).json({ tools: data || [] });
    }

    // ── POST ────────────────────────────────────────────────────────
    if (req.method === 'POST') {
      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const { tool_id, tool_name, description, risk_level, requires_approval,
        category, endpoint_path, allowed_operations } = body;

      if (!tool_id || !tool_name) {
        return jsonError(res, 400, 'tool_id and tool_name are required');
      }

      const row = {
        user_id: user.id,
        tool_id,
        tool_name,
        description: description || '',
        risk_level: risk_level || 'low',
        requires_approval: requires_approval || false,
        category: category || 'general',
        endpoint_path: endpoint_path || '',
        allowed_operations: allowed_operations || [],
      };

      const { data, error } = await admin
        .from('agent_tool_whitelist')
        .insert(row)
        .select('*')
        .single();
      endTimer('whitelist:create');
      if (error) return handleApiError(res, error, 'whitelist:create');
      return res.status(201).json({ tool: data });
    }

    // ── PUT ──────────────────────────────────────────────────────────
    if (req.method === 'PUT') {
      const id = req.query?.id;
      if (!id) return jsonError(res, 400, 'id query param required');

      const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
      const allowed = ['tool_name', 'description', 'risk_level', 'requires_approval',
        'category', 'endpoint_path', 'allowed_operations', 'is_active'];
      const updates = {};
      for (const key of allowed) {
        if (body[key] !== undefined) updates[key] = body[key];
      }
      if (Object.keys(updates).length === 0) return jsonError(res, 400, 'No valid fields');

      const { data, error } = await admin
        .from('agent_tool_whitelist')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select('*')
        .single();
      endTimer('whitelist:update');
      if (error) return handleApiError(res, error, 'whitelist:update');
      if (!data) return jsonError(res, 404, 'Tool not found');
      return res.status(200).json({ tool: data });
    }

    // ── DELETE ───────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const id = req.query?.id;
      if (!id) return jsonError(res, 400, 'id query param required');

      const { error } = await admin
        .from('agent_tool_whitelist')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      endTimer('whitelist:delete');
      if (error) return handleApiError(res, error, 'whitelist:delete');
      return res.status(200).json({ deleted: true });
    }

    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    return handleApiError(res, err, 'whitelist');
  }
}
