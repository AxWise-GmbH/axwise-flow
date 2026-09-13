const defaultSleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function workflowState(workflow) {
  const runStatus = workflow?.run?.status || 'unknown';
  const activeStages = (workflow?.stages || [])
    .filter((stage) => ['queued', 'running', 'awaiting_approval'].includes(stage.status))
    .map((stage) => `${stage.kind}:${stage.status}`)
    .join(', ');
  return activeStages ? `${runStatus} (${activeStages})` : runStatus;
}

export async function processWorkerWithBoundedIdle({
  processOne,
  readWorkflow,
  label,
  timeoutMs = 1_500,
  pollIntervalMs = 20,
  now = () => Date.now(),
  sleep = defaultSleep,
}) {
  const startedAt = now();
  while (true) {
    const processed = await processOne();
    if (processed.status !== 'idle') return processed;

    const elapsedMs = now() - startedAt;
    if (elapsedMs >= timeoutMs) {
      const workflow = await readWorkflow();
      throw new Error(
        `${label} stalled after ${timeoutMs}ms at ${workflowState(workflow)}`
      );
    }
    await sleep(Math.min(pollIntervalMs, timeoutMs - elapsedMs));
  }
}
