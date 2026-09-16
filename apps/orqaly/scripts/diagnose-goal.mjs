#!/usr/bin/env node
/**
 * Diagnose a goal end-to-end: prints full timeline (goal row, events, jobs,
 * tasks, spend, budget requests) and classifies the failure vector.
 *
 * Usage:
 *   node scripts/diagnose-goal.mjs <id-or-title-substring>
 *
 * Examples:
 *   node scripts/diagnose-goal.mjs "black man sock"
 *   node scripts/diagnose-goal.mjs 3f8b2c10-...-uuid
 */
import { admin } from './_lib/admin-client.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtTime(ts) {
  if (!ts) return '           ';
  return new Date(ts).toISOString().replace('T', ' ').replace(/\..+/, '');
}

function section(title) {
  console.log('');
  console.log('='.repeat(72));
  console.log(' ' + title);
  console.log('='.repeat(72));
}

function classify(goal, events, jobs, tasks) {
  const status = goal.status;
  const reason = goal.data?.failure_reason || '';
  const lastJobError = jobs.slice(-1)[0]?.error || '';
  const lastEvent = events.slice(-1)[0];
  const now = Date.now();
  const ageMin = Math.round((now - new Date(goal.updated_at).getTime()) / 60000);

  if (status === 'completed') return 'COMPLETED — deliverables should be in goal.data';
  if (status === 'cancelled') return 'CANCELLED — user cancelled';
  if (status === 'needs_human') return 'NEEDS_HUMAN — healer escalated; see data.healing_log';

  if (status === 'failed') {
    if (/ECONNRESET|ETIMEDOUT|5\d\d|rate.?limit|overloaded|network|fetch failed|timed out/i.test(reason + lastJobError))
      return 'FAILED/transient — healer h01 would recover';
    if (/parse|JSON|invalid response/i.test(reason + lastJobError))
      return 'FAILED/llm-json-parse — healer h02 would recover';
    if (/no jobs found/i.test(reason + lastJobError))
      return 'FAILED/no-jobs — healer h03 would re-form team';
    if (!reason || reason === 'Job processing failed')
      return 'FAILED/opaque — PRE-FIX BUG: real error was dropped by job-processor.js:864. After Phase 2.1 this will carry a real reason.';
    return `FAILED — reason: ${reason.slice(0, 200)}`;
  }

  if (status === 'awaiting_tools') {
    const missing = goal.data?.unconfigured_tools || [];
    return `AWAITING_TOOLS — missing: ${missing.join(', ') || '(none recorded)'}`;
  }
  if (status === 'awaiting_approval') return 'AWAITING_APPROVAL — user must approve proposal';
  if (status === 'awaiting_po_input') return 'AWAITING_PO_INPUT — expert mode PO questions pending';
  if (status === 'paused') return `PAUSED — ${goal.data?.pause_reason || '(no reason)'}`;

  // Non-terminal, possibly stuck
  const queuedJobs = jobs.filter(j => j.status === 'queued' || j.status === 'running').length;
  if (queuedJobs === 0 && ageMin > 5)
    return `STUCK — status=${status}, no queued/running jobs, ${ageMin}min old. Healer h04 would recover.`;

  return `IN PROGRESS — status=${status}, ${queuedJobs} job(s) in flight, last event: ${lastEvent?.event_type || 'none'}`;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node scripts/diagnose-goal.mjs <id-or-title-substring>');
    process.exit(1);
  }

  // 1. Find goal(s)
  let query = admin
    .from('goals')
    .select('id, user_id, title, status, mode, iteration, max_iterations, budget_usd, spent_usd, created_at, updated_at, data, plan')
    .order('created_at', { ascending: false })
    .limit(5);

  query = UUID_RE.test(arg) ? query.eq('id', arg) : query.ilike('title', `%${arg}%`);

  const { data: goals, error: goalsErr } = await query;
  if (goalsErr) {
    console.error('Goal lookup failed:', goalsErr.message);
    process.exit(1);
  }
  if (!goals || goals.length === 0) {
    console.log(`No goal found matching "${arg}".`);
    process.exit(0);
  }

  if (goals.length > 1) {
    console.log(`Found ${goals.length} goals matching "${arg}":`);
    for (const g of goals) {
      console.log(`  ${g.id}  ${g.status.padEnd(20)}  ${fmtTime(g.created_at)}  ${g.title}`);
    }
    console.log('\nShowing most recent:\n');
  }

  const goal = goals[0];

  section('GOAL');
  console.log(`id:          ${goal.id}`);
  console.log(`title:       ${goal.title}`);
  console.log(`status:      ${goal.status}`);
  console.log(`mode:        ${goal.mode}`);
  console.log(`iteration:   ${goal.iteration} / ${goal.max_iterations}`);
  console.log(`budget:      $${goal.spent_usd} / $${goal.budget_usd}`);
  console.log(`created:     ${fmtTime(goal.created_at)}`);
  console.log(`updated:     ${fmtTime(goal.updated_at)}`);
  if (goal.data?.failure_reason) console.log(`fail reason: ${goal.data.failure_reason}`);
  if (goal.data?.failure_stage)  console.log(`fail stage:  ${goal.data.failure_stage}`);
  if (goal.data?.unconfigured_tools?.length)
    console.log(`missing tools: ${goal.data.unconfigured_tools.join(', ')}`);
  if (goal.data?.heal_attempts)  console.log(`heal attempts: ${goal.data.heal_attempts}`);
  if (goal.plan?.phases) {
    console.log(`phases:      ${goal.plan.phases.length}`);
    for (const [i, p] of goal.plan.phases.entries()) {
      console.log(`  [${i}] ${(p.status || 'pending').padEnd(10)} ${p.name || p.title || '(untitled)'}`);
    }
  }

  // 2. goal_log
  section('EVENT LOG');
  const { data: events = [] } = await admin
    .from('goal_log')
    .select('created_at, event_type, details, cost_usd')
    .eq('goal_id', goal.id)
    .order('created_at', { ascending: true });
  if (events.length === 0) {
    console.log('(no events)');
  } else {
    for (const e of events) {
      const cost = e.cost_usd > 0 ? ` $${Number(e.cost_usd).toFixed(4)}` : '';
      const detail = e.details?.reason || e.details?.action || e.details?.phase_index !== undefined
        ? ` — ${JSON.stringify(e.details).slice(0, 200)}`
        : '';
      console.log(`${fmtTime(e.created_at)}  ${e.event_type.padEnd(22)}${cost}${detail}`);
    }
  }

  // 3. agent_jobs
  section('AGENT JOBS');
  const { data: jobs = [] } = await admin
    .from('agent_jobs')
    .select('id, status, retry_count, error, payload, created_at, updated_at')
    .filter('payload->>goalId', 'eq', goal.id)
    .order('created_at', { ascending: true });
  if (jobs.length === 0) {
    console.log('(no jobs for this goalId in payload)');
  } else {
    for (const j of jobs) {
      const action = j.payload?.action || j.payload?.type || '?';
      const err = j.error ? ` ERROR: ${j.error.slice(0, 150)}` : '';
      console.log(`${fmtTime(j.created_at)}  ${j.status.padEnd(8)} retry=${j.retry_count || 0}  ${action.padEnd(20)}${err}`);
    }
  }

  // 4. team_tasks
  section('TEAM TASKS');
  const { data: tasks = [] } = await admin
    .from('team_tasks')
    .select('id, title, status, data, updated_at')
    .or(`goal_id.eq.${goal.id},data->>goal_id.eq.${goal.id}`)
    .order('updated_at', { ascending: true });
  if (tasks.length === 0) {
    console.log('(no tasks)');
  } else {
    for (const t of tasks) {
      const type = t.data?.deliverable_type || '-';
      const phase = t.data?.phase_index ?? '-';
      const err = t.data?.error ? ` ERROR: ${String(t.data.error).slice(0, 120)}` : '';
      console.log(`${fmtTime(t.updated_at)}  ${t.status.padEnd(12)} p${phase} ${type.padEnd(10)} ${(t.title || '').slice(0, 60)}${err}`);
    }
  }

  // 5. financial_events
  section('SPEND');
  const { data: spend = [] } = await admin
    .from('financial_events')
    .select('source, amount_usd, description, metadata, created_at')
    .eq('goal_id', goal.id)
    .order('created_at', { ascending: true });
  if (spend.length === 0) {
    console.log('(no spend)');
  } else {
    let total = 0;
    for (const s of spend) {
      total += Number(s.amount_usd || 0);
      console.log(`${fmtTime(s.created_at)}  $${Number(s.amount_usd).toFixed(4).padStart(10)}  ${(s.source || '').padEnd(20)} ${(s.description || '').slice(0, 60)}`);
    }
    console.log(`${' '.repeat(21)}TOTAL: $${total.toFixed(4)}`);
  }

  // 6. budget_requests
  section('BUDGET REQUESTS');
  const { data: budgetReqs = [] } = await admin
    .from('budget_requests')
    .select('id, amount_usd, purpose, status, created_at')
    .eq('goal_id', goal.id)
    .order('created_at', { ascending: true });
  if (budgetReqs.length === 0) {
    console.log('(none)');
  } else {
    for (const b of budgetReqs) {
      console.log(`${fmtTime(b.created_at)}  $${b.amount_usd}  ${b.status.padEnd(10)} ${b.purpose}`);
    }
  }

  // Classification
  section('DIAGNOSIS');
  console.log(classify(goal, events, jobs, tasks));
  console.log('');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
