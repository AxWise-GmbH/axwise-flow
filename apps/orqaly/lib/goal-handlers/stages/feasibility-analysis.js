/**
 * Stage 0: Feasibility Analysis
 *
 * Pre-goal profitability and feasibility check.
 * Simple mode: quick LLM assessment.
 * Advanced mode: LLM + historical data + tool availability scan.
 *
 * Output: feasibility_report JSONB stored on goal.
 * Decision: proceed → po-analysis | adjust → notify user | cancel → notify user
 */
import { createHash } from 'node:crypto';
import { parseLlmJson } from '../../agent-handlers/llm-executor.js';
import { executeLlmTracked } from '../../usage-handlers/tracked-llm.js';
import { createLogger } from '../../../api/_lib/logger.js';
import { listConfiguredToolIds } from '../../security/tool-credential-status.js';
import {
  businessEvidenceProfileHash,
  evidenceProfileV2ExecutionEnabledForModel,
  executionRolesForEvidenceProfile,
  validateBusinessEvidenceProfile,
} from '../../integrations/axwise/evidence-contract-v2.js';
import { marketScopeHashPayload, marketScopeReady } from '../../_shared/market-scope.js';
import { goalRunsUnattended } from '../hitl-policy.js';
import { guardNativeLegacyStageEntry } from '../native-legacy-stage-entry.js';
import {
  logGoalEvent,
  updateGoal,
  loadGoal,
  enqueueGoalAction,
  notifyGoalEvent,
  CATEGORY_TOOLS,
  pickTestModel,
} from '../_helpers.js';

const log = createLogger('goal-stage:feasibility');
const GROUNDED_RESEARCH_MODES = new Set(['grounded_fast', 'grounded_deep']);
const SHA256_RE = /^[a-f0-9]{64}$/;
const UUID_RE = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function validTimestamp(value) {
  return typeof value === 'string' && value.trim() && Number.isFinite(Date.parse(value));
}

