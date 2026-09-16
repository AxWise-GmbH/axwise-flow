/**
 * Chat blocks extractor — maps tool call results to inline chat block payloads.
 *
 * Called from assistant-chat (when execute=true) and assistant-bridge (always)
 * after each successful tool execution. Produces compact, JSON-serializable
 * block payloads the frontend renders as rich entity cards in the chat.
 *
 * Contract: extractBlocks(toolName, args, rawResult) → Array<Block>
 *   Block = {
 *     id: string,
 *     type: 'goal'|'task'|'workflow'|'report'|'project'|'kb-doc'|'dashboard'
 *         | 'organization'|'agent'|'request'|'tool'|'marketplace-listing'
 *         | 'communicator-thread'|'partner'|'empty'|'show-all',
 *     compact: { ... small set of fields per type ... },
 *     expanded?: { ... richer fields, only for single-item .get calls ... },
 *   }
 *
 * Block payloads include ONLY the fields needed for the compact + expanded views.
 * Never pass through full rows — keeps responses small and avoids leaking columns.
 *
 * Long lists are capped at MAX_LIST_BLOCKS; when truncated, a 'show-all' tile
 * is appended that links to the full list page.
 */

const MAX_LIST_BLOCKS = 5;

function asArray(maybe) {
  if (!maybe) return [];
  return Array.isArray(maybe) ? maybe : [maybe];
}

function trimText(s, n = 400) {
  const t = String(s || '');
  return t.length > n ? t.slice(0, n) + '…' : t;
}

function bid(prefix, id) {
  return `${prefix}-${id || Math.random().toString(36).slice(2, 8)}`;
}

function clampList(items, mapFn, opts) {
  const arr = items || [];
  const blocks = arr.slice(0, MAX_LIST_BLOCKS).map(mapFn).filter(Boolean);
  if (arr.length > MAX_LIST_BLOCKS && opts?.showAll) {
    blocks.push({
      id: bid('show-all', opts.type),
      type: 'show-all',
      compact: {
        label: opts.showAll.label || `Show all ${arr.length}`,
        route: opts.showAll.route,
        count: arr.length,
      },
    });
  }
  return blocks;
}

function emptyBlock(toolName, message) {
  return [
    {
      id: bid('empty', toolName),
      type: 'empty',
      compact: { tool: toolName, message },
    },
  ];
}

// ── Per-tool extractors ────────────────────────────────────────────────────

function extractGoal(toolName, args, r) {
  if (toolName === 'goal.list') {
    if (!r?.goals?.length) return emptyBlock(toolName, 'No goals yet — create one?');
    return clampList(
      r.goals,
      (g) => ({
        id: bid('goal', g.id),
        type: 'goal',
        entityId: g.id,
        compact: {
          id: g.id,
          title: g.title,
          status: g.status,
          budget_usd: g.budget_usd,
          updated_at: g.updated_at || g.created_at,
        },
      }),
      { type: 'goals', showAll: { route: '/dashboard', label: `Show all ${r.goals.length} goals` } }
    );
  }
  if (toolName === 'goal.create') {
    const g = r?.created;
    if (!g) return [];
    return [
      {
        id: bid('goal', g.id),
        type: 'goal',
        entityId: g.id,
        compact: { id: g.id, title: g.title, status: g.status, budget_usd: g.budget_usd },
      },
    ];
  }
  if ((toolName === 'goal.get' || toolName === 'goal.nextSteps') && r?.goal) {
    const g = r.goal;
    return [
      {
        id: bid('goal', g.id),
        type: 'goal',
        entityId: g.id,
        compact: { id: g.id, title: g.title, status: g.status, budget_usd: g.budget_usd },
        expanded: { spent_usd: g.spent_usd, pendingJobs: r.pendingJobs },
      },
    ];
  }
  if ((toolName === 'goal.subgoals' && r?.subgoals?.length) || (toolName === 'goal.loopingGoals' && r?.goals?.length)) {
    const list = r.subgoals || r.goals;
    return clampList(
      list,
      (g) => ({
        id: bid('goal', g.id),
        type: 'goal',
        entityId: g.id,
        compact: { id: g.id, title: g.title, status: g.status, budget_usd: g.budget_usd },
      }),
      { type: 'goals', showAll: { route: '/dashboard', label: `Show all ${list.length}` } }
    );
  }
  if ((toolName === 'goal.pause' || toolName === 'goal.resume' || toolName === 'goal.cancel' || toolName === 'goal.updateBudget') && r?.updated) {
    const g = r.updated;
    return [{ id: bid('goal', g.id), type: 'goal', entityId: g.id, compact: { id: g.id, title: g.title, status: g.status, budget_usd: g.budget_usd } }];
  }
  return [];
}

