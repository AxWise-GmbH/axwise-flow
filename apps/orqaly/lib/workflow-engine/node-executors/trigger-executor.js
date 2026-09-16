/**
 * Trigger node executor — entry point of the workflow.
 * Passes through trigger data as output.
 */
export async function executeTrigger(config, inputData) {
  return {
    output: { ...inputData, _trigger: config.event || 'manual' },
    outputPort: 'out',
  };
}
