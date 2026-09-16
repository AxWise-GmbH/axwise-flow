/**
 * Capabilities catalog — single source of truth for the assistant home page.
 *
 * Two surfaces consume this:
 *  1. HOME_TILES — the 6 capability cards shown on the empty assistant home.
 *  2. SLASH_COMMANDS — the `/`-triggered command palette that exposes every
 *     backend tool from `lib/api-handlers/assistant-chat.js#TOOL_CATALOG`.
 *
 * Tiles dispatch a natural-language `text` payload through the same submit
 * path as typing — the LLM handles intent parsing. Slash commands insert a
 * templated NL prompt with placeholders the user fills in.
 *
 * `liveCountKey` on a tile maps to a field returned by
 * `GET /api/assistant-home-summary`; rendered as a small chip when present.
 */
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import TodayRoundedIcon from '@mui/icons-material/TodayRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import AssessmentRoundedIcon from '@mui/icons-material/AssessmentRounded';
import PlayCircleOutlineRoundedIcon from '@mui/icons-material/PlayCircleOutlineRounded';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import InsightsRoundedIcon from '@mui/icons-material/InsightsRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import LoopRoundedIcon from '@mui/icons-material/LoopRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';

export const HOME_TILES = [
  {
    id: 'goal',
    title: 'LAUNCH A GOAL',
    description: 'Start the autonomous 12-stage pipeline.',
    text: 'I want to launch a new goal — help me describe it and set a budget.',
    icon: AutoAwesomeRoundedIcon,
    liveCountKey: 'activeGoals',
    liveCountLabel: 'active',
  },
  {
    id: 'briefing',
    title: 'TODAY’S BRIEFING',
    description: 'Tasks due, goals advancing, top alerts.',
    text: 'Give me today’s briefing: tasks due, goals advancing, and the top alerts.',
    icon: TodayRoundedIcon,
    liveCountKey: 'tasksDueThisWeek',
    liveCountLabel: 'due',
  },
  {
    id: 'consilium',
    title: 'ASK THE CONSILIUM',
    description: 'Multi-board AI discussion on a strategic question.',
    text: 'Ask the Consilium board to weigh in on a strategic question — I’ll tell you the topic.',
    icon: GroupsRoundedIcon,
    liveCountKey: 'boards',
    liveCountLabel: 'boards',
  },
  {
    id: 'report',
    title: 'RUN A REPORT',
    description: 'Finance, partner-perf, operations, or executive.',
    text: 'Run a smart report — ask me which type (finance, partner performance, operations, executive) and the period.',
    icon: AssessmentRoundedIcon,
    liveCountKey: 'recentReports',
    liveCountLabel: 'recent',
  },
  {
    id: 'workflow',
    title: 'TRIGGER A WORKFLOW',
    description: 'Pick an existing workflow and run it now.',
    text: 'Show me my workflows so I can pick one to run now.',
    icon: PlayCircleOutlineRoundedIcon,
    liveCountKey: 'workflows',
    liveCountLabel: 'ready',
  },
  {
    id: 'insights',
    title: 'SHOW INSIGHTS',
    description: 'Today’s overview: KPIs, workflows, spend.',
    text: 'Give me an insights overview: tasks due, workflows, blocked goals, and spend.',
    icon: InsightsRoundedIcon,
  },
  {
    id: 'pulse',
    title: 'MONITOR PULSES',
    description: 'Pulse health and recent cycles.',
    text: 'Show my Pulses: which are on, and when they last fired.',
    icon: BoltRoundedIcon,
  },
  {
    id: 'loops',
    title: 'REVIEW LOOPS',
    description: 'Looping goals and their latest iterations.',
    text: 'Show my looping goals and their latest iterations.',
    icon: LoopRoundedIcon,
  },
  {
    id: 'activity',
    title: 'RECENT ACTIVITY',
    description: 'What changed across the platform lately.',
    text: 'What happened across my platform this week?',
    icon: HistoryRoundedIcon,
  },
  {
    id: 'talk',
    title: 'LET’S TALK',
    description: 'Think out loud — no actions, just conversation.',
    text: 'I just want to think out loud with you. No actions, just brainstorm.',
    icon: ChatBubbleOutlineRoundedIcon,
    mode: 'talk',
  },
];

/**
 * Slash-command catalog. Each entry mirrors a backend TOOL_CATALOG entry
 * but rendered for the palette UI: a `template` that becomes the prompt
 * (with `[placeholder]` markers the user fills in).
 *
 * Grouped by category for the palette UI.
 */
