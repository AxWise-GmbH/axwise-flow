/** Cloud Run Job: publish each real observation, including failures, to the public status object. */
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runHeartbeatSnapshot, heartbeatExitCode } from './heartbeat-service.mjs';

const TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const PUBLICATION = 'Cloud Scheduler invokes a Cloud Run Job every 15 minutes; observations are published independently of website deployments.';

export async function publishHeartbeatSnapshot(snapshot, { bucket, fetchImpl = fetch, requestTimeoutMs = 5000 } = {}) {
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket || '')) {
    throw new Error('HEARTBEAT_BUCKET must name the dedicated status bucket.');
  }
  if (!Number.isFinite(Date.parse(snapshot.timestamp))) throw new Error('Invalid snapshot timestamp.');
  const request = async (url, options = {}) => {
    try {
      return await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(requestTimeoutMs) });
    } catch {
      throw Object.assign(new Error('Heartbeat request failed.'), {
        phase: url === TOKEN_URL ? 'identity' : options.method === 'POST' ? 'upload' : 'object-metadata',
      });
    }
  };
  const tokenResponse = await request(TOKEN_URL, { headers: { 'Metadata-Flavor': 'Google' } });
  if (!tokenResponse.ok) {
    await tokenResponse.body?.cancel();
    throw Object.assign(new Error(`Heartbeat identity unavailable (HTTP ${tokenResponse.status}).`), { phase: 'identity', httpStatus: tokenResponse.status });
  }
  const token = (await tokenResponse.json()).access_token;
  if (typeof token !== 'string' || !token) throw new Error('Heartbeat identity returned no token.');
  const headers = { Authorization: `Bearer ${token}` };
  const metadataUrl = `https://storage.googleapis.com/storage/v1/b/${bucket}/o/latest.json?fields=generation,metadata`;

  // Generation matching makes replacement atomic. Overlapping/manual executions
  // cannot replace a newer observation with an older one after a slow upload.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await request(metadataUrl, { headers });
    let generation = '0';
    if (existing.ok) {
      const object = await existing.json();
      if (!/^\d+$/.test(object.generation || '')) throw new Error('Invalid current snapshot generation.');
      generation = object.generation;
      const observedAt = Date.parse(object.metadata?.observedAt);
      // A corrupt future timestamp must not freeze publication indefinitely.
      if (observedAt <= Date.now() + 60000 && observedAt >= Date.parse(snapshot.timestamp)) {
        return { published: false, reason: 'newer-or-equal-observation' };
      }
    } else if (existing.status !== 404) {
      await existing.body?.cancel();
      throw Object.assign(new Error(`Could not read current snapshot (HTTP ${existing.status}).`), { phase: 'object-metadata', httpStatus: existing.status });
    } else {
      await existing.body?.cancel();
    }

    const boundary = `heartbeat-${randomUUID()}`;
    const metadata = {
      name: 'latest.json', contentType: 'application/json; charset=utf-8',
      cacheControl: 'no-cache, no-store, must-revalidate',
      metadata: { observedAt: snapshot.timestamp },
    };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
      + `--${boundary}\r\nContent-Type: ${metadata.contentType}\r\n\r\n${JSON.stringify(snapshot)}\r\n--${boundary}--\r\n`;
    const response = await request(
      `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=multipart&ifGenerationMatch=${generation}`,
      { method: 'POST', headers: { ...headers, 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
    );
    await response.body?.cancel();
    if (response.ok) return { published: true };
    if (response.status !== 412) throw Object.assign(new Error(`Could not publish snapshot (HTTP ${response.status}).`), { phase: 'upload', httpStatus: response.status });
  }
  throw new Error('Snapshot publication conflicted with concurrent executions.');
}

export async function runPublishedHeartbeat({ bucket = process.env.HEARTBEAT_BUCKET, fetchImpl = fetch, ...snapshotOptions } = {}) {
  const snapshot = await runHeartbeatSnapshot({ ...snapshotOptions, fetchImpl, publication: PUBLICATION });
  const publication = await publishHeartbeatSnapshot(snapshot, { bucket, fetchImpl });
  return { snapshot, publication, exitCode: heartbeatExitCode(snapshot) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runPublishedHeartbeat({ outputDir: '/tmp/heartbeat' }).then(({ snapshot, publication, exitCode }) => {
    console.log(JSON.stringify({ event: 'heartbeat-publication', timestamp: snapshot.timestamp,
      allHealthy: snapshot.allHealthy, ...publication, endpoints: snapshot.endpoints }));
    process.exitCode = exitCode;
  }).catch((error) => {
    // Neither metadata identity responses nor storage response bodies belong in logs.
    console.error(JSON.stringify({ event: 'heartbeat-publication-failed', phase: error.phase || 'snapshot',
      httpStatus: error.httpStatus, message: 'Publication failed; the last observation expires after 30 minutes.' }));
    process.exitCode = 1;
  });
}
