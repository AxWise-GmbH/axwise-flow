/**
 * Stage 7b: Evaluate Phase
 *
 * Collects task outputs, runs PM quality review, updates financial tracking,
 * saves outputs to KB, and decides next action (next phase / iterate / complete).
 *
 * Extracted from goal-orchestrator.js — preserves original behavior.
 */
import { createHash, randomUUID } from 'node:crypto';
import { executeLlm, parseLlmJson } from '../../agent-handlers/llm-executor.js';
import { createLogger } from '../../../api/_lib/logger.js';
import { orgScopeFromGoal } from '../../_shared/kb-scope.js';
import {
  logGoalEvent,
  updateGoal,
  loadGoal,
  enqueueGoalAction,
  trackTokenSpend,
  recordStageLlmUsage,
  pickTestModel,
  updateGoalIfStatus,
  deterministicAgentJobId,
  enqueueAgentJob,
} from '../_helpers.js';
import {
  runConsiliumPhaseReview,
  checkAgentAccountability,
  checkBudgetHealth,
} from './consilium-review.js';
import { consiliumFeedback } from '../goal-messaging.js';
import { scoreBannedPhrases } from '../../quality/rubric.js';
import { currentGoalTaskAttempt } from '../current-goal-task-attempt.js';
import { goalDocumentAttemptMetadata } from '../../_shared/goal-document-attempt.js';
import { resolveAcceptedNativeGoalAuthority } from '../../_shared/native-goal-authority.js';
import { stripRuntimePlanState } from '../../_shared/plan-snapshot.js';
import { canonicalContractHash } from '../../agent-handlers/compact-agent-contracts.js';
import { hashApprovalSnapshot } from '../approval-audit.js';

const log = createLogger('goal-stage:evaluate-phase');

export const EVALUATION_DIGEST_MAX_CHARS = 3000;
export const NATIVE_PHASE_EVALUATION_ATTEMPT_VERSION = 'orqaly_native_phase_evaluation_attempt_v1';
const NATIVE_EVALUATION_LEASE_MS = 15 * 60 * 1000;

function scopeToken(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function sortedStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(scopeToken).filter(Boolean))].sort();
}

function sha256Text(value) {
  return createHash('sha256')
    .update(String(value || ''), 'utf8')
    .digest('hex');
}

function nativeTaskReceipt(task) {
  const context = task?.data?.axwise_execution_context || {};
  return {
    task_id: scopeToken(task?.id),
    job_id: scopeToken(task?.job_pool_id),
    status: scopeToken(task?.status),
    agent_id: scopeToken(task?.agent_id),
    assigned_to: scopeToken(task?.assigned_to),
    formation_attempt: scopeToken(task?.materialization_attempt),
    work_attempt: scopeToken(task?.data?.materialization_attempt),
    phase_index: Number.isInteger(Number(task?.data?.phase_index))
      ? Number(task.data.phase_index)
      : -1,
    step_id: scopeToken(task?.data?.axwise_step_id),
    authorization_snapshot_hash: scopeToken(context.authorization_snapshot_hash),
    authorization_task_id: scopeToken(context.authorization_task_id),
    authorization_agent_id: scopeToken(context.authorization_agent_id),
    deliverable_type: scopeToken(task?.data?.deliverable_type),
    tool_log: task?.data?.toolLog ?? [],
    output_sha256: sha256Text(task?.data?.output),
  };
}

function nativePhaseTaskProjection(goal, tasks, phaseIndex) {
  const phase = goal?.plan?.phases?.[phaseIndex];
  const jobs = Array.isArray(phase?.jobs) ? phase.jobs : [];
  const expectedStepIds = jobs.map(
    (_job, jobIndex) => `phase-${phaseIndex + 1}-job-${jobIndex + 1}`
  );
  const reasons = [];
  const projected = [];

  for (const task of tasks || []) {
    const stepId = scopeToken(task?.data?.axwise_step_id);
    const match = /^phase-(\d+)-job-(\d+)$/.exec(stepId);
    const stepPhaseIndex = match ? Number(match[1]) - 1 : -1;
    const jobIndex = match ? Number(match[2]) - 1 : -1;
    const job = stepPhaseIndex === phaseIndex ? jobs[jobIndex] : null;
    if (!job) {
      reasons.push(`native_task_plan_coordinate_invalid:${scopeToken(task?.id) || 'unknown'}`);
      continue;
    }
    projected.push({
      ...task,
      title: job.title || 'Approved native task',
      description: job.description || '',
      data: {
        ...(task.data || {}),
        required_role: job.required_role || null,
        deliverable_type: job.deliverable_type || 'markdown',
        requirement_ids: Array.isArray(job.requirement_ids) ? job.requirement_ids : [],
        tool_requirements: Array.isArray(job.tool_requirements) ? job.tool_requirements : [],
        acceptance_criteria: Array.isArray(job.acceptance_criteria) ? job.acceptance_criteria : [],
      },
    });
  }

  const actualStepIds = sortedStrings(projected.map((task) => task.data?.axwise_step_id));
  if (
    expectedStepIds.length < 1 ||
    projected.length !== expectedStepIds.length ||
    actualStepIds.length !== projected.length ||
    JSON.stringify(sortedStrings(expectedStepIds)) !== JSON.stringify(actualStepIds)
  ) {
    reasons.push('native_phase_task_set_does_not_match_sealed_plan');
  }
  return { tasks: projected, reasons };
}

/**
 * Build the immutable receipt set one evaluator is allowed to grade.  The
 * database recomputes these receipts under a goal-row lock in migration 224;
 * this application projection exists to reject malformed authority before a
 * provider call and to supply the expected cross-table snapshot to the RPC.
 */
