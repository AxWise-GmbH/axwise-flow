/**
 * Strategy service — Business decomposition, Action→KPI mapping, KPI engineering,
 * predictive scenarios, AI recommendation, ROI model, executive summary.
 * Uses partners, projects, workflows data.
 */
import { partnerService } from './partnerService';
import { getAllProjects } from './projectService';
import { getAllWorkflows } from './workflowService';
import {
  getCampaignMetricsForPeriod,
  getFinanceSummary,
  getFinanceForPeriod,
} from '../pages/Partners/utils/periodMetrics';

const round2 = (n) => Number(Number(n || 0).toFixed(2));

function computeMetrics(partners, period) {
  const base = {
    totalPartners: partners.length,
    activePartners: partners.filter((p) => p.funnelStatus === 'Working').length,
    totalFtd: 0,
    totalClicks: 0,
    totalSpend: 0,
    totalRevenue: 0,
    totalFinance: 0,
    totalDebt: 0,
  };
  partners.forEach((partner) => {
    const campaigns = partner.campaigns || [];
    const pm = campaigns.reduce(
      (acc, c) => {
        const m = getCampaignMetricsForPeriod(c, period);
        acc.ftd += Number(m.ftd || 0);
        acc.clicks += Number(m.clicks || 0);
        acc.spend += Number(c.spend || 0);
        acc.revenue += Number(c.revenue || 0);
        return acc;
      },
      { ftd: 0, clicks: 0, spend: 0, revenue: 0 }
    );
    const finance = getFinanceForPeriod(partner, getFinanceSummary(partner), period);
    base.totalFtd += pm.ftd;
    base.totalClicks += pm.clicks;
    base.totalSpend += pm.spend;
    base.totalRevenue += pm.revenue;
    base.totalFinance += Number(finance.total || 0);
    base.totalDebt += Number(finance.debt || 0);
  });
  const roi =
    base.totalSpend > 0 ? ((base.totalRevenue - base.totalSpend) / base.totalSpend) * 100 : 0;
  const cr = base.totalClicks > 0 ? (base.totalFtd / base.totalClicks) * 100 : 0;
  const cac = base.totalFtd > 0 ? base.totalSpend / base.totalFtd : 0;
  return { ...base, roi, cr, cac, profit: round2(base.totalRevenue - base.totalSpend) };
}

