// Source of truth for the public marketing pages under /instruments/:slug
// and /control/:slug. Edit content here; the dynamic InstrumentPage component
// renders whatever is here.

export const GROUPS = {
  instruments: { label: 'Instruments', eyebrow: 'INSTRUMENTS' },
  control: { label: 'Control Point', eyebrow: 'CONTROL POINT' },
};

const items = [
  // ===================== INSTRUMENTS =====================
  {
    slug: 'knowledge-base',
    group: 'instruments',
    label: 'Knowledge Base',
    iconName: 'MenuBookOutlined',
    inAppRoute: '/knowledge-base',
    hero: {
      title: 'The memory your agents read from.',
      subtitle:
        'Drop in documents, web pages, transcripts, and notes. Agents query them with semantic search and surface the answer in voice, chat, or a deliverable - in seconds.',
    },
    description: [
      'The Knowledge Base is your single source of truth, plugged directly into every agent on the platform. Upload PDFs, sync from Notion, paste URLs, or push transcripts via webhook - the platform chunks, embeds, and indexes everything automatically.',
      'When an agent answers a question, drafts a report, or makes a decision, it reads from this knowledge with inline citations so you can see exactly which source was used. No vector database to wire up, no embedding pipeline to maintain. It just works.',
      'Permissions are enforced by role and by agent, so an agent only sees what it is supposed to see - even if your knowledge base spans multiple teams or customers.',
    ],
    useCases: [
      'Sales: agents answer prospect questions using your product docs and case studies',
      'Support: agents resolve tickets by referencing KB articles with cited sources',
      'Internal ops: agents answer team questions from your SOPs',
      'Marketing: agents pull product details and brand voice for content creation',
    ],
    advantages: [
      {
        vs: 'ChatGPT custom GPTs',
        body: 'Persistent, versioned, and shared across every agent in your workspace - not trapped inside one chat window.',
      },
      {
        vs: 'Notion AI search',
        body: 'Reachable through agents and APIs, not just a search box on a wiki page.',
      },
      {
        vs: 'LangChain RAG',
        body: 'Zero-config. No vector store to provision, no embedding pipeline to keep alive.',
      },
    ],
    features: [
      {
        iconName: 'SearchOutlined',
        title: 'Semantic + keyword search',
        body: 'Hybrid retrieval that falls back to keyword when the vector match is weak.',
      },
      {
        iconName: 'CloudUploadOutlined',
        title: 'Auto-chunk + embed on upload',
        body: 'Drop files, paste URLs, hit save - everything else happens for you.',
      },
      {
        iconName: 'HistoryOutlined',
        title: 'Versioning + read audit log',
        body: 'See what changed, who read it, when, from where.',
      },
      {
        iconName: 'LockOutlined',
        title: 'Role and agent permissions',
        body: 'Scope sources to the people and agents that should see them.',
      },
      {
        iconName: 'BoltOutlined',
        title: 'Webhook ingestion',
        body: 'Pipe content from Zapier, n8n, or your own systems.',
      },
      {
        iconName: 'DescriptionOutlined',
        title: 'PDFs, docs, URLs, transcripts',
        body: 'First-class support for the formats you already have.',
      },
      {
        iconName: 'FormatQuoteOutlined',
        title: 'Inline citations',
        body: 'Every agent response shows which source backed it up.',
      },
      {
        iconName: 'AutorenewOutlined',
        title: 'Bulk re-embedding',
        body: 'Re-index everything when your schema or model changes.',
      },
    ],
  },
  {
    slug: 'workflow',
    group: 'instruments',
    label: 'Workflow',
    iconName: 'AccountTreeOutlined',
    inAppRoute: '/workflow',
    hero: {
      title: 'Stitch your agents into a real workflow.',
      subtitle:
        'Visual canvas with agents inside every node — triggers, tools, branches, execution trace, and full audit. n8n-compatible import, zero glue code.',
    },
    description: [
      'Workflow is the canvas where everything connects. Drag a trigger (webhook, cron, form, message), drop in an agent, a tool, a branch, or a delay, then run it. Each step is observable, replayable, and versioned.',
      'We support importing n8n-style workflows so your existing automation experience translates directly. The difference is what lives inside the nodes: real AI agents with memory, voice, and access to your knowledge base - not just data shuffling.',
      'Workflows are first-class citizens in the audit log. Every run shows which agent acted, what tool was called, what input it saw, and what it produced. So when something goes wrong, you find out where in two clicks.',
    ],
    useCases: [
      'Trigger on a Stripe webhook, classify the event with an agent, email the customer',
      'Daily cron runs a reporting agent that summarises last 24h and posts to Slack',
      'A form submission kicks off a knowledge base lookup and a personalised reply',
      'Telegram message hits a routing agent which hands off to a specialist',
    ],
    advantages: [
      {
        vs: 'Zapier',
        body: 'Agents inside the nodes, not just data passing through. Reasoning, not just routing.',
      },
      {
        vs: 'n8n',
        body: 'Pre-built agent council, BYOK out of the box, marketplace economics for tools.',
      },
      { vs: 'Make', body: 'Plain-English goal-first authoring on top of the same node power.' },
    ],
    features: [
      {
        iconName: 'DragIndicatorOutlined',
        title: 'Visual node canvas',
        body: 'Drag, drop, connect. No code required.',
      },
      {
        iconName: 'ImportExportOutlined',
        title: 'JS script import',
        body: 'Bring your existing automations across in minutes.',
      },
      {
        iconName: 'CallSplitOutlined',
        title: 'Branches and loops',
        body: 'Conditional logic without writing a single if statement.',
      },
      {
        iconName: 'StorageOutlined',
        title: 'Variables and state',
        body: 'Carry context across nodes the right way.',
      },
      {
        iconName: 'ReplayOutlined',
        title: 'Step-by-step execution log',
        body: "Every step's inputs and outputs recorded for review.",
      },
      {
        iconName: 'HistoryOutlined',
        title: 'Run history per workflow',
        body: 'Past executions visible end to end.',
      },
      {
        iconName: 'BoltOutlined',
        title: 'Triggers everywhere',
        body: 'Cron, webhook, event, manual - pick the right entry point.',
      },
      {
        iconName: 'BarChartOutlined',
        title: 'Live monitoring + KPIs',
        body: 'Watch runs in real time and track aggregate health.',
      },
    ],
  },
  {
    slug: 'task-manager',
    group: 'instruments',
    label: 'Task Manager',
    iconName: 'TaskAltOutlined',
    inAppRoute: '/task-manager',
    hero: {
      title: 'One task list for every process.',
      subtitle:
        'AI agent workflows, team workflow plans, team and internal tasks, partner work, and project tasks - all in one categorized surface. Assign an agent, a person, or both.',
    },
    description: [
      'Task Manager is not a separate tool for one team - it is where work lands from agent jobs, workflow plans, projects, and day-to-day team operations. Same statuses, deadlines, owners, and deliverables whether the task came from an AI run or a human plan.',
      'Slice the list by scope, category, assignee, priority, or deadline. Switch between table and board. Every task keeps its full history - who created it, every agent run, every deliverable version - so audit and review are built in, not bolted on.',
    ],
    useCases: [
      'Sales: agents draft follow-up emails; reps approve and send',
      'Engineering: agents draft specs and PR descriptions, devs commit',
      'Content: agents draft first cuts; editors polish',
      'Operations: agents complete checklist items with auto-status',
    ],
    advantages: [
      {
        vs: 'Linear / Jira',
        body: 'Agents are first-class assignees, not webhooks bolted on top.',
      },
      { vs: 'Asana', body: 'Deliverables are versioned per task, not just statuses.' },
      {
        vs: 'Trello',
        body: 'Built-in agent execution with audit trail - no plug-in marketplace required.',
      },
    ],
    features: [
      {
        iconName: 'FilterListOutlined',
        title: 'Filters and views',
        body: 'Slice by scope, category, agent, priority, or deadline.',
      },
      {
        iconName: 'PersonOutlined',
        title: 'Agent or human assignee',
        body: 'Same task surface, either kind of worker.',
      },
      {
        iconName: 'AutorenewOutlined',
        title: 'Auto-status from runs',
        body: 'Status reflects what actually happened.',
      },
      {
        iconName: 'LayersOutlined',
        title: 'Deliverable versioning',
        body: 'Iterate without losing the previous draft.',
      },
      {
        iconName: 'ForumOutlined',
        title: 'Comments and review queue',
        body: 'Approve, reject, or send back inline.',
      },
      {
        iconName: 'TimerOutlined',
        title: 'SLA timers + escalation',
        body: 'Things do not slip through quietly.',
      },
      {
        iconName: 'ViewListOutlined',
        title: 'Bulk operations + views',
        body: 'Select many, act once, filter the rest out of sight.',
      },
      {
        iconName: 'BoltOutlined',
        title: 'Webhook hooks',
        body: 'Connect to whatever external system needs to know.',
      },
    ],
  },
  {
    slug: 'projects',
    group: 'instruments',
    label: 'Projects',
    iconName: 'FolderOpenOutlined',
    inAppRoute: '/projects',
    hero: {
      title: 'Group everything that ships under one roof.',
      subtitle:
        'Projects bundle tasks, knowledge, agents, deliverables, and KPIs around a single outcome. One link to share with the team, one place to see if you are on track.',
    },
    description: [
      'A Project is a workspace inside your workspace. Spin one up for a product launch, a client engagement, an internal initiative - any outcome with a start, an end, and stakeholders. Everything that belongs to it - tasks, knowledge sources, agents, deliverables, dashboards - lives inside.',
      'Stakeholders can see the latest update without you writing it. Agents draft progress notes from the audit log and the project KPIs, you tweak, you send. Your team sees the same view from the inside, with the underlying detail one click away.',
      'When the project ends, archive it. Everything stays searchable for the next time you need to remember how that thing actually got done.',
    ],
    useCases: [
      'Launch a new product line with a dedicated agent council',
      'Run a multi-month client engagement with a private knowledge base',
      'Coordinate an internal initiative across three teams',
      'Track an investor roadshow with auto-drafted updates',
    ],
    advantages: [
      { vs: 'Notion projects', body: 'Agents are native, not bolted on through an API.' },
      { vs: 'Monday.com', body: 'Built for outcomes and deliverables, not just status grids.' },
      {
        vs: 'Linear projects',
        body: 'Business-friendly - no engineering taxonomy or label discipline required.',
      },
    ],
    features: [
      {
        iconName: 'BarChartOutlined',
        title: 'Per-project KPIs',
        body: 'See progress against the outcome, not just task count.',
      },
      {
        iconName: 'MenuBookOutlined',
        title: 'Scoped knowledge base',
        body: 'Project context stays inside the project.',
      },
      {
        iconName: 'GroupsOutlined',
        title: 'Agent council per project',
        body: 'A team of agents tuned to this specific outcome.',
      },
      {
        iconName: 'HistoryOutlined',
        title: 'Deliverable diff view',
        body: 'See exactly what changed between versions.',
      },
      {
        iconName: 'EmailOutlined',
        title: 'Auto-drafted updates',
        body: 'Stakeholders get the right note without you writing it.',
      },
      {
        iconName: 'TimelineOutlined',
        title: 'Timeline + milestones',
        body: 'Critical-path view of the work.',
      },
      {
        iconName: 'DashboardOutlined',
        title: 'Cross-project rollup',
        body: 'Aggregate health across everything you are running.',
      },
      {
        iconName: 'StorefrontOutlined',
        title: 'Marketplace templates',
        body: 'Start from a proven setup, not a blank canvas.',
      },
    ],
  },
  {
    slug: 'reports',
    group: 'instruments',
    label: 'Reports',
    iconName: 'AssessmentOutlined',
    inAppRoute: '/reports',
    hero: {
      title: 'Reports that write themselves.',
      subtitle:
        'Describe what you need. Get a polished report in minutes. Sourced from your knowledge base, agents, dashboards, and integrations. Versioned, branded, ready to send.',
    },
    description: [
      'Reports turns the worst part of any role into the fastest. Tell the agent what audience, what time period, what tone - it pulls live data from your dashboards and integrations, prose from your knowledge base, and assembles a branded document.',
      'You review, refine, and send. If you do not love a section, ask for a rewrite in plain English. The version history keeps every draft, so you can roll back or compare side by side.',
      'Schedule recurring reports - weekly client updates, monthly board notes, quarterly business reviews - and the platform delivers them in your brand voice without you touching a keyboard.',
    ],
    useCases: [
      'Weekly client reports for a marketing agency',
      'Monthly board updates for a founder',
      'Quarterly business reviews from CRM and finance data',
      'Investor updates pulled from financials and portfolio activity',
    ],
    advantages: [
      { vs: 'hand-built reports', body: 'Drafted in seconds, brand-locked, with citations.' },
      {
        vs: 'ChatGPT',
        body: 'Knows your data through the knowledge base and integrations - not your prompt history.',
      },
      { vs: 'Tableau / Looker', body: 'Prose narrative around the numbers, not just charts.' },
    ],
    features: [
      {
        iconName: 'PaletteOutlined',
        title: 'Brand kit applied',
        body: 'Logo, colors, voice - automatic.',
      },
      {
        iconName: 'IntegrationInstructionsOutlined',
        title: 'Live data sources',
        body: 'KB, dashboards, integrations all on tap.',
      },
      { iconName: 'HistoryOutlined', title: 'Versioned drafts', body: 'Roll back, diff, refine.' },
      {
        iconName: 'PictureAsPdfOutlined',
        title: 'Export anywhere',
        body: 'PDF, Notion, email, Slack - one click each.',
      },
      {
        iconName: 'StorefrontOutlined',
        title: 'Marketplace templates',
        body: 'Start from a proven layout.',
      },
      {
        iconName: 'EventRepeatOutlined',
        title: 'Scheduled delivery',
        body: 'Weekly, monthly, quarterly - on autopilot.',
      },
      {
        iconName: 'FactCheckOutlined',
        title: 'Source audit trail',
        body: 'Defend every number with a citation.',
      },
      {
        iconName: 'RecordVoiceOverOutlined',
        title: 'Tone per audience',
        body: 'Same data, different voice.',
      },
    ],
  },
  {
    slug: 'dashboards',
    group: 'instruments',
    label: 'Dashboards',
    iconName: 'DashboardOutlined',
    inAppRoute: '/dashboards',
    hero: {
      title: 'Dashboards built by description.',
      subtitle:
        'Ask in English. Get charts. Iterate live. AI builds custom dashboards from your data, your KPIs, your audience - and refines them as fast as you can describe.',
    },
    description: [
      'Dashboards turns the cost of a BI engineer into a five-minute conversation. Describe the metric, the audience, the time range - the platform connects to your integrations, queries the right source, lays out the charts, and applies your brand.',
      'You drill, filter, and share. Tweaks happen in English. No SQL, no semantic model, no chart-building UI to learn.',
      'Share a dashboard with a single link, optionally PIN-gated, or embed it inside Notion, Slack, or an email digest. Schedule a refresh so the data is current when stakeholders open it.',
    ],
    useCases: [
      'Founder weekly metrics view',
      'Sales pipeline dashboard for a team standup',
      'Marketing campaign performance for a client review',
      'Operations health dashboard for an ops lead',
    ],
    advantages: [
      { vs: 'Looker', body: 'No SQL or semantic model required.' },
      { vs: 'Hex', body: 'No notebook required - just describe what you want.' },
      { vs: 'Google Data Studio', body: 'AI fills the canvas; you direct, not build.' },
    ],
    features: [
      {
        iconName: 'ChatBubbleOutlined',
        title: 'Natural-language authoring',
        body: 'Sentence in, dashboard out.',
      },
      {
        iconName: 'PowerOutlined',
        title: 'Auto-connects integrations',
        body: 'No connector wizard to slog through.',
      },
      {
        iconName: 'FilterAltOutlined',
        title: 'Drill-downs and filters',
        body: 'Cut the data without writing queries.',
      },
      {
        iconName: 'ShareOutlined',
        title: 'Share by role or group',
        body: 'Permission-scoped sharing inside your workspace.',
      },
      {
        iconName: 'CodeOutlined',
        title: 'Embed anywhere',
        body: 'Notion, Slack, email - same dashboard.',
      },
      {
        iconName: 'EventRepeatOutlined',
        title: 'Scheduled refresh',
        body: 'Data is current when it matters.',
      },
      {
        iconName: 'AutoFixHighOutlined',
        title: 'AI layout suggestions',
        body: 'Start from a strong default, override at will.',
      },
      {
        iconName: 'BoltOutlined',
        title: 'Queries your live sources',
        body: 'Charts pull from the data warehouse / app database you connect.',
      },
    ],
  },
  {
    slug: 'replicators',
    group: 'instruments',
    label: 'Replicators',
    iconName: 'AutoAwesomeOutlined',
    inAppRoute: '/replicators',
    hero: {
      title: 'Spin up a whole site, instantly.',
      subtitle:
        'Replicators clone whole pages, blogs, or app surfaces - branded, populated, and ready to ship in one click. Built for landing pages, microsites, and lead magnets.',
    },
    description: [
      'A Replicator is a template plus an agent. Pick a starting point, point it at your knowledge base and brand kit, click - the platform generates a multi-page site with copy and SEO in your voice.',
      'Customise anything inline, swap any block, regenerate any section. Wire it to a custom domain, push it live. When you need a second site for a different campaign, audience, or vertical, clone the replicator and let the agent re-populate it.',
      'Build your own replicator templates and publish to the marketplace - you keep 85% of every install.',
    ],
    useCases: [
      'Launch a campaign landing page in five minutes',
      'Spin up a microsite per industry vertical',
      'Clone a lead magnet for a new audience',
      'Build a portfolio with auto-populated content',
    ],
    advantages: [
      { vs: 'Webflow', body: 'Agent-populated content, no manual build.' },
      { vs: 'Framer', body: 'Auto-fill from your knowledge base and brand kit.' },
      { vs: 'WordPress', body: 'No theme to install, no plugins to manage.' },
    ],
    features: [
      {
        iconName: 'ContentCopyOutlined',
        title: 'One-click clone',
        body: 'Start from any template in seconds.',
      },
      {
        iconName: 'AutoAwesomeOutlined',
        title: 'Auto-fill from KB',
        body: 'Your knowledge base writes the first draft.',
      },
      {
        iconName: 'PaletteOutlined',
        title: 'Brand kit applied',
        body: 'On-brand without designer time.',
      },
      {
        iconName: 'PublicOutlined',
        title: 'Custom domains',
        body: 'Bring your domain, point and ship.',
      },
      {
        iconName: 'SearchOutlined',
        title: 'SEO defaults baked in',
        body: 'Metadata, sitemaps, OG tags from the start.',
      },
      {
        iconName: 'BarChartOutlined',
        title: 'Analytics integrated',
        body: 'See traffic and conversions inline.',
      },
      {
        iconName: 'StorefrontOutlined',
        title: 'Template marketplace',
        body: 'Start from a template, or publish your own with 85% revenue share.',
      },
    ],
  },

  // ===================== CONTROL POINT =====================
  {
    slug: 'simple-mode',
    group: 'control',
    label: 'Simple Mode',
    iconName: 'ViewModuleOutlined',
    inAppRoute: '/dashboard',
    hero: {
      title: 'The everyday interface for getting work done.',
      subtitle:
        'Card-first navigation, a four-stop dock, and guided onboarding - without the admin tables. Switch to Advanced anytime.',
    },
    description: [
      'Simple Mode is the default UI for Orqaly: block and card layouts instead of dense admin tables. Your preference is saved in the browser and synced to your account, so every device opens the same experience.',
      'A glass bottom dock takes you to Home, Organizations, Reports, and Marketplace. Home shows what is running, what needs your attention, and a prominent New Request button. Organizations and Marketplace use the same calm, illustrated surfaces you see in the product tour.',
      'Simple Mode is not a sandbox - you can still reach Requests, Agents, Investments, and instruments via the menu or org shortcuts. A route guard keeps you off partner-admin pages; roles can lock users to Simple only. Flip to Advanced from your profile when you need the full control panel.',
    ],
    useCases: [
      'Founders who want outcomes, not ERP chrome',
      'Client and LP portals with locked simple UI',
      'Agencies onboarding customers without admin overwhelm',
      'Mobile-first operators checking goals on the go',
    ],
    advantages: [
      { vs: 'ChatGPT', body: 'Persistent goals, orgs, marketplace - not a single chat window.' },
      { vs: 'enterprise suites', body: 'No six-month rollout to see a dashboard.' },
      { vs: 'custom portals', body: 'Shipped product mode, not a bespoke build.' },
    ],
    features: [
      {
        iconName: 'ViewModuleOutlined',
        title: 'Bottom dock navigation',
        body: 'Home, Organizations, Reports, Marketplace - always one tap away.',
      },
      {
        iconName: 'DashboardOutlined',
        title: 'Simple home dashboard',
        body: 'Pipeline, attention queue, spend, and New Request on one screen.',
      },
      {
        iconName: 'StorefrontOutlined',
        title: 'Compact marketplace',
        body: 'Illustrated tiles in a fixed order - hire without hunting menus.',
      },
      {
        iconName: 'AutoAwesomeOutlined',
        title: 'Glass icon system',
        body: 'Liquid-glass SVGs across simple surfaces for a consistent brand.',
      },
      {
        iconName: 'TuneOutlined',
        title: 'Simple / Advanced toggle',
        body: 'Switch modes from the account menu; intro tour when you go simple.',
      },
      {
        iconName: 'RocketLaunchOutlined',
        title: '5-step welcome tour',
        body: 'Goals, orgs, providers, dashboards, marketplace - on enable.',
      },
      {
        iconName: 'ShieldOutlined',
        title: 'Route guard',
        body: 'Stay on dock-friendly routes; no accidental partner-admin views.',
      },
      {
        iconName: 'BusinessOutlined',
        title: 'Org action tiles',
        body: 'Jump to agents, tools, or investments from each organization.',
      },
    ],
  },
  {
    slug: 'investments',
    group: 'control',
    label: 'Investments',
    iconName: 'TrendingUpOutlined',
    inAppRoute: '/investments',
    hero: {
      title: 'A workspace for capital decisions.',
      subtitle:
        'Track investors, deals, commitments, and returns in one structured workspace. Designed for funds, syndicates, and angel-led groups.',
    },
    description: [
      'Investments turns your fund admin spreadsheet into a real product. Investor profiles, deal pipelines, commitment status, ROI - all structured, all permissioned, all auditable.',
      'Investors see a curated view through a public profile page; you see the operator dashboard with everything that drives the numbers. Updates and notes can be drafted with the same agents you use everywhere else on the platform.',
      'Public profile pages are gated by an unguessable UUID, so you can share a link with an investor without exposing the cap table to the world.',
    ],
    useCases: [
      'Angel syndicate managing 30 LPs',
      'Fund tracking 50 portfolio companies',
      'Investor relations dashboard for a startup',
      'Family office tracking diversified holdings',
    ],
    advantages: [
      { vs: 'spreadsheets', body: 'Structured, RLS-permissioned, audit-logged from day one.' },
      { vs: 'Carta', body: 'Investor-side first, not cap-table first.' },
      { vs: 'Airtable', body: 'Agents draft updates and reminders for you.' },
    ],
    features: [
      {
        iconName: 'PersonOutlined',
        title: 'Investor profiles',
        body: 'Risk preferences and history in one record.',
      },
      {
        iconName: 'TimelineOutlined',
        title: 'Deal pipeline',
        body: 'Custom stages, weighted forecasting.',
      },
      {
        iconName: 'AssignmentTurnedInOutlined',
        title: 'Commitments tracked',
        body: 'Status and amounts always current.',
      },
      {
        iconName: 'BarChartOutlined',
        title: 'ROI per deal and investor',
        body: 'Revenue against committed capital, rolled up automatically.',
      },
      {
        iconName: 'EmailOutlined',
        title: 'Agent-assisted updates',
        body: 'Draft investor notes with the same agents you use elsewhere.',
      },
      {
        iconName: 'LockOutlined',
        title: 'UUID-gated profiles',
        body: 'Share a link without exposing the cap table.',
      },
      {
        iconName: 'HistoryOutlined',
        title: 'Audit log everywhere',
        body: 'Every state change recorded.',
      },
      {
        iconName: 'DashboardOutlined',
        title: 'KPI dashboards',
        body: 'Per-investor and per-deal health.',
      },
    ],
  },
  {
    slug: 'organizations',
    group: 'control',
    label: 'Organizations',
    iconName: 'BusinessOutlined',
    inAppRoute: '/organizations',
    hero: {
      title: 'One organization. Every goal, team, and doc in one place.',
      subtitle:
        'Open an org command center: connect goals in Job Pool, review teams that worked, reuse the same roster, and keep one knowledge base per business — with RLS at the database.',
    },
    description: [
      'Organizations is your per-business hub: goals and results, team roster, isolated knowledge base, agents, and finances — all scoped by org_id. Switch workspaces on one login without mixing data.',
    ],
    useCases: [
      'Agencies managing client workspaces',
      'Founders separating two businesses',
      'Holding companies coordinating subsidiaries',
      'Consultants serving multiple engagements',
    ],
    advantages: [
      {
        vs: 'Slack workspaces',
        body: 'Agents move with you; the knowledge base is scoped per org, not duplicated.',
      },
      { vs: 'Notion teamspaces', body: 'Real RLS at the database, not just UI partitioning.' },
      { vs: 'Salesforce orgs', body: 'Built for the agent economy, not 1995 CRM.' },
    ],
    features: [
      {
        iconName: 'AssignmentOutlined',
        title: 'Goals hub',
        body: 'Active and completed goals scoped to the org; Results tab for deployments.',
      },
      {
        iconName: 'GroupsOutlined',
        title: 'Team roster',
        body: 'Teams and agents assigned per org; org chart in the drawer.',
      },
      {
        iconName: 'MenuBookOutlined',
        title: 'Org knowledge base',
        body: 'Docs and context never cross org boundaries.',
      },
      {
        iconName: 'RocketLaunchOutlined',
        title: 'Results history',
        body: 'Completed goals, spend, and deployment links in one place.',
      },
      {
        iconName: 'AdminPanelSettingsOutlined',
        title: 'Per-org RBAC',
        body: 'Roles and permissions, properly scoped.',
      },
      {
        iconName: 'PaletteOutlined',
        title: 'Per-org brand kit',
        body: 'Each tenant looks like itself.',
      },
      {
        iconName: 'ShareOutlined',
        title: 'Opt-in agent sharing',
        body: 'Move proven agents between orgs deliberately.',
      },
      {
        iconName: 'KeyOutlined',
        title: 'SSO on Enterprise',
        body: 'Plug into Okta, Azure AD, Google.',
      },
    ],
  },
  {
    slug: 'consilium',
    group: 'control',
    label: 'Consilium',
    iconName: 'GroupsOutlined',
    inAppRoute: '/consilium',
    hero: {
      title: 'Debate, Vote - Record',
      subtitle:
        'Actively involved in decision-making throughout the platform to build a business that consistently delivers profitable results.',
    },
    description: [
      'Consilium is the decision layer: boards, members, criteria, council votes with transcripts, analytics, governance — wired into agents, workflows, goals, and marketplace templates.',
    ],
    useCases: [
      'Planning a multi-step business strategy',
      'Reviewing a contract from legal, financial, and risk angles',
      'Evaluating a hire from multiple perspectives',
      'Multi-step research tasks where one pass is not enough',
    ],
    advantages: [
      { vs: 'ChatGPT', body: 'Cross-checked answers, not one-shot guesses.' },
      {
        vs: 'LangChain agents',
        body: 'Voting and audit are built in - not custom code you maintain.',
      },
      { vs: 'CrewAI', body: 'A real platform around it: KB, channels, marketplace, monitoring.' },
    ],
    features: [
      {
        iconName: 'TuneOutlined',
        title: 'Configurable council size',
        body: 'Right-size the panel per decision.',
      },
      {
        iconName: 'BadgeOutlined',
        title: 'Per-agent role',
        body: "Analyst, critic, synthesiser, devil's advocate.",
      },
      {
        iconName: 'ForumOutlined',
        title: 'Argument transcript',
        body: 'Saved verbatim for audit.',
      },
      {
        iconName: 'HowToVoteOutlined',
        title: 'Voting modes',
        body: 'Unanimous, majority, weighted, or custom.',
      },
      {
        iconName: 'AssignmentOutlined',
        title: 'Inline rationale',
        body: 'See why the council landed where it did.',
      },
      {
        iconName: 'IntegrationInstructionsOutlined',
        title: 'Drop-in anywhere',
        body: 'Slot it into any workflow or task.',
      },
      {
        iconName: 'KeyOutlined',
        title: 'BYOK mixed models',
        body: 'Combine providers inside a single council.',
      },
      {
        iconName: 'HistoryOutlined',
        title: 'Audit log of dissent',
        body: 'Know who said what, when.',
      },
    ],
  },
  {
    slug: 'agents',
    group: 'control',
    label: 'Agents',
    iconName: 'SmartToyOutlined',
    inAppRoute: '/agent-hub',
    hero: {
      title: 'Build, run, and monitor your AI workforce.',
      subtitle:
        'Agent Hub unifies seven workspaces — Agents, Teams, Knowledge, Skills, Pulse, Prompt Lab, and My Agents — so you compose, schedule, test, and monitor in one place.',
    },
    description: [
      'Agent Hub is mission control. Compose an agent from skills (capabilities) and tools (connectors), scope its memory to a knowledge base, define its personality, ship it to a channel.',
      'Watch it work in real time. Step through any run. Roll back to any version. Add a Consilium council behind it for hard decisions. Publish it to the marketplace and earn 85% of every install.',
      'Built for the humans actually running a business, not just engineers wiring SDKs.',
    ],
    useCases: [
      'Voice triage agent for a clinic',
      'Sales follow-up agent for a real-estate team',
      'Content-drafting agent for a marketing agency',
      'Research agent for a creator',
    ],
    advantages: [
      { vs: 'ChatGPT custom GPTs', body: 'Multi-channel, persistent, marketplace-ready, audited.' },
      { vs: 'Microsoft Copilot Studio', body: 'No MS Graph lock-in. BYOK across providers.' },
      { vs: 'LangChain', body: 'Visual, no-code, production-ready on day one.' },
    ],
    features: [
      {
        iconName: 'SmartToyOutlined',
        title: 'Agents tab',
        body: 'Build, filter, and deploy individual agents.',
      },
      {
        iconName: 'Diversity3Outlined',
        title: 'Teams tab',
        body: 'Multi-agent teams with AI composition suggestions.',
      },
      {
        iconName: 'StorageOutlined',
        title: 'Knowledge tab',
        body: 'Scoped sources every agent and team can read.',
      },
      {
        iconName: 'AutoFixHighOutlined',
        title: 'Skills tab',
        body: 'Browse, install, and create skill packs.',
      },
      {
        iconName: 'FiberManualRecord',
        title: 'Pulse tab',
        body: 'Autonomous schedules on agents, teams, or goals.',
      },
      {
        iconName: 'ScienceOutlined',
        title: 'Prompt Lab tab',
        body: 'Optimization runs and experiments before ship.',
      },
      {
        iconName: 'FavoriteOutlined',
        title: 'My Agents tab',
        body: 'Your roster plus marketplace installs.',
      },
      {
        iconName: 'MicNoneOutlined',
        title: 'Channel deployment',
        body: 'Voice, Telegram, chat, email out of the box.',
      },
      {
        iconName: 'TimelineOutlined',
        title: 'Live activity feed',
        body: 'Watch every step in real time.',
      },
      { iconName: 'HistoryOutlined', title: 'Audit logs by default', body: 'No add-on required.' },
      {
        iconName: 'RestoreOutlined',
        title: 'Versioning + rollback',
        body: 'Revert with one click.',
      },
      {
        iconName: 'StorefrontOutlined',
        title: 'Marketplace publish',
        body: '85% of every install lands in your account.',
      },
      {
        iconName: 'DashboardOutlined',
        title: 'KPI dashboards',
        body: 'Per-agent health at a glance.',
      },
    ],
  },
  {
    slug: 'requests',
    group: 'control',
    label: 'Request',
    iconName: 'InboxOutlined',
    inAppRoute: '/job-pool',
    hero: {
      title: 'Every ask becomes a goal you can run end to end.',
      subtitle:
        'Smart Request in Job Pool launches the pipeline, Goal detail lets you steer and recover, and you finish with deliverables, report, and deployment — from any channel.',
    },
    description: [
      'Requests in Orqaly are goals in Job Pool: submit via Smart Request or voice, web, Telegram, email, and webhook, then run the full lifecycle with pipeline visibility, actions menu, budget tracking, and results.',
    ],
    useCases: [
      'Internal team requests (IT, ops, finance)',
      'Client requests routed to specialists',
      'Customer support tickets with agent triage',
      'Investor or partner queries',
    ],
    advantages: [
      {
        vs: 'Slack threads',
        body: 'Structured, status-tracked, audited - not lost in scrollback.',
      },
      {
        vs: 'Jira Service Desk',
        body: 'Agents are first-class fulfillers, not external integrations.',
      },
      { vs: 'Zendesk', body: 'Built for the agent economy and voice-first from the start.' },
    ],
    features: [
      {
        iconName: 'RocketLaunchOutlined',
        title: 'Smart goal launch',
        body: 'Three-step wizard: intake, Consilium team, submit goal.',
      },
      {
        iconName: 'AccountTreeOutlined',
        title: 'Pipeline visibility',
        body: 'Analysis through executing with approval gates.',
      },
      {
        iconName: 'TuneOutlined',
        title: 'Goal actions menu',
        body: 'Pause, heal, tools, Pulse, workflow, autopilot, team-lead.',
      },
      {
        iconName: 'AccountBalanceWalletOutlined',
        title: 'Budget & tokens',
        body: 'Spend, phase budget, and theory preview on the goal.',
      },
      {
        iconName: 'InventoryOutlined',
        title: 'Deliverables & report',
        body: 'Work log, metrics, retrospective, and final results.',
      },
      {
        iconName: 'HealingOutlined',
        title: 'Heal & retry',
        body: 'Recover stuck goals; retry failed or cancelled runs.',
      },
      {
        iconName: 'BusinessOutlined',
        title: 'Org adopt & implement',
        body: 'Hand completed work to a new or existing organization.',
      },
      {
        iconName: 'HubOutlined',
        title: 'Submit anywhere',
        body: 'Voice, web, Telegram, email, webhook → Job Pool goal.',
      },
    ],
  },
  {
    slug: 'tools',
    group: 'control',
    label: 'Tools',
    iconName: 'ExtensionOutlined',
    inAppRoute: '/tools',
    hero: {
      title: 'Connectors your agents actually use.',
      subtitle:
        'MCP catalog via Composio, custom API and webhook tools, per-agent permissions, test and execute with audit — publish to the marketplace when ready.',
    },
    description: [
      'Tools is the agent toolbox at /tools: connect integrations, scope capabilities per agent, run and audit executions, and publish custom tools with VirusTotal scanning before listing.',
    ],
    useCases: [
      'Connect Stripe to a refunds agent',
      'Wire your CRM into a sales follow-up agent',
      'Plug Gmail into a follow-up agent',
      'Add a custom internal API to any agent',
    ],
    advantages: [
      {
        vs: 'raw API calls in Zapier',
        body: 'Capability-scoped, permissioned, versioned per tool.',
      },
      { vs: 'custom LangChain tools', body: 'No engineer required to author or publish.' },
      { vs: 'OpenAI function calls', body: 'Marketplace-ready with 85/15 economics for builders.' },
    ],
    features: [
      {
        iconName: 'ExtensionOutlined',
        title: 'A growing library of connectors',
        body: 'Common tools (mail, payments, CRMs, internal APIs) ready to drop in.',
      },
      {
        iconName: 'CodeOutlined',
        title: 'Custom tool SDK',
        body: 'Build private or marketplace tools.',
      },
      {
        iconName: 'LockOutlined',
        title: 'Per-agent permissioning',
        body: 'Only the right agent gets the right key.',
      },
      {
        iconName: 'SecurityOutlined',
        title: 'Sandboxed execution',
        body: 'Bad tools cannot touch your data.',
      },
      {
        iconName: 'HistoryOutlined',
        title: 'Audit on every call',
        body: 'Every tool invocation logged.',
      },
      {
        iconName: 'HistoryEduOutlined',
        title: 'Versioning',
        body: 'Upgrade without breaking running agents.',
      },
      {
        iconName: 'StorefrontOutlined',
        title: 'Marketplace publish',
        body: 'Publish tools and earn crypto on installs.',
      },
      {
        iconName: 'ShieldOutlined',
        title: 'VirusTotal scan',
        body: 'Every publish scanned before listing.',
      },
    ],
  },
  {
    slug: 'communicator',
    group: 'control',
    label: 'Communicator',
    iconName: 'ForumOutlined',
    inAppRoute: '/communicator',
    hero: {
      title: 'Monitor every goal. Deploy every channel.',
      subtitle:
        'Agent Workspace for live activity and goal rooms; Communicator for voice, Telegram, email, Consilium log, and controller — the same two-tab app at /communicator.',
    },
    description: [
      'Communicator is your communication control room: watch goals in Live activity, open Agent Rooms (Team, Lead, Agent), review Consilium decisions, and configure channels without maintaining separate bots per surface.',
    ],
    useCases: [
      'Voice triage agent for a clinic',
      'Telegram support agent for a SaaS product',
      'Telegram concierge that books follow-ups',
      'Voice intake agent that drops a transcript into the workspace',
    ],
    advantages: [
      { vs: 'Twilio + custom code', body: 'No engineer required to wire voice or Telegram.' },
      { vs: 'Intercom', body: 'Voice and Telegram inside one agent, not premium add-ons.' },
      {
        vs: 'ChatGPT API',
        body: 'Real channel management and webhook routing, not just an HTTP endpoint.',
      },
    ],
    features: [
      {
        iconName: 'BoltOutlined',
        title: 'Live activity feed',
        body: 'Events across goals; filter by goal id.',
      },
      {
        iconName: 'ForumOutlined',
        title: 'Agent rooms per goal',
        body: 'Team, Lead, and Agent channels in Goal History.',
      },
      {
        iconName: 'GavelOutlined',
        title: 'Consilium decision log',
        body: 'Votes, scores, and approvals in one audit trail.',
      },
      {
        iconName: 'MicNoneOutlined',
        title: 'Voice channel',
        body: 'AssemblyAI / Groq backend, low latency.',
      },
      {
        iconName: 'SendOutlined',
        title: 'Telegram channel',
        body: 'Paste a BotFather token; the webhook is wired for you.',
      },
      {
        iconName: 'EmailOutlined',
        title: 'Email channel',
        body: 'SMTP / IMAP for async customer comms.',
      },
      {
        iconName: 'TerminalOutlined',
        title: 'Controller & audit',
        body: 'Run commands; full audit log.',
      },
      {
        iconName: 'TuneOutlined',
        title: 'Per-channel personality',
        body: 'Same agent, different tone per channel.',
      },
    ],
  },
];

/** Control Point order in site chrome (header mega-menu, footer). */
export const CONTROL_NAV_SLUG_ORDER = [
  'agents',
  'consilium',
  'organizations',
  'requests',
  'tools',
  'communicator',
  'simple-mode',
];

function controlItemsInNavOrder() {
  const bySlug = Object.fromEntries(
    items.filter((it) => it.group === 'control').map((it) => [it.slug, it])
  );
  return CONTROL_NAV_SLUG_ORDER.map((slug) => bySlug[slug]).filter(Boolean);
}

export const INSTRUMENTS = items;
export const ITEMS_BY_SLUG = Object.fromEntries(items.map((it) => [`${it.group}:${it.slug}`, it]));
export const INSTRUMENTS_BY_GROUP = {
  instruments: items.filter((it) => it.group === 'instruments'),
  control: controlItemsInNavOrder(),
};