export function buildNativePhaseEvaluationSeal({ goal, tasks, phaseJobs, phaseIndex, payload }) {
  const authority = resolveAcceptedNativeGoalAuthority(goal);
  const data = goal?.data || {};
  const planning = data.native_planning_attempt || {};
  const formation = data.team_formation_attempt || {};
  const nativeFormation = data.native_team_formation_attempt || {};
  const work = data.team_work_materialization || {};
  const approval = data.goal_approvals?.execution || {};
  const authorization = data.execution_authorization || {};
  const manifest = authorization.manifest || {};
  const phase = goal?.plan?.phases?.[phaseIndex] || {};
  const scopeHash = scopeToken(authority.packet?.scope_hash);
  const formationAttempt = scopeToken(formation.attempt_id);
  const workAttempt = scopeToken(work.research_attempt_key) || formationAttempt;
  const reasons = [];

  if (!authority.native || !authority.ready) reasons.push(...(authority.reasons || []));
  if (!goal?.id || !goal?.user_id || !goal?.updated_at || goal.status !== 'active') {
    reasons.push('native_evaluation_goal_lifecycle_invalid');
  }
  if (
    planning.version !== 'orqaly_native_planning_attempt_v1' ||
    planning.status !== 'completed' ||
    !scopeToken(planning.attempt_id) ||
    planning.scope_hash !== scopeHash ||
    !/^[0-9a-f]{64}$/.test(scopeToken(planning.plan_hash)) ||
    !planning.plan_snapshot ||
    typeof planning.plan_snapshot !== 'object' ||
    Array.isArray(planning.plan_snapshot) ||
    hashApprovalSnapshot('native-execution-plan', planning.plan_snapshot) !== planning.plan_hash ||
    canonicalContractHash(stripRuntimePlanState(goal.plan)) !==
      canonicalContractHash(stripRuntimePlanState(planning.plan_snapshot))
  ) {
    reasons.push('native_evaluation_planning_seal_invalid');
  }
  if (
    formation.version !== 'orqaly_team_formation_attempt_v1' ||
    formation.status !== 'completed' ||
    !formationAttempt ||
    formation.scope_hash !== scopeHash ||
    formation.planning_attempt_id !== planning.attempt_id ||
    formation.plan_hash !== planning.plan_hash ||
    canonicalContractHash(nativeFormation) !== canonicalContractHash(formation)
  ) {
    reasons.push('native_evaluation_formation_seal_invalid');
  }
  if (
    work.version !== 'orqaly_team_work_materialization_v1' ||
    work.formation_attempt !== formationAttempt ||
    work.native_scope_hash !== scopeHash ||
    !workAttempt
  ) {
    reasons.push('native_evaluation_work_materialization_invalid');
  }
  if (
    !Number.isInteger(phaseIndex) ||
    phaseIndex < 0 ||
    phase.status !== 'executing' ||
    !phase.started_at
  ) {
    reasons.push('native_evaluation_phase_lifecycle_invalid');
  }

  const executionHash = scopeToken(approval.snapshot_hash);
  const nativeAuthorizationScope = manifest.native_scope_authority || {};
  const nativeStageChain = manifest.native_stage_chain || {};
  if (
    approval.status !== 'approved' ||
    !executionHash ||
    authorization.status !== 'approved' ||
    authorization.snapshot_hash !== executionHash ||
    manifest.valid !== true ||
    nativeAuthorizationScope.status !== 'accepted' ||
    nativeAuthorizationScope.scope_hash !== scopeHash ||
    nativeStageChain.status !== 'completed' ||
    nativeStageChain.scope_hash !== scopeHash ||
    nativeStageChain.team_formation_attempt_id !== formationAttempt
  ) {
    reasons.push('native_evaluation_execution_authorization_invalid');
  }

  const projected = nativePhaseTaskProjection(goal, tasks, phaseIndex);
  reasons.push(...projected.reasons);
  const authorizationByTask = new Map(
    (Array.isArray(manifest.tasks) ? manifest.tasks : []).map((item) => [
      scopeToken(item?.task_id),
      item,
    ])
  );
  for (const task of projected.tasks) {
    const context = task.data?.axwise_execution_context || {};
    const taskAuthorization = authorizationByTask.get(scopeToken(task.id));
    if (
      scopeToken(task.goal_id || task.data?.goal_id) !== scopeToken(goal.id) ||
      scopeToken(task.user_id) !== scopeToken(goal.user_id) ||
      task.materialization_attempt !== formationAttempt ||
      task.data?.materialization_attempt !== workAttempt ||
      !['done', 'failed'].includes(scopeToken(task.status)) ||
      !taskAuthorization ||
      scopeToken(taskAuthorization.agent_id) !== scopeToken(task.agent_id) ||
      context.authorization_status !== 'approved' ||
      context.authoritative !== true ||
      context.executable !== true ||
      context.authorization_snapshot_hash !== executionHash ||
      scopeToken(context.authorization_task_id) !== scopeToken(task.id) ||
      scopeToken(context.authorization_agent_id) !== scopeToken(task.agent_id)
    ) {
      reasons.push(`native_evaluation_task_authority_invalid:${scopeToken(task.id) || 'unknown'}`);
    }
  }

  const taskIds = sortedStrings(projected.tasks.map((task) => task.id));
  const queuedAttempt = payload?.evaluationAttempt || {};
  const queuedTaskIds = Array.isArray(queuedAttempt.task_ids)
    ? queuedAttempt.task_ids.map(scopeToken).filter(Boolean)
    : [];
  if (
    Number(queuedAttempt.version) !== 1 ||
    Number(queuedAttempt.retry_count) !== Number(data.retry_count || 0) ||
    Number(queuedAttempt.iteration) !== Number(goal?.iteration || 0) ||
    scopeToken(queuedAttempt.decision_id) !== scopeToken(data.axwise_orchestration?.decision_id) ||
    Number(queuedAttempt.phase_index) !== phaseIndex ||
    scopeToken(queuedAttempt.phase_started_at) !== scopeToken(phase.started_at) ||
    queuedTaskIds.length !== taskIds.length ||
    JSON.stringify(sortedStrings(queuedTaskIds)) !== JSON.stringify(taskIds)
  ) {
    reasons.push('native_evaluation_queued_attempt_invalid');
  }

  const taskReceipts = projected.tasks
    .map(nativeTaskReceipt)
    .sort((left, right) => left.task_id.localeCompare(right.task_id));
  const jobReceipts = (Array.isArray(phaseJobs) ? phaseJobs : [])
    .map((job) => ({
      job_id: scopeToken(job?.id),
      materialization_attempt: scopeToken(job?.materialization_attempt),
      cost_usd: Number(job?.cost_usd || 0),
    }))
    .sort((left, right) => left.job_id.localeCompare(right.job_id));
  if (
    jobReceipts.length < 1 ||
    jobReceipts.some(
      (job) => !job.job_id || job.materialization_attempt !== formationAttempt || job.cost_usd < 0
    )
  ) {
    reasons.push('native_evaluation_job_set_invalid');
  }
  const agentCosts = {};
  for (const job of phaseJobs || []) {
    const name = scopeToken(job?.assigned_agent_name) || 'unassigned';
    agentCosts[name] = (agentCosts[name] || 0) + Number(job?.cost_usd || 0);
  }

  const identity = {
    version: NATIVE_PHASE_EVALUATION_ATTEMPT_VERSION,
    goal_id: scopeToken(goal?.id),
    user_id: scopeToken(goal?.user_id),
    scope_hash: scopeHash,
    planning_attempt_id: scopeToken(planning.attempt_id),
    plan_hash: scopeToken(planning.plan_hash),
    structural_plan_hash: canonicalContractHash(stripRuntimePlanState(goal?.plan || {})),
    formation_attempt_id: formationAttempt,
    work_attempt_id: workAttempt,
    execution_snapshot_hash: executionHash,
    phase_index: phaseIndex,
    phase_started_at: scopeToken(phase.started_at),
    retry_count: Number(data.retry_count || 0),
    iteration: Number(goal?.iteration || 0),
    decision_id: scopeToken(data.axwise_orchestration?.decision_id) || null,
    feedback_application_version: feedbackApplicationVersionOf(payload) || null,
    task_receipts: taskReceipts,
    task_set_hash: canonicalContractHash(taskReceipts),
    job_receipts: jobReceipts,
    job_set_hash: canonicalContractHash(jobReceipts),
  };
  return {
    ready: reasons.length === 0,
    reasons: [...new Set(reasons)],
    authority,
    projectedTasks: projected.tasks,
    identity,
    attemptId: canonicalContractHash(identity),
    taskReceipts,
    agentCosts,
    phaseCost: jobReceipts.reduce((sum, job) => sum + job.cost_usd, 0),
  };
}

function nativeContinuationPayload(goal, attempt) {
  const continuation = attempt?.continuation;
  if (!continuation?.action) return null;
  const userId = typeof goal?.user_id === 'string' ? goal.user_id.trim() : '';
  if (!userId) throw new Error('Native evaluation continuation requires a durable goal owner');
  return {
    ...(continuation.payload || {}),
    type: 'orchestrate-goal',
    action: continuation.action,
    goalId: goal.id,
    _userId: userId,
    userId,
    user_id: userId,
  };
}

async function enqueueNativeEvaluationContinuation(admin, goal, attempt) {
  const continuationPayload = nativeContinuationPayload(goal, attempt);
  if (!continuationPayload) return null;
  const id = deterministicAgentJobId('native-phase-evaluation-continuation', {
    goal_id: goal.id,
    evaluation_attempt_id: attempt.attempt_id,
    continuation: continuationPayload,
  });
  return enqueueAgentJob(
    admin,
    { id, user_id: goal.user_id, payload: continuationPayload },
    { idempotent: true }
  );
}

export function selectCurrentPhaseTasks(goal, tasks, phaseIndex) {
  return currentGoalTaskAttempt(goal, tasks).filter((task) => {
    const taskPhase = task.data?.phase_index;
    return taskPhase === undefined || taskPhase === phaseIndex;
  });
}

/**
 * Canonical phase artifacts are persisted in full. Prompt digests may be
 * bounded, but the user-facing knowledge document must never silently cut a
 * task in half or discard a later task.
 */
export function buildPhaseKnowledgeContent(tasks) {
  return (Array.isArray(tasks) ? tasks : [])
    .map((task) => `[${task?.title || 'Untitled task'}]: ${task?.data?.output || '(no output)'}`)
    .join('\n\n---\n\n');
}

/**
 * Build a bounded, deterministic review view without starving later tasks.
 * Canonical task output remains in team_tasks; this digest exists only for the
 * evaluator prompt. Explicit boundaries prevent the grader from interpreting
 * an excerpt edge as evidence that the persisted deliverable was truncated.
 */
export function buildEvaluationDigest(tasks, { maxChars = EVALUATION_DIGEST_MAX_CHARS } = {}) {
  const rows = Array.isArray(tasks) ? tasks : [];
  if (rows.length === 0) return '(no completed task outputs)';

  const intro = [
    'EVALUATION DIGEST — FAIR PER-TASK SAMPLING',
    'Every completed task is represented below.',
    'IMPORTANT: excerpt boundaries and omitted-character markers describe prompt sampling only. They are NOT evidence that the persisted deliverable is truncated. Use the persisted character count and task status when judging completeness.',
  ].join('\n');
  const separator = '\n\n';
  const minimumBlockChars = 260;
  const effectiveMaxChars = Math.max(
    maxChars,
    intro.length + separator.length * rows.length + minimumBlockChars * rows.length
  );
  const blockBudget = Math.floor(
    (effectiveMaxChars - intro.length - separator.length * rows.length) / rows.length
  );

  const blocks = rows.map((task, index) => {
    const output = String(task?.data?.output || '');
    const title = String(task?.title || 'Untitled task')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    const status = String(task?.status || 'unknown');
    const header = [
      `=== TASK ${index + 1}/${rows.length}: ${title} ===`,
      `Persisted status: ${status}`,
      `Persisted character count: ${output.length}`,
    ].join('\n');
    const completeOpen = '<<< BEGIN COMPLETE OUTPUT >>>';
    const completeClose = '<<< END COMPLETE OUTPUT >>>';
    const complete = `${header}\n${completeOpen}\n${output || '(no output)'}\n${completeClose}`;
    if (complete.length <= blockBudget) return complete;

    const headOpen = '<<< BEGIN HEAD EXCERPT >>>';
    const headClose = '<<< END HEAD EXCERPT; OUTPUT CONTINUES IN STORAGE >>>';
    const tailOpen = '<<< BEGIN TAIL EXCERPT >>>';
    const tailClose = '<<< END TAIL EXCERPT; FULL OUTPUT REMAINS PERSISTED >>>';
    const fixedLength =
      header.length + headOpen.length + headClose.length + tailOpen.length + tailClose.length + 80;
    const excerptBudget = Math.max(40, blockBudget - fixedLength);
    const headLength = Math.ceil(excerptBudget / 2);
    const tailLength = Math.floor(excerptBudget / 2);
    const head = output.slice(0, headLength).trimEnd();
    const tail = output.slice(-tailLength).trimStart();
    const omitted = Math.max(0, output.length - head.length - tail.length);

    return [
      header,
      headOpen,
      head,
      headClose,
      `<<< ${omitted} CHARACTERS OMITTED FROM EVALUATION PROMPT ONLY >>>`,
      tailOpen,
      tail,
      tailClose,
    ].join('\n');
  });

  return `${intro}${separator}${blocks.join(separator)}`;
}

/**
 * Validate that a "done" task actually produced its expected artifact type.
 * Tasks classified as code/deployment/asset/data must show evidence of real
 * tool use; markdown-only outputs for these types are treated as failures.
 *
 * Returns { valid: boolean, reason?: string }
 */
