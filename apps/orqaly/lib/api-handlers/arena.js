/**
 * Arena — people vs agents on the same daily job.
 *
 * A job is already a pair: team_tasks carries `assigned_to` (the person) and
 * `agent_id` (the agent) on one row. This handler reads both corners, attaches
 * what each side delivered, and folds the result into the numbers a business
 * decides on: cost, time, rework and coverage.
 *
 * Ops (?path=arena&op=…):
 *   board        GET   the paired rows
 *   scoreboard   GET   per-department rollup
 *   decision     GET   the recommendation, its confidence, the numbers behind it
 *   trend        GET   week by week, so a call rests on a trend not one good week
 *   exceptions   GET   the risk list
 *   upload-url   POST  signed Storage URL for a registered result
 *   register     POST  record what a person delivered
 *   rate         POST  1-5 stars on one side
 *   outcome      POST  accepted | rework | rejected
 *   verdict      POST  who won this job
 *   run-agent    POST  queue the agent on the same job
 *   departments  GET/POST  the setup step
 *   rates        GET/POST  cost inputs
 *
 * Arena recommends. It never reassigns work by itself.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { handleApiError, jsonError } from '../../api/_lib/errors.js';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  applyRateLimitHeaders,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseAdminClient } from '../../api/_lib/supabase-server.js';
import {
  arenaPeopleSchema,
  arenaStackSchema,
  arenaEnsureAgentsSchema,
  arenaLinkBriefGoalSchema,
  arenaBriefTaskSchema,
  arenaRegisterSchema,
  arenaUploadUrlSchema,
  arenaRateBodySchema,
  arenaOutcomeSchema,
  arenaVerdictSchema,
  arenaRunAgentSchema,
  arenaDepartmentsSchema,
  arenaRatesSchema,
  arenaWindowQuerySchema,
} from '../../api/_lib/validate.js';
import {
  DEPARTMENT_IDS,
  DEPARTMENT_BY_ID,
  resolveDepartment,
  departmentLabel,
  isCustomDepartment,
  isKnownOrCustomDepartment,
} from '../../src/config/departments.js';
import { getMcpAppById } from '../../src/config/mcpToolCatalog.js';
import { isComposioConfigured } from '../composio/client.js';
import { listComposioConnections } from '../composio/executor.js';
import { ensurePersistentAgentsForRoles } from '../goal-handlers/team-assigner.js';
import { PREDEFINED_AGENTS } from '../../src/config/predefinedAgents.js';
import { enqueueAgentJob } from '../goal-handlers/_helpers.js';
import { checkQuotas } from '../security/user-quotas.js';
import {
  resolveRate,
  personCost,
  computeDepartmentStats,
  recommend,
  projectMoney,
} from '../arena/decision.js';

const log = createLogger('arena');

const BUCKET = 'arena-results';
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 400;
const MAX_TASKS = 2000;
const ALLOWED_UPLOAD_EXT = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'txt',
  'md',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'zip',
  'ppt',
  'pptx',
]);

/* ── window ───────────────────────────────────────────────────────────────── */

function parseWindow(query) {
  const now = new Date();
  const to = query.to ? new Date(query.to) : now;
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 86_400_000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { error: 'from and to must be valid dates' };
  }
  const days = Math.ceil((to - from) / 86_400_000);
  if (days <= 0) return { error: 'from must be before to' };
  if (days > MAX_WINDOW_DAYS) return { error: `Window is capped at ${MAX_WINDOW_DAYS} days` };
  return { from: from.toISOString(), to: to.toISOString(), days };
}

/* ── identity ─────────────────────────────────────────────────────────────── */

const PREDEFINED_BY_NAME = new Map(
  PREDEFINED_AGENTS.map((a) => [String(a.name || '').toLowerCase(), a])
);

/**
 * Names and roles for agent ids. `agents.name` is the identity; the role comes
 * from agent_profiles, falling back to the predefined roster matched by name.
 */
function buildAgentIndex(agents = [], profiles = []) {
  const profileByAgent = new Map(profiles.map((p) => [p.agent_id, p]));
  const index = new Map();
  for (const a of agents) {
    const p = profileByAgent.get(a.id);
    const predef = PREDEFINED_BY_NAME.get(String(a.name || '').toLowerCase());
    index.set(String(a.id), {
      id: String(a.id),
      name: p?.display_name || a.name || 'Agent',
      role: p?.role || p?.job_title || predef?.role || null,
    });
  }
  return index;
}

/** Label for a department id — the custom label when the company named one. */
function labelFor(id, configByDept) {
  const cfg = configByDept?.get(id);
  return cfg?.label || departmentLabel(id);
}

/* ── the shared read ──────────────────────────────────────────────────────── */

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function rows(query, what) {
  const { data, error } = await query;
  if (error) {
    log.warn(null, 'arena.read.failed', { what, error: error.message });
    throw new Error(`${what}: ${error.message}`);
  }
  return data || [];
}

/**
 * Load every job in the window with both corners attached.
 *
 * team_tasks.user_id is nullable by design (migration 183: team formation
 * inserts rows without an owner), so ownership is resolved through the parent
 * goal as well. Missing that is how jobs silently vanish from the board.
 */