function extractTask(toolName, args, r) {
  if (toolName === 'task.list') {
    if (!r?.tasks?.length) return emptyBlock(toolName, 'No tasks yet.');
    return clampList(
      r.tasks,
      (t) => ({
        id: bid('task', t.id),
        type: 'task',
        entityId: t.id,
        compact: {
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          due_date: t.deadline || null,
        },
      }),
      { type: 'tasks', showAll: { route: '/task-manager', label: `Show all ${r.tasks.length} tasks` } }
    );
  }
  if (toolName === 'task.create' && r?.created) {
    return [
      {
        id: bid('task', r.created.id),
        type: 'task',
        entityId: r.created.id,
        compact: { id: r.created.id, title: r.created.title, status: r.created.status },
      },
    ];
  }
  // Filter reads (task.today/thisWeek/overdue/blocked/waitingApproval/byOrg/byAgent) all return { tasks }.
  if (Array.isArray(r?.tasks) && toolName.startsWith('task.')) {
    if (!r.tasks.length) return emptyBlock(toolName, 'No matching tasks.');
    return clampList(
      r.tasks,
      (t) => ({
        id: bid('task', t.id),
        type: 'task',
        entityId: t.id,
        compact: { id: t.id, title: t.title, status: t.status, priority: t.priority, due_date: t.deadline || null },
      }),
      { type: 'tasks', showAll: { route: '/task-manager', label: `Show all ${r.tasks.length} tasks` } }
    );
  }
  return [];
}

function extractPulse(toolName, args, r) {
  if (toolName === 'pulse.list') {
    if (!r?.pulses?.length) return emptyBlock(toolName, 'No pulses configured.');
    return clampList(
      r.pulses,
      (p) => ({
        id: bid('pulse', p.id),
        type: 'pulse',
        entityId: p.id,
        compact: { id: p.id, title: p.agent_role || p.action, action: p.action, enabled: !!p.enabled, trigger_type: p.trigger_type, last_fired_at: p.last_fired_at, next_due_at: p.next_due_at },
      }),
      { type: 'pulses', showAll: { route: '/pulses', label: `Show all ${r.pulses.length}` } }
    );
  }
  if (toolName === 'pulse.get' && r?.pulse) {
    const p = r.pulse;
    return [{ id: bid('pulse', p.id), type: 'pulse', entityId: p.id, compact: { id: p.id, title: p.agent_role || p.action, action: p.action, enabled: !!p.enabled, trigger_type: p.trigger_type, last_fired_at: p.last_fired_at }, expanded: { cycles: (r.cycles || []).slice(0, 5) } }];
  }
  if ((toolName === 'pulse.pause' || toolName === 'pulse.resume' || toolName === 'pulse.create') && (r?.updated || r?.created)) {
    const p = r.updated || r.created;
    return [{ id: bid('pulse', p.id), type: 'pulse', entityId: p.id, compact: { id: p.id, title: p.action, action: p.action, enabled: !!p.enabled } }];
  }
  if (toolName === 'pulse.fireNow' && r?.fired) {
    return [{ id: bid('pulse', r.fired), type: 'pulse', entityId: r.fired, compact: { id: r.fired, title: 'Pulse fired', action: 'fireNow', enabled: true } }];
  }
  return [];
}

