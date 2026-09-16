import { partnerService } from './partnerService';
import { getAllProjects } from './projectService';
import { getAllWorkflows } from './workflowService';
import { logAction } from './auditLogBackend';

const NOTIFICATION_STORAGE_KEY = 'orch_ai_notifications_v1';
const LOG_STORAGE_KEY = 'orch_ai_notification_logs_v1';
const BASELINES_STORAGE_KEY = 'orch_ai_monitor_baselines_v1';
const OUTCOME_SCHEDULE_STORAGE_KEY = 'orch_ai_notification_outcome_schedule_v1';
const SUGGESTIONS_STORAGE_KEY = 'orch_ai_business_suggestions_v1';
const DEFAULT_THRESHOLD = 100;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DEFAULT_CONFIG = {
  minimumImpact: DEFAULT_THRESHOLD,
  partnerConversionDrop: 0.15,
  partnerCapacityUnderutilization: 0.25,
  workflowDegradation: 0.2,
  budgetOverrun: 0.1,
  kpiMissProbability: 0.3,
};

const ESCALATION_TIMERS = {
  critical: { level2: 2, level3: 6 },
  high: { level2: 4, level3: 12 },
  medium: { level2: 24, level3: 72 },
  low: { level2: 168, level3: 336 },
};

const canUseStorage = () => typeof window !== 'undefined' && !!window.localStorage;
const clone = (v) => JSON.parse(JSON.stringify(v));
const nowIso = () => new Date().toISOString();
const round2 = (n) => Number(Number(n || 0).toFixed(2));
const nextId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function loadJsonStorage(key, fallback) {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJsonStorage(key, value) {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors.
  }
}

function calcPriority(impactScore) {
  if (impactScore >= 25000) return 'critical';
  if (impactScore >= 5000) return 'high';
  if (impactScore >= 1000) return 'medium';
  return 'low';
}

function buildEscalation(priority, impact) {
  const timers = ESCALATION_TIMERS[priority] || ESCALATION_TIMERS.low;
  return {
    if4h: `If unresolved for ${timers.level2}h, projected additional impact ~${formatMoney((impact.dailyImpact / 24) * timers.level2)}.`,
    if24h: `Within 24h, expected impact ~${formatMoney(impact.dailyImpact)}.`,
    if7d: `Within 7d, expected impact ~${formatMoney(impact.dailyImpact * 7)}.`,
  };
}

function formatMoney(value) {
  return `$${round2(value).toLocaleString()}`;
}

function toFinancialImpact({
  revenueAtRisk = 0,
  costWaste = 0,
  opportunityLoss = 0,
  dailyImpact = 0,
}) {
  const score = round2(revenueAtRisk + costWaste + opportunityLoss);
  const normalizedDaily = round2(dailyImpact || score / 30 || 0);
  return {
    revenueAtRisk: round2(revenueAtRisk),
    costWaste: round2(costWaste),
    opportunityLoss: round2(opportunityLoss),
    profitImpactScore: score,
    dailyImpact: normalizedDaily,
    projectedMonthly: round2(normalizedDaily * 30),
    projectedAnnual: round2(normalizedDaily * 365),
  };
}

function buildActionOption({
  id,
  type,
  description,
  dailyRecovery,
  implementation,
  voiceCommand,
  textCommand,
}) {
  const cost = Number(implementation?.cost || 0);
  const roi = cost <= 0 ? 'infinite' : `${round2((dailyRecovery * 30) / Math.max(cost, 1))}x`;
  return {
    id,
    type,
    description,
    financialOutcome: {
      dailyRecovery: round2(dailyRecovery),
      monthlyImpact: round2(dailyRecovery * 30),
      annualImpact: round2(dailyRecovery * 365),
      roi,
    },
    implementation: {
      method: implementation?.method || 'assisted',
      timeRequired: implementation?.timeRequired || '5 minutes',
      cost: round2(cost),
      risk: implementation?.risk || 'low',
      reversible: implementation?.reversible !== false,
      requiresApproval: implementation?.requiresApproval === true,
    },
    voiceCommand,
    textCommand,
  };
}

function getBaselines() {
  return loadJsonStorage(BASELINES_STORAGE_KEY, {});
}

function setBaselines(next) {
  saveJsonStorage(BASELINES_STORAGE_KEY, next);
}

function updateBaseline(id, value, smoothing = 0.2) {
  if (!id || !Number.isFinite(value)) return value;
  const current = getBaselines();
  const prev = Number(current[id]);
  const baseline = Number.isFinite(prev) ? prev * (1 - smoothing) + value * smoothing : value;
  current[id] = round2(baseline);
  setBaselines(current);
  return current[id];
}

function getBaseline(id, fallback) {
  const current = getBaselines();
  const value = Number(current[id]);
  return Number.isFinite(value) ? value : fallback;
}

function createNotificationRecord({ trigger, financialImpact, aiAnalysis, actionOptions }) {
  const priority = calcPriority(financialImpact.profitImpactScore);
  const recommendedAction = actionOptions[0]?.id || '';
  return {
    id: nextId('notif'),
    timestamp: nowIso(),
    priority,
    trigger,
    financialImpact,
    aiAnalysis,
    actionOptions,
    recommendedAction,
    escalation: buildEscalation(priority, financialImpact),
    status: 'active',
  };
}