export function getBusinessDecomposition(partners, projects, workflows) {
  const totalRevenue = partners.reduce(
    (s, p) => s + (p.campaigns || []).reduce((a, c) => a + Number(c.revenue || 0), 0),
    0
  );
  const totalSpend = partners.reduce(
    (s, p) => s + (p.campaigns || []).reduce((a, c) => a + Number(c.spend || 0), 0),
    0
  );
  const totalFtd = partners.reduce(
    (s, p) => s + (p.campaigns || []).reduce((a, c) => a + Number(c.ftd || 0), 0),
    0
  );
  const totalDebt = partners.reduce((s, p) => s + Number(p.finance?.debt || 0), 0);
  const activeWorkflows = workflows.filter((w) => w.enabled !== false).length;
  const activePartners = partners.filter((p) => p.funnelStatus === 'Working').length;
  const totalCampaigns = partners.reduce((s, p) => s + (p.campaigns || []).length, 0);
  const totalTasks = partners.reduce((s, p) => s + (p.tasks || []).length, 0);

  const valueDrivers = [];
  if (totalFtd > 0) valueDrivers.push('FTD volume');
  if (totalCampaigns > 0 && totalFtd > 0) valueDrivers.push('Conversion rate (CR)');
  if (totalSpend > 0 && totalFtd > 0) valueDrivers.push('ROI per partner');
  if (activePartners > 0) valueDrivers.push('Partner retention');
  if (totalCampaigns > 0) valueDrivers.push('Campaign performance');
  if (valueDrivers.length === 0)
    valueDrivers.push('FTD volume', 'Conversion rate (CR)', 'ROI per partner');

  const revenueLevers = [];
  if (partners.length > 0) revenueLevers.push('New partners onboarded');
  if (totalFtd > 0) revenueLevers.push('FTD growth');
  if (totalRevenue > 0) revenueLevers.push('Revshare revenue share', 'CPL payouts');
  if (totalCampaigns > 0) revenueLevers.push('Campaign scaling');
  if (revenueLevers.length === 0) revenueLevers.push('FTD growth', 'Campaign scaling');

  const costDrivers = [];
  if (totalSpend > 0) costDrivers.push('Marketing spend', 'CAC');
  if (totalDebt > 0) costDrivers.push('Partner payouts');
  costDrivers.push('Overhead');
  if (totalCampaigns > 0) costDrivers.push('Campaign waste');

  const constraints = [];
  if (activePartners < partners.length && partners.length > 0) constraints.push('Partner capacity');
  if (totalCampaigns > 0) constraints.push('Traffic volume');
  constraints.push('Budget');
  if (activeWorkflows < workflows.length && workflows.length > 0)
    constraints.push('Workflow throughput');
  if (totalTasks > 0) constraints.push('Team capacity');
  if (constraints.length === 0) constraints.push('Partner capacity', 'Budget');

  const leadingIndicators = [];
  if (totalCampaigns > 0) leadingIndicators.push('Clicks');
  if (totalTasks > 0) leadingIndicators.push('Task completion rate');
  const meetingsCount = partners.reduce((s, p) => s + (p.meetings || []).length, 0);
  if (meetingsCount > 0) leadingIndicators.push('Meeting scheduled');
  leadingIndicators.push('Landing page views', 'Proposal sent');
  leadingIndicators.length = Math.min(5, leadingIndicators.length);

  const laggingIndicators = [];
  if (totalRevenue > 0) laggingIndicators.push('Revenue');
  if (totalFtd > 0) laggingIndicators.push('FTD');
  if (totalSpend > 0) laggingIndicators.push('ROI', 'Profit');
  if (totalDebt > 0) laggingIndicators.push('Debt');
  laggingIndicators.push('Churn');
  if (laggingIndicators.length === 0) laggingIndicators.push('Revenue', 'FTD', 'ROI', 'Profit');

  return {
    valueDrivers,
    revenueLevers,
    costDrivers,
    constraints,
    leadingIndicators,
    laggingIndicators,
    summary: {
      totalPartners: partners.length,
      totalProjects: projects.length,
      totalWorkflows: workflows.length,
      activeWorkflows,
      totalRevenue: round2(totalRevenue),
      totalSpend: round2(totalSpend),
      totalFtd,
    },
  };
}

export function getActionKpiMapping(partners, projects) {
  const totalTasks = partners.reduce((s, p) => s + (p.tasks || []).length, 0);
  const doneTasks = partners.reduce(
    (s, p) => s + (p.tasks || []).filter((t) => t.status === 'done').length,
    0
  );
  const totalCampaigns = partners.reduce((s, p) => s + (p.campaigns || []).length, 0);
  const taskRate = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0;
  const activePartners = partners.filter((p) => p.funnelStatus === 'Working').length;

  const rows = [];
  rows.push({
    action: 'Add partner',
    directKpi: 'Active partners',
    indirectKpi: 'FTD capacity',
    revenueImpact: 'High',
    marginImpact: 'Neutral',
    retentionImpact: 'Low',
  });
  if (totalCampaigns > 0 || partners.length > 0)
    rows.push({
      action: 'Run campaign',
      directKpi: 'FTD, Clicks',
      indirectKpi: 'Revenue, CAC',
      revenueImpact: 'High',
      marginImpact: 'Variable',
      retentionImpact: 'Medium',
    });
  if (totalTasks > 0)
    rows.push({
      action: 'Complete task',
      directKpi: `Task completion rate (${doneTasks}/${totalTasks})`,
      indirectKpi: 'Partner velocity',
      revenueImpact: 'Medium',
      marginImpact: 'Low',
      retentionImpact: 'High',
    });
  if (projects.length > 0 || partners.length > 0)
    rows.push({
      action: 'Create project',
      directKpi: 'Project count',
      indirectKpi: 'Partner–workflow links',
      revenueImpact: 'Medium',
      marginImpact: 'Low',
      retentionImpact: 'Medium',
    });
  rows.push({
    action: 'Enable workflow',
    directKpi: 'Workflow throughput',
    indirectKpi: 'Conversion funnel',
    revenueImpact: 'High',
    marginImpact: 'High',
    retentionImpact: 'Medium',
  });
  if (partners.length > 0)
    rows.push({
      action: 'Record meeting',
      directKpi: 'Engagement',
      indirectKpi: 'Retention',
      revenueImpact: 'Medium',
      marginImpact: 'Low',
      retentionImpact: 'High',
    });

  return { rows, stats: { totalTasks, doneTasks, totalCampaigns, taskRate, activePartners } };
}