function extractLoop(toolName, args, r) {
  const list = r?.loops;
  if (toolName === 'loop.list') {
    if (!list?.length) return emptyBlock(toolName, 'No looping goals.');
    return clampList(
      list,
      (g) => ({
        id: bid('loop', g.id),
        type: 'loop',
        entityId: g.id,
        deepLink: `/goals/${g.id}`,
        compact: { id: g.id, title: g.title, status: g.status, iteration: g.iteration, max_iterations: g.max_iterations, loop_paused: !!g.loop_paused },
      }),
      { type: 'loops', showAll: { route: '/dashboard', label: `Show all ${list.length}` } }
    );
  }
  if ((toolName === 'loop.pauseResume' || toolName === 'loop.updateSettings') && r?.updated) {
    const g = r.updated;
    return [{ id: bid('loop', g.id), type: 'loop', entityId: g.id, deepLink: `/goals/${g.id}`, compact: { id: g.id, title: g.title, loop_paused: !!g.loop_paused } }];
  }
  return [];
}

function extractBrief(toolName, args, r) {
  if (r?.saved) {
    return [
      {
        id: bid('kb', r.saved.id),
        type: 'kb-doc',
        entityId: r.saved.id,
        compact: { id: r.saved.id, title: r.saved.title || 'Business brief', content_type: 'note', tags: ['brief'] },
        expanded: { excerpt: trimText(r.brief, 500) },
      },
    ];
  }
  return [];
}

function extractInsights(toolName, args, r) {
  const blocks = [];
  if (r?.saved) {
    blocks.push({
      id: bid('kb', r.saved.id),
      type: 'kb-doc',
      entityId: r.saved.id,
      compact: { id: r.saved.id, title: r.saved.title || 'Insights snapshot', content_type: 'note', tags: ['insight'] },
    });
  }
  if (!r?.insights) return blocks;
  const i = r.insights;
  return blocks.concat([
    {
      id: bid('insights', i.range),
      type: 'insights-overview',
      compact: {
        range: i.range,
        metrics: [
          { label: 'Tasks due', value: i.tasks?.dueSoon ?? 0, trend: 'stable' },
          { label: 'Overdue', value: i.tasks?.overdue ?? 0, trend: (i.tasks?.overdue ? 'down' : 'stable') },
          { label: 'Workflows running', value: i.workflows?.running ?? 0, trend: 'stable' },
          { label: 'Workflows failed', value: i.workflows?.failed ?? 0, trend: (i.workflows?.failed ? 'down' : 'stable') },
          { label: 'Active goals', value: i.goals?.active ?? 0, trend: 'up' },
          { label: 'Looping goals', value: i.goals?.looping ?? 0, trend: 'stable' },
          { label: 'Decisions', value: i.consilium?.decisions ?? 0, trend: 'stable' },
          { label: 'New docs', value: i.knowledge?.newDocs ?? 0, trend: 'up' },
          { label: 'Pulses on', value: `${i.pulses?.enabled ?? 0}/${i.pulses?.total ?? 0}`, trend: 'stable' },
          { label: 'Spend', value: `$${(i.spend?.usd ?? 0).toFixed(2)}`, trend: 'stable' },
        ],
      },
    },
  ]);
}

function extractActivity(toolName, args, r) {
  if (toolName === 'activity.feed' && Array.isArray(r?.events)) {
    if (!r.events.length) return emptyBlock(toolName, 'No recent activity.');
    return [
      {
        id: bid('timeline', r.range),
        type: 'timeline',
        compact: {
          range: r.range,
          events: r.events.slice(0, 10).map((e) => ({
            title: e.source === 'goal' ? (e.type || 'update') : (e.title || 'notification'),
            detail: e.body || e.ref || '',
            at: e.at,
            source: e.source,
          })),
        },
      },
    ];
  }
  return [];
}

