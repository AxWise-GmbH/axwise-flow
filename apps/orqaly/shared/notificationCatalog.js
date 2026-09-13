/**
 * Shared notification action catalog used by frontend and API routes.
 * Keeps action keys, labels, and defaults in one place to prevent drift.
 *
 * Each category is tied to a platform page via `pageId` (or `pageIds` for the
 * multi-page marketing area, or `global: true` for account-wide events). The
 * Settings UI uses this to ROLE-SCOPE the list: a user only sees categories for
 * pages their role grants access to (see PAGE_DEFINITIONS in
 * src/services/rolesPermissionsService.js).
 *
 * `serverOnly: true` marks events that originate from backend handlers/workers
 * (no client-side trigger) - they are listed so users can subscribe, with
 * emission wired on the server side.
 *
 * Channel preferences (email / in-app) are stored alongside the per-action
 * toggles in the same JSONB under the reserved `_channels` key.
 */

export const CHANNEL_KEY = '_channels';

export const EMAIL_ACTION_CATEGORIES = {
  partners: {
    label: 'Partners',
    pageId: 'partners',
    actions: {
      partner_created:          { label: 'New partner added',           default: false },
      partner_updated:          { label: 'Partner details changed',     default: false },
      partner_archived:         { label: 'Partner archived / removed',  default: false },
      partner_payment_received: { label: 'Finance payment recorded',    default: false },
      meeting_created:          { label: 'Meeting scheduled',           default: false },
      meeting_transcribed:      { label: 'Meeting transcript ready',    default: false },
    },
  },
  tasks: {
    label: 'Task Manager',
    pageId: 'task_manager',
    actions: {
      task_created:   { label: 'New task created',        default: false },
      task_completed: { label: 'Task marked complete',    default: false },
      task_overdue:   { label: 'Task passed its deadline', default: false },
      task_assigned:  { label: 'Task assigned to you',    default: false },
      task_deleted:   { label: 'Task deleted',            default: false },
    },
  },
  workflows: {
    label: 'Workflow',
    pageId: 'workflow',
    actions: {
      workflow_created: { label: 'Workflow created',          default: false },
      workflow_updated: { label: 'Workflow canvas saved',     default: false },
      workflow_toggled: { label: 'Workflow enabled / paused', default: false },
      workflow_deleted: { label: 'Workflow deleted',          default: false },
    },
  },
  projects: {
    label: 'Projects',
    pageId: 'projects',
    actions: {
      project_created:        { label: 'Project created',                     default: false },
      project_status_changed: { label: 'Project status changed',              default: false },
      project_deleted:        { label: 'Project deleted',                     default: false },
      project_linked:         { label: 'Partner or workflow linked to project', default: false },
    },
  },
  permissions: {
    label: 'Permissions',
    pageId: 'roles',
    actions: {
      user_invited:  { label: 'New user invited',          default: false },
      user_deleted:  { label: 'User account removed',      default: false },
      role_created:  { label: 'New role created',          default: false },
      role_updated:  { label: 'Role permissions changed',  default: false },
    },
  },
  data: {
    label: 'Data',
    pageId: 'data',
    actions: {
      github_push_created:   { label: 'New GitHub push recorded',     default: false },
      task_assigned_to_push: { label: 'Task linked to a Git commit',  default: false },
    },
  },
  reports: {
    label: 'Reports',
    pageId: 'reports',
    actions: {
      report_generated: { label: 'Report generated',              default: false },
      report_exported:  { label: 'Report exported (PDF / CSV)',   default: false },
      report_ingested:  { label: 'External data ingested via API', default: false, serverOnly: true },
    },
  },
  finances: {
    label: 'Finances',
    pageId: 'finances',
    actions: {
      finance_exported: { label: 'Finance data exported',     default: false },
      finance_recorded: { label: 'Finance entry recorded',    default: false, serverOnly: true },
    },
  },
  campaigns: {
    label: 'Campaigns',
    pageId: 'campaigns',
    actions: {
      campaign_paused:   { label: 'Campaign paused',   default: false, serverOnly: true },
      campaign_resumed:  { label: 'Campaign resumed',  default: false, serverOnly: true },
      campaign_deleted:  { label: 'Campaign deleted',  default: false, serverOnly: true },
    },
  },
  agents: {
    label: 'Agents',
    pageId: 'agent_hub',
    actions: {
      agent_created: { label: 'Agent created',          default: false },
      agent_updated: { label: 'Agent details changed',  default: false },
      agent_removed: { label: 'Agent removed',          default: false },
    },
  },
  job_pool: {
    label: 'Job Pool',
    pageId: 'job_pool',
    actions: {
      job_created:   { label: 'Job created',   default: false },
      job_updated:   { label: 'Job updated',   default: false },
      job_deleted:   { label: 'Job deleted',   default: false },
      job_completed: { label: 'Job completed', default: false, serverOnly: true },
      job_failed:    { label: 'Job failed',    default: false, serverOnly: true },
    },
  },
  tools: {
    label: 'Tools',
    pageId: 'tools',
    actions: {
      tool_created:  { label: 'Tool created',  default: false },
      tool_updated:  { label: 'Tool updated',  default: false },
      tool_deleted:  { label: 'Tool deleted',  default: false },
      tool_executed: { label: 'Tool executed', default: false },
    },
  },
  injection: {
    label: 'Injection',
    pageId: 'injection_hub',
    actions: {
      material_uploaded: { label: 'Material uploaded',     default: false },
      material_deleted:  { label: 'Material deleted',      default: false },
      translation_done:  { label: 'Translation completed', default: false },
    },
  },
  consilium: {
    label: 'Consilium',
    pageId: 'consilium',
    actions: {
      board_decision:    { label: 'Board reached a decision', default: false, serverOnly: true },
      agent_quarantined: { label: 'Agent quarantined',        default: false, serverOnly: true },
      consensus_reached: { label: 'Consensus reached',        default: false, serverOnly: true },
    },
  },
  strategy: {
    label: 'Strategy Center',
    pageId: 'strategy_center',
    actions: {
      strategy_saved:           { label: 'Strategy snapshot saved', default: false, serverOnly: true },
      recommendation_generated: { label: 'AI recommendation ready', default: false, serverOnly: true },
    },
  },
  ai_recommend: {
    label: 'AI Recommend',
    pageId: 'notification_center',
    actions: {
      cycle_completed:     { label: 'Optimization cycle completed', default: false, serverOnly: true },
      recommendation_ready: { label: 'New recommendation available', default: false, serverOnly: true },
    },
  },
  dashboard: {
    label: 'Dashboard',
    pageId: 'dashboard',
    actions: {
      dashboard_created: { label: 'Dashboard created', default: false },
      dashboard_updated: { label: 'Dashboard updated', default: false },
      dashboard_deleted: { label: 'Dashboard deleted', default: false },
    },
  },
  documentation: {
    label: 'Documentation',
    pageId: 'documentation',
    actions: {
      api_key_created: { label: 'API key created', default: false },
      api_key_revoked: { label: 'API key revoked', default: false },
    },
  },
  marketing: {
    label: 'Marketing',
    pageIds: [
      'marketing_dashboard',
      'marketing_audiences',
      'marketing_campaigns',
      'marketing_content',
      'marketing_acquisition',
      'marketing_conversion',
      'marketing_retention',
      'marketing_team',
    ],
    actions: {
      contact_added:     { label: 'CRM contact added',    default: false },
      contact_removed:   { label: 'CRM contact removed',  default: false },
      campaign_launched: { label: 'Marketing campaign launched', default: false, serverOnly: true },
    },
  },
  security: {
    label: 'Security',
    global: true,
    actions: {
      password_changed: { label: 'Password changed', default: true },
      login_warning:    { label: 'Suspicious login warning', default: true, serverOnly: true },
      login_frozen:     { label: 'Account temporarily frozen', default: true, serverOnly: true },
      login_blocked:    { label: 'Account blocked', default: true, serverOnly: true },
    },
  },
};

