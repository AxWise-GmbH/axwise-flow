/**
 * Pulse Handler — manages autonomous Pulse cycles and prompt refinement.
 *
 * Pulse is the heartbeat of autonomous agents. On each scheduled tick the
 * handler loads context (goal, logs, learnings), executes a focused LLM
 * cycle, optionally evaluates quality, records the result, and advances
 * the agent's next_pulse_at pointer.
 *
 * Exported functions:
 *   handlePulseCycle       — run a single pulse cycle for an agent
 *   handlePromptRefinement — improve the agent's prompt every N cycles
 *   checkPulseBudget       — verify daily spend is within limits
 *   detectDuePulseAgents   — find agents whose next pulse is overdue
 */
import { executeLlmTracked } from '../usage-handlers/tracked-llm.js';
import { createLogger } from '../../api/_lib/logger.js';
import { generateEmbedding } from '../_shared/embeddings.js';
import { resolveGoalKbScope } from '../_shared/kb-scope.js';
import { loadOsjaLessonsForAgent } from '../goal-handlers/_helpers.js';
import { defaultProvider, defaultModel, defaultCheapModel } from '../_shared/llm-defaults.js';
import { resolveAcceptedNativeGoalAuthority } from '../_shared/native-goal-authority.js';

const log = createLogger('pulse-handler');

// ── Helpers ─────────────────────────────────────────────────────────────────

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

/**
 * Attempt to extract a numeric score (0-100) from evaluator output.
 * Searches for patterns like "Score: 72" or just a bare number.
 */
function parseScore(text) {
  if (!text) return null;
  const match = text.match(/\b(\d{1,3})\b/);
  if (match) {
    const n = parseInt(match[1], 10);
    if (n >= 0 && n <= 100) return n;
  }
  return null;
}

function canonicalNativePulseState(authority) {
  const packet = authority.packet;
  return {
    scope_hash: packet.scope_hash,
    objective: packet.intent?.objective || '',
    problem: packet.intent?.problem || '',
    desired_outcome: packet.intent?.desired_outcome || '',
    audiences: packet.intent?.audiences || [],
    deliverable: authority.deliverable || null,
    requirements: (packet.ledger?.requirements || []).map((item) => ({
      id: item?.requirement_id || item?.id || null,
      text: item?.text || '',
    })),
    constraints: (packet.ledger?.constraints || []).map((item) => ({
      id: item?.constraint_id || item?.id || null,
      text: item?.text || '',
    })),
    acceptance: packet.ledger?.acceptance || [],
    work_types: authority.admission?.work_types || [],
    requested_actions: authority.admission?.requested_actions || [],
  };
}

/** Build a provider-safe view; native rows never fall back to raw goal prose. */
export function resolvePulseExecutionAuthority(goal) {
  const authority = resolveAcceptedNativeGoalAuthority(goal);
  if (authority.native) {
    if (!authority.ready) {
      return { ready: false, native: true, reasons: authority.reasons };
    }
    const state = canonicalNativePulseState(authority);
    return {
      ready: true,
      native: true,
      scopeHash: authority.packet.scope_hash,
      label: authority.packet.intent.objective,
      stateText: JSON.stringify(state),
      successCriteria: [
        ...(authority.admission?.success_criteria || []),
        ...(authority.packet.ledger?.acceptance || []).flatMap((item) => item?.then || []),
      ].filter(Boolean),
    };
  }
  return {
    ready: true,
    native: false,
    scopeHash: null,
    label: goal?.title || 'Goal',
    stateText: truncate(
      typeof goal?.plan === 'string' ? goal.plan : JSON.stringify(goal?.plan || {}),
      2000
    ),
    successCriteria: goal?.success_criteria || 'Not specified',
  };
}

// ── 1. handlePulseCycle ─────────────────────────────────────────────────────

/**
 * Execute a single Pulse cycle for an autonomous agent.
 *
 * @param {object} admin   — Supabase admin client
 * @param {object} payload — Job payload (see type below)
 * @param {import('http').IncomingMessage|null} req
 * @returns {Promise<object>}
 *
 * Payload shape:
 * {
 *   type: 'pulse-cycle',
 *   agentId: string,
 *   goalId: string,
 *   taskFocus: string,
 *   mode: 'lite' | 'full',
 *   autonomousEnabled: boolean,
 *   userId: string,
 *   cycleNumber: number,
 * }
 */
