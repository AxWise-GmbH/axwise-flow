/**
 * Report Template Library
 *
 * Static definitions for built-in report templates.
 * Each template declares sections, filters, audience, and export formats.
 * Custom templates follow the same shape and are stored in localStorage / Supabase.
 */

export const SECTION_TYPES = {
  KPI_GRID: 'kpi-grid',
  LINE_CHART: 'line-chart',
  BAR_CHART: 'bar-chart',
  RANKED_TABLE: 'ranked-table',
  ALERTS_LIST: 'alerts-list',
  FUNNEL_CHART: 'funnel-chart',
  HEATMAP_CALENDAR: 'heatmap-calendar',
  TREEMAP: 'treemap',
  GAUGE_KPI: 'gauge-kpi',
  GEO_MAP: 'geo-map',
};

export const FILTER_KEYS = {
  PERIOD: 'period',
  TEAM: 'team',
  GEO: 'geo',
  PARTNER: 'partner',
  TRAFFIC_SOURCE: 'trafficSource',
  STATUS: 'status',
  PRIORITY: 'priority',
  ASSIGNEE: 'assignee',
};

export const TEMPLATE_CATEGORIES = {
  FINANCE: 'finance',
  PARTNER: 'partner',
  OPERATIONS: 'operations',
  EXECUTIVE: 'executive',
  MARKETING: 'marketing',
  AGENTS: 'agents',
  GOALS: 'goals',
  KNOWLEDGE: 'knowledge',
  QUALITY: 'quality',
  PULSE: 'pulse',
};