function validateTaskOutput(task) {
  const type = task.data?.deliverable_type || 'markdown';
  const output = task.data?.output || '';
  const toolLog = task.data?.toolLog || [];
  const usedTools = Array.isArray(toolLog) && toolLog.length > 0;

  if (type === 'markdown') {
    // Banned-phrase gate for markdown deliverables (design briefs, strategy
    // docs, research reports). Lenient threshold: only fail when ≥ 3 distinct
    // banned phrases are present. A single slip produces a warning in the
    // rubric (post-hoc score) without triggering iterate loops. Design briefs
    // often contain fake testimonials/FAQs where the copy-to-be-implemented
    // may legitimately use a few mild clichés; rejecting on 1 phrase led to
    // infinite iteration on test #5 until max_iterations (5) was reached.
    const banned = scoreBannedPhrases(output);
    const BANNED_HARD_FAIL_THRESHOLD = 3;
    if (banned.violations.length >= BANNED_HARD_FAIL_THRESHOLD) {
      const phraseList = banned.violations.map((v) => `"${v.sample}"`).join(', ');
      return {
        valid: false,
        reason: `Markdown output contains ${banned.violations.length} distinct banned AI-slop phrases: ${phraseList}. Rewrite these sentences using specific, concrete language — no clichés. Keep all other content exactly the same.`,
      };
    }
    return { valid: true };
  }

  if (type === 'code') {
    const hasGithubUrl = /github\.com\/[\w-]+\/[\w-]+/.test(output);
    const hasGithubRepoLine = /GITHUB_REPO:\s*https?:\/\//i.test(output);
    if (!hasGithubUrl && !hasGithubRepoLine) {
      return {
        valid: false,
        reason:
          'Code task did not produce a real GitHub repo. Markdown descriptions of code are not acceptable — you must call tool-github__create_repo and tool-github__put_file to commit actual files, then end your output with GITHUB_REPO: <url>.',
      };
    }
    return { valid: true };
  }

  if (type === 'deployment') {
    // Accept any of the supported deployment targets: explicit DEPLOYMENT_URL
    // marker, Cloudflare (*.workers.dev / *.pages.dev), Vercel (*.vercel.app),
    // GitHub Pages (*.github.io), or Netlify (*.netlify.app). The default
    // deployment path is Cloudflare via tool-cloudflare-pages__deploy_site —
    // one call, returns a live .workers.dev URL.
    const hasDeployUrl =
      /DEPLOYMENT_URL:\s*https?:\/\//i.test(output) ||
      /\.workers\.dev\b/.test(output) ||
      /\.pages\.dev\b/.test(output) ||
      /\.vercel\.app\b/.test(output) ||
      /\.github\.io\b/.test(output) ||
      /\.netlify\.app\b/.test(output);
    // Also check toolLog — the agent may have deployed successfully via
    // Cloudflare but not echoed the URL in its text output.
    const calledDeployTool =
      Array.isArray(toolLog) &&
      toolLog.some(
        (t) =>
          /cloudflare|deploy_site/i.test(t.name || '') &&
          (t.result?.deploymentUrl || t.result?.success)
      );
    if (!hasDeployUrl && !calledDeployTool) {
      return {
        valid: false,
        reason:
          'Deployment task did not produce a live URL. You must publish the site via tool_cloudflare_pages__deploy_site and end your output with DEPLOYMENT_URL: <url>. The tool returns a deploymentUrl field — copy it into the DEPLOYMENT_URL: line. Markdown descriptions of how to deploy are not acceptable.',
      };
    }
    return { valid: true };
  }

  if (type === 'asset') {
    const hasImageUrl = /https?:\/\/[^\s<>"']+\.(png|jpg|jpeg|webp|gif|svg)/i.test(output);
    const hasAssetUrlLine = /ASSET_URL:\s*https?:\/\//i.test(output);
    if (!hasImageUrl && !hasAssetUrlLine && !usedTools) {
      return {
        valid: false,
        reason:
          'Asset task did not produce a real image URL. Call mcp-stability-ai (or another image generation tool) and include the resulting URL on a line prefixed with ASSET_URL: in your output.',
      };
    }
    return { valid: true };
  }

  if (type === 'presentation') {
    // Presentation tasks must produce a real PDF via tool_pdf_generator__create_slides
    // which returns a public Supabase Storage URL. Accept any of: an explicit
    // ASSET_URL marker, a bare .pdf URL, a supabase.co storage URL, or evidence
    // of a successful create_slides tool call (tools-used flag is fine since
    // the URL lives in the tool result payload).
    const hasPdfUrl =
      /\.pdf(\?|\b)/i.test(output) ||
      /ASSET_URL:\s*https?:\/\//i.test(output) ||
      /supabase\.co\/storage\/v1\/object\/public\//i.test(output);
    const calledPdfTool =
      Array.isArray(toolLog) &&
      toolLog.some((t) => /pdf.?generator|create_slides/i.test(t.name || ''));
    if (!hasPdfUrl && !calledPdfTool) {
      return {
        valid: false,
        reason:
          'Presentation task did not produce a real PDF. You must call tool_pdf_generator__create_slides with structured slide data ({ projectName, title, slides: [...] }) and end your output with ASSET_URL: <pdfUrl from tool response>. Markdown descriptions of slides are NOT acceptable.',
      };
    }
    return { valid: true };
  }

  if (type === 'data') {
    if (!usedTools) {
      return {
        valid: false,
        reason:
          'Data task ran without calling any tools. You must call tool-web-search, tool-firecrawl, or tool-http-client to fetch real data — descriptions of data sources are not acceptable.',
      };
    }
    return { valid: true };
  }

  return { valid: true };
}

/**
 * Statuses where a task sitting in `planned` is waiting for a person, not
 * stalled. Execution is held at a gate, so re-releasing the phase is the
 * user's move; nothing this stage can do will advance it.
 */
const EXECUTION_HELD_AT_GATE = new Set([
  'awaiting_approval',
  'awaiting_context_approval',
  'awaiting_tools',
  'awaiting_po_input',
  'paused',
  'needs_human',
  'failed',
  'cancelled',
  'completed',
]);

function feedbackApplicationVersionOf(payload) {
  const direct = String(payload?.feedbackApplicationVersion || '').trim();
  if (direct) return direct;
  return String(payload?.evaluationAttempt?.feedback_application_version || '').trim();
}

function activePhaseFeedbackVersion(goal, phaseIndex) {
  const marker = goal?.plan?.phases?.[phaseIndex]?.feedback;
  if (
    marker?.kind !== 'feedback_application' ||
    Number(marker.retry_count || 0) !== Number(goal?.data?.retry_count || 0) ||
    Number(marker.iteration || 0) !== Number(goal?.iteration || 0)
  ) {
    return '';
  }
  return String(marker.application_version || '').trim();
}

export function evaluationAttemptMatchesGoal(goal, payload) {
  const attempt = payload?.evaluationAttempt;
  if (Number(attempt?.version) !== 1) {
    const legacyPhaseIndex = Number(payload?.phaseIndex);
    if (!Number.isInteger(legacyPhaseIndex) || legacyPhaseIndex < 0) return true;
    const feedbackVersion = feedbackApplicationVersionOf(payload);
    const phaseFeedbackVersion = activePhaseFeedbackVersion(goal, legacyPhaseIndex);
    return feedbackVersion
      ? feedbackVersion === phaseFeedbackVersion &&
          feedbackVersion === goal?.data?.last_feedback_application_version
      : !phaseFeedbackVersion;
  }
  const phaseIndex = Number(attempt.phase_index);
  if (!Number.isInteger(phaseIndex) || phaseIndex < 0) return false;
  const phase = goal?.plan?.phases?.[phaseIndex];
  const feedbackVersion = feedbackApplicationVersionOf(payload);
  const phaseFeedbackVersion = activePhaseFeedbackVersion(goal, phaseIndex);
  return (
    Number(goal?.data?.retry_count || 0) === Number(attempt.retry_count) &&
    Number(goal?.iteration || 0) === Number(attempt.iteration) &&
    String(goal?.data?.axwise_orchestration?.decision_id || '') ===
      String(attempt.decision_id || '') &&
    String(phase?.started_at || '') === String(attempt.phase_started_at || '') &&
    (feedbackVersion
      ? feedbackVersion === phaseFeedbackVersion &&
        feedbackVersion === goal?.data?.last_feedback_application_version
      : !phaseFeedbackVersion)
  );
}

function completedNativeEvaluationMatches(goal, payload, attempt) {
  const queued = payload?.evaluationAttempt || {};
  return (
    attempt?.version === NATIVE_PHASE_EVALUATION_ATTEMPT_VERSION &&
    attempt.status === 'completed' &&
    attempt.scope_hash === goal?.data?.axwise_customer_intelligence?.scope_packet?.scope_hash &&
    attempt.planning_attempt_id === goal?.data?.native_planning_attempt?.attempt_id &&
    attempt.plan_hash === goal?.data?.native_planning_attempt?.plan_hash &&
    attempt.formation_attempt_id === goal?.data?.team_formation_attempt?.attempt_id &&
    attempt.execution_snapshot_hash === goal?.data?.goal_approvals?.execution?.snapshot_hash &&
    Number(attempt.phase_index) === Number(payload?.phaseIndex) &&
    Number(queued.version) === 1 &&
    Number(queued.phase_index) === Number(attempt.phase_index) &&
    scopeToken(queued.phase_started_at) === scopeToken(attempt.phase_started_at) &&
    Number(queued.retry_count) === Number(attempt.retry_count) &&
    Number(queued.iteration) === Number(attempt.iteration) &&
    scopeToken(queued.decision_id) === scopeToken(attempt.decision_id) &&
    JSON.stringify(sortedStrings(queued.task_ids)) ===
      JSON.stringify(sortedStrings((attempt.task_receipts || []).map((row) => row.task_id)))
  );
}

async function reserveNativePhaseEvaluation(admin, goal, seal) {
  const prior = goal.data?.native_phase_evaluation_attempt;
  const priorRunCount =
    prior?.version === NATIVE_PHASE_EVALUATION_ATTEMPT_VERSION &&
    prior?.attempt_id === seal.attemptId
      ? Number(prior.run_count || 0)
      : 0;
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(Date.now() + NATIVE_EVALUATION_LEASE_MS).toISOString();
  const attempt = {
    ...seal.identity,
    attempt_id: seal.attemptId,
    status: 'running',
    run_count: priorRunCount + 1,
    lease_token: leaseToken,
    lease_expires_at: leaseExpiresAt,
  };
  const { data, error } = await admin.rpc('reserve_native_phase_evaluation', {
    p_goal_id: goal.id,
    p_user_id: goal.user_id,
    p_expected_updated_at: goal.updated_at,
    p_scope_hash: seal.identity.scope_hash,
    p_planning_attempt: seal.identity.planning_attempt_id,
    p_plan_hash: seal.identity.plan_hash,
    p_formation_attempt: seal.identity.formation_attempt_id,
    p_work_attempt: seal.identity.work_attempt_id,
    p_execution_snapshot_hash: seal.identity.execution_snapshot_hash,
    p_phase_index: seal.identity.phase_index,
    p_phase_started_at: seal.identity.phase_started_at,
    p_task_receipts: seal.taskReceipts,
    p_job_receipts: seal.identity.job_receipts,
    p_attempt: attempt,
  });
  if (error) throw new Error(`Native phase evaluation reservation failed: ${error.message}`);
  return { ...(data || { state: 'lost' }), requestedAttempt: attempt };
}

async function releaseNativeEvaluationLease(admin, goal, reservation, error) {
  const attempt = reservation?.attempt;
  if (!attempt?.attempt_id || !attempt?.lease_token || !reservation?.goal_updated_at) return false;
  const failedAt = new Date().toISOString();
  const failedAttempt = {
    ...attempt,
    status: 'failed',
    failed_at: failedAt,
    lease_expires_at: failedAt,
    error: String(error?.message || error || 'Native evaluator failed').slice(0, 500),
  };
  const { data, error: updateError } = await admin
    .from('goals')
    .update({
      data: {
        ...(goal.data || {}),
        native_phase_evaluation_attempt: failedAttempt,
      },
      updated_at: failedAt,
    })
    .eq('id', goal.id)
    .eq('user_id', goal.user_id)
    .eq('status', 'active')
    .eq('updated_at', reservation.goal_updated_at)
    .eq('data->native_phase_evaluation_attempt->>attempt_id', attempt.attempt_id)
    .eq('data->native_phase_evaluation_attempt->>lease_token', attempt.lease_token)
    .eq('data->native_phase_evaluation_attempt->>status', 'running')
    .select('id')
    .maybeSingle();
  if (updateError) {
    log.warn(null, 'goal.native-evaluation-lease-release-failed', {
      goalId: goal.id,
      error: updateError.message,
    });
    return false;
  }
  return Boolean(data?.id);
}

async function finalizeNativePhaseEvaluation(
  admin,
  {
    goal,
    seal,
    reservation,
    evaluation,
    phaseCost,
    phases,
    nextStatus = 'active',
    continuationOverride,
    dataPatch = {},
  }
) {
  const completedAt = new Date().toISOString();
  const defaultContinuation = !evaluation.passed
    ? {
        action: 'iterate',
        payload: {
          failedPhaseIndex: seal.identity.phase_index,
          feedback: evaluation.feedback,
        },
      }
    : seal.identity.phase_index >= phases.length - 1
      ? { action: 'complete', payload: {} }
      : {
          action: 'execute-phase',
          payload: {
            phaseIndex: seal.identity.phase_index + 1,
            ...(seal.identity.feedback_application_version
              ? { feedbackApplicationVersion: seal.identity.feedback_application_version }
              : {}),
          },
        };
  const continuation =
    continuationOverride === undefined ? defaultContinuation : continuationOverride;
  const completedAttempt = {
    ...reservation.attempt,
    status: 'completed',
    completed_at: completedAt,
    lease_expires_at: completedAt,
    evaluation: {
      passed: evaluation.passed === true,
      quality_score: Number(evaluation.quality_score || 0),
      progress_percent: Number(evaluation.progress_percent || 0),
      feedback: String(evaluation.feedback || ''),
      override_applied: evaluation.override_applied || null,
    },
    phase_cost_usd: phaseCost,
    cost_applied: true,
    continuation,
  };
  const phaseCosts = { ...(goal.data?.phase_costs || {}) };
  phaseCosts[seal.identity.phase_index] = {
    total: phaseCost,
    agents: seal.agentCosts,
    jobs: seal.identity.job_receipts.map((job) => ({
      id: job.job_id,
      cost: job.cost_usd,
    })),
    tasks_completed: seal.projectedTasks.filter((task) => task.status === 'done').length,
    tasks_total: seal.projectedTasks.length,
    evaluation_attempt_id: seal.attemptId,
  };
  const nextData = {
    ...(goal.data || {}),
    phase_costs: phaseCosts,
    native_phase_evaluation_attempt: completedAttempt,
    ...dataPatch,
  };
  const { data, error } = await admin.rpc('finalize_native_phase_evaluation', {
    p_goal_id: goal.id,
    p_user_id: goal.user_id,
    p_expected_updated_at: reservation.goal_updated_at,
    p_attempt_id: seal.attemptId,
    p_lease_token: reservation.attempt.lease_token,
    p_scope_hash: seal.identity.scope_hash,
    p_planning_attempt: seal.identity.planning_attempt_id,
    p_plan_hash: seal.identity.plan_hash,
    p_formation_attempt: seal.identity.formation_attempt_id,
    p_work_attempt: seal.identity.work_attempt_id,
    p_execution_snapshot_hash: seal.identity.execution_snapshot_hash,
    p_phase_index: seal.identity.phase_index,
    p_phase_started_at: seal.identity.phase_started_at,
    p_task_receipts: seal.taskReceipts,
    p_job_receipts: seal.identity.job_receipts,
    p_next_status: nextStatus,
    p_next_plan: { ...goal.plan, phases },
    p_next_current_value: Number(evaluation.progress_percent || 0),
    p_next_spent_usd: Number(goal.spent_usd || 0) + phaseCost,
    p_next_data: nextData,
    p_completed_attempt: completedAttempt,
  });
  if (error) throw new Error(`Native phase evaluation completion failed: ${error.message}`);
  return { ...(data || { state: 'lost' }), completedAttempt };
}

async function blockNativeEvaluationAuthority(admin, goal, authority) {
  const reasons = authority.reasons?.length
    ? authority.reasons
    : ['native_scope_authority_changed_during_evaluation'];
  const reason = `Phase evaluation is blocked because the accepted native AxWise scope authority is missing, stale, or changed: ${reasons.join(', ')}.`;
  const transitioned = await updateGoalIfStatus(admin, goal.id, goal.status, {
    status: 'needs_human',
    data: {
      ...(goal.data || {}),
      failure_reason: reason,
      failure_stage: 'evaluate-phase:native-scope-authority',
      native_scope_authority: { status: 'blocked', reasons },
    },
  });
  if (!transitioned) {
    return {
      type: 'orchestrate-goal',
      action: 'evaluate-phase',
      goalId: goal.id,
      status: 'state_changed',
    };
  }
  await logGoalEvent(admin, goal.id, 'native_scope_evaluation_blocked', { reason, reasons });
  return {
    type: 'orchestrate-goal',
    action: 'evaluate-phase',
    goalId: goal.id,
    status: 'needs_human_native_scope_authority',
    reasons,
  };
}

async function updateNativeEvaluationTaskIfCurrent(admin, goal, task, updates) {
  const formationAttempt = goal?.data?.team_formation_attempt?.attempt_id;
  const work = goal?.data?.team_work_materialization || {};
  const workAttempt = work.research_attempt_key || formationAttempt;
  if (
    !goal?.id ||
    !goal?.user_id ||
    !task?.id ||
    !task?.updated_at ||
    !task?.status ||
    !formationAttempt ||
    !workAttempt
  ) {
    return null;
  }
  const { data, error } = await admin
    .from('team_tasks')
    .update(updates)
    .eq('id', task.id)
    .eq('goal_id', goal.id)
    .eq('user_id', goal.user_id)
    .eq('status', task.status)
    .eq('updated_at', task.updated_at)
    .eq('materialization_attempt', formationAttempt)
    .eq('data->>materialization_attempt', workAttempt)
    .select('id, status, data, updated_at')
    .maybeSingle();
  if (error) throw new Error(`Native evaluation task recovery failed: ${error.message}`);
  return data || null;
}

async function updateEvaluationTask(admin, goal, task, updates, native) {
  if (native) return updateNativeEvaluationTaskIfCurrent(admin, goal, task, updates);
  const { error } = await admin.from('team_tasks').update(updates).eq('id', task.id);
  if (error) throw new Error(`Evaluation task update failed: ${error.message}`);
  return { ...task, ...updates };
}

async function loadFreshNativeEvaluationSeal(admin, goal, payload, phaseIndex) {
  const { data: candidateTasks, error: taskError } = await admin
    .from('team_tasks')
    .select(
      'id, goal_id, user_id, title, description, status, job_pool_id, agent_id, assigned_to, materialization_attempt, data, updated_at'
    )
    .eq('goal_id', goal.id)
    .eq('user_id', goal.user_id);
  if (taskError) throw new Error(`Native evaluation task reload failed: ${taskError.message}`);
  const tasks = currentGoalTaskAttempt(goal, candidateTasks || []).filter((task) => {
    const taskPhase = task.data?.phase_index;
    return taskPhase === undefined || Number(taskPhase) === phaseIndex;
  });
  const jobIds = sortedStrings(tasks.map((task) => task.job_pool_id));
  if (jobIds.length === 0) {
    return buildNativePhaseEvaluationSeal({ goal, tasks, phaseJobs: [], phaseIndex, payload });
  }
  const { data: candidateJobs, error: jobError } = await admin
    .from('jobs')
    .select(
      'id, user_id, goal_id, description, status, cost_usd, assigned_agent_name, materialization_attempt'
    )
    .eq('goal_id', goal.id)
    .eq('user_id', goal.user_id)
    .in('id', jobIds);
  if (jobError) throw new Error(`Native evaluation job reload failed: ${jobError.message}`);
  const formationAttempt = goal.data?.team_formation_attempt?.attempt_id;
  const phaseJobs = (candidateJobs || []).filter(
    (job) => job.materialization_attempt === formationAttempt
  );
  return buildNativePhaseEvaluationSeal({ goal, tasks, phaseJobs, phaseIndex, payload });
}

export async function handle(admin, payload, req) {
  const goal = await loadGoal(admin, payload.goalId);
  const evaluationAuthority = resolveAcceptedNativeGoalAuthority(goal);
  if (evaluationAuthority.native && !evaluationAuthority.ready) {
    return blockNativeEvaluationAuthority(admin, goal, evaluationAuthority);
  }
  const evaluationObjective = evaluationAuthority.native
    ? evaluationAuthority.packet.intent.objective
    : goal.title;
  const completedNativeAttempt = goal.data?.native_phase_evaluation_attempt;
  if (
    evaluationAuthority.native &&
    completedNativeEvaluationMatches(goal, payload, completedNativeAttempt)
  ) {
    await enqueueNativeEvaluationContinuation(admin, goal, completedNativeAttempt);
    return {
      type: 'orchestrate-goal',
      action: 'evaluate-phase',
      goalId: goal.id,
      phaseIndex: completedNativeAttempt.phase_index,
      status: 'already_completed',
      passed: completedNativeAttempt.evaluation?.passed === true,
      quality_score: Number(completedNativeAttempt.evaluation?.quality_score || 0),
      evaluationAttemptId: completedNativeAttempt.attempt_id,
    };
  }
  const feedbackApplicationVersion = feedbackApplicationVersionOf(payload);
  const phases = goal.plan?.phases || [];
  const executingPhaseIndex = phases.findIndex((p) => p.status === 'executing');
  const requestedPhaseIndex = Number(payload?.phaseIndex);
  const hasRequestedPhase = Number.isInteger(requestedPhaseIndex) && requestedPhaseIndex >= 0;
  if (
    (hasRequestedPhase && requestedPhaseIndex !== executingPhaseIndex) ||
    !evaluationAttemptMatchesGoal(goal, payload)
  ) {
    return {
      type: 'orchestrate-goal',
      action: 'evaluate-phase',
      status: 'superseded_attempt',
      phaseIndex: hasRequestedPhase ? requestedPhaseIndex : null,
    };
  }
  const phaseIndex = executingPhaseIndex;
  if (phaseIndex < 0)
    return { type: 'orchestrate-goal', action: 'evaluate-phase', status: 'no_executing_phase' };

  // Collect job results — try both goal_id match and task-based lookup
  const { data: goalJobs, error: jobsErr } = await admin
    .from('jobs')
    .select(
      'id, user_id, goal_id, description, status, cost_usd, assigned_agent_name, materialization_attempt'
    )
    .eq('goal_id', goal.id);
  let jobIds = (goalJobs || []).map((j) => j.id);

  // Fallback: if no jobs found via goal_id, find them through tasks
  if (jobIds.length === 0) {
    const { data: goalTasks } = await admin
      .from('team_tasks')
      .select(
        'id, goal_id, user_id, job_pool_id, status, materialization_attempt, data, updated_at'
      )
      .eq('data->>goal_id', goal.id);
    jobIds = [
      ...new Set(
        currentGoalTaskAttempt(goal, goalTasks || [])
          .map((task) => task.job_pool_id)
          .filter(Boolean)
      ),
    ];
    log.info(req, 'goal.evaluate-phase.fallback-job-lookup', {
      goalId: goal.id,
      jobIdsFound: jobIds.length,
      jobsErr: jobsErr?.message,
    });
  }

  if (jobIds.length === 0) {
    // Previously returned { status: 'no_jobs' } silently, leaving the goal
    // stuck in 'active' forever. Throw instead so job-processor records a
    // real failure reason and the self-healer (h03) can re-run team-formation.
    log.warn(req, 'goal.evaluate-phase.no-jobs', {
      goalId: goal.id,
      phaseIndex,
      jobsErr: jobsErr?.message,
    });
    throw new Error(
      'evaluate-phase: no jobs found for goal (team-formation likely silently failed)'
    );
  }

  let allTaskQuery = admin
    .from('team_tasks')
    .select(
      'id, goal_id, user_id, title, description, status, job_pool_id, agent_id, assigned_to, materialization_attempt, data, updated_at'
    );
  allTaskQuery = evaluationAuthority.native
    ? allTaskQuery.eq('goal_id', goal.id).eq('user_id', goal.user_id)
    : allTaskQuery.in('job_pool_id', jobIds);
  const { data: allTasks, error: allTasksError } = await allTaskQuery;
  if (allTasksError)
    throw new Error(`evaluate-phase: unable to load tasks: ${allTasksError.message}`);

  // A revised goal retains cancelled task rows as immutable history. Only the
  // current AxWise decision may influence phase scoring or trigger iteration.
  const currentAttemptTasks = currentGoalTaskAttempt(goal, allTasks || []);
  let tasks = currentAttemptTasks.filter((task) => {
    const taskPhase = task.data?.phase_index;
    return taskPhase === undefined || Number(taskPhase) === phaseIndex;
  });
  if (evaluationAuthority.native) {
    const projection = nativePhaseTaskProjection(goal, tasks, phaseIndex);
    if (projection.reasons.length > 0) {
      return blockNativeEvaluationAuthority(admin, goal, { reasons: projection.reasons });
    }
    tasks = projection.tasks;
  }
  if (
    feedbackApplicationVersion &&
    tasks.some((task) => task.data?.feedback_application_version !== feedbackApplicationVersion)
  ) {
    return {
      type: 'orchestrate-goal',
      action: 'evaluate-phase',
      status: 'superseded_attempt',
      phaseIndex,
    };
  }
  const phaseJobIds = new Set(tasks.map((task) => String(task.job_pool_id || '')).filter(Boolean));
  const formationAttempt = goal.data?.team_formation_attempt?.attempt_id;
  const phaseJobs = (goalJobs || []).filter(
    (job) =>
      phaseJobIds.has(String(job.id)) &&
      (!evaluationAuthority.native ||
        (job.materialization_attempt === formationAttempt && job.user_id === goal.user_id))
  );

  // Recover stuck tasks — mark tasks stuck in inProgress > 5 min as failed,
  // UNLESS the task already captured a real deployment URL in its output
  // (Cloudflare Workers / Pages / GitHub Pages). The claude-code provider
  // can deploy a URL successfully and then have the wrapping execute-task
  // call overrun the 5-minute window before the status-write reaches the
  // DB. In that case the task's data.output already contains a
  // DEPLOYMENT_URL marker, and the right recovery is to flip the task to
  // 'done' (preserving the shipped work) rather than 'failed' (which
  // overwrites a real success with a phantom timeout error and prevents
  // the iterate stall guard from counting the task as completed).
  // Regex mirrors complete.js extractDeploymentUrl - keep in sync.
  const REAL_DEPLOY_HOST = /\.(workers\.dev|pages\.dev|github\.io)(\/|$|\?)/i;
  const extractDeployUrl = (text) => {
    if (!text) return null;
    const marker = text.match(/DEPLOYMENT_URL:\s*(https?:\/\/[^\s)>\]]+)/i);
    if (marker && REAL_DEPLOY_HOST.test(marker[1])) return marker[1];
    const workers = text.match(/https?:\/\/[\w.-]+\.workers\.dev\/?[^\s)>\]]*/);
    if (workers) return workers[0];
    const pages = text.match(/https?:\/\/[\w.-]+\.pages\.dev\/?[^\s)>\]]*/);
    if (pages) return pages[0];
    const gh = text.match(/https?:\/\/[\w.-]+\.github\.io\/[^\s)>\]]*/);
    if (gh) return gh[0];
    return null;
  };

  const now = Date.now();
  const STUCK_THRESHOLD_MS = 5 * 60 * 1000;
  // `planned` joins the sweep, but only when nothing is holding execution.
  // Without it a task rolled back to `planned` pends forever, and because the
  // deferred branch re-queues this stage the goal spins instead of stopping.
  // While a gate holds execution the wait is legitimate and must not be timed
  // out - a user takes longer than five minutes to approve a plan.
  const heldAtGate = EXECUTION_HELD_AT_GATE.has(goal.status);
  const canTimeOut = (status) =>
    status === 'inProgress' || status === 'todo' || (status === 'planned' && !heldAtGate);
  for (const t of tasks) {
    if (canTimeOut(t.status) && t.updated_at) {
      const age = now - new Date(t.updated_at).getTime();
      if (age > STUCK_THRESHOLD_MS) {
        const recoveredUrl = extractDeployUrl(t.data?.output || '');
        if (recoveredUrl) {
          log.warn(req, 'goal.evaluate-phase.stuck-task-recovered-as-done', {
            taskId: t.id,
            status: t.status,
            ageMs: age,
            deploymentUrl: recoveredUrl,
          });
          const recoveryPatch = {
            status: 'done',
            data: {
              ...(t.data || {}),
              recovered_from_timeout: true,
              recovered_deployment_url: recoveredUrl,
            },
            updated_at: new Date().toISOString(),
          };
          const recoveredTask = await updateEvaluationTask(
            admin,
            goal,
            t,
            recoveryPatch,
            evaluationAuthority.native
          );
          if (!recoveredTask) {
            return {
              type: 'orchestrate-goal',
              action: 'evaluate-phase',
              status: 'task_state_changed',
              phaseIndex,
            };
          }
          t.status = 'done';
          t.data = recoveredTask.data || recoveryPatch.data;
          t.updated_at = recoveredTask.updated_at || recoveryPatch.updated_at;
        } else {
          log.warn(req, 'goal.evaluate-phase.stuck-task-recovered', {
            taskId: t.id,
            status: t.status,
            ageMs: age,
          });
          const recoveryPatch = {
            status: 'failed',
            data: {
              ...(t.data || {}),
              error: `Task timed out after ${Math.round(age / 1000)}s in ${t.status} state`,
            },
            updated_at: new Date().toISOString(),
          };
          const recoveredTask = await updateEvaluationTask(
            admin,
            goal,
            t,
            recoveryPatch,
            evaluationAuthority.native
          );
          if (!recoveredTask) {
            return {
              type: 'orchestrate-goal',
              action: 'evaluate-phase',
              status: 'task_state_changed',
              phaseIndex,
            };
          }
          t.status = 'failed';
          t.data = recoveredTask.data || recoveryPatch.data;
          t.updated_at = recoveredTask.updated_at || recoveryPatch.updated_at;
        }
      }
    }
  }

  // Validate "done" tasks against their deliverable_type contract.
  // Tasks classified as code/deployment/asset/data must show real tool use;
  // markdown-only outputs for these types are downgraded to failed so the
  // iterate loop can retry them with corrective feedback.
  for (const t of tasks) {
    if (t.status !== 'done') continue;
    const result = validateTaskOutput(t);
    if (result.valid) continue;
    log.warn(req, 'goal.evaluate-phase.task-validation-failed', {
      taskId: t.id,
      reason: result.reason,
    });
    const validationPatch = {
      status: 'failed',
      data: {
        ...(t.data || {}),
        error: result.reason,
        validation_failed: true,
        validation_reason: result.reason,
      },
      updated_at: new Date().toISOString(),
    };
    const failedTask = await updateEvaluationTask(
      admin,
      goal,
      t,
      validationPatch,
      evaluationAuthority.native
    );
    if (!failedTask) {
      return {
        type: 'orchestrate-goal',
        action: 'evaluate-phase',
        status: 'task_state_changed',
        phaseIndex,
      };
    }
    t.status = 'failed'; // update local reference for the rest of the function
    t.data = failedTask.data || validationPatch.data;
    t.updated_at = failedTask.updated_at || validationPatch.updated_at;
  }

  // Defer if tasks still in progress (only non-stuck ones remain).
  //
  // `planned` counts as pending. A task can be rolled back to `planned` after
  // an authorization re-check refuses it mid-phase, and it is not work that
  // failed — it is work that never started. Treating it as complete-but-empty
  // sent an untouched task to the PM as "0/1 completed, zero character output",
  // which scored 0/100, burned an iteration and turned a recoverable stall into
  // a quality failure.
  const pendingTasks = tasks.filter(
    (t) => t.status === 'inProgress' || t.status === 'todo' || t.status === 'planned'
  );
  if (pendingTasks.length > 0) {
    // Nothing is running and only a person can release it, so polling would be
    // a hot loop against a gate. Approving re-releases the phase, and
    // execute-task queues this stage again when the work finishes.
    const waitingOnGate = heldAtGate && pendingTasks.every((t) => t.status === 'planned');
    log.info(req, 'goal.evaluate-phase.deferred', {
      goalId: goal.id,
      phaseIndex,
      pendingTasks: pendingTasks.length,
      waitingOnGate,
      goalStatus: goal.status,
    });
    // Re-queue ourselves so we check again instead of being finalized as 'done'
    if (!waitingOnGate) {
      await enqueueGoalAction(admin, 'evaluate-phase', goal.id, {
        phaseIndex,
        ...(feedbackApplicationVersion ? { feedbackApplicationVersion } : {}),
      });
    }
    return {
      type: 'orchestrate-goal',
      action: 'evaluate-phase',
      status: waitingOnGate ? 'waiting_on_gate' : 'deferred',
      pendingTasks: pendingTasks.length,
    };
  }

  if (tasks.length === 0) {
    log.warn(req, 'goal.evaluate-phase.no-tasks', {
      goalId: goal.id,
      phaseIndex,
      totalGoalTasks: (allTasks || []).length,
    });
    return { type: 'orchestrate-goal', action: 'evaluate-phase', status: 'no_tasks' };
  }

  const completedTasks = tasks.filter((t) => t.status === 'done');
  const outputs = buildPhaseKnowledgeContent(completedTasks);
  const evaluationDigest = buildEvaluationDigest(tasks);

  // Financial tracking per phase
  const phaseCost = phaseJobs.reduce((sum, j) => sum + Number(j.cost_usd || 0), 0);
  const agentCosts = {};
  for (const j of phaseJobs) {
    const name = j.assigned_agent_name || 'unassigned';
    agentCosts[name] = (agentCosts[name] || 0) + Number(j.cost_usd || 0);
  }
  let nativeSeal = null;
  let nativeReservation = null;
  if (evaluationAuthority.native) {
    nativeSeal = buildNativePhaseEvaluationSeal({
      goal,
      tasks,
      phaseJobs,
      phaseIndex,
      payload,
    });
    if (!nativeSeal.ready) {
      return blockNativeEvaluationAuthority(admin, goal, { reasons: nativeSeal.reasons });
    }
    const reservationResult = await reserveNativePhaseEvaluation(admin, goal, nativeSeal);
    if (reservationResult.state === 'completed') {
      await enqueueNativeEvaluationContinuation(admin, goal, reservationResult.attempt);
      return {
        type: 'orchestrate-goal',
        action: 'evaluate-phase',
        status: 'already_completed',
        goalId: goal.id,
        phaseIndex,
        evaluationAttemptId: nativeSeal.attemptId,
      };
    }
    if (reservationResult.state !== 'acquired') {
      if (
        ['authority_changed', 'task_set_changed', 'job_cost_set_changed', 'conflict'].includes(
          reservationResult.state
        )
      ) {
        return blockNativeEvaluationAuthority(admin, goal, {
          reasons: [`native_evaluation_reservation_${reservationResult.state}`],
        });
      }
      return {
        type: 'orchestrate-goal',
        action: 'evaluate-phase',
        status:
          reservationResult.state === 'in_progress'
            ? 'evaluation_in_progress'
            : 'superseded_attempt',
        goalId: goal.id,
        phaseIndex,
      };
    }
    nativeReservation = {
      ...reservationResult,
      attempt: reservationResult.attempt || reservationResult.requestedAttempt,
    };
  }
  const goalData = goal.data || {};
  const phaseCosts = { ...(goalData.phase_costs || {}) };
  phaseCosts[phaseIndex] = {
    total: phaseCost,
    agents: agentCosts,
    jobs: phaseJobs.map((j) => ({
      id: j.id,
      title: j.description || '',
      cost: Number(j.cost_usd || 0),
    })),
    tasks_completed: completedTasks.length,
    tasks_total: tasks.length,
  };
  if (!evaluationAuthority.native) {
    await updateGoal(admin, goal.id, {
      spent_usd: Number(goal.spent_usd || 0) + phaseCost,
      data: { ...goalData, phase_costs: phaseCosts },
    });
  }

  // Save outputs to KB
  if (!evaluationAuthority.native && outputs) {
    try {
      await admin.from('knowledge_documents').insert({
        user_id: goal.user_id,
        title: `Phase ${phaseIndex + 1} Output: ${phases[phaseIndex].name}`,
        content: outputs,
        source: 'goal-orchestrator',
        category: 'goal-output',
        owner_type: goal.team_id ? 'team' : 'user',
        owner_id: goal.team_id || goal.user_id,
        content_type: 'note',
        tags: ['goal', 'output', `phase-${phaseIndex + 1}`],
        metadata: {
          goal_id: goal.id,
          phase_index: phaseIndex,
          ...goalDocumentAttemptMetadata(goal),
          cost_usd: phaseCost,
          canonical: true,
          content_truncated: false,
          character_count: outputs.length,
          task_count: completedTasks.length,
        },
        ...orgScopeFromGoal(goal),
      });
    } catch (err) {
      log.warn(req, 'goal.kb-output.failed', { error: err.message });
    }
  }

  // Agent accountability check — flag underperformers
  if (!evaluationAuthority.native) {
    await checkAgentAccountability(admin, goal, phaseIndex, tasks, req);
  }

  // Budget health check
  const budgetHealth = checkBudgetHealth(goal, phaseCost);
  if (!budgetHealth.ok && budgetHealth.action === 'fail') {
    if (evaluationAuthority.native) {
      const budgetPhases = structuredClone(phases);
      const completedAt = new Date().toISOString();
      budgetPhases[phaseIndex] = {
        ...budgetPhases[phaseIndex],
        status: 'failed',
        completed_at: completedAt,
        duration_ms: budgetPhases[phaseIndex].started_at
          ? Date.now() - new Date(budgetPhases[phaseIndex].started_at).getTime()
          : 0,
        quality_score: 0,
      };
      const completion = await finalizeNativePhaseEvaluation(admin, {
        goal,
        seal: nativeSeal,
        reservation: nativeReservation,
        evaluation: {
          passed: false,
          quality_score: 0,
          progress_percent: Number(goal.current_value || 0),
          feedback: `Budget exhausted: ${budgetHealth.reason}`,
        },
        phaseCost,
        phases: budgetPhases,
        nextStatus: 'failed',
        continuationOverride: null,
        dataPatch: {
          failure_reason: `Budget exhausted: ${budgetHealth.reason}`,
          failed_at: completedAt,
        },
      });
      if (completion.state !== 'completed') {
        return {
          type: 'orchestrate-goal',
          action: 'evaluate-phase',
          status: 'superseded_attempt',
          goalId: goal.id,
          phaseIndex,
        };
      }
    } else {
      await updateGoal(admin, goal.id, {
        status: 'failed',
        data: {
          ...(goal.data || {}),
          failure_reason: `Budget exhausted: ${budgetHealth.reason}`,
          failed_at: new Date().toISOString(),
        },
      });
    }
    await logGoalEvent(
      admin,
      goal.id,
      'budget_exhausted',
      { reason: budgetHealth.reason },
      0,
      phaseIndex
    );
    return { type: 'orchestrate-goal', action: 'evaluate-phase', status: 'budget_exhausted' };
  }

  // Try Consilium review first (if board is linked), fallback to PM review
  let evaluation;
  let evalCost = 0;
  let evalLlmResult = null;
  try {
    const consiliumResult = await runConsiliumPhaseReview(
      admin,
      goal,
      phaseIndex,
      evaluationDigest,
      phaseCost,
      req
    );

    if (consiliumResult?.native_scope_authority_blocked) {
      const current = await loadGoal(admin, goal.id);
      if (current.status !== goal.status) {
        return {
          type: 'orchestrate-goal',
          action: 'evaluate-phase',
          goalId: goal.id,
          status: 'state_changed',
        };
      }
      return blockNativeEvaluationAuthority(admin, current, {
        reasons: consiliumResult.reasons,
      });
    }

    if (consiliumResult) {
      evaluation = consiliumResult;
      evalCost = Number(consiliumResult.estimatedCostUsd || 0);
      evalLlmResult = consiliumResult;
    } else {
      // Standard PM Review Gate (fallback).
      // Keep the PM review on the same pinned executor as planning and task
      // execution. An unavailable provider fails visibly instead of switching.
      const evalResult = await executeLlm({
        prompt: [
          'As Project Manager, review these deliverables:',
          `Goal: ${evaluationObjective}`,
          `Phase: ${phases[phaseIndex].name} — ${phases[phaseIndex].description}`,
          `Tasks completed: ${completedTasks.length}/${tasks.length}`,
          `Phase cost: $${phaseCost.toFixed(4)}`,
          '',
          'Task output evaluation digest:',
          evaluationDigest,
          '',
          'Score quality 0-100 and decide next action.',
          'Respond with JSON: { "quality_score": 0-100, "passed": true/false, "progress_percent": 0-100, "feedback": "what worked/failed", "next_action": "continue|iterate|complete" }',
        ].join('\n'),
        systemPrompt:
          'You are a PM reviewing deliverables. Score quality, identify gaps. Accept good-enough work, reject only if fundamentally wrong. The supplied task views are labeled excerpts; excerpt boundaries are sampling metadata, never proof that a persisted output was truncated.',
        ...pickTestModel(goal),
        temperature: 0.2,
        maxTokens: 500,
        jsonMode: true,
        userId: goal.user_id,
        req,
      });

      evaluation = parseLlmJson(evalResult.content) || {
        passed: completedTasks.length > 0,
        quality_score: 50,
        progress_percent: 50,
      };
      evalLlmResult = evalResult;
      if (evaluation.quality_score >= 70) evaluation.passed = true;
      else if (evaluation.quality_score < 40) evaluation.passed = false;
      evalCost = Number(evalResult.estimatedCostUsd || 0);
    }
  } catch (error) {
    if (evaluationAuthority.native) {
      await releaseNativeEvaluationLease(admin, goal, nativeReservation, error);
    }
    throw error;
  }

  // Deploy-verified override: if ANY task in this phase produced a real
  // deployment URL on a known deploy host (workers.dev / pages.dev /
  // github.io) — and landing-pages-tool's HEAD-check already confirmed it
  // was reachable when it was written — mark the phase passed regardless
  // of the PM grader's subjective prose. Objective evidence beats
  // opinions. Prevents iterate-to-death on "narrative too short" when a
  // live working page exists.
  const thisPhaseHasLiveDeploy = (completedTasks || []).some((t) => {
    const out = t.data?.output || '';
    return (
      /DEPLOYMENT_URL:\s*https?:\/\/[\w.-]+\.(workers\.dev|pages\.dev|github\.io)/i.test(out) ||
      /https?:\/\/[\w.-]+\.(workers\.dev|pages\.dev|github\.io)[^\s)>\]]*/i.test(out)
    );
  });
  if (!evaluation.passed && thisPhaseHasLiveDeploy) {
    log.info(req, 'evaluate-phase.override.live-deploy-in-phase', {
      goalId: goal.id,
      phaseIndex,
      reason: 'Phase produced a verified live deployment URL — overriding PM subjective fail',
    });
    evaluation.passed = true;
    evaluation.override_applied = 'live-deploy-in-phase';
  }

  // Inverse guard: if THIS phase contains deployment tasks but NO task has
  // a real deploy URL AND no landing_pages row exists for this goal, the
  // phase cannot be "passed" regardless of what the PM grader said. A
  // landing-page deployment phase with quality_score=50 narrative-passed
  // but no actual site live was the root cause of repeated "completed
  // goal with no deployment_url" reports. Force iterate to actually retry.
  const hasDeploymentTask = (tasks || []).some(
    (t) => (t.data?.deliverable_type || '').toLowerCase() === 'deployment'
  );
  if (evaluation.passed && hasDeploymentTask && !thisPhaseHasLiveDeploy) {
    let hasLpRow = false;
    try {
      const { data: lps } = await admin
        .from('landing_pages')
        .select('id, status, deployment_url')
        .eq('goal_id', goal.id)
        .eq('status', 'deployed')
        .limit(1);
      hasLpRow = Array.isArray(lps) && lps.length > 0 && lps[0].deployment_url;
    } catch {
      /* non-critical */
    }

    if (!hasLpRow) {
      log.warn(req, 'evaluate-phase.override.deployment-without-deploy', {
        goalId: goal.id,
        phaseIndex,
        reason: 'Deployment phase marked passed but no verified live URL exists',
      });
      evaluation.passed = false;
      evaluation.override_applied = 'deployment-without-deploy';
      evaluation.feedback =
        `${evaluation.feedback || ''}\n\nDEPLOYMENT VERIFICATION FAILED: phase is a deployment type but produced no live URL on workers.dev/pages.dev/github.io and no landing_pages row exists. Actually deploy the page.`.trim();
    }
  }

  // Post-review override: if this phase contains only markdown tasks that all
  // passed validateTaskOutput AND a prior phase already produced a live
  // deployment URL, don't let the PM LLM's subjective "Final Status: Fail"
  // text triggering iterate. The QA agent commonly writes "Fail" in its
  // natural-language verdict because its HTTP fetch couldn't see the full
  // HTML body (fetch tools truncate), which is a QA tool limitation, not a
  // deployment failure. Prior to this override, test #6 iter 0 deployed a
  // fully compliant landing page, then iterated unnecessarily on QA's
  // subjective "Fail" until max_iterations.
  const allMarkdown = completedTasks.every((t) => {
    const type = t.data?.deliverable_type || 'markdown';
    return type === 'markdown';
  });
  const hasPriorDeployUrl =
    (goal.data?.deployment_url && /^https?:\/\//.test(goal.data.deployment_url)) ||
    currentAttemptTasks.some((t) =>
      /DEPLOYMENT_URL:\s*https?:\/\/|\.workers\.dev\b|\.pages\.dev\b|\.github\.io\b|\.vercel\.app\b/.test(
        t.data?.output || ''
      )
    );
  if (!evaluation.passed && allMarkdown && hasPriorDeployUrl && completedTasks.length > 0) {
    log.info(req, 'evaluate-phase.override.markdown-with-prior-deploy', {
      goalId: goal.id,
      phaseIndex,
      originalPassed: false,
      reason: 'Final markdown phase has a live prior deployment — overriding PM subjective fail',
    });
    evaluation.passed = true;
    evaluation.override_applied = 'markdown-with-prior-deploy';
  }

  // Race guard: re-fetch goal
  const freshGoal = await loadGoal(admin, goal.id);
  const freshPhases = structuredClone(freshGoal.plan?.phases || []);
  if (freshPhases[phaseIndex]?.status !== 'executing') {
    log.info(req, 'goal.evaluate-phase.race-guard', {
      goalId: goal.id,
      phaseIndex,
      currentStatus: freshPhases[phaseIndex]?.status,
    });
    return {
      type: 'orchestrate-goal',
      action: 'evaluate-phase',
      status: 'race_guard_stopped',
      phaseIndex,
    };
  }
  const freshAuthority = resolveAcceptedNativeGoalAuthority(freshGoal);
  const authorityChanged =
    evaluationAuthority.native !== freshAuthority.native ||
    (evaluationAuthority.native &&
      (!freshAuthority.ready ||
        evaluationAuthority.packet.scope_hash !== freshAuthority.packet?.scope_hash));
  if (authorityChanged) {
    if (freshGoal.status !== goal.status) {
      return {
        type: 'orchestrate-goal',
        action: 'evaluate-phase',
        goalId: goal.id,
        status: 'state_changed',
      };
    }
    return blockNativeEvaluationAuthority(admin, freshGoal, {
      reasons: freshAuthority.reasons?.length
        ? freshAuthority.reasons
        : ['native_scope_authority_changed_during_evaluation'],
    });
  }
  if (evaluationAuthority.native) {
    if (
      Date.parse(freshGoal.updated_at || '') !== Date.parse(nativeReservation.goal_updated_at || '')
    ) {
      return {
        type: 'orchestrate-goal',
        action: 'evaluate-phase',
        goalId: goal.id,
        status: 'state_changed',
        phaseIndex,
      };
    }
    const freshSeal = await loadFreshNativeEvaluationSeal(admin, freshGoal, payload, phaseIndex);
    if (!freshSeal.ready) {
      return blockNativeEvaluationAuthority(admin, freshGoal, { reasons: freshSeal.reasons });
    }
    if (
      freshSeal.attemptId !== nativeSeal.attemptId ||
      freshSeal.identity.task_set_hash !== nativeSeal.identity.task_set_hash ||
      freshSeal.identity.job_set_hash !== nativeSeal.identity.job_set_hash
    ) {
      return blockNativeEvaluationAuthority(admin, freshGoal, {
        reasons: ['native_evaluation_task_or_cost_snapshot_changed_during_provider_call'],
      });
    }
    nativeSeal = freshSeal;
  }

  // Update phase
  const phaseDuration = freshPhases[phaseIndex].started_at
    ? Date.now() - new Date(freshPhases[phaseIndex].started_at).getTime()
    : 0;
  freshPhases[phaseIndex].status = evaluation.passed ? 'completed' : 'failed';
  freshPhases[phaseIndex].completed_at = new Date().toISOString();
  freshPhases[phaseIndex].duration_ms = phaseDuration;
  freshPhases[phaseIndex].quality_score = evaluation.quality_score;

  // Research quality scoring — check if any tasks in this phase were research tasks
  try {
    const researchTasks = tasks.filter((t) =>
      /research|analyz|investigat|benchmark|competit|market|survey/i.test(
        `${t.title} ${t.description}`
      )
    );
    if (researchTasks.length > 0) {
      const { scoreResearchQuality } = await import('../../quality/rubric.js');
      const researchOutputs = researchTasks.map((t) => t.data?.output || '').join('\n');
      const researchScore = scoreResearchQuality(researchOutputs);
      freshPhases[phaseIndex].research_quality = researchScore;
      evaluation.research_score = researchScore.score;
    }
  } catch (error) {
    log.warn(req, 'goal.evaluate-phase.research-score.failed', {
      goalId: goal.id,
      phaseIndex,
      error: error.message,
    });
  }

  let nativeCompletion = null;
  if (evaluationAuthority.native) {
    nativeCompletion = await finalizeNativePhaseEvaluation(admin, {
      goal: freshGoal,
      seal: nativeSeal,
      reservation: nativeReservation,
      evaluation,
      phaseCost,
      phases: freshPhases,
    });
    if (nativeCompletion.state !== 'completed') {
      return {
        type: 'orchestrate-goal',
        action: 'evaluate-phase',
        goalId: goal.id,
        status:
          nativeCompletion.state === 'task_set_changed' ||
          nativeCompletion.state === 'job_cost_set_changed'
            ? 'evaluation_input_changed'
            : 'superseded_attempt',
        phaseIndex,
      };
    }
  } else {
    await updateGoal(admin, goal.id, {
      plan: { ...freshGoal.plan, phases: freshPhases },
      current_value: Number(evaluation.progress_percent || 0),
    });
  }

  if (evaluationAuthority.native && outputs) {
    try {
      await admin.from('knowledge_documents').insert({
        user_id: goal.user_id,
        title: `Phase ${phaseIndex + 1} Output: ${freshPhases[phaseIndex].name}`,
        content: outputs,
        source: 'goal-orchestrator',
        category: 'goal-output',
        owner_type: goal.team_id ? 'team' : 'user',
        owner_id: goal.team_id || goal.user_id,
        content_type: 'note',
        tags: ['goal', 'output', `phase-${phaseIndex + 1}`],
        metadata: {
          goal_id: goal.id,
          phase_index: phaseIndex,
          ...goalDocumentAttemptMetadata(freshGoal),
          evaluation_attempt_id: nativeSeal.attemptId,
          cost_usd: phaseCost,
          canonical: true,
          content_truncated: false,
          character_count: outputs.length,
          task_count: completedTasks.length,
        },
        ...orgScopeFromGoal(goal),
      });
    } catch (err) {
      log.warn(req, 'goal.kb-output.failed', { error: err.message });
    }
  }
  if (evaluationAuthority.native) {
    await checkAgentAccountability(admin, goal, phaseIndex, tasks, req);
  }

  // Update workflow node
  if (goal.workflow_id) {
    try {
      const { data: wf } = await admin
        .from('workflows')
        .select('data')
        .eq('id', goal.workflow_id)
        .single();
      if (wf?.data?.nodes) {
        wf.data.nodes = wf.data.nodes.map((n, i) =>
          i === phaseIndex
            ? {
                ...n,
                data: {
                  ...(n.data || {}),
                  status: evaluation.passed ? 'completed' : 'failed',
                  quality_score: evaluation.quality_score,
                },
              }
            : n
        );
        await admin
          .from('workflows')
          .update({ data: wf.data, updated_at: new Date().toISOString() })
          .eq('id', goal.workflow_id);
      }
    } catch (err) {
      log.warn(req, 'goal.workflow-update.failed', { error: err.message });
    }
  }

  await logGoalEvent(
    admin,
    goal.id,
    'phase_evaluated',
    {
      phaseIndex,
      passed: evaluation.passed,
      quality_score: evaluation.quality_score,
      progress: evaluation.progress_percent,
      feedback: evaluation.feedback,
      cost: phaseCost,
      duration_ms: phaseDuration,
    },
    evalCost,
    phaseIndex
  );

  // Post Consilium feedback message
  await consiliumFeedback(
    admin,
    goal,
    phaseIndex,
    `Phase ${phaseIndex + 1} "${freshPhases[phaseIndex].name}" ${evaluation.passed ? 'PASSED' : 'FAILED'} — quality ${evaluation.quality_score || 0}/100. ${evaluation.feedback || ''}`,
    evaluation.passed
  );

  if (evalLlmResult) {
    await recordStageLlmUsage(admin, goal, evalLlmResult, {
      source: 'evaluate-phase',
      description: `Phase ${phaseIndex + 1} evaluation`,
      phaseIndex,
    });
  } else if (evalCost > 0) {
    await trackTokenSpend(
      admin,
      goal.user_id,
      goal.id,
      evalCost,
      'evaluate-phase',
      `Phase ${phaseIndex + 1} evaluation`
    );
  }

  // Prompt tuning for failing agents (when quality < 50)
  if (!evaluationAuthority.native && evaluation.quality_score < 50 && tasks.length > 0) {
    try {
      const failedTasks = tasks.filter(
        (t) => t.status === 'done' && (t.data?.quality_score || 0) < 40
      );
      for (const ft of failedTasks) {
        const agentId = ft.agent_id;
        if (!agentId) continue;
        const { data: agent } = await admin
          .from('concilium_agents')
          .select('id, metadata')
          .eq('id', agentId)
          .single();
        if (!agent) continue;
        const meta = agent.metadata || {};
        const improvements = meta.prompt_improvements || [];
        improvements.push({
          date: new Date().toISOString(),
          goal: goal.title,
          task: ft.title,
          issue: (evaluation.feedback || 'Low quality output').slice(0, 200),
          improvement: `Improve output quality for "${ft.data?.required_role || 'general'}" tasks. Ensure detailed, structured responses with clear sections.`,
        });
        // Keep max 5 (FIFO)
        while (improvements.length > 5) improvements.shift();

        // Check if agent should be marked underperforming (3+ tunings AND still low quality)
        const { data: perf } = await admin
          .from('agent_performance')
          .select('avg_quality_score')
          .eq('agent_id', agentId)
          .eq('task_type', 'general')
          .single();
        const shouldFlag = improvements.length >= 3 && (perf?.avg_quality_score || 0) < 50;

        await admin
          .from('concilium_agents')
          .update({
            metadata: { ...meta, prompt_improvements: improvements },
            ...(shouldFlag ? { status: 'underperforming' } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq('id', agentId);

        if (shouldFlag) {
          await logGoalEvent(admin, goal.id, 'agent_flagged_underperforming', {
            agent_id: agentId,
            avg_quality: perf?.avg_quality_score,
            tuning_count: improvements.length,
          });
        }
      }
    } catch (e) {
      log.warn(req, 'evaluate-phase.prompt-tuning.failed', { error: e.message });
    }
  }

  // Decide next action — DETERMINISTIC phase advancement.
  //
  // Previously this honored `evaluation.next_action === 'complete'` from
  // the PM evaluator LLM, which could say "looks good, we're done" after
  // phase 0 and skip every remaining phase. Live test e609a4e0 completed
  // after only phase 0/4 of the plan actually ran, because the LLM PM
  // evaluator decided `next_action: 'complete'`. 7 tasks across phases
  // 1-3 never executed.
  //
  // Phase advancement is now strictly deterministic:
  //   - Phase failed → iterate (re-plan)
  //   - Phase passed AND more phases exist → execute-phase with next phaseIndex
  //   - Phase passed AND this was the last phase → complete
  //
  // The LLM still controls `passed` (pass/fail judgment) and `quality_score`
  // (feedback into prompt improvements), but it does NOT get to skip ahead.
  if (evaluationAuthority.native) {
    await enqueueNativeEvaluationContinuation(admin, goal, nativeCompletion.completedAttempt);
  } else if (!evaluation.passed) {
    await enqueueGoalAction(admin, 'iterate', goal.id, {
      failedPhaseIndex: phaseIndex,
      feedback: evaluation.feedback,
    });
  } else if (phaseIndex >= phases.length - 1) {
    await enqueueGoalAction(admin, 'complete', goal.id);
  } else {
    await enqueueGoalAction(admin, 'execute-phase', goal.id, {
      phaseIndex: phaseIndex + 1,
      ...(feedbackApplicationVersion ? { feedbackApplicationVersion } : {}),
    });
  }

  return {
    type: 'orchestrate-goal',
    action: 'evaluate-phase',
    goalId: goal.id,
    phaseIndex,
    passed: evaluation.passed,
    quality_score: evaluation.quality_score,
    ...(evaluationAuthority.native
      ? { evaluationAttemptId: nativeCompletion.completedAttempt.attempt_id }
      : {}),
  };
}
