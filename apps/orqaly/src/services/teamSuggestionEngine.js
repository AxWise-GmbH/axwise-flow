/**
 * Team Suggestion Engine — zero-LLM-cost, pure algorithmic analysis.
 * Analyzes agents, jobs, and teams to recommend optimal team compositions,
 * cost downgrades, restructures, and idle agent utilization.
 */

// ── Cost Tiers ───────────────────────────────────────────────────
export const MODEL_COST_TIERS = {
  'llama-3.1-8b-instant': 'budget',
  'gemma2-9b-it': 'budget',
  'deepseek-chat': 'budget',
  'glm-4-flash': 'budget',
  'gpt-4o-mini': 'budget',
  'llama-3.3-70b-versatile': 'standard',
  'deepseek-reasoner': 'standard',
  'glm-4': 'standard',
  'glm-5.1': 'premium',
  'gemini-3.8-flash': 'premium',
  'gemini-3.7-flash': 'premium',
  'gemini-3.6-flash': 'premium',
  'gpt-4o': 'premium',
  'claude-haiku-4-5': 'premium',
  'gpt-4-turbo': 'enterprise',
  'claude-sonnet-5': 'enterprise',
};

export const TIER_RANK = { budget: 0, standard: 1, premium: 2, enterprise: 3 };

