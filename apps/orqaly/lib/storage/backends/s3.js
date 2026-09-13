/**
 * Amazon S3 (and S3-compatible) storage backend probe.
 *
 * Implements AWS Signature V4 with Node's built-in crypto + fetch (no SDK
 * dependency, so it bundles small and runs on Vercel). Mirrors the supabase.js
 * backend's `probeUserConnection` contract. Credential format for kind=s3:
 *   JSON.stringify({ region, bucket, accessKeyId, secretAccessKey, endpoint? })
 * `endpoint` is optional and switches to path-style addressing for
 * S3-compatible providers (Cloudflare R2, MinIO, ...).
 */
import { createHmac, createHash } from 'node:crypto';
import { createLogger } from '../../../api/_lib/logger.js';

const log = createLogger('storage-backend-s3');
const SERVICE = 's3';

const sha256hex = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();

function signingKey(secret, dateStamp, region) {
  const kDate = hmac(`AWS4${secret}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, 'aws4_request');
}

/** Encode a key path per AWS, preserving '/' between segments. */
const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/');

/** Signed S3 request (virtual-hosted for AWS, path-style for custom endpoints). */
async function s3Request({ method, region, bucket, key, accessKeyId, secretAccessKey, endpoint, body }) {
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  let host;
  let canonicalUri;
  let url;
  if (endpoint) {
    const u = new URL(endpoint);
    host = u.host;
    canonicalUri = `/${bucket}/${encodeKey(key)}`;
    url = `${u.protocol}//${host}${canonicalUri}`;
  } else {
    host = `${bucket}.s3.${region}.amazonaws.com`;
    canonicalUri = `/${encodeKey(key)}`;
    url = `https://${host}${canonicalUri}`;
  }

  const payloadHash = sha256hex(body || '');
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${SERVICE}/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, sha256hex(canonicalRequest)].join('\n');
  const signature = createHmac('sha256', signingKey(secretAccessKey, dateStamp, region))
    .update(stringToSign)
    .digest('hex');
  const authorization =
    `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(url, {
    method,
    headers: {
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      Authorization: authorization,
    },
    body: body || undefined,
  });
}

/** Pull a readable message out of an S3 XML error body. */
function s3ErrorMessage(status, text) {
  const code = /<Code>([^<]+)<\/Code>/.exec(text || '')?.[1];
  const msg = /<Message>([^<]+)<\/Message>/.exec(text || '')?.[1];
  return code ? `${code}${msg ? `: ${msg}` : ''}` : `HTTP ${status}`;
}

/**
 * Probe a user-connected S3 bucket with a tiny put + delete. Always attempts
 * cleanup. Returns { ok: true } or { ok: false, error }.
 */
export async function probeUserConnection({ credential, metadata }) {
  let parsed;
  try {
    parsed = JSON.parse(credential);
  } catch {
    return { ok: false, error: 'S3_CREDENTIAL_INVALID: expected JSON {region, bucket, accessKeyId, secretAccessKey, endpoint?}' };
  }

  const region = parsed.region || 'us-east-1';
  const bucket = parsed.bucket || metadata?.bucket;
  const { accessKeyId, secretAccessKey, endpoint } = parsed;
  if (!bucket || !accessKeyId || !secretAccessKey) {
    return { ok: false, error: 'S3_CREDENTIAL_INVALID: bucket, accessKeyId and secretAccessKey are required' };
  }

  const key = `_tmp/probe-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const args = { region, bucket, key, accessKeyId, secretAccessKey, endpoint };
  try {
    const put = await s3Request({ ...args, method: 'PUT', body: Buffer.from('orchestratori-storage-probe') });
    if (!put.ok) {
      const text = await put.text().catch(() => '');
      throw new Error(s3ErrorMessage(put.status, text));
    }
    const del = await s3Request({ ...args, method: 'DELETE', body: '' });
    if (!del.ok && del.status !== 204) {
      const text = await del.text().catch(() => '');
      throw new Error(s3ErrorMessage(del.status, text));
    }
    return { ok: true };
  } catch (err) {
    try { await s3Request({ ...args, method: 'DELETE', body: '' }); } catch { /* best-effort cleanup */ }
    log.warn(null, 's3.probe_failed', { err: err.message });
    return { ok: false, error: err.message };
  }
}

// S3 probe is stateless (signs per request), so there is no client cache to
// clear; kept for parity with the supabase backend's interface.
export function invalidateClientCache() { /* no-op */ }