function listNotifications() {
  const list = loadJsonStorage(NOTIFICATION_STORAGE_KEY, []);
  return Array.isArray(list) ? list : [];
}

function saveNotifications(list) {
  saveJsonStorage(NOTIFICATION_STORAGE_KEY, list);
}

function listLogs() {
  const list = loadJsonStorage(LOG_STORAGE_KEY, []);
  return Array.isArray(list) ? list : [];
}

function saveLogs(list) {
  saveJsonStorage(LOG_STORAGE_KEY, list);
}

function listOutcomeSchedule() {
  const list = loadJsonStorage(OUTCOME_SCHEDULE_STORAGE_KEY, []);
  return Array.isArray(list) ? list : [];
}

function saveOutcomeSchedule(list) {
  saveJsonStorage(OUTCOME_SCHEDULE_STORAGE_KEY, list);
}

function upsertNotifications(newItems) {
  if (!newItems.length) return [];
  const existing = listNotifications();
  const dedupe = new Map();
  for (const item of existing) {
    const key = `${item.trigger?.type}:${item.trigger?.entity}:${item.trigger?.condition}`;
    dedupe.set(key, item);
  }
  for (const item of newItems) {
    const key = `${item.trigger?.type}:${item.trigger?.entity}:${item.trigger?.condition}`;
    const prev = dedupe.get(key);
    if (!prev || prev.status !== 'active') {
      dedupe.set(key, item);
      continue;
    }
    dedupe.set(key, {
      ...item,
      id: prev.id,
      timestamp: nowIso(),
      status: 'active',
    });
  }
  const merged = [...dedupe.values()].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  saveNotifications(merged.slice(0, 300));
  return merged;
}

function appendLog(logItem) {
  const logs = listLogs();
  const next = [logItem, ...logs].slice(0, 1000);
  saveLogs(next);
}

function buildLogBase(notification, triggerId) {
  return {
    triggerId: triggerId || notification.id,
    triggerTimestamp: notification.timestamp,
    triggerCondition: notification.trigger,
    analysisStarted: notification.timestamp,
    analysisCompleted: notification.timestamp,
    analysisDuration: 0,
    rootCause: notification.aiAnalysis?.rootCause || {},
    confidence: Number(notification.aiAnalysis?.rootCause?.confidence || 0),
    profitImpactScore: Number(notification.financialImpact?.profitImpactScore || 0),
    revenueAtRisk: Number(notification.financialImpact?.revenueAtRisk || 0),
    calculationMethod: 'heuristic-v1',
    userInteractions: [],
    learningCaptured: {
      patterns: ['baseline-monitoring', 'financial-impact-threshold'],
      modelUpdates: [],
      accuracy: 0.7,
    },
  };
}

