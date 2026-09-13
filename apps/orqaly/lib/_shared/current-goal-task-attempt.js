import { hasNativeAxwiseScopeMarkers } from './native-scope-approval.js';
import { stripRuntimePlanState } from './plan-snapshot.js';

const RETIRED_TASK_STATUSES = new Set(['cancelled', 'canceled', 'superseded']);
export const CURRENT_TASK_PROVENANCE_COLUMNS_MISSING = 'CURRENT_TASK_PROVENANCE_COLUMNS_MISSING';

function scopeToken(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalJson(value[key])])
  );
}

function sameJson(left, right) {
  return JSON.stringify(canonicalJson(left)) === JSON.stringify(canonicalJson(right));
}

export function isRetiredGoalTask(task) {
  return RETIRED_TASK_STATUSES.has(
    String(task?.status || '')
      .trim()
      .toLowerCase()
  );
}

export function activeGoalTasks(tasks = []) {
  return (Array.isArray(tasks) ? tasks : []).filter((task) => !isRetiredGoalTask(task));
}

/**
 * Resolve the one materialized work attempt visible to task consumers.
 *
 * Native rows fail closed unless the accepted scope, planning seal, formation
 * aliases, work marker, and (when present) research pointer all describe the
 * same immutable attempt. This is intentionally a pure projection used by
 * both the server and browser so execution and UI cannot disagree about which
 * historical rows are current.
 */
function currentWorkMaterializationAttempt(goal) {
  const data = goal?.data || {};
  const work = data.team_work_materialization;
  const native = hasNativeAxwiseScopeMarkers(goal);
  if (work === undefined || work === null) {
    return { present: false, native, formationAttempt: null, workAttempt: null };
  }

  const formation = data.team_formation_attempt;
  const formationAttempt = scopeToken(work?.formation_attempt);
  const researchAttempt = scopeToken(work?.research_attempt_key);
  const researchRunId = scopeToken(work?.research_run_id);
  const workAttempt = researchAttempt || formationAttempt;
  let valid =
    work?.version === 'orqaly_team_work_materialization_v1' &&
    Boolean(formationAttempt) &&
    Boolean(workAttempt) &&
    formation?.version === 'orqaly_team_formation_attempt_v1' &&
    formation?.status === 'completed' &&
    scopeToken(formation?.attempt_id) === formationAttempt;

  if (researchAttempt || researchRunId) {
    const research = data.research_materialization;
    const pointer = data.axwise_customer_intelligence?.research_bundle;
    valid =
      valid &&
      Boolean(researchAttempt) &&
      Boolean(researchRunId) &&
      scopeToken(research?.attempt_key) === researchAttempt &&
      scopeToken(research?.research_run_id) === researchRunId &&
      scopeToken(pointer?.run_id) === researchRunId;
  }

  if (native) {
    const packetScope = scopeToken(data.axwise_customer_intelligence?.scope_packet?.scope_hash);
    const admission = data.scope_admission;
    const planning = data.native_planning_attempt;
    const nativeFormation = data.native_team_formation_attempt;
    valid =
      valid &&
      Boolean(packetScope) &&
      admission?.native_scope === true &&
      admission?.status === 'accepted' &&
      scopeToken(admission?.scope_hash) === packetScope &&
      planning?.version === 'orqaly_native_planning_attempt_v1' &&
      planning?.status === 'completed' &&
      Boolean(scopeToken(planning?.attempt_id)) &&
      scopeToken(planning?.scope_hash) === packetScope &&
      /^[0-9a-f]{64}$/.test(scopeToken(planning?.plan_hash)) &&
      planning?.plan_snapshot &&
      typeof planning.plan_snapshot === 'object' &&
      !Array.isArray(planning.plan_snapshot) &&
      sameJson(stripRuntimePlanState(goal?.plan), stripRuntimePlanState(planning.plan_snapshot)) &&
      formation?.planning_attempt_id === planning?.attempt_id &&
      formation?.plan_hash === planning?.plan_hash &&
      nativeFormation?.version === 'orqaly_team_formation_attempt_v1' &&
      nativeFormation?.status === 'completed' &&
      scopeToken(nativeFormation?.scope_hash) === packetScope &&
      sameJson(nativeFormation, formation) &&
      scopeToken(work?.native_scope_hash) === packetScope;
  }

  return {
    present: true,
    native,
    formationAttempt: valid ? formationAttempt : null,
    workAttempt: valid ? workAttempt : null,
  };
}