function sameStringList(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

/**
 * A started v2 Smart Request delegates grounded evidence acquisition to
 * AxWise. Prove that persisted boundary without consulting the current
 * admission cohort: closing admission must not strand already-started work.
 * The execution-model switch remains authoritative and can stop the drain.
 */
export function isAxwiseManagedGroundedResearch(goal, env = process.env) {
  if (
    goal?.mode !== 'advanced' ||
    !UUID_RE.test(String(goal?.org_id || '')) ||
    typeof goal?.user_id !== 'string' ||
    !goal.user_id.trim()
  ) {
    return false;
  }

  const data = plainObject(goal?.data);
  const admission = plainObject(data?.smart_request_admission);
  const evidence = plainObject(data?.evidence);
  const attachments = data?.attachments;
  const authorizedAgentIds = admission?.authorized_agent_ids;
  if (
    admission?.version !== 1 ||
    admission.status !== 'started' ||
    !Array.isArray(authorizedAgentIds) ||
    authorizedAgentIds.length === 0 ||
    authorizedAgentIds.some((id) => typeof id !== 'string' || !id.trim()) ||
    new Set(authorizedAgentIds).size !== authorizedAgentIds.length ||
    !validTimestamp(admission.checked_at) ||
    !validTimestamp(admission.started_at) ||
    admission.checked_at !== admission.started_at ||
    evidence?.status !== 'persisted' ||
    !validTimestamp(evidence.persisted_at) ||
    evidence.persisted_at !== admission.started_at ||
    !Number.isInteger(evidence.attachment_count) ||
    evidence.attachment_count < 0 ||
    !Array.isArray(attachments) ||
    evidence.attachment_count !== attachments.length
  ) {
    return false;
  }

  const policy = plainObject(data.research_policy);
  const profile = plainObject(policy?.business_evidence_profile);
  const marketScopeHash = String(policy?.market_scope_hash || '');
  if (
    policy?.version !== 2 ||
    policy.evidence_contract_version !== 2 ||
    !GROUNDED_RESEARCH_MODES.has(policy.research_mode) ||
    policy.grounding_required !== true ||
    policy.research_fail_closed !== true ||
    !marketScopeReady(policy.market_scope) ||
    !SHA256_RE.test(marketScopeHash) ||
    !profile
  ) {
    return false;
  }

  const marketHashPayload = marketScopeHashPayload(policy.market_scope);
  const computedMarketScopeHash = marketHashPayload
    ? createHash('sha256').update(JSON.stringify(marketHashPayload)).digest('hex')
    : null;
  if (computedMarketScopeHash !== marketScopeHash) return false;

  const validation = validateBusinessEvidenceProfile(profile, {
    expectedMarketScopeHash: marketScopeHash,
  });
  if (
    !validation.ok ||
    profile.economic_model === 'none' ||
    !evidenceProfileV2ExecutionEnabledForModel(profile.economic_model, env)
  ) {
    return false;
  }

  try {
    return (
      policy.intent === profile.intent &&
      policy.business_evidence_profile_hash === businessEvidenceProfileHash(profile) &&
      sameStringList(policy.required_role_slots, profile.required_role_slots) &&
      sameStringList(policy.requested_execution_roles, executionRolesForEvidenceProfile(profile))
    );
  } catch {
    return false;
  }
}

async function getHistoricalData(admin, userId, category) {
  try {
    const { data } = await admin
      .from('goal_velocity')
      .select('avg_tokens_per_task, avg_duration_seconds, success_rate, sample_count')
      .eq('user_id', userId)
      .eq('goal_category', category || 'general')
      .limit(5);
    if (!data?.length) return null;
    const totalSamples = data.reduce((s, d) => s + (d.sample_count || 0), 0);
    if (totalSamples === 0) return null;
    const avgSuccess =
      data.reduce((s, d) => s + (d.success_rate || 0) * (d.sample_count || 0), 0) / totalSamples;
    const avgTokens =
      data.reduce((s, d) => s + (d.avg_tokens_per_task || 0) * (d.sample_count || 0), 0) /
      totalSamples;
    return {
      similar_goals_count: totalSamples,
      avg_tokens: avgTokens,
      avg_success_rate: avgSuccess,
    };
  } catch (err) {
    log.warn(null, 'feasibility.historical.failed', { error: err.message });
    return null;
  }
}

export async function checkToolAvailability(
  admin,
  userId,
  description,
  { axwiseManagedResearch = false } = {}
) {
  // Rough category detection from goal description
  const keywords = (description || '').toLowerCase();
  const neededCategories = new Set();
  if (/research|search|find|analyz/i.test(keywords)) neededCategories.add('research');
  if (/email|outreach|contact|send/i.test(keywords)) neededCategories.add('outreach');
  if (/code|develop|build|program|api/i.test(keywords)) neededCategories.add('development');
  if (/design|visual|logo|brand/i.test(keywords)) neededCategories.add('design');
  if (/automat|scrape|browse|web/i.test(keywords)) neededCategories.add('automation');
  if (neededCategories.size === 0) neededCategories.add('general');

  const toolIds = [
    ...new Set([...neededCategories].flatMap((c) => CATEGORY_TOOLS[c] || [])),
  ].filter((toolId) => !(axwiseManagedResearch && toolId === 'tool-web-search'));
  if (toolIds.length === 0) return { available: [], missing: [] };

  try {
    const configured = await listConfiguredToolIds(admin, userId, toolIds);
    return {
      available: toolIds.filter((id) => configured.has(id)),
      missing: toolIds.filter((id) => !configured.has(id)),
    };
  } catch {
    return { available: [], missing: toolIds };
  }
}

export async function handle(admin, payload, req) {
  const goal = await loadGoal(admin, payload.goalId);
  const nativeRedirect = await guardNativeLegacyStageEntry(admin, goal, 'feasibility-analysis');
  if (nativeRedirect) return nativeRedirect;
  await updateGoal(admin, goal.id, { status: 'feasibility' });

  const isAdvanced = goal.mode === 'advanced';
  const axwiseManagedResearch = isAxwiseManagedGroundedResearch(goal);

  // Gather historical + tool data for advanced mode
  let historical = null;
  let toolAvailability = { available: [], missing: [] };

  if (isAdvanced) {
    [historical, toolAvailability] = await Promise.all([
      getHistoricalData(admin, goal.user_id, goal.parsed_category),
      checkToolAvailability(admin, goal.user_id, `${goal.title} ${goal.description}`, {
        axwiseManagedResearch,
      }),
    ]);
  }

  const historicalContext = historical
    ? `\nHistorical data: ${historical.similar_goals_count} similar goals, avg success rate ${(historical.avg_success_rate * 100).toFixed(0)}%, avg tokens ${historical.avg_tokens.toFixed(0)} per task.`
    : '';

  const toolContext =
    toolAvailability.missing.length > 0
      ? `\nMissing tools: ${toolAvailability.missing.join(', ')} (will need to be configured).`
      : '';
  const axwiseResearchContext = axwiseManagedResearch
    ? "\nAxWise owns this admitted goal's grounded evidence acquisition. Do not require Orqaly tool-web-search for feasibility; assess every actual execution-task tool normally."
    : '';

  const result = await executeLlmTracked({
    prompt: [
      'Analyze this goal for feasibility and profitability:',
      `Title: ${goal.title}`,
      goal.description ? `Description: ${goal.description}` : '',
      `Budget: $${goal.budget_usd}`,
      goal.parsed_requirements ? `Requirements: ${goal.parsed_requirements}` : '',
      goal.parsed_category ? `Category: ${goal.parsed_category}` : '',
      historicalContext,
      toolContext,
      axwiseResearchContext,
      '',
      'PLATFORM CAPABILITIES: AI agent teams (research, content, analysis, development, design, outreach), tools (web search, email, GitHub, browser automation, design), knowledge base, workflow engine.',
      '',
      'IMPORTANT COST CONTEXT:',
      '- "estimated_token_cost" means ONLY the cost of AI API calls (LLM tokens), NOT real-world business costs.',
      '- Each LLM call costs approximately $0.003-0.02 depending on complexity.',
      '- A typical goal uses 5-30 LLM calls total across all phases.',
      '- So most goals cost $0.05 to $2.00 in tokens. Complex goals may cost $3-10.',
      '- A $10 budget is sufficient for most research/planning goals.',
      '- A $50 budget is generous for complex multi-phase goals.',
      '- NEVER estimate token cost above $20 unless the goal requires 100+ LLM calls.',
      '',
      historicalContext
        ? ''
        : 'NOTE: No historical data exists for this goal category yet. Set historical to null in your response.',
      '',
      'Assess:',
      '1. Complexity score (0-1): how complex is this goal? Write 1 sentence explaining what drives the complexity.',
      '2. Estimated TOKEN cost (AI API calls only, NOT business costs)',
      '3. Success probability (0-1)',
      '4. Risk factors: write each as a full sentence — "RiskName: explanation of why this is a risk and its impact" (e.g. "Market saturation: 3D printing services are commoditized — differentiation through AI automation is key")',
      '5. Revenue potential (none/low/medium/high) + 1 sentence explaining WHY it is rated this way',
      '6. Recommendation: proceed / adjust / cancel, with 2-3 sentences covering complexity, revenue, and risk rationale',
      '',
      'Respond with JSON: { "complexity_score": 0.0-1.0, "complexity_reason": "1 sentence", "profitability": { "estimated_token_cost": number, "estimated_service_cost": 0, "revenue_potential": "none|low|medium|high", "revenue_potential_reason": "1 sentence", "roi_projection": "positive|neutral|negative" }, "feasibility": { "success_probability": 0.0-1.0, "risk_factors": ["Full sentence per risk"], "competitive_analysis": "2-3 sentences", "tool_availability": { "available": [...], "missing": [...] } }, "historical": null, "recommendation": "proceed|adjust|cancel", "recommendation_reason": "2-3 sentences" }',
    ]
      .filter(Boolean)
      .join('\n'),
    systemPrompt:
      'You are an AI platform cost analyst. Assess goal feasibility based on AI TOKEN costs (not real-world business costs). Most goals cost $0.50-$5.00 in tokens. A $10 budget handles most goals. A $50 budget is generous. Lean toward "proceed" — only recommend "adjust" if the goal truly requires more LLM calls than the budget allows. NEVER inflate token cost estimates with real-world costs like hosting, inventory, or marketing spend.',
    // Keep feasibility on the same pinned executor as the rest of the goal.
    ...pickTestModel(goal),
    temperature: 0.2,
    // 1100 was too tight for verbose models (e.g. Gemini's long complexity_reason
    // plus reasoning tokens on thinking variants) — the JSON got truncated before
    // its closing brace and parseLlmJson returned null. 2000 leaves headroom.
    maxTokens: 2000,
    jsonMode: true,
    req,
    usage: {
      admin,
      userId: goal.user_id,
      goalId: goal.id,
      organizationId: goal.org_id,
      teamId: goal.agent_team_id || goal.team_id,
      consiliumId: goal.concilium_id,
      source: 'feasibility-analysis',
      operation: 'analysis',
      description: `Feasibility analysis: ${goal.title}`,
    },
  });

  const report = parseLlmJson(result.content);
  if (!report) {
    // Propagate the real problem instead of proceeding with a generic stub.
    // Running pm-planning on a fabricated complexity_score=0.5 /
    // success_probability=0.6 report hides whatever actually broke (LLM
    // returned prose, hit rate limit, timed out). The goal gets one chance
    // to fail cleanly with an actionable message.
    const raw = String(result?.content || '').slice(0, 500);
    const reason = `Feasibility LLM returned unparseable output. Provider: ${result?.provider || 'unknown'}. Raw content (first 500 chars): ${raw || '(empty)'}`;
    await updateGoal(admin, goal.id, {
      status: 'failed',
      data: {
        ...(goal.data || {}),
        failure_reason: reason,
        failed_at: new Date().toISOString(),
        failure_stage: 'feasibility-analysis',
      },
    });
    await logGoalEvent(admin, goal.id, 'goal_failed', { reason, stage: 'feasibility-analysis' });
    log.warn(req, 'feasibility.parse.fail-fast', { goalId: goal.id });
    return {
      type: 'orchestrate-goal',
      action: 'feasibility-analysis',
      goalId: goal.id,
      status: 'failed_parse',
    };
  }

  // Inject real tool availability data (override LLM's guess)
  if (report.feasibility) {
    report.feasibility.tool_availability = toolAvailability;
  }
  // Override historical data with REAL data (prevent LLM hallucination)
  if (historical) {
    report.historical = {
      similar_goals_count: historical.similar_goals_count,
      avg_cost_similar: historical.avg_tokens * 0.0002,
      avg_success_rate_similar: historical.avg_success_rate,
    };
  } else {
    // No real data — force null instead of LLM's fabricated numbers
    report.historical = null;
  }

  const costUsd = result.estimatedCostUsd || 0;
  await updateGoal(admin, goal.id, {
    feasibility_report: report,
    spent_usd: Number(goal.spent_usd || 0) + costUsd,
  });

  await logGoalEvent(
    admin,
    goal.id,
    'feasibility_done',
    {
      recommendation: report.recommendation,
      complexity_score: report.complexity_score,
      success_probability: report.feasibility?.success_probability,
    },
    costUsd
  );

  // Track financial event
  if (costUsd > 0) {
    try {
      await admin.from('financial_events').insert({
        user_id: goal.user_id,
        goal_id: goal.id,
        event_type: 'token_spend',
        amount_usd: costUsd,
        direction: 'out',
        source: 'feasibility-analysis',
        description: `Feasibility analysis for: ${goal.title.slice(0, 60)}`,
      });
    } catch (err) {
      log.warn(req, 'feasibility.financial-event.failed', { error: err.message });
    }
  }

  // Decision gate
  if (report.recommendation === 'cancel') {
    await updateGoal(admin, goal.id, { status: 'failed' });
    await notifyGoalEvent(admin, goal, 'goal_failed', {
      reason: report.recommendation_reason || 'Feasibility analysis recommends cancellation.',
    });
    return {
      type: 'orchestrate-goal',
      action: 'feasibility-analysis',
      goalId: goal.id,
      status: 'cancelled',
      report,
    };
  }

  if (report.recommendation === 'adjust') {
    // Hands-off execution: a feasibility "adjust" warning is informational,
    // not a stop-gate. Log the concern so it stays visible in the activity
    // feed, then continue to po-analysis. Without this, every hands-off goal
    // with a slightly tight budget gets paused at feasibility, then the resume
    // path stamps it "complete" with zero work done (see goals.js setStatus
    // resume logic).
    //
    // Two ways in: the legacy simple+auto pairing, and an explicit
    // hitl_mode='unattended' from the New Goal dialog's Human Approve switch.
    // The latter is the only one that reaches advanced-mode goals.
    const handsOff =
      goalRunsUnattended(goal) || (goal.mode === 'simple' && goal.execution_mode === 'auto');
    if (handsOff) {
      const handsOffReason = goalRunsUnattended(goal) ? 'unattended' : 'simple/auto mode';
      await logGoalEvent(admin, goal.id, 'feasibility_adjust_noted', {
        feedback: `Feasibility noted concerns (continuing anyway - ${handsOffReason}): ${report.recommendation_reason}`,
        hands_off_reason: handsOffReason,
        success_probability: report.feasibility?.success_probability,
      });
      await notifyGoalEvent(admin, goal, 'feasibility_done', {
        feedback: `Feasibility flagged: ${report.recommendation_reason?.slice(0, 180)} - continuing without pausing.`,
      });
      await enqueueGoalAction(admin, 'po-analysis', goal.id);
      return {
        type: 'orchestrate-goal',
        action: 'feasibility-analysis',
        goalId: goal.id,
        status: 'proceed_with_warning',
        report,
      };
    }
    // Advanced or manual mode: pause for user review (existing behavior).
    await updateGoal(admin, goal.id, { status: 'paused' });
    await notifyGoalEvent(admin, goal, 'feasibility_done', {
      feedback: `Adjust recommended: ${report.recommendation_reason}`,
    });
    return {
      type: 'orchestrate-goal',
      action: 'feasibility-analysis',
      goalId: goal.id,
      status: 'adjust',
      report,
    };
  }

  // Theory Mode: generate quick preview after feasibility passes
  if (goal.theory_mode) {
    try {
      const { generateQuickPreview } = await import('./theory-projection.js');
      await generateQuickPreview(admin, goal, req);
    } catch (err) {
      log.warn(req, 'feasibility.theory-preview.failed', { goalId: goal.id, error: err.message });
      // Non-blocking — don't fail the pipeline if theory mode errors
    }
  }

  // Proceed → PO Analysis
  await enqueueGoalAction(admin, 'po-analysis', goal.id);
  return {
    type: 'orchestrate-goal',
    action: 'feasibility-analysis',
    goalId: goal.id,
    status: 'proceed',
    report,
  };
}