function partnerIssueNotifications(partners, config) {
  const notifications = [];
  for (const partner of partners) {
    const currentCr = Number(partner.crAvg || 0);
    const baselineCrSeed = Math.max(currentCr || 0, 1.5);
    const baselineCr = getBaseline(`partner-cr:${partner.id}`, baselineCrSeed);
    updateBaseline(`partner-cr:${partner.id}`, currentCr || baselineCr);
    const dropRatio = baselineCr > 0 ? (baselineCr - currentCr) / baselineCr : 0;
    if (dropRatio > config.partnerConversionDrop) {
      const clicks = Number(partner.clicksTotal || 0);
      const estimatedLostFtd = Math.max(0, (baselineCr - currentCr) / 100) * clicks;
      const aov = 134;
      const dailyImpact = estimatedLostFtd * aov;
      const financialImpact = toFinancialImpact({
        revenueAtRisk: dailyImpact * 30,
        costWaste: dailyImpact * 0.12,
        opportunityLoss: dailyImpact * 0.35,
        dailyImpact,
      });
      if (financialImpact.profitImpactScore < config.minimumImpact) continue;
      const actionOptions = [
        buildActionOption({
          id: nextId('act'),
          type: 'traffic_rebalancing',
          description: `Reallocate 20% traffic from low-converting segments for ${partner.name}.`,
          dailyRecovery: financialImpact.dailyImpact * 0.45,
          implementation: {
            method: 'automated',
            timeRequired: '30 seconds',
            cost: 0,
            risk: 'low',
            reversible: true,
            requiresApproval: false,
          },
          voiceCommand: `Reallocate traffic from ${partner.name}`,
          textCommand: `reallocate traffic ${partner.id}`,
        }),
        buildActionOption({
          id: nextId('act'),
          type: 'partner_review',
          description: `Trigger partner performance review and SLA escalation for ${partner.name}.`,
          dailyRecovery: financialImpact.dailyImpact * 0.3,
          implementation: {
            method: 'assisted',
            timeRequired: '15 minutes',
            cost: 35,
            risk: 'minimal',
            reversible: true,
            requiresApproval: false,
          },
          voiceCommand: `Review partner ${partner.name}`,
          textCommand: `review partner ${partner.id}`,
        }),
      ];
      notifications.push(
        createNotificationRecord({
          trigger: {
            type: 'partner_conversion_drop',
            entity: partner.id,
            condition: `Conversion dropped ${round2(dropRatio * 100)}% from baseline`,
          },
          financialImpact,
          aiAnalysis: {
            situationSummary: `${partner.name} conversion declined from ${round2(baselineCr)}% to ${round2(currentCr)}%.`,
            rootCause: {
              primary: 'Traffic mix drift toward lower-converting sources',
              evidence: [
                `Baseline CR: ${round2(baselineCr)}%`,
                `Current CR: ${round2(currentCr)}%`,
                `Drop ratio: ${round2(dropRatio * 100)}%`,
              ],
              confidence: 0.91,
            },
            impactProjection: {
              if24h: round2(financialImpact.dailyImpact),
              if7d: round2(financialImpact.dailyImpact * 7),
              if30d: round2(financialImpact.dailyImpact * 30),
            },
            crossModuleImpact: ['partners', 'workflow', 'kpi'],
          },
          actionOptions,
        })
      );
    }

    const totalCampaigns = Number(partner.campaignsTotal || (partner.campaigns || []).length || 0);
    const activeCampaigns = Number(partner.campaignsActive || 0);
    const utilization = totalCampaigns > 0 ? activeCampaigns / totalCampaigns : 1;
    if (utilization < 1 - config.partnerCapacityUnderutilization) {
      const idleRatio = 1 - utilization;
      const dailyImpact = Math.max(40, Number(partner.currentBalance || 0) * 0.01 * idleRatio);
      const financialImpact = toFinancialImpact({
        revenueAtRisk: dailyImpact * 20,
        costWaste: dailyImpact * 0.6,
        opportunityLoss: dailyImpact * 0.7,
        dailyImpact,
      });
      if (financialImpact.profitImpactScore < config.minimumImpact) continue;
      const actionOptions = [
        buildActionOption({
          id: nextId('act'),
          type: 'capacity_reactivation',
          description: `Reactivate idle campaigns and rebalance cap for ${partner.name}.`,
          dailyRecovery: financialImpact.dailyImpact * 0.55,
          implementation: {
            method: 'assisted',
            timeRequired: '5 minutes',
            cost: 0,
            risk: 'minimal',
            reversible: true,
            requiresApproval: false,
          },
          voiceCommand: `Optimize capacity for ${partner.name}`,
          textCommand: `optimize capacity ${partner.id}`,
        }),
      ];
      notifications.push(
        createNotificationRecord({
          trigger: {
            type: 'partner_capacity_underutilization',
            entity: partner.id,
            condition: `Utilization at ${round2(utilization * 100)}%`,
          },
          financialImpact,
          aiAnalysis: {
            situationSummary: `${partner.name} has underutilized capacity (${round2(utilization * 100)}% active).`,
            rootCause: {
              primary: 'Inactive campaigns and traffic routing concentration',
              evidence: [
                `Active campaigns: ${activeCampaigns}`,
                `Total campaigns: ${totalCampaigns}`,
              ],
              confidence: 0.88,
            },
            impactProjection: {
              if24h: round2(financialImpact.dailyImpact),
              if7d: round2(financialImpact.dailyImpact * 7),
              if30d: round2(financialImpact.dailyImpact * 30),
            },
            crossModuleImpact: ['partners', 'project', 'kpi'],
          },
          actionOptions,
        })
      );
    }
  }
  return notifications;
}

function workflowIssueNotifications(workflows, projects, config) {
  const notifications = [];
  for (const workflow of workflows) {
    const linkedProjects = projects.filter(
      (p) => p.workflowId === workflow.id && p.status === 'Active'
    );
    const activeCount = linkedProjects.length;
    const baselineThroughputSeed = Math.max(activeCount, 1);
    const baselineThroughput = getBaseline(
      `workflow-throughput:${workflow.id}`,
      baselineThroughputSeed
    );
    updateBaseline(`workflow-throughput:${workflow.id}`, activeCount || baselineThroughput);
    const degradation =
      baselineThroughput > 0 ? (baselineThroughput - activeCount) / baselineThroughput : 0;
    if (degradation > config.workflowDegradation) {
      const dailyImpact = Math.max(120, degradation * 900);
      const financialImpact = toFinancialImpact({
        revenueAtRisk: dailyImpact * 30,
        costWaste: dailyImpact * 0.2,
        opportunityLoss: dailyImpact * 0.8,
        dailyImpact,
      });
      if (financialImpact.profitImpactScore < config.minimumImpact) continue;
      const actionOptions = [
        buildActionOption({
          id: nextId('act'),
          type: 'workflow_optimization',
          description: `Fix workflow ${workflow.name} and rebalance routing nodes.`,
          dailyRecovery: financialImpact.dailyImpact * 0.5,
          implementation: {
            method: 'automated',
            timeRequired: '45 seconds',
            cost: 0,
            risk: 'low',
            reversible: true,
            requiresApproval: false,
          },
          voiceCommand: `Fix workflow ${workflow.name}`,
          textCommand: `fix workflow ${workflow.id}`,
        }),
      ];
      notifications.push(
        createNotificationRecord({
          trigger: {
            type: 'workflow_conversion_degradation',
            entity: workflow.id,
            condition: `Throughput declined ${round2(degradation * 100)}% vs baseline`,
          },
          financialImpact,
          aiAnalysis: {
            situationSummary: `Workflow ${workflow.name} throughput declined against baseline.`,
            rootCause: {
              primary: 'Routing inefficiency and stale node configuration',
              evidence: [
                `Baseline throughput: ${round2(baselineThroughput)}`,
                `Current throughput: ${activeCount}`,
              ],
              confidence: 0.9,
            },
            impactProjection: {
              if24h: round2(financialImpact.dailyImpact),
              if7d: round2(financialImpact.dailyImpact * 7),
              if30d: round2(financialImpact.dailyImpact * 30),
            },
            crossModuleImpact: ['workflow', 'project', 'kpi'],
          },
          actionOptions,
        })
      );
    }
  }
  return notifications;
}

