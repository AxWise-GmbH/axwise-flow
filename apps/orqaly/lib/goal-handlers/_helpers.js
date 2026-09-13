/**
 * Shared helpers for goal pipeline stages.
 *
 * Extracted from goal-orchestrator.js so all stage handlers
 * can import the same utility functions.
 */
import crypto from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { getVercelOidcToken } from '@vercel/oidc';
import { createLogger } from '../../api/_lib/logger.js';
import {
  bindJobPayloadToWorkerDeployment,
  resolveWorkerDeploymentIdentity,
  resolveWorkerScope,
  WORKER_DEPLOYMENT_PAYLOAD_KEY,
} from '../agent-handlers/worker-scope.js';
import { captureProcessNextTrigger } from '../agent-handlers/process-next-trigger-capture.js';
import {
  defaultProvider as llmDefaultProvider,
  defaultModel as llmDefaultModel,
} from '../_shared/llm-defaults.js';

const log = createLogger('goal-helpers');

// Optional UUID-backed llm_usage links must never receive runtime IDs from the
// text-keyed `jobs` table (for example `job-abc123`). The mandatory user owner
// is deliberately not normalized to null: an invalid durable owner must make
// PostgreSQL reject the write, never create an ownerless service-role row. The
// original runtime job identifier is retained in metadata below.
const UUID_COLUMN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USAGE_AGENT_TABLES = new Set([
  'agents',
  'agent_blueprints',
  'concilium_agents',
  'concilium_members',
]);

function uuidColumnValue(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return UUID_COLUMN_RE.test(normalized) ? normalized : null;
}

function usagePayloadValues(payload, fields) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  return fields
    .filter((field) => Object.hasOwn(payload, field))
    .map((field) => String(payload[field] ?? '').trim());
}

function usagePayloadBindingMatches(payload, fields, expected) {
  const values = usagePayloadValues(payload, fields);
  if (!values.length) return true;
  const expectedValue = String(expected ?? '').trim();
  return Boolean(expectedValue) && values.every((value) => value === expectedValue);
}

// ── Notification event configs ────────────────────────────────

// Each event config can include an `action` descriptor that the UI
// renders as a button in the NotificationCenter / toast — so user knows
// exactly what to do next instead of just seeing a status change.
// action.type values the UI knows about:
//   - 'view_goal'         (open the specific goal popup)
//   - 'retry_goal'        (call goals?op=retry)
//   - 'approve_proposal'  (open the approval dialog)
//   - 'configure_tools'   (open Agent Hub tools tab)
//   - 'add_budget'        (open goal and prompt to increase budget)
export const NOTIFY_EVENTS = {
  po_validated: { title: 'Request validated', priority: 'low' },
  context_ready: {
    title: 'Customer context ready to confirm',
    priority: 'high',
    action: { type: 'view_goal', label: 'Review context' },
  },
  plan_created: { title: 'Goal plan ready', priority: 'low' },
  awaiting_approval: {
    title: 'Plan ready for approval',
    priority: 'high',
    action: { type: 'approve_proposal', label: 'Review & approve' },
  },
  awaiting_tools: {
    title: 'Tools needed',
    priority: 'high',
    action: { type: 'configure_tools', label: 'Configure tools' },
  },
  phase_started: { title: 'Phase started', priority: 'low' },
  phase_evaluated: { title: 'Phase evaluated', priority: 'low' },
  goal_completed: {
    title: 'Goal completed!',
    priority: 'high',
    action: { type: 'view_goal', label: 'View results' },
  },
  goal_failed: {
    title: 'Goal failed',
    priority: 'high',
    action: { type: 'retry_goal', label: 'Retry' },
  },
  goal_needs_human: {
    title: 'Goal needs your attention',
    priority: 'high',
    action: { type: 'view_goal', label: 'Review' },
  },
  budget_warning: {
    title: 'Goal budget 90% spent',
    priority: 'high',
    action: { type: 'add_budget', label: 'Increase budget' },
  },
  budget_exhausted: {
    title: 'Goal budget exhausted',
    priority: 'high',
    action: { type: 'add_budget', label: 'Increase budget' },
  },
  iteration_started: { title: 'Goal re-planning', priority: 'low' },
  feasibility_done: { title: 'Feasibility analysis complete', priority: 'low' },
  team_approved: { title: 'Team approved by Consilium', priority: 'low' },
  tools_provisioned: { title: 'Tools auto-configured', priority: 'low' },
  proposal_ready: {
    title: 'Proposal ready for review',
    priority: 'high',
    action: { type: 'approve_proposal', label: 'Review & approve' },
  },
  goal_quota_paused: {
    title: 'LLM quota exhausted — goal paused',
    priority: 'high',
    action: { type: 'retry_goal', label: 'Retry after reset' },
  },
};

// ── Tool mappings ─────────────────────────────────────────────

export const CATEGORY_TOOLS = {
  research: ['tool-web-search'],
  content: [],
  outreach: ['tool-email'],
  analysis: ['tool-web-search'],
  development: ['tool-github'],
  design: ['tool-canva'],
  automation: ['tool-browser'],
  general: ['tool-web-search'],
};

export const TOOL_INFO = {
  'tool-web-search': {
    name: 'Web Search',
    description: 'Search the web for real-time information, research, and documentation.',
    connection_type: 'api',
    data: {
      credentials: [
        {
          key: 'TAVILY_API_KEY',
          label: 'Tavily API Key',
          helpUrl: 'https://tavily.com/#api',
          helpText: 'Sign up at tavily.com and copy your API key from the dashboard.',
        },
      ],
    },
  },
  'tool-email': {
    name: 'Email',
    description: 'Send transactional emails and notifications.',
    connection_type: 'api',
    data: {
      credentials: [
        {
          key: 'RESEND_API_KEY',
          label: 'Resend API Key',
          helpUrl: 'https://resend.com/api-keys',
          helpText: 'Create an API key in the Resend dashboard.',
        },
      ],
    },
  },
  'tool-github': {
    name: 'GitHub',
    description: 'Manage repositories, issues, and pull requests.',
    connection_type: 'api',
    data: {
      credentials: [
        {
          key: 'GITHUB_TOKEN',
          label: 'GitHub Personal Access Token',
          helpUrl: 'https://github.com/settings/tokens',
          helpText: 'Generate a fine-grained PAT with repo access.',
        },
      ],
    },
  },
  'tool-canva': {
    name: 'Canva',
    description: 'Generate marketing visuals and brand assets.',
    connection_type: 'api',
    data: {
      credentials: [
        {
          key: 'CANVA_API_KEY',
          label: 'Canva API Key',
          helpUrl: 'https://www.canva.dev/docs/connect/quick-start/',
          helpText: 'Apply for Canva Connect API access.',
        },
      ],
    },
  },
  'tool-browser': {
    name: 'Browser',
    description: 'Automate web browsing, scraping, and form filling.',
    connection_type: 'api',
    data: {
      credentials: [
        {
          key: 'BROWSERLESS_API_KEY',
          label: 'Browserless API Key',
          helpUrl: 'https://www.browserless.io/',
          helpText: 'Sign up at browserless.io for browser automation.',
        },
      ],
    },
  },
  'tool-cloudflare-pages': {
    name: 'Cloudflare Pages',
    description: 'Deploy static HTML sites to Cloudflare Workers.',
    connection_type: 'internal',
    data: {
      credentials: [
        {
          key: 'CLOUDFLARE_API_TOKEN',
          label: 'Cloudflare API Token (server)',
          helpText: 'Configured via server environment variables.',
        },
      ],
    },
  },
  'tool-landing-pages': {
    name: 'Landing Pages',
    description:
      'Publish a landing page: validate HTML, deploy to Cloudflare, record in PageBuilder library.',
    connection_type: 'internal',
    data: {
      credentials: [
        {
          key: 'CLOUDFLARE_API_TOKEN',
          label: 'Cloudflare API Token (server)',
          helpText: 'Configured via server environment variables.',
        },
      ],
    },
  },
  'tool-vision-qa': {
    name: 'Vision QA',
    description:
      'Screenshot a deployed page at 3 breakpoints and compare to the design brief via Claude vision. Returns structured visual failures.',
    connection_type: 'internal',
    data: {
      credentials: [
        {
          key: 'ANTHROPIC_API_KEY',
          label: 'Anthropic API Key (server) + Cloudflare Browser Rendering (server)',
          helpText:
            'Configured via server environment variables — uses the same Cloudflare credentials as the deploy tool.',
        },
      ],
    },
  },
};

// ── Core helpers ──────────────────────────────────────────────

/**
 * Normalize a value that LLMs sometimes return as an array and sometimes as
 * a comma/semicolon-separated string (Qwen and DeepSeek especially). Prevents
 * `.map`/`.join is not a function` crashes on fields like deliverables, jobs,
 * tool_requirements, acceptance_criteria.
 *
 * - Array → primitives preserved; structured criterion objects become readable text
 * - String → split on `,` or `;` → non-empty entries
 * - Object → its semantic text field (test/criterion/description/etc.)
 * - Anything else → []
 */
