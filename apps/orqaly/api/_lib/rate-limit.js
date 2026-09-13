/**
 * Lightweight sliding-window rate limiter.
 *
 * NOTE:
 * - This in-memory limiter is a practical baseline and works for single-instance/dev usage.
 * - In horizontally scaled production, move to shared storage (Upstash/Vercel KV/Redis).
 */
const bucketStore = new Map();

function nowMs() {
  return Date.now();
}

function parseClientIp(req) {
  const forwarded = req?.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req?.socket?.remoteAddress || 'unknown-ip';
}

export function getRateLimitIdentifier(req, userId = '') {
  const ip = parseClientIp(req);
  const ua = String(req?.headers?.['user-agent'] || 'unknown-ua').slice(0, 80);
  return userId ? `user:${userId}` : `ip:${ip}:${ua}`;
}

function cleanupExpiredBuckets(referenceNow) {
  for (const [key, bucket] of bucketStore.entries()) {
    if (!bucket || !Array.isArray(bucket.hits) || bucket.hits.length === 0) {
      bucketStore.delete(key);
      continue;
    }
    if (bucket.hits[bucket.hits.length - 1] <= referenceNow - bucket.windowMs) {
      bucketStore.delete(key);
    }
  }
}

/**
 * @param {{ key: string, limit: number, windowMs: number }} opts
 * @returns {{ allowed: boolean, limit: number, remaining: number, resetAt: number }}
 */
export function checkRateLimit({ key, limit, windowMs }) {
  const t = nowMs();
  if (!key || !Number.isFinite(limit) || !Number.isFinite(windowMs)) {
    return { allowed: false, limit: 0, remaining: 0, resetAt: t + 60_000 };
  }

  // Opportunistic cleanup to prevent unbounded memory growth.
  if (bucketStore.size > 1000) cleanupExpiredBuckets(t);

  const bucket = bucketStore.get(key) || { hits: [], windowMs };
  const cutoff = t - windowMs;
  bucket.hits = bucket.hits.filter((ts) => ts > cutoff);
  bucket.windowMs = windowMs;

  const allowed = bucket.hits.length < limit;
  if (allowed) bucket.hits.push(t);

  bucketStore.set(key, bucket);

  const remaining = Math.max(0, limit - bucket.hits.length);
  const oldest = bucket.hits[0] || t;
  const resetAt = oldest + windowMs;

  return { allowed, limit, remaining, resetAt };
}

export function applyRateLimitHeaders(res, result) {
  res.setHeader('X-RateLimit-Limit', String(result.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
  // Retry-After: seconds until the sliding window resets (RFC 6585 §4).
  // Always set so clients can back off without parsing the epoch-based Reset header.
  const retryAfterSecs = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  res.setHeader('Retry-After', String(retryAfterSecs));
}
