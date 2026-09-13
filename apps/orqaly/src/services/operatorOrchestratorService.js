import { partnerService } from './partnerService';
import { createProject, getAllProjects, updateProject } from './projectService';
import { getAllWorkflows, updateWorkflow } from './workflowService';
import { loadAuditLogs, logAction } from './auditLogBackend';

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export const AI_OPERATOR_MODES = {
  traffic: 'Traffic Optimization Mode',
  partner: 'Partner Strategy Mode',
  project: 'Project Management Mode',
  infrastructure: 'Infrastructure Integrity Mode',
  executive: 'Executive Insight Mode',
};

const MODE_BY_RISK = {
  high: AI_OPERATOR_MODES.infrastructure,
  medium: AI_OPERATOR_MODES.project,
  low: AI_OPERATOR_MODES.executive,
};

function buildMode({ workflowIssues, projectIssues, partnerIssues, preferredMode }) {
  if (preferredMode && Object.values(AI_OPERATOR_MODES).includes(preferredMode))
    return preferredMode;
  if (workflowIssues >= projectIssues && workflowIssues >= partnerIssues)
    return AI_OPERATOR_MODES.infrastructure;
  if (projectIssues >= partnerIssues) return AI_OPERATOR_MODES.project;
  return AI_OPERATOR_MODES.partner;
}