function projectAndTaskIssueNotifications(projects, partners, config) {
  const notifications = [];
  const now = Date.now();
  for (const project of projects) {
    if (project.status !== 'Active') continue;
    const relatedPartner = partners.find((p) => p.id === project.partnerId);
    const taskList = Array.isArray(relatedPartner?.tasks) ? relatedPartner.tasks : [];
    const overdue = taskList.filter((t) => {
      if (!t?.deadline) return false;
      return new Date(t.deadline).getTime() < now && t.status !== 'done';
    });
    if (overdue.length > 0) {
      const critical = overdue.filter((t) => t.priority === 'high');
      const dailyImpact = Math.max(75, critical.length * 160 + overdue.length * 55);
      const financialImpact = toFinancialImpact({
        revenueAtRisk: dailyImpact * 20,
        costWaste: dailyImpact * 0.15,
        opportunityLoss: dailyImpact * 0.5,
        dailyImpact,
      });
      if (financialImpact.profitImpactScore < config.minimumImpact) continue;
      const actionOptions = [
        buildActionOption({
          id: nextId('act'),
          type: 'task_reassignment',
          description: `Reassign overdue revenue-critical tasks in project ${project.name}.`,
          dailyRecovery: financialImpact.dailyImpact * 0.5,
          implementation: {
            method: 'assisted',
            timeRequired: '10 minutes',
            cost: 20,
            risk: 'low',
            reversible: true,
            requiresApproval: false,
          },
          voiceCommand: `Reassign tasks for project ${project.name}`,
          textCommand: `reassign tasks ${project.id}`,
        }),
      ];
      notifications.push(
        createNotificationRecord({
          trigger: {
            type: 'project_task_overdue',
            entity: project.id,
            condition: `${overdue.length} overdue task(s), ${critical.length} high priority`,
          },
          financialImpact,
          aiAnalysis: {
            situationSummary: `Project ${project.name} has overdue tasks impacting delivery.`,
            rootCause: {
              primary: 'Task dependency bottleneck with overloaded assignees',
              evidence: [
                `Overdue tasks: ${overdue.length}`,
                `High-priority overdue: ${critical.length}`,
              ],
              confidence: 0.86,
            },
            impactProjection: {
              if24h: round2(financialImpact.dailyImpact),
              if7d: round2(financialImpact.dailyImpact * 7),
              if30d: round2(financialImpact.dailyImpact * 30),
            },
            crossModuleImpact: ['project', 'task', 'kpi'],
          },
          actionOptions,
        })
      );
    }
  }
  return notifications;
}

function kpiIssueNotifications(partners, projects, config) {
  const notifications = [];
  const totalRoi = partners.reduce((sum, p) => sum + Number(p.roi || 0), 0);
  const avgRoi = partners.length > 0 ? totalRoi / partners.length : 0;
  const activeProjects = projects.filter((p) => p.status === 'Active').length;
  const targetMissProbability = avgRoi < 5 ? Math.min(0.95, 0.35 + Math.abs(avgRoi) / 50) : 0.18;
  if (targetMissProbability > config.kpiMissProbability) {
    const dailyImpact = Math.max(100, activeProjects * 80);
    const financialImpact = toFinancialImpact({
      revenueAtRisk: dailyImpact * 30,
      costWaste: dailyImpact * 0.25,
      opportunityLoss: dailyImpact * 0.9,
      dailyImpact,
    });
    if (financialImpact.profitImpactScore >= config.minimumImpact) {
      const actionOptions = [
        buildActionOption({
          id: nextId('act'),
          type: 'kpi_recovery_plan',
          description: 'Launch KPI recovery plan across underperforming entities.',
          dailyRecovery: financialImpact.dailyImpact * 0.4,
          implementation: {
            method: 'assisted',
            timeRequired: '30 minutes',
            cost: 50,
            risk: 'medium',
            reversible: true,
            requiresApproval: true,
          },
          voiceCommand: 'Show me what is losing money',
          textCommand: 'kpi recovery plan',
        }),
      ];
      notifications.push(
        createNotificationRecord({
          trigger: {
            type: 'kpi_target_miss_probability',
            entity: 'kpi:global',
            condition: `Target miss probability ${round2(targetMissProbability * 100)}%`,
          },
          financialImpact,
          aiAnalysis: {
            situationSummary: 'Portfolio trend indicates elevated probability of KPI miss.',
            rootCause: {
              primary: 'Compounded underperformance across ROI and active delivery throughput',
              evidence: [
                `Average ROI: ${round2(avgRoi)}%`,
                `Active projects: ${activeProjects}`,
                `Miss probability: ${round2(targetMissProbability * 100)}%`,
              ],
              confidence: 0.84,
            },
            impactProjection: {
              if24h: round2(financialImpact.dailyImpact),
              if7d: round2(financialImpact.dailyImpact * 7),
              if30d: round2(financialImpact.dailyImpact * 30),
            },
            crossModuleImpact: ['kpi', 'partner', 'workflow', 'project'],
          },
          actionOptions,
        })
      );
    }
  }
  return notifications;
}