async function loadArenaData(admin, user, window) {
  const goals = await rows(
    admin.from('goals').select('id, title').eq('user_id', user.id),
    'Unable to read goals'
  );
  const goalIds = goals.map((g) => g.id);
  const goalTitle = new Map(goals.map((g) => [g.id, g.title]));

  const TASK_COLS =
    'id, title, description, status, assigned_to, agent_id, category, deadline, goal_id, created_at, data';

  const owned = await rows(
    admin
      .from('team_tasks')
      .select(TASK_COLS)
      .eq('user_id', user.id)
      .gte('created_at', window.from)
      .lte('created_at', window.to)
      .limit(MAX_TASKS),
    'Unable to read tasks'
  );

  // Chunked rather than one giant .in() so a busy account cannot blow the URL.
  const viaGoals = [];
  for (const ids of chunk(goalIds, 100)) {
    viaGoals.push(
      ...(await rows(
        admin
          .from('team_tasks')
          .select(TASK_COLS)
          .in('goal_id', ids)
          .gte('created_at', window.from)
          .lte('created_at', window.to)
          .limit(MAX_TASKS),
        'Unable to read tasks by goal'
      ))
    );
  }

  const taskById = new Map();
  for (const t of [...owned, ...viaGoals]) taskById.set(String(t.id), t);
  const tasks = [...taskById.values()];
  const taskIds = tasks.map((t) => String(t.id));

  const [submissions, verdicts, config, rates, agents, profiles] = await Promise.all([
    taskIds.length
      ? (async () => {
          const out = [];
          for (const ids of chunk(taskIds, 200)) {
            out.push(
              ...(await rows(
                admin
                  .from('arena_submissions')
                  .select('*')
                  .eq('user_id', user.id)
                  .in('task_id', ids),
                'Unable to read submissions'
              ))
            );
          }
          return out;
        })()
      : [],
    taskIds.length
      ? (async () => {
          const out = [];
          for (const ids of chunk(taskIds, 200)) {
            out.push(
              ...(await rows(
                admin.from('arena_verdicts').select('*').eq('user_id', user.id).in('task_id', ids),
                'Unable to read verdicts'
              ))
            );
          }
          return out;
        })()
      : [],
    rows(
      admin.from('arena_department_config').select('*').eq('user_id', user.id),
      'Unable to read department setup'
    ),
    rows(admin.from('arena_rates').select('*').eq('user_id', user.id), 'Unable to read rates'),
    rows(
      admin.from('agents').select('id, name, status').eq('user_id', user.id),
      'Unable to read agents'
    ),
    rows(
      admin
        .from('agent_profiles')
        .select('agent_id, display_name, job_title, role')
        .eq('user_id', user.id),
      'Unable to read agent profiles'
    ),
  ]);

  const agentIndex = buildAgentIndex(agents, profiles);
  const configByDept = new Map(config.map((c) => [c.department, c]));
  const verdictByTask = new Map(verdicts.map((v) => [String(v.task_id), v]));
  const subsByTask = new Map();
  for (const s of submissions) {
    const key = String(s.task_id);
    if (!subsByTask.has(key)) subsByTask.set(key, {});
    subsByTask.get(key)[s.side] = s;
  }

  const jobs = tasks.map((task) => {
    const agent = task.agent_id ? agentIndex.get(String(task.agent_id)) : null;
    const sides = subsByTask.get(String(task.id)) || {};
    const people = sides.people ? { ...sides.people } : null;
    const agentSide = sides.agents ? { ...sides.agents } : null;

    // A task filed under a company's own department resolves to it directly.
    const department =
      resolveDepartment({ category: task.category, role: people?.actor_role || agent?.role }) ||
      (task.category && configByDept.has(task.category) ? task.category : null);

    // Fill in a human cost from the rate table when one was not stored.
    if (people && people.cost_usd == null) {
      const rate = resolveRate(rates, {
        person: people.actor_name,
        role: people.actor_role,
        department,
        on: people.registered_at,
      });
      const computed = personCost(rate, people.minutes_spent);
      if (computed != null) {
        people.cost_usd = computed;
        people.currency = rate.currency;
        people.cost_source = `rate:${rate.scope}`;
      }
    }

    const verdict = verdictByTask.get(String(task.id)) || null;

    return {
      taskId: String(task.id),
      title: task.title || 'Untitled job',
      description: task.description || '',
      status: task.status || 'todo',
      department,
      departmentLabel: labelFor(department, configByDept),
      deadline: task.deadline || null,
      goalId: task.goal_id || null,
      goalTitle: task.goal_id ? goalTitle.get(task.goal_id) || null : null,
      createdAt: task.created_at,
      assignedTo: task.assigned_to || null,
      agent:
        agent || (task.agent_id ? { id: String(task.agent_id), name: null, role: null } : null),
      people,
      agents: agentSide,
      verdict: verdict?.winner || null,
      verdictReason: verdict?.reason || null,
      savings: computeJobSavings(people, agentSide),
    };
  });

  return { jobs, rates, configByDept, agentIndex, window };
}

/** What the agents saved on one job, when both corners recorded the numbers. */
function computeJobSavings(people, agents) {
  if (!people || !agents) return null;
  const money =
    people.cost_usd != null && agents.cost_usd != null
      ? Math.round((Number(people.cost_usd) - Number(agents.cost_usd)) * 100) / 100
      : null;
  const minutes =
    people.minutes_spent != null && agents.minutes_spent != null
      ? Number(people.minutes_spent) - Number(agents.minutes_spent)
      : null;
  if (money == null && minutes == null) return null;
  return { money, minutes };
}

/** Group jobs by department, honouring the enabled set when one is configured. */
function groupByDepartment(jobs, configByDept) {
  const configured = [...configByDept.values()].filter((c) => c.enabled);
  const ids = configured.length ? configured.map((c) => c.department) : DEPARTMENT_IDS;
  return ids.map((id) => {
    const cfg = configByDept.get(id);
    return {
      id,
      label: labelFor(id, configByDept),
      stakes: cfg?.stakes || 'medium',
      monthlyVolume: cfg?.monthly_volume ?? null,
      jobs: jobs.filter((j) => j.department === id),
    };
  });
}

function statsFor(dept, days) {
  const pairs = dept.jobs.map((j) => ({ verdict: j.verdict, people: j.people, agents: j.agents }));
  const stats = computeDepartmentStats(pairs, {
    stakes: dept.stakes,
    monthlyVolume: dept.monthlyVolume,
  });
  return { stats, money: projectMoney(stats, { windowDays: days }) };
}

