/**
 * Osja Regen — auto-regenerate a single deliverable using Osja's critique.
 *
 * Triggered by osja-review.js when a deliverable scores below the producing
 * agent's `osja_regen_threshold` and the per-goal regen cap is not exhausted.
 *
 * Flow:
 *   1. Load deliverable from goals.data.deliverables and the producing agent
 *   2. (If pulse-enabled agent) check budget via checkPulseBudget; abort if over
 *   3. Build a regen prompt: original task + Osja's critique + recreate_prompt
 *      + top library anchors + the agent's recent osja-lessons
 *   4. Call the agent's provider/model via executeLlmV2
 *   5. Archive the old output into deliverable.previous_versions, replace with
 *      regen output, increment deliverable.osja_regen_count
 *   6. Also update team_tasks.data.output (source of truth) when we can
 *      resolve the originating task row
 *   7. Enqueue a single-deliverable osja-review pass so the new output is
 *      scored against the library
 */
import { createLogger } from '../../../api/_lib/logger.js';
import { resolveAcceptedNativeGoalAuthority } from '../../_shared/native-goal-authority.js';
import { executeLlmV2Tracked } from '../../usage-handlers/tracked-llm.js';
import { checkPulseBudget } from '../../agent-handlers/pulse-handler.js';
import {
  loadGoal,
  logGoalEvent,
  notifyGoalEvent,
  enqueueGoalAction,
  loadOsjaLessonsForAgent,
} from '../_helpers.js';
import { resolveGoalStageLlm } from '../goal-stage-llm.js';
import { currentGoalTaskAttempt } from '../current-goal-task-attempt.js';
import { prdCompletionAttestationDecision } from '../../quality/prd-quality-gate.js';
import { orgScopeFromGoal } from '../../_shared/kb-scope.js';

const log = createLogger('goal-stage:osja-regen');

export function completedQualityArtifactImmutability(goal, deliverable) {
  const attestation = goal?.data?.prd_quality_attestation;
  if (goal?.status !== 'completed' || attestation?.status !== 'passed') {
    return { guarded: false, current: false, reasons: [] };
  }

  const decision = prdCompletionAttestationDecision({
    goal,
    artifact: deliverable?.output || '',
    attestation,
    threshold: attestation.threshold,
  });
  return {
    guarded: true,
    current: decision.applicable && decision.allowed,
    reasons: decision.reasons || [],
  };
}

function buildRegenPrompt({ deliverable, verdict, anchors, lessons, goalTitle }) {
  const anchorBlock = (anchors || [])
    .map((a, i) => {
      const m = a.metadata || {};
      return `Anchor ${i + 1}: ${a.title} (score ${m.quality_score}/100)\nWhat makes it great: ${m.what_makes_it_great || ''}`;
    })
    .join('\n\n');

  const lessonBlock =
    (lessons || []).length > 0
      ? `\n\n## Prior Osja lessons for this agent\n${lessons.map((l) => `- ${l}`).join('\n')}`
      : '';

  return [
    `You are regenerating a deliverable that Osja, the General Manager, scored ${verdict.score}/100.`,
    `Her verdict: ${verdict.reasoning || '(no reasoning)'}`,
    '',
    '## Goal',
    goalTitle,
    '',
    '## Original deliverable',
    `Title: ${deliverable.title || '(untitled)'}`,
    `Type: ${deliverable.deliverable_type || 'unknown'}`,
    '',
    'Original output:',
    String(deliverable.output || '').slice(0, 4000),
    '',
    '## What to change (from Osja)',
    (verdict.what_to_change || []).map((c) => `- ${c}`).join('\n') ||
      '(none specified — apply general taste improvements)',
    verdict.recreate_prompt ? `\n\n## Osja's recreate prompt\n${verdict.recreate_prompt}` : '',
    anchorBlock ? `\n\n## Library anchors (best-in-class references)\n${anchorBlock}` : '',
    lessonBlock,
    '',
    '## Your task',
    'Produce a revised deliverable that addresses every item in "What to change" and reaches library-grade quality. Return only the deliverable content — no preamble, no meta-commentary.',
  ]
    .filter(Boolean)
    .join('\n');
}