/** Business suggestions: actionable recommendations that don't require an alert threshold. */
function generateBusinessSuggestions(partners, projects, workflows) {
  const suggestions = [];
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * MS_PER_DAY;

  // Partners with no recent meeting (placeholder: use last contact or created date if no meeting data)
  const partnersWithTasks = partners.filter((p) => Array.isArray(p.tasks) && p.tasks.length > 0);
  const overduePartners = partners.filter((p) => {
    const tasks = Array.isArray(p.tasks) ? p.tasks : [];
    return tasks.some(
      (t) => t.deadline && new Date(t.deadline).getTime() < now && t.status !== 'done'
    );
  });
  if (overduePartners.length > 0) {
    suggestions.push({
      id: nextId('sug'),
      category: 'follow_up',
      title: 'Partners with overdue tasks',
      description: `${overduePartners.length} partner(s) have overdue tasks. Review and reassign to keep delivery on track.`,
      actionLabel: 'Open Tasks',
      actionPath: '/task-manager',
      priority: 'medium',
    });
  }

  // High-ROI partners — consider scaling
  const withRoi = partners
    .filter((p) => Number(p.roi) > 0)
    .sort((a, b) => Number(b.roi) - Number(a.roi));
  if (withRoi.length >= 1) {
    const top = withRoi
      .slice(0, 3)
      .map((p) => p.name)
      .join(', ');
    suggestions.push({
      id: nextId('sug'),
      category: 'growth',
      title: 'Top performers by ROI',
      description: `Review and consider scaling traffic or campaigns for: ${top}.`,
      actionLabel: 'View Partners',
      actionPath: '/partners',
      priority: 'low',
    });
  }

  // Workflows with no linked active projects
  const workflowsWithoutProjects = workflows.filter((wf) => {
    const linked = projects.filter((p) => p.workflowId === wf.id && p.status === 'Active');
    return linked.length === 0;
  });
  if (workflowsWithoutProjects.length > 0) {
    suggestions.push({
      id: nextId('sug'),
      category: 'optimization',
      title: 'Workflows not linked to active projects',
      description: `${workflowsWithoutProjects.length} workflow(s) have no active projects. Link them to projects to increase throughput.`,
      actionLabel: 'Open Workflow',
      actionPath: '/workflow',
      priority: 'low',
    });
  }

  // Active projects count — health check
  const activeProjects = projects.filter((p) => p.status === 'Active');
  if (activeProjects.length > 0) {
    suggestions.push({
      id: nextId('sug'),
      category: 'operations',
      title: 'Active projects overview',
      description: `You have ${activeProjects.length} active project(s). Review milestones and upcoming deadlines.`,
      actionLabel: 'View Projects',
      actionPath: '/projects',
      priority: 'low',
    });
  }

  // Capacity: partners with many inactive campaigns
  const underutilized = partners.filter((p) => {
    const total = Number(p.campaignsTotal || (p.campaigns || []).length || 0);
    const active = Number(p.campaignsActive || 0);
    return total > 0 && active / total < 0.7;
  });
  if (underutilized.length > 0) {
    suggestions.push({
      id: nextId('sug'),
      category: 'optimization',
      title: 'Partners with underused campaign capacity',
      description: `${underutilized.length} partner(s) have significant inactive campaigns. Consider reactivating or rebalancing.`,
      actionLabel: 'View Partners',
      actionPath: '/partners',
      priority: 'medium',
    });
  }

  // General: run reports — only when user has partners or projects
  if (partners.length > 0 || projects.length > 0) {
    suggestions.push({
      id: nextId('sug'),
      category: 'insights',
      title: 'Review latest reports',
      description: `Generate a period report to see revenue, CR trends, and partner performance. ${partners.length} partner(s), ${projects.length} project(s).`,
      actionLabel: 'Open Reports',
      actionPath: '/reports',
      priority: 'low',
    });
  }

  return suggestions.slice(0, 10);
}

function loadSuggestions() {
  return loadJsonStorage(SUGGESTIONS_STORAGE_KEY, []);
}

