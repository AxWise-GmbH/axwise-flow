/**
 * The running goal, as messages.
 *
 * Simple mode does not hand the user off to a dashboard when the run starts:
 * the thread they wrote the goal in keeps going, and the pipeline reports into
 * it. This module turns the three live sources into one ordered conversation.
 *
 *   goal_log      the spine — every stage transition the orchestrator writes
 *   goal_messages what the Consilium, the team lead and the agents said
 *   team_tasks    the work itself, nested under the phase that owns it
 *
 * The copy is deliberately not GoalChatFeed's. That feed speaks to someone
 * reading a pipeline ("PO Analysis Complete · Depth: quick"); this one speaks
 * to someone who typed a sentence and wants to know how it is going. It is the
 * same split runStageCopy.js already makes for the status line.
 */

/**
 * Statuses where nothing is in flight, so no marker on the thread should move.
 *
 * Paused belongs here even though the run can be resumed: its own line says
 * "Nothing is running right now", and a pulsing marker over that sentence
 * contradicts it. The gates are the opposite case and are deliberately absent -
 * awaiting_approval and needs_human are a run trying to continue and unable to,
 * which is exactly the thing worth drawing an eye to.
 */
const STOPPED = new Set(['completed', 'failed', 'cancelled', 'paused']);

/** Stage lines that say nothing a person needs, or that a sibling event covers. */
const SILENT = new Set([
  'smart_request_draft_created',
  'smart_request_started',
  'axwise_customer_intelligence_started',
  'axwise_orchestration_decision',
  'axwise_customer_intelligence_clarification',
  'goal_active',
  'system_enrichment_deferred_until_approval',
]);

import {
  describeInvalidationReason,
  describeInvalidationReasons,
} from '../../../../lib/_shared/invalidation-reasons.js';
import { nativeAxwiseScopeApprovalBlock } from '../../../../lib/_shared/native-scope-approval.js';
import { THREAD_GLYPH, threadBlockedGlyph, threadEventGlyph } from './threadIcons';
import { goalResultSummary } from '../../Goals/_goalFormat';

const pct = (v) => (Number.isFinite(Number(v)) ? `${Math.round(Number(v) * 100)}%` : null);
const money = (v) => (Number.isFinite(Number(v)) ? `$${Number(v).toFixed(2)}` : null);
const list = (parts) => parts.filter(Boolean).join(' · ');
const qualityDeliverableNoun = (details) =>
  details?.deliverable_profile === 'axwise_workflow' ? 'deliverable' : 'PRD';
const qualityDeliverableTitle = (details, generic, prd) =>
  qualityDeliverableNoun(details) === 'deliverable' ? generic : prd;
const issueCodes = (details) =>
  (Array.isArray(details?.issues)
    ? details.issues
    : Array.isArray(details?.authorization_issues)
      ? details.authorization_issues
      : []
  )
    .map((issue) => String(issue?.code || issue || ''))
    .filter(Boolean);
const hasToolIssue = (details) => issueCodes(details).some((code) => code.startsWith('task_tool_'));
const needsApiKey = (details) => details?.classification === 'llm_api_key_required';
const API_KEY_RETRY_STAGES = new Set([
  'feasibility-analysis',
  'po-analysis',
  'pm-planning',
  'team-formation',
  'tool-provisioning',
  'execute-phase',
  'evaluate-phase',
  'iterate',
]);

function apiKeyRetryActions(details) {
  const stage = String(details?.action || details?.failure_stage || '').trim();
  if (!API_KEY_RETRY_STAGES.has(stage)) return null;
  const rawPhaseIndex =
    details?.phase_index ?? details?.phaseIndex ?? details?.failure_phase_index ?? null;
  const phaseIndex = Number(rawPhaseIndex);
  const params = {
    stage,
    ...(stage === 'execute-phase' && Number.isInteger(phaseIndex) && phaseIndex >= 0
      ? { phaseIndex }
      : {}),
  };
  return [
    {
      type: 'resolve_retry_stage',
      label: 'Retry with this key',
      params,
    },
  ];
}

function authorizationDetail(details) {
  const codes = issueCodes(details);
  if (hasToolIssue(details)) {
    return 'A required tool is not connected yet. Connect it, or continue without tools.';
  }
  if (codes.length) {
    return 'The planned work no longer matches the approved team. Rebuild the team before execution.';
  }
  return 'The plan, team and tools could not be bound into a safe execution approval.';
}

function authorizationActions(details) {
  if (hasToolIssue(details)) {
    return [
      { type: 'unblock_credentials', label: 'I connected the tool' },
      { type: 'resolve_retry_no_tools', label: 'Continue without tools' },
    ];
  }
  return [{ type: 'resolve_rebuild_team', label: 'Rebuild the team' }];
}

