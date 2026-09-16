/**
 * Audit log: write actions (action, entity, entityId, user, when, details) to Supabase.
 * Used by backends and services after mutations. Audit Log page reads from here.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { docToType } from '../utils/kbConstants';

/** Full SQL to create audit_log table. Copy and run in Supabase → SQL Editor (click + for new query). */
export const AUDIT_LOG_MIGRATION_SQL = `-- Audit log table (Supabase → SQL Editor → click + → paste → Run)
create extension if not exists "uuid-ossp";

create table if not exists public.audit_log (
  id uuid primary key default uuid_generate_v4(),
  action text not null,
  entity text not null,
  entity_id text,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  details text,
  created_at timestamptz default now()
);

create index if not exists idx_audit_log_created_at on public.audit_log(created_at desc);
create index if not exists idx_audit_log_entity on public.audit_log(entity);
create index if not exists idx_audit_log_user_id on public.audit_log(user_id);

alter table public.audit_log enable row level security;

drop policy if exists "Authenticated users can insert audit_log" on public.audit_log;
create policy "Authenticated users can insert audit_log" on public.audit_log
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can read audit_log" on public.audit_log;
create policy "Authenticated users can read audit_log" on public.audit_log
  for select using (auth.role() = 'authenticated');
`;

const AUDIT_DETAILS_PREFIX = 'AUDIT_V2::';
const AUDIT_SESSION_KEY = 'orch_audit_session_id';
let clientContextPromise = null;

