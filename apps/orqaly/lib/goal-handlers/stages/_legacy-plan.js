/**
 * Legacy Plan Handler
 *
 * Preserves the original monolithic plan flow from goal-orchestrator.js
 * during the transition to the new staged pipeline.
 *
 * Once Wave 1.2 stages (feasibility, po-analysis, pm-planning) are implemented,
 * this file will be removed and the 'plan' action will route to 'feasibility-analysis'.
 */
import { generateGoalPlan } from '../goal-planner.js';
import { formTeam } from '../team-assigner.js';
import { parseLlmJson } from '../../agent-handlers/llm-executor.js';
import { executeLlmTracked } from '../../usage-handlers/tracked-llm.js';
import { createLogger } from '../../../api/_lib/logger.js';
import { listConfiguredToolIds } from '../../security/tool-credential-status.js';
import {
  logGoalEvent,
  updateGoal,
  loadGoal,
  enqueueGoalAction,
  notifyGoalEvent,
  checkBudget,
  generateId,
  CATEGORY_TOOLS,
  TOOL_INFO,
  pickTestModel,
} from '../_helpers.js';
import { ensureOwnedToolPlaceholder } from './_tool-placeholder.js';
import { resolveNativeLegacyDispatch } from '../native-legacy-dispatch.js';

const log = createLogger('goal-stage:legacy-plan');