/**
 * A detail that is itself a bare code, made readable.
 *
 * Several emitters put a code in `reason` rather than a sentence, so an
 * unmapped event could still print "context_approval_stale" at the reader.
 * Nothing in the thread should ever be a code.
 */
const CODE_LIKE = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;
export function readableDetail(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return CODE_LIKE.test(text) ? describeInvalidationReason(text).headline : text;
}

/**
 * event_type -> how it reads in the thread.
 *
 * `tone` drives the marker: ok is a tick, warn needs the user, error stopped.
 * `detail` receives the event's details blob and may return null.
 */
export const RUN_EVENT_COPY = {
  goal_created: {
    tone: 'info',
    title: 'Goal created',
    detail: (d) => list([money(d.budget_usd) && `Budget ${money(d.budget_usd)}`]),
  },
  feasibility_done: {
    running: 'Checking it is doable',
    tone: 'ok',
    title: 'Looks doable',
    detail: (d) =>
      list([
        pct(d.complexity_score) && `Complexity ${pct(d.complexity_score)}`,
        pct(d.success_probability) && `success probability ${pct(d.success_probability)}`,
      ]),
    badge: (d) => d.recommendation,
  },
  po_validated: {
    running: 'Writing the brief',
    tone: 'ok',
    title: 'Brief written',
    detail: (d) =>
      list([
        d.acceptance_tests_count ? `${d.acceptance_tests_count} acceptance tests` : null,
        d.capabilities?.length ? `roles: ${d.capabilities.join(', ')}` : null,
      ]),
  },
  po_questions_generated: {
    tone: 'warn',
    title: 'A couple of questions first',
    detail: (d) =>
      d.question_count
        ? `${d.question_count} to answer before planning can start.`
        : 'Answer these before planning can start.',
  },
  axwise_customer_intelligence_completed: {
    running: 'Learning the context',
    tone: 'ok',
    title: 'Context understood',
    detail: (d) =>
      list([
        d.customer_persona ? `Audience: ${d.customer_persona}` : null,
        d.evidence_count ? `${d.evidence_count} pieces of evidence` : null,
      ]),
  },
  axwise_customer_intelligence_degraded: {
    tone: 'warn',
    title: 'Context understood, with gaps',
    detail: (d) => d.reason || 'Some research came back thin.',
  },
  awaiting_context_approval: {
    tone: 'warn',
    title: 'Waiting on you',
    detail: () => 'Confirm what we found before planning starts.',
    actions: () => [
      { type: 'approve_context', label: 'Review scope' },
      {
        type: 'revise_context',
        label: 'Ask for changes',
        field: 'feedback',
        placeholder: 'What should change?',
        params: { feedback: '' },
      },
    ],
  },
  context_approved: { tone: 'ok', title: 'Brief confirmed', detail: () => null },
  context_auto_approved: {
    tone: 'ok',
    title: 'Brief confirmed automatically',
    detail: () => 'Approval checkpoints are off, so the run continued without pausing here.',
  },
  context_revision_requested: {
    tone: 'warn',
    title: 'Sent back for changes',
    detail: (d) => d.feedback || null,
  },
  plan_created: {
    running: 'Building the plan',
    tone: 'ok',
    title: 'Plan ready',
    detail: (d) =>
      list([
        d.phaseCount ? `${d.phaseCount} phases` : null,
        d.jobCount ? `${d.jobCount} tasks` : null,
        d.estimatedHours ? `${d.estimatedHours} agent-work hours, run in parallel` : null,
      ]),
  },
  team_approved: {
    running: 'Picking the team',
    tone: 'ok',
    title: 'Team picked',
    detail: (d) =>
      list([
        d.leader ? `Led by ${d.leader}` : null,
        d.member_count ? `${d.member_count} agents` : null,
      ]),
  },
  team_coverage_incomplete: {
    tone: 'error',
    title: (d) =>
      d.missing_roles?.length === 1
        ? `No agent can do ${d.missing_roles[0]}`
        : 'Team is short a role',
    detail: (d) =>
      d.missing_roles?.length
        ? `Nobody in your workspace covers ${d.missing_roles.join(', ')}. Rebuilding the team creates one; asking for changes reworks the plan around the roles you have.`
        : d.reason || null,
    // The goal is needs_human here, so a plain retry would be refused - that
    // endpoint wants failed or cancelled. Re-running the stage is what actually
    // rebuilds the team.
    actions: () => [
      {
        type: 'resolve_retry_stage',
        label: 'Rebuild the team',
        params: { stage: 'team-formation' },
      },
      {
        type: 'resolve_retry_stage',
        label: 'Re-plan around the roles you have',
        params: { stage: 'pm-planning' },
      },
    ],
  },
  tools_provisioned: {
    running: 'Attaching tools',
    tone: 'ok',
    title: 'Tools attached',
    detail: () => null,
  },
  awaiting_tools: {
    tone: 'warn',
    title: 'Needs a connection',
    detail: (d) =>
      d.unconfigured?.length
        ? `${d.unconfigured.join(', ')} needs credentials before the work can start.`
        : 'A tool needs credentials before the work can start.',
    actions: () => [
      { type: 'unblock_credentials', label: 'I have connected them' },
      { type: 'resolve_retry_no_tools', label: 'Run without tools' },
    ],
  },
  tools_provided: { tone: 'ok', title: 'Tools connected', detail: () => null },
  proposal_ready: {
    running: 'Costing it out',
    tone: 'ok',
    title: 'Estimate ready',
    detail: (d) =>
      list([
        money(d.estimated_cost) && `About ${money(d.estimated_cost)}`,
        d.estimated_time ? `${d.estimated_time} minutes` : null,
      ]),
  },
  awaiting_approval: {
    tone: 'warn',
    title: 'Waiting on you',
    detail: () => 'Approve the plan and its cost before anything is spent.',
    actions: () => [
      { type: 'approve_goal', label: 'Approve and start' },
      {
        type: 'request_changes',
        label: 'Ask for changes',
        field: 'feedback',
        placeholder: 'What should change?',
        params: { feedback: '' },
      },
    ],
  },
  execution_auto_approved: {
    tone: 'ok',
    title: 'Plan approved automatically',
    detail: () => 'Approval checkpoints are off, so the run continued into execution.',
  },
  authorizing_execution: {
    tone: 'info',
    title: 'Authorizing',
    detail: () => 'Binding the approved plan to the team.',
  },
  phase_evaluated: {
    running: 'Checking the work',
    tone: 'ok',
    title: (d) => `Phase ${Number(d.phaseIndex ?? 0) + 1} complete`,
    detail: (d) =>
      list([
        Number.isFinite(Number(d.quality_score)) ? `Quality ${d.quality_score} of 100` : null,
        money(d.cost) && `${money(d.cost)} spent`,
      ]),
  },
  iteration_started: {
    tone: 'warn',
    title: 'Trying a different approach',
    detail: (d) =>
      d.feedback ||
      (d.newStrategy ? `New plan: ${d.newStrategy}` : 'The last attempt did not pass its checks.'),
    badge: (d) => (d.iteration ? `Attempt ${d.iteration}` : null),
  },
  budget_warning: {
    tone: 'warn',
    title: 'Budget is getting tight',
    // No control: the goal is still active and nothing is blocked yet. An
    // active goal is not resolvable, so a button here could only ever fail.
    detail: (d) => d.reason || 'Close to the limit you set.',
  },
  budget_exhausted: {
    tone: 'error',
    title: 'Budget spent',
    detail: () => 'Add more to keep going, or stop here.',
    actions: () => [
      {
        type: 'resolve_increase_budget',
        label: 'Add budget',
        field: 'new_budget_usd',
        placeholder: 'New budget in dollars, e.g. 25',
        params: { new_budget_usd: '' },
      },
      { type: 'cancel_goal', label: 'Stop here' },
    ],
  },
  agent_warning: {
    tone: 'warn',
    title: (d) => (d.agent_name ? `${d.agent_name} is struggling` : 'An agent is struggling'),
    detail: (d) =>
      list([
        d.task_title ? `On “${d.task_title}”` : null,
        d.failure_count ? `${d.failure_count} failed attempts` : null,
      ]),
  },
  agent_flagged_underperforming: {
    tone: 'warn',
    title: 'An agent is underperforming',
    detail: (d) =>
      list([
        Number.isFinite(Number(d.avg_quality))
          ? `Averaging ${Math.round(d.avg_quality)}/100`
          : null,
        d.tuning_count ? `${d.tuning_count} prompt adjustments applied` : null,
      ]) || 'Its prompt is being tuned.',
  },
  consilium_reviewed: { tone: 'ok', title: 'The board reviewed the work', detail: () => null },
  deployment_published: {
    running: 'Publishing',
    tone: 'ok',
    title: 'Published',
    detail: () => 'It is live and reachable now.',
    link: (d) => d.url || d.deployment_url || null,
  },
  osja_review_completed: {
    running: 'Reviewing the work',
    tone: 'ok',
    title: 'Quality review passed',
    detail: (d) => (d.overallGrade ? `Grade ${d.overallGrade}.` : null),
  },
  prd_quality_attested: {
    running: 'Checking final quality',
    tone: 'ok',
    title: (d) =>
      qualityDeliverableTitle(d, 'Final deliverable quality verified', 'PRD quality verified'),
    detail: (d) =>
      Number.isFinite(Number(d.score)) && Number.isFinite(Number(d.threshold))
        ? `${Math.round(Number(d.score))}/${Math.round(Number(d.threshold))}; exact scope and artifact hashes verified.`
        : 'The exact scope and artifact hashes passed the final quality contract.',
  },
  prd_quality_validation_failed: {
    running: 'Checking final quality',
    tone: 'warn',
    title: (d) =>
      qualityDeliverableTitle(
        d,
        'The deliverable needs a focused repair',
        'The PRD needs a focused repair'
      ),
    detail: (d) => {
      const score = Number.isFinite(Number(d.score)) ? Math.round(Number(d.score)) : null;
      const threshold = Number.isFinite(Number(d.threshold))
        ? Math.round(Number(d.threshold))
        : null;
      const repairStatus = d.repair?.status;
      if (score !== null && threshold !== null) {
        return `${score}/${threshold}.${repairStatus === 'queued' ? ' Repairing only the failed sections now.' : ''}`;
      }
      return repairStatus === 'queued' ? 'Repairing only the failed sections now.' : null;
    },
  },
  prd_quality_repair_started: {
    running: 'Repairing the final deliverable',
    tone: 'info',
    title: (d) =>
      qualityDeliverableTitle(
        d,
        'Repairing failed deliverable parts',
        'Repairing failed PRD sections'
      ),
    detail: (d) =>
      Array.isArray(d.sections) && d.sections.length
        ? `${d.sections.length} section${d.sections.length === 1 ? '' : 's'} targeted; passing content stays unchanged.`
        : 'The repair is bounded to the failed quality findings.',
  },
  prd_quality_repair_completed: {
    running: 'Rechecking the repaired deliverable',
    tone: 'ok',
    title: (d) =>
      qualityDeliverableTitle(
        d,
        'Focused deliverable repair complete',
        'Focused PRD repair complete'
      ),
    detail: () => 'Rechecking the exact repaired artifact against the same quality contract.',
  },
  prd_quality_repair_failed: {
    tone: 'warn',
    title: (d) =>
      qualityDeliverableTitle(d, 'The deliverable needs your review', 'The PRD needs your review'),
    detail: (d) => readableDetail(d.reason),
  },
  prd_quality_completion_refused: {
    running: 'Rechecking the exact deliverable',
    tone: 'warn',
    title: (d) =>
      qualityDeliverableTitle(
        d,
        'The final deliverable changed during validation',
        'The final PRD changed during validation'
      ),
    detail: () => 'Revalidating the current artifact before marking it complete.',
  },
  goal_completed: {
    tone: 'ok',
    title: 'Done',
    detail: (d) => (money(d.totalCost) ? `${money(d.totalCost)} spent in total.` : null),
  },
  goal_failed: {
    tone: 'error',
    title: 'Did not finish',
    detail: (d) => readableDetail(d.reason || d.failure_reason || d.last_failure),
    actions: () => [
      { type: 'retry_goal', label: 'Try again' },
      { type: 'resolve_retry_stage', label: 'Re-plan it', params: { stage: 'pm-planning' } },
    ],
  },
  goal_cancelled: { tone: 'info', title: 'Stopped', detail: () => null },
  goal_paused: {
    tone: 'warn',
    title: 'Paused',
    detail: () => 'Nothing is running right now.',
    actions: () => [
      { type: 'resume_goal', label: 'Resume' },
      { type: 'cancel_goal', label: 'Stop for good' },
    ],
  },
  goal_needs_human: {
    tone: 'warn',
    title: (d) => (needsApiKey(d) ? 'Connect an AI key' : 'Needs you'),
    // h99-escalate writes last_failure, iterate writes reason. Reading only
    // one of them is what produced the dead-end "We could not finish this one
    // on our own" with no explanation attached.
    detail: (d) =>
      needsApiKey(d)
        ? 'Add your Gemini API key, then return here and retry this stage.'
        : readableDetail(d.reason || d.last_failure || d.failure_reason),
    link: (d) => (needsApiKey(d) ? d.recovery_action?.target_url || '/settings/keys' : null),
    linkLabel: (d) => (needsApiKey(d) ? d.recovery_action?.label || 'Open API Keys' : null),
    actions: (d) =>
      needsApiKey(d)
        ? apiKeyRetryActions(d)
        : [
            { type: 'heal_goal', label: 'Let it try to recover' },
            {
              type: 'resolve_retry_stage',
              label: 'Re-plan it',
              params: { stage: 'pm-planning' },
            },
            { type: 'cancel_goal', label: 'Stop here' },
          ],
  },
  research_execution_boundary_blocked: {
    tone: 'warn',
    title: 'Research context needs refreshing',
    detail: (d) =>
      d.stage === 'team-formation'
        ? 'The approved research does not cover every specialist in the plan.'
        : 'The approved research is incomplete or no longer matches this plan.',
    actions: () => [
      { type: 'resolve_retry_customer_research', label: 'Run the research again' },
      { type: 'cancel_goal', label: 'Stop here' },
    ],
  },
  execution_authorization_incomplete: {
    tone: 'warn',
    title: 'The team is not ready to start',
    detail: authorizationDetail,
    actions: authorizationActions,
  },
  execution_authorization_inspection_failed: {
    tone: 'warn',
    title: 'The execution check needs another try',
    detail: () => 'We could not verify the plan, team and tools. Rebuild the team to try again.',
    actions: () => [{ type: 'resolve_rebuild_team', label: 'Rebuild the team' }],
  },
  execution_authorization_binding_failed: {
    tone: 'warn',
    title: 'The approved plan could not start',
    detail: () => 'The execution approval changed while work was starting. Review it once more.',
    actions: () => [{ type: 'approve_goal', label: 'Review and approve again' }],
  },
  execution_blocked_missing_proposal_approval: {
    tone: 'warn',
    title: (d) =>
      hasToolIssue(d) ? 'Connect a tool before work starts' : 'The plan needs your approval again',
    detail: (d) =>
      hasToolIssue(d)
        ? authorizationDetail(d)
        : 'The plan, team or tools changed, so the previous approval no longer applies.',
    actions: (d) =>
      hasToolIssue(d)
        ? authorizationActions(d)
        : [
            { type: 'approve_goal', label: 'Approve the current plan' },
            {
              type: 'request_changes',
              label: 'Ask for changes',
              field: 'feedback',
              placeholder: 'What should change?',
              params: { feedback: '' },
            },
          ],
  },
  execution_blocked_missing_context_approval: {
    tone: 'warn',
    title: 'Confirm the brief before work starts',
    detail: () => 'The context changed after the last confirmation.',
    actions: () => [
      { type: 'approve_context', label: 'Confirm the brief' },
      {
        type: 'revise_context',
        label: 'Ask for changes',
        field: 'feedback',
        placeholder: 'What should change?',
        params: { feedback: '' },
      },
    ],
  },
  context_approval_required: {
    tone: 'warn',
    title: 'Confirm the updated brief',
    detail: () => 'The final plan uses newer context than the last confirmation.',
    actions: () => [
      { type: 'approve_context', label: 'Confirm the brief' },
      {
        type: 'revise_context',
        label: 'Ask for changes',
        field: 'feedback',
        placeholder: 'What should change?',
        params: { feedback: '' },
      },
    ],
  },
  goal_resolved_by_human: {
    tone: 'ok',
    title: 'Change accepted',
    detail: () => 'The run is continuing with your update.',
  },
  goal_healed: {
    tone: 'ok',
    title: 'Recovered and resumed',
    detail: () => 'The run repaired the interruption and is moving again.',
  },
  execution_approval_invalidated: {
    // The reason arrives as a code. Printing it verbatim under a headline the
    // user cannot act on is what made this line a dead end.
    tone: 'info',
    title: 'The approval was reset',
    detail: (d) => describeInvalidationReason(d.reason).headline,
    actions: (d) =>
      describeInvalidationReason(d.reason).transient
        ? null
        : [{ type: 'approve_goal', label: 'Approve the current plan' }],
  },
  context_approval_invalidated: {
    tone: 'info',
    title: 'The brief needs confirming again',
    detail: (d) => describeInvalidationReason(d.reason).headline,
  },
  execution_blocked_task_authorization: {
    tone: 'warn',
    title: 'A task could not be released',
    detail: (d) => {
      const { items } = describeInvalidationReasons(d.reasons || []);
      return items.length ? `${items[0].headline} ${items[0].remedy}` : null;
    },
    actions: () => [
      { type: 'approve_goal', label: 'Approve the current plan' },
      { type: 'request_changes', label: 'Change the plan', params: { feedback: '' } },
    ],
  },
  plan_role_alignment_incomplete: {
    tone: 'error',
    title: 'The plan asks for roles the team does not have',
    detail: (d) =>
      d.uncovered_roles?.length
        ? `Nothing in the plan suits ${d.uncovered_roles.join(', ')}.`
        : d.reason || null,
    actions: () => [
      { type: 'resolve_retry_stage', label: 'Re-plan it', params: { stage: 'pm-planning' } },
      {
        type: 'resolve_retry_stage',
        label: 'Rebuild the team',
        params: { stage: 'team-formation' },
      },
    ],
  },
};

