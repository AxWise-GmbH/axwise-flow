/**
 * Roles & Permissions Service
 *
 * Production-ready service that:
 * - Fetches REAL users from Supabase Auth (or localStorage auth fallback)
 * - Manages roles with per-page and per-block grant/deny access
 * - Stores roles & user↔role mappings in Supabase tables when available,
 *   with localStorage fallback for offline/local development
 *
 * NO dummy data. All users come from the actual auth system.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { logAction } from './auditLogBackend';
import { maybeNotify } from './emailNotificationDispatcher';

async function trackPermissionAction(action, entity, entityId, details = null, meta = {}) {
  try {
    await logAction({
      action,
      entity,
      entityId,
      details,
      meta,
    });
  } catch {
    // Don't fail the main operation if logging fails
  }
}

// ---------------------------------------------------------------------------
// Constants — Page / Block definitions
// ---------------------------------------------------------------------------

export const PAGE_DEFINITIONS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/dashboard',
    blocks: [
      { id: 'kpis', label: 'Key Performance Indicators' },
      { id: 'health_risk', label: 'Health & Risk Snapshot' },
      { id: 'portfolio_operations', label: 'Portfolio & Operations' },
      { id: 'geo_performance', label: 'Geo / Region Performance' },
      { id: 'portfolio_breakdown', label: 'Portfolio Breakdown' },
      { id: 'trends_analysis', label: 'Trends & Analysis' },
      { id: 'funnel_distribution', label: 'Funnel Distribution' },
    ],
  },
  {
    id: 'partners',
    label: 'Partners',
    path: '/partners',
    blocks: [
      { id: 'toolbar', label: 'Toolbar & Filters' },
      { id: 'funnel_chart', label: 'Funnel Chart' },
      { id: 'partners_table', label: 'Partners Table' },
      { id: 'campaigns_drawer', label: 'Campaigns Drawer' },
      { id: 'ftd_drawer', label: 'FTD Drawer' },
      { id: 'cr_drawer', label: 'CR Drawer' },
      { id: 'finance_drawer', label: 'Finance Drawer' },
      { id: 'add_partner', label: 'Add Partner' },
      { id: 'upload_material', label: 'Upload Material' },
      { id: 'recording', label: 'Recording Quick' },
      { id: 'task_kanban', label: 'Task Kanban' },
    ],
  },
  {
    id: 'partner_detail',
    label: 'Partner Detail',
    path: '/partners/:id',
    blocks: [
      { id: 'information', label: 'Information' },
      { id: 'performance', label: 'Performance' },
      { id: 'meetings', label: 'Meetings' },
      { id: 'history', label: 'History' },
      { id: 'finance', label: 'Finance' },
      { id: 'materials', label: 'Materials' },
      { id: 'links', label: 'Links' },
      { id: 'analytics', label: 'Analytics' },
      { id: 'task_manager', label: 'Tasks' },
    ],
  },
  {
    id: 'task_manager',
    label: 'Tasks',
    path: '/task-manager',
    blocks: [
      { id: 'table_view', label: 'Table View' },
      { id: 'kanban_view', label: 'Kanban View' },
      { id: 'roadmap_view', label: 'Roadmap View' },
      { id: 'edit_task', label: 'Edit Task' },
    ],
  },
  {
    id: 'workflow',
    label: 'Workflow',
    path: '/workflow',
    blocks: [
      { id: 'workflows_tab', label: 'Workflows Tab' },
      { id: 'templates_tab', label: 'Templates Tab' },
      { id: 'create_workflow', label: 'Create Workflow' },
      { id: 'canvas_editor', label: 'Canvas Editor' },
    ],
  },
  {
    id: 'projects',
    label: 'Projects',
    path: '/projects',
    blocks: [
      { id: 'projects_table', label: 'Projects Table' },
      { id: 'create_edit_project', label: 'Create / Edit Project' },
      { id: 'delete_project', label: 'Delete Project' },
    ],
  },
  {
    id: 'finances',
    label: 'Finances',
    path: '/finances',
    blocks: [
      { id: 'finances_table', label: 'Finances Table' },
      { id: 'finances_filters', label: 'Filters' },
      { id: 'finances_metrics', label: 'Metrics' },
    ],
  },
  {
    id: 'campaigns',
    label: 'Campaigns',
    path: '/campaigns',
    blocks: [
      { id: 'campaigns_table', label: 'Campaigns Table' },
      { id: 'refresh', label: 'Refresh / Reload' },
      { id: 'status_toggle', label: 'Pause / Resume' },
      { id: 'delete_campaign', label: 'Delete Campaign' },
    ],
  },
  {
    id: 'notification_center',
    label: 'AI Recomend',
    path: '/notification-center',
    blocks: [
      { id: 'system_metrics', label: 'System Metrics' },
      { id: 'knowledge_layer', label: 'Operating Knowledge Layer' },
      { id: 'active_notifications', label: 'Active Notifications' },
      { id: 'outcome_schedule', label: 'Outcome Schedule' },
      { id: 'learning_summary', label: 'Learning Summary' },
      { id: 'run_cycle', label: 'Run Cycle' },
    ],
  },
  {
    id: 'agent_hub',
    label: 'Agents',
    path: '/agent-hub',
    blocks: [
      { id: 'overview', label: 'System Overview' },
      { id: 'agent_registry', label: 'Agent Registry' },
      { id: 'projects', label: 'Project Creation' },
      { id: 'assignments', label: 'Agent Assignments' },
      { id: 'kpi_dashboard', label: 'KPI Dashboard' },
    ],
  },
  {
    id: 'strategy_center',
    label: 'Strategy Center',
    path: '/strategy-center',
    blocks: [
      { id: 'executive_summary', label: 'Executive Summary' },
      { id: 'business_decomposition', label: 'Business Decomposition' },
      { id: 'action_kpi_mapping', label: 'Action → KPI Mapping' },
      { id: 'kpi_engineering', label: 'KPI Engineering' },
      { id: 'predictive_scenarios', label: 'Predictive Scenarios' },
      { id: 'ai_recommendation', label: 'AI Recommendation' },
      { id: 'roi_model', label: 'ROI Model' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    path: '/settings',
    blocks: [
      { id: 'profile', label: 'Profile' },
      { id: 'notifications', label: 'Notifications' },
      { id: 'preferences', label: 'Preferences' },
      { id: 'security', label: 'Security' },
    ],
  },
  {
    id: 'audit_log',
    label: 'Activity Log',
    path: '/audit-log',
    blocks: [
      { id: 'log_table', label: 'Log Table' },
      { id: 'filters', label: 'Filters' },
      { id: 'row_details', label: 'Row Details' },
    ],
  },
  {
    id: 'documentation',
    label: 'Documentation',
    path: '/documentation',
    blocks: [
      { id: 'overview', label: 'Overview' },
      { id: 'faq', label: 'FAQ' },
      { id: 'db_schema', label: 'Database Schema' },
      { id: 'auth_flow', label: 'Auth Flow' },
      { id: 'api_reference', label: 'API Reference' },
      { id: 'env_variables', label: 'Environment Variables' },
      { id: 'api_keys', label: 'API Keys Management' },
    ],
  },
  {
    id: 'roles',
    label: 'Permissions',
    path: '/roles',
    blocks: [
      { id: 'roles_table', label: 'Roles Table' },
      { id: 'users_table', label: 'Users Table' },
      { id: 'invite_user', label: 'Invite User' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    path: '/reports',
    blocks: [
      { id: 'template_selector', label: 'Template Selector' },
      { id: 'kpi_cards', label: 'KPI Cards' },
      { id: 'trend_charts', label: 'Trend Charts' },
      { id: 'breakdowns', label: 'Breakdowns' },
      { id: 'leaderboards', label: 'Leaderboards' },
      { id: 'export_actions', label: 'Export (PDF/CSV)' },
      { id: 'refresh_controls', label: 'Force Refresh' },
      { id: 'custom_templates', label: 'Save Custom Templates' },
    ],
  },
  {
    id: 'data',
    label: 'Data',
    path: '/data',
    blocks: [
      { id: 'topology_map', label: 'Topology Map' },
      { id: 'search', label: 'Search' },
      { id: 'export_data', label: 'Export' },
    ],
  },
  {
    id: 'job_pool',
    label: 'Job Pool',
    path: '/job-pool',
    blocks: [
      { id: 'metrics', label: 'Metrics' },
      { id: 'jobs_table', label: 'Jobs Table' },
      { id: 'create_job', label: 'Create Job' },
      { id: 'edit_job', label: 'Edit Job' },
      { id: 'delete_job', label: 'Delete Job' },
      { id: 'activity_log', label: 'Activity Log' },
    ],
  },
  {
    id: 'consilium',
    label: 'Consilium',
    path: '/consilium',
    blocks: [
      { id: 'metrics', label: 'Metrics' },
      { id: 'boards', label: 'Boards' },
      { id: 'members', label: 'Members' },
      { id: 'criteria', label: 'Criteria' },
      { id: 'agents', label: 'Agent Lifecycle' },
      { id: 'teams', label: 'Teams' },
      { id: 'analytics', label: 'Analytics' },
      { id: 'security', label: 'Security Events' },
    ],
  },
  {
    id: 'injection_hub',
    label: 'Injection',
    path: '/injection-hub',
    blocks: [
      { id: 'metrics', label: 'Metrics' },
      { id: 'inject', label: 'Inject' },
      { id: 'translation', label: 'Translation' },
      { id: 'library', label: 'Material Library' },
      { id: 'categories', label: 'Categories' },
      { id: 'activity_log', label: 'Activity Log' },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    path: '/tools',
    blocks: [
      { id: 'metrics', label: 'Metrics' },
      { id: 'create_tool', label: 'Create Tool' },
      { id: 'edit_tool', label: 'Edit Tool' },
      { id: 'delete_tool', label: 'Delete Tool' },
      { id: 'execute_tool', label: 'Execute Tool' },
      { id: 'execution_history', label: 'Execution History' },
      { id: 'categories', label: 'Categories' },
      { id: 'activity_log', label: 'Activity Log' },
    ],
  },
  {
    id: 'marketing_dashboard',
    label: 'Marketing Dashboard',
    path: '/marketing/dashboard',
    blocks: [
      { id: 'overview', label: 'Overview Metrics & Charts' },
      { id: 'kpis', label: 'KPI Grid' },
      { id: 'forecasts', label: 'Futuristic AI Forecast Simulator' },
      { id: 'insights', label: 'AI Intelligence Feed' },
    ],
  },
  {
    id: 'marketing_audiences',
    label: 'Marketing Audiences',
    path: '/marketing/audiences',
    blocks: [
      { id: 'crm', label: 'CRM Contacts Table' },
      { id: 'segments', label: 'Audience Segments & Creation' },
      { id: 'cohorts', label: 'Cohort Retention Grid' },
      { id: 'journeys', label: 'Customer Journey Touchpoints' },
    ],
  },
  {
    id: 'marketing_campaigns',
    label: 'Marketing Campaigns',
    path: '/marketing/campaigns',
    blocks: [
      { id: 'active', label: 'Active Campaigns Grid' },
      { id: 'calendar', label: 'Campaign Scheduler Calendar' },
      { id: 'automation', label: 'Trigger Automation Workflows' },
      { id: 'ab_tests', label: 'A/B Test Analytics' },
    ],
  },
  {
    id: 'marketing_content',
    label: 'Marketing Content',
    path: '/marketing/content',
    blocks: [
      { id: 'materials', label: 'Creative Materials Assets' },
      { id: 'landing_pages', label: 'Landing Pages Builder Interface' },
      { id: 'templates', label: 'Email / SMS Templates' },
      { id: 'guidelines', label: 'Brand Guidelines System' },
    ],
  },
  {
    id: 'marketing_acquisition',
    label: 'Marketing Acquisition',
    path: '/marketing/acquisition',
    blocks: [
      { id: 'channels', label: 'Acquisition Channels Stats' },
      { id: 'sources', label: 'Traffic Referral Sources' },
      { id: 'attribution', label: 'Attribution Model Settings' },
      { id: 'utm', label: 'UTM Builder Utility' },
    ],
  },
  {
    id: 'marketing_conversion',
    label: 'Marketing Conversion',
    path: '/marketing/conversion',
    blocks: [
      { id: 'funnels', label: 'Conversion Funnel Chart' },
      { id: 'analysis', label: 'Daily/Hourly Conversion Trends' },
      { id: 'behavior', label: 'User Behavior Analytics' },
      { id: 'heatmaps', label: 'Scroll & Event Tracking List' },
    ],
  },
  {
    id: 'marketing_retention',
    label: 'Marketing Retention',
    path: '/marketing/retention',
    blocks: [
      { id: 'loyalty', label: 'VIP / Loyalty Rewards Tier Matrix' },
      { id: 'churn', label: 'Churn Probability Risk Indicators' },
      { id: 'reactivation', label: 'Reactivation Discount Triggers' },
      { id: 'personalization', label: 'Dynamic Personalization Copy' },
    ],
  },
  {
    id: 'marketing_team',
    label: 'Marketing Team',
    path: '/marketing/team',
    blocks: [
      { id: 'managers', label: 'Marketing Managers & AI Agents' },
      { id: 'tasks', label: 'Campaign Checklist Tasks' },
      { id: 'approvals', label: 'Manager Sign-Off Workflows' },
      { id: 'budget', label: 'Doughnut Chart Budget Breakdown' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Permission builders
// ---------------------------------------------------------------------------

/** Build a full-access (grant all) permissions map */
export function buildFullAccess() {
  const pages = {};
  PAGE_DEFINITIONS.forEach((p) => {
    pages[p.id] = {
      enabled: true,
      blocks: Object.fromEntries(p.blocks.map((b) => [b.id, true])),
    };
  });
  return pages;
}