function extractWorkflow(toolName, args, r) {
  if (toolName === 'workflow.list') {
    if (!r?.workflows?.length) return emptyBlock(toolName, 'No workflows yet.');
    return clampList(
      r.workflows,
      (w) => ({
        id: bid('wf', w.id),
        type: 'workflow',
        entityId: w.id,
        compact: {
          id: w.id,
          name: w.name,
          enabled: !!w.enabled,
          updated_at: w.created_at,
        },
      }),
      { type: 'workflows', showAll: { route: '/workflow', label: `Show all ${r.workflows.length}` } }
    );
  }
  if (toolName === 'workflow.get' && r?.workflow) {
    const w = r.workflow;
    return [
      {
        id: bid('wf', w.id),
        type: 'workflow',
        entityId: w.id,
        compact: { id: w.id, name: w.name, enabled: !!w.enabled, updated_at: w.updated_at || w.created_at },
        expanded: {
          description: w.description || '',
          trigger: w.data?.trigger || w.trigger || '',
          step_count: Array.isArray(w.data?.nodes) ? w.data.nodes.length : (Array.isArray(w.nodes) ? w.nodes.length : 0),
        },
      },
    ];
  }
  if ((toolName === 'workflow.toggle' || toolName === 'workflow.execute') && r?.updated) {
    return [
      {
        id: bid('wf', r.updated),
        type: 'workflow',
        entityId: r.updated,
        compact: { id: r.updated, name: r.message || toolName, enabled: r.enabled ?? true },
      },
    ];
  }
  return [];
}

function extractReport(toolName, args, r) {
  if (toolName === 'report.list') {
    if (!r?.reports?.length) return emptyBlock(toolName, 'No report snapshots yet.');
    return clampList(
      r.reports,
      (rep) => ({
        id: bid('report', rep.id),
        type: 'report',
        entityId: rep.id,
        compact: {
          id: rep.id,
          type: rep.type,
          period: rep.date,
          headline: rep.headline,
        },
      }),
      { type: 'reports', showAll: { route: '/reports', label: `Show all ${r.reports.length}` } }
    );
  }
  if (
    (toolName === 'report.summary' || toolName === 'report.generate' || toolName === 'report.send' || toolName === 'report.fetch')
    && r?.report
  ) {
    const rep = r.report;
    const m = rep.summary?.metrics || {};
    const topMetrics = [];
    if (m.totalRevenue != null) topMetrics.push({ label: 'Revenue', value: `$${Math.round(m.totalRevenue).toLocaleString()}` });
    if (m.totalSpend != null) topMetrics.push({ label: 'Spend', value: `$${Math.round(m.totalSpend).toLocaleString()}` });
    if (m.roi != null) topMetrics.push({ label: 'ROI', value: `${Number(m.roi).toFixed(1)}%` });
    if (m.activeProjects != null) topMetrics.push({ label: 'Active projects', value: m.activeProjects });
    return [
      {
        id: bid('report', `${rep.type}-${Date.now()}`),
        type: 'report',
        entityId: null,
        deepLink: rep.deepLink || null,
        compact: {
          type: rep.type,
          period: rep.period || 'current',
          top_metrics: topMetrics.slice(0, 4),
        },
        expanded: {
          snippet: trimText(rep.summary?.text, 800),
          deep_link: rep.deepLink || null,
        },
      },
    ];
  }
  return [];
}

function extractProject(toolName, args, r) {
  if (toolName === 'project.list') {
    if (!r?.projects?.length) return emptyBlock(toolName, 'No projects yet.');
    return clampList(
      r.projects,
      (p) => ({
        id: bid('proj', p.id),
        type: 'project',
        entityId: p.id,
        compact: { id: p.id, name: p.name, status: p.status, updated_at: p.created_at },
      }),
      { type: 'projects', showAll: { route: '/projects', label: `Show all ${r.projects.length}` } }
    );
  }
  if (toolName === 'project.create' && r?.created) {
    return [
      {
        id: bid('proj', r.created.id),
        type: 'project',
        entityId: r.created.id,
        compact: { id: r.created.id, name: r.created.name, status: 'Active' },
      },
    ];
  }
  return [];
}

