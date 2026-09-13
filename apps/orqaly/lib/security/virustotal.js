/**
 * VirusTotal file-scan client.
 *
 * Strategy:
 *   1. SHA-256 the buffer, query VT files endpoint (free, ~200ms).
 *   2. If unknown (404), upload for scan, poll analysis up to 90s.
 *   3. Fail-closed: `unknown` on timeout or network errors — caller blocks.
 *
 * Requires `VT_API_KEY` in env. Free tier: 4 req/min, 500/day, 15.5K/mo.
 */
import { createHash } from 'node:crypto';
import { createLogger } from '../../api/_lib/logger.js';

const log = createLogger('virustotal');

const BASE = 'https://www.virustotal.com/api/v3';
const POLL_INTERVAL_MS = 4_000;
const DEFAULT_DEADLINE_MS = 90_000;

export function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function classifyStats(stats, sha256, extras = {}) {
  const safeStats = {
    malicious: Number(stats?.malicious || 0),
    suspicious: Number(stats?.suspicious || 0),
    harmless: Number(stats?.harmless || 0),
    undetected: Number(stats?.undetected || 0),
  };
  if (safeStats.malicious > 0) return { status: 'malicious', sha256, stats: safeStats, ...extras };
  if (safeStats.suspicious >= 3) return { status: 'malicious', sha256, stats: safeStats, ...extras };
  return { status: 'clean', sha256, stats: safeStats, ...extras };
}

function getVtApiKey() {
  return process.env.VT_API_KEY || process.env.VIRUSTOTAL_API_KEY || '';
}

function authHeaders() {
  const key = getVtApiKey();
  if (!key) throw new Error('VT_API_KEY_MISSING');
  return { 'x-apikey': key };
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 15_000) {
  const signal = AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined;
  return fetch(url, { ...opts, signal });
}

/**
 * Scan a file buffer. Returns { status: 'clean'|'malicious'|'unknown', sha256, stats?, scanId? }.
 */
export async function scanFileBuffer(buf, filename, { deadlineMs = DEFAULT_DEADLINE_MS, pollIntervalMs = POLL_INTERVAL_MS, _fetch } = {}) {
  const f = _fetch || fetchWithTimeout;
  const sha256 = sha256Hex(buf);

  if (!getVtApiKey()) {
    log.warn(null, 'vt.disabled', { reason: 'VT_API_KEY_MISSING' });
    return { status: 'unknown', sha256, reason: 'disabled' };
  }

  // 1. Hash lookup.
  try {
    const res = await f(`${BASE}/files/${sha256}`, { headers: authHeaders() });
    if (res.ok) {
      const body = await res.json();
      const stats = body?.data?.attributes?.last_analysis_stats || {};
      return classifyStats(stats, sha256);
    }
    if (res.status !== 404) {
      log.warn(null, 'vt.lookup_failed', { status: res.status });
      return { status: 'unknown', sha256, reason: `lookup_${res.status}` };
    }
    // else: 404 → unknown → upload
  } catch (err) {
    log.warn(null, 'vt.lookup_error', { err: err.message });
    return { status: 'unknown', sha256, reason: 'lookup_error' };
  }

  // 2. Upload.
  let analysisId;
  try {
    const form = new FormData();
    form.append('file', new Blob([buf]), filename || 'upload.bin');
    const res = await f(`${BASE}/files`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    }, 30_000);
    if (!res.ok) {
      log.warn(null, 'vt.upload_failed', { status: res.status });
      return { status: 'unknown', sha256, reason: `upload_${res.status}` };
    }
    const body = await res.json();
    analysisId = body?.data?.id;
    if (!analysisId) return { status: 'unknown', sha256, reason: 'upload_no_id' };
  } catch (err) {
    log.warn(null, 'vt.upload_error', { err: err.message });
    return { status: 'unknown', sha256, reason: 'upload_error' };
  }

  // 3. Poll.
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    try {
      const res = await f(`${BASE}/analyses/${analysisId}`, { headers: authHeaders() });
      if (!res.ok) continue;
      const body = await res.json();
      const status = body?.data?.attributes?.status;
      if (status === 'completed') {
        const stats = body?.data?.attributes?.stats || {};
        return classifyStats(stats, sha256, { scanId: analysisId });
      }
    } catch (err) {
      log.warn(null, 'vt.poll_error', { err: err.message });
    }
  }

  return { status: 'unknown', sha256, reason: 'timeout', scanId: analysisId };
}
