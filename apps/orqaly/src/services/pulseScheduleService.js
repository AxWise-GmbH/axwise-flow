/**
 * pulseScheduleService — CRUD for scheduled "run-instruction" pulses.
 *
 * Pulses live in the existing `agent_pulses` table (RLS owner policy), so the
 * authenticated browser client can manage them directly. Each pulse is owned
 * by an agent / team / organization and runs an instruction (using an
 * instrument) on a schedule, fired by the pulse-tick engine.
 */
import { supabase, hasSupabase } from '../lib/supabase';
import { computeNextDue } from '../utils/pulseSchedule';
import { derivePulseOwnerFromGoal } from '../utils/pulseOwnerFromGoal';

const PULSE_ACTION = 'run-instruction';

const PULSE_PROMPTS = {
  same_team: 'Re-run with the same team and brief.',
  consilium: 'Fresh agent assignment via Consilium.',
};

async function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (hasSupabase()) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

function validateRepeatGoalEntry(e, i) {
  if (!e.source_goal_id) throw new Error(`Entry ${i + 1} needs a source goal`);
  const mode = e.repeat_mode || 'prompt_only';
  if (mode === 'consilium' && !e.concilium_id) {
    throw new Error(`Entry ${i + 1} needs a Consilium board`);
  }
}

async function currentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

/**
 * Read-side summary for a pulse's entries. Falls back to the legacy single
 * instruction/instrument shape so pulses created before multi-entry still render.
 * @returns {{ firstPrompt: string, count: number, instrumentSlugs: string[] }}
 */
export function summarizeEntries(meta = {}) {
  const entries =
    Array.isArray(meta.entries) && meta.entries.length
      ? meta.entries
      : meta.instruction
        ? [{ kind: 'instrument', instrument: meta.instrument || null, prompt: meta.instruction }]
        : [];

  const firstPrompt = entries[0]?.prompt || meta.instruction || '';
  const instrumentSlugs = entries.map((e) =>
    e.kind === 'repeat_goal' ? 'repeat-goal' : e.instrument?.slug || '--'
  );
  return { firstPrompt, count: entries.length, instrumentSlugs };
}

/** All run-instruction pulses for the current user, newest first. */
export async function listPulseSchedules() {
  if (!hasSupabase()) return [];
  const { data, error } = await supabase
    .from('agent_pulses')
    .select('*')
    .eq('action', PULSE_ACTION)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[pulseSchedule] list error:', error.message);
    return [];
  }
  return data || [];
}

/** Pulses owned by a specific entity (agent/team/organization). */
export async function listEntityPulses(ownerType, ownerId) {
  if (!hasSupabase() || !ownerType || !ownerId) return [];
  const { data, error } = await supabase
    .from('agent_pulses')
    .select('*')
    .eq('action', PULSE_ACTION)
    .eq('metadata->>owner_type', ownerType)
    .eq('metadata->>owner_id', String(ownerId))
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[pulseSchedule] listEntity error:', error.message);
    return [];
  }
  return data || [];
}