function extractKb(toolName, args, r) {
  if (toolName === 'kb.list' || toolName === 'kb.search') {
    const docs = r?.documents || [];
    if (!docs.length) return emptyBlock(toolName, r?.query ? `No KB docs match "${r.query}".` : 'Knowledge base is empty.');
    return clampList(
      docs,
      (d) => ({
        id: bid('kb', d.id),
        type: 'kb-doc',
        entityId: d.id,
        compact: {
          id: d.id,
          title: d.title,
          content_type: d.content_type,
          tags: Array.isArray(d.tags) ? d.tags.slice(0, 5) : [],
          updated_at: d.created_at,
        },
      }),
      { type: 'kb-docs', showAll: { route: '/knowledge-base', label: `Show all ${docs.length}` } }
    );
  }
  if (toolName === 'kb.get' && r?.document) {
    const d = r.document;
    return [
      {
        id: bid('kb', d.id),
        type: 'kb-doc',
        entityId: d.id,
        compact: {
          id: d.id,
          title: d.title,
          content_type: d.content_type,
          tags: Array.isArray(d.tags) ? d.tags.slice(0, 5) : [],
          updated_at: d.created_at,
        },
        expanded: { excerpt: trimText(d.content, 400) },
      },
    ];
  }
  return [];
}

function extractOrg(toolName, args, r) {
  if (toolName === 'org.list' || toolName === 'organization.list') {
    if (!r?.organizations?.length) return emptyBlock(toolName, 'No organizations yet.');
    return clampList(
      r.organizations,
      (o) => ({
        id: bid('org', o.id),
        type: 'organization',
        entityId: o.id,
        compact: { id: o.id, name: o.name, org_type: o.org_type },
      }),
      { type: 'orgs', showAll: { route: '/organizations', label: `Show all ${r.organizations.length}` } }
    );
  }
  if (toolName === 'org.get' && r?.organization) {
    const o = r.organization;
    return [
      {
        id: bid('org', o.id),
        type: 'organization',
        entityId: o.id,
        compact: { id: o.id, name: o.name, org_type: o.org_type },
      },
    ];
  }
  if (toolName === 'org.tree' && r?.tree) {
    const count = r.count || 0;
    return [
      {
        id: bid('org', 'tree'),
        type: 'organization',
        entityId: null,
        compact: { name: 'Org structure', org_type: 'tree', subsidiary_count: count },
        expanded: { tree: r.tree },
      },
    ];
  }
  return [];
}

function extractAgent(toolName, args, r) {
  if (toolName === 'agent.list' || toolName === 'agent.recommend') {
    if (!r?.agents?.length) return emptyBlock(toolName, 'No agents available.');
    return clampList(
      r.agents,
      (a) => ({
        id: bid('agent', a.agent_id || a.id),
        type: 'agent',
        entityId: a.agent_id || a.id,
        compact: {
          id: a.agent_id || a.id,
          name: a.name || a.agent_id || 'Agent',
          role: a.role,
          availability: a.availability_status,
        },
      }),
      { type: 'agents', showAll: { route: '/agent-hub', label: `Show all ${r.agents.length}` } }
    );
  }
  return [];
}

function extractRequest(toolName, args, r) {
  if (toolName === 'request.list' && r?.requests) {
    if (!r.requests.length) return emptyBlock(toolName, 'No requests yet.');
    return clampList(
      r.requests,
      (rq) => ({
        id: bid('req', rq.id),
        type: 'request',
        entityId: rq.id,
        compact: { id: rq.id, text: rq.text, status: rq.status, priority: rq.priority },
      }),
      { type: 'requests', showAll: { route: '/job-pool', label: `Show all ${r.requests.length}` } }
    );
  }
  return [];
}

