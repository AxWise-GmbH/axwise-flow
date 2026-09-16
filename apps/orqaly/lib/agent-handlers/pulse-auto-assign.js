/**
 * Pulse Auto-Assign — consilium auto-assignment & goal sub-decomposition.
 *
 * 1. autoAssignGoalsToAgents  — match free pulse agents to unassigned goals
 * 2. decomposeGoalIntoSubGoals — break a parent goal into 2-5 child goals
 * 3. reassignCompletedPulseAgents — clear goal from agents whose goal ended
 */
import { executeLlmTracked } from '../usage-handlers/tracked-llm.js';
import { createLogger } from '../../api/_lib/logger.js';
import { capabilityOverlap } from '../goal-handlers/team-assigner.js';
import { defaultProvider, defaultCheapModel, defaultModel } from '../_shared/llm-defaults.js';
import { bindAgentJobsToWorkerDeployment } from './worker-scope.js';
import { resolveAcceptedNativeGoalAuthority } from '../_shared/native-goal-authority.js';
import { hasNativeAxwiseScopeMarkers } from '../_shared/native-scope-approval.js';

const log = createLogger('pulse-auto-assign');

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Safely parse a JSON string, returning null on failure.
 */
function safeParse(text) {
  try {
    // Strip markdown fences if present
    const cleaned = text
      .replace(/```json\s*/gi, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function nativePulseAuthorityText(authority) {
  const packet = authority.packet;
  return [
    packet?.intent?.objective,
    packet?.intent?.problem,
    packet?.intent?.desired_outcome,
    authority.deliverable?.type,
    authority.deliverable?.title_prefix,
    ...(authority.deliverable?.required_sections || []),
    ...(packet?.ledger?.requirements || []).map((item) => item?.text),
    ...(packet?.ledger?.constraints || []).map((item) => item?.text),
    ...(authority.admission?.work_types || []),
    ...(authority.admission?.required_capabilities || []),
    ...(authority.admission?.requested_actions || []).map((item) => item?.action),
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Return the only goal text Pulse may use for matching or prompting.
 * Once a native marker exists, corrupt/incomplete authority is ineligible and
 * accepted authority is projected solely from the canonical packet.
 */
export function resolvePulseGoalAuthority(goal) {
  const authority = resolveAcceptedNativeGoalAuthority(goal);
  if (authority.native) {
    if (!authority.ready) {
      return { eligible: false, native: true, reasons: authority.reasons, text: '', label: '' };
    }
    return {
      eligible: true,
      native: true,
      scopeHash: authority.packet.scope_hash,
      label: String(authority.packet.intent.objective || 'Approved native goal'),
      text: nativePulseAuthorityText(authority),
    };
  }
  return {
    eligible: true,
    native: false,
    scopeHash: null,
    label: String(goal?.title || 'Goal'),
    text: [goal?.title, goal?.description].filter(Boolean).join('\n'),
  };
}

/** Exact tenant pairing plus native fail-closed filtering for the global cron. */
export function pulseAssignmentCandidates(agent, goals = []) {
  return (Array.isArray(goals) ? goals : [])
    .filter((goal) => String(goal?.user_id || '') === String(agent?.user_id || ''))
    .map((goal) => ({ goal, authority: resolvePulseGoalAuthority(goal) }))
    .filter((candidate) => candidate.authority.eligible);
}

// ── 1. autoAssignGoalsToAgents ──────────────────────────────────────────────

/**
 * Match free pulse-enabled agents to unassigned active goals using capability
 * scoring + a cheap LLM confirmation.
 *
 * Called from the process-next cron.
 *
 * @param {object} admin — Supabase admin client
 * @returns {Promise<{ assigned: number, assignments: Array }>}
 */
export async function autoAssignGoalsToAgents(admin) {
  log.info(null, 'auto-assign.start');

  // 1. Find free pulse agents (active, pulse-enabled, no current goal)
  const { data: freeAgents, error: agentsErr } = await admin
    .from('concilium_agents')
    .select('id, user_id, name, agent_type, description, metadata, check_in_interval_ms')
    .eq('pulse_enabled', true)
    .is('pulse_goal_id', null)
    .eq('status', 'active')
    .limit(5);

  if (agentsErr) {
    log.warn(null, 'auto-assign.agents-query-failed', { error: agentsErr.message });
    return { assigned: 0 };
  }

  if (!freeAgents?.length) {
    log.info(null, 'auto-assign.no-free-agents');
    return { assigned: 0 };
  }

  // concilium_agents keeps extensible matching attributes in metadata. Older
  // code selected top-level `capabilities` and `category` columns that have
  // never existed on this table, causing every worker tick to fail on a clean
  // database. Normalize the stored profile into the shape capabilityOverlap
  // expects without changing the public schema.
  const normalizedFreeAgents = freeAgents.map((agent) => ({
    ...agent,
    capabilities: Array.isArray(agent.metadata?.capabilities) ? agent.metadata.capabilities : [],
    category:
      agent.metadata?.category || agent.metadata?.agent_category || agent.agent_type || 'general',
  }));
  const freeAgentOwnerIds = [
    ...new Set(normalizedFreeAgents.map((agent) => agent.user_id).filter(Boolean)),
  ];
  if (!freeAgentOwnerIds.length) {
    log.warn(null, 'auto-assign.agents-missing-owner');
    return { assigned: 0 };
  }

  // 2. Find goals that need work and have no pulse agent assigned
  const { data: activeGoals, error: goalsErr } = await admin
    .from('goals')
    .select('id, user_id, org_id, title, description, budget_usd, status, parsed_priority, data')
    .in('user_id', freeAgentOwnerIds)
    .in('status', ['active', 'planning', 'feasibility'])
    .limit(Math.max(20, freeAgentOwnerIds.length * 20));

  if (goalsErr) {
    log.warn(null, 'auto-assign.goals-query-failed', { error: goalsErr.message });
    return { assigned: 0 };
  }

  if (!activeGoals?.length) {
    log.info(null, 'auto-assign.no-available-goals');
    return { assigned: 0 };
  }

  // Filter out goals that already have a pulse agent assigned
  const { data: assignedAgents } = await admin
    .from('concilium_agents')
    .select('user_id, pulse_goal_id')
    .eq('pulse_enabled', true)
    .not('pulse_goal_id', 'is', null);

  const assignedGoalIds = new Set((assignedAgents || []).map((a) => a.pulse_goal_id));
  let availableGoals = activeGoals.filter((g) => !assignedGoalIds.has(g.id));

  if (!availableGoals.length) {
    log.info(null, 'auto-assign.all-goals-covered');
    return { assigned: 0 };
  }

  // 3. For each free agent, score & assign
  const assignments = [];

  for (const agent of normalizedFreeAgents) {
    if (!availableGoals.length) break;

    // Score only this agent owner's goals. Native rows contribute solely their
    // accepted canonical packet; damaged native rows are never downgraded.
    const scored = pulseAssignmentCandidates(agent, availableGoals).map(({ goal, authority }) => ({
      goal,
      authority,
      score: capabilityOverlap(agent, authority.text),
    }));
    if (!scored.length) continue;

    scored.sort((a, b) => b.score - a.score);
    const bestMatch = scored[0];

    // LLM confirmation with a cheap model
    try {
      const llmResult = await executeLlmTracked({
        systemPrompt:
          'You are an agent coordinator. Given an agent\'s profile and a goal, decide if this agent is a good fit. Reply with JSON: {"fit": true/false, "reason": "string", "task_focus": "string"}',
        prompt: `Agent: ${agent.name}, capabilities: ${JSON.stringify(agent.capabilities || [])}, category: ${agent.category || 'general'}. Approved goal context:\n${bestMatch.authority.text}\nIs this a good fit? If yes, suggest a task_focus for the agent's recurring work.`,
        provider: defaultProvider(),
        model: defaultCheapModel(),
        temperature: 0.2,
        maxTokens: 300,
        jsonMode: true,
        usage: {
          admin,
          userId: agent.user_id,
          agentId: agent.id,
          agentName: agent.name,
          goalId: bestMatch.goal.id,
          organizationId: bestMatch.goal.org_id || null,
          source: 'pulse-auto-assign',
          operation: 'assign-fit-check',
        },
      });

      const parsed = safeParse(llmResult.content);
      if (!parsed) {
        log.warn(null, 'auto-assign.llm-parse-failed', {
          agentId: agent.id,
          raw: llmResult.content?.slice(0, 200),
        });
        continue;
      }

      if (!parsed.fit) {
        log.info(null, 'auto-assign.not-fit', {
          agentId: agent.id,
          goalId: bestMatch.goal.id,
          reason: parsed.reason,
        });
        continue;
      }

      // Assign agent to goal
      const nextPulseAt = new Date(
        Date.now() + (agent.check_in_interval_ms || 3600000)
      ).toISOString();

      const { data: updatedAgent, error: updateErr } = await admin
        .from('concilium_agents')
        .update({
          pulse_goal_id: bestMatch.goal.id,
          pulse_task_focus: parsed.task_focus || null,
          next_pulse_at: nextPulseAt,
        })
        .eq('id', agent.id)
        .eq('user_id', agent.user_id)
        .is('pulse_goal_id', null)
        .select('id, pulse_goal_id')
        .maybeSingle();

      if (updateErr || String(updatedAgent?.pulse_goal_id || '') !== String(bestMatch.goal.id)) {
        log.warn(null, 'auto-assign.update-failed', {
          agentId: agent.id,
          error: updateErr?.message || 'agent was assigned concurrently',
        });
        continue;
      }

      // Log assignment
      await admin.from('goal_log').insert({
        goal_id: bestMatch.goal.id,
        event_type: 'pulse_agent_assigned',
        details: {
          agent_id: agent.id,
          agent_name: agent.name,
          reason: parsed.reason,
          task_focus: parsed.task_focus,
          native_scope_hash: bestMatch.authority.scopeHash,
        },
      });

      assignments.push({
        agentId: agent.id,
        goalId: bestMatch.goal.id,
        taskFocus: parsed.task_focus,
      });

      // Remove assigned goal from pool so next agent gets a different one
      availableGoals = availableGoals.filter((g) => g.id !== bestMatch.goal.id);

      log.info(null, 'auto-assign.assigned', {
        agentId: agent.id,
        agentName: agent.name,
        goalId: bestMatch.goal.id,
        goalTitle: bestMatch.authority.label,
        taskFocus: parsed.task_focus,
      });
    } catch (err) {
      log.warn(null, 'auto-assign.llm-error', { agentId: agent.id, error: err.message });
      continue;
    }
  }

  log.info(null, 'auto-assign.done', { assigned: assignments.length });
  return { assigned: assignments.length, assignments };
}

