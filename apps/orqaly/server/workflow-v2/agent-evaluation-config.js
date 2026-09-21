import { OAuth2Client } from 'google-auth-library';

const SERVICE_ACCOUNT = /^[a-z][a-z0-9-]{2,62}@[a-z][a-z0-9-]{2,62}\.iam\.gserviceaccount\.com$/;
const CLERK_USER = /^user_[A-Za-z0-9_-]{4,200}$/;

function exactHttpsUrl(value, name) {
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${name} must be an exact HTTPS URL`); }
  if (parsed.protocol !== 'https:' || parsed.origin !== value)
    throw new Error(`${name} must be an exact HTTPS origin`);
  return value;
}

/** Evaluation ingress is deliberately available only in preview and only with a complete identity binding. */
export function agentEvaluationConfigFromEnvironment(environment = process.env) {
  const enabled = environment.ORQALY_AGENT_EVALUATION_ENABLED;
  if (enabled === undefined || enabled === '' || enabled === 'false') return null;
  if (enabled !== 'true') throw new Error('ORQALY_AGENT_EVALUATION_ENABLED must be true or false');
  if (environment.ORQALY_ENVIRONMENT !== 'preview')
    throw new Error('agent evaluation ingress is preview-only');
  const audience = exactHttpsUrl(
    environment.ORQALY_AGENT_EVALUATION_AUDIENCE,
    'ORQALY_AGENT_EVALUATION_AUDIENCE'
  );
  const serviceAccount = environment.ORQALY_AGENT_EVALUATION_SERVICE_ACCOUNT;
  const userId = environment.ORQALY_EVALUATION_USER_ID;
  if (!SERVICE_ACCOUNT.test(serviceAccount || ''))
    throw new Error('ORQALY_AGENT_EVALUATION_SERVICE_ACCOUNT is invalid');
  if (!CLERK_USER.test(userId || '')) throw new Error('ORQALY_EVALUATION_USER_ID is invalid');
  return Object.freeze({ audience, serviceAccount, userId });
}

export function createAgentEvaluationOidcVerifier(config, client = new OAuth2Client()) {
  if (!config?.audience || !config?.serviceAccount) throw new Error('evaluation OIDC config is required');
  return async function verify(token) {
    const ticket = await client.verifyIdToken({ idToken: token, audience: config.audience });
    const payload = ticket.getPayload();
    if (
      !payload ||
      !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss) ||
      payload.email !== config.serviceAccount ||
      payload.email_verified !== true ||
      typeof payload.sub !== 'string' ||
      !payload.sub
    ) throw Object.assign(new Error('evaluation identity denied'), { status: 403 });
    return { subject: payload.sub, email: payload.email };
  };
}
