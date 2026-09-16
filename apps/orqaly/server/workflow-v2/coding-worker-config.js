import { codingSandboxFromEnvironment } from './coding-worker-remote.js';
import { createPostgresCodingStore } from './coding-worker-postgres.js';
import { createCodingN8nLauncher } from './coding-worker-n8n.js';
import { createCodingWorkerService } from './coding-worker-service.js';

const names = ['ORQALY_CODING_WORKER_URL', 'ORQALY_CODING_WORKER_IMAGE_SHA256', 'ORQALY_CODING_DISPATCH_SIGNING_KEY',
  'ORQALY_CODING_N8N_ENVIRONMENT_ID', 'ORQALY_PUBLIC_API_ORIGIN'];
export function codingWorkerConfiguredFromEnvironment(env = process.env) {
  const count = names.filter((name) => typeof env[name] === 'string' && env[name].length > 0).length;
  // PUBLIC_API_ORIGIN can serve unrelated capabilities when coding is disabled.
  if (!names.slice(0, 4).some((name) => env[name])) return false;
  if (count !== names.length) throw new Error('coding_worker_configuration_incomplete');
  return true;
}
export function codingWorkerFromEnvironment({ repository, runtime, env = process.env }) {
  if (!codingWorkerConfiguredFromEnvironment(env)) return null;
  const signingKey = Buffer.from(env.ORQALY_CODING_DISPATCH_SIGNING_KEY, 'base64');
  if (signingKey.length < 32 || signingKey.toString('base64') !== env.ORQALY_CODING_DISPATCH_SIGNING_KEY)
    throw new Error('coding_worker_signing_key_invalid');
  const sandbox = codingSandboxFromEnvironment(env); const store = createPostgresCodingStore(repository);
  const launcher = createCodingN8nLauncher({ runtime, store, environmentId: env.ORQALY_CODING_N8N_ENVIRONMENT_ID, origin: env.ORQALY_PUBLIC_API_ORIGIN });
  return createCodingWorkerService({ repository, store, sandbox, signingKey, launcher });
}
