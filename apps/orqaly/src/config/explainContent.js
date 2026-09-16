/**
 * Central "Explain?" guide content, keyed by route. Each page marks its real
 * sections with `data-tour-block="<id>"`; PageExplain auto-discovers them in DOM
 * order and ExplainTour renders the copy below - block by block, in plain human
 * language (same shape + tone as the Assistant page's tour).
 *
 * Shape:
 *   EXPLAIN_CONTENT['/route'] = {
 *     blocks: { '<id>': { title, how, source, needs?: string[], cta?: { label, to? } } }
 *   }
 * Block ids are the marker's id (or the slug of a BentoCard title). Resolution
 * falls back to the parent route, mirroring getPageTitle.
 */

/** Stable id from a human title - shared by BentoCard markers and these keys. */
export function slugifyTitle(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export const EXPLAIN_CONTENT = {
  '/organizations': {
    blocks: {
      'org-metrics': {
        title: 'Overview stats',
        how: 'Six tiles summarising your organizations - totals, how many are active, and the money view (invested, returned, ROI, profit). Hide or show them with the eye button in the header.',
        source: 'your organizations and their linked finances.',
      },
      'org-tabs': {
        title: 'Type filter',
        how: 'Quick filters - All, Active, Holdings, Subsidiaries, Departments. Click one to instantly narrow the list below.',
        source: 'the type of each organization.',
      },
      'org-toolbar': {
        title: 'Controls',
        how: 'Search by name, switch between list, card and graph views, open the activity log, and click Add to create a new organization.',
        source: 'your organizations.',
        cta: { label: 'Add an organization', to: '/organizations' },
      },
      'org-content': {
        title: 'Your organizations',
        how: 'The main view - a sortable table, a card grid, or an interactive hierarchy graph. Click a row or card to open its details; in graph view, drag nodes to explore parent and subsidiary links.',
        source: 'your organization hierarchy and metrics.',
      },
    },
  },

  '/consilium': {
    blocks: {
      'consilium-metrics': {
        title: 'Board stats',
        how: 'At-a-glance counts - total boards, members across all boards, and active vs completed jobs.',
        source: 'your Consilium boards and their jobs.',
      },
      'consilium-tabs': {
        title: 'Sections',
        how: 'Switch between Boards, Members, Criteria, Agent Helper, Analytics, Security and Governance. Each tab controls one part of how your AI boards decide.',
        source: 'your Consilium configuration.',
      },
      'consilium-content': {
        title: 'Board workspace',
        how: 'The active section - e.g. your list of boards, the member roster (chairman, evaluator, auditor, specialist, observer), scoring criteria, or governance and security rules.',
        source: 'the selected Consilium tab.',
      },
    },
  },

  '/agent-hub': {
    blocks: {
      'agent-metrics': {
        title: 'Agent stats',
        how: 'Totals for your agents, how many are active, and their roles and skills at a glance.',
        source: 'your agent workforce.',
      },
      'agent-tabs': {
        title: 'Sections',
        how: 'Move between your agent list, the builder, your saved agents and the skills marketplace.',
        source: 'the selected Agents tab.',
      },
      'agent-toolbar': {
        title: 'Controls',
        how: 'Search agents, filter by category, status or connection, switch list or card view, and create or import an agent.',
        source: 'your agents.',
        cta: { label: 'Find agents in the marketplace', to: '/marketplace' },
      },
      'agent-content': {
        title: 'Your agents',
        how: 'The list or cards of your agents with role, status and skills. Click one to open its full profile, tools and history.',
        source: 'your agents and their performance.',
      },
    },
  },

  '/tools': {
    blocks: {
      'tools-metrics': {
        title: 'Tool stats',
        how: 'Counts for total tools, active, blocked, and connected MCP integrations.',
        source: 'your tool catalog.',
      },
      'tools-toolbar': {
        title: 'Controls',
        how: 'Filter and search tools, switch list or card view, manage categories, and click Add to connect a new tool.',
        source: 'your tools.',
        cta: { label: 'Browse tools in the marketplace', to: '/marketplace' },
      },
      'tools-content': {
        title: 'Your tools',
        how: 'Every tool agents can call - name, status, category, connection type and how many agents use it. Test a connection before agents rely on it; block a tool to stop its use.',
        source: 'your connected tools and the MCP/Composio catalog.',
      },
    },
  },

  '/knowledge-base': {
    blocks: {
      'kb-metrics': {
        title: 'Library stats',
        how: 'Totals for your documents, notes, files, links and pinned items.',
        source: 'your knowledge base entries.',
      },
      'kb-toolbar': {
        title: 'Controls',
        how: 'Search and filter your knowledge, switch card or table view, open Sources to connect clouds, open the Storage monitor, and add or import documents.',
        source: 'your knowledge base.',
      },
      'kb-content': {
        title: 'Your knowledge',
        how: 'The documents, notes and links your agents can draw on - sortable, pinnable, and grouped by category. Click an entry to read or edit it.',
        source: 'your knowledge documents (with semantic search).',
      },
      'connected-sources': {
        title: 'Connected sources',
        how: 'Connect Notion, Obsidian, Google Drive, Dropbox, OneDrive or Mega. Download brings files into the Knowledge Base; Live reads them over the connection at query time.',
        source: 'your saved connections and per-provider credentials in the vault.',
        needs: ['A provider token/login, or files to import'],
      },
      'storage-monitor': {
        title: 'Storage monitor',
        how: 'Real per-provider storage usage, quota, sync health and errors, with a storage-over-time chart. Flip Advanced for latency, exact bytes and the activity log.',
        source: 'live provider quota probes + your sync history.',
        needs: ['At least one connected source'],
      },
    },
  },

  '/communicator': {
    blocks: {
      'communicator-metrics': {
        title: 'Activity stats',
        how: "Today's events, goal threads, total messages, commands run and decisions - a live pulse of everything talking.",
        source: 'your communication logs.',
      },
      'communicator-view-tabs': {
        title: 'Two views',
        how: 'Switch between Platform Agents (what your agents are doing) and Personal Assistant (your bot and its settings).',
        source: 'your workspace vs your assistant.',
      },
      'communicator-sidebar': {
        title: 'Sections',
        how: 'Pick a section - live activity, goal history, channels, files, scheduled reports, audit log and more. The list changes with the view you chose above.',
        source: 'the selected view.',
      },
      'communicator-content': {
        title: 'Main pane',
        how: 'Shows the section you picked - the activity feed, a channel setup, files, and so on.',
        source: 'the selected section.',
      },
      'communicator-footer': {
        title: 'Connection status',
        how: 'Your live status - the Telegram link and Connect/Disconnect for the assistant, or active rooms and decisions for the workspace.',
        source: 'your connected channels.',
      },
    },
  },

  '/marketplace': {
    blocks: {
      'marketplace-metrics': {
        title: 'Catalog stats',
        how: 'How many Agent templates, Skill packs, MCP tools, rentable models, templates and businesses are available to import.',
        source: 'the marketplace catalog.',
      },
      'marketplace-tabs': {
        title: 'Categories',
        how: 'Browse by type - Organizations, Consilium, Agents, Models, Tools, Skills, Businesses and Replicators.',
        source: 'the selected catalog.',
      },
      'marketplace-content': {
        title: 'Browse & import',
        how: 'Cards you can preview and import straight into your workspace. Creators earn on an 85/15 split when you use theirs.',
        source: 'the marketplace catalog + your imports.',
      },
    },
  },

  '/workflow': {
    blocks: {
      'workflow-toolbar': {
        title: 'Controls',
        how: 'Search and filter your automations, switch grid or table view, and click Create to build a new workflow.',
        source: 'your workflows.',
        cta: { label: 'Create a workflow', to: '/workflow' },
      },
      'workflow-content': {
        title: 'Your workflows',
        how: 'Each automation with its status, block count and version. Play or pause to activate, click to open the visual editor, or check its run history.',
        source: 'the workflow engine + run history.',
      },
    },
  },

  '/reports': {
    blocks: {
      'reports-tab-nav': {
        title: 'Reports vs LLM',
        how: 'Switch between your standard business reports and LLM usage reports.',
        source: 'your report data.',
      },
      'reports-ai-builder': {
        title: 'AI report builder',
        how: 'Describe the report you want in plain words - the AI picks the best template or builds a custom one and opens it in the studio.',
        source: 'your data + an LLM.',
      },
      // Common report-section cards (auto-registered by title -> slug):
      'kpi-grid': {
        title: 'KPI grid',
        how: 'The headline numbers for this report, each with its trend vs the previous period.',
        source: 'your daily KPI snapshots.',
      },
      'ranked-table': {
        title: 'Ranked table',
        how: 'A leaderboard - the top rows by the chosen measure. Click a row to drill into its detail.',
        source: 'your report dataset.',
      },
      'alerts-list': {
        title: 'Alerts',
        how: 'Anything that crossed a threshold or needs attention in this reporting window.',
        source: 'your report rules.',
      },
    },
  },

  '/job-pool': {
    blocks: {
      'jobpool-tabs': {
        title: 'Goals & Loops',
        how: 'Two views - Goals (one-off requests you hand to the platform) and Loops (recurring, self-running agent loops). Click to switch between them.',
        source: 'your goals and loops.',
      },
      'jobpool-metrics': {
        title: 'Request stats',
        how: 'A live count of your goals by stage - total, planning, active, awaiting tools/keys, and completed. Hide them with the Metrics button.',
        source: 'your goals and their pipeline stage.',
      },
      'jobpool-toolbar': {
        title: 'Controls',
        how: 'Filter and search your requests, switch card or list view, and click New Goal to start one - describe what you want and the platform plans it, forms a team, and runs it.',
        source: 'your requests.',
        cta: { label: 'Start a new goal', to: '/job-pool?action=create' },
      },
      'jobpool-content': {
        title: 'Your requests',
        how: 'Each goal as a card or row - status, phase progress, budget and cost so far. Click one to open its detail and watch it run, or retry a failed one.',
        source: 'your goals and their execution.',
      },
    },
  },

  '/dashboard': {
    blocks: {
      'dashboard-hero': {
        title: 'Command bar',
        how: 'Your AI orb and greeting - type a natural-language command or a quick action to kick things off.',
        source: 'your assistant.',
      },
      'dashboard-kpi': {
        title: 'Goal monitoring',
        how: "Four KPIs - what you're working on, what needs attention, what's completed, and tokens spent. Click one to filter.",
        source: 'your goals + usage.',
      },
      'dashboard-categories': {
        title: 'Quick hubs',
        how: 'Shortcut cards to Requests, Communicator and the Dashboard with live counts. Click to jump straight there.',
        source: 'your live activity.',
      },
      'dashboard-history': {
        title: 'Goals history',
        how: 'Filter your goals by status, date, cost and keyword, then browse the results. Click a goal to open its full detail.',
        source: 'your goals.',
      },
    },
  },
};

/** Resolve the guide for a route, falling back to parent segments. */
export function resolveExplain(pathname) {
  if (!pathname) return null;
  if (EXPLAIN_CONTENT[pathname]) return EXPLAIN_CONTENT[pathname];
  const parts = pathname.split('/').filter(Boolean);
  while (parts.length > 1) {
    parts.pop();
    const p = `/${parts.join('/')}`;
    if (EXPLAIN_CONTENT[p]) return EXPLAIN_CONTENT[p];
  }
  return null;
}