// ── 2. decomposeGoalIntoSubGoals ────────────────────────────────────────────

/**
 * Break a parent goal into 2-5 actionable child goals using LLM.
 *
 * Called when a goal is too large or when an agent discovers sub-work needed.
 *
 * @param {object} admin      — Supabase admin client
 * @param {string} parentGoalId
 * @param {string} userId
 * @returns {Promise<{ decomposed: boolean, parentGoalId: string, subGoals: Array }>}
 */
export async function decomposeGoalIntoSubGoals(admin, parentGoalId, userId) {
  const durableUserId = typeof userId === 'string' ? userId.trim() : '';
  if (!durableUserId) throw new Error('Goal decomposition requires a durable owner');
  log.info(null, 'decompose.start', { parentGoalId, userId: durableUserId });

  // 1. Load parent goal
  const { data: parent, error: parentErr } = await admin
    .from('goals')
    .select('*')
    .eq('id', parentGoalId)
    .eq('user_id', durableUserId)
    .single();

  if (parentErr || !parent) {
    log.warn(null, 'decompose.parent-not-found', { parentGoalId, error: parentErr?.message });
    throw new Error(`Parent goal not found: ${parentGoalId}`);
  }
  if (hasNativeAxwiseScopeMarkers(parent)) {
    const error = new Error(
      'Native goal decomposition requires a newly confirmed AxWise scope for each child'
    );
    error.code = 'NATIVE_SCOPE_CONFIRMATION_REQUIRED';
    throw error;
  }

  // 2. Check if already decomposed
  const { data: existingChildren } = await admin
    .from('goals')
    .select('id, title, status')
    .eq('parent_goal_id', parentGoalId)
    .eq('user_id', durableUserId);

  if (existingChildren?.length) {
    log.info(null, 'decompose.already-decomposed', {
      parentGoalId,
      childCount: existingChildren.length,
    });
    return {
      decomposed: true,
      parentGoalId,
      subGoals: existingChildren.map((c) => ({ id: c.id, title: c.title })),
    };
  }

  // 3. LLM decomposition
  let subGoalDefs;
  try {
    const llmResult = await executeLlmTracked({
      systemPrompt:
        'You are a strategic goal decomposer. Break a high-level goal into 2-5 specific, actionable sub-goals. Each sub-goal should be independently executable by an AI agent.',
      prompt: `Parent goal: ${parent.title} - ${parent.description || 'No description'}. Budget: $${parent.budget_usd || 0}. Break this into sub-goals. Reply with JSON array: [{"title": "string", "description": "string", "budget_usd": number, "success_criteria": "string", "priority": "high|medium|low"}]`,
      provider: defaultProvider(),
      model: defaultModel(),
      temperature: 0.3,
      maxTokens: 2000,
      jsonMode: true,
      usage: {
        admin,
        userId: durableUserId,
        goalId: parentGoalId,
        organizationId: parent.org_id,
        teamId: parent.agent_team_id || parent.team_id,
        source: 'goal-decompose',
        operation: 'decompose',
      },
    });

    subGoalDefs = safeParse(llmResult.content);
    if (!Array.isArray(subGoalDefs) || !subGoalDefs.length) {
      log.warn(null, 'decompose.llm-parse-failed', {
        parentGoalId,
        raw: llmResult.content?.slice(0, 300),
      });
      throw new Error('LLM did not return a valid sub-goal array');
    }
  } catch (err) {
    log.warn(null, 'decompose.llm-error', { parentGoalId, error: err.message });
    throw err;
  }

  // 4. Insert sub-goals
  const subGoalRows = subGoalDefs.slice(0, 5).map((sg) => ({
    user_id: durableUserId,
    title: sg.title,
    description: sg.description,
    budget_usd: sg.budget_usd || 0,
    status: 'feasibility',
    parent_goal_id: parentGoalId,
    parsed_priority: sg.priority || 'medium',
    complexity: 'simple',
    execution_mode: 'auto',
  }));

  const { data: createdGoals, error: insertErr } = await admin
    .from('goals')
    .insert(subGoalRows)
    .select('id, user_id, title');

  if (insertErr || !createdGoals?.length) {
    log.warn(null, 'decompose.insert-failed', { parentGoalId, error: insertErr?.message });
    throw new Error(`Failed to insert sub-goals: ${insertErr?.message}`);
  }
  if (createdGoals.some((goal) => goal.user_id !== durableUserId)) {
    throw new Error('Created sub-goal owner does not match durable decomposition authority');
  }

  // 5. Enqueue feasibility jobs for each sub-goal
  const jobs = createdGoals.map((sg) => ({
    user_id: durableUserId,
    status: 'queued',
    payload: {
      type: 'orchestrate-goal',
      action: 'feasibility-analysis',
      goalId: sg.id,
      _userId: durableUserId,
      userId: durableUserId,
      user_id: durableUserId,
    },
  }));

  const { error: jobsErr } = await admin
    .from('agent_jobs')
    .insert(bindAgentJobsToWorkerDeployment(jobs));
  if (jobsErr) {
    log.warn(null, 'decompose.jobs-enqueue-failed', { parentGoalId, error: jobsErr.message });
  }

  // 6. Update parent goal data with sub_goal_ids
  const subGoalIds = createdGoals.map((sg) => sg.id);
  const parentData = parent.data || {};
  const { error: parentUpdateErr } = await admin
    .from('goals')
    .update({ data: { ...parentData, sub_goal_ids: subGoalIds } })
    .eq('id', parentGoalId)
    .eq('user_id', durableUserId);

  if (parentUpdateErr) {
    log.warn(null, 'decompose.parent-update-failed', {
      parentGoalId,
      error: parentUpdateErr.message,
    });
  }

  // 7. Log decomposition event
  await admin.from('goal_log').insert({
    goal_id: parentGoalId,
    event_type: 'goal_decomposed',
    details: {
      sub_goal_count: createdGoals.length,
      sub_goal_ids: subGoalIds,
      sub_goal_titles: createdGoals.map((sg) => sg.title),
    },
  });

  log.info(null, 'decompose.done', {
    parentGoalId,
    subGoalCount: createdGoals.length,
    subGoalIds: subGoalIds,
  });

  return {
    decomposed: true,
    parentGoalId,
    subGoals: createdGoals.map((sg) => ({ id: sg.id, title: sg.title })),
  };
}

