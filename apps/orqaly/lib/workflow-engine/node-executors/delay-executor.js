/**
 * Delay node executor — waits for a specified number of milliseconds.
 * In serverless context, this is a simple setTimeout-based delay.
 * For long delays, this should be replaced with a scheduled job pattern.
 */

const MAX_DELAY_MS = 5000; // Cap at 5s in serverless to respect function limits

/**
 * @param {object} config - { ms: number }
 * @param {object} inputData - Data from upstream nodes
 */
export async function executeDelay(config, inputData) {
  const requestedMs = Number(config.ms) || 0;
  const actualMs = Math.min(Math.max(requestedMs, 0), MAX_DELAY_MS);

  if (actualMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, actualMs));
  }

  return {
    output: { ...inputData, _delayed: actualMs },
    outputPort: 'out',
  };
}