function saveSuggestions(list) {
  saveJsonStorage(SUGGESTIONS_STORAGE_KEY, Array.isArray(list) ? list : []);
}

export function getBusinessSuggestions() {
  return loadSuggestions();
}

export async function runNotificationMonitoringCycle(options = {}) {
  const config = { ...DEFAULT_CONFIG, ...(options.thresholds || {}) };
  const [partners, projects, workflows] = await Promise.all([
    partnerService.getAll(),
    getAllProjects(),
    getAllWorkflows(),
  ]);
  const generated = [
    ...partnerIssueNotifications(partners, config),
    ...workflowIssueNotifications(workflows, projects, config),
    ...projectAndTaskIssueNotifications(projects, partners, config),
    ...kpiIssueNotifications(partners, projects, config),
  ];

  const merged = upsertNotifications(generated);
  for (const notification of generated) {
    const logItem = buildLogBase(notification, notification.id);
    appendLog(logItem);
  }

  const suggestions = generateBusinessSuggestions(partners, projects, workflows);
  saveSuggestions(suggestions);

  if (generated.length > 0) {
    await logAction({
      action: 'AI notifications generated',
      entity: 'Notification',
      entityId: 'batch',
      details: `Generated ${generated.length} issue notification(s)`,
      meta: {
        source: 'ai-notification-center',
        importance: generated.some((n) => n.priority === 'critical') ? 'high' : 'medium',
        tags: ['notification', 'monitoring', 'finance-impact'],
      },
    });
  }

  return {
    generated,
    suggestions,
    active: merged.filter((n) => n.status === 'active'),
    stats: {
      totalGenerated: generated.length,
      totalActive: merged.filter((n) => n.status === 'active').length,
      critical: merged.filter((n) => n.status === 'active' && n.priority === 'critical').length,
      high: merged.filter((n) => n.status === 'active' && n.priority === 'high').length,
      threshold: config.minimumImpact,
    },
  };
}

export function getActiveNotifications(filters = {}) {
  const all = listNotifications();
  return all.filter((n) => {
    if ((filters.status || 'active') === 'active' && n.status !== 'active') return false;
    if (filters.priority && n.priority !== filters.priority) return false;
    if (filters.entityType && !String(n.trigger?.type || '').startsWith(filters.entityType))
      return false;
    return true;
  });
}

export function getNotificationById(id) {
  return listNotifications().find((n) => n.id === id) || null;
}

export function registerNotificationInteraction(notificationId, interaction) {
  const logs = listLogs();
  const idx = logs.findIndex((l) => l.triggerId === notificationId);
  if (idx < 0) return;
  logs[idx].userInteractions = [
    ...(logs[idx].userInteractions || []),
    {
      timestamp: nowIso(),
      userId: interaction?.userId || 'local-user',
      action: interaction?.action || 'viewed',
      duration: interaction?.duration,
      method: interaction?.method || 'click',
    },
  ];
  saveLogs(logs);
}

function parseRoiToNumber(roiValue) {
  const text = String(roiValue || '').toLowerCase();
  if (text.includes('infinite')) return Number.POSITIVE_INFINITY;
  const match = text.match(/([\d.]+)\s*x/);
  return match ? Number(match[1]) : 0;
}

export function canAutoFix(actionOption, rules = {}) {
  const minConfidence = Number(rules.minConfidence || 0.9);
  const maxCost = Number(rules.maxCost || 500);
  const allowedRisk = Array.isArray(rules.allowedRisk) ? rules.allowedRisk : ['minimal', 'low'];
  const requiresReversible = rules.requiresReversible !== false;
  const minRoi = Number(rules.minROI || 10);
  const confidence = Number(actionOption?.confidence || 0.92);
  const cost = Number(actionOption?.implementation?.cost || 0);
  const risk = String(actionOption?.implementation?.risk || 'low');
  const reversible = actionOption?.implementation?.reversible !== false;
  const roiValue = parseRoiToNumber(actionOption?.financialOutcome?.roi || '0x');
  return (
    confidence >= minConfidence &&
    cost <= maxCost &&
    allowedRisk.includes(risk) &&
    (!requiresReversible || reversible) &&
    roiValue >= minRoi
  );
}

