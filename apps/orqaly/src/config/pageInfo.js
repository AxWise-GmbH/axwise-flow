/**
 * Page info metadata - descriptions, features, and scheme links for each page.
 * Used by sidebar info tooltips and documentation page.
 */
import { PERSONAL_CATALOG_LABEL } from './catalogUi';

export const PAGE_INFO = {
  '/arena': {
    title: 'Arena',
    description:
      'Put your people and your agents on the same daily job and see who wins. Register what your team delivered, run an agent at the same brief, rate both, and Arena keeps score by department with real cost, time and rework.',
    features: ['People vs agents', 'Cost per job', 'Department scoreboard', 'Handover decisions'],
  },
  '/home': {
    title: 'Home',
    description:
      'Your starting cockpit - an organization-centric overview with live metric tiles, active goals, recent activity, and LLM usage. Deep-link into any module from here.',
    features: ['Org overview', 'Live metrics', 'Active goals', 'Recent activity'],
  },
  '/dashboards': {
    title: 'Dashboards',
    description:
      'Build, browse, and manage custom dashboards. Create them from scratch or auto-generate them, then organize with search, card or list views, and activity history.',
    features: ['Custom dashboards', 'Auto-build', 'Card & list views', 'Activity log'],
  },
  '/replicators': {
    title: 'Replicators',
    description:
      'Generate in-platform control interfaces for any connected tool. Create a replicator from any Composio or HTTP API tool, and it becomes a sidebar group with pages you can drive.',
    features: ['Tool interfaces', 'Composio & HTTP APIs', 'Sidebar pages', 'Admin publishing'],
  },
  '/dashboard': {
    title: 'Dashboard',
    description:
      'Overview of business metrics, active goals, agent stats, and financial summary. Track KPIs and monitor real-time activity across all modules.',
    features: ['Business metrics', 'Goal tracking', 'Agent stats', 'Financial overview'],
    schemes: '/documentation?page=dashboard',
  },
  '/partners': {
    title: 'Partners',
    description:
      'Manage business partners, track collaborations, monitor performance, and handle financial relationships. Organize partner profiles and history.',
    features: ['Partner profiles', 'Finance tracking', 'Performance metrics', 'Collaboration'],
    schemes: '/documentation?page=partners',
  },
  '/finances': {
    title: 'Finances',
    description:
      'Track revenue, expenses, ROI per goal, agent costs, and marketplace transactions. View financial events, generate reports, manage payments.',
    features: ['Revenue tracking', 'ROI analysis', 'Agent costs', 'Financial events'],
    schemes: '/documentation?page=finances',
  },
  '/campaigns': {
    title: 'Campaigns',
    description:
      'Plan and execute marketing campaigns. Track performance metrics, manage budgets, and coordinate with agents for content and outreach.',
    features: ['Campaign planning', 'Budget tracking', 'Performance metrics', 'Agent coordination'],
    schemes: '/documentation?page=campaigns',
  },
  '/injection-hub': {
    title: 'Injection Hub',
    description:
      'Integration hub for connecting external services, webhooks, and data pipelines. Manage API connections and automate data flows.',
    features: ['API integrations', 'Webhooks', 'Data pipelines', 'Automation'],
    schemes: '/documentation?page=injection',
  },
  '/task-manager': {
    title: 'Task Manager',
    description:
      'Manage team tasks with Kanban boards, assignments, deadlines, and priorities. Track task progress across projects and goals.',
    features: ['Kanban boards', 'Assignments', 'Deadlines', 'Priority tracking'],
    schemes: '/documentation?page=tasks',
  },
  '/workflow': {
    title: 'Workflow',
    description:
      'Visual workflow builder with drag-and-drop blocks. Create automation pipelines, connect to projects, and manage execution flows.',
    features: ['Visual builder', 'Drag-and-drop', 'Templates', 'Project linking'],
    schemes: '/documentation?page=workflow',
  },
  '/knowledge-base': {
    title: 'Knowledge Base',
    description:
      'Central knowledge base for documents, reports, and research. Store goal outputs, PO analyses, PM plans, and retrospectives.',
    features: ['Document storage', 'Goal outputs', 'Search', 'Categories'],
    schemes: '/documentation?page=knowledge',
  },
  '/projects': {
    title: 'Projects',
    description:
      'Project management with status tracking, partner assignments, workflow links, and budget monitoring. Organize work by project.',
    features: ['Status tracking', 'Partner links', 'Workflow links', 'Budget monitoring'],
    schemes: '/documentation?page=projects',
  },
  '/reports': {
    title: 'Reports',
    description:
      'Generate and view business reports. Analyze performance data, export insights, and track progress across goals and campaigns.',
    features: ['Report generation', 'Data analysis', 'Export', 'Progress tracking'],
    schemes: '/documentation?page=reports',
  },
  '/agent-hub': {
    title: 'Agents',
    description:
      'Browse and manage AI agents. View agent profiles, capabilities, ratings, and performance. Hire agents for goals and track their work.',
    features: ['Agent profiles', 'Capabilities', 'Ratings', 'Performance history'],
    schemes: '/documentation?page=agents',
  },
  '/my-agents': {
    title: 'My Agents',
    description:
      'Your personal agent dashboard. View hired agents, teams, job history, ratings, and reuse agents for new goals and tasks.',
    features: ['Agent history', 'Teams', 'Ratings', 'Reuse agents'],
    schemes: '/documentation?page=my-agents',
  },
  '/tools': {
    title: 'Tools',
    description:
      'Configure API tools for agents - web search, email, GitHub, Canva, browser. Manage API keys and tool permissions for goal execution.',
    features: ['API key management', 'Tool config', 'Permissions', 'Agent tools'],
    schemes: '/documentation?page=tools',
  },
  '/investments': {
    title: 'Investments',
    description:
      'Hub for investors and deal publishers where real deals meet real money. AI agents and human investors collaborate to evaluate, fund, and grow opportunities together.',
    features: ['Deal publishing', 'AI & human investors', 'Investment pools', 'ROI tracking'],
    schemes: '/documentation?page=investments',
  },
  '/job-pool': {
    title: 'Requests',
    description:
      'Goal orchestration hub. Create goals, track pipeline progress, and monitor agent task execution in real-time.',
    features: ['Goal creation', 'Pipeline tracking', 'Real-time monitoring', 'Budget control'],
    schemes: '/documentation?page=job-pool',
  },
  '/organizations': {
    title: 'Organizations',
    description:
      'Step 1 - Create your company structure: holdings, subsidiaries, and divisions across industries. Then connect a Consilium board to govern each organization.',
    features: [
      'Holding structures',
      'Multi-company hierarchy',
      'KYB onboarding',
      'Consilium integration',
    ],
    schemes: '/documentation?page=organizations',
  },
  '/consilium': {
    title: 'Consilium',
    description:
      'Step 2 - Appoint a board of AI members that takes over your organization. The board hires AI agents, forms teams, evaluates quality, and governs all operations.',
    features: ['Board of members', 'Agent hiring', 'Team formation', 'Quality governance'],
    schemes: '/documentation?page=consilium',
  },
  '/communicator': {
    title: 'Communicator',
    description:
      'Operational command center - view agent conversations during goals, control the platform from messenger (like Claude Code from terminal), and audit all consilium decisions with member votes.',
    features: [
      'AI Agents Room',
      'Controller (messenger commands)',
      'Consilium Log (decision audit)',
      'Webhook receiver',
    ],
    schemes: '/documentation?page=communicator',
  },
  '/documentation': {
    title: 'Documentation',
    description:
      'Platform documentation, guides, and page schemes. Learn how each module works, view architecture diagrams, and find tutorials.',
    features: ['Guides', 'Schemes', 'Architecture', 'Tutorials'],
  },
  '/notification-center': {
    title: 'AI Assistant',
    description:
      'AI-powered notifications and assistant. Get intelligent alerts, suggestions, and automated insights about your business activity.',
    features: ['Smart alerts', 'AI suggestions', 'Activity insights', 'Notifications'],
  },
  '/audit-log': {
    title: 'Activity Log',
    description:
      'Complete audit trail of all actions across the platform. Track user activity, system events, and data changes for compliance.',
    features: ['Audit trail', 'User actions', 'System events', 'Compliance'],
  },
  '/roles': {
    title: 'Permissions',
    description:
      'Manage user roles and access permissions. Control who can access which modules, set admin privileges, and configure security.',
    features: ['Role management', 'Access control', 'Admin settings', 'Security'],
  },
  '/data': {
    title: 'Data Hub',
    description:
      'Data management and analytics. View database statistics, manage backups, and access raw data for advanced analysis and reporting.',
    features: ['Data analytics', 'Backups', 'Statistics', 'Raw data access'],
  },
  '/pulse': {
    title: 'Pulse',
    description:
      'Autonomous agent scheduling. Agents wake on an interval, check their assigned goal, do a cycle of work, learn from results, and sleep until next pulse. Consilium auto-assigns goals to free agents.',
    features: [
      'Scheduled agent cycles',
      'Keep/discard evaluation',
      'Autonomous learning',
      'Consilium auto-assignment',
    ],
    schemes: '/documentation?page=pulse',
  },
  '/marketplace': {
    title: PERSONAL_CATALOG_LABEL,
    description:
      'Browse and install agent templates, skill packs, tools, team configurations, and organization structures from one place.',
    features: [
      'Agent templates',
      'Skill packs',
      'Tool catalog',
      'Team templates',
      'Org structures',
    ],
    schemes: '/documentation?page=marketplace',
  },
  '/marketplace/import': {
    title: 'Import from a provider',
    description:
      'Request a live external provider catalog (Composio tools, OpenRouter and Hugging Face models), search it, and import the items you pick straight into the matching marketplace tab.',
    features: [
      'Live provider catalog',
      'Search & pick',
      'Composio tools',
      'OpenRouter & Hugging Face models',
    ],
  },
  '/marketing/dashboard': {
    title: 'Marketing Dashboard',
    description:
      'Overview of marketing KPIs, forecasts, and AI insights. Track acquisition performance and optimization recommendations.',
    features: ['Overview', 'KPIs', 'Forecasts', 'AI Insights'],
    schemes: '/documentation?page=marketing_dashboard',
  },
  '/marketing/audiences': {
    title: 'Audiences',
    description:
      'Manage marketing CRM, segments, cohorts, and customer journeys. Define high-value target demographics.',
    features: ['CRM', 'Segments', 'Cohorts', 'Customer Journeys'],
    schemes: '/documentation?page=marketing_audiences',
  },
  '/marketing/campaigns': {
    title: 'Campaigns',
    description:
      'Plan, schedule, and automate marketing campaigns. Set up A/B tests and trigger win-back customer workflows.',
    features: ['Active Campaigns', 'Calendar Planner', 'Automation Triggers', 'A/B Testing'],
    schemes: '/documentation?page=marketing_campaigns',
  },
  '/marketing/content': {
    title: 'Content Assets',
    description:
      'Manage creatives, assets, materials, landing page templates, and brand guidelines for unified communications.',
    features: ['Materials', 'Landing Pages', 'Templates', 'Brand Guidelines'],
    schemes: '/documentation?page=marketing_content',
  },
  '/marketing/acquisition': {
    title: 'Acquisition',
    description:
      'Track channels, traffic sources, multi-touch attribution, and UTM link generation.',
    features: ['Channels', 'Traffic Sources', 'Attribution Models', 'UTM Generator'],
    schemes: '/documentation?page=marketing_acquisition',
  },
  '/marketing/conversion': {
    title: 'Conversion Funnels',
    description:
      'Analyze user funnels, behavioral analytics, click event heatmaps, and drop-off reasons.',
    features: ['Funnels', 'Conversion Analysis', 'User Behavior', 'Event Heatmaps'],
    schemes: '/documentation?page=marketing_conversion',
  },
  '/marketing/retention': {
    title: 'Retention & VIP',
    description:
      'Loyalty programs, VIP tier structures, churn prediction alerts, reactivation triggers, and personalization rules.',
    features: ['Loyalty Tiers', 'Churn Risk', 'Reactivation discount', 'Copy Personalization'],
    schemes: '/documentation?page=marketing_retention',
  },
  '/marketing/team': {
    title: 'Team & Operations',
    description:
      'Coordinate marketing managers, check off task templates, approve creative assets, and allocate budgets.',
    features: ['Managers', 'Checklists', 'Approvals Queue', 'Budget Breakdown'],
    schemes: '/documentation?page=marketing_team',
  },
  '/settings': {
    title: 'Settings',
    description:
      'Account settings, profile details, payment methods, notifications, preferences, and security configuration.',
    features: ['Account profile', 'Payments', 'Notifications', 'Security'],
  },
};

// Titles for routes not in PAGE_INFO (or that use a different label in the header).
const TITLE_OVERRIDES = {
  '/home': 'Home',
  '/hub': 'Reports',
  '/assistant': 'Assistant',
  '/setup': 'Setup',
};

function titleizeSegment(seg) {
  return seg
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Resolve a human page title for any pathname, reusing PAGE_INFO. Falls back to
 * the parent route for nested paths (e.g. /organizations/:id -> Organizations),
 * then to a titleized first segment. Used for the simple-mode top-bar name badge.
 * @param {string} pathname
 * @returns {string|null}
 */
export function getPageTitle(pathname) {
  if (!pathname) return null;
  const p = pathname.split('?')[0];
  if (TITLE_OVERRIDES[p]) return TITLE_OVERRIDES[p];
  if (PAGE_INFO[p]?.title) return PAGE_INFO[p].title;
  const first = p.split('/').filter(Boolean)[0];
  const base = `/${first || ''}`;
  if (TITLE_OVERRIDES[base]) return TITLE_OVERRIDES[base];
  if (PAGE_INFO[base]?.title) return PAGE_INFO[base].title;
  return first ? titleizeSegment(first) : null;
}
