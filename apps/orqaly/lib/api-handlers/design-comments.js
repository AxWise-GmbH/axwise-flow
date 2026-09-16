/**
 * Design comments handler — CRUD for per-element pin comments on a goal's
 * deployed landing page, plus the "apply feedback" action that bundles
 * open comments into a targeted Designer/Developer re-run.
 *
 * Routes (via query param `op`):
 *   GET    ?op=list&goalId=          — List comments for a goal
 *   POST   ?op=create                — Create a new comment
 *   PATCH  ?op=update&id=            — Update status or text
 *   DELETE ?op=delete&id=            — Delete a comment
 *   POST   ?op=apply&goalId=         — Bundle open comments → enqueue
 *                                       targeted re-run via apply-feedback stage
 */
import crypto from 'node:crypto';
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  applyRateLimitHeaders,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import { deterministicAgentJobId, enqueueAgentJob } from '../goal-handlers/_helpers.js';
import { buildFeedbackApplicationVersion } from '../goal-handlers/stages/apply-feedback.js';

const log = createLogger('design-comments');

const MAX_COMMENT_LEN = 2000;
const MAX_SELECTOR_LEN = 500;
const MAX_ELEMENT_TEXT_LEN = 500;
const MAX_COMMENTS_PER_APPLICATION = 30;
const VALID_STATUSES = new Set(['open', 'applied', 'dismissed', 'stale']);
const COMMENT_APPLICATION_SELECT =
  'id, goal_id, user_id, element_selector, element_text, comment_text, status, applied_at, updated_at, created_at';