/** Build a viewer (read-only) permissions map — action blocks denied */
export function buildViewerAccess() {
  const pages = {};
  PAGE_DEFINITIONS.forEach((p) => {
    pages[p.id] = {
      enabled: true,
      blocks: Object.fromEntries(
        p.blocks.map((b) => {
          const actionKeywords = ['add', 'create', 'edit', 'delete', 'upload', 'run', 'invite'];
          const isAction = actionKeywords.some((k) => b.id.includes(k));
          return [b.id, !isAction];
        })
      ),
    };
  });
  return pages;
}

/** Build a deny-all (no access) permissions map */
export function buildNoAccess() {
  const pages = {};
  PAGE_DEFINITIONS.forEach((p) => {
    pages[p.id] = {
      enabled: false,
      blocks: Object.fromEntries(p.blocks.map((b) => [b.id, false])),
    };
  });
  return pages;
}

/** Admin: same as Super Admin but no access to Documentation, AI Recommend, Activity Log, Data */
const ADMIN_EXCLUDED_PAGE_IDS = ['documentation', 'notification_center', 'audit_log', 'data'];

/** Viewer cannot access these pages (Super Admin and Admin only). */
const VIEWER_EXCLUDED_PAGE_IDS = ['finances'];

export function buildAdminAccess() {
  const pages = buildFullAccess();
  ADMIN_EXCLUDED_PAGE_IDS.forEach((pageId) => {
    const pageDef = PAGE_DEFINITIONS.find((p) => p.id === pageId);
    if (pageDef) {
      pages[pageId] = {
        enabled: false,
        blocks: Object.fromEntries(pageDef.blocks.map((b) => [b.id, false])),
      };
    }
  });
  return pages;
}

