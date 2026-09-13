/**
 * Process-map spec — the curated, code-grounded "map of what we have" for the
 * three core platform processes: Goal, Loop, Pulse. Each map is an ordered graph
 * of steps; every step declares what triggers it (cron), which API it calls,
 * which tool/MCP and LLM it uses, which DB tables + storage it touches, which
 * feature pages surface it, how it links into the org/team/consilium structure,
 * plus a plain-language narrative and the criteria/skills/KB specifics.
 *
 * This module is the single source of truth. `lib/ops-handlers/process-maps.js`
 * enriches each step's `metricKeys` with live values and serves it to the /data
 * page "Guides" view. IDs in `tables`/`pages` intentionally match the entity IDs
 * emitted by data-topology.js (`table-<name>`, `frontend-<slug>`, `cron-<name>`)
 * so the frontend can deep-link a step into the existing live detail panel.
 *
 * Every fact here is traceable to a file (see each step's `file`). Do not invent
 * behavior — if the code changes, update the narrative to match.
 */

// Canonical metric keys the live endpoint knows how to compute. Steps reference
// a subset via `metricKeys`; the endpoint attaches { key, label, value } values.
export const METRIC_KEYS = [
  'goals_active',
  'goals_total',
  'goals_completed_7d',
  'goals_failed_active',
  'agent_jobs_queued',
  'agent_jobs_running',
  'team_tasks_active',
  'agent_teams_total',
  'tools_configured',
  'knowledge_documents_total',
  'goal_messages_24h',
  'llm_usage_24h_calls',
  'llm_usage_24h_cost',
  'llm_usage_total_cost',
  'financial_events_24h',
  'loop_enabled_goals',
  'agent_pulses_enabled',
  'pulse_runs_24h',
  'pulse_cycles_24h',
  'concilium_agents_pulsing',
];

// Node kinds → drive color/icon on the canvas.
export const STEP_KINDS = ['trigger', 'worker', 'stage', 'review', 'llm', 'tool', 'store', 'loop'];

/* ─────────────────────────────  GOAL  ───────────────────────────── */

