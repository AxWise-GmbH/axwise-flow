import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError } from '../../api/_lib/errors.js';
import { checkRateLimit, getRateLimitIdentifier, applyRateLimitHeaders } from '../../api/_lib/rate-limit.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';

/* ── Entity-ID mapping constants ── */

const EVENT_ENTITY_MAP = {
  'goal_created': 'frontend-goals',
  'goal_completed': 'frontend-goals',
  'goal_failed': 'frontend-goals',
  'goal_cancelled': 'frontend-goals',
  'goal_paused': 'frontend-goals',
  'goal_resumed': 'frontend-goals',
  'budget_updated': 'frontend-goals',
  'feasibility_started': 'agent-goal-orchestrator',
  'feasibility_done': 'agent-goal-orchestrator',
  'planning_started': 'agent-goal-orchestrator',
  'planning_done': 'agent-goal-orchestrator',
  'team_formed': 'team-collaboration',
  'team_assigned': 'team-collaboration',
  'task_started': 'team-task-execution',
  'task_completed': 'team-task-execution',
  'task_failed': 'team-task-execution',
  'execution_started': 'agent-job-processor',
  'execution_done': 'agent-job-processor',
  'evaluation_started': 'consilium-evaluation-engine',
  'evaluation_done': 'consilium-consensus',
  'phase_completed': 'agent-goal-orchestrator',
  'retrospective_done': 'agent-goal-orchestrator',
};

const JOB_ACTION_ENTITY_MAP = {
  'feasibility-analysis': 'agent-goal-orchestrator',
  'plan-goal': 'agent-goal-orchestrator',
  'assemble-team': 'team-collaboration',
  'execute-task': 'team-task-execution',
  'evaluate-output': 'consilium-evaluation-engine',
  'orchestrate-goal': 'agent-goal-orchestrator',
  'run-tool': 'agent-tool-runner',
  'llm-call': 'agent-llm-executor',
};

const PROVIDER_ENTITY_MAP = {
  'groq': 'llm-groq',
  'openai': 'llm-openai',
  'anthropic': 'llm-anthropic',
};

const TOOL_ENTITY_MAP = {
  'github': 'service-github',
  'vercel': 'service-vercel-deployments',
  'composio': 'service-composio',
  'browser': 'service-browser-automation',
  'doc-generator': 'service-doc-generator',
};

/* ── Helpers ── */

