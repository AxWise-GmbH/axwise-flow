export function capabilityWorkEnabledFromEnvironment(environment = process.env) {
  const value = environment.ORQALY_CAPABILITY_WORK_ENABLED;
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  throw new Error('ORQALY_CAPABILITY_WORK_ENABLED must be true or false');
}