const GOAL = {
  id: 'goal',
  label: 'Goal',
  description:
    'The end-to-end goal pipeline: a goal is created, the Consilium reviews feasibility against criteria, a PM decomposes it into phased tasks, a team of skilled agents executes with tools + LLMs, outputs are stored in the knowledge base, and each phase is scored before the goal completes.',
  steps: [
    {
      id: 'goal-create',
      label: 'Create Goal',
      kind: 'trigger',
      file: 'lib/api-handlers/goals.js',
      summary:
        'User (or assistant) creates a goal; it is persisted and the first pipeline job is enqueued.',
      narrative:
        'handleCreate resolves the owning organization (resolveGoalOrgId), inserts a row into `goals` with status "feasibility", self-roots the loop chain, enqueues an `orchestrate-goal`/`feasibility-analysis` job into `agent_jobs`, writes a `goal_created` row to `goal_log`, and kicks the worker inline.',
      cron: null,
      api: 'POST /api/app?path=goals&op=create',
      tools: [],
      llms: [],
      tables: ['goals', 'agent_jobs', 'goal_log'],
      storage: [],
      pages: ['frontend-goals'],
      structure: ['org'],
      criteria: [],
      skills: [],
      kbWrites: [],
      metricKeys: ['goals_active', 'goals_total'],
    },
    {
      id: 'goal-worker',
      label: 'Worker (process-next)',
      kind: 'worker',
      file: 'lib/agent-handlers/process-next.js',
      summary:
        'The heartbeat cron claims the next queued job and routes it to the goal orchestrator.',
      narrative:
        'Every minute the process-next cron reconciles active goals, heals stuck jobs, runs pulse auto-assign, then claimNextJob flips the oldest queued `agent_jobs` row to "running" and dispatches it by payload.type — orchestrate-goal → goal-orchestrator.handleGoalOrchestration, which maps payload.action to a stage handler.',
      cron: '*/1 * * * *',
      api: 'GET /api/agent?path=process-next',
      tools: [],
      llms: [],
      tables: ['agent_jobs'],
      storage: [],
      pages: ['frontend-job-pool'],
      structure: [],
      criteria: [],
      skills: [],
      kbWrites: [],
      metricKeys: ['agent_jobs_queued', 'agent_jobs_running'],
    },
    {
      id: 'goal-feasibility',
      label: 'Feasibility + Consilium',
      kind: 'review',
      file: 'lib/goal-handlers/stages/feasibility-analysis.js',
      summary:
        'The Consilium board assesses whether the goal is feasible before any work is planned.',
      narrative:
        'The feasibility stage briefs the board attached to the goal (goal.concilium_id) and decides go / adjust / cancel. Approved goals advance to PO analysis; otherwise the goal is paused or failed. This is where the Consilium first gates the goal.',
      cron: null,
      api: null,
      tools: [],
      llms: [{ provider: 'gemini', model: 'gemini-3.8-flash' }],
      tables: ['goals', 'goal_log'],
      storage: [],
      pages: ['frontend-consilium', 'frontend-goals'],
      structure: ['consilium'],
      criteria: ['Board feasibility judgment (go / adjust / cancel) via goal.concilium_id'],
      skills: [],
      kbWrites: [],
      metricKeys: ['goals_active', 'llm_usage_24h_calls'],
    },
    {
      id: 'goal-planning',
      label: 'PM Planning',
      kind: 'stage',
      file: 'lib/goal-handlers/stages/pm-planning.js',
      summary:
        'The PRD is decomposed into phases and tasks, each tagged with role, tools, and acceptance criteria.',
      narrative:
        'pm-planning injects the Library Universe quality rubric (loadAndFormatCriteria) into the planner prompt and produces phased tasks. Each task carries required_role, tool_requirements and acceptance_criteria. The phase plan is embedded into the knowledge base for later reference.',
      cron: null,
      api: null,
      tools: [],
      llms: [{ provider: 'gemini', model: 'gemini-3.8-flash' }],
      tables: ['goals', 'team_tasks', 'workflows', 'knowledge_documents'],
      storage: [],
      pages: ['frontend-goals', 'frontend-workflow'],
      structure: [],
      criteria: [
        'Global quality rubric via lib/_shared/quality-criteria.js (loadAndFormatCriteria)',
        'Per-task acceptance_criteria + required_role + tool_requirements',
      ],
      skills: [],
      kbWrites: [
        { table: 'knowledge_documents', category: 'goal-plan', tags: ['goal', 'plan', 'phase-N'] },
      ],
      metricKeys: ['knowledge_documents_total'],
    },
    {
      id: 'goal-team',
      label: 'Team Formation',
      kind: 'stage',
      file: 'lib/goal-handlers/stages/team-formation.js',
      summary: 'A team of AI agents is assembled by matching each agent’s skills to the job.',
      narrative:
        'team-assigner ranks candidate agents with capabilityOverlap(agent, jobDescription, skillText). Installed skills are read from `agent_installed_skills` joined to `agent_skill_packs(name, content)`. The chosen agents + team lead are written to `agent_teams`/`agent_team_members`, and `team_tasks` are batch-created. Fails fast if no agents or missing credentials.',
      cron: null,
      api: null,
      tools: [],
      llms: [],
      tables: [
        'agent_teams',
        'agent_team_members',
        'team_tasks',
        'agent_installed_skills',
        'agent_skill_packs',
      ],
      storage: [],
      pages: ['frontend-agent-hub'],
      structure: ['team'],
      criteria: ['Agent ranked by capabilityOverlap score vs the task description'],
      skills: [
        'agent_installed_skills ⋈ agent_skill_packs(name, content); custom_content overrides',
      ],
      kbWrites: [],
      metricKeys: ['agent_teams_total', 'team_tasks_active'],
    },
    {
      id: 'goal-tools',
      label: 'Tool Provisioning',
      kind: 'tool',
      file: 'lib/goal-handlers/stages/tool-provisioning.js',
      summary:
        'Required tools/MCP are checked for credentials; missing ones pause the goal for setup.',
      narrative:
        'Collects tool_requirements from the tasks, checks the `tools` table for configured API keys. Internal connections count as always-configured; missing credentials move the goal to awaiting_tools and trigger the h40 credential-healing strategy. Otherwise it proceeds to execution.',
      cron: null,
      api: 'POST /api/app?path=goals&op=provide-tools',
      tools: ['MCP / Composio catalog', 'API + webhook tools'],
      llms: [],
      tables: ['tools', 'goals'],
      storage: [],
      pages: ['frontend-tools'],
      structure: [],
      criteria: [
        'Each required tool has a current encrypted BYOK credential or is connection_type=internal',
      ],
      skills: [],
      kbWrites: [],
      metricKeys: ['tools_configured'],
    },
    {
      id: 'goal-execute',
      label: 'Execute Phase / Tasks',
      kind: 'stage',
      file: 'lib/agent-handlers/execute-task.js',
      summary:
        'Agents run their tasks: call the LLM (with fallback), invoke tools, and save work to the KB.',
      narrative:
        'execute-phase dispatches one execute-task job per team_task. Each task runs executeLlmV2 (5-provider fallback chain) and runAgentWithTools (Composio / API / webhook). Results are embedded into `knowledge_documents` (agent work-memory), broadcast to `goal_messages`, and every call is recorded to `llm_usage` + `financial_events`.',
      cron: null,
      api: null,
      tools: ['runAgentWithTools → Composio / API / webhook executors'],
      llms: [
        { provider: 'gemini', model: 'gemini-3.8-flash' },
        { provider: 'anthropic', model: 'claude-sonnet-5' },
      ],
      tables: [
        'team_tasks',
        'knowledge_documents',
        'goal_messages',
        'llm_usage',
        'financial_events',
      ],
      storage: [],
      pages: ['frontend-goals', 'frontend-knowledge-base', 'frontend-communicator'],
      structure: ['team'],
      criteria: [],
      skills: ['Agent persona + installed skills injected into the task prompt'],
      kbWrites: [
        {
          table: 'knowledge_documents',
          category: 'agent-work-memory',
          tags: ['agent', 'work-memory', 'task-output'],
        },
      ],
      metricKeys: ['llm_usage_24h_calls', 'llm_usage_24h_cost', 'goal_messages_24h'],
    },
    {
      id: 'goal-evaluate',
      label: 'Consilium Review / Evaluate',
      kind: 'review',
      file: 'lib/goal-handlers/stages/consilium-review.js',
      summary:
        'The board scores each phase against acceptance criteria; pass advances, fail loops back.',
      narrative:
        'The Consilium evaluates the phase deliverables. ALL acceptance_criteria must pass; quality is scored 0-100; the phase is approved only if consensus.approved && risk.level !== "CRITICAL". Failure routes to iterate (re-plan), otherwise the next phase runs or the goal completes.',
      cron: null,
      api: null,
      tools: [],
      llms: [{ provider: 'per-member', model: 'concilium evaluate-v2' }],
      tables: ['goals', 'goal_log', 'llm_usage'],
      storage: [],
      pages: ['frontend-consilium'],
      structure: ['consilium'],
      criteria: [
        'phase.acceptance_criteria (ALL must pass)',
        'quality score 0-100',
        'approved iff consensus.approved && risk.level !== CRITICAL',
      ],
      skills: [],
      kbWrites: [],
      metricKeys: ['goals_completed_7d', 'llm_usage_24h_cost'],
    },
    {
      id: 'goal-complete',
      label: 'Complete + OSJA Review',
      kind: 'store',
      file: 'lib/goal-handlers/stages/complete.js',
      summary:
        'The goal is marked completed, deliverables finalized, and a post-completion review runs.',
      narrative:
        'complete sets goal.status = "completed", finalizes deliverables, and enqueues osja-review. If the goal is loop-enabled, this is where maybeSpawnContinuation kicks off the Loop process (see the Loop map).',
      cron: null,
      api: null,
      tools: [],
      llms: [],
      tables: ['goals', 'goal_log'],
      storage: ['goal-deliverables (storage buckets)'],
      pages: ['frontend-goals'],
      structure: ['org', 'team', 'consilium'],
      criteria: [],
      skills: [],
      kbWrites: [],
      metricKeys: ['goals_completed_7d'],
    },
  ],
};