async function resolveTaskRow(admin, deliverable, goal) {
  // deliverable.id on the goals.data.deliverables view is the team_tasks id
  if (!deliverable.id) return null;
  const { data } = await admin
    .from('team_tasks')
    .select(
      'id, goal_id, user_id, agent_id, materialization_attempt, data, assigned_to, status, updated_at'
    )
    .eq('id', deliverable.id)
    .eq('goal_id', goal.id)
    .eq('user_id', goal.user_id)
    .maybeSingle();
  const currentById = currentGoalTaskAttempt(goal, data ? [data] : [])[0];
  if (currentById) return currentById;

  // Fallback: find current-attempt candidates by goal_id + title. Multiple
  // revisions can retain the same title, so a bare limit(1) is not safe.
  const { data: byTitle } = await admin
    .from('team_tasks')
    .select(
      'id, goal_id, user_id, agent_id, materialization_attempt, data, assigned_to, status, updated_at'
    )
    .eq('data->>goal_id', goal.id)
    .eq('user_id', goal.user_id)
    .ilike('title', deliverable.title || '')
    .order('updated_at', { ascending: false })
    .limit(20);
  return currentGoalTaskAttempt(goal, byTitle || [])[0] || null;
}

async function resolveAgent(admin, deliverable, taskRow, userId) {
  // deliverable.agent_id is text — may be a UUID referencing agents.id
  const agentId = taskRow?.agent_id || deliverable.agent_id;
  if (!agentId) return null;
  const { data } = await admin
    .from('agents')
    .select(
      'id, user_id, status, name, role, provider, model, system_prompt, metadata, osja_regen_threshold, osja_regen_max_attempts, osja_learning_enabled'
    )
    .eq('id', agentId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.status === 'active' && String(data.user_id || '') === String(userId) ? data : null;
}

async function loadLibraryAnchors(admin, deliverableType, goal) {
  if (!deliverableType) return [];
  const userId = typeof goal?.user_id === 'string' ? goal.user_id.trim() : '';
  if (!userId) throw new Error('OSJA_REGEN_OWNER_VALIDATION_ERROR: goal owner is required');
  const scope = orgScopeFromGoal(goal);
  let tenantQuery = admin
    .from('knowledge_documents')
    .select('id, title, content, metadata')
    .eq('category', 'library_example')
    .eq('metadata->>deliverable_type', deliverableType)
    .eq('user_id', userId);
  tenantQuery = scope.organization_id
    ? tenantQuery.eq('organization_id', scope.organization_id)
    : tenantQuery.is('organization_id', null);
  const publicQuery = admin
    .from('knowledge_documents')
    .select('id, title, content, metadata')
    .eq('category', 'library_example')
    .eq('metadata->>deliverable_type', deliverableType)
    .eq('metadata->>source', 'curated')
    .is('user_id', null)
    .is('organization_id', null);
  const [{ data: tenantRows, error: tenantError }, { data: publicRows, error: publicError }] =
    await Promise.all([
      tenantQuery.order('metadata->quality_score', { ascending: false }).limit(3),
      publicQuery.order('metadata->quality_score', { ascending: false }).limit(3),
    ]);
  if (tenantError) throw tenantError;
  if (publicError) throw publicError;
  const rows = [...(tenantRows || []), ...(publicRows || [])];
  return [...new Map(rows.map((row) => [row.id || row.title, row])).values()]
    .sort(
      (left, right) =>
        Number(right.metadata?.quality_score || 0) - Number(left.metadata?.quality_score || 0)
    )
    .slice(0, 3);
}

function requirePayloadOwner(payload) {
  const aliases = ['_userId', 'userId', 'user_id']
    .filter((field) => Object.hasOwn(payload || {}, field))
    .map((field) => (typeof payload[field] === 'string' ? payload[field].trim() : ''));
  const owner = aliases[0] || '';
  if (!owner || aliases.some((value) => value !== owner)) {
    const error = new Error('OSJA_REGEN_OWNER_VALIDATION_ERROR: durable owner mismatch');
    error.code = 'OSJA_REGEN_OWNER_VALIDATION_ERROR';
    throw error;
  }
  return owner;
}

export async function handle(admin, payload, req) {
  const { goalId, deliverableId, verdict } = payload;
  if (!goalId || !deliverableId) {
    throw new Error('osja-regen requires goalId and deliverableId');
  }

  const authorizationUserId = requirePayloadOwner(payload);
  const goal = await loadGoal(admin, goalId, authorizationUserId);
  if (!goal || String(goal.user_id || '') !== authorizationUserId) {
    throw new Error('OSJA_REGEN_OWNER_VALIDATION_ERROR: goal is not owned by durable owner');
  }
  const nativeAuthority = resolveAcceptedNativeGoalAuthority(goal);
  if (nativeAuthority.native) {
    return {
      type: 'orchestrate-goal',
      action: 'osja-regen',
      goalId,
      skipped: true,
      reason: nativeAuthority.ready
        ? 'native_regen_requires_new_scope_attempt'
        : 'native_scope_authority_invalid',
      reasons: nativeAuthority.reasons,
    };
  }
  const deliverables = goal.data?.deliverables || [];
  const idx = deliverables.findIndex((d) => String(d.id) === String(deliverableId));
  if (idx === -1) {
    log.warn(req, 'osja-regen.deliverable-not-found', { goalId, deliverableId });
    return {
      type: 'orchestrate-goal',
      action: 'osja-regen',
      goalId,
      skipped: true,
      reason: 'deliverable-not-found',
    };
  }

  const deliverable = deliverables[idx];
  const immutability = completedQualityArtifactImmutability(goal, deliverable);
  if (immutability.guarded) {
    log.warn(req, 'osja-regen.skipped-immutable-quality-attestation', {
      goalId,
      deliverableId,
      current: immutability.current,
      reasons: immutability.reasons,
    });
    return {
      type: 'orchestrate-goal',
      action: 'osja-regen',
      goalId,
      skipped: true,
      reason: immutability.current ? 'immutable-quality-attestation' : 'stale-quality-attestation',
    };
  }

  const taskRow = await resolveTaskRow(admin, deliverable, goal);
  const agent = await resolveAgent(admin, deliverable, taskRow, goal.user_id);

  if (!agent) {
    log.warn(req, 'osja-regen.agent-not-found', { goalId, deliverableId });
    return {
      type: 'orchestrate-goal',
      action: 'osja-regen',
      goalId,
      skipped: true,
      reason: 'agent-not-found',
    };
  }

  // Budget check for pulse-enabled agents. checkPulseBudget transparently
  // returns { allowed: true } when the agent isn't in concilium_agents, so
  // non-pulse agents fall through. The per-goal regen cap is enforced in
  // osja-review.js before this job is ever enqueued.
  try {
    const budget = await checkPulseBudget(admin, agent.id, authorizationUserId);
    if (!budget.allowed) {
      log.info(req, 'osja-regen.budget-exhausted', {
        agentId: agent.id,
        todayCost: budget.todayCost,
      });
      return {
        type: 'orchestrate-goal',
        action: 'osja-regen',
        goalId,
        skipped: true,
        reason: 'budget-exhausted',
      };
    }
  } catch (budgetErr) {
    log.warn(req, 'osja-regen.budget-check-failed', { error: budgetErr.message });
    return {
      type: 'orchestrate-goal',
      action: 'osja-regen',
      goalId,
      skipped: true,
      reason: 'budget-check-failed',
    };
  }

  const anchors = await loadLibraryAnchors(admin, deliverable.deliverable_type, goal);
  const lessons = await loadOsjaLessonsForAgent(admin, agent.id, goal.user_id, 5);

  const revalidateAuthority = async () => {
    const currentGoal = await loadGoal(admin, goalId, authorizationUserId);
    const currentDeliverable = currentGoal?.data?.deliverables?.find(
      (candidate) => String(candidate.id) === String(deliverableId)
    );
    if (
      !currentGoal ||
      String(currentGoal.user_id || '') !== authorizationUserId ||
      currentGoal.status !== goal.status ||
      !currentDeliverable ||
      String(currentDeliverable.output || '') !== String(deliverable.output || '')
    ) {
      return { status: 'authorization_revoked', reason: 'osja_regen_authority_changed' };
    }
    const currentAgent = await resolveAgent(
      admin,
      currentDeliverable,
      taskRow,
      authorizationUserId
    );
    if (!currentAgent || String(currentAgent.id) !== String(agent.id)) {
      return { status: 'authorization_revoked', reason: 'osja_regen_agent_changed' };
    }
    return null;
  };

  const preModelAuthority = await revalidateAuthority();
  if (preModelAuthority) {
    return {
      type: 'orchestrate-goal',
      action: 'osja-regen',
      goalId,
      skipped: true,
      reason: preModelAuthority.reason,
    };
  }

  const systemPrompt =
    agent.system_prompt ||
    `You are ${agent.name || 'an AI agent'}${agent.role ? `, ${agent.role}` : ''}. Produce library-grade deliverables that address all of Osja's critique.`;

  const userPrompt = buildRegenPrompt({
    deliverable,
    verdict: verdict || { score: 0, reasoning: 'unknown', what_to_change: [], recreate_prompt: '' },
    anchors,
    lessons,
    goalTitle: `${goal.title} — ${goal.description || ''}`.slice(0, 800),
  });

  let newOutput;
  let llmResult;
  try {
    llmResult = await executeLlmV2Tracked({
      ...resolveGoalStageLlm(),
      temperature: 0.3,
      maxTokens: 3000,
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      beforeInternalExternalAction: revalidateAuthority,
      usage: {
        admin,
        userId: goal.user_id,
        goalId: goal.id,
        organizationId: goal.org_id,
        teamId: goal.agent_team_id || goal.team_id,
        consiliumId: goal.concilium_id,
        agentId: agent.id,
        agentTable: 'agents',
        agentName: agent.name,
        source: 'osja-regen',
        operation: 'regenerate',
        description: `Osja regen: ${deliverable.title || deliverableId}`,
      },
    });
    newOutput = (llmResult.content || '').trim();
  } catch (err) {
    log.warn(req, 'osja-regen.llm-failed', { error: err.message, agentId: agent.id });
    return {
      type: 'orchestrate-goal',
      action: 'osja-regen',
      goalId,
      skipped: true,
      reason: 'llm-failed',
    };
  }

  if (!newOutput) {
    log.warn(req, 'osja-regen.empty-output', { agentId: agent.id });
    return {
      type: 'orchestrate-goal',
      action: 'osja-regen',
      goalId,
      skipped: true,
      reason: 'empty-output',
    };
  }

  const preWriteAuthority = await revalidateAuthority();
  if (preWriteAuthority) {
    return {
      type: 'orchestrate-goal',
      action: 'osja-regen',
      goalId,
      skipped: true,
      reason: preWriteAuthority.reason,
    };
  }

  // Archive old output into previous_versions and replace
  const archived = {
    output: deliverable.output,
    score: (verdict && verdict.score) ?? null,
    archived_at: new Date().toISOString(),
  };
  const updatedDeliverable = {
    ...deliverable,
    output: newOutput,
    output_preview: newOutput.slice(0, 300),
    previous_versions: [...(deliverable.previous_versions || []), archived],
    osja_regen_count: (deliverable.osja_regen_count || 0) + 1,
    last_regen_at: new Date().toISOString(),
  };

  const newDeliverables = deliverables.map((d, i) => (i === idx ? updatedDeliverable : d));

  await admin
    .from('goals')
    .update({
      data: { ...(goal.data || {}), deliverables: newDeliverables },
      updated_at: new Date().toISOString(),
    })
    .eq('id', goalId)
    .eq('user_id', authorizationUserId);

  // Keep team_tasks in sync when we can resolve the row (source of truth)
  if (taskRow?.id) {
    const mergedTaskData = {
      ...(taskRow.data || {}),
      output: newOutput,
      previous_outputs: [
        ...(taskRow.data?.previous_outputs || []),
        {
          output: taskRow.data?.output,
          regenerated_at: archived.archived_at,
          reason: 'osja-regen',
        },
      ],
      osja_regen_count: (taskRow.data?.osja_regen_count || 0) + 1,
    };
    await admin
      .from('team_tasks')
      .update({
        data: mergedTaskData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskRow.id)
      .eq('user_id', authorizationUserId)
      .eq('goal_id', goalId);
  }

  await logGoalEvent(admin, goalId, 'osja_regen_completed', {
    deliverableId,
    agentId: agent.id,
    previousScore: verdict?.score ?? null,
    regenCount: updatedDeliverable.osja_regen_count,
  });
  await notifyGoalEvent(admin, goal, 'osja_review_ready', {
    feedback: `Regenerated "${deliverable.title}" based on Osja's critique (attempt ${updatedDeliverable.osja_regen_count}).`,
  });

  // Re-score just this deliverable — osja-review accepts a singleDeliverableId
  // option so we don't re-score the whole goal.
  await enqueueGoalAction(admin, 'osja-review', goalId, { singleDeliverableId: deliverableId });

  log.info(req, 'osja-regen.done', { goalId, deliverableId, agentId: agent.id });

  return {
    type: 'orchestrate-goal',
    action: 'osja-regen',
    goalId,
    deliverableId,
    regenCount: updatedDeliverable.osja_regen_count,
    costUsd: llmResult?.estimatedCostUsd || 0,
  };
}