export function asArray(v) {
  const normalizeItem = (item) => {
    if (typeof item === 'string') return item.trim();
    if (typeof item === 'number' || typeof item === 'boolean') return String(item);
    if (!item || typeof item !== 'object') return '';
    for (const key of [
      'test',
      'criterion',
      'description',
      'requirement',
      'text',
      'title',
      'value',
    ]) {
      const candidate = item[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
      if (typeof candidate === 'number' || typeof candidate === 'boolean') return String(candidate);
    }
    return Object.entries(item)
      .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
      .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${String(value).trim()}`)
      .filter((value) => !value.endsWith(':'))
      .join(' · ');
  };
  if (Array.isArray(v)) return v.map(normalizeItem).filter(Boolean);
  if (typeof v === 'string')
    return v
      .split(/[;,]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  if (v && typeof v === 'object') {
    const normalized = normalizeItem(v);
    return normalized ? [normalized] : [];
  }
  return [];
}

/**
 * Normalize the jobs/sub-objects inside a plan's phases. Qwen often returns
 * phase.jobs as a string — call this right after parsing the LLM response so
 * every downstream reader gets a real array.
 */
export function normalizePlanShape(plan) {
  if (!plan || typeof plan !== 'object') return plan;
  // Qwen/GLM sometimes emit `phases` as an object keyed "0","1","2" instead
  // of an array. Coerce via Object.values so downstream `for (const phase of
  // plan.phases)` still works. Empty/falsy stays empty array.
  if (!Array.isArray(plan.phases)) {
    plan.phases = plan.phases && typeof plan.phases === 'object' ? Object.values(plan.phases) : [];
  }
  for (const phase of plan.phases) {
    if (!phase || typeof phase !== 'object') continue;
    // Same object-keyed-as-array case for phase.jobs. If it's neither an
    // array nor an object (e.g. a stringified summary), use [] so .map
    // never crashes downstream.
    if (!Array.isArray(phase.jobs)) {
      phase.jobs = phase.jobs && typeof phase.jobs === 'object' ? Object.values(phase.jobs) : [];
    }
    phase.deliverables = asArray(phase.deliverables);
    phase.acceptance_criteria = asArray(phase.acceptance_criteria);
    phase.tool_requirements = asArray(phase.tool_requirements);
    for (const job of phase.jobs) {
      if (!job || typeof job !== 'object') continue;
      job.tool_requirements = asArray(job.tool_requirements);
      job.acceptance_criteria = asArray(job.acceptance_criteria);
    }
  }
  return plan;
}

/**
 * Goal-pipeline LLM picker.
 *
 * Normal goals are pinned to the platform pair for every stage so planning,
 * execution preparation, iteration and evaluation cannot silently move to a
 * different vendor when a key is missing or a provider errors. The executor's
 * same-provider HTTP retry remains available; `pinnedProvider` only disables
 * cross-provider failover.
 *
 * Development compare goals retain their explicit provider/model pin.
 */
export function pickTestModel(goal) {
  const t = goal?.data?.test_model;
  if (t?.provider && t?.model) {
    return { provider: t.provider, model: t.model, pinnedProvider: true };
  }
  return {
    provider: llmDefaultProvider(),
    model: llmDefaultModel(),
    pinnedProvider: true,
  };
}

export async function logGoalEvent(
  admin,
  goalId,
  eventType,
  details = {},
  costUsd = 0,
  phaseIndex = null
) {
  try {
    const { error } = await admin.from('goal_log').insert({
      goal_id: goalId,
      event_type: eventType,
      details,
      cost_usd: costUsd,
      phase_index: phaseIndex,
    });
    if (error) log.warn(null, 'goal-log.insert-failed', { error: error.message });
  } catch (err) {
    log.warn(null, 'goal-log.insert-failed', { error: err.message });
  }
}

export async function notifyGoalEvent(admin, goal, eventType, details = {}) {
  const config = NOTIFY_EVENTS[eventType];
  if (!config || !goal.user_id) return;
  try {
    const subject = `${config.title}: ${goal.title.slice(0, 60)}`;
    const body = details.feedback || details.reason || details.strategy || `Event: ${eventType}`;
    // action: if the event has a configured action, bake in the target URL
    // so the frontend doesn't need to rebuild goal URLs. `/goals?id=<uuid>`
    // opens the goal detail dialog on the Goals page.
    const action = config.action
      ? {
          ...config.action,
          target_url:
            config.action.type === 'configure_tools'
              ? '/agent-hub?tab=tools'
              : `/goals?id=${goal.id}`,
        }
      : null;
    const { error } = await admin.from('notification_log').insert({
      user_id: goal.user_id,
      channel: 'in_app',
      event_type: `goal_${eventType}`,
      subject,
      body,
      status: 'sent',
      sent_at: new Date().toISOString(),
      metadata: { goal_id: goal.id, priority: config.priority, action, ...details },
    });
    if (error) log.warn(null, 'goal-notify.failed', { error: error.message });
  } catch (err) {
    log.warn(null, 'goal-notify.failed', { error: err.message });
  }

  // ── Phase 3: also push to connected messengers (Telegram). ──
  // Dynamic import to avoid pulling Telegram code into every call site that
  // already builds the in-app notification but doesn't need outbound HTTP.
  try {
    const { notifyUser } = await import('../utils/notify-user.js');
    const appUrl = process.env.PUBLIC_APP_URL || 'https://orchestratori.vercel.app';
    const icon =
      eventType === 'completed'
        ? '✅'
        : eventType === 'failed'
          ? '❌'
          : eventType === 'paused'
            ? '⏸️'
            : eventType === 'awaiting_user'
              ? '⚠️'
              : eventType === 'self_heal'
                ? '🔧'
                : '🔔';
    await notifyUser(admin, goal.user_id, `goal.${eventType}`, {
      title: `${icon} ${config.title}: ${goal.title.slice(0, 60)}`,
      body: details.feedback || details.reason || details.strategy || '',
      deepLink: `${appUrl}/goals?id=${goal.id}`,
      buttons: [
        { text: 'View goal', url: `${appUrl}/goals?id=${goal.id}` },
        ...(eventType === 'completed' || eventType === 'failed'
          ? []
          : [{ text: 'Cancel', callback_data: `goal:cancel:${goal.id}` }]),
        { text: 'Dismiss', callback_data: 'digest:dismiss' },
      ],
    });
  } catch (err) {
    // Don't let push failure break the in-app flow.
    log.warn(null, 'goal-notify.push.failed', { error: err.message, eventType });
  }
}

export async function updateGoal(admin, goalId, updates) {
  const { error } = await admin
    .from('goals')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', goalId);
  if (error) {
    log.warn(null, 'goal.update-failed', {
      goalId,
      keys: Object.keys(updates),
      error: error.message,
    });
    throw new Error(`Goal update failed: ${error.message}`);
  }
}

/**
 * Compare-and-set a goal transition. Async approval jobs can be delivered
 * after another request cancelled or paused the goal; filtering by the status
 * observed by the worker prevents a stale job from reviving that goal.
 *
 * Returns false when the row no longer has the expected status.
 */
export async function updateGoalIfStatus(admin, goalId, expectedStatus, updates) {
  const { data, error } = await admin
    .from('goals')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', goalId)
    .eq('status', expectedStatus)
    .select('id')
    .maybeSingle();
  if (error) {
    log.warn(null, 'goal.conditional-update-failed', {
      goalId,
      expectedStatus,
      keys: Object.keys(updates),
      error: error.message,
    });
    throw new Error(`Goal conditional update failed: ${error.message}`);
  }
  return Boolean(data?.id);
}

/** Compare-and-set a full goal snapshot when status alone is not exclusive. */
export async function updateGoalIfSnapshot(admin, goal, updates) {
  if (!goal?.id || !goal.status || !goal.updated_at || !goal.user_id) return false;
  const { data, error } = await admin
    .from('goals')
    .update({
      ...updates,
      updated_at: updates?.updated_at || new Date().toISOString(),
    })
    .eq('id', goal.id)
    .eq('user_id', goal.user_id)
    .eq('status', goal.status)
    .eq('updated_at', goal.updated_at)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Goal snapshot update failed: ${error.message}`);
  return Boolean(data?.id);
}

/** Reserve exactly one team-formation worker, including same-status retries. */
export async function reserveGoalTeamFormationAttempt(admin, goal, attempt, updates) {
  if (!goal?.id || !goal.status || !goal.updated_at || !goal.user_id || !attempt?.attempt_id) {
    return false;
  }
  const { data, error } = await admin
    .from('goals')
    .update({
      ...updates,
      updated_at: updates?.updated_at || new Date().toISOString(),
    })
    .eq('id', goal.id)
    .eq('user_id', goal.user_id)
    .eq('status', goal.status)
    .eq('updated_at', goal.updated_at)
    .select('id')
    .maybeSingle();
  if (error) {
    throw new Error(`Team formation reservation failed: ${error.message}`);
  }
  return Boolean(data?.id);
}

/** Persist a legacy or native team-formation outcome only for its owner. */
export async function updateGoalIfTeamFormationAttempt(
  admin,
  goalId,
  expectedStatus,
  attemptId,
  updates
) {
  if (!goalId || !expectedStatus || !attemptId) return false;
  const { data, error } = await admin
    .from('goals')
    .update({
      ...updates,
      updated_at: updates?.updated_at || new Date().toISOString(),
    })
    .eq('id', goalId)
    .eq('status', expectedStatus)
    .eq('data->team_formation_attempt->>attempt_id', attemptId)
    .select('id')
    .maybeSingle();
  if (error) {
    throw new Error(`Team formation conditional update failed: ${error.message}`);
  }
  return Boolean(data?.id);
}

/** Acquire tool provisioning only from the exact completed team handoff. */
export async function reserveGoalToolProvisioningAttempt(admin, goal, teamAttemptId, updates) {
  if (
    !goal?.id ||
    !goal.user_id ||
    goal.status !== 'provisioning_tools' ||
    !goal.updated_at ||
    !teamAttemptId ||
    !updates?.data?.tool_provisioning_attempt?.attempt_id
  ) {
    return false;
  }
  const { data, error } = await admin
    .from('goals')
    .update({
      ...updates,
      updated_at: updates.updated_at || new Date().toISOString(),
    })
    .eq('id', goal.id)
    .eq('user_id', goal.user_id)
    .eq('status', 'provisioning_tools')
    .eq('updated_at', goal.updated_at)
    .eq('data->team_formation_attempt->>version', 'orqaly_team_formation_attempt_v1')
    .eq('data->team_formation_attempt->>attempt_id', teamAttemptId)
    .eq('data->team_formation_attempt->>status', 'completed')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Tool provisioning reservation failed: ${error.message}`);
  return Boolean(data?.id);
}

/** Persist only the exact tool-provisioning snapshot that still owns the row. */
export async function updateGoalIfToolProvisioningAttempt(admin, goal, attemptId, updates) {
  const teamAttemptId = goal?.data?.team_formation_attempt?.attempt_id;
  if (
    !goal?.id ||
    !goal.user_id ||
    goal.status !== 'provisioning_tools' ||
    !goal.updated_at ||
    !teamAttemptId ||
    !attemptId
  ) {
    return false;
  }
  const { data, error } = await admin
    .from('goals')
    .update({
      ...updates,
      updated_at: updates?.updated_at || new Date().toISOString(),
    })
    .eq('id', goal.id)
    .eq('user_id', goal.user_id)
    .eq('status', 'provisioning_tools')
    .eq('updated_at', goal.updated_at)
    .eq('data->team_formation_attempt->>version', 'orqaly_team_formation_attempt_v1')
    .eq('data->team_formation_attempt->>attempt_id', teamAttemptId)
    .eq('data->team_formation_attempt->>status', 'completed')
    .eq('data->tool_provisioning_attempt->>version', 'orqaly_tool_provisioning_attempt_v1')
    .eq('data->tool_provisioning_attempt->>attempt_id', attemptId)
    .eq('data->tool_provisioning_attempt->>status', 'running')
    .eq('data->tool_provisioning_attempt->>team_formation_attempt_id', teamAttemptId)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Tool provisioning conditional update failed: ${error.message}`);
  return Boolean(data?.id);
}

/** Acquire estimation only from the exact completed tool-provisioning handoff. */
export async function reserveGoalDiscoveryEstimationAttempt(admin, goal, toolAttemptId, updates) {
  if (
    !goal?.id ||
    !goal.user_id ||
    goal.status !== 'estimating' ||
    !goal.updated_at ||
    !toolAttemptId ||
    !updates?.data?.discovery_estimation_attempt?.attempt_id
  ) {
    return false;
  }
  const { data, error } = await admin
    .from('goals')
    .update({
      ...updates,
      updated_at: updates.updated_at || new Date().toISOString(),
    })
    .eq('id', goal.id)
    .eq('user_id', goal.user_id)
    .eq('status', 'estimating')
    .eq('updated_at', goal.updated_at)
    .eq('data->tool_provisioning_attempt->>version', 'orqaly_tool_provisioning_attempt_v1')
    .eq('data->tool_provisioning_attempt->>attempt_id', toolAttemptId)
    .eq('data->tool_provisioning_attempt->>status', 'completed')
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Discovery estimation reservation failed: ${error.message}`);
  return Boolean(data?.id);
}

/** Persist only the exact discovery-estimation snapshot that still owns the row. */
export async function updateGoalIfDiscoveryEstimationAttempt(admin, goal, attemptId, updates) {
  const teamAttemptId = goal?.data?.team_formation_attempt?.attempt_id;
  const toolAttemptId = goal?.data?.tool_provisioning_attempt?.attempt_id;
  if (
    !goal?.id ||
    !goal.user_id ||
    goal.status !== 'estimating' ||
    !goal.updated_at ||
    !teamAttemptId ||
    !toolAttemptId ||
    !attemptId
  ) {
    return false;
  }
  const { data, error } = await admin
    .from('goals')
    .update({
      ...updates,
      updated_at: updates?.updated_at || new Date().toISOString(),
    })
    .eq('id', goal.id)
    .eq('user_id', goal.user_id)
    .eq('status', 'estimating')
    .eq('updated_at', goal.updated_at)
    .eq('data->team_formation_attempt->>version', 'orqaly_team_formation_attempt_v1')
    .eq('data->team_formation_attempt->>attempt_id', teamAttemptId)
    .eq('data->team_formation_attempt->>status', 'completed')
    .eq('data->tool_provisioning_attempt->>version', 'orqaly_tool_provisioning_attempt_v1')
    .eq('data->tool_provisioning_attempt->>attempt_id', toolAttemptId)
    .eq('data->tool_provisioning_attempt->>status', 'completed')
    .eq('data->tool_provisioning_attempt->>team_formation_attempt_id', teamAttemptId)
    .eq('data->discovery_estimation_attempt->>version', 'orqaly_discovery_estimation_attempt_v1')
    .eq('data->discovery_estimation_attempt->>attempt_id', attemptId)
    .eq('data->discovery_estimation_attempt->>status', 'running')
    .eq('data->discovery_estimation_attempt->>team_formation_attempt_id', teamAttemptId)
    .eq('data->discovery_estimation_attempt->>tool_provisioning_attempt_id', toolAttemptId)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Discovery estimation conditional update failed: ${error.message}`);
  return Boolean(data?.id);
}

/**
 * Compare-and-set a native Gate-1 transition against the exact AxWise scope
 * generation that the owner reviewed. The worker performs this predicate in
 * the same database statement as the lifecycle update, closing the race where
 * a newer scope could arrive after the queued job's read but before its write.
 */
export async function updateGoalIfNativeScopeBinding(
  admin,
  goalId,
  expectedStatus,
  binding,
  updates
) {
  if (
    binding?.version !== 'orqaly_native_scope_action_binding_v1' ||
    !binding.org_id ||
    !binding.user_id ||
    !binding.scope_hash ||
    !binding.research_contract_hash ||
    !binding.research_execution_inputs_hash ||
    !binding.scope_updated_at ||
    !binding.context_snapshot_hash
  ) {
    return false;
  }
  const planningAuthority = binding.planning_authority || null;
  if (
    planningAuthority &&
    (planningAuthority.context_status !== 'approved' ||
      planningAuthority.scope_admission_status !== 'accepted' ||
      !planningAuthority.scope_hash ||
      !planningAuthority.playbook_id ||
      !planningAuthority.route_version)
  ) {
    return false;
  }

  let transition = admin
    .from('goals')
    .update({
      ...updates,
      updated_at: updates?.updated_at || new Date().toISOString(),
    })
    .eq('id', goalId)
    .eq('user_id', binding.user_id)
    .eq('org_id', binding.org_id)
    .eq('status', expectedStatus)
    .eq('data->axwise_customer_intelligence->scope_packet->>scope_hash', binding.scope_hash)
    .eq(
      'data->axwise_customer_intelligence->scope_packet->research_contract->>contract_hash',
      binding.research_contract_hash
    )
    .eq(
      'data->axwise_customer_intelligence->>research_execution_inputs_hash',
      binding.research_execution_inputs_hash
    )
    .eq('data->axwise_customer_intelligence->>updated_at', binding.scope_updated_at)
    .eq('data->goal_approvals->context->>snapshot_hash', binding.context_snapshot_hash);
  if (planningAuthority) {
    transition = transition
      .eq('data->goal_approvals->context->>status', planningAuthority.context_status)
      .eq('data->scope_admission->>status', planningAuthority.scope_admission_status)
      .eq('data->scope_admission->>scope_hash', planningAuthority.scope_hash)
      .eq('data->scope_admission->>playbook_id', planningAuthority.playbook_id)
      .eq('data->scope_admission->>route_version', planningAuthority.route_version)
      .eq('data->work_shape_route->>scope_hash', planningAuthority.scope_hash)
      .eq('data->work_shape_route->>playbook_id', planningAuthority.playbook_id)
      .eq('data->work_shape_route->>version', planningAuthority.route_version);
  }
  if (binding.goal_updated_at) {
    transition = transition.eq('updated_at', binding.goal_updated_at);
  }
  if (binding.planning_attempt_id) {
    transition = transition.eq(
      'data->native_planning_attempt->>attempt_id',
      binding.planning_attempt_id
    );
  }
  if (binding.planning_attempt_status) {
    transition = transition.eq(
      'data->native_planning_attempt->>status',
      binding.planning_attempt_status
    );
  }
  if (binding.planning_plan_hash) {
    transition = transition.eq(
      'data->native_planning_attempt->>plan_hash',
      binding.planning_plan_hash
    );
  }
  if (binding.team_formation_attempt_id) {
    transition = transition.eq(
      'data->team_formation_attempt->>attempt_id',
      binding.team_formation_attempt_id
    );
  }
  if (binding.tool_provisioning_attempt_id) {
    transition = transition.eq(
      'data->tool_provisioning_attempt->>attempt_id',
      binding.tool_provisioning_attempt_id
    );
  }
  if (binding.discovery_estimation_attempt_id) {
    transition = transition.eq(
      'data->discovery_estimation_attempt->>attempt_id',
      binding.discovery_estimation_attempt_id
    );
  }
  transition =
    binding.generation === null || binding.generation === undefined || binding.generation === ''
      ? transition.is('data->axwise_customer_intelligence->>generation', null)
      : transition.eq(
          'data->axwise_customer_intelligence->>generation',
          String(binding.generation)
        );

  const { data, error } = await transition.select('id').maybeSingle();
  if (error) {
    log.warn(null, 'goal.native-scope-conditional-update-failed', {
      goalId,
      expectedStatus,
      scopeHash: binding.scope_hash,
      generation: binding.generation ?? null,
      keys: Object.keys(updates),
      error: error.message,
    });
    throw new Error(`Native scope conditional update failed: ${error.message}`);
  }
  return Boolean(data?.id);
}

/**
 * Reserve one exact Gate-2 approval attempt. A same-status proposal refresh is
 * observable only through updated_at/snapshot changes, so status-only CAS is
 * insufficient here. Native goals additionally bind the accepted scope tuple.
 */
export async function reserveGoalExecutionApproval(
  admin,
  goal,
  { snapshotHash, attemptToken, startedAt, nativeBinding = null }
) {
  if (!goal?.id || !goal.updated_at || !snapshotHash || !attemptToken || !startedAt) return false;
  const planningAuthority = nativeBinding?.planning_authority || null;
  if (
    nativeBinding &&
    (nativeBinding.version !== 'orqaly_native_scope_action_binding_v1' ||
      nativeBinding.goal_updated_at !== goal.updated_at ||
      !nativeBinding.org_id ||
      !nativeBinding.user_id ||
      String(nativeBinding.org_id) !== String(goal.org_id || '') ||
      String(nativeBinding.user_id) !== String(goal.user_id || '') ||
      !nativeBinding.scope_hash ||
      !nativeBinding.research_contract_hash ||
      !nativeBinding.research_execution_inputs_hash ||
      !nativeBinding.scope_updated_at ||
      !nativeBinding.context_snapshot_hash ||
      planningAuthority?.context_status !== 'approved' ||
      planningAuthority?.scope_admission_status !== 'accepted' ||
      !planningAuthority?.scope_hash ||
      !planningAuthority?.playbook_id ||
      !planningAuthority?.route_version)
  ) {
    return false;
  }

  let transition = admin
    .from('goals')
    .update({
      status: 'authorizing_execution',
      data: {
        ...(goal.data || {}),
        execution_approval_attempt: {
          version: 'orqaly_execution_approval_attempt_v1',
          attempt_token: attemptToken,
          snapshot_hash: snapshotHash,
          source_goal_updated_at: goal.updated_at,
          started_at: startedAt,
        },
      },
      updated_at: startedAt,
    })
    .eq('id', goal.id)
    .eq('status', 'awaiting_approval')
    .eq('updated_at', goal.updated_at)
    .eq('data->goal_approvals->execution->>status', 'pending')
    .eq('data->goal_approvals->execution->>snapshot_hash', snapshotHash);
  if (nativeBinding) {
    transition = transition
      .eq('user_id', nativeBinding.user_id)
      .eq('org_id', nativeBinding.org_id)
      .eq('data->axwise_customer_intelligence->scope_packet->>scope_hash', nativeBinding.scope_hash)
      .eq(
        'data->axwise_customer_intelligence->scope_packet->research_contract->>contract_hash',
        nativeBinding.research_contract_hash
      )
      .eq(
        'data->axwise_customer_intelligence->>research_execution_inputs_hash',
        nativeBinding.research_execution_inputs_hash
      )
      .eq('data->axwise_customer_intelligence->>updated_at', nativeBinding.scope_updated_at)
      .eq('data->goal_approvals->context->>snapshot_hash', nativeBinding.context_snapshot_hash)
      .eq('data->goal_approvals->context->>status', planningAuthority.context_status)
      .eq('data->scope_admission->>status', planningAuthority.scope_admission_status)
      .eq('data->scope_admission->>scope_hash', planningAuthority.scope_hash)
      .eq('data->scope_admission->>playbook_id', planningAuthority.playbook_id)
      .eq('data->scope_admission->>route_version', planningAuthority.route_version)
      .eq('data->work_shape_route->>scope_hash', planningAuthority.scope_hash)
      .eq('data->work_shape_route->>playbook_id', planningAuthority.playbook_id)
      .eq('data->work_shape_route->>version', planningAuthority.route_version);
    transition =
      nativeBinding.generation === null ||
      nativeBinding.generation === undefined ||
      nativeBinding.generation === ''
        ? transition.is('data->axwise_customer_intelligence->>generation', null)
        : transition.eq(
            'data->axwise_customer_intelligence->>generation',
            String(nativeBinding.generation)
          );
  }

  const { data, error } = await transition.select('id').maybeSingle();
  if (error) throw new Error(`Execution approval reservation failed: ${error.message}`);
  return Boolean(data?.id);
}

/** Complete or compensate only the Gate-2 reservation owned by this attempt. */
export async function finishGoalExecutionApprovalAttempt(
  admin,
  goalId,
  { attemptToken, snapshotHash, updates }
) {
  if (!goalId || !attemptToken || !snapshotHash) return false;
  const { data, error } = await admin
    .from('goals')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', goalId)
    .eq('status', 'authorizing_execution')
    .eq('data->execution_approval_attempt->>attempt_token', attemptToken)
    .eq('data->execution_approval_attempt->>snapshot_hash', snapshotHash)
    .eq('data->goal_approvals->execution->>snapshot_hash', snapshotHash)
    .select('id')
    .maybeSingle();
  if (error) throw new Error(`Execution approval completion failed: ${error.message}`);
  return Boolean(data?.id);
}

/**
 * Restore a native scope revision only if the exact revision generation still
 * owns the row. This is the compensation boundary for a child-enqueue failure;
 * a newer correction must never be overwritten by an older worker rollback.
 */
export async function restoreGoalIfScopeRevision(
  admin,
  goalId,
  expectedStatus,
  revisionToken,
  updates,
  expectedIntelligenceStatus = 'revision_requested'
) {
  if (!revisionToken || !expectedIntelligenceStatus) return false;
  const { data, error } = await admin
    .from('goals')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', goalId)
    .eq('status', expectedStatus)
    .eq('data->scope_revision->>revision_token', revisionToken)
    .eq('data->axwise_customer_intelligence->>status', expectedIntelligenceStatus)
    .select('id')
    .maybeSingle();
  if (error) {
    log.warn(null, 'goal.scope-revision-restore-failed', {
      goalId,
      expectedStatus,
      error: error.message,
    });
    return false;
  }
  return Boolean(data?.id);
}

/**
 * Atomically persist post-approval enrichment data only while the goal is
 * still active and both copies of the signed execution-approval hash still
 * match the hash observed immediately before the external work completed.
 *
 * The hash predicates prevent an ABA race where a goal is sent back through
 * review and becomes active again with a different approval while a slow
 * fetch or LLM call from the previous approval is still in flight.
 */
export async function updateGoalIfExecutionAuthorized(
  admin,
  goalId,
  expectedSnapshotHash,
  updates
) {
  if (!expectedSnapshotHash) return false;

  const { data, error } = await admin
    .from('goals')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', goalId)
    .eq('status', 'active')
    .eq('data->execution_authorization->>snapshot_hash', expectedSnapshotHash)
    .eq('data->goal_approvals->execution->>snapshot_hash', expectedSnapshotHash)
    .select('id')
    .maybeSingle();
  if (error) {
    log.warn(null, 'goal.execution-authorized-update-failed', {
      goalId,
      keys: Object.keys(updates),
      error: error.message,
    });
    throw new Error(`Goal execution-authorized update failed: ${error.message}`);
  }
  return Boolean(data?.id);
}

export async function loadGoal(admin, goalId, userId = null) {
  let query = admin.from('goals').select('*').eq('id', goalId);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query.single();
  if (error) throw new Error(`Goal not found: ${goalId}`);
  return data;
}

const AGENT_JOB_OWNER_FIELDS = ['_userId', 'userId', 'user_id'];

function resolveEnqueueOwner(job) {
  const candidates = [];
  if (Object.hasOwn(job || {}, 'user_id')) {
    candidates.push(['user_id', job.user_id]);
  }
  for (const field of AGENT_JOB_OWNER_FIELDS) {
    if (Object.hasOwn(job?.payload || {}, field)) {
      candidates.push([`payload.${field}`, job.payload[field]]);
    }
  }
  if (candidates.length === 0) {
    const error = new Error('AGENT_JOB_OWNER_VALIDATION_ERROR: durable owner is required');
    error.code = 'AGENT_JOB_OWNER_VALIDATION_ERROR';
    throw error;
  }
  const normalized = candidates.map(([field, value]) => [
    field,
    typeof value === 'string' ? value.trim() : '',
  ]);
  const owner = normalized[0][1];
  if (!owner) {
    const error = new Error(
      `AGENT_JOB_OWNER_VALIDATION_ERROR: ${normalized[0][0]} must be nonblank`
    );
    error.code = 'AGENT_JOB_OWNER_VALIDATION_ERROR';
    throw error;
  }
  const mismatch = normalized.find(([, value]) => value !== owner);
  if (mismatch) {
    const error = new Error(
      `AGENT_JOB_OWNER_VALIDATION_ERROR: ${mismatch[0]} disagrees with durable owner`
    );
    error.code = 'AGENT_JOB_OWNER_VALIDATION_ERROR';
    throw error;
  }
  return owner;
}

export async function enqueueAgentJob(
  admin,
  job,
  {
    triggerProcessNextImpl = triggerProcessNext,
    wake = true,
    idempotent = false,
    env = process.env,
  } = {}
) {
  const workerScope = resolveWorkerScope(env);
  const deploymentIdentity = resolveWorkerDeploymentIdentity(env);
  if (workerScope === 'preview' && !deploymentIdentity) {
    throw new Error('Unable to enqueue Preview agent job: deployment identity is unavailable');
  }

  const owner = resolveEnqueueOwner(job);
  const payload = bindJobPayloadToWorkerDeployment(
    {
      ...(job?.payload || {}),
      _userId: owner,
      userId: owner,
      user_id: owner,
    },
    env
  );
  const requestedId = job?.id || crypto.randomUUID();
  // Deterministic IDs are global primary keys. Namespace a Preview
  // idempotency key by the immutable deployment binding so two deployments
  // cannot collapse onto one row, wake it, and then leave one deployment's
  // continuation missing. Local workers share the database with Production,
  // so they get a separate stable namespace too. Production retains its
  // existing key shape for rollout compatibility.
  const id =
    idempotent && job?.id && payload[WORKER_DEPLOYMENT_PAYLOAD_KEY]
      ? deterministicAgentJobId('preview-deployment-agent-job', {
          id: requestedId,
          deployment: payload[WORKER_DEPLOYMENT_PAYLOAD_KEY],
        })
      : idempotent && job?.id && workerScope === 'local'
        ? deterministicAgentJobId('local-agent-job', { id: requestedId })
        : requestedId;
  const inserted = {
    ...job,
    user_id: owner,
    payload,
    id,
    status: 'queued',
    // Carry the partition in the row as well as the trusted Supabase header.
    // This keeps chained preview/local work in the originating runtime even
    // when an intermediate PostgREST request drops custom request headers.
    worker_scope: workerScope,
  };
  const agentJobs = admin.from('agent_jobs');
  const usedUpsert = idempotent && typeof agentJobs.upsert === 'function';
  let writeResult;
  let thrownWriteError = null;
  try {
    writeResult = usedUpsert
      ? await agentJobs.upsert(inserted, { onConflict: 'id', ignoreDuplicates: true })
      : await agentJobs.insert(inserted);
  } catch (writeError) {
    thrownWriteError = writeError;
  }

  const returnedWriteError = writeResult?.error || null;
  if (thrownWriteError || returnedWriteError) {
    // PostgREST can report a response-loss ambiguity either by rejecting or by
    // resolving `{ error }` after PostgreSQL committed. The pre-generated id
    // makes both forms safe to resolve without creating a duplicate row.
    const inspection = await inspectExactAgentJob(admin, inserted);
    if (inspection.state !== 'present') {
      if (thrownWriteError) throw thrownWriteError;
      const enqueueError = new Error(`Unable to enqueue agent job: ${returnedWriteError.message}`);
      enqueueError.code = returnedWriteError.code;
      enqueueError.cause = returnedWriteError;
      throw enqueueError;
    }
    writeResult = { error: null };
  }

  let snapshot = inserted;
  if (usedUpsert) {
    const inspection = await inspectExactAgentJob(admin, inserted);
    if (inspection.state === 'conflict') {
      throw new Error('Unable to enqueue agent job: deterministic id belongs to different work');
    }
    if (inspection.state !== 'present') {
      const verificationError = new Error(
        `Unable to enqueue agent job: deterministic write could not be verified (${inspection.state})`
      );
      verificationError.code = 'AGENT_JOB_INSERT_UNVERIFIED';
      throw verificationError;
    }
    snapshot = inspection.job;
  }

  if (snapshot.status === 'failed' || snapshot.status === 'cancelled') {
    const terminalError = new Error(
      `Unable to enqueue agent job: exact id is already ${snapshot.status}`
    );
    terminalError.code = 'AGENT_JOB_TERMINAL';
    throw terminalError;
  }

  if (wake && snapshot.status === 'queued') {
    await wakeAgentJobExact(admin, snapshot, { triggerProcessNextImpl, env });
  }
  return snapshot;
}

async function inspectExactAgentJob(admin, expected) {
  try {
    const query = admin.from('agent_jobs');
    if (typeof query?.select !== 'function') return { state: 'unknown' };
    const { data: job, error } = await query
      .select('id, user_id, status, worker_scope, payload')
      .eq('id', expected.id)
      .maybeSingle();
    if (error) return { state: 'unknown', error };
    if (!job) return { state: 'absent' };
    const matches =
      job.id === expected.id &&
      job.user_id === expected.user_id &&
      job.worker_scope === expected.worker_scope &&
      canonicalJson(job.payload || {}) === canonicalJson(expected.payload || {});
    return matches ? { state: 'present', job } : { state: 'conflict', job };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

function canonicalJson(value) {
  return JSON.stringify(canonicalizeJson(value));
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (!value || typeof value !== 'object') return value;
  const ordered = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) ordered[key] = canonicalizeJson(value[key]);
  }
  return ordered;
}

/**
 * Wake one durable row by its pre-generated primary key. Preview has no cron
 * fallback, so a wake that cannot even be dispatched must turn the exact row
 * terminal and reject the producer instead of returning a misleading success.
 * Production and local keep their durable polling fallback.
 */
export async function wakeAgentJobExact(
  admin,
  job,
  { triggerProcessNextImpl = triggerProcessNext, env = process.env } = {}
) {
  const jobId = typeof job?.id === 'string' ? job.id.trim() : '';
  if (!jobId) throw new Error('Unable to wake agent job: exact job id is required');

  const workerScope = resolveWorkerScope(env);
  let triggered;
  let wakeError = null;
  try {
    const triggerArgs = env === process.env ? { jobId } : { jobId, env };
    triggered = await triggerProcessNextImpl(triggerArgs);
  } catch (error) {
    wakeError = error;
    triggered = false;
  }

  // Production/local retain durable polling fallbacks. Preview has none, so
  // only an explicit positive dispatch acknowledgement is safe to accept.
  if (workerScope !== 'preview' || triggered === true) {
    if (wakeError && workerScope !== 'preview') {
      log.warn(null, 'process-next.exact-wake-failed-durable-fallback', {
        jobId,
        error: wakeError.message,
      });
    }
    return { jobId, triggered: workerScope === 'preview' ? true : triggered !== false };
  }

  const deploymentIdentity = resolveWorkerDeploymentIdentity(env);
  try {
    let terminalize = admin
      .from('agent_jobs')
      .update({
        status: 'failed',
        error: 'Preview exact worker wake was unavailable',
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
      .eq('status', 'queued')
      .eq('worker_scope', 'preview');
    if (deploymentIdentity) {
      terminalize = terminalize.eq(
        `payload->>${WORKER_DEPLOYMENT_PAYLOAD_KEY}`,
        deploymentIdentity
      );
    }
    const { data: terminalized, error: terminalizeError } = await terminalize
      .select('id, status')
      .maybeSingle();
    if (terminalizeError || terminalized?.id !== jobId || terminalized?.status !== 'failed') {
      log.error(null, 'process-next.preview-unwoken-terminalize-unverified', {
        jobId,
        error: terminalizeError?.message || null,
      });
    }
  } catch (terminalizeError) {
    log.error(null, 'process-next.preview-unwoken-terminalize-failed', {
      jobId,
      error: terminalizeError.message,
    });
  }

  const error = new Error(
    wakeError
      ? `Unable to wake Preview agent job: ${wakeError.message}`
      : 'Unable to wake Preview agent job: exact worker trigger is unavailable'
  );
  error.code = 'PREVIEW_EXACT_WAKE_UNAVAILABLE';
  throw error;
}

/**
 * Derive a UUID-shaped primary key from a stable internal identity. Callers can
 * combine this with enqueueAgentJob({ id }, { idempotent: true }) to collapse
 * concurrent producers through agent_jobs' existing primary-key constraint.
 */
export function deterministicAgentJobId(namespace, identity) {
  const digest = crypto
    .createHash('sha256')
    .update(`${String(namespace || 'agent-job')}:${JSON.stringify(identity)}`)
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  // RFC 9562 UUIDv5/variant bits make the database identity recognizable as a
  // name-derived UUID while retaining 122 bits of the SHA-256 digest.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function enqueueGoalAction(
  admin,
  action,
  goalId,
  extra = {},
  { triggerProcessNextImpl = triggerProcessNext } = {}
) {
  const { data: goal, error: goalError } = await admin
    .from('goals')
    .select('id, user_id')
    .eq('id', goalId)
    .maybeSingle();
  const owner = typeof goal?.user_id === 'string' ? goal.user_id.trim() : '';
  if (goalError || !goal || goal.id !== goalId || !owner) {
    const error = new Error(
      `AGENT_JOB_OWNER_VALIDATION_ERROR: goal ${goalId} has no durable owner`
    );
    error.code = 'AGENT_JOB_OWNER_VALIDATION_ERROR';
    error.cause = goalError || undefined;
    throw error;
  }
  // Wake the row created by this transition. Preview deployments share one
  // queue partition, so an untargeted wake could otherwise claim another goal
  // while this goal remained stalled. A targeted Preview handler captures the
  // exact child ID and drains only that causal same-goal continuation.
  return enqueueAgentJob(
    admin,
    {
      user_id: owner,
      payload: { ...extra, type: 'orchestrate-goal', action, goalId },
    },
    { triggerProcessNextImpl }
  );
}

/**
 * Wake the worker through this Vercel deployment's own API. Production Cron
 * and the local poller remain durable fallbacks. Preview has no Cron, so
 * enqueueAgentJob treats an undispatchable exact wake as a producer failure.
 *
 * WORKER_SECRET is deliberately read only in this server module and is sent
 * only to VERCEL_URL. It is never returned to the browser or forwarded through
 * QStash. Protected Preview deployments also forward Vercel's short-lived OIDC
 * token so the project's Trusted Sources rule can admit the self-wake without a
 * long-lived protection-bypass secret. A false return tells the shared producer
 * whether it must reject and terminalize an unwoken Preview row.
 */
export function triggerProcessNext({
  env = process.env,
  fetchImpl = globalThis.fetch,
  setTimeoutImpl = globalThis.setTimeout,
  waitUntilImpl = waitUntil,
  getOidcToken = getVercelOidcToken,
  jobId = null,
} = {}) {
  const targetJobId = typeof jobId === 'string' ? jobId.trim() : '';
  if (targetJobId && captureProcessNextTrigger(targetJobId)) return true;

  const workerSecret = env.WORKER_SECRET;
  const deploymentHost = String(env.VERCEL_URL || '').trim();

  if (!workerSecret || !deploymentHost || typeof fetchImpl !== 'function') {
    log.warn(null, 'process-next.trigger.skipped', {
      reason: !workerSecret
        ? 'worker-secret-not-configured'
        : !deploymentHost
          ? 'self-origin-not-configured'
          : 'fetch-unavailable',
    });
    return false;
  }

  let url;
  try {
    const deploymentUrl = new URL(
      deploymentHost.includes('://') ? deploymentHost : `https://${deploymentHost}`
    );
    if (deploymentUrl.protocol !== 'https:' || deploymentUrl.username || deploymentUrl.password) {
      throw new Error('Unsafe self origin');
    }
    const workerUrl = new URL('/api/agent', deploymentUrl.origin);
    workerUrl.searchParams.set('path', 'process-next');
    if (targetJobId) {
      workerUrl.searchParams.set('job_id', targetJobId);
      if (resolveWorkerScope(env) === 'preview') workerUrl.searchParams.set('dispatch', '1');
    }
    url = workerUrl.toString();
  } catch {
    log.warn(null, 'process-next.trigger.skipped', { reason: 'invalid-self-origin' });
    return false;
  }

  const resolveProtectionHeaders = async () => {
    if (!env.VERCEL) return {};
    try {
      const oidcToken = await getOidcToken();
      if (oidcToken) return { 'x-vercel-trusted-oidc-idp-token': oidcToken };
    } catch (error) {
      log.warn(null, 'process-next.trigger.oidc-unavailable', {
        error: String(error?.message || error).slice(0, 300),
      });
    }
    return env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? { 'x-vercel-protection-bypass': env.VERCEL_AUTOMATION_BYPASS_SECRET }
      : {};
  };

  const send = async (protectionHeaders = {}) => {
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        // Never follow Deployment Protection's login redirect. Besides making a
        // blocked wake visible in logs, this guarantees the worker bearer and
        // edge credential cannot be forwarded to another origin.
        redirect: 'manual',
        headers: {
          Authorization: `Bearer ${workerSecret}`,
          ...protectionHeaders,
        },
      });
      if (!response?.ok) {
        log.warn(null, 'process-next.trigger.rejected', {
          status: Number(response?.status || 0),
          redirected: response?.redirected === true,
        });
      }
      return response;
    } catch (error) {
      // The enclosing sequence retries once. Production Cron/local polling are
      // additional fallbacks; Preview producers already required dispatch to
      // be registered before they acknowledged the row.
      log.warn(null, 'process-next.trigger.failed', {
        error: String(error?.message || error).slice(0, 300),
      });
      return null;
    }
  };

  // Exact Preview dispatch is part of the producer's correctness boundary:
  // there is no Preview Cron to recover a row after the request freezes. The
  // producer awaits this bounded request sequence directly, so it remains in
  // the invocation lifecycle without starting work before a waitUntil
  // registration. The receiving process-next route owns background
  // registration and acknowledges only after its exact lease is committed.
  if (targetJobId && resolveWorkerScope(env) === 'preview') {
    const wakeSequence = (async () => {
      try {
        const protectionHeaders = await resolveProtectionHeaders();
        const first = await send(protectionHeaders);
        if (first?.ok) return true;
        await new Promise((resolve) => setTimeoutImpl(resolve, 3000));
        const second = await send(protectionHeaders);
        return second?.ok === true;
      } catch (error) {
        log.warn(null, 'process-next.trigger.confirmation-failed', {
          jobId: targetJobId,
          error: String(error?.message || error).slice(0, 300),
        });
        return false;
      }
    })();
    return wakeSequence;
  }

  // Vercel freezes a Function after its response when an asynchronous task is
  // not awaited or registered as background work. Keep both self-wake attempts
  // alive for the request lifecycle so Preview deployments do not silently
  // leave approval and pipeline jobs queued for the Production cron consumer.
  if (env.VERCEL && typeof waitUntilImpl === 'function') {
    const wakeSequence = (async () => {
      // Resolve the short-lived identity while this request's Vercel context is
      // still active, then reuse it for the bounded retry three seconds later.
      const protectionHeaders = await resolveProtectionHeaders();
      await send(protectionHeaders);
      await new Promise((resolve) => setTimeoutImpl(resolve, 3000));
      await send(protectionHeaders);
    })();
    try {
      waitUntilImpl(wakeSequence);
    } catch (error) {
      log.warn(null, 'process-next.trigger.background-registration-failed', {
        error: String(error?.message || error).slice(0, 300),
      });
      return false;
    }
    return true;
  }

  if (env.VERCEL) {
    const wakeSequence = resolveProtectionHeaders().then(async (protectionHeaders) => {
      await send(protectionHeaders);
      setTimeoutImpl(() => send(protectionHeaders), 3000);
    });
    // A custom runtime without waitUntil still gets a best-effort wake. The
    // promise is intentionally self-contained so no rejection escapes.
    wakeSequence.catch(() => null);
  } else {
    send();
    setTimeoutImpl(send, 3000);
  }
  return true;
}

