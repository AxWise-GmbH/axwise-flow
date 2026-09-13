const n8nAudience = process.env.N8N_CLOUD_RUN_AUDIENCE;
const apiBaseUrl = process.env.N8N_API_BASE_URL;

let audience;
let apiBase;
try {
  audience = new URL(n8nAudience);
  apiBase = new URL(apiBaseUrl);
} catch {
  throw new Error('n8n_cloud_run_identity_configuration_invalid');
}
if (
  audience.protocol !== 'https:' ||
  audience.pathname !== '/' ||
  audience.search ||
  audience.hash ||
  apiBase.origin !== audience.origin ||
  apiBase.pathname !== '/api/v1/'
) {
  throw new Error('n8n_cloud_run_identity_target_invalid');
}

const platformFetch = globalThis.fetch.bind(globalThis);
let cachedIdentity = null;

function identityClaims(token) {
  const components = token.split('.');
  if (components.length !== 3) throw new Error('n8n_cloud_run_identity_token_invalid');
  const payload = JSON.parse(Buffer.from(components[1], 'base64url').toString('utf8'));
  if (payload.aud !== audience.origin || !Number.isSafeInteger(payload.exp)) {
    throw new Error('n8n_cloud_run_identity_claims_invalid');
  }
  return payload;
}

async function cloudRunIdentityToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedIdentity && cachedIdentity.expiresAt > now + 60) return cachedIdentity.token;

  const endpoint = new URL(
    '/computeMetadata/v1/instance/service-accounts/default/identity',
    'http://metadata.google.internal'
  );
  endpoint.searchParams.set('audience', audience.origin);
  endpoint.searchParams.set('format', 'full');
  const response = await platformFetch(endpoint, {
    method: 'GET',
    redirect: 'error',
    headers: { 'Metadata-Flavor': 'Google' },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error('n8n_cloud_run_identity_unavailable');
  const token = await response.text();
  if (token.length < 100 || token.length > 16_384) {
    throw new Error('n8n_cloud_run_identity_token_invalid');
  }
  const claims = identityClaims(token);
  cachedIdentity = { token, expiresAt: claims.exp };
  return token;
}

globalThis.fetch = async (input, init = {}) => {
  const target = new URL(input instanceof Request ? input.url : input);
  if (target.origin !== audience.origin || !target.pathname.startsWith('/api/v1/')) {
    throw new Error('n8n_bootstrap_request_outside_private_api');
  }
  const headers = new Headers(init.headers);
  if (headers.has('authorization')) {
    throw new Error('n8n_bootstrap_authorization_override_refused');
  }
  headers.set('authorization', `Bearer ${await cloudRunIdentityToken()}`);
  return platformFetch(input, { ...init, headers });
};

await import('../../n8n/bootstrap.mjs');
