import { createHash, timingSafeEqual } from 'node:crypto';

export const SERVICE_SECRET_NAMES = Object.freeze([
  'CRON_SECRET',
  'WORKER_SECRET',
  'BACKUP_SECRET',
]);

function bearerToken(req) {
  const authorization = String(req?.headers?.authorization || req?.headers?.Authorization || '');
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
}

/**
 * Compare secret text without an early-exit content comparison. Hashing first
 * gives timingSafeEqual two fixed-size buffers even when token lengths differ.
 */
export function constantTimeSecretEqual(actual, expected) {
  const actualBuffer = Buffer.from(String(actual));
  const expectedBuffer = Buffer.from(String(expected));
  const actualDigest = createHash('sha256').update(actualBuffer).digest();
  const expectedDigest = createHash('sha256').update(expectedBuffer).digest();
  const digestMatches = timingSafeEqual(actualDigest, expectedDigest);

  return digestMatches && actualBuffer.length === expectedBuffer.length;
}

/**
 * Shared authorization boundary for server-to-server and Vercel Cron routes.
 * It intentionally does not accept user JWTs and fails closed when no service
 * secret is configured.
 */
export function serviceRequestAuthError(
  req,
  { env = process.env, methods = ['GET', 'POST'], secretNames = SERVICE_SECRET_NAMES } = {}
) {
  const method = String(req?.method || '').toUpperCase();
  if (!methods.includes(method)) {
    return { status: 405, message: 'Method not allowed' };
  }

  const token = bearerToken(req);
  const configuredSecrets = secretNames
    .map((name) => env[name])
    .filter((value) => typeof value === 'string' && value.length > 0);

  let matched = 0;
  for (const secret of configuredSecrets) {
    matched |= Number(constantTimeSecretEqual(token, secret));
  }

  if (!token || configuredSecrets.length === 0 || matched !== 1) {
    return { status: 401, message: 'Unauthorized' };
  }

  return null;
}