export function checkBudget(goal) {
  const spent = Number(goal.spent_usd || 0);
  const budget = Number(goal.budget_usd || 0);
  if (budget <= 0) return { ok: false, reason: 'No budget set' };
  if (spent >= budget) return { ok: false, reason: 'Budget exhausted' };
  if (spent >= budget * 0.9) return { ok: false, reason: 'Budget 90% spent', warning: true };
  return { ok: true, remaining: budget - spent };
}

export function generateId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function trackTokenSpend(
  admin,
  userId,
  goalId,
  costUsd,
  source,
  description,
  metadata = {}
) {
  if (!costUsd || costUsd <= 0 || !userId) return;
  try {
    await admin.from('financial_events').insert({
      user_id: userId,
      goal_id: goalId || null,
      event_type: 'token_spend',
      amount_usd: costUsd,
      direction: 'out',
      source,
      description: (description || source).slice(0, 200),
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });
  } catch {
    /* financial tracking should never block pipeline */
  }
}

/** Normalize token counts from executeLlm / tool-runner result shapes. */
export function extractTokenUsage(result = {}) {
  const promptTokens = Number(result.promptTokens ?? result.usage?.prompt_tokens ?? 0);
  const completionTokens = Number(result.completionTokens ?? result.usage?.completion_tokens ?? 0);
  const totalTokens = Number(result.usage?.total_tokens ?? promptTokens + completionTokens);
  // Prompt-cache hits: OpenAI -> usage.prompt_tokens_details.cached_tokens, Anthropic -> usage.cache_read_input_tokens
  const cachedTokens = Number(
    result.cachedTokens ??
      result.usage?.prompt_tokens_details?.cached_tokens ??
      result.usage?.cache_read_input_tokens ??
      0
  );
  return { promptTokens, completionTokens, totalTokens, cachedTokens };
}

