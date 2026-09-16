/**
 * Stage 1: PO Analysis
 *
 * A domain-neutral problem owner analyzes the goal and produces an operational brief.
 * Three depth modes based on goal.po_depth:
 *   - quick:    fast summary via Groq, reuses feasibility data
 *   - standard: full PRD via Claude (default)
 *   - expert:   two-step — generates questions, pauses, then full PRD with answers
 *
 * Output: tech_doc JSONB stored on goal + Knowledge Base.
 * Next: customer-intelligence
 */
import { executeLlm, parseLlmJson } from '../../agent-handlers/llm-executor.js';
import { createLogger } from '../../../api/_lib/logger.js';
import { orgScopeFromGoal } from '../../_shared/kb-scope.js';
import { formatGoalEvidenceForPrompt } from '../goal-evidence.js';
import { guardNativeLegacyStageEntry } from '../native-legacy-stage-entry.js';
import {
  logGoalEvent,
  updateGoal,
  loadGoal,
  enqueueGoalAction,
  recordStageLlmUsage,
  findAgentByRole,
  trackAgentWork,
  pickTestModel,
} from '../_helpers.js';

const log = createLogger('goal-stage:po-analysis');
const INITIAL_ELIGIBLE_GOAL_STATUSES = new Set(['feasibility', 'analyzing']);
const CONTINUE_ELIGIBLE_GOAL_STATUSES = new Set(['analyzing']);

const FALLBACK_PO_PROMPT =
  'You are a domain-neutral Problem and Outcome Analyst for an AI operations platform. Analyze the goal in its actual domain: operations, research, sales, legal, healthcare, finance, HR, content, software, or another field. Do not assume software development. Produce a clear operational brief with measurable outcomes and acceptance tests. Be practical and specific.';

function stageNotEligible(goal, action) {
  return {
    type: 'orchestrate-goal',
    action,
    goalId: goal.id,
    status: 'stage_not_eligible',
    goalStatus: goal.status,
  };
}

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

function buildGoalContext(goal) {
  const feasibility = goal.feasibility_report || {};
  const lines = [
    `Title: ${goal.title}`,
    goal.description ? `Description: ${goal.description}` : '',
    goal.parsed_requirements ? `Requirements: ${goal.parsed_requirements}` : '',
    `Budget: $${goal.budget_usd}`,
    feasibility.recommendation_reason
      ? `Feasibility note: ${feasibility.recommendation_reason}`
      : '',
    goal.data?.context_revision_feedback
      ? `Human context-review feedback: ${goal.data.context_revision_feedback}`
      : '',
    goal.data?.last_revision_feedback
      ? `Human execution-proposal feedback: ${goal.data.last_revision_feedback}`
      : '',
    formatGoalEvidenceForPrompt(goal),
  ];
  return lines.filter(Boolean).join('\n');
}

// Hard-fail the goal when the PO LLM returns unparseable output. Running
// downstream stages on a stub tech-doc hides the real failure (bad prompt
// response, rate limit, timeout, wrong model format) and produces hollow
// deliverables that max_iterations can't recover from. Used to fall back
// to a minimalTechDoc() — now removed; failing loudly beats succeeding
// quietly with garbage.
async function failOnPoParseError(admin, goal, depth, result, req) {
  const raw = String(result?.content || '').slice(0, 500);
  const reason = `PO analysis (${depth}) LLM returned unparseable output. Provider: ${result?.provider || 'unknown'}. Raw content (first 500 chars): ${raw || '(empty)'}`;
  await updateGoal(admin, goal.id, {
    status: 'failed',
    data: {
      ...(goal.data || {}),
      failure_reason: reason,
      failed_at: new Date().toISOString(),
      failure_stage: `po-analysis:${depth}`,
    },
  });
  await logGoalEvent(admin, goal.id, 'goal_failed', { reason, stage: `po-analysis:${depth}` });
  log.warn(req, 'po-analysis.parse.fail-fast', { goalId: goal.id, depth });
  return {
    type: 'orchestrate-goal',
    action: 'po-analysis',
    goalId: goal.id,
    status: 'failed_parse',
  };
}

function ensureAcceptanceTests(techDoc) {
  if (!techDoc.acceptance_tests || techDoc.acceptance_tests.length === 0) {
    techDoc.acceptance_tests = [
      { phase: 0, test: 'Phase deliverables meet requirements', type: 'binary' },
    ];
  }
}