function sanitizeText(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

/**
 * Confirm the caller actually owns the goal before letting them attach
 * comments to it. RLS would also catch this on insert, but checking up front
 * gives a clean 403 instead of a generic insert failure.
 */
async function ensureGoalOwnership(admin, goalId, userId) {
  const { data, error } = await admin
    .from('goals')
    .select('id, user_id, data, plan, iteration')
    .eq('id', goalId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, status: 404, error: 'Goal not found' };
  if (data.user_id !== userId) return { ok: false, status: 403, error: 'Not your goal' };
  return { ok: true, goal: data };
}

// ── List ──────────────────────────────────────────────────────────

async function handleList(admin, userId, goalId) {
  if (!goalId) return { status: 400, error: 'goalId is required' };

  const ownership = await ensureGoalOwnership(admin, goalId, userId);
  if (!ownership.ok) return { status: ownership.status, error: ownership.error };

  const { data, error } = await admin
    .from('design_comments')
    .select(
      'id, goal_id, element_selector, element_text, comment_text, status, deployment_url, created_at, applied_at, updated_at'
    )
    .eq('goal_id', goalId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return { status: 200, data };
}

// ── Create ────────────────────────────────────────────────────────

async function handleCreate(admin, userId, body) {
  const goalId = body?.goalId || body?.goal_id;
  if (!goalId) return { status: 400, error: 'goalId is required' };

  const elementSelector = sanitizeText(
    body?.elementSelector || body?.element_selector,
    MAX_SELECTOR_LEN
  );
  const commentText = sanitizeText(body?.commentText || body?.comment_text, MAX_COMMENT_LEN);
  const elementText = sanitizeText(body?.elementText || body?.element_text, MAX_ELEMENT_TEXT_LEN);
  const deploymentUrl = sanitizeText(body?.deploymentUrl || body?.deployment_url, 500);

  if (!elementSelector) return { status: 400, error: 'elementSelector is required' };
  if (!commentText) return { status: 400, error: 'commentText is required' };

  const ownership = await ensureGoalOwnership(admin, goalId, userId);
  if (!ownership.ok) return { status: ownership.status, error: ownership.error };

  const { data, error } = await admin
    .from('design_comments')
    .insert({
      goal_id: goalId,
      user_id: userId,
      element_selector: elementSelector,
      element_text: elementText || null,
      comment_text: commentText,
      deployment_url: deploymentUrl || null,
    })
    .select(
      'id, goal_id, element_selector, element_text, comment_text, status, deployment_url, created_at'
    )
    .single();
  if (error) throw error;
  return { status: 201, data };
}

// ── Update ────────────────────────────────────────────────────────

async function handleUpdate(admin, userId, id, body) {
  if (!id) return { status: 400, error: 'id is required' };

  const updates = {};
  if (typeof body?.commentText === 'string') {
    updates.comment_text = sanitizeText(body.commentText, MAX_COMMENT_LEN);
    // Editing applied feedback creates a fresh application generation.
    if (typeof body?.status !== 'string') {
      updates.status = 'open';
      updates.applied_at = null;
    }
  }
  if (typeof body?.status === 'string') {
    if (!VALID_STATUSES.has(body.status))
      return { status: 400, error: `status must be one of ${[...VALID_STATUSES].join(', ')}` };
    updates.status = body.status;
    if (body.status === 'applied') updates.applied_at = new Date().toISOString();
  }
  if (Object.keys(updates).length === 0)
    return { status: 400, error: 'No updatable fields provided' };

  const { data, error } = await admin
    .from('design_comments')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select('id, goal_id, status, comment_text, applied_at, updated_at')
    .single();
  if (error) throw error;
  if (!data) return { status: 404, error: 'Comment not found' };
  return { status: 200, data };
}

// ── Delete ────────────────────────────────────────────────────────

async function handleDelete(admin, userId, id) {
  if (!id) return { status: 400, error: 'id is required' };

  const { error } = await admin.from('design_comments').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
  return { status: 200, data: { deleted: true } };
}

// ── Apply feedback ────────────────────────────────────────────────

/**
 * Bundle open comments into a targeted Designer/Developer re-run.
 *
 * Implemented as: enqueue an `apply-feedback` goal-orchestrator action.
 * The apply-feedback stage (lib/goal-handlers/stages/apply-feedback.js)
 * is responsible for the actual re-run logic — this endpoint only marks
 * the comments as 'applied' and signals the worker. Splitting it this way
 * keeps the API thin and lets the worker run the (slow) LLM call.
 */
function applicationMarker() {
  return {
    appliedAt: new Date().toISOString(),
    nonce: crypto.randomUUID(),
  };
}

function sameDatabaseTimestamp(left, right) {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  return Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs === rightMs;
}

async function inspectApplicationRows(admin, { goalId, userId, commentIds }) {
  try {
    const { data, error } = await admin
      .from('design_comments')
      .select(COMMENT_APPLICATION_SELECT)
      .eq('goal_id', goalId)
      .eq('user_id', userId)
      .in('id', commentIds);
    if (error) return { state: 'unknown', error };
    return { state: 'known', rows: Array.isArray(data) ? data : [] };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

async function claimOpenComments(admin, { goalId, userId, candidates, appliedAt }) {
  const commentIds = candidates.map((comment) => comment.id);
  let response;
  let writeError = null;
  try {
    response = await admin
      .from('design_comments')
      .update({ status: 'applied', applied_at: appliedAt })
      .eq('goal_id', goalId)
      .eq('user_id', userId)
      .eq('status', 'open')
      .in('id', commentIds)
      .select(COMMENT_APPLICATION_SELECT);
    writeError = response?.error || null;
  } catch (error) {
    writeError = error;
  }

  if (!writeError && Array.isArray(response?.data)) return response.data;

  // A lost PostgREST response can hide a committed update. Inspect only the
  // exact tenant-owned IDs and accept rows carrying this application's unique
  // marker; all other outcomes remain fail-closed.
  const inspection = await inspectApplicationRows(admin, { goalId, userId, commentIds });
  if (inspection.state !== 'known') {
    const error = new Error('Unable to reconcile feedback comment application claim');
    error.code = 'FEEDBACK_APPLICATION_CLAIM_UNVERIFIED';
    error.cause = writeError || inspection.error;
    throw error;
  }
  const claimed = inspection.rows.filter(
    (comment) =>
      comment.status === 'applied' && sameDatabaseTimestamp(comment.applied_at, appliedAt)
  );
  if (claimed.length > 0) return claimed;
  if (writeError) throw writeError;
  return [];
}

function classifyCommentRollback(rows, { goalId, userId, commentIds, appliedAt }) {
  const expectedIds = new Set(commentIds);
  const exactRows = Array.isArray(rows)
    ? rows.filter(
        (comment) =>
          expectedIds.has(comment.id) && comment.goal_id === goalId && comment.user_id === userId
      )
    : [];
  if (
    exactRows.length !== expectedIds.size ||
    new Set(exactRows.map((row) => row.id)).size !== expectedIds.size
  ) {
    return 'conflict';
  }
  if (exactRows.every((comment) => comment.status === 'open' && comment.applied_at == null)) {
    return 'committed';
  }
  if (
    exactRows.every(
      (comment) =>
        comment.status === 'applied' && sameDatabaseTimestamp(comment.applied_at, appliedAt)
    )
  ) {
    return 'original';
  }
  return 'conflict';
}

async function rollbackCommentClaim(admin, { goalId, userId, commentIds, appliedAt }) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let response = null;
    let writeError = null;
    try {
      response = await admin
        .from('design_comments')
        .update({ status: 'open', applied_at: null })
        .eq('goal_id', goalId)
        .eq('user_id', userId)
        .eq('status', 'applied')
        .eq('applied_at', appliedAt)
        .in('id', commentIds)
        .select(COMMENT_APPLICATION_SELECT);
      writeError = response?.error || null;
    } catch (error) {
      writeError = error;
    }

    if (!writeError) {
      const directState = classifyCommentRollback(response?.data, {
        goalId,
        userId,
        commentIds,
        appliedAt,
      });
      if (directState === 'committed') return { state: 'committed' };
    }

    const inspection = await inspectApplicationRows(admin, { goalId, userId, commentIds });
    if (inspection.state !== 'known') {
      lastError = writeError || inspection.error || new Error('Rollback inspection failed');
      break;
    }
    const inspectedState = classifyCommentRollback(inspection.rows, {
      goalId,
      userId,
      commentIds,
      appliedAt,
    });
    if (inspectedState === 'committed') return { state: 'committed' };
    if (inspectedState !== 'original' || attempt === 1) {
      return { state: inspectedState, error: writeError };
    }
    lastError = writeError;
  }

  log.error(null, 'design-comments.apply.rollback-unverified', {
    goalId,
    error: lastError?.message || 'unknown rollback outcome',
  });
  return { state: 'unknown', error: lastError };
}

function failedApplyResult(message, rollback) {
  if (rollback.state === 'committed') return { status: 503, error: message };
  return {
    status: 503,
    error: `${message}; feedback comment rollback is unverified and requires reconciliation before retrying`,
  };
}

async function handleApply(admin, userId, goalId) {
  if (!goalId) return { status: 400, error: 'goalId is required' };

  const ownership = await ensureGoalOwnership(admin, goalId, userId);
  if (!ownership.ok) return { status: ownership.status, error: ownership.error };

  const { data: open, error: openErr } = await admin
    .from('design_comments')
    .select(COMMENT_APPLICATION_SELECT)
    .eq('goal_id', goalId)
    .eq('user_id', userId)
    .eq('status', 'open')
    .order('created_at', { ascending: true })
    .limit(MAX_COMMENTS_PER_APPLICATION);
  if (openErr) throw openErr;
  if (!open || open.length === 0) {
    return { status: 200, data: { applied: 0, message: 'No open comments to apply' } };
  }

  const marker = applicationMarker();
  let claimed;
  try {
    claimed = await claimOpenComments(admin, {
      goalId,
      userId,
      candidates: open,
      appliedAt: marker.appliedAt,
    });
  } catch (error) {
    log.warn(null, 'design-comments.apply.claim-failed', { error: error.message, goalId });
    return { status: 503, error: `Failed to claim feedback comments: ${error.message}` };
  }
  if (!claimed.length) {
    return {
      status: 409,
      error: 'Open comments changed while feedback was being applied; refresh and try again',
    };
  }

  const commentIds = claimed.map((comment) => comment.id).sort();
  const feedbackApplicationVersion = buildFeedbackApplicationVersion({
    goalId,
    userId,
    nonce: marker.nonce,
    comments: claimed,
  });

  // Enqueue and wake the exact durable application row. Preview has no polling
  // fallback, so enqueueAgentJob rejects if that exact wake cannot be verified.
  let job;
  try {
    job = await enqueueAgentJob(
      admin,
      {
        id: deterministicAgentJobId('design-comments-apply', {
          goalId,
          feedbackApplicationVersion,
        }),
        user_id: userId,
        payload: {
          type: 'orchestrate-goal',
          action: 'apply-feedback',
          goalId,
          _userId: userId,
          userId,
          user_id: userId,
          commentIds,
          feedbackApplicationNonce: marker.nonce,
          feedbackApplicationVersion,
        },
      },
      { idempotent: true }
    );
  } catch (err) {
    log.warn(null, 'design-comments.apply.enqueue-failed', { error: err.message, goalId });
    const rollback = await rollbackCommentClaim(admin, {
      goalId,
      userId,
      commentIds,
      appliedAt: marker.appliedAt,
    });
    return failedApplyResult(`Failed to enqueue apply-feedback: ${err.message}`, rollback);
  }

  if (!['queued', 'running'].includes(job?.status)) {
    const rollback = await rollbackCommentClaim(admin, {
      goalId,
      userId,
      commentIds,
      appliedAt: marker.appliedAt,
    });
    return failedApplyResult(
      `Apply-feedback job was not accepted in an active state (${job?.status || 'unknown'})`,
      rollback
    );
  }

  return {
    status: 202,
    data: {
      applied: claimed.length,
      goal_id: goalId,
      job_id: job.id,
      feedback_application_version: feedbackApplicationVersion,
      message: `Queued ${claimed.length} comments for re-run`,
    },
  };
}

// ── Router ────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (cors(res, req)) return;

  const op = (req.query?.op || '').trim().toLowerCase();
  const id = req.query?.id || req.body?.id || '';
  const goalId =
    req.query?.goalId || req.query?.goal_id || req.body?.goalId || req.body?.goal_id || '';

  const token = getBearerToken(req);
  if (!token) return jsonError(res, 401, 'Missing token');
  const user = await verifySupabaseToken(token);
  if (!user?.id) return jsonError(res, 401, 'Invalid token');

  const rl = checkRateLimit({
    key: `design-comments:${getRateLimitIdentifier(req, user.id)}`,
    limit: 60,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Rate limited');

  const admin = buildSupabaseAdminClient();

  try {
    let result;
    switch (op) {
      case 'list':
        result = await handleList(admin, user.id, goalId);
        break;
      case 'create':
        result = await handleCreate(admin, user.id, req.body);
        break;
      case 'update':
        result = await handleUpdate(admin, user.id, id, req.body);
        break;
      case 'delete':
        result = await handleDelete(admin, user.id, id);
        break;
      case 'apply':
        result = await handleApply(admin, user.id, goalId);
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