export async function handleLegacyPlan(admin, payload, req) {
  const goal = await loadGoal(admin, payload.goalId);
  const nativeDispatch = resolveNativeLegacyDispatch(goal, 'plan');
  if (nativeDispatch.native) {
    if (!nativeDispatch.safe) {
      log.warn(req, 'goal.native-legacy-plan.blocked', {
        goalId: goal.id,
        reasons: nativeDispatch.reasons,
      });
      return {
        type: 'orchestrate-goal',
        action: 'plan',
        status: 'state_changed',
        reason: 'native_legacy_plan_blocked',
        reasons: nativeDispatch.reasons,
      };
    }
    await enqueueGoalAction(admin, 'pm-planning', goal.id);
    return {
      type: 'orchestrate-goal',
      action: 'plan',
      status: 'canonical_stage_queued',
      canonicalAction: 'pm-planning',
    };
  }
  const isComplex = goal.complexity === 'complex';
  let totalPlanCost = 0;

  // ─── Step 1: PO Refinement (complex goals) ───
  if (isComplex) {
    try {
      const poResult = await executeLlmTracked({
        prompt: [
          'Refine this goal as a Product Owner:',
          `Title: ${goal.title}`,
          goal.description ? `Description: ${goal.description}` : '',
          goal.parsed_requirements ? `Requirements: ${goal.parsed_requirements}` : '',
          `AI compute budget: $${goal.budget_usd}`,
          '',
          'PLATFORM CAPABILITIES (use these to refine the goal):',
          '- AI agent teams with specialized roles (research, content, analysis, development, design, outreach)',
          '- Consilium evaluation boards for quality review',
          '- Connected tools (APIs, webhooks, SDKs) agents can execute',
          '- Knowledge base for storing and retrieving research, plans, and reports',
          '- Workflow engine for multi-phase execution',
          '- Project management with task tracking',
          '',
          'YOUR JOB: Improve the goal clarity and requirements so agents can execute effectively.',
          'Identify the best deliverables AI agents should produce (plans, research, strategies, content, analysis, documentation, etc.).',
          'If the goal involves real-world actions (hiring, registration, etc.), reframe as planning deliverables agents CAN produce.',
          'NEVER reject — always find a way to make it actionable.',
          'Respond with JSON: { "risk_level": "low|medium|high", "feedback": "brief assessment", "refined_title": "improved title or same", "refined_requirements": "clear actionable requirements for AI agents" }',
        ]
          .filter(Boolean)
          .join('\n'),
        systemPrompt:
          'You are a Product Owner for an AI agent platform with full teams, tools, and knowledge base. Your ONLY job is to REFINE goals into clear, actionable objectives. You NEVER reject or block goals. Every goal gets improved and passed through. Reframe broad goals into specific deliverables AI agents can produce. Always output a refined_title and refined_requirements.',
        ...pickTestModel(goal),
        temperature: 0.2,
        maxTokens: 500,
        jsonMode: true,
        req,
        usage: {
          admin,
          userId: goal.user_id,
          goalId: goal.id,
          organizationId: goal.org_id,
          teamId: goal.agent_team_id || goal.team_id,
          consiliumId: goal.concilium_id,
          source: 'legacy-plan',
          operation: 'po-refinement',
          description: `PO refinement: ${goal.title}`,
        },
      });

      const poEval = parseLlmJson(poResult.content) || { risk_level: 'low' };
      totalPlanCost += poResult.estimatedCostUsd || 0;

      await logGoalEvent(
        admin,
        goal.id,
        'po_validated',
        {
          approved: true,
          risk_level: poEval.risk_level || 'low',
          feedback: poEval.feedback,
        },
        poResult.estimatedCostUsd || 0
      );

      if (poEval.refined_title && poEval.refined_title !== goal.title) {
        await updateGoal(admin, goal.id, { title: poEval.refined_title });
        goal.title = poEval.refined_title;
      }
      if (poEval.refined_requirements) {
        await updateGoal(admin, goal.id, { parsed_requirements: poEval.refined_requirements });
        goal.parsed_requirements = poEval.refined_requirements;
      }
    } catch (err) {
      log.warn(req, 'goal.po-refinement.failed', { error: err.message });
    }
  }

  // ─── Step 2: PM Planning ───
  const { strategy, phases, planCost, confidenceScore, estimatedHours } = await generateGoalPlan(
    goal.title,
    goal.description,
    Number(goal.budget_usd),
    req,
    {
      parsed_category: goal.parsed_category,
      parsed_priority: goal.parsed_priority,
      parsed_requirements: goal.parsed_requirements,
      usage: {
        admin,
        userId: goal.user_id,
        goalId: goal.id,
        organizationId: goal.org_id,
        teamId: goal.agent_team_id || goal.team_id,
        consiliumId: goal.concilium_id,
      },
    }
  );
  totalPlanCost += planCost;

  await updateGoal(admin, goal.id, {
    plan: { strategy, phases },
    confidence_score: confidenceScore,
    spent_usd: Number(goal.spent_usd || 0) + totalPlanCost,
    data: {
      ...goal.data,
      estimated_hours: estimatedHours,
      estimated_cost: totalPlanCost,
      phase_costs: {},
    },
  });

  // ─── Step 3: Form Team ───
  let teamId = goal.team_id;
  if (!teamId) {
    try {
      const { teamId: newTeamId } = await formTeam(
        admin,
        { ...goal, plan: { strategy, phases } },
        goal.user_id
      );
      if (newTeamId) {
        teamId = newTeamId;
        await updateGoal(admin, goal.id, { team_id: newTeamId });
      }
    } catch (err) {
      log.warn(req, 'goal.form-team.failed', { error: err.message });
    }
  }

  // ─── Step 4: Auto-create Project ───
  let projectId = goal.project_id;
  if (!projectId) {
    try {
      const projId = generateId('proj');
      await admin.from('projects').insert({
        id: projId,
        user_id: goal.user_id,
        name: goal.title,
        status: 'Active',
        data: {
          goal_id: goal.id,
          strategy,
          phase_count: phases.length,
          budget_usd: Number(goal.budget_usd),
        },
      });
      projectId = projId;
      await updateGoal(admin, goal.id, { project_id: projId });
    } catch (err) {
      log.warn(req, 'goal.create-project.failed', { error: err.message });
    }
  }

  // ─── Step 5: Auto-create Workflow ───
  let workflowId = goal.workflow_id;
  if (!workflowId) {
    try {
      const wfId = generateId('wf');
      const nodes = phases.map((phase, i) => ({
        id: `phase-${i}`,
        type: 'phase',
        position: { x: 200, y: 100 + i * 150 },
        data: {
          label: phase.name,
          description: phase.description,
          status: phase.status,
          jobs: phase.jobs.map((j) => j.title),
          phaseIndex: i,
          goalId: goal.id,
        },
      }));
      const edges = phases.slice(0, -1).map((_, i) => ({
        id: `edge-${i}`,
        source: `phase-${i}`,
        target: `phase-${i + 1}`,
      }));

      await admin.from('workflows').insert({
        id: wfId,
        user_id: goal.user_id,
        name: `Workflow: ${goal.title}`,
        enabled: true,
        data: { nodes, edges, goal_id: goal.id },
      });
      workflowId = wfId;
      await updateGoal(admin, goal.id, { workflow_id: wfId });

      if (projectId) {
        await admin
          .from('projects')
          .update({ workflow_id: wfId, updated_at: new Date().toISOString() })
          .eq('id', projectId);
      }
    } catch (err) {
      log.warn(req, 'goal.create-workflow.failed', { error: err.message });
    }
  }

  await logGoalEvent(
    admin,
    goal.id,
    'plan_created',
    {
      strategy,
      phaseCount: phases.length,
      jobCount: phases.reduce((sum, p) => sum + p.jobs.length, 0),
      teamId,
      projectId,
      workflowId,
      confidenceScore,
      estimatedHours,
    },
    totalPlanCost
  );

  // ─── Step 6: Check Tool Availability ───
  const jobCategories = new Set();
  for (const ph of phases) {
    for (const j of ph.jobs) jobCategories.add(j.category || 'general');
  }
  const requiredToolIds = [
    ...new Set([...jobCategories].flatMap((cat) => CATEGORY_TOOLS[cat] || CATEGORY_TOOLS.general)),
  ];

  if (requiredToolIds.length > 0) {
    let unconfiguredTools = requiredToolIds;
    try {
      const configuredIds = await listConfiguredToolIds(admin, goal.user_id, requiredToolIds);
      unconfiguredTools = requiredToolIds.filter((id) => !configuredIds.has(id));
    } catch (err) {
      log.warn(req, 'goal.tool-check.failed', { error: err.message });
    }

    if (unconfiguredTools.length > 0) {
      for (const toolId of unconfiguredTools) {
        const info = TOOL_INFO[toolId];
        if (!info) continue;
        try {
          await ensureOwnedToolPlaceholder(admin, {
            id: toolId,
            user_id: goal.user_id,
            name: info.name,
            description: info.description,
            connection_type: info.connection_type,
            status: 'inactive',
            data: info.data || {},
          });
        } catch (err) {
          log.warn(req, 'goal.tool-placeholder.failed', { toolId, error: err.message });
          throw new Error(`Unable to prepare ${toolId} for credential setup: ${err.message}`);
        }
      }

      await updateGoal(admin, goal.id, {
        status: 'awaiting_tools',
        data: {
          ...goal.data,
          estimated_hours: estimatedHours,
          estimated_cost: totalPlanCost,
          phase_costs: {},
          required_tools: requiredToolIds,
          unconfigured_tools: unconfiguredTools,
        },
      });
      await logGoalEvent(admin, goal.id, 'awaiting_tools', {
        required: requiredToolIds,
        unconfigured: unconfiguredTools,
      });
      await notifyGoalEvent(admin, goal, 'awaiting_tools', {
        feedback: `${unconfiguredTools.length} tool${unconfiguredTools.length > 1 ? 's' : ''} need API keys before execution can begin.`,
      });
      return {
        type: 'orchestrate-goal',
        action: 'plan',
        goalId: goal.id,
        status: 'awaiting_tools',
        requiredTools: requiredToolIds,
        unconfiguredTools,
      };
    }
  }

  // ─── Step 7: User Gate (manual mode) ───
  if (goal.execution_mode === 'manual') {
    await updateGoal(admin, goal.id, { status: 'paused' });
    await notifyGoalEvent(admin, goal, 'awaiting_approval', {
      strategy,
      feedback: `Plan ready: ${phases.length} phases, ~${estimatedHours}h estimated, confidence ${confidenceScore}%. Approve to start.`,
    });
    return {
      type: 'orchestrate-goal',
      action: 'plan',
      goalId: goal.id,
      status: 'awaiting_approval',
    };
  }

  // Auto mode: activate and start
  await updateGoal(admin, goal.id, { status: 'active' });
  await notifyGoalEvent(admin, goal, 'plan_created', { strategy });
  await enqueueGoalAction(admin, 'execute-phase', goal.id, { phaseIndex: 0 });

  return {
    type: 'orchestrate-goal',
    action: 'plan',
    goalId: goal.id,
    strategy,
    phases: phases.length,
    confidenceScore,
    projectId,
    workflowId,
  };
}