function extractTool(toolName, args, r) {
  if (toolName === 'tool.list') {
    if (!r?.tools?.length) return emptyBlock(toolName, 'No tools connected yet.');
    return clampList(
      r.tools,
      (t) => ({
        id: bid('tool', t.id),
        type: 'tool',
        entityId: t.id,
        compact: { id: t.id, name: t.name, connection_type: t.connection_type, status: t.status },
      }),
      { type: 'tools', showAll: { route: '/tools', label: `Show all ${r.tools.length}` } }
    );
  }
  if (toolName === 'tool.get' && r?.tool) {
    const t = r.tool;
    return [
      {
        id: bid('tool', t.id),
        type: 'tool',
        entityId: t.id,
        compact: { id: t.id, name: t.name, connection_type: t.connection_type, status: t.status },
      },
    ];
  }
  return [];
}

function extractMarketplace(toolName, args, r) {
  if (toolName === 'marketplace.list' || toolName === 'marketplace.myListings') {
    if (!r?.listings?.length) return emptyBlock(toolName, 'No listings found.');
    return clampList(
      r.listings,
      (l) => ({
        id: bid('mkt', l.id),
        type: 'marketplace-listing',
        entityId: l.id,
        compact: {
          id: l.id,
          title: l.title,
          price: l.price_usd,
          rating: l.avg_rating,
          vendor: l.creator_id ? String(l.creator_id).slice(0, 8) : null,
        },
      }),
      { type: 'listings', showAll: { route: '/marketplace', label: `Show all ${r.listings.length}` } }
    );
  }
  if (toolName === 'marketplace.get' && r?.listing) {
    const l = r.listing;
    return [
      {
        id: bid('mkt', l.id),
        type: 'marketplace-listing',
        entityId: l.id,
        compact: { id: l.id, title: l.title, price: l.price_usd, rating: l.avg_rating },
        expanded: { description: trimText(l.description, 400) },
      },
    ];
  }
  return [];
}

function extractConsilium(toolName, args, r) {
  if (toolName === 'consilium.recentDecisions' && r?.decisions) {
    if (!r.decisions.length) return emptyBlock(toolName, 'No recent decisions.');
    return clampList(
      r.decisions,
      (d) => ({
        id: bid('dec', d.id),
        type: 'communicator-thread',
        entityId: d.id,
        compact: {
          id: d.id,
          platform: 'consilium',
          channel_name: trimText(d.topic, 80),
          last_message_at: d.created_at,
        },
      }),
      { type: 'decisions', showAll: { route: '/consilium', label: `Show all ${r.decisions.length}` } }
    );
  }
  return [];
}

function extractPartner(toolName, args, r) {
  if (toolName === 'partner.list') {
    if (!r?.partners?.length) return emptyBlock(toolName, 'No partners yet.');
    return clampList(
      r.partners,
      (p) => ({
        id: bid('partner', p.id),
        type: 'partner',
        entityId: p.id,
        compact: { id: p.id, name: p.name, team: p.team, status: p.status, agreement: p.agreement },
      }),
      { type: 'partners', showAll: { route: '/partners', label: `Show all ${r.partners.length}` } }
    );
  }
  return [];
}

const EXTRACTORS = {
  goal: extractGoal,
  task: extractTask,
  workflow: extractWorkflow,
  report: extractReport,
  project: extractProject,
  kb: extractKb,
  org: extractOrg,
  organization: extractOrg,
  agent: extractAgent,
  request: extractRequest,
  tool: extractTool,
  marketplace: extractMarketplace,
  consilium: extractConsilium,
  partner: extractPartner,
  pulse: extractPulse,
  loop: extractLoop,
  insights: extractInsights,
  activity: extractActivity,
  brief: extractBrief,
};

/**
 * Extract inline chat blocks for a single tool call result.
 * Returns an array (possibly empty). Never throws — wrap-and-swallow on error.
 */
export function extractBlocks(toolName, args, rawResult) {
  if (!toolName || !rawResult) return [];
  try {
    const [category] = String(toolName).split('.');
    const fn = EXTRACTORS[category];
    if (!fn) return [];
    const blocks = fn(toolName, args || {}, rawResult);
    return asArray(blocks);
  } catch {
    return [];
  }
}

export default extractBlocks;
