/**
 * Pure data builders for the view-only demo account (structure + board/page fills).
 *
 * Deterministic and side-effect free so it can be unit-tested without a database.
 * GOALS and their child rows are NOT built here — they are cloned from a real,
 * already-executed account by scripts/demo-clone.js (which carries the rich
 * tech_doc / proposal / retrospective / KB detail the live pipeline generates).
 * buildDemoModel takes those cloned goals so page records can reference them.
 *
 * Hierarchy: 1 holding -> 4 subsidiaries (Ecommerce, Media, Logistics, Warehouses)
 *            -> 11 teams -> 55 agents, 5 Consilium boards.
 */
import { createHash } from 'crypto';

/** Deterministic, valid-format UUID derived from a seed string (stable across runs). */
export function stableUuid(seed) {
  const h = createHash('sha1').update(String(seed)).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const LLM_PROVIDERS = [
  { provider: 'groq', model: 'llama-3.3-70b-versatile' },
  { provider: 'anthropic', model: 'claude-sonnet-5' },
  { provider: 'openai', model: 'gpt-4o' },
  { provider: 'glm', model: 'glm-4-plus' },
];

/** Subsidiaries in the order requested by the user. */
export const SUBSIDIARIES = [
  {
    key: 'ecom',
    name: 'Orbital Commerce',
    industry: 'E-commerce',
    country: 'US',
    teams: ['Growth & Acquisition', 'Merchandising', 'Storefront Engineering'],
  },
  {
    key: 'media',
    name: 'Orbital Media',
    industry: 'Media & Content',
    country: 'GB',
    teams: ['Content Studio', 'Distribution & SEO', 'Brand & Social'],
  },
  {
    key: 'logi',
    name: 'Orbital Logistics',
    industry: 'Logistics',
    country: 'DE',
    teams: ['Route Optimization', 'Fleet Operations'],
  },
  {
    key: 'ware',
    name: 'Orbital Warehousing',
    industry: 'Warehousing',
    country: 'NL',
    teams: ['Inventory Intelligence', 'Fulfillment Automation'],
  },
];

const TEAM_ROSTER = [
  { title: 'Team Lead', role: 'lead', seniority: 'lead' },
  { title: 'Senior Specialist', role: 'member', seniority: 'senior' },
  { title: 'Specialist', role: 'member', seniority: 'mid' },
  { title: 'Analyst', role: 'member', seniority: 'mid' },
  { title: 'Automation Agent', role: 'member', seniority: 'junior' },
];

const MEMBER_ROLES = ['chairman', 'evaluator', 'evaluator', 'auditor', 'specialist'];

const MEMBER_SKILLS = {
  chairman: ['strategy', 'decision_making', 'oversight'],
  evaluator: ['quality_review', 'scoring', 'critique'],
  auditor: ['compliance', 'risk_analysis', 'security'],
  specialist: ['domain_expertise', 'research', 'execution'],
  observer: ['monitoring', 'reporting'],
};

/**
 * Statuses the live autonomous backend leaves untouched (self-healer excludes
 * these; executor only runs 'active'). The clone must keep goals in this set.
 */
export const SAFE_GOAL_STATUSES = new Set(['completed', 'needs_human', 'cancelled']);

// ── Deterministic ids for demo entities (shared with the clone) ──────────────
export const demoHoldingId = (userId) => stableUuid(`${userId}:org:holding`);
export const demoSubOrgId = (userId, key) => stableUuid(`${userId}:org:${key}`);
export const demoHoldingBoardId = (userId) =>
  `demo-board-${stableUuid(`${userId}:board:holding`).slice(0, 8)}`;
export const demoSubBoardId = (userId, key) =>
  `demo-board-${stableUuid(`${userId}:board:${key}`).slice(0, 8)}`;
export const demoExecTeamId = (userId) => stableUuid(`${userId}:team:exec`);
export const demoSubTeamId = (userId, key, ti) => stableUuid(`${userId}:team:${key}:${ti}`);

/** Round-robin a cloned goal to a subsidiary by index (for reparenting/ref). */
export function subForIndex(i) {
  return SUBSIDIARIES[i % SUBSIDIARIES.length];
}

function iso(baseEpochMs, dayOffset = 0, hourOffset = 0) {
  return new Date(baseEpochMs + dayOffset * 86400000 + hourOffset * 3600000).toISOString();
}

/**
 * Build the demo structure + board/page fills for a demo user.
 * @param {{ userId: string, baseEpochMs: number, clonedGoals?: Array }} opts
 *   clonedGoals: reparented goal rows from demo-clone.js ({id,title,org_id,status,budget_usd,spent_usd}).
 */
export function buildDemoModel({ userId, baseEpochMs, clonedGoals = [] }) {
  if (!userId) throw new Error('buildDemoModel requires a userId');
  const base = baseEpochMs || 0;

  const organizations = [];
  const boards = [];
  const members = [];
  const teams = [];
  const teamMembers = [];
  const agents = [];
  const conciliumAgents = [];
  const orgTeams = [];
  const orgAgents = [];
  const criteria = [];
  const evaluations = [];
  const workflows = [];
  const workflowExecutions = [];
  const knowledgeDocs = [];
  const projects = [];
  const analytics = [];
  const ratings = [];
  const comms = [];
  const channels = [];
  const notificationLog = [];
  const auditLog = [];
  const assistants = [];
  const assistantSetup = [];
  const assistantMessages = [];
  const partners = [];
  const partnerHistory = [];
  const financialEvents = [];
  const marketplaceListings = [];
  const marketplaceReviews = [];
  const marketplacePurchases = [];
  const leads = [];
  const contacts = [];
  const investors = [];
  const deals = [];
  const commitments = [];
  const humanTasks = [];
  const blueprints = [];
  const savedDashboards = [];
  const businesses = [];

  const holdingId = demoHoldingId(userId);
  const holdingBoardId = demoHoldingBoardId(userId);

  organizations.push({
    id: holdingId,
    user_id: userId,
    name: 'Orchestratori Holding',
    description: 'Top-level holding coordinating four autonomous subsidiaries.',
    slug: 'orchestratori-holding',
    org_type: 'holding',
    parent_id: null,
    industry: 'Diversified',
    consilium_id: holdingBoardId,
    is_active: true,
    created_at: iso(base, -60),
  });

  function makeBoard(id, name, orgLabel, dayOffset) {
    const boardLlms = [];
    boards.push({
      id,
      user_id: userId,
      name,
      description: `AI board governing ${orgLabel}.`,
      purpose: `Evaluate and approve goals for ${orgLabel}.`,
      status: 'active',
      security_level: 'standard',
      approval_threshold: 0.6,
      confidence_threshold: 0.7,
      llms: boardLlms,
      created_at: iso(base, dayOffset),
    });
    MEMBER_ROLES.forEach((mrole, i) => {
      const llm = LLM_PROVIDERS[i % LLM_PROVIDERS.length];
      boardLlms.push({ id: `llm-${i}`, name: llm.model, provider: llm.provider });
      members.push({
        id: stableUuid(`${id}:member:${i}`),
        user_id: userId,
        concilium_id: id,
        name: `${name} · ${mrole[0].toUpperCase()}${mrole.slice(1)} ${i + 1}`,
        role: mrole,
        provider: llm.provider,
        model: llm.model,
        temperature: 0.3,
        max_tokens: 3000,
        skills: MEMBER_SKILLS[mrole] || [],
        resume: `Seasoned ${mrole} specializing in ${orgLabel}. 12+ evaluations on record.`,
        comments: [],
        active: true,
        total_evaluations: 12 + i * 7,
        avg_response_time_ms: 800 + i * 120,
        avg_cost_usd: 0.004 + i * 0.001,
        total_tokens_used: 40000 + i * 12000,
        created_at: iso(base, dayOffset),
      });
    });
    // Board evaluations (drive the Analytics tab + Consilium comm log + member activity)
    for (let e = 0; e < 6; e++) {
      evaluations.push({
        id: stableUuid(`${id}:eval:${e}`),
        user_id: userId,
        board_id: id,
        concilium_id: id,
        approved: e % 4 !== 0,
        overall_score: Number((6.5 + (e % 4) * 0.7).toFixed(2)),
        estimated_cost_usd: Number((0.003 + e * 0.001).toFixed(4)),
        total_cost_usd: Number((0.003 + e * 0.001).toFixed(4)),
        total_tokens: 1200 + e * 300,
        member_responses: [],
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        summary: `Board review #${e + 1} for ${orgLabel} — consensus ${(0.6 + (e % 4) * 0.08).toFixed(2)}.`,
        feedback: 'Meets acceptance criteria; approved with minor notes.',
        created_at: iso(base, -7 + e),
      });
    }
    // Board criteria (Criteria tab)
    [
      ['Quality', 0.3],
      ['Completeness', 0.25],
      ['Accuracy', 0.25],
      ['Actionability', 0.2],
    ].forEach(([cname, weight], ci) => {
      criteria.push({
        id: stableUuid(`${id}:crit:${ci}`),
        user_id: userId,
        concilium_id: id,
        name: cname,
        weight,
        rubric: `Assess ${cname.toLowerCase()} of the work product against acceptance criteria.`,
        examples: [],
        sort_order: ci,
        is_active: true,
        version: 1,
      });
    });
  }

  makeBoard(holdingBoardId, 'Main Consilium', 'the holding', -59);

  const execTeamId = demoExecTeamId(userId);
  teams.push({
    id: execTeamId,
    user_id: userId,
    name: 'Executive Strategy Council',
    description: 'Cross-subsidiary strategy and capital allocation.',
    leader_id: null,
    is_active: true,
    created_at: iso(base, -58),
  });
  orgTeams.push({
    id: stableUuid(`${holdingId}:${execTeamId}`),
    user_id: userId,
    org_id: holdingId,
    team_id: execTeamId,
  });

  function makeTeamAgents(teamId, teamName, orgId, dayOffset) {
    let leaderAgentId = null;
    TEAM_ROSTER.forEach((slot, i) => {
      const agentId = stableUuid(`${teamId}:agent:${i}`);
      if (slot.role === 'lead') leaderAgentId = agentId;
      agents.push({
        id: agentId,
        user_id: userId,
        name: `${teamName} ${slot.title}`,
        description: `${slot.seniority} agent on ${teamName}.`,
        category: teamName,
        status: 'active',
        pricing_model: 'per_task',
        cost_per_task: 0.05 + i * 0.01,
        capabilities: ['planning', 'execution', 'analysis'],
        metadata: { demo_seed: true, team: teamName, seniority: slot.seniority },
        created_at: iso(base, dayOffset),
      });
      teamMembers.push({
        id: stableUuid(`${teamId}:tm:${i}`),
        team_id: teamId,
        member_id: agentId,
        user_id: userId,
        role: slot.role === 'lead' ? 'lead' : 'member',
        joined_at: iso(base, dayOffset),
      });
      orgAgents.push({
        id: stableUuid(`${orgId}:${agentId}`),
        user_id: userId,
        org_id: orgId,
        agent_id: agentId,
      });
      conciliumAgents.push({
        id: stableUuid(`${teamId}:ca:${i}`),
        user_id: userId,
        name: `${teamName} ${slot.title}`,
        description: `Lifecycle-tracked agent for ${teamName}.`,
        agent_type: 'internal',
        status: 'active',
        total_requests: 40 + i * 25,
        total_tokens_used: 120000 + i * 45000,
        total_cost_usd: 0.9 + i * 0.4,
        total_evaluations: 6 + i * 3,
        avg_response_time_ms: 800 + i * 120,
        metadata: { demo_seed: true, team: teamName },
        created_at: iso(base, dayOffset),
      });
    });
    return leaderAgentId;
  }

  teams[0].leader_id = makeTeamAgents(execTeamId, 'Executive Strategy Council', holdingId, -58);

  SUBSIDIARIES.forEach((sub, si) => {
    const orgId = demoSubOrgId(userId, sub.key);
    const boardId = demoSubBoardId(userId, sub.key);
    organizations.push({
      id: orgId,
      user_id: userId,
      name: sub.name,
      description: `${sub.industry} subsidiary of Orchestratori Holding.`,
      slug: `orbital-${sub.key}`,
      org_type: 'subsidiary',
      parent_id: holdingId,
      industry: sub.industry,
      consilium_id: boardId,
      is_active: true,
      created_at: iso(base, -55 + si),
    });
    makeBoard(boardId, `${sub.name} Consilium`, sub.name, -54 + si);

    sub.teams.forEach((teamName, ti) => {
      const teamId = demoSubTeamId(userId, sub.key, ti);
      const dayOffset = -50 + si * 4 + ti;
      teams.push({
        id: teamId,
        user_id: userId,
        name: teamName,
        description: `${teamName} team at ${sub.name}.`,
        leader_id: null,
        is_active: true,
        created_at: iso(base, dayOffset),
      });
      orgTeams.push({
        id: stableUuid(`${orgId}:${teamId}`),
        user_id: userId,
        org_id: orgId,
        team_id: teamId,
      });
      teams[teams.length - 1].leader_id = makeTeamAgents(teamId, teamName, orgId, dayOffset);
    });

    // One workflow + executions per subsidiary
    const wfId = `demo-wf-${sub.key}`;
    workflows.push({
      id: wfId,
      user_id: userId,
      name: `${sub.name} — automation pipeline`,
      enabled: true,
      data: {
        demo_seed: true,
        nodes: [
          { id: 'trigger', type: 'trigger', label: 'Schedule' },
          { id: 'fetch', type: 'action', label: 'Fetch data' },
          { id: 'analyze', type: 'llm', label: 'Analyze' },
          { id: 'notify', type: 'action', label: 'Notify team' },
        ],
      },
      created_at: iso(base, -45 + si),
    });
    ['completed', 'running'].forEach((st, ei) => {
      workflowExecutions.push({
        id: stableUuid(`${wfId}:exec:${ei}`),
        workflow_id: wfId,
        user_id: userId,
        status: st,
        trigger_data: { demo_seed: true, source: 'schedule' },
        node_outputs: { fetch: { rows: 128 }, analyze: { summary: 'ok' } },
        variables: {},
        created_at: iso(base, -20 + ei),
      });
    });

    // (Knowledge base is populated by the ~166 rich cloned goal docs — no thin
    // structural notes needed here.)

    for (let pi = 0; pi < 2; pi++) {
      projects.push({
        id: `demo-proj-${sub.key}-${pi}`,
        user_id: userId,
        name: `${sub.name} initiative ${pi + 1}`,
        status: pi === 0 ? 'Active' : 'Planning',
        data: { demo_seed: true, subsidiary: sub.name, org_id: orgId },
        created_at: iso(base, -30 + si + pi),
      });
    }

    for (let d = 0; d < 7; d++) {
      analytics.push({
        id: stableUuid(`${boardId}:an:${d}`),
        user_id: userId,
        board_id: boardId,
        period_type: 'daily',
        period_start: iso(base, -7 + d),
        period_end: iso(base, -6 + d),
        total_evaluations: 8 + d,
        approved_count: 5 + (d % 3),
        rejected_count: 1 + (d % 2),
        avg_overall_score: Number((3.8 + (d % 5) * 0.2).toFixed(2)),
        total_cost_usd: Number((0.6 + d * 0.15).toFixed(4)),
        total_tokens: 45000 + d * 8000,
        avg_response_time_ms: 900 + d * 40,
        active_members: 5,
        created_at: iso(base, -7 + d),
      });
    }

    // Communicator thread per subsidiary (goal-independent)
    const threadId = stableUuid(`${orgId}:thread`);
    const speakers = [
      { type: 'system', name: 'Consilium' },
      { type: 'agent', name: `${sub.teams[0]} Team Lead` },
      { type: 'agent', name: `${sub.teams[0]} Analyst` },
      { type: 'user', name: 'Operator' },
    ];
    [
      'New goal handed to the board.',
      `Acknowledged. Forming a team across ${sub.teams.length} squads.`,
      'Pulled data, analysis underway.',
      'Looks good — approve the next phase.',
      'Phase approved (consensus 0.82).',
      'Deliverable shipped, capturing KPIs now.',
    ].forEach((content, li) => {
      const sp = speakers[li % speakers.length];
      comms.push({
        id: stableUuid(`${threadId}:msg:${li}`),
        user_id: userId,
        thread_id: threadId,
        sender_type: sp.type,
        sender_name: sp.name,
        content,
        context_type: 'general',
        context_id: orgId,
        context_label: sub.name,
        platform: 'internal',
        metadata: { demo_seed: true },
        created_at: iso(base, -6 + Math.floor(li / 2), li),
      });
    });

    for (let ri = 0; ri < 3; ri++) {
      ratings.push({
        id: stableUuid(`${orgId}:rating:${ri}`),
        user_id: userId,
        agent_id: stableUuid(`${demoSubTeamId(userId, sub.key, ri % sub.teams.length)}:agent:0`),
        rating: 4 + (ri % 2),
        comment: `Strong delivery on ${sub.name} goals.`,
        rating_type: 'individual',
        created_at: iso(base, -10 + ri),
      });
    }

    ['create', 'update', 'execute'].forEach((action, ai) => {
      auditLog.push({
        id: stableUuid(`${orgId}:audit:${ai}`),
        action,
        entity: ['goal', 'team', 'workflow'][ai],
        entity_id: orgId,
        user_id: userId,
        user_email: 'demo@orchestratori.app',
        details: `${action} ${['goal', 'team', 'workflow'][ai]} in ${sub.name}`,
        created_at: iso(base, -12 + si, ai),
      });
    });

    businesses.push({
      id: stableUuid(`${userId}:biz:${si}`),
      user_id: userId,
      name: sub.name,
      business_type: sub.industry,
      description: `${sub.industry} business unit.`,
      status: 'active',
      metadata: { demo_seed: true, org_id: orgId },
      created_at: iso(base, -52 + si),
    });
  });

  // ── Communicator channels + notification log (activity feed) ───────────────
  [
    ['telegram', 'Ops Telegram'],
    ['slack', 'Team Slack'],
  ].forEach(([platform, name]) => {
    channels.push({
      id: stableUuid(`${userId}:chan:${platform}`),
      platform,
      name,
      status: 'active',
      config: { demo_seed: true, bot_username: `orbital_${platform}_bot` },
      connected_by: userId,
      last_active: iso(base, -1),
    });
  });
  [
    'Goal approved by the board',
    'New high-value lead captured',
    'Weekly revenue report ready',
  ].forEach((subject, i) => {
    notificationLog.push({
      id: stableUuid(`${userId}:notif:${i}`),
      user_id: userId,
      channel: 'in_app',
      event_type: 'digest',
      recipient: 'demo@orchestratori.app',
      subject,
      body: `${subject}. Open the dashboard for details.`,
      status: 'sent',
      metadata: { demo_seed: true, action: { type: 'view' } },
      sent_at: iso(base, -2 + i),
      created_at: iso(base, -2 + i),
    });
  });

  // ── Partners (global table: id text + data jsonb, no user_id) ───────────────
  const funnels = ['client', 'negotiating', 'qualified', 'prospect'];
  ['Stripe', 'Shopify', 'Meta Ads', 'DHL Express'].forEach((pname, i) => {
    const pid = `demo-partner-${i}`;
    partners.push({
      id: pid,
      data: {
        demo_seed: true,
        name: pname,
        funnel_status: funnels[i % funnels.length],
        agreement_status: i % 2 === 0 ? 'signed' : 'in_review',
        primary_contact: `${pname} Partnerships`,
        geo: ['US', 'US', 'GB', 'DE'][i],
        revenue_usd: 12000 + i * 4300,
      },
      created_at: iso(base, -50 + i),
    });
    partnerHistory.push({
      id: stableUuid(`${pid}:hist`),
      partner_id: pid,
      type: 'status_change',
      title: 'Moved to ' + funnels[i % funnels.length],
      detail: `${pname} advanced in the funnel.`,
      meta: { demo_seed: true },
      created_at: iso(base, -40 + i),
    });
  });

  // ── CRM contacts ───────────────────────────────────────────────────────────
  const attitudes = ['vip', 'friendly', 'neutral', 'cold_lead'];
  [
    'Ava Chen',
    'Ben Ortiz',
    'Clara Fux',
    'Dan Meyer',
    'Ela Ross',
    'Finn Wu',
    'Gia Lang',
    'Hugo Vlk',
  ].forEach((name, i) => {
    contacts.push({
      id: stableUuid(`${userId}:contact:${i}`),
      user_id: userId,
      name,
      email: `contact${i}@example.com`,
      phone: `+1-555-01${i}${i}`,
      attitude: attitudes[i % attitudes.length],
      comment: 'Demo CRM contact.',
      metadata: { demo_seed: true },
      created_at: iso(base, -20 + i),
    });
  });

  // ── Investments ────────────────────────────────────────────────────────────
  const investorDefs = [
    { name: 'Northwind Capital', type: 'human', cap: 250000 },
    { name: 'Aurora Ventures', type: 'human', cap: 500000 },
    { name: 'AI Allocator Prime', type: 'ai', cap: 120000 },
  ];
  investorDefs.forEach((inv, i) => {
    investors.push({
      id: stableUuid(`${userId}:investor:${i}`),
      user_id: userId,
      agent_id: inv.type === 'ai' ? stableUuid(`${execTeamId}:agent:0`) : null,
      investor_type: inv.type,
      name: inv.name,
      bio: `${inv.type === 'ai' ? 'Autonomous' : 'Institutional'} investor.`,
      investment_capacity: inv.cap,
      total_invested: inv.cap * 0.4,
      total_returns: inv.cap * 0.1,
      trust_score: 70 + i * 5,
      risk_profile: ['moderate', 'aggressive', 'conservative'][i % 3],
      is_active: true,
      created_at: iso(base, -48 + i),
    });
  });
  const dealStatuses = ['active', 'completed', 'funded'];
  SUBSIDIARIES.forEach((sub, i) => {
    const did = stableUuid(`${userId}:deal:${i}`);
    deals.push({
      id: did,
      user_id: userId,
      title: `${sub.name} growth round`,
      description: `Capital to scale ${sub.name}.`,
      industry: sub.industry,
      required_amount: 50000 + i * 20000,
      current_funded: (50000 + i * 20000) * 0.8,
      funding_pct: 80,
      min_investment: 500,
      roi_projections: { expected: 2.4, optimistic: 3.1, pessimistic: 1.6 },
      risk_level: 'medium',
      status: dealStatuses[i % dealStatuses.length],
      created_at: iso(base, -45 + i),
    });
    commitments.push({
      id: stableUuid(`${did}:commit`),
      user_id: userId,
      deal_id: did,
      investor_id: stableUuid(`${userId}:investor:${i % investorDefs.length}`),
      amount: 10000 + i * 5000,
      commitment_type: 'direct',
      status: 'active',
      returns_received: i * 1200,
      committed_at: iso(base, -40 + i),
    });
  });

  // ── Agent blueprints ───────────────────────────────────────────────────────
  ['Researcher', 'Copywriter', 'Data Analyst', 'Ops Automator', 'QA Reviewer'].forEach((b, i) => {
    const llm = LLM_PROVIDERS[i % LLM_PROVIDERS.length];
    blueprints.push({
      id: stableUuid(`${userId}:bp:${i}`),
      user_id: userId,
      name: `${b} Blueprint`,
      description: `Template for a ${b} agent.`,
      category: b.toLowerCase(),
      system_prompt: `You are a ${b}. Be concise, accurate, and cost-aware.`,
      provider: llm.provider,
      model: llm.model,
      temperature: 0.3,
      max_tokens: 3000,
      tools: [],
      is_template: true,
      status: 'active',
      created_at: iso(base, -33 + i),
    });
  });

  // ── Saved dashboards (owner_user_id, not user_id) ──────────────────────────
  ['Executive Overview', 'Revenue & Spend'].forEach((d, i) => {
    savedDashboards.push({
      id: stableUuid(`${userId}:dash:${i}`),
      owner_user_id: userId,
      title: d,
      description: `${d} demo dashboard.`,
      config: {
        version: 1,
        demo_seed: true,
        layout: [],
        blocks: [
          { id: 'b1', type: 'kpi', title: 'Revenue' },
          { id: 'b2', type: 'chart', title: 'Goals by status' },
        ],
        global_filters: {},
      },
      visibility: 'private',
      is_template: false,
      created_at: iso(base, -25 + i),
    });
  });

  // ── Assistant (page reads assistant_setup; fabricated, no source secrets) ───
  const assistantId = stableUuid(`${userId}:assistant`);
  assistants.push({
    id: assistantId,
    user_id: userId,
    organization_id: holdingId,
    name: 'Holding Copilot',
    config: {
      demo_seed: true,
      tone: 'concise',
      system_prompt: 'You are the holding operator copilot.',
    },
    steps: { profile: true, tools: true, knowledge: true },
    activated: true,
    is_current: true,
    created_at: iso(base, -40),
  });
  assistantSetup.push({
    id: stableUuid(`${userId}:assetup`),
    user_id: userId,
    config: {
      demo_seed: true,
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      temperature: 0.3,
      tone: 'concise',
      voice: 'nova',
      system_prompt: 'You are the holding operator copilot.',
    },
    steps: { brain: true, channels: true, knowledge: true, contacts: true },
    activated: true,
    created_at: iso(base, -40),
  });
  const convoId = stableUuid(`${userId}:assistant:convo`);
  [
    { role: 'user', content: 'Which subsidiary is furthest from its quarterly target?' },
    {
      role: 'assistant',
      content: 'Orbital Media is pacing lowest; want me to summarize blockers?',
    },
    { role: 'user', content: 'Yes, and show top 3 goals by spend.' },
    {
      role: 'assistant',
      content: 'Top goals by spend span Commerce, Media and Warehousing landing-page builds.',
    },
  ].forEach((m, mi) => {
    assistantMessages.push({
      id: stableUuid(`${convoId}:msg:${mi}`),
      user_id: userId,
      conversation_id: convoId,
      role: m.role,
      content: m.content,
      mode: 'assistant',
      metadata: { demo_seed: true },
      created_at: iso(base, -3, mi),
    });
  });

  // ── Page records that reference the cloned goals ───────────────────────────
  const completed = clonedGoals.filter((g) => g.status === 'completed');
  clonedGoals.forEach((g, gi) => {
    financialEvents.push({
      id: stableUuid(`${g.id}:fin:rev`),
      user_id: userId,
      goal_id: g.id,
      event_type: 'revenue',
      amount_usd: Number(((g.budget_usd || 20) * 4.2).toFixed(4)),
      direction: 'in',
      source: 'demo',
      description: `Revenue attributed to ${g.title}`,
      metadata: { demo_seed: true },
      created_at: iso(base, -14 + (gi % 10)),
    });
    financialEvents.push({
      id: stableUuid(`${g.id}:fin:spend`),
      user_id: userId,
      goal_id: g.id,
      event_type: 'token_spend',
      amount_usd: Number((g.spent_usd || 5).toFixed(4)),
      direction: 'out',
      source: 'llm',
      description: `LLM spend for ${g.title}`,
      metadata: { demo_seed: true },
      created_at: iso(base, -14 + (gi % 10), 2),
    });
    leads.push({
      id: stableUuid(`${g.id}:lead`),
      user_id: userId,
      goal_id: g.id,
      name: `Lead — ${g.title}`.slice(0, 60),
      email: `lead${gi}@example.com`,
      company: subForIndex(gi).name,
      source: 'research',
      relevance_score: Number((0.5 + (gi % 5) * 0.1).toFixed(2)),
      status: ['new', 'contacted', 'interested', 'converted'][gi % 4],
      approach_strategy: 'Warm intro via content.',
      revenue_usd: gi % 4 === 3 ? 2400 : 0,
      created_at: iso(base, -13 + (gi % 10)),
    });
  });
  completed.slice(0, 6).forEach((g, i) => {
    const lid = stableUuid(`${g.id}:listing`);
    marketplaceListings.push({
      id: lid,
      goal_id: g.id,
      creator_id: userId,
      title: `${g.title} template`.slice(0, 80),
      description: `Reusable template distilled from a completed build.`,
      category: ['ecommerce', 'media', 'landing-page', 'ops', 'automation'][i % 5],
      deliverable_type: 'workflow_template',
      price_usd: 49 + i * 20,
      pricing_model: 'fixed',
      status: 'active',
      success_metrics: { demo_seed: true },
      avg_rating: 4 + (i % 2) * 0.5,
      total_purchases: 3 + i,
      total_revenue: (49 + i * 20) * (3 + i),
      tags: ['demo', 'template'],
      created_at: iso(base, -18 + i),
    });
    marketplaceReviews.push({
      id: stableUuid(`${lid}:review`),
      listing_id: lid,
      buyer_id: userId,
      rating: 4 + (i % 2),
      review_text: 'Great starting point, saved us days.',
      created_at: iso(base, -12 + i),
    });
    marketplacePurchases.push({
      id: stableUuid(`${lid}:purchase`),
      listing_id: lid,
      buyer_id: userId,
      goal_id: g.id,
      price_paid: 49 + i * 20,
      creator_payout: Number(((49 + i * 20) * 0.85).toFixed(2)),
      platform_fee: Number(((49 + i * 20) * 0.15).toFixed(2)),
      payment_status: 'paid',
      created_at: iso(base, -10 + i),
    });
  });
  ['Provide Canva API key', 'Confirm Stripe payout account', 'Approve EU data policy'].forEach(
    (t, i) => {
      humanTasks.push({
        id: stableUuid(`${userId}:htask:${i}`),
        user_id: userId,
        goal_id: clonedGoals[i % Math.max(clonedGoals.length, 1)]?.id || null,
        tool_id: ['canva', 'stripe', 'policy'][i],
        type: 'provide_credential',
        reason: t,
        instructions: `${t} to unblock the team.`,
        status: 'completed',
        escalation_allowed: false,
        completed_by: 'user',
        completed_at: iso(base, -9 + i),
        created_at: iso(base, -11 + i),
      });
    }
  );

  return {
    organizations,
    boards,
    members,
    teams,
    teamMembers,
    agents,
    conciliumAgents,
    orgTeams,
    orgAgents,
    criteria,
    evaluations,
    workflows,
    workflowExecutions,
    knowledgeDocs,
    projects,
    analytics,
    ratings,
    comms,
    channels,
    notificationLog,
    auditLog,
    assistants,
    assistantSetup,
    assistantMessages,
    partners,
    partnerHistory,
    financialEvents,
    marketplaceListings,
    marketplaceReviews,
    marketplacePurchases,
    leads,
    contacts,
    investors,
    deals,
    commitments,
    humanTasks,
    blueprints,
    savedDashboards,
    businesses,
  };
}