// ── 3. reassignCompletedPulseAgents ─────────────────────────────────────────

/**
 * Clear pulse_goal_id from agents whose assigned goal has ended
 * (completed / failed / cancelled), freeing them for re-assignment.
 *
 * Called from the process-next cron.
 *
 * @param {object} admin — Supabase admin client
 * @returns {Promise<{ released: number }>}
 */
export async function reassignCompletedPulseAgents(admin) {
  log.info(null, 'reassign.start');

  // Find all pulse agents that have an assigned goal
  const { data: busyAgents, error: agentsErr } = await admin
    .from('concilium_agents')
    .select('id, user_id, name, pulse_goal_id')
    .eq('pulse_enabled', true)
    .not('pulse_goal_id', 'is', null);

  if (agentsErr) {
    log.warn(null, 'reassign.agents-query-failed', { error: agentsErr.message });
    return { released: 0 };
  }

  if (!busyAgents?.length) {
    log.info(null, 'reassign.no-busy-agents');
    return { released: 0 };
  }

  // Check each agent's goal status
  const goalIds = [...new Set(busyAgents.map((a) => a.pulse_goal_id))];
  const { data: goals, error: goalsErr } = await admin
    .from('goals')
    .select('id, user_id, status')
    .in('id', goalIds);

  if (goalsErr) {
    log.warn(null, 'reassign.goals-query-failed', { error: goalsErr.message });
    return { released: 0 };
  }

  const goalStatusMap = new Map((goals || []).map((g) => [`${g.user_id}:${g.id}`, g.status]));
  const terminalStatuses = new Set(['completed', 'failed', 'cancelled']);
  let released = 0;

  for (const agent of busyAgents) {
    const status = goalStatusMap.get(`${agent.user_id}:${agent.pulse_goal_id}`);

    // Release if goal is terminal OR if goal no longer exists
    if (!status || terminalStatuses.has(status)) {
      const { error: updateErr } = await admin
        .from('concilium_agents')
        .update({ pulse_goal_id: null, pulse_task_focus: null })
        .eq('id', agent.id)
        .eq('user_id', agent.user_id);

      if (updateErr) {
        log.warn(null, 'reassign.update-failed', { agentId: agent.id, error: updateErr.message });
        continue;
      }

      await admin.from('goal_log').insert({
        goal_id: agent.pulse_goal_id,
        event_type: 'pulse_agent_released',
        details: {
          agent_id: agent.id,
          agent_name: agent.name,
          reason: status ? `goal ${status}` : 'goal not found',
        },
      });

      released++;
      log.info(null, 'reassign.released', {
        agentId: agent.id,
        agentName: agent.name,
        goalId: agent.pulse_goal_id,
        goalStatus: status || 'missing',
      });
    }
  }

  log.info(null, 'reassign.done', { released });
  return { released };
}
