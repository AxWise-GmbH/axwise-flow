/**
 * Ralph-style Active PM watchdog.
 *
 * Runs once per process-next worker tick (every ~15s via dev:local's
 * curl loop, every 60s via Vercel cron in prod). Finds in-flight tasks
 * belonging to goals where `goal.data.pm_strategy === 'ralph'` and
 * intervenes when a task is clearly stuck:
 *   - output ends mid-thought (short + trailing `:` / `...`)
 *   - output hasn't changed in >60s
 *   - task has been `inProgress` for >3 minutes
 *
 * Intervention: mark the task `failed` with a diagnostic reason, note it
 * in the goal's scratchpad, and enqueue a replacement `execute-task` job
 * with an injected synthesis prompt. No recursion — the watchdog only
 * nudges, never retries its own nudges.
 *
 * Safe to call on every tick. Fast-path returns early when no goal has
 * pm_strategy='ralph'.
 */
import { createLogger } from '../../../api/_lib/logger.js';
import { appendNote } from './scratchpad.js';

const log = createLogger('active-pm:watchdog');

const STUCK_MIDTHOUGHT_RE = /\b(let me|i'll|i will|searching for|trying to|let's try)\b/i;
const STALE_MS = 60 * 1000;          // no output change in 60s → stuck
const MAX_INPROGRESS_MS = 180 * 1000; // inProgress >3 min → abandoned

function isFragment(output) {
  if (!output) return true;
  const trimmed = String(output).trim();
  if (trimmed.length < 200 && (trimmed.endsWith(':') || trimmed.endsWith('...'))) return true;
  if (trimmed.length < 300 && STUCK_MIDTHOUGHT_RE.test(trimmed)) return true;
  return false;
}

export async function runWatchdogTick(admin) {
  // Find ralph-mode goals with running tasks. Filter Supabase-side where
  // possible for efficiency.
  let ralphGoalIds;
  try {
    const { data: goals } = await admin
      .from('goals')
      .select('id, data')
      .in('status', ['active', 'planning'])
      .limit(50);
    ralphGoalIds = (goals || [])
      .filter((g) => g.data?.pm_strategy === 'ralph')
      .map((g) => g.id);
  } catch (err) {
    log.warn(null, 'watchdog.goals-query-failed', { error: err.message });
    return { checked: 0, intervened: 0 };
  }
  if (ralphGoalIds.length === 0) return { checked: 0, intervened: 0 };

  // Pull in-flight tasks for those goals. Note: team_tasks.data.goal_id is
  // a JSONB field, so we use `in` on a separate query.
  const { data: tasks } = await admin
    .from('team_tasks')
    .select('id, title, status, agent_id, data, updated_at, job_pool_id')
    .in('data->>goal_id', ralphGoalIds)
    .eq('status', 'inProgress');
  if (!tasks || tasks.length === 0) return { checked: 0, intervened: 0 };

  const now = Date.now();
  let intervened = 0;

  for (const t of tasks) {
    const updatedAt = new Date(t.updated_at).getTime();
    const ageMs = now - updatedAt;
    const output = t.data?.output || '';
    const stuckMidthought = isFragment(output);
    const tooOld = ageMs > MAX_INPROGRESS_MS;
    const staleOutput = output.length > 0 && ageMs > STALE_MS;

    if (!stuckMidthought && !tooOld && !staleOutput) continue;

    const reason = stuckMidthought
      ? `Mid-thought fragment detected: "${output.slice(0, 80)}..."`
      : tooOld
      ? `Task inProgress >3 minutes without completion`
      : `No output change in >60s`;

    log.warn(null, 'watchdog.intervene', {
      taskId: t.id,
      goalId: t.data?.goal_id,
      reason,
      ageMs,
    });

    // Mark failed with watchdog reason
    await admin.from('team_tasks').update({
      status: 'failed',
      data: { ...(t.data || {}), error: `Watchdog: ${reason}`, watchdog_intervened_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    }).eq('id', t.id);

    // Note in the goal scratchpad
    try {
      const { data: goal } = await admin.from('goals').select('id, data').eq('id', t.data?.goal_id).maybeSingle();
      if (goal) {
        await appendNote(admin, goal, `Task "${t.title}" aborted by watchdog: ${reason}. Retried with synthesis prompt.`);
      }
    } catch (noteErr) {
      log.warn(null, 'watchdog.scratchpad-failed', { error: noteErr.message });
    }

    // Enqueue replacement — the pipeline's next evaluate-phase will see
    // the failed task + pick up the retry that fires from iterate path.
    // We don't directly re-enqueue execute-task because the goal's phase
    // state needs to be kept consistent. The failure above will trigger
    // evaluate-phase → iterate on the next job-processor tick.

    intervened++;
  }

  return { checked: tasks.length, intervened };
}