export const REPORT_TEMPLATES = [
  {
    id: 'tpl-finance-growth',
    name: 'Finance & Growth',
    description:
      'Revenue, spend, profit, ROI, CAC, FTD trends with top contributors and geo breakdown.',
    category: TEMPLATE_CATEGORIES.FINANCE,
    icon: 'AttachMoney',
    audience: ['manager', 'executive', 'partner'],
    sections: [
      { id: 'kpi_cards', type: SECTION_TYPES.KPI_GRID, dataKey: 'kpis', label: 'Key Metrics' },
      {
        id: 'trend_chart',
        type: SECTION_TYPES.LINE_CHART,
        dataKey: 'trends',
        label: 'Monthly Trends',
      },
      {
        id: 'top_partners',
        type: SECTION_TYPES.RANKED_TABLE,
        dataKey: 'topPartners',
        label: 'Top Contributors',
      },
      {
        id: 'revenue_treemap',
        type: SECTION_TYPES.TREEMAP,
        dataKey: 'topPartners',
        label: 'Revenue Mix',
        config: { nameKey: 'name', valueKey: 'revenue', format: 'currency' },
      },
      {
        id: 'geo_breakdown',
        type: SECTION_TYPES.GEO_MAP,
        dataKey: 'geoBreakdown',
        label: 'Geo Breakdown',
        config: { geoKey: 'geo', valueKey: 'revenue', format: 'currency' },
      },
    ],
    filters: [
      FILTER_KEYS.PERIOD,
      FILTER_KEYS.TEAM,
      FILTER_KEYS.GEO,
      FILTER_KEYS.PARTNER,
      FILTER_KEYS.TRAFFIC_SOURCE,
    ],
    exportFormats: ['pdf', 'csv'],
  },
  {
    id: 'tpl-partner-performance',
    name: 'Partner Performance',
    description: 'Per-partner KPIs, funnel status, conversion rates, task completion rates.',
    category: TEMPLATE_CATEGORIES.PARTNER,
    icon: 'People',
    audience: ['manager', 'executive'],
    sections: [
      { id: 'kpi_cards', type: SECTION_TYPES.KPI_GRID, dataKey: 'kpis', label: 'Partner Metrics' },
      {
        id: 'funnel_chart',
        type: SECTION_TYPES.FUNNEL_CHART,
        dataKey: 'funnelBreakdown',
        label: 'Funnel Breakdown',
        config: { stageKey: 'status', valueKey: 'count' },
      },
      {
        id: 'leaderboard',
        type: SECTION_TYPES.RANKED_TABLE,
        dataKey: 'partnerLeaderboard',
        label: 'Partner Leaderboard',
      },
      {
        id: 'trend_chart',
        type: SECTION_TYPES.LINE_CHART,
        dataKey: 'partnerTrends',
        label: 'Performance Over Time',
      },
    ],
    filters: [FILTER_KEYS.PERIOD, FILTER_KEYS.TEAM, FILTER_KEYS.GEO, FILTER_KEYS.STATUS],
    exportFormats: ['pdf', 'csv'],
  },
  {
    id: 'tpl-operations-tasks',
    name: 'Operations & Tasks',
    description: 'Task delivery rates, overdue items, assignee workload, git activity summary.',
    category: TEMPLATE_CATEGORIES.OPERATIONS,
    icon: 'Assignment',
    audience: ['manager', 'executive'],
    sections: [
      { id: 'kpi_cards', type: SECTION_TYPES.KPI_GRID, dataKey: 'kpis', label: 'Operations KPIs' },
      {
        id: 'workload_chart',
        type: SECTION_TYPES.BAR_CHART,
        dataKey: 'workloadByAssignee',
        label: 'Workload by Assignee',
      },
      {
        id: 'overdue_table',
        type: SECTION_TYPES.RANKED_TABLE,
        dataKey: 'overdueItems',
        label: 'Overdue Items',
      },
      {
        id: 'git_activity_heatmap',
        type: SECTION_TYPES.HEATMAP_CALENDAR,
        dataKey: 'gitActivity',
        label: 'Git Activity',
        config: { dateKey: 'date', valueKey: 'commits' },
      },
    ],
    filters: [FILTER_KEYS.PERIOD, FILTER_KEYS.ASSIGNEE, FILTER_KEYS.STATUS, FILTER_KEYS.PRIORITY],
    exportFormats: ['pdf', 'csv'],
  },
  {
    id: 'tpl-executive-summary',
    name: 'Executive Summary',
    description: 'Cross-domain health overview with alerts, recommendations, and key highlights.',
    category: TEMPLATE_CATEGORIES.EXECUTIVE,
    icon: 'Assessment',
    audience: ['executive'],
    sections: [
      { id: 'kpi_cards', type: SECTION_TYPES.KPI_GRID, dataKey: 'kpis', label: 'Executive KPIs' },
      {
        id: 'health_alerts',
        type: SECTION_TYPES.ALERTS_LIST,
        dataKey: 'alerts',
        label: 'Health Alerts',
      },
      {
        id: 'performance_trend',
        type: SECTION_TYPES.LINE_CHART,
        dataKey: 'performanceTrend',
        label: 'Platform Performance',
      },
      {
        id: 'top_movers',
        type: SECTION_TYPES.RANKED_TABLE,
        dataKey: 'topMovers',
        label: 'Top Movers',
      },
    ],
    filters: [FILTER_KEYS.PERIOD, FILTER_KEYS.TEAM],
    exportFormats: ['pdf', 'csv'],
  },
  {
    id: 'tpl-strategy-center',
    name: 'Strategy Center',
    description:
      'Business decomposition KPIs, predictive scenarios, action to KPI mapping, and strategy alerts.',
    category: TEMPLATE_CATEGORIES.EXECUTIVE,
    icon: 'Timeline',
    audience: ['manager', 'executive'],
    sections: [
      {
        id: 'kpi_cards',
        type: SECTION_TYPES.KPI_GRID,
        dataKey: 'strategyKpis',
        label: 'Strategy KPIs',
      },
      {
        id: 'scenarios_chart',
        type: SECTION_TYPES.LINE_CHART,
        dataKey: 'strategyTrends',
        label: 'Scenario Forecast',
      },
      {
        id: 'action_kpi_table',
        type: SECTION_TYPES.RANKED_TABLE,
        dataKey: 'actionKpiRows',
        label: 'Action to KPI Mapping',
      },
      {
        id: 'strategy_alerts',
        type: SECTION_TYPES.ALERTS_LIST,
        dataKey: 'strategyAlerts',
        label: 'Strategy Alerts',
      },
    ],
    filters: [FILTER_KEYS.PERIOD],
    exportFormats: ['pdf', 'csv'],
  },
  {
    id: 'tpl-marketing-acquisition',
    name: 'Marketing & Acquisition',
    description:
      'Campaign performance, acquisition funnels, channel ROI, cost-per-lead, and attribution insights.',
    category: TEMPLATE_CATEGORIES.MARKETING,
    icon: 'Campaign',
    audience: ['manager', 'executive', 'marketing'],
    sections: [
      { id: 'kpi_cards', type: SECTION_TYPES.KPI_GRID, dataKey: 'kpis', label: 'Marketing KPIs' },
      {
        id: 'channel_breakdown',
        type: SECTION_TYPES.BAR_CHART,
        dataKey: 'channelBreakdown',
        label: 'Channel Performance',
      },
      {
        id: 'acquisition_trend',
        type: SECTION_TYPES.LINE_CHART,
        dataKey: 'acquisitionTrends',
        label: 'Acquisition Trends',
      },
      {
        id: 'campaign_table',
        type: SECTION_TYPES.RANKED_TABLE,
        dataKey: 'campaignLeaderboard',
        label: 'Campaign Leaderboard',
      },
    ],
    filters: [FILTER_KEYS.PERIOD, FILTER_KEYS.GEO, FILTER_KEYS.TRAFFIC_SOURCE],
    exportFormats: ['pdf', 'csv'],
  },
  {
    id: 'tpl-agent-performance',
    name: 'Agent Performance',
    description:
      'Agent job throughput, success rate, top performers, and per-stage execution health.',
    category: TEMPLATE_CATEGORIES.AGENTS,
    icon: 'SmartToy',
    audience: ['manager', 'executive'],
    sections: [
      { id: 'kpi_cards', type: SECTION_TYPES.KPI_GRID, dataKey: 'kpis', label: 'Agent KPIs' },
      {
        id: 'agent_trend',
        type: SECTION_TYPES.LINE_CHART,
        dataKey: 'dailyAgentActivity',
        label: 'Jobs Per Day',
      },
      {
        id: 'agent_leaderboard',
        type: SECTION_TYPES.RANKED_TABLE,
        dataKey: 'agentLeaderboard',
        label: 'Top Agents',
      },
      {
        id: 'agent_stages',
        type: SECTION_TYPES.BAR_CHART,
        dataKey: 'agentStageBreakdown',
        label: 'Jobs by Stage',
      },
      {
        id: 'agent_alerts',
        type: SECTION_TYPES.ALERTS_LIST,
        dataKey: 'agentAlerts',
        label: 'Agent Alerts',
      },
    ],
    filters: [FILTER_KEYS.PERIOD],
    exportFormats: ['pdf', 'csv'],
  },
  {
    id: 'tpl-goal-health',
    name: 'Goal Health',
    description: 'Goals in flight, completion velocity, stage funnel, blockers, refinements.',
    category: TEMPLATE_CATEGORIES.GOALS,
    icon: 'Flag',
    audience: ['manager', 'executive'],
    sections: [
      { id: 'kpi_cards', type: SECTION_TYPES.KPI_GRID, dataKey: 'kpis', label: 'Goal KPIs' },
      {
        id: 'goal_funnel',
        type: SECTION_TYPES.FUNNEL_CHART,
        dataKey: 'goalStageFunnel',
        label: 'Stage Funnel',
        config: { stageKey: 'stage', valueKey: 'count' },
      },
      {
        id: 'goal_table',
        type: SECTION_TYPES.RANKED_TABLE,
        dataKey: 'goalLeaderboard',
        label: 'Goal Tracker',
      },
      {
        id: 'goal_alerts',
        type: SECTION_TYPES.ALERTS_LIST,
        dataKey: 'goalAlerts',
        label: 'Goal Alerts',
      },
    ],
    filters: [FILTER_KEYS.PERIOD, FILTER_KEYS.STATUS],
    exportFormats: ['pdf', 'csv'],
  },
  {
    id: 'tpl-knowledge-base',
    name: 'Knowledge Base',
    description: 'Documents ingested, sources, retrieval activity, and ingestion cadence.',
    category: TEMPLATE_CATEGORIES.KNOWLEDGE,
    icon: 'MenuBook',
    audience: ['manager', 'executive'],
    sections: [
      { id: 'kpi_cards', type: SECTION_TYPES.KPI_GRID, dataKey: 'kpis', label: 'Knowledge KPIs' },
      {
        id: 'kb_sources',
        type: SECTION_TYPES.BAR_CHART,
        dataKey: 'kbSourceBreakdown',
        label: 'Docs by Source',
      },
      {
        id: 'kb_top_queries',
        type: SECTION_TYPES.RANKED_TABLE,
        dataKey: 'kbTopQueries',
        label: 'Documents',
      },
      {
        id: 'kb_activity',
        type: SECTION_TYPES.HEATMAP_CALENDAR,
        dataKey: 'dailyKbActivity',
        label: 'Ingestion Activity',
        config: { dateKey: 'date', valueKey: 'count' },
      },
      {
        id: 'kb_alerts',
        type: SECTION_TYPES.ALERTS_LIST,
        dataKey: 'kbAlerts',
        label: 'Knowledge Alerts',
      },
    ],
    filters: [FILTER_KEYS.PERIOD],
    exportFormats: ['pdf', 'csv'],
  },
  {
    id: 'tpl-quality-loop',
    name: 'Quality Loop',
    description: 'Refinement versions, approval rate, top revised deliverables, and cadence.',
    category: TEMPLATE_CATEGORIES.QUALITY,
    icon: 'AutoFixHigh',
    audience: ['manager', 'executive'],
    sections: [
      { id: 'kpi_cards', type: SECTION_TYPES.KPI_GRID, dataKey: 'kpis', label: 'Quality KPIs' },
      {
        id: 'quality_types',
        type: SECTION_TYPES.BAR_CHART,
        dataKey: 'qualityTypeBreakdown',
        label: 'Refinements by Type',
      },
      {
        id: 'quality_top',
        type: SECTION_TYPES.RANKED_TABLE,
        dataKey: 'qualityTopDeliverables',
        label: 'Most Revised Deliverables',
      },
      {
        id: 'quality_trend',
        type: SECTION_TYPES.LINE_CHART,
        dataKey: 'dailyQualityActivity',
        label: 'Refinements per Day',
      },
      {
        id: 'quality_alerts',
        type: SECTION_TYPES.ALERTS_LIST,
        dataKey: 'qualityAlerts',
        label: 'Quality Alerts',
      },
    ],
    filters: [FILTER_KEYS.PERIOD],
    exportFormats: ['pdf', 'csv'],
  },
  {
    id: 'tpl-workspace-pulse',
    name: 'Workspace Pulse',
    description: 'Cross-module digest tying agents, goals, knowledge, partners, and quality.',
    category: TEMPLATE_CATEGORIES.PULSE,
    icon: 'GraphicEq',
    audience: ['executive'],
    sections: [
      { id: 'kpi_cards', type: SECTION_TYPES.KPI_GRID, dataKey: 'kpis', label: 'Module Activity' },
      {
        id: 'platform_activity',
        type: SECTION_TYPES.HEATMAP_CALENDAR,
        dataKey: 'platformActivity',
        label: 'Platform Activity',
        config: { dateKey: 'date', valueKey: 'count', weeks: 26 },
      },
      {
        id: 'module_digest',
        type: SECTION_TYPES.TREEMAP,
        dataKey: 'moduleDigest',
        label: 'Where Activity Lives',
        config: { nameKey: 'module', valueKey: 'value' },
      },
      {
        id: 'pulse_alerts',
        type: SECTION_TYPES.ALERTS_LIST,
        dataKey: 'pulseAlerts',
        label: 'Pulse Alerts',
      },
    ],
    filters: [FILTER_KEYS.PERIOD],
    exportFormats: ['pdf', 'csv'],
  },
];

