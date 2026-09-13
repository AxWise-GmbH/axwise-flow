/**
 * Job handler: loop-refine-parent-deliverables
 *
 * When a continuation goal is spawned (see loop-continuation.js), this job
 * is enqueued. It iterates the parent goal's refinable artifacts and pipes
 * each through the existing "Improve quality" pipeline (deliverable-refine
 * handleStart), using the continuation's strategic outputs as the prompt.
 *
 * The result: each parent deliverable gets a v2 tagged source_goal_id =
 * continuation, so the UI can label them "🔁 Refined by continuation".
 *
 * Cap handling: each parent goal is only ever refined by ONE child, so we
 * always land in the v2 slot. Goals already at v3 (user used both manual
 * refinements first) get skipped with a log entry — we don't compete with
 * the user for slots.
 */
import { createLogger } from '../../api/_lib/logger.js';
import { handleStart as refineStart } from '../api-handlers/deliverable-refine.js';
import { buildRefinementPromptFromContinuation } from './loop-continuation.js';

const log = createLogger('loop-refine-parent');

// Artifact kinds we know how to refine. (PDF/deck/data are out of scope per
// deliverable-refine.js; landing pages are handled separately via the
// landing_page parent kind.)
const REFINABLE_ARTIFACT_KINDS = new Set(['html', 'report', 'markdown', 'note', 'image', 'banner']);

/**
 * Build the list of refinement targets for a parent goal.
 * Returns rows of { kind: 'goal_artifact'|'landing_page'|'knowledge_document', id, title }.
 */
async function loadRefinableDeliverables(admin, parentGoalId, userId, maxVersions = 2) {
  const targets = [];
  const cap = Number.isFinite(Number(maxVersions)) ? Number(maxVersions) : 2;

  // goal_artifacts
  try {
    const { data: arts } = await admin
      .from('goal_artifacts')
      .select('id, kind, title, filename, refinement_count')
      .eq('goal_id', parentGoalId)
      .eq('user_id', userId)
      .is('deleted_at', null);
    for (const a of arts || []) {
      const k = String(a.kind || '').toLowerCase();
      if (!REFINABLE_ARTIFACT_KINDS.has(k)) continue;
      // Skip once the per-loop refinement cap is reached (default 2 = v3 slot).
      if (Number(a.refinement_count || 0) >= cap) continue;
      targets.push({
        kind: 'goal_artifact',
        id: a.id,
        title: a.title || a.filename || `artifact ${a.id.slice(0, 8)}`,
      });
    }
  } catch (err) {
    log.warn(null, 'refine.load.artifacts.failed', { parentGoalId, error: err.message });
  }

  // landing_pages
  try {
    const { data: lps } = await admin
      .from('landing_pages')
      .select('id, title, refinement_count')
      .eq('goal_id', parentGoalId)
      .eq('user_id', userId);
    for (const lp of lps || []) {
      if (Number(lp.refinement_count || 0) >= cap) continue;
      targets.push({
        kind: 'landing_page',
        id: lp.id,
        title: lp.title || `landing page ${lp.id.slice(0, 8)}`,
      });
    }
  } catch (err) {
    log.warn(null, 'refine.load.landings.failed', { parentGoalId, error: err.message });
  }

  // knowledge_documents linked to this goal via metadata
  try {
    const { data: docs } = await admin
      .from('knowledge_documents')
      .select('id, title, refinement_count')
      .eq('user_id', userId)
      .filter('metadata->>goal_id', 'eq', parentGoalId);
    for (const d of docs || []) {
      if (Number(d.refinement_count || 0) >= cap) continue;
      targets.push({
        kind: 'knowledge_document',
        id: d.id,
        title: d.title || `doc ${d.id.slice(0, 8)}`,
      });
    }
  } catch (err) {
    log.warn(null, 'refine.load.docs.failed', { parentGoalId, error: err.message });
  }

  return targets;
}

async function authorizeRefinementChain(admin, { parentGoalId, continuationGoalId, userId }) {
  const { data: parent, error: parentError } = await admin
    .from('goals')
    .select('id, user_id, continuation_goal_id')
    .eq('id', parentGoalId)
    .eq('user_id', userId)
    .maybeSingle();
  if (parentError) throw new Error(`unable to authorize parent goal: ${parentError.message}`);

  const { data: continuation, error: continuationError } = await admin
    .from('goals')
    .select('id, user_id, parent_goal_id')
    .eq('id', continuationGoalId)
    .eq('user_id', userId)
    .eq('parent_goal_id', parentGoalId)
    .maybeSingle();
  if (continuationError) {
    throw new Error(`unable to authorize continuation goal: ${continuationError.message}`);
  }

  if (
    !parent ||
    !continuation ||
    parent.user_id !== userId ||
    continuation.user_id !== userId ||
    parent.continuation_goal_id !== continuationGoalId ||
    continuation.parent_goal_id !== parentGoalId
  ) {
    throw new Error('parent and continuation goals are not an owned linked refinement chain');
  }
}

export async function handleLoopRefineParentDeliverables(admin, payload, req, expectedUserId) {
  const { parentGoalId, continuationGoalId, projectOverview, refineMaxVersions } = payload || {};
  if (!parentGoalId || !continuationGoalId) {
    return {
      type: 'loop-refine-parent-deliverables',
      error: 'missing parent or continuation goal id',
    };
  }

  const payloadUserId = typeof payload?._userId === 'string' ? payload._userId.trim() : '';
  const durableUserId = typeof expectedUserId === 'string' ? expectedUserId.trim() : '';
  if (durableUserId && payloadUserId && durableUserId !== payloadUserId) {
    return { type: 'loop-refine-parent-deliverables', error: 'owner identity mismatch' };
  }
  if (!durableUserId) {
    return { type: 'loop-refine-parent-deliverables', error: 'expected owner user_id is required' };
  }
  const userId = durableUserId;

  try {
    await authorizeRefinementChain(admin, { parentGoalId, continuationGoalId, userId });
  } catch (error) {
    log.warn(req, 'refine.authority.rejected', {
      parentGoalId,
      continuationGoalId,
      error: error.message,
    });
    return { type: 'loop-refine-parent-deliverables', error: error.message };
  }

  const targets = await loadRefinableDeliverables(admin, parentGoalId, userId, refineMaxVersions);
  log.info(req, 'refine.targets', {
    parentGoalId,
    continuationGoalId,
    targetCount: targets.length,
  });

  const results = [];
  for (const target of targets) {
    const prompt = buildRefinementPromptFromContinuation(projectOverview, target.title);
    try {
      const r = await refineStart(admin, userId, {
        kind: target.kind,
        parent_id: target.id,
        prompt,
        source_goal_id: continuationGoalId,
      });
      results.push({ ...target, status: r.status, version: r.data?.version });
      if (r.status >= 400) {
        log.warn(req, 'refine.target.failed', {
          target: target.id,
          status: r.status,
          error: r.error,
        });
      } else {
        log.info(req, 'refine.target.done', { target: target.id, version: r.data?.version });
      }
    } catch (err) {
      results.push({ ...target, status: 500, error: err.message });
      log.warn(req, 'refine.target.exception', { target: target.id, error: err.message });
    }
  }

  return {
    type: 'loop-refine-parent-deliverables',
    parentGoalId,
    continuationGoalId,
    refinedCount: results.filter((r) => r.status === 200).length,
    totalTargets: targets.length,
    results,
  };
}