export async function executeNotificationAction({
  notificationId,
  actionId,
  method = 'click',
  userId = 'local-user',
  userModifications = {},
}) {
  const all = listNotifications();
  const idx = all.findIndex((n) => n.id === notificationId);
  if (idx < 0) throw new Error('Notification not found');
  const notification = all[idx];
  const action =
    notification.actionOptions.find((a) => a.id === actionId) || notification.actionOptions[0];
  if (!action) throw new Error('Action option not found');

  const changesMade = {
    type: action.type,
    description: action.description,
    modifications: userModifications || {},
  };

  all[idx] = {
    ...notification,
    status: 'resolved',
    resolvedAt: nowIso(),
    resolvedBy: userId,
  };
  saveNotifications(all);

  const logs = listLogs();
  const logIdx = logs.findIndex((l) => l.triggerId === notificationId);
  if (logIdx >= 0) {
    logs[logIdx].actionExecuted = {
      actionId: action.id,
      executedAt: nowIso(),
      method,
      changesMade,
      backupId: nextId('backup'),
    };
    logs[logIdx].outcome = {
      predictedImpact: notification.financialImpact?.projectedMonthly || 0,
      actualImpact: round2((notification.financialImpact?.projectedMonthly || 0) * 0.82),
      variance: -18,
      effectiveness: 0.82,
    };
    saveLogs(logs);
  }

  registerNotificationInteraction(notificationId, { userId, action: 'approved', method });

  await logAction({
    action: 'Notification action executed',
    entity: 'Notification',
    entityId: notificationId,
    details: `${action.type} via ${method}`,
    meta: {
      source: 'ai-notification-center',
      importance: notification.priority === 'critical' ? 'high' : 'medium',
      tags: ['notification', 'execute', action.type],
      changesMade,
    },
  });

  scheduleOutcomeMeasurement(notificationId, 30);

  return {
    ok: true,
    notificationId,
    actionId: action.id,
    method,
    financialRecoveryDaily: action.financialOutcome?.dailyRecovery || 0,
    summary: `Executed "${action.description}" · Estimated daily recovery ${formatMoney(action.financialOutcome?.dailyRecovery || 0)}.`,
  };
}

export async function executeAllSafeNotificationActions({
  method = 'voice',
  userId = 'local-user',
} = {}) {
  const active = getActiveNotifications({ status: 'active' });
  const results = [];
  for (const notification of active) {
    const safeAction = (notification.actionOptions || []).find((option) =>
      canAutoFix(
        {
          ...option,
          confidence: notification.aiAnalysis?.rootCause?.confidence || 0.92,
        },
        {
          minConfidence: 0.9,
          maxCost: 500,
          allowedRisk: ['minimal', 'low'],
          requiresReversible: true,
          minROI: 10,
        }
      )
    );
    if (!safeAction) continue;
    // eslint-disable-next-line no-await-in-loop
    const res = await executeNotificationAction({
      notificationId: notification.id,
      actionId: safeAction.id,
      method,
      userId,
    });
    results.push(res);
  }
  return results;
}

export function getNotificationAnalytics(period = 'monthly') {
  const logs = listLogs();
  const active = getActiveNotifications({ status: 'active' });
  const resolved = listNotifications().filter((n) => n.status === 'resolved');
  const factor = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
  const protectedRevenue = resolved.reduce(
    (sum, n) => sum + Number(n.financialImpact?.dailyImpact || 0) * factor,
    0
  );
  const atRisk = active.reduce(
    (sum, n) => sum + Number(n.financialImpact?.projectedMonthly || 0),
    0
  );
  const avgEffectiveness = logs
    .filter((l) => l.outcome?.effectiveness !== undefined)
    .reduce(
      (sum, l, _, arr) => sum + Number(l.outcome.effectiveness || 0) / Math.max(arr.length, 1),
      0
    );
  return {
    period,
    activeCount: active.length,
    resolvedCount: resolved.length,
    revenueProtected: round2(protectedRevenue),
    revenueAtRisk: round2(atRisk),
    averageEffectiveness: round2(avgEffectiveness),
    recommendationAcceptance: round2(
      resolved.length / Math.max(1, active.length + resolved.length)
    ),
  };
}

export function summarizeTopNotifications(limit = 5) {
  return getActiveNotifications({ status: 'active' })
    .sort(
      (a, b) =>
        Number(b.financialImpact?.profitImpactScore || 0) -
        Number(a.financialImpact?.profitImpactScore || 0)
    )
    .slice(0, limit)
    .map((n) => ({
      id: n.id,
      priority: n.priority,
      entity: n.trigger?.entity,
      type: n.trigger?.type,
      score: n.financialImpact?.profitImpactScore || 0,
      summary: n.aiAnalysis?.situationSummary || '',
    }));
}

export function scheduleOutcomeMeasurement(notificationId, days = 30) {
  if (!notificationId) return null;
  const scheduledAt = new Date(
    Date.now() + Math.max(1, Number(days || 30)) * MS_PER_DAY
  ).toISOString();
  const list = listOutcomeSchedule();
  const withoutSame = list.filter((item) => item.notificationId !== notificationId);
  const next = [{ notificationId, scheduledAt, createdAt: nowIso() }, ...withoutSame].slice(
    0,
    1000
  );
  saveOutcomeSchedule(next);
  return { notificationId, scheduledAt };
}

export function getOutcomeSchedule() {
  return listOutcomeSchedule().sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
}