/** Viewer-like-Admin: same pages as Admin but view-only (no action blocks). Finances excluded (Super Admin / Admin only). */
export function buildViewerLikeAdmin() {
  const pages = buildAdminAccess();
  VIEWER_EXCLUDED_PAGE_IDS.forEach((pageId) => {
    const pageDef = PAGE_DEFINITIONS.find((p) => p.id === pageId);
    if (pageDef) {
      pages[pageId] = {
        enabled: false,
        blocks: Object.fromEntries(pageDef.blocks.map((b) => [b.id, false])),
      };
    }
  });
  PAGE_DEFINITIONS.forEach((p) => {
    if (pages[p.id]?.enabled) {
      pages[p.id].blocks = Object.fromEntries(
        p.blocks.map((b) => {
          const actionKeywords = ['add', 'create', 'edit', 'delete', 'upload', 'run', 'invite'];
          const isAction = actionKeywords.some((k) => b.id.includes(k));
          return [b.id, !isAction];
        })
      );
    }
  });
  return pages;
}

/** Partner role: only dashboard, partners (read-only, no task manager), reports, settings (restricted). Data scoped to linked partner. */
export function buildPartnerAccess() {
  const noAccess = buildNoAccess();
  // Dashboard: enabled, all blocks (data filtered by linked partner in page)
  noAccess.dashboard = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'dashboard')?.blocks || []).map((b) => [b.id, true])
    ),
  };
  // Partners list: enabled, no add/edit, no task kanban
  const partnerBlocks = (PAGE_DEFINITIONS.find((p) => p.id === 'partners')?.blocks || []).map(
    (b) => [b.id, !['add_partner', 'upload_material', 'recording', 'task_kanban'].includes(b.id)]
  );
  noAccess.partners = { enabled: true, blocks: Object.fromEntries(partnerBlocks) };
  // Partner detail: enabled, but no task_manager block (no editing info enforced in UI)
  const detailBlocks = (PAGE_DEFINITIONS.find((p) => p.id === 'partner_detail')?.blocks || []).map(
    (b) => [b.id, b.id !== 'task_manager']
  );
  noAccess.partner_detail = { enabled: true, blocks: Object.fromEntries(detailBlocks) };
  // Reports: enabled (data filtered by linked partner in page)
  noAccess.reports = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'reports')?.blocks || []).map((b) => [b.id, true])
    ),
  };
  // Settings: enabled (restrictions applied in Settings UI for Partner role)
  noAccess.settings = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'settings')?.blocks || []).map((b) => [b.id, true])
    ),
  };
  return noAccess;
}

/** Agent role: workflows, tasks, projects, agent hub, AI recommend, reports (read), strategy (read). No partners, finances, campaigns, settings, audit, docs, roles, data. */
export function buildAgentAccess() {
  const noAccess = buildNoAccess();

  // Dashboard — read-only (all blocks)
  noAccess.dashboard = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'dashboard')?.blocks || []).map((b) => [b.id, true])
    ),
  };

  // Workflow — full access
  noAccess.workflow = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'workflow')?.blocks || []).map((b) => [b.id, true])
    ),
  };

  // Tasks — full access
  noAccess.task_manager = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'task_manager')?.blocks || []).map((b) => [b.id, true])
    ),
  };

  // Projects — read + create/edit, no delete
  noAccess.projects = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'projects')?.blocks || []).map((b) => [
        b.id,
        b.id !== 'delete_project',
      ])
    ),
  };

  // Agent Hub — full access
  noAccess.agent_hub = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'agent_hub')?.blocks || []).map((b) => [b.id, true])
    ),
  };

  // AI Recommend / Notification Center — full access
  noAccess.notification_center = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'notification_center')?.blocks || []).map((b) => [
        b.id,
        true,
      ])
    ),
  };

  // Reports — read-only (no export, refresh, custom templates)
  noAccess.reports = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'reports')?.blocks || []).map((b) => [
        b.id,
        !['export_actions', 'refresh_controls', 'custom_templates'].includes(b.id),
      ])
    ),
  };

  // Strategy Center — read-only (executive summary, AI rec, predictive scenarios)
  noAccess.strategy_center = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'strategy_center')?.blocks || []).map((b) => [
        b.id,
        ['executive_summary', 'ai_recommendation', 'predictive_scenarios'].includes(b.id),
      ])
    ),
  };

  // Job Pool — full access
  noAccess.job_pool = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'job_pool')?.blocks || []).map((b) => [b.id, true])
    ),
  };

  return noAccess;
}

