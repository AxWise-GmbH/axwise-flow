import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishHeartbeatSnapshot, runPublishedHeartbeat } from './heartbeat-publish.mjs';

const bucket = 'fixture-public-heartbeat';
const snapshot = { timestamp: new Date().toISOString(), allHealthy: true, endpoints: [] };
const observedAt = (offsetMs) => new Date(Date.parse(snapshot.timestamp) + offsetMs).toISOString();
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const identity = () => json({ access_token: 'fixture-token' });

function multipart(options) {
  const boundary = options.headers['Content-Type'].split('boundary=')[1];
  const parts = options.body.split(`--${boundary}`).slice(1, 3);
  const parsed = parts.map((part) => JSON.parse(part.split('\r\n\r\n')[1].trim()));
  // GCS rejects uploads unless the media part's MIME type exactly matches metadata.
  const mediaType = parts[1].split('\r\n\r\n')[0].trim().replace(/^Content-Type: /, '');
  assert.equal(mediaType, parsed[0].contentType);
  return parsed;
}

test('a degraded run atomically publishes its real failed observation before returning failure', async (t) => {
  const outputDir = mkdtempSync(join(tmpdir(), 'heartbeat-publish-'));
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));
  let uploaded;
  const result = await runPublishedHeartbeat({
    bucket, outputDir, targets: [{ name: 'Readiness', url: 'https://fixture.invalid/readyz' }],
    fetchImpl: async (url, options) => {
      if (url === 'https://fixture.invalid/readyz') {
        assert.equal(options.headers.Authorization, undefined);
        return new Response('failed', { status: 503 });
      }
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      if (url.startsWith('http://metadata.google.internal/')) {
        assert.equal(options.headers['Metadata-Flavor'], 'Google');
        return identity();
      }
      assert.equal(new URL(url).hostname, 'storage.googleapis.com');
      assert.equal(options.headers.Authorization, 'Bearer fixture-token');
      if (options.method !== 'POST') return json({}, 404);
      assert.equal(new URL(url).searchParams.get('ifGenerationMatch'), '0');
      uploaded = multipart(options);
      return json({ generation: '123' });
    },
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.publication.published, true);
  assert.equal(uploaded[0].name, 'latest.json');
  assert.match(uploaded[0].contentType, /^application\/json/);
  assert.match(uploaded[0].cacheControl, /no-store/);
  assert.equal(uploaded[0].metadata.observedAt, result.snapshot.timestamp);
  assert.deepEqual(uploaded[1], result.snapshot);
  assert.equal(uploaded[1].allHealthy, false);
  assert.equal(uploaded[1].endpoints[0].status, 503);
  assert.match(uploaded[1].publication, /Cloud Scheduler/);
});

test('an existing older observation is replaced using its exact generation', async () => {
  let uploads = 0;
  await publishHeartbeatSnapshot(snapshot, { bucket, fetchImpl: async (url, options) => {
    if (url.startsWith('http:')) return identity();
    if (options.method !== 'POST') return json({ generation: '987654321', metadata: { observedAt: observedAt(-900000) } });
    assert.equal(new URL(url).searchParams.get('ifGenerationMatch'), '987654321');
    uploads += 1;
    return json({});
  } });
  assert.equal(uploads, 1);
});

test('a concurrent newer publication wins and an older run cannot overwrite it', async () => {
  let reads = 0;
  let uploads = 0;
  const result = await publishHeartbeatSnapshot(snapshot, { bucket, fetchImpl: async (url, options) => {
    if (url.startsWith('http:')) return identity();
    if (options.method !== 'POST') {
      reads += 1;
      return json({ generation: String(reads), metadata: { observedAt: observedAt(reads === 1 ? -900000 : 1000) } });
    }
    uploads += 1;
    return json({}, 412);
  } });
  assert.deepEqual(result, { published: false, reason: 'newer-or-equal-observation' });
  assert.equal(reads, 2);
  assert.equal(uploads, 1);
});

test('storage/identity failures cannot be reported as a successful publication', async () => {
  for (const phase of ['identity', 'read', 'write']) {
    await assert.rejects(publishHeartbeatSnapshot(snapshot, { bucket, fetchImpl: async (url, options) => {
      if (url.startsWith('http:')) return phase === 'identity' ? json({}, 403) : identity();
      if (options.method !== 'POST') return phase === 'read' ? json({}, 403) : json({}, 404);
      return json({ error: 'private provider response' }, 503);
    } }), (error) => {
      assert.match(error.message, /HTTP (403|503)/);
      assert.equal(error.phase, { identity: 'identity', read: 'object-metadata', write: 'upload' }[phase]);
      assert.equal(error.httpStatus, phase === 'write' ? 503 : 403);
      assert.doesNotMatch(error.message, /fixture-token|private provider/);
      return true;
    });
  }
});

test('repeated generation conflicts are bounded and fail publication', async () => {
  let writes = 0;
  await assert.rejects(publishHeartbeatSnapshot(snapshot, { bucket, fetchImpl: async (url, options) => {
    if (url.startsWith('http:')) return identity();
    if (options.method !== 'POST') return json({}, 404);
    writes += 1;
    return json({}, 412);
  } }), /conflicted/);
  assert.equal(writes, 3);
});

test('missing destination fails before obtaining credentials', async () => {
  await assert.rejects(publishHeartbeatSnapshot(snapshot, { fetchImpl: async () => assert.fail('Unexpected identity request') }), /HEARTBEAT_BUCKET/);
});

test('corrupt future or malformed object timestamps cannot freeze publication', async () => {
  for (const timestamp of [observedAt(86400000), 'malformed']) {
    let uploaded = false;
    await publishHeartbeatSnapshot(snapshot, { bucket, fetchImpl: async (url, options) => {
      if (url.startsWith('http:')) return identity();
      if (options.method !== 'POST') return json({ generation: '123', metadata: { observedAt: timestamp } });
      assert.equal(new URL(url).searchParams.get('ifGenerationMatch'), '123');
      uploaded = true;
      return json({});
    } });
    assert.equal(uploaded, true);
  }
});