function formatEventType(eventType) {
  if (!eventType) return '';
  return eventType
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function inferStepStatus(eventType) {
  if (!eventType) return 'completed';
  if (eventType.includes('failed') || eventType.includes('cancelled')) return 'failed';
  return 'completed';
}

function buildEntityPath(log) {
  const eventType = log?.event_type || '';
  const primary = EVENT_ENTITY_MAP[eventType];
  const path = primary ? [primary] : ['frontend-goals'];

  // Add secondary entities based on event type
  if (eventType.startsWith('feasibility_')) {
    path.push('agent-llm-executor');
  }
  if (eventType === 'team_formed') {
    path.push('team-task-execution');
  }
  if (eventType === 'evaluation_done') {
    path.push('consilium-consensus');
  }

  // Check details for tool / provider entities
  const details = log?.details || {};
  if (details.tool) {
    const toolEntity = TOOL_ENTITY_MAP[details.tool];
    if (toolEntity) path.push(toolEntity);
  }
  if (details.provider) {
    const providerEntity = PROVIDER_ENTITY_MAP[details.provider];
    if (providerEntity) path.push(providerEntity);
  }

  return path;
}

/* ── Handler ── */

export default async function goalTrace(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Auth
  const user = await verifySupabaseToken(getBearerToken(req));
  if (!user) return jsonError(res, 401, 'Unauthorized');

  // Rate limit
  const rlKey = `goal-trace:${getRateLimitIdentifier(req, user.id)}`;
  const rl = await checkRateLimit({ key: rlKey, limit: 20, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Rate limit exceeded');

  // Admin client
  const sb = buildSupabaseAdminClient();
  if (!sb) return jsonError(res, 503, 'Database unavailable');

  // Validate goalId
  const goalId = req.query?.goalId;
  if (!goalId) return jsonError(res, 400, 'Missing goalId query parameter');

  // Fetch goal
  const { data: goal, error: goalErr } = await sb
    .from('goals')
    .select('id, title, status, budget_usd, spent_usd, created_at, updated_at')
    .eq('id', goalId)
    .single();

  if (goalErr || !goal) return jsonError(res, 404, 'Goal not found');

  // Parallel: goal_log + agent_jobs
  const [logRes, jobsRes] = await Promise.all([
    sb
      .from('goal_log')
      .select('*')
      .eq('goal_id', goalId)
      .order('created_at', { ascending: true }),
    sb
      .from('agent_jobs')
      .select('*')
      .or(`payload->>goalId.eq.${goalId},payload->>goal_id.eq.${goalId}`)
      .order('created_at', { ascending: true }),
  ]);

  const logs = logRes.data || [];
  const jobs = jobsRes.data || [];
  const jobIds = jobs.map((j) => j.id).filter(Boolean);

  // Parallel: llm_usage + concilium_evaluations (only if jobs exist)
  let llmRows = [];
  let evalRows = [];
  if (jobIds.length > 0) {
    const [llmRes, evalRes] = await Promise.all([
      sb
        .from('llm_usage')
        .select('id, job_id, provider, model, total_tokens, estimated_cost_usd, duration_ms, created_at')
        .in('job_id', jobIds)
        .order('created_at', { ascending: true }),
      sb
        .from('concilium_evaluations')
        .select('id, agent_job_id, overall_score, approved, feedback, summary, provider, model, estimated_cost_usd, duration_ms, created_at')
        .in('agent_job_id', jobIds)
        .order('created_at', { ascending: true }),
    ]);
    llmRows = llmRes.data || [];
    evalRows = evalRes.data || [];
  }

  // Build steps from goal_log events
  const steps = [];

  for (const log of logs) {
    steps.push({
      step: 0,
      entityId: EVENT_ENTITY_MAP[log.event_type] || 'frontend-goals',
      action: log.event_type,
      description: formatEventType(log.event_type),
      cost: null,
      duration: null,
      status: inferStepStatus(log.event_type),
      provider: null,
      model: null,
      timestamp: log.created_at,
      entityPath: buildEntityPath(log),
    });
  }

  // Steps from LLM usage rows
  for (const row of llmRows) {
    const providerEntity = PROVIDER_ENTITY_MAP[row.provider] || 'agent-llm-executor';
    steps.push({
      step: 0,
      entityId: providerEntity,
      action: 'llm-call',
      description: `LLM call via ${row.provider || 'unknown'} (${row.model || 'unknown'})`,
      cost: row.estimated_cost_usd,
      duration: row.duration_ms,
      status: 'completed',
      provider: row.provider,
      model: row.model,
      timestamp: row.created_at,
      entityPath: ['agent-llm-executor', providerEntity],
    });
  }

  // Steps from evaluation rows
  for (const row of evalRows) {
    steps.push({
      step: 0,
      entityId: 'consilium-evaluation-engine',
      action: 'evaluate-output',
      description: `Evaluation ${row.approved ? 'approved' : 'rejected'} (score ${row.overall_score})`,
      cost: row.estimated_cost_usd,
      duration: row.duration_ms,
      status: row.approved ? 'completed' : 'failed',
      provider: row.provider,
      model: row.model,
      timestamp: row.created_at,
      entityPath: ['consilium-evaluation-engine', 'consilium-consensus'],
    });
  }

  // Sort by timestamp, re-number
  steps.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  steps.forEach((s, i) => { s.step = i + 1; });

  // Summary
  const totalCost = steps.reduce((sum, s) => sum + (s.cost || 0), 0);
  const timestamps = steps.map((s) => new Date(s.timestamp).getTime()).filter((t) => !isNaN(t));
  const totalDuration = timestamps.length >= 2
    ? timestamps[timestamps.length - 1] - timestamps[0]
    : 0;
  const llmCalls = llmRows.length;
  const toolCalls = logs.filter((l) => l.details?.tool).length;
  const scores = evalRows.map((e) => e.overall_score).filter((s) => s != null);
  const avgScore = scores.length > 0
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : null;

  return res.status(200).json({
    goal: {
      id: goal.id,
      name: goal.title,
      status: goal.status,
      totalCost,
      totalDuration,
      llmCalls,
      toolCalls,
      avgScore,
      createdAt: goal.created_at,
    },
    steps,
  });
}
