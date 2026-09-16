import { TaskAdmissionRequestSchema } from './contracts.js';

const EXECUTOR_REQUIREMENTS = {
  reason: 'agent',
  retrieve: 'agent',
  produce_artifact: 'artifact',
  connector_read: 'connector',
  connector_write: 'connector',
  sandbox_work: 'sandbox',
  human_input: 'human',
  review: 'review',
  wait_or_monitor: 'scheduler',
  notify: 'notification',
};

export function evaluateTaskAdmission(rawRequest, capabilities) {
  const request = TaskAdmissionRequestSchema.parse(rawRequest);
  const missing = [];
  const requiredConnections = new Set();

  for (const step of request.requestedSteps) {
    const executor = EXECUTOR_REQUIREMENTS[step.stepKind];
    if (!capabilities.executors?.includes(executor)) {
      missing.push({ type: 'executor', key: executor, stepKind: step.stepKind });
    }
    if (step.descriptorKey && !capabilities.descriptors?.includes(step.descriptorKey)) {
      missing.push({ type: 'descriptor', key: step.descriptorKey, stepKind: step.stepKind });
    }
    if (step.connectionKey && !capabilities.connections?.includes(step.connectionKey)) {
      requiredConnections.add(step.connectionKey);
    }
  }

  for (const key of requiredConnections) {
    missing.push({ type: 'connection', key });
  }

  const unsafeUnsupported = request.requestedSteps.some(
    (step) =>
      ['connector_write', 'sandbox_work', 'notify'].includes(step.stepKind) &&
      missing.some((item) => item.stepKind === step.stepKind && item.type !== 'connection')
  );
  const connectionOnly = missing.length > 0 && missing.every((item) => item.type === 'connection');
  const status =
    missing.length === 0
      ? 'ready'
      : connectionOnly
        ? 'needs_customer_action'
        : unsafeUnsupported
          ? 'unsupported'
          : 'plan_only';

  return Object.freeze({
    version: 'orqaly_task_admission_result_v1',
    status,
    task: request.task,
    missing,
    executable: status === 'ready',
  });
}
