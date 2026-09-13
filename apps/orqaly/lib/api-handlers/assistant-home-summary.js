/**
 * Assistant home summary — dynamic banners + greeting + legacy counts.
 * GET /api/assistant-home-summary
 *
 * Returns:
 *  - banners: 5–6 prioritized suggestion banners for the assistant home, built
 *    from the user's real state (pending approvals, goals in motion, tasks due,
 *    etc.) with a curated fallback set padding when there aren't enough signals.
 *  - greeting: { firstName, timeOfDay }
 *  - legacy counts (activeGoals, tasksDueThisWeek, ...) — kept for back-compat
 *    with callers that haven't migrated.
 *
 * All queries are user-scoped (RLS) via the caller's JWT.
 */
import { cors } from '../../api/_lib/cors.js';
import { verifySupabaseToken, getBearerToken } from '../../api/_lib/auth.js';
import { jsonError } from '../../api/_lib/errors.js';
import {
  applyRateLimitHeaders,
  checkRateLimit,
  getRateLimitIdentifier,
} from '../../api/_lib/rate-limit.js';
import { createLogger } from '../../api/_lib/logger.js';
import { buildSupabaseUserClient } from '../../api/_lib/supabase-server.js';

const log = createLogger('assistant-home-summary');

const ACTIVE_GOAL_STATUSES = [
  'active',
  'planning',
  'feasibility',
  'analyzing',
  'researching_customer',
  'forming_team',
  'authorizing_execution',
  'pending_validation',
  'paused',
  'execute-phase',
  'pm-planning',
  'feasibility-analysis',
];

const APPROVAL_GOAL_STATUSES = ['awaiting-approval', 'client-approval'];
export const OPEN_TASK_STATUSES = ['planned', 'todo', 'inProgress', 'blocked'];

const MAX_BANNERS = 6;

function isoDaysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

async function safeCount(promise) {
  try {
    const { count, error } = await promise;
    if (error) return null;
    return typeof count === 'number' ? count : null;
  } catch {
    return null;
  }
}

async function safeData(promise, fallback = []) {
  try {
    const { data, error } = await promise;
    if (error) return fallback;
    return data || fallback;
  } catch {
    return fallback;
  }
}

