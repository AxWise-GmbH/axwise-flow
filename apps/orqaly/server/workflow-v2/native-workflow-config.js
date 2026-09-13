// Deliberately off on every existing deployment unless explicitly configured.
// Unknown values are configuration errors, never truthy feature enablement.
export function nativeWorkflowBuilderEnabledFromEnvironment(environment = process.env) {
  const value = environment.ORQALY_NATIVE_WORKFLOW_BUILDER_ENABLED;
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error('ORQALY_NATIVE_WORKFLOW_BUILDER_ENABLED must be true or false');
}

export function solutionSchedulesEnabledFromEnvironment(environment = process.env) {
  const value = environment.ORQALY_SOLUTION_SCHEDULES_ENABLED;
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error('ORQALY_SOLUTION_SCHEDULES_ENABLED must be true or false');
}

export function solutionScheduleEnvironmentIdsFromEnvironment(environment = process.env) {
  const enabled = solutionSchedulesEnabledFromEnvironment(environment);
  const value = environment.ORQALY_SOLUTION_SCHEDULE_ENVIRONMENTS;
  if (value === undefined || value === '') {
    if (!enabled) return [];
    throw new Error('ORQALY_SOLUTION_SCHEDULE_ENVIRONMENTS is required when schedules are enabled');
  }
  let ids;
  try {
    if (typeof value !== 'string' || value.length > 8192) throw new Error();
    ids = JSON.parse(value);
  } catch {
    throw new Error(
      'ORQALY_SOLUTION_SCHEDULE_ENVIRONMENTS must be a bounded JSON array of runtime IDs'
    );
  }
  if (
    !Array.isArray(ids) ||
    ids.length > 100 ||
    ids.some((id) => typeof id !== 'string' || !/^[a-z0-9-]{8,63}$/.test(id)) ||
    new Set(ids).size !== ids.length
  )
    throw new Error('ORQALY_SOLUTION_SCHEDULE_ENVIRONMENTS must contain unique valid runtime IDs');
  return ids;
}
