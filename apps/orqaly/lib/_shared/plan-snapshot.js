/**
 * Runtime fields may advance while a sealed plan is executing. Remove them
 * before comparing or approving plan semantics so normal lifecycle progress
 * cannot masquerade as a planning change.
 *
 * This module intentionally has no Node-only imports: the server and browser
 * use the same projection when deciding which materialized task rows are
 * current.
 */
const RUNTIME_PLAN_FIELDS = new Set([
  'status',
  'started_at',
  'completed_at',
  'updated_at',
  'created_at',
  'actual_cost',
  'actual_time',
  'duration_ms',
  'quality_score',
  'research_quality',
  'progress',
  'progress_percent',
  'feedback',
  'next_action',
  'evaluation',
  'result',
  'output',
]);

export function stripRuntimePlanState(value) {
  if (Array.isArray(value)) return value.map(stripRuntimePlanState);
  if (!value || typeof value !== 'object') return value;
  return Object.entries(value).reduce((result, [key, item]) => {
    if (!RUNTIME_PLAN_FIELDS.has(key) && item !== undefined) {
      result[key] = stripRuntimePlanState(item);
    }
    return result;
  }, {});
}