function timeOfDay(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'evening';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

function firstNameFrom(user) {
  const metaName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.user_metadata?.display_name ||
    '';
  if (metaName) return String(metaName).trim().split(/\s+/)[0];
  const email = user?.email || '';
  if (email) return email.split('@')[0];
  return '';
}

/** Fallback set — always pads to MAX_BANNERS in this order when not enough live signals. */
const FALLBACK_BANNERS = [
  {
    id: 'fb-goal',
    title: 'CREATE A GOAL',
    description: 'Start the autonomous pipeline.',
    icon: 'AddTaskRounded',
    text: 'I want to create a new goal',
    priority: 10,
  },
  {
    id: 'fb-briefing',
    title: 'DAILY BRIEFING',
    description: 'Tasks, goals, alerts at a glance.',
    icon: 'WbSunnyRounded',
    text: 'Give me my daily briefing',
    priority: 9,
  },
  {
    id: 'fb-consilium',
    title: 'ASK THE CONSILIUM',
    description: 'Multi-perspective AI board discussion.',
    icon: 'BalanceRounded',
    text: "Let's discuss with the consilium",
    priority: 8,
  },
  {
    id: 'fb-report',
    title: 'GENERATE A REPORT',
    description: 'Finance, partner perf, ops, executive.',
    icon: 'AssessmentRounded',
    text: 'Generate a smart report',
    priority: 7,
  },
  {
    id: 'fb-talk',
    title: "LET'S TALK",
    description: 'Brainstorm — no actions taken.',
    icon: 'ChatBubbleOutlineRounded',
    text: "Let's just think through something together",
    priority: 6,
  },
  {
    id: 'fb-marketplace',
    title: 'BROWSE THE MARKETPLACE',
    description: 'Skills, tools, replicators.',
    icon: 'StorefrontRounded',
    text: "Show me what's on the marketplace",
    priority: 5,
  },
];

function padWithFallback(dynamic) {
  if (dynamic.length >= MAX_BANNERS) return dynamic.slice(0, MAX_BANNERS);
  const taken = new Set(dynamic.map((b) => b.id));
  const padded = [...dynamic];
  for (const fb of FALLBACK_BANNERS) {
    if (padded.length >= MAX_BANNERS) break;
    if (!taken.has(fb.id)) padded.push(fb);
  }
  return padded.slice(0, MAX_BANNERS);
}

function humanizeTool(toolName) {
  const labels = {
    'goal.list': 'list goals',
    'goal.create': 'create a goal',
    'partner.list': 'list partners',
    'task.list': 'list tasks',
    'workflow.list': 'list workflows',
    'workflow.execute': 'run a workflow',
    'report.summary': 'a report summary',
    'report.generate': 'generate a report',
    'consilium.discuss': 'ask the consilium',
    'kb.search': 'search the knowledge base',
  };
  return labels[toolName] || toolName;
}

async function buildBanners(client, userId) {
  const weekAgo = isoDaysFromNow(-7);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [pendingCalls, approvalGoals, tasksDueToday, activeGoals, recentDecisions, recentCommands] =
    await Promise.all([
      safeCount(
        client
          .from('pending_tool_calls')
          .select('id', { count: 'exact', head: true })
          .is('resolved_at', null)
          .gt('expires_at', new Date().toISOString())
      ),
      safeCount(
        client
          .from('goals')
          .select('id', { count: 'exact', head: true })
          .in('status', APPROVAL_GOAL_STATUSES)
      ),
      safeCount(
        client
          .from('team_tasks')
          .select('id', { count: 'exact', head: true })
          .in('status', OPEN_TASK_STATUSES)
          .gte('deadline', todayStart.toISOString())
          .lte('deadline', todayEnd.toISOString())
      ),
      safeCount(
        client
          .from('goals')
          .select('id', { count: 'exact', head: true })
          .in('status', ACTIVE_GOAL_STATUSES)
          .gte('updated_at', weekAgo)
      ),
      safeData(
        client
          .from('concilium_evaluations')
          .select('id, topic, created_at')
          .gte('created_at', weekAgo)
          .order('created_at', { ascending: false })
          .limit(3),
        []
      ),
      safeData(
        client
          .from('command_history')
          .select('parsed_intent')
          .gte('created_at', weekAgo)
          .neq('parsed_intent', 'conversation')
          .limit(50),
        []
      ),
    ]);

  const dynamic = [];

  if (pendingCalls && pendingCalls > 0) {
    dynamic.push({
      id: 'dyn-pending',
      title: `${pendingCalls} ${pendingCalls === 1 ? 'ACTION' : 'ACTIONS'} PENDING APPROVAL`,
      description: 'Review and approve.',
      icon: 'HourglassEmptyRounded',
      text: 'Show my pending approvals',
      priority: 100,
      count: pendingCalls,
    });
  }

  if (approvalGoals && approvalGoals > 0) {
    dynamic.push({
      id: 'dyn-approval-goals',
      title: `${approvalGoals} ${approvalGoals === 1 ? 'GOAL' : 'GOALS'} AWAITING REVIEW`,
      description: 'Awaiting your sign-off.',
      icon: 'AssignmentTurnedInRounded',
      text: 'Show goals waiting for my approval',
      priority: 90,
      count: approvalGoals,
    });
  }

  if (tasksDueToday && tasksDueToday > 0) {
    dynamic.push({
      id: 'dyn-tasks-today',
      title: `TODAY'S TASKS (${tasksDueToday})`,
      description: 'Everything on your plate today.',
      icon: 'CalendarMonthOutlined',
      text: 'What tasks are due today?',
      priority: 80,
      count: tasksDueToday,
    });
  }

  if (activeGoals && activeGoals > 0) {
    dynamic.push({
      id: 'dyn-active-goals',
      title: `${activeGoals} ${activeGoals === 1 ? 'GOAL' : 'GOALS'} IN MOTION`,
      description: 'Live progress.',
      icon: 'AccountTreeOutlined',
      text: 'Show me my active goals',
      priority: 70,
      count: activeGoals,
      showProgress: true,
    });
  }

  if (recentDecisions.length > 0) {
    dynamic.push({
      id: 'dyn-decisions',
      title: 'RECENT BOARD DECISIONS',
      description: `${recentDecisions.length} this week.`,
      icon: 'BalanceRounded',
      text: 'Show recent consilium decisions',
      priority: 60,
      count: recentDecisions.length,
    });
  }

  if (recentCommands.length > 0) {
    const counts = {};
    for (const r of recentCommands) {
      const t = r.parsed_intent;
      if (t) counts[t] = (counts[t] || 0) + 1;
    }
    const topTool = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (topTool && topTool !== 'conversation') {
      dynamic.push({
        id: 'dyn-rerun',
        title: `RERUN: ${humanizeTool(topTool).toUpperCase()}`,
        description: 'Your most-used command this week.',
        icon: 'ReplayRounded',
        text: `Run that again — ${humanizeTool(topTool)}`,
        priority: 50,
      });
    }
  }

  // Sort by priority desc and pad with fallback set.
  dynamic.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  return padWithFallback(dynamic);
}

export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return jsonError(res, 405, 'GET only');

  const done = log.startTimer(req, 'request', { method: req.method });

  const token = getBearerToken(req);
  const user = await verifySupabaseToken(token);
  if (!user) {
    done({ status: 401 });
    return jsonError(res, 401, 'Unauthorized');
  }

  const rlKey = `assistant-home-summary:${getRateLimitIdentifier(req, user.id)}`;
  const rl = checkRateLimit({ key: rlKey, limit: 30, windowMs: 60_000 });
  applyRateLimitHeaders(res, rl);
  if (!rl.allowed) {
    done({ status: 429 });
    return jsonError(res, 429, 'Rate limit exceeded');
  }

  const client = buildSupabaseUserClient(token);
  if (!client) {
    done({ status: 503 });
    return jsonError(res, 503, 'Database not configured');
  }

  const weekFromNow = isoDaysFromNow(7);

  // Run banner generation and legacy counts in parallel.
  const [banners, activeGoalsLegacy, tasksDueThisWeek, workflows, boards, recentReports, partners] =
    await Promise.all([
      buildBanners(client, user.id).catch((err) => {
        log.warn(req, 'banners.failed', { error: err?.message });
        return padWithFallback([]);
      }),
      safeCount(
        client
          .from('goals')
          .select('id', { count: 'exact', head: true })
          .in('status', ACTIVE_GOAL_STATUSES)
      ),
      safeCount(
        client
          .from('team_tasks')
          .select('id', { count: 'exact', head: true })
          .in('status', OPEN_TASK_STATUSES)
          .lte('deadline', weekFromNow)
      ),
      safeCount(
        client.from('workflows').select('id', { count: 'exact', head: true }).eq('enabled', true)
      ),
      safeCount(client.from('concilium_boards_v2').select('id', { count: 'exact', head: true })),
      safeCount(
        client
          .from('report_kpi_snapshots')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', isoDaysFromNow(-30))
      ),
      safeCount(client.from('partners').select('id', { count: 'exact', head: true })),
    ]);

  done({ status: 200 });
  return res.status(200).json({
    ok: true,
    banners,
    greeting: {
      firstName: firstNameFrom(user),
      timeOfDay: timeOfDay(),
    },
    // Legacy fields (back-compat with existing callers)
    activeGoals: activeGoalsLegacy,
    tasksDueThisWeek,
    workflows,
    boards,
    recentReports,
    partners,
    generatedAt: new Date().toISOString(),
  });
}