/* ── read ops ─────────────────────────────────────────────────────────────── */

async function handleBoard(admin, user, query, window) {
  const { jobs, configByDept } = await loadArenaData(admin, user, window);

  let out = jobs;
  if (query.department && query.department !== 'all') {
    out = out.filter((j) => j.department === query.department);
  }
  if (query.status && query.status !== 'all') {
    out = out.filter((j) => j.status === query.status);
  }
  if (query.q) {
    const needle = String(query.q).toLowerCase();
    out = out.filter(
      (j) =>
        j.title.toLowerCase().includes(needle) ||
        (j.assignedTo || '').toLowerCase().includes(needle) ||
        (j.agent?.name || '').toLowerCase().includes(needle)
    );
  }
  out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const paired = out.filter((j) => j.people && j.agents);
  const savedMoney = paired.reduce((sum, j) => sum + (j.savings?.money ?? 0), 0);
  const savedMinutes = paired.reduce((sum, j) => sum + (j.savings?.minutes ?? 0), 0);

  return {
    status: 200,
    data: {
      jobs: out,
      departments: [...configByDept.values()]
        .filter((c) => c.enabled)
        .map((c) => ({
          id: c.department,
          label: labelFor(c.department, configByDept),
          stakes: c.stakes,
          monthlyVolume: c.monthly_volume ?? null,
        })),
      isConfigured: configByDept.size > 0,
      totals: {
        jobs: out.length,
        people: out.filter((j) => j.people).length,
        agents: out.filter((j) => j.agents).length,
        decided: out.filter((j) => j.verdict).length,
        savedMoney: Math.round(savedMoney * 100) / 100,
        savedMinutes,
      },
      window,
    },
  };
}

async function handleScoreboard(admin, user, _query, window) {
  const { jobs, configByDept } = await loadArenaData(admin, user, window);
  const departments = groupByDepartment(jobs, configByDept);

  let monthlyAgentSpend = 0;
  let monthlyPeopleCost = 0;
  let haveMoney = false;

  const rowsOut = departments.map((dept) => {
    const { stats, money } = statsFor(dept, window.days);
    if (money.monthlyAgentSpend != null) {
      monthlyAgentSpend += money.monthlyAgentSpend;
      haveMoney = true;
    }
    if (money.monthlyPeopleCost != null) monthlyPeopleCost += money.monthlyPeopleCost;
    return {
      id: dept.id,
      label: dept.label,
      stakes: dept.stakes,
      monthlyVolume: dept.monthlyVolume,
      ...stats,
      money,
    };
  });

  return {
    status: 200,
    data: {
      departments: rowsOut,
      totals: {
        monthlyAgentSpend: haveMoney ? Math.round(monthlyAgentSpend * 100) / 100 : null,
        monthlyPeopleCost: haveMoney ? Math.round(monthlyPeopleCost * 100) / 100 : null,
        coverage: overallCoverage(rowsOut),
      },
      window,
    },
  };
}

function overallCoverage(rowsOut) {
  const withVolume = rowsOut.filter((r) => r.monthlyVolume);
  if (!withVolume.length) return null;
  const compared = withVolume.reduce((n, r) => n + r.n, 0);
  const volume = withVolume.reduce((n, r) => n + r.monthlyVolume, 0);
  return volume > 0 ? Math.round((compared / volume) * 1000) / 1000 : null;
}

async function handleDecision(admin, user, _query, window) {
  const { jobs, configByDept } = await loadArenaData(admin, user, window);
  const departments = groupByDepartment(jobs, configByDept);

  const out = departments.map((dept) => {
    const { stats, money } = statsFor(dept, window.days);
    const call = recommend(stats);
    return {
      id: dept.id,
      label: dept.label,
      stakes: dept.stakes,
      monthlyVolume: dept.monthlyVolume,
      ...call,
      stats,
      money,
    };
  });

  // Most actionable first: a confident handover is worth more than an empty row.
  const rank = { hand_over: 0, assist: 1, keep_human: 2, not_enough_yet: 3 };
  out.sort((a, b) => (rank[a.recommendation] ?? 9) - (rank[b.recommendation] ?? 9));

  return { status: 200, data: { departments: out, window, advisoryOnly: true } };
}

async function handleTrend(admin, user, query, window) {
  const { jobs, configByDept } = await loadArenaData(admin, user, window);
  const weeks = Number(query.weeks) || 12;
  const buckets = [];
  const end = new Date(window.to);

  for (let i = weeks - 1; i >= 0; i -= 1) {
    const bucketTo = new Date(end.getTime() - i * 7 * 86_400_000);
    const bucketFrom = new Date(bucketTo.getTime() - 7 * 86_400_000);
    const inWeek = jobs.filter((j) => {
      const at = new Date(j.createdAt);
      return at > bucketFrom && at <= bucketTo;
    });
    const scoped =
      query.department && query.department !== 'all'
        ? inWeek.filter((j) => j.department === query.department)
        : inWeek;
    const stats = computeDepartmentStats(
      scoped.map((j) => ({ verdict: j.verdict, people: j.people, agents: j.agents })),
      { stakes: configByDept.get(query.department)?.stakes || 'medium' }
    );
    buckets.push({
      weekEnding: bucketTo.toISOString().slice(0, 10),
      n: stats.n,
      winRate: stats.winRate,
      costPerJob: { people: stats.avgCost.people, agents: stats.avgCost.agents },
      quality: stats.avgStars,
    });
  }

  return { status: 200, data: { weeks: buckets, department: query.department || 'all', window } };
}