export function phaseKeyFromIndex(phaseIndex) {
  if (phaseIndex == null || phaseIndex === -1) return 'planning';
  return String(phaseIndex);
}

/** Pure rollup helper — merge one LLM call into a phase bucket. */
export function rollupPhaseTokens(
  phaseTokens = {},
  phaseKey,
  { provider, model, tokens, costUsd }
) {
  const prev = phaseTokens[phaseKey] || {};
  const bucket = {
    total_tokens: Number(prev.total_tokens || 0),
    cost_usd: Number(prev.cost_usd || 0),
    by_model: Array.isArray(prev.by_model) ? [...prev.by_model] : [],
    updated_at: prev.updated_at || null,
  };
  bucket.total_tokens += tokens;
  bucket.cost_usd += costUsd;
  const modelKey = `${provider || 'unknown'}/${model || 'unknown'}`;
  const hit = bucket.by_model.find((m) => `${m.provider}/${m.model}` === modelKey);
  if (hit) {
    hit.tokens += tokens;
    hit.cost_usd = Number(hit.cost_usd || 0) + costUsd;
  } else {
    bucket.by_model.push({
      provider: provider || 'unknown',
      model: model || 'unknown',
      tokens,
      cost_usd: costUsd,
    });
  }
  bucket.updated_at = new Date().toISOString();
  return { ...phaseTokens, [phaseKey]: bucket };
}