/** Flat map: actionKey → default boolean (action keys only, no channels). */
export function getDefaultEmailPreferences() {
  const defaults = {};
  for (const category of Object.values(EMAIL_ACTION_CATEGORIES)) {
    for (const [actionKey, cfg] of Object.entries(category.actions || {})) {
      defaults[actionKey] = !!cfg.default;
    }
  }
  return defaults;
}

export function getAllEmailActionKeys() {
  return Object.keys(getDefaultEmailPreferences());
}

export function isValidEmailAction(actionKey) {
  if (!actionKey) return false;
  return Object.prototype.hasOwnProperty.call(getDefaultEmailPreferences(), actionKey);
}

/** Human label for an action key, searched across all categories. */
export function getActionLabel(actionKey) {
  for (const category of Object.values(EMAIL_ACTION_CATEGORIES)) {
    const cfg = category.actions?.[actionKey];
    if (cfg) return cfg.label;
  }
  return null;
}

/** Default delivery channels for a fresh user. */
export function getDefaultChannels() {
  return { email: true, inapp: true };
}

/**
 * Read channel preferences from a (possibly partial) prefs object.
 * Channels default to ON unless explicitly disabled.
 */
export function getChannelPrefs(prefs) {
  const c = prefs && typeof prefs === 'object' ? prefs[CHANNEL_KEY] : null;
  return {
    email: c?.email !== false,
    inapp: c?.inapp !== false,
  };
}

/** Page ids a category maps to (for role-scoping). Empty for global categories. */
export function getCategoryPageIds(category) {
  if (!category || category.global) return [];
  if (Array.isArray(category.pageIds)) return category.pageIds;
  if (category.pageId) return [category.pageId];
  return [];
}

/**
 * Category entries ([key, category]) visible to a user given the set of page
 * ids their role can access. Global categories are always included. Pass
 * null/undefined to get all categories (fail open while role info is loading).
 *
 * @param {Set<string>|null|undefined} accessiblePageIds
 */
export function getVisibleCategoryEntries(accessiblePageIds) {
  const entries = Object.entries(EMAIL_ACTION_CATEGORIES);
  if (!accessiblePageIds) return entries;
  return entries.filter(([, cat]) => {
    if (cat.global) return true;
    const pageIds = getCategoryPageIds(cat);
    if (pageIds.length === 0) return true;
    return pageIds.some((pageId) => accessiblePageIds.has(pageId));
  });
}

export function normalizeEmailPreferences(rawPrefs) {
  const defaults = getDefaultEmailPreferences();
  if (!rawPrefs || typeof rawPrefs !== 'object') {
    return { ...defaults, [CHANNEL_KEY]: getDefaultChannels() };
  }

  const normalized = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (Object.prototype.hasOwnProperty.call(rawPrefs, key)) {
      normalized[key] = !!rawPrefs[key];
    }
  }
  normalized[CHANNEL_KEY] = {
    email: rawPrefs?.[CHANNEL_KEY]?.email !== false,
    inapp: rawPrefs?.[CHANNEL_KEY]?.inapp !== false,
  };
  return normalized;
}