function buildGraphHasCycle(nodes = [], edges = []) {
  const ids = new Set((nodes || []).map((n) => n?.id).filter(Boolean));
  const graph = new Map();
  ids.forEach((id) => graph.set(id, []));
  for (const edge of edges || []) {
    const s = edge?.source;
    const t = edge?.target;
    if (!s || !t || !graph.has(s) || !graph.has(t)) continue;
    graph.get(s).push(t);
  }
  const visiting = new Set();
  const visited = new Set();
  const dfs = (node) => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const next of graph.get(node) || []) {
      if (dfs(next)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  for (const node of graph.keys()) {
    if (dfs(node)) return true;
  }
  return false;
}

function buildAutoTask({ fingerprint, title, description, entityRef, priority = 'high' }) {
  const now = Date.now();
  return {
    id: `T-AUTO-${now}-${Math.random().toString(36).slice(2, 7)}`,
    taskId: `T-AUTO-${now}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    status: 'todo',
    priority,
    assignedTo: 'AI Operator',
    estimate: '',
    description: `${description}\n\n[AUTO:${fingerprint}]${entityRef ? `\nRef: ${entityRef}` : ''}`,
    deadline: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  };
}

function hasAutoTask(tasks, fingerprint) {
  const marker = `[AUTO:${fingerprint}]`;
  return (tasks || []).some((t) => String(t?.description || '').includes(marker));
}

function summarizeAuditAnomalies(logs = []) {
  const recent = logs.slice(0, 120);
  const highRisk = recent.filter((l) => {
    const tags = l?.detailsStructured?.tags || [];
    return tags.includes('security') || tags.includes('delete') || tags.includes('rollback');
  });
  const suspiciousVolume =
    recent.length >= 20 &&
    recent.slice(0, 20).every((l) => {
      const ts = Date.parse(l.timestamp || '');
      return Number.isFinite(ts) && Date.now() - ts <= 20 * 60 * 1000;
    });
  const topEntities = recent.reduce((acc, item) => {
    const key = item.entity || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  return {
    suspiciousVolume,
    highRiskCount: highRisk.length,
    highRiskEntities: [...new Set(highRisk.map((l) => l.entity).filter(Boolean))],
    topEntities,
  };
}

function selectRoutingSuggestion(partners = []) {
  if (!partners.length) return null;
  const ranked = partners
    .map((p) => ({
      id: p.id,
      name: p.name,
      roi: Number(p.roi || 0),
      crAvg: Number(p.crAvg || 0),
      clicksTotal: Number(p.clicksTotal || 0),
      ftdTotal: Number(p.ftdTotal || 0),
    }))
    .sort((a, b) => b.roi + b.crAvg - (a.roi + a.crAvg));
  const best = ranked[0];
  const weakest = ranked[ranked.length - 1];
  if (!best || !weakest || best.id === weakest.id) return null;
  return {
    fromPartnerId: weakest.id,
    fromPartner: weakest.name,
    toPartnerId: best.id,
    toPartner: best.name,
    reason: `${best.name} outperforms ${weakest.name} (ROI ${best.roi.toFixed(1)} vs ${weakest.roi.toFixed(1)}, CR ${best.crAvg.toFixed(2)} vs ${weakest.crAvg.toFixed(2)}).`,
  };
}

export async function runPredictiveAnalysis() {
  const [partners, projects, workflows] = await Promise.all([
    partnerService.getAll(),
    getAllProjects(),
    getAllWorkflows(),
  ]);
  const partnerCount = partners.length || 1;
  const workflowLoad =
    projects.filter((p) => p.status === 'Active').length / (workflows.length || 1);
  const underperformingPartners = partners
    .filter((p) => Number(p.roi || 0) < 0 || Number(p.crAvg || 0) < 0.8)
    .map((p) => ({ id: p.id, name: p.name, roi: Number(p.roi || 0), crAvg: Number(p.crAvg || 0) }));
  const overloadedWorkflows = workflows
    .map((w) => ({
      id: w.id,
      name: w.name,
      activeProjects: projects.filter((p) => p.workflowId === w.id && p.status === 'Active').length,
      enabled: w.enabled !== false,
    }))
    .filter(
      (w) =>
        w.activeProjects >= Math.max(3, Math.ceil(projects.length / Math.max(1, workflows.length)))
    );
  const riskLevel =
    overloadedWorkflows.length > 0 ||
    underperformingPartners.length > Math.max(2, Math.floor(partnerCount * 0.3))
      ? 'high'
      : workflowLoad > 1.5 || underperformingPartners.length > 0
        ? 'medium'
        : 'low';
  return {
    riskLevel,
    mode: MODE_BY_RISK[riskLevel],
    forecast: {
      workflowLoad,
      overloadedWorkflows,
      underperformingPartners,
      routingSuggestion: selectRoutingSuggestion(partners),
    },
    recommendations: [
      ...(overloadedWorkflows.length
        ? ['Redistribute active projects from overloaded workflows.']
        : []),
      ...(underperformingPartners.length
        ? ['Rebalance traffic away from underperforming partners and trigger optimization tasks.']
        : []),
      ...(workflowLoad < 1.5 && underperformingPartners.length === 0
        ? ['Current distribution is stable; continue monitoring trend deltas daily.']
        : []),
    ],
  };
}

export function buildExecutionPlanFromIntent({ transcript = '', actions = [] } = {}) {
  const text = normalizeText(transcript);
  const affectedModules = new Set();
  const risky = [];
  const executableOps = [];

  for (const action of actions) {
    const type = action?.type;
    if (type === 'create_project') {
      affectedModules.add('Projects');
      affectedModules.add('Workflow');
      executableOps.push('Create project and attach workflow');
    } else if (type === 'optimize_partner_routing') {
      affectedModules.add('Partners');
      affectedModules.add('Workflow');
      affectedModules.add('Dashboard');
      executableOps.push('Compute routing optimization plan');
    } else if (type === 'fix_broken_workflows') {
      affectedModules.add('Workflow');
      affectedModules.add('Task Manager');
      executableOps.push('Repair broken workflow links');
    } else if (type === 'switch_ai_mode') {
      affectedModules.add('Dashboard');
      affectedModules.add('Settings');
      executableOps.push(`Switch to ${action.mode || AI_OPERATOR_MODES.executive}`);
    } else if (type === 'ai_operator_cycle') {
      affectedModules.add('Dashboard');
      affectedModules.add('Projects');
      affectedModules.add('Partners');
      affectedModules.add('Workflow');
      affectedModules.add('Task Manager');
      affectedModules.add('Activity Log');
      executableOps.push('Run full autonomous operator cycle');
    } else if (type === 'toggle_continuous_optimization') {
      affectedModules.add('Dashboard');
      affectedModules.add('Activity Log');
      affectedModules.add('Settings');
      executableOps.push('Toggle continuous optimization mode');
    }
    if (action?.requiresConfirmation) risky.push(action.label || action.type);
  }

  if (/\bsettings|permission|access|delete|remove|disable\b/i.test(text)) {
    affectedModules.add('Settings');
    risky.push('Potentially sensitive settings mutation');
  }

  return {
    objective: transcript || 'Voice command objective',
    affectedModules: [...affectedModules],
    executableOps,
    riskLevel: risky.length > 0 ? 'high' : executableOps.length > 0 ? 'medium' : 'low',
    confirmationsRequired: [...new Set(risky)],
  };
}

async function safeWorkflowRepair(workflows = []) {
  const fixes = [];
  for (const wf of workflows) {
    const nodes = Array.isArray(wf.nodes) ? wf.nodes : [];
    const edges = Array.isArray(wf.edges) ? wf.edges : [];
    if (!nodes.length) {
      const defaultNodeId = `node-${Date.now()}`;
      await updateWorkflow(wf.id, {
        nodes: [
          {
            id: defaultNodeId,
            type: 'entry',
            data: { label: 'Recovered Entry Node' },
            position: { x: 80, y: 80 },
          },
        ],
        edges: [],
      });
      fixes.push(`Recovered workflow "${wf.name}" with a safe entry node.`);
      continue;
    }
    const isCyclic =
      edges.some((e) => e?.source && e?.target && e.source === e.target) ||
      buildGraphHasCycle(nodes, edges);
    if (isCyclic) {
      const filtered = edges.filter((e) => !(e?.source && e?.target && e.source === e.target));
      await updateWorkflow(wf.id, { edges: filtered });
      fixes.push(`Removed obvious circular self-loops from "${wf.name}".`);
    }
  }
  return fixes;
}

export async function executeAutonomousObjective({
  objective = '',
  actions = [],
  autoFix = true,
  preferredMode = '',
  trigger = 'voice-autonomous-objective',
} = {}) {
  const plan = buildExecutionPlanFromIntent({ transcript: objective, actions });
  const [partners, projects, workflows] = await Promise.all([
    partnerService.getAll(),
    getAllProjects(),
    getAllWorkflows(),
  ]);
  const outcomes = [];
  const warnings = [];

  for (const action of actions) {
    if (action.type === 'create_project') {
      const chosenWorkflow =
        workflows.find((w) =>
          normalizeText(w.name).includes(normalizeText(action.workflowHint || ''))
        ) ||
        workflows.find((w) => w.enabled !== false) ||
        workflows[0] ||
        null;
      const newProject = await createProject({
        name: action.name || 'AI Generated Project',
        description: action.description || 'Created by autonomous operator objective.',
        status: 'Active',
        workflowId: chosenWorkflow?.id || null,
        workflowName: chosenWorkflow?.name || '',
      });
      outcomes.push(
        `Created project "${newProject.name}"${chosenWorkflow ? ` with workflow "${chosenWorkflow.name}"` : ''}.`
      );
    } else if (action.type === 'optimize_partner_routing') {
      const route = selectRoutingSuggestion(partners);
      if (route)
        outcomes.push(
          `Routing optimization: move priority traffic from ${route.fromPartner} to ${route.toPartner}.`
        );
      else warnings.push('Not enough partner performance data to build routing optimization.');
    } else if (action.type === 'fix_broken_workflows') {
      if (autoFix) {
        const repaired = await safeWorkflowRepair(workflows);
        if (repaired.length) outcomes.push(...repaired);
        else warnings.push('No auto-repairable workflow issues found.');
      } else {
        warnings.push('Workflow repair requested in dry-run mode; no changes applied.');
      }
    }
  }

  const cycle = await runOperatorCycle({
    autoFix,
    trigger,
    preferredMode,
  });
  const predictive = await runPredictiveAnalysis();

  const result = {
    plan,
    mode: cycle.mode,
    outcomes,
    warnings,
    cycle,
    predictive,
    checked: {
      partners: partners.length,
      projects: projects.length,
      workflows: workflows.length,
    },
  };

  await logAction({
    action: 'AI autonomous objective executed',
    entity: 'System',
    entityId: trigger,
    details: `Objective: ${objective || 'N/A'} · Outcomes: ${outcomes.length} · Warnings: ${warnings.length}`,
    meta: {
      source: 'operator-orchestrator',
      importance: plan.riskLevel === 'high' ? 'high' : 'medium',
      tags: ['ai', 'autonomous', 'objective'],
      codeAfter: JSON.stringify(result, null, 2),
    },
  });

  return result;
}

export async function runOperatorCycle({
  autoFix = true,
  trigger = 'ask-anything',
  preferredMode = '',
} = {}) {
  const [partners, projects, workflows] = await Promise.all([
    partnerService.getAll(),
    getAllProjects(),
    getAllWorkflows(),
  ]);

  const partnerById = new Map(partners.map((p) => [p.id, p]));
  const workflowById = new Map(workflows.map((w) => [w.id, w]));
  const defaultWorkflow = workflows.find((w) => w.enabled !== false) || workflows[0] || null;

  const issues = [];
  const fixes = [];
  const partnerTaskUpdates = new Map();

  // Projects ↔ Partners / Workflows / Traffic logic
  for (const project of projects) {
    if (!project.partnerId || !partnerById.has(project.partnerId)) {
      issues.push({
        type: 'orphan-project-partner',
        severity: 'high',
        message: `Project "${project.name}" has missing or invalid partner link.`,
        entityId: project.id,
      });
    }

    if (!project.workflowId || !workflowById.has(project.workflowId)) {
      issues.push({
        type: 'missing-project-workflow',
        severity: 'medium',
        message: `Project "${project.name}" is missing a valid workflow link.`,
        entityId: project.id,
      });
      if (autoFix && defaultWorkflow) {
        const updated = await updateProject(project.id, {
          workflowId: defaultWorkflow.id,
          workflowName: defaultWorkflow.name,
        });
        if (updated) {
          fixes.push(`Linked project "${project.name}" to workflow "${defaultWorkflow.name}".`);
          await logAction({
            action: 'AI repair: project workflow link',
            entity: 'Project',
            entityId: project.id,
            details: `${project.name} -> ${defaultWorkflow.name}`,
            meta: {
              source: 'operator-orchestrator',
              importance: 'medium',
              tags: ['ai', 'repair', 'project', 'workflow'],
              codeAfter: JSON.stringify(
                {
                  projectId: project.id,
                  workflowId: defaultWorkflow.id,
                  workflowName: defaultWorkflow.name,
                },
                null,
                2
              ),
            },
          });
        }
      }
    }

    if (!project.campaignId && !project.campaignName) {
      issues.push({
        type: 'missing-tracking',
        severity: 'low',
        message: `Project "${project.name}" has no campaign/tracking reference.`,
        entityId: project.id,
      });
    }
  }

  // Partners intelligence and task-parent integrity
  for (const partner of partners) {
    const hasTeam = !!(
      partner.team ||
      partner.information?.team ||
      (Array.isArray(partner.teams) && partner.teams.length)
    );
    const tasks = Array.isArray(partner.tasks)
      ? partner.tasks
      : Array.isArray(partner.tasks?.items)
        ? partner.tasks.items
        : [];
    const normalizedTasks = [...tasks];

    if (!hasTeam) {
      issues.push({
        type: 'unassigned-partner',
        severity: 'medium',
        message: `Partner "${partner.name}" has no team ownership.`,
        entityId: partner.id,
      });

      const fp = `owner-gap-${partner.id}`;
      if (autoFix && !hasAutoTask(normalizedTasks, fp)) {
        normalizedTasks.unshift(
          buildAutoTask({
            fingerprint: fp,
            title: `Assign owner/team for ${partner.name}`,
            description: 'Partner has no team ownership. Assign a team to restore accountability.',
            entityRef: `partner:${partner.id}`,
            priority: 'high',
          })
        );
      }
    }

    let malformedTaskCount = 0;
    for (let i = 0; i < normalizedTasks.length; i += 1) {
      const t = normalizedTasks[i] || {};
      if (!t.title || !t.status) {
        malformedTaskCount += 1;
        normalizedTasks[i] = {
          ...t,
          id: t.id || `T-${partner.id}-${Date.now()}-${i}`,
          taskId: t.taskId || t.id || `T-${partner.id}-${Date.now()}-${i}`,
          title: t.title || 'Untitled task',
          status: t.status || 'todo',
          priority: t.priority || 'medium',
        };
      }
    }
    if (malformedTaskCount > 0) {
      issues.push({
        type: 'task-parent-integrity',
        severity: 'medium',
        message: `Partner "${partner.name}" has ${malformedTaskCount} malformed task(s).`,
        entityId: partner.id,
      });
    }

    if (JSON.stringify(tasks) !== JSON.stringify(normalizedTasks)) {
      partnerTaskUpdates.set(partner.id, normalizedTasks);
    }
  }

  // Workflow health
  const workflowNameSeen = new Map();
  for (const wf of workflows) {
    const nameKey = normalizeText(wf.name);
    if (nameKey) {
      const list = workflowNameSeen.get(nameKey) || [];
      list.push(wf.id);
      workflowNameSeen.set(nameKey, list);
    }

    const linkedProjects = projects.filter((p) => p.workflowId === wf.id && p.status === 'Active');
    if (wf.enabled === false && linkedProjects.length > 0) {
      issues.push({
        type: 'inactive-workflow-in-use',
        severity: 'medium',
        message: `Workflow "${wf.name}" is paused but used by active projects.`,
        entityId: wf.id,
      });
    }

    const nodes = Array.isArray(wf.nodes) ? wf.nodes : [];
    const edges = Array.isArray(wf.edges) ? wf.edges : [];
    if (nodes.length === 0) {
      issues.push({
        type: 'missing-bindings',
        severity: 'high',
        message: `Workflow "${wf.name}" has no nodes.`,
        entityId: wf.id,
      });
    }
    if (
      edges.some((e) => e?.source && e?.target && e.source === e.target) ||
      buildGraphHasCycle(nodes, edges)
    ) {
      issues.push({
        type: 'circular-dependency',
        severity: 'high',
        message: `Workflow "${wf.name}" has circular routing risk.`,
        entityId: wf.id,
      });
    }
  }
  for (const [name, ids] of workflowNameSeen.entries()) {
    if (ids.length > 1) {
      issues.push({
        type: 'redundant-workflows',
        severity: 'low',
        message: `Workflow name "${name}" appears ${ids.length} times.`,
        entityId: ids.join(','),
      });
    }
  }

  // Persist partner task repairs in batch per partner
  for (const [partnerId, tasks] of partnerTaskUpdates.entries()) {
    await partnerService.updateTasks(partnerId, tasks);
    fixes.push(`Updated task integrity for partner ${partnerId}.`);
  }

  const workflowIssues = issues.filter(
    (i) => i.type.includes('workflow') || i.type.includes('circular') || i.type.includes('bindings')
  ).length;
  const projectIssues = issues.filter(
    (i) => i.type.includes('project') || i.type.includes('tracking')
  ).length;
  const partnerIssues = issues.filter(
    (i) => i.type.includes('partner') || i.type.includes('task-parent')
  ).length;
  let auditSummary = null;
  try {
    const auditLogs = await loadAuditLogs({ limit: 100, offset: 0 });
    auditSummary = summarizeAuditAnomalies(auditLogs);
  } catch {
    auditSummary = null;
  }

  const mode = buildMode({ workflowIssues, projectIssues, partnerIssues, preferredMode });
  const predictive = await runPredictiveAnalysis();

  const result = {
    mode,
    checked: {
      partners: partners.length,
      projects: projects.length,
      workflows: workflows.length,
    },
    issues,
    fixes,
    predictive,
    audit: auditSummary,
    stats: {
      high: issues.filter((i) => i.severity === 'high').length,
      medium: issues.filter((i) => i.severity === 'medium').length,
      low: issues.filter((i) => i.severity === 'low').length,
    },
  };

  await logAction({
    action: 'AI operator cycle executed',
    entity: 'System',
    entityId: trigger,
    details: `Mode: ${mode} · Issues: ${issues.length} · Fixes: ${fixes.length}`,
    meta: {
      source: 'operator-orchestrator',
      importance: issues.some((i) => i.severity === 'high') ? 'high' : 'medium',
      tags: ['ai', 'operator', 'health-check'],
      codeAfter: JSON.stringify(result, null, 2),
    },
  });

  return result;
}