export function getKpiEngineering(currentMetrics) {
  const m = currentMetrics || {};
  const cac = m.cac ?? (m.totalFtd > 0 && m.totalSpend > 0 ? m.totalSpend / m.totalFtd : null);
  const cr = m.cr ?? null;
  const roi = m.roi ?? null;
  const ftdPerPartner = m.activePartners > 0 ? round2((m.totalFtd || 0) / m.activePartners) : null;

  const kpis = [
    {
      name: 'Customer Acquisition Cost (CAC)',
      formula: 'Total Marketing Spend / New FTD',
      value: cac != null ? round2(cac) : null,
      drivers: ['CPC', 'Conversion Rate', 'Sales Cycle'],
      sources: ['partners.campaigns.spend', 'partners.campaigns.ftd'],
      sensitivity:
        m.totalFtd > 0 ? `Current: ${round2(cac || 0)} per FTD` : 'Compute from spend and FTD',
      levers: ['Optimize creatives', 'Improve landing pages', 'Target better geo'],
    },
    {
      name: 'Conversion Rate (CR%)',
      formula: '(FTD / Clicks) × 100',
      value: cr != null ? round2(cr) : null,
      drivers: ['Landing quality', 'Offer relevance', 'Traffic quality'],
      sources: ['partners.campaigns.ftd', 'partners.campaigns.clicks'],
      sensitivity: m.totalClicks > 0 ? `Current: ${round2(cr || 0)}%` : 'Requires clicks data',
      levers: ['A/B test landings', 'Segment traffic', 'Refine offers'],
    },
    {
      name: 'Return on Investment (ROI%)',
      formula: '((Revenue − Spend) / Spend) × 100',
      value: roi != null ? round2(roi) : null,
      drivers: ['Revenue per FTD', 'Spend efficiency', 'Partner mix'],
      sources: ['partners.campaigns.revenue', 'partners.campaigns.spend'],
      sensitivity: m.totalSpend > 0 ? `Current: ${round2(roi || 0)}%` : 'Requires spend data',
      levers: ['Scale winners', 'Cut losers', 'Renegotiate revshare'],
    },
    {
      name: 'FTD per Active Partner',
      formula: 'Total FTD / Active Partners',
      value: ftdPerPartner,
      drivers: ['Partner activity', 'Campaign count', 'Traffic volume'],
      sources: ['partners', 'partners.campaigns.ftd'],
      sensitivity:
        m.activePartners > 0 ? `Current: ${ftdPerPartner ?? 0} FTD/partner` : 'No active partners',
      levers: ['Onboard more', 'Activate idle', 'Improve support'],
    },
  ];
  return { kpis };
}