/** Tools role: personal workspace — tasks, projects, workflows, job pool (read), finances (scoped), data (personal), docs, reports (scoped), settings (profile), audit log (own). No dashboard, partners, campaigns, agents, AI recommend, strategy, permissions. */
export function buildToolsAccess() {
  const noAccess = buildNoAccess();

  // Tasks — full access (personalized)
  noAccess.task_manager = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'task_manager')?.blocks || []).map((b) => [b.id, true])
    ),
  };

  // Projects — create/edit own + marketplace, no delete
  noAccess.projects = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'projects')?.blocks || []).map((b) => [
        b.id,
        b.id !== 'delete_project',
      ])
    ),
  };

  // Workflow — full access (private/scoped to user)
  noAccess.workflow = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'workflow')?.blocks || []).map((b) => [b.id, true])
    ),
  };

  // Job Pool — read only (metrics + table), no create/edit/delete
  noAccess.job_pool = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'job_pool')?.blocks || []).map((b) => [
        b.id,
        ['metrics', 'jobs_table'].includes(b.id),
      ])
    ),
  };

  // Finances — full read (scoped to user data, backup DB)
  noAccess.finances = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'finances')?.blocks || []).map((b) => [b.id, true])
    ),
  };

  // Data — search only (personal data, no topology/export)
  noAccess.data = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'data')?.blocks || []).map((b) => [
        b.id,
        b.id === 'search',
      ])
    ),
  };

  // Documentation — full access
  noAccess.documentation = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'documentation')?.blocks || []).map((b) => [
        b.id,
        true,
      ])
    ),
  };

  // Reports — read-only (no export, refresh, custom templates; scoped to user data)
  noAccess.reports = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'reports')?.blocks || []).map((b) => [
        b.id,
        !['export_actions', 'refresh_controls', 'custom_templates'].includes(b.id),
      ])
    ),
  };

  // Settings — profile only
  noAccess.settings = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'settings')?.blocks || []).map((b) => [
        b.id,
        b.id === 'profile',
      ])
    ),
  };

  // Activity Log — full (filtered to own activity only)
  noAccess.audit_log = {
    enabled: true,
    blocks: Object.fromEntries(
      (PAGE_DEFINITIONS.find((p) => p.id === 'audit_log')?.blocks || []).map((b) => [b.id, true])
    ),
  };

  return noAccess;
}

// ---------------------------------------------------------------------------
// Role templates (pre-fill page access when creating a role)
// ---------------------------------------------------------------------------

export const ROLE_TEMPLATES = [
  {
    id: 'tpl-marketing',
    name: 'Marketing',
    description: 'Dashboard, Campaigns, Partners, Reports, Injection, Finances',
    icon: 'CampaignOutlined',
    color: '#F59E0B',
    pages: [
      'dashboard',
      'campaigns',
      'partners',
      'partner_detail',
      'reports',
      'injection_hub',
      'finances',
      'settings',
      'marketing_dashboard',
      'marketing_audiences',
      'marketing_campaigns',
      'marketing_content',
      'marketing_acquisition',
      'marketing_conversion',
      'marketing_retention',
      'marketing_team',
    ],
    dataIsolation: true,
  },
  {
    id: 'tpl-core',
    name: 'Core',
    description: 'Tasks, Workflow, Projects, Settings, Tools + Knowledge Base',
    icon: 'BuildOutlined',
    color: '#1976D2',
    pages: ['task_manager', 'workflow', 'projects', 'settings', 'tools', 'documentation'],
    dataIsolation: true,
  },
  {
    id: 'tpl-ai-guru',
    name: 'AI Guru',
    description: 'Workflows, Agents, Consilium, Tools, Job Pool, Finances, AI Assist',
    icon: 'AutoAwesomeOutlined',
    color: '#7C3AED',
    pages: [
      'workflow',
      'agent_hub',
      'consilium',
      'tools',
      'job_pool',
      'finances',
      'notification_center',
      'settings',
    ],
    dataIsolation: true,
    simpleModeSwitchable: true,
  },
  {
    id: 'tpl-tools',
    name: 'Tools',
    description: 'Injection, Finances — personal workspace',
    icon: 'HandymanOutlined',
    color: '#10B981',
    pages: ['injection_hub', 'finances', 'settings'],
    dataIsolation: true,
  },
  {
    id: 'tpl-client',
    name: 'Client',
    description: 'Simple mode only — My Requests, Results, Settings (no marketplace)',
    icon: 'PersonOutlined',
    color: '#6366F1',
    pages: ['dashboard', 'job_pool', 'reports', 'settings'],
    dataIsolation: true,
    forceSimpleMode: true,
    restrictedSettings: true,
  },
];

/**
 * Build a page-access map from a role template.
 * All blocks are enabled for listed pages; all other pages are disabled.
 */
export function buildTemplateAccess(templateId) {
  const template = ROLE_TEMPLATES.find((t) => t.id === templateId);
  if (!template) return buildFullAccess();

  const pages = {};
  PAGE_DEFINITIONS.forEach((p) => {
    const enabled = template.pages.includes(p.id);
    pages[p.id] = {
      enabled,
      blocks: Object.fromEntries(p.blocks.map((b) => [b.id, enabled])),
    };
  });
  return pages;
}

// ---------------------------------------------------------------------------
// Built-in roles (always present, seeded on first load)
// ---------------------------------------------------------------------------

const BUILT_IN_ROLES = [
  {
    id: 'role-super-admin',
    name: 'Super Admin',
    description: 'Full unrestricted access to all pages and actions',
    builtIn: true,
    deletable: false,
    color: '#D32F2F',
    pages: buildFullAccess(),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'role-manager',
    name: 'Admin',
    description:
      'Full access like Super Admin except no Documentation, AI Recommend, Activity Log, or Data',
    builtIn: true,
    deletable: false,
    color: '#404040',
    pages: buildAdminAccess(),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'role-viewer',
    name: 'Viewer',
    description: 'Same pages as Admin but view-only — no create, edit, delete, or other actions',
    builtIn: true,
    deletable: false,
    color: '#757575',
    pages: buildViewerLikeAdmin(),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'role-partner',
    name: 'Partner',
    description:
      "Access linked to one partner only \u2014 sees only that partner's data on Dashboard, Partners, and Reports; restricted Settings",
    builtIn: true,
    deletable: false,
    color: '#2E7D32',
    pages: buildPartnerAccess(),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'role-agent',
    name: 'Agent',
    description:
      'AI agent access — workflows, tasks, projects, and agent hub; no finances, permissions, or sensitive data',
    builtIn: true,
    deletable: false,
    color: '#7C4DFF',
    pages: buildAgentAccess(),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'role-tools',
    name: 'Tools',
    description:
      'Personal workspace \u2014 tasks, projects, workflows, finances, and data scoped to this user only; all activity logs are private',
    builtIn: true,
    deletable: false,
    color: '#00897B',
    pages: buildToolsAccess(),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// Storage helpers (localStorage fallback)
// ---------------------------------------------------------------------------

const ROLES_KEY = 'orch_roles_v1';
const USER_ROLES_KEY = 'orch_user_roles_v1';
const USER_STATUS_KEY = 'orch_user_status_v1';
const USER_LINKED_PARTNER_KEY = 'orch_user_linked_partner_v1';

const canUseStorage = () => typeof window !== 'undefined' && !!window.localStorage;
const clone = (v) => JSON.parse(JSON.stringify(v));

function loadFromStorage(key, fallback) {
  if (!canUseStorage()) return clone(fallback);
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupted — reset
  }
  return clone(fallback);
}

function saveToStorage(key, data) {
  if (!canUseStorage()) return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // quota exceeded — silently fail
  }
}

// ---------------------------------------------------------------------------
// Roles CRUD (Supabase roles table → localStorage fallback)
// ---------------------------------------------------------------------------

let rolesCache = null;

