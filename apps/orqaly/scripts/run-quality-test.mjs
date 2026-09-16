#!/usr/bin/env node
/**
 * Quality Test Runner — creates a test goal, polls to completion, runs the
 * rubric against all deliverables, writes a report.
 *
 * Usage:
 *   node scripts/run-quality-test.mjs --goal=landing-page
 *   node scripts/run-quality-test.mjs --goal=all --baseline
 *   node scripts/run-quality-test.mjs --goal=smm-strategy --budget=5
 *
 * Flags:
 *   --goal=<key>       Goal key from test-prompts.json or 'all'
 *   --baseline         Tag the run as baseline in the output filename
 *   --budget=<num>     Override the prompt's budget_usd
 *   --watch-only=<id>  Skip goal creation, just watch an existing goal id
 *   --max-wait=<min>   Max minutes to wait for completion (default 45)
 *   --dry-run          Print what it would do without creating a goal
 *
 * Output:
 *   test-results/<timestamp>-<goal-key>.json  — full scorecard
 *   test-results/<timestamp>-<goal-key>.md    — human-readable summary
 *
 * Budget safety:
 *   Hard-aborts a goal if spent_usd exceeds 2× the configured budget.
 */
import { admin } from './_lib/admin-client.mjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enqueueAgentJob } from '../lib/goal-handlers/_helpers.js';
import {
  scoreCopywriting,
  scoreCodeDeployment,
  scoreVisualAsset,
  scoreStrategyDoc,
  buildScorecardRow,
} from '../lib/quality/rubric.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const RESULTS_DIR = resolve(REPO_ROOT, 'test-results');
const PROMPTS_PATH = resolve(__dirname, 'test-prompts.json');

// ── CLI args ──────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? true];
    }
    return [a, true];
  })
);

const goalKey = args.goal;
if (!goalKey) {
  console.error(
    'Usage: node scripts/run-quality-test.mjs --goal=<key>|all [--baseline] [--budget=N] [--watch-only=<id>] [--max-wait=<min>] [--dry-run]'
  );
  process.exit(1);
}

const prompts = JSON.parse(readFileSync(PROMPTS_PATH, 'utf8'));
const goalKeys =
  goalKey === 'all' ? Object.keys(prompts).filter((k) => !k.startsWith('_')) : [goalKey];

for (const k of goalKeys) {
  if (!prompts[k]) {
    console.error(
      `Unknown goal key: ${k}. Available: ${Object.keys(prompts)
        .filter((x) => !x.startsWith('_'))
        .join(', ')}`
    );
    process.exit(1);
  }
}

const isBaseline = !!args.baseline;
const maxWaitMin = Number(args['max-wait']) || 45;
const dryRun = !!args['dry-run'];

