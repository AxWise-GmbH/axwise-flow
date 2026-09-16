import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  N8nOperationsClient,
  N8nOperationsError,
  loadN8nWorkflowAllowlist,
} from '../../services/agentic-control-plane/src/executors/n8n-operations-client.js';

const manifestPath = fileURLToPath(new URL('./executor-bindings.json', import.meta.url));

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new N8nOperationsError(`${name.toLowerCase()}_missing`);
  return value;
}

function integerEnvironment(name, fallback, minimum, maximum) {
  const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new N8nOperationsError(`${name.toLowerCase()}_invalid`);
  }
  return value;
}

async function bootstrap() {
  const command = process.argv[2] ?? 'reconcile';
  if (!['reconcile', 'status'].includes(command)) {
    throw new N8nOperationsError('n8n_bootstrap_command_invalid');
  }

  const workflowAllowlist = await loadN8nWorkflowAllowlist(manifestPath);
  const client = new N8nOperationsClient({
    apiBaseUrl: requiredEnvironment('N8N_API_BASE_URL'),
    apiKey: requiredEnvironment('N8N_API_KEY'),
    workflowAllowlist,
    allowInsecureHttp: process.env.N8N_ALLOW_INSECURE_HTTP === 'true',
    timeoutMs: integerEnvironment('N8N_BOOTSTRAP_TIMEOUT_MS', 10_000, 100, 60_000),
    maximumRequestBytes: integerEnvironment(
      'N8N_BOOTSTRAP_MAXIMUM_REQUEST_BYTES',
      1_048_576,
      1_024,
      4_194_304
    ),
    maximumResponseBytes: integerEnvironment(
      'N8N_BOOTSTRAP_MAXIMUM_RESPONSE_BYTES',
      524_288,
      1_024,
      4_194_304
    ),
  });

  if (command === 'status') {
    const workflows = await client.getAllWorkflowReadiness();
    const ready = workflows.length > 0 && workflows.every((workflow) => workflow.ready);
    process.stdout.write(
      `${JSON.stringify({
        status: ready ? 'ready' : 'not_ready',
        manifestHash: workflowAllowlist.manifestHash,
        workflows,
      })}\n`
    );
    if (!ready) process.exitCode = 1;
    return;
  }

  const maximumAttempts = integerEnvironment('N8N_BOOTSTRAP_MAXIMUM_ATTEMPTS', 30, 1, 120);
  const retryDelayMs = integerEnvironment('N8N_BOOTSTRAP_RETRY_DELAY_MS', 2_000, 100, 10_000);
  let lastError;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      const workflows = await client.ensureAllWorkflowsPublished();
      process.stdout.write(
        `${JSON.stringify({
          status: 'ready',
          manifestHash: workflowAllowlist.manifestHash,
          workflows,
        })}\n`
      );
      return;
    } catch (error) {
      lastError = error;
      if (
        !(error instanceof N8nOperationsError) ||
        !error.retryable ||
        attempt === maximumAttempts
      ) {
        throw error;
      }
      await delay(retryDelayMs);
    }
  }
  throw lastError;
}

try {
  await bootstrap();
} catch (error) {
  const known = error instanceof N8nOperationsError;
  // Never print the request, response body, environment or API key. The code,
  // status and retryability are sufficient for an operator to classify failure.
  process.stderr.write(
    `${JSON.stringify({
      status: 'error',
      code: known ? error.code : 'n8n_bootstrap_failed',
      providerStatus: known ? (error.status ?? null) : null,
      retryable: known ? error.retryable : false,
    })}\n`
  );
  process.exitCode = 1;
}