function randomId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    // Fallback below.
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function hashString(input) {
  const text = String(input || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

function parseOs(ua = '') {
  const text = ua.toLowerCase();
  if (text.includes('windows')) return 'Windows';
  if (text.includes('mac os x') || text.includes('macintosh')) return 'macOS';
  if (text.includes('iphone') || text.includes('ipad') || text.includes('ios')) return 'iOS';
  if (text.includes('android')) return 'Android';
  if (text.includes('linux')) return 'Linux';
  return 'Unknown';
}

function parseBrowser(ua = '') {
  const text = ua;
  const rules = [
    { name: 'Edge', regex: /Edg\/([\d.]+)/ },
    { name: 'Chrome', regex: /Chrome\/([\d.]+)/ },
    { name: 'Firefox', regex: /Firefox\/([\d.]+)/ },
    { name: 'Safari', regex: /Version\/([\d.]+).*Safari/ },
    { name: 'Opera', regex: /OPR\/([\d.]+)/ },
  ];
  for (const rule of rules) {
    const m = text.match(rule.regex);
    if (m) return { name: rule.name, version: m[1] };
  }
  return { name: 'Unknown', version: '' };
}

function getDeviceType() {
  if (typeof navigator === 'undefined') return 'Unknown';
  const ua = navigator.userAgent || '';
  if (/ipad|tablet/i.test(ua)) return 'Tablet';
  if (/mobi|android|iphone/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

async function fetchGeoContext() {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return null;
  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1800);
    const response = await fetch('https://ipwho.is/', { signal: controller.signal });
    window.clearTimeout(timeout);
    if (!response.ok) return null;
    const json = await response.json();
    if (!json?.success) return null;
    return {
      ip: json.ip || null,
      country: json.country || null,
      countryCode: json.country_code || null,
      region: json.region || null,
      city: json.city || null,
      isp: json.connection?.isp || null,
      org: json.connection?.org || null,
      asn: json.connection?.asn || null,
      service: json.connection?.domain || null,
    };
  } catch {
    return null;
  }
}

async function getClientContext() {
  if (typeof window === 'undefined') return {};
  if (clientContextPromise) return clientContextPromise;

  clientContextPromise = (async () => {
    let sessionId = null;
    try {
      sessionId = window.sessionStorage.getItem(AUDIT_SESSION_KEY) || randomId();
      window.sessionStorage.setItem(AUDIT_SESSION_KEY, sessionId);
    } catch {
      sessionId = randomId();
    }

    const ua = navigator?.userAgent || '';
    const browser = parseBrowser(ua);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const resolution =
      typeof window !== 'undefined' && window.screen
        ? `${window.screen.width}x${window.screen.height}`
        : null;
    const fpSeed = [
      ua,
      navigator?.platform || '',
      navigator?.language || '',
      timezone,
      resolution || '',
      navigator?.hardwareConcurrency || '',
      navigator?.maxTouchPoints || '',
    ].join('|');
    const fingerprintId = `fp_${hashString(fpSeed)}`;

    const geo = await fetchGeoContext();
    return {
      session: {
        id: sessionId,
        capturedAt: new Date().toISOString(),
      },
      fingerprint: {
        id: fingerprintId,
      },
      device: {
        os: parseOs(ua),
        browser: browser.name,
        browserVersion: browser.version,
        deviceType: getDeviceType(),
        platform: navigator?.platform || null,
        language: navigator?.language || null,
        languages: Array.isArray(navigator?.languages) ? navigator.languages.slice(0, 5) : [],
        timezone,
        userAgent: ua,
        screenResolution: resolution,
        cpuCores: navigator?.hardwareConcurrency || null,
        memoryGb: navigator?.deviceMemory || null,
        touchPoints: navigator?.maxTouchPoints || 0,
      },
      network: {
        ip: geo?.ip || null,
        country: geo?.country || null,
        countryCode: geo?.countryCode || null,
        region: geo?.region || null,
        city: geo?.city || null,
        isp: geo?.isp || null,
        org: geo?.org || null,
        asn: geo?.asn || null,
        service: geo?.service || null,
      },
    };
  })();

  return clientContextPromise;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function serializeDetails(details, meta = {}) {
  if (details == null && Object.keys(meta || {}).length === 0) return null;
  if (typeof details === 'string' && Object.keys(meta || {}).length === 0) return details;
  const payload = {
    v: 2,
    summary: typeof details === 'string' ? details : details?.summary || '',
    ...meta,
  };
  return `${AUDIT_DETAILS_PREFIX}${JSON.stringify(payload)}`;
}

function parseDetails(raw) {
  const value = raw || '';
  if (typeof value !== 'string') return { text: String(value), structured: null };
  if (value.startsWith(AUDIT_DETAILS_PREFIX)) {
    const structured = safeJsonParse(value.slice(AUDIT_DETAILS_PREFIX.length));
    return {
      text: structured?.summary || '',
      structured,
    };
  }
  const maybeJson = safeJsonParse(value);
  if (maybeJson && typeof maybeJson === 'object') {
    return {
      text: maybeJson.summary || '',
      structured: maybeJson,
    };
  }
  return { text: value, structured: null };
}

function actorDisplay(r) {
  const actorType = (r?.actor_type || 'user').toLowerCase();
  if (actorType === 'agent' && (r?.agent_name || r?.agent_id)) {
    return `AI Agent: ${r.agent_name || r.agent_id || 'Agent'}`;
  }
  return r?.user_email ?? '—';
}

function mapAuditRow(r) {
  const parsedValue = parseDetails(r?.details);
  return {
    id: r?.id,
    action: r?.action,
    entity: r?.entity,
    entityId: r?.entity_id ?? '—',
    user: r?.user_email ?? '—',
    actorType: (r?.actor_type || 'user').toLowerCase(),
    agentId: r?.agent_id ?? null,
    agentName: r?.agent_name ?? null,
    actorDisplay: actorDisplay(r),
    timestamp: r?.created_at,
    details: parsedValue.text,
    detailsStructured: parsedValue.structured,
  };
}

function isMissingColumnError(err) {
  const msg = (err?.message || '').toLowerCase();
  return (
    msg.includes('actor_type') ||
    msg.includes('agent_id') ||
    msg.includes('agent_name') ||
    (msg.includes('column') && msg.includes('does not exist'))
  );
}

/**
 * Log one action. No-op if Supabase is not configured.
 * When meta.actorType === 'agent', store agent_id/agent_name and optionally omit user (so audit shows AI Agent).
 * @param {{ action: string, entity: string, entityId?: string, details?: string|object, meta?: { actorType?: string, agentId?: string, agentName?: string } }} opts
 */
export async function logAction({ action, entity, entityId = null, details = null, meta = {} }) {
  if (!hasSupabase() || !supabase) return;
  try {
    const clientContext = await getClientContext();
    const mergedMeta = {
      ...clientContext,
      ...(meta || {}),
      session: {
        ...(clientContext.session || {}),
        ...(meta?.session || {}),
      },
      fingerprint: {
        ...(clientContext.fingerprint || {}),
        ...(meta?.fingerprint || {}),
      },
      device: {
        ...(clientContext.device || {}),
        ...(meta?.device || {}),
      },
      network: {
        ...(clientContext.network || {}),
        ...(meta?.network || {}),
      },
    };
    const isAgent = (meta?.actorType || '').toLowerCase() === 'agent';
    const agentId = isAgent ? (meta?.agentId ?? null) : null;
    const agentName = isAgent ? (meta?.agentName ?? null) : null;
    let userId = null;
    let userEmail = null;
    if (!isAgent) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
      userEmail = user?.email ?? null;
    }
    const payload = {
      action,
      entity,
      entity_id: entityId ?? null,
      user_id: userId,
      user_email: userEmail,
      details: serializeDetails(details, mergedMeta),
    };
    if (isAgent) {
      payload.actor_type = 'agent';
      payload.agent_id = agentId;
      payload.agent_name = agentName;
    }
    const { error: insertErr } = await supabase.from('audit_log').insert(payload);
    if (insertErr && isMissingColumnError(insertErr)) {
      await supabase.from('audit_log').insert({
        action,
        entity,
        entity_id: entityId ?? null,
        user_id: userId,
        user_email: userEmail,
        details: serializeDetails(details, mergedMeta),
      });
    }
  } catch {
    // Don't fail the main operation if logging fails
  }
}

/**
 * Build meta for logAction when the action is performed by an AI agent.
 * Pass the result into logAction(..., meta: { ...yourMeta, ...buildAgentMeta(agentContext) }).
 * @param {{ id?: string, name?: string }|null|undefined} agentContext
 * @returns {{ actorType?: string, agentId?: string|null, agentName?: string|null }}
 */
export function buildAgentMeta(agentContext) {
  if (!agentContext || (!agentContext.id && !agentContext.name)) return {};
  return {
    actorType: 'agent',
    agentId: agentContext.id ?? null,
    agentName: agentContext.name ?? null,
  };
}

/** True if the error indicates the audit_log table does not exist yet. */
export function isAuditLogTableMissingError(error) {
  const msg = (error?.message || '').toLowerCase();
  return (
    msg.includes('audit_log') ||
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('relation')
  );
}

/**
 * Load audit log entries for the Audit Log page. Newest first.
 * @param {{ limit?: number, offset?: number }} opts
 * @returns {Promise<Array<{ id: string, action: string, entity: string, entityId: string, user: string, timestamp: string, details: string, detailsStructured?: object|null }>>}
 */
export async function loadAuditLogs(opts = {}) {
  if (!hasSupabase() || !supabase) return [];
  const limit = opts.limit ?? 500;
  const offset = opts.offset ?? 0;
  let query = supabase
    .from('audit_log')
    .select(
      'id, action, entity, entity_id, user_email, details, created_at, actor_type, agent_id, agent_name'
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  let { data, error } = await query;
  if (error && isMissingColumnError(error)) {
    const legacy = await supabase
      .from('audit_log')
      .select('id, action, entity, entity_id, user_email, details, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (legacy.error) throw legacy.error;
    data = (legacy.data || []).map((r) => ({
      ...r,
      actor_type: 'user',
      agent_id: null,
      agent_name: null,
    }));
    error = null;
  }
  if (error) throw error;
  return (data || []).map((r) => mapAuditRow(r));
}

export const PERMISSIONS_ACTION_TYPES = [
  'role_created',
  'role_updated',
  'role_deleted',
  'role_duplicated',
  'user_role_changed',
  'user_status_changed',
  'user_deleted',
  'user_2fa_disabled',
  'password_reset_sent',
  'user_invited',
  'user_created',
];

export const SETTINGS_ACTION_TYPES = [
  'Password updated',
  'email_prefs_updated',
  'google_linked',
  'totp_enabled',
  'totp_disabled',
  'yubikey_registered',
  'yubikey_removed',
  'primary_color_changed',
  'telegram_updated',
];

/**
 * Load action logs for the Settings page Action Log card.
 * Filters by entity = 'Settings', newest first.
 * @param {{ limit?: number, offset?: number }} opts
 */
export async function loadSettingsActionLogs(opts = {}) {
  if (!hasSupabase() || !supabase) return [];
  const limit = opts.limit ?? 200;
  const offset = opts.offset ?? 0;
  let query = supabase
    .from('audit_log')
    .select(
      'id, action, entity, entity_id, user_email, details, created_at, actor_type, agent_id, agent_name'
    )
    .eq('entity', 'Settings')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  let { data, error } = await query;
  if (error && isMissingColumnError(error)) {
    const legacy = await supabase
      .from('audit_log')
      .select('id, action, entity, entity_id, user_email, details, created_at')
      .eq('entity', 'Settings')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (legacy.error) throw legacy.error;
    data = (legacy.data || []).map((r) => ({
      ...r,
      actor_type: 'user',
      agent_id: null,
      agent_name: null,
    }));
    error = null;
  }
  if (error) throw error;
  return (data || []).map((r) => mapAuditRow(r));
}

/** Normalize any KB audit action into read | write | create | delete. */
function normalizeKbAction(action) {
  const a = String(action || '').toLowerCase();
  if (['read', 'write', 'create', 'delete'].includes(a)) return a;
  if (a.includes('add') || a.includes('import') || a.includes('creat')) return 'create';
  if (a.includes('delet')) return 'delete';
  if (a.includes('read') || a.includes('view')) return 'read';
  return 'write'; // updated / pinned / matched / etc.
}

/**
 * Load recent Knowledge Base documents for the Home "Data Operations" block.
 * Reads the real knowledge_documents (RLS-scoped by user_id), newest first, and
 * maps each doc to the table row shape
 * { id, type, action, agentName, agentPosition, agentId, user, date(ISO) }.
 * Agent-authored docs (owner_type='agent') resolve owner_id -> the agents table
 * for a real name + role, so the cell reads "Name (role)" and is clickable.
 * @param {{ limit?: number }} opts
 */
export async function loadKnowledgeOperations(opts = {}) {
  if (!hasSupabase() || !supabase) return [];
  const limit = opts.limit ?? 20;
  // Read the Knowledge Base documents directly (RLS-scoped by user_id) rather
  // than audit_log — KB writes don't reliably emit audit rows, so the real
  // docs (incl. agent-generated Osja lessons / reports during goal execution)
  // would otherwise never appear in the Home "Data Operations" block.
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select(
      'id, title, category, content_type, owner_type, owner_id, tags, metadata, created_at, updated_at'
    )
    .order('created_at', { ascending: false })
    .range(0, limit - 1);
  if (error) {
    console.warn('loadKnowledgeOperations:', error.message);
    return [];
  }
  const docs = data || [];

  // Resolve agent owner_ids -> { name, role } in one batched, RLS-scoped query
  // so agent-authored docs show a real "Name (role)" instead of a bare id.
  const agentIds = [
    ...new Set(docs.filter((d) => d.owner_type === 'agent' && d.owner_id).map((d) => d.owner_id)),
  ];
  let agentMap = {};
  if (agentIds.length) {
    const { data: ags, error: agErr } = await supabase
      .from('agents')
      .select('id, name, category')
      .in('id', agentIds);
    if (agErr) console.warn('loadKnowledgeOperations agents:', agErr.message);
    else agentMap = Object.fromEntries((ags || []).map((a) => [a.id, a]));
  }

  return docs.map((r) => {
    const isAgent = r.owner_type === 'agent';
    const ag = isAgent ? agentMap[r.owner_id] : null;
    // knowledge_documents only holds current docs (no read/delete events), so
    // the action is "create" on first write and "write" once edited afterwards.
    const edited =
      r.created_at &&
      r.updated_at &&
      new Date(r.updated_at).getTime() - new Date(r.created_at).getTime() > 1000;
    return {
      id: r.id,
      type: docToType(r),
      name: r.title || '',
      action: edited ? 'write' : 'create',
      agentName: isAgent ? ag?.name || r.metadata?.agent_name || 'Agent' : '',
      agentPosition: isAgent ? ag?.category || '' : '',
      agentId: isAgent ? r.owner_id || '' : '',
      user: '', // account email is injected by useHomeData (mirrors the demo path)
      date: r.created_at,
    };
  });
}

// A live table row only tells us "exists now" + when it was last touched, so the
// action is "create" until the row is edited meaningfully (>1s after insert),
// then "write". Same heuristic loadKnowledgeOperations uses.
function actionAndDate(createdAt, updatedAt) {
  const edited =
    createdAt && updatedAt && new Date(updatedAt).getTime() - new Date(createdAt).getTime() > 1000;
  return { action: edited ? 'write' : 'create', date: edited ? updatedAt : createdAt };
}

/**
 * Load recent AGENT operations for the Home "Activity" block (Agents tab).
 * Agents create Workflows/Tasks/Projects/Reports server-side during goal
 * execution, and those write paths don't emit audit_log rows — so
 * loadActivityOperations() (audit_log only) never sees them. We read the real
 * source tables directly (RLS-scoped), mirroring loadKnowledgeOperations, and
 * map each to the Activity row shape with personaKind='Agent'.
 *
 * Only create/write are derivable from a live row: deletes leave no row to read
 * and reads are never recorded, so those are out of scope here.
 * @param {{ limit?: number }} opts
 * @returns {Promise<Array<{id,instrument,action,personaName,personaPosition,personaKind,agentId,date}>>}
 */
export async function loadAgentOperations(opts = {}) {
  if (!hasSupabase() || !supabase) return [];
  const limit = opts.limit ?? 50;
  const ok = (res) => (res.status === 'fulfilled' && !res.value.error ? res.value.data || [] : []);
  const [tasksRes, reportsRes, workflowsRes, projectsRes] = await Promise.allSettled([
    supabase
      .from('team_tasks')
      .select('id, title, agent_id, assigned_to, created_by, created_at, updated_at')
      .order('created_at', { ascending: false })
      .range(0, limit - 1),
    supabase
      .from('concilium_agent_reports')
      .select('id, agent_id, report_type, summary, created_at')
      .order('created_at', { ascending: false })
      .range(0, limit - 1),
    // Workflows/Projects carry no agent id; a goal_id in `data` means the row was
    // produced by an agent during a goal run (vs created by hand in the UI).
    supabase
      .from('workflows')
      .select('id, name, data, created_at, updated_at')
      .not('data->>goal_id', 'is', null)
      .order('created_at', { ascending: false })
      .range(0, limit - 1),
    supabase
      .from('projects')
      .select('id, name, data, created_at, updated_at')
      .not('data->>goal_id', 'is', null)
      .order('created_at', { ascending: false })
      .range(0, limit - 1),
  ]);
  const tasks = ok(tasksRes);
  const reports = ok(reportsRes);
  const workflows = ok(workflowsRes);
  const projects = ok(projectsRes);

  // Resolve agent names in two batched, RLS-scoped lookups so rows read a real
  // "Name (role)": tasks reference the user's agent roster, reports reference
  // the concilium_agents table.
  const rosterIds = [...new Set(tasks.filter((t) => t.agent_id).map((t) => t.agent_id))];
  const conciliumIds = [...new Set(reports.filter((r) => r.agent_id).map((r) => r.agent_id))];
  let rosterMap = {};
  let conciliumMap = {};
  if (rosterIds.length) {
    const { data: ags } = await supabase
      .from('agents')
      .select('id, name, category')
      .in('id', rosterIds);
    rosterMap = Object.fromEntries((ags || []).map((a) => [a.id, a]));
  }
  if (conciliumIds.length) {
    const { data: cas } = await supabase
      .from('concilium_agents')
      .select('id, name')
      .in('id', conciliumIds);
    conciliumMap = Object.fromEntries((cas || []).map((a) => [a.id, a]));
  }

  const rows = [];
  for (const t of tasks) {
    const ag = t.agent_id ? rosterMap[t.agent_id] : null;
    rows.push({
      id: t.id,
      instrument: 'Tasks',
      ...actionAndDate(t.created_at, t.updated_at),
      personaName: ag?.name || t.assigned_to || t.created_by || 'Agent',
      personaPosition: ag?.category || 'Agent',
      personaKind: 'Agent',
      agentId: t.agent_id || '',
    });
  }
  for (const r of reports) {
    const ag = r.agent_id ? conciliumMap[r.agent_id] : null;
    rows.push({
      id: r.id,
      instrument: 'Reports',
      action: 'create', // reports are append-only
      personaName: ag?.name || 'Agent',
      personaPosition: 'Agent',
      personaKind: 'Agent',
      agentId: r.agent_id || '',
      date: r.created_at,
    });
  }
  // Workflows/Projects have no stored agent id, so attribute them to the planning
  // agent generically (no clickable agentId).
  for (const w of workflows) {
    rows.push({
      id: w.id,
      instrument: 'Workflow',
      ...actionAndDate(w.created_at, w.updated_at),
      personaName: 'Project Manager',
      personaPosition: 'Planning',
      personaKind: 'Agent',
      agentId: '',
    });
  }
  for (const p of projects) {
    rows.push({
      id: p.id,
      instrument: 'Projects',
      ...actionAndDate(p.created_at, p.updated_at),
      personaName: 'Project Manager',
      personaPosition: 'Planning',
      personaKind: 'Agent',
      agentId: '',
    });
  }
  rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return rows.slice(0, limit);
}

// audit_log `entity` -> Home "Activity" instrument label, grouped into the two
// buckets the Activity toggle filters by:
//   - Agents (execution): Workflow, Tasks, Projects, Reports, Jobs
//   - Human (platform management): everything else below
// Knowledge is intentionally excluded — it lives in the "Data Operations" block
// (which reads knowledge_documents directly), so it isn't duplicated here.
const ENTITY_INSTRUMENT = {
  // Agents — execution work produced while running goals.
  Workflow: 'Workflow',
  TeamTask: 'Tasks',
  Task: 'Tasks',
  Project: 'Projects',
  Report: 'Reports',
  Reports: 'Reports',
  Job: 'Jobs',
  // Human — platform management performed by the account owner.
  organization: 'Organizations',
  Organization: 'Organizations',
  Concilium: 'Consilium',
  ConciliumMember: 'Consilium',
  ConciliumCriteria: 'Consilium',
  Team: 'Teams',
  Agent: 'Agents',
  goal: 'Goals',
  Goal: 'Goals',
  Loop: 'Loops',
  Pulse: 'Pulse',
  Profile: 'Account',
  Settings: 'Account',
  user: 'Account',
  Tool: 'Tools',
  ApiKey: 'Keys',
  Llm: 'LLM',
  LlmProvider: 'LLM',
  Storage: 'Storage',
  Database: 'Database',
  Partner: 'Partners',
};
const ACTIVITY_ENTITIES = Object.keys(ENTITY_INSTRUMENT);

/**
 * Load recent cross-instrument operations for the Home "Activity" block.
 * Maps each audit row to { id, instrument, action, personaName, personaPosition,
 * personaKind, agentId, date(ISO) }. Persona is the ACTOR (agent when
 * actor_type='agent', otherwise the user).
 * @param {{ limit?: number }} opts
 */
export async function loadActivityOperations(opts = {}) {
  if (!hasSupabase() || !supabase) return [];
  const limit = opts.limit ?? 8;
  let { data, error } = await supabase
    .from('audit_log')
    .select(
      'id, action, entity, entity_id, user_email, details, created_at, actor_type, agent_id, agent_name'
    )
    .in('entity', ACTIVITY_ENTITIES)
    .order('created_at', { ascending: false })
    .range(0, limit - 1);
  if (error && isMissingColumnError(error)) {
    const legacy = await supabase
      .from('audit_log')
      .select('id, action, entity, entity_id, user_email, details, created_at')
      .in('entity', ACTIVITY_ENTITIES)
      .order('created_at', { ascending: false })
      .range(0, limit - 1);
    if (legacy.error) throw legacy.error;
    data = (legacy.data || []).map((r) => ({
      ...r,
      actor_type: 'user',
      agent_id: null,
      agent_name: null,
    }));
    error = null;
  }
  if (error) throw error;
  return (data || []).map((r) => {
    const mapped = mapAuditRow(r);
    const s = mapped.detailsStructured || {};
    const isAgent = mapped.actorType === 'agent' && !!mapped.agentName;
    return {
      id: mapped.id,
      instrument: ENTITY_INSTRUMENT[mapped.entity] || mapped.entity || '-',
      action: normalizeKbAction(mapped.action),
      personaName: isAgent ? mapped.agentName : mapped.user || 'User',
      personaPosition: isAgent ? s.role || s.position || 'Agent' : 'User',
      personaKind: isAgent ? 'Agent' : 'User',
      agentId: isAgent ? mapped.agentId || '' : '',
      date: mapped.timestamp,
    };
  });
}

/**
 * Load action logs used by the Permissions page.
 * This pulls directly from DB (audit_log), newest first.
 * @param {{ limit?: number, offset?: number, permissionsOnly?: boolean }} opts
 */
export async function loadPermissionsActionLogs(opts = {}) {
  if (!hasSupabase() || !supabase) return [];
  const limit = opts.limit ?? 250;
  const offset = opts.offset ?? 0;
  const permissionsOnly = opts.permissionsOnly ?? false;
  let query = supabase
    .from('audit_log')
    .select(
      'id, action, entity, entity_id, user_email, details, created_at, actor_type, agent_id, agent_name'
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (permissionsOnly) {
    query = query.in('action', PERMISSIONS_ACTION_TYPES);
  }
  let { data, error } = await query;
  if (error && isMissingColumnError(error)) {
    query = supabase
      .from('audit_log')
      .select('id, action, entity, entity_id, user_email, details, created_at')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (permissionsOnly) query = query.in('action', PERMISSIONS_ACTION_TYPES);
    const legacy = await query;
    if (legacy.error) throw legacy.error;
    data = (legacy.data || []).map((r) => ({
      ...r,
      actor_type: 'user',
      agent_id: null,
      agent_name: null,
    }));
    error = null;
  }
  if (error) throw error;
  return (data || []).map((r) => mapAuditRow(r));
}