async function incrementGoalTokenRollup(
  admin,
  userId,
  goalId,
  phaseKey,
  { provider, model, tokens, costUsd }
) {
  if (!userId || !goalId || tokens <= 0) return;
  try {
    // The goal row is shared orchestration state. A blind read/merge/write can
    // erase a concurrent lifecycle or authorization mutation, so bind the
    // write to the complete snapshot and retry a bounded number of conflicts.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data: goal, error: readError } = await admin
        .from('goals')
        .select(
          'id, user_id, status, data, updated_at, org_id, agent_team_id, team_id, concilium_id'
        )
        .eq('id', goalId)
        .eq('user_id', userId)
        .maybeSingle();
      if (readError) throw readError;
      if (!goal || String(goal.user_id || '') !== String(userId)) return;

      const data = goal.data || {};
      const phaseTokens = rollupPhaseTokens(data.phase_tokens || {}, phaseKey, {
        provider,
        model,
        tokens,
        costUsd,
      });
      const prevTotals = data.token_totals || {};
      const now = new Date().toISOString();
      const tokenTotals = {
        total_tokens: Number(prevTotals.total_tokens || 0) + tokens,
        cost_usd: Number(prevTotals.cost_usd || 0) + costUsd,
        updated_at: now,
      };
      let update = admin
        .from('goals')
        .update({
          data: { ...data, phase_tokens: phaseTokens, token_totals: tokenTotals },
          updated_at: now,
        })
        .eq('id', goalId)
        .eq('user_id', userId);
      update = exactUsageSnapshotFilter(update, 'status', goal.status);
      update = exactUsageSnapshotFilter(update, 'updated_at', goal.updated_at);
      update = exactUsageSnapshotFilter(update, 'org_id', goal.org_id);
      update = exactUsageSnapshotFilter(update, 'agent_team_id', goal.agent_team_id);
      update = exactUsageSnapshotFilter(update, 'team_id', goal.team_id);
      update = exactUsageSnapshotFilter(update, 'concilium_id', goal.concilium_id);
      update = exactUsageSnapshotFilter(update, 'data', goal.data, { json: true });
      const { data: updated, error: updateError } = await update.select('id').maybeSingle();
      if (updateError) throw updateError;
      if (updated?.id) return;
    }
    log.warn(null, 'goal.token-rollup.conflict', { goalId, userId });
  } catch (err) {
    log.warn(null, 'goal.token-rollup.failed', { goalId, error: err.message });
  }
}