mkdirSync(RESULTS_DIR, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────

function fmt(ts) {
  if (!ts) return '           ';
  return new Date(ts).toISOString().replace('T', ' ').replace(/\..+/, '');
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function findUserId() {
  // Use the most recent goal's user_id so we create test goals as the same user
  const { data } = await admin
    .from('goals')
    .select('user_id')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.user_id || null;
}

async function createGoal(prompt, userIdOverride) {
  const candidateUserId = userIdOverride || (await findUserId());
  const userId = typeof candidateUserId === 'string' ? candidateUserId.trim() : '';
  if (!userId) {
    throw new Error(
      'Could not determine user_id — no existing goals in DB. Provide --user-id=<uuid>.'
    );
  }

  const budget = Number(args.budget) || prompt.budget_usd || 10;

  const { data, error } = await admin
    .from('goals')
    .insert({
      user_id: userId,
      title: prompt.title,
      description: prompt.description,
      status: 'feasibility',
      budget_usd: budget,
      mode: prompt.mode || 'simple',
      parsed_priority: 'high',
      execution_mode: 'auto',
      data: { test_run: true, test_key: goalKey, test_started_at: new Date().toISOString() },
    })
    .select('id, title, user_id, budget_usd')
    .single();

  if (error) throw new Error(`Goal insert failed: ${error.message}`);
  const ownerId = typeof data?.user_id === 'string' ? data.user_id.trim() : '';
  if (!ownerId || ownerId !== userId) {
    throw new Error('Goal insert returned an invalid or mismatched durable owner');
  }

  // Enqueue the first pipeline action
  await enqueueAgentJob(admin, {
    user_id: ownerId,
    payload: {
      type: 'orchestrate-goal',
      action: 'feasibility-analysis',
      goalId: data.id,
      _userId: ownerId,
      userId: ownerId,
      user_id: ownerId,
      _testRun: true,
    },
  });

  return data;
}

async function loadGoal(goalId) {
  const { data, error } = await admin.from('goals').select('*').eq('id', goalId).single();
  if (error) throw new Error(`Goal load failed: ${error.message}`);
  return data;
}

async function loadTasks(goalId) {
  const { data } = await admin
    .from('team_tasks')
    .select('id, title, status, data, created_at, updated_at')
    .or(`goal_id.eq.${goalId},data->>goal_id.eq.${goalId}`)
    .order('created_at', { ascending: true });
  return data || [];
}

async function loadJobs(goalId) {
  const { data } = await admin
    .from('agent_jobs')
    .select('id, status, retry_count, error, payload, created_at, updated_at')
    .filter('payload->>goalId', 'eq', goalId)
    .order('created_at', { ascending: true });
  return data || [];
}

async function loadEvents(goalId) {
  const { data } = await admin
    .from('goal_log')
    .select('event_type, details, cost_usd, created_at')
    .eq('goal_id', goalId)
    .order('created_at', { ascending: true });
  return data || [];
}

async function loadKbDocs(goalId) {
  const { data } = await admin
    .from('knowledge_documents')
    .select('id, title, category, content, metadata, created_at')
    .eq('goal_id', goalId);
  return data || [];
}

async function pollUntilTerminal(goalId, budget) {
  const TERMINAL = new Set(['completed', 'cancelled', 'needs_human', 'failed']);
  const hardAbortBudget = budget * 2;
  const deadline = Date.now() + maxWaitMin * 60_000;
  let lastStatus = null;
  let iter = 0;

  console.log(
    `\n[${goalId}] polling (max ${maxWaitMin} min, abort at $${hardAbortBudget.toFixed(2)})...`
  );

  while (Date.now() < deadline) {
    iter++;
    const goal = await loadGoal(goalId);
    const spent = Number(goal.spent_usd || 0);

    if (goal.status !== lastStatus) {
      console.log(
        `  [${fmt(new Date())}] status=${goal.status} spent=$${spent.toFixed(4)}/${budget}`
      );
      lastStatus = goal.status;
    }

    if (TERMINAL.has(goal.status)) {
      console.log(`  → terminal: ${goal.status}`);
      return goal;
    }

    if (spent > hardAbortBudget) {
      console.log(
        `  → ABORTING: spent $${spent.toFixed(4)} > hard-abort $${hardAbortBudget.toFixed(2)}`
      );
      await admin
        .from('goals')
        .update({
          status: 'cancelled',
          data: { ...(goal.data || {}), abort_reason: 'hard_budget_exceeded' },
        })
        .eq('id', goalId);
      return await loadGoal(goalId);
    }

    await sleep(iter < 5 ? 5000 : 15000);
  }

  console.log(`  → TIMEOUT after ${maxWaitMin} min`);
  return await loadGoal(goalId);
}

async function scoreTask(task) {
  const output = task.data?.output || '';
  const type = task.data?.deliverable_type || 'markdown';

  const scores = {};

  // Always score copywriting on any text output
  if (output.length > 0) {
    scores.copywriting = scoreCopywriting(output);
  }

  // Type-specific
  if (type === 'code' || type === 'deployment') {
    // Accept DEPLOYMENT_URL marker OR any bare github.io / vercel.app URL.
    // GitHub Pages is the default deployment path (no phone verification
    // required, reuses existing GITHUB_TOKEN).
    const deployMatch =
      output.match(/DEPLOYMENT_URL:\s*(https?:\/\/[^\s)<>"']+)/i) ||
      output.match(/https?:\/\/[^\s)<>"']*\.github\.io[^\s)<>"']*/) ||
      output.match(/https?:\/\/[^\s)<>"']+\.vercel\.app[^\s)<>"']*/);
    const repoMatch =
      output.match(/GITHUB_REPO:\s*(https?:\/\/[^\s)<>"']+)/i) ||
      output.match(/https?:\/\/github\.com\/[\w.-]+\/[\w.-]+/);
    scores.deployment = await scoreCodeDeployment({
      deploymentUrl: deployMatch ? deployMatch[1] || deployMatch[0] : null,
      repoUrl: repoMatch ? repoMatch[1] || repoMatch[0] : null,
    });
  }

  if (type === 'asset') {
    const imgMatch =
      output.match(/ASSET_URL:\s*(https?:\/\/[^\s)<>"']+)/i) ||
      output.match(/https?:\/\/[^\s)<>"']+\.(?:png|jpg|jpeg|webp|gif|svg)/i);
    scores.asset = imgMatch
      ? await scoreVisualAsset(imgMatch[1] || imgMatch[0])
      : { passed: false, score: 0, feedback: 'No image URL found in output' };
  }

  if (type === 'strategy' || type === 'data' || /strategy|calendar/i.test(task.title || '')) {
    scores.strategy = await scoreStrategyDoc(output);
  }

  // Composite
  const subscores = Object.values(scores)
    .map((s) => s.score || 0)
    .filter((s) => typeof s === 'number');
  const composite =
    subscores.length > 0 ? Math.round(subscores.reduce((a, b) => a + b, 0) / subscores.length) : 0;
  const passed = Object.values(scores).every((s) => s.passed !== false);

  return {
    taskId: task.id,
    title: task.title,
    type,
    status: task.status,
    outputLen: output.length,
    toolCallCount: Array.isArray(task.data?.toolLog) ? task.data.toolLog.length : 0,
    reportedQualityScore: task.data?.quality_score,
    score: composite,
    passed,
    scores,
  };
}

async function buildReport(goal, prompt) {
  const tasks = await loadTasks(goal.id);
  const jobs = await loadJobs(goal.id);
  const events = await loadEvents(goal.id);
  const kbDocs = await loadKbDocs(goal.id);

  const taskScores = [];
  for (const task of tasks) {
    taskScores.push(await scoreTask(task));
  }

  const passedTasks = taskScores.filter((t) => t.passed).length;
  const avgScore =
    taskScores.length > 0
      ? Math.round(taskScores.reduce((s, t) => s + t.score, 0) / taskScores.length)
      : 0;

  // Cross-feature writes
  const crossFeature = {
    kb_docs: kbDocs.length,
    kb_has_goal_id: kbDocs.length > 0,
    events: events.length,
    jobs: jobs.length,
    has_deployment_url: !!goal.data?.deployment_url,
    has_deliverables: !!(goal.data?.deliverables && goal.data.deliverables.length > 0),
  };

  // Tool usage summary
  const toolUsage = {};
  for (const t of tasks) {
    const toolLog = t.data?.toolLog || [];
    for (const entry of toolLog) {
      const toolName = entry.tool || entry.name || 'unknown';
      toolUsage[toolName] = (toolUsage[toolName] || 0) + 1;
    }
  }
  const totalToolCalls = Object.values(toolUsage).reduce((s, n) => s + n, 0);

  // Verdict
  const verdict =
    goal.status === 'completed' && passedTasks === taskScores.length && passedTasks > 0
      ? 'PASS'
      : goal.status === 'completed'
        ? 'PARTIAL'
        : 'FAIL';

  return {
    goalKey,
    goalId: goal.id,
    goalTitle: goal.title,
    mode: goal.mode,
    prompt: {
      description: prompt.description,
      budget: prompt.budget_usd,
      expectedDeliverable: prompt.deliverable_type_expected,
    },
    finalStatus: goal.status,
    failureReason: goal.data?.failure_reason || null,
    spent: Number(goal.spent_usd || 0),
    budget: Number(goal.budget_usd || 0),
    iterations: goal.iteration,
    phaseCount: (goal.plan?.phases || []).length,
    taskCount: tasks.length,
    passedTasks,
    avgTaskScore: avgScore,
    totalToolCalls,
    toolUsage,
    crossFeature,
    verdict,
    tasks: taskScores,
    eventTypes: events.map((e) => e.event_type),
  };
}

function writeMarkdownReport(report, path) {
  const lines = [];
  lines.push(`# Test Report: ${report.goalKey}`);
  lines.push('');
  lines.push(`**Goal:** ${report.goalTitle}`);
  lines.push(`**Goal ID:** \`${report.goalId}\``);
  lines.push(`**Mode:** ${report.mode}`);
  lines.push(`**Final status:** ${report.finalStatus}`);
  if (report.failureReason) lines.push(`**Failure reason:** ${report.failureReason}`);
  lines.push(`**Spend:** $${report.spent.toFixed(4)} / $${report.budget}`);
  lines.push(
    `**Phases:** ${report.phaseCount}, **tasks:** ${report.taskCount}, **passed:** ${report.passedTasks}/${report.taskCount}`
  );
  lines.push(`**Iterations:** ${report.iterations}`);
  lines.push(`**Avg task score:** ${report.avgTaskScore}/100`);
  lines.push(
    `**Tool calls:** ${report.totalToolCalls} (${
      Object.entries(report.toolUsage)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ') || 'none'
    })`
  );
  lines.push(
    `**Cross-feature writes:** KB=${report.crossFeature.kb_docs}, deployment_url=${report.crossFeature.has_deployment_url}, deliverables=${report.crossFeature.has_deliverables}`
  );
  lines.push('');
  lines.push(`## VERDICT: ${report.verdict}`);
  lines.push('');
  lines.push('## Per-task scores');
  lines.push('');
  lines.push('| # | Title | Type | Status | Score | Passed | Tools | Output len |');
  lines.push('|---|---|---|---|---|---|---|---|');
  for (const [i, t] of report.tasks.entries()) {
    lines.push(
      `| ${i + 1} | ${t.title} | ${t.type} | ${t.status} | ${t.score} | ${t.passed ? '✅' : '❌'} | ${t.toolCallCount} | ${t.outputLen} |`
    );
  }
  lines.push('');
  lines.push('## Sub-scores per task');
  lines.push('');
  for (const t of report.tasks) {
    lines.push(`### ${t.title}`);
    for (const [category, score] of Object.entries(t.scores)) {
      lines.push(
        `- **${category}**: ${score.score}/100 ${score.passed ? '✅' : '❌'} — ${score.feedback || '(no feedback)'}`
      );
      if (score.subscores) {
        for (const [sk, sv] of Object.entries(score.subscores)) {
          lines.push(`  - ${sk}: ${sv.score ?? '-'}/100 — ${sv.feedback || ''}`);
        }
      }
    }
    lines.push('');
  }
  writeFileSync(path, lines.join('\n'));
}

// ── Main ─────────────────────────────────────────────────────

async function runOne(key) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Running test: ${key}`);
  console.log('='.repeat(70));

  const prompt = prompts[key];
  console.log(`Title: ${prompt.title}`);
  console.log(`Budget: $${prompt.budget_usd} (mode=${prompt.mode})`);

  if (dryRun) {
    console.log('[dry-run] would create goal + poll to completion');
    return null;
  }

  let goal;
  if (args['watch-only']) {
    console.log(`Watch-only mode: ${args['watch-only']}`);
    goal = await loadGoal(args['watch-only']);
  } else {
    goal = await createGoal(prompt, args['user-id']);
    console.log(`Created goal: ${goal.id}`);
  }

  const finalGoal = await pollUntilTerminal(goal.id, Number(args.budget) || prompt.budget_usd);

  console.log('\nScoring deliverables...');
  const report = await buildReport(finalGoal, prompt);

  const stamp = nowStamp();
  const baselineTag = isBaseline ? 'baseline-' : '';
  const jsonPath = resolve(RESULTS_DIR, `${baselineTag}${stamp}-${key}.json`);
  const mdPath = resolve(RESULTS_DIR, `${baselineTag}${stamp}-${key}.md`);

  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeMarkdownReport(report, mdPath);

  console.log(`\n${'─'.repeat(70)}`);
  console.log(
    `VERDICT: ${report.verdict}  (${report.finalStatus}, spent $${report.spent.toFixed(4)}, avg score ${report.avgTaskScore}/100)`
  );
  console.log(
    `  Tasks: ${report.passedTasks}/${report.taskCount} passed, ${report.totalToolCalls} tool calls`
  );
  console.log(`  Report: ${mdPath}`);
  console.log('─'.repeat(70));

  return report;
}

async function main() {
  if (!existsSync(RESULTS_DIR)) mkdirSync(RESULTS_DIR, { recursive: true });

  const reports = [];
  for (const key of goalKeys) {
    try {
      const report = await runOne(key);
      if (report) reports.push(report);
    } catch (err) {
      console.error(`\n[${key}] FATAL:`, err.message);
      reports.push({ goalKey: key, verdict: 'ERROR', error: err.message });
    }
  }

  if (reports.length > 1) {
    // Summary across all
    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70));
    console.log('| Goal | Verdict | Status | Spent | Avg Score | Passed |');
    console.log('|---|---|---|---|---|---|');
    for (const r of reports) {
      console.log(
        `| ${r.goalKey} | ${r.verdict} | ${r.finalStatus || '—'} | $${(r.spent || 0).toFixed(4)} | ${r.avgTaskScore ?? '—'} | ${r.passedTasks ?? 0}/${r.taskCount ?? 0} |`
      );
    }
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
