import { GoogleAuth } from 'google-auth-library';
import { CodingWorkerError, codingHash } from './coding-worker-contracts.js';
import { cloudRunCodingDescriptor } from './coding-worker-cloud-run.js';

export function createRemoteCloudRunCodingSandbox({ origin, image, fetchImpl = fetch, getIdentityHeaders } = {}) {
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:' || parsed.origin !== origin || !/\.run\.app$/.test(parsed.hostname))
    throw new CodingWorkerError('CODING_WORKER_ORIGIN_INVALID', 503);
  const descriptor = cloudRunCodingDescriptor(image); const auth = new GoogleAuth();
  async function request(path, scope, job) {
    if (codingHash(job.spec.runtime) !== codingHash(descriptor)) throw new CodingWorkerError('CODING_RUNTIME_BINDING_CHANGED');
    const headers = new Headers(getIdentityHeaders ? await getIdentityHeaders(origin) : await (await auth.getIdTokenClient(origin)).getRequestHeaders());
    headers.set('Content-Type', 'application/json');
    const response = await fetchImpl(`${origin}${path}`, { method: 'POST', headers, redirect: 'error',
      signal: AbortSignal.timeout(job.spec.limits.timeoutMs + 90000), body: JSON.stringify({ scope, job }) });
    let bytes = 0; const chunks = [];
    for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 640000) throw new CodingWorkerError('CODING_WORKER_RESPONSE_BUDGET'); chunks.push(Buffer.from(chunk)); }
    if (!response.ok) throw new CodingWorkerError('CODING_WORKER_REQUEST_FAILED', 503);
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new CodingWorkerError('CODING_WORKER_RESPONSE_INVALID', 503); }
  }
  return { descriptor, run: (scope, job) => request('/v1/execute', scope, job), reconcile: (scope, job) => request('/v1/reconcile', scope, job) };
}

export function codingSandboxFromEnvironment(environment = process.env) {
  if (!environment.ORQALY_CODING_WORKER_URL && !environment.ORQALY_CODING_WORKER_IMAGE_SHA256) return null;
  if (!environment.ORQALY_CODING_WORKER_URL || !environment.ORQALY_CODING_WORKER_IMAGE_SHA256)
    throw new Error('Both coding worker URL and immutable image digest are required');
  return createRemoteCloudRunCodingSandbox({ origin: environment.ORQALY_CODING_WORKER_URL, image: environment.ORQALY_CODING_WORKER_IMAGE_SHA256 });
}
