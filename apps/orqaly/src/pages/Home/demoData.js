/**
 * Deterministic demo dataset for the Home dashboard.
 *
 * The "Demo data" switch renders these curated, fully-populated numbers so the
 * page looks complete regardless of account activity. Everything is
 * deterministic (a seeded PRNG + a fixed base date, no Date.now / Math.random)
 * so snapshot tests stay stable. A `seed` (the selected org index) varies the
 * numbers so switching organizations shows different data.
 */

// Fixed anchor so day labels never drift between runs or test environments.
const BASE_DATE = '2026-06-26';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Jun 20" style label for `offset` days before the base date (locale-independent). */
function dayLabel(offset) {
  const d = new Date(`${BASE_DATE}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - offset);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** Small seeded PRNG (mulberry32) so demo series look varied yet reproducible. */
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A wavy series of `n` integers around `base` with +/- `spread` jitter. */
function series(seed, n, base, spread) {
  const rng = makeRng(seed);
  return Array.from({ length: n }, (_, i) => {
    const wave = Math.sin((i / n) * Math.PI * 2) * spread * 0.4;
    const noise = (rng() - 0.5) * spread;
    return Math.max(0, Math.round(base + wave + noise));
  });
}

/**
 * Three example organizations (a holding + two children) with per-org metrics
 * and hierarchy, so the selector visibly switches data in demo mode.
 */
export function buildDemoOrgs() {
  return [
    {
      id: 'demo-holding',
      name: 'Orchestratori Holding',
      org_type: 'holding',
      industry: 'Conglomerate',
      parent_id: null,
      consilium_id: 'demo-board-holding',
      metrics: {
        units: 2,
        teams: 12,
        consilium: 1,
        agents: 48,
        tools: 22,
        tasks: 164,
        roi: 23.1,
        invested: 5700000,
      },
    },
    {
      id: 'demo-ecom',
      name: 'E-Commerce Division',
      org_type: 'division',
      industry: 'Retail',
      parent_id: 'demo-holding',
      consilium_id: 'demo-board-ecom',
      metrics: {
        units: 1,
        teams: 5,
        consilium: 1,
        agents: 18,
        tools: 14,
        tasks: 72,
        roi: 31.4,
        invested: 2400000,
      },
    },
    {
      id: 'demo-fintech',
      name: 'Fintech Subsidiary',
      org_type: 'subsidiary',
      industry: 'Finance',
      parent_id: 'demo-holding',
      consilium_id: 'demo-board-fintech',
      metrics: {
        units: 1,
        teams: 7,
        consilium: 1,
        agents: 24,
        tools: 16,
        tasks: 96,
        roi: 18.7,
        invested: 3300000,
      },
    },
  ];
}

/** Build the dense-section demo snapshot. `seed` (org index) shifts the numbers. */
export function buildDemoData(windowDays = 7, seed = 0) {
  const n = Math.max(2, windowDays);
  const off = (seed | 0) * 23; // series offset so each org looks different
  const scale = 1 + (Math.abs(seed | 0) % 4) * 0.14; // headline multiplier per org
  const sc = (v) => Math.round(v * scale);

  const goalsSeries = series(11 + off, n, 150 * scale, 60);
  const loopsSeries = series(22 + off, n, 95 * scale, 40);
  const activitySeries = series(33 + off, n, 60 * scale, 25);
  const chatSeries = series(44 + off, n, 42 * scale, 18);
  const llmSeries = series(55 + off, n, 120 * scale, 50);

  const performance = {
    lines: ['Goals', 'Loops', 'Activity', 'Chat', 'LLM'],
    data: Array.from({ length: n }, (_, i) => {
      const offset = n - 1 - i;
      return {
        date: dayLabel(offset),
        Goals: goalsSeries[i],
        Loops: loopsSeries[i],
        Activity: activitySeries[i],
        Chat: chatSeries[i],
        LLM: llmSeries[i],
      };
    }),
  };

  const kpis = [
    {
      label: 'Total Revenue',
      value: sc(24800000),
      format: 'currencyCompact',
      change: 12.6,
      series: series(1 + off, 12, 180, 70),
    },
    {
      label: 'Active Agents',
      value: 68.5,
      format: 'percent',
      change: 8.3,
      series: series(2 + off, 12, 60, 12),
    },
    {
      label: 'Open Tasks',
      value: sc(1284),
      format: 'number',
      change: 15.7,
      series: series(3 + off, 12, 140, 40),
    },
    {
      label: 'Cost Save',
      value: sc(5700000),
      format: 'currencyCompact',
      change: 23.1,
      series: series(4 + off, 12, 120, 35),
    },
    {
      label: 'Error Rate',
      value: 0.38,
      format: 'percent',
      change: -4.2,
      series: series(5 + off, 12, 12, 6),
    },
    {
      label: 'Running Agents',
      value: sc(24),
      format: 'number',
      change: 6.1,
      series: series(6 + off, 12, 26, 8),
    },
  ];

  const sparkStats = [
    {
      label: 'Cost (USD)',
      value: sc(1842),
      format: 'currencyCompact',
      change: 9.1,
      series: series(7 + off, 12, 120, 30),
    },
    {
      label: 'Total Calls',
      value: sc(45678),
      format: 'number',
      change: 8.3,
      series: series(8 + off, 12, 90, 25),
    },
    {
      label: 'Avg Tokens / Call',
      value: sc(271),
      format: 'compact',
      change: 4.2,
      series: series(9 + off, 12, 120, 30),
    },
    {
      label: 'Cost / 1M tok',
      value: 0.15,
      format: 'currencyCompact',
      change: -3.4,
      series: series(10 + off, 12, 70, 20),
    },
    {
      label: 'Slowest Response (s)',
      value: 4.6,
      format: 'number',
      change: -9.4,
      series: series(12 + off, 12, 40, 10),
    },
    {
      label: 'Avg Work Quality',
      value: 8.7,
      format: 'number',
      change: 2.1,
      series: series(13 + off, 12, 60, 18),
    },
  ];

  const goals = {
    rows: [
      {
        _id: 'demo-goal-1',
        goal: 'Increase Revenue',
        status: 'Active',
        phase: { current: 4, total: 4, title: 'Result' },
        date: '27.06\n14:23:11',
      },
      {
        _id: 'demo-goal-2',
        goal: 'Reduce Costs',
        status: 'Active',
        phase: { current: 3, total: 4, title: 'Report' },
        date: '27.06\n13:45:02',
      },
      {
        _id: 'demo-goal-3',
        goal: 'Improve CX',
        status: 'Active',
        phase: { current: 2, total: 4, title: 'Work Log' },
        date: '27.06\n12:38:47',
      },
      {
        _id: 'demo-goal-4',
        goal: 'Expand Market',
        status: 'Active',
        phase: { current: 2, total: 4, title: 'Work Log' },
        date: '27.06\n11:15:30',
      },
      {
        _id: 'demo-goal-5',
        goal: 'Launch Beta',
        status: 'Paused',
        phase: { current: 1, total: 4, title: 'Pipeline' },
        date: '26.06\n09:41:55',
      },
    ],
    total: 12,
  };

  const loops = {
    rows: [
      {
        loop_id: 'demo-loop-1',
        goal_id: 'demo-goal-1',
        goal_title: 'Increase Revenue',
        agent_id: 'demo-agent-growth',
        agent_name: 'Growth Agent',
        agent_role: 'Growth',
        loops: sc(12),
        max_loops: 20,
        status: 'active',
        loop_enabled: true,
        loop_paused: false,
        started_at: '2026-06-20T09:14:00Z',
      },
      {
        loop_id: 'demo-loop-2',
        goal_id: 'demo-goal-2',
        goal_title: 'Reduce Costs',
        agent_id: 'demo-agent-ops',
        agent_name: 'Ops Agent',
        agent_role: 'Operations',
        loops: sc(8),
        max_loops: 15,
        status: 'active',
        loop_enabled: true,
        loop_paused: false,
        started_at: '2026-06-22T11:40:00Z',
      },
      {
        loop_id: 'demo-loop-3',
        goal_id: 'demo-goal-3',
        goal_title: 'Improve CX',
        agent_id: 'demo-agent-cx',
        agent_name: 'CX Agent',
        agent_role: 'Customer Experience',
        loops: sc(15),
        max_loops: 25,
        status: 'active',
        loop_enabled: true,
        loop_paused: false,
        started_at: '2026-06-23T08:05:00Z',
      },
      {
        loop_id: 'demo-loop-4',
        goal_id: 'demo-goal-4',
        goal_title: 'Expand Market',
        agent_id: 'demo-agent-sales',
        agent_name: 'Sales Agent',
        agent_role: 'Sales',
        loops: sc(6),
        max_loops: 12,
        status: 'paused',
        loop_enabled: true,
        loop_paused: true,
        started_at: '2026-06-25T16:30:00Z',
      },
    ],
    total: 9,
  };

  const activity = {
    spark: series(66 + off, 24, 50, 22),
    rows: [
      // Agents — execution work (shown under the "Agents" toggle).
      {
        instrument: 'Workflow',
        action: 'create',
        personaName: 'Backend Developer',
        personaPosition: 'Development',
        personaKind: 'Agent',
        agentId: 'demo-agent-backend',
        date: '26.06\n14:23:11',
      },
      {
        instrument: 'Tasks',
        action: 'write',
        personaName: 'QA Tester',
        personaPosition: 'Development',
        personaKind: 'Agent',
        agentId: 'demo-agent-qa',
        date: '26.06\n13:52:40',
      },
      {
        instrument: 'Projects',
        action: 'create',
        personaName: 'Frontend Developer',
        personaPosition: 'Development',
        personaKind: 'Agent',
        agentId: 'demo-agent-frontend',
        date: '26.06\n13:10:05',
      },
      {
        instrument: 'Reports',
        action: 'read',
        personaName: 'Creative Designer',
        personaPosition: 'Marketing',
        personaKind: 'Agent',
        agentId: 'demo-agent-designer',
        date: '26.06\n12:38:47',
      },
      // Human — platform management (shown under the "Human" toggle).
      {
        instrument: 'Organizations',
        action: 'write',
        personaName: 'you@orchestratori.ai',
        personaPosition: '',
        personaKind: 'User',
        agentId: '',
        date: '26.06\n11:15:30',
      },
      {
        instrument: 'Consilium',
        action: 'create',
        personaName: 'you@orchestratori.ai',
        personaPosition: '',
        personaKind: 'User',
        agentId: '',
        date: '26.06\n10:48:12',
      },
      {
        instrument: 'Teams',
        action: 'create',
        personaName: 'you@orchestratori.ai',
        personaPosition: '',
        personaKind: 'User',
        agentId: '',
        date: '26.06\n10:02:18',
      },
      {
        instrument: 'Account',
        action: 'write',
        personaName: 'you@orchestratori.ai',
        personaPosition: '',
        personaKind: 'User',
        agentId: '',
        date: '26.06\n09:41:55',
      },
    ],
  };

  const chat = {
    total: 5,
    messages: [
      {
        id: 'demo-msg-1',
        sender: 'Support Agent',
        agentId: 'demo-agent-support',
        category: 'Team Lead',
        contextLabel: 'CX Pod',
        content: 'Resolved 32 live chats, satisfaction at 96%.',
        time: '2 min ago',
        datetime: '27/06/26 - 14:23',
        reviewHref: '/communicator?view=workspace&section=activity',
      },
      {
        id: 'demo-msg-2',
        sender: 'Sales Agent',
        agentId: 'demo-agent-sales',
        category: 'Goal',
        contextLabel: 'Expand Market',
        content: 'Closed a deal from the inbound queue.',
        time: '5 min ago',
        datetime: '27/06/26 - 14:20',
        reviewHref: '/communicator?view=workspace&section=rooms&goal=demo-goal-4',
      },
      {
        id: 'demo-msg-3',
        sender: 'Helpdesk Agent',
        agentId: 'demo-agent-helpdesk',
        category: 'Consilium',
        contextLabel: 'Main Consilium',
        content: 'Escalated 2 tickets to the Ops team lead.',
        time: '11 min ago',
        datetime: '27/06/26 - 14:14',
        reviewHref: '/communicator?view=workspace&section=consilium',
      },
      {
        id: 'demo-msg-4',
        sender: 'Onboarding Agent',
        agentId: 'demo-agent-onboarding',
        category: 'Organization',
        contextLabel: 'Orchestratori Holding',
        content: 'Walked a new org through setup.',
        time: '18 min ago',
        datetime: '27/06/26 - 14:07',
        reviewHref: '/communicator?view=workspace&section=organizations',
      },
      {
        id: 'demo-msg-5',
        sender: 'Support Agent',
        agentId: 'demo-agent-support',
        category: 'Team Lead',
        contextLabel: 'CX Pod',
        content: 'Drafted 12 macro replies for review.',
        time: '24 min ago',
        datetime: '27/06/26 - 14:01',
        reviewHref: '/communicator?view=workspace&section=activity',
      },
    ],
  };

  const usageDonut = {
    rows: [
      { group: 'GPT-4o', value: sc(12400000), cost: sc(2145) },
      { group: 'Claude 3.5', value: sc(6700000), cost: sc(897) },
      { group: 'Llama 3.1', value: sc(3200000), cost: sc(456) },
      { group: 'Gemini 1.5', value: sc(1600000), cost: sc(213) },
    ],
  };

  const dataOps = {
    rows: [
      {
        _id: 'demo-doc-1',
        type: 'Documents',
        name: 'Q3 Growth Brief',
        action: 'create',
        agentName: 'Bogdan Stancu',
        agentPosition: 'Growth Agent',
        agentId: 'demo-agent-bogdan',
        user: 'you@orchestratori.ai',
        date: '26.06\n14:23:11',
      },
      {
        _id: 'demo-doc-2',
        type: 'Reports',
        name: 'October Ops Report',
        action: 'write',
        agentName: 'Sorina Marchioro',
        agentPosition: 'Ops Lead',
        agentId: 'demo-agent-sorina',
        user: 'you@orchestratori.ai',
        date: '26.06\n13:45:02',
      },
      {
        _id: 'demo-doc-3',
        type: 'Agent Memory',
        name: 'Ticket triage notes',
        action: 'read',
        agentName: 'CX Companion',
        agentPosition: 'Customer Experience',
        agentId: 'demo-agent-cx',
        user: 'you@orchestratori.ai',
        date: '26.06\n12:38:47',
      },
      {
        _id: 'demo-doc-4',
        type: 'Goals',
        name: 'Market expansion plan',
        action: 'write',
        agentName: 'Growth Scout',
        agentPosition: 'Sales Agent',
        agentId: 'demo-agent-scout',
        user: 'you@orchestratori.ai',
        date: '26.06\n11:15:30',
      },
      {
        _id: 'demo-doc-5',
        type: 'Github offers',
        name: 'PR #482 - auth refactor',
        action: 'create',
        agentName: 'Forge',
        agentPosition: 'Dev Agent',
        agentId: 'demo-agent-forge',
        user: 'you@orchestratori.ai',
        date: '26.06\n10:02:18',
      },
      {
        _id: 'demo-doc-6',
        type: 'Mail Contact',
        name: 'investor@acme.com',
        action: 'delete',
        agentName: 'Relay',
        agentPosition: 'Comms Agent',
        agentId: 'demo-agent-relay',
        user: 'you@orchestratori.ai',
        date: '26.06\n09:41:55',
      },
    ],
  };

  const agents = {
    rows: [
      {
        name: 'Bogdan Stancu',
        type: 'Performance Marketing Manager',
        status: 'Active',
        team: 'Marketing',
        lastActive: '2 min ago',
        tasks: 24,
        successRate: 98,
      },
      {
        name: 'Sorina Marchioro',
        type: 'Performance Marketing Manager',
        status: 'Active',
        team: 'Marketing',
        lastActive: '5 min ago',
        tasks: 18,
        successRate: 96,
      },
      {
        name: 'Ops Orchestrator',
        type: 'Operations Lead',
        status: 'Active',
        team: 'Operations',
        lastActive: '8 min ago',
        tasks: 41,
        successRate: 93,
      },
      {
        name: 'CX Companion',
        type: 'Customer Experience',
        status: 'Idle',
        team: 'Support',
        lastActive: '22 min ago',
        tasks: 67,
        successRate: 91,
      },
      {
        name: 'Growth Scout',
        type: 'Growth Analyst',
        status: 'Active',
        team: 'Growth',
        lastActive: '31 min ago',
        tasks: 12,
        successRate: 88,
      },
      {
        name: 'Ledger Keeper',
        type: 'Finance Agent',
        status: 'Offline',
        team: 'Finance',
        lastActive: '2 h ago',
        tasks: 9,
        successRate: 95,
      },
    ],
  };

  const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
  const consilium = {
    boards: [
      {
        id: 'demo-board-holding',
        name: 'Main Consilium',
        status: 'active',
        memberCount: 6,
        decisions: 74,
        approvalRate: 78,
        avgScore: 8.2,
        costUsd: 4.12,
      },
      {
        id: 'demo-board-ecom',
        name: 'E-Comm Board',
        status: 'active',
        memberCount: 5,
        decisions: 39,
        approvalRate: 69,
        avgScore: 7.2,
        costUsd: 2.03,
      },
      {
        id: 'demo-board-fintech',
        name: 'Fintech Board',
        status: 'paused',
        memberCount: 3,
        decisions: 15,
        approvalRate: 60,
        avgScore: 6.8,
        costUsd: 0.91,
      },
    ],
    totals: { boards: 3, members: 14, decisions: 128, approvalRate: 73.1, avgScore: 7.7 },
    membersByBoard: {
      'demo-board-holding': [
        { id: 'dm-1', name: 'Aria Chen', role: 'chairman' },
        { id: 'dm-2', name: 'Marcus Vale', role: 'evaluator' },
        { id: 'dm-3', name: 'Priya Nair', role: 'evaluator' },
        { id: 'dm-4', name: 'Tomas Berg', role: 'auditor' },
        { id: 'dm-5', name: 'Lena Ruiz', role: 'specialist' },
        { id: 'dm-6', name: 'Owen Park', role: 'observer' },
      ],
      'demo-board-ecom': [
        { id: 'de-1', name: 'Sofia Marin', role: 'chairman' },
        { id: 'de-2', name: 'Dev Patel', role: 'evaluator' },
        { id: 'de-3', name: 'Hana Kim', role: 'evaluator' },
        { id: 'de-4', name: 'Carlos Mendez', role: 'auditor' },
        { id: 'de-5', name: 'Ivy Wong', role: 'specialist' },
      ],
      'demo-board-fintech': [
        { id: 'df-1', name: 'Noah Frost', role: 'chairman' },
        { id: 'df-2', name: 'Mara Lindqvist', role: 'evaluator' },
        { id: 'df-3', name: 'Raj Anand', role: 'auditor' },
      ],
    },
    decisionsByBoard: {
      'demo-board-holding': [
        {
          id: 'dd-1',
          approved: true,
          overall_score: 8.6,
          summary: 'Approved Q3 marketing budget reallocation to paid social.',
          decision_level: 'MEDIUM',
          created_at: hoursAgo(2),
        },
        {
          id: 'dd-2',
          approved: true,
          overall_score: 7.9,
          summary: 'Greenlit the new partner onboarding workflow rollout.',
          decision_level: 'LOW',
          created_at: hoursAgo(6),
        },
        {
          id: 'dd-3',
          approved: false,
          overall_score: 4.1,
          summary: 'Rejected vendor X contract — pricing above target margin.',
          decision_level: 'HIGH',
          created_at: hoursAgo(20),
        },
        {
          id: 'dd-4',
          approved: true,
          overall_score: 9.0,
          summary: 'Approved hiring an additional data-engineering agent team.',
          decision_level: 'MEDIUM',
          created_at: hoursAgo(28),
        },
      ],
      'demo-board-ecom': [
        {
          id: 'ed-1',
          approved: true,
          overall_score: 7.4,
          summary: 'Approved storefront redesign A/B test for checkout.',
          decision_level: 'LOW',
          created_at: hoursAgo(4),
        },
        {
          id: 'ed-2',
          approved: false,
          overall_score: 5.2,
          summary: 'Held back the dynamic-pricing experiment pending data.',
          decision_level: 'MEDIUM',
          created_at: hoursAgo(15),
        },
        {
          id: 'ed-3',
          approved: true,
          overall_score: 8.1,
          summary: 'Approved supplier diversification for top SKUs.',
          decision_level: 'MEDIUM',
          created_at: hoursAgo(30),
        },
      ],
      'demo-board-fintech': [
        {
          id: 'fd-1',
          approved: true,
          overall_score: 6.9,
          summary: 'Approved KYC vendor integration pilot.',
          decision_level: 'HIGH',
          created_at: hoursAgo(8),
        },
        {
          id: 'fd-2',
          approved: false,
          overall_score: 4.8,
          summary: 'Rejected the high-yield product launch this quarter.',
          decision_level: 'CRITICAL',
          created_at: hoursAgo(40),
        },
      ],
    },
  };

  return {
    kpis,
    sparkStats,
    performance,
    goals,
    loops,
    activity,
    chat,
    usageDonut,
    dataOps,
    agents,
    consilium,
  };
}

export default buildDemoData;