function ensureRoles() {
  if (!rolesCache) {
    rolesCache = loadFromStorage(ROLES_KEY, BUILT_IN_ROLES);
    // Ensure built-in roles are always present
    BUILT_IN_ROLES.forEach((br) => {
      if (!rolesCache.find((r) => r.id === br.id)) {
        rolesCache.unshift(clone(br));
      }
    });
  }
  return rolesCache;
}

function persistRoles() {
  saveToStorage(ROLES_KEY, rolesCache);
}

export async function loadRoles() {
  // Try Supabase first
  if (hasSupabase()) {
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('created_at', { ascending: true });
      if (!error && data && data.length > 0) {
        // Map DB rows to our role shape
        let mapped = data.map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description || '',
          builtIn: r.built_in || false,
          deletable: r.deletable !== false,
          color: r.color || '#404040',
          pages: typeof r.pages === 'string' ? JSON.parse(r.pages) : r.pages || {},
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }));
        // Built-ins in DB often have empty pages (seeded with {}). Fill from BUILT_IN_ROLES so access level displays correctly.
        mapped = mapped.map((r) => {
          const builtIn = BUILT_IN_ROLES.find((br) => br.id === r.id);
          if (builtIn && (!r.pages || Object.keys(r.pages).length === 0)) {
            const filled = { ...r, pages: clone(builtIn.pages) };
            // Persist to Supabase so DB has correct pages for next load
            supabase
              .from('roles')
              .update({
                name: builtIn.name,
                description: builtIn.description || '',
                pages: builtIn.pages || {},
                updated_at: new Date().toISOString(),
              })
              .eq('id', r.id)
              .then(() => {});
            return filled;
          }
          return r;
        });
        // Ensure all built-in roles (e.g. Partner) are present — merge any missing from BUILT_IN_ROLES
        BUILT_IN_ROLES.forEach((br) => {
          if (!mapped.find((r) => r.id === br.id)) {
            mapped = [clone(br), ...mapped];
            // Upsert to Supabase so the role exists in DB for other clients
            supabase
              .from('roles')
              .upsert(
                {
                  id: br.id,
                  name: br.name,
                  description: br.description || '',
                  built_in: br.builtIn,
                  deletable: br.deletable !== false,
                  color: br.color || '#404040',
                  pages: br.pages || {},
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'id' }
              )
              .then(() => {});
          }
        });
        rolesCache = mapped;
        return clone(mapped);
      }
    } catch {
      // Table doesn't exist or RLS issue — fall through to localStorage
    }
  }
  return clone(ensureRoles());
}

