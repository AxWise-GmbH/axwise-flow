/**
 * The one registry of things a person can do to a goal from a message.
 *
 * The team lead chat owned this map, so every other surface that wanted to
 * offer "Retry" or "Approve" next to an explanation had to either open that
 * dialog or write the call again. It is shared now: the Simple thread attaches
 * these action types to blocked states and runs them inline.
 *
 * Keep in sync with the backend ACTION_INSTRUCTIONS catalog in
 * lib/api-handlers/goal-lead-chat.js.
 */
import {
  retryGoal,
  resolveGoal,
  pauseGoal,
  resumeGoal,
  cancelGoal,
  healGoal,
  approveGoal,
  approveGoalContext,
  reviseGoalContext,
  requestGoalChanges,
  provideTools,
  rebuildGoalTeam,
} from '../../services/goalService';
import { addDocument } from '../../services/knowledgeBaseService';
import { addLog } from '../../services/communicatorService';
import { updateTeamTaskById } from '../../services/teamTaskBackend';
import {
  hasNativeAxwiseScopeMarkers,
  nativeAxwiseScopeActionBinding,
} from '../../../lib/_shared/native-scope-approval.js';

function nativeScopeBindingArgs(goal) {
  const binding = nativeAxwiseScopeActionBinding(goal);
  return binding ? [binding] : [];
}

/** actionType -> (goalId, params, goal) => Promise */
export const ACTION_HANDLERS = {
  retry_goal: (goalId) => retryGoal(goalId),
  resolve_retry_no_tools: (goalId, p) =>
    resolveGoal(goalId, { type: 'disable_tools', data: { phaseIndex: p.phaseIndex } }),
  resolve_skip_phase: (goalId, p) =>
    resolveGoal(goalId, { type: 'skip_stuck_phase', data: { phaseIndex: p.phaseIndex } }),
  resolve_retry_stage: (goalId, p) =>
    resolveGoal(goalId, {
      type: 'retry_from_stage',
      data: { stage: p.stage, phaseIndex: p.phaseIndex },
    }),
  resolve_retry_customer_research: (goalId) =>
    resolveGoal(goalId, { type: 'retry_customer_research', data: {} }),
  resolve_rebuild_team: (goalId) => rebuildGoalTeam(goalId),
  resolve_switch_model: (goalId, p) =>
    resolveGoal(goalId, { type: 'switch_model', data: { provider: p.provider, model: p.model } }),
  resolve_increase_budget: (goalId, p) =>
    resolveGoal(goalId, {
      type: 'increase_budget',
      data: { new_budget_usd: Number(p.new_budget_usd) },
    }),
  resolve_increase_iterations: (goalId, p) =>
    resolveGoal(goalId, { type: 'increase_iterations', data: { new_max: Number(p.new_max) } }),
  pause_goal: (goalId) => pauseGoal(goalId),
  resume_goal: (goalId) => resumeGoal(goalId),
  cancel_goal: (goalId) => cancelGoal(goalId),
  heal_goal: (goalId) => healGoal(goalId),
  approve_goal: (goalId) => approveGoal(goalId),
  approve_context: (goalId, _params, goal) =>
    approveGoalContext(goalId, ...nativeScopeBindingArgs(goal)),
  revise_context: (goalId, p, goal) =>
    reviseGoalContext(goalId, p.feedback || '', ...nativeScopeBindingArgs(goal)),
  request_changes: (goalId, p) => requestGoalChanges(goalId, p.feedback || ''),
  unblock_credentials: (goalId) => provideTools(goalId),
  save_to_kb: (goalId, p, goal) =>
    addDocument({
      title: p.title || `Decision — ${goal?.title || 'goal'}`,
      content: p.content || '',
      content_type: 'note',
      category: 'decision',
      tags: ['goal', 'decision'],
      metadata: { goal_id: goalId },
    }),
  post_to_communicator: (goalId, p, goal) =>
    addLog({
      sender_type: 'system',
      sender_name: 'Team Lead',
      content: p.message || '',
      context_type: 'goal',
      context_id: goalId,
      context_label: goal?.title || '',
    }),
  reassign_task: (goalId, p) => updateTeamTaskById(p.taskId, { assigned_to: p.assigned_to }),
};

export function isKnownGoalAction(type) {
  return Object.prototype.hasOwnProperty.call(ACTION_HANDLERS, String(type || ''));
}

/**
 * Which goal statuses each server endpoint will accept.
 *
 * Mirrors the guards in lib/api-handlers/goals.js. Offering a control the
 * server will refuse is worse than offering none: the message looks actionable,
 * the click returns 400, and the user is back where they started. Keep these in
 * step with the handlers named beside them.
 */
export const GOAL_ACTION_STATUSES = {
  // handleResolve - the `resolvable` list
  resolve: ['needs_human', 'failed', 'paused', 'awaiting_approval', 'awaiting_tools'],
  // handleApproval - requires exactly this status
  approval: ['awaiting_approval'],
  // handleReviewContext - requires exactly this status
  contextApproval: ['awaiting_context_approval'],
  // handleRetry - a running or blocked goal is not retryable
  retry: ['failed', 'cancelled'],
  // handleProvideTools
  tools: ['awaiting_tools'],
};

/**
 * actionType -> the precondition its endpoint enforces. Anything absent has no
 * status guard on the server (heal, pause, resume, cancel, and the write-out
 * actions), so it is always offered.
 */
const ACTION_REQUIRES = {
  retry_goal: 'retry',
  approve_goal: 'approval',
  approve_context: 'contextApproval',
  revise_context: 'contextApproval',
  request_changes: 'approval',
  unblock_credentials: 'tools',
  resolve_retry_no_tools: 'resolve',
  resolve_skip_phase: 'resolve',
  resolve_retry_stage: 'resolve',
  resolve_retry_customer_research: 'resolve',
  resolve_rebuild_team: 'resolve',
  resolve_switch_model: 'resolve',
  resolve_increase_budget: 'resolve',
  resolve_increase_iterations: 'resolve',
};

/** Would the server accept this action for the goal as it stands right now? */
export function goalActionAvailable(type, goal) {
  if (!isKnownGoalAction(type)) return false;
  // A native roster/task is the immutable output of one planning + formation
  // generation and is covered by Gate 2. Direct browser reassignment would
  // change the executor without invalidating or rebuilding that approval.
  if (type === 'reassign_task' && hasNativeAxwiseScopeMarkers(goal)) return false;
  const requirement = ACTION_REQUIRES[type];
  if (!requirement) return true;
  return GOAL_ACTION_STATUSES[requirement].includes(goal?.status);
}

/**
 * The subset worth showing. A status can change under a message that is already
 * on screen - a goal moves from awaiting_approval to active while the thread is
 * open - so this is applied at render time, not when the message is built.
 */
export function availableGoalActions(actions, goal) {
  return (actions || []).filter((action) => goalActionAvailable(action?.type, goal));
}

/** Actions with a primary free-text field the user can edit before confirming. */
export const EDITABLE_FIELD = {
  revise_context: 'feedback',
  request_changes: 'feedback',
  save_to_kb: 'content',
  post_to_communicator: 'message',
};

/**
 * Run one action. Resolves to `{ ok }` rather than throwing so a caller
 * rendering a row of chips can show per-chip failure without a boundary.
 */
export async function runGoalAction(action, goal) {
  const fn = ACTION_HANDLERS[action?.type];
  if (!fn) return { ok: false, error: `Unknown action "${action?.type}".` };
  try {
    await fn(goal?.id, action.params || {}, goal);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || 'error' };
  }
}