/* ─────────────────────────────  LOOP  ───────────────────────────── */

const LOOP = {
  id: 'loop',
  label: 'Loop',
  description:
    'When a loop-enabled goal completes, the Loop process auto-spawns a continuation goal that carries the strategy forward and folds the new direction back into the parent’s deliverables — bounded by depth, budget, convergence, and optional human checkpoints.',
  steps: [
    {
      id: 'loop-toggle',
      label: 'Loop Switch',
      kind: 'trigger',
      file: 'lib/api-handlers/goals.js',
      summary: 'User enables the Loop switch on a goal (or re-enables a paused advanced chain).',
      narrative:
        'handleToggleLoop sets goals.loop_enabled = true. Re-enabling a paused advanced chain calls maybeRespawnAfterApproval → maybeSpawnContinuation. Advanced mode adds convergence / budget-cap / human-in-the-loop stop conditions via loop_settings.',
      cron: null,
      api: 'POST /api/app?path=goals&op=toggle-loop',
      tools: [],
      llms: [],
      tables: ['goals', 'goal_log'],
      storage: [],
      pages: ['frontend-job-pool', 'frontend-goals'],
      structure: [],
      criteria: [
        'Stop conditions: user off, failure, MAX_LOOP_DEPTH (50), convergence/budget/HITL when loop_advanced',
      ],
      skills: [],
      kbWrites: [],
      metricKeys: ['loop_enabled_goals'],
    },
    {
      id: 'loop-complete-hook',
      label: 'Completion Hook',
      kind: 'worker',
      file: 'lib/goal-handlers/stages/complete.js',
      summary: 'A loop-enabled goal reaching "complete" triggers continuation.',
      narrative:
        'At the end of the complete stage, maybeSpawnContinuation(admin, freshGoal, ...) runs. It checks depth, budget (chain_spend_v), convergence and pause reasons before deciding to spawn the next goal in the chain.',
      cron: '*/1 * * * *',
      api: null,
      tools: [],
      llms: [],
      tables: ['goals', 'chain_spend_v'],
      storage: [],
      pages: ['frontend-job-pool'],
      structure: [],
      criteria: [
        'loop_depth < MAX_LOOP_DEPTH',
        'chain spend under budget cap',
        'not converged / not paused',
      ],
      skills: [],
      kbWrites: [],
      metricKeys: ['loop_enabled_goals'],
    },
    {
      id: 'loop-spawn',
      label: 'Spawn Continuation Goal',
      kind: 'loop',
      file: 'lib/goal-handlers/loop-continuation.js',
      summary:
        'A new goal is created that inherits the parent’s org/team/consilium and advances the strategy.',
      narrative:
        'createContinuationGoal inserts a new `goals` row inheriting org_id, executor, concilium_id, workflow_id, and chain lineage (parent_goal_id, loop_chain_root_id, loop_depth+1). It enqueues feasibility for the child and notifies the user.',
      cron: null,
      api: null,
      tools: [],
      llms: [],
      tables: ['goals', 'agent_jobs', 'goal_log', 'notifications'],
      storage: [],
      pages: ['frontend-job-pool'],
      structure: ['org', 'team', 'consilium'],
      criteria: [],
      skills: [],
      kbWrites: [],
      metricKeys: ['goals_active', 'loop_enabled_goals'],
    },
    {
      id: 'loop-refine',
      label: 'Refine Parent Deliverables',
      kind: 'store',
      file: 'lib/goal-handlers/loop-refine-parent.js',
      summary: 'The child’s new strategy is folded back into the parent’s artifacts.',
      narrative:
        'A loop-refine-parent-deliverables job refines the parent’s deliverables (goal_artifacts / landing_pages) with the child’s direction, tagging refinements with source_goal_id in `deliverable_refinements`.',
      cron: null,
      api: null,
      tools: [],
      llms: [{ provider: 'gemini', model: 'gemini-3.8-flash' }],
      tables: ['deliverable_refinements', 'knowledge_documents', 'agent_jobs'],
      storage: ['goal-deliverables (storage buckets)'],
      pages: ['frontend-goals'],
      structure: [],
      criteria: [],
      skills: [],
      kbWrites: [],
      metricKeys: ['knowledge_documents_total'],
    },
    {
      id: 'loop-iterate',
      label: 'Iterate (re-plan on failure)',
      kind: 'loop',
      file: 'lib/goal-handlers/stages/iterate.js',
      summary:
        'Internal per-goal loop: on phase failure, re-plan and re-execute (bounded by max_iterations).',
      narrative:
        'Distinct from the Loop chain: when a phase fails, iterate checks iteration limits and budget, generates a revised plan via LLM (claude-sonnet-5, jsonMode), rebuilds `team_tasks`/`workflows`, and re-enqueues team-formation/execution. Bounded by goal.max_iterations.',
      cron: null,
      api: null,
      tools: [],
      llms: [{ provider: 'anthropic', model: 'claude-sonnet-5' }],
      tables: ['goals', 'team_tasks', 'workflows', 'goal_messages', 'llm_usage'],
      storage: [],
      pages: ['frontend-goals', 'frontend-workflow'],
      structure: ['team'],
      criteria: ['iteration count < goal.max_iterations', 'budget available'],
      skills: [],
      kbWrites: [],
      metricKeys: ['llm_usage_24h_calls'],
    },
  ],
};

