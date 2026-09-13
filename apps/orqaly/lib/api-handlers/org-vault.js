/**
 * Organization Vault — the company briefing and its generated summary.
 *
 * Routes:
 *   GET  /api/app?path=org-vault&org_id=<uuid>   — briefing, summary, enhancements
 *   POST /api/app?path=org-vault  { org_id, briefing?, summary?, edited? }
 *
 * The briefing is open free text. No fixed fields: palette and font columns
 * would suit a marketing org and fail a fintech (disclosure duties) or a
 * manufacturer (safety tolerances). Structure lives in the generated markdown.
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
import { orgProfileUpdateSchema } from '../../api/_lib/validate.js';
import { briefingHash } from '../integrations/axwise/org-enhancement.js';

const log = createLogger('org-vault');

/**
 * Confirm the caller owns the organization before any service-role write.
 * The admin client bypasses RLS, so this check is the tenant boundary.
 */
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

  const rlKey = `org-vault:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 60, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  const admin = buildSupabaseAdminClient();

  try {
    if (req.method === 'GET') return await handleGet(req, res, admin, user, done);
    if (req.method === 'POST') return await handlePost(req, res, admin, user, done);
    done({ status: 405 });
    return jsonError(res, 405, 'Method not allowed');
  } catch (err) {
    done({ status: 500 });
    return handleApiError(res, err, 'org-vault');
  }
}

async function handleGet(req, res, admin, user, done) {
  const orgId = String(req.query?.org_id || '').trim();
  if (!orgId) {
    done({ status: 400 });
    return jsonError(res, 400, 'org_id is required');
  }

  const org = await assertOrgOwnership(admin, user.id, orgId);
  if (!org) {
    done({ status: 404 });
    return jsonError(res, 404, 'Organization not found');
  }

  const [{ data: profile }, { data: enhancements }] = await Promise.all([
    admin
      .from('organization_profiles')
      .select('briefing, summary, briefing_hash, summary_source, updated_at')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle(),
    admin
      .from('org_agent_enhancements')
      .select('id, role_key, agent_id, source, is_active, version, briefing_hash, updated_at')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .order('role_key', { ascending: true }),
  ]);

  const currentHash = briefingHash(profile?.briefing || '');

  done({ status: 200 });
  return res.status(200).json({
    org: { id: org.id, name: org.name },
    briefing: profile?.briefing || '',
    summary: profile?.summary || '',
    summary_source: profile?.summary_source || null,
    briefing_hash: profile?.briefing_hash || null,
    // The UI shows a "briefing changed" hint from this rather than guessing.
    briefing_changed: Boolean(profile?.briefing) && profile.briefing_hash !== currentHash,
    updated_at: profile?.updated_at || null,
    enhancements: enhancements || [],
  });
}

async function handlePost(req, res, admin, user, done) {
  const parsed = orgProfileUpdateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    done({ status: 400 });
    return jsonError(res, 400, parsed.error.issues[0]?.message || 'Invalid body');
  }
  const { org_id: orgId, briefing, summary, edited } = parsed.data;

  const org = await assertOrgOwnership(admin, user.id, orgId);
  if (!org) {
    done({ status: 404 });
    return jsonError(res, 404, 'Organization not found');
  }

  const { data: existing } = await admin
    .from('organization_profiles')
    .select('briefing, summary, summary_source')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  const nextBriefing = briefing !== undefined ? briefing : existing?.briefing || '';
  const nextSummary = summary !== undefined ? summary : existing?.summary || '';

  // A user edit promotes generated text to `merged`, which the generator then
  // refuses to overwrite without explicit confirmation.
  let summarySource = existing?.summary_source || 'axwise';
  if (summary !== undefined && edited) {
    summarySource = existing?.summary ? 'merged' : 'user';
  }

  const { error } = await admin.from('organization_profiles').upsert(
    {
      org_id: orgId,
      user_id: user.id,
      briefing: nextBriefing,
      summary: nextSummary,
      summary_source: summarySource,
      // Only stamp the hash when the summary reflects the briefing. Otherwise
      // a briefing edit would look already-applied and never regenerate.
      briefing_hash: summary !== undefined ? briefingHash(nextBriefing) : undefined,
    },
    { onConflict: 'org_id' }
  );
  if (error) throw error;

  log.info(req, 'org-vault.saved', { orgId, briefingChars: nextBriefing.length });

  done({ status: 200 });
  return res.status(200).json({
    ok: true,
    briefing_hash: briefingHash(nextBriefing),
    summary_source: summarySource,
  });
}