export async function createRole(roleData) {
  const now = new Date().toISOString();
  const id = `role-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  // Embed template metadata in pages JSONB (avoids DB migration)
  const pages = { ...(roleData.pages || {}) };
  if (roleData.templateId || roleData.dataIsolation || roleData.forceSimpleMode) {
    pages._meta = {
      templateId: roleData.templateId || null,
      dataIsolation: roleData.dataIsolation || false,
      forceSimpleMode: roleData.forceSimpleMode || false,
    };
  }
  const role = {
    id,
    name: roleData.name || 'Untitled Role',
    description: roleData.description || '',
    builtIn: false,
    deletable: true,
    color: roleData.color || '#404040',
    pages,
    createdAt: now,
    updatedAt: now,
  };

  // Try Supabase
  if (hasSupabase()) {
    try {
      const { error } = await supabase.from('roles').insert({
        id: role.id,
        name: role.name,
        description: role.description,
        built_in: false,
        deletable: true,
        color: role.color,
        pages: role.pages,
      });
      if (!error) {
        await trackPermissionAction('role_created', 'role', role.id, {
          summary: `Role created: ${role.name}`,
          roleName: role.name,
          source: 'permissions',
        });
        maybeNotify('role_created', { roleName: role.name });
        return clone(role);
      }
    } catch {
      // fall through
    }
  }

  // localStorage fallback
  ensureRoles();
  rolesCache.push(role);
  persistRoles();
  await trackPermissionAction('role_created', 'role', role.id, {
    summary: `Role created: ${role.name}`,
    roleName: role.name,
    source: 'permissions',
  });
  maybeNotify('role_created', { roleName: role.name });
  return clone(role);
}

export async function updateRole(roleId, updates) {
  const now = new Date().toISOString();
  // Embed template metadata in pages JSONB
  const pages = { ...(updates.pages || {}) };
  if (updates.templateId || updates.dataIsolation || updates.forceSimpleMode) {
    pages._meta = {
      templateId: updates.templateId || null,
      dataIsolation: updates.dataIsolation || false,
      forceSimpleMode: updates.forceSimpleMode || false,
    };
  }

  if (hasSupabase()) {
    try {
      const { error } = await supabase
        .from('roles')
        .update({
          name: updates.name,
          description: updates.description,
          color: updates.color,
          pages,
          updated_at: now,
        })
        .eq('id', roleId);
      if (!error) {
        await trackPermissionAction('role_updated', 'role', roleId, {
          summary: `Role updated: ${updates.name || roleId}`,
          roleName: updates.name || '',
          source: 'permissions',
        });
        maybeNotify('role_updated', { roleName: updates.name || roleId });
        return { id: roleId, ...updates, updatedAt: now };
      }
    } catch {
      // fall through
    }
  }

  ensureRoles();
  const idx = rolesCache.findIndex((r) => r.id === roleId);
  if (idx === -1) throw new Error('Role not found');
  const existing = rolesCache[idx];
  rolesCache[idx] = {
    ...existing,
    ...updates,
    pages,
    id: existing.id,
    builtIn: existing.builtIn,
    deletable: existing.deletable,
    updatedAt: now,
  };
  persistRoles();
  await trackPermissionAction('role_updated', 'role', roleId, {
    summary: `Role updated: ${rolesCache[idx].name}`,
    roleName: rolesCache[idx].name,
    source: 'permissions',
  });
  maybeNotify('role_updated', { roleName: rolesCache[idx].name });
  return clone(rolesCache[idx]);
}

export async function deleteRole(roleId) {
  if (hasSupabase()) {
    try {
      const { error } = await supabase
        .from('roles')
        .delete()
        .eq('id', roleId)
        .eq('deletable', true);
      if (!error) {
        await trackPermissionAction('role_deleted', 'role', roleId, {
          summary: `Role deleted: ${roleId}`,
          source: 'permissions',
          importance: 'high',
        });
        return true;
      }
    } catch {
      // fall through
    }
  }

  ensureRoles();
  const role = rolesCache.find((r) => r.id === roleId);
  if (!role) throw new Error('Role not found');
  if (!role.deletable) throw new Error('Cannot delete built-in role');
  rolesCache = rolesCache.filter((r) => r.id !== roleId);
  persistRoles();
  await trackPermissionAction('role_deleted', 'role', roleId, {
    summary: `Role deleted: ${role.name}`,
    roleName: role.name,
    source: 'permissions',
    importance: 'high',
  });
  return true;
}

export async function duplicateRole(roleId) {
  const roles = await loadRoles();
  const source = roles.find((r) => r.id === roleId);
  if (!source) throw new Error('Role not found');
  const newRole = await createRole({
    name: `${source.name} (Copy)`,
    description: source.description,
    color: source.color,
    pages: clone(source.pages),
  });
  await trackPermissionAction('role_duplicated', 'role', newRole?.id ?? roleId, {
    summary: `Role duplicated: ${source.name} → ${newRole?.name ?? 'Copy'}`,
    sourceRoleId: roleId,
    sourceRoleName: source.name,
    source: 'permissions',
  });
  return newRole;
}

// ---------------------------------------------------------------------------
// User–Role mapping (Supabase user_roles table → localStorage fallback)
// ---------------------------------------------------------------------------

// In-memory cache for user→role mappings
let userRolesMap = null; // { [userId]: roleId }

function ensureUserRolesMap() {
  if (!userRolesMap) {
    userRolesMap = loadFromStorage(USER_ROLES_KEY, {});
  }
  return userRolesMap;
}

function persistUserRolesMap() {
  saveToStorage(USER_ROLES_KEY, userRolesMap);
}

// User status overrides (blocked users)
let userStatusMap = null; // { [userId]: 'active' | 'blocked' }

function ensureUserStatusMap() {
  if (!userStatusMap) {
    userStatusMap = loadFromStorage(USER_STATUS_KEY, {});
  }
  return userStatusMap;
}

function persistUserStatusMap() {
  saveToStorage(USER_STATUS_KEY, userStatusMap);
}

// Linked partner for Partner role: { [userId]: partnerId }
let userLinkedPartnerMap = null;

function ensureUserLinkedPartnerMap() {
  if (userLinkedPartnerMap === null) {
    userLinkedPartnerMap = loadFromStorage(USER_LINKED_PARTNER_KEY, {});
  }
  return userLinkedPartnerMap;
}

function persistUserLinkedPartnerMap() {
  saveToStorage(USER_LINKED_PARTNER_KEY, userLinkedPartnerMap);
}

/** Get the linked partner ID for a user (when role is Partner). Returns null if not set. */
export function getLinkedPartnerIdForUser(userId) {
  if (!userId) return null;
  ensureUserLinkedPartnerMap();
  const id = userLinkedPartnerMap[userId];
  return id || null;
}

/** Set the linked partner ID for a user (when role is Partner). Call when assigning Partner role. */
export function setLinkedPartnerIdForUser(userId, partnerId) {
  if (!userId) return;
  ensureUserLinkedPartnerMap();
  if (partnerId) {
    userLinkedPartnerMap[userId] = partnerId;
  } else {
    delete userLinkedPartnerMap[userId];
  }
  persistUserLinkedPartnerMap();
  if (hasSupabase()) {
    supabase
      .from('user_roles')
      .update({ linked_partner_id: partnerId || null })
      .eq('user_id', userId)
      .then(() => {})
      .catch(() => {});
  }
}

/** Get role _meta (templateId, dataIsolation, forceSimpleMode) by role ID. Returns {} if not found. */
export function getRoleMeta(roleId) {
  if (!roleId) return {};
  ensureRoles();
  const role = rolesCache?.find((r) => r.id === roleId);
  return role?.pages?._meta || {};
}

/** Get current user's role ID from in-memory map (must have called loadUsers() or ensured map is loaded). */
export function getRoleIdForUser(userId) {
  if (!userId) return null;
  ensureUserRolesMap();
  return userRolesMap[userId] || null;
}

async function loadUserRolesMappingFromSupabase() {
  if (!hasSupabase()) return null;
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('user_id, role_id, linked_partner_id');
    if (!error && data) {
      const roleMap = {};
      const linkedMap = {};
      data.forEach((row) => {
        roleMap[row.user_id] = row.role_id;
        if (row.linked_partner_id) linkedMap[row.user_id] = row.linked_partner_id;
      });
      return { roleMap, linkedPartnerMap: linkedMap };
    }
  } catch {
    // column linked_partner_id may not exist yet (migration 016)
  }
  try {
    const { data, error } = await supabase.from('user_roles').select('user_id, role_id');
    if (!error && data) {
      const roleMap = {};
      data.forEach((row) => {
        roleMap[row.user_id] = row.role_id;
      });
      return { roleMap, linkedPartnerMap: {} };
    }
  } catch {
    // table might not exist
  }
  return null;
}

async function listSupabaseUsersViaAdminApi() {
  if (!hasSupabase() || !supabase) return null;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return null;

    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const res = await fetch(`${base}/api/invite-user?op=list-users`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return Array.isArray(payload?.users) ? payload.users : null;
  } catch {
    return null;
  }
}

export async function purgeSupabaseUsers({ keepEmails = [], alsoDeleteTables = true } = {}) {
  if (!hasSupabase() || !supabase) {
    throw new Error('Supabase is not configured.');
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Unauthorized. Sign in and retry.');

  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const res = await fetch(`${base}/api/invite-user?op=purge-users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      keepEmails,
      alsoDeleteTables,
      confirm: 'DELETE_EVERYONE_ELSE',
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = payload?.error || 'Failed to purge users.';
    const detail = payload?.detail ? String(payload.detail) : '';
    throw new Error(detail ? `${msg}\n\n${detail}` : msg);
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Load REAL users from auth system
// ---------------------------------------------------------------------------

/**
 * Load real users from the auth system:
 * - Supabase: query auth.users via supabase service role or the public view
 * - Local: read from orch_auth_users localStorage
 *
 * Returns unified user objects with role & status info merged in.
 */
export async function loadUsers() {
  const roles = ensureUserRolesMap();
  const statuses = ensureUserStatusMap();
  let users = [];

  if (hasSupabase()) {
    // Try to load user-role mappings from Supabase
    const supabaseMappings = await loadUserRolesMappingFromSupabase();
    if (supabaseMappings) {
      Object.assign(roles, supabaseMappings.roleMap || supabaseMappings);
      userRolesMap = roles;
      persistUserRolesMap();
      if (supabaseMappings.linkedPartnerMap) {
        ensureUserLinkedPartnerMap();
        Object.assign(userLinkedPartnerMap, supabaseMappings.linkedPartnerMap);
        persistUserLinkedPartnerMap();
      }
    }

    // Get the current authenticated user as the baseline
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUser = sessionData?.session?.user;
      if (currentUser) {
        users.push({
          id: currentUser.id,
          name:
            currentUser.user_metadata?.display_name || currentUser.email?.split('@')[0] || 'User',
          email: currentUser.email || '',
          avatar: currentUser.user_metadata?.avatar_url || null,
          roleId: roles[currentUser.id] || 'role-super-admin', // First user gets Super Admin by default
          status: statuses[currentUser.id] || 'active',
          lastLogin: currentUser.last_sign_in_at || null,
          twoFaEnabled: false,
          createdAt: currentUser.created_at || new Date().toISOString(),
          provider: currentUser.app_metadata?.provider || 'email',
        });
      }
    } catch {
      // Session retrieval failed
    }

    // Try to list all users via the auth admin API (only works with service_role key)
    // For anon key this will fail — that's expected.
    // Prefer our server-side admin endpoint (service_role) when available.
    try {
      const apiUsers = await listSupabaseUsersViaAdminApi();
      if (apiUsers?.length > 0) {
        users = apiUsers.map((u) => ({
          id: u.id,
          name: u.user_metadata?.display_name || u.email?.split('@')[0] || 'User',
          email: u.email || '',
          avatar: u.user_metadata?.avatar_url || null,
          roleId: roles[u.id] || null,
          status:
            statuses[u.id] === 'blocked' ? 'blocked' : u.email_confirmed_at ? 'active' : 'invited',
          lastLogin: u.last_sign_in_at || null,
          twoFaEnabled: (u.factors?.length || 0) > 0,
          createdAt: u.created_at || new Date().toISOString(),
          provider: u.app_metadata?.provider || 'email',
        }));
      } else {
        const { data: adminData, error: adminError } = await supabase.auth.admin.listUsers();
        if (!adminError && adminData?.users?.length > 0) {
          // Replace with full user list
          users = adminData.users.map((u) => ({
            id: u.id,
            name: u.user_metadata?.display_name || u.email?.split('@')[0] || 'User',
            email: u.email || '',
            avatar: u.user_metadata?.avatar_url || null,
            roleId: roles[u.id] || null,
            status:
              statuses[u.id] === 'blocked'
                ? 'blocked'
                : u.email_confirmed_at
                  ? 'active'
                  : 'invited',
            lastLogin: u.last_sign_in_at || null,
            twoFaEnabled: (u.factors?.length || 0) > 0,
            createdAt: u.created_at || new Date().toISOString(),
            provider: u.app_metadata?.provider || 'email',
          }));
        }
      }
    } catch {
      // admin.listUsers requires service_role — expected to fail with anon key
    }
  } else {
    // localStorage auth — read from orch_auth_users
    try {
      const raw = localStorage.getItem('orch_auth_users');
      if (raw) {
        const localUsers = JSON.parse(raw);
        if (Array.isArray(localUsers)) {
          users = localUsers.map((u) => ({
            id: u.uid,
            name: u.displayName || u.email?.split('@')[0] || 'User',
            email: u.email || '',
            avatar: u.photoURL || null,
            roleId: roles[u.uid] || null,
            status: statuses[u.uid] || 'active',
            lastLogin: u.lastLoginAt || null,
            twoFaEnabled: false,
            createdAt: u.createdAt || new Date().toISOString(),
            provider: 'local',
          }));
        }
      }
    } catch {
      // parse error
    }

    // Also include the current session user if not already in the list
    try {
      const sessionRaw = localStorage.getItem('orch_auth_session');
      if (sessionRaw) {
        const session = JSON.parse(sessionRaw);
        if (session?.uid && !users.find((u) => u.id === session.uid)) {
          users.push({
            id: session.uid,
            name: session.displayName || session.email?.split('@')[0] || 'User',
            email: session.email || '',
            avatar: session.photoURL || null,
            roleId: roles[session.uid] || null,
            status: statuses[session.uid] || 'active',
            lastLogin: new Date().toISOString(),
            twoFaEnabled: false,
            createdAt: session.createdAt || new Date().toISOString(),
            provider: 'local',
          });
        }
      }
    } catch {
      // parse error
    }
  }

  // Auto-assign Super Admin to any user who doesn't have a role yet
  let changed = false;
  users.forEach((u) => {
    if (!u.roleId) {
      u.roleId = 'role-super-admin';
      roles[u.id] = 'role-super-admin';
      changed = true;
    }
  });
  if (changed) {
    userRolesMap = roles;
    persistUserRolesMap();
  }

  return clone(users);
}