export function getPredictiveScenarios(partners, currentMetrics) {
  const m = currentMetrics || { totalRevenue: 0, totalSpend: 0, roi: 0, totalFtd: 0 };
  const baseRev = round2(m.totalRevenue || 0);
  const baseSpend = round2(m.totalSpend || 0);
  const baseProfit = round2(baseRev - baseSpend);
  const baseFtd = m.totalFtd || 0;

  return {
    period: '6–12 months',
    scenarios: [
      {
        name: 'Conservative',
        revenue: round2(baseRev * 0.9),
        spend: round2(baseSpend * 1.05),
        profit: round2(baseRev * 0.9 - baseSpend * 1.05),
        ftd: Math.round(baseFtd * 0.85),
        assumptions: 'CR −5%, CAC +5%, 15% partner churn',
      },
      {
        name: 'Base',
        revenue: baseRev,
        spend: baseSpend,
        profit: baseProfit,
        ftd: baseFtd,
        assumptions: 'Current run rate, no major change',
      },
      {
        name: 'Aggressive',
        revenue: round2(baseRev * 1.2),
        spend: round2(baseSpend * 1.1),
        profit: round2(baseRev * 1.2 - baseSpend * 1.1),
        ftd: Math.round(baseFtd * 1.25),
        assumptions: 'CR +0.5%, +2 partners, workflow scaling',
      },
    ],
  };
}

export function getAiRecommendation(partners, projects, workflows, currentMetrics, scenarios) {
  const m = currentMetrics || {};
  const partnerCount = partners?.length ?? 0;
  const projectCount = projects?.length ?? 0;
  const workflowCount = workflows?.length ?? 0;
  const base = scenarios?.scenarios?.find((s) => s.name === 'Base');
  const aggressive = scenarios?.scenarios?.find((s) => s.name === 'Aggressive');
  const upsidePct =
    base?.profit > 0 && aggressive?.profit != null
      ? round2(((aggressive.profit - base.profit) / base.profit) * 100)
      : null;

  const integrations = [];
  if (partnerCount > 0) integrations.push(`Supabase (${partnerCount} partners)`);
  if (projectCount > 0) integrations.push(`Projects (${projectCount})`);
  if (workflowCount > 0) integrations.push(`Workflows (${workflowCount})`);
  integrations.push('Resend (email)', 'Keitaro (campaigns)');
  if (integrations.length === 0) integrations.push('Supabase', 'Resend', 'Keitaro');

  const roiEstimate =
    upsidePct != null && upsidePct > 0
      ? `Aggressive scenario: +${upsidePct}% profit vs base. Potential uplift from workflow scaling and CR optimization.`
      : m.totalRevenue > 0 || m.totalFtd > 0
        ? '15–25% efficiency gain on CAC/CR optimization; 10–20% revenue uplift from better prioritization.'
        : 'Add partners and campaigns to derive data-driven ROI estimates.';

  return {
    architecture:
      'Data ingestion (partners, campaigns, projects) → KPI aggregation → Model layer (forecasting, causal inference) → Output (recommendations, alerts)',
    integrations,
    models:
      m.totalRevenue > 0 || m.totalFtd > 0
        ? [
            'Time-series forecasting (revenue, FTD)',
            'Anomaly detection (CR, ROI)',
            'Causal inference (action → outcome)',
          ]
        : ['Time-series forecasting', 'Causal inference'],
    dashboardDesign:
      'Strategy Center blocks: decomposition, action–KPI matrix, scenarios, ROI model. Link to Notification Center for alerts.',
    automationPotential:
      m.totalPartners > 0
        ? 'Auto-generate scenarios from trends; suggest action priorities; trigger alerts on threshold breach.'
        : 'Add partners to enable scenario forecasting.',
    roiEstimate,
  };
}

export function getRoiModel(currentMetrics, scenarios) {
  const m = currentMetrics || {};
  const base = scenarios?.scenarios?.find((s) => s.name === 'Base');
  const aggressive = scenarios?.scenarios?.find((s) => s.name === 'Aggressive');
  const annualBenefitRaw =
    base?.profit != null && aggressive?.profit != null
      ? Math.max(0, (aggressive.profit - base.profit) * 12)
      : m.profit != null
        ? Math.max(0, m.profit * 12)
        : 45000;
  const implementationCost = 12000;
  const annualBenefit = Math.max(annualBenefitRaw, 1000);
  const paybackMonths = annualBenefit > 0 ? round2((implementationCost / annualBenefit) * 12) : 999;
  const npv3y = round2(annualBenefit * 3);

  const risks = [];
  if ((m.totalPartners || 0) < 3) risks.push('Partner dependency');
  if ((m.totalFtd || 0) === 0 && (m.totalSpend || 0) > 0) risks.push('No FTD yet');
  if ((m.cr || 0) < 1 && (m.totalClicks || 0) > 0) risks.push('Low conversion');
  if ((m.roi || 0) < 0 && (m.totalSpend || 0) > 0) risks.push('Negative ROI');
  risks.push('Data quality gaps', 'Adoption lag');
  risks.length = Math.min(5, risks.length);

  return {
    implementationCost,
    annualBenefit: round2(annualBenefit),
    paybackMonths,
    npv3y,
    risks,
  };
}