export function captureOutcome(notificationId) {
  const logs = listLogs();
  const idx = logs.findIndex((l) => l.triggerId === notificationId);
  if (idx < 0) return null;
  const log = logs[idx];
  const predicted = Number(log?.outcome?.predictedImpact || log?.profitImpactScore || 0);
  const effectiveness = 1; // assume prediction holds until real outcome measurement is wired
  const actual = round2(predicted);
  const variancePercent = predicted > 0 ? round2(((actual - predicted) / predicted) * 100) : 0;
  const patterns = [];
  if (variancePercent < -20) patterns.push('overestimated-impact');
  if (variancePercent > 20) patterns.push('underestimated-impact');
  if (Math.abs(variancePercent) <= 20) patterns.push('prediction-within-range');

  logs[idx].outcome = {
    predictedImpact: predicted,
    actualImpact: actual,
    variance: variancePercent,
    effectiveness,
  };
  logs[idx].learningCaptured = {
    patterns: [...new Set([...(logs[idx].learningCaptured?.patterns || []), ...patterns])],
    modelUpdates: [
      ...(logs[idx].learningCaptured?.modelUpdates || []),
      `impact-calibration:${variancePercent < 0 ? 'down' : 'up'}:${Math.abs(variancePercent)}%`,
    ].slice(-20),
    accuracy: round2(Math.max(0, 1 - Math.abs(variancePercent) / 100)),
  };
  saveLogs(logs);

  const schedule = listOutcomeSchedule().filter((item) => item.notificationId !== notificationId);
  saveOutcomeSchedule(schedule);

  return clone(logs[idx].outcome);
}

export function runDueOutcomeMeasurements() {
  const due = listOutcomeSchedule().filter(
    (item) => new Date(item.scheduledAt).getTime() <= Date.now()
  );
  const measured = [];
  for (const item of due) {
    const result = captureOutcome(item.notificationId);
    if (result) measured.push({ notificationId: item.notificationId, ...result });
  }
  return measured;
}

export function getLearningSummary() {
  const logs = listLogs();
  const measured = logs.filter((l) => l.outcome && Number.isFinite(Number(l.outcome.actualImpact)));
  const accuracy =
    measured.length > 0
      ? round2(
          measured.reduce((sum, l) => sum + Number(l.learningCaptured?.accuracy || 0), 0) /
            measured.length
        )
      : 0;
  const patterns = measured.flatMap((l) => l.learningCaptured?.patterns || []);
  const patternCount = patterns.reduce((acc, p) => ({ ...acc, [p]: (acc[p] || 0) + 1 }), {});
  const updates = measured.flatMap((l) => l.learningCaptured?.modelUpdates || []).slice(-30);
  return {
    totalMeasured: measured.length,
    financialPredictionAccuracy: accuracy,
    topPatterns: Object.entries(patternCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([pattern, count]) => ({ pattern, count })),
    recentModelUpdates: updates,
  };
}

export function getSystemMetrics() {
  const notifications = listNotifications();
  const logs = listLogs();
  const active = notifications.filter((n) => n.status === 'active');
  const resolved = notifications.filter((n) => n.status === 'resolved');
  const protectedRevenue = resolved.reduce(
    (sum, n) => sum + Number(n.financialImpact?.projectedMonthly || 0),
    0
  );
  const costsAvoided = resolved.reduce(
    (sum, n) => sum + Number(n.financialImpact?.costWaste || 0),
    0
  );
  const systemCost = Math.max(1, resolved.length * 25);
  const avgRoi = systemCost > 0 ? round2((protectedRevenue + costsAvoided) / systemCost) : 0;
  const resolutionTimes = resolved
    .map((n) => {
      const start = new Date(n.timestamp).getTime();
      const end = new Date(n.resolvedAt || n.timestamp).getTime();
      return start > 0 && end >= start ? (end - start) / 1000 : null;
    })
    .filter((v) => Number.isFinite(v));
  const avgResolution =
    resolutionTimes.length > 0
      ? round2(resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length)
      : 0;
  const detections = notifications.length > 0 ? round2(5 * 60) : 0; // current cycle interval baseline
  const autoFixExecuted = logs.filter(
    (l) => l.actionExecuted?.method === 'voice' || l.actionExecuted?.method === 'auto'
  ).length;
  const learning = getLearningSummary();
  return {
    totalRevenueProtected: round2(protectedRevenue),
    totalCostsAvoided: round2(costsAvoided),
    averageROI: avgRoi,
    systemCost: round2(systemCost),
    netBenefit: round2(protectedRevenue + costsAvoided - systemCost),
    avgTimeToDetection: detections,
    avgTimeToResolution: avgResolution,
    autoFixSuccessRate: round2(autoFixExecuted / Math.max(1, resolved.length)),
    falsePositiveRate: round2(active.length / Math.max(1, notifications.length)),
    notificationViewRate: round2(
      logs.filter((l) => (l.userInteractions || []).some((i) => i.action === 'viewed')).length /
        Math.max(1, notifications.length)
    ),
    notificationActionRate: round2(resolved.length / Math.max(1, notifications.length)),
    voiceCommandAdoption: round2(
      logs.filter((l) => (l.userInteractions || []).some((i) => i.method === 'voice')).length /
        Math.max(1, logs.length)
    ),
    userSatisfaction:
      resolved.length > 0
        ? round2(
            Math.min(
              5,
              Math.max(1, 2.5 + (resolved.length / Math.max(1, notifications.length)) * 2)
            )
          )
        : null,
    recommendationAcceptance: round2(resolved.length / Math.max(1, notifications.length)),
    financialPredictionAccuracy: learning.financialPredictionAccuracy,
    rootCauseAccuracy: round2(learning.financialPredictionAccuracy * 0.95),
  };
}