export async function handlePulseCycle(admin, payload, req) {
  const {
    agentId,
    goalId,
    taskFocus,
    mode = 'lite',
    autonomousEnabled = false,
    userId,
    cycleNumber,
  } = payload;

  const cycleStart = Date.now();
  log.info(req, 'pulse.cycle.start', { agentId, goalId, cycleNumber, mode });
  if (!userId) throw new Error('Pulse cycle requires an authenticated owner');

  // ── 1. Load agent ──────────────────────────────────────────────────────
  const { data: agent, error: agentErr } = await admin
    .from('concilium_agents')
    .select('*')
    .eq('id', agentId)
    .eq('user_id', userId)
    .single();

  if (agentErr || !agent) {
    log.error(req, 'pulse.agent.not-found', { agentId, error: agentErr?.message });
    throw new Error(`Agent not found: ${agentId}`);
  }
  if (String(agent.user_id || '') !== String(userId)) {
    throw new Error('Pulse agent owner does not match the queued owner');
  }
  if (String(agent.pulse_goal_id || '') !== String(goalId || '')) {
    return { type: 'pulse-cycle', agentId, goalId, status: 'superseded' };
  }

  // ── 2. Load goal ───────────────────────────────────────────────────────
  const { data: goal, error: goalErr } = await admin
    .from('goals')
    .select('id, user_id, org_id, title, description, status, plan, success_criteria, data')
    .eq('id', goalId)
    .eq('user_id', agent.user_id)
    .single();

  if (goalErr || !goal) {
    log.error(req, 'pulse.goal.not-found', { goalId, error: goalErr?.message });
    throw new Error(`Goal not found: ${goalId}`);
  }
  const pulseAuthority = resolvePulseExecutionAuthority(goal);
  if (!pulseAuthority.ready) {
    log.warn(req, 'pulse.native-authority-blocked', {
      goalId,
      agentId,
      reasons: pulseAuthority.reasons,
    });
    return {
      type: 'pulse-cycle',
      agentId,
      goalId,
      status: 'native_scope_blocked',
      reasons: pulseAuthority.reasons,
    };
  }
  const ownerUserId = agent.user_id;
  const nativeScope = pulseAuthority.native;

  // ── 3. Load last 5 goal_log entries ────────────────────────────────────
  let recentLogs = [];
  if (!nativeScope) {
    const { data } = await admin
      .from('goal_log')
      .select('event_type, details, created_at')
      .eq('goal_id', goalId)
      .order('created_at', { ascending: false })
      .limit(5);
    recentLogs = data || [];
  }

  // ── 4. If autonomous: load experience brief ───────────────────────────
  let experienceBrief = null;
  if (autonomousEnabled && !nativeScope) {
    const { data: briefDocs } = await admin
      .from('knowledge_documents')
      .select('content')
      .eq('owner_type', 'agent')
      .eq('owner_id', agentId)
      .eq('user_id', ownerUserId)
      .contains('tags', ['experience-brief'])
      .order('created_at', { ascending: false })
      .limit(1);

    experienceBrief = briefDocs?.[0]?.content || null;
  }

  // ── 5. Load last 3 pulse learnings ─────────────────────────────────────
  let pastLearnings = [];
  if (autonomousEnabled && !nativeScope) {
    const { data: learningDocs } = await admin
      .from('knowledge_documents')
      .select('content')
      .eq('owner_id', agentId)
      .eq('user_id', ownerUserId)
      .contains('tags', ['pulse-learning'])
      .order('created_at', { ascending: false })
      .limit(3);

    pastLearnings = (learningDocs || []).map((d) => d.content);
  }

  // ── 5b. Load recent Osja lessons ───────────────────────────────────────
  // Applies even for non-autonomous agents — Osja's post-completion critique
  // is one of the most reliable quality signals we have.
  const osjaLessons = nativeScope
    ? []
    : await loadOsjaLessonsForAgent(admin, agentId, ownerUserId, 5);

  // ── 6. Build system prompt ─────────────────────────────────────────────
  const meta = agent.metadata || {};
  const agentName = meta.name || agent.name || 'Agent';
  const agentRole = meta.role || '';

  const logBullets = (recentLogs || [])
    .map((l) => `- [${l.event_type}] ${truncate(JSON.stringify(l.details), 200)}`)
    .join('\n');

  const planSummary = pulseAuthority.stateText;

  const promptImprovements = nativeScope ? [] : (meta.prompt_improvements || []).slice(-5);
  const improvementLines = promptImprovements
    .map((imp) => `- ${typeof imp === 'string' ? imp : imp.improvement || JSON.stringify(imp)}`)
    .join('\n');

  let systemPrompt = [
    `You are ${agentName}${agentRole ? `, ${agentRole}` : ''}.`,
    `You are executing a Pulse cycle for goal: ${pulseAuthority.label}`,
    !nativeScope && taskFocus ? `Task focus: ${taskFocus}` : '',
    '',
    '--- Goal current state ---',
    `Status: ${goal.status}`,
    nativeScope ? `Canonical approved scope: ${planSummary}` : `Plan summary: ${planSummary}`,
    '',
    !nativeScope ? '--- Recent goal log (last 5) ---' : '',
    !nativeScope ? logBullets || '(no recent log entries)' : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (autonomousEnabled && experienceBrief) {
    systemPrompt += `\n\n--- Experience brief ---\n${experienceBrief}`;
  }
  if (autonomousEnabled && pastLearnings.length > 0) {
    systemPrompt += `\n\n--- Past learnings ---\n${pastLearnings.map((l) => `- ${l}`).join('\n')}`;
  }
  if (osjaLessons.length > 0) {
    const osjaBlock = osjaLessons.map((l) => `• ${l}`).join('\n\n');
    systemPrompt += `\n\n--- Osja lessons (apply these to avoid repeating past gaps) ---\n${osjaBlock}`;
  }
  if (improvementLines) {
    systemPrompt += `\n\n--- Learn from past issues ---\n${improvementLines}`;
  }

  // ── 7. Build user prompt ───────────────────────────────────────────────
  const userPrompt = nativeScope
    ? 'Execute a Pulse advisory cycle strictly inside the canonical approved scope above. Do not add objectives, deliverables, actions, facts, or assumptions. Produce a specific, actionable progress recommendation only.'
    : `Execute your Pulse cycle. Focus: ${taskFocus || 'general progress'}. Analyze the current state, do your work, and produce a result. Be specific and actionable.`;

  // ── 8. Call LLM ────────────────────────────────────────────────────────
  const llmResult = await executeLlmTracked({
    prompt: userPrompt,
    systemPrompt,
    provider: defaultProvider(),
    model: defaultModel(),
    temperature: 0.4,
    maxTokens: 2000,
    req,
    usage: {
      admin,
      userId: ownerUserId,
      goalId,
      organizationId: goal.org_id || null,
      agentId,
      agentName,
      source: 'pulse-cycle',
      operation: 'pulse',
    },
  });

  const result = llmResult.content;
  let totalTokens = llmResult.usage?.total_tokens || 0;
  let totalCost = llmResult.estimatedCostUsd || 0;

  // ── 9. Mode-based evaluation ───────────────────────────────────────────
  let status = 'keep';
  let quality_score = null;
  const previousBestScore = agent.pulse_best_score ?? null;

  if (mode === 'full') {
    const evalResult = await executeLlmTracked({
      prompt: `Goal success criteria: ${Array.isArray(pulseAuthority.successCriteria) ? pulseAuthority.successCriteria.join('; ') : pulseAuthority.successCriteria}.\nAgent output: ${truncate(result, 1500)}.\nScore (0-100) and brief reason.`,
      systemPrompt:
        'You are a quality evaluator. Score this work output on a scale of 0-100. Respond with the numeric score first, then a brief reason.',
      provider: defaultProvider(),
      model: defaultCheapModel(),
      temperature: 0.2,
      maxTokens: 300,
      req,
      usage: {
        admin,
        userId: ownerUserId,
        goalId,
        organizationId: goal.org_id || null,
        agentId,
        agentName,
        source: 'pulse-cycle',
        operation: 'pulse-evaluate',
      },
    });

    totalTokens += evalResult.usage?.total_tokens || 0;
    totalCost += evalResult.estimatedCostUsd || 0;

    quality_score = parseScore(evalResult.content);

    if (quality_score !== null && previousBestScore !== null) {
      status = quality_score > previousBestScore ? 'keep' : 'discard';
    } else {
      // No previous best — keep by default
      status = 'keep';
    }
  }
  // lite mode: status stays 'keep', quality_score stays null

  const durationMs = Date.now() - cycleStart;
  const resultSummary = truncate(result, 500);

  // ── 10. Log to goal_log ────────────────────────────────────────────────
  await admin.from('goal_log').insert({
    goal_id: goalId,
    event_type: 'pulse_cycle',
    details: {
      cycle_number: cycleNumber,
      agent_name: agentName,
      status,
      quality_score,
      description: nativeScope ? 'canonical_native_scope_progress' : taskFocus,
      result_summary: resultSummary,
      native_scope_hash: pulseAuthority.scopeHash,
    },
  });

  // ── 11. Log to pulse_cycles ────────────────────────────────────────────
  await admin.from('pulse_cycles').insert({
    user_id: ownerUserId,
    agent_id: agentId,
    goal_id: goalId,
    cycle_number: cycleNumber,
    quality_score,
    previous_best_score: previousBestScore,
    status,
    description: nativeScope ? 'canonical_native_scope_progress' : taskFocus,
    result_summary: resultSummary,
    tokens_used: totalTokens,
    cost_usd: totalCost,
    duration_ms: durationMs,
  });

  // ── 12. If autonomous: generate learning ───────────────────────────────
  let learning = null;
  if (autonomousEnabled) {
    const learnResult = await executeLlmTracked({
      prompt: `Based on this cycle's work, summarize:\nWhat I did | What worked | What didn't | What to try next.\nBe concise (4 lines max).\n\nCycle output:\n${truncate(result, 1200)}`,
      systemPrompt:
        'You are a reflective agent. Summarize your learning from this work cycle in exactly 4 concise lines.',
      provider: defaultProvider(),
      model: defaultCheapModel(),
      temperature: 0.3,
      maxTokens: 300,
      req,
      usage: {
        admin,
        userId: ownerUserId,
        goalId,
        organizationId: goal.org_id || null,
        agentId,
        agentName,
        source: 'pulse-cycle',
        operation: 'pulse-learning',
      },
    });

    learning = learnResult.content;

    // Save learning to knowledge_documents
    const embedding = await generateEmbedding(learning);
    const kbScope = await resolveGoalKbScope(admin, goalId, ownerUserId);

    await admin.from('knowledge_documents').insert({
      user_id: ownerUserId,
      owner_type: 'agent',
      owner_id: agentId,
      content_type: 'note',
      title: `Pulse Learning #${cycleNumber}`,
      content: learning,
      tags: ['pulse-learning', goalId],
      embedding,
      ...kbScope,
    });
  }

  // ── 13. Update agent next pulse ────────────────────────────────────────
  const checkInInterval = agent.check_in_interval_ms || 3600000; // default 1 hour
  const now = new Date().toISOString();

  const agentUpdate = {
    pulse_cycle_count: cycleNumber,
    next_pulse_at: new Date(Date.now() + checkInInterval).toISOString(),
    last_check_in: now,
  };

  // ── 14. If full mode and kept: update pulse_best_score ─────────────────
  if (mode === 'full' && status === 'keep' && quality_score !== null) {
    agentUpdate.pulse_best_score = quality_score;
  }

  await admin
    .from('concilium_agents')
    .update(agentUpdate)
    .eq('id', agentId)
    .eq('user_id', ownerUserId)
    .eq('pulse_goal_id', goalId);

  // ── 15. Return result ──────────────────────────────────────────────────
  log.info(req, 'pulse.cycle.complete', {
    agentId,
    goalId,
    cycleNumber,
    status,
    quality_score,
    durationMs,
  });

  return {
    type: 'pulse-cycle',
    agentId,
    goalId,
    cycleNumber,
    status,
    quality_score,
    result_summary: resultSummary,
    learning,
  };
}

// ── 2. handlePromptRefinement ───────────────────────────────────────────────

/**
 * Improve an agent's system prompt based on cycle performance history.
 * Designed to run every ~10 cycles.
 *
 * @param {object} admin   — Supabase admin client
 * @param {object} payload — { type: 'prompt-refinement', agentId, userId }
 * @param {import('http').IncomingMessage|null} req
 * @returns {Promise<object>}
 */
export async function handlePromptRefinement(admin, payload, req) {
  const { agentId, userId } = payload;
  log.info(req, 'pulse.refinement.start', { agentId });
  if (!userId) throw new Error('Prompt refinement requires an authenticated owner');

  // 1. Load agent
  const { data: agent, error: agentErr } = await admin
    .from('concilium_agents')
    .select('*')
    .eq('id', agentId)
    .eq('user_id', userId)
    .single();

  if (agentErr || !agent) {
    log.error(req, 'pulse.refinement.agent-not-found', { agentId, error: agentErr?.message });
    throw new Error(`Agent not found: ${agentId}`);
  }
  if (String(agent.user_id || '') !== String(userId)) {
    throw new Error('Pulse agent owner does not match the queued owner');
  }

  // 2. Load last 10 pulse_cycles
  const { data: cycles } = await admin
    .from('pulse_cycles')
    .select('cycle_number, quality_score, status, description')
    .eq('agent_id', agentId)
    .eq('user_id', agent.user_id)
    .order('created_at', { ascending: false })
    .limit(10);

  // 3. Current system prompt from metadata
  const meta = agent.metadata || {};
  const currentPrompt = meta.system_prompt || meta.role || 'No system prompt configured.';

  // 4. Build cycle history summary
  const historySummary = (cycles || [])
    .map(
      (c) =>
        `Cycle #${c.cycle_number}: score ${c.quality_score ?? 'N/A'}, status: ${c.status}, description: ${c.description || 'none'}`
    )
    .join('\n');

  // 5. Call LLM for improvements
  const llmResult = await executeLlmTracked({
    prompt: `Agent current prompt:\n${truncate(currentPrompt, 1500)}\n\nCycle history:\n${historySummary}\n\nSuggest 3 specific improvements. Format each as:\nISSUE: [what's not working] | IMPROVEMENT: [what to change]`,
    systemPrompt:
      "You are a prompt engineer. Analyze this agent's performance history and suggest improvements to its system prompt. Be specific and actionable.",
    provider: defaultProvider(),
    model: defaultCheapModel(),
    temperature: 0.3,
    maxTokens: 600,
    req,
    usage: {
      admin,
      userId: agent.user_id,
      agentId,
      agentName: agent.name,
      source: 'pulse-refinement',
      operation: 'prompt-refine',
    },
  });

  // 6. Parse improvements
  const rawLines = (llmResult.content || '').split('\n').filter((l) => l.includes('ISSUE:'));
  const improvements = rawLines.map((line) => {
    const parts = line.split('|').map((s) => s.trim());
    const issue = (parts[0] || '').replace(/^ISSUE:\s*/i, '').trim();
    const improvement = (parts[1] || '').replace(/^IMPROVEMENT:\s*/i, '').trim();
    return {
      issue,
      improvement,
      added_at: new Date().toISOString(),
      cycle: agent.pulse_cycle_count,
    };
  });

  // 7. Append to prompt_improvements (no cap for autonomous agents)
  const existing = meta.prompt_improvements || [];
  const updatedImprovements = [...existing, ...improvements];

  // 8. Update agent metadata
  const updatedMeta = {
    ...meta,
    prompt_improvements: updatedImprovements,
  };

  await admin
    .from('concilium_agents')
    .update({ metadata: updatedMeta })
    .eq('id', agentId)
    .eq('user_id', agent.user_id);

  log.info(req, 'pulse.refinement.complete', {
    agentId,
    improvementsAdded: improvements.length,
    totalImprovements: updatedImprovements.length,
  });

  // 9. Return
  return {
    type: 'prompt-refinement',
    improvements,
  };
}

// ── 3. checkPulseBudget ─────────────────────────────────────────────────────

/**
 * Check whether an agent is within its daily cost budget.
 *
 * @param {object} admin   — Supabase admin client
 * @param {string} agentId — Agent ID
 * @param {string} userId  — Durable owner ID
 * @returns {Promise<{ allowed: boolean, remaining: number, todayCost: number, maxCost: number, switchToLite: boolean }>}
 */
export async function checkPulseBudget(admin, agentId, userId) {
  const durableUserId = typeof userId === 'string' ? userId.trim() : '';
  if (!durableUserId) {
    const error = new Error('PULSE_OWNER_VALIDATION_ERROR: durable owner is required');
    error.code = 'PULSE_OWNER_VALIDATION_ERROR';
    throw error;
  }
  // 1. Load agent budget
  const { data: agent } = await admin
    .from('concilium_agents')
    .select('id, user_id, max_cost_per_day_usd')
    .eq('id', agentId)
    .eq('user_id', durableUserId)
    .maybeSingle();

  const maxCost = agent?.max_cost_per_day_usd;

  if (!maxCost) {
    return { allowed: true, remaining: Infinity, todayCost: 0, maxCost: null, switchToLite: false };
  }

  // 2. Sum today's cost from pulse_cycles
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  const { data: todayCycles } = await admin
    .from('pulse_cycles')
    .select('cost_usd')
    .eq('agent_id', agentId)
    .eq('user_id', durableUserId)
    .gte('created_at', todayMidnight.toISOString());

  const todayCost = (todayCycles || []).reduce((sum, c) => sum + (c.cost_usd || 0), 0);
  const remaining = maxCost - todayCost;

  return {
    allowed: todayCost < maxCost,
    remaining,
    todayCost,
    maxCost,
    switchToLite: todayCost > maxCost * 0.8,
  };
}

/**
 * Write a user-facing "pulse budget exhausted" notice once per 6-hour window
 * per agent. Surfaces the paused state in the Communicator Activity tab and
 * gives the user a one-click "Raise cap" action that opens the Pulse page.
 *
 * Returns true if a new notification was inserted, false if suppressed
 * (recent duplicate) or on error.
 */
export async function notifyPulseBudgetExhausted(admin, agent, budget) {
  if (!agent?.user_id || !agent?.id) return false;
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  try {
    const { data: recent } = await admin
      .from('notification_log')
      .select('id')
      .eq('user_id', agent.user_id)
      .eq('event_type', 'pulse_budget_exhausted')
      .gte('created_at', sixHoursAgo)
      .contains('metadata', { agent_id: agent.id })
      .limit(1);
    if (recent && recent.length > 0) return false;

    const suggestedCap = budget.maxCost ? Number((budget.maxCost * 2).toFixed(2)) : null;
    const { error } = await admin.from('notification_log').insert({
      user_id: agent.user_id,
      channel: 'in_app',
      event_type: 'pulse_budget_exhausted',
      subject: `Pulse paused on budget: ${agent.name || agent.id}`,
      body: budget.maxCost
        ? `Today's pulse spend hit the $${Number(budget.maxCost).toFixed(2)} cap. Raise the cap to resume automated cycles.`
        : `Pulse cycles paused — budget limit reached.`,
      status: 'sent',
      sent_at: new Date().toISOString(),
      metadata: {
        priority: 'normal',
        agent_id: agent.id,
        today_cost: budget.todayCost,
        max_cost: budget.maxCost,
        suggested_cap: suggestedCap,
        action: {
          type: 'raise_pulse_cap',
          label: 'Raise cap',
          target_url: '/agent-hub?tab=pulse',
        },
      },
    });
    return !error;
  } catch {
    return false;
  }
}

// ── 4. detectDuePulseAgents ─────────────────────────────────────────────────

/**
 * Find all agents whose next Pulse cycle is overdue.
 *
 * @param {object} admin — Supabase admin client
 * @returns {Promise<Array<object>>}
 */
export async function detectDuePulseAgents(admin) {
  const now = new Date().toISOString();

  const { data: agents, error } = await admin
    .from('concilium_agents')
    .select(
      'id, pulse_goal_id, pulse_task_focus, pulse_mode, pulse_cycle_count, autonomous_enabled, check_in_interval_ms, user_id, max_cost_per_day_usd'
    )
    .eq('pulse_enabled', true)
    .lte('next_pulse_at', now)
    .limit(5);

  if (error) {
    log.warn(null, 'pulse.detect.error', { error: error.message });
    return [];
  }

  return (agents || []).map((a) => ({
    id: a.id,
    agent_id: a.id,
    pulse_goal_id: a.pulse_goal_id,
    pulse_task_focus: a.pulse_task_focus,
    pulse_mode: a.pulse_mode,
    pulse_cycle_count: a.pulse_cycle_count || 0,
    autonomous_enabled: a.autonomous_enabled || false,
    check_in_interval_ms: a.check_in_interval_ms,
    user_id: a.user_id,
    max_cost_per_day_usd: a.max_cost_per_day_usd,
  }));
}