export function getTemplateById(id) {
  return (
    REPORT_TEMPLATES.find((t) => t.id === id) ||
    loadCustomTemplates().find((t) => t.id === id) ||
    null
  );
}

export function getTemplatesByCategory(category) {
  return REPORT_TEMPLATES.filter((t) => t.category === category);
}

export function matchTemplateByKeywords(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const keywords = {
    'tpl-finance-growth': [
      'finance',
      'growth',
      'revenue',
      'profit',
      'roi',
      'money',
      'spend',
      'cac',
      'ftd',
    ],
    'tpl-partner-performance': ['partner', 'performance', 'funnel', 'conversion', 'leaderboard'],
    'tpl-operations-tasks': [
      'operations',
      'task',
      'workload',
      'overdue',
      'git',
      'delivery',
      'assignee',
    ],
    'tpl-executive-summary': ['executive', 'summary', 'overview', 'health', 'alert', 'highlight'],
    'tpl-marketing-acquisition': [
      'marketing',
      'acquisition',
      'campaign',
      'channel',
      'lead',
      'attribution',
      'ad',
      'advertising',
      'cpl',
      'cpa',
    ],
    'tpl-strategy-center': ['strategy', 'decomposition', 'scenario', 'action', 'forecast'],
    'tpl-agent-performance': [
      'agent',
      'job',
      'execution',
      'pulse lab',
      'prompt lab',
      'success rate',
    ],
    'tpl-goal-health': ['goal', 'milestone', 'objective', 'blocked', 'planning'],
    'tpl-knowledge-base': ['knowledge', 'docs', 'document', 'retrieval', 'ingestion', 'kb', 'wiki'],
    'tpl-quality-loop': ['quality', 'refinement', 'version', 'approval', 'deliverable', 'qa'],
    'tpl-workspace-pulse': [
      'pulse',
      'workspace',
      'overview all',
      'cross domain',
      'digest',
      'everything',
    ],
  };
  let bestMatch = null;
  let bestScore = 0;
  for (const [templateId, kws] of Object.entries(keywords)) {
    const score = kws.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = templateId;
    }
  }
  return bestScore > 0 ? getTemplateById(bestMatch) : REPORT_TEMPLATES[0];
}

