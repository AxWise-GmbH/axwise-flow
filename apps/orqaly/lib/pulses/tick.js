/**
 * Pulse tick — scan agent_pulses, fire each due pulse, record results.
 * Invoked by:
 *   /api/ops?path=pulse-tick (Supabase pg_cron → pg_net → POST)
 *   or by cron-job.org as a free fallback
 * Calls into lib/pulses/actions/<action>.js handlers.
 */
import { createLogger } from '../../api/_lib/logger.js';
import { ACTIONS } from './actions/index.js';
import { computeNextDue } from './schedule.js';

const log = createLogger('pulse.tick');

function parseCron(expr) {
  // Tiny cron parser — only supports the most common patterns the system
  // uses. For everything else we fall back to "fire every tick" so an
  // unparseable cron doesn't silently never fire.
  const presets = {
    '* * * * *': 60_000,
    '*/5 * * * *': 5 * 60_000,
    '*/15 * * * *': 15 * 60_000,
    '0 * * * *': 60 * 60_000,
    '0 0 * * *': 24 * 60 * 60_000,
    '0 3 * * *': 24 * 60 * 60_000,
  };
  return presets[expr] || 60_000;
}

async function fireOne(admin, pulse, { req } = {}) {
  const action = ACTIONS[pulse.action];
  const start = Date.now();
  if (!action) {
    log.warn(req, 'pulse.unknown-action', { pulseId: pulse.id, action: pulse.action });
    await admin.from('pulse_runs').insert({
      pulse_id: pulse.id, status: 'failed', outcome: { error: 'unknown action: ' + pulse.action },
    });
    return { status: 'failed', error: 'unknown action' };
  }

  try {
    const outcome = await action(admin, pulse, { req });
    const durationMs = Date.now() - start;
    await admin.from('pulse_runs').insert({
      pulse_id: pulse.id, status: outcome?.status || 'done', outcome, duration_ms: durationMs, job_id: outcome?.jobId || null,
    });

    // Advance the schedule.
    const meta = pulse.metadata || {};
    const update = { last_fired_at: new Date().toISOString() };
    if (meta.schedule_kind) {
      // New schedule model (Pulse UI / pulse.create tool).
      if (meta.schedule_kind === 'once') {
        // One-time pulse: disable after firing.
        update.enabled = false;
        update.next_due_at = null;
      } else {
        update.next_due_at = computeNextDue(meta.schedule_kind, meta, new Date());
      }
    } else {
      // Legacy cron-based pulses.
      update.next_due_at = pulse.trigger_type === 'time' && pulse.cron_expr
        ? new Date(Date.now() + parseCron(pulse.cron_expr)).toISOString()
        : null;
    }
    await admin.from('agent_pulses').update(update).eq('id', pulse.id);

    return { status: 'done', outcome };
  } catch (err) {
    log.warn(req, 'pulse.fire.failed', { pulseId: pulse.id, error: err.message });
    await admin.from('pulse_runs').insert({
      pulse_id: pulse.id, status: 'failed', outcome: { error: String(err.message || err).slice(0, 500) },
      duration_ms: Date.now() - start,
    });
    return { status: 'failed', error: err.message };
  }
}

/**
 * Scan and fire every due pulse. Stays under 60s by capping how many it
 * fires per tick. Time-based pulses use next_due_at; event/conditional
 * are evaluated by their own action handler.
 */
export async function tick(admin, { req, max = 25 } = {}) {
  const now = new Date().toISOString();
  const { data: pulses, error } = await admin
    .from('agent_pulses')
    .select('*')
    .eq('enabled', true)
    .or(`next_due_at.is.null,next_due_at.lte.${now}`)
    .order('priority', { ascending: false })
    .order('next_due_at', { ascending: true, nullsFirst: true })
    .limit(max);
  if (error) throw error;
  if (!pulses || pulses.length === 0) return { fired: 0, results: [] };

  const results = [];
  for (const pulse of pulses) {
    const r = await fireOne(admin, pulse, { req });
    results.push({ pulseId: pulse.id, action: pulse.action, ...r });
  }
  return { fired: results.length, results };
}

export { fireOne };
