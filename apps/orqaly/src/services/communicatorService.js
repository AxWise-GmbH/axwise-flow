/**
 * Communicator Service — communication_logs, communication_channels, agent_personas
 * Supabase-first with localStorage fallback.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { stripPersistedCredentials } from './persistedCredentialSanitizer';

const LS_LOGS = 'communicator_logs';
const LS_CHANNELS = 'communicator_channels';
const LS_PERSONAS = 'communicator_personas';

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const clean = stripPersistedCredentials(parsed);
    if (JSON.stringify(clean) !== JSON.stringify(parsed)) {
      localStorage.setItem(key, JSON.stringify(clean));
    }
    return clean;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(stripPersistedCredentials(value)));
  } catch {
    /* ignore */
  }
}

// ─── communication_logs ────────────────────────────────────────────────────

/**
 * Recent agent-room messages (goal_messages) for the Home "Communicator Live
 * Chat" block. These are the real agent/consilium/system conversations shown on
 * the Communicator page; RLS scopes goal_messages to the user's own goals.
 * Returns [] when supabase is unavailable.
 */
export async function getRecentAgentMessages(limit = 8) {
  if (!hasSupabase()) return [];
  const { data, error } = await supabase
    .from('goal_messages')
    .select('id, goal_id, sender_name, sender_agent_id, channel, message, message_type, created_at')
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('getRecentAgentMessages:', error.message);
    return [];
  }
  return data || [];
}

