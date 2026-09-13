/**
 * Plain-language copy for the Step 2 run monitor in Simple mode.
 *
 * Simple mode shows one headline and one subline at a time, so every goal
 * status a running goal can reach needs an entry. The list is the CHECK
 * constraint on goals.status (migration 195); runStageCopy.test.js iterates it
 * literally so a status added later without copy fails the build rather than
 * silently rendering the generic fallback.
 */

/** Every value goals.status can hold, in lifecycle order. */
export const GOAL_STATUSES = [
  'draft',
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
  'pending_validation',
  'paused',
  'completed',
  'failed',
  'cancelled',
  'awaiting_tools',
  'awaiting_po_input',
  'needs_human',
];

/** Statuses where nothing more will happen without a person or a retry. */
export const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

/** Statuses that need the user even when Human Approve is off. */
export const BLOCKED_STATUSES = new Set([
  'awaiting_tools',
  'awaiting_po_input',
  'needs_human',
  'paused',
]);

/**
 * Six dots: Understanding, Planning, Preparing, Costing, Working, Done.
 * The eight PIPELINE_STAGES in GoalDetailDialog collapse into these because
 * Simple mode is answering "how far along is this", not "which stage is this".
 */
export const RUN_DOT_COUNT = 6;

const STAGE_COPY = {
  draft: { dot: 0, headline: 'Getting ready', subline: 'Locking in your request.' },
  feasibility: {
    dot: 0,
    headline: 'Checking it is doable',
    subline: 'Weighing the scope against your budget.',
  },
  analyzing: {
    dot: 1,
    headline: 'Understanding the goal',
    subline: 'Turning your description into a clear brief.',
  },
  researching_customer: {
    dot: 1,
    headline: 'Proposing the scope',
    subline: 'Setting outcomes, assumptions, and required capabilities.',
  },
  awaiting_context_approval: {
    dot: 1,
    headline: 'Confirming the scope',
    subline: 'Approving it on your behalf.',
    waitingSubline: 'Waiting for you to confirm or correct the proposed scope.',
  },
  awaiting_po_input: {
    dot: 1,
    headline: 'Confirming the scope',
    subline: 'Review the proposed scope or add a correction before planning.',
  },
  planning: { dot: 2, headline: 'Building the plan', subline: 'Breaking the work into phases.' },
  forming_team: {
    dot: 2,
    headline: 'Picking the team',
    subline: 'Matching specialists to each phase.',
  },
  provisioning_tools: {
    dot: 2,
    headline: 'Setting up',
    subline: 'Preparing what the team needs to start.',
  },
  estimating: { dot: 3, headline: 'Costing it out', subline: 'Estimating time and spend.' },
  awaiting_approval: {
    dot: 3,
    headline: 'Final check',
    subline: 'Approving the plan for you.',
    waitingSubline: 'Waiting for you to approve the plan.',
  },
  authorizing_execution: {
    dot: 3,
    headline: 'Authorizing',
    subline: 'Binding the approved plan to the team.',
  },
  active: {
    dot: 4,
    headline: 'Working on it',
    subline: 'Your team is producing the deliverables.',
  },
  pending_validation: {
    dot: 5,
    headline: 'Checking final quality',
    subline: 'Testing the exact deliverable against the approved scope.',
  },
  paused: { dot: 4, headline: 'Paused', subline: 'Nothing is running right now.' },
  awaiting_tools: {
    dot: 4,
    headline: 'Needs a connection',
    subline: 'One tool is not connected yet.',
  },
  needs_human: {
    dot: 4,
    headline: 'Needs you',
    subline: 'We could not finish this one on our own.',
  },
  completed: { dot: RUN_DOT_COUNT, headline: 'Done', subline: 'Your deliverables are ready.' },
  failed: {
    dot: null,
    headline: 'Did not finish',
    subline: 'Open the full report to see what happened.',
  },
  cancelled: { dot: null, headline: 'Cancelled', subline: 'This goal was stopped.' },
};

const FALLBACK = { dot: null, headline: 'Working on it', subline: 'This is taking a moment.' };

/**
 * Copy for one goal status.
 *
 * `unattended` selects the wording at the two approval gates: an unattended
 * goal is approving on the owner's behalf, a checkpoints goal is genuinely
 * waiting for them. Getting this backwards would tell someone to go and click
 * a button that nothing is waiting on, so the two strings are kept apart
 * rather than reworded at the call site.
 */
export function runStageCopy(status, { unattended = false } = {}) {
  const entry = STAGE_COPY[status] || FALLBACK;
  const subline = !unattended && entry.waitingSubline ? entry.waitingSubline : entry.subline;
  return { dot: entry.dot, headline: entry.headline, subline };
}

/** How many of the six dots are filled for this status. */
export function runDotIndex(status) {
  const entry = STAGE_COPY[status];
  return entry && Number.isInteger(entry.dot) ? entry.dot : 0;
}

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

/** True when the pipeline has stopped and only a person can move it forward. */
export function needsUserAction(status) {
  return BLOCKED_STATUSES.has(status);
}
