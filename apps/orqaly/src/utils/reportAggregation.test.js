import { describe, it, expect } from 'vitest';
import { aggregateReport, SUPPORTED_REPORT_TYPES } from './reportAggregation';

const sampleDatasets = () => ({
  partners: [
    {
      name: 'Acme',
      revenue: 1000,
      spend: 400,
      ftd: 20,
      clicks: 500,
      geo: 'US',
      trafficSource: 'FB',
      funnelStatus: 'Working',
      tasks: [
        { assignedTo: 'Sam', status: 'done' },
        { assignedTo: 'Sam', status: 'open', deadline: '2000-01-01' },
      ],
    },
    {
      name: 'Beta',
      revenue: 200,
      spend: 500,
      ftd: 3,
      clicks: 100,
      geo: 'DE',
      trafficSource: 'Google',
      funnelStatus: 'At Risk',
      tasks: [],
    },
  ],
  projects: [{ id: 'p1', status: 'active' }],
  pushes: [{ pushed_at: '2026-06-01T00:00:00Z' }],
  agentJobs: [
    { id: 'j1', status: 'completed', agent_name: 'Scout', stage: 'plan', created_at: '2026-06-20' },
    { id: 'j2', status: 'failed', agent_name: 'Scout', stage: 'exec', created_at: '2026-06-20' },
  ],
  goals: [
    { id: 'g1', title: 'Ship', status: 'active', stage: 'execution' },
    {
      id: 'g2',
      title: 'Done',
      status: 'completed',
      created_at: '2026-06-01',
      completed_at: '2026-06-02',
    },
  ],
  kbDocs: [{ id: 'd1', title: 'Doc', source: 'notion', status: 'active' }],
  deliverableVersions: [
    { id: 'v1', deliverable_id: 'x', deliverable_type: 'copy', approved: true },
    { id: 'v2', deliverable_id: 'x', deliverable_type: 'copy', approved: false },
  ],
  dashboards: [{ id: 'db1', name: 'Main' }],
  strategySnapshots: [
    {
      created_at: '2026-06-20',
      payload: {
        currentMetrics: { totalRevenue: 1200, totalSpend: 900, roi: 33, totalFtd: 23, profit: 300 },
        roi: { paybackMonths: 6, npv3y: 9000, risks: ['Partner dependency'] },
        scenarios: {
          scenarios: [
            { name: 'Base', revenue: 1200, profit: 300, ftd: 23, assumptions: 'run rate' },
            { name: 'Aggressive', revenue: 1440, profit: 480, ftd: 29, assumptions: 'scale' },
          ],
        },
        summary: { bottleneck: 'Conversion rate', leverageKpi: 'CR%' },
      },
    },
  ],
});

// dataKeys each template's sections reference (must be present + populated).
const EXPECTED_KEYS = {
  'tpl-finance-growth': ['kpis', 'topPartners', 'geoBreakdown'],
  'tpl-partner-performance': ['kpis', 'funnelBreakdown', 'partnerLeaderboard'],
  'tpl-operations-tasks': ['kpis', 'workloadByAssignee', 'gitActivity'],
  'tpl-executive-summary': ['kpis', 'alerts', 'topMovers'],
  'tpl-agent-performance': [
    'kpis',
    'agentLeaderboard',
    'agentStageBreakdown',
    'dailyAgentActivity',
    'agentAlerts',
  ],
  'tpl-goal-health': ['kpis', 'goalStageFunnel', 'goalLeaderboard', 'goalAlerts'],
  'tpl-knowledge-base': ['kpis', 'kbSourceBreakdown', 'kbTopQueries', 'dailyKbActivity'],
  'tpl-quality-loop': ['kpis', 'qualityTypeBreakdown', 'qualityTopDeliverables'],
  'tpl-workspace-pulse': ['kpis', 'moduleDigest', 'platformActivity'],
  'tpl-marketing-acquisition': ['kpis', 'channelBreakdown', 'campaignLeaderboard'],
  'tpl-strategy-center': [
    'kpis',
    'strategyKpis',
    'strategyTrends',
    'actionKpiRows',
    'strategyAlerts',
  ],
};

describe('aggregateReport', () => {
  it('supports exactly the 11 built-in templates', () => {
    expect(SUPPORTED_REPORT_TYPES).toHaveLength(11);
  });

  it.each(Object.keys(EXPECTED_KEYS))(
    'produces template-specific KPIs + dataKeys for %s',
    (type) => {
      const payload = aggregateReport(type, sampleDatasets());
      expect(Array.isArray(payload.kpis)).toBe(true);
      expect(payload.kpis.length).toBeGreaterThan(0);
      for (const key of EXPECTED_KEYS[type]) {
        expect(payload[key], `${type} should populate ${key}`).toBeDefined();
      }
    }
  );

  it('never returns the executive KPI set for a module template', () => {
    const exec = aggregateReport('tpl-executive-summary', sampleDatasets()).kpis.map(
      (k) => k.label
    );
    const agent = aggregateReport('tpl-agent-performance', sampleDatasets()).kpis.map(
      (k) => k.label
    );
    expect(agent).not.toEqual(exec);
    expect(agent).toContain('Success Rate');
  });

  it('derives marketing channels from partner trafficSource', () => {
    const payload = aggregateReport('tpl-marketing-acquisition', sampleDatasets());
    const channels = payload.channelBreakdown.map((c) => c.channel);
    expect(channels).toContain('FB');
    expect(channels).toContain('Google');
  });

  it('reads strategy KPIs from the latest snapshot payload, not fabricated', () => {
    const payload = aggregateReport('tpl-strategy-center', sampleDatasets());
    expect(payload.strategyTrends.map((r) => r.scenario)).toEqual(['Base', 'Aggressive']);
    expect(payload.kpis.find((k) => k.label === 'Revenue').value).toBe(1200);
  });

  it('handles empty datasets without throwing and shows honest empty state', () => {
    const empty = {
      partners: [],
      projects: [],
      pushes: [],
      agentJobs: [],
      goals: [],
      kbDocs: [],
      deliverableVersions: [],
      dashboards: [],
      strategySnapshots: [],
    };
    for (const type of SUPPORTED_REPORT_TYPES) {
      const payload = aggregateReport(type, empty);
      expect(Array.isArray(payload.kpis)).toBe(true);
    }
    // Strategy with no snapshot must flag the missing snapshot, not invent data.
    const strat = aggregateReport('tpl-strategy-center', empty);
    expect(strat.strategyTrends).toEqual([]);
    expect(strat.strategyAlerts[0].title).toMatch(/no strategy snapshot/i);
  });
});