export function getExecutiveSummary(decomposition, scenarios, roi, currentMetrics) {
  const base = scenarios?.scenarios?.find((s) => s.name === 'Base');
  const m = currentMetrics || {};
  const summary = decomposition?.summary || {};

  let bottleneck = 'Partner capacity';
  if ((m.roi || 0) < 0 && (m.totalSpend || 0) > 0) bottleneck = 'Spend efficiency (negative ROI)';
  else if ((m.cr || 0) < 1 && (m.totalClicks || 0) > 100) bottleneck = 'Conversion rate';
  else if (
    (summary.activeWorkflows || 0) < (summary.totalWorkflows || 1) &&
    (summary.totalWorkflows || 0) > 0
  )
    bottleneck = 'Workflow activation';
  else if ((m.activePartners || 0) < (m.totalPartners || 1) && (m.totalPartners || 0) > 0)
    bottleneck = 'Partner activation';

  let leverageKpi = 'Conversion rate (CR%)';
  if ((m.roi || 0) < 0) leverageKpi = 'ROI%';
  else if ((m.cr || 0) < 0.5) leverageKpi = 'CR%';
  else if ((m.totalFtd || 0) < 10) leverageKpi = 'FTD volume';

  const valueProposition =
    (summary.totalPartners || 0) > 0
      ? 'AI-driven Strategy Center uses your partners, campaigns, and workflows to predict outcomes and recommend optimizations.'
      : 'Add partners and campaigns to get data-driven strategy insights and predictions.';

  return {
    bottleneck,
    leverageKpi,
    predictedUpside: base
      ? `Base: $${round2(base.revenue)} revenue, $${round2(base.profit)} profit`
      : 'Run scenarios to see projections',
    valueProposition,
  };
}

function buildPeriod(periodKey) {
  if (!periodKey) {
    const d = new Date();
    return {
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`,
    };
  }
  // YYYY-MM
  const m1 = String(periodKey).match(/^(\d{4})-(\d{2})$/);
  if (m1) {
    const year = Number(m1[1]);
    const month = Number(m1[2]);
    return { month, year, key: periodKey, label: `${m1[2]}/${m1[1]}` };
  }
  // MM/YYYY
  const m2 = String(periodKey).match(/^(\d{2})\/(\d{4})$/);
  if (m2) {
    const month = Number(m2[1]);
    const year = Number(m2[2]);
    return { month, year, key: `${year}-${m2[1]}`, label: periodKey };
  }
  return buildPeriod(null);
}

export async function getStrategyData(periodKey = null) {
  const [partners, projects, workflows] = await Promise.all([
    partnerService.getAll(),
    getAllProjects(),
    getAllWorkflows(),
  ]);
  const period = buildPeriod(periodKey);
  const currentMetrics = computeMetrics(partners, period);
  const decomposition = getBusinessDecomposition(partners, projects, workflows);
  const actionKpi = getActionKpiMapping(partners, projects);
  const scenarios = getPredictiveScenarios(partners, currentMetrics);
  const kpiEng = getKpiEngineering(currentMetrics);
  const roi = getRoiModel(currentMetrics, scenarios);
  const aiRec = getAiRecommendation(partners, projects, workflows, currentMetrics, scenarios);
  const summary = getExecutiveSummary(decomposition, scenarios, roi, currentMetrics);

  return {
    decomposition,
    actionKpi,
    kpiEng,
    scenarios,
    aiRec,
    roi,
    summary,
    currentMetrics,
  };
}