async function handleExceptions(admin, user, _query, window) {
  const { jobs, configByDept } = await loadArenaData(admin, user, window);
  const stakesFor = (id) => configByDept.get(id)?.stakes || 'medium';

  const acceptedThenReworked = [];
  const highStakesLosses = [];
  const unchecked = [];

  for (const job of jobs) {
    for (const side of ['people', 'agents']) {
      const sub = job[side];
      if (sub && (sub.reworked_count || 0) > 0) {
        acceptedThenReworked.push({
          taskId: job.taskId,
          title: job.title,
          department: job.department,
          departmentLabel: job.departmentLabel,
          side,
          actor: sub.actor_name,
          reworkedCount: sub.reworked_count,
        });
      }
    }

    if (job.verdict === 'people' && stakesFor(job.department) === 'high') {
      highStakesLosses.push({
        taskId: job.taskId,
        title: job.title,
        department: job.department,
        departmentLabel: job.departmentLabel,
        peopleStars: job.people?.rating ?? null,
        agentStars: job.agents?.rating ?? null,
      });
    }

    if (job.agents && !job.people && job.agents.outcome === 'accepted') {
      unchecked.push({
        taskId: job.taskId,
        title: job.title,
        department: job.department,
        departmentLabel: job.departmentLabel,
        actor: job.agents.actor_name,
      });
    }
  }

  return {
    status: 200,
    data: {
      acceptedThenReworked,
      highStakesLosses,
      unchecked,
      total: acceptedThenReworked.length + highStakesLosses.length + unchecked.length,
      window,
    },
  };
}

/* ── write ops ────────────────────────────────────────────────────────────── */

/** Confirm the job belongs to this user before writing anything against it. */
async function assertOwnsTask(admin, user, taskId) {
  const { data: task } = await admin
    .from('team_tasks')
    .select(
      'id, user_id, goal_id, job_pool_id, title, description, agent_id, assigned_to, category, data'
    )
    .eq('id', taskId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!task) return { error: 'Job not found', status: 404 };
  if (task.user_id !== user.id) return { error: 'Job not found', status: 404 };
  return { task };
}

async function handleUploadUrl(admin, user, body) {
  const parsed = arenaUploadUrlSchema.safeParse(body);
  if (!parsed.success) return { status: 400, error: parsed.error.issues[0].message };
  const { task_id, filename, size } = parsed.data;

  const owned = await assertOwnsTask(admin, user, task_id);
  if (owned.error) return { status: owned.status, error: owned.error };

  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (!ALLOWED_UPLOAD_EXT.has(ext)) {
    return { status: 400, error: `Files of type .${ext} are not accepted` };
  }

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  const path = `${user.id}/${task_id}/${Date.now()}_${safeName}`;

  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) {
    if (/bucket/i.test(error.message)) {
      return {
        status: 503,
        error: `Storage bucket "${BUCKET}" is missing. Create it in Supabase Dashboard → Storage.`,
      };
    }
    throw error;
  }

  return { status: 200, data: { path, token: data.token, signedUrl: data.signedUrl, size } };
}

async function handleRegister(admin, user, body) {
  const parsed = arenaRegisterSchema.safeParse(body);
  if (!parsed.success) return { status: 400, error: parsed.error.issues[0].message };
  const { task_id, actor_name, actor_role, title, note, assets, minutes_spent } = parsed.data;

  if (!assets.length && !note) {
    return { status: 400, error: 'Attach a file or a link, or write a note' };
  }

  const owned = await assertOwnsTask(admin, user, task_id);
  if (owned.error) return { status: owned.status, error: owned.error };

  // Wall-clock from assignment to now is a poor proxy for effort, so it is only
  // a fallback and it is flagged as derived wherever it is shown.
  let minutes = minutes_spent ?? null;
  let derived = false;
  if (minutes == null && owned.task.created_at) {
    minutes = Math.max(0, Math.round((Date.now() - new Date(owned.task.created_at)) / 60000));
    derived = true;
  }

  const rates = await rows(
    admin.from('arena_rates').select('*').eq('user_id', user.id),
    'Unable to read rates'
  );
  const department = resolveDepartment({ category: owned.task.category, role: actor_role });
  const rate = resolveRate(rates, { person: actor_name, role: actor_role, department });
  const cost = personCost(rate, minutes);

  const { data, error } = await admin
    .from('arena_submissions')
    .upsert(
      {
        user_id: user.id,
        task_id,
        side: 'people',
        actor_kind: 'person',
        actor_name,
        actor_role: actor_role || null,
        title: title || owned.task.title || '',
        note: note || '',
        assets,
        source: 'manual',
        minutes_spent: minutes,
        minutes_derived: derived,
        cost_usd: cost,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,task_id,side' }
    )
    .select('*')
    .single();
  if (error) throw error;

  log.info(null, 'arena.register', { task_id, assets: assets.length, derived });
  return { status: 201, data };
}

async function handleRate(admin, user, body) {
  const parsed = arenaRateBodySchema.safeParse(body);
  if (!parsed.success) return { status: 400, error: parsed.error.issues[0].message };
  const { task_id, side, rating, comment } = parsed.data;

  const { data: sub, error: readErr } = await admin
    .from('arena_submissions')
    .select('id, side, actor_ref, actor_name')
    .eq('user_id', user.id)
    .eq('task_id', task_id)
    .eq('side', side)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!sub) return { status: 404, error: 'Nothing delivered on that side yet' };

  const { error } = await admin
    .from('arena_submissions')
    .update({ rating, rating_comment: comment || null, updated_at: new Date().toISOString() })
    .eq('id', sub.id);
  if (error) throw error;

  // Agent reputation lives in agent_ratings and is read all over the platform.
  // Mirrored explicitly rather than by trigger so the coupling stays readable.
  if (side === 'agents' && sub.actor_ref) {
    const { error: mirrorErr } = await admin.from('agent_ratings').upsert(
      {
        user_id: user.id,
        agent_id: String(sub.actor_ref),
        rating,
        comment: comment || null,
        request_id: `arena:${task_id}`,
        rating_type: 'individual',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,agent_id,request_id' }
    );
    if (mirrorErr) log.warn(null, 'arena.rating.mirror_failed', { error: mirrorErr.message });
  }

  return { status: 200, data: { task_id, side, rating } };
}

async function handleOutcome(admin, user, body) {
  const parsed = arenaOutcomeSchema.safeParse(body);
  if (!parsed.success) return { status: 400, error: parsed.error.issues[0].message };
  const { task_id, side, outcome } = parsed.data;

  const { data: sub, error: readErr } = await admin
    .from('arena_submissions')
    .select('id, outcome, reworked_count')
    .eq('user_id', user.id)
    .eq('task_id', task_id)
    .eq('side', side)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!sub) return { status: 404, error: 'Nothing delivered on that side yet' };

  const patch = { outcome, updated_at: new Date().toISOString() };
  if (outcome === 'rework') patch.reworked_count = (sub.reworked_count || 0) + 1;

  const { data, error } = await admin
    .from('arena_submissions')
    .update(patch)
    .eq('id', sub.id)
    .select('id, outcome, reworked_count')
    .single();
  if (error) throw error;

  return { status: 200, data };
}