/**
 * Return only task rows belonging to the goal's exact current work attempt.
 * Historical rows remain persisted for audit but never influence execution,
 * evaluation, reporting, or the browser once a strict boundary exists.
 */
export function currentGoalTaskAttempt(goal, tasks = []) {
  const activeRows = activeGoalTasks(tasks);
  const materialization = currentWorkMaterializationAttempt(goal);
  if (
    materialization.workAttempt &&
    activeRows.some(
      (task) =>
        !Object.prototype.hasOwnProperty.call(task || {}, 'materialization_attempt') ||
        !Object.prototype.hasOwnProperty.call(task || {}, 'data')
    )
  ) {
    const error = new Error(
      'Current task selection requires team_tasks.materialization_attempt and data'
    );
    error.code = CURRENT_TASK_PROVENANCE_COLUMNS_MISSING;
    throw error;
  }
  const materializedRows = !materialization.present
    ? materialization.native
      ? []
      : activeRows
    : materialization.workAttempt
      ? activeRows.filter((task) => {
          const topLevelAttempt = scopeToken(task?.materialization_attempt);
          const dataAttempt = scopeToken(task?.data?.materialization_attempt);
          return (
            topLevelAttempt === materialization.formationAttempt &&
            dataAttempt === materialization.workAttempt
          );
        })
      : [];

  const retryCount = Number(goal?.data?.retry_count || 0);
  const retryTaggedRows = materializedRows.filter(
    (task) => task?.data?.goal_retry_count !== undefined && task?.data?.goal_retry_count !== null
  );
  const retryBoundary = goal?.data?.goal_task_attempt;
  const hasStrictRetryBoundary =
    Number(retryBoundary?.version) === 1 && Number(retryBoundary?.retry_count) === retryCount;
  const attemptRows =
    retryCount > 0 && (hasStrictRetryBoundary || retryTaggedRows.length)
      ? retryTaggedRows.filter((task) => Number(task.data.goal_retry_count) === retryCount)
      : materializedRows;

  const authorization = goal?.data?.execution_authorization;
  const executionApproval = goal?.data?.goal_approvals?.execution;
  const authorizationHash = scopeToken(authorization?.snapshot_hash);
  const approvalHash = scopeToken(executionApproval?.snapshot_hash);
  const hasCurrentApprovedAuthorization =
    authorization?.manifest?.valid === true &&
    authorization?.status === 'approved' &&
    executionApproval?.status === 'approved' &&
    Boolean(authorizationHash) &&
    authorizationHash === approvalHash;
  const authorizedTasks = hasCurrentApprovedAuthorization
    ? authorization?.manifest?.tasks
    : undefined;

  if (Array.isArray(authorizedTasks)) {
    const authorizedIds = new Set(
      authorizedTasks.map((task) => scopeToken(task?.task_id)).filter(Boolean)
    );
    return attemptRows.filter((task) => authorizedIds.has(scopeToken(task?.id)));
  }

  const orchestration = goal?.data?.axwise_orchestration;
  const decisionId = orchestration?.decision_id;
  const orchestrationRetryCount = Number(orchestration?.retry_count);
  const orchestrationCreatedAt = Date.parse(orchestration?.created_at || '');
  const retryStartedAt = Date.parse(retryBoundary?.started_at || '');
  const decisionBelongsToAttempt =
    retryCount === 0 ||
    !hasStrictRetryBoundary ||
    orchestrationRetryCount === retryCount ||
    (Number.isFinite(orchestrationCreatedAt) &&
      Number.isFinite(retryStartedAt) &&
      orchestrationCreatedAt >= retryStartedAt);

  if (decisionId && decisionBelongsToAttempt) {
    return attemptRows.filter((task) => {
      const taskDecision =
        task.data?.axwise_decision_id || task.data?.axwise_execution_context?.decision_id;
      return scopeToken(taskDecision) === scopeToken(decisionId);
    });
  }

  return attemptRows;
}
