// Used only by an operator through authenticated private ingress (or loopback
// in disposable acceptance tests). The n8n-issued key is returned to the caller,
// never logged. Do not manufacture a random key or write directly into n8n tables.
export async function bootstrapSolutionOwner({
  origin,
  email,
  password,
  headers = {},
  fetchImpl = fetch,
}) {
  async function call(path, body, cookie) {
    const result = await fetchImpl(`${origin}/rest/${path}`, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: { ...headers, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    });
    const payload = await result.json();
    return {
      ok: result.ok,
      payload,
      cookie: result.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; '),
    };
  }
  let session = await call('owner/setup', {
    email,
    password,
    firstName: 'Orqaly',
    lastName: 'Solution Operator',
  });
  const setupError = session.ok ? null : String(session.payload.message || 'setup rejected');
  if (!session.ok) session = await call('login', { emailOrLdapLoginId: email, password });
  if (!session.ok || !session.cookie)
    throw new Error(
      `n8n_solution_owner_setup_failed: ${setupError || 'missing session cookie'}; ${String(session.payload.message || 'login session unavailable').slice(0, 200)}`
    );
  const result = await call(
    'api-keys',
    {
      label: 'Orqaly isolated solution manager',
      expiresAt: Math.floor(Date.now() / 1000) + 30 * 86400,
      scopes: [
        'workflow:create',
        'workflow:read',
        'workflow:list',
        'workflow:update',
        'workflow:activate',
      ],
    },
    session.cookie
  );
  if (!result.ok)
    throw new Error(
      `n8n_solution_key_issuance_failed: ${String(result.payload.message || 'request rejected').slice(0, 400)}`
    );
  if (!result.payload.data?.rawApiKey)
    throw new Error('n8n_solution_key_issuance_failed: issued key missing');
  return result.payload.data.rawApiKey;
}