async function persistTechDoc(admin, goal, techDoc, costUsd) {
  await updateGoal(admin, goal.id, {
    tech_doc: techDoc,
    spent_usd: Number(goal.spent_usd || 0) + costUsd,
  });
}

async function saveKbMarkdown(admin, goal, techDoc, req) {
  try {
    const md = buildKbMarkdown(goal, techDoc);
    await admin.from('knowledge_documents').insert({
      user_id: goal.user_id,
      title: `PO Analysis: ${goal.title}`,
      content: md,
      source: 'goal-orchestrator',
      category: 'goal-plan',
      owner_type: 'user',
      owner_id: goal.user_id,
      content_type: 'note',
      tags: ['goal', 'po-analysis', techDoc.depth],
      metadata: { goal_id: goal.id },
      ...orgScopeFromGoal(goal),
    });
  } catch (err) {
    log.warn(req, 'po-analysis.kb.failed', { error: err.message });
  }
}

/** Append a bullet-list section to the markdown lines array if items exist. */
function mdBulletSection(m, heading, items, formatter) {
  if (!items?.length) return;
  m.push(`## ${heading}`);
  items.forEach((item, i) => m.push(formatter ? formatter(item, i) : `- ${item}`));
  m.push('');
}

/** Append a simple heading + body section if the value is truthy. */
function mdTextSection(m, heading, value) {
  if (!value) return;
  m.push(`## ${heading}`, value, '');
}