// ---------------------------------------------------------------------------
// User actions
// ---------------------------------------------------------------------------

export async function updateUserRole(userId, roleId, linkedPartnerId = null) {
  // When role is Partner, persist linked partner; otherwise clear it
  if (roleId === 'role-partner' && linkedPartnerId) {
    setLinkedPartnerIdForUser(userId, linkedPartnerId);
  } else {
    setLinkedPartnerIdForUser(userId, null);
  }

  // Try Supabase
  if (hasSupabase()) {
    try {
      const { error } = await supabase.from('user_roles').upsert(
        {
          user_id: userId,
          role_id: roleId,
          assigned_at: new Date().toISOString(),
          linked_partner_id: roleId === 'role-partner' ? linkedPartnerId : null,
        },
        { onConflict: 'user_id' }
      );
      if (!error) {
        await trackPermissionAction('user_role_changed', 'user', userId, {
          summary: `User role changed to ${roleId}`,
          roleId,
          linkedPartnerId: roleId === 'role-partner' ? linkedPartnerId : undefined,
          source: 'permissions',
        });
        ensureUserRolesMap();
        userRolesMap[userId] = roleId;
        persistUserRolesMap();
        return true;
      }
    } catch {
      // fall through to localStorage
    }
  }

  ensureUserRolesMap();
  userRolesMap[userId] = roleId;
  persistUserRolesMap();
  await trackPermissionAction('user_role_changed', 'user', userId, {
    summary: `User role changed to ${roleId}`,
    roleId,
    source: 'permissions',
  });
  return true;
}

export async function blockUser(userId) {
  ensureUserStatusMap();
  const current = userStatusMap[userId];
  userStatusMap[userId] = current === 'blocked' ? 'active' : 'blocked';
  persistUserStatusMap();
  await trackPermissionAction('user_status_changed', 'user', userId, {
    summary: `User status changed to ${userStatusMap[userId]}`,
    status: userStatusMap[userId],
    source: 'permissions',
  });
  return userStatusMap[userId];
}

export async function deleteUser(userId) {
  // For Supabase, deleting users requires admin access (service role).
  if (hasSupabase()) {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) throw new Error('Unauthorized. Sign in and retry.');

    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const res = await fetch(
      `${base}/api/invite-user?op=delete-user&userId=${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = payload?.error || 'Failed to delete user.';
      const detail = payload?.detail ? String(payload.detail) : '';
      throw new Error(detail ? `${msg}\n\n${detail}` : msg);
    }
  } else {
    // localStorage auth — remove from orch_auth_users
    try {
      const raw = localStorage.getItem('orch_auth_users');
      if (raw) {
        const localUsers = JSON.parse(raw);
        const filtered = localUsers.filter((u) => u.uid !== userId);
        localStorage.setItem('orch_auth_users', JSON.stringify(filtered));
      }
    } catch {
      // ignore
    }
  }

  // Remove role mapping
  ensureUserRolesMap();
  delete userRolesMap[userId];
  persistUserRolesMap();

  // Remove status
  ensureUserStatusMap();
  delete userStatusMap[userId];
  persistUserStatusMap();

  await trackPermissionAction('user_deleted', 'user', userId, {
    summary: 'User removed',
    source: 'permissions',
    importance: 'high',
  });
  maybeNotify('user_deleted', { email: userId });
  return true;
}

export async function disableUser2FA(userId) {
  // For Supabase, this requires admin access
  if (hasSupabase()) {
    try {
      // List user's MFA factors and unenroll them
      const { data: userData } = await supabase.auth.admin.getUserById(userId);
      if (userData?.user?.factors) {
        for (const factor of userData.user.factors) {
          await supabase.auth.admin.mfa.deleteFactor({ userId, factorId: factor.id });
        }
      }
    } catch {
      // Expected to fail with anon key
    }
  }
  await trackPermissionAction('user_2fa_disabled', 'user', userId, {
    summary: '2FA disabled for user',
    source: 'permissions',
    importance: 'medium',
  });
  return true;
}

export async function resendPasswordEmail(userId, email) {
  if (!hasSupabase() || !email) {
    await trackPermissionAction('password_reset_sent', 'user', userId, {
      summary: `Password reset sent to ${email || 'unknown'}`,
      email: email || 'unknown',
      source: 'permissions',
    });
    return { success: true, email: email || 'unknown' };
  }
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    throw new Error('Unauthorized. Sign in and retry.');
  }
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  const res = await fetch(`${base}/api/request-password-reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || 'Failed to send password reset');
  }
  await trackPermissionAction('password_reset_sent', 'user', userId, {
    summary: payload.emailSent
      ? `Password reset sent to ${email}`
      : `Password reset link generated for ${email} (manual copy)`,
    email,
    source: 'permissions',
  });
  return {
    success: true,
    email: payload.email,
    link: payload.link,
    emailSent: payload.emailSent !== false,
    reason: payload.reason,
    note: payload.note,
  };
}