async function loadOwnedUsageEntity(admin, table, id, userId, select = 'id, user_id') {
  if (!id) return null;
  const { data, error } = await admin
    .from(table)
    .select(select)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data || String(data.user_id || '') !== String(userId)) return null;
  return data;
}

async function loadOwnedUsageTeam(admin, id, userId) {
  if (!id) return null;
  const [agentTeam, legacyTeam] = await Promise.all([
    loadOwnedUsageEntity(admin, 'agent_teams', id, userId),
    loadOwnedUsageEntity(admin, 'concilium_teams', id, userId),
  ]);
  const matches = [
    agentTeam ? { ...agentTeam, usage_team_kind: 'agent_team' } : null,
    legacyTeam ? { ...legacyTeam, usage_team_kind: 'concilium_team' } : null,
  ].filter(Boolean);
  return matches.length === 1 ? matches[0] : null;
}

function exactUsageSnapshotFilter(query, column, value, { json = false } = {}) {
  if (value === null || value === undefined) return query.is(column, null);
  return query.eq(column, json ? JSON.stringify(value) : value);
}

async function updateTaskLlmUsage(
  admin,
  userId,
  taskId,
  initialTask,
  { promptTokens, completionTokens, tokens, estimatedCostUsd }
) {
  let snapshot = initialTask;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      snapshot = await loadOwnedUsageEntity(
        admin,
        'team_tasks',
        taskId,
        userId,
        'id, user_id, goal_id, job_pool_id, agent_id, status, data, updated_at'
      );
    }
    if (!snapshot) return;

    const nextUpdatedAt = new Date().toISOString();
    let update = admin
      .from('team_tasks')
      .update({
        data: {
          ...(snapshot.data || {}),
          llmPromptTokens: promptTokens,
          llmCompletionTokens: completionTokens,
          llmTotalTokens: tokens,
          llmEstimatedCostUsd: estimatedCostUsd || 0,
        },
        updated_at: nextUpdatedAt,
      })
      .eq('id', taskId)
      .eq('user_id', userId);
    update = exactUsageSnapshotFilter(update, 'goal_id', snapshot.goal_id);
    update = exactUsageSnapshotFilter(update, 'job_pool_id', snapshot.job_pool_id);
    update = exactUsageSnapshotFilter(update, 'agent_id', snapshot.agent_id);
    update = exactUsageSnapshotFilter(update, 'status', snapshot.status);
    update = exactUsageSnapshotFilter(update, 'updated_at', snapshot.updated_at);
    update = exactUsageSnapshotFilter(update, 'data', snapshot.data, { json: true });
    const { data: updated, error } = await update.select('id').maybeSingle();
    if (error) throw error;
    if (updated?.id) return;
  }
  log.warn(null, 'llm_usage.task-update.conflict', { taskId, userId });
}

/**
 * Record LLM usage across llm_usage, financial_events, team_tasks, and goals.data.
 */
export async function recordLlmUsage(
  admin,
  {
    userId,
    goalId,
    jobId = null,
    runtimeJobId = null,
    taskId = null,
    provider = 'unknown',
    model = 'unknown',
    promptTokens = 0,
    completionTokens = 0,
    totalTokens = 0,
    cachedTokens = 0,
    estimatedCostUsd = 0,
    durationMs = 0,
    source = 'llm',
    operation = null,
    finishReason = null,
    status = 'ok',
    errorType = null,
    organizationId = null,
    teamId = null,
    agentId = null,
    agentTable = null,
    consiliumId = null,
    description = '',
    phaseIndex = null,
    agentName = null,
    metadataExtra = null,
    updateGoalRollup = true,
    updateTask = true,
  } = {}
) {
  const tokens = totalTokens || promptTokens + completionTokens;
  // Successful calls with no usage are skipped, but errors/timeouts are always
  // recorded so wasted spend and reliability stay visible.
  if (status === 'ok' && tokens <= 0 && estimatedCostUsd <= 0) return { recorded: false };

  const resolvedUserId = typeof userId === 'string' ? userId.trim() : '';
  if (!resolvedUserId) {
    return { recorded: false, reason: 'usage_owner_required' };
  }

  // The service client bypasses RLS, so every attribution target is resolved
  // under the caller's already-durable owner. A named foreign entity causes the
  // whole attribution write to fail closed rather than being silently attached
  // to an unrelated successful model call.
  let ownedGoal = null;
  if (goalId) {
    ownedGoal = await loadOwnedUsageEntity(
      admin,
      'goals',
      goalId,
      resolvedUserId,
      'id, user_id, org_id, agent_team_id, team_id, concilium_id'
    );
    if (!ownedGoal) return { recorded: false, reason: 'usage_goal_owner_mismatch' };
  }

  let ownedTask = null;
  if (taskId) {
    ownedTask = await loadOwnedUsageEntity(
      admin,
      'team_tasks',
      taskId,
      resolvedUserId,
      'id, user_id, goal_id, job_pool_id, agent_id, status, data, updated_at'
    );
    if (!ownedTask) return { recorded: false, reason: 'usage_task_owner_mismatch' };
    const taskGoalIds = [ownedTask.goal_id, ownedTask.data?.goal_id].filter(Boolean).map(String);
    if (new Set(taskGoalIds).size > 1) {
      return { recorded: false, reason: 'usage_task_goal_mismatch' };
    }
    if (
      goalId &&
      (taskGoalIds.length === 0 || taskGoalIds.some((candidate) => candidate !== String(goalId)))
    ) {
      return { recorded: false, reason: 'usage_task_goal_mismatch' };
    }
  }

  // llm_usage.job_id is an FK to agent_jobs, while execute-task also has a
  // distinct business jobs.id. Keep those identities explicit and validate
  // both under the durable owner before writing either the FK or metadata.
  const durableAgentJobId = uuidColumnValue(jobId);
  if (jobId && runtimeJobId && !durableAgentJobId) {
    return { recorded: false, reason: 'usage_agent_job_id_invalid' };
  }
  const resolvedRuntimeJobId = runtimeJobId || (jobId && !durableAgentJobId ? jobId : null);
  let ownedAgentJob = null;
  if (durableAgentJobId) {
    ownedAgentJob = await loadOwnedUsageEntity(
      admin,
      'agent_jobs',
      durableAgentJobId,
      resolvedUserId,
      'id, user_id, payload'
    );
    if (!ownedAgentJob) {
      return { recorded: false, reason: 'usage_agent_job_owner_mismatch' };
    }
    const queuedPayload = ownedAgentJob.payload;
    if (
      !usagePayloadBindingMatches(queuedPayload, ['_userId', 'userId', 'user_id'], resolvedUserId)
    ) {
      return { recorded: false, reason: 'usage_agent_job_owner_payload_mismatch' };
    }
    if (goalId && !usagePayloadBindingMatches(queuedPayload, ['goalId', 'goal_id'], goalId)) {
      return { recorded: false, reason: 'usage_agent_job_goal_mismatch' };
    }
    if (taskId && !usagePayloadBindingMatches(queuedPayload, ['taskId', 'task_id'], taskId)) {
      return { recorded: false, reason: 'usage_agent_job_task_mismatch' };
    }
    if (
      resolvedRuntimeJobId &&
      !usagePayloadBindingMatches(queuedPayload, ['jobId', 'job_id'], resolvedRuntimeJobId)
    ) {
      return { recorded: false, reason: 'usage_agent_job_runtime_job_mismatch' };
    }
  }

  if (resolvedRuntimeJobId) {
    const ownedRuntimeJob = await loadOwnedUsageEntity(
      admin,
      'jobs',
      resolvedRuntimeJobId,
      resolvedUserId,
      'id, user_id, goal_id'
    );
    if (!ownedRuntimeJob) {
      return { recorded: false, reason: 'usage_runtime_job_owner_mismatch' };
    }
    if (ownedTask && String(ownedTask.job_pool_id || '') !== String(resolvedRuntimeJobId)) {
      return { recorded: false, reason: 'usage_task_job_mismatch' };
    }
    if (goalId && String(ownedRuntimeJob.goal_id || '') !== String(goalId)) {
      return { recorded: false, reason: 'usage_job_goal_mismatch' };
    }
  }

  let resolvedOrgId = organizationId || null;
  let resolvedTeamId = teamId || null;
  let resolvedConsiliumId = consiliumId || null;
  if (ownedGoal) {
    const goalOrgId = ownedGoal.org_id || null;
    const goalTeamId = ownedGoal.agent_team_id || ownedGoal.team_id || null;
    const goalConsiliumId = ownedGoal.concilium_id || null;
    if (resolvedOrgId && String(resolvedOrgId) !== String(goalOrgId || '')) {
      return { recorded: false, reason: 'usage_goal_organization_mismatch' };
    }
    if (resolvedTeamId && String(resolvedTeamId) !== String(goalTeamId || '')) {
      return { recorded: false, reason: 'usage_goal_team_mismatch' };
    }
    if (resolvedConsiliumId && String(resolvedConsiliumId) !== String(goalConsiliumId || '')) {
      return { recorded: false, reason: 'usage_goal_consilium_mismatch' };
    }

    if (
      goalOrgId &&
      !(await loadOwnedUsageEntity(admin, 'organizations', goalOrgId, resolvedUserId))
    ) {
      return { recorded: false, reason: 'usage_goal_organization_owner_mismatch' };
    }
    if (
      ownedGoal.agent_team_id &&
      !(await loadOwnedUsageEntity(admin, 'agent_teams', ownedGoal.agent_team_id, resolvedUserId))
    ) {
      return { recorded: false, reason: 'usage_goal_team_owner_mismatch' };
    }
    if (
      ownedGoal.team_id &&
      !(await loadOwnedUsageEntity(admin, 'concilium_teams', ownedGoal.team_id, resolvedUserId))
    ) {
      return { recorded: false, reason: 'usage_goal_team_owner_mismatch' };
    }
    if (
      goalConsiliumId &&
      !(await loadOwnedUsageEntity(admin, 'consilium', goalConsiliumId, resolvedUserId))
    ) {
      return { recorded: false, reason: 'usage_goal_consilium_owner_mismatch' };
    }
    resolvedOrgId = goalOrgId;
    resolvedTeamId = goalTeamId;
    resolvedConsiliumId = goalConsiliumId;
  } else {
    if (
      resolvedOrgId &&
      !(await loadOwnedUsageEntity(admin, 'organizations', resolvedOrgId, resolvedUserId))
    ) {
      return { recorded: false, reason: 'usage_organization_owner_mismatch' };
    }
    if (resolvedTeamId && !(await loadOwnedUsageTeam(admin, resolvedTeamId, resolvedUserId))) {
      return { recorded: false, reason: 'usage_team_owner_mismatch' };
    }
    if (
      resolvedConsiliumId &&
      !(await loadOwnedUsageEntity(admin, 'consilium', resolvedConsiliumId, resolvedUserId))
    ) {
      return { recorded: false, reason: 'usage_consilium_owner_mismatch' };
    }
  }

  if (agentId) {
    const resolvedAgentTable =
      agentTable || (source === 'consilium' ? 'concilium_members' : 'agents');
    if (!USAGE_AGENT_TABLES.has(resolvedAgentTable)) {
      return { recorded: false, reason: 'usage_agent_table_invalid' };
    }
    if (ownedTask && String(ownedTask.agent_id || '') !== String(agentId)) {
      return { recorded: false, reason: 'usage_task_agent_mismatch' };
    }
    const ownedAgent = await loadOwnedUsageEntity(
      admin,
      resolvedAgentTable,
      agentId,
      resolvedUserId,
      resolvedAgentTable === 'concilium_members'
        ? 'id, user_id, concilium_id'
        : resolvedAgentTable === 'concilium_agents'
          ? 'id, user_id, board_id'
          : 'id, user_id'
    );
    if (!ownedAgent) return { recorded: false, reason: 'usage_agent_owner_mismatch' };
    if (
      resolvedAgentTable === 'concilium_members' &&
      String(ownedAgent.concilium_id || '') !== String(resolvedConsiliumId || '')
    ) {
      return { recorded: false, reason: 'usage_agent_consilium_mismatch' };
    }
    if (
      resolvedAgentTable === 'concilium_agents' &&
      resolvedConsiliumId &&
      String(ownedAgent.board_id || '') !== String(resolvedConsiliumId)
    ) {
      return { recorded: false, reason: 'usage_agent_consilium_mismatch' };
    }
  }

  const phaseKey = phaseKeyFromIndex(phaseIndex);
  const metadata = {
    // Optional caller-supplied extras (e.g. AxWise decision vs local decision for
    // impact analysis) go first so the base keys below always win on collision.
    ...(metadataExtra && typeof metadataExtra === 'object' ? metadataExtra : {}),
    goal_id: goalId || null,
    task_id: taskId || null,
    ...(resolvedRuntimeJobId ? { runtime_job_id: String(resolvedRuntimeJobId) } : {}),
    phase_index: phaseIndex,
    agent_name: agentName || null,
    source,
    operation: operation || null,
    ...(agentId
      ? {
          agent_table: agentTable || (source === 'consilium' ? 'concilium_members' : 'agents'),
        }
      : {}),
  };

  try {
    const { error: insertErr } = await admin.from('llm_usage').insert({
      user_id: resolvedUserId,
      goal_id: uuidColumnValue(goalId),
      job_id: durableAgentJobId,
      organization_id: uuidColumnValue(resolvedOrgId),
      team_id: uuidColumnValue(resolvedTeamId),
      agent_id: agentId || null,
      agent_name: agentName || null,
      consilium_id: resolvedConsiliumId,
      provider,
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: tokens,
      cached_tokens: cachedTokens || 0,
      estimated_cost_usd: estimatedCostUsd || 0,
      duration_ms: durationMs || 0,
      status,
      error_type: errorType || null,
      operation: operation || null,
      finish_reason: finishReason || null,
      source,
      metadata,
    });
    if (insertErr)
      log.warn(null, 'llm_usage.insert.failed', { error: insertErr.message, goalId, source });
  } catch (err) {
    log.warn(null, 'llm_usage.insert.failed', { error: err.message, goalId, source });
  }

  if (resolvedUserId && goalId && estimatedCostUsd > 0) {
    await trackTokenSpend(admin, resolvedUserId, goalId, estimatedCostUsd, source, description, {
      phase_index: phaseIndex,
      agent_name: agentName,
      provider,
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: tokens,
    });
  }

  if (taskId && updateTask && tokens > 0) {
    try {
      await updateTaskLlmUsage(admin, resolvedUserId, taskId, ownedTask, {
        promptTokens,
        completionTokens,
        tokens,
        estimatedCostUsd,
      });
    } catch (err) {
      log.warn(null, 'llm_usage.task-update.failed', { error: err.message, taskId });
    }
  }

  if (goalId && updateGoalRollup && tokens > 0) {
    await incrementGoalTokenRollup(admin, resolvedUserId, goalId, phaseKey, {
      provider,
      model,
      tokens,
      costUsd: estimatedCostUsd || 0,
    });
  }

  return { recorded: true, tokens, estimatedCostUsd };
}

