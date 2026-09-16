const DEFAULT_RETURN_TO = '/home';
const AUTH_ENTRY_PATHS = new Set(['/login', '/signup', '/auth/callback']);

export function safeAuthReturnTo(value, fallback = DEFAULT_RETURN_TO) {
  if (typeof value !== 'string' || !value.startsWith('/')) return fallback;

  try {
    const origin = globalThis.location?.origin || 'https://orqaly.invalid';
    const resolved = new URL(value, origin);
    if (resolved.origin !== origin) return fallback;

    const normalizedPath = resolved.pathname.replace(/\/+$/u, '').toLowerCase() || '/';
    if (AUTH_ENTRY_PATHS.has(normalizedPath)) return fallback;

    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}

export function authEntryUrl(pathname, returnTo) {
  const params = new URLSearchParams({ returnTo: safeAuthReturnTo(returnTo) });
  return `${pathname}?${params.toString()}`;
}