export async function getLogs(filters = {}) {
  if (hasSupabase()) {
    let q = supabase
      .from('communication_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (filters.context_type && filters.context_type !== 'all')
      q = q.eq('context_type', filters.context_type);
    if (filters.platform && filters.platform !== 'all') q = q.eq('platform', filters.platform);
    if (filters.sender_id) q = q.eq('sender_id', filters.sender_id);
    if (filters.date_from) q = q.gte('created_at', filters.date_from);
    if (filters.date_to) q = q.lte('created_at', filters.date_to);
    if (filters.search) q = q.ilike('content', `%${filters.search}%`);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
  }
  let items = loadJson(LS_LOGS, []);
  if (filters.context_type && filters.context_type !== 'all')
    items = items.filter((i) => i.context_type === filters.context_type);
  if (filters.platform && filters.platform !== 'all')
    items = items.filter((i) => i.platform === filters.platform);
  if (filters.search)
    items = items.filter((i) => i.content?.toLowerCase().includes(filters.search.toLowerCase()));
  return items;
}

export async function addLog(log) {
  const row = {
    thread_id: log.thread_id || crypto.randomUUID(),
    sender_type: log.sender_type || 'system',
    sender_id: log.sender_id || null,
    sender_name: log.sender_name || '',
    content: log.content || '',
    context_type: log.context_type || 'general',
    context_id: log.context_id || null,
    context_label: log.context_label || '',
    platform: log.platform || 'internal',
    metadata: log.metadata || {},
  };

  if (hasSupabase()) {
    const { data, error } = await supabase
      .from('communication_logs')
      .insert(row)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const newItem = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
  const items = [newItem, ...loadJson(LS_LOGS, [])];
  saveJson(LS_LOGS, items);
  return newItem;
}

export async function deleteLog(id) {
  if (hasSupabase()) {
    const { error } = await supabase.from('communication_logs').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  const items = loadJson(LS_LOGS, []).filter((i) => i.id !== id);
  saveJson(LS_LOGS, items);
}

// ─── communication_channels ────────────────────────────────────────────────

export async function getChannels() {
  if (hasSupabase()) {
    const { data, error } = await supabase
      .from('communication_channels')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }
  return loadJson(LS_CHANNELS, []);
}

export async function addChannel(channel) {
  const row = {
    platform: channel.platform,
    name: channel.name || '',
    config: channel.config || {},
    status: channel.status || 'inactive',
    connected_by: channel.connected_by || null,
    last_active: null,
  };

  if (hasSupabase()) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    row.connected_by = user?.id ?? null;

    // Single-channel-per-platform: when inserting an ACTIVE channel,
    // deactivate any pre-existing active row for this (user, platform)
    // pair. Matches the Telegram enforcement in lib/communicator-handlers/
    // link-code.js so behavior is consistent across both insert paths.
    if (row.status === 'active' && row.connected_by && row.platform) {
      await supabase
        .from('communication_channels')
        .update({ status: 'inactive' })
        .eq('connected_by', row.connected_by)
        .eq('platform', row.platform)
        .eq('status', 'active')
        .then(
          () => {},
          () => {}
        );
    }

    const { data, error } = await supabase
      .from('communication_channels')
      .insert(row)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const newItem = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
  const items = [newItem, ...loadJson(LS_CHANNELS, [])];
  saveJson(LS_CHANNELS, items);
  return newItem;
}

export async function updateChannel(id, updates) {
  if (hasSupabase()) {
    const { data, error } = await supabase
      .from('communication_channels')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const items = loadJson(LS_CHANNELS, []).map((i) => (i.id === id ? { ...i, ...updates } : i));
  saveJson(LS_CHANNELS, items);
  return items.find((i) => i.id === id);
}

export async function deleteChannel(id) {
  if (hasSupabase()) {
    const { error } = await supabase.from('communication_channels').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  const items = loadJson(LS_CHANNELS, []).filter((i) => i.id !== id);
  saveJson(LS_CHANNELS, items);
}

// ─── agent_personas ────────────────────────────────────────────────────────

export async function getPersonas() {
  if (hasSupabase()) {
    const { data, error } = await supabase
      .from('agent_personas')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  }
  return loadJson(LS_PERSONAS, []);
}

export async function addPersona(persona) {
  const row = {
    agent_id: persona.agent_id,
    platform: persona.platform || 'telegram',
    persona_name: persona.persona_name || '',
    bot_token: persona.bot_token || '',
    bot_username: persona.bot_username || '',
    status: 'inactive',
  };

  if (hasSupabase()) {
    const { data, error } = await supabase.from('agent_personas').insert(row).select('*').single();
    if (error) throw new Error(error.message);
    return data;
  }
  const newItem = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
  const items = [newItem, ...loadJson(LS_PERSONAS, [])];
  saveJson(LS_PERSONAS, items);
  return newItem;
}

export async function updatePersona(id, updates) {
  if (hasSupabase()) {
    const { data, error } = await supabase
      .from('agent_personas')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const items = loadJson(LS_PERSONAS, []).map((i) => (i.id === id ? { ...i, ...updates } : i));
  saveJson(LS_PERSONAS, items);
  return items.find((i) => i.id === id);
}

export async function deletePersona(id) {
  if (hasSupabase()) {
    const { error } = await supabase.from('agent_personas').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return;
  }
  const items = loadJson(LS_PERSONAS, []).filter((i) => i.id !== id);
  saveJson(LS_PERSONAS, items);
}

/** Validate a Telegram bot token by calling getMe and return the bot info. */
export async function validateTelegramToken(token) {
  const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const json = await res.json();
  if (!json.ok) throw new Error(json.description || 'Invalid token');
  return json.result; // { id, first_name, username, ... }
}

// ─── API helper ────────────────────────────────────────────────────────────

function getBase() {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return import.meta.env.VITE_API_BASE || '';
  }
  return '';
}

async function apiFetch(path, opts = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${getBase()}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ─── Agent Room ────────────────────────────────────────────────────────────

export async function getAgentRooms(filters = {}) {
  const params = new URLSearchParams({ op: 'rooms' });
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.search) params.set('search', filters.search);
  const data = await apiFetch(`/api/communicator/agent-room?${params}`);
  return data.rooms || [];
}

export async function getAgentRoomMessages(goalId, channel = null) {
  const params = new URLSearchParams({ op: 'messages', goalId });
  if (channel && channel !== 'all') params.set('channel', channel);
  const data = await apiFetch(`/api/communicator/agent-room?${params}`);
  return data.messages || [];
}

export async function getAgentActivity(filters = {}) {
  const params = new URLSearchParams({ op: 'agent-activity' });
  if (filters.context_type && filters.context_type !== 'all')
    params.set('context_type', filters.context_type);
  if (filters.date_from) params.set('date_from', filters.date_from);
  if (filters.date_to) params.set('date_to', filters.date_to);
  if (filters.search) params.set('search', filters.search);
  const data = await apiFetch(`/api/communicator/agent-room?${params}`);
  return data.logs || [];
}

// ─── Controller ────────────────────────────────────────────────────────────

export async function executeCommand(input, platform = 'internal') {
  const data = await apiFetch('/api/communicator/controller?op=execute', {
    method: 'POST',
    body: JSON.stringify({ input, platform }),
  });
  return data;
}

export async function getCommandHistory() {
  const data = await apiFetch('/api/communicator/controller?op=history');
  return data.commands || [];
}

// ─── Consilium Log ─────────────────────────────────────────────────────────

export async function getEvaluations(filters = {}) {
  const params = new URLSearchParams({ op: 'list' });
  if (filters.boardId) params.set('boardId', filters.boardId);
  if (filters.approved !== undefined && filters.approved !== null && filters.approved !== 'all') {
    params.set('approved', String(filters.approved));
  }
  if (filters.decisionLevel && filters.decisionLevel !== 'all')
    params.set('decisionLevel', filters.decisionLevel);
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.search) params.set('search', filters.search);
  const data = await apiFetch(`/api/communicator/consilium-log?${params}`);
  return data.evaluations || [];
}

export async function getEvaluationDetail(id) {
  const data = await apiFetch(`/api/communicator/consilium-log?op=detail&id=${id}`);
  return data.evaluation || null;
}

export async function getDecisionAnalytics() {
  const data = await apiFetch('/api/communicator/consilium-log?op=analytics');
  return data;
}

// ─── Link Code (shared-bot onboarding) ─────────────────────────────────────

/** Generate a 6-char Telegram link code (10-min TTL). */
export async function startTelegramLink() {
  return apiFetch('/api/communicator/link-code', {
    method: 'POST',
    body: JSON.stringify({ action: 'start' }),
  });
}

/** Poll whether a code has been redeemed. status: 'pending' | 'linked' | 'expired' | 'unknown' */
export async function pollTelegramLink(code) {
  return apiFetch('/api/communicator/link-code', {
    method: 'POST',
    body: JSON.stringify({ action: 'status', code }),
  });
}

/** Cancel a pending link code (best-effort). */
export async function cancelTelegramLink(code) {
  return apiFetch('/api/communicator/link-code', {
    method: 'POST',
    body: JSON.stringify({ action: 'cancel', code }),
  });
}

// ─── Telegram setWebhook (BYO bot + admin shared-bot setup) ────────────────

/** Register the webhook for a BYO Telegram channel. */
export async function registerTelegramWebhook(channelId) {
  return apiFetch('/api/communicator/telegram-register', {
    method: 'POST',
    body: JSON.stringify({ action: 'register', channelId }),
  });
}

export async function unregisterTelegramWebhook(channelId) {
  return apiFetch('/api/communicator/telegram-register', {
    method: 'POST',
    body: JSON.stringify({ action: 'unregister', channelId }),
  });
}

/** Admin-only: register/unregister the platform-shared bot. */
export async function setupSharedBot(action = 'register') {
  return apiFetch('/api/communicator/telegram-register', {
    method: 'POST',
    body: JSON.stringify({ action, scope: 'shared' }),
  });
}

// ─── Channel personality (Phase 5d) ────────────────────────────────────────

export const PERSONALITY_OPTIONS = [
  { value: 'professional', label: 'Professional', helper: 'Concise, formal, business tone.' },
  { value: 'friendly', label: 'Friendly', helper: 'Warm, casual, light emoji.' },
  { value: 'technical', label: 'Technical', helper: 'Precise, factual, jargon-friendly.' },
  { value: 'creative', label: 'Creative', helper: 'Playful, expressive, decorative.' },
  { value: 'minimal', label: 'Minimal', helper: 'One-line replies, no filler.' },
];

// ─── Phase 5e — Settings ────────────────────────────────────────────────────

export const NOTIFICATION_EVENTS = [
  {
    key: 'goal.completed',
    label: 'Goal completed',
    description: 'Ping me when a goal finishes successfully.',
  },
  { key: 'goal.failed', label: 'Goal failed', description: 'Ping me when a goal fails.' },
  {
    key: 'goal.self_heal',
    label: 'Auto-healing',
    description: 'Ping me when self-heal kicks in on a stuck goal.',
  },
  {
    key: 'goal.awaiting_user',
    label: 'Awaiting input',
    description: 'Ping me when a goal pauses for my input.',
  },
  {
    key: 'daily.digest',
    label: 'Daily digest',
    description: 'Send me a scheduled daily summary (configure schedule separately).',
  },
  {
    key: 'stranger.threshold',
    label: 'Stranger spike',
    description: 'Admin-only: alert me when >5 unknown users DM the bot in an hour.',
    adminOnly: true,
  },
];

async function getCurrentUserRow(columns = 'id') {
  if (!hasSupabase()) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('users')
    .select(columns)
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { ...data, _id: user.id } : { _id: user.id };
}

export async function getNotificationPrefs() {
  const row = await getCurrentUserRow('notification_prefs');
  return row?.notification_prefs || {};
}

export async function setNotificationPrefs(prefs) {
  if (!hasSupabase()) throw new Error('Supabase not configured');
  const row = await getCurrentUserRow('id');
  const { error } = await supabase
    .from('users')
    .update({ notification_prefs: prefs })
    .eq('id', row._id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function getSpendCap() {
  const row = await getCurrentUserRow('daily_llm_cap_usd');
  return row?.daily_llm_cap_usd ?? null;
}

export async function setSpendCap(usd) {
  if (!hasSupabase()) throw new Error('Supabase not configured');
  const row = await getCurrentUserRow('id');
  const cap = usd === '' || usd == null ? null : Number(usd);
  const { error } = await supabase
    .from('users')
    .update({ daily_llm_cap_usd: cap })
    .eq('id', row._id);
  if (error) throw new Error(error.message);
  return { ok: true, cap };
}

export const REPLY_TEMPLATE_TYPES = [
  { key: 'goal_created', label: 'Goal created', buttons: ['view', 'cancel'] },
  { key: 'list_result', label: 'List results', buttons: ['view'] },
  {
    key: 'push_goal_done',
    label: 'Goal completed push',
    buttons: ['view', 'snooze_1h', 'dismiss'],
  },
  { key: 'push_goal_failed', label: 'Goal failed push', buttons: ['view', 'dismiss'] },
  { key: 'scheduled_report', label: 'Scheduled report', buttons: ['view', 'run_now', 'pause'] },
];

export const REPLY_BUTTONS = {
  view: { label: '🔗 View', description: 'Open in app' },
  cancel: { label: '✕ Cancel', description: 'Cancel the entity' },
  snooze_1h: { label: '😴 Snooze 1h', description: 'Pause notifications for 1 hour' },
  dismiss: { label: 'Dismiss', description: 'Acknowledge without action' },
  run_now: { label: '▶ Run now', description: 'Trigger immediately' },
  pause: { label: '⏸ Pause', description: 'Pause/resume' },
};

export async function getReplyTemplates() {
  const row = await getCurrentUserRow('reply_templates');
  return row?.reply_templates || {};
}

export async function setReplyTemplates(templates) {
  if (!hasSupabase()) throw new Error('Supabase not configured');
  const row = await getCurrentUserRow('id');
  const { error } = await supabase
    .from('users')
    .update({ reply_templates: templates })
    .eq('id', row._id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function getUserRole() {
  const row = await getCurrentUserRow('role');
  return row?.role || 'member';
}

// ─── Files (Phase 5e — list of past uploads) ────────────────────────────────

export async function getCommunicatorFiles({ limit = 50 } = {}) {
  if (!hasSupabase()) return [];
  const { data, error } = await supabase
    .from('communicator_files')
    .select(
      'id, filename, mime_type, size_bytes, extraction_method, extracted_text, created_at, expires_at, storage_path'
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function deleteCommunicatorFile(id) {
  if (!hasSupabase()) throw new Error('Supabase not configured');
  const { data: row } = await supabase
    .from('communicator_files')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle();
  if (row?.storage_path) {
    await supabase.storage
      .from('communicator-uploads')
      .remove([row.storage_path])
      .then(
        () => {},
        () => {}
      );
  }
  const { error } = await supabase.from('communicator_files').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function getCommunicatorFileUrl(id) {
  if (!hasSupabase()) throw new Error('Supabase not configured');
  const { data: row } = await supabase
    .from('communicator_files')
    .select('storage_path')
    .eq('id', id)
    .maybeSingle();
  if (!row) throw new Error('File not found');
  const { data, error } = await supabase.storage
    .from('communicator-uploads')
    .createSignedUrl(row.storage_path, 300);
  if (error) throw new Error(error.message);
  return data?.signedUrl;
}

// ─── Scheduled reports (Phase 5e — Pulse rows) ──────────────────────────────

const SCHEDULE_PRESETS = [
  { label: 'Daily at 08:00 UTC', cron: '0 8 * * *' },
  { label: 'Daily at 18:00 UTC', cron: '0 18 * * *' },
  { label: 'Mon at 09:00 UTC', cron: '0 9 * * 1' },
  { label: '1st of month 08:00 UTC', cron: '0 8 1 * *' },
  { label: 'Every 5 min (test)', cron: '*/5 * * * *' },
];

export function scheduleCronPresets() {
  return SCHEDULE_PRESETS;
}

export async function getScheduledReports() {
  if (!hasSupabase()) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('agent_pulses')
    .select('*')
    .eq('user_id', user.id)
    .eq('action', 'scheduled-report')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createScheduledReport({
  reportType = 'executive',
  cron = '0 8 * * *',
  label = '',
}) {
  if (!hasSupabase()) throw new Error('Supabase not configured');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('agent_pulses')
    .insert({
      user_id: user.id,
      agent_role: 'reporting',
      trigger_type: 'time',
      cron_expr: cron,
      action: 'scheduled-report',
      enabled: true,
      metadata: { report_type: reportType, label: label || `${reportType} report` },
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateScheduledReport(id, patch) {
  if (!hasSupabase()) throw new Error('Supabase not configured');
  const { error } = await supabase.from('agent_pulses').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function deleteScheduledReport(id) {
  if (!hasSupabase()) throw new Error('Supabase not configured');
  const { error } = await supabase.from('agent_pulses').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function runScheduledReportNow(id) {
  if (!hasSupabase()) throw new Error('Supabase not configured');
  const { error } = await supabase
    .from('agent_pulses')
    .update({ next_due_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// ─── Strangers (Phase 5e — admin only) ──────────────────────────────────────

export async function getStrangers({ limit = 50 } = {}) {
  if (!hasSupabase()) return [];
  const { data, error } = await supabase
    .from('communicator_strangers')
    .select('*')
    .order('last_seen_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function ignoreStranger(id) {
  if (!hasSupabase()) throw new Error('Supabase not configured');
  const { error } = await supabase.from('communicator_strangers').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// ─── Personality (already added in Phase 5d) ────────────────────────────────

/** Update a Telegram channel's personality (merges into config jsonb). */
export async function setChannelPersonality(channelId, personality) {
  if (!hasSupabase()) throw new Error('Supabase not configured');
  const { data: ch, error: e1 } = await supabase
    .from('communication_channels')
    .select('config')
    .eq('id', channelId)
    .single();
  if (e1) throw new Error(e1.message);
  const nextConfig = { ...(ch.config || {}), personality };
  const { error: e2 } = await supabase
    .from('communication_channels')
    .update({ config: nextConfig })
    .eq('id', channelId);
  if (e2) throw new Error(e2.message);
  return { ok: true, personality };
}

// ─── Activity Feed ──────────────────────────────────────────────────────────

export async function getActivityFeed(filters = {}) {
  const params = new URLSearchParams({ op: 'list' });
  if (filters.source && filters.source !== 'all') params.set('source', filters.source);
  if (filters.severity && filters.severity !== 'all') params.set('severity', filters.severity);
  if (filters.goalId) params.set('goal_id', filters.goalId);
  if (filters.limit) params.set('limit', String(filters.limit));
  const data = await apiFetch(`/api/communicator/activity-feed?${params}`);
  return data.events || [];
}

// ─── Organization communication ─────────────────────────────────────────────

export async function getOrgCommunicationTimeline(orgId, limit = 150) {
  const params = new URLSearchParams({ op: 'timeline', orgId, limit: String(limit) });
  return apiFetch(`/api/communicator/org-communication?${params}`);
}