/** Run history/log for one pulse. */
export async function listPulseRuns(pulseId) {
  if (!hasSupabase() || !pulseId) return [];
  const { data, error } = await supabase
    .from('pulse_runs')
    .select('*')
    .eq('pulse_id', pulseId)
    .order('fired_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error('[pulseSchedule] runs error:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Create a scheduled pulse.
 * @param {object} input
 *   { ownerType, ownerId, ownerName,
 *     entries: [{ kind:'instrument', instrument:{slug,route}, prompt, ref } |
 *               { kind:'repeat_goal', source_goal_id, source_goal_title, prompt,
 *                 repeat_mode?: 'same_team'|'consilium'|'prompt_only', concilium_id? }],
 *     scheduleKind, runAt, timeOfDay, weekday, dayOfMonth }
 */
export async function createPulseSchedule(input) {
  if (!hasSupabase()) throw new Error('Supabase not configured');
  const user = await currentUser();
  if (!user?.id) throw new Error('Not authenticated');

  const {
    ownerType,
    ownerId,
    ownerName,
    entries,
    scheduleKind,
    runAt,
    timeOfDay,
    weekday,
    dayOfMonth,
  } = input;

  if (!Array.isArray(entries) || !entries.length) throw new Error('At least one entry is required');
  if (!ownerType || !ownerId) throw new Error('Owner is required');
  entries.forEach((e, i) => {
    if (!e.prompt?.trim()) throw new Error(`Entry ${i + 1} needs a prompt`);
    if (e.kind === 'instrument' && !e.instrument?.slug)
      throw new Error(`Entry ${i + 1} needs an instrument`);
    if (e.kind === 'repeat_goal') validateRepeatGoalEntry(e, i);
  });

  const scheduleOpts = {
    run_at: runAt || null,
    time_of_day: timeOfDay || '09:00',
    weekday: typeof weekday === 'number' ? weekday : undefined,
    day_of_month: dayOfMonth || undefined,
  };
  const nextDueAt = computeNextDue(scheduleKind, scheduleOpts, new Date());

  const firstEntry = entries[0];
  const createdByName =
    user.user_metadata?.full_name || user.user_metadata?.name || user.email || '';

  const metadata = {
    owner_type: ownerType,
    owner_id: String(ownerId),
    owner_name: ownerName || '',
    created_by_name: createdByName,
    entries,
    // Legacy single-field mirror (first entry) so older readers keep working.
    instruction: firstEntry.prompt?.trim() || '',
    instrument:
      firstEntry.kind === 'instrument' && firstEntry.instrument
        ? { slug: firstEntry.instrument.slug, route: firstEntry.instrument.route }
        : null,
    schedule_kind: scheduleKind,
    run_at: runAt || null,
    time_of_day: timeOfDay || null,
    weekday: typeof weekday === 'number' ? weekday : null,
    day_of_month: dayOfMonth || null,
  };

  const { data, error } = await supabase
    .from('agent_pulses')
    .insert({
      user_id: user.id,
      agent_role: ownerType,
      trigger_type: 'time',
      action: PULSE_ACTION,
      priority: 5,
      enabled: true,
      next_due_at: nextDueAt,
      metadata,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Create a goal-initiated pulse (same_team / consilium repeat_goal entry).
 */
export async function createGoalPulseSchedule({
  goal,
  mode,
  conciliumId,
  scheduleKind = 'once',
  runAt = null,
  timeOfDay = '09:00',
  weekday,
  dayOfMonth,
}) {
  if (!goal?.id) throw new Error('Goal is required');
  if (!['same_team', 'consilium'].includes(mode)) throw new Error('Invalid pulse mode');

  const owner = derivePulseOwnerFromGoal(goal);
  if (!owner?.ownerId) throw new Error('Could not determine pulse owner');

  const entry = {
    kind: 'repeat_goal',
    source_goal_id: goal.id,
    source_goal_title: goal.title || '',
    prompt: PULSE_PROMPTS[mode],
    repeat_mode: mode,
  };
  if (mode === 'consilium') entry.concilium_id = conciliumId || goal.concilium_id || undefined;

  return createPulseSchedule({
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    ownerName: owner.ownerName,
    entries: [entry],
    scheduleKind,
    runAt,
    timeOfDay,
    weekday,
    dayOfMonth,
  });
}

/** Fire a pulse immediately (authenticated API — avoids waiting for pulse-tick). */
export async function firePulseNow(pulseId) {
  if (!pulseId) throw new Error('pulseId is required');
  const headers = await getAuthHeaders();
  const res = await fetch(
    `${typeof window !== 'undefined' ? window.location.origin : ''}/api/app?path=pulses&op=fire-now`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ pulseId }),
    }
  );
  const raw = await res.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    /* non-JSON */
  }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function togglePulseSchedule(id, enabled) {
  if (!hasSupabase()) throw new Error('Supabase not configured');
  const { error } = await supabase.from('agent_pulses').update({ enabled }).eq('id', id);
  if (error) throw new Error(error.message);
  return true;
}

export async function deletePulseSchedule(id) {
  if (!hasSupabase()) throw new Error('Supabase not configured');
  const { error } = await supabase.from('agent_pulses').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return true;
}
