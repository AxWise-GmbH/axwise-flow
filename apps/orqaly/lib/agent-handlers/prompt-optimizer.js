/**
 * Prompt Optimization Agent — analyzes agent performance data and generates
 * improved system prompt variants via A/B testing.
 *
 * Exported handlers:
 *   handleOptimizePrompts   — 24h cycle: generate prompt variants for underperforming agents
 *   handleEvaluateVariants  — 72h cycle: compare variant performance, promote or reject
 */
import { executeLlm } from './llm-executor.js';
import { executeLlmTracked } from '../usage-handlers/tracked-llm.js';
import { createLogger } from '../../api/_lib/logger.js';
import { currentGoalTaskAttempt } from '../goal-handlers/current-goal-task-attempt.js';
import { hasNativeAxwiseScopeMarkers } from '../_shared/native-scope-approval.js';

const log = createLogger('prompt-optimizer');

// Cost cap per optimization cycle ($)
const CYCLE_COST_CAP = 0.5;
// Minimum completed tasks before an agent qualifies for optimization
const MIN_TASKS_FOR_OPTIMIZATION = 5;
// Maximum agents to optimize per cycle
const MAX_AGENTS_PER_CYCLE = 3;
// Minimum tasks per variant/baseline to evaluate
const MIN_TASKS_FOR_EVALUATION = 3;
// Variant must beat baseline by these margins to be promoted
const QUALITY_IMPROVEMENT_THRESHOLD = 5; // percentage points
const SUCCESS_IMPROVEMENT_THRESHOLD = 10; // percentage points
// A/B test traffic split — probability a task uses the testing variant
export const VARIANT_TRAFFIC_RATIO = 0.3;

// ── Helpers ──────────────────────────────────────────────────────────────────

function truncate(str, len = 1500) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

