// Marketing copy for /control/tools — mirrors Tools.jsx + MCP catalog

export const TOOLS_HUB_INTRO = {
  eyebrow: 'Agent toolbox',
  title: 'Connectors your agents actually use.',
  subtitle:
    'The same /tools surface in-product: MCP integrations via Composio, custom API and webhook tools, per-agent permissions, test and execute with full audit — publish to the marketplace when you are ready.',
};

export const TOOLS_PILLARS = [
  {
    id: 'connect',
    iconName: 'ExtensionOutlined',
    title: 'Connect integrations',
    body: 'Browse the MCP catalog (~40 Composio apps), seed predefined tools, and add API, webhook, SDK, or internal connectors.',
    linkLabel: 'MCP · Composio',
  },
  {
    id: 'permission',
    iconName: 'LockOutlined',
    title: 'Scope per agent',
    body: 'Each tool lists who uses it. MCP entries expose safe vs sensitive actions — agents only get the capabilities you enable.',
    linkLabel: 'refund.create · read-only',
  },
  {
    id: 'run',
    iconName: 'PlayCircleOutline',
    title: 'Test, run, audit',
    body: 'Test connections, execute tools with payloads, view execution history, and log every invocation to the audit trail.',
    linkLabel: 'Execution history',
  },
  {
    id: 'publish',
    iconName: 'StorefrontOutlined',
    title: 'Build & publish',
    body: 'Author custom tools with the SDK, version safely, and publish to the marketplace — VirusTotal scan before any listing goes live.',
    linkLabel: 'Earn crypto on installs',
  },
];

export const SPOTLIGHT_CONNECT = {
  eyebrow: 'Connect',
  title: 'MCP catalog and your connectors.',
  body: 'Tools opens on a searchable roster with metrics: total, active, blocked, and MCP count. Click an MCP tool for Overview, Connect, and Documentation tabs.',
  bullets: [
    'Composio-powered MCP apps across nine subcategories',
    'Connection types: API, webhook, SDK, internal, Composio',
    'Grid or table view with category and status filters',
    'Predefined tools seed on first load',
  ],
};

export const SPOTLIGHT_PERMISSION = {
  eyebrow: 'Permissions',
  title: 'The right agent gets the right capability.',
  body: 'Stripe might allow refund.create for a refunds agent but read-only Postgres for analytics. MCP tools split safe actions (enabled by default) from sensitive ones (opt-in).',
  bullets: [
    'Used-by column shows assigned agents',
    'Per-tool status: active, blocked, inactive',
    'Risk tiers on MCP endpoints (low, medium, high)',
    'Goal setup flows attach required tools per team',
  ],
};

export const SPOTLIGHT_RUN = {
  eyebrow: 'Run & audit',
  title: 'Test before agents depend on it.',
  body: 'Run test connection from the tool row, execute with a JSON payload, and inspect execution history — same audit logging as the rest of the platform.',
  bullets: [
    'Test connection for API and webhook tools',
    'Execute tool with live payload preview',
    'Execution history per tool',
    'Audit log entries on create, edit, and invoke',
  ],
};

export const SPOTLIGHT_TRUST = {
  eyebrow: 'Trust',
  title: 'Sandboxed. Scanned. Defensible.',
  body: 'Tools reach outside your workspace — so execution is sandboxed, marketplace publishes go through VirusTotal, and every call is logged for compliance.',
  bullets: [
    'Sandboxed execution by default',
    'VirusTotal scan on marketplace publish',
    'Weekly re-scan targets on MCP endpoint URLs',
    'Version tools without breaking running agents',
  ],
};