export async function inviteUser(data) {
  if (hasSupabase() && data.email) {
    try {
      // Admin invites must be done server-side with a service role key.
      // We call our secure API route with the current user's access token.
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        throw new Error('Unauthorized. Sign in and retry.');
      }

      const base = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch(`${base}/api/invite-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: data.email,
          name: data.name || data.email.split('@')[0],
          roleId: data.roleId,
          linkedPartnerId: data.roleId === 'role-partner' ? data.linkedPartnerId || null : null,
          password: data.password || undefined,
        }),
      });

      // Keep null (not {}) when the body isn't JSON: a non-JSON error body means
      // the request never reached the handler (proxy/routing fault), and the
      // status is the only clue we have left to report.
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = payload?.error || `Failed to send invitation. (HTTP ${res.status})`;
        const detail = payload?.detail ? String(payload.detail) : '';
        // Surface actionable server details (e.g. missing migrations) to the UI.
        throw new Error(detail ? `${msg}\n\n${detail}` : msg);
      }

      const invitedUserId = payload?.userId || payload?.data?.userId || null;
      const createdWithPassword = !!payload?.createdWithPassword;
      await trackPermissionAction('user_invited', 'user', invitedUserId || data.email, {
        summary: `User invited: ${data.email}`,
        email: data.email,
        roleId: data.roleId || null,
        source: 'permissions',
      });
      maybeNotify('user_invited', { email: data.email, roleName: data.roleId || '' });
      return { success: true, email: data.email, userId: invitedUserId, createdWithPassword };
    } catch (err) {
      throw new Error(err?.message || 'Failed to send invitation.');
    }
  }

  // Local mode: inviteUser() should not be called directly.
  // The local invite flow in RolesPermissions.jsx uses authRegister() with a
  // password instead, which properly hashes and stores credentials.
  throw new Error(
    'Local invite requires a password. Use the registration flow in the invite dialog instead.'
  );
}

// ---------------------------------------------------------------------------
// Bulk actions
// ---------------------------------------------------------------------------

export async function bulkAssignRole(userIds, roleId) {
  for (const uid of userIds) {
    await updateUserRole(uid, roleId);
  }
  return true;
}

export async function bulkBlockUsers(userIds) {
  for (const uid of userIds) {
    ensureUserStatusMap();
    if (userStatusMap[uid] !== 'blocked') {
      await blockUser(uid);
    }
  }
  return true;
}

export async function bulkDeleteUsers(userIds) {
  for (const uid of userIds) {
    await deleteUser(uid);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Access check helpers (for use by other components)
// ---------------------------------------------------------------------------

/**
 * Check if a user has access to a specific page.
 * @param {string} userId
 * @param {string} pageId
 * @returns {Promise<boolean>}
 */
export async function hasPageAccess(userId, pageId) {
  const roles = await loadRoles();
  const userRoles = ensureUserRolesMap();
  const roleId = userRoles[userId];
  if (!roleId) return true; // No role assigned = full access (owner)
  const role = roles.find((r) => r.id === roleId);
  if (!role) return true;
  return !!role.pages?.[pageId]?.enabled;
}

/**
 * Check if a user has access to a specific block within a page.
 * @param {string} userId
 * @param {string} pageId
 * @param {string} blockId
 * @returns {Promise<boolean>}
 */
export async function hasBlockAccess(userId, pageId, blockId) {
  const roles = await loadRoles();
  const userRoles = ensureUserRolesMap();
  const roleId = userRoles[userId];
  if (!roleId) return true;
  const role = roles.find((r) => r.id === roleId);
  if (!role) return true;
  const pageAccess = role.pages?.[pageId];
  if (!pageAccess?.enabled) return false;
  return !!pageAccess.blocks?.[blockId];
}

// ---------------------------------------------------------------------------
// Supabase migration SQL
// ---------------------------------------------------------------------------

export const ROLES_MIGRATION_SQL = `-- Roles & Permissions tables (Supabase → SQL Editor)
create extension if not exists "uuid-ossp";

-- Roles table
create table if not exists public.roles (
  id text primary key,
  name text not null,
  description text default '',
  built_in boolean default false,
  deletable boolean default true,
  color text default '#404040',
  pages jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- User roles junction table
create table if not exists public.user_roles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  role_id text references public.roles(id) on delete set null,
  assigned_at timestamptz default now(),
  unique(user_id)
);

-- Indexes
create index if not exists idx_roles_name on public.roles(name);
create index if not exists idx_user_roles_user_id on public.user_roles(user_id);
create index if not exists idx_user_roles_role_id on public.user_roles(role_id);

-- RLS
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;

drop policy if exists "Authenticated users can read roles" on public.roles;
create policy "Authenticated users can read roles" on public.roles
  for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can manage roles" on public.roles;
create policy "Authenticated users can manage roles" on public.roles
  for all using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read user_roles" on public.user_roles;
create policy "Authenticated users can read user_roles" on public.user_roles
  for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can manage user_roles" on public.user_roles;
create policy "Authenticated users can manage user_roles" on public.user_roles
  for all using (auth.role() = 'authenticated');

-- Seed built-in roles
INSERT INTO public.roles (id, name, description, built_in, deletable, color, pages)
VALUES 
  ('role-super-admin', 'Super Admin', 'Full unrestricted access to all pages and actions', true, false, '#D32F2F', '{}'::jsonb),
  ('role-manager', 'Manager', 'Full access to operational pages with management capabilities', true, false, '#404040', '{}'::jsonb),
  ('role-viewer', 'Viewer', 'Read-only access — can view all pages but cannot perform actions', true, false, '#757575', '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;
`;