function safeParseJson(content) {
  try {
    // Strip markdown fences if present
    const cleaned = content
      .replace(/```json\s*/g, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

/**
 * Keep only legacy/manual observations that belong to each goal's current
 * attempt. Native AxWise work uses a fixed, scope-bound execution contract;
 * feeding its output into the global mutable prompt optimizer would let one
 * goal alter the instructions used by unrelated legacy work.
 */
export function filterCurrentPerformanceTasks(tasks = [], goals = []) {
  const goalById = new Map((goals || []).map((goal) => [String(goal.id), goal]));
  return (Array.isArray(tasks) ? tasks : []).filter((task) => {
    const goalId = task.goal_id || task.data?.goal_id;
    if (!goalId) {
      return !['cancelled', 'canceled', 'superseded'].includes(
        String(task.status || '')
          .trim()
          .toLowerCase()
      );
    }
    const goal = goalById.get(String(goalId));
    // Preserve legacy samples when their goal row no longer exists. Retired
    // statuses never represent an executed performance observation.
    if (!goal) {
      return !['cancelled', 'canceled', 'superseded'].includes(
        String(task.status || '')
          .trim()
          .toLowerCase()
      );
    }
    if (hasNativeAxwiseScopeMarkers(goal)) return false;
    return currentGoalTaskAttempt(goal, [task]).length === 1;
  });
}

async function loadCurrentPerformanceTasks(admin, tasks = []) {
  const goalIds = [
    ...new Set(
      (tasks || [])
        .map((task) => task.goal_id || task.data?.goal_id)
        .filter(Boolean)
        .map(String)
    ),
  ];
  if (!goalIds.length) return filterCurrentPerformanceTasks(tasks, []);

  const { data: goals } = await admin.from('goals').select('id, data').in('id', goalIds);
  return filterCurrentPerformanceTasks(tasks, goals || []);
}

// ── 1. handleOptimizePrompts (24h cycle) ─────────────────────────────────────

export async function handleOptimizePrompts(admin, payload, req) {
  log.info(req, 'optimizer.improvement.start');

  // 1. Create optimization run record
  const { data: run } = await admin
    .from('optimization_runs')
    .insert({ run_type: 'improvement', status: 'running' })
    .select('id')
    .single();

  const runId = run?.id;
  let totalCost = 0;
  const agentReports = [];

  try {
    // 2. Find eligible agents — have blueprints + enough task history + no active tests
    const { data: metrics } = await admin
      .from('agent_performance_metrics')
      .select('agent_id, jobs_completed, avg_quality_score, success_rate, total_cost_usd')
      .gte('jobs_completed', MIN_TASKS_FOR_OPTIMIZATION)
      .order('avg_quality_score', { ascending: true });

    if (!metrics?.length) {
      log.info(req, 'optimizer.improvement.no-eligible-agents');
      await completeRun(admin, runId, 'completed', {
        agents_analyzed: 0,
        agents_optimized: 0,
        report: { message: 'No eligible agents' },
      });
      return { type: 'optimize-prompts', message: 'No eligible agents' };
    }

    // 3. Filter out agents that already have testing variants
    const { data: testingVariants } = await admin
      .from('prompt_versions')
      .select('agent_id')
      .eq('status', 'testing');

    const testingAgentIds = new Set((testingVariants || []).map((v) => v.agent_id));
    const eligible = metrics.filter((m) => !testingAgentIds.has(m.agent_id));

    if (!eligible.length) {
      log.info(req, 'optimizer.improvement.all-agents-in-testing');
      await completeRun(admin, runId, 'completed', {
        agents_analyzed: metrics.length,
        agents_optimized: 0,
        report: { message: 'All eligible agents already have testing variants' },
      });
      return { type: 'optimize-prompts', message: 'All eligible agents in testing' };
    }

    // 4. Rank by optimization priority (worst performers first)
    const ranked = eligible
      .map((m) => {
        const qualityScore = (100 - (m.avg_quality_score || 50)) * 0.4;
        const successScore = (100 - (m.success_rate || 50)) * 0.3;
        const costScore = ((m.total_cost_usd || 0) / Math.max(m.jobs_completed, 1)) * 100 * 0.1;
        return { ...m, priority: qualityScore + successScore + costScore };
      })
      .sort((a, b) => b.priority - a.priority);

    // 5. Also load user ratings for ranking (weight 0.2)
    const topAgentIds = ranked.slice(0, MAX_AGENTS_PER_CYCLE * 2).map((m) => m.agent_id);
    const { data: ratings } = await admin
      .from('agent_ratings')
      .select('agent_id, rating')
      .in('agent_id', topAgentIds);

    const avgRatingByAgent = {};
    if (ratings?.length) {
      for (const r of ratings) {
        if (!avgRatingByAgent[r.agent_id]) avgRatingByAgent[r.agent_id] = { sum: 0, count: 0 };
        avgRatingByAgent[r.agent_id].sum += r.rating;
        avgRatingByAgent[r.agent_id].count += 1;
      }
    }

    for (const agent of ranked) {
      const ratingData = avgRatingByAgent[agent.agent_id];
      const avgRating = ratingData ? ratingData.sum / ratingData.count : 3;
      agent.priority += (5 - avgRating) * 20 * 0.2;
    }
    ranked.sort((a, b) => b.priority - a.priority);

    // 6. Process top N agents
    const toProcess = ranked.slice(0, MAX_AGENTS_PER_CYCLE);
    let optimizedCount = 0;

    for (const agentMetric of toProcess) {
      if (totalCost >= CYCLE_COST_CAP) {
        log.info(req, 'optimizer.improvement.cost-cap-reached', { totalCost });
        break;
      }

      try {
        const result = await optimizeSingleAgent(admin, agentMetric.agent_id, agentMetric, req);
        if (result) {
          totalCost += result.cost;
          optimizedCount++;
          agentReports.push(result.report);
        }
      } catch (err) {
        log.error(req, 'optimizer.improvement.agent-failed', {
          agentId: agentMetric.agent_id,
          error: err.message,
        });
        agentReports.push({ agent_id: agentMetric.agent_id, error: err.message });
      }
    }

    // 7. Complete run
    await completeRun(admin, runId, 'completed', {
      agents_analyzed: eligible.length,
      agents_optimized: optimizedCount,
      total_cost_usd: totalCost,
      report: { agents: agentReports, cycle_cost: totalCost },
    });

    log.info(req, 'optimizer.improvement.complete', {
      analyzed: eligible.length,
      optimized: optimizedCount,
      cost: totalCost,
    });
    return {
      type: 'optimize-prompts',
      analyzed: eligible.length,
      optimized: optimizedCount,
      cost: totalCost,
    };
  } catch (err) {
    log.error(req, 'optimizer.improvement.failed', { error: err.message });
    if (runId) await completeRun(admin, runId, 'failed', { report: { error: err.message } });
    throw err;
  }
}

async function optimizeSingleAgent(admin, agentId, metrics, req) {
  // Load blueprint
  const { data: blueprint } = await admin
    .from('agent_blueprints')
    .select('id, name, system_prompt, version, category')
    .eq('id', agentId)
    .eq('status', 'active')
    .maybeSingle();

  if (!blueprint?.system_prompt) {
    log.info(req, 'optimizer.skip.no-blueprint', { agentId });
    return null;
  }

  // Load enough recent rows to retain ten current-attempt observations after
  // filtering immutable retry history.
  const { data: tasks } = await admin
    .from('team_tasks')
    .select('id, goal_id, title, status, materialization_attempt, data')
    .eq('agent_id', agentId)
    .order('updated_at', { ascending: false })
    .limit(40);

  const currentTasks = (await loadCurrentPerformanceTasks(admin, tasks || [])).slice(0, 10);
  if (currentTasks.length < MIN_TASKS_FOR_OPTIMIZATION) {
    log.info(req, 'optimizer.skip.insufficient-legacy-observations', {
      agentId,
      observationCount: currentTasks.length,
    });
    return null;
  }

  const taskSummary = currentTasks
    .map((t) => {
      const output = t.data?.output ? truncate(t.data.output, 300) : 'no output';
      return `- ${t.title} [${t.status}]: ${output}`;
    })
    .join('\n');

  // Load last 5 consilium evaluations
  const { data: evals } = await admin
    .from('concilium_evaluations')
    .select('overall_score, feedback, approved')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(5);

  const evalSummary = (evals || [])
    .map(
      (e) =>
        `- Score: ${e.overall_score ?? 'N/A'}, Approved: ${e.approved}, Feedback: ${truncate(e.feedback, 200)}`
    )
    .join('\n');

  // Load existing prompt improvements
  const { data: agentRecord } = await admin
    .from('concilium_agents')
    .select('metadata')
    .eq('id', agentId)
    .maybeSingle();

  const existingImprovements = agentRecord?.metadata?.prompt_improvements || [];
  const improvementsSummary = existingImprovements
    .slice(-5)
    .map((imp) => `- AVOID: ${imp.issue} → ${imp.improvement}`)
    .join('\n');

  // Call LLM for optimization
  const llmResult = await executeLlmTracked({
    systemPrompt: `You are a prompt engineering specialist. Analyze this agent's performance and rewrite its system prompt to improve quality and reliability.

Rules:
- Generate exactly 2 improved variants
- Apply ONE clear optimization strategy per variant: CLARITY, SPECIFICITY, STRUCTURE, or EFFICIENCY
- Output the FULL rewritten system_prompt (not a diff — the complete prompt)
- Keep the agent's core role and responsibilities intact
- Respond ONLY with valid JSON`,
    prompt: `AGENT: ${blueprint.name} (${blueprint.category})
PERFORMANCE: quality=${metrics.avg_quality_score?.toFixed(1)}, success_rate=${metrics.success_rate?.toFixed(1)}%, tasks=${metrics.jobs_completed}

CURRENT PROMPT:
${truncate(blueprint.system_prompt, 2000)}

RECENT TASK RESULTS:
${taskSummary || 'None available'}

CONSILIUM FEEDBACK:
${evalSummary || 'None available'}

KNOWN ISSUES:
${improvementsSummary || 'None'}

Generate 2 improved variants as JSON:
{ "variants": [{ "variant_label": "variant_a", "strategy": "CLARITY|SPECIFICITY|STRUCTURE|EFFICIENCY", "system_prompt": "...", "change_summary": "...", "expected_improvement": "..." }] }`,
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    temperature: 0.4,
    maxTokens: 6000,
    jsonMode: true,
    req,
    usage: {
      admin,
      agentId,
      agentName: blueprint.name,
      source: 'prompt-optimizer',
      operation: 'optimize-prompt',
    },
  });

  const parsed = safeParseJson(llmResult.content);
  if (!parsed?.variants?.length) {
    log.warn(req, 'optimizer.parse-failed', { agentId, content: truncate(llmResult.content, 200) });
    return null;
  }

  // Insert variants into prompt_versions
  const nextVersion = (blueprint.version || 1) + 1;
  const baselineMetrics = {
    avg_quality_score: metrics.avg_quality_score,
    success_rate: metrics.success_rate,
    jobs_completed: metrics.jobs_completed,
    total_cost_usd: metrics.total_cost_usd,
  };

  for (const variant of parsed.variants.slice(0, 2)) {
    if (!variant.system_prompt || !variant.variant_label) continue;

    await admin.from('prompt_versions').insert({
      agent_id: agentId,
      blueprint_id: blueprint.id,
      version: nextVersion,
      variant_label: variant.variant_label,
      system_prompt: variant.system_prompt,
      change_summary: variant.change_summary || '',
      optimization_strategy: variant.strategy || 'unknown',
      status: 'testing',
      baseline_metrics: baselineMetrics,
    });
  }

  const cost = llmResult.estimatedCostUsd || 0;

  return {
    cost,
    report: {
      agent_id: agentId,
      agent_name: blueprint.name,
      current_quality: metrics.avg_quality_score,
      current_success_rate: metrics.success_rate,
      variants_created: parsed.variants.length,
      strategies: parsed.variants.map((v) => v.strategy),
      cost,
    },
  };
}

// ── 2. handleEvaluateVariants (72h cycle) ────────────────────────────────────

export async function handleEvaluateVariants(admin, payload, req) {
  log.info(req, 'optimizer.evaluation.start');

  const { data: run } = await admin
    .from('optimization_runs')
    .insert({ run_type: 'evaluation', status: 'running' })
    .select('id')
    .single();

  const runId = run?.id;
  const agentReports = [];
  const strategyOutcomes = [];

  try {
    // 1. Find all agents with testing variants
    const { data: testingVariants } = await admin
      .from('prompt_versions')
      .select(
        'id, agent_id, blueprint_id, version, variant_label, system_prompt, optimization_strategy, baseline_metrics, test_task_count'
      )
      .eq('status', 'testing');

    if (!testingVariants?.length) {
      log.info(req, 'optimizer.evaluation.no-testing-variants');
      await completeRun(admin, runId, 'completed', {
        agents_analyzed: 0,
        report: { message: 'No testing variants' },
      });
      return { type: 'evaluate-prompt-variants', message: 'No testing variants' };
    }

    // Group by agent_id
    const byAgent = {};
    for (const v of testingVariants) {
      if (!byAgent[v.agent_id]) byAgent[v.agent_id] = [];
      byAgent[v.agent_id].push(v);
    }

    // 2. Evaluate each agent's variants
    for (const [agentId, variants] of Object.entries(byAgent)) {
      try {
        const result = await evaluateAgentVariants(admin, agentId, variants, req);
        agentReports.push(result.report);
        if (result.strategyOutcome) strategyOutcomes.push(result.strategyOutcome);
      } catch (err) {
        log.error(req, 'optimizer.evaluation.agent-failed', { agentId, error: err.message });
        agentReports.push({ agent_id: agentId, error: err.message });
      }
    }

    // 3. Complete run
    await completeRun(admin, runId, 'completed', {
      agents_analyzed: Object.keys(byAgent).length,
      agents_optimized: agentReports.filter((r) => r.promoted).length,
      report: { agents: agentReports },
      strategy_outcomes: strategyOutcomes,
    });

    log.info(req, 'optimizer.evaluation.complete', { agents: Object.keys(byAgent).length });
    return {
      type: 'evaluate-prompt-variants',
      agents: Object.keys(byAgent).length,
      reports: agentReports,
    };
  } catch (err) {
    log.error(req, 'optimizer.evaluation.failed', { error: err.message });
    if (runId) await completeRun(admin, runId, 'failed', { report: { error: err.message } });
    throw err;
  }
}

async function evaluateAgentVariants(admin, agentId, variants, req) {
  // Get variant task performance
  const variantIds = variants.map((v) => v.id);
  const { data: variantTasks } = await admin
    .from('team_tasks')
    .select('id, goal_id, prompt_version_id, status, materialization_attempt, data')
    .in('prompt_version_id', variantIds);

  // Get baseline task performance (tasks without prompt_version_id for this agent)
  const { data: baselineTasks } = await admin
    .from('team_tasks')
    .select('id, goal_id, status, materialization_attempt, data')
    .eq('agent_id', agentId)
    .is('prompt_version_id', null)
    .order('updated_at', { ascending: false })
    .limit(80);

  const scopedTasks = await loadCurrentPerformanceTasks(admin, [
    ...(variantTasks || []),
    ...(baselineTasks || []),
  ]);
  const scopedTaskRows = new Set(scopedTasks);
  const currentVariantTasks = (variantTasks || []).filter((task) => scopedTaskRows.has(task));
  const currentBaselineTasks = (baselineTasks || [])
    .filter((task) => scopedTaskRows.has(task))
    .slice(0, 20);

  // Calculate baseline metrics
  const baselineStats = calculateTaskStats(currentBaselineTasks);

  // Calculate per-variant metrics
  const variantStats = {};
  for (const v of variants) {
    const vTasks = currentVariantTasks.filter((t) => t.prompt_version_id === v.id);
    variantStats[v.id] = {
      ...calculateTaskStats(vTasks),
      variant: v,
      taskCount: vTasks.length,
    };
  }

  // Check if we have enough data
  const hasEnoughData =
    Object.values(variantStats).some((s) => s.taskCount >= MIN_TASKS_FOR_EVALUATION) &&
    currentBaselineTasks.length >= MIN_TASKS_FOR_EVALUATION;

  if (!hasEnoughData) {
    log.info(req, 'optimizer.evaluation.insufficient-data', {
      agentId,
      variantCounts: Object.values(variantStats).map((s) => s.taskCount),
    });
    return {
      report: {
        agent_id: agentId,
        promoted: false,
        reason: 'Insufficient data — extending testing period',
        variant_tasks: Object.values(variantStats).map((s) => s.taskCount),
        baseline_tasks: currentBaselineTasks.length,
      },
    };
  }

  // Find the best performing variant
  let bestVariant = null;
  let bestDelta = { quality: 0, success: 0 };

  for (const [vid, stats] of Object.entries(variantStats)) {
    if (stats.taskCount < MIN_TASKS_FOR_EVALUATION) continue;

    const qualityDelta = stats.avgQuality - baselineStats.avgQuality;
    const successDelta = stats.successRate - baselineStats.successRate;

    const meetsThreshold =
      qualityDelta >= QUALITY_IMPROVEMENT_THRESHOLD ||
      successDelta >= SUCCESS_IMPROVEMENT_THRESHOLD;

    if (meetsThreshold && qualityDelta + successDelta > bestDelta.quality + bestDelta.success) {
      bestVariant = stats.variant;
      bestDelta = { quality: qualityDelta, success: successDelta };
    }
  }

  const now = new Date().toISOString();

  if (bestVariant) {
    // Promote winner
    await admin
      .from('prompt_versions')
      .update({
        status: 'active',
        promoted_at: now,
        test_metrics: { ...variantStats[bestVariant.id], variant: undefined },
      })
      .eq('id', bestVariant.id);

    // Archive old active versions for this agent
    await admin
      .from('prompt_versions')
      .update({ status: 'archived', archived_at: now })
      .eq('agent_id', agentId)
      .eq('status', 'active')
      .neq('id', bestVariant.id);

    // Reject other testing variants
    const otherVariantIds = variants.filter((v) => v.id !== bestVariant.id).map((v) => v.id);
    if (otherVariantIds.length) {
      await admin
        .from('prompt_versions')
        .update({ status: 'rejected', archived_at: now })
        .in('id', otherVariantIds);
    }

    // Update agent_blueprints with new prompt
    if (bestVariant.blueprint_id) {
      await admin
        .from('agent_blueprints')
        .update({
          system_prompt: bestVariant.system_prompt,
          version: bestVariant.version,
          updated_at: now,
        })
        .eq('id', bestVariant.blueprint_id);
    }

    log.info(req, 'optimizer.evaluation.promoted', {
      agentId,
      variant: bestVariant.variant_label,
      strategy: bestVariant.optimization_strategy,
      qualityDelta: bestDelta.quality.toFixed(1),
      successDelta: bestDelta.success.toFixed(1),
    });

    return {
      report: {
        agent_id: agentId,
        promoted: true,
        winner: bestVariant.variant_label,
        strategy: bestVariant.optimization_strategy,
        quality_delta: bestDelta.quality,
        success_delta: bestDelta.success,
        baseline: baselineStats,
      },
      strategyOutcome: {
        strategy: bestVariant.optimization_strategy,
        agent_id: agentId,
        quality_delta: bestDelta.quality,
        success_rate_delta: bestDelta.success,
        promoted: true,
      },
    };
  }

  // No variant won — reject all
  await admin
    .from('prompt_versions')
    .update({ status: 'rejected', archived_at: now })
    .in('id', variantIds);

  log.info(req, 'optimizer.evaluation.no-winner', { agentId });

  return {
    report: {
      agent_id: agentId,
      promoted: false,
      reason: 'No variant met improvement threshold',
      baseline: baselineStats,
      variants: Object.entries(variantStats).map(([vid, s]) => ({
        id: vid,
        label: s.variant?.variant_label,
        quality: s.avgQuality,
        success: s.successRate,
        tasks: s.taskCount,
      })),
    },
    strategyOutcome: variants.map((v) => ({
      strategy: v.optimization_strategy,
      agent_id: agentId,
      quality_delta: (variantStats[v.id]?.avgQuality || 0) - baselineStats.avgQuality,
      success_rate_delta: (variantStats[v.id]?.successRate || 0) - baselineStats.successRate,
      promoted: false,
    }))[0],
  };
}

function calculateTaskStats(tasks) {
  if (!tasks.length) return { avgQuality: 0, successRate: 0, total: 0 };
  const done = tasks.filter((t) => t.status === 'done').length;
  const failed = tasks.filter((t) => t.status === 'failed').length;
  const total = done + failed;
  const successRate = total > 0 ? (done / total) * 100 : 0;

  // Quality from consilium scores stored in task data
  const qualityScores = tasks.map((t) => t.data?.quality_score).filter((s) => s != null);
  const avgQuality =
    qualityScores.length > 0 ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length : 0;

  return { avgQuality, successRate, total };
}

// ── Shared helpers ───────────────────────────────────────────────────────────

async function completeRun(admin, runId, status, updates = {}) {
  if (!runId) return;
  await admin
    .from('optimization_runs')
    .update({
      status,
      completed_at: new Date().toISOString(),
      ...updates,
    })
    .eq('id', runId);
}
