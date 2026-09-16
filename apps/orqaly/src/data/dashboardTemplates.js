// Template categories for /instruments/dashboards gallery previews

export const TEMPLATE_CATEGORIES = [
  {
    id: 'ai-costs',
    title: 'AI Costs',
    blurb: 'Spend by model, cost per agent, monthly burn.',
    tint: '#10B981',
    kpis: [
      { label: 'Total spend', value: '$4.2k', delta: '+12%', up: false },
      { label: 'Cost / run', value: '$0.18', delta: '-4%', up: true },
      { label: 'Top model', value: 'GPT-4o', delta: '48%', up: null },
      { label: 'Monthly burn', value: '$14.1k', delta: '+8%', up: false },
    ],
    preview: {
      barTitle: 'Spend by model',
      bars: [
        { label: 'GPT-4o', value: 48 },
        { label: 'Claude', value: 32 },
        { label: 'Groq', value: 14 },
        { label: 'Other', value: 6 },
      ],
      lineTitle: 'Monthly burn',
      linePoints: [18, 22, 20, 26, 24, 30, 28, 34, 32, 38],
    },
  },
  {
    id: 'marketing',
    title: 'Marketing',
    blurb: 'Leads, ROI, funnel, acquisition cost.',
    tint: '#6366F1',
    kpis: [
      { label: 'Leads', value: '142', delta: '+24%', up: true },
      { label: 'CAC', value: '$38', delta: '-6%', up: true },
      { label: 'ROI', value: '3.4×', delta: '+0.4', up: true },
    ],
    preview: {
      funnelTitle: 'Conversion funnel',
      funnel: [
        { label: 'Visitors', value: '12.4k', pct: 100 },
        { label: 'Leads', value: '1.2k', pct: 72 },
        { label: 'Qualified', value: '340', pct: 48 },
        { label: 'Won', value: '89', pct: 28 },
      ],
      channelTitle: 'ROI by channel',
      channels: [
        { label: 'Organic', value: 92 },
        { label: 'Paid social', value: 68 },
        { label: 'Email', value: 54 },
        { label: 'Referral', value: 41 },
      ],
    },
  },
  {
    id: 'operational',
    title: 'Operational',
    blurb: 'Tasks, cycle time, SLA, throughput.',
    tint: '#F59E0B',
    kpis: [
      { label: 'Completed', value: '89%', delta: '+3%', up: true },
      { label: 'Cycle time', value: '2.1d', delta: '-0.4d', up: true },
      { label: 'SLA breaches', value: '3', delta: '-2', up: true },
    ],
    preview: {
      lineTitle: 'Throughput (tasks / day)',
      linePoints: [42, 48, 45, 52, 58, 55, 62, 68, 64, 72],
      statusTitle: 'SLA health',
      statuses: [
        { label: 'On track', count: 124, tone: 'ok' },
        { label: 'At risk', count: 18, tone: 'warn' },
        { label: 'Breached', count: 3, tone: 'bad' },
      ],
    },
  },
  {
    id: 'accountant',
    title: 'Accountant',
    blurb: 'Revenue, MRR, expenses, 85/15 payouts.',
    tint: '#0EA5E9',
    kpis: [
      { label: 'MRR', value: '$125k', delta: '+9%', up: true },
      { label: 'Expenses', value: '$41k', delta: '+2%', up: false },
      { label: 'Payouts', value: '$18k', delta: '+14%', up: true },
    ],
    preview: {
      compareTitle: 'Revenue vs expenses',
      compare: [
        { label: 'Jan', revenue: 98, expense: 36 },
        { label: 'Feb', revenue: 104, expense: 38 },
        { label: 'Mar', revenue: 112, expense: 39 },
        { label: 'Apr', revenue: 125, expense: 41 },
      ],
      splitTitle: 'Creator payouts',
      split: { creator: 85, platform: 15, amount: '$18k' },
    },
  },
  {
    id: 'partners',
    title: 'Partners',
    blurb: 'Top partners, funnel status, deals in flight.',
    tint: '#EC4899',
    kpis: [
      { label: 'Top partner', value: 'Acme', delta: null, up: null },
      { label: 'In flight', value: '12', delta: '+3', up: true },
      { label: 'Win rate', value: '34%', delta: '+2%', up: true },
    ],
    preview: {
      pipelineTitle: 'Deal pipeline',
      pipeline: [
        { label: 'Lead', count: 8 },
        { label: 'Active', count: 12 },
        { label: 'Won', count: 5 },
      ],
      partnersTitle: 'Top partners by revenue',
      partners: [
        { name: 'Acme Corp', value: 92 },
        { name: 'Nova Labs', value: 74 },
        { name: 'Brightline', value: 58 },
      ],
    },
  },
  {
    id: 'custom',
    title: 'Custom',
    blurb: 'Blank canvas or anything you can describe.',
    tint: '#94A3B8',
    kpis: [
      { label: 'Blocks', value: '0', delta: null, up: null },
      { label: 'Data sources', value: 'Any', delta: null, up: null },
      { label: 'Start', value: 'Prompt', delta: null, up: null },
    ],
    preview: {
      prompt: 'Describe your dashboard in plain English…',
      ghosts: ['KPI', 'Chart', 'Table', 'Trend'],
    },
  },
];
