export const WORKFLOW_ACTIVITY_STAGE_KINDS = Object.freeze([
  'compile_scope',
  'execute_research',
  'planning',
  'execution',
  'evaluation',
  'synthesis',
]);

export const WORKFLOW_REMOTE_STAGE_KINDS = Object.freeze([
  'compile_scope',
  'execute_research',
  'execution',
  'evaluation',
  'synthesis',
]);

const activity = WORKFLOW_ACTIVITY_STAGE_KINDS;
const remote = WORKFLOW_REMOTE_STAGE_KINDS;

function cell(id, eventType, eligible) {
  return Object.freeze({ id, eventType, eligible: Object.freeze(eligible) });
}

// This is the machine-readable companion to docs/workflow-v2/TRANSITION_TABLE.md.
// Each row is one event x eligible-state decision cell. The transition handlers
// remain the only code that computes mutations and successors.
export const WORKFLOW_TRANSITION_CELLS = Object.freeze([
  cell('run-requested', 'RunRequested', {
    runStatuses: ['requested'], stageKinds: [], stageStatuses: [], attemptStatuses: [],
  }),
  cell('capability-run-requested', 'CapabilityRunRequested', {
    runStatuses: ['requested'], stageKinds: [], stageStatuses: [], attemptStatuses: [],
    profile: 'capability_work_v1', authority: 'explicit_owner_command', defaultEnabled: false,
  }),
  cell('capability-scope-approved', 'CapabilityScopeApproved', {
    runStatuses: ['awaiting_gate_1'], stageKinds: ['gate_1'], stageStatuses: ['awaiting_approval'], attemptStatuses: [],
    profile: 'capability_work_v1', authority: 'explicit_owner_command', defaultEnabled: false,
  }),
  cell('capability-activity-requested', 'CapabilityActivityRequested', {
    runStatuses: ['awaiting_capability_input', 'completed', 'failed'], stageKinds: [], stageStatuses: [], attemptStatuses: [],
    profile: 'capability_work_v1', authority: 'explicit_owner_command', defaultEnabled: false,
  }),
  cell('scope-revision-requested', 'ScopeRevisionRequested', {
    runStatuses: ['awaiting_gate_1'], stageKinds: ['compile_scope', 'gate_1', 'execute_research'],
    stageStatuses: ['completed', 'awaiting_approval', 'pending'], attemptStatuses: [],
  }),
  cell('activity-started', 'ActivityStarted', {
    runStatuses: ['running'], stageKinds: activity, stageStatuses: ['queued'],
    attemptStatuses: ['queued'],
  }),
  cell('activity-deferred', 'ActivityDeferred', {
    runStatuses: ['running'], stageKinds: remote, stageStatuses: ['running', 'polling'],
    attemptStatuses: ['running', 'polling'],
  }),
  cell('activity-dispatch-ambiguous', 'ActivityDispatchAmbiguous', {
    runStatuses: ['running'], stageKinds: remote, stageStatuses: ['running', 'polling'],
    attemptStatuses: ['running', 'polling'],
  }),
  cell('activity-redispatch-requested', 'ActivityRedispatchRequested', {
    runStatuses: ['running'], stageKinds: remote, stageStatuses: ['running', 'polling'],
    attemptStatuses: ['running', 'polling'],
  }),
  cell('activity-completed-compile', 'ActivityCompleted', {
    runStatuses: ['running'], stageKinds: ['compile_scope'],
    stageStatuses: ['running', 'polling'], attemptStatuses: ['running', 'polling'],
  }),
  cell('activity-completed-research-ready', 'ActivityCompleted', {
    runStatuses: ['running'], stageKinds: ['execute_research'],
    stageStatuses: ['running', 'polling'], attemptStatuses: ['running', 'polling'],
    branch: 'ready',
  }),
  cell('activity-completed-research-gaps', 'ActivityCompleted', {
    runStatuses: ['running'], stageKinds: ['execute_research'],
    stageStatuses: ['running', 'polling'], attemptStatuses: ['running', 'polling'],
    branch: 'ready_with_gaps',
  }),
  cell('activity-completed-research-blocked', 'ActivityCompleted', {
    runStatuses: ['running'], stageKinds: ['execute_research'],
    stageStatuses: ['running', 'polling'], attemptStatuses: ['running', 'polling'],
    branch: 'blocked_report',
  }),
  cell('activity-completed-planning', 'ActivityCompleted', {
    runStatuses: ['running'], stageKinds: ['planning'],
    stageStatuses: ['running', 'polling'], attemptStatuses: ['running', 'polling'],
  }),
  cell('activity-completed-execution-successors', 'ActivityCompleted', {
    runStatuses: ['running'], stageKinds: ['execution'],
    stageStatuses: ['running', 'polling'], attemptStatuses: ['running', 'polling'],
    branch: 'execution_successors_remain',
  }),
  cell('activity-completed-execution-evaluation', 'ActivityCompleted', {
    runStatuses: ['running'], stageKinds: ['execution'],
    stageStatuses: ['running', 'polling'], attemptStatuses: ['running', 'polling'],
    branch: 'last_execution_stage',
  }),
  cell('activity-completed-evaluation-promote', 'ActivityCompleted', {
    runStatuses: ['running'], stageKinds: ['evaluation'],
    stageStatuses: ['running', 'polling'], attemptStatuses: ['running', 'polling'],
    branch: 'output_contract_satisfied',
  }),
  cell('activity-completed-evaluation-synthesize', 'ActivityCompleted', {
    runStatuses: ['running'], stageKinds: ['evaluation'],
    stageStatuses: ['running', 'polling'], attemptStatuses: ['running', 'polling'],
    branch: 'output_contract_unsatisfied',
  }),
  cell('activity-completed-synthesis', 'ActivityCompleted', {
    runStatuses: ['running'], stageKinds: ['synthesis'],
    stageStatuses: ['running', 'polling'], attemptStatuses: ['running', 'polling'],
  }),
  cell('activity-failed-retry', 'ActivityFailed', {
    runStatuses: ['running'], stageKinds: activity,
    stageStatuses: ['running', 'polling'], attemptStatuses: ['running', 'polling'],
    branch: 'retryable_below_limit',
  }),
  cell('activity-failed-terminal', 'ActivityFailed', {
    runStatuses: ['running'], stageKinds: activity,
    stageStatuses: ['running', 'polling'], attemptStatuses: ['running', 'polling'],
    branch: 'nonretryable_or_limit_reached',
  }),
  cell('lease-expired-running', 'LeaseExpired', {
    runStatuses: ['running'], stageKinds: activity, stageStatuses: ['running'],
    attemptStatuses: ['running'],
  }),
  cell('lease-expired-polling', 'LeaseExpired', {
    runStatuses: ['running'], stageKinds: activity, stageStatuses: ['polling'],
    attemptStatuses: ['polling'],
  }),
  cell('approval-granted-duplicate', 'ApprovalGranted', {
    runStatuses: ['*'], stageKinds: ['*'], stageStatuses: ['*'], attemptStatuses: [],
    branch: 'exact_idempotent_duplicate',
  }),
  cell('approval-granted-scope', 'ApprovalGranted', {
    runStatuses: ['awaiting_gate_1'], stageKinds: ['gate_1'],
    stageStatuses: ['awaiting_approval'], attemptStatuses: [], branch: 'scope',
  }),
  cell('approval-granted-plan', 'ApprovalGranted', {
    runStatuses: ['awaiting_gate_2'], stageKinds: ['gate_2'],
    stageStatuses: ['awaiting_approval'], attemptStatuses: [], branch: 'plan',
  }),
]);