export const SLASH_COMMANDS = [
  // Goals — flagship
  {
    id: 'goal.create',
    category: 'Goals',
    label: 'Create a goal',
    hint: 'Start the autonomous pipeline',
    template: 'Create a goal: [describe what you want to achieve] with a budget of [USD amount].',
  },
  {
    id: 'goal.list',
    category: 'Goals',
    label: 'List my goals',
    hint: 'Recent 20',
    template: 'List my recent goals.',
  },

  // Partners
  {
    id: 'partner.create',
    category: 'Partners',
    label: 'Create a partner',
    hint: 'name, team, agreement',
    template:
      'Create a new partner named [name] with agreement type [Revshare|CPL|Hybrid] in geos [US, UK].',
  },
  {
    id: 'partner.list',
    category: 'Partners',
    label: 'List partners',
    hint: 'all partners',
    template: 'List my partners.',
  },
  {
    id: 'partner.update',
    category: 'Partners',
    label: 'Update partner',
    hint: 'change details',
    template: 'Update partner [name or id]: set [field] to [value].',
  },
  {
    id: 'partner.archive',
    category: 'Partners',
    label: 'Archive partner',
    hint: 'high-risk',
    template: 'Archive partner [name or id]. Reason: [why].',
  },

  // Projects
  {
    id: 'project.create',
    category: 'Projects',
    label: 'Create a project',
    hint: 'linked to a partner',
    template: 'Create a project named [name] for partner [partner name].',
  },
  {
    id: 'project.list',
    category: 'Projects',
    label: 'List projects',
    template: 'List my projects.',
  },
  {
    id: 'project.update',
    category: 'Projects',
    label: 'Update project',
    template: 'Update project [name or id]: set status to [Active|Paused|Completed|Archived].',
  },
  {
    id: 'project.delete',
    category: 'Projects',
    label: 'Delete project',
    hint: 'high-risk',
    template: 'Delete project [name or id].',
  },

  // Workflows
  {
    id: 'workflow.list',
    category: 'Workflows',
    label: 'List workflows',
    template: 'List my workflows.',
  },
  {
    id: 'workflow.execute',
    category: 'Workflows',
    label: 'Run a workflow',
    hint: 'execute now',
    template: 'Run workflow [name or id] now.',
  },
  {
    id: 'workflow.toggle',
    category: 'Workflows',
    label: 'Toggle workflow',
    template: 'Toggle workflow [name or id] on/off.',
  },
  {
    id: 'workflow.create',
    category: 'Workflows',
    label: 'Create workflow',
    template: 'Create a workflow named [name]: [describe what it should do].',
  },

  // Tasks
  { id: 'task.list', category: 'Tasks', label: 'List tasks', template: 'List my team tasks.' },
  {
    id: 'task.create',
    category: 'Tasks',
    label: 'Create a task',
    template: 'Create a task for partner [partner name]: [task title]. Priority [low|medium|high].',
  },
  {
    id: 'task.update',
    category: 'Tasks',
    label: 'Update task',
    template: 'Update task [title or id]: set status to [done|in_progress|blocked].',
  },
  {
    id: 'task.delete',
    category: 'Tasks',
    label: 'Delete task',
    hint: 'high-risk',
    template: 'Delete task [title or id].',
  },
  {
    id: 'task.clearAll',
    category: 'Tasks',
    label: 'Clear all tasks',
    hint: 'critical',
    template: 'Clear all tasks for partner [partner name or "all"].',
  },

  // Reports
  {
    id: 'report.summary',
    category: 'Reports',
    label: 'Report summary',
    hint: 'top metrics',
    template: 'Give me a summary of the [finance|partner_perf|operations|executive] report.',
  },
  {
    id: 'report.generate',
    category: 'Reports',
    label: 'Generate report',
    template: 'Generate a report on [subject] for [period].',
  },
  {
    id: 'report.send',
    category: 'Reports',
    label: 'Send report',
    hint: 'generate + deliver',
    template: 'Send a [finance|partner_perf|operations|executive] report for [period].',
  },
  {
    id: 'report.list',
    category: 'Reports',
    label: 'List reports',
    template: 'List recent reports.',
  },

  // Consilium
  {
    id: 'consilium.discuss',
    category: 'Consilium',
    label: 'Ask the board',
    template: 'Ask the Consilium to discuss: [topic].',
  },
  {
    id: 'consilium.listBoards',
    category: 'Consilium',
    label: 'List boards',
    template: 'List my Consilium boards.',
  },
  {
    id: 'consilium.recentDecisions',
    category: 'Consilium',
    label: 'Recent decisions',
    template: 'Show the recent decisions from my Consilium boards.',
  },

  // Knowledge Base
  {
    id: 'kb.search',
    category: 'Knowledge',
    label: 'Search KB',
    template: 'Search the knowledge base for [query].',
  },
  {
    id: 'kb.list',
    category: 'Knowledge',
    label: 'List KB documents',
    template: 'List my knowledge-base documents.',
  },
  {
    id: 'kb.create',
    category: 'Knowledge',
    label: 'Save to KB',
    template: 'Save a knowledge-base note titled [title]: [content].',
  },

  // Files
  { id: 'file.list', category: 'Files', label: 'List files', template: 'List my uploaded files.' },
  {
    id: 'file.get',
    category: 'Files',
    label: 'Get a file',
    template: 'Get the contents of file [id].',
  },

  // Marketplace
  {
    id: 'marketplace.list',
    category: 'Marketplace',
    label: 'Browse marketplace',
    template: 'Browse the marketplace top listings.',
  },
  {
    id: 'marketplace.myListings',
    category: 'Marketplace',
    label: 'My listings',
    template: 'List my marketplace listings.',
  },
  {
    id: 'marketplace.myPurchases',
    category: 'Marketplace',
    label: 'My purchases',
    template: 'List my marketplace purchases.',
  },

  // Investments
  {
    id: 'invest.listDeals',
    category: 'Investments',
    label: 'List deals',
    template: 'List my investment deals.',
  },
  {
    id: 'invest.myCommitments',
    category: 'Investments',
    label: 'My commitments',
    template: 'List my investment commitments.',
  },
  {
    id: 'invest.listPools',
    category: 'Investments',
    label: 'List pools',
    template: 'List my investment pools.',
  },

  // Organizations
  {
    id: 'org.list',
    category: 'Organizations',
    label: 'List organizations',
    template: 'List my organizations.',
  },
  {
    id: 'org.tree',
    category: 'Organizations',
    label: 'Org tree',
    template: 'Show my organization hierarchy.',
  },
  {
    id: 'org.createSubsidiary',
    category: 'Organizations',
    label: 'Create subsidiary',
    template: 'Create a subsidiary named [name] under [parent org].',
  },

  // Agents
  {
    id: 'agent.recommend',
    category: 'Agents',
    label: 'Recommend agents',
    template: 'Recommend the best agents for project [project name or id].',
  },
  {
    id: 'agent.assign',
    category: 'Agents',
    label: 'Assign agent',
    template: 'Assign agent [agent name] to project [project name].',
  },

  // System
  {
    id: 'system.predict',
    category: 'System',
    label: 'Predict',
    hint: 'forecast',
    template: 'Predict [partners|projects|workflows|revenue|all] trends.',
  },
  {
    id: 'system.healthCheck',
    category: 'System',
    label: 'Health check',
    template: 'Run a health check on the platform.',
  },

  // Pulse
  { id: 'pulse.list', category: 'Pulse', label: 'List pulses', hint: 'automation health', template: 'Show my Pulses and when they last fired.' },
  { id: 'pulse.create', category: 'Pulse', label: 'Create pulse', hint: 'schedule an action', template: 'Create a Pulse that runs [action] on a [schedule].' },
  { id: 'pulse.fireNow', category: 'Pulse', label: 'Fire pulse now', hint: 'run immediately', template: 'Fire the Pulse [name] right now.' },

  // Loops
  { id: 'loops.list', category: 'Loops', label: 'List looping goals', hint: 'iterative goals', template: 'Show my looping goals and their latest iterations.' },
  { id: 'loop.status', category: 'Loops', label: 'Loop status', hint: 'one goal', template: 'What is the loop status of goal [goal name]?' },

  // Insights
  { id: 'insights.overview', category: 'Insights', label: 'Overview', hint: 'today', template: 'Give me an insights overview for today.' },
  { id: 'insights.period', category: 'Insights', label: 'Weekly / monthly', hint: 'a period', template: 'Give me the [weekly|monthly] insights summary.' },

  // Activity
  { id: 'activity.recent', category: 'Activity', label: 'Recent activity', hint: 'what changed', template: 'What happened across my platform [today|this week|this month]?' },
  { id: 'activity.errors', category: 'Activity', label: 'Failures & errors', hint: 'what broke', template: 'Show recent failures and workflow errors.' },

  // Navigation
  {
    id: 'navigate',
    category: 'Navigation',
    label: 'Navigate',
    hint: 'jump to a page',
    template: 'Navigate to [page name].',
  },
];

export const SLASH_CATEGORIES = Array.from(new Set(SLASH_COMMANDS.map((c) => c.category)));

/**
 * Filter slash commands by a user query (after the `/`).
 * Matches against id, label, and category. Empty query returns all.
 */
export function filterSlashCommands(query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => {
    return (
      c.id.toLowerCase().includes(q) ||
      c.label.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    );
  });
}

/**
 * Group commands by their `category` field for palette rendering.
 */
export function groupCommands(commands) {
  const out = {};
  for (const cmd of commands) {
    if (!out[cmd.category]) out[cmd.category] = [];
    out[cmd.category].push(cmd);
  }
  return out;
}
