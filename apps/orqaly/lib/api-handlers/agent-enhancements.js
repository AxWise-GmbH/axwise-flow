/**
 * Per-role / per-agent organization conditioning.
 *
 * Routes:
 *   GET  /api/app?path=agent-enhancements&org_id=<uuid>[&role_key=][&agent_id=]
 *   POST /api/app?path=agent-enhancements
 *          { org_id, role_key?, agent_id?, content?, is_active?, confirm_overwrite? }
 *   POST /api/app?path=agent-enhancements&op=generate
 *          { org_id, role_key?, agent_id?, confirm_overwrite? }
 *
 * Authorship is first-class: a user may write conditioning entirely by hand and
 * never involve generation. Regeneration therefore refuses to replace a `user`
 * or `merged` row unless confirm_overwrite is set — this is a data-loss guard,
 * not a nicety.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import {
  orgEnhancementUpsertSchema,
  orgEnhancementGenerateSchema,
} from '../../api/_lib/validate.js';
import { generateOrgEnhancement, briefingHash } from '../integrations/axwise/org-enhancement.js';
import { roleIdentityKey } from '../goal-handlers/team-assigner.js';

const log = createLogger('agent-enhancements');

/** Rows the user authored or edited. Never replaced without confirmation. */
const PROTECTED_SOURCES = new Set(['user', 'merged']);

async function assertOrgOwnership(admin, userId, orgId) {
  const { data, error } = await admin
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadScopedRow(admin, userId, orgId, roleKey, agentId) {
  let query = admin
    .from('org_agent_enhancements')
    .select('id, content, source, version, briefing_hash, is_active, role_key, agent_id')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .eq('role_key', roleKey);
  query = query.eq('agent_id', agentId || '');
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const done = log.startTimer(req, 'request', { method: req.method });

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized');
  }

  // Generation costs a model call, so it gets the tighter of the two limits.
  const generating = String(req.query?.op || '') === 'generate';
  const rlKey = `agent-enhancements:${generating ? 'gen' : 'rw'}:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({
    key: rlKey,
    limit: generating ? 10 : 60,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  const admin = buildSupabaseAdminClient();

  try {
    if (req.method === 'GET') return await handleGet(req, res, admin, user, done);
    if (req.method === 'POST' && generating) {
      return await handleGenerate(req, res, admin, user, done);
    }
    if (req.method === 'POST') return await handleUpsert(req, res, admin, user, done);
    done({ status: 405 });
    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'agent-enhancements');
  }
}

async function handleGet(req, res, admin, user, done) {
  const orgId = String(req.query?.org_id || '').trim();
  if (!orgId) {
    done({ status: 400 });
    return jsonError(res, 400, 'org_id is required');
  }
  if (!(await assertOrgOwnership(admin, user.id, orgId))) {
    done({ status: 404 });
    return jsonError(res, 404, 'Organization not found');
  }

  const roleKey = roleIdentityKey(req.query?.role_key || '');
  const agentId = String(req.query?.agent_id || '').trim();
  const row = await loadScopedRow(admin, user.id, orgId, roleKey, agentId);

  done({ status: 200 });
  return res.status(200).json({ enhancement: row });
}

async function handleUpsert(req, res, admin, user, done) {
  const parsed = orgEnhancementUpsertSchema.safeParse(req.body || {});
  if (!parsed.success) {
    done({ status: 400 });
    return jsonError(res, 400, parsed.error.issues[0]?.message || 'Invalid body');
  }
  const { org_id: orgId, content, is_active: isActive } = parsed.data;
  const roleKey = roleIdentityKey(parsed.data.role_key || '');
  const agentId = parsed.data.agent_id ? String(parsed.data.agent_id) : '';

  if (!(await assertOrgOwnership(admin, user.id, orgId))) {
    done({ status: 404 });
    return jsonError(res, 404, 'Organization not found');
  }

  const existing = await loadScopedRow(admin, user.id, orgId, roleKey, agentId);

  // A hand edit promotes generated text to `merged` so later generation stops
  // treating it as safe to overwrite.
  let source = 'user';
  if (content !== undefined && existing && existing.source !== 'user') {
    source = 'merged';
  }

  const row = {
    org_id: orgId,
    user_id: user.id,
    role_key: roleKey,
    agent_id: agentId,
    ...(content !== undefined ? { content, source } : {}),
    ...(isActive !== undefined ? { is_active: isActive } : {}),
    // Hand-authored content is not tied to a briefing, so it is never stale.
    ...(content !== undefined ? { briefing_hash: null } : {}),
    version: (existing?.version || 0) + 1,
  };

  const { error } = await admin
    .from('org_agent_enhancements')
    .upsert(row, { onConflict: 'org_id,role_key,agent_id' });
  if (error) throw error;

  log.info(req, 'agent-enhancements.saved', { orgId, roleKey, agentId, source });

  done({ status: 200 });
  return res.status(200).json({ ok: true, source, version: row.version });
}

async function handleGenerate(req, res, admin, user, done) {
  const parsed = orgEnhancementGenerateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    done({ status: 400 });
    return jsonError(res, 400, parsed.error.issues[0]?.message || 'Invalid body');
  }
  const { org_id: orgId, confirm_overwrite: confirmOverwrite } = parsed.data;
  const roleLabel = String(parsed.data.role_key || '');
  const roleKey = roleIdentityKey(roleLabel);
  const agentId = parsed.data.agent_id ? String(parsed.data.agent_id) : '';

  const org = await assertOrgOwnership(admin, user.id, orgId);
  if (!org) {
    done({ status: 404 });
    return jsonError(res, 404, 'Organization not found');
  }

  const { data: profile } = await admin
    .from('organization_profiles')
    .select('briefing')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  const briefing = profile?.briefing || '';
  if (!briefing.trim()) {
    done({ status: 400 });
    return jsonError(res, 400, 'Write the organization briefing before generating conditioning');
  }

  const existing = await loadScopedRow(admin, user.id, orgId, roleKey, agentId);

  // Data-loss guard. Anything the user wrote or edited requires an explicit
  // confirmation before generated text may replace it.
  if (existing && PROTECTED_SOURCES.has(existing.source) && !confirmOverwrite) {
    done({ status: 409 });
    return res.status(409).json({
      error: 'This conditioning was edited by hand. Confirm before replacing it.',
      code: 'confirm_overwrite_required',
      current: { content: existing.content, source: existing.source },
    });
  }

  const generated = await generateOrgEnhancement({
    admin,
    org,
    roleLabel,
    briefing,
    userId: user.id,
    req,
  });

  if (!generated) {
    done({ status: 502 });
    return jsonError(res, 502, 'Could not generate conditioning from this briefing');
  }

  const { error } = await admin.from('org_agent_enhancements').upsert(
    {
      org_id: orgId,
      user_id: user.id,
      role_key: roleKey,
      agent_id: agentId,
      content: generated.content,
      source: generated.source,
      briefing_hash: generated.briefingHash,
      is_active: true,
      version: (existing?.version || 0) + 1,
    },
    { onConflict: 'org_id,role_key,agent_id' }
  );
  if (error) throw error;

  log.info(req, 'agent-enhancements.generated', {
    orgId,
    roleKey,
    agentId,
    chars: generated.content.length,
  });

  done({ status: 200 });
  return res.status(200).json({
    ok: true,
    content: generated.content,
    source: generated.source,
    briefing_hash: generated.briefingHash,
    version: (existing?.version || 0) + 1,
    // Echoed so the client can show "generated from briefing #hash".
    current_briefing_hash: briefingHash(briefing),
  });
}