/** Convenience wrapper for orchestration stages that already have an executeLlm result. */
export async function recordStageLlmUsage(
  admin,
  goal,
  result,
  {
    source,
    description,
    phaseIndex = null,
    jobId = null,
    agentName = null,
    agentId = null,
    operation = null,
  } = {}
) {
  if (!goal?.id || !result) return { recorded: false };
  const { promptTokens, completionTokens, totalTokens, cachedTokens } = extractTokenUsage(result);
  return recordLlmUsage(admin, {
    userId: goal.user_id,
    goalId: goal.id,
    runtimeJobId: jobId,
    organizationId: goal.org_id || null,
    teamId: goal.agent_team_id || goal.team_id || null,
    consiliumId: goal.concilium_id || null,
    agentId,
    provider: result.provider || 'unknown',
    model: result.model || 'unknown',
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens,
    estimatedCostUsd: Number(result.estimatedCostUsd || 0),
    durationMs: Number(result.durationMs || 0),
    finishReason: result.finishReason || result.finish_reason || null,
    status: result.status === 'error' || result.error ? 'error' : 'ok',
    errorType: result.error ? result.errorType || 'llm_error' : null,
    source,
    operation: operation || source,
    description: description || source,
    phaseIndex,
    agentName,
    updateTask: false,
  });
}

function aggregateModelBreakdown(rows) {
  const byModel = new Map();
  for (const row of rows) {
    const provider = row.provider || 'unknown';
    const model = row.model || 'unknown';
    const key = `${provider}/${model}`;
    const tokens =
      Number(row.total_tokens || 0) ||
      Number(row.prompt_tokens || 0) + Number(row.completion_tokens || 0);
    const costUsd = Number(row.estimated_cost_usd || 0);
    const prev = byModel.get(key) || { provider, model, tokens: 0, costUsd: 0 };
    prev.tokens += tokens;
    prev.costUsd += costUsd;
    byModel.set(key, prev);
  }
  return [...byModel.values()];
}

function bucketRowsByPhase(rows) {
  const byPhase = {};
  for (const row of rows) {
    const pi = row.metadata?.phase_index;
    const phaseKey = phaseKeyFromIndex(pi);
    if (!byPhase[phaseKey]) byPhase[phaseKey] = [];
    byPhase[phaseKey].push(row);
  }
  return byPhase;
}

function summaryFromTasks(tasks) {
  const byPhase = {};
  const modelByPhase = {};
  let totalTokens = 0;
  let totalTokenCostUsd = 0;

  for (const task of tasks || []) {
    const tokens = Number(task.data?.llmTotalTokens || 0);
    const costUsd = Number(task.data?.llmEstimatedCostUsd || task.data?.llmCost || 0);
    if (tokens <= 0) continue;
    const phaseKey = phaseKeyFromIndex(task.data?.phase_index);
    if (!byPhase[phaseKey]) byPhase[phaseKey] = { tokens: 0, costUsd: 0, tokenBreakdown: [] };
    byPhase[phaseKey].tokens += tokens;
    byPhase[phaseKey].costUsd += costUsd;
    totalTokens += tokens;
    totalTokenCostUsd += costUsd;

    const provider = task.data?.llmProvider || 'unknown';
    const model = task.data?.llmModel || 'unknown';
    const mk = `${phaseKey}:${provider}/${model}`;
    if (!modelByPhase[mk]) {
      modelByPhase[mk] = { phaseKey, provider, model, tokens: 0, costUsd: 0 };
    }
    modelByPhase[mk].tokens += tokens;
    modelByPhase[mk].costUsd += costUsd;
  }

  for (const entry of Object.values(modelByPhase)) {
    byPhase[entry.phaseKey].tokenBreakdown.push({
      provider: entry.provider,
      model: entry.model,
      tokens: entry.tokens,
      costUsd: entry.costUsd,
    });
  }

  if (totalTokens <= 0) return null;
  return {
    hasTokenData: true,
    totalTokens,
    totalTokenCostUsd: totalTokenCostUsd > 0 ? totalTokenCostUsd : null,
    byPhase,
  };
}

/**
 * Build token summary for a goal from persisted rollups and llm_usage rows.
 */
