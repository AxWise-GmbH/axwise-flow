import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

export class WorkloadAuthorizationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'WorkloadAuthorizationError';
    this.code = code;
  }
}

function bearerToken(header) {
  const match = typeof header === 'string' ? /^Bearer ([A-Za-z0-9._~+/=-]+)$/.exec(header) : null;
  if (!match) throw new WorkloadAuthorizationError('workload_authorization_missing');
  return match[1];
}

function timingSafeEqual(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && crypto.timingSafeEqual(leftBytes, rightBytes);
}

function decodeJwtPayload(token) {
  const pieces = token.split('.');
  if (pieces.length !== 3) throw new WorkloadAuthorizationError('workload_identity_invalid');
  try {
    return JSON.parse(Buffer.from(pieces[1], 'base64url').toString('utf8'));
  } catch {
    throw new WorkloadAuthorizationError('workload_identity_invalid');
  }
}

export function authorizeWorkload(authorization, config, now = new Date()) {
  const token = bearerToken(authorization);
  if (config.TOOL_GATEWAY_AUTH_MODE === 'local_token') {
    if (!timingSafeEqual(token, config.TOOL_GATEWAY_LOCAL_BEARER_TOKEN)) {
      throw new WorkloadAuthorizationError('workload_authorization_invalid');
    }
    return { mode: 'local_token', subject: 'local-n8n' };
  }

  // Cloud Run IAM verifies the Google signature before this private service is
  // invoked. These claim checks bind the already platform-verified token to the
  // exact n8n service identity and custom audience; they are not a replacement
  // for private ingress and the single-subject roles/run.invoker policy.
  const claims = decodeJwtPayload(token);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const nowSeconds = Math.floor(new Date(now).valueOf() / 1_000);
  if (
    !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss) ||
    !audiences.includes(config.TOOL_GATEWAY_AUDIENCE) ||
    claims.email !== config.EXPECTED_N8N_SERVICE_ACCOUNT ||
    claims.email_verified !== true ||
    !Number.isInteger(claims.exp) ||
    claims.exp <= nowSeconds ||
    (Number.isInteger(claims.iat) && claims.iat > nowSeconds + 30)
  ) {
    throw new WorkloadAuthorizationError('workload_identity_claims_mismatch');
  }
  return { mode: 'cloud_run_iam', subject: claims.email };
}
