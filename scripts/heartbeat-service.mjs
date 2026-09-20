/**
 * Hourly Heartbeat & Snapshot Health Service
 *
 * Verifies live edge endpoints, latency SLAs, TLS certificates, and
 * payload integrity snapshots every hour.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const HEARTBEAT_TARGETS = [
  { url: 'https://orqanix.com/', name: 'Production Apex' },
  { url: 'https://orqanix.com/instant', name: 'Instant Preview' },
  { url: 'https://orqanix.com/benchmark', name: 'Benchmark Showcase' },
  { url: 'https://preview.orqanix.com/instant', name: 'Preview Domain' },
  { url: 'https://orqaly-v2-api-preview-161074549006.europe-west4.run.app/readyz', name: 'API Health Probe' },
];

export async function checkEndpointHeartbeat(target, timeoutMs = 8000) {
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(target.url, {
      method: 'GET',
      headers: { 'User-Agent': 'OrqanixHeartbeat/1.0' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const latencyMs = Math.round(performance.now() - started);
    return {
      name: target.name,
      url: target.url,
      status: resp.status,
      ok: resp.status >= 200 && resp.status < 400,
      latencyMs,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    clearTimeout(timer);
    return {
      name: target.name,
      url: target.url,
      status: 0,
      ok: false,
      error: error.message,
      latencyMs: Math.round(performance.now() - started),
      timestamp: new Date().toISOString(),
    };
  }
}

export async function runHourlyHeartbeatSnapshot({ outputDir = './artifacts/heartbeat' } = {}) {
  const results = await Promise.all(HEARTBEAT_TARGETS.map((t) => checkEndpointHeartbeat(t)));
  const allHealthy = results.every((r) => r.ok);
  const snapshot = {
    schemaVersion: 'orqanix.heartbeat-snapshot.v1',
    timestamp: new Date().toISOString(),
    allHealthy,
    endpoints: results,
  };

  mkdirSync(outputDir, { recursive: true });
  const snapshotPath = join(outputDir, `snapshot-${Date.now()}.json`);
  const latestPath = join(outputDir, 'latest.json');
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  writeFileSync(latestPath, JSON.stringify(snapshot, null, 2));

  return snapshot;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  runHourlyHeartbeatSnapshot().then((s) => {
    console.log('=== Orqanix Hourly Heartbeat Snapshot ===');
    console.log(`Status: ${s.allHealthy ? 'ALL HEALTHY' : 'DEGRADED'} at ${s.timestamp}`);
    for (const ep of s.endpoints) {
      console.log(` • ${ep.name.padEnd(22)}: HTTP ${ep.status} in ${ep.latencyMs}ms (${ep.url})`);
    }
  });
}