async function handleVerdict(admin, user, body) {
  const parsed = arenaVerdictSchema.safeParse(body);
  if (!parsed.success) return { status: 400, error: parsed.error.issues[0].message };
  const { task_id, winner, reason } = parsed.data;

  const owned = await assertOwnsTask(admin, user, task_id);
  if (owned.error) return { status: owned.status, error: owned.error };

  const { data, error } = await admin
    .from('arena_verdicts')
    .upsert(
      {
        user_id: user.id,
        task_id,
        winner,
        reason: reason || null,
        decided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,task_id' }
    )
    .select('*')
    .single();
  if (error) throw error;

  return { status: 200, data };
}

async function handleRunAgent(admin, user, body) {
  const parsed = arenaRunAgentSchema.safeParse(body);
  if (!parsed.success) return { status: 400, error: parsed.error.issues[0].message };
  const { task_id, mode } = parsed.data;

  const owned = await assertOwnsTask(admin, user, task_id);
  if (owned.error) return { status: owned.status, error: owned.error };
  if (!owned.task.agent_id) {
    return { status: 400, error: 'No agent is assigned to this job yet' };
  }
  if (!owned.task.job_pool_id) {
    return { status: 409, error: 'This task is not linked to an executable job yet' };
  }

  const taskColumnGoalId = owned.task.goal_id || null;
  const taskDataGoalId = owned.task.data?.goal_id || null;
  if (!taskColumnGoalId || !taskDataGoalId) {
    return { status: 409, error: 'This task is not bound to an executable lifecycle goal' };
  }
  if (String(taskColumnGoalId) !== String(taskDataGoalId)) {
    return { status: 409, error: 'This task has conflicting parent goal identifiers' };
  }
  const goalId = taskColumnGoalId;

  const { data: jobRow, error: jobError } = await admin
    .from('jobs')
    .select(
      'id, user_id, goal_id, description, requirements, assigned_agent_id, assigned_agent_name'
    )
    .eq('id', owned.task.job_pool_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (jobError) throw jobError;
  if (!jobRow) return { status: 404, error: 'Executable job not found' };
  if (String(goalId) !== String(jobRow.goal_id || '')) {
    return { status: 409, error: 'Task and executable job belong to different goals' };
  }

  const { data: goal, error: goalError } = await admin
    .from('goals')
    .select('id, user_id, status, data')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (goalError) throw goalError;
  if (!goal) return { status: 404, error: 'Parent goal not found' };

  const { data: agent, error: agentError } = await admin
    .from('agents')
    .select('id, user_id, name, category, capabilities, metadata')
    .eq('id', owned.task.agent_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (agentError) throw agentError;
  if (!agent) return { status: 404, error: 'Assigned agent not found' };

  const taskAuthorization = (goal?.data?.execution_authorization?.manifest?.tasks || []).find(
    (entry) => String(entry?.task_id || '') === String(owned.task.id)
  );
  const toolsSkipped = goal?.data?.skip_tools === true;
  const toolIds = toolsSkipped ? [] : taskAuthorization?.granted_tool_ids || [];
  const toolGrants = toolsSkipped ? [] : taskAuthorization?.tool_grants || [];
  const authorizationSnapshotHash = goal?.data?.goal_approvals?.execution?.snapshot_hash || null;

  const quota = await checkQuotas(admin, user.id, { jobType: 'execute-task' });
  if (!quota.allowed) {
    return {
      status: 429,
      data: {
        error: quota.message,
        code: quota.code,
        quotas: quota.quotas,
        usage: quota.usage,
      },
    };
  }

  // The Arena mode is presentation metadata only. The worker derives every
  // prompt input from the owner-bound task, job, goal, manifest, and agent.
  const payload = {
    type: 'execute-task',
    _userId: user.id,
    userId: user.id,
    user_id: user.id,
    _ts: Date.now(),
    taskId: task_id,
    jobId: jobRow.id,
    goalId,
    toolIds,
    toolGrants,
    ...(authorizationSnapshotHash ? { authorizationSnapshotHash } : {}),
    arena: { task_id, mode },
  };

  let job;
  try {
    job = await enqueueAgentJob(admin, { user_id: user.id, payload });
  } catch (error) {
    if (error.code === '42P01') {
      return { status: 503, error: 'agent_jobs table missing; run migration 017_agent_jobs.sql' };
    }
    throw error;
  }

  log.info(null, 'arena.run_agent', { task_id, mode });
  return { status: 202, data: { job_id: job.id, status: job.status, mode } };
}

/* ── setup ops ────────────────────────────────────────────────────────────── */

async function handleDepartments(admin, user, req) {
  if (req.method === 'GET') {
    const data = await rows(
      admin.from('arena_department_config').select('*').eq('user_id', user.id).order('department'),
      'Unable to read department setup'
    );
    return {
      status: 200,
      data: {
        configured: data,
        available: DEPARTMENT_IDS.map((id) => ({
          id,
          label: DEPARTMENT_BY_ID[id].label,
          description: DEPARTMENT_BY_ID[id].description,
        })),
      },
    };
  }

  const parsed = arenaDepartmentsSchema.safeParse(req.body);
  if (!parsed.success) return { status: 400, error: parsed.error.issues[0].message };

  // Built-ins need no label; a company's own department must be named.
  const unknown = parsed.data.departments.filter(
    (d) => !isKnownOrCustomDepartment(d.department, d.label)
  );
  if (unknown.length) {
    const bad = unknown[0].department;
    return {
      status: 400,
      error: isCustomDepartment(bad)
        ? 'Give your own department a name'
        : `Unknown department: ${bad}`,
    };
  }

  const payload = parsed.data.departments.map((d) => ({
    user_id: user.id,
    department: d.department,
    enabled: d.enabled,
    stakes: d.stakes,
    monthly_volume: d.monthly_volume ?? null,
    label: DEPARTMENT_BY_ID[d.department] ? null : d.label?.trim() || null,
    description: d.description?.trim() || null,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await admin
    .from('arena_department_config')
    .upsert(payload, { onConflict: 'user_id,department' })
    .select('*');
  if (error) throw error;

  return { status: 200, data };
}

async function handleRates(admin, user, req) {
  if (req.method === 'GET') {
    const data = await rows(
      admin.from('arena_rates').select('*').eq('user_id', user.id).order('scope').order('key'),
      'Unable to read rates'
    );
    return { status: 200, data };
  }

  if (req.method === 'DELETE') {
    const id = req.query?.id;
    if (!id) return { status: 400, error: 'id is required' };
    const { error } = await admin.from('arena_rates').delete().eq('id', id).eq('user_id', user.id);
    if (error) throw error;
    return { status: 200, data: { id, deleted: true } };
  }

  const parsed = arenaRatesSchema.safeParse(req.body);
  if (!parsed.success) return { status: 400, error: parsed.error.issues[0].message };
  if (!parsed.data.rates.length) return { status: 200, data: [] };

  const payload = parsed.data.rates.map((r) => ({
    user_id: user.id,
    scope: r.scope,
    key: r.key,
    currency: r.currency,
    hourly_rate: r.hourly_rate ?? null,
    per_job_cost: r.per_job_cost ?? null,
    updated_at: new Date().toISOString(),
  }));

  const { data, error } = await admin
    .from('arena_rates')
    .upsert(payload, { onConflict: 'user_id,scope,key,effective_from' })
    .select('*');
  if (error) throw error;

  return { status: 200, data };
}

/* ── guide ops — the setup wizard's backend ───────────────────────────────── */

async function handlePeople(admin, user, req) {
  if (req.method === 'GET') {
    const data = await rows(
      admin.from('arena_people').select('*').eq('user_id', user.id).order('name'),
      'Unable to read people'
    );
    return { status: 200, data };
  }

  const parsed = arenaPeopleSchema.safeParse(req.body);
  if (!parsed.success) return { status: 400, error: parsed.error.issues[0].message };

  const payload = parsed.data.people.map((p) => ({
    user_id: user.id,
    name: p.name.trim(),
    role: p.role?.trim() || '',
    description: p.description?.trim() || null,
    email: p.email || null,
    is_active: p.is_active,
    updated_at: new Date().toISOString(),
  }));

  if (!payload.length) return { status: 200, data: [] };
  const { data, error } = await admin
    .from('arena_people')
    .upsert(payload, { onConflict: 'user_id,name' })
    .select('*');
  if (error) throw error;
  return { status: 200, data };
}

/**
 * Load the stack and make its statuses truthful before anyone reads them:
 *  - catalog rows flip selected <-> connected against live Composio state
 *    (connect is initiate-only upstream, so "connected" must be re-proven);
 *  - brief_requested rows whose goal finished become brief_ready.
 * Gap/handed_over states are never touched here.
 */
async function loadReconciledStack(admin, user) {
  const stack = await rows(
    admin.from('arena_stack').select('*').eq('user_id', user.id).order('label'),
    'Unable to read the stack'
  );
  if (!stack.length) return stack;

  const updates = [];

  if (isComposioConfigured()) {
    let liveApps = null;
    try {
      const live = await listComposioConnections(user.id);
      liveApps = new Set(
        (Array.isArray(live) ? live : live?.connections || [])
          .filter((c) => String(c.status || '').toUpperCase() !== 'FAILED')
          .map((c) => String(c.appName || c.appUniqueId || '').toLowerCase())
          .filter(Boolean)
      );
    } catch (err) {
      log.warn(null, 'arena.stack.reconcile_skipped', { error: err.message });
    }
    if (liveApps) {
      for (const row of stack) {
        if (row.source !== 'catalog') continue;
        const app = getMcpAppById(row.key)?.composioApp?.toLowerCase();
        if (!app) continue;
        if (row.status === 'selected' && liveApps.has(app)) {
          row.status = 'connected';
          updates.push({ id: row.id, status: 'connected' });
        } else if (row.status === 'connected' && !liveApps.has(app)) {
          row.status = 'selected';
          updates.push({ id: row.id, status: 'selected' });
        }
      }
    }
  }

  const awaiting = stack.filter((r) => r.status === 'brief_requested' && r.goal_id);
  if (awaiting.length) {
    const goals = await rows(
      admin
        .from('goals')
        .select('id, status')
        .eq('user_id', user.id)
        .in(
          'id',
          awaiting.map((r) => r.goal_id)
        ),
      'Unable to read brief goals'
    );
    const goalStatus = new Map(goals.map((g) => [g.id, g.status]));
    for (const row of awaiting) {
      const gs = goalStatus.get(row.goal_id);
      if (gs === 'completed') {
        row.status = 'brief_ready';
        updates.push({ id: row.id, status: 'brief_ready' });
      } else if (gs === 'failed' || gs === 'cancelled') {
        // Back to gap so the card offers to write it again.
        row.status = 'gap';
        updates.push({ id: row.id, status: 'gap' });
      }
    }
  }

  for (const u of updates) {
    const { error } = await admin
      .from('arena_stack')
      .update({ status: u.status, updated_at: new Date().toISOString() })
      .eq('id', u.id)
      .eq('user_id', user.id);
    if (error) log.warn(null, 'arena.stack.reconcile_write_failed', { error: error.message });
  }

  return stack;
}

async function handleStack(admin, user, req) {
  if (req.method === 'GET') {
    const data = await loadReconciledStack(admin, user);
    return { status: 200, data: { rows: data, composioConfigured: isComposioConfigured() } };
  }

  const parsed = arenaStackSchema.safeParse(req.body);
  if (!parsed.success) return { status: 400, error: parsed.error.issues[0].message };

  const existing = await rows(
    admin.from('arena_stack').select('id, key, status').eq('user_id', user.id),
    'Unable to read the stack'
  );
  const existingByKey = new Map(existing.map((r) => [r.key, r]));
  const sentKeys = new Set(parsed.data.rows.map((r) => r.key));

  const payload = parsed.data.rows.map((r) => {
    const prior = existingByKey.get(r.key);
    return {
      user_id: user.id,
      key: r.key,
      label: r.label.trim(),
      source: r.source,
      department: r.department || null,
      // A tool we cover starts 'selected'; one we do not starts 'gap'. Rows
      // already further down a pipeline keep their earned status.
      status: prior ? prior.status : r.source === 'catalog' ? 'selected' : 'gap',
      updated_at: new Date().toISOString(),
    };
  });

  if (payload.length) {
    const { error } = await admin
      .from('arena_stack')
      .upsert(payload, { onConflict: 'user_id,key' });
    if (error) throw error;
  }

  // Unticked rows are removed only while nothing downstream depends on them:
  // a row mid-brief carries a goal and possibly a developer task.
  const removable = existing
    .filter((r) => !sentKeys.has(r.key) && ['selected', 'gap', 'connected'].includes(r.status))
    .map((r) => r.id);
  if (removable.length) {
    const { error } = await admin
      .from('arena_stack')
      .delete()
      .in('id', removable)
      .eq('user_id', user.id);
    if (error) throw error;
  }

  const data = await loadReconciledStack(admin, user);
  return { status: 200, data: { rows: data, composioConfigured: isComposioConfigured() } };
}

async function handleEnsureAgents(admin, user, body) {
  const parsed = arenaEnsureAgentsSchema.safeParse(body);
  if (!parsed.success) return { status: 400, error: parsed.error.issues[0].message };

  const roles = [...new Set(parsed.data.roles.map((r) => r.trim()).filter(Boolean))];
  if (!roles.length) return { status: 400, error: 'Pick at least one role' };
  const agents = await ensurePersistentAgentsForRoles(admin, user.id, roles, 'Arena counterparts');

  return {
    status: 200,
    data: {
      roles,
      agents: (agents || []).map((a) => ({
        id: a.id,
        name: a.name,
        role: a.metadata?.role || a.category || null,
      })),
    },
  };
}

async function handleLinkBriefGoal(admin, user, body) {
  const parsed = arenaLinkBriefGoalSchema.safeParse(body);
  if (!parsed.success) return { status: 400, error: parsed.error.issues[0].message };
  const { stack_id, goal_id } = parsed.data;

  const { data: goal } = await admin
    .from('goals')
    .select('id')
    .eq('id', goal_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!goal) return { status: 404, error: 'Goal not found' };

  const { data, error } = await admin
    .from('arena_stack')
    .update({ goal_id, status: 'brief_requested', updated_at: new Date().toISOString() })
    .eq('id', stack_id)
    .eq('user_id', user.id)
    .select('*')
    .single();
  if (error) throw error;
  if (!data) return { status: 404, error: 'Stack row not found' };
  return { status: 200, data };
}

async function handleBriefTask(admin, user, body) {
  const parsed = arenaBriefTaskSchema.safeParse(body);
  if (!parsed.success) return { status: 400, error: parsed.error.issues[0].message };

  const { data: row, error: readErr } = await admin
    .from('arena_stack')
    .select('*')
    .eq('id', parsed.data.stack_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!row) return { status: 404, error: 'Stack row not found' };
  if (!row.goal_id) return { status: 409, error: 'No brief has been written for this tool yet' };
  if (row.human_task_id) return { status: 409, error: 'This brief is already with your developer' };

  const { data: goal } = await admin
    .from('goals')
    .select('id, status')
    .eq('id', row.goal_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!goal || goal.status !== 'completed') {
    return { status: 409, error: 'The brief is still being written' };
  }

  const docs = await rows(
    admin
      .from('knowledge_documents')
      .select('id, title, content, created_at')
      .eq('user_id', user.id)
      .eq('category', 'goal-report')
      .contains('metadata', { goal_id: row.goal_id })
      .order('created_at', { ascending: false })
      .limit(1),
    'Unable to read the finished brief'
  );
  const doc = docs[0];
  if (!doc?.content) return { status: 409, error: 'The brief finished without a readable report' };

  const { data: task, error: taskErr } = await admin
    .from('human_tasks')
    .insert({
      user_id: user.id,
      goal_id: row.goal_id,
      tool_id: row.key,
      type: 'integration_brief',
      reason: `Connect ${row.label} so Arena can read what your team delivers there`,
      reason_code: 'arena_stack_gap',
      instructions: doc.content,
      escalation_allowed: false,
      escalate_after_seconds: null,
      partial_context: { arena_stack_id: row.id, label: row.label, report_doc_id: doc.id },
    })
    .select('id, status, created_at')
    .single();
  if (taskErr) throw taskErr;

  const { error: stampErr } = await admin
    .from('arena_stack')
    .update({
      status: 'handed_over',
      human_task_id: task.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('user_id', user.id);
  if (stampErr) throw stampErr;

  log.info(null, 'arena.brief.handed_over', { key: row.key });
  return { status: 201, data: { task_id: task.id, stack_id: row.id, status: 'handed_over' } };
}

/**
 * The derived done-map — no step state is stored anywhere. Each flag falls out
 * of the data the step actually produces, so reopening the guide always shows
 * the truth.
 */
async function handleGuideProgress(admin, user) {
  const [config, stack, people, agents, ratesRows] = await Promise.all([
    rows(
      admin.from('arena_department_config').select('department, enabled').eq('user_id', user.id),
      'Unable to read department setup'
    ),
    loadReconciledStack(admin, user),
    rows(
      admin.from('arena_people').select('id, name, role, is_active').eq('user_id', user.id),
      'Unable to read people'
    ),
    rows(
      admin
        .from('agents')
        .select('id, name, category, status, metadata')
        .eq('user_id', user.id)
        .eq('status', 'active'),
      'Unable to read agents'
    ),
    rows(
      admin.from('arena_rates').select('id').eq('user_id', user.id).limit(1),
      'Unable to read rates'
    ),
  ]);

  const catalogRows = stack.filter((r) => r.source === 'catalog');
  const gapStates = new Set(['gap', 'brief_requested', 'brief_ready']);
  const composioOn = isComposioConfigured();
  // With connections off a covered tool cannot be connected by button either,
  // so it still needs a developer - the briefs step is not done until one is
  // handed over. Without this the guide reports itself finished having wired
  // nothing.
  const stillNeedsDeveloper = (r) =>
    gapStates.has(r.status) || (!composioOn && r.source === 'catalog' && r.status === 'selected');

  const activePeople = people.filter((p) => p.is_active);
  const agentRoles = new Set(
    agents.map((a) => String(a.metadata?.role || a.category || '').toLowerCase()).filter(Boolean)
  );
  const peopleRoles = [...new Set(activePeople.map((p) => p.role.toLowerCase()).filter(Boolean))];

  const done = {
    departments: config.some((c) => c.enabled),
    stack: stack.length > 0,
    connect:
      catalogRows.length > 0 && (catalogRows.every((r) => r.status !== 'selected') || !composioOn),
    briefs: stack.length > 0 && !stack.some(stillNeedsDeveloper),
    team: activePeople.length > 0 && peopleRoles.every((r) => agentRoles.has(r)),
    rates: ratesRows.length > 0,
  };

  return { status: 200, data: { done, composioConfigured: composioOn, stackCount: stack.length } };
}

/* ── dispatcher ───────────────────────────────────────────────────────────── */

const READ_OPS = {
  board: handleBoard,
  scoreboard: handleScoreboard,
  decision: handleDecision,
  trend: handleTrend,
  exceptions: handleExceptions,
};

const WRITE_OPS = {
  'upload-url': handleUploadUrl,
  'ensure-agents': handleEnsureAgents,
  'link-brief-goal': handleLinkBriefGoal,
  'brief-task': handleBriefTask,
  register: handleRegister,
  rate: handleRate,
  outcome: handleOutcome,
  verdict: handleVerdict,
  'run-agent': handleRunAgent,
};

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) return jsonError(res, 401, 'Unauthorized');

  const op = req.query?.op || 'board';
  const SETUP_OPS = ['departments', 'rates', 'people', 'stack'];
  const isWrite = op in WRITE_OPS || (SETUP_OPS.includes(op) && req.method !== 'GET');
  const limit = op === 'run-agent' ? 10 : isWrite ? 30 : 60;

  const rl = checkRateLimit({
    key: `${getRateLimitIdentifier(req, user.id)}:arena:${isWrite ? 'w' : 'r'}`,
    limit,
    windowMs: 60_000,
  });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) return jsonError(res, 429, 'Rate limit exceeded');

  const admin = buildSupabaseAdminClient();
  if (!admin) return jsonError(res, 503, 'Arena is not configured');

  try {
    let result;

    if (op in READ_OPS) {
      const parsed = arenaWindowQuerySchema.safeParse(req.query || {});
      if (!parsed.success) return jsonError(res, 400, parsed.error.issues[0].message);
      const window = parseWindow(parsed.data);
      if (window.error) return jsonError(res, 400, window.error);
      result = await READ_OPS[op](admin, user, parsed.data, window);
    } else if (op in WRITE_OPS) {
      if (req.method !== 'POST') return jsonError(res, 405, 'POST only');
      result = await WRITE_OPS[op](admin, user, req.body || {});
    } else if (op === 'departments') {
      result = await handleDepartments(admin, user, req);
    } else if (op === 'rates') {
      result = await handleRates(admin, user, req);
    } else if (op === 'people') {
      result = await handlePeople(admin, user, req);
    } else if (op === 'stack') {
      result = await handleStack(admin, user, req);
    } else if (op === 'guide-progress') {
      result = await handleGuideProgress(admin, user);
    } else {
      return jsonError(res, 400, `Invalid op: ${op}`);
    }

    if (result.error) return jsonError(res, result.status, result.error);
    return res.status(result.status).json(result.data);
  } catch (err) {
    return handleApiError(res, err, 'arena');
  }
}
