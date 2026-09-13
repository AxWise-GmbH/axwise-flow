/**
 * Seed Agent Profiles handler — auto-seeds predefined agent profiles
 * on first load when agents exist but have no profile row.
 * Route: POST ?op=seed
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

const log = createLogger('seed-agent-profiles');

/* ── Seed profiles for agents that don't have one yet ──────────────────── */
async function handleSeed(admin, user, body) {
  const { profiles } = body;
  if (!Array.isArray(profiles) || profiles.length === 0) {
    return { status: 400, error: 'profiles array is required' };
  }

  // Get user's existing agents
  const { data: agents, error: agentsErr } = await admin
    .from('agents')
    .select('id, name')
    .eq('user_id', user.id);

  if (agentsErr) throw agentsErr;
  if (!agents || agents.length === 0) {
    return { status: 200, data: { seeded: 0, message: 'No agents found' } };
  }

  // Build lookup: agent name in DB is the role (e.g. "CEO/Founder", "Product Owner")
  const byName = new Map(agents.map(a => [a.name, a.id]));

  // Get existing profiles to avoid duplicates
  const { data: existing, error: existErr } = await admin
    .from('agent_profiles')
    .select('agent_id')
    .eq('user_id', user.id);

  if (existErr) throw existErr;
  const existingSet = new Set((existing || []).map(p => p.agent_id));

  // Filter to profiles whose agent exists and doesn't have a profile yet
  const toInsert = [];
  for (const profile of profiles) {
    // Match by short name (e.g. "Nova"), by job_title (e.g. "CEO/Founder"), or by role field
    const agentId = byName.get(profile.agentName) || byName.get(profile.job_title) || byName.get(profile.role);
    if (!agentId || existingSet.has(agentId)) continue;

    // Strip agentName (not a DB column) and inject IDs
    const { agentName, ...rest } = profile;
    toInsert.push({
      ...rest,
      agent_id: agentId,
      user_id: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  if (toInsert.length === 0) {
    return { status: 200, data: { seeded: 0, message: 'All agents already have profiles' } };
  }

  // Batch insert
  const { data: inserted, error: insertErr } = await admin
    .from('agent_profiles')
    .insert(toInsert)
    .select('id, agent_id, display_name');

  if (insertErr) throw insertErr;

  log.info('seeded', { user_id: user.id, count: inserted.length });
  return {
    status: 200,
    data: { seeded: inserted.length, total: profiles.length, profiles: inserted },
  };
}

/* ── Check seed status ─────────────────────────────────────────────────── */
async function handleStatus(admin, user) {
  const { count, error } = await admin
    .from('agent_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (error) throw error;
  return { status: 200, data: { profileCount: count || 0 } };
}

/* ── Main handler ──────────────────────────────────────────────────────── */
export default async function seedAgentProfiles(req, res) {
  if (cors(res, req)) return;

  const token = getBearerToken(req);
  if (!token) return jsonError(res, 401, 'Missing token');
  const { data: { user }, error: authErr } = await verifySupabaseToken(token);
  if (authErr || !user) return jsonError(res, 401, 'Invalid token');

  const rlKey = getRateLimitIdentifier(req);
  const rl = await checkRateLimit(rlKey, { max: 10, windowMs: 60000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Rate limit exceeded');

  const admin = buildSupabaseAdminClient();
  const op = req.query?.op;
  const body = req.body || {};

  try {
    let result;
    switch (op) {
      case 'seed':
        if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
        result = await handleSeed(admin, user, body);
        break;
      case 'status':
        result = await handleStatus(admin, user);
        break;
      default:
        return jsonError(res, 400, 'Invalid op. Use: seed, status');
    }
    if (result.error) return jsonError(res, result.status, result.error);
    return res.status(result.status).json(result.data);
  } catch (err) {
    return handleApiError(res, err, 'seed-agent-profiles');
  }
}
