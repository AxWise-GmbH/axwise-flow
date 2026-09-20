/** A dated HTTP health snapshot from one runner. No model workloads or history are inferred. */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const HEARTBEAT_TARGETS = [
  { url: 'https://orqanix.com/', name: 'Public Preview' },
  { url: 'https://orqanix.com/instant', name: 'Instant Preview' },
  { url: 'https://orqanix.com/benchmark', name: 'Architecture Showcase' },
  { url: 'https://preview.orqanix.com/instant', name: 'Preview Domain' },
  { url: 'https://orqaly-v2-api-preview-161074549006.europe-west4.run.app/readyz', name: 'Preview API Readiness' },
];

export async function checkEndpointHeartbeat(target, timeoutMs = 8000, fetchImpl = fetch) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(target.url, {
      method: 'GET',
      headers: { 'User-Agent': 'OrqanixHeartbeat/2.0' },
      signal: controller.signal,
    });
    const latencyMs = Math.round(performance.now() - started);
    // Measure response headers, not download/render time. Release the unused body.
    await response.body?.cancel();
    return {
      ...target,
      status: response.status,
      ok: response.status >= 200 && response.status < 400,
      latencyMs,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ...target,
      status: 0,
      ok: false,
      error: controller.signal.aborted ? 'Request timed out' : 'Request failed',
      latencyMs: Math.round(performance.now() - started),
      timestamp: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runHeartbeatSnapshot({
  outputDir = './artifacts/heartbeat',
  targets = HEARTBEAT_TARGETS,
  timeoutMs = 8000,
  fetchImpl = fetch,
} = {}) {
  const endpoints = await Promise.all(
    targets.map((target) => checkEndpointHeartbeat(target, timeoutMs, fetchImpl)),
  );
  const snapshot = {
    schemaVersion: 'orqanix.heartbeat-snapshot.v6',
    kind: 'endpoint-health-snapshot',
    environment: 'public-preview',
    scope: 'HTTP response headers measured from a single runner; public and preview domains share the preview deployment.',
    publication: 'Scheduled runs are archived in GitHub Actions. This website snapshot changes only when its assets are deployed.',
    timestamp: new Date().toISOString(),
    staleAfterSeconds: 1800,
    expectedEndpointCount: targets.length,
    allHealthy: endpoints.length > 0 && endpoints.every((endpoint) => endpoint.ok),
    endpoints,
  };
  mkdirSync(outputDir, { recursive: true });
  const contents = JSON.stringify(snapshot, null, 2) + '\n';
  writeFileSync(join(outputDir, `snapshot-${Date.now()}.json`), contents);
  writeFileSync(join(outputDir, 'latest.json'), contents);
  return snapshot;
}

export function heartbeatExitCode(snapshot) {
  return snapshot.allHealthy === true && snapshot.endpoints.length > 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runHeartbeatSnapshot().then((snapshot) => {
    console.log(`Endpoint health snapshot: ${snapshot.allHealthy ? 'HEALTHY AT OBSERVATION' : 'DEGRADED'} at ${snapshot.timestamp}`);
    for (const endpoint of snapshot.endpoints) {
      console.log(`${endpoint.name}: ${endpoint.status || endpoint.error} (${endpoint.latencyMs} ms ${endpoint.status ? 'to response headers' : 'until failure'})`);
    }
    console.log('Archived locally in artifacts/heartbeat; no website deployment was performed.');
    process.exitCode = heartbeatExitCode(snapshot);
  }).catch((error) => {
    console.error('Could not generate endpoint health snapshot:', error.message);
    process.exitCode = 1;
  });
}
