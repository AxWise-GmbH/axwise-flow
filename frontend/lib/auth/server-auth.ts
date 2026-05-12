import { auth } from '@clerk/nextjs/server';

const DEV_FALLBACK_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_DEV_TOKEN === 'true' &&
  process.env.NODE_ENV !== 'production';

const DEV_TEST_TOKEN =
  process.env.NEXT_PUBLIC_DEV_TEST_TOKEN ?? 'dev_test_token_testuser123';

function logAuth(message: string, extra?: Record<string, unknown>) {
  const payload = {
    scope: 'server-auth',
    devFallbackEnabled: DEV_FALLBACK_ENABLED,
    ...extra,
  };
  console.log(`[auth] ${message}`, payload);
}

export async function resolveServerAuthToken(opts: { required?: boolean } = {}) {
  const { required = false } = opts;

  try {
    const { getToken } = await auth();

    if (getToken) {
      const token = await getToken();
      if (token) {
        return token;
      }
    }

    logAuth('Clerk token unavailable from auth()', { required });
  } catch (error) {
    console.error('[auth] Failed to retrieve Clerk token', error);
  }

  if (DEV_FALLBACK_ENABLED) {
    logAuth('Using development fallback token');
    return DEV_TEST_TOKEN;
  }

  if (required) {
    throw new Error('Authentication token required');
  }

  return null;
}

export async function buildServerAuthHeaders(
  opts: { required?: boolean } = {}
): Promise<Record<string, string>> {
  const token = await resolveServerAuthToken(opts);
  return token ? { Authorization: `Bearer ${token}` } : {};
}
