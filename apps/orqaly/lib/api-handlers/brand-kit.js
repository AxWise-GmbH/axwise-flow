/**
 * Brand kit handler — read/write the user's persistent team brand kit and
 * record PageBuilder edits as a learning signal for future goals.
 *
 * Routes:
 *   GET   ?op=get                 — Read current user's brand kit
 *   PUT   ?op=upsert              — Create or replace brand kit
 *   POST  ?op=edit-event          — Append a structured design_edits row
 *   GET   ?op=recent-edits        — List the last N signal-eligible edits
 *
 * Why this lives in its own handler (not under landing-pages): the brand
 * kit is goal-independent; conflating the two would force callers to know
 * about page IDs they don't have at brand-edit time (e.g. the Settings page).
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

const log = createLogger('brand-kit');

const ALLOWED_EDIT_KINDS = new Set([
  'color_swap', 'replaced_image', 'rewrote_copy',
  'resized', 'removed_section', 'added_section',
  'font_change', 'layout_change', 'other',
]);

function sanitizeText(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

// ── Brand kit read/write ──────────────────────────────────────────

async function handleGet(admin, userId) {
  const { data, error } = await admin
    .from('team_brand_kits')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return { status: 200, data: data || null };
}

async function handleUpsert(admin, userId, body) {
  const palette = Array.isArray(body?.palette) ? body.palette.slice(0, 6).map((c) => String(c).slice(0, 16)) : [];
  const fonts = Array.isArray(body?.fonts) ? body.fonts.slice(0, 4).map((f) => String(f).slice(0, 80)) : [];
  const moodWords = Array.isArray(body?.mood_words || body?.moodWords) ? (body.mood_words || body.moodWords).slice(0, 12).map((w) => String(w).slice(0, 40)) : [];

  const row = {
    user_id: userId,
    palette,
    fonts,
    vibe: sanitizeText(body?.vibe, 120),
    mood_words: moodWords,
    target_audience: sanitizeText(body?.target_audience || body?.targetAudience, 500),
    tone: sanitizeText(body?.tone, 40),
    logo_url: sanitizeText(body?.logo_url || body?.logoUrl, 500) || null,
    // Manually edited kits clear the stale flag — the user has signed off.
    stale_at: null,
    stale_reason: null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from('team_brand_kits')
    .upsert(row, { onConflict: 'user_id' })
    .select('*')
    .single();
  if (error) throw error;
  return { status: 200, data };
}

// ── Design edits signal ───────────────────────────────────────────

async function handleEditEvent(admin, userId, body) {
  const goalId = body?.goalId || body?.goal_id || null;
  const landingPageId = body?.landingPageId || body?.landing_page_id || null;
  const rawEdits = Array.isArray(body?.edits) ? body.edits : [];

  const edits = rawEdits.slice(0, 20).map((edit) => {
    const kind = ALLOWED_EDIT_KINDS.has(edit?.kind) ? edit.kind : 'other';
    return {
      kind,
      from: sanitizeText(edit?.from, 200) || null,
      to: sanitizeText(edit?.to, 200) || null,
      target: sanitizeText(edit?.target, 200) || null,
      delta: sanitizeText(edit?.delta, 80) || null,
      note: sanitizeText(edit?.note, 400) || null,
    };
  });

  if (edits.length === 0) {
    return { status: 400, error: 'edits[] is required and must contain at least one entry' };
  }

  const summary = sanitizeText(body?.summary, 500) || edits.map((e) => `${e.kind}${e.target ? ` ${e.target}` : ''}`).join(', ').slice(0, 500);

  // Signal eligibility: caller can declare true ONLY when the goal is
  // 'completed' and the user has not flagged the page as bad. Otherwise we
  // store the row for audit but don't surface it in pm-planning's prompt.
  let signalEligible = false;
  if (body?.signal_eligible === true || body?.signalEligible === true) {
    if (goalId) {
      try {
        const { data: goal } = await admin
          .from('goals')
          .select('status, user_id')
          .eq('id', goalId)
          .eq('user_id', userId)
          .maybeSingle();
        if (goal?.status === 'completed') signalEligible = true;
      } catch {
        // Non-fatal: store as ineligible
      }
    }
  }

  const { data, error } = await admin
    .from('design_edits')
    .insert({
      user_id: userId,
      goal_id: goalId,
      landing_page_id: landingPageId,
      edits,
      summary,
      signal_eligible: signalEligible,
    })
    .select('id, created_at, signal_eligible')
    .single();
  if (error) throw error;
  return { status: 201, data };
}

async function handleRecentEdits(admin, userId, query) {
  const limit = Math.min(Math.max(parseInt(query?.limit, 10) || 10, 1), 50);
  const onlySignal = String(query?.onlySignal || query?.signalOnly || 'true') === 'true';

  let builder = admin
    .from('design_edits')
    .select('id, goal_id, landing_page_id, edits, summary, signal_eligible, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (onlySignal) builder = builder.eq('signal_eligible', true);

  const { data, error } = await builder;
  if (error) throw error;
  return { status: 200, data };
}

// ── Router ────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (cors(res, req)) return;

  const op = (req.query?.op || '').trim().toLowerCase();
  const token = getBearerToken(req);
  if (!token) return jsonError(res, 401, 'Missing token');
  const user = await verifySupabaseToken(token);
  if (!user?.id) return jsonError(res, 401, 'Invalid token');

  const rl = await checkRateLimit(getRateLimitIdentifier(req), 'brand-kit', 30, 60);
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Rate limited');

  const admin = buildSupabaseAdminClient();

  try {
    let result;
    switch (op) {
      case 'get':
        result = await handleGet(admin, user.id);
        break;
      case 'upsert':
        result = await handleUpsert(admin, user.id, req.body);
        break;
      case 'edit-event':
        result = await handleEditEvent(admin, user.id, req.body);
        break;
      case 'recent-edits':
        result = await handleRecentEdits(admin, user.id, req.query);
        break;
      default:
        return jsonError(res, 400, `Unknown op: ${op}`);
    }
    if (result.error && result.status >= 400) {
      return jsonError(res, result.status, result.error);
    }
    return res.status(result.status).json(result.data);
  } catch (err) {
    return handleApiError(res, err, log, req);
  }
}