export async function getGoalTokenSummary(admin, goalId, { goalData, jobIds, goalTasks } = {}) {
  const persisted = goalData?.phase_tokens || {};
  const persistedTotals = goalData?.token_totals || null;

  let rows = [];
  try {
    const { data: byGoal } = await admin
      .from('llm_usage')
      .select(
        'provider, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, metadata'
      )
      .eq('goal_id', goalId);
    rows = byGoal || [];
  } catch {
    rows = [];
  }

  if (!rows.length) {
    try {
      const { data: byMeta } = await admin
        .from('llm_usage')
        .select(
          'provider, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, metadata'
        )
        .contains('metadata', { goal_id: goalId });
      rows = byMeta || [];
    } catch {
      rows = [];
    }
  }

  if (!rows.length && jobIds?.length) {
    const { data: byJob } = await admin
      .from('llm_usage')
      .select(
        'provider, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, metadata'
      )
      .in('job_id', jobIds);
    rows = byJob || [];
  }

  const hasLlmRows = rows.length > 0;
  const hasPersisted = Boolean(
    persistedTotals?.total_tokens > 0 ||
    Object.values(persisted).some((p) => Number(p?.total_tokens || 0) > 0)
  );

  if (!hasLlmRows && !hasPersisted) {
    const fromTasks = summaryFromTasks(goalTasks);
    if (fromTasks) return fromTasks;
    return {
      hasTokenData: false,
      totalTokens: null,
      totalTokenCostUsd: null,
      byPhase: {},
    };
  }

  const byPhase = {};
  if (hasLlmRows) {
    const bucketed = bucketRowsByPhase(rows);
    for (const [phaseKey, phaseRows] of Object.entries(bucketed)) {
      const tokens = phaseRows.reduce(
        (s, r) =>
          s +
          (Number(r.total_tokens || 0) ||
            Number(r.prompt_tokens || 0) + Number(r.completion_tokens || 0)),
        0
      );
      const costUsd = phaseRows.reduce((s, r) => s + Number(r.estimated_cost_usd || 0), 0);
      byPhase[phaseKey] = {
        tokens,
        costUsd,
        tokenBreakdown: aggregateModelBreakdown(phaseRows),
      };
    }
  } else {
    for (const [phaseKey, bucket] of Object.entries(persisted)) {
      const tokens = Number(bucket.total_tokens || 0);
      if (tokens <= 0) continue;
      byPhase[phaseKey] = {
        tokens,
        costUsd: Number(bucket.cost_usd || 0),
        tokenBreakdown: (bucket.by_model || []).map((m) => ({
          provider: m.provider,
          model: m.model,
          tokens: Number(m.tokens || 0),
          costUsd: Number(m.cost_usd || 0),
        })),
      };
    }
  }

  const totalTokens = hasLlmRows
    ? rows.reduce(
        (s, r) =>
          s +
          (Number(r.total_tokens || 0) ||
            Number(r.prompt_tokens || 0) + Number(r.completion_tokens || 0)),
        0
      )
    : Number(persistedTotals?.total_tokens || 0);
  const totalTokenCostUsd = hasLlmRows
    ? rows.reduce((s, r) => s + Number(r.estimated_cost_usd || 0), 0)
    : Number(persistedTotals?.cost_usd || 0);

  return {
    hasTokenData: totalTokens > 0,
    totalTokens: totalTokens > 0 ? totalTokens : null,
    totalTokenCostUsd: totalTokenCostUsd > 0 ? totalTokenCostUsd : null,
    byPhase,
  };
}

/**
 * Get unified financial summary for a goal from financial_events (single source of truth).
 * Aggregates by total, phase, agent, and source.
 */
export async function getGoalFinancialSummary(admin, goalId) {
  const { data: events } = await admin
    .from('financial_events')
    .select('amount_usd, source, description, metadata')
    .eq('goal_id', goalId)
    .eq('direction', 'out');

  let totalSpent = 0;
  const bySource = {};
  const byAgent = {};
  const byPhase = { planning: 0 };

  for (const e of events || []) {
    const amt = Number(e.amount_usd || 0);
    totalSpent += amt;
    // By source
    bySource[e.source] = (bySource[e.source] || 0) + amt;
    // By phase
    const pi = e.metadata?.phase_index;
    if (pi != null) byPhase[pi] = (byPhase[pi] || 0) + amt;
    else byPhase.planning += amt;
    // By agent
    const agent =
      e.metadata?.agent_name ||
      (e.source === 'execute-task' ? e.description?.slice(0, 40) : 'System');
    if (!byAgent[agent]) byAgent[agent] = { spent: 0, events: 0 };
    byAgent[agent].spent += amt;
    byAgent[agent].events++;
  }
  return { totalSpent, bySource, byAgent, byPhase };
}

export async function createBudgetRequest(
  admin,
  { userId, goalId, taskId, agentName, amount, purpose, category }
) {
  if (!amount || amount <= 0 || !userId || !goalId) return null;
  try {
    const { data: request } = await admin
      .from('budget_requests')
      .insert({
        user_id: userId,
        goal_id: goalId,
        task_id: taskId || null,
        agent_name: agentName || '',
        amount_usd: amount,
        purpose: (purpose || '').slice(0, 500),
        category: category || 'operational',
      })
      .select('id')
      .single();

    await logGoalEvent(admin, goalId, 'budget_request_created', {
      request_id: request?.id,
      amount,
      purpose,
      agent_name: agentName,
      category,
    });

    const { postMessage } = await import('./goal-messaging.js');
    await postMessage(admin, {
      goalId,
      senderName: agentName || 'System',
      channel: 'system',
      message: `Budget request: $${Number(amount).toFixed(2)} for "${purpose}"`,
      messageType: 'alert',
    });

    return request;
  } catch {
    return null;
  }
}

/**
 * Track a pipeline agent's work (PO, PM, etc.) so it appears in History tab and agent stats.
 * Creates a completed job row + updates agent_performance.
 */
export async function trackAgentWork(
  admin,
  { agentId, agentName, userId, goalId, taskTitle, taskType, costUsd }
) {
  if (!agentId || !userId || !goalId) return;
  const jobId = generateId('job');
  try {
    await admin.from('jobs').insert({
      id: jobId,
      user_id: userId,
      goal_id: goalId,
      description: taskTitle,
      category: taskType || 'general',
      requirements: '',
      status: 'completed',
      assigned_agent_id: agentId,
      assigned_agent_name: agentName || '',
    });
  } catch (err) {
    log.warn(null, 'trackAgentWork.job.failed', { error: err.message });
  }

  // Update agent_performance
  try {
    const { data: existing } = await admin
      .from('agent_performance')
      .select('id, tasks_completed, avg_quality_score, avg_tokens_used')
      .eq('agent_id', agentId)
      .eq('task_type', taskType || 'general')
      .single();

    if (existing) {
      const newCompleted = (existing.tasks_completed || 0) + 1;
      const newAvg =
        ((existing.avg_quality_score || 0) * existing.tasks_completed + 90) / newCompleted;
      await admin
        .from('agent_performance')
        .update({
          tasks_completed: newCompleted,
          avg_quality_score: Math.round(newAvg * 100) / 100,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await admin.from('agent_performance').insert({
        id: crypto.randomUUID(),
        agent_id: agentId,
        task_type: taskType || 'general',
        tasks_completed: 1,
        tasks_failed: 0,
        avg_quality_score: 90,
        updated_at: new Date().toISOString(),
      });
    }
  } catch (err) {
    log.warn(null, 'trackAgentWork.perf.failed', { error: err.message });
  }
}

/**
 * Find an agent by role name for a given user.
 * Returns the agent row or null if not found.
 */
/**
 * Compute historical per-task averages from a user's past completed goals,
 * filtering out wall-clock pollution from goals that were stalled/paused/
 * healed before completing.
 *
 * The naive version `(completed_at - created_at) / jobs` assumes the goal ran
 * straight through from creation to completion — but any goal that sat in
 * `failed`/`paused`/`awaiting_*` for hours before being recovered by the
 * self-healer will return a wildly inflated wall-clock. One bad sample is
 * enough to poison every future estimate.
 *
 * This helper applies three defenses:
 *   1. Per-sample cap: timePerTask > 5 min is discarded (real tasks are 1-3 min;
 *      anything higher is almost certainly wall-clock pollution from a stall).
 *   2. Cost-sanity cap: timePerTask > 50× the cost-implied baseline is discarded.
 *      A $0.003 task should not take 30 minutes.
 *   3. Median instead of mean: even after filtering, median is robust to the
 *      occasional remaining outlier.
 *
 * Returns { avgCostPerTask, avgTimePerTaskMin, sampleSize }.
 */
export function computeHistoricalAverages(
  pastGoals,
  { defaultCostPerTask = 0.015, defaultTimePerTaskMin = 2.5, maxTimePerTaskMin = 5 } = {}
) {
  const samples = [];
  for (const g of pastGoals || []) {
    const spent = Number(g.spent_usd || 0);
    const jobs = (g.plan?.phases || []).reduce((s, p) => s + (p.jobs?.length || 0), 0);
    if (jobs <= 0 || spent <= 0) continue;

    const costPerTask = spent / jobs;
    const completedAt = g.data?.completed_at ? new Date(g.data.completed_at) : null;
    const createdAt = g.created_at ? new Date(g.created_at) : null;

    let timePerTask = null;
    if (completedAt && createdAt) {
      const wallClockMin = Math.max(0.5, (completedAt - createdAt) / 60000);
      const rawTimePerTask = wallClockMin / jobs;

      // Defense 1: hard cap per task — stall pollution filter
      if (rawTimePerTask > maxTimePerTaskMin) {
        timePerTask = null; // skip this sample's time signal
      } else {
        // Defense 2: reject if wall-clock is grossly inconsistent with cost.
        // Real tasks roughly follow cost — a $0.01 task takes ~2.5 min.
        // If wall-clock > 50× that cost-implied time, it was stalled.
        const costImpliedMin = (costPerTask / 0.01) * defaultTimePerTaskMin;
        if (rawTimePerTask > costImpliedMin * 50 && rawTimePerTask > 3) {
          timePerTask = null;
        } else {
          timePerTask = rawTimePerTask;
        }
      }
    }

    samples.push({ costPerTask, timePerTask });
  }

  if (samples.length === 0) {
    return {
      avgCostPerTask: defaultCostPerTask,
      avgTimePerTaskMin: defaultTimePerTaskMin,
      sampleSize: 0,
    };
  }

  // Defense 3: median instead of mean for robustness
  const median = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  };

  const avgCostPerTask = median(samples.map((s) => s.costPerTask));
  const timed = samples.filter((s) => s.timePerTask != null).map((s) => s.timePerTask);
  const avgTimePerTaskMin = timed.length > 0 ? median(timed) : defaultTimePerTaskMin;

  return { avgCostPerTask, avgTimePerTaskMin, sampleSize: samples.length };
}

export async function findAgentByRole(admin, userId, roleName) {
  try {
    const { data } = await admin
      .from('agents')
      .select(
        'id, name, role, description, category, connection_type, system_prompt, capabilities, metadata'
      )
      .eq('user_id', userId)
      .ilike('role', roleName)
      .limit(1)
      .single();
    return data || null;
  } catch {
    return null;
  }
}

/**
 * Load the most recent Osja lessons for an agent. Returned as an array of
 * short critique strings that stage handlers and prompt builders can splice
 * into the agent's system prompt so past Osja verdicts shape future work.
 */
export async function loadOsjaLessonsForAgent(admin, agentId, userId, limit = 5) {
  if (!admin || !agentId || !userId) return [];
  try {
    const { data } = await admin
      .from('knowledge_documents')
      .select('content, metadata')
      .eq('user_id', userId)
      .eq('category', 'osja_lesson')
      .eq('metadata->>agent_id', agentId)
      // Only lessons produced by the task-scoped, excerpt-safe reviewer may
      // influence future prompts. Legacy reviews can remain auditable in KB
      // without silently teaching agents from known false negatives.
      .eq('metadata->>review_validated', 'true')
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data || []).map((d) => d.content).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Load user-imported "Sketch" prompts applied to an agent. Returned as
 * { name, content } records so the prompt builder can splice them into the
 * agent's composed instructions at task-execution time — same pattern as
 * Osja lessons, but author-supplied rather than system-generated.
 */
export async function loadSketchPromptsForAgent(admin, agentId, userId, limit = 10) {
  if (!admin || !agentId || !userId) return [];
  try {
    const { data } = await admin
      .from('sketch_prompts')
      .select('name, content')
      .eq('user_id', userId)
      .eq('agent_id', agentId)
      .eq('status', 'applied')
      .order('applied_at', { ascending: false })
      .limit(limit);
    return (data || []).filter((r) => r && typeof r.content === 'string' && r.content.trim());
  } catch {
    return [];
  }
}