/* ─────────────────────────────  PULSE  ───────────────────────────── */

const PULSE = {
  id: 'pulse',
  label: 'Pulse',
  description:
    'Two engines share the name "Pulse". System Pulse fires scheduled recurring actions (mostly spawning goals). Agent Pulse is the heartbeat of autonomous agents — a per-agent reflective LLM cycle that scores quality, saves learnings to the knowledge base, and refines prompts.',
  lanes: [
    { id: 'system-pulse', label: 'System Pulse (scheduled actions)' },
    { id: 'agent-pulse', label: 'Agent Pulse (autonomous cycles)' },
  ],
  steps: [
    // ── System Pulse lane ──
    {
      id: 'syspulse-cron',
      label: 'pg_cron pulse-tick',
      kind: 'trigger',
      lane: 'system-pulse',
      file: 'supabase/migrations/137_system_pulse.sql',
      summary: 'A Postgres cron pings the pulse-tick endpoint every minute.',
      narrative:
        'cron.schedule("pulse-tick", "* * * * *", ...) does a net.http_post to /api/ops?path=pulse-tick with the PULSE_SECRET bearer token. cron-job.org is the documented fallback.',
      cron: '* * * * *',
      api: 'POST /api/ops?path=pulse-tick',
      tools: [],
      llms: [],
      tables: ['agent_pulses'],
      storage: [],
      pages: ['frontend-agent-hub'],
      structure: [],
      criteria: [],
      skills: [],
      kbWrites: [],
      metricKeys: ['agent_pulses_enabled'],
    },
    {
      id: 'syspulse-tick',
      label: 'Fire Due Pulses',
      kind: 'worker',
      lane: 'system-pulse',
      file: 'lib/pulses/tick.js',
      summary: 'tick() finds due pulses, fires each action, and records a run.',
      narrative:
        'tick() queries `agent_pulses` where enabled and next_due_at <= now (capped at 25/tick), calls fireOne() per pulse, advances the schedule (computeNextDue), and writes one `pulse_runs` row per firing.',
      cron: null,
      api: 'POST /api/app?path=pulses&op=fire-now',
      tools: [],
      llms: [],
      tables: ['agent_pulses', 'pulse_runs'],
      storage: [],
      pages: ['frontend-agent-hub'],
      structure: ['org', 'team'],
      criteria: ['enabled && next_due_at <= now', 'owner_type ∈ agent | team | organization'],
      skills: [],
      kbWrites: [],
      metricKeys: ['pulse_runs_24h', 'agent_pulses_enabled'],
    },
    {
      id: 'syspulse-action',
      label: 'run-instruction → spawn Goal',
      kind: 'loop',
      lane: 'system-pulse',
      file: 'lib/pulses/actions/run-instruction.js',
      summary: 'The main pulse action spawns goals so the normal Goal pipeline does the work.',
      narrative:
        'run-instruction does not call an LLM directly; it inserts `goals` + `agent_jobs` (orchestrate-goal) so the full Goal pipeline (and its LLMs/tools) runs. repeat_goal entries can re-run same_team or spin up a fresh consilium assignment. Other actions: kpi-anomaly-scan, sync-kb-sources, scheduled-report, backup-database, etc.',
      cron: null,
      api: null,
      tools: ['referenced instruments/MCP by slug', 'kpi/anomaly, connection-sync, reports'],
      llms: [],
      tables: ['goals', 'agent_jobs', 'goal_log'],
      storage: [],
      pages: ['frontend-goals', 'frontend-agent-hub'],
      structure: ['org', 'team', 'consilium'],
      criteria: [],
      skills: [],
      kbWrites: [],
      metricKeys: ['goals_active', 'pulse_runs_24h'],
    },
    // ── Agent Pulse lane ──
    {
      id: 'agentpulse-detect',
      label: 'Detect Due Agents',
      kind: 'trigger',
      lane: 'agent-pulse',
      file: 'lib/agent-handlers/process-next.js',
      summary:
        'The worker cron finds autonomous agents whose next pulse is due and enqueues cycles.',
      narrative:
        'On each process-next tick, detectDuePulseAgents finds `concilium_agents` with pulse_enabled=true and next_pulse_at <= now, checks budget, and inserts `agent_jobs` with payload.type = "pulse-cycle" (and "prompt-refinement" every 10 cycles).',
      cron: '*/1 * * * *',
      api: 'GET /api/agent?path=process-next',
      tools: [],
      llms: [],
      tables: ['concilium_agents', 'agent_jobs'],
      storage: [],
      pages: ['frontend-agent-hub'],
      structure: ['consilium', 'team'],
      criteria: ['pulse_enabled && next_pulse_at <= now', 'within max_cost_per_day_usd budget'],
      skills: [],
      kbWrites: [],
      metricKeys: ['concilium_agents_pulsing'],
    },
    {
      id: 'agentpulse-cycle',
      label: 'Reflective LLM Cycle',
      kind: 'llm',
      lane: 'agent-pulse',
      file: 'lib/agent-handlers/pulse-handler.js',
      summary:
        'Each agent loads context, runs a focused LLM cycle, and (in full mode) self-evaluates quality.',
      narrative:
        'handlePulseCycle loads context (goal, logs, prior learnings), runs a focused cycle and optional quality evaluation on the exact Gemini 3.8 Flash platform default, records the result in `pulse_cycles` (score, tokens, cost), and advances next_pulse_at.',
      cron: null,
      api: null,
      tools: [],
      llms: [{ provider: 'gemini', model: 'gemini-3.8-flash' }],
      tables: ['pulse_cycles', 'concilium_agents', 'llm_usage', 'goal_log'],
      storage: [],
      pages: ['frontend-agent-hub'],
      structure: ['consilium'],
      criteria: ['quality score gates learning/refinement in full mode'],
      skills: [],
      kbWrites: [],
      metricKeys: ['pulse_cycles_24h', 'llm_usage_24h_cost'],
    },
    {
      id: 'agentpulse-learn',
      label: 'Save Learnings to KB',
      kind: 'store',
      lane: 'agent-pulse',
      file: 'lib/agent-handlers/pulse-handler.js',
      summary:
        'The agent summarizes what it learned and embeds it into the knowledge base for future cycles.',
      narrative:
        'An autonomous learning summary (Gemini 3.8 Flash) is embedded into `knowledge_documents` tagged ["pulse-learning", goalId]. Later cycles read these plus experience briefs. Every 10 cycles a prompt-refinement job improves the agent prompt.',
      cron: null,
      api: null,
      tools: [],
      llms: [{ provider: 'gemini', model: 'gemini-3.8-flash' }],
      tables: ['knowledge_documents', 'concilium_agents', 'notification_log'],
      storage: [],
      pages: ['frontend-knowledge-base', 'frontend-agent-hub'],
      structure: ['consilium'],
      criteria: [],
      skills: ['prompt-refinement every 10 cycles improves the agent’s system prompt'],
      kbWrites: [
        {
          table: 'knowledge_documents',
          category: 'pulse-learning',
          tags: ['pulse-learning', 'goalId'],
        },
      ],
      metricKeys: ['knowledge_documents_total', 'pulse_cycles_24h'],
    },
  ],
};