export const TOKEN_COSTS = {
  'llama-3.1-8b-instant': { input: 0.00005, output: 0.0001 },
  'gemma2-9b-it': { input: 0.0002, output: 0.0002 },
  'deepseek-chat': { input: 0.00014, output: 0.00028 },
  'glm-4-flash': { input: 0.0001, output: 0.0001 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'llama-3.3-70b-versatile': { input: 0.00059, output: 0.00079 },
  'deepseek-reasoner': { input: 0.00055, output: 0.0022 },
  'glm-5.1': { input: 0.002, output: 0.002 },
  'glm-4': { input: 0.001, output: 0.001 },
  'gemini-3.8-flash': { input: 0.00075, output: 0.00375 },
  'gemini-3.7-flash': { input: 0.00075, output: 0.00375 },
  'gemini-3.6-flash': { input: 0.0015, output: 0.0075 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'claude-haiku-4-5': { input: 0.001, output: 0.005 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'claude-sonnet-5': { input: 0.003, output: 0.015 },
};

export const SIMPLE_TASK_KEYWORDS = [
  'summarize',
  'summary',
  'digest',
  'format',
  'list',
  'extract',
  'template',
  'notify',
  'log',
  'report',
  'basic',
  'simple',
];

export const SUGGESTION_TYPES = {
  NEW_TEAM: 'new_team',
  RESTRUCTURE: 'restructure',
  COST_DOWNGRADE: 'cost_downgrade',
  IDLE_AGENTS: 'idle_agents',
};

// ── Helpers ──────────────────────────────────────────────────────

/** Resolve an agent's model from capabilities array or metadata. */
export function resolveAgentModel(agent) {
  const caps = agent.capabilities || [];
  for (const cap of caps) {
    if (TOKEN_COSTS[cap]) return cap;
  }
  const meta = agent.metadata || {};
  if (meta.model && TOKEN_COSTS[meta.model]) return meta.model;
  return null;
}

/** Get cost tier for an agent. */
export function getAgentCostTier(agent) {
  const model = resolveAgentModel(agent);
  return model ? MODEL_COST_TIERS[model] || 'unknown' : 'unknown';
}

/** Get output cost per 1K tokens. */
export function getAgentOutputCostPer1K(agent) {
  const model = resolveAgentModel(agent);
  if (!model || !TOKEN_COSTS[model]) return 0;
  return TOKEN_COSTS[model].output;
}

/** Check if a job description suggests a simple task. */
export function isSimpleTask(job) {
  const text = ((job.description || '') + ' ' + (job.requirements || '')).toLowerCase();
  return SIMPLE_TASK_KEYWORDS.some((kw) => text.includes(kw));
}

/** Capability overlap between agent and job (0..1). */
export function capabilityOverlap(agent, job) {
  const agentCaps = (agent.capabilities || []).map((c) => c.toLowerCase());
  if (agentCaps.length === 0) return 0.5;
  const jobText = ((job.description || '') + ' ' + (job.requirements || '')).toLowerCase();
  const matches = agentCaps.filter((cap) => jobText.includes(cap));
  return matches.length / agentCaps.length;
}

/** Get all agent IDs assigned to any team. */
export function getAssignedAgentIds(teams) {
  const ids = new Set();
  for (const team of teams) {
    for (const ag of team.agents || []) {
      ids.add(ag.id || ag.agent_id);
    }
  }
  return ids;
}

/** Find cheapest available agent with lower cost tier. */
export function findCheaperAlternative(expensiveAgent, agents) {
  const expensiveTier = TIER_RANK[getAgentCostTier(expensiveAgent)] ?? 99;
  return (
    agents
      .filter((a) => (a.id || a.agent_id) !== (expensiveAgent.id || expensiveAgent.agent_id))
      .filter((a) => a.availability_status === 'available' || a.availability_status === 'busy')
      .filter((a) => (TIER_RANK[getAgentCostTier(a)] ?? 99) < expensiveTier)
      .sort((a, b) => getAgentOutputCostPer1K(a) - getAgentOutputCostPer1K(b))[0] || null
  );
}

/** Enrich agents with computed fields. */
export function profileAgents(agents) {
  return agents.map((a) => ({
    ...a,
    _model: resolveAgentModel(a),
    _costTier: getAgentCostTier(a),
    _outputCost: getAgentOutputCostPer1K(a),
    _isAvailable: a.availability_status === 'available',
  }));
}

/** Active jobs with no team and no assigned agent. */
export function findUnassignedJobs(jobs) {
  return jobs.filter((j) => j.status === 'active' && !j.teamId && !j.assignedAgentId);
}

/** Group jobs by category. */
export function groupJobsByCategory(jobs) {
  const map = new Map();
  for (const job of jobs) {
    const cat = job.category || 'general';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(job);
  }
  return map;
}

/** Available agents not in any team. */
export function findIdleAgents(agents, teams) {
  const assigned = getAssignedAgentIds(teams);
  return agents.filter(
    (a) => !assigned.has(a.id) && !assigned.has(a.agent_id) && a.availability_status === 'available'
  );
}

// ── Suggestion Generators ────────────────────────────────────────

function suggestNewTeams(unassignedJobs, profiledAgents, teams) {
  const suggestions = [];
  const idleAgents = findIdleAgents(profiledAgents, teams);
  if (unassignedJobs.length === 0 || idleAgents.length === 0) return suggestions;

  const grouped = groupJobsByCategory(unassignedJobs);

  for (const [category, catJobs] of grouped) {
    const scored = idleAgents
      .map((agent) => {
        const avgOverlap =
          catJobs.reduce((sum, j) => sum + capabilityOverlap(agent, j), 0) / catJobs.length;
        return { agent, score: avgOverlap };
      })
      .filter((s) => s.score > 0.1)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) continue;

    const picked = scored.slice(0, Math.min(4, Math.max(2, Math.ceil(catJobs.length / 2))));
    const estimatedCostPerDay = picked.reduce((sum, p) => sum + (p.agent._outputCost || 0) * 3, 0);

    suggestions.push({
      type: SUGGESTION_TYPES.NEW_TEAM,
      priority: catJobs.length > 3 ? 'high' : 'medium',
      teamName: `${category.charAt(0).toUpperCase() + category.slice(1)} Task Force`,
      description: `${catJobs.length} unassigned ${category} job(s) could be handled by a new team.`,
      agents: picked.map((p) => ({
        ...p.agent,
        _matchScore: Math.round(p.score * 100),
      })),
      jobs: catJobs,
      reasoning:
        `Found ${catJobs.length} active unassigned job(s) in category "${category}". ` +
        `${picked.length} idle agent(s) have matching capabilities. ` +
        `Estimated daily cost: ~$${estimatedCostPerDay.toFixed(4)}.`,
      estimatedDailyCost: estimatedCostPerDay,
    });
  }

  return suggestions;
}

function evaluateAgentDowngrade(agent, team, allAgents, jobs) {
  const tier = getAgentCostTier(agent);
  if (TIER_RANK[tier] === undefined || TIER_RANK[tier] < 2) return null;

  const teamJobs = jobs.filter((j) => j.teamId === team.id);
  if (teamJobs.length === 0) return null;

  const simpleJobs = teamJobs.filter(isSimpleTask);
  if (simpleJobs.length === 0 || simpleJobs.length / teamJobs.length < 0.5) return null;

  const cheaper = findCheaperAlternative(agent, allAgents);
  if (!cheaper) return null;

  const currentCost = getAgentOutputCostPer1K(agent);
  const cheaperCost = getAgentOutputCostPer1K(cheaper);
  const savingsPercent = currentCost > 0 ? Math.round((1 - cheaperCost / currentCost) * 100) : 0;
  const agentLabel = agent.role || agent.agent_id;
  const cheaperLabel = cheaper.role || cheaper.agent_id;

  return {
    type: SUGGESTION_TYPES.COST_DOWNGRADE,
    priority: savingsPercent > 80 ? 'high' : 'medium',
    teamId: team.id,
    teamName: team.name,
    description: `Agent "${agentLabel}" uses ${tier}-tier model for mostly simple tasks.`,
    overqualifiedAgent: agent,
    cheaperAlternative: cheaper,
    reasoning:
      `${simpleJobs.length}/${teamJobs.length} jobs in team "${team.name}" are simple tasks. ` +
      `Agent "${agentLabel}" runs on ${resolveAgentModel(agent) || 'unknown'} (${tier} tier, $${currentCost}/1K output). ` +
      `"${cheaperLabel}" runs on ${resolveAgentModel(cheaper) || 'unknown'} (${getAgentCostTier(cheaper)} tier, $${cheaperCost}/1K output). ` +
      `Potential savings: ~${savingsPercent}%.`,
    savingsPercent,
  };
}

function suggestCostDowngrades(teams, allAgents, jobs) {
  const suggestions = [];
  for (const team of teams) {
    for (const agent of team.agents || []) {
      const result = evaluateAgentDowngrade(agent, team, allAgents, jobs);
      if (result) suggestions.push(result);
    }
  }
  return suggestions;
}

function findCapabilityGaps(team, teamAgents, teamJobs, profiledAgents) {
  const coverageScores = teamJobs.map((job) => {
    const bestOverlap = Math.max(0, ...teamAgents.map((a) => capabilityOverlap(a, job)));
    return { job, bestOverlap };
  });

  const poorlyServed = coverageScores.filter((c) => c.bestOverlap < 0.2);
  if (poorlyServed.length === 0) return null;

  const assignedIds = new Set(teamAgents.map((a) => a.id || a.agent_id));
  const candidates = profiledAgents
    .filter((a) => !assignedIds.has(a.id) && !assignedIds.has(a.agent_id) && a._isAvailable)
    .map((a) => {
      const avgOverlap =
        poorlyServed.reduce((s, p) => s + capabilityOverlap(a, p.job), 0) / poorlyServed.length;
      return { agent: a, score: avgOverlap };
    })
    .filter((c) => c.score > 0.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  if (candidates.length === 0) return null;

  const additionNames = candidates
    .map((c) => '"' + (c.agent.role || c.agent.agent_id) + '"')
    .join(', ');

  return {
    type: SUGGESTION_TYPES.RESTRUCTURE,
    priority: poorlyServed.length > 2 ? 'high' : 'low',
    teamId: team.id,
    teamName: team.name,
    description: `${poorlyServed.length} job(s) in "${team.name}" have poor capability coverage.`,
    gapJobs: poorlyServed.map((p) => p.job),
    recommendedAdditions: candidates.map((c) => ({
      ...c.agent,
      _matchScore: Math.round(c.score * 100),
    })),
    reasoning:
      `${poorlyServed.length} active job(s) in team "${team.name}" score below 20% capability overlap ` +
      `with current agents. Adding ${additionNames} could improve coverage.`,
  };
}

function computeJaccard(capsA, capsB) {
  const setA = new Set(capsA.map((c) => c.toLowerCase()));
  const setB = new Set(capsB.map((c) => c.toLowerCase()));
  const intersection = [...setA].filter((c) => setB.has(c));
  const union = new Set([...setA, ...setB]);
  return union.size > 0 ? intersection.length / union.size : 0;
}

function groupAgentsByTier(teamAgents) {
  const tierGroups = new Map();
  for (const agent of teamAgents) {
    const t = getAgentCostTier(agent);
    if (t === 'unknown') continue;
    if (!tierGroups.has(t)) tierGroups.set(t, []);
    tierGroups.get(t).push(agent);
  }
  return tierGroups;
}

function buildRedundancySuggestion(team, tier, agentA, agentB) {
  const jaccard = computeJaccard(agentA.capabilities || [], agentB.capabilities || []);
  if (jaccard <= 0.7) return null;
  const pct = Math.round(jaccard * 100);
  const nameA = agentA.role || agentA.agent_id;
  const nameB = agentB.role || agentB.agent_id;
  return {
    type: SUGGESTION_TYPES.RESTRUCTURE,
    priority: 'low',
    teamId: team.id,
    teamName: team.name,
    description: `Agents "${nameA}" and "${nameB}" have ${pct}% capability overlap.`,
    redundantAgents: [agentA, agentB],
    reasoning:
      `Both agents are ${tier}-tier with ${pct}% capability overlap (Jaccard). ` +
      `Consider removing one to reduce redundancy and cost.`,
  };
}

function findRedundantPairs(team, teamAgents) {
  const results = [];
  const tierGroups = groupAgentsByTier(teamAgents);

  for (const [tier, agents] of tierGroups) {
    if (agents.length <= 1) continue;
    for (let i = 0; i < agents.length; i++) {
      for (let j = i + 1; j < agents.length; j++) {
        const suggestion = buildRedundancySuggestion(team, tier, agents[i], agents[j]);
        if (suggestion) results.push(suggestion);
      }
    }
  }
  return results;
}

function suggestRestructures(teams, profiledAgents, jobs) {
  const suggestions = [];

  for (const team of teams) {
    if (team.status !== 'active') continue;
    const teamAgents = team.agents || [];
    if (teamAgents.length === 0) continue;

    const teamJobs = jobs.filter((j) => j.teamId === team.id && j.status === 'active');
    if (teamJobs.length === 0) continue;

    const gapSuggestion = findCapabilityGaps(team, teamAgents, teamJobs, profiledAgents);
    if (gapSuggestion) suggestions.push(gapSuggestion);

    suggestions.push(...findRedundantPairs(team, teamAgents));
  }

  return suggestions;
}

function suggestForIdleAgents(agents, teams) {
  const idle = findIdleAgents(agents, teams);
  if (idle.length === 0) return [];

  return [
    {
      type: SUGGESTION_TYPES.IDLE_AGENTS,
      priority: idle.length > 3 ? 'medium' : 'low',
      description: `${idle.length} available agent(s) are not assigned to any team.`,
      agents: idle,
      reasoning:
        `These agents are marked as "available" but are not members of any team. ` +
        `They could be added to existing teams or form new ones if matching jobs exist.`,
    },
  ];
}

// ── Main Entry Point ─────────────────────────────────────────────

/**
 * Run the full suggestion engine.
 * @param {{ agents: Array, jobs: Array, teams: Array }} params
 * @returns {{ suggestions: Array, summary: Object }}
 */
export function generateTeamSuggestions({ agents, jobs, teams }) {
  if (!agents?.length || !jobs?.length) {
    return {
      suggestions: [],
      summary: {
        total: 0,
        analyzed: false,
        reason: 'Insufficient data (no agents or no jobs).',
      },
    };
  }

  const profiledAgents = profileAgents(agents);
  const unassigned = findUnassignedJobs(jobs);
  const activeTeams = (teams || []).filter((t) => t.status === 'active');

  const newTeamSuggestions = suggestNewTeams(unassigned, profiledAgents, teams || []);
  const costDowngrades = suggestCostDowngrades(activeTeams, profiledAgents, jobs);
  const restructures = suggestRestructures(activeTeams, profiledAgents, jobs);
  const idleSuggestions = suggestForIdleAgents(profiledAgents, teams || []);

  const all = [...newTeamSuggestions, ...costDowngrades, ...restructures, ...idleSuggestions];

  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
  all.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2));

  const totalEstimatedSavings = costDowngrades.reduce((sum, s) => sum + (s.savingsPercent || 0), 0);

  return {
    suggestions: all,
    summary: {
      total: all.length,
      analyzed: true,
      agentsAnalyzed: agents.length,
      jobsAnalyzed: jobs.length,
      teamsAnalyzed: activeTeams.length,
      unassignedJobs: unassigned.length,
      idleAgents: findIdleAgents(profiledAgents, teams || []).length,
      newTeamCount: newTeamSuggestions.length,
      costDowngradeCount: costDowngrades.length,
      restructureCount: restructures.length,
      avgSavingsPercent:
        costDowngrades.length > 0 ? Math.round(totalEstimatedSavings / costDowngrades.length) : 0,
    },
  };
}