/** Turn an unmapped event_type into something a person can read. */
export function humanizeEventType(type) {
  return String(type || '')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

function resolve(value, details) {
  return typeof value === 'function' ? value(details) : value;
}

/** One goal_log row as a thread message, or null when it says nothing useful. */
export function describeEvent(entry) {
  const type = entry?.event_type;
  if (!type || SILENT.has(type)) return null;
  const details = entry.details || {};
  const copy = RUN_EVENT_COPY[type];

  if (!copy) {
    const unmappedTone = /fail|error|blocked|exhausted/.test(type)
      ? 'error'
      : /await|warn|incomplete|needs|revision/.test(type)
        ? 'warn'
        : 'info';
    return {
      running: null,
      tone: unmappedTone,
      title: humanizeEventType(type),
      detail: readableDetail(
        details.feedback || details.reason || details.last_failure || details.failure_reason
      ),
      badge: null,
      link: null,
      actions: null,
      // Unmapped, so the tone picks the shape. Still a glyph rather than a
      // blank, because a line with no marker reads as a different kind of
      // message rather than an unrecognised one.
      glyph: threadEventGlyph(type, unmappedTone),
    };
  }

  return {
    tone: copy.tone || 'info',
    // The present-tense form, used while this stage is the one in flight. The
    // pipeline only writes a log row once a stage has finished, so without it a
    // live run reads as a static list that grows rather than work happening.
    running: copy.running || null,
    title: resolve(copy.title, details),
    detail: resolve(copy.detail, details) || null,
    badge: resolve(copy.badge, details) || null,
    link: resolve(copy.link, details) || null,
    linkLabel: resolve(copy.linkLabel, details) || null,
    // Controls the thread renders beside the message. A blocked state that
    // cannot be acted on from where it is read is a dead end.
    actions: resolve(copy.actions, details) || null,
    // What happened, as a shape. The tone above colours it.
    glyph: threadEventGlyph(type, copy.tone || 'info'),
  };
}

function nativeScopeGateEvent(block, at = 0) {
  const materialQuestion = block?.materialQuestion || null;
  return {
    id: 'native-scope-approval-blocked',
    kind: 'event',
    at,
    cost: 0,
    tone: 'warn',
    title: materialQuestion ? 'AxWise needs one answer' : 'The native scope is not ready',
    detail: materialQuestion || block.message,
    actions: [
      {
        type: 'revise_context',
        label: materialQuestion ? 'Answer AxWise' : 'Correct the scope',
        field: 'feedback',
        placeholder: materialQuestion ? 'Type your answer…' : 'What should change?',
        params: { feedback: '' },
      },
    ],
    glyph: threadEventGlyph('awaiting_context_approval', 'warn'),
    blocked: true,
    live: true,
  };
}

/**
 * Statuses where the run has stopped and only the user can restart it.
 *
 * The two approval gates are deliberately absent: they already render as
 * their own cards with Approve and Request changes on them, and a second
 * "waiting on you" underneath would read as two separate problems.
 */
const BLOCKED_STATUS = {
  needs_human: {
    tone: 'warn',
    // Waiting on a person is a live state - the run is held open and nothing
    // moves until they act, so the marker keeps pulsing until they do. Paused
    // and failed are not: nothing is happening there, and a moving marker
    // would say otherwise.
    waiting: true,
    title: 'Needs you',
    fallback: 'It could not get past this on its own.',
    actions: [
      { type: 'heal_goal', label: 'Let it try to recover' },
      { type: 'resolve_retry_stage', label: 'Re-plan it', params: { stage: 'pm-planning' } },
      { type: 'cancel_goal', label: 'Stop here' },
    ],
  },
  failed: {
    tone: 'error',
    title: 'Did not finish',
    fallback: 'The run stopped before it produced anything.',
    actions: [
      { type: 'retry_goal', label: 'Try again' },
      { type: 'resolve_retry_stage', label: 'Re-plan it', params: { stage: 'pm-planning' } },
    ],
  },
  awaiting_tools: {
    tone: 'warn',
    waiting: true,
    title: 'Needs a connection',
    fallback: 'A tool needs credentials before the work can start.',
    actions: [
      { type: 'unblock_credentials', label: 'I have connected them' },
      { type: 'resolve_retry_no_tools', label: 'Run without tools' },
    ],
  },
  paused: {
    tone: 'warn',
    title: 'Paused',
    fallback: 'Nothing is running right now.',
    actions: [
      { type: 'resume_goal', label: 'Resume' },
      { type: 'cancel_goal', label: 'Stop for good' },
    ],
  },
};

/**
 * The one message that says what is wrong now and what to do about it.
 *
 * The stage log says what happened; this says where the goal is standing. It
 * reads goal.data.failure_reason, which is where the server has always put the
 * real sentence - the thread simply never looked at it.
 */
export function blockedMessage(goal, at = 0) {
  const spec = BLOCKED_STATUS[goal?.status];
  if (!spec) return null;
  const data = goal?.data || {};
  const apiKeyRequired = data.failure_code === 'llm_api_key_required';
  return {
    id: `blocked-${goal.status}`,
    kind: 'event',
    blocked: true,
    live: Boolean(spec.waiting),
    at,
    cost: 0,
    tone: spec.tone,
    running: null,
    title: apiKeyRequired ? 'Connect an AI key' : spec.title,
    detail: apiKeyRequired
      ? 'Add your Gemini API key, then return here and retry this stage.'
      : readableDetail(data.failure_reason || data.last_failure) || spec.fallback,
    badge: null,
    link: apiKeyRequired ? data.recovery_action?.target_url || '/settings/keys' : null,
    linkLabel: apiKeyRequired ? data.recovery_action?.label || 'Open API Keys' : null,
    actions: apiKeyRequired ? apiKeyRetryActions(data) : spec.actions,
    glyph: threadBlockedGlyph(goal.status, spec.tone),
  };
}

/**
 * What the run produced, as the message that closes the thread.
 *
 * The stage log ends on "Done" and a figure. That says the run stopped and
 * what it cost; it says nothing about what came out, so a goal reopened from
 * History read as a list of things that happened to someone else. Everything
 * needed is already on the goal row - complete.js writes the summary, the
 * deliverables and the team lead's sign-off - the thread simply never looked.
 *
 * `tasks` rides the message by reference on purpose. FinalResultsSection
 * memoises on it, and buildRunTranscript runs on every render of the thread,
 * so copying or filtering here would re-run all six deliverable extractors on
 * every keystroke in the composer.
 */
export function resultMessage(goal, { tasks = [], at = 0 } = {}) {
  if (goal?.status !== 'completed') return null;

  const overview = goal?.data?.project_overview || null;
  const deliverables = Array.isArray(goal?.data?.deliverables) ? goal.data.deliverables : [];
  const attestation = goal?.data?.prd_quality_attestation || null;
  const quality =
    attestation?.status === 'passed'
      ? {
          score: Number.isFinite(Number(attestation.score)) ? Number(attestation.score) : null,
          sectionCount: Number.isFinite(Number(attestation.section_count))
            ? Number(attestation.section_count)
            : null,
          requirementCount: Number.isFinite(Number(attestation.requirement_count))
            ? Number(attestation.requirement_count)
            : null,
          linkedTestCount: Number.isFinite(Number(attestation.linked_test_count))
            ? Number(attestation.linked_test_count)
            : null,
          openDecisionCount: Number.isFinite(Number(attestation.open_decision_count))
            ? Number(attestation.open_decision_count)
            : null,
        }
      : null;
  // A strict-quality PRD already has an evidence-bound completion summary.
  // Do not spend another screenful restating the artifact through the generic
  // project-overview prose: the compact attestation line and the file itself
  // are the useful answer. Other goal types retain the richer sign-off.
  const headline = quality ? null : String(overview?.one_liner || '').trim() || null;
  const summary = quality ? null : goalResultSummary(goal);
  const liveUrl = goal?.data?.deployment_url || overview?.key_links?.live || null;

  // A run that finished having made nothing already ends on "Done". An empty
  // "your result" card underneath it is worse than no card at all.
  const produced =
    deliverables.length > 0 ||
    Boolean(liveUrl) ||
    (tasks || []).some((t) => t?.status === 'done' && t?.data?.output);
  if (!produced && !headline && !summary) return null;

  const artifactOutput =
    deliverables.find((deliverable) => String(deliverable?.output || '').trim())?.output ||
    (tasks || []).find((task) => task?.status === 'done' && String(task?.data?.output || '').trim())
      ?.data?.output ||
    '';
  const artifactHeading =
    String(artifactOutput)
      .match(/^#\s+(.+)$/m)?.[1]
      ?.trim() || null;

  return {
    id: `result-${goal.id}`,
    kind: 'result',
    at,
    goalId: goal.id,
    tone: 'ok',
    title: quality && artifactHeading ? `Done - ${artifactHeading}` : 'Your result',
    glyph: THREAD_GLYPH.done,
    headline,
    summary,
    leadNote: quality ? null : String(overview?.team_lead_note || '').trim() || null,
    quality,
    deliverables,
    liveUrl,
    tasks,
  };
}

const time = (row) => new Date(row?.created_at || 0).getTime() || 0;

/**
 * goal_messages channel the user's conversation with the team lead is stored
 * under. GoalThread renders those turns from its own `chat` prop so the reply
 * keeps its action chips, which means the run transcript has to skip them or
 * every exchange would appear twice.
 */
export const LEAD_CHAT_CHANNEL = 'agent-lead';

/** Tasks belonging to one phase, in the order the plan plays them. */
export function tasksForPhase(tasks, phaseIndex) {
  return (tasks || [])
    .filter((t) => Number(t?.data?.phase_index) === Number(phaseIndex))
    .sort((a, b) => Number(a.sequence_order || 0) - Number(b.sequence_order || 0));
}

/**
 * Build the run half of the thread.
 *
 * Sorts by created_at rather than trusting input order: op=get returns logs
 * descending and limited to 50, while realtime appends new rows to the end, so
 * the array arrives genuinely non-monotonic.
 */
export function buildRunTranscript({ logs = [], messages = [], tasks = [], goal = null } = {}) {
  const out = [];
  const nativeScopeBlock =
    goal?.status === 'awaiting_context_approval' ? nativeAxwiseScopeApprovalBlock(goal) : null;
  let nativeScopeGateRendered = false;

  const events = [...(logs || [])].sort((a, b) => time(a) - time(b));
  const currentNativeGateLog = nativeScopeBlock
    ? events.filter((row) => row?.event_type === 'awaiting_context_approval').slice(-1)[0] || null
    : null;
  const chats = [...(messages || [])]
    .filter((m) => m?.message && m.channel !== 'system' && m.channel !== LEAD_CHAT_CHANNEL)
    .sort((a, b) => time(a) - time(b));

  const merged = [
    ...events.map((row) => ({ at: time(row), row, source: 'log' })),
    ...chats.map((row) => ({ at: time(row), row, source: 'chat' })),
  ].sort((a, b) => a.at - b.at);

  merged.forEach((item, index) => {
    const { row, source, at } = item;

    if (source === 'chat') {
      out.push({
        id: `chat-${row.id || index}`,
        kind: 'chat',
        at,
        who: row.sender_name || 'Agent',
        text: row.message,
        messageType: row.message_type || 'text',
      });
      return;
    }

    // A phase starting opens a section and carries the work under it.
    if (row.event_type === 'phase_started') {
      const phaseIndex = Number(row.details?.phaseIndex ?? 0);
      out.push({
        id: `phase-${row.id || index}`,
        kind: 'phase',
        at,
        phaseIndex,
        label: row.details?.phaseName || `Phase ${phaseIndex + 1}`,
        total: goal?.plan?.phases?.length || null,
        tasks: tasksForPhase(tasks, phaseIndex),
      });
      return;
    }

    let described = describeEvent(row);
    if (!described) return;
    if (row.event_type === 'awaiting_context_approval' && nativeScopeBlock) {
      if (row === currentNativeGateLog) {
        described = nativeScopeGateEvent(nativeScopeBlock, at);
        nativeScopeGateRendered = true;
      } else {
        described = { ...described, actions: null };
      }
    }
    out.push({
      id: `event-${row.id || index}`,
      kind: 'event',
      at,
      cost: Number(row.cost_usd) || 0,
      ...described,
    });
  });

  if (nativeScopeBlock && !nativeScopeGateRendered) {
    out.push(nativeScopeGateEvent(nativeScopeBlock, out[out.length - 1]?.at || 0));
  }

  // What is happening now, marked so its marker can move. Everything else has
  // demonstrably finished, because a later row exists - and a thread that
  // animates finished work is not livelier, it is lying.
  if (!STOPPED.has(goal?.status)) {
    // A phase is live while any of its work is. This is usually the newest row
    // on screen and it was the one row that never moved: the scan below used to
    // walk straight past a phase to the stage line above it, so the marker
    // turned on a stage that had already finished while the actual work sat
    // still underneath it.
    for (const message of out) {
      if (message.kind !== 'phase') continue;
      message.live = (message.tasks || []).some((t) => t?.status === 'inProgress');
    }

    // The newest row is where the run currently stands. Either it is a stage
    // still running, or a gate holding the run open until the user does
    // something - both are now. The old `tone === 'ok'` test excluded every
    // gate, which left "Waiting on you" as the deadest thing on a screen it is
    // the whole point of.
    for (let i = out.length - 1; i >= 0; i -= 1) {
      const message = out[i];
      // An agent saying something mid-stage does not move the run on, so it
      // does not hide the stage line behind it.
      if (message.kind === 'chat') continue;
      // A phase decides for itself, from its own tasks, just above. Reaching
      // past it would light up the stage line that a phase has since started
      // underneath - which is exactly how the marker ended up turning on
      // finished work while the work itself sat still.
      if (message.kind === 'phase') break;
      if (message.running || message.tone === 'warn') message.live = true;
      break;
    }
  }

  // Close on what to do now. Skipped when the last stage line already carries
  // its own controls, so a blocked goal never asks the same thing twice.
  const blocked = blockedMessage(goal, out[out.length - 1]?.at || 0);
  if (blocked) {
    const tail = out[out.length - 1];
    if (tail?.kind === 'event' && (tail.actions?.length || tail.link)) {
      if (!tail.detail) tail.detail = blocked.detail;
      tail.blocked = true;
    } else {
      out.push(blocked);
    }
  }

  // What it produced, last. Everything above is the run reporting on itself;
  // this is the one message the person who asked for the goal came back for.
  const closingAt =
    (goal?.data?.completed_at ? new Date(goal.data.completed_at).getTime() : 0) ||
    out[out.length - 1]?.at ||
    0;
  const result = resultMessage(goal, { tasks, at: closingAt });
  if (result) out.push(result);

  return out;
}