function buildKbMarkdown(goal, td) {
  const m = [`# Business Requirements: ${goal.title}`, ''];

  m.push('## Problem Statement', td.problem_statement || goal.title, '');

  mdTextSection(m, 'Target Audience', td.target_audience);

  mdBulletSection(m, 'Success Criteria', td.success_criteria, (c, i) => `${i + 1}. ${c}`);

  mdBulletSection(
    m,
    'Acceptance Tests',
    td.acceptance_tests,
    (t) => `- Phase ${(t.phase || 0) + 1}: ${t.test} *(${t.type || 'binary'})*`
  );

  mdBulletSection(m, 'Out of Scope', td.out_of_scope);

  mdBulletSection(
    m,
    'Functional Requirements (MoSCoW)',
    td.functional_requirements,
    (fr) => `- **[${(fr.priority || 'should').toUpperCase()}]** ${fr.requirement}`
  );

  if (td.success_tiers) {
    m.push(
      '## Success Tiers',
      `- **Minimum:** ${td.success_tiers.minimum}`,
      `- **Target:** ${td.success_tiers.target}`,
      `- **Stretch:** ${td.success_tiers.stretch}`,
      ''
    );
  }

  mdBulletSection(m, 'Exit Criteria', td.exit_criteria);
  mdBulletSection(m, 'Constraints', td.constraints);

  mdBulletSection(m, 'Risks', td.risks, (r) => {
    if (typeof r === 'string') return `- ${r}`;
    return `- **${r.severity || 'medium'}**: ${r.risk || r.description || r} → ${r.mitigation || 'TBD'}`;
  });

  mdBulletSection(m, 'Dependencies', td.dependencies);

  if (td.required_capabilities?.length)
    m.push('## Required Roles', td.required_capabilities.join(', '), '');
  if (td.tool_requirements?.length)
    m.push('## Required Tools', td.tool_requirements.join(', '), '');
  mdTextSection(m, 'Recommended Approach', td.recommended_approach);

  if (td.phase_suggestions?.length) {
    m.push('## Phase Suggestions');
    td.phase_suggestions.forEach((p, i) => {
      m.push(`### Phase ${i + 1}: ${p.name}`);
      if (p.deliverables?.length) p.deliverables.forEach((d) => m.push(`- ${d}`));
      if (p.quality_metrics?.length) {
        m.push('**Quality Metrics:**');
        p.quality_metrics.forEach((q) => m.push(`- ${q}`));
      }
      m.push('');
    });
  }

  if (td.estimated_complexity_per_area) {
    m.push('## Estimated Complexity');
    Object.entries(td.estimated_complexity_per_area).forEach(([area, level]) =>
      m.push(`- **${area}:** ${level}`)
    );
    m.push('');
  }

  // Expert-mode extra sections
  mdBulletSection(m, 'User Stories', td.user_stories);
  mdBulletSection(m, 'Non-Functional Requirements', td.non_functional_requirements);

  mdBulletSection(
    m,
    'Timeline',
    td.timeline,
    (t) => `- **${t.milestone}** (${t.target_date || 'TBD'}): ${t.description}`
  );

  mdTextSection(m, 'Revenue Model', td.revenue_model);

  mdBulletSection(
    m,
    'Stakeholders',
    td.stakeholders,
    (s) => `- **${s.role}:** ${s.responsibility}`
  );

  mdTextSection(m, 'Competitive Landscape', td.competitive_landscape);

  return m.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Quick mode                                                         */
/* ------------------------------------------------------------------ */

async function handleQuick(admin, goal, req, poPrompt, poAgent) {
  const feasibility = goal.feasibility_report || {};

  const result = await executeLlm({
    prompt: [
      'As the Problem and Outcome Analyst, produce a concise SUMMARY analysis for this goal.',
      '',
      buildGoalContext(goal),
      '',
      'Generate these fields:',
      '- problem_statement: one sentence',
      '- target_audience: the person, team, organisation, buyer, user, or beneficiary explicitly named or directly identifiable from the request; use null when identifying one would require an unsupported assumption',
      '- success_criteria: 2-3 measurable outcomes (array of strings)',
      '- acceptance_tests: at least one per phase, binary pass/fail (array of { "phase": index, "test": "...", "type": "binary" })',
      '- required_capabilities: domain-appropriate roles needed (array of strings; do not assume developers)',
      '- tool_requirements: tools needed (array: "web-search", "email", "github", "canva", "browser")',
      '',
      'CRITICAL: acceptance_tests must be present.',
      '',
      'Respond with JSON: { "problem_statement": "...", "target_audience": "..." or null, "success_criteria": [...], "acceptance_tests": [{ "phase": 0, "test": "...", "type": "binary" }], "required_capabilities": [...], "tool_requirements": [...] }',
    ].join('\n'),
    systemPrompt: `${poPrompt}\n\nTASK: Produce a quick summary analysis. Be practical and specific. Extract the target audience when the request identifies it, but return null instead of inventing one. Always include acceptance tests.`,
    ...pickTestModel(goal),
    temperature: 0.2,
    maxTokens: 800,
    jsonMode: true,
    userId: goal.user_id,
    req,
  });

  let techDoc = parseLlmJson(result.content);
  if (!techDoc) return failOnPoParseError(admin, goal, 'quick', result, req);

  techDoc.depth = 'quick';

  // Reuse feasibility data when available
  if (feasibility.risk_factors && !techDoc.risks) {
    techDoc.risks = feasibility.risk_factors;
  }
  if (feasibility.competitive_analysis && !techDoc.competitive_landscape) {
    techDoc.competitive_landscape = feasibility.competitive_analysis;
  }

  ensureAcceptanceTests(techDoc);

  const costUsd = result.estimatedCostUsd || 0;
  await persistTechDoc(admin, goal, techDoc, costUsd);
  await saveKbMarkdown(admin, goal, techDoc, req);

  await logGoalEvent(
    admin,
    goal.id,
    'po_validated',
    {
      depth: techDoc.depth,
      agent_id: poAgent?.id,
      agent_role: 'Product Owner',
      acceptance_tests_count: techDoc.acceptance_tests.length,
      capabilities: techDoc.required_capabilities,
      tools: techDoc.tool_requirements,
    },
    costUsd
  );
  await recordStageLlmUsage(admin, goal, result, {
    source: 'po-analysis',
    description: `PO analysis (quick): ${goal.title}`,
    phaseIndex: -1,
  });
  if (poAgent)
    await trackAgentWork(admin, {
      agentId: poAgent.id,
      agentName: poAgent.role,
      userId: goal.user_id,
      goalId: goal.id,
      taskTitle: `PO Analysis: ${goal.title}`,
      taskType: 'po-analysis',
      costUsd,
    });

  await enqueueGoalAction(admin, 'customer-intelligence', goal.id);
  return { type: 'orchestrate-goal', action: 'po-analysis', goalId: goal.id, depth: 'quick' };
}

/* ------------------------------------------------------------------ */
/*  Standard mode (default)                                            */
/* ------------------------------------------------------------------ */

async function handleStandard(admin, goal, req, poPrompt, poAgent) {
  const result = await executeLlm({
    prompt: [
      'As the Problem and Outcome Analyst, produce a FULL operational goal brief.',
      '',
      buildGoalContext(goal),
      '',
      'Produce a complete operational brief with ALL of these fields:',
      '- problem_statement: clear description of the problem/opportunity',
      '- target_audience: who benefits from this',
      '- success_criteria: measurable outcomes (array of strings)',
      '- acceptance_tests: MANDATORY — at least one per phase, binary pass/fail test (array of { "phase": index, "test": "description", "type": "binary" })',
      '- constraints: budget, time, tool limitations (array of strings)',
      '- risks: array of { "risk": "...", "mitigation": "...", "severity": "low|medium|high" }',
      '- dependencies: external services or data needed (array of strings)',
      '- recommended_approach: high-level strategy (string)',
      '- required_capabilities: domain-appropriate roles needed (array of strings; do not assume developers)',
      '- tool_requirements: tools needed (array: "web-search", "email", "github", "canva", "browser")',
      '- phase_suggestions: array of { "name": "...", "deliverables": [...], "quality_metrics": [...] }',
      '- estimated_complexity_per_area: { "research": "low|medium|high", ... }',
      '- out_of_scope: array of strings — what is NOT included in this goal',
      '- functional_requirements: array of { "requirement": "...", "priority": "must|should|could|wont" } (MoSCoW prioritization)',
      '- success_tiers: { "minimum": "...", "target": "...", "stretch": "..." }',
      '- exit_criteria: array of strings — when to stop working on this goal',
      '',
      'CRITICAL: acceptance_tests must be present. Every phase needs at least one testable pass/fail criterion.',
      '',
      'Respond with valid JSON containing ALL fields listed above.',
    ].join('\n'),
    systemPrompt: `${poPrompt}\n\nTASK: Analyze this goal into a clear, actionable operational brief for its actual domain. Never default to software development. Always include acceptance tests — these are the Definition of Done for each phase. Be practical and specific.`,
    ...pickTestModel(goal),
    temperature: 0.2,
    maxTokens: 2500,
    jsonMode: true,
    userId: goal.user_id,
    req,
  });

  let techDoc = parseLlmJson(result.content);
  if (!techDoc) return failOnPoParseError(admin, goal, 'standard', result, req);

  techDoc.depth = 'standard';
  ensureAcceptanceTests(techDoc);

  const costUsd = result.estimatedCostUsd || 0;
  await persistTechDoc(admin, goal, techDoc, costUsd);
  await saveKbMarkdown(admin, goal, techDoc, req);

  await logGoalEvent(
    admin,
    goal.id,
    'po_validated',
    {
      depth: techDoc.depth,
      agent_id: poAgent?.id,
      agent_role: 'Product Owner',
      acceptance_tests_count: techDoc.acceptance_tests.length,
      capabilities: techDoc.required_capabilities,
      tools: techDoc.tool_requirements,
    },
    costUsd
  );
  await recordStageLlmUsage(admin, goal, result, {
    source: 'po-analysis',
    description: `PO analysis (standard): ${goal.title}`,
    phaseIndex: -1,
  });
  if (poAgent)
    await trackAgentWork(admin, {
      agentId: poAgent.id,
      agentName: poAgent.role,
      userId: goal.user_id,
      goalId: goal.id,
      taskTitle: `PO Analysis: ${goal.title}`,
      taskType: 'po-analysis',
      costUsd,
    });

  await enqueueGoalAction(admin, 'customer-intelligence', goal.id);
  return { type: 'orchestrate-goal', action: 'po-analysis', goalId: goal.id, depth: 'standard' };
}

/* ------------------------------------------------------------------ */
/*  Expert mode — Step 1: generate questions                           */
/* ------------------------------------------------------------------ */

async function handleExpertStep1(admin, goal, req, poPrompt, _poAgent) {
  const feasibility = goal.feasibility_report || {};

  const result = await executeLlm({
    prompt: [
      buildGoalContext(goal),
      feasibility.recommendation_reason
        ? `Feasibility analysis: ${feasibility.recommendation_reason}`
        : '',
      feasibility.risk_factors ? `Known risks: ${JSON.stringify(feasibility.risk_factors)}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
    systemPrompt: `${poPrompt}\n\nTASK: Based on this goal, generate 3-5 critical questions needed before writing an operational brief. Questions should uncover: affected stakeholder or customer, the real problem, desired outcome, constraints, evidence, timeline, and success definition. Do not assume a commercial product or software project. Reply with JSON: { "questions": ["question1", "question2", ...] }`,
    ...pickTestModel(goal),
    temperature: 0.3,
    maxTokens: 500,
    jsonMode: true,
    userId: goal.user_id,
    req,
  });

  let parsed = parseLlmJson(result.content);
  const questions = parsed?.questions || [
    'Who is the primary target audience for this goal?',
    'What does success look like in measurable terms?',
    'What is the desired timeline for completion?',
  ];

  const costUsd = result.estimatedCostUsd || 0;

  // Save questions onto goal.data
  const existingData = goal.data || {};
  await updateGoal(admin, goal.id, {
    status: 'awaiting_po_input',
    data: { ...existingData, po_questions: questions },
    spent_usd: Number(goal.spent_usd || 0) + costUsd,
  });

  await logGoalEvent(
    admin,
    goal.id,
    'po_questions_generated',
    {
      question_count: questions.length,
      questions,
    },
    costUsd
  );
  await recordStageLlmUsage(admin, goal, result, {
    source: 'po-analysis',
    description: `PO questions (expert): ${goal.title}`,
    phaseIndex: -1,
  });

  // Do NOT enqueue next action — pipeline pauses for user input
  return {
    type: 'orchestrate-goal',
    action: 'po-analysis',
    goalId: goal.id,
    depth: 'expert',
    step: 'questions',
    status: 'awaiting_po_input',
  };
}

/* ------------------------------------------------------------------ */
/*  Expert mode — Step 2: full PRD with answers                        */
/* ------------------------------------------------------------------ */

async function handleExpertStep2(admin, goal, req, poPrompt, poAgent) {
  const data = goal.data || {};
  const questions = data.po_questions || [];
  const answers = data.po_answers || [];

  // Build Q&A block for the prompt
  const qaBlock = questions
    .map((question, index) => {
      const entry = answers[index];
      const answer = entry && typeof entry === 'object' ? entry.answer : entry;
      return `Q${index + 1}: ${question}\nA${index + 1}: ${answer || 'Not provided'}`;
    })
    .join('\n\n');

  const result = await executeLlm({
    prompt: [
      'As the Problem and Outcome Analyst, produce a comprehensive operational goal brief.',
      '',
      buildGoalContext(goal),
      '',
      'The product owner asked these questions and received these answers:',
      qaBlock,
      '',
      'Using the answers above, produce a comprehensive operational brief with ALL of these fields:',
      '- problem_statement: clear description of the problem/opportunity',
      '- target_audience: who benefits from this',
      '- success_criteria: measurable outcomes (array of strings)',
      '- acceptance_tests: MANDATORY — at least one per phase, binary pass/fail test (array of { "phase": index, "test": "description", "type": "binary" })',
      '- constraints: budget, time, tool limitations (array of strings)',
      '- risks: array of { "risk": "...", "mitigation": "...", "severity": "low|medium|high" }',
      '- dependencies: external services or data needed (array of strings)',
      '- recommended_approach: high-level strategy (string)',
      '- required_capabilities: roles needed (array)',
      '- tool_requirements: tools needed (array)',
      '- phase_suggestions: array of { "name": "...", "deliverables": [...], "quality_metrics": [...] }',
      '- estimated_complexity_per_area: { "research": "low|medium|high", ... }',
      '- out_of_scope: array of strings — what is NOT included',
      '- functional_requirements: array of { "requirement": "...", "priority": "must|should|could|wont" } (MoSCoW)',
      '- success_tiers: { "minimum": "...", "target": "...", "stretch": "..." }',
      '- exit_criteria: array of strings — when to stop working',
      '- user_stories: array of strings in "As a [user], I want [X] so that [Y]" format',
      '- non_functional_requirements: array of strings (performance, security, scalability, etc.)',
      '- timeline: array of { "milestone": "...", "target_date": "...", "description": "..." }',
      '- revenue_model: string describing how this generates/saves revenue',
      '- stakeholders: array of { "role": "...", "responsibility": "..." }',
      '- competitive_landscape: string summarizing competitive positioning',
      '',
      'CRITICAL: acceptance_tests must be present. Every phase needs at least one testable pass/fail criterion.',
      '',
      'Respond with valid JSON containing ALL fields listed above.',
    ].join('\n'),
    systemPrompt: `${poPrompt}\n\nTASK: Produce a comprehensive, expert-level operational brief in the goal's actual domain. Leverage the user's answers to tailor every section. Do not assume software development. Be practical, thorough, and specific. Always include acceptance tests.`,
    ...pickTestModel(goal),
    temperature: 0.2,
    maxTokens: 2500,
    jsonMode: true,
    userId: goal.user_id,
    req,
  });

  let techDoc = parseLlmJson(result.content);
  if (!techDoc) return failOnPoParseError(admin, goal, 'expert', result, req);

  techDoc.depth = 'expert';
  ensureAcceptanceTests(techDoc);

  const costUsd = result.estimatedCostUsd || 0;
  await persistTechDoc(admin, goal, techDoc, costUsd);
  await saveKbMarkdown(admin, goal, techDoc, req);

  await logGoalEvent(
    admin,
    goal.id,
    'po_validated',
    {
      depth: techDoc.depth,
      agent_id: poAgent?.id,
      agent_role: 'Product Owner',
      acceptance_tests_count: techDoc.acceptance_tests.length,
      capabilities: techDoc.required_capabilities,
      tools: techDoc.tool_requirements,
      expert_questions_count: questions.length,
    },
    costUsd
  );
  await recordStageLlmUsage(admin, goal, result, {
    source: 'po-analysis',
    description: `PO analysis (expert): ${goal.title}`,
    phaseIndex: -1,
  });
  if (poAgent)
    await trackAgentWork(admin, {
      agentId: poAgent.id,
      agentName: poAgent.role,
      userId: goal.user_id,
      goalId: goal.id,
      taskTitle: `PO Analysis: ${goal.title}`,
      taskType: 'po-analysis',
      costUsd,
    });

  // Continue pipeline normally
  await enqueueGoalAction(admin, 'customer-intelligence', goal.id);
  return {
    type: 'orchestrate-goal',
    action: 'po-analysis',
    goalId: goal.id,
    depth: 'expert',
    step: 'prd',
  };
}

/* ------------------------------------------------------------------ */
/*  Main entry point                                                   */
/* ------------------------------------------------------------------ */

export async function handle(admin, payload, req) {
  const goal = await loadGoal(admin, payload.goalId);
  const nativeRedirect = await guardNativeLegacyStageEntry(admin, goal, 'po-analysis');
  if (nativeRedirect) return nativeRedirect;
  if (!INITIAL_ELIGIBLE_GOAL_STATUSES.has(goal.status)) {
    return stageNotEligible(goal, 'po-analysis');
  }
  await updateGoal(admin, goal.id, { status: 'analyzing' });

  // Look up the user's Product Manager agent for system prompt
  const poAgent = await findAgentByRole(admin, goal.user_id, 'Product Owner');
  const poPrompt = poAgent?.system_prompt || FALLBACK_PO_PROMPT;
  if (poAgent) {
    log.info(req, 'po-analysis.using-agent', { agentId: poAgent.id, role: poAgent.role });
  }

  const depth = goal.po_depth || 'standard';

  switch (depth) {
    case 'quick':
      return handleQuick(admin, goal, req, poPrompt, poAgent);

    case 'expert': {
      if (goal.data?.po_answers) {
        return handleExpertStep2(admin, goal, req, poPrompt, poAgent);
      }
      return handleExpertStep1(admin, goal, req, poPrompt, poAgent);
    }

    case 'standard':
    default:
      return handleStandard(admin, goal, req, poPrompt, poAgent);
  }
}

/* ------------------------------------------------------------------ */
/*  Expert step 2 — called via action 'po-analysis-continue'           */
/* ------------------------------------------------------------------ */

export async function handleContinue(admin, payload, req) {
  const goal = await loadGoal(admin, payload.goalId);
  const nativeRedirect = await guardNativeLegacyStageEntry(admin, goal, 'po-analysis-continue');
  if (nativeRedirect) return nativeRedirect;
  if (!CONTINUE_ELIGIBLE_GOAL_STATUSES.has(goal.status)) {
    return stageNotEligible(goal, 'po-analysis-continue');
  }
  await updateGoal(admin, goal.id, { status: 'analyzing' });

  const poAgent = await findAgentByRole(admin, goal.user_id, 'Product Owner');
  const poPrompt = poAgent?.system_prompt || FALLBACK_PO_PROMPT;
  return handleExpertStep2(admin, goal, req, poPrompt, poAgent);
}