/**
 * Build the ordered edge list for a process from its steps. System Pulse and
 * Agent Pulse are two independent lanes, so edges are chained within a lane; a
 * flat process chains all steps in order.
 */
function chainEdges(map) {
  const edges = [];
  if (map.lanes && map.lanes.length) {
    for (const lane of map.lanes) {
      const laneSteps = map.steps.filter((s) => s.lane === lane.id);
      for (let i = 0; i < laneSteps.length - 1; i += 1) {
        edges.push({
          id: `${laneSteps[i].id}__${laneSteps[i + 1].id}`,
          source: laneSteps[i].id,
          target: laneSteps[i + 1].id,
        });
      }
    }
    return edges;
  }
  for (let i = 0; i < map.steps.length - 1; i += 1) {
    edges.push({
      id: `${map.steps[i].id}__${map.steps[i + 1].id}`,
      source: map.steps[i].id,
      target: map.steps[i + 1].id,
    });
  }
  return edges;
}

export const PROCESS_MAPS = {
  goal: { ...GOAL, edges: chainEdges(GOAL) },
  loop: { ...LOOP, edges: chainEdges(LOOP) },
  pulse: { ...PULSE, edges: chainEdges(PULSE) },
};

export const PROCESS_MAP_IDS = Object.keys(PROCESS_MAPS);