const CUSTOM_TEMPLATES_KEY = 'orch_custom_report_templates';

const VALID_SECTION_TYPES = new Set(Object.values(SECTION_TYPES));

/**
 * Validate a custom template's shape before it is saved or previewed. Returns
 * { ok: true } or { ok: false, error } - never throws. Guards against malformed
 * pasted JSON that would otherwise crash the studio's SectionRenderer.
 */
export function validateTemplate(tpl) {
  if (!tpl || typeof tpl !== 'object') return { ok: false, error: 'Template must be an object.' };
  if (!tpl.name || typeof tpl.name !== 'string' || !tpl.name.trim()) {
    return { ok: false, error: 'Template needs a name.' };
  }
  if (!Array.isArray(tpl.sections) || tpl.sections.length === 0) {
    return { ok: false, error: 'Template needs at least one section.' };
  }
  for (let i = 0; i < tpl.sections.length; i += 1) {
    const s = tpl.sections[i];
    if (!s || typeof s !== 'object') {
      return { ok: false, error: `Section ${i + 1} is malformed.` };
    }
    if (!VALID_SECTION_TYPES.has(s.type)) {
      return { ok: false, error: `Section ${i + 1} has an unknown type "${s.type}".` };
    }
    if (!s.dataKey || typeof s.dataKey !== 'string') {
      return { ok: false, error: `Section ${i + 1} is missing a dataKey.` };
    }
  }
  return { ok: true };
}

export function loadCustomTemplates() {
  try {
    const raw = localStorage.getItem(CUSTOM_TEMPLATES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomTemplate(template) {
  const check = validateTemplate(template);
  if (!check.ok) {
    throw new Error(check.error);
  }
  const existing = loadCustomTemplates();
  const idx = existing.findIndex((t) => t.id === template.id);
  if (idx >= 0) {
    existing[idx] = { ...template, updatedAt: new Date().toISOString() };
  } else {
    existing.push({ ...template, createdAt: new Date().toISOString() });
  }
  localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(existing));
  return existing;
}

export function deleteCustomTemplate(templateId) {
  const existing = loadCustomTemplates().filter((t) => t.id !== templateId);
  localStorage.setItem(CUSTOM_TEMPLATES_KEY, JSON.stringify(existing));
  return existing;
}

export function getAllTemplates() {
  return [...REPORT_TEMPLATES, ...loadCustomTemplates()];
}
