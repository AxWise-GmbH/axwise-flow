/**
 * Goal states that can still advance through the pipeline or an approval/input
 * checkpoint. Keep this aligned with the goal status constraint and pipeline.
 */
export const GOAL_POLLING_STATUSES = Object.freeze([
  'feasibility',
  'analyzing',
  'researching_customer',
  'awaiting_context_approval',
  'planning',
  'forming_team',
  'provisioning_tools',
  'estimating',
  'awaiting_approval',
  'authorizing_execution',
  'active',
  'awaiting_tools',
  'awaiting_po_input',
]);

const GOAL_POLLING_STATUS_SET = new Set(GOAL_POLLING_STATUSES);

export function hasPollableGoal(goals = []) {
  return goals.some((goal) => GOAL_POLLING_STATUS_SET.has(goal?.status));
}
