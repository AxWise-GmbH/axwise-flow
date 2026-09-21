import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkEndpointHeartbeat, runHeartbeatSnapshot, heartbeatExitCode } from './heartbeat-service.mjs';

const target = { name: 'Fixture endpoint', url: 'https://fixture.invalid/readyz' };

test('snapshot contains only actual HTTP probes and never creates historical workload samples', async (t) => {
  const outputDir = mkdtempSync(join(tmpdir(), 'orqanix-heartbeat-'));
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));
  const calls = [];
  const snapshot = await runHeartbeatSnapshot({
    outputDir,
    targets: [target],
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response('ready', { status: 200 });
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, target.url);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(snapshot.endpoints[0].status, 200);
  assert.equal(snapshot.endpoints[0].ok, true);
  assert.ok(Number.isFinite(snapshot.endpoints[0].latencyMs));
  assert.equal(snapshot.expectedEndpointCount, 1);
  assert.equal(heartbeatExitCode(snapshot), 0);
  assert.equal('archetypeBenchmarks' in snapshot, false);
  assert.equal('history' in snapshot, false);
  const files = readdirSync(outputDir);
  assert.equal(files.length, 2);
  assert.ok(files.every((file) => file === 'latest.json' || /^snapshot-\d+\.json$/.test(file)));
  assert.deepEqual(JSON.parse(readFileSync(join(outputDir, 'latest.json'), 'utf8')), snapshot);
});

test('HTTP failure is archived and produces a failing process outcome', async (t) => {
  const outputDir = mkdtempSync(join(tmpdir(), 'orqanix-heartbeat-'));
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));
  const snapshot = await runHeartbeatSnapshot({ outputDir, targets: [target], fetchImpl: async () => new Response('unavailable', { status: 503 }) });
  assert.equal(snapshot.allHealthy, false);
  assert.equal(snapshot.endpoints[0].status, 503);
  assert.equal(heartbeatExitCode(snapshot), 1);
  assert.equal(JSON.parse(readFileSync(join(outputDir, 'latest.json'), 'utf8')).allHealthy, false);
  assert.equal(heartbeatExitCode({ allHealthy: true, endpoints: [] }), 1);
});

test('CLI exits unsuccessfully while preserving the failed snapshot artifact', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'orqanix-heartbeat-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const mockFetch = 'globalThis.fetch = async () => new Response("fixture failure", { status: 503 });';
  const result = spawnSync(process.execPath, [
    '--import', 'data:text/javascript,' + encodeURIComponent(mockFetch),
    fileURLToPath(new URL('./heartbeat-service.mjs', import.meta.url)),
  ], { cwd: directory, encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /DEGRADED/);
  const archived = JSON.parse(readFileSync(join(directory, 'artifacts/heartbeat/latest.json'), 'utf8'));
  assert.equal(archived.allHealthy, false);
  assert.equal(archived.endpoints.length, 5);
  assert.ok(archived.endpoints.every((endpoint) => endpoint.status === 503));
});

test('network errors and aborted probes are failed observations without leaking error details', async () => {
  const failed = await checkEndpointHeartbeat(target, 100, async () => { throw new Error('private transport details'); });
  assert.equal(failed.ok, false);
  assert.equal(failed.error, 'Request failed');
  assert.equal(JSON.stringify(failed).includes('private transport details'), false);
  const timedOut = await checkEndpointHeartbeat(target, 5, async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  assert.equal(timedOut.ok, false);
  assert.equal(timedOut.error, 'Request timed out');
});

function observation(overrides = {}) {
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: 'orqanix.heartbeat-snapshot.v6', kind: 'endpoint-health-snapshot',
    timestamp, allHealthy: true, expectedEndpointCount: 1,
    endpoints: [{ ...target, timestamp, status: 200, ok: true, latencyMs: 42 }],
    ...overrides,
  };
}

async function renderSnapshot(data, { fetchFails = false, file = 'apps/orqaly/public/heartbeat-telemetry.js' } = {}) {
  const elements = Object.fromEntries(['grid', 'badge', 'timestamp', 'avg'].map((key) => [`heartbeat-${key}`, { textContent: '', innerHTML: '', dataset: {} }]));
  let refresh;
  let fail = fetchFails;
  vm.runInNewContext(readFileSync(file, 'utf8'), {
    document: { getElementById: (id) => elements[id] }, Date, AbortSignal,
    fetch: async () => {
      if (fail) throw new Error('network unavailable');
      return { ok: true, json: async () => data };
    },
    setInterval: (callback) => { refresh = callback; },
  });
  await new Promise(setImmediate);
  return { elements, failRefresh: async () => { fail = true; await refresh(); } };
}

for (const file of ['apps/orqaly/public/heartbeat-telemetry.js', 'apps/orqaly/public-gcp/heartbeat-telemetry.js']) {
  test(`${file}: actual fresh observation shows a full UTC timestamp and scoped latency`, async () => {
    const data = observation();
    const { elements, failRefresh } = await renderSnapshot(data, { file });
    assert.equal(elements['heartbeat-badge'].dataset.state, 'healthy');
    assert.match(elements['heartbeat-timestamp'].textContent, /Observed \d{4}-\d{2}-\d{2}T.*Z/);
    assert.match(elements['heartbeat-avg'].textContent, /Mean time to headers: 42 ms/);
    assert.doesNotMatch(elements['heartbeat-avg'].textContent, /Global/);
    await failRefresh();
    assert.equal(elements['heartbeat-badge'].dataset.state, 'unavailable');
    assert.equal(elements['heartbeat-avg'].textContent, '');
  });

  test(`${file}: stale observations lose all green health states`, async () => {
    const { elements } = await renderSnapshot(observation({ timestamp: new Date(Date.now() - 31 * 60 * 1000).toISOString() }), { file });
    assert.equal(elements['heartbeat-badge'].dataset.state, 'stale');
    assert.match(elements['heartbeat-grid'].innerHTML, /data-state="stale"/);
    assert.doesNotMatch(elements['heartbeat-grid'].innerHTML, /data-state="healthy"/);
  });

  test(`${file}: failed status overrides a claimed healthy snapshot`, async () => {
    const data = observation();
    data.endpoints[0].status = 503;
    data.endpoints[0].ok = false;
    const { elements } = await renderSnapshot(data, { file });
    assert.equal(elements['heartbeat-badge'].dataset.state, 'degraded');
    assert.match(elements['heartbeat-grid'].innerHTML, /HTTP 503 · FAILED/);
    assert.doesNotMatch(elements['heartbeat-grid'].innerHTML, /503 OK/);
    assert.match(elements['heartbeat-avg'].textContent, /No successful/);
  });

  test(`${file}: missing, legacy, partial, malformed and future data cannot claim health`, async () => {
    for (const data of [null, {}, observation({ endpoints: [] }), observation({ expectedEndpointCount: 2 }),
      observation({ schemaVersion: 'orqanix.heartbeat-snapshot.v5' }), observation({ timestamp: 'bad-date' }),
      observation({ timestamp: new Date(Date.now() + 3600000).toISOString() }),
      observation({ endpoints: [{ ...target, ok: true, status: 200, latencyMs: -1 }] })]) {
      const { elements } = await renderSnapshot(data, { file });
      assert.equal(elements['heartbeat-badge'].dataset.state, 'unavailable');
    }
  });
}
